import React, { useEffect, useRef } from "react";
import {
  View,
  Animated,
  StyleSheet,
  Dimensions,
  Easing,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const LOGO_SIZE = Math.min(SCREEN_W * 0.42, 200);

interface SplashScreenProps {
  onReady?: () => void;
}

/**
 * Premium animated splash screen.
 *
 * Design: matches the real brand — blue→green gradient of the app icon,
 * with the actual icon.png rendered centered on a polished diagonal gradient.
 *
 * Choreography:
 *  1. Gradient background + ambient blobs painted instantly
 *  2. Glow halo blooms in behind the logo
 *  3. Logo fades in, scales up with spring, then breathes continuously
 *  4. Tagline fades in below
 *  5. Shimmer progress bar loops while the app finishes loading
 */
export function SplashScreen({ onReady }: SplashScreenProps) {
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const haloScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(12)).current;
  const progressOpacity = useRef(new Animated.Value(0)).current;
  const progressTranslate = useRef(new Animated.Value(-1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // 1 — Halo bloom
      Animated.parallel([
        Animated.timing(haloOpacity, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(haloScale, {
          toValue: 1,
          friction: 7,
          tension: 28,
          useNativeDriver: true,
        }),
      ]),
      // 2 — Logo entrance
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 48,
          useNativeDriver: true,
        }),
      ]),
      // 3 — Tagline + progress bar reveal together
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslateY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(progressOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onReady?.();
    });

    // Continuous: subtle logo breathing
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.035,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Continuous: progress bar sweep
    Animated.loop(
      Animated.timing(progressTranslate, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressX = progressTranslate.interpolate({
    inputRange: [-1, 1],
    outputRange: [-180, 180],
  });

  return (
    <View style={styles.container}>
      {/* Brand gradient: deep blue → emerald green (matches icon) */}
      <LinearGradient
        colors={["#1E3A8A", "#1E40AF", "#0D9488", "#059669"]}
        locations={[0, 0.35, 0.75, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient soft-light blobs for depth */}
      <View
        style={[
          styles.blob,
          {
            top: -SCREEN_H * 0.12,
            left: -SCREEN_W * 0.2,
            backgroundColor: "#60A5FA",
            opacity: 0.15,
          },
        ]}
      />
      <View
        style={[
          styles.blob,
          {
            bottom: -SCREEN_H * 0.18,
            right: -SCREEN_W * 0.22,
            backgroundColor: "#34D399",
            opacity: 0.16,
          },
        ]}
      />

      {/* Centered hero */}
      <View style={styles.hero}>
        {/* Soft halo behind logo */}
        <Animated.View
          style={[
            styles.halo,
            {
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />

        {/* Real brand logo */}
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale: Animated.multiply(logoScale, pulseScale) }],
            ...styles.logoShadow,
          }}
        >
          <Image
            source={require("@/assets/icon.png")}
            style={{
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              borderRadius: LOGO_SIZE * 0.22,
            }}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      {/* Wordmark + tagline */}
      <Animated.View
        style={[
          styles.taglineWrap,
          {
            opacity: taglineOpacity,
            transform: [{ translateY: taglineTranslateY }],
          },
        ]}
      >
        <Animated.Text style={styles.wordmark}>EntryFlow</Animated.Text>
        <View style={styles.divider} />
        <Animated.Text style={styles.tagline}>
          Segurança inteligente para condomínios
        </Animated.Text>
      </Animated.View>

      {/* Progress bar */}
      <Animated.View
        style={[styles.progressTrack, { opacity: progressOpacity }]}
      >
        <Animated.View
          style={[
            styles.progressBar,
            { transform: [{ translateX: progressX }] },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1E40AF",
    alignItems: "center",
    justifyContent: "center",
  },

  // Background blobs
  blob: {
    position: "absolute",
    width: SCREEN_W * 0.95,
    height: SCREEN_W * 0.95,
    borderRadius: SCREEN_W * 0.475,
  },

  // Hero stack
  hero: {
    alignItems: "center",
    justifyContent: "center",
    width: LOGO_SIZE * 2,
    height: LOGO_SIZE * 2,
  },

  // Halo behind logo
  halo: {
    position: "absolute",
    width: LOGO_SIZE * 1.7,
    height: LOGO_SIZE * 1.7,
    borderRadius: LOGO_SIZE * 0.85,
    backgroundColor: "#FFFFFF",
    opacity: 0.08,
  },

  // Logo drop shadow
  logoShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },

  // Wordmark + tagline block
  taglineWrap: {
    position: "absolute",
    bottom: SCREEN_H * 0.18,
    alignItems: "center",
  },
  wordmark: {
    fontSize: 28,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 1,
    marginBottom: 12,
    opacity: 0.5,
  },
  tagline: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.85)",
    fontWeight: "500",
    letterSpacing: 1,
    textAlign: "center",
  },

  // Progress bar
  progressTrack: {
    position: "absolute",
    bottom: SCREEN_H * 0.07,
    width: 180,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    width: 80,
    height: 3,
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
});
