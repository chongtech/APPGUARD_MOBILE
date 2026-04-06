import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Application from "expo-application";

const DEVICE_ID_KEY = "condo_guard_device_id";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceIdentifier(): Promise<string> {
  // Prefer platform-native ID if available
  const nativeId =
    Application.getAndroidId() ??
    (await Application.getIosIdForVendorAsync().catch(() => null));

  if (nativeId) return nativeId;

  // Fallback: persistent UUID stored in AsyncStorage
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;

  const newId = generateUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
  return newId;
}

export async function clearDeviceIdentifier(): Promise<void> {
  await AsyncStorage.removeItem(DEVICE_ID_KEY);
}

export interface DeviceMetadata {
  platform: string | null;
  osVersion: string | null;
  deviceName: string | null;
  deviceModel: string | null;
  appVersion: string | null;
  timezone: string;
  timestamp: string;
}

export function getDeviceMetadata(): DeviceMetadata {
  return {
    platform: Device.osName ?? null,
    osVersion: Device.osVersion ?? null,
    deviceName: Device.deviceName ?? null,
    deviceModel: Device.modelName ?? null,
    appVersion: Application.nativeApplicationVersion ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
  };
}

export function getDeviceName(): string {
  if (Device.deviceName) return Device.deviceName;
  if (Device.modelName) return Device.modelName;
  return `${Device.osName ?? "Unknown"} Device`;
}
