import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

@MainActor
final class ProjectsViewModelTests: ViewModelTestCase {
    private func makeVM() -> ProjectsViewModel { ProjectsViewModel(store: store, notifyLocalChange: notify) }

    private func started() async -> ProjectsViewModel {
        let vm = makeVM()
        vm.start()
        await waitFor(vm.$isLoaded) { $0 }
        return vm
    }

    @discardableResult
    private func makeProject(
        _ name: String, code: String? = nil, archived: Bool = false, pinned: Bool = false, role: String = "OWNER"
    ) throws -> ProjectRecord {
        try store.create(
            ProjectRecord(code: code ?? name.uppercased(), name: name, pinned: pinned, archived: archived, role: role))
    }

    func testEmptyState() async {
        let vm = await started()
        XCTAssertTrue(vm.isEmpty)
        XCTAssertTrue(vm.rows.isEmpty)
    }

    func testRowsCarryOpenAndDoneCountsAndIgnoreCancelledAndOtherProjects() async throws {
        let alpha = try makeProject("Alpha")
        let beta = try makeProject("Beta")
        try makeItem("a1", projectId: alpha.reference)
        try makeItem("a2", projectId: alpha.reference)
        try makeItem("a3", status: "done", projectId: alpha.reference)
        try makeItem("a4", status: "cancelled", projectId: alpha.reference)
        try makeItem("b1", projectId: beta.reference)
        try makeItem("no project")
        let vm = await started()
        await waitFor(vm.$rows) { $0.first?.openCount == 2 }
        let a = try XCTUnwrap(vm.rows.first { $0.project.name == "Alpha" })
        XCTAssertEqual(a.openCount, 2)
        XCTAssertEqual(a.doneCount, 1)
        XCTAssertEqual(a.summary, "2 açık · 1 tamamlandı")
        let b = try XCTUnwrap(vm.rows.first { $0.project.name == "Beta" })
        XCTAssertEqual(b.openCount, 1)
        XCTAssertEqual(b.doneCount, 0)
    }

    func testItemsReferencingTheProjectByServerIdAreCounted() async throws {
        let project = try makeProject("Alpha")
        try store.remapServerId(entity: .project, localId: project.localId, serverId: "77")
        try makeItem("by server id", projectId: "77")
        let vm = await started()
        await waitFor(vm.$rows) { $0.first?.openCount == 1 }
    }

    func testArchivedToggleSwitchesTheList() async throws {
        try makeProject("Live")
        try makeProject("Old", archived: true)
        let vm = await started()
        XCTAssertEqual(vm.rows.map(\.project.name), ["Live"])
        vm.showArchived = true
        await waitFor(vm.$rows) { $0.map(\.project.name) == ["Old"] }
    }

    func testPinnedProjectsSortFirst() async throws {
        try makeProject("Alpha")
        try makeProject("Zeta", pinned: true)
        let vm = await started()
        XCTAssertEqual(vm.rows.map(\.project.name), ["Zeta", "Alpha"])
    }

    // MARK: Create

    func testCreateValidatesNameAndCode() async throws {
        let vm = await started()
        XCTAssertNil(vm.create(code: "ABC", name: "  "))
        XCTAssertEqual(vm.errorMessage, L10n.Projects.nameRequired)
        XCTAssertNil(vm.create(code: " ", name: "Name"))
        XCTAssertEqual(vm.errorMessage, L10n.Projects.codeRequired)
        XCTAssertNil(vm.create(code: "has space", name: "Name"))
        XCTAssertEqual(vm.errorMessage, L10n.Projects.codeInvalid)
        XCTAssertNil(vm.create(code: String(repeating: "A", count: 33), name: "Name"))
        XCTAssertEqual(vm.errorMessage, L10n.Projects.codeInvalid)
        XCTAssertEqual(changeNotifications, 0)
        XCTAssertTrue(try store.projects().isEmpty)
    }

    func testCreateAcceptsTurkishLettersAndRefusesDuplicateCodes() async throws {
        let vm = await started()
        let ok = try XCTUnwrap(vm.create(code: "ÇALIŞMA-1", name: "Çalışma", description: "d"))
        XCTAssertEqual(ok.code, "ÇALIŞMA-1")
        XCTAssertEqual(ok.description, "d")
        XCTAssertEqual(changeNotifications, 1)
        XCTAssertNil(vm.create(code: "çalışma-1", name: "Again"))
        XCTAssertEqual(vm.errorMessage, L10n.Projects.codeTaken)
        await waitFor(vm.$rows) { $0.count == 1 }
        XCTAssertEqual(try store.outbox().filter { $0.entity == .project }.map(\.op), [.create])
    }

    func testSuggestedCodeIsAnAsciiUppercaseSlug() {
        XCTAssertEqual(ProjectsViewModel.suggestedCode(from: "Nakliya Takip"), "NAKLIYA-TAKIP")
        XCTAssertEqual(ProjectsViewModel.suggestedCode(from: "  Çalışma  planı! "), "CALISMA-PLANI")
        XCTAssertEqual(ProjectsViewModel.suggestedCode(from: "???"), "")
        XCTAssertEqual(ProjectsViewModel.suggestedCode(from: String(repeating: "a", count: 40)).count, 16)
    }

    // MARK: Update

    func testUpdateChangesNameDescriptionAndKeepsTheCode() async throws {
        let project = try makeProject("Alpha", code: "ALPHA")
        let vm = await started()
        XCTAssertTrue(vm.update(vm.rows[0].project, name: "Alpha 2", description: "new"))
        await waitFor(vm.$rows) { $0.first?.project.name == "Alpha 2" }
        XCTAssertEqual(vm.rows[0].project.code, "ALPHA")
        XCTAssertEqual(vm.rows[0].project.description, "new")
        XCTAssertEqual(vm.rows[0].project.localId, project.localId)
        XCTAssertFalse(vm.update(vm.rows[0].project, name: " ", description: nil))
        XCTAssertEqual(vm.errorMessage, L10n.Projects.nameRequired)
    }

    func testPinArchiveDelete() async throws {
        try makeProject("Alpha")
        let vm = await started()
        vm.togglePin(vm.rows[0].project)
        await waitFor(vm.$rows) { $0.first?.project.pinned == true }
        vm.setArchived(vm.rows[0].project, true)
        await waitFor(vm.$rows) { $0.isEmpty }
        vm.showArchived = true
        await waitFor(vm.$rows) { $0.count == 1 }
        vm.delete(vm.rows[0].project)
        await waitFor(vm.$rows) { $0.isEmpty }
        XCTAssertEqual(changeNotifications, 3)
    }

    func testViewersCannotEditOrDelete() async throws {
        try makeProject("Shared", role: "VIEWER")
        let vm = await started()
        let project = vm.rows[0].project
        XCTAssertFalse(vm.canEdit(project))
        XCTAssertFalse(vm.canDelete(project))
        vm.togglePin(project)
        XCTAssertEqual(vm.errorMessage, L10n.Projects.readOnly)
        XCTAssertEqual(changeNotifications, 0)
    }

    func testEditorsCanEditButNotDelete() async throws {
        try makeProject("Shared", role: "EDITOR")
        let vm = await started()
        XCTAssertTrue(vm.canEdit(vm.rows[0].project))
        XCTAssertFalse(vm.canDelete(vm.rows[0].project))
    }

    // MARK: Tasks in a project

    func testAddTaskAttachesItToTheProjectAndUpdatesCounts() async throws {
        let project = try makeProject("Alpha")
        let vm = await started()
        let item = try XCTUnwrap(vm.addTask(title: " write spec ", to: project))
        XCTAssertEqual(item.projectId, project.reference)
        XCTAssertEqual(item.title, "write spec")
        XCTAssertEqual(item.source, "macos")
        await waitFor(vm.$rows) { $0.first?.openCount == 1 }
        XCTAssertEqual(vm.items(in: project).map(\.title), ["write spec"])
        XCTAssertNil(vm.addTask(title: "  ", to: project))

        vm.complete(item)
        await waitFor(vm.$rows) { $0.first?.doneCount == 1 && $0.first?.openCount == 0 }
        XCTAssertEqual(changeNotifications, 2)
    }

    func testViewModelIsReleased() async {
        weak var weakVM: ProjectsViewModel?
        do {
            let vm = await started()
            weakVM = vm
        }
        await Task.yield()
        XCTAssertNil(weakVM)
    }
}
