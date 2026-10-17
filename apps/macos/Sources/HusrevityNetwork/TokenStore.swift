import Foundation

/// Access + refresh token, always stored and replaced together. Redacts itself when printed so a
/// stray `print`/log/assertion message cannot leak credentials.
public struct TokenPair: Sendable, Equatable, CustomStringConvertible, CustomDebugStringConvertible {
    public var accessToken: String
    public var refreshToken: String

    public init(accessToken: String, refreshToken: String) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
    }

    public var description: String { "TokenPair(<redacted>)" }
    public var debugDescription: String { description }
}

public protocol TokenStore: Sendable {
    /// The stored pair, or nil when signed out (or the store is unreadable).
    func load() async -> TokenPair?
    func save(_ tokens: TokenPair) async throws
    func clear() async
}

public actor InMemoryTokenStore: TokenStore {
    private var tokens: TokenPair?

    public init() {}

    public init(access: String, refresh: String) {
        tokens = TokenPair(accessToken: access, refreshToken: refresh)
    }

    public func load() -> TokenPair? { tokens }
    public func save(_ tokens: TokenPair) { self.tokens = tokens }
    public func clear() { tokens = nil }
}
