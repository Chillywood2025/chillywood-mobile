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
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { titles as localTitles } from "../../_data/titles";
import { reportRuntimeError } from "../../_lib/logger";
import { setUserPlan, unlockPartyPass } from "../../_lib/monetization";
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
  if (contentAccessRule === "premium") return "Premium access is required before this live room will let someone in.";
  if (contentAccessRule === "party_pass") return "A Party Pass gate is still active before entry.";
  return "No extra entitlement is needed beyond normal signed-in live access.";
};

const getCapturePolicyCopy = (capturePolicy: WatchPartyState["capturePolicy"] | null | undefined) =>
  capturePolicy === "host_managed"
    ? "Capture expectations are host-managed after you enter the live room."
    : "Capture expectations are lightweight until the live room opens.";

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
  const [accessSheetBusy, setAccessSheetBusy] = useState(false);
  const [accessSheetReason, setAccessSheetReason] = useState<AccessSheetReason | null>(null);
  const [pendingAccessPreview, setPendingAccessPreview] = useState<RoomPreview | null>(null);
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

  const onResolveJoinAccess = useCallback(async () => {
    if (!pendingAccessPreview || !accessSheetReason) return;

    setAccessSheetBusy(true);
    setJoinError(null);

    try {
      const accessKey = String(pendingAccessPreview.room.partyId ?? "").trim();
      if (!accessKey) {
        setJoinError("This room is missing the access key needed to continue.");
        return;
      }

      const unlocked = accessSheetReason === "premium_required"
        ? true
        : await unlockPartyPass(accessKey);

      if (accessSheetReason === "premium_required") {
        await setUserPlan("premium");
      } else if (!unlocked) {
        trackEvent("monetization_unlock_failure", {
          surface: "watch-party-lobby",
          reason: accessSheetReason,
          roomId: accessKey,
        });
        setJoinError("Unable to unlock Party Pass for this room yet.");
        return;
      }

      trackEvent("monetization_unlock_success", {
        surface: "watch-party-lobby",
        reason: accessSheetReason,
        roomId: accessKey,
      });

      const latestRoom = await getPartyRoom(accessKey).catch(() => null);
      const userId = await getSafePartyUserId().catch(() => "");
      const refreshedPreview = latestRoom ? { ...pendingAccessPreview, room: latestRoom } : pendingAccessPreview;
      const access = await evaluatePartyRoomAccess({
        partyId: accessKey,
        userId,
        room: latestRoom ?? pendingAccessPreview.room,
      }).catch(() => null);

      if (access?.canJoin) {
        setAccessSheetVisible(false);
        setAccessSheetReason(null);
        setPendingAccessPreview(null);
        navigateToPreviewRoom(refreshedPreview);
        return;
      }

      if (access && (access.reason === "premium_required" || access.reason === "party_pass_required")) {
        setAccessSheetReason(access.reason);
      } else {
        setJoinError("This room still isn't available for your current access level.");
      }
    } catch (error) {
      reportRuntimeError("watch-party-unlock", error, {
        reason: accessSheetReason,
      });
      setJoinError("Unable to confirm access for this room right now.");
    } finally {
      setAccessSheetBusy(false);
    }
  }, [accessSheetReason, navigateToPreviewRoom, pendingAccessPreview]);

  const onCreateRoom = async () => {
    if (!features.watchPartyEnabled) {
      setCreateError("Watch Party is disabled in the current app configuration.");
      return;
    }
    const trimmedTitleId = createTitleId.trim();
    const activeWaitingRoomType: WatchPartyRoomType = isPlayerWatchPartyLiveFlow ? "title" : "live";
    const effectiveTitleId = activeWaitingRoomType === "live" ? null : (trimmedTitleId ? trimmedTitleId : null);
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

  const activeRoomType: WatchPartyRoomType = preview?.room.roomType
    ?? preparedRoom?.room.roomType
    ?? (isPlayerWatchPartyLiveFlow || initialRouteTitleId ? "title" : "live");
  const isLiveWaitingRoom = activeRoomType === "live" && !isPlayerWatchPartyLiveFlow;
  const activeRoomContext = preview?.room ?? preparedRoom?.room ?? null;
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
      ? `Pre-entry live setup · code ${topRoomCode}`
      : isPreparingInitialCode
        ? "Preparing a room code and live handoff before the room opens."
        : didInitialCodePrepFail
          ? "Live room code unavailable right now. Generate a new code to continue."
          : "Orient the room, choose a host or viewer path, and then hand off into the live shell.")
    : (topRoomCode
      ? "Party waiting room setup with title-linked room code."
      : isPreparingInitialCode
        ? "Preparing a room code for this party waiting room."
        : didInitialCodePrepFail
          ? "Room code unavailable right now. Generate a new code to continue."
          : "Create or join a room to start the party waiting room experience.");
  const waitingRoomTagline = isLiveWaitingRoom
    ? "Get ready before the live room opens."
    : "Watch together, in sync, from anywhere.";
  const roomCodeCardValue = topRoomCode || (isPreparingInitialCode ? "Preparing code…" : "Room code unavailable");
  const roomCodeActionBusy = refreshingCode || creating || isPreparingInitialCode;
  const liveJoinModes = [
    {
      id: "host",
      title: "Host path",
      body: "Create the live room here, share the code, then enter Live Room as host.",
    },
    {
      id: "viewer",
      title: "Viewer path",
      body: "Use a live room code to preview the session, then enter as a viewer before the stage takes over.",
    },
  ];
  const liveReadinessRows = [
    {
      label: "Identity",
      status: "Ready",
      detail: "Your signed-in Chi'llywood identity is attached before you enter the live room.",
      tone: "ready" as const,
    },
    {
      label: "Room code",
      status: topRoomCode ? "Ready" : (isPreparingInitialCode ? "Preparing" : "Needed"),
      detail: topRoomCode
        ? `Live room code ${topRoomCode} is ready for share or join.`
        : isPreparingInitialCode
          ? "The room is preparing a live code before host entry opens."
          : "Generate a live code before you invite or host this session.",
      tone: topRoomCode ? "ready" as const : (isPreparingInitialCode ? "pending" as const : "needed" as const),
    },
    {
      label: "Mic / camera",
      status: "Optional now",
      detail: "Device setup stays light here. Any deeper mic or camera choices belong in Live Room.",
      tone: "pending" as const,
    },
    {
      label: "Next handoff",
      status: "Live Room",
      detail: "Join moves into /watch-party/live-stage/[partyId], where Live Room and Live Stage take over.",
      tone: "ready" as const,
    },
  ];
  const livePermissionsBody = `${getJoinPolicyCopy(activeRoomContext?.joinPolicy)} ${getContentAccessCopy(activeRoomContext?.contentAccessRule)} ${getCapturePolicyCopy(activeRoomContext?.capturePolicy)}`;
  const liveSmartHelper = topRoomCode
    ? "Your live room is ready. Share the code if you need guests first, or enter now and let Live Room handle the next-stage controls."
    : isPreparingInitialCode
      ? "Stay here while Chi'llywood prepares the live code. This waiting room is only doing pre-entry setup right now."
      : didInitialCodePrepFail
        ? "Generate a fresh code before inviting people. This room cannot hand off to the live shell without a valid live identity."
        : "If you are hosting, create the room first. If you are joining, enter a live room code and preview the session before you continue.";
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
        "Synced play & pause",
        "Live position sync",
        "Host & viewer roles",
        "Party chat",
        "Emoji reactions",
        "Host controls",
        "Live participant list",
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
              <Text style={styles.liveContextLabel}>LIVE PREVIEW</Text>
              <Text style={styles.liveContextTitle}>
                {topRoomCode ? "Your live entry stays pre-stage here." : "Set up the live room before the stage takes over."}
              </Text>
              <Text style={styles.liveContextBody}>
                {topRoomCode
                  ? "This surface keeps identity, access, and invite setup separate from Live Room and Live Stage. Comments, reactions, and mode switching belong after entry."
                  : "Live Waiting Room handles trust, readiness, and invitation. Live Room and Live Stage stay separate until you enter."}
              </Text>
            </View>

            <View style={styles.modeChoiceCard}>
              <Text style={styles.modeChoiceLabel}>JOIN MODES</Text>
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
              <Text style={styles.readinessLabel}>READINESS CHECK</Text>
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
              <Text style={styles.permissionsLabel}>VISIBILITY & CONTROL</Text>
              <Text style={styles.permissionsBody}>
                {livePermissionsBody}
              </Text>
            </View>

            <View style={styles.smartHelperCard}>
              <Text style={styles.smartHelperLabel}>SMART ENTRY HELPER</Text>
              <Text style={styles.smartHelperBody}>{liveSmartHelper}</Text>
            </View>
          </>
        ) : null}

        {/* ── Room code / invite ──────────────────────────────────────── */}
        <RoomCodeInviteCard
          roomCode={roomCodeCardValue}
          bodyText={isPreparingInitialCode
            ? (isLiveWaitingRoom
              ? "Preparing a shareable code for this live waiting room."
              : "Preparing a shareable room code for this waiting room.")
            : (isLiveWaitingRoom
              ? "Share the room code before the live room opens so guests enter through the correct live path."
              : "Share the room code to invite friends into this waiting room.")}
          styles={{
            card: styles.inviteCard,
            left: styles.inviteMeta,
            label: styles.inviteLabel,
            code: styles.inviteCode,
            body: styles.inviteBody,
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
          <Text style={styles.actionAreaLabel}>ACTIONS</Text>

          {!features.watchPartyEnabled ? (
            <View style={styles.joinCard}>
              <Text style={styles.joinLabel}>WATCH PARTY HIDDEN</Text>
              <Text style={styles.roomIdentityBody}>
                Watch Party creation and room entry are currently disabled in app configuration.
              </Text>
            </View>
          ) : null}

          <View style={styles.joinCard}>
            <Text style={styles.joinLabel}>{isLiveWaitingRoom ? "HOST THIS LIVE SESSION" : "START A ROOM"}</Text>
            {isLiveWaitingRoom ? (
              <Text style={styles.joinSupportText}>
                Create the live room here, keep the room code handy, and then hand off into Live Room as the host.
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
                <Text style={styles.primaryButtonText}>{isLiveWaitingRoom ? "Create Live Room" : "Create Room"}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.joinCard}>
            <Text style={styles.joinLabel}>{isLiveWaitingRoom ? "JOIN A LIVE ROOM" : "JOIN A ROOM"}</Text>
            {isLiveWaitingRoom ? (
              <Text style={styles.joinSupportText}>
                Enter a live room code to preview the room and join the live shell before any stage mode takes over.
              </Text>
            ) : null}

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
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          busy={accessSheetBusy}
          onConfirm={() => {
            void onResolveJoinAccess();
          }}
          onClose={() => setAccessSheetVisible(false)}
        />
      ) : null}
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
