import Foundation
import HusrevityModels
import HusrevityNetwork
import XCTest
@testable import HusrevityStore
@testable import HusrevitySync

private let offline = APIError.transport(URLError(.notConnectedToInternet))

final class PushPullTests: SyncTestCase {
    // MARK: offline write, reconnect

    func testOfflineWriteQueuesThenReconnectPushesInFifoOrderWithServerIds() async throws {
        let a = try store.create(NoteRecord(title: "A"))
        let b = try store.create(NoteRecord(title: "B"))
        api.failNext("createNote", offline)

        let first = await engine.syncNow()

        XCTAssertEqual(first.result, .offline)
        XCTAssertEqual(try store.outboxCount(), 2, "nothing was lost while offline")
        XCTAssertNil(try store.cursor())
        XCTAssertTrue(api.sinceLog.isEmpty, "no pull while offline")

        let second = await engine.syncNow()

        XCTAssertEqual(second.result, .synced)
        XCTAssertEqual(second.pushed, 2)
        let creates = api.calls("createNote")
        XCTAssertEqual(creates.count, 3, "one failed attempt for A, then A and B")
        XCTAssertEqual(creates.map { $0.body?.objectString("title") }, ["A", "A", "B"], "FIFO order")
        XCTAssertEqual(creates[0].key, creates[1].key, "retry reuses the Idempotency-Key")
        XCTAssertNotEqual(creates[1].key, creates[2].key)
        XCTAssertNotNil(try serverId(.note, localId: a.localId))
        XCTAssertNotNil(try serverId(.note, localId: b.localId))
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertEqual(try store.cursor(), "cursor-1")
    }

    func testCreateThenUpdateInOneRunPushesTheUpdateWithTheReturnedIdAndRebasedIfMatch() async throws {
        let note = try store.create(NoteRecord(title: "Draft"))
        try store.update(NoteRecord.self, localId: note.localId) { $0.title = "Final" }

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        let create = try XCTUnwrap(api.calls("createNote").first)
        let update = try XCTUnwrap(api.calls("updateNote").first)
        XCTAssertNil(create.ifMatch)
        XCTAssertEqual(update.id, "101", "the id the create returned")
        let createdAt = FakeSyncAPI.epoch.addingTimeInterval(1)
        XCTAssertEqual(update.ifMatch?.epochMilliseconds, createdAt.epochMilliseconds, "rebased on the create response")
        XCTAssertEqual(update.body?.objectString("title"), "Final")
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertEqual(try noteRow(serverId: "101")?.title, "Final")
    }

    func testCreateThenCompleteOfAnItemUsesTheReturnedId() async throws {
        let item = try store.create(ItemRecord(title: "Pay"))
        try store.completeItem(localId: item.localId)

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        let complete = try XCTUnwrap(api.calls("completeItem").first)
        XCTAssertEqual(complete.id, "101")
        XCTAssertEqual(complete.ifMatch?.epochMilliseconds, FakeSyncAPI.epoch.addingTimeInterval(1).epochMilliseconds)
        XCTAssertEqual(try store.items().first?.status, "done")
    }

    // MARK: lost responses

    func testResponseLostRetryUsesTheSameKeyAndLeavesExactlyOneRow() async throws {
        _ = try store.create(NoteRecord(title: "Once"))
        api.failNext("createNote", offline, applyFirst: true)

        let first = await engine.syncNow()
        XCTAssertEqual(first.result, .offline)
        XCTAssertEqual(api.appliedCount("createNote"), 1, "the server did apply it")

        let second = await engine.syncNow()
        XCTAssertEqual(second.result, .synced)

        let creates = api.calls("createNote")
        XCTAssertEqual(creates.count, 2)
        XCTAssertEqual(creates[0].key, creates[1].key)
        XCTAssertEqual(api.appliedCount("createNote"), 1, "replayed, not applied twice")
        XCTAssertEqual(try store.notes().count, 1)
        XCTAssertEqual(try store.notes().first?.serverId, "101")
    }

    func testMalformedSuccessIsRetriedWithTheSameKeyAndDoesNotDuplicateThePulledCopy() async throws {
        let local = try store.create(NoteRecord(title: "Twice?"))
        api.failNext("createNote", .malformedSuccess(httpStatus: 201), applyFirst: true)
        // The pull that follows the failed push already sees the note the server created.
        api.enqueueSync(syncJSON(["notes": [noteJSON(id: "101", title: "Twice?")], "cursor": "c-after-lost"]))

        let first = await engine.syncNow()

        guard case .failed = first.result else { return XCTFail("expected failed, got \(first.result)") }
        XCTAssertEqual(try store.outboxCount(), 1, "entry back in the queue")
        XCTAssertEqual(try store.outbox().first?.state, .pending)
        XCTAssertEqual(try store.notes().count, 2, "pending local row plus the pulled copy")

        let second = await engine.syncNow()

        XCTAssertEqual(second.result, .synced)
        let creates = api.calls("createNote")
        XCTAssertEqual(creates.count, 2)
        XCTAssertEqual(creates[0].key, creates[1].key)
        let notes = try store.notes()
        XCTAssertEqual(notes.count, 1, "the duplicate was folded into the local row")
        XCTAssertEqual(notes.first?.localId, local.localId)
        XCTAssertEqual(notes.first?.serverId, "101")
    }

    // MARK: retryable failures

    func testServerErrorRequeuesStopsPushStillPullsAndReportsFailure() async throws {
        _ = try store.create(NoteRecord(title: "A"))
        _ = try store.create(NoteRecord(title: "B"))
        api.failNext("createNote", .server(code: 503, message: "down"))

        let outcome = await engine.syncNow()

        guard case .failed = outcome.result else { return XCTFail("expected failed, got \(outcome.result)") }
        XCTAssertEqual(api.calls("createNote").count, 1, "push phase stopped at the first retryable failure")
        XCTAssertEqual(try store.outbox().map(\.state), [.pending, .pending])
        XCTAssertEqual(api.sinceLog.count, 1, "a non-transport failure still pulls")
    }

    func testRateLimitedAndTimeoutAreRetryable() async throws {
        _ = try store.create(NoteRecord(title: "A"))
        api.failNext("createNote", .rateLimited)
        api.failNext("createNote", .server(code: 408, message: "timeout"))

        for _ in 0..<2 {
            let outcome = await engine.syncNow()
            guard case .failed = outcome.result else { return XCTFail("expected failed, got \(outcome.result)") }
            XCTAssertEqual(try store.outbox().first?.state, .pending)
        }
        let done = await engine.syncNow()
        XCTAssertEqual(done.result, .synced)
        let keys = Set(api.calls("createNote").compactMap(\.key))
        XCTAssertEqual(keys.count, 1, "never regenerates the key")
    }

    // MARK: cursor

    func testCursorIsNotAdvancedWhenApplyFails() async throws {
        try store.setCursor("old")
        try installApplyTrap()
        api.enqueueSync(syncJSON(["notes": [noteJSON(id: "9", title: "boom")], "cursor": "new"]))

        let outcome = await engine.syncNow()

        guard case .failed = outcome.result else { return XCTFail("expected failed, got \(outcome.result)") }
        XCTAssertEqual(try store.cursor(), "old")
        XCTAssertFalse(outcome.pulled)
    }

    func testCursorAdvancesOnlyAfterASuccessfulApply() async throws {
        api.enqueueSync(syncJSON(["notes": [noteJSON(id: "9", title: "ok")], "cursor": "new"]))

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertTrue(outcome.pulled)
        XCTAssertEqual(try store.cursor(), "new")
        XCTAssertEqual(try noteRow(serverId: "9")?.title, "ok")
    }

    func testPullSendsTheStoredCursor() async throws {
        try store.setCursor("abc")
        _ = await engine.syncNow()
        XCTAssertEqual(api.sinceLog, ["abc"])
    }

    func testOfflinePullFailureLeavesTheCursorAlone() async throws {
        try store.setCursor("old")
        api.enqueueSyncFailure(offline)

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .offline)
        XCTAssertEqual(try store.cursor(), "old")
    }

    // MARK: session expiry

    func testSessionExpiryDuringPushStopsTheRunAndKeepsTheOutboxIntact() async throws {
        _ = try store.create(NoteRecord(title: "A"))
        _ = try store.create(NoteRecord(title: "B"))
        api.failNext("createNote", .unauthorized)

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .sessionExpired)
        XCTAssertEqual(api.calls("createNote").count, 1)
        XCTAssertTrue(api.sinceLog.isEmpty, "no pull after the session expired")
        XCTAssertEqual(try store.outbox().map(\.state), [.pending, .pending])
        XCTAssertEqual(try store.outboxCount(), 2)
    }

    func testSessionExpiryDuringPullIsReported() async throws {
        api.enqueueSyncFailure(.unauthorized)
        let outcome = await engine.syncNow()
        XCTAssertEqual(outcome.result, .sessionExpired)
    }

    // MARK: crash recovery

    func testInflightEntriesFromAPreviousRunAreRetried() async throws {
        _ = try store.create(NoteRecord(title: "Crashed"))
        let entry = try XCTUnwrap(store.nextPending())
        try store.markInflight(entry.id)
        XCTAssertNil(try store.nextPending(), "inflight entries are invisible to the queue")

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(api.calls("createNote").first?.key, entry.idempotencyKey, "same key as the crashed attempt")
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    // MARK: ordering

    func testDeferredTombstonesAreSettledAfterThePush() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try noteRow(serverId: "1")?.localId)
        try store.update(NoteRecord.self, localId: local) { $0.title = "edited" }
        try store.apply(sync: syncJSON(["tombstones": ["notes": ["1"]]]))  // deferred: row has a queued edit
        XCTAssertEqual(try count("note", where: "pending_tombstone = 1"), 1)
        api.deleteOnServer("note:1")  // the push will 404 and discard the row

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertNil(try noteRow(serverId: "1"))
        XCTAssertEqual(try count("note", where: "pending_tombstone = 1"), 0)
    }
}

extension JSONValue {
    func objectString(_ key: String) -> String? {
        if case .object(let o) = self, case .string(let s)? = o[key] { return s }
        return nil
    }
}
