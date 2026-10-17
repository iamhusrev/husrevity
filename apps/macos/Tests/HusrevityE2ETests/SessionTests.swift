import HusrevityCore
import XCTest

/// Scenario 8: sign-in failures and token refresh against the real auth endpoints.
final class SessionTests: E2ECase {
    func testWrongPasswordIsUnauthorized() async throws {
        let stranger = APIClient(baseURL: config.baseURL, transport: ControllableTransport(), tokenStore: InMemoryTokenStore())
        do {
            _ = try await stranger.login(email: email, password: password + "-wrong")
            XCTFail("login with a wrong password must fail")
        } catch let error as APIError {
            guard case .unauthorized = error else { return XCTFail("expected .unauthorized, got \(error)") }
        }
        do {
            _ = try await stranger.login(email: "nobody-\(uid!)@example.test", password: password)
            XCTFail("login for an unknown account must fail")
        } catch let error as APIError {
            guard case .unauthorized = error else { return XCTFail("expected .unauthorized, got \(error)") }
        }
    }

    func testSharedE2EAccountCanSignInAndSync() async throws {
        try XCTSkipIf(config.email.isEmpty, "HUSREVITY_E2E_EMAIL is not set")
        let tokens = InMemoryTokenStore()
        let device = APIClient(baseURL: config.baseURL, transport: ControllableTransport(), tokenStore: tokens)
        let auth = try await device.login(email: config.email, password: config.password)
        XCTAssertEqual(auth.user.email, config.email.lowercased())
        let pair = await tokens.load()
        XCTAssertNotNil(pair)
        let pulled = try await device.sync(since: nil)
        XCTAssertFalse(pulled.cursor.isEmpty)
    }

    func testInvalidAccessTokenIsRefreshedOnceAndTheRequestSucceeds() async throws {
        let storedBefore = await tokenStore.load()
        let before = try XCTUnwrap(storedBefore)
        try await tokenStore.save(TokenPair(accessToken: "not-a-jwt", refreshToken: before.refreshToken))
        transport.resetLog()

        let note = try store.create(NoteRecord(title: "\(uid!) after refresh"))
        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .synced)
        XCTAssertEqual(outcome.pushed, 1)
        XCTAssertEqual(sessionExpiredCount, 0)
        let refreshes = transport.log.filter { $0.path == "/auth/refresh" }
        XCTAssertEqual(refreshes.count, 1, "the refresh is shared: exactly one call")
        XCTAssertEqual(refreshes.first?.outcome, .delivered(200))
        let rejected = transport.log.first { $0.path != "/auth/refresh" }
        XCTAssertEqual(rejected?.outcome, .delivered(401), "the first request carried the bad token")

        let storedAfter = await tokenStore.load()
        let after = try XCTUnwrap(storedAfter)
        XCTAssertNotEqual(after.accessToken, "not-a-jwt")
        XCTAssertNotEqual(after.refreshToken, before.refreshToken, "refresh tokens rotate")
        let titles = try await serverNotes().compactMap { $0["title"] as? String }
        XCTAssertEqual(titles, [note.title])
    }

    func testRevokedRefreshTokenEndsTheSessionAndKeepsTheOutbox() async throws {
        // Logging out server-side revokes every refresh token of the account.
        try raw.expect(204, try await raw.post("/auth/logout"))
        let storedBefore = await tokenStore.load()
        let before = try XCTUnwrap(storedBefore)
        try await tokenStore.save(TokenPair(accessToken: "not-a-jwt", refreshToken: before.refreshToken))

        try store.create(NoteRecord(title: "\(uid!) stranded"))
        let outcome = await engine.syncNow()

        XCTAssertEqual(outcome.result, .sessionExpired)
        XCTAssertEqual(sessionExpiredCount, 1)
        let cleared = await tokenStore.load()
        XCTAssertNil(cleared, "tokens are cleared when the session is over")
        XCTAssertEqual(try store.outboxCount(), 1, "the write waits for the next sign-in")
        XCTAssertEqual(try localNote(titled: "\(uid!) stranded").serverId, nil)

        // Signing in again picks the queue up.
        try await client.login(email: email, password: password)
        try await syncUntilDrained()
        let titles = try await serverNotes().compactMap { $0["title"] as? String }
        XCTAssertEqual(titles, ["\(uid!) stranded"])
    }
}
