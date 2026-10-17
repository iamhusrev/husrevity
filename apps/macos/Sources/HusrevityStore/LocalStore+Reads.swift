import Foundation
import GRDB
import HusrevityModels

/// Read APIs for the UI. Rows with a pending local delete are never returned. Each `observeX` is
/// the same query as `x` exposed as a stream: it emits the current value first, then again after
/// every change to the tables it reads.
extension LocalStore {
    // MARK: Plain fetches

    /// Items ordered by their time (scheduled, else due; undated last). `from`/`to` form a
    /// half-open range matched against either `scheduledAt` or `dueAt`.
    public func items(
        status: String? = nil, kind: String? = nil, from: Date? = nil, to: Date? = nil
    ) throws -> [ItemRecord] {
        try dbQueue.read { try Self.fetchItems($0, status: status, kind: kind, from: from, to: to) }
    }

    /// Open items with neither `scheduledAt` nor `dueAt`, oldest first.
    public func inboxItems() throws -> [ItemRecord] { try dbQueue.read(Self.fetchInbox) }

    /// Occurrences with `from <= occursOn <= to` (`YYYY-MM-DD`).
    public func occurrences(from: String, to: String) throws -> [ItemOccurrenceRecord] {
        try dbQueue.read { try Self.fetchOccurrences($0, from: from, to: to) }
    }

    /// Notes: pinned first, then by position. `search` matches title and body case-insensitively
    /// (literally, `%` and `_` are not wildcards); `tagId` is a tag local id.
    public func notes(search: String? = nil, tagId: String? = nil, archived: Bool = false) throws -> [NoteRecord] {
        try dbQueue.read { try Self.fetchNotes($0, search: search, tagId: tagId, archived: archived) }
    }

    public func projects(archived: Bool = false) throws -> [ProjectRecord] {
        try dbQueue.read { try Self.fetchProjects($0, archived: archived) }
    }

    public func goals() throws -> [GoalRecord] { try dbQueue.read(Self.fetchGoals) }
    public func tags() throws -> [NoteTagRecord] { try dbQueue.read(Self.fetchTags) }

    // MARK: Observation

    public func observeItems(
        status: String? = nil, kind: String? = nil, from: Date? = nil, to: Date? = nil
    ) -> AsyncStream<[ItemRecord]> {
        observe { try Self.fetchItems($0, status: status, kind: kind, from: from, to: to) }
    }

    public func observeInboxItems() -> AsyncStream<[ItemRecord]> { observe(Self.fetchInbox) }

    public func observeOccurrences(from: String, to: String) -> AsyncStream<[ItemOccurrenceRecord]> {
        observe { try Self.fetchOccurrences($0, from: from, to: to) }
    }

    public func observeNotes(search: String? = nil, tagId: String? = nil, archived: Bool = false) -> AsyncStream<[NoteRecord]> {
        observe { try Self.fetchNotes($0, search: search, tagId: tagId, archived: archived) }
    }

    public func observeProjects(archived: Bool = false) -> AsyncStream<[ProjectRecord]> {
        observe { try Self.fetchProjects($0, archived: archived) }
    }

    public func observeGoals() -> AsyncStream<[GoalRecord]> { observe(Self.fetchGoals) }
    public func observeTags() -> AsyncStream<[NoteTagRecord]> { observe(Self.fetchTags) }

    /// Number of queued writes, for the "N changes waiting to sync" indicator.
    public func observeOutboxCount() -> AsyncStream<Int> {
        observe { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM outbox") ?? 0 }
    }

    /// Number of conflicts waiting for a decision.
    public func observeUnresolvedConflictCount() -> AsyncStream<Int> {
        observe { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM conflicts WHERE resolved_at IS NULL") ?? 0 }
    }

    private func observe<T: Sendable>(_ fetch: @escaping @Sendable (Database) throws -> T) -> AsyncStream<T> {
        let observation = ValueObservation.tracking(fetch)
        let queue = dbQueue
        return AsyncStream { continuation in
            let task = Task {
                do {
                    for try await value in observation.values(in: queue) {
                        continuation.yield(value)
                    }
                } catch {
                    // The stream just ends; callers re-subscribe if the database is unavailable.
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: Queries

    static func fetchItems(
        _ db: Database, status: String?, kind: String?, from: Date?, to: Date?
    ) throws -> [ItemRecord] {
        var clauses = ["deleted_locally = 0"]
        var args = StatementArguments()
        if let status {
            clauses.append("status = ?")
            args += [status]
        }
        if let kind {
            clauses.append("kind = ?")
            args += [kind]
        }
        if from != nil || to != nil {
            var parts: [String] = []
            for column in ["scheduled_at", "due_at"] {
                var bounds = ["\(column) IS NOT NULL"]
                if let from {
                    bounds.append("\(column) >= ?")
                    args += [from.epochMilliseconds]
                }
                if let to {
                    bounds.append("\(column) < ?")
                    args += [to.epochMilliseconds]
                }
                parts.append("(" + bounds.joined(separator: " AND ") + ")")
            }
            clauses.append("(" + parts.joined(separator: " OR ") + ")")
        }
        return try ItemRecord.fetchAll(
            db,
            sql: """
                SELECT * FROM item WHERE \(clauses.joined(separator: " AND "))
                ORDER BY COALESCE(scheduled_at, due_at) IS NULL, COALESCE(scheduled_at, due_at), created_at, rowid
                """,
            arguments: args
        )
    }

    static func fetchInbox(_ db: Database) throws -> [ItemRecord] {
        try ItemRecord.fetchAll(
            db,
            sql: """
                SELECT * FROM item
                WHERE deleted_locally = 0 AND status = 'open' AND scheduled_at IS NULL AND due_at IS NULL
                ORDER BY created_at, rowid
                """
        )
    }

    static func fetchOccurrences(_ db: Database, from: String, to: String) throws -> [ItemOccurrenceRecord] {
        try ItemOccurrenceRecord.fetchAll(
            db,
            sql: """
                SELECT * FROM item_occurrence
                WHERE deleted_locally = 0 AND occurs_on >= ? AND occurs_on <= ?
                ORDER BY occurs_on, rowid
                """,
            arguments: [from, to]
        )
    }

    static func fetchNotes(_ db: Database, search: String?, tagId: String?, archived: Bool) throws -> [NoteRecord] {
        var clauses = ["deleted_locally = 0", "archived = ?"]
        var args: StatementArguments = [archived]
        if let search, !search.isEmpty {
            let pattern = "%" + search
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "%", with: "\\%")
                .replacingOccurrences(of: "_", with: "\\_") + "%"
            clauses.append("(title LIKE ? ESCAPE '\\' OR COALESCE(body_markdown, '') LIKE ? ESCAPE '\\')")
            args += [pattern, pattern]
        }
        if let tagId {
            clauses.append("EXISTS (SELECT 1 FROM note_tag_assignment a WHERE a.note_local_id = note.local_id AND a.tag_local_id = ?)")
            args += [tagId]
        }
        var notes = try NoteRecord.fetchAll(
            db,
            sql: """
                SELECT * FROM note WHERE \(clauses.joined(separator: " AND "))
                ORDER BY pinned DESC, position, updated_at DESC, rowid
                """,
            arguments: args
        )
        for index in notes.indices {
            notes[index].tagIds = try NoteRecord.tagIds(db, noteLocalId: notes[index].localId)
        }
        return notes
    }

    static func fetchProjects(_ db: Database, archived: Bool) throws -> [ProjectRecord] {
        try ProjectRecord.fetchAll(
            db,
            sql: "SELECT * FROM project WHERE deleted_locally = 0 AND archived = ? ORDER BY name COLLATE NOCASE, rowid",
            arguments: [archived]
        )
    }

    static func fetchGoals(_ db: Database) throws -> [GoalRecord] {
        try GoalRecord.fetchAll(
            db,
            sql: "SELECT * FROM goal WHERE deleted_locally = 0 ORDER BY period_start, period_end, title COLLATE NOCASE, rowid"
        )
    }

    static func fetchTags(_ db: Database) throws -> [NoteTagRecord] {
        try NoteTagRecord.fetchAll(
            db, sql: "SELECT * FROM note_tag WHERE deleted_locally = 0 ORDER BY name COLLATE NOCASE, rowid"
        )
    }
}
