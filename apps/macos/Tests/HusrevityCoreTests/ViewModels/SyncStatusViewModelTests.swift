import XCTest

@testable import HusrevityCore

@MainActor
final class SyncStatusViewModelTests: XCTestCase {
    private let now = ViewModelTestSupport.date("2026-10-18T10:00:00+03:00")
    private var syncNowCalls = 0

    private func makeVM(
        stream: AsyncStream<SyncStatus> = AsyncStream { _ in }
    ) -> SyncStatusViewModel {
        SyncStatusViewModel(
            statuses: { stream }, syncNow: { [unowned self] in self.syncNowCalls += 1 },
            context: DateContext(now: { [now] in now }, timeZone: DateContext.istanbul))
    }

    func testBeforeAnyEmissionItShowsTheNeverSyncedIdleState() {
        let vm = makeVM()
        XCTAssertEqual(vm.label, L10n.Sync.never)
        XCTAssertEqual(vm.iconName, "icloud")
        XCTAssertEqual(vm.pendingCount, 0)
        XCTAssertFalse(vm.isSyncing)
        XCTAssertFalse(vm.requiresSignIn)
    }

    func testMappingOfEveryState() {
        let ago = now.addingTimeInterval(-5 * 60)
        func vm(_ status: SyncStatus) -> SyncStatusViewModel {
            let v = makeVM()
            v.apply(status)
            return v
        }
        let synced = vm(SyncStatus(state: .idle, lastSyncedAt: ago))
        XCTAssertEqual(synced.label, "Senkronize")
        XCTAssertEqual(synced.detail, "Son: 5 dk önce")
        XCTAssertEqual(synced.iconName, "checkmark.icloud")

        let syncing = vm(SyncStatus(state: .syncing, lastSyncedAt: ago))
        XCTAssertEqual(syncing.label, "Senkronize ediliyor…")
        XCTAssertEqual(syncing.iconName, "arrow.triangle.2.circlepath.icloud")
        XCTAssertTrue(syncing.isSyncing)
        XCTAssertFalse(syncing.canSyncNow)

        let offline = vm(SyncStatus(state: .offline))
        XCTAssertEqual(offline.label, "Çevrimdışı")
        XCTAssertEqual(offline.iconName, "icloud.slash")

        let failed = vm(SyncStatus(state: .failed("HTTP 500")))
        XCTAssertEqual(failed.label, "Senkronizasyon hatası")
        XCTAssertEqual(failed.detail, "HTTP 500")
        XCTAssertEqual(failed.iconName, "exclamationmark.icloud")

        let expired = vm(SyncStatus(state: .sessionExpired))
        XCTAssertEqual(expired.label, "Oturum süresi doldu")
        XCTAssertTrue(expired.requiresSignIn)
        XCTAssertFalse(expired.canSyncNow)
    }

    func testPendingChangesAndConflictsAreExposed() {
        let vm = makeVM()
        vm.apply(SyncStatus(state: .idle, lastSyncedAt: now, pendingCount: 3, conflictCount: 2))
        XCTAssertEqual(vm.pendingCount, 3)
        XCTAssertEqual(vm.pendingText, "3 değişiklik bekliyor")
        XCTAssertEqual(vm.conflictCount, 2)
        XCTAssertTrue(vm.hasConflicts)
        XCTAssertEqual(vm.detail, "Son: az önce · 3 değişiklik bekliyor")
        vm.apply(SyncStatus(state: .idle, lastSyncedAt: now))
        XCTAssertNil(vm.pendingText)
        XCTAssertFalse(vm.hasConflicts)
    }

    func testRelativeTimes() {
        let vm = makeVM()
        func detail(_ seconds: TimeInterval) -> String? {
            vm.apply(SyncStatus(state: .idle, lastSyncedAt: now.addingTimeInterval(-seconds)))
            return vm.detail
        }
        XCTAssertEqual(detail(10), "Son: az önce")
        XCTAssertEqual(detail(3 * 3600), "Son: 3 sa önce")
        XCTAssertEqual(detail(3 * 86_400), "Son: 15 Eki 10:00")
    }

    func testStreamedStatusesUpdateThePublishedState() async {
        let (stream, continuation) = AsyncStream<SyncStatus>.makeStream()
        let vm = makeVM(stream: stream)
        vm.start()
        continuation.yield(SyncStatus(state: .syncing))
        let syncing = expectation(description: "syncing")
        let sub = vm.$status.sink { if $0.state == .syncing { syncing.fulfill() } }
        await fulfillment(of: [syncing], timeout: 5)
        continuation.yield(SyncStatus(state: .offline, pendingCount: 1))
        let offline = expectation(description: "offline")
        let sub2 = vm.$status.sink { if $0.state == .offline { offline.fulfill() } }
        await fulfillment(of: [offline], timeout: 5)
        XCTAssertEqual(vm.label, "Çevrimdışı")
        sub.cancel()
        sub2.cancel()
    }

    func testSyncNowDelegatesAndIsRefusedWhileSyncing() async {
        let vm = makeVM()
        await vm.syncNow()
        XCTAssertEqual(syncNowCalls, 1)
        vm.apply(SyncStatus(state: .syncing))
        await vm.syncNow()
        XCTAssertEqual(syncNowCalls, 1)
    }

    func testObservationStopsWhenTheViewModelIsReleased() async {
        let terminated = expectation(description: "stream terminated")
        let (stream, continuation) = AsyncStream<SyncStatus>.makeStream()
        continuation.onTermination = { _ in terminated.fulfill() }
        var vm: SyncStatusViewModel? = makeVM(stream: stream)
        vm?.start()
        vm = nil
        await fulfillment(of: [terminated], timeout: 5)
    }
}
