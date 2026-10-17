import Foundation
import HusrevityStore

/// What the coordinator needs from the engine. `SyncEngine` conforms; tests fake it.
public protocol SyncRunning: Sendable {
    func syncNow() async -> SyncOutcome
    func cancelCurrentRun() async
}

extension SyncEngine: SyncRunning {}

/// Owns the sync triggers and publishes `SyncStatus`.
///
/// Triggers: start, a debounced local change, a repeating timer, and the network coming back.
/// Nothing triggers while the network is down or after the session expired. The coordinator keeps
/// its tasks alive until `stop()`, so always call `stop()` before dropping it.
public actor SyncCoordinator {
    private let runner: any SyncRunning
    private let store: LocalStore
    private let monitor: any NetworkMonitor
    private let ticker: any Ticker
    private let interval: Duration
    private let debounce: Duration
    private let now: @Sendable () -> Date
    private let hub = StatusHub()

    private var running = false
    private var online = false
    private var sessionExpired = false
    private var triggers: AsyncStream<Void>.Continuation?
    private var tasks: [Task<Void, Never>] = []
    private var debounceTask: Task<Void, Never>?

    public init(
        runner: any SyncRunning, store: LocalStore, monitor: any NetworkMonitor, ticker: any Ticker,
        interval: Duration = .seconds(60), debounce: Duration = .milliseconds(300),
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.runner = runner
        self.store = store
        self.monitor = monitor
        self.ticker = ticker
        self.interval = interval
        self.debounce = debounce
        self.now = now
    }

    // MARK: Status

    /// A new stream per access. It yields the current status first, then every change, and ends
    /// when the coordinator stops.
    public nonisolated var status: AsyncStream<SyncStatus> { hub.subscribe() }
    public nonisolated var currentStatus: SyncStatus { hub.current }

    // MARK: Lifecycle

    public func start() {
        guard !running else { return }
        running = true
        online = false  // until the monitor reports; its first value is the current state
        let (stream, continuation) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        triggers = continuation
        let monitor = self.monitor
        let ticker = self.ticker
        let interval = self.interval
        let store = self.store
        let hub = self.hub

        tasks = [
            // Serial worker: triggers that arrive during a run collapse into one follow-up.
            Task { for await _ in stream { await self.performSync() } },
            Task { for await isOnline in monitor.updates() { await self.networkChanged(isOnline) } },
            Task {
                while !Task.isCancelled {
                    do { try await ticker.sleep(for: interval) } catch { break }
                    await self.timerFired()
                }
            },
            Task { for await n in store.observeOutboxCount() { hub.update { $0.pendingCount = n } } },
            Task { for await n in store.observeUnresolvedConflictCount() { hub.update { $0.conflictCount = n } } },
        ]
    }

    /// Cancels every task (including a run in progress) and waits for them to finish.
    public func stop() async {
        guard running else { return }
        running = false
        triggers?.finish()
        triggers = nil
        debounceTask?.cancel()
        let finishing = tasks + (debounceTask.map { [$0] } ?? [])
        tasks = []
        debounceTask = nil
        finishing.forEach { $0.cancel() }
        await runner.cancelCurrentRun()
        for task in finishing { await task.value }
        hub.finishAll()
    }

    // MARK: Triggers

    /// Call after every local write. Syncs once the writes stop for the debounce interval.
    public nonisolated func notifyLocalChange() {
        Task { await self.scheduleDebounced() }
    }

    /// Syncs right now (pull-to-refresh, a "Sync now" button) and returns when the run is over.
    public func syncNow() async {
        guard running else { return }
        await performSync()
    }

    /// Call after the user signed in again; clears the expired state and syncs.
    public func resumeAfterSignIn() {
        sessionExpired = false
        hub.update { if $0.state == .sessionExpired { $0.state = .idle } }
        trigger()
    }

    private func scheduleDebounced() {
        guard running else { return }
        debounceTask?.cancel()
        let ticker = self.ticker
        let debounce = self.debounce
        debounceTask = Task {
            do { try await ticker.sleep(for: debounce) } catch { return }
            if Task.isCancelled { return }
            await self.trigger()
        }
    }

    private func timerFired() { trigger() }

    private func networkChanged(_ isOnline: Bool) {
        guard running else { return }
        let wasOnline = online
        online = isOnline
        // An expired session outranks connectivity: only resumeAfterSignIn() clears it.
        guard !sessionExpired else { return }
        if !isOnline {
            hub.update { $0.state = .offline }
        } else if !wasOnline {
            hub.update { if $0.state == .offline { $0.state = .idle } }
            trigger()
        }
    }

    private func trigger() {
        guard running, online, !sessionExpired else { return }
        triggers?.yield()
    }

    private func performSync() async {
        guard running, online, !sessionExpired else { return }
        hub.update { $0.state = .syncing }
        let outcome = await runner.syncNow()
        guard running else { return }
        let finished = now()
        switch outcome.result {
        case .synced:
            hub.update {
                $0.state = .idle
                $0.lastSyncedAt = finished
            }
        case .offline:
            hub.update { $0.state = .offline }
        case .sessionExpired:
            sessionExpired = true
            hub.update { $0.state = .sessionExpired }
        case .failed(let message):
            hub.update { $0.state = .failed(message) }
        case .cancelled:
            hub.update { if $0.state == .syncing { $0.state = .idle } }
        }
    }
}
