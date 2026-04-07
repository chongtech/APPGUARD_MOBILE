import React, { useState, useEffect, useCallback } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, TextInput, Modal, ScrollView, Switch } from "react-native";
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
import type { VisitTypeConfig } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

export default function AdminVisitTypes() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<VisitTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VisitTypeConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [iconKey, setIconKey] = useState("");
  const [reqService, setReqService] = useState(false); const [reqRestaurant, setReqRestaurant] = useState(false); const [reqSport, setReqSport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.adminGetAllVisitTypes()); } catch (loadError) { logger.warn(LogCategory.UI, "AdminVisitTypes: load failed", { error: String(loadError) }); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setName(""); setIconKey(""); setReqService(false); setReqRestaurant(false); setReqSport(false); setModalOpen(true); };
  const openEdit = (v: VisitTypeConfig) => { setEditing(v); setName(v.name); setIconKey(v.icon_key ?? ""); setReqService(v.requires_service_type); setReqRestaurant(v.requires_restaurant ?? false); setReqSport(v.requires_sport ?? false); setModalOpen(true); };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert("Erro", "Nome obrigatório.");
    setSaving(true);
    try {
      const payload = { name: name.trim(), icon_key: iconKey.trim() || undefined, requires_service_type: reqService, requires_restaurant: reqRestaurant, requires_sport: reqSport };
      if (editing) await api.adminUpdateVisitType(editing.id, payload);
      else await api.adminCreateVisitType(payload);
      setModalOpen(false); load();
    } catch (e: unknown) { logger.error(LogCategory.UI, "AdminVisitTypes: save failed", e instanceof Error ? e : new Error(String(e))); Alert.alert("Erro", (e as Error).message); } finally { setSaving(false); }
  };

  const handleDelete = (v: VisitTypeConfig) => {
    Alert.alert("Eliminar", `Eliminar "${v.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await api.adminDeleteVisitType(v.id); load(); } },
    ]);
  };

  const toggles = [
    { label: "Requer Tipo Serviço", value: reqService, set: setReqService },
    { label: "Requer Restaurante", value: reqRestaurant, set: setReqRestaurant },
    { label: "Requer Desporto", value: reqSport, set: setReqSport },
  ];

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={theme.text} /></Pressable>
        <ThemedText type="h3">Tipos de Visita</ThemedText>
        <Pressable onPress={load} style={styles.refreshBtn}><Feather name="refresh-cw" size={20} color={theme.textSecondary} /></Pressable>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList data={items} keyExtractor={(v) => String(v.id)} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem tipos</ThemedText></View>}
          renderItem={({ item: v }) => (
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.cardRow}>
                <Feather name="tag" size={20} color={BrandColors.primary} />
                <View style={{ flex: 1 }}>
                  <ThemedText type="h4">{v.name}</ThemedText>
                  <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                    {v.requires_service_type && <View style={styles.pill}><ThemedText type="small" style={{ color: BrandColors.primary }}>Serviço</ThemedText></View>}
                    {v.requires_restaurant && <View style={styles.pill}><ThemedText type="small" style={{ color: BrandColors.primary }}>Restaurante</ThemedText></View>}
                    {v.requires_sport && <View style={styles.pill}><ThemedText type="small" style={{ color: BrandColors.primary }}>Desporto</ThemedText></View>}
                  </View>
                </View>
                <Pressable onPress={() => openEdit(v)} style={styles.iconBtn}><Feather name="edit-2" size={16} color={BrandColors.primary} /></Pressable>
                <Pressable onPress={() => handleDelete(v)} style={styles.iconBtn}><Feather name="trash-2" size={16} color="#EF4444" /></Pressable>
              </View>
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
            <ScrollView contentContainerStyle={{ gap: Spacing.md, padding: Spacing.lg }}>
              {[["Nome *", name, setName], ["Icon Key", iconKey, setIconKey]].map(([label, value, set]) => (
                <View key={label as string}>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>{label as string}</ThemedText>
                  <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                    value={value as string} onChangeText={set as (t: string) => void} />
                </View>
              ))}
              {toggles.map(({ label, value, set }) => (
                <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <ThemedText>{label}</ThemedText>
                  <Switch value={value} onValueChange={set} trackColor={{ true: BrandColors.primary }} />
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
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg },
  cardRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: BrandColors.primary + "15" },
  iconBtn: { padding: 4 },
  fab: { position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: BrandColors.primary, justifyContent: "center", alignItems: "center", elevation: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { maxHeight: "80%", borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg },
  input: { borderWidth: 1, borderRadius: BorderRadius.xs, padding: Spacing.md, fontSize: 15 },
  saveBtn: { backgroundColor: BrandColors.primary, padding: Spacing.lg, borderRadius: BorderRadius.sm, alignItems: "center", marginTop: Spacing.md },
});
