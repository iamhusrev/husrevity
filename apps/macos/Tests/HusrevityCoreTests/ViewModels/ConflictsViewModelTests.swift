import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

@MainActor
final class ConflictsViewModelTests: ViewModelTestCase {
    private var resolveCalls: [(Int64, Bool)] = []
    private var resolveError: Error?
    /// When set, the fake blocks until the test resumes it (to observe the "resolving" state).
    private var gate: CheckedContinuation<Void, Never>?
    private var useGate = false

    private func makeVM(applyToStore: Bool = false) -> ConflictsViewModel {
        let clock = self.clock!
        let store = self.store!
        return ConflictsViewModel(
            store: store, context: DateContext(now: { clock.now }, timeZone: clock.timeZone),
            resolve: { [unowned self] id, keepLocal in
                self.resolveCalls.append((id, keepLocal))
                if self.useGate { await withCheckedContinuation { self.gate = $0 } }
                if let error = self.resolveError { throw error }
                if applyToStore { try store.resolveConflict(id: id, keepLocal: keepLocal) }
            },
            notifyLocalChange: notify)
    }

    private func started(applyToStore: Bool = false) async -> ConflictsViewModel {
        let vm = makeVM(applyToStore: applyToStore)
        vm.start()
        await waitFor(vm.$isLoaded) { $0 }
        return vm
    }

    @discardableResult
    private func makeConflict(on item: ItemRecord, local: [String: JSONValue], server: [String: JSONValue]) throws
        -> ConflictRecord
    {
        try store.recordConflict(
            entity: .item, localId: item.localId, op: .update, localPayload: .object(local),
            serverPayload: .object(server))
    }

    func testEmptyState() async {
        let vm = await started()
        XCTAssertTrue(vm.conflicts.isEmpty)
        XCTAssertTrue(vm.failed.isEmpty)
        XCTAssertEqual(vm.count, 0)
        XCTAssertNil(vm.bannerText)
    }

    func testConflictRowsDescribeWhatDiffers() async throws {
        let item = try makeItem("Pay bill")
        try makeConflict(
            on: item,
            local: ["title": .string("Pay bills"), "scheduledAt": .string("2026-10-19T06:00:00.000Z"), "pinned": .bool(true)],
            server: ["title": .string("Pay the bill"), "scheduledAt": .null, "id": .string("5")])
        let vm = await started()
        let row = try XCTUnwrap(vm.conflicts.first)
        XCTAssertEqual(row.entityLabel, "İş")
        XCTAssertEqual(row.opLabel, "güncelleme")
        XCTAssertEqual(row.title, "Pay the bill")
        XCTAssertEqual(row.fields.count, 3)
        let byName = Dictionary(uniqueKeysWithValues: row.fields.map { ($0.name, $0) })
        XCTAssertEqual(byName["Başlık"], ConflictField(name: "Başlık", yours: "Pay bills", server: "Pay the bill"))
        XCTAssertEqual(byName["Zaman"], ConflictField(name: "Zaman", yours: "19 Eki 09:00", server: "—"))
        XCTAssertEqual(byName["Sabit"], ConflictField(name: "Sabit", yours: "Evet", server: "—"))
        XCTAssertEqual(row.fields.first?.name, "Başlık", "the title comes first")
        XCTAssertEqual(vm.count, 1)
        XCTAssertEqual(vm.bannerText, "1 değişiklik sunucudakiyle çakıştı")
    }

    func testTitleFallsBackToTheLocalPayloadThenTheEntityName() async throws {
        let item = try makeItem("x")
        try makeConflict(on: item, local: ["title": .string("mine")], server: [:])
        try store.recordConflict(entity: .goal, localId: "g", op: .delete, localPayload: .object([:]), serverPayload: .object([:]))
        let vm = await started()
        XCTAssertEqual(vm.conflicts.map(\.title), ["mine", "Hedef"])
    }

    func testKeepLocalCallsTheResolveClosureWithTheConflictId() async throws {
        let item = try makeItem("Pay bill")
        let conflict = try makeConflict(on: item, local: ["title": .string("a")], server: ["title": .string("b")])
        let vm = await started()
        await vm.resolve(vm.conflicts[0], keepLocal: true)
        XCTAssertEqual(resolveCalls.count, 1)
        XCTAssertEqual(resolveCalls[0].0, conflict.id)
        XCTAssertTrue(resolveCalls[0].1)
        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.isResolving)
    }

    func testDiscardCallsTheResolveClosureWithKeepLocalFalse() async throws {
        let item = try makeItem("Pay bill")
        let conflict = try makeConflict(on: item, local: [:], server: [:])
        let vm = await started()
        await vm.resolve(vm.conflicts[0], keepLocal: false)
        XCTAssertEqual(resolveCalls.count, 1)
        XCTAssertEqual(resolveCalls[0].0, conflict.id)
        XCTAssertFalse(resolveCalls[0].1)
    }

    func testResolvedConflictsLeaveTheListThroughStoreObservation() async throws {
        let item = try makeItem("Pay bill")
        try makeConflict(on: item, local: ["title": .string("a")], server: ["title": .string("b")])
        let vm = await started(applyToStore: true)
        await vm.resolve(vm.conflicts[0], keepLocal: true)
        await waitFor(vm.$conflicts) { $0.isEmpty }
        XCTAssertNil(vm.bannerText)
    }

    func testFailureKeepsTheConflictAndExplainsWhy() async throws {
        let item = try makeItem("Pay bill")
        try makeConflict(on: item, local: [:], server: [:])
        resolveError = StoreError.entryInFlight(entity: .item, localId: item.localId)
        let vm = await started()
        await vm.resolve(vm.conflicts[0], keepLocal: false)
        XCTAssertEqual(vm.conflicts.count, 1)
        XCTAssertEqual(vm.errorMessage, L10n.Conflicts.resolveFailed("Kayıt şu anda gönderiliyor, biraz sonra tekrar dene."))
        XCTAssertFalse(vm.isResolving)
    }

    func testASecondTapWhileResolvingIsIgnored() async throws {
        let item = try makeItem("Pay bill")
        try makeConflict(on: item, local: [:], server: [:])
        useGate = true
        let vm = await started()
        let row = vm.conflicts[0]
        let first = Task { await vm.resolve(row, keepLocal: true) }
        await waitFor(vm.$isResolving) { $0 }
        await vm.resolve(row, keepLocal: false)  // returns immediately
        XCTAssertEqual(resolveCalls.count, 1)
        gate?.resume()
        await first.value
        XCTAssertFalse(vm.isResolving)
        XCTAssertEqual(resolveCalls.count, 1)
    }

    func testNewConflictsAppearWhileObserving() async throws {
        let item = try makeItem("Pay bill")
        let vm = await started()
        try makeConflict(on: item, local: [:], server: [:])
        await waitFor(vm.$conflicts) { $0.count == 1 }
        XCTAssertEqual(vm.count, 1)
    }

    // MARK: Failed outbox entries

    func testFailedEntriesShowTheirError() async throws {
        let item = try makeItem("Pay bill")
        let entry = try XCTUnwrap(try store.outbox().first)
        try store.markFailed(entry.id, error: "title must not be empty")
        _ = item
        let vm = await started()
        let row = try XCTUnwrap(vm.failed.first)
        XCTAssertEqual(row.error, "title must not be empty")
        XCTAssertEqual(row.entityLabel, "İş")
        XCTAssertEqual(row.opLabel, "oluşturma")
        XCTAssertEqual(row.title, "Pay bill")
        XCTAssertEqual(vm.count, 1)
    }

    func testFailedEntryWithoutAnErrorUsesTheUnknownErrorText() async throws {
        try makeItem("x")
        try store.markFailed(try XCTUnwrap(try store.outbox().first).id)
        let vm = await started()
        XCTAssertEqual(vm.failed.first?.error, L10n.Conflicts.unknownError)
    }

    func testFailedEntriesOfAConflictedRowAreNotListedTwice() async throws {
        let item = try makeItem("Pay bill")
        try store.markFailed(try XCTUnwrap(try store.outbox().first).id, error: "409")
        try makeConflict(on: item, local: [:], server: [:])
        let vm = await started()
        XCTAssertEqual(vm.conflicts.count, 1)
        XCTAssertTrue(vm.failed.isEmpty)
        XCTAssertEqual(vm.count, 1)
    }

    func testRetryRequeuesTheEntryAndNotifiesTheSync() async throws {
        try makeItem("Pay bill")
        let entry = try XCTUnwrap(try store.outbox().first)
        try store.markFailed(entry.id, error: "boom")
        let vm = await started()
        vm.retry(vm.failed[0])
        XCTAssertEqual(changeNotifications, 1)
        XCTAssertEqual(try store.outboxEntry(id: entry.id)?.state, .pending)
        await waitFor(vm.$failed) { $0.isEmpty }
    }

    func testDiscardDropsTheFailedEntryAndLaterEntriesOfTheRow() async throws {
        let item = try makeItem("Pay bill")
        try store.update(ItemRecord.self, localId: item.localId) { $0.title = "Pay bills" }
        XCTAssertEqual(try store.outbox().count, 2)
        try store.markFailed(try XCTUnwrap(try store.outbox().first).id, error: "boom")
        let vm = await started()
        vm.discard(vm.failed[0])
        XCTAssertEqual(changeNotifications, 1)
        XCTAssertNil(vm.errorMessage)
        XCTAssertTrue(try store.outbox().isEmpty)
        XCTAssertTrue(try store.items().isEmpty, "a never-pushed row disappears with its create")
        await waitFor(vm.$failed) { $0.isEmpty }
    }

    func testDiscardOfAnEntryThatIsNotFailedShowsAnError() async throws {
        try makeItem("Pay bill")
        let entry = try XCTUnwrap(try store.outbox().first)
        try store.markFailed(entry.id, error: "boom")
        let vm = await started()
        let row = vm.failed[0]
        try store.requeue(entry.id)  // no longer failed by the time the user confirms
        vm.discard(row)
        XCTAssertNotNil(vm.errorMessage)
        XCTAssertEqual(changeNotifications, 0)
        XCTAssertEqual(try store.outbox().count, 1)
    }

    func testDescribeStillHandlesEntriesInFlight() {
        XCTAssertEqual(
            TodayViewModel.describe(StoreError.entryInFlight(entity: .item, localId: "x")),
            "Kayıt şu anda gönderiliyor, biraz sonra tekrar dene.")
    }

    func testViewModelIsReleased() async {
        weak var weakVM: ConflictsViewModel?
        do {
            let vm = await started()
            weakVM = vm
        }
        await Task.yield()
        XCTAssertNil(weakVM)
    }
}
