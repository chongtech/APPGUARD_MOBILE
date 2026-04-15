import React, { useCallback, useEffect, useState } from "react";
import * as ExpoSplashScreen from "expo-splash-screen";
import { Sentry, flushSentry } from "@/config/sentry";
import { useAuth } from "@/contexts/AuthContext";
import { AuthNavigator } from "@/navigation/AuthNavigator";
import { GuardTabNavigator } from "@/navigation/GuardTabNavigator";
import { SplashScreen } from "@/components/SplashScreen";
import { ErrorFallback } from "@/components/ErrorFallback";

// Keep the native splash visible while we load.
// Swallow the promise — if this API rejects, it must not block the JS splash from hiding.
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

const BOOT_WATCHDOG_MS = 10_000;

async function forceHideNativeSplash(): Promise<void> {
  try {
    await ExpoSplashScreen.hideAsync();
  } catch {
    // already hidden or unavailable — nothing to do
  }
}

export function AppContent() {
  const { staff, isLoading, isDeviceConfigured } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const [bootStuck, setBootStuck] = useState<Error | null>(null);

  const handleSplashReady = useCallback(async () => {
    await forceHideNativeSplash();
    setSplashDone(true);
  }, []);

  // Boot watchdog — if the splash hasn't advanced after 10s, self-report to Sentry,
  // force-hide the native splash, and fall back to the error UI so the user isn't frozen.
  useEffect(() => {
    const timer = setTimeout(() => {
      Sentry.captureMessage("boot:splash-stuck", {
        level: "error",
        extra: { isLoading, splashDone, isDeviceConfigured, hasStaff: !!staff },
      });
      flushSentry(2000);
      void forceHideNativeSplash();
      setBootStuck(new Error("Boot watchdog: splash stuck for 10s"));
    }, BOOT_WATCHDOG_MS);

    return () => clearTimeout(timer);
    // Run once on mount — we want this to fire if state is stuck, not re-arm on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (bootStuck) {
    return (
      <ErrorFallback error={bootStuck} resetError={() => setBootStuck(null)} />
    );
  }

  if (isLoading || !splashDone) {
    return (
      <SplashScreen onReady={!isLoading ? handleSplashReady : undefined} />
    );
  }

  if (!isDeviceConfigured || !staff) {
    return <AuthNavigator />;
  }

  return <GuardTabNavigator />;
}
