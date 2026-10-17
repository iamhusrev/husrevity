/// The `{ success, message, code, data }` wrapper around every API response, errors included
/// (on failure `data` is null and `message` explains why).
public struct Envelope<T: Codable & Equatable & Sendable>: Codable, Equatable, Sendable {
    public var success: Bool
    public var message: String
    public var code: Int
    public var data: T?
}
