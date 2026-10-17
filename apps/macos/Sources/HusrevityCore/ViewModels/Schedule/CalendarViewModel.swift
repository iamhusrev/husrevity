import Combine
import Foundation
import HusrevityStore

public enum CalendarMode: String, Equatable, Sendable, CaseIterable {
    case week, month
}

public struct CalendarDay: Identifiable, Equatable, Sendable {
    public var dayKey: String
    public var date: Date
    public var dayNumber: Int
    public var weekdayLabel: String
    public var isToday: Bool
    /// False for the leading/trailing days a month grid shows to complete its weeks.
    public var isInDisplayedMonth: Bool
    public var entries: [ScheduleEntry]
    public var id: String { dayKey }
}

/// "Takvim": a Monday-first week or month grid of items and recurring occurrences.
@MainActor
public final class CalendarViewModel: ObservableObject {
    @Published public private(set) var mode: CalendarMode = .week
    @Published public private(set) var days: [CalendarDay] = []
    @Published public private(set) var title = ""
    @Published public private(set) var isLoaded = false
    @Published public private(set) var errorMessage: String?
    @Published public private(set) var anchor: Date
    @Published public private(set) var selectedDayKey: String?

    private let store: LocalStore
    private let expander: RecurrenceExpanding
    private let context: DateContext
    private let notifyLocalChange: LocalChangeNotifier
    private let bag = ObservationBag()

    private var items: [ItemRecord] = []
    private var occurrences: [ItemOccurrenceRecord] = []
    private var itemsLoaded = false
    private var observedRange: String?

    public init(
        store: LocalStore, expander: RecurrenceExpanding, context: DateContext = DateContext(),
        notifyLocalChange: @escaping LocalChangeNotifier
    ) {
        self.store = store
        self.expander = expander
        self.context = context
        self.notifyLocalChange = notifyLocalChange
        self.anchor = context.today
        rebuild()
    }

    /// The month grid as rows of seven days (also valid for the week grid: a single row).
    public var weeks: [[CalendarDay]] {
        stride(from: 0, to: days.count, by: 7).map { Array(days[$0..<min($0 + 7, days.count)]) }
    }

    /// The explicitly selected day, else today when visible, else the first day of the period.
    public var selectedDay: CalendarDay? {
        if let key = selectedDayKey, let day = days.first(where: { $0.dayKey == key }) { return day }
        return days.first(where: \.isToday) ?? days.first(where: \.isInDisplayedMonth) ?? days.first
    }

    // MARK: Lifecycle

    public func start() {
        guard !bag.has("items") else { return }
        bag.observe("items", store.observeItems()) { [weak self] items in
            guard let self else { return }
            self.items = items
            self.itemsLoaded = true
            self.rebuild()
        }
        observeOccurrences()
    }

    // MARK: Navigation

    public func setMode(_ newMode: CalendarMode) {
        guard newMode != mode else { return }
        mode = newMode
        selectedDayKey = nil
        navigated()
    }

    public func next() { move(by: 1) }
    public func previous() { move(by: -1) }

    public func goToday() {
        anchor = context.today
        selectedDayKey = nil
        navigated()
    }

    public func select(dayKey: String) { selectedDayKey = dayKey }

    public func timeLabel(_ entry: ScheduleEntry) -> String? {
        entry.hasClockTime ? context.timeLabel(entry.time) : nil
    }

    // MARK: Actions

    public func complete(_ entry: ScheduleEntry) {
        do {
            try store.completeItem(localId: entry.itemLocalId, occursOn: entry.occursOn)
            errorMessage = nil
            notifyLocalChange()
        } catch {
            errorMessage = L10n.Common.saveFailed(TodayViewModel.describe(error))
        }
    }

    public func dismissError() { errorMessage = nil }

    // MARK: Internals

    private func move(by step: Int) {
        switch mode {
        case .week: anchor = context.addingDays(7 * step, to: anchor)
        case .month: anchor = context.addingMonths(step, to: anchor)
        }
        selectedDayKey = nil
        navigated()
    }

    private func navigated() {
        observeOccurrences()
        rebuild()
    }

    /// `[first day, day after the last day)` of the visible grid.
    private var range: (start: Date, end: Date) {
        switch mode {
        case .week:
            let start = context.startOfWeek(containing: anchor)
            return (start, context.addingDays(7, to: start))
        case .month:
            let first = context.startOfMonth(containing: anchor)
            let start = context.startOfWeek(containing: first)
            let nextMonth = context.addingMonths(1, to: first)
            let lastDay = context.addingDays(-1, to: nextMonth)
            let end = context.addingDays(7, to: context.startOfWeek(containing: lastDay))
            return (start, end)
        }
    }

    private func observeOccurrences() {
        let r = range
        let from = context.dayKey(r.start)
        let to = context.dayKey(context.addingDays(-1, to: r.end))
        let key = "\(from)|\(to)"
        guard key != observedRange else { return }
        observedRange = key
        bag.observe("occurrences", store.observeOccurrences(from: from, to: to)) { [weak self] rows in
            self?.occurrences = rows
            self?.rebuild()
        }
    }

    private func rebuild() {
        let r = range
        title = makeTitle(r)
        guard itemsLoaded else {
            days = skeleton(r, entries: [:])
            return
        }
        let builder = ScheduleBuilder(context: context, expander: expander)
        let entries = builder.entries(items: items, occurrences: occurrences, from: r.start, to: r.end)
        days = skeleton(r, entries: Dictionary(grouping: entries) { context.dayKey($0.time) })
        isLoaded = true
    }

    private func skeleton(_ r: (start: Date, end: Date), entries: [String: [ScheduleEntry]]) -> [CalendarDay] {
        let todayKey = context.dayKey(context.now())
        let monthKey = context.dayKey(context.startOfMonth(containing: anchor)).prefix(7)
        var result: [CalendarDay] = []
        var cursor = r.start
        while cursor < r.end {
            let key = context.dayKey(cursor)
            result.append(
                CalendarDay(
                    dayKey: key, date: cursor, dayNumber: context.dayNumber(cursor),
                    weekdayLabel: context.shortWeekday(cursor), isToday: key == todayKey,
                    isInDisplayedMonth: mode == .week || key.prefix(7) == monthKey, entries: entries[key] ?? []))
            cursor = context.addingDays(1, to: cursor)
        }
        return result
    }

    private func makeTitle(_ r: (start: Date, end: Date)) -> String {
        switch mode {
        case .month:
            return context.monthLabel(anchor).capitalizedFirst(locale: DateContext.locale)
        case .week:
            let last = context.addingDays(-1, to: r.end)
            let sameMonth = context.monthLabel(r.start) == context.monthLabel(last)
            if sameMonth {
                return "\(context.dayNumber(r.start)) – \(context.dayNumber(last)) \(context.monthLabel(last))"
            }
            let sameYear = context.calendar.component(.year, from: r.start) == context.calendar.component(.year, from: last)
            if sameYear {
                let yearSuffix = context.calendar.component(.year, from: last)
                return "\(context.shortDayLabel(r.start)) – \(context.shortDayLabel(last)) \(yearSuffix)"
            }
            return "\(context.shortDayLabel(r.start)) \(context.calendar.component(.year, from: r.start)) – "
                + "\(context.shortDayLabel(last)) \(context.calendar.component(.year, from: last))"
        }
    }
}

extension String {
    /// Capitalises the first letter using `locale` ("ekim" -> "Ekim"; "ılık" -> "Ilık").
    fileprivate func capitalizedFirst(locale: Locale) -> String {
        guard let first else { return self }
        return String(first).uppercased(with: locale) + dropFirst()
    }
}
