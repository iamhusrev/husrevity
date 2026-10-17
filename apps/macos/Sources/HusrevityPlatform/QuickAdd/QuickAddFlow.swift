import Combine
import Foundation

public enum QuickAddPhase: Equatable, Sendable {
    case hidden, shown, submitting
}

/// The life cycle of the quick-add field: hidden -> shown -> submitting -> hidden.
///
/// Pure value type so every transition is unit-tested; the floating panel and the menu bar field
/// are thin views over it. Escape (`cancel`) discards the text, an empty submit is ignored and
/// keeps the field open, and nothing changes the state while a submit is in flight.
public struct QuickAddFlow: Equatable, Sendable {
    public private(set) var phase: QuickAddPhase = .hidden
    /// What the user typed. Only meaningful while `shown`; cleared whenever the field closes.
    public var text = ""

    public init() {}

    public mutating func show() {
        guard phase == .hidden else { return }
        phase = .shown
    }

    public mutating func toggle() {
        switch phase {
        case .hidden: show()
        case .shown: cancel()
        case .submitting: break
        }
    }

    /// Escape: closes the field and drops the text. Ignored while submitting.
    public mutating func cancel() {
        guard phase != .submitting else { return }
        phase = .hidden
        text = ""
    }

    /// Returns the trimmed text to hand to the quick-add pipeline and moves to `submitting`, or
    /// returns nil (state unchanged) when the field is not open, is blank, or is already submitting.
    public mutating func submit() -> String? {
        guard phase == .shown else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        phase = .submitting
        return trimmed
    }

    /// The submit succeeded: close and clear.
    public mutating func finish() {
        guard phase == .submitting else { return }
        phase = .hidden
        text = ""
    }

    /// The submit failed: reopen with the text intact so nothing the user typed is lost.
    public mutating func fail() {
        guard phase == .submitting else { return }
        phase = .shown
    }
}

/// Observable wrapper around `QuickAddFlow` that runs the submit closure.
@MainActor
public final class QuickAddController: ObservableObject {
    @Published public var flow = QuickAddFlow()
    private let onSubmit: (String) -> Void

    /// - Parameter onSubmit: receives the trimmed text; the app connects it to the quick-add pipeline.
    public init(onSubmit: @escaping (String) -> Void) { self.onSubmit = onSubmit }

    public func show() { flow.show() }
    public func toggle() { flow.toggle() }
    public func cancel() { flow.cancel() }

    /// Submits synchronously: the closure runs, then the field closes.
    public func submit() {
        guard let text = flow.submit() else { return }
        onSubmit(text)
        flow.finish()
    }
}
