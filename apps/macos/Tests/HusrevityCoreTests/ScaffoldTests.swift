import XCTest
@testable import HusrevityCore

final class ScaffoldTests: XCTestCase {
    func testCoreLibraryLinks() {
        XCTAssertEqual(HusrevityCore.name, "HusrevityCore")
    }
}
