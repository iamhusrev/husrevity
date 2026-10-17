import XCTest
@testable import HusrevityPlatform

final class AuthorizationGateTests: XCTestCase {
    actor Counter {
        var count = 0
        func hit() -> Int { count += 1; return count }
    }

    func testGrantedAnswerIsCachedSoThePromptHappensOnce() async {
        let gate = AuthorizationGate()
        let counter = Counter()
        let request: @Sendable () async -> Bool = { _ = await counter.hit(); return true }
        let first = await gate.ensure(request)
        let second = await gate.ensure(request)
        let hits = await counter.count
        XCTAssertTrue(first)
        XCTAssertTrue(second)
        XCTAssertEqual(hits, 1)
    }

    func testConcurrentCallersShareOneRequest() async {
        let gate = AuthorizationGate()
        let counter = Counter()
        let request: @Sendable () async -> Bool = {
            _ = await counter.hit()
            await Task.yield()
            return true
        }
        async let a = gate.ensure(request)
        async let b = gate.ensure(request)
        async let c = gate.ensure(request)
        let results = await [a, b, c]
        let hits = await counter.count
        XCTAssertEqual(results, [true, true, true])
        XCTAssertEqual(hits, 1)
    }

    func testDeniedIsAskedAgainBecauseTheUserMayGrantItInSettingsLater() async {
        let gate = AuthorizationGate()
        let counter = Counter()
        let request: @Sendable () async -> Bool = { await counter.hit() >= 2 }
        let first = await gate.ensure(request)
        let second = await gate.ensure(request)
        let third = await gate.ensure(request)
        XCTAssertFalse(first)
        XCTAssertTrue(second)
        XCTAssertTrue(third)
        let hits = await counter.count
        XCTAssertEqual(hits, 2)
    }
}
