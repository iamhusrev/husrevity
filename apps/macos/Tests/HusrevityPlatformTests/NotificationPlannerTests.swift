import HusrevityStore
import XCTest
@testable import HusrevityPlatform

final class NotificationPlannerTests: XCTestCase {
    let now = at("2026-03-10 08:00")

    func planner(
        zone: TimeZone = istanbul, limit: Int = 64, record: ExpanderRecorder? = nil
    ) -> NotificationPlanner {
        NotificationPlanner(timeZone: zone, limit: limit, expand: makeExpander(record: record))
    }

    func plan(_ items: [ItemRecord], _ occurrences: [ItemOccurrenceRecord] = [], now: Date? = nil,
              planner: NotificationPlanner? = nil) -> [PlannedNotification] {
        (planner ?? self.planner()).plan(items: items, occurrences: occurrences, now: now ?? self.now)
    }

    // MARK: One-off items

    func testFiresLeadTimeBeforeScheduledAtWithServerText() {
        let result = plan([item("A", title: "Dişçi", scheduledAt: at("2026-03-10 09:00"), notify: 15)])
        XCTAssertEqual(result, [
            PlannedNotification(
                identifier: "item:A", fireAt: at("2026-03-10 08:45"), title: "Dişçi",
                body: "09:00'de — 15 dk kaldı")
        ])
    }

    func testNotesAreAppendedOnANewLine() {
        let result = plan([item("A", scheduledAt: at("2026-03-10 09:00"), notify: 30, notes: "Raporu getir")])
        XCTAssertEqual(result.first?.body, "09:00'de — 30 dk kaldı\nRaporu getir")
    }

    func testZeroLeadFiresAtTheTimeWithNowBody() {
        let result = plan([item("A", scheduledAt: at("2026-03-10 09:00"), notify: 0)])
        XCTAssertEqual(result.first?.fireAt, at("2026-03-10 09:00"))
        XCTAssertEqual(result.first?.body, "Şimdi")
    }

    func testZeroLeadUsesNotesAsBodyWhenPresent() {
        let result = plan([item("A", scheduledAt: at("2026-03-10 09:00"), notify: 0, notes: "Toplantı")])
        XCTAssertEqual(result.first?.body, "Toplantı")
    }

    func testNilOrNegativeLeadProducesNothing() {
        XCTAssertEqual(plan([item("A", scheduledAt: at("2026-03-10 09:00"), notify: nil)]), [])
        XCTAssertEqual(plan([item("B", scheduledAt: at("2026-03-10 09:00"), notify: -5)]), [])
    }

    func testDueAtWinsOverScheduledAtLikeTheServer() {
        let result = plan([item(
            "A", scheduledAt: at("2026-03-10 09:00"), dueAt: at("2026-03-10 18:00"), notify: 60)])
        XCTAssertEqual(result.first?.fireAt, at("2026-03-10 17:00"))
    }

    func testItemWithoutAnyTimeProducesNothing() {
        XCTAssertEqual(plan([item("A", notify: 15)]), [])
    }

    func testFireTimeInThePastOrExactlyNowIsSkipped() {
        // Starts in 10 minutes but wants 15 minutes of notice: the fire time already passed.
        XCTAssertEqual(plan([item("A", scheduledAt: at("2026-03-10 08:10"), notify: 15)]), [])
        // Fire time == now is not in the future either.
        XCTAssertEqual(plan([item("B", scheduledAt: at("2026-03-10 08:15"), notify: 15)]), [])
        XCTAssertEqual(plan([item("C", scheduledAt: at("2026-03-10 08:16"), notify: 15)]).count, 1)
    }

    func testDoneAndCancelledItemsAreSkipped() {
        let when = at("2026-03-10 09:00")
        XCTAssertEqual(plan([
            item("A", scheduledAt: when, status: "done"),
            item("B", scheduledAt: when, status: "cancelled"),
        ]), [])
    }

    func testOneOffItemsBeyondTheHorizonAreStillPlanned() {
        let result = plan([item("A", scheduledAt: at("2026-06-01 09:00"))])
        XCTAssertEqual(result.map(\.identifier), ["item:A"])
    }

    // MARK: Editing

    func testEditedItemIsReplacedNotDuplicated() {
        let before = plan([item("A", scheduledAt: at("2026-03-10 09:00"))])
        let after = plan([item("A", scheduledAt: at("2026-03-10 11:00"))])
        XCTAssertEqual(before.map(\.identifier), after.map(\.identifier))
        XCTAssertEqual(after.count, 1)
        XCTAssertEqual(after.first?.fireAt, at("2026-03-10 10:45"))
    }

    func testSameItemTwiceInTheInputIsDeduplicated() {
        let one = item("A", scheduledAt: at("2026-03-10 09:00"))
        XCTAssertEqual(plan([one, one]).count, 1)
    }

    // MARK: Recurrence

    func testRecurringItemGetsOneNotificationPerOccurrenceKeyedByLocalDate() {
        let result = plan([item(
            "R", title: "Spor", scheduledAt: at("2026-03-09 09:00"), notify: 10, rrule: "FREQ=DAILY")])
        XCTAssertEqual(result.prefix(3).map(\.identifier), [
            "item:R:2026-03-10T09:00+0300", "item:R:2026-03-11T09:00+0300", "item:R:2026-03-12T09:00+0300",
        ])
        XCTAssertEqual(result.first?.fireAt, at("2026-03-10 08:50"))
        XCTAssertEqual(result.first?.body, "09:00'de — 10 dk kaldı")
    }

    func testRecurrenceIsExpandedOverThirtyDaysIncludingTheLeadTime() {
        let recorder = ExpanderRecorder()
        let result = plan(
            [item("R", scheduledAt: at("2026-03-01 09:00"), notify: 60, rrule: "FREQ=DAILY")],
            planner: planner(record: recorder))
        let call = recorder.calls.first
        XCTAssertEqual(call?.rrule, "FREQ=DAILY")
        XCTAssertEqual(call?.start, at("2026-03-01 09:00"))
        XCTAssertEqual(call?.from, now)
        XCTAssertEqual(call?.to, now.addingTimeInterval(30 * 24 * 3600 + 3600))
        // Fire times beyond now + 30 days are cut off (the occurrence 09:00 on day 30 fires at 08:00,
        // which is still inside; the one on day 31 is not).
        XCTAssertEqual(result.last?.identifier, "item:R:2026-04-09T09:00+0300")
    }

    func testDoneOccurrenceIsSkippedButTheRestOfTheSeriesIsKept() {
        let result = plan(
            [item("R", scheduledAt: at("2026-03-09 09:00"), rrule: "FREQ=DAILY")],
            [occurrence("local:R", "2026-03-11", status: "done")])
        let ids = result.prefix(3).map(\.identifier)
        XCTAssertEqual(ids, ["item:R:2026-03-10T09:00+0300", "item:R:2026-03-12T09:00+0300", "item:R:2026-03-13T09:00+0300"])
    }

    func testSkippedOccurrenceMatchedByServerIdIsSkipped() {
        let result = plan(
            [item("R", scheduledAt: at("2026-03-09 09:00"), rrule: "FREQ=DAILY", serverId: "42")],
            [occurrence("42", "2026-03-10", status: "skipped")])
        XCTAssertEqual(result.first?.identifier, "item:R:2026-03-11T09:00+0300")
    }

    func testOpenOccurrenceAndOccurrencesOfOtherItemsDoNotSuppressAnything() {
        let result = plan(
            [item("R", scheduledAt: at("2026-03-09 09:00"), rrule: "FREQ=DAILY")],
            [occurrence("local:R", "2026-03-10", status: "open"),
             occurrence("local:OTHER", "2026-03-10", status: "done")])
        XCTAssertEqual(result.first?.identifier, "item:R:2026-03-10T09:00+0300")
    }

    func testRecurringItemWithoutAnchorOrWithFailingExpansionIsSkippedOthersSurvive() {
        let result = plan([
            item("NOANCHOR", rrule: "FREQ=DAILY"),
            item("BAD", scheduledAt: at("2026-03-10 09:00"), rrule: "BOOM"),
            item("OK", scheduledAt: at("2026-03-10 10:00")),
        ])
        XCTAssertEqual(result.map(\.identifier), ["item:OK"])
    }

    func testBlankRruleIsTreatedAsOneOff() {
        let result = plan([item("A", scheduledAt: at("2026-03-10 09:00"), rrule: "  ")])
        XCTAssertEqual(result.map(\.identifier), ["item:A"])
    }

    func testDoneSeriesProducesNothing() {
        XCTAssertEqual(plan([item("R", scheduledAt: at("2026-03-09 09:00"), rrule: "FREQ=DAILY", status: "done")]), [])
    }

    func testDuplicateOccurrencesFromTheExpanderAreDeduplicated() {
        let duplicating: RecurrenceExpander = { _, start, _, _, _ in
            [start.addingTimeInterval(86_400), start.addingTimeInterval(86_400)]
        }
        let planner = NotificationPlanner(timeZone: istanbul, expand: duplicating)
        let result = plan([item("R", scheduledAt: at("2026-03-10 09:00"), rrule: "FREQ=DAILY")], planner: planner)
        XCTAssertEqual(result.map(\.identifier), ["item:R:2026-03-11T09:00+0300"])
    }

    // MARK: Time zones, midnight and DST

    func testOccurrenceJustAfterLocalMidnightIsKeyedByItsLocalDateNotTheFireDateOrUTC() {
        // 00:30 Istanbul on the 11th is still the 10th in UTC (21:30Z); the 30 minute lead fires at 00:00.
        let result = plan([item(
            "R", scheduledAt: at("2026-03-11 00:30"), notify: 30, rrule: "FREQ=WEEKLY")])
        XCTAssertEqual(result.first?.identifier, "item:R:2026-03-11T00:30+0300")
        XCTAssertEqual(result.first?.fireAt, at("2026-03-11 00:00"))
        XCTAssertEqual(result.first?.body, "00:30'de — 30 dk kaldı")
    }

    func testLeadTimeCrossingMidnightKeepsTheOccurrenceDate() {
        // Occurrence 00:10 on the 12th, fire 23:40 on the 11th: the key follows the occurrence.
        let result = plan([item(
            "R", scheduledAt: at("2026-03-12 00:10"), notify: 30, rrule: "FREQ=WEEKLY")])
        XCTAssertEqual(result.first?.identifier, "item:R:2026-03-12T00:10+0300")
        XCTAssertEqual(result.first?.fireAt, at("2026-03-11 23:40"))
    }

    func testIstanbulHasNoDstShift() {
        let result = plan(
            [item("R", scheduledAt: at("2026-03-28 09:00"), notify: 0, rrule: "FREQ=DAILY")],
            now: at("2026-03-28 08:00"))
        let hours = result.prefix(4).map { $0.fireAt.timeIntervalSince(at("2026-03-28 00:00")) }
        XCTAssertEqual(hours, [9.0, 33, 57, 81].map { $0 * 3600 })
    }

    func testWallClockTimeIsKeptAcrossASpringForwardTransition() {
        // New York springs forward on 2026-03-08: 09:00 local stays 09:00 in the body and the key,
        // while the real interval between the two fire times is 23 hours.
        let now = at("2026-03-07 08:00", newYork)
        let planner = NotificationPlanner(timeZone: newYork, expand: makeExpander())
        let result = planner.plan(
            items: [item("R", scheduledAt: at("2026-03-07 09:00", newYork), notify: 0, rrule: "FREQ=DAILY")],
            occurrences: [], now: now)
        XCTAssertEqual(result.prefix(3).map(\.identifier), [
            "item:R:2026-03-07T09:00-0500", "item:R:2026-03-08T09:00-0400", "item:R:2026-03-09T09:00-0400",
        ])
        XCTAssertEqual(result[1].fireAt.timeIntervalSince(result[0].fireAt), 23 * 3600)
        XCTAssertEqual(result[1].fireAt, at("2026-03-08 09:00", newYork))
    }

    func testFallBackTransitionKeepsWallClockToo() {
        // New York falls back on 2026-11-01: the interval is 25 hours.
        let now = at("2026-10-31 08:00", newYork)
        let planner = NotificationPlanner(timeZone: newYork, expand: makeExpander())
        let result = planner.plan(
            items: [item("R", scheduledAt: at("2026-10-31 09:00", newYork), notify: 0, rrule: "FREQ=DAILY")],
            occurrences: [], now: now)
        XCTAssertEqual(result[1].fireAt.timeIntervalSince(result[0].fireAt), 25 * 3600)
        XCTAssertEqual(result[1].identifier, "item:R:2026-11-01T09:00-0500")
    }

    // MARK: The 64 cap

    func testOnlyTheSoonest64AreKept() {
        let items = (0..<100).map { index in
            item(String(format: "I%03d", index), scheduledAt: at("2026-03-10 09:00").addingTimeInterval(Double(index) * 600))
        }
        let result = plan(items.reversed())
        XCTAssertEqual(result.count, 64)
        XCTAssertEqual(result.first?.identifier, "item:I000")
        XCTAssertEqual(result.last?.identifier, "item:I063")
        XCTAssertEqual(result.map(\.fireAt), result.map(\.fireAt).sorted())
    }

    func testTiesAtTheCapBoundaryAreBrokenByIdentifierRegardlessOfInputOrder() {
        // 70 items with the very same fire time: the 64 lexicographically smallest identifiers win.
        let when = at("2026-03-10 09:00")
        let items = (0..<70).map { item(String(format: "T%02d", $0), scheduledAt: when) }
        let forward = plan(items)
        let backward = plan(items.reversed())
        let shuffled = plan(items.shuffled())
        XCTAssertEqual(forward, backward)
        XCTAssertEqual(forward, shuffled)
        XCTAssertEqual(forward.count, 64)
        XCTAssertEqual(forward.first?.identifier, "item:T00")
        XCTAssertEqual(forward.last?.identifier, "item:T63")
    }

    func testCapIsConfigurable() {
        let items = (0..<5).map { item("I\($0)", scheduledAt: at("2026-03-10 09:00").addingTimeInterval(Double($0) * 60)) }
        XCTAssertEqual(plan(items, planner: planner(limit: 2)).map(\.identifier), ["item:I0", "item:I1"])
    }

    func testRecurringOccurrencesCompeteWithOneOffsForTheCap() {
        let daily = item("R", scheduledAt: at("2026-03-10 09:00"), notify: 0, rrule: "FREQ=DAILY")
        let single = item("S", scheduledAt: at("2026-03-10 12:00"), notify: 0)
        let result = plan([daily, single], planner: planner(limit: 3))
        XCTAssertEqual(result.map(\.identifier), ["item:R:2026-03-10T09:00+0300", "item:S", "item:R:2026-03-11T09:00+0300"])
    }

    // MARK: Several occurrences per local day

    func threePerDayExpander(_ times: [String]) -> RecurrenceExpander {
        let dates = times.map { at($0) }
        return { _, _, from, to, _ in dates.filter { $0 >= from && $0 <= to } }
    }

    func testRuleWithThreeOccurrencesOnOneDayYieldsThreeDistinctStableIdentifiers() {
        let planner = NotificationPlanner(
            timeZone: istanbul,
            expand: threePerDayExpander(["2026-03-10 09:00", "2026-03-10 13:00", "2026-03-10 18:00"]))
        let series = item("H", scheduledAt: at("2026-03-10 09:00"), notify: 5, rrule: "FREQ=HOURLY")
        let first = plan([series], planner: planner)
        let second = plan([series], planner: planner)
        XCTAssertEqual(first.map(\.identifier), [
            "item:H:2026-03-10T09:00+0300", "item:H:2026-03-10T13:00+0300", "item:H:2026-03-10T18:00+0300",
        ])
        XCTAssertEqual(first.map(\.fireAt), [at("2026-03-10 08:55"), at("2026-03-10 12:55"), at("2026-03-10 17:55")])
        XCTAssertEqual(first, second, "replanning the same input gives identical identifiers")
    }

    func testMovingTheItemReplacesOccurrenceIdentifiersInTheDiff() {
        func planned(_ start: String, _ times: [String]) -> [PlannedNotification] {
            let planner = NotificationPlanner(timeZone: istanbul, expand: threePerDayExpander(times))
            return plan([item("H", scheduledAt: at(start), rrule: "FREQ=DAILY")], planner: planner)
        }
        let before = planned("2026-03-10 09:00", ["2026-03-10 09:00", "2026-03-10 13:00"])
        let after = planned("2026-03-10 10:00", ["2026-03-10 10:00", "2026-03-10 13:00"])
        let diff = NotificationDiff.make(planned: after, pending: before)
        XCTAssertEqual(diff.toRemove, ["item:H:2026-03-10T09:00+0300"])
        XCTAssertEqual(diff.toAdd.map(\.identifier), ["item:H:2026-03-10T10:00+0300"])
    }

    func testDoneDayDropsOnlyThatDaysOccurrencesOfAMultiPerDayRule() {
        let planner = NotificationPlanner(
            timeZone: istanbul,
            expand: threePerDayExpander([
                "2026-03-10 09:00", "2026-03-10 18:00", "2026-03-11 09:00", "2026-03-11 18:00",
            ]))
        let result = plan(
            [item("H", scheduledAt: at("2026-03-10 09:00"), rrule: "FREQ=HOURLY")],
            [occurrence("local:H", "2026-03-10", status: "done")], planner: planner)
        XCTAssertEqual(result.map(\.identifier), [
            "item:H:2026-03-11T09:00+0300", "item:H:2026-03-11T18:00+0300",
        ])
    }

    func testFallBackRepeatedHourGetsDistinctIdentifiers() {
        // 01:30 happens twice in New York on 2026-11-01; the offset keeps the identifiers apart.
        let first = at("2026-11-01 01:30", newYork)
        let second = first.addingTimeInterval(3600)
        let expander: RecurrenceExpander = { _, _, _, _, _ in [first, second] }
        let planner = NotificationPlanner(timeZone: newYork, expand: expander)
        let result = planner.plan(
            items: [item("H", scheduledAt: first, notify: 0, rrule: "FREQ=HOURLY")], occurrences: [],
            now: at("2026-11-01 00:00", newYork))
        XCTAssertEqual(Set(result.map(\.identifier)).count, 2)
    }

    func testCapAppliesAcrossManyOccurrencesOfOneRuleAndMixedItems() {
        let hourly: RecurrenceExpander = { _, start, from, to, _ in
            (0..<100).map { start.addingTimeInterval(Double($0) * 3600) }.filter { $0 >= from && $0 <= to }
        }
        let planner = NotificationPlanner(timeZone: istanbul, expand: hourly)
        let result = plan([
            item("H", scheduledAt: at("2026-03-10 09:00"), notify: 0, rrule: "FREQ=HOURLY"),
            item("S", scheduledAt: at("2026-03-10 09:30"), notify: 0),
        ], planner: planner)
        XCTAssertEqual(result.count, 64)
        XCTAssertTrue(result.contains { $0.identifier == "item:S" })
        XCTAssertEqual(result.map(\.fireAt), result.map(\.fireAt).sorted())
    }
}
