import Foundation
import HusrevityStore

/// One local notification the app wants to have pending.
public struct PlannedNotification: Hashable, Sendable {
    public var identifier: String
    public var fireAt: Date
    public var title: String
    public var body: String

    public init(identifier: String, fireAt: Date, title: String, body: String) {
        self.identifier = identifier
        self.fireAt = fireAt
        self.title = title
        self.body = body
    }
}

/// Expands a bare RRULE anchored at `start` into the occurrence instants within `[from, to]`.
/// The app passes `CoreJS.expandOccurrences`, tests pass a fake, so this target stays free of JS.
public typealias RecurrenceExpander = @Sendable (
    _ rrule: String, _ start: Date, _ from: Date, _ to: Date, _ timeZone: TimeZone
) throws -> [Date]

/// Decides which local notifications should be pending, mirroring the server's lead-time rules
/// (`leadTimeFireAt` / `formatLeadTimeBody`), but also for recurring items, which the server never
/// notifies about.
///
/// Identifiers are stable: `item:<localId>` for a one-off item, `item:<localId>:<stamp>` for
/// one occurrence of a series (`<yyyy-MM-dd>T<HH:mm><utc offset>` of the occurrence in the planner's zone,
/// so several occurrences per day stay distinct). Done/skipped occurrences are matched by local date.
public struct NotificationPlanner: Sendable {
    public static let identifierPrefix = "item:"

    public let timeZone: TimeZone
    private let localTime: LocalTimeFormat
    public let horizon: TimeInterval
    private let limit: Int
    private let expand: RecurrenceExpander

    /// - Parameters:
    ///   - horizon: how far ahead recurring items are expanded (fire times beyond it are dropped).
    ///   - limit: the platform cap on pending notifications (macOS allows 64).
    public init(
        timeZone: TimeZone, horizon: TimeInterval = 30 * 24 * 3600, limit: Int = 64,
        expand: @escaping RecurrenceExpander
    ) {
        self.timeZone = timeZone
        self.localTime = LocalTimeFormat(timeZone: timeZone)
        self.horizon = horizon
        self.limit = limit
        self.expand = expand
    }

    public func plan(
        items: [ItemRecord], occurrences: [ItemOccurrenceRecord], now: Date
    ) -> [PlannedNotification] {
        let closed = ClosedOccurrences(occurrences)
        var planned: [PlannedNotification] = []
        for item in items where item.status == "open" {
            guard let lead = item.notifyMinutesBefore, lead >= 0 else { continue }
            if let rrule = item.rrule?.trimmingCharacters(in: .whitespacesAndNewlines), !rrule.isEmpty {
                planned += series(item, rrule: rrule, lead: lead, closed: closed, now: now)
            } else if let single = oneOff(item, lead: lead, now: now) {
                planned.append(single)
            }
        }
        return Self.select(planned, limit: limit)
    }

    // MARK: One-off and recurring

    private func oneOff(_ item: ItemRecord, lead: Int, now: Date) -> PlannedNotification? {
        // Same anchor as the server: the due time wins over the scheduled time.
        guard let anchor = item.dueAt ?? item.scheduledAt else { return nil }
        return notification(item, id: Self.identifierPrefix + item.localId, anchor: anchor, lead: lead, now: now)
    }

    private func series(
        _ item: ItemRecord, rrule: String, lead: Int, closed: ClosedOccurrences, now: Date
    ) -> [PlannedNotification] {
        guard let start = item.scheduledAt else { return [] }
        let horizonEnd = now.addingTimeInterval(horizon)
        // The lead time only moves a fire time earlier, so an occurrence that matters lies between
        // now and the horizon plus the lead.
        let upper = horizonEnd.addingTimeInterval(TimeInterval(lead) * 60)
        guard let dates = try? expand(rrule, start, now, upper, timeZone) else { return [] }
        return dates.compactMap { date in
            let day = localTime.day(date)
            if closed.contains(item, day: day) { return nil }
            guard let result = notification(
                item, id: "\(Self.identifierPrefix)\(item.localId):\(localTime.stamp(date))", anchor: date, lead: lead, now: now
            ), result.fireAt <= horizonEnd else { return nil }
            return result
        }
    }

    private func notification(
        _ item: ItemRecord, id: String, anchor: Date, lead: Int, now: Date
    ) -> PlannedNotification? {
        let fireAt = anchor.addingTimeInterval(-TimeInterval(lead) * 60)
        guard fireAt > now else { return nil }
        return PlannedNotification(
            identifier: id, fireAt: fireAt, title: item.title,
            body: body(anchor: anchor, lead: lead, notes: item.notes)
        )
    }

    /// Mirrors `formatLeadTimeBody`: no lead means "now" (or just the notes), otherwise the clock
    /// time and the minutes left, with the notes on a second line.
    private func body(anchor: Date, lead: Int, notes: String?) -> String {
        let trailing = notes.flatMap { $0.isEmpty ? nil : $0 }
        if lead <= 0 { return trailing ?? "Şimdi" }
        let head = "\(localTime.clock(anchor))'de — \(lead) dk kaldı"
        return trailing.map { head + "\n" + $0 } ?? head
    }

    // MARK: Helpers

    /// Deterministic selection: soonest first, ties by identifier, one entry per identifier.
    private static func select(_ planned: [PlannedNotification], limit: Int) -> [PlannedNotification] {
        let sorted = planned.sorted {
            $0.fireAt != $1.fireAt ? $0.fireAt < $1.fireAt : $0.identifier < $1.identifier
        }
        var seen = Set<String>()
        var result: [PlannedNotification] = []
        for notification in sorted where seen.insert(notification.identifier).inserted {
            result.append(notification)
            if result.count == limit { break }
        }
        return result
    }
}
