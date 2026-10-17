import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

@MainActor
final class GoalsViewModelTests: ViewModelTestCase {
    private func makeVM() -> GoalsViewModel {
        let clock = self.clock!
        return GoalsViewModel(
            store: store, context: DateContext(now: { clock.now }, timeZone: clock.timeZone), notifyLocalChange: notify)
    }

    private func started() async -> GoalsViewModel {
        let vm = makeVM()
        vm.start()
        await waitFor(vm.$isLoaded) { $0 }
        return vm
    }

    @discardableResult
    private func makeGoal(
        _ title: String, _ horizon: String = "year", _ start: String = "2026-01-01", _ end: String = "2026-12-31",
        parent: GoalRecord? = nil, status: String = "active"
    ) throws -> GoalRecord {
        try store.create(
            GoalRecord(
                title: title, horizon: horizon, periodStart: start, periodEnd: end, parentGoalId: parent?.reference,
                status: status))
    }

    private func node(_ vm: GoalsViewModel, _ title: String) -> GoalNode? {
        func find(_ nodes: [GoalNode]) -> GoalNode? {
            for n in nodes {
                if n.goal.title == title { return n }
                if let hit = find(n.children) { return hit }
            }
            return nil
        }
        return find(vm.roots)
    }

    // MARK: Hierarchy

    func testEmptyState() async {
        let vm = await started()
        XCTAssertTrue(vm.isEmpty)
        XCTAssertTrue(vm.roots.isEmpty)
        XCTAssertTrue(vm.sections.isEmpty)
    }

    func testYearQuarterMonthHierarchy() async throws {
        let year = try makeGoal("2026")
        let q4 = try makeGoal("Q4", "quarter", "2026-10-01", "2026-12-31", parent: year)
        try makeGoal("October", "month", "2026-10-01", "2026-10-31", parent: q4)
        try makeGoal("November", "month", "2026-11-01", "2026-11-30", parent: q4)
        let q1 = try makeGoal("Q1", "quarter", "2026-01-01", "2026-03-31", parent: year)
        let vm = await started()

        XCTAssertEqual(vm.roots.map(\.goal.title), ["2026"])
        let root = vm.roots[0]
        XCTAssertEqual(root.children.map(\.goal.title), ["Q1", "Q4"], "children are ordered by period")
        XCTAssertEqual(root.depth, 0)
        let q4Node = try XCTUnwrap(node(vm, "Q4"))
        XCTAssertEqual(q4Node.depth, 1)
        XCTAssertEqual(q4Node.children.map(\.goal.title), ["October", "November"])
        XCTAssertEqual(q4Node.children[0].depth, 2)
        XCTAssertEqual(node(vm, "Q1")?.goal.localId, q1.localId)
    }

    func testGoalWhoseParentIsMissingBecomesARoot() async throws {
        let year = try makeGoal("2026")
        try makeGoal("Q4", "quarter", "2026-10-01", "2026-12-31", parent: year)
        try exec("UPDATE goal SET deleted_locally = 1 WHERE local_id = ?", [year.localId])
        let vm = await started()
        XCTAssertEqual(vm.roots.map(\.goal.title), ["Q4"])
    }

    func testRootsAreGroupedByTheYearOfTheirPeriod() async throws {
        try makeGoal("2027", "year", "2027-01-01", "2027-12-31")
        try makeGoal("2026", "year", "2026-01-01", "2026-12-31")
        try makeGoal("Q2 2027", "quarter", "2027-04-01", "2027-06-30")
        let vm = await started()
        XCTAssertEqual(vm.sections.map(\.title), ["2026", "2027"])
        XCTAssertEqual(vm.sections[1].nodes.map(\.goal.title), ["2027", "Q2 2027"])
    }

    // MARK: Progress

    func testProgressCountsDirectItemsAndIgnoresCancelled() async throws {
        let goal = try makeGoal("G")
        try makeItem("open1", goalId: goal.reference)
        try makeItem("open2", goalId: goal.reference)
        try makeItem("done1", status: "done", goalId: goal.reference)
        try makeItem("cancelled", status: "cancelled", goalId: goal.reference)
        try makeItem("unrelated")
        let vm = await started()
        await waitFor(vm.$roots) { $0.first?.progress.total == 3 }
        let progress = try XCTUnwrap(vm.roots.first?.progress)
        XCTAssertEqual(progress, GoalProgress(total: 3, done: 1, open: 2, percent: 33))
    }

    func testProgressIncludesItemsOfLinkedProjectsAndArchivedProjects() async throws {
        let goal = try makeGoal("G")
        let live = try store.create(ProjectRecord(code: "L", name: "Live", goalId: goal.reference))
        let archived = try store.create(ProjectRecord(code: "A", name: "Archived", goalId: goal.reference, archived: true))
        try makeItem("in live", status: "done", projectId: live.reference)
        try makeItem("in archived", projectId: archived.reference)
        let vm = await started()
        await waitFor(vm.$roots) { $0.first?.progress.total == 2 }
        XCTAssertEqual(vm.roots[0].progress, GoalProgress(total: 2, done: 1, open: 1, percent: 50))
    }

    func testProgressRollsUpDescendantsAndCountsEachItemOnce() async throws {
        let year = try makeGoal("Y")
        let quarter = try makeGoal("Q", "quarter", "2026-10-01", "2026-12-31", parent: year)
        let month = try makeGoal("M", "month", "2026-10-01", "2026-10-31", parent: quarter)
        let project = try store.create(ProjectRecord(code: "P", name: "P", goalId: quarter.reference))
        try makeItem("y-item", goalId: year.reference)
        try makeItem("q-item", status: "done", goalId: quarter.reference)
        try makeItem("m-item", status: "done", goalId: month.reference)
        // Linked directly to the month AND through a project of the quarter: still a single item.
        try makeItem("both", projectId: project.reference, goalId: month.reference)
        let vm = await started()
        await waitFor(vm.$roots) { $0.first?.progress.total == 4 }
        XCTAssertEqual(vm.roots[0].progress, GoalProgress(total: 4, done: 2, open: 2, percent: 50))
        XCTAssertEqual(node(vm, "Q")?.progress, GoalProgress(total: 3, done: 2, open: 1, percent: 67))
        XCTAssertEqual(node(vm, "M")?.progress, GoalProgress(total: 2, done: 1, open: 1, percent: 50))
    }

    func testGoalWithoutItemsHasZeroPercent() async throws {
        try makeGoal("G")
        let vm = await started()
        XCTAssertEqual(vm.roots[0].progress, GoalProgress(total: 0, done: 0, open: 0, percent: 0))
        XCTAssertEqual(vm.roots[0].progress.label, "0/0")
    }

    func testProgressUpdatesWhenAnItemIsCompleted() async throws {
        let goal = try makeGoal("G")
        let item = try makeItem("task", goalId: goal.reference)
        let vm = await started()
        await waitFor(vm.$roots) { $0.first?.progress.total == 1 }
        try store.completeItem(localId: item.localId)
        await waitFor(vm.$roots) { $0.first?.progress.percent == 100 }
    }

    func testItemsReferencingTheGoalByServerIdAreCounted() async throws {
        let goal = try makeGoal("G")
        try store.remapServerId(entity: .goal, localId: goal.localId, serverId: "9")
        try makeItem("by server id", goalId: "9")
        let vm = await started()
        await waitFor(vm.$roots) { $0.first?.progress.total == 1 }
    }

    func testPercentRoundsHalfUpLikeTheServer() {
        XCTAssertEqual(GoalProgress(total: 8, done: 1, open: 7).percent, 13)  // 12.5 -> 13
        XCTAssertEqual(GoalProgress(total: 3, done: 2, open: 1).percent, 67)
        XCTAssertEqual(GoalProgress(total: 0, done: 0, open: 0).percent, 0)
    }

    // MARK: Create

    func testPeriodsFollowTheHorizonAroundTheAnchor() {
        let ctx = self.ctx
        XCTAssertEqual(GoalsViewModel.period(.year, containing: d("2026-10-18T10:00:00+03:00"), context: ctx).start, "2026-01-01")
        XCTAssertEqual(GoalsViewModel.period(.year, containing: d("2026-10-18T10:00:00+03:00"), context: ctx).end, "2026-12-31")
        let q4 = GoalsViewModel.period(.quarter, containing: d("2026-10-18T10:00:00+03:00"), context: ctx)
        XCTAssertEqual([q4.start, q4.end], ["2026-10-01", "2026-12-31"])
        let q1 = GoalsViewModel.period(.quarter, containing: d("2027-03-31T23:59:00+03:00"), context: ctx)
        XCTAssertEqual([q1.start, q1.end], ["2027-01-01", "2027-03-31"])
        let feb = GoalsViewModel.period(.month, containing: d("2027-02-10T10:00:00+03:00"), context: ctx)
        XCTAssertEqual([feb.start, feb.end], ["2027-02-01", "2027-02-28"])
        let leap = GoalsViewModel.period(.month, containing: d("2028-02-10T10:00:00+03:00"), context: ctx)
        XCTAssertEqual(leap.end, "2028-02-29")
    }

    func testCreateBuildsTheGoalForTheAnchorPeriodAndQueuesIt() async throws {
        let vm = await started()
        let goal = try XCTUnwrap(vm.create(title: " Ship it ", horizon: .quarter, notes: "n"))
        XCTAssertEqual(goal.title, "Ship it")
        XCTAssertEqual(goal.horizon, "quarter")
        XCTAssertEqual(goal.periodStart, "2026-10-01")
        XCTAssertEqual(goal.periodEnd, "2026-12-31")
        XCTAssertEqual(goal.notes, "n")
        XCTAssertEqual(goal.status, "active")
        XCTAssertEqual(changeNotifications, 1)
        await waitFor(vm.$roots) { $0.count == 1 }
        XCTAssertEqual(try store.outbox().filter { $0.entity == .goal }.map(\.op), [.create])
    }

    func testCreateRequiresATitle() async {
        let vm = await started()
        XCTAssertNil(vm.create(title: "  ", horizon: .year))
        XCTAssertEqual(vm.errorMessage, L10n.Goals.titleRequired)
        XCTAssertEqual(changeNotifications, 0)
    }

    func testCreateUnderAParentChecksHorizonAndPeriod() async throws {
        let year = try makeGoal("2026")
        let month = try makeGoal("Oct", "month", "2026-10-01", "2026-10-31", parent: year)
        let vm = await started()
        let child = try XCTUnwrap(vm.create(title: "Q4", horizon: .quarter, parent: year))
        XCTAssertEqual(child.parentGoalId, year.reference)

        XCTAssertNil(vm.create(title: "Year in year", horizon: .year, parent: year))
        XCTAssertEqual(vm.errorMessage, L10n.Goals.parentMustBeLarger)
        XCTAssertNil(vm.create(title: "Quarter in month", horizon: .quarter, parent: month))
        XCTAssertEqual(vm.errorMessage, L10n.Goals.parentMustBeLarger)

        clock.now = d("2027-02-10T10:00:00+03:00")
        XCTAssertNil(vm.create(title: "Next year's quarter", horizon: .quarter, parent: year))
        XCTAssertEqual(vm.errorMessage, L10n.Goals.periodOutsideParent)
        XCTAssertEqual(changeNotifications, 1)
    }

    // MARK: Update / delete

    func testStatusChangesRenameAndDelete() async throws {
        try makeGoal("G")
        let vm = await started()
        vm.setStatus(vm.roots[0].goal, "done")
        await waitFor(vm.$roots) { $0.first?.goal.status == "done" }
        vm.rename(vm.roots[0].goal, to: "  Renamed ")
        await waitFor(vm.$roots) { $0.first?.goal.title == "Renamed" }
        vm.rename(vm.roots[0].goal, to: " ")
        XCTAssertEqual(vm.errorMessage, L10n.Goals.titleRequired)
        vm.delete(vm.roots[0].goal)
        await waitFor(vm.$roots) { $0.isEmpty }
        XCTAssertEqual(changeNotifications, 3)
    }

    func testItemsOfAGoalAreListedWithoutCancelledOnes() async throws {
        let goal = try makeGoal("G")
        try makeItem("one", goalId: goal.reference)
        try makeItem("gone", status: "cancelled", goalId: goal.reference)
        let vm = await started()
        await waitFor(vm.$roots) { $0.first?.progress.total == 1 }
        XCTAssertEqual(vm.items(for: goal).map(\.title), ["one"])
    }

    func testViewModelIsReleased() async {
        weak var weakVM: GoalsViewModel?
        do {
            let vm = await started()
            weakVM = vm
        }
        await Task.yield()
        XCTAssertNil(weakVM)
    }
}
