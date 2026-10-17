import HusrevityCore
import SwiftUI

struct NotesView: View {
    @ObservedObject var viewModel: NotesViewModel
    @State private var selectedId: String?
    @State private var newTagName = ""
    @State private var showsNewTag = false

    private var selectedNote: NoteRecord? { viewModel.notes.first { $0.localId == selectedId } }

    var body: some View {
        HSplitView {
            list.frame(minWidth: 260, idealWidth: 300, maxWidth: 420)
            Group {
                if let note = selectedNote {
                    NoteEditor(viewModel: viewModel, note: note).id(note.localId)
                } else {
                    EmptyStateView(title: L10n.Notes.newNote, systemImage: "note.text")
                }
            }
            .frame(minWidth: 320)
        }
        .navigationTitle(L10n.Notes.title)
        .searchable(text: $viewModel.search, prompt: L10n.Notes.searchPlaceholder)
        .toolbar {
            ToolbarItem {
                Menu {
                    Button(L10n.Notes.allTags) { viewModel.selectedTagId = nil }
                    Divider()
                    ForEach(viewModel.tags) { tag in
                        Button {
                            viewModel.selectedTagId = tag.localId
                        } label: {
                            if viewModel.selectedTagId == tag.localId {
                                Label(tag.name, systemImage: "checkmark")
                            } else {
                                Text(tag.name)
                            }
                        }
                    }
                } label: {
                    Label(L10n.Notes.tags, systemImage: "tag")
                }
            }
            ToolbarItem {
                Toggle(isOn: $viewModel.showArchived) { Label(L10n.Notes.archived, systemImage: "archivebox") }
            }
            ToolbarItem {
                Button {
                    if let note = viewModel.createNote(title: L10n.Notes.newNote, body: nil) {
                        selectedId = note.localId
                    }
                } label: {
                    Label(L10n.Notes.newNote, systemImage: "square.and.pencil")
                }
            }
        }
        .task { viewModel.start() }
    }

    private var list: some View {
        VStack(spacing: 0) {
            ErrorBanner(message: viewModel.errorMessage, onDismiss: viewModel.dismissError)
            if viewModel.isLoaded && viewModel.isEmpty {
                EmptyStateView(title: viewModel.emptyMessage, hint: L10n.Notes.emptyHint, systemImage: "note.text")
            } else {
                List(selection: $selectedId) {
                    if !viewModel.pinnedNotes.isEmpty {
                        Section(L10n.Notes.pinned) { ForEach(viewModel.pinnedNotes) { row($0) } }
                        Section { ForEach(viewModel.otherNotes) { row($0) } }
                    } else {
                        ForEach(viewModel.otherNotes) { row($0) }
                    }
                }
            }
        }
    }

    private func row(_ note: NoteRecord) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                if note.pinned { Image(systemName: "pin.fill").font(.caption).foregroundStyle(.orange) }
                Text(note.title).lineLimit(1)
            }
            if let body = note.bodyMarkdown {
                Text(body).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            let tags = viewModel.tags(for: note)
            if !tags.isEmpty {
                HStack { ForEach(tags) { Chip(text: $0.name) } }
            }
        }
        .tag(note.localId)
        .contextMenu {
            Button(note.pinned ? L10n.Notes.unpin : L10n.Notes.pin) { viewModel.togglePin(note) }
            Button(note.archived ? L10n.Notes.unarchive : L10n.Notes.archive) {
                viewModel.setArchived(note, !note.archived)
            }
            Divider()
            Button(L10n.Common.delete, role: .destructive) { viewModel.delete(note) }
        }
    }
}

/// Edits a copy of the note and saves explicitly (button or return to the list), so half-typed
/// text never produces a stream of sync writes.
private struct NoteEditor: View {
    @ObservedObject var viewModel: NotesViewModel
    let note: NoteRecord
    @State private var title: String
    @State private var text: String
    @State private var tagIds: Set<String>
    @State private var newTag = ""

    init(viewModel: NotesViewModel, note: NoteRecord) {
        self.viewModel = viewModel
        self.note = note
        _title = State(initialValue: note.title)
        _text = State(initialValue: note.bodyMarkdown ?? "")
        _tagIds = State(initialValue: Set(note.tagIds))
    }

    private var isDirty: Bool {
        title != note.title || text != (note.bodyMarkdown ?? "") || tagIds != Set(note.tagIds)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField(L10n.Common.untitled, text: $title)
                .textFieldStyle(.plain)
                .font(.title2.bold())
            HStack {
                ForEach(viewModel.tags) { tag in
                    Toggle(
                        tag.name,
                        isOn: Binding(
                            get: { tagIds.contains(tag.localId) },
                            set: { on in
                                if on { tagIds.insert(tag.localId) } else { tagIds.remove(tag.localId) }
                            })
                    )
                    .toggleStyle(.button)
                    .controlSize(.small)
                }
                TextField(L10n.Notes.newTag, text: $newTag)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 120)
                    .onSubmit {
                        if let tag = viewModel.createTag(name: newTag) { tagIds.insert(tag.localId) }
                        newTag = ""
                    }
            }
            TextEditor(text: $text)
                .font(.body.monospaced())
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(L10n.Notes.bodyPlaceholder).foregroundStyle(.tertiary).padding(.top, 8).padding(.leading, 5)
                            .allowsHitTesting(false)
                    }
                }
            HStack {
                Spacer()
                Button(L10n.Common.save, action: save)
                    .keyboardShortcut("s", modifiers: .command)
                    .disabled(!isDirty)
            }
        }
        .padding(14)
        .onDisappear { if isDirty { save() } }
    }

    private func save() {
        viewModel.updateNote(
            localId: note.localId, title: title, body: text, tagIds: viewModel.tags.map(\.localId).filter(tagIds.contains))
    }
}
