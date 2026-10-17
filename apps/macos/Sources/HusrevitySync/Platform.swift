import Foundation
import Network

/// Reachability source. `updates()` yields the current state first, then every change
/// (`true` = online). The stream must finish (or stop yielding) when its consumer is cancelled.
public protocol NetworkMonitor: Sendable {
    func updates() -> AsyncStream<Bool>
}

/// Sleep abstraction for the 60 s timer and the local-change debounce, so tests never wait.
public protocol Ticker: Sendable {
    /// Suspends for `duration`; throws `CancellationError` when the task is cancelled.
    func sleep(for duration: Duration) async throws
}

/// Real-time `Ticker`.
public struct SystemTicker: Ticker {
    public init() {}

    public func sleep(for duration: Duration) async throws {
        try await Task.sleep(for: duration)
    }
}

/// `NetworkMonitor` backed by `NWPathMonitor`. Not unit-tested (it needs the real network stack).
public struct PathNetworkMonitor: NetworkMonitor {
    public init() {}

    public func updates() -> AsyncStream<Bool> {
        AsyncStream { continuation in
            let monitor = NWPathMonitor()
            monitor.pathUpdateHandler = { continuation.yield($0.status == .satisfied) }
            continuation.onTermination = { _ in monitor.cancel() }
            monitor.start(queue: DispatchQueue(label: "husrevity.sync.path-monitor"))
        }
    }
}
