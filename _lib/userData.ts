import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Tables, TablesInsert } from "../supabase/database.types";
import { getOfficialPlatformAccount } from "./officialAccounts";
import {
  normalizeCapturePolicy,
  normalizeContentAccessRule,
  normalizeJoinPolicy,
  normalizeReactionsPolicy,
  type CapturePolicy,
  type ContentAccessRule,
  type JoinPolicy,
  type ReactionsPolicy,
} from "./roomRules";
import { supabase } from "./supabase";

export const WATCH_PROGRESS_KEY = "@chillywood/watch-progress";
export const MY_LIST_KEY = "@chillywood/my-list";
export const USER_PROFILE_KEY = "@chillywood/user-profile";
export const LAST_PARTY_KEY = "@chillywood/last-party";
export const USER_WATCH_TABLE = "watch_history";
export const USER_MY_LIST_TABLE = "user_list";
export const USER_WATCH_HISTORY_TABLE = "watch_history";
export const USER_PROFILES_TABLE = "user_profiles";

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
  defaultWatchPartyJoinPolicy?: JoinPolicy;
  defaultWatchPartyReactionsPolicy?: ReactionsPolicy;
  defaultWatchPartyContentAccessRule?: ContentAccessRule;
  defaultWatchPartyCapturePolicy?: CapturePolicy;
  defaultCommunicationContentAccessRule?: ContentAccessRule;
  defaultCommunicationCapturePolicy?: CapturePolicy;
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
  identityKind: "member" | "official_platform";
  officialBadgeLabel?: string;
  platformOwnershipLabel?: string;
  platformRoleLabel?: string;
  isProtectedFromClaim: boolean;
  handle?: string;
  auditOwnerKey?: string;
};

type UserListInsert = TablesInsert<"user_list">;
type WatchHistoryRow = Pick<
  Tables<"watch_history">,
  "title_id" | "last_position_millis" | "duration_millis" | "last_watched_at" | "updated_at" | "completed" | "play_count"
>;
type WatchHistoryInsert = TablesInsert<"watch_history">;
type UserProfileRow = Pick<
  Tables<"user_profiles">,
  | "user_id"
  | "username"
  | "avatar_index"
  | "display_name"
  | "avatar_url"
  | "tagline"
  | "channel_role"
  | "default_watch_party_join_policy"
  | "default_watch_party_reactions_policy"
  | "default_watch_party_content_access_rule"
  | "default_watch_party_capture_policy"
  | "default_communication_content_access_rule"
  | "default_communication_capture_policy"
>;
type UserProfileInsert = TablesInsert<"user_profiles">;

const toIdString = (value: string | number | null | undefined) => String(value ?? "").trim();

const dedupeIds = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));

const TECHNICAL_PROFILE_NAME_PATTERN = /^(user[·\-\s]|viewer[·\-\s]|anon[\-\s])/i;
const UUID_LIKE_PROFILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeTextValue = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

const logChatProfile = (event: string, details?: Record<string, unknown>) => {
  void event;
  void details;
};

export const normalizeUserProfile = (profile?: Partial<UserProfile> | null): UserProfile => {
  const fallbackUsername = normalizeTextValue(profile?.username) ?? `Studio Guest ${Math.floor(1000 + Math.random() * 9000)}`;
  const avatarIndex = Number.isFinite(Number(profile?.avatarIndex))
    ? Math.max(0, Math.min(9, Math.floor(Number(profile?.avatarIndex))))
    : Math.floor(Math.random() * AVATARS.length);

  return {
    username: fallbackUsername,
    avatarIndex,
    displayName: normalizeTextValue(profile?.displayName),
    avatarUrl: normalizeTextValue(profile?.avatarUrl),
    tagline: normalizeTextValue(profile?.tagline),
    channelRole: normalizeChannelRole(profile?.channelRole),
    defaultWatchPartyJoinPolicy: normalizeJoinPolicy(profile?.defaultWatchPartyJoinPolicy),
    defaultWatchPartyReactionsPolicy: normalizeReactionsPolicy(profile?.defaultWatchPartyReactionsPolicy),
    defaultWatchPartyContentAccessRule: normalizeContentAccessRule(profile?.defaultWatchPartyContentAccessRule),
    defaultWatchPartyCapturePolicy: normalizeCapturePolicy(profile?.defaultWatchPartyCapturePolicy),
    defaultCommunicationContentAccessRule: normalizeContentAccessRule(profile?.defaultCommunicationContentAccessRule),
    defaultCommunicationCapturePolicy: normalizeCapturePolicy(profile?.defaultCommunicationCapturePolicy),
  };
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

const toUserProfileUpsertRow = (userId: string, profile: UserProfile) => ({
  user_id: userId,
  username: profile.username,
  avatar_index: profile.avatarIndex,
  display_name: profile.displayName ?? null,
  avatar_url: profile.avatarUrl ?? null,
  tagline: profile.tagline ?? null,
  channel_role: profile.channelRole ?? null,
  default_watch_party_join_policy: profile.defaultWatchPartyJoinPolicy,
  default_watch_party_reactions_policy: profile.defaultWatchPartyReactionsPolicy,
  default_watch_party_content_access_rule: profile.defaultWatchPartyContentAccessRule,
  default_watch_party_capture_policy: profile.defaultWatchPartyCapturePolicy,
  default_communication_content_access_rule: profile.defaultCommunicationContentAccessRule,
  default_communication_capture_policy: profile.defaultCommunicationCapturePolicy,
}) satisfies UserProfileInsert;

const parseRemoteUserProfile = (row: UserProfileRow | null | undefined): UserProfile | null => {
  if (!row) return null;
  const username = normalizeTextValue(row.username);
  if (!username) return null;

  return normalizeUserProfile({
    username,
    avatarIndex: Number.isFinite(Number(row.avatar_index)) ? Number(row.avatar_index) : undefined,
    displayName: normalizeTextValue(row.display_name),
    avatarUrl: normalizeTextValue(row.avatar_url),
    tagline: normalizeTextValue(row.tagline),
    channelRole: normalizeChannelRole(row.channel_role),
    defaultWatchPartyJoinPolicy: normalizeJoinPolicy(row.default_watch_party_join_policy),
    defaultWatchPartyReactionsPolicy: normalizeReactionsPolicy(row.default_watch_party_reactions_policy),
    defaultWatchPartyContentAccessRule: normalizeContentAccessRule(row.default_watch_party_content_access_rule),
    defaultWatchPartyCapturePolicy: normalizeCapturePolicy(row.default_watch_party_capture_policy),
    defaultCommunicationContentAccessRule: normalizeContentAccessRule(row.default_communication_content_access_rule),
    defaultCommunicationCapturePolicy: normalizeCapturePolicy(row.default_communication_capture_policy),
  });
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
  const officialAccount = getOfficialPlatformAccount(id);
  const fallbackDisplayName = normalizeTextValue(options.fallbackDisplayName) ?? "User";
  const resolvedDisplayName = resolveProfileDisplayName(
    options.displayName,
    options.username,
    profile?.displayName,
    profile?.username,
  );

  return {
    id: officialAccount?.userId ?? id,
    displayName: officialAccount?.displayName ?? (resolvedDisplayName !== "User" ? resolvedDisplayName : fallbackDisplayName),
    avatarUrl: officialAccount ? normalizeTextValue(officialAccount.avatarUrl) : normalizeTextValue(options.avatarUrl) ?? normalizeTextValue(profile?.avatarUrl),
    tagline: officialAccount?.tagline
      ?? normalizeTextValue(options.tagline)
      ?? normalizeTextValue(options.bio)
      ?? normalizeTextValue(profile?.tagline),
    role: officialAccount?.channelRole ?? normalizeChannelRole(options.role ?? profile?.channelRole),
    isLive: !!options.isLive,
    identityKind: officialAccount ? "official_platform" : "member",
    officialBadgeLabel: officialAccount?.officialBadgeLabel,
    platformOwnershipLabel: officialAccount?.platformOwnershipLabel,
    platformRoleLabel: officialAccount?.platformRoleLabel,
    isProtectedFromClaim: !!officialAccount,
    handle: officialAccount?.handle,
    auditOwnerKey: officialAccount?.auditOwnerKey,
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

async function getSignedInUserSnapshot() {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    const snapshot = {
      userId: user?.id ?? null,
      email: normalizeTextValue(user?.email),
      displayName: normalizeTextValue(
        user?.user_metadata?.display_name
        ?? user?.user_metadata?.full_name
        ?? user?.user_metadata?.name,
      ),
    };
    logChatProfile("auth_snapshot", {
      userId: snapshot.userId ?? "none",
      email: snapshot.email ?? "",
      displayName: snapshot.displayName ?? "",
    });
    return snapshot;
  } catch {
    logChatProfile("auth_snapshot_failed");
    return {
      userId: null,
      email: undefined,
      displayName: undefined,
    };
  }
}

const buildFallbackUsernameFromEmail = (email?: string) => {
  const localPart = String(email ?? "").split("@")[0]?.trim().toLowerCase() ?? "";
  const normalized = localPart.replace(/[^a-z0-9._-]/g, "");
  return normalized || undefined;
};

async function readRemoteUserProfile(userId: string): Promise<UserProfile | null> {
  const normalizedUserId = toIdString(userId);
  if (!normalizedUserId) return null;

  try {
    logChatProfile("remote_read_start", { userId: normalizedUserId });
    const { data, error } = await supabase
      .from(USER_PROFILES_TABLE)
      .select(
        "user_id,username,avatar_index,display_name,avatar_url,tagline,channel_role,default_watch_party_join_policy,default_watch_party_reactions_policy,default_watch_party_content_access_rule,default_watch_party_capture_policy,default_communication_content_access_rule,default_communication_capture_policy",
      )
      .eq("user_id", normalizedUserId)
      .maybeSingle();

    if (error || !data) {
      logChatProfile("remote_read_empty", {
        userId: normalizedUserId,
        hasError: !!error,
      });
      return null;
    }
    const parsed = parseRemoteUserProfile(data);
    logChatProfile("remote_read_success", {
      userId: normalizedUserId,
      username: parsed?.username ?? "",
      displayName: parsed?.displayName ?? "",
    });
    return parsed;
  } catch (error) {
    logChatProfile("remote_read_failed", {
      userId: normalizedUserId,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return null;
  }
}

export async function readUserProfileByUserId(userId: string): Promise<UserProfile | null> {
  return readRemoteUserProfile(userId);
}

async function syncUserProfileToRemote(profile: UserProfile): Promise<void> {
  const userId = await getSignedInUserId();
  if (!userId) return;

  try {
    logChatProfile("remote_upsert_start", {
      userId,
      username: profile.username,
      displayName: profile.displayName ?? "",
    });
    const { error } = await supabase
      .from(USER_PROFILES_TABLE)
      .upsert(toUserProfileUpsertRow(userId, profile), { onConflict: "user_id" });
    if (error) {
      logChatProfile("remote_upsert_failed", {
        userId,
        username: profile.username,
        displayName: profile.displayName ?? "",
        message: error.message,
      });
      return;
    }
    logChatProfile("remote_upsert_success", {
      userId,
      username: profile.username,
      displayName: profile.displayName ?? "",
    });
  } catch (error) {
    logChatProfile("remote_upsert_failed", {
      userId,
      username: profile.username,
      displayName: profile.displayName ?? "",
      message: error instanceof Error ? error.message : "unknown_error",
    });
    // social identity foundation is best-effort for now
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

    const remoteEntries = (data ?? [])
      .map((row) => {
        const id = toIdString(row.title_id);
        if (!id) return null;
        const updatedAtRaw = Date.parse(row.updated_at);
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
        }) satisfies UserListInsert),
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
        } satisfies UserListInsert,
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
  const payload: WatchHistoryInsert = {
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
    for (const row of data ?? []) {
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
      } satisfies WatchHistoryInsert,
      { onConflict: "user_id,title_id" },
    );
  } catch {
    // ignore remote cleanup failures
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
        } satisfies WatchHistoryInsert,
        { onConflict: "user_id,title_id" },
      );
    } catch {
      // watch history is optional foundation data
    }
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
      } satisfies WatchHistoryInsert,
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
  if (cached.username) {
    const normalized = normalizeUserProfile(cached);
    logChatProfile("local_profile_loaded", {
      source: "async_storage",
      username: normalized.username,
      displayName: normalized.displayName ?? "",
    });
    await syncUserProfileToRemote(normalized);
    return normalized;
  }

  const signedInUser = await getSignedInUserSnapshot();
  const remoteProfile = signedInUser.userId ? await readRemoteUserProfile(signedInUser.userId) : null;
  if (remoteProfile?.username) {
    logChatProfile("profile_selected", {
      source: "remote_profile",
      userId: signedInUser.userId ?? "none",
      username: remoteProfile.username,
      displayName: remoteProfile.displayName ?? "",
    });
    await writeJsonValue(USER_PROFILE_KEY, remoteProfile);
    await syncUserProfileToRemote(remoteProfile);
    return remoteProfile;
  }

  // Generate if missing
  const emailDerivedUsername = buildFallbackUsernameFromEmail(signedInUser.email);
  const generated = normalizeUserProfile({
    username: emailDerivedUsername
      ?? `Studio Guest ${Math.floor(1000 + Math.random() * 9000)}`,
    avatarIndex: Math.floor(Math.random() * AVATARS.length),
    displayName: signedInUser.displayName,
  });
  logChatProfile("fallback_identity_chosen", {
    userId: signedInUser.userId ?? "none",
    username: generated.username,
    displayName: generated.displayName ?? "",
    emailDerivedUsername: emailDerivedUsername ?? "",
  });
  await saveUserProfile(generated);
  return generated;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const normalized = normalizeUserProfile(profile);
  logChatProfile("local_profile_save", {
    username: normalized.username,
    displayName: normalized.displayName ?? "",
  });
  await writeJsonValue(USER_PROFILE_KEY, normalized);
  await syncUserProfileToRemote(normalized);
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
