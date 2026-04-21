import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Alert, ScrollView } from "react-native";
import * as FileSystem from "expo-file-system";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/dataService";
import {
  BrandColors,
  StatusColors,
  Spacing,
  BorderRadius,
} from "@/constants/theme";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function SettingsScreen() {
  const { theme } = useTheme();
  const { staff, logout } = useAuth();
  const [condoName, setCondoName] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [storageUsed, setStorageUsed] = useState<number | null>(null);
  const [storageTotal, setStorageTotal] = useState<number | null>(null);

  useEffect(() => {
    api
      .getDeviceCondoDetails()
      .then((c) => setCondoName(c?.name ?? null))
      .catch(() => {});
    setDeviceId(api.currentDeviceId);

    FileSystem.getFreeDiskStorageAsync()
      .then((free) => {
        FileSystem.getTotalDiskCapacityAsync()
          .then((total) => {
            setStorageTotal(total);
            setStorageUsed(total - free);
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, []);

  const storagePercent =
    storageTotal && storageUsed != null
      ? Math.round((storageUsed / storageTotal) * 100)
      : null;

  const handleLogout = () => {
    Alert.alert("Terminar Sessão", "Tem a certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: logout },
    ]);
  };

  const handleReset = () => {
    Alert.alert(
      "Redefinir Dispositivo",
      "Esta acção remove toda a configuração local e os dados offline deste tablet. O dispositivo terá de ser configurado novamente. Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Redefinir",
          style: "destructive",
          onPress: async () => {
            try {
              await api.resetDevice();
            } catch {
              Alert.alert("Erro", "Não foi possível redefinir o dispositivo.");
            }
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Staff profile */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: theme.cardBackground },
          ]}
        >
          <View
            style={[
              styles.avatar,
              { backgroundColor: BrandColors.primary + "20" },
            ]}
          >
            <Feather name="user" size={32} color={BrandColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="h3">
              {staff?.first_name} {staff?.last_name}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {staff?.role}
            </ThemedText>
          </View>
        </View>

        {/* Device info */}
        <ThemedText
          type="small"
          style={[styles.sectionLabel, { color: theme.textSecondary }]}
        >
          INFORMAÇÕES DO DISPOSITIVO
        </ThemedText>
        <View
          style={[styles.infoCard, { backgroundColor: theme.cardBackground }]}
        >
          <InfoRow
            icon="home"
            label="Condomínio"
            value={condoName ?? "—"}
            theme={theme}
          />
          <View style={styles.divider} />
          <InfoRow
            icon="cpu"
            label="ID do Dispositivo"
            value={deviceId ?? "—"}
            theme={theme}
            mono
          />
          <View style={styles.divider} />
          <InfoRow
            icon="wifi"
            label="Estado"
            value={api.isOnline ? "Online" : "Offline"}
            theme={theme}
          />
        </View>

        {/* Storage */}
        <ThemedText
          type="small"
          style={[styles.sectionLabel, { color: theme.textSecondary }]}
        >
          ARMAZENAMENTO
        </ThemedText>
        <View
          style={[styles.infoCard, { backgroundColor: theme.cardBackground }]}
        >
          {storageTotal != null && storageUsed != null ? (
            <>
              <View style={styles.storageRow}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {formatBytes(storageUsed)} usados de{" "}
                  {formatBytes(storageTotal)}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{ color: theme.textSecondary, fontWeight: "700" }}
                >
                  {storagePercent}%
                </ThemedText>
              </View>
              <View
                style={[styles.progressBg, { backgroundColor: theme.border }]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${storagePercent}%` as `${number}%`,
                      backgroundColor:
                        (storagePercent ?? 0) > 85
                          ? StatusColors.danger
                          : BrandColors.primary,
                    },
                  ]}
                />
              </View>
            </>
          ) : (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              A calcular armazenamento...
            </ThemedText>
          )}
        </View>

        {/* Actions */}
        <ThemedText
          type="small"
          style={[styles.sectionLabel, { color: theme.textSecondary }]}
        >
          ACÇÕES
        </ThemedText>
        <View
          style={[styles.section, { backgroundColor: theme.cardBackground }]}
        >
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="log-out" size={20} color={StatusColors.danger} />
            <ThemedText style={{ color: StatusColors.danger }}>
              Terminar Sessão
            </ThemedText>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            onPress={handleReset}
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="trash-2" size={20} color={StatusColors.danger} />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ color: StatusColors.danger }}>
                Redefinir Dispositivo
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Remove todos os dados locais
              </ThemedText>
            </View>
          </Pressable>
        </View>

        <ThemedText
          type="caption"
          style={[styles.version, { color: theme.textSecondary }]}
        >
          EntryFlow Guard v1.0.0
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

function InfoRow({
  icon,
  label,
  value,
  theme,
  mono,
}: {
  icon: string;
  label: string;
  value: string;
  theme: any;
  mono?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon as "home"} size={16} color={theme.textSecondary} />
      <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
        {label}
      </ThemedText>
      <ThemedText
        type="small"
        style={{
          color: theme.text,
          fontWeight: "700",
          fontFamily: mono ? "monospace" : undefined,
          maxWidth: "55%",
          textAlign: "right",
        }}
        numberOfLines={1}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl, gap: Spacing.md, paddingTop: Spacing["2xl"] },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionLabel: {
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
    paddingHorizontal: 4,
  },
  infoCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  divider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginVertical: Spacing.xs,
  },
  storageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  section: { borderRadius: BorderRadius.lg, overflow: "hidden" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  version: { textAlign: "center", marginTop: Spacing.xl },
});
