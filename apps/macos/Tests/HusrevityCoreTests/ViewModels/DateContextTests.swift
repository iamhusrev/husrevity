import XCTest
@testable import HusrevityCore

final class DateContextTests: XCTestCase {
    private func iso(_ s: String) -> Date { ViewModelTestSupport.date(s) }

    func testDayKeyUsesTheConfiguredTimeZone() {
        let istanbul = DateContext(now: { Date() }, timeZone: TimeZone(identifier: "Europe/Istanbul")!)
        // 21:30Z is already the next day in Istanbul (UTC+3).
        XCTAssertEqual(istanbul.dayKey(iso("2026-10-18T21:30:00Z")), "2026-10-19")
        let utc = DateContext(now: { Date() }, timeZone: TimeZone(identifier: "UTC")!)
        XCTAssertEqual(utc.dayKey(iso("2026-10-18T21:30:00Z")), "2026-10-18")
    }

    func testWeekStartsOnMonday() {
        let ctx = DateContext(now: { Date() }, timeZone: TimeZone(identifier: "Europe/Istanbul")!)
        // 2026-10-18 is a Sunday: its week started Monday the 12th.
        XCTAssertEqual(ctx.dayKey(ctx.startOfWeek(containing: iso("2026-10-18T10:00:00+03:00"))), "2026-10-12")
        XCTAssertEqual(ctx.dayKey(ctx.startOfWeek(containing: iso("2026-10-12T00:00:00+03:00"))), "2026-10-12")
    }

    func testDayBoundsAreExactAtMidnightInTheConfiguredZone() {
        let ctx = DateContext(now: { Date() }, timeZone: TimeZone(identifier: "Europe/Istanbul")!)
        let bounds = ctx.dayBounds(containing: iso("2026-10-18T23:59:59+03:00"))
        XCTAssertEqual(bounds.start, iso("2026-10-18T00:00:00+03:00"))
        XCTAssertEqual(bounds.end, iso("2026-10-19T00:00:00+03:00"))
    }

    func testDayLengthFollowsDaylightSavingTime() {
        // Berlin springs forward on 2026-03-29: that local day has 23 hours.
        let ctx = DateContext(now: { Date() }, timeZone: TimeZone(identifier: "Europe/Berlin")!)
        let bounds = ctx.dayBounds(containing: iso("2026-03-29T12:00:00+02:00"))
        XCTAssertEqual(bounds.end.timeIntervalSince(bounds.start), 23 * 3600)
        XCTAssertEqual(ctx.dayKey(bounds.end), "2026-03-30")
    }

    func testDateFromDayKeyRoundTrips() {
        let ctx = DateContext(now: { Date() }, timeZone: TimeZone(identifier: "Europe/Istanbul")!)
        XCTAssertEqual(ctx.date(fromDayKey: "2026-02-28"), iso("2026-02-28T00:00:00+03:00"))
        XCTAssertNil(ctx.date(fromDayKey: "garbage"))
        XCTAssertNil(ctx.date(fromDayKey: "2026-13-40"))
    }

    func testTurkishFormatting() {
        let ctx = DateContext(now: { Date() }, timeZone: TimeZone(identifier: "Europe/Istanbul")!)
        let d = iso("2026-10-12T09:05:00+03:00")
        XCTAssertEqual(ctx.timeLabel(d), "09:05")
        XCTAssertEqual(ctx.dayLabel(d), "12 Ekim Pazartesi")
        XCTAssertEqual(ctx.monthLabel(d), "Ekim 2026")
        XCTAssertEqual(ctx.shortWeekday(d), "Pzt")
    }
}
