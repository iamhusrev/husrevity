import Foundation
import GRDB
import HusrevityModels

/// Local writes used by the UI. Each one mutates the local row AND queues the outbox entry in a
/// single transaction, so the two can never disagree.
///
/// `updatedAt` on a row always mirrors the last server version; local edits never bump it. That
/// keeps `base_updated_at_ms` (the `If-Match` value) correct for any number of queued edits.
extension LocalStore {
    /// Inserts a new row with a fresh `localId` (any id on `record` is ignored) and queues a
    /// `create` carrying the full request body and a new idempotency key.
    @discardableResult
    public func create<R: SyncedRecord>(_ record: R) throws -> R {
        guard R.entity != .itemOccurrence else {
            throw StoreError.invalidPayload("occurrences are created by the server")
        }
        return try dbQueue.write { db in
            var row = record
            row.localId = UUID().uuidString
            row.serverId = nil
            row.updatedAt = now()
            try row.persist(db)
            var body = try row.wireBody(db)
            var followUp: [String: JSONValue] = [:]
            if let project = row as? ProjectRecord {
                // ProjectRequestDto has no pinned/archived: send them in an update after the create.
                body["pinned"] = nil
                body["archived"] = nil
                if project.pinned { followUp["pinned"] = .bool(true) }
                if project.archived { followUp["archived"] = .bool(true) }
            }
            try enqueue(
                db, entity: R.entity, op: .create, localId: row.localId, payload: .object(body),
                baseUpdatedAtMs: nil
            )
            if !followUp.isEmpty {
                try enqueue(
                    db, entity: R.entity, op: .update, localId: row.localId, payload: .object(followUp),
                    baseUpdatedAtMs: nil
                )
            }
            return row
        }
    }

    /// Applies `mutate` to the row and queues an `update` holding only the fields that changed
    /// (explicit `null` for cleared ones). Nothing is queued when no wire field changed.
    @discardableResult
    public func update<R: SyncedRecord>(
        _ type: R.Type = R.self, localId: String, _ mutate: (inout R) -> Void
    ) throws -> R {
        try dbQueue.write { db in
            guard let before = try R.load(db, localId: localId) else {
                throw StoreError.notFound(entity: R.entity, localId: localId)
            }
            var after = before
            mutate(&after)
            after.localId = before.localId
            after.serverId = before.serverId
            after.updatedAt = before.updatedAt
            if let old = before as? ProjectRecord, let new = after as? ProjectRecord, old.code != new.code {
                try changeProjectCode(db, old: old, new: new)
            }
            try after.persist(db)

            let oldBody = try before.wireBody(db)
            let newBody = try after.wireBody(db)
            var changed = newBody.filter { oldBody[$0.key] != $0.value }
            if R.entity == .project { changed["code"] = nil }  // immutable server side
            if !changed.isEmpty {
                // PUT /notes/:id replaces the whole note (missing body/tags are cleared), so notes
                // always carry the full snapshot. Items/goals use PATCH and projects' PUT only
                // touches provided fields, so those stay partial.
                let payload = R.entity == .note ? newBody : changed
                try enqueue(
                    db, entity: R.entity, op: .update, localId: localId, payload: .object(payload),
                    baseUpdatedAtMs: before.serverId == nil ? nil : before.updatedAt.epochMilliseconds
                )
            }
            return after
        }
    }

    /// Soft-deletes: the row is hidden from reads but kept until the delete is pushed, so a pull
    /// cannot bring it back. A row the server never saw is simply dropped together with its
    /// queued writes (unless one is already in flight).
    public func delete<R: SyncedRecord>(_ type: R.Type, localId: String) throws {
        try dbQueue.write { db in
            guard let row = try R.load(db, localId: localId) else {
                throw StoreError.notFound(entity: R.entity, localId: localId)
            }
            let hasInflight = try Bool.fetchOne(
                db,
                sql: "SELECT EXISTS(SELECT 1 FROM outbox WHERE entity = ? AND local_id = ? AND state = 'inflight')",
                arguments: [R.entity.rawValue, localId]
            ) ?? false
            if row.serverId == nil, !hasInflight {
                try db.execute(sql: "DELETE FROM outbox WHERE entity = ? AND local_id = ?", arguments: [R.entity.rawValue, localId])
                try db.execute(sql: "DELETE FROM \(R.entity.table) WHERE local_id = ?", arguments: [localId])
                try Self.dropReferences(db, to: LocalReference.make(localId: localId))
                if R.entity == .item {
                    try db.execute(
                        sql: "DELETE FROM item_occurrence WHERE item_id = ?",
                        arguments: [LocalReference.make(localId: localId)]
                    )
                }
                return
            }
            try db.execute(sql: "UPDATE \(R.entity.table) SET deleted_locally = 1 WHERE local_id = ?", arguments: [localId])
            try enqueue(
                db, entity: R.entity, op: .delete, localId: localId, payload: .object([:]),
                baseUpdatedAtMs: row.serverId == nil ? nil : row.updatedAt.epochMilliseconds
            )
        }
    }

    /// A never-pushed row is gone for good, so nothing may keep pointing at its placeholder.
    /// Rows get `NULL`, queued payloads / conflicts lose the reference (`null`, or removed from
    /// arrays such as `tagIds`), and queued updates that end up empty are dropped.
    static func dropReferences(_ db: Database, to placeholder: String) throws {
        for (table, column) in referenceColumns where !(table == "item_occurrence") {
            try db.execute(
                sql: "UPDATE \(table) SET \(column) = NULL WHERE \(column) = ?", arguments: [placeholder]
            )
        }
        try rewritePayloads(db, containing: placeholder) { $0.removingReference(placeholder) }
        try db.execute(sql: "DELETE FROM outbox WHERE op = 'update' AND payload = '{}'")
    }

    /// Project `code` is immutable on the server: only a project whose create has not been sent
    /// yet may change it, by editing that pending create.
    private func changeProjectCode(_ db: Database, old: ProjectRecord, new: ProjectRecord) throws {
        guard old.serverId == nil,
            let create = try OutboxEntry.fetchOne(
                db,
                sql: "SELECT * FROM outbox WHERE entity = 'project' AND local_id = ? AND op = 'create' AND state = 'pending'",
                arguments: [old.localId]
            )
        else { throw StoreError.immutableField("code") }
        var payload = create.payload.objectValue
        payload["code"] = .string(new.code)
        try db.execute(
            sql: "UPDATE outbox SET payload = ? WHERE id = ?", arguments: [JSONValue.object(payload), create.id]
        )
    }

    /// Completes an item, or one occurrence of a recurring item when `occursOn` (`YYYY-MM-DD`) is
    /// given; the series itself stays open in that case. Queues a `complete` entry whose payload
    /// is `{"occursOn": ...}` or empty.
    @discardableResult
    public func completeItem(localId: String, occursOn: String? = nil) throws -> ItemRecord {
        try dbQueue.write { db in
            guard var item = try ItemRecord.load(db, localId: localId) else {
                throw StoreError.notFound(entity: .item, localId: localId)
            }
            let stamp = now()
            if let occursOn {
                var occurrence = try ItemOccurrenceRecord
                    .filter(Column("item_id") == item.reference && Column("occurs_on") == occursOn)
                    .fetchOne(db)
                    ?? ItemOccurrenceRecord(itemId: item.reference, occursOn: occursOn, updatedAt: stamp)
                occurrence.status = "done"
                occurrence.completedAt = stamp
                try occurrence.save(db)
            } else {
                item.status = "done"
                item.completedAt = stamp
                try item.save(db)
            }
            try enqueue(
                db, entity: .item, op: .complete, localId: localId,
                payload: .object(occursOn.map { ["occursOn": .string($0)] } ?? [:]),
                baseUpdatedAtMs: item.serverId == nil ? nil : item.updatedAt.epochMilliseconds
            )
            return item
        }
    }

    /// After a push succeeded the server may hand back a newer `updatedAt`; later queued entries
    /// of the same row must use it as their `If-Match` base.
    public func setBaseUpdatedAt(entity: SyncEntity, localId: String, ms: Int64) throws {
        try dbQueue.write {
            try $0.execute(
                sql: "UPDATE outbox SET base_updated_at_ms = ? WHERE entity = ? AND local_id = ? AND op <> 'create'",
                arguments: [ms, entity.rawValue, localId]
            )
        }
    }
}
