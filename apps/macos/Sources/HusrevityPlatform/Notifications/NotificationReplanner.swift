import Foundation
import HusrevityStore

/// Merges several change streams into one "something changed" stream. It finishes when every input
/// has finished, and cancels the inputs when the consumer stops.
public enum TriggerMerge {
    public static func merge<T: Sendable>(_ streams: [AsyncStream<T>]) -> AsyncStream<Void> {
        AsyncStream { continuation in
            let task = Task {
                await withTaskGroup(of: Void.self) { group in
                    for stream in streams {
                        group.addTask { for await _ in stream { continuation.yield() } }
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

/// Keeps the pending local notifications in line with the store: after every local write or sync it
/// plans again and applies only the difference to the scheduler.
public actor NotificationReplanner {
    private let store: LocalStore
    private let scheduler: any NotificationScheduler
    private let planner: NotificationPlanner
    private let now: @Sendable () -> Date
    private let localTime: LocalTimeFormat

    public init(
        store: LocalStore, scheduler: any NotificationScheduler, planner: NotificationPlanner,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.store = store
        self.scheduler = scheduler
        self.planner = planner
        self.now = now
        self.localTime = LocalTimeFormat(timeZone: planner.timeZone)
    }

    /// Plans from the current store contents and applies the difference. Silently does nothing when
    /// notification permission is denied or the store cannot be read.
    public func replan() async {
        guard await scheduler.requestAuthorization() else { return }
        let current = now()
        guard let items = try? store.items(status: "open"),
            let occurrences = try? store.occurrences(
                from: localTime.day(current.addingTimeInterval(-86_400)),
                to: localTime.day(current.addingTimeInterval(planner.horizon + 2 * 86_400)))
        else { return }
        let planned = planner.plan(items: items, occurrences: occurrences, now: current)
        let diff = NotificationDiff.make(planned: planned, pending: await scheduler.pendingNotifications())
        if !diff.isEmpty { await scheduler.apply(diff) }
    }

    /// Replans once per trigger until the stream ends. Triggers that arrive during a replan queue up
    /// (the stream buffers them), so a burst of writes costs a few cheap, idempotent passes.
    public func run(triggers: AsyncStream<Void>) async {
        for await _ in triggers {
            if Task.isCancelled { return }
            await replan()
        }
    }

    /// Fires immediately and after every change to open items or any occurrence.
    public static func storeTriggers(store: LocalStore) -> AsyncStream<Void> {
        TriggerMerge.merge([
            TriggerMerge.merge([store.observeItems(status: "open")]),
            TriggerMerge.merge([store.observeOccurrences(from: "0000-01-01", to: "9999-12-31")]),
        ])
    }
}
