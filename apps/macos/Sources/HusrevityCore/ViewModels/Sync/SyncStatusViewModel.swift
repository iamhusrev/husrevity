import Combine
import Foundation
import HusrevitySync

/// The toolbar sync indicator: turns `SyncStatus` into a label, an SF Symbol and counts.
@MainActor
public final class SyncStatusViewModel: ObservableObject {
    @Published public private(set) var status = SyncStatus()

    private let statuses: () -> AsyncStream<SyncStatus>
    private let syncNowAction: () async -> Void
    private let context: DateContext
    private let bag = ObservationBag()

    /// - Parameters:
    ///   - statuses: a fresh `SyncCoordinator.status` stream per call.
    ///   - syncNow: wraps `SyncCoordinator.syncNow()`.
    public init(
        statuses: @escaping () -> AsyncStream<SyncStatus>, syncNow: @escaping () async -> Void,
        context: DateContext = DateContext()
    ) {
        self.statuses = statuses
        self.syncNowAction = syncNow
        self.context = context
    }

    public func start() {
        guard !bag.has("status") else { return }
        bag.observe("status", statuses()) { [weak self] in self?.apply($0) }
    }

    /// Subscribes again with a fresh stream. Needed after the coordinator was stopped and started:
    /// stopping ends every existing subscriber's stream.
    public func restart() {
        bag.cancel("status")
        start()
    }

    func apply(_ newStatus: SyncStatus) { status = newStatus }

    public func syncNow() async {
        guard canSyncNow else { return }
        await syncNowAction()
    }

    // MARK: Presentation

    public var pendingCount: Int { status.pendingCount }
    public var conflictCount: Int { status.conflictCount }
    public var hasConflicts: Bool { status.conflictCount > 0 }
    public var isSyncing: Bool { status.state == .syncing }
    public var requiresSignIn: Bool { status.state == .sessionExpired }
    public var canSyncNow: Bool { !isSyncing && !requiresSignIn }

    public var pendingText: String? { pendingCount > 0 ? L10n.Sync.pending(pendingCount) : nil }

    public var label: String {
        switch status.state {
        case .idle: return status.lastSyncedAt == nil ? L10n.Sync.never : L10n.Sync.synced
        case .syncing: return L10n.Sync.syncing
        case .offline: return L10n.Sync.offline
        case .failed: return L10n.Sync.failed
        case .sessionExpired: return L10n.Sync.sessionExpired
        }
    }

    /// SF Symbol name.
    public var iconName: String {
        switch status.state {
        case .idle: return status.lastSyncedAt == nil ? "icloud" : "checkmark.icloud"
        case .syncing: return "arrow.triangle.2.circlepath.icloud"
        case .offline: return "icloud.slash"
        case .failed: return "exclamationmark.icloud"
        case .sessionExpired: return "person.crop.circle.badge.exclamationmark"
        }
    }

    /// Second line: when it last synced (or the failure), then the queue size.
    public var detail: String? {
        var parts: [String] = []
        switch status.state {
        case .idle:
            if let last = status.lastSyncedAt { parts.append(L10n.Sync.lastSynced(context.relativeLabel(last))) }
        case .failed(let message): parts.append(message)
        case .syncing, .offline, .sessionExpired: break
        }
        if let pending = pendingText { parts.append(pending) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
