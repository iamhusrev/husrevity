import HusrevityCore
import SwiftUI

/// First launch: stay on this Mac, or connect to a server. Shown before any login.
struct ModeChoiceView: View {
    @ObservedObject var app: AppViewModels

    var body: some View {
        VStack(spacing: 28) {
            VStack(spacing: 8) {
                Image(systemName: "checklist").font(.system(size: 44)).foregroundStyle(.tint)
                Text(L10n.Mode.title).font(.largeTitle.bold())
                Text(L10n.Mode.subtitle).font(.title3).foregroundStyle(.secondary)
            }

            HStack(alignment: .top, spacing: 16) {
                choice(
                    icon: "desktopcomputer", title: L10n.Mode.localTitle, detail: L10n.Mode.localDetail,
                    prominent: false
                ) { Task { await app.useLocalMode() } }
                choice(
                    icon: "arrow.triangle.2.circlepath", title: L10n.Mode.syncTitle, detail: L10n.Mode.syncDetail,
                    prominent: true
                ) { Task { await app.useSyncMode() } }
            }

            Text(L10n.Mode.changeLater).font(.footnote).foregroundStyle(.secondary)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func choice(icon: String, title: String, detail: String, prominent: Bool, action: @escaping () -> Void)
        -> some View
    {
        let content = VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon).font(.title)
            Text(title).font(.headline)
            Text(detail).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .frame(width: 260, alignment: .leading)
        .padding(16)

        if prominent {
            Button(action: action) { content }.buttonStyle(.borderedProminent)
        } else {
            Button(action: action) { content }.buttonStyle(.bordered)
        }
    }
}
