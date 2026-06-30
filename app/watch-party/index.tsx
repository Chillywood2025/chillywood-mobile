import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveBrandingConfig,
    resolveFeatureConfig,
    resolveMonetizationConfig,
} from "../../_lib/appConfig";
import { getAppMonetizationRuntimeFeatures } from "../../_lib/featureFlags";
import {
  resolveRoomAccess,
  type RoomAccessResolution,
} from "../../_lib/accessEntitlements";
import { trackEvent } from "../../_lib/analytics";
import { getBetaAccessBlockCopy, useBetaProgram } from "../../_lib/betaProgram";
import {
    ActivityIndicator,
    ImageBackground,
    type ImageSourcePropType,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { titles as localTitles } from "../../_data/titles";
import { debugLog, reportRuntimeError } from "../../_lib/logger";
import {
    getMonetizationAccessSheetPresentation,
} from "../../_lib/monetization";
import {
  getRuntimeControlBlockedCopy,
  isRuntimeControlBlockedAccess,
  LIVE_FIRST_PREMIUM_UPSELL_COPY,
  WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY,
  requireLiveFirstPremium,
  requireWatchPartyLivePremium,
  type PremiumWatchPartyFeatureAccessDecision,
} from "../../_lib/premiumWatchPartyAccess";
import {
  formatPaidWatchPartyTicketPrice,
  purchasePaidWatchPartyTicket,
  resolvePaidWatchPartyTicketAccess,
  savePaidWatchPartyOffer,
  type PaidWatchPartyTicketAccess,
} from "../../_lib/paidWatchPartyTickets";
import { saveCreatorSandboxMonetizationConfig } from "../../_lib/creatorMonetizationSetup";
import { InternalInviteSheet } from "../../components/chat/internal-invite-sheet";
import { useSession } from "../../_lib/session";
import {
  createPartyRoom,
  getPartyRoom,
  getSafePartyUserId,
  type WatchPartyContentSourceType,
  type WatchPartyRoomType,
  type WatchPartyState,
} from "../../_lib/watchParty";
import {
  resolveWatchPartyContentSource,
  resolveWatchPartyContentSourceByParts,
  resolveWatchPartySourceId,
  resolveWatchPartySourceType,
} from "../../_lib/watchPartyContentSources";
import { AccessSheet, type AccessSheetReason } from "../../components/monetization/access-sheet";
import { MoneyScopeInfoButton } from "../../components/monetization/MoneyScopeInfoButton";
import { BetaAccessScreen } from "../../components/system/beta-access-screen";
import { RoomCodeInviteCard } from "../../components/room/room-code-invite-card";
import { PLAYER_WATCH_PARTY_SOURCE } from "../../_lib/watch-party/room-shared";
import WatchPartyLiveStageScreen from "./live-stage/[partyId]";
import { AppText } from "../../components/ui/typography";

type RoomPreview = {
  room: WatchPartyState;
  titleName: string | null;
};

type IncomingHandoff = {
  roomCode: string;
  partyId: string | null;
  titleId: string | null;
  sourceType: WatchPartyContentSourceType | null;
  sourceId: string | null;
};

type PremiumLiveUpsellCopy =
  | typeof LIVE_FIRST_PREMIUM_UPSELL_COPY
  | typeof WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY;

type EmbeddedLiveStageEntry = {
  partyId: string;
  source: string;
};

const getWaitingRoomPreviewTitle = (preview: RoomPreview) => {
  if (preview.titleName) return preview.titleName;
  return preview.room.roomType === "title" ? "Selected Title" : "Live Room";
};

const getJoinPolicyCopy = (joinPolicy: WatchPartyState["joinPolicy"] | null | undefined) =>
  joinPolicy === "locked"
    ? "Entry stays locked until the host reopens it."
    : "Signed-in members can join with the room code while the host keeps it open.";

const getContentAccessCopy = (contentAccessRule: WatchPartyState["contentAccessRule"] | null | undefined) => {
  if (contentAccessRule === "premium") return "Premium access is locked for this device or account.";
  if (contentAccessRule === "party_pass") return "Party Pass access is locked for this device or account.";
  return "No extra entitlement is required.";
};

const getCapturePolicyCopy = (capturePolicy: WatchPartyState["capturePolicy"] | null | undefined) =>
  capturePolicy === "host_managed"
    ? "Capture shifts to host-managed after you enter the room."
    : "Capture stays lightweight until the room opens.";

const getPartyJoinPolicyCopy = (joinPolicy: WatchPartyState["joinPolicy"] | null | undefined) =>
  joinPolicy === "locked"
    ? "Party entry stays locked until the host reopens it."
    : "Signed-in members can join with the room code while the host keeps it open.";

const getPartyContentAccessCopy = (contentAccessRule: WatchPartyState["contentAccessRule"] | null | undefined) => {
  if (contentAccessRule === "premium") return "Premium title access is locked for this device or account.";
  if (contentAccessRule === "party_pass") return "Party Pass access is locked for this device or account.";
  return "No extra entitlement is required.";
};

const getPartyCapturePolicyCopy = (capturePolicy: WatchPartyState["capturePolicy"] | null | undefined) =>
  capturePolicy === "host_managed"
    ? "Capture shifts to host-managed once shared playback begins."
    : "Capture stays lightweight until shared playback begins.";

const isAccessSheetReason = (reason: string | null | undefined): reason is AccessSheetReason => (
  reason === "premium_required" || reason === "party_pass_required"
);

const getWatchPartyRoomAccessMessage = (access: Pick<RoomAccessResolution, "reason" | "label"> | null | undefined) => {
  if (access?.reason === "room_locked") return "This room is locked right now. Ask the host to reopen it.";
  if (access?.reason === "removed") return "You no longer have access to this room.";
  if (access?.reason === "identity_required") return "Sign in to join Chi'llywood rooms.";
  if (access && isAccessSheetReason(access.reason)) {
    return `${access.label} access is not currently available for this room.`;
  }
  return "This room still isn't available for your current access level.";
};

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
    sourceType?: string;
    sourceId?: string;
  }>();
  const isLiveEntryMode = String(Array.isArray(params.mode) ? params.mode[0] : params.mode ?? "").trim().toLowerCase() === "live";
  const sourceParam = String(Array.isArray(params.source) ? params.source[0] : params.source ?? "").trim().toLowerCase();
  const isPlayerWatchPartyLiveFlow = sourceParam === PLAYER_WATCH_PARTY_SOURCE;
  const entryLaneKey = `${isLiveEntryMode ? "live" : "party"}:${isPlayerWatchPartyLiveFlow ? "player" : "standard"}`;
  const initialRouteRoomCode = String(Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode ?? "").trim().toUpperCase();
  const initialRoutePartyId = String(
    (Array.isArray(params.roomId) ? params.roomId[0] : params.roomId)
      ?? (Array.isArray(params.partyId) ? params.partyId[0] : params.partyId)
      ?? "",
  ).trim().toUpperCase();
  const initialLookupId = initialRouteRoomCode || initialRoutePartyId;
  const initialRouteTitleId = String(Array.isArray(params.titleId) ? params.titleId[0] : params.titleId ?? "").trim();
  const initialRouteSourceTypeRaw = String(Array.isArray(params.sourceType) ? params.sourceType[0] : params.sourceType ?? "").trim().toLowerCase();
  const initialRouteSourceType: WatchPartyContentSourceType | null =
    initialRouteSourceTypeRaw === "creator_video"
      ? "creator_video"
      : initialRouteSourceTypeRaw === "platform_title"
        ? "platform_title"
        : null;
  const initialRouteSourceId = String(Array.isArray(params.sourceId) ? params.sourceId[0] : params.sourceId ?? "").trim();
  const [joinCode, setJoinCode] = useState(() => (!isPlayerWatchPartyLiveFlow ? initialRouteRoomCode : ""));
  const [joinLookupBusy, setJoinLookupBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const createTitleId = "";
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
          sourceType: initialRouteSourceType,
          sourceId: initialRouteSourceId || initialRouteTitleId || null,
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
  const [pendingAccessDecision, setPendingAccessDecision] = useState<RoomAccessResolution | null>(null);
  const [watchPartyPremiumGate, setWatchPartyPremiumGate] = useState<PremiumWatchPartyFeatureAccessDecision | null>(null);
  const [watchPartyPremiumSheetVisible, setWatchPartyPremiumSheetVisible] = useState(false);
  const [watchPartyPremiumSheetCopy, setWatchPartyPremiumSheetCopy] = useState<PremiumLiveUpsellCopy>(WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const [embeddedLiveStageEntry, setEmbeddedLiveStageEntry] = useState<EmbeddedLiveStageEntry | null>(null);
  const [paidTicketGate, setPaidTicketGate] = useState<PaidWatchPartyTicketAccess | null>(null);
  const [paidTicketBusy, setPaidTicketBusy] = useState(false);
  const [paidTicketNotice, setPaidTicketNotice] = useState<string | null>(null);
  const [paidTicketSeatLimit, setPaidTicketSeatLimit] = useState("12");
  const handoffLoadedRef = useRef(false);
  const liveWaitingRoomLoadedRef = useRef(false);
  const lastEntryLaneKeyRef = useRef(entryLaneKey);
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

  useEffect(() => {
    if (lastEntryLaneKeyRef.current === entryLaneKey) return;
    lastEntryLaneKeyRef.current = entryLaneKey;
    setPreview(null);
    setJoinError(null);
    setJoinLookupBusy(false);
    setAccessSheetVisible(false);
    setAccessSheetReason(null);
    setPendingAccessPreview(null);
    setPendingAccessDecision(null);
    setWatchPartyPremiumGate(null);
    setWatchPartyPremiumSheetVisible(false);
    setInviteSheetVisible(false);
    setPaidTicketGate(null);
    setPaidTicketNotice(null);
    setPaidTicketBusy(false);
  }, [entryLaneKey]);

  const resolveContentDisplayName = useCallback(async (input: {
    sourceType: WatchPartyContentSourceType | null;
    sourceId: string | null;
  }) => {
    try {
      const source = await resolveWatchPartyContentSourceByParts(input);
      return source.displayName;
    } catch {
      return null;
    }
  }, []);

  const buildRoomPreview = useCallback(async (room: WatchPartyState): Promise<RoomPreview> => {
    const source = await resolveWatchPartyContentSource(room).catch(() => null);
    const titleName = source?.displayName ?? null;
    return { room, titleName };
  }, []);

  const requirePremiumRoomEntry = useCallback(async (
    roomType: WatchPartyRoomType,
    accessKey: string | null | undefined,
  ) => {
    const safeAccessKey = String(accessKey ?? "").trim();
    const isLiveRoom = roomType === "live";
    const copy = isLiveRoom ? LIVE_FIRST_PREMIUM_UPSELL_COPY : WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY;
    const access = await (isLiveRoom ? requireLiveFirstPremium : requireWatchPartyLivePremium)({
      accessKey: safeAccessKey || (isLiveRoom ? "live-first" : "watch-party-live"),
    }).catch(() => null);
    if (access?.allowed) {
      setWatchPartyPremiumGate(null);
      return true;
    }

    if (isRuntimeControlBlockedAccess(access)) {
      const blockedCopy = getRuntimeControlBlockedCopy(access);
      setWatchPartyPremiumGate(null);
      setWatchPartyPremiumSheetVisible(false);
      if (isLiveRoom) {
        setCreateError(blockedCopy.message);
      } else {
        setJoinError(blockedCopy.message);
      }
      trackEvent("runtime_control_blocked", {
        surface: "watch-party-waiting-room",
        controlKey: access?.runtimeControlKey ?? (isLiveRoom ? "live_first_enabled" : "watch_party_live_enabled"),
        accessKey: safeAccessKey || (isLiveRoom ? "live-first" : "watch-party-live"),
      });
      return false;
    }

    if (access) setWatchPartyPremiumGate(access);
    setWatchPartyPremiumSheetCopy(copy);
    setWatchPartyPremiumSheetVisible(true);
    trackEvent("monetization_gate_shown", {
      surface: "watch-party-waiting-room",
      reason: access?.reason ?? "premium_required",
      accessKey: safeAccessKey || (isLiveRoom ? "live-first" : "watch-party-live"),
    });
    return false;
  }, []);

  const paidWatchPartyCheckoutAvailable = useMemo(() => {
    const runtime = getAppMonetizationRuntimeFeatures();
    return runtime.liveMoneyEnabled && runtime.paidContentCheckoutEnabled;
  }, []);

  useEffect(() => {
    if (!canUseBetaRooms || !configReady || !features.watchPartyEnabled) return;
    void requirePremiumRoomEntry(
      isLiveEntryMode && !isPlayerWatchPartyLiveFlow ? "live" : "title",
      initialRouteSourceId
      || initialRouteTitleId
      || initialLookupId
      || (isLiveEntryMode && !isPlayerWatchPartyLiveFlow ? "live-first" : "watch-party-live"),
    );
  }, [
    canUseBetaRooms,
    configReady,
    features.watchPartyEnabled,
    initialLookupId,
    initialRouteSourceId,
    initialRouteTitleId,
    isLiveEntryMode,
    isPlayerWatchPartyLiveFlow,
    requirePremiumRoomEntry,
  ]);

  useEffect(() => {
    let active = true;
    const previewRoom = preview?.room ?? preparedRoom?.room ?? null;
    const fallbackSourceType = incomingHandoff?.sourceType
      ?? initialRouteSourceType
      ?? (incomingHandoff?.titleId || initialRouteTitleId ? "platform_title" : null);
    const nextSourceType = previewRoom ? resolveWatchPartySourceType(previewRoom) : fallbackSourceType;
    const nextSourceId = previewRoom
      ? resolveWatchPartySourceId(previewRoom)
      : String(incomingHandoff?.sourceId ?? incomingHandoff?.titleId ?? initialRouteSourceId ?? initialRouteTitleId ?? "").trim() || null;

    if (!nextSourceId) {
      setEntryTitleName(null);
      return () => {
        active = false;
      };
    }

    resolveContentDisplayName({ sourceType: nextSourceType, sourceId: nextSourceId })
      .then((name) => {
        if (active) setEntryTitleName(name);
      })
      .catch(() => {
        if (active) setEntryTitleName(null);
      });

    return () => {
      active = false;
    };
  }, [
    incomingHandoff?.sourceId,
    incomingHandoff?.sourceType,
    incomingHandoff?.titleId,
    initialRouteSourceId,
    initialRouteSourceType,
    initialRouteTitleId,
    preparedRoom?.room,
    preview?.room,
    resolveContentDisplayName,
  ]);

  const createPreparedWaitingRoom = useCallback(async (
    titleId: string | null,
    roomType: WatchPartyRoomType,
    sourceOptions?: { sourceType?: WatchPartyContentSourceType | null; sourceId?: string | null },
  ): Promise<RoomPreview | null> => {
    if (!canUseBetaRooms) return null;
    if (!(await requirePremiumRoomEntry(roomType, sourceOptions?.sourceId ?? titleId))) return null;
    const hostUserId = await getSafePartyUserId();
    const room = await createPartyRoom(titleId, hostUserId, 0, "paused", {
      roomType,
      sourceType: sourceOptions?.sourceType,
      sourceId: sourceOptions?.sourceId,
    });
    if (!room || "error" in room) return null;

    const nextPreparedRoom = await buildRoomPreview(room);
    setPreparedRoom(nextPreparedRoom);
    setIncomingHandoff({
      roomCode: room.roomCode,
      partyId: room.partyId,
      titleId: room.titleId,
      sourceType: room.sourceType,
      sourceId: room.sourceId,
    });
    setHostLabel("You are hosting");
    return nextPreparedRoom;
  }, [buildRoomPreview, canUseBetaRooms, requirePremiumRoomEntry]);

  useEffect(() => {
    if (!canUseBetaRooms) return;
    if (!configReady || !features.watchPartyEnabled) return;
    if (handoffLoadedRef.current) return;

    const rawRoomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
    const rawRoomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
    const rawPartyId = Array.isArray(params.partyId) ? params.partyId[0] : params.partyId;
    const rawTitleId = Array.isArray(params.titleId) ? params.titleId[0] : params.titleId;
    const rawSourceType = Array.isArray(params.sourceType) ? params.sourceType[0] : params.sourceType;
    const rawSourceId = Array.isArray(params.sourceId) ? params.sourceId[0] : params.sourceId;
    const incomingLookupId = String(rawRoomCode ?? rawRoomId ?? rawPartyId ?? "").trim().toUpperCase();
    const incomingPartyId = String(rawRoomId ?? rawPartyId ?? rawRoomCode ?? "").trim().toUpperCase();
    const incomingRoomCode = String(rawRoomCode ?? "").trim().toUpperCase();
    const incomingTitleId = String(rawTitleId ?? "").trim();
    const incomingSourceTypeRaw = String(rawSourceType ?? "").trim().toLowerCase();
    const incomingSourceType: WatchPartyContentSourceType | null =
      incomingSourceTypeRaw === "creator_video"
        ? "creator_video"
        : incomingSourceTypeRaw === "platform_title"
          ? "platform_title"
          : null;
    const incomingSourceId = String(rawSourceId ?? incomingTitleId ?? "").trim();

    if (!incomingLookupId) return;
    handoffLoadedRef.current = true;
    if (!isPlayerWatchPartyLiveFlow && incomingRoomCode) setJoinCode(incomingRoomCode);
    setHostLabel("Connecting room…");
    setIncomingHandoff({
      roomCode: incomingRoomCode,
      partyId: incomingPartyId || null,
      titleId: incomingTitleId || null,
      sourceType: incomingSourceType,
      sourceId: incomingSourceId || null,
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
        setIncomingHandoff({
          roomCode: room.roomCode,
          partyId: room.partyId,
          titleId: room.titleId,
          sourceType: room.sourceType,
          sourceId: room.sourceId,
        });
        setPreparedRoom(await buildRoomPreview(room));
      } catch (error) {
        reportRuntimeError("watch-party-handoff", error, {
          incomingLookupId,
        });
      }
    };

    loadIncomingRoom();
  }, [buildRoomPreview, canUseBetaRooms, configReady, features.watchPartyEnabled, isPlayerWatchPartyLiveFlow, params.partyId, params.roomCode, params.roomId, params.sourceId, params.sourceType, params.titleId]);

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
    debugLog("watch-party", "watch_party_find_room_pressed", {
      hasJoinCode: Boolean(joinCode.trim()),
      watchPartyEnabled: features.watchPartyEnabled,
      joinLookupBusy,
    });
    if (!features.watchPartyEnabled) {
      setJoinError("Watch Party is disabled in the current app configuration.");
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter a room code to find a Watch-Party room.");
      return;
    }

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

      const nextPreview = await buildRoomPreview(room);
      debugLog("watch-party", "watch_party_room_lookup_preview_ready", {
        hasPartyId: Boolean(nextPreview.room.partyId),
        roomType: nextPreview.room.roomType,
        hasTitle: Boolean(nextPreview.titleName),
      });
      setPreview(nextPreview);
    } catch (error) {
      reportRuntimeError("watch-party-lookup", error, {
        roomCode: code,
      });
      setJoinError("Couldn't reach the server. Check your connection.");
    } finally {
      setJoinLookupBusy(false);
    }
  };

  const buildRoomEntryParams = useCallback((nextPartyId: string, options?: {
    roomCode?: string | null;
    titleId?: string | null;
    sourceType?: WatchPartyContentSourceType | null;
    sourceId?: string | null;
  }) => {
    const nextRoomCode = String(options?.roomCode ?? "").trim().toUpperCase();
    const nextTitleId = String(options?.titleId ?? "").trim();
    const nextSourceType = options?.sourceType ?? (nextTitleId ? "platform_title" : null);
    const nextSourceId = String(options?.sourceId ?? nextTitleId ?? "").trim();

    return {
      partyId: nextPartyId,
      ...(nextRoomCode ? { roomCode: nextRoomCode } : {}),
      ...(nextTitleId ? { titleId: nextTitleId } : {}),
      ...(nextSourceType ? { sourceType: nextSourceType } : {}),
      ...(nextSourceId ? { sourceId: nextSourceId } : {}),
      ...(isPlayerWatchPartyLiveFlow ? { source: PLAYER_WATCH_PARTY_SOURCE } : {}),
    };
  }, [isPlayerWatchPartyLiveFlow]);

  const navigateToRoom = useCallback((options: {
    partyId: string;
	    roomType: WatchPartyRoomType;
	    roomCode?: string | null;
	    titleId?: string | null;
	    sourceType?: WatchPartyContentSourceType | null;
	    sourceId?: string | null;
	  }) => {
	    const params = buildRoomEntryParams(options.partyId, {
	      roomCode: options.roomCode,
	      titleId: options.titleId,
	      sourceType: options.sourceType,
	      sourceId: options.sourceId,
	    });

    if (options.roomType === "live") {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (key === "partyId" || value == null) continue;
        query.set(key, String(value));
      }
      query.set("partyId", options.partyId);
      const queryString = query.toString();
      const liveStageRoute = `/watch-party/live-stage${queryString ? `?${queryString}` : ""}`;
      debugLog("watch-party", "watch_party_live_stage_route_prepared", {
        hasRoute: Boolean(liveStageRoute),
        hasPartyId: Boolean(options.partyId),
      });
      debugLog("watch-party", "watch_party_live_stage_embedded_open", {
        hasPartyId: Boolean(options.partyId),
        source: isPlayerWatchPartyLiveFlow ? PLAYER_WATCH_PARTY_SOURCE : "watch-party-index-proof",
      });
      setEmbeddedLiveStageEntry({
        partyId: options.partyId,
        source: isPlayerWatchPartyLiveFlow ? PLAYER_WATCH_PARTY_SOURCE : "watch-party-index-proof",
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
      sourceType: nextPreview.room.sourceType,
      sourceId: nextPreview.room.sourceId,
    });
  }, [navigateToRoom]);

  const attemptJoinRoom = useCallback(async (nextPreview: RoomPreview) => {
    setJoinError(null);
    setPaidTicketNotice(null);
    const nextPartyId = String(nextPreview.room.partyId ?? "").trim();
    debugLog("watch-party", "join_now_room_lookup_start", {
      partyId: nextPartyId,
      roomType: nextPreview.room.roomType,
    });
    if (!nextPartyId) {
      debugLog("watch-party", "join_now_blocked_reason", {
        reason: "missing_party_id",
      });
      setJoinError("Room is missing an id. Try another code.");
      return;
    }

    const latestRoom = await getPartyRoom(nextPartyId).catch((error) => {
      debugLog("watch-party", "join_now_error", {
        partyId: nextPartyId,
        stage: "room_lookup",
        message: error instanceof Error ? error.message : "room_lookup_failed",
      });
      return null;
    });

    if (!latestRoom) {
      debugLog("watch-party", "join_now_room_expired", {
        partyId: nextPartyId,
      });
      setPaidTicketGate(null);
      setJoinError("This room is no longer active.");
      return;
    }

    const currentPreview = { ...nextPreview, room: latestRoom };
    debugLog("watch-party", "join_now_room_lookup_success", {
      partyId: latestRoom.partyId,
      roomType: latestRoom.roomType,
    });

    if (!(await requirePremiumRoomEntry(
      currentPreview.room.roomType,
      currentPreview.room.sourceId ?? currentPreview.room.titleId ?? nextPartyId,
    ))) {
      debugLog("watch-party", "join_now_blocked_reason", {
        partyId: nextPartyId,
        reason: "premium_or_runtime_gate",
      });
      return;
    }

    if (currentPreview.room.roomType !== "live") {
      debugLog("watch-party", "join_now_ticket_check_start", {
        partyId: nextPartyId,
      });
      const ticketAccess = await resolvePaidWatchPartyTicketAccess(nextPartyId).catch((error) => {
        debugLog("watch-party", "join_now_error", {
          partyId: nextPartyId,
          stage: "ticket_check",
          message: error instanceof Error ? error.message : "ticket_check_failed",
        });
        return null;
      });
      if (!ticketAccess) {
        debugLog("watch-party", "join_now_blocked_reason", {
          partyId: nextPartyId,
          reason: "ticket_check_unavailable",
        });
        setJoinError("Unable to confirm Room Pass access right now.");
        return;
      }
      if (ticketAccess.offer?.id) {
        debugLog("watch-party", "join_now_paid_offer_detected", {
          partyId: nextPartyId,
          offerId: ticketAccess.offer.id,
          status: ticketAccess.offer.status,
          requiresPurchase: ticketAccess.requiresPurchase,
        });
      }
      if (!ticketAccess.allowed) {
        debugLog("watch-party", "join_now_ticket_missing", {
          partyId: nextPartyId,
          reason: ticketAccess.reason,
          requiresPurchase: ticketAccess.requiresPurchase,
        });
        debugLog("watch-party", "join_now_route_waiting_room", {
          partyId: nextPartyId,
          reason: ticketAccess.requiresPurchase ? "ticket_purchase_required" : ticketAccess.reason,
        });
        setPaidTicketGate(ticketAccess);
        setPaidTicketNotice(
          ticketAccess.requiresPurchase
            ? "Reserve your seat before entering the waiting room."
            : "This Seat Pass is not available right now.",
        );
        return;
      }
      if (ticketAccess.ticketId) {
        debugLog("watch-party", "join_now_ticket_active", {
          partyId: nextPartyId,
          ticketId: ticketAccess.ticketId,
        });
      }
    }

    const userId = await getSafePartyUserId().catch(() => "");
    const access = await resolveRoomAccess({
      roomSurface: "watch_party",
      partyId: nextPartyId,
      userId,
      room: currentPreview.room,
    }).catch(() => null);

    if (!access) {
      debugLog("watch-party", "join_now_blocked_reason", {
        partyId: nextPartyId,
        reason: "access_unknown",
      });
      trackEvent("room_join_failure", {
        surface: "watch-party-lobby",
        reason: "access_unknown",
        roomId: nextPartyId,
      });
      setJoinError("Unable to confirm room access right now. Try again.");
      return;
    }

    if (access.isAllowed) {
      debugLog("watch-party", "join_now_route_party_room", {
        partyId: nextPartyId,
      });
      trackEvent("room_join_success", {
        surface: "watch-party-lobby",
        roomId: nextPartyId,
      });
      navigateToPreviewRoom(currentPreview);
      return;
    }

    if (isAccessSheetReason(access.reason)) {
      debugLog("watch-party", "join_now_blocked_reason", {
        partyId: nextPartyId,
        reason: access.reason,
      });
      trackEvent("monetization_gate_shown", {
        surface: "watch-party-lobby",
        reason: access.reason,
        roomId: nextPartyId,
      });
      setPendingAccessPreview(currentPreview);
      setPendingAccessDecision(access);
      setAccessSheetReason(access.reason);
      setAccessSheetVisible(true);
      return;
    }

    debugLog("watch-party", "join_now_blocked_reason", {
      partyId: nextPartyId,
      reason: access.reason,
    });
    setJoinError(getWatchPartyRoomAccessMessage(access));
  }, [navigateToPreviewRoom, requirePremiumRoomEntry]);

  const onConfirmJoin = async () => {
    debugLog("watch-party", "join_now_pressed", {
      hasPreview: Boolean(preview),
      partyId: preview?.room.partyId ?? null,
    });
    if (!preview) {
      debugLog("watch-party", "join_now_blocked_reason", {
        reason: "missing_preview",
      });
      setJoinError("Find the room again before joining.");
      return;
    }
    await attemptJoinRoom(preview);
  };

  const onSavePaidTicketOffer = useCallback(async () => {
    if (!paidWatchPartyCheckoutAvailable) {
      setPaidTicketNotice("Seat Pass status is active. Tester-safe setup requires provider/test checkout readiness; live money, payouts, cash-out, and payable balances remain off.");
      return;
    }
    const targetRoom = preparedRoom?.room ?? preview?.room ?? null;
    const partyId = String(targetRoom?.partyId ?? "").trim();
    if (!targetRoom || !partyId || targetRoom.roomType === "live") {
      setPaidTicketNotice("Create a Party Room before adding a Seat Pass.");
      return;
    }
    const seatLimit = Number.parseInt(paidTicketSeatLimit, 10);
    setPaidTicketBusy(true);
    setPaidTicketNotice(null);
    try {
      const offer = await savePaidWatchPartyOffer({
        partyId,
        title: `${getWaitingRoomPreviewTitle({ room: targetRoom, titleName: entryTitleName })} Seat Pass`,
        priceCents: 99,
        seatLimit: Number.isFinite(seatLimit) && seatLimit > 0 ? seatLimit : null,
        status: "sandbox",
      });
      await saveCreatorSandboxMonetizationConfig({
        displayName: "Sandbox Watch-Party Seat Pass",
        metadata: {
          party_id: offer.partyId,
          setup_surface: "watch_party_waiting_room",
          viewer_route: "/watch-party/[partyId]",
        },
        productKey: "watch_party_live_ticket_sandbox_099",
        sourceId: offer.id,
        sourceType: "watch_party_live",
      });
      setPaidTicketGate(null);
      setPaidTicketNotice(
        `Seat Passes are sandbox/test only at ${formatPaidWatchPartyTicketPrice(offer.priceCents, offer.currency)} and not payable. Live money is not active.`,
      );
      trackEvent("money_offer_created", {
        creator_id: targetRoom.hostUserId,
        offer_type: "paid_watch_party",
        route_name: "watch-party",
        room_type: "party_room",
        source_surface: "party_waiting_room",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message === "Enter a real source UUID before saving."
        || message === "Choose an approved sandbox product tier."
        || message === "Source type does not match the selected product tier."
      ) {
        setPaidTicketNotice(message);
      } else if (/internal sandbox monetization setup/i.test(message)) {
        setPaidTicketNotice("This account is not approved for internal sandbox monetization setup.");
      } else if (/product|provider|revenuecat|google play/i.test(message)) {
        setPaidTicketNotice("Sandbox product is not available on this build/account.");
      } else {
        setPaidTicketNotice("Paid Seat Pass setup is not available for this room yet.");
      }
    } finally {
      setPaidTicketBusy(false);
    }
  }, [entryTitleName, paidTicketSeatLimit, paidWatchPartyCheckoutAvailable, preparedRoom, preview]);

  const onBuyPaidTicketAndJoin = useCallback(async () => {
    if (!paidWatchPartyCheckoutAvailable) {
      setPaidTicketNotice("Seat Pass status is active. Tester-safe checkout requires provider/test readiness; live money, payouts, cash-out, and payable balances remain off.");
      return;
    }
    const targetPreview = preview ?? preparedRoom;
    const partyId = String(targetPreview?.room.partyId ?? "").trim();
    if (!targetPreview || !partyId) {
      setPaidTicketNotice("This room is missing the Seat Pass details needed to continue.");
      return;
    }
    if (!isSignedIn) {
      router.push("/login" as Parameters<typeof router.push>[0]);
      return;
    }
    setPaidTicketBusy(true);
    setPaidTicketNotice(null);
    try {
      const result = await purchasePaidWatchPartyTicket({
        partyId,
        sourceSurface: "party_waiting_room",
      });
      setPaidTicketGate(result.access);
      setPaidTicketNotice(result.message);
      if (result.ok && result.access.allowed) {
        navigateToPreviewRoom(targetPreview);
      }
    } catch {
      setPaidTicketNotice("Seat Pass checkout could not start. Try again later.");
    } finally {
      setPaidTicketBusy(false);
    }
  }, [isSignedIn, navigateToPreviewRoom, paidWatchPartyCheckoutAvailable, preparedRoom, preview, router]);

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
      const access = await resolveRoomAccess({
        roomSurface: "watch_party",
        partyId: accessKey,
        userId,
        room: latestRoom ?? pendingAccessPreview.room,
      }).catch(() => null);

      if (access?.isAllowed) {
        if (!(await requirePremiumRoomEntry(
          refreshedPreview.room.roomType,
          refreshedPreview.room.sourceId ?? refreshedPreview.room.titleId ?? accessKey,
        ))) {
          return {
            message: refreshedPreview.room.roomType === "live"
              ? "Live rooms still need Premium access on this account."
              : "Watch-Party Live still needs Premium access on this account.",
            tone: "error" as const,
          };
        }

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

      if (access && isAccessSheetReason(access.reason)) {
        setPendingAccessDecision(access);
        setAccessSheetReason(access.reason);
        const message = access.monetization.issues[0] ?? getWatchPartyRoomAccessMessage(access);
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

      const message = getWatchPartyRoomAccessMessage(access);
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
  }, [accessSheetReason, navigateToPreviewRoom, pendingAccessDecision, pendingAccessPreview, requirePremiumRoomEntry]);

  const onCreateRoom = async () => {
    debugLog("watch-party", "watch_party_create_room_pressed", {
      roomType: inferredWaitingRoomType,
      hasPreparedRoom: Boolean(preparedRoom?.room.partyId),
      isPreparingInitialCode,
      creating,
      watchPartyEnabled: features.watchPartyEnabled,
    });
    if (!features.watchPartyEnabled) {
      setCreateError("Watch Party is disabled in the current app configuration.");
      return;
    }
    const trimmedTitleId = createTitleId.trim();
    const defaultPartyTitleId = String(preparedRoom?.room.titleId ?? incomingHandoff?.titleId ?? initialRouteTitleId ?? "").trim();
    const defaultSourceType = preparedRoom?.room.sourceType ?? incomingHandoff?.sourceType ?? initialRouteSourceType;
    const defaultSourceId = String(preparedRoom?.room.sourceId ?? incomingHandoff?.sourceId ?? initialRouteSourceId ?? defaultPartyTitleId ?? "").trim();
    const activeWaitingRoomType: WatchPartyRoomType = inferredWaitingRoomType;
    const effectiveTitleId = activeWaitingRoomType === "live" ? null : (trimmedTitleId || defaultPartyTitleId || null);
    const effectiveSourceType = activeWaitingRoomType === "live"
      ? null
      : (defaultSourceType ?? (effectiveTitleId ? "platform_title" : null));
    const effectiveSourceId = activeWaitingRoomType === "live"
      ? null
      : (defaultSourceId || effectiveTitleId || null);
    const preparedTargetPartyId = String(preparedRoom?.room.partyId ?? incomingHandoff?.partyId ?? initialRoutePartyId ?? "").trim();
    const preparedTargetRoomCode = String(preparedRoom?.room.roomCode ?? incomingHandoff?.roomCode ?? initialRouteRoomCode ?? "").trim().toUpperCase();
    const preparedTargetTitleId = String(preparedRoom?.room.titleId ?? incomingHandoff?.titleId ?? initialRouteTitleId ?? "").trim();
    const shouldGuardCreateDuringInitialPrep = !effectiveTitleId && isPreparingInitialCode && !preparedTargetPartyId;

    if (creating || shouldGuardCreateDuringInitialPrep) return;

    if (activeWaitingRoomType !== "live" && !effectiveTitleId && !effectiveSourceId && !preparedTargetPartyId) {
      setCreateError("Choose content first to start Watch-Party Live.");
      return;
    }

    if (!(await requirePremiumRoomEntry(
      activeWaitingRoomType,
      effectiveSourceId ?? effectiveTitleId ?? preparedTargetPartyId,
    ))) {
      return;
    }

    setCreateError(null);
    setCreating(true);

    try {
      const hostUserId = await getSafePartyUserId();
      if (!effectiveTitleId && preparedTargetPartyId) {
        const preparedHostUserId = String(preparedRoom?.room.hostUserId ?? "").trim();
        const preparedRoomBelongsToCurrentUser = !!preparedHostUserId && preparedHostUserId === hostUserId;

        if (!preparedRoomBelongsToCurrentUser) {
          debugLog("watch-party", "watch_party_prepared_room_ignored", {
            roomType: preparedRoom?.room.roomType ?? activeWaitingRoomType,
            hasPartyId: Boolean(preparedTargetPartyId),
            hostMatchesCurrentUser: false,
          });
          setPreparedRoom(null);
          setIncomingHandoff(null);
        } else {
          const nextPartyId = preparedTargetPartyId;
          if (nextPartyId) {
            debugLog("watch-party", "watch_party_navigate_prepared_room", {
              roomType: preparedRoom?.room.roomType ?? activeWaitingRoomType,
              hasPartyId: Boolean(nextPartyId),
              hasRoomCode: Boolean(preparedTargetRoomCode),
              hasTitleId: Boolean(preparedTargetTitleId),
              sourceType: defaultSourceType ?? null,
            });
            navigateToRoom({
              partyId: nextPartyId,
              roomType: preparedRoom?.room.roomType ?? activeWaitingRoomType,
              roomCode: preparedTargetRoomCode,
              titleId: preparedTargetTitleId,
              sourceType: defaultSourceType,
              sourceId: defaultSourceId || null,
            });
            return;
          }
        }
      }

      const roomType = effectiveTitleId ? "title" : activeWaitingRoomType;

      const room = await createPartyRoom(effectiveTitleId, hostUserId, 0, "paused", {
        roomType,
        sourceType: effectiveSourceType,
        sourceId: effectiveSourceId,
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
        sourceType: room.sourceType,
        sourceId: room.sourceId,
      });
    } catch (error) {
      reportRuntimeError("watch-party-create", error, {
        titleId: effectiveTitleId,
        sourceType: effectiveSourceType,
        sourceId: effectiveSourceId,
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

  const onBrowseTitles = useCallback(() => {
    router.push("/(tabs)/explore");
  }, [router]);

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
      const requestedSourceType = preparedRoom?.room.sourceType ?? incomingHandoff?.sourceType ?? initialRouteSourceType ?? (requestedTitleId ? "platform_title" : null);
      const requestedSourceId = String(preparedRoom?.room.sourceId ?? incomingHandoff?.sourceId ?? initialRouteSourceId ?? requestedTitleId ?? "").trim() || null;
      const roomType: WatchPartyRoomType = preparedRoom?.room.roomType ?? activeRoomType;

      if (roomType !== "live" && !requestedTitleId && !requestedSourceId) {
        setCreateError("Choose content first to generate a Party Room code.");
        return;
      }

      const nextPreparedRoom = await createPreparedWaitingRoom(requestedTitleId, roomType, {
        sourceType: requestedSourceType,
        sourceId: requestedSourceId,
      });
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
    ?? (incomingHandoff?.sourceId || incomingHandoff?.titleId || initialRouteSourceId || initialRouteTitleId || isPlayerWatchPartyLiveFlow
      ? "title"
      : isLiveEntryMode
        ? "live"
        : "title");
  const activeRoomType: WatchPartyRoomType = inferredWaitingRoomType;
  const isLiveWaitingRoom = activeRoomType === "live" && !isPlayerWatchPartyLiveFlow;
  const activeRoomContext = preview?.room ?? preparedRoom?.room ?? null;
  const partyTitleId = String(activeRoomContext?.titleId ?? incomingHandoff?.titleId ?? initialRouteTitleId ?? "").trim();
  const partySourceType = activeRoomContext?.sourceType ?? incomingHandoff?.sourceType ?? initialRouteSourceType ?? (partyTitleId ? "platform_title" : null);
  const partySourceId = String(activeRoomContext?.sourceId ?? incomingHandoff?.sourceId ?? initialRouteSourceId ?? partyTitleId ?? "").trim();
  const partyTitleName = preview?.titleName
    ?? preparedRoom?.titleName
    ?? entryTitleName
    ?? (partySourceType === "creator_video"
      ? "Creator Video"
      : partyTitleId
        ? "Selected Title"
        : "Title selection needed");
  const partyTitleLocked = !isLiveWaitingRoom && !!(partyTitleId || partySourceId);
  const topRoomCode = preparedRoom?.room.roomCode ?? incomingHandoff?.roomCode ?? initialRouteRoomCode ?? "";
  const isPreparingInitialCode = initialCodeStatus === "preparing" && !topRoomCode;
  const didInitialCodePrepFail = initialCodeStatus === "failed" && !topRoomCode;
  const trimmedCreateTitleId = createTitleId.trim();
  const preparedTargetPartyId = String(preparedRoom?.room.partyId ?? incomingHandoff?.partyId ?? initialRoutePartyId ?? "").trim();
  const shouldGuardCreateDuringInitialPrep = !trimmedCreateTitleId && isPreparingInitialCode && !preparedTargetPartyId;
  const isMissingWatchPartyContent = !isLiveWaitingRoom && !partyTitleLocked && !preparedTargetPartyId;
  const createActionBusy = creating || shouldGuardCreateDuringInitialPrep;
  const createActionDisabled = createActionBusy || isMissingWatchPartyContent || !features.watchPartyEnabled;
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
      ? `Live room code ${topRoomCode} is ready.`
      : isPreparingInitialCode
        ? "Preparing the live room code before entry opens."
        : didInitialCodePrepFail
          ? "Live room code unavailable right now. Generate a new code to continue."
          : "Create or join the live room to continue.")
    : (topRoomCode
      ? `${partyTitleName} · room code ${topRoomCode}`
      : isPreparingInitialCode
        ? "Preparing the party room code before entry opens."
        : didInitialCodePrepFail
          ? "Room code unavailable right now. Generate a new code to continue."
          : partyTitleId || partySourceId
            ? `${partyTitleName} is selected for this room.`
            : "Create the room or join by code to continue.");
  const waitingRoomTagline = isLiveWaitingRoom
    ? "Set the live room before stage entry."
    : "Set the party room before shared playback.";
  const roomCodeCardValue = topRoomCode || (isPreparingInitialCode ? "Preparing code…" : "Room code unavailable");
  const roomCodeActionBusy = refreshingCode || creating || isPreparingInitialCode;
  const waitingRoomInviteMessage = isLiveWaitingRoom
    ? `Join me in a Chi'llywood live room.\n\nRoom code: ${topRoomCode}\n\nOpen Chi'llywood -> Live Watch-Party -> enter the code to join the live room.`
    : `Join me in Chi'llywood Watch-Party Live.\n\nRoom code: ${topRoomCode}\n\nOpen Chi'llywood -> Watch-Party Live -> enter the code to join the party room.`;
  const liveReadinessRows = [
    {
      label: "Room code",
      status: topRoomCode ? "Ready" : (isPreparingInitialCode ? "Preparing" : "Needed"),
      detail: topRoomCode
        ? `Live room code ${topRoomCode} is ready to share.`
        : isPreparingInitialCode
          ? "Preparing the live code before host or viewer entry opens."
          : "Generate a live room code before you invite or host this session.",
      tone: topRoomCode ? "ready" as const : (isPreparingInitialCode ? "pending" as const : "needed" as const),
    },
  ];
  const livePermissionsBody = `${getJoinPolicyCopy(activeRoomContext?.joinPolicy)} ${getContentAccessCopy(activeRoomContext?.contentAccessRule)} ${getCapturePolicyCopy(activeRoomContext?.capturePolicy)}`;
  const partyReadinessRows = [
    {
      label: "Title",
      status: partyTitleId || partySourceId ? "Ready" : "Needed",
      detail: partyTitleId || partySourceId
        ? `${partyTitleName} is selected for this waiting room.`
        : "Confirm the title before you host so the shared room stays title-first and intentional.",
      tone: partyTitleId || partySourceId ? "ready" as const : "needed" as const,
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
  ];
  const partyPermissionsBody = `${getPartyJoinPolicyCopy(activeRoomContext?.joinPolicy)} ${getPartyContentAccessCopy(activeRoomContext?.contentAccessRule)} ${getPartyCapturePolicyCopy(activeRoomContext?.capturePolicy)}`;
  const waitingRoomReadinessRows = isLiveWaitingRoom ? liveReadinessRows : partyReadinessRows;
  const waitingRoomPermissionsBody = isLiveWaitingRoom ? livePermissionsBody : partyPermissionsBody;
  const sourcePreflightStatus = isLiveWaitingRoom
    ? "Ready"
    : partyTitleId || partySourceId
      ? "Ready"
      : "Needed";
  const sourcePreflightBody = isLiveWaitingRoom
    ? "Live Watch-Party starts without a title source."
    : partyTitleId || partySourceId
      ? `${partyTitleName} is selected for Watch-Party Live.`
      : "Choose content first to start Watch-Party Live.";
  const hostPreflightRows = [
    {
      label: "Room type",
      status: isLiveWaitingRoom ? "Live Watch-Party" : "Watch-Party Live",
      detail: isLiveWaitingRoom ? "People-first live room entry." : "Content-first Party Room entry.",
    },
    {
      label: "Audience",
      status: activeRoomContext?.joinPolicy === "locked" ? "Locked" : "Room code",
      detail: isLiveWaitingRoom ? getJoinPolicyCopy(activeRoomContext?.joinPolicy) : getPartyJoinPolicyCopy(activeRoomContext?.joinPolicy),
    },
    {
      label: "Mic / Camera",
      status: isLiveWaitingRoom ? "Live Room" : "Party Room",
      detail: isLiveWaitingRoom
        ? "Mic and camera setup stays inside Live Room."
        : "Watch-Party Live camera setup stays inside Party Room and shared Player.",
    },
    {
      label: "Source / Content",
      status: sourcePreflightStatus,
      detail: sourcePreflightBody,
    },
    {
      label: "Who can speak",
      status: "Host managed",
      detail: isLiveWaitingRoom
        ? "Speaker seats stay controlled by the Live Room."
        : "Party Room voice controls stay controlled by the room.",
    },
    {
      label: "Safety controls",
      status: "Destination room",
      detail: "Access checks, reports, and host actions remain in their existing room surfaces.",
    },
    {
      label: "Paid / Free status",
      status: "Checked before entry",
      detail: isLiveWaitingRoom
        ? "Live access uses the existing Premium check."
        : "Watch-Party Live access uses the existing Premium or Party Pass check.",
    },
    {
      label: "Start",
      status: isLiveWaitingRoom ? "Create Live Room" : "Create Party Room",
      detail: "Start uses the existing room creation path.",
    },
  ];
  const waitingRoomInviteBody = isPreparingInitialCode
    ? (isLiveWaitingRoom
      ? "Preparing a shareable code for this live waiting room."
      : "Preparing a shareable room code for this waiting room.")
    : "Invite people in Chi'lly Chat, or fall back to system share.";
  const shouldShowWaitingRoomSetupShell = Boolean(
    activeRoomContext || topRoomCode || partyTitleId || partySourceId || isPreparingInitialCode || didInitialCodePrepFail,
  );
  const shouldShowWaitingRoomInviteSection = Boolean(topRoomCode || isPreparingInitialCode || didInitialCodePrepFail);
  const roomCodeButtonLabel = topRoomCode ? "Generate New Code" : "Generate Room Code";
  const watchPartyPremiumGatePresentation = watchPartyPremiumGate
    ? getMonetizationAccessSheetPresentation({
        gate: watchPartyPremiumGate,
        appDisplayName: branding.appDisplayName,
        premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
        premiumUpsellBody: monetizationConfig.premiumUpsellBody,
      })
    : null;

  const renderWaitingRoomSetupShell = () => {
    if (!shouldShowWaitingRoomSetupShell) return null;

    return (
      <>
        <View style={styles.hostPreflightCard}>
          <View style={styles.hostPreflightHeader}>
            <AppText scale="caption" style={styles.hostPreflightLabel}>HOST PREFLIGHT</AppText>
            <AppText scale="caption" style={styles.hostPreflightPill}>{isLiveWaitingRoom ? "Live" : "Party"}</AppText>
          </View>
          {hostPreflightRows.map((row) => (
            <View key={row.label} style={styles.hostPreflightRow}>
              <View style={styles.hostPreflightCopy}>
                <AppText scale="footnote" style={styles.hostPreflightTitle}>{row.label}</AppText>
                <AppText scale="caption" style={styles.hostPreflightBody}>{row.detail}</AppText>
              </View>
              <AppText scale="caption" style={styles.hostPreflightStatus}>{row.status}</AppText>
            </View>
          ))}
        </View>

        <View style={styles.readinessCard}>
          <AppText scale="caption" style={styles.readinessLabel}>SETUP STATUS</AppText>
          {waitingRoomReadinessRows.map((entry) => (
            <View key={entry.label} style={styles.readinessRow}>
              <View style={[styles.readinessDot, entry.tone === "ready"
                ? styles.readinessDotReady
                : entry.tone === "pending"
                  ? styles.readinessDotPending
                  : styles.readinessDotNeeded]} />
              <View style={styles.readinessMeta}>
                <View style={styles.readinessHeadline}>
                  <AppText scale="footnote" style={styles.readinessTitle}>{entry.label}</AppText>
                  <AppText scale="caption" style={styles.readinessStatus}>{entry.status}</AppText>
                </View>
                <AppText scale="caption" style={styles.readinessBody}>{entry.detail}</AppText>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.permissionsCard}>
          <AppText scale="caption" style={styles.permissionsLabel}>ROOM ACCESS</AppText>
          <AppText scale="footnote" style={styles.permissionsBody}>
            {waitingRoomPermissionsBody}
          </AppText>
        </View>

        {!isLiveWaitingRoom && topRoomCode ? (
          <View style={styles.permissionsCard}>
            <AppText scale="caption" style={styles.permissionsLabel}>ROOM PASSES</AppText>
            <AppText scale="footnote" style={styles.permissionsBody}>
              Paid Watch-Party Seat Pass status is active for setup and tester-safe resolution. Live money stays off while room entry, Premium gates, and host controls remain available.
            </AppText>
            <MoneyScopeInfoButton scope="watch_party_ticket" label="What does this Seat Pass unlock?" />
            {hostLabel === "You are hosting" ? (
              <>
                <TextInput
                  value={paidTicketSeatLimit}
                  onChangeText={setPaidTicketSeatLimit}
                  placeholder="Seat limit"
                  placeholderTextColor="#5A5A5A"
                  keyboardType="number-pad"
                  style={styles.input}
                  editable={!paidTicketBusy}
                />
                <TouchableOpacity
                  style={[styles.generateCodeButton, paidTicketBusy && styles.generateCodeButtonDisabled]}
                  onPress={onSavePaidTicketOffer}
                  activeOpacity={0.85}
                  disabled={paidTicketBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Set up paid Watch-Party Seat Pass"
                >
                  <AppText scale="footnote" style={styles.generateCodeButtonText}>
                    {paidTicketBusy ? "Saving Seat Pass" : "Set Up Seat Pass"}
                  </AppText>
                </TouchableOpacity>
              </>
            ) : paidTicketGate?.requiresPurchase ? (
              <TouchableOpacity
                style={[styles.generateCodeButton, paidTicketBusy && styles.generateCodeButtonDisabled]}
                onPress={onBuyPaidTicketAndJoin}
                activeOpacity={0.85}
                disabled={paidTicketBusy}
                testID="tester-watch-party-ticket-button"
                accessibilityRole="button"
                accessibilityLabel="Get Watch-Party Seat"
              >
                <AppText scale="footnote" style={styles.generateCodeButtonText}>
                  {paidTicketBusy ? "Opening Store" : paidWatchPartyCheckoutAvailable ? "Get Seat Pass" : "Seat Pass status"}
                </AppText>
              </TouchableOpacity>
            ) : null}
            {paidTicketNotice ? <AppText scale="footnote" style={styles.errorText}>{paidTicketNotice}</AppText> : null}
          </View>
        ) : null}

        {shouldShowWaitingRoomInviteSection ? (
          <>
            <RoomCodeInviteCard
              roomCode={roomCodeCardValue}
              bodyText={waitingRoomInviteBody}
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
              disabled={roomCodeActionBusy}
            >
              {refreshingCode || isPreparingInitialCode ? (
                <View style={styles.lookingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <AppText scale="footnote" style={styles.generateCodeButtonText}>
                    {isPreparingInitialCode ? "  Preparing room code…" : "  Generating new code…"}
                  </AppText>
                </View>
              ) : (
                <AppText scale="footnote" style={styles.generateCodeButtonText}>{roomCodeButtonLabel}</AppText>
              )}
            </TouchableOpacity>
          </>
        ) : null}
      </>
    );
  };

  if (embeddedLiveStageEntry) {
    return (
      <WatchPartyLiveStageScreen
        routePartyId={embeddedLiveStageEntry.partyId}
        routeMode="live"
        routeSource={embeddedLiveStageEntry.source}
      />
    );
  }

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
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
        >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <AppText scale="caption" style={styles.kicker}>{branding.appDisplayName.toUpperCase()}</AppText>
        <AppText scale="body" style={styles.tagline}>{waitingRoomTagline}</AppText>

        {/* ── Presence / identity ─────────────────────────────────────── */}
        <View style={styles.presenceCard}>
          <View style={styles.presenceAvatar}>
            <AppText scale="title3" style={styles.presenceAvatarText}>Y</AppText>
          </View>
            <View style={styles.presenceMeta}>
            <AppText scale="caption" style={styles.presenceKicker}>{isLiveWaitingRoom ? "LIVE IDENTITY" : "YOUR PRESENCE"}</AppText>
            <AppText scale="subhead" style={styles.presenceTitle}>You</AppText>
            <AppText scale="footnote" style={styles.presenceStatus}>{waitingPresenceLabel}</AppText>
          </View>
          {topRoomCode ? (
            <View style={styles.presenceCodePill}>
              <AppText scale="footnote" style={styles.presenceCodeText}>{topRoomCode}</AppText>
            </View>
          ) : null}
        </View>

        {/* ── Room identity ───────────────────────────────────────────── */}
        <View style={styles.roomIdentityCard}>
          <AppText scale="caption" style={styles.roomIdentityLabel}>ROOM</AppText>
          <AppText scale="title3" style={styles.roomIdentityTitle}>{waitingRoomTitle}</AppText>
          <AppText scale="body" style={styles.roomIdentityBody}>{waitingRoomBody}</AppText>
        </View>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <View style={styles.actionArea}>
          <AppText scale="caption" style={styles.actionAreaLabel}>START HERE</AppText>

          {!features.watchPartyEnabled ? (
            <View style={styles.joinCard}>
              <AppText scale="caption" style={styles.joinLabel}>WATCH PARTY HIDDEN</AppText>
              <AppText scale="body" style={styles.roomIdentityBody}>
                Watch Party creation and room entry are currently disabled in app configuration.
              </AppText>
            </View>
          ) : null}

          <View style={styles.joinCard}>
            <AppText scale="caption" style={styles.joinLabel}>{isLiveWaitingRoom ? "HOST THIS LIVE SESSION" : "HOST THIS WATCH-PARTY"}</AppText>
            {isLiveWaitingRoom ? (
              <AppText scale="footnote" style={styles.joinSupportText}>
                Create the room here, keep the code handy, and continue into Live Room.
              </AppText>
            ) : partyTitleLocked ? (
              <AppText scale="footnote" style={styles.joinSupportText}>
                {partyTitleName} is set. Create the room, share the code, and finish setup in Party Room.
              </AppText>
            ) : (
              <View style={styles.contentRequiredBox}>
                <AppText scale="subhead" style={styles.contentRequiredTitle}>Choose content first to start Watch-Party Live.</AppText>
                <AppText scale="footnote" style={styles.contentRequiredBody}>
                  Start from a title or creator video, then create a content-first Party Room. Room-code joins still work below.
                </AppText>
                <TouchableOpacity
                  style={styles.generateCodeButton}
                  onPress={onBrowseTitles}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Browse Titles"
                  testID="watch-party-browse-titles-button"
                >
                  <AppText scale="footnote" style={styles.generateCodeButtonText}>Browse Titles</AppText>
                </TouchableOpacity>
              </View>
            )}
            {createError ? <AppText scale="footnote" style={styles.errorText}>{createError}</AppText> : null}
            <TouchableOpacity
              style={[styles.primaryButton, createActionDisabled && styles.primaryButtonDisabled]}
              onPressIn={() => {
                debugLog("watch-party", "watch_party_create_room_press_in", {
                  roomType: inferredWaitingRoomType,
                  createActionBusy,
                  watchPartyEnabled: features.watchPartyEnabled,
                });
              }}
              onPress={onCreateRoom}
              activeOpacity={0.85}
              disabled={createActionDisabled}
              testID="watch-party-create-room"
              accessibilityRole="button"
              accessibilityLabel={isLiveWaitingRoom ? "Create Live Room" : "Create Party Room"}
              accessibilityState={{ disabled: createActionDisabled, busy: createActionBusy }}
              hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
            >
              {createActionBusy ? (
                <View style={styles.lookingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <AppText scale="body" style={styles.primaryButtonText}>
                    {creating ? "  Creating room…" : "  Preparing room…"}
                  </AppText>
                </View>
              ) : (
                <AppText scale="body" style={styles.primaryButtonText}>
                  {isMissingWatchPartyContent ? "Choose Content First" : isLiveWaitingRoom ? "Create Live Room" : "Create Party Room"}
                </AppText>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.joinCard}>
            <AppText scale="caption" style={styles.joinLabel}>{isLiveWaitingRoom ? "JOIN A LIVE ROOM" : "JOIN WATCH-PARTY LIVE"}</AppText>
            {isLiveWaitingRoom ? (
              <AppText scale="footnote" style={styles.joinSupportText}>
                Enter a live room code to preview the lane and continue.
              </AppText>
            ) : (
              <AppText scale="footnote" style={styles.joinSupportText}>
                Enter a room code to preview the title and continue.
              </AppText>
            )}

            {preview ? (
              <View style={styles.previewBox}>
                <View style={styles.previewMeta}>
                  <View style={[styles.previewDot, { backgroundColor: preview.room.playbackState === "playing" ? "#2ecc40" : "#b58900" }]} />
                  <AppText scale="caption" style={styles.previewStatus}>
                    {preview.room.playbackState === "playing" ? "Playing" : "Paused"}
                  </AppText>
                </View>
                <AppText scale="title3" style={styles.previewTitle} numberOfLines={2}>
                  {getWaitingRoomPreviewTitle(preview)}
                </AppText>
                <AppText scale="caption" style={styles.previewCode}>Room  {preview.room.roomCode}</AppText>
                <View style={styles.previewActions}>
                  <Pressable
                    style={({ pressed }) => [styles.joinNowBtn, pressed && styles.previewActionPressed]}
                    onPress={onConfirmJoin}
                    accessibilityRole="button"
                    accessibilityLabel="Join Now"
                    hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                    testID="watch-party-preview-join"
                  >
                    <AppText scale="body" style={styles.joinNowBtnText}>Join Now →</AppText>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.cancelBtn, pressed && styles.previewActionPressed]}
                    onPress={onClearPreview}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel room preview"
                    hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                    testID="watch-party-preview-cancel"
                  >
                    <AppText scale="body" style={styles.cancelBtnText}>Cancel</AppText>
                  </Pressable>
                </View>
                {joinError ? <AppText scale="footnote" style={styles.errorText}>{joinError}</AppText> : null}
                {paidTicketGate?.requiresPurchase ? (
                  <View style={styles.inlineTicketGate}>
                    <AppText scale="subhead" style={styles.inlineTicketGateTitle}>Seat Pass required</AppText>
                    <AppText scale="footnote" style={styles.inlineTicketGateBody}>
                      Seat Pass status is active. Tester-safe checkout can run where provider setup supports it; otherwise this button returns the current resolution state.
                    </AppText>
                    <MoneyScopeInfoButton scope="watch_party_ticket" label="What does this unlock?" compact />
                    {paidTicketNotice ? <AppText scale="footnote" style={styles.errorText}>{paidTicketNotice}</AppText> : null}
                    <Pressable
                      style={({ pressed }) => [
                        styles.joinNowBtn,
                        paidTicketBusy && styles.primaryButtonDisabled,
                        pressed && styles.previewActionPressed,
                      ]}
                      onPress={onBuyPaidTicketAndJoin}
                      disabled={paidTicketBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Get Watch-Party Seat"
                      accessibilityState={{ disabled: paidTicketBusy, busy: paidTicketBusy }}
                      hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                      testID="tester-watch-party-ticket-button"
                    >
                      <AppText scale="body" style={styles.joinNowBtnText}>
                        {paidTicketBusy
                          ? "Opening Store"
                          : paidWatchPartyCheckoutAvailable
                            ? `Get Seat Pass ${formatPaidWatchPartyTicketPrice(paidTicketGate.priceCents ?? 99, paidTicketGate.currency ?? "usd")}`
                            : "Seat Pass status"}
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
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

                {joinError ? <AppText scale="footnote" style={styles.errorText}>{joinError}</AppText> : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.joinLookupButton,
                    joinLookupBusy && styles.primaryButtonDisabled,
                    pressed && styles.previewActionPressed,
                  ]}
                  onPress={onLookup}
                  disabled={joinLookupBusy}
                  accessibilityRole="button"
                  accessibilityLabel={joinLookupBusy ? "Looking up room" : "Find Room"}
                  accessibilityState={{ disabled: joinLookupBusy, busy: joinLookupBusy }}
                  hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
                  testID="watch-party-find-room-button"
                >
                  {joinLookupBusy ? (
                    <View style={styles.lookingRow}>
                      <ActivityIndicator color="#fff" size="small" />
                      <AppText scale="body" style={styles.primaryButtonText}>  Looking up room…</AppText>
                    </View>
                  ) : (
                    <AppText scale="body" style={styles.primaryButtonText}>Find Room</AppText>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>

        {renderWaitingRoomSetupShell()}

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
      {watchPartyPremiumGate?.reason === "premium_required" ? (
        <AccessSheet
          visible={watchPartyPremiumSheetVisible}
          reason="premium_required"
          gate={watchPartyPremiumGate}
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          kickerOverride={watchPartyPremiumGatePresentation?.kicker}
          titleOverride={watchPartyPremiumSheetCopy.title}
          bodyOverride={watchPartyPremiumSheetCopy.message}
          actionLabelOverride={watchPartyPremiumGatePresentation?.actionLabel}
          onPurchaseResult={(result) => {
            if (!result.ok) {
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            return {
              message: "Premium access updated. Try Watch-Party Live again.",
              tone: "success" as const,
            };
          }}
          onRestoreResult={(result) => {
            if (!result.ok) {
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            return {
              message: "Purchases restored. Try Watch-Party Live again.",
              tone: "success" as const,
            };
          }}
          onClose={() => setWatchPartyPremiumSheetVisible(false)}
        />
      ) : null}
      <InternalInviteSheet
        visible={inviteSheetVisible}
        sourceSurface={isLiveWaitingRoom ? "live-waiting-room" : "party-waiting-room"}
        title={isLiveWaitingRoom ? "Invite people to this live room" : "Invite people to this watch-party"}
        body={isLiveWaitingRoom
          ? "Send the live-room code in Chi'lly Chat, or fall back to system share."
          : "Send the party-room code in Chi'lly Chat, or fall back to system share."}
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
    backgroundColor: "rgba(10,14,24,0.94)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.16)",
    padding: 15,
    gap: 12,
  },
  joinLabel: { color: "#6C7488", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  joinSupportText: { color: "#A7B0C3", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  contentRequiredBox: {
    backgroundColor: "rgba(255,255,255,0.045)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 12,
    gap: 10,
  },
  contentRequiredTitle: { color: "#F4F7FF", fontSize: 14, lineHeight: 19, fontWeight: "900" },
  contentRequiredBody: { color: "#A7B0C3", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  input: {
    minHeight: 48,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1,
  },
  errorText: { color: "#DC143C", fontSize: 12, fontWeight: "600" },
  primaryButton: {
    minHeight: 48,
    backgroundColor: "#DC143C",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#DC143C",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  joinLookupButton: {
    position: "relative",
    zIndex: 20,
    elevation: 20,
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
    position: "relative",
    zIndex: 2,
    elevation: 2,
  },
  previewMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  previewDot: { width: 7, height: 7, borderRadius: 999 },
  previewStatus: { color: "#888", fontSize: 11, fontWeight: "700" },
  previewTitle: { color: "#fff", fontSize: 19, fontWeight: "900", lineHeight: 24 },
  previewCode: { color: "#555", fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  previewActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    position: "relative",
    zIndex: 20,
    elevation: 20,
  },
  joinNowBtn: {
    flex: 1,
    minHeight: 46,
    backgroundColor: "#DC143C",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 21,
    elevation: 21,
  },
  joinNowBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  cancelBtn: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 21,
    elevation: 21,
  },
  previewActionPressed: { opacity: 0.72 },
  cancelBtnText: { color: "#888", fontSize: 14, fontWeight: "700" },
  inlineTicketGate: {
    marginTop: 8,
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.28)",
    backgroundColor: "rgba(220,20,60,0.09)",
    padding: 12,
  },
  inlineTicketGateTitle: { color: "#FFE7EC", fontSize: 14, fontWeight: "900" },
  inlineTicketGateBody: { color: "#C8D0E3", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },

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

  hostPreflightCard: {
    backgroundColor: "rgba(12,12,16,0.92)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 10,
  },
  hostPreflightHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  hostPreflightLabel: { color: "#8FA2C8", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  hostPreflightPill: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#EAF0FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  hostPreflightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 9,
  },
  hostPreflightCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  hostPreflightTitle: { color: "#F2F5FC", fontSize: 12.5, fontWeight: "900" },
  hostPreflightBody: { color: "#A7B0C3", fontSize: 11.5, lineHeight: 16, fontWeight: "600" },
  hostPreflightStatus: {
    maxWidth: 116,
    color: "#FFFFFF",
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "900",
    textAlign: "right",
  },

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
