import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

@MainActor
final class NotesViewModelTests: ViewModelTestCase {
    private func makeVM() -> NotesViewModel { NotesViewModel(store: store, notifyLocalChange: notify) }

    private func started() async -> NotesViewModel {
        let vm = makeVM()
        vm.start()
        await waitFor(vm.$isLoaded) { $0 }
        return vm
    }

    @discardableResult
    private func makeNote(
        _ title: String, body: String? = nil, pinned: Bool = false, archived: Bool = false, tags: [NoteTagRecord] = []
    ) throws -> NoteRecord {
        try store.create(
            NoteRecord(title: title, bodyMarkdown: body, pinned: pinned, archived: archived, tagIds: tags.map(\.localId)))
    }

    private func makeTag(_ name: String) throws -> NoteTagRecord { try store.create(NoteTagRecord(name: name)) }

    // MARK: Listing

    func testEmptyState() async {
        let vm = await started()
        XCTAssertTrue(vm.isEmpty)
        XCTAssertEqual(vm.emptyMessage, L10n.Notes.emptyTitle)
        XCTAssertTrue(vm.pinnedNotes.isEmpty && vm.otherNotes.isEmpty)
    }

    func testPinnedNotesComeFirstAndAreSplitOut() async throws {
        try makeNote("plain")
        try makeNote("starred", pinned: true)
        let vm = await started()
        XCTAssertEqual(vm.notes.map(\.title), ["starred", "plain"])
        XCTAssertEqual(vm.pinnedNotes.map(\.title), ["starred"])
        XCTAssertEqual(vm.otherNotes.map(\.title), ["plain"])
    }

    // MARK: Search / tag / archive combinations

    func testSearchMatchesTitleAndBodyIgnoringCase() async throws {
        try makeNote("Grocery list", body: "milk, eggs")
        try makeNote("Ideas", body: "build a GROCERY app")
        try makeNote("Other")
        let vm = await started()
        vm.search = "grocery"
        await waitFor(vm.$notes) { $0.count == 2 }
        XCTAssertEqual(Set(vm.notes.map(\.title)), ["Grocery list", "Ideas"])
        vm.search = "eggs"
        await waitFor(vm.$notes) { $0.count == 1 }
        XCTAssertEqual(vm.notes.first?.title, "Grocery list")
    }

    func testSearchTreatsPercentLiterally() async throws {
        try makeNote("100% done")
        try makeNote("anything")
        let vm = await started()
        vm.search = "%"
        await waitFor(vm.$notes) { $0.count == 1 }
        XCTAssertEqual(vm.notes.first?.title, "100% done")
    }

    func testEmptySearchResultHasItsOwnMessage() async throws {
        try makeNote("something")
        let vm = await started()
        vm.search = "zzz"
        await waitFor(vm.$notes) { $0.isEmpty }
        XCTAssertTrue(vm.isEmpty)
        XCTAssertEqual(vm.emptyMessage, L10n.Notes.emptySearch)
        vm.search = ""
        await waitFor(vm.$notes) { $0.count == 1 }
        XCTAssertEqual(vm.emptyMessage, L10n.Notes.emptyTitle)
    }

    func testTagFilterAndSearchCombine() async throws {
        let work = try makeTag("work")
        let home = try makeTag("home")
        try makeNote("work plan", tags: [work])
        try makeNote("work chores", tags: [work, home])
        try makeNote("home plan", tags: [home])
        let vm = await started()
        vm.selectedTagId = work.localId
        await waitFor(vm.$notes) { $0.count == 2 }
        vm.search = "plan"
        await waitFor(vm.$notes) { $0.count == 1 }
        XCTAssertEqual(vm.notes.first?.title, "work plan")
        vm.selectedTagId = nil
        await waitFor(vm.$notes) { $0.count == 2 }
        XCTAssertEqual(Set(vm.notes.map(\.title)), ["work plan", "home plan"])
    }

    func testArchivedToggleSwitchesTheList() async throws {
        try makeNote("live")
        try makeNote("old", body: "findme", archived: true)
        let vm = await started()
        XCTAssertEqual(vm.notes.map(\.title), ["live"])
        vm.showArchived = true
        await waitFor(vm.$notes) { $0.map(\.title) == ["old"] }
        vm.search = "findme"
        await waitFor(vm.$notes) { $0.count == 1 }
        vm.search = "live"
        await waitFor(vm.$notes) { $0.isEmpty }
    }

    func testTagsAreListedAndNamedForNotes() async throws {
        let work = try makeTag("work")
        let note = try makeNote("n", tags: [work])
        let vm = await started()
        await waitFor(vm.$tags) { $0.count == 1 }
        XCTAssertEqual(vm.tags(for: vm.notes.first { $0.localId == note.localId }!).map(\.name), ["work"])
        XCTAssertEqual(vm.tagName(work.localId), "work")
        XCTAssertNil(vm.tagName("missing"))
    }

    // MARK: Writes

    func testCreateNoteStoresItQueuesAWriteAndAppears() async throws {
        let tag = try makeTag("work")
        let vm = await started()
        let note = try XCTUnwrap(vm.createNote(title: "  Plan ", body: "body", tagIds: [tag.localId]))
        XCTAssertEqual(note.title, "Plan")
        XCTAssertEqual(note.bodyMarkdown, "body")
        XCTAssertEqual(note.tagIds, [tag.localId])
        XCTAssertEqual(changeNotifications, 1)
        await waitFor(vm.$notes) { $0.count == 1 }
        XCTAssertEqual(try store.outbox().filter { $0.entity == .note }.map(\.op), [.create])
    }

    func testCreateWithoutTitleDerivesOneFromTheBodyOrIsRefused() async throws {
        let vm = await started()
        XCTAssertNil(vm.createNote(title: "  ", body: " \n "))
        XCTAssertEqual(changeNotifications, 0)
        let derived = try XCTUnwrap(vm.createNote(title: "", body: "first line\nsecond line"))
        XCTAssertEqual(derived.title, "first line")
        let long = try XCTUnwrap(vm.createNote(title: "", body: String(repeating: "a", count: 200)))
        XCTAssertEqual(long.title.count, 60)
    }

    func testUpdateNoteChangesFieldsAndTags() async throws {
        let work = try makeTag("work")
        let note = try makeNote("old", body: "b")
        let vm = await started()
        XCTAssertTrue(vm.updateNote(localId: note.localId, title: "new", body: "b2", tagIds: [work.localId]))
        XCTAssertEqual(changeNotifications, 1)
        await waitFor(vm.$notes) { $0.first?.title == "new" }
        XCTAssertEqual(vm.notes.first?.tagIds, [work.localId])
        XCTAssertEqual(vm.notes.first?.bodyMarkdown, "b2")
    }

    func testUpdateOfAMissingNoteReportsAnError() async {
        let vm = await started()
        XCTAssertFalse(vm.updateNote(localId: "nope", title: "x", body: nil, tagIds: []))
        XCTAssertNotNil(vm.errorMessage)
        XCTAssertEqual(changeNotifications, 0)
    }

    func testPinningAndArchiving() async throws {
        let note = try makeNote("n")
        let vm = await started()
        vm.togglePin(vm.notes[0])
        await waitFor(vm.$notes) { $0.first?.pinned == true }
        vm.togglePin(vm.notes[0])
        await waitFor(vm.$notes) { $0.first?.pinned == false }
        vm.setArchived(vm.notes[0], true)
        await waitFor(vm.$notes) { $0.isEmpty }
        XCTAssertEqual(try store.notes(archived: true).map(\.localId), [note.localId])
        XCTAssertEqual(changeNotifications, 3)
    }

    func testDeleteRemovesTheNote() async throws {
        try makeNote("n")
        let vm = await started()
        vm.delete(vm.notes[0])
        await waitFor(vm.$notes) { $0.isEmpty }
        XCTAssertEqual(changeNotifications, 1)
    }

    // MARK: Tags

    func testCreateTagTrimsAndReusesAnExistingNameIgnoringCase() async throws {
        let vm = await started()
        let tag = try XCTUnwrap(vm.createTag(name: "  Work "))
        XCTAssertEqual(tag.name, "Work")
        XCTAssertEqual(changeNotifications, 1)
        let again = try XCTUnwrap(vm.createTag(name: "work"))
        XCTAssertEqual(again.localId, tag.localId)
        XCTAssertEqual(changeNotifications, 1, "no second write for a duplicate")
        XCTAssertNil(vm.createTag(name: "   "))
        await waitFor(vm.$tags) { $0.count == 1 }
    }

    func testDeletingTheSelectedTagClearsTheFilter() async throws {
        let work = try makeTag("work")
        try makeNote("n", tags: [work])
        let vm = await started()
        await waitFor(vm.$tags) { $0.count == 1 }
        vm.selectedTagId = work.localId
        await waitFor(vm.$notes) { $0.count == 1 }
        vm.deleteTag(vm.tags[0])
        XCTAssertNil(vm.selectedTagId)
        await waitFor(vm.$tags) { $0.isEmpty }
        await waitFor(vm.$notes) { $0.count == 1 && $0[0].tagIds.isEmpty }
    }

    func testViewModelIsReleased() async {
        weak var weakVM: NotesViewModel?
        do {
            let vm = await started()
            weakVM = vm
        }
        await Task.yield()
        XCTAssertNil(weakVM)
    }
}
