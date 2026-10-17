import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

final class ReadTests: StoreTestCase {
    private func at(_ iso: String) -> Date { Wire.parseDate(iso)! }

    /// Creates and pulls a small fixed dataset through the public local-write API.
    @discardableResult
    private func item(
        _ title: String, kind: String = "task", status: String = "open", scheduled: String? = nil,
        due: String? = nil
    ) throws -> ItemRecord {
        try store.create(
            ItemRecord(
                kind: kind, title: title, scheduledAt: scheduled.map(at), dueAt: due.map(at), status: status
            )
        )
    }

    private func titles(_ items: [ItemRecord]) -> [String] { items.map(\.title) }

    func testItemsFilterByStatusKindAndDateRange() throws {
        try item("A", scheduled: "2026-03-01T09:00:00.000Z")
        try item("B", status: "done", scheduled: "2026-03-02T09:00:00.000Z")
        try item("C")
        try item("D", due: "2026-03-03T09:00:00.000Z")
        try item("E", kind: "event", scheduled: "2026-03-01T12:00:00.000Z")

        XCTAssertEqual(Set(titles(try store.items())), ["A", "B", "C", "D", "E"])
        XCTAssertEqual(Set(titles(try store.items(status: "open"))), ["A", "C", "D", "E"])
        XCTAssertEqual(titles(try store.items(kind: "event")), ["E"])
        XCTAssertEqual(
            titles(try store.items(from: at("2026-03-01T00:00:00.000Z"), to: at("2026-03-02T00:00:00.000Z"))),
            ["A", "E"], "ordered by time; the range is half-open"
        )
        XCTAssertEqual(
            titles(try store.items(from: at("2026-03-03T00:00:00.000Z"), to: at("2026-03-04T00:00:00.000Z"))),
            ["D"], "due dates count for the range"
        )
        XCTAssertEqual(titles(try store.items(status: "done", kind: "task")), ["B"])
    }

    func testInboxIsOpenItemsWithoutScheduledOrDueDate() throws {
        try item("scheduled", scheduled: "2026-03-01T09:00:00.000Z")
        try item("due", due: "2026-03-01T09:00:00.000Z")
        try item("done undated", status: "done")
        let first = try item("inbox 1")
        try item("inbox 2")
        XCTAssertEqual(titles(try store.inboxItems()), ["inbox 1", "inbox 2"])
        try store.delete(ItemRecord.self, localId: first.localId)
        XCTAssertEqual(titles(try store.inboxItems()), ["inbox 2"], "pending deletes are hidden")
    }

    func testOccurrencesByInclusiveDateRange() throws {
        let owner = try item("Daily")
        try store.dbQueue.write { db in
            for day in ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"] {
                try ItemOccurrenceRecord(itemId: owner.reference, occursOn: day).insert(db)
            }
        }
        XCTAssertEqual(try store.occurrences(from: "2026-03-02", to: "2026-03-03").map(\.occursOn), ["2026-03-02", "2026-03-03"])
    }

    func testNotesFilterBySearchTagAndArchived() throws {
        let work = try store.create(NoteTagRecord(name: "work"))
        let home = try store.create(NoteTagRecord(name: "home"))
        try store.create(NoteRecord(title: "Plan the week", bodyMarkdown: "ship SYNC", tagIds: [work.localId]))
        try store.create(NoteRecord(title: "Groceries", bodyMarkdown: "milk 100%", tagIds: [home.localId]))
        try store.create(NoteRecord(title: "Old plan", archived: true, tagIds: [work.localId]))
        try store.create(NoteRecord(title: "Pinned", pinned: true, position: 9))

        XCTAssertEqual(try store.notes().map(\.title).first, "Pinned", "pinned notes come first")
        XCTAssertEqual(Set(try store.notes().map(\.title)), ["Plan the week", "Groceries", "Pinned"])
        XCTAssertEqual(try store.notes(archived: true).map(\.title), ["Old plan"])
        XCTAssertEqual(try store.notes(search: "sync").map(\.title), ["Plan the week"], "case-insensitive, body included")
        XCTAssertEqual(try store.notes(search: "100%").map(\.title), ["Groceries"], "LIKE wildcards are escaped")
        XCTAssertEqual(try store.notes(search: "%").map(\.title), ["Groceries"])
        XCTAssertEqual(try store.notes(tagId: work.localId).map(\.title), ["Plan the week"])
        XCTAssertEqual(try store.notes(tagId: home.localId).first?.tagIds, [home.localId], "tag ids are filled in")
    }

    func testProjectsGoalsAndTags() throws {
        try store.create(ProjectRecord(code: "B", name: "Beta"))
        try store.create(ProjectRecord(code: "A", name: "Alpha"))
        try store.create(ProjectRecord(code: "Z", name: "Zeta", archived: true))
        try store.create(GoalRecord(title: "Y", horizon: "year", periodStart: "2026-01-01", periodEnd: "2026-12-31"))
        try store.create(GoalRecord(title: "Q", horizon: "quarter", periodStart: "2026-01-01", periodEnd: "2026-03-31"))
        let tagB = try store.create(NoteTagRecord(name: "bravo"))
        try store.create(NoteTagRecord(name: "alpha"))

        XCTAssertEqual(try store.projects().map(\.name), ["Alpha", "Beta"])
        XCTAssertEqual(try store.projects(archived: true).map(\.name), ["Zeta"])
        XCTAssertEqual(try store.goals().map(\.title), ["Q", "Y"], "ordered by period start then end")
        XCTAssertEqual(try store.tags().map(\.name), ["alpha", "bravo"])
        try store.delete(NoteTagRecord.self, localId: tagB.localId)
        XCTAssertEqual(try store.tags().map(\.name), ["alpha"], "unsynced deleted tags disappear")
    }

    func testPulledDataIsReadable() throws {
        try store.apply(sync: syncFull())
        XCTAssertEqual(Set(titles(try store.items())), ["Run", "Pay rent"])
        XCTAssertEqual(try store.notes().first?.tagIds.count, 1)
        XCTAssertEqual(try store.occurrences(from: "2026-02-01", to: "2026-02-28").count, 1)
    }

    // MARK: observation

    private func next<T: Sendable>(_ iterator: inout AsyncStream<T>.AsyncIterator) async throws -> T {
        try await withThrowingTaskGroup(of: T?.self) { [iterator] group in
            var it = iterator
            group.addTask { await it.next() }
            group.addTask {
                try await Task.sleep(nanoseconds: 5_000_000_000)
                return nil
            }
            let first = try await group.next()!
            group.cancelAll()
            return try XCTUnwrap(first)
        }
    }

    func testObservationEmitsTheCurrentValueAndThenEveryChange() async throws {
        let stream = store.observeInboxItems()
        var iterator = stream.makeAsyncIterator()
        let initial = try await next(&iterator)
        XCTAssertEqual(initial, [])

        try store.create(ItemRecord(title: "new"))

        var latest = try await next(&iterator)
        while latest.isEmpty { latest = try await next(&iterator) }
        XCTAssertEqual(latest.map(\.title), ["new"])
    }

    func testOutboxCountObservation() async throws {
        let stream = store.observeOutboxCount()
        var iterator = stream.makeAsyncIterator()
        var count = try await next(&iterator)
        XCTAssertEqual(count, 0)

        try store.create(ItemRecord(title: "x"))
        while count == 0 { count = try await next(&iterator) }
        XCTAssertEqual(count, 1)
    }
}
