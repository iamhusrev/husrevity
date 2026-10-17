import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

final class ConflictTests: StoreTestCase {
    private let serverUpdatedAt = "2026-10-18T10:00:00.500Z"
    private var serverUpdatedAtMs: Int64 { Wire.parseDate(serverUpdatedAt)!.epochMilliseconds }

    /// A synced "Run" whose rejected local rename was parked as a failed outbox entry, then
    /// recorded as a conflict (the state the Sync phase leaves behind after a 409).
    private func conflictedRun() throws -> (run: ItemRecord, conflict: ConflictRecord, failedEntryId: Int64) {
        try store.apply(sync: syncFull())
        let run = try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == "Run").fetchOne($0) })
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "Run (mine)" }
        let entry = try XCTUnwrap(store.nextPending())
        try store.markInflight(entry.id)
        try store.markFailed(entry.id, error: "409")
        // Server wins locally: the row shows the server version again.
        try store.dbQueue.write { try $0.execute(sql: "UPDATE item SET title = 'Run (server)' WHERE local_id = ?", arguments: [run.localId]) }
        let conflict = try store.recordConflict(
            entity: .item, localId: run.localId, localPayload: entry.payload,
            serverPayload: .object(["id": .string("1"), "title": .string("Run (server)"), "updatedAt": .string(serverUpdatedAt)])
        )
        return (run, conflict, entry.id)
    }

    func testRecordedConflictsAreListedUntilResolved() throws {
        XCTAssertEqual(try store.unresolvedConflicts(), [])
        let (run, conflict, _) = try conflictedRun()

        let listed = try store.unresolvedConflicts()
        XCTAssertEqual(listed.map(\.id), [conflict.id])
        XCTAssertEqual(listed[0].entity, .item)
        XCTAssertEqual(listed[0].localId, run.localId)
        XCTAssertEqual(listed[0].localPayload, .object(["title": .string("Run (mine)")]))
        XCTAssertNil(listed[0].resolvedAt)
    }

    func testDiscardDropsTheLocalChangeAndKeepsTheServerVersion() throws {
        let (run, conflict, failedId) = try conflictedRun()

        try store.resolveConflict(id: conflict.id, keepLocal: false)

        XCTAssertEqual(try store.unresolvedConflicts(), [])
        XCTAssertNil(try store.outboxEntry(id: failedId))
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) }?.title, "Run (server)")
        // With the entry gone the row follows the server again.
        var sync = try syncFull()
        sync.items[0].title = "Run (server v2)"
        try store.apply(sync: sync)
        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) }?.title, "Run (server v2)")
    }

    func testKeepLocalReEnqueuesTheChangeAgainstTheServersUpdatedAt() throws {
        let (run, conflict, failedId) = try conflictedRun()
        let failedKey = try XCTUnwrap(store.outboxEntry(id: failedId)).idempotencyKey

        try store.resolveConflict(id: conflict.id, keepLocal: true)

        XCTAssertEqual(try store.unresolvedConflicts(), [])
        let entry = try XCTUnwrap(store.nextPending())
        XCTAssertEqual(entry.id, failedId, "the rejected entry is replaced in the same queue slot")
        XCTAssertEqual(try store.outboxCount(), 1)
        XCTAssertEqual(entry.op, .update)
        XCTAssertEqual(entry.localId, run.localId)
        XCTAssertEqual(entry.payload, .object(["title": .string("Run (mine)")]))
        XCTAssertEqual(entry.baseUpdatedAtMs, serverUpdatedAtMs)
        XCTAssertNotEqual(entry.idempotencyKey, failedKey)
        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) }?.title, "Run (mine)")
    }

    func testKeepLocalOfADeleteHidesTheRowAndQueuesTheDelete() throws {
        try store.apply(sync: syncFull())
        let rent = try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == "Pay rent").fetchOne($0) })
        let conflict = try store.recordConflict(
            entity: .item, localId: rent.localId, op: .delete, localPayload: .object([:]),
            serverPayload: .object(["updatedAt": .string(serverUpdatedAt)])
        )

        try store.resolveConflict(id: conflict.id, keepLocal: true)

        let entry = try XCTUnwrap(store.nextPending())
        XCTAssertEqual(entry.op, .delete)
        XCTAssertEqual(entry.baseUpdatedAtMs, serverUpdatedAtMs)
        XCTAssertEqual(try count("item", where: "local_id = '\(rent.localId)' AND deleted_locally = 1"), 1)
    }

    func testKeepLocalOfNoteTagChangesRestoresTheAssignments() throws {
        try store.apply(sync: syncFull())
        let note = try XCTUnwrap(store.dbQueue.read { try NoteRecord.fetchOne($0) })
        let tag = try XCTUnwrap(store.dbQueue.read { try NoteTagRecord.fetchOne($0) })
        let serverTagId = try XCTUnwrap(tag.serverId)
        // Server version has no tags; the local change had the tag.
        try store.dbQueue.write { try $0.execute(sql: "DELETE FROM note_tag_assignment") }
        let conflict = try store.recordConflict(
            entity: .note, localId: note.localId,
            localPayload: .object(["title": .string("Mine"), "tagIds": .array([.string(serverTagId)])]),
            serverPayload: .object(["updatedAt": .string(serverUpdatedAt)])
        )

        try store.resolveConflict(id: conflict.id, keepLocal: true)

        let reloaded = try store.dbQueue.read { try NoteRecord.load($0, localId: note.localId) }
        XCTAssertEqual(reloaded?.title, "Mine")
        XCTAssertEqual(reloaded?.tagIds, [tag.localId])
        XCTAssertEqual(try store.nextPending()?.baseUpdatedAtMs, serverUpdatedAtMs)
    }

    func testResolvingTwiceDoesNotEnqueueTwice() throws {
        let (_, conflict, _) = try conflictedRun()
        try store.resolveConflict(id: conflict.id, keepLocal: true)
        try store.resolveConflict(id: conflict.id, keepLocal: true)
        XCTAssertEqual(try store.outboxCount(), 1)
    }

    func testResolvingAnUnknownConflictThrows() throws {
        XCTAssertThrowsError(try store.resolveConflict(id: 999, keepLocal: true))
    }
}
