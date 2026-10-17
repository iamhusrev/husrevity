import Foundation
import GRDB
import HusrevityModels

/// Finishing a push atomically.
///
/// After every successful push the engine must do three things: remap the server id (create),
/// remove the outbox entry, and store the server's version + rebase later queued entries. A row
/// created locally carries the LOCAL clock in `updated_at` until then, which would be a wrong
/// `If-Match`. `markDone(_:applying:)` does all of it in one transaction; calling the separate
/// `remapServerId` / `markDone` / `applyServerRecord` / `setBaseUpdatedAt` still works.
extension LocalStore {
    public func markDone(_ id: Int64, applying dto: ItemDTO) throws {
        try finishPush(id, .item, dto.id, dto.updatedAt) { try Self.upsert($0, dto: dto) }
    }

    public func markDone(_ id: Int64, applying dto: ItemOccurrenceDTO) throws {
        try finishPush(id, .itemOccurrence, dto.id, dto.updatedAt) { try Self.upsert($0, dto: dto) }
    }

    public func markDone(_ id: Int64, applying dto: NoteDTO) throws {
        try finishPush(id, .note, dto.id, dto.updatedAt) { try Self.upsert($0, dto: dto) }
    }

    public func markDone(_ id: Int64, applying dto: NoteTagDTO) throws {
        try finishPush(id, .noteTag, dto.id, dto.updatedAt) { try Self.upsert($0, dto: dto) }
    }

    public func markDone(_ id: Int64, applying dto: ProjectDTO) throws {
        try finishPush(id, .project, dto.id, dto.updatedAt) { try Self.upsert($0, dto: dto) }
    }

    public func markDone(_ id: Int64, applying dto: GoalDTO) throws {
        try finishPush(id, .goal, dto.id, dto.updatedAt) { try Self.upsert($0, dto: dto) }
    }

    private func finishPush(
        _ id: Int64, _ entity: SyncEntity, _ serverId: String, _ updatedAt: Date,
        upsert: (Database) throws -> Void
    ) throws {
        try dbQueue.write { db in
            if let entry = try OutboxEntry.fetchOne(db, sql: "SELECT * FROM outbox WHERE id = ?", arguments: [id]) {
                if entry.op == .create {
                    try Self.remap(db, entity: entity, localId: entry.localId, serverId: serverId)
                }
                try Self.finish(db, entry)
            }
            // A replay after a crash may find the entry already gone; the rest is idempotent.
            try upsert(db)  // skipped for rows that still have queued changes
            guard let local = try Self.localId(db, entity, serverId: serverId) else { return }
            let ms = updatedAt.epochMilliseconds
            try db.execute(sql: "UPDATE \(entity.table) SET updated_at = ? WHERE local_id = ?", arguments: [ms, local])
            try db.execute(
                sql: "UPDATE outbox SET base_updated_at_ms = ? WHERE entity = ? AND local_id = ? AND op <> 'create'",
                arguments: [ms, entity.rawValue, local]
            )
        }
    }
}
