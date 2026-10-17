import Foundation
import HusrevityModels

/// Talks to the husrevity NestJS API. Every response is unwrapped from the
/// `{ success, message, code, data }` envelope and every failure is mapped to `APIError`.
///
/// Contract for the sync engine:
/// - Persist the `Idempotency-Key` (and the `updatedAt` used for `If-Match`) in the outbox
///   BEFORE sending a write. After a crash, a timeout or `.malformedSuccess` the engine must
///   resend with the SAME key; the server then replays the original response instead of applying
///   the write twice. A fresh key per attempt defeats idempotency.
/// - `createNoteTag` returns a `NoteTagResponse` WITHOUT `updatedAt`; pull (`sync`) afterwards to
///   obtain it.
/// - `isRetryable` errors (`transport`, `rateLimited`, `malformedSuccess`, 5xx) keep the outbox
///   entry; `conflict`, `validation` and `notFound` are permanent for that entry. Task
///   cancellation surfaces as `CancellationError`, never as an `APIError`.
public actor APIClient {
    public static let productionBaseURL = URL(string: "https://api.iamhusrev.com/api")!
    public static let developmentBaseURL = URL(string: "http://localhost:4090/api")!

    let baseURL: URL
    let transport: HTTPTransport
    let tokenStore: TokenStore
    let onSessionExpired: @Sendable () -> Void
    /// The refresh currently in flight, shared by every request that hits an expired token.
    private var refreshTask: Task<Void, Error>?

    public init(
        baseURL: URL = APIClient.productionBaseURL,
        transport: HTTPTransport = URLSessionTransport(),
        tokenStore: TokenStore,
        onSessionExpired: @escaping @Sendable () -> Void = {}
    ) {
        self.baseURL = baseURL
        self.transport = transport
        self.tokenStore = tokenStore
        self.onSessionExpired = onSessionExpired
    }

    // MARK: Auth

    @discardableResult
    public func login(email: String, password: String) async throws -> AuthResponse {
        let auth: AuthResponse = try await send(
            .init(
                method: "POST", path: "/auth/login", authenticated: false,
                body: try encode(LoginRequest(email: email, password: password))
            )
        )
        try await store(auth)
        return auth
    }

    /// Exchanges the stored refresh token for a new pair. Concurrent calls (and the automatic
    /// refresh on 401) share one network request. When the server rejects the refresh token the
    /// session is over: tokens are cleared, `onSessionExpired` fires and `.unauthorized` is thrown.
    /// Network or 5xx failures leave the session intact so the caller can retry later.
    public func refresh() async throws {
        if let running = refreshTask { return try await running.value }
        let task = Task { try await self.performRefresh() }
        refreshTask = task
        defer { refreshTask = nil }
        try await task.value
    }

    private func performRefresh() async throws {
        guard let pair = await tokenStore.load() else { throw await expireSession() }
        let spec = RequestSpec(
            method: "POST", path: "/auth/refresh", authenticated: false,
            body: try encode(RefreshRequest(refreshToken: pair.refreshToken))
        )
        do {
            let auth: AuthResponse = try await send(spec)
            try await store(auth)
        } catch let error as APIError {
            switch error {
            // Only an explicit rejection (400/401/403) ends the session. 404, 408, 429, 5xx and
            // network failures are transient: keep the tokens and let the caller retry.
            case .unauthorized, .validation: throw await expireSession()
            case .server(403, _): throw await expireSession()
            default: throw error
            }
        }
    }

    private func expireSession() async -> APIError {
        await tokenStore.clear()
        onSessionExpired()
        return .unauthorized
    }

    // MARK: Sync

    public func sync(since cursor: String?) async throws -> SyncResponse {
        var spec = RequestSpec(method: "GET", path: "/sync")
        if let cursor { spec.query = [URLQueryItem(name: "since", value: cursor)] }
        return try await send(spec)
    }

}

// MARK: - Request plumbing

struct RequestSpec {
    var method: String
    var path: String
    var query: [URLQueryItem] = []
    /// Auth endpoints neither send a bearer token nor trigger a refresh on 401.
    var authenticated = true
    var body: Data?
    var idempotencyKey: String?
    var ifMatch: Date?
}

extension APIClient {
    func encode<B: Encodable>(_ body: B) throws -> Data {
        do {
            return try APICoding.encoder.encode(body)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func store(_ auth: AuthResponse) async throws {
        do {
            try await tokenStore.save(TokenPair(accessToken: auth.accessToken, refreshToken: auth.refreshToken))
        } catch {
            throw APIError.tokenStorage(error)
        }
    }

    func send<T: Codable & Equatable & Sendable>(_ spec: RequestSpec) async throws -> T {
        let (data, response) = try await perform(spec)
        do {
            let envelope = try APICoding.decoder.decode(Envelope<T>.self, from: data)
            guard let payload = envelope.data else {
                throw DecodingError.valueNotFound(
                    T.self, .init(codingPath: [], debugDescription: "Envelope data is null")
                )
            }
            return payload
        } catch {
            // 2xx: the server processed the request, only the answer is unreadable.
            throw APIError.malformedSuccess(httpStatus: response.statusCode)
        }
    }

    /// For endpoints that answer 204 (or whose body the caller ignores).
    func sendVoid(_ spec: RequestSpec) async throws {
        _ = try await perform(spec)
    }

    /// One HTTP exchange: builds the request, sends it, maps non-2xx to `APIError`.
    func perform(_ spec: RequestSpec) async throws -> (Data, HTTPURLResponse) {
        let usedToken = spec.authenticated ? await tokenStore.load()?.accessToken : nil
        var (data, response) = try await exchange(try makeRequest(spec, accessToken: usedToken))

        // Like the web client: 401 and 403 mean "try a fresh token", once, never for /auth/*.
        if spec.authenticated, response.statusCode == 401 || response.statusCode == 403 {
            // If another request already replaced the token while this one was in flight, the
            // failure belongs to the old token: retry with the current one instead of refreshing.
            let current = await tokenStore.load()?.accessToken
            if current == nil || current == usedToken {
                try await refresh()
            }
            let fresh = await tokenStore.load()?.accessToken
            (data, response) = try await exchange(try makeRequest(spec, accessToken: fresh))
        }
        guard (200..<300).contains(response.statusCode) else {
            throw Self.error(status: response.statusCode, body: data)
        }
        return (data, response)
    }

    func makeRequest(_ spec: RequestSpec, accessToken: String?) throws -> URLRequest {
        guard var components = URLComponents(string: baseURL.absoluteString + spec.path) else {
            throw APIError.transport(URLError(.badURL))
        }
        if !spec.query.isEmpty { components.queryItems = spec.query }
        guard let url = components.url else { throw APIError.transport(URLError(.badURL)) }

        var request = URLRequest(url: url)
        request.httpMethod = spec.method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body = spec.body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let accessToken { request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization") }
        if let key = spec.idempotencyKey { request.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
        if let ifMatch = spec.ifMatch {
            request.setValue(String(ifMatch.epochMilliseconds), forHTTPHeaderField: "If-Match")
        }
        return request
    }

    private func exchange(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            return try await transport.send(request)
        } catch let error as APIError {
            throw error
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            // The surrounding task was cancelled: not a network failure, nothing to retry.
            throw CancellationError()
        } catch {
            throw APIError.transport(error)
        }
    }

    static func error(status: Int, body: Data) -> APIError {
        struct ErrorBody: Decodable { var message: String? }
        let message =
            (try? JSONDecoder().decode(ErrorBody.self, from: body))?.message
            ?? "HTTP \(status)"
        switch status {
        case 401: return .unauthorized
        case 404: return .notFound
        case 409: return .conflict(message)
        case 400, 422: return .validation(message)
        case 429: return .rateLimited
        default: return .server(code: status, message: message)
        }
    }
}
