import Foundation

/// What a sync / local write changed relative to the notifications already pending.
public struct NotificationDiff: Equatable, Sendable {
    /// Notifications to schedule. An identifier that is already pending is replaced.
    public var toAdd: [PlannedNotification]
    public var toRemove: [String]

    public var isEmpty: Bool { toAdd.isEmpty && toRemove.isEmpty }

    public init(toAdd: [PlannedNotification] = [], toRemove: [String] = []) {
        self.toAdd = toAdd
        self.toRemove = toRemove
    }

    /// Compares what should be pending with what is. Only identifiers with the planner's prefix are
    /// ever removed, so notifications from other features stay untouched. A changed notification is
    /// returned in `toAdd` only: scheduling an identifier again replaces the pending request.
    public static func make(planned: [PlannedNotification], pending: [PlannedNotification]) -> NotificationDiff {
        var pendingById: [String: PlannedNotification] = [:]
        for notification in pending where pendingById[notification.identifier] == nil {
            pendingById[notification.identifier] = notification
        }
        let plannedIds = Set(planned.map { $0.identifier })

        var toAdd: [PlannedNotification] = []
        for notification in planned {
            if let existing = pendingById[notification.identifier], Self.same(existing, notification) { continue }
            toAdd.append(notification)
        }
        toAdd.sort { lhs, rhs in
            lhs.fireAt != rhs.fireAt ? lhs.fireAt < rhs.fireAt : lhs.identifier < rhs.identifier
        }

        let prefix = NotificationPlanner.identifierPrefix
        let stale = pendingById.keys.filter { $0.hasPrefix(prefix) && !plannedIds.contains($0) }
        return NotificationDiff(toAdd: toAdd, toRemove: stale.sorted())
    }

    /// The OS stores fire times with one second of precision.
    private static func same(_ a: PlannedNotification, _ b: PlannedNotification) -> Bool {
        a.title == b.title && a.body == b.body && abs(a.fireAt.timeIntervalSince(b.fireAt)) < 1
    }
}

/// The OS side of notifications. `UNUserNotificationCenter` implements it in the app target; the
/// fake below stands in everywhere else.
public protocol NotificationScheduler: Sendable {
    /// Asks for permission when needed. Returns whether notifications may be delivered.
    func requestAuthorization() async -> Bool
    /// Everything currently pending, with fire time, title and body.
    func pendingNotifications() async -> [PlannedNotification]
    /// Removes the stale identifiers, then schedules the new ones. Never throws: a denied
    /// permission or a failing request just leaves the notification unscheduled.
    func apply(_ diff: NotificationDiff) async
}

/// Remembers a granted authorization so the OS prompt flow runs once, and lets concurrent callers
/// share a single in-flight request. A denial is not remembered: the user may grant permission in
/// System Settings later, and asking the OS again is silent.
public actor AuthorizationGate {
    private var granted = false
    private var inFlight: Task<Bool, Never>?

    public init() {}

    public func ensure(_ request: @escaping @Sendable () async -> Bool) async -> Bool {
        if granted { return true }
        if let inFlight { return await inFlight.value }
        let task = Task { await request() }
        inFlight = task
        let result = await task.value
        inFlight = nil
        if result { granted = true }
        return result
    }
}

/// In-memory scheduler for tests and previews. Behaves like the OS: scheduling an identifier again
/// replaces it, and nothing is scheduled while permission is denied.
public actor FakeNotificationScheduler: NotificationScheduler {
    public private(set) var appliedDiffs: [NotificationDiff] = []
    public private(set) var authorizationRequests = 0
    private var granted = true
    private var pending: [String: PlannedNotification] = [:]

    public init(granted: Bool = true) { self.granted = granted }

    public func setGranted(_ value: Bool) { granted = value }
    /// Puts a notification straight into the pending set, as if another feature had scheduled it.
    public func seed(_ notification: PlannedNotification) { pending[notification.identifier] = notification }
    public func pendingList() -> [PlannedNotification] {
        pending.values.sorted { $0.fireAt != $1.fireAt ? $0.fireAt < $1.fireAt : $0.identifier < $1.identifier }
    }
    public func pendingIdentifiers() -> [String] { pendingList().map(\.identifier).sorted() }

    public func requestAuthorization() async -> Bool {
        authorizationRequests += 1
        return granted
    }

    public func pendingNotifications() async -> [PlannedNotification] { pendingList() }

    public func apply(_ diff: NotificationDiff) async {
        appliedDiffs.append(diff)
        for id in diff.toRemove { pending[id] = nil }
        guard granted else { return }
        for notification in diff.toAdd { pending[notification.identifier] = notification }
    }
}
