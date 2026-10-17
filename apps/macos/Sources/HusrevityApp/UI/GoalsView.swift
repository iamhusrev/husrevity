import HusrevityCore
import SwiftUI

struct GoalsView: View {
    @ObservedObject var viewModel: GoalsViewModel
    @State private var newGoalParent: GoalRecord?
    @State private var showsNewGoal = false

    var body: some View {
        VStack(spacing: 0) {
            ErrorBanner(message: viewModel.errorMessage, onDismiss: viewModel.dismissError)
            if viewModel.isLoaded && viewModel.isEmpty {
                EmptyStateView(title: L10n.Goals.emptyTitle, hint: L10n.Goals.emptyHint, systemImage: "target")
            } else {
                List {
                    ForEach(viewModel.sections) { section in
                        Section(section.title) {
                            OutlineGroup(section.nodes, children: \.optionalChildren) { node in
                                GoalRow(node: node, viewModel: viewModel) {
                                    newGoalParent = node.goal
                                    showsNewGoal = true
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(L10n.Goals.title)
        .toolbar {
            ToolbarItem {
                Button {
                    newGoalParent = nil
                    showsNewGoal = true
                } label: {
                    Label(L10n.Goals.newGoal, systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $showsNewGoal) { NewGoalSheet(viewModel: viewModel, parent: newGoalParent) }
        .task { viewModel.start() }
    }
}

extension GoalNode {
    /// `OutlineGroup` wants nil (not an empty array) for leaves.
    var optionalChildren: [GoalNode]? { children.isEmpty ? nil : children }
}

private struct GoalRow: View {
    let node: GoalNode
    let viewModel: GoalsViewModel
    let onAddChild: () -> Void

    var body: some View {
        let goal = node.goal
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(goal.title).strikethrough(goal.status != "active")
                Chip(text: L10n.Goals.horizonLabel(goal.horizon))
                if goal.status == "done" { Chip(text: L10n.Goals.done, tint: .green) }
                if goal.status == "dropped" { Chip(text: L10n.Goals.dropped, tint: .orange) }
                Spacer()
                Text("\(node.progress.label) · \(L10n.Goals.percent(node.progress.percent))")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: node.progress.fraction)
        }
        .padding(.vertical, 2)
        .contextMenu {
            if node.goal.horizon != GoalHorizon.month.rawValue {
                Button(L10n.Goals.newGoal, action: onAddChild)
            }
            if goal.status != "done" { Button(L10n.Goals.done) { viewModel.setStatus(goal, "done") } }
            if goal.status != "active" { Button(L10n.Goals.active) { viewModel.setStatus(goal, "active") } }
            if goal.status != "dropped" { Button(L10n.Goals.dropped) { viewModel.setStatus(goal, "dropped") } }
            Divider()
            Button(L10n.Common.delete, role: .destructive) { viewModel.delete(goal) }
        }
    }
}

private struct NewGoalSheet: View {
    @ObservedObject var viewModel: GoalsViewModel
    let parent: GoalRecord?
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var horizon: GoalHorizon = .year
    @State private var anchor = Date()

    /// Horizons a child of `parent` may have (strictly narrower).
    private var horizons: [GoalHorizon] {
        guard let parent, let parentHorizon = GoalHorizon(rawValue: parent.horizon) else { return GoalHorizon.allCases }
        return GoalHorizon.allCases.filter { $0.rank > parentHorizon.rank }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(parent.map { "\(L10n.Goals.newGoal): \($0.title)" } ?? L10n.Goals.newGoal).font(.headline)
            TextField(L10n.Goals.title, text: $title)
            Picker("", selection: $horizon) {
                ForEach(horizons, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            DatePicker("", selection: $anchor, displayedComponents: .date).labelsHidden()
            if let error = viewModel.errorMessage { Text(error).font(.callout).foregroundStyle(.red) }
            HStack {
                Spacer()
                Button(L10n.Common.cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Button(L10n.Common.save) {
                    if viewModel.create(title: title, horizon: horizon, parent: parent, anchor: anchor) != nil {
                        dismiss()
                    }
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding()
        .frame(width: 380)
        .onAppear {
            if let first = horizons.first, !horizons.contains(horizon) { horizon = first }
        }
    }
}
