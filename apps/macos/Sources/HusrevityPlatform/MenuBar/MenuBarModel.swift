import Combine
import Foundation
import HusrevityStore

public struct MenuBarEntry: Equatable, Identifiable, Sendable {
    /// The item's local id, plus `:<yyyy-MM-dd>` for an occurrence of a recurring item.
    public var id: String
    public var itemLocalId: String
    public var title: String
    public var at: Date
}

public struct MenuBarSnapshot: Equatable, Sendable {
    public var openTodayCount: Int
    public var upcoming: [MenuBarEntry]

    public init(openTodayCount: Int = 0, upcoming: [MenuBarEntry] = []) {
        self.openTodayCount = openTodayCount
        self.upcoming = upcoming
    }
}

/// Pure computation of what the menu bar shows: how many open items fall on today's local day and
/// the next few upcoming ones (recurring items expanded). Log entries are never to-dos and are left
/// out; undated items belong to the inbox, not to today.
public struct MenuBarSnapshotBuilder: Sendable {
    private let timeZone: TimeZone
    private let expand: RecurrenceExpander
    private let upcomingLimit: Int
    private let lookahead: TimeInterval

    public init(
        timeZone: TimeZone, upcomingLimit: Int = 3, lookahead: TimeInterval = 7 * 24 * 3600,
        expand: @escaping RecurrenceExpander
    ) {
        self.timeZone = timeZone
        self.upcomingLimit = upcomingLimit
        self.lookahead = lookahead
        self.expand = expand
    }

    public func build(items: [ItemRecord], occurrences: [ItemOccurrenceRecord], now: Date) -> MenuBarSnapshot {
        let localTime = LocalTimeFormat(timeZone: timeZone)
        let today = localTime.day(now)
        let startOfToday = localTime.calendar.startOfDay(for: now)
        let end = now.addingTimeInterval(lookahead)
        let closed = ClosedOccurrences(occurrences)

        var entries: [MenuBarEntry] = []
        for item in items where item.status == "open" && item.kind != "log" {
            guard let anchor = item.scheduledAt ?? item.dueAt else { continue }
            if let rrule = item.rrule?.trimmingCharacters(in: .whitespacesAndNewlines), !rrule.isEmpty {
                guard let start = item.scheduledAt,
                    let dates = try? expand(rrule, start, startOfToday, end, timeZone)
                else { continue }
                for date in dates {
                    let day = localTime.day(date)
                    if closed.contains(item, day: day) { continue }
                    entries.append(MenuBarEntry(
                        id: "\(item.localId):\(day)", itemLocalId: item.localId, title: item.title, at: date))
                }
            } else {
                entries.append(MenuBarEntry(id: item.localId, itemLocalId: item.localId, title: item.title, at: anchor))
            }
        }

        let openToday = entries.filter { localTime.day($0.at) == today }.count
        let upcoming = entries.filter { $0.at >= now && $0.at <= end }
            .sorted { $0.at != $1.at ? $0.at < $1.at : $0.id < $1.id }
        return MenuBarSnapshot(openTodayCount: openToday, upcoming: Array(upcoming.prefix(upcomingLimit)))
    }
}

/// View model behind the `MenuBarExtra`: the snapshot, refreshed from the store, and the quick-add
/// field's state.
@MainActor
public final class MenuBarModel: ObservableObject {
    @Published public private(set) var snapshot = MenuBarSnapshot()
    public let quickAdd: QuickAddController

    private let store: LocalStore
    private let builder: MenuBarSnapshotBuilder
    private let now: @Sendable () -> Date

    public init(
        store: LocalStore, builder: MenuBarSnapshotBuilder, now: @escaping @Sendable () -> Date = { Date() },
        onQuickAdd: @escaping (String) -> Void
    ) {
        self.store = store
        self.builder = builder
        self.now = now
        quickAdd = QuickAddController(onSubmit: onQuickAdd)
    }

    /// Re-reads open items and occurrences. The store failing leaves the previous snapshot in place.
    public func reload() {
        let current = now()
        guard let items = try? store.items(status: "open"),
            let occurrences = try? store.occurrences(from: "0000-01-01", to: "9999-12-31")
        else { return }
        snapshot = builder.build(items: items, occurrences: occurrences, now: current)
    }

    /// Reloads on every trigger (store changes, a minute tick) until the stream ends.
    public func run(triggers: AsyncStream<Void>) async {
        for await _ in triggers {
            if Task.isCancelled { return }
            reload()
        }
    }
}
