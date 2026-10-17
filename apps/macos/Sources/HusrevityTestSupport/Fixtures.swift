import Foundation

/// Access to the captured API responses in `Fixtures/*.json`.
public enum Fixtures {
    public enum FixtureError: Error { case missing(String) }

    public static func data(_ name: String) throws -> Data {
        guard
            let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
        else { throw FixtureError.missing(name) }
        return try Data(contentsOf: url)
    }
}
