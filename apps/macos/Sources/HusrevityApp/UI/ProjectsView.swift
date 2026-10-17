import HusrevityCore
import SwiftUI

struct ProjectsView: View {
    @ObservedObject var viewModel: ProjectsViewModel
    @State private var selectedId: String?
    @State private var showsNewProject = false

    private var selected: ProjectRow? { viewModel.rows.first { $0.id == selectedId } }

    var body: some View {
        HSplitView {
            list.frame(minWidth: 260, idealWidth: 300, maxWidth: 420)
            Group {
                if let row = selected {
                    ProjectDetail(viewModel: viewModel, row: row)
                } else {
                    EmptyStateView(title: L10n.Projects.title, systemImage: "folder")
                }
            }
            .frame(minWidth: 320)
        }
        .navigationTitle(L10n.Projects.title)
        .toolbar {
            ToolbarItem {
                Toggle(isOn: $viewModel.showArchived) { Label(L10n.Projects.archived, systemImage: "archivebox") }
            }
            ToolbarItem {
                Button { showsNewProject = true } label: { Label(L10n.Projects.newProject, systemImage: "plus") }
            }
        }
        .sheet(isPresented: $showsNewProject) {
            NewProjectSheet(viewModel: viewModel) { selectedId = $0.localId }
        }
        .task { viewModel.start() }
    }

    private var list: some View {
        VStack(spacing: 0) {
            ErrorBanner(message: viewModel.errorMessage, onDismiss: viewModel.dismissError)
            if viewModel.isLoaded && viewModel.isEmpty {
                EmptyStateView(title: L10n.Projects.emptyTitle, hint: L10n.Projects.emptyHint, systemImage: "folder")
            } else {
                List(viewModel.rows, selection: $selectedId) { row in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            if row.project.pinned { Image(systemName: "pin.fill").font(.caption).foregroundStyle(.orange) }
                            Text(row.project.name)
                            Chip(text: row.project.code)
                            if row.project.shared { Chip(text: L10n.Projects.shared, systemImage: "person.2") }
                        }
                        Text(row.summary).font(.caption).foregroundStyle(.secondary)
                    }
                    .tag(row.id)
                }
            }
        }
    }
}

private struct ProjectDetail: View {
    @ObservedObject var viewModel: ProjectsViewModel
    let row: ProjectRow
    @State private var newTask = ""

    var body: some View {
        let project = row.project
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading) {
                    Text(project.name).font(.title2.bold())
                    if let description = project.description { Text(description).foregroundStyle(.secondary) }
                }
                Spacer()
                Button(project.pinned ? L10n.Projects.unpin : L10n.Projects.pin) { viewModel.togglePin(project) }
                Button(project.archived ? L10n.Projects.unarchive : L10n.Projects.archive) {
                    viewModel.setArchived(project, !project.archived)
                }
                if viewModel.canDelete(project) {
                    Button(L10n.Common.delete, role: .destructive) { viewModel.delete(project) }
                }
            }
            .padding(14)
            if viewModel.canEdit(project) {
                TextField(L10n.Projects.newTask, text: $newTask)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal, 14)
                    .onSubmit {
                        viewModel.addTask(title: newTask, to: project)
                        newTask = ""
                    }
            }
            List(viewModel.items(in: project)) { item in
                HStack {
                    Button {
                        if item.status == "open" { viewModel.complete(item) }
                    } label: {
                        Image(systemName: item.status == "done" ? "checkmark.circle.fill" : "circle")
                    }
                    .buttonStyle(.plain)
                    Text(item.title).strikethrough(item.status == "done")
                }
            }
        }
    }
}

private struct NewProjectSheet: View {
    @ObservedObject var viewModel: ProjectsViewModel
    var onCreated: (ProjectRecord) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var code = ""
    @State private var description = ""
    @State private var codeEdited = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.Projects.newProject).font(.headline)
            TextField(L10n.Projects.name, text: $name)
                .onChange(of: name) { _, newValue in
                    if !codeEdited { code = ProjectsViewModel.suggestedCode(from: newValue) }
                }
            TextField(L10n.Projects.code, text: Binding(get: { code }, set: { code = $0; codeEdited = true }))
            TextField(L10n.Projects.description, text: $description, axis: .vertical).lineLimit(3...5)
            if let error = viewModel.errorMessage { Text(error).font(.callout).foregroundStyle(.red) }
            HStack {
                Spacer()
                Button(L10n.Common.cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Button(L10n.Common.save) {
                    if let project = viewModel.create(code: code, name: name, description: description) {
                        onCreated(project)
                        dismiss()
                    }
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding()
        .frame(width: 380)
    }
}
