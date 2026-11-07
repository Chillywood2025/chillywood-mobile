import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useSession } from "../../_lib/session";
import { contentSocialAuthorityKey, readCreatorVideoRepostsPage, subscribeToContentSocialEngagement, type CreatorVideoRepostCursor } from "../../_lib/contentSocialEngagement";
import { readCreatorVideosByIds, type CreatorVideo } from "../../_lib/creatorVideos";
import { isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import { CreatorVideoCard } from "../creator-media/creator-video-card";
import { CHILLYWOOD_VISUAL, ChillywoodPanel } from "../ui/chillywood-visual-system";

/** A real receiving library for reposts, not a decorative share counter. */
export function RepostsShelf({ userId, enabled, onOpen }: { userId: string; enabled: boolean; onOpen: (video: CreatorVideo) => void }) {
  const focused = useIsFocused();
  const supportedProfile = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  const { authority, authorityStatus } = useSession();
  const [active, setActive] = useState(AppState.currentState === "active");
  const identity = `${contentSocialAuthorityKey()}:${userId}:${enabled && focused && active}:${authorityStatus}`;
  const current = useRef(identity); current.current = identity;
  const sequence = useRef(0);
  const flight = useRef(false);
  const loadedPages = useRef(1);
  const [hiddenIdentity, setHiddenIdentity] = useState<string | null>(null);
  const [state, setState] = useState<{ identity: string; videos: CreatorVideo[]; cursor: CreatorVideoRepostCursor | null; loading: boolean; error: boolean }>({ identity, videos: [], cursor: null, loading: true, error: false });
  const visible = state.identity === identity ? state : { identity, videos: [], cursor: null, loading: true, error: false };
  const load = useCallback(async (cursor: CreatorVideoRepostCursor | null = null) => {
    if (!enabled || !focused || !active || !supportedProfile || flight.current) return;
    flight.current = true;
    const ticket = ++sequence.current;
    const subject = contentSocialAuthorityKey();
    const owns = () => current.current === identity && sequence.current === ticket && contentSocialAuthorityKey() === subject;
    setState(previous => ({ identity, videos: previous.identity === identity ? previous.videos : [], cursor: previous.identity === identity ? previous.cursor : cursor, loading: true, error: false }));
    try {
      let page = await readCreatorVideoRepostsPage(userId, { limit: 24, cursor: cursor ?? undefined });
      if (!owns()) return;
      if (!page.available) {
        setHiddenIdentity(identity);
        setState({ identity, videos: [], cursor: null, loading: false, error: false });
        return;
      }
      setHiddenIdentity(null);
      const items = [...page.items];
      let pages = 1;
      // Revalidate the loaded extent without unmounting the rail on every tick.
      while (!cursor && page.nextCursor && pages < loadedPages.current) {
        if (!owns()) return;
        page = await readCreatorVideoRepostsPage(userId, { limit: 24, cursor: page.nextCursor });
        if (!owns()) return;
        if (!page.available) {
          setHiddenIdentity(identity);
          setState({ identity, videos: [], cursor: null, loading: false, error: false });
          return;
        }
        items.push(...page.items); pages += 1;
      }
      if (!owns()) return;
      const videos: CreatorVideo[] = [];
      for (let offset = 0; offset < items.length; offset += 24) {
        videos.push(...await readCreatorVideosByIds(items.slice(offset, offset + 24).map(item => item.videoId), { limit: 24, includeRenditionStatuses: false, throwOnUnavailable: true }));
        if (!owns()) return;
      }
      if (!owns()) return;
      loadedPages.current = cursor ? loadedPages.current + 1 : pages;
      const publicVideos = videos.filter(isCreatorVideoPubliclyShareable);
      setState(previous => ({ identity, videos: Array.from(new Map([...(cursor ? previous.videos : []), ...publicVideos].map(video => [video.id, video])).values()), cursor: page.nextCursor, loading: false, error: false }));
    } catch {
      // Withhold retained images when authority cannot be revalidated.
      if (owns()) setState({ identity, videos: [], cursor: null, loading: false, error: true });
    } finally { if (ticket === sequence.current) flight.current = false; }
  }, [active, enabled, focused, identity, userId, supportedProfile]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", value => setActive(value === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    sequence.current += 1; flight.current = false;
    loadedPages.current = 1;
    setState({ identity, videos: [], cursor: null, loading: true, error: false });
    void load();
    const timer = enabled && focused && active ? setInterval(() => { void load(); }, 30_000) : null;
    return () => { sequence.current += 1; flight.current = false; if (timer) clearInterval(timer); };
  }, [identity, load, enabled, focused, active, authority]);
  useEffect(() => subscribeToContentSocialEngagement((key, subject) => {
    if (key.startsWith("creator_video:") && subject === contentSocialAuthorityKey()) void load();
  }), [load]);
  if (!enabled || !focused || !active || !supportedProfile || hiddenIdentity === identity) return null;
  return <ChillywoodPanel style={styles.panel} testID="profile-reposts-library">
    <Text style={styles.title}>Reposts</Text>
    <Text style={styles.subtitle}>Creator videos shared to this profile</Text>
    {visible.loading && !visible.videos.length ? <ActivityIndicator accessibilityLabel="Loading reposts" color="#7ED7FF" /> : visible.error ? <View><Text style={styles.subtitle}>Reposts could not be checked.</Text><TouchableOpacity style={styles.action} onPress={() => { void load(); }} accessibilityRole="button"><Text style={styles.actionText}>Retry reposts</Text></TouchableOpacity></View> : visible.videos.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{visible.videos.map(video => <View key={video.id} style={styles.tile}><CreatorVideoCard video={video} mode="public" onOpen={() => onOpen(video)} /></View>)}</ScrollView> : <Text style={styles.subtitle}>No public reposts to show.</Text>}
    {visible.cursor ? <TouchableOpacity style={styles.action} disabled={visible.loading} onPress={() => { void load(visible.cursor); }} accessibilityRole="button" accessibilityState={{ disabled: visible.loading, busy: visible.loading }}><Text style={styles.actionText}>{visible.loading ? "Loading…" : "More reposts"}</Text></TouchableOpacity> : null}
  </ChillywoodPanel>;
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12 },
  title: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 18, fontWeight: "800" },
  subtitle: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 13, lineHeight: 19 },
  rail: { gap: 12, paddingBottom: 4 },
  tile: { width: 172 },
  action: { minHeight: 48, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", borderRadius: 16, backgroundColor: CHILLYWOOD_VISUAL.controlBackground },
  actionText: { color: "#9DDCFF", fontSize: 13, fontWeight: "700" },
});
