import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Linking,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/dataService";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { Resident, Unit } from "@/types";

type ResidentItem = Resident & { unitLabel?: string };

function formatResultCount(count: number): string {
  const noun = count === 1 ? "morador encontrado" : "moradores encontrados";
  return `${count} ${noun}`;
}

export default function ResidentSearchScreen() {
  const { theme } = useTheme();
  const { staff } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [residents, setResidents] = useState<ResidentItem[]>([]);
  const [unitMap, setUnitMap] = useState<Map<number, string>>(new Map());

  const condoId = staff?.condominium_id;

  const load = useCallback(async () => {
    if (!condoId) return;
    setLoading(true);
    const [res, units] = await Promise.all([
      api.getResidents(condoId),
      api.getUnitsWithResidents(condoId),
    ]);
    const map = new Map<number, string>();
    (units as Unit[]).forEach((u) => {
      map.set(
        u.id,
        u.code_block ? `Bloco ${u.code_block} - ${u.number}` : u.number,
      );
    });
    setUnitMap(map);
    setResidents(res.map((r) => ({ ...r, unitLabel: map.get(r.unit_id) })));
    setLoading(false);
  }, [condoId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return residents;
    const digits = q.replace(/\D/g, "");
    return residents.filter((r) => {
      if (r.name.toLowerCase().includes(q)) return true;
      if ((unitMap.get(r.unit_id) || "").toLowerCase().includes(q)) return true;
      if (digits && (r.phone || "").replace(/\D/g, "").includes(digits)) {
        return true;
      }
      return false;
    });
  }, [searchTerm, residents, unitMap]);

  function handleCall(phone?: string | null) {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  }

  return (
    <ThemedView style={styles.container}>
      {/* Search bar */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: theme.backgroundSecondary,
            borderColor: theme.border,
          },
        ]}
      >
        <Feather name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder="Nome, telefone ou unidade..."
          placeholderTextColor={theme.textSecondary}
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCorrect={false}
        />
        {searchTerm.length > 0 && (
          <Pressable onPress={() => setSearchTerm("")} hitSlop={8}>
            <Feather name="x" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Count badge */}
      <View style={styles.countRow}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {loading ? "A carregar..." : formatResultCount(filtered.length)}
        </ThemedText>
      </View>

      {loading ? (
        <ActivityIndicator
          color={BrandColors.primary}
          style={{ marginTop: 60 }}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.id}-${item.unit_id}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.border,
                },
              ]}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: BrandColors.primary + "15" },
                ]}
              >
                <Feather name="user" size={24} color={BrandColors.primary} />
              </View>
              <View style={styles.info}>
                <ThemedText type="h4">{item.name}</ThemedText>
                <View style={styles.row}>
                  <Feather name="home" size={13} color={theme.textSecondary} />
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary, marginLeft: 4 }}
                  >
                    {item.unitLabel || "Unidade desconhecida"}
                  </ThemedText>
                </View>
                {item.phone && (
                  <View style={styles.row}>
                    <Feather
                      name="phone"
                      size={13}
                      color={theme.textSecondary}
                    />
                    <ThemedText
                      type="small"
                      style={{ color: theme.textSecondary, marginLeft: 4 }}
                    >
                      {item.phone}
                    </ThemedText>
                  </View>
                )}
              </View>
              {item.phone && (
                <Pressable
                  style={[
                    styles.callBtn,
                    { backgroundColor: BrandColors.primary },
                  ]}
                  onPress={() => handleCall(item.phone)}
                  accessibilityLabel={`Ligar para ${item.name}`}
                >
                  <Feather name="phone-call" size={18} color="#fff" />
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={48} color={theme.textSecondary} />
              <ThemedText
                style={{
                  color: theme.textSecondary,
                  marginTop: Spacing.md,
                  textAlign: "center",
                }}
              >
                {api.isOnline
                  ? "Nenhum morador encontrado."
                  : "Sem dados offline. Ligue-se para pesquisar."}
              </ThemedText>
            </View>
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    margin: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 15 },
  countRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 32, gap: Spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  info: { flex: 1, gap: 2 },
  row: { flexDirection: "row", alignItems: "center" },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    padding: Spacing["3xl"],
    marginTop: 60,
  },
});
