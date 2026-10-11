import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { readPublicDiscoveryFeedItem } from "../../_lib/discoveryFeed";
import { readCircleSpectatorFeedItem } from "../../_lib/circleSpectatorFeed";
import { readCurrentAccountSessionAuthority, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { readCanonicalLiveStageRoomId } from "../../_lib/liveStageDiscoveryDestination";
import { readCanonicalPartyRoomDestination } from "../../_lib/partyRoomDiscoveryDestination";
import { useSession } from "../../_lib/session";
import LegacySpectatorMetadataScreen from "../spectate-metadata/[itemId]";

type LiveLane = "public" | "circle";

type Resolution =
  | { state: "checking" }
  | { state: "legacy" }
  | { state: "unavailable" }
  | { state: "live"; lane: LiveLane };

const normalizeParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

export default function SpectatorEntryScreen() {
  const params = useLocalSearchParams<{ itemId?: string | string[] }>();
  const itemId = normalizeParam(params.itemId);
  const router = useRouter();
  const { authority, authorityStatus } = useSession();
  const currentOwner = useRef({ itemId, authority, authorityStatus });
  currentOwner.current = { itemId, authority, authorityStatus };
  const [resolution, setResolution] = useState<Resolution>({ state: "checking" });
  const foregroundGeneration = useRef(0);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") { foregroundGeneration.current += 1; setResolution({ state: "unavailable" }); }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    const generation = foregroundGeneration.current;
    setResolution({ state: "checking" });
    const current = () => mounted && generation === foregroundGeneration.current && AppState.currentState === "active"
      && currentOwner.current.itemId === itemId
      && currentOwner.current.authorityStatus === authorityStatus
      && (authority ? sameAccountSessionAuthority(authority, currentOwner.current.authority) : !currentOwner.current.authority);

    const openLive = async (item: NonNullable<Awaited<ReturnType<typeof readPublicDiscoveryFeedItem>>>, lane: LiveLane) => {
      if (!current()) return;
      if (item.source_type === "party_room") {
        const destination = readCanonicalPartyRoomDestination(item, lane);
        if (!destination || !authority || authority.restoreOnly || authorityStatus !== "active"
          || !sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority().catch(() => null))) {
          if (current()) setResolution({ state: "unavailable" });
          return;
        }
        if (!current()) return;
        const latest = await (lane === "public" ? readPublicDiscoveryFeedItem(itemId) : readCircleSpectatorFeedItem(itemId)).catch(() => null);
        if (!current()) return;
        const verified = latest?.id === itemId ? readCanonicalPartyRoomDestination(latest, lane) : null;
        if (!verified || JSON.stringify(verified) !== JSON.stringify(destination)
          || !sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority().catch(() => null))) {
          if (current()) setResolution({ state: "unavailable" });
          return;
        }
        if (!current()) return;
        // Ordinary preview -> Join Now rechecks room, Premium/pass and content
        // access. This route carries no start, host, camera or playback intent.
        router.replace({ pathname: "/watch-party", params: { partyId: destination.partyId, source: "discovery", discoveryItemId: itemId, discoveryLane: lane } });
        return;
      }
      if (item.source_type === "live_stage_room") {
        const roomId = readCanonicalLiveStageRoomId(item, lane);
        if (!roomId || !authority || authority.restoreOnly || authorityStatus !== "active"
          || !sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority().catch(() => null))) {
          if (current()) setResolution({ state: "unavailable" });
          return;
        }
        if (!current()) return;
        // Re-read after the authority wait: a terminal, hidden or replaced row
        // cannot use the earlier projection to route into a different stage.
        const latest = await (lane === "public" ? readPublicDiscoveryFeedItem(itemId) : readCircleSpectatorFeedItem(itemId)).catch(() => null);
        if (!current()) return;
        if (!latest || latest.id !== itemId || readCanonicalLiveStageRoomId(latest, lane) !== roomId) {
          setResolution({ state: "unavailable" });
          return;
        }
        // Auth may change before its React context rerenders while the row
        // request is held. Verify the actual current session at route commit.
        const finalAuthority = await readCurrentAccountSessionAuthority().catch(() => null);
        if (!current()) return;
        if (!sameAccountSessionAuthority(authority, finalAuthority)) {
          setResolution({ state: "unavailable" });
          return;
        }
        // No role, microphone, camera or host intent is carried by this route.
        router.replace({ pathname: "/watch-party/live-stage/[partyId]", params: { partyId: roomId, source: "discovery" } });
        return;
      }
      setResolution({ state: "live", lane });
      router.replace(`/spectate-live/${encodeURIComponent(itemId)}?lane=${lane}` as never);
    };

    const resolve = async () => {
      if (!itemId) {
        if (current()) setResolution({ state: "legacy" });
        return;
      }

      const publicItem = await readPublicDiscoveryFeedItem(itemId).catch(() => null);
      if (!current()) return;
      if (publicItem?.id === itemId && publicItem.live_state === "live") {
        await openLive(publicItem, "public");
        return;
      }

      const circleItem = publicItem ? null : await readCircleSpectatorFeedItem(itemId).catch(() => null);
      if (!current()) return;
      if (circleItem?.id === itemId && circleItem.live_state === "live") {
        await openLive(circleItem, "circle");
        return;
      }

      setResolution({ state: "legacy" });
    };

    void resolve();
    return () => {
      mounted = false;
    };
  }, [itemId, authority, authorityStatus, router]);

  if (resolution.state === "legacy") {
    return <LegacySpectatorMetadataScreen />;
  }

  if (resolution.state === "unavailable") {
    return <View style={styles.screen}>
      <Text style={styles.copy}>Unable to verify this live session. Go back and try again.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}>
        <Text style={styles.copy}>Back</Text>
      </Pressable>
    </View>;
  }

  return (
    <View style={styles.screen}>
      <ActivityIndicator color="#FFFFFF" />
      <Text style={styles.copy}>{resolution.state === "live" ? "Opening live…" : "Checking live…"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#000",
  },
  copy: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "800",
  },
});
