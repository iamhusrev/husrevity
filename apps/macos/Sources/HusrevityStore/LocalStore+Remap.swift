import Foundation
import GRDB
import HusrevityModels

extension LocalStore {
    /// Columns that hold a reference (server id or `local:<uuid>` placeholder) to another row.
    static let referenceColumns: [(table: String, column: String)] = [
        ("item", "project_id"), ("item", "goal_id"), ("item", "block_id"), ("item_occurrence", "item_id"),
        ("project", "goal_id"), ("goal", "parent_goal_id"),
    ]

    /// Call after a `create` succeeded. Sets the row's `server_id`, then swaps the
    /// `local:<localId>` placeholder for `serverId` in every reference column, in every queued
    /// outbox payload (e.g. an item's `projectId`, a note's `tagIds`) and in recorded conflicts.
    /// Idempotent, so a replay after a crash is safe.
    ///
    /// If a pull already stored the server's copy of this row under another local id, that
    /// duplicate is dropped and the local row (with its local id) wins; note/tag links of the
    /// duplicate are re-pointed at the local row.
    ///
    /// Prefer `markDone(_:applying:)`, which does this together with finishing the entry.
    public func remapServerId(entity: SyncEntity, localId: String, serverId: String) throws {
        try dbQueue.write { try Self.remap($0, entity: entity, localId: localId, serverId: serverId) }
    }

    static func remap(_ db: Database, entity: SyncEntity, localId: String, serverId: String) throws {
        let exists = try Bool.fetchOne(
            db, sql: "SELECT EXISTS(SELECT 1 FROM \(entity.table) WHERE local_id = ?)", arguments: [localId]
        ) ?? false
        guard exists else { throw StoreError.notFound(entity: entity, localId: localId) }

        if let duplicate = try String.fetchOne(
            db, sql: "SELECT local_id FROM \(entity.table) WHERE server_id = ? AND local_id <> ?",
            arguments: [serverId, localId]
        ) {
            switch entity {
            case .noteTag:
                try db.execute(
                    sql: "UPDATE OR IGNORE note_tag_assignment SET tag_local_id = ? WHERE tag_local_id = ?",
                    arguments: [localId, duplicate]
                )
            case .note:
                try db.execute(
                    sql: "UPDATE OR IGNORE note_tag_assignment SET note_local_id = ? WHERE note_local_id = ?",
                    arguments: [localId, duplicate]
                )
            default: break
            }
            try db.execute(sql: "DELETE FROM \(entity.table) WHERE local_id = ?", arguments: [duplicate])
        }
        try db.execute(
            sql: "UPDATE \(entity.table) SET server_id = ? WHERE local_id = ?", arguments: [serverId, localId]
        )

        let placeholder = LocalReference.make(localId: localId)
        for (table, column) in referenceColumns {
            try db.execute(
                sql: "UPDATE \(table) SET \(column) = ? WHERE \(column) = ?", arguments: [serverId, placeholder]
            )
        }
        try rewritePayloads(db, containing: placeholder) { $0.replacingStrings([placeholder: serverId]) }
    }

    /// Rewrites every outbox payload and recorded conflict payload that mentions `needle`.
    static func rewritePayloads(_ db: Database, containing needle: String, _ transform: (JSONValue) -> JSONValue) throws {
        let targets: [(table: String, columns: [String])] = [
            ("outbox", ["payload"]), ("conflicts", ["local_payload", "server_payload"]),
        ]
        for (table, columns) in targets {
            for column in columns {
                let rows = try Row.fetchAll(
                    db, sql: "SELECT id, \(column) AS body FROM \(table) WHERE instr(\(column), ?) > 0", arguments: [needle]
                )
                for row in rows {
                    let id: Int64 = row["id"]
                    let payload = try JSONValue.parse(row["body"] as String)
                    try db.execute(
                        sql: "UPDATE \(table) SET \(column) = ? WHERE id = ?", arguments: [transform(payload), id]
                    )
                }
            }
        }
    }
}

extension JSONValue {
    /// A copy where every string equal to a key of `map` is replaced by its value.
    func replacingStrings(_ map: [String: String]) -> JSONValue {
        switch self {
        case .string(let s): return .string(map[s] ?? s)
        case .array(let a): return .array(a.map { $0.replacingStrings(map) })
        case .object(let o): return .object(o.mapValues { $0.replacingStrings(map) })
        default: return self
        }
    }

    /// A copy without references to `reference`: object values equal to it become `null`, array
    /// elements equal to it are removed.
    func removingReference(_ reference: String) -> JSONValue {
        switch self {
        case .string(let s): return s == reference ? .null : self
        case .array(let a):
            return .array(a.filter { $0 != .string(reference) }.map { $0.removingReference(reference) })
        case .object(let o): return .object(o.mapValues { $0.removingReference(reference) })
        default: return self
        }
    }

    func contains(string needle: String) -> Bool {
        switch self {
        case .string(let s): return s == needle
        case .array(let a): return a.contains { $0.contains(string: needle) }
        case .object(let o): return o.values.contains { $0.contains(string: needle) }
        default: return false
        }
    }
}
