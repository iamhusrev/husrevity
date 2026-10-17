import HusrevityCore
import SwiftUI

struct SettingsView: View {
    @ObservedObject var viewModel: SettingsViewModel
    @ObservedObject var app: AppViewModels
    @State private var confirmsSignOut = false
    @Environment(\.openURL) private var openURL

    private var syncEnabled: Binding<Bool> {
        Binding(
            get: { app.syncMode == .sync },
            set: { on in Task { if on { await app.useSyncMode() } else { await app.useLocalMode() } } })
    }

    var body: some View {
        Form {
            Section(L10n.Settings.sync) {
                Toggle(L10n.Settings.syncToggle, isOn: syncEnabled)
                Text(L10n.Settings.syncHint).font(.caption).foregroundStyle(.secondary)
            }

            if app.syncMode == .sync {
                Section(L10n.Settings.account) {
                    if let email = viewModel.userEmail {
                        LabeledContent(L10n.Settings.signedInAs, value: email)
                    }
                    LabeledContent(L10n.Settings.server, value: viewModel.serverDisplay)
                    Button(L10n.Settings.signOut, role: .destructive) { confirmsSignOut = true }
                }
            }

            Section(L10n.Settings.webAddress) {
                TextField("https://", text: $viewModel.webAddressText)
                    .onSubmit { viewModel.saveWebAddress() }
                HStack {
                    Text(L10n.Settings.webAddressHint).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button(L10n.Common.save) { viewModel.saveWebAddress() }
                }
                if let error = viewModel.errorMessage {
                    Text(error).font(.callout).foregroundStyle(.red)
                }
            }

            Section(L10n.Settings.webOnlyTitle) {
                if viewModel.canOpenInWeb {
                    ForEach(viewModel.webLinks) { link in
                        Button {
                            openURL(link.url)
                        } label: {
                            Label("\(link.title) · \(L10n.Common.openInWeb)", systemImage: link.module.iconName)
                        }
                        .buttonStyle(.link)
                    }
                } else {
                    Text(L10n.WebModule.notConfigured).foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(L10n.Settings.title)
        .confirmationDialog(L10n.Settings.signOutConfirm, isPresented: $confirmsSignOut) {
            Button(L10n.Settings.signOut, role: .destructive) { Task { await viewModel.signOut() } }
            Button(L10n.Common.cancel, role: .cancel) {}
        }
    }
}
