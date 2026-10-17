import AppKit
import Foundation
import HusrevityCore

/// Wires the platform pieces together. The composition root creates one of these after the store
/// exists and calls `start()` once the user is signed in (or at launch; it works offline).
///
/// ```swift
/// let system = SystemServices(store: store, coreJS: coreJS) { text in pipeline.quickAdd(text) }
/// system.start()
/// // scenes: MenuBarExtra { MenuBarContentView(model: system.menuBar, ...) } label: { MenuBarLabelView(model: system.menuBar) }
/// // settings: Toggle bound to system.launchAtLogin, QuickAddShortcutHint()
/// ```
@MainActor
final class SystemServices {
    let menuBar: MenuBarModel
    let launchAtLogin: LaunchAtLoginModel
    let quickAddPanel: QuickAddPanelController
    let scheduler: any NotificationScheduler
    let replanner: NotificationReplanner

    private let store: LocalStore
    private var tasks: [Task<Void, Never>] = []
    private var wakeObserver: NSObjectProtocol?

    /// - Parameters:
    ///   - quickAdd: receives the trimmed text from the global panel and the menu bar field.
    ///   - scheduler: override in previews; the default talks to `UNUserNotificationCenter`.
    init(
        store: LocalStore, coreJS: CoreJS, timeZone: TimeZone = TimeZone(identifier: "Europe/Istanbul") ?? .current,
        scheduler: (any NotificationScheduler)? = nil,
        launchAtLoginController: any LaunchAtLoginControlling = SMAppServiceLaunchAtLogin(),
        quickAdd: @escaping (String) -> Void
    ) {
        let expand: RecurrenceExpander = { rrule, start, from, to, zone in
            try coreJS.expandOccurrences(rrule: rrule, start: start, from: from, to: to, timeZone: zone)
        }
        let scheduler = scheduler ?? UserNotificationScheduler(timeZone: timeZone)
        self.store = store
        self.scheduler = scheduler
        replanner = NotificationReplanner(
            store: store, scheduler: scheduler,
            planner: NotificationPlanner(timeZone: timeZone, expand: expand))
        menuBar = MenuBarModel(
            store: store, builder: MenuBarSnapshotBuilder(timeZone: timeZone, expand: expand),
            onQuickAdd: quickAdd)
        launchAtLogin = LaunchAtLoginModel(controller: launchAtLoginController)
        quickAddPanel = QuickAddPanelController(onSubmit: quickAdd)
    }

    /// Registers the global shortcut and starts the replanning and menu bar refresh loops.
    func start() {
        guard tasks.isEmpty else { return }
        ForegroundNotificationPresenter.shared.install()
        quickAddPanel.register()
        launchAtLogin.refresh()

        // Store changes cover local writes and everything a sync applies. The periodic tick and the
        // wake notification roll the 30-day horizon forward while nothing else changes.
        let wake = Self.wakeStream()
        let tick = Self.tickStream(every: .seconds(15 * 60))
        let replanner = self.replanner
        let store = self.store
        tasks.append(Task {
            await replanner.run(triggers: TriggerMerge.merge([
                NotificationReplanner.storeTriggers(store: store), wake.stream, tick,
            ]))
        })

        let menuBar = self.menuBar
        tasks.append(Task { @MainActor in
            await menuBar.run(triggers: TriggerMerge.merge([
                NotificationReplanner.storeTriggers(store: store), Self.tickStream(every: .seconds(60)),
            ]))
        })
        wakeObserver = wake.observer
    }

    func stop() {
        tasks.forEach { $0.cancel() }
        tasks = []
        if let wakeObserver { NSWorkspace.shared.notificationCenter.removeObserver(wakeObserver) }
        wakeObserver = nil
        quickAddPanel.unregister()
    }

    private static func tickStream(every interval: Duration) -> AsyncStream<Void> {
        AsyncStream { continuation in
            let task = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: interval)
                    if Task.isCancelled { break }
                    continuation.yield()
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func wakeStream() -> (stream: AsyncStream<Void>, observer: NSObjectProtocol) {
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        let observer = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: nil
        ) { _ in continuation.yield() }
        return (stream, observer)
    }
}
