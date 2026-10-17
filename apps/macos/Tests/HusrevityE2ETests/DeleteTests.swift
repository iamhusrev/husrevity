import HusrevityCore
import XCTest

/// Scenario 5: deletes.
final class DeleteTests: E2ECase {
    func testLocalDeleteOfPushedRowsReachesTheServer() async throws {
        let note = try store.create(NoteRecord(title: "\(uid!) note"))
        let item = try store.create(ItemRecord(title: "\(uid!) item"))
        let project = try store.create(ProjectRecord(code: projectCode(), name: "\(uid!) project"))
        try await syncUntilDrained()
        let noteId = try XCTUnwrap(try localNote(titled: note.title).serverId)
        let itemId = try XCTUnwrap(try localItem(titled: item.title).serverId)
        let projectId = try XCTUnwrap(try localProject(named: project.name).serverId)

        try store.delete(NoteRecord.self, localId: note.localId)
        try store.delete(ItemRecord.self, localId: item.localId)
        try store.delete(ProjectRecord.self, localId: project.localId)
        XCTAssertTrue(try store.notes().isEmpty, "deleted rows are hidden immediately")
        XCTAssertEqual(try store.outboxCount(), 3)

        let outcome = await engine.syncNow()
        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(outcome.pushed, 3)
        XCTAssertEqual(outcome.parked, 0)
        XCTAssertEqual(try store.outboxCount(), 0)

        let serverNote = try await serverNote(noteId)
        XCTAssertEqual(serverNote.status, 404)
        let serverItem = try await serverItem(itemId)
        XCTAssertEqual(serverItem.status, 404)
        let serverProject = try await serverProject(projectId)
        XCTAssertEqual(serverProject.status, 404)

        // They stay gone after the pull that followed.
        XCTAssertTrue(try store.notes().isEmpty)
        XCTAssertTrue(try store.items().isEmpty)
        XCTAssertTrue(try store.projects().isEmpty)
        let again = await engine.syncNow()
        XCTAssertEqual(again.result, .synced)
        XCTAssertTrue(try store.notes().isEmpty)
    }

    func testDeletingARowTheServerAlreadyDeletedIsSuccess() async throws {
        let note = try store.create(NoteRecord(title: "\(uid!) note"))
        let item = try store.create(ItemRecord(title: "\(uid!) item"))
        try await syncUntilDrained()
        let noteId = try XCTUnwrap(try localNote(titled: note.title).serverId)
        let itemId = try XCTUnwrap(try localItem(titled: item.title).serverId)

        // Device B deletes both before this device learns about it.
        try raw.expect(204, try await raw.delete("/notes/\(noteId)"))
        try raw.expect(204, try await raw.delete("/items/\(itemId)"))

        try store.delete(NoteRecord.self, localId: note.localId)
        try store.delete(ItemRecord.self, localId: item.localId)
        transport.resetLog()
        let outcome = await engine.syncNow()

        let deletes = transport.log.filter { $0.method == "DELETE" }
        XCTAssertEqual(deletes.map(\.outcome), [.delivered(404), .delivered(404)], "the server really answers 404")
        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(outcome.parked, 0, "404 on delete is not an error")
        XCTAssertEqual(outcome.conflicts, 0)
        XCTAssertEqual(outcome.pushed, 2)
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertTrue(try store.failedOutbox().isEmpty)
        XCTAssertTrue(try store.unresolvedConflicts().isEmpty)
        XCTAssertTrue(try store.notes().isEmpty)
        XCTAssertTrue(try store.items().isEmpty)
    }

    func testDeleteOfARowNeverPushedLeavesNoTraceOnTheServer() async throws {
        transport.goOffline()
        let note = try store.create(NoteRecord(title: "\(uid!) ephemeral"))
        try store.delete(NoteRecord.self, localId: note.localId)
        XCTAssertEqual(try store.outboxCount(), 0)
        transport.goOnline()
        let outcome = await engine.syncNow()
        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(outcome.pushed, 0)
        let serverNotes = try await serverNotes()
        XCTAssertTrue(serverNotes.isEmpty)
    }
}
