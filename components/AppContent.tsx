import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { BrandColors } from "@/constants/theme";
import { AuthNavigator } from "@/navigation/AuthNavigator";
import { GuardTabNavigator } from "@/navigation/GuardTabNavigator";

export function AppContent() {
  const { staff, isLoading, isDeviceConfigured } = useAuth();
  const { theme } = useTheme();

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={BrandColors.primary} />
      </View>
    );
  }

  // Show auth flow if device not configured or staff not logged in
  if (!isDeviceConfigured || !staff) {
    return <AuthNavigator />;
  }

  return <GuardTabNavigator />;
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
});
