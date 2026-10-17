import Foundation
import GRDB
import HusrevityModels

extension LocalStore {
    /// Queues a write. `baseUpdatedAtMs` is the server `updatedAt` the change was based on (sent as
    /// `If-Match`); `idempotencyKey` is reused verbatim on every retry of the push.
    @discardableResult
    public func enqueue(
        entity: SyncEntity, op: OutboxOp, localId: String, payload: JSONValue = .object([:]),
        baseUpdatedAtMs: Int64? = nil, idempotencyKey: String = UUID().uuidString
    ) throws -> OutboxEntry {
        try dbQueue.write { db in
            try enqueue(
                db, entity: entity, op: op, localId: localId, payload: payload,
                baseUpdatedAtMs: baseUpdatedAtMs, idempotencyKey: idempotencyKey
            )
        }
    }

    @discardableResult
    func enqueue(
        _ db: Database, entity: SyncEntity, op: OutboxOp, localId: String, payload: JSONValue,
        baseUpdatedAtMs: Int64?, idempotencyKey: String = UUID().uuidString, id: Int64? = nil
    ) throws -> OutboxEntry {
        // `id` lets a re-enqueued entry keep its place in the FIFO order.
        try db.execute(
            sql: """
                INSERT INTO outbox(id, entity, op, local_id, payload, idempotency_key, base_updated_at_ms, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
            arguments: [
                id, entity.rawValue, op.rawValue, localId, payload, idempotencyKey, baseUpdatedAtMs,
                now().epochMilliseconds,
            ]
        )
        return try OutboxEntry.fetchOne(db, sql: "SELECT * FROM outbox WHERE id = ?", arguments: [db.lastInsertedRowID])!
    }

    /// The oldest entry that is waiting to be pushed (FIFO), skipping entries that are blocked:
    /// - a later entry of a row whose earlier entry is `failed` (a parked create must not let its
    ///   update / complete / delete go out), and
    /// - an entry whose payload references (`local:<uuid>`) a row that has a `failed` entry.
    public func nextPending() throws -> OutboxEntry? {
        try dbQueue.read { db in
            let failed = try OutboxEntry.fetchAll(db, sql: "SELECT * FROM outbox WHERE state = 'failed'")
            let pending = try OutboxEntry.fetchAll(db, sql: "SELECT * FROM outbox WHERE state = 'pending' ORDER BY id")
            return pending.first { entry in
                !failed.contains { f in
                    (f.entity == entry.entity && f.localId == entry.localId && f.id < entry.id)
                        || (f.id < entry.id && f.op == .create
                            && entry.payload.contains(string: LocalReference.make(localId: f.localId)))
                }
            }
        }
    }

    /// Every queued entry in queue order, whatever its state.
    public func outbox() throws -> [OutboxEntry] {
        try dbQueue.read { try OutboxEntry.fetchAll($0, sql: "SELECT * FROM outbox ORDER BY id") }
    }

    public func outboxEntry(id: Int64) throws -> OutboxEntry? {
        try dbQueue.read { try OutboxEntry.fetchOne($0, sql: "SELECT * FROM outbox WHERE id = ?", arguments: [id]) }
    }

    public func outboxCount() throws -> Int {
        try dbQueue.read { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM outbox") ?? 0 }
    }

    /// Marks the entry as being pushed and counts the attempt.
    public func markInflight(_ id: Int64) throws {
        try dbQueue.write {
            try $0.execute(
                sql: "UPDATE outbox SET state = 'inflight', attempts = attempts + 1 WHERE id = ?",
                arguments: [id]
            )
        }
    }

    /// Parks the entry for attention (conflict, permanent error). It keeps protecting its row.
    public func markFailed(_ id: Int64, error: String? = nil) throws {
        try dbQueue.write {
            try $0.execute(
                sql: "UPDATE outbox SET state = 'failed', last_error = ? WHERE id = ?",
                arguments: [error, id]
            )
        }
    }

    /// Puts an entry back in the queue, e.g. after a transient network error.
    public func requeue(_ id: Int64) throws {
        try dbQueue.write {
            try $0.execute(sql: "UPDATE outbox SET state = 'pending', last_error = NULL WHERE id = ?", arguments: [id])
        }
    }

    /// Removes a pushed entry. A pushed `delete` also drops the soft-deleted local row for good.
    ///
    /// For creates and updates prefer `markDone(_:applying:)`, which also stores the server's
    /// version and rebases later entries atomically. With this plain variant the engine must call
    /// `remapServerId`, `applyServerRecord` and `setBaseUpdatedAt` itself.
    public func markDone(_ id: Int64) throws {
        try dbQueue.write { db in
            if let entry = try OutboxEntry.fetchOne(db, sql: "SELECT * FROM outbox WHERE id = ?", arguments: [id]) {
                try Self.finish(db, entry)
            }
        }
    }

    static func finish(_ db: Database, _ entry: OutboxEntry) throws {
        if entry.op == .delete {
            try db.execute(
                sql: "DELETE FROM \(entry.entity.table) WHERE local_id = ? AND deleted_locally = 1",
                arguments: [entry.localId]
            )
        }
        try db.execute(sql: "DELETE FROM outbox WHERE id = ?", arguments: [entry.id])
    }

    /// Entries parked as `failed`, for the UI.
    public func failedOutbox() throws -> [OutboxEntry] {
        try dbQueue.read { try OutboxEntry.fetchAll($0, sql: "SELECT * FROM outbox WHERE state = 'failed' ORDER BY id") }
    }

    /// Crash recovery: anything left `inflight` when the app died goes back to `pending`. The
    /// idempotency key makes the replay safe on the server.
    public func resetInflightToPending() throws {
        try dbQueue.write { try $0.execute(sql: "UPDATE outbox SET state = 'pending' WHERE state = 'inflight'") }
    }
}
