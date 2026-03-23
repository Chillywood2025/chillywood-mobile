import type { RealtimeChannel } from "@supabase/supabase-js";
import { ResizeMode, Video, type AVPlaybackStatus } from "expo-av";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  LayoutAnimation,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
  type GestureResponderEvent
} from "react-native";

import { titles } from "../../_data/titles";
import { getVideoSource } from "../../_lib/mediaSources";
import { supabase } from "../../_lib/supabase";
import {
  clearProgressForTitle,
  readMergedWatchProgress,
  readMyListIds,
  toggleMyListTitle,
  writeProgressForTitle,
} from "../../_lib/userData";
import {
  createPartyRoom,
  emitSyncEvent,
  fetchPartyMessages,
  getPartyRoom,
  getSafePartyUserId,
  updateRoomPlayback,
  type WatchPartyState,
} from "../../_lib/watchParty";

const ACCENT = "#DC143C";
const BG = "#0B0B10";
const STEP_MILLIS = 10_000;
const SWIPE_PIXELS_PER_STEP = 30;
const MAX_ZOOM = 2.5;
const MIN_ZOOM = 1;
const PROGRESS_WRITE_INTERVAL = 4_000;
const CONTROLS_AUTO_HIDE_MILLIS = 3_000;
const NEXT_AUTOPLAY_DELAY_MILLIS = 1_500;
const UP_NEXT_TRIGGER_MILLIS = 12_000;
const UP_NEXT_COUNTDOWN_SECONDS = 5;
const PARTY_HOST_SYNC_WRITE_INTERVAL_MILLIS = 600;
const PARTY_GUEST_NOOP_DRIFT_MILLIS = 900;
const PARTY_GUEST_SOFT_SEEK_THRESHOLD_MILLIS = 2400;
const PARTY_GUEST_SOFT_NUDGE_MILLIS = 450;
const PARTY_LOCAL_MAX_REACTIONS = 8;
const PARTY_LOCAL_REACTION_SET = ["❤️", "😂", "🔥", "👏"] as const;
const PARTY_MOCK_COMMENTS = [
  { id: "mock-comment-1", username: "Mia", text: "This scene is wild 🔥" },
  { id: "mock-comment-2", username: "Noah", text: "Pause after this for theories" },
  { id: "mock-comment-3", username: "Ava", text: "Soundtrack is perfect here" },
] as const;
const PAN_SCRUB_SEEK_THROTTLE_MILLIS = 16;
const PAN_SCRUB_MIN_DRAG_PIXELS = 4;
const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2] as const;
const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TitleRow = {
  id: string;
  title: string;
  category?: string | null;
  year?: number | null;
  runtime?: string | null;
  synopsis?: string | null;
  poster_url?: string | null;
  thumbnail_url?: string | null;
  video_url?: string | null;
  video?: any;
};

const BASE_SELECT = "id,title,category,year,runtime,synopsis,poster_url,thumbnail_url,video_url";
const ADVANCED_SELECT = `${BASE_SELECT},status,is_published,release_at,release_date`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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

export default function PlayerScreen() {
  const { id, partyId: partyIdParam, liveMode: liveModeParam } = useLocalSearchParams<{
    id?: string;
    partyId?: string | string[];
    liveMode?: string | string[];
  }>();
  const partyId = Array.isArray(partyIdParam) ? String(partyIdParam[0] ?? "").trim() : String(partyIdParam ?? "").trim();
  const inWatchParty = !!partyId;
  const liveModeRaw = Array.isArray(liveModeParam)
    ? String(liveModeParam[0] ?? "").trim().toLowerCase()
    : String(liveModeParam ?? "").trim().toLowerCase();
  const isLiveModeFlag = liveModeRaw === "1" || liveModeRaw === "true" || liveModeRaw === "yes" || liveModeRaw === "live";
  let rawId = id;
  if (typeof rawId !== "string") rawId = String(rawId ?? "");
  const cleanId = rawId.replace(/["']/g, "").trim();

  console.log("PLAYER ID:", cleanId);

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
  const fallbackTitle = (titles[0] as any) ?? null;
  const fallbackVideo = getVideoSource(localTitle ?? fallbackTitle ?? {});

  const videoRef = useRef<Video>(null);
  const [item, setItem] = useState<TitleRow | null>(null);
  const [titleLoading, setTitleLoading] = useState(true);

  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationMillis, setDurationMillis] = useState(0);
  const [positionMillis, setPositionMillis] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [myListIds, setMyListIds] = useState<string[]>([]);
  const [myListBusy, setMyListBusy] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const [showUpNext, setShowUpNext] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState(UP_NEXT_COUNTDOWN_SECONDS);
  const [upNextCanceled, setUpNextCanceled] = useState(false);
  const [partySyncRole, setPartySyncRole] = useState<"host" | "guest" | null>(null);
  const [partySyncStatus, setPartySyncStatus] = useState<string | null>(null);
  const [partyViewerCount, setPartyViewerCount] = useState(0);
  const [viewerCount, setViewerCount] = useState(1);
  const [partyParticipantPreview, setPartyParticipantPreview] = useState<string[]>([]);
  const [partyChatOpen, setPartyChatOpen] = useState(false);
  const [partyMessages, setPartyMessages] = useState([
    { id: "1", text: "Host started the room" },
    { id: "2", text: "Welcome to the watch party" },
  ]);
  const [partyParticipants, setPartyParticipants] = useState<
    Array<{
      id: string;
      name: string;
      role: "host" | "viewer";
      avatarUrl?: string;
      muted: boolean;
      canSpeak: boolean;
      isSpeaking: boolean;
      isRequestingToSpeak: boolean;
    }>
  >([
    {
      id: "p1",
      name: "Kai",
      role: "host",
      avatarUrl: "https://i.pravatar.cc/120?img=12",
      muted: false,
      canSpeak: true,
      isSpeaking: true,
      isRequestingToSpeak: false,
    },
    {
      id: "p2",
      name: "Mia",
      role: "viewer",
      avatarUrl: "https://i.pravatar.cc/120?img=32",
      muted: true,
      canSpeak: false,
      isSpeaking: false,
      isRequestingToSpeak: false,
    },
    { id: "p3", name: "Noah", role: "viewer", muted: false, canSpeak: true, isSpeaking: false, isRequestingToSpeak: false },
    { id: "p4", name: "Ava", role: "viewer", muted: false, canSpeak: false, isSpeaking: false, isRequestingToSpeak: false },
  ]);
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null);
  const [activeParticipantIds, setActiveParticipantIds] = useState<string[]>([]);
  const [partyCommentsOpen, setPartyCommentsOpen] = useState(false);
  const [partyCommentDraft, setPartyCommentDraft] = useState("");
  const [partyComments, setPartyComments] = useState<Array<{ id: string; username: string; text: string }>>(() =>
    PARTY_MOCK_COMMENTS.map((entry) => ({ ...entry })),
  );
  const [partyOverlayMessages, setPartyOverlayMessages] = useState<Array<{ id: string; author: string; body: string }>>([]);
  const [partyReactionBursts, setPartyReactionBursts] = useState<Array<{ id: string; emoji: string }>>([]);
  const [partyLocalReactions, setPartyLocalReactions] = useState<Array<{ id: string; emoji: string; rightOffset: number }>>([]);
  const [partyParticipantReactions, setPartyParticipantReactions] = useState<
    Array<{ id: string; participantId: string; participantName: string; emoji: string; isSpeaking: boolean; createdAt: number }>
  >([]);
  const [partyTapReactionTick, setPartyTapReactionTick] = useState(0);
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
  const previousParticipantsRef = useRef<Array<{ id: string; name: string; isSpeaking: boolean }>>([]);
  const suppressNextSpeakingEventRef = useRef<Record<string, "start" | "stop" | undefined>>({});
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

  const zoomScale = useRef(new Animated.Value(1)).current;
  const zoomScaleValueRef = useRef(1);
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
    () => String(item?.id ?? (localTitle as any)?.id ?? (fallbackTitle as any)?.id ?? cleanId).trim(),
    [item?.id, localTitle, fallbackTitle, cleanId],
  );
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
    let active = true;

    const loadTitle = async () => {
      const routeId = cleanId || String((localTitle as any)?.id ?? (fallbackTitle as any)?.id ?? "").trim();
      setTitleLoading(true);
      setItem(null);

      if (!routeId) {
        if ((localTitle || fallbackTitle) && active) {
          const chosen = (localTitle ?? fallbackTitle) as any;
          console.log("PLAYER MATCH SOURCE: matched from", localTitle ? localMatchSource : "local:fallback:first-title");
          setItem({
            id: String(chosen.id),
            title: String(chosen.title),
            runtime: chosen.runtime,
            synopsis: chosen.description,
            category: chosen.genre,
            video: chosen.video,
          });
        }
        setTitleLoading(false);
        return;
      }

      try {
        const primary = await supabase
          .from("titles")
          .select(ADVANCED_SELECT)
          .eq("id", routeId)
          .maybeSingle();

        if (primary.data && !primary.error) {
          if (active) {
            console.log("PLAYER MATCH SOURCE: matched from", "db:advanced:id");
            setItem(primary.data as TitleRow);
            setTitleLoading(false);
          }
          return;
        }

        const fallback = await supabase
          .from("titles")
          .select(BASE_SELECT)
          .eq("id", routeId)
          .maybeSingle();

        if (fallback.data && !fallback.error) {
          if (active) {
            console.log("PLAYER MATCH SOURCE: matched from", "db:base:id");
            setItem(fallback.data as TitleRow);
            setTitleLoading(false);
          }
          return;
        }

        if ((localTitle || fallbackTitle) && active) {
          const chosen = (localTitle ?? fallbackTitle) as any;
          console.log("PLAYER MATCH SOURCE: matched from", localTitle ? localMatchSource : "local:fallback:first-title");
          setItem({
            id: String(chosen.id),
            title: String(chosen.title),
            runtime: chosen.runtime,
            synopsis: chosen.description,
            category: chosen.genre,
            video: chosen.video,
          });
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
          if (localTitle || fallbackTitle) {
            const chosen = (localTitle ?? fallbackTitle) as any;
            console.log("PLAYER MATCH SOURCE: matched from", localTitle ? localMatchSource : "local:fallback:first-title");
            setItem({
              id: String(chosen.id),
              title: String(chosen.title),
              runtime: chosen.runtime,
              synopsis: chosen.description,
              category: chosen.genre,
              video: chosen.video,
            });
          }
          setTitleLoading(false);
        }
      }
    };

    loadTitle();

    return () => {
      active = false;
    };
  }, [cleanId, localMatchSource, localTitle, fallbackTitle]);

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
        return;
      }

      try {
        const merged = await readMergedWatchProgress();
        if (!active) return;
        resumePositionRef.current = Math.max(0, merged[titleId]?.positionMillis ?? 0);
      } catch {
        if (!active) return;
        resumePositionRef.current = 0;
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
    if (!inWatchParty || !partyId) {
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
      const currentUserId = await getSafePartyUserId().catch(() => "");
      if (!active) return;
      partySyncUserIdRef.current = currentUserId || null;

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
  }, [applyPartyRoomStateToGuest, inWatchParty, partyId]);

  useEffect(() => {
    if (!inWatchParty || !partyId) {
      setPartyViewerCount(0);
      setPartyParticipantPreview([]);
      setPartyChatOpen(false);
      setPartyOverlayMessages([]);
      setPartyReactionBursts([]);
      Object.values(partyReactionTimersRef.current).forEach((timer) => clearTimeout(timer));
      partyReactionTimersRef.current = {};
      if (partySocialChannelRef.current) {
        supabase.removeChannel(partySocialChannelRef.current);
        partySocialChannelRef.current = null;
      }
      return;
    }

    let active = true;

    const pushOverlayMessage = (msg: { id: string; author: string; body: string }) => {
      setPartyOverlayMessages((prev) => [...prev.slice(-11), msg]);
    };

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
      const userId = (partySyncUserIdRef.current || (await getSafePartyUserId().catch(() => "")) || `anon-${Date.now()}`).trim();
      if (!active) return;

      const history = await fetchPartyMessages(partyId, 30).catch(() => []);
      if (!active) return;
      const chatHistory = history
        .filter((m) => m.kind === "chat")
        .slice(-8)
        .map((m) => ({
          id: m.id,
          author: m.userId === userId ? "You" : `User·${String(m.userId).slice(-4)}`,
          body: String(m.body ?? ""),
        }));
      setPartyOverlayMessages(chatHistory);

      if (partySocialChannelRef.current) {
        supabase.removeChannel(partySocialChannelRef.current);
        partySocialChannelRef.current = null;
      }

      const channel = supabase.channel(`party-chat-${partyId}`, {
        config: { presence: { key: userId || `anon-${Date.now()}` } },
      });

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ displayName?: string }>();
        const entries = Object.entries(state);
        setPartyViewerCount(entries.length);
        const preview = entries
          .slice(0, 3)
          .map(([key, presArr]) => {
            const first = Array.isArray(presArr) ? (presArr[0] as { displayName?: string }) : undefined;
            return String(first?.displayName ?? `User·${key.slice(-4)}`);
          });
        setPartyParticipantPreview(preview);
      });

      channel.on("broadcast", { event: "reaction" }, ({ payload }: { payload: Record<string, unknown> }) => {
        pushReactionBurst(payload?.emoji);
      });

      channel.on("broadcast", { event: "message" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const kind = payload?.kind;
        if (kind !== "chat") return;
        const body = String(payload?.body ?? "").trim();
        if (!body) return;
        const authorLabel = String(payload?.authorLabel ?? "User");
        pushOverlayMessage({
          id: String(payload?.id ?? `party-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
          author: authorLabel,
          body,
        });
      });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            role: partySyncRoleRef.current === "host" ? "host" : "viewer",
            displayName: partySyncRoleRef.current === "host" ? "Host" : `Viewer·${userId.slice(-4)}`,
          });
        }
      });

      partySocialChannelRef.current = channel;
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
  }, [inWatchParty, partyId]);

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

    if (!isPlaying) {
      setControlsVisible(true);
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
  }, [controlsVisible, isPlaying]);

  useEffect(() => {
    if (!inWatchParty) {
      partyOverlayControlsOpacity.setValue(1);
      partyOverlayControlsTranslateY.setValue(0);
      partyPresenceOpacity.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.timing(partyOverlayControlsOpacity, {
        toValue: controlsVisible ? 1 : 0,
        duration: controlsVisible ? 180 : 280,
        easing: controlsVisible ? Easing.out(Easing.cubic) : Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(partyOverlayControlsTranslateY, {
        toValue: controlsVisible ? 0 : 8,
        duration: controlsVisible ? 180 : 280,
        easing: controlsVisible ? Easing.out(Easing.cubic) : Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(partyPresenceOpacity, {
      toValue: controlsVisible ? 1 : 0.4,
      duration: controlsVisible ? 180 : 280,
      easing: controlsVisible ? Easing.out(Easing.cubic) : Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [controlsVisible, inWatchParty, partyOverlayControlsOpacity, partyOverlayControlsTranslateY, partyPresenceOpacity]);

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

  const applySeekDelta = useCallback(
    async (deltaMillis: number) => {
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
    },
    [persistProgress, showSeekFeedback],
  );

  const animateZoomTo = useCallback(
    (next: number) => {
      Animated.timing(zoomScale, {
        toValue: clamp(next, MIN_ZOOM, MAX_ZOOM),
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [zoomScale],
  );

  const resetAutoHideTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }

    if (isPlaying && controlsVisible) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
        hideControlsTimeoutRef.current = null;
      }, CONTROLS_AUTO_HIDE_MILLIS);
    }
  }, [controlsVisible, isPlaying]);

  const handleSingleTap = useCallback(() => {
    setControlsVisible((value) => !value);

    if (!isVideoReady) return;
    if (shouldAutoplayNextRef.current && nextTitleId) return;
    if (inWatchParty) setPartyTapReactionTick((value) => value + 1);

    const reachedEnd =
      didJustFinishRef.current ||
      (durationRef.current > 0 && currentPositionRef.current >= durationRef.current - 1500);

    if (reachedEnd) {
      videoRef.current
        ?.setPositionAsync(0)
        .then(() => videoRef.current?.playAsync())
        .then(() => {
          didJustFinishRef.current = false;
          currentPositionRef.current = 0;
          setPositionMillis(0);
          setIsPlaying(true);
          if (titleId) writeProgressForTitle(titleId, 0, durationRef.current || undefined).catch(() => {});
        })
        .catch(() => {});
      return;
    }

    if (isPlaying) {
      videoRef.current?.pauseAsync().catch(() => {});
    } else {
      videoRef.current?.playAsync().catch(() => {});
    }
  }, [inWatchParty, isPlaying, isVideoReady, nextTitleId, titleId]);

  const resetGestureState = useCallback(() => {
    swipeLastAppliedStepRef.current = 0;
    pinchStartDistanceRef.current = null;
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (event, gestureState) => {
          return event.nativeEvent.touches.length >= 2 || Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
        },
        onPanResponderGrant: () => {
          resetAutoHideTimer();
          swipeLastAppliedStepRef.current = 0;
          pinchStartDistanceRef.current = null;
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

            if (!pinchStartDistanceRef.current) {
              pinchStartDistanceRef.current = distance;
              pinchStartScaleRef.current = zoomScaleValueRef.current;
              return;
            }

            const ratio = distance / pinchStartDistanceRef.current;
            const nextScale = clamp(pinchStartScaleRef.current * ratio, MIN_ZOOM, MAX_ZOOM);
            zoomScale.setValue(nextScale);
            return;
          }

          pinchStartDistanceRef.current = null;
          const duration = durationRef.current;
          if (duration <= 0) return;
          if (Math.abs(gestureState.dx) < PAN_SCRUB_MIN_DRAG_PIXELS) return;
          if (Math.abs(gestureState.dx) < Math.abs(gestureState.dy)) return;

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
                  return videoRef.current?.playAsync();
                }
              })
              .catch(() => {});

            panIsScrubbingRef.current = false;
            panWasPlayingBeforeScrubRef.current = false;

            if (zoomScaleValueRef.current <= 1.05) {
              animateZoomTo(1);
            }
            resetGestureState();
            return;
          }

          const isTap = Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10;

          if (isTap && isVideoReady) {
            const now = Date.now();
            const isDoubleTap = now - lastTapRef.current <= 250;

            if (isDoubleTap) {
              if (singleTapTimeoutRef.current) {
                clearTimeout(singleTapTimeoutRef.current);
                singleTapTimeoutRef.current = null;
              }

              lastTapRef.current = 0;
              const half = (videoWidthRef.current || 1) / 2;
              const isLeftSide = event.nativeEvent.locationX <= half;
              applySeekDelta(isLeftSide ? -STEP_MILLIS : STEP_MILLIS).catch(() => {});
            } else {
              lastTapRef.current = now;
              singleTapTimeoutRef.current = setTimeout(() => {
                singleTapTimeoutRef.current = null;
                handleSingleTap();
              }, 250);
            }
          }

          if (zoomScaleValueRef.current <= 1.05) {
            animateZoomTo(1);
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
                  return videoRef.current?.playAsync();
                }
              })
              .catch(() => {});

            panIsScrubbingRef.current = false;
            panWasPlayingBeforeScrubRef.current = false;
          }

          if (zoomScaleValueRef.current <= 1.05) {
            animateZoomTo(1);
          }
          resetGestureState();
        },
      }),
    [
      animateZoomTo,
      applySeekDelta,
      handleSingleTap,
      isPlaying,
      isVideoReady,
      persistProgress,
      resetAutoHideTimer,
      resetGestureState,
      zoomScale,
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
          wasPlayingBeforeScrubRef.current = isPlaying;
          if (isPlaying) await videoRef.current?.pauseAsync().catch(() => {});
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          resetAutoHideTimer();
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
          try {
            await videoRef.current?.setPositionAsync(currentPositionRef.current);
            persistProgress(currentPositionRef.current, durationRef.current);
            if (wasPlayingBeforeScrubRef.current) await videoRef.current?.playAsync();
          } catch {
            // ignore errors on seek
          }
        },
        onPanResponderTerminate: async () => {
          resetAutoHideTimer();
          try {
            await videoRef.current?.setPositionAsync(currentPositionRef.current);
            persistProgress(currentPositionRef.current, durationRef.current);
            if (wasPlayingBeforeScrubRef.current) await videoRef.current?.playAsync();
          } catch {
            // ignore errors on seek
          }
        },
      }),
    [isPlaying, persistProgress, resetAutoHideTimer],
  );

  const navigateToNext = useCallback(() => {
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
  }, [nextTitleId]);

  const startUpNextCountdown = useCallback(() => {
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
  }, [navigateToNext, nextTitleId, upNextCanceled]);

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
        setIsPlaying(false);
        return;
      }

      const duration = status.durationMillis ?? 0;
      const position = status.positionMillis ?? 0;
      durationRef.current = duration;
      currentPositionRef.current = position;
      setDurationMillis(duration);
      setPositionMillis(position);
      setIsPlaying(status.isPlaying);

      const wasPlaying = lastPlaybackIsPlayingRef.current;
      lastPlaybackIsPlayingRef.current = status.isPlaying;

      if (inWatchParty && partyId && partySyncRoleRef.current === "host" && !partySyncApplyingRef.current) {
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

      if (duration > 0 && position < duration - 1500) {
        didJustFinishRef.current = false;
      }

      const remainingMillis = duration > 0 ? Math.max(0, duration - position) : 0;
      const shouldShowUpNext =
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

        if (nextTitleId) {
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
    [inWatchParty, navigateToNext, nextTitleId, partyId, persistProgress, startUpNextCountdown, titleId, upNextCanceled],
  );

  const onVideoLoad = useCallback(
    async (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

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
        await videoRef.current?.setPositionAsync(startAt);
        currentPositionRef.current = startAt;
        setPositionMillis(startAt);
        lastPersistedPositionRef.current = startAt;
      } else {
        lastPersistedPositionRef.current = 0;
      }

      await videoRef.current?.setRateAsync(playbackRate, true);
    },
    [playbackRate],
  );

  const togglePlayPause = useCallback(async () => {
    if (!isVideoReady) return;

    try {
      if (isPlaying) {
        await videoRef.current?.pauseAsync();
        persistProgress(currentPositionRef.current, durationRef.current);
      } else {
        await videoRef.current?.playAsync();
      }
    } catch {
      // ignore transient player errors
    }
  }, [isPlaying, isVideoReady, persistProgress]);

  const replayFromStart = useCallback(async () => {
    try {
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
  }, [titleId]);

  const onToggleMyList = useCallback(async () => {
    if (!titleId || myListBusy) return;

    setMyListBusy(true);
    try {
      const ids = await toggleMyListTitle(titleId, {
        title: item?.title,
        posterUrl: item?.poster_url ?? undefined,
        thumbnailUrl: item?.thumbnail_url ?? undefined,
      });
      setMyListIds(ids);
    } finally {
      setMyListBusy(false);
    }
  }, [item?.poster_url, item?.thumbnail_url, item?.title, myListBusy, titleId]);

  const onWatchParty = useCallback(async () => {
    if (!titleId) {
      console.log("WATCH PARTY: missing titleId, fallback to /watch-party");
      router.push("/watch-party");
      return;
    }

    try {
      const hostUserId = await getSafePartyUserId();
      const preferredRawId = String(item?.id ?? "").trim();
      const fallbackRawId = String(titleId ?? "").trim();

      let createTitleId = preferredRawId || fallbackRawId;

      if (!UUID_LIKE_REGEX.test(createTitleId)) {
        const titleNameCandidate = String(item?.title ?? (localTitle as any)?.title ?? (fallbackTitle as any)?.title ?? "").trim();
        if (titleNameCandidate) {
          try {
            const byName = await supabase
              .from("titles")
              .select("id")
              .eq("title", titleNameCandidate)
              .maybeSingle();

            const dbTitleId = String(byName.data?.id ?? "").trim();
            if (dbTitleId) createTitleId = dbTitleId;
          } catch {
            // keep existing createTitleId
          }
        }
      }

      console.log("WATCH PARTY: creating room", {
        titleId: createTitleId,
        hostUserId,
        positionMillis: currentPositionRef.current,
        playbackState: isPlaying ? "playing" : "paused",
      });

      const room = await createPartyRoom(createTitleId, hostUserId, currentPositionRef.current, isPlaying ? "playing" : "paused");
      console.log("WATCH PARTY: createPartyRoom returned", room);

      if (room && "partyId" in room && room.partyId) {
        const navParams = {
          roomId: room.partyId,
          roomCode: room.roomCode,
          titleId: room.titleId || createTitleId,
        };
        console.log("WATCH PARTY: navigating with params", navParams);
        router.push({ pathname: "/watch-party", params: navParams });
        return;
      }
    } catch {
      // fallback navigation below
    }

    console.log("WATCH PARTY: room creation failed, fallback to /watch-party");
    router.push("/watch-party");
  }, [isPlaying, titleId, item?.title, localTitle, fallbackTitle]);

  const onSelectRate = useCallback(async (rate: number) => {
    resetAutoHideTimer();
    setPlaybackRate(rate);
    setSpeedMenuOpen(false);
    try {
      await videoRef.current?.setRateAsync(rate, true);
    } catch {
      // ignore unsupported rate transitions
    }
  }, [resetAutoHideTimer]);

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
    if (!inWatchParty || partyTapReactionTick === 0) return;
    const emoji = PARTY_LOCAL_REACTION_SET[Math.floor(Math.random() * PARTY_LOCAL_REACTION_SET.length)];
    triggerLocalPartyReaction(emoji);
  }, [inWatchParty, partyTapReactionTick, triggerLocalPartyReaction]);

  useEffect(() => {
    const interval = setInterval(() => {
      setViewerCount((v) => v + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const onSendPartyComment = useCallback(() => {
    const text = partyCommentDraft.trim();
    if (!text) return;

    const participantId =
      activeParticipantId ?? partyParticipants.find((entry) => entry.role === "host")?.id ?? partyParticipants[0]?.id ?? "";
    if (participantId) markParticipantActive(participantId, 2300);

    const id = `local-comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPartyComments((prev) => [...prev, { id, username: "You", text }]);
    bumpRoomEnergy(0.09);
    setPartyCommentDraft("");
  }, [activeParticipantId, bumpRoomEnergy, markParticipantActive, partyCommentDraft, partyParticipants]);

  const progressPercent = useMemo(() => {
    if (!durationMillis || durationMillis <= 0) return 0;
    return clamp((positionMillis / durationMillis) * 100, 0, 100);
  }, [durationMillis, positionMillis]);

  const participantPulseScale = participantActivityPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12 + roomEnergy * 0.14],
  });
  const participantPulseOpacity = participantActivityPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.26 + roomEnergy * 0.18, 0.03 + roomEnergy * 0.05],
  });
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
  const primaryActiveParticipantIds = useMemo(() => {
    const merged = [...speakingParticipantIds, ...activeParticipantIds.filter((id) => !speakingParticipantIds.includes(id))];
    return merged.slice(0, 2);
  }, [activeParticipantIds, speakingParticipantIds]);
  const orderedPartyParticipants = useMemo(() => {
    if (primaryActiveParticipantIds.length === 0) return partyParticipants;
    const activeIdSet = new Set(primaryActiveParticipantIds);
    const active = partyParticipants.filter((participant) => activeIdSet.has(participant.id));
    const inactive = partyParticipants.filter((participant) => !activeIdSet.has(participant.id));
    return [...active, ...inactive];
  }, [partyParticipants, primaryActiveParticipantIds]);
  const localParticipantId = useMemo(() => {
    if (partySyncRole === "host") {
      return partyParticipants.find((participant) => participant.role === "host")?.id ?? "";
    }
    return partyParticipants.find((participant) => participant.role === "viewer")?.id ?? "";
  }, [partyParticipants, partySyncRole]);
  const livePrimarySpeakers = useMemo(
    () => orderedPartyParticipants.filter((participant) => participant.isSpeaking && participant.canSpeak).slice(0, 2),
    [orderedPartyParticipants],
  );
  const liveSpeakingLabel = useMemo(() => {
    if (livePrimarySpeakers.length === 0) return "🎤 Listening Room";
    if (livePrimarySpeakers.length === 1) return `🎤 ${livePrimarySpeakers[0].name} speaking`;
    return `🎤 ${livePrimarySpeakers[0].name} +1 speaking`;
  }, [livePrimarySpeakers]);

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
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
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
      .slice(0, 2);
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
    if (!inWatchParty || !entryBoostActive) return;

    const interval = setInterval(() => {
      if (partyParticipants.length === 0) return;
      const pool = partyParticipants.filter((participant) => participant.canSpeak || participant.isSpeaking);
      const chosen = (pool.length > 0 ? pool : partyParticipants)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : partyParticipants.length))];
      if (!chosen) return;

      const emoji = PARTY_LOCAL_REACTION_SET[Math.floor(Math.random() * PARTY_LOCAL_REACTION_SET.length)];
      triggerParticipantLinkedReaction(chosen.id, chosen.name, emoji, !!(chosen.isSpeaking && chosen.canSpeak), false);
    }, 820);

    return () => clearInterval(interval);
  }, [entryBoostActive, inWatchParty, partyParticipants, triggerParticipantLinkedReaction]);

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
    if (!localTitle && !fallbackTitle) return null;

    const chosen = (localTitle ?? fallbackTitle) as any;

    return {
      id: String(chosen.id ?? ""),
      title: String(chosen.title ?? "Now Playing"),
      runtime: chosen.runtime,
      synopsis: chosen.description,
      category: chosen.genre,
      video: chosen.video,
    };
  }, [item, localTitle, fallbackTitle]);

  const source = useMemo(() => {
    if (displayItem?.video_url && displayItem.video_url.trim()) return { uri: displayItem.video_url.trim() };
    return displayItem?.video || fallbackVideo;
  }, [displayItem?.video, displayItem?.video_url, fallbackVideo]);
  const isLiveMode = inWatchParty && (isLiveModeFlag || !source);

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
          eventText = startedSpeaking.id === localParticipantId ? "🎤 You are now speaking" : `🎤 ${startedSpeaking.name} started speaking`;
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
          eventText = stoppedSpeaking.id === localParticipantId ? "🔇 You are muted" : `🔇 ${stoppedSpeaking.name} stopped speaking`;
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
    localParticipantId,
    markParticipantActive,
    partyParticipants,
    bumpRoomEnergy,
    showLivePresenceEvent,
    triggerParticipantReactionBoost,
  ]);

  const renderParticipantPanel = (liveLayout = false) => (
    <View style={[styles.partyFeedCard, liveLayout && styles.partyFeedCardLive]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.participantBubbleScroll, liveLayout && styles.participantBubbleScrollLive]}
      >
        {orderedPartyParticipants.map((participant) => {
          const isHost = partySyncRole === "host";
          const isExpanded = isHost && activeParticipantId === participant.id;
          const isSpeaking = participant.isSpeaking && participant.canSpeak;
          const isActive = primaryActiveParticipantIds.includes(participant.id);
          const isRequesting = participant.isRequestingToSpeak && !participant.canSpeak;
          const shouldDim = primaryActiveParticipantIds.length > 0 && !isActive;
          const isReactionBoosted = participantReactionBoostIds.includes(participant.id);
          const participantReactions = partyParticipantReactions
            .filter((entry) => entry.participantId === participant.id)
            .slice(-2);
          const voiceLevel = participantVoiceLevelMapRef.current[participant.id] ?? new Animated.Value(0);
          const focusScale = participantFocusScaleMapRef.current[participant.id] ?? 1;
          const focusOpacity = participantFocusOpacityMapRef.current[participant.id] ?? 1;
          const idleScale = !isSpeaking ? (participantIdleScaleMapRef.current[participant.id] ?? 1) : 1;
          const idleTranslateX = !isSpeaking ? (participantIdleTranslateXMapRef.current[participant.id] ?? 0) : 0;
          const pressScale = participantPressScaleMapRef.current[participant.id] ?? 1;
          const joinScale = participantJoinScaleMapRef.current[participant.id] ?? 1;
          const isOnlineActive = isSpeaking || isActive;
          const initials = participant.name
            .split(" ")
            .map((part) => part[0] ?? "")
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <Animated.View
              key={participant.id}
              style={[
                styles.participantBubbleItem,
                liveLayout && styles.participantBubbleItemLive,
                isSpeaking && styles.participantBubbleSpeaking,
                isActive && styles.participantBubbleActive,
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
                style={styles.partyParticipantBubbleTap}
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
                  markParticipantActive(participant.id, 2400);
                  bumpRoomEnergy(0.03);
                  if (!isHost && participant.id === localParticipantId && !participant.canSpeak) {
                    setPartyParticipants((prev) =>
                      prev.map((entry) =>
                        entry.id === participant.id ? { ...entry, isRequestingToSpeak: true } : entry,
                      ),
                    );
                  }
                  if (!isHost) return;
                  setActiveParticipantId((current) => (current === participant.id ? null : participant.id));
                }}
                activeOpacity={0.85}
              >
                <View style={styles.partyParticipantAvatarWrap}>
                  {isActive ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.participantActivePulse,
                        isSpeaking && styles.participantSpeakingPulse,
                        isSpeaking && {
                          opacity: voiceLevel.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.14, 0.5],
                          }),
                          transform: [
                            {
                              scale: voiceLevel.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1.02, 1.16],
                              }),
                            },
                          ],
                        },
                        {
                          opacity: participantPulseOpacity,
                          transform: [{ scale: participantPulseScale }],
                        },
                      ]}
                    />
                  ) : null}
                  <View
                    style={[
                      styles.participantAvatar,
                      liveLayout && styles.participantAvatarLive,
                      participant.muted && styles.participantAvatarMuted,
                    ]}
                  >
                    {participant.avatarUrl ? (
                      <Image source={{ uri: participant.avatarUrl }} style={styles.participantAvatarImage} />
                    ) : (
                      <Text style={[styles.participantInitials, liveLayout && styles.participantInitialsLive]}>{initials}</Text>
                    )}
                  </View>
                  {isActive ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.participantActiveRing,
                        isSpeaking && styles.participantSpeakingRing,
                        isReactionBoosted && styles.participantReactionBoostRing,
                        isSpeaking && {
                          borderWidth: voiceLevel.interpolate({ inputRange: [0, 1], outputRange: [2.4 + roomEnergy * 0.8, 4.6 + roomEnergy * 1.2] }),
                          opacity: voiceLevel.interpolate({ inputRange: [0, 1], outputRange: [0.72 + roomEnergy * 0.18, 1] }),
                          transform: [
                            {
                              scale: voiceLevel.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07 + roomEnergy * 0.05] }),
                            },
                          ],
                        },
                      ]}
                    />
                  ) : null}
                  {isRequesting ? <View pointerEvents="none" style={styles.participantRequestRing} /> : null}
                  <View style={[styles.participantPresenceDot, isOnlineActive ? styles.participantPresenceDotActive : styles.participantPresenceDotIdle]} />
                  {isSpeaking ? (
                    <View style={styles.participantSpeakingBadge}>
                      <Text style={styles.participantSpeakingBadgeText}>LIVE</Text>
                    </View>
                  ) : null}
                  {participant.role === "host" ? (
                    <View style={styles.participantHostBadge}>
                      <Text style={styles.participantHostBadgeText}>HOST</Text>
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
                        reaction.isSpeaking && styles.participantLinkedReactionSpeaking,
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
                      <Text style={[styles.participantLinkedReactionText, reaction.isSpeaking && styles.participantLinkedReactionTextSpeaking]}>
                        {reaction.emoji}
                      </Text>
                    </Animated.View>
                  ))}
                </View>
                <Text style={[styles.participantName, liveLayout && styles.participantNameLive]} numberOfLines={1}>
                  {participant.name}
                </Text>
                <Text style={styles.partyParticipantStatus}>
                  {isSpeaking ? "🎤 Speaking" : isRequesting ? "✋ Requesting" : participant.muted ? "🔇 Muted" : "🔊 Live"}
                </Text>
              </TouchableOpacity>

              {isExpanded ? (
                <View style={styles.participantExpandedControls}>
                  {isRequesting ? (
                    <>
                      <TouchableOpacity
                        style={styles.partyParticipantControlBtn}
                        onPress={() => {
                          suppressNextSpeakingEventRef.current[participant.id] = "start";
                          setPartyParticipants((prev) => {
                            let nextParticipants = prev.map((entry) =>
                              entry.id === participant.id
                                ? { ...entry, canSpeak: true, isSpeaking: true, isRequestingToSpeak: false }
                                : entry,
                            );

                            speakingOrderRef.current = [
                              ...speakingOrderRef.current.filter((id) => id !== participant.id),
                              participant.id,
                            ];

                            const currentlySpeakingIds = nextParticipants
                              .filter((entry) => entry.canSpeak && entry.isSpeaking)
                              .map((entry) => entry.id);

                            if (currentlySpeakingIds.length > 2) {
                              const orderedSpeaking = speakingOrderRef.current.filter((id) => currentlySpeakingIds.includes(id));
                              const toDropCount = orderedSpeaking.length - 2;
                              const dropIds = new Set(orderedSpeaking.slice(0, toDropCount));

                              nextParticipants = nextParticipants.map((entry) =>
                                dropIds.has(entry.id) ? { ...entry, isSpeaking: false } : entry,
                              );
                              speakingOrderRef.current = orderedSpeaking.slice(toDropCount);
                            }

                            return nextParticipants;
                          });
                          showLivePresenceEvent(`✅ ${participant.name} is now allowed to speak`);
                          bumpRoomEnergy(0.11);
                          markParticipantActive(participant.id, 2400);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.partyParticipantControlBtnText}>Approve</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.partyParticipantControlBtn}
                        onPress={() => {
                          setPartyParticipants((prev) =>
                            prev.map((entry) =>
                              entry.id === participant.id ? { ...entry, isRequestingToSpeak: false } : entry,
                            ),
                          );
                          showLivePresenceEvent(`❌ ${participant.name} request denied`);
                          bumpRoomEnergy(0.04);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.partyParticipantControlBtnText}>Deny</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}

                  <TouchableOpacity
                    style={styles.partyParticipantControlBtn}
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

                        if (currentlySpeakingIds.length > 2) {
                          const orderedSpeaking = speakingOrderRef.current.filter((id) => currentlySpeakingIds.includes(id));
                          const toDropCount = orderedSpeaking.length - 2;
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
                    style={styles.partyParticipantControlBtn}
                    onPress={() => {
                      setPartyParticipants((prev) =>
                        prev.map((entry) => {
                          if (entry.id !== participant.id) return entry;
                          const nextCanSpeak = !entry.canSpeak;
                          return {
                            ...entry,
                            canSpeak: nextCanSpeak,
                            isSpeaking: nextCanSpeak ? entry.isSpeaking : false,
                            isRequestingToSpeak: nextCanSpeak ? false : entry.isRequestingToSpeak,
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
                    <Text style={styles.partyParticipantControlBtnText}>{participant.canSpeak ? "Revoke Mic" : "Grant Mic"}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.partyParticipantControlBtn}
                    onPress={() => {
                      setPartyParticipants((prev) =>
                        prev.map((entry) =>
                          entry.id === participant.id ? { ...entry, muted: !entry.muted } : entry,
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
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );

  useEffect(() => {
    const sourceLabel = source
      ? typeof source === "number"
        ? "bundle:require"
        : typeof source === "object" && source && "uri" in source
          ? `remote:${String((source as { uri?: unknown }).uri ?? "")}`
          : "object:unknown"
      : "none";
    console.log("PLAYER VIDEO SOURCE:", sourceLabel);
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <Text style={styles.kicker}>CHILLYWOOD · PLAYER</Text>
          <Text style={styles.header}>{displayItem?.title ?? "Now Playing"}</Text>
          {inWatchParty && isLiveMode ? <Text style={styles.liveModeTopLabel}>LIVE SESSION</Text> : null}
          {inWatchParty && partySyncRole ? (
            <View style={styles.partySyncPill}>
              <Text style={styles.partySyncPillText}>
                {partySyncRole === "host" ? "Host" : "Guest"}
                {partySyncStatus ? ` · ${partySyncStatus}` : ""}
              </Text>
            </View>
          ) : null}
        </View>

        {isLiveMode ? (
          <View style={[styles.videoWrap, styles.liveRoomWrap]}>
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
              <View style={[styles.liveSpeakerStage, livePrimarySpeakers.length === 1 ? styles.liveSpeakerStageSolo : styles.liveSpeakerStageDual]}>
                {livePrimarySpeakers.map((participant) => {
                  const isSpeaking = participant.isSpeaking && participant.canSpeak;
                  const isActive = primaryActiveParticipantIds.includes(participant.id);
                  const isRequesting = participant.isRequestingToSpeak && !participant.canSpeak;
                  const isReactionBoosted = participantReactionBoostIds.includes(participant.id);
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
                    .map((part) => part[0] ?? "")
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <Animated.View
                      key={`live-focused-${participant.id}`}
                      style={{ opacity: focusOpacity, transform: [{ scale: focusScale }, { scale: joinScale }, { scale: pressScale }] }}
                    >
                      <TouchableOpacity
                        style={[styles.liveSpeakerCard, livePrimarySpeakers.length === 1 ? styles.liveSpeakerCardSolo : styles.liveSpeakerCardDual]}
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
                          const isHost = partySyncRole === "host";
                          markParticipantActive(participant.id, 2400);
                          bumpRoomEnergy(0.03);
                          if (!isHost && participant.id === localParticipantId && !participant.canSpeak) {
                            setPartyParticipants((prev) =>
                              prev.map((entry) =>
                                entry.id === participant.id ? { ...entry, isRequestingToSpeak: true } : entry,
                              ),
                            );
                          }
                          if (!isHost) return;
                          setActiveParticipantId((current) => (current === participant.id ? null : participant.id));
                        }}
                        activeOpacity={0.9}
                      >
                        <View style={styles.liveSpeakerAvatarWrap}>
                        {isActive ? (
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.participantActivePulse,
                              isSpeaking && styles.participantSpeakingPulse,
                              isSpeaking && {
                                opacity: voiceLevel.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.16, 0.56],
                                }),
                                transform: [
                                  {
                                    scale: voiceLevel.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [1.03, 1.19],
                                    }),
                                  },
                                ],
                              },
                              {
                                opacity: participantPulseOpacity,
                                transform: [{ scale: participantPulseScale }],
                              },
                            ]}
                          />
                        ) : null}
                        <View style={[styles.participantAvatar, styles.participantAvatarLive, styles.liveSpeakerAvatar, participant.muted && styles.participantAvatarMuted]}>
                          {participant.avatarUrl ? (
                            <Image source={{ uri: participant.avatarUrl }} style={styles.participantAvatarImage} />
                          ) : (
                            <Text style={[styles.participantInitials, styles.participantInitialsLive, styles.liveSpeakerInitials]}>{initials}</Text>
                          )}
                        </View>
                        {isActive ? (
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.participantActiveRing,
                              isSpeaking && styles.participantSpeakingRing,
                              styles.liveSpeakerRing,
                              isReactionBoosted && styles.participantReactionBoostRing,
                              isSpeaking && {
                                borderWidth: voiceLevel.interpolate({ inputRange: [0, 1], outputRange: [2.8 + roomEnergy * 0.9, 5.1 + roomEnergy * 1.3] }),
                                opacity: voiceLevel.interpolate({ inputRange: [0, 1], outputRange: [0.78 + roomEnergy * 0.16, 1] }),
                                transform: [
                                  {
                                    scale: voiceLevel.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09 + roomEnergy * 0.05] }),
                                  },
                                ],
                              },
                            ]}
                          />
                        ) : null}
                        {isSpeaking ? (
                          <View style={[styles.participantSpeakingBadge, styles.liveSpeakerBadge]}>
                            <Text style={styles.participantSpeakingBadgeText}>LIVE</Text>
                          </View>
                        ) : null}
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
                              reaction.isSpeaking && styles.participantLinkedReactionSpeaking,
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
                            <Text style={[styles.participantLinkedReactionText, reaction.isSpeaking && styles.participantLinkedReactionTextSpeaking]}>
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

            {livePresenceEvent ? (
              <View style={styles.livePresenceEventToast}>
                <Text style={styles.livePresenceEventText} numberOfLines={1}>
                  {livePresenceEvent}
                </Text>
              </View>
            ) : null}

            <View style={styles.liveModeParticipantsWrap}>{renderParticipantPanel(true)}</View>

            <View style={styles.liveModeActionRow}>
              <TouchableOpacity
                style={styles.partyOverlayChip}
                onPress={() => setPartyCommentsOpen((value) => !value)}
                activeOpacity={0.85}
              >
                <Text style={styles.partyOverlayChipText}>🗨️</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.partyOverlayChip}
                onPress={() => {
                  const emoji = PARTY_LOCAL_REACTION_SET[Math.floor(Math.random() * PARTY_LOCAL_REACTION_SET.length)];
                  triggerLocalPartyReaction(emoji);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.partyOverlayChipText}>🔥</Text>
              </TouchableOpacity>
            </View>

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

            {partyCommentsOpen ? (
              <View style={styles.partyCommentsDrawer}>
                <Text style={styles.partyCommentsDrawerTitle}>Comments</Text>
                <ScrollView style={styles.partyCommentsList} contentContainerStyle={styles.partyCommentsListContent}>
                  {partyComments.map((comment) => (
                    <Text key={comment.id} style={styles.partyCommentsLine}>
                      <Text style={styles.partyCommentsAuthor}>{comment.username}: </Text>
                      {comment.text}
                    </Text>
                  ))}
                </ScrollView>
                <View style={styles.partyCommentsInputRow}>
                  <TextInput
                    value={partyCommentDraft}
                    onChangeText={setPartyCommentDraft}
                    placeholder="Add a comment"
                    placeholderTextColor="#8B90A0"
                    style={styles.partyCommentsInput}
                    returnKeyType="send"
                    onSubmitEditing={onSendPartyComment}
                  />
                  <TouchableOpacity style={styles.partyCommentsSendBtn} onPress={onSendPartyComment} activeOpacity={0.85}>
                    <Text style={styles.partyCommentsSendBtnText}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ) : source ? (
          <View
            style={styles.videoWrap}
            {...panResponder.panHandlers}
            onLayout={(event) => {
              videoWidthRef.current = event.nativeEvent.layout.width;
            }}
          >
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
            <Animated.View style={[styles.videoAnimatedWrap, { transform: [{ scale: zoomScale }] }]}> 
              <Video
                ref={videoRef}
                source={source}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                isLooping={false}
                useNativeControls={false}
                onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                onLoad={onVideoLoad}
              />
            </Animated.View>

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

            {inWatchParty ? (
              <>
                <View style={styles.partyOverlayTopRow} pointerEvents="box-none">
                  <Animated.View style={[styles.partyPresencePill, { opacity: partyPresenceOpacity }]}> 
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

                  <Animated.View
                    pointerEvents={controlsVisible ? "auto" : "none"}
                    style={[
                      styles.partyOverlayActions,
                      {
                        opacity: partyOverlayControlsOpacity,
                        transform: [{ translateY: partyOverlayControlsTranslateY }],
                      },
                    ]}
                  >
                      <TouchableOpacity
                        style={[styles.partyOverlayChip, myListBusy && styles.secondaryBtnDisabled]}
                        onPress={onToggleMyList}
                        disabled={myListBusy}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.partyOverlayChipText}>{inMyList ? "✓ List" : "+ List"}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.partyOverlayChip}
                        onPress={() => setSpeedMenuOpen((value) => !value)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.partyOverlayChipText}>{playbackRate}x</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.partyOverlayChip}
                        onPress={() => setPartyCommentsOpen((value) => !value)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.partyOverlayChipText}>🗨️</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.partyOverlayChip}
                        onPress={() => {
                          const emoji = PARTY_LOCAL_REACTION_SET[Math.floor(Math.random() * PARTY_LOCAL_REACTION_SET.length)];
                          triggerLocalPartyReaction(emoji);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.partyOverlayChipText}>🔥</Text>
                      </TouchableOpacity>
                    </Animated.View>
                </View>

                {partyReactionBursts.length > 0 ? (
                  <View style={styles.partyReactionBurstWrap} pointerEvents="none">
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

                {partyChatOpen ? (
                  <View style={styles.partyChatDrawer}>
                    <Text style={styles.partyChatDrawerTitle}>Live Chat</Text>
                    <ScrollView
                      style={{ maxHeight: 140 }}
                      contentContainerStyle={{ paddingVertical: 8 }}
                      showsVerticalScrollIndicator={false}
                    >
                      {partyMessages.map((msg) => (
                        <Text key={msg.id} style={styles.partyMessageText}>
                          {msg.text}
                        </Text>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {partyCommentsOpen ? (
                  <View style={styles.partyCommentsDrawer}>
                    <Text style={styles.partyCommentsDrawerTitle}>Comments</Text>
                    <ScrollView style={styles.partyCommentsList} contentContainerStyle={styles.partyCommentsListContent}>
                      {partyComments.map((comment) => (
                        <Text key={comment.id} style={styles.partyCommentsLine}>
                          <Text style={styles.partyCommentsAuthor}>{comment.username}: </Text>
                          {comment.text}
                        </Text>
                      ))}
                    </ScrollView>
                    <View style={styles.partyCommentsInputRow}>
                      <TextInput
                        value={partyCommentDraft}
                        onChangeText={setPartyCommentDraft}
                        placeholder="Add a comment"
                        placeholderTextColor="#8B90A0"
                        style={styles.partyCommentsInput}
                        returnKeyType="send"
                        onSubmitEditing={onSendPartyComment}
                      />
                      <TouchableOpacity style={styles.partyCommentsSendBtn} onPress={onSendPartyComment} activeOpacity={0.85}>
                        <Text style={styles.partyCommentsSendBtnText}>Send</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.partyOverlayTopRow} pointerEvents="box-none">
                <View style={styles.partyOverlaySpacer} />
                <Animated.View
                  pointerEvents={controlsVisible ? "auto" : "none"}
                  style={[
                    styles.partyOverlayActions,
                    {
                      opacity: compactControlsOpacity,
                      transform: [{ translateY: compactControlsTranslateY }],
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={[styles.partyOverlayChip, myListBusy && styles.secondaryBtnDisabled]}
                    onPress={onToggleMyList}
                    disabled={myListBusy}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.partyOverlayChipText}>{inMyList ? "✓ List" : "+ List"}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.partyOverlayChip}
                    onPress={() => setSpeedMenuOpen((value) => !value)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.partyOverlayChipText}>{playbackRate}x</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.partyOverlayChip} onPress={onWatchParty} activeOpacity={0.85}>
                    <Text style={styles.partyOverlayChipText}>Watch Party</Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )}

            {controlsVisible && speedMenuOpen ? (
              <View style={styles.partySpeedOverlayMenu}>
                {SPEED_OPTIONS.map((option) => {
                  const active = playbackRate === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.partySpeedOverlayChip, active && styles.partySpeedOverlayChipActive]}
                      onPress={() => onSelectRate(option)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.partySpeedOverlayChipText, active && styles.partySpeedOverlayChipTextActive]}>{option}x</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={styles.text}>No video attached</Text>
        )}

        {!isLiveMode ? (
          <View style={styles.progressCard}>
            <View style={styles.progressMetaRow}>
              <Text style={styles.progressTime}>{formatTime(positionMillis)}</Text>
              <Text style={styles.progressTime}>{formatTime(durationMillis)}</Text>
            </View>
            <View
              style={styles.progressTrack}
              {...progressScrubResponder.panHandlers}
              onLayout={(event) => {
                progressTrackLayoutRef.current = { width: event.nativeEvent.layout.width };
              }}
            >
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
          </View>
        ) : null}

        {inWatchParty && !isLiveMode && livePresenceEvent ? (
          <View style={styles.livePresenceEventToast}>
            <Text style={styles.livePresenceEventText} numberOfLines={1}>
              {livePresenceEvent}
            </Text>
          </View>
        ) : null}

        {inWatchParty && !isLiveMode ? renderParticipantPanel(false) : null}

        {zoomLevel > 1.01 && !inWatchParty ? (
          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.controlBtn} onPress={() => animateZoomTo(1)}>
              <Text style={styles.controlBtnText}>Reset Zoom</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!inWatchParty ? (
          <Animated.View
            pointerEvents={controlsVisible ? "auto" : "none"}
            style={[
              styles.compactControlsShell,
              {
                opacity: compactControlsOpacity,
                transform: [{ translateY: compactControlsTranslateY }],
              },
            ]}
          >
            <View style={styles.compactActionRow}>
              <TouchableOpacity style={styles.compactActionBtn} onPress={replayFromStart}>
                <Text style={styles.compactActionBtnText}>Replay</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.compactActionBtn} onPress={() => router.back()}>
                <Text style={styles.compactActionBtnText}>Back</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18 },
  topSection: { marginBottom: 10, gap: 6 },
  kicker: { color: "#5B5B5B", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.1 },
  header: { color: "white", fontSize: 25, fontWeight: "900", lineHeight: 30 },
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
    borderColor: "rgba(220,20,60,0.44)",
    backgroundColor: "rgba(220,20,60,0.14)",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  partySyncPillText: {
    color: "#F2DEE4",
    fontSize: 10.5,
    fontWeight: "800",
  },
  text: { color: "#D6D6D6", fontSize: 14, marginBottom: 10 },

  videoWrap: {
    width: "100%",
    height: 268,
    borderRadius: 18,
    backgroundColor: "black",
    marginBottom: 12,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
    backgroundColor: "rgba(220,20,60,0.16)",
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
  liveSpeakerCard: {
    alignItems: "center",
  },
  liveSpeakerCardSolo: {
    minWidth: 130,
  },
  liveSpeakerCardDual: {
    minWidth: 112,
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
    backgroundColor: "rgba(255,112,142,0.95)",
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
    backgroundColor: "rgba(255,70,110,0.22)",
  },
  roomEnergyAura: {
    position: "absolute",
    top: "10%",
    alignSelf: "center",
    width: 250,
    height: 250,
    borderRadius: 130,
    backgroundColor: "rgba(220,20,60,0.16)",
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
  video: {
    width: "100%",
    height: "100%",
    backgroundColor: "black",
  },
  seekFeedback: {
    position: "absolute",
    alignSelf: "center",
    top: "42%",
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
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
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(10,10,14,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
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
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  partyOverlaySpacer: { flex: 1 },
  partyPresencePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(6,6,10,0.72)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: "58%",
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
    gap: 6,
  },
  partyOverlayChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  partyOverlayChipText: {
    color: "#F1F3F8",
    fontSize: 10.5,
    fontWeight: "800",
  },
  partySpeedOverlayMenu: {
    position: "absolute",
    top: 46,
    right: 10,
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    maxWidth: "72%",
    justifyContent: "flex-end",
  },
  partySpeedOverlayChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  partySpeedOverlayChipActive: {
    borderColor: "rgba(220,20,60,0.72)",
    backgroundColor: "rgba(220,20,60,0.28)",
  },
  partySpeedOverlayChipText: {
    color: "#DADEE8",
    fontSize: 10,
    fontWeight: "800",
  },
  partySpeedOverlayChipTextActive: {
    color: "#fff",
  },
  partyReactionBurstWrap: {
    position: "absolute",
    right: 10,
    bottom: 68,
    gap: 6,
    alignItems: "flex-end",
  },
  partyReactionBurstBubble: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(6,6,10,0.74)",
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
    bottom: 120,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(6,6,10,0.74)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  partyLocalReactionText: {
    fontSize: 21,
    fontWeight: "900",
  },
  partyChatDrawer: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(8,8,12,0.82)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
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
  partyCommentsDrawer: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(8,8,12,0.84)",
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 8,
    maxHeight: 148,
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#EEF1F8",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  partyCommentsSendBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.7)",
    backgroundColor: "rgba(220,20,60,0.26)",
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    marginBottom: 8,
    gap: 8,
  },
  compactUtilityRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  compactChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactChipAccent: {
    borderColor: "rgba(220,20,60,0.52)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  compactChipText: {
    color: "#EEF1F8",
    fontSize: 11.5,
    fontWeight: "800",
  },
  compactChipTextAccent: {
    color: "#fff",
  },
  compactSpeedMenuRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  compactSpeedChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  compactSpeedChipActive: {
    borderColor: "rgba(220,20,60,0.64)",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  compactSpeedChipText: {
    color: "#D6DAE5",
    fontSize: 11,
    fontWeight: "800",
  },
  compactSpeedChipTextActive: {
    color: "#fff",
  },
  compactActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  compactActionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  compactActionBtnText: {
    color: "#EEF1F7",
    fontSize: 12,
    fontWeight: "800",
  },

  progressCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  progressMetaRow: {
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressTime: {
    color: "#C5C9D3",
    fontSize: 11.5,
    fontWeight: "800",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: ACCENT,
    borderRadius: 999,
  },
  partyFeedCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    minHeight: 96,
    maxHeight: 170,
  },
  partyFeedCardLive: {
    minHeight: 108,
    maxHeight: 138,
    marginBottom: 0,
    alignSelf: "stretch",
  },
  participantBubbleScroll: {
    gap: 10,
    paddingRight: 4,
  },
  participantBubbleScrollLive: {
    gap: 14,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  participantBubbleItem: {
    width: 82,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(8,8,12,0.56)",
    paddingHorizontal: 7,
    paddingVertical: 8,
  },
  participantBubbleItemLive: {
    width: 108,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  participantBubbleActive: {
    borderColor: "rgba(220,20,60,0.58)",
    backgroundColor: "rgba(220,20,60,0.18)",
  },
  participantBubbleSpeaking: {
    borderColor: "rgba(220,20,60,0.9)",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  participantBubbleInactive: {
    opacity: 0.58,
  },
  participantBubbleReactionBoost: {
    borderColor: "rgba(255,96,128,0.92)",
    backgroundColor: "rgba(220,20,60,0.22)",
  },
  partyParticipantCardExpanded: {
    width: 232,
  },
  partyParticipantBubbleTap: {
    alignItems: "center",
  },
  partyParticipantAvatarWrap: {
    position: "relative",
    marginBottom: 6,
  },
  participantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  participantAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  participantAvatarLive: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  participantActiveRing: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: "rgba(220,20,60,0.98)",
  },
  participantSpeakingRing: {
    borderWidth: 3,
    borderColor: "rgba(255,98,130,0.98)",
  },
  participantReactionBoostRing: {
    borderColor: "rgba(255,128,156,1)",
    borderWidth: 3.2,
  },
  participantRequestRing: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(122,196,255,0.9)",
  },
  participantActivePulse: {
    position: "absolute",
    top: -5,
    left: -5,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(220,20,60,0.36)",
  },
  participantSpeakingPulse: {
    backgroundColor: "rgba(255,90,120,0.46)",
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
    backgroundColor: "rgba(220,20,60,0.3)",
    borderColor: "rgba(255,132,160,0.9)",
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
    fontSize: 10.5,
    fontWeight: "800",
    maxWidth: "100%",
  },
  participantNameLive: {
    fontSize: 12,
  },
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
    borderColor: "rgba(220,20,60,0.95)",
    backgroundColor: "rgba(220,20,60,0.92)",
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
    fontSize: 9.5,
    fontWeight: "700",
    marginTop: 2,
  },
  participantExpandedControls: {
    marginTop: 7,
    flexDirection: "row",
    gap: 6,
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
  partyParticipantControlBtnText: {
    color: "#EEF1F8",
    fontSize: 10.5,
    fontWeight: "800",
  },

  controlsSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(14,14,14,0.94)",
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  controlsKicker: { color: "#5B5B5B", fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 0,
  },
  controlBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  controlBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  speedWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
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
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.03)",
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
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
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
    backgroundColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    marginTop: 2,
  },
  backText: { color: "#E6E8EF", fontWeight: "900", fontSize: 13 },
});