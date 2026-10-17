import Foundation
import GRDB
import HusrevityModels

/// A local change the server rejected (HTTP 409/412). The Sync phase records it after letting the
/// server version win locally; the user then keeps their change or discards it.
public struct ConflictRecord: Equatable, Sendable, Identifiable, FetchableRecord {
    public var id: Int64
    public var entity: SyncEntity
    public var localId: String
    public var op: OutboxOp
    /// The rejected outbox payload.
    public var localPayload: JSONValue
    /// The server's current record as JSON; its `updatedAt` becomes the new `If-Match` base.
    public var serverPayload: JSONValue
    public var createdAt: Date
    public var resolvedAt: Date?

    public init(row: Row) throws {
        id = row["id"]
        entity = SyncEntity(rawValue: row["entity"]) ?? .item
        localId = row["local_id"]
        op = OutboxOp(rawValue: row["op"]) ?? .update
        localPayload = (row["local_payload"] as JSONValue?) ?? .object([:])
        serverPayload = (row["server_payload"] as JSONValue?) ?? .object([:])
        createdAt = Date(timeIntervalSince1970: Double(row["created_at"] as Int64) / 1000)
        resolvedAt = (row["resolved_at"] as Int64?).map { Date(timeIntervalSince1970: Double($0) / 1000) }
    }
}

extension LocalStore {
    @discardableResult
    public func recordConflict(
        entity: SyncEntity, localId: String, op: OutboxOp = .update, localPayload: JSONValue,
        serverPayload: JSONValue
    ) throws -> ConflictRecord {
        try dbQueue.write { db in
            try db.execute(
                sql: """
                    INSERT INTO conflicts(entity, local_id, op, local_payload, server_payload, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                arguments: [entity.rawValue, localId, op.rawValue, localPayload, serverPayload, now().epochMilliseconds]
            )
            return try ConflictRecord.fetchOne(db, sql: "SELECT * FROM conflicts WHERE id = ?", arguments: [db.lastInsertedRowID])!
        }
    }

    public func unresolvedConflicts() throws -> [ConflictRecord] {
        try dbQueue.read {
            try ConflictRecord.fetchAll($0, sql: "SELECT * FROM conflicts WHERE resolved_at IS NULL ORDER BY id")
        }
    }

    /// `keepLocal: true` re-applies the rejected change to the row and re-enqueues it against the
    /// server's `updatedAt` (new idempotency key). `false` discards the change and leaves the
    /// server version in place. The rejected outbox entry is removed either way; resolving an
    /// already resolved conflict is a no-op.
    public func resolveConflict(id: Int64, keepLocal: Bool) throws {
        try dbQueue.write { db in
            guard let conflict = try ConflictRecord.fetchOne(db, sql: "SELECT * FROM conflicts WHERE id = ?", arguments: [id])
            else { throw StoreError.invalidPayload("no conflict with id \(id)") }
            guard conflict.resolvedAt == nil else { return }

            if keepLocal {
                try reapply(db, conflict)
            } else {
                try discardLocalChanges(db, conflict)
            }
            try db.execute(
                sql: "UPDATE conflicts SET resolved_at = ? WHERE id = ?", arguments: [now().epochMilliseconds, id]
            )
        }
    }

    // MARK: Re-apply

    /// "Server wins" for the whole row: every still-queued entry of the row and every other open
    /// conflict of it is dropped, so the next pull can overwrite the row. Throws
    /// `StoreError.entryInFlight` (changing nothing) if one of the entries is being pushed. A row
    /// the server never saw is removed entirely, and queued payloads of other rows lose their
    /// `local:` reference to it. A recorded server tombstone for the row is applied now.
    private func discardLocalChanges(_ db: Database, _ c: ConflictRecord) throws {
        let args: StatementArguments = [c.entity.rawValue, c.localId]
        if try Bool.fetchOne(
            db, sql: "SELECT EXISTS(SELECT 1 FROM outbox WHERE entity = ? AND local_id = ? AND state = 'inflight')",
            arguments: args
        ) ?? false {
            throw StoreError.entryInFlight(entity: c.entity, localId: c.localId)
        }
        try db.execute(sql: "DELETE FROM outbox WHERE entity = ? AND local_id = ?", arguments: args)
        try db.execute(
            sql: "DELETE FROM conflicts WHERE entity = ? AND local_id = ? AND id <> ? AND resolved_at IS NULL",
            arguments: [c.entity.rawValue, c.localId, c.id]
        )
        try Self.restoreRow(db, c.entity, localId: c.localId)
    }

    /// Brings a row whose queued entries were all dropped back to a consistent state: removed if
    /// the server never saw it (with dangling-reference cleanup) or already deleted it, otherwise
    /// visible again and no longer protected, so the next pull overwrites it.
    static func restoreRow(_ db: Database, _ entity: SyncEntity, localId: String) throws {
        let serverId = try String.fetchOne(
            db, sql: "SELECT server_id FROM \(entity.table) WHERE local_id = ?", arguments: [localId]
        )
        let tombstoned = try Bool.fetchOne(
            db, sql: "SELECT pending_tombstone = 1 FROM \(entity.table) WHERE local_id = ?", arguments: [localId]
        ) ?? false
        if serverId == nil || tombstoned {
            try db.execute(sql: "DELETE FROM \(entity.table) WHERE local_id = ?", arguments: [localId])
            if serverId == nil {
                let placeholder = LocalReference.make(localId: localId)
                try dropReferences(db, to: placeholder)
                if entity == .item {
                    try db.execute(sql: "DELETE FROM item_occurrence WHERE item_id = ?", arguments: [placeholder])
                }
            }
        } else {
            try db.execute(
                sql: "UPDATE \(entity.table) SET deleted_locally = 0 WHERE local_id = ?", arguments: [localId]
            )
            // The row still shows the rejected local values; only a full pull restores them.
            try markFullResync(db)
        }
    }

    private func reapply(_ db: Database, _ c: ConflictRecord) throws {
        let base = c.serverPayload.objectValue["updatedAt"]?.stringValue
            .flatMap(Wire.parseDate)?.epochMilliseconds
        // The re-enqueued change takes the rejected entry's place in the queue.
        let slot = try Int64.fetchOne(
            db, sql: "SELECT MIN(id) FROM outbox WHERE entity = ? AND local_id = ? AND state = 'failed'",
            arguments: [c.entity.rawValue, c.localId]
        )
        try db.execute(
            sql: "DELETE FROM outbox WHERE entity = ? AND local_id = ? AND state = 'failed'",
            arguments: [c.entity.rawValue, c.localId]
        )
        switch c.op {
        case .create, .update:
            try overlay(db, c.entity, localId: c.localId, payload: c.localPayload)
        case .delete:
            try db.execute(
                sql: "UPDATE \(c.entity.table) SET deleted_locally = 1 WHERE local_id = ?", arguments: [c.localId]
            )
        case .complete:
            try overlayCompletion(db, localId: c.localId, payload: c.localPayload)
        }
        let entry = try enqueue(
            db, entity: c.entity, op: c.op, localId: c.localId, payload: c.localPayload,
            baseUpdatedAtMs: base, id: slot
        )
        if let base {
            // Later queued entries of the row were based on the old server version too.
            try db.execute(
                sql: "UPDATE outbox SET base_updated_at_ms = ? WHERE entity = ? AND local_id = ? AND op <> 'create' AND id <> ?",
                arguments: [base, c.entity.rawValue, c.localId, entry.id]
            )
        }
    }

    private func overlay(_ db: Database, _ entity: SyncEntity, localId: String, payload: JSONValue) throws {
        switch entity {
        case .item: try overlay(db, ItemRecord.self, localId: localId, payload: payload)
        case .note: try overlay(db, NoteRecord.self, localId: localId, payload: payload)
        case .noteTag: try overlay(db, NoteTagRecord.self, localId: localId, payload: payload)
        case .project: try overlay(db, ProjectRecord.self, localId: localId, payload: payload)
        case .goal: try overlay(db, GoalRecord.self, localId: localId, payload: payload)
        case .itemOccurrence: break
        }
    }

    /// Writes the payload's fields over the stored row (wire names equal the record's coding keys).
    private func overlay<R: SyncedRecord>(_ db: Database, _ type: R.Type, localId: String, payload: JSONValue) throws {
        guard let current = try R.load(db, localId: localId) else {
            throw StoreError.notFound(entity: R.entity, localId: localId)
        }
        var object = try JSONDecoder().decode(JSONValue.self, from: APICoding.encoder.encode(current)).objectValue
        for (key, value) in payload.objectValue where key != "tagIds" { object[key] = value }
        var merged = try APICoding.decoder.decode(R.self, from: JSONEncoder().encode(JSONValue.object(object)))
        merged.localId = current.localId
        merged.serverId = current.serverId
        merged.updatedAt = current.updatedAt
        if var note = merged as? NoteRecord {
            note.tagIds = try tagLocalIds(db, refs: payload.objectValue["tagIds"], fallback: (current as? NoteRecord)?.tagIds ?? [])
            merged = note as! R
        }
        try merged.persist(db)
    }

    /// Resolves tag references (server id or `local:<uuid>`) to local tag ids.
    private func tagLocalIds(_ db: Database, refs: JSONValue?, fallback: [String]) throws -> [String] {
        guard case .array(let values)? = refs else { return fallback }
        return try values.compactMap { value -> String? in
            guard let ref = value.stringValue else { return nil }
            if let local = LocalReference.localId(from: ref) { return local }
            return try Self.localId(db, .noteTag, serverId: ref)
        }
    }

    private func overlayCompletion(_ db: Database, localId: String, payload: JSONValue) throws {
        let stamp = now().epochMilliseconds
        if let occursOn = payload.objectValue["occursOn"]?.stringValue {
            try db.execute(
                sql: """
                    UPDATE item_occurrence SET status = 'done', completed_at = ?
                    WHERE occurs_on = ? AND item_id IN (SELECT COALESCE(server_id, 'local:' || local_id) FROM item WHERE local_id = ?)
                    """,
                arguments: [stamp, occursOn, localId]
            )
        } else {
            try db.execute(
                sql: "UPDATE item SET status = 'done', completed_at = ? WHERE local_id = ?", arguments: [stamp, localId]
            )
        }
    }
}

extension JSONValue {
    var objectValue: [String: JSONValue] {
        if case .object(let o) = self { return o }
        return [:]
    }

    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }
}
