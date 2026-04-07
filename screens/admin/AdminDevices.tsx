import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, TextInput, RefreshControl } from "react-native";
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
import type { Device } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  ACTIVE:          { bg: "#D1FAE5", text: "#065F46" },
  INACTIVE:        { bg: "#F1F5F9", text: "#64748B" },
  DECOMMISSIONED:  { bg: "#FEE2E2", text: "#991B1B" },
};

export default function AdminDevices() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setItems(await api.adminGetAllDevices()); } catch (loadError) { logger.warn(LogCategory.UI, "AdminDevices: load failed", { error: String(loadError) }); } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const filtered = useMemo(() =>
    items.filter((d) => (d.device_name ?? "").toLowerCase().includes(search.toLowerCase()) || d.device_identifier.toLowerCase().includes(search.toLowerCase())),
    [items, search]);

  const handleDecommission = (d: Device) => {
    Alert.alert("Decomissionar", `Decomissionar "${d.device_name ?? d.device_identifier}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Decomissionar", style: "destructive", onPress: async () => { await api.adminDecommissionDevice(d.id ?? d.device_identifier); load(); } },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={theme.text} /></Pressable>
        <ThemedText type="h3">Dispositivos</ThemedText>
        <Pressable onPress={() => load()} style={styles.refreshBtn}><Feather name="refresh-cw" size={20} color={theme.textSecondary} /></Pressable>
      </View>
      <View style={[styles.searchRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput style={{ flex: 1, color: theme.text }} placeholder="Pesquisar dispositivo..." placeholderTextColor={theme.textSecondary} value={search} onChangeText={setSearch} />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList data={filtered} keyExtractor={(d) => d.id ?? d.device_identifier} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem dispositivos</ThemedText></View>}
          renderItem={({ item: d }) => {
            const sc = STATUS_COLOR[d.status ?? "INACTIVE"] ?? STATUS_COLOR.INACTIVE;
            const seen = d.last_seen_at ? new Date(d.last_seen_at).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
            return (
              <Pressable style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
                onPress={() => d.status !== "DECOMMISSIONED" && handleDecommission(d)}>
                <View style={styles.cardRow}>
                  <Feather name="tablet" size={20} color={BrandColors.primary} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <ThemedText type="h4">{d.device_name ?? d.device_identifier}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Condo #{d.condominium_id ?? "—"} · Visto: {seen}</ThemedText>
                  </View>
                  <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                    <ThemedText type="small" style={{ color: sc.text, fontWeight: "700" }}>{d.status ?? "—"}</ThemedText>
                  </View>
                </View>
              </Pressable>
            );
          }} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, paddingTop: 56 },
  backBtn: { marginRight: Spacing.md }, refreshBtn: { marginLeft: "auto" as never },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing["3xl"] },
  searchRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, margin: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.xs, borderWidth: 1 },
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg },
  cardRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
});
