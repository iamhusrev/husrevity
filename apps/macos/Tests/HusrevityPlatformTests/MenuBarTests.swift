import Foundation
import HusrevityStore
import XCTest
@testable import HusrevityPlatform

final class MenuBarSnapshotTests: XCTestCase {
    let now = at("2026-03-10 12:00")

    func build(_ items: [ItemRecord], _ occurrences: [ItemOccurrenceRecord] = [], now: Date? = nil) -> MenuBarSnapshot {
        MenuBarSnapshotBuilder(timeZone: istanbul, expand: makeExpander())
            .build(items: items, occurrences: occurrences, now: now ?? self.now)
    }

    func testCountsOpenItemsOnTodaysLocalDayIncludingEarlierHours() {
        let snapshot = build([
            item("A", scheduledAt: at("2026-03-10 07:00")),
            item("B", scheduledAt: at("2026-03-10 18:00")),
            item("C", dueAt: at("2026-03-10 23:30")),
        ])
        XCTAssertEqual(snapshot.openTodayCount, 3)
    }

    func testMidnightBoundariesFollowTheLocalZoneNotUTC() {
        let snapshot = build([
            item("LATE", scheduledAt: at("2026-03-10 23:59")),   // today
            item("NEXT", scheduledAt: at("2026-03-11 00:00")),   // tomorrow
            item("EARLY", scheduledAt: at("2026-03-10 00:00")),  // today (21:00Z the day before)
            item("PREV", scheduledAt: at("2026-03-09 23:59")),   // yesterday
        ])
        XCTAssertEqual(snapshot.openTodayCount, 2)
    }

    func testDoneCancelledUndatedAndLogItemsAreNotCounted() {
        let when = at("2026-03-10 15:00")
        var log = item("LOG", scheduledAt: when)
        log.kind = "log"
        let snapshot = build([
            item("DONE", scheduledAt: when, status: "done"),
            item("CANCELLED", scheduledAt: when, status: "cancelled"),
            item("INBOX"),
            log,
            item("OK", scheduledAt: when),
        ])
        XCTAssertEqual(snapshot.openTodayCount, 1)
    }

    func testRecurringItemCountsOncePerDayAndNotWhenTodaysOccurrenceIsDone() {
        let series = item("R", scheduledAt: at("2026-03-01 09:00"), rrule: "FREQ=DAILY")
        XCTAssertEqual(build([series]).openTodayCount, 1)
        let done = [occurrence("local:R", "2026-03-10", status: "done")]
        XCTAssertEqual(build([series], done).openTodayCount, 0)
    }

    func testUpcomingIsTheNextThreeOpenEntriesInTimeOrder() {
        let snapshot = build([
            item("E", scheduledAt: at("2026-03-12 09:00")),
            item("PAST", scheduledAt: at("2026-03-10 09:00")),
            item("B", scheduledAt: at("2026-03-10 13:00")),
            item("D", scheduledAt: at("2026-03-11 09:00")),
            item("C", scheduledAt: at("2026-03-10 20:00")),
        ])
        XCTAssertEqual(snapshot.upcoming.map(\.title), ["Task", "Task", "Task"])
        XCTAssertEqual(snapshot.upcoming.map(\.id), ["B", "C", "D"])
        XCTAssertEqual(snapshot.upcoming.map(\.at), [at("2026-03-10 13:00"), at("2026-03-10 20:00"), at("2026-03-11 09:00")])
    }

    func testUpcomingIncludesRecurringOccurrencesAndSkipsClosedOnes() {
        let series = item("R", title: "Spor", scheduledAt: at("2026-03-01 18:00"), rrule: "FREQ=DAILY")
        let snapshot = build(
            [series], [occurrence("local:R", "2026-03-10", status: "done")])
        XCTAssertEqual(snapshot.upcoming.first?.at, at("2026-03-11 18:00"))
        XCTAssertEqual(snapshot.upcoming.first?.id, "R:2026-03-11")
        XCTAssertEqual(snapshot.upcoming.count, 3)
    }

    func testUpcomingTiesAreBrokenByIdentifier() {
        let when = at("2026-03-10 15:00")
        let snapshot = build([item("B", scheduledAt: when), item("A", scheduledAt: when)])
        XCTAssertEqual(snapshot.upcoming.map(\.id), ["A", "B"])
    }

    func testUpcomingIgnoresEntriesBeyondTheLookahead() {
        let snapshot = build([item("FAR", scheduledAt: at("2026-04-20 09:00"))])
        XCTAssertEqual(snapshot.upcoming, [])
    }

    func testEntryDueExactlyNowIsStillUpcoming() {
        let snapshot = build([item("NOW", scheduledAt: now)])
        XCTAssertEqual(snapshot.upcoming.map(\.id), ["NOW"])
    }

    func testEmptyStoreGivesAnEmptySnapshot() {
        XCTAssertEqual(build([]), MenuBarSnapshot(openTodayCount: 0, upcoming: []))
    }
}

@MainActor
final class MenuBarModelTests: XCTestCase {
    var directory: URL!
    var store: LocalStore!
    var clock = at("2026-03-10 12:00")

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("husrevity-menubar-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        store = try LocalStore(path: directory.appendingPathComponent("store.sqlite").path)
    }

    override func tearDownWithError() throws {
        store = nil
        try? FileManager.default.removeItem(at: directory)
    }

    func makeModel(onQuickAdd: @escaping (String) -> Void = { _ in }) -> MenuBarModel {
        let current = clock
        return MenuBarModel(
            store: store,
            builder: MenuBarSnapshotBuilder(timeZone: istanbul, expand: makeExpander()),
            now: { current }, onQuickAdd: onQuickAdd)
    }

    func testReloadReadsTheStore() throws {
        try store.create(ItemRecord(title: "A", scheduledAt: at("2026-03-10 15:00")))
        try store.create(ItemRecord(title: "B", scheduledAt: at("2026-03-11 15:00")))
        let model = makeModel()
        XCTAssertEqual(model.snapshot, MenuBarSnapshot(openTodayCount: 0, upcoming: []))
        model.reload()
        XCTAssertEqual(model.snapshot.openTodayCount, 1)
        XCTAssertEqual(model.snapshot.upcoming.map(\.title), ["A", "B"])
    }

    func testRunReloadsOnEveryTriggerAndStopsWhenTheStreamEnds() async throws {
        let model = makeModel()
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        try store.create(ItemRecord(title: "A", scheduledAt: at("2026-03-10 15:00")))
        continuation.yield()
        continuation.finish()
        await model.run(triggers: stream)
        XCTAssertEqual(model.snapshot.openTodayCount, 1)
    }

    func testQuickAddSubmitGoesThroughTheClosure() {
        var received: [String] = []
        let model = makeModel { received.append($0) }
        model.quickAdd.show()
        model.quickAdd.flow.text = "süt al"
        model.quickAdd.submit()
        XCTAssertEqual(received, ["süt al"])
        XCTAssertEqual(model.quickAdd.flow.phase, .hidden)
    }
}
