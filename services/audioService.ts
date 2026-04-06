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

  async playAlertSound(): Promise<void> {
    if (!this.enabled) return;

    try {
      if (this.player) {
        await this.player.seekTo(0);
      } else {
        // Player is created via hook in components; this path is a fallback
        logger.warn(LogCategory.GENERAL, "AudioService: player not initialized via hook");
        return;
      }
      this.player.play();
    } catch (error) {
      logger.error(LogCategory.GENERAL, "AudioService: failed to play alert", error);
    }
  }

  async playHapticAlert(): Promise<void> {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
