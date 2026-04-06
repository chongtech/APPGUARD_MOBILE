import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusColors, Typography, BorderRadius, Spacing } from "@/constants/theme";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const insets = useSafeAreaInsets();

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = String(Date.now());
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View
        style={[
          styles.container,
          { bottom: insets.bottom + Spacing.lg },
        ]}
        pointerEvents="none"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const opacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(TOAST_DURATION - 400),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [opacity]);

  const backgroundColor = {
    success: StatusColors.success,
    error: StatusColors.danger,
    warning: StatusColors.warning,
    info: StatusColors.info,
  }[toast.type];

  return (
    <Animated.View style={[styles.toast, { backgroundColor, opacity }]}>
      <Text style={styles.toastText}>{toast.message}</Text>
    </Animated.View>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    gap: Spacing.sm,
  },
  toast: {
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  toastText: {
    ...Typography.small,
    color: "#FFFFFF",
    fontWeight: "500",
  },
});
