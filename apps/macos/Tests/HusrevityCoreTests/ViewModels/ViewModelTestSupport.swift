import Combine
import Foundation
import GRDB
import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

enum ViewModelTestSupport {
    static func date(_ s: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s)!
    }
}

/// A clock tests can move.
final class MutableClock: @unchecked Sendable {
    var now: Date
    var timeZone: TimeZone
    init(now: Date, timeZone: TimeZone) {
        self.now = now
        self.timeZone = timeZone
    }
    var context: DateContext { DateContext(now: { [self] in now }, timeZone: timeZone) }
}

/// Base class: a real temp-file store, a pinned clock (Europe/Istanbul) and the real CoreJS bundle.
@MainActor
class ViewModelTestCase: XCTestCase {
    var directory: URL!
    var store: LocalStore!
    var clock: MutableClock!
    var core: CoreJS!
    var changeNotifications = 0
    var ctx: DateContext { clock.context }

    /// 2026-10-18 (Sunday) 10:00 in Istanbul.
    static let defaultNow = ViewModelTestSupport.date("2026-10-18T10:00:00+03:00")

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("husrevity-vm-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let clock = MutableClock(now: Self.defaultNow, timeZone: TimeZone(identifier: "Europe/Istanbul")!)
        self.clock = clock
        store = try LocalStore(path: directory.appendingPathComponent("store.sqlite").path, now: { clock.now })
        core = try CoreJS()
        changeNotifications = 0
    }

    override func tearDownWithError() throws {
        store = nil
        try? FileManager.default.removeItem(at: directory)
    }

    var notify: @MainActor () -> Void { { [unowned self] in self.changeNotifications += 1 } }

    func d(_ s: String) -> Date { ViewModelTestSupport.date(s) }

    @discardableResult
    func makeItem(
        _ title: String, kind: String = "task", scheduledAt: String? = nil, dueAt: String? = nil,
        rrule: String? = nil, status: String = "open", completedAt: String? = nil,
        context: String? = nil, blockId: String? = nil, projectId: String? = nil,
        goalId: String? = nil, durationMin: Int? = nil
    ) throws -> ItemRecord {
        try store.create(
            ItemRecord(
                kind: kind, title: title, context: context, projectId: projectId, goalId: goalId,
                blockId: blockId, scheduledAt: scheduledAt.map(d), durationMin: durationMin,
                dueAt: dueAt.map(d), rrule: rrule, status: status, completedAt: completedAt.map(d)
            ))
    }

    /// Runs raw SQL against the temp store (synchronous, so it works inside async tests).
    func exec(_ sql: String, _ arguments: StatementArguments = []) throws {
        try store.dbQueue.write { try $0.execute(sql: sql, arguments: arguments) }
    }

    /// Writes an occurrence override row straight into the store (the app only creates them via
    /// `completeItem`; "skipped" arrives from the server).
    func putOccurrence(_ item: ItemRecord, on day: String, status: String, completedAt: String? = nil) throws {
        let record = ItemOccurrenceRecord(
            itemId: item.reference, occursOn: day, status: status, completedAt: completedAt.map(d))
        try store.dbQueue.write { try record.save($0) }
    }

    /// Waits (no sleeping) until `publisher` emits a value satisfying `predicate`.
    func waitFor<P: Publisher>(
        _ publisher: P, timeout: TimeInterval = 10,
        _ predicate: @escaping (P.Output) -> Bool
    ) async where P.Failure == Never {
        let done = expectation(description: "published value matches")
        done.assertForOverFulfill = false
        let cancellable = publisher.sink { if predicate($0) { done.fulfill() } }
        await fulfillment(of: [done], timeout: timeout)
        cancellable.cancel()
    }
}
