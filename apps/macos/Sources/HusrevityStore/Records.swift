import Foundation
import GRDB
import HusrevityModels

public struct ItemRecord: SyncedRecord {
    public static let entity = SyncEntity.item

    public var localId: String
    public var serverId: String?
    public var kind: String
    public var title: String
    public var notes: String?
    public var context: String?
    /// Reference to a project: a server id or a `local:<uuid>` placeholder.
    public var projectId: String?
    /// Reference to a goal: a server id or a `local:<uuid>` placeholder.
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

    public init(
        localId: String = UUID().uuidString, serverId: String? = nil, kind: String = "task",
        title: String, notes: String? = nil, context: String? = nil, projectId: String? = nil,
        goalId: String? = nil, blockId: String? = nil, scheduledAt: Date? = nil,
        durationMin: Int? = nil, dueAt: Date? = nil, notifyMinutesBefore: Int? = nil,
        rrule: String? = nil, status: String = "open", completedAt: Date? = nil,
        payload: JSONValue = .object([:]), source: String = "macos", createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.localId = localId
        self.serverId = serverId
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
        self.completedAt = completedAt
        self.payload = payload
        self.source = source
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(dto: ItemDTO, localId: String) {
        self.init(
            localId: localId, serverId: dto.id, kind: dto.kind, title: dto.title, notes: dto.notes,
            context: dto.context, projectId: dto.projectId, goalId: dto.goalId, blockId: dto.blockId,
            scheduledAt: dto.scheduledAt, durationMin: dto.durationMin, dueAt: dto.dueAt,
            notifyMinutesBefore: dto.notifyMinutesBefore, rrule: dto.rrule, status: dto.status,
            completedAt: dto.completedAt, payload: dto.payload, source: dto.source,
            createdAt: dto.createdAt, updatedAt: dto.updatedAt
        )
    }

    public func wireBody(_ db: Database) throws -> [String: JSONValue] {
        [
            "kind": .string(kind), "title": .string(title), "notes": Wire.string(notes),
            "context": Wire.string(context), "projectId": Wire.string(projectId),
            "goalId": Wire.string(goalId), "blockId": Wire.string(blockId),
            "scheduledAt": Wire.date(scheduledAt), "durationMin": Wire.int(durationMin),
            "dueAt": Wire.date(dueAt), "notifyMinutesBefore": Wire.int(notifyMinutesBefore),
            "rrule": Wire.string(rrule), "status": .string(status), "payload": payload,
            "source": .string(source),
        ]
    }
}

public struct ItemOccurrenceRecord: SyncedRecord {
    public static let entity = SyncEntity.itemOccurrence

    public var localId: String
    public var serverId: String?
    /// Reference to the item: a server id or a `local:<uuid>` placeholder.
    public var itemId: String
    /// Local calendar date, `YYYY-MM-DD`.
    public var occursOn: String
    public var status: String
    public var completedAt: Date?
    public var updatedAt: Date

    public init(
        localId: String = UUID().uuidString, serverId: String? = nil, itemId: String,
        occursOn: String, status: String = "open", completedAt: Date? = nil, updatedAt: Date = Date()
    ) {
        self.localId = localId
        self.serverId = serverId
        self.itemId = itemId
        self.occursOn = occursOn
        self.status = status
        self.completedAt = completedAt
        self.updatedAt = updatedAt
    }

    init(dto: ItemOccurrenceDTO, localId: String) {
        self.init(
            localId: localId, serverId: dto.id, itemId: dto.itemId, occursOn: dto.occursOn,
            status: dto.status, completedAt: dto.completedAt, updatedAt: dto.updatedAt
        )
    }

    /// Occurrences are materialised by the server; the client only completes them via the item.
    public func wireBody(_ db: Database) throws -> [String: JSONValue] { [:] }
}

public struct NoteTagRecord: SyncedRecord {
    public static let entity = SyncEntity.noteTag

    public var localId: String
    public var serverId: String?
    public var name: String
    public var color: String?
    public var updatedAt: Date

    public init(
        localId: String = UUID().uuidString, serverId: String? = nil, name: String,
        color: String? = nil, updatedAt: Date = Date()
    ) {
        self.localId = localId
        self.serverId = serverId
        self.name = name
        self.color = color
        self.updatedAt = updatedAt
    }

    init(dto: NoteTagDTO, localId: String) {
        self.init(
            localId: localId, serverId: dto.id, name: dto.name, color: dto.color,
            updatedAt: dto.updatedAt
        )
    }

    public func wireBody(_ db: Database) throws -> [String: JSONValue] {
        ["name": .string(name), "color": Wire.string(color)]
    }
}

public struct NoteRecord: SyncedRecord {
    public static let entity = SyncEntity.note

    public var localId: String
    public var serverId: String?
    public var title: String
    public var bodyMarkdown: String?
    public var pinned: Bool
    public var archived: Bool
    public var position: Int
    public var colorHex: String?
    public var createdAt: Date
    public var updatedAt: Date
    /// Local ids of the assigned tags. Not a column: persisted in `note_tag_assignment` and filled
    /// in by the store's read APIs.
    public var tagIds: [String] = []

    enum CodingKeys: String, CodingKey {
        case localId, serverId, title, bodyMarkdown, pinned, archived, position, colorHex
        case createdAt, updatedAt
    }

    public init(
        localId: String = UUID().uuidString, serverId: String? = nil, title: String,
        bodyMarkdown: String? = nil, pinned: Bool = false, archived: Bool = false,
        position: Int = 0, colorHex: String? = nil, createdAt: Date = Date(),
        updatedAt: Date = Date(), tagIds: [String] = []
    ) {
        self.localId = localId
        self.serverId = serverId
        self.title = title
        self.bodyMarkdown = bodyMarkdown
        self.pinned = pinned
        self.archived = archived
        self.position = position
        self.colorHex = colorHex
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.tagIds = tagIds
    }

    init(dto: NoteDTO, localId: String) {
        self.init(
            localId: localId, serverId: dto.id, title: dto.title, bodyMarkdown: dto.bodyMarkdown,
            pinned: dto.pinned, archived: dto.archived, position: dto.position,
            colorHex: dto.colorHex, createdAt: dto.createdAt, updatedAt: dto.updatedAt
        )
    }

    public static func load(_ db: Database, localId: String) throws -> NoteRecord? {
        guard var note = try fetchOne(
            db, sql: "SELECT * FROM note WHERE local_id = ? AND deleted_locally = 0", arguments: [localId]
        ) else { return nil }
        note.tagIds = try tagIds(db, noteLocalId: localId)
        return note
    }

    /// Tag local ids of a note, in a stable order, skipping tags with a pending local delete.
    static func tagIds(_ db: Database, noteLocalId: String) throws -> [String] {
        try String.fetchAll(
            db,
            sql: """
                SELECT a.tag_local_id FROM note_tag_assignment a
                JOIN note_tag t ON t.local_id = a.tag_local_id
                WHERE a.note_local_id = ? AND t.deleted_locally = 0
                ORDER BY t.name COLLATE NOCASE, t.local_id
                """,
            arguments: [noteLocalId]
        )
    }

    public func persist(_ db: Database) throws {
        try save(db)
        try db.execute(sql: "DELETE FROM note_tag_assignment WHERE note_local_id = ?", arguments: [localId])
        for tagId in tagIds {
            try db.execute(
                sql: "INSERT OR IGNORE INTO note_tag_assignment(note_local_id, tag_local_id) VALUES (?, ?)",
                arguments: [localId, tagId]
            )
        }
    }

    public func wireBody(_ db: Database) throws -> [String: JSONValue] {
        let refs = try tagIds.map { tagLocalId -> JSONValue in
            guard let tag = try NoteTagRecord.fetchOne(db, key: tagLocalId) else {
                throw StoreError.notFound(entity: .noteTag, localId: tagLocalId)
            }
            return .string(tag.reference)
        }
        return [
            "title": .string(title), "bodyMarkdown": Wire.string(bodyMarkdown),
            "pinned": .bool(pinned), "archived": .bool(archived),
            "colorHex": Wire.string(colorHex), "tagIds": .array(refs),
        ]
    }
}

public struct ProjectRecord: SyncedRecord {
    public static let entity = SyncEntity.project

    public var localId: String
    public var serverId: String?
    public var code: String
    public var name: String
    public var description: String?
    public var status: String
    public var startDate: String?
    public var endDate: String?
    /// Reference to a goal: a server id or a `local:<uuid>` placeholder.
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

    public init(
        localId: String = UUID().uuidString, serverId: String? = nil, code: String, name: String,
        description: String? = nil, status: String = "active", startDate: String? = nil,
        endDate: String? = nil, goalId: String? = nil, pinned: Bool = false,
        archived: Bool = false, createdAt: Date = Date(), updatedAt: Date = Date(),
        ownerId: String = "", ownerName: String? = nil, role: String = "OWNER",
        shared: Bool = false, memberCount: Int = 1
    ) {
        self.localId = localId
        self.serverId = serverId
        self.code = code
        self.name = name
        self.description = description
        self.status = status
        self.startDate = startDate
        self.endDate = endDate
        self.goalId = goalId
        self.pinned = pinned
        self.archived = archived
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.ownerId = ownerId
        self.ownerName = ownerName
        self.role = role
        self.shared = shared
        self.memberCount = memberCount
    }

    init(dto: ProjectDTO, localId: String) {
        self.init(
            localId: localId, serverId: dto.id, code: dto.code, name: dto.name,
            description: dto.description, status: dto.status, startDate: dto.startDate,
            endDate: dto.endDate, goalId: dto.goalId, pinned: dto.pinned, archived: dto.archived,
            createdAt: dto.createdAt, updatedAt: dto.updatedAt, ownerId: dto.ownerId,
            ownerName: dto.ownerName, role: dto.role, shared: dto.shared, memberCount: dto.memberCount
        )
    }

    public func wireBody(_ db: Database) throws -> [String: JSONValue] {
        [
            "code": .string(code), "name": .string(name), "description": Wire.string(description),
            "status": .string(status), "startDate": Wire.string(startDate),
            "endDate": Wire.string(endDate), "goalId": Wire.string(goalId),
            "pinned": .bool(pinned), "archived": .bool(archived),
        ]
    }
}

public struct GoalRecord: SyncedRecord {
    public static let entity = SyncEntity.goal

    public var localId: String
    public var serverId: String?
    public var title: String
    public var notes: String?
    public var horizon: String
    public var periodStart: String
    public var periodEnd: String
    /// Reference to the parent goal: a server id or a `local:<uuid>` placeholder.
    public var parentGoalId: String?
    public var status: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        localId: String = UUID().uuidString, serverId: String? = nil, title: String,
        notes: String? = nil, horizon: String, periodStart: String, periodEnd: String,
        parentGoalId: String? = nil, status: String = "active", createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.localId = localId
        self.serverId = serverId
        self.title = title
        self.notes = notes
        self.horizon = horizon
        self.periodStart = periodStart
        self.periodEnd = periodEnd
        self.parentGoalId = parentGoalId
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(dto: GoalDTO, localId: String) {
        self.init(
            localId: localId, serverId: dto.id, title: dto.title, notes: dto.notes,
            horizon: dto.horizon, periodStart: dto.periodStart, periodEnd: dto.periodEnd,
            parentGoalId: dto.parentGoalId, status: dto.status, createdAt: dto.createdAt,
            updatedAt: dto.updatedAt
        )
    }

    public func wireBody(_ db: Database) throws -> [String: JSONValue] {
        [
            "title": .string(title), "notes": Wire.string(notes), "horizon": .string(horizon),
            "periodStart": .string(periodStart), "periodEnd": .string(periodEnd),
            "parentGoalId": Wire.string(parentGoalId), "status": .string(status),
        ]
    }
}
