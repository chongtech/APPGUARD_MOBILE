import * as Sentry from "@sentry/react-native";

export { Sentry };
let sentryEnabled = false;
let sentryInitialized = false;

// Navigation integration ref — pass to NavigationContainer via ref prop
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

const PHONE_REGEX = /\+?\d{10,15}/g;
const PII_KEYS = [
  "pin",
  "pin_hash",
  "password",
  "token",
  "device_token",
  "push_token",
];

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result = { ...obj };
  for (const key of PII_KEYS) {
    if (key in result) delete result[key];
  }
  return result;
}

function scrubString(value: string): string {
  return value.replace(PHONE_REGEX, "[PHONE]");
}

export function flushSentry(timeout = 2000): void {
  if (!sentryEnabled) return;

  void Sentry.flush(timeout).catch((error) => {
    if (__DEV__) console.warn("[Sentry] Flush failed", error);
  });
}

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const enableInDev = process.env.EXPO_PUBLIC_SENTRY_ENABLE_DEV === "true";
  const enabled = !__DEV__ || enableInDev;

  if (sentryInitialized) {
    return;
  }

  if (!dsn) {
    sentryEnabled = false;
    sentryInitialized = false;
    if (__DEV__)
      console.warn("[Sentry] EXPO_PUBLIC_SENTRY_DSN not set — Sentry disabled");
    return;
  }

  if (__DEV__ && !enableInDev) {
    console.warn(
      "[Sentry] Running in development — remote reporting disabled. Set EXPO_PUBLIC_SENTRY_ENABLE_DEV=true to test Sentry locally.",
    );
  }

  try {
    Sentry.init({
      dsn,
      enabled,
      debug: __DEV__,
      tracesSampleRate: 0.2,
      profilesSampleRate: 0.1,
      attachStacktrace: true,
      enableAutoSessionTracking: true,

      integrations: [navigationIntegration],

      beforeSend(event) {
        if (event.exception?.values) {
          event.exception.values = event.exception.values.map((ex) => ({
            ...ex,
            value: ex.value ? scrubString(ex.value) : ex.value,
          }));
        }
        if (event.extra) {
          event.extra = scrubObject(event.extra as Record<string, unknown>);
        }
        return event;
      },

      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.message) {
          breadcrumb.message = scrubString(breadcrumb.message);
        }
        if (breadcrumb.data) {
          const data = breadcrumb.data as Record<string, unknown>;
          for (const key of PII_KEYS) {
            if (key in data) delete data[key];
          }
          for (const [k, v] of Object.entries(data)) {
            if (typeof v === "string") data[k] = scrubString(v);
          }
        }
        return breadcrumb;
      },
    });

    sentryInitialized = true;
    sentryEnabled = enabled;
    Sentry.addBreadcrumb({
      category: "boot",
      message: "initSentry completed",
      level: "info",
    });
  } catch (error) {
    sentryEnabled = false;
    console.warn("[Sentry] init threw — reporting disabled", error);
  }
}
