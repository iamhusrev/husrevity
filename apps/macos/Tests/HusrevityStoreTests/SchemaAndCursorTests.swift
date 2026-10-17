import GRDB
import XCTest
@testable import HusrevityStore

final class SchemaAndCursorTests: StoreTestCase {
    private func tableNames(_ s: LocalStore) throws -> Set<String> {
        try s.dbQueue.read {
            Set(try String.fetchAll($0, sql: "SELECT name FROM sqlite_master WHERE type='table'"))
        }
    }

    func testMigrationCreatesTheSchemaOnAFreshFile() throws {
        let tables = try tableNames(store)
        for expected in [
            "item", "item_occurrence", "note", "note_tag", "note_tag_assignment", "project", "goal",
            "outbox", "sync_state", "conflicts",
        ] {
            XCTAssertTrue(tables.contains(expected), "missing table \(expected)")
        }
    }

    func testEntityTablesHaveLocalAndServerIdColumns() throws {
        for entity in SyncEntity.allCases {
            let columns = try store.dbQueue.read { try $0.columns(in: entity.table).map(\.name) }
            XCTAssertTrue(columns.contains("local_id"), entity.table)
            XCTAssertTrue(columns.contains("server_id"), entity.table)
            XCTAssertTrue(columns.contains("updated_at"), entity.table)
        }
    }

    func testReopeningAnExistingFileKeepsDataAndAppliesNoMigrationTwice() throws {
        try store.setCursor("abc")
        store = nil
        let reopened = try LocalStore(path: path)
        XCTAssertEqual(try reopened.cursor(), "abc")
        let applied = try reopened.dbQueue.read { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM grdb_migrations") ?? 0 }
        let appliedAgain = try LocalStore(path: path).dbQueue.read {
            try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM grdb_migrations") ?? 0
        }
        XCTAssertGreaterThan(applied, 0)
        XCTAssertEqual(applied, appliedAgain)
    }

    func testCursorIsNilOnAFreshStore() throws {
        XCTAssertNil(try store.cursor())
    }

    func testSetCursorRoundTripsAndOverwrites() throws {
        try store.setCursor("2026-10-17T21:02:07.301Z")
        XCTAssertEqual(try store.cursor(), "2026-10-17T21:02:07.301Z")
        try store.setCursor("later")
        XCTAssertEqual(try store.cursor(), "later")
    }
}
