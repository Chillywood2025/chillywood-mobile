import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Alert, AppState } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { trackEvent } from "./analytics";
import { supabase } from "./supabase";
import type { Tables } from "../supabase/database.types";
import type { CreatorVideo } from "./creatorVideos";
import { getCreatorVideoWatchPartyBlockCopy, getCreatorVideoWatchPartyBlockReason } from "./watchPartyContentSources";
import { createPartyRoom, getPartyRoom, getSafePartyUserId, type WatchPartyCreateResult, type WatchPartyState } from "./watchParty";
import { PLAYER_WATCH_PARTY_SOURCE } from "./watch-party/room-shared";
import { getRuntimeControlBlockedCopy, isRuntimeControlBlockedAccess, requireWatchPartyLivePremium,
  type PremiumWatchPartyFeatureAccessDecision } from "./premiumWatchPartyAccess";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority,
  type AccountSessionAuthorityBinding } from "./accountSessionAuthority";

type TitleIdLookupRow = Pick<Tables<"titles">, "id">;
const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type StateSetter<T> = Dispatch<SetStateAction<T>>;
export type PlayerWatchPartyActionsOptions = {
  cleanId: string;
  creatorVideo: CreatorVideo | null;
  displayItem: { id: string } | null;
  hasResolvedPlatformTitle: boolean;
  inWatchParty: boolean;
  partyId?: string;
  isFocused: boolean;
  isPlaying: boolean;
  isSignedIn: boolean;
  item: { id: string; title?: string | null } | null;
  localTitle: { title?: string | null } | null;
  playbackSourceKind: "title" | "creator-video" | "spectator-playback";
  titleId: string;
  titleLoading: boolean;
  currentPositionRef: { current: number };
  sessionAuthority: AccountSessionAuthorityBinding | null;
  watchPartyPremiumGate: PremiumWatchPartyFeatureAccessDecision | null;
  watchPartyPremiumSheetVisible: boolean;
  setWatchPartyPremiumGate: StateSetter<PremiumWatchPartyFeatureAccessDecision | null>;
  setWatchPartyPremiumSheetVisible: StateSetter<boolean>;
  setWatchPartyEntryRetryToken: StateSetter<number>;
  setWatchPartyEntryError: StateSetter<string | null>;
};

type HeldCreation = { pending: boolean; result?: WatchPartyCreateResult };
// A dispatched mutation can outlive the screen. Retain its exact outcome across
// remounts; retirement never authorizes another insert or deletes another room.
const heldCreations = new Map<string, HeldCreation>();

// These are the Player's production actions. Continue only rechecks access;
// a fresh Start is required to prepare or resume an exact room.
export function usePlayerWatchPartyActions(options: PlayerWatchPartyActionsOptions) {
  const { cleanId, creatorVideo, displayItem, hasResolvedPlatformTitle, inWatchParty,
    isPlaying, isSignedIn, item, localTitle, playbackSourceKind, titleId, titleLoading,
    currentPositionRef, sessionAuthority, watchPartyPremiumGate, watchPartyPremiumSheetVisible,
    setWatchPartyPremiumGate, setWatchPartyPremiumSheetVisible, setWatchPartyEntryRetryToken, setWatchPartyEntryError } = options;
  const ownerKey = JSON.stringify([sessionAuthority?.userId, sessionAuthority?.accountId,
    sessionAuthority?.sessionGeneration, sessionAuthority?.state, sessionAuthority?.restoreOnly,
    isSignedIn, cleanId, titleId, item?.id, creatorVideo?.id, playbackSourceKind, inWatchParty, options.partyId]);
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const focusedRef = useRef(false);
  const lifetimeRef = useRef(0);
  const startRef = useRef<object | null>(null);
  const acceptedNavigationRef = useRef(false);
  const recheckRef = useRef<{ isCurrent: () => boolean; promise: Promise<{ message: string; tone: "success" | "error" | "neutral" }> } | null>(null);
  const [watchPartyTransitionInFlight, setWatchPartyTransitionInFlight] = useState(false);
  const sheetRef = useRef({ gate: watchPartyPremiumGate, visible: watchPartyPremiumSheetVisible, generation: 0 });
  if (sheetRef.current.gate !== watchPartyPremiumGate || sheetRef.current.visible !== watchPartyPremiumSheetVisible) {
    sheetRef.current = { gate: watchPartyPremiumGate, visible: watchPartyPremiumSheetVisible, generation: sheetRef.current.generation + 1 };
  }
  const renderedSheetGeneration = sheetRef.current.generation;

  useFocusEffect(useCallback(() => {
    if (ownerRef.current !== ownerKey) return;
    focusedRef.current = true;
    lifetimeRef.current += 1;
    if (!startRef.current) {
      acceptedNavigationRef.current = false;
      setWatchPartyTransitionInFlight(false);
    }
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") lifetimeRef.current += 1;
    });
    return () => {
      focusedRef.current = false;
      lifetimeRef.current += 1;
      subscription.remove();
    };
  }, [ownerKey]));
  useEffect(() => subscribeToAccountSessionAuthority(next => {
    if (!sameAccountSessionAuthority(sessionAuthority, next)) lifetimeRef.current += 1;
  }), [sessionAuthority]);

  const captureOwner = useCallback(() => {
    const lifetime = lifetimeRef.current;
    return () => ownerRef.current === ownerKey && lifetimeRef.current === lifetime
      && focusedRef.current && options.isFocused && AppState.currentState === "active"
      && isSignedIn && !!sessionAuthority && !sessionAuthority.restoreOnly
      && sameAccountSessionAuthority(sessionAuthority, getCurrentAccountSessionAuthoritySnapshot());
  }, [isSignedIn, options.isFocused, ownerKey, sessionAuthority]);
  const closeWatchPartyPremiumSheet = useCallback(() => {
    sheetRef.current.generation += 1;
    setWatchPartyPremiumSheetVisible(false);
  }, [setWatchPartyPremiumSheetVisible]);

  const ensureWatchPartyLivePremium = useCallback(async (accessKey: string, isCurrent: () => boolean) => {
    const access = await requireWatchPartyLivePremium({ accessKey }).catch(() => null);
    if (!isCurrent()) return false;
    if (access?.allowed) {
      setWatchPartyPremiumGate(null);
      return true;
    }
    if (isRuntimeControlBlockedAccess(access)) {
      const copy = getRuntimeControlBlockedCopy(access);
      setWatchPartyPremiumGate(null);
      setWatchPartyPremiumSheetVisible(false);
      Alert.alert(copy.title, copy.message);
      trackEvent("runtime_control_blocked", { surface: "standalone-player-watch-party-live",
        controlKey: access?.runtimeControlKey ?? "watch_party_live_enabled", titleId: accessKey });
      return false;
    }
    if (access) setWatchPartyPremiumGate(access);
    setWatchPartyPremiumSheetVisible(true);
    trackEvent("monetization_gate_shown", { surface: "standalone-player-watch-party-live",
      reason: access?.reason ?? "premium_required", titleId: accessKey });
    return false;
  }, [setWatchPartyPremiumGate, setWatchPartyPremiumSheetVisible]);

  const onWatchParty = useCallback(async () => {
    const isCurrent = captureOwner();
    if (!isCurrent() || startRef.current || acceptedNavigationRef.current) return;
    const operation = {};
    startRef.current = operation;
    setWatchPartyTransitionInFlight(true);
    let navigationAccepted = false;
    try {
      if (playbackSourceKind === "spectator-playback") {
        Alert.alert("Watch-Party unavailable", "Start a watch party from the Spectator page for this source.");
        return;
      }
      const creator = playbackSourceKind === "creator-video";
      if (creator) {
        if (titleLoading) {
          Alert.alert("Checking video", "Chi'llywood is still resolving this creator video.");
          return;
        }
        const blockCopy = getCreatorVideoWatchPartyBlockCopy(getCreatorVideoWatchPartyBlockReason(creatorVideo));
        if (blockCopy) { Alert.alert(blockCopy.title, blockCopy.body); return; }
      } else if (!titleId || !hasResolvedPlatformTitle) {
        Alert.alert("Watch-Party unavailable", "Chi'llywood could not resolve this platform title for Watch-Party Live.");
        return;
      }
      const accessKey = String(creator ? creatorVideo?.id ?? titleId : item?.id ?? titleId ?? cleanId).trim();
      if (!accessKey) {
        Alert.alert("Creator video unavailable", "Chi'llywood could not resolve this uploaded video for Watch-Party Live.");
        return;
      }
      if (!(await ensureWatchPartyLivePremium(accessKey, isCurrent)) || !isCurrent()) return;
      const hostUserId = await getSafePartyUserId();
      if (!isCurrent() || hostUserId !== sessionAuthority?.userId) return;
      let sourceId = accessKey;
      if (!creator && !UUID_LIKE_REGEX.test(sourceId)) {
        const titleName = String(item?.title ?? localTitle?.title ?? "").trim();
        if (titleName) {
          try {
            const byName: { data: TitleIdLookupRow | null } = await supabase.from("titles")
              .select("id").eq("title", titleName).returns<TitleIdLookupRow>().maybeSingle();
            if (!isCurrent()) return;
            sourceId = String(byName.data?.id ?? "").trim() || sourceId;
          } catch {
            if (!isCurrent()) return;
          }
        }
      }
      if (!isCurrent()) return;
      const sourceType = creator ? "creator_video" as const : "platform_title" as const;
      const creationKey = JSON.stringify([sessionAuthority?.userId, sessionAuthority?.accountId,
        sessionAuthority?.sessionGeneration, sourceType, sourceId]);
      let held = heldCreations.get(creationKey);
      let room: WatchPartyState | null = null;
      if (held) {
        if (held.pending) {
          Alert.alert("Party preparation in progress", "Wait for the current Party preparation to finish before trying again.");
          return;
        }
        if (held.result && "partyId" in held.result) {
          const previous = held.result;
          room = await getPartyRoom(previous.partyId).catch(() => null);
          if (!isCurrent()) return;
          if (!room || room.partyId !== previous.partyId || room.hostUserId !== hostUserId
            || room.sourceType !== sourceType || room.sourceId !== sourceId || !room.isActive) room = null;
        }
      } else {
        held = { pending: true };
        heldCreations.set(creationKey, held);
        try {
          held.result = await createPartyRoom(creator ? null : sourceId, hostUserId,
            currentPositionRef.current, isPlaying ? "playing" : "paused",
            { roomType: "title", sourceType, sourceId });
          if (held.result && "partyId" in held.result) room = held.result;
          // The adapter identifies pre-insert failures and proved server
          // rejections. Only a fresh Start may retry those; an unclassified
          // transport/database outcome must retain its uncertain creation.
          if ("error" in held.result && (held.result.error.payload?.mutationDispatched === false
            || held.result.error.payload?.mutationRejected === true
            || typeof held.result.error.payload?.monetizationReason === "string")) {
            if (heldCreations.get(creationKey) === held) heldCreations.delete(creationKey);
            if (isCurrent()) Alert.alert("Watch-Party unavailable", held.result.error.message);
            return;
          }
        } finally {
          held.pending = false;
        }
        if (!isCurrent()) return;
      }
      if (!room || room.hostUserId !== hostUserId || room.sourceType !== sourceType || room.sourceId !== sourceId) {
        Alert.alert("Party preparation unconfirmed", "The previous Party preparation could not be confirmed. Check that Party before starting another.");
        return;
      }
      if (!isCurrent()) return;
      router.push({ pathname: "/watch-party", params: {
        roomId: room.partyId, roomCode: room.roomCode, source: PLAYER_WATCH_PARTY_SOURCE,
        sourceType, sourceId, ...(!creator ? { titleId: room.titleId || sourceId } : {}),
      } });
      navigationAccepted = true;
      acceptedNavigationRef.current = true;
      // Only the same acknowledged creation is handed to the waiting room.
      if (heldCreations.get(creationKey) === held) heldCreations.delete(creationKey);
    } catch {
      if (isCurrent()) Alert.alert("Watch-Party unavailable", "Unable to confirm Party preparation right now. Check your existing Party before trying again.");
    } finally {
      if (startRef.current === operation) {
        startRef.current = null;
        if (isCurrent()) setWatchPartyTransitionInFlight(navigationAccepted);
        else if (focusedRef.current) setWatchPartyTransitionInFlight(false);
      }
    }
  }, [captureOwner, cleanId, creatorVideo, currentPositionRef, ensureWatchPartyLivePremium,
    hasResolvedPlatformTitle, isPlaying, item?.id, item?.title, localTitle?.title,
    playbackSourceKind, sessionAuthority, titleId, titleLoading]);

  const refreshWatchPartyPremiumAfterSheetAction = useCallback(async (action: "purchase" | "restore") => {
    const ownerIsCurrent = captureOwner();
    const sheetGeneration = renderedSheetGeneration;
    const isCurrent = () => ownerIsCurrent() && sheetRef.current.generation === sheetGeneration && sheetRef.current.visible;
    const retired = { message: "", tone: "neutral" as const };
    if (!isCurrent()) return retired;
    if (recheckRef.current?.isCurrent()) return recheckRef.current.promise;
    const accessKey = String(watchPartyPremiumGate?.accessKey
      ?? (playbackSourceKind === "creator-video" ? creatorVideo?.id : displayItem?.id)
      ?? titleId ?? cleanId).trim();
    const operation = { isCurrent, promise: Promise.resolve(retired) as Promise<{ message: string; tone: "success" | "error" | "neutral" }> };
    recheckRef.current = operation;
    operation.promise = (async () => {
      try {
        const refreshed = await requireWatchPartyLivePremium({ accessKey }).catch(() => null);
        if (!isCurrent()) return retired;
        if (refreshed?.allowed) {
          trackEvent("monetization_unlock_success", { action,
            surface: inWatchParty ? "watch-party-live-player-entry" : "standalone-player-watch-party-live", titleId: accessKey });
          setWatchPartyPremiumGate(null);
          setWatchPartyPremiumSheetVisible(false);
          if (inWatchParty) setWatchPartyEntryRetryToken(current => current + 1);
          return { message: action === "restore" ? "Purchases restored. Watch-Party Live is ready." : "Premium access unlocked. Watch-Party Live is ready.", tone: "success" as const };
        }
        if (isRuntimeControlBlockedAccess(refreshed)) {
          const copy = getRuntimeControlBlockedCopy(refreshed);
          setWatchPartyPremiumGate(null);
          setWatchPartyPremiumSheetVisible(false);
          if (inWatchParty) setWatchPartyEntryError(copy.message);
          trackEvent("runtime_control_blocked", { surface: inWatchParty ? "watch-party-live-player-entry" : "standalone-player-watch-party-live",
            controlKey: refreshed?.runtimeControlKey ?? "watch_party_live_enabled", titleId: accessKey });
          return { message: copy.message, tone: "error" as const };
        }
        if (refreshed) setWatchPartyPremiumGate(refreshed);
        const message = refreshed?.monetization.issues[0] ?? "Watch-Party Live still needs Premium access on this account.";
        trackEvent("monetization_unlock_failure", { action,
          surface: inWatchParty ? "watch-party-live-player-entry" : "standalone-player-watch-party-live", titleId: accessKey });
        return { message, tone: "error" as const };
      } finally {
        if (recheckRef.current === operation) recheckRef.current = null;
      }
    })();
    return operation.promise;
  }, [captureOwner, cleanId, creatorVideo?.id, displayItem?.id, inWatchParty, playbackSourceKind, renderedSheetGeneration,
    setWatchPartyEntryError, setWatchPartyEntryRetryToken, setWatchPartyPremiumGate,
    setWatchPartyPremiumSheetVisible, titleId, watchPartyPremiumGate?.accessKey]);

  return { onWatchParty, refreshWatchPartyPremiumAfterSheetAction, closeWatchPartyPremiumSheet, watchPartyTransitionInFlight };
}
