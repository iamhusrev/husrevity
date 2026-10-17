import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

@MainActor
final class InboxViewModelTests: ViewModelTestCase {
    private func makeVM() -> InboxViewModel {
        let clock = self.clock!
        return InboxViewModel(
            store: store, parser: core, context: DateContext(now: { clock.now }, timeZone: clock.timeZone),
            notifyLocalChange: notify)
    }

    private func started() async -> InboxViewModel {
        let vm = makeVM()
        vm.start()
        await waitFor(vm.$isLoaded) { $0 }
        return vm
    }

    func testEmptyInbox() async {
        let vm = await started()
        XCTAssertTrue(vm.items.isEmpty)
        XCTAssertTrue(vm.isEmpty)
    }

    func testOnlyOpenUndatedItemsAreListed() async throws {
        try makeItem("loose thought")
        try makeItem("dated", scheduledAt: "2026-10-20T09:00:00+03:00")
        try makeItem("due", dueAt: "2026-10-20T09:00:00+03:00")
        try makeItem("done thought", status: "done")
        let vm = await started()
        XCTAssertEqual(vm.items.map(\.title), ["loose thought"])
        XCTAssertFalse(vm.isEmpty)
    }

    func testQuickAddedPlainTextLandsInTheInboxAndDatedTextDoesNot() async throws {
        let vm = await started()
        vm.quickAdd.text = "sadece bir not"
        XCTAssertNotNil(vm.quickAdd.submit())
        await waitFor(vm.$items) { $0.count == 1 }
        vm.quickAdd.text = "yarın 9da toplantı"
        XCTAssertNotNil(vm.quickAdd.submit())
        XCTAssertEqual(changeNotifications, 2)
        XCTAssertEqual(try store.items().count, 2)
        XCTAssertEqual(vm.items.map(\.title), ["sadece bir not"])
    }

    func testCompleteRemovesFromTheInboxAndNotifies() async throws {
        let item = try makeItem("loose thought")
        let vm = await started()
        vm.complete(vm.items[0])
        XCTAssertEqual(changeNotifications, 1)
        await waitFor(vm.$items) { $0.isEmpty }
        XCTAssertEqual(try store.items().first { $0.localId == item.localId }?.status, "done")
    }

    func testDeleteRemovesTheItem() async throws {
        try makeItem("loose thought")
        let vm = await started()
        vm.delete(vm.items[0])
        XCTAssertEqual(changeNotifications, 1)
        await waitFor(vm.$items) { $0.isEmpty }
        XCTAssertTrue(try store.items().isEmpty)
    }

    func testSchedulingAnItemMovesItOutOfTheInbox() async throws {
        let item = try makeItem("loose thought")
        let vm = await started()
        let when = d("2026-10-19T09:00:00+03:00")
        vm.schedule(vm.items[0], at: when)
        XCTAssertEqual(changeNotifications, 1)
        await waitFor(vm.$items) { $0.isEmpty }
        XCTAssertEqual(try store.items().first { $0.localId == item.localId }?.scheduledAt, when)
    }

    func testRenameKeepsTheItemInTheInbox() async throws {
        try makeItem("loose thought")
        let vm = await started()
        vm.rename(vm.items[0], to: "  better title ")
        await waitFor(vm.$items) { $0.first?.title == "better title" }
        XCTAssertEqual(changeNotifications, 1)
        vm.rename(vm.items[0], to: "   ")
        XCTAssertEqual(changeNotifications, 1, "a blank title is ignored")
    }

    func testItemsAreOldestFirst() async throws {
        try makeItem("first")
        try makeItem("second")
        let vm = await started()
        XCTAssertEqual(vm.items.map(\.title), ["first", "second"])
    }

    func testViewModelIsReleased() async throws {
        weak var weakVM: InboxViewModel?
        do {
            let vm = await started()
            weakVM = vm
        }
        await Task.yield()
        XCTAssertNil(weakVM)
    }
}
