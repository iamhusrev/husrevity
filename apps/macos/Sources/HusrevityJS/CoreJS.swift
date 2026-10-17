import Foundation
import JavaScriptCore

/// Everything that can go wrong while talking to the JavaScriptCore bundle.
public enum CoreJSError: Error, Equatable, CustomStringConvertible {
    /// husrevity-core.js was not found; carries every path that was searched.
    case bundleNotFound(searched: [String])
    /// The bundle threw while being evaluated.
    case scriptFailed(String)
    /// The bundle evaluated but did not define `globalThis.HusrevityCore`.
    case missingNamespace
    /// A JS exception, or an error reported by the bundle itself (invalid rule, bad date, ...).
    case executionFailed(String)
    /// The bundle returned something that is not the expected JSON envelope.
    case invalidResult(String)

    public var description: String {
        switch self {
        case .bundleNotFound(let searched):
            return "husrevity-core.js not found; searched: " + searched.joined(separator: ", ")
        case .scriptFailed(let m): return "core script failed to load: \(m)"
        case .missingNamespace: return "core script did not define HusrevityCore"
        case .executionFailed(let m): return "core call failed: \(m)"
        case .invalidResult(let m): return "core returned an unexpected result: \(m)"
        }
    }
}

/// Mirrors the TypeScript `ParsedDraft` of `packages/parser` field for field. Absent keys stay nil.
public struct ParsedDraft: Codable, Equatable, Sendable {
    public var title: String
    /// ISO-8601 UTC instant exactly as the parser emits it (e.g. `2026-10-19T06:00:00.000Z`).
    public var scheduledAt: String?
    public var context: String?
    public var projectRef: String?
    public var priority: String?
    /// Bare RFC 5545 RECUR value such as `FREQ=WEEKLY;BYDAY=MO`.
    public var rrule: String?

    public init(
        title: String, scheduledAt: String? = nil, context: String? = nil,
        projectRef: String? = nil, priority: String? = nil, rrule: String? = nil
    ) {
        self.title = title
        self.scheduledAt = scheduledAt
        self.context = context
        self.projectRef = projectRef
        self.priority = priority
        self.rrule = rrule
    }

    /// `scheduledAt` as a `Date`, nil when unset or unparseable.
    public var scheduledDate: Date? {
        scheduledAt.flatMap { CoreJS.parseISO($0) }
    }
}

/// Runs the very same JS the server uses (`packages/parser` + `rrule` + `luxon`) inside
/// JavaScriptCore so quick-add parsing and recurrence expansion behave identically offline.
///
/// `JSContext` is not thread-safe: every call is serialised behind a lock, so one instance can be
/// shared freely between threads and tasks.
public final class CoreJS: @unchecked Sendable {
    private let lock = NSLock()
    private let context: JSContext
    private let namespace: JSValue
    private var lastException: String?

    /// Where the packaged script lives when it is found through the app/executable layout, nil when
    /// only the `Bundle.module` fallback (what `swift test` uses) can see it. Lets a packaged app
    /// prove it does not depend on the build directory.
    public static var packagedScriptLocation: URL? {
        try? CoreJSResourceLocator.locate(in: CoreJSResourceLocator.defaultCandidates())
    }

    /// Loads the bundled `husrevity-core.js`. Resolution order: `Bundle.main.resourceURL` (signed app
    /// layout), the executable's directory (SwiftPM executable layout), then `Bundle.module`.
    public convenience init() throws {
        let url: URL
        do {
            url = try CoreJSResourceLocator.locate(in: CoreJSResourceLocator.defaultCandidates())
        } catch {
            // Last resort, what `swift test` uses. Bundle.module is only touched here because its
            // generated accessor aborts when it cannot find the bundle.
            guard let moduleURL = Bundle.module.url(forResource: "husrevity-core", withExtension: "js", subdirectory: "Resources")
                ?? Bundle.module.url(forResource: "husrevity-core", withExtension: "js")
            else { throw error }
            url = moduleURL
        }
        guard let script = try? String(contentsOf: url, encoding: .utf8) else {
            throw CoreJSError.bundleNotFound(searched: [url.path])
        }
        try self.init(script: script)
    }

    /// Evaluates an arbitrary bundle; used by tests to exercise the error paths.
    init(script: String) throws {
        guard let context = JSContext() else { throw CoreJSError.scriptFailed("no JSContext") }
        var captured: String?
        context.exceptionHandler = { _, exception in
            captured = exception?.toString() ?? "unknown JS exception"
        }
        context.evaluateScript(script)
        if let captured { throw CoreJSError.scriptFailed(captured) }
        guard let ns = context.objectForKeyedSubscript("HusrevityCore"), ns.isObject else {
            throw CoreJSError.missingNamespace
        }
        self.context = context
        self.namespace = ns
        context.exceptionHandler = { [weak self] _, exception in
            self?.lastException = exception?.toString() ?? "unknown JS exception"
        }
    }

    /// Parses Turkish quick-add text. `now` pins the clock the parser resolves "yarın" etc. against.
    /// The parser itself works in Europe/Istanbul regardless of `timeZone` (as on the server).
    public func parseQuickAdd(_ text: String, now: Date, timeZone: TimeZone) throws -> ParsedDraft {
        try locked {
            _ = try call("parseQuickAdd", [text, Self.formatISO(now), timeZone.identifier])
            // The parser is async; JavaScriptCore drains its microtasks when the call above returns.
            let taken = try call("takeResult", [])
            guard !taken.isNull, !taken.isUndefined, let raw = taken.toString() else {
                throw CoreJSError.invalidResult("parser produced no result")
            }
            return try Self.decodeEnvelope(raw, as: ParsedDraft.self)
        }
    }

    /// Occurrences of `rrule` anchored at `start`, within `[from, to]` (both inclusive), with the
    /// same semantics as the server's `ItemRecurrenceService.expand`: calendar maths on local dates
    /// in `timeZone`, the anchor's wall-clock time kept across DST, at most 1000 results and 100 000
    /// scanned iterations.
    public func expandOccurrences(
        rrule: String, start: Date, from: Date, to: Date, timeZone: TimeZone
    ) throws -> [Date] {
        struct Occurrence: Decodable { let occursAt: String }
        return try locked {
            let value = try call(
                "expandOccurrences",
                [rrule, Self.formatISO(start), Self.formatISO(from), Self.formatISO(to), timeZone.identifier])
            guard let raw = value.toString() else { throw CoreJSError.invalidResult("no string") }
            return try Self.decodeEnvelope(raw, as: [Occurrence].self).map { occurrence in
                guard let date = Self.parseISO(occurrence.occursAt) else {
                    throw CoreJSError.invalidResult("bad date \(occurrence.occursAt)")
                }
                return date
            }
        }
    }

    // MARK: - Internals

    private func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }

    private func call(_ method: String, _ args: [Any]) throws -> JSValue {
        lastException = nil
        let result = namespace.invokeMethod(method, withArguments: args)
        if let message = lastException { throw CoreJSError.executionFailed(message) }
        guard let result else { throw CoreJSError.executionFailed("\(method) returned nothing") }
        return result
    }

    private struct Envelope<V: Decodable>: Decodable {
        let ok: V?
        let error: String?
    }

    private static func decodeEnvelope<T: Decodable>(_ raw: String, as: T.Type) throws -> T {
        guard let data = raw.data(using: .utf8),
            let envelope = try? JSONDecoder().decode(Envelope<T>.self, from: data)
        else { throw CoreJSError.invalidResult(String(raw.prefix(200))) }
        if let error = envelope.error { throw CoreJSError.executionFailed(error) }
        guard let ok = envelope.ok else { throw CoreJSError.invalidResult("empty envelope") }
        return ok
    }

    private static func formatISO(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }

    static func parseISO(_ string: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: string) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: string)
    }
}
