import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

final class ConflictDiscardTests: StoreTestCase {
    private let serverUpdatedAt = "2026-10-18T10:00:00.500Z"
    private var serverMs: Int64 { Wire.parseDate(serverUpdatedAt)!.epochMilliseconds }

    private func pulled(_ title: String) throws -> ItemRecord {
        try store.apply(sync: syncFull())
        return try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == title).fetchOne($0) })
    }

    private func fail(_ entry: OutboxEntry) throws {
        try store.markInflight(entry.id)
        try store.markFailed(entry.id, error: "409")
    }

    // MARK: serverId(entity:localId:)

    func testServerIdOfANormalRow() throws {
        let run = try pulled("Run")
        XCTAssertEqual(try store.serverId(entity: .item, localId: run.localId), run.serverId)
    }

    func testServerIdOfALocallyDeletedRowIsStillResolvable() throws {
        let run = try pulled("Run")
        try store.delete(ItemRecord.self, localId: run.localId)
        XCTAssertEqual(try store.items().map(\.title), ["Pay rent"], "hidden from reads")
        XCTAssertEqual(try store.serverId(entity: .item, localId: run.localId), run.serverId)
    }

    func testServerIdIsNilForUnpushedAndUnknownRows() throws {
        let created = try store.create(ItemRecord(title: "x"))
        XCTAssertNil(try store.serverId(entity: .item, localId: created.localId))
        XCTAssertNil(try store.serverId(entity: .item, localId: "nope"))
        XCTAssertNil(try store.serverId(entity: .project, localId: created.localId), "other entity table")
    }

    // MARK: discard = server wins for the whole row

    func testDiscardDropsEveryQueuedEntryOfTheRowAndTheNextPullOverwritesIt() throws {
        let run = try pulled("Run")
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "A" }
        try store.update(ItemRecord.self, localId: run.localId) { $0.notes = "B" }
        let first = try XCTUnwrap(store.nextPending())
        try fail(first)
        let c1 = try store.recordConflict(entity: .item, localId: run.localId, localPayload: first.payload, serverPayload: .object([:]))
        try store.recordConflict(entity: .item, localId: run.localId, localPayload: .object([:]), serverPayload: .object([:]))
        // an unrelated row keeps its entry and conflict
        let rent = try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == "Pay rent").fetchOne($0) })
        try store.update(ItemRecord.self, localId: rent.localId) { $0.title = "keep" }
        try store.recordConflict(entity: .item, localId: rent.localId, localPayload: .object([:]), serverPayload: .object([:]))

        try store.resolveConflict(id: c1.id, keepLocal: false)

        XCTAssertEqual(try store.outbox().map(\.localId), [rent.localId])
        XCTAssertEqual(try store.unresolvedConflicts().map(\.localId), [rent.localId])

        var sync = try syncFull()
        sync.items[0].title = "Run (server)"
        sync.items[0].notes = "server notes"
        try store.apply(sync: sync)
        let row = try XCTUnwrap(store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) })
        XCTAssertEqual(row.title, "Run (server)")
        XCTAssertEqual(row.notes, "server notes")
    }

    func testDiscardWithAnInflightEntryThrowsAndChangesNothing() throws {
        let run = try pulled("Run")
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "A" }
        try store.update(ItemRecord.self, localId: run.localId) { $0.notes = "B" }
        let all = try store.outbox()
        try fail(all[0])
        try store.markInflight(all[1].id)
        let conflict = try store.recordConflict(entity: .item, localId: run.localId, localPayload: .object([:]), serverPayload: .object([:]))

        XCTAssertThrowsError(try store.resolveConflict(id: conflict.id, keepLocal: false)) {
            XCTAssertEqual($0 as? StoreError, .entryInFlight(entity: .item, localId: run.localId))
        }
        XCTAssertEqual(try store.outboxCount(), 2)
        XCTAssertEqual(try store.unresolvedConflicts().count, 1)
    }

    func testDiscardOfADeleteConflictUnhidesTheRowEvenWithLaterEntries() throws {
        let run = try pulled("Run")
        try store.delete(ItemRecord.self, localId: run.localId)
        let entry = try XCTUnwrap(store.nextPending())
        try fail(entry)
        let conflict = try store.recordConflict(entity: .item, localId: run.localId, op: .delete, localPayload: .object([:]), serverPayload: .object([:]))
        try store.resolveConflict(id: conflict.id, keepLocal: false)
        XCTAssertEqual(Set(try store.items().map(\.title)), ["Run", "Pay rent"])
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    func testDiscardOfAConflictOnANeverPushedCreateDropsTheRowAndDependentReferences() throws {
        let project = try store.create(ProjectRecord(code: "P", name: "P"))
        let item = try store.create(ItemRecord(title: "I", projectId: project.reference))
        try fail(try XCTUnwrap(store.nextPending()))
        let conflict = try store.recordConflict(
            entity: .project, localId: project.localId, op: .create, localPayload: .object([:]), serverPayload: .object([:])
        )

        try store.resolveConflict(id: conflict.id, keepLocal: false)

        XCTAssertEqual(try count("project"), 0)
        XCTAssertEqual(try store.outbox().map(\.localId), [item.localId])
        XCTAssertFalse(String(describing: try store.outbox()[0].payload).contains("local:"))
        XCTAssertNil(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: item.localId) }?.projectId)
    }

    // MARK: keep local still works and rebases

    func testKeepLocalKeepsQueueOrderAndRebasesTheLaterEntries() throws {
        let run = try pulled("Run")
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "A" }
        try store.update(ItemRecord.self, localId: run.localId) { $0.notes = "B" }
        let all = try store.outbox()
        try fail(all[0])
        let conflict = try store.recordConflict(
            entity: .item, localId: run.localId, localPayload: all[0].payload,
            serverPayload: .object(["updatedAt": .string(serverUpdatedAt)])
        )

        try store.resolveConflict(id: conflict.id, keepLocal: true)

        let queue = try store.outbox()
        XCTAssertEqual(queue.count, 2)
        XCTAssertEqual(queue[0].payload, all[0].payload, "the re-applied change keeps its place in the queue")
        XCTAssertEqual(queue[1].id, all[1].id)
        XCTAssertEqual(queue.map(\.baseUpdatedAtMs), [serverMs, serverMs])
        XCTAssertEqual(queue[0].state, .pending)
        XCTAssertNotEqual(queue[0].idempotencyKey, all[0].idempotencyKey)
        XCTAssertEqual(try store.nextPending()?.id, queue[0].id)
    }
}
