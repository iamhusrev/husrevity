import Foundation
import HusrevityJS

/// Owns the long-running observation tasks of a view model and cancels them when the view model
/// goes away (the bag is deallocated together with its owner).
///
/// Tasks are stored per key so a view model can restart one observation (a changed filter) without
/// touching the others; replacing a key cancels the previous task, which terminates its stream.
public final class ObservationBag: @unchecked Sendable {
    private let lock = NSLock()
    private var tasks: [String: Task<Void, Never>] = [:]

    public init() {}

    deinit { cancelAll() }

    public func has(_ key: String) -> Bool { lock.withLock { tasks[key] != nil } }

    public func set(_ key: String, _ task: Task<Void, Never>) {
        let previous: Task<Void, Never>? = lock.withLock {
            let old = tasks[key]
            tasks[key] = task
            return old
        }
        previous?.cancel()
    }

    public func cancel(_ key: String) {
        let task: Task<Void, Never>? = lock.withLock { tasks.removeValue(forKey: key) }
        task?.cancel()
    }

    public func cancelAll() {
        let all: [Task<Void, Never>] = lock.withLock {
            let values = Array(tasks.values)
            tasks = [:]
            return values
        }
        all.forEach { $0.cancel() }
    }

    /// Feeds every element of `sequence` to `apply` on the main actor until cancelled.
    /// `apply` must capture its owner weakly.
    @MainActor
    public func observe<S: AsyncSequence>(
        _ key: String, _ sequence: S, apply: @escaping @MainActor (S.Element) -> Void
    ) where S: Sendable, S.Element: Sendable {
        set(
            key,
            Task { @MainActor in
                do {
                    for try await element in sequence {
                        if Task.isCancelled { break }
                        apply(element)
                    }
                } catch {
                    // The stream ended abnormally; the view keeps its last value.
                }
            })
    }
}

/// What the view models need from the JavaScript core. `CoreJS` conforms; tests may fake them.
public protocol QuickAddParsing {
    func parseQuickAdd(_ text: String, now: Date, timeZone: TimeZone) throws -> ParsedDraft
}

public protocol RecurrenceExpanding {
    func expandOccurrences(rrule: String, start: Date, from: Date, to: Date, timeZone: TimeZone) throws -> [Date]
}

extension CoreJS: QuickAddParsing, RecurrenceExpanding {}

/// Hook the view models call after every local write so the sync coordinator can debounce a push.
public typealias LocalChangeNotifier = @MainActor () -> Void
