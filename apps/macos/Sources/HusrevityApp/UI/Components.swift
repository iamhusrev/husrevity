import HusrevityCore
import SwiftUI

/// Centered placeholder for an empty list.
struct EmptyStateView: View {
    let title: String
    var hint: String?
    var systemImage = "tray"

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            if let hint { Text(hint) }
        }
    }
}

/// A dismissible error line shown above a screen's content.
struct ErrorBanner: View {
    let message: String?
    let onDismiss: () -> Void

    var body: some View {
        if let message {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                Text(message).font(.callout)
                Spacer()
                Button(L10n.Common.close, action: onDismiss).buttonStyle(.borderless)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.orange.opacity(0.12))
        }
    }
}

/// Small rounded label (context, recurrence, horizon).
struct Chip: View {
    let text: String
    var systemImage: String?
    var tint: Color = .secondary

    var body: some View {
        HStack(spacing: 3) {
            if let systemImage { Image(systemName: systemImage) }
            Text(text)
        }
        .font(.caption)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(tint.opacity(0.14), in: Capsule())
        .foregroundStyle(tint)
    }
}

/// One entry of Today or the calendar: checkbox, title, time and tags.
struct EntryRow: View {
    let entry: ScheduleEntry
    let time: String?
    let onToggle: () -> Void
    var canToggle = true

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onToggle) {
                Image(systemName: icon)
                    .foregroundStyle(entry.status == .open ? Color.secondary : Color.green)
            }
            .buttonStyle(.plain)
            .disabled(!canToggle)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.title)
                    .strikethrough(entry.status != .open)
                    .foregroundStyle(entry.status == .open ? .primary : .secondary)
                HStack(spacing: 6) {
                    if let time { Text(time).font(.caption).foregroundStyle(.secondary) }
                    if entry.isRecurring { Chip(text: L10n.Today.recurring, systemImage: "repeat") }
                    if entry.status == .skipped { Chip(text: L10n.Today.skipped, tint: .orange) }
                    if let context = entry.context { Chip(text: "#\(context)") }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }

    private var icon: String {
        switch entry.status {
        case .open: return "circle"
        case .done: return "checkmark.circle.fill"
        case .skipped: return "arrow.uturn.forward.circle"
        }
    }
}
