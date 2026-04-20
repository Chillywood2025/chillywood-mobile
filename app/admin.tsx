import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ImageBackground,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
  DEFAULT_APP_CONFIG,
  getThemePresetPalette,
  readAppConfig,
  saveAppConfig,
  type AppConfig,
  type HomeRailKey,
} from "../_lib/appConfig";
import type { Database } from "../supabase/database.types";
import { getBetaAccessBlockCopy, useBetaProgram } from "../_lib/betaProgram";
import { reportDebugError, reportDebugQuery } from "../_lib/devDebug";
import { useSession } from "../_lib/session";
import {
  getModerationAccess,
  hasPlatformRoleMembership,
  readMyPlatformRoleMemberships,
  readSafetyReports,
  type PlatformRoleMembership,
  type SafetyReportRecord,
} from "../_lib/moderation";
import {
  normalizeCreatorPermissionSet,
  normalizeSponsorPlacement,
  normalizeTitleAccessRule,
  readCreatorPermissions,
  sanitizeCreatorTitleMonetization,
  saveCreatorPermissions,
  type CreatorPermissionSet,
  type SponsorPlacement,
  type TitleAccessRule,
} from "../_lib/monetization";
import { supabase } from "../_lib/supabase";
import { BetaAccessScreen } from "../components/system/beta-access-screen";

type TitleId = Database["public"]["Tables"]["titles"]["Row"]["id"];

type StatusType = "draft" | "published" | "scheduled" | "archived";

type TitleRow = {
  id: TitleId;
  title: string;
  category?: string | null;
  year?: number | null;
  runtime?: string | null;
  synopsis?: string | null;
  poster_url?: string | null;
  video_url?: string | null;
  featured?: boolean | null;
  is_published?: boolean | null;
  sort_order?: number | null;
  is_hero?: boolean | null;
  is_trending?: boolean | null;
  pin_to_top_row?: boolean | null;
  thumbnail_url?: string | null;
  preview_video_url?: string | null;
  status?: string | null;
  release_at?: string | null;
  content_access_rule?: TitleAccessRule | null;
  ads_enabled?: boolean | null;
  sponsor_placement?: SponsorPlacement | null;
  sponsor_label?: string | null;
};

type FilterKey =
  | "all"
  | "published"
  | "scheduled"
  | "draft"
  | "archived"
  | "featured"
  | "hero"
  | "trending"
  | "top-row";

type EditorMode = "create" | "edit";

type EditorForm = {
  id?: TitleId;
  title: string;
  category: string;
  year: string;
  runtime: string;
  synopsis: string;
  poster_url: string;
  thumbnail_url: string;
  video_url: string;
  preview_video_url: string;
  featured: boolean;
  is_hero: boolean;
  is_trending: boolean;
  pin_to_top_row: boolean;
  status: StatusType;
  release_at: string;
  sort_order: string;
  content_access_rule: TitleAccessRule;
  ads_enabled: boolean;
  sponsor_placement: SponsorPlacement;
  sponsor_label: string;
};

const BASE_SELECT = "id,title,category,year,runtime,synopsis,poster_url,video_url,featured,is_published,sort_order";

type AdminCapabilities = {
  heroCol: "is_hero" | "hero" | null;
  trendingCol: "is_trending" | "trending" | null;
  topRowCol: "pin_to_top_row" | "top_row" | null;
  releaseCol: "release_at" | "release_date" | null;
  statusCol: "status" | null;
  thumbnailCol: "thumbnail_url" | null;
  previewCol: "preview_video_url" | null;
  contentAccessCol: "content_access_rule" | null;
  adsEnabledCol: "ads_enabled" | null;
  sponsorPlacementCol: "sponsor_placement" | null;
  sponsorLabelCol: "sponsor_label" | null;
};

const statusOptions: StatusType[] = ["draft", "published", "scheduled", "archived"];
const railLabels: Record<HomeRailKey, string> = {
  top_picks: "Top Picks",
  browse: "Browse",
  favorites: "Favorites",
  continue_watching: "Continue Watching",
};

const normalizeStatus = (raw?: string | null, isPublished?: boolean | null): StatusType => {
  const value = (raw ?? "").toLowerCase().trim();
  if (value === "draft" || value === "published" || value === "scheduled" || value === "archived") {
    return value;
  }
  return isPublished === true ? "published" : "draft";
};

const toIdString = (id: TitleId) => String(id);

const toSortNumber = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;

const defaultCapabilities: AdminCapabilities = {
  heroCol: null,
  trendingCol: null,
  topRowCol: null,
  releaseCol: null,
  statusCol: null,
  thumbnailCol: null,
  previewCol: null,
  contentAccessCol: null,
  adsEnabledCol: null,
  sponsorPlacementCol: null,
  sponsorLabelCol: null,
};

const toBoolean = (value: unknown) => value === true;

const canonicalizeRow = (row: Record<string, any>): TitleRow => {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    year: row.year,
    runtime: row.runtime,
    synopsis: row.synopsis,
    poster_url: row.poster_url,
    video_url: row.video_url,
    featured: row.featured,
    is_published: row.is_published,
    sort_order: row.sort_order,
    is_hero: toBoolean(row.is_hero) || toBoolean(row.hero),
    is_trending: toBoolean(row.is_trending) || toBoolean(row.trending),
    pin_to_top_row: toBoolean(row.pin_to_top_row) || toBoolean(row.top_row),
    thumbnail_url: row.thumbnail_url,
    preview_video_url: row.preview_video_url,
    status: row.status,
    release_at: row.release_at ?? row.release_date,
    content_access_rule: normalizeTitleAccessRule(row.content_access_rule),
    ads_enabled: row.ads_enabled === true,
    sponsor_placement: normalizeSponsorPlacement(row.sponsor_placement),
    sponsor_label: row.sponsor_label,
  };
};

const normalizeRows = (rows: TitleRow[]) => {
  return rows
    .map((row) => ({
      ...row,
      status: normalizeStatus(row.status, row.is_published),
      featured: row.featured === true,
      is_hero: row.is_hero === true,
      is_trending: row.is_trending === true,
      pin_to_top_row: row.pin_to_top_row === true,
      is_published: row.is_published === true,
      content_access_rule: normalizeTitleAccessRule(row.content_access_rule),
      ads_enabled: row.ads_enabled === true,
      sponsor_placement: normalizeSponsorPlacement(row.sponsor_placement),
      sponsor_label: row.sponsor_label ?? null,
    }))
    .sort((a, b) => {
      const orderDiff = toSortNumber(a.sort_order) - toSortNumber(b.sort_order);
      if (orderDiff !== 0) return orderDiff;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
};

const getCompactArtSource = (item: TitleRow) => {
  const poster = (item.poster_url ?? "").trim();
  if (poster.startsWith("http")) return { uri: poster };
  const thumb = (item.thumbnail_url ?? "").trim();
  if (thumb.startsWith("http")) return { uri: thumb };
  return require("../assets/images/chicago-skyline.jpg");
};

const getStatusTone = (status: StatusType) => {
  if (status === "published") return styles.badgePublished;
  if (status === "scheduled") return styles.badgeScheduled;
  if (status === "archived") return styles.badgeArchived;
  return styles.badgeDraft;
};

const hasTitleId = (item: TitleRow, targetId: string) => String(item.id ?? "").trim() === targetId;

const hasHeroFlagCandidate = (titles: TitleRow[]) => titles.some((item) => item.is_hero === true);

const hasTopPicksCandidate = (titles: TitleRow[], source: AppConfig["home"]["topPicksSource"]) => {
  if (source === "recent") return true;
  if (source === "featured") return titles.some((item) => item.featured === true);
  if (source === "trending") return titles.some((item) => item.is_trending === true);
  return titles.some((item) => item.pin_to_top_row === true);
};

const applyExperienceConfigGuardrails = (
  config: AppConfig,
  titles: TitleRow[],
): { nextConfig: AppConfig; adjustments: string[] } => {
  const adjustments: string[] = [];
  const nextConfig: AppConfig = {
    ...config,
    home: {
      ...config.home,
      manualHeroTitleId: config.home.heroMode === "manual_title"
        ? String(config.home.manualHeroTitleId ?? "").trim() || null
        : null,
    },
  };

  if (nextConfig.home.heroMode === "manual_title") {
    const manualHeroTitleId = String(nextConfig.home.manualHeroTitleId ?? "").trim();
    const manualHeroExists = manualHeroTitleId.length > 0 && titles.some((item) => hasTitleId(item, manualHeroTitleId));
    if (!manualHeroExists) {
      const fallbackHeroMode = hasHeroFlagCandidate(titles) ? "hero_flag" : "latest";
      nextConfig.home = {
        ...nextConfig.home,
        heroMode: fallbackHeroMode,
        manualHeroTitleId: null,
      };
      adjustments.push(
        fallbackHeroMode === "hero_flag"
          ? "manual hero target was unavailable, so Hero Strategy was reset to HERO FLAG"
          : "manual hero target was unavailable, so Hero Strategy was reset to LATEST",
      );
    }
  } else if (nextConfig.home.heroMode === "hero_flag" && !hasHeroFlagCandidate(titles)) {
    nextConfig.home = {
      ...nextConfig.home,
      heroMode: "latest",
      manualHeroTitleId: null,
    };
    adjustments.push("hero flag strategy had no real hero title, so Hero Strategy was reset to LATEST");
  }

  if (!hasTopPicksCandidate(titles, nextConfig.home.topPicksSource)) {
    const staleSource = nextConfig.home.topPicksSource;
    nextConfig.home = {
      ...nextConfig.home,
      topPicksSource: "recent",
    };
    adjustments.push(`top picks source ${staleSource.replace("_", " ").toUpperCase()} had no real titles, so it was reset to RECENT`);
  }

  return { nextConfig, adjustments };
};

const formatModerationToken = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "UNKNOWN";
  return text.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const readContextText = (value: unknown, fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const formatModerationTimestamp = (value: string | null) => {
  if (!value) return "Pending timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatRelease = (releaseAt?: string | null) => {
  const raw = (releaseAt ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
};

const toDatetimeLocalValue = (raw?: string | null) => {
  const value = (raw ?? "").trim();
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return iso.slice(0, 16);
};

const fromDatetimeLocalValue = (raw: string) => {
  const value = raw.trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export default function AdminStudioScreen() {
  const router = useRouter();
  const { isLoading: authLoading, isSignedIn, user } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [saving, setSaving] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [capabilities, setCapabilities] = useState<AdminCapabilities>(defaultCapabilities);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [experienceConfig, setExperienceConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [creatorGrantUserId, setCreatorGrantUserId] = useState("");
  const [creatorGrantLoading, setCreatorGrantLoading] = useState(false);
  const [creatorGrantSaving, setCreatorGrantSaving] = useState(false);
  const [creatorGrantForm, setCreatorGrantForm] = useState<CreatorPermissionSet>(normalizeCreatorPermissionSet(null));
  const [platformRoles, setPlatformRoles] = useState<PlatformRoleMembership[]>([]);
  const [platformRolesLoading, setPlatformRolesLoading] = useState(false);
  const [safetyReports, setSafetyReports] = useState<SafetyReportRecord[]>([]);
  const [safetyReportsLoading, setSafetyReportsLoading] = useState(false);
  const [moderationNotice, setModerationNotice] = useState<string | null>(null);
  const [form, setForm] = useState<EditorForm>({
    title: "",
    category: "",
    year: "",
    runtime: "",
    synopsis: "",
    poster_url: "",
    thumbnail_url: "",
    video_url: "",
    preview_video_url: "",
    featured: false,
    is_hero: false,
    is_trending: false,
    pin_to_top_row: false,
    status: "draft",
    release_at: "",
    sort_order: "0",
    content_access_rule: "open",
    ads_enabled: false,
    sponsor_placement: "none",
    sponsor_label: "",
  });
  const themePalette = getThemePresetPalette(experienceConfig.theme.preset);
  const moderationAccess = getModerationAccess({
    userId: user?.id ?? null,
    email: user?.email ?? null,
  });
  const canAccessAdmin = isSignedIn && isActive && moderationAccess.canAccessAdmin;
  const canReviewSafetyReports = hasPlatformRoleMembership(platformRoles, ["operator", "moderator"]);
  const canManagePrivilegedAdminWrites = hasPlatformRoleMembership(platformRoles, ["operator"]);
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Admin tools");

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false);
      setConfigLoading(false);
      setPlatformRoles([]);
      setPlatformRolesLoading(false);
      setSafetyReports([]);
      setSafetyReportsLoading(false);
      setModerationNotice(null);
      return;
    }
    loadTitles();
    loadExperienceConfig();
    void loadPlatformRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessAdmin]);

  useEffect(() => {
    if (!canAccessAdmin || !canReviewSafetyReports) {
      setSafetyReports([]);
      setSafetyReportsLoading(false);
      return;
    }
    void loadSafetyReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessAdmin, canReviewSafetyReports]);

  const stats = useMemo(() => {
    const total = titles.length;
    const published = titles.filter((item) => normalizeStatus(item.status, item.is_published) === "published").length;
    const scheduled = titles.filter((item) => normalizeStatus(item.status, item.is_published) === "scheduled").length;
    const draft = titles.filter((item) => normalizeStatus(item.status, item.is_published) === "draft").length;
    const hero = titles.filter((item) => item.is_hero === true).length;
    return { total, published, scheduled, draft, hero };
  }, [titles]);

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        titles
          .map((item) => (item.category ?? "").trim())
          .filter((item) => item.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [titles]);

  const filteredTitles = useMemo(() => {
    const q = query.trim().toLowerCase();

    return titles.filter((item) => {
      const status = normalizeStatus(item.status, item.is_published);
      if (filter === "published" && status !== "published") return false;
      if (filter === "scheduled" && status !== "scheduled") return false;
      if (filter === "draft" && status !== "draft") return false;
      if (filter === "archived" && status !== "archived") return false;
      if (filter === "featured" && item.featured !== true) return false;
      if (filter === "hero" && item.is_hero !== true) return false;
      if (filter === "trending" && item.is_trending !== true) return false;
      if (filter === "top-row" && item.pin_to_top_row !== true) return false;

      if (!q) return true;

      const titleText = (item.title ?? "").toLowerCase();
      const categoryText = (item.category ?? "").toLowerCase();
      const statusText = status.toLowerCase();
      return titleText.includes(q) || categoryText.includes(q) || statusText.includes(q);
    });
  }, [titles, query, filter]);

  const hasHeroControl = capabilities.heroCol !== null;
  const hasTrendingControl = capabilities.trendingCol !== null;
  const hasTopRowControl = capabilities.topRowCol !== null;
  const hasReleaseControl = capabilities.releaseCol !== null;
  const hasStatusControl = capabilities.statusCol !== null;
  const hasTitleMonetizationControls =
    capabilities.contentAccessCol !== null
    && capabilities.adsEnabledCol !== null
    && capabilities.sponsorPlacementCol !== null
    && capabilities.sponsorLabelCol !== null;

  useEffect(() => {
    if (!canAccessAdmin) return;
    if (loading) {
      reportDebugQuery({ name: "admin.titles", status: "loading", error: null });
      return;
    }
    if (notice?.type === "error") {
      reportDebugQuery({ name: "admin.titles", status: "error", error: notice.text });
      return;
    }
    reportDebugQuery({ name: "admin.titles", status: "success", error: null });
  }, [canAccessAdmin, loading, notice]);

  useEffect(() => {
    if (!canAccessAdmin) return;
    reportDebugError(notice?.type === "error" ? notice.text : null);
  }, [canAccessAdmin, notice]);

  const probeColumn = useCallback(async (column: string) => {
    const { error } = await supabase.from("titles").select(column).limit(1);
    return !error;
  }, []);

  const detectCapabilities = useCallback(async (): Promise<AdminCapabilities> => {
    const [
      hasIsHero,
      hasHero,
      hasIsTrending,
      hasTrending,
      hasPinTop,
      hasTopRow,
      hasReleaseAt,
      hasReleaseDate,
      hasStatus,
      hasThumb,
      hasPreview,
      hasContentAccess,
      hasAdsEnabled,
      hasSponsorPlacement,
      hasSponsorLabel,
    ] = await Promise.all([
      probeColumn("is_hero"),
      probeColumn("hero"),
      probeColumn("is_trending"),
      probeColumn("trending"),
      probeColumn("pin_to_top_row"),
      probeColumn("top_row"),
      probeColumn("release_at"),
      probeColumn("release_date"),
      probeColumn("status"),
      probeColumn("thumbnail_url"),
      probeColumn("preview_video_url"),
      probeColumn("content_access_rule"),
      probeColumn("ads_enabled"),
      probeColumn("sponsor_placement"),
      probeColumn("sponsor_label"),
    ]);

    return {
      heroCol: hasIsHero ? "is_hero" : hasHero ? "hero" : null,
      trendingCol: hasIsTrending ? "is_trending" : hasTrending ? "trending" : null,
      topRowCol: hasPinTop ? "pin_to_top_row" : hasTopRow ? "top_row" : null,
      releaseCol: hasReleaseAt ? "release_at" : hasReleaseDate ? "release_date" : null,
      statusCol: hasStatus ? "status" : null,
      thumbnailCol: hasThumb ? "thumbnail_url" : null,
      previewCol: hasPreview ? "preview_video_url" : null,
      contentAccessCol: hasContentAccess ? "content_access_rule" : null,
      adsEnabledCol: hasAdsEnabled ? "ads_enabled" : null,
      sponsorPlacementCol: hasSponsorPlacement ? "sponsor_placement" : null,
      sponsorLabelCol: hasSponsorLabel ? "sponsor_label" : null,
    };
  }, [probeColumn]);

  const loadExperienceConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      const config = await readAppConfig();
      setExperienceConfig(config);
    } catch (err: any) {
      setExperienceConfig(DEFAULT_APP_CONFIG);
      setNotice({ type: "error", text: err?.message ?? "Failed to load experience config." });
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadPlatformRoles = useCallback(async () => {
    try {
      setPlatformRolesLoading(true);
      setModerationNotice(null);
      const memberships = await readMyPlatformRoleMemberships();
      setPlatformRoles(memberships);
    } catch (err: any) {
      setPlatformRoles([]);
      setModerationNotice(err?.message ?? "Failed to load platform moderation roles.");
    } finally {
      setPlatformRolesLoading(false);
    }
  }, []);

  const loadSafetyReports = useCallback(async () => {
    try {
      setSafetyReportsLoading(true);
      setModerationNotice(null);
      const reports = await readSafetyReports({ limit: 8 });
      setSafetyReports(reports);
    } catch (err: any) {
      setSafetyReports([]);
      setModerationNotice(err?.message ?? "Failed to load the safety review queue.");
    } finally {
      setSafetyReportsLoading(false);
    }
  }, []);

  const toDbPatch = useCallback(
    (patch: Partial<TitleRow>): Record<string, any> => {
      const payload: Record<string, any> = {};

      if (patch.title !== undefined) payload.title = patch.title;
      if (patch.category !== undefined) payload.category = patch.category;
      if (patch.year !== undefined) payload.year = patch.year;
      if (patch.runtime !== undefined) payload.runtime = patch.runtime;
      if (patch.synopsis !== undefined) payload.synopsis = patch.synopsis;
      if (patch.poster_url !== undefined) payload.poster_url = patch.poster_url;
      if (patch.video_url !== undefined) payload.video_url = patch.video_url;
      if (patch.featured !== undefined) payload.featured = patch.featured;
      if (patch.is_published !== undefined) payload.is_published = patch.is_published;
      if (patch.sort_order !== undefined) payload.sort_order = patch.sort_order;

      if (patch.thumbnail_url !== undefined && capabilities.thumbnailCol) {
        payload[capabilities.thumbnailCol] = patch.thumbnail_url;
      }
      if (patch.preview_video_url !== undefined && capabilities.previewCol) {
        payload[capabilities.previewCol] = patch.preview_video_url;
      }
      if (patch.is_hero !== undefined && capabilities.heroCol) {
        payload[capabilities.heroCol] = patch.is_hero;
      }
      if (patch.is_trending !== undefined && capabilities.trendingCol) {
        payload[capabilities.trendingCol] = patch.is_trending;
      }
      if (patch.pin_to_top_row !== undefined && capabilities.topRowCol) {
        payload[capabilities.topRowCol] = patch.pin_to_top_row;
      }
      if (patch.status !== undefined && capabilities.statusCol) {
        payload[capabilities.statusCol] = patch.status;
      }
      if (patch.release_at !== undefined && capabilities.releaseCol) {
        payload[capabilities.releaseCol] = patch.release_at;
      }
      if (patch.content_access_rule !== undefined && capabilities.contentAccessCol) {
        payload[capabilities.contentAccessCol] = normalizeTitleAccessRule(patch.content_access_rule);
      }
      if (patch.ads_enabled !== undefined && capabilities.adsEnabledCol) {
        payload[capabilities.adsEnabledCol] = !!patch.ads_enabled;
      }
      if (patch.sponsor_placement !== undefined && capabilities.sponsorPlacementCol) {
        payload[capabilities.sponsorPlacementCol] = normalizeSponsorPlacement(patch.sponsor_placement);
      }
      if (patch.sponsor_label !== undefined && capabilities.sponsorLabelCol) {
        payload[capabilities.sponsorLabelCol] = patch.sponsor_label;
      }

      return payload;
    },
    [capabilities],
  );

  const loadTitles = useCallback(async () => {
    try {
      setLoading(true);
      setNotice(null);

      const detected = await detectCapabilities();
      setCapabilities(detected);

      const selectParts = new Set<string>(BASE_SELECT.split(","));
      if (detected.heroCol) selectParts.add(detected.heroCol);
      if (detected.trendingCol) selectParts.add(detected.trendingCol);
      if (detected.topRowCol) selectParts.add(detected.topRowCol);
      if (detected.statusCol) selectParts.add(detected.statusCol);
      if (detected.releaseCol) selectParts.add(detected.releaseCol);
      if (detected.thumbnailCol) selectParts.add(detected.thumbnailCol);
      if (detected.previewCol) selectParts.add(detected.previewCol);
      if (detected.contentAccessCol) selectParts.add(detected.contentAccessCol);
      if (detected.adsEnabledCol) selectParts.add(detected.adsEnabledCol);
      if (detected.sponsorPlacementCol) selectParts.add(detected.sponsorPlacementCol);
      if (detected.sponsorLabelCol) selectParts.add(detected.sponsorLabelCol);

      const query = await supabase
        .from("titles")
        .select(Array.from(selectParts).join(","))
        .order("sort_order", { ascending: true });

      if (query.error) throw query.error;

      const rows = ((query.data as Record<string, any>[] | null) ?? []).map(canonicalizeRow);
      setTitles(normalizeRows(rows));
    } catch (err: any) {
      setNotice({ type: "error", text: err?.message ?? "Failed to load titles." });
    } finally {
      setLoading(false);
    }
  }, [detectCapabilities]);

  const updateExperienceConfig = useCallback((updater: (prev: AppConfig) => AppConfig) => {
    setExperienceConfig((prev) => updater(prev));
  }, []);

  const loadCreatorGrantTarget = useCallback(async () => {
    if (!canManagePrivilegedAdminWrites) {
      setNotice({ type: "error", text: "Active operator role required to load creator grants." });
      return;
    }

    const targetUserId = creatorGrantUserId.trim();
    if (!targetUserId) {
      setCreatorGrantForm(normalizeCreatorPermissionSet(null));
      return;
    }

    try {
      setCreatorGrantLoading(true);
      const resolved = await readCreatorPermissions(targetUserId);
      setCreatorGrantForm(resolved);
      setNotice({ type: "success", text: `Loaded creator grants for ${targetUserId}.` });
    } catch (err: any) {
      setCreatorGrantForm(normalizeCreatorPermissionSet(null, targetUserId));
      setNotice({ type: "error", text: err?.message ?? "Unable to load creator grants." });
    } finally {
      setCreatorGrantLoading(false);
    }
  }, [canManagePrivilegedAdminWrites, creatorGrantUserId]);

  const saveCreatorGrantTarget = useCallback(async () => {
    if (!canManagePrivilegedAdminWrites) {
      setNotice({ type: "error", text: "Active operator role required to save creator grants." });
      return;
    }

    const targetUserId = creatorGrantUserId.trim();
    if (!targetUserId) {
      setNotice({ type: "error", text: "Enter a creator user id before saving grants." });
      return;
    }

    try {
      setCreatorGrantSaving(true);
      const saved = await saveCreatorPermissions(targetUserId, creatorGrantForm);
      setCreatorGrantForm(saved);
      setNotice({ type: "success", text: `Creator grants saved for ${targetUserId}.` });
    } catch (err: any) {
      setNotice({ type: "error", text: err?.message ?? "Unable to save creator grants." });
    } finally {
      setCreatorGrantSaving(false);
    }
  }, [canManagePrivilegedAdminWrites, creatorGrantForm, creatorGrantUserId]);

  const moveRail = useCallback((railKey: HomeRailKey, direction: -1 | 1) => {
    updateExperienceConfig((prev) => {
      const nextOrder = [...prev.home.railOrder];
      const currentIndex = nextOrder.indexOf(railKey);
      if (currentIndex < 0) return prev;
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= nextOrder.length) return prev;
      const [entry] = nextOrder.splice(currentIndex, 1);
      nextOrder.splice(targetIndex, 0, entry);
      return {
        ...prev,
        home: {
          ...prev.home,
          railOrder: nextOrder,
        },
      };
    });
  }, [updateExperienceConfig]);

  const saveExperienceConfigChanges = useCallback(async () => {
    if (!canManagePrivilegedAdminWrites) {
      setNotice({ type: "error", text: "Active operator role required to save global config." });
      return;
    }

    try {
      setConfigSaving(true);
      const { nextConfig, adjustments } = applyExperienceConfigGuardrails(experienceConfig, titles);
      const saved = await saveAppConfig(nextConfig, "admin");
      setExperienceConfig(saved);
      setNotice({
        type: "success",
        text: adjustments.length > 0
          ? `Experience config saved. ${adjustments.join("; ")}.`
          : "Experience config saved.",
      });
    } catch (err: any) {
      setNotice({ type: "error", text: err?.message ?? "Failed to save experience config." });
    } finally {
      setConfigSaving(false);
    }
  }, [canManagePrivilegedAdminWrites, experienceConfig, titles]);

  const openCreate = useCallback(() => {
    const nextSort = titles.reduce((acc, item) => Math.max(acc, item.sort_order ?? 0), 0) + 1;
    setEditorMode("create");
    setForm({
      title: "",
      category: "Drama",
      year: "",
      runtime: "",
      synopsis: "",
      poster_url: "",
      thumbnail_url: "",
      video_url: "",
      preview_video_url: "",
      featured: false,
      is_hero: false,
      is_trending: false,
      pin_to_top_row: false,
      status: "draft",
      release_at: "",
      sort_order: String(nextSort),
      content_access_rule: "open",
      ads_enabled: false,
      sponsor_placement: "none",
      sponsor_label: "",
    });
    setEditorVisible(true);
  }, [titles]);

  const openEdit = useCallback((item: TitleRow) => {
    setEditorMode("edit");
    setForm({
      id: item.id,
      title: item.title ?? "",
      category: item.category ?? "",
      year: item.year != null ? String(item.year) : "",
      runtime: item.runtime ?? "",
      synopsis: item.synopsis ?? "",
      poster_url: item.poster_url ?? "",
      thumbnail_url: item.thumbnail_url ?? "",
      video_url: item.video_url ?? "",
      preview_video_url: item.preview_video_url ?? "",
      featured: item.featured === true,
      is_hero: item.is_hero === true,
      is_trending: item.is_trending === true,
      pin_to_top_row: item.pin_to_top_row === true,
      status: normalizeStatus(item.status, item.is_published),
      release_at: toDatetimeLocalValue(item.release_at),
      sort_order: item.sort_order != null ? String(item.sort_order) : "0",
      content_access_rule: normalizeTitleAccessRule(item.content_access_rule),
      ads_enabled: item.ads_enabled === true,
      sponsor_placement: normalizeSponsorPlacement(item.sponsor_placement),
      sponsor_label: item.sponsor_label ?? "",
    });
    setEditorVisible(true);
  }, []);

  const patchTitle = useCallback(
    async (id: TitleId, patch: Partial<TitleRow>, successText: string) => {
      try {
        const payload = toDbPatch(patch);

        const { error } = await supabase.from("titles").update(payload).eq("id", id);
        if (error) throw error;

        setTitles((prev) =>
          normalizeRows(
            prev.map((item) =>
              toIdString(item.id) === toIdString(id)
                ? {
                    ...item,
                    ...patch,
                  }
                : item,
            ),
          ),
        );

        setNotice({ type: "success", text: successText });
      } catch (err: any) {
        setNotice({ type: "error", text: err?.message ?? "Update failed." });
      }
    },
    [toDbPatch],
  );

  const setHeroExclusive = useCallback(
    async (item: TitleRow) => {
      if (!capabilities.heroCol) {
        setNotice({ type: "error", text: "Hero control is unavailable for this schema." });
        return;
      }

      try {
        setSaving(true);
        const clearOthers = await supabase
          .from("titles")
          .update({ [capabilities.heroCol]: false })
          .neq("id", item.id);
        if (clearOthers.error) throw clearOthers.error;

        const setCurrent = await supabase
          .from("titles")
          .update({ [capabilities.heroCol]: true })
          .eq("id", item.id);
        if (setCurrent.error) throw setCurrent.error;

        setTitles((prev) =>
          prev.map((row) => ({
            ...row,
            is_hero: toIdString(row.id) === toIdString(item.id),
          })),
        );

        setNotice({ type: "success", text: `${item.title} is now Home Hero.` });
      } catch (err: any) {
        setNotice({ type: "error", text: err?.message ?? "Failed to set hero." });
      } finally {
        setSaving(false);
      }
    },
    [capabilities.heroCol],
  );

  const saveEditor = useCallback(async () => {
    if (!form.title.trim()) {
      Alert.alert("Title required", "Please enter a title before saving.");
      return;
    }

    if (!form.video_url.trim() && editorMode === "create") {
      Alert.alert("Video URL required", "Please add a playable video URL to preview content in app.");
      return;
    }

    const yearNum = form.year.trim() ? Number.parseInt(form.year.trim(), 10) : null;
    const sortOrderNum = form.sort_order.trim() ? Number.parseInt(form.sort_order.trim(), 10) : null;
    const status = hasStatusControl ? normalizeStatus(form.status, form.status === "published") : "draft";
    const releaseAtIso = hasReleaseControl ? fromDatetimeLocalValue(form.release_at) : null;

    const scheduledInFuture =
      status === "scheduled" && !!releaseAtIso && new Date(releaseAtIso).getTime() > Date.now();

    const derivedPublished = status === "published" || (status === "scheduled" && !scheduledInFuture);

    const operatorPermissions = await readCreatorPermissions().catch(() => normalizeCreatorPermissionSet(null));
    const sanitizedMonetization = sanitizeCreatorTitleMonetization({
      contentAccessRule: form.content_access_rule,
      adsEnabled: form.ads_enabled,
      sponsorPlacement: form.sponsor_placement,
      sponsorLabel: form.sponsor_label.trim() || null,
      permissions: operatorPermissions,
    });

    let payload: Record<string, any> = {
      title: form.title.trim(),
      category: form.category.trim() || null,
      year: Number.isNaN(yearNum as number) ? null : yearNum,
      runtime: form.runtime.trim() || null,
      synopsis: form.synopsis.trim() || null,
      poster_url: form.poster_url.trim() || null,
      video_url: form.video_url.trim() || null,
      featured: !!form.featured,
      is_published: derivedPublished,
      sort_order: Number.isNaN(sortOrderNum as number) ? null : sortOrderNum,
    };

    payload = {
      ...payload,
      ...toDbPatch({
        thumbnail_url: form.thumbnail_url.trim() || null,
        preview_video_url: form.preview_video_url.trim() || null,
        is_hero: !!form.is_hero,
        is_trending: !!form.is_trending,
        pin_to_top_row: !!form.pin_to_top_row,
        status,
        release_at: releaseAtIso,
        content_access_rule: sanitizedMonetization.contentAccessRule,
        ads_enabled: sanitizedMonetization.adsEnabled,
        sponsor_placement: sanitizedMonetization.sponsorPlacement,
        sponsor_label: sanitizedMonetization.sponsorLabel,
      }),
    };

    try {
      setSaving(true);

      if (editorMode === "create") {
        const { data, error } = await supabase.from("titles").insert(payload).select("id").single();
        if (error) throw error;

        if (capabilities.heroCol && form.is_hero && data?.id != null) {
          const clearOthers = await supabase
            .from("titles")
            .update({ [capabilities.heroCol]: false })
            .neq("id", data.id);
          if (clearOthers.error) throw clearOthers.error;
          const setCurrent = await supabase
            .from("titles")
            .update({ [capabilities.heroCol]: true })
            .eq("id", data.id);
          if (setCurrent.error) throw setCurrent.error;
        }

        setNotice({ type: "success", text: "Title created." });
      } else {
        if (!form.id) throw new Error("Missing title id.");

        if (capabilities.heroCol && form.is_hero) {
          const clearOthers = await supabase
            .from("titles")
            .update({ [capabilities.heroCol]: false })
            .neq("id", form.id);
          if (clearOthers.error) throw clearOthers.error;
        }

        const { error } = await supabase.from("titles").update(payload).eq("id", form.id);
        if (error) throw error;
        setNotice({ type: "success", text: "Title updated." });
      }

      setEditorVisible(false);
      await loadTitles();
    } catch (err: any) {
      setNotice({ type: "error", text: err?.message ?? "Save failed." });
    } finally {
      setSaving(false);
    }
  }, [capabilities.heroCol, editorMode, form, hasReleaseControl, hasStatusControl, loadTitles, toDbPatch]);

  const renderSkeleton = () => (
    <View style={{ gap: 12 }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonCard} />
      ))}
    </View>
  );

  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading operator access"
        body="Checking whether your signed-in account can access studio controls."
        operatorOnly
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to access Chi'llywood studio controls"
        body="The admin studio is limited to signed-in operator accounts."
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

  if (!moderationAccess.canAccessAdmin) {
    return (
      <BetaAccessScreen
        title="This account is not on the operator allowlist"
        body="Admin and release controls stay behind a small runtime-config allowlist."
        operatorOnly
      />
    );
  }

  return (
    <ImageBackground
      source={require("../assets/images/chicago-skyline.jpg")}
      resizeMode="cover"
      style={styles.background}
    >
      <View style={[styles.overlay, { backgroundColor: themePalette.screenOverlay }]} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerBlock}>
          <View>
            <Text style={styles.kicker}>{experienceConfig.branding.appDisplayName.toUpperCase()} • ADMIN</Text>
            <Text style={styles.title}>{experienceConfig.branding.adminTitle}</Text>
            <Text style={styles.subtitle}>{experienceConfig.branding.adminSubtitle}</Text>
          </View>

          <TouchableOpacity style={[styles.newBtn, { backgroundColor: themePalette.accent }]} onPress={openCreate}>
            <Text style={styles.newBtnText}>+ New Title</Text>
          </TouchableOpacity>
        </View>

        {notice && (
          <View style={[styles.notice, notice.type === "error" ? styles.noticeError : styles.noticeSuccess]}>
            <Text style={styles.noticeText}>{notice.text}</Text>
          </View>
        )}

        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>MODERATION</Text>
              <Text style={styles.configTitle}>Safety reports and role-aware review</Text>
              <Text style={styles.configBody}>
                Report flows now preserve route, target, and audit context across title, profile, chat, and room surfaces while review stays behind active platform moderation roles.
              </Text>
            </View>
          </View>

          <View style={styles.badgesRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{`Actor ${formatModerationToken(moderationAccess.actorRole)}`}</Text>
            </View>
            <View style={[styles.badge, styles.badgePublished]}>
              <Text style={styles.badgeText}>Admin Access Enabled</Text>
            </View>
            <View style={[styles.badge, canReviewSafetyReports ? styles.badgeOn : styles.badgeOff]}>
              <Text style={styles.badgeText}>{canReviewSafetyReports ? "Review Queue Enabled" : "Review Queue Locked"}</Text>
            </View>
            {platformRoles.map((membership) => (
              <View key={`${membership.role}-${membership.id}`} style={[styles.badge, styles.badgeScheduled]}>
                <Text style={styles.badgeText}>{formatModerationToken(membership.role)}</Text>
              </View>
            ))}
          </View>

          {platformRolesLoading ? (
            <View style={styles.configLoadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.configLoadingText}>Loading platform moderation roles…</Text>
            </View>
          ) : null}

          {moderationNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{moderationNotice}</Text>
            </View>
          ) : null}

          {!platformRolesLoading && !platformRoles.length ? (
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>No active review role on this account yet</Text>
                <Text style={styles.configListBody}>
                  Content studio access can stay operator-only while safety-report review remains locked until this signed-in identity is granted an active `operator` or `moderator` platform role membership.
                </Text>
              </View>
            </View>
          ) : null}

          {canReviewSafetyReports ? (
            safetyReportsLoading ? (
              <View style={styles.configLoadingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.configLoadingText}>Loading recent safety reports…</Text>
              </View>
            ) : safetyReports.length ? (
              <View style={styles.configList}>
                {safetyReports.map((report) => {
                  const targetLabel = readContextText(report.context.targetLabel, report.targetId);
                  const sourceSurface = readContextText(report.context.sourceSurface, "unknown");
                  const reporterRole = readContextText(report.context.reporterRole, "member");
                  const reviewState = readContextText(report.context.moderationReviewState, "pending_review");
                  const targetAuditOwnerKey = readContextText(report.context.targetAuditOwnerKey);
                  const platformOwnedTarget = report.context.platformOwnedTarget === true;

                  return (
                    <View key={report.id} style={styles.configListRow}>
                      <View style={styles.configListCopy}>
                        <Text style={styles.configListTitle}>{targetLabel}</Text>
                        <Text style={styles.configListBody}>{formatModerationTimestamp(report.createdAt)}</Text>
                        <Text style={styles.configListBody}>
                          {`${formatModerationToken(sourceSurface)} · Reporter ${formatModerationToken(reporterRole)}`}
                        </Text>
                        {targetAuditOwnerKey ? (
                          <Text style={styles.configListBody}>{`Audit owner ${targetAuditOwnerKey}`}</Text>
                        ) : null}
                        {report.note ? (
                          <Text style={styles.configListBody}>{report.note}</Text>
                        ) : null}
                      </View>

                      <View style={styles.badgesRow}>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{formatModerationToken(report.category)}</Text>
                        </View>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{formatModerationToken(report.targetType)}</Text>
                        </View>
                        <View style={[styles.badge, reviewState === "operator_visible" ? styles.badgeScheduled : styles.badgeDraft]}>
                          <Text style={styles.badgeText}>{formatModerationToken(reviewState)}</Text>
                        </View>
                        {platformOwnedTarget ? (
                          <View style={[styles.badge, styles.badgeOn]}>
                            <Text style={styles.badgeText}>Platform Target</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.configListRow}>
                <View style={styles.configListCopy}>
                  <Text style={styles.configListTitle}>No safety reports yet</Text>
                  <Text style={styles.configListBody}>
                    Report review is ready, but the current queue is empty on this build.
                  </Text>
                </View>
              </View>
            )
          ) : null}
        </View>

        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>EXPERIENCE CONFIG</Text>
              <Text style={styles.configTitle}>Global presentation and feature controls</Text>
              <Text style={styles.configBody}>
                Tune homepage, feature visibility, and safe presentation defaults here. Locked product naming stays code-owned, and saving requires an active operator role.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.configSaveBtn,
                { backgroundColor: themePalette.accent },
                (configSaving || configLoading || platformRolesLoading || !canManagePrivilegedAdminWrites) && styles.configSaveBtnDisabled,
              ]}
              onPress={saveExperienceConfigChanges}
              disabled={configSaving || configLoading || platformRolesLoading || !canManagePrivilegedAdminWrites}
            >
              {configSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.configSaveBtnText}>Save Config</Text>}
            </TouchableOpacity>
          </View>

          {configLoading ? (
            <View style={styles.configLoadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.configLoadingText}>Loading current config…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Theme Preset</Text>
              <View style={styles.toggleRowWrap}>
                {(["city_night", "lake_glow", "steel_day"] as const).map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.toggleChip, experienceConfig.theme.preset === preset && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        theme: {
                          ...prev.theme,
                          preset,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.theme.preset === preset && styles.toggleChipTextActive]}>
                      {preset.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Background Mode</Text>
              <View style={styles.toggleRowWrap}>
                {(["hero_art", "skyline"] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.toggleChip, experienceConfig.theme.backgroundMode === mode && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        theme: {
                          ...prev.theme,
                          backgroundMode: mode,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.theme.backgroundMode === mode && styles.toggleChipTextActive]}>
                      {mode.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Hero Strategy</Text>
              <View style={styles.toggleRowWrap}>
                {(["latest", "hero_flag", "manual_title"] as const).map((heroMode) => (
                  <TouchableOpacity
                    key={heroMode}
                    style={[styles.toggleChip, experienceConfig.home.heroMode === heroMode && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        home: {
                          ...prev.home,
                          heroMode,
                          manualHeroTitleId: heroMode === "manual_title" ? prev.home.manualHeroTitleId : null,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.home.heroMode === heroMode && styles.toggleChipTextActive]}>
                      {heroMode.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {experienceConfig.home.heroMode === "manual_title" ? (
                <>
                  <Text style={styles.sectionLabel}>Manual Hero Title</Text>
                  <View style={styles.toggleRowWrap}>
                    {titles.slice(0, 12).map((item) => (
                      <TouchableOpacity
                        key={toIdString(item.id)}
                        style={[
                          styles.toggleChip,
                          String(experienceConfig.home.manualHeroTitleId ?? "") === String(item.id) && styles.toggleChipActive,
                        ]}
                        onPress={() =>
                          updateExperienceConfig((prev) => ({
                            ...prev,
                            home: {
                              ...prev.home,
                              manualHeroTitleId: String(item.id),
                            },
                          }))
                        }
                      >
                        <Text
                          style={[
                            styles.toggleChipText,
                            String(experienceConfig.home.manualHeroTitleId ?? "") === String(item.id) && styles.toggleChipTextActive,
                          ]}
                        >
                          {item.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}

              <Text style={styles.sectionLabel}>Top Picks Source</Text>
              <View style={styles.toggleRowWrap}>
                {(["recent", "top_row", "featured", "trending"] as const).map((source) => (
                  <TouchableOpacity
                    key={source}
                    style={[styles.toggleChip, experienceConfig.home.topPicksSource === source && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        home: {
                          ...prev.home,
                          topPicksSource: source,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.home.topPicksSource === source && styles.toggleChipTextActive]}>
                      {source.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Homepage Rails</Text>
              <View style={styles.configList}>
                {experienceConfig.home.railOrder.map((railKey, index) => (
                  <View key={railKey} style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>{railLabels[railKey]}</Text>
                      <Text style={styles.configListBody}>
                        Position {index + 1} · {experienceConfig.home.enabledRails[railKey] ? "Visible" : "Hidden"}
                      </Text>
                    </View>
                    <View style={styles.configListActions}>
                      <TouchableOpacity
                        style={styles.orderBtn}
                        onPress={() =>
                          updateExperienceConfig((prev) => ({
                            ...prev,
                            home: {
                              ...prev.home,
                              enabledRails: {
                                ...prev.home.enabledRails,
                                [railKey]: !prev.home.enabledRails[railKey],
                              },
                            },
                          }))
                        }
                      >
                        <Text style={styles.orderBtnText}>
                          {experienceConfig.home.enabledRails[railKey] ? "Hide" : "Show"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.orderBtn} onPress={() => moveRail(railKey, -1)} disabled={index === 0}>
                        <Text style={styles.orderBtnText}>Up</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.orderBtn}
                        onPress={() => moveRail(railKey, 1)}
                        disabled={index === experienceConfig.home.railOrder.length - 1}
                      >
                        <Text style={styles.orderBtnText}>Down</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Browse rail label"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.home.browseCategoryLabel}
                  onChangeText={(text) =>
                    updateExperienceConfig((prev) => ({
                      ...prev,
                      home: {
                        ...prev.home,
                        browseCategoryLabel: text,
                      },
                    }))
                  }
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Browse category query"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.home.browseCategoryQuery}
                  onChangeText={(text) =>
                    updateExperienceConfig((prev) => ({
                      ...prev,
                      home: {
                        ...prev.home,
                        browseCategoryQuery: text,
                      },
                    }))
                  }
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="Max items per rail"
                placeholderTextColor="#8d8d8d"
                keyboardType="numeric"
                value={String(experienceConfig.home.maxItemsPerRail)}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    home: {
                      ...prev.home,
                      maxItemsPerRail: Number.parseInt(text || "0", 10) || prev.home.maxItemsPerRail,
                    },
                  }))
                }
              />

              <Text style={styles.sectionLabel}>Feature Toggles</Text>
              <View style={styles.toggleRowWrap}>
                {([
                  ["watchPartyEnabled", "Watch Party"],
                  ["communicationEnabled", "Communication"],
                  ["favoritesEnabled", "Favorites"],
                  ["continueWatchingEnabled", "Continue Watching"],
                  ["creatorSettingsEnabled", "Creator Settings"],
                ] as const).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.toggleChip, experienceConfig.features[key] && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        features: {
                          ...prev.features,
                          [key]: !prev.features[key],
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.features[key] && styles.toggleChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Monetization Runtime</Text>
              <View style={styles.toggleRowWrap}>
                {([
                  ["premiumEnabled", "Premium"],
                  ["partyPassEnabled", "Party Pass"],
                  ["sponsorPlacementsEnabled", "Sponsor Placements"],
                  ["playerBannerEnabled", "Player Banner"],
                  ["playerMidRollEnabled", "Player Mid-Roll"],
                ] as const).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.toggleChip, experienceConfig.monetization[key] && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        monetization: {
                          ...prev.monetization,
                          [key]: !prev.monetization[key],
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.monetization[key] && styles.toggleChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Default sponsor label"
                placeholderTextColor="#8d8d8d"
                value={experienceConfig.monetization.defaultSponsorLabel}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    monetization: {
                      ...prev.monetization,
                      defaultSponsorLabel: text,
                    },
                  }))
                }
              />
              <TextInput
                style={styles.input}
                placeholder="Premium access title"
                placeholderTextColor="#8d8d8d"
                value={experienceConfig.monetization.premiumUpsellTitle}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    monetization: {
                      ...prev.monetization,
                      premiumUpsellTitle: text,
                    },
                  }))
                }
              />
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Premium access body"
                placeholderTextColor="#8d8d8d"
                multiline
                value={experienceConfig.monetization.premiumUpsellBody}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    monetization: {
                      ...prev.monetization,
                      premiumUpsellBody: text,
                    },
                  }))
                }
              />

              <Text style={styles.sectionLabel}>Branding</Text>
              <Text style={styles.configHint}>
                Core product naming is locked by doctrine. Only safe presentation copy like the hero kicker and admin labels persists here.
              </Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                placeholder="App display name"
                placeholderTextColor="#8d8d8d"
                value={experienceConfig.branding.appDisplayName}
                editable={false}
                selectTextOnFocus={false}
              />
              <TextInput
                style={styles.input}
                placeholder="Home hero kicker"
                placeholderTextColor="#8d8d8d"
                value={experienceConfig.branding.homeHeroKicker}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    branding: {
                      ...prev.branding,
                      homeHeroKicker: text,
                    },
                  }))
                }
              />
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Watch Party label"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.watchPartyLabel}
                  editable={false}
                  selectTextOnFocus={false}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Admin title"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.adminTitle}
                  onChangeText={(text) =>
                    updateExperienceConfig((prev) => ({
                      ...prev,
                      branding: {
                        ...prev.branding,
                        adminTitle: text,
                      },
                    }))
                  }
                />
              </View>
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Live waiting room title"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.liveWaitingRoomTitle}
                  editable={false}
                  selectTextOnFocus={false}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Party waiting room title"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.partyWaitingRoomTitle}
                  editable={false}
                  selectTextOnFocus={false}
                />
              </View>
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Live room title"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.liveRoomTitle}
                  editable={false}
                  selectTextOnFocus={false}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Party room title"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.partyRoomTitle}
                  editable={false}
                  selectTextOnFocus={false}
                />
              </View>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Admin subtitle"
                placeholderTextColor="#8d8d8d"
                multiline
                value={experienceConfig.branding.adminSubtitle}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    branding: {
                      ...prev.branding,
                      adminSubtitle: text,
                    },
                  }))
                }
              />

              <Text style={styles.sectionLabel}>New Watch Party Defaults</Text>
              <View style={styles.toggleRowWrap}>
                {(["open", "locked"] as const).map((value) => (
                  <TouchableOpacity
                    key={`watch-join-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.watchParty.joinPolicy === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          watchParty: {
                            ...prev.roomDefaults.watchParty,
                            joinPolicy: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.watchParty.joinPolicy === value && styles.toggleChipTextActive]}>
                      JOIN {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
                {(["enabled", "muted"] as const).map((value) => (
                  <TouchableOpacity
                    key={`watch-reactions-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.watchParty.reactionsPolicy === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          watchParty: {
                            ...prev.roomDefaults.watchParty,
                            reactionsPolicy: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.watchParty.reactionsPolicy === value && styles.toggleChipTextActive]}>
                      REACTIONS {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.toggleRowWrap}>
                {(["open", "party_pass", "premium"] as const).map((value) => (
                  <TouchableOpacity
                    key={`watch-access-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.watchParty.contentAccessRule === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          watchParty: {
                            ...prev.roomDefaults.watchParty,
                            contentAccessRule: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.watchParty.contentAccessRule === value && styles.toggleChipTextActive]}>
                      {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
                {(["best_effort", "host_managed"] as const).map((value) => (
                  <TouchableOpacity
                    key={`watch-capture-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.watchParty.capturePolicy === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          watchParty: {
                            ...prev.roomDefaults.watchParty,
                            capturePolicy: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.watchParty.capturePolicy === value && styles.toggleChipTextActive]}>
                      {value.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>New Communication Defaults</Text>
              <View style={styles.toggleRowWrap}>
                {(["open", "party_pass", "premium"] as const).map((value) => (
                  <TouchableOpacity
                    key={`comm-access-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.communication.contentAccessRule === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          communication: {
                            ...prev.roomDefaults.communication,
                            contentAccessRule: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.communication.contentAccessRule === value && styles.toggleChipTextActive]}>
                      {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
                {(["best_effort", "host_managed"] as const).map((value) => (
                  <TouchableOpacity
                    key={`comm-capture-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.communication.capturePolicy === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          communication: {
                            ...prev.roomDefaults.communication,
                            capturePolicy: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.communication.capturePolicy === value && styles.toggleChipTextActive]}>
                      {value.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>CREATOR GRANTS</Text>
              <Text style={styles.configTitle}>Backend creator monetization permissions</Text>
              <Text style={styles.configBody}>
                Load a creator user id, then decide whether that creator can use premium rooms, Party Pass rooms, premium titles, and sponsor/ad hooks. Active operator role required.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.configSaveBtn,
                { backgroundColor: themePalette.accent },
                (creatorGrantSaving || platformRolesLoading || !canManagePrivilegedAdminWrites) && styles.configSaveBtnDisabled,
              ]}
              onPress={saveCreatorGrantTarget}
              disabled={creatorGrantSaving || platformRolesLoading || !canManagePrivilegedAdminWrites}
            >
              {creatorGrantSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.configSaveBtnText}>Save Grants</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.inlineInputs}>
            <TextInput
              style={[styles.input, styles.inputHalf]}
              placeholder="Creator user id"
              placeholderTextColor="#8d8d8d"
              value={creatorGrantUserId}
              onChangeText={setCreatorGrantUserId}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[
                styles.orderBtn,
                (creatorGrantLoading || platformRolesLoading || !canManagePrivilegedAdminWrites) && styles.configSaveBtnDisabled,
              ]}
              onPress={loadCreatorGrantTarget}
              disabled={creatorGrantLoading || platformRolesLoading || !canManagePrivilegedAdminWrites}
            >
              {creatorGrantLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.orderBtnText}>Load</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.toggleRowWrap}>
            {([
              ["canUsePartyPassRooms", "Party Pass Rooms"],
              ["canUsePremiumRooms", "Premium Rooms"],
              ["canPublishPremiumTitles", "Premium Titles"],
              ["canUseSponsorPlacements", "Sponsor Placements"],
              ["canUsePlayerAds", "Player Ads"],
            ] as const).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.toggleChip,
                  creatorGrantForm[key] && styles.toggleChipActive,
                  !canManagePrivilegedAdminWrites && styles.toggleChipDisabled,
                ]}
                onPress={() => {
                  if (!canManagePrivilegedAdminWrites) return;
                  setCreatorGrantForm((prev) => ({ ...prev, [key]: !prev[key] }));
                }}
                disabled={!canManagePrivilegedAdminWrites}
              >
                <Text style={[styles.toggleChipText, creatorGrantForm[key] && styles.toggleChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total Titles</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.published}</Text>
            <Text style={styles.statLabel}>Published</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.scheduled}</Text>
            <Text style={styles.statLabel}>Scheduled</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.draft}</Text>
            <Text style={styles.statLabel}>Draft</Text>
          </View>
          <View style={styles.statCardWide}>
            <Text style={styles.statNumber}>{stats.hero}</Text>
            <Text style={styles.statLabel}>Hero Picks (target: 1)</Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by title, category, or status"
            placeholderTextColor="#9b9b9b"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filterRow}>
            {([
            { key: "all", label: "All" },
            { key: "published", label: "Published" },
            { key: "scheduled", label: "Scheduled" },
            { key: "draft", label: "Draft" },
            { key: "archived", label: "Archived" },
            { key: "featured", label: "Featured" },
            ...(hasHeroControl ? [{ key: "hero", label: "Hero" } as const] : []),
            ...(hasTrendingControl ? [{ key: "trending", label: "Trending" } as const] : []),
            ...(hasTopRowControl ? [{ key: "top-row", label: "Top Row" } as const] : []),
          ] as const).map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setFilter(chip.key)}
              style={[styles.filterChip, filter === chip.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, filter === chip.key && styles.filterChipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          renderSkeleton()
        ) : filteredTitles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No titles match this view</Text>
            <Text style={styles.emptyText}>Adjust filters, or create a new title to populate this section.</Text>
          </View>
        ) : (
          <View style={styles.cardsList}>
            {filteredTitles.map((item) => {
              const status = normalizeStatus(item.status, item.is_published);

              return (
                <View key={toIdString(item.id)} style={styles.card}>
                  <View style={styles.thumbWrap}>
                    <ImageBackground source={getCompactArtSource(item)} style={styles.thumb} resizeMode="cover" />
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {item.title || "Untitled"}
                        </Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {(item.category ?? "Uncategorized").toString()} • {item.year ?? "—"} • {item.runtime ?? "—"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.previewBtn}
                        onPress={() => router.push({ pathname: "/player/[id]", params: { id: String(toIdString(item.id)) } })}
                      >
                        <Text style={styles.previewBtnText}>Preview</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.badgesRow}>
                      <View style={[styles.badge, getStatusTone(status)]}>
                        <Text style={styles.badgeText}>{status.toUpperCase()}</Text>
                      </View>
                      <View style={[styles.badge, item.featured ? styles.badgeOn : styles.badgeOff]}>
                        <Text style={styles.badgeText}>{item.featured ? "FEATURED" : "STANDARD"}</Text>
                      </View>
                      {hasHeroControl ? (
                        <View style={[styles.badge, item.is_hero ? styles.badgeOn : styles.badgeOff]}>
                          <Text style={styles.badgeText}>{item.is_hero ? "HERO" : "NOT HERO"}</Text>
                        </View>
                      ) : null}
                      {hasTrendingControl ? (
                        <View style={[styles.badge, item.is_trending ? styles.badgeOn : styles.badgeOff]}>
                          <Text style={styles.badgeText}>{item.is_trending ? "TRENDING" : "NORMAL"}</Text>
                        </View>
                      ) : null}
                      {hasTopRowControl ? (
                        <View style={[styles.badge, item.pin_to_top_row ? styles.badgeOn : styles.badgeOff]}>
                          <Text style={styles.badgeText}>{item.pin_to_top_row ? "TOP ROW" : "UNPINNED"}</Text>
                        </View>
                      ) : null}
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>SORT {item.sort_order ?? "—"}</Text>
                      </View>
                      {hasReleaseControl ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>Release {formatRelease(item.release_at)}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => patchTitle(item.id, { featured: !(item.featured === true) }, "Featured updated.")}
                      >
                        <Text style={styles.actionText}>{item.featured ? "Unfeature" : "Feature"}</Text>
                      </TouchableOpacity>

                      {hasTopRowControl ? (
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() =>
                            patchTitle(
                              item.id,
                              { pin_to_top_row: !(item.pin_to_top_row === true) },
                              "Top row updated.",
                            )
                          }
                        >
                          <Text style={styles.actionText}>{item.pin_to_top_row ? "Unpin" : "Pin Top Row"}</Text>
                        </TouchableOpacity>
                      ) : null}

                      {hasTrendingControl ? (
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() =>
                            patchTitle(item.id, { is_trending: !(item.is_trending === true) }, "Trending updated.")
                          }
                        >
                          <Text style={styles.actionText}>{item.is_trending ? "Untrend" : "Trend"}</Text>
                        </TouchableOpacity>
                      ) : null}

                      {hasHeroControl ? (
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setHeroExclusive(item)}>
                          <Text style={styles.actionText}>Set as Hero</Text>
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() =>
                          patchTitle(
                            item.id,
                            { sort_order: Math.max(0, (item.sort_order ?? 0) - 1) },
                            "Sort order updated.",
                          )
                        }
                      >
                        <Text style={styles.actionText}>Sort -</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() =>
                          patchTitle(item.id, { sort_order: (item.sort_order ?? 0) + 1 }, "Sort order updated.")
                        }
                      >
                        <Text style={styles.actionText}>Sort +</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() =>
                          openEdit({
                            ...item,
                            status,
                          })
                        }
                      >
                        <Text style={styles.actionText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtnPrimary}
                        onPress={() =>
                          patchTitle(
                            item.id,
                            {
                              status: item.is_published ? "draft" : "published",
                              is_published: !item.is_published,
                            },
                            "Publication state updated.",
                          )
                        }
                      >
                        <Text style={styles.actionTextPrimary}>
                          {item.is_published ? "Unpublish" : "Publish"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={editorVisible} animationType="slide" transparent onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{editorMode === "create" ? "Create Title" : "Edit Title"}</Text>
              <TouchableOpacity onPress={() => setEditorVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 26 }}>
              <TextInput
                style={styles.input}
                placeholder="Title"
                placeholderTextColor="#8d8d8d"
                value={form.title}
                onChangeText={(text) => setForm((prev) => ({ ...prev, title: text }))}
              />

              <TextInput
                style={styles.input}
                placeholder="Category (type any custom category)"
                placeholderTextColor="#8d8d8d"
                value={form.category}
                onChangeText={(text) => setForm((prev) => ({ ...prev, category: text }))}
              />

              {categoryOptions.length > 0 ? (
                <View style={styles.suggestedCategories}>
                  {categoryOptions.slice(0, 8).map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={styles.categoryChip}
                      onPress={() => setForm((prev) => ({ ...prev, category }))}
                    >
                      <Text style={styles.categoryChipText}>{category}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Year"
                  placeholderTextColor="#8d8d8d"
                  keyboardType="numeric"
                  value={form.year}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, year: text }))}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Runtime"
                  placeholderTextColor="#8d8d8d"
                  value={form.runtime}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, runtime: text }))}
                />
              </View>

              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Synopsis"
                placeholderTextColor="#8d8d8d"
                multiline
                value={form.synopsis}
                onChangeText={(text) => setForm((prev) => ({ ...prev, synopsis: text }))}
              />

              <TextInput
                style={styles.input}
                placeholder="Poster URL"
                placeholderTextColor="#8d8d8d"
                value={form.poster_url}
                onChangeText={(text) => setForm((prev) => ({ ...prev, poster_url: text }))}
              />

              {capabilities.thumbnailCol ? (
                <TextInput
                  style={styles.input}
                  placeholder="Thumbnail URL (compact cards)"
                  placeholderTextColor="#8d8d8d"
                  value={form.thumbnail_url}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, thumbnail_url: text }))}
                />
              ) : null}

              <TextInput
                style={styles.input}
                placeholder="Video URL"
                placeholderTextColor="#8d8d8d"
                value={form.video_url}
                onChangeText={(text) => setForm((prev) => ({ ...prev, video_url: text }))}
              />

              {capabilities.previewCol ? (
                <TextInput
                  style={styles.input}
                  placeholder="Preview Video URL"
                  placeholderTextColor="#8d8d8d"
                  value={form.preview_video_url}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, preview_video_url: text }))}
                />
              ) : null}

              {hasReleaseControl ? (
                <TextInput
                  style={styles.input}
                  placeholder="Release At (YYYY-MM-DDTHH:mm)"
                  placeholderTextColor="#8d8d8d"
                  value={form.release_at}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, release_at: text }))}
                />
              ) : null}

              <TextInput
                style={styles.input}
                placeholder="Sort Order"
                placeholderTextColor="#8d8d8d"
                keyboardType="numeric"
                value={form.sort_order}
                onChangeText={(text) => setForm((prev) => ({ ...prev, sort_order: text }))}
              />

              <Text style={styles.sectionLabel}>Status</Text>
              <View style={styles.toggleRowWrap}>
                {(hasStatusControl ? statusOptions : (["draft", "published"] as StatusType[])).map((itemStatus) => (
                  <TouchableOpacity
                    key={itemStatus}
                    style={[styles.toggleChip, form.status === itemStatus && styles.toggleChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, status: itemStatus }))}
                  >
                    <Text style={[styles.toggleChipText, form.status === itemStatus && styles.toggleChipTextActive]}>
                      {itemStatus.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {hasTitleMonetizationControls ? (
                <>
                  <Text style={styles.sectionLabel}>Monetization</Text>
                  <View style={styles.toggleRowWrap}>
                    {(["open", "premium"] as const).map((value) => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.toggleChip, form.content_access_rule === value && styles.toggleChipActive]}
                        onPress={() => setForm((prev) => ({ ...prev, content_access_rule: value }))}
                      >
                        <Text style={[styles.toggleChipText, form.content_access_rule === value && styles.toggleChipTextActive]}>
                          {value.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.toggleChip, form.ads_enabled && styles.toggleChipActive]}
                      onPress={() => setForm((prev) => ({ ...prev, ads_enabled: !prev.ads_enabled }))}
                    >
                      <Text style={[styles.toggleChipText, form.ads_enabled && styles.toggleChipTextActive]}>
                        {form.ads_enabled ? "Ads Enabled" : "Ads Off"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.toggleRowWrap}>
                    {(["none", "detail_banner", "player_banner"] as SponsorPlacement[]).map((placement) => (
                      <TouchableOpacity
                        key={placement}
                        style={[styles.toggleChip, form.sponsor_placement === placement && styles.toggleChipActive]}
                        onPress={() => setForm((prev) => ({ ...prev, sponsor_placement: placement }))}
                      >
                        <Text style={[styles.toggleChipText, form.sponsor_placement === placement && styles.toggleChipTextActive]}>
                          {placement.replace("_", " ").toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Sponsor label"
                    placeholderTextColor="#8d8d8d"
                    value={form.sponsor_label}
                    onChangeText={(text) => setForm((prev) => ({ ...prev, sponsor_label: text }))}
                  />
                  <Text style={styles.configLoadingText}>
                    Unsupported premium or sponsor settings are normalized to open/off if the current creator grants do not allow them.
                  </Text>
                </>
              ) : null}

              <Text style={styles.sectionLabel}>Flags</Text>
              <View style={styles.toggleRowWrap}>
                <TouchableOpacity
                  style={[styles.toggleChip, form.featured && styles.toggleChipActive]}
                  onPress={() => setForm((prev) => ({ ...prev, featured: !prev.featured }))}
                >
                  <Text style={[styles.toggleChipText, form.featured && styles.toggleChipTextActive]}>
                    {form.featured ? "Featured" : "Standard"}
                  </Text>
                </TouchableOpacity>

                {hasHeroControl ? (
                  <TouchableOpacity
                    style={[styles.toggleChip, form.is_hero && styles.toggleChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, is_hero: !prev.is_hero }))}
                  >
                    <Text style={[styles.toggleChipText, form.is_hero && styles.toggleChipTextActive]}>
                      {form.is_hero ? "Hero" : "Not Hero"}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {hasTrendingControl ? (
                  <TouchableOpacity
                    style={[styles.toggleChip, form.is_trending && styles.toggleChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, is_trending: !prev.is_trending }))}
                  >
                    <Text style={[styles.toggleChipText, form.is_trending && styles.toggleChipTextActive]}>
                      {form.is_trending ? "Trending" : "Normal"}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {hasTopRowControl ? (
                  <TouchableOpacity
                    style={[styles.toggleChip, form.pin_to_top_row && styles.toggleChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, pin_to_top_row: !prev.pin_to_top_row }))}
                  >
                    <Text style={[styles.toggleChipText, form.pin_to_top_row && styles.toggleChipTextActive]}>
                      {form.pin_to_top_row ? "Top Row" : "Unpinned"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditorVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEditor} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Title</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  content: {
    paddingTop: 54,
    paddingBottom: 40,
    paddingHorizontal: 16,
    gap: 14,
  },
  headerBlock: {
    gap: 12,
  },
  kicker: {
    color: "#9a9a9a",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.25,
    marginBottom: 5,
  },
  title: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0.35,
  },
  subtitle: {
    color: "#b7b7b7",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 4,
    maxWidth: "95%",
  },
  newBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#DC143C",
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  newBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.25,
  },
  notice: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeSuccess: {
    backgroundColor: "rgba(45,153,92,0.2)",
    borderColor: "rgba(45,153,92,0.45)",
  },
  noticeError: {
    backgroundColor: "rgba(209,64,64,0.2)",
    borderColor: "rgba(209,64,64,0.45)",
  },
  noticeWarn: {
    backgroundColor: "rgba(220,170,20,0.16)",
    borderColor: "rgba(220,170,20,0.4)",
  },
  noticeText: {
    color: "#f0f0f0",
    fontWeight: "700",
    fontSize: 12,
  },
  configCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,12,18,0.94)",
    padding: 14,
    gap: 10,
  },
  configHeaderRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  configKicker: {
    color: "#9AA4B9",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  configTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 4,
  },
  configBody: {
    color: "#BAC3D5",
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: "92%",
  },
  configHint: {
    color: "#9AA4B9",
    fontSize: 11.5,
    lineHeight: 17,
    marginBottom: 10,
    marginTop: -2,
  },
  configSaveBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 108,
  },
  configSaveBtnDisabled: {
    opacity: 0.6,
  },
  configSaveBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  configLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  configLoadingText: {
    color: "#D6DCE8",
    fontSize: 12.5,
    fontWeight: "700",
  },
  configList: {
    gap: 8,
    marginBottom: 10,
  },
  configListRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
    gap: 10,
  },
  configListCopy: {
    gap: 2,
  },
  configListTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  configListBody: {
    color: "#B3BDD0",
    fontSize: 11.5,
    fontWeight: "600",
  },
  configListActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  orderBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  orderBtnText: {
    color: "#ECECEC",
    fontSize: 11,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "48%",
    backgroundColor: "rgba(14,14,14,0.95)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statCardWide: {
    width: "100%",
    backgroundColor: "rgba(14,14,14,0.95)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statNumber: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 3,
  },
  statLabel: {
    color: "#b7b7b7",
    fontSize: 12,
    fontWeight: "700",
  },
  searchWrap: {
    marginTop: 2,
  },
  searchInput: {
    backgroundColor: "rgba(17,17,17,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    backgroundColor: "rgba(20,20,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: "#DC143C",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  filterChipText: {
    color: "#dadada",
    fontSize: 12,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  cardsList: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "rgba(12,12,12,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    overflow: "hidden",
  },
  thumbWrap: {
    width: 98,
    height: 146,
    backgroundColor: "#121212",
  },
  thumb: {
    flex: 1,
  },
  cardBody: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
  cardMeta: {
    color: "#bfbfbf",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  previewBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeOn: {
    backgroundColor: "rgba(220,20,60,0.2)",
    borderColor: "rgba(220,20,60,0.45)",
  },
  badgeOff: {
    backgroundColor: "rgba(120,120,120,0.16)",
    borderColor: "rgba(160,160,160,0.36)",
  },
  badgePublished: {
    backgroundColor: "rgba(45,153,92,0.24)",
    borderColor: "rgba(45,153,92,0.48)",
  },
  badgeScheduled: {
    backgroundColor: "rgba(87,124,255,0.24)",
    borderColor: "rgba(87,124,255,0.48)",
  },
  badgeDraft: {
    backgroundColor: "rgba(220,170,20,0.2)",
    borderColor: "rgba(220,170,20,0.42)",
  },
  badgeArchived: {
    backgroundColor: "rgba(120,120,120,0.22)",
    borderColor: "rgba(160,160,160,0.4)",
  },
  badgeText: {
    color: "#f1f1f1",
    fontSize: 10,
    fontWeight: "800",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  actionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  actionText: {
    color: "#efefef",
    fontSize: 11,
    fontWeight: "700",
  },
  actionBtnPrimary: {
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionTextPrimary: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  skeletonCard: {
    height: 146,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  emptyState: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "rgba(15,15,15,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  emptyText: {
    color: "#c2c2c2",
    fontSize: 13,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalSheet: {
    maxHeight: "90%",
    backgroundColor: "#0E0E0E",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  closeText: {
    color: "#ddd",
    fontSize: 11,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "600",
  },
  inputDisabled: {
    opacity: 0.55,
  },
  inlineInputs: {
    flexDirection: "row",
    gap: 10,
  },
  inputHalf: {
    flex: 1,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  sectionLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 2,
  },
  toggleRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  toggleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 8,
    paddingHorizontal: 11,
    alignItems: "center",
  },
  toggleChipActive: {
    borderColor: "#DC143C",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  toggleChipText: {
    color: "#dcdcdc",
    fontWeight: "700",
    fontSize: 11,
  },
  toggleChipTextActive: {
    color: "#fff",
  },
  toggleChipDisabled: {
    opacity: 0.55,
  },
  suggestedCategories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 10,
    marginTop: -2,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  categoryChipText: {
    color: "#e5e5e5",
    fontSize: 11,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelText: {
    color: "#ececec",
    fontWeight: "700",
  },
  saveBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  saveText: {
    color: "#fff",
    fontWeight: "800",
  },
});
