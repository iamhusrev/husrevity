import Combine
import XCTest

@testable import HusrevityCore

@MainActor
final class LoginViewModelTests: XCTestCase {
    private var calls: [(url: URL, email: String, password: String)] = []
    private var failure: Error?

    private func makeVM(server: ServerChoice = .production, customURL: String = "") -> LoginViewModel {
        let vm = LoginViewModel(signIn: { [unowned self] url, email, password in
            self.calls.append((url, email, password))
            if let failure = self.failure { throw failure }
        })
        vm.server = server
        vm.customURL = customURL
        return vm
    }

    private func filled(_ vm: LoginViewModel) -> LoginViewModel {
        vm.email = "ahmet@example.com"
        vm.password = "secret"
        return vm
    }

    // MARK: Validation

    func testEmptyFormCannotBeSubmittedAndNothingIsCalled() async {
        let vm = makeVM()
        XCTAssertFalse(vm.canSubmit)
        let ok = await vm.submit()
        XCTAssertFalse(ok)
        XCTAssertEqual(vm.errorMessage, L10n.Login.emailRequired)
        XCTAssertTrue(calls.isEmpty)
    }

    func testEachFieldHasItsOwnValidationMessage() async {
        let vm = makeVM()
        vm.email = "not-an-email"
        vm.password = "x"
        _ = await vm.submit()
        XCTAssertEqual(vm.errorMessage, L10n.Login.emailInvalid)
        vm.email = "a@b.co"
        vm.password = ""
        _ = await vm.submit()
        XCTAssertEqual(vm.errorMessage, L10n.Login.passwordRequired)
        XCTAssertTrue(calls.isEmpty)
    }

    func testEmailIsTrimmedButThePasswordIsSentVerbatim() async {
        let vm = makeVM()
        vm.email = "  ahmet@example.com \n"
        vm.password = " pa ss "
        let ok = await vm.submit()
        XCTAssertTrue(ok)
        XCTAssertEqual(calls.first?.email, "ahmet@example.com")
        XCTAssertEqual(calls.first?.password, " pa ss ")
    }

    // MARK: Server choice

    func testServerChoicesMapToBaseURLs() {
        XCTAssertEqual(makeVM(server: .production).baseURL, URL(string: "https://api.iamhusrev.com/api"))
        XCTAssertEqual(makeVM(server: .local).baseURL, URL(string: "http://localhost:4090/api"))
        XCTAssertEqual(
            makeVM(server: .custom, customURL: "https://my.host:8443/api").baseURL, URL(string: "https://my.host:8443/api"))
    }

    func testCustomAddressWithoutAPathGetsTheApiPrefix() {
        XCTAssertEqual(makeVM(server: .custom, customURL: " https://my.host ").baseURL, URL(string: "https://my.host/api"))
        XCTAssertEqual(makeVM(server: .custom, customURL: "http://192.168.1.5:4090/").baseURL, URL(string: "http://192.168.1.5:4090/api"))
        XCTAssertEqual(makeVM(server: .custom, customURL: "https://my.host/custom/").baseURL, URL(string: "https://my.host/custom"))
    }

    func testInvalidCustomAddressesAreRejected() async {
        for bad in ["", "my.host", "ftp://my.host", "https://", "not a url", "javascript:alert(1)"] {
            let vm = filled(makeVM(server: .custom, customURL: bad))
            XCTAssertNil(vm.baseURL, bad)
            XCTAssertFalse(vm.canSubmit, bad)
            let ok = await vm.submit()
            XCTAssertFalse(ok)
            XCTAssertEqual(vm.errorMessage, L10n.Login.urlInvalid, bad)
        }
        XCTAssertTrue(calls.isEmpty)
    }

    func testTheChosenServerIsWhatSignInReceives() async {
        let vm = filled(makeVM(server: .local))
        _ = await vm.submit()
        XCTAssertEqual(calls.first?.url, URL(string: "http://localhost:4090/api"))
    }

    // MARK: Submit

    func testSuccessfulSignInClearsThePasswordAndReportsSuccess() async {
        let vm = filled(makeVM())
        let ok = await vm.submit()
        XCTAssertTrue(ok)
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(vm.password, "")
        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.isSubmitting)
    }

    func testSubmittingFlagIsRaisedWhileTheCallIsInFlight() async {
        var release: CheckedContinuation<Void, Never>?
        let vm = LoginViewModel(signIn: { _, _, _ in await withCheckedContinuation { release = $0 } })
        _ = filled(vm)
        let task = Task { await vm.submit() }
        let started = expectation(description: "submitting")
        let sub = vm.$isSubmitting.sink { if $0 { started.fulfill() } }
        await fulfillment(of: [started], timeout: 5)
        XCTAssertFalse(vm.canSubmit, "no double submit while one is running")
        let second = await vm.submit()
        XCTAssertFalse(second)
        release?.resume()
        let ok = await task.value
        XCTAssertTrue(ok)
        XCTAssertFalse(vm.isSubmitting)
        sub.cancel()
    }

    // MARK: Error mapping

    func testErrorsAreMappedToTurkishMessages() async {
        let cases: [(Error, String)] = [
            (APIError.unauthorized, L10n.Login.wrongCredentials),
            (APIError.rateLimited, L10n.Login.rateLimited),
            (APIError.transport(URLError(.notConnectedToInternet)), L10n.Login.offline),
            (URLError(.timedOut), L10n.Login.offline),
            (APIError.server(code: 503, message: "down"), L10n.Login.server(503)),
            (APIError.validation("email must be an email"), L10n.Login.rejected("email must be an email")),
            (APIError.tokenStorage(URLError(.unknown)), L10n.Login.storage),
            (APIError.malformedSuccess(httpStatus: 200), L10n.Login.unknown),
            (APIError.notFound, L10n.Login.unknown),
        ]
        for (error, expected) in cases {
            calls = []
            failure = error
            let vm = filled(makeVM())
            let ok = await vm.submit()
            XCTAssertFalse(ok)
            XCTAssertEqual(vm.errorMessage, expected, "\(error)")
            XCTAssertFalse(vm.isSubmitting)
            XCTAssertEqual(vm.password, "secret", "the password stays so the user can fix a typo")
        }
    }

    private struct AccountMismatch: LocalizedError {
        var errorDescription: String? { "Bu cihazda başka bir hesabın verileri var." }
    }

    func testLocalizedErrorsFromTheSignInClosureShowTheirOwnDescription() async {
        failure = AccountMismatch()
        let vm = filled(makeVM())
        let ok = await vm.submit()
        XCTAssertFalse(ok)
        XCTAssertEqual(vm.errorMessage, "Bu cihazda başka bir hesabın verileri var.")
    }

    func testPlainUnknownErrorsStayGeneric() async {
        struct Plain: Error {}
        failure = Plain()
        let vm = filled(makeVM())
        _ = await vm.submit()
        XCTAssertEqual(vm.errorMessage, L10n.Login.unknown)
    }

    func testCancellationIsNotShownAsAnError() async {
        failure = CancellationError()
        let vm = filled(makeVM())
        let ok = await vm.submit()
        XCTAssertFalse(ok)
        XCTAssertNil(vm.errorMessage)
    }

    func testEditingAClearsThePreviousError() async {
        failure = APIError.unauthorized
        let vm = filled(makeVM())
        _ = await vm.submit()
        XCTAssertNotNil(vm.errorMessage)
        vm.password = "other"
        XCTAssertNil(vm.errorMessage)
    }
}
