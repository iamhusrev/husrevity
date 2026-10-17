import Foundation
import HusrevityModels
import HusrevityNetwork
import HusrevityStore

/// An outbox payload that cannot become a request: a permanent problem with that entry.
struct PayloadError: Error, CustomStringConvertible {
    var description: String
    init(_ description: String) { self.description = description }
}

/// Turns stored outbox payloads (camelCase JSON) into the network layer's request structs.
enum PayloadDecoding {
    // MARK: Placeholders

    /// True when any string in the payload is a `local:<uuid>` placeholder, i.e. it refers to a
    /// row whose create has not been pushed yet.
    static func hasUnresolvedReference(_ value: JSONValue) -> Bool {
        switch value {
        case .string(let s):
            guard let local = LocalReference.localId(from: s) else { return false }
            return UUID(uuidString: local) != nil
        case .array(let a): return a.contains(where: hasUnresolvedReference)
        case .object(let o): return o.values.contains(where: hasUnresolvedReference)
        default: return false
        }
    }

    // MARK: Whole-body requests

    static func note(_ payload: JSONValue) throws -> NoteRequest { try decode(NoteRequest.self, payload) }
    static func noteTag(_ payload: JSONValue) throws -> NoteTagRequest { try decode(NoteTagRequest.self, payload) }
    static func project(_ payload: JSONValue) throws -> ProjectRequest { try decode(ProjectRequest.self, payload) }
    static func goal(_ payload: JSONValue) throws -> GoalRequest { try decode(GoalRequest.self, payload) }
    static func complete(_ payload: JSONValue) throws -> CompleteItemRequest { try decode(CompleteItemRequest.self, payload) }

    static func item(_ payload: JSONValue) throws -> ItemRequest {
        let o = try object(payload)
        guard let kind = try string(o, "kind"), let title = try string(o, "title") else {
            throw PayloadError("item create needs kind and title")
        }
        return ItemRequest(
            kind: kind, title: title, notes: try string(o, "notes"), context: try string(o, "context"),
            projectId: try string(o, "projectId"), goalId: try string(o, "goalId"),
            blockId: try string(o, "blockId"), scheduledAt: try date(o, "scheduledAt"),
            durationMin: try int(o, "durationMin"), dueAt: try date(o, "dueAt"),
            notifyMinutesBefore: try int(o, "notifyMinutesBefore"), rrule: try string(o, "rrule"),
            status: try string(o, "status"), payload: o["payload"].flatMap(nonNull), source: try string(o, "source")
        )
    }

    // MARK: Partial updates (absent = unchanged, null = clear)

    static func itemUpdate(_ payload: JSONValue) throws -> ItemUpdateRequest {
        let o = try object(payload)
        var r = ItemUpdateRequest()
        r.kind = try string(o, "kind")
        r.title = try string(o, "title")
        r.notes = try field(o, "notes", string)
        r.context = try field(o, "context", string)
        r.projectId = try field(o, "projectId", string)
        r.goalId = try field(o, "goalId", string)
        r.blockId = try field(o, "blockId", string)
        r.scheduledAt = try field(o, "scheduledAt", date)
        r.durationMin = try field(o, "durationMin", int)
        r.dueAt = try field(o, "dueAt", date)
        r.notifyMinutesBefore = try field(o, "notifyMinutesBefore", int)
        r.rrule = try field(o, "rrule", string)
        r.status = try string(o, "status")
        r.payload = o["payload"].flatMap(nonNull)
        r.source = try string(o, "source")
        return r
    }

    static func projectUpdate(_ payload: JSONValue) throws -> ProjectUpdateRequest {
        let o = try object(payload)
        var r = ProjectUpdateRequest()
        r.name = try string(o, "name")
        r.description = try field(o, "description", string)
        r.status = try string(o, "status")
        r.startDate = try field(o, "startDate", string)
        r.endDate = try field(o, "endDate", string)
        r.pinned = try bool(o, "pinned")
        r.archived = try bool(o, "archived")
        r.goalId = try field(o, "goalId", string)
        return r
    }

    static func goalUpdate(_ payload: JSONValue) throws -> GoalUpdateRequest {
        let o = try object(payload)
        var r = GoalUpdateRequest()
        r.title = try string(o, "title")
        r.notes = try field(o, "notes", string)
        r.horizon = try string(o, "horizon")
        r.periodStart = try string(o, "periodStart")
        r.periodEnd = try string(o, "periodEnd")
        r.parentGoalId = try field(o, "parentGoalId", string)
        r.status = try string(o, "status")
        return r
    }

    // MARK: Helpers

    private static func decode<T: Decodable>(_ type: T.Type, _ payload: JSONValue) throws -> T {
        do {
            return try APICoding.decoder.decode(T.self, from: JSONEncoder().encode(payload))
        } catch {
            throw PayloadError("cannot read \(T.self) payload: \(error)")
        }
    }

    private static func object(_ value: JSONValue) throws -> [String: JSONValue] {
        guard case .object(let o) = value else { throw PayloadError("payload is not an object") }
        return o
    }

    private static func nonNull(_ v: JSONValue) -> JSONValue? {
        if case .null = v { return nil }
        return v
    }

    private static func field<V>(
        _ o: [String: JSONValue], _ key: String, _ read: ([String: JSONValue], String) throws -> V?
    ) throws -> Field<V> {
        guard let raw = o[key] else { return .absent }
        if case .null = raw { return .null }
        guard let value = try read(o, key) else { return .absent }
        return .value(value)
    }

    private static func string(_ o: [String: JSONValue], _ key: String) throws -> String? {
        switch o[key] {
        case nil, .null?: return nil
        case .string(let s)?: return s
        default: throw PayloadError("\(key) must be a string")
        }
    }

    private static func int(_ o: [String: JSONValue], _ key: String) throws -> Int? {
        switch o[key] {
        case nil, .null?: return nil
        case .number(let n)?: return Int(n)
        default: throw PayloadError("\(key) must be a number")
        }
    }

    private static func bool(_ o: [String: JSONValue], _ key: String) throws -> Bool? {
        switch o[key] {
        case nil, .null?: return nil
        case .bool(let b)?: return b
        default: throw PayloadError("\(key) must be a boolean")
        }
    }

    private static func date(_ o: [String: JSONValue], _ key: String) throws -> Date? {
        guard let raw = try string(o, key) else { return nil }
        do {
            return try APICoding.decoder.decode(Date.self, from: JSONEncoder().encode(JSONValue.string(raw)))
        } catch {
            throw PayloadError("\(key) is not an ISO-8601 date: \(raw)")
        }
    }
}
