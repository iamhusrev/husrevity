import Combine
import Foundation
import HusrevityStore

public enum GoalHorizon: String, CaseIterable, Equatable, Sendable {
    case year, quarter, month

    /// Smaller is wider; a parent must be strictly wider than its child.
    public var rank: Int {
        switch self {
        case .year: return 0
        case .quarter: return 1
        case .month: return 2
        }
    }

    public var label: String { L10n.Goals.horizonLabel(rawValue) }
}

/// Progress of a goal, computed locally with the server's rule (the sync payload carries none):
/// items linked to the goal or any live descendant, plus items of projects linked to them, each
/// counted once; cancelled items excluded; percent is `round(done / total * 100)`.
public struct GoalProgress: Equatable, Sendable {
    public var total: Int
    public var done: Int
    public var open: Int
    public var percent: Int

    public init(total: Int, done: Int, open: Int, percent: Int? = nil) {
        self.total = total
        self.done = done
        self.open = open
        self.percent = percent ?? (total == 0 ? 0 : Int((Double(done) / Double(total) * 100).rounded()))
    }

    public var label: String { L10n.Goals.progress(done: done, total: total) }
    public var fraction: Double { Double(percent) / 100 }
}

public struct GoalNode: Identifiable, Equatable {
    public var goal: GoalRecord
    public var progress: GoalProgress
    public var children: [GoalNode]
    public var depth: Int
    public var id: String { goal.localId }
}

public struct GoalSection: Identifiable, Equatable {
    public var title: String
    public var nodes: [GoalNode]
    public var id: String { title }
}

/// "Hedefler": the year > quarter > month tree with local progress.
@MainActor
public final class GoalsViewModel: ObservableObject {
    @Published public private(set) var roots: [GoalNode] = []
    @Published public private(set) var sections: [GoalSection] = []
    @Published public private(set) var isLoaded = false
    @Published public private(set) var errorMessage: String?

    private let store: LocalStore
    private let context: DateContext
    private let notifyLocalChange: LocalChangeNotifier
    private let bag = ObservationBag()

    private var goals: [GoalRecord] = []
    private var items: [ItemRecord] = []
    private var liveProjects: [ProjectRecord] = []
    private var archivedProjects: [ProjectRecord] = []
    private var loaded: Set<String> = []

    public init(
        store: LocalStore, context: DateContext = DateContext(), notifyLocalChange: @escaping LocalChangeNotifier
    ) {
        self.store = store
        self.context = context
        self.notifyLocalChange = notifyLocalChange
    }

    public var isEmpty: Bool { roots.isEmpty }

    public func start() {
        guard !bag.has("goals") else { return }
        bag.observe("goals", store.observeGoals()) { [weak self] in self?.goals = $0; self?.changed("goals") }
        bag.observe("items", store.observeItems()) { [weak self] in self?.items = $0; self?.changed("items") }
        bag.observe("projects", store.observeProjects(archived: false)) { [weak self] in
            self?.liveProjects = $0
            self?.changed("projects")
        }
        bag.observe("archived", store.observeProjects(archived: true)) { [weak self] in
            self?.archivedProjects = $0
            self?.changed("archived")
        }
    }

    // MARK: Reads

    /// Open and done items counted towards the goal (own subtree and linked projects).
    public func items(for goal: GoalRecord) -> [ItemRecord] {
        let index = Index(goals: goals, projects: liveProjects + archivedProjects)
        return countedItems(for: goal, index: index)
    }

    // MARK: Writes

    @discardableResult
    public func create(
        title: String, horizon: GoalHorizon, parent: GoalRecord? = nil, notes: String? = nil, anchor: Date? = nil
    ) -> GoalRecord? {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return fail(L10n.Goals.titleRequired) }
        let period = Self.period(horizon, containing: anchor ?? context.now(), context: context)
        if let parent {
            guard let parentHorizon = GoalHorizon(rawValue: parent.horizon), parentHorizon.rank < horizon.rank else {
                return fail(L10n.Goals.parentMustBeLarger)
            }
            guard period.start >= parent.periodStart, period.end <= parent.periodEnd else {
                return fail(L10n.Goals.periodOutsideParent)
            }
        }
        let cleanNotes = notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        return write {
            try store.create(
                GoalRecord(
                    title: clean, notes: (cleanNotes?.isEmpty ?? true) ? nil : cleanNotes, horizon: horizon.rawValue,
                    periodStart: period.start, periodEnd: period.end, parentGoalId: parent?.reference))
        }
    }

    public func setStatus(_ goal: GoalRecord, _ status: String) {
        write { try store.update(GoalRecord.self, localId: goal.localId) { $0.status = status } }
    }

    public func rename(_ goal: GoalRecord, to title: String) {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { _ = fail(L10n.Goals.titleRequired); return }
        write { try store.update(GoalRecord.self, localId: goal.localId) { $0.title = clean } }
    }

    public func delete(_ goal: GoalRecord) {
        write { try store.delete(GoalRecord.self, localId: goal.localId) }
    }

    public func dismissError() { errorMessage = nil }

    // MARK: Periods

    /// The `[start, end]` day keys of the year / quarter / month containing `date`.
    public static func period(
        _ horizon: GoalHorizon, containing date: Date, context: DateContext
    ) -> (start: String, end: String) {
        let calendar = context.calendar
        let parts = calendar.dateComponents([.year, .month], from: date)
        let year = parts.year ?? 1970
        let month = parts.month ?? 1
        let firstMonth: Int
        let monthCount: Int
        switch horizon {
        case .year: (firstMonth, monthCount) = (1, 12)
        case .quarter: (firstMonth, monthCount) = ((month - 1) / 3 * 3 + 1, 3)
        case .month: (firstMonth, monthCount) = (month, 1)
        }
        let start = calendar.date(from: DateComponents(year: year, month: firstMonth, day: 1)) ?? date
        let nextStart = calendar.date(byAdding: .month, value: monthCount, to: start) ?? start
        let last = calendar.date(byAdding: .day, value: -1, to: nextStart) ?? start
        return (context.dayKey(start), context.dayKey(last))
    }

    // MARK: Internals

    private struct Index {
        var goalsByRef: [String: GoalRecord] = [:]
        var childrenOf: [String: [GoalRecord]] = [:]  // keyed by parent localId
        var projectsByGoalLocalId: [String: [ProjectRecord]] = [:]

        init(goals: [GoalRecord], projects: [ProjectRecord]) {
            for goal in goals {
                goalsByRef[goal.reference] = goal
                goalsByRef[LocalReference.make(localId: goal.localId)] = goal
            }
            for goal in goals {
                if let parentRef = goal.parentGoalId, let parent = goalsByRef[parentRef], parent.localId != goal.localId {
                    childrenOf[parent.localId, default: []].append(goal)
                }
            }
            for project in projects {
                if let goalRef = project.goalId, let goal = goalsByRef[goalRef] {
                    projectsByGoalLocalId[goal.localId, default: []].append(project)
                }
            }
        }

        func hasLiveParent(_ goal: GoalRecord) -> Bool {
            guard let ref = goal.parentGoalId, let parent = goalsByRef[ref] else { return false }
            return parent.localId != goal.localId
        }

        /// The goal and its live descendants (cycle-safe).
        func subtree(of goal: GoalRecord) -> [GoalRecord] {
            var seen: Set<String> = [goal.localId]
            var order = [goal]
            var queue = [goal]
            while let current = queue.popLast() {
                for child in childrenOf[current.localId] ?? [] where seen.insert(child.localId).inserted {
                    order.append(child)
                    queue.append(child)
                }
            }
            return order
        }
    }

    private func countedItems(for goal: GoalRecord, index: Index) -> [ItemRecord] {
        var goalRefs: Set<String> = []
        var projectRefs: Set<String> = []
        for member in index.subtree(of: goal) {
            goalRefs.insert(member.reference)
            goalRefs.insert(LocalReference.make(localId: member.localId))
            for project in index.projectsByGoalLocalId[member.localId] ?? [] {
                projectRefs.insert(project.reference)
                projectRefs.insert(LocalReference.make(localId: project.localId))
            }
        }
        return items.filter { item in
            guard item.status == "open" || item.status == "done" else { return false }
            return (item.goalId.map(goalRefs.contains) ?? false) || (item.projectId.map(projectRefs.contains) ?? false)
        }
    }

    private func progress(for goal: GoalRecord, index: Index) -> GoalProgress {
        let counted = countedItems(for: goal, index: index)
        let done = counted.filter { $0.status == "done" }.count
        return GoalProgress(total: counted.count, done: done, open: counted.count - done)
    }

    private func node(_ goal: GoalRecord, depth: Int, index: Index, path: Set<String>) -> GoalNode {
        let children = (index.childrenOf[goal.localId] ?? [])
            .filter { !path.contains($0.localId) }
            .sorted(by: Self.ordering)
            .map { node($0, depth: depth + 1, index: index, path: path.union([goal.localId])) }
        return GoalNode(goal: goal, progress: progress(for: goal, index: index), children: children, depth: depth)
    }

    private static func ordering(_ a: GoalRecord, _ b: GoalRecord) -> Bool {
        if a.periodStart != b.periodStart { return a.periodStart < b.periodStart }
        let (ra, rb) = (GoalHorizon(rawValue: a.horizon)?.rank ?? 9, GoalHorizon(rawValue: b.horizon)?.rank ?? 9)
        if ra != rb { return ra < rb }
        return a.title.localizedCaseInsensitiveCompare(b.title) == .orderedAscending
    }

    private func changed(_ stream: String) {
        loaded.insert(stream)
        guard loaded.count == 4 else { return }
        let index = Index(goals: goals, projects: liveProjects + archivedProjects)
        roots = goals.filter { !index.hasLiveParent($0) }.sorted(by: Self.ordering)
            .map { node($0, depth: 0, index: index, path: []) }
        sections = Dictionary(grouping: roots) { String($0.goal.periodStart.prefix(4)) }
            .map { GoalSection(title: $0.key, nodes: $0.value) }
            .sorted { $0.title < $1.title }
        isLoaded = true
    }

    @discardableResult
    private func fail(_ message: String) -> GoalRecord? {
        errorMessage = message
        return nil
    }

    @discardableResult
    private func write<T>(_ body: () throws -> T) -> T? {
        do {
            let result = try body()
            errorMessage = nil
            notifyLocalChange()
            return result
        } catch {
            errorMessage = L10n.Common.saveFailed(TodayViewModel.describe(error))
            return nil
        }
    }
}
