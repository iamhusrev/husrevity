import Foundation
import HusrevityModels
import HusrevityNetwork
import HusrevityTestSupport
import XCTest
@testable import HusrevityStore
@testable import HusrevitySync

final class ConflictTests: SyncTestCase {
    /// The server version note 1 moved to (matches the captured `sync-incremental` / `note-409`).
    private func serverMovedOn() throws -> Date {
        let incremental = try loadSync("sync-incremental")
        return try XCTUnwrap(incremental.notes.first { $0.id == "1" }).updatedAt
    }

    private func editNote1(_ title: String = "my edit") throws -> String {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try noteRow(serverId: "1")?.localId)
        try store.update(NoteRecord.self, localId: local) { $0.title = title }
        return local
    }

    func testTheRealConflictMessageIsParsed() throws {
        let env = try APICoding.decoder.decode(Envelope<String>.self, from: Fixtures409())
        XCTAssertEqual(SyncEngine.currentUpdatedAt(in: env.message), "2026-10-17T21:02:07.345Z")
        XCTAssertNil(SyncEngine.currentUpdatedAt(in: "Note has been modified"))
        XCTAssertNil(SyncEngine.currentUpdatedAt(in: "oops (current updatedAt: garbage)"))
    }

    // MARK: recording

    func testA409RecordsAConflictParksTheEntryAndStillPushesOtherRows() async throws {
        let local = try editNote1()
        api.seed("note:1", updatedAt: try serverMovedOn())
        _ = try store.create(NoteRecord(title: "unrelated"))

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(outcome.conflicts, 1)
        XCTAssertEqual(outcome.pushed, 1, "the unrelated create went out")
        XCTAssertEqual(api.calls("createNote").count, 1)

        let conflicts = try store.unresolvedConflicts()
        XCTAssertEqual(conflicts.count, 1)
        let conflict = try XCTUnwrap(conflicts.first)
        XCTAssertEqual(conflict.entity, .note)
        XCTAssertEqual(conflict.localId, local)
        XCTAssertEqual(conflict.op, .update)
        XCTAssertEqual(conflict.localPayload.objectString("title"), "my edit")
        XCTAssertEqual(conflict.serverPayload.objectString("updatedAt"), "2026-10-17T21:02:07.345Z")

        XCTAssertEqual(try store.failedOutbox().map(\.localId), [local])
        XCTAssertEqual(try noteRow(serverId: "1")?.title, "my edit", "the local change is never dropped")
    }

    func testAConflictedRowIsProtectedFromThePull() async throws {
        _ = try editNote1()
        api.seed("note:1", updatedAt: try serverMovedOn())
        api.enqueueSync(try loadSync("sync-incremental"))

        _ = await engine.syncNow()

        XCTAssertEqual(try noteRow(serverId: "1")?.title, "my edit", "the pull must not overwrite the parked change")
    }

    func testAParkedConflictIsNotPushedAgainOnTheNextRun() async throws {
        _ = try editNote1()
        api.seed("note:1", updatedAt: try serverMovedOn())
        _ = await engine.syncNow()
        _ = await engine.syncNow()

        XCTAssertEqual(api.calls("updateNote").count, 1)
        XCTAssertEqual(try store.unresolvedConflicts().count, 1, "no duplicate conflict records")
    }

    func testAConflictOnADeleteIsRecordedWithTheDeleteOp() async throws {
        try seedFromFullFixture()
        let local = try XCTUnwrap(try noteRow(serverId: "1")?.localId)
        try store.delete(NoteRecord.self, localId: local)
        api.seed("note:1", updatedAt: try serverMovedOn())

        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.conflicts, 1)
        XCTAssertEqual(try store.unresolvedConflicts().first?.op, .delete)
        _ = try await engine.resolveConflict(id: try XCTUnwrap(store.unresolvedConflicts().first).id, keepLocal: false)
        XCTAssertNotNil(try noteRow(serverId: "1"), "discarding the delete brings the row back")
    }

    // MARK: resolution

    func testKeepLocalRePushesAgainstTheServersUpdatedAtAndSucceeds() async throws {
        _ = try editNote1()
        let moved = try serverMovedOn()
        api.seed("note:1", updatedAt: moved)
        _ = await engine.syncNow()
        let firstKey = try XCTUnwrap(api.calls("updateNote").first?.key)

        let conflict = try XCTUnwrap(store.unresolvedConflicts().first)
        let outcome = try await engine.resolveConflict(id: conflict.id, keepLocal: true)

        XCTAssertEqual(outcome.result, .synced)
        let updates = api.calls("updateNote")
        XCTAssertEqual(updates.count, 2)
        XCTAssertEqual(updates[1].ifMatch?.epochMilliseconds, moved.epochMilliseconds, "rebased on the server's updatedAt")
        XCTAssertNotEqual(updates[1].key, firstKey, "a new decision gets a new key")
        XCTAssertEqual(updates[1].body?.objectString("title"), "my edit")
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertTrue(try store.unresolvedConflicts().isEmpty)
        XCTAssertEqual(try noteRow(serverId: "1")?.title, "my edit")
        XCTAssertEqual(outcome.pushed, 1)
    }

    func testDiscardResolvesToTheServerVersionViaAFullResync() async throws {
        _ = try editNote1()
        api.seed("note:1", updatedAt: try serverMovedOn())
        _ = await engine.syncNow()
        let incremental = try loadSync("sync-incremental")
        api.enqueueSync(incremental)  // what a full resync returns for note 1
        let before = api.sinceLog.count

        let conflict = try XCTUnwrap(store.unresolvedConflicts().first)
        let outcome = try await engine.resolveConflict(id: conflict.id, keepLocal: false)

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(api.sinceLog.count, before + 1)
        XCTAssertNil(api.sinceLog.last!, "server wins re-reads everything: since is nil")
        let row = try XCTUnwrap(try noteRow(serverId: "1"))
        XCTAssertEqual(row.title, "Plan the week (v2)")
        XCTAssertEqual(row.updatedAt, try serverMovedOn())
        XCTAssertEqual(try store.cursor(), incremental.cursor)
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertTrue(try store.unresolvedConflicts().isEmpty)
    }

    func testDiscardWhileOfflineKeepsTheFullResyncPendingForTheNextRun() async throws {
        _ = try editNote1()
        api.seed("note:1", updatedAt: try serverMovedOn())
        _ = await engine.syncNow()
        let conflict = try XCTUnwrap(store.unresolvedConflicts().first)
        api.enqueueSyncFailure(.transport(URLError(.notConnectedToInternet)))

        let first = try await engine.resolveConflict(id: conflict.id, keepLocal: false)
        XCTAssertEqual(first.result, .offline)

        api.enqueueSync(try loadSync("sync-incremental"))
        let second = await engine.syncNow()

        XCTAssertEqual(second.result, .synced)
        XCTAssertNil(api.sinceLog.last!, "still a full resync")
        XCTAssertEqual(try noteRow(serverId: "1")?.title, "Plan the week (v2)")
    }

    func testResolvingAnUnknownConflictThrows() async throws {
        do {
            _ = try await engine.resolveConflict(id: 9999, keepLocal: true)
            XCTFail("expected an error")
        } catch {}
    }
}

private func Fixtures409() throws -> Data { try Fixtures.data("note-409") }
