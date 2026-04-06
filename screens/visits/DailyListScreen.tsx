import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

// Full implementation: Phase 2
// Adapts APPGUARD/src/pages/DailyList.tsx
// Key changes: FlatList, Linking.openURL for calls, pull-to-refresh

export default function DailyListScreen() {
  const { theme } = useTheme();
  return (
    <ThemedView style={styles.container}>
      <View style={styles.center}>
        <Feather name="list" size={48} color={theme.textSecondary} />
        <ThemedText style={{ color: theme.textSecondary }}>Lista Diária — Em Desenvolvimento</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md },
});
