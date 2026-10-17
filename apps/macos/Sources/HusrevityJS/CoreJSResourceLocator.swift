import Foundation

/// Finds `husrevity-core.js` inside the SwiftPM resource bundle without relying on the generated
/// `Bundle.module` accessor, which cannot see `Contents/Resources` of a signed app.
enum CoreJSResourceLocator {
    static let bundleName = "Husrevity_HusrevityJS.bundle"
    static let relativeScriptPath = "\(bundleName)/Resources/husrevity-core.js"

    /// App layout first (Bundle.main.resourceURL = Contents/Resources), then the SwiftPM
    /// executable layout (Bundle.main.bundleURL = the executable's directory).
    static func defaultCandidates() -> [URL?] {
        [Bundle.main.resourceURL, Bundle.main.bundleURL]
    }

    /// Returns the first `<base>/Husrevity_HusrevityJS.bundle/Resources/husrevity-core.js` that
    /// exists. Nil and duplicate bases are ignored.
    static func locate(
        in candidates: [URL?],
        fileExists: (URL) -> Bool = { FileManager.default.fileExists(atPath: $0.path) }
    ) throws -> URL {
        var searched: [URL] = []
        for base in candidates.compactMap({ $0 }) {
            let script = base.appendingPathComponent(relativeScriptPath)
            if searched.contains(script) { continue }
            searched.append(script)
            if fileExists(script) { return script }
        }
        throw CoreJSError.bundleNotFound(searched: searched.map(\.path))
    }
}
