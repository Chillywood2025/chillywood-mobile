import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { titles as localTitles } from "../../_data/titles";
import {
  DEFAULT_APP_CONFIG,
  readAppConfig,
  resolveBrandingConfig,
  resolveMonetizationConfig,
} from "../../_lib/appConfig";
import {
  evaluateTitleAccess,
  resolveSponsorPlacement,
  setUserPlan,
  type ContentAccessDecision,
  type SponsorPlacement,
  type TitleAccessRule,
} from "../../_lib/monetization";
import { trackEvent } from "../../_lib/analytics";
import { submitSafetyReport } from "../../_lib/moderation";
import { useSession } from "../../_lib/session";
import { supabase } from "../../_lib/supabase";
import { readMyListIds, toggleMyListTitle } from "../../_lib/userData";
import { AccessSheet } from "../../components/monetization/access-sheet";
import AdBannerPlaceholder from "../../components/monetization/ad-banner-placeholder";
import { ReportSheet } from "../../components/safety/report-sheet";

const ACCENT = "#DC143C";

type TitleRow = {
  id: string;
  title: string;
  synopsis?: string | null;
  poster_url?: string | null;
  thumbnail_url?: string | null;
  content_access_rule?: TitleAccessRule | null;
  ads_enabled?: boolean | null;
  sponsor_placement?: SponsorPlacement | null;
  sponsor_label?: string | null;
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
  const [titleAccess, setTitleAccess] = useState<ContentAccessDecision | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessSheetVisible, setAccessSheetVisible] = useState(false);
  const [detailSponsorPlacement, setDetailSponsorPlacement] = useState<SponsorPlacement>("none");
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  const localMatch = useMemo(
    () => localTitles.find((t: any) => String(t.id) === cleanId || String(t.title ?? "").toLowerCase() === cleanId.toLowerCase()) ?? null,
    [cleanId],
  );

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
        const { data } = await supabase
          .from("titles")
          .select("id,title,synopsis,poster_url,thumbnail_url,content_access_rule,ads_enabled,sponsor_placement,sponsor_label")
          .eq("id", cleanId)
          .maybeSingle();

        if (active && data) {
          setItem(data as TitleRow);
        }
      } catch {
        // local fallback below
      }

      if (active && localMatch) {
        setItem((prev) => prev ?? {
          id: String((localMatch as any).id),
          title: String((localMatch as any).title ?? "Untitled"),
          synopsis: (localMatch as any).description ?? null,
          poster_url: null,
          thumbnail_url: null,
          content_access_rule: "open",
          ads_enabled: false,
          sponsor_placement: "none",
          sponsor_label: null,
        });
      }

      if (active) setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [cleanId, localMatch]);

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

  const title = useMemo(() => (
    item ?? (localMatch
      ? {
          id: String((localMatch as any).id),
          title: String((localMatch as any).title ?? "Untitled"),
          synopsis: (localMatch as any).description ?? null,
          poster_url: null,
          thumbnail_url: null,
          content_access_rule: "open",
          ads_enabled: false,
          sponsor_placement: "none",
          sponsor_label: null,
        }
      : null)
  ), [item, localMatch]);

  useEffect(() => {
    let active = true;

    const syncAccess = async () => {
      if (!title) {
        setTitleAccess(null);
        setDetailSponsorPlacement("none");
        setAccessLoading(false);
        return;
      }

      setAccessLoading(true);
      const access = await evaluateTitleAccess({
        titleId: String(title.id ?? "").trim(),
        accessRule: title.content_access_rule,
      }).catch(() => null);

      if (!active) return;

      const sponsorPlacement = await resolveSponsorPlacement({
        accessRule: title.content_access_rule,
        placement: title.sponsor_placement,
        adsEnabled: title.ads_enabled,
        plan: access?.plan ?? null,
        isRoomContext: false,
        isLiveContext: false,
      }).catch(() => "none" as SponsorPlacement);

      if (!active) return;
      setTitleAccess(access);
      setDetailSponsorPlacement(sponsorPlacement);
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

  const onUnlockAccess = async () => {
    if (!title || !titleAccess || titleAccess.reason !== "premium_required") return;
    if (!isSignedIn) {
      router.push({
        pathname: "/(auth)/login",
        params: {
          redirectTo: `/title/${String(title.id ?? titleId).trim()}`,
        },
      });
      return;
    }
    setAccessBusy(true);
    try {
      await setUserPlan("premium");
      const refreshed = await evaluateTitleAccess({
        titleId: String(title.id ?? "").trim(),
        accessRule: title.content_access_rule,
      }).catch(() => null);
      setTitleAccess(refreshed);
      if (refreshed?.allowed) {
        trackEvent("monetization_unlock_success", {
          surface: "title-detail",
          titleId: String(title.id ?? titleId).trim(),
        });
        setAccessSheetVisible(false);
      }
    } catch {
      trackEvent("monetization_unlock_failure", {
        surface: "title-detail",
        titleId: String(title.id ?? titleId).trim(),
      });
    } finally {
      setAccessBusy(false);
    }
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
        context: {
          titleTitle: title.title,
        },
      });
      setReportVisible(false);
    } finally {
      setReportBusy(false);
    }
  };

  const onPlay = () => {
    if (accessLoading) return;
    if (titleAccess && !titleAccess.allowed) {
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

  if (loading) {
    return (
      <View style={styles.screenCenter}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.loadingText}>Loading title…</Text>
      </View>
    );
  }

  if (!title) {
    return (
      <View style={styles.screenCenter}>
        <Text style={styles.h1}>Not found</Text>
        <Pressable onPress={() => router.back()} style={styles.btnGhost}>
          <Text style={styles.btnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const isPremiumTitle = title.content_access_rule === "premium";

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
          {isPremiumTitle ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusKicker}>PREMIUM TITLE</Text>
              <Text style={styles.statusBody}>
                {titleAccess?.allowed
                  ? `Premium access is active for this title inside ${branding.appDisplayName}.`
                  : `This title is reserved for Premium access inside ${branding.appDisplayName}.`}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.btnPrimary, accessLoading && styles.btnDisabled]}
              onPress={onPlay}
              disabled={accessLoading}
            >
              <Text style={styles.btnPrimaryText}>
                {accessLoading ? "Checking access..." : titleAccess && !titleAccess.allowed ? "Unlock to Play" : "Play"}
              </Text>
            </Pressable>

            <Pressable style={styles.btnGhost} onPress={onToggleMyList} disabled={myListBusy}>
              <Text style={styles.btnText}>{inMyList ? "✓ Favorites" : "+ Favorites"}</Text>
            </Pressable>

            <Pressable style={styles.btnGhost} onPress={() => setReportVisible(true)}>
              <Text style={styles.btnText}>Report</Text>
            </Pressable>
          </View>

          {detailSponsorPlacement === "detail_banner" ? (
            <AdBannerPlaceholder label={title.sponsor_label ?? monetizationConfig.defaultSponsorLabel} />
          ) : null}

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
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          busy={accessBusy}
          onConfirm={() => {
            void onUnlockAccess();
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
  hero: { width: "100%", height: 420, resizeMode: "cover" },
  heroFallback: { width: "100%", height: 420, backgroundColor: "#111" },
  content: { paddingHorizontal: 16, paddingTop: 14 },
  h1: { color: "white", fontSize: 40, fontWeight: "900" },
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
