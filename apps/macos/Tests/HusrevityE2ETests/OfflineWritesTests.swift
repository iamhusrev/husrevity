import HusrevityCore
import XCTest

/// Scenario 1: everything written while offline is kept locally and reaches the server once the
/// network is back.
final class OfflineWritesTests: E2ECase {
    func testOfflineWritesSurviveAndPushOnReconnect() async throws {
        let scheduledAt = try XCTUnwrap(isoDate("2031-03-10T06:00:00.000Z"))  // 09:00 in Istanbul
        let occursOn = "2031-03-10"

        // 1. Write with the gate closed.
        transport.goOffline()
        let noteTag = try store.create(NoteTagRecord(name: "\(uid!)-tag"))
        let note = try store.create(
            NoteRecord(title: "\(uid!) note", bodyMarkdown: "written offline", tagIds: [noteTag.localId]))
        let project = try store.create(ProjectRecord(code: projectCode(), name: "\(uid!) project"))
        let item = try store.create(
            ItemRecord(
                kind: "event", title: "\(uid!) standup", scheduledAt: scheduledAt, durationMin: 15,
                rrule: "FREQ=DAILY;COUNT=5"))
        try store.completeItem(localId: item.localId, occursOn: occursOn)
        XCTAssertEqual(try store.outboxCount(), 5, "tag, note, project, item and the occurrence completion are queued")

        // 2. Offline sync: reported as offline, nothing lost, nothing sent.
        let offline = await engine.syncNow()
        XCTAssertEqual(offline.result, .offline)
        XCTAssertEqual(offline.pushed, 0)
        XCTAssertFalse(offline.pulled)
        XCTAssertEqual(try store.outboxCount(), 5)
        XCTAssertEqual(try localNote(titled: note.title).tagIds, [noteTag.localId])
        XCTAssertEqual(try localItem(titled: item.title).source, "macos")
        XCTAssertEqual(try store.occurrences(from: occursOn, to: occursOn).first?.status, "done")
        XCTAssertTrue(transport.log.allSatisfy { $0.outcome == .offline }, "no request may reach the server")
        let serverNotesWhileOffline = try await serverNotes()
        XCTAssertTrue(serverNotesWhileOffline.isEmpty)
        _ = project

        // 3. Back online: everything is pushed.
        transport.goOnline()
        let online = await engine.syncNow()
        XCTAssertEqual(online.result, .synced)
        XCTAssertEqual(online.pushed, 5)
        XCTAssertEqual(online.parked, 0)
        XCTAssertEqual(online.conflicts, 0)
        XCTAssertTrue(online.pulled)
        XCTAssertEqual(try store.outboxCount(), 0)

        // 4. A separate raw client sees it all.
        let tagServerId = try XCTUnwrap(try localTag(named: "\(uid!)-tag").serverId)
        let noteServerId = try XCTUnwrap(try localNote(titled: note.title).serverId)
        let itemServerId = try XCTUnwrap(try localItem(titled: item.title).serverId)
        let projectServerId = try XCTUnwrap(try localProject(named: "\(uid!) project").serverId)

        let serverNoteList = try await serverNotes()
        let listedNote = try XCTUnwrap(serverNoteList.first { $0["id"] as? String == noteServerId })
        XCTAssertEqual(listedNote["title"] as? String, note.title)
        XCTAssertEqual(listedNote["bodyMarkdown"] as? String, "written offline")
        let noteTags = (listedNote["tags"] as? [[String: Any]]) ?? []
        XCTAssertEqual(noteTags.compactMap { $0["id"] as? String }, [tagServerId])
        XCTAssertEqual(noteTags.compactMap { $0["name"] as? String }, ["\(uid!)-tag"])

        let serverItem = try await serverItem(itemServerId).object
        XCTAssertEqual(serverItem["title"] as? String, item.title)
        XCTAssertEqual(serverItem["source"] as? String, "macos")
        XCTAssertEqual(serverItem["rrule"] as? String, "FREQ=DAILY;COUNT=5")
        XCTAssertEqual(serverItem["kind"] as? String, "event")
        XCTAssertEqual(serverItem["durationMin"] as? Int, 15)
        XCTAssertEqual(isoDate(serverItem["scheduledAt"] as? String ?? ""), scheduledAt)
        XCTAssertEqual(serverItem["status"] as? String, "open", "completing one occurrence keeps the series open")

        let serverProjectList = try await serverProjects()
        let listedProject = try XCTUnwrap(serverProjectList.first { $0["id"] as? String == projectServerId })
        XCTAssertEqual(listedProject["name"] as? String, "\(uid!) project")
        XCTAssertEqual(listedProject["code"] as? String, projectCode())

        let snapshot = try await serverSnapshot()
        let occurrences = (snapshot["itemOccurrences"] as? [[String: Any]]) ?? []
        let occurrence = try XCTUnwrap(occurrences.first { $0["itemId"] as? String == itemServerId })
        XCTAssertEqual(occurrence["occursOn"] as? String, occursOn)
        XCTAssertEqual(occurrence["status"] as? String, "done")

        // 5. Local rows now carry server ids and nothing is duplicated.
        XCTAssertEqual(try store.tags().count, 1)
        XCTAssertEqual(try store.notes().count, 1)
        XCTAssertEqual(try store.projects().count, 1)
        XCTAssertEqual(try store.items().count, 1)
        XCTAssertEqual(try store.items().first?.localId, item.localId, "the pull must reuse the local row")
        XCTAssertEqual(try store.notes().first?.localId, note.localId)
        let localOccurrence = try XCTUnwrap(try store.occurrences(from: occursOn, to: occursOn).first)
        XCTAssertEqual(localOccurrence.serverId, occurrence["id"] as? String)
        XCTAssertEqual(localOccurrence.itemId, itemServerId)
        XCTAssertNotNil(try store.cursor())
        XCTAssertTrue(try store.failedOutbox().isEmpty)
        XCTAssertTrue(try store.unresolvedConflicts().isEmpty)
    }
}
