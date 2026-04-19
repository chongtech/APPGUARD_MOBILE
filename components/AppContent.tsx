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

const BOOT_WATCHDOG_MS = 15_000;

async function forceHideNativeSplash(): Promise<void> {
  try {
    await ExpoSplashScreen.hideAsync();
  } catch {
    // already hidden or unavailable — nothing to do
  }
}

export function AppContent() {
  const { staff, isLoading, isDeviceConfigured } = useAuth();
  const [animationDone, setAnimationDone] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [bootStuck, setBootStuck] = useState<Error | null>(null);

  // The splash animation calls onReady exactly once when its sequence finishes.
  // We track that independently from auth loading so the two don't race.
  const handleAnimationDone = useCallback(() => {
    setAnimationDone(true);
  }, []);

  // Transition: when BOTH the animation has finished AND auth is done loading,
  // hide the native splash and move to the real app.
  useEffect(() => {
    if (animationDone && !isLoading && !splashDone) {
      void forceHideNativeSplash().then(() => setSplashDone(true));
    }
  }, [animationDone, isLoading, splashDone]);

  // Boot watchdog — if the splash hasn't advanced after 15s, self-report to Sentry,
  // force-hide the native splash, and fall back to the error UI so the user isn't frozen.
  useEffect(() => {
    if (splashDone || bootStuck) return;

    const timer = setTimeout(() => {
      Sentry.captureMessage("boot:splash-stuck", {
        level: "error",
        extra: { isLoading, splashDone, isDeviceConfigured, hasStaff: !!staff },
      });
      flushSentry(2000);
      void forceHideNativeSplash();
      setBootStuck(new Error("Boot watchdog: splash stuck for 15s"));
    }, BOOT_WATCHDOG_MS);

    return () => clearTimeout(timer);
  }, [bootStuck, isDeviceConfigured, isLoading, splashDone, staff]);

  if (bootStuck) {
    return (
      <ErrorFallback error={bootStuck} resetError={() => setBootStuck(null)} />
    );
  }

  if (!splashDone) {
    return <SplashScreen onReady={handleAnimationDone} />;
  }

  if (!isDeviceConfigured || !staff) {
    return <AuthNavigator />;
  }

  return <GuardTabNavigator />;
}
