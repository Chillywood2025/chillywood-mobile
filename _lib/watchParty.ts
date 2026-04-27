import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database, Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

import { readAppConfig, resolveRoomDefaultConfig } from "./appConfig";
import { debugLog, reportRuntimeError } from "./logger";
import {
  createEmptyMonetizationGateResolution,
  readCreatorPermissions,
  sanitizeCreatorRoomAccessRule,
} from "./monetization";
import {
  buildRoomCapabilities,
  deriveWatchPartyStageRole,
  evaluateRoomAccess,
  normalizeCapturePolicy,
  normalizeContentAccessRule,
  normalizeJoinPolicy,
  normalizeReactionsPolicy,
  normalizeRoomMembershipState,
  ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS,
  type CapturePolicy,
  type ContentAccessRule,
  type JoinPolicy,
  type ReactionsPolicy,
  type RoomAccessDecision,
  type RoomMembershipState,
} from "./roomRules";
import { supabase } from "./supabase";
import { readUserProfile } from "./userData";

export type WatchPartyRole = "host" | "viewer";
export type WatchPartyPlaybackState = "playing" | "paused" | "buffering";
export type WatchPartyRoomType = "live" | "title";
export type WatchPartyContentSourceType = "platform_title" | "creator_video";
export type WatchPartyStageRole = "host" | "speaker" | "listener";

export type WatchPartyState = {
  partyId: string;
  roomCode: string;
  roomType: WatchPartyRoomType;
  titleId: string | null;
  sourceType: WatchPartyContentSourceType | null;
  sourceId: string | null;
  hostUserId: string;
  playbackPositionMillis: number;
  playbackState: WatchPartyPlaybackState;
  joinPolicy: JoinPolicy;
  reactionsPolicy: ReactionsPolicy;
  contentAccessRule: ContentAccessRule;
  capturePolicy: CapturePolicy;
  startedAt: string;
  updatedAt: string;
  lastActivityAt: string;
};

export type WatchPartyRoomMembership = {
  partyId: string;
  userId: string;
  role: WatchPartyRole;
  stageRole: WatchPartyStageRole;
  canSpeak: boolean;
  isMuted: boolean;
  membershipState: RoomMembershipState;
  cameraEnabled: boolean;
  micEnabled: boolean;
  displayName?: string;
  avatarUrl?: string;
  cameraPreviewUrl?: string;
  joinedAt: string;
  lastSeenAt: string;
  leftAt?: string;
};

export type WatchPartyRoomSnapshot = {
  room: WatchPartyState;
  memberships: WatchPartyRoomMembership[];
};

export type WatchPartyParticipant = {
  partyId: string;
  userId: string;
  role: WatchPartyRole;
  joinedAt: string;
  lastSeenAt: string;
};

export type WatchPartySyncEvent = {
  id: string;
  partyId: string;
  userId: string;
  kind: "seek" | "play" | "pause" | "join" | "leave" | "reaction";
  playbackPositionMillis: number;
  createdAt: string;
};

export type WatchPartyMessage = {
  id: string;
  partyId: string;
  userId: string;
  kind: "chat" | "reaction" | "system";
  body: string;
  createdAt: string;
};

export type WatchPartyHostAction =
  | { type: "mute_reactions" }
  | { type: "lock_room" }
  | { type: "kick_participant"; userId: string };

export type WatchPartyRoomDraft = {
  roomType?: WatchPartyRoomType;
  titleId?: string | null;
  sourceType?: WatchPartyContentSourceType | null;
  sourceId?: string | null;
  hostUserId: string;
  playbackPositionMillis?: number;
  playbackState?: WatchPartyPlaybackState;
};

export type WatchPartyCreateError = {
  code: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
  payload?: Record<string, unknown>;
};

export type WatchPartyCreateResult =
  | WatchPartyState
  | {
      error: WatchPartyCreateError;
    };

type MembershipUpsertOptions = {
  partyId: string;
  userId?: string;
  role?: WatchPartyRole;
  stageRole?: WatchPartyStageRole;
  canSpeak?: boolean;
  isMuted?: boolean;
  membershipState?: RoomMembershipState;
  cameraEnabled?: boolean;
  micEnabled?: boolean;
  displayName?: string;
  avatarUrl?: string;
  cameraPreviewUrl?: string;
  markJoinedAt?: boolean;
  markLeftAt?: boolean;
};

type WatchPartyRoomCreateOptions = {
  roomType?: WatchPartyRoomType;
  sourceType?: WatchPartyContentSourceType | null;
  sourceId?: string | null;
  joinPolicy?: JoinPolicy;
  reactionsPolicy?: ReactionsPolicy;
  contentAccessRule?: ContentAccessRule;
  capturePolicy?: CapturePolicy;
};

type SetPartyRoomPoliciesOptions = {
  joinPolicy?: JoinPolicy;
  reactionsPolicy?: ReactionsPolicy;
  contentAccessRule?: ContentAccessRule;
  capturePolicy?: CapturePolicy;
};

type SetPartyParticipantStateOptions = {
  role?: WatchPartyRole;
  stageRole?: WatchPartyStageRole;
  canSpeak?: boolean;
  isMuted?: boolean;
  membershipState?: RoomMembershipState;
  cameraEnabled?: boolean;
  micEnabled?: boolean;
  displayName?: string;
  avatarUrl?: string;
  cameraPreviewUrl?: string;
  leftAt?: string | null;
};

export const PARTY_ROOMS_TABLE = "watch_party_rooms";
export const PARTY_SYNC_TABLE = "watch_party_sync_events";
export const WATCH_PARTY_TABLE = "watch_party_rooms";
export const WATCH_PARTY_PARTICIPANTS_TABLE = "watch_party_participants";
export const WATCH_PARTY_ROOM_MEMBERSHIPS_TABLE = "watch_party_room_memberships";
export const WATCH_PARTY_MESSAGES_TABLE = "watch_party_room_messages";
export const WATCH_PARTY_SYNC_TABLE = "watch_party_sync_events";
export const WATCH_PARTY_ACTIVE_MEMBER_WINDOW_MILLIS = ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS;

type WatchPartySyncEventInsert = TablesInsert<"watch_party_sync_events">;
type WatchPartyMessageInsert = TablesInsert<"watch_party_room_messages">;
type WatchPartyMessageRow = Pick<
  Tables<"watch_party_room_messages">,
  "id" | "party_id" | "user_id" | "username" | "text" | "created_at"
>;
type PartyRoomInsert = TablesInsert<"watch_party_rooms">;
type PartyRoomBaseInsert = Pick<
  PartyRoomInsert,
  | "party_id"
  | "room_type"
  | "host_user_id"
  | "title_id"
  | "source_type"
  | "source_id"
  | "playback_position_millis"
  | "playback_state"
  | "started_at"
  | "updated_at"
>;
type PartyRoomUpdate = TablesUpdate<"watch_party_rooms">;
type PartyMembershipInsert = TablesInsert<"watch_party_room_memberships">;
type PartyMembershipUpdate = TablesUpdate<"watch_party_room_memberships">;

type PartyRoomBaseRow = Pick<
  Tables<"watch_party_rooms">,
  | "party_id"
  | "room_type"
  | "host_user_id"
  | "title_id"
  | "source_type"
  | "source_id"
  | "playback_position_millis"
  | "playback_state"
  | "started_at"
  | "updated_at"
>;

type PartyRoomLegacyBaseRow = Pick<
  Tables<"watch_party_rooms">,
  | "party_id"
  | "room_type"
  | "host_user_id"
  | "title_id"
  | "playback_position_millis"
  | "playback_state"
  | "started_at"
  | "updated_at"
>;

type PartyRoomFullRow = PartyRoomBaseRow & Pick<
  Tables<"watch_party_rooms">,
  "join_policy" | "reactions_policy" | "content_access_rule" | "capture_policy" | "last_activity_at"
>;

export type PartyRoomRow = PartyRoomLegacyBaseRow | PartyRoomBaseRow | PartyRoomFullRow;

type PartyMembershipRow = Pick<
  Tables<"watch_party_room_memberships">,
  | "party_id"
  | "user_id"
  | "role"
  | "stage_role"
  | "can_speak"
  | "is_muted"
  | "membership_state"
  | "camera_enabled"
  | "mic_enabled"
  | "display_name"
  | "avatar_url"
  | "camera_preview_url"
  | "joined_at"
  | "last_seen_at"
  | "left_at"
  | "updated_at"
>;

const PARTY_ROOMS_LEGACY_BASE_SELECT =
  "party_id,room_type,host_user_id,title_id,playback_position_millis,playback_state,started_at,updated_at";
const PARTY_ROOMS_BASE_SELECT =
  `${PARTY_ROOMS_LEGACY_BASE_SELECT},source_type,source_id`;
const PARTY_ROOMS_POLICY_SELECT =
  `${PARTY_ROOMS_BASE_SELECT},join_policy,reactions_policy,content_access_rule,capture_policy,last_activity_at`;
const PARTY_ROOM_MEMBERSHIP_SELECT =
  "party_id,user_id,role,stage_role,can_speak,is_muted,membership_state,camera_enabled,mic_enabled,display_name,avatar_url,camera_preview_url,joined_at,last_seen_at,left_at,updated_at";

const PARTY_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GUEST_USER_STORAGE_KEY = "watch_party_guest_user_id_v1";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedGuestUserId: string | null = null;

const isDefined = <T>(value: T | null): value is T => value !== null;
const isNonEmptyString = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.length > 0;

const normalizeWatchPartyContentSourceType = (
  value: string | null | undefined,
): WatchPartyContentSourceType | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "creator_video") return "creator_video";
  if (normalized === "platform_title") return "platform_title";
  return null;
};

export const createPartyId = () => {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}${random}`.toUpperCase();
};

export const createPartyIdentifier = (length = 6) => {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * PARTY_ID_CHARS.length);
    out += PARTY_ID_CHARS[idx];
  }
  return out;
};

const randomHex = (size: number) => {
  let out = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < size; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

const createGuestUuid = () => {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${randomHex(3)}-${randomHex(12)}`;
};

const looksLikeUuid = (value: string) => UUID_REGEX.test(value);

const isMissingColumnError = (error: unknown, column: string) => {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  return new RegExp(`${column}.*column|column.*${column}`, "i").test(message);
};

const isConflictError = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return code === "23505";
};

const isForeignKeyError = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return code === "23503";
};

const toCreateError = (
  error: unknown,
  payload?: Record<string, unknown>,
  fallbackMessage = "Failed to create watch party room",
): WatchPartyCreateError => {
  const raw = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: raw.code ? String(raw.code) : null,
    message: raw.message ? String(raw.message) : fallbackMessage,
    details: raw.details ? String(raw.details) : null,
    hint: raw.hint ? String(raw.hint) : null,
    payload,
  };
};

async function getAuthBackedUserId(): Promise<string | null> {
  try {
    const userResult = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const authUserId = String(userResult.data?.user?.id ?? "").trim();
    if (authUserId && looksLikeUuid(authUserId)) return authUserId;
  } catch {
    // noop
  }

  try {
    const sessionResult = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const sessionUserId = String(sessionResult.data?.session?.user?.id ?? "").trim();
    if (sessionUserId && looksLikeUuid(sessionUserId)) return sessionUserId;
  } catch {
    // noop
  }

  return null;
}

export async function getWritablePartyUserId(): Promise<string | null> {
  return getAuthBackedUserId();
}

export async function getSafePartyUserId(): Promise<string> {
  const authBackedId = await getAuthBackedUserId();
  if (authBackedId) return authBackedId;

  try {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const authUserId = String(data?.session?.user?.id ?? "").trim();
    if (authUserId) return authUserId;
  } catch {
    // noop
  }

  if (cachedGuestUserId) return cachedGuestUserId;

  try {
    const stored = await AsyncStorage.getItem(GUEST_USER_STORAGE_KEY);
    if (stored && stored.trim()) {
      const normalized = stored.trim();
      if (looksLikeUuid(normalized)) {
        cachedGuestUserId = normalized;
        return cachedGuestUserId;
      }

      const migrated = createGuestUuid();
      cachedGuestUserId = migrated;
      await AsyncStorage.setItem(GUEST_USER_STORAGE_KEY, migrated);
      return cachedGuestUserId;
    }
  } catch {
    // noop
  }

  const generated = createGuestUuid();
  cachedGuestUserId = generated;
  try {
    await AsyncStorage.setItem(GUEST_USER_STORAGE_KEY, generated);
  } catch {
    // noop
  }
  return generated;
}

export const createWatchPartyDraft = (draft: WatchPartyRoomDraft): WatchPartyState => {
  const now = new Date().toISOString();
  const partyId = createPartyId();
  const sourceType = normalizeWatchPartyContentSourceType(draft.sourceType)
    ?? (draft.titleId ? "platform_title" : null);
  const roomType: WatchPartyRoomType = draft.roomType ?? (sourceType || draft.titleId ? "title" : "live");
  const titleId = roomType === "title" ? String(draft.titleId ?? "").trim() || null : null;
  const sourceId = roomType === "title"
    ? String(draft.sourceId ?? titleId ?? "").trim() || null
    : null;

  return {
    partyId,
    roomCode: partyId,
    roomType,
    titleId,
    sourceType,
    sourceId,
    hostUserId: draft.hostUserId,
    playbackPositionMillis: Math.max(0, Math.floor(draft.playbackPositionMillis ?? 0)),
    playbackState: draft.playbackState ?? "paused",
    joinPolicy: "open",
    reactionsPolicy: "enabled",
    contentAccessRule: "open",
    capturePolicy: "best_effort",
    startedAt: now,
    updatedAt: now,
    lastActivityAt: now,
  };
};

function rowToState(row: PartyRoomRow): WatchPartyState | null {
  const primaryId = String(row.party_id ?? "").trim();
  const hostUserId = String(row.host_user_id ?? "").trim();
  const titleIdRaw = String(row.title_id ?? "").trim();
  const sourceTypeRaw = "source_type" in row ? String(row.source_type ?? "").trim().toLowerCase() : "";
  const sourceIdRaw = "source_id" in row ? String(row.source_id ?? "").trim() : "";
  const roomTypeRaw = String(row.room_type ?? "").trim().toLowerCase();
  const sourceType = normalizeWatchPartyContentSourceType(sourceTypeRaw)
    ?? (titleIdRaw ? "platform_title" : null);
  const sourceId = sourceType === "platform_title"
    ? (sourceIdRaw || titleIdRaw || null)
    : sourceType === "creator_video"
      ? (sourceIdRaw || null)
      : null;
  const roomType: WatchPartyRoomType =
    roomTypeRaw === "live"
      ? "live"
      : roomTypeRaw === "title"
        ? "title"
        : titleIdRaw || sourceId
          ? "title"
          : "live";
  const joinPolicy = "join_policy" in row ? row.join_policy : undefined;
  const reactionsPolicy = "reactions_policy" in row ? row.reactions_policy : undefined;
  const contentAccessRule = "content_access_rule" in row ? row.content_access_rule : undefined;
  const capturePolicy = "capture_policy" in row ? row.capture_policy : undefined;
  const lastActivityAt = "last_activity_at" in row ? row.last_activity_at : undefined;

  if (!primaryId || !hostUserId) return null;
  if (roomType === "title" && !titleIdRaw && !sourceId) return null;

  const now = new Date().toISOString();

  return {
    partyId: primaryId,
    roomCode: primaryId,
    roomType,
    hostUserId,
    titleId: titleIdRaw || null,
    sourceType,
    sourceId,
    playbackPositionMillis: Math.max(0, Number(row.playback_position_millis ?? 0)),
    playbackState: row.playback_state === "playing" ? "playing" : "paused",
    joinPolicy: normalizeJoinPolicy(joinPolicy),
    reactionsPolicy: normalizeReactionsPolicy(reactionsPolicy),
    contentAccessRule: normalizeContentAccessRule(contentAccessRule),
    capturePolicy: normalizeCapturePolicy(capturePolicy),
    startedAt: String(row.started_at ?? now),
    updatedAt: String(row.updated_at ?? now),
    lastActivityAt: String(lastActivityAt ?? row.updated_at ?? row.started_at ?? now),
  };
}

function rowToMembership(row: PartyMembershipRow): WatchPartyRoomMembership | null {
  const partyId = String(row.party_id ?? "").trim().toUpperCase();
  const userId = String(row.user_id ?? "").trim();
  if (!partyId || !userId) return null;

  const role: WatchPartyRole = String(row.role ?? "").trim().toLowerCase() === "host" ? "host" : "viewer";
  const canSpeak = !!row.can_speak || role === "host";
  const stageRole = deriveWatchPartyStageRole({
    role,
    canSpeak,
    currentStageRole: row.stage_role,
  });
  const now = new Date().toISOString();

  return {
    partyId,
    userId,
    role,
    stageRole,
    canSpeak,
    isMuted: !!row.is_muted,
    membershipState: normalizeRoomMembershipState(row.membership_state),
    cameraEnabled: !!row.camera_enabled,
    micEnabled: typeof row.mic_enabled === "boolean" ? row.mic_enabled : true,
    displayName: String(row.display_name ?? "").trim() || undefined,
    avatarUrl: String(row.avatar_url ?? "").trim() || undefined,
    cameraPreviewUrl: String(row.camera_preview_url ?? "").trim() || undefined,
    joinedAt: String(row.joined_at ?? now),
    lastSeenAt: String(row.last_seen_at ?? row.updated_at ?? row.joined_at ?? now),
    leftAt: String(row.left_at ?? "").trim() || undefined,
  };
}

export function parsePartyRoomPayload(row: PartyRoomRow): WatchPartyState | null {
  return rowToState(row);
}

export function parsePartyMembershipPayload(row: PartyMembershipRow): WatchPartyRoomMembership | null {
  return rowToMembership(row);
}

async function resolvePartyTitleId(inputTitleId: string): Promise<string | null> {
  const raw = String(inputTitleId ?? "").trim();
  if (!raw) return null;

  try {
    const direct = await supabase.from("titles").select("id").eq("id", raw).maybeSingle();
    if (!direct.error && direct.data?.id) return String(direct.data.id);

    const fallbackAny = await supabase.from("titles").select("id").limit(1).maybeSingle();
    if (!fallbackAny.error && fallbackAny.data?.id) return String(fallbackAny.data.id);
  } catch {
    // noop
  }

  return null;
}

async function resolvePartyHostUserId(_inputHostUserId: string): Promise<string | null> {
  return getAuthBackedUserId();
}

async function fetchPartyRoomRow(lookupPartyId: string): Promise<PartyRoomRow | null> {
  const normalizedPartyId = String(lookupPartyId ?? "").trim().toUpperCase();
  if (!normalizedPartyId) return null;

  const query = await supabase
    .from(PARTY_ROOMS_TABLE)
    .select(PARTY_ROOMS_POLICY_SELECT)
    .eq("party_id", normalizedPartyId)
    .returns<PartyRoomFullRow>()
    .maybeSingle();

  if (!query.error && query.data) return query.data;

  if (
    query.error
    && (
      isMissingColumnError(query.error, "join_policy")
      || isMissingColumnError(query.error, "source_type")
      || isMissingColumnError(query.error, "source_id")
    )
  ) {
    const fallback = await supabase
      .from(PARTY_ROOMS_TABLE)
      .select(PARTY_ROOMS_LEGACY_BASE_SELECT)
      .eq("party_id", normalizedPartyId)
      .returns<PartyRoomLegacyBaseRow>()
      .maybeSingle();
    if (!fallback.error && fallback.data) return fallback.data;
  }

  return null;
}

async function resolveWritableUserId(explicitUserId?: string): Promise<string | null> {
  const authBackedId = await getAuthBackedUserId();
  if (authBackedId) return authBackedId;
  const normalizedExplicit = String(explicitUserId ?? "").trim();
  return normalizedExplicit && looksLikeUuid(normalizedExplicit) ? null : null;
}

async function upsertMembership(options: MembershipUpsertOptions): Promise<WatchPartyRoomMembership | null> {
  const writableUserId = await resolveWritableUserId(options.userId);
  if (!writableUserId) return null;

  const now = new Date().toISOString();
  const partyId = String(options.partyId ?? "").trim().toUpperCase();
  if (!partyId) return null;

  const room = await getPartyRoom(partyId);
  if (!room) return null;

  const role: WatchPartyRole = options.role ?? (writableUserId === room.hostUserId ? "host" : "viewer");
  const canSpeak = typeof options.canSpeak === "boolean" ? options.canSpeak : role === "host";
  const stageRole = options.stageRole ?? deriveWatchPartyStageRole({
    role,
    canSpeak,
  });
  const membershipState = options.membershipState ?? "active";

  const payload: PartyMembershipInsert = {
    party_id: partyId,
    user_id: writableUserId,
    role,
    stage_role: stageRole,
    can_speak: canSpeak,
    is_muted: !!options.isMuted,
    membership_state: membershipState,
    camera_enabled: !!options.cameraEnabled,
    mic_enabled: typeof options.micEnabled === "boolean" ? options.micEnabled : true,
    display_name: String(options.displayName ?? "").trim() || null,
    avatar_url: String(options.avatarUrl ?? "").trim() || null,
    camera_preview_url: String(options.cameraPreviewUrl ?? "").trim() || null,
    joined_at: options.markJoinedAt === false ? undefined : now,
    last_seen_at: now,
    left_at: options.markLeftAt ? now : null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(WATCH_PARTY_ROOM_MEMBERSHIPS_TABLE)
    .upsert(payload, { onConflict: "party_id,user_id" })
    .select(PARTY_ROOM_MEMBERSHIP_SELECT)
    .returns<PartyMembershipRow>()
    .single();

  if (error || !data) return null;
  return rowToMembership(data);
}

export async function createPartyRoom(
  titleId: string | null | undefined,
  hostUserId: string,
  positionMillis: number,
  state: "playing" | "paused",
  options?: WatchPartyRoomCreateOptions,
): Promise<WatchPartyCreateResult> {
  const requestedTitleId = String(titleId ?? "").trim();
  const requestedSourceType = normalizeWatchPartyContentSourceType(options?.sourceType);
  const requestedSourceId = String(options?.sourceId ?? "").trim();
  const isCreatorVideoRoom = requestedSourceType === "creator_video";
  const requestedRoomType: WatchPartyRoomType = options?.roomType ?? (isCreatorVideoRoom || requestedTitleId ? "title" : "live");
  const platformTitleRequestId = requestedTitleId || (requestedSourceType === "platform_title" ? requestedSourceId : "");
  const resolvedTitleId = requestedRoomType === "title" && !isCreatorVideoRoom
    ? await resolvePartyTitleId(platformTitleRequestId)
    : null;
  const requestedHostUserId = String(hostUserId ?? "").trim();
  const resolvedHostUserId = await resolvePartyHostUserId(requestedHostUserId);
  const [appConfig, profile] = await Promise.all([
    readAppConfig().catch(() => null),
    readUserProfile().catch(() => null),
  ]);
  const creatorPermissions = await readCreatorPermissions(resolvedHostUserId).catch(() => null);
  const roomDefaults = resolveRoomDefaultConfig(appConfig).watchParty;
  const joinPolicy = normalizeJoinPolicy(
    options?.joinPolicy
      ?? profile?.defaultWatchPartyJoinPolicy
      ?? roomDefaults.joinPolicy,
  );
  const reactionsPolicy = normalizeReactionsPolicy(
    options?.reactionsPolicy
      ?? profile?.defaultWatchPartyReactionsPolicy
      ?? roomDefaults.reactionsPolicy,
  );
  const requestedContentAccessRule = normalizeContentAccessRule(
    options?.contentAccessRule
      ?? profile?.defaultWatchPartyContentAccessRule
      ?? roomDefaults.contentAccessRule,
  );
  const contentAccessRule = normalizeContentAccessRule(
    sanitizeCreatorRoomAccessRule(requestedContentAccessRule, creatorPermissions),
  );
  const capturePolicy = normalizeCapturePolicy(
    options?.capturePolicy
      ?? profile?.defaultWatchPartyCapturePolicy
      ?? roomDefaults.capturePolicy,
  );
  const titleIdCandidates: (string | null)[] =
    requestedRoomType === "live" || isCreatorVideoRoom
      ? [null]
      : Array.from(new Set([resolvedTitleId, platformTitleRequestId].filter(isNonEmptyString)));
  const creatorVideoSourceId = isCreatorVideoRoom ? requestedSourceId : "";
  const hostUserIdCandidates = Array.from(new Set([resolvedHostUserId].filter(isNonEmptyString)));

  if (!hostUserIdCandidates.length) {
    const explicitError = toCreateError(
      { message: "Unable to resolve valid hostUserId for watch party room" },
      { requestedHostUserId, resolvedHostUserId, titleId: requestedTitleId },
    );
    debugLog("watch-party", "createPartyRoom host resolution failed", explicitError);
    return { error: explicitError };
  }

  if (requestedRoomType === "title" && isCreatorVideoRoom && !creatorVideoSourceId) {
    const explicitError = toCreateError(
      { message: "Unable to resolve valid creator video source for watch party room" },
      { requestedSourceType, requestedSourceId },
    );
    debugLog("watch-party", "createPartyRoom creator video source resolution failed", explicitError);
    return { error: explicitError };
  }

  if (requestedRoomType === "title" && !isCreatorVideoRoom && !titleIdCandidates.length) {
    const explicitError = toCreateError(
      { message: "Unable to resolve valid titleId for watch party room" },
      { requestedTitleId, requestedSourceId, resolvedTitleId },
    );
    debugLog("watch-party", "createPartyRoom title resolution failed", explicitError);
    return { error: explicitError };
  }

  let lastError: WatchPartyCreateError | null = null;

  try {
    for (const safeTitleId of titleIdCandidates) {
      for (const safeHostUserId of hostUserIdCandidates) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const generatedPartyId = createPartyIdentifier();
          const now = new Date().toISOString();
          const sourceType: WatchPartyContentSourceType | null = isCreatorVideoRoom
            ? "creator_video"
            : requestedRoomType === "title"
              ? "platform_title"
              : null;
          const sourceId = isCreatorVideoRoom ? creatorVideoSourceId : (safeTitleId ?? null);
          const payload: PartyRoomInsert = {
            party_id: generatedPartyId,
            room_type: requestedRoomType,
            host_user_id: safeHostUserId,
            title_id: safeTitleId,
            source_type: sourceType,
            source_id: sourceId,
            playback_position_millis: Math.max(0, Math.floor(positionMillis)),
            playback_state: state,
            join_policy: joinPolicy,
            reactions_policy: reactionsPolicy,
            content_access_rule: contentAccessRule,
            capture_policy: capturePolicy,
            started_at: now,
            updated_at: now,
            last_activity_at: now,
          };

          const { data, error } = await supabase
            .from(PARTY_ROOMS_TABLE)
            .insert(payload)
            .select(PARTY_ROOMS_POLICY_SELECT)
            .returns<PartyRoomFullRow>()
            .single();

          if (!error && data) {
            const createdState = rowToState(data);
            if (createdState) return createdState;
            lastError = toCreateError(
              { message: "Created room payload missing required fields" },
              { ...payload, source: "createPartyRoom.insert" },
            );
          }

          if (
            error
            && (
              isMissingColumnError(error, "join_policy")
              || isMissingColumnError(error, "source_type")
              || isMissingColumnError(error, "source_id")
            )
            && isCreatorVideoRoom
          ) {
            lastError = toCreateError(error, {
              requestedSourceType,
              requestedSourceId,
              source: "createPartyRoom.creatorVideoMissingSourceColumns",
            });
            debugLog("watch-party", "createPartyRoom creator video insert missing source columns", lastError);
            break;
          }

          if (
            error
            && (
              isMissingColumnError(error, "join_policy")
              || isMissingColumnError(error, "source_type")
              || isMissingColumnError(error, "source_id")
            )
          ) {
            const fallbackPayload: PartyRoomBaseInsert = {
              party_id: generatedPartyId,
              room_type: requestedRoomType,
              host_user_id: safeHostUserId,
              title_id: safeTitleId,
              playback_position_millis: Math.max(0, Math.floor(positionMillis)),
              playback_state: state,
              started_at: now,
              updated_at: now,
            };

            const { data: fallbackData, error: fallbackError } = await supabase
              .from(PARTY_ROOMS_TABLE)
              .insert(fallbackPayload)
              .select(PARTY_ROOMS_LEGACY_BASE_SELECT)
              .returns<PartyRoomLegacyBaseRow>()
              .single();

            if (!fallbackError && fallbackData) {
              const createdState = rowToState(fallbackData);
              if (createdState) return createdState;
            }

            if (fallbackError) {
              lastError = toCreateError(fallbackError, fallbackPayload);
              debugLog("watch-party", "createPartyRoom fallback insert error", lastError);
            }
          } else if (error) {
            lastError = toCreateError(error, payload);
            debugLog("watch-party", "createPartyRoom insert error", lastError);
          }

          if (error && isConflictError(error)) continue;
          if (error && isForeignKeyError(error)) break;
          break;
        }
      }
    }

    return {
      error:
        lastError ??
        toCreateError(
          { message: "Room creation failed without a Supabase error payload" },
            {
              requestedTitleId,
              resolvedTitleId,
              requestedSourceType,
              requestedSourceId,
              titleIdCandidates,
            requestedHostUserId,
            resolvedHostUserId,
            hostUserIdCandidates,
            joinPolicy,
            reactionsPolicy,
            contentAccessRule,
            capturePolicy,
            state,
            positionMillis,
          },
        ),
    };
  } catch (error) {
    const explicitError = toCreateError(error, {
      requestedTitleId,
      resolvedTitleId,
      requestedSourceType,
      requestedSourceId,
      titleIdCandidates,
      requestedHostUserId,
      resolvedHostUserId,
      hostUserIdCandidates,
      joinPolicy,
      reactionsPolicy,
      contentAccessRule,
      capturePolicy,
      state,
      positionMillis,
    });
    reportRuntimeError("watch-party-create-room", error, {
      requestedTitleId,
      resolvedTitleId,
      requestedHostUserId,
      resolvedHostUserId,
      requestedSourceType,
      requestedSourceId,
    });
    return { error: explicitError };
  }
}

export async function getPartyRoom(partyId: string): Promise<WatchPartyState | null> {
  const row = await fetchPartyRoomRow(partyId);
  if (!row) return null;
  return rowToState(row);
}

export async function listPartyRoomMemberships(partyId: string): Promise<WatchPartyRoomMembership[]> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  if (!normalizedPartyId) return [];

  try {
    const { data, error } = await supabase
      .from(WATCH_PARTY_ROOM_MEMBERSHIPS_TABLE)
      .select(PARTY_ROOM_MEMBERSHIP_SELECT)
      .eq("party_id", normalizedPartyId)
      .order("joined_at", { ascending: true })
      .returns<PartyMembershipRow[]>();

    if (error || !data) return [];
    return data.map(rowToMembership).filter(isDefined);
  } catch {
    return [];
  }
}

export async function getPartyRoomSnapshot(partyId: string): Promise<WatchPartyRoomSnapshot | null> {
  const [room, memberships] = await Promise.all([
    getPartyRoom(partyId),
    listPartyRoomMemberships(partyId),
  ]);

  if (!room) return null;
  return { room, memberships };
}

export async function evaluatePartyRoomAccess(options: {
  partyId: string;
  userId?: string;
  room?: WatchPartyState | null;
  membership?: WatchPartyRoomMembership | null;
}): Promise<RoomAccessDecision> {
  const room = options.room ?? await getPartyRoom(options.partyId);
  const writableUserId = await getWritablePartyUserId();
  const safeUserId = String(options.userId ?? writableUserId ?? "").trim();

  if (!room) {
    return {
      canJoin: false,
      reason: "identity_required",
      joinPolicy: "open",
      contentAccessRule: "open",
      capturePolicy: "best_effort",
      requiresAuthIdentity: true,
      monetization: createEmptyMonetizationGateResolution(),
    };
  }

  let membership = options.membership ?? null;
  if (!membership && safeUserId) {
    const memberships = await listPartyRoomMemberships(room.partyId);
    membership = memberships.find((entry) => entry.userId === safeUserId) ?? null;
  }

  return evaluateRoomAccess({
    partyId: room.partyId,
    room,
    membership: membership ? { ...membership, userId: safeUserId } : null,
    hasWritableIdentity: !!writableUserId,
  });
}

export async function joinPartyRoomSession(options: MembershipUpsertOptions): Promise<WatchPartyRoomMembership | null> {
  return upsertMembership({
    ...options,
    membershipState: "active",
    markJoinedAt: true,
    markLeftAt: false,
  });
}

export async function touchPartyRoomSession(options: MembershipUpsertOptions): Promise<WatchPartyRoomMembership | null> {
  return upsertMembership({
    ...options,
    membershipState: options.membershipState ?? "active",
    markJoinedAt: false,
    markLeftAt: false,
  });
}

export async function leavePartyRoomSession(options: MembershipUpsertOptions): Promise<WatchPartyRoomMembership | null> {
  return upsertMembership({
    ...options,
    membershipState: options.membershipState ?? "left",
    markJoinedAt: false,
    markLeftAt: true,
    canSpeak: false,
    stageRole: options.role === "host" ? "host" : "listener",
  });
}

export async function setPartyRoomPolicies(
  partyId: string,
  policies: SetPartyRoomPoliciesOptions,
): Promise<WatchPartyState | null> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  const writableUserId = await getWritablePartyUserId();
  if (!normalizedPartyId || !writableUserId) return null;
  const creatorPermissions = await readCreatorPermissions(writableUserId).catch(() => null);

  const now = new Date().toISOString();
  const updates: PartyRoomUpdate = {
    updated_at: now,
    last_activity_at: now,
  };

  if (policies.joinPolicy) updates.join_policy = normalizeJoinPolicy(policies.joinPolicy);
  if (policies.reactionsPolicy) updates.reactions_policy = normalizeReactionsPolicy(policies.reactionsPolicy);
  if (policies.contentAccessRule) {
    updates.content_access_rule = normalizeContentAccessRule(
      sanitizeCreatorRoomAccessRule(policies.contentAccessRule, creatorPermissions),
    );
  }
  if (policies.capturePolicy) updates.capture_policy = normalizeCapturePolicy(policies.capturePolicy);

  const { data, error } = await supabase
    .from(PARTY_ROOMS_TABLE)
    .update(updates)
    .eq("party_id", normalizedPartyId)
    .eq("host_user_id", writableUserId)
    .select(PARTY_ROOMS_POLICY_SELECT)
    .returns<PartyRoomFullRow>()
    .single();

  if (error || !data) return null;
  return rowToState(data);
}

export async function setPartyParticipantState(
  partyId: string,
  targetUserId: string,
  changes: SetPartyParticipantStateOptions,
): Promise<WatchPartyRoomMembership | null> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  const normalizedTargetUserId = String(targetUserId ?? "").trim();
  const writableUserId = await getWritablePartyUserId();
  if (!normalizedPartyId || !normalizedTargetUserId || !writableUserId) return null;

  const now = new Date().toISOString();
  const updates: PartyMembershipUpdate = {
    updated_at: now,
    last_seen_at: now,
  };

  if (changes.role) updates.role = changes.role === "host" ? "host" : "viewer";
  if (changes.canSpeak !== undefined) updates.can_speak = !!changes.canSpeak;
  if (changes.isMuted !== undefined) updates.is_muted = !!changes.isMuted;
  if (changes.membershipState) updates.membership_state = normalizeRoomMembershipState(changes.membershipState);
  if (changes.cameraEnabled !== undefined) updates.camera_enabled = !!changes.cameraEnabled;
  if (changes.micEnabled !== undefined) updates.mic_enabled = !!changes.micEnabled;
  if (changes.displayName !== undefined) updates.display_name = String(changes.displayName ?? "").trim() || null;
  if (changes.avatarUrl !== undefined) updates.avatar_url = String(changes.avatarUrl ?? "").trim() || null;
  if (changes.cameraPreviewUrl !== undefined) updates.camera_preview_url = String(changes.cameraPreviewUrl ?? "").trim() || null;
  if (changes.leftAt !== undefined) updates.left_at = changes.leftAt;

  const nextRole = String(updates.role ?? "").trim().toLowerCase();
  const nextCanSpeak = typeof updates.can_speak === "boolean" ? updates.can_speak : changes.canSpeak;
  updates.stage_role = changes.stageRole ?? deriveWatchPartyStageRole({
    role: nextRole || undefined,
    canSpeak: nextCanSpeak,
  });

  const { data, error } = await supabase
    .from(WATCH_PARTY_ROOM_MEMBERSHIPS_TABLE)
    .update(updates)
    .eq("party_id", normalizedPartyId)
    .eq("user_id", normalizedTargetUserId)
    .select(PARTY_ROOM_MEMBERSHIP_SELECT)
    .returns<PartyMembershipRow>()
    .single();

  if (error || !data) {
    reportRuntimeError("watch-party-set-participant-state", error ?? new Error("Missing membership row"), {
      partyId: normalizedPartyId,
      targetUserId: normalizedTargetUserId,
      writableUserId,
      updates,
    });
    return null;
  }
  return rowToMembership(data);
}

export async function updateRoomPlayback(
  partyId: string,
  positionMillis: number,
  state: "playing" | "paused",
): Promise<void> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  const writableUserId = await getWritablePartyUserId();
  if (!normalizedPartyId || !writableUserId) return;

  try {
    const updates: PartyRoomUpdate = {
      playback_position_millis: Math.max(0, Math.floor(positionMillis)),
      playback_state: state,
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    };

    await supabase
      .from(PARTY_ROOMS_TABLE)
      .update(updates)
      .eq("party_id", normalizedPartyId)
      .eq("host_user_id", writableUserId);
  } catch {
    // noop
  }
}

export async function emitSyncEvent(
  partyId: string,
  userId: string,
  kind: WatchPartySyncEvent["kind"],
  positionMillis: number,
): Promise<void> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  const writableUserId = await resolveWritableUserId(userId);
  if (!normalizedPartyId || !writableUserId) return;

  try {
    const payload: WatchPartySyncEventInsert = {
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      party_id: normalizedPartyId,
      user_id: writableUserId,
      kind,
      playback_position_millis: Math.max(0, Math.floor(positionMillis)),
      created_at: new Date().toISOString(),
    };

    await supabase.from(PARTY_SYNC_TABLE).insert(payload);
  } catch {
    // noop
  }
}

export async function sendPartyMessage(
  partyId: string,
  userId: string,
  kind: WatchPartyMessage["kind"],
  body: string,
  options?: { username?: string },
): Promise<boolean> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  const writableUserId = await resolveWritableUserId(userId);
  if (!normalizedPartyId || !writableUserId) return false;

  const safeBody = String(body ?? "").trim();
  if (!safeBody) return false;

  try {
    const payload: WatchPartyMessageInsert = {
      party_id: normalizedPartyId,
      user_id: writableUserId,
      username: String(options?.username ?? "Guest").trim() || "Guest",
      text: kind === "reaction" ? safeBody : safeBody,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from(WATCH_PARTY_MESSAGES_TABLE).insert(payload);
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

export async function fetchPartyMessages(
  partyId: string,
  limit = 100,
): Promise<WatchPartyMessage[]> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  if (!normalizedPartyId) return [];

  try {
    const { data, error } = await supabase
      .from(WATCH_PARTY_MESSAGES_TABLE)
      .select("id,party_id,user_id,username,text,created_at")
      .eq("party_id", normalizedPartyId)
      .order("created_at", { ascending: true })
      .limit(limit)
      .returns<WatchPartyMessageRow[]>();

    if (error || !data) return [];

    return data.map((row) => ({
      id: String(row.id ?? ""),
      partyId: String(row.party_id ?? normalizedPartyId),
      userId: String(row.user_id ?? ""),
      kind: "chat",
      body: String(row.text ?? ""),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

export async function applyHostAction(
  partyId: string,
  action: WatchPartyHostAction,
): Promise<void> {
  if (action.type === "mute_reactions") {
    await setPartyRoomPolicies(partyId, { reactionsPolicy: "muted" });
    return;
  }

  if (action.type === "lock_room") {
    await setPartyRoomPolicies(partyId, { joinPolicy: "locked" });
    return;
  }

  if (action.type === "kick_participant") {
    await setPartyParticipantState(partyId, action.userId, {
      membershipState: "removed",
      canSpeak: false,
      isMuted: true,
      stageRole: "listener",
      leftAt: new Date().toISOString(),
    });
  }
}

export const getActivePartyMemberships = (memberships: WatchPartyRoomMembership[]) =>
  memberships.filter((membership) => {
    const state = normalizeRoomMembershipState(membership.membershipState);
    if (state !== "active" && state !== "reconnecting") return false;
    const lastSeenAt = new Date(membership.lastSeenAt).getTime();
    if (!Number.isFinite(lastSeenAt)) return state === "active";
    return Date.now() - lastSeenAt <= WATCH_PARTY_ACTIVE_MEMBER_WINDOW_MILLIS;
  });

export const getPartyRoomCapabilities = async (options: {
  partyId: string;
  userId?: string;
  room?: WatchPartyState | null;
  membership?: WatchPartyRoomMembership | null;
}) => {
  const access = await evaluatePartyRoomAccess(options);
  return buildRoomCapabilities({
    access,
    hostUserId: options.room?.hostUserId,
    membership: options.membership ? { ...options.membership, userId: options.userId ?? options.membership.userId } : undefined,
  });
};
