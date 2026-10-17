import Foundation

/// Fan-out of `SyncStatus` values to any number of `AsyncStream` subscribers. Each new
/// subscriber first receives the current value. Thread-safe, so the coordinator can expose it
/// without hopping onto its actor.
final class StatusHub: @unchecked Sendable {
    private let lock = NSLock()
    private var value: SyncStatus
    private var subscribers: [Int: AsyncStream<SyncStatus>.Continuation] = [:]
    private var nextId = 0

    init(_ initial: SyncStatus = SyncStatus()) { value = initial }

    var current: SyncStatus { lock.withLock { value } }

    func subscribe() -> AsyncStream<SyncStatus> {
        AsyncStream { continuation in
            let (id, snapshot): (Int, SyncStatus) = lock.withLock {
                nextId += 1
                subscribers[nextId] = continuation
                return (nextId, value)
            }
            continuation.yield(snapshot)
            continuation.onTermination = { [weak self] _ in
                self?.lock.withLock { _ = self?.subscribers.removeValue(forKey: id) }
            }
        }
    }

    /// Applies `change`; subscribers hear about it only when the value actually changed.
    func update(_ change: (inout SyncStatus) -> Void) {
        let changed: (SyncStatus, [AsyncStream<SyncStatus>.Continuation])? = lock.withLock {
            var copy = value
            change(&copy)
            guard copy != value else { return nil }
            value = copy
            return (copy, Array(subscribers.values))
        }
        guard let (next, targets) = changed else { return }
        targets.forEach { $0.yield(next) }
    }

    /// Ends every subscriber's stream (the coordinator stopped). New subscriptions still work.
    func finishAll() {
        let all: [AsyncStream<SyncStatus>.Continuation] = lock.withLock {
            let all = Array(subscribers.values)
            subscribers = [:]
            return all
        }
        all.forEach { $0.finish() }
    }
}
