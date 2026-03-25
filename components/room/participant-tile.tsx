import React from "react";
import {
    Image,
    Text,
    View,
    type ImageStyle,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from "react-native";

import { getInitials, getParticipantMediaUri } from "../../app/watch-party/_lib/_room-shared";
import type { WaitingRoomParticipantEntry } from "../../app/watch-party/_lib/_waiting-room-shared";

type ParticipantTileStyles = {
  container: StyleProp<ViewStyle>;
  containerHost?: StyleProp<ViewStyle>;
  containerSelf?: StyleProp<ViewStyle>;
  containerActive?: StyleProp<ViewStyle>;
  avatarWrap: StyleProp<ViewStyle>;
  avatarImage: StyleProp<ImageStyle>;
  avatarLabel: StyleProp<TextStyle>;
  nameText: StyleProp<TextStyle>;
  nameTextHost?: StyleProp<TextStyle>;
  statusText?: StyleProp<TextStyle>;
  hostBadgeWrap?: StyleProp<ViewStyle>;
  hostBadgeText?: StyleProp<TextStyle>;
  speakingDot?: StyleProp<ViewStyle>;
  reactionBadge?: StyleProp<ViewStyle>;
  reactionText?: StyleProp<TextStyle>;
};

type RoomParticipantTileProps = {
  participant: WaitingRoomParticipantEntry;
  myCameraPreviewUrl?: string;
  styles: ParticipantTileStyles;
  showHostBadge?: boolean;
  selfLabelAsYou?: boolean;
};

export function RoomParticipantTile({
  participant,
  myCameraPreviewUrl,
  styles,
  showHostBadge = true,
  selfLabelAsYou = true,
}: RoomParticipantTileProps) {
  const mediaUri = getParticipantMediaUri({
    isCurrentUser: !!participant.isSelf,
    myCameraPreviewUrl,
    cameraPreviewUrl: participant.cameraPreviewUrl,
    avatarUrl: participant.avatarUrl,
  });

  const name = participant.isSelf && selfLabelAsYou ? "You" : participant.displayName;

  return (
    <View
      style={[
        styles.container,
        participant.isHost && styles.containerHost,
        participant.isSelf && styles.containerSelf,
        participant.isActive && styles.containerActive,
      ]}
    >
      <View style={styles.avatarWrap}>
        {mediaUri ? (
          <Image source={{ uri: mediaUri }} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <Text style={styles.avatarLabel}>{participant.avatarLabelOverride || getInitials(participant.displayName)}</Text>
        )}
        {showHostBadge && participant.isHost && styles.hostBadgeWrap ? (
          <View style={styles.hostBadgeWrap}>
            <Text style={styles.hostBadgeText}>👑</Text>
          </View>
        ) : null}
        {participant.isSpeaking && styles.speakingDot ? <View style={styles.speakingDot} /> : null}
        {participant.reactionEmoji && styles.reactionBadge ? (
          <View style={styles.reactionBadge}>
            <Text style={styles.reactionText}>{participant.reactionEmoji}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.nameText, participant.isHost && styles.nameTextHost]} numberOfLines={1}>
        {name}
      </Text>
      {participant.statusText && styles.statusText ? (
        <Text style={styles.statusText}>{participant.statusText}</Text>
      ) : null}
    </View>
  );
}
