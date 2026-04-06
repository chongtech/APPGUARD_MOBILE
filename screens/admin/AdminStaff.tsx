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
import type { Staff } from "@/types";
import { UserRole } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;

const ROLES = [UserRole.ADMIN, UserRole.GUARD, UserRole.SUPER_ADMIN];
const ROLE_COLOR: Record<string, string> = {
  ADMIN: "#3B82F6", GUARD: "#10B981", SUPER_ADMIN: "#8B5CF6",
};

export default function AdminStaff() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [saving, setSaving] = useState(false);

  // form fields match Staff: first_name, last_name, role, pin_hash, condominium_id
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRole>(UserRole.GUARD);
  const [pin, setPin] = useState("");
  const [condoId, setCondoId] = useState("");

  const fullName = (s: Staff) => `${s.first_name} ${s.last_name}`;

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.adminGetAllStaff()); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    items.filter((s) => fullName(s).toLowerCase().includes(search.toLowerCase())),
    [items, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null); setFirstName(""); setLastName(""); setRole(UserRole.GUARD); setPin(""); setCondoId(""); setModalOpen(true);
  };
  const openEdit = (s: Staff) => {
    setEditing(s); setFirstName(s.first_name); setLastName(s.last_name); setRole(s.role); setPin(""); setCondoId(String(s.condominium_id)); setModalOpen(true);
  };

  const handleSave = async () => {
    if (!firstName.trim()) return Alert.alert("Erro", "Primeiro nome obrigatório.");
    setSaving(true);
    try {
      if (editing) {
        await api.adminUpdateStaff(editing.id, { first_name: firstName.trim(), last_name: lastName.trim(), role });
      } else {
        await api.adminCreateStaff({ first_name: firstName.trim(), last_name: lastName.trim(), role, pin_hash: pin || undefined, condominium_id: condoId ? Number(condoId) : undefined });
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      Alert.alert("Erro", (e as Error).message ?? "Não foi possível guardar.");
    } finally { setSaving(false); }
  };

  const handleDelete = (s: Staff) => {
    Alert.alert("Eliminar Staff", `Eliminar "${fullName(s)}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await api.adminDeleteStaff(s.id); load(); } },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <ThemedText type="h3">Staff</ThemedText>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={[styles.searchRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput style={{ flex: 1, color: theme.text }} placeholder="Pesquisar por nome..." placeholderTextColor={theme.textSecondary} value={search} onChangeText={setSearch} />
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={BrandColors.primary} /></View> : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={<View style={styles.center}><ThemedText style={{ color: theme.textSecondary }}>Sem staff</ThemedText></View>}
          renderItem={({ item: s }) => (
            <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <View style={styles.cardMain}>
                <View style={[styles.avatar, { backgroundColor: BrandColors.primary + "20" }]}>
                  <ThemedText style={{ fontWeight: "800", color: BrandColors.primary }}>{s.first_name.charAt(0).toUpperCase()}</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="h4">{fullName(s)}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>Condo #{s.condominium_id}</ThemedText>
                </View>
                <View style={[styles.badge, { backgroundColor: (ROLE_COLOR[s.role] ?? "#64748B") + "20" }]}>
                  <ThemedText type="small" style={{ color: ROLE_COLOR[s.role] ?? "#64748B", fontWeight: "700" }}>{s.role}</ThemedText>
                </View>
              </View>
              <View style={styles.cardActions}>
                <Pressable style={styles.actionBtn} onPress={() => openEdit(s)}>
                  <Feather name="edit-2" size={16} color={BrandColors.primary} />
                  <ThemedText type="small" style={{ color: BrandColors.primary }}>Editar</ThemedText>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => handleDelete(s)}>
                  <Feather name="trash-2" size={16} color="#EF4444" />
                  <ThemedText type="small" style={{ color: "#EF4444" }}>Eliminar</ThemedText>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Pressable style={styles.fab} onPress={openCreate}>
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">{editing ? "Editar Staff" : "Novo Staff"}</ThemedText>
              <Pressable onPress={() => setModalOpen(false)}><Feather name="x" size={22} color={theme.textSecondary} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: Spacing.md, padding: Spacing.lg }}>
              {([["Primeiro Nome *", firstName, setFirstName], ["Apelido", lastName, setLastName]] as [string, string, (t: string) => void][]).map(([label, value, set]) => (
                <View key={label}>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>{label}</ThemedText>
                  <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                    value={value} onChangeText={set} placeholderTextColor={theme.textSecondary} />
                </View>
              ))}
              {!editing && (
                <View>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>PIN</ThemedText>
                  <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                    value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" placeholderTextColor={theme.textSecondary} />
                </View>
              )}
              <View>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>Função</ThemedText>
                <View style={{ flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" }}>
                  {ROLES.map((r) => (
                    <Pressable key={r} style={[styles.chip, { backgroundColor: role === r ? BrandColors.primary : theme.cardBackground, borderColor: role === r ? BrandColors.primary : theme.border }]}
                      onPress={() => setRole(r)}>
                      <ThemedText type="small" style={{ color: role === r ? "#fff" : theme.text, fontWeight: "700" }}>{r}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
              {!editing && (
                <View>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: 4 }}>Condo ID</ThemedText>
                  <TextInput style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                    value={condoId} onChangeText={setCondoId} keyboardType="number-pad" placeholderTextColor={theme.textSecondary} />
                </View>
              )}
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
  backBtn: { marginRight: Spacing.md },
  refreshBtn: { marginLeft: "auto" as never },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing["3xl"] },
  searchRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, margin: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.xs, borderWidth: 1 },
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  cardMain: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 99 },
  cardActions: { flexDirection: "row", gap: Spacing.md, borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingTop: Spacing.sm },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  fab: { position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: BrandColors.primary, justifyContent: "center", alignItems: "center", elevation: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg },
  input: { borderWidth: 1, borderRadius: BorderRadius.xs, padding: Spacing.md, fontSize: 15 },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: 99, borderWidth: 1 },
  saveBtn: { backgroundColor: BrandColors.primary, padding: Spacing.lg, borderRadius: BorderRadius.sm, alignItems: "center", marginTop: Spacing.md },
});
