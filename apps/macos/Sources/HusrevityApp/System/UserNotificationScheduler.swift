import Foundation
import HusrevityCore
import UserNotifications

/// `NotificationScheduler` on top of `UNUserNotificationCenter`.
///
/// `UNUserNotificationCenter.current()` traps when the process is not an app bundle (`swift run`,
/// `swift test`), so every entry point checks `isAvailable` first and quietly does nothing outside
/// a bundle. A denied permission is tolerated the same way: nothing is scheduled, nothing throws.
final class UserNotificationScheduler: NotificationScheduler, @unchecked Sendable {
    private let gate = AuthorizationGate()
    private let timeZone: TimeZone

    init(timeZone: TimeZone = .current) { self.timeZone = timeZone }

    /// True when running from a `.app` bundle, the only place the notification center works.
    static var isAvailable: Bool {
        Bundle.main.bundleIdentifier != nil && Bundle.main.bundleURL.pathExtension == "app"
    }

    private var center: UNUserNotificationCenter? {
        Self.isAvailable ? UNUserNotificationCenter.current() : nil
    }

    func requestAuthorization() async -> Bool {
        guard let center else { return false }
        return await gate.ensure {
            (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        }
    }

    func pendingNotifications() async -> [PlannedNotification] {
        guard let center else { return [] }
        let requests = await center.pendingNotificationRequests()
        return requests.compactMap { request in
            guard let trigger = request.trigger as? UNCalendarNotificationTrigger,
                let fireAt = trigger.nextTriggerDate()
            else { return nil }
            return PlannedNotification(
                identifier: request.identifier, fireAt: fireAt, title: request.content.title,
                body: request.content.body)
        }
    }

    func apply(_ diff: NotificationDiff) async {
        guard let center, await requestAuthorization() else { return }
        if !diff.toRemove.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: diff.toRemove)
        }
        for notification in diff.toAdd {
            let content = UNMutableNotificationContent()
            content.title = notification.title
            content.body = notification.body
            content.sound = .default

            // Explicit components plus an explicit zone pin the trigger to one instant, whatever the
            // system zone is when it fires.
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = timeZone
            var components = calendar.dateComponents(
                [.year, .month, .day, .hour, .minute, .second], from: notification.fireAt)
            components.timeZone = timeZone
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            let request = UNNotificationRequest(
                identifier: notification.identifier, content: content, trigger: trigger)
            try? await center.add(request)  // adding an existing identifier replaces it
        }
    }
}

/// Shows banners while the app is frontmost (the system suppresses them by default).
final class ForegroundNotificationPresenter: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = ForegroundNotificationPresenter()

    /// Installs the delegate. A no-op outside an app bundle.
    func install() {
        guard UserNotificationScheduler.isAvailable else { return }
        UNUserNotificationCenter.current().delegate = self
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
