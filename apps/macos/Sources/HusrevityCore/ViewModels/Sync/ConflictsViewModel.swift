import Combine
import Foundation
import HusrevityModels
import HusrevityStore

public struct ConflictField: Equatable, Sendable {
    public var name: String
    public var yours: String
    public var server: String
}

public struct ConflictRow: Identifiable, Equatable {
    public var id: Int64
    public var entity: SyncEntity
    public var entityLabel: String
    public var opLabel: String
    public var title: String
    public var fields: [ConflictField]
    public var createdAt: Date
}

public struct FailedRow: Identifiable, Equatable {
    public var id: Int64
    public var entityLabel: String
    public var opLabel: String
    public var title: String
    public var error: String
    public var attempts: Int
}

/// The conflict banner and its list: choose "yeniden uygula" (keep my change) or "at" (take the
/// server version) per conflict, and see changes the server permanently refused.
@MainActor
public final class ConflictsViewModel: ObservableObject {
    public typealias Resolve = (_ id: Int64, _ keepLocal: Bool) async throws -> Void

    @Published public private(set) var conflicts: [ConflictRow] = []
    @Published public private(set) var failed: [FailedRow] = []
    @Published public private(set) var isLoaded = false
    @Published public private(set) var isResolving = false
    @Published public private(set) var errorMessage: String?

    private let store: LocalStore
    private let context: DateContext
    private let resolveAction: Resolve
    private let notifyLocalChange: LocalChangeNotifier
    private let bag = ObservationBag()

    public init(
        store: LocalStore, context: DateContext = DateContext(), resolve: @escaping Resolve,
        notifyLocalChange: @escaping LocalChangeNotifier
    ) {
        self.store = store
        self.context = context
        self.resolveAction = resolve
        self.notifyLocalChange = notifyLocalChange
    }

    /// Everything that needs the user's attention.
    public var count: Int { conflicts.count + failed.count }

    public var bannerText: String? {
        conflicts.isEmpty ? nil : L10n.Conflicts.bannerCount(conflicts.count)
    }

    public func start() {
        guard !bag.has("conflicts") else { return }
        bag.observe("conflicts", store.observeUnresolvedConflictCount()) { [weak self] _ in self?.reload() }
        bag.observe("outbox", store.observeOutboxCount()) { [weak self] _ in self?.reload() }
    }

    public func resolve(_ row: ConflictRow, keepLocal: Bool) async {
        guard !isResolving else { return }
        isResolving = true
        defer { isResolving = false }
        do {
            try await resolveAction(row.id, keepLocal)
            errorMessage = nil
        } catch {
            errorMessage = L10n.Conflicts.resolveFailed(TodayViewModel.describe(error))
        }
        reload()
    }

    public func retry(_ row: FailedRow) {
        do {
            try store.requeue(row.id)
            errorMessage = nil
            notifyLocalChange()
        } catch {
            errorMessage = L10n.Conflicts.resolveFailed(TodayViewModel.describe(error))
        }
        reload()
    }

    /// Drops the failed entry and every later queued change of the same row (the Store decides
    /// the details); the row falls back to the server version on the next pull.
    public func discard(_ row: FailedRow) {
        do {
            try store.discardOutboxEntry(id: row.id)
            errorMessage = nil
            notifyLocalChange()
        } catch {
            errorMessage = L10n.Conflicts.resolveFailed(TodayViewModel.describe(error))
        }
        reload()
    }

    public func dismissError() { errorMessage = nil }

    // MARK: Internals

    private func reload() {
        do {
            let records = try store.unresolvedConflicts()
            let conflicted = Set(records.map { "\($0.entity.rawValue)|\($0.localId)" })
            conflicts = records.map(makeRow)
            failed = try store.failedOutbox()
                .filter { !conflicted.contains("\($0.entity.rawValue)|\($0.localId)") }
                .map(makeRow)
        } catch {
            errorMessage = L10n.Common.loadFailed
        }
        isLoaded = true
    }

    private func makeRow(_ conflict: ConflictRecord) -> ConflictRow {
        let local = Self.object(conflict.localPayload)
        let server = Self.object(conflict.serverPayload)
        let fields = local.keys.sorted(by: Self.fieldOrder).map { key in
            ConflictField(
                name: L10n.Fields.label(key), yours: display(local[key] ?? .null),
                server: display(server[key] ?? .null))
        }
        let entity = L10n.Conflicts.entityLabel(conflict.entity.rawValue)
        return ConflictRow(
            id: conflict.id, entity: conflict.entity, entityLabel: entity,
            opLabel: L10n.Conflicts.opLabel(conflict.op.rawValue),
            title: Self.title(of: server) ?? Self.title(of: local) ?? entity, fields: fields,
            createdAt: conflict.createdAt)
    }

    private func makeRow(_ entry: OutboxEntry) -> FailedRow {
        let entity = L10n.Conflicts.entityLabel(entry.entity.rawValue)
        return FailedRow(
            id: entry.id, entityLabel: entity, opLabel: L10n.Conflicts.opLabel(entry.op.rawValue),
            title: Self.title(of: Self.object(entry.payload)) ?? entity,
            error: entry.lastError ?? L10n.Conflicts.unknownError, attempts: entry.attempts)
    }

    private static func object(_ value: JSONValue) -> [String: JSONValue] {
        if case .object(let o) = value { return o }
        return [:]
    }

    private static func title(of object: [String: JSONValue]) -> String? {
        for key in ["title", "name"] {
            if case .string(let s)? = object[key], !s.isEmpty { return s }
        }
        return nil
    }

    private static func fieldOrder(_ a: String, _ b: String) -> Bool {
        let order = L10n.Fields.order
        switch (order.firstIndex(of: a), order.firstIndex(of: b)) {
        case let (i?, j?): return i < j
        case (_?, nil): return true
        case (nil, _?): return false
        case (nil, nil): return a < b
        }
    }

    private func display(_ value: JSONValue) -> String {
        switch value {
        case .null: return L10n.Fields.empty
        case .bool(let b): return b ? L10n.Fields.yes : L10n.Fields.no
        case .number(let n): return n == n.rounded() ? String(Int(n)) : String(n)
        case .string(let s):
            if s.isEmpty { return L10n.Fields.empty }
            if s.count >= 20, let date = DateContext.parseISO(s) { return context.dateTimeLabel(date) }
            return s
        case .array(let items): return items.isEmpty ? L10n.Fields.empty : items.map(display).joined(separator: ", ")
        case .object: return "…"
        }
    }
}
