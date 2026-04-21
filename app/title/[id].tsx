import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { titles as localTitles } from "../../_data/titles";
import {
  resolveContentAccess,
  type ContentAccessResolution,
} from "../../_lib/accessEntitlements";
import {
  DEFAULT_APP_CONFIG,
  readAppConfig,
  resolveBrandingConfig,
  resolveMonetizationConfig,
} from "../../_lib/appConfig";
import {
  getMonetizationAccessSheetPresentation,
  type SponsorPlacement,
  type TitleAccessRule,
} from "../../_lib/monetization";
import { trackEvent } from "../../_lib/analytics";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { useSession } from "../../_lib/session";
import { supabase } from "../../_lib/supabase";
import { readMyListIds, toggleMyListTitle } from "../../_lib/userData";
import { AccessSheet } from "../../components/monetization/access-sheet";
import { ReportSheet } from "../../components/safety/report-sheet";
import type { Tables } from "../../supabase/database.types";

const ACCENT = "#DC143C";
const LIVE_ACTIVITY_WINDOW_MILLIS = 15 * 60 * 1000;

type TitleDbRow = Pick<
  Tables<"titles">,
  | "id"
  | "title"
  | "category"
  | "year"
  | "runtime"
  | "synopsis"
  | "poster_url"
  | "created_at"
  | "content_access_rule"
  | "ads_enabled"
  | "sponsor_placement"
  | "sponsor_label"
>;

type TitleRow = Omit<TitleDbRow, "created_at" | "content_access_rule" | "sponsor_placement"> & {
  created_at?: string | null;
  content_access_rule: TitleAccessRule | null;
  sponsor_placement: SponsorPlacement | null;
};

type TitleLiveMetadata = {
  liveRoomCount: number;
  commentCount: number;
  reactionsEnabled: boolean;
};

type WatchPartyRoomRow = Pick<
  Tables<"watch_party_rooms">,
  "party_id" | "reactions_policy" | "last_activity_at" | "updated_at"
>;

type WatchPartyRoomMessageRow = Pick<Tables<"watch_party_room_messages">, "party_id">;

const toTitleRow = (row: TitleDbRow): TitleRow => ({
  ...row,
  content_access_rule: (row.content_access_rule as TitleAccessRule | null) ?? null,
  sponsor_placement: (row.sponsor_placement as SponsorPlacement | null) ?? null,
});

const buildLocalFallbackTitle = (localMatch: any): TitleRow => ({
  id: String(localMatch?.id),
  title: String(localMatch?.title ?? "Untitled"),
  category: localMatch?.genre ?? null,
  year: Number(localMatch?.year ?? 0) || null,
  runtime: localMatch?.runtime ?? null,
  synopsis: localMatch?.description ?? null,
  poster_url: null,
  created_at: null,
  content_access_rule: "open",
  ads_enabled: false,
  sponsor_placement: "none",
  sponsor_label: null,
});

const formatAddedDate = (value?: string | null) => {
  if (!value) return "Added recently";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Added recently";
  return `Added ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
};

const buildTitleInfoLine = (item: TitleRow) => {
  const segments = [
    String(item.category ?? "").trim() || "Title",
    String(item.runtime ?? "").trim() || (item.year ? String(item.year) : ""),
  ].filter(Boolean);

  return segments.join(" • ");
};

export default function TitleDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isSignedIn } = useSession();
  const cleanId = String(id ?? "").trim();
  const [item, setItem] = useState<TitleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [myListIds, setMyListIds] = useState<string[]>([]);
  const [myListBusy, setMyListBusy] = useState(false);
  const [titleAccess, setTitleAccess] = useState<ContentAccessResolution | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessSheetVisible, setAccessSheetVisible] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [liveMetadata, setLiveMetadata] = useState<TitleLiveMetadata | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  const localMatch = useMemo(
    () => localTitles.find((t: any) => String(t.id) === cleanId || String(t.title ?? "").toLowerCase() === cleanId.toLowerCase()) ?? null,
    [cleanId],
  );
  const localFallbackTitle = useMemo(() => (localMatch ? buildLocalFallbackTitle(localMatch) : null), [localMatch]);

  const titleId = String(item?.id ?? localMatch?.id ?? cleanId).trim();
  const inMyList = titleId ? myListIds.includes(titleId) : false;
  const branding = resolveBrandingConfig(appConfig);
  const monetizationConfig = resolveMonetizationConfig(appConfig);

  useEffect(() => {
    let active = true;

    readAppConfig()
      .then((config) => {
        if (active) setAppConfig(config);
      })
      .catch(() => {
        if (active) setAppConfig(DEFAULT_APP_CONFIG);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);

      try {
        const baseSelect = "id,title,category,year,runtime,synopsis,poster_url,created_at,content_access_rule,ads_enabled,sponsor_placement,sponsor_label";
        const { data: exactIdMatch } = await supabase
          .from("titles")
          .select(baseSelect)
          .eq("id", cleanId)
          .returns<TitleDbRow>()
          .maybeSingle();

        if (active && exactIdMatch) {
          setItem(toTitleRow(exactIdMatch));
        } else if (active && cleanId) {
          const { data: exactTitleMatch } = await supabase
            .from("titles")
            .select(baseSelect)
            .eq("title", cleanId)
            .returns<TitleDbRow>()
            .maybeSingle();

          if (active && exactTitleMatch) {
            setItem(toTitleRow(exactTitleMatch));
          }
        }
      } catch {
        // local fallback below
      }

      if (active && localFallbackTitle) {
        setItem((prev) => prev ?? localFallbackTitle);
      }

      if (active) setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [cleanId, localFallbackTitle]);

  useEffect(() => {
    let active = true;
    readMyListIds()
      .then((ids) => {
        if (active) setMyListIds(ids);
      })
      .catch(() => {
        if (active) setMyListIds([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const title = useMemo(() => item ?? localFallbackTitle, [item, localFallbackTitle]);

  useEffect(() => {
    let active = true;

    const syncLiveMetadata = async () => {
      const safeTitleId = String(title?.id ?? titleId).trim();
      if (!safeTitleId) {
        setLiveMetadata(null);
        return;
      }

      try {
        const { data: roomData, error: roomError } = await supabase
          .from("watch_party_rooms")
          .select("party_id,reactions_policy,last_activity_at,updated_at")
          .eq("room_type", "title")
          .eq("title_id", safeTitleId)
          .returns<WatchPartyRoomRow[]>();

        if (roomError || !roomData) {
          if (active) setLiveMetadata(null);
          return;
        }

        const activeRooms = roomData.filter((row) => {
          const activitySource = String(row.last_activity_at ?? row.updated_at ?? "").trim();
          if (!activitySource) return false;
          const activityAt = Date.parse(activitySource);
          if (!Number.isFinite(activityAt)) return false;
          return Date.now() - activityAt <= LIVE_ACTIVITY_WINDOW_MILLIS;
        });

        if (!activeRooms.length) {
          if (active) setLiveMetadata(null);
          return;
        }

        const activePartyIds = activeRooms.map((row) => String(row.party_id ?? "").trim()).filter(Boolean);
        let commentCount = 0;

        if (activePartyIds.length) {
          const { data: messageData } = await supabase
            .from("watch_party_room_messages")
            .select("party_id")
            .in("party_id", activePartyIds)
            .returns<WatchPartyRoomMessageRow[]>();

          commentCount = (messageData ?? []).length;
        }

        if (!active) return;

        setLiveMetadata({
          liveRoomCount: activeRooms.length,
          commentCount,
          reactionsEnabled: activeRooms.some((row) => String(row.reactions_policy ?? "").trim().toLowerCase() !== "muted"),
        });
      } catch {
        if (active) setLiveMetadata(null);
      }
    };

    void syncLiveMetadata();

    return () => {
      active = false;
    };
  }, [title?.id, titleId]);

  useEffect(() => {
    let active = true;

    const syncAccess = async () => {
      if (!title) {
        setTitleAccess(null);
        setAccessLoading(false);
        return;
      }

      setAccessLoading(true);
      const access = await resolveContentAccess({
        titleId: String(title.id ?? "").trim(),
        accessRule: title.content_access_rule,
      }).catch(() => null);

      if (!active) return;

      setTitleAccess(access);
      setAccessError(null);
      setAccessLoading(false);
    };

    void syncAccess();

    return () => {
      active = false;
    };
  }, [title]);

  const onToggleMyList = async () => {
    if (!titleId || myListBusy) return;
    setMyListBusy(true);
    try {
      const ids = await toggleMyListTitle(titleId, {
        title: item?.title ?? (localMatch as any)?.title,
      });
      setMyListIds(ids);
    } finally {
      setMyListBusy(false);
    }
  };

  const refreshTitleAccessAfterSheetAction = async (action: "purchase" | "restore") => {
    if (!title) {
      return {
        message: "Unable to confirm title access right now.",
        tone: "error" as const,
      };
    }

    const refreshed = await resolveContentAccess({
      titleId: String(title.id ?? "").trim(),
      accessRule: title.content_access_rule,
    }).catch(() => null);
    setTitleAccess(refreshed);

    if (refreshed?.isAllowed) {
      trackEvent("monetization_unlock_success", {
        action,
        surface: "title-detail",
        titleId: String(title.id ?? titleId).trim(),
      });
      setAccessError(null);
      setAccessSheetVisible(false);
      return {
        message: action === "restore" ? "Purchases restored. Title access is active." : "Title access unlocked. You're ready to play.",
        tone: "success" as const,
      };
    }

    const message = refreshed?.monetization.issues[0]
      ?? "Access is still locked for this title after the monetization check.";
    trackEvent("monetization_unlock_failure", {
      action,
      surface: "title-detail",
      titleId: String(title.id ?? titleId).trim(),
    });
    setAccessError(message);
    return {
      message,
      tone: "error" as const,
    };
  };

  const onSubmitReport = async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!title) return;
    setReportBusy(true);
    try {
      await submitSafetyReport({
        targetType: "title",
        targetId: String(title.id ?? titleId).trim(),
        category: input.category,
        note: input.note,
        titleId: String(title.id ?? titleId).trim(),
        context: buildSafetyReportContext({
          sourceSurface: "title-detail",
          sourceRoute: `/title/${String(title.id ?? titleId).trim()}`,
          targetLabel: title.title,
          targetRoleLabel: "Title",
          context: {
            titleTitle: title.title,
          },
        }),
      });
      setReportVisible(false);
    } finally {
      setReportBusy(false);
    }
  };

  const onPlay = () => {
    if (accessLoading) return;
    if (titleAccess && !titleAccess.isAllowed) {
      trackEvent("monetization_gate_shown", {
        surface: "title-detail",
        reason: titleAccess.reason,
        titleId: String(title?.id ?? titleId).trim(),
      });
      setAccessSheetVisible(true);
      return;
    }

    router.push({ pathname: "/player/[id]", params: { id: String(title?.id ?? titleId) } });
  };

  const onOpenWatchPartyLive = () => {
    const nextTitleId = String(title?.id ?? titleId).trim();
    if (!nextTitleId) return;

    router.push({
      pathname: "/watch-party",
      params: {
        titleId: nextTitleId,
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.screenCenter}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.loadingText}>Loading Chi&apos;llywood title…</Text>
      </View>
    );
  }

  if (!title) {
    return (
      <View style={styles.screenCenter}>
        <Text style={styles.h1}>Title unavailable</Text>
        <Text style={styles.stateText}>This title isn&apos;t available right now.</Text>
        <Pressable onPress={() => router.back()} style={styles.btnGhost}>
          <Text style={styles.btnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const isPremiumTitle = titleAccess
    ? titleAccess.classification === "premium_only"
    : title.content_access_rule === "premium";
  const infoLine = buildTitleInfoLine(title);
  const addedLabel = formatAddedDate(title.created_at);
  const titleSignals = [
    {
      label: isPremiumTitle ? "Premium title" : "Open title",
      tone: isPremiumTitle ? "premium" as const : "default" as const,
    },
    ...(inMyList ? [{
      label: "In Favorites",
      tone: "default" as const,
    }] : []),
    ...(liveMetadata?.liveRoomCount ? [{
      label: `${liveMetadata.liveRoomCount} live room${liveMetadata.liveRoomCount === 1 ? "" : "s"}`,
      tone: "live" as const,
    }] : []),
  ];
  const accessSheetPresentation = titleAccess
    ? getMonetizationAccessSheetPresentation({
        gate: titleAccess,
        appDisplayName: branding.appDisplayName,
        premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
        premiumUpsellBody: monetizationConfig.premiumUpsellBody,
      })
    : null;

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        {localMatch?.poster ? (
          <Image source={localMatch.poster} style={styles.hero} />
        ) : (
          <View style={styles.heroFallback} />
        )}

        <View style={styles.content}>
          <Text style={styles.h1}>{title.title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{infoLine}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.metaText}>{addedLabel}</Text>
          </View>
          {titleSignals.length ? (
            <View style={styles.signalRow}>
              {titleSignals.map((signal) => (
                <View
                  key={signal.label}
                  style={[
                    styles.signalPill,
                    signal.tone === "premium" && styles.signalPillPremium,
                    signal.tone === "live" && styles.signalPillLive,
                  ]}
                >
                  <Text
                    style={[
                      styles.signalPillText,
                      signal.tone === "premium" && styles.signalPillTextPremium,
                      signal.tone === "live" && styles.signalPillTextLive,
                    ]}
                  >
                    {signal.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {isPremiumTitle ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusKicker}>PREMIUM TITLE</Text>
              <Text style={styles.statusBody}>
                {titleAccess?.isAllowed
                  ? `${titleAccess.label} access is active for this title inside ${branding.appDisplayName}.`
                  : `${titleAccess?.label ?? "Premium"} access is not currently available for this title on this device or account.`}
              </Text>
            </View>
          ) : null}

          {accessError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorCardText}>{accessError}</Text>
            </View>
          ) : null}

          {liveMetadata?.liveRoomCount ? (
            <View style={styles.liveActivityCard}>
              <Text style={styles.liveActivityKicker}>LIVE WATCH-PARTY</Text>
              <Text style={styles.liveActivityBody}>
                {liveMetadata.liveRoomCount === 1
                  ? "One live room is already moving around this title. Jump in through Watch-Party Live."
                  : `${liveMetadata.liveRoomCount} live rooms are already moving around this title. Jump in through Watch-Party Live.`}
              </Text>
              <View style={styles.liveActivityMetaRow}>
                <Text style={styles.liveActivityMetaText}>
                  {liveMetadata.commentCount} comment{liveMetadata.commentCount === 1 ? "" : "s"}
                </Text>
                {liveMetadata.reactionsEnabled ? (
                  <Text style={styles.liveActivityMetaText}>Reactions live</Text>
                ) : null}
              </View>
              <Pressable style={[styles.btnGhost, styles.liveActivityActionButton]} onPress={onOpenWatchPartyLive}>
                <Text style={styles.btnText}>Open Watch-Party Live</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.btnPrimary, accessLoading && styles.btnDisabled]}
              onPress={onPlay}
              disabled={accessLoading}
            >
              <Text style={styles.btnPrimaryText}>
                {accessLoading ? "Checking access..." : titleAccess && !titleAccess.isAllowed ? "Access Unavailable" : "Play"}
              </Text>
            </Pressable>

            <Pressable style={styles.btnGhost} onPress={onToggleMyList} disabled={myListBusy}>
              <Text style={styles.btnText}>{inMyList ? "✓ Favorites" : "+ Favorites"}</Text>
            </Pressable>

            <Pressable
              style={styles.btnGhost}
              onPress={() => {
                trackModerationActionUsed({
                  surface: "title-detail",
                  action: "open_safety_report",
                  targetType: "title",
                  targetId: String(title.id ?? titleId).trim(),
                  titleId: String(title.id ?? titleId).trim(),
                  sourceRoute: `/title/${String(title.id ?? titleId).trim()}`,
                });
                setReportVisible(true);
              }}
            >
              <Text style={styles.btnText}>Report</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.body}>{title.synopsis ?? "No synopsis yet."}</Text>

          <Pressable onPress={() => router.back()} style={[styles.btnGhost, { marginTop: 18 }]}>
            <Text style={styles.btnText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>

      {titleAccess?.reason === "premium_required" ? (
        <AccessSheet
          visible={accessSheetVisible}
          reason="premium_required"
          gate={titleAccess}
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          deferredMonetization
          kickerOverride={accessSheetPresentation?.kicker}
          titleOverride={accessSheetPresentation?.title}
          bodyOverride={accessSheetPresentation?.body}
          actionLabelOverride={accessSheetPresentation?.actionLabel}
          onPurchaseResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "purchase",
                surface: "title-detail",
                titleId: String(title.id ?? titleId).trim(),
              });
              setAccessError(result.message);
              return;
            }
            return refreshTitleAccessAfterSheetAction("purchase");
          }}
          onRestoreResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "restore",
                surface: "title-detail",
                titleId: String(title.id ?? titleId).trim(),
              });
              setAccessError(result.message);
              return;
            }
            return refreshTitleAccessAfterSheetAction("restore");
          }}
          onClose={() => setAccessSheetVisible(false)}
        />
      ) : null}

      <ReportSheet
        visible={reportVisible}
        title="Report title or content"
        description="Send a safety report for this title if it feels unsafe, miscategorized, or rights-sensitive."
        busy={reportBusy}
        onSubmit={onSubmitReport}
        onClose={() => setReportVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "black" },
  screenCenter: { flex: 1, backgroundColor: "black", alignItems: "center", justifyContent: "center", padding: 20 },
  loadingText: { color: "#9a9a9a", marginTop: 10 },
  stateText: {
    color: "#AAB6CC",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 14,
    textAlign: "center",
  },
  hero: { width: "100%", height: 420, resizeMode: "cover" },
  heroFallback: { width: "100%", height: 420, backgroundColor: "#111" },
  content: { paddingHorizontal: 16, paddingTop: 14 },
  h1: { color: "white", fontSize: 40, fontWeight: "900" },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  signalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  signalPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signalPillPremium: {
    borderColor: "rgba(242,194,91,0.3)",
    backgroundColor: "rgba(242,194,91,0.12)",
  },
  signalPillLive: {
    borderColor: "rgba(220,20,60,0.32)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  signalPillText: {
    color: "#F3F7FF",
    fontSize: 11,
    fontWeight: "800",
  },
  signalPillTextPremium: {
    color: "#FFE4A1",
  },
  signalPillTextLive: {
    color: "#FFD6DE",
  },
  metaText: {
    color: "#C5CEDF",
    fontSize: 13,
    fontWeight: "700",
  },
  metaDot: {
    color: "#6F7990",
    fontSize: 13,
    fontWeight: "900",
  },
  statusCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(18,20,28,0.92)",
    padding: 14,
    gap: 5,
  },
  statusKicker: {
    color: "#C9D6EF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  statusBody: {
    color: "#AAB4C7",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  errorCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.34)",
    backgroundColor: "rgba(220,20,60,0.12)",
    padding: 14,
  },
  errorCardText: {
    color: "#FFD3DC",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  liveActivityCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(34,11,18,0.9)",
    padding: 14,
    gap: 6,
  },
  liveActivityKicker: {
    color: "#FFD6DE",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  liveActivityBody: {
    color: "#E6ECF7",
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: "700",
  },
  liveActivityMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  liveActivityMetaText: {
    color: "#F4C8D3",
    fontSize: 11.5,
    fontWeight: "800",
  },
  liveActivityActionButton: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  actions: { flexDirection: "row", gap: 12, marginTop: 14, marginBottom: 12 },
  btnPrimary: {
    backgroundColor: ACCENT,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnPrimaryText: { color: "white", fontWeight: "900", fontSize: 16 },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  btnText: { color: "white", fontWeight: "900", fontSize: 16 },
  sectionTitle: { color: "white", fontSize: 18, fontWeight: "900", marginTop: 14 },
  body: { color: "rgba(255,255,255,0.85)", marginTop: 6, lineHeight: 20 },
});
