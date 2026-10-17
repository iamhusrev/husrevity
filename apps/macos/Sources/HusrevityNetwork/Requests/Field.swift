import Foundation

/// Tri-state value for PATCH/PUT bodies. The server treats an absent key as "leave unchanged" and
/// an explicit `null` as "clear", so `Optional` alone cannot express both.
public enum Field<Value: Encodable & Sendable>: Sendable {
    /// Key omitted from the JSON body.
    case absent
    /// Key sent as `null`.
    case null
    case value(Value)

    /// Convenience: `.value(x)` for non-nil, `.null` for nil.
    public init(_ optional: Value?) {
        self = optional.map { .value($0) } ?? .null
    }
}

extension Field: Equatable where Value: Equatable {}

extension KeyedEncodingContainer {
    /// Writes the key unless the field is `.absent`.
    mutating func encode<V>(_ field: Field<V>, forKey key: Key) throws {
        switch field {
        case .absent: break
        case .null: try encodeNil(forKey: key)
        case .value(let v): try encode(v, forKey: key)
        }
    }
}
