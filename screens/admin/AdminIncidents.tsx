import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView } from "react-native";
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
import type { Incident } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

const STATUSES = ["all", "novo", "acknowledged", "inprogress", "resolved"];

const TYPE_COLOR: Record<string, string> = {
  perigo: "#EF4444", incendio: "#F97316", suspeita: "#EAB308",
};

export default function AdminIncidents() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.adminGetAllIncidents()); } catch (loadError) { logger.warn(LogCategory.UI, "AdminIncidents: load failed", { error: String(loadError) }); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    filter === "all" ? items : items.filter((i) => i.status === filter),
    [items, filter]);

  const openActions = (inc: Incident) => {
    Alert.alert("Resolver Ocorrência", inc.description, [
      { text: "Cancelar", style: "cancel" },
      { text: "Resolver", onPress: async () => { await api.adminResolveIncident(inc.id, "Resolvido via admin"); load(); } },
    ]);
  };

  const typeColor = (type?: string) => TYPE_COLOR[type?.toLowerCase() ?? ""] ?? "#64748B";

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <ThemedText type="h3">Ocorrências</ThemedText>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {STATUSES.map((s) => (
          <Pressable key={s} style={[styles.chip, { backgroundColor: filter === s ? BrandColors.primary : theme.cardBackground, borderColor: filter === s ? BrandColors.primary : theme.border }]}
            onPress={() => setFilter(s)}>
            <ThemedText type="small" style={{ color: filter === s ? "#fff" : theme.text, fontWeight: "700", textTransform: "capitalize" }}>{s === "all" ? "Todos" : s}</ThemedText>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem ocorrências</ThemedText></View>}
          renderItem={({ item: inc }) => {
            const color = typeColor(inc.type);
            const dt = new Date(inc.reported_at).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
            return (
              <Pressable style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: color, borderLeftWidth: 4 }]} onPress={() => openActions(inc)}>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <View style={[styles.typeBadge, { backgroundColor: color + "18" }]}>
                      <ThemedText type="small" style={{ color, fontWeight: "700" }}>{inc.type_label ?? inc.type ?? "OCORRÊNCIA"}</ThemedText>
                    </View>
                    <ThemedText style={{ marginTop: 4 }}>{inc.description ?? "—"}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>{dt}</ThemedText>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: inc.status === "resolved" ? "#D1FAE5" : "#FEF3C7" }]}>
                    <ThemedText type="small" style={{ color: inc.status === "resolved" ? "#065F46" : "#92400E", fontWeight: "700" }}>{inc.status}</ThemedText>
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
  filters: { gap: Spacing.sm, padding: Spacing.md },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 99, borderWidth: 1 },
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.md },
  typeBadge: { alignSelf: "flex-start", paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 4 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: 99, alignSelf: "flex-start" },
});
