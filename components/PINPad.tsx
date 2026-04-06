import React from "react";
import { View, StyleSheet, Pressable, Dimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BUTTON_SIZE = Math.min((SCREEN_WIDTH - 120) / 3, 72);

interface PINPadProps {
  value: string;
  onValueChange: (value: string) => void;
  maxLength?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PINPad({ value, onValueChange, maxLength = 6 }: PINPadProps) {
  const { theme } = useTheme();

  const handleNumberPress = (num: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (value.length < maxLength) {
      onValueChange(value + num);
    }
  };

  const handleBackspace = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(value.slice(0, -1));
  };

  const NumberButton = ({ num }: { num: string }) => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const handlePress = () => {
      scale.value = withSequence(withSpring(0.9, { damping: 15 }), withSpring(1, { damping: 15 }));
      handleNumberPress(num);
    };

    return (
      <AnimatedPressable
        style={[styles.numberButton, { backgroundColor: theme.backgroundSecondary }, animatedStyle]}
        onPress={handlePress}
      >
        <ThemedText style={[styles.numberText, { color: theme.text }]}>{num}</ThemedText>
      </AnimatedPressable>
    );
  };

  const DeleteButton = () => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const handlePress = () => {
      scale.value = withSequence(withSpring(0.9, { damping: 15 }), withSpring(1, { damping: 15 }));
      handleBackspace();
    };

    return (
      <AnimatedPressable style={[styles.deleteButton, animatedStyle]} onPress={handlePress}>
        <Feather name="delete" size={24} color={theme.text} />
      </AnimatedPressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.dotsContainer}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i < value.length ? BrandColors.primaryLight : theme.backgroundTertiary,
                borderColor: i < value.length ? BrandColors.primaryLight : theme.backgroundTertiary,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        <View style={styles.row}>
          <NumberButton num="1" /><NumberButton num="2" /><NumberButton num="3" />
        </View>
        <View style={styles.row}>
          <NumberButton num="4" /><NumberButton num="5" /><NumberButton num="6" />
        </View>
        <View style={styles.row}>
          <NumberButton num="7" /><NumberButton num="8" /><NumberButton num="9" />
        </View>
        <View style={styles.row}>
          <View style={styles.emptyButton} />
          <NumberButton num="0" />
          <DeleteButton />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: Spacing["2xl"] },
  dotsContainer: { flexDirection: "row", gap: Spacing.md, paddingVertical: Spacing.lg },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  grid: { gap: Spacing.md },
  row: { flexDirection: "row", gap: Spacing.lg, justifyContent: "center" },
  numberButton: { width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2, alignItems: "center", justifyContent: "center" },
  numberText: { fontSize: 28, fontWeight: "400" },
  deleteButton: { width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2, alignItems: "center", justifyContent: "center" },
  emptyButton: { width: BUTTON_SIZE, height: BUTTON_SIZE },
});
