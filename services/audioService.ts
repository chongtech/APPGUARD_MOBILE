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
    // 4 cycles of BIP-bip-BIP (~6 s total), volume 60%
    try {
      this.player.volume = 0.6;
    } catch {
      /* not all versions expose volume */
    }
    const beep = () => {
      this.playBeep();
    };
    // cycle offsets (ms): 0, 250, 500 | 1200, 1450, 1700 | 2400, 2650, 2900 | 3600, 3850, 4100
    const offsets = [
      0, 250, 500, 1200, 1450, 1700, 2400, 2650, 2900, 3600, 3850, 4100,
    ];
    offsets.forEach((ms) => setTimeout(beep, ms));
  }

  async playHapticAlert(): Promise<void> {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTimeout(
        () =>
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
            () => {},
          ),
        350,
      );
      setTimeout(
        () =>
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
            () => {},
          ),
        700,
      );
    } catch {
      // Haptics not available on all devices
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
