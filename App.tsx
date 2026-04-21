import React, { useRef } from "react";
import {
  NavigationContainer,
  NavigationContainerRef,
} from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import {
  flushSentry,
  initSentry,
  navigationIntegration,
  Sentry,
} from "@/config/sentry";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AppContent } from "@/components/AppContent";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAudioService } from "@/services/audioService";
import { useTheme } from "@/hooks/useTheme";

// Initialize Sentry before rendering
initSentry();

// Positive-signal beacon: confirms the JS bundle executed on-device.
// Absence of this event in Sentry after a crashed launch means the failure
// is in native init (before JS runs).
Sentry.captureEvent({
  level: "info",
  logger: "boot",
  message: "boot:js-started",
  tags: { phase: "js-started" },
});

// Catch async/unhandled JS errors that slip past React's ErrorBoundary.
type ErrorUtilsGlobal = {
  ErrorUtils?: {
    getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
    setGlobalHandler?: (
      handler: (error: Error, isFatal?: boolean) => void,
    ) => void;
  };
};
const errorUtils = (globalThis as unknown as ErrorUtilsGlobal).ErrorUtils;
const previousHandler = errorUtils?.getGlobalHandler?.();
errorUtils?.setGlobalHandler?.((error, isFatal) => {
  Sentry.captureException(error, {
    tags: { source: "globalHandler", fatal: String(!!isFatal) },
  });
  flushSentry(2000);
  previousHandler?.(error, isFatal);
});

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

function App() {
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

export default Sentry.wrap(App);
