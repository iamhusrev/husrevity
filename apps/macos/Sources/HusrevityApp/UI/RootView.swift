import HusrevityCore
import SwiftUI

/// Login gate + the main window.
struct RootView: View {
    @ObservedObject var app: AppViewModels

    var body: some View {
        Group {
            if app.showsModeChoice {
                ModeChoiceView(app: app)
            } else if app.showsLogin {
                LoginView(viewModel: app.login, isSessionExpired: app.isSessionExpired)
            } else {
                MainView(app: app)
            }
        }
        .frame(minWidth: 900, minHeight: 560)
        .task { app.start() }
    }
}

/// Sidebar + detail with the sync indicator in the toolbar and the conflict banner on top.
struct MainView: View {
    @ObservedObject var app: AppViewModels
    @State private var showsConflicts = false

    var body: some View {
        NavigationSplitView {
            SidebarView(app: app)
                .navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 280)
        } detail: {
            VStack(spacing: 0) {
                ConflictBanner(viewModel: app.conflicts) { showsConflicts = true }
                detail
            }
            .toolbar {
                if app.syncMode == .sync {
                    ToolbarItem(placement: .primaryAction) {
                        SyncIndicatorView(viewModel: app.syncStatus, onShowConflicts: { showsConflicts = true })
                    }
                }
            }
        }
        .sheet(isPresented: $showsConflicts) { ConflictsView(viewModel: app.conflicts) }
        .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in app.refreshDay() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            app.refreshDay()
        }
    }

    @ViewBuilder
    private var detail: some View {
        switch app.selection {
        case .today: TodayView(viewModel: app.today)
        case .inbox: InboxView(viewModel: app.inbox)
        case .calendar: CalendarView(viewModel: app.calendar)
        case .projects: ProjectsView(viewModel: app.projects)
        case .notes: NotesView(viewModel: app.notes)
        case .goals: GoalsView(viewModel: app.goals)
        case .settings: SettingsView(viewModel: app.settings, app: app)
        }
    }
}

struct SidebarView: View {
    @ObservedObject var app: AppViewModels

    var body: some View {
        List(selection: selection) {
            Section {
                ForEach(AppSection.mainSections) { section in
                    row(section)
                }
            }
            if app.settings.canOpenInWeb {
                Section(L10n.Settings.webOnlyTitle) {
                    ForEach(app.settings.webLinks) { link in
                        Link(destination: link.url) {
                            Label(link.title, systemImage: link.module.iconName)
                        }
                        .help(L10n.Common.openInWeb)
                    }
                }
            }
            Section {
                row(.settings)
            }
        }
        .listStyle(.sidebar)
    }

    private var selection: Binding<AppSection?> {
        Binding(get: { app.selection }, set: { if let value = $0 { app.selection = value } })
    }

    private func row(_ section: AppSection) -> some View {
        Label(section.title, systemImage: section.iconName)
            .badge(app.badge(for: section) ?? 0)
            .tag(section)
    }
}
