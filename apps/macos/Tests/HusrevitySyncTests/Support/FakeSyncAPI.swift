import Foundation
import HusrevityModels
import HusrevityNetwork
@testable import HusrevitySync

/// Suspends callers until `open()` is called. Lets a test hold a request "on the wire".
final class ManualGate: @unchecked Sendable {
    private let lock = NSLock()
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var arrivalWaiters: [(Int, CheckedContinuation<Void, Never>)] = []
    private var arrived = 0

    func wait() async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            lock.lock()
            if isOpen {
                lock.unlock()
                c.resume()
                return
            }
            waiters.append(c)
            arrived += 1
            let ready = arrivalWaiters.filter { $0.0 <= arrived }
            arrivalWaiters.removeAll { $0.0 <= arrived }
            lock.unlock()
            ready.forEach { $0.1.resume() }
        }
    }

    /// Returns once `count` callers are suspended in `wait()`.
    func waitForArrivals(_ count: Int = 1) async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            lock.lock()
            if arrived >= count {
                lock.unlock()
                c.resume()
            } else {
                arrivalWaiters.append((count, c))
                lock.unlock()
            }
        }
    }

    func open() {
        lock.lock()
        isOpen = true
        let all = waiters
        waiters = []
        lock.unlock()
        all.forEach { $0.resume() }
    }
}

/// A scripted in-memory stand-in for the API. It behaves like the real server where it matters:
/// idempotent replay by key, `If-Match` enforcement with the real 409 message, 404 for rows
/// deleted on the server, and a deterministic clock for `updatedAt`.
final class FakeSyncAPI: SyncAPI, @unchecked Sendable {
    struct Call: Equatable {
        var op: String
        var id: String?
        var key: String?
        var ifMatch: Date?
        var body: JSONValue?
    }

    struct Failure {
        var error: APIError
        /// The server applied the write before the failure (the response got lost).
        var applyFirst: Bool
    }

    private let lock = NSLock()
    private var _calls: [Call] = []
    private var failures: [String: [Failure]] = [:]
    private var replayCache: [String: Any] = [:]
    private var versions: [String: Date] = [:]
    private var names: [String: String] = [:]
    private var gone: Set<String> = []
    private var applied: [String: Int] = [:]
    private var nextId = 100
    private var tick = 0
    private var syncQueue: [Result<SyncResponse, APIError>] = []
    private var _sinceLog: [String?] = []
    private var gate: ManualGate?

    // MARK: Inspection

    var calls: [Call] { locked { _calls } }
    func calls(_ op: String) -> [Call] { calls.filter { $0.op == op } }
    var writeCalls: [Call] { calls.filter { $0.op != "sync" } }
    var sinceLog: [String?] { locked { _sinceLog } }
    /// How many times the server actually applied `op` (replays do not count).
    func appliedCount(_ op: String) -> Int { locked { applied[op] ?? 0 } }

    // MARK: Scripting

    func failNext(_ op: String, _ error: APIError, applyFirst: Bool = false, times: Int = 1) {
        locked { failures[op, default: []].append(contentsOf: Array(repeating: Failure(error: error, applyFirst: applyFirst), count: times)) }
    }

    func enqueueSync(_ response: SyncResponse) { locked { syncQueue.append(.success(response)) } }
    func enqueueSyncFailure(_ error: APIError) { locked { syncQueue.append(.failure(error)) } }
    func setGate(_ gate: ManualGate?) { locked { self.gate = gate } }

    /// Declares that the server holds `entity:id` at `updatedAt` (drives `If-Match` checks).
    func seed(_ key: String, updatedAt: Date) { locked { versions[key] = updatedAt } }
    func deleteOnServer(_ key: String) { locked { gone.insert(key) } }

    /// Seeds versions from a pulled payload, as if the server had produced it.
    func adopt(_ sync: SyncResponse) {
        for n in sync.notes { seed("note:\(n.id)", updatedAt: n.updatedAt) }
        for g in sync.goals { seed("goal:\(g.id)", updatedAt: g.updatedAt) }
        for p in sync.projects { seed("project:\(p.id)", updatedAt: p.updatedAt) }
        for i in sync.items { seed("item:\(i.id)", updatedAt: i.updatedAt) }
        for t in sync.noteTags { seed("note_tag:\(t.id)", updatedAt: t.updatedAt) }
    }

    func version(_ key: String) -> Date? { locked { versions[key] } }

    private func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }

    // MARK: Server clock

    static let epoch = Date(timeIntervalSince1970: 1_793_491_200)  // 2026-11-01T00:00:00Z

    /// Called with the lock held.
    private func tickLocked() -> Date {
        tick += 1
        return Self.epoch.addingTimeInterval(Double(tick))
    }

    static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }

    // MARK: SyncAPI: pull

    func sync(since cursor: String?) async throws -> SyncResponse {
        let result: Result<SyncResponse, APIError> = locked {
            _calls.append(Call(op: "sync", id: nil, key: nil, ifMatch: nil, body: cursor.map { .string($0) }))
            _sinceLog.append(cursor)
            if !syncQueue.isEmpty { return syncQueue.removeFirst() }
            return .success(Self.emptySync(cursor: "cursor-\(_sinceLog.count)"))
        }
        return try result.get()
    }

    static func emptySync(cursor: String) -> SyncResponse {
        let json: [String: Any] = [
            "items": [], "itemOccurrences": [], "notes": [], "noteTags": [], "projects": [], "goals": [],
            "tombstones": ["items": [], "itemOccurrences": [], "notes": [], "noteTags": [], "projects": [], "goals": []],
            "cursor": cursor,
        ]
        return decode(json)
    }

    static func decode<T: Decodable>(_ json: [String: Any]) -> T {
        let data = try! JSONSerialization.data(withJSONObject: json)
        return try! APICoding.decoder.decode(T.self, from: data)
    }

    // MARK: Generic write

    private func write<T>(
        _ op: String, id: String? = nil, entityKey: String? = nil, key: String, ifMatch: Date?,
        body: Encodable? = nil, isDelete: Bool = false, apply: (Date) -> T
    ) async throws -> T {
        let encodedBody: JSONValue? = body.flatMap {
            (try? APICoding.encoder.encode(AnyEncodable($0))).flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) }
        }
        let currentGate: ManualGate? = locked {
            _calls.append(Call(op: op, id: id, key: key, ifMatch: ifMatch, body: encodedBody))
            return gate
        }
        await currentGate?.wait()
        try Task.checkCancellation()

        return try locked {
            let cacheKey = "\(op)|\(key)"
            if let cached = replayCache[cacheKey] as? T { return cached }
            let failure: Failure? = {
                guard var queue = failures[op], !queue.isEmpty else { return nil }
                let first = queue.removeFirst()
                failures[op] = queue
                return first
            }()
            if let failure, !failure.applyFirst { throw failure.error }

            if let entityKey {
                if gone.contains(entityKey) { throw APIError.notFound }
                if let ifMatch, let current = versions[entityKey],
                    ifMatch.epochMilliseconds != current.epochMilliseconds
                {
                    throw APIError.conflict(
                        "\(entityKey.prefix(while: { $0 != ":" }).capitalized) has been modified since you last fetched it (current updatedAt: \(Self.iso(current)))"
                    )
                }
            }
            let now = tickLocked()
            let result = apply(now)
            if let entityKey {
                if isDelete { gone.insert(entityKey) } else { versions[entityKey] = now }
            }
            replayCache[cacheKey] = result
            applied[op, default: 0] += 1
            if let failure { throw failure.error }
            return result
        }
    }

    private func newId() -> String {
        // Called inside `apply` with the lock held.
        nextId += 1
        return String(nextId)
    }

    // MARK: Notes

    private func noteDTO(id: String, title: String, _ r: NoteRequest, _ now: Date) -> NoteDTO {
        Self.decode([
            "id": id, "title": title, "bodyMarkdown": r.bodyMarkdown as Any? ?? NSNull(),
            "pinned": r.pinned ?? false, "archived": r.archived ?? false, "position": 0,
            "colorHex": r.colorHex as Any? ?? NSNull(),
            "tags": (r.tagIds ?? []).map { ["id": $0, "name": "tag-\($0)", "color": NSNull()] as [String: Any] },
            "createdAt": Self.iso(now), "updatedAt": Self.iso(now),
        ])
    }

    func createNote(_ request: NoteRequest, idempotencyKey: String) async throws -> NoteDTO {
        try await write("createNote", key: idempotencyKey, ifMatch: nil, body: request) { now in
            let id = newId()
            versions["note:\(id)"] = now
            return noteDTO(id: id, title: request.title, request, now)
        }
    }

    func updateNote(id: String, _ request: NoteRequest, idempotencyKey: String, ifMatch: Date?) async throws -> NoteDTO {
        try await write("updateNote", id: id, entityKey: "note:\(id)", key: idempotencyKey, ifMatch: ifMatch, body: request) { now in
            noteDTO(id: id, title: request.title, request, now)
        }
    }

    func deleteNote(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await write("deleteNote", id: id, entityKey: "note:\(id)", key: idempotencyKey, ifMatch: ifMatch, isDelete: true) { _ in () }
    }

    // MARK: Note tags

    func createNoteTag(_ request: NoteTagRequest, idempotencyKey: String) async throws -> NoteTagResponse {
        try await write("createNoteTag", key: idempotencyKey, ifMatch: nil, body: request) { now in
            let id = newId()
            versions["note_tag:\(id)"] = now
            return NoteTagResponse(id: id, name: request.name, color: request.color)
        }
    }

    func deleteNoteTag(id: String, idempotencyKey: String) async throws {
        try await write("deleteNoteTag", id: id, entityKey: "note_tag:\(id)", key: idempotencyKey, ifMatch: nil, isDelete: true) { _ in () }
    }

    // MARK: Items

    private func itemDTO(id: String, title: String, kind: String, status: String, completed: Date?, projectId: String? = nil, _ now: Date) -> ItemDTO {
        Self.decode([
            "id": id, "kind": kind, "title": title, "notes": NSNull(), "context": NSNull(),
            "projectId": projectId as Any? ?? NSNull(), "goalId": NSNull(), "blockId": NSNull(), "scheduledAt": NSNull(),
            "durationMin": NSNull(), "dueAt": NSNull(), "notifyMinutesBefore": NSNull(),
            "rrule": NSNull(), "status": status, "completedAt": completed.map { Self.iso($0) } as Any? ?? NSNull(),
            "payload": [String: Any](), "source": "macos", "createdAt": Self.iso(now), "updatedAt": Self.iso(now),
        ])
    }

    func createItem(_ request: ItemRequest, idempotencyKey: String) async throws -> ItemDTO {
        try await write("createItem", key: idempotencyKey, ifMatch: nil, body: request) { now in
            let id = newId()
            names["item:\(id)"] = request.title
            versions["item:\(id)"] = now
            return itemDTO(id: id, title: request.title, kind: request.kind, status: request.status ?? "open", completed: nil, projectId: request.projectId, now)
        }
    }

    func updateItem(id: String, _ request: ItemUpdateRequest, idempotencyKey: String, ifMatch: Date?) async throws -> ItemDTO {
        try await write("updateItem", id: id, entityKey: "item:\(id)", key: idempotencyKey, ifMatch: ifMatch, body: request) { now in
            if let title = request.title { names["item:\(id)"] = title }
            return itemDTO(id: id, title: names["item:\(id)"] ?? "item", kind: request.kind ?? "task", status: request.status ?? "open", completed: nil, now)
        }
    }

    func deleteItem(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await write("deleteItem", id: id, entityKey: "item:\(id)", key: idempotencyKey, ifMatch: ifMatch, isDelete: true) { _ in () }
    }

    func completeItem(id: String, _ request: CompleteItemRequest, idempotencyKey: String, ifMatch: Date?) async throws -> ItemDTO {
        try await write("completeItem", id: id, entityKey: "item:\(id)", key: idempotencyKey, ifMatch: ifMatch, body: request) { now in
            itemDTO(id: id, title: names["item:\(id)"] ?? "item", kind: "task", status: "done", completed: now, now)
        }
    }

    // MARK: Projects

    private func projectDTO(id: String, code: String, name: String, _ now: Date) -> ProjectDTO {
        Self.decode([
            "id": id, "code": code, "name": name, "description": NSNull(), "status": "ACTIVE",
            "startDate": NSNull(), "endDate": NSNull(), "goalId": NSNull(), "pinned": false,
            "archived": false, "createdAt": Self.iso(now), "updatedAt": Self.iso(now), "ownerId": "1",
            "ownerName": NSNull(), "role": "OWNER", "shared": false, "memberCount": 1,
        ])
    }

    func createProject(_ request: ProjectRequest, idempotencyKey: String) async throws -> ProjectDTO {
        try await write("createProject", key: idempotencyKey, ifMatch: nil, body: request) { now in
            let id = newId()
            names["project:\(id)"] = request.name
            versions["project:\(id)"] = now
            return projectDTO(id: id, code: request.code, name: request.name, now)
        }
    }

    func updateProject(id: String, _ request: ProjectUpdateRequest, idempotencyKey: String, ifMatch: Date?) async throws -> ProjectDTO {
        try await write("updateProject", id: id, entityKey: "project:\(id)", key: idempotencyKey, ifMatch: ifMatch, body: request) { now in
            if let name = request.name { names["project:\(id)"] = name }
            return projectDTO(id: id, code: "CODE", name: names["project:\(id)"] ?? "project", now)
        }
    }

    func deleteProject(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await write("deleteProject", id: id, entityKey: "project:\(id)", key: idempotencyKey, ifMatch: ifMatch, isDelete: true) { _ in () }
    }

    // MARK: Goals

    private func goalDTO(id: String, title: String, horizon: String, _ now: Date) -> GoalDTO {
        Self.decode([
            "id": id, "title": title, "notes": NSNull(), "horizon": horizon, "periodStart": "2026-02-01",
            "periodEnd": "2026-02-28", "parentGoalId": NSNull(), "status": "active",
            "createdAt": Self.iso(now), "updatedAt": Self.iso(now),
        ])
    }

    func createGoal(_ request: GoalRequest, idempotencyKey: String) async throws -> GoalDTO {
        try await write("createGoal", key: idempotencyKey, ifMatch: nil, body: request) { now in
            let id = newId()
            names["goal:\(id)"] = request.title
            versions["goal:\(id)"] = now
            return goalDTO(id: id, title: request.title, horizon: request.horizon, now)
        }
    }

    func updateGoal(id: String, _ request: GoalUpdateRequest, idempotencyKey: String, ifMatch: Date?) async throws -> GoalDTO {
        try await write("updateGoal", id: id, entityKey: "goal:\(id)", key: idempotencyKey, ifMatch: ifMatch, body: request) { now in
            if let title = request.title { names["goal:\(id)"] = title }
            return goalDTO(id: id, title: names["goal:\(id)"] ?? "goal", horizon: request.horizon ?? "month", now)
        }
    }

    func deleteGoal(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await write("deleteGoal", id: id, entityKey: "goal:\(id)", key: idempotencyKey, ifMatch: ifMatch, isDelete: true) { _ in () }
    }
}

private struct AnyEncodable: Encodable {
    let base: Encodable
    init(_ base: Encodable) { self.base = base }
    func encode(to encoder: Encoder) throws { try base.encode(to: encoder) }
}
