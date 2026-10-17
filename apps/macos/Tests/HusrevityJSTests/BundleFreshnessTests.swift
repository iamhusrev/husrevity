import CryptoKit
import XCTest

/// Cheap staleness guard: scripts/core-js.inputs.sha256 (written by build-core-js.sh) records the
/// hashes of every TypeScript input of the bundle. If any input changed without rebuilding, this fails.
final class BundleFreshnessTests: XCTestCase {
    func testBundleInputsHaveNotChangedSinceTheLastBuild() throws {
        // .../apps/macos/Tests/HusrevityJSTests/BundleFreshnessTests.swift -> repo root is 5 levels up.
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let fm = FileManager.default
        let manifest = root.appendingPathComponent("apps/macos/scripts/core-js.inputs.sha256")
        let parserDir = root.appendingPathComponent("packages/parser/src")
        guard fm.fileExists(atPath: parserDir.path), fm.fileExists(atPath: root.appendingPathComponent("apps/api/src/item").path)
        else { throw XCTSkip("repository layout not found at \(root.path); staleness guard skipped") }

        XCTAssertTrue(fm.fileExists(atPath: manifest.path), "scripts/core-js.inputs.sha256 is missing; run apps/macos/scripts/build-core-js.sh")
        let lines = try String(contentsOf: manifest, encoding: .utf8).split(separator: "\n").map(String.init)
        var recorded: [String: String] = [:]
        for line in lines {
            let parts = line.components(separatedBy: "  ")
            XCTAssertEqual(parts.count, 2, "malformed manifest line: \(line)")
            if parts.count == 2 { recorded[parts[1]] = parts[0] }
        }

        let hint = "husrevity-core.js is stale: rerun apps/macos/scripts/build-core-js.sh and commit the result"

        // A new or removed parser source file also makes the bundle stale.
        let parserFiles = try fm.contentsOfDirectory(atPath: parserDir.path)
            .filter { $0.hasSuffix(".ts") && !$0.hasSuffix(".spec.ts") }
            .map { "packages/parser/src/\($0)" }
        XCTAssertEqual(Set(parserFiles), Set(recorded.keys.filter { $0.hasPrefix("packages/parser/src/") }), hint)

        for (path, expected) in recorded {
            let data = try Data(contentsOf: root.appendingPathComponent(path))
            let actual = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            XCTAssertEqual(actual, expected, "\(path) changed. \(hint)")
        }
    }
}
