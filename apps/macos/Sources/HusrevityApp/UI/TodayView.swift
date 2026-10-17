import HusrevityCore
import SwiftUI

struct TodayView: View {
    @ObservedObject var viewModel: TodayViewModel

    var body: some View {
        VStack(spacing: 0) {
            ErrorBanner(message: viewModel.errorMessage, onDismiss: viewModel.dismissError)
            if viewModel.isLoaded && viewModel.isEmpty {
                EmptyStateView(
                    title: L10n.Today.emptyTitle, hint: L10n.Today.emptyHint, systemImage: "sun.max")
            } else {
                List {
                    section(L10n.Today.overdue, viewModel.sections.overdue, tint: .red)
                    section(L10n.Today.today, viewModel.sections.today)
                    section(L10n.Today.done, viewModel.sections.done)
                }
            }
        }
        .navigationTitle(viewModel.dayTitle)
        .navigationSubtitle(L10n.Today.title)
        .task { viewModel.start() }
    }

    @ViewBuilder
    private func section(_ title: String, _ entries: [TodayEntry], tint: Color = .secondary) -> some View {
        if !entries.isEmpty {
            Section {
                ForEach(entries) { entry in
                    EntryRow(
                        entry: entry, time: viewModel.timeLabel(entry),
                        onToggle: { entry.status == .open ? viewModel.complete(entry) : viewModel.reopen(entry) },
                        canToggle: entry.status == .open || viewModel.canReopen(entry))
                }
            } header: {
                Text("\(title) · \(entries.count)").foregroundStyle(tint)
            }
        }
    }
}
