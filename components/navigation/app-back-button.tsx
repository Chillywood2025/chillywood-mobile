import React from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type TextStyle,
  type TouchableOpacityProps,
  type ViewStyle,
} from "react-native";

type AppBackButtonProps = Pick<
  TouchableOpacityProps,
  "disabled" | "hitSlop" | "onPress" | "onPressIn" | "testID"
> & {
  accessibilityLabel?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function AppBackButton({
  accessibilityLabel,
  disabled,
  hitSlop = 12,
  label = "Back",
  onPress,
  onPressIn,
  style,
  testID,
  textStyle,
}: AppBackButtonProps) {
  const resolvedAccessibilityLabel = accessibilityLabel
    ?? (label === "Back" ? "Go back" : `Back to ${label}`);

  return (
    <TouchableOpacity
      accessible
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      activeOpacity={0.8}
      disabled={disabled}
      focusable
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={onPressIn}
      style={[styles.button, style]}
      testID={testID}
    >
      <Ionicons
        name="arrow-back"
        size={24}
        color={StyleSheet.flatten(textStyle)?.color ?? "#E7EEFF"}
        accessible={false}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 44,
    alignSelf: "flex-start",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
});
