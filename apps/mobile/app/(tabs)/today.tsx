import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useToday, BlockSummary, TimelineEntry, ItemSummary } from "../../src/hooks/useToday";

export default function TodayScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useToday();

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#c8732e" />
        <Text style={styles.loadingText}>Bugün verileri yükleniyor...</Text>
      </SafeAreaView>
    );
  }

  if (isError && !data) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Veriler yüklenemedi</Text>
        <Text style={styles.errorSubtext}>
          {error?.message || "Bir hata oluştu. Lütfen tekrar deneyin."}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#c8732e"
            colors={["#c8732e"]}
          />
        }
      >
        {/* Date / Title */}
        <View style={styles.header}>
          <Text style={styles.headerDate}>{data?.date || "Bugün"}</Text>
          <Text style={styles.headerTitle}>Günlük Özet</Text>
        </View>

        {/* Suggestion Card */}
        {data?.suggestion ? (
          <View style={styles.suggestionCard}>
            <Text style={styles.suggestionKicker}>AI İPUCU</Text>
            <Text style={styles.suggestionText}>{data.suggestion}</Text>
          </View>
        ) : null}

        {/* Current Block Card */}
        {data?.currentBlock ? (
          <View style={styles.currentBlockCard}>
            <Text style={styles.sectionKicker}>ŞU ANKİ ODAK</Text>
            <Text style={styles.currentBlockTitle}>{data.currentBlock.title}</Text>
            <Text style={styles.currentBlockMeta}>
              {formatTime(data.currentBlock.scheduledAt)}
              {data.currentBlock.durationMin ? ` • ${data.currentBlock.durationMin} dk` : ""}
            </Text>
          </View>
        ) : null}

        {/* Timeline Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Zaman Çizelgesi</Text>
          {data?.timeline && data.timeline.length > 0 ? (
            data.timeline.map((entry: TimelineEntry, idx: number) => (
              <View key={entry.itemId || idx} style={styles.timelineItem}>
                <View style={styles.timelineTimeCol}>
                  <Text style={styles.timelineTime}>{formatTime(entry.scheduledAt)}</Text>
                  {entry.durationMin ? (
                    <Text style={styles.timelineDuration}>{entry.durationMin} dk</Text>
                  ) : null}
                </View>
                <View style={styles.timelineContentCol}>
                  <Text style={styles.itemTitle}>{entry.title}</Text>
                  {entry.kind ? <Text style={styles.itemBadge}>{entry.kind}</Text> : null}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Bugün için planlanmış zaman çizelgesi yok.</Text>
          )}
        </View>

        {/* Due Today Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bugün Teslim</Text>
          {data?.dueToday && data.dueToday.length > 0 ? (
            data.dueToday.map((item: ItemSummary, idx: number) => (
              <View key={item.itemId || idx} style={styles.dueCard}>
                <View style={styles.dueMain}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {item.dueAt ? (
                    <Text style={styles.dueTime}>Son: {formatTime(item.dueAt)}</Text>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    item.status === "done" ? styles.statusCompleted : styles.statusPending,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Bugün teslim edilecek görev yok.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Item statuses come from the API's `items.status` CHECK constraint.
const STATUS_LABELS: Record<string, string> = {
  open: "Açık",
  done: "Tamam",
  cancelled: "İptal",
};

function formatTime(isoString: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoString;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#94a3b8",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f8fafc",
    marginBottom: 6,
  },
  errorSubtext: {
    fontSize: 14,
    color: "#f87171",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#c8732e",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 16,
  },
  headerDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#c8732e",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#f8fafc",
    marginTop: 2,
  },
  suggestionCard: {
    backgroundColor: "#291d18",
    borderColor: "#5c2d13",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  suggestionKicker: {
    fontSize: 11,
    fontWeight: "700",
    color: "#c8732e",
    marginBottom: 4,
  },
  suggestionText: {
    fontSize: 14,
    color: "#fed7aa",
    lineHeight: 20,
  },
  currentBlockCard: {
    backgroundColor: "#1e293b",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  sectionKicker: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  currentBlockTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f8fafc",
  },
  currentBlockMeta: {
    fontSize: 13,
    color: "#cbd5e1",
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f8fafc",
    marginBottom: 12,
  },
  timelineItem: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  timelineTimeCol: {
    width: 65,
    justifyContent: "center",
  },
  timelineTime: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f8fafc",
  },
  timelineDuration: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  timelineContentCol: {
    flex: 1,
    justifyContent: "center",
    paddingLeft: 8,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#f8fafc",
  },
  itemBadge: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  dueCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  dueMain: {
    flex: 1,
    paddingRight: 8,
  },
  dueTime: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPending: {
    backgroundColor: "#334155",
  },
  statusCompleted: {
    backgroundColor: "#166534",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#f8fafc",
  },
  emptyText: {
    fontSize: 14,
    color: "#64748b",
    fontStyle: "italic",
  },
});
