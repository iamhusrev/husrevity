import Foundation
import HusrevityCore

/// Composition root: builds the store, the sync stack, the UI and the system services once, and
/// exposes the few handles the scenes need. Everything here is wiring; the behaviour lives in
/// HusrevityCore and is tested there.
@MainActor
final class AppContainer {
    let config: AppConfig
    let store: LocalStore
    let coreJS: CoreJS
    let tokenStore: any TokenStore
    let api: SwitchableSyncAPI
    let engine: SyncEngine
    let coordinator: SyncCoordinator
    let environment: UIEnvironment
    let system: SystemServices

    /// - Parameter tokenStore: the Keychain in the real app; tests and `--smoke` pass an in-memory one.
    static func make(config: AppConfig = AppConfig(), tokenStore: any TokenStore = KeychainTokenStore()) async throws -> AppContainer {
        let databaseURL = config.databaseURL
        try FileManager.default.createDirectory(
            at: databaseURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let store = try LocalStore(path: databaseURL.path)
        let coreJS = try CoreJS()
        // Local mode (and the first-run question) never touches the Keychain: there is no session.
        let signedIn = config.syncMode == .sync ? await tokenStore.load() != nil : false
        return AppContainer(
            config: config, store: store, coreJS: coreJS, tokenStore: tokenStore, signedIn: signedIn)
    }

    private init(config: AppConfig, store: LocalStore, coreJS: CoreJS, tokenStore: any TokenStore, signedIn: Bool) {
        self.config = config
        self.store = store
        self.coreJS = coreJS
        self.tokenStore = tokenStore

        let initial = APIClient(baseURL: config.serverURL, tokenStore: tokenStore)
        let api = SwitchableSyncAPI(initial: initial)
        self.api = api
        let engine = SyncEngine(store: store, api: api, serverID: { entity, localId in
            try store.serverId(entity: entity, localId: localId)
        })
        self.engine = engine
        let coordinator = SyncCoordinator(
            runner: engine, store: store, monitor: PathNetworkMonitor(), ticker: SystemTicker())
        self.coordinator = coordinator

        let databasePath = config.databaseURL.path
        let tokenStore = tokenStore
        let dependencies = UIDependencies(
            store: store, parser: coreJS, expander: coreJS,
            notifyLocalChange: { coordinator.notifyLocalChange() },
            statuses: { coordinator.status },
            syncNow: { await coordinator.syncNow() },
            resolveConflict: { id, keepLocal in _ = try await engine.resolveConflict(id: id, keepLocal: keepLocal) },
            signIn: { baseURL, email, password in
                try AccountGuard.check(
                    storedEmail: config.userEmail, storedServer: config.boundServer,
                    email: email, server: baseURL, databasePath: databasePath)
                let client = APIClient(baseURL: baseURL, tokenStore: tokenStore)
                _ = try await client.login(email: email, password: password)
                api.use(client)
                config.serverURL = baseURL
                config.boundServer = baseURL
                config.userEmail = email
            },
            didSignIn: { await coordinator.resumeAfterSignIn() },
            signOut: { await tokenStore.clear() },
            serverURL: config.serverURL, userEmail: config.userEmail,
            webBaseURL: config.webBaseURL, saveWebBaseURL: { config.webBaseURL = $0 },
            isSignedIn: signedIn,
            syncMode: config.syncMode, saveSyncMode: { config.syncMode = $0 },
            startSync: { await coordinator.start() }, stopSync: { await coordinator.stop() })
        let environment = UIEnvironment(dependencies: dependencies)
        self.environment = environment

        // The global shortcut and the menu bar field feed the same pipeline as the Inbox field.
        let quickAdd = environment.viewModels.inbox.quickAdd
        self.system = SystemServices(store: store, coreJS: coreJS, quickAdd: { text in
            quickAdd.text = text
            _ = quickAdd.submit()
        })
    }

    func start() async {
        // Local mode (or the undecided first run) must not talk to any server; sync starts when
        // the user chooses it (see `UIDependencies.startSync`).
        if config.syncMode == .sync { await coordinator.start() }
        system.start()
    }

    func stop() async {
        system.stop()
        await coordinator.stop()
    }
}
