import XCTest
@testable import HusrevityPlatform

@MainActor
final class LaunchAtLoginTests: XCTestCase {
    func testEnablingRegistersAndReportsEnabled() {
        let fake = FakeLaunchAtLogin()
        let model = LaunchAtLoginModel(controller: fake)
        XCTAssertFalse(model.isEnabled)
        model.setEnabled(true)
        XCTAssertTrue(model.isEnabled)
        XCTAssertEqual(fake.status, .enabled)
        XCTAssertNil(model.errorMessage)
    }

    func testDisablingUnregisters() {
        let fake = FakeLaunchAtLogin(status: .enabled)
        let model = LaunchAtLoginModel(controller: fake)
        XCTAssertTrue(model.isEnabled)
        model.setEnabled(false)
        XCTAssertFalse(model.isEnabled)
        XCTAssertEqual(fake.status, .disabled)
    }

    func testAlreadyInTheWantedStateDoesNotCallTheSystem() {
        let fake = FakeLaunchAtLogin(status: .enabled)
        let model = LaunchAtLoginModel(controller: fake)
        model.setEnabled(true)
        XCTAssertEqual(fake.setCalls, [], "registering twice makes SMAppService throw")
    }

    func testFailureIsReportedAndTheStateStaysUnchanged() {
        let fake = FakeLaunchAtLogin()
        fake.failure = FakeLaunchAtLogin.Failure.denied
        let model = LaunchAtLoginModel(controller: fake)
        model.setEnabled(true)
        XCTAssertFalse(model.isEnabled)
        XCTAssertNotNil(model.errorMessage)
    }

    func testSuccessClearsAPreviousError() {
        let fake = FakeLaunchAtLogin()
        fake.failure = FakeLaunchAtLogin.Failure.denied
        let model = LaunchAtLoginModel(controller: fake)
        model.setEnabled(true)
        fake.failure = nil
        model.setEnabled(true)
        XCTAssertNil(model.errorMessage)
        XCTAssertTrue(model.isEnabled)
    }

    func testRequiresApprovalCountsAsOnButIsFlagged() {
        let fake = FakeLaunchAtLogin(status: .requiresApproval)
        let model = LaunchAtLoginModel(controller: fake)
        XCTAssertTrue(model.isEnabled)
        XCTAssertTrue(model.needsApproval)
    }

    func testUnavailableCannotBeToggled() {
        let fake = FakeLaunchAtLogin(status: .unavailable)
        let model = LaunchAtLoginModel(controller: fake)
        XCTAssertFalse(model.isAvailable)
        model.setEnabled(true)
        XCTAssertEqual(fake.setCalls, [])
    }

    func testRefreshPicksUpChangesMadeInSystemSettings() {
        let fake = FakeLaunchAtLogin()
        let model = LaunchAtLoginModel(controller: fake)
        fake.status = .enabled
        model.refresh()
        XCTAssertTrue(model.isEnabled)
    }
}
