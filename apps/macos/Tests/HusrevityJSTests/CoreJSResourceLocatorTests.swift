import XCTest
@testable import HusrevityJS

final class CoreJSResourceLocatorTests: XCTestCase {
    private let appResources = URL(fileURLWithPath: "/App/Husrevity.app/Contents/Resources", isDirectory: true)
    private let execDir = URL(fileURLWithPath: "/App/Husrevity.app/Contents/MacOS", isDirectory: true)

    private func script(in base: URL) -> URL {
        base.appendingPathComponent("Husrevity_HusrevityJS.bundle/Resources/husrevity-core.js")
    }

    func testBundleNameMatchesWhatSwiftPMGenerates() {
        XCTAssertEqual(CoreJSResourceLocator.bundleName, "Husrevity_HusrevityJS.bundle")
    }

    func testPicksTheFirstCandidateThatContainsTheScript() throws {
        let existing: Set<URL> = [script(in: appResources), script(in: execDir)]
        let found = try CoreJSResourceLocator.locate(in: [appResources, execDir]) { existing.contains($0) }
        XCTAssertEqual(found, script(in: appResources))
    }

    func testSkipsCandidatesWithoutTheScript() throws {
        let existing: Set<URL> = [script(in: execDir)]
        let found = try CoreJSResourceLocator.locate(in: [appResources, execDir]) { existing.contains($0) }
        XCTAssertEqual(found, script(in: execDir))
    }

    func testIgnoresNilAndDuplicateCandidates() throws {
        let existing: Set<URL> = [script(in: execDir)]
        let found = try CoreJSResourceLocator.locate(in: [nil, appResources, appResources, execDir]) { existing.contains($0) }
        XCTAssertEqual(found, script(in: execDir))
    }

    func testThrowsBundleNotFoundListingEverythingSearched() {
        XCTAssertThrowsError(try CoreJSResourceLocator.locate(in: [appResources, execDir]) { _ in false }) { error in
            guard case CoreJSError.bundleNotFound(let searched)? = error as? CoreJSError else {
                return XCTFail("unexpected \(error)")
            }
            XCTAssertEqual(searched, [script(in: appResources).path, script(in: execDir).path])
            XCTAssertTrue("\(error)".contains("Contents/Resources"))
        }
    }

    func testDefaultCandidatesStartWithTheAppResourcesDirectory() {
        let candidates = CoreJSResourceLocator.defaultCandidates()
        XCTAssertEqual(candidates.first ?? nil, Bundle.main.resourceURL)
    }
}
