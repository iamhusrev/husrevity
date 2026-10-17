import Foundation
import HusrevityStore

public enum ScheduleStatus: String, Equatable, Sendable {
    case open, done, skipped
}

/// One thing on a day: a one-off item, or one dated occurrence of a recurring item.
public struct ScheduleEntry: Identifiable, Equatable, Sendable {
    public var id: String
    public var itemLocalId: String
    public var title: String
    public var kind: String
    public var time: Date
    /// False when the item only carries a date (local midnight), so views can leave the clock out.
    public var hasClockTime: Bool
    /// Local `YYYY-MM-DD` of the occurrence; nil for a one-off item.
    public var occursOn: String?
    public var status: ScheduleStatus
    public var completedAt: Date?
    public var context: String?
    public var durationMin: Int?
    public var projectId: String?

    public var isRecurring: Bool { occursOn != nil }
    /// Only whole items can be reopened offline; there is no local write for an occurrence.
    public var canReopen: Bool { status != .open && occursOn == nil }
}

/// Turns stored items + occurrence overrides into dated entries, mirroring the server:
/// recurring items are expanded per date (overrides are sparse: no row means "open"), a
/// `blockId` child without its own rule rides along with its recurring parent, tasks sit at
/// `dueAt ?? scheduledAt` and events at `scheduledAt ?? dueAt`.
public struct ScheduleBuilder {
    public var context: DateContext
    public var expander: RecurrenceExpanding

    public init(context: DateContext, expander: RecurrenceExpanding) {
        self.context = context
        self.expander = expander
    }

    /// The instant an item is shown at, or nil when it has no date.
    public static func effectiveTime(_ item: ItemRecord) -> Date? {
        item.kind == "event" ? (item.scheduledAt ?? item.dueAt) : (item.dueAt ?? item.scheduledAt)
    }

    /// Entries with `from <= time < to`, sorted by time then title. Cancelled items are skipped.
    public func entries(
        items: [ItemRecord], occurrences: [ItemOccurrenceRecord], from: Date, to: Date
    ) -> [ScheduleEntry] {
        let live = items.filter { $0.status != "cancelled" }
        let overrides = Self.overrideIndex(occurrences)
        let recurring = live.filter { $0.rrule != nil && $0.scheduledAt != nil }
        var parentsByRef: [String: ItemRecord] = [:]
        for parent in recurring {
            for ref in Self.references(parent) { parentsByRef[ref] = parent }
        }

        var result: [ScheduleEntry] = []
        var childrenByParent: [String: [ItemRecord]] = [:]

        for item in live where item.rrule == nil {
            if let blockId = item.blockId, let parent = parentsByRef[blockId] {
                childrenByParent[parent.localId, default: []].append(item)
                continue
            }
            guard let time = Self.effectiveTime(item), time >= from, time < to else { continue }
            result.append(
                entry(
                    item, time: time, occursOn: nil, status: Self.status(item.status),
                    completedAt: item.completedAt))
        }

        let lastInstant = to.addingTimeInterval(-0.001)
        for parent in recurring {
            guard let rule = parent.rrule, let start = parent.scheduledAt,
                let dates = try? expander.expandOccurrences(
                    rrule: rule, start: start, from: from, to: lastInstant, timeZone: context.timeZone)
            else { continue }
            let children = childrenByParent[parent.localId] ?? []
            for date in dates where date >= from && date < to {
                let day = context.dayKey(date)
                result.append(entry(parent, date: date, day: day, overrides: overrides))
                for child in children { result.append(entry(child, date: date, day: day, overrides: overrides)) }
            }
        }

        return result.sorted {
            $0.time != $1.time ? $0.time < $1.time : $0.title.localizedCompare($1.title) == .orderedAscending
        }
    }

    // MARK: Internals

    private func entry(
        _ item: ItemRecord, date: Date, day: String, overrides: [String: ItemOccurrenceRecord]
    ) -> ScheduleEntry {
        let override = Self.references(item).lazy.compactMap { overrides["\($0)|\(day)"] }.first
        return entry(
            item, time: date, occursOn: day, status: override.map { Self.status($0.status) } ?? .open,
            completedAt: override?.completedAt)
    }

    private func entry(
        _ item: ItemRecord, time: Date, occursOn: String?, status: ScheduleStatus, completedAt: Date?
    ) -> ScheduleEntry {
        ScheduleEntry(
            id: occursOn.map { "occ:\(item.localId):\($0)" } ?? "item:\(item.localId)",
            itemLocalId: item.localId, title: item.title, kind: item.kind, time: time,
            hasClockTime: time != context.startOfDay(time), occursOn: occursOn, status: status,
            completedAt: completedAt, context: item.context, durationMin: item.durationMin,
            projectId: item.projectId)
    }

    static func status(_ raw: String) -> ScheduleStatus {
        switch raw {
        case "done": return .done
        case "skipped": return .skipped
        default: return .open
        }
    }

    /// Every id other rows may use to point at `item`: server id and the `local:` placeholder.
    static func references(_ item: ItemRecord) -> [String] {
        var refs = [LocalReference.make(localId: item.localId)]
        if let serverId = item.serverId { refs.insert(serverId, at: 0) }
        return refs
    }

    static func overrideIndex(_ occurrences: [ItemOccurrenceRecord]) -> [String: ItemOccurrenceRecord] {
        var index: [String: ItemOccurrenceRecord] = [:]
        for occurrence in occurrences { index["\(occurrence.itemId)|\(occurrence.occursOn)"] = occurrence }
        return index
    }
}
