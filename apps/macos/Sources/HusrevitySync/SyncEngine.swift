import Foundation
import HusrevityModels
import HusrevityNetwork
import HusrevityStore

/// The push/pull engine. One `syncNow()` run is:
///
/// 1. crash recovery (once per engine): entries left `inflight` by a dead process go back to `pending`,
/// 2. **push** the outbox in FIFO order,
/// 3. settle deferred tombstones,
/// 4. **pull** `sync(since: cursor)`, apply it, and only then move the cursor.
///
/// Runs are single-flight: concurrent callers share one run, and calls made while it is running
/// schedule exactly one follow-up run.
public actor SyncEngine {
    /// Maps a row's local id to the id the server knows it by (nil when it has none yet).
    /// It must also find rows with a pending local delete, which the store's read APIs hide.
    public typealias ServerIDLookup = @Sendable (SyncEntity, String) throws -> String?

    private let store: LocalStore
    private let api: any SyncAPI
    private let serverID: ServerIDLookup

    private var current: Task<SyncOutcome, Never>?
    private var rerunRequested = false
    private var recovered = false
    private let maxAttempts: Int
    /// Retryable (non-transport) failures per outbox entry, for the attempt budget.
    private var failureCounts: [Int64: Int] = [:]
    /// Calls that joined a run already in progress. Lets tests wait for them deterministically.
    private(set) var joinedCalls = 0

    /// - Parameter serverID: defaults to a lookup over the store's public read APIs, which cannot
    ///   see rows with a pending local delete. The app should pass a lookup that can (see report).
    public init(store: LocalStore, api: any SyncAPI, maxAttempts: Int = 5, serverID: ServerIDLookup? = nil) {
        self.store = store
        self.api = api
        self.maxAttempts = maxAttempts
        self.serverID = serverID ?? { [store] entity, localId in
            try SyncEngine.visibleServerID(store, entity, localId)
        }
    }

    // MARK: Public API

    /// Runs a sync (or joins the one in progress). Never throws: failures are in the outcome.
    @discardableResult
    public func syncNow() async -> SyncOutcome {
        if let running = current {
            rerunRequested = true
            joinedCalls += 1
            return await running.value
        }
        let task = Task { await self.drain() }
        current = task
        return await task.value
    }

    /// Resolves a conflict and syncs. "Server wins" (`keepLocal == false`) makes the store persist
    /// its full-resync marker, so the next pull (this one, or after a relaunch) uses `since: nil`
    /// and the row takes the server's version; keep-local re-pushes against the server's `updatedAt`.
    @discardableResult
    public func resolveConflict(id: Int64, keepLocal: Bool) async throws -> SyncOutcome {
        try store.resolveConflict(id: id, keepLocal: keepLocal)
        return await syncNow()
    }

    /// Cancels the run in progress, if any. Its in-flight entry goes back to the queue.
    public func cancelCurrentRun() {
        current?.cancel()
    }

    // MARK: Run loop

    private func drain() async -> SyncOutcome {
        var outcome = SyncOutcome(result: .synced)
        repeat {
            rerunRequested = false
            let run = await runOnce()
            // Callers see the whole drain: counts add up, the verdict is the last run's.
            outcome = SyncOutcome(
                result: run.result, pushed: outcome.pushed + run.pushed, parked: outcome.parked + run.parked,
                conflicts: outcome.conflicts + run.conflicts, pulled: outcome.pulled || run.pulled
            )
            if Task.isCancelled { break }
            switch run.result {
            case .offline, .sessionExpired, .cancelled: rerunRequested = false  // a repeat would only fail again
            case .synced, .failed: break
            }
        } while rerunRequested
        current = nil
        return outcome
    }

    private func runOnce() async -> SyncOutcome {
        var outcome = SyncOutcome(result: .synced)
        do {
            if !recovered {
                try store.resetInflightToPending()
                recovered = true
            }
            let push = try await pushPhase()
            outcome.pushed = push.pushed
            outcome.parked = push.parked
            outcome.conflicts = push.conflicts
            switch push.stop {
            case .unauthorized?:
                outcome.result = .sessionExpired
                return outcome
            case .transport?:
                outcome.result = .offline
                return outcome
            case .retryable(let message)?:
                outcome.result = .failed(message)
            case .blocked?:
                outcome.result = .failed("A queued change depends on a row that has not been pushed yet (dependency not pushed)")
            case nil:
                break
            }

            try store.settleDeferredTombstones()
            try await pull(into: &outcome)
        } catch is CancellationError {
            outcome.result = .cancelled
        } catch {
            outcome.result = .failed(Self.describe(error))
        }
        return outcome
    }

    // MARK: Pull

    private func pull(into outcome: inout SyncOutcome) async throws {
        do {
            // The marker is persisted by the store; only a fully applied full pull clears it.
            let full = try store.needsFullResync()
            let since = full ? nil : try store.cursor()
            let response = try await api.sync(since: since)
            try store.apply(sync: response)
            try store.setCursor(response.cursor)  // only after the payload was applied
            if full { try store.clearFullResync() }
            outcome.pulled = true
        } catch {
            
            if error is CancellationError || Task.isCancelled { throw CancellationError() }
            switch error as? APIError {
            case .unauthorized?: outcome.result = .sessionExpired
            case .transport?: outcome.result = .offline
            default: outcome.result = .failed(Self.describe(error))
            }
        }
    }

    // MARK: Push

    private enum Stop {
        case unauthorized
        case transport
        case retryable(String)
        /// An entry still references an unpushed row; nothing behind it can go out safely.
        case blocked
    }

    private struct PushReport {
        var pushed = 0
        var parked = 0
        var conflicts = 0
        var stop: Stop?
    }

    /// Thrown when an entry's payload still holds a `local:` placeholder.
    private struct UnresolvedReference: Error {}

    private func pushPhase() async throws -> PushReport {
        var report = PushReport()
        pushLoop: while let entry = try store.nextPending() {
            if Task.isCancelled { throw CancellationError() }
            try store.markInflight(entry.id)
            do {
                try await push(entry)
                failureCounts[entry.id] = nil
                report.pushed += 1
            } catch is CancellationError {
                try? store.requeue(entry.id)
                throw CancellationError()
            } catch is UnresolvedReference {
                try store.requeue(entry.id)
                report.stop = .blocked
                break pushLoop
            } catch let error as PayloadError {
                try store.markFailed(entry.id, error: error.description)
                report.parked += 1
            } catch let error as APIError {
                if Task.isCancelled {  // a cancelled request may surface as a transport error
                    try? store.requeue(entry.id)
                    throw CancellationError()
                }
                switch try handle(error, for: entry) {
                case .done: report.pushed += 1
                case .parked: report.parked += 1
                case .conflict: report.conflicts += 1
                case .stop(let stop):
                    report.stop = stop
                    break pushLoop
                }
            } catch {
                // The store failed (e.g. while recording a result the server already accepted).
                // Retrying with the same key is safe, so keep the entry.
                try? store.requeue(entry.id)
                report.stop = .retryable(Self.describe(error))
                break pushLoop
            }
        }
        return report
    }

    private enum Handled {
        case done, parked, conflict
        case stop(Stop)
    }

    private func handle(_ error: APIError, for entry: OutboxEntry) throws -> Handled {
        switch error {
        case .unauthorized:
            try store.requeue(entry.id)
            return .stop(.unauthorized)
        case .transport:
            try store.requeue(entry.id)
            return .stop(.transport)
        case .rateLimited, .malformedSuccess, .tokenStorage:
            return try retryOrPark(entry, error)
        case .server where error.isRetryable:
            return try retryOrPark(entry, error)
        case .conflict(let message):
            guard entry.op != .create else {
                try store.markFailed(entry.id, error: error.localizedDescription)
                return .parked
            }
            try recordConflict(for: entry, message: message)
            try store.markFailed(entry.id, error: error.localizedDescription)
            return .conflict
        case .notFound:
            switch entry.op {
            case .delete:
                try store.markDone(entry.id)  // already gone: that is what we wanted
                return .done
            case .update, .complete:
                try store.discardLocalRow(entity: entry.entity, localId: entry.localId)  // the server deleted it
                return .done
            case .create:
                try store.markFailed(entry.id, error: error.localizedDescription)
                return .parked
            }
        case .validation, .decoding, .server:
            try store.markFailed(entry.id, error: error.localizedDescription)
            return .parked
        }
    }

    /// Requeues a retryable failure; parks the entry once its budget is spent so one poisoned
    /// entry cannot stall the queue forever. Transport errors never come through here.
    private func retryOrPark(_ entry: OutboxEntry, _ error: APIError) throws -> Handled {
        let failures = (failureCounts[entry.id] ?? 0) + 1
        if failures >= maxAttempts {
            failureCounts[entry.id] = nil
            try store.markFailed(entry.id, error: "\(error.localizedDescription) (gave up after \(failures) attempts)")
            return .parked
        }
        failureCounts[entry.id] = failures
        try store.requeue(entry.id)
        return .stop(.retryable(error.localizedDescription))
    }

    private func recordConflict(for entry: OutboxEntry, message: String) throws {
        let alreadyRecorded = try store.unresolvedConflicts().contains {
            $0.entity == entry.entity && $0.localId == entry.localId && $0.op == entry.op
        }
        guard !alreadyRecorded else { return }
        var server: [String: JSONValue] = ["message": .string(message)]
        if let updatedAt = Self.currentUpdatedAt(in: message) { server["updatedAt"] = .string(updatedAt) }
        try store.recordConflict(
            entity: entry.entity, localId: entry.localId, op: entry.op, localPayload: entry.payload,
            serverPayload: .object(server)
        )
    }

    /// Extracts the ISO timestamp from "... (current updatedAt: 2026-10-17T20:59:25.188Z)".
    static func currentUpdatedAt(in message: String) -> String? {
        guard let marker = message.range(of: "current updatedAt:") else { return nil }
        let token = message[marker.upperBound...]
            .trimmingCharacters(in: .whitespaces)
            .prefix { !$0.isWhitespace && $0 != ")" }
        let raw = String(token)
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: raw) != nil ? raw : nil
    }

    // MARK: One entry

    private func push(_ entry: OutboxEntry) async throws {
        if PayloadDecoding.hasUnresolvedReference(entry.payload) { throw UnresolvedReference() }
        let key = entry.idempotencyKey
        let ifMatch = entry.baseUpdatedAtMs.map { Date(timeIntervalSince1970: Double($0) / 1000) }
        let id = entry.id
        let payload = entry.payload

        if entry.op == .create {
            switch entry.entity {
            case .note: try store.markDone(id, applying: try await api.createNote(PayloadDecoding.note(payload), idempotencyKey: key))
            case .item: try store.markDone(id, applying: try await api.createItem(PayloadDecoding.item(payload), idempotencyKey: key))
            case .project: try store.markDone(id, applying: try await api.createProject(PayloadDecoding.project(payload), idempotencyKey: key))
            case .goal: try store.markDone(id, applying: try await api.createGoal(PayloadDecoding.goal(payload), idempotencyKey: key))
            case .noteTag:
                // The response carries no updatedAt: remap and let the pull fill it in.
                let created = try await api.createNoteTag(PayloadDecoding.noteTag(payload), idempotencyKey: key)
                try store.remapServerId(entity: .noteTag, localId: entry.localId, serverId: created.id)
                try store.markDone(id)
            case .itemOccurrence: throw PayloadError("occurrences are created by the server")
            }
            return
        }

        guard let serverId = try serverID(entry.entity, entry.localId) else {
            throw PayloadError("the row has no server id")
        }
        switch (entry.entity, entry.op) {
        case (.note, .update):
            try store.markDone(id, applying: try await api.updateNote(id: serverId, PayloadDecoding.note(payload), idempotencyKey: key, ifMatch: ifMatch))
        case (.note, .delete):
            try await api.deleteNote(id: serverId, idempotencyKey: key, ifMatch: ifMatch)
            try store.markDone(id)
        case (.noteTag, .delete):
            try await api.deleteNoteTag(id: serverId, idempotencyKey: key)
            try store.markDone(id)
        case (.item, .update):
            try store.markDone(id, applying: try await api.updateItem(id: serverId, PayloadDecoding.itemUpdate(payload), idempotencyKey: key, ifMatch: ifMatch))
        case (.item, .complete):
            try store.markDone(id, applying: try await api.completeItem(id: serverId, PayloadDecoding.complete(payload), idempotencyKey: key, ifMatch: ifMatch))
        case (.item, .delete):
            try await api.deleteItem(id: serverId, idempotencyKey: key, ifMatch: ifMatch)
            try store.markDone(id)
        case (.project, .update):
            try store.markDone(id, applying: try await api.updateProject(id: serverId, PayloadDecoding.projectUpdate(payload), idempotencyKey: key, ifMatch: ifMatch))
        case (.project, .delete):
            try await api.deleteProject(id: serverId, idempotencyKey: key, ifMatch: ifMatch)
            try store.markDone(id)
        case (.goal, .update):
            try store.markDone(id, applying: try await api.updateGoal(id: serverId, PayloadDecoding.goalUpdate(payload), idempotencyKey: key, ifMatch: ifMatch))
        case (.goal, .delete):
            try await api.deleteGoal(id: serverId, idempotencyKey: key, ifMatch: ifMatch)
            try store.markDone(id)
        default:
            throw PayloadError("unsupported operation \(entry.op.rawValue) on \(entry.entity.rawValue)")
        }
    }

    // MARK: Helpers

    private static func describe(_ error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? String(describing: error)
    }

    /// Fallback lookup over the public read APIs. Blind to rows with a pending local delete.
    static func visibleServerID(_ store: LocalStore, _ entity: SyncEntity, _ localId: String) throws -> String? {
        switch entity {
        case .item: return try store.items().first { $0.localId == localId }?.serverId
        case .note:
            return try (store.notes(archived: false) + store.notes(archived: true)).first { $0.localId == localId }?.serverId
        case .noteTag: return try store.tags().first { $0.localId == localId }?.serverId
        case .project:
            return try (store.projects(archived: false) + store.projects(archived: true)).first { $0.localId == localId }?.serverId
        case .goal: return try store.goals().first { $0.localId == localId }?.serverId
        case .itemOccurrence: return nil
        }
    }
}
