import Combine
import Foundation
import HusrevityStore

public typealias TodayEntry = ScheduleEntry

public struct TodaySections: Equatable, Sendable {
    public var overdue: [TodayEntry] = []
    public var today: [TodayEntry] = []
    public var done: [TodayEntry] = []

    public init(overdue: [TodayEntry] = [], today: [TodayEntry] = [], done: [TodayEntry] = []) {
        self.overdue = overdue
        self.today = today
        self.done = done
    }
}

extension ScheduleBuilder {
    /// Open one-off tasks dated before `start`. Recurring anchors and block children are left out:
    /// their stored date is only an anchor and would look overdue forever.
    public func overdue(items: [ItemRecord], before start: Date) -> [ScheduleEntry] {
        let recurringRefs = Set(
            items.filter { $0.rrule != nil && $0.scheduledAt != nil }.flatMap(Self.references))
        return items.compactMap { item -> ScheduleEntry? in
            guard item.kind == "task", item.status == "open", item.rrule == nil,
                !(item.blockId.map(recurringRefs.contains) ?? false),
                let time = Self.effectiveTime(item), time < start
            else { return nil }
            return ScheduleEntry(
                id: "item:\(item.localId)", itemLocalId: item.localId, title: item.title, kind: item.kind,
                time: time, hasClockTime: time != context.startOfDay(time), occursOn: nil, status: .open,
                completedAt: nil, context: item.context, durationMin: item.durationMin,
                projectId: item.projectId)
        }
        .sorted { $0.time < $1.time }
    }
}

/// The "Bugün" screen: overdue, today and done, recomputed whenever the store emits.
@MainActor
public final class TodayViewModel: ObservableObject {
    @Published public private(set) var sections = TodaySections()
    @Published public private(set) var isLoaded = false
    @Published public private(set) var errorMessage: String?
    @Published public private(set) var dayTitle = ""

    private let store: LocalStore
    private let expander: RecurrenceExpanding
    private let context: DateContext
    private let notifyLocalChange: LocalChangeNotifier
    private let bag = ObservationBag()

    private var items: [ItemRecord] = []
    private var occurrences: [ItemOccurrenceRecord] = []
    private var itemsLoaded = false
    private var observedDay: String?

    public init(
        store: LocalStore, expander: RecurrenceExpanding, context: DateContext = DateContext(),
        notifyLocalChange: @escaping LocalChangeNotifier
    ) {
        self.store = store
        self.expander = expander
        self.context = context
        self.notifyLocalChange = notifyLocalChange
        self.dayTitle = context.dayLabel(context.now())
    }

    public var isEmpty: Bool { sections.overdue.isEmpty && sections.today.isEmpty && sections.done.isEmpty }
    /// Overdue + still-open entries of today, for badges.
    public var openCount: Int { sections.overdue.count + sections.today.count }

    public func start() {
        guard !bag.has("items") else { return }
        bag.observe("items", store.observeItems()) { [weak self] items in
            guard let self else { return }
            self.items = items
            self.itemsLoaded = true
            self.recompute()
        }
        observeOccurrences()
    }

    /// Call when the calendar day rolled over (or the app became active): re-reads "today".
    public func refreshDay() {
        observeOccurrences()
        recompute()
    }

    public func canReopen(_ entry: TodayEntry) -> Bool { entry.canReopen }

    public func timeLabel(_ entry: TodayEntry) -> String? { context.entryTimeLabel(entry) }

    public func complete(_ entry: TodayEntry) {
        perform {
            try store.completeItem(localId: entry.itemLocalId, occursOn: entry.occursOn)
        }
    }

    public func reopen(_ entry: TodayEntry) {
        guard entry.canReopen else {
            errorMessage = L10n.Today.reopenUnsupported
            return
        }
        perform {
            try store.update(ItemRecord.self, localId: entry.itemLocalId) {
                $0.status = "open"
                $0.completedAt = nil
            }
        }
    }

    public func dismissError() { errorMessage = nil }

    // MARK: Internals

    private func perform(_ write: () throws -> some Any) {
        do {
            _ = try write()
            errorMessage = nil
            notifyLocalChange()
        } catch {
            errorMessage = L10n.Common.saveFailed(Self.describe(error))
        }
    }

    private func observeOccurrences() {
        let key = context.dayKey(context.now())
        guard key != observedDay else { return }
        observedDay = key
        bag.observe("occurrences", store.observeOccurrences(from: key, to: key)) { [weak self] rows in
            self?.occurrences = rows
            self?.recompute()
        }
    }

    private func recompute() {
        guard itemsLoaded else { return }
        let now = context.now()
        let bounds = context.dayBounds(containing: now)
        let builder = ScheduleBuilder(context: context, expander: expander)
        let dated = builder.entries(items: items, occurrences: occurrences, from: bounds.start, to: bounds.end)

        var done = dated.filter { $0.status != .open }
        let known = Set(done.map(\.id))
        // Finished today but dated on another day: it still belongs in today's "done".
        for item in items where item.status == "done" && item.rrule == nil {
            guard let completedAt = item.completedAt, completedAt >= bounds.start, completedAt < bounds.end,
                !known.contains("item:\(item.localId)")
            else { continue }
            done.append(
                ScheduleEntry(
                    id: "item:\(item.localId)", itemLocalId: item.localId, title: item.title, kind: item.kind,
                    time: ScheduleBuilder.effectiveTime(item) ?? completedAt, hasClockTime: true,
                    occursOn: nil, status: .done, completedAt: completedAt, context: item.context,
                    durationMin: item.durationMin, projectId: item.projectId))
        }
        done.sort { $0.time != $1.time ? $0.time < $1.time : $0.title < $1.title }

        sections = TodaySections(
            overdue: builder.overdue(items: items, before: bounds.start),
            today: dated.filter { $0.status == .open }, done: done)
        dayTitle = context.dayLabel(now)
        isLoaded = true
    }

    static func describe(_ error: Error) -> String {
        if let store = error as? StoreError {
            switch store {
            case .notFound: return "Kayıt bulunamadı."
            case .immutableField(let field): return field
            case .invalidPayload(let message): return message
            case .notImplemented(let message): return message
            case .entryInFlight: return "Kayıt şu anda gönderiliyor, biraz sonra tekrar dene."
            }
        }
        return error.localizedDescription
    }
}
