import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

import { readAppConfig, resolveRoomDefaultConfig } from "./appConfig";
import { runKeyedSingleFlight } from "./actionSingleFlight.mjs";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { debugLog, reportRuntimeError } from "./logger";
import {
  createEmptyMonetizationGateResolution,
  readCreatorPermissions,
  sanitizeCreatorRoomAccessRule,
} from "./monetization";
import {
  getRuntimeControlBlockedCopy,
  isRuntimeControlBlockedAccess,
  LIVE_FIRST_PREMIUM_UPSELL_COPY,
  WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY,
  requireLiveFirstPremium,
  requireWatchPartyLivePremium,
  type PremiumWatchPartyFeatureAccessDecision,
} from "./premiumWatchPartyAccess";
import {
  ROOM_ACTIVITY_ACTIVE_WINDOW_MS,
  ROOM_HEARTBEAT_MS,
  ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS,
} from "./performancePolicy";
import { isPubliclyReleasedTitle } from "./publicTitles";
import {
  resolvePaidWatchPartyTicketAccess,
  type PaidWatchPartyTicketAccess,
} from "./paidWatchPartyTickets";
import {
  buildRoomCapabilities,
  deriveWatchPartyStageRole,
  evaluateRoomAccess,
  normalizeCapturePolicy,
  normalizeContentAccessRule,
  normalizeJoinPolicy,
  normalizeReactionsPolicy,
  normalizeRoomMembershipState,
  type CapturePolicy,
  type ContentAccessRule,
  type JoinPolicy,
  type ReactionsPolicy,
  type RoomAccessDecision,
  type RoomMembershipState,
} from "./roomRules";
import {
  readSocialAttachmentsForSurfaces,
  type SocialAttachment,
} from "./socialAttachments";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";
import { AccountBoundSupabaseMutationError, assertAccountBoundSupabaseMutationSubjectCurrent, captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc, runExactSessionAccountBoundSupabaseMutationRpc, type AccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { readUserProfile } from "./userData";
import { setWatchPartyHostSettings } from "./watchPartyHostSettings";
export {
  PARTY_SEAT_REQUEST_MESSAGE_PREFIX,
  PARTY_SEAT_REQUEST_MESSAGE_TTL_MILLIS,
  decodePartySeatRequestMessage,
  encodePartySeatRequestMessage,
  type WatchPartySeatRequestMarker,
} from "./watch-party/watch-party-live-source-truth";

export type WatchPartyRole = "host" | "viewer";
export type WatchPartyPlaybackState = "playing" | "paused" | "buffering";
export type WatchPartyRoomType = "live" | "title";
export type WatchPartyDiscoveryVisibility = "public" | "circle" | "private";
export type WatchPartyContentSourceType = "platform_title" | "creator_video" | "spectator_playback";
export type WatchPartyStageRole = "host" | "speaker" | "listener";

export type WatchPartyState = {
  partyId: string;
  roomCode: string;
  roomType: WatchPartyRoomType;
  titleId: string | null;
  sourceType: WatchPartyContentSourceType | null;
  sourceId: string | null;
  discoveryVisibility: WatchPartyDiscoveryVisibility;
  /** Undefined on older servers: never guess paused listing authority. */
  discoveryPaused?: boolean | null;
  discoveryTitle: string | null;
  discoveryStartedAt: string | null;
  /** Missing until the server supports revision-bound host settings. */
  roomGeneration?: string | null;
  hostSettingsRevision?: number | null;
  hostUserId: string;
  playbackPositionMillis: number;
  playbackState: WatchPartyPlaybackState;
  joinPolicy: JoinPolicy;
  reactionsPolicy: ReactionsPolicy;
  contentAccessRule: ContentAccessRule;
  capturePolicy: CapturePolicy;
  isActive: boolean;
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
  hostMuted: boolean;
  selfMuted: boolean;
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
  displayCreatedAt?: string | null;
  attachments: SocialAttachment[];
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
  preserveHostAuthority?: boolean;
  exactTicketViewerUserId?: string;
};

type WatchPartyRoomCreateOptions = {
  roomType?: WatchPartyRoomType;
  sourceType?: WatchPartyContentSourceType | null;
  sourceId?: string | null;
  joinPolicy?: JoinPolicy;
  reactionsPolicy?: ReactionsPolicy;
  contentAccessRule?: ContentAccessRule;
  capturePolicy?: CapturePolicy;
  discoveryVisibility?: WatchPartyDiscoveryVisibility;
  discoveryPaused?: boolean;
  discoveryTitle?: string | null;
};

type SetPartyRoomPoliciesOptions = {
  joinPolicy?: JoinPolicy;
  reactionsPolicy?: ReactionsPolicy;
  contentAccessRule?: ContentAccessRule;
  capturePolicy?: CapturePolicy;
  discoveryVisibility?: WatchPartyDiscoveryVisibility;
  discoveryPaused?: boolean;
  discoveryTitle?: string | null;
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

const canWatchPartyMembershipPublishMedia = (options: {
  role?: unknown;
  stageRole?: unknown;
  canSpeak?: unknown;
  isMuted?: unknown;
  membershipState?: unknown;
}) => {
  const role = String(options.role ?? "").trim().toLowerCase();
  const stageRole = String(options.stageRole ?? "").trim().toLowerCase();
  const membershipState = normalizeRoomMembershipState(options.membershipState);
  if (membershipState === "removed" || membershipState === "left") return false;
  if (options.isMuted) return false;
  return role === "host" || stageRole === "host" || stageRole === "speaker" || !!options.canSpeak;
};

export const PARTY_ROOMS_TABLE = "watch_party_rooms";
export const PARTY_SYNC_TABLE = "watch_party_sync_events";
export const WATCH_PARTY_TABLE = "watch_party_rooms";
export const WATCH_PARTY_PARTICIPANTS_TABLE = "watch_party_participants";
export const WATCH_PARTY_ROOM_MEMBERSHIPS_TABLE = "watch_party_room_memberships";
export const WATCH_PARTY_MESSAGES_TABLE = "watch_party_room_messages";
export const WATCH_PARTY_SYNC_TABLE = "watch_party_sync_events";
export const WATCH_PARTY_ACTIVE_MEMBER_WINDOW_MILLIS = ROOM_MEMBERSHIP_ACTIVE_WINDOW_MS;
export const WATCH_PARTY_ROOM_ACTIVE_WINDOW_MILLIS = ROOM_ACTIVITY_ACTIVE_WINDOW_MS;
export const WATCH_PARTY_ROOM_HEARTBEAT_MILLIS = ROOM_HEARTBEAT_MS;
type WatchPartySyncEventInsert = TablesInsert<"watch_party_sync_events">;
type WatchPartyMessageInsert = TablesInsert<"watch_party_room_messages">;
type WatchPartyMessageRow = Pick<
  Tables<"watch_party_room_messages">,
  "id" | "party_id" | "user_id" | "username" | "text" | "created_at"
>;
type PartyRoomInsert = TablesInsert<"watch_party_rooms"> & {
  discovery_visibility?: WatchPartyDiscoveryVisibility;
  discovery_title?: string | null;
};
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
  | "is_active"
  | "started_at"
  | "updated_at"
>;
type PartyRoomUpdate = TablesUpdate<"watch_party_rooms"> & {
  discovery_visibility?: WatchPartyDiscoveryVisibility;
  discovery_title?: string | null;
};

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
  | "is_active"
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
  | "is_active"
  | "started_at"
  | "updated_at"
>;

type PartyRoomFullRow = PartyRoomBaseRow & Pick<
  Tables<"watch_party_rooms">,
  "join_policy" | "reactions_policy" | "content_access_rule" | "capture_policy" | "last_activity_at"
> & {
  discovery_visibility?: string | null;
  discovery_paused?: boolean | null;
  discovery_title?: string | null;
  discovery_started_at?: string | null;
  room_generation?: string | null;
  host_settings_revision?: number | null;
};

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
> & {
  host_muted?: boolean | null;
  self_muted?: boolean | null;
};

const PARTY_ROOMS_LEGACY_BASE_SELECT =
  "party_id,room_type,host_user_id,title_id,playback_position_millis,playback_state,is_active,started_at,updated_at";
const PARTY_ROOMS_BASE_SELECT =
  `${PARTY_ROOMS_LEGACY_BASE_SELECT},source_type,source_id`;
const PARTY_ROOMS_POLICY_SELECT =
  `${PARTY_ROOMS_BASE_SELECT},join_policy,reactions_policy,content_access_rule,capture_policy,last_activity_at,discovery_visibility,discovery_title,discovery_started_at`;
const PARTY_ROOMS_HOST_SETTINGS_SELECT = `${PARTY_ROOMS_POLICY_SELECT},room_generation,host_settings_revision,discovery_paused`;
const PARTY_ROOM_MEMBERSHIP_SELECT =
  "party_id,user_id,role,stage_role,can_speak,is_muted,host_muted,self_muted,membership_state,camera_enabled,mic_enabled,display_name,avatar_url,camera_preview_url,joined_at,last_seen_at,left_at,updated_at";

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
  if (normalized === "spectator_playback") return "spectator_playback";
  return null;
};

const normalizeWatchPartyDiscoveryVisibility = (
  value: unknown,
): WatchPartyDiscoveryVisibility => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "public" || normalized === "circle") return normalized;
  return "private";
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

export const resolvePremiumAccessKeyForRoom = (
  room: Pick<WatchPartyState, "partyId" | "roomType" | "titleId" | "sourceId">,
) => {
  if (room.roomType === "live") return room.partyId || "live-first";
  return room.sourceId || room.titleId || room.partyId || "watch-party-live";
};

const requirePremiumAccessForRoomType = async (
  roomType: WatchPartyRoomType,
  accessKey: string | null | undefined,
): Promise<PremiumWatchPartyFeatureAccessDecision> => (
  roomType === "live"
    ? requireLiveFirstPremium({ accessKey: accessKey || "live-first" })
    : requireWatchPartyLivePremium({ accessKey: accessKey || "watch-party-live" })
);

const requirePremiumAccessForRoom = async (room: WatchPartyState) => (
  requirePremiumAccessForRoomType(room.roomType, resolvePremiumAccessKeyForRoom(room))
);

const toPremiumRoomCreateError = (
  roomType: WatchPartyRoomType,
  access: PremiumWatchPartyFeatureAccessDecision,
  payload: Record<string, unknown>,
): WatchPartyCreateError => {
  const runtimeBlockedCopy = isRuntimeControlBlockedAccess(access)
    ? getRuntimeControlBlockedCopy(access)
    : null;

  return {
    code: access.reason,
    message: runtimeBlockedCopy?.message
      ?? (roomType === "live"
        ? LIVE_FIRST_PREMIUM_UPSELL_COPY.message
        : WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY.message),
    details: null,
    hint: null,
    payload: {
      ...payload,
      requiresPremium: !runtimeBlockedCopy,
      monetizationReason: access.reason,
      runtimeControlKey: access.runtimeControlKey ?? null,
    },
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

async function getServerVerifiedUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    const userId = String(data?.user?.id ?? "").trim();
    return userId && looksLikeUuid(userId) ? userId : null;
  } catch {
    return null;
  }
}

export async function getWritablePartyUserId(): Promise<string | null> {
  return getAuthBackedUserId();
}

type PartyRoomSessionAdmission =
  | { source: "premium" }
  | { source: "room_host" }
  | { source: "exact_paid_ticket"; userId: string };

type TitleRoomSeatResolution =
  | { status: "room_host"; userId: string }
  | { status: "exact_paid_ticket"; userId: string }
  | { status: "free_room"; userId: string }
  | { status: "blocked" };

export const paidWatchPartyTicketAllowsExactRoomViewerAccess = (
  access: PaidWatchPartyTicketAccess | null | undefined,
  partyId: string,
) => {
  const expectedPartyId = String(partyId ?? "").trim().toUpperCase();
  if (access?.reason === "verified_reserved_room_admission") {
    return !!expectedPartyId && access.allowed === true && access.requiresPurchase === false
      && String(access.partyId ?? "").trim().toUpperCase() === expectedPartyId
      && UUID_REGEX.test(String(access.reservedSeatClaimId ?? ""))
      && UUID_REGEX.test(String(access.roomSessionId ?? ""))
      && access.ticketId === null && access.offer === null;
  }
  const boundPartyId = String(access?.offer?.partyId ?? "").trim().toUpperCase();
  const now = Date.now();
  const startsAt = access?.offer?.startsAt ? Date.parse(access.offer.startsAt) : null;
  const endsAt = access?.offer?.endsAt ? Date.parse(access.offer.endsAt) : null;
  return !!expectedPartyId
    && access?.allowed === true
    && access.reason === "ticket_confirmed"
    && access.requiresPurchase === false
    && UUID_REGEX.test(String(access.ticketId ?? "").trim())
    && UUID_REGEX.test(String(access.offer?.id ?? "").trim())
    && UUID_REGEX.test(String(access.offer?.creatorId ?? "").trim())
    && UUID_REGEX.test(String(access.offer?.hostId ?? "").trim())
    && boundPartyId === expectedPartyId
    && access.creatorId === access.offer?.creatorId
    && typeof access.priceCents === "number"
    && Number.isSafeInteger(access.priceCents)
    && (access.priceCents ?? 0) > 0
    && access.priceCents === access.offer?.priceCents
    && /^[a-z]{3}$/.test(String(access.currency ?? ""))
    && access.currency === access.offer?.currency
    && (access.provider === "revenuecat_app_store" || access.provider === "revenuecat_google_play")
    && access.provider === access.offer?.provider
    && !!String(access.providerProductId ?? "")
    && access.providerProductId === access.offer?.providerProductId
    && !!String(access.providerProductKey ?? "")
    && access.providerProductKey === access.offer?.providerProductKey
    && ["sandbox", "active", "sold_out"].includes(String(access.offer?.status ?? ""))
    && (startsAt === null || (Number.isFinite(startsAt) && startsAt <= now))
    && (endsAt === null || (Number.isFinite(endsAt) && endsAt > now));
};

export const paidWatchPartyResolutionIsExactFreeRoom = (
  access: PaidWatchPartyTicketAccess | null | undefined,
) => access?.allowed === true
  && access.reason === "free_room"
  && access.requiresPurchase === false
  && access.ticketId === null
  && access.priceCents === null
  && access.currency === null
  && access.creatorId === null
  && access.provider === null
  && access.providerProductId === null
  && access.providerProductKey === null
  && access.offer === null;

const resolveTitleRoomSeatAccess = async (
  room: WatchPartyState,
  expectedUserId?: string | null,
): Promise<TitleRoomSeatResolution> => {
  if (room.roomType !== "title") return { status: "blocked" };

  const userIdBeforeRead = await getServerVerifiedUserId();
  const normalizedExpectedUserId = String(expectedUserId ?? "").trim();
  if (!userIdBeforeRead || (normalizedExpectedUserId && userIdBeforeRead !== normalizedExpectedUserId)) {
    return { status: "blocked" };
  }
  if (userIdBeforeRead === String(room.hostUserId ?? "").trim()) {
    return { status: "room_host", userId: userIdBeforeRead };
  }
  const ticketAccess = await resolvePaidWatchPartyTicketAccess(room.partyId).catch(() => null);
  const userIdAfterRead = await getServerVerifiedUserId();
  if (userIdAfterRead !== userIdBeforeRead) return { status: "blocked" };
  if (paidWatchPartyTicketAllowsExactRoomViewerAccess(ticketAccess, room.partyId)) {
    return { status: "exact_paid_ticket", userId: userIdBeforeRead };
  }
  if (paidWatchPartyResolutionIsExactFreeRoom(ticketAccess)) {
    return { status: "free_room", userId: userIdBeforeRead };
  }
  return { status: "blocked" };
};

const resolvePartyRoomSessionAdmission = async (
  room: WatchPartyState,
): Promise<PartyRoomSessionAdmission | null> => {
  if (room.roomType === "title") {
    const seatAccess = await resolveTitleRoomSeatAccess(room);
    if (seatAccess.status === "room_host") return { source: "room_host" };
    if (seatAccess.status === "exact_paid_ticket") {
      return { source: "exact_paid_ticket", userId: seatAccess.userId };
    }
    if (seatAccess.status !== "free_room") return null;
  }

  const premiumAccess = await requirePremiumAccessForRoom(room).catch(() => null);
  return premiumAccess?.allowed ? { source: "premium" } : null;
};

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
    discoveryVisibility: "private",
    discoveryTitle: null,
    discoveryStartedAt: null,
    hostUserId: draft.hostUserId,
    playbackPositionMillis: Math.max(0, Math.floor(draft.playbackPositionMillis ?? 0)),
    playbackState: draft.playbackState ?? "paused",
    joinPolicy: "open",
    reactionsPolicy: "enabled",
    contentAccessRule: "open",
    capturePolicy: "best_effort",
    isActive: true,
    startedAt: now,
    updatedAt: now,
    lastActivityAt: now,
  };
};

const toTimeMillis = (value?: string | null) => {
  const parsed = Date.parse(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const getWatchPartyRoomActivityMillis = (room: Pick<WatchPartyState, "lastActivityAt" | "updatedAt" | "startedAt">) => (
  toTimeMillis(room.lastActivityAt)
  ?? toTimeMillis(room.updatedAt)
  ?? toTimeMillis(room.startedAt)
);

export const isWatchPartyRoomActive = (
  room: Pick<WatchPartyState, "isActive" | "lastActivityAt" | "updatedAt" | "startedAt"> | null | undefined,
  nowMillis = Date.now(),
) => {
  if (!room?.isActive) return false;
  const activityMillis = getWatchPartyRoomActivityMillis(room);
  if (activityMillis === null) return false;
  return nowMillis - activityMillis <= WATCH_PARTY_ROOM_ACTIVE_WINDOW_MILLIS;
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
    : sourceType === "creator_video" || sourceType === "spectator_playback"
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
  const isActive = !("is_active" in row) || row.is_active !== false;
  const lastActivityAt = "last_activity_at" in row ? row.last_activity_at : undefined;
  const discoveryVisibility = "discovery_visibility" in row
    ? normalizeWatchPartyDiscoveryVisibility(row.discovery_visibility)
    : "private";
  const discoveryTitle = "discovery_title" in row
    ? String(row.discovery_title ?? "").trim() || null
    : null;
  const discoveryStartedAt = "discovery_started_at" in row
    ? String(row.discovery_started_at ?? "").trim() || null
    : null;

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
    discoveryVisibility,
    discoveryPaused: "discovery_paused" in row && typeof row.discovery_paused === "boolean" ? row.discovery_paused : null,
    discoveryTitle,
    discoveryStartedAt,
    roomGeneration: "room_generation" in row && typeof row.room_generation === "string" ? row.room_generation : null,
    hostSettingsRevision: "host_settings_revision" in row && Number.isSafeInteger(row.host_settings_revision)
      && Number(row.host_settings_revision) >= 0 ? Number(row.host_settings_revision) : null,
    playbackPositionMillis: Math.max(0, Number(row.playback_position_millis ?? 0)),
    playbackState: row.playback_state === "playing" ? "playing" : "paused",
    joinPolicy: normalizeJoinPolicy(joinPolicy),
    reactionsPolicy: normalizeReactionsPolicy(reactionsPolicy),
    contentAccessRule: normalizeContentAccessRule(contentAccessRule),
    capturePolicy: normalizeCapturePolicy(capturePolicy),
    isActive,
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
  const canPublishMedia = canWatchPartyMembershipPublishMedia({
    role,
    stageRole,
    canSpeak,
    isMuted: row.is_muted,
    membershipState: row.membership_state,
  });
  const now = new Date().toISOString();

  return {
    partyId,
    userId,
    role,
    stageRole,
    canSpeak,
    isMuted: !!row.is_muted,
    hostMuted: !!row.host_muted,
    selfMuted: !!row.self_muted,
    membershipState: normalizeRoomMembershipState(row.membership_state),
    cameraEnabled: canPublishMedia && !!row.camera_enabled,
    micEnabled: canPublishMedia && (typeof row.mic_enabled === "boolean" ? row.mic_enabled : role === "host"),
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
    const direct = await supabase
      .from("titles")
      .select("id,is_published,status,release_at,release_date")
      .eq("id", raw)
      .maybeSingle();
    if (!direct.error && direct.data?.id && isPubliclyReleasedTitle(direct.data)) {
      return String(direct.data.id);
    }
  } catch {
    // noop
  }

  return null;
}

async function fetchPartyRoomRow(lookupPartyId: string): Promise<PartyRoomRow | null> {
  const normalizedPartyId = String(lookupPartyId ?? "").trim().toUpperCase();
  if (!normalizedPartyId) return null;

  let query = await supabase
    .from(PARTY_ROOMS_TABLE)
    .select(PARTY_ROOMS_HOST_SETTINGS_SELECT)
    .eq("party_id", normalizedPartyId)
    .returns<PartyRoomFullRow>()
    .maybeSingle();

  // Older servers may still serve the room, but cannot expose editable host
  // settings without generation/revision authority. Never guess that authority.
  if (query.error && (isMissingColumnError(query.error, "room_generation")
    || isMissingColumnError(query.error, "host_settings_revision") || isMissingColumnError(query.error, "discovery_paused"))) {
    query = await supabase.from(PARTY_ROOMS_TABLE).select(PARTY_ROOMS_POLICY_SELECT)
      .eq("party_id", normalizedPartyId).returns<PartyRoomFullRow>().maybeSingle();
  }

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

  // Exact room links/codes are not directory queries. The server may return a
  // scoped entry preview even when the room is intentionally absent from RLS
  // listings; it independently checks current account, blocks and Circle.
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject();
    const { data, error } = await invokeAccountBoundSupabaseMutationRpc<PartyRoomFullRow[]>(subject,
      "resolve_watch_party_room_entry", { p_party_id: normalizedPartyId,
        p_session_generation: subject.authority.sessionGeneration });
    const row = !error && Array.isArray(data) && data.length === 1 ? data[0] : null;
    return row?.party_id === normalizedPartyId ? row : null;
  } catch { return null; }
}

async function fetchPartyMembershipRow(partyId: string, userId: string): Promise<PartyMembershipRow | null> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedPartyId || !normalizedUserId) return null;

  try {
    const { data, error } = await supabase
      .from(WATCH_PARTY_ROOM_MEMBERSHIPS_TABLE)
      .select(PARTY_ROOM_MEMBERSHIP_SELECT)
      .eq("party_id", normalizedPartyId)
      .eq("user_id", normalizedUserId)
      .returns<PartyMembershipRow>()
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

async function resolveWritableUserId(explicitUserId?: string): Promise<string | null> {
  const authBackedId = await getAuthBackedUserId();
  if (authBackedId) return authBackedId;
  const normalizedExplicit = String(explicitUserId ?? "").trim();
  return normalizedExplicit && looksLikeUuid(normalizedExplicit) ? null : null;
}

async function upsertMembership(options: MembershipUpsertOptions): Promise<WatchPartyRoomMembership | null> {
  const exactTicketViewerUserId = String(options.exactTicketViewerUserId ?? "").trim();
  const writableUserId = exactTicketViewerUserId
    ? await getServerVerifiedUserId()
    : await resolveWritableUserId(options.userId);
  if (!writableUserId) return null;
  if (exactTicketViewerUserId && exactTicketViewerUserId !== writableUserId) return null;

  const partyId = String(options.partyId ?? "").trim().toUpperCase();
  if (!partyId) return null;
  const isLeaving = options.markLeftAt === true;
  const isJoining = options.markJoinedAt !== false && !isLeaving;
  const result = isJoining
    ? await runExactSessionAccountBoundSupabaseMutationRpc<PartyMembershipRow[] | PartyMembershipRow>("join_watch_party_room_session", {
      p_party_id: partyId,
      p_display_name: String(options.displayName ?? "").trim() || null,
      p_avatar_url: String(options.avatarUrl ?? "").trim() || null,
      p_camera_preview_url: String(options.cameraPreviewUrl ?? "").trim() || null,
      p_camera_enabled: !!options.cameraEnabled,
      p_mic_enabled: typeof options.micEnabled === "boolean" ? options.micEnabled : true,
      p_self_muted: typeof options.isMuted === "boolean" ? options.isMuted : null,
    }, writableUserId)
    : await runExactSessionAccountBoundSupabaseMutationRpc<PartyMembershipRow[] | PartyMembershipRow>("heartbeat_watch_party_room_session", {
      p_party_id: partyId,
      p_membership_state: isLeaving ? "left" : normalizeRoomMembershipState(options.membershipState),
      p_camera_enabled: !!options.cameraEnabled,
      p_mic_enabled: typeof options.micEnabled === "boolean" ? options.micEnabled : true,
      p_self_muted: typeof options.isMuted === "boolean" ? options.isMuted : null,
      p_display_name: String(options.displayName ?? "").trim() || null,
      p_avatar_url: String(options.avatarUrl ?? "").trim() || null,
      p_camera_preview_url: String(options.cameraPreviewUrl ?? "").trim() || null,
    }, writableUserId);
  const row = Array.isArray(result.data) ? result.data[0] ?? null : result.data;
  if (result.error) {
    reportRuntimeError("watch-party-membership-rpc", result.error, {
      partyId,
      operation: isJoining ? "join" : "heartbeat",
      writableUserId,
    });
    return null;
  }
  if (!row || String(row.user_id ?? "").trim() !== writableUserId) return null;
  return rowToMembership(row);
}

const partyRoomCreateFlights = new Map<string, Promise<unknown>>();

// A lost acknowledgement, timeout, or gateway error can follow a committed
// insert. Only known statement rejections prove no commit. Representation or
// unknown PostgREST errors must not release a caller's creation latch.
const isRejectedPartyRoomCreateResponse = (error: unknown, status: number) => {
  const raw = (error ?? {}) as { code?: unknown; message?: unknown };
  return Number.isInteger(status) && status >= 400 && status < 500
    && status !== 408 && status !== 499
    && typeof raw.code === "string"
    && ["23505", "23503", "23514", "23502", "42501", "42703", "42P01", "PGRST204"].includes(raw.code)
    && typeof raw.message === "string" && Boolean(raw.message.trim());
};

const getPartyRoomCreateFlightKey = (
  titleId: string | null | undefined,
  hostUserId: string,
  authority: AccountSessionAuthorityBinding,
  options?: WatchPartyRoomCreateOptions,
) => JSON.stringify([
  String(hostUserId ?? "").trim(),
  authority.accountId,
  authority.sessionGeneration,
  String(titleId ?? "").trim(),
  options?.roomType ?? "",
  options?.sourceType ?? "",
  String(options?.sourceId ?? "").trim(),
  options?.joinPolicy ?? "",
  options?.reactionsPolicy ?? "",
  options?.contentAccessRule ?? "",
  options?.capturePolicy ?? "",
  options?.discoveryVisibility ?? "",
  options?.discoveryPaused ?? false,
  String(options?.discoveryTitle ?? "").trim(),
]);

async function createPartyRoomOnce(
  titleId: string | null | undefined,
  hostUserId: string,
  positionMillis: number,
  state: "playing" | "paused",
  options: WatchPartyRoomCreateOptions | undefined,
  initiatingAuthority: AccountSessionAuthorityBinding,
  dispatchState: { mutationDispatched: boolean; mutationRejected: boolean },
): Promise<WatchPartyCreateResult> {
  const assertInitiatingAuthority = () => {
    if (!sameAccountSessionAuthority(initiatingAuthority, getCurrentAccountSessionAuthoritySnapshot())) {
      throw new AccountBoundSupabaseMutationError();
    }
  };
  // The public entry point captures before single-flight's microtask. Bind the
  // verified transport token before title, defaults, profile, or Premium IO.
  assertInitiatingAuthority();
  const requestedHostUserId = String(hostUserId ?? "").trim();
  const subject = await captureAccountBoundSupabaseMutationSubject(requestedHostUserId);
  assertInitiatingAuthority();
  if (!sameAccountSessionAuthority(initiatingAuthority, subject.authority)) {
    throw new AccountBoundSupabaseMutationError();
  }
  const resolvedHostUserId = subject.authority.userId;
  const requestedTitleId = String(titleId ?? "").trim();
  const requestedSourceType = normalizeWatchPartyContentSourceType(options?.sourceType);
  const requestedSourceId = String(options?.sourceId ?? "").trim();
  const isCreatorVideoRoom = requestedSourceType === "creator_video";
  const isSpectatorPlaybackRoom = requestedSourceType === "spectator_playback";
  const isSourceLinkedTitleRoom = isCreatorVideoRoom || isSpectatorPlaybackRoom;
  const requestedRoomType: WatchPartyRoomType = options?.roomType ?? (isSourceLinkedTitleRoom || requestedTitleId ? "title" : "live");
  const platformTitleRequestId = requestedTitleId || (requestedSourceType === "platform_title" ? requestedSourceId : "");
  const resolvedTitleId = requestedRoomType === "title" && !isSourceLinkedTitleRoom
    ? await resolvePartyTitleId(platformTitleRequestId)
    : null;
  assertInitiatingAuthority();
  const [appConfig, profile] = await Promise.all([
    readAppConfig().catch(() => null),
    readUserProfile().catch(() => null),
  ]);
  assertInitiatingAuthority();
  const creatorPermissions = await readCreatorPermissions(resolvedHostUserId).catch(() => null);
  assertInitiatingAuthority();
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
    requestedRoomType === "live" || isSourceLinkedTitleRoom
      ? [null]
      : Array.from(new Set([resolvedTitleId, platformTitleRequestId].filter(isNonEmptyString)));
  const creatorVideoSourceId = isCreatorVideoRoom ? requestedSourceId : "";
  const spectatorPlaybackSourceId = isSpectatorPlaybackRoom ? requestedSourceId : "";
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

  if (requestedRoomType === "title" && isSpectatorPlaybackRoom && !spectatorPlaybackSourceId) {
    const explicitError = toCreateError(
      { message: "Unable to resolve valid spectator source for watch party room" },
      { requestedSourceType, requestedSourceId },
    );
    debugLog("watch-party", "createPartyRoom spectator source resolution failed", explicitError);
    return { error: explicitError };
  }

  if (requestedRoomType === "title" && !isSourceLinkedTitleRoom && !titleIdCandidates.length) {
    const explicitError = toCreateError(
      { message: "Unable to resolve valid titleId for watch party room" },
      { requestedTitleId, requestedSourceId, resolvedTitleId },
    );
    debugLog("watch-party", "createPartyRoom title resolution failed", explicitError);
    return { error: explicitError };
  }

  const premiumAccessKey = requestedRoomType === "live"
    ? requestedHostUserId || resolvedHostUserId || "live-first"
    : creatorVideoSourceId || spectatorPlaybackSourceId || resolvedTitleId || platformTitleRequestId || "watch-party-live";
  const premiumAccess = await requirePremiumAccessForRoomType(requestedRoomType, premiumAccessKey).catch(() => null);
  assertInitiatingAuthority();
  if (!premiumAccess?.allowed) {
    return {
      error: premiumAccess
        ? toPremiumRoomCreateError(requestedRoomType, premiumAccess, {
          requestedRoomType,
          premiumAccessKey,
          requestedTitleId,
          requestedSourceType,
          requestedSourceId,
        })
        : toCreateError(
          {
            code: "premium_required",
            message: requestedRoomType === "live"
              ? LIVE_FIRST_PREMIUM_UPSELL_COPY.message
              : WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY.message,
          },
          {
            requestedRoomType,
            premiumAccessKey,
            requestedTitleId,
            requestedSourceType,
            requestedSourceId,
          },
        ),
    };
  }

  let lastError: WatchPartyCreateError | null = null;

  try {
    for (const safeTitleId of titleIdCandidates) {
      for (const safeHostUserId of hostUserIdCandidates) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const generatedPartyId = createPartyIdentifier();
          const now = new Date().toISOString();
          const sourceType: WatchPartyContentSourceType | null = isSourceLinkedTitleRoom
            ? requestedSourceType
            : requestedRoomType === "title"
              ? "platform_title"
              : null;
          const sourceId = isCreatorVideoRoom
            ? creatorVideoSourceId
            : isSpectatorPlaybackRoom
              ? spectatorPlaybackSourceId
              : (safeTitleId ?? null);
          const payload: PartyRoomInsert & { discovery_paused: boolean } = {
            party_id: generatedPartyId,
            room_type: requestedRoomType,
            host_user_id: safeHostUserId,
            title_id: safeTitleId,
            source_type: sourceType,
            source_id: sourceId,
            playback_position_millis: Math.max(0, Math.floor(positionMillis)),
            playback_state: state,
            is_active: true,
            join_policy: joinPolicy,
            reactions_policy: reactionsPolicy,
            content_access_rule: contentAccessRule,
            capture_policy: capturePolicy,
            discovery_visibility: requestedRoomType === "live"
              ? normalizeWatchPartyDiscoveryVisibility(options?.discoveryVisibility)
              : "private",
            discovery_paused: options?.discoveryPaused === true,
            discovery_title: requestedRoomType === "live"
              ? String(options?.discoveryTitle ?? "").trim() || null
              : null,
            started_at: now,
            updated_at: now,
            last_activity_at: now,
          };

          assertAccountBoundSupabaseMutationSubjectCurrent(subject);
          dispatchState.mutationDispatched = true;
          dispatchState.mutationRejected = false;
          const { data, error, status } = await supabase
            .from(PARTY_ROOMS_TABLE)
            .insert(payload)
            .setHeader("Authorization", `Bearer ${subject.accessToken}`)
            .select(PARTY_ROOMS_HOST_SETTINGS_SELECT)
            .returns<PartyRoomFullRow[]>()
            .single();
          // A dispatched mutation is not canceled by a later account change.
          // Reject its stale acknowledgement without issuing a replacement.
          assertInitiatingAuthority();

          if (!error && data) {
            const createdState = rowToState(data);
            if (data.is_active === true && createdState?.partyId === generatedPartyId && createdState.hostUserId === safeHostUserId
              && createdState.roomType === requestedRoomType && createdState.titleId === safeTitleId
              && createdState.sourceType === sourceType && createdState.sourceId === sourceId) return createdState;
            return { error: toCreateError(
              { code: "room_creation_outcome_unknown", message: "Room creation could not be verified. Check your rooms before trying again." },
              { ...payload, source: "createPartyRoom.insert" },
            ) };
          }

          if (!isRejectedPartyRoomCreateResponse(error, status)) {
            return { error: toCreateError(
              { code: "room_creation_outcome_unknown", message: "Room creation could not be verified. Check your rooms before trying again." },
            ) };
          }
          dispatchState.mutationRejected = true;

          if (
            error
            && ["42703", "PGRST204"].includes(error.code)
            && (
              isMissingColumnError(error, "join_policy")
              || isMissingColumnError(error, "source_type")
              || isMissingColumnError(error, "source_id")
            )
            && isSourceLinkedTitleRoom
          ) {
            lastError = toCreateError(error, {
              requestedSourceType,
              requestedSourceId,
              source: "createPartyRoom.sourceLinkedMissingSourceColumns",
            });
            debugLog("watch-party", "createPartyRoom source-linked insert missing source columns", lastError);
            break;
          }

          if (
            error
            && ["42703", "PGRST204"].includes(error.code)
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

            assertAccountBoundSupabaseMutationSubjectCurrent(subject);
            dispatchState.mutationRejected = false;
            const { data: fallbackData, error: fallbackError, status: fallbackStatus } = await supabase
              .from(PARTY_ROOMS_TABLE)
              .insert(fallbackPayload)
              .setHeader("Authorization", `Bearer ${subject.accessToken}`)
              .select(PARTY_ROOMS_LEGACY_BASE_SELECT)
              .returns<PartyRoomLegacyBaseRow[]>()
              .single();
            assertInitiatingAuthority();

            if (!fallbackError && fallbackData) {
              const createdState = rowToState(fallbackData);
              if (fallbackData.is_active === true && createdState?.partyId === generatedPartyId && createdState.hostUserId === safeHostUserId
                && createdState.roomType === requestedRoomType && createdState.titleId === safeTitleId) return createdState;
            }

            if (!isRejectedPartyRoomCreateResponse(fallbackError, fallbackStatus)) {
              return { error: toCreateError(
                { code: "room_creation_outcome_unknown", message: "Room creation could not be verified. Check your rooms before trying again." },
              ) };
            }
            dispatchState.mutationRejected = true;
            lastError = toCreateError(fallbackError, fallbackPayload);
            debugLog("watch-party", "createPartyRoom fallback insert error", lastError);
            if (isConflictError(fallbackError)) continue;
            if (isForeignKeyError(fallbackError)) break;
            return { error: lastError };
          } else if (error) {
            lastError = toCreateError(error, payload);
            debugLog("watch-party", "createPartyRoom insert error", lastError);
          }

          if (error && isConflictError(error)) continue;
          if (error && isForeignKeyError(error)) break;
          return { error: lastError! };
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

export function createPartyRoom(
  titleId: string | null | undefined,
  hostUserId: string,
  positionMillis: number,
  state: "playing" | "paused",
  options?: WatchPartyRoomCreateOptions,
): Promise<WatchPartyCreateResult> {
  const initiatingAuthority = getCurrentAccountSessionAuthoritySnapshot();
  const requestedHostUserId = String(hostUserId ?? "").trim();
  if (!initiatingAuthority || initiatingAuthority.state !== "ACTIVE" || initiatingAuthority.restoreOnly
    || !requestedHostUserId || requestedHostUserId !== initiatingAuthority.userId) {
    return Promise.resolve({ error: toCreateError(new AccountBoundSupabaseMutationError(), { mutationDispatched: false, mutationRejected: false }) });
  }
  const initiatingOptions = options ? { ...options } : undefined;
  return runKeyedSingleFlight(
    partyRoomCreateFlights,
    getPartyRoomCreateFlightKey(titleId, requestedHostUserId, initiatingAuthority, initiatingOptions),
    () => {
      // Once submitted, even an authority change or lost acknowledgement cannot
      // prove that the insert did not commit. Only an explicit rejection of the
      // latest submitted insert permits a caller to offer a fresh manual retry.
      const dispatchState = { mutationDispatched: false, mutationRejected: false };
      return createPartyRoomOnce(titleId, requestedHostUserId, positionMillis, state, initiatingOptions, initiatingAuthority, dispatchState)
        .catch((error: unknown) => ({ error: toCreateError(error) }))
        .then((result): WatchPartyCreateResult => "error" in result ? {
          error: {
            ...result.error,
            payload: { ...result.error.payload, ...dispatchState },
          },
        } : result);
    },
  );
}

async function touchActivePartyRoomHeartbeat(room: WatchPartyState, userId?: string | null): Promise<void> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId || normalizedUserId !== room.hostUserId) return;
  if (!isWatchPartyRoomActive(room)) return;

  const activityMillis = getWatchPartyRoomActivityMillis(room);
  if (activityMillis !== null && Date.now() - activityMillis < WATCH_PARTY_ROOM_HEARTBEAT_MILLIS * 2) return;

  try {
    const updates: PartyRoomUpdate = {
      last_activity_at: new Date().toISOString(),
    };

    await supabase
      .from(PARTY_ROOMS_TABLE)
      .update(updates)
      .eq("party_id", room.partyId)
      .eq("host_user_id", normalizedUserId)
      .eq("is_active", true);
  } catch {
    // Membership heartbeat still records presence; room activity is best-effort under RLS.
  }
}

export async function getPartyRoom(partyId: string): Promise<WatchPartyState | null> {
  const row = await fetchPartyRoomRow(partyId);
  if (!row) return null;
  const room = rowToState(row);
  return isWatchPartyRoomActive(room) ? room : null;
}

export type OwnedPartyCreationRecovery =
  | { status: "active" | "terminal"; room: WatchPartyState }
  | { status: "unknown" };

// Recovery of an acknowledged Player creation needs explicit terminal evidence.
// General reads deliberately hide inactive rooms, and an expired activity window
// is not terminal: an exact prepared host can resume that active row. The waiting
// room's explicit Start must renew it before admission. This read neither renews
// the room nor grants membership or publication.
export async function readOwnedPartyCreationRecovery(
  expectedRoom: WatchPartyState,
  authority: AccountSessionAuthorityBinding,
): Promise<OwnedPartyCreationRecovery> {
  const unknown = { status: "unknown" } as const;
  const isCurrent = () => !authority.restoreOnly
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  if (!isCurrent() || !expectedRoom.isActive || expectedRoom.roomType !== "title"
    || expectedRoom.hostUserId !== authority.userId || !expectedRoom.partyId || !expectedRoom.sourceId
    || (expectedRoom.sourceType !== "platform_title" && expectedRoom.sourceType !== "creator_video")) return unknown;
  const row = await fetchPartyRoomRow(expectedRoom.partyId).catch(() => null);
  if (!isCurrent() || !row || row.party_id !== expectedRoom.partyId
    || row.host_user_id !== expectedRoom.hostUserId || row.room_type !== expectedRoom.roomType
    || row.title_id !== expectedRoom.titleId
    || !("source_type" in row) || row.source_type !== expectedRoom.sourceType
    || !("source_id" in row) || row.source_id !== expectedRoom.sourceId) return unknown;
  const room = rowToState(row);
  if (!room) return unknown;
  if (row.is_active === false) return { status: "terminal", room };
  const activityMillis = toTimeMillis("last_activity_at" in row ? row.last_activity_at : null)
    ?? toTimeMillis(row.updated_at) ?? toTimeMillis(row.started_at);
  if (row.is_active !== true || activityMillis === null) return unknown;
  return { status: "active", room };
}

export async function touchOwnedPartyRoomActivity(partyId: string): Promise<boolean> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  const writableUserId = await getWritablePartyUserId();
  if (!normalizedPartyId || !writableUserId) return false;

  const { error } = await supabase
    .from(PARTY_ROOMS_TABLE)
    .update({ last_activity_at: new Date().toISOString() })
    .eq("party_id", normalizedPartyId)
    .eq("host_user_id", writableUserId)
    .eq("is_active", true);

  if (error) {
    reportRuntimeError("watch-party-room-owner-heartbeat", error, {
      partyId: normalizedPartyId,
      writableUserId,
    });
    return false;
  }
  return true;
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

    if (error) {
      reportRuntimeError("watch-party-membership-read", error, { partyId: normalizedPartyId });
      return [];
    }
    if (!data) return [];
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

  const baseDecision = await evaluateRoomAccess({
    partyId: room.partyId,
    room,
    membership: membership ? { ...membership, userId: safeUserId } : null,
    hasWritableIdentity: !!writableUserId,
  });
  if (room.roomType !== "title") return baseDecision;
  if (
    baseDecision.reason === "identity_required"
    || baseDecision.reason === "removed"
    || baseDecision.reason === "room_locked"
  ) {
    return baseDecision;
  }

  const seatAccess = await resolveTitleRoomSeatAccess(room, writableUserId);
  if (seatAccess.status === "free_room") return baseDecision;
  if (
    (seatAccess.status !== "exact_paid_ticket" && seatAccess.status !== "room_host")
    || seatAccess.userId !== safeUserId
  ) {
    return {
      ...baseDecision,
      canJoin: false,
      reason: "party_pass_required",
      monetization: createEmptyMonetizationGateResolution(),
    };
  }
  return {
    ...baseDecision,
    canJoin: true,
    reason: "allowed",
    monetization: createEmptyMonetizationGateResolution(),
  };
}

export async function joinPartyRoomSession(options: MembershipUpsertOptions): Promise<WatchPartyRoomMembership | null> {
  const room = await getPartyRoom(options.partyId).catch(() => null);
  if (!room) return null;
  const admission = await resolvePartyRoomSessionAdmission(room);
  if (!admission) return null;
  const exactTicketViewerUserId = admission.source === "exact_paid_ticket" ? admission.userId : undefined;

  const membership = await upsertMembership({
    ...options,
    userId: exactTicketViewerUserId ?? options.userId,
    role: exactTicketViewerUserId ? "viewer" : options.role,
    stageRole: exactTicketViewerUserId ? "listener" : options.stageRole,
    canSpeak: exactTicketViewerUserId ? false : options.canSpeak,
    cameraEnabled: exactTicketViewerUserId ? false : options.cameraEnabled,
    micEnabled: exactTicketViewerUserId ? false : options.micEnabled,
    membershipState: "active",
    markJoinedAt: true,
    markLeftAt: false,
    preserveHostAuthority: true,
    exactTicketViewerUserId,
  });
  if (membership) void touchActivePartyRoomHeartbeat(room, membership.userId);
  return membership;
}

export async function touchPartyRoomSession(options: MembershipUpsertOptions): Promise<WatchPartyRoomMembership | null> {
  const room = await getPartyRoom(options.partyId).catch(() => null);
  if (!room) return null;
  const admission = await resolvePartyRoomSessionAdmission(room);
  if (!admission) return null;
  const exactTicketViewerUserId = admission.source === "exact_paid_ticket" ? admission.userId : undefined;

  const membership = await upsertMembership({
    ...options,
    userId: exactTicketViewerUserId ?? options.userId,
    role: exactTicketViewerUserId ? "viewer" : options.role,
    stageRole: exactTicketViewerUserId ? "listener" : options.stageRole,
    canSpeak: exactTicketViewerUserId ? false : options.canSpeak,
    cameraEnabled: exactTicketViewerUserId ? false : options.cameraEnabled,
    micEnabled: exactTicketViewerUserId ? false : options.micEnabled,
    membershipState: options.membershipState ?? "active",
    markJoinedAt: false,
    markLeftAt: false,
    preserveHostAuthority: true,
    exactTicketViewerUserId,
  });
  if (membership) void touchActivePartyRoomHeartbeat(room, membership.userId);
  return membership;
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
  expectedRoom?: WatchPartyState,
): Promise<WatchPartyState | null> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  const initiatingAuthority = getCurrentAccountSessionAuthoritySnapshot();
  const writableUserId = await getWritablePartyUserId();
  if (!normalizedPartyId || !writableUserId) return null;
  let room = await getPartyRoom(normalizedPartyId).catch(() => null);
  if (!room) return null;
  const premiumAccess = await requirePremiumAccessForRoom(room).catch(() => null);
  if (!premiumAccess?.allowed) return null;
  const creatorPermissions = await readCreatorPermissions(writableUserId).catch(() => null);

  if (policies.joinPolicy || policies.discoveryVisibility || policies.discoveryTitle !== undefined || policies.discoveryPaused !== undefined) {
    const authority = initiatingAuthority;
    if (!authority || room.hostUserId !== authority.userId
      || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return null;
    const expected = expectedRoom ?? room;
    if (expected.partyId !== normalizedPartyId || expected.hostUserId !== authority.userId) return null;
    const result = await setWatchPartyHostSettings(expected, {
      joinPolicy: policies.joinPolicy ?? expected.joinPolicy,
      discoveryVisibility: policies.discoveryVisibility ?? expected.discoveryVisibility,
      discoveryPaused: policies.discoveryPaused ?? expected.discoveryPaused ?? undefined,
      discoveryTitle: policies.discoveryTitle !== undefined ? policies.discoveryTitle : expected.discoveryTitle,
    }, authority, () => sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()), { publish: false });
    if (!result) return null;
    room = result.room;
    if (!policies.reactionsPolicy && !policies.contentAccessRule && !policies.capturePolicy) return room;
  }

  const now = new Date().toISOString();
  const updates: PartyRoomUpdate = {
    updated_at: now,
    last_activity_at: now,
  };

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
    .select(PARTY_ROOMS_HOST_SETTINGS_SELECT)
    .returns<PartyRoomFullRow>()
    .single();

  if (error || !data) return null;
  return rowToState(data);
}

export type PartyRoomDiscoveryResult = {
  partyId: string;
  sourceType: WatchPartyContentSourceType;
  sourceId: string;
  visibility: WatchPartyDiscoveryVisibility;
  title: string | null;
  published: boolean;
  startedAt: string | null;
  projectionId: string | null;
};

type OwnedPartyRoomPreparationIdentity = Pick<WatchPartyState,
  "partyId" | "hostUserId" | "roomType" | "titleId" | "sourceType" | "sourceId"
>;

// A host can still edit an exact prepared room after its viewer activity window
// elapses. This read grants no admission, heartbeat, membership or publication.
async function readOwnedPartyRoomForPreparation(
  expectedRoom: OwnedPartyRoomPreparationIdentity & { isActive: boolean },
  subject: AccountBoundSupabaseMutationSubject,
): Promise<WatchPartyState | null> {
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (!expectedRoom.isActive || expectedRoom.roomType !== "title"
    || expectedRoom.hostUserId !== subject.authority.userId
    || !expectedRoom.sourceId
    || (expectedRoom.sourceType !== "platform_title" && expectedRoom.sourceType !== "creator_video")) return null;
  const row = await fetchPartyRoomRow(expectedRoom.partyId);
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (!row || row.is_active !== true || row.party_id !== expectedRoom.partyId
    || row.host_user_id !== expectedRoom.hostUserId || row.room_type !== expectedRoom.roomType
    || row.title_id !== expectedRoom.titleId
    || !("source_type" in row) || row.source_type !== expectedRoom.sourceType
    || !("source_id" in row) || row.source_id !== expectedRoom.sourceId
    || (toTimeMillis("last_activity_at" in row ? row.last_activity_at : null)
      ?? toTimeMillis(row.updated_at) ?? toTimeMillis(row.started_at)) === null) return null;
  const room = rowToState(row);
  if (!room || room.roomType !== "title" || room.partyId !== expectedRoom.partyId
    || room.hostUserId !== expectedRoom.hostUserId || room.titleId !== expectedRoom.titleId
    || room.sourceType !== expectedRoom.sourceType || room.sourceId !== expectedRoom.sourceId) return null;
  return room;
}

// Only exact Player handoffs and prepared-owner Start use this read. Viewer
// lookup, room bootstrap, membership, and publication keep their age filters.
export async function getOwnedPartyRoomForPreparation(
  identity: OwnedPartyRoomPreparationIdentity,
  authority: AccountSessionAuthorityBinding,
): Promise<WatchPartyState | null> {
  if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())
    || authority.restoreOnly || authority.state !== "ACTIVE"
    || identity.hostUserId !== authority.userId) return null;
  const subject = await captureAccountBoundSupabaseMutationSubject(identity.hostUserId);
  if (!sameAccountSessionAuthority(authority, subject.authority)) return null;
  return readOwnedPartyRoomForPreparation({ ...identity, isActive: true }, subject);
}

// Explicit owner Start renews activity only after current Premium, identity and
// audience checks. The frozen token and affected-row acknowledgement are required:
// a generic heartbeat cannot prove a still-active exact room was actually renewed.
export async function refreshOwnedPartyRoomForStart(
  expectedRoom: WatchPartyState,
  authority: AccountSessionAuthorityBinding,
  isCurrent: () => boolean,
): Promise<WatchPartyState | null> {
  const current = () => isCurrent()
    && authority.state === "ACTIVE" && !authority.restoreOnly
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  if (!current() || !expectedRoom.isActive || expectedRoom.roomType !== "title"
    || expectedRoom.hostUserId !== authority.userId || !expectedRoom.partyId || !expectedRoom.sourceId
    || (expectedRoom.sourceType !== "platform_title" && expectedRoom.sourceType !== "creator_video")) return null;
  const subject = await captureAccountBoundSupabaseMutationSubject(expectedRoom.hostUserId);
  if (!current() || !sameAccountSessionAuthority(authority, subject.authority)) return null;
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const refreshedAt = new Date().toISOString();
  let query = supabase.from(PARTY_ROOMS_TABLE)
    .update({ last_activity_at: refreshedAt })
    .setHeader("Authorization", `Bearer ${subject.accessToken}`)
    .eq("party_id", expectedRoom.partyId)
    .eq("host_user_id", expectedRoom.hostUserId)
    .eq("room_type", expectedRoom.roomType)
    .eq("source_type", expectedRoom.sourceType)
    .eq("source_id", expectedRoom.sourceId)
    .eq("is_active", true)
    // Do not replace a newer heartbeat if this request is delayed in transport.
    .lte("last_activity_at", refreshedAt);
  query = expectedRoom.titleId === null
    ? query.is("title_id", null)
    : query.eq("title_id", expectedRoom.titleId);
  if (expectedRoom.roomGeneration && Number.isSafeInteger(expectedRoom.hostSettingsRevision)) {
    query = query.eq("room_generation", expectedRoom.roomGeneration)
      .eq("host_settings_revision", Number(expectedRoom.hostSettingsRevision));
  }
  const { data, error } = await query.select(PARTY_ROOMS_HOST_SETTINGS_SELECT)
    .returns<PartyRoomFullRow[]>().maybeSingle();
  if (!current()) return null;
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (error || !data || data.is_active !== true
    || data.party_id !== expectedRoom.partyId || data.host_user_id !== expectedRoom.hostUserId
    || data.room_type !== expectedRoom.roomType || data.title_id !== expectedRoom.titleId
    || data.source_type !== expectedRoom.sourceType || data.source_id !== expectedRoom.sourceId
    || data.discovery_visibility !== expectedRoom.discoveryVisibility
    || data.discovery_paused !== expectedRoom.discoveryPaused
    || (expectedRoom.roomGeneration && (data.room_generation !== expectedRoom.roomGeneration
      || data.host_settings_revision !== expectedRoom.hostSettingsRevision))
    || (data.discovery_title ?? null) !== expectedRoom.discoveryTitle
    || toTimeMillis(data.last_activity_at) !== toTimeMillis(refreshedAt)) return null;
  const room = rowToState(data);
  return isWatchPartyRoomActive(room) ? room : null;
}

async function writePartyRoomDiscovery(
  expectedRoom: WatchPartyState,
  policies?: Pick<SetPartyRoomPoliciesOptions, "discoveryVisibility" | "discoveryTitle" | "discoveryPaused">,
): Promise<{ room: WatchPartyState; result: PartyRoomDiscoveryResult } | null> {
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const room = policies
    ? await readOwnedPartyRoomForPreparation(expectedRoom, subject)
    : await getPartyRoom(String(expectedRoom.partyId).trim().toUpperCase());
  if (!room || !room.isActive || room.roomType !== "title" || room.hostUserId !== subject.authority.userId
    || room.partyId !== expectedRoom.partyId || room.hostUserId !== expectedRoom.hostUserId
    || room.sourceType !== expectedRoom.sourceType || room.sourceId !== expectedRoom.sourceId
    || (!policies && (room.discoveryVisibility !== expectedRoom.discoveryVisibility || room.discoveryTitle !== expectedRoom.discoveryTitle))
    || (expectedRoom.roomGeneration && (room.roomGeneration !== expectedRoom.roomGeneration
      || room.hostSettingsRevision !== expectedRoom.hostSettingsRevision))
    || (expectedRoom.startedAt && room.startedAt !== expectedRoom.startedAt)
    || !room.sourceId || !room.sourceType || room.sourceType === "spectator_playback") return null;
  const visibility = policies?.discoveryVisibility ?? room.discoveryVisibility;
  const title = (policies?.discoveryTitle !== undefined ? policies.discoveryTitle ?? "" : room.discoveryTitle ?? "").trim() || null;
  const saved = await setWatchPartyHostSettings(room, { joinPolicy: room.joinPolicy,
    discoveryVisibility: visibility, discoveryTitle: title, discoveryPaused: policies?.discoveryPaused ?? room.discoveryPaused ?? undefined }, subject.authority, () => true,
    { publish: !policies, preparation: !!policies });
  return saved ? { room: saved.room, result: { partyId: room.partyId, sourceType: room.sourceType,
    sourceId: room.sourceId, visibility: saved.room.discoveryVisibility, title: saved.room.discoveryTitle,
    published: saved.published, startedAt: saved.room.discoveryStartedAt, projectionId: saved.projectionId } } : null;
}

// The server owns source/audience/session validation. Saving a prepared room
// cannot publish it; publication additionally requires its joined host.
export async function setPartyRoomDiscoverySettings(
  partyId: string,
  policies: Pick<SetPartyRoomPoliciesOptions, "discoveryVisibility" | "discoveryTitle" | "discoveryPaused">,
  expectedRoom: WatchPartyState,
): Promise<WatchPartyState | null> {
  if (partyId !== expectedRoom.partyId) return null;
  return (await writePartyRoomDiscovery(expectedRoom, policies))?.room ?? null;
}

export async function publishPartyRoomDiscovery(expectedRoom: WatchPartyState, isCurrent: () => boolean = () => true): Promise<PartyRoomDiscoveryResult | null> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || expectedRoom.roomType !== "title" || !expectedRoom.sourceType || !expectedRoom.sourceId) return null;
  const result = await setWatchPartyHostSettings(expectedRoom, {
    joinPolicy: expectedRoom.joinPolicy, discoveryVisibility: expectedRoom.discoveryVisibility,
    discoveryPaused: expectedRoom.discoveryPaused ?? undefined,
    discoveryTitle: expectedRoom.discoveryTitle,
  }, authority, isCurrent);
  return result ? { partyId: expectedRoom.partyId, sourceType: expectedRoom.sourceType, sourceId: expectedRoom.sourceId,
    visibility: result.room.discoveryVisibility, title: result.room.discoveryTitle, published: result.published,
    startedAt: result.room.discoveryStartedAt, projectionId: result.projectionId } : null;
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
  const room = await getPartyRoom(normalizedPartyId).catch(() => null);
  if (!room) return null;
  const premiumAccess = await requirePremiumAccessForRoom(room).catch(() => null);
  if (!premiumAccess?.allowed) return null;
  if (String(room.hostUserId ?? "").trim() !== writableUserId) {
    debugLog("watch-party", "blocked non-host participant state update", {
      partyId: normalizedPartyId,
      targetUserId: normalizedTargetUserId,
      writableUserId,
    });
    return null;
  }
  const currentMembershipRow = await fetchPartyMembershipRow(normalizedPartyId, normalizedTargetUserId);
  const currentMembership = currentMembershipRow ? rowToMembership(currentMembershipRow) : null;
  if (!currentMembership) return null;
  const requestedState = changes.membershipState
    ? normalizeRoomMembershipState(changes.membershipState)
    : currentMembership.membershipState;
  const requestedStageRole = changes.stageRole === "speaker" || changes.canSpeak === true
    ? "speaker"
    : changes.stageRole === "listener" || changes.canSpeak === false
      ? "listener"
      : currentMembership.stageRole === "speaker"
        ? "speaker"
        : "listener";
  const { data, error } = await runExactSessionAccountBoundSupabaseMutationRpc<
    PartyMembershipRow[] | PartyMembershipRow
  >(
    "set_watch_party_participant_authority",
    {
      p_party_id: normalizedPartyId,
      p_target_user_id: normalizedTargetUserId,
      p_stage_role: requestedStageRole,
      p_host_muted: changes.isMuted ?? currentMembership.hostMuted,
      p_membership_state: requestedState,
    },
    writableUserId,
  );
  const row = Array.isArray(data) ? data[0] ?? null : data;
  if (error || !row) {
    reportRuntimeError("watch-party-set-participant-state", error ?? new Error("Missing membership row"), {
      partyId: normalizedPartyId,
      targetUserId: normalizedTargetUserId,
      writableUserId,
      requestedStageRole,
      requestedState,
    });
    return null;
  }
  return rowToMembership(row);
}

export async function setOwnPartyParticipantMuteState(
  partyId: string,
  isMuted: boolean,
): Promise<WatchPartyRoomMembership | null> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  const writableUserId = await getWritablePartyUserId();
  if (!normalizedPartyId || !writableUserId) return null;
  const room = await getPartyRoom(normalizedPartyId).catch(() => null);
  if (!room) return null;
  const premiumAccess = await requirePremiumAccessForRoom(room).catch(() => null);
  if (!premiumAccess?.allowed) return null;

  const currentMembershipRow = await fetchPartyMembershipRow(normalizedPartyId, writableUserId);
  if (!currentMembershipRow) return null;
  const currentMembership = rowToMembership(currentMembershipRow);
  if (!currentMembership) return null;
  if (currentMembership.membershipState === "removed" || currentMembership.membershipState === "left") return null;

  const nextIsMuted = !!isMuted;
  const nextCanPublishMedia = canWatchPartyMembershipPublishMedia({
    role: currentMembership.role,
    stageRole: currentMembership.stageRole,
    canSpeak: currentMembership.canSpeak,
    isMuted: nextIsMuted,
    membershipState: currentMembership.membershipState,
  });
  const updated = await upsertMembership({
    partyId: normalizedPartyId,
    userId: writableUserId,
    membershipState: currentMembership.membershipState,
    markJoinedAt: false,
    markLeftAt: false,
    isMuted: nextIsMuted,
    cameraEnabled: nextCanPublishMedia && currentMembership.cameraEnabled,
    micEnabled: nextCanPublishMedia && currentMembership.micEnabled,
  });
  if (!updated) {
    reportRuntimeError("watch-party-set-own-participant-mute-state", new Error("Missing membership row"), {
      partyId: normalizedPartyId,
      targetUserId: writableUserId,
      isMuted: nextIsMuted,
    });
    return null;
  }
  return updated;
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
  options?: { username?: string; mutationSubject?: AccountBoundSupabaseMutationSubject; isCurrent?: () => boolean },
): Promise<boolean> {
  return !!(await sendPartyMessageRecord(partyId, userId, kind, body, options));
}

export async function sendPartyMessageRecord(
  partyId: string,
  userId: string,
  kind: WatchPartyMessage["kind"],
  body: string,
  options?: { username?: string; mutationSubject?: AccountBoundSupabaseMutationSubject; isCurrent?: () => boolean },
): Promise<WatchPartyMessage | null> {
  const normalizedPartyId = String(partyId ?? "").trim().toUpperCase();
  if (!normalizedPartyId) return null;

  const safeBody = String(body ?? "").trim();
  if (!safeBody) return null;

  try {
    const subject = options?.mutationSubject ?? await captureAccountBoundSupabaseMutationSubject(userId);
    const assertCurrent = () => {
      assertAccountBoundSupabaseMutationSubjectCurrent(subject);
      if ((userId && userId !== subject.authority.userId) || (options?.isCurrent && !options.isCurrent())) {
        throw new AccountBoundSupabaseMutationError();
      }
    };
    assertCurrent();
    const writableUserId = subject.authority.userId;
    const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${subject.accessToken}` } },
    });
    const payload: WatchPartyMessageInsert = {
      party_id: normalizedPartyId,
      user_id: writableUserId,
      username: String(options?.username ?? "Guest").trim() || "Guest",
      text: kind === "reaction" ? safeBody : safeBody,
      created_at: new Date().toISOString(),
    };

    assertCurrent();
    const { data, error } = await client
      .from(WATCH_PARTY_MESSAGES_TABLE)
      .insert(payload)
      .select("id,party_id,user_id,username,text,created_at")
      .single();
    const created = data as unknown as WatchPartyMessageRow | null;
    if (error || !created) return null;
    assertCurrent();
    if (String(created.user_id ?? "") !== writableUserId || String(created.party_id ?? "") !== normalizedPartyId) return null;

    return {
      id: String(created.id ?? ""),
      partyId: String(created.party_id ?? normalizedPartyId),
      userId: String(created.user_id ?? writableUserId),
      kind,
      body: String(created.text ?? safeBody),
      createdAt: String(created.created_at ?? new Date().toISOString()),
      displayCreatedAt: created.created_at ?? null,
      attachments: [],
    };
  } catch {
    return null;
  }
}

export async function deletePartyMessage(
  messageId: string,
  options?: { mutationSubject?: AccountBoundSupabaseMutationSubject },
): Promise<void> {
  const normalizedMessageId = String(messageId ?? "").trim();
  if (!normalizedMessageId) return;

  // Attachment compensation may run after retirement, but must retain the
  // initiating credential. A fresh delete captures its own current intent.
  const subject = options?.mutationSubject ?? await captureAccountBoundSupabaseMutationSubject();
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${subject.accessToken}` } },
  });
  const { error } = await client
    .from(WATCH_PARTY_MESSAGES_TABLE)
    .delete()
    .eq("id", normalizedMessageId)
    .eq("user_id", subject.authority.userId);

  if (error) throw error;
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
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit)
      .returns<WatchPartyMessageRow[]>();

    if (error || !data) return [];

    const attachmentsByMessageId = await readSocialAttachmentsForSurfaces(
      "watch_party_room_message",
      data.map((row) => String(row.id ?? "")),
    );

    // Limit the newest rows on the server, then present them chronologically.
    // Limiting an ascending query permanently hides new comments and seat markers.
    return [...data].reverse().map((row) => ({
      id: String(row.id ?? ""),
      partyId: String(row.party_id ?? normalizedPartyId),
      userId: String(row.user_id ?? ""),
      kind: "chat",
      body: String(row.text ?? ""),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      displayCreatedAt: row.created_at ?? null,
      attachments: attachmentsByMessageId.get(String(row.id ?? "")) ?? [],
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
