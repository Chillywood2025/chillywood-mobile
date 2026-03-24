import { CameraView } from "expo-camera";
import React from "react";
import {
    FlatList,
    Image,
    Text,
    TouchableOpacity,
    View,
    type ImageStyle,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from "react-native";

import { getInitials, getParticipantMediaUri } from "../../app/watch-party/_lib/room-shared";

export type LiveBottomStripParticipant = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  cameraPreviewUrl?: string;
  isSpeaking?: boolean;
};

type LiveBottomStripStyles = {
  overlay: StyleProp<ViewStyle>;
  content: StyleProp<ViewStyle>;
  touchable: StyleProp<ViewStyle>;
  bubble: StyleProp<ViewStyle>;
  bubbleSpeaking?: StyleProp<ViewStyle>;
  bubbleDominant?: StyleProp<ViewStyle>;
  ring?: StyleProp<ViewStyle>;
  ringDominant?: StyleProp<ViewStyle>;
  faceClip: StyleProp<ViewStyle>;
  cameraFill: StyleProp<ViewStyle>;
  cameraDominant?: StyleProp<ViewStyle>;
  image: StyleProp<ImageStyle>;
  initialText: StyleProp<TextStyle>;
  tapWrap?: StyleProp<ViewStyle>;
  tapWrapPulsed?: StyleProp<ViewStyle>;
};

type LiveBottomStripProps = {
  participants: LiveBottomStripParticipant[];
  currentUserId: string;
  dominantSpeakerId?: string;
  speakingById?: Record<string, boolean>;
  myCameraPreviewUrl?: string;
  allowCameraPreview: boolean;
  cameraPermissionGranted: boolean;
  tapPulseById?: Record<string, boolean>;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  styles: LiveBottomStripStyles;
  onParticipantPress?: (participantId: string) => void;
};

export function LiveBottomStrip({
  participants,
  currentUserId,
  dominantSpeakerId = "",
  speakingById,
  myCameraPreviewUrl,
  allowCameraPreview,
  cameraPermissionGranted,
  tapPulseById,
  pointerEvents,
  styles,
  onParticipantPress,
}: LiveBottomStripProps) {
  return (
    <View style={styles.overlay} pointerEvents={pointerEvents}>
      <FlatList
        horizontal
        data={participants}
        keyExtractor={(item) => `bottom-live-${item.id}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          const isCurrentUser = item.id === currentUserId;
          const isSpeaking = !!((speakingById && speakingById[item.id]) || item.isSpeaking);
          const isDominantSpeaker = !!dominantSpeakerId && item.id === dominantSpeakerId && isSpeaking;
          const showLocalCameraPreview = allowCameraPreview && isCurrentUser && cameraPermissionGranted;
          const mediaUri = getParticipantMediaUri({
            isCurrentUser,
            myCameraPreviewUrl,
            cameraPreviewUrl: item.cameraPreviewUrl,
            avatarUrl: item.avatarUrl,
          });

          const content = (
            <View style={[styles.bubble, isSpeaking && styles.bubbleSpeaking, isDominantSpeaker && styles.bubbleDominant]}>
              {isSpeaking ? <View style={[styles.ring, isDominantSpeaker && styles.ringDominant]} /> : null}
              {(showLocalCameraPreview || mediaUri) ? (
                <View style={styles.faceClip}>
                  {showLocalCameraPreview ? (
                    <CameraView
                      style={[styles.cameraFill, isDominantSpeaker && styles.cameraDominant]}
                      facing="front"
                      mute
                      mirror
                    />
                  ) : (
                    <Image source={{ uri: mediaUri }} style={styles.image} />
                  )}
                </View>
              ) : (
                <Text style={styles.initialText}>{getInitials(item.displayName)}</Text>
              )}
            </View>
          );

          return (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.touchable}
              onPress={() => onParticipantPress?.(item.id)}
            >
              {styles.tapWrap ? (
                <View style={[styles.tapWrap, tapPulseById?.[item.id] && styles.tapWrapPulsed]}>{content}</View>
              ) : (
                content
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
