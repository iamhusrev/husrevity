import Foundation

extension ISO8601DateFormatter {
    /// `2026-10-17T20:59:25.134Z`: the exact format the API emits (`Date#toISOString`).
    static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}

extension Date {
    /// Epoch milliseconds: what the server compares an `If-Match` header against (`updatedAt.getTime()`).
    public var epochMilliseconds: Int64 {
        Int64((timeIntervalSince1970 * 1000).rounded())
    }
}

/// JSON coding shared by the API client and the local store.
public enum APICoding {
    public static var decoder: JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = ISO8601DateFormatter.fractional.date(from: raw)
                ?? ISO8601DateFormatter.plain.date(from: raw)
            {
                return date
            }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Not an ISO-8601 date: \(raw)")
            )
        }
        return d
    }

    public static var encoder: JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601DateFormatter.fractional.string(from: date))
        }
        e.outputFormatting = [.sortedKeys]
        return e
    }
}
