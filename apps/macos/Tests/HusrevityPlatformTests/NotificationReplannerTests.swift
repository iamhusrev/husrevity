import Foundation
import HusrevityStore
import XCTest
@testable import HusrevityPlatform

final class NotificationReplannerTests: XCTestCase {
    var directory: URL!
    var store: LocalStore!
    var scheduler: FakeNotificationScheduler!
    var clock: Date = at("2026-03-10 08:00")

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("husrevity-platform-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        store = try LocalStore(path: directory.appendingPathComponent("store.sqlite").path)
        scheduler = FakeNotificationScheduler()
        clock = at("2026-03-10 08:00")
    }

    override func tearDownWithError() throws {
        store = nil
        try? FileManager.default.removeItem(at: directory)
    }

    func makeReplanner() -> NotificationReplanner {
        let planner = NotificationPlanner(timeZone: istanbul, expand: makeExpander())
        let current = clock
        return NotificationReplanner(store: store, scheduler: scheduler, planner: planner, now: { current })
    }

    @discardableResult
    func add(_ title: String, at when: String, notify: Int? = 15, rrule: String? = nil) throws -> ItemRecord {
        try store.create(ItemRecord(
            title: title, scheduledAt: at(when), notifyMinutesBefore: notify, rrule: rrule))
    }

    func pendingIds() async -> [String] { await scheduler.pendingIdentifiers() }

    func testSchedulesPlannedItems() async throws {
        let a = try add("A", at: "2026-03-10 09:00")
        try add("B", at: "2026-03-10 10:00", notify: nil)
        await makeReplanner().replan()
        let ids = await pendingIds()
        XCTAssertEqual(ids, ["item:\(a.localId)"])
    }

    func testReplanWithoutChangesDoesNotTouchTheScheduler() async throws {
        try add("A", at: "2026-03-10 09:00")
        let replanner = makeReplanner()
        await replanner.replan()
        await replanner.replan()
        let applied = await scheduler.appliedDiffs.count
        XCTAssertEqual(applied, 1)
    }

    func testEditedItemIsReplacedNotDuplicated() async throws {
        let a = try add("A", at: "2026-03-10 09:00")
        let replanner = makeReplanner()
        await replanner.replan()
        try store.update(ItemRecord.self, localId: a.localId) { $0.scheduledAt = at("2026-03-10 11:00") }
        await replanner.replan()
        let pending = await scheduler.pendingList()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.fireAt, at("2026-03-10 10:45"))
    }

    func testCompletedAndDeletedItemsAreRemoved() async throws {
        let a = try add("A", at: "2026-03-10 09:00")
        let b = try add("B", at: "2026-03-10 10:00")
        let replanner = makeReplanner()
        await replanner.replan()
        try store.completeItem(localId: a.localId)
        try store.delete(ItemRecord.self, localId: b.localId)
        await replanner.replan()
        let ids = await pendingIds()
        XCTAssertEqual(ids, [])
    }

    func testDoneOccurrenceOfARecurringItemIsRemovedButTheSeriesStays() async throws {
        let r = try add("Spor", at: "2026-03-09 09:00", rrule: "FREQ=DAILY")
        let replanner = makeReplanner()
        await replanner.replan()
        let before = await pendingIds()
        XCTAssertTrue(before.contains("item:\(r.localId):2026-03-11T09:00+0300"))
        try store.completeItem(localId: r.localId, occursOn: "2026-03-11")
        await replanner.replan()
        let after = await pendingIds()
        XCTAssertFalse(after.contains("item:\(r.localId):2026-03-11T09:00+0300"))
        XCTAssertTrue(after.contains("item:\(r.localId):2026-03-10T09:00+0300"))
        XCTAssertTrue(after.contains("item:\(r.localId):2026-03-12T09:00+0300"))
    }

    func testDeniedPermissionNeverThrowsAndSchedulesNothing() async throws {
        await scheduler.setGranted(false)
        try add("A", at: "2026-03-10 09:00")
        let replanner = makeReplanner()
        await replanner.replan()
        await replanner.replan()
        let ids = await pendingIds()
        XCTAssertEqual(ids, [])
    }

    func testNotificationsThatAreNotOursSurvive() async throws {
        await scheduler.seed(PlannedNotification(identifier: "other:1", fireAt: at("2026-03-11 09:00"), title: "x", body: "y"))
        try add("A", at: "2026-03-10 09:00")
        await makeReplanner().replan()
        let ids = await pendingIds()
        XCTAssertTrue(ids.contains("other:1"))
        XCTAssertEqual(ids.count, 2)
    }

    func testRunReplansOncePerTriggerAndStopsWhenTheStreamEnds() async throws {
        let replanner = makeReplanner()
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        let finished = Task { await replanner.run(triggers: stream) }
        try add("A", at: "2026-03-10 09:00")
        continuation.yield()
        try add("B", at: "2026-03-10 10:00")
        continuation.yield()
        continuation.finish()
        await finished.value
        let ids = await pendingIds()
        XCTAssertEqual(ids.count, 2)
    }

    func testStoreTriggersEmitInitiallyAndAfterLocalWrites() async throws {
        let triggers = NotificationReplanner.storeTriggers(store: store)
        var iterator = triggers.makeAsyncIterator()
        _ = await iterator.next()  // initial emission
        try add("A", at: "2026-03-10 09:00")
        let next = await iterator.next()
        XCTAssertNotNil(next)
    }

    func testMergeForwardsEveryStreamAndFinishesWhenAllFinish() async {
        let (one, c1) = AsyncStream<Void>.makeStream()
        let (two, c2) = AsyncStream<Void>.makeStream()
        c1.yield(); c1.yield(); c2.yield()
        c1.finish(); c2.finish()
        var count = 0
        for await _ in TriggerMerge.merge([one, two]) { count += 1 }
        XCTAssertEqual(count, 3)
    }
}
