import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View, StyleSheet, TextInput, FlatList, Pressable,
  Modal, ActivityIndicator, Alert, Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/dataService";
import { shareVisitReceipt } from "@/services/pdfService";
import { BrandColors, StatusColors, Spacing, BorderRadius } from "@/constants/theme";
import type { Visit, VisitEvent } from "@/types";
import { VisitStatus, SyncStatus } from "@/types";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  [VisitStatus.PENDING]:  { bg: "#FEF3C7", text: "#92400E" },
  [VisitStatus.APPROVED]: { bg: "#D1FAE5", text: "#065F46" },
  [VisitStatus.INSIDE]:   { bg: "#DBEAFE", text: "#1E40AF" },
  [VisitStatus.LEFT]:     { bg: "#F1F5F9", text: "#475569" },
  [VisitStatus.DENIED]:   { bg: "#FEE2E2", text: "#991B1B" },
};

function StatusBadge({ status }: { status: VisitStatus }) {
  const c = STATUS_COLORS[status] ?? { bg: "#F1F5F9", text: "#475569" };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <ThemedText style={[styles.badgeText, { color: c.text }]}>{status}</ThemedText>
    </View>
  );
}

export default function DailyListScreen() {
  const { theme } = useTheme();
  const { staff } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [historyModal, setHistoryModal] = useState<{
    visible: boolean;
    visit: Visit | null;
    events: VisitEvent[];
    loading: boolean;
  }>({ visible: false, visit: null, events: [], loading: false });

  const loadVisits = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    const data = await api.getTodaysVisits();
    setVisits(data.sort((a, b) => new Date(b.check_in_at).getTime() - new Date(a.check_in_at).getTime()));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadVisits();
    const interval = setInterval(() => loadVisits(true), 30_000);
    return () => clearInterval(interval);
  }, [loadVisits]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return visits;
    const digits = term.replace(/\D/g, "");
    return visits.filter(
      (v) =>
        v.visitor_name.toLowerCase().includes(term) ||
        (digits && v.visitor_phone?.replace(/\D/g, "").includes(digits))
    );
  }, [visits, searchTerm]);

  const handleCheckout = (visit: Visit) => {
    Alert.alert("Confirmar saída?", `Registar saída de ${visit.visitor_name}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Saída", style: "destructive",
        onPress: async () => {
          await api.updateVisitStatus(visit.id, VisitStatus.LEFT, staff!.id);
          loadVisits(true);
        },
      },
    ]);
  };

  const handleCall = (visit: Visit) => {
    if (!visit.visitor_phone) return;
    Alert.alert(`Ligar para ${visit.visitor_phone}?`, "", [
      { text: "Cancelar", style: "cancel" },
      { text: "Ligar", onPress: () => Linking.openURL(`tel:${visit.visitor_phone}`) },
    ]);
  };

  const openHistory = async (visit: Visit) => {
    setHistoryModal({ visible: true, visit, events: [], loading: true });
    const events = await api.getVisitEvents(visit.id);
    setHistoryModal({ visible: true, visit, events, loading: false });
  };

  const renderItem = ({ item: v }: { item: Visit }) => (
    <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: BrandColors.primary + "20" }]}>
          <ThemedText style={{ fontWeight: "700", fontSize: 18, color: BrandColors.primary }}>
            {v.visitor_name[0]?.toUpperCase()}
          </ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="h4" numberOfLines={1}>{v.visitor_name}</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {new Date(v.check_in_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
            {v.vehicle_license_plate ? `  •  🚗 ${v.vehicle_license_plate}` : ""}
          </ThemedText>
        </View>
        <StatusBadge status={v.status} />
      </View>

      <View style={[styles.cardMeta, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="user" size={13} color={theme.textSecondary} />
        <ThemedText type="small" style={{ color: theme.textSecondary }}>{v.visit_type}</ThemedText>
        <Feather name="map-pin" size={13} color={theme.textSecondary} />
        <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }} numberOfLines={1}>
          {v.restaurant_name || v.sport_name ||
            (v.unit_block && v.unit_number
              ? `${v.unit_block} - ${v.unit_number}`
              : `Unidade ${v.unit_id}`)}
        </ThemedText>
      </View>

      {v.sync_status === SyncStatus.PENDING_SYNC && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Feather name="alert-circle" size={12} color={StatusColors.warning} />
          <ThemedText style={{ color: StatusColors.warning, fontSize: 11, fontWeight: "600" }}>
            Não sincronizado
          </ThemedText>
        </View>
      )}

      <View style={styles.cardActions}>
        {v.status === VisitStatus.PENDING && (
          <Pressable
            style={({ pressed }) => [styles.btn, { backgroundColor: BrandColors.primary, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => handleCall(v)}
          >
            <Feather name="phone" size={15} color="#fff" />
            <ThemedText style={styles.btnText}>Contactar</ThemedText>
          </Pressable>
        )}
        {(v.status === VisitStatus.APPROVED || v.status === VisitStatus.INSIDE) && (
          <Pressable
            style={({ pressed }) => [styles.btn, { backgroundColor: StatusColors.success, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => handleCheckout(v)}
          >
            <Feather name="log-out" size={15} color="#fff" />
            <ThemedText style={styles.btnText}>Saída</ThemedText>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.btn, { borderWidth: 1, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}
          onPress={() => openHistory(v)}
        >
          <Feather name="clock" size={15} color={theme.textSecondary} />
          <ThemedText style={{ color: theme.textSecondary, fontSize: 14, fontWeight: "600" }}>Histórico</ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, { borderWidth: 1, borderColor: theme.border, opacity: pressed ? 0.7 : 1 }]}
          onPress={() => shareVisitReceipt(v).catch(() => Alert.alert("Erro", "Não foi possível gerar o comprovante."))}
        >
          <Feather name="share-2" size={15} color={theme.textSecondary} />
          <ThemedText style={{ color: theme.textSecondary, fontSize: 14, fontWeight: "600" }}>PDF</ThemedText>
        </Pressable>
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.searchRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Feather name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Pesquisar nome ou telefone..."
          placeholderTextColor={theme.textSecondary}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm.length > 0 && (
          <Pressable onPress={() => setSearchTerm("")}>
            <Feather name="x" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      {searchTerm.length > 0 && (
        <ThemedText type="small" style={{ color: theme.textSecondary, marginHorizontal: Spacing.lg, marginBottom: Spacing.xs }}>
          {filtered.length} de {visits.length} visitas
        </ThemedText>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BrandColors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(v) => String(v.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => loadVisits(true)}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="list" size={48} color={theme.textSecondary} />
              <ThemedText style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                {searchTerm ? "Nenhum resultado" : "Nenhuma visita hoje"}
              </ThemedText>
            </View>
          }
        />
      )}

      {/* History Modal */}
      <Modal
        visible={historyModal.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryModal((s) => ({ ...s, visible: false }))}
      >
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.backgroundDefault }]}>
            <View style={[styles.sheetHeader, { backgroundColor: "#0F172A" }]}>
              <View>
                <ThemedText type="h3" style={{ color: "#fff" }}>Histórico da Visita</ThemedText>
                {historyModal.visit && (
                  <ThemedText type="small" style={{ color: "#94A3B8" }}>
                    {historyModal.visit.visitor_name} • {historyModal.visit.visit_type}
                  </ThemedText>
                )}
              </View>
              <Pressable onPress={() => setHistoryModal((s) => ({ ...s, visible: false }))}>
                <Feather name="x" size={24} color="#fff" />
              </Pressable>
            </View>

            {historyModal.loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={BrandColors.primary} />
              </View>
            ) : historyModal.events.length === 0 ? (
              <View style={[styles.center, { padding: Spacing["3xl"] }]}>
                <ThemedText style={{ color: theme.textSecondary }}>Sem eventos registados.</ThemedText>
              </View>
            ) : (
              <FlatList
                data={historyModal.events}
                keyExtractor={(e, i) => `${e.id}-${i}`}
                contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
                renderItem={({ item: ev }) => (
                  <View style={[styles.eventRow, { borderColor: theme.border }]}>
                    <StatusBadge status={ev.status} />
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {new Date(ev.event_at).toLocaleString("pt-PT")}
                    </ThemedText>
                    {ev.actor_name && (
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        Guarda: {ev.actor_name}
                      </ThemedText>
                    )}
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md, padding: Spacing["3xl"] },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    margin: Spacing.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: Spacing.xs },
  card: { borderRadius: BorderRadius.md, padding: Spacing.lg, gap: Spacing.sm },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.sm, borderRadius: BorderRadius.xs, flexWrap: "wrap" },
  cardActions: { flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.xs },
  badgeText: { fontSize: 11, fontWeight: "700" },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.xs, flex: 1, justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { height: "70%", borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg, overflow: "hidden" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg },
  eventRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
});
