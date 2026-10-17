import Foundation
import HusrevityModels
import HusrevityNetwork

/// The slice of `APIClient` the sync engine calls. Production uses `APIClient` itself; tests
/// script a fake. Every write takes the outbox entry's `Idempotency-Key` and, for changes to an
/// existing row, the `If-Match` value (nil writes unconditionally).
public protocol SyncAPI: Sendable {
    func sync(since cursor: String?) async throws -> SyncResponse

    func createNote(_ request: NoteRequest, idempotencyKey: String) async throws -> NoteDTO
    func updateNote(id: String, _ request: NoteRequest, idempotencyKey: String, ifMatch: Date?) async throws -> NoteDTO
    func deleteNote(id: String, idempotencyKey: String, ifMatch: Date?) async throws

    func createNoteTag(_ request: NoteTagRequest, idempotencyKey: String) async throws -> NoteTagResponse
    func deleteNoteTag(id: String, idempotencyKey: String) async throws

    func createItem(_ request: ItemRequest, idempotencyKey: String) async throws -> ItemDTO
    func updateItem(id: String, _ request: ItemUpdateRequest, idempotencyKey: String, ifMatch: Date?) async throws -> ItemDTO
    func deleteItem(id: String, idempotencyKey: String, ifMatch: Date?) async throws
    func completeItem(id: String, _ request: CompleteItemRequest, idempotencyKey: String, ifMatch: Date?) async throws -> ItemDTO

    func createProject(_ request: ProjectRequest, idempotencyKey: String) async throws -> ProjectDTO
    func updateProject(id: String, _ request: ProjectUpdateRequest, idempotencyKey: String, ifMatch: Date?) async throws -> ProjectDTO
    func deleteProject(id: String, idempotencyKey: String, ifMatch: Date?) async throws

    func createGoal(_ request: GoalRequest, idempotencyKey: String) async throws -> GoalDTO
    func updateGoal(id: String, _ request: GoalUpdateRequest, idempotencyKey: String, ifMatch: Date?) async throws -> GoalDTO
    func deleteGoal(id: String, idempotencyKey: String, ifMatch: Date?) async throws
}

extension APIClient: SyncAPI {}
