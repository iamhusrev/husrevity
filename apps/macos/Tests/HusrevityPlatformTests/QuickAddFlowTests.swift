import XCTest
@testable import HusrevityPlatform

final class QuickAddFlowTests: XCTestCase {
    func testStartsHidden() {
        XCTAssertEqual(QuickAddFlow().phase, .hidden)
    }

    func testShowOpensTheFieldAndKeepsWhatWasTyped() {
        var flow = QuickAddFlow()
        flow.show()
        flow.text = "yarın 10'da toplantı"
        flow.show()
        XCTAssertEqual(flow.phase, .shown)
        XCTAssertEqual(flow.text, "yarın 10'da toplantı")
    }

    func testToggleAlternatesBetweenHiddenAndShown() {
        var flow = QuickAddFlow()
        flow.toggle()
        XCTAssertEqual(flow.phase, .shown)
        flow.toggle()
        XCTAssertEqual(flow.phase, .hidden)
    }

    func testEscapeCancelsAndDiscardsTheText() {
        var flow = QuickAddFlow()
        flow.show()
        flow.text = "yarım kalan"
        flow.cancel()
        XCTAssertEqual(flow.phase, .hidden)
        XCTAssertEqual(flow.text, "")
        flow.show()
        XCTAssertEqual(flow.text, "", "a reopened panel starts empty")
    }

    func testEmptyOrBlankTextIsIgnoredAndTheFieldStaysOpen() {
        var flow = QuickAddFlow()
        flow.show()
        XCTAssertNil(flow.submit())
        flow.text = "  \n\t "
        XCTAssertNil(flow.submit())
        XCTAssertEqual(flow.phase, .shown)
    }

    func testSubmitReturnsTrimmedTextAndMovesToSubmitting() {
        var flow = QuickAddFlow()
        flow.show()
        flow.text = "  süt al  "
        XCTAssertEqual(flow.submit(), "süt al")
        XCTAssertEqual(flow.phase, .submitting)
    }

    func testSubmitWhileHiddenDoesNothing() {
        var flow = QuickAddFlow()
        flow.text = "x"
        XCTAssertNil(flow.submit())
        XCTAssertEqual(flow.phase, .hidden)
    }

    func testDoubleSubmitIsIgnored() {
        var flow = QuickAddFlow()
        flow.show()
        flow.text = "bir"
        XCTAssertNotNil(flow.submit())
        XCTAssertNil(flow.submit())
    }

    func testFinishHidesAndClears() {
        var flow = QuickAddFlow()
        flow.show()
        flow.text = "bir"
        _ = flow.submit()
        flow.finish()
        XCTAssertEqual(flow.phase, .hidden)
        XCTAssertEqual(flow.text, "")
    }

    func testFailureReturnsToShownKeepingTheTextSoNothingIsLost() {
        var flow = QuickAddFlow()
        flow.show()
        flow.text = "bir"
        _ = flow.submit()
        flow.fail()
        XCTAssertEqual(flow.phase, .shown)
        XCTAssertEqual(flow.text, "bir")
    }

    func testEscapeAndShowAreIgnoredWhileSubmitting() {
        var flow = QuickAddFlow()
        flow.show()
        flow.text = "bir"
        _ = flow.submit()
        flow.cancel()
        XCTAssertEqual(flow.phase, .submitting)
        flow.toggle()
        XCTAssertEqual(flow.phase, .submitting)
    }

    func testFinishOutsideSubmittingIsANoOp() {
        var flow = QuickAddFlow()
        flow.show()
        flow.text = "bir"
        flow.finish()
        XCTAssertEqual(flow.phase, .shown)
        XCTAssertEqual(flow.text, "bir")
    }

    @MainActor
    func testControllerHandsTheTrimmedTextToTheClosureAndEndsHidden() {
        var received: [String] = []
        let controller = QuickAddController { received.append($0) }
        controller.show()
        controller.flow.text = " iş "
        controller.submit()
        XCTAssertEqual(received, ["iş"])
        XCTAssertEqual(controller.flow.phase, .hidden)
    }

    @MainActor
    func testControllerDoesNotCallTheClosureForEmptyText() {
        var calls = 0
        let controller = QuickAddController { _ in calls += 1 }
        controller.show()
        controller.submit()
        XCTAssertEqual(calls, 0)
        XCTAssertEqual(controller.flow.phase, .shown)
    }
}
