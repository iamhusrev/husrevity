import Foundation
import HusrevityCore
import XCTest

// Shared plumbing for the end-to-end tests. They talk to a REAL API (started by scripts/e2e.sh) with a
// REAL LocalStore on a temp SQLite file, a REAL APIClient and a REAL SyncEngine. The only fake is the
// network seam: `ControllableTransport` can pretend to be offline or lose responses.

// MARK: - Configuration

struct E2EConfig {
    /// API base URL including the `/api` prefix, e.g. `http://127.0.0.1:51234/api`.
    let baseURL: URL
    let email: String
    let password: String

    static func load() throws -> E2EConfig {
        let env = ProcessInfo.processInfo.environment
        guard let raw = env["HUSREVITY_E2E_URL"], let url = URL(string: raw) else {
            throw XCTSkip("HUSREVITY_E2E_URL is not set: run apps/macos/scripts/e2e.sh")
        }
        return E2EConfig(
            baseURL: url, email: env["HUSREVITY_E2E_EMAIL"] ?? "", password: env["HUSREVITY_E2E_PASSWORD"] ?? "")
    }
}

/// The API throttles per client IP and trusts one `X-Forwarded-For` hop. Giving every test device its
/// own address keeps the shared 100 req/min and 20 auth/min budgets from coupling unrelated tests.
enum FakeIP {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var counter = Int.random(in: 0..<50_000)

    static func next() -> String {
        lock.lock()
        defer { lock.unlock() }
        counter += 1
        return "10.\(100 + (counter / 65_000) % 100).\((counter / 250) % 250).\(counter % 250 + 1)"
    }
}

// MARK: - Controllable transport

/// Wraps the real `URLSessionTransport`. Modes:
/// - offline: throws `URLError(.notConnectedToInternet)` WITHOUT sending anything,
/// - response lost: forwards the request to the real server, then throws
///   `URLError(.networkConnectionLost)` instead of returning the response.
final class ControllableTransport: HTTPTransport, @unchecked Sendable {
    enum Outcome: Equatable {
        case delivered(Int)
        case offline
        case responseLost(Int)
        case failed
    }

    struct Exchange {
        var method: String
        var path: String  // path after the /api prefix, without query
        var query: String?
        var idempotencyKey: String?
        var ifMatch: String?
        var outcome: Outcome

        var status: Int? {
            switch outcome {
            case .delivered(let code), .responseLost(let code): return code
            case .offline, .failed: return nil
            }
        }
    }

    private struct DropRule {
        var matches: @Sendable (URLRequest) -> Bool
        var remaining: Int
    }

    private let inner = URLSessionTransport(session: URLSession(configuration: .ephemeral))
    private let forwardedFor: String
    private let lock = NSLock()
    private var online = true
    private var dropRules: [DropRule] = []
    private var exchanges: [Exchange] = []

    init(forwardedFor: String = FakeIP.next()) {
        self.forwardedFor = forwardedFor
    }

    func goOffline() { lock.locked { online = false } }
    func goOnline() { lock.locked { online = true } }

    /// The next `count` requests matching `predicate` reach the server but their response is lost.
    func dropResponses(count: Int = 1, where predicate: @escaping @Sendable (URLRequest) -> Bool) {
        lock.locked { dropRules.append(DropRule(matches: predicate, remaining: count)) }
    }

    var log: [Exchange] { lock.locked { exchanges } }
    func resetLog() { lock.locked { exchanges.removeAll() } }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (isOnline, shouldDrop): (Bool, Bool) = lock.locked {
            guard online else { return (false, false) }
            if let index = dropRules.firstIndex(where: { $0.remaining > 0 && $0.matches(request) }) {
                dropRules[index].remaining -= 1
                return (true, true)
            }
            return (true, false)
        }
        var exchange = Exchange(
            method: request.httpMethod ?? "GET", path: Self.apiPath(request.url), query: request.url?.query,
            idempotencyKey: request.value(forHTTPHeaderField: "Idempotency-Key"),
            ifMatch: request.value(forHTTPHeaderField: "If-Match"), outcome: .failed)
        guard isOnline else {
            exchange.outcome = .offline
            record(exchange)
            throw URLError(.notConnectedToInternet)
        }
        var outgoing = request
        outgoing.setValue(forwardedFor, forHTTPHeaderField: "X-Forwarded-For")
        do {
            let (data, response) = try await inner.send(outgoing)
            if shouldDrop {
                exchange.outcome = .responseLost(response.statusCode)
                record(exchange)
                throw URLError(.networkConnectionLost)
            }
            exchange.outcome = .delivered(response.statusCode)
            record(exchange)
            return (data, response)
        } catch {
            if case .failed = exchange.outcome { record(exchange) }
            throw error
        }
    }

    private func record(_ exchange: Exchange) { lock.locked { exchanges.append(exchange) } }

    private static func apiPath(_ url: URL?) -> String {
        guard let path = url?.path else { return "?" }
        return path.hasPrefix("/api") ? String(path.dropFirst(4)) : path
    }
}

extension URLRequest {
    /// True for `method` requests whose path (after `/api`) equals `path`.
    func isCall(_ method: String, _ path: String) -> Bool {
        httpMethod == method && url?.path.hasSuffix("/api" + path) == true
    }
}

// MARK: - Raw HTTP client (the "second device" and the server-side oracle)

struct RawResponse {
    let status: Int
    let json: Any?

    var envelope: [String: Any] { json as? [String: Any] ?? [:] }
    var data: Any? { envelope["data"] }
    var object: [String: Any] { data as? [String: Any] ?? [:] }
    var array: [[String: Any]] { data as? [[String: Any]] ?? [] }
    var message: String { envelope["message"] as? String ?? "" }
}

/// A plain URLSession client that knows nothing about LocalStore or SyncEngine. Used to arrange state
/// "on another device" and to check what the server really holds.
final class RawClient: @unchecked Sendable {
    let baseURL: URL
    private let session = URLSession(configuration: .ephemeral)
    private let forwardedFor = FakeIP.next()
    private let lock = NSLock()
    private var accessToken: String?
    private(set) var refreshToken: String?

    init(baseURL: URL) { self.baseURL = baseURL }

    var token: String? { lock.locked { accessToken } }

    @discardableResult
    func register(email: String, password: String) async throws -> RawResponse {
        let response = try await request(
            "POST", "/auth/register", body: ["email": email, "password": password, "firstName": "E2E"],
            authenticated: false)
        try adoptTokens(from: response)
        return response
    }

    @discardableResult
    func login(email: String, password: String) async throws -> RawResponse {
        let response = try await request(
            "POST", "/auth/login", body: ["email": email, "password": password], authenticated: false)
        try adoptTokens(from: response)
        return response
    }

    private func adoptTokens(from response: RawResponse) throws {
        guard let access = response.object["accessToken"] as? String,
            let refresh = response.object["refreshToken"] as? String
        else { throw E2EError.unexpected("auth answered HTTP \(response.status): \(response.message)") }
        lock.locked {
            accessToken = access
            refreshToken = refresh
        }
    }

    func get(_ path: String) async throws -> RawResponse { try await request("GET", path) }
    func post(_ path: String, _ body: [String: Any]? = nil) async throws -> RawResponse {
        try await request("POST", path, body: body)
    }
    func put(_ path: String, _ body: [String: Any]) async throws -> RawResponse {
        try await request("PUT", path, body: body)
    }
    func patch(_ path: String, _ body: [String: Any]) async throws -> RawResponse {
        try await request("PATCH", path, body: body)
    }
    func delete(_ path: String) async throws -> RawResponse { try await request("DELETE", path) }

    func request(
        _ method: String, _ path: String, body: [String: Any]? = nil, authenticated: Bool = true
    ) async throws -> RawResponse {
        var request = URLRequest(url: URL(string: baseURL.absoluteString + path)!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(forwardedFor, forHTTPHeaderField: "X-Forwarded-For")
        if authenticated, let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = data.isEmpty ? nil : try? JSONSerialization.jsonObject(with: data)
        return RawResponse(status: status, json: json)
    }

    // Conveniences that insist on success.

    func createNote(title: String, body: String? = nil, tagIds: [String] = []) async throws -> [String: Any] {
        var payload: [String: Any] = ["title": title, "tagIds": tagIds]
        if let body { payload["bodyMarkdown"] = body }
        return try expect(201, try await post("/notes", payload)).object
    }

    func createTag(name: String) async throws -> [String: Any] {
        try expect(201, try await post("/note-tags", ["name": name])).object
    }

    func createItem(title: String, extra: [String: Any] = [:]) async throws -> [String: Any] {
        var payload: [String: Any] = ["kind": "task", "title": title]
        payload.merge(extra) { _, new in new }
        return try expect(201, try await post("/items", payload)).object
    }

    func createProject(code: String, name: String) async throws -> [String: Any] {
        try expect(201, try await post("/projects", ["code": code, "name": name])).object
    }

    @discardableResult
    func expect(_ status: Int, _ response: RawResponse, file: StaticString = #filePath, line: UInt = #line) throws
        -> RawResponse
    {
        guard response.status == status else {
            throw E2EError.unexpected("expected HTTP \(status), got \(response.status): \(response.message)")
        }
        return response
    }
}

enum E2EError: Error, CustomStringConvertible {
    case unexpected(String)
    case timeout(String)
    var description: String {
        switch self {
        case .unexpected(let message), .timeout(let message): return message
        }
    }
}

// MARK: - Test case base

/// One isolated "device + account" per test: a fresh user, a fresh SQLite file, its own transport.
class E2ECase: XCTestCase {
    var config: E2EConfig!
    var directory: URL!
    /// A unique prefix for every title created by this test.
    var uid: String!
    var email: String!
    var password: String!

    var raw: RawClient!
    var store: LocalStore!
    var transport: ControllableTransport!
    var tokenStore: InMemoryTokenStore!
    var client: APIClient!
    var engine: SyncEngine!
    private(set) var sessionExpiredCount = 0
    private let expiredLock = NSLock()

    override func setUp() async throws {
        try await super.setUp()
        config = try E2EConfig.load()
        uid = "e2e-" + UUID().uuidString.prefix(8).lowercased()
        email = "\(uid!)@example.test"
        password = UUID().uuidString + "-Aa1"
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("husrevity-\(uid!)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        raw = RawClient(baseURL: config.baseURL)
        try await raw.register(email: email, password: password)

        store = try LocalStore(path: directory.appendingPathComponent("local.sqlite").path)
        transport = ControllableTransport()
        tokenStore = InMemoryTokenStore()
        client = APIClient(
            baseURL: config.baseURL, transport: transport, tokenStore: tokenStore,
            onSessionExpired: { [weak self] in self?.noteSessionExpired() })
        try await client.login(email: email, password: password)
        engine = makeEngine(store: store, api: client)
        transport.resetLog()
    }

    override func tearDown() async throws {
        if let directory {
            // The directory was created by this test with only its own SQLite files in it.
            try? FileManager.default.removeItem(at: directory)
        }
        try await super.tearDown()
    }

    private func noteSessionExpired() { expiredLock.locked { sessionExpiredCount += 1 } }

    func makeEngine(store: LocalStore, api: any SyncAPI) -> SyncEngine {
        SyncEngine(store: store, api: api, serverID: { entity, localId in
            try store.serverId(entity: entity, localId: localId)
        })
    }

    // Local store lookups

    func localNote(titled title: String) throws -> NoteRecord {
        let all = try store.notes(archived: false) + store.notes(archived: true)
        return try XCTUnwrap(all.first { $0.title == title }, "no local note titled \(title)")
    }

    func localNote(serverId: String) throws -> NoteRecord? {
        try (store.notes(archived: false) + store.notes(archived: true)).first { $0.serverId == serverId }
    }

    func localItem(titled title: String) throws -> ItemRecord {
        try XCTUnwrap(try store.items().first { $0.title == title }, "no local item titled \(title)")
    }

    func localProject(named name: String) throws -> ProjectRecord {
        let all = try store.projects(archived: false) + store.projects(archived: true)
        return try XCTUnwrap(all.first { $0.name == name }, "no local project named \(name)")
    }

    func localTag(named name: String) throws -> NoteTagRecord {
        try XCTUnwrap(try store.tags().first { $0.name == name }, "no local tag named \(name)")
    }

    /// A project code unique per test (the API requires `[A-Za-z0-9_-]`, max 32 chars).
    func projectCode(_ suffix: String = "P") -> String {
        String((uid.replacingOccurrences(of: "e2e-", with: "") + suffix).prefix(32))
    }

    /// Syncs until the outbox is empty and a pull happened; bounded, no sleeping. Returns the last outcome.
    @discardableResult
    func syncUntilDrained(maxRuns: Int = 12, file: StaticString = #filePath, line: UInt = #line) async throws
        -> SyncOutcome
    {
        var last = await engine.syncNow()
        var runs = 1
        while (try store.outboxCount() > 0 || last.result != .synced) && runs < maxRuns {
            last = await engine.syncNow()
            runs += 1
        }
        XCTAssertEqual(last.result, .synced, "did not settle within \(maxRuns) runs", file: file, line: line)
        XCTAssertEqual(try store.outboxCount(), 0, "outbox not drained", file: file, line: line)
        return last
    }

    // Server-side oracle helpers

    func serverNotes(archived: Bool = false) async throws -> [[String: Any]] {
        try raw.expect(200, try await raw.get("/notes?archived=\(archived)")).array
    }

    func serverNote(_ id: String) async throws -> RawResponse { try await raw.get("/notes/\(id)") }
    func serverItem(_ id: String) async throws -> RawResponse { try await raw.get("/items/\(id)") }
    func serverProject(_ id: String) async throws -> RawResponse { try await raw.get("/projects/\(id)") }
    func serverTags() async throws -> [[String: Any]] { try raw.expect(200, try await raw.get("/note-tags")).array }
    func serverProjects() async throws -> [[String: Any]] { try raw.expect(200, try await raw.get("/projects")).array }

    /// Everything the server holds for this user, through the same endpoint the client pulls from.
    func serverSnapshot() async throws -> [String: Any] {
        try raw.expect(200, try await raw.get("/sync")).object
    }
}

extension NSLock {
    func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock()
        defer { unlock() }
        return try body()
    }
}

func ids(_ rows: [[String: Any]]) -> [String] { rows.compactMap { $0["id"] as? String } }

/// ISO-8601 with milliseconds, UTC, the format the API emits.
func isoString(_ date: Date) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: date)
}

func isoDate(_ string: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = f.date(from: string) { return date }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: string)
}
