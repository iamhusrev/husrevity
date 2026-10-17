import Foundation
import GRDB
import HusrevityModels

public enum OutboxOp: String, Codable, Sendable {
    case create, update, delete, complete
}

public enum OutboxState: String, Codable, Sendable {
    /// Waiting to be pushed.
    case pending
    /// Handed to the network layer; recovered to `pending` after a crash.
    case inflight
    /// Needs attention (conflict or permanent error); still protects the row from pulls.
    case failed
}

/// One queued local write.
///
/// `payload` is the API request body as JSON (camelCase wire names). For `update` it holds only the
/// changed fields; for `delete` it is empty; for `complete` it is `{"occursOn": "YYYY-MM-DD"}` when a
/// single occurrence of a recurring item is completed, otherwise empty. Any string value of the
/// form `local:<uuid>` is a reference to a row without a server id yet.
public struct OutboxEntry: Equatable, Sendable, Identifiable, FetchableRecord {
    public var id: Int64
    public var entity: SyncEntity
    public var op: OutboxOp
    public var localId: String
    public var payload: JSONValue
    public var idempotencyKey: String
    /// `updatedAt` (epoch ms) of the server version this change was based on: the `If-Match` value.
    public var baseUpdatedAtMs: Int64?
    public var state: OutboxState
    public var attempts: Int
    public var lastError: String?
    public var createdAt: Date

    public init(row: Row) throws {
        id = row["id"]
        entity = SyncEntity(rawValue: row["entity"]) ?? .item
        op = OutboxOp(rawValue: row["op"]) ?? .update
        localId = row["local_id"]
        payload = (row["payload"] as JSONValue?) ?? .object([:])
        idempotencyKey = row["idempotency_key"]
        baseUpdatedAtMs = row["base_updated_at_ms"]
        state = OutboxState(rawValue: row["state"]) ?? .pending
        attempts = row["attempts"]
        lastError = row["last_error"]
        createdAt = Date(timeIntervalSince1970: Double(row["created_at"] as Int64) / 1000)
    }
}
