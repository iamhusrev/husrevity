import Foundation
import HusrevityStore

/// Formats instants as local calendar dates (`yyyy-MM-dd`) and clock times (`HH:mm`) in one zone,
/// independent of the user's locale and calendar settings.
struct LocalTimeFormat: Sendable {
    let timeZone: TimeZone

    func day(_ date: Date) -> String { format(date, "yyyy-MM-dd") }
    func clock(_ date: Date) -> String { format(date, "HH:mm") }
    /// Local date and time plus the UTC offset (`2026-03-10T09:00+0300`). Unique per instant, even
    /// for the repeated hour when clocks go back, and stable for the same instant across replans.
    func stamp(_ date: Date) -> String { format(date, "yyyy-MM-dd'T'HH:mmxx") }

    var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    private func format(_ date: Date, _ pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }
}

/// Occurrences that are finished (done or skipped), looked up by item and local date. An
/// occurrence points at its item with a server id or a `local:` placeholder, so both are checked.
struct ClosedOccurrences: Sendable {
    private let keys: Set<String>

    init(_ occurrences: [ItemOccurrenceRecord]) {
        keys = Set(
            occurrences.filter { $0.status == "done" || $0.status == "skipped" }
                .map { Self.key($0.itemId, $0.occursOn) })
    }

    func contains(_ item: ItemRecord, day: String) -> Bool {
        keys.contains(Self.key(item.reference, day))
            || keys.contains(Self.key(LocalReference.make(localId: item.localId), day))
    }

    private static func key(_ itemReference: String, _ day: String) -> String { itemReference + "|" + day }
}
