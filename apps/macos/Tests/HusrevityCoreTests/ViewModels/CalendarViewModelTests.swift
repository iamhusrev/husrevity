import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

@MainActor
final class CalendarViewModelTests: ViewModelTestCase {
    private func makeVM() -> CalendarViewModel {
        let clock = self.clock!
        return CalendarViewModel(
            store: store, expander: core, context: DateContext(now: { clock.now }, timeZone: clock.timeZone),
            notifyLocalChange: notify)
    }

    private func started(mode: CalendarMode = .week) async -> CalendarViewModel {
        let vm = makeVM()
        vm.setMode(mode)
        vm.start()
        await waitFor(vm.$isLoaded) { $0 }
        return vm
    }

    private func day(_ vm: CalendarViewModel, _ key: String) -> CalendarDay? { vm.days.first { $0.dayKey == key } }

    // MARK: Grids

    func testWeekGridRunsMondayToSundayAroundToday() async {
        let vm = await started()
        XCTAssertEqual(vm.days.map(\.dayKey).first, "2026-10-12")
        XCTAssertEqual(vm.days.map(\.dayKey).last, "2026-10-18")
        XCTAssertEqual(vm.days.count, 7)
        XCTAssertEqual(vm.days.map(\.weekdayLabel), ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"])
        XCTAssertEqual(vm.days.filter(\.isToday).map(\.dayKey), ["2026-10-18"])
        XCTAssertEqual(vm.title, "12 – 18 Ekim 2026")
        XCTAssertTrue(vm.days.allSatisfy { $0.entries.isEmpty })
    }

    func testWeekTitleSpansTwoMonths() async {
        let vm = await started()
        vm.next()
        vm.next()
        XCTAssertEqual(vm.days.first?.dayKey, "2026-10-26")
        XCTAssertEqual(vm.title, "26 Eki – 1 Kas 2026")
    }

    func testMonthGridCoversWholeWeeksStartingOnMonday() async {
        let vm = await started(mode: .month)
        XCTAssertEqual(vm.title, "Ekim 2026")
        XCTAssertEqual(vm.days.count, 35)
        XCTAssertEqual(vm.days.first?.dayKey, "2026-09-28")
        XCTAssertEqual(vm.days.last?.dayKey, "2026-11-01")
        XCTAssertEqual(vm.weeks.count, 5)
        XCTAssertTrue(vm.weeks.allSatisfy { $0.count == 7 })
        XCTAssertEqual(vm.days.filter(\.isInDisplayedMonth).count, 31)
        XCTAssertFalse(day(vm, "2026-09-30")!.isInDisplayedMonth)
        XCTAssertTrue(day(vm, "2026-10-01")!.isInDisplayedMonth)
    }

    func testMonthThatFitsExactlyFourWeeks() async {
        clock.now = d("2027-02-10T10:00:00+03:00")  // February 2027: Monday 1st .. Sunday 28th
        let vm = await started(mode: .month)
        XCTAssertEqual(vm.days.count, 28)
        XCTAssertEqual(vm.days.first?.dayKey, "2027-02-01")
    }

    func testMonthNavigationAndGoToday() async {
        let vm = await started(mode: .month)
        vm.next()
        XCTAssertEqual(vm.title, "Kasım 2026")
        vm.previous()
        vm.previous()
        XCTAssertEqual(vm.title, "Eylül 2026")
        vm.goToday()
        XCTAssertEqual(vm.title, "Ekim 2026")
        XCTAssertEqual(vm.days.filter(\.isToday).count, 1)
    }

    func testSwitchingModeKeepsTheAnchor() async {
        let vm = await started()
        vm.previous()  // week of 5 Oct
        vm.setMode(.month)
        XCTAssertEqual(vm.title, "Ekim 2026")
        vm.setMode(.week)
        XCTAssertEqual(vm.days.first?.dayKey, "2026-10-05")
    }

    // MARK: Entries

    func testOneOffItemsLandOnTheirLocalDay() async throws {
        try makeItem("monday call", scheduledAt: "2026-10-12T10:00:00+03:00")
        try makeItem("due wednesday", dueAt: "2026-10-14T17:00:00+03:00")
        try makeItem("late night", scheduledAt: "2026-10-13T23:30:00+03:00")
        try makeItem("after midnight", scheduledAt: "2026-10-13T21:30:00Z")  // 00:30 on the 14th locally
        try makeItem("next week", scheduledAt: "2026-10-20T10:00:00+03:00")
        try makeItem("no date")
        try makeItem("cancelled", scheduledAt: "2026-10-12T11:00:00+03:00", status: "cancelled")
        let vm = await started()
        XCTAssertEqual(day(vm, "2026-10-12")?.entries.map(\.title), ["monday call"])
        XCTAssertEqual(day(vm, "2026-10-13")?.entries.map(\.title), ["late night"])
        XCTAssertEqual(day(vm, "2026-10-14")?.entries.map(\.title), ["after midnight", "due wednesday"])
        XCTAssertEqual(vm.days.reduce(0) { $0 + $1.entries.count }, 4)
    }

    func testRecurringItemsExpandAcrossTheVisibleRangeWithPerDateState() async throws {
        let run = try makeItem("run", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        try makeItem("tuesdays", scheduledAt: "2026-01-06T09:00:00+03:00", rrule: "FREQ=WEEKLY;BYDAY=TU")
        try putOccurrence(run, on: "2026-10-14", status: "done", completedAt: "2026-10-14T07:05:00+03:00")
        try putOccurrence(run, on: "2026-10-15", status: "skipped")
        let vm = await started()
        XCTAssertEqual(vm.days.map { $0.entries.filter { $0.title == "run" }.count }, [1, 1, 1, 1, 1, 1, 1])
        XCTAssertEqual(day(vm, "2026-10-14")?.entries.first?.status, .done)
        XCTAssertEqual(day(vm, "2026-10-15")?.entries.first?.status, .skipped)
        XCTAssertEqual(day(vm, "2026-10-16")?.entries.first?.status, .open)
        XCTAssertEqual(day(vm, "2026-10-13")?.entries.map(\.title), ["run", "tuesdays"])
        XCTAssertEqual(day(vm, "2026-10-12")?.entries.map(\.title), ["run"])
    }

    func testOccurrenceOverridesOutsideTheInitialRangeAreLoadedAfterNavigating() async throws {
        let run = try makeItem("run", scheduledAt: "2026-01-01T07:00:00+03:00", rrule: "FREQ=DAILY")
        try putOccurrence(run, on: "2026-10-22", status: "done", completedAt: "2026-10-22T07:05:00+03:00")
        let vm = await started()
        vm.next()
        await waitFor(vm.$days) { $0.first(where: { $0.dayKey == "2026-10-22" })?.entries.first?.status == .done }
    }

    func testMonthGridShowsEntriesOfLeadingAndTrailingDays() async throws {
        try makeItem("sep 30", scheduledAt: "2026-09-30T10:00:00+03:00")
        try makeItem("nov 1", scheduledAt: "2026-11-01T10:00:00+03:00")
        let vm = await started(mode: .month)
        XCTAssertEqual(day(vm, "2026-09-30")?.entries.count, 1)
        XCTAssertEqual(day(vm, "2026-11-01")?.entries.count, 1)
    }

    func testStoreWritesAreReflectedInTheGrid() async throws {
        let vm = await started()
        try makeItem("late addition", scheduledAt: "2026-10-16T12:00:00+03:00")
        await waitFor(vm.$days) { $0.first(where: { $0.dayKey == "2026-10-16" })?.entries.count == 1 }
    }

    // MARK: Selection and actions

    func testTodayIsSelectedByDefaultAndSelectionCanMove() async throws {
        try makeItem("friday", scheduledAt: "2026-10-16T12:00:00+03:00")
        let vm = await started()
        XCTAssertEqual(vm.selectedDay?.dayKey, "2026-10-18")
        vm.select(dayKey: "2026-10-16")
        XCTAssertEqual(vm.selectedDay?.entries.map(\.title), ["friday"])
        vm.next()
        XCTAssertEqual(vm.selectedDay?.dayKey, "2026-10-19", "navigation moves the selection into view")
    }

    func testCompletingAnEntryNotifiesAndUpdatesTheDay() async throws {
        try makeItem("friday", scheduledAt: "2026-10-16T12:00:00+03:00")
        let vm = await started()
        vm.complete(day(vm, "2026-10-16")!.entries[0])
        XCTAssertEqual(changeNotifications, 1)
        await waitFor(vm.$days) { $0.first(where: { $0.dayKey == "2026-10-16" })?.entries.first?.status == .done }
    }

    func testViewModelIsReleased() async {
        weak var weakVM: CalendarViewModel?
        do {
            let vm = await started()
            weakVM = vm
        }
        await Task.yield()
        XCTAssertNil(weakVM)
    }
}
