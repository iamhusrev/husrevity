import Foundation
import HusrevityCore

/// Forwards every sync call to the current `APIClient`. The engine is built once at launch, but the
/// server URL is only known (and may change) at sign-in, so the client behind it is swappable.
final class SwitchableSyncAPI: SyncAPI, @unchecked Sendable {
    private let lock = NSLock()
    private var client: any SyncAPI

    init(initial: any SyncAPI) { client = initial }

    func use(_ next: any SyncAPI) {
        lock.lock()
        client = next
        lock.unlock()
    }

    private var current: any SyncAPI {
        lock.lock()
        defer { lock.unlock() }
        return client
    }

    func sync(since cursor: String?) async throws -> SyncResponse {
        try await current.sync(since: cursor)
    }

    func createNote(_ request: NoteRequest, idempotencyKey: String) async throws -> NoteDTO {
        try await current.createNote(request, idempotencyKey: idempotencyKey)
    }

    func updateNote(id: String, _ request: NoteRequest, idempotencyKey: String, ifMatch: Date?) async throws -> NoteDTO {
        try await current.updateNote(id: id, request, idempotencyKey: idempotencyKey, ifMatch: ifMatch)
    }

    func deleteNote(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await current.deleteNote(id: id, idempotencyKey: idempotencyKey, ifMatch: ifMatch)
    }

    func createNoteTag(_ request: NoteTagRequest, idempotencyKey: String) async throws -> NoteTagResponse {
        try await current.createNoteTag(request, idempotencyKey: idempotencyKey)
    }

    func deleteNoteTag(id: String, idempotencyKey: String) async throws {
        try await current.deleteNoteTag(id: id, idempotencyKey: idempotencyKey)
    }

    func createItem(_ request: ItemRequest, idempotencyKey: String) async throws -> ItemDTO {
        try await current.createItem(request, idempotencyKey: idempotencyKey)
    }

    func updateItem(id: String, _ request: ItemUpdateRequest, idempotencyKey: String, ifMatch: Date?) async throws -> ItemDTO {
        try await current.updateItem(id: id, request, idempotencyKey: idempotencyKey, ifMatch: ifMatch)
    }

    func deleteItem(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await current.deleteItem(id: id, idempotencyKey: idempotencyKey, ifMatch: ifMatch)
    }

    func completeItem(id: String, _ request: CompleteItemRequest, idempotencyKey: String, ifMatch: Date?) async throws -> ItemDTO {
        try await current.completeItem(id: id, request, idempotencyKey: idempotencyKey, ifMatch: ifMatch)
    }

    func createProject(_ request: ProjectRequest, idempotencyKey: String) async throws -> ProjectDTO {
        try await current.createProject(request, idempotencyKey: idempotencyKey)
    }

    func updateProject(id: String, _ request: ProjectUpdateRequest, idempotencyKey: String, ifMatch: Date?) async throws -> ProjectDTO {
        try await current.updateProject(id: id, request, idempotencyKey: idempotencyKey, ifMatch: ifMatch)
    }

    func deleteProject(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await current.deleteProject(id: id, idempotencyKey: idempotencyKey, ifMatch: ifMatch)
    }

    func createGoal(_ request: GoalRequest, idempotencyKey: String) async throws -> GoalDTO {
        try await current.createGoal(request, idempotencyKey: idempotencyKey)
    }

    func updateGoal(id: String, _ request: GoalUpdateRequest, idempotencyKey: String, ifMatch: Date?) async throws -> GoalDTO {
        try await current.updateGoal(id: id, request, idempotencyKey: idempotencyKey, ifMatch: ifMatch)
    }

    func deleteGoal(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await current.deleteGoal(id: id, idempotencyKey: idempotencyKey, ifMatch: ifMatch)
    }
}
