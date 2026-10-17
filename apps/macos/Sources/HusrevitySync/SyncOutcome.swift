import Foundation

/// What one `SyncEngine.syncNow()` run achieved.
public struct SyncOutcome: Equatable, Sendable {
    public enum Result: Equatable, Sendable {
        /// Push and pull both completed (entries may still be parked or in conflict).
        case synced
        /// The network was unreachable; nothing was pulled, the cursor did not move.
        case offline
        /// The server rejected the credentials; every entry stays pending.
        case sessionExpired
        /// A retryable server problem (5xx, rate limit, unreadable 2xx) or a local failure.
        case failed(String)
        /// The run was cancelled; the in-flight entry went back to the queue.
        case cancelled
    }

    public var result: Result
    /// Entries accepted by the server during this run.
    public var pushed: Int
    /// Entries parked as `failed` (validation or other permanent errors).
    public var parked: Int
    /// 409s recorded as conflicts.
    public var conflicts: Int
    /// True when a pull was applied and the cursor advanced.
    public var pulled: Bool

    public init(result: Result, pushed: Int = 0, parked: Int = 0, conflicts: Int = 0, pulled: Bool = false) {
        self.result = result
        self.pushed = pushed
        self.parked = parked
        self.conflicts = conflicts
        self.pulled = pulled
    }
}

/// Observable state for the UI.
public struct SyncStatus: Equatable, Sendable {
    public enum State: Equatable, Sendable {
        case idle
        case syncing
        case offline
        case failed(String)
        case sessionExpired
    }

    public var state: State
    public var lastSyncedAt: Date?
    public var pendingCount: Int
    public var conflictCount: Int

    public init(state: State = .idle, lastSyncedAt: Date? = nil, pendingCount: Int = 0, conflictCount: Int = 0) {
        self.state = state
        self.lastSyncedAt = lastSyncedAt
        self.pendingCount = pendingCount
        self.conflictCount = conflictCount
    }
}
