import HusrevityCore
import XCTest

/// Scenario 3: another device (the raw client) changes the server; the next sync pulls it.
final class PullTests: E2ECase {
    func testServerChangesArriveIncludingTombstonesAndTagRemoval() async throws {
        // The "other device" creates a mixed bag of data.
        let keepTag = try await raw.createTag(name: "\(uid!)-keep")
        let dropTag = try await raw.createTag(name: "\(uid!)-drop")
        let keepTagId = try XCTUnwrap(keepTag["id"] as? String)
        let dropTagId = try XCTUnwrap(dropTag["id"] as? String)
        let note = try await raw.createNote(title: "\(uid!) note", body: "v1", tagIds: [keepTagId, dropTagId])
        let noteId = try XCTUnwrap(note["id"] as? String)
        let survivor = try await raw.createItem(title: "\(uid!) survivor")
        let doomedItem = try await raw.createItem(title: "\(uid!) doomed item")
        let keptProject = try await raw.createProject(code: projectCode("K"), name: "\(uid!) kept project")
        let doomedProject = try await raw.createProject(code: projectCode("D"), name: "\(uid!) doomed project")

        // First pull: everything shows up locally with server ids.
        let first = await engine.syncNow()
        XCTAssertEqual(first.result, .synced)
        XCTAssertTrue(first.pulled)
        XCTAssertEqual(try store.tags().count, 2)
        XCTAssertEqual(try store.items().count, 2)
        XCTAssertEqual(try store.projects().count, 2)
        let pulledNote = try XCTUnwrap(try localNote(serverId: noteId))
        XCTAssertEqual(pulledNote.title, "\(uid!) note")
        XCTAssertEqual(pulledNote.bodyMarkdown, "v1")
        let tagNames = Dictionary(uniqueKeysWithValues: try store.tags().map { ($0.localId, $0.name) })
        XCTAssertEqual(Set(pulledNote.tagIds.compactMap { tagNames[$0] }), ["\(uid!)-keep", "\(uid!)-drop"])
        XCTAssertEqual(try localItem(titled: "\(uid!) survivor").serverId, survivor["id"] as? String)

        // The other device edits, soft-deletes and deletes a tag.
        try raw.expect(
            200,
            try await raw.put("/notes/\(noteId)", ["title": "\(uid!) note v2", "bodyMarkdown": "v2", "tagIds": [keepTagId, dropTagId]]))
        try raw.expect(204, try await raw.delete("/items/\(try XCTUnwrap(doomedItem["id"] as? String))"))
        try raw.expect(204, try await raw.delete("/projects/\(try XCTUnwrap(doomedProject["id"] as? String))"))
        try raw.expect(204, try await raw.delete("/note-tags/\(dropTagId)"))

        // Second pull.
        let second = await engine.syncNow()
        XCTAssertEqual(second.result, .synced)
        XCTAssertEqual(second.pushed, 0)
        XCTAssertTrue(second.pulled)

        let updated = try XCTUnwrap(try localNote(serverId: noteId))
        XCTAssertEqual(updated.title, "\(uid!) note v2")
        XCTAssertEqual(updated.bodyMarkdown, "v2")
        XCTAssertEqual(updated.localId, pulledNote.localId, "the pull updates the row in place")

        // Tombstones.
        XCTAssertEqual(try store.items().map(\.title), ["\(uid!) survivor"], "the deleted item is gone")
        XCTAssertEqual(
            try store.projects().compactMap(\.serverId), [try XCTUnwrap(keptProject["id"] as? String)],
            "the deleted project is gone")

        // Deleting a tag server-side also strips it from the note locally.
        XCTAssertEqual(try store.tags().map(\.name), ["\(uid!)-keep"])
        let remainingNames = updated.tagIds.compactMap { id in try? store.tags().first { $0.localId == id }?.name }
        XCTAssertEqual(remainingNames, ["\(uid!)-keep"])
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    func testIncrementalPullOnlyBringsWhatChanged() async throws {
        let one = try await raw.createNote(title: "\(uid!) one")
        let first = await engine.syncNow()
        XCTAssertEqual(first.result, .synced)
        let cursorAfterFirst = try XCTUnwrap(try store.cursor())

        transport.resetLog()
        let two = try await raw.createNote(title: "\(uid!) two")
        let second = await engine.syncNow()
        XCTAssertEqual(second.result, .synced)
        let pull = try XCTUnwrap(transport.log.first { $0.method == "GET" && $0.path == "/sync" })
        XCTAssertEqual(pull.query?.removingPercentEncoding, "since=\(cursorAfterFirst)")
        XCTAssertEqual(Set(try store.notes().compactMap(\.serverId)), [try XCTUnwrap(one["id"] as? String), try XCTUnwrap(two["id"] as? String)])
        XCTAssertNotEqual(try store.cursor(), cursorAfterFirst)
    }
}
