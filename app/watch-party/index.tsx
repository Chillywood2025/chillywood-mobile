import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import { supabase } from "../../_lib/supabase";
import { createPartyRoom, getPartyRoom, getSafePartyUserId, type WatchPartyRoomType, type WatchPartyState } from "../../_lib/watchParty";
import { RoomCodeInviteCard } from "../../components/room/room-code-invite-card";

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

export default function WatchPartyIndexScreen() {
  const router = useRouter();
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
  const isPlayerWatchPartyLiveFlow = sourceParam === "player-watch-party-live";
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
  const handoffLoadedRef = useRef(false);
  const liveWaitingRoomLoadedRef = useRef(false);

  const getBackgroundSource = (): ImageSourcePropType | null => {
    const first = localTitles[0] as any;
    return first?.image || first?.poster || null;
  };

  const backgroundSource = getBackgroundSource();

  const resolveRoomTitleName = async (roomTitleId: string | null | undefined) => {
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
  };

  const buildRoomPreview = async (room: WatchPartyState): Promise<RoomPreview> => {
    const titleName = await resolveRoomTitleName(room.titleId);
    return { room, titleName };
  };

  const createPreparedWaitingRoom = async (titleId: string | null, roomType: WatchPartyRoomType): Promise<RoomPreview | null> => {
    const hostUserId = await getSafePartyUserId();
    const room = await createPartyRoom(titleId, hostUserId, 0, "paused", { roomType });
    if (!room || "error" in room) return null;

    const nextPreparedRoom = await buildRoomPreview(room);
    setPreparedRoom(nextPreparedRoom);
    setIncomingHandoff({ roomCode: room.roomCode, partyId: room.partyId, titleId: room.titleId });
    setHostLabel("You are hosting");
    return nextPreparedRoom;
  };

  useEffect(() => {
    console.log("WATCH PARTY SCREEN: received params", params);
  }, [params]);

  useEffect(() => {
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
    console.log("WATCH PARTY SCREEN: parsed handoff", { incomingLookupId, incomingTitleId });

    const loadIncomingRoom = async () => {
      try {
        const room = await getPartyRoom(incomingLookupId);
        if (!room) {
          console.log("WATCH PARTY SCREEN: handoff lookup returned null", { incomingLookupId });
          return;
        }

        const safeUserId = await getSafePartyUserId();
        setHostLabel(safeUserId === room.hostUserId ? "You are hosting" : "You joined as viewer");
        if (!isPlayerWatchPartyLiveFlow) setJoinCode(room.roomCode);
        setIncomingHandoff({ roomCode: room.roomCode, partyId: room.partyId, titleId: room.titleId });
        setPreparedRoom(await buildRoomPreview(room));
      } catch {
        console.log("WATCH PARTY SCREEN: incoming handoff lookup failed", { incomingLookupId });
      }
    };

    loadIncomingRoom();
  }, [isPlayerWatchPartyLiveFlow, params.partyId, params.roomCode, params.roomId, params.titleId]);

  useEffect(() => {
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
  }, [isLiveEntryMode, isPlayerWatchPartyLiveFlow, params.partyId, params.roomCode, params.roomId]);

  const onLookup = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    setJoinLookupBusy(true);
    setJoinError(null);
    setPreview(null);

    try {
      const room = await getPartyRoom(code);
      if (!room) {
        setJoinError("Room not found. Check the code and try again.");
        return;
      }

      setPreview(await buildRoomPreview(room));
    } catch {
      setJoinError("Couldn't reach the server. Check your connection.");
    } finally {
      setJoinLookupBusy(false);
    }
  };

  const buildRoomEntryParams = (nextPartyId: string, options?: { roomCode?: string | null; titleId?: string | null }) => {
    const nextRoomCode = String(options?.roomCode ?? "").trim().toUpperCase();
    const nextTitleId = String(options?.titleId ?? "").trim();

    return {
      partyId: nextPartyId,
      ...(nextRoomCode ? { roomCode: nextRoomCode } : {}),
      ...(nextTitleId ? { titleId: nextTitleId } : {}),
      ...(isPlayerWatchPartyLiveFlow ? { source: "player-watch-party-live" } : {}),
    };
  };

  const onConfirmJoin = async () => {
    if (!preview) return;
    const nextPartyId = String(preview.room.partyId ?? "").trim();

    if (!nextPartyId) {
      setJoinError("Room is missing an id. Try another code.");
      return;
    }

    router.push({
      pathname: "/watch-party/[partyId]",
      params: buildRoomEntryParams(nextPartyId, {
        roomCode: preview.room.roomCode,
        titleId: preview.room.titleId,
      }),
    });
  };

  const onCreateRoom = async () => {
    console.log("HOME CREATE BUTTON FIRED", { titleId: createTitleId });
    const trimmedTitleId = createTitleId.trim();
    const effectiveTitleId = trimmedTitleId ? trimmedTitleId : null;
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
          router.push({
            pathname: "/watch-party/[partyId]",
            params: buildRoomEntryParams(nextPartyId, {
              roomCode: preparedTargetRoomCode,
              titleId: preparedTargetTitleId,
            }),
          });
          return;
        }
      }

      const hostUserId = await getSafePartyUserId();
      const roomType = effectiveTitleId ? "title" : "live";

      console.log("HOME CREATE COMPUTED", {
        trimmedTitleId,
        effectiveTitleId,
        roomType,
      });

      console.log("WATCH PARTY SCREEN: creating room", { effectiveTitleId, roomType });
      console.log("HOME CREATE BEFORE CALL", {
        effectiveTitleId,
        hostUserId,
        roomType,
      });

      const room = await createPartyRoom(effectiveTitleId, hostUserId, 0, "paused", {
        roomType,
      });
      console.log("WATCH PARTY SCREEN: createPartyRoom returned", room);
      console.log("HOME CREATE RESULT", room);

      if (!room || "error" in room) {
        setCreateError("Unable to create room right now.");
        return;
      }

      const nextPartyId = String(room.partyId ?? room.roomCode ?? "").trim();
      if (!nextPartyId) {
        setCreateError("Unable to create room right now.");
        return;
      }

      router.push({
        pathname: "/watch-party/[partyId]",
        params: buildRoomEntryParams(nextPartyId, {
          roomCode: room.roomCode,
          titleId: room.titleId,
        }),
      });
    } catch (error) {
      console.log("HOME CREATE ERROR", error);
      setCreateError("Unable to create room right now.");
    } finally {
      setCreating(false);
    }
  };

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
  const waitingPresenceLabel = isPreparingInitialCode ? "Preparing room code…" : (topHostLabel || "You are in room");
  const waitingRoomTitle = isPlayerWatchPartyLiveFlow ? "Party Waiting Room" : "Live Waiting Room";
  const waitingRoomBody = topRoomCode
    ? `${isPlayerWatchPartyLiveFlow ? "Party waiting room" : "Live waiting room"} · code ${topRoomCode}`
    : isPreparingInitialCode
      ? `Preparing a room code for this ${isPlayerWatchPartyLiveFlow ? "party" : "live"} waiting room.`
      : didInitialCodePrepFail
        ? "Room code unavailable right now. Generate a new code to continue."
        : isPlayerWatchPartyLiveFlow
          ? "Create or join a room to start the party waiting room experience."
          : "Create or join a room to start the live waiting room experience.";
  const roomCodeCardValue = topRoomCode || (isPreparingInitialCode ? "Preparing code…" : "Room code unavailable");
  const roomCodeActionBusy = refreshingCode || creating || isPreparingInitialCode;

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
        <Text style={styles.kicker}>CHI'LLYWOOD</Text>
        <Text style={styles.tagline}>Watch together, in sync, from anywhere.</Text>

        {/* ── Presence / identity ─────────────────────────────────────── */}
        <View style={styles.presenceCard}>
          <View style={styles.presenceAvatar}>
            <Text style={styles.presenceAvatarText}>Y</Text>
          </View>
          <View style={styles.presenceMeta}>
            <Text style={styles.presenceKicker}>YOUR PRESENCE</Text>
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

        {/* ── Room code / invite ──────────────────────────────────────── */}
        <RoomCodeInviteCard
          roomCode={roomCodeCardValue}
          bodyText={isPreparingInitialCode
            ? "Preparing a shareable room code for this waiting room."
            : "Share the room code to invite friends into this waiting room."}
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
          disabled={roomCodeActionBusy}
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

          <View style={styles.joinCard}>
            <Text style={styles.joinLabel}>START A ROOM</Text>
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
            {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryButton, createActionBusy && styles.primaryButtonDisabled]}
              onPress={onCreateRoom}
              activeOpacity={0.85}
              disabled={createActionBusy}
            >
              {createActionBusy ? (
                <View style={styles.lookingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.primaryButtonText}>
                    {creating ? "  Creating room…" : "  Preparing room…"}
                  </Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Create Room</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.joinCard}>
            <Text style={styles.joinLabel}>JOIN A ROOM</Text>

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
                  disabled={joinLookupBusy || !joinCode.trim()}
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
          {[
            "Synced play & pause",
            "Live position sync",
            "Host & viewer roles",
            "Party chat",
            "Emoji reactions",
            "Host controls",
            "Live participant list",
          ].map((label) => (
            <View key={label} style={styles.featureRow}>
              <Text style={styles.featureDot}>●</Text>
              <Text style={styles.featureLabel}>{label}</Text>
            </View>
          ))}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    padding: 16,
    gap: 6,
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
