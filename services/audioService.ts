import { AudioPlayer, useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger, LogCategory } from "@/services/logger";

const AUDIO_PERMISSION_KEY = "audio_enabled";

// Alert sound asset — place alert.wav in assets/sounds/
const ALERT_SOUND = require("@/assets/sounds/alert.wav");

class AudioService {
  private static instance: AudioService;
  private enabled = true;
  private player: AudioPlayer | null = null;

  static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  async initialize(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(AUDIO_PERMISSION_KEY);
      this.enabled = stored !== "false";
    } catch {
      this.enabled = true;
    }
  }

  private async playBeep(): Promise<void> {
    if (!this.enabled || !this.player) return;
    try {
      await this.player.seekTo(0);
      this.player.play();
    } catch (error) {
      logger.error(LogCategory.GENERAL, "AudioService: playBeep failed", error);
    }
  }

  async playAlertSound(): Promise<void> {
    if (!this.enabled) return;
    if (!this.player) {
      logger.warn(
        LogCategory.GENERAL,
        "AudioService: player not initialized via hook",
      );
      return;
    }
    try {
      this.player.volume = 0.6;
    } catch {
      // Older expo-audio builds may not expose volume — safe to ignore.
    }
    // 4 cycles of BIP-bip-BIP over ~6 s. Each cycle: 0, +250, +500 ms,
    // with ~700 ms gap between cycles.
    const cycleStarts = [0, 1200, 2400, 3600];
    for (const start of cycleStarts) {
      setTimeout(() => this.playBeep(), start);
      setTimeout(() => this.playBeep(), start + 250);
      setTimeout(() => this.playBeep(), start + 500);
    }
  }

  async playHapticAlert(): Promise<void> {
    const impact = () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTimeout(impact, 350);
      setTimeout(impact, 700);
    } catch {
      // Haptics not available on all devices.
    }
  }

  async triggerIncidentAlert(): Promise<void> {
    await this.playHapticAlert();
    await this.playAlertSound();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    AsyncStorage.setItem(AUDIO_PERMISSION_KEY, String(enabled)).catch(() => {});
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setPlayer(player: AudioPlayer): void {
    this.player = player;
  }
}

export const audioService = AudioService.getInstance();

/**
 * Hook to initialize audio player and register it with the service.
 * Call this once in the root component (App.tsx or similar).
 */
export function useAudioService() {
  const player = useAudioPlayer(ALERT_SOUND);

  // Register the player with the singleton so non-hook code can use it
  audioService.setPlayer(player);

  return { audioService };
}
