import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/services/dataService";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { AdminStackParamList } from "@/navigation/AdminStackNavigator";
import type { Visit } from "@/types";
import { VisitStatus } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  PENDING:      { bg: "#FEF3C7", text: "#92400E" },
  APPROVED:     { bg: "#D1FAE5", text: "#065F46" },
  INSIDE:       { bg: "#DBEAFE", text: "#1E40AF" },
  CHECKED_OUT:  { bg: "#F1F5F9", text: "#475569" },
  CANCELLED:    { bg: "#FEE2E2", text: "#991B1B" },
};

export default function AdminVisits() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.adminGetAllVisits()); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    items.filter((v) => v.visitor_name.toLowerCase().includes(search.toLowerCase())),
    [items, search]);

  const openActions = (v: Visit) => {
    Alert.alert(v.visitor_name, "Alterar estado", [
      { text: "Aprovar", onPress: async () => { await api.adminUpdateVisitStatus(v.id, VisitStatus.APPROVED); load(); } },
      { text: "Negar", style: "destructive", onPress: async () => { await api.adminUpdateVisitStatus(v.id, VisitStatus.DENIED); load(); } },
      { text: "Fechar", style: "cancel" },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <ThemedText type="h3">Visitas</ThemedText>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={[styles.searchRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput style={{ flex: 1, color: theme.text }} placeholder="Pesquisar visitante..." placeholderTextColor={theme.textSecondary} value={search} onChangeText={setSearch} />
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList
          data={filtered}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem visitas</ThemedText></View>}
          renderItem={({ item: v }) => {
            const sc = STATUS_COLOR[v.status] ?? STATUS_COLOR.CANCELLED;
            const dt = new Date(v.check_in_at).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
            return (
              <Pressable style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]} onPress={() => openActions(v)}>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="h4">{v.visitor_name}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>{v.visit_type ?? "—"} · {dt}</ThemedText>
                    {v.unit_block && <ThemedText type="small" style={{ color: theme.textSecondary }}>Bloco {v.unit_block} – {v.unit_number}</ThemedText>}
                  </View>
                  <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                    <ThemedText type="small" style={{ color: sc.text, fontWeight: "700" }}>{v.status}</ThemedText>
                  </View>
                </View>
              </Pressable>
            );
          }}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing["3xl"] },
  searchRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, margin: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.xs, borderWidth: 1 },
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg },
  cardRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: 99 },
});
