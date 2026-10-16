import React from "react";
import { Text, type TextProps } from "react-native";

import { formatConversationTimestamp, type ConversationTimestampValue } from "../../_lib/conversationTimestamp";
import { useConversationClock } from "../../hooks/use-conversation-clock";
import { AppText, type AppTextProps } from "../ui/typography";

type Props = Pick<TextProps, "style" | "testID"> & {
  value: ConversationTimestampValue;
  scale?: AppTextProps["scale"];
};

export function ConversationTimestamp({ value, style, testID, scale }: Props) {
  const now = useConversationClock(value);
  const timestamp = formatConversationTimestamp(value, now);
  const Component = scale ? AppText : Text;
  return (
    <Component
      {...(scale ? { scale } : {})}
      style={style}
      testID={testID}
      accessible
      accessibilityLabel={timestamp.fullLabel}
      accessibilityRole="text"
    >
      {timestamp.label}
    </Component>
  );
}
