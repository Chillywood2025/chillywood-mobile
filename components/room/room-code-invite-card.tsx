import React from "react";
import {
    Text,
    TouchableOpacity,
    View,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from "react-native";

type RoomCodeInviteStyles = {
  card: StyleProp<ViewStyle>;
  left: StyleProp<ViewStyle>;
  label: StyleProp<TextStyle>;
  code: StyleProp<TextStyle>;
  body?: StyleProp<TextStyle>;
  actionBtn?: StyleProp<ViewStyle>;
  actionText?: StyleProp<TextStyle>;
};

type RoomCodeInviteCardProps = {
  roomCode: string;
  bodyText?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  codeSelectable?: boolean;
  styles: RoomCodeInviteStyles;
};

export function RoomCodeInviteCard({
  roomCode,
  bodyText,
  actionLabel,
  onActionPress,
  codeSelectable,
  styles,
}: RoomCodeInviteCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <Text style={styles.label}>ROOM CODE</Text>
        <Text style={styles.code} selectable={!!codeSelectable}>{roomCode}</Text>
        {bodyText ? <Text style={styles.body}>{bodyText}</Text> : null}
      </View>
      {actionLabel && onActionPress ? (
        <TouchableOpacity style={styles.actionBtn} onPress={onActionPress} activeOpacity={0.8}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
