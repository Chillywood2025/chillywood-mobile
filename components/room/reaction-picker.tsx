import React from "react";
import {
    ScrollView,
    Text,
    TouchableOpacity,
    View,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from "react-native";

export const SHARED_REACTION_EMOJIS = [
  "❤️", "💜", "💙", "💚", "💛", "🧡", "🩷", "🤍", "🖤", "🤎",
  "🔥", "✨", "💯", "🎉", "🙌", "👏", "🙏", "🤝", "🫶",
  "👍", "👍🏻", "👍🏼", "👍🏽", "👍🏾", "👍🏿",
  "👎", "👎🏻", "👎🏼", "👎🏽", "👎🏾", "👎🏿",
  "👏🏻", "👏🏼", "👏🏽", "👏🏾", "👏🏿",
  "🙌🏻", "🙌🏼", "🙌🏽", "🙌🏾", "🙌🏿",
  "🙏🏻", "🙏🏼", "🙏🏽", "🙏🏾", "🙏🏿",
  "🤟", "🤟🏻", "🤟🏼", "🤟🏽", "🤟🏾", "🤟🏿",
  "✊", "✊🏻", "✊🏼", "✊🏽", "✊🏾", "✊🏿",
  "😊", "😍", "🥹", "😂", "🤣", "😮", "😎", "🤯", "🥳", "😅",
] as const;

export const pushRecentReaction = (recent: string[], emoji: string, max = 12) => {
  const next = [emoji, ...recent.filter((entry) => entry !== emoji)];
  return next.slice(0, max);
};

export type RoomReactionPickerStyles = {
  root?: StyleProp<ViewStyle>;
  backdrop?: StyleProp<ViewStyle>;
  sheet?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  subtitle?: StyleProp<TextStyle>;
  closeBtn?: StyleProp<ViewStyle>;
  closeText?: StyleProp<TextStyle>;
  body?: StyleProp<ViewStyle>;
  section?: StyleProp<ViewStyle>;
  sectionTitle?: StyleProp<TextStyle>;
  grid?: StyleProp<ViewStyle>;
  emojiBtn?: StyleProp<ViewStyle>;
  emojiText?: StyleProp<TextStyle>;
};

type RoomReactionPickerProps = {
  visible: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  emojis?: readonly string[];
  recentEmojis?: readonly string[];
  title?: string;
  subtitle?: string;
  closeLabel?: string;
  closeOnSelect?: boolean;
  styles?: RoomReactionPickerStyles;
};

export function RoomReactionPicker({
  visible,
  onClose,
  onSelectEmoji,
  emojis = SHARED_REACTION_EMOJIS,
  recentEmojis = [],
  title = "React",
  subtitle = "Tap an emoji to send",
  closeLabel = "Close",
  closeOnSelect = true,
  styles,
}: RoomReactionPickerProps) {
  if (!visible) return null;

  const onPressEmoji = (emoji: string) => {
    onSelectEmoji(emoji);
    if (closeOnSelect) onClose();
  };

  return (
    <View pointerEvents="box-none" style={styles?.root}>
      <TouchableOpacity style={styles?.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles?.sheet}>
        <View style={styles?.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles?.title}>{title}</Text>
            <Text style={styles?.subtitle}>{subtitle}</Text>
          </View>
          <TouchableOpacity style={styles?.closeBtn} activeOpacity={0.82} onPress={onClose}>
            <Text style={styles?.closeText}>{closeLabel}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles?.body} showsVerticalScrollIndicator={false}>
          {recentEmojis.length > 0 ? (
            <View style={styles?.section}>
              <Text style={styles?.sectionTitle}>Recent</Text>
              <View style={styles?.grid}>
                {recentEmojis.map((emoji) => (
                  <TouchableOpacity
                    key={`recent-${emoji}`}
                    style={styles?.emojiBtn}
                    activeOpacity={0.8}
                    onPress={() => onPressEmoji(emoji)}
                  >
                    <Text style={styles?.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles?.section}>
            <Text style={styles?.sectionTitle}>All reactions</Text>
            <View style={styles?.grid}>
              {emojis.map((emoji) => (
                <TouchableOpacity
                  key={`all-${emoji}`}
                  style={styles?.emojiBtn}
                  activeOpacity={0.8}
                  onPress={() => onPressEmoji(emoji)}
                >
                  <Text style={styles?.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
