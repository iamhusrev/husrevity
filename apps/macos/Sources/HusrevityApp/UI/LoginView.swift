import HusrevityCore
import SwiftUI

struct LoginView: View {
    @ObservedObject var viewModel: LoginViewModel
    /// True when the user was signed in before and the server rejected the session.
    var isSessionExpired = false
    @FocusState private var focus: Field?

    private enum Field { case email, password, url }

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "checkmark.circle.badge.questionmark")
                .font(.system(size: 44))
                .foregroundStyle(.tint)
            Text(L10n.Login.title).font(.largeTitle.bold())
            Text(isSessionExpired ? L10n.Sync.sessionExpired : L10n.Login.subtitle)
                .foregroundStyle(.secondary)

            Form {
                TextField(L10n.Login.email, text: $viewModel.email)
                    .textContentType(.username)
                    .focused($focus, equals: .email)
                    .onSubmit { focus = .password }
                SecureField(L10n.Login.password, text: $viewModel.password)
                    .textContentType(.password)
                    .focused($focus, equals: .password)
                    .onSubmit(submit)
                Picker(L10n.Login.server, selection: $viewModel.server) {
                    ForEach(ServerChoice.allCases) { Text($0.label).tag($0) }
                }
                if viewModel.server == .custom {
                    TextField(L10n.Login.customPlaceholder, text: $viewModel.customURL)
                        .focused($focus, equals: .url)
                        .onSubmit(submit)
                }
            }
            .formStyle(.grouped)
            .scrollDisabled(true)
            .frame(maxWidth: 380, maxHeight: 230)

            if let message = viewModel.errorMessage {
                Text(message).font(.callout).foregroundStyle(.red).multilineTextAlignment(.center).frame(maxWidth: 380)
            }

            Button(action: submit) {
                HStack {
                    if viewModel.isSubmitting { ProgressView().controlSize(.small) }
                    Text(viewModel.isSubmitting ? L10n.Login.signingIn : L10n.Login.signIn)
                }
                .frame(maxWidth: 240)
            }
            .keyboardShortcut(.defaultAction)
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(viewModel.isSubmitting)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { focus = .email }
    }

    private func submit() { Task { await viewModel.submit() } }
}
