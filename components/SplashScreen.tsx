import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Dimensions } from "react-native";
import { AppLogo } from "@/components/AppLogo";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SplashScreenProps {
  onReady?: () => void;
}

/**
 * Premium animated splash screen.
 *
 * Sequence:
 *  1. Logo fades in + scales up from 0.8 → 1.0
 *  2. Title slides up + fades in
 *  3. Subtitle fades in
 *  4. Pulsing glow loop on the logo
 *  5. Calls onReady after the entrance completes
 */
export function SplashScreen({ onReady }: SplashScreenProps) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const shimmerTranslate = useRef(new Animated.Value(-SCREEN_WIDTH)).current;

  useEffect(() => {
    // Entrance sequence
    Animated.sequence([
      // 1 — Logo entrance
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      // 2 — Title slide up
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // 3 — Subtitle
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onReady?.();
    });

    // Ambient glow loop (runs independently)
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.6,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Shimmer sweep loop
    Animated.loop(
      Animated.timing(shimmerTranslate, {
        toValue: SCREEN_WIDTH,
        duration: 2400,
        useNativeDriver: true,
      }),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {/* Subtle gradient dots background */}
      <View style={styles.bgPattern}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bgCircle,
              {
                top: `${15 + i * 18}%`,
                left: `${10 + ((i * 37) % 80)}%`,
                opacity: 0.04 + i * 0.01,
                width: 120 + i * 40,
                height: 120 + i * 40,
                borderRadius: (120 + i * 40) / 2,
              },
            ]}
          />
        ))}
      </View>

      {/* Glow ring behind logo */}
      <Animated.View style={[styles.glowRing, { opacity: glowOpacity }]} />

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <AppLogo size={140} />
      </Animated.View>

      {/* Title */}
      <Animated.Text
        style={[
          styles.title,
          {
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
          },
        ]}
      >
        EntryFlow
      </Animated.Text>

      {/* Subtitle with shimmer */}
      <Animated.View style={{ opacity: subtitleOpacity }}>
        <View style={styles.subtitleRow}>
          <View style={styles.subtitleLine} />
          <Animated.Text style={styles.subtitle}>GUARD</Animated.Text>
          <View style={styles.subtitleLine} />
        </View>
      </Animated.View>

      {/* Bottom tagline */}
      <Animated.Text style={[styles.tagline, { opacity: subtitleOpacity }]}>
        Segurança inteligente para condomínios
      </Animated.Text>

      {/* Loading shimmer bar */}
      <Animated.View
        style={[styles.shimmerTrack, { opacity: subtitleOpacity }]}
      >
        <Animated.View
          style={[
            styles.shimmerBar,
            { transform: [{ translateX: shimmerTranslate }] },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },

  // Background pattern
  bgPattern: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  bgCircle: {
    position: "absolute",
    backgroundColor: "#0ea5e9",
  },

  // Glow
  glowRing: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#0ea5e9",
    shadowColor: "#0ea5e9",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },

  // Logo
  logoContainer: {
    marginBottom: 24,
    shadowColor: "#0ea5e9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },

  // Typography
  title: {
    fontSize: 36,
    fontWeight: "300",
    color: "#FFFFFF",
    letterSpacing: 6,
    marginBottom: 8,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 32,
  },
  subtitleLine: {
    width: 32,
    height: 1,
    backgroundColor: "#0ea5e9",
    opacity: 0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0ea5e9",
    letterSpacing: 8,
  },

  // Tagline
  tagline: {
    position: "absolute",
    bottom: 80,
    fontSize: 13,
    fontWeight: "400",
    color: "#64748B",
    letterSpacing: 1,
  },

  // Shimmer loading bar
  shimmerTrack: {
    position: "absolute",
    bottom: 48,
    width: 160,
    height: 2,
    backgroundColor: "#1E293B",
    borderRadius: 1,
    overflow: "hidden",
  },
  shimmerBar: {
    width: 60,
    height: 2,
    backgroundColor: "#0ea5e9",
    borderRadius: 1,
  },
});
