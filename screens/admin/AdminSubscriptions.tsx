import React, { useState, useEffect, useCallback } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/services/dataService";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { AdminStackParamList } from "@/navigation/AdminStackNavigator";
import type { CondominiumSubscription } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  ACTIVE:   { bg: "#D1FAE5", text: "#065F46" },
  INACTIVE: { bg: "#F1F5F9", text: "#64748B" },
  TRIAL:    { bg: "#DBEAFE", text: "#1E40AF" },
};
const PAYMENT_COLOR: Record<string, { bg: string; text: string }> = {
  PAID: { bg: "#D1FAE5", text: "#065F46" }, PARTIAL: { bg: "#FEF3C7", text: "#92400E" }, PENDING: { bg: "#FEF3C7", text: "#92400E" },
};

export default function AdminSubscriptions() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<CondominiumSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setItems(await api.adminGetCondominiumSubscriptions()); } catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openActions = (sub: CondominiumSubscription) => {
    Alert.alert(sub.condominium_name ?? `Condo #${sub.condominium_id}`, "Alterar estado:", [
      { text: "Ativar",    onPress: async () => { await api.adminUpdateSubscriptionStatus(sub.id, "ACTIVE"); load(); } },
      { text: "Desativar", onPress: async () => { await api.adminUpdateSubscriptionStatus(sub.id, "INACTIVE"); load(); } },
      { text: "Trial",     onPress: async () => { await api.adminUpdateSubscriptionStatus(sub.id, "TRIAL"); load(); } },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={theme.text} /></Pressable>
        <ThemedText type="h3">Subscrições</ThemedText>
        <Pressable onPress={() => load()} style={styles.refreshBtn}><Feather name="refresh-cw" size={20} color={theme.textSecondary} /></Pressable>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList data={items} keyExtractor={(s) => String(s.id)} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem subscrições</ThemedText></View>}
          renderItem={({ item: sub }) => {
            const sc = STATUS_COLOR[sub.status] ?? STATUS_COLOR.INACTIVE;
            const pc = sub.payment_status ? (PAYMENT_COLOR[sub.payment_status] ?? null) : null;
            return (
              <Pressable style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]} onPress={() => openActions(sub)}>
                <View style={styles.cardRow}>
                  <Feather name="credit-card" size={20} color={BrandColors.primary} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <ThemedText type="h4">{sub.condominium_name ?? `Condo #${sub.condominium_id}`}</ThemedText>
                    {sub.next_due_date && (
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        Próximo: {new Date(sub.next_due_date).toLocaleDateString("pt-PT")}
                      </ThemedText>
                    )}
                    {!!sub.months_in_arrears && sub.months_in_arrears > 0 && (
                      <ThemedText type="small" style={{ color: "#EF4444" }}>
                        {sub.months_in_arrears} {sub.months_in_arrears === 1 ? "mês" : "meses"} em atraso
                      </ThemedText>
                    )}
                  </View>
                  <View style={{ gap: 4, alignItems: "flex-end" }}>
                    <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                      <ThemedText type="small" style={{ color: sc.text, fontWeight: "700" }}>{sub.status}</ThemedText>
                    </View>
                    {pc && (
                      <View style={[styles.badge, { backgroundColor: pc.bg }]}>
                        <ThemedText type="small" style={{ color: pc.text, fontWeight: "700" }}>{sub.payment_status}</ThemedText>
                      </View>
                    )}
                  </View>
                  <Feather name="chevron-right" size={16} color={theme.textSecondary} style={{ marginLeft: 4 }} />
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
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg },
  cardRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
});
