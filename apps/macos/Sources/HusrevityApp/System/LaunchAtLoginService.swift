import HusrevityCore
import ServiceManagement

/// "Open at login" through `SMAppService.mainApp` (macOS 13+). Registration only works for a signed
/// app bundle placed where macOS can find it (normally /Applications); anywhere else the status is
/// `.notFound`, which maps to `.unavailable` so the toggle can be disabled instead of failing.
struct SMAppServiceLaunchAtLogin: LaunchAtLoginControlling {
    var status: LaunchAtLoginStatus {
        switch SMAppService.mainApp.status {
        case .enabled: return .enabled
        case .requiresApproval: return .requiresApproval
        case .notRegistered: return .disabled
        case .notFound: return .unavailable
        @unknown default: return .unavailable
        }
    }

    func setEnabled(_ enabled: Bool) throws {
        if enabled {
            try SMAppService.mainApp.register()
        } else {
            try SMAppService.mainApp.unregister()
        }
    }
}
