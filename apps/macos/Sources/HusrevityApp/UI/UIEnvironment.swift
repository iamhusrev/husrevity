import HusrevityCore
import SwiftUI

/// The single entry point the composition root uses to get the whole UI.
///
///     let environment = UIEnvironment(dependencies: UIDependencies(...))
///     WindowGroup { environment.rootView }
///
/// It owns every view model (`viewModels`); the menu bar or other scenes can read from the same
/// instances, e.g. `environment.viewModels.today.sections`.
@MainActor
final class UIEnvironment: ObservableObject {
    let viewModels: AppViewModels

    init(dependencies: UIDependencies) {
        self.viewModels = AppViewModels(dependencies: dependencies)
    }

    /// The main window content: login gate, sidebar navigation and screens.
    var rootView: some View { RootView(app: viewModels) }

    /// Opens a section programmatically (menu bar item, notification tap, "Add" shortcut).
    func open(_ section: AppSection) { viewModels.selection = section }
}
