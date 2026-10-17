import Foundation
import HusrevityModels
import XCTest
@testable import HusrevityStore
@testable import HusrevitySync

final class CoordinatorTests: SyncTestCase {
    private let tick = Duration.seconds(60)
    private let debounce = Duration.milliseconds(300)
    private var runner: FakeRunner!
    private var monitor: FakeNetworkMonitor!
    private var ticker: FakeTicker!
    private var coordinator: SyncCoordinator!
    private let stamp = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUpWithError() throws {
        try super.setUpWithError()
        runner = FakeRunner()
        monitor = FakeNetworkMonitor(online: true)
        ticker = FakeTicker()
        coordinator = makeCoordinator()
    }

    override func tearDownWithError() throws {
        coordinator = nil
        try super.tearDownWithError()
    }

    private func makeCoordinator() -> SyncCoordinator {
        let stamp = self.stamp
        return SyncCoordinator(
            runner: runner, store: store, monitor: monitor, ticker: ticker,
            interval: tick, debounce: debounce, now: { stamp }
        )
    }

    private func status(where predicate: @escaping @Sendable (SyncStatus) -> Bool) async -> SyncStatus? {
        let stream = coordinator.status
        return await withTaskGroup(of: SyncStatus?.self) { group in
            group.addTask {
                for await s in stream where predicate(s) { return s }
                return nil
            }
            let result = await group.next() ?? nil
            group.cancelAll()
            return result
        }
    }

    // MARK: triggers

    func testStartTriggersASyncAndReportsIdleWithTheTimestamp() async throws {
        await coordinator.start()

        await waitUntil("first sync") { self.runner.calls == 1 }
        let s = await status { $0.state == .idle && $0.lastSyncedAt != nil }
        XCTAssertEqual(s?.lastSyncedAt, stamp)
        await coordinator.stop()
    }

    func testStatusShowsSyncingWhileARunIsInProgress() async throws {
        let gate = ManualGate()
        runner.setGate(gate)
        await coordinator.start()
        await gate.waitForArrivals(1)

        let s = await status { $0.state == .syncing }
        XCTAssertNotNil(s)
        gate.open()
        _ = await status { $0.state == .idle }
        await coordinator.stop()
    }

    func testALocalChangeTriggersAfterTheDebounce() async throws {
        await coordinator.start()
        await waitUntil { self.runner.calls == 1 }
        await waitUntil { self.ticker.active(self.tick) == 1 }

        coordinator.notifyLocalChange()
        await waitUntil { self.ticker.active(self.debounce) == 1 }
        XCTAssertEqual(runner.calls, 1, "not before the debounce elapsed")
        ticker.fire(debounce)

        await waitUntil("sync after local change") { self.runner.calls == 2 }
        await coordinator.stop()
    }

    func testBurstsOfLocalChangesCoalesceIntoOneSync() async throws {
        await coordinator.start()
        await waitUntil { self.runner.calls == 1 }

        coordinator.notifyLocalChange()
        await waitUntil { self.ticker.registrations(self.debounce) == 1 }
        coordinator.notifyLocalChange()
        await waitUntil { self.ticker.registrations(self.debounce) == 2 }
        coordinator.notifyLocalChange()
        await waitUntil { self.ticker.registrations(self.debounce) == 3 && self.ticker.active(self.debounce) == 1 }
        ticker.fire(debounce)

        await waitUntil { self.runner.calls == 2 }
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(runner.calls, 2, "three notifications, one sync")
        await coordinator.stop()
    }

    func testTheTimerTriggersEverySixtySeconds() async throws {
        await coordinator.start()
        await waitUntil { self.runner.calls == 1 }

        await waitUntil { self.ticker.active(self.tick) == 1 }
        ticker.fire(tick)
        await waitUntil("first tick") { self.runner.calls == 2 }

        await waitUntil { self.ticker.active(self.tick) == 1 }
        ticker.fire(tick)
        await waitUntil("second tick") { self.runner.calls == 3 }
        await coordinator.stop()
    }

    func testReconnectingTriggersASync() async throws {
        await coordinator.start()
        await waitUntil { self.runner.calls == 1 }

        monitor.send(false)
        _ = await status { $0.state == .offline }
        monitor.send(true)

        await waitUntil("sync after reconnect") { self.runner.calls == 2 }
        await coordinator.stop()
    }

    func testRepeatedOnlineReportsDoNotTrigger() async throws {
        await coordinator.start()
        await waitUntil { self.runner.calls == 1 }
        monitor.send(true)
        monitor.send(true)
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(runner.calls, 1)
        await coordinator.stop()
    }

    func testManualSyncRunsImmediately() async throws {
        await coordinator.start()
        await waitUntil { self.runner.calls == 1 }
        await coordinator.syncNow()
        XCTAssertEqual(runner.calls, 2)
        await coordinator.stop()
    }

    // MARK: offline

    func testNothingSyncsWhileOffline() async throws {
        monitor.send(false)
        await coordinator.start()
        _ = await status { $0.state == .offline }
        await waitUntil { self.ticker.active(self.tick) == 1 }

        ticker.fire(tick)
        coordinator.notifyLocalChange()
        await waitUntil { self.ticker.active(self.debounce) == 1 }
        ticker.fire(debounce)
        for _ in 0..<200 { await Task.yield() }

        XCTAssertEqual(runner.calls, 0, "no calls while the network is down")
        monitor.send(true)
        await waitUntil("sync once back online") { self.runner.calls == 1 }
        await coordinator.stop()
    }

    func testAnOfflineOutcomeIsShownAsOffline() async throws {
        runner.enqueue(SyncOutcome(result: .offline))
        await coordinator.start()
        let s = await status { $0.state == .offline }
        XCTAssertNotNil(s)
        await coordinator.stop()
    }

    // MARK: failures

    func testAFailedOutcomeIsShownWithItsMessage() async throws {
        runner.enqueue(SyncOutcome(result: .failed("Server error 503")))
        await coordinator.start()
        let s = await status { $0.state == .failed("Server error 503") }
        XCTAssertNotNil(s)
        await coordinator.stop()
    }

    func testSessionExpiryHaltsSyncingUntilTheUserSignsInAgain() async throws {
        runner.enqueue(SyncOutcome(result: .sessionExpired))
        await coordinator.start()
        _ = await status { $0.state == .sessionExpired }
        await waitUntil { self.ticker.active(self.tick) == 1 }

        ticker.fire(tick)
        coordinator.notifyLocalChange()
        await waitUntil { self.ticker.active(self.debounce) == 1 }
        ticker.fire(debounce)
        for _ in 0..<200 { await Task.yield() }
        XCTAssertEqual(runner.calls, 1, "no hammering with dead credentials")

        await coordinator.resumeAfterSignIn()
        await waitUntil("sync after sign-in") { self.runner.calls == 2 }
        let s = await status { $0.state == .idle }
        XCTAssertNotNil(s)
        await coordinator.stop()
    }

    func testNetworkChangesNeverOverwriteSessionExpired() async throws {
        runner.enqueue(SyncOutcome(result: .sessionExpired))
        await coordinator.start()
        _ = await status { $0.state == .sessionExpired }

        monitor.send(false)
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(coordinator.currentStatus.state, .sessionExpired)
        monitor.send(true)
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(coordinator.currentStatus.state, .sessionExpired)
        XCTAssertEqual(runner.calls, 1, "no sync attempted with dead credentials")

        await coordinator.resumeAfterSignIn()
        await waitUntil("sync after sign-in") { self.runner.calls == 2 }
        _ = await status { $0.state == .idle }
        await coordinator.stop()
    }

    // MARK: counts

    func testPendingAndConflictCountsComeFromTheStore() async throws {
        await coordinator.start()
        _ = try store.create(NoteRecord(title: "queued"))
        let pending = await status { $0.pendingCount == 1 }
        XCTAssertNotNil(pending)

        let note = try XCTUnwrap(store.notes().first)
        try store.recordConflict(entity: .note, localId: note.localId, localPayload: .object([:]), serverPayload: .object([:]))
        let conflicted = await status { $0.conflictCount == 1 }
        XCTAssertNotNil(conflicted)
        await coordinator.stop()
    }

    // MARK: stop

    func testStopEndsEveryLoopAndLeaksNothing() async throws {
        await coordinator.start()
        await waitUntil { self.runner.calls == 1 }
        await waitUntil { self.ticker.active(self.tick) == 1 && self.monitor.activeStreams == 1 }
        coordinator.notifyLocalChange()
        await waitUntil { self.ticker.active(self.debounce) == 1 }

        await coordinator.stop()

        XCTAssertEqual(ticker.activeTotal, 0, "timer and debounce sleeps were cancelled")
        await waitUntil("monitor stream released") { self.monitor.activeStreams == 0 }
        XCTAssertGreaterThanOrEqual(runner.cancels, 1)

        let before = runner.calls
        ticker.fire(tick)
        ticker.fire(debounce)
        monitor.send(false)
        monitor.send(true)
        coordinator.notifyLocalChange()
        for _ in 0..<200 { await Task.yield() }
        XCTAssertEqual(runner.calls, before, "nothing runs after stop")
        XCTAssertEqual(ticker.activeTotal, 0, "stopped coordinators do not start new sleeps")
    }

    func testStartIsIdempotentAndStopWithoutStartIsHarmless() async throws {
        await coordinator.stop()
        await coordinator.start()
        await coordinator.start()
        await waitUntil { self.runner.calls == 1 }
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(runner.calls, 1)
        XCTAssertEqual(monitor.activeStreams, 1)
        await coordinator.stop()
    }

    func testItCanBeRestartedAfterStop() async throws {
        await coordinator.start()
        await waitUntil { self.runner.calls == 1 }
        await coordinator.stop()
        await coordinator.start()
        await waitUntil("sync after restart") { self.runner.calls == 2 }
        await coordinator.stop()
    }

    func testStopCancelsARunInProgress() async throws {
        let gate = ManualGate()
        runner.setGate(gate)
        await coordinator.start()
        await gate.waitForArrivals(1)

        let stopping = Task { await coordinator.stop() }
        await waitUntil { self.runner.cancels == 1 }
        gate.open()
        await stopping.value
        XCTAssertEqual(ticker.activeTotal, 0)
    }
}
