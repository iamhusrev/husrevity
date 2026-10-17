/// How this install uses a server. Chosen on first launch and changeable in Settings.
public enum SyncMode: String, Equatable, Sendable, CaseIterable {
    /// Nothing chosen yet: the first-run question is showing.
    case undecided
    /// Everything stays on this Mac. No account, no network. Local writes still queue in the
    /// outbox, so turning sync on later uploads all of it.
    case local
    /// Connected to a server: sign in, push the outbox, pull changes.
    case sync
}
