import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

/// Single-record writes of a server response (push result, 409 "server wins").
final class ApplyServerRecordTests: StoreTestCase {
    func testStoresTheServerVersionOfAJustPushedCreate() throws {
        var dto = try XCTUnwrap(syncFull().items.first)
        dto.title = "Created locally"
        let created = try store.create(ItemRecord(title: "Created locally"))
        let entry = try XCTUnwrap(store.nextPending())

        try store.remapServerId(entity: .item, localId: created.localId, serverId: dto.id)
        try store.markDone(entry.id)
        try store.applyServerRecord(dto)

        let row = try XCTUnwrap(store.dbQueue.read { try ItemRecord.fetchOne($0, key: created.localId) })
        XCTAssertEqual(row.serverId, dto.id)
        XCTAssertEqual(row.updatedAt.epochMilliseconds, dto.updatedAt.epochMilliseconds)
        XCTAssertEqual(try count("item"), 1)
    }

    func testAProtectedRowIsLeftAloneUnlessOverridden() throws {
        try store.apply(sync: syncFull())
        var dto = try XCTUnwrap(syncFull().items.first)
        let row = try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("server_id") == dto.id).fetchOne($0) })
        try store.update(ItemRecord.self, localId: row.localId) { $0.title = "Mine" }
        dto.title = "Theirs"

        try store.applyServerRecord(dto)
        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: row.localId) }?.title, "Mine")

        try store.applyServerRecord(dto, overridingLocalChanges: true)
        let after = try XCTUnwrap(store.dbQueue.read { try ItemRecord.fetchOne($0, key: row.localId) })
        XCTAssertEqual(after.title, "Theirs")
        XCTAssertEqual(after.localId, row.localId)
    }

    func testOverridingANoteReplacesItsTags() throws {
        try store.apply(sync: syncFull())
        var dto = try XCTUnwrap(syncIncremental().notes.first)
        dto.title = "Server note"
        let note = try XCTUnwrap(store.dbQueue.read { try NoteRecord.fetchOne($0) })
        try store.update(NoteRecord.self, localId: note.localId) { $0.title = "Mine" }

        try store.applyServerRecord(dto, overridingLocalChanges: true)

        XCTAssertEqual(try store.dbQueue.read { try NoteRecord.load($0, localId: note.localId) }?.tagIds, [])
        XCTAssertEqual(try store.dbQueue.read { try NoteRecord.load($0, localId: note.localId) }?.title, "Server note")
    }

    func testEveryDtoKindIsAccepted() throws {
        let full = try syncFull()
        try store.applyServerRecord(full.goals[0])
        try store.applyServerRecord(full.projects[0])
        try store.applyServerRecord(full.noteTags[0])
        try store.applyServerRecord(full.items[0])
        try store.applyServerRecord(full.itemOccurrences[0])
        try store.applyServerRecord(full.notes[0])
        for table in ["goal", "project", "note_tag", "item", "item_occurrence", "note"] {
            XCTAssertEqual(try count(table), 1, table)
        }
    }
}
