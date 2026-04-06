import React, { useState, useEffect, useCallback } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/services/dataService";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { AdminStackParamList } from "@/navigation/AdminStackNavigator";
import type { CondominiumStats } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminAnalytics() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState<CondominiumStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.adminGetCondominiumStats();
      setStats(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <ThemedText type="h3">Analytics</ThemedText>
        <Pressable onPress={() => load()} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={BrandColors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={stats}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="bar-chart-2" size={48} color={theme.textSecondary} />
              <ThemedText style={{ color: theme.textSecondary }}>Sem dados de analytics</ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="h4" style={{ flex: 1 }}>{item.name}</ThemedText>
                <View style={[styles.badge, { backgroundColor: item.status === "ACTIVE" ? "#D1FAE5" : "#F3F4F6" }]}>
                  <ThemedText type="small" style={{ color: item.status === "ACTIVE" ? "#065F46" : "#6B7280", fontWeight: "700" }}>
                    {item.status}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.metricsRow}>
                {[
                  { label: "Visitas Hoje", value: item.total_visits_today, color: "#3B82F6" },
                  { label: "Incidentes", value: item.total_incidents_open, color: "#EF4444" },
                ].map((m) => (
                  <View key={m.label} style={styles.metric}>
                    <ThemedText style={{ fontSize: 22, fontWeight: "800", color: m.color }}>{m.value ?? 0}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>{m.label}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, paddingTop: 56 },
  backBtn: { marginRight: Spacing.md },
  refreshBtn: { marginLeft: "auto" as never },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md, padding: Spacing["3xl"] },
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 99 },
  metricsRow: { flexDirection: "row", justifyContent: "space-between" },
  metric: { alignItems: "center", gap: 2 },
});
