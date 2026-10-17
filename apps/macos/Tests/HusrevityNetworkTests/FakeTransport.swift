import Foundation
import HusrevityNetwork

/// Scripted transport: a handler decides the response for every request, and every request is
/// recorded so tests can assert on the exact method, path, headers and body that went out.
final class FakeTransport: HTTPTransport, @unchecked Sendable {
    typealias Handler = @Sendable (URLRequest, Int) async throws -> (Int, Data)

    private let lock = NSLock()
    private var recorded: [URLRequest] = []
    private let handler: Handler

    init(_ handler: @escaping Handler) { self.handler = handler }

    /// Replies with the given (status, body) pairs in order; the last one repeats.
    convenience init(script: [(Int, Data)]) {
        self.init { _, index in script[min(index, script.count - 1)] }
    }

    convenience init(status: Int, body: Data) { self.init(script: [(status, body)]) }

    var requests: [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let index: Int = {
            lock.lock()
            defer { lock.unlock() }
            recorded.append(request)
            return recorded.count - 1
        }()
        let (status, body) = try await handler(request, index)
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (body, response)
    }
}

extension URLRequest {
    var bodyJSON: [String: Any]? {
        guard let httpBody else { return nil }
        return (try? JSONSerialization.jsonObject(with: httpBody)) as? [String: Any]
    }
    func header(_ name: String) -> String? { value(forHTTPHeaderField: name) }
}

func envelope(_ data: String, code: Int = 200) -> Data {
    Data(#"{"success":true,"message":"OK","code":\#(code),"data":\#(data)}"#.utf8)
}

func errorEnvelope(_ message: String, code: Int) -> Data {
    Data(#"{"success":false,"message":"\#(message)","code":\#(code),"data":null}"#.utf8)
}

func authEnvelope(access: String, refresh: String) -> Data {
    envelope(
        #"{"accessToken":"\#(access)","refreshToken":"\#(refresh)","user":{"id":"1","email":"a@b.c","firstName":null,"lastName":null,"enabled":true,"emailNotificationsEnabled":false,"role":"user","navPreferences":null}}"#
    )
}

/// Thread-safe counter for single-flight assertions.
final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    @discardableResult func increment() -> Int {
        lock.lock()
        defer { lock.unlock() }
        value += 1
        return value
    }
    var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}
