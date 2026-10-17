import Foundation

/// Turkish description of a bare RFC 5545 rule for the common shapes the parser emits.
public enum RecurrenceDescriber {
    private static let weekdayNames: [String: String] = [
        "MO": "Pzt", "TU": "Sal", "WE": "Çar", "TH": "Per", "FR": "Cum", "SA": "Cmt", "SU": "Paz",
    ]
    private static let weekdayOrder = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]

    public static func describe(_ rrule: String) -> String {
        var parts: [String: String] = [:]
        let body = rrule.hasPrefix("RRULE:") ? String(rrule.dropFirst(6)) : rrule
        for pair in body.split(separator: ";") {
            let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
            if kv.count == 2 { parts[kv[0].uppercased()] = kv[1] }
        }
        let interval = parts["INTERVAL"].flatMap(Int.init) ?? 1
        func every(_ single: String, _ unit: String) -> String {
            interval > 1 ? L10n.QuickAdd.everyN(interval, unit) : single
        }
        switch parts["FREQ"]?.uppercased() {
        case "DAILY":
            return every(L10n.QuickAdd.everyDay, L10n.QuickAdd.unit_day)
        case "WEEKLY":
            let days = (parts["BYDAY"] ?? "").split(separator: ",").map { String($0).uppercased() }
            if days.isEmpty { return every(L10n.QuickAdd.everyWeek, L10n.QuickAdd.unit_week) }
            if Set(days) == Set(["MO", "TU", "WE", "TH", "FR"]) && interval == 1 {
                return L10n.QuickAdd.everyWeekday
            }
            let names = weekdayOrder.filter(days.contains).compactMap { weekdayNames[$0] }
            let prefix = interval > 1 ? L10n.QuickAdd.everyN(interval, L10n.QuickAdd.unit_week) : L10n.QuickAdd.everyWeek
            return names.isEmpty ? prefix : "\(prefix) \(names.joined(separator: ", "))"
        case "MONTHLY":
            return every(L10n.QuickAdd.everyMonth, L10n.QuickAdd.unit_month)
        case "YEARLY":
            return every(L10n.QuickAdd.everyYear, L10n.QuickAdd.unit_year)
        default:
            return L10n.QuickAdd.customRule
        }
    }
}
