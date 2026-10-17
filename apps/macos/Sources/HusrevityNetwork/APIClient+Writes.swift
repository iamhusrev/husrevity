import Foundation
import HusrevityModels

// Write endpoints the sync engine replays from its outbox. Every call carries the outbox entry's
// `Idempotency-Key` (a retry with the same key replays the original response). `ifMatch` is the
// `updatedAt` the client last saw, sent as epoch milliseconds; a stale value yields `.conflict`,
// nil writes unconditionally.

extension APIClient {
    private func write(
        _ method: String, _ path: String, body: Data? = nil, key: String, ifMatch: Date? = nil
    ) -> RequestSpec {
        RequestSpec(method: method, path: path, body: body, idempotencyKey: key, ifMatch: ifMatch)
    }

    // MARK: Notes

    public func createNote(_ request: NoteRequest, idempotencyKey: String) async throws -> NoteDTO {
        try await send(write("POST", "/notes", body: try encode(request), key: idempotencyKey))
    }

    public func updateNote(
        id: String, _ request: NoteRequest, idempotencyKey: String, ifMatch: Date?
    ) async throws -> NoteDTO {
        try await send(write("PUT", "/notes/\(id)", body: try encode(request), key: idempotencyKey, ifMatch: ifMatch))
    }

    public func deleteNote(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await sendVoid(write("DELETE", "/notes/\(id)", key: idempotencyKey, ifMatch: ifMatch))
    }

    // MARK: Note tags

    public func createNoteTag(_ request: NoteTagRequest, idempotencyKey: String) async throws -> NoteTagResponse {
        try await send(write("POST", "/note-tags", body: try encode(request), key: idempotencyKey))
    }

    /// The server takes no `If-Match` for tag deletion.
    public func deleteNoteTag(id: String, idempotencyKey: String) async throws {
        try await sendVoid(write("DELETE", "/note-tags/\(id)", key: idempotencyKey))
    }

    // MARK: Items

    public func createItem(_ request: ItemRequest, idempotencyKey: String) async throws -> ItemDTO {
        try await send(write("POST", "/items", body: try encode(request), key: idempotencyKey))
    }

    public func updateItem(
        id: String, _ request: ItemUpdateRequest, idempotencyKey: String, ifMatch: Date?
    ) async throws -> ItemDTO {
        try await send(write("PATCH", "/items/\(id)", body: try encode(request), key: idempotencyKey, ifMatch: ifMatch))
    }

    public func deleteItem(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await sendVoid(write("DELETE", "/items/\(id)", key: idempotencyKey, ifMatch: ifMatch))
    }

    /// Marks a task done. For a recurring item pass `occursOn` to complete that occurrence.
    public func completeItem(
        id: String, _ request: CompleteItemRequest = CompleteItemRequest(), idempotencyKey: String,
        ifMatch: Date?
    ) async throws -> ItemDTO {
        try await send(
            write("POST", "/items/\(id)/complete", body: try encode(request), key: idempotencyKey, ifMatch: ifMatch)
        )
    }

    // MARK: Projects

    public func createProject(_ request: ProjectRequest, idempotencyKey: String) async throws -> ProjectDTO {
        try await send(write("POST", "/projects", body: try encode(request), key: idempotencyKey))
    }

    public func updateProject(
        id: String, _ request: ProjectUpdateRequest, idempotencyKey: String, ifMatch: Date?
    ) async throws -> ProjectDTO {
        try await send(write("PUT", "/projects/\(id)", body: try encode(request), key: idempotencyKey, ifMatch: ifMatch))
    }

    public func deleteProject(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await sendVoid(write("DELETE", "/projects/\(id)", key: idempotencyKey, ifMatch: ifMatch))
    }

    // MARK: Goals

    public func createGoal(_ request: GoalRequest, idempotencyKey: String) async throws -> GoalDTO {
        try await send(write("POST", "/goals", body: try encode(request), key: idempotencyKey))
    }

    public func updateGoal(
        id: String, _ request: GoalUpdateRequest, idempotencyKey: String, ifMatch: Date?
    ) async throws -> GoalDTO {
        try await send(write("PATCH", "/goals/\(id)", body: try encode(request), key: idempotencyKey, ifMatch: ifMatch))
    }

    public func deleteGoal(id: String, idempotencyKey: String, ifMatch: Date?) async throws {
        try await sendVoid(write("DELETE", "/goals/\(id)", key: idempotencyKey, ifMatch: ifMatch))
    }
}
