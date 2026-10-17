import Foundation
import HusrevityCore

/// Headless check used by `scripts/e2e.sh` and by hand: `HusrevityApp --smoke`.
///
/// Opens the local database, loads the bundled JS (proving the resources resolve from inside the
/// `.app`), signs in with `HUSREVITY_EMAIL` / `HUSREVITY_PASSWORD` against `HUSREVITY_API_URL`,
/// runs one full sync and prints a single JSON line. No window is shown and the real Keychain is
/// never touched. `HUSREVITY_DB_PATH` and `HUSREVITY_API_URL` are mandatory too (exit code 2
/// otherwise), so a hand-run `--smoke` cannot reach the user's real database or server.
/// Exit code 0 only when the sync completed.
enum SmokeRunner {
    static func runAndExit() -> Never {
        Task {
            exit(await run())
        }
        dispatchMain()
    }

    /// `HusrevityApp --check-resources`: loads the bundled JS and reports where it came from, so
    /// `verify-app.sh` can prove a relocated, signed `.app` does not depend on the build directory.
    static func checkResourcesAndExit() -> Never {
        let location = CoreJS.packagedScriptLocation
        do {
            _ = try CoreJS()
            let viaApp = location.map { $0.path.hasPrefix(Bundle.main.bundlePath) } ?? false
            report(["ok": true, "script": location?.path ?? "", "viaAppBundle": viaApp])
            exit(0)
        } catch {
            report(["ok": false, "error": String(describing: error)])
            exit(1)
        }
    }

    static func run() async -> Int32 {
        let env = ProcessInfo.processInfo.environment
        // Every input is mandatory so a hand-run `--smoke` can never fall back to the real
        // database in Application Support or to the saved/production server.
        guard let email = env["HUSREVITY_EMAIL"], let password = env["HUSREVITY_PASSWORD"],
            env["HUSREVITY_DB_PATH"] != nil, env["HUSREVITY_API_URL"] != nil
        else {
            report([
                "ok": false,
                "error": "HUSREVITY_EMAIL, HUSREVITY_PASSWORD, HUSREVITY_DB_PATH and HUSREVITY_API_URL are all required",
            ])
            return 2
        }
        do {
            let config = AppConfig()
            try FileManager.default.createDirectory(
                at: config.databaseURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let store = try LocalStore(path: config.databaseURL.path)
            _ = try CoreJS()

            let client = APIClient(baseURL: config.serverURL, tokenStore: InMemoryTokenStore())
            _ = try await client.login(email: email, password: password)
            let engine = SyncEngine(store: store, api: client, serverID: { entity, localId in
                try store.serverId(entity: entity, localId: localId)
            })
            let outcome = await engine.syncNow()

            report([
                "ok": outcome.result == .synced,
                "result": String(describing: outcome.result),
                "pulled": outcome.pulled,
                "pushed": outcome.pushed,
                "items": try store.items().count,
                "notes": try store.notes().count,
                "projects": try store.projects().count,
                "goals": try store.goals().count,
                "pending": try store.outboxCount(),
            ])
            return outcome.result == .synced ? 0 : 1
        } catch {
            report(["ok": false, "error": String(describing: error)])
            return 1
        }
    }

    private static func report(_ fields: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]),
            let line = String(data: data, encoding: .utf8)
        else { return }
        print(line)
        fflush(stdout)
    }
}
