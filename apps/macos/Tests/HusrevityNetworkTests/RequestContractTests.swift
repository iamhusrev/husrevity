import HusrevityModels
import XCTest

@testable import HusrevityNetwork

/// Pins the JSON keys every request struct can emit to the field names of the server DTO it
/// mirrors, read straight from apps/api/src/**/dto/*.ts. A server-side rename or addition makes
/// one of these fail instead of silently producing a body the server drops (`whitelist: true`).
final class RequestContractTests: XCTestCase {
    private static let apiSrc: URL = {
        // .../apps/macos/Tests/HusrevityNetworkTests/<file> -> .../apps/api/src
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("api/src")
    }()

    /// Property names declared directly in `export class <name>` of the given DTO file.
    private func dtoFields(_ className: String, in relativePath: String) throws -> Set<String> {
        let url = Self.apiSrc.appendingPathComponent(relativePath)
        let source = try XCTUnwrap(
            try? String(contentsOf: url, encoding: .utf8), "cannot read \(url.path)"
        )
        let start = try XCTUnwrap(
            source.range(of: "export class \(className) "), "class \(className) not found in \(relativePath)"
        )
        let rest = source[start.upperBound...]
        let body = rest.range(of: "\n}\n").map { rest[..<$0.lowerBound] } ?? rest
        let regex = try NSRegularExpression(pattern: #"^  ([A-Za-z_]\w*)[?!]?:"#, options: .anchorsMatchLines)
        let text = String(body)
        let names = regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap {
            Range($0.range(at: 1), in: text).map { String(text[$0]) }
        }
        XCTAssertFalse(names.isEmpty, "no fields parsed for \(className)")
        return Set(names)
    }

    private func keys<T: Encodable>(_ value: T) throws -> Set<String> {
        let data = try APICoding.encoder.encode(value)
        return Set(try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any]).keys)
    }

    private let date = Date(timeIntervalSince1970: 1_700_000_000)

    func testAuthRequests() throws {
        XCTAssertEqual(try keys(LoginRequest(email: "a", password: "b")),
                       try dtoFields("LoginRequestDto", in: "auth/dto/auth-dtos.ts"))
        XCTAssertEqual(try keys(RefreshRequest(refreshToken: "r")),
                       try dtoFields("RefreshRequestDto", in: "auth/dto/auth-dtos.ts"))
    }

    func testNoteRequests() throws {
        let note = NoteRequest(title: "t", bodyMarkdown: "b", pinned: true, archived: false, tagIds: ["1"], colorHex: "c")
        XCTAssertEqual(try keys(note), try dtoFields("NoteRequestDto", in: "note/dto/note-dtos.ts"))
        XCTAssertEqual(try keys(NoteTagRequest(name: "n", color: "c")),
                       try dtoFields("TagRequestDto", in: "note/dto/note-dtos.ts"))
    }

    func testItemRequests() throws {
        let create = ItemRequest(
            kind: "task", title: "t", notes: "n", context: "c", projectId: "1", goalId: "2", blockId: "3",
            scheduledAt: date, durationMin: 1, dueAt: date, notifyMinutesBefore: 1, rrule: "r",
            status: "open", payload: .object([:]), source: "macos"
        )
        let createFields = try dtoFields("ItemRequestDto", in: "item/dto/item-dtos.ts")
        XCTAssertEqual(try keys(create), createFields)

        // ItemUpdateRequestDto extends PartialType(ItemRequestDto): same keys, all optional.
        var update = ItemUpdateRequest()
        update.kind = "task"; update.title = "t"; update.notes = .value("n"); update.context = .value("c")
        update.projectId = .value("1"); update.goalId = .value("2"); update.blockId = .value("3")
        update.scheduledAt = .value(date); update.durationMin = .value(1); update.dueAt = .value(date)
        update.notifyMinutesBefore = .value(1); update.rrule = .value("r"); update.status = "open"
        update.payload = .object([:]); update.source = "macos"
        XCTAssertEqual(try keys(update), createFields)

        XCTAssertEqual(try keys(CompleteItemRequest(occursOn: "2026-01-01")),
                       try dtoFields("CompleteItemRequestDto", in: "item/dto/item-dtos.ts"))
    }

    func testProjectRequests() throws {
        let create = ProjectRequest(
            code: "c", name: "n", description: "d", status: "s", startDate: "a", endDate: "b", goalId: "1"
        )
        XCTAssertEqual(try keys(create), try dtoFields("ProjectRequestDto", in: "project/dto/project-dtos.ts"))

        var update = ProjectUpdateRequest()
        update.name = "n"; update.description = .value("d"); update.status = "s"
        update.startDate = .value("a"); update.endDate = .value("b"); update.pinned = true
        update.archived = false; update.goalId = .value("1")
        XCTAssertEqual(try keys(update), try dtoFields("ProjectUpdateRequestDto", in: "project/dto/project-dtos.ts"))
    }

    func testGoalRequests() throws {
        let create = GoalRequest(
            title: "t", notes: "n", horizon: "year", periodStart: "a", periodEnd: "b", parentGoalId: "1", status: "active"
        )
        XCTAssertEqual(try keys(create), try dtoFields("GoalRequestDto", in: "goal/dto/goal-dtos.ts"))

        var update = GoalUpdateRequest()
        update.title = "t"; update.notes = .value("n"); update.horizon = "year"; update.periodStart = "a"
        update.periodEnd = "b"; update.parentGoalId = .value("1"); update.status = "done"
        XCTAssertEqual(try keys(update), try dtoFields("GoalUpdateRequestDto", in: "goal/dto/goal-dtos.ts"))
    }
}
