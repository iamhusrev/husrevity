import HusrevityCore
import SwiftUI

/// Toolbar item: status icon, pending count, and a popover with details and "sync now".
struct SyncIndicatorView: View {
    @ObservedObject var viewModel: SyncStatusViewModel
    var onShowConflicts: () -> Void
    @State private var showsPopover = false

    var body: some View {
        Button {
            showsPopover.toggle()
        } label: {
            HStack(spacing: 4) {
                if viewModel.isSyncing {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: viewModel.iconName)
                }
                if viewModel.pendingCount > 0 {
                    Text("\(viewModel.pendingCount)").font(.caption.monospacedDigit())
                }
            }
        }
        .help(viewModel.label)
        .popover(isPresented: $showsPopover, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 10) {
                Label(viewModel.label, systemImage: viewModel.iconName).font(.headline)
                if let detail = viewModel.detail { Text(detail).font(.callout).foregroundStyle(.secondary) }
                if viewModel.hasConflicts {
                    Button(L10n.Conflicts.bannerCount(viewModel.conflictCount)) {
                        showsPopover = false
                        onShowConflicts()
                    }
                }
                Button(L10n.Sync.syncNow) { Task { await viewModel.syncNow() } }
                    .disabled(!viewModel.canSyncNow)
            }
            .padding(14)
            .frame(minWidth: 240, alignment: .leading)
        }
    }
}

/// Yellow strip above every screen while there are conflicts.
struct ConflictBanner: View {
    @ObservedObject var viewModel: ConflictsViewModel
    var onOpen: () -> Void

    var body: some View {
        if let text = viewModel.bannerText {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
                Text(text).font(.callout)
                Spacer()
                Button(L10n.Conflicts.title, action: onOpen)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.yellow.opacity(0.18))
        }
    }
}

/// Sheet listing conflicts (reapply / discard) and changes the server refused.
struct ConflictsView: View {
    @ObservedObject var viewModel: ConflictsViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var discarding: FailedRow?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(L10n.Conflicts.title).font(.title2.bold())
                Spacer()
                Button(L10n.Common.close) { dismiss() }.keyboardShortcut(.cancelAction)
            }
            .padding()
            ErrorBanner(message: viewModel.errorMessage, onDismiss: viewModel.dismissError)
            if viewModel.count == 0 {
                EmptyStateView(title: L10n.Conflicts.emptyTitle, systemImage: "checkmark.seal")
            } else {
                List {
                    if !viewModel.conflicts.isEmpty {
                        Section(L10n.Conflicts.title) {
                            ForEach(viewModel.conflicts) { row in conflictRow(row) }
                        }
                    }
                    if !viewModel.failed.isEmpty {
                        Section(L10n.Conflicts.failedTitle) {
                            ForEach(viewModel.failed) { row in failedRow(row) }
                        }
                    }
                }
            }
        }
        .frame(minWidth: 560, minHeight: 420)
        .confirmationDialog(
            L10n.Conflicts.discardEntryConfirm,
            isPresented: Binding(get: { discarding != nil }, set: { if !$0 { discarding = nil } }),
            titleVisibility: .visible
        ) {
            Button(L10n.Conflicts.discardEntry, role: .destructive) {
                if let row = discarding { viewModel.discard(row) }
                discarding = nil
            }
            Button(L10n.Common.cancel, role: .cancel) { discarding = nil }
        }
        .task { viewModel.start() }
    }

    private func conflictRow(_ row: ConflictRow) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(row.title).font(.headline)
                Chip(text: "\(row.entityLabel) · \(row.opLabel)")
            }
            if !row.fields.isEmpty {
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 2) {
                    GridRow {
                        Text("").gridColumnAlignment(.trailing)
                        Text(L10n.Conflicts.yourChange).font(.caption).foregroundStyle(.secondary)
                        Text(L10n.Conflicts.serverVersion).font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(row.fields, id: \.name) { field in
                        GridRow {
                            Text(field.name).foregroundStyle(.secondary)
                            Text(field.yours)
                            Text(field.server)
                        }
                    }
                }
                .font(.callout)
            }
            HStack {
                Button(L10n.Conflicts.reapply) { Task { await viewModel.resolve(row, keepLocal: true) } }
                Button(L10n.Conflicts.discard, role: .destructive) {
                    Task { await viewModel.resolve(row, keepLocal: false) }
                }
            }
            .disabled(viewModel.isResolving)
        }
        .padding(.vertical, 6)
    }

    private func failedRow(_ row: FailedRow) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title).font(.headline)
                Text("\(row.entityLabel) · \(row.opLabel)").font(.caption).foregroundStyle(.secondary)
                Text(row.error).font(.callout).foregroundStyle(.red)
            }
            Spacer()
            Button(L10n.Conflicts.retry) { viewModel.retry(row) }
            Button(L10n.Conflicts.discardEntry, role: .destructive) { discarding = row }
        }
        .padding(.vertical, 4)
    }
}
