import HusrevityCore
import SwiftUI

/// The menu bar icon with today's open count next to it. Use as the `label` of a `MenuBarExtra`.
struct MenuBarLabelView: View {
    @ObservedObject var model: MenuBarModel

    var body: some View {
        let count = model.snapshot.openTodayCount
        if count > 0 {
            Label("\(count)", systemImage: "checklist")
        } else {
            Image(systemName: "checklist")
        }
    }
}

/// Content of the menu bar window: today's count, the next three items, a quick-add field and the
/// open / quit buttons.
///
/// ```swift
/// MenuBarExtra {
///     MenuBarContentView(model: menuBar, timeZone: istanbul, openApp: { ... }, quit: { NSApp.terminate(nil) })
/// } label: { MenuBarLabelView(model: menuBar) }
/// .menuBarExtraStyle(.window)
/// ```
struct MenuBarContentView: View {
    @ObservedObject var model: MenuBarModel
    @ObservedObject private var quickAdd: QuickAddController
    var timeZone: TimeZone
    var openApp: () -> Void
    var quit: () -> Void
    @FocusState private var fieldFocused: Bool

    init(
        model: MenuBarModel, timeZone: TimeZone = TimeZone(identifier: "Europe/Istanbul") ?? .current,
        openApp: @escaping () -> Void, quit: @escaping () -> Void
    ) {
        self.model = model
        self.quickAdd = model.quickAdd
        self.timeZone = timeZone
        self.openApp = openApp
        self.quit = quit
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            upcomingList
            Divider()
            quickAddField
            Divider()
            HStack {
                Button("Husrevity'yi Aç", action: openApp)
                Spacer()
                Button("Çık", action: quit)
            }
        }
        .padding(14)
        .frame(width: 320)
        .onAppear {
            model.reload()
            quickAdd.show()
            fieldFocused = true
        }
    }

    private var header: some View {
        let count = model.snapshot.openTodayCount
        return HStack {
            Text("Bugün").font(.headline)
            Spacer()
            Text(count == 0 ? "Açık iş yok" : "\(count) açık")
                .font(.subheadline).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var upcomingList: some View {
        if model.snapshot.upcoming.isEmpty {
            Text("Yaklaşan bir şey yok").font(.subheadline).foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(model.snapshot.upcoming) { entry in
                    HStack(alignment: .firstTextBaseline) {
                        Text(label(for: entry.at))
                            .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                            .frame(width: 96, alignment: .leading)
                        Text(entry.title).lineLimit(1)
                    }
                }
            }
        }
    }

    private var quickAddField: some View {
        TextField("Hızlı ekle: yarın 10'da toplantı", text: $quickAdd.flow.text)
            .textFieldStyle(.roundedBorder)
            .focused($fieldFocused)
            .disabled(quickAdd.flow.phase == .submitting)
            .onSubmit {
                quickAdd.submit()
                quickAdd.show()  // the field stays open in the menu bar window
            }
    }

    private func label(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "tr_TR")
        formatter.timeZone = timeZone
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        formatter.dateFormat = calendar.isDate(date, inSameDayAs: Date()) ? "HH:mm" : "d MMM HH:mm"
        return formatter.string(from: date)
    }
}
