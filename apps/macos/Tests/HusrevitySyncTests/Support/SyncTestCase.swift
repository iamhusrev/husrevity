import Foundation
import GRDB
import HusrevityModels
import HusrevityNetwork
import HusrevityTestSupport
import XCTest
@testable import HusrevityStore
@testable import HusrevitySync

/// Base class: a real `LocalStore` on a temp SQLite file, a scripted fake API and an engine
/// wired to both.
class SyncTestCase: XCTestCase {
    var directory: URL!
    var store: LocalStore!
    var api: FakeSyncAPI!
    var engine: SyncEngine!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("husrevity-sync-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        store = try LocalStore(path: directory.appendingPathComponent("store.sqlite").path)
        api = FakeSyncAPI()
        engine = makeEngine()
    }

    override func tearDownWithError() throws {
        engine = nil
        store = nil
        try? FileManager.default.removeItem(at: directory)
    }

    func makeEngine() -> SyncEngine {
        let store = self.store!
        return SyncEngine(store: store, api: api, serverID: { entity, localId in
            try store.dbQueue.read {
                try String.fetchOne(
                    $0, sql: "SELECT server_id FROM \(entity.table) WHERE local_id = ?", arguments: [localId]
                )
            }
        })
    }

    // MARK: Fixtures

    func loadSync(_ name: String) throws -> SyncResponse {
        let env = try APICoding.decoder.decode(Envelope<SyncResponse>.self, from: Fixtures.data(name))
        return try XCTUnwrap(env.data)
    }

    /// Loads the real `sync-full` capture into the store, the fake server and the cursor, as if a
    /// first sync had already happened.
    @discardableResult
    func seedFromFullFixture() throws -> SyncResponse {
        let full = try loadSync("sync-full")
        try store.apply(sync: full)
        try store.setCursor(full.cursor)
        api.adopt(full)
        return full
    }

    // MARK: Store helpers

    func serverId(_ entity: SyncEntity, localId: String) throws -> String? {
        try store.dbQueue.read {
            try String.fetchOne($0, sql: "SELECT server_id FROM \(entity.table) WHERE local_id = ?", arguments: [localId])
        }
    }

    func count(_ table: String, where clause: String = "1") throws -> Int {
        try store.dbQueue.read { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM \(table) WHERE \(clause)") ?? 0 }
    }

    func noteRow(serverId: String) throws -> NoteRecord? {
        try store.notes(archived: false).first { $0.serverId == serverId }
            ?? store.notes(archived: true).first { $0.serverId == serverId }
    }

    /// Replaces the stored `updated_at` of a row (to model "the server version this row mirrors").
    func setUpdatedAt(_ entity: SyncEntity, localId: String, _ date: Date) throws {
        try store.dbQueue.write {
            try $0.execute(
                sql: "UPDATE \(entity.table) SET updated_at = ? WHERE local_id = ?",
                arguments: [date.epochMilliseconds, localId]
            )
        }
    }

    /// A poisoned-note trigger, like the Store tests use to make `apply(sync:)` fail.
    func installApplyTrap() throws {
        try store.dbQueue.write {
            try $0.execute(sql: """
                CREATE TRIGGER boom BEFORE INSERT ON note WHEN NEW.title = 'boom'
                BEGIN SELECT RAISE(ABORT, 'boom'); END
                """)
        }
    }

    func execute(_ sql: String) throws {
        try store.dbQueue.write { try $0.execute(sql: sql) }
    }

    func syncJSON(_ fields: [String: Any]) -> SyncResponse {
        var json: [String: Any] = [
            "items": [], "itemOccurrences": [], "notes": [], "noteTags": [], "projects": [],
            "goals": [], "cursor": "c",
            "tombstones": [
                "items": [], "itemOccurrences": [], "notes": [], "noteTags": [], "projects": [],
                "goals": [],
            ],
        ]
        for (k, v) in fields {
            if k == "tombstones", let extra = v as? [String: Any] {
                var merged = json["tombstones"] as! [String: Any]
                for (tk, tv) in extra { merged[tk] = tv }
                json["tombstones"] = merged
            } else {
                json[k] = v
            }
        }
        return FakeSyncAPI.decode(json)
    }

    func noteJSON(id: String, title: String, updatedAt: String = "2026-10-17T21:02:07.300Z") -> [String: Any] {
        [
            "id": id, "title": title, "bodyMarkdown": NSNull(), "pinned": false, "archived": false,
            "position": 0, "colorHex": NSNull(), "tags": [], "createdAt": updatedAt, "updatedAt": updatedAt,
        ]
    }
}
