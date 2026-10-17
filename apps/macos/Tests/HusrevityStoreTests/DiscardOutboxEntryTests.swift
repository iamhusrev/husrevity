import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

final class DiscardOutboxEntryTests: StoreTestCase {
    private func pulled(_ title: String) throws -> ItemRecord {
        try store.apply(sync: syncFull())
        return try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == title).fetchOne($0) })
    }

    private func fail(_ entry: OutboxEntry) throws {
        try store.markInflight(entry.id)
        try store.markFailed(entry.id, error: "422")
    }

    func testDiscardingAFailedUpdateDropsItAndLaterEntriesAndLetsThePullOverwrite() throws {
        let run = try pulled("Run")
        let rent = try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == "Pay rent").fetchOne($0) })
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "A" }
        try store.update(ItemRecord.self, localId: rent.localId) { $0.title = "other row" }
        try store.update(ItemRecord.self, localId: run.localId) { $0.notes = "B" }
        let failed = try store.outbox()[0]
        try fail(failed)
        try store.recordConflict(entity: .item, localId: run.localId, localPayload: .object([:]), serverPayload: .object([:]))

        try store.discardOutboxEntry(id: failed.id)

        XCTAssertEqual(try store.outbox().map(\.localId), [rent.localId], "later entries of the same row go too")
        XCTAssertEqual(try store.unresolvedConflicts(), [])
        var sync = try syncFull()
        sync.items[0].title = "Run (server)"
        try store.apply(sync: sync)
        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: run.localId) }?.title, "Run (server)")
    }

    func testDiscardingAnEarlierEntrySparesEarlierOnesAndKeepsTheRowProtected() throws {
        let run = try pulled("Run")
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "A" }
        try store.update(ItemRecord.self, localId: run.localId) { $0.notes = "B" }
        try fail(try store.outbox()[1])
        try store.discardOutboxEntry(id: try store.outbox()[1].id)
        XCTAssertEqual(try store.outbox().count, 1)
    }

    func testDiscardingAFailedCreateRemovesTheRowAndDependentReferences() throws {
        let project = try store.create(ProjectRecord(code: "P", name: "P"))
        let item = try store.create(ItemRecord(title: "I", projectId: project.reference))
        try store.update(ItemRecord.self, localId: project.localId == "" ? "" : item.localId) { $0.title = "J" }
        let create = try store.outbox()[0]
        try fail(create)

        try store.discardOutboxEntry(id: create.id)

        XCTAssertEqual(try count("project"), 0)
        XCTAssertEqual(try store.outbox().map(\.localId), [item.localId, item.localId])
        for entry in try store.outbox() {
            XCTAssertFalse(String(describing: entry.payload).contains("local:"))
        }
        XCTAssertNil(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: item.localId) }?.projectId)
    }

    func testDiscardingAFailedDeleteMakesTheRowVisibleAgain() throws {
        let run = try pulled("Run")
        try store.delete(ItemRecord.self, localId: run.localId)
        let entry = try XCTUnwrap(store.nextPending())
        try fail(entry)
        XCTAssertEqual(try store.items().map(\.title), ["Pay rent"])

        try store.discardOutboxEntry(id: entry.id)

        XCTAssertEqual(Set(try store.items().map(\.title)), ["Run", "Pay rent"])
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    func testDiscardAppliesARecordedTombstone() throws {
        let rent = try pulled("Pay rent")
        try store.update(ItemRecord.self, localId: rent.localId) { $0.title = "x" }
        try store.apply(sync: syncIncremental())
        let entry = try XCTUnwrap(store.nextPending())
        try fail(entry)
        try store.discardOutboxEntry(id: entry.id)
        XCTAssertEqual(try count("item", where: "local_id = '\(rent.localId)'"), 0)
    }

    func testOnlyFailedEntriesCanBeDiscarded() throws {
        _ = try store.create(ItemRecord(title: "a"))
        let entry = try XCTUnwrap(store.nextPending())
        XCTAssertThrowsError(try store.discardOutboxEntry(id: entry.id)) {
            XCTAssertEqual($0 as? StoreError, .invalidPayload("outbox entry \(entry.id) is not failed"))
        }
        try store.markInflight(entry.id)
        XCTAssertThrowsError(try store.discardOutboxEntry(id: entry.id)) {
            XCTAssertEqual($0 as? StoreError, .invalidPayload("outbox entry \(entry.id) is not failed"))
        }
        XCTAssertEqual(try store.outboxCount(), 1)
        XCTAssertThrowsError(try store.discardOutboxEntry(id: 9999))
    }

    func testAnInflightLaterEntryOfTheRowBlocksTheDiscard() throws {
        let run = try pulled("Run")
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "A" }
        try store.update(ItemRecord.self, localId: run.localId) { $0.notes = "B" }
        let all = try store.outbox()
        try fail(all[0])
        try store.markInflight(all[1].id)
        XCTAssertThrowsError(try store.discardOutboxEntry(id: all[0].id)) {
            XCTAssertEqual($0 as? StoreError, .entryInFlight(entity: .item, localId: run.localId))
        }
        XCTAssertEqual(try store.outboxCount(), 2)
    }
}
