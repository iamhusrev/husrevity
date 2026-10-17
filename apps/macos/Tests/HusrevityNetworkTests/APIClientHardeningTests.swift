import XCTest

@testable import HusrevityNetwork

final class APIClientHardeningTests: XCTestCase {
    private let base = URL(string: "https://api.test/api")!
    private let stamp = Date(timeIntervalSince1970: 1_792_270_927.345)

    private func client(
        _ transport: FakeTransport, store: InMemoryTokenStore = InMemoryTokenStore(access: "AT", refresh: "RT"),
        expired: Counter = Counter()
    ) -> APIClient {
        APIClient(baseURL: base, transport: transport, tokenStore: store, onSessionExpired: { expired.increment() })
    }

    // MARK: 1. 2xx with an undecodable body

    private func assertMalformed(_ error: Error, status: Int, file: StaticString = #filePath, line: UInt = #line) {
        guard let api = error as? APIError, case .malformedSuccess(let code) = api else {
            return XCTFail("got \(error)", file: file, line: line)
        }
        XCTAssertEqual(code, status, file: file, line: line)
        XCTAssertTrue(api.isRetryable, "the write may already be applied: retry with the same key", file: file, line: line)
    }

    func testGetWithGarbage2xxBodyIsRetryableMalformedSuccess() async {
        let api = client(FakeTransport(status: 200, body: Data("<html>captive portal</html>".utf8)))
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch { assertMalformed(error, status: 200) }
    }

    func testEnvelopeWithWrongDataShapeIsMalformedSuccess() async {
        let api = client(FakeTransport(status: 200, body: envelope(#"{"nope":1}"#)))
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch { assertMalformed(error, status: 200) }
    }

    func testCreateWithGarbage201BodyIsMalformedSuccess() async {
        let api = client(FakeTransport(status: 201, body: Data("not json".utf8)))
        do {
            _ = try await api.createNote(NoteRequest(title: "T"), idempotencyKey: "K")
            XCTFail("expected throw")
        } catch { assertMalformed(error, status: 201) }
    }

    func testCreateWithEmpty201BodyIsMalformedSuccess() async {
        let api = client(FakeTransport(status: 201, body: Data()))
        do {
            _ = try await api.createNote(NoteRequest(title: "T"), idempotencyKey: "K")
            XCTFail("expected throw")
        } catch { assertMalformed(error, status: 201) }
    }

    func testDeleteIgnoresBodyOfSuccessfulResponse() async throws {
        // A void write has nothing to decode, so a garbage 2xx body must not turn an applied
        // delete into a failure.
        let api = client(FakeTransport(status: 200, body: Data("garbage".utf8)))
        try await api.deleteNote(id: "1", idempotencyKey: "K", ifMatch: stamp)
    }

    func testNon2xxGarbageStillMapsByStatusNotMalformed() async {
        let api = client(FakeTransport(status: 500, body: Data("oops".utf8)))
        do {
            _ = try await api.createNote(NoteRequest(title: "T"), idempotencyKey: "K")
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .server(500, _) = error else { return XCTFail("got \(error)") }
        } catch { XCTFail("got \(error)") }
    }

    // MARK: 2. URLError classification

    func testCancelledURLErrorSurfacesAsCancellationError() async {
        let api = client(FakeTransport { _, _ in throw URLError(.cancelled) })
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch is CancellationError {
        } catch { XCTFail("got \(error)") }
    }

    func testOtherURLErrorsStayRetryableTransport() async {
        let codes: [URLError.Code] = [
            .notConnectedToInternet, .timedOut, .networkConnectionLost, .cannotConnectToHost,
            .cannotFindHost, .dnsLookupFailed,
        ]
        for code in codes {
            let api = client(FakeTransport { _, _ in throw URLError(code) })
            do {
                _ = try await api.createNote(NoteRequest(title: "T"), idempotencyKey: "K")
                XCTFail("expected throw for \(code)")
            } catch let error as APIError {
                guard case .transport(let underlying) = error else { XCTFail("\(code) -> \(error)"); continue }
                XCTAssertEqual((underlying as? URLError)?.code, code)
                XCTAssertTrue(error.isRetryable, "\(code)")
            } catch { XCTFail("\(code) -> \(error)") }
        }
    }

    // MARK: 3. refresh status classification

    private func failingRefreshServer(status: Int) -> FakeTransport {
        FakeTransport { request, _ in
            if request.url?.path == "/api/auth/refresh" { return (status, errorEnvelope("refresh said \(status)", code: status)) }
            return (401, errorEnvelope("Unauthorized", code: 401))
        }
    }

    func testRefreshRejectedWith400_401_403ExpiresSession() async {
        for status in [400, 401, 403] {
            let store = InMemoryTokenStore(access: "AT", refresh: "RT")
            let expired = Counter()
            let api = client(failingRefreshServer(status: status), store: store, expired: expired)
            do {
                _ = try await api.sync(since: nil)
                XCTFail("expected throw for \(status)")
            } catch let error as APIError {
                guard case .unauthorized = error else { XCTFail("\(status) -> \(error)"); continue }
            } catch { XCTFail("\(status) -> \(error)") }
            let saved = await store.load()
            XCTAssertNil(saved, "status \(status)")
            XCTAssertEqual(expired.count, 1, "status \(status)")
        }
    }

    func testTransientRefreshStatusesKeepTheSession() async {
        for status in [404, 408, 429, 500, 502, 503, 504] {
            let store = InMemoryTokenStore(access: "AT", refresh: "RT")
            let expired = Counter()
            let api = client(failingRefreshServer(status: status), store: store, expired: expired)
            do {
                _ = try await api.sync(since: nil)
                XCTFail("expected throw for \(status)")
            } catch let error as APIError {
                switch (status, error) {
                case (429, .rateLimited): break
                case (let s, .server(let code, _)) where s == code: break
                case (404, .notFound): break
                default: XCTFail("\(status) -> \(error)")
                }
                if status != 404 { XCTAssertTrue(error.isRetryable, "status \(status)") }
            } catch { XCTFail("\(status) -> \(error)") }
            let saved = await store.load()
            XCTAssertEqual(saved, TokenPair(accessToken: "AT", refreshToken: "RT"), "status \(status)")
            XCTAssertEqual(expired.count, 0, "status \(status)")
        }
    }

    func testRefreshWithGarbage200KeepsSession() async {
        let store = InMemoryTokenStore(access: "AT", refresh: "RT")
        let transport = FakeTransport { request, _ in
            request.url?.path == "/api/auth/refresh"
                ? (200, Data("<html/>".utf8)) : (401, errorEnvelope("Unauthorized", code: 401))
        }
        let expired = Counter()
        let api = client(transport, store: store, expired: expired)
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch { assertMalformed(error, status: 200) }
        let saved = await store.load()
        XCTAssertNotNil(saved)
        XCTAssertEqual(expired.count, 0)
    }

    // MARK: 4. free-form source

    func testItemSourceAcceptsFreeStrings() throws {
        let data = try JSONEncoder().encode(ItemRequest(kind: "task", title: "T", source: "macos"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["source"] as? String, "macos")
    }
}
