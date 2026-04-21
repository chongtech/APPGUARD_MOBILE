import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/services/dataService";
import { logger, LogCategory } from "@/services/logger";
import {
  BrandColors,
  Spacing,
  BorderRadius,
  StatusColors,
} from "@/constants/theme";
import type { AdminStackParamList } from "@/navigation/AdminStackNavigator";
import type { Resident, ResidentQrCode } from "@/types";

type Nav = NativeStackNavigationProp<AdminStackParamList>;
type AppFilter = "ALL" | "WITH_APP" | "WITHOUT_APP";

function parseCSV(text: string): {
  name: string;
  email?: string;
  phone?: string;
  unit_id?: number;
  condominium_id?: number;
}[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).flatMap((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    if (!row.name) return [];
    return [
      {
        name: row.name,
        email: row.email || undefined,
        phone: row.phone || undefined,
        unit_id: row.unit_id ? Number(row.unit_id) : undefined,
        condominium_id: row.condominium_id
          ? Number(row.condominium_id)
          : undefined,
      },
    ];
  });
}

export default function AdminResidents() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appFilter, setAppFilter] = useState<AppFilter>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resident | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [unitId, setUnitId] = useState("");
  const [condoId, setCondoId] = useState("");
  const [qrResident, setQrResident] = useState<Resident | null>(null);
  const [qrCodes, setQrCodes] = useState<ResidentQrCode[]>([]);
  const [qrLoading, setQrLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.adminGetAllResidents());
    } catch (loadError) {
      logger.warn(LogCategory.UI, "AdminResidents: load failed", {
        error: String(loadError),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = items;
    if (appFilter === "WITH_APP")
      list = list.filter((r) => r.has_app_installed === true);
    else if (appFilter === "WITHOUT_APP")
      list = list.filter((r) => r.has_app_installed !== true);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, search, appFilter]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setEmail("");
    setPhone("");
    setUnitId("");
    setCondoId("");
    setModalOpen(true);
  };
  const openEdit = (r: Resident) => {
    setEditing(r);
    setName(r.name);
    setEmail(r.email ?? "");
    setPhone(r.phone ?? "");
    setUnitId(r.unit_id ? String(r.unit_id) : "");
    setCondoId(String(r.condominium_id));
    setModalOpen(true);
  };

  const openQr = async (r: Resident) => {
    setQrResident(r);
    setQrLoading(true);
    try {
      setQrCodes(await api.adminGetResidentQrCodes(r.id));
    } catch {
      setQrCodes([]);
    } finally {
      setQrLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert("Erro", "Nome obrigatório.");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        unit_id: unitId ? Number(unitId) : undefined,
        condominium_id: condoId ? Number(condoId) : undefined,
      };
      if (editing) await api.adminUpdateResident(editing.id, payload);
      else await api.adminCreateResident(payload);
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      logger.error(
        LogCategory.UI,
        "AdminResidents: save failed",
        e instanceof Error ? e : new Error(String(e)),
      );
      Alert.alert("Erro", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (r: Resident) => {
    Alert.alert("Eliminar Morador", `Eliminar "${r.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          await api.adminDeleteResident(r.id);
          load();
        },
      },
    ]);
  };

  const handleImportCSV = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "text/csv" });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setImporting(true);
    try {
      const text = await FileSystem.readAsStringAsync(uri);
      const rows = parseCSV(text);
      if (rows.length === 0)
        return Alert.alert(
          "Erro",
          "Ficheiro CSV vazio ou inválido. Colunas esperadas: name, email, phone, unit_id, condominium_id",
        );
      Alert.alert("Importar CSV", `Importar ${rows.length} morador(es)?`, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Importar",
          onPress: async () => {
            let ok = 0;
            for (const row of rows) {
              try {
                await api.adminCreateResident(row);
                ok++;
              } catch {
                /* skip invalid rows */
              }
            }
            Alert.alert(
              "Concluído",
              `${ok} de ${rows.length} moradores importados.`,
            );
            load();
          },
        },
      ]);
    } catch (e) {
      Alert.alert("Erro", "Não foi possível ler o ficheiro.");
    } finally {
      setImporting(false);
    }
  };

  const appFilterCounts = useMemo(
    () => ({
      ALL: items.length,
      WITH_APP: items.filter((r) => r.has_app_installed === true).length,
      WITHOUT_APP: items.filter((r) => r.has_app_installed !== true).length,
    }),
    [items],
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
        <ThemedText type="h3">Moradores</ThemedText>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleImportCSV}
            style={styles.headerBtn}
            disabled={importing}
          >
            {importing ? (
              <ActivityIndicator size="small" color={BrandColors.primary} />
            ) : (
              <Feather name="upload" size={18} color={BrandColors.primary} />
            )}
          </Pressable>
          <Pressable onPress={load} style={styles.headerBtn}>
            <Feather name="refresh-cw" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
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
          placeholder="Pesquisar..."
          placeholderTextColor={theme.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* App status filter chips */}
      <View style={styles.filterRow}>
        {(["ALL", "WITH_APP", "WITHOUT_APP"] as AppFilter[]).map((f) => {
          const labels: Record<AppFilter, string> = {
            ALL: "Todos",
            WITH_APP: "Com App",
            WITHOUT_APP: "Sem App",
          };
          const active = appFilter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setAppFilter(f)}
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
                {labels[f]} ({appFilterCounts[f]})
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
          data={filtered}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          ListEmptyComponent={
            <View style={styles.center}>
              <ThemedText style={{ color: theme.textSecondary }}>
                Sem moradores
              </ThemedText>
            </View>
          }
          renderItem={({ item: r }) => (
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
                <View style={[styles.avatar, { backgroundColor: "#10B98120" }]}>
                  <ThemedText style={{ fontWeight: "800", color: "#10B981" }}>
                    {r.name.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: Spacing.xs,
                    }}
                  >
                    <ThemedText type="h4">{r.name}</ThemedText>
                    {r.has_app_installed && (
                      <View style={styles.appBadge}>
                        <ThemedText
                          style={{
                            color: "#065F46",
                            fontSize: 10,
                            fontWeight: "700",
                          }}
                        >
                          APP
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  {r.email && (
                    <ThemedText
                      type="small"
                      style={{ color: theme.textSecondary }}
                    >
                      {r.email}
                    </ThemedText>
                  )}
                  {r.phone && (
                    <ThemedText
                      type="small"
                      style={{ color: theme.textSecondary }}
                    >
                      {r.phone}
                    </ThemedText>
                  )}
                  {r.unit_id && (
                    <ThemedText
                      type="small"
                      style={{ color: theme.textSecondary }}
                    >
                      Unidade #{r.unit_id}
                    </ThemedText>
                  )}
                </View>
                <Pressable onPress={() => openQr(r)} style={styles.iconBtn}>
                  <Feather name="grid" size={16} color={theme.textSecondary} />
                </Pressable>
                <Pressable onPress={() => openEdit(r)} style={styles.iconBtn}>
                  <Feather
                    name="edit-2"
                    size={16}
                    color={BrandColors.primary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(r)}
                  style={styles.iconBtn}
                >
                  <Feather
                    name="trash-2"
                    size={16}
                    color={StatusColors.danger}
                  />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Pressable style={styles.fab} onPress={openCreate}>
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>

      {/* Create/Edit modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.overlay}>
          <View
            style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}
          >
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">
                {editing ? "Editar Morador" : "Novo Morador"}
              </ThemedText>
              <Pressable onPress={() => setModalOpen(false)}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ gap: Spacing.md, padding: Spacing.lg }}
            >
              {(
                [
                  ["Nome *", name, setName, "default"],
                  ["Email", email, setEmail, "email-address"],
                  ["Telefone", phone, setPhone, "phone-pad"],
                  ["Unidade ID", unitId, setUnitId, "number-pad"],
                  ...(!editing
                    ? [["Condo ID *", condoId, setCondoId, "number-pad"]]
                    : []),
                ] as [string, string, (t: string) => void, string][]
              ).map(([label, value, set, kb]) => (
                <View key={label}>
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary, marginBottom: 4 }}
                  >
                    {label}
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: theme.border,
                        color: theme.text,
                        backgroundColor: theme.backgroundSecondary,
                      },
                    ]}
                    value={value}
                    onChangeText={set}
                    keyboardType={kb as never}
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
              ))}
              <Pressable
                style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                    Guardar
                  </ThemedText>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* QR codes viewer modal */}
      <Modal
        visible={!!qrResident}
        animationType="slide"
        transparent
        onRequestClose={() => setQrResident(null)}
      >
        <View style={styles.overlay}>
          <View
            style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}
          >
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">QR Codes — {qrResident?.name}</ThemedText>
              <Pressable onPress={() => setQrResident(null)}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            {qrLoading ? (
              <View style={[styles.center, { minHeight: 120 }]}>
                <ActivityIndicator color={BrandColors.primary} />
              </View>
            ) : qrCodes.length === 0 ? (
              <View style={[styles.center, { minHeight: 120 }]}>
                <Feather name="grid" size={36} color={theme.textSecondary} />
                <ThemedText
                  style={{ color: theme.textSecondary, marginTop: Spacing.sm }}
                >
                  Sem QR codes
                </ThemedText>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
              >
                {qrCodes.map((qr) => (
                  <View
                    key={qr.id}
                    style={[
                      styles.qrCard,
                      {
                        backgroundColor: theme.backgroundSecondary,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <ThemedText type="small" style={{ fontWeight: "700" }}>
                        {qr.purpose ?? "QR Code"}
                      </ThemedText>
                      <View
                        style={[
                          styles.chip,
                          {
                            backgroundColor:
                              qr.status === "ACTIVE" ? "#D1FAE5" : "#F3F4F6",
                            borderColor: "transparent",
                          },
                        ]}
                      >
                        <ThemedText
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color:
                              qr.status === "ACTIVE" ? "#065F46" : "#6B7280",
                          }}
                        >
                          {qr.status ?? "—"}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText
                      type="small"
                      style={{
                        color: theme.textSecondary,
                        fontFamily: "monospace",
                      }}
                      numberOfLines={2}
                    >
                      {qr.qr_code}
                    </ThemedText>
                    {qr.expires_at && (
                      <ThemedText
                        type="small"
                        style={{ color: theme.textSecondary }}
                      >
                        Expira:{" "}
                        {new Date(qr.expires_at).toLocaleDateString("pt-PT")}
                      </ThemedText>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  headerActions: {
    marginLeft: "auto" as never,
    flexDirection: "row",
    gap: Spacing.sm,
  },
  headerBtn: { padding: 4 },
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
  card: { borderRadius: BorderRadius.md, borderWidth: 1, padding: Spacing.lg },
  cardRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  appBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
  },
  iconBtn: { padding: 4 },
  fab: {
    position: "absolute",
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BrandColors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: BrandColors.primary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  qrCard: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
});
