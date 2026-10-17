import Foundation

/// The synced entity kinds. The raw value is the SQLite table name and the value stored in
/// `outbox.entity` / `conflicts.entity`.
public enum SyncEntity: String, Codable, Sendable, CaseIterable {
    case item
    case itemOccurrence = "item_occurrence"
    case note
    case noteTag = "note_tag"
    case project
    case goal

    public var table: String { rawValue }
}

public enum StoreError: Error, Equatable, Sendable {
    case notFound(entity: SyncEntity, localId: String)
    case invalidPayload(String)
    case notImplemented(String)
    /// A field the server treats as immutable (e.g. a project `code` once it has a server id).
    case immutableField(String)
    /// The operation needs the row's queued entries but one of them is being pushed right now.
    case entryInFlight(entity: SyncEntity, localId: String)
}

/// Placeholder prefix for a reference to a row that has no server id yet, e.g. `local:3F2A...`.
/// Rows and outbox payloads hold references as strings; after the referenced row is created on the
/// server, `LocalStore.remapServerId` swaps every placeholder for the real server id.
public enum LocalReference {
    public static let prefix = "local:"

    public static func make(localId: String) -> String { prefix + localId }

    public static func localId(from reference: String) -> String? {
        reference.hasPrefix(prefix) ? String(reference.dropFirst(prefix.count)) : nil
    }
}
