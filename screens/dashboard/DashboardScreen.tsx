import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useNetInfo } from "@/hooks/useNetInfo";
import { api } from "@/services/dataService";
import { logger, LogCategory } from "@/services/logger";
import {
  BrandColors,
  StatusColors,
  Spacing,
  BorderRadius,
  Shadows,
} from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/contexts/ToastContext";
import { scheduleVisitApprovalNotification } from "@/services/pushNotifications";
import { askConcierge } from "@/services/geminiService";
import type { Visit, Incident } from "@/types";
import { VisitStatus, ApprovalMode } from "@/types";

export default function DashboardScreen() {
  const { theme } = useTheme();
  const { staff } = useAuth();
  const { isOnline } = useNetInfo();
  const { showToast } = useToast();

  const [visits, setVisits] = useState<Visit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const visitsRef = useRef<Visit[]>([]);
  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [conciergeQuery, setConciergeQuery] = useState("");
  const [conciergeAnswer, setConciergeAnswer] = useState("");
  const [conciergeLoading, setConciergeLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [v, i] = await Promise.all([
        api.getTodaysVisits(),
        api.getOpenIncidents(),
      ]);
      visitsRef.current = v;
      setVisits(v);
      setIncidents(i);
    } catch (error) {
      logger.warn(LogCategory.UI, "DashboardScreen: loadData failed", {
        error: String(error),
      });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime: detect visit approval/denial from Resident App
  useEffect(() => {
    if (!supabase || !staff?.condominium_id) return;
    const rt = supabase as any;
    const channel = rt
      .channel("dashboard-visit-approvals")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "visits",
          filter: `condominium_id=eq.${staff.condominium_id}`,
        },
        (payload: {
          new: {
            id: number;
            visitor_name?: string;
            status: string;
            approval_mode?: string;
          };
        }) => {
          const updated = payload.new;
          if (updated.approval_mode !== ApprovalMode.APP) return;
          const prev = visitsRef.current.find((v) => v.id === updated.id);
          const wasApprovalPending =
            !prev || prev.status === VisitStatus.PENDING;
          if (!wasApprovalPending) return;
          const name = updated.visitor_name ?? "Visitante";
          if (updated.status === VisitStatus.APPROVED) {
            showToast(`${name} foi autorizado(a) pelo morador`, "success");
            scheduleVisitApprovalNotification(name, true).catch(() => {});
          } else if (updated.status === VisitStatus.DENIED) {
            showToast(`${name} foi negado(a) pelo morador`, "error");
            scheduleVisitApprovalNotification(name, false).catch(() => {});
          }
          loadData();
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [staff?.condominium_id, loadData, showToast]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }, [loadData]);

  const insideCount = visits.filter(
    (v) => v.status === VisitStatus.INSIDE,
  ).length;
  const pendingCount = visits.filter(
    (v) => v.status === VisitStatus.PENDING,
  ).length;
  const openIncidents = incidents.filter((i) => i.status !== "resolved").length;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  const handleAskConcierge = async () => {
    if (!conciergeQuery.trim() || conciergeLoading) return;
    setConciergeLoading(true);
    setConciergeAnswer("");
    const context = [
      `Condomínio ID: ${staff?.condominium_id ?? "—"}`,
      `Guarda: ${staff?.first_name} ${staff?.last_name}`,
      `Visitas hoje: ${visits.length} (${insideCount} no interior, ${pendingCount} pendentes)`,
      `Incidentes abertos: ${openIncidents}`,
    ].join("\n");
    const answer = await askConcierge(conciergeQuery.trim(), context);
    setConciergeAnswer(answer);
    setConciergeLoading(false);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={BrandColors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText type="h2">
              {greeting()}, {staff?.first_name ?? "Guarda"}
            </ThemedText>
            <ThemedText style={{ color: theme.textSecondary }}>
              {new Date().toLocaleDateString("pt-PT", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </ThemedText>
          </View>
          <View style={styles.headerActions}>
            {!isOnline && (
              <View
                style={[
                  styles.offlineBadge,
                  { backgroundColor: StatusColors.warning + "20" },
                ]}
              >
                <Feather
                  name="wifi-off"
                  size={14}
                  color={StatusColors.warning}
                />
                <ThemedText
                  type="caption"
                  style={{ color: StatusColors.warning }}
                >
                  Offline
                </ThemedText>
              </View>
            )}
            <Pressable
              onPress={() => {
                setConciergeOpen(true);
                setConciergeQuery("");
                setConciergeAnswer("");
              }}
              style={[
                styles.conciergeBtn,
                { backgroundColor: BrandColors.primary + "15" },
              ]}
            >
              <Feather
                name="message-circle"
                size={18}
                color={BrandColors.primary}
              />
              <ThemedText
                type="small"
                style={{ color: BrandColors.primary, fontWeight: "700" }}
              >
                Concierge IA
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard
            icon="users"
            label="No Interior"
            value={insideCount}
            color={BrandColors.primary}
            theme={theme}
          />
          <StatCard
            icon="clock"
            label="Pendentes"
            value={pendingCount}
            color={StatusColors.warning}
            theme={theme}
          />
          <StatCard
            icon="alert-triangle"
            label="Ocorrências"
            value={openIncidents}
            color={StatusColors.danger}
            theme={theme}
          />
        </View>

        {/* Recent Visits */}
        <View style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Últimas Entradas
          </ThemedText>
          {visits.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: theme.cardBackground },
              ]}
            >
              <Feather name="inbox" size={32} color={theme.textSecondary} />
              <ThemedText style={{ color: theme.textSecondary }}>
                Sem entradas hoje
              </ThemedText>
            </View>
          ) : (
            visits
              .slice(0, 5)
              .map((visit) => (
                <VisitRow key={visit.id} visit={visit} theme={theme} />
              ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={conciergeOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setConciergeOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.conciergeOverlay}
        >
          <View
            style={[
              styles.conciergeSheet,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <View style={styles.conciergeHeader}>
              <Feather
                name="message-circle"
                size={20}
                color={BrandColors.primary}
              />
              <ThemedText type="h3" style={{ flex: 1 }}>
                Concierge IA
              </ThemedText>
              <Pressable onPress={() => setConciergeOpen(false)}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.conciergeBody}
              contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
              keyboardShouldPersistTaps="handled"
            >
              {conciergeAnswer ? (
                <ThemedText type="body">{conciergeAnswer}</ThemedText>
              ) : (
                !conciergeLoading && (
                  <ThemedText
                    type="body"
                    style={{ color: theme.textSecondary }}
                  >
                    Faça uma pergunta sobre visitantes, procedimentos ou o
                    estado do condomínio.
                  </ThemedText>
                )
              )}
              {conciergeLoading && (
                <ActivityIndicator
                  color={BrandColors.primary}
                  style={{ marginTop: Spacing.md }}
                />
              )}
            </ScrollView>

            <View
              style={[
                styles.conciergeInputRow,
                { borderTopColor: theme.border },
              ]}
            >
              <TextInput
                style={[
                  styles.conciergeInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundSecondary,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Faça uma pergunta..."
                placeholderTextColor={theme.textSecondary}
                value={conciergeQuery}
                onChangeText={setConciergeQuery}
                onSubmitEditing={handleAskConcierge}
                returnKeyType="send"
                multiline={false}
              />
              <Pressable
                onPress={handleAskConcierge}
                disabled={conciergeLoading || !conciergeQuery.trim()}
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: BrandColors.primary,
                    opacity:
                      conciergeLoading || !conciergeQuery.trim() ? 0.4 : 1,
                  },
                ]}
              >
                <Feather name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  theme,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: number;
  color: string;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: theme.cardBackground, ...Shadows.medium },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <ThemedText type="h2" style={{ color }}>
        {value}
      </ThemedText>
      <ThemedText
        type="caption"
        style={{ color: theme.textSecondary, textAlign: "center" }}
      >
        {label}
      </ThemedText>
    </View>
  );
}

function VisitRow({
  visit,
  theme,
}: {
  visit: Visit;
  theme: ReturnType<typeof useTheme>["theme"];
}) {
  const statusColor: Record<string, string> = {
    PENDENTE: StatusColors.warning,
    AUTORIZADO: StatusColors.success,
    NEGADO: StatusColors.danger,
    "NO INTERIOR": BrandColors.primary,
    SAIU: StatusColors.neutral,
  };
  const color = statusColor[visit.status] ?? StatusColors.neutral;

  return (
    <View style={[styles.visitRow, { backgroundColor: theme.cardBackground }]}>
      <View style={[styles.visitStatus, { backgroundColor: color }]} />
      <View style={styles.visitInfo}>
        <ThemedText type="h4">{visit.visitor_name}</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {visit.unit_block
            ? `${visit.unit_block} ${visit.unit_number}`
            : (visit.visit_type ?? "—")}{" "}
          ·{" "}
          {new Date(visit.check_in_at).toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </ThemedText>
      </View>
      <ThemedText type="caption" style={{ color }}>
        {visit.status}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: Spacing.xl, paddingBottom: Spacing["4xl"] },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing["2xl"],
  },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  statCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  section: { gap: Spacing.md },
  sectionTitle: { marginBottom: Spacing.sm },
  emptyCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing["3xl"],
    alignItems: "center",
    gap: Spacing.md,
  },
  visitRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  visitStatus: { width: 4, height: 40, borderRadius: 2 },
  visitInfo: { flex: 1, gap: 2 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  conciergeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  conciergeOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  conciergeSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
    ...Shadows.large,
  },
  conciergeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  conciergeBody: { flexGrow: 0 },
  conciergeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
  },
  conciergeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
});
