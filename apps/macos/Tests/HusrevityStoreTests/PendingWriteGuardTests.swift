import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

/// A row with a queued local change must survive a pull: local wins until the change is pushed.
final class PendingWriteGuardTests: StoreTestCase {
    private func item(titled title: String) throws -> ItemRecord {
        try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == title).fetchOne($0) })
    }

    /// The full sync with item 1 renamed on the server.
    private func syncWithRenamedRun(to title: String) throws -> SyncResponse {
        var sync = try syncFull()
        sync.items[0].title = title
        return sync
    }

    func testAPullDoesNotOverwriteARowWithAPendingEntry() throws {
        try store.apply(sync: syncFull())
        let run = try item(titled: "Run")
        try store.enqueue(entity: .item, op: .update, localId: run.localId)

        try store.apply(sync: syncWithRenamedRun(to: "Run (server)"))

        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) }?.title, "Run")
    }

    func testAnInflightEntryProtectsTheRowToo() throws {
        try store.apply(sync: syncFull())
        let run = try item(titled: "Run")
        let entry = try store.enqueue(entity: .item, op: .update, localId: run.localId)
        try store.markInflight(entry.id)

        try store.apply(sync: syncWithRenamedRun(to: "Run (server)"))

        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) }?.title, "Run")
    }

    func testAFailedEntryStillProtectsTheRow() throws {
        try store.apply(sync: syncFull())
        let run = try item(titled: "Run")
        let entry = try store.enqueue(entity: .item, op: .update, localId: run.localId)
        try store.markFailed(entry.id)

        try store.apply(sync: syncWithRenamedRun(to: "Run (server)"))

        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) }?.title, "Run")
    }

    func testOtherRowsStillUpdateWhileOneIsProtected() throws {
        try store.apply(sync: syncFull())
        let run = try item(titled: "Run")
        try store.enqueue(entity: .item, op: .update, localId: run.localId)
        var sync = try syncWithRenamedRun(to: "Run (server)")
        sync.items[1].title = "Pay rent (server)"

        try store.apply(sync: sync)

        XCTAssertEqual(try item(titled: "Run").localId, run.localId)
        XCTAssertNoThrow(try item(titled: "Pay rent (server)"))
    }

    func testOnceTheEntryIsDoneThePullOverwritesAgain() throws {
        try store.apply(sync: syncFull())
        let run = try item(titled: "Run")
        let entry = try store.enqueue(entity: .item, op: .update, localId: run.localId)
        try store.markDone(entry.id)

        try store.apply(sync: syncWithRenamedRun(to: "Run (server)"))

        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) }?.title, "Run (server)")
    }

    func testATombstoneForAProtectedRowIsDeferred() throws {
        try store.apply(sync: syncFull())
        let rent = try item(titled: "Pay rent")
        try store.enqueue(entity: .item, op: .update, localId: rent.localId)

        try store.apply(sync: syncIncremental())

        XCTAssertNotNil(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: rent.localId) })
        XCTAssertEqual(try count("item_occurrence"), 0, "unprotected tombstones still apply")
    }

    func testAProtectedNoteKeepsItsTagsWhenAPullResendsItWithoutThem() throws {
        try store.apply(sync: syncFull())
        let note = try XCTUnwrap(store.dbQueue.read { try NoteRecord.fetchOne($0) })
        try store.enqueue(entity: .note, op: .update, localId: note.localId)

        try store.apply(sync: syncIncremental())

        XCTAssertEqual(try store.dbQueue.read { try NoteRecord.fetchOne($0, key: note.localId) }?.title, "Plan the week")
        XCTAssertEqual(try count("note_tag_assignment"), 0, "the tag itself was tombstoned and removed")
    }

    func testACompletePendingForAnOccurrenceProtectsItFromThePull() throws {
        try store.apply(sync: syncFull())
        let run = try item(titled: "Run")
        let occurrence = try XCTUnwrap(store.dbQueue.read { try ItemOccurrenceRecord.fetchOne($0) })
        try store.dbQueue.write {
            var done = occurrence
            done.status = "done"
            try done.update($0)
        }
        try store.enqueue(
            entity: .item, op: .complete, localId: run.localId,
            payload: .object(["occursOn": .string(occurrence.occursOn)])
        )

        try store.apply(sync: syncFull())

        XCTAssertEqual(
            try store.dbQueue.read { try ItemOccurrenceRecord.fetchOne($0, key: occurrence.localId) }?.status, "done"
        )
    }
}
