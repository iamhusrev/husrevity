import HusrevityCore
import XCTest

/// Scenario 2: the server applied a write but the response never arrived. The retry must carry the
/// SAME Idempotency-Key so the server replays its answer instead of applying the write twice.
final class LostResponseTests: E2ECase {
    func testLostCreateResponsesAreRetriedWithTheSameKeyAndCreateExactlyOneRow() async throws {
        let paths = ["/note-tags", "/notes", "/projects", "/items"]
        for path in paths {
            transport.dropResponses(count: 1) { $0.isCall("POST", path) }
        }

        let noteTag = try store.create(NoteTagRecord(name: "\(uid!)-tag"))
        try store.create(NoteRecord(title: "\(uid!) note", tagIds: [noteTag.localId]))
        try store.create(ProjectRecord(code: projectCode(), name: "\(uid!) project"))
        try store.create(ItemRecord(title: "\(uid!) item"))

        let first = await engine.syncNow()
        XCTAssertEqual(first.result, .offline, "a lost response looks like a transport failure")
        XCTAssertEqual(try store.outboxCount(), 4, "nothing may be dropped from the outbox")

        try await syncUntilDrained()

        for path in paths {
            let posts = transport.log.filter { $0.method == "POST" && $0.path == path }
            XCTAssertEqual(posts.count, 2, "\(path): one attempt lost, one retry")
            guard posts.count == 2 else { continue }
            XCTAssertEqual(posts[0].outcome, .responseLost(201), "\(path): the server did apply the first request")
            XCTAssertEqual(posts[1].outcome, .delivered(201), "\(path): the retry is answered")
            let key = try XCTUnwrap(posts[0].idempotencyKey, "\(path): create requests carry an Idempotency-Key")
            XCTAssertEqual(posts[1].idempotencyKey, key, "\(path): the retry must reuse the key")
        }

        // Exactly one row on the server for each create.
        let notes = try await serverNotes().filter { $0["title"] as? String == "\(uid!) note" }
        XCTAssertEqual(notes.count, 1)
        let tags = try await serverTags().filter { $0["name"] as? String == "\(uid!)-tag" }
        XCTAssertEqual(tags.count, 1)
        let projects = try await serverProjects().filter { $0["code"] as? String == projectCode() }
        XCTAssertEqual(projects.count, 1)
        let items = try raw.expect(200, try await raw.get("/items")).array.filter {
            $0["title"] as? String == "\(uid!) item"
        }
        XCTAssertEqual(items.count, 1)

        // And the local rows are linked to those single server rows.
        XCTAssertEqual(try localNote(titled: "\(uid!) note").serverId, notes.first?["id"] as? String)
        XCTAssertEqual(try localTag(named: "\(uid!)-tag").serverId, tags.first?["id"] as? String)
        XCTAssertEqual(try localProject(named: "\(uid!) project").serverId, projects.first?["id"] as? String)
        XCTAssertEqual(try localItem(titled: "\(uid!) item").serverId, items.first?["id"] as? String)
        XCTAssertEqual(try store.notes().count, 1)
        XCTAssertEqual(try store.items().count, 1)
        XCTAssertEqual(try store.projects().count, 1)
        XCTAssertEqual(try store.tags().count, 1)
    }

    func testLostUpdateResponseIsReplayedNotRejected() async throws {
        let created = try await raw.createNote(title: "\(uid!) note", body: "v1")
        let noteId = try XCTUnwrap(created["id"] as? String)
        try await syncUntilDrained()

        // Update whose response is lost: the retry must be replayed, not answered 409 because the
        // row's updatedAt moved when the first attempt was applied.
        let local = try localNote(titled: "\(uid!) note")
        try store.update(NoteRecord.self, localId: local.localId) { $0.title = "\(uid!) edited" }
        transport.dropResponses(count: 1) { $0.isCall("PUT", "/notes/\(noteId)") }
        transport.resetLog()
        let lost = await engine.syncNow()
        XCTAssertEqual(lost.result, .offline)
        try await syncUntilDrained()

        let puts = transport.log.filter { $0.method == "PUT" && $0.path == "/notes/\(noteId)" }
        XCTAssertEqual(puts.map(\.outcome), [.responseLost(200), .delivered(200)])
        XCTAssertEqual(puts.first?.idempotencyKey, puts.last?.idempotencyKey)
        XCTAssertEqual(puts.first?.ifMatch, puts.last?.ifMatch, "the retry must be identical, If-Match included")
        XCTAssertTrue(try store.unresolvedConflicts().isEmpty)
        let afterUpdate = try await serverNote(noteId).object
        XCTAssertEqual(afterUpdate["title"] as? String, "\(uid!) edited")
        XCTAssertEqual(try localNote(titled: "\(uid!) edited").serverId, noteId)
    }

    /// End state of a lost DELETE response: whichever way the server answers the retry, the client
    /// must converge (404 on delete counts as success).
    func testLostDeleteResponseStillConvergesToDeleted() async throws {
        let created = try await raw.createNote(title: "\(uid!) note")
        let noteId = try XCTUnwrap(created["id"] as? String)
        try await syncUntilDrained()
        let local = try localNote(titled: "\(uid!) note")

        try store.delete(NoteRecord.self, localId: local.localId)
        transport.dropResponses(count: 1) { $0.isCall("DELETE", "/notes/\(noteId)") }
        transport.resetLog()
        let lostDelete = await engine.syncNow()
        XCTAssertEqual(lostDelete.result, .offline)
        XCTAssertEqual(try store.outboxCount(), 1, "the delete stays queued until an answer arrives")
        try await syncUntilDrained()

        let afterDelete = try await serverNote(noteId)
        XCTAssertEqual(afterDelete.status, 404)
        XCTAssertTrue(try store.notes().isEmpty)
        XCTAssertTrue(try store.failedOutbox().isEmpty)
    }

    /// PRODUCT BUG (see report): `IdempotencyInterceptor` stores `body ?? null` but
    /// `idempotency_key.response_body` is `JSONB NOT NULL`, so the insert fails for every handler that
    /// returns nothing (DELETE -> 204) and the key is never recorded. The retry then hits the real
    /// handler and gets 404 instead of the replayed 204. Written as the intended behaviour.
    func testLostDeleteResponseIsReplayedWithTheOriginal204() async throws {
        let created = try await raw.createNote(title: "\(uid!) note")
        let noteId = try XCTUnwrap(created["id"] as? String)
        try await syncUntilDrained()
        let local = try localNote(titled: "\(uid!) note")

        try store.delete(NoteRecord.self, localId: local.localId)
        transport.dropResponses(count: 1) { $0.isCall("DELETE", "/notes/\(noteId)") }
        transport.resetLog()
        _ = await engine.syncNow()
        try await syncUntilDrained()

        let deletes = transport.log.filter { $0.method == "DELETE" && $0.path == "/notes/\(noteId)" }
        XCTAssertEqual(deletes.count, 2)
        XCTAssertEqual(deletes.first?.outcome, .responseLost(204))
        XCTAssertEqual(deletes.last?.outcome, .delivered(204), "the replay answers with the original 204, not 404")
        XCTAssertEqual(deletes.first?.idempotencyKey, deletes.last?.idempotencyKey)
    }
}
