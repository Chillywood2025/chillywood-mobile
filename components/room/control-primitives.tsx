import React from "react";
import {
    Text,
    TouchableOpacity,
    View,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from "react-native";

export type RoomControlAction = {
  id: string;
  icon: string;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  activeOpacity?: number;
  buttonStyle?: StyleProp<ViewStyle>;
  iconStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export type RoomControlButtonStyles = {
  button: StyleProp<ViewStyle>;
  buttonDisabled?: StyleProp<ViewStyle>;
  iconText: StyleProp<TextStyle>;
  labelText: StyleProp<TextStyle>;
};

type RoomControlButtonProps = {
  action: RoomControlAction;
  styles: RoomControlButtonStyles;
};

export function RoomControlButton({ action, styles }: RoomControlButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, action.buttonStyle, action.disabled && styles.buttonDisabled]}
      activeOpacity={action.activeOpacity ?? 0.82}
      disabled={!!action.disabled}
      onPress={action.onPress}
    >
      <Text style={[styles.iconText, action.iconStyle]}>{action.icon}</Text>
      <Text style={[styles.labelText, action.labelStyle]}>{action.label}</Text>
    </TouchableOpacity>
  );
}

export type RoomReactionChipRowStyles = {
  row: StyleProp<ViewStyle>;
  chip: StyleProp<ViewStyle>;
  chipDisabled?: StyleProp<ViewStyle>;
  chipText: StyleProp<TextStyle>;
};

type RoomReactionChipRowProps = {
  emojis: readonly string[];
  onPressEmoji: (emoji: string) => void;
  disabled?: boolean;
  chipActiveOpacity?: number;
  styles: RoomReactionChipRowStyles;
  keyPrefix?: string;
};

export function RoomReactionChipRow({
  emojis,
  onPressEmoji,
  disabled,
  chipActiveOpacity,
  styles,
  keyPrefix,
}: RoomReactionChipRowProps) {
  return (
    <View style={styles.row}>
      {emojis.map((emoji) => (
        <TouchableOpacity
          key={`${keyPrefix ?? "reaction"}-${emoji}`}
          style={[styles.chip, disabled && styles.chipDisabled]}
          activeOpacity={chipActiveOpacity ?? 0.78}
          disabled={!!disabled}
          onPress={() => onPressEmoji(emoji)}
        >
          <Text style={styles.chipText}>{emoji}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export type RoomFooterControlRowStyles = {
  row: StyleProp<ViewStyle>;
  actionButton: StyleProp<ViewStyle>;
  actionButtonDisabled?: StyleProp<ViewStyle>;
  actionIconText: StyleProp<TextStyle>;
  actionLabelText: StyleProp<TextStyle>;
  quickRow: StyleProp<ViewStyle>;
  quickChip: StyleProp<ViewStyle>;
  quickChipDisabled?: StyleProp<ViewStyle>;
  quickChipText: StyleProp<TextStyle>;
};

type RoomFooterControlRowProps = {
  leftAction: RoomControlAction;
  trailingActions: RoomControlAction[];
  quickReactions: readonly string[];
  onPressQuickReaction: (emoji: string) => void;
  quickReactionsDisabled?: boolean;
  styles: RoomFooterControlRowStyles;
};

export function RoomFooterControlRow({
  leftAction,
  trailingActions,
  quickReactions,
  onPressQuickReaction,
  quickReactionsDisabled,
  styles,
}: RoomFooterControlRowProps) {
  return (
    <View style={styles.row}>
      <RoomControlButton
        action={leftAction}
        styles={{
          button: styles.actionButton,
          buttonDisabled: styles.actionButtonDisabled,
          iconText: styles.actionIconText,
          labelText: styles.actionLabelText,
        }}
      />

      <RoomReactionChipRow
        emojis={quickReactions}
        onPressEmoji={onPressQuickReaction}
        disabled={quickReactionsDisabled}
        styles={{
          row: styles.quickRow,
          chip: styles.quickChip,
          chipDisabled: styles.quickChipDisabled,
          chipText: styles.quickChipText,
        }}
        keyPrefix="footer-quick"
      />

      {trailingActions.map((action) => (
        <RoomControlButton
          key={action.id}
          action={action}
          styles={{
            button: styles.actionButton,
            buttonDisabled: styles.actionButtonDisabled,
            iconText: styles.actionIconText,
            labelText: styles.actionLabelText,
          }}
        />
      ))}
    </View>
  );
}