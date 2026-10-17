import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

final class FullResyncMarkerTests: StoreTestCase {
    private func pulledRun() throws -> ItemRecord {
        try store.apply(sync: syncFull())
        return try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == "Run").fetchOne($0) })
    }

    private func failedUpdate(_ run: ItemRecord) throws -> OutboxEntry {
        try store.update(ItemRecord.self, localId: run.localId) { $0.title = "mine" }
        let entry = try XCTUnwrap(store.nextPending())
        try store.markInflight(entry.id)
        try store.markFailed(entry.id, error: "422")
        return entry
    }

    func testTheMarkerIsClearOnAFreshStore() throws {
        XCTAssertFalse(try store.needsFullResync())
    }

    func testDiscardingAFailedUpdateSetsTheMarkerAndItSurvivesReopening() throws {
        let entry = try failedUpdate(try pulledRun())
        try store.discardOutboxEntry(id: entry.id)
        XCTAssertTrue(try store.needsFullResync())

        store = nil
        store = try LocalStore(path: path)
        XCTAssertTrue(try store.needsFullResync())
    }

    func testResolvingAConflictForTheServerSetsTheMarker() throws {
        let run = try pulledRun()
        let entry = try failedUpdate(run)
        let conflict = try store.recordConflict(entity: .item, localId: run.localId, localPayload: entry.payload, serverPayload: .object([:]))
        try store.resolveConflict(id: conflict.id, keepLocal: false)
        XCTAssertTrue(try store.needsFullResync())
    }

    func testKeepingTheLocalChangeDoesNotSetTheMarker() throws {
        let run = try pulledRun()
        let entry = try failedUpdate(run)
        let conflict = try store.recordConflict(
            entity: .item, localId: run.localId, localPayload: entry.payload,
            serverPayload: .object(["updatedAt": .string("2026-10-18T10:00:00.500Z")])
        )
        try store.resolveConflict(id: conflict.id, keepLocal: true)
        XCTAssertFalse(try store.needsFullResync())
    }

    func testClearWorks() throws {
        let entry = try failedUpdate(try pulledRun())
        try store.discardOutboxEntry(id: entry.id)
        try store.clearFullResync()
        XCTAssertFalse(try store.needsFullResync())
    }

    func testAnIncrementalApplyDoesNotClearTheMarker() throws {
        let entry = try failedUpdate(try pulledRun())
        try store.discardOutboxEntry(id: entry.id)
        try store.apply(sync: syncIncremental())
        try store.setCursor("c")
        XCTAssertTrue(try store.needsFullResync(), "only clearFullResync() after a since-nil pull clears it")
    }

    func testDiscardingANeverPushedCreateDoesNotSetTheMarker() throws {
        // The row is removed; there is no stale server-side value left behind to re-fetch.
        _ = try store.create(ItemRecord(title: "x"))
        let entry = try XCTUnwrap(store.nextPending())
        try store.markInflight(entry.id)
        try store.markFailed(entry.id)
        try store.discardOutboxEntry(id: entry.id)
        XCTAssertFalse(try store.needsFullResync())
    }
}
