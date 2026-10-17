import Foundation
import GRDB
import HusrevityModels

/// Shared shape of every locally stored entity.
///
/// Columns are the snake_case of the property names; dates are stored as epoch milliseconds.
/// `updatedAt` always mirrors the last version the server sent (local edits never bump it), so it
/// is the right value for `If-Match`.
public protocol SyncedRecord: Codable, FetchableRecord, PersistableRecord, Sendable, Identifiable, Equatable {
    static var entity: SyncEntity { get }
    var localId: String { get set }
    var serverId: String? { get set }
    var updatedAt: Date { get set }
    /// Body fields for the API write endpoints (camelCase wire names, explicit nulls).
    func wireBody(_ db: Database) throws -> [String: JSONValue]
    /// Loads one visible row (including associations such as a note's tag ids).
    static func load(_ db: Database, localId: String) throws -> Self?
    /// Saves the row and its associations.
    func persist(_ db: Database) throws
}

extension SyncedRecord {
    public var id: String { localId }

    public static func load(_ db: Database, localId: String) throws -> Self? {
        try fetchOne(
            db, sql: "SELECT * FROM \(entity.table) WHERE local_id = ? AND deleted_locally = 0",
            arguments: [localId]
        )
    }

    public func persist(_ db: Database) throws { try save(db) }

    /// What other rows and outbox payloads store to point at this row.
    public var reference: String { serverId ?? LocalReference.make(localId: localId) }

    public static var databaseTableName: String { entity.table }
    public static var databaseColumnEncodingStrategy: DatabaseColumnEncodingStrategy { .convertToSnakeCase }
    public static var databaseColumnDecodingStrategy: DatabaseColumnDecodingStrategy { .convertFromSnakeCase }
    public static func databaseDateEncodingStrategy(for column: String) -> DatabaseDateEncodingStrategy {
        .custom { Int64(($0.timeIntervalSince1970 * 1000).rounded()) }
    }
    public static func databaseDateDecodingStrategy(for column: String) -> DatabaseDateDecodingStrategy {
        .millisecondsSince1970
    }
}

// MARK: - Wire helpers

enum Wire {
    nonisolated(unsafe) static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func string(_ v: String?) -> JSONValue { v.map(JSONValue.string) ?? .null }
    static func int(_ v: Int?) -> JSONValue { v.map { .number(Double($0)) } ?? .null }
    static func date(_ v: Date?) -> JSONValue { v.map { .string(iso.string(from: $0)) } ?? .null }
    static func parseDate(_ raw: String) -> Date? { iso.date(from: raw) }
}
