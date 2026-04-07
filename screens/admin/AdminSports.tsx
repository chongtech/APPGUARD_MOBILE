import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, TextInput, Modal, ScrollView } from "react-native";
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
import type { Sport } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;
type Status = "ACTIVE" | "INACTIVE";

export default function AdminSports() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Sport | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [desc, setDesc] = useState(""); const [condoId, setCondoId] = useState(""); const [status, setStatus] = useState<Status>("ACTIVE");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.adminGetAllSports()); } catch (loadError) { logger.warn(LogCategory.UI, "AdminSports: load failed", { error: String(loadError) }); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const filtered = useMemo(() => items.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())), [items, search]);

  const openCreate = () => { setEditing(null); setName(""); setDesc(""); setCondoId(""); setStatus("ACTIVE"); setModalOpen(true); };
  const openEdit = (s: Sport) => { setEditing(s); setName(s.name); setDesc(s.description ?? ""); setCondoId(String(s.condominium_id)); setStatus(s.status ?? "ACTIVE"); setModalOpen(true); };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert("Erro", "Nome obrigatório.");
    setSaving(true);
    try {
      const p = { name: name.trim(), description: desc.trim() || undefined, condominium_id: Number(condoId), status };
      if (editing) await api.adminUpdateSport(editing.id, p);
      else await api.adminCreateSport(p);
      setModalOpen(false); load();
    } catch (e: unknown) { logger.error(LogCategory.UI, "AdminSports: save failed", e instanceof Error ? e : new Error(String(e))); Alert.alert("Erro", (e as Error).message); } finally { setSaving(false); }
  };

  const handleDelete = (s: Sport) => {
    Alert.alert("Eliminar", `Eliminar "${s.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await api.adminDeleteSport(s.id); load(); } },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={theme.text} /></Pressable>
        <ThemedText type="h3">Desportos</ThemedText>
        <Pressable onPress={load} style={styles.refreshBtn}><Feather name="refresh-cw" size={20} color={theme.textSecondary} /></Pressable>
      </View>
      <View style={[styles.searchRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput style={{ flex: 1, color: theme.text }} placeholder="Pesquisar..." placeholderTextColor={theme.textSecondary} value={search} onChangeText={setSearch} />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList data={filtered} keyExtractor={(s) => s.id} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem desportos</ThemedText></View>}
          renderItem={({ item: s }) => (
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.cardRow}>
                <Feather name="activity" size={20} color={BrandColors.primary} />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <ThemedText type="h4">{s.name}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>Condo #{s.condominium_id}</ThemedText>
                </View>
                <View style={[styles.badge, { backgroundColor: s.status === "ACTIVE" ? "#D1FAE5" : "#F1F5F9" }]}>
                  <ThemedText type="small" style={{ color: s.status === "ACTIVE" ? "#065F46" : "#64748B", fontWeight: "700" }}>{s.status ?? "—"}</ThemedText>
                </View>
                <Pressable onPress={() => openEdit(s)} style={styles.iconBtn}><Feather name="edit-2" size={16} color={BrandColors.primary} /></Pressable>
                <Pressable onPress={() => handleDelete(s)} style={styles.iconBtn}><Feather name="trash-2" size={16} color="#EF4444" /></Pressable>
              </View>
            </View>
          )} />
      )}
      <Pressable style={styles.fab} onPress={openCreate}><Feather name="plus" size={24} color="#fff" /></Pressable>
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">{editing ? "Editar" : "Novo Desporto"}</ThemedText>
              <Pressable onPress={() => setModalOpen(false)}><Feather name="x" size={22} color={theme.textSecondary} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: Spacing.md, padding: Spacing.lg }}>
              {([["Nome *", name, setName, "default"], ["Descrição", desc, setDesc, "default"], ["Condo ID *", condoId, setCondoId, "number-pad"]] as [string, string, (t: string) => void, string][]).map(([label, value, set, kb]) => (
                <View key={label}>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>{label}</ThemedText>
                  <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                    value={value} onChangeText={set} keyboardType={kb as never} />
                </View>
              ))}
              <View>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>Estado</ThemedText>
                <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                  {(["ACTIVE", "INACTIVE"] as Status[]).map((st) => (
                    <Pressable key={st} style={[styles.chip, { backgroundColor: status === st ? BrandColors.primary : theme.cardBackground, borderColor: status === st ? BrandColors.primary : theme.border }]}
                      onPress={() => setStatus(st)}>
                      <ThemedText type="small" style={{ color: status === st ? "#fff" : theme.text, fontWeight: "700" }}>{st}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={{ color: "#fff", fontWeight: "700" }}>Guardar</ThemedText>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  iconBtn: { padding: 4 },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 99, borderWidth: 1 },
  fab: { position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: BrandColors.primary, justifyContent: "center", alignItems: "center", elevation: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { maxHeight: "80%", borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg },
  input: { borderWidth: 1, borderRadius: BorderRadius.xs, padding: Spacing.md, fontSize: 15 },
  saveBtn: { backgroundColor: BrandColors.primary, padding: Spacing.lg, borderRadius: BorderRadius.sm, alignItems: "center", marginTop: Spacing.md },
  chip2: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 99, borderWidth: 1 },
});
