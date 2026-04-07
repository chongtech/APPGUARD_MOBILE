import React, { useState, useEffect, useCallback } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, TextInput, Modal } from "react-native";
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
import type { ServiceTypeConfig } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminServiceTypes() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<ServiceTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceTypeConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.adminGetAllServiceTypes()); } catch (loadError) { logger.warn(LogCategory.UI, "AdminServiceTypes: load failed", { error: String(loadError) }); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setName(""); setModalOpen(true); };
  const openEdit = (s: ServiceTypeConfig) => { setEditing(s); setName(s.name); setModalOpen(true); };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert("Erro", "Nome obrigatório.");
    setSaving(true);
    try {
      if (editing) await api.adminUpdateServiceType(editing.id, { name: name.trim() });
      else await api.adminCreateServiceType({ name: name.trim() });
      setModalOpen(false); load();
    } catch (e: unknown) { logger.error(LogCategory.UI, "AdminServiceTypes: save failed", e instanceof Error ? e : new Error(String(e))); Alert.alert("Erro", (e as Error).message); } finally { setSaving(false); }
  };

  const handleDelete = (s: ServiceTypeConfig) => {
    Alert.alert("Eliminar", `Eliminar "${s.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await api.adminDeleteServiceType(s.id); load(); } },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={theme.text} /></Pressable>
        <ThemedText type="h3">Tipos de Serviço</ThemedText>
        <Pressable onPress={load} style={styles.refreshBtn}><Feather name="refresh-cw" size={20} color={theme.textSecondary} /></Pressable>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList data={items} keyExtractor={(s) => String(s.id)} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem tipos</ThemedText></View>}
          renderItem={({ item: s }) => (
            <View style={[styles.row, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <Feather name="tool" size={18} color={BrandColors.primary} />
              <ThemedText style={{ flex: 1, marginLeft: Spacing.md }}>{s.name}</ThemedText>
              <Pressable onPress={() => openEdit(s)} style={styles.iconBtn}><Feather name="edit-2" size={16} color={BrandColors.primary} /></Pressable>
              <Pressable onPress={() => handleDelete(s)} style={styles.iconBtn}><Feather name="trash-2" size={16} color="#EF4444" /></Pressable>
            </View>
          )} />
      )}
      <Pressable style={styles.fab} onPress={openCreate}><Feather name="plus" size={24} color="#fff" /></Pressable>
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">{editing ? "Editar Tipo" : "Novo Tipo"}</ThemedText>
              <Pressable onPress={() => setModalOpen(false)}><Feather name="x" size={22} color={theme.textSecondary} /></Pressable>
            </View>
            <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>Nome *</ThemedText>
              <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                value={name} onChangeText={setName} autoFocus />
              <Pressable style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={{ color: "#fff", fontWeight: "700" }}>Guardar</ThemedText>}
              </Pressable>
            </View>
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
  row: { flexDirection: "row", alignItems: "center", borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg },
  iconBtn: { padding: 4, marginLeft: 4 },
  fab: { position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: BrandColors.primary, justifyContent: "center", alignItems: "center", elevation: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg },
  input: { borderWidth: 1, borderRadius: BorderRadius.xs, padding: Spacing.md, fontSize: 15 },
  saveBtn: { backgroundColor: BrandColors.primary, padding: Spacing.lg, borderRadius: BorderRadius.sm, alignItems: "center" },
});
