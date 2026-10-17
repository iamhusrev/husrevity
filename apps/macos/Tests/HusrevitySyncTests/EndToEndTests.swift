import Foundation
import HusrevityModels
import XCTest
@testable import HusrevityStore
@testable import HusrevitySync

/// The whole loop over the captured fixtures: empty store, first pull, local edits, push, second
/// pull; the local database must end up equal to the server's.
final class EndToEndTests: SyncTestCase {
    private struct Snapshot: Equatable {
        var notes: [String]
        var tags: [String]
        var goals: [String]
        var projects: [String]
        var items: [String]
        var occurrences: [String]
    }

    private func snapshot(_ s: LocalStore) throws -> Snapshot {
        let tagIdToServer = Dictionary(uniqueKeysWithValues: try s.tags().map { ($0.localId, $0.serverId ?? "?") })
        let notes = try s.notes(archived: false) + s.notes(archived: true)
        return Snapshot(
            notes: notes.map { n in
                "\(n.serverId ?? "?")|\(n.title)|\(n.bodyMarkdown ?? "")|\(n.pinned)|tags=\(n.tagIds.compactMap { tagIdToServer[$0] }.sorted())"
            }.sorted(),
            tags: try s.tags().map { "\($0.serverId ?? "?")|\($0.name)" }.sorted(),
            goals: try s.goals().map { "\($0.serverId ?? "?")|\($0.title)|\($0.status)" }.sorted(),
            projects: try (s.projects(archived: false) + s.projects(archived: true)).map { "\($0.serverId ?? "?")|\($0.name)" }.sorted(),
            items: try s.items().map { "\($0.serverId ?? "?")|\($0.title)|\($0.status)" }.sorted(),
            occurrences: try s.occurrences(from: "0000-01-01", to: "9999-12-31").map { "\($0.serverId ?? "?")|\($0.occursOn)|\($0.status)" }.sorted()
        )
    }

    func testEmptyStorePullEditPushPullConvergesToTheServerState() async throws {
        let full = try loadSync("sync-full")
        let incremental = try loadSync("sync-incremental")

        // 1. First run on an empty store: a pure pull.
        api.enqueueSync(full)
        let first = await engine.syncNow()
        XCTAssertEqual(first.result, .synced)
        XCTAssertEqual(api.sinceLog, [nil])
        XCTAssertEqual(try store.cursor(), full.cursor)
        XCTAssertEqual(try store.notes().count, 1)
        XCTAssertEqual(try store.items().count, 2)
        api.adopt(full)

        // 2. Local edits that mirror what happened on the server between the two captures.
        let noteLocal = try XCTUnwrap(try noteRow(serverId: "1")?.localId)
        try store.update(NoteRecord.self, localId: noteLocal) { $0.title = "Plan the week (v2)" }
        let goalLocal = try XCTUnwrap(try store.goals().first?.localId)
        try store.update(GoalRecord.self, localId: goalLocal) { $0.title = "Ship the Mac app (v1)" }
        let itemLocal = try XCTUnwrap(try store.items().first { $0.serverId == "2" }?.localId)
        try store.delete(ItemRecord.self, localId: itemLocal)
        let tagLocal = try XCTUnwrap(try store.tags().first?.localId)
        try store.delete(NoteTagRecord.self, localId: tagLocal)
        XCTAssertEqual(try store.outboxCount(), 4)

        // 3. Push, then pull the server's incremental view.
        api.enqueueSync(incremental)
        let second = await engine.syncNow()

        XCTAssertEqual(second.result, .synced)
        XCTAssertEqual(second.pushed, 4)
        XCTAssertEqual(second.parked, 0)
        XCTAssertEqual(second.conflicts, 0)
        XCTAssertEqual(api.sinceLog, [nil, full.cursor])
        XCTAssertEqual(
            api.writeCalls.map(\.op), ["updateNote", "updateGoal", "deleteItem", "deleteNoteTag"], "pushed in the order they were made"
        )
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertEqual(try store.cursor(), incremental.cursor)

        // 4. The local database equals "full, then incremental" applied to a fresh store.
        let reference = try LocalStore(path: directory.appendingPathComponent("reference.sqlite").path)
        try reference.apply(sync: full)
        try reference.apply(sync: incremental)
        XCTAssertEqual(try snapshot(store), try snapshot(reference))
        XCTAssertEqual(try snapshot(store).notes.first?.contains("Plan the week (v2)"), true)
        XCTAssertTrue(try snapshot(store).tags.isEmpty)
    }
}
