import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger, LogCategory } from "@/services/logger";

const PUSH_TOKEN_KEY = "guard_expo_push_token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("guard-alerts", {
    name: "Guard Alerts",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0D9488",
    sound: "default",
  });
}

export async function registerPushToken(): Promise<string | null> {
  try {
    await setupAndroidChannel();
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      logger.warn(LogCategory.GENERAL, "Push notifications permission denied");
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    logger.info(LogCategory.GENERAL, "Push token registered", { token });
    return token;
  } catch (err) {
    logger.warn(LogCategory.GENERAL, "Push token registration failed", {
      error: String(err),
    });
    return null;
  }
}

export async function scheduleVisitApprovalNotification(
  visitorName: string,
  approved: boolean,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: approved ? "Visita Autorizada" : "Visita Negada",
      body: approved
        ? `${visitorName} foi autorizado(a) pelo morador.`
        : `${visitorName} foi negado(a) pelo morador.`,
      sound: "default",
      data: { type: "visit_approval" },
    },
    trigger: null,
  });
}

export function usePushNotifications(
  onNotificationResponse?: (
    response: Notifications.NotificationResponse,
  ) => void,
): void {
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(
    null,
  );

  useEffect(() => {
    registerPushToken();

    if (onNotificationResponse) {
      responseListenerRef.current =
        Notifications.addNotificationResponseReceivedListener(
          onNotificationResponse,
        );
    }

    return () => {
      responseListenerRef.current?.remove();
    };
  }, [onNotificationResponse]);
}
