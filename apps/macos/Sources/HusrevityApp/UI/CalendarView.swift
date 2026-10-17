import HusrevityCore
import SwiftUI

struct CalendarView: View {
    @ObservedObject var viewModel: CalendarViewModel

    var body: some View {
        VStack(spacing: 0) {
            ErrorBanner(message: viewModel.errorMessage, onDismiss: viewModel.dismissError)
            header
            Divider()
            HSplitView {
                grid.frame(minWidth: 460)
                dayDetail.frame(minWidth: 240, idealWidth: 280)
            }
        }
        .navigationTitle(L10n.Calendar.title)
        .task { viewModel.start() }
    }

    private var header: some View {
        HStack {
            Text(viewModel.title).font(.title2.bold())
            Spacer()
            Picker("", selection: Binding(get: { viewModel.mode }, set: { viewModel.setMode($0) })) {
                Text(L10n.Calendar.week).tag(CalendarMode.week)
                Text(L10n.Calendar.month).tag(CalendarMode.month)
            }
            .pickerStyle(.segmented)
            .frame(width: 160)
            .labelsHidden()
            Button { viewModel.previous() } label: { Image(systemName: "chevron.left") }
                .help(L10n.Calendar.previous)
            Button(L10n.Calendar.goToday) { viewModel.goToday() }
            Button { viewModel.next() } label: { Image(systemName: "chevron.right") }
                .help(L10n.Calendar.next)
        }
        .padding(12)
    }

    private var grid: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 1), count: 7)
        return ScrollView {
            LazyVGrid(columns: columns, spacing: 1) {
                ForEach(viewModel.days) { day in
                    DayCell(
                        day: day, isSelected: viewModel.selectedDay?.dayKey == day.dayKey,
                        isMonth: viewModel.mode == .month, label: viewModel.timeLabel
                    )
                    .onTapGesture { viewModel.select(dayKey: day.dayKey) }
                }
            }
            .padding(1)
            .background(.quaternary)
        }
    }

    @ViewBuilder
    private var dayDetail: some View {
        if let day = viewModel.selectedDay {
            VStack(alignment: .leading, spacing: 0) {
                Text("\(day.dayNumber) \(day.weekdayLabel)").font(.headline).padding(12)
                if day.entries.isEmpty {
                    EmptyStateView(title: L10n.Calendar.emptyDay, systemImage: "calendar")
                } else {
                    List(day.entries) { entry in
                        EntryRow(
                            entry: entry, time: viewModel.timeLabel(entry),
                            onToggle: { viewModel.complete(entry) }, canToggle: entry.status == .open)
                    }
                }
            }
        }
    }
}

private struct DayCell: View {
    let day: CalendarDay
    let isSelected: Bool
    let isMonth: Bool
    let label: (ScheduleEntry) -> String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                if !isMonth { Text(day.weekdayLabel).font(.caption).foregroundStyle(.secondary) }
                Spacer()
                Text("\(day.dayNumber)")
                    .font(.callout.weight(day.isToday ? .bold : .regular))
                    .padding(4)
                    .background(day.isToday ? Color.accentColor : .clear, in: Circle())
                    .foregroundStyle(day.isToday ? Color.white : (day.isInDisplayedMonth ? .primary : .secondary))
            }
            ForEach(day.entries.prefix(isMonth ? 3 : 8)) { entry in
                Text([label(entry), entry.title].compactMap { $0 }.joined(separator: " "))
                    .font(.caption2)
                    .lineLimit(1)
                    .strikethrough(entry.status != .open)
                    .foregroundStyle(entry.status == .open ? .primary : .secondary)
            }
            if isMonth, day.entries.count > 3 {
                Text("+\(day.entries.count - 3)").font(.caption2).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(4)
        .frame(minHeight: isMonth ? 84 : 320, alignment: .topLeading)
        .background(isSelected ? Color.accentColor.opacity(0.14) : Color(nsColor: .textBackgroundColor))
        .opacity(day.isInDisplayedMonth ? 1 : 0.6)
        .contentShape(Rectangle())
    }
}
