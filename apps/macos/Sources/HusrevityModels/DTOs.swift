import Foundation

// Wire shapes of the API, mirrored from the real responses in Tests/.../Fixtures.
// Ids are strings (the server uses bigserial). Enumerated fields stay plain strings so a value
// added server-side never breaks decoding of the whole payload.

public struct ItemDTO: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var kind: String
    public var title: String
    public var notes: String?
    public var context: String?
    public var projectId: String?
    public var goalId: String?
    public var blockId: String?
    public var scheduledAt: Date?
    public var durationMin: Int?
    public var dueAt: Date?
    public var notifyMinutesBefore: Int?
    public var rrule: String?
    public var status: String
    public var completedAt: Date?
    public var payload: JSONValue
    public var source: String
    public var createdAt: Date
    public var updatedAt: Date
}

public struct ItemOccurrenceDTO: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var itemId: String
    /// Local calendar date, `YYYY-MM-DD`.
    public var occursOn: String
    public var status: String
    public var completedAt: Date?
    public var updatedAt: Date
}

public struct NoteTagRef: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var color: String?
}

public struct NoteTagDTO: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var color: String?
    public var updatedAt: Date
}

public struct NoteDTO: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var bodyMarkdown: String?
    public var pinned: Bool
    public var archived: Bool
    public var position: Int
    public var colorHex: String?
    public var tags: [NoteTagRef]
    public var createdAt: Date
    public var updatedAt: Date
}

public struct ProjectDTO: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var code: String
    public var name: String
    public var description: String?
    public var status: String
    public var startDate: String?
    public var endDate: String?
    public var goalId: String?
    public var pinned: Bool
    public var archived: Bool
    public var createdAt: Date
    public var updatedAt: Date
    public var ownerId: String
    public var ownerName: String?
    public var role: String
    public var shared: Bool
    public var memberCount: Int
}

/// Raw goal row: the server sends no `progress` over sync; the client derives it locally.
public struct GoalDTO: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var notes: String?
    public var horizon: String
    public var periodStart: String
    public var periodEnd: String
    public var parentGoalId: String?
    public var status: String
    public var createdAt: Date
    public var updatedAt: Date
}

public struct SyncTombstones: Codable, Equatable, Sendable {
    public var items: [String]
    public var itemOccurrences: [String]
    public var notes: [String]
    public var noteTags: [String]
    public var projects: [String]
    public var goals: [String]

    public static let empty = SyncTombstones(
        items: [], itemOccurrences: [], notes: [], noteTags: [], projects: [], goals: []
    )
}

public struct SyncResponse: Codable, Equatable, Sendable {
    public var items: [ItemDTO]
    public var itemOccurrences: [ItemOccurrenceDTO]
    public var notes: [NoteDTO]
    public var noteTags: [NoteTagDTO]
    public var projects: [ProjectDTO]
    public var goals: [GoalDTO]
    public var tombstones: SyncTombstones
    /// ISO timestamp to pass back as `since` on the next call. Kept as the server's string.
    public var cursor: String
}

public struct UserDTO: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var email: String
    public var firstName: String?
    public var lastName: String?
    public var enabled: Bool
    public var emailNotificationsEnabled: Bool
    public var role: String
    public var navPreferences: JSONValue?
}

public struct AuthResponse: Codable, Equatable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    public var user: UserDTO
}
