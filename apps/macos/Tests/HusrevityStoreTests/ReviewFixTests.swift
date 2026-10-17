import GRDB
import HusrevityModels
import XCTest
@testable import HusrevityStore

/// Regression tests for the independent Store review.
final class ReviewFixTests: StoreTestCase {
    private func body(_ entry: OutboxEntry?) throws -> [String: JSONValue] { try XCTUnwrap(entry).payload.objectValue }

    private func pulledItem(_ title: String) throws -> ItemRecord {
        try store.apply(sync: syncFull())
        return try XCTUnwrap(store.dbQueue.read { try ItemRecord.filter(Column("title") == title).fetchOne($0) })
    }

    private func fail(_ entry: OutboxEntry) throws {
        try store.markInflight(entry.id)
        try store.markFailed(entry.id, error: "x")
    }

    // MARK: 2 - note updates are full snapshots (PUT replaces), project partial bodies are safe (PUT touches provided fields only)

    func testANoteUpdateQueuesTheFullBodySnapshot() throws {
        try store.apply(sync: syncFull())
        let note = try XCTUnwrap(store.dbQueue.read { try NoteRecord.fetchOne($0) })
        let tag = try XCTUnwrap(store.dbQueue.read { try NoteTagRecord.fetchOne($0) })
        try store.update(NoteRecord.self, localId: note.localId) { $0.title = "Renamed" }

        let payload = try body(store.nextPending())
        XCTAssertEqual(Set(payload.keys), ["title", "bodyMarkdown", "pinned", "archived", "colorHex", "tagIds"])
        XCTAssertEqual(payload["title"], .string("Renamed"))
        XCTAssertEqual(payload["bodyMarkdown"], .string("# Plan\n- ship sync"))
        XCTAssertEqual(payload["tagIds"], .array([.string(try XCTUnwrap(tag.serverId))]))
    }

    func testANoteUpdateWithoutAWireChangeStillQueuesNothing() throws {
        try store.apply(sync: syncFull())
        let note = try XCTUnwrap(store.dbQueue.read { try NoteRecord.fetchOne($0) })
        try store.update(NoteRecord.self, localId: note.localId) { $0.position = 4 }
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    /// project.service.ts `update` only assigns fields that are `!== undefined`, so a partial PUT
    /// body is safe; items/goals use PATCH. Hence only notes need the full snapshot.
    func testAProjectUpdateStaysAPartialBodyBecauseTheServerOnlyTouchesProvidedFields() throws {
        try store.apply(sync: syncFull())
        let project = try XCTUnwrap(store.dbQueue.read { try ProjectRecord.fetchOne($0) })
        try store.update(ProjectRecord.self, localId: project.localId) { $0.description = "new" }
        XCTAssertEqual(try body(store.nextPending()), ["description": .string("new")])
    }

    // MARK: 3 - deleted_locally is cleared

    func testDiscardingADeleteConflictMakesTheRowVisibleAndKeepsItVisible() throws {
        let item = try pulledItem("Run")
        try store.delete(ItemRecord.self, localId: item.localId)
        let entry = try XCTUnwrap(store.nextPending())
        try fail(entry)
        let conflict = try store.recordConflict(
            entity: .item, localId: item.localId, op: .delete, localPayload: .object([:]), serverPayload: .object([:])
        )
        XCTAssertEqual(try store.items().map(\.title), ["Pay rent"])

        try store.resolveConflict(id: conflict.id, keepLocal: false)
        XCTAssertEqual(Set(try store.items().map(\.title)), ["Run", "Pay rent"])

        var sync = try syncFull()
        sync.items[0].title = "Run v2"
        try store.apply(sync: sync)
        XCTAssertEqual(Set(try store.items().map(\.title)), ["Run v2", "Pay rent"])
    }

    func testOverridingWithTheServerVersionUnhidesALocallyDeletedRow() throws {
        let item = try pulledItem("Run")
        try store.delete(ItemRecord.self, localId: item.localId)
        try store.applyServerRecord(try XCTUnwrap(syncFull().items.first), overridingLocalChanges: true)
        XCTAssertEqual(Set(try store.items().map(\.title)), ["Run", "Pay rent"])
    }

    // MARK: 4 - deferred tombstones

    func testATombstoneDeferredByALocalChangeIsRecorded() throws {
        let rent = try pulledItem("Pay rent")
        try store.update(ItemRecord.self, localId: rent.localId) { $0.title = "Pay rent!" }
        try store.apply(sync: syncIncremental())

        let deferred = try store.deferredTombstones()
        XCTAssertEqual(deferred.map(\.localId), [rent.localId])
        XCTAssertEqual(deferred.map(\.entity), [.item])
    }

    func testDiscardLocalRowRemovesRowEntriesConflictsAndTheFlag() throws {
        let rent = try pulledItem("Pay rent")
        try store.update(ItemRecord.self, localId: rent.localId) { $0.title = "Pay rent!" }
        try store.recordConflict(entity: .item, localId: rent.localId, localPayload: .object([:]), serverPayload: .object([:]))
        try store.apply(sync: syncIncremental())

        try store.discardLocalRow(entity: .item, localId: rent.localId)

        XCTAssertEqual(try count("item", where: "local_id = '\(rent.localId)'"), 0)
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertEqual(try store.unresolvedConflicts(), [])
        XCTAssertTrue(try store.deferredTombstones().isEmpty)
    }

    func testSettleAppliesARecordedTombstoneOnceTheEntriesAreGone() throws {
        let rent = try pulledItem("Pay rent")
        try store.update(ItemRecord.self, localId: rent.localId) { $0.title = "Pay rent!" }
        try store.apply(sync: syncIncremental())

        XCTAssertEqual(try store.settleDeferredTombstones(), 0, "still has a queued entry")
        XCTAssertEqual(try count("item", where: "local_id = '\(rent.localId)'"), 1)

        try store.markDone(try XCTUnwrap(store.nextPending()).id)
        XCTAssertEqual(try store.settleDeferredTombstones(), 1)
        XCTAssertEqual(try count("item", where: "local_id = '\(rent.localId)'"), 0)
        XCTAssertTrue(try store.deferredTombstones().isEmpty)
    }

    func testARowThePullRewritesAfterwardsIsNoLongerDeferred() throws {
        let rent = try pulledItem("Pay rent")
        try store.update(ItemRecord.self, localId: rent.localId) { $0.title = "Pay rent!" }
        try store.apply(sync: syncIncremental())
        try store.markDone(try XCTUnwrap(store.nextPending()).id)

        try store.apply(sync: syncFull())  // the server has the row again

        XCTAssertTrue(try store.deferredTombstones().isEmpty)
        XCTAssertEqual(try store.settleDeferredTombstones(), 0)
        XCTAssertEqual(try count("item", where: "local_id = '\(rent.localId)'"), 1)
    }

    // MARK: 5 - project create body

    func testProjectCreateOmitsPinnedAndArchivedAndFollowsUpWithAnUpdate() throws {
        let project = try store.create(ProjectRecord(code: "P", name: "n", pinned: true))
        let entries = try store.outbox()
        XCTAssertEqual(entries.map(\.op), [.create, .update])
        XCTAssertNil(try body(entries[0])["pinned"])
        XCTAssertNil(try body(entries[0])["archived"])
        XCTAssertEqual(try body(entries[1]), ["pinned": .bool(true)])
        XCTAssertEqual(entries[1].localId, project.localId)
        XCTAssertNil(entries[1].baseUpdatedAtMs)
    }

    func testAPlainProjectCreateQueuesOnlyTheCreate() throws {
        try store.create(ProjectRecord(code: "P", name: "n"))
        XCTAssertEqual(try store.outbox().map(\.op), [.create])
    }

    func testProjectCodeCannotChangeOnceItHasAServerId() throws {
        try store.apply(sync: syncFull())
        let project = try XCTUnwrap(store.dbQueue.read { try ProjectRecord.fetchOne($0) })
        XCTAssertThrowsError(try store.update(ProjectRecord.self, localId: project.localId) { $0.code = "NEW" }) {
            XCTAssertEqual($0 as? StoreError, .immutableField("code"))
        }
        XCTAssertEqual(try store.dbQueue.read { try ProjectRecord.fetchOne($0, key: project.localId) }?.code, project.code)
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    func testProjectCodeOfAnUnpushedProjectIsEditedInThePendingCreate() throws {
        let project = try store.create(ProjectRecord(code: "OLD", name: "n"))
        try store.update(ProjectRecord.self, localId: project.localId) { $0.code = "NEW"; $0.name = "m" }
        let entries = try store.outbox()
        XCTAssertEqual(try body(entries[0])["code"], .string("NEW"))
        XCTAssertEqual(entries.count, 2)
        XCTAssertEqual(try body(entries[1]), ["name": .string("m")], "code is never sent in an update")
    }

    func testProjectCodeCannotChangeWhileTheCreateIsInflight() throws {
        let project = try store.create(ProjectRecord(code: "OLD", name: "n"))
        try store.markInflight(try XCTUnwrap(store.nextPending()).id)
        XCTAssertThrowsError(try store.update(ProjectRecord.self, localId: project.localId) { $0.code = "NEW" })
    }

    // MARK: 6 - deleting a never-pushed row

    func testDeletingAnUnpushedProjectNullsReferencesInRowsAndQueuedPayloads() throws {
        let project = try store.create(ProjectRecord(code: "P", name: "P"))
        let item = try store.create(ItemRecord(title: "I", projectId: project.reference))
        try store.update(ItemRecord.self, localId: item.localId) { $0.projectId = project.reference; $0.title = "J" }

        try store.delete(ProjectRecord.self, localId: project.localId)

        let all = try store.outbox()
        XCTAssertEqual(all.map(\.entity), [.item, .item])
        for entry in all {
            XCTAssertFalse(String(describing: entry.payload).contains("local:"), "\(entry.payload)")
        }
        XCTAssertEqual(try body(all[0])["projectId"], .null)
        XCTAssertNil(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: item.localId) }?.projectId)
    }

    func testDeletingAnUnpushedTagDropsItFromQueuedNoteTagIds() throws {
        let tag = try store.create(NoteTagRecord(name: "t"))
        let note = try store.create(NoteRecord(title: "n", tagIds: [tag.localId]))
        try store.delete(NoteTagRecord.self, localId: tag.localId)
        XCTAssertEqual(try body(store.outbox().last)["tagIds"], .array([]))
        XCTAssertEqual(try store.dbQueue.read { try NoteRecord.load($0, localId: note.localId) }?.tagIds, [])
    }

    func testDeletingAnUnpushedItemRemovesItsLocalOccurrences() throws {
        let item = try store.create(ItemRecord(title: "I", rrule: "FREQ=DAILY"))
        try store.completeItem(localId: item.localId, occursOn: "2026-03-01")
        try store.delete(ItemRecord.self, localId: item.localId)
        XCTAssertEqual(try count("item_occurrence"), 0)
        XCTAssertEqual(try store.outboxCount(), 0)
    }

    func testDeletingAnUnpushedGoalNullsParentAndProjectReferences() throws {
        let goal = try store.create(GoalRecord(title: "g", horizon: "year", periodStart: "2026-01-01", periodEnd: "2026-12-31"))
        let child = try store.create(
            GoalRecord(title: "c", horizon: "month", periodStart: "2026-01-01", periodEnd: "2026-01-31", parentGoalId: goal.reference)
        )
        let project = try store.create(ProjectRecord(code: "P", name: "P", goalId: goal.reference))
        try store.delete(GoalRecord.self, localId: goal.localId)
        XCTAssertNil(try store.dbQueue.read { try GoalRecord.fetchOne($0, key: child.localId) }?.parentGoalId)
        XCTAssertNil(try store.dbQueue.read { try ProjectRecord.fetchOne($0, key: project.localId) }?.goalId)
        for entry in try store.outbox() {
            XCTAssertFalse(String(describing: entry.payload).contains("local:"))
        }
    }

    // MARK: 7 - failed entries block their row

    func testAFailedCreateBlocksItsLaterEntriesButNotOtherRows() throws {
        let a = try store.create(ItemRecord(title: "a"))
        try store.update(ItemRecord.self, localId: a.localId) { $0.title = "a2" }
        let b = try store.create(ItemRecord(title: "b"))
        try fail(try XCTUnwrap(store.nextPending()))

        let next = try XCTUnwrap(store.nextPending())
        XCTAssertEqual(next.localId, b.localId)
        try store.markDone(next.id)
        XCTAssertNil(try store.nextPending(), "a's update stays parked behind its failed create")
    }

    func testAnEntryReferencingARowWhoseCreateFailedIsBlocked() throws {
        let project = try store.create(ProjectRecord(code: "P", name: "P"))
        try store.create(ItemRecord(title: "I", projectId: project.reference))
        try fail(try XCTUnwrap(store.nextPending()))
        XCTAssertNil(try store.nextPending())
    }

    func testFailedOutboxListsOnlyFailedEntries() throws {
        let a = try store.create(ItemRecord(title: "a"))
        try store.create(ItemRecord(title: "b"))
        try fail(try XCTUnwrap(store.nextPending()))
        XCTAssertEqual(try store.failedOutbox().map(\.localId), [a.localId])
    }

    // MARK: 8 - remap covers block_id and conflicts

    func testRemapRewritesBlockIdAndConflictPayloads() throws {
        let project = try store.create(ProjectRecord(code: "P", name: "P"))
        let item = try store.create(ItemRecord(title: "I", blockId: project.reference))
        let conflict = try store.recordConflict(
            entity: .item, localId: item.localId,
            localPayload: .object(["blockId": .string(project.reference)]),
            serverPayload: .object(["x": .array([.string(project.reference)])])
        )
        try store.remapServerId(entity: .project, localId: project.localId, serverId: "9")

        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: item.localId) }?.blockId, "9")
        let stored = try XCTUnwrap(store.unresolvedConflicts().first { $0.id == conflict.id })
        XCTAssertEqual(stored.localPayload, .object(["blockId": .string("9")]))
        XCTAssertEqual(stored.serverPayload, .object(["x": .array([.string("9")])]))
    }

    // MARK: 9 - markDone(applying:)

    func testMarkDoneApplyingRemapsStoresTheServerVersionAndRebasesLaterEntries() throws {
        let dto = try XCTUnwrap(syncFull().items.first)
        let created = try store.create(ItemRecord(title: "mine"))
        try store.update(ItemRecord.self, localId: created.localId) { $0.title = "mine v2" }
        let createEntry = try XCTUnwrap(store.nextPending())

        try store.markDone(createEntry.id, applying: dto)

        XCTAssertNil(try store.outboxEntry(id: createEntry.id))
        let row = try XCTUnwrap(store.dbQueue.read { try ItemRecord.fetchOne($0, key: created.localId) })
        XCTAssertEqual(row.serverId, dto.id)
        XCTAssertEqual(row.title, "mine v2", "the queued local edit still wins")
        XCTAssertEqual(row.updatedAt.epochMilliseconds, dto.updatedAt.epochMilliseconds)
        XCTAssertEqual(try store.nextPending()?.baseUpdatedAtMs, dto.updatedAt.epochMilliseconds)
        // A further edit now captures the server's updatedAt, not the local clock.
        try store.update(ItemRecord.self, localId: created.localId) { $0.title = "mine v3" }
        XCTAssertEqual(try store.outbox().last?.baseUpdatedAtMs, dto.updatedAt.epochMilliseconds)
    }

    func testMarkDoneApplyingOnAnUnprotectedRowStoresTheServerFields() throws {
        let dto = try XCTUnwrap(syncFull().items.first)
        let created = try store.create(ItemRecord(title: "mine"))
        try store.markDone(try XCTUnwrap(store.nextPending()).id, applying: dto)
        XCTAssertEqual(try store.dbQueue.read { try ItemRecord.fetchOne($0, key: created.localId) }?.title, dto.title)
    }

    // MARK: 10 - duplicate drop keeps assignments

    func testRemapMergingADuplicateTagKeepsTheNoteLink() throws {
        try store.apply(sync: syncFull())
        let pulledTag = try XCTUnwrap(store.dbQueue.read { try NoteTagRecord.fetchOne($0) })
        let note = try XCTUnwrap(store.dbQueue.read { try NoteRecord.fetchOne($0) })
        let local = try store.create(NoteTagRecord(name: "work"))

        try store.remapServerId(entity: .noteTag, localId: local.localId, serverId: try XCTUnwrap(pulledTag.serverId))

        XCTAssertEqual(try count("note_tag"), 1)
        XCTAssertEqual(try store.dbQueue.read { try NoteRecord.load($0, localId: note.localId) }?.tagIds, [local.localId])
    }

    func testRemapMergingADuplicateNoteKeepsItsTags() throws {
        try store.apply(sync: syncFull())
        let pulledNote = try XCTUnwrap(store.dbQueue.read { try NoteRecord.fetchOne($0) })
        let local = try store.create(NoteRecord(title: "Plan the week"))
        try store.remapServerId(entity: .note, localId: local.localId, serverId: try XCTUnwrap(pulledNote.serverId))
        XCTAssertEqual(try count("note"), 1)
        XCTAssertEqual(try store.dbQueue.read { try NoteRecord.load($0, localId: local.localId) }?.tagIds.count, 1)
    }

    // MARK: 11 - crash replay

    func testCrashBetweenRemapAndMarkDoneReplaysCleanly() throws {
        let created = try store.create(ProjectRecord(code: "HOME", name: "Home"))
        let item = try store.create(ItemRecord(title: "I", projectId: created.reference))
        let entry = try XCTUnwrap(store.nextPending())
        try store.markInflight(entry.id)
        let dto = try XCTUnwrap(syncFull().projects.first)
        try store.remapServerId(entity: .project, localId: created.localId, serverId: dto.id)

        // crash: reopen the same file
        store = nil
        store = try LocalStore(path: path)
        try store.resetInflightToPending()

        let replay = try XCTUnwrap(store.nextPending())
        XCTAssertEqual(replay.id, entry.id)
        XCTAssertEqual(replay.idempotencyKey, entry.idempotencyKey)
        // The retry's response arrives (the server dedupes by key): do the same steps again.
        try store.markDone(replay.id, applying: dto)

        XCTAssertEqual(try count("project"), 1)
        XCTAssertEqual(try store.outbox().map(\.localId), [item.localId], "nothing lost, nothing duplicated")
        XCTAssertEqual(try body(store.outbox().first)["projectId"], .string(dto.id))
        // A pull that includes the project must not duplicate it either.
        try store.apply(sync: syncFull())
        XCTAssertEqual(try count("project"), 1)
    }
}
