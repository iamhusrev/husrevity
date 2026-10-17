import AppKit
import HusrevityCore
import SwiftUI

/// Owns the container while it is being built (the Keychain check is async) and surfaces a
/// startup failure instead of crashing.
@MainActor
final class AppHolder: ObservableObject {
    @Published private(set) var container: AppContainer?
    @Published private(set) var failure: String?

    private var isBootstrapping = false

    func bootstrap() async {
        // A second window's `.task` can fire before the first bootstrap finishes; two containers
        // would mean two stores and coordinators on the same database.
        guard container == nil, !isBootstrapping else { return }
        isBootstrapping = true
        defer { isBootstrapping = false }
        do {
            let container = try await AppContainer.make()
            await container.start()
            self.container = container
        } catch {
            failure = "Uygulama başlatılamadı: \(error.localizedDescription)"
        }
    }
}

@main
struct HusrevityApp: App {
    @StateObject private var holder = AppHolder()

    init() {
        if CommandLine.arguments.contains("--check-resources") {
            SmokeRunner.checkResourcesAndExit()
        }
        if CommandLine.arguments.contains("--smoke") {
            SmokeRunner.runAndExit()
        }
    }

    var body: some Scene {
        WindowGroup("Husrevity") {
            Group {
                if let container = holder.container {
                    container.environment.rootView
                } else if let failure = holder.failure {
                    Text(failure).padding().frame(minWidth: 360, minHeight: 160)
                } else {
                    ProgressView().frame(minWidth: 360, minHeight: 160)
                }
            }
            .task { await holder.bootstrap() }
        }

        MenuBarExtra {
            if let container = holder.container {
                MenuBarContentView(
                    model: container.system.menuBar,
                    openApp: { NSApp.activate(ignoringOtherApps: true) },
                    quit: { NSApp.terminate(nil) })
            } else {
                Text("Yükleniyor…").padding()
            }
        } label: {
            if let container = holder.container {
                MenuBarLabelView(model: container.system.menuBar)
            } else {
                Image(systemName: "checklist")
            }
        }
        .menuBarExtraStyle(.window)
    }
}
