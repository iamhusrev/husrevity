import Foundation

/// Everything the API client can throw. The sync engine branches on these:
/// `transport` and other `isRetryable` cases mean "try again later, keep the outbox entry";
/// `conflict` means the server holds a newer version; `validation`/`notFound` are permanent.
public enum APIError: Error, Sendable {
    /// HTTP 401, or a failed/impossible token refresh. Tokens are already cleared.
    case unauthorized
    /// HTTP 409: the `If-Match` precondition failed (stale `updatedAt`).
    case conflict(String)
    case notFound
    /// HTTP 400 (or 422); the message is the server's explanation.
    case validation(String)
    case rateLimited
    /// Any other non-2xx status (5xx, and 403 once a refresh did not help).
    case server(code: Int, message: String)
    /// No HTTP response was received (offline, timeout, TLS, DNS).
    case transport(Error)
    /// Request-side encoding failure (a body that could not be serialised).
    case decoding(Error)
    /// A 2xx response whose body was missing or not the expected envelope. The server has
    /// almost certainly applied the request, so this is retryable: repeat it with the SAME
    /// `Idempotency-Key` and the server replays the original response.
    case malformedSuccess(httpStatus: Int)
    /// The token store refused to persist or read tokens.
    case tokenStorage(Error)

    /// True when repeating the same request later may succeed.
    public var isRetryable: Bool {
        switch self {
        case .transport, .rateLimited, .malformedSuccess: return true
        case .server(let code, _): return code >= 500 || code == 408
        case .unauthorized, .conflict, .notFound, .validation, .decoding, .tokenStorage: return false
        }
    }
}

extension APIError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .unauthorized: return "Not signed in or the session expired."
        case .conflict(let message): return "Conflict: \(message)"
        case .notFound: return "Not found."
        case .validation(let message): return "Invalid request: \(message)"
        case .rateLimited: return "Too many requests."
        case .server(let code, let message): return "Server error \(code): \(message)"
        case .transport(let error): return "Network failure: \(error.localizedDescription)"
        case .decoding: return "Could not encode the request."
        case .malformedSuccess: return "The server answered with an unreadable response."
        case .tokenStorage: return "Could not access stored credentials."
        }
    }
}
