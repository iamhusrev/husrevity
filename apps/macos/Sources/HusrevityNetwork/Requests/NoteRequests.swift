import Foundation
import HusrevityModels

/// Mirrors `NoteRequestDto`. Used for both POST /notes and PUT /notes/:id (the server replaces
/// the note: a missing `bodyMarkdown` clears the body and a missing `tagIds` clears the tags, so
/// callers send the complete note). nil optionals are omitted from the JSON.
public struct NoteRequest: Codable, Equatable, Sendable {
    public var title: String
    public var bodyMarkdown: String?
    public var pinned: Bool?
    public var archived: Bool?
    public var tagIds: [String]?
    public var colorHex: String?

    public init(
        title: String, bodyMarkdown: String? = nil, pinned: Bool? = nil, archived: Bool? = nil,
        tagIds: [String]? = nil, colorHex: String? = nil
    ) {
        self.title = title
        self.bodyMarkdown = bodyMarkdown
        self.pinned = pinned
        self.archived = archived
        self.tagIds = tagIds
        self.colorHex = colorHex
    }
}

/// Mirrors `TagRequestDto`.
public struct NoteTagRequest: Codable, Equatable, Sendable {
    public var name: String
    public var color: String?

    public init(name: String, color: String? = nil) {
        self.name = name
        self.color = color
    }
}

/// Mirrors `TagDto`, the response of POST /note-tags. Unlike the sync payload's `NoteTagDTO` it
/// carries no `updatedAt`; the next pull supplies it.
public struct NoteTagResponse: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var color: String?

    public init(id: String, name: String, color: String? = nil) {
        self.id = id
        self.name = name
        self.color = color
    }
}
