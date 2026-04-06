import React, { useRef } from "react";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { initSentry, navigationIntegration } from "@/config/sentry";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AppContent } from "@/components/AppContent";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAudioService } from "@/services/audioService";
import { useTheme } from "@/hooks/useTheme";

// Initialize Sentry before rendering
initSentry();

function AppInner() {
  const navRef = useRef<NavigationContainerRef<Record<string, unknown>>>(null);
  const { isDark } = useTheme();

  // Register audio player with the singleton service
  useAudioService();

  return (
    <NavigationContainer
      ref={navRef}
      onReady={() => navigationIntegration.registerNavigationContainer(navRef)}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <AppContent />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <ToastProvider>
                <AppInner />
              </ToastProvider>
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
