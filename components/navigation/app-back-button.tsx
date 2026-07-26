import React from "react";
import {
  StyleSheet,
  Text,
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
  hitSlop,
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
      <Text style={[styles.text, textStyle]}>← {label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  text: {
    color: "#E7EEFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
