import Foundation

/// Keeps one local database bound to one account on one server.
///
/// The store holds server ids, a sync cursor and queued writes that only make sense for the server
/// they came from. Signing in with another account, or the same email against another server,
/// would push those writes to the wrong place (updates 404, the engine then discards the local
/// rows). So sign-in is refused instead of mixing data.
public enum AccountGuard {
    public enum Mismatch: LocalizedError, Equatable {
        case account(existing: String, databasePath: String)
        case server(existing: String, databasePath: String)

        public var errorDescription: String? {
            switch self {
            case .account(let existing, let path):
                return "Bu cihazdaki veri \(existing) hesabına ait. Başka bir hesapla girmek için önce \(path) dosyasını yedekleyip silin."
            case .server(let existing, let path):
                return "Bu cihazdaki veri \(existing) sunucusuna ait. Başka bir sunucuya bağlanmak için önce \(path) dosyasını yedekleyip silin."
            }
        }
    }

    /// Throws `Mismatch` when the attempted sign-in does not belong to the stored binding. Nothing
    /// stored yet (first sign-in), or an account stored without a server (older config), is allowed.
    public static func check(
        storedEmail: String?, storedServer: URL?, email: String, server: URL, databasePath: String
    ) throws {
        guard let storedEmail else { return }
        if storedEmail.caseInsensitiveCompare(email) != .orderedSame {
            throw Mismatch.account(existing: storedEmail, databasePath: databasePath)
        }
        if let storedServer, normalized(storedServer) != normalized(server) {
            throw Mismatch.server(existing: storedServer.absoluteString, databasePath: databasePath)
        }
    }

    /// Scheme and host are case-insensitive and a trailing slash does not change the endpoint.
    static func normalized(_ url: URL) -> String {
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url.absoluteString
        }
        parts.scheme = parts.scheme?.lowercased()
        parts.host = parts.host?.lowercased()
        while parts.path.hasSuffix("/") { parts.path.removeLast() }
        return parts.string ?? url.absoluteString
    }
}
