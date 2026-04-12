import React, { useCallback, useState } from "react";
import * as ExpoSplashScreen from "expo-splash-screen";
import { useAuth } from "@/contexts/AuthContext";
import { AuthNavigator } from "@/navigation/AuthNavigator";
import { GuardTabNavigator } from "@/navigation/GuardTabNavigator";
import { SplashScreen } from "@/components/SplashScreen";

// Keep the native splash visible while we load
ExpoSplashScreen.preventAutoHideAsync();

export function AppContent() {
  const { staff, isLoading, isDeviceConfigured } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  const handleSplashReady = useCallback(async () => {
    // Hide the native splash once our animated one has finished its entrance
    await ExpoSplashScreen.hideAsync();
    setSplashDone(true);
  }, []);

  // Show animated splash while auth context is initializing
  if (isLoading || !splashDone) {
    return (
      <SplashScreen onReady={!isLoading ? handleSplashReady : undefined} />
    );
  }

  // Show auth flow if device not configured or staff not logged in
  if (!isDeviceConfigured || !staff) {
    return <AuthNavigator />;
  }

  return <GuardTabNavigator />;
}
