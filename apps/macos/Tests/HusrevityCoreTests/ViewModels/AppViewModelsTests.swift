import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

@MainActor
final class AppViewModelsTests: ViewModelTestCase {
    private var signInCalls: [(URL, String, String)] = []
    private var didSignInCalls = 0
    private var signOutCalls = 0
    private var syncNowCalls = 0
    private var savedWebURLs: [URL?] = []
    private var statusContinuation: AsyncStream<SyncStatus>.Continuation?
    private var signInError: Error?

    private func makeApp(signedIn: Bool = true, web: String? = nil) -> AppViewModels {
        let (stream, continuation) = AsyncStream<SyncStatus>.makeStream()
        statusContinuation = continuation
        let clock = self.clock!
        let store = self.store!
        let deps = UIDependencies(
            store: store, parser: core, expander: core,
            context: DateContext(now: { clock.now }, timeZone: clock.timeZone),
            notifyLocalChange: notify, statuses: { stream }, syncNow: { [unowned self] in self.syncNowCalls += 1 },
            resolveConflict: { id, keep in try store.resolveConflict(id: id, keepLocal: keep) },
            signIn: { [unowned self] url, email, password in
                self.signInCalls.append((url, email, password))
                if let error = self.signInError { throw error }
            },
            didSignIn: { [unowned self] in self.didSignInCalls += 1 },
            signOut: { [unowned self] in self.signOutCalls += 1 },
            serverURL: URL(string: "https://api.iamhusrev.com/api")!, userEmail: signedIn ? "me@example.com" : nil,
            webBaseURL: web.flatMap(URL.init(string:)), saveWebBaseURL: { [unowned self] in self.savedWebURLs.append($0) },
            isSignedIn: signedIn)
        return AppViewModels(dependencies: deps)
    }

    func testSidebarSectionsAreTurkishAndOrdered() {
        XCTAssertEqual(
            AppSection.allCases.map(\.title),
            ["Bugün", "Gelen Kutusu", "Takvim", "Projeler", "Notlar", "Hedefler", "Ayarlar"])
        XCTAssertEqual(AppSection.today.iconName, "sun.max")
        XCTAssertEqual(Set(AppSection.allCases.map(\.iconName)).count, AppSection.allCases.count, "unique icons")
        XCTAssertEqual(AppSection.mainSections, [.today, .inbox, .calendar, .projects, .notes, .goals])
    }

    func testSignedInStartsOnTodayWithoutLogin() {
        let app = makeApp()
        XCTAssertTrue(app.isSignedIn)
        XCTAssertFalse(app.showsLogin)
        XCTAssertEqual(app.selection, .today)
        XCTAssertEqual(app.settings.userEmail, "me@example.com")
    }

    func testSignedOutShowsLogin() {
        let app = makeApp(signedIn: false)
        XCTAssertTrue(app.showsLogin)
    }

    func testSuccessfulLoginHidesTheLoginResumesSyncAndRebuildsSettings() async {
        let app = makeApp(signedIn: false)
        app.login.email = "new@example.com"
        app.login.password = "secret"
        app.login.server = .local
        let ok = await app.login.submit()
        XCTAssertTrue(ok)
        XCTAssertEqual(signInCalls.count, 1)
        XCTAssertEqual(signInCalls[0].0, URL(string: "http://localhost:4090/api"))
        XCTAssertEqual(didSignInCalls, 1)
        XCTAssertTrue(app.isSignedIn)
        XCTAssertFalse(app.showsLogin)
        XCTAssertEqual(app.settings.userEmail, "new@example.com")
        XCTAssertEqual(app.settings.serverURL, URL(string: "http://localhost:4090/api"))
    }

    func testFailedLoginKeepsTheLoginScreen() async {
        let app = makeApp(signedIn: false)
        signInError = APIError.unauthorized
        app.login.email = "new@example.com"
        app.login.password = "wrong"
        let ok = await app.login.submit()
        XCTAssertFalse(ok)
        XCTAssertEqual(didSignInCalls, 0)
        XCTAssertTrue(app.showsLogin)
        XCTAssertEqual(app.login.errorMessage, L10n.Login.wrongCredentials)
    }

    func testSignOutCallsTheServiceAndShowsLogin() async {
        let app = makeApp()
        await app.settings.signOut()
        XCTAssertEqual(signOutCalls, 1)
        XCTAssertFalse(app.isSignedIn)
        XCTAssertTrue(app.showsLogin)
        XCTAssertEqual(app.selection, .today, "the next sign-in starts on Today")
    }

    func testAnExpiredSessionShowsTheLoginAgainUntilSignedIn() async {
        let app = makeApp()
        app.start()
        statusContinuation?.yield(SyncStatus(state: .sessionExpired))
        await waitFor(app.syncStatus.$status) { $0.state == .sessionExpired }
        XCTAssertTrue(app.showsLogin)

        app.login.email = "me@example.com"
        app.login.password = "secret"
        _ = await app.login.submit()
        statusContinuation?.yield(SyncStatus(state: .idle))
        await waitFor(app.syncStatus.$status) { $0.state == .idle }
        XCTAssertFalse(app.showsLogin)
    }

    func testSessionExpiryShowsLoginPrefilledAndKeepsEverythingElse() async throws {
        try store.create(NoteRecord(title: "keep me"))
        let app = makeApp()
        app.start()
        app.selection = .notes
        statusContinuation?.yield(SyncStatus(state: .sessionExpired, pendingCount: 2))
        await waitFor(app.syncStatus.$status) { $0.state == .sessionExpired }
        XCTAssertTrue(app.showsLogin)
        XCTAssertTrue(app.isSessionExpired)
        XCTAssertEqual(app.selection, .notes)
        XCTAssertEqual(try store.notes().count, 1)
        XCTAssertEqual(app.login.email, "me@example.com")
        XCTAssertEqual(app.login.server, .production)
        XCTAssertEqual(app.syncStatus.label, L10n.Sync.sessionExpired)
    }

    func testExpiryPrefillsACustomServer() async {
        let (stream, continuation) = AsyncStream<SyncStatus>.makeStream()
        let store = self.store!
        var deps = UIDependencies(
            store: store, parser: core, expander: core, notifyLocalChange: {}, statuses: { stream },
            syncNow: {}, resolveConflict: { _, _ in }, signIn: { _, _, _ in }, didSignIn: {}, signOut: {},
            serverURL: URL(string: "https://my.host/api")!, userEmail: "me@example.com", webBaseURL: nil,
            saveWebBaseURL: { _ in }, isSignedIn: true)
        deps.userEmail = "me@example.com"
        let app = AppViewModels(dependencies: deps)
        app.start()
        continuation.yield(SyncStatus(state: .sessionExpired))
        await waitFor(app.syncStatus.$status) { $0.state == .sessionExpired }
        XCTAssertEqual(app.login.server, .custom)
        XCTAssertEqual(app.login.customURL, "https://my.host/api")
    }

    func testSignInAfterExpiryHidesTheLoginEvenBeforeTheCoordinatorCatchesUp() async {
        let app = makeApp()
        app.start()
        statusContinuation?.yield(SyncStatus(state: .sessionExpired))
        await waitFor(app.syncStatus.$status) { $0.state == .sessionExpired }
        app.login.password = "secret"
        let ok = await app.login.submit()
        XCTAssertTrue(ok)
        XCTAssertEqual(didSignInCalls, 1)
        XCTAssertFalse(app.showsLogin, "status is still sessionExpired but the user just signed in")

        // Wait for each state in turn: the status is already .sessionExpired from before, so waiting
        // for it again right after yielding would return before the stream delivered anything.
        statusContinuation?.yield(SyncStatus(state: .idle))
        await waitFor(app.syncStatus.$status) { $0.state == .idle }
        statusContinuation?.yield(SyncStatus(state: .sessionExpired))
        await waitFor(app.syncStatus.$status) { $0.state == .sessionExpired }
        XCTAssertTrue(app.showsLogin, "a later expiry asks again")
    }

    func testLocalWritesFromAnyScreenNotifyTheSync() async {
        let app = makeApp()
        app.inbox.quickAdd.text = "bir şey"
        app.inbox.quickAdd.submit()
        XCTAssertEqual(changeNotifications, 1)
        _ = app.notes.createNote(title: "n", body: nil)
        XCTAssertEqual(changeNotifications, 2)
        _ = app.projects.create(code: "P1", name: "P")
        XCTAssertEqual(changeNotifications, 3)
        _ = app.goals.create(title: "g", horizon: .year)
        XCTAssertEqual(changeNotifications, 4)
    }

    func testStartLoadsEveryScreenAndIsIdempotent() async throws {
        try makeItem("inbox item")
        try makeItem("today item", scheduledAt: "2026-10-18T15:00:00+03:00")
        try store.create(NoteRecord(title: "note"))
        let app = makeApp()
        app.start()
        app.start()
        await waitFor(app.today.$isLoaded) { $0 }
        await waitFor(app.inbox.$isLoaded) { $0 }
        await waitFor(app.calendar.$isLoaded) { $0 }
        await waitFor(app.notes.$isLoaded) { $0 }
        await waitFor(app.projects.$isLoaded) { $0 }
        await waitFor(app.goals.$isLoaded) { $0 }
        await waitFor(app.conflicts.$isLoaded) { $0 }
        XCTAssertEqual(app.today.sections.today.count, 1)
        XCTAssertEqual(app.inbox.items.count, 1)
        XCTAssertEqual(app.notes.notes.count, 1)
    }

    func testBadgesFollowTheStore() async throws {
        try makeItem("a")
        try makeItem("b")
        let app = makeApp()
        app.start()
        await waitFor(app.inbox.$items) { $0.count == 2 }
        XCTAssertEqual(app.badge(for: .inbox), 2)
        XCTAssertNil(app.badge(for: .notes))
        XCTAssertNil(app.badge(for: .settings))
    }

    func testConflictBannerFollowsConflictsInTheStore() async throws {
        let item = try makeItem("a")
        let app = makeApp()
        app.start()
        await waitFor(app.conflicts.$isLoaded) { $0 }
        XCTAssertNil(app.conflicts.bannerText)
        try store.recordConflict(
            entity: .item, localId: item.localId, localPayload: .object([:]), serverPayload: .object([:]))
        await waitFor(app.conflicts.$conflicts) { $0.count == 1 }
        XCTAssertNotNil(app.conflicts.bannerText)
    }

    func testWebLinksFollowTheConfiguredAddress() {
        XCTAssertFalse(makeApp().settings.canOpenInWeb)
        XCTAssertTrue(makeApp(web: "https://x.example.com").settings.canOpenInWeb)
    }
}
