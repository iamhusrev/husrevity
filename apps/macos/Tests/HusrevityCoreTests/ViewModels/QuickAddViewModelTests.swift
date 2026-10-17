import XCTest

@testable import HusrevityCore
@testable import HusrevityStore

private struct FailingParser: QuickAddParsing {
    func parseQuickAdd(_ text: String, now: Date, timeZone: TimeZone) throws -> ParsedDraft {
        throw CoreJSError.executionFailed("boom")
    }
}

@MainActor
final class QuickAddViewModelTests: ViewModelTestCase {
    private func makeVM(parser: QuickAddParsing? = nil) -> QuickAddViewModel {
        let clock = self.clock!
        return QuickAddViewModel(
            store: store, parser: parser ?? core,
            context: DateContext(now: { clock.now }, timeZone: clock.timeZone), notifyLocalChange: notify)
    }

    func testEmptyAndWhitespaceTextHaveNoPreviewAndCannotBeSubmitted() {
        let vm = makeVM()
        XCTAssertNil(vm.preview)
        XCTAssertFalse(vm.canSubmit)
        vm.text = "   \n "
        XCTAssertNil(vm.preview)
        XCTAssertNil(vm.submit())
        XCTAssertEqual(changeNotifications, 0)
        XCTAssertEqual(try store.items().count, 0)
    }

    func testPreviewShowsWhatWasUnderstoodWhileTyping() {
        let vm = makeVM()
        vm.text = "yarın 9da HGS kontrol #alican"
        let preview = vm.preview
        XCTAssertEqual(preview?.title, "HGS kontrol")
        XCTAssertEqual(preview?.scheduledAt, d("2026-10-19T09:00:00+03:00"))
        XCTAssertEqual(preview?.timeLabel, "19 Eki Pzt 09:00")
        XCTAssertEqual(preview?.context, "alican")
        XCTAssertNil(preview?.recurrenceLabel)
        XCTAssertEqual(preview?.usedFallback, false)
        XCTAssertEqual(preview?.chips.map(\.text), ["19 Eki Pzt 09:00", "#alican"])
        XCTAssertEqual(preview?.chips.map(\.kind), [.time, .context])
    }

    func testPreviewFollowsEveryKeystroke() {
        let vm = makeVM()
        vm.text = "yarın"
        XCTAssertEqual(vm.preview?.usedFallback, true, "an empty parsed title falls back to the raw text")
        vm.text = "yarın toplantı"
        XCTAssertEqual(vm.preview?.title, "toplantı")
        vm.text = ""
        XCTAssertNil(vm.preview)
    }

    func testSubmitCreatesAMacosItemAndNotifiesTheSync() throws {
        let vm = makeVM()
        vm.text = "yarın 9da HGS kontrol #alican"
        let item = try XCTUnwrap(vm.submit())

        XCTAssertEqual(item.title, "HGS kontrol")
        XCTAssertEqual(item.source, "macos")
        XCTAssertEqual(item.kind, "task")
        XCTAssertEqual(item.context, "alican")
        XCTAssertEqual(item.scheduledAt, d("2026-10-19T09:00:00+03:00"))
        XCTAssertEqual(changeNotifications, 1)
        XCTAssertEqual(vm.text, "")
        XCTAssertNil(vm.preview)
        XCTAssertEqual(vm.lastAdded?.title, "HGS kontrol")
        XCTAssertEqual(try store.items().map(\.localId), [item.localId])
        XCTAssertEqual(try store.outbox().map(\.op), [.create])
    }

    func testRecurringQuickAddKeepsTheRuleAndLabelsIt() throws {
        let vm = makeVM()
        vm.text = "her gün 7de koşu"
        XCTAssertEqual(vm.preview?.recurrenceLabel, "Her gün")
        XCTAssertEqual(vm.preview?.chips.map(\.kind), [.time, .recurrence])
        let item = try XCTUnwrap(vm.submit())
        XCTAssertEqual(item.rrule, "FREQ=DAILY")
        XCTAssertEqual(item.title, "koşu")
        XCTAssertNotNil(item.scheduledAt)
    }

    func testWeeklyRecurrenceLabelNamesTheDays() {
        let vm = makeVM()
        vm.text = "her cuma 18:00 spor"
        XCTAssertEqual(vm.preview?.recurrenceLabel, "Her hafta Cum")
    }

    func testTextTheParserCannotUseIsSavedAsTheTitle() throws {
        let vm = makeVM(parser: FailingParser())
        vm.text = "  yarın 9da bir şey  "
        XCTAssertEqual(vm.preview?.title, "yarın 9da bir şey")
        XCTAssertEqual(vm.preview?.usedFallback, true)
        XCTAssertTrue(vm.preview?.chips.isEmpty ?? false)
        let item = try XCTUnwrap(vm.submit())
        XCTAssertEqual(item.title, "yarın 9da bir şey")
        XCTAssertNil(item.scheduledAt)
        XCTAssertEqual(item.source, "macos")
        XCTAssertEqual(changeNotifications, 1)
        XCTAssertEqual(vm.lastAdded?.usedFallback, true)
    }

    func testPlainTextWithoutAnyTokenIsJustATitle() throws {
        let vm = makeVM()
        vm.text = "sadece bir not"
        XCTAssertEqual(vm.preview?.usedFallback, false)
        let item = try XCTUnwrap(vm.submit())
        XCTAssertEqual(item.title, "sadece bir not")
        XCTAssertNil(item.scheduledAt)
        XCTAssertNil(item.rrule)
    }

    func testProjectReferenceResolvesByCodeIgnoringCase() throws {
        let project = try store.create(ProjectRecord(code: "NAKLIYA", name: "Nakliya Takip"))
        let vm = makeVM()
        vm.text = "rapor yaz @nakliya"
        XCTAssertEqual(vm.preview?.chips.map(\.kind), [.project])
        let item = try XCTUnwrap(vm.submit())
        XCTAssertEqual(item.projectId, project.reference)
    }

    func testProjectReferenceResolvesByName() throws {
        let project = try store.create(ProjectRecord(code: "HK", name: "Husrevity"))
        let vm = makeVM()
        vm.text = "ekran tasarla @husrevity"
        XCTAssertEqual(try XCTUnwrap(vm.submit()).projectId, project.reference)
    }

    func testUnknownProjectReferenceIsDroppedButDoesNotBlockSaving() throws {
        let vm = makeVM()
        vm.text = "rapor yaz @yokboyleproje"
        let item = try XCTUnwrap(vm.submit())
        XCTAssertNil(item.projectId)
        XCTAssertEqual(item.title, "rapor yaz")
    }

    func testPriorityIsKeptInThePayload() throws {
        let vm = makeVM()
        vm.text = "acil arama yap !yüksek"
        XCTAssertEqual(vm.preview?.priority, "yüksek")
        let item = try XCTUnwrap(vm.submit())
        XCTAssertEqual(item.payload, .object(["priority": .string("yüksek")]))
    }

    func testSubmitFailureKeepsTheTextAndShowsAMessage() throws {
        let vm = makeVM()
        vm.text = "x"
        try exec("DROP TABLE outbox")  // make the write fail
        XCTAssertNil(vm.submit())
        XCTAssertEqual(vm.text, "x")
        XCTAssertNotNil(vm.errorMessage)
        XCTAssertEqual(changeNotifications, 0)
        XCTAssertNil(vm.lastAdded)
    }

    func testRecurrenceDescriberCoversTheCommonRules() {
        XCTAssertEqual(RecurrenceDescriber.describe("FREQ=DAILY"), "Her gün")
        XCTAssertEqual(RecurrenceDescriber.describe("FREQ=DAILY;INTERVAL=2"), "Her 2 gün")
        XCTAssertEqual(RecurrenceDescriber.describe("FREQ=WEEKLY"), "Her hafta")
        XCTAssertEqual(RecurrenceDescriber.describe("FREQ=WEEKLY;BYDAY=MO,WE"), "Her hafta Pzt, Çar")
        XCTAssertEqual(RecurrenceDescriber.describe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"), "Hafta içi her gün")
        XCTAssertEqual(RecurrenceDescriber.describe("FREQ=WEEKLY;INTERVAL=3"), "Her 3 hafta")
        XCTAssertEqual(RecurrenceDescriber.describe("FREQ=MONTHLY"), "Her ay")
        XCTAssertEqual(RecurrenceDescriber.describe("FREQ=YEARLY"), "Her yıl")
        XCTAssertEqual(RecurrenceDescriber.describe("RRULE:FREQ=DAILY"), "Her gün")
        XCTAssertEqual(RecurrenceDescriber.describe("FREQ=HOURLY"), "Özel tekrar")
        XCTAssertEqual(RecurrenceDescriber.describe("garbage"), "Özel tekrar")
    }
}
