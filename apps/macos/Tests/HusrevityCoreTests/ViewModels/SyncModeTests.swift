import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

/// First-run choice between "this Mac only" and "connect to a server (sync)", and switching later.
@MainActor
final class SyncModeTests: ViewModelTestCase {
    private var savedModes: [SyncMode] = []
    private var startSyncCalls = 0
    private var stopSyncCalls = 0
    private var statusSubscriptions = 0
    private var signOutCalls = 0
    private var didSignInCalls = 0
    private var statusContinuation: AsyncStream<SyncStatus>.Continuation?

    private func makeApp(mode: SyncMode, signedIn: Bool = false) -> AppViewModels {
        let clock = self.clock!
        let store = self.store!
        let deps = UIDependencies(
            store: store, parser: core, expander: core,
            context: DateContext(now: { clock.now }, timeZone: clock.timeZone),
            notifyLocalChange: notify,
            statuses: { [unowned self] in
                self.statusSubscriptions += 1
                let (stream, continuation) = AsyncStream<SyncStatus>.makeStream()
                self.statusContinuation = continuation
                return stream
            },
            syncNow: {}, resolveConflict: { id, keep in try store.resolveConflict(id: id, keepLocal: keep) },
            signIn: { _, _, _ in }, didSignIn: { [unowned self] in self.didSignInCalls += 1 },
            signOut: { [unowned self] in self.signOutCalls += 1 },
            serverURL: URL(string: "https://api.iamhusrev.com/api")!, userEmail: signedIn ? "me@example.com" : nil,
            webBaseURL: nil, saveWebBaseURL: { _ in }, isSignedIn: signedIn,
            syncMode: mode, saveSyncMode: { [unowned self] in self.savedModes.append($0) },
            startSync: { [unowned self] in self.startSyncCalls += 1 },
            stopSync: { [unowned self] in self.stopSyncCalls += 1 })
        return AppViewModels(dependencies: deps)
    }

    func testFirstRunAsksWhichModeAndShowsNeitherLoginNorMainContent() {
        let app = makeApp(mode: .undecided)
        XCTAssertEqual(app.syncMode, .undecided)
        XCTAssertTrue(app.showsModeChoice)
        XCTAssertFalse(app.showsLogin, "the question comes before any login")
    }

    func testAnAlreadyDecidedModeSkipsTheQuestion() {
        XCTAssertFalse(makeApp(mode: .local).showsModeChoice)
        XCTAssertFalse(makeApp(mode: .sync, signedIn: true).showsModeChoice)
    }

    func testChoosingLocalSavesTheChoiceAndNeverAsksForLogin() async {
        let app = makeApp(mode: .undecided)
        app.start()

        await app.useLocalMode()

        XCTAssertEqual(app.syncMode, .local)
        XCTAssertEqual(savedModes, [.local])
        XCTAssertFalse(app.showsModeChoice)
        XCTAssertFalse(app.showsLogin, "no account is needed on this Mac only")
        XCTAssertEqual(startSyncCalls, 0, "nothing may talk to a server in local mode")
        XCTAssertEqual(signOutCalls, 0)
    }

    func testLocalModeIgnoresAnExpiredSessionStatus() async {
        let app = makeApp(mode: .local)
        app.start()
        statusContinuation?.yield(SyncStatus(state: .sessionExpired))
        await waitFor(app.syncStatus.$status) { $0.state == .sessionExpired }
        XCTAssertFalse(app.showsLogin)
    }

    func testChoosingSyncStartsTheEngineAndAsksForLoginWhenNotSignedIn() async {
        let app = makeApp(mode: .undecided)
        app.start()

        await app.useSyncMode()

        XCTAssertEqual(app.syncMode, .sync)
        XCTAssertEqual(savedModes, [.sync])
        XCTAssertEqual(startSyncCalls, 1)
        XCTAssertTrue(app.showsLogin)
        XCTAssertFalse(app.showsModeChoice)
    }

    func testChoosingSyncWhileAlreadySignedInGoesStraightToTheApp() async {
        let app = makeApp(mode: .local, signedIn: true)
        app.start()

        await app.useSyncMode()

        XCTAssertFalse(app.showsLogin)
        XCTAssertEqual(startSyncCalls, 1)
    }

    func testTurningSyncOnLaterThenSigningInShowsTheAppAndResumesSync() async {
        let app = makeApp(mode: .local)
        app.start()
        await app.useSyncMode()
        XCTAssertTrue(app.showsLogin)

        app.login.password = "secret"
        app.login.email = "me@example.com"
        let ok = await app.login.submit()

        XCTAssertTrue(ok)
        XCTAssertEqual(didSignInCalls, 1)
        XCTAssertFalse(app.showsLogin)
    }

    func testTurningSyncOffStopsTheEngineKeepsTheAccountAndTheData() async throws {
        let app = makeApp(mode: .sync, signedIn: true)
        app.start()
        _ = try store.create(NoteRecord(title: "stays", bodyMarkdown: nil))

        await app.useLocalMode()

        XCTAssertEqual(app.syncMode, .local)
        XCTAssertEqual(stopSyncCalls, 1)
        XCTAssertEqual(savedModes, [.local])
        XCTAssertEqual(signOutCalls, 0, "turning sync off is not a sign-out")
        XCTAssertEqual(try store.notes().map(\.title), ["stays"])
        XCTAssertFalse(app.showsLogin)
    }

    func testLocalWritesStillQueueSoSyncCanBeTurnedOnLaterWithoutLosingAnything() throws {
        _ = try store.create(NoteRecord(title: "written offline", bodyMarkdown: nil))
        XCTAssertEqual(try store.outboxCount(), 1, "the upgrade path to sync is the outbox")
    }

    func testReEnablingSyncSubscribesToStatusesAgain() async {
        let app = makeApp(mode: .sync, signedIn: true)
        app.start()
        XCTAssertEqual(statusSubscriptions, 1)

        await app.useLocalMode()  // the coordinator stop ends the old status stream
        await app.useSyncMode()

        XCTAssertEqual(statusSubscriptions, 2, "the indicator needs a fresh stream after a restart")
    }

    func testChoosingTheSameModeTwiceDoesNotRestartAnything() async {
        let app = makeApp(mode: .sync, signedIn: true)
        app.start()
        await app.useSyncMode()
        XCTAssertEqual(startSyncCalls, 0, "already syncing: nothing to start")
        XCTAssertEqual(savedModes, [])
    }
}
