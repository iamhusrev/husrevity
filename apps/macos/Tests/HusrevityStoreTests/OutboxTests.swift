import HusrevityModels
import XCTest
@testable import HusrevityStore

final class OutboxTests: StoreTestCase {
    func testEnqueueStoresKeyBaseAndPayload() throws {
        let entry = try store.enqueue(
            entity: .item, op: .update, localId: "L1",
            payload: .object(["title": .string("x")]), baseUpdatedAtMs: 1_760_000_000_123,
            idempotencyKey: "key-1"
        )
        let stored = try XCTUnwrap(store.outboxEntry(id: entry.id))
        XCTAssertEqual(stored.entity, .item)
        XCTAssertEqual(stored.op, .update)
        XCTAssertEqual(stored.localId, "L1")
        XCTAssertEqual(stored.payload, .object(["title": .string("x")]))
        XCTAssertEqual(stored.idempotencyKey, "key-1")
        XCTAssertEqual(stored.baseUpdatedAtMs, 1_760_000_000_123)
        XCTAssertEqual(stored.state, .pending)
        XCTAssertEqual(stored.attempts, 0)
    }

    func testEnqueueGeneratesADistinctIdempotencyKeyByDefault() throws {
        let a = try store.enqueue(entity: .note, op: .create, localId: "a")
        let b = try store.enqueue(entity: .note, op: .create, localId: "b")
        XCTAssertNotEqual(a.idempotencyKey, b.idempotencyKey)
        XCTAssertFalse(a.idempotencyKey.isEmpty)
    }

    func testDuplicateIdempotencyKeyIsRejected() throws {
        try store.enqueue(entity: .note, op: .create, localId: "a", idempotencyKey: "same")
        XCTAssertThrowsError(try store.enqueue(entity: .note, op: .create, localId: "b", idempotencyKey: "same"))
        XCTAssertEqual(try store.outboxCount(), 1)
    }

    func testNextPendingIsFifo() throws {
        let first = try store.enqueue(entity: .item, op: .create, localId: "1")
        let second = try store.enqueue(entity: .item, op: .create, localId: "2")
        XCTAssertEqual(try store.nextPending()?.id, first.id)
        try store.markDone(first.id)
        XCTAssertEqual(try store.nextPending()?.id, second.id)
        try store.markDone(second.id)
        XCTAssertNil(try store.nextPending())
    }

    func testNextPendingSkipsInflightAndFailedEntries() throws {
        let a = try store.enqueue(entity: .item, op: .create, localId: "1")
        let b = try store.enqueue(entity: .item, op: .create, localId: "2")
        let c = try store.enqueue(entity: .item, op: .create, localId: "3")
        try store.markInflight(a.id)
        try store.markFailed(b.id, error: "boom")
        XCTAssertEqual(try store.nextPending()?.id, c.id)
    }

    func testMarkInflightIncrementsAttemptsEachTime() throws {
        let e = try store.enqueue(entity: .item, op: .create, localId: "1")
        try store.markInflight(e.id)
        XCTAssertEqual(try store.outboxEntry(id: e.id)?.state, .inflight)
        XCTAssertEqual(try store.outboxEntry(id: e.id)?.attempts, 1)
        try store.requeue(e.id)
        XCTAssertEqual(try store.outboxEntry(id: e.id)?.state, .pending)
        try store.markInflight(e.id)
        XCTAssertEqual(try store.outboxEntry(id: e.id)?.attempts, 2)
    }

    func testMarkFailedKeepsTheEntryWithItsError() throws {
        let e = try store.enqueue(entity: .item, op: .create, localId: "1")
        try store.markInflight(e.id)
        try store.markFailed(e.id, error: "HTTP 422")
        let stored = try XCTUnwrap(store.outboxEntry(id: e.id))
        XCTAssertEqual(stored.state, .failed)
        XCTAssertEqual(stored.lastError, "HTTP 422")
        XCTAssertEqual(stored.attempts, 1)
        XCTAssertEqual(try store.outboxCount(), 1)
    }

    func testMarkDoneRemovesTheEntry() throws {
        let e = try store.enqueue(entity: .item, op: .create, localId: "1")
        try store.markDone(e.id)
        XCTAssertNil(try store.outboxEntry(id: e.id))
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    func testResetInflightToPendingRecoversFromACrashAndKeepsAttempts() throws {
        let a = try store.enqueue(entity: .item, op: .create, localId: "1")
        let b = try store.enqueue(entity: .item, op: .create, localId: "2")
        try store.markInflight(a.id)
        try store.markFailed(b.id)
        try store.resetInflightToPending()
        XCTAssertEqual(try store.outboxEntry(id: a.id)?.state, .pending)
        XCTAssertEqual(try store.outboxEntry(id: a.id)?.attempts, 1)
        XCTAssertEqual(try store.outboxEntry(id: b.id)?.state, .failed, "failed entries stay failed")
        XCTAssertEqual(try store.nextPending()?.id, a.id)
    }

    func testOutboxListsEntriesInQueueOrder() throws {
        let ids = try (1...3).map { try store.enqueue(entity: .goal, op: .create, localId: "\($0)").id }
        XCTAssertEqual(try store.outbox().map(\.id), ids)
    }
}
