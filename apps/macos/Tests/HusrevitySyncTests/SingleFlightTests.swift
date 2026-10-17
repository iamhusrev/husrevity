import Foundation
import HusrevityModels
import XCTest
@testable import HusrevityStore
@testable import HusrevitySync

final class SingleFlightTests: SyncTestCase {
    /// Suspends until `count` callers have joined the run in progress (no sleeping, no guessing).
    private func waitForJoins(_ count: Int) async {
        var spins = 0
        while await engine.joinedCalls < count, spins < 1_000_000 {
            await Task.yield()
            spins += 1
        }
    }

    func testTenConcurrentSyncsNeverDoubleSendAnEntry() async throws {
        _ = try store.create(NoteRecord(title: "once"))
        let gate = ManualGate()
        api.setGate(gate)

        let first = Task { await engine.syncNow() }
        await gate.waitForArrivals(1)  // run 1 is on the wire
        let others = (0..<9).map { _ in Task { await engine.syncNow() } }
        await waitForJoins(9)
        gate.open()

        var outcomes = [await first.value]
        for task in others { outcomes.append(await task.value) }

        XCTAssertEqual(outcomes.count, 10)
        XCTAssertTrue(outcomes.allSatisfy { $0.result == .synced })
        XCTAssertEqual(api.calls("createNote").count, 1, "the entry was sent once")
        XCTAssertEqual(api.appliedCount("createNote"), 1)
        XCTAssertEqual(api.calls("sync").count, 2, "one run plus exactly one follow-up")
        XCTAssertEqual(try store.notes().count, 1)
    }

    func testCallersJoinTheRunInProgressAndSeeItsCounts() async throws {
        _ = try store.create(NoteRecord(title: "A"))
        let gate = ManualGate()
        api.setGate(gate)
        let first = Task { await engine.syncNow() }
        await gate.waitForArrivals(1)
        let joiner = Task { await engine.syncNow() }
        await waitForJoins(1)
        gate.open()

        let a = await first.value
        let b = await joiner.value

        XCTAssertEqual(a.pushed, 1)
        XCTAssertEqual(b.pushed, 1)
        XCTAssertEqual(b.result, .synced)
    }

    func testSequentialSyncsEachRunOnce() async throws {
        _ = await engine.syncNow()
        _ = await engine.syncNow()
        XCTAssertEqual(api.calls("sync").count, 2)
    }

    func testAFollowUpIsNotScheduledAfterAnOfflineRun() async throws {
        _ = try store.create(NoteRecord(title: "A"))
        let gate = ManualGate()
        api.setGate(gate)
        api.failNext("createNote", .transport(URLError(.notConnectedToInternet)))
        let first = Task { await engine.syncNow() }
        await gate.waitForArrivals(1)
        let second = Task { await engine.syncNow() }
        await waitForJoins(1)
        gate.open()

        _ = await first.value
        let outcome = await second.value

        XCTAssertEqual(outcome.result, .offline)
        XCTAssertEqual(api.calls("createNote").count, 1, "no immediate retry against a dead network")
    }
}
