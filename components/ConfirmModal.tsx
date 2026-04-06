import React from "react";
import { View, StyleSheet, Modal, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, StatusColors } from "@/constants/theme";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  icon?: keyof typeof Feather.glyphMap;
  iconColor?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible, title, message, icon = "alert-triangle", iconColor,
  confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  isDestructive = false, isLoading = false, onConfirm, onCancel,
}: ConfirmModalProps) {
  const { theme } = useTheme();
  const resolvedIconColor = iconColor || (isDestructive ? StatusColors.danger : StatusColors.warning);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: theme.cardBackground }]}>
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: resolvedIconColor + "15" }]}>
              <Feather name={icon} size={32} color={resolvedIconColor} />
            </View>
          </View>
          <ThemedText type="h3" style={styles.title}>{title}</ThemedText>
          <ThemedText style={[styles.message, { color: theme.textSecondary }]}>{message}</ThemedText>
          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [styles.cancelButton, { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.8 : 1 }]}
              onPress={onCancel} disabled={isLoading}
            >
              <ThemedText style={{ color: theme.text }}>{cancelLabel}</ThemedText>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.confirmButton, { backgroundColor: isDestructive ? StatusColors.danger : StatusColors.warning, opacity: pressed ? 0.8 : 1 }]}
              onPress={onConfirm} disabled={isLoading}
            >
              {isLoading
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <ThemedText style={styles.confirmButtonText}>{confirmLabel}</ThemedText>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: Spacing.xl },
  modalContainer: { width: "100%", maxWidth: 380, borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: "center" },
  header: { marginBottom: Spacing.lg },
  iconCircle: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center" },
  title: { textAlign: "center", marginBottom: Spacing.sm },
  message: { textAlign: "center", marginBottom: Spacing.xl, lineHeight: 22 },
  buttonContainer: { flexDirection: "row", gap: Spacing.md, width: "100%" },
  cancelButton: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignItems: "center", justifyContent: "center" },
  confirmButton: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignItems: "center", justifyContent: "center" },
  confirmButtonText: { color: "#FFFFFF", fontWeight: "600" },
});
