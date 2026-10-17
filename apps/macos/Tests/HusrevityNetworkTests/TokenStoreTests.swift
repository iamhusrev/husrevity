import XCTest

@testable import HusrevityNetwork

final class TokenStoreTests: XCTestCase {
    func testInMemoryStoreRoundTrip() async throws {
        let store = InMemoryTokenStore()
        let initial = await store.load()
        XCTAssertNil(initial)

        try await store.save(TokenPair(accessToken: "a", refreshToken: "r"))
        let saved = await store.load()
        XCTAssertEqual(saved, TokenPair(accessToken: "a", refreshToken: "r"))

        try await store.save(TokenPair(accessToken: "a2", refreshToken: "r2"))
        let replaced = await store.load()
        XCTAssertEqual(replaced?.accessToken, "a2")

        await store.clear()
        let cleared = await store.load()
        XCTAssertNil(cleared)
    }

    // MARK: Keychain (opt-in: touches the real login keychain)

    private func keychainEnabled() throws {
        try XCTSkipUnless(
            ProcessInfo.processInfo.environment["HUSREVITY_KEYCHAIN_TESTS"] == "1",
            "Set HUSREVITY_KEYCHAIN_TESTS=1 to run tests against the real keychain"
        )
    }

    func testKeychainDefaultServiceName() {
        XCTAssertEqual(KeychainTokenStore.defaultService, "com.husrevity.mac")
    }

    func testKeychainStoreRoundTripPersistsAcrossInstances() async throws {
        try keychainEnabled()
        let service = "com.husrevity.mac.tests.\(UUID().uuidString)"
        let store = KeychainTokenStore(service: service)
        addTeardownBlock { await KeychainTokenStore(service: service).clear() }

        let empty = await store.load()
        XCTAssertNil(empty)

        try await store.save(TokenPair(accessToken: "access-1", refreshToken: "refresh-1"))
        let other = KeychainTokenStore(service: service)
        let loaded = await other.load()
        XCTAssertEqual(loaded, TokenPair(accessToken: "access-1", refreshToken: "refresh-1"))

        // Saving again must update in place, not fail with a duplicate-item error.
        try await store.save(TokenPair(accessToken: "access-2", refreshToken: "refresh-2"))
        let updated = await other.load()
        XCTAssertEqual(updated, TokenPair(accessToken: "access-2", refreshToken: "refresh-2"))

        await store.clear()
        let cleared = await other.load()
        XCTAssertNil(cleared)

        // Clearing an already empty store is not an error.
        await store.clear()
    }
}
