import type { RealtimeChannel } from "@supabase/supabase-js";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEventListener } from "expo";
import { Asset } from "expo-asset";
import { ResizeMode, Video, type AVPlaybackStatus } from "expo-av";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
    Alert,
    ActivityIndicator,
    Animated,
    AppState,
    BackHandler,
    Easing,
    FlatList,
    Image,
    ImageBackground,
    Keyboard,
    KeyboardAvoidingView,
    LayoutAnimation,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
    type AppStateStatus,
    type GestureResponderEvent,
    type ImageSourcePropType,
    type LayoutChangeEvent,
    type StyleProp,
    type ViewStyle
} from "react-native";

import { titles } from "../../_data/titles";
import {
    resolveRoomAccess,
    resolveContentAccess,
    type RoomAccessResolution,
    type ContentAccessResolution,
} from "../../_lib/accessEntitlements";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveBrandingConfig,
    resolveMonetizationConfig,
} from "../../_lib/appConfig";
import { trackEvent } from "../../_lib/analytics";
import { getMonetizationAccessSheetPresentation } from "../../_lib/monetization";
import { formatMonetizationCurrency } from "../../_lib/creatorMonetization";
import {
    getRuntimeControlBlockedCopy,
    isRuntimeControlBlockedAccess,
    WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY,
    requireWatchPartyLivePremium,
    type PremiumWatchPartyFeatureAccessDecision,
} from "../../_lib/premiumWatchPartyAccess";
import { consumePreparedLiveKitJoinBoundary, prepareLiveKitJoinBoundary } from "../../_lib/livekit/join-boundary";
import { enforceLiveKitParticipantState } from "../../_lib/livekit/participant-permissions";
import {
    isLiveKitParticipantTokenExpired,
    type LiveKitTokenReady,
} from "../../_lib/livekit/token-contract";
import { debugLog } from "../../_lib/logger";
import { getVideoSource } from "../../_lib/mediaSources";
import { readCreatorVideoForPlayer, type CreatorVideo } from "../../_lib/creatorVideos";
import {
    createCreatorVideoComment,
    deleteCreatorVideoComment,
    readCreatorVideoComments,
    CREATOR_VIDEO_COMMENT_BODY_LIMIT,
    type CreatorVideoComment,
} from "../../_lib/creatorVideoComments";
import {
    SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE,
    type SocialAttachmentPickerScope,
    type SocialAttachmentFile,
} from "../../_lib/socialAttachments";
import { pickSocialAttachmentFile } from "../../_lib/socialAttachmentPicker";
import { buildCreatorVideoDeepLink, isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import {
    getCreatorVideoWatchPartyBlockCopy,
    getCreatorVideoWatchPartyBlockReason,
    resolveWatchPartyContentSourceByParts,
    resolveWatchPartySourceId,
    resolveWatchPartySourceType,
} from "../../_lib/watchPartyContentSources";
import { useSession } from "../../_lib/session";
import { supabase } from "../../_lib/supabase";
import type { Tables } from "../../supabase/database.types";
import {
    clearProgressForTitle,
    readMergedWatchProgress,
    readMyListIds,
    toggleMyListTitle,
    writeProgressForTitle,
} from "../../_lib/userData";
import { isReactNativeNewArchitecture } from "../../_lib/reactNativeRuntime";
import {
    createPartyRoom,
    decodePartySeatRequestMessage,
    emitSyncEvent,
    encodePartySeatRequestMessage,
    fetchPartyMessages,
    getActivePartyMemberships,
    getPartyRoom,
    getPartyRoomSnapshot,
    getSafePartyUserId,
    getWritablePartyUserId,
    joinPartyRoomSession,
    PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS,
    sendPartyMessage,
    setPartyParticipantState,
    updateRoomPlayback,
    type WatchPartyRoomMembership,
    type WatchPartyRoomSnapshot,
    type WatchPartyState,
} from "../../_lib/watchParty";
import { buildFooterControlTokens, mapFooterControlRowStyles } from "../../components/room/control-style-tokens";
import { AccessSheet, getAccessSheetEntryLabel } from "../../components/monetization/access-sheet";
import { ReportSheet } from "../../components/safety/report-sheet";
import { LinkedText } from "../../components/social/linked-text";
import { SocialAttachmentActionSheet } from "../../components/social/social-attachment-action-sheet";
import { SocialAttachmentCard } from "../../components/social/social-attachment-card";
import { LiveLowerDock } from "../../components/room/live-lower-dock";
import { pushRecentReaction } from "../../components/room/reaction-picker";
import { ProtectedSessionNote, getProtectedSessionCopy } from "../../components/prototype/protected-session-note";
import {
  LiveKitStageMediaSurface,
  type LiveKitStageParticipantRosterEntry,
} from "../../components/watch-party-live/livekit-stage-media-surface";
import {
    buildSafetyReportContext,
    submitSafetyReport,
    type SafetyReportCategory,
} from "../../_lib/moderation";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getInitials,
  getLiveParticipantStatusText,
  LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS,
  PLAYER_WATCH_PARTY_SOURCE,
  resolveIdentityName,
} from "../../_lib/watch-party/room-shared";

const ACCENT = "#DC143C";
const BG = "#0B0B10";
const STEP_MILLIS = 10_000;
const SWIPE_PIXELS_PER_STEP = 30;
const MAX_ZOOM = 2.5;
const MIN_ZOOM = 1;
const PROGRESS_WRITE_INTERVAL = 4_000;
const CONTROLS_AUTO_HIDE_MILLIS = 5_000;
const PLAYBACK_END_REPLAY_THRESHOLD_MILLIS = 1_500;
const NEXT_AUTOPLAY_DELAY_MILLIS = 1_500;
const UP_NEXT_TRIGGER_MILLIS = 12_000;
const UP_NEXT_COUNTDOWN_SECONDS = 5;

const formatCreatorCommentTime = (value?: string | null) => {
  const parsed = Date.parse(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return "Recently";
  return new Date(parsed).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};
const PARTY_HOST_SYNC_WRITE_INTERVAL_MILLIS = 600;
const PARTY_GUEST_NOOP_DRIFT_MILLIS = 900;
const PARTY_GUEST_SOFT_SEEK_THRESHOLD_MILLIS = 2400;
const PARTY_GUEST_SOFT_NUDGE_MILLIS = 450;
const PARTY_LOCAL_MAX_REACTIONS = 8;
const PARTY_LOCAL_REACTION_SET = ["❤️", "😂", "🔥", "👏"] as const;
const LIVE_FACE_FILTER_OPTIONS = [
  { id: "none", label: "Natural", subtitle: "No Chi’llyfect preview" },
  { id: "studio", label: "Studio Glow", subtitle: "Preview-only warmth" },
  { id: "cool", label: "City Cool", subtitle: "Preview-only clarity" },
  { id: "midnight", label: "Midnight", subtitle: "Preview-only contrast" },
] as const;
const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAN_SCRUB_SEEK_THROTTLE_MILLIS = 16;
const PAN_SCRUB_MIN_DRAG_PIXELS = 4;
const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2] as const;
const WATCH_PARTY_LIVE_VIDEO_VOLUME_DEFAULT = 0.85;
const WATCH_PARTY_LIVE_VOICE_VOLUME_DEFAULT = 1;
const WATCH_PARTY_LIVE_DUCKED_VIDEO_VOLUME_DEFAULT = 0.3;
const WATCH_PARTY_LIVE_DUCK_DOWN_MILLIS = 250;
const WATCH_PARTY_LIVE_RESTORE_MILLIS = 700;
const WATCH_PARTY_LIVE_VOICE_IDLE_MILLIS = 650;
const WATCH_PARTY_LIVE_VOLUME_TICK_MILLIS = 50;
const WATCH_PARTY_BRANDED_BACKGROUND = require("../../assets/images/chillywood-branded-background.png");
const CREATOR_VIDEO_BRANDED_BACKGROUND = WATCH_PARTY_BRANDED_BACKGROUND;

const getWatchPartyAccessTitle = (access: Pick<RoomAccessResolution, "reason"> | null | undefined) => {
  if (access?.reason === "room_locked") return "Watch party locked";
  if (access?.reason === "removed") return "Watch party access removed";
  if (access?.reason === "identity_required") return "Sign in required";
  if (access?.reason === "premium_required") return "Premium access required";
  if (access?.reason === "party_pass_required") return "Party Pass required";
  return "Watch-party access unavailable";
};

const getWatchPartyAccessBody = (access: Pick<RoomAccessResolution, "reason" | "label"> | null | undefined) => {
  if (access?.reason === "room_locked") return "This watch party is locked right now. Ask the host to reopen it.";
  if (access?.reason === "removed") return "You no longer have access to this watch party.";
  if (access?.reason === "identity_required") {
    return "Sign in before joining Watch-Party Live so room membership and sync stay tied to a real Chi'llywood identity.";
  }
  if (access?.reason === "premium_required") {
    return "Premium access is required before Watch-Party Live can open from this direct route.";
  }
  if (access?.reason === "party_pass_required") {
    return "Party Pass access is required before Watch-Party Live can open from this direct route.";
  }
  return `${access?.label ?? "Room"} access is unavailable right now.`;
};

type TitleDbBaseRow = Pick<
  Tables<"titles">,
  "id" | "title" | "category" | "year" | "runtime" | "synopsis" | "poster_url" | "video_url" | "content_access_rule"
>;

type TitleDbAdvancedRow = TitleDbBaseRow & Pick<
  Tables<"titles">,
  "status" | "is_published" | "release_at" | "release_date"
>;

type TitleIdLookupRow = Pick<Tables<"titles">, "id">;

type TitleRow = TitleDbBaseRow & {
  thumbnail_url?: string | null;
  video?: unknown;
};

const buildLocalPlayerTitle = (chosen: any): TitleRow => ({
  id: String(chosen?.id ?? ""),
  title: String(chosen?.title ?? "Now Playing"),
  category: chosen?.genre ?? null,
  year: chosen?.year ? Number(chosen.year) : null,
  runtime: chosen?.runtime ?? null,
  synopsis: chosen?.description ?? null,
  poster_url: null,
  thumbnail_url: null,
  video_url: null,
  content_access_rule: "open",
  video: chosen?.video,
});

const buildCreatorPlayerTitle = (video: CreatorVideo): TitleRow => ({
  id: video.id,
  title: video.title,
  category: "Creator Video",
  year: null,
  runtime: null,
  synopsis: video.description,
  poster_url: video.thumbnailUrl || null,
  thumbnail_url: video.thumbnailUrl || null,
  video_url: video.playbackUrl,
  content_access_rule: "open",
});

const buildSpectatorPlayerTitle = (input: {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
}): TitleRow => ({
  id: input.id,
  title: input.title || "Spectator source",
  category: "Spectator",
  year: null,
  runtime: null,
  synopsis: null,
  poster_url: input.thumbnailUrl,
  thumbnail_url: input.thumbnailUrl,
  video_url: input.playbackUrl,
  content_access_rule: "open",
});

type PlayerSurfaceMode =
  | "standalone-title"
  | "standalone-creator-video"
  | "spectator-child-playback"
  | "watch-party-live-shared"
  | "live-watch-party-stage";

const resolvePlayerSurfaceMode = (input: {
  inWatchParty: boolean;
  isLiveModeFlag: boolean;
  isSharedPartyPlayback: boolean;
  isCreatorVideoPlayback: boolean;
  isSpectatorPlayback: boolean;
}): PlayerSurfaceMode => {
  if (input.isSharedPartyPlayback) return "watch-party-live-shared";
  if (input.inWatchParty && input.isLiveModeFlag) return "live-watch-party-stage";
  if (input.isSpectatorPlayback) return "spectator-child-playback";
  if (input.isCreatorVideoPlayback) return "standalone-creator-video";
  return "standalone-title";
};

const getPlayerSurfacePresentation = (mode: PlayerSurfaceMode) => {
  switch (mode) {
    case "watch-party-live-shared":
      return {
        kicker: "CHI'LLYWOOD · WATCH-PARTY LIVE",
        label: "Shared Player",
      };
    case "live-watch-party-stage":
      return {
        kicker: "CHI'LLYWOOD · LIVE WATCH-PARTY",
        label: "Live Stage",
      };
    case "standalone-creator-video":
      return {
        kicker: "CHI'LLYWOOD · CREATOR VIDEO",
        label: "Creator Video",
      };
    case "spectator-child-playback":
      return {
        kicker: "CHI'LLYWOOD · SPECTATOR",
        label: "Spectator Playback",
      };
    case "standalone-title":
    default:
      return {
        kicker: "CHI'LLYWOOD · PLAYER",
        label: "Title Player",
      };
  }
};

const buildStandaloneTitleDeepLink = (titleId: string) => (
  `chillywoodmobile://player/${encodeURIComponent(String(titleId ?? "").trim())}`
);

const formatPlaybackRateLabel = (rate: number) => `${Number(rate.toFixed(2)).toString()}x`;

type PartyParticipant = {
  id: string;
  name: string;
  role: "host" | "co-host" | "viewer";
  avatarUrl?: string;
  cameraPreviewUrl?: string;
  stageRole: "host" | "speaker" | "listener";
  isLive?: boolean;
  muted: boolean;
  canSpeak: boolean;
  isSpeaking: boolean;
  isRequestingToSpeak: boolean;
};

const derivePartyStageRole = (options: {
  role: "host" | "co-host" | "viewer";
  canSpeak: boolean;
  currentStageRole?: string | null;
}): "host" | "speaker" | "listener" => {
  const currentStageRole = String(options.currentStageRole ?? "").trim().toLowerCase();
  if (options.role === "host") return "host" as const;
  if (currentStageRole === "speaker" || currentStageRole === "listener") {
    return currentStageRole;
  }
  return options.canSpeak ? "speaker" : "listener";
};

const isLocalOnlyPartyParticipantLabel = (value: unknown) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "you" || normalized === "me";
};

const resolvePartyParticipantDisplayName = (options: {
  isCurrentUser: boolean;
  role: "host" | "co-host" | "viewer";
  candidates: unknown[];
}) => {
  if (options.isCurrentUser) return "You";
  const fallback = options.role === "host" ? "Host" : "Guest";
  const candidates = options.candidates.filter((candidate) => {
    const label = String(candidate ?? "").trim();
    if (!label) return false;
    if (isLocalOnlyPartyParticipantLabel(label)) return false;
    if (options.role === "host" && label.toLowerCase() === "guest") return false;
    return true;
  });
  const resolved = resolveIdentityName(...candidates, fallback);
  if (isLocalOnlyPartyParticipantLabel(resolved)) return fallback;
  if (options.role === "host" && String(resolved).trim().toLowerCase() === "guest") return "Host";
  return resolved;
};

type LiveFaceFilterId = (typeof LIVE_FACE_FILTER_OPTIONS)[number]["id"];

type PlayerController = {
  setPositionAsync: (positionMillis: number) => Promise<void>;
  playAsync: () => Promise<void>;
  pauseAsync: () => Promise<void>;
  replayAsync?: () => Promise<void>;
  setRateAsync: (rate: number, shouldCorrectPitch: boolean) => Promise<void>;
  setVolumeAsync?: (volume: number) => Promise<void>;
};

type SharedAndroidVideoSurfaceProps = {
  source: any;
  style: StyleProp<ViewStyle>;
  contentFit: "contain" | "cover";
  shouldPlay: boolean;
  playbackRate: number;
  volume: number;
  onPlaybackStatusUpdate: (status: AVPlaybackStatus) => void;
  onLoad: (status: AVPlaybackStatus) => void;
};

const buildLoadedPlaybackStatus = ({
  durationMillis,
  positionMillis,
  isPlaying,
  didJustFinish = false,
}: {
  durationMillis: number;
  positionMillis: number;
  isPlaying: boolean;
  didJustFinish?: boolean;
}) =>
  ({
    isLoaded: true,
    durationMillis,
    positionMillis,
    isPlaying,
    didJustFinish,
  }) as AVPlaybackStatus;

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => (
  !!value
  && (typeof value === "object" || typeof value === "function")
  && typeof (value as { then?: unknown }).then === "function"
);

const applySharedVideoPlayerVolume = (player: unknown, volume: number) => {
  const patchablePlayer = player as { volume?: number };
  patchablePlayer.volume = clamp(volume, 0, 1);
};

const getPlaybackOperationErrorMeta = (error: unknown) => {
  if (error instanceof Error) {
    return {
      errorName: error.name || "Error",
      errorMessage: error.message || "Playback operation failed",
      errorType: null,
      errorCode: null,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    const message = String(record.message ?? record.reason ?? record.details ?? "").trim();
    const type = String(record.type ?? "").trim();
    const code = String(record.code ?? "").trim();
    return {
      errorName: name || (type ? "Event" : "Error"),
      errorMessage: message || (type ? `Playback event rejected: ${type}` : "Playback operation rejected"),
      errorType: type || null,
      errorCode: code || null,
    };
  }

  return {
    errorName: "Error",
    errorMessage: String(error ?? "Playback operation rejected"),
    errorType: null,
    errorCode: null,
  };
};

const SharedAndroidVideoSurface = forwardRef<PlayerController, SharedAndroidVideoSurfaceProps>(
  function SharedAndroidVideoSurface(
    { source, style, contentFit, shouldPlay, playbackRate, volume, onPlaybackStatusUpdate, onLoad },
    ref,
  ) {
    const videoViewKey = useMemo(() => {
      if (typeof source === "number") return `asset-${source}`;
      if (typeof source === "string") return `uri-${source}`;
      if (source && typeof source === "object" && "uri" in source) {
        return `uri-${String((source as { uri?: unknown }).uri ?? "")}`;
      }
      return "shared-android-video";
    }, [source]);
    const player = useVideoPlayer(source, (createdPlayer) => {
      createdPlayer.loop = false;
      createdPlayer.preservesPitch = true;
      createdPlayer.playbackRate = playbackRate;
      applySharedVideoPlayerVolume(createdPlayer, volume);
      createdPlayer.timeUpdateEventInterval = 0.25;
    });
    const durationMillisRef = useRef(0);
    const positionMillisRef = useRef(0);
    const isPlayingRef = useRef(false);
    const sourceKind = typeof source === "number" ? "asset" : "remote";

    const logSharedVideoOperationFailure = useCallback((operation: string, error: unknown) => {
      debugLog("player", "shared android video operation rejected", {
        operation,
        surface: "shared-android-video",
        sourceKind,
        ...getPlaybackOperationErrorMeta(error),
      });
    }, [sourceKind]);

    const runSharedVideoOperation = useCallback(async (operation: string, action: () => unknown) => {
      try {
        const result = action();
        if (isPromiseLike(result)) await result;
        return true;
      } catch (error) {
        logSharedVideoOperationFailure(operation, error);
        return false;
      }
    }, [logSharedVideoOperationFailure]);

    const emitStatus = useCallback(
      (overrides?: Partial<{ durationMillis: number; positionMillis: number; isPlaying: boolean; didJustFinish: boolean }>) => {
        const status = buildLoadedPlaybackStatus({
          durationMillis: overrides?.durationMillis ?? durationMillisRef.current,
          positionMillis: overrides?.positionMillis ?? positionMillisRef.current,
          isPlaying: overrides?.isPlaying ?? isPlayingRef.current,
          didJustFinish: overrides?.didJustFinish ?? false,
        });
        onPlaybackStatusUpdate(status);
      },
      [onPlaybackStatusUpdate],
    );

    useImperativeHandle(
      ref,
      () => ({
        async setPositionAsync(positionMillis: number) {
          const safePositionMillis = Math.max(0, positionMillis);
          const didApply = await runSharedVideoOperation("set-position", () => {
            player.currentTime = safePositionMillis / 1000;
          });
          if (!didApply) return;
          positionMillisRef.current = safePositionMillis;
          emitStatus({ positionMillis: safePositionMillis });
        },
        async playAsync() {
          const didPlay = await runSharedVideoOperation("play", () => player.play());
          if (!didPlay) return;
          isPlayingRef.current = true;
          emitStatus({ isPlaying: true });
        },
        async pauseAsync() {
          const didPause = await runSharedVideoOperation("pause", () => player.pause());
          if (!didPause) return;
          isPlayingRef.current = false;
          emitStatus({ isPlaying: false });
        },
        async replayAsync() {
          const didReplay = await runSharedVideoOperation("replay", () => player.replay());
          if (!didReplay) return;
          positionMillisRef.current = 0;
          isPlayingRef.current = true;
          emitStatus({ positionMillis: 0, isPlaying: true, didJustFinish: false });
        },
        async setRateAsync(rate: number) {
          await runSharedVideoOperation("set-rate", () => {
            player.playbackRate = rate;
          });
        },
        async setVolumeAsync(nextVolume: number) {
          await runSharedVideoOperation("set-volume", () => {
            applySharedVideoPlayerVolume(player, nextVolume);
          });
        },
      }),
      [emitStatus, player, runSharedVideoOperation],
    );

    useEffect(() => {
      void runSharedVideoOperation("apply-rate", () => {
        player.playbackRate = playbackRate;
        player.preservesPitch = true;
        player.timeUpdateEventInterval = 0.25;
      });
    }, [player, playbackRate, runSharedVideoOperation]);

    useEffect(() => {
      void runSharedVideoOperation("apply-volume", () => {
        applySharedVideoPlayerVolume(player, volume);
      });
    }, [player, runSharedVideoOperation, volume]);

    useEffect(() => {
      void runSharedVideoOperation(shouldPlay ? "effect-play" : "effect-pause", () => (
        shouldPlay ? player.play() : player.pause()
      ));
    }, [player, runSharedVideoOperation, shouldPlay]);

    useEventListener(player, "sourceLoad", ({ duration }) => {
      const nextDurationMillis = Math.max(0, Math.round((duration ?? 0) * 1000));
      durationMillisRef.current = nextDurationMillis;
      const status = buildLoadedPlaybackStatus({
        durationMillis: nextDurationMillis,
        positionMillis: positionMillisRef.current,
        isPlaying: isPlayingRef.current,
      });
      try {
        const loadResult = onLoad(status) as unknown;
        if (isPromiseLike(loadResult)) {
          void Promise.resolve(loadResult).catch((error) => {
            logSharedVideoOperationFailure("source-load-callback", error);
          });
        }
      } catch (error) {
        logSharedVideoOperationFailure("source-load-callback", error);
      }
      onPlaybackStatusUpdate(status);
    });

    useEventListener(player, "timeUpdate", ({ currentTime }) => {
      positionMillisRef.current = Math.max(0, Math.round((currentTime ?? 0) * 1000));
      emitStatus();
    });

    useEventListener(player, "playingChange", ({ isPlaying }) => {
      isPlayingRef.current = isPlaying;
      emitStatus({ isPlaying });
    });

    useEventListener(player, "playToEnd", () => {
      positionMillisRef.current = durationMillisRef.current;
      isPlayingRef.current = false;
      emitStatus({
        positionMillis: durationMillisRef.current,
        isPlaying: false,
        didJustFinish: true,
      });
    });

    return (
      <VideoView
        key={videoViewKey}
        player={player}
        style={style}
        pointerEvents="none"
        nativeControls={false}
        contentFit={contentFit}
        surfaceType="textureView"
        useExoShutter={false}
      />
    );
  },
);

type StandalonePlayerTopChromeProps = {
  controlsVisible: boolean;
  playbackGateActive: boolean;
  overlayOpacity: Animated.Value;
  overlayTranslateY: Animated.Value;
  playbackRateLabel: string;
  onCyclePlaybackRate: () => void;
  canShare: boolean;
  onShare: () => void;
  canStartWatchPartyLive: boolean;
  onWatchParty: () => void;
  canReport: boolean;
  reportBusy: boolean;
  onReport: () => void;
};

function StandalonePlayerTopChrome({
  controlsVisible,
  playbackGateActive,
  overlayOpacity,
  overlayTranslateY,
  playbackRateLabel,
  onCyclePlaybackRate,
  canShare,
  onShare,
  canStartWatchPartyLive,
  onWatchParty,
  canReport,
  reportBusy,
  onReport,
}: StandalonePlayerTopChromeProps) {
  const hasTopLeftActions = canShare || canReport || !!playbackRateLabel;

  return (
    <View style={styles.partyOverlayTopRow} pointerEvents="box-none">
      {!playbackGateActive ? (
        <Animated.View
          pointerEvents={controlsVisible ? "auto" : "none"}
          style={[
            styles.standaloneOverlayActions,
            {
              opacity: overlayOpacity,
              transform: [{ translateY: overlayTranslateY }],
            },
          ]}
        >
          <View style={styles.standaloneTopActionBar}>
            <View style={styles.standaloneTopLeftActions}>
              {canShare ? (
                <TouchableOpacity
                  style={styles.compactChip}
                  onPress={onShare}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Share this Player item"
                  hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                >
                  <Text style={styles.compactChipText}>Share</Text>
                </TouchableOpacity>
              ) : null}
              {canReport ? (
                <TouchableOpacity
                  style={[styles.compactChip, reportBusy && styles.secondaryBtnDisabled]}
                  onPress={onReport}
                  disabled={reportBusy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={reportBusy ? "Sending safety report" : "Report this Player item"}
                  accessibilityState={{ disabled: reportBusy, busy: reportBusy }}
                  hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                >
                  <Text style={styles.compactChipText}>{reportBusy ? "Sending..." : "Report"}</Text>
                </TouchableOpacity>
              ) : null}
              {playbackRateLabel ? (
                <TouchableOpacity
                  style={[styles.compactChip, styles.compactSpeedChip]}
                  onPress={onCyclePlaybackRate}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Playback speed ${playbackRateLabel}. Tap to change speed.`}
                  hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                >
                  <Text style={styles.compactChipText}>{playbackRateLabel}</Text>
                </TouchableOpacity>
              ) : null}
              {!hasTopLeftActions ? <View style={styles.standaloneTopSpacer} /> : null}
            </View>
            <View style={styles.standaloneTopRightActions}>
              {canStartWatchPartyLive ? (
                <TouchableOpacity
                  style={[styles.partyOverlayChip, styles.partyOverlayChipWatchPartyTitle, styles.standaloneSocialHandoffBtn]}
                  onPress={onWatchParty}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Start Watch-Party Live from Player"
                  hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                >
                  <Text style={styles.partyOverlayChipText}>Watch-Party Live</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const getLiveFaceFilterPresentation = (filterId: LiveFaceFilterId) => {
  switch (filterId) {
    case "studio":
      return {
        label: "Studio Glow",
        subtitle: "Preview-only warmth. It does not change the outgoing LiveKit camera track.",
        overlayColor: "rgba(255,189,122,0.16)",
        borderColor: "rgba(255,214,168,0.52)",
      };
    case "cool":
      return {
        label: "City Cool",
        subtitle: "Preview-only clarity. It does not change the outgoing LiveKit camera track.",
        overlayColor: "rgba(108,166,255,0.18)",
        borderColor: "rgba(168,203,255,0.52)",
      };
    case "midnight":
      return {
        label: "Midnight",
        subtitle: "Preview-only contrast. It does not change the outgoing LiveKit camera track.",
        overlayColor: "rgba(96,112,255,0.16)",
        borderColor: "rgba(149,164,255,0.5)",
      };
    case "none":
    default:
      return {
        label: "Natural",
        subtitle: "No Chi’llyfect preview is active.",
        overlayColor: "transparent",
        borderColor: "rgba(255,255,255,0.1)",
      };
  }
};

const BASE_SELECT = "id,title,category,year,runtime,synopsis,poster_url,video_url,content_access_rule";
const ADVANCED_SELECT = `${BASE_SELECT},status,is_published,release_at,release_date`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type AudioMixSliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

function AudioMixSlider({ label, value, onChange, disabled = false }: AudioMixSliderProps) {
  const [trackWidth, setTrackWidth] = useState(1);
  const safeValue = clamp(value, 0, 1);
  const percent = Math.round(safeValue * 100);

  const onTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(Math.max(1, event.nativeEvent.layout.width));
  }, []);

  const updateValueFromEvent = useCallback((event: GestureResponderEvent) => {
    if (disabled) return;
    const nextValue = clamp(event.nativeEvent.locationX / trackWidth, 0, 1);
    onChange(Number(nextValue.toFixed(2)));
  }, [disabled, onChange, trackWidth]);

  return (
    <View style={styles.audioMixSliderWrap}>
      <View style={styles.audioMixSliderHeader}>
        <Text style={styles.audioMixSliderLabel}>{label}</Text>
        <Text style={styles.audioMixSliderValue}>{percent}%</Text>
      </View>
      <View
        style={[styles.audioMixSliderTrack, disabled && styles.audioMixSliderTrackDisabled]}
        onLayout={onTrackLayout}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={updateValueFromEvent}
        onResponderMove={updateValueFromEvent}
      >
        <View style={[styles.audioMixSliderFill, { width: `${percent}%` }]} />
        <View style={[styles.audioMixSliderThumb, { left: `${percent}%` }]} />
      </View>
    </View>
  );
}

const formatTime = (millis: number) => {
  const totalSeconds = Math.max(0, Math.floor((millis || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const touchDistance = (touches: readonly { pageX: number; pageY: number }[]) => {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  const dx = b.pageX - a.pageX;
  const dy = b.pageY - a.pageY;
  return Math.sqrt(dx * dx + dy * dy);
};

type PlayerTouch = {
  pageX: number;
  pageY: number;
  locationX?: number;
  locationY?: number;
};

type ZoomTranslation = {
  x: number;
  y: number;
};

type ZoomLayout = {
  width: number;
  height: number;
};

const getTouchFocalPoint = (touches: readonly PlayerTouch[], layout: ZoomLayout): ZoomTranslation | null => {
  if (touches.length < 2 || layout.width <= 0 || layout.height <= 0) return null;
  const [a, b] = touches;
  const hasLocalCoordinates =
    typeof a.locationX === "number"
    && Number.isFinite(a.locationX)
    && typeof b.locationX === "number"
    && Number.isFinite(b.locationX)
    && typeof a.locationY === "number"
    && Number.isFinite(a.locationY)
    && typeof b.locationY === "number"
    && Number.isFinite(b.locationY);

  const midpointX = hasLocalCoordinates ? ((a.locationX ?? 0) + (b.locationX ?? 0)) / 2 : layout.width / 2;
  const midpointY = hasLocalCoordinates ? ((a.locationY ?? 0) + (b.locationY ?? 0)) / 2 : layout.height / 2;

  return {
    x: clamp(midpointX - layout.width / 2, -layout.width / 2, layout.width / 2),
    y: clamp(midpointY - layout.height / 2, -layout.height / 2, layout.height / 2),
  };
};

const clampZoomTranslation = (translation: ZoomTranslation, scale: number, layout: ZoomLayout): ZoomTranslation => {
  if (scale <= 1.01 || layout.width <= 0 || layout.height <= 0) {
    return { x: 0, y: 0 };
  }

  const maxX = Math.max(0, ((scale - 1) * layout.width) / 2);
  const maxY = Math.max(0, ((scale - 1) * layout.height) / 2);
  return {
    x: clamp(translation.x, -maxX, maxX),
    y: clamp(translation.y, -maxY, maxY),
  };
};

export default function PlayerScreen() {
  const { isSignedIn } = useSession();
  const {
    id,
    partyId: partyIdParam,
    liveKitIdentity: liveKitIdentityParam,
    liveMode: liveModeParam,
    source: sourceParam,
  } = useLocalSearchParams<{
    id?: string;
    partyId?: string | string[];
    liveKitIdentity?: string | string[];
    liveMode?: string | string[];
    source?: string | string[];
  }>();
  const partyId = Array.isArray(partyIdParam) ? String(partyIdParam[0] ?? "").trim() : String(partyIdParam ?? "").trim();
  const watchPartyLiveKitIdentity = Array.isArray(liveKitIdentityParam)
    ? String(liveKitIdentityParam[0] ?? "").trim()
    : String(liveKitIdentityParam ?? "").trim();
  const inWatchParty = !!partyId;
  const liveModeRaw = Array.isArray(liveModeParam)
    ? String(liveModeParam[0] ?? "").trim().toLowerCase()
    : String(liveModeParam ?? "").trim().toLowerCase();
  const sourceRaw = Array.isArray(sourceParam)
    ? String(sourceParam[0] ?? "").trim().toLowerCase()
    : String(sourceParam ?? "").trim().toLowerCase();
  const expectsCreatorVideo = sourceRaw === "creator-video";
  const expectsSpectatorPlayback = sourceRaw === "spectator-playback";
  const isLiveModeFlag = liveModeRaw === "1" || liveModeRaw === "true" || liveModeRaw === "yes" || liveModeRaw === "live";
  const isSharedPartyPlayback = inWatchParty && !isLiveModeFlag;
  let rawId = id;
  if (typeof rawId !== "string") rawId = String(rawId ?? "");
  const cleanId = rawId.replace(/["']/g, "").trim();

  const localExactIdMatch = titles.find((t: any) => String(t.id) === cleanId);
  const localSlugMatch = localExactIdMatch ? null : titles.find((t: any) => String(t.slug) === cleanId);
  const localTitleMatch =
    localExactIdMatch || localSlugMatch
      ? null
      : titles.find((t: any) => String(t.title).toLowerCase() === cleanId.toLowerCase());
  const localTitle = (localExactIdMatch ?? localSlugMatch ?? localTitleMatch ?? null) as any;
  const localMatchSource = localExactIdMatch
    ? "local:id"
    : localSlugMatch
      ? "local:slug"
      : localTitleMatch
        ? "local:title"
        : "none";
  const fallbackVideo = localTitle ? getVideoSource(localTitle) : null;
  const showProtectedSessionNote = isLiveModeFlag;

  const videoRef = useRef<PlayerController | null>(null);
  const [item, setItem] = useState<TitleRow | null>(null);
  const [creatorVideo, setCreatorVideo] = useState<CreatorVideo | null>(null);
  const [spectatorSourceEnded, setSpectatorSourceEnded] = useState(false);
  const [playbackSourceKind, setPlaybackSourceKind] = useState<"title" | "creator-video" | "spectator-playback">("title");
  const [titleLoading, setTitleLoading] = useState(true);
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [standaloneAccess, setStandaloneAccess] = useState<ContentAccessResolution | null>(null);
  const [standaloneAccessLoading, setStandaloneAccessLoading] = useState(true);
  const [standaloneAccessRetryToken, setStandaloneAccessRetryToken] = useState(0);
  const [standaloneAccessSheetVisible, setStandaloneAccessSheetVisible] = useState(false);
  const [watchPartyPremiumGate, setWatchPartyPremiumGate] = useState<PremiumWatchPartyFeatureAccessDecision | null>(null);
  const [watchPartyPremiumSheetVisible, setWatchPartyPremiumSheetVisible] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [watchPartyEntryLoading, setWatchPartyEntryLoading] = useState(inWatchParty);
  const [watchPartyEntryMissing, setWatchPartyEntryMissing] = useState(false);
  const [watchPartyEntryError, setWatchPartyEntryError] = useState<string | null>(null);
  const [watchPartyAccess, setWatchPartyAccess] = useState<RoomAccessResolution | null>(null);
  const [watchPartyEntryRetryToken, setWatchPartyEntryRetryToken] = useState(0);
  const watchPartyEntryAllowed = !inWatchParty || (
    !watchPartyEntryLoading
    && !watchPartyEntryMissing
    && !watchPartyEntryError
    && !watchPartyPremiumGate
    && !!watchPartyAccess?.isAllowed
  );

  useEffect(() => {
    debugLog("player", "route id resolved", { id: cleanId });
  }, [cleanId]);

  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationMillis, setDurationMillis] = useState(0);
  const [positionMillis, setPositionMillis] = useState(0);
  const [resumeCueMillis, setResumeCueMillis] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [videoVolume, setVideoVolume] = useState(WATCH_PARTY_LIVE_VIDEO_VOLUME_DEFAULT);
  const [voiceVolume] = useState(WATCH_PARTY_LIVE_VOICE_VOLUME_DEFAULT);
  const [autoDuckEnabled, setAutoDuckEnabled] = useState(true);
  const [duckedVideoVolume] = useState(WATCH_PARTY_LIVE_DUCKED_VIDEO_VOLUME_DEFAULT);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [effectiveVideoVolume, setEffectiveVideoVolume] = useState(WATCH_PARTY_LIVE_VIDEO_VOLUME_DEFAULT);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [myListIds, setMyListIds] = useState<string[]>([]);
  const [myListBusy, setMyListBusy] = useState(false);
  const [titleReportVisible, setTitleReportVisible] = useState(false);
  const [titleReportBusy, setTitleReportBusy] = useState(false);
  const [creatorVideoReportVisible, setCreatorVideoReportVisible] = useState(false);
  const [creatorVideoReportBusy, setCreatorVideoReportBusy] = useState(false);
  const [creatorVideoComments, setCreatorVideoComments] = useState<CreatorVideoComment[]>([]);
  const [creatorVideoCommentsLoading, setCreatorVideoCommentsLoading] = useState(false);
  const [creatorVideoCommentsError, setCreatorVideoCommentsError] = useState<string | null>(null);
  const [creatorVideoCommentDraft, setCreatorVideoCommentDraft] = useState("");
  const [creatorVideoCommentAttachmentFile, setCreatorVideoCommentAttachmentFile] = useState<SocialAttachmentFile | null>(null);
  const [creatorVideoCommentAttachmentSheetVisible, setCreatorVideoCommentAttachmentSheetVisible] = useState(false);
  const [creatorVideoCommentReplyTargetId, setCreatorVideoCommentReplyTargetId] = useState<string | null>(null);
  const [creatorVideoCommentBusy, setCreatorVideoCommentBusy] = useState(false);
  const [creatorVideoCommentDeletingId, setCreatorVideoCommentDeletingId] = useState<string | null>(null);
  const [creatorVideoCommentReportTarget, setCreatorVideoCommentReportTarget] = useState<CreatorVideoComment | null>(null);
  const [creatorVideoCommentReportBusy, setCreatorVideoCommentReportBusy] = useState(false);
  const [creatorVideoCommentUserId, setCreatorVideoCommentUserId] = useState("");
  const [creatorVideoCommentKeyboardOpen, setCreatorVideoCommentKeyboardOpen] = useState(false);
  const [watchPartyCommentKeyboardOpen, setWatchPartyCommentKeyboardOpen] = useState(false);
  const [playbackLoadError, setPlaybackLoadError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isStandaloneFullscreen, setIsStandaloneFullscreen] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const [showUpNext, setShowUpNext] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState(UP_NEXT_COUNTDOWN_SECONDS);
  const [upNextCanceled, setUpNextCanceled] = useState(false);
  const [partySyncRole, setPartySyncRole] = useState<"host" | "guest" | null>(null);
  const [partySyncStatus, setPartySyncStatus] = useState<string | null>(null);
  const [watchPartyLiveKitJoinContract, setWatchPartyLiveKitJoinContract] = useState<LiveKitTokenReady | null>(null);
  // Watch-Party Live controls are intentionally persistent and must not auto-hide.
  const shouldPinWatchPartyControls = inWatchParty
    && !isLiveModeFlag
    && watchPartyEntryAllowed
    && Platform.OS !== "web"
    && !!watchPartyLiveKitJoinContract;
  const effectiveControlsVisible = shouldPinWatchPartyControls || controlsVisible;
  const isCreatorStandalonePlaybackSurface = !inWatchParty
    && !isLiveModeFlag
    && (playbackSourceKind === "creator-video" || expectsCreatorVideo);
  const [partyUserId, setPartyUserId] = useState("");
  const [, setPartyViewerCount] = useState(0);
  const [viewerCount, setViewerCount] = useState(1);
  const [partyParticipantPreview, setPartyParticipantPreview] = useState<string[]>([]);
  const [, setPartyChatOpen] = useState(false);
  const [, setPartyMessages] = useState<{ id: string; text: string }[]>([]);
  const [partyParticipants, setPartyParticipants] = useState<PartyParticipant[]>([]);
  const partyParticipantsRef = useRef<PartyParticipant[]>([]);
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null);
  const [activeParticipantToolsId, setActiveParticipantToolsId] = useState<string | null>(null);
  const [activeParticipantIds, setActiveParticipantIds] = useState<string[]>([]);
  const [partyCommentsOpen, setPartyCommentsOpen] = useState(false);
  const [partyCommentDraft, setPartyCommentDraft] = useState("");
  const [partyCommentSending, setPartyCommentSending] = useState(false);
  const [watchPartyMenuOpen, setWatchPartyMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [liveFilterSheetOpen, setLiveFilterSheetOpen] = useState(false);
  const [liveFaceFilter, setLiveFaceFilter] = useState<LiveFaceFilterId>("none");
  const [recentReactionEmojis, setRecentReactionEmojis] = useState<string[]>([]);
  const [partyOverlayMessages, setPartyOverlayMessages] = useState<{ id: string; author: string; body: string }[]>([]);
  const [partyReactionBursts, setPartyReactionBursts] = useState<{ id: string; emoji: string }[]>([]);
  const [partyLocalReactions, setPartyLocalReactions] = useState<{ id: string; emoji: string; rightOffset: number }[]>([]);
  const [partyParticipantReactions, setPartyParticipantReactions] = useState<
    { id: string; participantId: string; participantName: string; emoji: string; isSpeaking: boolean; createdAt: number }[]
  >([]);
  const [livePresenceEvent, setLivePresenceEvent] = useState<string | null>(null);
  const [participantReactionBoostIds, setParticipantReactionBoostIds] = useState<string[]>([]);
  const [entryBoostActive, setEntryBoostActive] = useState(false);
  const [roomEnergy, setRoomEnergy] = useState(0);
  const seekFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const participantActivityPulse = useRef(new Animated.Value(0)).current;
  const entryPulseOpacity = useRef(new Animated.Value(0)).current;
  const roomEnergyAnim = useRef(new Animated.Value(0)).current;
  const participantActiveTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastParticipantActivityAtRef = useRef(Date.now());
  const speakingOrderRef = useRef<string[]>(["p1"]);
  const livePresenceEventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousParticipantsRef = useRef<{ id: string; name: string; isSpeaking: boolean }[]>([]);
  const suppressNextSpeakingEventRef = useRef<Record<string, "start" | "stop" | undefined>>({});
  const watchPartyLiveKitContractRequestKeyRef = useRef("");
  const watchPartyLiveKitAuthorityRetryKeyRef = useRef("");
  const watchPartyLiveKitAuthorityRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchPartyLiveKitMountedRef = useRef(true);
  const lastPartyMembershipRosterRefreshAtRef = useRef(0);
  const lastPartySeatRequestFocusKeyRef = useRef("");
  const partySeatRequestPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partyRoomHostUserIdRef = useRef("");
  const pendingPartySeatRequestsRef = useRef<Record<string, { sentAt: number; source: string }>>({});
  const participantReactionScaleMapRef = useRef<Record<string, Animated.Value>>({});
  const participantReactionTranslateYMapRef = useRef<Record<string, Animated.Value>>({});
  const participantReactionOpacityMapRef = useRef<Record<string, Animated.Value>>({});
  const participantReactionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const participantIdleScaleMapRef = useRef<Record<string, Animated.Value>>({});
  const participantIdleTranslateXMapRef = useRef<Record<string, Animated.Value>>({});
  const participantReactionBoostTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const participantFocusScaleMapRef = useRef<Record<string, Animated.Value>>({});
  const participantFocusOpacityMapRef = useRef<Record<string, Animated.Value>>({});
  const participantPressScaleMapRef = useRef<Record<string, Animated.Value>>({});
  const participantVoiceLevelMapRef = useRef<Record<string, Animated.Value>>({});
  const participantJoinScaleMapRef = useRef<Record<string, Animated.Value>>({});
  const entryBoostTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastJoinToastAtRef = useRef(0);
  const roomEnergyRef = useRef(0);
  const watchPartyLiveVoiceIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchPartyLiveVolumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const effectiveVideoVolumeRef = useRef(WATCH_PARTY_LIVE_VIDEO_VOLUME_DEFAULT);
  const myCameraPreviewUrlRef = useRef("");
  const partyDisplayNameRef = useRef("You");
  const partyAvatarUrlRef = useRef("");
  const partyUserIdRef = useRef("");
  const partyMembershipMapRef = useRef<Record<string, WatchPartyRoomMembership>>({});
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    partyParticipantsRef.current = partyParticipants;
  }, [partyParticipants]);

  useEffect(() => {
    partyUserIdRef.current = partyUserId;
  }, [partyUserId]);

  useEffect(() => {
    return () => {
      watchPartyLiveKitMountedRef.current = false;
      if (watchPartyLiveKitAuthorityRetryTimeoutRef.current) {
        clearTimeout(watchPartyLiveKitAuthorityRetryTimeoutRef.current);
        watchPartyLiveKitAuthorityRetryTimeoutRef.current = null;
      }
      if (partySeatRequestPollRef.current) {
        clearInterval(partySeatRequestPollRef.current);
        partySeatRequestPollRef.current = null;
      }
      if (watchPartyLiveVoiceIdleTimeoutRef.current) {
        clearTimeout(watchPartyLiveVoiceIdleTimeoutRef.current);
        watchPartyLiveVoiceIdleTimeoutRef.current = null;
      }
      if (watchPartyLiveVolumeIntervalRef.current) {
        clearInterval(watchPartyLiveVolumeIntervalRef.current);
        watchPartyLiveVolumeIntervalRef.current = null;
      }
    };
  }, []);

  const zoomScale = useRef(new Animated.Value(1)).current;
  const zoomTranslateX = useRef(new Animated.Value(0)).current;
  const zoomTranslateY = useRef(new Animated.Value(0)).current;
  const zoomScaleValueRef = useRef(1);
  const zoomTranslateXValueRef = useRef(0);
  const zoomTranslateYValueRef = useRef(0);
  const durationRef = useRef(0);
  const currentPositionRef = useRef(0);
  const lastProgressWriteAtRef = useRef(0);
  const lastPersistedPositionRef = useRef(0);
  const lastPlaybackIsPlayingRef = useRef(false);
  const resumePositionRef = useRef(0);
  const didJustFinishRef = useRef(false);
  const swipeLastAppliedStepRef = useRef(0);
  const progressTrackLayoutRef = useRef<{ width: number } | null>(null);
  const wasPlayingBeforeScrubRef = useRef(false);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const pinchStartFocalRef = useRef<ZoomTranslation | null>(null);
  const pinchStartTranslateRef = useRef<ZoomTranslation>({ x: 0, y: 0 });
  const zoomPanStartTranslateRef = useRef<ZoomTranslation>({ x: 0, y: 0 });
  const videoLayoutRef = useRef<ZoomLayout>({ width: 0, height: 0 });
  const seekFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextAutoplayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upNextIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldAutoplayNextRef = useRef(false);
  const hasNavigatedToNextRef = useRef(false);
  const lastTapRef = useRef(0);
  const videoWidthRef = useRef(0);
  const panScrubStartPositionRef = useRef(0);
  const panScrubLastSeekAtRef = useRef(0);
  const panScrubSeekInFlightRef = useRef(false);
  const panIsScrubbingRef = useRef(false);
  const panWasPlayingBeforeScrubRef = useRef(false);
  const partySyncChannelRef = useRef<RealtimeChannel | null>(null);
  const partySocialChannelRef = useRef<RealtimeChannel | null>(null);
  const partySyncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partySyncApplyingRef = useRef(false);
  const partySyncRoleRef = useRef<"host" | "guest" | null>(null);
  const partySyncUserIdRef = useRef<string | null>(null);
  const lastPartySyncWriteAtRef = useRef(0);
  const lastPartySyncedPositionRef = useRef(0);
  const lastPartySyncedStateRef = useRef<"playing" | "paused" | null>(null);
  const lastBlockedSharedPlaybackControlLogAtRef = useRef(0);
  const partyReactionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const partyOverlayControlsOpacity = useRef(new Animated.Value(1)).current;
  const partyOverlayControlsTranslateY = useRef(new Animated.Value(0)).current;
  const partyPresenceOpacity = useRef(new Animated.Value(1)).current;
  const partyReactionScaleMapRef = useRef<Record<string, Animated.Value>>({});
  const partyReactionTranslateMapRef = useRef<Record<string, Animated.Value>>({});
  const partyReactionOpacityMapRef = useRef<Record<string, Animated.Value>>({});
  const partyLocalReactionScaleMapRef = useRef<Record<string, Animated.Value>>({});
  const partyLocalReactionTranslateMapRef = useRef<Record<string, Animated.Value>>({});
  const partyLocalReactionTranslateXMapRef = useRef<Record<string, Animated.Value>>({});
  const partyLocalReactionOpacityMapRef = useRef<Record<string, Animated.Value>>({});
  const compactControlsOpacity = useRef(new Animated.Value(1)).current;
  const compactControlsTranslateY = useRef(new Animated.Value(0)).current;

  const titleId = useMemo(
    () => String(item?.id ?? (localTitle as any)?.id ?? cleanId).trim(),
    [item?.id, localTitle, cleanId],
  );
  const hasResolvedPlatformTitle = playbackSourceKind !== "creator-video"
    && playbackSourceKind !== "spectator-playback"
    && !expectsSpectatorPlayback
    && !!(item || localTitle);
  const inMyList = useMemo(() => (titleId ? myListIds.includes(titleId) : false), [myListIds, titleId]);
  const nextTitle = useMemo(() => {
    const index = titles.findIndex((entry) => String(entry.id) === titleId);
    if (index < 0 || index >= titles.length - 1) return null;
    return titles[index + 1] ?? null;
  }, [titleId]);
  const nextTitleId = useMemo(() => {
    if (!nextTitle) return "";
    return String(nextTitle.id ?? "").trim();
  }, [nextTitle]);

  const pushPartyOverlayMessage = useCallback((msg: { id: string; author: string; body: string }) => {
    const safeBody = String(msg.body ?? "").trim();
    if (!safeBody) return;

    setPartyOverlayMessages((prev) => {
      if (prev.some((entry) => entry.id === msg.id)) return prev;
      return [...prev.slice(-11), { ...msg, body: safeBody }];
    });
  }, []);

  useEffect(() => {
    const listener = zoomScale.addListener(({ value }) => {
      zoomScaleValueRef.current = value;
      setZoomLevel(value);
    });

    return () => {
      zoomScale.removeListener(listener);
    };
  }, [zoomScale]);

  useEffect(() => {
    const translateXListener = zoomTranslateX.addListener(({ value }) => {
      zoomTranslateXValueRef.current = value;
    });
    const translateYListener = zoomTranslateY.addListener(({ value }) => {
      zoomTranslateYValueRef.current = value;
    });

    return () => {
      zoomTranslateX.removeListener(translateXListener);
      zoomTranslateY.removeListener(translateYListener);
    };
  }, [zoomTranslateX, zoomTranslateY]);

  useEffect(() => {
    let active = true;

    const loadTitle = async () => {
      const routeId = cleanId || String((localTitle as any)?.id ?? "").trim();
      setTitleLoading(true);
      setItem(null);
      setCreatorVideo(null);
      setSpectatorSourceEnded(false);
      setPlaybackSourceKind("title");

      if (!routeId) {
        if (localTitle && active) {
          const chosen = localTitle as any;
          debugLog("player", "match source resolved", { source: localMatchSource });
          setItem(buildLocalPlayerTitle(chosen));
        }
        setTitleLoading(false);
        return;
      }

      try {
        if (expectsCreatorVideo) {
          const video = await readCreatorVideoForPlayer(routeId);
          if (video && active) {
            debugLog("player", "match source resolved", { source: "creator-video:id" });
            setPlaybackSourceKind("creator-video");
            setCreatorVideo(video);
            setItem(buildCreatorPlayerTitle(video));
            setTitleLoading(false);
          } else if (active) {
            setTitleLoading(false);
          }
          return;
        }

        if (expectsSpectatorPlayback) {
          const sourceInfo = await resolveWatchPartyContentSourceByParts({
            sourceType: "spectator_playback",
            sourceId: routeId,
          });
          if (active) {
            debugLog("player", "match source resolved", { source: "spectator-playback:id" });
            setPlaybackSourceKind("spectator-playback");
            setSpectatorSourceEnded(sourceInfo.sourceEnded === true || sourceInfo.unavailableReason === "ended");
            setItem(buildSpectatorPlayerTitle({
              id: routeId,
              title: sourceInfo.displayName,
              thumbnailUrl: sourceInfo.thumbnailUrl,
              playbackUrl: sourceInfo.playbackUrl,
            }));
            setTitleLoading(false);
          }
          return;
        }

        const primary = await supabase
          .from("titles")
          .select(ADVANCED_SELECT)
          .eq("id", routeId)
          .returns<TitleDbAdvancedRow>()
          .maybeSingle();

        if (primary.data && !primary.error) {
          if (active) {
            debugLog("player", "match source resolved", { source: "db:advanced:id" });
            setItem(primary.data);
            setTitleLoading(false);
          }
          return;
        }

        const fallback = await supabase
          .from("titles")
          .select(BASE_SELECT)
          .eq("id", routeId)
          .returns<TitleDbBaseRow>()
          .maybeSingle();

        if (fallback.data && !fallback.error) {
          if (active) {
            debugLog("player", "match source resolved", { source: "db:base:id" });
            setItem(fallback.data);
            setTitleLoading(false);
          }
          return;
        }

        if (localTitle && active) {
          const chosen = localTitle as any;
          debugLog("player", "match source resolved", { source: localMatchSource });
          setItem(buildLocalPlayerTitle(chosen));
          setTitleLoading(false);
          return;
        }

        if (active) {
          if (active) {
            setItem((current) => current ?? null);
            setTitleLoading(false);
          }
        }
      } catch {
        if (active) {
          if (expectsCreatorVideo || expectsSpectatorPlayback) {
            setItem(null);
          } else if (localTitle) {
            const chosen = localTitle as any;
            debugLog("player", "match source resolved", { source: localMatchSource });
            setItem(buildLocalPlayerTitle(chosen));
          }
          setTitleLoading(false);
        }
      }
    };

    loadTitle();

    return () => {
      active = false;
    };
  }, [cleanId, expectsCreatorVideo, expectsSpectatorPlayback, localMatchSource, localTitle]);

  useEffect(() => {
    let active = true;

    readAppConfig()
      .then((config) => {
        if (active) setAppConfig(config);
      })
      .catch(() => {
        if (active) setAppConfig(DEFAULT_APP_CONFIG);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!isSignedIn) {
      setCreatorVideoCommentUserId("");
      return () => {
        active = false;
      };
    }

    void supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        setCreatorVideoCommentUserId(String(data.session?.user?.id ?? "").trim());
      })
      .catch(() => {
        if (active) setCreatorVideoCommentUserId("");
      });

    return () => {
      active = false;
    };
  }, [isSignedIn]);

  useEffect(() => {
    const isStandaloneCreatorVideoPlayer = !inWatchParty
      && !isLiveModeFlag
      && (playbackSourceKind === "creator-video" || expectsCreatorVideo);
    const shouldTrackSharedPartyKeyboard = isSharedPartyPlayback;

    if (!isStandaloneCreatorVideoPlayer && !shouldTrackSharedPartyKeyboard) {
      setCreatorVideoCommentKeyboardOpen(false);
      setWatchPartyCommentKeyboardOpen(false);
      return undefined;
    }

    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        if (isStandaloneCreatorVideoPlayer) setCreatorVideoCommentKeyboardOpen(true);
        if (shouldTrackSharedPartyKeyboard) {
          setWatchPartyCommentKeyboardOpen(true);
          setControlsVisible(true);
        }
      },
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        if (isStandaloneCreatorVideoPlayer) setCreatorVideoCommentKeyboardOpen(false);
        if (shouldTrackSharedPartyKeyboard) setWatchPartyCommentKeyboardOpen(false);
      },
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [expectsCreatorVideo, inWatchParty, isLiveModeFlag, isSharedPartyPlayback, playbackSourceKind]);

  useEffect(() => {
    let active = true;

    const loadMyList = async () => {
      try {
        const ids = await readMyListIds();
        if (active) setMyListIds(ids);
      } catch {
        if (active) setMyListIds([]);
      }
    };

    loadMyList();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadResume = async () => {
      if (!titleId) {
        resumePositionRef.current = 0;
        if (active) setResumeCueMillis(0);
        return;
      }

      try {
        const merged = await readMergedWatchProgress();
        if (!active) return;
        const nextResumeMillis = Math.max(0, merged[titleId]?.positionMillis ?? 0);
        resumePositionRef.current = nextResumeMillis;
        setResumeCueMillis(nextResumeMillis);
      } catch {
        if (!active) return;
        resumePositionRef.current = 0;
        setResumeCueMillis(0);
      }
    };

    loadResume();
    return () => {
      active = false;
    };
  }, [titleId]);

  const applyPartyRoomStateToGuest = useCallback(
    async (partyRoom: WatchPartyState) => {
      if (!inWatchParty) return;
      if (partySyncRoleRef.current === "host") return;
      if (!isVideoReady) return;
      if (partySyncApplyingRef.current) return;

      partySyncApplyingRef.current = true;
      try {
        const roomPosition = Math.max(0, Number(partyRoom.playbackPositionMillis ?? 0));
        const updatedAtMillis = Date.parse(String(partyRoom.updatedAt ?? ""));
        const drift = Number.isFinite(updatedAtMillis) ? Math.max(0, Date.now() - updatedAtMillis) : 0;
        const projected = partyRoom.playbackState === "playing" ? roomPosition + drift : roomPosition;
        const duration = durationRef.current > 0 ? durationRef.current : Number.MAX_SAFE_INTEGER;
        const targetPosition = clamp(projected, 0, duration);
        const offset = targetPosition - currentPositionRef.current;
        const absOffset = Math.abs(offset);
        const shouldHardSeek =
          absOffset >= PARTY_GUEST_SOFT_SEEK_THRESHOLD_MILLIS ||
          (partyRoom.playbackState === "paused" && absOffset > PARTY_GUEST_NOOP_DRIFT_MILLIS);
        const shouldSoftNudge =
          absOffset > PARTY_GUEST_NOOP_DRIFT_MILLIS &&
          absOffset < PARTY_GUEST_SOFT_SEEK_THRESHOLD_MILLIS &&
          partyRoom.playbackState === "playing";

        if (shouldHardSeek) {
          setPartySyncStatus("Resyncing to Host…");
          await videoRef.current?.setPositionAsync(targetPosition).catch(() => {});
          currentPositionRef.current = targetPosition;
          setPositionMillis(targetPosition);
        } else if (shouldSoftNudge) {
          setPartySyncStatus("Resyncing…");
          const nudge = clamp(offset, -PARTY_GUEST_SOFT_NUDGE_MILLIS, PARTY_GUEST_SOFT_NUDGE_MILLIS);
          const nudged = clamp(currentPositionRef.current + nudge, 0, duration);
          await videoRef.current?.setPositionAsync(nudged).catch(() => {});
          currentPositionRef.current = nudged;
          setPositionMillis(nudged);
        }

        if (partyRoom.playbackState === "playing") {
          if (!lastPlaybackIsPlayingRef.current) {
            await videoRef.current?.playAsync().catch(() => {});
          }
        } else if (lastPlaybackIsPlayingRef.current) {
          await videoRef.current?.pauseAsync().catch(() => {});
        }

        if (!shouldHardSeek && !shouldSoftNudge) {
          setPartySyncStatus(`Synced to Host · ${partyRoom.playbackState === "playing" ? "Playing" : "Paused"}`);
        } else {
          setPartySyncStatus(`Synced to Host · ${partyRoom.playbackState === "playing" ? "Playing" : "Paused"}`);
        }
      } finally {
        partySyncApplyingRef.current = false;
      }
    },
    [inWatchParty, isVideoReady],
  );

  useEffect(() => {
    if (!inWatchParty || !partyId || !watchPartyEntryAllowed) {
      setPartySyncRole(null);
      setPartySyncStatus(null);
      partySyncRoleRef.current = null;
      partySyncUserIdRef.current = null;
      if (partySyncChannelRef.current) {
        supabase.removeChannel(partySyncChannelRef.current);
        partySyncChannelRef.current = null;
      }
      if (partySyncPollRef.current) {
        clearInterval(partySyncPollRef.current);
        partySyncPollRef.current = null;
      }
      return;
    }

    let active = true;

    const handleRoomUpdate = (roomState: WatchPartyState | null) => {
      if (!active) return;
      if (!roomState) {
        setPartySyncStatus("Waiting for host…");
        return;
      }
      partyRoomHostUserIdRef.current = String(roomState.hostUserId ?? "").trim();
      const role = partySyncUserIdRef.current && partySyncUserIdRef.current === roomState.hostUserId ? "host" : "guest";
      partySyncRoleRef.current = role;
      setPartySyncRole(role);

      if (role === "host") {
        setPartySyncStatus(`Host Controls · ${roomState.playbackState === "playing" ? "Playing" : "Paused"}`);
        return;
      }

      applyPartyRoomStateToGuest(roomState).catch(() => {});
    };

    const bootstrapPartySync = async () => {
      setPartySyncStatus("Waiting for host…");
      const currentUserId = await getWritablePartyUserId().catch(() => null);
      if (!active) return;
      partySyncUserIdRef.current = String(currentUserId ?? "").trim() || null;

      const initialRoom = await getPartyRoom(partyId).catch(() => null);
      if (!active) return;
      handleRoomUpdate(initialRoom);

      if (partySyncChannelRef.current) {
        supabase.removeChannel(partySyncChannelRef.current);
        partySyncChannelRef.current = null;
      }

      partySyncChannelRef.current = supabase
        .channel(`player-party-room-${partyId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "watch_party_rooms",
            filter: `party_id=eq.${partyId}`,
          },
          () => {
            getPartyRoom(partyId)
              .then((latest: WatchPartyState | null) => {
                handleRoomUpdate(latest);
              })
              .catch(() => {});
          },
        )
        .subscribe();

      if (partySyncPollRef.current) {
        clearInterval(partySyncPollRef.current);
        partySyncPollRef.current = null;
      }

      partySyncPollRef.current = setInterval(() => {
        getPartyRoom(partyId)
          .then((latest: WatchPartyState | null) => {
            handleRoomUpdate(latest);
          })
          .catch(() => {});
      }, 3000);
    };

    bootstrapPartySync();

    return () => {
      active = false;
      if (partySyncChannelRef.current) {
        supabase.removeChannel(partySyncChannelRef.current);
        partySyncChannelRef.current = null;
      }
      if (partySyncPollRef.current) {
        clearInterval(partySyncPollRef.current);
        partySyncPollRef.current = null;
      }
    };
  }, [applyPartyRoomStateToGuest, inWatchParty, partyId, watchPartyEntryAllowed]);

  const updatePartyMembershipMap = useCallback((memberships: WatchPartyRoomMembership[]) => {
    partyMembershipMapRef.current = Object.fromEntries(
      memberships.map((membership) => [membership.userId, membership]),
    );
  }, []);

  useEffect(() => {
    if (!inWatchParty || !partyId) {
      setWatchPartyEntryLoading(false);
      setWatchPartyEntryMissing(false);
      setWatchPartyEntryError(null);
      setWatchPartyAccess(null);
      setWatchPartyPremiumGate(null);
      setWatchPartyPremiumSheetVisible(false);
      return;
    }

    let active = true;
    setWatchPartyEntryLoading(true);
    setWatchPartyEntryMissing(false);
    setWatchPartyEntryError(null);
    setWatchPartyAccess(null);
    setWatchPartyPremiumGate(null);

    (async () => {
      const snapshot = await getPartyRoomSnapshot(partyId).catch(() => null);
      if (!active) return;

      if (!snapshot) {
        setWatchPartyEntryMissing(true);
        setWatchPartyEntryLoading(false);
        return;
      }
      partyRoomHostUserIdRef.current = String(snapshot.room.hostUserId ?? "").trim();

      const roomSourceType = resolveWatchPartySourceType(snapshot.room);
      const roomSourceId = resolveWatchPartySourceId(snapshot.room);
      if (snapshot.room.roomType !== "title") {
        setWatchPartyEntryError("This room belongs to Live Watch-Party, not Watch-Party Live.");
        setWatchPartyEntryLoading(false);
        return;
      }

      if (roomSourceType === "creator_video" && (!expectsCreatorVideo || String(roomSourceId ?? "") !== cleanId)) {
        setWatchPartyEntryError("This watch party is linked to a different creator video source.");
        setWatchPartyEntryLoading(false);
        return;
      }

      if (roomSourceType === "spectator_playback" && (!expectsSpectatorPlayback || String(roomSourceId ?? "") !== cleanId)) {
        setWatchPartyEntryError("This watch party is linked to a different spectator source.");
        setWatchPartyEntryLoading(false);
        return;
      }

      if (
        roomSourceType === "platform_title"
        && (expectsCreatorVideo || expectsSpectatorPlayback || String(roomSourceId ?? snapshot.room.titleId ?? "") !== cleanId)
      ) {
        setWatchPartyEntryError("This watch party is linked to a different title source.");
        setWatchPartyEntryLoading(false);
        return;
      }

      const premiumAccess = await requireWatchPartyLivePremium({ accessKey: partyId }).catch(() => null);
      if (!active) return;

      if (!premiumAccess?.allowed) {
        if (isRuntimeControlBlockedAccess(premiumAccess)) {
          const blockedCopy = getRuntimeControlBlockedCopy(premiumAccess);
          setWatchPartyEntryError(blockedCopy.message);
          setWatchPartyPremiumGate(null);
          setWatchPartyPremiumSheetVisible(false);
          trackEvent("runtime_control_blocked", {
            surface: "watch-party-live-player-entry",
            controlKey: premiumAccess?.runtimeControlKey ?? "watch_party_live_enabled",
            roomId: partyId,
          });
          setWatchPartyEntryLoading(false);
          return;
        }
        if (premiumAccess) setWatchPartyPremiumGate(premiumAccess);
        setWatchPartyPremiumSheetVisible(true);
        trackEvent("monetization_gate_shown", {
          surface: "watch-party-live-player-entry",
          reason: premiumAccess?.reason ?? "premium_required",
          roomId: partyId,
        });
        setWatchPartyEntryLoading(false);
        return;
      }

      updatePartyMembershipMap(snapshot.memberships);
      const writableUserId = await getWritablePartyUserId().catch(() => null);
      if (!active) return;
      const trackedUserId = String(writableUserId ?? "").trim();
      const membership = trackedUserId
        ? snapshot.memberships.find((entry) => entry.userId === trackedUserId) ?? null
        : null;
      const access = await resolveRoomAccess({
        roomSurface: "watch_party",
        partyId,
        room: snapshot.room,
        membership,
        ...(trackedUserId ? { userId: trackedUserId } : {}),
      }).catch(() => null);
      if (!active) return;

      if (!access) {
        setWatchPartyEntryError("Unable to confirm watch-party access right now.");
        setWatchPartyEntryLoading(false);
        return;
      }

      setWatchPartyAccess(access);
      setWatchPartyEntryLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [cleanId, expectsCreatorVideo, expectsSpectatorPlayback, inWatchParty, partyId, updatePartyMembershipMap, watchPartyEntryRetryToken]);

  const refreshPartyMembershipSnapshot = useCallback(async () => {
    if (!partyId) return null;
    const snapshot = await getPartyRoomSnapshot(partyId).catch(() => null);
    if (!snapshot) return null;
    partyRoomHostUserIdRef.current = String(snapshot.room.hostUserId ?? "").trim();
    updatePartyMembershipMap(snapshot.memberships);
    return snapshot;
  }, [partyId, updatePartyMembershipMap]);

  const getWatchPartyHostAuthority = useCallback((userIdOverride?: string | null) => {
    const currentUserId = String(
      userIdOverride
      ?? partyUserIdRef.current
      ?? partySyncUserIdRef.current
      ?? "",
    ).trim();
    const membershipRole = currentUserId ? partyMembershipMapRef.current[currentUserId]?.role ?? null : null;
    const roomHostUserId = String(partyRoomHostUserIdRef.current ?? "").trim();
    const sources = [
      partySyncRoleRef.current === "host" ? "sync-role" : "",
      membershipRole === "host" ? "membership" : "",
      currentUserId && roomHostUserId && currentUserId === roomHostUserId ? "room-host" : "",
    ].filter(Boolean);

    return {
      isHost: sources.length > 0,
      source: sources.join("+") || "none",
      currentUserId,
      partySyncRole: partySyncRoleRef.current,
      membershipRole,
      roomHostUserId,
    };
  }, []);

  const getSharedPlaybackControlAuthority = useCallback(() => {
    const authority = getWatchPartyHostAuthority();
    return {
      ...authority,
      canControl: !isSharedPartyPlayback || authority.isHost,
    };
  }, [getWatchPartyHostAuthority, isSharedPartyPlayback]);

  const blockViewerSharedPlaybackControl = useCallback((control: string) => {
    const authority = getSharedPlaybackControlAuthority();
    if (authority.canControl) return false;

    setControlsVisible(true);
    setPartySyncStatus("Synced to Host · Controls locked");

    const now = Date.now();
    if (now - lastBlockedSharedPlaybackControlLogAtRef.current > 1000) {
      lastBlockedSharedPlaybackControlLogAtRef.current = now;
      debugLog("player", "blocked viewer shared playback control", {
        control,
        roomName: partyId ?? null,
        currentUserId: authority.currentUserId || null,
        hostAuthoritySource: authority.source,
        partySyncRole: authority.partySyncRole,
        membershipRole: authority.membershipRole,
        roomHostUserId: authority.roomHostUserId || null,
      });
    }

    return true;
  }, [getSharedPlaybackControlAuthority, partyId]);

  const setPendingPartySeatRequest = useCallback((
    participantId: string,
    pending: boolean,
    source: string,
    sentAt = Date.now(),
  ) => {
    const cleanParticipantId = String(participantId ?? "").trim();
    if (!cleanParticipantId) return;
    if (pending) {
      pendingPartySeatRequestsRef.current[cleanParticipantId] = {
        sentAt: Number.isFinite(sentAt) && sentAt > 0 ? sentAt : Date.now(),
        source,
      };
    } else {
      delete pendingPartySeatRequestsRef.current[cleanParticipantId];
    }
  }, []);

  const hasPendingPartySeatRequest = useCallback((participantId: string, canSpeak: boolean) => {
    if (canSpeak) {
      delete pendingPartySeatRequestsRef.current[participantId];
      return false;
    }
    const pending = pendingPartySeatRequestsRef.current[participantId];
    if (!pending) return false;
    if (pending.sentAt > 0 && Date.now() - pending.sentAt > PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS) {
      delete pendingPartySeatRequestsRef.current[participantId];
      return false;
    }
    return true;
  }, []);

  const applyPendingSeatRequestToParticipant = useCallback((participant: PartyParticipant) => {
    const authority = getWatchPartyHostAuthority();
    if (!authority.isHost) return participant;
    const isRequestingToSpeak = hasPendingPartySeatRequest(participant.id, participant.canSpeak);
    if (participant.isRequestingToSpeak === isRequestingToSpeak) return participant;
    return { ...participant, isRequestingToSpeak };
  }, [getWatchPartyHostAuthority, hasPendingPartySeatRequest]);

  const clearPendingPartySeatRequest = useCallback((participantId: string, source: string) => {
    setPendingPartySeatRequest(participantId, false, source);
  }, [setPendingPartySeatRequest]);

  const syncCurrentPartyPresence = useCallback(async (overrides?: Partial<{
    canSpeak: boolean;
    stageRole: "host" | "speaker" | "listener";
    isRequestingToSpeak: boolean;
    muted: boolean;
  }>) => {
    const channel = partySocialChannelRef.current;
    const trackedUserId = String(partySyncUserIdRef.current ?? partyUserIdRef.current ?? "").trim();
    if (!channel || !trackedUserId) return;

    const membership = partyMembershipMapRef.current[trackedUserId];
    const role = membership?.role === "host" ? "host" : "viewer";
    const currentParticipant = partyParticipantsRef.current.find((entry) => entry.id === trackedUserId);
    const canSpeak = overrides?.canSpeak ?? membership?.canSpeak ?? role === "host";
    const stageRole = overrides?.stageRole ?? derivePartyStageRole({
      role: role === "host" ? "host" : "viewer",
      canSpeak,
      currentStageRole: membership?.stageRole,
    });

    await channel.track({
      userId: trackedUserId,
      username: partyDisplayNameRef.current,
      avatarUrl: partyAvatarUrlRef.current || undefined,
      cameraPreviewUrl: myCameraPreviewUrlRef.current || undefined,
      role,
      displayName: partyDisplayNameRef.current,
      isLive: true,
      avatarIndex: Number.parseInt(trackedUserId.slice(-3), 16) % 70,
      canSpeak,
      stageRole,
      muted: overrides?.muted ?? membership?.isMuted ?? currentParticipant?.muted ?? false,
      isRequestingToSpeak: overrides?.isRequestingToSpeak ?? currentParticipant?.isRequestingToSpeak ?? false,
    }).catch(() => {});
  }, []);

  const persistPartySeatRequestMarker = useCallback(async (participantId: string, pending: boolean) => {
    if (!partyId || !participantId) return false;
    const persisted = await sendPartyMessage(
      partyId,
      participantId,
      "system",
      encodePartySeatRequestMessage(participantId, pending),
      { username: partyDisplayNameRef.current || "Guest" },
    ).catch(() => false);
    debugLog("livekit", "watch-party-live seat request marker persisted", {
      roomName: partyId,
      currentUserId: partyUserId || partySyncUserIdRef.current,
      participantId,
      pending,
      persisted,
    });
    return persisted;
  }, [partyId, partyUserId]);

  const broadcastPartySeatRequest = useCallback(async (participantId: string, pending: boolean) => {
    const markerPersisted = await persistPartySeatRequestMarker(participantId, pending);
    if (!markerPersisted) {
      throw new Error("watch_party_live_seat_request_marker_unavailable");
    }
    const channel = partySocialChannelRef.current;
    if (!channel) {
      debugLog("livekit", "watch-party-live seat request broadcast skipped; durable marker already persisted", {
        roomName: partyId,
        currentUserId: partyUserId || partySyncUserIdRef.current,
        participantId,
        pending,
      });
      return;
    }
    const sendStatus = await channel.send({
      type: "broadcast",
      event: "participant:seat-request",
      payload: {
        participantId,
        pending,
      },
    });
    debugLog("livekit", "watch-party-live seat request sent", {
      roomName: partyId,
      currentUserId: partyUserId || partySyncUserIdRef.current,
      participantId,
      pending,
      sendStatus: String(sendStatus ?? "unknown"),
      markerPersisted,
    });
    if (sendStatus === "error" || sendStatus === "timed out") {
      debugLog("livekit", "watch-party-live seat request broadcast failed after durable marker", {
        roomName: partyId,
        currentUserId: partyUserId || partySyncUserIdRef.current,
        participantId,
        pending,
        sendStatus: String(sendStatus),
      });
    }
  }, [partyId, partyUserId, persistPartySeatRequestMarker]);

  const broadcastPartySeatState = useCallback(async (participantId: string, options: {
    canSpeak: boolean;
    stageRole: "host" | "speaker" | "listener";
    isRequestingToSpeak?: boolean;
    isMuted?: boolean;
  }) => {
    if (!partySocialChannelRef.current) return;
    await partySocialChannelRef.current.send({
      type: "broadcast",
      event: "participant:seat-state",
      payload: {
        participantId,
        canSpeak: options.canSpeak,
        stageRole: options.stageRole,
        isRequestingToSpeak: !!options.isRequestingToSpeak,
        isMuted: options.isMuted,
      },
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!inWatchParty || !partyId || !watchPartyEntryAllowed) {
      setWatchPartyLiveKitJoinContract((current) => (current ? null : current));
      setPartyViewerCount((current) => (current === 0 ? current : 0));
      setViewerCount((current) => (current === 1 ? current : 1));
      setPartyParticipantPreview((current) => (current.length === 0 ? current : []));
      setPartyParticipants((current) => (current.length === 0 ? current : []));
      setPartyUserId((current) => (current ? "" : current));
      setPartyChatOpen((current) => (current ? false : current));
      setPartyCommentDraft((current) => (current ? "" : current));
      setPartyCommentSending((current) => (current ? false : current));
      setPartyOverlayMessages((current) => (current.length === 0 ? current : []));
      setPartyReactionBursts((current) => (current.length === 0 ? current : []));
      partyMembershipMapRef.current = {};
      partyAvatarUrlRef.current = "";
      Object.values(partyReactionTimersRef.current).forEach((timer) => clearTimeout(timer));
      partyReactionTimersRef.current = {};
      if (partySocialChannelRef.current) {
        supabase.removeChannel(partySocialChannelRef.current);
        partySocialChannelRef.current = null;
      }
      partyRoomHostUserIdRef.current = "";
      pendingPartySeatRequestsRef.current = {};
      return;
    }

    let active = true;

    const pushReactionBurst = (emojiRaw: unknown) => {
      const emoji = String(emojiRaw ?? "").trim();
      if (!emoji) return;
      const id = `party-react-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const scale = new Animated.Value(0.8);
      const translateY = new Animated.Value(0);
      const opacity = new Animated.Value(1);
      partyReactionScaleMapRef.current[id] = scale;
      partyReactionTranslateMapRef.current[id] = translateY;
      partyReactionOpacityMapRef.current[id] = opacity;

      setPartyReactionBursts((prev) => [...prev.slice(-2), { id, emoji }]);

      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.1,
            duration: 130,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 120,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translateY, {
          toValue: -18,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(640),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      partyReactionTimersRef.current[id] = setTimeout(() => {
        setPartyReactionBursts((prev) => prev.filter((entry) => entry.id !== id));
        delete partyReactionTimersRef.current[id];
        delete partyReactionScaleMapRef.current[id];
        delete partyReactionTranslateMapRef.current[id];
        delete partyReactionOpacityMapRef.current[id];
      }, 1100);
    };

    const bootstrapPartySocial = async () => {
      const safeUserId = String(
        partySyncUserIdRef.current || (await getWritablePartyUserId().catch(() => null)) || "",
      ).trim();
      if (!safeUserId) return;
      const trackedUserId = safeUserId;
      if (!active) return;
      setPartyUserId(trackedUserId);

      let displayName = "Guest";
      let authUserId = "";
      let profileAvatarUrl = "";
      let profileCameraPreviewUrl = "";
      try {
        const authUser = await supabase.auth.getUser();
        authUserId = String(authUser.data.user?.id ?? "").trim();
        const metadata = authUser.data.user?.user_metadata as Record<string, unknown> | undefined;
        const metadataName = String(metadata?.full_name ?? metadata?.name ?? "").trim();
        profileAvatarUrl = String(metadata?.avatar_url ?? metadata?.picture ?? "").trim();
        profileCameraPreviewUrl = String(metadata?.camera_preview_url ?? metadata?.cameraPreviewUrl ?? "").trim();
        if (metadataName) {
          displayName = metadataName || "Guest";
        }
      } catch {
        // keep fallback displayName
      }
      partyDisplayNameRef.current = displayName;
      partyAvatarUrlRef.current = profileAvatarUrl;
      myCameraPreviewUrlRef.current = profileCameraPreviewUrl;
      const selfIdentityIds = new Set([
        trackedUserId,
        String(partySyncUserIdRef.current ?? "").trim(),
        authUserId,
      ].filter(Boolean));
      const isCurrentIdentity = (value: unknown) => {
        const resolved = String(value ?? "").trim();
        return !!resolved && selfIdentityIds.has(resolved);
      };

      const applyMembershipSnapshotToParticipants = (snapshot: WatchPartyRoomSnapshot | null) => {
        if (!snapshot) return;
        const activeMemberships = getActivePartyMemberships(snapshot.memberships);
        if (activeMemberships.length === 0) return;

        setPartyViewerCount(activeMemberships.length);
        setViewerCount(activeMemberships.length);
        setPartyParticipantPreview(
          activeMemberships.slice(0, 3).map((membership) => {
            const role = membership.role === "host" ? "host" : "viewer";
            return resolvePartyParticipantDisplayName({
              isCurrentUser: isCurrentIdentity(membership.userId),
              role,
              candidates: [membership.displayName],
            });
          }),
        );

        setPartyParticipants((prev) => {
          const previousById = new Map(prev.map((entry) => [entry.id, entry]));
          const next = activeMemberships.map((membership) => {
            const existing = previousById.get(membership.userId);
            const role: "host" | "co-host" | "viewer" = membership.role === "host" ? "host" : "viewer";
            const isCurrentUser = isCurrentIdentity(membership.userId);

            const nextParticipant = {
              id: membership.userId,
              name: resolvePartyParticipantDisplayName({
                isCurrentUser,
                role,
                candidates: [membership.displayName, existing?.name],
              }),
              role,
              avatarUrl:
                membership.avatarUrl
                || existing?.avatarUrl
                || (isCurrentUser ? profileAvatarUrl || undefined : undefined),
              cameraPreviewUrl:
                membership.cameraPreviewUrl
                || existing?.cameraPreviewUrl
                || (isCurrentUser ? profileCameraPreviewUrl || undefined : undefined),
              stageRole: derivePartyStageRole({
                role,
                canSpeak: membership.canSpeak,
                currentStageRole: membership.stageRole,
              }),
              isLive: true,
              muted: membership.isMuted,
              canSpeak: membership.canSpeak,
              isSpeaking: existing?.isSpeaking ?? false,
              isRequestingToSpeak: existing?.isRequestingToSpeak ?? false,
            } satisfies PartyParticipant;
            return applyPendingSeatRequestToParticipant(nextParticipant);
          });

          next.sort((a, b) => {
            const aMe = isCurrentIdentity(a.id) ? 1 : 0;
            const bMe = isCurrentIdentity(b.id) ? 1 : 0;
            if (aMe !== bMe) return bMe - aMe;
            const rank = (participant: PartyParticipant) => {
              if (participant.role === "host") return 0;
              if (participant.canSpeak) return 1;
              if (participant.isRequestingToSpeak) return 2;
              return 3;
            };
            const roleDiff = rank(a) - rank(b);
            if (roleDiff !== 0) return roleDiff;
            return a.name.localeCompare(b.name);
          });

          return next;
        });
      };

      const refreshMembershipRosterFromAuthority = async (force = false) => {
        const now = Date.now();
        if (!force && now - lastPartyMembershipRosterRefreshAtRef.current < 2500) return null;
        lastPartyMembershipRosterRefreshAtRef.current = now;
        const snapshot = await refreshPartyMembershipSnapshot().catch(() => null);
        if (!active || !snapshot) return snapshot;
        applyMembershipSnapshotToParticipants(snapshot);
        return snapshot;
      };

      const currentUserCanApproveSeatRequests = () => getWatchPartyHostAuthority(trackedUserId);

      const applySeatRequestState = (participantId: string, pending: boolean, source: string, sentAt = Date.now()) => {
        const authority = currentUserCanApproveSeatRequests();
        if (!authority.isHost) return;
        setPendingPartySeatRequest(participantId, pending, source, sentAt);
        setPartyParticipants((prev) => {
          let found = false;
          const next = prev.map((entry) => {
            if (entry.id !== participantId) return entry;
            found = true;
            const nextEntry = { ...entry, isRequestingToSpeak: pending && !entry.canSpeak };
            return applyPendingSeatRequestToParticipant(nextEntry);
          });
          if (found || !pending) return next;
          const membership = partyMembershipMapRef.current[participantId];
          if (!membership) return next;
          const role: PartyParticipant["role"] = membership.role === "host" ? "host" : "viewer";
          return [
            ...next,
            applyPendingSeatRequestToParticipant({
              id: participantId,
              name: resolvePartyParticipantDisplayName({
                isCurrentUser: isCurrentIdentity(participantId),
                role,
                candidates: [membership.displayName],
              }),
              role,
              avatarUrl: membership.avatarUrl || undefined,
              cameraPreviewUrl: membership.cameraPreviewUrl || undefined,
              stageRole: derivePartyStageRole({
                role,
                canSpeak: membership.canSpeak,
                currentStageRole: membership.stageRole,
              }),
              isLive: true,
              muted: membership.isMuted,
              canSpeak: membership.canSpeak,
              isSpeaking: false,
              isRequestingToSpeak: !membership.canSpeak,
            }),
          ];
        });

        debugLog("livekit", "watch-party-live seat request applied", {
          roomName: partyId,
          currentUserId: trackedUserId,
          participantId,
          pending,
          source,
          currentUserIsHost: authority.isHost,
          hostAuthoritySource: authority.source,
          pendingSeatRequestIds: Object.keys(pendingPartySeatRequestsRef.current),
          visibleParticipantIds: partyParticipantsRef.current.map((participant) => participant.id),
        });

        if (!partyMembershipMapRef.current[participantId]) {
          refreshMembershipRosterFromAuthority(true).finally(() => {
            if (active) applySeatRequestState(participantId, pending, `${source}:after-membership-refresh`);
          });
        }
      };

      const applyPersistedSeatRequestMessages = (
        messages: Array<{ body: string; createdAt?: string }>,
        source: string,
      ) => {
        const authority = currentUserCanApproveSeatRequests();
        if (!authority.isHost) return;
        const latestByParticipant = new Map<string, { pending: boolean; sentAt: number }>();
        messages.forEach((message) => {
          const marker = decodePartySeatRequestMessage(message.body);
          if (!marker) return;
          const sentAt = marker.sentAt || Date.parse(String(message.createdAt ?? ""));
          latestByParticipant.set(marker.participantId, {
            pending: marker.pending,
            sentAt: Number.isFinite(sentAt) ? sentAt : 0,
          });
        });

        latestByParticipant.forEach(({ pending, sentAt }, participantId) => {
          if (participantId === trackedUserId) return;
          if (pending && sentAt > 0 && Date.now() - sentAt > PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS) {
            setPendingPartySeatRequest(participantId, false, `${source}:expired`, sentAt);
            return;
          }
          applySeatRequestState(participantId, pending, source, sentAt);
        });
      };

      const initialSnapshot = await refreshPartyMembershipSnapshot().catch(() => null);
      if (!active) return;
      applyMembershipSnapshotToParticipants(initialSnapshot);

      if (initialSnapshot) {
        const existingMembership = initialSnapshot.memberships.find((membership) => membership.userId === trackedUserId) ?? null;
        await joinPartyRoomSession({
          partyId,
          userId: trackedUserId,
          role: trackedUserId === initialSnapshot.room.hostUserId ? "host" : existingMembership?.role ?? "viewer",
          stageRole: existingMembership?.stageRole,
          canSpeak: existingMembership?.canSpeak ?? trackedUserId === initialSnapshot.room.hostUserId,
          cameraEnabled: !!profileCameraPreviewUrl,
          micEnabled: true,
          displayName,
          avatarUrl: profileAvatarUrl,
          cameraPreviewUrl: profileCameraPreviewUrl,
        }).catch(() => null);
        const refreshedSnapshot = await refreshPartyMembershipSnapshot().catch(() => null);
        applyMembershipSnapshotToParticipants(refreshedSnapshot);
      }

      const history = await fetchPartyMessages(partyId, 30).catch(() => []);
      if (!active) return;
      const chatHistory = history
        .filter((m) => m.kind === "chat" && !decodePartySeatRequestMessage(m.body))
        .slice(-8)
        .map((m) => ({
          id: m.id,
          author: isCurrentIdentity(m.userId) ? "You" : String((m as any).authorLabel ?? "").trim() || "Guest",
          body: String(m.body ?? ""),
        }));
      setPartyOverlayMessages(chatHistory);
      applyPersistedSeatRequestMessages(
        history.map((message) => ({ body: String(message.body ?? ""), createdAt: message.createdAt })),
        "history",
      );

      const channelName = `party-chat-${partyId}`;
      const channelsToRemove = supabase
        .getChannels()
        .filter(
          (existingChannel) =>
            existingChannel === partySocialChannelRef.current ||
            existingChannel.topic === channelName ||
            existingChannel.topic === `realtime:${channelName}`,
        );
      partySocialChannelRef.current = null;
      if (channelsToRemove.length > 0) {
        await Promise.all(channelsToRemove.map((existingChannel) => supabase.removeChannel(existingChannel).catch(() => null)));
      }

      const channel = supabase.channel(channelName, {
        config: { presence: { key: trackedUserId } },
      });
      partySocialChannelRef.current = channel;

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{
          userId?: string;
          username?: string;
          role?: string;
          stageRole?: string;
          displayName?: string;
          avatarIndex?: number;
          avatarUrl?: string;
          cameraPreviewUrl?: string;
          camera_preview_url?: string;
          isLive?: boolean;
          muted?: boolean;
          canSpeak?: boolean;
          isSpeaking?: boolean;
          isRequestingToSpeak?: boolean;
        }>();
        const entries = Object.entries(state);
        setPartyViewerCount(entries.length);
        setViewerCount(entries.length);
        const preview = entries
          .slice(0, 3)
          .map(([key, presArr]) => {
            const first = Array.isArray(presArr)
              ? (presArr[0] as {
                  userId?: string;
                  username?: string;
                  role?: string;
                  stageRole?: string;
                  displayName?: string;
                  avatarIndex?: number;
                  avatarUrl?: string;
                  cameraPreviewUrl?: string;
                  camera_preview_url?: string;
                  isLive?: boolean;
                  muted?: boolean;
                  canSpeak?: boolean;
                  isSpeaking?: boolean;
                  isRequestingToSpeak?: boolean;
                })
              : undefined;
            const resolvedUserId = String(first?.userId ?? key).trim();
            const isCurrentUser = isCurrentIdentity(resolvedUserId);
            const membership = partyMembershipMapRef.current[resolvedUserId];
            const rawRole = String(membership?.role ?? first?.role ?? "").trim().toLowerCase();
            const role: "host" | "co-host" | "viewer" =
              rawRole === "host" ? "host" : rawRole === "co-host" || rawRole === "cohost" ? "co-host" : "viewer";
            return resolvePartyParticipantDisplayName({
              isCurrentUser,
              role,
              candidates: [membership?.displayName, first?.username, first?.displayName],
            });
          });
        setPartyParticipantPreview(preview);

        setPartyParticipants((prev) => {
          const previousById = new Map(prev.map((entry) => [entry.id, entry]));
          const next = entries.map(([key, presArr]) => {
            const presence = Array.isArray(presArr)
              ? (presArr[0] as {
                  userId?: string;
                  username?: string;
                  role?: string;
                  stageRole?: string;
                  displayName?: string;
                  avatarIndex?: number;
                  avatarUrl?: string;
                  cameraPreviewUrl?: string;
                  camera_preview_url?: string;
                  isLive?: boolean;
                  muted?: boolean;
                  canSpeak?: boolean;
                  isSpeaking?: boolean;
                  isRequestingToSpeak?: boolean;
                })
              : undefined;
            const resolvedUserId = String(presence?.userId ?? key).trim();
            const existing = previousById.get(resolvedUserId);
            const membership = partyMembershipMapRef.current[resolvedUserId];
            const rawRole = String(
              membership?.role
              ?? presence?.role
              ?? existing?.role
              ?? "",
            ).trim().toLowerCase();
            const role: "host" | "co-host" | "viewer" =
              rawRole === "host" ? "host" : rawRole === "co-host" || rawRole === "cohost" ? "co-host" : "viewer";
            const canSpeakFromPresence =
              typeof membership?.canSpeak === "boolean"
                ? membership.canSpeak
                : typeof presence?.canSpeak === "boolean"
                  ? presence.canSpeak
                  : typeof existing?.canSpeak === "boolean"
                    ? existing.canSpeak
                    : role === "host" || role === "co-host";
            const stageRole = derivePartyStageRole({
              role,
              canSpeak: canSpeakFromPresence,
              currentStageRole:
                membership?.stageRole
                ?? presence?.stageRole
                ?? existing?.stageRole,
            });
            const isCurrentUser = isCurrentIdentity(resolvedUserId);
            const resolvedName = resolvePartyParticipantDisplayName({
              isCurrentUser,
              role,
              candidates: [
                membership?.displayName,
                presence?.username,
                presence?.displayName,
                existing?.name,
                isCurrentUser ? displayName : "",
              ],
            });
            const resolvedAvatarUrl =
              String(presence?.avatarUrl ?? membership?.avatarUrl ?? "").trim()
              || (isCurrentUser ? profileAvatarUrl : "");
            const resolvedCameraPreviewUrl =
              String(presence?.cameraPreviewUrl ?? presence?.camera_preview_url ?? membership?.cameraPreviewUrl ?? "").trim()
              || (isCurrentUser ? profileCameraPreviewUrl : "");

            const nextParticipant = {
              id: resolvedUserId,
              name: resolvedName,
              role,
              avatarUrl: resolvedAvatarUrl || existing?.avatarUrl,
              cameraPreviewUrl: resolvedCameraPreviewUrl || existing?.cameraPreviewUrl,
              stageRole,
              isLive: typeof presence?.isLive === "boolean" ? presence.isLive : existing?.isLive,
              muted: typeof presence?.muted === "boolean" ? presence.muted : membership?.isMuted ?? existing?.muted ?? false,
              canSpeak: canSpeakFromPresence,
              isSpeaking: typeof presence?.isSpeaking === "boolean" ? presence.isSpeaking : existing?.isSpeaking ?? false,
              isRequestingToSpeak:
                typeof presence?.isRequestingToSpeak === "boolean"
                  ? presence.isRequestingToSpeak
                  : existing?.isRequestingToSpeak ?? false,
            } satisfies PartyParticipant;
            return applyPendingSeatRequestToParticipant(nextParticipant);
          });

          const hasSelf = next.some((entry) => isCurrentIdentity(entry.id));
          if (!hasSelf) {
            const selfMembership = partyMembershipMapRef.current[trackedUserId];
            next.unshift(applyPendingSeatRequestToParticipant({
              id: trackedUserId,
              name: "You",
              role: selfMembership?.role === "host" ? "host" : "viewer",
              avatarUrl: previousById.get(trackedUserId)?.avatarUrl || profileAvatarUrl || undefined,
              cameraPreviewUrl: previousById.get(trackedUserId)?.cameraPreviewUrl || profileCameraPreviewUrl || undefined,
              stageRole: derivePartyStageRole({
                role: selfMembership?.role === "host" ? "host" : "viewer",
                canSpeak: selfMembership?.canSpeak ?? partySyncRoleRef.current === "host",
                currentStageRole: selfMembership?.stageRole,
              }),
              isLive: true,
              muted: previousById.get(trackedUserId)?.muted ?? selfMembership?.isMuted ?? false,
              canSpeak: previousById.get(trackedUserId)?.canSpeak ?? selfMembership?.canSpeak ?? partySyncRoleRef.current === "host",
              isSpeaking: previousById.get(trackedUserId)?.isSpeaking ?? false,
              isRequestingToSpeak: previousById.get(trackedUserId)?.isRequestingToSpeak ?? false,
            }));
          }

          next.sort((a, b) => {
            const aMe = isCurrentIdentity(a.id) ? 1 : 0;
            const bMe = isCurrentIdentity(b.id) ? 1 : 0;
            if (aMe !== bMe) return bMe - aMe;
            const rank = (participant: PartyParticipant) => {
              if (participant.role === "host") return 0;
              if (participant.canSpeak) return 1;
              if (participant.isRequestingToSpeak) return 2;
              return 3;
            };
            const roleDiff = rank(a) - rank(b);
            if (roleDiff !== 0) return roleDiff;
            return a.name.localeCompare(b.name);
          });

          return next;
        });

        refreshMembershipRosterFromAuthority().catch(() => null);
      });

      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "watch_party_room_messages",
          filter: `party_id=eq.${partyId}`,
        },
        (payload) => {
          const row = (payload as { new?: { text?: unknown; body?: unknown; created_at?: unknown } }).new;
          const marker = decodePartySeatRequestMessage(row?.text ?? row?.body);
          if (!marker) return;
        debugLog("livekit", "watch-party-live seat request message received", {
          roomName: partyId,
          currentUserId: trackedUserId,
          participantId: marker.participantId,
          pending: marker.pending,
            currentUserIsHost: currentUserCanApproveSeatRequests().isHost,
            hostAuthoritySource: currentUserCanApproveSeatRequests().source,
          });
          if (!currentUserCanApproveSeatRequests().isHost || marker.participantId === trackedUserId) return;
          if (
            marker.pending
            && marker.sentAt > 0
            && Date.now() - marker.sentAt > PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS
          ) {
            return;
          }
          applySeatRequestState(marker.participantId, marker.pending, "message-insert", marker.sentAt);
        },
      );

      channel.on("broadcast", { event: "participant:seat-request" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const participantId = String(payload?.participantId ?? "").trim();
        if (!participantId) return;
        const pending = !!payload?.pending;
        applySeatRequestState(participantId, pending, "broadcast");
        debugLog("livekit", "watch-party-live seat request received", {
          roomName: partyId,
          currentUserId: trackedUserId,
          participantId,
          pending,
          currentUserIsHost: currentUserCanApproveSeatRequests().isHost,
          hostAuthoritySource: currentUserCanApproveSeatRequests().source,
        });
        if (
          pending
          && participantId !== trackedUserId
          && currentUserCanApproveSeatRequests().isHost
        ) {
          const requesterMembership = partyMembershipMapRef.current[participantId];
          setActiveParticipantId(participantId);
          setActiveParticipantToolsId(participantId);
          setControlsVisible(true);
          pushPartyOverlayMessage({
            id: `party-seat-request-${participantId}-${Date.now()}`,
            author: "Camera request",
            body: `${requesterMembership?.displayName || "Viewer"} wants to be visible.`,
          });
        }
        if (participantId === trackedUserId) {
          syncCurrentPartyPresence({ isRequestingToSpeak: pending }).catch(() => {});
        }
      });

      channel.on("broadcast", { event: "participant:seat-state" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const participantId = String(payload?.participantId ?? "").trim();
        if (!participantId) return;
        const nextCanSpeak = !!payload?.canSpeak;
        const hasMutedPayload = typeof payload?.isMuted === "boolean";
        const nextMuted = hasMutedPayload ? !!payload.isMuted : undefined;
        const nextStageRole = derivePartyStageRole({
          role: partyMembershipMapRef.current[participantId]?.role === "host" ? "host" : "viewer",
          canSpeak: nextCanSpeak,
          currentStageRole: String(payload?.stageRole ?? ""),
        });

        const currentMembership = partyMembershipMapRef.current[participantId];
        if (currentMembership) {
          partyMembershipMapRef.current[participantId] = {
            ...currentMembership,
            canSpeak: nextCanSpeak,
            stageRole: nextStageRole,
            isMuted: nextMuted ?? currentMembership.isMuted,
          };
        } else {
          refreshMembershipRosterFromAuthority(true).catch(() => null);
        }

        setPartyParticipants((prev) =>
          prev.map((entry) =>
            entry.id === participantId
              ? {
                  ...entry,
                  canSpeak: nextCanSpeak,
                  stageRole: nextStageRole,
                  muted: nextMuted ?? entry.muted,
                  isRequestingToSpeak: !!payload?.isRequestingToSpeak,
                  isSpeaking: nextCanSpeak ? entry.isSpeaking : false,
                }
              : entry,
          ),
        );

        if (participantId === trackedUserId) {
          syncCurrentPartyPresence({
            canSpeak: nextCanSpeak,
            stageRole: nextStageRole,
            muted: nextMuted,
            isRequestingToSpeak: !!payload?.isRequestingToSpeak,
          }).catch(() => {});
        }
      });

      channel.on("broadcast", { event: "reaction" }, ({ payload }: { payload: Record<string, unknown> }) => {
        pushReactionBurst(payload?.emoji);
      });

      channel.on("broadcast", { event: "message" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const kind = payload?.kind;
        if (kind !== "chat") return;
        const body = String(payload?.body ?? "").trim();
        if (!body) return;
        if (decodePartySeatRequestMessage(body)) return;
        const authorLabel = String(payload?.authorLabel ?? "User");
        const incomingUserId = String(payload?.userId ?? "").trim();
        pushPartyOverlayMessage({
          id: String(payload?.id ?? `party-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
          author: isCurrentIdentity(incomingUserId) ? "You" : authorLabel,
          body,
        });
      });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await syncCurrentPartyPresence();
          fetchPartyMessages(partyId, 60)
            .then((messages) => {
              if (!active) return;
              applyPersistedSeatRequestMessages(
                messages.map((message) => ({ body: String(message.body ?? ""), createdAt: message.createdAt })),
                "subscribe-history",
              );
            })
            .catch(() => {});
        }
      });
    };

    bootstrapPartySocial();

    return () => {
      active = false;
      Object.values(partyReactionTimersRef.current).forEach((timer) => clearTimeout(timer));
      partyReactionTimersRef.current = {};
      if (partySocialChannelRef.current) {
        supabase.removeChannel(partySocialChannelRef.current);
        partySocialChannelRef.current = null;
      }
    };
  }, [
    applyPendingSeatRequestToParticipant,
    getWatchPartyHostAuthority,
    inWatchParty,
    partyId,
    pushPartyOverlayMessage,
    refreshPartyMembershipSnapshot,
    setPendingPartySeatRequest,
    syncCurrentPartyPresence,
    watchPartyEntryAllowed,
  ]);

  useEffect(() => {
    if (!inWatchParty || !partyId || !watchPartyEntryAllowed) {
      if (partySeatRequestPollRef.current) {
        clearInterval(partySeatRequestPollRef.current);
        partySeatRequestPollRef.current = null;
      }
      return;
    }

    let active = true;
    const applyPersistedHostSeatRequestMessages = (
      messages: Array<{ body: string; createdAt?: string }>,
      source: string,
    ) => {
      const authority = getWatchPartyHostAuthority();
      if (!authority.isHost) return;
      const currentUserId = authority.currentUserId;
      const latestByParticipant = new Map<string, { pending: boolean; sentAt: number }>();
      messages.forEach((message) => {
        const marker = decodePartySeatRequestMessage(message.body);
        if (!marker) return;
        const sentAt = marker.sentAt || Date.parse(String(message.createdAt ?? ""));
        const normalizedSentAt = Number.isFinite(sentAt) ? sentAt : 0;
        const existing = latestByParticipant.get(marker.participantId);
        if (existing && existing.sentAt > normalizedSentAt) return;
        latestByParticipant.set(marker.participantId, {
          pending: marker.pending,
          sentAt: normalizedSentAt,
        });
      });

      latestByParticipant.forEach(({ pending, sentAt }, participantId) => {
        if (!participantId || participantId === currentUserId) return;
        if (pending && sentAt > 0 && Date.now() - sentAt > PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS) {
          setPendingPartySeatRequest(participantId, false, `${source}:expired`, sentAt);
          return;
        }
        setPendingPartySeatRequest(participantId, pending, source, sentAt);
        if (!partyParticipantsRef.current.some((participant) => participant.id === participantId)) {
          refreshPartyMembershipSnapshot().catch(() => null);
        }
        setPartyParticipants((prev) => {
          let found = false;
          const next = prev.map((entry) => {
            if (entry.id !== participantId) return entry;
            found = true;
            const nextEntry = { ...entry, isRequestingToSpeak: pending && !entry.canSpeak };
            return applyPendingSeatRequestToParticipant(nextEntry);
          });
          if (found || !pending) return next;
          const membership = partyMembershipMapRef.current[participantId];
          if (!membership) return next;
          const role: PartyParticipant["role"] = membership.role === "host" ? "host" : "viewer";
          return [
            ...next,
            applyPendingSeatRequestToParticipant({
              id: participantId,
              name: resolvePartyParticipantDisplayName({
                isCurrentUser: false,
                role,
                candidates: [membership.displayName],
              }),
              role,
              avatarUrl: membership.avatarUrl || undefined,
              cameraPreviewUrl: membership.cameraPreviewUrl || undefined,
              stageRole: derivePartyStageRole({
                role,
                canSpeak: membership.canSpeak,
                currentStageRole: membership.stageRole,
              }),
              isLive: true,
              muted: membership.isMuted,
              canSpeak: membership.canSpeak,
              isSpeaking: false,
              isRequestingToSpeak: !membership.canSpeak,
            }),
          ];
        });
        debugLog("livekit", "watch-party-live seat request applied", {
          roomName: partyId,
          currentUserId,
          participantId,
          pending,
          source,
          currentUserIsHost: authority.isHost,
          hostAuthoritySource: authority.source,
          pendingSeatRequestIds: Object.keys(pendingPartySeatRequestsRef.current),
          visibleParticipantIds: partyParticipantsRef.current.map((participant) => participant.id),
        });
      });
    };

    const pollPersistedSeatRequests = () => {
      const authority = getWatchPartyHostAuthority();
      if (!authority.isHost) return;
      fetchPartyMessages(partyId, 60)
        .then((messages) => {
          if (!active) return;
          applyPersistedHostSeatRequestMessages(
            messages.map((message) => ({ body: String(message.body ?? ""), createdAt: message.createdAt })),
            "message-poll",
          );
        })
        .catch(() => {});
    };

    pollPersistedSeatRequests();
    partySeatRequestPollRef.current = setInterval(pollPersistedSeatRequests, 2500);

    return () => {
      active = false;
      if (partySeatRequestPollRef.current) {
        clearInterval(partySeatRequestPollRef.current);
        partySeatRequestPollRef.current = null;
      }
    };
  }, [
    applyPendingSeatRequestToParticipant,
    getWatchPartyHostAuthority,
    inWatchParty,
    partyId,
    refreshPartyMembershipSnapshot,
    setPendingPartySeatRequest,
    watchPartyEntryAllowed,
  ]);

  useEffect(() => {
    return () => {
      if (seekFeedbackTimeoutRef.current) clearTimeout(seekFeedbackTimeoutRef.current);
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
      if (nextAutoplayTimeoutRef.current) clearTimeout(nextAutoplayTimeoutRef.current);
      if (upNextIntervalRef.current) clearInterval(upNextIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!inWatchParty) return;
    const currentTrackedUserId = String(partyUserId || "").trim() || "anon";
    if (!currentTrackedUserId || currentTrackedUserId === "anon") return;
    if (cameraPermission?.granted) return;
    if (cameraPermission && !cameraPermission.canAskAgain) return;
    requestCameraPermission().catch(() => {});
  }, [inWatchParty, partyUserId, cameraPermission, requestCameraPermission]);

  useEffect(() => {
    shouldAutoplayNextRef.current = false;
    hasNavigatedToNextRef.current = false;
    setShowUpNext(false);
    setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
    setUpNextCanceled(false);

    if (upNextIntervalRef.current) {
      clearInterval(upNextIntervalRef.current);
      upNextIntervalRef.current = null;
    }

    if (nextAutoplayTimeoutRef.current) {
      clearTimeout(nextAutoplayTimeoutRef.current);
      nextAutoplayTimeoutRef.current = null;
    }

    return () => {
      shouldAutoplayNextRef.current = false;
      hasNavigatedToNextRef.current = false;
      if (upNextIntervalRef.current) {
        clearInterval(upNextIntervalRef.current);
        upNextIntervalRef.current = null;
      }
      if (nextAutoplayTimeoutRef.current) {
        clearTimeout(nextAutoplayTimeoutRef.current);
        nextAutoplayTimeoutRef.current = null;
      }
    };
  }, [titleId]);

  useEffect(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }

    if (shouldPinWatchPartyControls) {
      if (!controlsVisible) setControlsVisible(true);
      return;
    }

    if (!inWatchParty && !isLiveModeFlag && (!isVideoReady || !isPlaying)) {
      if (!controlsVisible) setControlsVisible(true);
      return;
    }

    if (!controlsVisible) return;

    hideControlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
      hideControlsTimeoutRef.current = null;
    }, CONTROLS_AUTO_HIDE_MILLIS);

    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
        hideControlsTimeoutRef.current = null;
      }
    };
  }, [controlsVisible, inWatchParty, isLiveModeFlag, isPlaying, isVideoReady, shouldPinWatchPartyControls]);

  useEffect(() => {
    if (!inWatchParty) {
      partyOverlayControlsOpacity.setValue(1);
      partyOverlayControlsTranslateY.setValue(0);
      partyPresenceOpacity.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.timing(partyOverlayControlsOpacity, {
        toValue: effectiveControlsVisible ? 1 : 0,
        duration: effectiveControlsVisible ? 180 : 280,
        easing: effectiveControlsVisible ? Easing.out(Easing.cubic) : Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(partyOverlayControlsTranslateY, {
        toValue: effectiveControlsVisible ? 0 : 8,
        duration: effectiveControlsVisible ? 180 : 280,
        easing: effectiveControlsVisible ? Easing.out(Easing.cubic) : Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(partyPresenceOpacity, {
      toValue: effectiveControlsVisible ? 1 : 0.4,
      duration: effectiveControlsVisible ? 180 : 280,
      easing: effectiveControlsVisible ? Easing.out(Easing.cubic) : Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [effectiveControlsVisible, inWatchParty, partyOverlayControlsOpacity, partyOverlayControlsTranslateY, partyPresenceOpacity]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(compactControlsOpacity, {
        toValue: controlsVisible ? 1 : 0,
        duration: controlsVisible ? 180 : 280,
        easing: controlsVisible ? Easing.out(Easing.cubic) : Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(compactControlsTranslateY, {
        toValue: controlsVisible ? 0 : 10,
        duration: controlsVisible ? 180 : 280,
        easing: controlsVisible ? Easing.out(Easing.cubic) : Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [compactControlsOpacity, compactControlsTranslateY, controlsVisible]);

  useEffect(() => {
    return () => {
      if (!titleId) return;
      const duration = durationRef.current;
      const position = currentPositionRef.current;

      if (duration > 0 && position / duration >= 0.95) {
        clearProgressForTitle(titleId).catch(() => {});
      } else {
        writeProgressForTitle(titleId, position, duration || undefined).catch(() => {});
      }
    };
  }, [titleId]);

  const persistProgress = useCallback(
    (position: number, duration: number) => {
      if (!titleId) return;

      if (duration > 0 && position / duration >= 0.95) {
        clearProgressForTitle(titleId).catch(() => {});
        lastPersistedPositionRef.current = 0;
        return;
      }

      writeProgressForTitle(titleId, position, duration || undefined).catch(() => {});
      lastPersistedPositionRef.current = position;
    },
    [titleId],
  );

  const showSeekFeedback = useCallback(
    (deltaMillis: number) => {
      const seconds = Math.abs(Math.round(deltaMillis / 1000));
      const label = deltaMillis >= 0 ? `+${seconds}s` : `-${seconds}s`;
      setSeekFeedback(label);

      if (seekFeedbackTimeoutRef.current) {
        clearTimeout(seekFeedbackTimeoutRef.current);
      }

      seekFeedbackOpacity.stopAnimation();
      seekFeedbackOpacity.setValue(1);

      seekFeedbackTimeoutRef.current = setTimeout(() => {
        Animated.timing(seekFeedbackOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          setSeekFeedback(null);
        });
      }, 800);
    },
    [seekFeedbackOpacity],
  );

  const syncHostSharedPlayback = useCallback(
    (positionMillis: number, playbackState: "playing" | "paused", kind: "play" | "pause" | "seek") => {
      if (!isSharedPartyPlayback || !partyId || !getSharedPlaybackControlAuthority().canControl) return;

      const safePositionMillis = Math.max(0, Math.floor(positionMillis));
      updateRoomPlayback(partyId, safePositionMillis, playbackState).catch(() => {});

      if (partySyncUserIdRef.current) {
        emitSyncEvent(partyId, partySyncUserIdRef.current, kind, safePositionMillis).catch(() => {});
      }

      lastPartySyncWriteAtRef.current = Date.now();
      lastPartySyncedPositionRef.current = safePositionMillis;
      lastPartySyncedStateRef.current = playbackState;
      setPartySyncStatus(`Host Controls · ${playbackState === "playing" ? "Playing" : "Paused"}`);
    },
    [getSharedPlaybackControlAuthority, isSharedPartyPlayback, partyId],
  );

  const applySeekDelta = useCallback(
    async (deltaMillis: number) => {
      if (blockViewerSharedPlaybackControl("double-tap-seek")) return;

      const duration = durationRef.current;
      const current = currentPositionRef.current;
      const max = duration > 0 ? duration : current + Math.abs(deltaMillis) + STEP_MILLIS;
      const next = clamp(current + deltaMillis, 0, Math.max(0, max));

      try {
        await videoRef.current?.setPositionAsync(next);
      } catch {
        return;
      }

      currentPositionRef.current = next;
      setPositionMillis(next);
      showSeekFeedback(deltaMillis);
      persistProgress(next, duration);
      if (isSharedPartyPlayback) {
        const nextState = isPlaying ? "playing" : "paused";
        syncHostSharedPlayback(next, nextState, "seek");
      }
    },
    [blockViewerSharedPlaybackControl, isPlaying, isSharedPartyPlayback, persistProgress, showSeekFeedback, syncHostSharedPlayback],
  );

  const setZoomTransform = useCallback(
    (nextScale: number, nextTranslation: ZoomTranslation) => {
      const safeScale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
      const clampedTranslation = clampZoomTranslation(nextTranslation, safeScale, videoLayoutRef.current);
      zoomScale.setValue(safeScale);
      zoomTranslateX.setValue(clampedTranslation.x);
      zoomTranslateY.setValue(clampedTranslation.y);
    },
    [zoomScale, zoomTranslateX, zoomTranslateY],
  );

  const animateZoomTransform = useCallback(
    (nextScale: number, nextTranslation: ZoomTranslation) => {
      const safeScale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
      const clampedTranslation = clampZoomTranslation(nextTranslation, safeScale, videoLayoutRef.current);
      Animated.parallel([
        Animated.timing(zoomScale, {
          toValue: safeScale,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(zoomTranslateX, {
          toValue: clampedTranslation.x,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(zoomTranslateY, {
          toValue: clampedTranslation.y,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    },
    [zoomScale, zoomTranslateX, zoomTranslateY],
  );

  const resetZoom = useCallback(() => {
    animateZoomTransform(1, { x: 0, y: 0 });
  }, [animateZoomTransform]);

  const resetAutoHideTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }

    if (shouldPinWatchPartyControls) {
      if (!controlsVisible) setControlsVisible(true);
      return;
    }

    if (!inWatchParty && !isLiveModeFlag && (!isVideoReady || !isPlaying)) {
      if (!controlsVisible) setControlsVisible(true);
      return;
    }

    if (controlsVisible) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
        hideControlsTimeoutRef.current = null;
      }, CONTROLS_AUTO_HIDE_MILLIS);
    }
  }, [controlsVisible, inWatchParty, isLiveModeFlag, isPlaying, isVideoReady, shouldPinWatchPartyControls]);

  const showControlsAndResetAutoHideTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }

    setControlsVisible(true);

    if (shouldPinWatchPartyControls || (!inWatchParty && !isLiveModeFlag && (!isVideoReady || !isPlaying))) return;

    hideControlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
      hideControlsTimeoutRef.current = null;
    }, CONTROLS_AUTO_HIDE_MILLIS);
  }, [inWatchParty, isLiveModeFlag, isPlaying, isVideoReady, shouldPinWatchPartyControls]);

  const onSendPartyComment = useCallback(async () => {
    if (!inWatchParty || !partyId || partyCommentSending) return;

    const body = String(partyCommentDraft ?? "").trim();
    if (!body) return;

    const commentUserId = String(partyUserId || (await getSafePartyUserId().catch(() => "")) || "").trim();
    const localId = `party-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const authorLabel = String(partyDisplayNameRef.current ?? "").trim() || "Guest";

    pushPartyOverlayMessage({
      id: localId,
      author: "You",
      body,
    });
    setPartyCommentDraft("");
    setControlsVisible(true);
    resetAutoHideTimer();
    setPartyCommentSending(true);

    try {
      await sendPartyMessage(partyId, commentUserId, "chat", body, { username: authorLabel });
      await partySocialChannelRef.current?.send({
        type: "broadcast",
        event: "message",
        payload: {
          id: localId,
          kind: "chat",
          body,
          userId: commentUserId,
          authorLabel,
        },
      }).catch(() => {});
    } finally {
      setPartyCommentSending(false);
    }
  }, [
    inWatchParty,
    partyCommentDraft,
    partyCommentSending,
    partyId,
    partyUserId,
    pushPartyOverlayMessage,
    resetAutoHideTimer,
  ]);

  const requestPartySeat = useCallback(async () => {
    const trackedUserId = String(partyUserId || partySyncUserIdRef.current || "").trim();
    if (!inWatchParty || !partyId || !trackedUserId) return;
    const currentParticipant = partyParticipants.find((entry) => entry.id === trackedUserId);
    const currentMembership = partyMembershipMapRef.current[trackedUserId];
    const isHost = currentParticipant?.role === "host" || currentMembership?.role === "host";
    const canSpeak = !!(
      currentParticipant?.canSpeak
      || currentParticipant?.stageRole === "speaker"
      || currentMembership?.canSpeak
      || currentMembership?.stageRole === "speaker"
    );
    if (isHost || canSpeak || currentParticipant?.isRequestingToSpeak) {
      return;
    }

    setPartyParticipants((prev) =>
      prev.map((entry) =>
        entry.id === trackedUserId ? { ...entry, isRequestingToSpeak: true } : entry,
      ),
    );
    setControlsVisible(true);
    resetAutoHideTimer();
    try {
      await syncCurrentPartyPresence({ isRequestingToSpeak: true }).catch(() => {});
      await broadcastPartySeatRequest(trackedUserId, true);
    } catch (error) {
      setPartyParticipants((prev) =>
        prev.map((entry) =>
          entry.id === trackedUserId ? { ...entry, isRequestingToSpeak: false } : entry,
        ),
      );
      await syncCurrentPartyPresence({ isRequestingToSpeak: false }).catch(() => {});
      debugLog("livekit", "watch-party-live seat request unavailable after optimistic state", {
        roomName: partyId,
        currentUserId: trackedUserId,
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
      throw error;
    }
  }, [broadcastPartySeatRequest, inWatchParty, partyId, partyParticipants, partyUserId, resetAutoHideTimer, syncCurrentPartyPresence]);

  const persistPartySeatState = useCallback(async (participantId: string, options: {
    canSpeak: boolean;
    stageRole: "host" | "speaker" | "listener";
    isRequestingToSpeak?: boolean;
    isMuted?: boolean;
  }) => {
    const authority = getWatchPartyHostAuthority();
    if (!inWatchParty || !partyId || !participantId || !authority.isHost) return false;

    const existingMembership = partyMembershipMapRef.current[participantId];
    const nextMembership = await setPartyParticipantState(partyId, participantId, {
      role: existingMembership?.role ?? "viewer",
      stageRole: options.stageRole,
      canSpeak: options.canSpeak,
      isMuted: options.isMuted ?? (options.canSpeak ? existingMembership?.isMuted : false),
      membershipState: existingMembership?.membershipState ?? "active",
    }).catch(() => null);

    if (!nextMembership) {
      debugLog("livekit", "blocked watch-party-live seat broadcast before membership authority persisted", {
        roomName: partyId,
        participantId,
        stageRole: options.stageRole,
        canSpeak: options.canSpeak,
        muted: options.isMuted ?? null,
        hostAuthoritySource: authority.source,
      });
      return false;
    }

    if (options.isRequestingToSpeak === false || options.canSpeak) {
      clearPendingPartySeatRequest(participantId, "seat-state-persisted");
    }
    partyMembershipMapRef.current[participantId] = nextMembership;
    setPartyParticipants((prev) =>
      prev.map((entry) =>
        entry.id === participantId
          ? {
              ...entry,
              canSpeak: options.canSpeak,
              stageRole: options.stageRole,
              muted: options.isMuted ?? entry.muted,
              isRequestingToSpeak: !!options.isRequestingToSpeak,
              isSpeaking: options.canSpeak ? entry.isSpeaking : false,
            }
          : entry,
      ),
    );

    await broadcastPartySeatState(participantId, options);
    if (options.isRequestingToSpeak === false) {
      await broadcastPartySeatRequest(participantId, false).catch((error) => {
        debugLog("livekit", "watch-party-live seat request clear broadcast failed after persistence", {
          roomName: partyId,
          participantId,
          error: error instanceof Error ? error.message : String(error ?? ""),
        });
      });
    }
    await enforceLiveKitParticipantState({
      surface: "watch-party-live",
      roomName: partyId,
      targetParticipantIdentity: participantId,
      metadata: {
        source: "watch-party-live-seat-control",
        stageRole: options.stageRole,
        canSpeak: options.canSpeak,
        muted: options.isMuted ?? null,
        hostAuthoritySource: authority.source,
        },
      }).catch(() => false);
    if (participantId === String(partyUserId || partySyncUserIdRef.current || "").trim()) {
      await syncCurrentPartyPresence({
        ...options,
        muted: options.isMuted,
      }).catch(() => {});
    }
    return true;
  }, [
    broadcastPartySeatRequest,
    broadcastPartySeatState,
    clearPendingPartySeatRequest,
    getWatchPartyHostAuthority,
    inWatchParty,
    partyId,
    partyUserId,
    syncCurrentPartyPresence,
  ]);

  const handleSharedPlaybackTap = useCallback(async () => {
    setControlsVisible(true);
    if (blockViewerSharedPlaybackControl("tap-toggle")) return;

    if (!isVideoReady) return;
    if (shouldAutoplayNextRef.current && nextTitleId) return;

    const duration = durationRef.current;
    const currentPosition = currentPositionRef.current;
    const reachedEnd =
      didJustFinishRef.current ||
      (duration > 0 && currentPosition >= duration - PLAYBACK_END_REPLAY_THRESHOLD_MILLIS);

    try {
      if (reachedEnd) {
        if (upNextIntervalRef.current) {
          clearInterval(upNextIntervalRef.current);
          upNextIntervalRef.current = null;
        }
        if (nextAutoplayTimeoutRef.current) {
          clearTimeout(nextAutoplayTimeoutRef.current);
          nextAutoplayTimeoutRef.current = null;
        }

        shouldAutoplayNextRef.current = false;
        didJustFinishRef.current = false;
        currentPositionRef.current = 0;
        lastPersistedPositionRef.current = 0;
        setPositionMillis(0);
        setShowUpNext(false);
        setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
        setUpNextCanceled(false);

        if (videoRef.current?.replayAsync) {
          await videoRef.current.replayAsync();
        } else {
          await videoRef.current?.setPositionAsync(0);
          await videoRef.current?.playAsync();
        }
        setIsPlaying(true);
        if (titleId) writeProgressForTitle(titleId, 0, duration || undefined).catch(() => {});
        syncHostSharedPlayback(0, "playing", "play");
        return;
      }

      if (isPlaying) {
        await videoRef.current?.pauseAsync();
        setIsPlaying(false);
        syncHostSharedPlayback(currentPosition, "paused", "pause");
        return;
      }

      await videoRef.current?.playAsync();
      setIsPlaying(true);
      syncHostSharedPlayback(currentPosition, "playing", "play");
    } catch {
      // ignore transient player errors
    }
  }, [blockViewerSharedPlaybackControl, isPlaying, isVideoReady, nextTitleId, syncHostSharedPlayback, titleId]);

  const handleSingleTap = () => {
    if (isStandalonePlayer && standaloneAccessLoading) return;
    if (standalonePlaybackBlocked) {
      retryStandaloneAccessCheck();
      return;
    }
    if (standalonePlaybackUnknown) {
      retryStandaloneAccessCheck();
      return;
    }

    if (isSharedPartyPlayback) {
      void handleSharedPlaybackTap();
      return;
    }

    if (isStandalonePlayer && !isVideoReady) {
      showControlsAndResetAutoHideTimer();
      return;
    }

    const reachedEnd =
      isVideoReady &&
      (
        didJustFinishRef.current ||
        (durationRef.current > 0 && currentPositionRef.current >= durationRef.current - PLAYBACK_END_REPLAY_THRESHOLD_MILLIS)
      );

    if (reachedEnd) {
      setControlsVisible(true);
      void replayFromStart();
      return;
    }

    if (!controlsVisible) {
      showControlsAndResetAutoHideTimer();
      return;
    }

    setControlsVisible((value) => !value);

    if (!isVideoReady) return;
    if (shouldAutoplayNextRef.current && nextTitleId) return;

    if (isPlaying) {
      videoRef.current
        ?.pauseAsync()
        .then(() => setIsPlaying(false))
        .catch(() => {});
    } else {
      videoRef.current
        ?.playAsync()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const resetGestureState = useCallback(() => {
    swipeLastAppliedStepRef.current = 0;
    pinchStartDistanceRef.current = null;
    pinchStartFocalRef.current = null;
    pinchStartTranslateRef.current = { x: 0, y: 0 };
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (event, gestureState) => {
          const isZoomed = zoomScaleValueRef.current > 1.01;
          const dragThreshold = isZoomed ? 2 : 8;
          return event.nativeEvent.touches.length >= 2
            || Math.abs(gestureState.dx) > dragThreshold
            || Math.abs(gestureState.dy) > dragThreshold;
        },
        onPanResponderGrant: () => {
          resetAutoHideTimer();
          swipeLastAppliedStepRef.current = 0;
          pinchStartDistanceRef.current = null;
          pinchStartFocalRef.current = null;
          pinchStartTranslateRef.current = {
            x: zoomTranslateXValueRef.current,
            y: zoomTranslateYValueRef.current,
          };
          zoomPanStartTranslateRef.current = {
            x: zoomTranslateXValueRef.current,
            y: zoomTranslateYValueRef.current,
          };
          panScrubStartPositionRef.current = currentPositionRef.current;
          panScrubLastSeekAtRef.current = 0;
          panIsScrubbingRef.current = false;
          panWasPlayingBeforeScrubRef.current = false;
        },
        onPanResponderMove: (event: GestureResponderEvent, gestureState) => {
          const touches = event.nativeEvent.touches;

          if (touches.length >= 2) {
            const distance = touchDistance(touches);
            if (!distance) return;
            const focalPoint = getTouchFocalPoint(touches, videoLayoutRef.current);

            if (!pinchStartDistanceRef.current) {
              pinchStartDistanceRef.current = distance;
              pinchStartScaleRef.current = zoomScaleValueRef.current;
              pinchStartFocalRef.current = focalPoint;
              pinchStartTranslateRef.current = {
                x: zoomTranslateXValueRef.current,
                y: zoomTranslateYValueRef.current,
              };
              return;
            }

            const ratio = distance / pinchStartDistanceRef.current;
            const nextScale = clamp(pinchStartScaleRef.current * ratio, MIN_ZOOM, MAX_ZOOM);
            const startFocal = pinchStartFocalRef.current ?? focalPoint ?? { x: 0, y: 0 };
            const focalDrag = focalPoint
              ? {
                  x: focalPoint.x - startFocal.x,
                  y: focalPoint.y - startFocal.y,
                }
              : { x: 0, y: 0 };
            setZoomTransform(nextScale, {
              x: pinchStartTranslateRef.current.x + focalDrag.x + startFocal.x * (pinchStartScaleRef.current - nextScale),
              y: pinchStartTranslateRef.current.y + focalDrag.y + startFocal.y * (pinchStartScaleRef.current - nextScale),
            });
            return;
          }

          pinchStartDistanceRef.current = null;
          pinchStartFocalRef.current = null;

          if (zoomScaleValueRef.current > 1.01) {
            setZoomTransform(zoomScaleValueRef.current, {
              x: zoomPanStartTranslateRef.current.x + gestureState.dx,
              y: zoomPanStartTranslateRef.current.y + gestureState.dy,
            });
            return;
          }

          const duration = durationRef.current;
          if (duration <= 0) return;
          if (Math.abs(gestureState.dx) < PAN_SCRUB_MIN_DRAG_PIXELS) return;
          if (Math.abs(gestureState.dx) < Math.abs(gestureState.dy)) return;
          if (blockViewerSharedPlaybackControl("pan-scrub")) return;

          if (!panIsScrubbingRef.current) {
            panIsScrubbingRef.current = true;
            panWasPlayingBeforeScrubRef.current = isPlaying;
            if (isPlaying) {
              videoRef.current?.pauseAsync().catch(() => {});
            }
          }

          const positionFromDelta = panScrubStartPositionRef.current + (gestureState.dx / SWIPE_PIXELS_PER_STEP) * STEP_MILLIS;
          const nextPosition = clamp(positionFromDelta, 0, duration);

          currentPositionRef.current = nextPosition;
          setPositionMillis(nextPosition);

          const now = Date.now();
          if (panScrubSeekInFlightRef.current) return;
          if (now - panScrubLastSeekAtRef.current < PAN_SCRUB_SEEK_THROTTLE_MILLIS) return;

          panScrubLastSeekAtRef.current = now;
          panScrubSeekInFlightRef.current = true;

          videoRef.current
            ?.setPositionAsync(nextPosition)
            .catch(() => {})
            .finally(() => {
              panScrubSeekInFlightRef.current = false;
            });
        },
        onPanResponderRelease: (event, gestureState) => {
          resetAutoHideTimer();
          if (panIsScrubbingRef.current) {
            const finalPosition = currentPositionRef.current;
            videoRef.current
              ?.setPositionAsync(finalPosition)
              .then(() => {
                persistProgress(finalPosition, durationRef.current);
                if (panWasPlayingBeforeScrubRef.current) {
                  if (isSharedPartyPlayback) syncHostSharedPlayback(finalPosition, "playing", "seek");
                  return videoRef.current?.playAsync();
                }
                if (isSharedPartyPlayback) syncHostSharedPlayback(finalPosition, "paused", "seek");
              })
              .catch(() => {});

            panIsScrubbingRef.current = false;
            panWasPlayingBeforeScrubRef.current = false;

            if (zoomScaleValueRef.current <= 1.05) {
              resetZoom();
            }
            resetGestureState();
            return;
          }

          const isTap = Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10;

          if (isTap && !isVideoReady) {
            if (isCreatorStandalonePlaybackSurface) {
              showControlsAndResetAutoHideTimer();
            }
          } else if (isTap && isVideoReady) {
            const now = Date.now();
            const isDoubleTap = now - lastTapRef.current <= 250;

            if (isDoubleTap) {
              if (singleTapTimeoutRef.current) {
                clearTimeout(singleTapTimeoutRef.current);
                singleTapTimeoutRef.current = null;
              }

              lastTapRef.current = 0;
              if (zoomScaleValueRef.current > 1.01) {
                resetZoom();
              } else {
                const half = (videoWidthRef.current || 1) / 2;
                const isLeftSide = event.nativeEvent.locationX <= half;
                applySeekDelta(isLeftSide ? -STEP_MILLIS : STEP_MILLIS).catch(() => {});
              }
            } else {
              lastTapRef.current = now;
              singleTapTimeoutRef.current = setTimeout(() => {
                singleTapTimeoutRef.current = null;
                handleSingleTap();
              }, 250);
            }
          }

          if (zoomScaleValueRef.current <= 1.05) {
            resetZoom();
          } else {
            animateZoomTransform(zoomScaleValueRef.current, {
              x: zoomTranslateXValueRef.current,
              y: zoomTranslateYValueRef.current,
            });
          }
          resetGestureState();
        },
        onPanResponderTerminate: () => {
          resetAutoHideTimer();
          if (panIsScrubbingRef.current) {
            const finalPosition = currentPositionRef.current;
            videoRef.current
              ?.setPositionAsync(finalPosition)
              .then(() => {
                persistProgress(finalPosition, durationRef.current);
                if (panWasPlayingBeforeScrubRef.current) {
                  if (isSharedPartyPlayback) syncHostSharedPlayback(finalPosition, "playing", "seek");
                  return videoRef.current?.playAsync();
                }
                if (isSharedPartyPlayback) syncHostSharedPlayback(finalPosition, "paused", "seek");
              })
              .catch(() => {});

            panIsScrubbingRef.current = false;
            panWasPlayingBeforeScrubRef.current = false;
          }

          if (zoomScaleValueRef.current <= 1.05) {
            resetZoom();
          } else {
            animateZoomTransform(zoomScaleValueRef.current, {
              x: zoomTranslateXValueRef.current,
              y: zoomTranslateYValueRef.current,
            });
          }
          resetGestureState();
        },
      }),
    [
      animateZoomTransform,
      applySeekDelta,
      blockViewerSharedPlaybackControl,
      handleSingleTap,
      isCreatorStandalonePlaybackSurface,
      isPlaying,
      isSharedPartyPlayback,
      isVideoReady,
      persistProgress,
      resetAutoHideTimer,
      resetGestureState,
      resetZoom,
      setZoomTransform,
      showControlsAndResetAutoHideTimer,
      syncHostSharedPlayback,
    ],
  );

  const progressScrubResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
        },
        onPanResponderGrant: async () => {
          resetAutoHideTimer();
          if (blockViewerSharedPlaybackControl("progress-scrub")) return;
          wasPlayingBeforeScrubRef.current = isPlaying;
          if (isPlaying) await videoRef.current?.pauseAsync().catch(() => {});
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          resetAutoHideTimer();
          if (blockViewerSharedPlaybackControl("progress-scrub")) return;
          const layout = progressTrackLayoutRef.current;
          if (!layout) return;

          const x = event.nativeEvent.locationX;
          const duration = durationRef.current;
          if (duration <= 0 || !layout.width) return;

          const percent = clamp(x / layout.width, 0, 1);
          const newPosition = percent * duration;
          currentPositionRef.current = newPosition;
          setPositionMillis(newPosition);
        },
        onPanResponderRelease: async () => {
          resetAutoHideTimer();
          if (blockViewerSharedPlaybackControl("progress-scrub")) return;
          try {
            const finalPosition = currentPositionRef.current;
            await videoRef.current?.setPositionAsync(finalPosition);
            persistProgress(finalPosition, durationRef.current);
            if (wasPlayingBeforeScrubRef.current) {
              if (isSharedPartyPlayback) syncHostSharedPlayback(finalPosition, "playing", "seek");
              await videoRef.current?.playAsync();
            } else if (isSharedPartyPlayback) {
              syncHostSharedPlayback(finalPosition, "paused", "seek");
            }
          } catch {
            // ignore errors on seek
          }
        },
        onPanResponderTerminate: async () => {
          resetAutoHideTimer();
          if (blockViewerSharedPlaybackControl("progress-scrub")) return;
          try {
            const finalPosition = currentPositionRef.current;
            await videoRef.current?.setPositionAsync(finalPosition);
            persistProgress(finalPosition, durationRef.current);
            if (wasPlayingBeforeScrubRef.current) {
              if (isSharedPartyPlayback) syncHostSharedPlayback(finalPosition, "playing", "seek");
              await videoRef.current?.playAsync();
            } else if (isSharedPartyPlayback) {
              syncHostSharedPlayback(finalPosition, "paused", "seek");
            }
          } catch {
            // ignore errors on seek
          }
        },
      }),
    [blockViewerSharedPlaybackControl, isPlaying, isSharedPartyPlayback, persistProgress, resetAutoHideTimer, syncHostSharedPlayback],
  );

  const navigateToNext = useCallback(() => {
    if (blockViewerSharedPlaybackControl("up-next-navigate")) return;
    if (!nextTitleId || hasNavigatedToNextRef.current) return;

    hasNavigatedToNextRef.current = true;
    shouldAutoplayNextRef.current = false;

    if (upNextIntervalRef.current) {
      clearInterval(upNextIntervalRef.current);
      upNextIntervalRef.current = null;
    }

    if (nextAutoplayTimeoutRef.current) {
      clearTimeout(nextAutoplayTimeoutRef.current);
      nextAutoplayTimeoutRef.current = null;
    }

    setShowUpNext(false);
    setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
    router.replace({ pathname: "/player/[id]", params: { id: nextTitleId } });
  }, [blockViewerSharedPlaybackControl, nextTitleId]);

  const startUpNextCountdown = useCallback(() => {
    if (blockViewerSharedPlaybackControl("up-next-countdown")) return;
    if (!nextTitleId || upNextCanceled || hasNavigatedToNextRef.current) return;

    shouldAutoplayNextRef.current = true;
    setShowUpNext(true);

    setUpNextCountdown((current) => {
      if (current > 0) return current;
      return UP_NEXT_COUNTDOWN_SECONDS;
    });

    if (upNextIntervalRef.current) return;

    upNextIntervalRef.current = setInterval(() => {
      setUpNextCountdown((current) => {
        if (current <= 1) {
          if (upNextIntervalRef.current) {
            clearInterval(upNextIntervalRef.current);
            upNextIntervalRef.current = null;
          }
          navigateToNext();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, [blockViewerSharedPlaybackControl, navigateToNext, nextTitleId, upNextCanceled]);

  const cancelUpNext = useCallback(() => {
    setUpNextCanceled(true);
    setShowUpNext(false);
    setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
    shouldAutoplayNextRef.current = false;

    if (upNextIntervalRef.current) {
      clearInterval(upNextIntervalRef.current);
      upNextIntervalRef.current = null;
    }

    if (nextAutoplayTimeoutRef.current) {
      clearTimeout(nextAutoplayTimeoutRef.current);
      nextAutoplayTimeoutRef.current = null;
    }
  }, []);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        const errorMessage = "error" in status ? String(status.error ?? "").trim() : "";
        if (errorMessage) {
          setPlaybackLoadError(errorMessage);
        }
        setIsPlaying(false);
        return;
      }

      setPlaybackLoadError(null);
      const duration = status.durationMillis ?? 0;
      const position = status.positionMillis ?? 0;
      durationRef.current = duration;
      currentPositionRef.current = position;
      setDurationMillis(duration);
      setPositionMillis(position);
      setIsPlaying(status.isPlaying);

      const wasPlaying = lastPlaybackIsPlayingRef.current;
      lastPlaybackIsPlayingRef.current = status.isPlaying;

      const canControlSharedPlayback = getSharedPlaybackControlAuthority().canControl;

      if (inWatchParty && partyId && canControlSharedPlayback && partySyncRoleRef.current === "host" && !partySyncApplyingRef.current) {
        const now = Date.now();
        const playingChanged = wasPlaying !== status.isPlaying;
        const movedEnough = Math.abs(position - lastPartySyncedPositionRef.current) >= 900;
        const timedWrite = now - lastPartySyncWriteAtRef.current >= PARTY_HOST_SYNC_WRITE_INTERVAL_MILLIS;
        const hostState = status.isPlaying ? "playing" : "paused";
        const stateChanged = lastPartySyncedStateRef.current !== hostState;
        const shouldWrite = stateChanged || movedEnough || (status.isPlaying && timedWrite);

        if (shouldWrite) {
          updateRoomPlayback(partyId, position, hostState).catch(() => {});

          if (partySyncUserIdRef.current && (playingChanged || movedEnough || stateChanged)) {
            const syncKind = playingChanged ? (status.isPlaying ? "play" : "pause") : "seek";
            emitSyncEvent(partyId, partySyncUserIdRef.current, syncKind, position).catch(() => {});
          }

          lastPartySyncWriteAtRef.current = now;
          lastPartySyncedPositionRef.current = position;
          lastPartySyncedStateRef.current = hostState;
          setPartySyncStatus(`Host Controls · ${hostState === "playing" ? "Playing" : "Paused"}`);
        }
      }

      if (duration > 0 && position < duration - PLAYBACK_END_REPLAY_THRESHOLD_MILLIS) {
        didJustFinishRef.current = false;
      }

      const remainingMillis = duration > 0 ? Math.max(0, duration - position) : 0;
      const shouldShowUpNext =
        canControlSharedPlayback &&
        !!nextTitleId &&
        !upNextCanceled &&
        !didJustFinishRef.current &&
        duration > 0 &&
        remainingMillis > 0 &&
        remainingMillis <= UP_NEXT_TRIGGER_MILLIS;

      if (shouldShowUpNext) {
        startUpNextCountdown();
      } else if (!didJustFinishRef.current && remainingMillis > UP_NEXT_TRIGGER_MILLIS) {
        if (upNextIntervalRef.current) {
          clearInterval(upNextIntervalRef.current);
          upNextIntervalRef.current = null;
        }
        setShowUpNext(false);
        setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
        shouldAutoplayNextRef.current = false;
      }

      if (titleId && duration > 0) {
        const now = Date.now();
        const positionDelta = Math.abs(position - lastPersistedPositionRef.current);
        const shouldPersistByTime = now - lastProgressWriteAtRef.current >= PROGRESS_WRITE_INTERVAL;
        const shouldPersistByDelta = positionDelta >= 1000;

        if (status.isPlaying && (shouldPersistByTime || shouldPersistByDelta)) {
          lastProgressWriteAtRef.current = now;
          persistProgress(position, duration);
        }

        if (wasPlaying && !status.isPlaying) {
          persistProgress(position, duration);
        }
      }

      if (status.didJustFinish) {
        didJustFinishRef.current = true;
        setIsPlaying(false);
        videoRef.current?.pauseAsync().catch(() => {});
        if (titleId) clearProgressForTitle(titleId).catch(() => {});

        if (canControlSharedPlayback && nextTitleId) {
          if (!upNextCanceled && !hasNavigatedToNextRef.current) {
            shouldAutoplayNextRef.current = true;
            if (nextAutoplayTimeoutRef.current) clearTimeout(nextAutoplayTimeoutRef.current);
            nextAutoplayTimeoutRef.current = setTimeout(() => {
              nextAutoplayTimeoutRef.current = null;
              if (!upNextCanceled && !hasNavigatedToNextRef.current) {
                navigateToNext();
              }
            }, NEXT_AUTOPLAY_DELAY_MILLIS);
          }
        }
      }
    },
    [getSharedPlaybackControlAuthority, inWatchParty, navigateToNext, nextTitleId, partyId, persistProgress, startUpNextCountdown, titleId, upNextCanceled],
  );

  const logPlayerVideoOperationFailure = useCallback((operation: string, error: unknown, extra?: Record<string, unknown>) => {
    debugLog("player", "player video operation rejected", {
      operation,
      titleId: titleId ?? null,
      inWatchParty,
      sharedPlayback: isSharedPartyPlayback,
      ...getPlaybackOperationErrorMeta(error),
      ...(extra ?? {}),
    });
  }, [inWatchParty, isSharedPartyPlayback, titleId]);

  const runPlayerVideoOperation = useCallback(async (
    operation: string,
    action: () => Promise<unknown> | unknown,
    extra?: Record<string, unknown>,
  ) => {
    try {
      const result = action();
      if (isPromiseLike(result)) await result;
      return true;
    } catch (error) {
      logPlayerVideoOperationFailure(operation, error, extra);
      return false;
    }
  }, [logPlayerVideoOperationFailure]);

  const onVideoLoad = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      void (async () => {
        setPlaybackLoadError(null);
        setIsVideoReady(true);
        setIsPlaying(status.isPlaying);

        const duration = status.durationMillis ?? 0;
        durationRef.current = duration;
        setDurationMillis(duration);

        let startAt = 0;
        const resume = Math.max(0, resumePositionRef.current || 0);
        const resumePercent = duration > 0 ? resume / duration : 0;
        if (duration > 0 && resume > 0 && resumePercent < 0.95) {
          startAt = resume;
        }

        if (startAt > 0) {
          const didSeek = await runPlayerVideoOperation(
            "load-resume-seek",
            () => videoRef.current?.setPositionAsync(startAt),
            { startAtMillis: startAt },
          );
          if (didSeek) {
            currentPositionRef.current = startAt;
            setPositionMillis(startAt);
            lastPersistedPositionRef.current = startAt;
          }
        } else {
          lastPersistedPositionRef.current = 0;
        }

        await runPlayerVideoOperation(
          "load-set-rate",
          () => videoRef.current?.setRateAsync(playbackRate, true),
          { playbackRate },
        );
      })().catch((error) => {
        logPlayerVideoOperationFailure("load-handler", error);
      });
    },
    [logPlayerVideoOperationFailure, playbackRate, runPlayerVideoOperation],
  );

  const onVideoError = useCallback((error: string) => {
    const message = String(error || "").trim() || "Playback source error";
    setPlaybackLoadError(message);
    setIsVideoReady(false);
    setIsPlaying(false);
  }, []);

  const replayFromStart = async () => {
    if (standalonePlaybackBlocked) {
      retryStandaloneAccessCheck();
      return;
    }
    if (standalonePlaybackUnknown) {
      retryStandaloneAccessCheck();
      return;
    }

    try {
      if (upNextIntervalRef.current) {
        clearInterval(upNextIntervalRef.current);
        upNextIntervalRef.current = null;
      }
      if (nextAutoplayTimeoutRef.current) {
        clearTimeout(nextAutoplayTimeoutRef.current);
        nextAutoplayTimeoutRef.current = null;
      }
      shouldAutoplayNextRef.current = false;
      setShowUpNext(false);
      setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
      setUpNextCanceled(false);
      await videoRef.current?.setPositionAsync(0);
      await videoRef.current?.playAsync();
      didJustFinishRef.current = false;
      currentPositionRef.current = 0;
      lastPersistedPositionRef.current = 0;
      setPositionMillis(0);
      setIsPlaying(true);
      if (titleId) writeProgressForTitle(titleId, 0, durationRef.current || undefined).catch(() => {});
    } catch {
      // ignore transient player errors
    }
  };

  const onToggleMyList = useCallback(async () => {
    if (!titleId || myListBusy) return;

    setMyListBusy(true);
    try {
      const ids = await toggleMyListTitle(titleId, {
        title: item?.title ?? undefined,
        posterUrl: item?.poster_url ?? undefined,
        thumbnailUrl: item?.thumbnail_url ?? undefined,
      });
      setMyListIds(ids);
    } finally {
      setMyListBusy(false);
    }
  }, [item?.poster_url, item?.thumbnail_url, item?.title, myListBusy, titleId]);

  const onShareStandaloneTitle = useCallback(async () => {
    if (!titleId || !hasResolvedPlatformTitle) {
      Alert.alert("Share unavailable", "Chi'llywood could not resolve this title for sharing.");
      return;
    }
    resetAutoHideTimer();

    try {
      const titleLabel = String(item?.title ?? (localTitle as any)?.title ?? "this title").trim() || "this title";
      await Share.share({
        message: `Watch ${titleLabel} on Chi'llywood: ${buildStandaloneTitleDeepLink(titleId)}`,
      });
    } catch {
      Alert.alert("Share unavailable", "Unable to open the share sheet right now.");
    }
  }, [hasResolvedPlatformTitle, item?.title, localTitle, resetAutoHideTimer, titleId]);

  const onShareCreatorVideo = useCallback(async () => {
    resetAutoHideTimer();

    if (!creatorVideo || !isCreatorVideoPubliclyShareable(creatorVideo)) {
      Alert.alert("Share unavailable", "Only public creator videos can be shared outside the Player.");
      return;
    }

    try {
      await Share.share({
        message: `Watch ${creatorVideo.title} on Chi'llywood: ${buildCreatorVideoDeepLink(creatorVideo.id)}`,
      });
    } catch {
      Alert.alert("Share unavailable", "Unable to open the share sheet right now.");
    }
  }, [creatorVideo, resetAutoHideTimer]);

  const ensureWatchPartyLivePremium = useCallback(async (accessKey: string) => {
    const safeAccessKey = String(accessKey ?? "").trim();
    const access = await requireWatchPartyLivePremium({ accessKey: safeAccessKey }).catch(() => null);
    if (access?.allowed) {
      setWatchPartyPremiumGate(null);
      return true;
    }

    if (isRuntimeControlBlockedAccess(access)) {
      const blockedCopy = getRuntimeControlBlockedCopy(access);
      setWatchPartyPremiumGate(null);
      setWatchPartyPremiumSheetVisible(false);
      Alert.alert(blockedCopy.title, blockedCopy.message);
      trackEvent("runtime_control_blocked", {
        surface: "standalone-player-watch-party-live",
        controlKey: access?.runtimeControlKey ?? "watch_party_live_enabled",
        titleId: safeAccessKey || String(titleId ?? cleanId).trim(),
      });
      return false;
    }

    if (access) setWatchPartyPremiumGate(access);
    setWatchPartyPremiumSheetVisible(true);
    trackEvent("monetization_gate_shown", {
      surface: "standalone-player-watch-party-live",
      reason: access?.reason ?? "premium_required",
      titleId: safeAccessKey || String(titleId ?? cleanId).trim(),
    });
    return false;
  }, [cleanId, titleId]);

  const onWatchParty = useCallback(async () => {
    if (playbackSourceKind === "spectator-playback") {
      Alert.alert("Watch-Party unavailable", "Start a watch party from the Spectator page for this source.");
      return;
    }

    if (playbackSourceKind === "creator-video") {
      if (!isSignedIn) {
        Alert.alert("Sign in required", "Sign in before starting Watch-Party Live from a creator video.");
        return;
      }

      if (titleLoading) {
        Alert.alert("Checking video", "Chi'llywood is still resolving this creator video.");
        return;
      }

      const blockReason = getCreatorVideoWatchPartyBlockReason(creatorVideo);
      const blockCopy = getCreatorVideoWatchPartyBlockCopy(blockReason);
      if (blockCopy) {
        Alert.alert(blockCopy.title, blockCopy.body);
        return;
      }

      const creatorVideoId = String(creatorVideo?.id ?? titleId ?? "").trim();
      if (!creatorVideoId) {
        Alert.alert("Creator video unavailable", "Chi'llywood could not resolve this uploaded video for Watch-Party Live.");
        return;
      }

      if (!(await ensureWatchPartyLivePremium(creatorVideoId))) return;

      try {
        const hostUserId = await getSafePartyUserId();
        debugLog("watch-party", "source resolved", { sourceType: "creator_video", sourceId: creatorVideoId });
        const room = await createPartyRoom(null, hostUserId, currentPositionRef.current, isPlaying ? "playing" : "paused", {
          roomType: "title",
          sourceType: "creator_video",
          sourceId: creatorVideoId,
        });

        if (room && "partyId" in room && room.partyId) {
          router.push({
            pathname: "/watch-party",
            params: {
              roomId: room.partyId,
              roomCode: room.roomCode,
              source: PLAYER_WATCH_PARTY_SOURCE,
              sourceType: "creator_video",
              sourceId: creatorVideoId,
            },
          });
          return;
        }

        const rawMessage = room && "error" in room ? room.error.message : "";
        const message = /source_(type|id)|column/i.test(rawMessage)
          ? "Watch-Party is unavailable for this video until the creator-video room source model is available."
          : "Watch-Party is unavailable for this video.";
        Alert.alert("Watch-Party unavailable", message);
      } catch {
        Alert.alert("Watch-Party unavailable", "Unable to create a Watch-Party room for this creator video right now.");
      }
      return;
    }

    if (!titleId || !hasResolvedPlatformTitle) {
      Alert.alert(
        "Watch-Party unavailable",
        "Chi'llywood could not resolve this platform title for Watch-Party Live.",
      );
      return;
    }

    const initialAccessKey = String(item?.id ?? titleId ?? cleanId).trim();
    if (!(await ensureWatchPartyLivePremium(initialAccessKey))) return;

    try {
      const hostUserId = await getSafePartyUserId();
      const preferredRawId = String(item?.id ?? "").trim();
      const fallbackRawId = String(titleId ?? "").trim();

      let createTitleId = preferredRawId || fallbackRawId;

      if (!UUID_LIKE_REGEX.test(createTitleId)) {
        const titleNameCandidate = String(item?.title ?? (localTitle as any)?.title ?? "").trim();
        if (titleNameCandidate) {
          try {
            const byName: { data: TitleIdLookupRow | null } = await supabase
              .from("titles")
              .select("id")
              .eq("title", titleNameCandidate)
              .returns<TitleIdLookupRow>()
              .maybeSingle();

            const dbTitleId = String(byName.data?.id ?? "").trim();
            if (dbTitleId) createTitleId = dbTitleId;
          } catch {
            // keep existing createTitleId
          }
        }
      }

      debugLog("watch-party", "creating room", {
        titleId: createTitleId,
        hostUserId,
        positionMillis: currentPositionRef.current,
        playbackState: isPlaying ? "playing" : "paused",
      });

      const room = await createPartyRoom(createTitleId || null, hostUserId, currentPositionRef.current, isPlaying ? "playing" : "paused", {
        roomType: "title",
        sourceType: createTitleId ? "platform_title" : null,
        sourceId: createTitleId || null,
      });
      debugLog("watch-party", "createPartyRoom returned", {
        ok: !!(room && "partyId" in room && room.partyId),
        partyId: room && "partyId" in room ? room.partyId : null,
        roomCode: room && "roomCode" in room ? room.roomCode : null,
        sourceType: room && "sourceType" in room ? room.sourceType : null,
        sourceId: room && "sourceId" in room ? room.sourceId : null,
      });

      if (room && "partyId" in room && room.partyId) {
        const roomSourceType = room.sourceType ?? (createTitleId ? "platform_title" : null);
        const roomSourceId = room.sourceId ?? createTitleId;
        const navParams = {
          roomId: room.partyId,
          roomCode: room.roomCode,
          titleId: room.titleId || createTitleId,
          source: PLAYER_WATCH_PARTY_SOURCE,
          ...(roomSourceType ? { sourceType: roomSourceType } : {}),
          ...(roomSourceId ? { sourceId: roomSourceId } : {}),
        };
        debugLog("watch-party", "navigating to waiting room", {
          roomId: navParams.roomId,
          roomCode: navParams.roomCode,
          sourceType: roomSourceType,
          sourceId: roomSourceId,
        });
        router.push({ pathname: "/watch-party", params: navParams });
        return;
      }
    } catch {
      // fallback navigation below
    }

    debugLog("watch-party", "room creation failed, using waiting room fallback");
    const fallbackTitleId = String(item?.id ?? titleId ?? "").trim();
    router.push({
      pathname: "/watch-party",
      params: {
        source: PLAYER_WATCH_PARTY_SOURCE,
        ...(fallbackTitleId ? {
          titleId: fallbackTitleId,
          sourceType: "platform_title",
          sourceId: fallbackTitleId,
        } : {}),
      },
    });
  }, [cleanId, creatorVideo, ensureWatchPartyLivePremium, hasResolvedPlatformTitle, isPlaying, isSignedIn, playbackSourceKind, titleId, titleLoading, item?.id, item?.title, localTitle]);

  const onSubmitTitleReport = useCallback(async (input: { category: SafetyReportCategory; note: string }) => {
    if (!titleId || !hasResolvedPlatformTitle || titleReportBusy) return;

    if (!isSignedIn) {
      Alert.alert("Sign in required", "Sign in before sending a title safety report.");
      return;
    }

    setTitleReportBusy(true);
    try {
      const titleLabel = String(item?.title ?? (localTitle as any)?.title ?? "Title").trim() || "Title";
      await submitSafetyReport({
        targetType: "title",
        targetId: titleId,
        category: input.category,
        note: input.note,
        titleId,
        context: buildSafetyReportContext({
          sourceSurface: "player",
          sourceRoute: `/player/${encodeURIComponent(titleId)}`,
          targetLabel: titleLabel,
          targetRoleLabel: "Title",
          platformOwnedTarget: false,
          context: {
            sourceKind: "title",
          },
        }),
      });
      setTitleReportVisible(false);
      Alert.alert("Report sent", "Thanks. Chi'llywood moderation can review this title.");
    } catch (error) {
      Alert.alert(
        "Report unavailable",
        error instanceof Error ? error.message : "Unable to send this report right now.",
      );
    } finally {
      setTitleReportBusy(false);
    }
  }, [hasResolvedPlatformTitle, isSignedIn, item?.title, localTitle, titleId, titleReportBusy]);

  const onSubmitCreatorVideoReport = useCallback(async (input: { category: SafetyReportCategory; note: string }) => {
    if (playbackSourceKind !== "creator-video" || !titleId || creatorVideoReportBusy) return;

    if (!isSignedIn) {
      Alert.alert("Sign in required", "Sign in before sending a creator-video safety report.");
      return;
    }

    setCreatorVideoReportBusy(true);
    try {
      await submitSafetyReport({
        targetType: "creator_video",
        targetId: titleId,
        category: input.category,
        note: input.note,
        titleId: null,
        context: buildSafetyReportContext({
          sourceSurface: "player",
          sourceRoute: `/player/${titleId}?source=creator-video`,
          targetLabel: item?.title ?? "Creator video",
          targetRoleLabel: "Creator video",
          platformOwnedTarget: false,
          context: {
            sourceKind: "creator-video",
          },
        }),
      });
      setCreatorVideoReportVisible(false);
      Alert.alert("Report sent", "Thanks. Chi'llywood moderation can review this creator video.");
    } catch (error) {
      Alert.alert(
        "Report unavailable",
        error instanceof Error ? error.message : "Unable to send this report right now.",
      );
    } finally {
      setCreatorVideoReportBusy(false);
    }
  }, [creatorVideoReportBusy, isSignedIn, item?.title, playbackSourceKind, titleId]);

  const loadCreatorVideoComments = useCallback(async () => {
    const creatorVideoId = String(creatorVideo?.id ?? titleId ?? "").trim();
    if (!creatorVideoId || playbackSourceKind !== "creator-video" || inWatchParty || isLiveModeFlag) {
      setCreatorVideoComments([]);
      setCreatorVideoCommentsLoading(false);
      setCreatorVideoCommentsError(null);
      return;
    }

    setCreatorVideoCommentsLoading(true);
    setCreatorVideoCommentsError(null);
    try {
      const comments = await readCreatorVideoComments(creatorVideoId, { limit: 30 });
      setCreatorVideoComments(comments);
    } catch {
      setCreatorVideoComments([]);
      setCreatorVideoCommentsError("Unable to load discussion right now.");
    } finally {
      setCreatorVideoCommentsLoading(false);
    }
  }, [creatorVideo?.id, inWatchParty, isLiveModeFlag, playbackSourceKind, titleId]);

  const onPickCreatorVideoCommentAttachment = useCallback(async (scope: SocialAttachmentPickerScope) => {
    try {
      setCreatorVideoCommentsError(null);
      const file = await pickSocialAttachmentFile(scope);
      if (!file) return;
      setCreatorVideoCommentAttachmentFile(file);
    } catch (error) {
      setCreatorVideoCommentAttachmentFile(null);
      setCreatorVideoCommentsError(error instanceof Error ? error.message : "Unable to attach that file right now.");
    }
  }, []);

  const onSelectCreatorVideoCommentAttachment = useCallback((scope: SocialAttachmentPickerScope) => {
    setCreatorVideoCommentAttachmentSheetVisible(false);
    void onPickCreatorVideoCommentAttachment(scope);
  }, [onPickCreatorVideoCommentAttachment]);

  const onSubmitCreatorVideoComment = useCallback(async () => {
    const creatorVideoId = String(creatorVideo?.id ?? titleId ?? "").trim();
    const body = creatorVideoCommentDraft.trim();
    if (!creatorVideoId || playbackSourceKind !== "creator-video" || creatorVideoCommentBusy) return;

    if (!isSignedIn) {
      Alert.alert("Sign in required", "Sign in before commenting on creator videos.");
      return;
    }
    if (!body) {
      setCreatorVideoCommentsError("Write a comment before posting.");
      return;
    }
    if (body.length > CREATOR_VIDEO_COMMENT_BODY_LIMIT) {
      setCreatorVideoCommentsError(`Comments can be ${CREATOR_VIDEO_COMMENT_BODY_LIMIT} characters or fewer.`);
      return;
    }
    if (!appConfig.runtimeControls.comments_enabled) {
      setCreatorVideoCommentsError("Comments are temporarily paused. You can still read existing comments.");
      return;
    }
    if (creatorVideoCommentAttachmentFile && !appConfig.runtimeControls.attachments_enabled) {
      setCreatorVideoCommentsError("Attachments are temporarily paused. You can still comment without an attachment.");
      return;
    }

    setCreatorVideoCommentBusy(true);
    setCreatorVideoCommentsError(null);
    try {
      const replyTarget = creatorVideoComments.find((comment) => comment.id === creatorVideoCommentReplyTargetId) ?? null;
      const parentCommentId = replyTarget?.parentCommentId || replyTarget?.id || null;
      const comment = await createCreatorVideoComment({
        videoId: creatorVideoId,
        body,
        parentCommentId,
        attachmentFile: creatorVideoCommentAttachmentFile,
      });
      setCreatorVideoComments((current) => [...current.filter((entry) => entry.id !== comment.id), comment]);
      setCreatorVideoCommentDraft("");
      setCreatorVideoCommentAttachmentFile(null);
      setCreatorVideoCommentReplyTargetId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setCreatorVideoCommentsError(message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
        ? SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
        : "Unable to post this comment right now.");
    } finally {
      setCreatorVideoCommentBusy(false);
    }
  }, [
    appConfig.runtimeControls.attachments_enabled,
    appConfig.runtimeControls.comments_enabled,
    creatorVideo?.id,
    creatorVideoCommentAttachmentFile,
    creatorVideoCommentBusy,
    creatorVideoCommentDraft,
    creatorVideoCommentReplyTargetId,
    creatorVideoComments,
    isSignedIn,
    playbackSourceKind,
    titleId,
  ]);

  const onDeleteCreatorVideoComment = useCallback((comment: CreatorVideoComment) => {
    if (!comment.id || creatorVideoCommentDeletingId) return;

    Alert.alert(
      "Delete comment?",
      "This removes your comment from the creator-video discussion.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setCreatorVideoCommentDeletingId(comment.id);
                setCreatorVideoCommentsError(null);
                await deleteCreatorVideoComment(comment.id);
                setCreatorVideoComments((current) => current.filter((entry) => (
                  entry.id !== comment.id && entry.parentCommentId !== comment.id
                )));
                setCreatorVideoCommentReplyTargetId((current) => (current === comment.id ? null : current));
              } catch {
                setCreatorVideoCommentsError("Unable to delete this comment right now.");
              } finally {
                setCreatorVideoCommentDeletingId(null);
              }
            })();
          },
        },
      ],
    );
  }, [creatorVideoCommentDeletingId]);

  const onSubmitCreatorVideoCommentReport = useCallback(async (input: { category: SafetyReportCategory; note: string }) => {
    const target = creatorVideoCommentReportTarget;
    const creatorVideoId = String(creatorVideo?.id ?? titleId ?? "").trim();
    if (!target || creatorVideoCommentReportBusy) return;

    if (!isSignedIn) {
      Alert.alert("Sign in required", "Sign in before reporting a creator-video comment.");
      return;
    }

    setCreatorVideoCommentReportBusy(true);
    try {
      await submitSafetyReport({
        targetType: "creator_video_comment",
        targetId: target.id,
        category: input.category,
        note: input.note,
        titleId: null,
        context: buildSafetyReportContext({
          sourceSurface: "player",
          sourceRoute: `/player/${creatorVideoId}?source=creator-video`,
          targetLabel: `${target.authorName} comment`,
          targetRoleLabel: "Creator-video comment",
          platformOwnedTarget: false,
          context: {
            creatorVideoId,
            commentPreview: target.body.slice(0, 140),
            sourceKind: "creator-video",
          },
        }),
      });
      setCreatorVideoCommentReportTarget(null);
      Alert.alert("Report sent", "Thanks. Chi'llywood moderation can review this comment.");
    } catch {
      Alert.alert("Report unavailable", "Unable to send this report right now.");
    } finally {
      setCreatorVideoCommentReportBusy(false);
    }
  }, [
    creatorVideo?.id,
    creatorVideoCommentReportBusy,
    creatorVideoCommentReportTarget,
    isSignedIn,
    titleId,
  ]);

  const onReturnToPartyRoom = useCallback(() => {
    if (!partyId) {
      router.back();
      return;
    }

    router.dismissTo({
      pathname: "/watch-party/[partyId]",
      params: {
        partyId,
        ...(titleId ? { titleId } : {}),
        source: "player-watch-party-live",
      },
    });
  }, [partyId, titleId]);

  useEffect(() => {
    if (Platform.OS !== "android" || !inWatchParty || isLiveModeFlag || !partyId) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onReturnToPartyRoom();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [inWatchParty, isLiveModeFlag, onReturnToPartyRoom, partyId]);

  useEffect(() => {
    if (Platform.OS !== "android" || inWatchParty || isLiveModeFlag || !isStandaloneFullscreen) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setIsStandaloneFullscreen(false);
      setControlsVisible(true);
      resetAutoHideTimer();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [inWatchParty, isLiveModeFlag, isStandaloneFullscreen, resetAutoHideTimer]);

  useEffect(() => {
    if (inWatchParty || isLiveModeFlag) return undefined;

    const orientationLock = isStandaloneFullscreen
      ? ScreenOrientation.OrientationLock.LANDSCAPE
      : ScreenOrientation.OrientationLock.PORTRAIT_UP;

    void ScreenOrientation.lockAsync(orientationLock).catch((error) => {
      debugLog("player", "standalone orientation lock failed", {
        fullscreen: isStandaloneFullscreen,
        message: error instanceof Error ? error.message : String(error),
      });
    });

    return () => {
      if (!isStandaloneFullscreen) return;
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch((error) => {
        debugLog("player", "standalone orientation restore failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    };
  }, [inWatchParty, isLiveModeFlag, isStandaloneFullscreen]);

  const onSelectRate = useCallback(async (rate: number) => {
    resetAutoHideTimer();
    setPlaybackRate(rate);
    try {
      await videoRef.current?.setRateAsync(rate, true);
    } catch {
      // ignore unsupported rate transitions
    }
  }, [resetAutoHideTimer]);

  const onCycleStandalonePlaybackRate = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.findIndex((option) => option === playbackRate);
    const oneXIndex = SPEED_OPTIONS.findIndex((option) => option === 1);
    const nextIndex = currentIndex >= 0
      ? (currentIndex + 1) % SPEED_OPTIONS.length
      : Math.max(0, oneXIndex);
    void onSelectRate(SPEED_OPTIONS[nextIndex] ?? 1);
  }, [onSelectRate, playbackRate]);

  const onToggleWatchPartyComments = useCallback(() => {
    if (!inWatchParty || isLiveModeFlag) return;
    resetAutoHideTimer();
    setWatchPartyMenuOpen(false);
    setPartyCommentsOpen((value) => !value);
  }, [inWatchParty, isLiveModeFlag, resetAutoHideTimer]);

  const onToggleWatchPartyMenu = useCallback(() => {
    if (!inWatchParty || isLiveModeFlag) return;
    resetAutoHideTimer();
    setPartyCommentsOpen(false);
    setWatchPartyMenuOpen((value) => !value);
  }, [inWatchParty, isLiveModeFlag, resetAutoHideTimer]);

  const onSelectWatchPartyRate = useCallback((rate: number) => {
    resetAutoHideTimer();
    if (blockViewerSharedPlaybackControl("rate-change")) return;
    setWatchPartyMenuOpen(false);
    void onSelectRate(rate);
  }, [blockViewerSharedPlaybackControl, onSelectRate, resetAutoHideTimer]);

  const onToggleWatchPartyMyList = useCallback(() => {
    resetAutoHideTimer();
    setWatchPartyMenuOpen(false);
    void onToggleMyList();
  }, [onToggleMyList, resetAutoHideTimer]);

  const onPressWatchPartyRoom = useCallback(() => {
    setPartyCommentsOpen(false);
    setWatchPartyMenuOpen(false);
    onReturnToPartyRoom();
  }, [onReturnToPartyRoom]);

  const showLivePresenceEvent = useCallback((message: string) => {
    setLivePresenceEvent(message);
    if (livePresenceEventTimeoutRef.current) {
      clearTimeout(livePresenceEventTimeoutRef.current);
    }
    livePresenceEventTimeoutRef.current = setTimeout(() => {
      setLivePresenceEvent(null);
      livePresenceEventTimeoutRef.current = null;
    }, 2600);
  }, []);

  const bumpRoomEnergy = useCallback((delta: number) => {
    setRoomEnergy((current) => clamp(current + delta, 0, 1));
  }, []);

  useEffect(() => {
    roomEnergyRef.current = roomEnergy;
    Animated.timing(roomEnergyAnim, {
      toValue: roomEnergy,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [roomEnergy, roomEnergyAnim]);

  useEffect(() => {
    if (!inWatchParty) return;

    const interval = setInterval(() => {
      setRoomEnergy((current) => {
        if (current <= 0.01) return 0;
        return clamp(current - 0.02, 0, 1);
      });
    }, 600);

    return () => clearInterval(interval);
  }, [inWatchParty]);

  useEffect(() => {
    if (!inWatchParty) return;

    const interval = setInterval(() => {
      const speakingCount = partyParticipants.filter((entry) => entry.isSpeaking && entry.canSpeak).length;
      if (speakingCount <= 0) return;
      bumpRoomEnergy(0.012 * Math.min(2, speakingCount));
    }, 780);

    return () => clearInterval(interval);
  }, [bumpRoomEnergy, inWatchParty, partyParticipants]);

  const triggerParticipantReactionBoost = useCallback((participantId: string, duration = 900) => {
    if (!participantId) return;
    setParticipantReactionBoostIds((prev) => (prev.includes(participantId) ? prev : [...prev, participantId]));
    const existing = participantReactionBoostTimersRef.current[participantId];
    if (existing) clearTimeout(existing);
    participantReactionBoostTimersRef.current[participantId] = setTimeout(() => {
      setParticipantReactionBoostIds((prev) => prev.filter((id) => id !== participantId));
      delete participantReactionBoostTimersRef.current[participantId];
    }, duration);
  }, []);

  const animateOutParticipantReaction = useCallback((reactionId: string, removeDelay = 170) => {
    const opacity = participantReactionOpacityMapRef.current[reactionId];
    const scale = participantReactionScaleMapRef.current[reactionId];
    const translateY = participantReactionTranslateYMapRef.current[reactionId];

    if (opacity || scale || translateY) {
      Animated.parallel([
        opacity
          ? Animated.timing(opacity, {
              toValue: 0,
              duration: 150,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            })
          : Animated.timing(new Animated.Value(0), { toValue: 0, duration: 0, useNativeDriver: true }),
        scale
          ? Animated.timing(scale, {
              toValue: 0.75,
              duration: 150,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            })
          : Animated.timing(new Animated.Value(0), { toValue: 0, duration: 0, useNativeDriver: true }),
      ]).start();
    }

    const existingTimer = participantReactionTimersRef.current[reactionId];
    if (existingTimer) clearTimeout(existingTimer);
    participantReactionTimersRef.current[reactionId] = setTimeout(() => {
      setPartyParticipantReactions((prev) => prev.filter((entry) => entry.id !== reactionId));
      delete participantReactionScaleMapRef.current[reactionId];
      delete participantReactionTranslateYMapRef.current[reactionId];
      delete participantReactionOpacityMapRef.current[reactionId];
      delete participantReactionTimersRef.current[reactionId];
    }, removeDelay);
  }, []);

  const triggerParticipantLinkedReaction = useCallback(
    (participantId: string, participantName: string, emoji: string, isSpeaking = false, showToast = true) => {
      if (!participantId) return;

      const currentEnergy = roomEnergyRef.current;
      const energyScaleBoost = currentEnergy * 0.22;
      const highEnergy = currentEnergy > 0.7;

      const reactionId = `participant-react-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const createdAt = Date.now();

      const scale = new Animated.Value(isSpeaking ? 0.86 : 0.76);
      const translateY = new Animated.Value(0);
      const opacity = new Animated.Value(1);

      participantReactionScaleMapRef.current[reactionId] = scale;
      participantReactionTranslateYMapRef.current[reactionId] = translateY;
      participantReactionOpacityMapRef.current[reactionId] = opacity;

      setPartyParticipantReactions((prev) => {
        const sameParticipant = prev.filter((entry) => entry.participantId === participantId);
        let next = prev;
        if (sameParticipant.length >= 2) {
          const oldest = sameParticipant.sort((a, b) => a.createdAt - b.createdAt)[0];
          if (oldest) {
            animateOutParticipantReaction(oldest.id, 140);
            next = prev.filter((entry) => entry.id !== oldest.id);
          }
        }

        return [...next, { id: reactionId, participantId, participantName, emoji, isSpeaking, createdAt }];
      });

      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: (isSpeaking ? 1.42 : 1.22) + energyScaleBoost,
            duration: 110,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: (isSpeaking ? 1.18 : 1) + energyScaleBoost * 0.45,
            duration: 130,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translateY, {
          toValue: (isSpeaking ? -36 : -22) - (highEnergy ? 9 : 0),
          duration: (isSpeaking ? 1550 : 1300) + (highEnergy ? 240 : 0),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay((isSpeaking ? 1200 : 950) + (highEnergy ? 150 : 0)),
          Animated.timing(opacity, {
            toValue: 0,
            duration: (isSpeaking ? 650 : 520) + (highEnergy ? 140 : 0),
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setPartyParticipantReactions((prev) => prev.filter((entry) => entry.id !== reactionId));
        delete participantReactionScaleMapRef.current[reactionId];
        delete participantReactionTranslateYMapRef.current[reactionId];
        delete participantReactionOpacityMapRef.current[reactionId];
        const timer = participantReactionTimersRef.current[reactionId];
        if (timer) {
          clearTimeout(timer);
          delete participantReactionTimersRef.current[reactionId];
        }
      });

      if (isSpeaking) {
        triggerParticipantReactionBoost(participantId, 950);
      }

      if (showToast) {
        showLivePresenceEvent(`${emoji} ${participantName} reacted`);
      }

      bumpRoomEnergy(isSpeaking ? 0.12 : 0.08);
    },
    [animateOutParticipantReaction, bumpRoomEnergy, showLivePresenceEvent, triggerParticipantReactionBoost],
  );

  const markParticipantActive = useCallback((participantId: string, duration = 2400) => {
    if (!participantId) return;

    lastParticipantActivityAtRef.current = Date.now();
    setActiveParticipantIds((prev) => (prev.includes(participantId) ? prev : [...prev, participantId]));

    const existingTimeout = participantActiveTimeoutsRef.current[participantId];
    if (existingTimeout) clearTimeout(existingTimeout);

    participantActiveTimeoutsRef.current[participantId] = setTimeout(() => {
      setActiveParticipantIds((prev) => prev.filter((id) => id !== participantId));
      delete participantActiveTimeoutsRef.current[participantId];
    }, duration);
  }, []);

  const triggerLocalPartyReaction = useCallback((emoji: string) => {
    if (!inWatchParty) return;

    const currentEnergy = roomEnergyRef.current;
    const highEnergy = currentEnergy > 0.7;
    const energyScaleBoost = currentEnergy * 0.24;

    const participantId =
      activeParticipantId ?? partyParticipants.find((entry) => entry.role === "host")?.id ?? partyParticipants[0]?.id ?? "";
    const reactingParticipant = partyParticipants.find((entry) => entry.id === participantId) ?? null;
    if (participantId) {
      markParticipantActive(participantId, 2400);
      triggerParticipantLinkedReaction(
        participantId,
        reactingParticipant?.name ?? "Someone",
        emoji,
        !!(reactingParticipant?.isSpeaking && reactingParticipant?.canSpeak),
      );
    }

    setPartyMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text: `Someone reacted ${emoji}`,
      },
    ]);

    const id = `party-local-react-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const videoWidth = Math.max(220, Math.floor(videoWidthRef.current || 320));
    const minRightOffset = 10;
    const maxRightOffset = Math.max(minRightOffset, videoWidth - 56);
    const rightOffset =
      minRightOffset + Math.floor(Math.random() * (maxRightOffset - minRightOffset + 1));
    const floatDistance = -(42 + Math.floor(Math.random() * 34) + (highEnergy ? 9 : 0));
    const floatDuration = 420 + Math.floor(Math.random() * 170) + (highEnergy ? 90 : 0);
    const fadeDelay = 120 + Math.floor(Math.random() * 90) + (highEnergy ? 70 : 0);
    const fadeDuration = 160 + Math.floor(Math.random() * 80) + (highEnergy ? 80 : 0);
    const horizontalDrift = (Math.random() < 0.5 ? -1 : 1) * (12 + Math.floor(Math.random() * 15));

    const scale = new Animated.Value(0.66 + energyScaleBoost * 0.28);
    const translateY = new Animated.Value(0);
    const translateX = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    partyLocalReactionScaleMapRef.current[id] = scale;
    partyLocalReactionTranslateMapRef.current[id] = translateY;
    partyLocalReactionTranslateXMapRef.current[id] = translateX;
    partyLocalReactionOpacityMapRef.current[id] = opacity;

    setPartyLocalReactions((prev) => [...prev.slice(-(PARTY_LOCAL_MAX_REACTIONS - 1)), { id, emoji, rightOffset }]);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.26 + energyScaleBoost,
          duration: 90,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1 + energyScaleBoost * 0.42,
          duration: 95,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(translateY, {
        toValue: floatDistance,
        duration: floatDuration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: horizontalDrift,
        duration: floatDuration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(fadeDelay),
        Animated.timing(opacity, {
          toValue: 0,
          duration: fadeDuration,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setPartyLocalReactions((prev) => prev.filter((entry) => entry.id !== id));
      delete partyLocalReactionScaleMapRef.current[id];
      delete partyLocalReactionTranslateMapRef.current[id];
      delete partyLocalReactionTranslateXMapRef.current[id];
      delete partyLocalReactionOpacityMapRef.current[id];
    });
    bumpRoomEnergy(0.07);
  }, [activeParticipantId, bumpRoomEnergy, inWatchParty, markParticipantActive, partyParticipants, triggerParticipantLinkedReaction]);

  useEffect(() => {
    return () => {
      Object.values(participantActiveTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      participantActiveTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!inWatchParty || partyParticipants.length === 0) {
      setActiveParticipantIds([]);
      return;
    }

    const interval = setInterval(() => {
      const idleFor = Date.now() - lastParticipantActivityAtRef.current;
      if (idleFor < 7000) return;
      if (activeParticipantIds.length > 0) return;

      const fallbackParticipant = partyParticipants[Math.floor(Math.random() * partyParticipants.length)];
      if (fallbackParticipant?.id) {
        markParticipantActive(fallbackParticipant.id, 1800);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeParticipantIds.length, inWatchParty, markParticipantActive, partyParticipants]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(participantActivityPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(participantActivityPulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [participantActivityPulse]);

  const onSelectReactionFromPicker = useCallback((emoji: string) => {
    triggerLocalPartyReaction(emoji);
    setRecentReactionEmojis((prev) => pushRecentReaction(prev, emoji));
  }, [triggerLocalPartyReaction]);

  const onToggleLiveFilters = useCallback(() => {
    setPartyCommentsOpen(false);
    setReactionPickerOpen(false);
    setLiveFilterSheetOpen((value) => !value);
  }, []);

  const onResetWatchPartyLiveAudioMix = useCallback(() => {
    setVideoVolume(WATCH_PARTY_LIVE_VIDEO_VOLUME_DEFAULT);
    setAutoDuckEnabled(true);
  }, []);

  const watchPartyLiveAudioMixStatus = useMemo(() => {
    if (!autoDuckEnabled) return "Auto-duck off";
    if (isVoiceActive) return "Video lowered while people talk";
    return "Lower video when people talk";
  }, [autoDuckEnabled, isVoiceActive]);

  const renderWatchPartyLiveAudioMixControls = () => {
    if (!isSharedPartyPlayback) return null;
    const voicePercent = Math.round(clamp(voiceVolume, 0, 1) * 100);

    return (
      <View style={styles.watchPartyAudioMixPanel}>
        <View style={styles.watchPartyAudioMixHeader}>
          <View style={styles.watchPartyAudioMixHeaderCopy}>
            <Text style={styles.watchPartyAudioMixKicker}>Audio Mix</Text>
            <Text style={styles.watchPartyAudioMixStatus}>{watchPartyLiveAudioMixStatus}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.watchPartyAudioMixToggle,
              autoDuckEnabled && styles.watchPartyAudioMixToggleActive,
            ]}
            onPress={() => setAutoDuckEnabled((value) => !value)}
            activeOpacity={0.88}
          >
            <Text
              style={[
                styles.watchPartyAudioMixToggleText,
                autoDuckEnabled && styles.watchPartyAudioMixToggleTextActive,
              ]}
            >
              Auto-duck
            </Text>
          </TouchableOpacity>
        </View>

        <AudioMixSlider label="Video" value={videoVolume} onChange={setVideoVolume} />

        <View style={styles.watchPartyAudioMixVoiceRow}>
          <Text style={styles.watchPartyAudioMixVoiceLabel}>Voices</Text>
          <Text style={styles.watchPartyAudioMixVoiceValue}>{voicePercent}%</Text>
        </View>

        <TouchableOpacity
          style={styles.watchPartyAudioMixResetBtn}
          onPress={onResetWatchPartyLiveAudioMix}
          activeOpacity={0.88}
        >
          <Text style={styles.watchPartyAudioMixResetText}>Reset to default</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const progressPercent = useMemo(() => {
    if (!durationMillis || durationMillis <= 0) return 0;
    return clamp((positionMillis / durationMillis) * 100, 0, 100);
  }, [durationMillis, positionMillis]);

  const roomEnergyAuraOpacity = roomEnergyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.05, 0.34],
  });
  const roomEnergyAuraScale = roomEnergyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.09],
  });
  const speakingParticipantIds = useMemo(
    () => partyParticipants.filter((participant) => participant.isSpeaking && participant.canSpeak).map((participant) => participant.id),
    [partyParticipants],
  );
  const watchPartyLiveVoiceDetected = useMemo(
    () => isSharedPartyPlayback && partyParticipants.some((participant) => (
      participant.isSpeaking
      && participant.canSpeak
      && !participant.muted
    )),
    [isSharedPartyPlayback, partyParticipants],
  );

  useEffect(() => {
    if (!isSharedPartyPlayback) {
      if (watchPartyLiveVoiceIdleTimeoutRef.current) {
        clearTimeout(watchPartyLiveVoiceIdleTimeoutRef.current);
        watchPartyLiveVoiceIdleTimeoutRef.current = null;
      }
      setIsVoiceActive(false);
      return;
    }

    if (watchPartyLiveVoiceDetected) {
      if (watchPartyLiveVoiceIdleTimeoutRef.current) {
        clearTimeout(watchPartyLiveVoiceIdleTimeoutRef.current);
        watchPartyLiveVoiceIdleTimeoutRef.current = null;
      }
      setIsVoiceActive(true);
      return;
    }

    if (watchPartyLiveVoiceIdleTimeoutRef.current) {
      clearTimeout(watchPartyLiveVoiceIdleTimeoutRef.current);
    }
    watchPartyLiveVoiceIdleTimeoutRef.current = setTimeout(() => {
      setIsVoiceActive(false);
      watchPartyLiveVoiceIdleTimeoutRef.current = null;
    }, WATCH_PARTY_LIVE_VOICE_IDLE_MILLIS);
  }, [isSharedPartyPlayback, watchPartyLiveVoiceDetected]);

  useEffect(() => {
    if (watchPartyLiveVolumeIntervalRef.current) {
      clearInterval(watchPartyLiveVolumeIntervalRef.current);
      watchPartyLiveVolumeIntervalRef.current = null;
    }

    if (!isSharedPartyPlayback) {
      effectiveVideoVolumeRef.current = 1;
      setEffectiveVideoVolume(1);
      return;
    }

    const targetVolume = clamp(autoDuckEnabled && isVoiceActive ? duckedVideoVolume : videoVolume, 0, 1);
    const startingVolume = effectiveVideoVolumeRef.current;
    const durationMillis = targetVolume < startingVolume
      ? WATCH_PARTY_LIVE_DUCK_DOWN_MILLIS
      : WATCH_PARTY_LIVE_RESTORE_MILLIS;
    const startedAt = Date.now();

    if (Math.abs(targetVolume - startingVolume) < 0.005) {
      effectiveVideoVolumeRef.current = targetVolume;
      setEffectiveVideoVolume(targetVolume);
      return;
    }

    watchPartyLiveVolumeIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = clamp(elapsed / durationMillis, 0, 1);
      const nextVolume = startingVolume + (targetVolume - startingVolume) * progress;
      effectiveVideoVolumeRef.current = nextVolume;
      setEffectiveVideoVolume(nextVolume);

      if (progress >= 1 && watchPartyLiveVolumeIntervalRef.current) {
        clearInterval(watchPartyLiveVolumeIntervalRef.current);
        watchPartyLiveVolumeIntervalRef.current = null;
      }
    }, WATCH_PARTY_LIVE_VOLUME_TICK_MILLIS);
  }, [autoDuckEnabled, duckedVideoVolume, isSharedPartyPlayback, isVoiceActive, videoVolume]);

  const primaryActiveParticipantIds = useMemo(() => {
    const merged = [...speakingParticipantIds, ...activeParticipantIds.filter((id) => !speakingParticipantIds.includes(id))];
    return merged.slice(0, LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS);
  }, [activeParticipantIds, speakingParticipantIds]);
  const trackedUserId = useMemo(() => String(partyUserId || "").trim() || "anon", [partyUserId]);
  const liveBubbleParticipants = useMemo(() => {
    const seen = new Set<string>();
    const unique = partyParticipants.filter((participant) => {
      if (!participant.id || seen.has(participant.id)) return false;
      seen.add(participant.id);
      return true;
    });

    return unique.sort((a, b) => {
      const aMe = a.id === trackedUserId ? 1 : 0;
      const bMe = b.id === trackedUserId ? 1 : 0;
      if (aMe !== bMe) return bMe - aMe;
      const rank = (role: "host" | "co-host" | "viewer") => (role === "host" ? 0 : role === "co-host" ? 1 : 2);
      const roleDiff = rank(a.role) - rank(b.role);
      if (roleDiff !== 0) return roleDiff;
      return a.name.localeCompare(b.name);
    });
  }, [partyParticipants, trackedUserId]);
  const activePartySpeakerSeatCount = useMemo(
    () => liveBubbleParticipants.filter((participant) => (
      participant.role === "host"
      || participant.stageRole === "host"
      || participant.stageRole === "speaker"
      || participant.canSpeak
    )).length,
    [liveBubbleParticipants],
  );
  const canAddPartySpeakerSeat = useCallback((participant: PartyParticipant) => {
    if (
      participant.role === "host"
      || participant.stageRole === "host"
      || participant.stageRole === "speaker"
      || participant.canSpeak
    ) {
      return true;
    }
    return activePartySpeakerSeatCount < LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS;
  }, [activePartySpeakerSeatCount]);
  const livePrimarySpeakers = useMemo(
    () => liveBubbleParticipants.filter((participant) => participant.isSpeaking && participant.canSpeak).slice(0, LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS),
    [liveBubbleParticipants],
  );
  const currentWatchPartyParticipantName = useMemo(
    () => {
      const currentParticipant = liveBubbleParticipants.find((participant) => participant.id === trackedUserId);
      return resolvePartyParticipantDisplayName({
        isCurrentUser: false,
        role: currentParticipant?.role ?? (partySyncRole === "host" ? "host" : "viewer"),
        candidates: [partyDisplayNameRef.current, currentParticipant?.name],
      });
    },
    [liveBubbleParticipants, partySyncRole, trackedUserId],
  );
  const [playerAppState, setPlayerAppState] = useState<AppStateStatus>(() => AppState.currentState);
  const [playerHasAndroidFocus, setPlayerHasAndroidFocus] = useState(true);
  useEffect(() => {
    const changeSubscription = AppState.addEventListener("change", (nextState) => {
      setPlayerAppState(nextState);
    });
    const focusSubscription = Platform.OS === "android"
      ? AppState.addEventListener("focus", () => setPlayerHasAndroidFocus(true))
      : null;
    const blurSubscription = Platform.OS === "android"
      ? AppState.addEventListener("blur", () => setPlayerHasAndroidFocus(false))
      : null;

    return () => {
      changeSubscription.remove();
      focusSubscription?.remove();
      blurSubscription?.remove();
    };
  }, []);
  const playerMediaIsInteractive = playerAppState === "active" && (Platform.OS !== "android" || playerHasAndroidFocus);
  const watchPartyLiveKitJoinContractExpired = !!watchPartyLiveKitJoinContract
    && isLiveKitParticipantTokenExpired(watchPartyLiveKitJoinContract.participantToken);
  const shouldRenderWatchPartyLiveKit = inWatchParty
    && watchPartyEntryAllowed
    && Platform.OS !== "web"
    && !!watchPartyLiveKitJoinContract
    && !watchPartyLiveKitJoinContractExpired;
  const currentWatchPartyParticipant = useMemo(
    () => partyParticipants.find((participant) => participant.id === trackedUserId) ?? null,
    [partyParticipants, trackedUserId],
  );
  const currentWatchPartyParticipantMuted = useMemo(() => {
    if (currentWatchPartyParticipant) return !!currentWatchPartyParticipant.muted;
    return !!partyMembershipMapRef.current[trackedUserId]?.isMuted;
  }, [currentWatchPartyParticipant, trackedUserId]);
  const currentWatchPartyHostAuthority = useMemo(() => {
    const membershipRole = trackedUserId ? partyMembershipMapRef.current[trackedUserId]?.role ?? null : null;
    const roomHostUserId = String(partyRoomHostUserIdRef.current ?? "").trim();
    const sources = [
      partySyncRole === "host" ? "sync-role" : "",
      currentWatchPartyParticipant?.role === "host" || membershipRole === "host" ? "membership" : "",
      trackedUserId && roomHostUserId && trackedUserId === roomHostUserId ? "room-host" : "",
    ].filter(Boolean);
    return {
      isHost: sources.length > 0,
      source: sources.join("+") || "none",
    };
  }, [currentWatchPartyParticipant?.role, partySyncRole, trackedUserId]);
  const watchPartyLiveSharedPlaybackControlsLocked = isSharedPartyPlayback && !currentWatchPartyHostAuthority.isHost;
  const desiredWatchPartyLiveKitParticipantRole = useMemo<LiveKitTokenReady["participantRole"]>(() => {
    const currentMembership = partyMembershipMapRef.current[trackedUserId];
    if (currentWatchPartyParticipant?.role === "host" || currentMembership?.role === "host" || partySyncRole === "host") return "host";
    if (
      currentWatchPartyParticipant?.canSpeak
      || currentWatchPartyParticipant?.stageRole === "speaker"
      || currentMembership?.canSpeak
      || currentMembership?.stageRole === "speaker"
    ) {
      return "speaker";
    }
    return "viewer";
  }, [currentWatchPartyParticipant, partySyncRole, trackedUserId]);
  const desiredWatchPartyLiveKitCanPublish = desiredWatchPartyLiveKitParticipantRole !== "viewer" && !currentWatchPartyParticipantMuted;
  const watchPartyLiveKitCanPublish = !!watchPartyLiveKitJoinContract?.requestedGrants.canPublish
    && watchPartyLiveKitJoinContract.participantRole !== "viewer";
  const publishWatchPartyLiveKitAudio = watchPartyLiveKitCanPublish && !currentWatchPartyParticipantMuted;
  const publishWatchPartyLiveKitVideo = watchPartyLiveKitCanPublish && !currentWatchPartyParticipantMuted;
  const currentWatchPartyMembershipAuthoritySignature = useMemo(() => {
    const currentMembership = partyMembershipMapRef.current[trackedUserId];
    return [
      currentWatchPartyParticipant?.role ?? "none",
      currentWatchPartyParticipant?.stageRole ?? currentMembership?.stageRole ?? "none",
      (currentWatchPartyParticipant?.canSpeak ?? currentMembership?.canSpeak) ? "canSpeak" : "noSpeak",
      (currentWatchPartyParticipant?.muted ?? currentMembership?.isMuted) ? "muted" : "unmuted",
      currentMembership?.membershipState ?? "none",
    ].join("|");
  }, [currentWatchPartyParticipant, trackedUserId]);
  const watchPartyLiveKitParticipantLabelsByIdentity = useMemo(
    () => Object.fromEntries(liveBubbleParticipants.map((participant) => [
      participant.id,
      resolvePartyParticipantDisplayName({
        isCurrentUser: participant.id === trackedUserId,
        role: participant.role,
        candidates: [participant.name, partyMembershipMapRef.current[participant.id]?.displayName],
      }),
    ])),
    [liveBubbleParticipants, trackedUserId],
  );
  const watchPartyLiveKitParticipantRoster = useMemo(
    () => liveBubbleParticipants.map((participant) => {
      const role: LiveKitStageParticipantRosterEntry["role"] = participant.role === "host"
        ? "host"
        : participant.canSpeak || participant.stageRole === "speaker"
          ? "speaker"
          : "viewer";
      return {
        identity: participant.id,
        label: resolvePartyParticipantDisplayName({
          isCurrentUser: participant.id === trackedUserId,
          role: participant.role,
          candidates: [participant.name, partyMembershipMapRef.current[participant.id]?.displayName],
        }),
        role,
        canPublish: role !== "viewer" && !participant.muted,
        isRequestingToSpeak: currentWatchPartyHostAuthority.isHost && !!participant.isRequestingToSpeak && role === "viewer",
      };
    }),
    [currentWatchPartyHostAuthority.isHost, liveBubbleParticipants, trackedUserId],
  );
  const onWatchPartyLiveKitParticipantPress = useCallback((identity: string) => {
    const participantIdentity = String(identity ?? "").trim();
    if (!participantIdentity) return;
    const tappedParticipant = partyParticipants.find((entry) => entry.id === participantIdentity) ?? null;
    const currentParticipant = partyParticipants.find((entry) => entry.id === trackedUserId) ?? null;
    debugLog("livekit", "watch-party-live bubble tapped", {
      roomName: partyId,
      currentUserId: trackedUserId,
      tappedParticipantIdentity: participantIdentity,
      tappedParticipantRole: tappedParticipant?.role ?? null,
      currentParticipantRole: currentParticipant?.role ?? null,
      currentParticipantCanSpeak: currentParticipant?.canSpeak ?? null,
      currentParticipantIsRequestingToSpeak: currentParticipant?.isRequestingToSpeak ?? null,
    });
    if (currentWatchPartyHostAuthority.isHost) {
      const hostTarget = tappedParticipant ?? null;
      if (!hostTarget || hostTarget.id === trackedUserId || hostTarget.role === "host") return;
      setActiveParticipantId(hostTarget.id);
      setActiveParticipantToolsId(hostTarget.id);
      setControlsVisible(true);
      resetAutoHideTimer();
      setPartyCommentsOpen(false);
      setWatchPartyMenuOpen(false);
      return;
    }
    if (currentParticipant?.canSpeak || currentParticipant?.stageRole === "speaker") return;
    if (currentParticipant?.isRequestingToSpeak) {
      return;
    }
    requestPartySeat().catch(() => {
      showLivePresenceEvent("Camera request unavailable. Try again in a moment.");
    });
  }, [
    currentWatchPartyHostAuthority.isHost,
    partyId,
    partyParticipants,
    requestPartySeat,
    resetAutoHideTimer,
    showLivePresenceEvent,
    trackedUserId,
  ]);
  const hostVisibleSeatRequester = useMemo(() => {
    if (!currentWatchPartyHostAuthority.isHost) return null;
    return liveBubbleParticipants.find((participant) => (
      participant.id !== trackedUserId
      && participant.isRequestingToSpeak
      && !participant.canSpeak
    )) ?? null;
  }, [currentWatchPartyHostAuthority.isHost, liveBubbleParticipants, trackedUserId]);
  useEffect(() => {
    if (!hostVisibleSeatRequester || !partyId) {
      lastPartySeatRequestFocusKeyRef.current = "";
      return;
    }
    const requestFocusKey = `${partyId}:${hostVisibleSeatRequester.id}`;
    if (lastPartySeatRequestFocusKeyRef.current === requestFocusKey) return;
    lastPartySeatRequestFocusKeyRef.current = requestFocusKey;
    setActiveParticipantId(hostVisibleSeatRequester.id);
    setActiveParticipantToolsId(hostVisibleSeatRequester.id);
    setControlsVisible(true);
    resetAutoHideTimer();
    showLivePresenceEvent(`${hostVisibleSeatRequester.name} requested camera.`);
    debugLog("livekit", "watch-party-live host focused seat request", {
      roomName: partyId,
      currentUserId: trackedUserId,
      participantId: hostVisibleSeatRequester.id,
      participantName: hostVisibleSeatRequester.name,
      hostAuthoritySource: currentWatchPartyHostAuthority.source,
      pendingSeatRequestIds: Object.keys(pendingPartySeatRequestsRef.current),
      visibleParticipantIds: liveBubbleParticipants.map((participant) => participant.id),
    });
  }, [
    currentWatchPartyHostAuthority.source,
    hostVisibleSeatRequester,
    liveBubbleParticipants,
    partyId,
    resetAutoHideTimer,
    showLivePresenceEvent,
    trackedUserId,
  ]);
  const watchPartyLiveHostReviewParticipant = useMemo(() => {
    if (!inWatchParty || isLiveModeFlag || !currentWatchPartyHostAuthority.isHost) return null;
    const candidateIds = [
      activeParticipantToolsId,
      activeParticipantId,
      hostVisibleSeatRequester?.id,
    ].filter(Boolean) as string[];
    for (const candidateId of candidateIds) {
      const participant = liveBubbleParticipants.find((entry) => entry.id === candidateId) ?? null;
      if (!participant || participant.id === trackedUserId || participant.role === "host") continue;
      return participant;
    }
    return null;
  }, [
    activeParticipantId,
    activeParticipantToolsId,
    currentWatchPartyHostAuthority.isHost,
    hostVisibleSeatRequester?.id,
    inWatchParty,
    isLiveModeFlag,
    liveBubbleParticipants,
    trackedUserId,
  ]);
  useEffect(() => {
    if (!inWatchParty || Platform.OS === "web") return;
    debugLog("livekit", "watch-party-live authority state", {
      roomName: watchPartyLiveKitJoinContract?.roomName ?? partyId,
      currentUserId: trackedUserId,
      desiredParticipantRole: desiredWatchPartyLiveKitParticipantRole,
      desiredCanPublish: desiredWatchPartyLiveKitCanPublish,
      contractParticipantRole: watchPartyLiveKitJoinContract?.participantRole ?? null,
      contractCanPublish: watchPartyLiveKitJoinContract?.requestedGrants.canPublish ?? null,
      publishWatchPartyLiveKitVideo,
      membershipAuthority: currentWatchPartyMembershipAuthoritySignature,
      hostAuthority: currentWatchPartyHostAuthority,
      pendingSeatRequestIds: Object.keys(pendingPartySeatRequestsRef.current),
      participantIds: partyParticipants.map((participant) => participant.id),
      participantLabelEntries: JSON.stringify(watchPartyLiveKitParticipantRoster.map((participant) => ({
        identity: participant.identity,
        label: participant.label,
        role: participant.role,
        canPublish: participant.canPublish,
        isRequestingToSpeak: participant.isRequestingToSpeak,
      }))),
    });
  }, [
    currentWatchPartyMembershipAuthoritySignature,
    currentWatchPartyHostAuthority,
    desiredWatchPartyLiveKitCanPublish,
    desiredWatchPartyLiveKitParticipantRole,
    inWatchParty,
    partyId,
    partyParticipants,
    publishWatchPartyLiveKitVideo,
    trackedUserId,
    watchPartyLiveKitParticipantRoster,
    watchPartyLiveKitJoinContract?.participantRole,
    watchPartyLiveKitJoinContract?.requestedGrants.canPublish,
    watchPartyLiveKitJoinContract?.roomName,
  ]);
  const liveSpeakingLabel = useMemo(() => {
    if (livePrimarySpeakers.length === 0) return "🎤 Listening Room";
    if (livePrimarySpeakers.length === 1) return `🎤 ${livePrimarySpeakers[0].name} speaking`;
    return `🎤 ${livePrimarySpeakers[0].name} +${livePrimarySpeakers.length - 1} speaking`;
  }, [livePrimarySpeakers]);

  useEffect(() => {
    if (!inWatchParty || !partyId || !watchPartyEntryAllowed || Platform.OS === "web") {
      setWatchPartyLiveKitJoinContract(null);
      watchPartyLiveKitContractRequestKeyRef.current = "";
      watchPartyLiveKitAuthorityRetryKeyRef.current = "";
      return;
    }

    const liveKitParticipantIdentity = watchPartyLiveKitIdentity || trackedUserId;
    if (!liveKitParticipantIdentity || (!watchPartyLiveKitIdentity && liveKitParticipantIdentity === "anon")) return;

    const existingCanPublish = watchPartyLiveKitJoinContract?.requestedGrants.canPublish === true;
    const contractRoomMismatch = !!watchPartyLiveKitJoinContract && watchPartyLiveKitJoinContract.roomName !== partyId;
    const staleRoleContract = !!watchPartyLiveKitJoinContract
      && watchPartyLiveKitJoinContract.participantRole !== desiredWatchPartyLiveKitParticipantRole;
    const stalePublishContract = !!watchPartyLiveKitJoinContract
      && existingCanPublish !== desiredWatchPartyLiveKitCanPublish;
    const staleContract = contractRoomMismatch
      || watchPartyLiveKitJoinContractExpired
      || staleRoleContract
      || stalePublishContract;
    const authorityRetryKey = [
      partyId,
      liveKitParticipantIdentity,
      desiredWatchPartyLiveKitParticipantRole,
      desiredWatchPartyLiveKitCanPublish ? "publish" : "viewer",
      currentWatchPartyMembershipAuthoritySignature,
    ].join(":");

    if (watchPartyLiveKitJoinContract && !staleContract) {
      watchPartyLiveKitContractRequestKeyRef.current = "";
      watchPartyLiveKitAuthorityRetryKeyRef.current = "";
      return;
    }

    if (
      staleContract
      && desiredWatchPartyLiveKitCanPublish
      && !contractRoomMismatch
      && !watchPartyLiveKitJoinContractExpired
      && watchPartyLiveKitAuthorityRetryKeyRef.current === authorityRetryKey
    ) {
      debugLog("livekit", "kept backend-authoritative watch-party-live contract after guarded publish retry", {
        roomName: partyId,
        currentUserId: trackedUserId,
        desiredParticipantRole: desiredWatchPartyLiveKitParticipantRole,
        desiredCanPublish: desiredWatchPartyLiveKitCanPublish,
        contractParticipantRole: watchPartyLiveKitJoinContract?.participantRole ?? null,
        contractCanPublish: existingCanPublish,
        membershipAuthority: currentWatchPartyMembershipAuthoritySignature,
      });
      return;
    }

    if (staleContract) {
      debugLog("livekit", "dropping stale watch-party-live join contract", {
        roomName: watchPartyLiveKitJoinContract?.roomName ?? partyId,
        currentUserId: trackedUserId,
        contractParticipantRole: watchPartyLiveKitJoinContract?.participantRole ?? null,
        contractCanPublish: watchPartyLiveKitJoinContract?.requestedGrants.canPublish ?? null,
        desiredParticipantRole: desiredWatchPartyLiveKitParticipantRole,
        desiredCanPublish: desiredWatchPartyLiveKitCanPublish,
        contractRoomMismatch,
        watchPartyLiveKitJoinContractExpired,
        stalePublishContract,
        staleRoleContract,
        membershipAuthority: currentWatchPartyMembershipAuthoritySignature,
      });
      setWatchPartyLiveKitJoinContract(null);
    }

    const preparedContract = consumePreparedLiveKitJoinBoundary({
      surface: "watch-party-live",
      roomName: partyId,
      participantIdentity: liveKitParticipantIdentity,
    });
    if (preparedContract) {
      const preparedContractCanPublish = preparedContract.requestedGrants.canPublish === true;
      const preparedContractMatchesDesired = preparedContract.roomName === partyId
        && preparedContract.participantRole === desiredWatchPartyLiveKitParticipantRole
        && preparedContractCanPublish === desiredWatchPartyLiveKitCanPublish;
      if (preparedContractMatchesDesired) {
        watchPartyLiveKitContractRequestKeyRef.current = "";
        watchPartyLiveKitAuthorityRetryKeyRef.current = "";
        setWatchPartyLiveKitJoinContract(preparedContract);
        debugLog("livekit", "consumed watch-party-live join contract", {
          roomName: preparedContract.roomName,
          endpoint: preparedContract.endpoint,
          participantRole: preparedContract.participantRole,
          requestedGrants: preparedContract.requestedGrants,
          membershipAuthority: currentWatchPartyMembershipAuthoritySignature,
        });
        return;
      }

      debugLog("livekit", "rejected stale prepared watch-party-live join contract", {
        roomName: preparedContract.roomName,
        currentUserId: trackedUserId,
        desiredParticipantRole: desiredWatchPartyLiveKitParticipantRole,
        desiredCanPublish: desiredWatchPartyLiveKitCanPublish,
        participantRole: preparedContract.participantRole,
        canPublish: preparedContractCanPublish,
        membershipAuthority: currentWatchPartyMembershipAuthoritySignature,
      });
      setWatchPartyLiveKitJoinContract(null);
    }

    const refreshReason = !watchPartyLiveKitJoinContract
      ? "missing"
      : contractRoomMismatch
        ? "room_mismatch"
        : watchPartyLiveKitJoinContractExpired
          ? "expired"
          : staleRoleContract
            ? "role_mismatch"
            : "publish_mismatch";
    const requestKey = [
      partyId,
      liveKitParticipantIdentity,
      desiredWatchPartyLiveKitParticipantRole,
      desiredWatchPartyLiveKitCanPublish ? "publish" : "viewer",
      currentWatchPartyMembershipAuthoritySignature,
      refreshReason,
    ].join(":");
    if (watchPartyLiveKitContractRequestKeyRef.current === requestKey) return;
    watchPartyLiveKitContractRequestKeyRef.current = requestKey;

    let active = true;
    prepareLiveKitJoinBoundary({
      surface: "watch-party-live",
      roomName: partyId,
      participantIdentity: liveKitParticipantIdentity,
      participantName: currentWatchPartyParticipantName,
      participantRole: desiredWatchPartyLiveKitParticipantRole,
      metadata: {
        source: "player-watch-party-live-authority-refresh",
        muted: currentWatchPartyParticipantMuted,
      },
    }).then((joinResult) => {
      if (!active) return;
      if (joinResult.status === "ready") {
        const joinResultCanPublish = joinResult.requestedGrants.canPublish === true;
        const joinResultMatchesDesired = joinResult.participantRole === desiredWatchPartyLiveKitParticipantRole
          && joinResultCanPublish === desiredWatchPartyLiveKitCanPublish;
        setWatchPartyLiveKitJoinContract(joinResult);
        debugLog("livekit", "prepared watch-party-live join contract from membership authority", {
          roomName: joinResult.roomName,
          endpoint: joinResult.endpoint,
          desiredParticipantRole: desiredWatchPartyLiveKitParticipantRole,
          desiredCanPublish: desiredWatchPartyLiveKitCanPublish,
          participantRole: joinResult.participantRole,
          requestedGrants: joinResult.requestedGrants,
          membershipAuthority: currentWatchPartyMembershipAuthoritySignature,
        });

        if (joinResultMatchesDesired) {
          watchPartyLiveKitContractRequestKeyRef.current = "";
          watchPartyLiveKitAuthorityRetryKeyRef.current = "";
          return;
        }

        if (desiredWatchPartyLiveKitCanPublish) {
          if (watchPartyLiveKitAuthorityRetryKeyRef.current !== authorityRetryKey) {
            watchPartyLiveKitAuthorityRetryKeyRef.current = authorityRetryKey;
            if (watchPartyLiveKitAuthorityRetryTimeoutRef.current) {
              clearTimeout(watchPartyLiveKitAuthorityRetryTimeoutRef.current);
            }
            debugLog("livekit", "watch-party-live publish contract still downgraded; refreshing snapshot before one retry", {
              roomName: joinResult.roomName,
              currentUserId: trackedUserId,
              desiredParticipantRole: desiredWatchPartyLiveKitParticipantRole,
              desiredCanPublish: desiredWatchPartyLiveKitCanPublish,
              participantRole: joinResult.participantRole,
              canPublish: joinResultCanPublish,
              membershipAuthority: currentWatchPartyMembershipAuthoritySignature,
            });
            watchPartyLiveKitAuthorityRetryTimeoutRef.current = setTimeout(() => {
              watchPartyLiveKitAuthorityRetryTimeoutRef.current = null;
              if (!watchPartyLiveKitMountedRef.current) return;
              refreshPartyMembershipSnapshot().finally(() => {
                if (!watchPartyLiveKitMountedRef.current) return;
                watchPartyLiveKitContractRequestKeyRef.current = "";
                setWatchPartyLiveKitJoinContract(null);
              });
            }, 650);
          } else {
            debugLog("livekit", "watch-party-live publish contract retry already used for authority snapshot", {
              roomName: joinResult.roomName,
              currentUserId: trackedUserId,
              desiredParticipantRole: desiredWatchPartyLiveKitParticipantRole,
              desiredCanPublish: desiredWatchPartyLiveKitCanPublish,
              participantRole: joinResult.participantRole,
              canPublish: joinResultCanPublish,
              membershipAuthority: currentWatchPartyMembershipAuthoritySignature,
            });
          }
        }
        return;
      }

      setWatchPartyLiveKitJoinContract(null);
      debugLog("livekit", "watch-party-live authority contract unavailable", {
        reason: joinResult.reason,
        roomName: joinResult.roomName,
        responseStatus: joinResult.responseStatus ?? null,
        responseError: joinResult.responseError ?? null,
      });
    }).catch(() => {
      if (active) setWatchPartyLiveKitJoinContract(null);
    });

    return () => {
      active = false;
    };
  }, [
    currentWatchPartyMembershipAuthoritySignature,
    currentWatchPartyParticipantMuted,
    currentWatchPartyParticipantName,
    desiredWatchPartyLiveKitCanPublish,
    desiredWatchPartyLiveKitParticipantRole,
    inWatchParty,
    partyId,
    refreshPartyMembershipSnapshot,
    trackedUserId,
    watchPartyLiveKitIdentity,
    watchPartyEntryAllowed,
    watchPartyLiveKitJoinContract?.participantRole,
    watchPartyLiveKitJoinContract?.requestedGrants.canPublish,
    watchPartyLiveKitJoinContract?.roomName,
    watchPartyLiveKitJoinContractExpired,
  ]);

  const onWatchPartyLiveKitFallback = useCallback((reason: "connection_timeout" | "disconnected" | "room_error") => {
    debugLog("livekit", "falling back to legacy watch-party-live playback path", {
      reason,
      roomName: watchPartyLiveKitJoinContract?.roomName ?? partyId,
    });
    setWatchPartyLiveKitJoinContract(null);
  }, [partyId, watchPartyLiveKitJoinContract?.roomName]);

  useEffect(() => {
    if (!activeParticipantId) return;
    if (partyParticipants.some((participant) => participant.id === activeParticipantId)) return;
    setActiveParticipantId(null);
  }, [activeParticipantId, partyParticipants]);

  useEffect(() => {
    if (!activeParticipantToolsId) return;
    if (partyParticipants.some((participant) => participant.id === activeParticipantToolsId)) return;
    setActiveParticipantToolsId(null);
  }, [activeParticipantToolsId, partyParticipants]);

  useEffect(() => {
    return () => {
      if (livePresenceEventTimeoutRef.current) {
        clearTimeout(livePresenceEventTimeoutRef.current);
        livePresenceEventTimeoutRef.current = null;
      }

      Object.values(participantReactionTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      participantReactionTimersRef.current = {};
      Object.values(participantReactionBoostTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      participantReactionBoostTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "android" && !isReactNativeNewArchitecture() && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!inWatchParty) return;
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.scaleXY },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
  }, [inWatchParty, partyParticipants.length]);

  useEffect(() => {
    partyParticipants.forEach((participant) => {
      if (!participantIdleScaleMapRef.current[participant.id]) {
        participantIdleScaleMapRef.current[participant.id] = new Animated.Value(1);
      }
      if (!participantIdleTranslateXMapRef.current[participant.id]) {
        participantIdleTranslateXMapRef.current[participant.id] = new Animated.Value(0);
      }
      if (!participantFocusScaleMapRef.current[participant.id]) {
        participantFocusScaleMapRef.current[participant.id] = new Animated.Value(1);
      }
      if (!participantFocusOpacityMapRef.current[participant.id]) {
        participantFocusOpacityMapRef.current[participant.id] = new Animated.Value(1);
      }
      if (!participantPressScaleMapRef.current[participant.id]) {
        participantPressScaleMapRef.current[participant.id] = new Animated.Value(1);
      }
      if (!participantVoiceLevelMapRef.current[participant.id]) {
        participantVoiceLevelMapRef.current[participant.id] = new Animated.Value(0);
      }
      if (!participantJoinScaleMapRef.current[participant.id]) {
        participantJoinScaleMapRef.current[participant.id] = new Animated.Value(1);
      }
    });
  }, [partyParticipants]);

  useEffect(() => {
    if (!inWatchParty) return;

    setEntryBoostActive(true);
    if (entryBoostTimeoutRef.current) clearTimeout(entryBoostTimeoutRef.current);
    entryBoostTimeoutRef.current = setTimeout(() => {
      setEntryBoostActive(false);
      entryBoostTimeoutRef.current = null;
    }, 2600);

    const speakingNow = partyParticipants
      .filter((participant) => participant.isSpeaking && participant.canSpeak)
      .slice(0, LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS);
    speakingNow.forEach((participant) => {
      triggerParticipantReactionBoost(participant.id, 1500);
      markParticipantActive(participant.id, 1500);
    });

    return () => {
      if (entryBoostTimeoutRef.current) {
        clearTimeout(entryBoostTimeoutRef.current);
        entryBoostTimeoutRef.current = null;
      }
      setEntryBoostActive(false);
    };
  }, [inWatchParty, markParticipantActive, partyParticipants, triggerParticipantReactionBoost]);

  useEffect(() => {
    if (!inWatchParty || !entryBoostActive) {
      entryPulseOpacity.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(entryPulseOpacity, {
          toValue: 0.28,
          duration: 420,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(entryPulseOpacity, {
          toValue: 0.05,
          duration: 520,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      entryPulseOpacity.setValue(0);
    };
  }, [entryBoostActive, entryPulseOpacity, inWatchParty]);

  useEffect(() => {
    if (!inWatchParty) return;

    const speakingParticipants = partyParticipants.filter((participant) => participant.isSpeaking && participant.canSpeak);
    const speakingCount = speakingParticipants.length;

    partyParticipants.forEach((participant) => {
      const isSpeaking = participant.isSpeaking && participant.canSpeak;
      const targetScale = isSpeaking ? (speakingCount === 1 ? 1.15 : 1.1) : 1;
      const targetOpacity = speakingCount > 0 && !isSpeaking ? 0.72 : 1;

      const focusScale = participantFocusScaleMapRef.current[participant.id];
      const focusOpacity = participantFocusOpacityMapRef.current[participant.id];
      if (!focusScale || !focusOpacity) return;

      Animated.parallel([
        Animated.timing(focusScale, {
          toValue: targetScale,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(focusOpacity, {
          toValue: targetOpacity,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [inWatchParty, partyParticipants]);

  useEffect(() => {
    if (!inWatchParty) return;

    const interval = setInterval(() => {
      const idleCandidates = partyParticipants.filter((participant) => !(participant.isSpeaking && participant.canSpeak));
      if (idleCandidates.length === 0) return;

      const picked = idleCandidates[Math.floor(Math.random() * idleCandidates.length)];
      if (!picked) return;

      const scale = participantIdleScaleMapRef.current[picked.id];
      const translateX = participantIdleTranslateXMapRef.current[picked.id];
      if (!scale || !translateX) return;

      const roomMotionBoost = 1 + roomEnergyRef.current * 0.88;
      const motionScale = (entryBoostActive ? 1.45 : 1) * roomMotionBoost;
      const motionDuration = Math.max(120, (entryBoostActive ? 170 : 180) - Math.round(roomEnergyRef.current * 46));
      const horizontalShift = ((Math.random() < 0.5 ? -1 : 1) * (1 + Math.random())) * motionScale;
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: (entryBoostActive ? 1.07 : 1.05) + roomEnergyRef.current * 0.03,
            duration: motionDuration,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: motionDuration,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(translateX, {
            toValue: horizontalShift,
            duration: motionDuration,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: 0,
            duration: motionDuration,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }, 3200);

    return () => clearInterval(interval);
  }, [entryBoostActive, inWatchParty, partyParticipants]);

  useEffect(() => {
    if (!inWatchParty) return;

    const interval = setInterval(() => {
      partyParticipants.forEach((participant) => {
        const voiceLevel = participantVoiceLevelMapRef.current[participant.id];
        if (!voiceLevel) return;

        const isSpeaking = participant.isSpeaking && participant.canSpeak;
        const energy = roomEnergyRef.current;
        const targetLevel = isSpeaking ? Math.min(1, 0.16 + energy * 0.12 + Math.random() * (0.7 + energy * 0.2)) : 0;
        Animated.timing(voiceLevel, {
          toValue: targetLevel,
          duration: isSpeaking ? Math.max(140, 220 - Math.round(energy * 70)) : 240,
          easing: isSpeaking ? Easing.out(Easing.quad) : Easing.in(Easing.quad),
          useNativeDriver: false,
        }).start();
      });
    }, 190);

    return () => clearInterval(interval);
  }, [inWatchParty, partyParticipants]);

  const displayItem = useMemo<TitleRow | null>(() => {
    if (item) return item;
    if (expectsCreatorVideo) return null;
    if (expectsSpectatorPlayback) return null;
    if (!localTitle) return null;

    return buildLocalPlayerTitle(localTitle as any);
  }, [expectsCreatorVideo, expectsSpectatorPlayback, item, localTitle]);

  const isCreatorVideoPlayback = playbackSourceKind === "creator-video" || expectsCreatorVideo;
  const isSpectatorPlayback = playbackSourceKind === "spectator-playback" || expectsSpectatorPlayback;
  const playerSurfaceMode = resolvePlayerSurfaceMode({
    inWatchParty,
    isLiveModeFlag,
    isSharedPartyPlayback,
    isCreatorVideoPlayback,
    isSpectatorPlayback,
  });
  const playerSurfacePresentation = getPlayerSurfacePresentation(playerSurfaceMode);
  const creatorVideoPaidContentLocked = isCreatorVideoPlayback
    && creatorVideo?.paidContentAccess?.resolverStatus === "resolved"
    && creatorVideo.paidContentAccess.requiresPurchase
    && !creatorVideo.paidContentAccess.allowed;
  const creatorVideoPaidContentPriceLabel = creatorVideoPaidContentLocked
    && creatorVideo?.paidContentAccess?.priceCents
    ? formatMonetizationCurrency(
      creatorVideo.paidContentAccess.priceCents,
      creatorVideo.paidContentAccess.currency ?? "usd",
    )
    : "";
  const source = useMemo(() => {
    if (displayItem?.video_url && displayItem.video_url.trim()) return { uri: displayItem.video_url.trim() };
    if (isCreatorVideoPlayback) return null;
    return displayItem?.video || fallbackVideo;
  }, [displayItem?.video, displayItem?.video_url, fallbackVideo, isCreatorVideoPlayback]);
  useEffect(() => {
    setPlaybackLoadError(null);
    setIsVideoReady(false);
  }, [cleanId, displayItem?.id, displayItem?.video_url, expectsCreatorVideo, expectsSpectatorPlayback]);
  const sharedPartyResolvedSource = useMemo(() => {
    if (!inWatchParty) return source;
    if (displayItem?.video_url && displayItem.video_url.trim()) {
      return { uri: displayItem.video_url.trim() };
    }
    if (titleLoading) return null;
    if (isCreatorVideoPlayback) return null;
    return displayItem?.video || fallbackVideo;
  }, [displayItem?.video, displayItem?.video_url, fallbackVideo, inWatchParty, isCreatorVideoPlayback, source, titleLoading]);
  const [playbackSource, setPlaybackSource] = useState<any>(() =>
    typeof sharedPartyResolvedSource === "number" ? null : sharedPartyResolvedSource,
  );
  useEffect(() => {
    let cancelled = false;

    if (!sharedPartyResolvedSource) {
      setPlaybackSource(null);
      return () => {
        cancelled = true;
      };
    }

    if (typeof sharedPartyResolvedSource !== "number") {
      setPlaybackSource(sharedPartyResolvedSource);
      return () => {
        cancelled = true;
      };
    }

    setPlaybackSource(null);

    // Android preview builds need the bundled asset resolved to a local URI before expo-av can play it.
    const asset = Asset.fromModule(sharedPartyResolvedSource);
    void asset
      .downloadAsync()
      .then(() => {
        if (cancelled) return;
        const localUri = asset.localUri ?? asset.uri;
        setPlaybackSource(localUri ? { uri: localUri } : sharedPartyResolvedSource);
      })
      .catch(() => {
        if (!cancelled) {
          setPlaybackSource(sharedPartyResolvedSource);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sharedPartyResolvedSource]);
  const standalonePlaybackSourceFailed = !inWatchParty && !isLiveModeFlag && !titleLoading && !!playbackLoadError;
  const isCreatorVideoPlaybackUnavailable = isCreatorVideoPlayback && !titleLoading && (!source || standalonePlaybackSourceFailed);
  const isSpectatorPlaybackUnavailable = isSpectatorPlayback && !titleLoading && (!source || spectatorSourceEnded || standalonePlaybackSourceFailed);
  const isPlatformVideoUnavailable = !isCreatorVideoPlayback && !isSpectatorPlayback && !titleLoading && !!displayItem && (!source || standalonePlaybackSourceFailed);
  const isPlatformTitleUnavailable = !expectsCreatorVideo && !expectsSpectatorPlayback && !titleLoading && !displayItem;
  const frameworkBackgroundSource = useMemo<ImageSourcePropType | null>(() => {
    const poster = String((displayItem as any)?.poster_url ?? "").trim();
    if (poster) return { uri: poster };
    const thumb = String((displayItem as any)?.thumbnail_url ?? "").trim();
    if (thumb) return { uri: thumb };
    if (isCreatorVideoPlayback) return CREATOR_VIDEO_BRANDED_BACKGROUND;
    const localVisual = localTitle as any;
    return localVisual?.image || localVisual?.poster || null;
  }, [displayItem, isCreatorVideoPlayback, localTitle]);
  const isLiveMode = isLiveModeFlag;
  const shouldUseSharedAndroidVideoSurface = Platform.OS === "android" && isSharedPartyPlayback;
  const playerVideoVolume = isSharedPartyPlayback ? effectiveVideoVolume : 1;
  const isStandalonePlayer = !inWatchParty && !isLiveMode;
  const shouldUseLiveSpeakerStage = isLiveMode;
  const activeLiveFaceFilter = getLiveFaceFilterPresentation(liveFaceFilter);
  const branding = resolveBrandingConfig(appConfig);
  const monetizationConfig = resolveMonetizationConfig(appConfig);

  useEffect(() => {
    let active = true;

    if (!isStandalonePlayer || playbackSourceKind === "creator-video" || playbackSourceKind === "spectator-playback") {
      setStandaloneAccess(null);
      setStandaloneAccessLoading(false);
      setAccessError(null);
      return () => {
        active = false;
      };
    }

    const safeTitleId = String(displayItem?.id ?? cleanId).trim();
    if (!safeTitleId) {
      setStandaloneAccess(null);
      setStandaloneAccessLoading(false);
      setAccessError("Unable to confirm playback access right now.");
      return () => {
        active = false;
      };
    }

    setStandaloneAccessLoading(true);

    resolveContentAccess({
      titleId: safeTitleId,
      accessRule: displayItem?.content_access_rule,
    })
      .then((access) => {
        if (!active) return;
        setStandaloneAccess(access);
        setAccessError(null);
        setStandaloneAccessLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setStandaloneAccess(null);
        setAccessError("Unable to confirm playback access right now.");
        setStandaloneAccessLoading(false);
      });

    return () => {
      active = false;
    };
  }, [cleanId, displayItem?.content_access_rule, displayItem?.id, isStandalonePlayer, playbackSourceKind, standaloneAccessRetryToken]);

  const standalonePlaybackBlocked = isStandalonePlayer && !!standaloneAccess && !standaloneAccess.isAllowed;
  const standalonePlaybackUnknown = isStandalonePlayer && !standaloneAccessLoading && !standaloneAccess && !!accessError;
  const standalonePlaybackGateActive = isStandalonePlayer && (
    standaloneAccessLoading || standalonePlaybackBlocked || standalonePlaybackUnknown
  );
  const standaloneAccessSheetReason =
    standalonePlaybackBlocked
    && standaloneAccess
    && (standaloneAccess.reason === "premium_required" || standaloneAccess.reason === "party_pass_required")
      ? standaloneAccess.reason
      : null;
  const standaloneAccessSheetPresentation = standaloneAccessSheetReason && standaloneAccess
    ? getMonetizationAccessSheetPresentation({
        gate: standaloneAccess,
        appDisplayName: branding.appDisplayName,
        premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
        premiumUpsellBody: monetizationConfig.premiumUpsellBody,
      })
    : null;
  const watchPartyPremiumSheetPresentation = watchPartyPremiumGate
    ? getMonetizationAccessSheetPresentation({
        gate: watchPartyPremiumGate,
        appDisplayName: branding.appDisplayName,
        premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
        premiumUpsellBody: monetizationConfig.premiumUpsellBody,
      })
    : null;
  const blockedStandaloneAccessEntryLabel = standaloneAccessSheetReason && standaloneAccess
    ? getAccessSheetEntryLabel({
        reason: standaloneAccessSheetReason,
        canPurchase: standaloneAccess.monetization.canPurchase,
      })
    : "Review access";
  const retryStandaloneAccessCheck = useCallback(() => {
    setStandaloneAccessRetryToken((current) => current + 1);
  }, []);
  const refreshStandaloneAccessAfterSheetAction = useCallback(async (action: "purchase" | "restore") => {
    const safeTitleId = String(displayItem?.id ?? cleanId).trim();
    if (!safeTitleId) {
      return {
        message: "Unable to confirm playback access right now.",
        tone: "error" as const,
      };
    }

    const refreshed = await resolveContentAccess({
      titleId: safeTitleId,
      accessRule: displayItem?.content_access_rule,
    }).catch(() => null);
    setStandaloneAccess(refreshed);

    if (refreshed?.isAllowed) {
      trackEvent("monetization_unlock_success", {
        action,
        surface: "standalone-player",
        titleId: safeTitleId,
      });
      setAccessError(null);
      setStandaloneAccessSheetVisible(false);
      return {
        message: action === "restore" ? "Purchases restored. Playback access is active." : "Playback access unlocked. You're ready to watch.",
        tone: "success" as const,
      };
    }

    const message = refreshed?.monetization.issues[0]
      ?? "Playback is still locked for this title after the monetization check.";
    trackEvent("monetization_unlock_failure", {
      action,
      surface: "standalone-player",
      titleId: safeTitleId,
    });
    setAccessError(message);
    return {
      message,
      tone: "error" as const,
    };
  }, [cleanId, displayItem?.content_access_rule, displayItem?.id]);
  const refreshWatchPartyPremiumAfterSheetAction = useCallback(async (action: "purchase" | "restore") => {
    const accessKey = String(
      watchPartyPremiumGate?.accessKey
      ?? (playbackSourceKind === "creator-video" ? creatorVideo?.id : displayItem?.id)
      ?? titleId
      ?? cleanId,
    ).trim();
    const refreshed = await requireWatchPartyLivePremium({ accessKey }).catch(() => null);

    if (refreshed?.allowed) {
      trackEvent("monetization_unlock_success", {
        action,
        surface: inWatchParty ? "watch-party-live-player-entry" : "standalone-player-watch-party-live",
        titleId: accessKey,
      });
      setWatchPartyPremiumGate(null);
      setWatchPartyPremiumSheetVisible(false);
      if (inWatchParty) setWatchPartyEntryRetryToken((current) => current + 1);
      return {
        message: action === "restore" ? "Purchases restored. Watch-Party Live is ready." : "Premium access unlocked. Watch-Party Live is ready.",
        tone: "success" as const,
      };
    }

    if (isRuntimeControlBlockedAccess(refreshed)) {
      const blockedCopy = getRuntimeControlBlockedCopy(refreshed);
      setWatchPartyPremiumGate(null);
      setWatchPartyPremiumSheetVisible(false);
      if (inWatchParty) setWatchPartyEntryError(blockedCopy.message);
      trackEvent("runtime_control_blocked", {
        surface: inWatchParty ? "watch-party-live-player-entry" : "standalone-player-watch-party-live",
        controlKey: refreshed?.runtimeControlKey ?? "watch_party_live_enabled",
        titleId: accessKey,
      });
      return {
        message: blockedCopy.message,
        tone: "error" as const,
      };
    }

    if (refreshed) setWatchPartyPremiumGate(refreshed);
    const message = refreshed?.monetization.issues[0] ?? "Watch-Party Live still needs Premium access on this account.";
    trackEvent("monetization_unlock_failure", {
      action,
      surface: inWatchParty ? "watch-party-live-player-entry" : "standalone-player-watch-party-live",
      titleId: accessKey,
    });
    return {
      message,
      tone: "error" as const,
    };
  }, [cleanId, creatorVideo?.id, displayItem?.id, inWatchParty, playbackSourceKind, titleId, watchPartyPremiumGate?.accessKey]);

  useEffect(() => {
    if (inWatchParty || isLiveMode) {
      setIsStandaloneFullscreen(false);
    }
  }, [inWatchParty, isLiveMode]);

  useEffect(() => {
    if (!isLiveMode) {
      setLiveFilterSheetOpen(false);
    }
  }, [isLiveMode]);

  useEffect(() => {
    if (!isStandalonePlayer || !standalonePlaybackGateActive) return;
    setIsPlaying(false);
    videoRef.current?.pauseAsync().catch(() => {});
  }, [isStandalonePlayer, standalonePlaybackGateActive]);

  useEffect(() => {
    if (!isSharedPartyPlayback) {
      setWatchPartyMenuOpen(false);
      return;
    }

    if (!effectiveControlsVisible) {
      setWatchPartyMenuOpen(false);
      setPartyCommentsOpen(false);
    }
  }, [effectiveControlsVisible, isSharedPartyPlayback]);

  const hasActiveRailParticipants = useMemo(
    () => liveBubbleParticipants.some((entry) => entry.isSpeaking || primaryActiveParticipantIds.includes(entry.id)),
    [liveBubbleParticipants, primaryActiveParticipantIds],
  );
  const watchPartyAudienceLabel = useMemo(() => {
    if (!inWatchParty) return "";
    if (viewerCount <= 1) return "1 viewer synced";
    return `${viewerCount} viewers synced`;
  }, [inWatchParty, viewerCount]);
  const watchPartyPreviewLabel = useMemo(() => {
    if (partyParticipantPreview.length === 0) return "";
    return partyParticipantPreview.slice(0, 2).join(" · ");
  }, [partyParticipantPreview]);
  const compactPartySyncStatus = useMemo(() => {
    if (!partySyncStatus) return "";
    return partySyncStatus
      .replace(/^Synced to Host · /, "")
      .replace(/^Host Controls · /, "")
      .replace(/^Resyncing to Host…$/, "Resyncing")
      .replace(/^Resyncing…$/, "Resyncing")
      .replace(/^Waiting for host…$/, "Waiting for host");
  }, [partySyncStatus]);
  const watchPartySyncLabel = useMemo(() => {
    if (!isSharedPartyPlayback) return "";
    const syncLead = partySyncRole === "host" ? "Host" : "Synced";
    return compactPartySyncStatus ? `${syncLead} · ${compactPartySyncStatus}` : syncLead;
  }, [compactPartySyncStatus, isSharedPartyPlayback, partySyncRole]);
  const shouldUseLiveModeLowerDock = inWatchParty && isLiveMode && !!source;
  const shouldRenderInlineLiveParticipantPanel = isLiveMode && !shouldUseLiveModeLowerDock;
  const shouldRenderInlineLivePresenceToast =
    !!livePresenceEvent && !partyCommentsOpen && !liveFilterSheetOpen && !shouldUseLiveModeLowerDock;
  const shouldRenderWatchPartyLivePresenceToast =
    !!livePresenceEvent && !partyCommentsOpen && !liveFilterSheetOpen && shouldUseLiveModeLowerDock;
  const roomCommentsTitle = isLiveMode ? "Live Room Comments" : "Room Comments";
  const roomCommentsEmptyText = isLiveMode ? "No live room comments yet." : "No room comments yet.";
  const sharedPartyCommentsKeyboardActive = isSharedPartyPlayback && partyCommentsOpen && watchPartyCommentKeyboardOpen;
  const standaloneAccessPresentation = useMemo(() => {
    if (!isStandalonePlayer) return null;
    if (standaloneAccessLoading) {
      return {
        title: "Checking playback access",
        body: "Chi'llywood is confirming whether this title can play on this account right now.",
        primaryLabel: "Checking...",
        primaryDisabled: true,
      };
    }
    if (standalonePlaybackBlocked && standaloneAccess) {
      const title =
        standaloneAccess.reason === "premium_required"
          ? "Premium access required"
          : standaloneAccess.reason === "party_pass_required"
            ? "Party Pass required"
            : `${standaloneAccess.label} access required`;
      const body =
        standaloneAccess.reason === "premium_required"
          ? standaloneAccess.monetization.canPurchase
            ? `Open ${blockedStandaloneAccessEntryLabel} to unlock this title through ${branding.appDisplayName} Premium and start playback here.`
            : `Open ${blockedStandaloneAccessEntryLabel} to review the current Premium status, restore purchases, or manage your subscription before standalone playback can start here.`
          : standaloneAccess.reason === "party_pass_required"
            ? standaloneAccess.monetization.canPurchase
              ? `Open ${blockedStandaloneAccessEntryLabel} to unlock this title through the current Party Pass flow and start playback here.`
              : `Open ${blockedStandaloneAccessEntryLabel} to review the current room-access status, restore purchases, or manage your subscription before standalone playback can start here.`
            : "Standalone playback is not available for this title on this account right now.";
      return {
        title,
        body,
        primaryLabel: blockedStandaloneAccessEntryLabel,
        primaryDisabled: false,
      };
    }
    if (standalonePlaybackUnknown) {
      return {
        title: "Playback access unavailable",
        body: accessError ?? "Chi'llywood could not confirm playback access for this title right now.",
        primaryLabel: "Retry access",
        primaryDisabled: false,
      };
    }
    return null;
  }, [
    accessError,
    blockedStandaloneAccessEntryLabel,
    branding.appDisplayName,
    isStandalonePlayer,
    standaloneAccess,
    standaloneAccessLoading,
    standalonePlaybackBlocked,
    standalonePlaybackUnknown,
  ]);
  const showStandaloneAccessOverlay = isStandalonePlayer && standalonePlaybackGateActive && !!standaloneAccessPresentation;
  const canShareStandaloneTitle = isStandalonePlayer && !isCreatorVideoPlayback && !isSpectatorPlayback && hasResolvedPlatformTitle;
  const canReportStandaloneTitle = isStandalonePlayer && !isCreatorVideoPlayback && !isSpectatorPlayback && hasResolvedPlatformTitle;
  const canShareStandaloneCreatorVideo = isStandalonePlayer && isCreatorVideoPubliclyShareable(creatorVideo);
  const canStartStandaloneWatchPartyLive = isStandalonePlayer
    && !isSpectatorPlayback
    && !standalonePlaybackGateActive
    && !isCreatorVideoPlaybackUnavailable
    && !isPlatformVideoUnavailable;
  useEffect(() => {
    if (!isStandalonePlayer || !isCreatorVideoPlayback) {
      setCreatorVideoComments([]);
      setCreatorVideoCommentsLoading(false);
      setCreatorVideoCommentsError(null);
      return;
    }

    void loadCreatorVideoComments();
  }, [isCreatorVideoPlayback, isStandalonePlayer, loadCreatorVideoComments]);

  useEffect(() => {
    if (!inWatchParty) return;

    const previous = previousParticipantsRef.current;
    if (previous.length === 0) {
      previousParticipantsRef.current = partyParticipants.map((entry) => ({
        id: entry.id,
        name: entry.name,
        isSpeaking: entry.isSpeaking,
      }));
      return;
    }

    const previousById = new Map(previous.map((entry) => [entry.id, entry]));
    const currentById = new Map(partyParticipants.map((entry) => [entry.id, entry]));

    let eventText: string | null = null;

    const joined = partyParticipants.find((entry) => !previousById.has(entry.id));
    if (joined) {
      const joinScale = participantJoinScaleMapRef.current[joined.id];
      if (joinScale) {
        joinScale.setValue(0.8);
        Animated.sequence([
          Animated.timing(joinScale, {
            toValue: 1.06,
            duration: 150,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(joinScale, {
            toValue: 1,
            duration: 170,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      }

      triggerParticipantReactionBoost(joined.id, 1250);
      markParticipantActive(joined.id, 1400);
      bumpRoomEnergy(0.16);

      const now = Date.now();
      if (now - lastJoinToastAtRef.current > 1200) {
        eventText = `👤 ${joined.name} joined`;
        lastJoinToastAtRef.current = now;
      }
    }

    if (!eventText) {
      const left = previous.find((entry) => !currentById.has(entry.id));
      if (left) {
        eventText = `👤 ${left.name} left`;
      }
    }

    if (!eventText) {
      const startedSpeaking = partyParticipants.find((entry) => {
        const prior = previousById.get(entry.id);
        return !!prior && !prior.isSpeaking && entry.isSpeaking;
      });
      if (startedSpeaking) {
        const suppressed = suppressNextSpeakingEventRef.current[startedSpeaking.id] === "start";
        if (suppressed) {
          delete suppressNextSpeakingEventRef.current[startedSpeaking.id];
        } else {
          eventText = startedSpeaking.id === trackedUserId ? "🎤 You are now speaking" : `🎤 ${startedSpeaking.name} started speaking`;
        }
        bumpRoomEnergy(0.1);
      }
    }

    if (!eventText) {
      const stoppedSpeaking = partyParticipants.find((entry) => {
        const prior = previousById.get(entry.id);
        return !!prior && prior.isSpeaking && !entry.isSpeaking;
      });
      if (stoppedSpeaking) {
        const suppressed = suppressNextSpeakingEventRef.current[stoppedSpeaking.id] === "stop";
        if (suppressed) {
          delete suppressNextSpeakingEventRef.current[stoppedSpeaking.id];
        } else {
          eventText = stoppedSpeaking.id === trackedUserId ? "🔇 You are muted" : `🔇 ${stoppedSpeaking.name} stopped speaking`;
        }
      }
    }

    if (eventText) {
      showLivePresenceEvent(eventText);
    }

    previousParticipantsRef.current = partyParticipants.map((entry) => ({
      id: entry.id,
      name: entry.name,
      isSpeaking: entry.isSpeaking,
    }));
  }, [
    inWatchParty,
    trackedUserId,
    markParticipantActive,
    partyParticipants,
    bumpRoomEnergy,
    showLivePresenceEvent,
    triggerParticipantReactionBoost,
  ]);

  const onFocusPlayerParticipant = useCallback((participant: PartyParticipant) => {
    const isHost = currentWatchPartyHostAuthority.isHost;
    markParticipantActive(participant.id, 2400);
    bumpRoomEnergy(0.03);
    if (!isHost && participant.id === trackedUserId && !participant.canSpeak) {
      requestPartySeat().catch(() => {});
    }
    if (!isHost) return;
    const nextParticipantId = activeParticipantId === participant.id ? null : participant.id;
    setActiveParticipantId(nextParticipantId);
    setActiveParticipantToolsId(null);
  }, [activeParticipantId, bumpRoomEnergy, currentWatchPartyHostAuthority.isHost, markParticipantActive, requestPartySeat, trackedUserId]);

  const reportPartySeatUpdateUnavailable = useCallback(async () => {
    showLivePresenceEvent("Seat update unavailable. Try again in a moment.");
    Alert.alert("Seat update unavailable", "The seat change could not be saved yet. Try again in a moment.");
    await refreshPartyMembershipSnapshot().catch(() => null);
  }, [refreshPartyMembershipSnapshot, showLivePresenceEvent]);

  const approvePartyParticipantSeat = useCallback(async (participant: PartyParticipant) => {
    if (!canAddPartySpeakerSeat(participant)) {
      showLivePresenceEvent(`Speaker seats are full (${LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS} max)`);
      return false;
    }
    const seatPersisted = await persistPartySeatState(participant.id, {
      canSpeak: true,
      stageRole: "speaker",
      isRequestingToSpeak: false,
    });
    if (!seatPersisted) {
      await reportPartySeatUpdateUnavailable();
      return false;
    }
    suppressNextSpeakingEventRef.current[participant.id] = "start";
    setPartyParticipants((prev) =>
      prev.map((entry) =>
        entry.id === participant.id
          ? { ...entry, canSpeak: true, stageRole: "speaker", isSpeaking: true, isRequestingToSpeak: false }
          : entry,
      ),
    );
    speakingOrderRef.current = [
      ...speakingOrderRef.current.filter((id) => id !== participant.id),
      participant.id,
    ];
    showLivePresenceEvent(`✅ ${participant.name} is now allowed to speak`);
    bumpRoomEnergy(0.11);
    markParticipantActive(participant.id, 2400);
    return true;
  }, [
    bumpRoomEnergy,
    canAddPartySpeakerSeat,
    markParticipantActive,
    persistPartySeatState,
    reportPartySeatUpdateUnavailable,
    showLivePresenceEvent,
  ]);

  const denyPartyParticipantSeatRequest = useCallback(async (participant: PartyParticipant) => {
    clearPendingPartySeatRequest(participant.id, "seat-request-denied");
    setPartyParticipants((prev) =>
      prev.map((entry) =>
        entry.id === participant.id ? { ...entry, isRequestingToSpeak: false } : entry,
      ),
    );
    if (participant.id === trackedUserId) {
      syncCurrentPartyPresence({ isRequestingToSpeak: false }).catch(() => {});
    }
    await broadcastPartySeatRequest(participant.id, false).catch((error) => {
      debugLog("livekit", "watch-party-live seat request deny marker failed", {
        roomName: partyId,
        participantId: participant.id,
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
    });
    showLivePresenceEvent(`❌ ${participant.name} request denied`);
    bumpRoomEnergy(0.04);
    return true;
  }, [
    broadcastPartySeatRequest,
    bumpRoomEnergy,
    clearPendingPartySeatRequest,
    partyId,
    showLivePresenceEvent,
    syncCurrentPartyPresence,
    trackedUserId,
  ]);

  const renderParticipantExpandedHostShell = ({
    participant,
    dockLayout,
    isRequesting,
    toolsExpanded,
    participantSeatSummary,
    participantToolsLabel,
  }: {
    participant: PartyParticipant;
    dockLayout: boolean;
    isRequesting: boolean;
    toolsExpanded: boolean;
    participantSeatSummary: string;
    participantToolsLabel: string;
  }) => (
    <>
      <View style={[styles.participantExpandedSummary, dockLayout && styles.participantExpandedSummaryDock]}>
        <View style={styles.participantExpandedSummaryCopy}>
          <Text style={styles.participantExpandedSummaryKicker}>PLAYBACK CONTEXT</Text>
          <Text style={styles.participantExpandedSummaryTitle}>
            {participant.id === trackedUserId ? "Your seat" : `${participant.name}'s seat`}
          </Text>
          <Text style={styles.participantExpandedSummaryBody}>{participantSeatSummary}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.partyParticipantControlBtn,
            styles.participantToolsToggleBtn,
            dockLayout && styles.partyParticipantControlBtnDock,
            toolsExpanded && styles.partyParticipantControlBtnActive,
          ]}
          onPress={() => {
            setActiveParticipantToolsId((current) => (current === participant.id ? null : participant.id));
          }}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.partyParticipantControlBtnText,
              toolsExpanded && styles.partyParticipantControlBtnTextActive,
            ]}
          >
            {participantToolsLabel}
          </Text>
        </TouchableOpacity>
      </View>

      {toolsExpanded ? (
        <View style={[styles.participantExpandedControls, dockLayout && styles.participantExpandedControlsDock]}>
          {isRequesting ? (
            <>
              <TouchableOpacity
                style={[styles.partyParticipantControlBtn, dockLayout && styles.partyParticipantControlBtnDock]}
                onPress={async () => {
                  await approvePartyParticipantSeat(participant);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.partyParticipantControlBtnText}>Approve</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.partyParticipantControlBtn, dockLayout && styles.partyParticipantControlBtnDock]}
                onPress={async () => {
                  await denyPartyParticipantSeatRequest(participant);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.partyParticipantControlBtnText}>Deny</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity
            style={[styles.partyParticipantControlBtn, dockLayout && styles.partyParticipantControlBtnDock]}
            onPress={() => {
              setPartyParticipants((prev) => {
                const target = prev.find((entry) => entry.id === participant.id);
                if (!target) return prev;

                if (!target.canSpeak) {
                  return prev;
                }

                const enablingSpeak = !target.isSpeaking;
                let nextParticipants = prev.map((entry) =>
                  entry.id === participant.id ? { ...entry, isSpeaking: enablingSpeak } : entry,
                );

                if (enablingSpeak) {
                  speakingOrderRef.current = [
                    ...speakingOrderRef.current.filter((id) => id !== participant.id),
                    participant.id,
                  ];
                } else {
                  speakingOrderRef.current = speakingOrderRef.current.filter((id) => id !== participant.id);
                }

                const currentlySpeakingIds = nextParticipants
                  .filter((entry) => entry.canSpeak && entry.isSpeaking)
                  .map((entry) => entry.id);

                if (currentlySpeakingIds.length > LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS) {
                  const orderedSpeaking = speakingOrderRef.current.filter((id) => currentlySpeakingIds.includes(id));
                  const toDropCount = orderedSpeaking.length - LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS;
                  const dropIds = new Set(orderedSpeaking.slice(0, toDropCount));

                  nextParticipants = nextParticipants.map((entry) =>
                    dropIds.has(entry.id) ? { ...entry, isSpeaking: false } : entry,
                  );
                  speakingOrderRef.current = orderedSpeaking.slice(toDropCount);
                }

                bumpRoomEnergy(enablingSpeak ? 0.08 : 0.03);

                return nextParticipants;
              });
            }}
            disabled={!participant.canSpeak}
            activeOpacity={0.85}
          >
            <Text style={styles.partyParticipantControlBtnText}>
              {participant.canSpeak ? (participant.isSpeaking ? "Stop Speaking" : "Start Speaking") : "No Mic Access"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.partyParticipantControlBtn, dockLayout && styles.partyParticipantControlBtnDock]}
            onPress={async () => {
              const nextCanSpeak = !participant.canSpeak;
              if (nextCanSpeak && !canAddPartySpeakerSeat(participant)) {
                showLivePresenceEvent(`Speaker seats are full (${LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS} max)`);
                return;
              }
              const seatPersisted = await persistPartySeatState(participant.id, {
                canSpeak: nextCanSpeak,
                stageRole: nextCanSpeak ? "speaker" : "listener",
                isRequestingToSpeak: false,
              });
              if (!seatPersisted) {
                await reportPartySeatUpdateUnavailable();
                return;
              }
              setPartyParticipants((prev) =>
                prev.map((entry) => {
                  if (entry.id !== participant.id) return entry;
                  return {
                    ...entry,
                    canSpeak: nextCanSpeak,
                    stageRole: nextCanSpeak ? "speaker" : "listener",
                    isSpeaking: nextCanSpeak ? entry.isSpeaking : false,
                    isRequestingToSpeak: false,
                  };
                }),
              );

              if (participant.canSpeak) {
                speakingOrderRef.current = speakingOrderRef.current.filter((id) => id !== participant.id);
              }
              bumpRoomEnergy(participant.canSpeak ? 0.04 : 0.07);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.partyParticipantControlBtnText}>{participant.canSpeak ? "Move to Audience" : "Seat Participant"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.partyParticipantControlBtn, dockLayout && styles.partyParticipantControlBtnDock]}
            onPress={async () => {
              const nextMuted = !participant.muted;
              const seatPersisted = await persistPartySeatState(participant.id, {
                canSpeak: participant.canSpeak,
                stageRole: participant.stageRole,
                isRequestingToSpeak: participant.isRequestingToSpeak,
                isMuted: nextMuted,
              });
              if (!seatPersisted) {
                await reportPartySeatUpdateUnavailable();
                return;
              }
              setPartyParticipants((prev) =>
                prev.map((entry) =>
                  entry.id === participant.id ? { ...entry, muted: nextMuted, isSpeaking: nextMuted ? false : entry.isSpeaking } : entry,
                ),
              );
              bumpRoomEnergy(0.03);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.partyParticipantControlBtnText}>{participant.muted ? "Unmute" : "Mute"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  const renderParticipantPanel = (liveLayout = false, dockLayout = false) => {
    return (
      <View
        style={[
          styles.partyFeedCard,
          liveLayout && styles.partyFeedCardLive,
          dockLayout && styles.partyFeedCardLiveDock,
          !liveLayout && styles.partyFeedCardTitleCompact,
        ]}
      >
        <FlatList
          key={liveLayout ? "watch-party-live-grid" : "watch-party-title-rail"}
          horizontal={!liveLayout}
          numColumns={liveLayout ? 5 : undefined}
          data={liveBubbleParticipants}
          keyExtractor={(participant) => participant.id}
          showsHorizontalScrollIndicator={!liveLayout}
          showsVerticalScrollIndicator={liveLayout}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={Platform.OS === "android"}
          initialNumToRender={dockLayout ? 18 : liveLayout ? 12 : 10}
          maxToRenderPerBatch={dockLayout ? 20 : 16}
          windowSize={7}
          columnWrapperStyle={liveLayout ? styles.participantBubbleGridRow : undefined}
          extraData={{
          trackedUserId,
          partySyncRole,
          currentUserCanApproveSeatRequests: currentWatchPartyHostAuthority.isHost,
          activeParticipantId,
          primaryActiveParticipantIds,
          participantReactionBoostIds,
          partyParticipantReactions,
          liveFaceFilter,
          cameraGranted: !!cameraPermission?.granted,
          }}
          contentContainerStyle={[
            styles.participantBubbleScroll,
            liveLayout && styles.participantBubbleScrollLive,
            liveLayout && styles.participantBubbleScrollLiveGrid,
            dockLayout && styles.participantBubbleScrollLiveDock,
          !liveLayout && styles.participantBubbleScrollTitleCompact,
        ]}
        renderItem={({ item: participant }) => {
          const isCurrentUser = participant.id === trackedUserId;
          const isHost = currentWatchPartyHostAuthority.isHost;
          const isExpanded = liveLayout && isHost && activeParticipantId === participant.id;
          const toolsExpanded = isExpanded && activeParticipantToolsId === participant.id;
          const isSpeaking = participant.isSpeaking && participant.canSpeak;
          const isActive = primaryActiveParticipantIds.includes(participant.id);
          const isFeatured = participant.canSpeak && (isActive || activeParticipantId === participant.id) && participant.role !== "host";
          const isRequesting = isHost && participant.isRequestingToSpeak && !participant.canSpeak;
          const shouldDim = primaryActiveParticipantIds.length > 0 && !isActive;
          const isReactionBoosted = participantReactionBoostIds.includes(participant.id);
          const participantReactions = partyParticipantReactions
            .filter((entry) => entry.participantId === participant.id)
            .slice(-2);
          const focusScale = participantFocusScaleMapRef.current[participant.id] ?? 1;
          const focusOpacity = participantFocusOpacityMapRef.current[participant.id] ?? 1;
          const idleScale = !isSpeaking ? (participantIdleScaleMapRef.current[participant.id] ?? 1) : 1;
          const idleTranslateX = !isSpeaking ? (participantIdleTranslateXMapRef.current[participant.id] ?? 0) : 0;
          const pressScale = participantPressScaleMapRef.current[participant.id] ?? 1;
          const joinScale = participantJoinScaleMapRef.current[participant.id] ?? 1;
          const isOnlineActive = isSpeaking || isActive;
          const showLocalCameraPreview = (
            Platform.OS !== "web"
            && isCurrentUser
            && !!cameraPermission?.granted
            && playerMediaIsInteractive
            && !shouldRenderWatchPartyLiveKit
          );
          const bubbleMediaUri = (isCurrentUser ? myCameraPreviewUrlRef.current : "") || participant.cameraPreviewUrl || participant.avatarUrl || "";
          const initials = getInitials(participant.name);
          const participantSeatSummary = isRequesting
            ? `${participant.id === trackedUserId ? "You" : participant.name} requested mic access.`
            : participant.canSpeak
              ? participant.isSpeaking
                ? `${participant.id === trackedUserId ? "You are" : `${participant.name} is`} live on mic right now.`
                : `${participant.id === trackedUserId ? "You are" : `${participant.name} is`} seated and ready to speak.`
              : `${participant.id === trackedUserId ? "You are" : `${participant.name} is`} in the audience layer.`;
          const participantToolsLabel = isRequesting ? "Review request" : toolsExpanded ? "Hide host tools" : "Host tools";

          return (
            <Animated.View
              style={[
                styles.participantBubbleItem,
                liveLayout && styles.participantBubbleItemLive,
                liveLayout && styles.participantBubbleItemLiveGrid,
                dockLayout && styles.participantBubbleItemLiveDock,
                !liveLayout && styles.participantBubbleItemTitleCompact,
                shouldDim && styles.participantBubbleInactive,
                isReactionBoosted && styles.participantBubbleReactionBoost,
                isExpanded && styles.partyParticipantCardExpanded,
                {
                  opacity: focusOpacity,
                  transform: [
                    { scale: focusScale },
                    { scale: joinScale },
                    { scale: idleScale },
                    { scale: pressScale },
                    { translateX: idleTranslateX },
                  ],
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.partyParticipantBubbleTap, dockLayout && styles.partyParticipantBubbleTapDock]}
                onPressIn={() => {
                  const press = participantPressScaleMapRef.current[participant.id];
                  if (!press) return;
                  Animated.timing(press, {
                    toValue: 0.95,
                    duration: 90,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                  }).start();
                }}
                onPressOut={() => {
                  const press = participantPressScaleMapRef.current[participant.id];
                  if (!press) return;
                  Animated.timing(press, {
                    toValue: 1,
                    duration: 120,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                  }).start();
                }}
                onPress={() => {
                  onFocusPlayerParticipant(participant);
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.partyParticipantAvatarWrap, dockLayout && styles.partyParticipantAvatarWrapDock]}>
                  <View
                    style={[
                      styles.participantAvatar,
                      liveLayout && styles.participantAvatarLive,
                      dockLayout && styles.participantAvatarLiveDock,
                      dockLayout && styles.watchPartyParticipantAvatar,
                      !liveLayout && styles.participantAvatarTitleCompact,
                      participant.muted && styles.participantAvatarMuted,
                    ]}
                  >
                    {(showLocalCameraPreview || bubbleMediaUri) ? (
                      showLocalCameraPreview ? (
                        <>
                          <CameraView style={styles.participantAvatarImage} facing="front" mute mirror />
                          {isCurrentUser && liveFaceFilter !== "none" ? (
                            <View
                              pointerEvents="none"
                              style={[
                                styles.liveFaceFilterPreviewOverlay,
                                {
                                  backgroundColor: activeLiveFaceFilter.overlayColor,
                                  borderColor: activeLiveFaceFilter.borderColor,
                                },
                              ]}
                            />
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Image source={{ uri: bubbleMediaUri }} style={styles.participantAvatarImage} />
                          {isCurrentUser && liveFaceFilter !== "none" ? (
                            <View
                              pointerEvents="none"
                              style={[
                                styles.liveFaceFilterPreviewOverlay,
                                {
                                  backgroundColor: activeLiveFaceFilter.overlayColor,
                                  borderColor: activeLiveFaceFilter.borderColor,
                                },
                              ]}
                            />
                          ) : null}
                        </>
                      )
                    ) : (
                      <Text style={[styles.participantInitials, liveLayout && styles.participantInitialsLive, !liveLayout && styles.participantInitialsTitleCompact]}>{initials}</Text>
                    )}
                  </View>
                  {isRequesting ? <View pointerEvents="none" style={styles.participantRequestRing} /> : null}
                  <View style={[styles.participantPresenceDot, isOnlineActive ? styles.participantPresenceDotActive : styles.participantPresenceDotIdle]} />
                  {participant.role === "host" || participant.role === "co-host" ? (
                    <View style={styles.participantHostBadge}>
                      <Text style={styles.participantHostBadgeText}>{participant.role === "host" ? "HOST" : "CO-HOST"}</Text>
                    </View>
                  ) : null}
                  {isRequesting ? (
                    <View style={styles.participantRequestBadge}>
                      <Text style={styles.participantRequestBadgeText}>✋</Text>
                    </View>
                  ) : null}
                  {participant.muted ? (
                    <View style={styles.participantMutedOverlay}>
                      <Text style={styles.participantMutedOverlayText}>🔇</Text>
                    </View>
                  ) : null}

                  {participantReactions.map((reaction, reactionIndex) => (
                    <Animated.View
                      key={reaction.id}
                      pointerEvents="none"
                      style={[
                        styles.participantLinkedReaction,
                        {
                          right: reactionIndex * 14 - 2,
                          opacity: participantReactionOpacityMapRef.current[reaction.id] ?? 1,
                          transform: [
                            { translateY: participantReactionTranslateYMapRef.current[reaction.id] ?? 0 },
                            { scale: participantReactionScaleMapRef.current[reaction.id] ?? 1 },
                          ],
                        },
                      ]}
                    >
                      <Text style={styles.participantLinkedReactionText}>
                        {reaction.emoji}
                      </Text>
                    </Animated.View>
                  ))}
                </View>
                <Text
                  style={[
                    styles.participantName,
                    liveLayout && styles.participantNameLive,
                    dockLayout && styles.participantNameLiveDock,
                    !liveLayout && styles.participantNameTitleCompact,
                  ]}
                  numberOfLines={1}
                >
                  {participant.id === trackedUserId ? "You" : participant.name}
                </Text>
                {liveLayout ? (
                  <Text style={[styles.partyParticipantStatus, dockLayout && styles.partyParticipantStatusDock]}>
                    {getLiveParticipantStatusText({
                      isSpeaking,
                      isRequesting,
                      isMuted: participant.muted,
                      role: participant.role,
                      canSpeak: participant.canSpeak,
                      isFeatured,
                    })}
                  </Text>
                ) : null}
              </TouchableOpacity>

              {isExpanded ? renderParticipantExpandedHostShell({
                participant,
                dockLayout,
                isRequesting,
                toolsExpanded,
                participantSeatSummary,
                participantToolsLabel,
              }) : null}
            </Animated.View>
          );
        }}
      />
      </View>
    );
  };

  const renderWatchPartyLiveHostReviewCard = () => {
    const participant = watchPartyLiveHostReviewParticipant;
    if (!participant) return null;
    const isRequesting = participant.isRequestingToSpeak && !participant.canSpeak;
    const seatActionLabel = participant.canSpeak ? "Move to Audience" : "Seat Participant";

    return (
      <View style={[styles.watchPartyDockCard, styles.watchPartyHostReviewCard]}>
        <View style={styles.watchPartyHostReviewHeader}>
          <View style={styles.watchPartyHostReviewMeta}>
            <Text style={styles.watchPartyDockCardTitle}>{isRequesting ? "Camera Request" : "Participant Seat"}</Text>
            <Text style={styles.watchPartyHostReviewTitle} numberOfLines={1}>{participant.name}</Text>
          </View>
          <TouchableOpacity
            style={styles.watchPartyHostReviewCloseBtn}
            onPress={() => {
              setActiveParticipantId(null);
              setActiveParticipantToolsId(null);
            }}
            activeOpacity={0.84}
          >
            <Text style={styles.watchPartyHostReviewCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.watchPartyHostReviewBody}>
          {isRequesting
            ? "Review this request and approve only when you want this viewer to publish camera and mic."
            : participant.canSpeak
              ? "This participant is seated and can publish. Move them back to the audience when needed."
              : "Seat this participant to let them publish camera and mic."}
        </Text>
        <View style={styles.watchPartyHostReviewActionRow}>
          {isRequesting ? (
            <>
              <TouchableOpacity
                style={[styles.partyParticipantControlBtn, styles.watchPartyHostReviewPrimaryBtn]}
                onPress={async () => {
                  await approvePartyParticipantSeat(participant);
                }}
                activeOpacity={0.86}
              >
                <Text style={styles.partyParticipantControlBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.partyParticipantControlBtn}
                onPress={async () => {
                  await denyPartyParticipantSeatRequest(participant);
                }}
                activeOpacity={0.86}
              >
                <Text style={styles.partyParticipantControlBtnText}>Deny</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.partyParticipantControlBtn, styles.watchPartyHostReviewPrimaryBtn]}
              onPress={async () => {
                const nextCanSpeak = !participant.canSpeak;
                if (nextCanSpeak && !canAddPartySpeakerSeat(participant)) {
                  showLivePresenceEvent(`Speaker seats are full (${LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS} max)`);
                  return;
                }
                const seatPersisted = await persistPartySeatState(participant.id, {
                  canSpeak: nextCanSpeak,
                  stageRole: nextCanSpeak ? "speaker" : "listener",
                  isRequestingToSpeak: false,
                });
                if (!seatPersisted) {
                  await reportPartySeatUpdateUnavailable();
                  return;
                }
                setPartyParticipants((prev) =>
                  prev.map((entry) =>
                    entry.id === participant.id
                      ? {
                          ...entry,
                          canSpeak: nextCanSpeak,
                          stageRole: nextCanSpeak ? "speaker" : "listener",
                          isSpeaking: nextCanSpeak ? entry.isSpeaking : false,
                          isRequestingToSpeak: false,
                        }
                      : entry,
                  ),
                );
                if (participant.canSpeak) {
                  speakingOrderRef.current = speakingOrderRef.current.filter((id) => id !== participant.id);
                }
                bumpRoomEnergy(participant.canSpeak ? 0.04 : 0.07);
              }}
              activeOpacity={0.86}
            >
              <Text style={styles.partyParticipantControlBtnText}>{seatActionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderTitleParticipantExpandedPanel = () => (
    <View style={styles.titleParticipantFeedWrap}>
      <View style={[styles.watchPartySocialShell, sharedPartyCommentsKeyboardActive && styles.watchPartySocialShellKeyboardHidden]}>
        <View style={styles.watchPartySocialHeaderRow}>
          <View style={styles.watchPartyPlayerBandMeta}>
            <Text style={styles.watchPartyPlayerBandKicker}>WATCH-PARTY LIVE</Text>
            <Text style={styles.watchPartyPlayerBandSubtle}>
              {watchPartySyncLabel || watchPartyAudienceLabel || "Shared playback syncing"}
            </Text>
          </View>
          {watchPartyLiveKitJoinContract ? (
            <View style={[styles.watchPartySocialMetaPill, styles.watchPartySocialMetaPillRole]}>
              <Text style={styles.watchPartySocialRoleText}>{watchPartyLiveKitJoinContract.participantRole.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
        {watchPartyPreviewLabel ? (
          <Text style={styles.watchPartySocialHelperText} numberOfLines={1}>
            {watchPartyPreviewLabel}
          </Text>
        ) : null}
        {shouldRenderWatchPartyLiveKit && watchPartyLiveKitJoinContract ? (
          <View style={styles.watchPartySocialMediaFrame}>
            <LiveKitStageMediaSurface
              joinContract={watchPartyLiveKitJoinContract}
              onFallback={onWatchPartyLiveKitFallback}
              active={playerMediaIsInteractive}
              fillParent={false}
              layout="bubble-grid"
              participantLabelsByIdentity={watchPartyLiveKitParticipantLabelsByIdentity}
              participantRoster={watchPartyLiveKitParticipantRoster}
              onParticipantPress={onWatchPartyLiveKitParticipantPress}
              showRequestIndicators={currentWatchPartyHostAuthority.isHost}
              surfaceLabel="Watch-Party Live"
              publishLocalAudio={publishWatchPartyLiveKitAudio}
              publishLocalVideo={publishWatchPartyLiveKitVideo}
              containerStyle={styles.watchPartySocialMediaFrameInner}
            />
          </View>
        ) : (
          <View style={styles.watchPartySocialPlaceholder}>
            <Text style={styles.watchPartySocialPlaceholderKicker}>SHARED PLAYER</Text>
            <Text style={styles.watchPartySocialPlaceholderBody}>
              Shared playback stays here if the room drops back from live camera.
            </Text>
          </View>
        )}
      </View>

      <Animated.View
        pointerEvents={effectiveControlsVisible ? "auto" : "none"}
        style={[
          styles.watchPartyDockOverlay,
          sharedPartyCommentsKeyboardActive && styles.watchPartyDockOverlayKeyboard,
          {
            opacity: partyOverlayControlsOpacity,
            transform: [{ translateY: partyOverlayControlsTranslateY }],
          },
        ]}
      >
        <View style={styles.watchPartyDockActionRow}>
          <TouchableOpacity
            style={styles.watchPartyDockActionBtn}
            onPress={onPressWatchPartyRoom}
            activeOpacity={0.88}
          >
            <Text style={styles.watchPartyDockActionText}>Party Room</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.watchPartyDockActionBtn, partyCommentsOpen && styles.watchPartyDockActionBtnActive]}
            onPress={onToggleWatchPartyComments}
            activeOpacity={0.88}
          >
            <Text style={[styles.watchPartyDockActionText, partyCommentsOpen && styles.watchPartyDockActionTextActive]}>Room Comments</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.watchPartyDockActionBtn, watchPartyMenuOpen && styles.watchPartyDockActionBtnActive]}
            onPress={onToggleWatchPartyMenu}
            activeOpacity={0.88}
          >
            <Text style={[styles.watchPartyDockActionText, watchPartyMenuOpen && styles.watchPartyDockActionTextActive]}>Controls</Text>
          </TouchableOpacity>
        </View>

        {renderWatchPartyLiveHostReviewCard()}

        {partyCommentsOpen ? (
          <View style={[styles.watchPartyDockCard, sharedPartyCommentsKeyboardActive && styles.watchPartyDockCardKeyboardComposer]}>
            {renderPartyCommentsContent()}
          </View>
        ) : null}

        {watchPartyMenuOpen ? (
          <View style={styles.watchPartyDockCard}>
            <Text style={styles.watchPartyDockCardTitle}>Player Controls</Text>
            {renderWatchPartyLiveAudioMixControls()}
            <View style={styles.watchPartyDockMenuRow}>
              <TouchableOpacity
                style={[styles.watchPartyDockMenuBtn, myListBusy && styles.secondaryBtnDisabled]}
                onPress={onToggleWatchPartyMyList}
                disabled={myListBusy}
                activeOpacity={0.88}
              >
                <Text style={styles.watchPartyDockMenuBtnText}>
                  {myListBusy ? "Saving..." : inMyList ? "In My List" : "Add to My List"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.watchPartyDockRateRow}>
              {SPEED_OPTIONS.map((option) => {
                const active = playbackRate === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.watchPartyDockRateChip,
                      active && styles.watchPartyDockRateChipActive,
                      watchPartyLiveSharedPlaybackControlsLocked && styles.secondaryBtnDisabled,
                    ]}
                    onPress={() => onSelectWatchPartyRate(option)}
                    disabled={watchPartyLiveSharedPlaybackControlsLocked}
                    activeOpacity={0.88}
                  >
                    <Text style={[styles.watchPartyDockRateChipText, active && styles.watchPartyDockRateChipTextActive]}>
                      {option}x
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

      </Animated.View>
    </View>
  );

  const renderCreatorVideoCommentsPanel = () => {
    if (
      !isStandalonePlayer
      || !isCreatorVideoPlayback
      || isStandaloneFullscreen
      || standalonePlaybackGateActive
      || creatorVideoPaidContentLocked
    ) {
      return null;
    }

    const draftLength = creatorVideoCommentDraft.trim().length;
    const commentDisabled = creatorVideoCommentBusy || draftLength === 0 || draftLength > CREATOR_VIDEO_COMMENT_BODY_LIMIT;
    const replyTarget = creatorVideoComments.find((comment) => comment.id === creatorVideoCommentReplyTargetId) ?? null;
    const topLevelComments = creatorVideoComments.filter((comment) => !comment.parentCommentId);
    const repliesByParentId = creatorVideoComments.reduce((map, comment) => {
      if (!comment.parentCommentId) return map;
      const current = map.get(comment.parentCommentId) ?? [];
      current.push(comment);
      map.set(comment.parentCommentId, current);
      return map;
    }, new Map<string, CreatorVideoComment[]>());
    const renderCreatorVideoComment = (comment: CreatorVideoComment, nested = false) => {
      const isOwnComment = !!creatorVideoCommentUserId && comment.userId === creatorVideoCommentUserId;

      return (
        <View key={comment.id} style={[styles.creatorCommentCard, nested && styles.creatorCommentReplyCard]}>
          <View style={styles.creatorCommentAvatar}>
            {comment.authorAvatarUrl ? (
              <Image source={{ uri: comment.authorAvatarUrl }} style={styles.creatorCommentAvatarImage} />
            ) : (
              <Text style={styles.creatorCommentAvatarText}>{getInitials(comment.authorName)}</Text>
            )}
          </View>
          <View style={styles.creatorCommentBodyWrap}>
            <View style={styles.creatorCommentMetaRow}>
              <Text style={styles.creatorCommentAuthor} numberOfLines={1}>{comment.authorName}</Text>
              <Text style={styles.creatorCommentTime}>{formatCreatorCommentTime(comment.createdAt)}</Text>
            </View>
            <LinkedText text={comment.body} style={styles.creatorCommentBody} />
            {comment.attachments.length ? (
              <View style={styles.creatorCommentAttachmentStack}>
                {comment.attachments.map((attachment) => (
                  <SocialAttachmentCard key={attachment.id} attachment={attachment} compact />
                ))}
              </View>
            ) : null}
            {isOwnComment || isSignedIn ? (
              <View style={styles.creatorCommentActionRow}>
                {isSignedIn ? (
                  <TouchableOpacity
                    style={styles.creatorCommentAction}
                    activeOpacity={0.84}
                    accessibilityRole="button"
                    accessibilityLabel={`Reply to ${comment.authorName}`}
                    hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                    onPress={() => {
                      setCreatorVideoCommentReplyTargetId(comment.id);
                      setCreatorVideoCommentsError(null);
                    }}
                  >
                    <Text style={styles.creatorCommentActionText}>Reply</Text>
                  </TouchableOpacity>
                ) : null}
                {isOwnComment ? (
                  <TouchableOpacity
                    style={styles.creatorCommentAction}
                    activeOpacity={0.84}
                    disabled={creatorVideoCommentDeletingId === comment.id}
                    accessibilityRole="button"
                    accessibilityLabel={creatorVideoCommentDeletingId === comment.id ? "Deleting comment" : "Delete comment"}
                    accessibilityState={{ disabled: creatorVideoCommentDeletingId === comment.id, busy: creatorVideoCommentDeletingId === comment.id }}
                    hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                    onPress={() => onDeleteCreatorVideoComment(comment)}
                  >
                    <Text style={styles.creatorCommentActionText}>
                      {creatorVideoCommentDeletingId === comment.id ? "Deleting" : "Delete"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {isSignedIn && !isOwnComment ? (
                  <TouchableOpacity
                    style={styles.creatorCommentAction}
                    activeOpacity={0.84}
                    accessibilityRole="button"
                    accessibilityLabel={`Report comment by ${comment.authorName}`}
                    hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                    onPress={() => setCreatorVideoCommentReportTarget(comment)}
                  >
                    <Text style={styles.creatorCommentActionText}>Report</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      );
    };

    return (
      <View
        style={[
          styles.creatorCommentsPanel,
          creatorVideoCommentKeyboardOpen && styles.creatorCommentsPanelKeyboard,
        ]}
      >
        <View style={styles.creatorCommentsHeader}>
          <View style={styles.creatorCommentsHeaderCopy}>
            <Text style={styles.creatorCommentsKicker}>CREATOR VIDEO</Text>
            <Text style={styles.creatorCommentsTitle}>Discussion</Text>
          </View>
          {creatorVideoCommentsLoading ? <ActivityIndicator color={ACCENT} /> : null}
        </View>

        <ScrollView
          style={[
            styles.creatorCommentsList,
            creatorVideoCommentKeyboardOpen && styles.creatorCommentsListKeyboard,
          ]}
          contentContainerStyle={styles.creatorCommentsListContent}
          keyboardShouldPersistTaps="handled"
        >
          {creatorVideoCommentsError ? (
            <Text style={styles.creatorCommentsEmpty}>{creatorVideoCommentsError}</Text>
          ) : creatorVideoComments.length ? (
            topLevelComments.map((comment) => (
              <View key={comment.id} style={styles.creatorCommentThread}>
                {renderCreatorVideoComment(comment)}
                {(repliesByParentId.get(comment.id) ?? []).map((reply) => renderCreatorVideoComment(reply, true))}
              </View>
            ))
          ) : (
            <Text style={styles.creatorCommentsEmpty}>No comments yet.</Text>
          )}
        </ScrollView>

        {isSignedIn ? (
          <View style={styles.creatorCommentsComposer}>
            {replyTarget ? (
              <View style={styles.creatorCommentReplyNotice}>
                <Text style={styles.creatorCommentReplyNoticeText} numberOfLines={1}>
                  Replying to {replyTarget.authorName}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => setCreatorVideoCommentReplyTargetId(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel reply"
                  hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                >
                  <Text style={styles.creatorCommentReplyCancelText}>Cancel Reply</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {creatorVideoCommentAttachmentFile ? (
              <SocialAttachmentCard
                file={creatorVideoCommentAttachmentFile}
                compact
                onRemove={() => setCreatorVideoCommentAttachmentFile(null)}
              />
            ) : null}
            <View style={styles.creatorCommentsInputRow}>
              <TouchableOpacity
                style={[styles.creatorCommentsAttachBtn, creatorVideoCommentBusy && styles.secondaryBtnDisabled]}
                activeOpacity={0.84}
                disabled={creatorVideoCommentBusy}
                onPress={() => {
                  setCreatorVideoCommentAttachmentSheetVisible(true);
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: creatorVideoCommentBusy }}
                accessibilityLabel="Attach to creator-video comment"
                hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
              >
                <MaterialIcons name="attach-file" size={16} color="#E6ECFA" />
              </TouchableOpacity>
              <TextInput
                value={creatorVideoCommentDraft}
                onChangeText={(value) => {
                  setCreatorVideoCommentDraft(value);
                  if (creatorVideoCommentsError) setCreatorVideoCommentsError(null);
                }}
                onFocus={() => {
                  setControlsVisible(true);
                  resetAutoHideTimer();
                }}
                onSubmitEditing={() => {
                  void onSubmitCreatorVideoComment();
                }}
                style={styles.creatorCommentsInput}
                placeholder={replyTarget ? "Add a reply" : "Add a comment"}
                placeholderTextColor="rgba(212,216,226,0.68)"
                editable={!creatorVideoCommentBusy}
                maxLength={CREATOR_VIDEO_COMMENT_BODY_LIMIT}
                returnKeyType="send"
                accessibilityLabel={replyTarget ? "Creator video reply input" : "Creator video comment input"}
              />
              <TouchableOpacity
                style={[styles.creatorCommentsSendBtn, commentDisabled && styles.secondaryBtnDisabled]}
                activeOpacity={0.85}
                disabled={commentDisabled}
                accessibilityRole="button"
                accessibilityLabel={creatorVideoCommentBusy ? "Posting comment" : replyTarget ? "Post reply" : "Post comment"}
                accessibilityState={{ disabled: commentDisabled, busy: creatorVideoCommentBusy }}
                hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                onPress={() => {
                  void onSubmitCreatorVideoComment();
                }}
              >
                <Text style={styles.creatorCommentsSendText}>
                  {creatorVideoCommentBusy ? "..." : replyTarget ? "Reply" : "Post"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.creatorCommentsSigninText}>Sign in to comment.</Text>
        )}
      </View>
    );
  };

  const renderPartyCommentsContent = () => (
    <>
      {sharedPartyCommentsKeyboardActive ? null : (
        <>
          <Text style={styles.partyCommentsDrawerTitle}>{roomCommentsTitle}</Text>
          <ScrollView
            style={styles.partyCommentsList}
            contentContainerStyle={styles.partyCommentsListContent}
            keyboardShouldPersistTaps="handled"
          >
            {partyOverlayMessages.length > 0 ? (
              partyOverlayMessages.map((msg) => (
                <Text key={msg.id} style={styles.partyCommentsLine}>
                  <Text style={styles.partyCommentsAuthor}>{msg.author}: </Text>
                  {msg.body}
                </Text>
              ))
            ) : (
              <Text style={styles.partyCommentsLine}>{roomCommentsEmptyText}</Text>
            )}
          </ScrollView>
        </>
      )}
      {inWatchParty ? (
        <View style={styles.partyCommentsInputRow}>
          <TextInput
            value={partyCommentDraft}
            onChangeText={(value) => {
              setPartyCommentDraft(value);
              resetAutoHideTimer();
            }}
            onFocus={() => {
              if (isSharedPartyPlayback) setWatchPartyCommentKeyboardOpen(true);
              setControlsVisible(true);
              resetAutoHideTimer();
            }}
            onSubmitEditing={() => {
              void onSendPartyComment();
            }}
            style={styles.partyCommentsInput}
            placeholder="Say something"
            placeholderTextColor="rgba(212,216,226,0.7)"
            editable={!partyCommentSending}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={styles.partyCommentsSendBtn}
            onPress={() => {
              void onSendPartyComment();
            }}
            disabled={partyCommentSending || !partyCommentDraft.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.partyCommentsSendBtnText}>{partyCommentSending ? "..." : "Send"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );

  const renderLiveFilterSheet = (sheetStyle?: object) => (
    <View style={[styles.liveFilterSheet, sheetStyle]}>
      <View style={styles.liveFilterSheetHeader}>
        <View style={styles.liveFilterSheetHeaderCopy}>
          <Text style={styles.liveFilterSheetKicker}>CHI’LLYFECTS PREVIEW</Text>
          <Text style={styles.liveFilterSheetTitle}>{activeLiveFaceFilter.label}</Text>
        </View>
        <TouchableOpacity
          style={styles.liveFilterSheetDismissBtn}
          onPress={() => setLiveFilterSheetOpen(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.liveFilterSheetDismissText}>Done</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.liveFilterSheetBody}>
        Chi’llyfects here are preview-only looks. Live camera effects are still being prepared.
      </Text>
      <Text style={styles.liveFilterSheetHelper}>{activeLiveFaceFilter.subtitle}</Text>
      <View style={styles.liveFilterOptionRow}>
        {LIVE_FACE_FILTER_OPTIONS.map((option) => {
          const active = liveFaceFilter === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.liveFilterOptionChip, active && styles.liveFilterOptionChipActive]}
              onPress={() => setLiveFaceFilter(option.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.liveFilterOptionText, active && styles.liveFilterOptionTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStandaloneLiveModeOverlayCluster = () => {
    if (shouldUseLiveModeLowerDock) return null;

    return (
      <>
        {shouldRenderInlineLivePresenceToast ? (
          <View pointerEvents="none" style={styles.livePresenceEventToast}>
            <Text style={styles.livePresenceEventText} numberOfLines={1}>
              {livePresenceEvent}
            </Text>
          </View>
        ) : null}

        {!inWatchParty ? (
          <View style={styles.liveModeActionRow}>
            <TouchableOpacity
              style={styles.partyOverlayChip}
              onPress={() => {
                setLiveFilterSheetOpen(false);
                setPartyCommentsOpen((value) => !value);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.partyOverlayChipText}>🗨️ Room Comments</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.partyOverlayChip,
                (liveFilterSheetOpen || liveFaceFilter !== "none") && styles.watchPartyLiveFooterActiveBtn,
              ]}
              onPress={onToggleLiveFilters}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.partyOverlayChipText,
                  (liveFilterSheetOpen || liveFaceFilter !== "none") && styles.watchPartyLiveFooterActiveLabel,
                ]}
              >
                🎭 Chi’llyfects
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.partyOverlayChip}
              onPress={() => {
                setLiveFilterSheetOpen(false);
                setPartyCommentsOpen(false);
                const emoji = PARTY_LOCAL_REACTION_SET[Math.floor(Math.random() * PARTY_LOCAL_REACTION_SET.length)];
                triggerLocalPartyReaction(emoji);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.partyOverlayChipText}>🔥 React</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {partyLocalReactions.map((entry) => (
          <Animated.View
            key={entry.id}
            pointerEvents="none"
            style={[
              styles.partyLocalReactionBubble,
              {
                right: entry.rightOffset,
                opacity: partyLocalReactionOpacityMapRef.current[entry.id] ?? 1,
                transform: [
                  { translateY: partyLocalReactionTranslateMapRef.current[entry.id] ?? 0 },
                  { translateX: partyLocalReactionTranslateXMapRef.current[entry.id] ?? 0 },
                  { scale: partyLocalReactionScaleMapRef.current[entry.id] ?? 1 },
                ],
              },
            ]}
          >
            <Text style={styles.partyLocalReactionText}>{entry.emoji}</Text>
          </Animated.View>
        ))}

        {partyCommentsOpen && !inWatchParty ? (
          <View style={styles.partyCommentsDrawer}>
            {renderPartyCommentsContent()}
          </View>
        ) : null}

        {liveFilterSheetOpen && !inWatchParty ? renderLiveFilterSheet(styles.liveFilterSheetStandalone) : null}
      </>
    );
  };

  const renderWatchPartyLiveModeOverlayCluster = () => {
    if (!shouldUseLiveModeLowerDock) return null;

    return (
      <LiveLowerDock
        rootStyle={[styles.watchPartyLiveBottomDock, hasActiveRailParticipants && styles.watchPartyLiveBottomDockActive]}
        presenceToast={partyCommentsOpen || liveFilterSheetOpen || shouldRenderWatchPartyLivePresenceToast ? (
          <View style={styles.watchPartyLivePresenceStack}>
            {liveFilterSheetOpen ? renderLiveFilterSheet(styles.liveFilterSheetWatchParty) : null}
            {partyCommentsOpen ? (
              <View
                style={[
                  styles.partyCommentsDrawer,
                  styles.partyCommentsDrawerWatchPartyTitle,
                  styles.watchPartyLiveCommentsDrawer,
                ]}
              >
                {renderPartyCommentsContent()}
              </View>
            ) : null}

            {shouldRenderWatchPartyLivePresenceToast ? (
              <View pointerEvents="none" style={[styles.livePresenceEventToast, styles.watchPartyLivePresenceToast]}>
                <Text style={styles.livePresenceEventText} numberOfLines={1}>
                  {livePresenceEvent}
                </Text>
              </View>
            ) : null}
          </View>
        ) : undefined}
        participantStrip={(
          <View style={styles.watchPartyLiveStripWrap}>
            {renderParticipantPanel(true, true)}
          </View>
        )}
        leftAction={{
          id: "comments",
          icon: "🗨️",
          label: "Room Comments",
          activeOpacity: 0.85,
          onPress: () => {
            setLiveFilterSheetOpen(false);
            setReactionPickerOpen(false);
            setPartyCommentsOpen((value) => !value);
          },
          buttonStyle: partyCommentsOpen ? styles.watchPartyLiveFooterActiveBtn : undefined,
          labelStyle: partyCommentsOpen ? styles.watchPartyLiveFooterActiveLabel : undefined,
        }}
        trailingActions={[
          {
            id: "filters",
            icon: "🎭",
            label: "Chi’llyfects",
            activeOpacity: 0.85,
            onPress: onToggleLiveFilters,
            buttonStyle: (liveFilterSheetOpen || liveFaceFilter !== "none") ? styles.watchPartyLiveFooterActiveBtn : undefined,
            labelStyle: (liveFilterSheetOpen || liveFaceFilter !== "none") ? styles.watchPartyLiveFooterActiveLabel : undefined,
          },
          {
            id: "react",
            icon: "✨",
            label: "React",
            activeOpacity: 0.85,
            onPress: () => {
              setLiveFilterSheetOpen(false);
              setPartyCommentsOpen(false);
              setReactionPickerOpen((value) => !value);
            },
            buttonStyle: reactionPickerOpen ? styles.watchPartyLiveFooterActiveBtn : undefined,
            labelStyle: reactionPickerOpen ? styles.watchPartyLiveFooterActiveLabel : undefined,
          },
        ]}
        footerStyles={mapFooterControlRowStyles({
          row: styles.footerControls,
          actionButton: styles.footerIconBtn,
          actionIconText: styles.footerIconBtnText,
          actionLabelText: styles.footerIconBtnLabel,
          quickRow: styles.footerReactionQuickRow,
          quickChip: styles.footerReactionQuickBtn,
          quickChipText: styles.footerReactionQuickText,
        }, buildFooterControlTokens({ size: "compact", surface: "glass" }))}
        reactionPicker={{
          visible: reactionPickerOpen,
          onClose: () => setReactionPickerOpen(false),
          onSelectEmoji: onSelectReactionFromPicker,
          recentEmojis: recentReactionEmojis,
          title: "React",
          subtitle: "Browse and tap to send",
          styles: {
            root: styles.reactionPickerRoot,
            backdrop: styles.reactionPickerBackdrop,
            sheet: styles.reactionPickerSheet,
            header: styles.reactionPickerHeader,
            title: styles.reactionPickerTitle,
            subtitle: styles.reactionPickerSubtitle,
            closeBtn: styles.reactionPickerCloseBtn,
            closeText: styles.reactionPickerCloseText,
            body: styles.reactionPickerBody,
            section: styles.reactionPickerSection,
            sectionTitle: styles.reactionPickerSectionTitle,
            grid: styles.reactionPickerGrid,
            emojiBtn: styles.reactionPickerEmojiBtn,
            emojiText: styles.reactionPickerEmojiText,
          },
        }}
      />
    );
  };

  useEffect(() => {
    const sourceLabel = source
      ? typeof source === "number"
        ? "bundle:require"
        : typeof source === "object" && source && "uri" in source
          ? "remote"
          : "object:unknown"
      : "none";
    debugLog("player", "video source resolved", { source: sourceLabel });
  }, [source]);

  if (titleLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.text}>Loading title…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (inWatchParty && watchPartyEntryLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.playerAccessCard}>
            <Text style={styles.playerAccessKicker}>WATCH-PARTY LIVE</Text>
            <Text style={styles.playerAccessTitle}>Checking watch-party access</Text>
            <Text style={styles.playerAccessBody}>
              Chi'llywood is confirming room membership and access truth before Watch-Party Live opens.
            </Text>
            <View style={styles.playerAccessActions}>
              <TouchableOpacity
                style={[styles.playerAccessPrimaryBtn, styles.secondaryBtnDisabled]}
                disabled
                activeOpacity={0.85}
              >
                <Text style={styles.playerAccessPrimaryText}>Checking...</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (inWatchParty && (watchPartyEntryMissing || !!watchPartyEntryError || !!watchPartyPremiumGate || (watchPartyAccess && !watchPartyAccess.isAllowed))) {
    const blockedAccess = watchPartyAccess && !watchPartyAccess.isAllowed ? watchPartyAccess : null;
    const blockedPremiumAccess = watchPartyPremiumGate;
    const runtimeBlockedCopy = isRuntimeControlBlockedAccess(blockedPremiumAccess)
      ? getRuntimeControlBlockedCopy(blockedPremiumAccess)
      : null;
    const title = watchPartyEntryMissing
      ? "Watch party unavailable"
      : blockedPremiumAccess
        ? runtimeBlockedCopy?.title ?? "Premium access required"
      : blockedAccess
        ? getWatchPartyAccessTitle(blockedAccess)
      : "Watch-party access unavailable";
    const body = watchPartyEntryMissing
      ? "This watch party could not be found anymore. Open the canonical Party Room route if you want to re-check the room."
      : blockedPremiumAccess
        ? runtimeBlockedCopy?.message ?? "Premium access is required before Watch-Party Live can open from this direct route."
      : blockedAccess
        ? getWatchPartyAccessBody(blockedAccess)
        : (watchPartyEntryError ?? "Unable to confirm watch-party access right now.");
    const premiumGatePresentation = blockedPremiumAccess
      ? getMonetizationAccessSheetPresentation({
          gate: blockedPremiumAccess,
          appDisplayName: branding.appDisplayName,
          premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
          premiumUpsellBody: monetizationConfig.premiumUpsellBody,
        })
      : null;

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.playerAccessCard}>
            <Text style={styles.playerAccessKicker}>WATCH-PARTY LIVE</Text>
            <Text style={styles.playerAccessTitle}>{title}</Text>
            <Text style={styles.playerAccessBody}>{body}</Text>
            <View style={styles.playerAccessActions}>
              <TouchableOpacity
                style={styles.playerAccessSecondaryBtn}
                onPress={onReturnToPartyRoom}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Text style={styles.playerAccessSecondaryText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.playerAccessPrimaryBtn}
                onPress={() => {
                  if (blockedPremiumAccess && !runtimeBlockedCopy) {
                    setWatchPartyPremiumSheetVisible(true);
                    return;
                  }
                  if (runtimeBlockedCopy) {
                    onReturnToPartyRoom();
                    return;
                  }
                  if (blockedAccess || watchPartyEntryMissing) {
                    onReturnToPartyRoom();
                    return;
                  }

                  setWatchPartyEntryRetryToken((current) => current + 1);
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={
                  blockedPremiumAccess
                    ? runtimeBlockedCopy ? "Go back" : "Review Premium access"
                    : blockedAccess || watchPartyEntryMissing ? "Open Party Room" : "Retry access"
                }
              >
                <Text style={styles.playerAccessPrimaryText}>
                  {blockedPremiumAccess
                    ? runtimeBlockedCopy ? "Back" : "Review Premium"
                    : blockedAccess || watchPartyEntryMissing ? "Open Party Room" : "Retry access"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {blockedPremiumAccess && !runtimeBlockedCopy ? (
          <AccessSheet
            visible={watchPartyPremiumSheetVisible}
            reason="premium_required"
            gate={blockedPremiumAccess}
            appDisplayName={branding.appDisplayName}
            premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
            premiumUpsellBody={monetizationConfig.premiumUpsellBody}
            kickerOverride={premiumGatePresentation?.kicker}
            titleOverride={premiumGatePresentation?.title}
            bodyOverride={premiumGatePresentation?.body}
            actionLabelOverride={premiumGatePresentation?.actionLabel}
            onPurchaseResult={(result) => {
              if (!result.ok) {
                return {
                  message: result.message,
                  tone: "error" as const,
                };
              }
              return refreshWatchPartyPremiumAfterSheetAction("purchase");
            }}
            onRestoreResult={(result) => {
              if (!result.ok) {
                return {
                  message: result.message,
                  tone: "error" as const,
                };
              }
              return refreshWatchPartyPremiumAfterSheetAction("restore");
            }}
            onClose={() => setWatchPartyPremiumSheetVisible(false)}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  if (isPlatformTitleUnavailable) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.playerAccessCard}>
            <Text style={styles.playerAccessKicker}>PLAYER</Text>
            <Text style={styles.playerAccessTitle}>Title unavailable</Text>
            <Text style={styles.playerAccessBody}>
              Chi'llywood could not find a playable platform title for this route.
            </Text>
            <View style={styles.playerAccessActions}>
              <TouchableOpacity style={styles.playerAccessSecondaryBtn} onPress={() => router.back()} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back">
                <Text style={styles.playerAccessSecondaryText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.playerAccessPrimaryBtn} onPress={() => router.replace("/(tabs)")} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Browse titles">
                <Text style={styles.playerAccessPrimaryText}>Browse Titles</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (isSpectatorPlaybackUnavailable) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.playerAccessCard}>
            <Text style={styles.playerAccessKicker}>SPECTATOR SOURCE</Text>
            <Text style={styles.playerAccessTitle}>
              {spectatorSourceEnded ? "Source live has ended" : "Source playback unavailable"}
            </Text>
            <Text style={styles.playerAccessBody}>
              {spectatorSourceEnded
                ? "This child room can keep its people and comments, but the original source is no longer live."
                : "This child room could not resolve public-safe watch-only playback for the source."}
            </Text>
            <View style={styles.playerAccessActions}>
              <TouchableOpacity style={styles.playerAccessSecondaryBtn} onPress={() => router.back()} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Go back">
                <Text style={styles.playerAccessSecondaryText}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.playerKeyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        enabled={(isStandalonePlayer && isCreatorVideoPlayback) || isSharedPartyPlayback}
      >
      <View style={styles.playerFrameworkRoot}>
        {isStandaloneFullscreen ? (
          <View style={styles.playerFrameworkFullscreenBackground} />
        ) : isSharedPartyPlayback ? (
          <>
            <ImageBackground source={WATCH_PARTY_BRANDED_BACKGROUND} style={styles.playerFrameworkBackground} resizeMode="cover" />
            {frameworkBackgroundSource ? (
              <ImageBackground source={frameworkBackgroundSource} style={styles.watchPartyFrameworkPosterWash} resizeMode="cover" />
            ) : null}
          </>
        ) : frameworkBackgroundSource ? (
          <ImageBackground source={frameworkBackgroundSource} style={styles.playerFrameworkBackground} resizeMode="cover" />
        ) : (
          <View style={styles.playerFrameworkBackgroundFallback} />
        )}
        {!isStandaloneFullscreen ? (
          <>
            <View style={[styles.playerFrameworkOverlay, isSharedPartyPlayback && styles.playerFrameworkOverlayWatchParty]} pointerEvents="none" />
            <View style={[styles.playerFrameworkDepthTop, isSharedPartyPlayback && styles.playerFrameworkDepthTopWatchParty]} pointerEvents="none" />
            <View style={[styles.playerFrameworkDepthBottom, isSharedPartyPlayback && styles.playerFrameworkDepthBottomWatchParty]} pointerEvents="none" />
          </>
        ) : null}

        <View style={[styles.container, isSharedPartyPlayback && styles.containerWatchParty]}>
        {!inWatchParty && !isLiveMode && isStandaloneFullscreen ? null : (
        <View style={[styles.topSection, styles.topSectionFramework, isSharedPartyPlayback && styles.topSectionWatchParty]}>
          <Text style={[styles.kicker, isSharedPartyPlayback && styles.kickerWatchParty]}>
            {playerSurfacePresentation.kicker}
          </Text>
          <Text style={[styles.header, isSharedPartyPlayback && styles.headerWatchParty]} numberOfLines={1}>{displayItem?.title ?? "Now Playing"}</Text>
          <View style={[styles.playerSurfacePill, isSharedPartyPlayback && styles.playerSurfacePillWatchParty]}>
            <Text style={styles.playerSurfacePillText}>{playerSurfacePresentation.label}</Text>
          </View>
          {inWatchParty && partySyncRole && !isSharedPartyPlayback ? (
            <View style={[styles.partySyncPill, styles.partySyncPillFramework]}>
              <Text style={styles.partySyncPillText}>
                {partySyncRole === "host" ? "Host" : "You"}
                {compactPartySyncStatus ? ` · ${compactPartySyncStatus}` : ""}
              </Text>
            </View>
          ) : null}
        </View>
        )}

        {showProtectedSessionNote ? (
          <ProtectedSessionNote
            {...getProtectedSessionCopy(isLiveModeFlag ? "live-player" : "watch-player")}
          />
        ) : null}

        {source || isLiveMode || isCreatorVideoPlayback ? (
          <>
          <View
            style={[
              styles.videoWrap,
              styles.videoWrapFramework,
              inWatchParty && styles.videoWrapWatchPartyTitle,
              !inWatchParty && !isLiveMode && isStandaloneFullscreen && styles.videoWrapStandaloneFullscreen,
              !inWatchParty && !isLiveMode && isCreatorVideoPlayback && creatorVideoCommentKeyboardOpen && styles.videoWrapCreatorDiscussionKeyboard,
              isLiveMode && styles.liveRoomWrap,
            ]}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              videoWidthRef.current = width;
              videoLayoutRef.current = { width, height };
              if (zoomScaleValueRef.current > 1.01) {
                const clampedTranslation = clampZoomTranslation(
                  {
                    x: zoomTranslateXValueRef.current,
                    y: zoomTranslateYValueRef.current,
                  },
                  zoomScaleValueRef.current,
                  videoLayoutRef.current,
                );
                zoomTranslateX.setValue(clampedTranslation.x);
                zoomTranslateY.setValue(clampedTranslation.y);
              }
            }}
          >
            {shouldUseLiveSpeakerStage ? (
              <>
            {livePrimarySpeakers.length > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.liveSpeakingBackdrop,
                  {
                    opacity: roomEnergyAuraOpacity,
                    transform: [{ scale: roomEnergyAuraScale }],
                  },
                ]}
              />
            ) : null}
            {entryBoostActive ? <Animated.View pointerEvents="none" style={[styles.entryEnergyPulse, { opacity: entryPulseOpacity }]} /> : null}

            <Text style={styles.liveSpeakingLabel}>{liveSpeakingLabel}</Text>

            {livePrimarySpeakers.length > 0 ? (
              <View style={[
                styles.liveSpeakerStage,
                livePrimarySpeakers.length === 1
                  ? styles.liveSpeakerStageSolo
                  : livePrimarySpeakers.length > 2
                    ? styles.liveSpeakerStageMulti
                    : styles.liveSpeakerStageDual,
              ]}>
                {livePrimarySpeakers.map((participant) => {
                  const isSpeaking = participant.isSpeaking && participant.canSpeak;
                  const isActive = primaryActiveParticipantIds.includes(participant.id);
                  const isRequesting = currentWatchPartyHostAuthority.isHost && participant.isRequestingToSpeak && !participant.canSpeak;
                  const participantReactions = partyParticipantReactions
                    .filter((entry) => entry.participantId === participant.id)
                    .slice(-2);
                  const voiceLevel = participantVoiceLevelMapRef.current[participant.id] ?? new Animated.Value(0);
                  const focusScale = participantFocusScaleMapRef.current[participant.id] ?? 1;
                  const focusOpacity = participantFocusOpacityMapRef.current[participant.id] ?? 1;
                  const pressScale = participantPressScaleMapRef.current[participant.id] ?? 1;
                  const joinScale = participantJoinScaleMapRef.current[participant.id] ?? 1;
                  const isOnlineActive = isSpeaking || isActive;
                  const initials = participant.name
                    .split(" ")
                    .map((part: string) => part[0] ?? "")
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <Animated.View
                      key={`live-focused-${participant.id}`}
                      style={{ opacity: focusOpacity, transform: [{ scale: focusScale }, { scale: joinScale }, { scale: pressScale }] }}
                    >
                      <TouchableOpacity
                        style={[
                          styles.liveSpeakerCard,
                          livePrimarySpeakers.length === 1
                            ? styles.liveSpeakerCardSolo
                            : livePrimarySpeakers.length > 2
                              ? styles.liveSpeakerCardMulti
                              : styles.liveSpeakerCardDual,
                        ]}
                        onPressIn={() => {
                          const press = participantPressScaleMapRef.current[participant.id];
                          if (!press) return;
                          Animated.timing(press, {
                            toValue: 0.95,
                            duration: 90,
                            easing: Easing.out(Easing.quad),
                            useNativeDriver: true,
                          }).start();
                        }}
                        onPressOut={() => {
                          const press = participantPressScaleMapRef.current[participant.id];
                          if (!press) return;
                          Animated.timing(press, {
                            toValue: 1,
                            duration: 120,
                            easing: Easing.out(Easing.quad),
                            useNativeDriver: true,
                          }).start();
                        }}
                        onPress={() => {
                          onFocusPlayerParticipant(participant);
                        }}
                        activeOpacity={0.9}
                      >
                        <View style={styles.liveSpeakerAvatarWrap}>
                        <View style={[styles.participantAvatar, styles.participantAvatarLive, styles.liveSpeakerAvatar, participant.muted && styles.participantAvatarMuted]}>
                          {participant.avatarUrl ? (
                            <Image source={{ uri: participant.avatarUrl }} style={styles.participantAvatarImage} />
                          ) : (
                            <Text style={[styles.participantInitials, styles.participantInitialsLive, styles.liveSpeakerInitials]}>{initials}</Text>
                          )}
                        </View>
                        {isRequesting ? <View pointerEvents="none" style={[styles.participantRequestRing, styles.liveSpeakerRequestRing]} /> : null}
                        <View style={[styles.participantPresenceDot, styles.liveSpeakerPresenceDot, isOnlineActive ? styles.participantPresenceDotActive : styles.participantPresenceDotIdle]} />
                        {participant.muted ? (
                          <View style={[styles.participantMutedOverlay, styles.liveSpeakerMutedOverlay]}>
                            <Text style={styles.participantMutedOverlayText}>🔇</Text>
                          </View>
                        ) : null}

                        {participantReactions.map((reaction, reactionIndex) => (
                          <Animated.View
                            key={reaction.id}
                            pointerEvents="none"
                            style={[
                              styles.participantLinkedReaction,
                              styles.liveSpeakerLinkedReaction,
                              {
                                right: reactionIndex * 18,
                                opacity: participantReactionOpacityMapRef.current[reaction.id] ?? 1,
                                transform: [
                                  { translateY: participantReactionTranslateYMapRef.current[reaction.id] ?? 0 },
                                  { scale: participantReactionScaleMapRef.current[reaction.id] ?? 1 },
                                ],
                              },
                            ]}
                          >
                            <Text style={styles.participantLinkedReactionText}>
                              {reaction.emoji}
                            </Text>
                          </Animated.View>
                        ))}
                        </View>
                        <Text style={[styles.participantName, styles.participantNameLive, styles.liveSpeakerName]} numberOfLines={1}>
                          {participant.name}
                        </Text>
                        {isSpeaking ? (
                          <View style={styles.liveSpeakerVoiceTrack}>
                            <Animated.View
                              style={[
                                styles.liveSpeakerVoiceFill,
                                {
                                  width: voiceLevel.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [16, 74 + roomEnergy * 12],
                                  }),
                                  opacity: voiceLevel.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.45 + roomEnergy * 0.14, 1],
                                  }),
                                },
                              ]}
                            />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>
            ) : null}

            {shouldRenderInlineLiveParticipantPanel ? (
              <View style={styles.liveModeParticipantsWrap}>{renderParticipantPanel(true)}</View>
            ) : null}

            {renderStandaloneLiveModeOverlayCluster()}
              </>
            ) : (
              <>
            {inWatchParty ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.roomEnergyAura,
                  {
                    opacity: roomEnergyAuraOpacity,
                    transform: [{ scale: roomEnergyAuraScale }],
                  },
                ]}
              />
            ) : null}
            {inWatchParty && entryBoostActive ? (
              <Animated.View pointerEvents="none" style={[styles.entryEnergyPulse, { opacity: entryPulseOpacity }]} />
            ) : null}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.videoAnimatedWrap,
                {
                  transform: [
                    { translateX: zoomTranslateX },
                    { translateY: zoomTranslateY },
                    { scale: zoomScale },
                  ],
                },
              ]}
            >
              {playbackSource && !standalonePlaybackSourceFailed ? (
                shouldUseSharedAndroidVideoSurface ? (
                  <SharedAndroidVideoSurface
                    ref={videoRef}
                    source={playbackSource}
                    style={styles.video}
                    contentFit={!inWatchParty && !isLiveMode && !isStandaloneFullscreen ? "cover" : "contain"}
                    shouldPlay={isLiveMode ? true : isPlaying}
                    playbackRate={playbackRate}
                    volume={playerVideoVolume}
                    onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                    onLoad={onVideoLoad}
                  />
                ) : (
                  <Video
                    ref={(node) => {
                      videoRef.current = node as unknown as PlayerController | null;
                    }}
                    source={playbackSource}
                    style={styles.video}
                    pointerEvents="none"
                    resizeMode={!inWatchParty && !isLiveMode && !isStandaloneFullscreen ? ResizeMode.COVER : ResizeMode.CONTAIN}
                    shouldPlay={isLiveMode ? true : isPlaying}
                    isLooping={false}
                    useNativeControls={false}
                    volume={playerVideoVolume}
                    onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                    onLoad={onVideoLoad}
                    onError={onVideoError}
                  />
                )
              ) : (
                <View style={styles.videoLoadingFallback}>
                  {isCreatorVideoPlaybackUnavailable || isPlatformVideoUnavailable || isSpectatorPlaybackUnavailable ? null : <ActivityIndicator color={ACCENT} />}
                  <Text style={styles.videoLoadingText}>
                    {isCreatorVideoPlaybackUnavailable
                      ? creatorVideoPaidContentLocked
                        ? "Paid creator content"
                        : "Creator video unavailable"
                      : isSpectatorPlaybackUnavailable
                        ? spectatorSourceEnded
                          ? "Source live has ended"
                          : "Source playback unavailable"
                      : isPlatformVideoUnavailable
                        ? "Video unavailable"
                        : "Preparing video..."}
                  </Text>
                  {isCreatorVideoPlaybackUnavailable ? (
                    <Text style={styles.videoLoadingSubtext}>
                      {creatorVideoPaidContentLocked
                        ? `Checkout is not active yet${creatorVideoPaidContentPriceLabel ? ` for ${creatorVideoPaidContentPriceLabel}` : ""}. Buying creator-paid content does not require Premium. Payment setup still needs to be ready.`
                        : playbackLoadError
                        ? "This upload could not be loaded. Re-upload or repair the video file."
                        : "This upload does not have a playable source yet."}
                    </Text>
                  ) : null}
                  {isSpectatorPlaybackUnavailable ? (
                    <Text style={styles.videoLoadingSubtext}>
                      {spectatorSourceEnded
                        ? "The source is no longer live. Stay in the room or go back to choose another source."
                        : "Public-safe watch-only playback is not available for this source right now."}
                    </Text>
                  ) : null}
                  {isPlatformVideoUnavailable ? (
                    <Text style={styles.videoLoadingSubtext}>
                      {playbackLoadError
                        ? "This title's video source could not be loaded right now."
                        : "This title does not have a playable source yet."}
                    </Text>
                  ) : null}
                </View>
              )}
            </Animated.View>

            {shouldUseSharedAndroidVideoSurface ? (
              <View
                collapsable={false}
                pointerEvents="auto"
                style={styles.sharedAndroidVideoTapTarget}
                onStartShouldSetResponder={() => true}
                onResponderRelease={() => {
                  void handleSharedPlaybackTap();
                }}
                accessibilityRole="button"
                accessibilityLabel="Toggle shared playback"
              />
            ) : null}

            {showStandaloneAccessOverlay && standaloneAccessPresentation ? (
              <View style={styles.playerAccessOverlay}>
                <View style={styles.playerAccessCard}>
                  <Text style={styles.playerAccessKicker}>STANDALONE PLAYER</Text>
                  <Text style={styles.playerAccessTitle}>{standaloneAccessPresentation.title}</Text>
                  <Text style={styles.playerAccessBody}>{standaloneAccessPresentation.body}</Text>
                  <View style={styles.playerAccessActions}>
                    <TouchableOpacity style={styles.playerAccessSecondaryBtn} onPress={() => router.back()} activeOpacity={0.85}>
                      <Text style={styles.playerAccessSecondaryText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.playerAccessPrimaryBtn,
                        standaloneAccessPresentation.primaryDisabled && styles.secondaryBtnDisabled,
                      ]}
                      onPress={() => {
                        if (standalonePlaybackBlocked && standaloneAccessSheetReason) {
                          trackEvent("monetization_gate_shown", {
                            surface: "standalone-player",
                            reason: standaloneAccessSheetReason,
                            titleId: String(displayItem?.id ?? cleanId).trim(),
                          });
                          setStandaloneAccessSheetVisible(true);
                          return;
                        }
                        retryStandaloneAccessCheck();
                      }}
                      disabled={standaloneAccessPresentation.primaryDisabled}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.playerAccessPrimaryText}>{standaloneAccessPresentation.primaryLabel}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : null}

            {standaloneAccessSheetReason && standaloneAccess ? (
              <AccessSheet
                visible={standaloneAccessSheetVisible}
                reason={standaloneAccessSheetReason}
                gate={standaloneAccess}
                appDisplayName={branding.appDisplayName}
                premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
                premiumUpsellBody={monetizationConfig.premiumUpsellBody}
                kickerOverride={standaloneAccessSheetPresentation?.kicker}
                titleOverride={standaloneAccessSheetPresentation?.title}
                bodyOverride={standaloneAccessSheetPresentation?.body}
                actionLabelOverride={standaloneAccessSheetPresentation?.actionLabel}
                onPurchaseResult={(result) => {
                  if (!result.ok) {
                    setAccessError(result.message);
                    return;
                  }
                  return refreshStandaloneAccessAfterSheetAction("purchase");
                }}
                onRestoreResult={(result) => {
                  if (!result.ok) {
                    setAccessError(result.message);
                    return;
                  }
                  return refreshStandaloneAccessAfterSheetAction("restore");
                }}
                onClose={() => setStandaloneAccessSheetVisible(false)}
              />
            ) : null}

            {!inWatchParty && watchPartyPremiumGate?.reason === "premium_required" ? (
              <AccessSheet
                visible={watchPartyPremiumSheetVisible}
                reason="premium_required"
                gate={watchPartyPremiumGate}
                appDisplayName={branding.appDisplayName}
                premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
                premiumUpsellBody={monetizationConfig.premiumUpsellBody}
                kickerOverride={watchPartyPremiumSheetPresentation?.kicker}
                titleOverride={WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY.title}
                bodyOverride={WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY.message}
                actionLabelOverride={watchPartyPremiumSheetPresentation?.actionLabel}
                onPurchaseResult={(result) => {
                  if (!result.ok) {
                    return {
                      message: result.message,
                      tone: "error" as const,
                    };
                  }
                  return refreshWatchPartyPremiumAfterSheetAction("purchase");
                }}
                onRestoreResult={(result) => {
                  if (!result.ok) {
                    return {
                      message: result.message,
                      tone: "error" as const,
                    };
                  }
                  return refreshWatchPartyPremiumAfterSheetAction("restore");
                }}
                onClose={() => setWatchPartyPremiumSheetVisible(false)}
              />
            ) : null}

            <ReportSheet
              visible={titleReportVisible}
              title="Report title"
              description="Send this title to Chi'llywood moderation review."
              busy={titleReportBusy}
              onSubmit={onSubmitTitleReport}
              onClose={() => {
                if (!titleReportBusy) setTitleReportVisible(false);
              }}
            />

            <ReportSheet
              visible={creatorVideoReportVisible}
              title="Report creator video"
              description="Send this uploaded video to Chi'llywood moderation review."
              busy={creatorVideoReportBusy}
              onSubmit={onSubmitCreatorVideoReport}
              onClose={() => {
                if (!creatorVideoReportBusy) setCreatorVideoReportVisible(false);
              }}
            />

            <ReportSheet
              visible={!!creatorVideoCommentReportTarget}
              title="Report creator-video comment"
              description="Send this text comment to Chi'llywood moderation review."
              busy={creatorVideoCommentReportBusy}
              onSubmit={onSubmitCreatorVideoCommentReport}
              onClose={() => {
                if (!creatorVideoCommentReportBusy) setCreatorVideoCommentReportTarget(null);
              }}
            />

            <SocialAttachmentActionSheet
              visible={creatorVideoCommentAttachmentSheetVisible}
              kicker="COMMENT ATTACHMENT"
              title="Add to comment"
              body="Photos and files attach to this creator-video comment. Creator uploads stay in Platform Studio."
              onSelect={onSelectCreatorVideoCommentAttachment}
              onClose={() => setCreatorVideoCommentAttachmentSheetVisible(false)}
            />

            {seekFeedback ? (
              <Animated.View style={[styles.seekFeedback, { opacity: seekFeedbackOpacity }]}>
                <Text style={styles.seekFeedbackText}>{seekFeedback}</Text>
              </Animated.View>
            ) : null}

            {showUpNext && nextTitle ? (
              <View style={styles.upNextOverlay}>
                <Text style={styles.upNextLabel}>Up Next</Text>
                <Text style={styles.upNextTitle} numberOfLines={1}>{String(nextTitle.title ?? "Next Title")}</Text>
                <Text style={styles.upNextCountdown}>Playing in {upNextCountdown}s</Text>
                <View style={styles.upNextActions}>
                  <TouchableOpacity style={styles.upNextPrimaryBtn} onPress={navigateToNext} activeOpacity={0.9}>
                    <Text style={styles.upNextPrimaryBtnText}>Play Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.upNextSecondaryBtn} onPress={cancelUpNext} activeOpacity={0.85}>
                    <Text style={styles.upNextSecondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {!inWatchParty && !isLiveMode && !standalonePlaybackGateActive ? (
              <View
                collapsable={false}
                pointerEvents="auto"
                style={styles.standaloneVideoGestureTarget}
                {...panResponder.panHandlers}
              />
            ) : null}

              {inWatchParty ? (
                <>
                <View style={[styles.partyOverlayTopRow, styles.partyOverlayTopRowWatchParty]} pointerEvents="box-none">
                  <Animated.View style={[styles.partyPresencePill, styles.partyPresencePillWatchPartyTitle, { opacity: partyPresenceOpacity }]}>
                    <View style={styles.partyPresenceRow}>
                      <Text style={styles.partyPresenceIcon}>👥</Text>
                      <Text style={styles.partyPresenceCount}>{viewerCount}</Text>
                    </View>
                    {partyParticipantPreview.length > 0 ? (
                      <Text style={styles.partyPresenceHint} numberOfLines={1}>
                        {partyParticipantPreview.join(" · ")}
                      </Text>
                    ) : null}
                  </Animated.View>
                </View>

                {partyReactionBursts.length > 0 ? (
                  <View style={[styles.partyReactionBurstWrap, styles.partyReactionBurstWrapWatchPartyTitle]} pointerEvents="none">
                    {partyReactionBursts.map((entry) => (
                      <Animated.View
                        key={entry.id}
                        style={[
                          styles.partyReactionBurstBubble,
                          {
                            opacity: partyReactionOpacityMapRef.current[entry.id] ?? 1,
                            transform: [
                              { translateY: partyReactionTranslateMapRef.current[entry.id] ?? 0 },
                              { scale: partyReactionScaleMapRef.current[entry.id] ?? 1 },
                            ],
                          },
                        ]}
                      >
                        <Text style={styles.partyReactionBurstText}>{entry.emoji}</Text>
                      </Animated.View>
                    ))}
                  </View>
                ) : null}

                {partyLocalReactions.map((entry) => (
                  <Animated.View
                    key={entry.id}
                    pointerEvents="none"
                    style={[
                      styles.partyLocalReactionBubble,
                      styles.partyLocalReactionBubbleWatchPartyTitle,
                      {
                        right: entry.rightOffset,
                        opacity: partyLocalReactionOpacityMapRef.current[entry.id] ?? 1,
                        transform: [
                          { translateY: partyLocalReactionTranslateMapRef.current[entry.id] ?? 0 },
                          { translateX: partyLocalReactionTranslateXMapRef.current[entry.id] ?? 0 },
                          { scale: partyLocalReactionScaleMapRef.current[entry.id] ?? 1 },
                        ],
                      },
                    ]}
                  >
                    <Text style={styles.partyLocalReactionText}>{entry.emoji}</Text>
                  </Animated.View>
                ))}
              </>
            ) : (
              <StandalonePlayerTopChrome
                controlsVisible={controlsVisible}
                playbackGateActive={standalonePlaybackGateActive}
                overlayOpacity={compactControlsOpacity}
                overlayTranslateY={compactControlsTranslateY}
                playbackRateLabel={formatPlaybackRateLabel(playbackRate)}
                onCyclePlaybackRate={() => {
                  setControlsVisible(true);
                  onCycleStandalonePlaybackRate();
                }}
                canShare={isCreatorVideoPlayback ? canShareStandaloneCreatorVideo : canShareStandaloneTitle}
                onShare={isCreatorVideoPlayback ? onShareCreatorVideo : onShareStandaloneTitle}
                canStartWatchPartyLive={canStartStandaloneWatchPartyLive}
                onWatchParty={onWatchParty}
                canReport={isCreatorVideoPlayback || canReportStandaloneTitle}
                reportBusy={isCreatorVideoPlayback ? creatorVideoReportBusy : titleReportBusy}
                onReport={() => {
                  if (isCreatorVideoPlayback) {
                    setCreatorVideoReportVisible(true);
                    return;
                  }
                  setTitleReportVisible(true);
                }}
              />
            )}

              </>
            )}

            <View style={[styles.playerFrameworkBottomStack, inWatchParty && styles.playerFrameworkBottomStackWatchParty]}>
              {!isLiveMode && (!isStandalonePlayer || !standalonePlaybackGateActive) ? (
                <View
                  pointerEvents={effectiveControlsVisible ? "auto" : "none"}
                  style={[
                    styles.progressCard,
                    inWatchParty && styles.progressCardWatchPartyTitle,
                    !effectiveControlsVisible && styles.playerControlHidden,
                  ]}
                >
                  <View style={styles.progressMetaRow}>
                    <Text style={styles.progressTime}>{formatTime(positionMillis)}</Text>
                    <View style={styles.progressRightCluster}>
                      <Text style={styles.progressTime}>{formatTime(durationMillis)}</Text>
                      {!inWatchParty && !isLiveMode && !standalonePlaybackGateActive ? (
                        <TouchableOpacity
                          style={styles.progressFullscreenButton}
                          activeOpacity={0.84}
                          accessibilityRole="button"
                          accessibilityLabel={isStandaloneFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                          hitSlop={{ bottom: 8, left: 8, right: 8, top: 8 }}
                          onPress={() => {
                            setIsStandaloneFullscreen((value) => !value);
                            setControlsVisible(true);
                            resetAutoHideTimer();
                          }}
                        >
                          <MaterialIcons
                            name={isStandaloneFullscreen ? "fullscreen-exit" : "fullscreen"}
                            size={18}
                            color="#F4F7FF"
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                  <View
                    style={styles.progressTrack}
                    {...(!watchPartyLiveSharedPlaybackControlsLocked ? progressScrubResponder.panHandlers : {})}
                    onLayout={(event) => {
                      progressTrackLayoutRef.current = { width: event.nativeEvent.layout.width };
                    }}
                  >
                    <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                  </View>
                </View>
              ) : null}

              {inWatchParty && !isLiveMode && livePresenceEvent ? (
                <View pointerEvents="none" style={styles.livePresenceEventToast}>
                  <Text style={styles.livePresenceEventText} numberOfLines={1}>
                    {livePresenceEvent}
                  </Text>
                </View>
              ) : null}

              {zoomLevel > 1.01 && !inWatchParty && !isLiveMode && !standalonePlaybackGateActive ? (
                <View style={styles.controlsRow}>
                  <TouchableOpacity style={styles.controlBtn} onPress={resetZoom}>
                    <Text style={styles.controlBtnText}>Reset Zoom</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

            </View>

            {!inWatchParty && !isLiveMode && !standalonePlaybackGateActive ? (
              <TouchableOpacity
                style={styles.standaloneFullscreenHitTarget}
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={isStandaloneFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                onPress={() => {
                  setIsStandaloneFullscreen((value) => !value);
                  setControlsVisible(true);
                  resetAutoHideTimer();
                }}
              />
            ) : null}

          </View>

          {!inWatchParty && !isLiveMode && !standalonePlaybackGateActive && !isStandaloneFullscreen ? (
            <View style={styles.standaloneBelowMediaActions}>
              <TouchableOpacity
                style={styles.standaloneBelowBackButton}
                onPress={() => router.back()}
                activeOpacity={0.86}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
              >
                <MaterialIcons name="arrow-back" size={16} color="#EEF1F7" />
                <Text style={styles.standaloneBelowBackText}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {renderCreatorVideoCommentsPanel()}

          {isSharedPartyPlayback && source ? (
            <View style={[styles.titleParticipantFeedDock, hasActiveRailParticipants && styles.titleWatchPartyRailDockActive]}>
              {renderTitleParticipantExpandedPanel()}
            </View>
          ) : null}
          {renderWatchPartyLiveModeOverlayCluster()}
          </>
        ) : (
          <Text style={styles.text}>No video attached</Text>
        )}
      </View>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  playerKeyboardAvoider: { flex: 1 },
  playerFrameworkRoot: { flex: 1 },
  playerFrameworkBackground: { ...StyleSheet.absoluteFillObject },
  playerFrameworkFullscreenBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  watchPartyFrameworkPosterWash: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  playerFrameworkBackgroundFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0B0B10" },
  playerFrameworkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,8,12,0.58)" },
  playerFrameworkOverlayWatchParty: { backgroundColor: "rgba(7,6,12,0.68)" },
  playerFrameworkDepthTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 132,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  playerFrameworkDepthTopWatchParty: {
    backgroundColor: "rgba(34,18,28,0.22)",
  },
  playerFrameworkDepthBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 210,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  playerFrameworkDepthBottomWatchParty: {
    backgroundColor: "rgba(10,10,18,0.54)",
  },
  container: { flex: 1, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 },
  containerWatchParty: { paddingTop: 2, paddingBottom: 10 },
  topSection: { marginBottom: 2, gap: 2 },
  topSectionFramework: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.24)",
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginBottom: 4,
  },
  topSectionWatchParty: {
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 2,
    paddingVertical: 0,
    marginBottom: 2,
  },
  kicker: { color: "#5B5B5B", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.1 },
  kickerWatchParty: { color: "#D2A7B5" },
  header: { color: "white", fontSize: 23, fontWeight: "900", lineHeight: 27 },
  headerWatchParty: { fontSize: 21, lineHeight: 24 },
  playerSurfacePill: {
    alignSelf: "flex-start",
    marginTop: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  playerSurfacePillWatchParty: {
    borderColor: "rgba(220,20,60,0.36)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  playerSurfacePillText: {
    color: "#F2F3F7",
    fontSize: 10,
    fontWeight: "900",
  },
  liveModeTopLabel: {
    color: "#FFCCD7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  partySyncPill: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.36)",
    backgroundColor: "rgba(220,20,60,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  partySyncPillFramework: {
    backgroundColor: "rgba(220,20,60,0.16)",
  },
  partySyncPillText: {
    color: "#F2DEE4",
    fontSize: 10.5,
    fontWeight: "800",
  },
  playerAccessOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "rgba(5,8,14,0.72)",
  },
  playerAccessCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.22)",
    backgroundColor: "rgba(8,12,20,0.96)",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 11,
    shadowColor: "#000",
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  playerAccessKicker: {
    color: "#C7E7FF",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.9,
    textAlign: "center",
  },
  playerAccessTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  playerAccessBody: {
    color: "#D1D8E8",
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
  },
  playerAccessActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  playerAccessSecondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  playerAccessSecondaryText: {
    color: "#E3EAF8",
    fontSize: 12,
    fontWeight: "800",
  },
  playerAccessPrimaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.44)",
    backgroundColor: "rgba(220,20,60,0.2)",
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  playerAccessPrimaryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  text: { color: "#D6D6D6", fontSize: 14, marginBottom: 10 },

  videoWrap: {
    width: "100%",
    height: 322,
    borderRadius: 16,
    backgroundColor: "black",
    marginBottom: 4,
    overflow: "hidden",
    position: "relative",
    borderWidth: 0,
    borderColor: "transparent",
  },
  videoWrapFramework: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(6,6,8,0.16)",
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  videoWrapWatchPartyTitle: {
    marginBottom: 1,
  },
  videoWrapStandaloneFullscreen: {
    height: "100%",
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 0,
  },
  videoWrapCreatorDiscussionKeyboard: {
    height: 210,
  },
  liveRoomWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 14,
    paddingBottom: 10,
  },
  liveSpeakingBackdrop: {
    position: "absolute",
    top: 24,
    alignSelf: "center",
    width: 210,
    height: 210,
    borderRadius: 120,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  liveSpeakingLabel: {
    color: "#F6DDE4",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 10,
  },
  liveSpeakerStage: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 10,
  },
  liveSpeakerStageSolo: {
    justifyContent: "center",
  },
  liveSpeakerStageDual: {
    justifyContent: "center",
    gap: 16,
  },
  liveSpeakerStageMulti: {
    justifyContent: "center",
    gap: 10,
    rowGap: 8,
  },
  liveSpeakerCard: {
    alignItems: "center",
  },
  liveSpeakerCardSolo: {
    minWidth: 130,
  },
  liveSpeakerCardDual: {
    minWidth: 112,
  },
  liveSpeakerCardMulti: {
    minWidth: 74,
    maxWidth: 84,
  },
  liveSpeakerAvatarWrap: {
    position: "relative",
    marginBottom: 6,
  },
  liveSpeakerAvatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
  },
  liveSpeakerInitials: {
    fontSize: 20,
  },
  liveSpeakerRing: {
    width: 86,
    height: 86,
    borderRadius: 43,
    top: -4,
    left: -4,
  },
  liveSpeakerBadge: {
    top: -8,
    right: -9,
  },
  liveSpeakerRequestRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    top: -2,
    left: -2,
  },
  liveSpeakerPresenceDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    bottom: -5,
    left: -5,
  },
  liveSpeakerMutedOverlay: {
    right: 19,
    bottom: -7,
  },
  liveSpeakerLinkedReaction: {
    bottom: -10,
  },
  liveSpeakerName: {
    fontSize: 13,
  },
  liveSpeakerVoiceTrack: {
    marginTop: 4,
    width: 78,
    height: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  liveSpeakerVoiceFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(132,220,255,0.92)",
  },
  livePresenceEventToast: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(9,9,14,0.8)",
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginBottom: 8,
    maxWidth: "92%",
  },
  livePresenceEventText: {
    color: "#EEF2FA",
    fontSize: 11,
    fontWeight: "800",
  },
  entryEnergyPulse: {
    position: "absolute",
    top: "20%",
    alignSelf: "center",
    width: 220,
    height: 220,
    borderRadius: 120,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  roomEnergyAura: {
    position: "absolute",
    top: "10%",
    alignSelf: "center",
    width: 250,
    height: 250,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  liveModeParticipantsWrap: {
    width: "100%",
    justifyContent: "flex-end",
  },
  liveModeActionRow: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    gap: 6,
  },
  videoAnimatedWrap: {
    width: "100%",
    height: "100%",
  },
  standaloneVideoGestureTarget: {
    ...StyleSheet.absoluteFillObject,
    top: 126,
    bottom: 214,
    zIndex: 40,
    elevation: 40,
    backgroundColor: "transparent",
  },
  sharedAndroidVideoTapTarget: {
    ...StyleSheet.absoluteFillObject,
    bottom: 56,
    zIndex: 4,
    elevation: 4,
    backgroundColor: "transparent",
  },
  videoLoadingFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "black",
  },
  videoLoadingText: {
    color: "#BFC7D8",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  videoLoadingSubtext: {
    color: "#8D97AA",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    maxWidth: 260,
    textAlign: "center",
  },
  video: {
    width: "100%",
    height: "100%",
    backgroundColor: "black",
  },
  seekFeedback: {
    position: "absolute",
    alignSelf: "center",
    top: "42%",
    backgroundColor: "rgba(0,0,0,0.56)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  seekFeedbackText: {
    color: "white",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  upNextOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(10,10,14,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  upNextLabel: {
    color: "#D7DAE2",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  upNextTitle: {
    marginTop: 4,
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  upNextCountdown: {
    marginTop: 4,
    color: "#BFC3CF",
    fontSize: 12,
    fontWeight: "700",
  },
  upNextActions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  upNextPrimaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  upNextPrimaryBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  upNextSecondaryBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  upNextSecondaryBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },

  partyOverlayTopRow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    zIndex: 46,
    elevation: 46,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  partyOverlayTopRowWatchParty: {
    justifyContent: "flex-start",
  },
  partyOverlaySpacer: { flex: 1 },
  partyPresencePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(6,6,10,0.52)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: "58%",
  },
  partyPresencePillWatchPartyTitle: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8,8,12,0.38)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  partyPresenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  partyPresenceIcon: {
    color: "#F0F3FA",
    fontSize: 12,
    fontWeight: "900",
  },
  partyPresenceCount: {
    color: "#F0F3FA",
    fontSize: 12.5,
    fontWeight: "900",
  },
  partyPresenceHint: {
    marginTop: 1,
    color: "#AEB3C1",
    fontSize: 10,
    fontWeight: "700",
  },
  partyOverlayActions: {
    flexDirection: "row",
    gap: 5,
  },
  partyOverlayActionsWatchPartyTitle: {
    gap: 4,
  },
  standaloneOverlayActions: {
    width: "100%",
    minHeight: 70,
    alignItems: "stretch",
    gap: 7,
  },
  standaloneTopActionBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  standaloneTopLeftActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    maxWidth: "62%",
  },
  standaloneTopSpacer: {
    width: 1,
    height: 1,
  },
  standaloneTopRightActions: {
    alignItems: "flex-end",
    gap: 6,
    maxWidth: "38%",
  },
  partyOverlayChip: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.34)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  partyOverlayChipWatchPartyTitle: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  partyOverlayChipText: {
    color: "#F1F3F8",
    fontSize: 10,
    fontWeight: "800",
  },
  partyReactionBurstWrap: {
    position: "absolute",
    right: 8,
    bottom: 62,
    gap: 4,
    alignItems: "flex-end",
  },
  partyReactionBurstWrapWatchPartyTitle: {
    bottom: 58,
  },
  partyReactionBurstBubble: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(6,6,10,0.56)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    opacity: 0.92,
  },
  partyReactionBurstText: {
    fontSize: 16,
    fontWeight: "900",
  },
  partyLocalReactionBubble: {
    position: "absolute",
    right: 16,
    bottom: 102,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(6,6,10,0.56)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  partyLocalReactionBubbleWatchPartyTitle: {
    bottom: 92,
    backgroundColor: "rgba(6,6,10,0.48)",
  },
  partyLocalReactionText: {
    fontSize: 21,
    fontWeight: "900",
  },
  partyChatDrawer: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8,8,12,0.64)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 3,
  },
  partyChatDrawerWatchPartyTitle: {
    bottom: 6,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(8,8,12,0.5)",
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  partyChatDrawerTitle: {
    color: "#E8EBF3",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  partyChatDrawerEmpty: {
    color: "#8E93A0",
    fontSize: 11,
    fontWeight: "700",
  },
  partyChatDrawerLine: {
    color: "#D4D8E2",
    fontSize: 11.5,
    fontWeight: "600",
  },
  partyChatDrawerAuthor: {
    color: "#F2D8DF",
    fontWeight: "900",
  },
  partyMessageText: {
    color: "#fff",
    fontSize: 13,
    marginBottom: 6,
  },
  creatorCommentsPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.2)",
    backgroundColor: "rgba(8,12,20,0.96)",
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: Platform.OS === "android" ? 16 : 12,
    gap: 10,
    maxHeight: 282,
    marginTop: 10,
    marginBottom: Platform.OS === "android" ? 14 : 10,
  },
  creatorCommentsPanelKeyboard: {
    maxHeight: 238,
    paddingBottom: Platform.OS === "android" ? 12 : 10,
  },
  creatorCommentsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  creatorCommentsHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  creatorCommentsKicker: {
    color: "#9AA6C0",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  creatorCommentsTitle: {
    color: "#F2F5FF",
    fontSize: 16,
    fontWeight: "900",
  },
  creatorCommentsList: {
    maxHeight: 144,
  },
  creatorCommentsListKeyboard: {
    maxHeight: 90,
  },
  creatorCommentsListContent: {
    gap: 8,
    paddingBottom: 2,
  },
  creatorCommentsEmpty: {
    color: "#AAB3C7",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlign: "center",
  },
  creatorCommentCard: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  creatorCommentThread: {
    gap: 7,
  },
  creatorCommentReplyCard: {
    marginLeft: 24,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(115,134,255,0.28)",
  },
  creatorCommentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  creatorCommentAvatarImage: {
    width: "100%",
    height: "100%",
  },
  creatorCommentAvatarText: {
    color: "#fff",
    fontSize: 10.5,
    fontWeight: "900",
  },
  creatorCommentBodyWrap: {
    flex: 1,
    gap: 3,
  },
  creatorCommentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  creatorCommentAuthor: {
    flexShrink: 1,
    color: "#F4F7FF",
    fontSize: 12,
    fontWeight: "900",
  },
  creatorCommentTime: {
    color: "#8792A8",
    fontSize: 10.5,
    fontWeight: "700",
  },
  creatorCommentBody: {
    color: "#DCE3F2",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  creatorCommentAttachmentStack: {
    gap: 7,
  },
  creatorCommentActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  creatorCommentAction: {
    alignSelf: "flex-start",
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(186,208,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: "center",
  },
  creatorCommentActionText: {
    color: "#BFC8DC",
    fontSize: 10.5,
    fontWeight: "900",
  },
  creatorCommentsComposer: {
    gap: 7,
  },
  creatorCommentReplyNotice: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.2)",
    backgroundColor: "rgba(115,134,255,0.08)",
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 4,
  },
  creatorCommentReplyNoticeText: {
    color: "#E7ECFF",
    fontSize: 11,
    fontWeight: "900",
  },
  creatorCommentReplyCancelText: {
    color: "#AFC0FF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  creatorCommentsInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  creatorCommentsAttachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  creatorCommentsInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#EEF1F8",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  creatorCommentsSendBtn: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(186,208,255,0.22)",
    backgroundColor: "rgba(56,80,126,0.78)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
  },
  creatorCommentsSendText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  creatorCommentsSigninText: {
    color: "#AAB3C7",
    fontSize: 11.5,
    fontWeight: "700",
  },
  partyCommentsDrawer: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8,8,12,0.66)",
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 8,
    maxHeight: 148,
  },
  partyCommentsDrawerWatchPartyTitle: {
    bottom: 6,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(8,8,12,0.52)",
    paddingHorizontal: 7,
    paddingTop: 6,
  },
  partyCommentsDrawerTitle: {
    color: "#E8EBF3",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  partyCommentsList: {
    maxHeight: 76,
  },
  partyCommentsListContent: {
    gap: 3,
    paddingBottom: 6,
  },
  partyCommentsLine: {
    color: "#D4D8E2",
    fontSize: 11,
    fontWeight: "600",
  },
  partyCommentsAuthor: {
    color: "#F2D8DF",
    fontWeight: "900",
  },
  partyCommentsInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  partyCommentsInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#EEF1F8",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  partyCommentsSendBtn: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.7)",
    backgroundColor: "rgba(220,20,60,0.26)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "center",
  },
  partyCommentsSendBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },

  partyTransportRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  partyTransportBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(10,10,14,0.66)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  partyTransportBtnPrimary: {
    borderColor: "rgba(220,20,60,0.7)",
    backgroundColor: "rgba(220,20,60,0.28)",
  },
  partyTransportBtnText: {
    color: "#EFF2F8",
    fontSize: 12,
    fontWeight: "800",
  },
  partyTransportBtnTextPrimary: {
    color: "#fff",
  },

  compactControlsShell: {
    marginTop: 0,
    marginBottom: 0,
    gap: 4,
    zIndex: 47,
    elevation: 47,
  },
  compactChip: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  compactChipAccent: {
    borderColor: "rgba(220,20,60,0.52)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  compactSpeedChip: {
    minWidth: 54,
    paddingHorizontal: 12,
  },
  compactChipText: {
    color: "#EEF1F8",
    fontSize: 11.5,
    fontWeight: "800",
  },
  compactChipTextAccent: {
    color: "#fff",
  },
  standaloneSocialHandoffBtn: {
    alignSelf: "flex-end",
  },
  compactActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  compactActionBtn: {
    flex: 0,
    minHeight: 44,
    minWidth: 98,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  compactPlaybackBtn: {
    flex: 0,
    minWidth: 68,
    paddingHorizontal: 16,
  },
  compactActionBtnText: {
    color: "#EEF1F7",
    fontSize: 12,
    fontWeight: "800",
  },
  standaloneBelowMediaActions: {
    marginTop: 10,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  standaloneBelowBackButton: {
    minHeight: 44,
    minWidth: 112,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(15,18,25,0.74)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  standaloneBelowBackText: {
    color: "#EEF1F7",
    fontSize: 12.5,
    fontWeight: "800",
  },

  progressCard: {
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  playerFrameworkBottomStack: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    gap: 8,
    zIndex: 90,
    elevation: 90,
  },
  playerFrameworkBottomStackWatchParty: {
    gap: 3,
  },
  standaloneFullscreenHitTarget: {
    position: "absolute",
    right: 2,
    bottom: 32,
    width: 84,
    height: 84,
    borderRadius: 42,
    zIndex: 150,
    elevation: 150,
    backgroundColor: "transparent",
  },
  progressCardWatchPartyTitle: {
    marginTop: 0,
    marginBottom: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  progressMetaRow: {
    marginBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressRightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressFullscreenButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.34)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    elevation: 100,
  },
  progressTime: {
    color: "#C5C9D3",
    fontSize: 11.5,
    fontWeight: "800",
  },
  playerControlHidden: {
    opacity: 0,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.26)",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: ACCENT,
    borderRadius: 999,
  },
  partyFeedCard: {
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginTop: 0,
    marginBottom: 0,
    minHeight: 82,
    maxHeight: 142,
  },
  partyFeedCardTitleCompact: {
    minHeight: 68,
    maxHeight: 92,
  },
  watchPartyParticipantLayer: {
    marginTop: 2,
  },
  titleWatchPartyRailDock: {
    marginTop: 6,
    paddingHorizontal: 0,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(7,7,11,0.38)",
    overflow: "visible",
  },
  titleParticipantFeedDock: {
    marginTop: 4,
    borderRadius: 22,
    borderWidth: 0,
    backgroundColor: "rgba(8,10,18,0.46)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 176,
    maxHeight: 312,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  titleWatchPartyRailDockActive: {
    backgroundColor: "rgba(12,10,20,0.62)",
    shadowColor: "#130710",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  titleWatchPartyRailPeekFade: {
    position: "absolute",
    top: -16,
    left: 0,
    right: 0,
    height: 18,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    opacity: 0.34,
  },
  titleRailHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginBottom: 3,
  },
  titleWatchPartyRailLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF5A7C",
    shadowColor: "#FF5A7C",
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  titleRailHintText: {
    color: "#C6CBD8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  titleRailHintArrow: {
    color: "#EDEFF6",
    fontSize: 11,
    fontWeight: "900",
    marginTop: -1,
  },
  titleParticipantSheetLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingBottom: 2,
  },
  titleParticipantSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  titleParticipantSheetBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  titleParticipantSheet: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  titleParticipantSheetHandle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
    backgroundColor: "rgba(255,255,255,0.42)",
    marginBottom: 10,
    shadowColor: "#FFF",
    shadowOpacity: 0.26,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  titleParticipantSheetScroll: {
    maxHeight: 220,
  },
  titleParticipantSheetGrid: {
    gap: 8,
    paddingBottom: 22,
  },
  titleParticipantSheetCard: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(10,10,14,0.52)",
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: "center",
  },
  titleParticipantSheetAvatarWrap: {
    position: "relative",
    marginBottom: 4,
  },
  titleParticipantFeedWrap: {
    width: "100%",
    gap: 10,
  },
  watchPartyPlayerBandMeta: {
    flex: 1,
    gap: 3,
  },
  watchPartyPlayerBandKicker: {
    color: "#E7C0CD",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  watchPartyPlayerBandSubtle: {
    color: "#AEB4C6",
    fontSize: 10.5,
    fontWeight: "700",
  },
  watchPartySocialShell: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(8, 10, 18, 0.88)",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  watchPartySocialShellKeyboardHidden: {
    display: "none",
  },
  watchPartySocialHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  watchPartySocialMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: "100%",
  },
  watchPartySocialMetaPillRole: {
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  watchPartySocialMetaText: {
    color: "#DCE4F6",
    fontSize: 11,
    fontWeight: "800",
  },
  watchPartySocialRoleText: {
    color: "#FFF5F7",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  watchPartySocialHelperText: {
    color: "#AEB4C6",
    fontSize: 10.5,
    fontWeight: "700",
    lineHeight: 14,
  },
  watchPartySocialMediaFrame: {
    height: 154,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(5,7,14,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  watchPartySocialMediaFrameInner: {
    flex: 1,
  },
  watchPartySocialPlaceholder: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(4, 6, 12, 0.72)",
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 6,
  },
  watchPartySocialPlaceholderKicker: {
    color: "#F0C8D2",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  watchPartySocialPlaceholderBody: {
    color: "#E7EBF6",
    fontSize: 12,
    lineHeight: 18,
  },
  titleParticipantFeedScroll: {
    maxHeight: 228,
  },
  titleParticipantFeedStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 18,
  },
  titleParticipantFeedCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    minHeight: 78,
    width: 94,
  },
  titleParticipantFeedCardExpanded: {
    width: 206,
    minHeight: 188,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginHorizontal: 4,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.1)",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  titleParticipantFeedCardFeatured: {
    width: 238,
    minHeight: 214,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginHorizontal: 6,
  },
  titleParticipantFeedCardMinimized: {
    width: 44,
    minHeight: 44,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 999,
  },
  titleParticipantFeedCardFocused: {
    borderColor: "rgba(168,198,255,0.8)",
    backgroundColor: "rgba(100,146,255,0.16)",
    shadowColor: "rgba(126,166,255,0.75)",
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
  },
  titleParticipantFeedCardActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    shadowColor: "rgba(255,255,255,0.2)",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  titleParticipantFeedCardSpeaking: {
    backgroundColor: "rgba(255,255,255,0.1)",
    shadowColor: "rgba(255,255,255,0.24)",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
  },
  titleParticipantFeedAvatarPulse: {
    alignItems: "center",
    justifyContent: "center",
  },
  titleParticipantFeedAvatarWrap: {
    position: "relative",
  },
  titleParticipantTileTap: {
    alignItems: "center",
    justifyContent: "center",
  },
  titleParticipantFeedLiveDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1,
    borderColor: "rgba(7,7,11,0.95)",
    backgroundColor: "#4ADE80",
  },
  titleParticipantFeedLiveDotMinimized: {
    width: 6,
    height: 6,
    borderRadius: 3,
    right: -2,
    bottom: -2,
  },
  titleParticipantFeedLiveDotFeatured: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    right: 0,
    bottom: 0,
  },
  titleParticipantMinimizeBtn: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    backgroundColor: "rgba(8,8,12,0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleParticipantMinimizeBtnText: {
    color: "#EAF0FA",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 11,
  },
  partyFeedCardLive: {
    minHeight: 96,
    maxHeight: 172,
    marginBottom: 0,
    alignSelf: "stretch",
  },
  partyFeedCardLiveDock: {
    minHeight: 132,
    maxHeight: 190,
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  watchPartyParticipantDockCard: {
    minHeight: 124,
    maxHeight: 188,
  },
  watchPartyDockOverlay: {
    gap: 8,
  },
  watchPartyDockOverlayKeyboard: {
    gap: 6,
  },
  watchPartyDockActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  watchPartyDockActionBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  watchPartyDockActionBtnActive: {
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  watchPartyDockActionText: {
    color: "#EDF1F9",
    fontSize: 11.5,
    fontWeight: "800",
  },
  watchPartyDockActionTextActive: {
    color: "#FFFFFF",
  },
  watchPartyDockCard: {
    borderRadius: 18,
    backgroundColor: "rgba(6,8,16,0.72)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  watchPartyHostReviewCard: {
    borderColor: "rgba(220,20,60,0.28)",
    borderWidth: 1,
    backgroundColor: "rgba(8,9,18,0.9)",
  },
  watchPartyHostReviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  watchPartyHostReviewMeta: {
    flex: 1,
    gap: 3,
  },
  watchPartyHostReviewTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  watchPartyHostReviewCloseBtn: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  watchPartyHostReviewCloseText: {
    color: "#E7ECF7",
    fontSize: 11,
    fontWeight: "800",
  },
  watchPartyHostReviewBody: {
    color: "#CCD3E4",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  watchPartyHostReviewActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  watchPartyHostReviewPrimaryBtn: {
    borderColor: "rgba(220,20,60,0.56)",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  watchPartyDockCardKeyboardComposer: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 0,
  },
  watchPartyDockCardTitle: {
    color: "#F5F7FC",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  watchPartyDockCardBody: {
    color: "#CCD3E4",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  watchPartyDockMenuRow: {
    flexDirection: "row",
    gap: 8,
  },
  watchPartyDockMenuBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  watchPartyDockMenuBtnText: {
    color: "#F4F7FE",
    fontSize: 11.5,
    fontWeight: "800",
  },
  watchPartyDockRateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  watchPartyDockRateChip: {
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  watchPartyDockRateChipActive: {
    backgroundColor: "rgba(220,20,60,0.26)",
  },
  watchPartyDockRateChipText: {
    color: "#D9E0EF",
    fontSize: 11,
    fontWeight: "800",
  },
  watchPartyDockRateChipTextActive: {
    color: "#FFFFFF",
  },
  watchPartyAudioMixPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },
  watchPartyAudioMixHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  watchPartyAudioMixHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  watchPartyAudioMixKicker: {
    color: "#F5F7FC",
    fontSize: 12,
    fontWeight: "900",
  },
  watchPartyAudioMixStatus: {
    color: "#BFC6D6",
    fontSize: 10.5,
    fontWeight: "700",
  },
  watchPartyAudioMixToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  watchPartyAudioMixToggleActive: {
    borderColor: "rgba(220,20,60,0.5)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  watchPartyAudioMixToggleText: {
    color: "#D9E0EF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  watchPartyAudioMixToggleTextActive: {
    color: "#FFFFFF",
  },
  audioMixSliderWrap: {
    gap: 7,
  },
  audioMixSliderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  audioMixSliderLabel: {
    color: "#EEF2FA",
    fontSize: 11.5,
    fontWeight: "800",
  },
  audioMixSliderValue: {
    color: "#D5DCEB",
    fontSize: 11,
    fontWeight: "800",
  },
  audioMixSliderTrack: {
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.26)",
    overflow: "hidden",
    justifyContent: "center",
  },
  audioMixSliderTrackDisabled: {
    opacity: 0.58,
  },
  audioMixSliderFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(220,20,60,0.72)",
  },
  audioMixSliderThumb: {
    position: "absolute",
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: ACCENT,
  },
  watchPartyAudioMixVoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  watchPartyAudioMixVoiceLabel: {
    color: "#EEF2FA",
    fontSize: 11.5,
    fontWeight: "800",
  },
  watchPartyAudioMixVoiceValue: {
    color: "#D5DCEB",
    fontSize: 11,
    fontWeight: "800",
  },
  watchPartyAudioMixResetBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  watchPartyAudioMixResetText: {
    color: "#F2F5FC",
    fontSize: 10.5,
    fontWeight: "900",
  },
  participantBubbleScroll: {
    gap: 8,
    paddingRight: 4,
  },
  participantBubbleScrollTitleCompact: {
    gap: 7,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 4,
    alignItems: "center",
  },
  participantBubbleScrollLive: {
    rowGap: 8,
    paddingVertical: 2,
    flexGrow: 1,
  },
  participantBubbleScrollLiveGrid: {
    paddingRight: 0,
  },
  participantBubbleScrollLiveDock: {
    rowGap: 6,
    paddingHorizontal: 0,
    paddingVertical: 2,
    minHeight: 118,
  },
  participantBubbleGridRow: {
    justifyContent: "space-between",
  },
  participantBubbleItem: {
    width: 74,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(8,8,12,0.44)",
    paddingHorizontal: 5,
    paddingVertical: 6,
  },
  participantBubbleItemTitleCompact: {
    width: 62,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  titleParticipantLivePulse: {
    position: "absolute",
    top: -3,
    left: -3,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  participantBubbleItemLive: {
    width: "19.2%",
    paddingHorizontal: 3,
    paddingVertical: 6,
  },
  participantBubbleItemLiveGrid: {
    minHeight: 72,
  },
  participantBubbleItemLiveDock: {
    width: "19.2%",
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "transparent",
  },
  participantBubbleActive: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  participantBubbleSpeaking: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  participantBubbleInactive: {
    opacity: 0.58,
  },
  participantBubbleReactionBoost: {
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  partyParticipantCardExpanded: {
    width: 232,
  },
  partyParticipantBubbleTap: {
    alignItems: "center",
  },
  partyParticipantBubbleTapDock: {
    gap: 2,
  },
  watchPartyParticipantRow: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  watchPartyParticipantRowBoosted: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  watchPartyParticipantRowTap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  watchPartyParticipantIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  partyParticipantAvatarWrap: {
    position: "relative",
    marginBottom: 6,
  },
  partyParticipantAvatarWrapDock: {
    marginBottom: 0,
  },
  watchPartyParticipantAvatarWrap: {
    marginRight: 0,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  participantAvatarTitleCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  participantAvatarTitleSheet: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  participantAvatarTitleFeed: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderColor: "rgba(255,255,255,0.26)",
  },
  participantAvatarTitleFeedExpanded: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1.4,
    borderColor: "rgba(255,255,255,0.46)",
  },
  participantAvatarTitleFeedFeatured: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.6,
  },
  participantAvatarTitleFeedMinimized: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  participantAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  liveFaceFilterPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 999,
  },
  participantAvatarLive: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  participantAvatarLiveDock: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderColor: "transparent",
    backgroundColor: "rgba(0,0,0,0.44)",
  },
  watchPartyParticipantAvatar: {
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "rgba(10,12,20,0.64)",
    overflow: "hidden",
  },
  participantActiveRing: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.4,
    borderColor: "rgba(255,255,255,0.34)",
  },
  participantSpeakingRing: {
    borderWidth: 1.6,
    borderColor: "rgba(255,255,255,0.4)",
  },
  participantReactionBoostRing: {
    borderColor: "rgba(255,255,255,0.44)",
    borderWidth: 1.8,
  },
  participantRequestRing: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(122,196,255,0.9)",
  },
  participantActivePulse: {
    position: "absolute",
    top: -5,
    left: -5,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  participantSpeakingPulse: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  participantRequestBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(122,196,255,0.9)",
    backgroundColor: "rgba(19,51,75,0.95)",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  participantRequestBadgeText: {
    color: "#D8EEFF",
    fontSize: 9,
    fontWeight: "900",
  },
  participantPresenceDot: {
    position: "absolute",
    bottom: -4,
    left: -4,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1,
    borderColor: "rgba(6,6,10,0.9)",
  },
  participantPresenceDotActive: {
    backgroundColor: "#4ADE80",
  },
  participantPresenceDotIdle: {
    backgroundColor: "#7A808F",
  },
  participantMutedOverlay: {
    position: "absolute",
    bottom: -6,
    right: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(7,7,11,0.88)",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  participantMutedOverlayText: {
    color: "#F0F3FB",
    fontSize: 8,
    fontWeight: "900",
  },
  participantLinkedReaction: {
    position: "absolute",
    bottom: -8,
    right: -2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(6,6,10,0.78)",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  participantLinkedReactionSpeaking: {
    backgroundColor: "rgba(6,6,10,0.78)",
    borderColor: "rgba(255,255,255,0.3)",
  },
  participantLinkedReactionText: {
    fontSize: 12,
    fontWeight: "900",
  },
  participantLinkedReactionTextSpeaking: {
    fontSize: 13,
  },
  participantAvatarMuted: {
    opacity: 0.45,
  },
  participantInitials: {
    color: "#EEF1F8",
    fontSize: 13,
    fontWeight: "900",
  },
  participantInitialsTitleCompact: {
    fontSize: 14,
  },
  participantInitialsLive: {
    fontSize: 16,
  },
  partyParticipantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  partyParticipantNameWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  participantName: {
    color: "#F1F3F9",
    fontSize: 10,
    fontWeight: "800",
    maxWidth: "100%",
  },
  participantNameTitleCompact: {
    fontSize: 9,
    marginTop: 0,
  },
  participantNameTitleSheet: {
    fontSize: 10.5,
    marginTop: 1,
    textAlign: "center",
  },
  participantNameTitleFeed: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D6DBE6",
    maxWidth: "100%",
    textAlign: "center",
  },
  participantNameTitleFeedExpanded: {
    fontSize: 14,
    fontWeight: "900",
    color: "#F3F7FF",
  },
  participantNameTitleFeedFocused: {
    color: "#EFF4FF",
  },
  participantNameTitleFeedFeatured: {
    fontSize: 15,
    fontWeight: "900",
  },
  participantHostBadgeFeed: {
    left: -4,
    top: -5,
    paddingHorizontal: 3,
    paddingVertical: 0,
  },
  participantHostBadgeFeedMinimized: {
    left: -5,
    top: -5,
    paddingHorizontal: 2,
  },
  participantHostBadgeTextFeed: {
    fontSize: 6.5,
  },
  participantInitialsTitleFeedExpanded: {
    fontSize: 26,
  },
  participantInitialsTitleFeedFeatured: {
    fontSize: 30,
  },
  participantInitialsTitleFeedMinimized: {
    fontSize: 9,
  },
  participantNameLive: {
    fontSize: 11,
  },
  participantNameLiveDock: {
    maxWidth: "100%",
    fontSize: 9,
    color: "#F3F6FD",
    textAlign: "center",
  },
  watchPartyParticipantScroll: {
    maxHeight: 188,
  },
  watchPartyParticipantScrollContent: {
    gap: 8,
    paddingRight: 2,
  },
  watchPartyParticipantTextWrap: {
    flex: 1,
    gap: 3,
  },
  watchPartyParticipantNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  watchPartyParticipantName: {
    flex: 1,
    color: "#F4F7FD",
    fontSize: 12,
    fontWeight: "800",
  },
  watchPartyParticipantStatus: {
    color: "#AEB4C6",
    fontSize: 10.5,
    fontWeight: "700",
  },
  watchPartyParticipantLivePill: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  watchPartyParticipantLivePillText: {
    color: "#F5F7FC",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  watchPartyParticipantMeta: {
    minWidth: 22,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  watchPartyParticipantReaction: {
    fontSize: 18,
    fontWeight: "900",
  },
  watchPartyLiveBottomDock: {
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(8,12,18,0.72)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  watchPartyLiveBottomDockActive: {
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(8,12,18,0.72)",
  },
  watchPartyLivePresenceToast: {
    alignSelf: "center",
    marginBottom: 4,
    maxWidth: "96%",
  },
  watchPartyLivePresenceStack: {
    gap: 4,
  },
  liveFilterSheet: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(154,182,246,0.24)",
    backgroundColor: "rgba(6,10,18,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  liveFilterSheetStandalone: {
    marginTop: 10,
  },
  liveFilterSheetWatchParty: {
    marginBottom: 2,
  },
  liveFilterSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  liveFilterSheetHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  liveFilterSheetKicker: { color: "#9DB8FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  liveFilterSheetTitle: { color: "#F5F8FF", fontSize: 15, fontWeight: "900", lineHeight: 20 },
  liveFilterSheetDismissBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveFilterSheetDismissText: { color: "#DCE4F5", fontSize: 11, fontWeight: "800" },
  liveFilterSheetBody: { color: "#C6D0E2", fontSize: 12, lineHeight: 17, fontWeight: "600" },
  liveFilterSheetHelper: { color: "#EFF4FF", fontSize: 11.5, lineHeight: 16, fontWeight: "700" },
  liveFilterOptionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  liveFilterOptionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  liveFilterOptionChipActive: {
    borderColor: "rgba(138,178,255,0.44)",
    backgroundColor: "rgba(34,52,92,0.86)",
  },
  liveFilterOptionText: { color: "#DCE4F5", fontSize: 11.5, fontWeight: "700" },
  liveFilterOptionTextActive: { color: "#F5F8FF" },
  watchPartyLiveStripWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(8,10,16,0.48)",
    paddingVertical: 2,
    paddingHorizontal: 2,
    marginBottom: 0,
  },
  footerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
    alignSelf: "center",
  },
  footerIconBtn: {
    width: 58,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(8,10,16,0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    gap: 2,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  footerReactionQuickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  footerReactionQuickBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  footerReactionQuickText: {
    color: "#F1F1F1",
    fontSize: 15,
    fontWeight: "900",
  },
  footerIconBtnText: { color: "#F1F1F1", fontSize: 15, fontWeight: "900" },
  footerIconBtnLabel: { color: "#D4D4D4", fontSize: 9.5, fontWeight: "800" },
  watchPartyLiveFooterActiveBtn: {
    borderColor: "rgba(172,196,255,0.52)",
    backgroundColor: "rgba(120,156,245,0.22)",
    shadowColor: "rgba(140,176,255,0.86)",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  watchPartyLiveFooterActiveLabel: {
    color: "#F4F7FF",
  },
  reactionPickerRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 26,
  },
  reactionPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  reactionPickerSheet: {
    marginHorizontal: 8,
    marginBottom: 126,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(7,10,16,0.95)",
    maxHeight: 260,
    padding: 10,
  },
  watchPartyLiveCommentsDrawer: {
    position: "relative",
    left: 0,
    right: 0,
    bottom: 0,
    marginBottom: 0,
    borderRadius: 12,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(7,10,16,0.9)",
    maxHeight: 132,
    paddingTop: 6,
    paddingBottom: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  reactionPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  reactionPickerTitle: { color: "#F2F5FC", fontSize: 13, fontWeight: "900" },
  reactionPickerSubtitle: { color: "#9EA6B8", fontSize: 10.5, fontWeight: "700", marginTop: 2 },
  reactionPickerCloseBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reactionPickerCloseText: { color: "#E7ECF8", fontSize: 11, fontWeight: "800" },
  reactionPickerBody: { maxHeight: 196 },
  reactionPickerSection: { marginBottom: 8 },
  reactionPickerSectionTitle: { color: "#8F99AD", fontSize: 10.5, fontWeight: "800", marginBottom: 6 },
  reactionPickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reactionPickerEmojiBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionPickerEmojiText: { fontSize: 20 },
  participantHostBadge: {
    position: "absolute",
    left: -6,
    top: -6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.65)",
    backgroundColor: "rgba(220,20,60,0.24)",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  participantHostBadgeText: {
    color: "#FFF2F5",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  participantSpeakingBadge: {
    position: "absolute",
    right: -8,
    top: -7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(8,10,16,0.86)",
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  participantSpeakingBadgeText: {
    color: "#FFFFFF",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  partyParticipantStatus: {
    color: "#D8DCE7",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 1,
  },
  partyParticipantStatusDock: {
    maxWidth: "100%",
    color: "#C0C8D9",
    fontSize: 8,
    textAlign: "center",
  },
  participantExpandedSummary: {
    marginTop: 7,
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(7,10,18,0.82)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
  },
  participantExpandedSummaryDock: {
    alignSelf: "stretch",
  },
  participantExpandedSummaryCopy: {
    gap: 3,
  },
  participantExpandedSummaryKicker: {
    color: "#8E98AC",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  participantExpandedSummaryTitle: {
    color: "#F4F7FF",
    fontSize: 11.5,
    fontWeight: "800",
  },
  participantExpandedSummaryBody: {
    color: "#C2CADB",
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "700",
  },
  participantExpandedControls: {
    marginTop: 7,
    flexDirection: "row",
    gap: 6,
  },
  participantExpandedControlsDock: {
    width: "100%",
    flexDirection: "column",
  },
  partyParticipantControlBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 9,
    paddingVertical: 6,
    alignItems: "center",
  },
  partyParticipantControlBtnDock: {
    width: "100%",
  },
  participantToolsToggleBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
  },
  partyParticipantControlBtnActive: {
    borderColor: "rgba(220,20,60,0.62)",
    backgroundColor: "rgba(220,20,60,0.22)",
  },
  partyParticipantControlBtnText: {
    color: "#EEF1F8",
    fontSize: 10.5,
    fontWeight: "800",
  },
  partyParticipantControlBtnTextActive: {
    color: "#FFFFFF",
  },

  controlsSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(14,14,14,0.84)",
    padding: 11,
    marginBottom: 8,
    gap: 7,
  },
  controlsKicker: { color: "#5B5B5B", fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 0,
  },
  controlBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  controlBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  speedWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
    marginBottom: 0,
    gap: 8,
  },
  speedLabel: {
    color: "#DBDCE1",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  speedChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.025)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  speedChipActive: {
    borderColor: "rgba(220,20,60,0.8)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  speedChipText: {
    color: "#C8CBD5",
    fontSize: 12,
    fontWeight: "800",
  },
  speedChipTextActive: {
    color: "#fff",
  },
  speedSelectorButton: {
    alignSelf: "flex-start",
  },
  speedMenu: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 0,
  },
  secondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryBtnPrimary: {
    borderColor: "rgba(220,20,60,0.6)",
    backgroundColor: "rgba(220,20,60,0.26)",
  },
  secondaryBtnDisabled: {
    opacity: 0.6,
  },
  secondaryBtnText: {
    color: "#F2F3F7",
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryBtnTextPrimary: {
    color: "#fff",
    fontWeight: "800",
  },

  fallbackActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  backBtn: {
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginTop: 2,
  },
  backText: { color: "#E6E8EF", fontWeight: "900", fontSize: 13 },
});
