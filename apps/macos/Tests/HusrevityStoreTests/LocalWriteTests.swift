import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

final class LocalWriteTests: StoreTestCase {
    private func body(_ entry: OutboxEntry) -> [String: JSONValue] {
        guard case .object(let o) = entry.payload else { return [:] }
        return o
    }

    private func pulledItem(_ title: String) throws -> (ItemRecord, ItemDTO) {
        let sync = try syncFull()
        try store.apply(sync: sync)
        let record = try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == title).fetchOne($0) })
        return (record, try XCTUnwrap(sync.items.first { $0.title == title }))
    }

    // MARK: create

    func testCreateAssignsALocalIdStoresTheRowAndEnqueuesACreate() throws {
        let created = try store.create(ItemRecord(localId: "caller-chosen", serverId: "99", title: "Buy milk"))

        XCTAssertNotEqual(created.localId, "caller-chosen", "the store assigns the local id")
        XCTAssertNotNil(UUID(uuidString: created.localId))
        XCTAssertNil(created.serverId)
        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: created.localId) }?.title, "Buy milk")

        let entry = try XCTUnwrap(store.nextPending())
        XCTAssertEqual(entry.entity, .item)
        XCTAssertEqual(entry.op, .create)
        XCTAssertEqual(entry.localId, created.localId)
        XCTAssertFalse(entry.idempotencyKey.isEmpty)
        XCTAssertNil(entry.baseUpdatedAtMs)
        XCTAssertEqual(body(entry)["title"], .string("Buy milk"))
        XCTAssertEqual(body(entry)["kind"], .string("task"))
        XCTAssertNil(body(entry)["id"])
        XCTAssertNil(body(entry)["localId"])
    }

    func testCreateOfEveryEntityKind() throws {
        try store.create(GoalRecord(title: "G", horizon: "year", periodStart: "2026-01-01", periodEnd: "2026-12-31"))
        try store.create(ProjectRecord(code: "P", name: "P"))
        try store.create(NoteTagRecord(name: "t", color: "#fff"))
        try store.create(NoteRecord(title: "n"))
        try store.create(ItemRecord(title: "i"))
        XCTAssertEqual(try store.outbox().map(\.entity), [.goal, .project, .noteTag, .note, .item])
        XCTAssertEqual(try store.outbox().map(\.op), Array(repeating: .create, count: 5))
    }

    func testCreatedNoteStoresItsTagAssignments() throws {
        let tag = try store.create(NoteTagRecord(name: "work"))
        let note = try store.create(NoteRecord(title: "n", tagIds: [tag.localId]))
        XCTAssertEqual(try count("note_tag_assignment", where: "note_local_id = '\(note.localId)'"), 1)
    }

    func testCreateAndEnqueueAreAtomic() throws {
        try store.dbQueue.write {
            try $0.execute(sql: "CREATE TRIGGER no_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'no'); END")
        }
        XCTAssertThrowsError(try store.create(ItemRecord(title: "x")))
        XCTAssertEqual(try count("item"), 0)
    }

    // MARK: update

    func testUpdateCapturesTheBaseUpdatedAtAndOnlyTheChangedFields() throws {
        let (run, dto) = try pulledItem("Run")
        let updated = try store.update(ItemRecord.self, localId: run.localId) {
            $0.title = "Run fast"
            $0.durationMin = 45
        }
        XCTAssertEqual(updated.title, "Run fast")

        let entry = try XCTUnwrap(store.nextPending())
        XCTAssertEqual(entry.op, .update)
        XCTAssertEqual(entry.baseUpdatedAtMs, dto.updatedAt.epochMilliseconds)
        XCTAssertEqual(body(entry), ["title": .string("Run fast"), "durationMin": .number(45)])
    }

    func testUpdateKeepsTheServerUpdatedAtSoTheBaseStaysValid() throws {
        let (run, dto) = try pulledItem("Run")
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "A" }
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "B" }
        let entries = try store.outbox()
        XCTAssertEqual(entries.map(\.baseUpdatedAtMs), [dto.updatedAt.epochMilliseconds, dto.updatedAt.epochMilliseconds])
        XCTAssertEqual(entries.count, 2)
        XCTAssertNotEqual(entries[0].idempotencyKey, entries[1].idempotencyKey)
    }

    func testClearingAFieldSendsAnExplicitNull() throws {
        let (run, _) = try pulledItem("Run")
        try store.update(ItemRecord.self, localId: run.localId) { $0.rrule = nil }
        XCTAssertEqual(body(try XCTUnwrap(store.nextPending())), ["rrule": .null])
    }

    func testUpdateWithoutAWireChangeEnqueuesNothing() throws {
        let (run, _) = try pulledItem("Run")
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = $0.title }
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    func testUpdateCannotChangeIdentity() throws {
        let (run, _) = try pulledItem("Run")
        let updated = try store.update(ItemRecord.self, localId: run.localId) {
            $0.localId = "other"
            $0.serverId = "other"
        }
        XCTAssertEqual(updated.localId, run.localId)
        XCTAssertEqual(updated.serverId, run.serverId)
    }

    func testUpdateOfAnUnsyncedRowHasNoBase() throws {
        let created = try store.create(ItemRecord(title: "x"))
        try store.update(ItemRecord.self, localId: created.localId) { $0.title = "y" }
        XCTAssertNil(try store.outbox().last?.baseUpdatedAtMs)
    }

    func testUpdateOfAMissingRowThrows() throws {
        XCTAssertThrowsError(try store.update(ItemRecord.self, localId: "nope") { $0.title = "x" }) {
            XCTAssertEqual($0 as? StoreError, .notFound(entity: .item, localId: "nope"))
        }
    }

    func testNoteTagChangesBecomeReferencesInThePayload() throws {
        try store.apply(sync: syncFull())
        let note = try XCTUnwrap(store.dbQueue.read { try NoteRecord.fetchOne($0) })
        let newTag = try store.create(NoteTagRecord(name: "new"))
        try store.update(NoteRecord.self, localId: note.localId) { $0.tagIds = [newTag.localId] }
        let entry = try XCTUnwrap(store.outbox().last)
        XCTAssertEqual(body(entry)["tagIds"], .array([.string("local:\(newTag.localId)")]))
        XCTAssertEqual(try count("note_tag_assignment", where: "tag_local_id = '\(newTag.localId)'"), 1)
    }

    // MARK: delete

    func testDeletingASyncedRowHidesItAndQueuesADeleteWithTheBase() throws {
        let (run, dto) = try pulledItem("Run")
        try store.delete(ItemRecord.self, localId: run.localId)

        let entry = try XCTUnwrap(store.nextPending())
        XCTAssertEqual(entry.op, .delete)
        XCTAssertEqual(entry.baseUpdatedAtMs, dto.updatedAt.epochMilliseconds)
        XCTAssertEqual(try count("item", where: "local_id = '\(run.localId)' AND deleted_locally = 1"), 1)
    }

    func testAPullDoesNotResurrectALocallyDeletedRow() throws {
        let (run, _) = try pulledItem("Run")
        try store.delete(ItemRecord.self, localId: run.localId)
        try store.apply(sync: syncFull())
        XCTAssertEqual(try count("item", where: "deleted_locally = 0 AND title = 'Run'"), 0)
        XCTAssertEqual(try count("item", where: "title = 'Run'"), 1, "still the one soft-deleted row")
    }

    func testPushingTheDeleteRemovesTheRowForGood() throws {
        let (run, _) = try pulledItem("Run")
        try store.delete(ItemRecord.self, localId: run.localId)
        try store.markDone(try XCTUnwrap(store.nextPending()).id)
        XCTAssertEqual(try count("item", where: "local_id = '\(run.localId)'"), 0)
    }

    func testDeletingARowThatWasNeverPushedCancelsItsQueuedWrites() throws {
        let created = try store.create(ItemRecord(title: "x"))
        try store.update(ItemRecord.self, localId: created.localId) { $0.title = "y" }
        try store.delete(ItemRecord.self, localId: created.localId)
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertEqual(try count("item"), 0)
    }

    func testDeletingAnUnsyncedRowWithAnInflightCreateStillQueuesTheDelete() throws {
        let created = try store.create(ItemRecord(title: "x"))
        try store.markInflight(try XCTUnwrap(store.nextPending()).id)
        try store.delete(ItemRecord.self, localId: created.localId)
        XCTAssertEqual(try store.outbox().map(\.op), [.create, .delete])
    }

    func testDeletingANoteTagLeavesNoteAssignmentsUntilPushed() throws {
        let tag = try store.create(NoteTagRecord(name: "t"))
        try store.create(NoteRecord(title: "n", tagIds: [tag.localId]))
        try store.markDone(try XCTUnwrap(store.nextPending()).id)
        try store.remapServerId(entity: .noteTag, localId: tag.localId, serverId: "5")
        try store.delete(NoteTagRecord.self, localId: tag.localId)
        XCTAssertEqual(try store.outbox().last?.op, .delete)
    }

    func testALocallyDeletedRowCanNeitherBeUpdatedNorDeletedAgain() throws {
        let (run, _) = try pulledItem("Run")
        try store.delete(ItemRecord.self, localId: run.localId)
        XCTAssertThrowsError(try store.update(ItemRecord.self, localId: run.localId) { $0.title = "x" })
        XCTAssertThrowsError(try store.delete(ItemRecord.self, localId: run.localId))
        XCTAssertThrowsError(try store.completeItem(localId: run.localId))
        XCTAssertEqual(try store.outboxCount(), 1)
    }

    func testDeleteOfAMissingRowThrows() throws {
        XCTAssertThrowsError(try store.delete(ItemRecord.self, localId: "nope"))
    }

    // MARK: complete

    func testCompletingAnItemMarksItDoneAndQueuesAComplete() throws {
        let (pay, dto) = try pulledItem("Pay rent")
        let done = try store.completeItem(localId: pay.localId)

        XCTAssertEqual(done.status, "done")
        XCTAssertNotNil(done.completedAt)
        let entry = try XCTUnwrap(store.nextPending())
        XCTAssertEqual(entry.op, .complete)
        XCTAssertEqual(entry.localId, pay.localId)
        XCTAssertEqual(entry.baseUpdatedAtMs, dto.updatedAt.epochMilliseconds)
        XCTAssertEqual(entry.payload, .object([:]))
    }

    func testCompletingAnOccurrenceMarksItAndCarriesOccursOn() throws {
        let (run, _) = try pulledItem("Run")
        let occurrence = try XCTUnwrap(store.dbQueue.read { try ItemOccurrenceRecord.fetchOne($0) })

        try store.completeItem(localId: run.localId, occursOn: occurrence.occursOn)

        let row = try store.dbQueue.read { try ItemOccurrenceRecord.fetchOne($0, key: occurrence.localId) }
        XCTAssertEqual(row?.status, "done")
        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) }?.status, "open", "the series stays open")
        XCTAssertEqual(try store.nextPending()?.payload, .object(["occursOn": .string(occurrence.occursOn)]))
    }

    func testCompletingAnOccurrenceTheServerHasNotMaterialisedCreatesALocalOne() throws {
        let (run, _) = try pulledItem("Run")
        try store.completeItem(localId: run.localId, occursOn: "2026-03-01")
        let local = try XCTUnwrap(
            store.dbQueue.read { try ItemOccurrenceRecord.filter(Column("occurs_on") == "2026-03-01").fetchOne($0) }
        )
        XCTAssertNil(local.serverId)
        XCTAssertEqual(local.itemId, run.reference)
        XCTAssertEqual(local.status, "done")
    }

    func testAPulledOccurrenceAdoptsTheLocallyCreatedOneInsteadOfDuplicatingIt() throws {
        let (run, _) = try pulledItem("Run")
        try store.completeItem(localId: run.localId, occursOn: "2026-03-01")
        let local = try XCTUnwrap(
            store.dbQueue.read { try ItemOccurrenceRecord.filter(Column("occurs_on") == "2026-03-01").fetchOne($0) }
        )
        try store.markDone(try XCTUnwrap(store.nextPending()).id)

        let incoming = syncJSON([
            "itemOccurrences": [[
                "id": "77", "itemId": try XCTUnwrap(run.serverId), "occursOn": "2026-03-01",
                "status": "done", "completedAt": "2026-03-01T08:00:00.000Z",
                "updatedAt": "2026-03-01T08:00:00.000Z",
            ]]
        ])
        try store.apply(sync: incoming)

        XCTAssertEqual(try count("item_occurrence", where: "occurs_on = '2026-03-01'"), 1)
        let adopted = try store.dbQueue.read { try ItemOccurrenceRecord.fetchOne($0, key: local.localId) }
        XCTAssertEqual(adopted?.serverId, "77")
    }

    // MARK: base rebasing

    func testSetBaseUpdatedAtRebasesQueuedEntriesOfThatRowOnly() throws {
        let (run, _) = try pulledItem("Run")
        let (rent, _) = try pulledItem("Pay rent")
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "A" }
        try store.update(ItemRecord.self, localId: rent.localId) { $0.title = "B" }
        let other = try store.outbox()[1]

        try store.setBaseUpdatedAt(entity: .item, localId: run.localId, ms: 123)

        XCTAssertEqual(try store.outbox()[0].baseUpdatedAtMs, 123)
        XCTAssertEqual(try store.outboxEntry(id: other.id)?.baseUpdatedAtMs, other.baseUpdatedAtMs)
    }
}
