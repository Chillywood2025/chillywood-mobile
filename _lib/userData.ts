import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

export const WATCH_PROGRESS_KEY = "@chillywood/watch-progress";
export const MY_LIST_KEY = "@chillywood/my-list";
export const USER_PROFILE_KEY = "@chillywood/user-profile";
export const LAST_PARTY_KEY = "@chillywood/last-party";
export const USER_WATCH_TABLE = "watch_history";
export const USER_MY_LIST_TABLE = "user_list";
export const USER_WATCH_HISTORY_TABLE = "watch_history";

export type WatchProgressEntry = {
  positionMillis: number;
  updatedAt: number;
  durationMillis?: number;
};

export type WatchProgressMap = Record<string, WatchProgressEntry>;

export type UserProfile = {
  username: string;
  avatarIndex: number; // 0-9 for different avatar colors/emojis
  displayName?: string;
  avatarUrl?: string;
  tagline?: string;
  channelRole?: "viewer" | "host" | "creator";
};

export type LastPartySession = {
  partyId: string;
  titleId: string;
  joinedAt: number;
};

export type MyListEntry = {
  id: string;
  title?: string;
  posterUrl?: string;
  thumbnailUrl?: string;
  savedAt: number;
};

export type UserChannelRole = "viewer" | "host" | "creator";

export type UserChannelProfile = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  tagline?: string;
  role: UserChannelRole;
  isLive: boolean;
};

type WatchHistoryRow = {
  title_id?: string | number | null;
  last_position_millis?: number | null;
  duration_millis?: number | null;
  last_watched_at?: string | null;
  updated_at?: string | null;
  completed?: boolean | null;
  play_count?: number | null;
};

const toIdString = (value: string | number | null | undefined) => String(value ?? "").trim();

const dedupeIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

const TECHNICAL_PROFILE_NAME_PATTERN = /^(user[·\-\s]|viewer[·\-\s]|anon[\-\s])/i;
const UUID_LIKE_PROFILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeTextValue = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

const resolveProfileDisplayName = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value) continue;
    if (UUID_LIKE_PROFILE_PATTERN.test(value)) continue;
    if (TECHNICAL_PROFILE_NAME_PATTERN.test(value)) continue;
    return value;
  }
  return "User";
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const toEpoch = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const sortMyListEntries = (entries: MyListEntry[]) => {
  return [...entries].sort((a, b) => b.savedAt - a.savedAt);
};

const toMyListEntryMap = (entries: MyListEntry[]) => {
  const next: Record<string, MyListEntry> = {};
  for (const entry of entries) {
    const id = toIdString(entry.id);
    if (!id) continue;
    next[id] = {
      id,
      title: entry.title,
      posterUrl: entry.posterUrl,
      thumbnailUrl: entry.thumbnailUrl,
      savedAt: toEpoch(entry.savedAt, Date.now()),
    };
  }
  return next;
};

const toIsoString = (value?: number) => new Date(value ?? Date.now()).toISOString();

const normalizeChannelRole = (value: unknown): UserChannelRole => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "host" || normalized === "creator") {
    return normalized;
  }
  return "viewer";
};

export const buildUserChannelProfile = (options: {
  id?: unknown;
  profile?: UserProfile | null;
  displayName?: unknown;
  username?: unknown;
  avatarUrl?: unknown;
  tagline?: unknown;
  bio?: unknown;
  role?: unknown;
  isLive?: unknown;
  fallbackDisplayName?: unknown;
}): UserChannelProfile => {
  const id = toIdString(options.id as string | number | null | undefined);
  const profile = options.profile;
  const fallbackDisplayName = normalizeTextValue(options.fallbackDisplayName) ?? "User";
  const resolvedDisplayName = resolveProfileDisplayName(
    options.displayName,
    options.username,
    profile?.displayName,
    profile?.username,
  );

  return {
    id,
    displayName: resolvedDisplayName !== "User" ? resolvedDisplayName : fallbackDisplayName,
    avatarUrl: normalizeTextValue(options.avatarUrl) ?? normalizeTextValue(profile?.avatarUrl),
    tagline: normalizeTextValue(options.tagline) ?? normalizeTextValue(options.bio) ?? normalizeTextValue(profile?.tagline),
    role: normalizeChannelRole(options.role ?? profile?.channelRole),
    isLive: !!options.isLive,
  };
};

async function getSignedInUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function readJsonValue<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonValue(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export async function readLocalMyListIds(): Promise<string[]> {
  const entries = await readLocalMyListEntries();
  return entries.map((entry) => entry.id);
}

export async function saveLocalMyListIds(ids: string[]) {
  const now = Date.now();
  const normalized = dedupeIds(ids).map((id, index) => ({
    id,
    savedAt: now - index,
  }));
  await writeJsonValue(MY_LIST_KEY, toMyListEntryMap(normalized));
}

export async function readLocalMyListEntries(): Promise<MyListEntry[]> {
  const parsed = await readJsonValue<unknown>(MY_LIST_KEY, []);

  if (Array.isArray(parsed)) {
    const now = Date.now();
    return dedupeIds(parsed.map((item) => String(item))).map((id, index) => ({
      id,
      savedAt: now - index,
    }));
  }

  if (isPlainObject(parsed)) {
    const entries: MyListEntry[] = [];
    for (const [rawId, rawValue] of Object.entries(parsed)) {
      const id = toIdString(rawId);
      if (!id) continue;

      if (rawValue === true) {
        entries.push({ id, savedAt: 0 });
        continue;
      }

      if (isPlainObject(rawValue)) {
        entries.push({
          id,
          title: typeof rawValue.title === "string" ? rawValue.title : undefined,
          posterUrl: typeof rawValue.posterUrl === "string" ? rawValue.posterUrl : undefined,
          thumbnailUrl: typeof rawValue.thumbnailUrl === "string" ? rawValue.thumbnailUrl : undefined,
          savedAt: toEpoch(rawValue.savedAt),
        });
      }
    }

    return sortMyListEntries(entries);
  }

  return [];
}

export async function readMyListIds(): Promise<string[]> {
  const localEntries = await readLocalMyListEntries();
  const localIds = localEntries.map((entry) => entry.id);
  const userId = await getSignedInUserId();
  if (!userId) return localIds;

  try {
    const { data, error } = await supabase
      .from(USER_MY_LIST_TABLE)
      .select("title_id,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error || !data) return localIds;

    const remoteEntries = (data as Record<string, unknown>[])
      .map((row) => {
        const id = toIdString(row.title_id as string | number | null | undefined);
        if (!id) return null;
        const updatedAtRaw = typeof row.updated_at === "string" ? Date.parse(row.updated_at) : 0;
        return {
          id,
          savedAt: Number.isFinite(updatedAtRaw) ? updatedAtRaw : 0,
        };
      })
      .filter((entry): entry is { id: string; savedAt: number } => !!entry);

    const remoteIds = dedupeIds(remoteEntries.map((entry) => entry.id));

    const mergedEntriesMap = toMyListEntryMap(localEntries);
    for (const remoteEntry of remoteEntries) {
      const existing = mergedEntriesMap[remoteEntry.id];
      const existingSavedAt = existing?.savedAt ?? 0;
      if (!existing || remoteEntry.savedAt >= existingSavedAt) {
        mergedEntriesMap[remoteEntry.id] = {
          id: remoteEntry.id,
          title: existing?.title,
          posterUrl: existing?.posterUrl,
          thumbnailUrl: existing?.thumbnailUrl,
          savedAt: remoteEntry.savedAt,
        };
      }
    }

    const mergedIds = sortMyListEntries(Object.values(mergedEntriesMap)).map((entry) => entry.id);
    const missingRemoteIds = mergedIds.filter((id) => !remoteIds.includes(id));

    if (missingRemoteIds.length > 0) {
      await supabase.from(USER_MY_LIST_TABLE).upsert(
        missingRemoteIds.map((titleId) => ({
          user_id: userId,
          title_id: titleId,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,title_id" },
      );
    }

    await writeJsonValue(MY_LIST_KEY, mergedEntriesMap);
    return mergedIds;
  } catch {
    return localIds;
  }
}

export async function toggleMyListTitle(
  titleId: string | number,
  metadata?: {
    title?: string;
    posterUrl?: string;
    thumbnailUrl?: string;
    savedAt?: number;
  },
): Promise<string[]> {
  const id = toIdString(titleId);
  if (!id) return readLocalMyListIds();

  const currentEntries = await readLocalMyListEntries();
  const currentEntryMap = toMyListEntryMap(currentEntries);
  const exists = !!currentEntryMap[id];

  if (exists) {
    delete currentEntryMap[id];
  } else {
    currentEntryMap[id] = {
      id,
      title: metadata?.title,
      posterUrl: metadata?.posterUrl,
      thumbnailUrl: metadata?.thumbnailUrl,
      savedAt: toEpoch(metadata?.savedAt, Date.now()),
    };
  }

  await writeJsonValue(MY_LIST_KEY, currentEntryMap);
  const nextIds = sortMyListEntries(Object.values(currentEntryMap)).map((entry) => entry.id);

  const userId = await getSignedInUserId();
  if (!userId) return nextIds;

  try {
    if (exists) {
      await supabase.from(USER_MY_LIST_TABLE).delete().eq("user_id", userId).eq("title_id", id);
    } else {
      await supabase.from(USER_MY_LIST_TABLE).upsert(
        {
          user_id: userId,
          title_id: id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,title_id" },
      );
    }
  } catch {
    // keep local source available even if remote write fails
  }

  return nextIds;
}

export async function readLocalWatchProgress(): Promise<WatchProgressMap> {
  const parsed = await readJsonValue<unknown>(WATCH_PROGRESS_KEY, {});
  return parsed && typeof parsed === "object" ? (parsed as WatchProgressMap) : {};
}

export async function saveLocalWatchProgress(progressMap: WatchProgressMap) {
  await writeJsonValue(WATCH_PROGRESS_KEY, progressMap);
}

const toProgressEntry = (row: WatchHistoryRow): WatchProgressEntry | null => {
  const id = toIdString(row.title_id);
  if (!id) return null;
  if (row.completed === true) return null;

  const updatedAtSource = row.updated_at ?? row.last_watched_at ?? null;
  return {
    positionMillis: Math.max(0, Number(row.last_position_millis ?? 0)),
    durationMillis: row.duration_millis != null ? Number(row.duration_millis) : undefined,
    updatedAt: updatedAtSource ? new Date(String(updatedAtSource)).getTime() : 0,
  };
};

async function upsertWatchHistoryProgress(
  userId: string,
  titleId: string,
  entry: WatchProgressEntry,
  options?: { completed?: boolean; playCount?: number },
) {
  const payload: Record<string, unknown> = {
    user_id: userId,
    title_id: titleId,
    last_position_millis: Math.max(0, Math.floor(entry.positionMillis)),
    duration_millis: entry.durationMillis ?? null,
    completed: options?.completed === true,
    last_watched_at: toIsoString(entry.updatedAt),
    updated_at: toIsoString(entry.updatedAt),
  };

  if (typeof options?.playCount === "number" && Number.isFinite(options.playCount)) {
    payload.play_count = Math.max(1, Math.floor(options.playCount));
  }

  await supabase.from(USER_WATCH_HISTORY_TABLE).upsert(payload, { onConflict: "user_id,title_id" });
}

export async function readMergedWatchProgress(): Promise<WatchProgressMap> {
  const local = await readLocalWatchProgress();
  const userId = await getSignedInUserId();
  if (!userId) return local;

  try {
    const { data, error } = await supabase
      .from(USER_WATCH_HISTORY_TABLE)
      .select("title_id,last_position_millis,duration_millis,last_watched_at,updated_at,completed,play_count")
      .eq("user_id", userId);

    if (error || !data) return local;

    const remoteMap: WatchProgressMap = {};
    for (const row of data as WatchHistoryRow[]) {
      const id = toIdString(row.title_id);
      const remoteEntry = toProgressEntry(row);
      if (!id || !remoteEntry) continue;
      remoteMap[id] = remoteEntry;
    }

    const merged: WatchProgressMap = { ...remoteMap };
    for (const [id, localEntry] of Object.entries(local)) {
      const remoteEntry = remoteMap[id];
      if (!remoteEntry || (localEntry.updatedAt ?? 0) > (remoteEntry.updatedAt ?? 0)) {
        merged[id] = localEntry;
      }
    }

    for (const [id, entry] of Object.entries(merged)) {
      const remoteEntry = remoteMap[id];
      if (!remoteEntry || (entry.updatedAt ?? 0) > (remoteEntry.updatedAt ?? 0)) {
        await upsertWatchHistoryProgress(userId, id, entry, { completed: false });
      }
    }

    await saveLocalWatchProgress(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function writeProgressForTitle(titleId: string | number, position: number, duration?: number) {
  const id = toIdString(titleId);
  if (!id) return;

  const nextEntry: WatchProgressEntry = {
    positionMillis: Math.max(0, Math.floor(position)),
    updatedAt: Date.now(),
    durationMillis: duration,
  };

  const map = await readLocalWatchProgress();
  map[id] = nextEntry;
  await saveLocalWatchProgress(map);

  const userId = await getSignedInUserId();
  if (!userId) return;

  try {
    await upsertWatchHistoryProgress(userId, id, nextEntry, { completed: false });
  } catch {
    // local progress remains authoritative fallback
  }
}

export async function clearProgressForTitle(titleId: string | number) {
  const id = toIdString(titleId);
  if (!id) return;

  const map = await readLocalWatchProgress();
  delete map[id];
  await saveLocalWatchProgress(map);

  const userId = await getSignedInUserId();
  if (!userId) return;

  try {
    await supabase.from(USER_WATCH_HISTORY_TABLE).upsert(
      {
        user_id: userId,
        title_id: id,
        last_position_millis: 0,
        completed: true,
        last_watched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,title_id" },
    );
  } catch {
    // ignore remote cleanup failures
  }
}

async function readTitleCounters(titleId: string) {
  try {
    const { data, error } = await supabase
      .from("titles")
      .select("view_count,watch_count")
      .eq("id", titleId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      viewCount: Number((data as Record<string, unknown>).view_count ?? 0),
      watchCount: Number((data as Record<string, unknown>).watch_count ?? 0),
    };
  } catch {
    return null;
  }
}

export async function recordPlaybackStart(titleId: string | number) {
  const id = toIdString(titleId);
  if (!id) return;

  const userId = await getSignedInUserId();
  if (userId) {
    try {
      const existing = await supabase
        .from(USER_WATCH_HISTORY_TABLE)
        .select("play_count")
        .eq("user_id", userId)
        .eq("title_id", id)
        .maybeSingle();

      const nextPlayCount = Math.max(1, Number(existing.data?.play_count ?? 0) + 1);
      await supabase.from(USER_WATCH_HISTORY_TABLE).upsert(
        {
          user_id: userId,
          title_id: id,
          play_count: nextPlayCount,
          last_position_millis: 0,
          completed: false,
          last_watched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,title_id" },
      );
    } catch {
      // watch history is optional foundation data
    }
  }

  const counters = await readTitleCounters(id);
  if (!counters) return;

  try {
    await supabase
      .from("titles")
      .update({
        view_count: Math.max(0, counters.viewCount) + 1,
        watch_count: Math.max(0, counters.watchCount) + 1,
      })
      .eq("id", id);
  } catch {
    // optional trending counters
  }
}

export async function recordWatchHistoryProgress(
  titleId: string | number,
  {
    positionMillis,
    durationMillis,
    completed,
  }: {
    positionMillis: number;
    durationMillis?: number;
    completed?: boolean;
  },
) {
  const id = toIdString(titleId);
  if (!id) return;

  const userId = await getSignedInUserId();
  if (!userId) return;

  try {
    const existing = await supabase
      .from(USER_WATCH_HISTORY_TABLE)
      .select("play_count")
      .eq("user_id", userId)
      .eq("title_id", id)
      .maybeSingle();

    await supabase.from(USER_WATCH_HISTORY_TABLE).upsert(
      {
        user_id: userId,
        title_id: id,
        play_count: Math.max(1, Number(existing.data?.play_count ?? 0) || 1),
        last_position_millis: Math.max(0, Math.floor(positionMillis)),
        duration_millis: durationMillis ?? null,
        completed: completed === true,
        last_watched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,title_id" },
    );
  } catch {
    // foundation table is optional
  }
}

// ── User Profile (for chat identity) ──────────────────────────────────────────

const AVATARS = ["👤", "😊", "🎬", "🍿", "🎭", "🎪", "🎨", "🎸", "🎯", "⭐"];

export function getAvatarEmoji(index: number): string {
  return AVATARS[Math.max(0, Math.min(9, index))] ?? "👤";
}

export async function readUserProfile(): Promise<UserProfile> {
  const cached = await readJsonValue<UserProfile>(USER_PROFILE_KEY, { username: "", avatarIndex: 0 });
  if (cached.username) return cached;

  // Generate if missing
  const generated: UserProfile = {
    username: `Studio Guest ${Math.floor(1000 + Math.random() * 9000)}`,
    avatarIndex: Math.floor(Math.random() * AVATARS.length),
  };
  await saveUserProfile(generated);
  return generated;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await writeJsonValue(USER_PROFILE_KEY, profile);
}

// ── Last Party Session (for auto-rejoin) ──────────────────────────────────────

export async function readLastPartySession(): Promise<LastPartySession | null> {
  const cached = await readJsonValue<LastPartySession | null>(LAST_PARTY_KEY, null);
  return cached;
}

export async function saveLastPartySession(session: LastPartySession): Promise<void> {
  await writeJsonValue(LAST_PARTY_KEY, session);
}

export async function clearLastPartySession(): Promise<void> {
  await writeJsonValue(LAST_PARTY_KEY, null);
}
