import HusrevityCore
import XCTest

/// Scenario 4: the same note is edited on the server and locally. The stale `If-Match` is rejected
/// with 409, the conflict is recorded, the row stays protected and unrelated rows still sync.
final class ConflictTests: E2ECase {
    private struct Setup {
        var noteId: String
        var localId: String
        var conflictOutcome: SyncOutcome
    }

    /// Pulls a note, edits it on the server ("device B") and locally, creates an unrelated note, syncs.
    private func makeConflict() async throws -> Setup {
        let created = try await raw.createNote(title: "\(uid!) original", body: "base")
        let noteId = try XCTUnwrap(created["id"] as? String)
        let pulled = await engine.syncNow()
        XCTAssertEqual(pulled.result, .synced)
        let local = try XCTUnwrap(try localNote(serverId: noteId))

        // Device B edits first.
        try raw.expect(
            200, try await raw.put("/notes/\(noteId)", ["title": "\(uid!) server edit", "bodyMarkdown": "server body", "tagIds": []]))
        // This device edits the stale copy, and also adds an unrelated note.
        try store.update(NoteRecord.self, localId: local.localId) {
            $0.title = "\(uid!) local edit"
            $0.bodyMarkdown = "local body"
        }
        try store.create(NoteRecord(title: "\(uid!) unrelated"))

        let outcome = await engine.syncNow()
        return Setup(noteId: noteId, localId: local.localId, conflictOutcome: outcome)
    }

    private func assertConflictRecorded(_ setup: Setup) async throws -> ConflictRecord {
        XCTAssertEqual(setup.conflictOutcome.result, .synced, "a conflict does not fail the whole sync")
        XCTAssertEqual(setup.conflictOutcome.conflicts, 1)
        XCTAssertEqual(setup.conflictOutcome.pushed, 1, "the unrelated note still syncs")
        XCTAssertEqual(setup.conflictOutcome.parked, 0)

        let conflicts = try store.unresolvedConflicts()
        XCTAssertEqual(conflicts.count, 1)
        let conflict = try XCTUnwrap(conflicts.first)
        XCTAssertEqual(conflict.entity, .note)
        XCTAssertEqual(conflict.localId, setup.localId)
        XCTAssertEqual(conflict.op, .update)

        // The row is protected: the pull that ran in the same sync did not overwrite the local edit.
        let protected = try XCTUnwrap(try localNote(serverId: setup.noteId))
        XCTAssertEqual(protected.title, "\(uid!) local edit")
        XCTAssertEqual(protected.bodyMarkdown, "local body")
        XCTAssertEqual(try store.failedOutbox().count, 1)

        // The server still holds device B's edit, and has the unrelated note.
        let server = try await serverNote(setup.noteId).object
        XCTAssertEqual(server["title"] as? String, "\(uid!) server edit")
        let titles = try await serverNotes().compactMap { $0["title"] as? String }
        XCTAssertTrue(titles.contains("\(uid!) unrelated"))
        let put = try XCTUnwrap(transport.log.last { $0.method == "PUT" && $0.path == "/notes/\(setup.noteId)" })
        XCTAssertEqual(put.outcome, .delivered(409))
        return conflict
    }

    func testKeepLocalPushesTheLocalEditOverTheServerVersion() async throws {
        let setup = try await makeConflict()
        let conflict = try await assertConflictRecorded(setup)

        transport.resetLog()
        let resolved = try await engine.resolveConflict(id: conflict.id, keepLocal: true)

        XCTAssertEqual(resolved.result, .synced)
        XCTAssertEqual(resolved.pushed, 1)
        XCTAssertEqual(resolved.conflicts, 0)
        XCTAssertTrue(try store.unresolvedConflicts().isEmpty)
        XCTAssertEqual(try store.outboxCount(), 0)

        // Final server state = the local edit.
        let server = try await serverNote(setup.noteId).object
        XCTAssertEqual(server["title"] as? String, "\(uid!) local edit")
        XCTAssertEqual(server["bodyMarkdown"] as? String, "local body")
        let put = try XCTUnwrap(transport.log.first { $0.method == "PUT" && $0.path == "/notes/\(setup.noteId)" })
        XCTAssertEqual(put.outcome, .delivered(200))
        XCTAssertNotNil(put.ifMatch, "the retry is conditional on the server's current updatedAt")

        let local = try XCTUnwrap(try localNote(serverId: setup.noteId))
        XCTAssertEqual(local.title, "\(uid!) local edit")
        XCTAssertEqual(local.localId, setup.localId)
    }

    func testDiscardTakesTheServerVersion() async throws {
        let setup = try await makeConflict()
        let conflict = try await assertConflictRecorded(setup)

        transport.resetLog()
        let resolved = try await engine.resolveConflict(id: conflict.id, keepLocal: false)

        XCTAssertEqual(resolved.result, .synced)
        XCTAssertEqual(resolved.pushed, 0, "nothing is pushed when the local change is discarded")
        XCTAssertTrue(try store.unresolvedConflicts().isEmpty)
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertTrue(transport.log.filter { $0.method == "PUT" }.isEmpty)
        let full = try XCTUnwrap(transport.log.first { $0.method == "GET" && $0.path == "/sync" })
        XCTAssertNil(full.query, "discarding forces a full resync")

        // Final local state = the server state, and the server was left alone.
        let local = try XCTUnwrap(try localNote(serverId: setup.noteId))
        XCTAssertEqual(local.title, "\(uid!) server edit")
        XCTAssertEqual(local.bodyMarkdown, "server body")
        XCTAssertEqual(local.localId, setup.localId)
        let server = try await serverNote(setup.noteId).object
        XCTAssertEqual(server["title"] as? String, "\(uid!) server edit")
        XCTAssertEqual(try store.notes().count, 2, "the original note and the unrelated one")
    }
}
