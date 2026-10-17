import Foundation
import HusrevityModels
import HusrevityNetwork
import XCTest
@testable import HusrevityStore
@testable import HusrevitySync

private let offline = APIError.transport(URLError(.notConnectedToInternet))

/// Persisted full-resync marker, attempt budget, blocked outcome.
final class FullResyncMarkerTests: SyncTestCase {
    func testMarkerForcesAFullPullEvenOnAFreshEngine() async throws {
        try store.setCursor("old")
        try store.requestFullResyncForTest()
        let relaunched = makeEngine()

        _ = await relaunched.syncNow()

        XCTAssertEqual(api.sinceLog, [nil])
        XCTAssertFalse(try store.needsFullResync(), "cleared after the full pull applied")
        XCTAssertEqual(try store.cursor(), "cursor-1")
    }

    func testMarkerSurvivesAnOfflineRun() async throws {
        try store.setCursor("old")
        try store.requestFullResyncForTest()
        api.enqueueSyncFailure(offline)
        _ = await engine.syncNow()
        XCTAssertTrue(try store.needsFullResync())

        _ = await makeEngine().syncNow()
        XCTAssertEqual(api.sinceLog, [nil, nil])
        XCTAssertFalse(try store.needsFullResync())
    }

    func testMarkerSurvivesACancelledRun() async throws {
        try store.setCursor("old")
        try store.requestFullResyncForTest()
        _ = try store.create(NoteRecord(title: "slow"))
        let gate = ManualGate()
        api.setGate(gate)
        let run = Task { await engine.syncNow() }
        await gate.waitForArrivals(1)
        await engine.cancelCurrentRun()
        gate.open()
        let outcome = await run.value
        XCTAssertEqual(outcome.result, .cancelled)
        XCTAssertTrue(try store.needsFullResync())
    }

    func testMarkerSurvivesAFailingApply() async throws {
        try store.setCursor("old")
        try store.requestFullResyncForTest()
        try installApplyTrap()
        api.enqueueSync(syncJSON(["notes": [noteJSON(id: "9", title: "boom")], "cursor": "new"]))
        _ = await engine.syncNow()
        XCTAssertTrue(try store.needsFullResync())
        XCTAssertEqual(try store.cursor(), "old")
    }

    func testAnIncrementalRunDoesNotClearTheMarkerSetAfterItsPullStarted() async throws {
        try store.setCursor("old")
        _ = await engine.syncNow()
        XCTAssertEqual(api.sinceLog, ["old"])
        XCTAssertFalse(try store.needsFullResync())
        try store.requestFullResyncForTest()
        XCTAssertTrue(try store.needsFullResync(), "setting the marker is not undone by apply/setCursor")
    }

    func testDiscardingAFailedUpdateLetsTheRowTakeTheServerValue() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try noteRow(serverId: "1")?.localId)
        try store.update(NoteRecord.self, localId: local) { $0.title = "rejected" }
        api.failNext("updateNote", .validation("nope"))
        _ = await engine.syncNow()
        let failed = try XCTUnwrap(store.failedOutbox().first)

        try store.discardOutboxEntry(id: failed.id)
        api.enqueueSync(try loadSync("sync-incremental"))
        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertNil(api.sinceLog.last!, "discard forces a full pull")
        XCTAssertEqual(try noteRow(serverId: "1")?.title, "Plan the week (v2)")
        XCTAssertFalse(try store.needsFullResync())
    }

    func testServerWinsConflictResolutionUsesTheMarkerAcrossAnOfflineRelaunch() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try noteRow(serverId: "1")?.localId)
        try store.update(NoteRecord.self, localId: local) { $0.title = "mine" }
        api.seed("note:1", updatedAt: try XCTUnwrap(loadSync("sync-incremental").notes.first).updatedAt)
        _ = await engine.syncNow()
        let conflict = try XCTUnwrap(store.unresolvedConflicts().first)
        api.enqueueSyncFailure(offline)
        _ = try await engine.resolveConflict(id: conflict.id, keepLocal: false)

        api.enqueueSync(try loadSync("sync-incremental"))
        _ = await makeEngine().syncNow()  // "relaunched" process

        XCTAssertNil(api.sinceLog.last!)
        XCTAssertEqual(try noteRow(serverId: "1")?.title, "Plan the week (v2)")
    }
}

final class AttemptBudgetTests: SyncTestCase {
    private func engine(maxAttempts: Int) -> SyncEngine {
        let store = self.store!
        return SyncEngine(store: store, api: api, maxAttempts: maxAttempts, serverID: { e, l in
            try store.dbQueue.read { try String.fetchOne($0, sql: "SELECT server_id FROM \(e.table) WHERE local_id = ?", arguments: [l]) }
        })
    }

    func testAnEntryThatKeepsGetting500IsParkedAfterTheBudgetAndLaterEntriesGoOut() async throws {
        let e = engine(maxAttempts: 3)
        _ = try store.create(NoteRecord(title: "poison"))
        _ = try store.create(NoteRecord(title: "fine"))
        api.failNext("createNote", .server(code: 500, message: "boom"), times: 3)

        for _ in 0..<2 {
            let o = await e.syncNow()
            guard case .failed = o.result else { return XCTFail("expected failed") }
            XCTAssertTrue(try store.failedOutbox().isEmpty)
        }
        let third = await e.syncNow()

        XCTAssertEqual(third.parked, 1)
        let failed = try store.failedOutbox()
        XCTAssertEqual(failed.count, 1)
        XCTAssertTrue(failed[0].lastError?.contains("after 3 attempts") == true, failed[0].lastError ?? "")
        XCTAssertEqual(third.pushed, 1, "the next entry went out in the same run")
        XCTAssertEqual(api.calls("createNote").map { $0.body?.objectString("title") }, ["poison", "poison", "poison", "fine"])
    }

    func testTransportErrorsNeverConsumeTheBudget() async throws {
        let e = engine(maxAttempts: 2)
        _ = try store.create(NoteRecord(title: "offline"))
        api.failNext("createNote", offline, times: 6)
        for _ in 0..<6 {
            let o = await e.syncNow()
            XCTAssertEqual(o.result, .offline)
        }
        XCTAssertTrue(try store.failedOutbox().isEmpty)
        XCTAssertEqual(try store.outbox().map(\.state), [.pending])
        let ok = await e.syncNow()
        XCTAssertEqual(ok.pushed, 1)
    }

    func testTheBudgetIsPerEntry() async throws {
        let e = engine(maxAttempts: 2)
        _ = try store.create(NoteRecord(title: "A"))
        _ = try store.create(NoteRecord(title: "B"))
        api.failNext("createNote", .rateLimited)  // A, attempt 1
        _ = await e.syncNow()
        api.failNext("createNote", .server(code: 503, message: "x"), times: 0)
        let second = await e.syncNow()  // A succeeds, B succeeds
        XCTAssertEqual(second.pushed, 2)
        XCTAssertTrue(try store.failedOutbox().isEmpty)
    }

    func testABlockedDependencyIsNotReportedAsFullSuccess() async throws {
        let ghost = LocalReference.make(localId: UUID().uuidString)
        try store.enqueue(
            entity: .item, op: .create, localId: "i",
            payload: .object(["kind": .string("task"), "title": .string("t"), "projectId": .string(ghost)])
        )
        let outcome = await engine.syncNow()
        guard case .failed(let message) = outcome.result else { return XCTFail("got \(outcome.result)") }
        XCTAssertTrue(message.contains("dependency"))
        XCTAssertTrue(outcome.pulled)
    }
}

extension LocalStore {
    /// The marker is normally set by the store; tests set it directly.
    func requestFullResyncForTest() throws {
        try dbQueue.write { try Self.markFullResync($0) }
    }
}
