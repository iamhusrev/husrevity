import Combine
import Foundation
import HusrevityNetwork

public enum ServerChoice: String, CaseIterable, Identifiable, Equatable, Sendable {
    case production, local, custom
    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .production: return L10n.Login.production
        case .local: return L10n.Login.local
        case .custom: return L10n.Login.custom
        }
    }
}

/// Validates the form and hands `(base URL, email, password)` to the `signIn` closure, which wraps
/// `APIClient.login` (and stores the tokens) in the composition root.
@MainActor
public final class LoginViewModel: ObservableObject {
    public typealias SignIn = (_ baseURL: URL, _ email: String, _ password: String) async throws -> Void

    @Published public var email = "" { didSet { clearError() } }
    @Published public var password = "" { didSet { clearError() } }
    @Published public var server: ServerChoice { didSet { clearError() } }
    @Published public var customURL = "" { didSet { clearError() } }
    @Published public private(set) var isSubmitting = false
    @Published public private(set) var errorMessage: String?

    private let signIn: SignIn

    public init(server: ServerChoice = .production, signIn: @escaping SignIn) {
        self.server = server
        self.signIn = signIn
    }

    /// The API base URL for the current server choice, nil when a custom address is invalid.
    public var baseURL: URL? {
        switch server {
        case .production: return APIClient.productionBaseURL
        case .local: return APIClient.developmentBaseURL
        case .custom: return Self.parseCustomURL(customURL)
        }
    }

    public var canSubmit: Bool { !isSubmitting && validationError == nil }

    /// The first problem with the form, or nil when it can be submitted.
    public var validationError: String? {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return L10n.Login.emailRequired }
        if !Self.isPlausibleEmail(trimmed) { return L10n.Login.emailInvalid }
        if password.isEmpty { return L10n.Login.passwordRequired }
        if baseURL == nil { return L10n.Login.urlInvalid }
        return nil
    }

    /// Returns true when the sign-in succeeded. The password is cleared on success only, so a
    /// typo can be fixed without retyping everything.
    @discardableResult
    public func submit() async -> Bool {
        guard !isSubmitting else { return false }
        if let problem = validationError {
            errorMessage = problem
            return false
        }
        guard let url = baseURL else { return false }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await signIn(url, email.trimmingCharacters(in: .whitespacesAndNewlines), password)
            password = ""
            errorMessage = nil
            return true
        } catch is CancellationError {
            return false
        } catch {
            errorMessage = Self.message(for: error)
            return false
        }
    }

    // MARK: Mapping

    public static func message(for error: Error) -> String {
        if error is URLError { return L10n.Login.offline }
        // Errors raised by the app itself (e.g. an account mismatch) explain themselves.
        guard let api = error as? APIError else {
            return (error as? LocalizedError)?.errorDescription ?? L10n.Login.unknown
        }
        switch api {
        case .unauthorized: return L10n.Login.wrongCredentials
        case .rateLimited: return L10n.Login.rateLimited
        case .transport: return L10n.Login.offline
        case .server(let code, _): return L10n.Login.server(code)
        case .validation(let message): return L10n.Login.rejected(message)
        case .tokenStorage: return L10n.Login.storage
        case .conflict, .notFound, .decoding, .malformedSuccess: return L10n.Login.unknown
        }
    }

    // MARK: Parsing

    static func isPlausibleEmail(_ value: String) -> Bool {
        value.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
    }

    /// Accepts `http(s)://host[:port][/path]`; a bare host gets the `/api` prefix the server uses.
    public static func parseCustomURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed), let scheme = components.scheme?.lowercased(),
            scheme == "http" || scheme == "https", let host = components.host, !host.isEmpty
        else { return nil }
        var path = components.path
        while path.hasSuffix("/") { path.removeLast() }
        components.path = path.isEmpty ? "/api" : path
        components.query = nil
        components.fragment = nil
        return components.url
    }

    private func clearError() { errorMessage = nil }
}
