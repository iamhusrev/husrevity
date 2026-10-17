import Foundation

/// Mirrors `LoginRequestDto` (apps/api/src/auth/dto/auth-dtos.ts).
public struct LoginRequest: Codable, Equatable, Sendable {
    public var email: String
    public var password: String

    public init(email: String, password: String) {
        self.email = email
        self.password = password
    }
}

/// Mirrors `RefreshRequestDto`.
public struct RefreshRequest: Codable, Equatable, Sendable {
    public var refreshToken: String

    public init(refreshToken: String) { self.refreshToken = refreshToken }
}
