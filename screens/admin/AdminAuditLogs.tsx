import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from "react-native";
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
import type { AuditLog } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminAuditLogs() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setItems(await api.adminGetAuditLogs({ limit: 100 }));
    } catch (loadError) {
      logger.warn(LogCategory.UI, "AdminAuditLogs: load failed", {
        error: String(loadError),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  const filtered = useMemo(
    () =>
      items.filter(
        (l) =>
          l.action.toLowerCase().includes(search.toLowerCase()) ||
          (l.actor?.first_name ?? "")
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [items, search],
  );

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.cardBackground,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <ThemedText type="h3">Logs de Auditoria</ThemedText>
        <Pressable onPress={() => load()} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View
        style={[
          styles.searchRow,
          {
            backgroundColor: theme.backgroundSecondary,
            borderColor: theme.border,
          },
        ]}
      >
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput
          style={{ flex: 1, color: theme.text }}
          placeholder="Pesquisar acção ou actor..."
          placeholderTextColor={theme.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l) => String(l.id)}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <ThemedText style={{ color: theme.textSecondary }}>
                Sem logs
              </ThemedText>
            </View>
          }
          renderItem={({ item: log }) => {
            const dt = new Date(log.created_at).toLocaleString("pt-PT", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.cardBackground,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="h4">{log.action}</ThemedText>
                    {log.target_table && (
                      <View style={styles.tableBadge}>
                        <ThemedText
                          type="small"
                          style={{ color: "#1E40AF", fontWeight: "700" }}
                        >
                          {log.target_table}
                        </ThemedText>
                      </View>
                    )}
                    {log.actor && (
                      <ThemedText
                        type="small"
                        style={{ color: theme.textSecondary }}
                      >
                        Por: {log.actor.first_name} {log.actor.last_name}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary }}
                  >
                    {dt}
                  </ThemedText>
                </View>
              </View>
            );
          }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    paddingTop: 56,
  },
  backBtn: { marginRight: Spacing.md },
  refreshBtn: { marginLeft: "auto" as never },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["3xl"],
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    margin: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.md },
  tableBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#DBEAFE",
    marginTop: 2,
  },
});
