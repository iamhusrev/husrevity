import Combine
import Foundation
import HusrevityStore

/// The "Gelen Kutusu" screen: open items with no date, plus the quick-add field.
@MainActor
public final class InboxViewModel: ObservableObject {
    @Published public private(set) var items: [ItemRecord] = []
    @Published public private(set) var isLoaded = false
    @Published public private(set) var errorMessage: String?
    public let quickAdd: QuickAddViewModel

    private let store: LocalStore
    private let notifyLocalChange: LocalChangeNotifier
    private let bag = ObservationBag()

    public init(
        store: LocalStore, parser: QuickAddParsing, context: DateContext = DateContext(),
        notifyLocalChange: @escaping LocalChangeNotifier
    ) {
        self.store = store
        self.notifyLocalChange = notifyLocalChange
        self.quickAdd = QuickAddViewModel(
            store: store, parser: parser, context: context, notifyLocalChange: notifyLocalChange)
    }

    public var isEmpty: Bool { items.isEmpty }

    public func start() {
        guard !bag.has("inbox") else { return }
        bag.observe("inbox", store.observeInboxItems()) { [weak self] items in
            self?.items = items
            self?.isLoaded = true
        }
    }

    public func complete(_ item: ItemRecord) {
        perform { try store.completeItem(localId: item.localId) }
    }

    public func delete(_ item: ItemRecord) {
        perform { try store.delete(ItemRecord.self, localId: item.localId) }
    }

    /// Gives the item a date, which moves it out of the inbox onto the calendar and Today.
    public func schedule(_ item: ItemRecord, at date: Date) {
        perform { try store.update(ItemRecord.self, localId: item.localId) { $0.scheduledAt = date } }
    }

    public func rename(_ item: ItemRecord, to title: String) {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean != item.title else { return }
        perform { try store.update(ItemRecord.self, localId: item.localId) { $0.title = clean } }
    }

    public func dismissError() { errorMessage = nil }

    private func perform(_ write: () throws -> some Any) {
        do {
            _ = try write()
            errorMessage = nil
            notifyLocalChange()
        } catch {
            errorMessage = L10n.Common.saveFailed(TodayViewModel.describe(error))
        }
    }
}
