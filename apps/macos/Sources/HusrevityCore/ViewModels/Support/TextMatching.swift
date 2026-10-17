import Foundation

enum TextMatching {
    private static let posix = Locale(identifier: "en_US_POSIX")

    /// Folds Turkish dotted/dotless i onto plain i first. The tr_TR locale itself is avoided on
    /// purpose: there "I" lowercases to a dotless "ı", so "NAKLIYA" would not match "nakliya".
    private static func normalise(_ text: String) -> String {
        text.replacingOccurrences(of: "ı", with: "i").replacingOccurrences(of: "İ", with: "I")
    }

    /// Case- and diacritic-insensitive equality ("ÇALIŞMA" == "çalışma").
    static func same(_ a: String, _ b: String) -> Bool {
        normalise(a).compare(normalise(b), options: [.caseInsensitive, .diacriticInsensitive], locale: posix)
            == .orderedSame
    }

    static func contains(_ haystack: String, _ needle: String) -> Bool {
        normalise(haystack).range(
            of: normalise(needle), options: [.caseInsensitive, .diacriticInsensitive], locale: posix) != nil
    }
}
