import Combine
import Foundation

/// Modules that exist only on the web; the app offers "Web'de aç" for them.
public enum WebModule: String, CaseIterable, Identifiable, Equatable, Sendable {
    case vault, learning, sport, routine

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .vault: return L10n.WebModule.vault
        case .learning: return L10n.WebModule.learning
        case .sport: return L10n.WebModule.sport
        case .routine: return L10n.WebModule.routine
        }
    }

    /// Path on the web app.
    public var path: String {
        switch self {
        case .vault: return "/vault"
        case .learning: return "/learning"
        case .sport: return "/sport"
        case .routine: return "/evkat"
        }
    }

    public var iconName: String {
        switch self {
        case .vault: return "lock.shield"
        case .learning: return "book"
        case .sport: return "figure.run"
        case .routine: return "repeat"
        }
    }
}

public struct WebLink: Identifiable, Equatable {
    public var module: WebModule
    public var url: URL
    public var title: String { module.title }
    public var id: String { module.id }
}

/// Settings: server and account info, the web address for "Web'de aç" links, and sign out.
@MainActor
public final class SettingsViewModel: ObservableObject {
    @Published public var webAddressText: String
    @Published public private(set) var webBaseURL: URL?
    @Published public private(set) var errorMessage: String?
    @Published public private(set) var isSignedOut = false

    public let serverURL: URL
    public let userEmail: String?

    private let saveWebBaseURL: (URL?) -> Void
    private let signOutAction: () async -> Void

    public init(
        serverURL: URL, userEmail: String?, webBaseURL: URL?, saveWebBaseURL: @escaping (URL?) -> Void,
        signOut: @escaping () async -> Void
    ) {
        self.serverURL = serverURL
        self.userEmail = userEmail
        let normalised = webBaseURL.flatMap { Self.normalise($0) }
        self.webBaseURL = normalised
        self.webAddressText = normalised?.absoluteString ?? ""
        self.saveWebBaseURL = saveWebBaseURL
        self.signOutAction = signOut
    }

    public var serverDisplay: String {
        let host = serverURL.host ?? serverURL.absoluteString
        return serverURL.port.map { "\(host):\($0)" } ?? host
    }

    // MARK: Web links

    public var canOpenInWeb: Bool { webBaseURL != nil }

    /// One link per web-only module; empty while no web address is configured.
    public var webLinks: [WebLink] {
        WebModule.allCases.compactMap { module in webURL(for: module).map { WebLink(module: module, url: $0) } }
    }

    public func webURL(for module: WebModule) -> URL? { webURL(path: module.path) }

    /// `path` appended to the web address, or nil when none is set.
    public func webURL(path: String) -> URL? {
        guard let base = webBaseURL else { return nil }
        let clean = path.hasPrefix("/") ? path : "/" + path
        return URL(string: base.absoluteString + clean)
    }

    /// Validates and stores the address. An empty field removes it.
    @discardableResult
    public func saveWebAddress() -> Bool {
        let trimmed = webAddressText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            webBaseURL = nil
            webAddressText = ""
            errorMessage = nil
            saveWebBaseURL(nil)
            return true
        }
        guard let url = Self.parse(trimmed) else {
            errorMessage = L10n.Settings.webAddressInvalid
            return false
        }
        webBaseURL = url
        webAddressText = url.absoluteString
        errorMessage = nil
        saveWebBaseURL(url)
        return true
    }

    // MARK: Sign out

    public func signOut() async {
        guard !isSignedOut else { return }
        isSignedOut = true
        await signOutAction()
    }

    public func dismissError() { errorMessage = nil }

    // MARK: Parsing

    /// `https://` is assumed for a bare host. Only http(s) with a host is accepted.
    static func parse(_ raw: String) -> URL? {
        let withScheme = raw.contains("://") || raw.hasPrefix("javascript:") ? raw : "https://" + raw
        guard let components = URLComponents(string: withScheme), let url = components.url else { return nil }
        return normalise(url)
    }

    static func normalise(_ url: URL) -> URL? {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let scheme = components.scheme?.lowercased(), scheme == "http" || scheme == "https",
            let host = components.host, host.contains(".") || host == "localhost"
        else { return nil }
        var path = components.path
        while path.hasSuffix("/") { path.removeLast() }
        components.path = path
        components.query = nil
        components.fragment = nil
        return components.url
    }
}
