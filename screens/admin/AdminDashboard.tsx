import React, { useState, useEffect, useCallback } from "react";
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/services/dataService";
import { logger, LogCategory } from "@/services/logger";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { AdminStackParamList } from "@/navigation/AdminStackNavigator";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

type Stats = {
  totalCondominiums: number; activeCondominiums: number;
  totalDevices: number; activeDevices: number;
  totalStaff: number; totalUnits: number; totalResidents: number;
  todayVisits: number; pendingVisits: number; activeIncidents: number;
};

const NAV_LINKS: { label: string; screen: keyof AdminStackParamList; icon: string }[] = [
  { label: "Analytics", screen: "AdminAnalytics", icon: "bar-chart-2" },
  { label: "Condomínios", screen: "AdminCondominiums", icon: "building" },
  { label: "Staff", screen: "AdminStaff", icon: "users" },
  { label: "Unidades", screen: "AdminUnits", icon: "home" },
  { label: "Moradores", screen: "AdminResidents", icon: "user" },
  { label: "Visitas", screen: "AdminVisits", icon: "list" },
  { label: "Ocorrências", screen: "AdminIncidents", icon: "alert-triangle" },
  { label: "Dispositivos", screen: "AdminDevices", icon: "tablet" },
  { label: "Notícias", screen: "AdminNews", icon: "file-text" },
  { label: "Tipos de Visita", screen: "AdminVisitTypes", icon: "tag" },
  { label: "Tipos de Serviço", screen: "AdminServiceTypes", icon: "tool" },
  { label: "Restaurantes", screen: "AdminRestaurants", icon: "coffee" },
  { label: "Desportos", screen: "AdminSports", icon: "activity" },
  { label: "Subscrições", screen: "AdminSubscriptions", icon: "credit-card" },
  { label: "Logs de Auditoria", screen: "AdminAuditLogs", icon: "clock" },
  { label: "Erros de Dispositivo", screen: "AdminDeviceRegistrationErrors", icon: "x-circle" },
];

export default function AdminDashboard() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const s = await api.adminGetDashboardStats();
      setStats(s);
    } catch (loadError) { logger.warn(LogCategory.UI, "AdminDashboard: load failed", { error: String(loadError) }); } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statCards = stats ? [
    { label: "Condomínios", value: stats.totalCondominiums, sub: `${stats.activeCondominiums} ativos`, icon: "building", color: "#3B82F6" },
    { label: "Dispositivos", value: stats.totalDevices, sub: `${stats.activeDevices} ativos`, icon: "tablet", color: "#64748B" },
    { label: "Staff", value: stats.totalStaff, sub: "registados", icon: "users", color: "#8B5CF6" },
    { label: "Unidades", value: stats.totalUnits, sub: "total", icon: "home", color: "#F59E0B" },
    { label: "Moradores", value: stats.totalResidents, sub: "registados", icon: "user", color: "#10B981" },
    { label: "Visitas Hoje", value: stats.todayVisits, sub: `${stats.pendingVisits} pendentes`, icon: "list", color: "#3B82F6" },
    { label: "Incidentes Ativos", value: stats.activeIncidents, sub: "por resolver", icon: "alert-triangle", color: "#EF4444" },
  ] : [];

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <ThemedText type="h3">Painel Admin</ThemedText>
        <Pressable onPress={() => load()} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={BrandColors.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>RESUMO</ThemedText>
          <View style={styles.grid}>
            {statCards.map((c) => (
              <View key={c.label} style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
                <View style={[styles.iconBox, { backgroundColor: c.color + "18" }]}>
                  <Feather name={c.icon as "home"} size={22} color={c.color} />
                </View>
                <ThemedText style={styles.cardValue}>{c.value}</ThemedText>
                <ThemedText type="h4" style={{ textAlign: "center" }}>{c.label}</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>{c.sub}</ThemedText>
              </View>
            ))}
          </View>

          <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>GESTÃO</ThemedText>
          <View style={[styles.navList, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            {NAV_LINKS.map((link, i) => (
              <Pressable
                key={link.screen}
                style={({ pressed }) => [styles.navRow, { borderBottomColor: theme.border, borderBottomWidth: i < NAV_LINKS.length - 1 ? 1 : 0, backgroundColor: pressed ? theme.backgroundSecondary : "transparent" }]}
                onPress={() => navigation.navigate(link.screen)}
              >
                <Feather name={link.icon as "home"} size={18} color={BrandColors.primary} />
                <ThemedText style={{ flex: 1, marginLeft: Spacing.md }}>{link.label}</ThemedText>
                <Feather name="chevron-right" size={18} color={theme.textSecondary} />
              </Pressable>
            ))}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, paddingTop: 56 },
  backBtn: { marginRight: Spacing.md },
  refreshBtn: { marginLeft: "auto" as never },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: Spacing.lg, gap: Spacing.md },
  sectionLabel: { fontWeight: "700", letterSpacing: 0.5, marginTop: Spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
  card: { width: "47%", borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg, alignItems: "center", gap: Spacing.xs },
  iconBox: { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" },
  cardValue: { fontSize: 32, fontWeight: "800", color: BrandColors.primary },
  navList: { borderRadius: BorderRadius.md, borderWidth: 1, overflow: "hidden" },
  navRow: { flexDirection: "row", alignItems: "center", padding: Spacing.lg },
});
