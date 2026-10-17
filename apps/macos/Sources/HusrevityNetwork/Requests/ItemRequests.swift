import Foundation
import HusrevityModels

/// Mirrors `ItemRequestDto` (POST /items). nil optionals are omitted; dates are sent as ISO-8601
/// with milliseconds.
public struct ItemRequest: Encodable, Equatable, Sendable {
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
    public var status: String?
    public var payload: JSONValue?
    public var source: String?

    public init(
        kind: String, title: String, notes: String? = nil, context: String? = nil,
        projectId: String? = nil, goalId: String? = nil, blockId: String? = nil,
        scheduledAt: Date? = nil, durationMin: Int? = nil, dueAt: Date? = nil,
        notifyMinutesBefore: Int? = nil, rrule: String? = nil, status: String? = nil,
        payload: JSONValue? = nil, source: String? = nil
    ) {
        self.kind = kind
        self.title = title
        self.notes = notes
        self.context = context
        self.projectId = projectId
        self.goalId = goalId
        self.blockId = blockId
        self.scheduledAt = scheduledAt
        self.durationMin = durationMin
        self.dueAt = dueAt
        self.notifyMinutesBefore = notifyMinutesBefore
        self.rrule = rrule
        self.status = status
        self.payload = payload
        self.source = source
    }
}

/// Mirrors `ItemUpdateRequestDto` (PATCH /items/:id, a `PartialType` of the create DTO). Every
/// field defaults to `.absent` (unchanged). Nullable columns use `Field` so `.null` clears them.
public struct ItemUpdateRequest: Encodable, Equatable, Sendable {
    public var kind: String?
    public var title: String?
    public var notes: Field<String> = .absent
    public var context: Field<String> = .absent
    public var projectId: Field<String> = .absent
    public var goalId: Field<String> = .absent
    public var blockId: Field<String> = .absent
    public var scheduledAt: Field<Date> = .absent
    public var durationMin: Field<Int> = .absent
    public var dueAt: Field<Date> = .absent
    public var notifyMinutesBefore: Field<Int> = .absent
    public var rrule: Field<String> = .absent
    public var status: String?
    public var payload: JSONValue?
    public var source: String?

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case kind, title, notes, context, projectId, goalId, blockId, scheduledAt, durationMin
        case dueAt, notifyMinutesBefore, rrule, status, payload, source
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(kind, forKey: .kind)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encode(notes, forKey: .notes)
        try c.encode(context, forKey: .context)
        try c.encode(projectId, forKey: .projectId)
        try c.encode(goalId, forKey: .goalId)
        try c.encode(blockId, forKey: .blockId)
        try c.encode(scheduledAt, forKey: .scheduledAt)
        try c.encode(durationMin, forKey: .durationMin)
        try c.encode(dueAt, forKey: .dueAt)
        try c.encode(notifyMinutesBefore, forKey: .notifyMinutesBefore)
        try c.encode(rrule, forKey: .rrule)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(payload, forKey: .payload)
        try c.encodeIfPresent(source, forKey: .source)
    }
}

/// Mirrors `CompleteItemRequestDto` (POST /items/:id/complete). `occursOn` (`YYYY-MM-DD`) is
/// required by the server only for recurring items.
public struct CompleteItemRequest: Codable, Equatable, Sendable {
    public var occursOn: String?

    public init(occursOn: String? = nil) { self.occursOn = occursOn }
}
