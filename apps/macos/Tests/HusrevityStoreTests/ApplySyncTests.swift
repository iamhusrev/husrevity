import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

final class ApplySyncTests: StoreTestCase {
    private func items() throws -> [ItemRecord] {
        try store.dbQueue.read { try ItemRecord.order(Column("server_id")).fetchAll($0) }
    }
    private func notes() throws -> [NoteRecord] {
        try store.dbQueue.read { try NoteRecord.fetchAll($0) }
    }
    private func tagNames(of note: NoteRecord) throws -> [String] {
        try store.dbQueue.read { db in
            try String.fetchAll(db, sql: """
                SELECT t.name FROM note_tag_assignment a JOIN note_tag t ON t.local_id = a.tag_local_id
                WHERE a.note_local_id = ? ORDER BY t.name
                """, arguments: [note.localId])
        }
    }

    // MARK: full sync

    func testApplyingTheFullSyncStoresEveryCollectionWithFreshLocalIds() throws {
        let sync = try syncFull()
        try store.apply(sync: sync)

        XCTAssertEqual(try count("item"), sync.items.count)
        XCTAssertEqual(try count("item_occurrence"), sync.itemOccurrences.count)
        XCTAssertEqual(try count("note"), sync.notes.count)
        XCTAssertEqual(try count("note_tag"), sync.noteTags.count)
        XCTAssertEqual(try count("project"), sync.projects.count)
        XCTAssertEqual(try count("goal"), sync.goals.count)

        let stored = try items()
        XCTAssertEqual(stored.map(\.serverId), sync.items.map(\.id))
        for (record, dto) in zip(stored, sync.items) {
            XCTAssertNotNil(UUID(uuidString: record.localId), "local ids are UUIDs")
            XCTAssertEqual(record.title, dto.title)
            XCTAssertEqual(record.kind, dto.kind)
            XCTAssertEqual(record.rrule, dto.rrule)
            XCTAssertEqual(record.payload, dto.payload)
            XCTAssertEqual(record.scheduledAt?.epochMilliseconds, dto.scheduledAt?.epochMilliseconds)
            XCTAssertEqual(record.updatedAt.epochMilliseconds, dto.updatedAt.epochMilliseconds)
        }
    }

    func testUpdatedAtIsStoredAsEpochMilliseconds() throws {
        let sync = try syncFull()
        try store.apply(sync: sync)
        let stored = try store.dbQueue.read {
            try Int64.fetchOne($0, sql: "SELECT updated_at FROM item WHERE server_id = ?", arguments: [sync.items[0].id])
        }
        XCTAssertEqual(stored, sync.items[0].updatedAt.epochMilliseconds)
    }

    func testApplyStoresNothingOfTheCursor() throws {
        try store.apply(sync: syncFull())
        XCTAssertNil(try store.cursor())
    }

    func testNoteTagsComeFromThePayload() throws {
        try store.apply(sync: syncFull())
        let note = try XCTUnwrap(notes().first)
        XCTAssertEqual(try tagNames(of: note), ["work"])
        XCTAssertEqual(try store.dbQueue.read { try NoteRecord.fetchOne($0, key: note.localId) }?.title, "Plan the week")
    }

    // MARK: idempotency and convergence

    func testApplyingTheSamePayloadTwiceIsANoOp() throws {
        let sync = try syncFull()
        try store.apply(sync: sync)
        let before = try items().map(\.localId)
        let rowsBefore = try store.dbQueue.read { try Row.fetchAll($0, sql: "SELECT * FROM item ORDER BY server_id") }
        try store.apply(sync: sync)
        let rowsAfter = try store.dbQueue.read { try Row.fetchAll($0, sql: "SELECT * FROM item ORDER BY server_id") }
        XCTAssertEqual(try items().map(\.localId), before, "local ids must stay stable")
        XCTAssertEqual(rowsBefore, rowsAfter)
        XCTAssertEqual(try count("note_tag_assignment"), 1)
        XCTAssertEqual(try count("item"), sync.items.count)
    }

    func testFullThenIncrementalYieldsExactlyTheServerState() throws {
        try store.apply(sync: syncFull())
        let runLocalId = try XCTUnwrap(items().first { $0.title == "Run" }).localId

        try store.apply(sync: syncIncremental())

        XCTAssertEqual(try items().map(\.title), ["Run"], "\"Pay rent\" was tombstoned")
        XCTAssertEqual(try items().first?.localId, runLocalId)
        XCTAssertEqual(try count("item_occurrence"), 0)
        XCTAssertEqual(try count("note_tag"), 0)
        XCTAssertEqual(try count("note_tag_assignment"), 0)
        let goal = try store.dbQueue.read { try GoalRecord.fetchAll($0) }
        XCTAssertEqual(goal.map(\.title), ["Ship the Mac app (v1)"])
        let note = try XCTUnwrap(notes().first)
        XCTAssertEqual(note.title, "Plan the week (v2)")
        XCTAssertEqual(try tagNames(of: note), [])
        XCTAssertEqual(try count("project"), 1)
    }

    // MARK: tag tombstones

    func testATagTombstoneRemovesTheTagFromEveryNoteAssignment() throws {
        try store.apply(sync: syncFull())
        // Only the tombstone, without the re-sent note: both paths must converge.
        let tagId = try XCTUnwrap(syncFull().noteTags.first?.id)
        try store.apply(sync: syncJSON(["tombstones": ["noteTags": [tagId]]]))

        XCTAssertEqual(try count("note_tag"), 0)
        XCTAssertEqual(try count("note_tag_assignment"), 0)
        XCTAssertEqual(try count("note"), 1, "the note itself stays")
    }

    func testIncrementalSyncWithTagTombstoneAndResentNoteConverges() throws {
        try store.apply(sync: syncFull())
        try store.apply(sync: syncIncremental())
        XCTAssertEqual(try count("note_tag_assignment"), 0)
        XCTAssertEqual(try count("note_tag"), 0)
    }

    // MARK: atomicity

    func testAFailingRowRollsTheWholeSyncBack() throws {
        try store.dbQueue.write {
            try $0.execute(sql: """
                CREATE TRIGGER boom BEFORE INSERT ON note WHEN NEW.title = 'boom'
                BEGIN SELECT RAISE(ABORT, 'boom'); END
                """)
        }
        var json = try JSONSerialization.jsonObject(with: APICoding.encoder.encode(syncFull())) as! [String: Any]
        var notes = json["notes"] as! [[String: Any]]
        var poisoned = notes[0]
        poisoned["id"] = "99"
        poisoned["title"] = "boom"
        notes.append(poisoned)
        json["notes"] = notes
        let sync = syncJSON(json)

        XCTAssertThrowsError(try store.apply(sync: sync))

        for table in ["item", "item_occurrence", "note", "note_tag", "note_tag_assignment", "project", "goal"] {
            XCTAssertEqual(try count(table), 0, "\(table) must be rolled back")
        }
    }
}
