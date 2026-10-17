import HusrevityModels
import HusrevityTestSupport
import XCTest

@testable import HusrevityNetwork

final class APIClientBasicsTests: XCTestCase {
    private let base = URL(string: "https://api.test/api")!

    private func client(
        _ transport: FakeTransport,
        tokens: InMemoryTokenStore = InMemoryTokenStore(access: "AT", refresh: "RT"),
        onExpired: @escaping @Sendable () -> Void = {}
    ) -> APIClient {
        APIClient(baseURL: base, transport: transport, tokenStore: tokens, onSessionExpired: onExpired)
    }

    // MARK: defaults

    func testDefaultBaseURLs() {
        XCTAssertEqual(APIClient.productionBaseURL.absoluteString, "https://api.iamhusrev.com/api")
        XCTAssertEqual(APIClient.developmentBaseURL.absoluteString, "http://localhost:4090/api")
    }

    // MARK: login

    func testLoginPostsCredentialsWithoutAuthHeaderAndStoresTokens() async throws {
        let transport = FakeTransport(status: 200, body: try Fixtures.data("login"))
        let store = InMemoryTokenStore()
        let api = client(transport, tokens: store)

        let auth = try await api.login(email: "fixture@example.com", password: "secret")

        let req = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(req.httpMethod, "POST")
        XCTAssertEqual(req.url?.absoluteString, "https://api.test/api/auth/login")
        XCTAssertEqual(req.header("Content-Type"), "application/json")
        XCTAssertNil(req.header("Authorization"))
        XCTAssertNil(req.header("Idempotency-Key"))
        XCTAssertEqual(req.bodyJSON as? [String: String], ["email": "fixture@example.com", "password": "secret"])

        let saved = await store.load()
        XCTAssertEqual(saved?.accessToken, auth.accessToken)
        XCTAssertEqual(saved?.refreshToken, auth.refreshToken)
        XCTAssertEqual(auth.user.email, "fixture@example.com")
    }

    func testLoginWrongPasswordIsUnauthorizedAndDoesNotTriggerRefresh() async throws {
        let transport = FakeTransport(status: 401, body: errorEnvelope("Bad credentials", code: 401))
        let api = client(transport)
        do {
            _ = try await api.login(email: "a@b.c", password: "x")
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .unauthorized = error else { return XCTFail("got \(error)") }
        }
        XCTAssertEqual(transport.requests.count, 1)
    }

    // MARK: sync

    func testSyncFullSendsNoSinceAndBearerToken() async throws {
        let transport = FakeTransport(status: 200, body: try Fixtures.data("sync-full"))
        let api = client(transport)

        let response = try await api.sync(since: nil)

        let req = try XCTUnwrap(transport.requests.first)
        XCTAssertEqual(req.httpMethod, "GET")
        XCTAssertEqual(req.url?.absoluteString, "https://api.test/api/sync")
        XCTAssertEqual(req.header("Authorization"), "Bearer AT")
        XCTAssertNil(req.httpBody)
        XCTAssertFalse(response.cursor.isEmpty)
    }

    func testSyncIncrementalSendsSinceQuery() async throws {
        let transport = FakeTransport(status: 200, body: try Fixtures.data("sync-incremental"))
        let api = client(transport)

        let cursor = "2026-10-17T20:59:25.134Z"
        _ = try await api.sync(since: cursor)

        let url = try XCTUnwrap(transport.requests.first?.url)
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        XCTAssertEqual(items?.first(where: { $0.name == "since" })?.value, cursor)
        XCTAssertEqual(url.path, "/api/sync")
    }

    // MARK: errors

    func testErrorMapping() async throws {
        func isNotFound(_ e: APIError) -> Bool { if case .notFound = e { return true } else { return false } }
        func isConflict(_ e: APIError) -> Bool { if case .conflict("msg") = e { return true } else { return false } }
        func isValidation(_ e: APIError) -> Bool { if case .validation("msg") = e { return true } else { return false } }
        func isRateLimited(_ e: APIError) -> Bool { if case .rateLimited = e { return true } else { return false } }
        func isServer500(_ e: APIError) -> Bool {
            if case .server(500, "msg") = e { return true } else { return false }
        }
        let cases: [(Int, (APIError) -> Bool)] = [
            (404, isNotFound), (409, isConflict), (400, isValidation), (429, isRateLimited), (500, isServer500),
        ]
        for (status, matches) in cases {
            let transport = FakeTransport(status: status, body: errorEnvelope("msg", code: status))
            let api = client(transport)
            do {
                _ = try await api.sync(since: nil)
                XCTFail("expected throw for \(status)")
            } catch let error as APIError {
                XCTAssertTrue(matches(error), "status \(status) mapped to \(error)")
            }
        }
    }

    func testConflictMessageComesFromRealFixture() async throws {
        let transport = FakeTransport(status: 409, body: try Fixtures.data("note-409"))
        let api = client(transport)
        do {
            try await api.deleteNote(id: "1", idempotencyKey: "k", ifMatch: Date())
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .conflict(let message) = error else { return XCTFail("got \(error)") }
            XCTAssertTrue(message.contains("modified since you last fetched it"), message)
        }
    }

    func testNonJSONErrorBodyStillMapsByStatus() async throws {
        let transport = FakeTransport(status: 502, body: Data("<html>bad gateway</html>".utf8))
        let api = client(transport)
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .server(let code, _) = error else { return XCTFail("got \(error)") }
            XCTAssertEqual(code, 502)
        }
    }

    func testTransportFailureIsDistinctFromHTTPFailure() async throws {
        let transport = FakeTransport { _, _ in throw URLError(.notConnectedToInternet) }
        let api = client(transport)
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .transport(let underlying) = error else { return XCTFail("got \(error)") }
            XCTAssertEqual((underlying as? URLError)?.code, .notConnectedToInternet)
            XCTAssertTrue(error.isRetryable)
        }
    }

    func testMalformedSuccessBodyIsDecodingError() async throws {
        let transport = FakeTransport(status: 200, body: envelope(#"{"nope":1}"#))
        let api = client(transport)
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .malformedSuccess(200) = error else { return XCTFail("got \(error)") }
            XCTAssertTrue(error.isRetryable)
        }
    }

    func testRetryability() {
        XCTAssertTrue(APIError.rateLimited.isRetryable)
        XCTAssertTrue(APIError.server(code: 503, message: "").isRetryable)
        XCTAssertFalse(APIError.server(code: 403, message: "").isRetryable)
        XCTAssertFalse(APIError.conflict("").isRetryable)
        XCTAssertFalse(APIError.validation("").isRetryable)
        XCTAssertFalse(APIError.unauthorized.isRetryable)
        XCTAssertFalse(APIError.notFound.isRetryable)
    }

    func testDescriptionsNeverContainTokens() async throws {
        let transport = FakeTransport(status: 500, body: errorEnvelope("boom", code: 500))
        let api = client(transport, tokens: InMemoryTokenStore(access: "secret-a", refresh: "secret-r"))
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch {
            XCTAssertFalse("\(error)".contains("secret"))
            XCTAssertFalse(error.localizedDescription.contains("secret"))
        }
        let pair = TokenPair(accessToken: "secret-a", refreshToken: "secret-r")
        XCTAssertFalse("\(pair)".contains("secret"))
        XCTAssertFalse(String(reflecting: pair).contains("secret"))
    }
}
