import Foundation
import XCTest
@testable import HusrevitySync

/// Polls `condition`, yielding between checks, until it holds or a generous deadline passes.
/// The deadline only guards against a hung test; a passing run never waits on it.
@discardableResult
func waitUntil(
    _ message: @autoclosure () -> String = "condition", file: StaticString = #filePath, line: UInt = #line,
    _ condition: @Sendable () async -> Bool
) async -> Bool {
    let deadline = ContinuousClock.now.advanced(by: .seconds(10))
    while ContinuousClock.now < deadline {
        if await condition() { return true }
        await Task.yield()
    }
    XCTFail("timed out waiting for \(message())", file: file, line: line)
    return false
}

/// A `Ticker` whose sleeps end only when the test fires them.
final class FakeTicker: Ticker, @unchecked Sendable {
    private struct Sleeper {
        let id: Int
        let duration: Duration
        let continuation: CheckedContinuation<Void, Error>
    }

    private let lock = NSLock()
    private var sleepers: [Sleeper] = []
    private var nextId = 0
    private var registered: [Duration: Int] = [:]

    func sleep(for duration: Duration) async throws {
        let id: Int = lock.withLock {
            nextId += 1
            return nextId
        }
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
                lock.lock()
                if Task.isCancelled {
                    lock.unlock()
                    c.resume(throwing: CancellationError())
                    return
                }
                sleepers.append(Sleeper(id: id, duration: duration, continuation: c))
                registered[duration, default: 0] += 1
                lock.unlock()
            }
        } onCancel: {
            lock.lock()
            let gone = sleepers.first { $0.id == id }
            sleepers.removeAll { $0.id == id }
            lock.unlock()
            gone?.continuation.resume(throwing: CancellationError())
        }
    }

    /// Sleeps currently suspended for `duration`.
    func active(_ duration: Duration) -> Int { lock.withLock { sleepers.filter { $0.duration == duration }.count } }
    var activeTotal: Int { lock.withLock { sleepers.count } }
    /// How many sleeps for `duration` were ever started.
    func registrations(_ duration: Duration) -> Int { lock.withLock { registered[duration] ?? 0 } }

    /// Ends every current sleep of `duration` normally.
    func fire(_ duration: Duration) {
        let due: [Sleeper] = lock.withLock {
            let due = sleepers.filter { $0.duration == duration }
            sleepers.removeAll { $0.duration == duration }
            return due
        }
        due.forEach { $0.continuation.resume() }
    }
}

/// A `NetworkMonitor` the test drives by hand.
final class FakeNetworkMonitor: NetworkMonitor, @unchecked Sendable {
    private let lock = NSLock()
    private var continuations: [Int: AsyncStream<Bool>.Continuation] = [:]
    private var nextId = 0
    private var current: Bool

    init(online: Bool = true) { current = online }

    func updates() -> AsyncStream<Bool> {
        AsyncStream { continuation in
            lock.lock()
            nextId += 1
            let id = nextId
            continuations[id] = continuation
            let initial = current
            lock.unlock()
            continuation.yield(initial)
            continuation.onTermination = { [weak self] _ in
                self?.lock.withLock { _ = self?.continuations.removeValue(forKey: id) }
            }
        }
    }

    func send(_ online: Bool) {
        let all: [AsyncStream<Bool>.Continuation] = lock.withLock {
            current = online
            return Array(continuations.values)
        }
        all.forEach { $0.yield(online) }
    }

    var activeStreams: Int { lock.withLock { continuations.count } }
}

/// A scripted `SyncRunning` that records calls.
final class FakeRunner: SyncRunning, @unchecked Sendable {
    private let lock = NSLock()
    private var _calls = 0
    private var _cancels = 0
    private var outcomes: [SyncOutcome] = []
    private var gate: ManualGate?

    var calls: Int { lock.withLock { _calls } }
    var cancels: Int { lock.withLock { _cancels } }

    func enqueue(_ outcome: SyncOutcome) { lock.withLock { outcomes.append(outcome) } }
    func setGate(_ gate: ManualGate?) { lock.withLock { self.gate = gate } }

    func syncNow() async -> SyncOutcome {
        let (g, outcome): (ManualGate?, SyncOutcome) = lock.withLock {
            _calls += 1
            return (gate, outcomes.isEmpty ? SyncOutcome(result: .synced) : outcomes.removeFirst())
        }
        await g?.wait()
        return outcome
    }

    func cancelCurrentRun() async { lock.withLock { _cancels += 1 } }
}
