import Foundation
import GRDB
import HusrevityModels
import HusrevityNetwork
import XCTest
@testable import HusrevityStore
@testable import HusrevitySync

final class ErrorHandlingTests: SyncTestCase {
    // MARK: 404

    func testDelete404CountsAsSuccess() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try noteRow(serverId: "1")?.localId)
        try store.delete(NoteRecord.self, localId: local)
        api.deleteOnServer("note:1")

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(outcome.pushed, 1)
        XCTAssertEqual(outcome.parked, 0)
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertEqual(try count("note", where: "server_id = '1'"), 0, "the soft-deleted row is gone for good")
    }

    func testUpdate404DiscardsTheLocalRow() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try noteRow(serverId: "1")?.localId)
        try store.update(NoteRecord.self, localId: local) { $0.title = "doomed" }
        api.deleteOnServer("note:1")

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertNil(try noteRow(serverId: "1"))
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertTrue(try store.failedOutbox().isEmpty)
    }

    func testComplete404DiscardsTheLocalItem() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try store.items().first { $0.serverId == "2" }?.localId)
        try store.completeItem(localId: local)
        api.deleteOnServer("item:2")

        _ = await engine.syncNow()

        XCTAssertNil(try store.items().first { $0.serverId == "2" })
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    // MARK: permanent errors

    func testValidationErrorParksTheEntryAndDoesNotBlockUnrelatedRows() async throws {
        _ = try store.create(NoteRecord(title: "bad"))
        let good = try store.create(NoteRecord(title: "good"))
        api.failNext("createNote", .validation("title too long"))

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(outcome.parked, 1)
        XCTAssertEqual(outcome.pushed, 1)
        let failed = try store.failedOutbox()
        XCTAssertEqual(failed.count, 1)
        XCTAssertTrue(failed[0].lastError?.contains("title too long") == true)
        XCTAssertNotNil(try serverId(.note, localId: good.localId))

        _ = await engine.syncNow()
        XCTAssertEqual(api.calls("createNote").count, 2, "the parked entry is not retried automatically")
    }

    func testAFailedCreateBlocksItsDependentsButNotOtherRows() async throws {
        let a = try store.create(NoteRecord(title: "A"))
        try store.update(NoteRecord.self, localId: a.localId) { $0.title = "A2" }
        let project = try store.create(ProjectRecord(code: "P", name: "P"))
        _ = try store.create(ItemRecord(title: "in project", projectId: project.reference))
        _ = try store.create(NoteRecord(title: "C"))
        api.failNext("createNote", .validation("nope"))
        api.failNext("createProject", .validation("nope"))

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.parked, 2)
        XCTAssertEqual(api.calls("updateNote").count, 0, "A's update is blocked behind its failed create")
        XCTAssertEqual(api.calls("createItem").count, 0, "the item references the failed project")
        XCTAssertEqual(api.calls("createNote").map { $0.body?.objectString("title") }, ["A", "C"])
        XCTAssertEqual(try store.failedOutbox().count, 2)
        XCTAssertEqual(try store.outboxCount(), 4)
    }

    func testOtherPermanent4xxParksTheEntry() async throws {
        _ = try store.create(NoteRecord(title: "forbidden"))
        api.failNext("createNote", .server(code: 403, message: "no"))

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.parked, 1)
        XCTAssertEqual(try store.failedOutbox().count, 1)
    }

    func testAnUnreadablePayloadParksTheEntry() async throws {
        try store.enqueue(entity: .note, op: .create, localId: "x", payload: .object(["bodyMarkdown": .string("no title")]))

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.parked, 1)
        XCTAssertEqual(api.writeCalls.count, 0)
    }

    func testAnUpdateForARowWithoutAServerIdIsParkedNotDropped() async throws {
        try store.enqueue(entity: .note, op: .update, localId: "ghost", payload: .object(["title": .string("t")]))

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.parked, 1)
        XCTAssertEqual(try store.failedOutbox().count, 1)
    }

    // MARK: dependencies

    func testAnEntryWithAnUnpushedReferenceIsRequeuedWithoutHotLooping() async throws {
        let ghost = LocalReference.make(localId: UUID().uuidString)
        try store.enqueue(
            entity: .item, op: .create, localId: "i",
            payload: .object(["kind": .string("task"), "title": .string("t"), "projectId": .string(ghost)])
        )

        let outcome = await engine.syncNow()

        guard case .failed = outcome.result else { return XCTFail("got \(outcome.result)") }
        XCTAssertEqual(api.writeCalls.count, 0, "never sent with a placeholder")
        XCTAssertEqual(try store.outbox().map(\.state), [.pending])
        XCTAssertTrue(outcome.pulled, "the rest of the run continues")
    }

    // MARK: store failure after the server accepted

    func testAStoreFailureAfterTheServerAcceptedKeepsTheEntryAndReplaysWithTheSameKey() async throws {
        _ = try store.create(NoteRecord(title: "tricky"))
        try execute("CREATE TRIGGER stuck BEFORE DELETE ON outbox BEGIN SELECT RAISE(ABORT, 'locked'); END")

        let first = await engine.syncNow()

        guard case .failed = first.result else { return XCTFail("expected failed, got \(first.result)") }
        XCTAssertEqual(try store.outbox().map(\.state), [.pending], "requeued, not stuck inflight")

        try execute("DROP TRIGGER stuck")
        let second = await engine.syncNow()

        XCTAssertEqual(second.result, .synced)
        let creates = api.calls("createNote")
        XCTAssertEqual(creates.count, 2)
        XCTAssertEqual(creates[0].key, creates[1].key)
        XCTAssertEqual(api.appliedCount("createNote"), 1)
        XCTAssertEqual(try store.notes().count, 1)
    }

    // MARK: cancellation

    func testCancellationRequeuesTheInflightEntryAndDoesNotPull() async throws {
        _ = try store.create(NoteRecord(title: "slow"))
        let gate = ManualGate()
        api.setGate(gate)

        let run = Task { await engine.syncNow() }
        await gate.waitForArrivals(1)
        XCTAssertEqual(try store.outbox().map(\.state), [.inflight])
        await engine.cancelCurrentRun()
        gate.open()
        let outcome = await run.value

        XCTAssertEqual(outcome.result, .cancelled)
        XCTAssertEqual(try store.outbox().map(\.state), [.pending])
        XCTAssertTrue(api.sinceLog.isEmpty)
        XCTAssertNil(try store.cursor())
    }
}
