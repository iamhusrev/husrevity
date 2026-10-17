import Combine
import Foundation
import HusrevityStore

public struct ProjectRow: Identifiable, Equatable {
    public var project: ProjectRecord
    public var openCount: Int
    public var doneCount: Int
    public var id: String { project.localId }
    public var summary: String { L10n.Projects.summary(open: openCount, done: doneCount) }
}

/// "Projeler": the project list with task counts, CRUD, and tasks inside a project.
@MainActor
public final class ProjectsViewModel: ObservableObject {
    @Published public var showArchived = false {
        didSet { if showArchived != oldValue { restartProjects() } }
    }
    @Published public private(set) var rows: [ProjectRow] = []
    @Published public private(set) var isLoaded = false
    @Published public private(set) var errorMessage: String?

    private let store: LocalStore
    private let notifyLocalChange: LocalChangeNotifier
    private let bag = ObservationBag()
    private var started = false
    private var projects: [ProjectRecord] = []
    private var items: [ItemRecord] = []
    private var itemsLoaded = false
    private var projectsLoaded = false

    public init(store: LocalStore, notifyLocalChange: @escaping LocalChangeNotifier) {
        self.store = store
        self.notifyLocalChange = notifyLocalChange
    }

    public var isEmpty: Bool { rows.isEmpty }

    public func start() {
        guard !started else { return }
        started = true
        bag.observe("items", store.observeItems()) { [weak self] items in
            self?.items = items
            self?.itemsLoaded = true
            self?.rebuild()
        }
        restartProjects()
    }

    // MARK: Permissions

    public func canEdit(_ project: ProjectRecord) -> Bool { project.role == "OWNER" || project.role == "EDITOR" }
    public func canDelete(_ project: ProjectRecord) -> Bool { project.role == "OWNER" }

    // MARK: Writes

    @discardableResult
    public func create(code: String, name: String, description: String? = nil) -> ProjectRecord? {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return fail(L10n.Projects.nameRequired) }
        guard !cleanCode.isEmpty else { return fail(L10n.Projects.codeRequired) }
        guard Self.isValidCode(cleanCode) else { return fail(L10n.Projects.codeInvalid) }
        let existing = ((try? store.projects()) ?? []) + ((try? store.projects(archived: true)) ?? [])
        guard !existing.contains(where: { TextMatching.same($0.code, cleanCode) }) else {
            return fail(L10n.Projects.codeTaken)
        }
        let cleanDescription = description?.trimmingCharacters(in: .whitespacesAndNewlines)
        return write {
            try store.create(
                ProjectRecord(
                    code: cleanCode, name: cleanName,
                    description: (cleanDescription?.isEmpty ?? true) ? nil : cleanDescription))
        }
    }

    /// The code is immutable once the server knows the project, so it is not editable here.
    @discardableResult
    public func update(_ project: ProjectRecord, name: String, description: String?) -> Bool {
        guard canEdit(project) else { return fail(L10n.Projects.readOnly) != nil }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return fail(L10n.Projects.nameRequired) != nil }
        let cleanDescription = description?.trimmingCharacters(in: .whitespacesAndNewlines)
        return write {
            try store.update(ProjectRecord.self, localId: project.localId) {
                $0.name = cleanName
                $0.description = (cleanDescription?.isEmpty ?? true) ? nil : cleanDescription
            }
        } != nil
    }

    public func togglePin(_ project: ProjectRecord) {
        guard canEdit(project) else { _ = fail(L10n.Projects.readOnly); return }
        write { try store.update(ProjectRecord.self, localId: project.localId) { $0.pinned.toggle() } }
    }

    public func setArchived(_ project: ProjectRecord, _ archived: Bool) {
        guard canEdit(project) else { _ = fail(L10n.Projects.readOnly); return }
        write { try store.update(ProjectRecord.self, localId: project.localId) { $0.archived = archived } }
    }

    public func delete(_ project: ProjectRecord) {
        guard canDelete(project) else { _ = fail(L10n.Projects.readOnly); return }
        write { try store.delete(ProjectRecord.self, localId: project.localId) }
    }

    // MARK: Tasks

    public func items(in project: ProjectRecord) -> [ItemRecord] {
        let refs = Self.references(project)
        return items.filter { $0.projectId.map(refs.contains) ?? false && $0.status != "cancelled" }
    }

    @discardableResult
    public func addTask(title: String, to project: ProjectRecord) -> ItemRecord? {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }
        guard canEdit(project) else { return fail(L10n.Projects.readOnly).map { _ in nil } ?? nil }
        return write {
            try store.create(ItemRecord(title: clean, projectId: project.reference, source: "macos"))
        }
    }

    public func complete(_ item: ItemRecord) {
        write { try store.completeItem(localId: item.localId) }
    }

    public func dismissError() { errorMessage = nil }

    // MARK: Code helpers

    public static func isValidCode(_ code: String) -> Bool {
        guard !code.isEmpty, code.count <= 32 else { return false }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-çÇğĞıİöÖşŞüÜ")
        return code.unicodeScalars.allSatisfy(allowed.contains)
    }

    /// An uppercase ASCII slug (at most 16 characters) to pre-fill the code field from a name.
    public static func suggestedCode(from name: String) -> String {
        let ascii = name
            .replacingOccurrences(of: "ı", with: "i").replacingOccurrences(of: "İ", with: "I")
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "en_US_POSIX"))
            .uppercased(with: Locale(identifier: "en_US_POSIX"))
        var slug = ""
        var pendingDash = false
        for scalar in ascii.unicodeScalars {
            if scalar.isASCII, CharacterSet.alphanumerics.contains(scalar) {
                if pendingDash, !slug.isEmpty { slug.append("-") }
                pendingDash = false
                slug.unicodeScalars.append(scalar)
            } else {
                pendingDash = true
            }
        }
        var clipped = String(slug.prefix(16))
        while clipped.hasSuffix("-") { clipped.removeLast() }
        return clipped
    }

    // MARK: Internals

    private static func references(_ project: ProjectRecord) -> Set<String> {
        var refs: Set<String> = [LocalReference.make(localId: project.localId)]
        if let serverId = project.serverId { refs.insert(serverId) }
        return refs
    }

    @discardableResult
    private func fail(_ message: String) -> ProjectRecord? {
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

    private func restartProjects() {
        guard started else { return }
        bag.observe("projects", store.observeProjects(archived: showArchived)) { [weak self] projects in
            self?.projects = projects
            self?.projectsLoaded = true
            self?.rebuild()
        }
    }

    private func rebuild() {
        guard itemsLoaded, projectsLoaded else { return }
        var counts: [String: (open: Int, done: Int)] = [:]
        for item in items {
            guard let ref = item.projectId else { continue }
            var current = counts[ref] ?? (0, 0)
            if item.status == "open" { current.open += 1 } else if item.status == "done" { current.done += 1 }
            counts[ref] = current
        }
        rows = projects.map { project in
            let refs = Self.references(project)
            let open = refs.reduce(0) { $0 + (counts[$1]?.open ?? 0) }
            let done = refs.reduce(0) { $0 + (counts[$1]?.done ?? 0) }
            return ProjectRow(project: project, openCount: open, doneCount: done)
        }
        .sorted { lhs, rhs in
            lhs.project.pinned != rhs.project.pinned
                ? lhs.project.pinned
                : lhs.project.name.localizedCaseInsensitiveCompare(rhs.project.name) == .orderedAscending
        }
        isLoaded = true
    }
}
