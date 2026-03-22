import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../../_lib/supabase";
import { getPartyRoom, getSafePartyUserId, type WatchPartyState } from "../../_lib/watchParty";

type RoomPreview = {
  room: WatchPartyState;
  titleName: string | null;
};

type IncomingHandoff = {
  roomCode: string;
  titleId: string | null;
};

export default function WatchPartyIndexScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    roomId?: string;
    roomCode?: string;
    titleId?: string;
    partyId?: string;
  }>();
  const [joinCode, setJoinCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [incomingHandoff, setIncomingHandoff] = useState<IncomingHandoff | null>(null);
  const [hostLabel, setHostLabel] = useState("Viewer");
  const handoffLoadedRef = useRef(false);

  useEffect(() => {
    console.log("WATCH PARTY SCREEN: received params", params);
  }, [params]);

  useEffect(() => {
    if (handoffLoadedRef.current) return;

    const rawRoomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
    const rawRoomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
    const rawPartyId = Array.isArray(params.partyId) ? params.partyId[0] : params.partyId;
    const rawTitleId = Array.isArray(params.titleId) ? params.titleId[0] : params.titleId;
    const incomingCode = String(rawRoomCode ?? rawRoomId ?? rawPartyId ?? "").trim().toUpperCase();
    const incomingTitleId = String(rawTitleId ?? "").trim();

    if (!incomingCode) return;
    handoffLoadedRef.current = true;
    setJoinCode(incomingCode);
    setHostLabel("Connecting room…");
    setIncomingHandoff({ roomCode: incomingCode, titleId: incomingTitleId || null });
    console.log("WATCH PARTY SCREEN: parsed handoff", { incomingCode, incomingTitleId });

    const loadIncomingRoom = async () => {
      setLooking(true);
      setJoinError(null);
      try {
        const room = await getPartyRoom(incomingCode);
        if (!room) {
          console.log("WATCH PARTY SCREEN: handoff lookup returned null", { incomingCode });
          setJoinError("Room handoff failed. Please try the room code manually.");
          return;
        }

        let titleName: string | null = null;
        try {
          const { data } = await supabase
            .from("titles")
            .select("title")
            .eq("id", room.titleId)
            .maybeSingle();
          titleName = data?.title ? String(data.title) : null;
        } catch {
          // cosmetic only
        }

        const safeUserId = await getSafePartyUserId();
        setHostLabel(safeUserId === room.hostUserId ? "You are hosting" : "You joined as viewer");
        setJoinCode(room.roomCode);
        setIncomingHandoff({ roomCode: room.roomCode, titleId: room.titleId });
        setPreview({ room, titleName });
      } catch {
        setJoinError("Couldn't load room from handoff.");
      } finally {
        setLooking(false);
      }
    };

    loadIncomingRoom();
  }, [params.partyId, params.roomCode, params.roomId]);

  const onLookup = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    setLooking(true);
    setJoinError(null);
    setPreview(null);

    try {
      const room = await getPartyRoom(code);
      if (!room) {
        setJoinError("Room not found. Check the code and try again.");
        return;
      }

      // Try to get title name for preview
      let titleName: string | null = null;
      try {
        const { data } = await supabase
          .from("titles")
          .select("title")
          .eq("id", room.titleId)
          .maybeSingle();
        titleName = data?.title ? String(data.title) : null;
      } catch { /* cosmetic */ }

      setPreview({ room, titleName });
    } catch {
      setJoinError("Couldn't reach the server. Check your connection.");
    } finally {
      setLooking(false);
    }
  };

  const onConfirmJoin = () => {
    if (!preview) return;
    router.push({ pathname: "/watch-party/[partyId]", params: { partyId: preview.room.partyId } });
  };

  const onClearPreview = () => {
    setPreview(null);
    setJoinCode("");
    setIncomingHandoff(null);
  };

  const topRoomCode = preview?.room.roomCode ?? incomingHandoff?.roomCode ?? "";
  const topRoomTitle = preview?.titleName ?? preview?.room.titleId ?? incomingHandoff?.titleId ?? "";
  const topHostLabel = preview ? hostLabel : incomingHandoff ? "Connecting room…" : "";

  return (
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
        <Text style={styles.kicker}>CHILLYWOOD</Text>
        <Text style={styles.headline}>Watch Party</Text>
        <Text style={styles.tagline}>Watch together, in sync, from anywhere.</Text>

        {/* ── How to start ────────────────────────────────────────────── */}
        <View style={styles.howCard}>
          <Text style={styles.howTitle}>Starting a party</Text>
          <Text style={styles.howBody}>
            Open any title in the player and tap{" "}
            <Text style={styles.howHighlight}>Watch Party</Text> in the player controls.
            {"\n"}Share the room code to invite friends.
          </Text>
        </View>

        {/* ── Join a room ─────────────────────────────────────────────── */}
        {topRoomCode ? (
          <View style={styles.roomCard}>
            <Text style={styles.roomLabel}>ROOM CODE</Text>
            <Text style={styles.roomCode}>{topRoomCode}</Text>
            <Text style={styles.roomTitle}>{topRoomTitle || "Loading room…"}</Text>
            <Text style={styles.hostStatus}>{topHostLabel || ""}</Text>
          </View>
        ) : null}

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
                {preview.titleName ?? preview.room.titleId}
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
                placeholderTextColor="#464646"
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={onLookup}
                editable={!looking}
              />

              {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryButton, (looking || !joinCode.trim()) && styles.primaryButtonDisabled]}
                onPress={onLookup}
                activeOpacity={0.85}
                disabled={looking || !joinCode.trim()}
              >
                {looking ? (
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

        {/* ── Feature list ───────────────────────────────────────────── */}
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>WHAT&apos;S INCLUDED</Text>
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
  );
}

const styles = StyleSheet.create({
  outerFlex: { flex: 1 },
  screen: { flex: 1, backgroundColor: "#050505" },
  content: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 48, gap: 16 },

  // Header
  kicker: { color: "#444", fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  headline: { color: "#fff", fontSize: 38, fontWeight: "900", marginTop: 4, lineHeight: 42 },
  tagline: { color: "#777", fontSize: 14, lineHeight: 20 },

  // How card
  howCard: {
    backgroundColor: "rgba(18,18,18,0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 16,
    gap: 8,
    marginTop: 4,
  },
  howTitle: { color: "#888", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  howBody: { color: "#c0c0c0", fontSize: 13, lineHeight: 20 },
  howHighlight: { color: "#F7D6DD", fontWeight: "800" },

  // Join card
  roomCard: {
    backgroundColor: "rgba(18,18,18,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 16,
    gap: 6,
  },
  roomLabel: { color: "#555", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  roomCode: { color: "#F7D6DD", fontSize: 24, fontWeight: "900", letterSpacing: 2.2 },
  roomTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  hostStatus: { color: "#bbb", fontSize: 12, fontWeight: "700" },

  joinCard: {
    backgroundColor: "rgba(18,18,18,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 18,
    gap: 12,
  },
  joinLabel: { color: "#555", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    color: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 2,
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
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
    backgroundColor: "rgba(14,14,14,0.97)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
    gap: 10,
  },
  featuresTitle: { color: "#444", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.2, marginBottom: 2 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureDot: { color: "#DC143C", fontSize: 9 },
  featureLabel: { color: "#bbb", fontSize: 13, fontWeight: "600" },
});
