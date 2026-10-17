import XCTest
@testable import HusrevityCore

@MainActor
final class ObservationBagTests: XCTestCase {
    func testDeallocatingTheBagTerminatesTheStream() async {
        let terminated = expectation(description: "stream terminated")
        let (stream, continuation) = AsyncStream<Int>.makeStream()
        continuation.onTermination = { _ in terminated.fulfill() }
        var bag: ObservationBag? = ObservationBag()
        bag!.observe("numbers", stream) { _ in }
        continuation.yield(1)
        bag = nil
        await fulfillment(of: [terminated], timeout: 5)
    }

    func testReplacingAKeyCancelsThePreviousObservation() async {
        let firstTerminated = expectation(description: "first terminated")
        let (first, firstContinuation) = AsyncStream<Int>.makeStream()
        firstContinuation.onTermination = { _ in firstTerminated.fulfill() }
        let (second, _) = AsyncStream<Int>.makeStream()
        let bag = ObservationBag()
        bag.observe("k", first) { _ in }
        bag.observe("k", second) { _ in }
        await fulfillment(of: [firstTerminated], timeout: 5)
    }

    func testElementsAreDeliveredOnTheMainActorInOrder() async {
        let (stream, continuation) = AsyncStream<Int>.makeStream()
        let bag = ObservationBag()
        var seen: [Int] = []
        let done = expectation(description: "three values")
        bag.observe("k", stream) { value in
            seen.append(value)
            if seen.count == 3 { done.fulfill() }
        }
        [1, 2, 3].forEach { continuation.yield($0) }
        await fulfillment(of: [done], timeout: 5)
        XCTAssertEqual(seen, [1, 2, 3])
        continuation.finish()
    }

    func testCancelByKeyOnlyAffectsThatKey() async {
        let terminated = expectation(description: "a terminated")
        let (a, aContinuation) = AsyncStream<Int>.makeStream()
        aContinuation.onTermination = { _ in terminated.fulfill() }
        let (b, bContinuation) = AsyncStream<Int>.makeStream()
        var bTerminated = false
        bContinuation.onTermination = { _ in bTerminated = true }
        let bag = ObservationBag()
        bag.observe("a", a) { _ in }
        bag.observe("b", b) { _ in }
        bag.cancel("a")
        await fulfillment(of: [terminated], timeout: 5)
        XCTAssertFalse(bTerminated)
        XCTAssertTrue(bag.has("b"))
        XCTAssertFalse(bag.has("a"))
    }
}
