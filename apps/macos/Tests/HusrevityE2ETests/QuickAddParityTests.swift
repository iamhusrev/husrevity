import HusrevityCore
import XCTest

/// Scenario 7: the Turkish quick-add parser running in JavaScriptCore produces what the server
/// would, and the resulting item round-trips through the API.
final class QuickAddParityTests: E2ECase {
    private let istanbul = TimeZone(identifier: "Europe/Istanbul")!

    func testQuickAddItemIsPushedWithTheParsedScheduleAndTitle() async throws {
        let js = try CoreJS()
        // Sunday 2026-10-18 13:00 Istanbul: "yarın 9da" is Monday 2026-10-19 09:00 Istanbul = 06:00Z.
        let now = try XCTUnwrap(isoDate("2026-10-18T10:00:00.000Z"))
        let draft = try js.parseQuickAdd("yarın 9da HGS kontrol", now: now, timeZone: istanbul)
        XCTAssertEqual(draft.title, "HGS kontrol")
        XCTAssertEqual(draft.scheduledAt, "2026-10-19T06:00:00.000Z")
        let scheduledAt = try XCTUnwrap(draft.scheduledDate)

        let created = try store.create(
            ItemRecord(
                kind: "task", title: draft.title, context: draft.context, scheduledAt: scheduledAt, rrule: draft.rrule))
        try await syncUntilDrained()

        let serverId = try XCTUnwrap(try store.items().first { $0.localId == created.localId }?.serverId)
        let server = try await serverItem(serverId).object
        XCTAssertEqual(server["title"] as? String, "HGS kontrol")
        XCTAssertEqual(isoDate(server["scheduledAt"] as? String ?? ""), scheduledAt)
        XCTAssertEqual(server["scheduledAt"] as? String, "2026-10-19T06:00:00.000Z")
        XCTAssertEqual(server["source"] as? String, "macos")
        XCTAssertEqual(try localItem(titled: "HGS kontrol").scheduledAt, scheduledAt)
    }

    func testLocalParserAgreesWithTheServersParser() async throws {
        let js = try CoreJS()
        let text = "yarın 9da HGS kontrol"
        // The server parses against its own clock; bracket the call so a midnight rollover cannot flake.
        let before = try js.parseQuickAdd(text, now: Date(), timeZone: istanbul)
        let response = try raw.expect(201, try await raw.post("/items/parse-quick-add", ["text": text]))
        let after = try js.parseQuickAdd(text, now: Date(), timeZone: istanbul)

        let serverTitle = response.object["title"] as? String
        let serverScheduledAt = response.object["scheduledAt"] as? String
        XCTAssertEqual(serverTitle, before.title)
        XCTAssertTrue(
            serverScheduledAt == before.scheduledAt || serverScheduledAt == after.scheduledAt,
            "server \(String(describing: serverScheduledAt)) vs local \(String(describing: before.scheduledAt))")
        XCTAssertEqual(response.object["rrule"] as? String, before.rrule)
        XCTAssertEqual(response.object["context"] as? String, before.context)
    }
}
