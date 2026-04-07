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
import type { Resident } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminResidents() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resident | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [unitId, setUnitId] = useState(""); const [condoId, setCondoId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.adminGetAllResidents()); } catch (loadError) { logger.warn(LogCategory.UI, "AdminResidents: load failed", { error: String(loadError) }); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    items.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.email?.toLowerCase().includes(search.toLowerCase())),
    [items, search]);

  const openCreate = () => { setEditing(null); setName(""); setEmail(""); setPhone(""); setUnitId(""); setCondoId(""); setModalOpen(true); };
  const openEdit = (r: Resident) => { setEditing(r); setName(r.name); setEmail(r.email ?? ""); setPhone(r.phone ?? ""); setUnitId(r.unit_id ? String(r.unit_id) : ""); setCondoId(String(r.condominium_id)); setModalOpen(true); };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert("Erro", "Nome obrigatório.");
    setSaving(true);
    try {
      const payload = { name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, unit_id: unitId ? Number(unitId) : undefined, condominium_id: condoId ? Number(condoId) : undefined };
      if (editing) await api.adminUpdateResident(editing.id, payload);
      else await api.adminCreateResident(payload);
      setModalOpen(false); load();
    } catch (e: unknown) { logger.error(LogCategory.UI, "AdminResidents: save failed", e instanceof Error ? e : new Error(String(e))); Alert.alert("Erro", (e as Error).message); } finally { setSaving(false); }
  };

  const handleDelete = (r: Resident) => {
    Alert.alert("Eliminar Morador", `Eliminar "${r.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await api.adminDeleteResident(r.id); load(); } },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={theme.text} /></Pressable>
        <ThemedText type="h3">Moradores</ThemedText>
        <Pressable onPress={load} style={styles.refreshBtn}><Feather name="refresh-cw" size={20} color={theme.textSecondary} /></Pressable>
      </View>
      <View style={[styles.searchRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput style={{ flex: 1, color: theme.text }} placeholder="Pesquisar..." placeholderTextColor={theme.textSecondary} value={search} onChangeText={setSearch} />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList data={filtered} keyExtractor={(r) => String(r.id)} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem moradores</ThemedText></View>}
          renderItem={({ item: r }) => (
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.cardRow}>
                <View style={[styles.avatar, { backgroundColor: "#10B98120" }]}>
                  <ThemedText style={{ fontWeight: "800", color: "#10B981" }}>{r.name.charAt(0).toUpperCase()}</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="h4">{r.name}</ThemedText>
                  {r.email && <ThemedText type="small" style={{ color: theme.textSecondary }}>{r.email}</ThemedText>}
                  {r.phone && <ThemedText type="small" style={{ color: theme.textSecondary }}>{r.phone}</ThemedText>}
                  {r.unit_id && <ThemedText type="small" style={{ color: theme.textSecondary }}>Unidade #{r.unit_id}</ThemedText>}
                </View>
                <Pressable onPress={() => openEdit(r)} style={styles.iconBtn}><Feather name="edit-2" size={16} color={BrandColors.primary} /></Pressable>
                <Pressable onPress={() => handleDelete(r)} style={styles.iconBtn}><Feather name="trash-2" size={16} color="#EF4444" /></Pressable>
              </View>
            </View>
          )} />
      )}
      <Pressable style={styles.fab} onPress={openCreate}><Feather name="plus" size={24} color="#fff" /></Pressable>
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">{editing ? "Editar Morador" : "Novo Morador"}</ThemedText>
              <Pressable onPress={() => setModalOpen(false)}><Feather name="x" size={22} color={theme.textSecondary} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: Spacing.md, padding: Spacing.lg }}>
              {([["Nome *", name, setName, "default"], ["Email", email, setEmail, "email-address"], ["Telefone", phone, setPhone, "phone-pad"], ["Unidade ID", unitId, setUnitId, "number-pad"], ...(!editing ? [["Condo ID *", condoId, setCondoId, "number-pad"]] : [])] as [string, string, (t: string) => void, string][]).map(([label, value, set, kb]) => (
                <View key={label}>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>{label}</ThemedText>
                  <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                    value={value} onChangeText={set} keyboardType={kb as never} placeholderTextColor={theme.textSecondary} />
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
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  iconBtn: { padding: 4 },
  fab: { position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: BrandColors.primary, justifyContent: "center", alignItems: "center", elevation: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg },
  input: { borderWidth: 1, borderRadius: BorderRadius.xs, padding: Spacing.md, fontSize: 15 },
  saveBtn: { backgroundColor: BrandColors.primary, padding: Spacing.lg, borderRadius: BorderRadius.sm, alignItems: "center", marginTop: Spacing.md },
});
