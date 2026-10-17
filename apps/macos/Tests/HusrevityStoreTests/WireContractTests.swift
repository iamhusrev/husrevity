import Foundation
import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

/// Pins the outbox bodies against the REAL server request DTOs (parsed from apps/api at test
/// time). The API runs `whitelist: true, forbidNonWhitelisted: false`, so unknown keys would be
/// silently dropped rather than rejected; the test treats them as bugs anyway because a dropped
/// field is a lost edit.
final class WireContractTests: StoreTestCase {
    private var apiSrc: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()  // Tests
            .deletingLastPathComponent().deletingLastPathComponent()  // apps
            .appendingPathComponent("api/src")
    }

    private func source(_ relative: String) throws -> String {
        let url = apiSrc.appendingPathComponent(relative)
        guard let text = try? String(contentsOf: url, encoding: .utf8) else {
            throw XCTSkip("API sources not available at \(url.path)")
        }
        return text
    }

    /// Property names of `export class <name>`; `required` are the ones declared with `!`.
    private func dtoKeys(_ file: String, _ name: String) throws -> (all: Set<String>, required: Set<String>) {
        let text = try source(file)
        guard let start = text.range(of: "export class \(name) ") else {
            XCTFail("class \(name) not found in \(file)")
            return ([], [])
        }
        var body = String(text[start.lowerBound...])
        if let next = body.range(of: "\nexport ", range: body.index(body.startIndex, offsetBy: 10)..<body.endIndex) {
            body = String(body[..<next.lowerBound])
        }
        if let partial = body.range(of: #"PartialType\((\w+)\)"#, options: .regularExpression) {
            let parent = String(body[partial]).dropFirst("PartialType(".count).dropLast()
            return (try dtoKeys(file, String(parent)).all, [])
        }
        var all = Set<String>(), required = Set<String>()
        for line in body.split(separator: "\n") {
            guard line.hasPrefix("  "), !line.hasPrefix("   "), let colon = line.firstIndex(of: ":") else { continue }
            let head = line[line.index(line.startIndex, offsetBy: 2)..<colon]
            guard let last = head.last, "?!".contains(last) || head.allSatisfy({ $0.isLetter || $0.isNumber }) else { continue }
            let key = head.trimmingCharacters(in: CharacterSet(charactersIn: "?!"))
            guard !key.isEmpty, key.allSatisfy({ $0.isLetter || $0.isNumber }) else { continue }
            all.insert(key)
            if last == "!" { required.insert(key) }
        }
        return (all, required)
    }

    private func constants(_ file: String, _ name: String) throws -> Set<String> {
        let text = try source(file)
        guard let start = text.range(of: "export const \(name)"),
            let end = text.range(of: "];", range: start.upperBound..<text.endIndex)
        else { return [] }
        let list = text[start.upperBound..<end.upperBound]
        let eq = list.firstIndex(of: "=") ?? list.startIndex
        let values = list[eq...].components(separatedBy: "'").enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
        return Set(values)
    }

    private func body(_ entry: OutboxEntry?) throws -> [String: JSONValue] {
        try XCTUnwrap(entry).payload.objectValue
    }

    private func assertContract(
        _ payload: [String: JSONValue], _ dto: (all: Set<String>, required: Set<String>),
        file: StaticString = #filePath, line: UInt = #line
    ) {
        XCTAssertEqual(Set(payload.keys).subtracting(dto.all), [], "keys the server DTO does not declare", file: file, line: line)
        XCTAssertEqual(dto.required.subtracting(payload.keys), [], "required keys missing", file: file, line: line)
    }

    private func assertEnum(
        _ value: JSONValue?, _ constant: String, _ file: String, line: UInt = #line
    ) throws {
        let allowed = try constants(file, constant)
        XCTAssertFalse(allowed.isEmpty, "could not parse \(constant)", line: line)
        XCTAssertTrue(allowed.contains(value?.stringValue ?? ""), "\(constant) rejects \(String(describing: value))", line: line)
    }

    func testItemCreateAndUpdateBodiesMatchTheServerDto() throws {
        let file = "item/dto/item-dtos.ts"
        let created = try store.create(ItemRecord(title: "x", scheduledAt: Date(), durationMin: 10, rrule: "FREQ=DAILY"))
        let create = try body(store.nextPending())
        assertContract(create, try dtoKeys(file, "ItemRequestDto"))
        try assertEnum(create["kind"], "ITEM_KINDS", file)
        try assertEnum(create["status"], "ITEM_STATUSES", file)
        try assertEnum(create["source"], "ITEM_SOURCES", file)

        try store.update(ItemRecord.self, localId: created.localId) {
            $0.title = "y"; $0.notes = "n"; $0.context = "c"; $0.dueAt = Date(); $0.status = "done"
            $0.notifyMinutesBefore = 5; $0.durationMin = nil
        }
        let update = try body(store.outbox().last)
        XCTAssertFalse(update.isEmpty)
        assertContract(update, (try dtoKeys(file, "ItemUpdateRequestDto").all, []))
    }

    func testNoteBodiesMatchTheServerDto() throws {
        let file = "note/dto/note-dtos.ts"
        let tag = try store.create(NoteTagRecord(name: "t", color: "#fff"))
        assertContract(try body(store.nextPending()), try dtoKeys(file, "TagRequestDto"))
        let note = try store.create(NoteRecord(title: "n", colorHex: "#000", tagIds: [tag.localId]))
        assertContract(try body(store.outbox().last), try dtoKeys(file, "NoteRequestDto"))
        try store.update(NoteRecord.self, localId: note.localId) { $0.pinned = true; $0.bodyMarkdown = "b" }
        assertContract(try body(store.outbox().last), try dtoKeys(file, "NoteRequestDto"))
    }

    func testProjectBodiesMatchTheServerDto() throws {
        let file = "project/dto/project-dtos.ts"
        let project = try store.create(
            ProjectRecord(code: "P", name: "n", description: "d", startDate: "2026-01-01", endDate: "2026-02-01")
        )
        assertContract(try body(store.nextPending()), try dtoKeys(file, "ProjectRequestDto"))
        try store.update(ProjectRecord.self, localId: project.localId) {
            $0.name = "m"; $0.description = "e"; $0.status = "done"; $0.startDate = nil; $0.endDate = "2026-03-01"
            $0.pinned = true; $0.archived = true; $0.goalId = "5"
        }
        let update = try body(store.outbox().last)
        XCTAssertEqual(Set(update.keys), ["name", "description", "status", "startDate", "endDate", "pinned", "archived", "goalId"])
        assertContract(update, (try dtoKeys(file, "ProjectUpdateRequestDto").all, []))
    }

    func testGoalBodiesMatchTheServerDto() throws {
        let file = "goal/dto/goal-dtos.ts"
        let goal = try store.create(GoalRecord(title: "g", horizon: "year", periodStart: "2026-01-01", periodEnd: "2026-12-31"))
        let create = try body(store.nextPending())
        assertContract(create, try dtoKeys(file, "GoalRequestDto"))
        try assertEnum(create["horizon"], "GOAL_HORIZONS", file)
        try assertEnum(create["status"], "GOAL_STATUSES", file)
        try store.update(GoalRecord.self, localId: goal.localId) { $0.title = "h"; $0.status = "done"; $0.notes = "n" }
        assertContract(try body(store.outbox().last), (try dtoKeys(file, "GoalUpdateRequestDto").all, []))
    }

    func testParserFindsTheExpectedKeys() throws {
        // Guards the test's own parser: a silent empty set would make every contract test vacuous.
        XCTAssertTrue(try dtoKeys("item/dto/item-dtos.ts", "ItemRequestDto").all.isSuperset(of: ["kind", "title", "payload"]))
        XCTAssertEqual(try dtoKeys("item/dto/item-dtos.ts", "ItemRequestDto").required, ["kind", "title"])
        XCTAssertTrue(try constants("item/dto/item-dtos.ts", "ITEM_KINDS") == ["task", "event", "log"])
    }
}
