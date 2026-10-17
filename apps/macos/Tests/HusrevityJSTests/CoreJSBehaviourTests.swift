import XCTest
@testable import HusrevityJS

final class CoreJSBehaviourTests: XCTestCase {
    private let istanbul = TimeZone(identifier: "Europe/Istanbul")!
    /// Sunday 2026-10-18 11:30 in Istanbul.
    private let now = Date(timeIntervalSince1970: 1_792_312_200)

    func testBundleLoadsFromModuleResources() throws {
        XCTAssertNoThrow(try CoreJS())
    }

    func testParsePlainTextKeepsTitleOnly() throws {
        let draft = try CoreJS().parseQuickAdd("sadece bir not", now: now, timeZone: istanbul)
        XCTAssertEqual(draft, ParsedDraft(title: "sadece bir not"))
    }

    func testParseUsesTheGivenNowNotTheSystemClock() throws {
        let draft = try CoreJS().parseQuickAdd("yarın 9da HGS kontrol #alican", now: now, timeZone: istanbul)
        XCTAssertEqual(draft.title, "HGS kontrol")
        XCTAssertEqual(draft.context, "alican")
        XCTAssertEqual(draft.scheduledAt, "2026-10-19T06:00:00.000Z")
        XCTAssertEqual(draft.scheduledDate, Date(timeIntervalSince1970: 1_792_389_600))
    }

    func testParsedDraftDecodesFromServerJSONWithMissingKeys() throws {
        let json = #"{"title":"x","rrule":"FREQ=DAILY"}"#.data(using: .utf8)!
        let draft = try JSONDecoder().decode(ParsedDraft.self, from: json)
        XCTAssertEqual(draft, ParsedDraft(title: "x", rrule: "FREQ=DAILY"))
        XCTAssertNil(draft.scheduledDate)
    }

    func testExpandWithEmptyRuleReturnsNothing() throws {
        let got = try CoreJS().expandOccurrences(
            rrule: "", start: now, from: now, to: now.addingTimeInterval(86_400 * 5), timeZone: istanbul)
        XCTAssertEqual(got, [])
    }

    func testBrokenScriptSurfacesAsCoreJSError() {
        XCTAssertThrowsError(try CoreJS(script: "throw new Error('boom');")) { error in
            guard case CoreJSError.scriptFailed(let message)? = error as? CoreJSError else {
                return XCTFail("unexpected \(error)")
            }
            XCTAssertTrue(message.contains("boom"), message)
        }
    }

    func testScriptWithoutNamespaceIsRejected() {
        XCTAssertThrowsError(try CoreJS(script: "var x = 1;")) { error in
            XCTAssertEqual(error as? CoreJSError, .missingNamespace)
        }
    }

    func testRuntimeJSExceptionBecomesCoreJSError() throws {
        let core = try CoreJS(script: "globalThis.HusrevityCore = { parseQuickAdd() { throw new Error('bad'); }, takeResult() { return null; }, expandOccurrences() { return 'not json'; } };")
        XCTAssertThrowsError(try core.parseQuickAdd("x", now: now, timeZone: istanbul)) { XCTAssertTrue($0 is CoreJSError) }
        XCTAssertThrowsError(
            try core.expandOccurrences(rrule: "FREQ=DAILY", start: now, from: now, to: now, timeZone: istanbul)
        ) { XCTAssertTrue($0 is CoreJSError) }
    }

    func testConcurrentUseIsSerialisedAndDeterministic() async throws {
        let core = try CoreJS()
        let expected = try core.parseQuickAdd("her pzt spor salonu !yüksek #saglik", now: now, timeZone: istanbul)
        let nowCopy = now
        let zone = istanbul
        try await withThrowingTaskGroup(of: Bool.self) { group in
            for i in 0..<16 {
                group.addTask {
                    for _ in 0..<25 {
                        let d = try core.parseQuickAdd("her pzt spor salonu !yüksek #saglik", now: nowCopy, timeZone: zone)
                        if d != expected { return false }
                        let occ = try core.expandOccurrences(
                            rrule: "FREQ=DAILY", start: nowCopy, from: nowCopy,
                            to: nowCopy.addingTimeInterval(86_400 * Double(3 + i % 3)), timeZone: zone)
                        if occ.count != 4 + i % 3 { return false }
                    }
                    return true
                }
            }
            for try await ok in group { XCTAssertTrue(ok) }
        }
    }

    func testResultCapIsExactlyOneThousandOverALongWindow() throws {
        let core = try CoreJS()
        let began = Date()
        let got = try core.expandOccurrences(
            rrule: "FREQ=HOURLY", start: now, from: now,
            to: now.addingTimeInterval(86_400 * 365 * 5), timeZone: istanbul)
        XCTAssertEqual(got.count, 1000)
        XCTAssertEqual(got.first, now)
        XCTAssertLessThan(Date().timeIntervalSince(began), 5)
    }

    func testScanCapStopsAFarPastAnchor() throws {
        let core = try CoreJS()
        let start = Date(timeIntervalSince1970: 946_684_800)  // 2000-01-01
        let began = Date()
        let got = try core.expandOccurrences(
            rrule: "FREQ=HOURLY", start: start, from: now, to: now.addingTimeInterval(86_400), timeZone: istanbul)
        XCTAssertEqual(got, [])  // 100 000 iterations never reach the window, as on the server
        XCTAssertLessThan(Date().timeIntervalSince(began), 5)
    }

    func testImpossibleRulesReturnQuicklyWithNoResults() throws {
        let core = try CoreJS()
        let rules = [
            "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=31",
            "FREQ=MONTHLY;BYMONTHDAY=31;BYMONTH=2",
            "FREQ=YEARLY;BYMONTH=4;BYMONTHDAY=31",
            "FREQ=YEARLY;BYYEARDAY=366;BYMONTH=2",
            "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30",
        ]
        for rule in rules {
            let began = Date()
            let got = try core.expandOccurrences(
                rrule: rule, start: now, from: now,
                to: now.addingTimeInterval(86_400 * 365 * 10), timeZone: istanbul)
            let elapsed = Date().timeIntervalSince(began)
            XCTAssertEqual(got, [], rule)
            XCTAssertLessThan(elapsed, 2, "\(rule) took \(elapsed)s")
        }
    }
}
