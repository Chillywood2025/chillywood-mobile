import * as Clipboard from "expo-clipboard";
import { useGlobalSearchParams, usePathname } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
    getDebugSnapshot,
    hydrateDevDebugEnabled,
    reportDebugAuth,
    reportDebugRoute,
    setDevDebugEnabled,
    subscribeDebugState,
    type DebugState
} from "../../_lib/devDebug";
import { supabase } from "../../_lib/supabase";

function json(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function fmtMs(ms?: number) {
  if (typeof ms !== "number") return "-";
  return `${ms}ms`;
}

export default function DevDebugOverlay() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DebugState>(getDebugSnapshot());

  useEffect(() => {
    if (!__DEV__) return;
    hydrateDevDebugEnabled().then((state) => setEnabled(state));
  }, []);

  useEffect(() => {
    if (!__DEV__) return;
    reportDebugRoute(pathname, params as Record<string, unknown>);
  }, [pathname, params]);

  useEffect(() => {
    if (!__DEV__) return;
    const unsub = subscribeDebugState((next) => setSnapshot(next));
    return unsub;
  }, []);

  useEffect(() => {
    if (!__DEV__) return;

    let mounted = true;
    const readAuth = async () => {
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!mounted) return;
      const session = data?.session ?? null;
      reportDebugAuth({
        signedIn: !!session?.user,
        sessionExists: !!session,
        userId: session?.user?.id ?? null,
        email: session?.user?.email ?? null,
      });
    };

    readAuth();
    const timer = setInterval(readAuth, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => {
    const s = snapshot;
    return [
      `Route: ${s.app.route ?? "-"}`,
      `Params: ${json(s.app.params)}`,
      `Auth: ${s.auth.signedIn ? "signed-in" : "signed-out"}`,
      `User: ${s.auth.userId ?? "-"} (${s.auth.email ?? "-"})`,
      `Player: title=${s.player.titleId ?? "-"} loading=${String(!!s.player.loading)} hasTitle=${String(!!s.player.hasTitle)} hasVideo=${String(!!s.player.hasVideoUrl)}`,
      `Playback: pos=${fmtMs(s.player.positionMillis)} dur=${fmtMs(s.player.durationMillis)} playing=${String(!!s.player.isPlaying)} error=${s.player.playbackError ?? "-"}`,
      `Home: hero=${s.home.heroTitleId ?? "-"} continue=${s.home.continueWatchingCount ?? 0} myList=${s.home.myListCount ?? 0} trending=${s.home.trendingCount ?? 0} topPicks=${s.home.topPicksCount ?? 0}`,
      `Party: room=${s.party.roomId ?? "-"} role=${s.party.role ?? "-"} state=${s.party.realtimeState ?? "-"} people=${s.party.participantCount ?? 0}`,
      `Party Sync: lastSync=${s.party.lastSyncAt ? new Date(s.party.lastSyncAt).toISOString() : "-"} updatedAt=${s.party.roomUpdatedAt ?? "-"} poll=${String(!!s.party.fallbackPollActive)}`,
      `Query: ${s.query.name ?? "-"} status=${s.query.status ?? "idle"} err=${s.query.error ?? "-"}`,
      `LastError: ${s.lastError ?? "-"}`,
    ].join("\n");
  }, [snapshot]);

  const onToggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    if (!next) setOpen(false);
    await setDevDebugEnabled(next);
  };

  const onCopy = async () => {
    await Clipboard.setStringAsync(summary).catch(() => {});
  };

  if (!__DEV__) return null;

  return (
    <>
      <Pressable
        testID="dev-debug-badge"
        style={[styles.badge, enabled && styles.badgeOn]}
        onPress={() => enabled && setOpen((v) => !v)}
        onLongPress={onToggleEnabled}
      >
        <Text style={styles.badgeText}>{enabled ? "DEV ON" : "DEV"}</Text>
      </Pressable>

      {enabled && open && (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.panel}>
            <View style={styles.header}>
              <Text style={styles.title}>Runtime Debug</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.btn} onPress={onCopy} activeOpacity={0.8}>
                  <Text style={styles.btnText}>Copy Debug Snapshot</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => setOpen(false)} activeOpacity={0.8}>
                  <Text style={styles.btnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={styles.section}><Text style={styles.sectionTitle}>APP / ROUTE</Text><Text style={styles.row}>Route: {snapshot.app.route ?? "-"}</Text><Text style={styles.row}>Title ID: {snapshot.app.titleId ?? "-"}</Text><Text style={styles.row}>Party ID: {snapshot.app.partyId ?? "-"}</Text><Text style={styles.json}>{json(snapshot.app.params)}</Text></View>
              <View style={styles.section}><Text style={styles.sectionTitle}>AUTH / SESSION</Text><Text style={styles.row}>Signed In: {String(!!snapshot.auth.signedIn)}</Text><Text style={styles.row}>Session Exists: {String(!!snapshot.auth.sessionExists)}</Text><Text style={styles.row}>User ID: {snapshot.auth.userId ?? "-"}</Text><Text style={styles.row}>Email: {snapshot.auth.email ?? "-"}</Text></View>
              <View style={styles.section}><Text style={styles.sectionTitle}>PLAYER STATE</Text><Text style={styles.row}>Title ID: {snapshot.player.titleId ?? "-"}</Text><Text style={styles.row}>Loading: {String(!!snapshot.player.loading)}</Text><Text style={styles.row}>Has Title: {String(!!snapshot.player.hasTitle)}</Text><Text style={styles.row}>Has video_url: {String(!!snapshot.player.hasVideoUrl)}</Text><Text style={styles.row}>Position: {fmtMs(snapshot.player.positionMillis)}</Text><Text style={styles.row}>Duration: {fmtMs(snapshot.player.durationMillis)}</Text><Text style={styles.row}>Playing: {String(!!snapshot.player.isPlaying)}</Text><Text style={styles.row}>Error: {snapshot.player.playbackError ?? "-"}</Text></View>
              <View style={styles.section}><Text style={styles.sectionTitle}>HOME / DISCOVERY</Text><Text style={styles.row}>Hero ID: {snapshot.home.heroTitleId ?? "-"}</Text><Text style={styles.row}>Continue Watching: {snapshot.home.continueWatchingCount ?? 0}</Text><Text style={styles.row}>My List: {snapshot.home.myListCount ?? 0}</Text><Text style={styles.row}>Trending: {snapshot.home.trendingCount ?? 0}</Text><Text style={styles.row}>Top Picks: {snapshot.home.topPicksCount ?? 0}</Text></View>
              <View style={styles.section}><Text style={styles.sectionTitle}>WATCH PARTY</Text><Text style={styles.row}>Room ID: {snapshot.party.roomId ?? "-"}</Text><Text style={styles.row}>Role: {snapshot.party.role ?? "-"}</Text><Text style={styles.row}>Realtime: {snapshot.party.realtimeState ?? "-"}</Text><Text style={styles.row}>Participants: {snapshot.party.participantCount ?? 0}</Text><Text style={styles.row}>Last Sync: {snapshot.party.lastSyncAt ? new Date(snapshot.party.lastSyncAt).toISOString() : "-"}</Text><Text style={styles.row}>Room updatedAt: {snapshot.party.roomUpdatedAt ?? "-"}</Text><Text style={styles.row}>Fallback Poll Active: {String(!!snapshot.party.fallbackPollActive)}</Text></View>
              <View style={styles.section}><Text style={styles.sectionTitle}>LAST ERROR / QUERY</Text><Text style={styles.row}>Query: {snapshot.query.name ?? "-"}</Text><Text style={styles.row}>Status: {snapshot.query.status ?? "idle"}</Text><Text style={styles.row}>Query Error: {snapshot.query.error ?? "-"}</Text><Text style={styles.row}>Last Error: {snapshot.lastError ?? "-"}</Text></View>
            </ScrollView>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    right: 12,
    bottom: 20,
    zIndex: 999,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeOn: {
    borderColor: "rgba(220,20,60,0.55)",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 998,
    justifyContent: "flex-end",
  },
  panel: {
    marginHorizontal: 8,
    marginBottom: 54,
    maxHeight: "70%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,12,12,0.97)",
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnText: {
    color: "#ddd",
    fontSize: 11,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  section: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  sectionTitle: {
    color: "#F7D6DD",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  row: {
    color: "#ddd",
    fontSize: 11,
    fontWeight: "500",
  },
  json: {
    color: "#aaa",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
});
