import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

@MainActor
final class TodayViewModelTests: ViewModelTestCase {
    private func makeVM() -> TodayViewModel {
        let clock = self.clock!
        return TodayViewModel(
            store: store, expander: core, context: DateContext(now: { clock.now }, timeZone: clock.timeZone),
            notifyLocalChange: notify)
    }

    private func started() async -> TodayViewModel {
        let vm = makeVM()
        vm.start()
        await waitFor(vm.$isLoaded) { $0 }
        return vm
    }

    private func titles(_ entries: [TodayEntry]) -> [String] { entries.map(\.title) }

    // MARK: Empty state

    func testEmptyStoreGivesEmptySections() async {
        let vm = await started()
        XCTAssertTrue(vm.isEmpty)
        XCTAssertEqual(vm.sections, TodaySections())
        XCTAssertEqual(vm.dayTitle, "18 Ekim Pazar")
        XCTAssertNil(vm.errorMessage)
    }

    // MARK: One-off items

    func testOneOffItemsAreSplitIntoOverdueTodayAndDone() async throws {
        try makeItem("overdue by due date", dueAt: "2026-10-17T09:00:00+03:00")
        try makeItem("overdue by schedule", scheduledAt: "2026-10-16T09:00:00+03:00")
        try makeItem("later today", scheduledAt: "2026-10-18T18:00:00+03:00")
        try makeItem("earlier today", dueAt: "2026-10-18T08:00:00+03:00")
        try makeItem("tomorrow", scheduledAt: "2026-10-19T08:00:00+03:00")
        try makeItem("inbox only")
        try makeItem(
            "finished today", scheduledAt: "2026-10-18T07:00:00+03:00", status: "done",
            completedAt: "2026-10-18T07:30:00+03:00")
        try makeItem(
            "finished yesterday", scheduledAt: "2026-10-17T07:00:00+03:00", status: "done",
            completedAt: "2026-10-17T07:30:00+03:00")
        try makeItem("cancelled", scheduledAt: "2026-10-18T12:00:00+03:00", status: "cancelled")
        let vm = await started()

        XCTAssertEqual(titles(vm.sections.overdue), ["overdue by schedule", "overdue by due date"])
        XCTAssertEqual(titles(vm.sections.today), ["earlier today", "later today"])
        XCTAssertEqual(titles(vm.sections.done), ["finished today"])
        XCTAssertFalse(vm.isEmpty)
        XCTAssertEqual(vm.openCount, 4)
    }

    func testTaskPrefersDueAtAndEventPrefersScheduledAt() async throws {
        try makeItem("task", scheduledAt: "2026-10-18T09:00:00+03:00", dueAt: "2026-10-18T17:00:00+03:00")
        try makeItem(
            "event", kind: "event", scheduledAt: "2026-10-18T11:00:00+03:00", dueAt: "2026-10-18T20:00:00+03:00")
        let vm = await started()
        let byTitle = Dictionary(uniqueKeysWithValues: vm.sections.today.map { ($0.title, $0.time) })
        XCTAssertEqual(byTitle["task"], d("2026-10-18T17:00:00+03:00"))
        XCTAssertEqual(byTitle["event"], d("2026-10-18T11:00:00+03:00"))
    }

    func testPastEventsAreNeverOverdue() async throws {
        try makeItem("yesterday's event", kind: "event", scheduledAt: "2026-10-17T10:00:00+03:00")
        try makeItem("this morning's event", kind: "event", scheduledAt: "2026-10-18T08:00:00+03:00")
        let vm = await started()
        XCTAssertTrue(vm.sections.overdue.isEmpty)
        XCTAssertEqual(titles(vm.sections.today), ["this morning's event"])
    }

    // MARK: Recurring

    func testDailyRecurringItemAppearsOnceWithTodaysOccurrenceDate() async throws {
        try makeItem("run", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        let vm = await started()
        XCTAssertEqual(vm.sections.today.count, 1)
        let entry = vm.sections.today[0]
        XCTAssertEqual(entry.occursOn, "2026-10-18")
        XCTAssertEqual(entry.time, d("2026-10-18T07:00:00+03:00"))
        XCTAssertTrue(entry.isRecurring)
        XCTAssertEqual(entry.status, .open)
        XCTAssertTrue(vm.sections.overdue.isEmpty, "a recurring anchor in the past is never overdue")
    }

    func testRecurringItemThatDoesNotFallOnTodayIsAbsent() async throws {
        // Tuesdays only; 2026-10-18 is a Sunday.
        try makeItem("tuesdays", scheduledAt: "2026-01-06T09:00:00+03:00", rrule: "FREQ=WEEKLY;BYDAY=TU")
        let vm = await started()
        XCTAssertTrue(vm.isEmpty)
    }

    func testDoneAndSkippedOccurrencesMoveToTheDoneSectionWithTheirState() async throws {
        let run = try makeItem("run", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        let yoga = try makeItem("yoga", scheduledAt: "2026-01-01T08:00:00+03:00", rrule: "FREQ=DAILY")
        try makeItem("read", scheduledAt: "2026-01-01T21:00:00+03:00", rrule: "FREQ=DAILY")
        try putOccurrence(run, on: "2026-10-18", status: "done", completedAt: "2026-10-18T07:10:00+03:00")
        try putOccurrence(yoga, on: "2026-10-18", status: "skipped")
        // Yesterday's override must not leak into today.
        try putOccurrence(run, on: "2026-10-17", status: "skipped")
        let vm = await started()

        XCTAssertEqual(titles(vm.sections.today), ["read"])
        XCTAssertEqual(titles(vm.sections.done), ["run", "yoga"])
        XCTAssertEqual(vm.sections.done.map(\.status), [.done, .skipped])
    }

    func testOneOffAndRecurringAreMergedAndOrderedByTime() async throws {
        try makeItem("dentist", scheduledAt: "2026-10-18T09:30:00+03:00")
        try makeItem("run", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        try makeItem("call", dueAt: "2026-10-18T21:00:00+03:00")
        try makeItem("standup", kind: "event", scheduledAt: "2026-01-01T09:30:00+03:00", rrule: "FREQ=DAILY")
        let vm = await started()
        XCTAssertEqual(titles(vm.sections.today), ["run", "dentist", "standup", "call"])
    }

    func testChildOfARecurringBlockRidesAlongWithTheParentsOccurrence() async throws {
        let block = try makeItem(
            "morning routine", kind: "event", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        try makeItem("stretch", scheduledAt: "2026-01-01T07:15:00+03:00", blockId: block.reference)
        let vm = await started()
        XCTAssertEqual(titles(vm.sections.today), ["morning routine", "stretch"])
        XCTAssertEqual(vm.sections.today[1].occursOn, "2026-10-18")
        XCTAssertEqual(vm.sections.today[1].time, vm.sections.today[0].time)
        XCTAssertTrue(vm.sections.overdue.isEmpty, "the anchor of a block child must not look overdue")
    }

    // MARK: Time zone / midnight boundaries

    func testItemsJustBeforeAndAfterLocalMidnightAreSplitByTheLocalDay() async throws {
        clock.now = d("2026-10-18T23:50:00+03:00")
        try makeItem("last minute", scheduledAt: "2026-10-18T23:59:00+03:00")
        try makeItem("after midnight", scheduledAt: "2026-10-19T00:00:00+03:00")
        try makeItem("utc-evening", scheduledAt: "2026-10-18T21:30:00Z")  // 00:30 next day in Istanbul
        let vm = await started()
        XCTAssertEqual(titles(vm.sections.today), ["last minute"])
        XCTAssertTrue(vm.sections.overdue.isEmpty)
    }

    func testFirstInstantOfTheDayCountsAsToday() async throws {
        clock.now = d("2026-10-18T00:00:00+03:00")
        try makeItem("midnight", dueAt: "2026-10-18T00:00:00+03:00")
        try makeItem("one second earlier", dueAt: "2026-10-17T23:59:59+03:00")
        let vm = await started()
        XCTAssertEqual(titles(vm.sections.today), ["midnight"])
        XCTAssertEqual(titles(vm.sections.overdue), ["one second earlier"])
    }

    func testDayLengthOnADaylightSavingChangeDay() async throws {
        clock.timeZone = TimeZone(identifier: "Europe/Berlin")!
        clock.now = d("2026-03-29T12:00:00+02:00")  // the 23-hour day
        try makeItem("late", scheduledAt: "2026-03-29T23:30:00+02:00")
        try makeItem("next day", scheduledAt: "2026-03-30T00:30:00+02:00")
        let vm = await started()
        XCTAssertEqual(titles(vm.sections.today), ["late"])
    }

    func testRecurringOccurrenceDateFollowsTheLocalZoneNotUTC() async throws {
        // 00:30 local is still the previous day in UTC.
        try makeItem("night owl", scheduledAt: "2026-01-01T00:30:00+03:00", rrule: "FREQ=DAILY")
        let vm = await started()
        XCTAssertEqual(vm.sections.today.first?.occursOn, "2026-10-18")
        XCTAssertEqual(vm.sections.today.first?.time, d("2026-10-18T00:30:00+03:00"))
    }

    // MARK: Labels

    func testTimeLabelsShowTheClockForTodayAndTheDateForOverdueEntries() async throws {
        try makeItem("timed", scheduledAt: "2026-10-18T14:05:00+03:00")
        try makeItem("late", dueAt: "2026-10-16T09:30:00+03:00")
        try makeItem("date only", dueAt: "2026-10-18T00:00:00+03:00")
        try makeItem("date only overdue", dueAt: "2026-10-15T00:00:00+03:00")
        let vm = await started()
        let byTitle = Dictionary(uniqueKeysWithValues: (vm.sections.today + vm.sections.overdue).map { ($0.title, $0) })
        XCTAssertEqual(vm.timeLabel(byTitle["timed"]!), "14:05")
        XCTAssertEqual(vm.timeLabel(byTitle["late"]!), "16 Eki 09:30")
        XCTAssertNil(vm.timeLabel(byTitle["date only"]!))
        XCTAssertEqual(vm.timeLabel(byTitle["date only overdue"]!), "15 Eki")
    }

    // MARK: Actions

    func testCompletingAOneOffItemMarksItDoneAndNotifiesTheSync() async throws {
        let item = try makeItem("pay bill", dueAt: "2026-10-18T12:00:00+03:00")
        let vm = await started()
        vm.complete(vm.sections.today[0])
        XCTAssertEqual(changeNotifications, 1)
        XCTAssertEqual(try store.items().first { $0.localId == item.localId }?.status, "done")
        await waitFor(vm.$sections) { $0.done.count == 1 && $0.today.isEmpty }
        XCTAssertEqual(vm.sections.done.first?.status, .done)
    }

    func testReopeningAOneOffItemPutsItBack() async throws {
        try makeItem(
            "pay bill", dueAt: "2026-10-18T12:00:00+03:00", status: "done", completedAt: "2026-10-18T09:00:00+03:00")
        let vm = await started()
        XCTAssertEqual(vm.sections.done.count, 1)
        vm.reopen(vm.sections.done[0])
        XCTAssertEqual(changeNotifications, 1)
        await waitFor(vm.$sections) { $0.today.count == 1 && $0.done.isEmpty }
    }

    func testCompletingAnOccurrenceKeepsTheSeriesOpen() async throws {
        let run = try makeItem("run", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        let vm = await started()
        vm.complete(vm.sections.today[0])
        XCTAssertEqual(changeNotifications, 1)
        await waitFor(vm.$sections) { $0.done.count == 1 }
        XCTAssertEqual(vm.sections.done[0].occursOn, "2026-10-18")
        XCTAssertEqual(try store.items().first { $0.localId == run.localId }?.status, "open")
        let pending = try store.outbox()
        XCTAssertEqual(pending.last?.op, .complete)
        XCTAssertEqual(pending.last?.payload, .object(["occursOn": .string("2026-10-18")]))
    }

    func testReopeningAnOccurrenceIsRefusedWithAMessage() async throws {
        let run = try makeItem("run", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        try putOccurrence(run, on: "2026-10-18", status: "done", completedAt: "2026-10-18T07:10:00+03:00")
        let vm = await started()
        XCTAssertFalse(vm.canReopen(vm.sections.done[0]))
        vm.reopen(vm.sections.done[0])
        XCTAssertEqual(vm.errorMessage, L10n.Today.reopenUnsupported)
        XCTAssertEqual(changeNotifications, 0)
    }

    func testStoreFailureSurfacesAsAnErrorMessage() async throws {
        let item = try makeItem("pay bill", dueAt: "2026-10-18T12:00:00+03:00")
        let vm = await started()
        let entry = vm.sections.today[0]
        try store.delete(ItemRecord.self, localId: item.localId)  // gone before the tap lands
        vm.complete(entry)
        XCTAssertNotNil(vm.errorMessage)
        XCTAssertEqual(changeNotifications, 0)
    }

    // MARK: Store-driven refresh

    func testWritesAreObservedAndReflectedInTheSections() async throws {
        let vm = await started()
        XCTAssertTrue(vm.isEmpty)
        try makeItem("new task", scheduledAt: "2026-10-18T15:00:00+03:00")
        await waitFor(vm.$sections) { $0.today.count == 1 }
        XCTAssertEqual(titles(vm.sections.today), ["new task"])
    }

    func testOccurrenceChangesFromTheStoreAreObserved() async throws {
        let run = try makeItem("run", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        let vm = await started()
        XCTAssertEqual(vm.sections.today.count, 1)
        try putOccurrence(run, on: "2026-10-18", status: "skipped")
        await waitFor(vm.$sections) { $0.today.isEmpty && $0.done.count == 1 }
        XCTAssertEqual(vm.sections.done[0].status, .skipped)
    }

    func testRefreshDayMovesToTheNextDayAndResubscribesOccurrences() async throws {
        let run = try makeItem("run", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        try putOccurrence(run, on: "2026-10-19", status: "done", completedAt: "2026-10-19T07:05:00+03:00")
        let vm = await started()
        XCTAssertEqual(vm.sections.today.count, 1)

        clock.now = d("2026-10-19T00:05:00+03:00")
        vm.refreshDay()
        await waitFor(vm.$sections) { $0.today.isEmpty && $0.done.count == 1 }
        XCTAssertEqual(vm.dayTitle, "19 Ekim Pazartesi")
        XCTAssertEqual(vm.sections.done[0].occursOn, "2026-10-19")
    }

    func testStartIsIdempotent() async throws {
        try makeItem("only one", scheduledAt: "2026-10-18T15:00:00+03:00")
        let vm = makeVM()
        vm.start()
        vm.start()
        await waitFor(vm.$isLoaded) { $0 }
        XCTAssertEqual(vm.sections.today.count, 1)
    }

    func testViewModelIsReleasedAndItsObservationStops() async throws {
        weak var weakVM: TodayViewModel?
        do {
            let vm = await started()
            weakVM = vm
        }
        // Give the cancelled tasks a chance to unwind, then write: nothing may keep the VM alive.
        await Task.yield()
        try makeItem("after release", scheduledAt: "2026-10-18T15:00:00+03:00")
        await Task.yield()
        XCTAssertNil(weakVM)
    }
}
