import XCTest
@testable import HusrevityCore

final class AccountGuardTests: XCTestCase {
    private let prod = URL(string: "https://api.iamhusrev.com/api")!
    private let local = URL(string: "http://localhost:4090/api")!
    private let db = "/tmp/husrevity.sqlite"

    private func check(
        storedEmail: String?, storedServer: URL?, email: String, server: URL
    ) throws {
        try AccountGuard.check(
            storedEmail: storedEmail, storedServer: storedServer, email: email, server: server,
            databasePath: db)
    }

    func testFirstSignInIsAlwaysAllowed() throws {
        try check(storedEmail: nil, storedServer: nil, email: "me@example.com", server: prod)
    }

    func testSameAccountAndServerIsAllowed() throws {
        try check(storedEmail: "me@example.com", storedServer: prod, email: "me@example.com", server: prod)
    }

    func testEmailComparisonIgnoresCase() throws {
        try check(storedEmail: "Me@Example.com", storedServer: prod, email: "me@example.COM", server: prod)
    }

    func testServerComparisonIgnoresTrailingSlashAndHostCase() throws {
        try check(
            storedEmail: "me@example.com", storedServer: prod, email: "me@example.com",
            server: URL(string: "https://API.iamhusrev.com/api/")!)
    }

    func testADifferentAccountIsRefused() {
        XCTAssertThrowsError(
            try check(storedEmail: "me@example.com", storedServer: prod, email: "other@example.com", server: prod)
        ) { error in
            XCTAssertEqual(error as? AccountGuard.Mismatch, .account(existing: "me@example.com", databasePath: db))
        }
    }

    func testTheSameEmailOnAnotherServerIsRefused() {
        // The store holds server ids and a cursor from one server; pushing them to another would
        // 404 and the engine would discard the local rows.
        XCTAssertThrowsError(
            try check(storedEmail: "me@example.com", storedServer: prod, email: "me@example.com", server: local)
        ) { error in
            XCTAssertEqual(
                error as? AccountGuard.Mismatch,
                .server(existing: "https://api.iamhusrev.com/api", databasePath: db))
        }
    }

    func testAnAccountWithoutARecordedServerIsAllowedAndGetsBound() throws {
        // Configs written before the server was recorded must not lock the user out.
        try check(storedEmail: "me@example.com", storedServer: nil, email: "me@example.com", server: local)
    }

    func testMessagesAreTurkishAndTellWhereTheDataLives() {
        let account = AccountGuard.Mismatch.account(existing: "me@example.com", databasePath: db)
        let server = AccountGuard.Mismatch.server(existing: "https://api.iamhusrev.com/api", databasePath: db)
        XCTAssertTrue(account.localizedDescription.contains("me@example.com"))
        XCTAssertTrue(account.localizedDescription.contains(db))
        XCTAssertTrue(server.localizedDescription.contains("https://api.iamhusrev.com/api"))
        XCTAssertTrue(server.localizedDescription.contains(db))
    }
}
