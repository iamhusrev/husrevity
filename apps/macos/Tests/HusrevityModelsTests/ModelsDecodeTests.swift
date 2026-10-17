import HusrevityTestSupport
import XCTest
@testable import HusrevityModels

/// Decodes the real API responses captured by `apps/api/src/sync/fixtures.integration.spec.ts`.
final class ModelsDecodeTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        try Fixtures.data(name)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try APICoding.decoder.decode(type, from: fixture(name))
    }

    func testLoginEnvelope() throws {
        let env = try decode(Envelope<AuthResponse>.self, "login")
        XCTAssertTrue(env.success)
        XCTAssertEqual(env.code, 200)
        let auth = try XCTUnwrap(env.data)
        XCTAssertEqual(auth.accessToken, "fixture-access-token")
        XCTAssertEqual(auth.refreshToken, "fixture-refresh-token")
        XCTAssertEqual(auth.user.id, "1")
        XCTAssertEqual(auth.user.email, "fixture@example.com")
        XCTAssertNil(auth.user.navPreferences)
    }

    func testFullSyncDecodesEveryCollection() throws {
        let sync = try XCTUnwrap(decode(Envelope<SyncResponse>.self, "sync-full").data)

        XCTAssertEqual(sync.items.map(\.title), ["Run", "Pay rent"])
        XCTAssertEqual(sync.itemOccurrences.count, 1)
        XCTAssertEqual(sync.notes.count, 1)
        XCTAssertEqual(sync.noteTags.count, 1)
        XCTAssertEqual(sync.projects.count, 1)
        XCTAssertEqual(sync.goals.count, 1)
        XCTAssertEqual(sync.tombstones, SyncTombstones.empty)
        XCTAssertNotNil(ISO8601DateFormatter.fractional.date(from: sync.cursor), "cursor must stay a parsable ISO string")
    }

    func testItemFields() throws {
        let sync = try XCTUnwrap(decode(Envelope<SyncResponse>.self, "sync-full").data)
        let run = try XCTUnwrap(sync.items.first)

        XCTAssertEqual(run.id, "1")
        XCTAssertEqual(run.kind, "task")
        XCTAssertEqual(run.rrule, "FREQ=DAILY")
        XCTAssertEqual(run.durationMin, 30)
        XCTAssertEqual(run.notifyMinutesBefore, 10)
        XCTAssertEqual(run.status, "open")
        XCTAssertNil(run.dueAt)
        XCTAssertNil(run.completedAt)
        XCTAssertEqual(run.payload, .object([:]))
        XCTAssertEqual(run.scheduledAt, ISO8601DateFormatter.fractional.date(from: "2026-02-01T05:00:00.000Z"))
    }

    func testOccurrenceNoteProjectAndGoalFields() throws {
        let sync = try XCTUnwrap(decode(Envelope<SyncResponse>.self, "sync-full").data)

        let occurrence = try XCTUnwrap(sync.itemOccurrences.first)
        XCTAssertEqual(occurrence.itemId, "1")
        XCTAssertEqual(occurrence.occursOn, "2026-02-03")
        XCTAssertEqual(occurrence.status, "done")
        XCTAssertNotNil(occurrence.completedAt)

        let note = try XCTUnwrap(sync.notes.first)
        XCTAssertEqual(note.bodyMarkdown, "# Plan\n- ship sync")
        XCTAssertEqual(note.tags, [NoteTagRef(id: "1", name: "work", color: "#3366ff")])

        let tag = try XCTUnwrap(sync.noteTags.first)
        XCTAssertEqual(tag.name, "work")

        let project = try XCTUnwrap(sync.projects.first)
        XCTAssertEqual(project.code, "HOME")
        XCTAssertEqual(project.role, "OWNER")
        XCTAssertEqual(project.memberCount, 1)

        let goal = try XCTUnwrap(sync.goals.first)
        XCTAssertEqual(goal.horizon, "month")
        XCTAssertEqual(goal.periodStart, "2026-02-01")
        XCTAssertNil(goal.parentGoalId)
    }

    func testIncrementalSyncCarriesTombstonesAndTheNoteWithoutItsDeletedTag() throws {
        let sync = try XCTUnwrap(decode(Envelope<SyncResponse>.self, "sync-incremental").data)

        XCTAssertEqual(sync.tombstones.items, ["2"])
        XCTAssertEqual(sync.tombstones.itemOccurrences, ["1"])
        XCTAssertEqual(sync.tombstones.noteTags, ["1"])
        XCTAssertEqual(sync.tombstones.notes, [])
        XCTAssertEqual(sync.notes.first?.tags, [])
        XCTAssertEqual(sync.goals.first?.title, "Ship the Mac app (v1)")
    }

    func testConflictEnvelopeHasNoData() throws {
        let env = try decode(Envelope<JSONValue>.self, "note-409")
        XCTAssertFalse(env.success)
        XCTAssertEqual(env.code, 409)
        XCTAssertNil(env.data)
        XCTAssertTrue(env.message.contains("modified since you last fetched it"))
    }

    func testCreatedNote() throws {
        let note = try XCTUnwrap(decode(Envelope<NoteDTO>.self, "note-created").data)
        XCTAssertEqual(note.title, "Created offline")
        XCTAssertEqual(note.tags, [])
    }

    func testUnknownFieldsAreIgnored() throws {
        let json = #"{"id":"9","name":"x","color":null,"updatedAt":"2026-01-01T00:00:00.000Z","somethingNew":1}"#
        let tag = try APICoding.decoder.decode(NoteTagDTO.self, from: Data(json.utf8))
        XCTAssertEqual(tag.id, "9")
    }

    func testEpochMillisecondsMatchesTheIfMatchContract() throws {
        // The server compares `updatedAt.getTime()`; 1792270765134 is Date.parse of this string in JS.
        let json = #"{"id":"9","name":"x","color":null,"updatedAt":"2026-10-17T20:59:25.134Z"}"#
        let tag = try APICoding.decoder.decode(NoteTagDTO.self, from: Data(json.utf8))
        XCTAssertEqual(tag.updatedAt.epochMilliseconds, 1_792_270_765_134)
    }

    func testDatesWithoutFractionalSecondsAlsoDecode() throws {
        let json = #"{"id":"9","name":"x","color":null,"updatedAt":"2026-10-17T20:59:25Z"}"#
        let tag = try APICoding.decoder.decode(NoteTagDTO.self, from: Data(json.utf8))
        XCTAssertEqual(tag.updatedAt.epochMilliseconds, 1_792_270_765_000)
    }

    func testEncodingRoundTripsDatesWithMilliseconds() throws {
        let note = try XCTUnwrap(decode(Envelope<NoteDTO>.self, "note-created").data)
        let data = try APICoding.encoder.encode(note)
        let again = try APICoding.decoder.decode(NoteDTO.self, from: data)
        XCTAssertEqual(again, note)
    }
}
