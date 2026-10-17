import HusrevityModels
import HusrevityTestSupport
import XCTest

@testable import HusrevityNetwork

final class APIClientWriteTests: XCTestCase {
    private let base = URL(string: "https://api.test/api")!
    /// 2026-10-17T21:02:07.345Z
    private let stamp = Date(timeIntervalSince1970: 1_792_270_927.345)

    private func client(_ transport: FakeTransport) -> APIClient {
        APIClient(
            baseURL: base, transport: transport,
            tokenStore: InMemoryTokenStore(access: "AT", refresh: "RT")
        )
    }

    private func assertWrite(
        _ req: URLRequest?, method: String, path: String, key: String, ifMatch: String?,
        hasBody: Bool, file: StaticString = #filePath, line: UInt = #line
    ) throws {
        let req = try XCTUnwrap(req, file: file, line: line)
        XCTAssertEqual(req.httpMethod, method, file: file, line: line)
        XCTAssertEqual(req.url?.absoluteString, "https://api.test/api" + path, file: file, line: line)
        XCTAssertEqual(req.header("Authorization"), "Bearer AT", file: file, line: line)
        XCTAssertEqual(req.header("Idempotency-Key"), key, file: file, line: line)
        XCTAssertEqual(req.header("If-Match"), ifMatch, file: file, line: line)
        XCTAssertEqual(req.header("Content-Type"), hasBody ? "application/json" : nil, file: file, line: line)
        XCTAssertEqual(req.httpBody != nil, hasBody, file: file, line: line)
    }

    // MARK: notes

    func testCreateNote() async throws {
        let transport = FakeTransport(status: 201, body: try Fixtures.data("note-created"))
        let note = try await client(transport).createNote(
            NoteRequest(title: "Created offline", bodyMarkdown: "body", tagIds: ["3"]),
            idempotencyKey: "key-1"
        )
        try assertWrite(transport.requests.first, method: "POST", path: "/notes", key: "key-1", ifMatch: nil, hasBody: true)
        XCTAssertEqual(
            transport.requests.first?.bodyJSON as? NSDictionary,
            ["title": "Created offline", "bodyMarkdown": "body", "tagIds": ["3"]] as NSDictionary
        )
        XCTAssertEqual(note.title, "Created offline")
    }

    func testUpdateNoteSendsPutWithIfMatchEpochMillis() async throws {
        let transport = FakeTransport(status: 200, body: try Fixtures.data("note-updated"))
        let note = try await client(transport).updateNote(
            id: "2", NoteRequest(title: "T", pinned: true, colorHex: "#fff"),
            idempotencyKey: "key-2", ifMatch: stamp
        )
        try assertWrite(
            transport.requests.first, method: "PUT", path: "/notes/2", key: "key-2",
            ifMatch: "1792270927345", hasBody: true
        )
        XCTAssertEqual(
            transport.requests.first?.bodyJSON as? NSDictionary,
            ["title": "T", "pinned": true, "colorHex": "#fff"] as NSDictionary
        )
        XCTAssertFalse(note.id.isEmpty)
    }

    func testUpdateNoteWithoutIfMatchOmitsHeader() async throws {
        let transport = FakeTransport(status: 200, body: try Fixtures.data("note-updated"))
        _ = try await client(transport).updateNote(
            id: "2", NoteRequest(title: "T"), idempotencyKey: "k", ifMatch: nil
        )
        XCTAssertNil(transport.requests.first?.header("If-Match"))
    }

    func testDeleteNoteHandles204EmptyBody() async throws {
        let transport = FakeTransport(status: 204, body: Data())
        try await client(transport).deleteNote(id: "2", idempotencyKey: "key-3", ifMatch: stamp)
        try assertWrite(
            transport.requests.first, method: "DELETE", path: "/notes/2", key: "key-3",
            ifMatch: "1792270927345", hasBody: false
        )
    }

    func testStaleUpdateSurfacesConflict() async throws {
        let transport = FakeTransport(status: 409, body: try Fixtures.data("note-409"))
        do {
            _ = try await client(transport).updateNote(
                id: "2", NoteRequest(title: "T"), idempotencyKey: "k", ifMatch: stamp
            )
            XCTFail("expected throw")
        } catch let error as APIError {
            guard case .conflict = error else { return XCTFail("got \(error)") }
        }
    }

    // MARK: note tags

    func testCreateNoteTag() async throws {
        let transport = FakeTransport(status: 201, body: envelope(#"{"id":"7","name":"work","color":"aabbcc"}"#, code: 201))
        let tag = try await client(transport).createNoteTag(
            NoteTagRequest(name: "work", color: "aabbcc"), idempotencyKey: "key-t"
        )
        try assertWrite(transport.requests.first, method: "POST", path: "/note-tags", key: "key-t", ifMatch: nil, hasBody: true)
        XCTAssertEqual(transport.requests.first?.bodyJSON as? NSDictionary, ["name": "work", "color": "aabbcc"] as NSDictionary)
        XCTAssertEqual(tag, NoteTagResponse(id: "7", name: "work", color: "aabbcc"))
    }

    func testCreateNoteTagWithoutColorOmitsKey() async throws {
        let transport = FakeTransport(status: 201, body: envelope(#"{"id":"7","name":"work","color":null}"#, code: 201))
        _ = try await client(transport).createNoteTag(NoteTagRequest(name: "work"), idempotencyKey: "k")
        XCTAssertEqual(transport.requests.first?.bodyJSON as? NSDictionary, ["name": "work"] as NSDictionary)
    }

    func testDeleteNoteTagSendsNoIfMatch() async throws {
        let transport = FakeTransport(status: 204, body: Data())
        try await client(transport).deleteNoteTag(id: "7", idempotencyKey: "key-t2")
        try assertWrite(transport.requests.first, method: "DELETE", path: "/note-tags/7", key: "key-t2", ifMatch: nil, hasBody: false)
    }

    // MARK: items

    private func itemBody(_ extra: String = "") -> Data {
        envelope(
            #"{"id":"5","kind":"task","title":"T","notes":null,"context":null,"projectId":null,"goalId":null,"blockId":null,"scheduledAt":null,"durationMin":null,"dueAt":null,"notifyMinutesBefore":null,"rrule":null,"status":"open","completedAt":null,"payload":{},"source":"web","createdAt":"2026-10-17T21:02:07.345Z","updatedAt":"2026-10-17T21:02:07.345Z"\#(extra)}"#
        )
    }

    func testCreateItemEncodesDatesAsISOAndOmitsNil() async throws {
        let transport = FakeTransport(status: 201, body: itemBody())
        let item = try await client(transport).createItem(
            ItemRequest(kind: "task", title: "T", scheduledAt: stamp, durationMin: 30, payload: .object(["a": .number(1)])),
            idempotencyKey: "key-i"
        )
        try assertWrite(transport.requests.first, method: "POST", path: "/items", key: "key-i", ifMatch: nil, hasBody: true)
        XCTAssertEqual(
            transport.requests.first?.bodyJSON as? NSDictionary,
            [
                "kind": "task", "title": "T", "scheduledAt": "2026-10-17T21:02:07.345Z",
                "durationMin": 30, "payload": ["a": 1],
            ] as NSDictionary
        )
        XCTAssertEqual(item.id, "5")
    }

    func testUpdateItemDistinguishesAbsentFromNull() async throws {
        let transport = FakeTransport(status: 200, body: itemBody())
        var patch = ItemUpdateRequest()
        patch.title = "New"
        patch.goalId = .null  // clear
        patch.dueAt = .value(stamp)  // set
        // notes left .absent: must not appear at all
        _ = try await client(transport).updateItem(id: "5", patch, idempotencyKey: "key-i2", ifMatch: stamp)

        try assertWrite(
            transport.requests.first, method: "PATCH", path: "/items/5", key: "key-i2",
            ifMatch: "1792270927345", hasBody: true
        )
        let json = try XCTUnwrap(transport.requests.first?.bodyJSON)
        XCTAssertEqual(Set(json.keys), ["title", "goalId", "dueAt"])
        XCTAssertTrue(json["goalId"] is NSNull)
        XCTAssertEqual(json["dueAt"] as? String, "2026-10-17T21:02:07.345Z")
        XCTAssertEqual(json["title"] as? String, "New")
    }

    func testEmptyItemUpdateSendsEmptyObject() async throws {
        let transport = FakeTransport(status: 200, body: itemBody())
        _ = try await client(transport).updateItem(id: "5", ItemUpdateRequest(), idempotencyKey: "k", ifMatch: nil)
        XCTAssertEqual(transport.requests.first?.bodyJSON?.count, 0)
        XCTAssertEqual(transport.requests.first?.httpBody, Data("{}".utf8))
    }

    func testDeleteItem() async throws {
        let transport = FakeTransport(status: 204, body: Data())
        try await client(transport).deleteItem(id: "5", idempotencyKey: "key-i3", ifMatch: stamp)
        try assertWrite(
            transport.requests.first, method: "DELETE", path: "/items/5", key: "key-i3",
            ifMatch: "1792270927345", hasBody: false
        )
    }

    func testCompleteItemPlain() async throws {
        let transport = FakeTransport(status: 200, body: itemBody())
        _ = try await client(transport).completeItem(id: "5", idempotencyKey: "key-i4", ifMatch: stamp)
        try assertWrite(
            transport.requests.first, method: "POST", path: "/items/5/complete", key: "key-i4",
            ifMatch: "1792270927345", hasBody: true
        )
        XCTAssertEqual(transport.requests.first?.httpBody, Data("{}".utf8))
    }

    func testCompleteRecurringItemSendsOccursOn() async throws {
        let transport = FakeTransport(status: 200, body: itemBody(#","occursOn":"2026-10-18""#))
        _ = try await client(transport).completeItem(
            id: "5", CompleteItemRequest(occursOn: "2026-10-18"), idempotencyKey: "k", ifMatch: nil
        )
        XCTAssertEqual(transport.requests.first?.bodyJSON as? NSDictionary, ["occursOn": "2026-10-18"] as NSDictionary)
    }

    // MARK: projects

    private let projectBody = envelope(
        #"{"id":"9","code":"P","name":"N","description":null,"status":"active","startDate":null,"endDate":null,"goalId":null,"pinned":false,"archived":false,"createdAt":"2026-10-17T21:02:07.345Z","updatedAt":"2026-10-17T21:02:07.345Z","ownerId":"1","ownerName":null,"role":"OWNER","shared":false,"memberCount":1}"#
    )

    func testCreateProject() async throws {
        let transport = FakeTransport(status: 201, body: projectBody)
        let project = try await client(transport).createProject(
            ProjectRequest(code: "P", name: "N", goalId: "4"), idempotencyKey: "key-p"
        )
        try assertWrite(transport.requests.first, method: "POST", path: "/projects", key: "key-p", ifMatch: nil, hasBody: true)
        XCTAssertEqual(
            transport.requests.first?.bodyJSON as? NSDictionary,
            ["code": "P", "name": "N", "goalId": "4"] as NSDictionary
        )
        XCTAssertEqual(project.id, "9")
    }

    func testUpdateProjectUsesPutAndTriState() async throws {
        let transport = FakeTransport(status: 200, body: projectBody)
        var patch = ProjectUpdateRequest()
        patch.pinned = true
        patch.goalId = .null
        patch.description = .value("d")
        _ = try await client(transport).updateProject(id: "9", patch, idempotencyKey: "key-p2", ifMatch: stamp)
        try assertWrite(
            transport.requests.first, method: "PUT", path: "/projects/9", key: "key-p2",
            ifMatch: "1792270927345", hasBody: true
        )
        let json = try XCTUnwrap(transport.requests.first?.bodyJSON)
        XCTAssertEqual(Set(json.keys), ["pinned", "goalId", "description"])
        XCTAssertTrue(json["goalId"] is NSNull)
    }

    func testDeleteProject() async throws {
        let transport = FakeTransport(status: 204, body: Data())
        try await client(transport).deleteProject(id: "9", idempotencyKey: "key-p3", ifMatch: stamp)
        try assertWrite(
            transport.requests.first, method: "DELETE", path: "/projects/9", key: "key-p3",
            ifMatch: "1792270927345", hasBody: false
        )
    }

    // MARK: goals

    private let goalBody = envelope(
        #"{"id":"3","ownerId":"1","title":"G","notes":null,"horizon":"year","periodStart":"2026-01-01","periodEnd":"2026-12-31","parentGoalId":null,"status":"active","progress":{"total":0,"done":0,"open":0,"percent":0},"createdAt":"2026-10-17T21:02:07.345Z","updatedAt":"2026-10-17T21:02:07.345Z"}"#
    )

    func testCreateGoalIgnoresServerOnlyProgressField() async throws {
        let transport = FakeTransport(status: 201, body: goalBody)
        let goal = try await client(transport).createGoal(
            GoalRequest(title: "G", horizon: "year", periodStart: "2026-01-01", periodEnd: "2026-12-31"),
            idempotencyKey: "key-g"
        )
        try assertWrite(transport.requests.first, method: "POST", path: "/goals", key: "key-g", ifMatch: nil, hasBody: true)
        XCTAssertEqual(
            transport.requests.first?.bodyJSON as? NSDictionary,
            ["title": "G", "horizon": "year", "periodStart": "2026-01-01", "periodEnd": "2026-12-31"] as NSDictionary
        )
        XCTAssertEqual(goal.id, "3")
    }

    func testUpdateGoalPatchesWithNullParent() async throws {
        let transport = FakeTransport(status: 200, body: goalBody)
        var patch = GoalUpdateRequest()
        patch.status = "done"
        patch.parentGoalId = .null
        _ = try await client(transport).updateGoal(id: "3", patch, idempotencyKey: "key-g2", ifMatch: stamp)
        try assertWrite(
            transport.requests.first, method: "PATCH", path: "/goals/3", key: "key-g2",
            ifMatch: "1792270927345", hasBody: true
        )
        let json = try XCTUnwrap(transport.requests.first?.bodyJSON)
        XCTAssertEqual(Set(json.keys), ["status", "parentGoalId"])
        XCTAssertTrue(json["parentGoalId"] is NSNull)
    }

    func testDeleteGoal() async throws {
        let transport = FakeTransport(status: 204, body: Data())
        try await client(transport).deleteGoal(id: "3", idempotencyKey: "key-g3", ifMatch: stamp)
        try assertWrite(
            transport.requests.first, method: "DELETE", path: "/goals/3", key: "key-g3",
            ifMatch: "1792270927345", hasBody: false
        )
    }
}
