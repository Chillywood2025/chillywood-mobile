import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { color, radius } from "./tokens";

export const Skeleton = ({
  borderRadius = radius.lg,
  height,
  style,
  width,
}: {
  borderRadius?: number;
  height: DimensionValue;
  style?: StyleProp<ViewStyle>;
  width: DimensionValue;
}) => {
  const opacity = useRef(new Animated.Value(0.58)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 760,
          toValue: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: 760,
          toValue: 0.58,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity]);

  return (
    <View style={[styles.shell, { borderRadius, height, width }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.pulse, { opacity }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  pulse: {
    backgroundColor: color.surfaceMuted,
  },
  shell: {
    backgroundColor: color.surface,
    overflow: "hidden",
  },
});
