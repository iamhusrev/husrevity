import Foundation

/// The one seam between the API client and the network. Tests replace it with a scripted fake.
public protocol HTTPTransport: Sendable {
    /// Performs the request and returns the raw body plus response. Throws only for failures that
    /// produced no HTTP response at all (offline, timeout, TLS, cancelled); any status code,
    /// including 4xx/5xx, is a normal return value.
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, http)
    }
}
