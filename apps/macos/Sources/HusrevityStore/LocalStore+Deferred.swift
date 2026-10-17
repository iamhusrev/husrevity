import Foundation
import GRDB
import HusrevityModels

/// Server tombstones that could not be applied because the row had an unsent local change.
///
/// The pull cursor moves on, so the server will never resend such a tombstone; the store records
/// it instead. The SyncEngine must:
/// - call `settleDeferredTombstones()` after every push (and after discarding entries), and
/// - call `discardLocalRow(entity:localId:)` when a push of an `update` / `complete` gets 404
///   (the server row is gone), since there is nothing left to send the change to.
extension LocalStore {
    /// Rows the server deleted while they had a local change still queued.
    public func deferredTombstones() throws -> [(entity: SyncEntity, localId: String)] {
        try dbQueue.read { db in
            try SyncEntity.allCases.flatMap { entity in
                try String.fetchAll(
                    db, sql: "SELECT local_id FROM \(entity.table) WHERE pending_tombstone = 1 ORDER BY rowid"
                ).map { (entity: entity, localId: $0) }
            }
        }
    }

    /// The server id of a row, also for rows hidden by a pending local delete (the read APIs
    /// hide those). `nil` for unknown rows and rows the server has not seen yet.
    public func serverId(entity: SyncEntity, localId: String) throws -> String? {
        try dbQueue.read {
            try String.fetchOne(
                $0, sql: "SELECT server_id FROM \(entity.table) WHERE local_id = ?", arguments: [localId]
            )
        }
    }

    /// The "Discard" button for a parked entry. Only `failed` entries can be discarded; any other
    /// state throws `StoreError.invalidPayload` and an unknown id too. Throws
    /// `StoreError.entryInFlight` (changing nothing) if a later entry of the row is being pushed.
    ///
    /// Drops the entry and every LATER queued entry of the same row (they build on the rejected
    /// change) plus the row's open conflicts. Then the row is restored: removed if it was never
    /// pushed (dependents lose their `local:` references) or if a server tombstone was recorded;
    /// otherwise it keeps its last server version, becomes visible again and is no longer
    /// protected, so the next pull overwrites it. If earlier entries of the row remain the row
    /// stays protected.
    public func discardOutboxEntry(id: Int64) throws {
        try dbQueue.write { db in
            guard let entry = try OutboxEntry.fetchOne(db, sql: "SELECT * FROM outbox WHERE id = ?", arguments: [id])
            else { throw StoreError.invalidPayload("no outbox entry \(id)") }
            guard entry.state == .failed else {
                throw StoreError.invalidPayload("outbox entry \(id) is not failed")
            }
            let args: StatementArguments = [entry.entity.rawValue, entry.localId, id]
            if try Bool.fetchOne(
                db,
                sql: "SELECT EXISTS(SELECT 1 FROM outbox WHERE entity = ? AND local_id = ? AND id >= ? AND state = 'inflight')",
                arguments: args
            ) ?? false {
                throw StoreError.entryInFlight(entity: entry.entity, localId: entry.localId)
            }
            let droppedDelete = try Bool.fetchOne(
                db,
                sql: "SELECT EXISTS(SELECT 1 FROM outbox WHERE entity = ? AND local_id = ? AND id >= ? AND op = 'delete')",
                arguments: args
            ) ?? false
            try db.execute(sql: "DELETE FROM outbox WHERE entity = ? AND local_id = ? AND id >= ?", arguments: args)
            try db.execute(
                sql: "DELETE FROM conflicts WHERE entity = ? AND local_id = ? AND resolved_at IS NULL",
                arguments: [entry.entity.rawValue, entry.localId]
            )
            if try Self.isProtected(db, entry.entity, localId: entry.localId) {
                try Self.markFullResync(db)
                if droppedDelete {
                    try db.execute(
                        sql: "UPDATE \(entry.entity.table) SET deleted_locally = 0 WHERE local_id = ?",
                        arguments: [entry.localId]
                    )
                }
            } else {
                try Self.restoreRow(db, entry.entity, localId: entry.localId)
            }
        }
    }

    /// Removes the row together with its outbox entries and conflicts (used when the server row
    /// no longer exists). Note assignments cascade.
    public func discardLocalRow(entity: SyncEntity, localId: String) throws {
        try dbQueue.write { db in try Self.discard(db, entity, localId: localId) }
    }

    /// Applies every recorded tombstone whose row no longer has queued entries (they were pushed
    /// or discarded). Returns the number of rows removed.
    @discardableResult
    public func settleDeferredTombstones() throws -> Int {
        try dbQueue.write { db in
            var removed = 0
            for entity in SyncEntity.allCases {
                let ids = try String.fetchAll(db, sql: "SELECT local_id FROM \(entity.table) WHERE pending_tombstone = 1")
                for id in ids where try !Self.isProtected(db, entity, localId: id) {
                    try Self.discard(db, entity, localId: id)
                    removed += 1
                }
            }
            return removed
        }
    }

    static func discard(_ db: Database, _ entity: SyncEntity, localId: String) throws {
        try db.execute(sql: "DELETE FROM outbox WHERE entity = ? AND local_id = ?", arguments: [entity.rawValue, localId])
        try db.execute(sql: "DELETE FROM conflicts WHERE entity = ? AND local_id = ?", arguments: [entity.rawValue, localId])
        try db.execute(sql: "DELETE FROM \(entity.table) WHERE local_id = ?", arguments: [localId])
    }
}
