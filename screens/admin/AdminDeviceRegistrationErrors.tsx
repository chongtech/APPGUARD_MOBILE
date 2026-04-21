import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
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
import type { DeviceRegistrationError } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;
type DateRange = "7d" | "30d" | "all";

const PAGE_SIZE = 25;

export default function AdminDeviceRegistrationErrors() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<DeviceRegistrationError[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [page, setPage] = useState(1);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setItems(await api.adminGetDeviceRegistrationErrors());
    } catch (loadError) {
      logger.warn(
        LogCategory.UI,
        "AdminDeviceRegistrationErrors: load failed",
        { error: String(loadError) },
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = items;
    if (deviceFilter.trim()) {
      const q = deviceFilter.trim().toLowerCase();
      list = list.filter((e) => e.device_identifier?.toLowerCase().includes(q));
    }
    if (dateRange !== "all") {
      const days = dateRange === "7d" ? 7 : 30;
      const cutoff = Date.now() - days * 86400_000;
      list = list.filter((e) => new Date(e.created_at).getTime() >= cutoff);
    }
    return list;
  }, [items, deviceFilter, dateRange]);

  const paginated = useMemo(
    () => filtered.slice(0, page * PAGE_SIZE),
    [filtered, page],
  );
  const hasMore = paginated.length < filtered.length;

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
        <ThemedText type="h3">Erros de Registo ({filtered.length})</ThemedText>
        <Pressable onPress={() => load()} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Device ID filter */}
      <View
        style={[
          styles.searchRow,
          {
            backgroundColor: theme.backgroundSecondary,
            borderColor: theme.border,
          },
        ]}
      >
        <Feather name="cpu" size={16} color={theme.textSecondary} />
        <TextInput
          style={{ flex: 1, color: theme.text, fontFamily: "monospace" }}
          placeholder="Filtrar por Device ID..."
          placeholderTextColor={theme.textSecondary}
          value={deviceFilter}
          onChangeText={(v) => {
            setDeviceFilter(v);
            setPage(1);
          }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {deviceFilter.length > 0 && (
          <Pressable onPress={() => setDeviceFilter("")} hitSlop={8}>
            <Feather name="x" size={16} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Date range chips */}
      <View style={styles.filterRow}>
        {(["7d", "30d", "all"] as DateRange[]).map((r) => {
          const labels: Record<DateRange, string> = {
            "7d": "7 dias",
            "30d": "30 dias",
            all: "Todos",
          };
          const active = dateRange === r;
          return (
            <Pressable
              key={r}
              onPress={() => {
                setDateRange(r);
                setPage(1);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: active
                    ? BrandColors.primary
                    : theme.backgroundSecondary,
                  borderColor: active ? BrandColors.primary : theme.border,
                },
              ]}
            >
              <ThemedText
                type="small"
                style={{
                  color: active ? "#fff" : theme.textSecondary,
                  fontWeight: "700",
                }}
              >
                {labels[r]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.primary} />
        </View>
      ) : (
        <FlatList
          data={paginated}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{
            padding: Spacing.md,
            gap: Spacing.sm,
            paddingBottom: 32,
          }}
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
              <Feather name="check-circle" size={48} color="#10B981" />
              <ThemedText style={{ color: theme.textSecondary }}>
                Sem erros registados
              </ThemedText>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <Pressable
                style={[styles.loadMoreBtn, { borderColor: theme.border }]}
                onPress={() => setPage((p) => p + 1)}
              >
                <ThemedText
                  style={{ color: BrandColors.primary, fontWeight: "700" }}
                >
                  Ver mais ({filtered.length - paginated.length} restantes)
                </ThemedText>
              </Pressable>
            ) : null
          }
          renderItem={({ item: err }) => {
            const dt = new Date(err.created_at).toLocaleString("pt-PT", {
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
                    borderColor: "#EF4444",
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Feather name="x-circle" size={16} color="#EF4444" />
                  <ThemedText
                    type="small"
                    style={{
                      color: "#EF4444",
                      fontWeight: "700",
                      marginLeft: 4,
                    }}
                  >
                    Erro de Registo
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{
                      color: theme.textSecondary,
                      marginLeft: "auto" as never,
                    }}
                  >
                    {dt}
                  </ThemedText>
                </View>
                {err.device_identifier && (
                  <ThemedText
                    type="small"
                    style={{
                      color: theme.textSecondary,
                      fontFamily: "monospace",
                    }}
                  >
                    ID: {err.device_identifier}
                  </ThemedText>
                )}
                <ThemedText style={{ marginTop: 4, color: theme.text }}>
                  {err.error_message}
                </ThemedText>
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
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing["3xl"],
  },
  card: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  loadMoreBtn: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
});
