import Foundation
import GRDB
import HusrevityModels

/// `JSONValue` is stored as JSON text. Without this conformance GRDB would route the enum's
/// single-value decoding through SQLite's type coercion (`"{}"` would come back as `false`).
extension JSONValue: DatabaseValueConvertible {
    public var databaseValue: DatabaseValue {
        // Encoding cannot fail: every case is a JSON primitive or container of primitives.
        let data = (try? JSONEncoder.sortedKeys.encode(self)) ?? Data("null".utf8)
        return String(decoding: data, as: UTF8.self).databaseValue
    }

    public static func fromDatabaseValue(_ dbValue: DatabaseValue) -> JSONValue? {
        guard let text = String.fromDatabaseValue(dbValue) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
    }
}

extension JSONEncoder {
    static let sortedKeys: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()
}

extension JSONValue {
    /// Parses JSON text; throws `StoreError.invalidPayload` on malformed input.
    static func parse(_ text: String) throws -> JSONValue {
        do { return try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)) }
        catch { throw StoreError.invalidPayload("not JSON: \(text.prefix(80))") }
    }

    var jsonText: String { (databaseValue.storage.value as? String) ?? "null" }
}
