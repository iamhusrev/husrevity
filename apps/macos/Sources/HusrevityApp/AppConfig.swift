import Foundation
import HusrevityCore

/// Persisted preferences and file locations. Environment variables override them so the smoke and
/// end-to-end runs never touch the user's real database or Keychain.
struct AppConfig {
    static let productionURL = APIClient.productionBaseURL
    private let defaults: UserDefaults
    private let environment: [String: String]

    init(defaults: UserDefaults = .standard, environment: [String: String] = ProcessInfo.processInfo.environment) {
        self.defaults = defaults
        self.environment = environment
    }

    var serverURL: URL {
        get {
            if let raw = environment["HUSREVITY_API_URL"], let url = URL(string: raw) { return url }
            return defaults.string(forKey: "serverURL").flatMap(URL.init(string:)) ?? Self.productionURL
        }
        nonmutating set { defaults.set(newValue.absoluteString, forKey: "serverURL") }
    }

    var webBaseURL: URL? {
        get { defaults.string(forKey: "webBaseURL").flatMap(URL.init(string:)) }
        nonmutating set { defaults.set(newValue?.absoluteString, forKey: "webBaseURL") }
    }

    /// The account this device's local database belongs to. A different account must not be mixed
    /// into the same database, so sign-in refuses a mismatch (see `AppContainer`).
    var userEmail: String? {
        get { defaults.string(forKey: "userEmail") }
        nonmutating set { defaults.set(newValue, forKey: "userEmail") }
    }

    /// This Mac only, or synced with a server. Unset on a fresh install (the first-run question
    /// decides). An install that already signed in before modes existed keeps syncing.
    var syncMode: SyncMode {
        get {
            if let raw = defaults.string(forKey: "syncMode"), let mode = SyncMode(rawValue: raw) { return mode }
            return userEmail != nil ? .sync : .undecided
        }
        nonmutating set { defaults.set(newValue.rawValue, forKey: "syncMode") }
    }

    /// The server the local database's ids and cursor came from (set at the first sign-in).
    var boundServer: URL? {
        get { defaults.string(forKey: "boundServer").flatMap(URL.init(string:)) }
        nonmutating set { defaults.set(newValue?.absoluteString, forKey: "boundServer") }
    }

    var databaseURL: URL {
        if let raw = environment["HUSREVITY_DB_PATH"] { return URL(fileURLWithPath: raw) }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Husrevity", isDirectory: true).appendingPathComponent("husrevity.sqlite")
    }
}
