import Combine
import Foundation
import HusrevityNetwork
import HusrevityStore
import HusrevitySync

/// The sidebar entries, in display order.
public enum AppSection: String, CaseIterable, Identifiable, Equatable, Sendable {
    case today, inbox, calendar, projects, notes, goals, settings

    public var id: String { rawValue }

    /// Sections shown above the divider; settings sits at the bottom.
    public static let mainSections: [AppSection] = [.today, .inbox, .calendar, .projects, .notes, .goals]

    public var title: String {
        switch self {
        case .today: return L10n.Nav.today
        case .inbox: return L10n.Nav.inbox
        case .calendar: return L10n.Nav.calendar
        case .projects: return L10n.Nav.projects
        case .notes: return L10n.Nav.notes
        case .goals: return L10n.Nav.goals
        case .settings: return L10n.Nav.settings
        }
    }

    /// SF Symbol name.
    public var iconName: String {
        switch self {
        case .today: return "sun.max"
        case .inbox: return "tray"
        case .calendar: return "calendar"
        case .projects: return "folder"
        case .notes: return "note.text"
        case .goals: return "target"
        case .settings: return "gearshape"
        }
    }
}

/// Everything the composition root (the app entry) provides to the UI layer. Only closures and
/// plain values, so the UI never touches the network or the sync engine directly.
public struct UIDependencies {
    public var store: LocalStore
    public var parser: QuickAddParsing
    public var expander: RecurrenceExpanding
    public var context: DateContext
    /// Called after every local write (wraps `SyncCoordinator.notifyLocalChange()`).
    public var notifyLocalChange: LocalChangeNotifier
    /// A fresh stream per call (wraps `SyncCoordinator.status`).
    public var statuses: () -> AsyncStream<SyncStatus>
    /// Wraps `SyncCoordinator.syncNow()`.
    public var syncNow: () async -> Void
    /// Wraps `SyncEngine.resolveConflict(id:keepLocal:)` (and ignores the outcome).
    public var resolveConflict: ConflictsViewModel.Resolve
    /// Logs in against the given API base URL and stores the tokens (wraps `APIClient.login`).
    public var signIn: LoginViewModel.SignIn
    /// Runs after a successful sign-in (wraps `SyncCoordinator.resumeAfterSignIn()`).
    public var didSignIn: () async -> Void
    /// Clears tokens and local session state.
    public var signOut: () async -> Void
    public var serverURL: URL
    public var userEmail: String?
    public var webBaseURL: URL?
    public var saveWebBaseURL: (URL?) -> Void
    public var isSignedIn: Bool
    /// Whether this install talks to a server (see `SyncMode`).
    public var syncMode: SyncMode
    /// Persists the mode (UserDefaults in the app).
    public var saveSyncMode: (SyncMode) -> Void
    /// Starts the sync coordinator (no-op until a server session exists; it asks for login itself).
    public var startSync: () async -> Void
    /// Stops the sync coordinator without touching tokens or data.
    public var stopSync: () async -> Void

    public init(
        store: LocalStore, parser: QuickAddParsing, expander: RecurrenceExpanding, context: DateContext = DateContext(),
        notifyLocalChange: @escaping LocalChangeNotifier, statuses: @escaping () -> AsyncStream<SyncStatus>,
        syncNow: @escaping () async -> Void, resolveConflict: @escaping ConflictsViewModel.Resolve,
        signIn: @escaping LoginViewModel.SignIn, didSignIn: @escaping () async -> Void,
        signOut: @escaping () async -> Void, serverURL: URL, userEmail: String?, webBaseURL: URL?,
        saveWebBaseURL: @escaping (URL?) -> Void, isSignedIn: Bool,
        syncMode: SyncMode = .sync, saveSyncMode: @escaping (SyncMode) -> Void = { _ in },
        startSync: @escaping () async -> Void = {}, stopSync: @escaping () async -> Void = {}
    ) {
        self.syncMode = syncMode
        self.saveSyncMode = saveSyncMode
        self.startSync = startSync
        self.stopSync = stopSync
        self.store = store
        self.parser = parser
        self.expander = expander
        self.context = context
        self.notifyLocalChange = notifyLocalChange
        self.statuses = statuses
        self.syncNow = syncNow
        self.resolveConflict = resolveConflict
        self.signIn = signIn
        self.didSignIn = didSignIn
        self.signOut = signOut
        self.serverURL = serverURL
        self.userEmail = userEmail
        self.webBaseURL = webBaseURL
        self.saveWebBaseURL = saveWebBaseURL
        self.isSignedIn = isSignedIn
    }
}

/// Owns one instance of every view model and the session state shared between screens.
@MainActor
public final class AppViewModels: ObservableObject {
    @Published public var selection: AppSection = .today
    @Published public private(set) var isSignedIn: Bool
    @Published public private(set) var syncMode: SyncMode
    @Published public private(set) var settings: SettingsViewModel

    public let today: TodayViewModel
    public let inbox: InboxViewModel
    public let calendar: CalendarViewModel
    public let notes: NotesViewModel
    public let projects: ProjectsViewModel
    public let goals: GoalsViewModel
    public let conflicts: ConflictsViewModel
    public let syncStatus: SyncStatusViewModel
    public private(set) var login: LoginViewModel!

    private let dependencies: UIDependencies
    private var serverURL: URL
    private var userEmail: String?
    private var webBaseURL: URL?
    private var started = false
    /// True once the user signed in again after the latest session expiry.
    private var sessionRenewed = false
    private var cancellables: Set<AnyCancellable> = []

    public init(dependencies: UIDependencies) {
        self.dependencies = dependencies
        self.isSignedIn = dependencies.isSignedIn
        self.syncMode = dependencies.syncMode
        self.serverURL = dependencies.serverURL
        self.userEmail = dependencies.userEmail
        self.webBaseURL = dependencies.webBaseURL
        let notify = dependencies.notifyLocalChange
        let context = dependencies.context
        let store = dependencies.store

        today = TodayViewModel(
            store: store, expander: dependencies.expander, context: context, notifyLocalChange: notify)
        inbox = InboxViewModel(store: store, parser: dependencies.parser, context: context, notifyLocalChange: notify)
        calendar = CalendarViewModel(
            store: store, expander: dependencies.expander, context: context, notifyLocalChange: notify)
        notes = NotesViewModel(store: store, notifyLocalChange: notify)
        projects = ProjectsViewModel(store: store, notifyLocalChange: notify)
        goals = GoalsViewModel(store: store, context: context, notifyLocalChange: notify)
        conflicts = ConflictsViewModel(
            store: store, context: context, resolve: dependencies.resolveConflict, notifyLocalChange: notify)
        syncStatus = SyncStatusViewModel(
            statuses: dependencies.statuses, syncNow: dependencies.syncNow, context: context)
        settings = Self.makeSettings(
            dependencies, serverURL: dependencies.serverURL, email: dependencies.userEmail,
            webBaseURL: dependencies.webBaseURL, owner: nil)

        login = LoginViewModel { [weak self] url, email, password in
            guard let self else { return }
            try await self.dependencies.signIn(url, email, password)
            self.completeSignIn(url: url, email: email)
            await self.dependencies.didSignIn()
        }
        settings = Self.makeSettings(
            dependencies, serverURL: serverURL, email: userEmail, webBaseURL: webBaseURL, owner: self)

        // Views observe this object for `showsLogin`, which also depends on the sync status.
        syncStatus.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &cancellables)

        // A new expiry asks for credentials again. Nothing local is touched: only the login shows,
        // pre-filled with the previous session's email and server.
        syncStatus.$status.map(\.state).removeDuplicates().sink { [weak self] state in
            guard state == .sessionExpired else { return }
            self?.sessionExpired()
        }.store(in: &cancellables)
    }

    /// First launch: ask whether to stay on this Mac or connect to a server.
    public var showsModeChoice: Bool { syncMode == .undecided }

    /// True while the user must (re-)authenticate: signed out, or the server rejected the session.
    /// Never in local mode (no account there) and never before the first-run question is answered.
    public var showsLogin: Bool { syncMode == .sync && (!isSignedIn || isSessionExpired) }

    /// Keeps everything on this Mac. Stops syncing if it was running; tokens and data stay, so
    /// turning sync back on later needs no new sign-in and loses nothing.
    public func useLocalMode() async {
        guard syncMode != .local else { return }
        let wasSyncing = syncMode == .sync
        syncMode = .local
        dependencies.saveSyncMode(.local)
        if wasSyncing { await dependencies.stopSync() }
    }

    /// Connects to a server: starts the sync coordinator, which asks for sign-in when there is no
    /// session. Everything written while in local mode is still queued and goes up now.
    public func useSyncMode() async {
        guard syncMode != .sync else { return }
        syncMode = .sync
        dependencies.saveSyncMode(.sync)
        syncStatus.restart()  // the coordinator's stop ended the previous status stream
        await dependencies.startSync()
    }

    /// The server rejected the stored session and the user has not signed in again yet.
    public var isSessionExpired: Bool { syncStatus.requiresSignIn && !sessionRenewed }

    public func start() {
        guard !started else { return }
        started = true
        today.start()
        inbox.start()
        calendar.start()
        notes.start()
        projects.start()
        goals.start()
        conflicts.start()
        syncStatus.start()
    }

    /// Call when the calendar day changes or the app becomes active again.
    public func refreshDay() {
        today.refreshDay()
    }

    /// Sidebar badge: open count for Today and Inbox, nothing elsewhere.
    public func badge(for section: AppSection) -> Int? {
        let value: Int
        switch section {
        case .today: value = today.openCount
        case .inbox: value = inbox.items.count
        default: return nil
        }
        return value > 0 ? value : nil
    }

    // MARK: Internals

    private func sessionExpired() {
        sessionRenewed = false
        if let userEmail, login.email.isEmpty { login.email = userEmail }
        switch serverURL {
        case APIClient.productionBaseURL: login.server = .production
        case APIClient.developmentBaseURL: login.server = .local
        default:
            login.server = .custom
            login.customURL = serverURL.absoluteString
        }
        objectWillChange.send()
    }

    private func completeSignIn(url: URL, email: String) {
        sessionRenewed = true
        serverURL = url
        userEmail = email
        isSignedIn = true
        settings = Self.makeSettings(
            dependencies, serverURL: url, email: email, webBaseURL: webBaseURL, owner: self)
    }

    private static func makeSettings(
        _ dependencies: UIDependencies, serverURL: URL, email: String?, webBaseURL: URL?, owner: AppViewModels?
    ) -> SettingsViewModel {
        SettingsViewModel(
            serverURL: serverURL, userEmail: email, webBaseURL: webBaseURL,
            saveWebBaseURL: { [weak owner] url in
                owner?.webBaseURL = url
                dependencies.saveWebBaseURL(url)
            },
            signOut: { [weak owner] in
                await dependencies.signOut()
                owner?.isSignedIn = false
                owner?.selection = .today
            })
    }
}
