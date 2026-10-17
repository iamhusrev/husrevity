import Combine
import Foundation
import HusrevityModels
import HusrevityStore

/// One token the parser understood, shown as a chip under the quick-add field.
public struct QuickAddChip: Equatable, Identifiable, Sendable {
    public enum Kind: Equatable, Sendable { case time, recurrence, context, project, priority }
    public var kind: Kind
    public var text: String
    public var id: String { "\(kind):\(text)" }
}

/// What the parser made of the text, before or after saving.
public struct QuickAddPreview: Equatable, Sendable {
    public var title: String
    public var scheduledAt: Date?
    public var timeLabel: String?
    public var rrule: String?
    public var recurrenceLabel: String?
    public var context: String?
    public var projectRef: String?
    public var priority: String?
    /// True when the raw text had to be used as the title (parser failure or an empty title).
    public var usedFallback: Bool
    public var chips: [QuickAddChip]
}

/// The quick-add field: live preview while typing, one item per `submit()`.
@MainActor
public final class QuickAddViewModel: ObservableObject {
    @Published public var text = "" {
        didSet { if text != oldValue { updatePreview() } }
    }
    @Published public private(set) var preview: QuickAddPreview?
    /// What was understood in the last saved entry; views flash it as confirmation.
    @Published public private(set) var lastAdded: QuickAddPreview?
    @Published public private(set) var errorMessage: String?

    private let store: LocalStore
    private let parser: QuickAddParsing
    private let context: DateContext
    private let notifyLocalChange: LocalChangeNotifier

    public init(
        store: LocalStore, parser: QuickAddParsing, context: DateContext = DateContext(),
        notifyLocalChange: @escaping LocalChangeNotifier
    ) {
        self.store = store
        self.parser = parser
        self.context = context
        self.notifyLocalChange = notifyLocalChange
    }

    public var canSubmit: Bool { !trimmed.isEmpty }

    /// Creates the item and returns it, or nil (with `errorMessage`) when nothing was saved.
    @discardableResult
    public func submit() -> ItemRecord? {
        guard let parsed = parse() else { return nil }
        let now = context.now()
        do {
            let item = try store.create(
                ItemRecord(
                    kind: "task", title: parsed.preview.title, context: parsed.draft.context,
                    projectId: try resolveProject(parsed.draft.projectRef), scheduledAt: parsed.preview.scheduledAt,
                    rrule: parsed.draft.rrule,
                    payload: parsed.draft.priority.map { .object(["priority": .string($0)]) } ?? .object([:]),
                    source: "macos", createdAt: now, updatedAt: now))
            errorMessage = nil
            text = ""
            lastAdded = parsed.preview
            notifyLocalChange()
            return item
        } catch {
            errorMessage = L10n.Common.saveFailed(TodayViewModel.describe(error))
            return nil
        }
    }

    public func dismissLastAdded() { lastAdded = nil }

    // MARK: Internals

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func updatePreview() {
        preview = parse()?.preview
        if preview != nil { errorMessage = nil }
    }

    private func parse() -> (draft: ParsedDraft, preview: QuickAddPreview)? {
        let raw = trimmed
        guard !raw.isEmpty else { return nil }
        let draft: ParsedDraft
        var fallback = false
        do {
            draft = try parser.parseQuickAdd(raw, now: context.now(), timeZone: context.timeZone)
        } catch {
            return (ParsedDraft(title: raw), makePreview(ParsedDraft(title: raw), fallback: true))
        }
        var adjusted = draft
        if draft.title.trimmingCharacters(in: .whitespaces).isEmpty {
            adjusted.title = raw
            fallback = true
        }
        return (adjusted, makePreview(adjusted, fallback: fallback))
    }

    private func makePreview(_ draft: ParsedDraft, fallback: Bool) -> QuickAddPreview {
        let date = draft.scheduledDate
        let timeLabel = date.map(context.quickTimeLabel)
        let recurrence = draft.rrule.map(RecurrenceDescriber.describe)
        var chips: [QuickAddChip] = []
        if let timeLabel { chips.append(QuickAddChip(kind: .time, text: timeLabel)) }
        if let recurrence { chips.append(QuickAddChip(kind: .recurrence, text: recurrence)) }
        if let c = draft.context { chips.append(QuickAddChip(kind: .context, text: "#\(c)")) }
        if let p = draft.projectRef { chips.append(QuickAddChip(kind: .project, text: "@\(p)")) }
        if let priority = draft.priority { chips.append(QuickAddChip(kind: .priority, text: "!\(priority)")) }
        return QuickAddPreview(
            title: draft.title, scheduledAt: date, timeLabel: timeLabel, rrule: draft.rrule,
            recurrenceLabel: recurrence, context: draft.context, projectRef: draft.projectRef,
            priority: draft.priority, usedFallback: fallback, chips: chips)
    }

    /// Matches `@ref` against project codes, then names, ignoring case and diacritics.
    private func resolveProject(_ ref: String?) throws -> String? {
        guard let ref, !ref.isEmpty else { return nil }
        let projects = try store.projects()
        let match = projects.first { TextMatching.same($0.code, ref) }
            ?? projects.first { TextMatching.same($0.name, ref) }
        return match?.reference
    }
}
