import { flushSentry, Sentry } from "@/config/sentry";

export enum LogCategory {
  AUTH = "auth",
  RPC = "rpc",
  PUSH = "push",
  MEDIA = "media",
  STORAGE = "storage",
  UI = "ui",
  REALTIME = "realtime",
  SYNC = "sync",
  DATABASE = "database",
  GENERAL = "general",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (isRecord(error)) {
    const candidates = [
      error.message,
      error.error_description,
      error.details,
      error.hint,
      error.code,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "[unserializable error object]";
    }
  }
  return "Unknown error";
}

function getErrorExtras(error: unknown): Record<string, unknown> | undefined {
  if (!isRecord(error) || error instanceof Error) return undefined;

  const extras: Record<string, unknown> = {};
  const keys = ["code", "details", "hint", "message", "status", "name"];

  for (const key of keys) {
    const value = error[key];
    if (value !== undefined) extras[key] = value;
  }

  return Object.keys(extras).length > 0 ? extras : undefined;
}

class Logger {
  private static instance: Logger;

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  debug(
    category: LogCategory,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (__DEV__) console.log(`[${category}] ${message}`, data ?? "");
    Sentry.addBreadcrumb({ category, message, data, level: "debug" });
  }

  info(
    category: LogCategory,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (__DEV__) console.log(`[${category}] ${message}`, data ?? "");
    Sentry.addBreadcrumb({ category, message, data, level: "info" });
  }

  warn(
    category: LogCategory,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (__DEV__) console.warn(`[${category}] ${message}`, data ?? "");
    Sentry.addBreadcrumb({ category, message, data, level: "warning" });
  }

  error(
    category: LogCategory,
    message: string,
    error?: unknown,
    data?: Record<string, unknown>,
  ): void {
    if (__DEV__)
      console.error(`[${category}] ${message}`, error ?? "", data ?? "");

    Sentry.addBreadcrumb({ category, message, data, level: "error" });

    Sentry.withScope((scope) => {
      scope.setTag("error_category", category);
      if (data) scope.setExtras(data as Record<string, unknown>);
      const errorExtras = getErrorExtras(error);
      if (errorExtras) {
        scope.setContext("error_payload", errorExtras);
      }
      if (error instanceof Error) {
        Sentry.captureException(error);
      } else if (error !== undefined) {
        const normalizedError = new Error(getErrorMessage(error));
        if (
          isRecord(error) &&
          typeof error.name === "string" &&
          error.name.trim()
        ) {
          normalizedError.name = error.name;
        }
        Sentry.captureException(normalizedError);
      } else {
        Sentry.captureMessage(message, "error");
      }
    });

    flushSentry();
  }

  trackAction(action: string, data?: Record<string, unknown>): void {
    if (__DEV__) console.log(`[action] ${action}`, data ?? "");
    Sentry.addBreadcrumb({
      category: "user.action",
      message: action,
      data,
      type: "user",
      level: "info",
    });
  }

  setUser(user: {
    id: number;
    name: string;
    role: string;
    condominiumId?: number | null;
  }): void {
    Sentry.setUser({
      id: String(user.id),
      username: user.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      role: user.role as any,
      condominiumId: user.condominiumId ?? undefined,
    });
  }

  clearUser(): void {
    Sentry.setUser(null);
  }

  trackHealthScore(score: number): void {
    Sentry.setTag("backend_health", String(score));
  }

  setNetworkStatus(isOnline: boolean): void {
    Sentry.setTag("network_status", isOnline ? "online" : "offline");
  }
}

export const logger = Logger.getInstance();
