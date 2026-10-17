import Foundation

/// Mirrors `GoalRequestDto` (POST /goals). `periodStart`/`periodEnd` are `YYYY-MM-DD`.
public struct GoalRequest: Codable, Equatable, Sendable {
    public var title: String
    public var notes: String?
    public var horizon: String
    public var periodStart: String
    public var periodEnd: String
    public var parentGoalId: String?
    public var status: String?

    public init(
        title: String, notes: String? = nil, horizon: String, periodStart: String,
        periodEnd: String, parentGoalId: String? = nil, status: String? = nil
    ) {
        self.title = title
        self.notes = notes
        self.horizon = horizon
        self.periodStart = periodStart
        self.periodEnd = periodEnd
        self.parentGoalId = parentGoalId
        self.status = status
    }
}

/// Mirrors `GoalUpdateRequestDto` (PATCH /goals/:id). Absent keys are left unchanged; `.null`
/// clears `notes` or `parentGoalId`.
public struct GoalUpdateRequest: Encodable, Equatable, Sendable {
    public var title: String?
    public var notes: Field<String> = .absent
    public var horizon: String?
    public var periodStart: String?
    public var periodEnd: String?
    public var parentGoalId: Field<String> = .absent
    public var status: String?

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case title, notes, horizon, periodStart, periodEnd, parentGoalId, status
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encode(notes, forKey: .notes)
        try c.encodeIfPresent(horizon, forKey: .horizon)
        try c.encodeIfPresent(periodStart, forKey: .periodStart)
        try c.encodeIfPresent(periodEnd, forKey: .periodEnd)
        try c.encode(parentGoalId, forKey: .parentGoalId)
        try c.encodeIfPresent(status, forKey: .status)
    }
}
