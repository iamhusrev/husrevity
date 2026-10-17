import Foundation

/// The clock, time zone and calendar rules every view model shares. Injected so tests can pin
/// "now" and run the same logic around midnight or a DST change.
///
/// Weeks start on Monday and all formatting is Turkish (`tr_TR`). Day keys (`YYYY-MM-DD`) are the
/// local calendar date in `timeZone`, the same notion the server uses for `occursOn`.
public struct DateContext {
    public var now: () -> Date
    public var timeZone: TimeZone

    public static let istanbul = TimeZone(identifier: "Europe/Istanbul") ?? .current

    public init(now: @escaping () -> Date = { Date() }, timeZone: TimeZone = DateContext.istanbul) {
        self.now = now
        self.timeZone = timeZone
    }

    public static let locale = Locale(identifier: "tr_TR")

    public var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = Self.locale
        calendar.firstWeekday = 2  // Monday
        calendar.minimumDaysInFirstWeek = 4
        return calendar
    }

    // MARK: Days

    public var today: Date { startOfDay(now()) }

    public func startOfDay(_ date: Date) -> Date { calendar.startOfDay(for: date) }

    /// `[start, end)` of the local day containing `date`; `end` is the next local midnight.
    public func dayBounds(containing date: Date) -> (start: Date, end: Date) {
        let start = startOfDay(date)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
        return (start, end)
    }

    public func addingDays(_ days: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: days, to: date) ?? date.addingTimeInterval(Double(days) * 86_400)
    }

    public func startOfWeek(containing date: Date) -> Date {
        let day = startOfDay(date)
        let weekday = calendar.component(.weekday, from: day)  // 1 = Sunday
        let sinceMonday = (weekday + 5) % 7
        return addingDays(-sinceMonday, to: day)
    }

    public func startOfMonth(containing date: Date) -> Date {
        let parts = calendar.dateComponents([.year, .month], from: date)
        return calendar.date(from: parts) ?? startOfDay(date)
    }

    public func addingMonths(_ months: Int, to date: Date) -> Date {
        calendar.date(byAdding: .month, value: months, to: startOfMonth(containing: date)) ?? date
    }

    public func isSameDay(_ a: Date, _ b: Date) -> Bool { calendar.isDate(a, inSameDayAs: b) }

    // MARK: Day keys

    public func dayKey(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Local midnight of a `YYYY-MM-DD` key; nil when it is not a real calendar date.
    public func date(fromDayKey key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, key.count == 10 else { return nil }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        guard let date = calendar.date(from: components) else { return nil }
        let back = calendar.dateComponents([.year, .month, .day], from: date)
        guard back.year == parts[0], back.month == parts[1], back.day == parts[2] else { return nil }
        return date
    }

    // MARK: Labels (tr_TR)

    public func timeLabel(_ date: Date) -> String { format(date, "HH:mm") }
    public func dayLabel(_ date: Date) -> String { format(date, "d MMMM EEEE") }
    public func shortDayLabel(_ date: Date) -> String { format(date, "d MMM") }
    public func monthLabel(_ date: Date) -> String { format(date, "LLLL yyyy") }
    public func shortWeekday(_ date: Date) -> String { format(date, "EEE") }
    public func dayNumber(_ date: Date) -> Int { calendar.component(.day, from: date) }

    public func dateTimeLabel(_ date: Date) -> String { format(date, "d MMM HH:mm") }
    /// "19 Eki Pzt 09:00": the weekday helps to check what "cuma" or "yarın" resolved to.
    public func quickTimeLabel(_ date: Date) -> String { format(date, "d MMM EEE HH:mm") }

    /// "5 dk önce" style label relative to `now`.
    public func relativeLabel(_ date: Date) -> String {
        let seconds = Int(now().timeIntervalSince(date))
        if seconds < 60 { return L10n.Sync.justNow }
        if seconds < 3600 { return L10n.Sync.minutesAgo(seconds / 60) }
        if seconds < 86_400 { return L10n.Sync.hoursAgo(seconds / 3600) }
        return dateTimeLabel(date)
    }

    private func format(_ date: Date, _ pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Self.locale
        formatter.timeZone = timeZone
        formatter.calendar = calendar
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }
}

extension DateContext {
    /// Parses an ISO-8601 instant as the API emits it (with or without fractional seconds).
    public static func parseISO(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }
}

extension DateContext {
    /// "14:05" for an entry on today, "16 Eki 09:30" for another day, nil for a date-only entry today.
    public func entryTimeLabel(_ entry: ScheduleEntry) -> String? {
        let sameDay = isSameDay(entry.time, now())
        switch (entry.hasClockTime, sameDay) {
        case (true, true): return timeLabel(entry.time)
        case (true, false): return dateTimeLabel(entry.time)
        case (false, true): return nil
        case (false, false): return shortDayLabel(entry.time)
        }
    }
}
