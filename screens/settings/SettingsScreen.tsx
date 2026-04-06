import React from "react";
import { View, StyleSheet, Pressable, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { BrandColors, StatusColors, Spacing, BorderRadius } from "@/constants/theme";

export default function SettingsScreen() {
  const { theme } = useTheme();
  const { staff, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert("Terminar Sessão", "Tem a certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        {/* Staff info */}
        <View style={[styles.profileCard, { backgroundColor: theme.cardBackground }]}>
          <View style={[styles.avatar, { backgroundColor: BrandColors.primary + "20" }]}>
            <Feather name="user" size={32} color={BrandColors.primary} />
          </View>
          <View>
            <ThemedText type="h3">{staff?.first_name} {staff?.last_name}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>{staff?.role}</ThemedText>
          </View>
        </View>

        {/* Actions */}
        <View style={[styles.section, { backgroundColor: theme.cardBackground }]}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="log-out" size={20} color={StatusColors.danger} />
            <ThemedText style={{ color: StatusColors.danger }}>Terminar Sessão</ThemedText>
          </Pressable>
        </View>

        <ThemedText type="caption" style={[styles.version, { color: theme.textSecondary }]}>
          EntryFlow Guard v1.0.0
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: Spacing.xl, gap: Spacing.xl, paddingTop: 80 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: Spacing.lg, padding: Spacing.xl, borderRadius: BorderRadius.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center" },
  section: { borderRadius: BorderRadius.lg, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.lg },
  version: { textAlign: "center" },
});
