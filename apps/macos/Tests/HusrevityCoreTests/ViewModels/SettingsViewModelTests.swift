import XCTest

@testable import HusrevityCore

@MainActor
final class SettingsViewModelTests: XCTestCase {
    private var saved: [URL?] = []
    private var signOutCalls = 0

    private func makeVM(web: String? = nil, server: String = "https://api.iamhusrev.com/api") -> SettingsViewModel {
        SettingsViewModel(
            serverURL: URL(string: server)!, userEmail: "ahmet@example.com", webBaseURL: web.flatMap(URL.init(string:)),
            saveWebBaseURL: { [unowned self] in self.saved.append($0) },
            signOut: { [unowned self] in self.signOutCalls += 1 })
    }

    func testWebLinksAreHiddenWhenNoWebAddressIsSet() {
        let vm = makeVM()
        XCTAssertFalse(vm.canOpenInWeb)
        XCTAssertNil(vm.webURL(for: .vault))
        XCTAssertNil(vm.webURL(path: "/notes"))
        XCTAssertTrue(vm.webLinks.isEmpty)
        XCTAssertEqual(vm.webAddressText, "")
    }

    func testWebLinksAppearOnceTheAddressIsSet() {
        let vm = makeVM(web: "https://husrev.example.com/")
        XCTAssertTrue(vm.canOpenInWeb)
        XCTAssertEqual(vm.webAddressText, "https://husrev.example.com")
        XCTAssertEqual(vm.webURL(for: .vault)?.absoluteString, "https://husrev.example.com/vault")
        XCTAssertEqual(vm.webURL(for: .learning)?.absoluteString, "https://husrev.example.com/learning")
        XCTAssertEqual(vm.webURL(for: .sport)?.absoluteString, "https://husrev.example.com/sport")
        XCTAssertEqual(vm.webURL(for: .routine)?.absoluteString, "https://husrev.example.com/evkat")
        XCTAssertEqual(vm.webLinks.map(\.title), ["Kasa", "Öğrenme", "Spor", "Rutin"])
        XCTAssertEqual(vm.webURL(path: "/projects/12")?.absoluteString, "https://husrev.example.com/projects/12")
    }

    func testAWebAddressWithAPathPrefixKeepsIt() {
        let vm = makeVM(web: "https://example.com/app")
        XCTAssertEqual(vm.webURL(for: .vault)?.absoluteString, "https://example.com/app/vault")
    }

    func testSavingAValidAddressPersistsAndShowsLinks() {
        let vm = makeVM()
        vm.webAddressText = "  https://husrev.example.com/ "
        XCTAssertTrue(vm.saveWebAddress())
        XCTAssertEqual(saved, [URL(string: "https://husrev.example.com")])
        XCTAssertTrue(vm.canOpenInWeb)
        XCTAssertNil(vm.errorMessage)
    }

    func testABareHostGetsHttps() {
        let vm = makeVM()
        vm.webAddressText = "husrev.example.com"
        XCTAssertTrue(vm.saveWebAddress())
        XCTAssertEqual(vm.webBaseURL?.absoluteString, "https://husrev.example.com")
    }

    func testSavingAnEmptyAddressClearsItAndHidesTheLinks() {
        let vm = makeVM(web: "https://husrev.example.com")
        vm.webAddressText = "  "
        XCTAssertTrue(vm.saveWebAddress())
        XCTAssertEqual(saved.count, 1)
        XCTAssertNil(saved[0])
        XCTAssertFalse(vm.canOpenInWeb)
    }

    func testInvalidAddressesAreRejectedAndNotPersisted() {
        for bad in ["ftp://example.com", "not a url", "https://", "javascript:alert(1)", "http//x"] {
            let vm = makeVM(web: "https://old.example.com")
            vm.webAddressText = bad
            XCTAssertFalse(vm.saveWebAddress(), bad)
            XCTAssertEqual(vm.errorMessage, L10n.Settings.webAddressInvalid, bad)
            XCTAssertEqual(vm.webBaseURL?.absoluteString, "https://old.example.com", "the old value is kept")
        }
        XCTAssertTrue(saved.isEmpty)
    }

    func testServerAndAccountInfo() {
        let vm = makeVM(server: "http://localhost:4090/api")
        XCTAssertEqual(vm.serverDisplay, "localhost:4090")
        XCTAssertEqual(vm.userEmail, "ahmet@example.com")
        XCTAssertEqual(makeVM().serverDisplay, "api.iamhusrev.com")
    }

    func testSignOutRunsOnceAndMarksTheViewModel() async {
        let vm = makeVM()
        XCTAssertFalse(vm.isSignedOut)
        await vm.signOut()
        await vm.signOut()
        XCTAssertEqual(signOutCalls, 1)
        XCTAssertTrue(vm.isSignedOut)
    }
}
