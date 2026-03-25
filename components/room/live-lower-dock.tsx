import React, { type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import {
    RoomFooterControlRow,
    type RoomControlAction,
    type RoomFooterControlRowStyles,
} from "./control-primitives";
import { RoomReactionPicker, type RoomReactionPickerStyles } from "./reaction-picker";

type LiveLowerDockProps = {
  rootStyle?: StyleProp<ViewStyle>;
  presenceToast?: ReactNode;
  participantStrip: ReactNode;
  leftAction: RoomControlAction;
  trailingActions: RoomControlAction[];
  footerStyles: RoomFooterControlRowStyles;
  reactionPicker: {
    visible: boolean;
    onClose: () => void;
    onSelectEmoji: (emoji: string) => void;
    recentEmojis?: readonly string[];
    title?: string;
    subtitle?: string;
    styles: RoomReactionPickerStyles;
  };
};

export function LiveLowerDock({
  rootStyle,
  presenceToast,
  participantStrip,
  leftAction,
  trailingActions,
  footerStyles,
  reactionPicker,
}: LiveLowerDockProps) {
  return (
    <View style={rootStyle}>
      {presenceToast}
      {participantStrip}
      <RoomFooterControlRow leftAction={leftAction} trailingActions={trailingActions} styles={footerStyles} />
      <RoomReactionPicker
        visible={reactionPicker.visible}
        onClose={reactionPicker.onClose}
        onSelectEmoji={reactionPicker.onSelectEmoji}
        recentEmojis={reactionPicker.recentEmojis}
        title={reactionPicker.title}
        subtitle={reactionPicker.subtitle}
        styles={reactionPicker.styles}
      />
    </View>
  );
}
