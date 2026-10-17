import Combine
import Foundation
import HusrevityStore

/// "Notlar": search, tag filter, archive, pin and CRUD for notes and their tags.
@MainActor
public final class NotesViewModel: ObservableObject {
    @Published public var search = "" {
        didSet { if search != oldValue { restartNotes() } }
    }
    @Published public var selectedTagId: String? {
        didSet { if selectedTagId != oldValue { restartNotes() } }
    }
    @Published public var showArchived = false {
        didSet { if showArchived != oldValue { restartNotes() } }
    }
    @Published public private(set) var notes: [NoteRecord] = []
    @Published public private(set) var tags: [NoteTagRecord] = []
    @Published public private(set) var isLoaded = false
    @Published public private(set) var errorMessage: String?

    private let store: LocalStore
    private let notifyLocalChange: LocalChangeNotifier
    private let bag = ObservationBag()
    private var started = false

    public init(store: LocalStore, notifyLocalChange: @escaping LocalChangeNotifier) {
        self.store = store
        self.notifyLocalChange = notifyLocalChange
    }

    public var pinnedNotes: [NoteRecord] { notes.filter(\.pinned) }
    public var otherNotes: [NoteRecord] { notes.filter { !$0.pinned } }
    public var isEmpty: Bool { notes.isEmpty }
    public var isFiltering: Bool { !search.trimmingCharacters(in: .whitespaces).isEmpty || selectedTagId != nil }

    public var emptyMessage: String { isFiltering ? L10n.Notes.emptySearch : L10n.Notes.emptyTitle }

    public func start() {
        guard !started else { return }
        started = true
        bag.observe("tags", store.observeTags()) { [weak self] tags in self?.tags = tags }
        restartNotes()
    }

    public func tags(for note: NoteRecord) -> [NoteTagRecord] {
        note.tagIds.compactMap { id in tags.first { $0.localId == id } }
    }

    public func tagName(_ id: String) -> String? { tags.first { $0.localId == id }?.name }

    // MARK: Note writes

    @discardableResult
    public func createNote(title: String, body: String?, tagIds: [String] = []) -> NoteRecord? {
        guard let resolved = Self.resolveTitle(title, body: body) else { return nil }
        return write {
            try store.create(
                NoteRecord(title: resolved, bodyMarkdown: Self.cleanBody(body), tagIds: tagIds))
        }
    }

    @discardableResult
    public func updateNote(localId: String, title: String, body: String?, tagIds: [String]) -> Bool {
        let resolved = Self.resolveTitle(title, body: body)
        return write {
            try store.update(NoteRecord.self, localId: localId) {
                if let resolved { $0.title = resolved }
                $0.bodyMarkdown = Self.cleanBody(body)
                $0.tagIds = tagIds
            }
        } != nil
    }

    public func togglePin(_ note: NoteRecord) {
        write { try store.update(NoteRecord.self, localId: note.localId) { $0.pinned.toggle() } }
    }

    public func setArchived(_ note: NoteRecord, _ archived: Bool) {
        write { try store.update(NoteRecord.self, localId: note.localId) { $0.archived = archived } }
    }

    public func delete(_ note: NoteRecord) {
        write { try store.delete(NoteRecord.self, localId: note.localId) }
    }

    // MARK: Tag writes

    /// Creates a tag, or returns the existing one with the same name (ignoring case).
    @discardableResult
    public func createTag(name: String, color: String? = nil) -> NoteTagRecord? {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }
        if let existing = (try? store.tags())?.first(where: { TextMatching.same($0.name, clean) }) { return existing }
        return write { try store.create(NoteTagRecord(name: clean, color: color)) }
    }

    public func deleteTag(_ tag: NoteTagRecord) {
        if selectedTagId == tag.localId { selectedTagId = nil }
        write { try store.delete(NoteTagRecord.self, localId: tag.localId) }
    }

    public func dismissError() { errorMessage = nil }

    // MARK: Internals

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

    private func restartNotes() {
        guard started else { return }
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        bag.observe(
            "notes", store.observeNotes(search: query.isEmpty ? nil : query, tagId: selectedTagId, archived: showArchived)
        ) { [weak self] notes in
            self?.notes = notes
            self?.isLoaded = true
        }
    }

    static func cleanBody(_ body: String?) -> String? {
        guard let body, !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return body
    }

    /// The trimmed title; else the first line of the body (at most 60 characters); else nil.
    static func resolveTitle(_ title: String, body: String?) -> String? {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty { return clean }
        let firstLine = (body ?? "").split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty }
        return firstLine.map { String($0.prefix(60)) }
    }
}
