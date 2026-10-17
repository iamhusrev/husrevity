import Foundation
import HusrevityStore
import XCTest
@testable import HusrevityPlatform

let istanbul = TimeZone(identifier: "Europe/Istanbul")!
let newYork = TimeZone(identifier: "America/New_York")!

/// `"2026-03-10 09:00"` interpreted in `zone`.
func at(_ text: String, _ zone: TimeZone = istanbul) -> Date {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = zone
    formatter.dateFormat = "yyyy-MM-dd HH:mm"
    return formatter.date(from: text)!
}

func item(
    _ id: String, title: String = "Task", scheduledAt: Date? = nil, dueAt: Date? = nil,
    notify: Int? = 15, rrule: String? = nil, status: String = "open", notes: String? = nil,
    serverId: String? = nil
) -> ItemRecord {
    ItemRecord(
        localId: id, serverId: serverId, title: title, notes: notes, scheduledAt: scheduledAt,
        dueAt: dueAt, notifyMinutesBefore: notify, rrule: rrule, status: status
    )
}

func occurrence(_ itemRef: String, _ date: String, status: String) -> ItemOccurrenceRecord {
    ItemOccurrenceRecord(itemId: itemRef, occursOn: date, status: status)
}

/// A recurrence expander that understands only `FREQ=DAILY` and `FREQ=WEEKLY`. Like the real one it
/// does calendar maths on local dates in the zone, so the anchor's wall-clock time survives DST.
func makeExpander(record: ExpanderRecorder? = nil) -> RecurrenceExpander {
    return { rrule, start, from, to, zone in
        record?.calls.append(ExpanderCall(rrule: rrule, start: start, from: from, to: to))
        if rrule.contains("BOOM") { throw NSError(domain: "fake", code: 1) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let step = rrule.contains("WEEKLY") ? 7 : 1
        var result: [Date] = []
        var index = 0
        while let date = calendar.date(byAdding: .day, value: index * step, to: start), date <= to {
            if date >= from { result.append(date) }
            index += 1
            if index > 5000 { break }
        }
        return result
    }
}

struct ExpanderCall { var rrule: String; var start: Date; var from: Date; var to: Date }

final class ExpanderRecorder: @unchecked Sendable {
    var calls: [ExpanderCall] = []
}
