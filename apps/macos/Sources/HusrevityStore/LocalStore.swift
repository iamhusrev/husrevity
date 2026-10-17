import Foundation
import GRDB
import HusrevityModels

/// Offline-first SQLite store: synced entity tables, the write outbox, the sync cursor and the
/// conflict log. All SQL lives in this module.
///
/// Methods are synchronous and throwing; GRDB serialises access, so the store is safe to share
/// across tasks. `now` is injectable for deterministic tests.
public final class LocalStore: Sendable {
    let dbQueue: DatabaseQueue
    let now: @Sendable () -> Date

    public init(path: String, now: @escaping @Sendable () -> Date = { Date() }) throws {
        var config = Configuration()
        config.foreignKeysEnabled = true
        self.dbQueue = try DatabaseQueue(path: path, configuration: config)
        self.now = now
        try Schema.migrator().migrate(dbQueue)
    }

    // MARK: Full-resync marker

    static let fullResyncKey = "needs_full_resync"

    /// True after a local change to an existing server row was thrown away (a failed entry was
    /// discarded, or a conflict was resolved for the server). The row still shows the rejected
    /// local values, and an incremental pull will never resend it if the server copy did not
    /// change since the cursor, so the next pull must be a FULL one (`since: nil`). The marker is
    /// persisted, so it survives quitting and crashes. Discarding a never-pushed create does not
    /// set it: that row is simply removed.
    public func needsFullResync() throws -> Bool {
        try dbQueue.read {
            try Bool.fetchOne($0, sql: "SELECT EXISTS(SELECT 1 FROM sync_state WHERE key = ?)", arguments: [Self.fullResyncKey]) ?? false
        }
    }

    /// Call only after a pull with `since: nil` has been applied successfully. `apply(sync:)` and
    /// `setCursor` never clear the marker.
    public func clearFullResync() throws {
        try dbQueue.write { try $0.execute(sql: "DELETE FROM sync_state WHERE key = ?", arguments: [Self.fullResyncKey]) }
    }

    static func markFullResync(_ db: Database) throws {
        try db.execute(
            sql: "INSERT OR REPLACE INTO sync_state(key, value) VALUES (?, '1')", arguments: [fullResyncKey]
        )
    }

    // MARK: Cursor

    private static let cursorKey = "cursor"

    /// The `since` value for the next pull, or nil before the first successful sync.
    public func cursor() throws -> String? {
        try dbQueue.read {
            try String.fetchOne($0, sql: "SELECT value FROM sync_state WHERE key = ?", arguments: [Self.cursorKey])
        }
    }

    public func setCursor(_ value: String) throws {
        try dbQueue.write {
            try $0.execute(
                sql: "INSERT INTO sync_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                arguments: [Self.cursorKey, value]
            )
        }
    }
}
