import XCTest
@testable import HusrevityPlatform

final class NotificationDiffTests: XCTestCase {
    func note(_ id: String, _ fire: String = "2026-03-10 09:00", title: String = "T", body: String = "B") -> PlannedNotification {
        PlannedNotification(identifier: id, fireAt: at(fire), title: title, body: body)
    }

    func testNothingChangedMeansAnEmptyDiff() {
        let list = [note("item:A"), note("item:B")]
        let diff = NotificationDiff.make(planned: list, pending: list)
        XCTAssertTrue(diff.isEmpty)
    }

    func testNewPlannedNotificationsAreAdded() {
        let diff = NotificationDiff.make(planned: [note("item:A"), note("item:B")], pending: [note("item:A")])
        XCTAssertEqual(diff.toAdd, [note("item:B")])
        XCTAssertEqual(diff.toRemove, [])
    }

    func testPendingNotificationsNoLongerPlannedAreRemoved() {
        let diff = NotificationDiff.make(planned: [note("item:A")], pending: [note("item:A"), note("item:B")])
        XCTAssertEqual(diff.toAdd, [])
        XCTAssertEqual(diff.toRemove, ["item:B"])
    }

    func testChangedTimeTitleOrBodyIsReplacedByAddingTheSameIdentifier() {
        let pending = [note("item:A"), note("item:B"), note("item:C")]
        let planned = [
            note("item:A", "2026-03-10 10:00"), note("item:B", title: "Renamed"), note("item:C", body: "New"),
        ]
        let diff = NotificationDiff.make(planned: planned, pending: pending)
        XCTAssertEqual(diff.toAdd.map { $0.identifier }, ["item:B", "item:C", "item:A"], "sorted by fire time, then identifier")
        XCTAssertEqual(Set(diff.toAdd), Set(planned))
        XCTAssertEqual(diff.toRemove, [], "re-adding an identifier replaces it, so it must not be removed")
    }

    func testSubSecondDifferencesAreIgnored() {
        let diff = NotificationDiff.make(
            planned: [note("item:A")],
            pending: [PlannedNotification(
                identifier: "item:A", fireAt: at("2026-03-10 09:00").addingTimeInterval(0.4), title: "T", body: "B")])
        XCTAssertTrue(diff.isEmpty)
    }

    func testNotificationsThatAreNotOursAreNeverRemoved() {
        let diff = NotificationDiff.make(planned: [], pending: [note("other:1"), note("item:A")])
        XCTAssertEqual(diff.toRemove, ["item:A"])
    }

    func testOutputIsSortedForDeterminism() {
        let diff = NotificationDiff.make(
            planned: [note("item:Z"), note("item:M", "2026-03-10 08:00")],
            pending: [note("item:Y"), note("item:B")])
        XCTAssertEqual(diff.toAdd.map(\.identifier), ["item:M", "item:Z"])
        XCTAssertEqual(diff.toRemove, ["item:B", "item:Y"])
    }
}
