import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, TextInput, Modal, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/services/dataService";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";
import type { AdminStackParamList } from "@/navigation/AdminStackNavigator";
import type { Unit } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminUnits() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [saving, setSaving] = useState(false);
  const [number, setNumber] = useState("");
  const [block, setBlock] = useState("");
  const [condoId, setCondoId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.adminGetAllUnits()); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    items.filter((u) => u.number.toLowerCase().includes(search.toLowerCase()) || u.code_block?.toLowerCase().includes(search.toLowerCase())),
    [items, search]);

  const openCreate = () => { setEditing(null); setNumber(""); setBlock(""); setCondoId(""); setModalOpen(true); };
  const openEdit = (u: Unit) => { setEditing(u); setNumber(u.number); setBlock(u.code_block ?? ""); setCondoId(String(u.condominium_id)); setModalOpen(true); };

  const handleSave = async () => {
    if (!number.trim()) return Alert.alert("Erro", "Número obrigatório.");
    setSaving(true);
    try {
      if (editing) await api.adminUpdateUnit(editing.id, { number: number.trim(), code_block: block.trim() || undefined });
      else await api.adminCreateUnit({ number: number.trim(), code_block: block.trim() || undefined, condominium_id: Number(condoId) });
      setModalOpen(false); load();
    } catch (e: unknown) { Alert.alert("Erro", (e as Error).message); } finally { setSaving(false); }
  };

  const handleDelete = (u: Unit) => {
    Alert.alert("Eliminar Unidade", `Eliminar "${u.number}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await api.adminDeleteUnit(u.id); load(); } },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={theme.text} /></Pressable>
        <ThemedText type="h3">Unidades</ThemedText>
        <Pressable onPress={load} style={styles.refreshBtn}><Feather name="refresh-cw" size={20} color={theme.textSecondary} /></Pressable>
      </View>
      <View style={[styles.searchRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput style={{ flex: 1, color: theme.text }} placeholder="Pesquisar..." placeholderTextColor={theme.textSecondary} value={search} onChangeText={setSearch} />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList data={filtered} keyExtractor={(u) => String(u.id)} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem unidades</ThemedText></View>}
          renderItem={({ item: u }) => (
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.cardRow}>
                <Feather name="home" size={20} color={BrandColors.primary} />
                <View style={{ flex: 1 }}>
                  <ThemedText type="h4">{u.code_block ? `Bloco ${u.code_block} – ` : ""}{u.number}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>Condo #{u.condominium_id}</ThemedText>
                </View>
                <Pressable onPress={() => openEdit(u)} style={styles.iconBtn}><Feather name="edit-2" size={16} color={BrandColors.primary} /></Pressable>
                <Pressable onPress={() => handleDelete(u)} style={styles.iconBtn}><Feather name="trash-2" size={16} color="#EF4444" /></Pressable>
              </View>
            </View>
          )} />
      )}
      <Pressable style={styles.fab} onPress={openCreate}><Feather name="plus" size={24} color="#fff" /></Pressable>
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">{editing ? "Editar Unidade" : "Nova Unidade"}</ThemedText>
              <Pressable onPress={() => setModalOpen(false)}><Feather name="x" size={22} color={theme.textSecondary} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: Spacing.md, padding: Spacing.lg }}>
              {[["Número *", number, setNumber], ["Bloco", block, setBlock], ...(!editing ? [["Condo ID *", condoId, setCondoId]] : [])].map(([label, value, set]) => (
                <View key={label as string}>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>{label as string}</ThemedText>
                  <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                    value={value as string} onChangeText={set as (t: string) => void} keyboardType={(label as string).includes("ID") ? "number-pad" : "default"} />
                </View>
              ))}
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
  cardRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  iconBtn: { padding: 4 },
  fab: { position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: BrandColors.primary, justifyContent: "center", alignItems: "center", elevation: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { maxHeight: "75%", borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg },
  input: { borderWidth: 1, borderRadius: BorderRadius.xs, padding: Spacing.md, fontSize: 15 },
  saveBtn: { backgroundColor: BrandColors.primary, padding: Spacing.lg, borderRadius: BorderRadius.sm, alignItems: "center", marginTop: Spacing.md },
});
