import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveBrandingConfig,
    resolveFeatureConfig,
    resolveMonetizationConfig,
} from "../../_lib/appConfig";
import { trackEvent } from "../../_lib/analytics";
import { getBetaAccessBlockCopy, useBetaProgram } from "../../_lib/betaProgram";
import {
    ActivityIndicator,
    ImageBackground,
    type ImageSourcePropType,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { titles as localTitles } from "../../_data/titles";
import { reportRuntimeError } from "../../_lib/logger";
import {
    getMonetizationAccessSheetPresentation,
} from "../../_lib/monetization";
import { InternalInviteSheet } from "../../components/chat/internal-invite-sheet";
import type { RoomAccessDecision } from "../../_lib/roomRules";
import { useSession } from "../../_lib/session";
import { supabase } from "../../_lib/supabase";
import { createPartyRoom, evaluatePartyRoomAccess, getPartyRoom, getSafePartyUserId, type WatchPartyRoomType, type WatchPartyState } from "../../_lib/watchParty";
import { AccessSheet, type AccessSheetReason } from "../../components/monetization/access-sheet";
import { BetaAccessScreen } from "../../components/system/beta-access-screen";
import { RoomCodeInviteCard } from "../../components/room/room-code-invite-card";
import { PLAYER_WATCH_PARTY_SOURCE } from "./_lib/_room-shared";

type RoomPreview = {
  room: WatchPartyState;
  titleName: string | null;
};

type IncomingHandoff = {
  roomCode: string;
  partyId: string | null;
  titleId: string | null;
};

const getWaitingRoomPreviewTitle = (preview: RoomPreview) => {
  if (preview.titleName) return preview.titleName;
  return preview.room.roomType === "title" ? "Selected Title" : "Live Room";
};

const getJoinPolicyCopy = (joinPolicy: WatchPartyState["joinPolicy"] | null | undefined) =>
  joinPolicy === "locked"
    ? "Entry is locked until the host reopens it or invites returning members back in."
    : "Signed-in Chi'llywood members can join with the room code while the host keeps the room open.";

const getContentAccessCopy = (contentAccessRule: WatchPartyState["contentAccessRule"] | null | undefined) => {
  if (contentAccessRule === "premium") return "Premium live-room access is not currently available for this device or account, so this room stays locked right now.";
  if (contentAccessRule === "party_pass") return "Party Pass access is not currently available for this device or account, so this room stays locked right now.";
  return "No extra entitlement is needed beyond normal signed-in live access.";
};

const getCapturePolicyCopy = (capturePolicy: WatchPartyState["capturePolicy"] | null | undefined) =>
  capturePolicy === "host_managed"
    ? "Capture expectations are host-managed after you enter the live room."
    : "Capture expectations are lightweight until the live room opens.";

const getPartyJoinPolicyCopy = (joinPolicy: WatchPartyState["joinPolicy"] | null | undefined) =>
  joinPolicy === "locked"
    ? "Party entry is locked until the host reopens it or invites returning members back in."
    : "Signed-in Chi'llywood members can join with the room code while the host keeps the party open.";

const getPartyContentAccessCopy = (contentAccessRule: WatchPartyState["contentAccessRule"] | null | undefined) => {
  if (contentAccessRule === "premium") return "Premium title access is not currently available for this device or account, so this party room stays locked right now.";
  if (contentAccessRule === "party_pass") return "Party Pass access is not currently available for this device or account, so this party room stays locked right now.";
  return "No extra entitlement is needed beyond normal signed-in title access.";
};

const getPartyCapturePolicyCopy = (capturePolicy: WatchPartyState["capturePolicy"] | null | undefined) =>
  capturePolicy === "host_managed"
    ? "Capture expectations become host-managed once shared playback begins."
    : "Capture expectations stay lightweight until shared playback begins.";

export default function WatchPartyIndexScreen() {
  const router = useRouter();
  const { isLoading: authLoading, isSignedIn } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const params = useLocalSearchParams<{
    roomId?: string;
    roomCode?: string;
    titleId?: string;
    partyId?: string;
    mode?: string;
    source?: string;
  }>();
  const isLiveEntryMode = String(Array.isArray(params.mode) ? params.mode[0] : params.mode ?? "").trim().toLowerCase() === "live";
  const sourceParam = String(Array.isArray(params.source) ? params.source[0] : params.source ?? "").trim().toLowerCase();
  const isPlayerWatchPartyLiveFlow = sourceParam === PLAYER_WATCH_PARTY_SOURCE;
  const initialRouteRoomCode = String(Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode ?? "").trim().toUpperCase();
  const initialRoutePartyId = String(
    (Array.isArray(params.roomId) ? params.roomId[0] : params.roomId)
      ?? (Array.isArray(params.partyId) ? params.partyId[0] : params.partyId)
      ?? "",
  ).trim().toUpperCase();
  const initialLookupId = initialRouteRoomCode || initialRoutePartyId;
  const initialRouteTitleId = String(Array.isArray(params.titleId) ? params.titleId[0] : params.titleId ?? "").trim();
  const [joinCode, setJoinCode] = useState(() => (!isPlayerWatchPartyLiveFlow ? initialRouteRoomCode : ""));
  const [joinLookupBusy, setJoinLookupBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [createTitleId, setCreateTitleId] = useState("");
  const [entryTitleName, setEntryTitleName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [incomingHandoff, setIncomingHandoff] = useState<IncomingHandoff | null>(() =>
    initialLookupId
      ? {
          roomCode: initialRouteRoomCode,
          partyId: initialRoutePartyId || null,
          titleId: initialRouteTitleId || null,
        }
      : null,
  );
  const [preparedRoom, setPreparedRoom] = useState<RoomPreview | null>(null);
  const [initialCodeStatus, setInitialCodeStatus] = useState<"idle" | "preparing" | "failed">(() =>
    isLiveEntryMode && !isPlayerWatchPartyLiveFlow && !initialRouteRoomCode ? "preparing" : "idle",
  );
  const [hostLabel, setHostLabel] = useState("Viewer");
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [accessSheetVisible, setAccessSheetVisible] = useState(false);
  const [accessSheetReason, setAccessSheetReason] = useState<AccessSheetReason | null>(null);
  const [pendingAccessPreview, setPendingAccessPreview] = useState<RoomPreview | null>(null);
  const [pendingAccessDecision, setPendingAccessDecision] = useState<RoomAccessDecision | null>(null);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const handoffLoadedRef = useRef(false);
  const liveWaitingRoomLoadedRef = useRef(false);
  const branding = resolveBrandingConfig(appConfig);
  const features = resolveFeatureConfig(appConfig);
  const monetizationConfig = resolveMonetizationConfig(appConfig);
  const canUseBetaRooms = isSignedIn && isActive;
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Watch-party rooms");

  const getBackgroundSource = (): ImageSourcePropType | null => {
    const first = localTitles[0] as any;
    return first?.image || first?.poster || null;
  };

  const backgroundSource = getBackgroundSource();

  useEffect(() => {
    let active = true;

    readAppConfig()
      .then((config) => {
        if (!active) return;
        setAppConfig(config);
        setConfigReady(true);
      })
      .catch(() => {
        if (!active) return;
        setAppConfig(DEFAULT_APP_CONFIG);
        setConfigReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const resolveRoomTitleName = useCallback(async (roomTitleId: string | null | undefined) => {
    const normalizedTitleId = String(roomTitleId ?? "").trim();
    if (!normalizedTitleId) return null;

    try {
      const { data } = await supabase
        .from("titles")
        .select("title")
        .eq("id", normalizedTitleId)
        .maybeSingle();
      return data?.title ? String(data.title) : null;
    } catch {
      return null;
    }
  }, []);

  const buildRoomPreview = useCallback(async (room: WatchPartyState): Promise<RoomPreview> => {
    const titleName = await resolveRoomTitleName(room.titleId);
    return { room, titleName };
  }, [resolveRoomTitleName]);

  useEffect(() => {
    let active = true;
    const nextTitleId = String(
      preview?.room.titleId
      ?? preparedRoom?.room.titleId
      ?? incomingHandoff?.titleId
      ?? initialRouteTitleId
      ?? "",
    ).trim();

    if (!nextTitleId) {
      setEntryTitleName(null);
      return () => {
        active = false;
      };
    }

    resolveRoomTitleName(nextTitleId)
      .then((name) => {
        if (active) setEntryTitleName(name);
      })
      .catch(() => {
        if (active) setEntryTitleName(null);
      });

    return () => {
      active = false;
    };
  }, [incomingHandoff?.titleId, initialRouteTitleId, preparedRoom?.room.titleId, preview?.room.titleId, resolveRoomTitleName]);

  const createPreparedWaitingRoom = useCallback(async (titleId: string | null, roomType: WatchPartyRoomType): Promise<RoomPreview | null> => {
    if (!canUseBetaRooms) return null;
    const hostUserId = await getSafePartyUserId();
    const room = await createPartyRoom(titleId, hostUserId, 0, "paused", { roomType });
    if (!room || "error" in room) return null;

    const nextPreparedRoom = await buildRoomPreview(room);
    setPreparedRoom(nextPreparedRoom);
    setIncomingHandoff({ roomCode: room.roomCode, partyId: room.partyId, titleId: room.titleId });
    setHostLabel("You are hosting");
    return nextPreparedRoom;
  }, [buildRoomPreview, canUseBetaRooms]);

  useEffect(() => {
    if (!canUseBetaRooms) return;
    if (!configReady || !features.watchPartyEnabled) return;
    if (handoffLoadedRef.current) return;

    const rawRoomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
    const rawRoomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
    const rawPartyId = Array.isArray(params.partyId) ? params.partyId[0] : params.partyId;
    const rawTitleId = Array.isArray(params.titleId) ? params.titleId[0] : params.titleId;
    const incomingLookupId = String(rawRoomCode ?? rawRoomId ?? rawPartyId ?? "").trim().toUpperCase();
    const incomingPartyId = String(rawRoomId ?? rawPartyId ?? rawRoomCode ?? "").trim().toUpperCase();
    const incomingRoomCode = String(rawRoomCode ?? "").trim().toUpperCase();
    const incomingTitleId = String(rawTitleId ?? "").trim();

    if (!incomingLookupId) return;
    handoffLoadedRef.current = true;
    if (!isPlayerWatchPartyLiveFlow && incomingRoomCode) setJoinCode(incomingRoomCode);
    setHostLabel("Connecting room…");
    setIncomingHandoff({
      roomCode: incomingRoomCode,
      partyId: incomingPartyId || null,
      titleId: incomingTitleId || null,
    });
    const loadIncomingRoom = async () => {
      try {
        const room = await getPartyRoom(incomingLookupId);
        if (!room) {
          return;
        }

        const safeUserId = await getSafePartyUserId();
        setHostLabel(safeUserId === room.hostUserId ? "You are hosting" : "You joined as viewer");
        if (!isPlayerWatchPartyLiveFlow) setJoinCode(room.roomCode);
        setIncomingHandoff({ roomCode: room.roomCode, partyId: room.partyId, titleId: room.titleId });
        setPreparedRoom(await buildRoomPreview(room));
      } catch (error) {
        reportRuntimeError("watch-party-handoff", error, {
          incomingLookupId,
        });
      }
    };

    loadIncomingRoom();
  }, [buildRoomPreview, canUseBetaRooms, configReady, features.watchPartyEnabled, isPlayerWatchPartyLiveFlow, params.partyId, params.roomCode, params.roomId, params.titleId]);

  useEffect(() => {
    if (!canUseBetaRooms) return;
    if (!configReady || !features.watchPartyEnabled) return;
    if (liveWaitingRoomLoadedRef.current) return;
    if (!isLiveEntryMode || isPlayerWatchPartyLiveFlow) return;

    const rawRoomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
    const rawRoomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
    const rawPartyId = Array.isArray(params.partyId) ? params.partyId[0] : params.partyId;
    const incomingCode = String(rawRoomCode ?? rawRoomId ?? rawPartyId ?? "").trim().toUpperCase();
    if (incomingCode) return;

    liveWaitingRoomLoadedRef.current = true;
    let cancelled = false;

    const createLiveWaitingRoom = async () => {
      try {
        setInitialCodeStatus("preparing");
        const nextPreparedRoom = await createPreparedWaitingRoom(null, "live");
        if (cancelled) return;
        if (!nextPreparedRoom) {
          setInitialCodeStatus("failed");
          return;
        }
        setInitialCodeStatus("idle");
      } catch {
        if (!cancelled) setInitialCodeStatus("failed");
      }
    };

    createLiveWaitingRoom();

    return () => {
      cancelled = true;
    };
  }, [canUseBetaRooms, configReady, createPreparedWaitingRoom, features.watchPartyEnabled, isLiveEntryMode, isPlayerWatchPartyLiveFlow, params.partyId, params.roomCode, params.roomId]);

  const onLookup = async () => {
    if (!features.watchPartyEnabled) {
      setJoinError("Watch Party is disabled in the current app configuration.");
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    setJoinLookupBusy(true);
    setJoinError(null);
    setPreview(null);

    try {
      const room = await getPartyRoom(code);
      if (!room) {
        trackEvent("room_join_failure", {
          surface: "watch-party-lobby",
          reason: "room_not_found",
          roomCode: code,
        });
        setJoinError("Room not found. Check the code and try again.");
        return;
      }

      if (isLiveEntryMode && !isPlayerWatchPartyLiveFlow && room.roomType !== "live") {
        trackEvent("room_join_failure", {
          surface: "watch-party-lobby",
          reason: "wrong_live_room_type",
          roomCode: code,
        });
        setJoinError("This code belongs to a Watch-Party room. Open Watch-Party Live from the title or player to join it.");
        return;
      }

      if ((!isLiveEntryMode || isPlayerWatchPartyLiveFlow) && room.roomType === "live") {
        trackEvent("room_join_failure", {
          surface: "watch-party-lobby",
          reason: "wrong_party_room_type",
          roomCode: code,
        });
        setJoinError("This code belongs to a live room. Open Live Watch-Party from Home to join it.");
        return;
      }

      setPreview(await buildRoomPreview(room));
    } catch (error) {
      reportRuntimeError("watch-party-lookup", error, {
        roomCode: code,
      });
      setJoinError("Couldn't reach the server. Check your connection.");
    } finally {
      setJoinLookupBusy(false);
    }
  };

  const buildRoomEntryParams = useCallback((nextPartyId: string, options?: { roomCode?: string | null; titleId?: string | null }) => {
    const nextRoomCode = String(options?.roomCode ?? "").trim().toUpperCase();
    const nextTitleId = String(options?.titleId ?? "").trim();

    return {
      partyId: nextPartyId,
      ...(nextRoomCode ? { roomCode: nextRoomCode } : {}),
      ...(nextTitleId ? { titleId: nextTitleId } : {}),
      ...(isPlayerWatchPartyLiveFlow ? { source: PLAYER_WATCH_PARTY_SOURCE } : {}),
    };
  }, [isPlayerWatchPartyLiveFlow]);

  const navigateToRoom = useCallback((options: {
    partyId: string;
    roomType: WatchPartyRoomType;
    roomCode?: string | null;
    titleId?: string | null;
  }) => {
    const params = buildRoomEntryParams(options.partyId, {
      roomCode: options.roomCode,
      titleId: options.titleId,
    });

    if (options.roomType === "live") {
      router.push({
        pathname: "/watch-party/live-stage/[partyId]",
        params,
      });
      return;
    }

    router.push({
      pathname: "/watch-party/[partyId]",
      params,
    });
  }, [buildRoomEntryParams, router]);

  const navigateToPreviewRoom = useCallback((nextPreview: RoomPreview) => {
    const nextPartyId = String(nextPreview.room.partyId ?? "").trim();
    if (!nextPartyId) {
      setJoinError("Room is missing an id. Try another code.");
      return;
    }

    navigateToRoom({
      partyId: nextPartyId,
      roomType: nextPreview.room.roomType,
      roomCode: nextPreview.room.roomCode,
      titleId: nextPreview.room.titleId,
    });
  }, [navigateToRoom]);

  const attemptJoinRoom = useCallback(async (nextPreview: RoomPreview) => {
    const nextPartyId = String(nextPreview.room.partyId ?? "").trim();
    if (!nextPartyId) {
      setJoinError("Room is missing an id. Try another code.");
      return;
    }

    const userId = await getSafePartyUserId().catch(() => "");
    const access = await evaluatePartyRoomAccess({
      partyId: nextPartyId,
      userId,
      room: nextPreview.room,
    }).catch(() => null);

    if (!access) {
      trackEvent("room_join_failure", {
        surface: "watch-party-lobby",
        reason: "access_unknown",
        roomId: nextPartyId,
      });
      setJoinError("Unable to confirm room access right now. Try again.");
      return;
    }

    if (access.canJoin) {
      trackEvent("room_join_success", {
        surface: "watch-party-lobby",
        roomId: nextPartyId,
      });
      navigateToPreviewRoom(nextPreview);
      return;
    }

    if (access.reason === "premium_required" || access.reason === "party_pass_required") {
      trackEvent("monetization_gate_shown", {
        surface: "watch-party-lobby",
        reason: access.reason,
        roomId: nextPartyId,
      });
      setPendingAccessPreview(nextPreview);
      setPendingAccessDecision(access);
      setAccessSheetReason(access.reason);
      setAccessSheetVisible(true);
      return;
    }

    if (access.reason === "room_locked") {
      setJoinError("This room is locked right now. Ask the host to reopen it.");
      return;
    }

    if (access.reason === "removed") {
      setJoinError("You no longer have access to this room.");
      return;
    }

      setJoinError("Sign in to join Chi'llywood rooms.");
  }, [navigateToPreviewRoom]);

  const onConfirmJoin = async () => {
    if (!preview) return;
    await attemptJoinRoom(preview);
  };

  const onResolveJoinAccess = useCallback(async (action: "purchase" | "restore") => {
    if (!pendingAccessPreview || !pendingAccessDecision || !accessSheetReason) {
      return {
        message: "Unable to confirm access for this room right now.",
        tone: "error" as const,
      };
    }

    setJoinError(null);

    try {
      const accessKey = String(pendingAccessPreview.room.partyId ?? "").trim();
      if (!accessKey) {
        const message = "This room is missing the access key needed to continue.";
        setJoinError(message);
        return {
          message,
          tone: "error" as const,
        };
      }

      const latestRoom = await getPartyRoom(accessKey).catch(() => null);
      const userId = await getSafePartyUserId().catch(() => "");
      const refreshedPreview = latestRoom ? { ...pendingAccessPreview, room: latestRoom } : pendingAccessPreview;
      const access = await evaluatePartyRoomAccess({
        partyId: accessKey,
        userId,
        room: latestRoom ?? pendingAccessPreview.room,
      }).catch(() => null);

      if (access?.canJoin) {
        trackEvent("monetization_unlock_success", {
          action,
          surface: "watch-party-lobby",
          reason: accessSheetReason,
          roomId: accessKey,
        });
        setAccessSheetVisible(false);
        setAccessSheetReason(null);
        setPendingAccessPreview(null);
        setPendingAccessDecision(null);
        setJoinError(null);
        navigateToPreviewRoom(refreshedPreview);
        return {
          message: action === "restore" ? "Purchases restored. Joining room…" : "Access unlocked. Joining room…",
          tone: "success" as const,
        };
      }

      if (access && (access.reason === "premium_required" || access.reason === "party_pass_required")) {
        setPendingAccessDecision(access);
        setAccessSheetReason(access.reason);
        const message = access.monetization.issues[0] ?? "This room still isn't available for your current access level.";
        trackEvent("monetization_unlock_failure", {
          action,
          surface: "watch-party-lobby",
          reason: access.reason,
          roomId: accessKey,
        });
        setJoinError(message);
        return {
          message,
          tone: "error" as const,
        };
      }

      const message = access?.reason === "room_locked"
        ? "This room is locked right now. Ask the host to reopen it."
        : access?.reason === "removed"
          ? "You no longer have access to this room."
          : "This room still isn't available for your current access level.";
      trackEvent("monetization_unlock_failure", {
        action,
        surface: "watch-party-lobby",
        reason: accessSheetReason,
        roomId: accessKey,
      });
      setJoinError(message);
      return {
        message,
        tone: "error" as const,
      };
    } catch (error) {
      reportRuntimeError("watch-party-unlock", error, {
        action,
        reason: accessSheetReason,
      });
      const message = "Unable to confirm access for this room right now.";
      setJoinError(message);
      return {
        message,
        tone: "error" as const,
      };
    }
  }, [accessSheetReason, navigateToPreviewRoom, pendingAccessDecision, pendingAccessPreview]);

  const onCreateRoom = async () => {
    if (!features.watchPartyEnabled) {
      setCreateError("Watch Party is disabled in the current app configuration.");
      return;
    }
    const trimmedTitleId = createTitleId.trim();
    const defaultPartyTitleId = String(preparedRoom?.room.titleId ?? incomingHandoff?.titleId ?? initialRouteTitleId ?? "").trim();
    const activeWaitingRoomType: WatchPartyRoomType = inferredWaitingRoomType;
    const effectiveTitleId = activeWaitingRoomType === "live" ? null : (trimmedTitleId || defaultPartyTitleId || null);
    const preparedTargetPartyId = String(preparedRoom?.room.partyId ?? incomingHandoff?.partyId ?? initialRoutePartyId ?? "").trim();
    const preparedTargetRoomCode = String(preparedRoom?.room.roomCode ?? incomingHandoff?.roomCode ?? initialRouteRoomCode ?? "").trim().toUpperCase();
    const preparedTargetTitleId = String(preparedRoom?.room.titleId ?? incomingHandoff?.titleId ?? initialRouteTitleId ?? "").trim();
    const shouldGuardCreateDuringInitialPrep = !effectiveTitleId && isPreparingInitialCode && !preparedTargetPartyId;

    if (creating || shouldGuardCreateDuringInitialPrep) return;

    setCreateError(null);
    setCreating(true);

    try {
      if (!effectiveTitleId && preparedTargetPartyId) {
        const nextPartyId = preparedTargetPartyId;
        if (nextPartyId) {
          navigateToRoom({
            partyId: nextPartyId,
            roomType: preparedRoom?.room.roomType ?? activeWaitingRoomType,
            roomCode: preparedTargetRoomCode,
            titleId: preparedTargetTitleId,
          });
          return;
        }
      }

      const hostUserId = await getSafePartyUserId();
      const roomType = effectiveTitleId ? "title" : activeWaitingRoomType;

      const room = await createPartyRoom(effectiveTitleId, hostUserId, 0, "paused", {
        roomType,
      });

      if (!room || "error" in room) {
        trackEvent("room_create_failure", {
          surface: "watch-party-lobby",
          reason: room && "error" in room ? room.error.message : "unknown_error",
        });
        setCreateError("Unable to create room right now.");
        return;
      }

      const nextPartyId = String(room.partyId ?? room.roomCode ?? "").trim();
      if (!nextPartyId) {
        setCreateError("Unable to create room right now.");
        return;
      }

      trackEvent("room_create_success", {
        surface: "watch-party-lobby",
        roomId: nextPartyId,
        roomType,
      });
      navigateToRoom({
        partyId: nextPartyId,
        roomType: room.roomType,
        roomCode: room.roomCode,
        titleId: room.titleId,
      });
    } catch (error) {
      reportRuntimeError("watch-party-create", error, {
        titleId: effectiveTitleId,
      });
      trackEvent("room_create_failure", {
        surface: "watch-party-lobby",
        reason: "runtime_error",
      });
      setCreateError("Unable to create room right now.");
    } finally {
      setCreating(false);
    }
  };

  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading watch-party access"
        body="Checking your signed-in session before opening room create and join controls."
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to create or join watch parties"
        body="Watch-party rooms use signed-in identities so room truth, moderation, reconnect behavior, and entitlement checks stay reliable."
      />
    );
  }

  if (!isActive) {
    return (
      <BetaAccessScreen
        title={blockedBetaCopy.title}
        body={blockedBetaCopy.body}
        accessState={accessState.status === "loading" || accessState.status === "signed_out" || accessState.status === "active" ? null : accessState.status}
      />
    );
  }

  const onGenerateNewCode = async () => {
    if (refreshingCode) return;

    setRefreshingCode(true);
    setCreateError(null);

    try {
      const requestedTitleId = String(preparedRoom?.room.titleId ?? incomingHandoff?.titleId ?? initialRouteTitleId ?? "").trim() || null;
      const roomType: WatchPartyRoomType = preparedRoom?.room.roomType ?? (requestedTitleId ? "title" : "live");
      const nextPreparedRoom = await createPreparedWaitingRoom(requestedTitleId, roomType);
      if (!nextPreparedRoom) {
        setCreateError("Unable to generate a new room code right now.");
        return;
      }

      setPreview(null);
      setJoinCode("");
      setJoinError(null);
    } catch {
      setCreateError("Unable to generate a new room code right now.");
    } finally {
      setRefreshingCode(false);
    }
  };

  const onClearPreview = () => {
    setPreview(null);
    setJoinCode("");
    setJoinError(null);
  };

  const inferredWaitingRoomType: WatchPartyRoomType = preview?.room.roomType
    ?? preparedRoom?.room.roomType
    ?? (incomingHandoff?.titleId || initialRouteTitleId || isPlayerWatchPartyLiveFlow ? "title" : "live");
  const activeRoomType: WatchPartyRoomType = inferredWaitingRoomType;
  const isLiveWaitingRoom = activeRoomType === "live" && !isPlayerWatchPartyLiveFlow;
  const activeRoomContext = preview?.room ?? preparedRoom?.room ?? null;
  const partyTitleId = String(activeRoomContext?.titleId ?? incomingHandoff?.titleId ?? initialRouteTitleId ?? "").trim();
  const partyTitleName = preview?.titleName
    ?? preparedRoom?.titleName
    ?? entryTitleName
    ?? (partyTitleId ? "Selected Title" : "Title selection needed");
  const partyTitleLocked = !isLiveWaitingRoom && !!partyTitleId;
  const topRoomCode = preparedRoom?.room.roomCode ?? incomingHandoff?.roomCode ?? initialRouteRoomCode ?? "";
  const isPreparingInitialCode = initialCodeStatus === "preparing" && !topRoomCode;
  const didInitialCodePrepFail = initialCodeStatus === "failed" && !topRoomCode;
  const trimmedCreateTitleId = createTitleId.trim();
  const preparedTargetPartyId = String(preparedRoom?.room.partyId ?? incomingHandoff?.partyId ?? initialRoutePartyId ?? "").trim();
  const shouldGuardCreateDuringInitialPrep = !trimmedCreateTitleId && isPreparingInitialCode && !preparedTargetPartyId;
  const createActionBusy = creating || shouldGuardCreateDuringInitialPrep;
  const topHostLabel = preparedRoom
    ? hostLabel
    : incomingHandoff
      ? hostLabel
      : isLiveEntryMode
        ? "LIVE mode"
        : "";
  const waitingPresenceLabel = isLiveWaitingRoom
    ? (isPreparingInitialCode
      ? "Preparing host-ready live access…"
      : preparedRoom
        ? "Host entry ready"
        : preview
          ? "Viewer entry ready"
          : "Signed in and ready to enter")
    : (isPreparingInitialCode ? "Preparing room code…" : (topHostLabel || "You are in room"));
  const waitingRoomTitle = isLiveWaitingRoom
    ? (String(branding.liveWaitingRoomTitle || "Live Waiting Room").trim() || "Live Waiting Room")
    : (String(branding.partyWaitingRoomTitle || "Party Waiting Room").trim() || "Party Waiting Room");
  const waitingRoomBody = isLiveWaitingRoom
    ? (topRoomCode
      ? `Pre-entry live control room · code ${topRoomCode}`
      : isPreparingInitialCode
        ? "Preparing a room code and live handoff before the room opens."
        : didInitialCodePrepFail
          ? "Live room code unavailable right now. Generate a new code to continue."
          : "Choose the host or viewer lane, set the live entry, and then move into Live Room before stage entry.")
    : (topRoomCode
      ? `${partyTitleName} · pre-entry party control room · code ${topRoomCode}`
      : isPreparingInitialCode
        ? "Preparing a room code for this party waiting room."
        : didInitialCodePrepFail
          ? "Room code unavailable right now. Generate a new code to continue."
          : partyTitleId
            ? `${partyTitleName} · title-first room setup before shared playback.`
            : "Choose the title, room code, and entry lane before Party Room opens.");
  const waitingRoomTagline = isLiveWaitingRoom
    ? "Set the live room before stage entry."
    : "Set the party room before shared playback.";
  const roomCodeCardValue = topRoomCode || (isPreparingInitialCode ? "Preparing code…" : "Room code unavailable");
  const roomCodeActionBusy = refreshingCode || creating || isPreparingInitialCode;
  const waitingRoomInviteMessage = isLiveWaitingRoom
    ? `Join me in a Chi'llywood live room.\n\nRoom code: ${topRoomCode}\n\nOpen Chi'llywood -> Live Watch-Party -> enter the code to join the live room.`
    : `Join me in Chi'llywood Watch-Party Live.\n\nRoom code: ${topRoomCode}\n\nOpen Chi'llywood -> Watch-Party Live -> enter the code to join the party room.`;
  const liveJoinModes = [
    {
      id: "host",
      title: "Host control lane",
      body: "Create the live room code here, invite the room, and carry those defaults into Live Room.",
    },
    {
      id: "viewer",
      title: "Viewer entry lane",
      body: "Join with the live code here, confirm the room path, and then enter Live Room before stage presentation starts.",
    },
  ];
  const partyEntryModes = [
    {
      id: "host",
      title: "Host control lane",
      body: "Lock the title, generate the room code, and carry the room defaults into Party Room before playback begins.",
    },
    {
      id: "viewer",
      title: "Viewer entry lane",
      body: "Join with the party code here, confirm the title, and then enter Party Room before shared Watch-Party Live starts.",
    },
  ];
  const liveReadinessRows = [
    {
      label: "Invite path",
      status: topRoomCode ? "Ready" : (isPreparingInitialCode ? "Preparing" : "Needed"),
      detail: topRoomCode
        ? `Live room code ${topRoomCode} is ready to share before the room opens.`
        : isPreparingInitialCode
          ? "Preparing the live code before host or viewer entry opens."
          : "Generate a live room code before you invite or host this session.",
      tone: topRoomCode ? "ready" as const : (isPreparingInitialCode ? "pending" as const : "needed" as const),
    },
    {
      label: "Audience focus",
      status: "Ready",
      detail: "Live Room decides who the host sees first, who viewers see first, and how the room opens before stage entry.",
      tone: "ready" as const,
    },
    {
      label: "Comments / reactions",
      status: "Set in Live Room",
      detail: "Comment and reaction expectations stay pre-stage. Live Stage only carries the actual presentation experience.",
      tone: "pending" as const,
    },
    {
      label: "Next room",
      status: "Live Room",
      detail: "Continue into Live Room first. Enter Live Stage from there when the room setup is ready.",
      tone: "ready" as const,
    },
  ];
  const livePermissionsBody = `${getJoinPolicyCopy(activeRoomContext?.joinPolicy)} ${getContentAccessCopy(activeRoomContext?.contentAccessRule)} ${getCapturePolicyCopy(activeRoomContext?.capturePolicy)}`;
  const liveSmartHelper = topRoomCode
    ? "Your live room code is ready. Share it here, then use Live Room for focus order, audience visibility, and the handoff into Live Stage."
    : isPreparingInitialCode
      ? "Stay here while Chi'llywood prepares the live code. This surface only handles pre-entry live setup."
      : didInitialCodePrepFail
        ? "Generate a fresh code before inviting people. Live Room cannot open without a valid live room code."
        : "Choose the host or viewer lane here, then let Live Room handle the room defaults before stage entry.";
  const partyReadinessRows = [
    {
      label: "Title",
      status: partyTitleId ? "Ready" : "Needed",
      detail: partyTitleId
        ? `${partyTitleName} is locked for this waiting-room entry.`
        : "Confirm the title before you host so the shared room stays title-first and intentional.",
      tone: partyTitleId ? "ready" as const : "needed" as const,
    },
    {
      label: "Room code",
      status: topRoomCode ? "Ready" : (isPreparingInitialCode ? "Preparing" : "Needed"),
      detail: topRoomCode
        ? `Party room code ${topRoomCode} is ready for invite or join.`
        : isPreparingInitialCode
          ? "The room is preparing a party code before entry opens."
          : "Generate or enter a party code before you bring people into Party Room.",
      tone: topRoomCode ? "ready" as const : (isPreparingInitialCode ? "pending" as const : "needed" as const),
    },
    {
      label: "Room defaults",
      status: "Party Room",
      detail: "Who you see first, room privacy, and comments or reactions all stay in Party Room before the shared player opens.",
      tone: "pending" as const,
    },
    {
      label: "Next room",
      status: "Party Room",
      detail: "Continue into Party Room first. Shared Watch-Party Live playback starts from there, not from this waiting room.",
      tone: "ready" as const,
    },
  ];
  const partyPermissionsBody = `${getPartyJoinPolicyCopy(activeRoomContext?.joinPolicy)} ${getPartyContentAccessCopy(activeRoomContext?.contentAccessRule)} ${getPartyCapturePolicyCopy(activeRoomContext?.capturePolicy)}`;
  const partySmartHelper = topRoomCode
    ? "Your party room code is ready. Share it here, then use Party Room for visibility, privacy, and watch-together setup before shared playback starts."
    : partyTitleId
      ? "The title is locked in. Create the party when you are ready, or use a valid room code to open Party Room first."
      : "Pick or confirm the title here, then let Party Room handle the room setup before shared playback begins.";
  const roomExperienceList = isLiveWaitingRoom
    ? [
        "Pre-entry live identity",
        "Host or viewer join choice",
        "Signed-in live access check",
        "Invite-ready room code",
        "Visibility and control guidance",
        "Live Room handoff only",
      ]
    : [
        "Title-first entry",
        "Create or join split",
        "Invite-ready room code",
        "Access-state explanation",
        "Host and room identity",
        "Party Room handoff only",
      ];

  return (
    <View style={styles.outerFlex}>
      {backgroundSource ? (
        <View style={styles.fullBackground} pointerEvents="none">
          <ImageBackground
            source={backgroundSource}
            style={styles.fullBackground}
            resizeMode="cover"
          />
        </View>
      ) : (
        <View style={styles.fullBackgroundFallback} pointerEvents="none" />
      )}
      <View style={styles.fullBackgroundOverlay} pointerEvents="none" />

      <KeyboardAvoidingView
        style={styles.outerFlex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <Text style={styles.kicker}>{branding.appDisplayName.toUpperCase()}</Text>
        <Text style={styles.tagline}>{waitingRoomTagline}</Text>

        {/* ── Presence / identity ─────────────────────────────────────── */}
        <View style={styles.presenceCard}>
          <View style={styles.presenceAvatar}>
            <Text style={styles.presenceAvatarText}>Y</Text>
          </View>
            <View style={styles.presenceMeta}>
            <Text style={styles.presenceKicker}>{isLiveWaitingRoom ? "LIVE IDENTITY" : "YOUR PRESENCE"}</Text>
            <Text style={styles.presenceTitle}>You</Text>
            <Text style={styles.presenceStatus}>{waitingPresenceLabel}</Text>
          </View>
          {topRoomCode ? (
            <View style={styles.presenceCodePill}>
              <Text style={styles.presenceCodeText}>{topRoomCode}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Room identity ───────────────────────────────────────────── */}
        <View style={styles.roomIdentityCard}>
          <Text style={styles.roomIdentityLabel}>ROOM</Text>
          <Text style={styles.roomIdentityTitle}>{waitingRoomTitle}</Text>
          <Text style={styles.roomIdentityBody}>{waitingRoomBody}</Text>
        </View>

        {isLiveWaitingRoom ? (
          <>
            <View style={styles.liveContextCard}>
              <Text style={styles.liveContextLabel}>LIVE ENTRY</Text>
              <Text style={styles.liveContextTitle}>
                {topRoomCode ? "Your live entry stays pre-stage here." : "Open the live room before Live Stage takes over."}
              </Text>
              <Text style={styles.liveContextBody}>
                {topRoomCode
                  ? "This surface only handles room code, entry lane, and access context. Live Room owns the actual room controls, and Live Stage stays separate after that."
                  : "Live Waiting Room prepares the entry lane, code, and access path. Live Room and Live Stage stay separate until you continue."}
              </Text>
            </View>

            <View style={styles.modeChoiceCard}>
              <Text style={styles.modeChoiceLabel}>ENTRY LANES</Text>
              <View style={styles.modeChoiceRow}>
                {liveJoinModes.map((entry) => (
                  <View key={entry.id} style={styles.modeChoicePane}>
                    <Text style={styles.modeChoiceTitle}>{entry.title}</Text>
                    <Text style={styles.modeChoiceBody}>{entry.body}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.readinessCard}>
              <Text style={styles.readinessLabel}>PRE-ENTRY DEFAULTS</Text>
              {liveReadinessRows.map((entry) => (
                <View key={entry.label} style={styles.readinessRow}>
                  <View style={[styles.readinessDot, entry.tone === "ready"
                    ? styles.readinessDotReady
                    : entry.tone === "pending"
                      ? styles.readinessDotPending
                      : styles.readinessDotNeeded]} />
                  <View style={styles.readinessMeta}>
                    <View style={styles.readinessHeadline}>
                      <Text style={styles.readinessTitle}>{entry.label}</Text>
                      <Text style={styles.readinessStatus}>{entry.status}</Text>
                    </View>
                    <Text style={styles.readinessBody}>{entry.detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.permissionsCard}>
              <Text style={styles.permissionsLabel}>ROOM ACCESS</Text>
              <Text style={styles.permissionsBody}>
                {livePermissionsBody}
              </Text>
            </View>

            <View style={styles.smartHelperCard}>
              <Text style={styles.smartHelperLabel}>NEXT ROOM</Text>
              <Text style={styles.smartHelperBody}>{liveSmartHelper}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.partyContextCard}>
              <Text style={styles.partyContextLabel}>PARTY ENTRY</Text>
              <Text style={styles.partyContextTitle}>{partyTitleName}</Text>
              <Text style={styles.partyContextBody}>
                {topRoomCode
                  ? "This waiting room keeps title preview, access, and room-entry choice clear before Party Room and shared playback begin."
                  : partyTitleId
                    ? "Confirm the title, choose the host or viewer lane, and then move into Party Room when you are ready."
                    : "Pick the title first so the watch-together entry stays social, intentional, and title-driven."}
              </Text>
            </View>

            <View style={styles.modeChoiceCard}>
              <Text style={styles.modeChoiceLabel}>ENTRY LANES</Text>
              <View style={styles.modeChoiceRow}>
                {partyEntryModes.map((entry) => (
                  <View key={entry.id} style={styles.modeChoicePane}>
                    <Text style={styles.modeChoiceTitle}>{entry.title}</Text>
                    <Text style={styles.modeChoiceBody}>{entry.body}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.readinessCard}>
              <Text style={styles.readinessLabel}>PRE-ENTRY DEFAULTS</Text>
              {partyReadinessRows.map((entry) => (
                <View key={entry.label} style={styles.readinessRow}>
                  <View style={[styles.readinessDot, entry.tone === "ready"
                    ? styles.readinessDotReady
                    : entry.tone === "pending"
                      ? styles.readinessDotPending
                      : styles.readinessDotNeeded]} />
                  <View style={styles.readinessMeta}>
                    <View style={styles.readinessHeadline}>
                      <Text style={styles.readinessTitle}>{entry.label}</Text>
                      <Text style={styles.readinessStatus}>{entry.status}</Text>
                    </View>
                    <Text style={styles.readinessBody}>{entry.detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.permissionsCard}>
              <Text style={styles.permissionsLabel}>ROOM ACCESS</Text>
              <Text style={styles.permissionsBody}>
                {partyPermissionsBody}
              </Text>
            </View>

            <View style={styles.partyHelperCard}>
              <Text style={styles.partyHelperLabel}>NEXT ROOM</Text>
              <Text style={styles.partyHelperBody}>{partySmartHelper}</Text>
            </View>
          </>
        )}

        {/* ── Room code / invite ──────────────────────────────────────── */}
        <RoomCodeInviteCard
          roomCode={roomCodeCardValue}
          bodyText={isPreparingInitialCode
            ? (isLiveWaitingRoom
              ? "Preparing a shareable code for this live waiting room."
              : "Preparing a shareable room code for this waiting room.")
            : (isLiveWaitingRoom
              ? "Invite people inside Chi'llywood before the live room opens so guests enter through the correct live path."
              : "Invite people inside Chi'llywood before the party opens, then fall back to system share only if needed.")}
          actionLabel="Invite in app"
          onActionPress={() => {
            if (!topRoomCode || roomCodeActionBusy) return;
            setInviteSheetVisible(true);
          }}
          styles={{
            card: styles.inviteCard,
            left: styles.inviteMeta,
            label: styles.inviteLabel,
            code: styles.inviteCode,
            body: styles.inviteBody,
            actionBtn: styles.generateCodeButton,
            actionText: styles.generateCodeButtonText,
          }}
        />
        <TouchableOpacity
          style={[styles.generateCodeButton, roomCodeActionBusy && styles.generateCodeButtonDisabled]}
          onPress={onGenerateNewCode}
          activeOpacity={0.85}
          disabled={roomCodeActionBusy || !features.watchPartyEnabled}
        >
          {refreshingCode || isPreparingInitialCode ? (
            <View style={styles.lookingRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.generateCodeButtonText}>
                {isPreparingInitialCode ? "  Preparing room code…" : "  Generating new code…"}
              </Text>
            </View>
          ) : (
            <Text style={styles.generateCodeButtonText}>Generate New Code</Text>
          )}
        </TouchableOpacity>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <View style={styles.actionArea}>
          <Text style={styles.actionAreaLabel}>ENTRY CONTROLS</Text>

          {!features.watchPartyEnabled ? (
            <View style={styles.joinCard}>
              <Text style={styles.joinLabel}>WATCH PARTY HIDDEN</Text>
              <Text style={styles.roomIdentityBody}>
                Watch Party creation and room entry are currently disabled in app configuration.
              </Text>
            </View>
          ) : null}

          <View style={styles.joinCard}>
            <Text style={styles.joinLabel}>{isLiveWaitingRoom ? "HOST THIS LIVE SESSION" : "HOST THIS WATCH-PARTY"}</Text>
            {isLiveWaitingRoom ? (
              <Text style={styles.joinSupportText}>
                Create the live room here, keep the room code handy, and then carry your room defaults into Live Room as host.
              </Text>
            ) : partyTitleLocked ? (
              <Text style={styles.joinSupportText}>
                {partyTitleName} is locked for this entry. Create the room here, share the code, and then shape the room inside Party Room before shared playback starts.
              </Text>
            ) : (
              <TextInput
                value={createTitleId}
                onChangeText={(t) => {
                  setCreateTitleId(t.trim());
                  setCreateError(null);
                }}
                placeholder="Linked title (optional)"
                placeholderTextColor="#5A5A5A"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!creating}
                returnKeyType="go"
                onSubmitEditing={onCreateRoom}
              />
            )}
            {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryButton, createActionBusy && styles.primaryButtonDisabled]}
              onPress={onCreateRoom}
              activeOpacity={0.85}
              disabled={createActionBusy || !features.watchPartyEnabled}
            >
              {createActionBusy ? (
                <View style={styles.lookingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.primaryButtonText}>
                    {creating ? "  Creating room…" : "  Preparing room…"}
                  </Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>{isLiveWaitingRoom ? "Create Live Room" : "Create Party Room"}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.joinCard}>
            <Text style={styles.joinLabel}>{isLiveWaitingRoom ? "JOIN A LIVE ROOM" : "JOIN WATCH-PARTY LIVE"}</Text>
            {isLiveWaitingRoom ? (
              <Text style={styles.joinSupportText}>
                Enter a live room code to preview the live lane and join Live Room before any stage mode takes over.
              </Text>
            ) : (
              <Text style={styles.joinSupportText}>
                Enter a watch-party room code to preview the title and join Party Room without crossing into the live route.
              </Text>
            )}

            {preview ? (
              /* ── Room preview (found) ─────────────────────────────────── */
              <View style={styles.previewBox}>
                <View style={styles.previewMeta}>
                  <View style={[styles.previewDot, { backgroundColor: preview.room.playbackState === "playing" ? "#2ecc40" : "#b58900" }]} />
                  <Text style={styles.previewStatus}>
                    {preview.room.playbackState === "playing" ? "Playing" : "Paused"}
                  </Text>
                </View>
                <Text style={styles.previewTitle} numberOfLines={2}>
                  {getWaitingRoomPreviewTitle(preview)}
                </Text>
                <Text style={styles.previewCode}>Room  {preview.room.roomCode}</Text>
                <View style={styles.previewActions}>
                  <TouchableOpacity style={styles.joinNowBtn} onPress={onConfirmJoin} activeOpacity={0.88}>
                    <Text style={styles.joinNowBtnText}>Join Now →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClearPreview} activeOpacity={0.75}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* ── Code entry ───────────────────────────────────────────── */
              <>
                <TextInput
                  value={joinCode}
                  onChangeText={(t) => {
                    setJoinCode(t.toUpperCase());
                    setJoinError(null);
                  }}
                  placeholder="Enter room code"
                  placeholderTextColor="#5A5A5A"
                  style={styles.input}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={onLookup}
                  editable={!joinLookupBusy}
                />

                {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}

                <TouchableOpacity
                  style={[styles.primaryButton, (joinLookupBusy || !joinCode.trim()) && styles.primaryButtonDisabled]}
                  onPress={onLookup}
                  activeOpacity={0.85}
                  disabled={joinLookupBusy || !joinCode.trim() || !features.watchPartyEnabled}
                >
                  {joinLookupBusy ? (
                    <View style={styles.lookingRow}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.primaryButtonText}>  Looking up room…</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>Find Room</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* ── Room experience list ───────────────────────────────────── */}
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>ROOM EXPERIENCE</Text>
          {roomExperienceList.map((label) => (
            <View key={label} style={styles.featureRow}>
              <Text style={styles.featureDot}>●</Text>
              <Text style={styles.featureLabel}>{label}</Text>
            </View>
          ))}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {accessSheetReason ? (
        <AccessSheet
          visible={accessSheetVisible}
          reason={accessSheetReason}
          gate={pendingAccessDecision}
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          deferredMonetization
          kickerOverride={pendingAccessDecision ? getMonetizationAccessSheetPresentation({
            gate: pendingAccessDecision,
            appDisplayName: branding.appDisplayName,
            premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
            premiumUpsellBody: monetizationConfig.premiumUpsellBody,
          }).kicker : undefined}
          titleOverride={pendingAccessDecision ? getMonetizationAccessSheetPresentation({
            gate: pendingAccessDecision,
            appDisplayName: branding.appDisplayName,
            premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
            premiumUpsellBody: monetizationConfig.premiumUpsellBody,
          }).title : undefined}
          bodyOverride={pendingAccessDecision ? getMonetizationAccessSheetPresentation({
            gate: pendingAccessDecision,
            appDisplayName: branding.appDisplayName,
            premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
            premiumUpsellBody: monetizationConfig.premiumUpsellBody,
          }).body : undefined}
          actionLabelOverride={pendingAccessDecision ? getMonetizationAccessSheetPresentation({
            gate: pendingAccessDecision,
            appDisplayName: branding.appDisplayName,
            premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
            premiumUpsellBody: monetizationConfig.premiumUpsellBody,
          }).actionLabel : undefined}
          onPurchaseResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "purchase",
                surface: "watch-party-lobby",
                reason: accessSheetReason ?? "unknown",
                roomId: String(pendingAccessPreview?.room.partyId ?? "").trim(),
              });
              setJoinError(result.message);
              return;
            }
            return onResolveJoinAccess("purchase");
          }}
          onRestoreResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "restore",
                surface: "watch-party-lobby",
                reason: accessSheetReason ?? "unknown",
                roomId: String(pendingAccessPreview?.room.partyId ?? "").trim(),
              });
              setJoinError(result.message);
              return;
            }
            return onResolveJoinAccess("restore");
          }}
          onClose={() => setAccessSheetVisible(false)}
        />
      ) : null}
      <InternalInviteSheet
        visible={inviteSheetVisible}
        sourceSurface={isLiveWaitingRoom ? "live-waiting-room" : "party-waiting-room"}
        title={isLiveWaitingRoom ? "Invite people to this live room" : "Invite people to this watch-party"}
        body={isLiveWaitingRoom
          ? "Find a Chi'llywood member, send the live-room code in Chi'lly Chat, or fall back to system share if you need to leave the app."
          : "Find a Chi'llywood member, send the party-room code in Chi'lly Chat, or fall back to system share if you need to leave the app."}
        inviteMessage={waitingRoomInviteMessage}
        onClose={() => setInviteSheetVisible(false)}
        onInviteSent={(thread) => {
          router.push({
            pathname: "/chat/[threadId]",
            params: { threadId: thread.threadId },
          });
        }}
        onSystemShareFallback={() => {
          if (!topRoomCode) return;
          Share.share({
            message: isLiveWaitingRoom
              ? `${branding.appDisplayName} live room code: ${topRoomCode}\n\nOpen ${branding.appDisplayName} -> Live Watch-Party -> enter the code to join.`
              : `Join my ${branding.appDisplayName} Watch-Party Live!\n\nRoom code: ${topRoomCode}\n\nOpen ${branding.appDisplayName} -> Watch-Party Live -> enter the code to join.`,
            title: isLiveWaitingRoom ? "Live Room Invite" : "Watch-Party Live Invite",
          }).catch(() => {});
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outerFlex: { flex: 1 },
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  fullBackgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0B10",
  },
  fullBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 48, gap: 14 },

  // Header
  kicker: { color: "#555", fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  headline: { color: "#fff", fontSize: 38, fontWeight: "900", marginTop: 4, lineHeight: 42 },
  tagline: { color: "#8A8A8A", fontSize: 14, lineHeight: 20 },

  presenceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(12,12,16,0.94)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 14,
  },
  presenceAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(220,20,60,0.22)",
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  presenceAvatarText: { color: "#fff", fontSize: 20, fontWeight: "900" },
  presenceMeta: { flex: 1, gap: 2 },
  presenceKicker: { color: "#666", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  presenceTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  presenceStatus: { color: "#B7C0D4", fontSize: 12.5, fontWeight: "700" },
  presenceCodePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.38)",
    backgroundColor: "rgba(220,20,60,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  presenceCodeText: { color: "#F7D6DD", fontSize: 12, fontWeight: "900", letterSpacing: 1 },

  roomIdentityCard: {
    backgroundColor: "rgba(14,14,18,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 18,
    gap: 8,
  },
  roomIdentityLabel: { color: "#666", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  roomIdentityTitle: { color: "#F4F7FF", fontSize: 20, fontWeight: "900" },
  roomIdentityBody: { color: "#9FAAC0", fontSize: 13, lineHeight: 19, fontWeight: "600" },

  peopleCard: {
    backgroundColor: "rgba(12,12,16,0.92)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 14,
    gap: 10,
  },
  peopleLabel: { color: "#666", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  peopleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  peopleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  peopleChipActive: {
    borderColor: "rgba(220,20,60,0.4)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  peopleChipAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  peopleChipAvatarText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  peopleChipAvatarImage: { width: "100%", height: "100%", borderRadius: 999 },
  peopleChipText: { color: "#D6DCE9", fontSize: 12.5, fontWeight: "800" },

  inviteCard: {
    backgroundColor: "rgba(14,14,18,0.94)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 14,
  },
  inviteMeta: { gap: 5 },
  inviteLabel: { color: "#666", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  inviteCode: { color: "#F7D6DD", fontSize: 22, fontWeight: "900", letterSpacing: 2 },
  inviteBody: { color: "#A9B2C7", fontSize: 12.5, fontWeight: "600" },
  generateCodeButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  generateCodeButtonDisabled: { opacity: 0.45 },
  generateCodeButtonText: { color: "#F2F5FC", fontSize: 13.5, fontWeight: "800", letterSpacing: 0.3 },

  actionArea: {
    gap: 10,
  },
  actionAreaLabel: { color: "#666", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },

  joinCard: {
    backgroundColor: "rgba(14,14,18,0.94)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    padding: 14,
    gap: 12,
  },
  joinLabel: { color: "#6C7488", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  joinSupportText: { color: "#A7B0C3", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1,
  },
  errorText: { color: "#DC143C", fontSize: 12, fontWeight: "600" },
  primaryButton: {
    backgroundColor: "#DC143C",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
  lookingRow: { flexDirection: "row", alignItems: "center" },

  // Room preview
  previewBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 12,
    gap: 7,
  },
  previewMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  previewDot: { width: 7, height: 7, borderRadius: 999 },
  previewStatus: { color: "#888", fontSize: 11, fontWeight: "700" },
  previewTitle: { color: "#fff", fontSize: 19, fontWeight: "900", lineHeight: 24 },
  previewCode: { color: "#555", fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  previewActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  joinNowBtn: {
    flex: 1,
    backgroundColor: "#DC143C",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  joinNowBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  cancelBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  cancelBtnText: { color: "#888", fontSize: 14, fontWeight: "700" },

  liveContextCard: {
    backgroundColor: "rgba(15,16,22,0.95)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    padding: 16,
    gap: 8,
  },
  liveContextLabel: { color: "#F3A6B7", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  liveContextTitle: { color: "#F4F7FF", fontSize: 18, fontWeight: "900", lineHeight: 24 },
  liveContextBody: { color: "#B4BED3", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  partyContextCard: {
    backgroundColor: "rgba(15,16,22,0.95)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(142,184,255,0.22)",
    padding: 16,
    gap: 8,
  },
  partyContextLabel: { color: "#BDD1FF", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  partyContextTitle: { color: "#F4F7FF", fontSize: 18, fontWeight: "900", lineHeight: 24 },
  partyContextBody: { color: "#B4BED3", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },

  modeChoiceCard: {
    backgroundColor: "rgba(12,12,16,0.92)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 10,
  },
  modeChoiceLabel: { color: "#666", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  modeChoiceRow: { flexDirection: "row", gap: 10 },
  modeChoicePane: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 6,
  },
  modeChoiceTitle: { color: "#F2F5FC", fontSize: 14, fontWeight: "900" },
  modeChoiceBody: { color: "#A7B0C3", fontSize: 12, lineHeight: 17, fontWeight: "600" },

  readinessCard: {
    backgroundColor: "rgba(12,12,16,0.92)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 10,
  },
  readinessLabel: { color: "#666", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  readinessRow: { flexDirection: "row", gap: 10 },
  readinessDot: { width: 10, height: 10, borderRadius: 999, marginTop: 5 },
  readinessDotReady: { backgroundColor: "#32D583" },
  readinessDotPending: { backgroundColor: "#F79009" },
  readinessDotNeeded: { backgroundColor: "#DC143C" },
  readinessMeta: { flex: 1, gap: 4 },
  readinessHeadline: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  readinessTitle: { color: "#F2F5FC", fontSize: 13, fontWeight: "800" },
  readinessStatus: { color: "#97A3BC", fontSize: 11.5, fontWeight: "800" },
  readinessBody: { color: "#A7B0C3", fontSize: 12, lineHeight: 17, fontWeight: "600" },

  permissionsCard: {
    backgroundColor: "rgba(12,12,16,0.92)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 8,
  },
  permissionsLabel: { color: "#666", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  permissionsBody: { color: "#A7B0C3", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },

  smartHelperCard: {
    backgroundColor: "rgba(220,20,60,0.12)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.24)",
    padding: 14,
    gap: 8,
  },
  smartHelperLabel: { color: "#F7D6DD", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  smartHelperBody: { color: "#F4F7FF", fontSize: 12.5, lineHeight: 18, fontWeight: "700" },
  partyHelperCard: {
    backgroundColor: "rgba(138,178,255,0.12)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(138,178,255,0.24)",
    padding: 14,
    gap: 8,
  },
  partyHelperLabel: { color: "#DCE6FF", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  partyHelperBody: { color: "#F4F7FF", fontSize: 12.5, lineHeight: 18, fontWeight: "700" },

  // Features card
  featuresCard: {
    backgroundColor: "rgba(12,12,16,0.9)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    gap: 8,
  },
  featuresTitle: { color: "#666", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1, marginBottom: 2 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureDot: { color: "#DC143C", fontSize: 9 },
  featureLabel: { color: "#bbb", fontSize: 13, fontWeight: "600" },
});
