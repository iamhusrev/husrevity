import HusrevityCore
import XCTest

/// Scenario 6: rows created offline that reference each other by `local:<uuid>` placeholders are
/// pushed in order and the references are remapped to the real server ids.
final class DependentCreatesTests: E2ECase {
    func testProjectItemTagAndNoteArePushedInOrderWithRemappedReferences() async throws {
        transport.goOffline()
        let project = try store.create(ProjectRecord(code: projectCode(), name: "\(uid!) project"))
        let item = try store.create(ItemRecord(title: "\(uid!) item in project", projectId: project.reference))
        let noteTag = try store.create(NoteTagRecord(name: "\(uid!)-fresh"))
        let note = try store.create(NoteRecord(title: "\(uid!) tagged note", tagIds: [noteTag.localId]))

        XCTAssertTrue(try XCTUnwrap(try localItem(titled: item.title).projectId).hasPrefix(LocalReference.prefix))
        XCTAssertEqual(try store.outboxCount(), 4)
        let offline = await engine.syncNow()
        XCTAssertEqual(offline.result, .offline)

        transport.goOnline()
        transport.resetLog()
        let outcome = await engine.syncNow()
        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(outcome.pushed, 4)
        XCTAssertEqual(outcome.parked, 0)
        XCTAssertEqual(try store.outboxCount(), 0)

        // Pushed in the order they were created.
        let writes = transport.log.filter { $0.method == "POST" }.map(\.path)
        XCTAssertEqual(writes, ["/projects", "/items", "/note-tags", "/notes"])

        // The server stores real ids, not placeholders.
        let projectId = try XCTUnwrap(try localProject(named: project.name).serverId)
        let itemId = try XCTUnwrap(try localItem(titled: item.title).serverId)
        let tagId = try XCTUnwrap(try localTag(named: noteTag.name).serverId)
        let noteId = try XCTUnwrap(try localNote(titled: note.title).serverId)

        let serverItem = try await serverItem(itemId).object
        XCTAssertEqual(serverItem["projectId"] as? String, projectId)
        XCTAssertFalse((serverItem["projectId"] as? String ?? "").contains("local:"))

        let serverNote = try await self.serverNote(noteId).object
        let serverTagIds = ((serverNote["tags"] as? [[String: Any]]) ?? []).compactMap { $0["id"] as? String }
        XCTAssertEqual(serverTagIds, [tagId])

        // Local references were remapped too.
        XCTAssertEqual(try localItem(titled: item.title).projectId, projectId)
        let localNoteRow = try localNote(titled: note.title)
        XCTAssertEqual(localNoteRow.tagIds.count, 1)
        XCTAssertEqual(try store.tags().first { $0.localId == localNoteRow.tagIds[0] }?.serverId, tagId)

        // A pull afterwards changes nothing and creates no duplicates.
        let again = await engine.syncNow()
        XCTAssertEqual(again.result, .synced)
        XCTAssertEqual(try store.items().count, 1)
        XCTAssertEqual(try store.notes().count, 1)
        XCTAssertEqual(try store.projects().count, 1)
        XCTAssertEqual(try store.tags().count, 1)
        XCTAssertEqual(try localItem(titled: item.title).projectId, projectId)
    }

    func testEditingARowBeforeItsCreateIsPushedStillProducesOneServerRow() async throws {
        transport.goOffline()
        let note = try store.create(NoteRecord(title: "\(uid!) draft"))
        try store.update(NoteRecord.self, localId: note.localId) { $0.title = "\(uid!) final" }
        transport.goOnline()
        try await syncUntilDrained()

        let titles = try await serverNotes().compactMap { $0["title"] as? String }
        XCTAssertEqual(titles, ["\(uid!) final"])
        XCTAssertEqual(try store.notes().count, 1)
    }
}
