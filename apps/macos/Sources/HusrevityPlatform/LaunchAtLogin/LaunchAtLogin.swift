import Combine
import Foundation

public enum LaunchAtLoginStatus: Equatable, Sendable {
    case enabled
    case disabled
    /// Registered, but the user still has to allow it in System Settings > Login Items.
    case requiresApproval
    /// The app cannot register (for example it runs outside an app bundle).
    case unavailable
}

/// The system side of "open at login". `SMAppService.mainApp` implements it in the app target.
public protocol LaunchAtLoginControlling {
    var status: LaunchAtLoginStatus { get }
    func setEnabled(_ enabled: Bool) throws
}

/// In-memory controller for tests and previews.
public final class FakeLaunchAtLogin: LaunchAtLoginControlling {
    public enum Failure: Error { case denied }

    public var status: LaunchAtLoginStatus
    /// When set, `setEnabled` throws it instead of changing the status.
    public var failure: Error?
    public private(set) var setCalls: [Bool] = []

    public init(status: LaunchAtLoginStatus = .disabled) { self.status = status }

    public func setEnabled(_ enabled: Bool) throws {
        setCalls.append(enabled)
        if let failure { throw failure }
        status = enabled ? .enabled : .disabled
    }
}

@MainActor
public final class LaunchAtLoginModel: ObservableObject {
    @Published public private(set) var status: LaunchAtLoginStatus
    @Published public private(set) var errorMessage: String?
    private let controller: any LaunchAtLoginControlling

    public init(controller: any LaunchAtLoginControlling) {
        self.controller = controller
        status = controller.status
    }

    /// Whether the toggle should show "on". A registration that waits for approval counts as on.
    public var isEnabled: Bool { status == .enabled || status == .requiresApproval }
    public var needsApproval: Bool { status == .requiresApproval }
    public var isAvailable: Bool { status != .unavailable }

    public func setEnabled(_ enabled: Bool) {
        guard isAvailable, enabled != isEnabled else { return }  // SMAppService throws on a repeat
        do {
            try controller.setEnabled(enabled)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        status = controller.status
    }

    /// Re-reads the system state; the user can change it in System Settings at any time.
    public func refresh() { status = controller.status }
}
