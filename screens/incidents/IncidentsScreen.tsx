import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/dataService";
import { supabase } from "@/lib/supabase";
import { audioService } from "@/services/audioService";
import { logger, LogCategory } from "@/services/logger";
import {
  BrandColors,
  StatusColors,
  Spacing,
  BorderRadius,
} from "@/constants/theme";
import type { Incident } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<
  string,
  { border: string; bg: string; badge: string; badgeText: string }
> = {
  perigo: {
    border: StatusColors.danger,
    bg: "#FEF2F2",
    badge: "#FEE2E2",
    badgeText: "#991B1B",
  },
  incendio: {
    border: StatusColors.warning,
    bg: "#FFF7ED",
    badge: "#FED7AA",
    badgeText: "#9A3412",
  },
  suspeita: {
    border: StatusColors.warning,
    bg: "#FEFCE8",
    badge: "#FEF08A",
    badgeText: "#713F12",
  },
};

const STATUS_LABELS: Record<string, string> = {
  new: "NOVO",
  acknowledged: "VISTO",
  inprogress: "EM PROGRESSO",
  resolved: "RESOLVIDO",
};

const STATUS_COLORS_MAP: Record<string, { bg: string; text: string }> = {
  new: { bg: "#DBEAFE", text: "#1E40AF" },
  acknowledged: { bg: "#D1FAE5", text: "#065F46" },
  inprogress: { bg: "#FEF3C7", text: "#92400E" },
  resolved: { bg: "#D1FAE5", text: "#065F46" },
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function IncidentsScreen() {
  const { theme } = useTheme();
  const { staff } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState(false);
  const knownIds = useRef<Set<string>>(new Set());

  // Action modal
  const [actionModal, setActionModal] = useState<{
    visible: boolean;
    incident: Incident | null;
    notes: string;
    status: "inprogress" | "resolved";
    submitting: boolean;
  }>({
    visible: false,
    incident: null,
    notes: "",
    status: "resolved",
    submitting: false,
  });

  const loadIncidents = useCallback(async () => {
    try {
      const data = await api.getIncidents();
      const newIds = data.map((i) => String(i.id));
      const hasNew = newIds.some((id) => !knownIds.current.has(id));

      if (hasNew && knownIds.current.size > 0) {
        logger.info(LogCategory.SYNC, "New incident detected");
        audioService.triggerIncidentAlert();
        setNewAlert(true);
        setTimeout(() => setNewAlert(false), 10_000);
      }

      knownIds.current = new Set(newIds);
      setIncidents(data);
    } catch (err) {
      logger.error(LogCategory.SYNC, "loadIncidents failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIncidents();

    if (!supabase || !staff?.condominium_id) return;

    const condoId = staff.condominium_id;
    const rt = supabase as any;
    const channel = rt
      .channel("guard-incidents")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incidents" },
        async (payload: { new: { resident_id?: number } }) => {
          logger.info(LogCategory.SYNC, "Incident INSERT via realtime");
          const raw = payload.new;
          if (raw.resident_id) {
            try {
              const resident = await api.getResidentById(raw.resident_id);
              if (!resident || resident.condominium_id === condoId) {
                audioService.triggerIncidentAlert();
                setNewAlert(true);
                setTimeout(() => setNewAlert(false), 10_000);
                loadIncidents();
              }
            } catch (realtimeErr) {
              logger.warn(
                LogCategory.REALTIME,
                "IncidentsScreen: resident check failed",
                { error: String(realtimeErr) },
              );
              audioService.triggerIncidentAlert();
              setNewAlert(true);
              setTimeout(() => setNewAlert(false), 10_000);
              loadIncidents();
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "incidents" },
        () => {
          loadIncidents();
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [loadIncidents, staff?.condominium_id]);

  const handleAcknowledge = async (incident: Incident) => {
    if (!staff) return;
    try {
      await api.acknowledgeIncident(String(incident.id), staff.id);
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "IncidentsScreen: acknowledgeIncident failed",
        error,
      );
      Alert.alert("Erro", "Não foi possível confirmar a leitura do incidente.");
    }
  };

  const openActionModal = (incident: Incident) => {
    setActionModal({
      visible: true,
      incident,
      notes: "",
      status: "resolved",
      submitting: false,
    });
  };

  const submitAction = async () => {
    if (!actionModal.incident) return;
    if (!actionModal.notes.trim()) {
      Alert.alert("Atenção", "Por favor, descreva a ação tomada.");
      return;
    }
    setActionModal((s) => ({ ...s, submitting: true }));
    try {
      await api.reportIncidentAction(
        String(actionModal.incident.id),
        actionModal.notes,
        actionModal.status,
      );
      setActionModal((s) => ({ ...s, visible: false, submitting: false }));
    } catch (error) {
      logger.error(
        LogCategory.UI,
        "IncidentsScreen: reportIncidentAction failed",
        error,
      );
      Alert.alert("Erro", "Não foi possível submeter a ação.");
      setActionModal((s) => ({ ...s, submitting: false }));
    }
  };

  const renderItem = ({ item: inc }: { item: Incident }) => {
    const typeStyle = TYPE_COLORS[inc.type] ?? TYPE_COLORS.suspeita;
    const statusStyle = STATUS_COLORS_MAP[inc.status] ?? {
      bg: "#F1F5F9",
      text: "#475569",
    };

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: typeStyle.bg, borderLeftColor: typeStyle.border },
        ]}
      >
        {/* Header */}
        <View style={styles.incidentHeader}>
          <Feather
            name={
              inc.type === "perigo" || inc.type === "incendio"
                ? "alert-triangle"
                : "alert-circle"
            }
            size={20}
            color={typeStyle.border}
          />
          <ThemedText type="h4" style={{ flex: 1 }}>
            {inc.type_label || inc.type}
          </ThemedText>
          <View style={[styles.badge, { backgroundColor: typeStyle.badge }]}>
            <ThemedText
              style={[styles.badgeText, { color: typeStyle.badgeText }]}
            >
              {inc.type_label || inc.type}
            </ThemedText>
          </View>
          <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
            <ThemedText style={[styles.badgeText, { color: statusStyle.text }]}>
              {STATUS_LABELS[inc.status] || inc.status}
            </ThemedText>
          </View>
        </View>

        <ThemedText type="body" style={{ marginTop: Spacing.xs }}>
          {inc.description}
        </ThemedText>

        {inc.resident && (
          <ThemedText
            type="small"
            style={{ color: theme.textSecondary, marginTop: Spacing.xs }}
          >
            Reportado por: {inc.resident.name}
            {inc.unit
              ? `  •  ${inc.unit.code_block ? `${inc.unit.code_block} - ` : ""}Apt ${inc.unit.number}`
              : ""}
          </ThemedText>
        )}

        {/* Guard action history */}
        {Array.isArray(inc.action_history) && inc.action_history.length > 0 && (
          <View
            style={[
              styles.actionHistory,
              { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
            ]}
          >
            <ThemedText
              type="small"
              style={{ color: "#1E40AF", fontWeight: "700", marginBottom: 4 }}
            >
              Ação do Guarda:
            </ThemedText>
            {(
              inc.action_history as {
                note?: string;
                created_at?: string;
                action_type?: string;
              }[]
            ).map((entry, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                {entry.note && (
                  <ThemedText type="small" style={{ color: "#1E3A8A" }}>
                    {entry.note}
                  </ThemedText>
                )}
                {entry.created_at && (
                  <ThemedText
                    type="small"
                    style={{ color: "#64748B", fontSize: 11 }}
                  >
                    {new Date(entry.created_at).toLocaleString("pt-PT")}
                  </ThemedText>
                )}
              </View>
            ))}
          </View>
        )}

        <ThemedText
          type="small"
          style={{ color: theme.textSecondary, marginTop: Spacing.xs }}
        >
          Reportado: {new Date(inc.reported_at).toLocaleString("pt-PT")}
        </ThemedText>

        {/* Action buttons */}
        <View style={styles.cardActions}>
          {inc.status === "new" && (
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: BrandColors.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              onPress={() => handleAcknowledge(inc)}
            >
              <Feather name="check-square" size={16} color="#fff" />
              <ThemedText style={styles.btnText}>Confirmar Leitura</ThemedText>
            </Pressable>
          )}
          {(inc.status === "acknowledged" || inc.status === "inprogress") && (
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: StatusColors.success,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              onPress={() => openActionModal(inc)}
            >
              <Feather name="file-text" size={16} color="#fff" />
              <ThemedText style={styles.btnText}>
                {inc.status === "inprogress"
                  ? "Fechar Incidente"
                  : "Reportar Ação"}
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* New incident banner */}
      {newAlert && (
        <View style={styles.alertBanner}>
          <Feather name="alert-triangle" size={24} color="#fff" />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
              🚨 NOVO INCIDENTE REPORTADO!
            </ThemedText>
            <ThemedText type="small" style={{ color: "#FCA5A5" }}>
              Verifique os detalhes abaixo
            </ThemedText>
          </View>
          <Pressable onPress={() => setNewAlert(false)}>
            <Feather name="x" size={20} color="#fff" />
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={false}
          onRefresh={loadIncidents}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="shield" size={48} color={theme.textSecondary} />
              <ThemedText
                style={{ color: theme.textSecondary, marginTop: Spacing.md }}
              >
                Não há incidentes registados.
              </ThemedText>
            </View>
          }
        />
      )}

      {/* Action Modal */}
      <Modal
        visible={actionModal.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setActionModal((s) => ({ ...s, visible: false }))}
      >
        <View style={styles.overlay}>
          <View
            style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}
          >
            <View style={styles.sheetHeader}>
              <ThemedText type="h3">Reportar Ação do Guarda</ThemedText>
              <Pressable
                onPress={() =>
                  setActionModal((s) => ({ ...s, visible: false }))
                }
              >
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            {actionModal.incident && (
              <View
                style={[
                  styles.incidentSummary,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
              >
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Incidente:{" "}
                  {actionModal.incident.type_label || actionModal.incident.type}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{ color: theme.textSecondary }}
                  numberOfLines={2}
                >
                  {actionModal.incident.description}
                </ThemedText>
              </View>
            )}

            <ThemedText
              type="small"
              style={[styles.label, { color: theme.textSecondary }]}
            >
              Estado Final:
            </ThemedText>
            <View style={styles.radioRow}>
              {(["inprogress", "resolved"] as const).map((s) => (
                <Pressable
                  key={s}
                  style={[
                    styles.radioBtn,
                    actionModal.status === s && {
                      borderColor: BrandColors.primary,
                    },
                  ]}
                  onPress={() => setActionModal((m) => ({ ...m, status: s }))}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      actionModal.status === s && {
                        backgroundColor: BrandColors.primary,
                      },
                    ]}
                  />
                  <ThemedText type="small">
                    {s === "inprogress" ? "Em Progresso" : "Resolvido"}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <ThemedText
              type="small"
              style={[styles.label, { color: theme.textSecondary }]}
            >
              Descreva a ação tomada: *
            </ThemedText>
            <TextInput
              style={[
                styles.textarea,
                {
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              multiline
              numberOfLines={4}
              placeholder="Ex: Contactei o residente por telefone..."
              placeholderTextColor={theme.textSecondary}
              value={actionModal.notes}
              onChangeText={(t) => setActionModal((s) => ({ ...s, notes: t }))}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[
                  styles.btn,
                  { flex: 1, backgroundColor: theme.backgroundSecondary },
                ]}
                onPress={() =>
                  setActionModal((s) => ({ ...s, visible: false }))
                }
              >
                <ThemedText style={{ fontWeight: "700" }}>Cancelar</ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  {
                    flex: 1,
                    backgroundColor: StatusColors.success,
                    opacity: actionModal.submitting ? 0.6 : 1,
                  },
                ]}
                onPress={submitAction}
                disabled={actionModal.submitting}
              >
                {actionModal.submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText style={styles.btnText}>Submeter</ThemedText>
                )}
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
  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing["3xl"],
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: StatusColors.danger,
    padding: Spacing.lg,
    margin: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderLeftWidth: 6,
  },
  incidentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  actionHistory: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  cardActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xs,
    flex: 1,
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  incidentSummary: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  label: { fontWeight: "600", marginTop: Spacing.sm },
  radioRow: { flexDirection: "row", gap: Spacing.md },
  radioBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: BorderRadius.xs,
    padding: Spacing.sm,
    flex: 1,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: BrandColors.primary,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
});
