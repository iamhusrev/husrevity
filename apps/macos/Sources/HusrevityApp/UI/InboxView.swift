import HusrevityCore
import SwiftUI

struct InboxView: View {
    @ObservedObject var viewModel: InboxViewModel
    @State private var scheduling: ItemRecord?
    @State private var scheduleDate = Date()

    var body: some View {
        VStack(spacing: 0) {
            QuickAddBar(viewModel: viewModel.quickAdd)
            ErrorBanner(message: viewModel.errorMessage, onDismiss: viewModel.dismissError)
            if viewModel.isLoaded && viewModel.isEmpty {
                EmptyStateView(title: L10n.Inbox.emptyTitle, hint: L10n.Inbox.emptyHint, systemImage: "tray")
            } else {
                List(viewModel.items) { item in
                    HStack {
                        Button { viewModel.complete(item) } label: { Image(systemName: "circle") }
                            .buttonStyle(.plain)
                        Text(item.title)
                        if let context = item.context { Chip(text: "#\(context)") }
                        Spacer()
                    }
                    .contextMenu {
                        Button(L10n.Inbox.schedule) {
                            scheduleDate = Date()
                            scheduling = item
                        }
                        Button(L10n.Common.delete, role: .destructive) { viewModel.delete(item) }
                    }
                }
            }
        }
        .navigationTitle(L10n.Inbox.title)
        .sheet(item: $scheduling) { item in
            VStack(alignment: .leading, spacing: 12) {
                Text(item.title).font(.headline)
                DatePicker("", selection: $scheduleDate).labelsHidden()
                HStack {
                    Spacer()
                    Button(L10n.Common.cancel) { scheduling = nil }.keyboardShortcut(.cancelAction)
                    Button(L10n.Common.save) {
                        viewModel.schedule(item, at: scheduleDate)
                        scheduling = nil
                    }
                    .keyboardShortcut(.defaultAction)
                }
            }
            .padding()
            .frame(width: 320)
        }
        .task { viewModel.start() }
    }
}

/// Text field with a live "what was understood" strip underneath.
struct QuickAddBar: View {
    @ObservedObject var viewModel: QuickAddViewModel
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "plus.circle.fill").foregroundStyle(.tint)
                TextField(L10n.Inbox.quickAddPlaceholder, text: $viewModel.text)
                    .textFieldStyle(.plain)
                    .font(.title3)
                    .focused($focused)
                    .onSubmit { viewModel.submit() }
                Button(L10n.Common.add) { viewModel.submit() }.disabled(!viewModel.canSubmit)
            }
            if let preview = viewModel.preview {
                HStack(spacing: 6) {
                    Text(preview.title).fontWeight(.medium)
                    ForEach(preview.chips) { chip in Chip(text: chip.text, tint: tint(chip.kind)) }
                    if preview.usedFallback && preview.chips.isEmpty {
                        Text(L10n.Inbox.parseFailed).font(.caption).foregroundStyle(.secondary)
                    }
                }
            } else if let added = viewModel.lastAdded {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                    Text("\(L10n.Inbox.added): \(added.title)")
                    ForEach(added.chips) { chip in Chip(text: chip.text, tint: tint(chip.kind)) }
                }
                .font(.callout)
            }
            if let error = viewModel.errorMessage {
                Text(error).font(.callout).foregroundStyle(.red)
            }
        }
        .padding(12)
        .background(.quaternary.opacity(0.4))
        .onAppear { focused = true }
    }

    private func tint(_ kind: QuickAddChip.Kind) -> Color {
        switch kind {
        case .time: return .blue
        case .recurrence: return .purple
        case .context: return .teal
        case .project: return .indigo
        case .priority: return .orange
        }
    }
}
