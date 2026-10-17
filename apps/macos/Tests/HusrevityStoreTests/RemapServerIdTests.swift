import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

/// A create succeeded: the local row gets its server id and every reference to the `local:<uuid>`
/// placeholder (rows and later outbox payloads) is rewritten.
final class RemapServerIdTests: StoreTestCase {
    private func payload(of entry: OutboxEntry) -> [String: JSONValue] {
        guard case .object(let o) = entry.payload else { return [:] }
        return o
    }

    func testRemapSetsTheServerIdOnTheRow() throws {
        let project = try store.create(ProjectRecord(code: "HOME", name: "Home"))
        XCTAssertNil(project.serverId)
        try store.remapServerId(entity: .project, localId: project.localId, serverId: "42")
        let stored = try store.dbQueue.read { try ProjectRecord.fetchOne($0, key: project.localId) }
        XCTAssertEqual(stored?.serverId, "42")
        XCTAssertEqual(stored?.reference, "42")
    }

    func testItemPayloadsAndRowsPointingAtANewProjectAndGoalAreRewritten() throws {
        let goal = try store.create(GoalRecord(title: "G", horizon: "year", periodStart: "2026-01-01", periodEnd: "2026-12-31"))
        let project = try store.create(ProjectRecord(code: "HOME", name: "Home", goalId: goal.reference))
        let item = try store.create(ItemRecord(title: "Do", projectId: project.reference, goalId: goal.reference))
        XCTAssertEqual(item.projectId, "local:\(project.localId)")

        // The goal create is pushed first, then the project's.
        let queue = try store.outbox()
        try store.markDone(queue[0].id)
        try store.remapServerId(entity: .goal, localId: goal.localId, serverId: "7")

        let projectEntry = try XCTUnwrap(store.outboxEntry(id: queue[1].id))
        XCTAssertEqual(payload(of: projectEntry)["goalId"], .string("7"))
        let itemEntry = try XCTUnwrap(store.outboxEntry(id: queue[2].id))
        XCTAssertEqual(payload(of: itemEntry)["goalId"], .string("7"))
        XCTAssertEqual(payload(of: itemEntry)["projectId"], .string("local:\(project.localId)"), "project not pushed yet")

        try store.markDone(queue[1].id)
        try store.remapServerId(entity: .project, localId: project.localId, serverId: "9")

        let itemEntryAfter = try XCTUnwrap(store.outboxEntry(id: queue[2].id))
        XCTAssertEqual(payload(of: itemEntryAfter)["projectId"], .string("9"))
        let itemRow = try store.dbQueue.read { try ItemRecord.fetchOne($0, key: item.localId) }
        XCTAssertEqual(itemRow?.projectId, "9")
        XCTAssertEqual(itemRow?.goalId, "7")
        let projectRow = try store.dbQueue.read { try ProjectRecord.fetchOne($0, key: project.localId) }
        XCTAssertEqual(projectRow?.goalId, "7")
    }

    func testParentGoalReferenceIsRewritten() throws {
        let parent = try store.create(GoalRecord(title: "P", horizon: "year", periodStart: "2026-01-01", periodEnd: "2026-12-31"))
        let child = try store.create(
            GoalRecord(title: "C", horizon: "quarter", periodStart: "2026-01-01", periodEnd: "2026-03-31", parentGoalId: parent.reference)
        )
        try store.remapServerId(entity: .goal, localId: parent.localId, serverId: "3")
        let row = try store.dbQueue.read { try GoalRecord.fetchOne($0, key: child.localId) }
        XCTAssertEqual(row?.parentGoalId, "3")
    }

    func testOccurrenceItemIdAndNoteTagIdsInPayloadsAreRewritten() throws {
        let item = try store.create(ItemRecord(title: "Recurring", rrule: "FREQ=DAILY"))
        try store.dbQueue.write {
            try ItemOccurrenceRecord(itemId: item.reference, occursOn: "2026-02-03").insert($0)
        }
        let tag = try store.create(NoteTagRecord(name: "work"))
        let note = try store.create(NoteRecord(title: "N", tagIds: [tag.localId]))
        let noteEntry = try XCTUnwrap(store.outbox().last)
        XCTAssertEqual(payload(of: noteEntry)["tagIds"], .array([.string("local:\(tag.localId)")]))

        try store.remapServerId(entity: .item, localId: item.localId, serverId: "11")
        try store.remapServerId(entity: .noteTag, localId: tag.localId, serverId: "5")

        let occurrence = try store.dbQueue.read { try ItemOccurrenceRecord.fetchOne($0) }
        XCTAssertEqual(occurrence?.itemId, "11")
        XCTAssertEqual(payload(of: try XCTUnwrap(store.outboxEntry(id: noteEntry.id)))["tagIds"], .array([.string("5")]))
        XCTAssertEqual(try store.dbQueue.read { try NoteRecord.fetchOne($0, key: note.localId) }?.localId, note.localId)
    }

    func testUnrelatedPayloadsAreUntouched() throws {
        let a = try store.create(ProjectRecord(code: "A", name: "A"))
        let b = try store.create(ProjectRecord(code: "B", name: "B"))
        let item = try store.create(ItemRecord(title: "x", projectId: b.reference))
        let before = try XCTUnwrap(store.outbox().last)
        try store.remapServerId(entity: .project, localId: a.localId, serverId: "1")
        XCTAssertEqual(try store.outboxEntry(id: before.id)?.payload, before.payload)
        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: item.localId) }?.projectId, b.reference)
    }

    func testRemapIsIdempotent() throws {
        let project = try store.create(ProjectRecord(code: "A", name: "A"))
        try store.remapServerId(entity: .project, localId: project.localId, serverId: "1")
        XCTAssertNoThrow(try store.remapServerId(entity: .project, localId: project.localId, serverId: "1"))
    }

    func testARowAlreadyPulledWithTheSameServerIdIsMergedIntoTheLocalOne() throws {
        // A pull that raced the create response already stored the server's copy.
        let sync = try syncFull()
        let serverProjectId = try XCTUnwrap(sync.projects.first?.id)
        try store.apply(sync: sync)
        let local = try store.create(ProjectRecord(code: "HOME", name: "Home"))

        try store.remapServerId(entity: .project, localId: local.localId, serverId: serverProjectId)

        XCTAssertEqual(try count("project"), 1)
        XCTAssertEqual(
            try store.dbQueue.read { try ProjectRecord.fetchOne($0)?.localId }, local.localId,
            "the local row (and its local id) survives"
        )
    }

    func testRemapOfAnUnknownRowThrows() throws {
        XCTAssertThrowsError(try store.remapServerId(entity: .item, localId: "nope", serverId: "1")) {
            XCTAssertEqual($0 as? StoreError, .notFound(entity: .item, localId: "nope"))
        }
    }
}
