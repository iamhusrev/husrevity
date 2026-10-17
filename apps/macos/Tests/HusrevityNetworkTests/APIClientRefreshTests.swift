import HusrevityModels
import HusrevityTestSupport
import XCTest

@testable import HusrevityNetwork

final class APIClientRefreshTests: XCTestCase {
    private let base = URL(string: "https://api.test/api")!
    private let stamp = Date(timeIntervalSince1970: 1_792_270_927.345)

    private func isRefresh(_ r: URLRequest) -> Bool { r.url?.path == "/api/auth/refresh" }

    private func noteJSON() throws -> Data { try Fixtures.data("note-updated") }

    /// A server that accepts only bearer `valid` on every endpoint except /auth/refresh.
    private func server(
        valid: String, refreshCounter: Counter = Counter(),
        refreshResponse: @escaping @Sendable () async throws -> (Int, Data) = {
            (200, authEnvelope(access: "AT2", refresh: "RT2"))
        }
    ) throws -> FakeTransport {
        let ok = try noteJSON()
        return FakeTransport { request, _ in
            if request.url?.path == "/api/auth/refresh" {
                refreshCounter.increment()
                return try await refreshResponse()
            }
            if request.header("Authorization") == "Bearer \(valid)" { return (200, ok) }
            return (401, errorEnvelope("Unauthorized", code: 401))
        }
    }

    private func makeClient(
        _ transport: FakeTransport, store: InMemoryTokenStore, expired: Counter = Counter()
    ) -> APIClient {
        APIClient(
            baseURL: base, transport: transport, tokenStore: store,
            onSessionExpired: { expired.increment() }
        )
    }

    func testExpiredAccessTokenRefreshesOnceAndRetriesSameRequestWithSameIdempotencyKey() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let transport = try server(valid: "AT2")
        let api = makeClient(transport, store: store)

        let note = try await api.updateNote(id: "2", NoteRequest(title: "T"), idempotencyKey: "KEY", ifMatch: stamp)
        XCTAssertFalse(note.id.isEmpty)

        let reqs = transport.requests
        XCTAssertEqual(reqs.count, 3)  // original, refresh, retry

        let refresh = reqs[1]
        XCTAssertEqual(refresh.httpMethod, "POST")
        XCTAssertEqual(refresh.url?.absoluteString, "https://api.test/api/auth/refresh")
        XCTAssertNil(refresh.header("Authorization"))
        XCTAssertEqual(refresh.bodyJSON as? [String: String], ["refreshToken": "RT"])

        let first = reqs[0], retry = reqs[2]
        XCTAssertEqual(first.header("Authorization"), "Bearer AT")
        XCTAssertEqual(retry.header("Authorization"), "Bearer AT2")
        for r in [first, retry] {
            XCTAssertEqual(r.httpMethod, "PUT")
            XCTAssertEqual(r.url?.path, "/api/notes/2")
            XCTAssertEqual(r.header("Idempotency-Key"), "KEY")
            XCTAssertEqual(r.header("If-Match"), "1792270927345")
        }
        XCTAssertEqual(first.httpBody, retry.httpBody)

        let saved = await store.load()
        XCTAssertEqual(saved?.accessToken, "AT2")
        XCTAssertEqual(saved?.refreshToken, "RT2")
    }

    func testForbiddenAlsoTriggersRefresh() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let ok = try noteJSON()
        let transport = FakeTransport { request, _ in
            if self.isRefresh(request) { return (200, authEnvelope(access: "AT2", refresh: "RT2")) }
            if request.header("Authorization") == "Bearer AT2" { return (200, ok) }
            return (403, errorEnvelope("Forbidden", code: 403))
        }
        let api = makeClient(transport, store: store)
        _ = try await api.deleteNoteReturningNote(id: "2")
        XCTAssertEqual(transport.requests.filter(isRefresh).count, 1)
    }

    func testRefreshFailureClearsTokensNotifiesAndThrowsUnauthorized() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let expired = Counter()
        let transport = try server(valid: "never") { (401, errorEnvelope("Invalid refresh token", code: 401)) }
        let api = makeClient(transport, store: store, expired: expired)

        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .unauthorized = error else { return XCTFail("got \(error)") }
        }
        let saved = await store.load()
        XCTAssertNil(saved)
        XCTAssertEqual(expired.count, 1)
        XCTAssertEqual(transport.requests.count, 2, "original + refresh, no retry")
    }

    func testStillUnauthorizedAfterRefreshDoesNotRefreshAgain() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let refreshes = Counter()
        let transport = try server(valid: "never-matches", refreshCounter: refreshes)
        let api = makeClient(transport, store: store)

        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .unauthorized = error else { return XCTFail("got \(error)") }
        }
        XCTAssertEqual(refreshes.count, 1)
        XCTAssertEqual(transport.requests.count, 3)
    }

    func testPersistentForbiddenAfterRefreshSurfacesAsServerError() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let transport = FakeTransport { request, _ in
            if self.isRefresh(request) { return (200, authEnvelope(access: "AT2", refresh: "RT2")) }
            return (403, errorEnvelope("Only the owner can do this", code: 403))
        }
        let api = makeClient(transport, store: store)
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .server(let code, let message) = error else { return XCTFail("got \(error)") }
            XCTAssertEqual(code, 403)
            XCTAssertEqual(message, "Only the owner can do this")
        }
        let saved = await store.load()
        XCTAssertNotNil(saved, "a real permission error must not sign the user out")
    }

    func testAuthEndpointsNeverRefresh() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let transport = FakeTransport(status: 403, body: errorEnvelope("nope", code: 403))
        let api = makeClient(transport, store: store)
        do {
            _ = try await api.login(email: "a@b.c", password: "x")
            XCTFail("expected throw")
        } catch {}
        XCTAssertEqual(transport.requests.count, 1)
    }

    func testRefreshOverNetworkFailureKeepsSessionAndReportsTransport() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let expired = Counter()
        let transport = try server(valid: "never") { throw URLError(.notConnectedToInternet) }
        let api = makeClient(transport, store: store, expired: expired)

        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .transport = error else { return XCTFail("got \(error)") }
        }
        let saved = await store.load()
        XCTAssertEqual(saved?.refreshToken, "RT")
        XCTAssertEqual(expired.count, 0)
    }

    func testRefreshServerErrorKeepsSession() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let expired = Counter()
        let transport = try server(valid: "never") { (503, errorEnvelope("down", code: 503)) }
        let api = makeClient(transport, store: store, expired: expired)
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .server(503, _) = error else { return XCTFail("got \(error)") }
            XCTAssertTrue(error.isRetryable)
        }
        let saved = await store.load()
        XCTAssertNotNil(saved)
        XCTAssertEqual(expired.count, 0)
    }

    func testNoStoredTokensMeansSessionExpired() async throws {
        let store = InMemoryTokenStore()
        let expired = Counter()
        let transport = FakeTransport(status: 401, body: errorEnvelope("Unauthorized", code: 401))
        let api = makeClient(transport, store: store, expired: expired)
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .unauthorized = error else { return XCTFail("got \(error)") }
        }
        XCTAssertEqual(expired.count, 1)
        XCTAssertEqual(transport.requests.count, 1, "nothing to refresh with")
        XCTAssertNil(transport.requests.first?.header("Authorization"))
    }

    // MARK: single flight

    func testParallelRequestsShareOneRefresh() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let refreshes = Counter()
        let transport = try server(valid: "AT2", refreshCounter: refreshes) {
            try await Task.sleep(nanoseconds: 100_000_000)  // keep the refresh in flight while others fail
            return (200, authEnvelope(access: "AT2", refresh: "RT2"))
        }
        let api = makeClient(transport, store: store)

        try await withThrowingTaskGroup(of: Void.self) { group in
            for i in 0..<12 {
                group.addTask {
                    _ = try await api.updateNote(
                        id: "\(i)", NoteRequest(title: "T"), idempotencyKey: "key-\(i)", ifMatch: nil
                    )
                }
            }
            try await group.waitForAll()
        }

        XCTAssertEqual(refreshes.count, 1)
        let retried = transport.requests.filter { !self.isRefresh($0) && $0.header("Authorization") == "Bearer AT2" }
        XCTAssertEqual(retried.count, 12)
        XCTAssertEqual(Set(retried.compactMap { $0.header("Idempotency-Key") }).count, 12, "each keeps its own key")
    }

    func testParallelRequestsShareOneFailedRefreshAndOneExpiryNotification() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let refreshes = Counter()
        let expired = Counter()
        let transport = try server(valid: "never", refreshCounter: refreshes) {
            try await Task.sleep(nanoseconds: 100_000_000)
            return (401, errorEnvelope("Invalid refresh token", code: 401))
        }
        let api = makeClient(transport, store: store, expired: expired)

        let outcomes = await withTaskGroup(of: Bool.self, returning: [Bool].self) { group in
            for _ in 0..<8 {
                group.addTask {
                    do {
                        _ = try await api.sync(since: nil)
                        return false
                    } catch let error as APIError {
                        if case .unauthorized = error { return true }
                        return false
                    } catch { return false }
                }
            }
            var all: [Bool] = []
            for await r in group { all.append(r) }
            return all
        }

        XCTAssertEqual(outcomes, Array(repeating: true, count: 8))
        XCTAssertEqual(refreshes.count, 1)
        XCTAssertEqual(expired.count, 1)
        let saved = await store.load()
        XCTAssertNil(saved)
    }

    func testRequestFailedWithTokenAlreadyReplacedRetriesWithoutRefreshing() async throws {
        // Models a request that was in flight while another one finished a refresh: its 401 is
        // for a token that is no longer current, so it must just retry with the new one.
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let refreshes = Counter()
        let ok = try noteJSON()
        let transport = FakeTransport { request, _ in
            if self.isRefresh(request) {
                refreshes.increment()
                return (200, authEnvelope(access: "AT3", refresh: "RT3"))
            }
            if request.header("Authorization") == "Bearer AT2" { return (200, ok) }
            // Simulate the concurrent refresh landing while this request was on the wire.
            try await store.save(TokenPair(accessToken: "AT2", refreshToken: "RT2"))
            return (401, errorEnvelope("Unauthorized", code: 401))
        }
        let api = makeClient(transport, store: store)

        _ = try await api.updateNote(id: "2", NoteRequest(title: "T"), idempotencyKey: "K", ifMatch: nil)
        XCTAssertEqual(refreshes.count, 0)
        XCTAssertEqual(transport.requests.count, 2)
    }

    // MARK: explicit refresh()

    func testExplicitRefreshRotatesTokens() async throws {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let transport = try server(valid: "AT2")
        let api = makeClient(transport, store: store)
        try await api.refresh()
        let saved = await store.load()
        XCTAssertEqual(saved, TokenPair(accessToken: "AT2", refreshToken: "RT2"))
    }
}

private extension APIClient {
    /// A cheap authenticated call used where only the auth behaviour matters.
    func deleteNoteReturningNote(id: String) async throws -> NoteDTO {
        try await updateNote(id: id, NoteRequest(title: "T"), idempotencyKey: "K", ifMatch: nil)
    }
}
