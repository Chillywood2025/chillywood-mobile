import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database, Tables, TablesInsert } from "../supabase/database.types";
import { createClient } from "@supabase/supabase-js";
import { captureAccountBoundSupabaseMutationSubject, assertAccountBoundSupabaseMutationSubjectCurrent } from "./accountBoundSupabaseMutation";
import { getAccountScopedStorageKey, readAccountScopedJsonValue, writeAccountScopedJsonValue } from "./accountScopedStorage";
import { createUserCollectionSync, DefinitiveCollectionWriteError, type CollectionSyncStatus, type VersionedIntent } from "./userCollectionSync";
import {
  getCurrentAccountSessionAuthoritySnapshot,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import { normalizeAccessVisibility, type AccessVisibility } from "./accessVisibility";
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
import {
  normalizeProfileVisibility,
  type ProfileVisibility,
} from "./profileVisibility";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";
import { formatUsernameHandle, normalizeUsernameHandle } from "./usernameHandles";

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
  profileAvatarMediaStatus?: ProfileMediaStatus;
  profileAvatarMediaFlaggedAt?: string;
  profileAvatarFitMode?: ProfileAppearanceFitMode;
  profileAvatarFocalX?: number;
  profileAvatarFocalY?: number;
  profileBackgroundUrl?: string;
  profileBackgroundMediaStatus?: ProfileMediaStatus;
  profileBackgroundMediaFlaggedAt?: string;
  profileBackgroundFitMode?: ProfileAppearanceFitMode;
  profileBackgroundFocalX?: number;
  profileBackgroundFocalY?: number;
  profileBackgroundOverlayStrength?: number;
  tagline?: string;
  channelLayoutPreset?: "spotlight" | "live_first" | "library_first";
  channelRole?: "viewer" | "host" | "creator";
  profileVisibility?: ProfileVisibility;
  profileAccessVisibility?: AccessVisibility;
  platformAccessVisibility?: AccessVisibility;
  publicActivityVisibility?: "public" | "followers_only" | "subscribers_only" | "private";
  followerSurfaceEnabled?: boolean;
  subscriberSurfaceEnabled?: boolean;
  defaultWatchPartyJoinPolicy?: JoinPolicy;
  defaultWatchPartyReactionsPolicy?: ReactionsPolicy;
  defaultWatchPartyContentAccessRule?: ContentAccessRule;
  defaultWatchPartyCapturePolicy?: CapturePolicy;
  defaultCommunicationContentAccessRule?: ContentAccessRule;
  defaultCommunicationCapturePolicy?: CapturePolicy;
};

export type ProfileAppearanceFitMode = "fill" | "fit" | "center";
export type ProfileMediaStatus = "active" | "user_removed" | "flagged" | "admin_removed";

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
  profileAvatarMediaStatus: ProfileMediaStatus;
  profileAvatarMediaFlaggedAt?: string;
  profileAvatarFitMode: ProfileAppearanceFitMode;
  profileAvatarFocalX: number;
  profileAvatarFocalY: number;
  profileBackgroundUrl?: string;
  profileBackgroundMediaStatus: ProfileMediaStatus;
  profileBackgroundMediaFlaggedAt?: string;
  profileBackgroundFitMode: ProfileAppearanceFitMode;
  profileBackgroundFocalX: number;
  profileBackgroundFocalY: number;
  profileBackgroundOverlayStrength: number;
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

const USER_MY_LIST_PAGE_SIZE = 200;
type UserProfileRow = Pick<
  Tables<"user_profiles">,
  | "user_id"
  | "username"
  | "avatar_index"
  | "display_name"
  | "avatar_url"
  | "profile_avatar_media_status"
  | "profile_avatar_media_flagged_at"
  | "profile_avatar_fit_mode"
  | "profile_avatar_focal_x"
  | "profile_avatar_focal_y"
  | "profile_background_url"
  | "profile_background_media_status"
  | "profile_background_media_flagged_at"
  | "profile_background_fit_mode"
  | "profile_background_focal_x"
  | "profile_background_focal_y"
  | "profile_background_overlay_strength"
  | "tagline"
  | "channel_layout_preset"
  | "channel_role"
  | "profile_visibility"
  | "profile_access_visibility"
  | "platform_access_visibility"
  | "public_activity_visibility"
  | "follower_surface_enabled"
  | "subscriber_surface_enabled"
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

export const normalizeProfileAppearanceFitMode = (value: unknown): ProfileAppearanceFitMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "fit" || normalized === "center") return normalized;
  return "fill";
};

export const normalizeProfileMediaStatus = (value: unknown): ProfileMediaStatus => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "user_removed" || normalized === "flagged" || normalized === "admin_removed") return normalized;
  return "active";
};

export const isProfileMediaActive = (status?: ProfileMediaStatus | null) => (
  normalizeProfileMediaStatus(status) === "active"
);

export const normalizeProfileAppearanceNumber = (value: unknown, fallback: number, min = 0, max = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const normalizePublicActivityVisibility = (value: unknown): UserProfile["publicActivityVisibility"] => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "public"
    || normalized === "followers_only"
    || normalized === "subscribers_only"
    || normalized === "private"
  ) {
    return normalized;
  }
  return undefined;
};

const normalizeChannelLayoutPreset = (value: unknown): UserProfile["channelLayoutPreset"] => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "live_first" || normalized === "library_first") {
    return normalized;
  }
  return "spotlight";
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
    profileAvatarMediaStatus: normalizeProfileMediaStatus(profile?.profileAvatarMediaStatus),
    profileAvatarMediaFlaggedAt: normalizeTextValue(profile?.profileAvatarMediaFlaggedAt),
    profileAvatarFitMode: normalizeProfileAppearanceFitMode(profile?.profileAvatarFitMode),
    profileAvatarFocalX: normalizeProfileAppearanceNumber(profile?.profileAvatarFocalX, 0.5),
    profileAvatarFocalY: normalizeProfileAppearanceNumber(profile?.profileAvatarFocalY, 0.5),
    profileBackgroundUrl: normalizeTextValue(profile?.profileBackgroundUrl),
    profileBackgroundMediaStatus: normalizeProfileMediaStatus(profile?.profileBackgroundMediaStatus),
    profileBackgroundMediaFlaggedAt: normalizeTextValue(profile?.profileBackgroundMediaFlaggedAt),
    profileBackgroundFitMode: normalizeProfileAppearanceFitMode(profile?.profileBackgroundFitMode),
    profileBackgroundFocalX: normalizeProfileAppearanceNumber(profile?.profileBackgroundFocalX, 0.5),
    profileBackgroundFocalY: normalizeProfileAppearanceNumber(profile?.profileBackgroundFocalY, 0.5),
    profileBackgroundOverlayStrength: normalizeProfileAppearanceNumber(profile?.profileBackgroundOverlayStrength, 0.58, 0, 0.9),
    tagline: normalizeTextValue(profile?.tagline),
    channelLayoutPreset: normalizeChannelLayoutPreset(profile?.channelLayoutPreset),
    channelRole: normalizeChannelRole(profile?.channelRole),
    profileVisibility: normalizeProfileVisibility(profile?.profileVisibility),
    profileAccessVisibility: normalizeAccessVisibility(profile?.profileAccessVisibility),
    platformAccessVisibility: normalizeAccessVisibility(profile?.platformAccessVisibility),
    publicActivityVisibility: normalizePublicActivityVisibility(profile?.publicActivityVisibility),
    followerSurfaceEnabled: typeof profile?.followerSurfaceEnabled === "boolean" ? profile.followerSurfaceEnabled : undefined,
    subscriberSurfaceEnabled: typeof profile?.subscriberSurfaceEnabled === "boolean" ? profile.subscriberSurfaceEnabled : undefined,
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
  profile_avatar_fit_mode: normalizeProfileAppearanceFitMode(profile.profileAvatarFitMode),
  profile_avatar_focal_x: normalizeProfileAppearanceNumber(profile.profileAvatarFocalX, 0.5),
  profile_avatar_focal_y: normalizeProfileAppearanceNumber(profile.profileAvatarFocalY, 0.5),
  profile_background_url: profile.profileBackgroundUrl ?? null,
  profile_background_fit_mode: normalizeProfileAppearanceFitMode(profile.profileBackgroundFitMode),
  profile_background_focal_x: normalizeProfileAppearanceNumber(profile.profileBackgroundFocalX, 0.5),
  profile_background_focal_y: normalizeProfileAppearanceNumber(profile.profileBackgroundFocalY, 0.5),
  profile_background_overlay_strength: normalizeProfileAppearanceNumber(profile.profileBackgroundOverlayStrength, 0.58, 0, 0.9),
  tagline: profile.tagline ?? null,
  channel_layout_preset: normalizeChannelLayoutPreset(profile.channelLayoutPreset),
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
    profileAvatarMediaStatus: normalizeProfileMediaStatus(row.profile_avatar_media_status),
    profileAvatarMediaFlaggedAt: normalizeTextValue(row.profile_avatar_media_flagged_at),
    profileAvatarFitMode: normalizeProfileAppearanceFitMode(row.profile_avatar_fit_mode),
    profileAvatarFocalX: normalizeProfileAppearanceNumber(row.profile_avatar_focal_x, 0.5),
    profileAvatarFocalY: normalizeProfileAppearanceNumber(row.profile_avatar_focal_y, 0.5),
    profileBackgroundUrl: normalizeTextValue(row.profile_background_url),
    profileBackgroundMediaStatus: normalizeProfileMediaStatus(row.profile_background_media_status),
    profileBackgroundMediaFlaggedAt: normalizeTextValue(row.profile_background_media_flagged_at),
    profileBackgroundFitMode: normalizeProfileAppearanceFitMode(row.profile_background_fit_mode),
    profileBackgroundFocalX: normalizeProfileAppearanceNumber(row.profile_background_focal_x, 0.5),
    profileBackgroundFocalY: normalizeProfileAppearanceNumber(row.profile_background_focal_y, 0.5),
    profileBackgroundOverlayStrength: normalizeProfileAppearanceNumber(row.profile_background_overlay_strength, 0.58, 0, 0.9),
    tagline: normalizeTextValue(row.tagline),
    channelLayoutPreset: normalizeChannelLayoutPreset(row.channel_layout_preset),
    channelRole: normalizeChannelRole(row.channel_role),
    profileVisibility: normalizeProfileVisibility(row.profile_visibility),
    profileAccessVisibility: normalizeAccessVisibility(row.profile_access_visibility),
    platformAccessVisibility: normalizeAccessVisibility(row.platform_access_visibility),
    publicActivityVisibility: normalizePublicActivityVisibility(row.public_activity_visibility),
    followerSurfaceEnabled: typeof row.follower_surface_enabled === "boolean" ? row.follower_surface_enabled : undefined,
    subscriberSurfaceEnabled: typeof row.subscriber_surface_enabled === "boolean" ? row.subscriber_surface_enabled : undefined,
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
  const profileAvatarMediaStatus = normalizeProfileMediaStatus(profile?.profileAvatarMediaStatus);
  const profileBackgroundMediaStatus = normalizeProfileMediaStatus(profile?.profileBackgroundMediaStatus);
  const profileAvatarUrl = isProfileMediaActive(profileAvatarMediaStatus) ? normalizeTextValue(profile?.avatarUrl) : undefined;
  const profileBackgroundUrl = isProfileMediaActive(profileBackgroundMediaStatus)
    ? normalizeTextValue(profile?.profileBackgroundUrl)
    : undefined;
  const resolvedDisplayName = resolveProfileDisplayName(
    profile?.displayName,
    profile?.username,
    options.displayName,
    options.username,
  );

  return {
    id: officialAccount?.userId ?? id,
    displayName: officialAccount?.displayName ?? (resolvedDisplayName !== "User" ? resolvedDisplayName : fallbackDisplayName),
    avatarUrl: officialAccount
      ? profileAvatarUrl ?? normalizeTextValue(officialAccount.avatarUrl)
      : profileAvatarUrl ?? normalizeTextValue(options.avatarUrl),
    profileAvatarMediaStatus,
    profileAvatarMediaFlaggedAt: normalizeTextValue(profile?.profileAvatarMediaFlaggedAt),
    profileAvatarFitMode: normalizeProfileAppearanceFitMode(profile?.profileAvatarFitMode),
    profileAvatarFocalX: normalizeProfileAppearanceNumber(profile?.profileAvatarFocalX, 0.5),
    profileAvatarFocalY: normalizeProfileAppearanceNumber(profile?.profileAvatarFocalY, 0.5),
    profileBackgroundUrl: officialAccount ? undefined : profileBackgroundUrl,
    profileBackgroundMediaStatus: officialAccount ? "active" : profileBackgroundMediaStatus,
    profileBackgroundMediaFlaggedAt: officialAccount ? undefined : normalizeTextValue(profile?.profileBackgroundMediaFlaggedAt),
    profileBackgroundFitMode: officialAccount ? "fill" : normalizeProfileAppearanceFitMode(profile?.profileBackgroundFitMode),
    profileBackgroundFocalX: officialAccount ? 0.5 : normalizeProfileAppearanceNumber(profile?.profileBackgroundFocalX, 0.5),
    profileBackgroundFocalY: officialAccount ? 0.5 : normalizeProfileAppearanceNumber(profile?.profileBackgroundFocalY, 0.5),
    profileBackgroundOverlayStrength: officialAccount
      ? 0.58
      : normalizeProfileAppearanceNumber(profile?.profileBackgroundOverlayStrength, 0.58, 0, 0.9),
    tagline: officialAccount?.tagline
      ?? normalizeTextValue(profile?.tagline)
      ?? normalizeTextValue(options.tagline)
      ?? normalizeTextValue(options.bio),
    role: officialAccount?.channelRole ?? normalizeChannelRole(options.role ?? profile?.channelRole),
    isLive: !!options.isLive,
    identityKind: officialAccount ? "official_platform" : "member",
    officialBadgeLabel: officialAccount?.officialBadgeLabel,
    platformOwnershipLabel: officialAccount?.platformOwnershipLabel,
    platformRoleLabel: officialAccount?.platformRoleLabel,
    isProtectedFromClaim: !!officialAccount,
    handle: officialAccount?.handle ?? formatUsernameHandle(profile?.username ?? options.username),
    auditOwnerKey: officialAccount?.auditOwnerKey,
  };
};

type UserDataAccountBinding = AccountSessionAuthorityBinding | null;

const captureUserDataAccountBinding = (): UserDataAccountBinding => (
  getCurrentAccountSessionAuthoritySnapshot()
);

const getBoundUserId = (binding: UserDataAccountBinding) => binding?.userId ?? null;

const userDataAccountBindingIsCurrent = (binding: UserDataAccountBinding) => {
  const current = getCurrentAccountSessionAuthoritySnapshot();
  return binding === null ? current === null : sameAccountSessionAuthority(binding, current);
};

const assertUserDataAccountBindingIsCurrent = (binding: UserDataAccountBinding) => {
  if (!userDataAccountBindingIsCurrent(binding)) {
    throw new Error("Account changed while customer state was loading.");
  }
};

async function getSignedInUserSnapshot(binding: UserDataAccountBinding) {
  let data: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"];
  try {
    ({ data } = await supabase.auth.getSession());
  } catch {
    assertUserDataAccountBindingIsCurrent(binding);
    logChatProfile("auth_snapshot_failed");
    return {
      userId: getBoundUserId(binding),
      email: undefined,
      displayName: undefined,
    };
  }
  assertUserDataAccountBindingIsCurrent(binding);
  const user = data.session?.user ?? null;
  if ((user?.id ?? null) !== getBoundUserId(binding)) {
    throw new Error("Account changed while customer state was loading.");
  }
  const snapshot = {
    userId: getBoundUserId(binding),
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
}

type PublicChannelProfileRpc = {
  maybeSingle: () => Promise<{ data: UserProfileRow | null; error: { message?: string } | null }>;
};

async function readPublicChannelProfile(userId: string): Promise<UserProfile | null> {
  const normalizedUserId = toIdString(userId);
  if (!normalizedUserId) return null;

  try {
    const rpc = (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => PublicChannelProfileRpc)("read_public_channel_profile", {
      profile_user_id: normalizedUserId,
    });
    const { data, error } = await rpc.maybeSingle();
    if (error || !data) return null;
    return parseRemoteUserProfile(data);
  } catch {
    return null;
  }
}

async function readRemoteUserProfile(userId: string): Promise<UserProfile | null> {
  const normalizedUserId = toIdString(userId);
  if (!normalizedUserId) return null;

  try {
    logChatProfile("remote_read_start", { userId: normalizedUserId });
    const { data, error } = await supabase
      .from(USER_PROFILES_TABLE)
      .select(
        "user_id,username,avatar_index,display_name,avatar_url,profile_avatar_media_status,profile_avatar_media_flagged_at,profile_avatar_fit_mode,profile_avatar_focal_x,profile_avatar_focal_y,profile_background_url,profile_background_media_status,profile_background_media_flagged_at,profile_background_fit_mode,profile_background_focal_x,profile_background_focal_y,profile_background_overlay_strength,tagline,channel_layout_preset,channel_role,profile_visibility,profile_access_visibility,platform_access_visibility,public_activity_visibility,follower_surface_enabled,subscriber_surface_enabled,default_watch_party_join_policy,default_watch_party_reactions_policy,default_watch_party_content_access_rule,default_watch_party_capture_policy,default_communication_content_access_rule,default_communication_capture_policy",
      )
      .eq("user_id", normalizedUserId)
      .maybeSingle();

    if (error || !data) {
      const publicProfile = await readPublicChannelProfile(normalizedUserId);
      if (publicProfile) return publicProfile;
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
  const binding = captureUserDataAccountBinding();
  const profile = await readRemoteUserProfile(userId);
  assertUserDataAccountBindingIsCurrent(binding);
  return profile;
}

/** Platform identity follows Platform access, independently of personal Profile privacy. */
export async function readPublicPlatformIdentity(userId: string): Promise<UserProfile | null> {
  const binding = captureUserDataAccountBinding();
  const normalizedUserId = toIdString(userId);
  if (!normalizedUserId) return null;
  const rpc = (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PublicChannelProfileRpc)("read_public_platform_identity", { profile_user_id: normalizedUserId });
  const { data, error } = await rpc.maybeSingle();
  assertUserDataAccountBindingIsCurrent(binding);
  if (error) throw new Error("Platform identity is unavailable. Please try again.");
  return data ? parseRemoteUserProfile(data) : null;
}

async function syncUserProfileToRemote(profile: UserProfile, binding: UserDataAccountBinding): Promise<boolean> {
  assertUserDataAccountBindingIsCurrent(binding);
  const userId = getBoundUserId(binding);
  if (!userId) return false;

  try {
    logChatProfile("remote_upsert_start", {
      userId,
      username: profile.username,
      displayName: profile.displayName ?? "",
    });
    const { error } = await supabase
      .from(USER_PROFILES_TABLE)
      .upsert(toUserProfileUpsertRow(userId, profile), { onConflict: "user_id" });
    assertUserDataAccountBindingIsCurrent(binding);
    if (error) {
      logChatProfile("remote_upsert_failed", {
        userId,
        username: profile.username,
        displayName: profile.displayName ?? "",
        message: error.message,
      });
      return false;
    }
    assertUserDataAccountBindingIsCurrent(binding);
    logChatProfile("remote_upsert_success", {
      userId,
      username: profile.username,
      displayName: profile.displayName ?? "",
    });
    return true;
  } catch (error) {
    assertUserDataAccountBindingIsCurrent(binding);
    logChatProfile("remote_upsert_failed", {
      userId,
      username: profile.username,
      displayName: profile.displayName ?? "",
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return false;
  }
}

async function refreshSignedInIdentitySnapshots(profile: UserProfile, binding: UserDataAccountBinding): Promise<void> {
  assertUserDataAccountBindingIsCurrent(binding);
  const userId = getBoundUserId(binding);
  if (!userId) return;

  const displayName = normalizeTextValue(profile.displayName) ?? normalizeTextValue(profile.username) ?? "User";
  const avatarUrl = isProfileMediaActive(profile.profileAvatarMediaStatus) ? normalizeTextValue(profile.avatarUrl) ?? null : null;
  const tagline = normalizeTextValue(profile.tagline) ?? null;
  const now = new Date().toISOString();

  await Promise.allSettled([
    supabase
      .from("chat_thread_members")
      .update({
        display_name: displayName,
        avatar_url: avatarUrl,
        tagline,
      })
      .eq("user_id", userId),
    supabase
      .from("communication_room_memberships")
      .update({
        display_name: displayName,
        avatar_url: avatarUrl,
        updated_at: now,
      })
      .eq("user_id", userId),
    supabase
      .from("watch_party_room_memberships")
      .update({
        display_name: displayName,
        avatar_url: avatarUrl,
        updated_at: now,
      })
      .eq("user_id", userId),
  ]);
  assertUserDataAccountBindingIsCurrent(binding);
}

const readAccountValue = async <T>(key: string, binding: UserDataAccountBinding, fallback: T, strict = false) => {
  assertUserDataAccountBindingIsCurrent(binding);
  let value: T;
  if (strict) {
    // Collection read/modify/write must not mistake a disk failure for an empty cache.
    const raw = await AsyncStorage.getItem(getAccountScopedStorageKey(key, getBoundUserId(binding)));
    value = raw === null ? fallback : JSON.parse(raw) as T;
  } else {
    value = await readAccountScopedJsonValue(AsyncStorage, key, getBoundUserId(binding), fallback);
  }
  assertUserDataAccountBindingIsCurrent(binding);
  return value;
};

const writeAccountValue = async (key: string, binding: UserDataAccountBinding, value: unknown) => {
  assertUserDataAccountBindingIsCurrent(binding);
  const written = await writeAccountScopedJsonValue(AsyncStorage, key, getBoundUserId(binding), value);
  assertUserDataAccountBindingIsCurrent(binding);
  return written;
};

type MyListMetadata = Omit<Partial<MyListEntry>, "id">;
type StoredWatchProgressEntry = WatchProgressEntry & { completed?: boolean; incrementPlayCount?: boolean };

function throwCollectionWriteError(error: { message?: string; code?: string }, status?: number): never {
  // Supabase can resolve a fetch/timeout failure as { error, status: 0 }.
  // Only an explicit server rejection permits automatic retry of the intent.
  if (status !== undefined && status >= 400 && status < 500 && ![408, 499].includes(status)
    && !["08007", "40003"].includes(error.code ?? "")
    && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(error.code ?? "")) {
    throw new DefinitiveCollectionWriteError(error.message ?? "The change was rejected.");
  }
  throw new Error(error.message ?? "Synchronization could not be confirmed.");
}

function boundCollectionClient(binding: UserDataAccountBinding) {
  let captured: Promise<typeof supabase> | undefined;
  return () => captured ??= (async () => {
    assertUserDataAccountBindingIsCurrent(binding);
    if (!binding) throw new Error("Sign in before synchronizing this collection.");
    let subject;
    try {
      subject = await captureAccountBoundSupabaseMutationSubject(binding.userId);
    } catch {
      assertUserDataAccountBindingIsCurrent(binding);
      // Capture/readback did not dispatch a collection mutation, so retry is safe.
      throw new DefinitiveCollectionWriteError("The account could not be verified for synchronization.");
    }
    assertUserDataAccountBindingIsCurrent(binding);
    if (!sameAccountSessionAuthority(binding, subject.authority)) throw new Error("Account changed before synchronization.");
    return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      accessToken: async () => {
        assertUserDataAccountBindingIsCurrent(binding);
        assertAccountBoundSupabaseMutationSubjectCurrent(subject);
        return subject.accessToken;
      },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  })();
}

function collectionStorage(key: string, binding: UserDataAccountBinding) {
  return {
    key: getAccountScopedStorageKey(key, getBoundUserId(binding)),
    remote: !!getBoundUserId(binding),
    assertCurrent: () => assertUserDataAccountBindingIsCurrent(binding),
    write: (value: unknown) => writeAccountValue(key, binding, value),
  };
}

function parseLocalMyListEntries(parsed: unknown): Record<string, MyListEntry> {
  if (Array.isArray(parsed)) {
    const now = Date.now();
    return toMyListEntryMap(dedupeIds(parsed.map((item) => String(item)))
      .map((id, index) => ({ id, savedAt: now - index })));
  }
  const entries: MyListEntry[] = [];
  if (isPlainObject(parsed)) {
    for (const [rawId, rawValue] of Object.entries(parsed)) {
      const id = toIdString(rawId);
      if (!id) continue;
      if (rawValue === true) entries.push({ id, savedAt: 0 });
      else if (isPlainObject(rawValue)) entries.push({
        id,
        title: typeof rawValue.title === "string" ? rawValue.title : undefined,
        posterUrl: typeof rawValue.posterUrl === "string" ? rawValue.posterUrl : undefined,
        thumbnailUrl: typeof rawValue.thumbnailUrl === "string" ? rawValue.thumbnailUrl : undefined,
        savedAt: toEpoch(rawValue.savedAt),
      });
    }
  }
  return toMyListEntryMap(entries);
}

function collectionOperationId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function versionedCollectionProtocol<T>(binding: UserDataAccountBinding, collection: "saved" | "watch") {
  const getClient = boundCollectionClient(binding);
  const invoke = async (name: string, args: Record<string, unknown>) => {
    const client = await getClient();
    assertUserDataAccountBindingIsCurrent(binding);
    const rpc = client.rpc.bind(client) as unknown as (name: string, args: Record<string, unknown>) =>
      Promise<{ data: unknown; error: { message?: string; code?: string } | null; status?: number }>;
    const result = await rpc(name, args);
    assertUserDataAccountBindingIsCurrent(binding);
    if (result.error) throwCollectionWriteError(result.error, result.status);
    return result.data;
  };
  return {
    operationId: collectionOperationId,
    read: async () => {
      const values: Record<string, T> = {}, revisions: Record<string, string> = {};
      let cursor = "";
      for (;;) {
        const data = await invoke("read_my_collection_state", { p_collection: collection, p_after_title_id: cursor, p_limit: USER_MY_LIST_PAGE_SIZE });
        if (!Array.isArray(data)) throw new Error("Account collection is unavailable.");
        for (const row of data) {
          if (!isPlainObject(row) || typeof row.title_id !== "string" || !row.title_id
            || ["__proto__", "prototype", "constructor"].includes(row.title_id)
            || typeof row.revision !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(row.revision)
            || !Object.hasOwn(row, "value")) throw new Error("Invalid account collection response.");
          if (collection === "saved" && row.value !== null && (!isPlainObject(row.value) || row.value.id !== row.title_id)) {
            throw new Error("Invalid Saved title binding.");
          }
          revisions[row.title_id] = row.revision;
          if (row.value !== null) values[row.title_id] = row.value as T;
        }
        if (data.length < USER_MY_LIST_PAGE_SIZE) break;
        const next = String(data[data.length - 1].title_id);
        if (next <= cursor) throw new Error("Account collection pagination did not advance.");
        cursor = next;
      }
      return { values, revisions };
    },
    write: async (id: string, request: VersionedIntent<T>) => {
      const input = request.value as Record<string, unknown> | null;
      const value = input === null ? null : collection === "saved" ? { id } : {
        positionMillis: input.positionMillis,
        ...(input.durationMillis === undefined ? {} : { durationMillis: input.durationMillis }),
        completed: input.completed === true,
        ...(input.incrementPlayCount === true ? { incrementPlayCount: true } : {}),
      };
      const data = await invoke("mutate_my_collection_state", {
        p_collection: collection, p_title_id: id, p_operation_id: request.operationId,
        p_expected_revision: request.expectedRevision, p_value: value,
      });
      if (!isPlainObject(data) || !["applied", "conflict"].includes(String(data.status))
        || typeof data.revision !== "string" || !Object.hasOwn(data, "value")) throw new Error("Invalid account collection receipt.");
      if (collection === "saved" && data.value !== null && (!isPlainObject(data.value) || data.value.id !== id)) {
        throw new Error("Invalid Saved receipt binding.");
      }
      return { status: data.status as "applied" | "conflict", revision: data.revision, value: data.value as T | null };
    },
  };
}
function myListCollection(binding: UserDataAccountBinding) {
  return createUserCollectionSync<MyListEntry>({
    ...collectionStorage(MY_LIST_KEY, binding),
    read: () => readAccountValue(MY_LIST_KEY, binding, null, true),
    legacy: parseLocalMyListEntries,
    validValue: value => isPlainObject(value) && typeof value.id === "string" && Number.isFinite(value.savedAt),
    versioned: versionedCollectionProtocol<MyListEntry>(binding, "saved"),
  });
}

const myListIds = (values: Record<string, MyListEntry>) => (
  sortMyListEntries(Object.values(values)).map(entry => entry.id)
);

export async function readLocalMyListIds(): Promise<string[]> {
  const binding = captureUserDataAccountBinding();
  return myListIds((await myListCollection(binding).snapshot()).values);
}

export async function saveLocalMyListIds(ids: string[]) {
  const binding = captureUserDataAccountBinding();
  await myListCollection(binding).replaceLocal(parseLocalMyListEntries(ids));
}

export async function readLocalMyListEntries(): Promise<MyListEntry[]> {
  const binding = captureUserDataAccountBinding();
  return sortMyListEntries(Object.values((await myListCollection(binding).snapshot()).values));
}

export async function readMyListState(options?: { retryUnknown?: boolean; useAccountVersion?: boolean }) {
  const binding = captureUserDataAccountBinding();
  const result = await myListCollection(binding).refresh(options);
  return { ids: myListIds(result.values), syncStatus: result.syncStatus, readStatus: result.readStatus };
}

export async function readMyListIds(): Promise<string[]> {
  const binding = captureUserDataAccountBinding();
  return myListIds((await myListCollection(binding).refresh()).values);
}

/** Desired state avoids accidental retry toggles; pending/unknown are local, not remote acknowledgements. */
export async function setMyListTitleSaved(
  titleId: string | number,
  saved: boolean,
  metadata?: MyListMetadata,
): Promise<{ ids: string[]; syncStatus: CollectionSyncStatus }> {
  const binding = captureUserDataAccountBinding();
  const id = toIdString(titleId);
  if (!id) throw new Error("A title is required.");
  const result = await myListCollection(binding).change(id, saved ? {
    id, ...metadata, savedAt: toEpoch(metadata?.savedAt, Date.now()),
  } : null);
  return { ids: myListIds(result.values), syncStatus: result.syncStatus };
}

export async function toggleMyListTitle(
  titleId: string | number,
  metadata?: MyListMetadata,
): Promise<string[]> {
  const binding = captureUserDataAccountBinding();
  const id = toIdString(titleId);
  const collection = myListCollection(binding);
  if (!id) return myListIds((await collection.snapshot()).values);
  const result = await collection.change(id, current => current ? null : ({
    id, ...metadata, savedAt: toEpoch(metadata?.savedAt, Date.now()),
  }));
  return myListIds(result.values);
}

const visibleWatchProgress = (values: Record<string, StoredWatchProgressEntry>): WatchProgressMap => (
  Object.fromEntries(Object.entries(values).filter(([, entry]) => !entry.completed)
    .map(([id, entry]) => [id, {
      positionMillis: entry.positionMillis, durationMillis: entry.durationMillis, updatedAt: entry.updatedAt,
    }]))
);


function validStoredWatchProgress(value: unknown) {
  return isPlainObject(value) && Number.isFinite(value.positionMillis) && Number(value.positionMillis) >= 0
    && Number.isFinite(value.updatedAt)
    && (value.completed === undefined || typeof value.completed === "boolean")
    && (value.durationMillis === undefined || Number.isFinite(value.durationMillis));
}

function watchProgressCollection(binding: UserDataAccountBinding) {
  return createUserCollectionSync<StoredWatchProgressEntry>({
    ...collectionStorage(WATCH_PROGRESS_KEY, binding),
    read: () => readAccountValue(WATCH_PROGRESS_KEY, binding, null, true),
    legacy: value => isPlainObject(value) ? Object.fromEntries(Object.entries(value)
      .filter(([, entry]) => validStoredWatchProgress(entry))) as Record<string, StoredWatchProgressEntry> : {},
    validValue: validStoredWatchProgress,
    versioned: versionedCollectionProtocol<StoredWatchProgressEntry>(binding, "watch"),
  });
}

export async function readLocalWatchProgress(): Promise<WatchProgressMap> {
  const binding = captureUserDataAccountBinding();
  return visibleWatchProgress((await watchProgressCollection(binding).snapshot()).values);
}

export async function saveLocalWatchProgress(progressMap: WatchProgressMap) {
  const binding = captureUserDataAccountBinding();
  await watchProgressCollection(binding).replaceLocal(progressMap);
}

export async function readMergedWatchProgress(): Promise<WatchProgressMap> {
  const binding = captureUserDataAccountBinding();
  return visibleWatchProgress((await watchProgressCollection(binding).refresh()).values);
}

export async function readWatchProgressState(options?: { retryUnknown?: boolean; useAccountVersion?: boolean }) {
  const binding = captureUserDataAccountBinding();
  const result = await watchProgressCollection(binding).refresh(options);
  return { progress: visibleWatchProgress(result.values), syncStatus: result.syncStatus, readStatus: result.readStatus };
}

function assertExpectedProgressBinding(
  binding: UserDataAccountBinding,
  expectedBinding: UserDataAccountBinding | undefined,
) {
  if (expectedBinding === undefined) return;
  if (expectedBinding === null ? binding !== null : !sameAccountSessionAuthority(expectedBinding, binding)) {
    throw new Error("Account changed before watch progress could be saved.");
  }
}

export async function writeProgressForTitle(
  titleId: string | number, position: number, duration?: number,
  expectedBinding?: UserDataAccountBinding,
) {
  const binding = captureUserDataAccountBinding();
  assertExpectedProgressBinding(binding, expectedBinding);
  const id = toIdString(titleId);
  if (!id) return;
  await watchProgressCollection(binding).change(id, {
    positionMillis: Math.max(0, Math.floor(position)), durationMillis: duration,
    updatedAt: Date.now(), completed: false,
  });
}

export async function clearProgressForTitle(titleId: string | number, expectedBinding?: UserDataAccountBinding) {
  const binding = captureUserDataAccountBinding();
  assertExpectedProgressBinding(binding, expectedBinding);
  const id = toIdString(titleId);
  if (!id) return;
  await watchProgressCollection(binding).change(id, {
    positionMillis: 0, updatedAt: Date.now(), completed: true,
  });
}

export async function recordPlaybackStart(titleId: string | number) {
  const binding = captureUserDataAccountBinding();
  const id = toIdString(titleId);
  if (!id) return;
  await watchProgressCollection(binding).change(id, {
    positionMillis: 0, updatedAt: Date.now(), completed: false, incrementPlayCount: true,
  });
}

export async function recordWatchHistoryProgress(
  titleId: string | number,
  { positionMillis, durationMillis, completed }: {
    positionMillis: number; durationMillis?: number; completed?: boolean;
  },
) {
  const binding = captureUserDataAccountBinding();
  const id = toIdString(titleId);
  if (!id) return;
  await watchProgressCollection(binding).change(id, {
    positionMillis: Math.max(0, Math.floor(positionMillis)), durationMillis,
    updatedAt: Date.now(), completed: completed === true,
  });
}

// ── User Profile (for chat identity) ──────────────────────────────────────────

const AVATARS = ["👤", "😊", "🎬", "🍿", "🎭", "🎪", "🎨", "🎸", "🎯", "⭐"];

export function getAvatarEmoji(index: number): string {
  return AVATARS[Math.max(0, Math.min(9, index))] ?? "👤";
}

export async function readUserProfile(expectedUserId?: string | null): Promise<UserProfile> {
  const binding = captureUserDataAccountBinding();
  const userId = getBoundUserId(binding);
  if (expectedUserId !== undefined && userId !== expectedUserId) {
    throw new Error("Account changed before the profile could be loaded.");
  }
  const signedInUser = await getSignedInUserSnapshot(binding);
  const cached = await readAccountValue<UserProfile>(
    USER_PROFILE_KEY,
    binding,
    { username: "", avatarIndex: 0 },
  );
  const remoteProfile = signedInUser.userId ? await readRemoteUserProfile(signedInUser.userId) : null;
  assertUserDataAccountBindingIsCurrent(binding);
  if (remoteProfile?.username) {
    logChatProfile("profile_selected", {
      source: "remote_profile",
      userId: signedInUser.userId ?? "none",
      username: remoteProfile.username,
      displayName: remoteProfile.displayName ?? "",
    });
    await writeAccountValue(USER_PROFILE_KEY, binding, remoteProfile);
    return remoteProfile;
  }

  if (cached.username) {
    const normalized = normalizeUserProfile(cached);
    logChatProfile("local_profile_loaded", {
      source: "async_storage",
      username: normalized.username,
      displayName: normalized.displayName ?? "",
    });
    return normalized;
  }

  // Generate a non-email local identity if the remote profile is not available yet.
  const generatedUsername = normalizeUsernameHandle(`user${Math.floor(100000 + Math.random() * 900000)}`);
  const generated = normalizeUserProfile({
    username: generatedUsername,
    avatarIndex: Math.floor(Math.random() * AVATARS.length),
    displayName: signedInUser.displayName,
  });
  logChatProfile("fallback_identity_chosen", {
    userId: signedInUser.userId ?? "none",
    username: generated.username,
    displayName: generated.displayName ?? "",
  });
  await saveUserProfile(generated, signedInUser.userId);
  return generated;
}

export async function readCachedUserProfile(): Promise<UserProfile | null> {
  const binding = captureUserDataAccountBinding();
  const cached = await readAccountValue<UserProfile>(USER_PROFILE_KEY, binding, { username: "", avatarIndex: 0 });
  assertUserDataAccountBindingIsCurrent(binding);
  return cached.username ? normalizeUserProfile(cached) : null;
}

export async function readMyProfileVisibility(): Promise<ProfileVisibility> {
  const binding = captureUserDataAccountBinding();
  const userId = getBoundUserId(binding);
  if (!userId) return "everyone";

  try {
    const { data, error } = await supabase
      .from(USER_PROFILES_TABLE)
      .select("profile_visibility")
      .eq("user_id", userId)
      .maybeSingle();

    assertUserDataAccountBindingIsCurrent(binding);
    if (!error && data) {
      return normalizeProfileVisibility(data.profile_visibility);
    }
  } catch {
    assertUserDataAccountBindingIsCurrent(binding);
    // local fallback below keeps Settings responsive if remote profile is temporarily unavailable
  }

  const cached = await readAccountValue<UserProfile>(USER_PROFILE_KEY, binding, { username: "", avatarIndex: 0 });
  return normalizeProfileVisibility(cached.profileVisibility);
}

export async function updateMyProfileVisibility(visibility: ProfileVisibility): Promise<ProfileVisibility> {
  const binding = captureUserDataAccountBinding();
  const normalizedVisibility = normalizeProfileVisibility(visibility);
  const userId = getBoundUserId(binding);
  if (!userId) throw new Error("Sign in before updating profile privacy.");

  const existingProfile = await readUserProfile(userId);
  const { error } = await supabase
    .from(USER_PROFILES_TABLE)
    .update({
      profile_visibility: normalizedVisibility,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw error;
  assertUserDataAccountBindingIsCurrent(binding);

  await writeAccountValue(USER_PROFILE_KEY, binding, normalizeUserProfile({
    ...existingProfile,
    profileVisibility: normalizedVisibility,
  }));

  return normalizedVisibility;
}

export async function readMyProfileAccessVisibility(): Promise<AccessVisibility> {
  const binding = captureUserDataAccountBinding();
  const userId = getBoundUserId(binding);
  if (!userId) return "public";

  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select("profile_access_visibility")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  assertUserDataAccountBindingIsCurrent(binding);
  return normalizeAccessVisibility(data?.profile_access_visibility);
}

export async function updateMyProfileAccessVisibility(visibility: AccessVisibility): Promise<AccessVisibility> {
  const binding = captureUserDataAccountBinding();
  const normalizedVisibility = normalizeAccessVisibility(visibility);
  const userId = getBoundUserId(binding);
  if (!userId) throw new Error("Sign in before updating profile visibility.");

  const { error } = await supabase
    .from(USER_PROFILES_TABLE)
    .update({
      profile_access_visibility: normalizedVisibility,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("user_id", userId);

  if (error) throw error;
  assertUserDataAccountBindingIsCurrent(binding);

  const existingProfile = await readUserProfile(userId);
  assertUserDataAccountBindingIsCurrent(binding);
  await writeAccountValue(USER_PROFILE_KEY, binding, normalizeUserProfile({
    ...existingProfile,
    profileAccessVisibility: normalizedVisibility,
  }));

  return normalizedVisibility;
}

export async function readMyPlatformAccessVisibility(): Promise<AccessVisibility> {
  const binding = captureUserDataAccountBinding();
  const userId = getBoundUserId(binding);
  if (!userId) return "public";

  const { data, error } = await supabase
    .from(USER_PROFILES_TABLE)
    .select("platform_access_visibility")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  assertUserDataAccountBindingIsCurrent(binding);
  return normalizeAccessVisibility(data?.platform_access_visibility);
}

export async function updateMyPlatformAccessVisibility(visibility: AccessVisibility): Promise<AccessVisibility> {
  const binding = captureUserDataAccountBinding();
  const normalizedVisibility = normalizeAccessVisibility(visibility);
  const userId = getBoundUserId(binding);
  if (!userId) throw new Error("Sign in before updating Platform visibility.");

  const { error } = await supabase
    .from(USER_PROFILES_TABLE)
    .update({
      platform_access_visibility: normalizedVisibility,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("user_id", userId);

  if (error) throw error;
  assertUserDataAccountBindingIsCurrent(binding);

  const existingProfile = await readUserProfile(userId);
  assertUserDataAccountBindingIsCurrent(binding);
  await writeAccountValue(USER_PROFILE_KEY, binding, normalizeUserProfile({
    ...existingProfile,
    platformAccessVisibility: normalizedVisibility,
  }));

  return normalizedVisibility;
}

export async function updateMyDisplayName(displayName: string): Promise<UserProfile> {
  const binding = captureUserDataAccountBinding();
  const normalizedDisplayName = normalizeTextValue(displayName);
  if (!normalizedDisplayName) throw new Error("Display name is required.");
  if (normalizedDisplayName.length > 60) throw new Error("Display name must be 60 characters or less.");

  const userId = getBoundUserId(binding);
  if (!userId) throw new Error("Sign in before updating your display name.");

  const existingProfile = await readUserProfile(userId);
  const updatedProfile = normalizeUserProfile({
    ...existingProfile,
    displayName: normalizedDisplayName,
  });
  assertUserDataAccountBindingIsCurrent(binding);
  await saveUserProfile(updatedProfile, userId);
  assertUserDataAccountBindingIsCurrent(binding);
  return updatedProfile;
}

export async function saveUserProfile(profile: UserProfile, expectedUserId?: string | null): Promise<void> {
  const binding = captureUserDataAccountBinding();
  const normalized = normalizeUserProfile(profile);
  const userId = getBoundUserId(binding);
  if (expectedUserId !== undefined && userId !== expectedUserId) {
    throw new Error("Account changed before the profile could be saved.");
  }
  logChatProfile("local_profile_save", {
    username: normalized.username,
    displayName: normalized.displayName ?? "",
  });
  await writeAccountValue(USER_PROFILE_KEY, binding, normalized);
  const remoteSynced = await syncUserProfileToRemote(normalized, binding);
  if (remoteSynced) {
    await refreshSignedInIdentitySnapshots(normalized, binding);
  }
}

/** User-initiated Studio saves require server acknowledgement before marking the draft saved. */
export async function saveUserProfileRemote(profile: UserProfile, expectedUserId: string): Promise<void> {
  const binding = captureUserDataAccountBinding();
  const userId = getBoundUserId(binding);
  if (!expectedUserId || userId !== expectedUserId) {
    throw new Error("Account changed before the profile could be saved.");
  }
  const normalized = normalizeUserProfile(profile);
  const remoteSynced = await syncUserProfileToRemote(normalized, binding);
  assertUserDataAccountBindingIsCurrent(binding);
  if (!remoteSynced) {
    throw new Error("Platform details could not be saved. Your changes are still ready to retry.");
  }
  await writeAccountValue(USER_PROFILE_KEY, binding, normalized);
  await refreshSignedInIdentitySnapshots(normalized, binding);
}

// ── Last Party Session (for auto-rejoin) ──────────────────────────────────────

export async function readLastPartySession(): Promise<LastPartySession | null> {
  const binding = captureUserDataAccountBinding();
  const cached = await readAccountValue<LastPartySession | null>(LAST_PARTY_KEY, binding, null);
  return cached;
}

export async function saveLastPartySession(session: LastPartySession): Promise<void> {
  const binding = captureUserDataAccountBinding();
  await writeAccountValue(LAST_PARTY_KEY, binding, session);
}

export async function clearLastPartySession(): Promise<void> {
  const binding = captureUserDataAccountBinding();
  await writeAccountValue(LAST_PARTY_KEY, binding, null);
}
