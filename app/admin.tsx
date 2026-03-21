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
import { reportDebugError, reportDebugQuery } from "../_lib/devDebug";
import { supabase } from "../_lib/supabase";

type TitleId = string | number;

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
};

const statusOptions: StatusType[] = ["draft", "published", "scheduled", "archived"];

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
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [saving, setSaving] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [capabilities, setCapabilities] = useState<AdminCapabilities>(defaultCapabilities);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
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
  });

  useEffect(() => {
    loadTitles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (loading) {
      reportDebugQuery({ name: "admin.titles", status: "loading", error: null });
      return;
    }
    if (notice?.type === "error") {
      reportDebugQuery({ name: "admin.titles", status: "error", error: notice.text });
      return;
    }
    reportDebugQuery({ name: "admin.titles", status: "success", error: null });
  }, [loading, notice]);

  useEffect(() => {
    reportDebugError(notice?.type === "error" ? notice.text : null);
  }, [notice]);

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
    ]);

    return {
      heroCol: hasIsHero ? "is_hero" : hasHero ? "hero" : null,
      trendingCol: hasIsTrending ? "is_trending" : hasTrending ? "trending" : null,
      topRowCol: hasPinTop ? "pin_to_top_row" : hasTopRow ? "top_row" : null,
      releaseCol: hasReleaseAt ? "release_at" : hasReleaseDate ? "release_date" : null,
      statusCol: hasStatus ? "status" : null,
      thumbnailCol: hasThumb ? "thumbnail_url" : null,
      previewCol: hasPreview ? "preview_video_url" : null,
    };
  }, [probeColumn]);

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

  return (
    <ImageBackground
      source={require("../assets/images/chicago-skyline.jpg")}
      resizeMode="cover"
      style={styles.background}
    >
      <View style={styles.overlay} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerBlock}>
          <View>
            <Text style={styles.kicker}>CHILLYWOOD • ADMIN</Text>
            <Text style={styles.title}>Content Studio</Text>
            <Text style={styles.subtitle}>Control hero, release windows, rows, and metadata from one premium panel.</Text>
          </View>

          <TouchableOpacity style={styles.newBtn} onPress={openCreate}>
            <Text style={styles.newBtnText}>+ New Title</Text>
          </TouchableOpacity>
        </View>

        {notice && (
          <View style={[styles.notice, notice.type === "error" ? styles.noticeError : styles.noticeSuccess]}>
            <Text style={styles.noticeText}>{notice.text}</Text>
          </View>
        )}

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
