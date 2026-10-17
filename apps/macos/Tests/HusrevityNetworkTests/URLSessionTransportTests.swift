import XCTest

@testable import HusrevityNetwork

/// Serves canned responses through a real `URLSession`, so `URLSessionTransport` is exercised
/// without touching the network.
final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: (@Sendable (URLRequest) throws -> (Int, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        do {
            let (status, body) = try XCTUnwrap(Self.handler)(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
}

final class URLSessionTransportTests: XCTestCase {
    private func transport() -> URLSessionTransport {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return URLSessionTransport(session: URLSession(configuration: config))
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        super.tearDown()
    }

    func testReturnsBodyAndStatusForErrorStatusesWithoutThrowing() async throws {
        StubURLProtocol.handler = { _ in (409, Data("conflict".utf8)) }
        let (data, response) = try await transport().send(URLRequest(url: URL(string: "https://api.test/x")!))
        XCTAssertEqual(response.statusCode, 409)
        XCTAssertEqual(String(data: data, encoding: .utf8), "conflict")
    }

    func testClientOverRealURLSessionSendsHeadersAndMapsEnvelope() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer AT")
            XCTAssertEqual(request.url?.absoluteString, "https://api.test/api/sync?since=abc")
            return (200, envelope(#"{"items":[],"itemOccurrences":[],"notes":[],"noteTags":[],"projects":[],"goals":[],"tombstones":{"items":[],"itemOccurrences":[],"notes":[],"noteTags":[],"projects":[],"goals":[]},"cursor":"c1"}"#))
        }
        let api = APIClient(
            baseURL: URL(string: "https://api.test/api")!, transport: transport(),
            tokenStore: InMemoryTokenStore(access: "AT", refresh: "RT")
        )
        let response = try await api.sync(since: "abc")
        XCTAssertEqual(response.cursor, "c1")
    }

    func testNetworkFailureBecomesTransportError() async throws {
        StubURLProtocol.handler = { _ in throw URLError(.timedOut) }
        let api = APIClient(
            baseURL: URL(string: "https://api.test/api")!, transport: transport(),
            tokenStore: InMemoryTokenStore(access: "AT", refresh: "RT")
        )
        do {
            _ = try await api.sync(since: nil)
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .transport(let underlying) = error else { return XCTFail("got \(error)") }
            XCTAssertEqual((underlying as? URLError)?.code, .timedOut)
        }
    }
}
