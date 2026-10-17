import AppKit
import Combine
import HusrevityCore
import KeyboardShortcuts
import SwiftUI

extension KeyboardShortcuts.Name {
    /// Global shortcut that opens the quick-add panel from any app. Default: Option-Command-Space.
    static let quickAdd = Self("quickAdd", default: .init(.space, modifiers: [.option, .command]))
}

/// A borderless floating panel that can take keyboard focus without activating the main window.
final class QuickAddPanel: NSPanel {
    var onCancel: (() -> Void)?

    init(contentView: NSView) {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 64),
            styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered, defer: true)
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
        standardWindowButton(.closeButton)?.isHidden = true
        standardWindowButton(.miniaturizeButton)?.isHidden = true
        standardWindowButton(.zoomButton)?.isHidden = true
        isMovableByWindowBackground = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        self.contentView = contentView
    }

    override var canBecomeKey: Bool { true }

    /// Escape arrives here when no text field handles it.
    override func cancelOperation(_ sender: Any?) { onCancel?() }

    /// Clicking elsewhere dismisses the panel like Spotlight does.
    override func resignKey() {
        super.resignKey()
        onCancel?()
    }
}

/// The text field inside the panel. All behaviour lives in `QuickAddController`.
struct QuickAddPanelView: View {
    @ObservedObject var controller: QuickAddController
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "plus.circle.fill").font(.title2).foregroundStyle(.secondary)
            TextField("Hızlı ekle: yarın 10'da toplantı", text: $controller.flow.text)
                .textFieldStyle(.plain)
                .font(.title3)
                .focused($focused)
                .disabled(controller.flow.phase == .submitting)
                .onSubmit { controller.submit() }
                .onExitCommand { controller.cancel() }
        }
        .padding(.horizontal, 16)
        .frame(width: 560, height: 64)
        .background(.regularMaterial)
        .onChange(of: controller.flow.phase) { _, phase in
            if phase == .shown { focused = true }
        }
        .onAppear { focused = true }
    }
}

/// Owns the global shortcut and the floating panel.
///
/// Pressing the shortcut toggles the panel. Submitting hands the trimmed text to `onSubmit`, which
/// the app connects to the quick-add pipeline (parse, create locally, queue for sync).
@MainActor
final class QuickAddPanelController {
    let controller: QuickAddController
    private var panel: QuickAddPanel?
    private var phaseObserver: AnyCancellable?

    init(onSubmit: @escaping (String) -> Void) {
        controller = QuickAddController(onSubmit: onSubmit)
    }

    /// Registers the shortcut and starts reacting to state changes.
    func register() {
        KeyboardShortcuts.onKeyDown(for: .quickAdd) { [weak self] in
            Task { @MainActor in self?.controller.toggle() }
        }
        phaseObserver = controller.$flow.map(\.phase).removeDuplicates().sink { [weak self] phase in
            Task { @MainActor in self?.apply(phase) }
        }
    }

    func unregister() {
        KeyboardShortcuts.disable(.quickAdd)
        phaseObserver = nil
        panel?.orderOut(nil)
    }

    private func apply(_ phase: QuickAddPhase) {
        switch phase {
        case .shown: present()
        case .hidden: panel?.orderOut(nil)
        case .submitting: break
        }
    }

    private func present() {
        let panel = self.panel ?? makePanel()
        self.panel = panel
        if let screen = NSScreen.main ?? NSScreen.screens.first {
            let frame = screen.visibleFrame
            let origin = NSPoint(x: frame.midX - panel.frame.width / 2, y: frame.maxY - frame.height / 3)
            panel.setFrameOrigin(origin)
        }
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func makePanel() -> QuickAddPanel {
        let hosting = NSHostingView(rootView: QuickAddPanelView(controller: controller))
        let panel = QuickAddPanel(contentView: hosting)
        panel.onCancel = { [weak self] in
            Task { @MainActor in self?.controller.cancel() }
        }
        return panel
    }
}

/// Read-only label for the settings screen. The shortcut is fixed (Option-Command-Space); the text is
/// a literal on purpose, because the library's own description and Recorder views load resources
/// through its `Bundle.module`, which does not resolve inside a signed app bundle.
struct QuickAddShortcutHint: View {
    var body: some View {
        LabeledContent("Hızlı ekleme kısayolu") {
            Text("⌥⌘Space").font(.body.monospaced()).foregroundStyle(.secondary)
        }
    }
}
