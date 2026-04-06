import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useNetInfo } from "@/hooks/useNetInfo";
import { api } from "@/services/dataService";
import { BrandColors, StatusColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import type { Visit, Incident } from "@/types";
import { VisitStatus } from "@/types";

export default function DashboardScreen() {
  const { theme } = useTheme();
  const { staff } = useAuth();
  const { isOnline } = useNetInfo();

  const [visits, setVisits] = useState<Visit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [v, i] = await Promise.all([
        api.getTodaysVisits(),
        api.getOpenIncidents(),
      ]);
      setVisits(v);
      setIncidents(i);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }, [loadData]);

  const insideCount = visits.filter((v) => v.status === VisitStatus.INSIDE).length;
  const pendingCount = visits.filter((v) => v.status === VisitStatus.PENDING).length;
  const openIncidents = incidents.filter((i) => i.status !== "resolved").length;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={BrandColors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText type="h2">{greeting()}, {staff?.first_name ?? "Guarda"}</ThemedText>
            <ThemedText style={{ color: theme.textSecondary }}>
              {new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}
            </ThemedText>
          </View>
          {!isOnline && (
            <View style={[styles.offlineBadge, { backgroundColor: StatusColors.warning + "20" }]}>
              <Feather name="wifi-off" size={14} color={StatusColors.warning} />
              <ThemedText type="caption" style={{ color: StatusColors.warning }}>Offline</ThemedText>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard icon="users" label="No Interior" value={insideCount} color={BrandColors.primary} theme={theme} />
          <StatCard icon="clock" label="Pendentes" value={pendingCount} color={StatusColors.warning} theme={theme} />
          <StatCard icon="alert-triangle" label="Ocorrências" value={openIncidents} color={StatusColors.danger} theme={theme} />
        </View>

        {/* Recent Visits */}
        <View style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>Últimas Entradas</ThemedText>
          {visits.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.cardBackground }]}>
              <Feather name="inbox" size={32} color={theme.textSecondary} />
              <ThemedText style={{ color: theme.textSecondary }}>Sem entradas hoje</ThemedText>
            </View>
          ) : (
            visits.slice(0, 5).map((visit) => (
              <VisitRow key={visit.id} visit={visit} theme={theme} />
            ))
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function StatCard({ icon, label, value, color, theme }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: number;
  color: string;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: theme.cardBackground, ...Shadows.medium }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <ThemedText type="h2" style={{ color }}>{value}</ThemedText>
      <ThemedText type="caption" style={{ color: theme.textSecondary, textAlign: "center" }}>{label}</ThemedText>
    </View>
  );
}

function VisitRow({ visit, theme }: { visit: Visit; theme: ReturnType<typeof useTheme>["theme"] }) {
  const statusColor: Record<string, string> = {
    PENDENTE: StatusColors.warning,
    AUTORIZADO: StatusColors.success,
    NEGADO: StatusColors.danger,
    "NO INTERIOR": BrandColors.primary,
    SAIU: StatusColors.neutral,
  };
  const color = statusColor[visit.status] ?? StatusColors.neutral;

  return (
    <View style={[styles.visitRow, { backgroundColor: theme.cardBackground }]}>
      <View style={[styles.visitStatus, { backgroundColor: color }]} />
      <View style={styles.visitInfo}>
        <ThemedText type="h4">{visit.visitor_name}</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {visit.unit_block ? `${visit.unit_block} ${visit.unit_number}` : visit.visit_type ?? "—"} · {
            new Date(visit.check_in_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
          }
        </ThemedText>
      </View>
      <ThemedText type="caption" style={{ color }}>{visit.status}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: Spacing.xl, paddingBottom: Spacing["4xl"] },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: Spacing["2xl"] },
  offlineBadge: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  statsRow: { flexDirection: "row", gap: Spacing.md, marginBottom: Spacing["2xl"] },
  statCard: { flex: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: "center", gap: Spacing.sm },
  statIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  section: { gap: Spacing.md },
  sectionTitle: { marginBottom: Spacing.sm },
  emptyCard: { borderRadius: BorderRadius.lg, padding: Spacing["3xl"], alignItems: "center", gap: Spacing.md },
  visitRow: { flexDirection: "row", alignItems: "center", borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.md },
  visitStatus: { width: 4, height: 40, borderRadius: 2 },
  visitInfo: { flex: 1, gap: 2 },
});
