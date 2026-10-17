import Foundation
import HusrevityModels
import HusrevityNetwork
import XCTest
@testable import HusrevityStore
@testable import HusrevitySync

/// Every entity/op pair reaches the right endpoint with the right body, ids and `If-Match`.
final class EntityDispatchTests: SyncTestCase {
    func testItemCreateCarriesTypedFieldsAndTheRemappedProjectId() async throws {
        let project = try store.create(ProjectRecord(code: "HOME", name: "Home"))
        let due = Date(timeIntervalSince1970: 1_800_000_000)
        _ = try store.create(
            ItemRecord(title: "Pay rent", projectId: project.reference, dueAt: due, notifyMinutesBefore: 10, payload: .object(["k": .number(1)]))
        )

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(outcome.pushed, 2)
        let body = try XCTUnwrap(api.calls("createItem").first?.body)
        XCTAssertEqual(body.objectString("title"), "Pay rent")
        XCTAssertEqual(body.objectString("kind"), "task")
        XCTAssertEqual(body.objectString("projectId"), "101", "the project's server id, not its placeholder")
        XCTAssertEqual(body.objectString("dueAt"), FakeSyncAPI.iso(due))
        XCTAssertEqual(body.objectNumber("notifyMinutesBefore"), 10)
        XCTAssertEqual(try store.items().first?.projectId, "101")
    }

    func testItemUpdateSendsOnlyChangedFieldsAndNullsForClearedOnes() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try store.items().first { $0.serverId == "1" }?.localId)
        let baseMs = try XCTUnwrap(store.items().first { $0.serverId == "1" }).updatedAt.epochMilliseconds
        try store.update(ItemRecord.self, localId: local) {
            $0.title = "Run far"
            $0.durationMin = nil
        }

        _ = await engine.syncNow()

        let call = try XCTUnwrap(api.calls("updateItem").first)
        XCTAssertEqual(call.id, "1")
        guard case .object(let o)? = call.body else { return XCTFail("no body") }
        XCTAssertEqual(o["title"], .string("Run far"))
        XCTAssertEqual(o["durationMin"], .null, "cleared fields are explicit nulls")
        XCTAssertNil(o["kind"], "unchanged fields are absent")
        XCTAssertNil(o["notes"])
        XCTAssertEqual(call.ifMatch?.epochMilliseconds, baseMs)
    }

    func testRecurringCompletionSendsOccursOn() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try store.items().first { $0.serverId == "1" }?.localId)
        try store.completeItem(localId: local, occursOn: "2026-02-04")

        _ = await engine.syncNow()

        let call = try XCTUnwrap(api.calls("completeItem").first)
        XCTAssertEqual(call.id, "1")
        XCTAssertEqual(call.body?.objectString("occursOn"), "2026-02-04")
    }

    func testItemDeleteUsesIfMatch() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try store.items().first { $0.serverId == "2" }?.localId)
        try store.delete(ItemRecord.self, localId: local)

        let outcome = await engine.syncNow()

        let call = try XCTUnwrap(api.calls("deleteItem").first)
        XCTAssertEqual(call.id, "2")
        XCTAssertNotNil(call.ifMatch)
        XCTAssertEqual(outcome.pushed, 1)
        XCTAssertNil(try store.items().first { $0.serverId == "2" })
    }

    func testProjectCreateThenPinnedFollowUpUsesTheNewIdAndRebasedIfMatch() async throws {
        _ = try store.create(ProjectRecord(code: "WORK", name: "Work", pinned: true))

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.pushed, 2)
        let create = try XCTUnwrap(api.calls("createProject").first)
        XCTAssertEqual(create.body?.objectString("code"), "WORK")
        let update = try XCTUnwrap(api.calls("updateProject").first)
        XCTAssertEqual(update.id, "101")
        XCTAssertEqual(update.body?.objectBool("pinned"), true)
        XCTAssertEqual(update.ifMatch?.epochMilliseconds, FakeSyncAPI.epoch.addingTimeInterval(1).epochMilliseconds)
    }

    func testProjectDelete() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try store.projects().first?.localId)
        try store.delete(ProjectRecord.self, localId: local)

        _ = await engine.syncNow()

        XCTAssertEqual(api.calls("deleteProject").first?.id, "1")
        XCTAssertTrue(try store.projects().isEmpty)
    }

    func testGoalCreateUpdateDelete() async throws {
        let goal = try store.create(GoalRecord(title: "Ship", horizon: "month", periodStart: "2026-02-01", periodEnd: "2026-02-28"))
        try store.update(GoalRecord.self, localId: goal.localId) { $0.notes = "why" }

        _ = await engine.syncNow()

        XCTAssertEqual(api.calls("createGoal").first?.body?.objectString("horizon"), "month")
        let update = try XCTUnwrap(api.calls("updateGoal").first)
        XCTAssertEqual(update.id, "101")
        XCTAssertEqual(update.body?.objectString("notes"), "why")

        try store.delete(GoalRecord.self, localId: goal.localId)
        _ = await engine.syncNow()
        XCTAssertEqual(api.calls("deleteGoal").first?.id, "101")
        XCTAssertTrue(try store.goals().isEmpty)
    }

    func testTagCreateRemapsWithoutUpdatedAtAndANoteReferencesTheNewId() async throws {
        let tag = try store.create(NoteTagRecord(name: "work", color: "#3366ff"))
        _ = try store.create(NoteRecord(title: "tagged", tagIds: [tag.localId]))

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.pushed, 2)
        XCTAssertEqual(api.calls("createNoteTag").first?.body?.objectString("name"), "work")
        let noteCall = try XCTUnwrap(api.calls("createNote").first)
        guard case .object(let o)? = noteCall.body, case .array(let tagIds)? = o["tagIds"] else { return XCTFail("no tagIds") }
        XCTAssertEqual(tagIds, [.string("101")])
        XCTAssertEqual(try serverId(.noteTag, localId: tag.localId), "101")
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    func testTagDeleteSendsNoIfMatch() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try store.tags().first?.localId)
        try store.delete(NoteTagRecord.self, localId: local)

        _ = await engine.syncNow()

        let call = try XCTUnwrap(api.calls("deleteNoteTag").first)
        XCTAssertEqual(call.id, "1")
        XCTAssertNil(call.ifMatch)
        XCTAssertTrue(try store.tags().isEmpty)
    }

    func testUnsupportedOperationIsParked() async throws {
        let tag = try store.create(NoteTagRecord(name: "t"))
        _ = await engine.syncNow()
        try store.update(NoteTagRecord.self, localId: tag.localId) { $0.name = "renamed" }

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.parked, 1, "the API has no tag update endpoint")
    }
}

extension JSONValue {
    func objectNumber(_ key: String) -> Double? {
        if case .object(let o) = self, case .number(let n)? = o[key] { return n }
        return nil
    }

    func objectBool(_ key: String) -> Bool? {
        if case .object(let o) = self, case .bool(let b)? = o[key] { return b }
        return nil
    }
}
