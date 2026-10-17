import Foundation
import GRDB
import HusrevityModels

/// Single-record variant of `apply(sync:)`, for server responses outside a pull: the body of a
/// successful push, or the current server version after a 409.
///
/// By default a row with a queued local change is left alone (like in a pull). With
/// `overridingLocalChanges` the server version replaces the row regardless ("server wins"); the
/// local id is kept, and queued entries are untouched.
extension LocalStore {
    public func applyServerRecord(_ dto: GoalDTO, overridingLocalChanges: Bool = false) throws {
        try dbQueue.write { try Self.upsert($0, dto: dto, force: overridingLocalChanges) }
    }

    public func applyServerRecord(_ dto: ProjectDTO, overridingLocalChanges: Bool = false) throws {
        try dbQueue.write { try Self.upsert($0, dto: dto, force: overridingLocalChanges) }
    }

    public func applyServerRecord(_ dto: NoteTagDTO, overridingLocalChanges: Bool = false) throws {
        try dbQueue.write { try Self.upsert($0, dto: dto, force: overridingLocalChanges) }
    }

    public func applyServerRecord(_ dto: ItemDTO, overridingLocalChanges: Bool = false) throws {
        try dbQueue.write { try Self.upsert($0, dto: dto, force: overridingLocalChanges) }
    }

    public func applyServerRecord(_ dto: ItemOccurrenceDTO, overridingLocalChanges: Bool = false) throws {
        try dbQueue.write { try Self.upsert($0, dto: dto, force: overridingLocalChanges) }
    }

    public func applyServerRecord(_ dto: NoteDTO, overridingLocalChanges: Bool = false) throws {
        try dbQueue.write { try Self.upsert($0, dto: dto, force: overridingLocalChanges) }
    }
}
