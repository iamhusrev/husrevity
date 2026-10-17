import Foundation
import GRDB
import HusrevityModels

extension LocalStore {
    /// Merges a pull into the local database in ONE transaction: upserts every collection by
    /// `server_id`, then applies the tombstones. Any failure rolls the whole payload back. The
    /// cursor is deliberately not touched: the caller sets it after this returns.
    ///
    /// A row with a queued outbox entry (any state) is left alone, and a tombstone for such a row
    /// is deferred: the local change wins until it has been pushed.
    public func apply(sync: SyncResponse) throws {
        try dbQueue.write { db in
            // Referenced rows first so note assignments can resolve their tags.
            for dto in sync.goals { try Self.upsert(db, dto: dto) }
            for dto in sync.projects { try Self.upsert(db, dto: dto) }
            for dto in sync.noteTags { try Self.upsert(db, dto: dto) }
            for dto in sync.items { try Self.upsert(db, dto: dto) }
            for dto in sync.itemOccurrences { try Self.upsert(db, dto: dto) }
            for dto in sync.notes { try Self.upsert(db, dto: dto) }

            let t = sync.tombstones
            try Self.delete(db, .item, serverIds: t.items)
            try Self.delete(db, .itemOccurrence, serverIds: t.itemOccurrences)
            try Self.delete(db, .note, serverIds: t.notes)
            try Self.delete(db, .noteTag, serverIds: t.noteTags)
            try Self.delete(db, .project, serverIds: t.projects)
            try Self.delete(db, .goal, serverIds: t.goals)
        }
    }

    // MARK: Row helpers

    static func localId(_ db: Database, _ entity: SyncEntity, serverId: String) throws -> String? {
        try String.fetchOne(
            db, sql: "SELECT local_id FROM \(entity.table) WHERE server_id = ?", arguments: [serverId]
        )
    }

    /// True while the row has a queued local change (any outbox state).
    static func isProtected(_ db: Database, _ entity: SyncEntity, localId: String) throws -> Bool {
        try Bool.fetchOne(
            db, sql: "SELECT EXISTS(SELECT 1 FROM outbox WHERE entity = ? AND local_id = ?)",
            arguments: [entity.rawValue, localId]
        ) ?? false
    }

    /// The local row a server record maps to, and whether the pull may write it. Unknown server
    /// ids get a fresh local id.
    static func target(_ db: Database, _ entity: SyncEntity, serverId: String, force: Bool = false) throws -> (localId: String, write: Bool) {
        guard let existing = try localId(db, entity, serverId: serverId) else {
            return (UUID().uuidString, true)
        }
        return (existing, try force || !isProtected(db, entity, localId: existing))
    }

    static func upsert(_ db: Database, dto: GoalDTO, force: Bool = false) throws {
        let t = try target(db, .goal, serverId: dto.id, force: force)
        if t.write { try GoalRecord(dto: dto, localId: t.localId).save(db); try written(db, .goal, t.localId) }
    }

    static func upsert(_ db: Database, dto: ProjectDTO, force: Bool = false) throws {
        let t = try target(db, .project, serverId: dto.id, force: force)
        if t.write { try ProjectRecord(dto: dto, localId: t.localId).save(db); try written(db, .project, t.localId) }
    }

    static func upsert(_ db: Database, dto: NoteTagDTO, force: Bool = false) throws {
        let t = try target(db, .noteTag, serverId: dto.id, force: force)
        if t.write { try NoteTagRecord(dto: dto, localId: t.localId).save(db); try written(db, .noteTag, t.localId) }
    }

    static func upsert(_ db: Database, dto: ItemDTO, force: Bool = false) throws {
        let t = try target(db, .item, serverId: dto.id, force: force)
        if t.write { try ItemRecord(dto: dto, localId: t.localId).save(db); try written(db, .item, t.localId) }
    }

    static func upsert(_ db: Database, dto: ItemOccurrenceDTO, force: Bool = false) throws {
        var t = try target(db, .itemOccurrence, serverId: dto.id, force: force)
        // Adopt an occurrence created locally by a completion instead of duplicating it.
        if try localId(db, .itemOccurrence, serverId: dto.id) == nil,
            let adoptable = try String.fetchOne(
                db,
                sql: "SELECT local_id FROM item_occurrence WHERE server_id IS NULL AND item_id = ? AND occurs_on = ?",
                arguments: [dto.itemId, dto.occursOn]
            )
        {
            t = (adoptable, true)
        }
        if t.write, !force, try isCompletionPending(db, itemServerId: dto.itemId, occursOn: dto.occursOn) {
            t.write = false
        }
        if t.write { try ItemOccurrenceRecord(dto: dto, localId: t.localId).save(db); try written(db, .itemOccurrence, t.localId) }
    }

    static func upsert(_ db: Database, dto: NoteDTO, force: Bool = false) throws {
        let t = try target(db, .note, serverId: dto.id, force: force)
        guard t.write else { return }
        try NoteRecord(dto: dto, localId: t.localId).save(db)
        try written(db, .note, t.localId)
        try replaceTags(db, noteLocalId: t.localId, refs: dto.tags)
    }

    /// Bookkeeping after the server version of a row was written: the row is alive on the server
    /// (so no tombstone is pending) and, being unprotected or forced, has no local delete pending.
    static func written(_ db: Database, _ entity: SyncEntity, _ localId: String) throws {
        try db.execute(
            sql: "UPDATE \(entity.table) SET pending_tombstone = 0, deleted_locally = 0 WHERE local_id = ?",
            arguments: [localId]
        )
    }

    /// A queued `complete` for this occurrence of the item (matched by the item's server id).
    static func isCompletionPending(_ db: Database, itemServerId: String, occursOn: String) throws -> Bool {
        try Bool.fetchOne(
            db,
            sql: """
                SELECT EXISTS(
                  SELECT 1 FROM outbox o JOIN item i ON i.local_id = o.local_id
                  WHERE o.entity = 'item' AND o.op = 'complete' AND i.server_id = ?
                    AND json_extract(o.payload, '$.occursOn') = ?)
                """,
            arguments: [itemServerId, occursOn]
        ) ?? false
    }

    /// Replaces a note's assignments with the tags the server sent, creating a tag row from the
    /// reference when the tag has not been pulled yet.
    static func replaceTags(_ db: Database, noteLocalId: String, refs: [NoteTagRef]) throws {
        try db.execute(sql: "DELETE FROM note_tag_assignment WHERE note_local_id = ?", arguments: [noteLocalId])
        for ref in refs {
            let tagLocalId: String
            if let existing = try localId(db, .noteTag, serverId: ref.id) {
                tagLocalId = existing
            } else {
                tagLocalId = UUID().uuidString
                try NoteTagRecord(
                    localId: tagLocalId, serverId: ref.id, name: ref.name, color: ref.color,
                    updatedAt: Date(timeIntervalSince1970: 0)
                ).insert(db)
            }
            try db.execute(
                sql: "INSERT OR IGNORE INTO note_tag_assignment(note_local_id, tag_local_id) VALUES (?, ?)",
                arguments: [noteLocalId, tagLocalId]
            )
        }
    }

    static func delete(_ db: Database, _ entity: SyncEntity, serverIds: [String]) throws {
        for serverId in serverIds {
            // A tombstone for a row with a queued local change is deferred: the push decides.
            // The server will not resend it, so it is recorded for `settleDeferredTombstones()`.
            if let local = try localId(db, entity, serverId: serverId),
                try isProtected(db, entity, localId: local)
            {
                try db.execute(
                    sql: "UPDATE \(entity.table) SET pending_tombstone = 1 WHERE local_id = ?", arguments: [local]
                )
                continue
            }
            // Foreign keys cascade note/tag assignments.
            try db.execute(sql: "DELETE FROM \(entity.table) WHERE server_id = ?", arguments: [serverId])
        }
    }
}
