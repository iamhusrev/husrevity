import Foundation
import Security

/// Persists the token pair as one generic-password item, so access and refresh token can never
/// be out of step. The item is readable after the first unlock so background sync keeps working.
public struct KeychainTokenStore: TokenStore {
    public static let defaultService = "com.husrevity.mac"

    public struct KeychainError: Error, LocalizedError, Sendable {
        public let status: OSStatus
        public var errorDescription: String? { "Keychain operation failed (OSStatus \(status))." }
    }

    private let service: String
    private let account = "session"

    public init(service: String = KeychainTokenStore.defaultService) {
        self.service = service
    }

    private var identity: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    public func load() async -> TokenPair? {
        var query = identity
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
            let data = result as? Data
        else { return nil }
        return try? JSONDecoder().decode(Stored.self, from: data).pair
    }

    public func save(_ tokens: TokenPair) async throws {
        let data = try JSONEncoder().encode(Stored(tokens))
        let update = [kSecValueData as String: data]
        var status = SecItemUpdate(identity as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = identity
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            status = SecItemAdd(add as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    public func clear() async {
        SecItemDelete(identity as CFDictionary)
    }

    private struct Stored: Codable {
        var accessToken: String
        var refreshToken: String

        init(_ pair: TokenPair) {
            accessToken = pair.accessToken
            refreshToken = pair.refreshToken
        }

        var pair: TokenPair { TokenPair(accessToken: accessToken, refreshToken: refreshToken) }
    }
}
