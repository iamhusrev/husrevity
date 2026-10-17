import Foundation
import GRDB
import HusrevityModels
import HusrevityTestSupport
import XCTest
@testable import HusrevityStore

/// Base class: every test gets a real SQLite file in a private temp directory.
class StoreTestCase: XCTestCase {
    var directory: URL!
    var path: String { directory.appendingPathComponent("store.sqlite").path }
    var store: LocalStore!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("husrevity-store-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        store = try LocalStore(path: path)
    }

    override func tearDownWithError() throws {
        store = nil
        try? FileManager.default.removeItem(at: directory)
    }

    func syncFull() throws -> SyncResponse { try loadSync("sync-full") }
    func syncIncremental() throws -> SyncResponse { try loadSync("sync-incremental") }

    private func loadSync(_ name: String) throws -> SyncResponse {
        let env = try APICoding.decoder.decode(Envelope<SyncResponse>.self, from: Fixtures.data(name))
        return try XCTUnwrap(env.data)
    }

    func count(_ table: String, where clause: String = "1") throws -> Int {
        try store.dbQueue.read { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM \(table) WHERE \(clause)") ?? 0 }
    }

    /// An empty sync payload to build small custom ones from (the DTOs have no public memberwise
    /// initialisers, so tests go through JSON like the real client does).
    func emptySync(cursor: String = "c") -> SyncResponse {
        syncJSON(["cursor": cursor])
    }

    /// Builds a `SyncResponse` from the given top-level JSON fields; missing collections are empty.
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
        let data = try! JSONSerialization.data(withJSONObject: json)
        return try! APICoding.decoder.decode(SyncResponse.self, from: data)
    }
}
