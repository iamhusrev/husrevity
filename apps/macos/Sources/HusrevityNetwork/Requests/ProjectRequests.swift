import Foundation

/// Mirrors `ProjectRequestDto` (POST /projects). Dates are `YYYY-MM-DD`-style strings as stored.
public struct ProjectRequest: Codable, Equatable, Sendable {
    public var code: String
    public var name: String
    public var description: String?
    public var status: String?
    public var startDate: String?
    public var endDate: String?
    public var goalId: String?

    public init(
        code: String, name: String, description: String? = nil, status: String? = nil,
        startDate: String? = nil, endDate: String? = nil, goalId: String? = nil
    ) {
        self.code = code
        self.name = name
        self.description = description
        self.status = status
        self.startDate = startDate
        self.endDate = endDate
        self.goalId = goalId
    }
}

/// Mirrors `ProjectUpdateRequestDto` (PUT /projects/:projectId). Despite the verb the server only
/// applies the keys that are present, so absent means unchanged. `code` is immutable server-side.
/// Only the owner may send `goalId` or `archived`.
public struct ProjectUpdateRequest: Encodable, Equatable, Sendable {
    public var name: String?
    public var description: Field<String> = .absent
    public var status: String?
    public var startDate: Field<String> = .absent
    public var endDate: Field<String> = .absent
    public var pinned: Bool?
    public var archived: Bool?
    public var goalId: Field<String> = .absent

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case name, description, status, startDate, endDate, pinned, archived, goalId
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encode(description, forKey: .description)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encode(startDate, forKey: .startDate)
        try c.encode(endDate, forKey: .endDate)
        try c.encodeIfPresent(pinned, forKey: .pinned)
        try c.encodeIfPresent(archived, forKey: .archived)
        try c.encode(goalId, forKey: .goalId)
    }
}
