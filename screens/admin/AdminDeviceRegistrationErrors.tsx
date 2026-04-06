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
import type { DeviceRegistrationError } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminDeviceRegistrationErrors() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<DeviceRegistrationError[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setItems(await api.adminGetDeviceRegistrationErrors()); } catch { /* ignore */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={theme.text} /></Pressable>
        <ThemedText type="h3">Erros de Registo ({items.length})</ThemedText>
        <Pressable onPress={() => load()} style={styles.refreshBtn}><Feather name="refresh-cw" size={20} color={theme.textSecondary} /></Pressable>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList data={items} keyExtractor={(e) => String(e.id)} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="check-circle" size={48} color="#10B981" />
              <ThemedText style={{ color: theme.textSecondary }}>Sem erros registados</ThemedText>
            </View>
          }
          renderItem={({ item: err }) => {
            const dt = new Date(err.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
            return (
              <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: "#EF4444" }]}>
                <View style={styles.cardHeader}>
                  <Feather name="x-circle" size={16} color="#EF4444" />
                  <ThemedText type="small" style={{ color: "#EF4444", fontWeight: "700", marginLeft: 4 }}>Erro de Registo</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: "auto" as never }}>{dt}</ThemedText>
                </View>
                {err.device_identifier && <ThemedText type="small" style={{ color: theme.textSecondary }}>ID: {err.device_identifier}</ThemedText>}
                <ThemedText style={{ marginTop: 4, color: theme.text }}>{err.error_message}</ThemedText>
              </View>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md, padding: Spacing["3xl"] },
  card: { borderRadius: BorderRadius.md, borderWidth: 1, borderLeftWidth: 4, padding: Spacing.lg, gap: Spacing.xs },
  cardHeader: { flexDirection: "row", alignItems: "center" },
});
