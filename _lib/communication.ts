import Constants from "expo-constants";
import { Platform } from "react-native";
import type { MediaStream } from "@livekit/react-native-webrtc";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/database.types";

import { readAppConfig, resolveRoomDefaultConfig } from "./appConfig";
import { readCreatorPermissions, sanitizeCreatorRoomAccessRule } from "./monetization";
import {
  buildRoomCapabilities,
  evaluateRoomAccess,
  normalizeCapturePolicy,
  normalizeContentAccessRule,
  normalizeRoomMembershipState,
  ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS,
  type CapturePolicy,
  type ContentAccessRule,
  type RoomAccessDecision,
  type RoomMembershipState,
} from "./roomRules";
import { ROOM_ACTIVITY_ACTIVE_WINDOW_MS } from "./performancePolicy";
import { supabase } from "./supabase";
import { buildUserChannelProfile, readUserProfile } from "./userData";
import { createPartyIdentifier, getWritablePartyUserId } from "./watchParty";
import { runExactSessionAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";

export const COMMUNICATION_ROOMS_TABLE = "communication_rooms";
export const COMMUNICATION_ROOM_MEMBERSHIPS_TABLE = "communication_room_memberships";
export const COMMUNICATION_ROOM_MAX_PARTICIPANTS = 4;
export const COMMUNICATION_CHANNEL_PREFIX = "comm-room-";
export const COMMUNICATION_ACTIVE_MEMBER_WINDOW_MILLIS = ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS;
export const COMMUNICATION_ROOM_ACTIVE_WINDOW_MILLIS = ROOM_ACTIVITY_ACTIVE_WINDOW_MS;

const AUTHENTICATED_USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeAuthenticatedUserId = (value: unknown) => {
  const userId = String(value ?? "").trim();
  return AUTHENTICATED_USER_ID_PATTERN.test(userId) ? userId.toLowerCase() : "";
};

type CommunicationIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const COMMUNICATION_ROOM_BASE_SELECT =
  "room_id,room_code,host_user_id,status,created_at,updated_at,linked_party_id,linked_room_code,linked_room_mode";
const COMMUNICATION_ROOM_SELECT =
  `${COMMUNICATION_ROOM_BASE_SELECT},content_access_rule,capture_policy,last_activity_at`;
const COMMUNICATION_ROOM_MEMBERSHIP_SELECT =
  "room_id,user_id,role,membership_state,membership_generation,membership_admission_attempt,camera_enabled,mic_enabled,display_name,avatar_url,joined_at,last_seen_at,left_at,updated_at";

export type CommunicationRoomStatus = "active" | "ended";
export type CommunicationLinkedRoomMode = "live" | "hybrid";
export type CommunicationMembershipRole = "host" | "participant";

export type CommunicationRoomState = {
  roomId: string;
  roomCode: string;
  hostUserId: string;
  status: CommunicationRoomStatus;
  createdAt: string;
  updatedAt: string;
  linkedPartyId?: string;
  linkedRoomCode?: string;
  linkedRoomMode?: CommunicationLinkedRoomMode;
  contentAccessRule: ContentAccessRule;
  capturePolicy: CapturePolicy;
  lastActivityAt: string;
};

export type CommunicationRoomMembership = {
  roomId: string;
  userId: string;
  role: CommunicationMembershipRole;
  membershipState: RoomMembershipState;
  membershipGeneration?: string;
  membershipAdmissionAttempt?: string;
  cameraEnabled: boolean;
  micEnabled: boolean;
  displayName?: string;
  avatarUrl?: string;
  joinedAt: string;
  lastSeenAt: string;
  leftAt?: string;
};

export type CommunicationRoomSnapshot = {
  room: CommunicationRoomState;
  memberships: CommunicationRoomMembership[];
};

export type CommunicationIdentity = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  tagline?: string;
};

export type CommunicationMediaPreferences = {
  cameraEnabled: boolean;
  micEnabled: boolean;
};

export type CommunicationParticipantPresence = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  cameraOn: boolean;
  micOn: boolean;
  joinedAt: string;
  isHost: boolean;
};

export type CommunicationParticipantView = CommunicationParticipantPresence & {
  isSelf: boolean;
  streamURL?: string;
  /** Observed facing of the owned local render track; never remote presence. */
  cameraFacingMode?: "user" | "environment";
  liveKitVideoTrackReference?: unknown;
  mediaProvider?: "legacy_webrtc" | "livekit";
  connectionState: "waiting" | "connecting" | "connected" | "disconnected" | "failed";
};

export type CommunicationRoomSignalEvent =
  | "webrtc:offer"
  | "webrtc:answer"
  | "webrtc:ice"
  | "media:update"
  | "room:end";

type CommunicationRoomBaseRow = Pick<
  Tables<"communication_rooms">,
  | "room_id"
  | "room_code"
  | "host_user_id"
  | "status"
  | "created_at"
  | "updated_at"
  | "linked_party_id"
  | "linked_room_code"
  | "linked_room_mode"
>;

type CommunicationRoomFullRow = CommunicationRoomBaseRow & Pick<
  Tables<"communication_rooms">,
  "content_access_rule" | "capture_policy" | "last_activity_at"
>;

type CommunicationRoomRow = CommunicationRoomBaseRow | CommunicationRoomFullRow;

type CommunicationMembershipRow = Pick<
  Tables<"communication_room_memberships">,
  | "room_id"
  | "user_id"
  | "role"
  | "membership_state"
  | "membership_generation"
  | "membership_admission_attempt"
  | "camera_enabled"
  | "mic_enabled"
  | "display_name"
  | "avatar_url"
  | "joined_at"
  | "last_seen_at"
  | "left_at"
  | "updated_at"
>;

type CommunicationRoomInsert = TablesInsert<"communication_rooms">;
type CommunicationRoomBaseInsert = Pick<
  CommunicationRoomInsert,
  | "room_id"
  | "room_code"
  | "host_user_id"
  | "status"
  | "created_at"
  | "updated_at"
  | "linked_party_id"
  | "linked_room_code"
  | "linked_room_mode"
>;
type CommunicationRoomUpdate = TablesUpdate<"communication_rooms">;

type CommunicationRoomCreateOptions = {
  hostUserId?: string;
  linkedPartyId?: string;
  linkedRoomCode?: string;
  linkedRoomMode?: CommunicationLinkedRoomMode | string | null;
  contentAccessRule?: ContentAccessRule;
  capturePolicy?: CapturePolicy;
};

export type CreateCommunicationRoomResult =
  | CommunicationRoomState
  | {
      error: {
        message: string;
      };
    };

type RTCModule = typeof import("@livekit/react-native-webrtc");

let cachedRTCModule: RTCModule | null | undefined;
let cachedCommunicationIceServers: CommunicationIceServer[] | null = null;

const COMMUNICATION_FALLBACK_ICE_SERVERS: CommunicationIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
];

const isDefined = <T>(value: T | null): value is T => value !== null;

const toTimeMillis = (value?: string | null) => {
  const parsed = Date.parse(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const getCommunicationRoomActivityMillis = (
  room: Pick<CommunicationRoomState, "lastActivityAt" | "updatedAt" | "createdAt">,
) => (
  toTimeMillis(room.lastActivityAt)
  ?? toTimeMillis(room.updatedAt)
  ?? toTimeMillis(room.createdAt)
);

export const isCommunicationRoomActive = (
  room: Pick<CommunicationRoomState, "status" | "lastActivityAt" | "updatedAt" | "createdAt"> | null | undefined,
  nowMillis = Date.now(),
) => {
  if (room?.status !== "active") return false;
  const activityMillis = getCommunicationRoomActivityMillis(room);
  if (activityMillis === null) return false;
  return nowMillis - activityMillis <= COMMUNICATION_ROOM_ACTIVE_WINDOW_MILLIS;
};

const normalizeIceUrlList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
  }

  return String(value ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeCommunicationIceServer = (value: unknown): CommunicationIceServer | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const urls = normalizeIceUrlList(raw.urls);
  if (urls.length === 0) return null;

  const username = String(raw.username ?? "").trim();
  const credential = String(raw.credential ?? "").trim();

  return {
    urls: urls.length === 1 ? urls[0] : urls,
    username: username || undefined,
    credential: credential || undefined,
  };
};

const parseIceServersJson = (value: unknown): CommunicationIceServer[] => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return [];

  try {
    const parsed = JSON.parse(normalized);
    return (Array.isArray(parsed) ? parsed : [])
      .map((entry) => normalizeCommunicationIceServer(entry))
      .filter(Boolean) as CommunicationIceServer[];
  } catch {
    return [];
  }
};

const readCommunicationRuntimeConfig = () => {
  const expoRuntime = Constants.expoConfig?.extra?.runtime;
  const runtimeObject = expoRuntime && typeof expoRuntime === "object" && !Array.isArray(expoRuntime)
    ? expoRuntime as Record<string, unknown>
    : {};
  const communication = runtimeObject.communication && typeof runtimeObject.communication === "object" && !Array.isArray(runtimeObject.communication)
    ? runtimeObject.communication as Record<string, unknown>
    : {};

  return {
    iceServers: String(
      process.env.EXPO_PUBLIC_COMMUNICATION_ICE_SERVERS
      || communication.iceServers
      || "",
    ).trim(),
    stunUrls: String(
      process.env.EXPO_PUBLIC_COMMUNICATION_STUN_URLS
      || communication.stunUrls
      || "",
    ).trim(),
    turnUrls: String(
      process.env.EXPO_PUBLIC_COMMUNICATION_TURN_URLS
      || communication.turnUrls
      || "",
    ).trim(),
    turnUsername: String(
      process.env.EXPO_PUBLIC_COMMUNICATION_TURN_USERNAME
      || communication.turnUsername
      || "",
    ).trim(),
    turnCredential: String(
      process.env.EXPO_PUBLIC_COMMUNICATION_TURN_CREDENTIAL
      || communication.turnCredential
      || "",
    ).trim(),
  };
};

const resolveCommunicationIceServers = (): CommunicationIceServer[] => {
  if (cachedCommunicationIceServers) return cachedCommunicationIceServers;

  const runtimeConfig = readCommunicationRuntimeConfig();
  const parsedServers = parseIceServersJson(runtimeConfig.iceServers);
  if (parsedServers.length > 0) {
    cachedCommunicationIceServers = parsedServers;
    return parsedServers;
  }

  const stunUrls = normalizeIceUrlList(runtimeConfig.stunUrls);
  const turnUrls = normalizeIceUrlList(runtimeConfig.turnUrls);
  const nextServers: CommunicationIceServer[] = [];

  if (stunUrls.length > 0) {
    nextServers.push({ urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls });
  }

  if (turnUrls.length > 0) {
    nextServers.push({
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username: runtimeConfig.turnUsername || undefined,
      credential: runtimeConfig.turnCredential || undefined,
    });
  }

  cachedCommunicationIceServers = nextServers.length > 0
    ? nextServers
    : COMMUNICATION_FALLBACK_ICE_SERVERS;

  return cachedCommunicationIceServers;
};

export const COMMUNICATION_DEFAULT_ICE_SERVERS = resolveCommunicationIceServers();

export const getCommunicationRTCModule = (): RTCModule | null => {
  if (Platform.OS === "web") return null;
  if (cachedRTCModule !== undefined) return cachedRTCModule;

  try {
    // Keep the optional native RTC package out of web/bootstrap evaluation.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedRTCModule = require("@livekit/react-native-webrtc") as RTCModule;
  } catch {
    cachedRTCModule = null;
  }

  return cachedRTCModule;
};

export const buildCommunicationChannelName = (roomId: string) => `${COMMUNICATION_CHANNEL_PREFIX}${roomId}`;

const createCommunicationOperationError = (operation: string, cause: unknown) => {
  const detail = typeof cause === "object" && cause && "message" in cause
    ? String((cause as { message?: unknown }).message ?? "").trim()
    : "";
  const code = typeof cause === "object" && cause && "code" in cause
    ? String((cause as { code?: unknown }).code ?? "").trim()
    : "";
  return Object.assign(new Error(detail || `Communication ${operation} failed.`), code ? { code } : {});
};

export async function broadcastCommunicationRoomSignal(options: {
  roomId: string;
  event: CommunicationRoomSignalEvent;
  payload: Record<string, unknown>;
  userId?: string;
  expectedMembershipGeneration?: string;
}): Promise<boolean> {
  const roomId = formatCommunicationRoomCode(options.roomId);
  if (!roomId) return false;

  if (options.expectedMembershipGeneration !== undefined) {
    const generation = String(options.expectedMembershipGeneration).trim();
    const userId = normalizeAuthenticatedUserId(options.userId ?? await getWritablePartyUserId());
    if (!userId || !AUTHENTICATED_USER_ID_PATTERN.test(generation)) {
      throw createCommunicationOperationError("signal broadcast", { message: "signal membership identity required" });
    }
    const payload = { ...options.payload };
    delete payload.fromUserId;
    delete payload.membershipGeneration;
    const { data, error } = await runExactSessionAccountBoundSupabaseMutationRpc<{
      sent?: unknown; event?: unknown; roomId?: unknown; fromUserId?: unknown; membershipGeneration?: unknown;
    }>("broadcast_owned_communication_room_signal", {
      p_room_id: roomId, p_expected_membership_generation: generation,
      p_event: options.event, p_payload: payload,
    }, userId);
    if (error) throw createCommunicationOperationError("signal broadcast", error);
    if (data?.sent !== true || data.event !== options.event || data.roomId !== roomId
      || data.fromUserId !== userId || data.membershipGeneration !== generation) {
      throw createCommunicationOperationError("signal broadcast", { message: "Communication signal broadcast returned an invalid response." });
    }
    return true;
  }

  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: "broadcast_communication_room_signal",
    args: {
      p_room_id: string;
      p_event: CommunicationRoomSignalEvent;
      p_payload: Record<string, unknown>;
    },
  ) => PromiseLike<{
    data: {
      sent?: unknown;
      event?: unknown;
      roomId?: unknown;
    } | null;
    error: { message?: string } | null;
  }>;
  const { data, error } = await rpc("broadcast_communication_room_signal", {
    p_room_id: roomId,
    p_event: options.event,
    p_payload: options.payload,
  });
  if (error) throw createCommunicationOperationError("signal broadcast", error);
  const exactResponse = data?.sent === true
    && String(data.event ?? "") === options.event
    && formatCommunicationRoomCode(data.roomId) === roomId;
  if (!exactResponse) throw new Error("Communication signal broadcast returned an invalid response.");
  return true;
}

const isMissingColumnError = (error: unknown, column: string) => {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  return new RegExp(`${column}.*column|column.*${column}`, "i").test(message);
};

const normalizeCommunicationLinkedRoomMode = (value: unknown): CommunicationLinkedRoomMode | undefined => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "live" || normalized === "hybrid") {
    return normalized;
  }
  return undefined;
};

export const formatCommunicationRoomCode = (value: unknown) => String(value ?? "").trim().toUpperCase();

export const parseCommunicationRoomPayload = (row: CommunicationRoomRow): CommunicationRoomState | null => {
  const roomId = String(row.room_id ?? "").trim();
  const roomCode = String(row.room_code ?? roomId).trim().toUpperCase();
  const hostUserId = String(row.host_user_id ?? "").trim();
  const status = String(row.status ?? "active").trim().toLowerCase() === "ended" ? "ended" : "active";
  const linkedPartyId = formatCommunicationRoomCode(row.linked_party_id);
  const linkedRoomCode = formatCommunicationRoomCode(row.linked_room_code);
  const linkedRoomMode = normalizeCommunicationLinkedRoomMode(row.linked_room_mode);
  const contentAccessRule = "content_access_rule" in row ? row.content_access_rule : undefined;
  const capturePolicy = "capture_policy" in row ? row.capture_policy : undefined;
  const lastActivityAt = "last_activity_at" in row ? row.last_activity_at : undefined;

  if (!roomId || !roomCode || !hostUserId) return null;

  const now = new Date().toISOString();

  return {
    roomId,
    roomCode,
    hostUserId,
    status,
    createdAt: String(row.created_at ?? now),
    updatedAt: String(row.updated_at ?? now),
    linkedPartyId: linkedPartyId || undefined,
    linkedRoomCode: linkedRoomCode || undefined,
    linkedRoomMode,
    contentAccessRule: normalizeContentAccessRule(contentAccessRule),
    capturePolicy: normalizeCapturePolicy(capturePolicy),
    lastActivityAt: String(lastActivityAt ?? row.updated_at ?? row.created_at ?? now),
  };
};

export const parseCommunicationMembershipPayload = (row: CommunicationMembershipRow): CommunicationRoomMembership | null => {
  const roomId = formatCommunicationRoomCode(row.room_id);
  const userId = String(row.user_id ?? "").trim();
  if (!roomId || !userId) return null;

  const role: CommunicationMembershipRole = String(row.role ?? "").trim().toLowerCase() === "host" ? "host" : "participant";
  const now = new Date().toISOString();

  return {
    roomId,
    userId,
    role,
    membershipState: normalizeRoomMembershipState(row.membership_state),
    membershipGeneration: String(row.membership_generation ?? "").trim() || undefined,
    membershipAdmissionAttempt: String(row.membership_admission_attempt ?? "").trim() || undefined,
    cameraEnabled: !!row.camera_enabled,
    micEnabled: typeof row.mic_enabled === "boolean" ? row.mic_enabled : true,
    displayName: String(row.display_name ?? "").trim() || undefined,
    avatarUrl: String(row.avatar_url ?? "").trim() || undefined,
    joinedAt: String(row.joined_at ?? now),
    lastSeenAt: String(row.last_seen_at ?? row.updated_at ?? row.joined_at ?? now),
    leftAt: String(row.left_at ?? "").trim() || undefined,
  };
};

async function fetchCommunicationRoomRow(roomId: string): Promise<CommunicationRoomRow | null> {
  const normalizedRoomId = formatCommunicationRoomCode(roomId);
  if (!normalizedRoomId) return null;

  const query = await supabase
    .from(COMMUNICATION_ROOMS_TABLE)
    .select(COMMUNICATION_ROOM_SELECT)
    .eq("room_id", normalizedRoomId)
    .returns<CommunicationRoomFullRow>()
    .maybeSingle();

  if (!query.error) return query.data ?? null;

  if (query.error && isMissingColumnError(query.error, "content_access_rule")) {
    const fallback = await supabase
      .from(COMMUNICATION_ROOMS_TABLE)
      .select(COMMUNICATION_ROOM_BASE_SELECT)
      .eq("room_id", normalizedRoomId)
      .returns<CommunicationRoomBaseRow>()
      .maybeSingle();
    if (fallback.error) throw createCommunicationOperationError("room fallback read", fallback.error);
    return fallback.data ?? null;
  }
  throw createCommunicationOperationError("room read", query.error);
}

export async function createCommunicationRoom(hostUserIdOrOptions?: string | CommunicationRoomCreateOptions): Promise<CreateCommunicationRoomResult> {
  const options = typeof hostUserIdOrOptions === "string"
    ? { hostUserId: hostUserIdOrOptions }
    : (hostUserIdOrOptions ?? {});
  const resolvedHostUserId = String(options.hostUserId ?? await getWritablePartyUserId()).trim();
  const [appConfig, profile] = await Promise.all([
    readAppConfig().catch(() => null),
    readUserProfile().catch(() => null),
  ]);
  const creatorPermissions = await readCreatorPermissions(resolvedHostUserId).catch(() => null);
  const roomDefaults = resolveRoomDefaultConfig(appConfig).communication;
  const requestedContentAccessRule = normalizeContentAccessRule(
    options.contentAccessRule
      ?? profile?.defaultCommunicationContentAccessRule
      ?? roomDefaults.contentAccessRule,
  );
  const contentAccessRule = normalizeContentAccessRule(
    sanitizeCreatorRoomAccessRule(requestedContentAccessRule, creatorPermissions),
  );
  const capturePolicy = normalizeCapturePolicy(
    options.capturePolicy
      ?? profile?.defaultCommunicationCapturePolicy
      ?? roomDefaults.capturePolicy,
  );
  const linkedPartyId = formatCommunicationRoomCode(options.linkedPartyId);
  const linkedRoomCode = formatCommunicationRoomCode(options.linkedRoomCode);
  const linkedRoomMode = normalizeCommunicationLinkedRoomMode(options.linkedRoomMode);

  if (!resolvedHostUserId) {
    return { error: { message: "Unable to resolve host identity for communication room." } };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = createPartyIdentifier();
    const now = new Date().toISOString();
    const payload: CommunicationRoomInsert = {
      room_id: roomId,
      room_code: roomId,
      host_user_id: resolvedHostUserId,
      status: "active",
      created_at: now,
      updated_at: now,
      linked_party_id: linkedPartyId || null,
      linked_room_code: linkedRoomCode || null,
      linked_room_mode: linkedRoomMode ?? null,
      content_access_rule: contentAccessRule,
      capture_policy: capturePolicy,
      last_activity_at: now,
    };

    const { data, error } = await supabase
      .from(COMMUNICATION_ROOMS_TABLE)
      .insert(payload)
      .select(COMMUNICATION_ROOM_SELECT)
      .returns<CommunicationRoomFullRow>()
      .single();

    if (!error && data) {
      const room = parseCommunicationRoomPayload(data);
      if (room) return room;
    }

    if (error && isMissingColumnError(error, "content_access_rule")) {
      const fallbackPayload: CommunicationRoomBaseInsert = {
        room_id: roomId,
        room_code: roomId,
        host_user_id: resolvedHostUserId,
        status: "active",
        created_at: now,
        updated_at: now,
        linked_party_id: linkedPartyId || null,
        linked_room_code: linkedRoomCode || null,
        linked_room_mode: linkedRoomMode ?? null,
      };

      const { data: fallbackData, error: fallbackError } = await supabase
        .from(COMMUNICATION_ROOMS_TABLE)
        .insert(fallbackPayload)
        .select(COMMUNICATION_ROOM_BASE_SELECT)
        .returns<CommunicationRoomBaseRow>()
        .single();

      if (!fallbackError && fallbackData) {
        const room = parseCommunicationRoomPayload(fallbackData);
        if (room) return room;
      }
    }

    const errorCode = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    if (errorCode === "23505") {
      if (linkedPartyId) {
        const existingRoom = await getLinkedCommunicationRoom(linkedPartyId);
        if (existingRoom) return existingRoom;
      }
      continue;
    }

    return {
      error: {
        message: typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message ?? "Failed to create communication room.")
          : "Failed to create communication room.",
      },
    };
  }

  return { error: { message: "Unable to generate a unique communication room code." } };
}

export async function getCommunicationRoom(roomId: string): Promise<CommunicationRoomState | null> {
  const row = await fetchCommunicationRoomRow(roomId);
  if (!row) return null;
  const room = parseCommunicationRoomPayload(row);
  return isCommunicationRoomActive(room) ? room : null;
}

export async function getCommunicationRoomByCode(roomCode: string): Promise<CommunicationRoomState | null> {
  const normalizedRoomCode = formatCommunicationRoomCode(roomCode);
  if (!normalizedRoomCode) return null;

  const query = await supabase
    .from(COMMUNICATION_ROOMS_TABLE)
    .select(COMMUNICATION_ROOM_SELECT)
    .eq("room_code", normalizedRoomCode)
    .returns<CommunicationRoomFullRow>()
    .maybeSingle();

  if (!query.error && query.data) {
    const room = parseCommunicationRoomPayload(query.data);
    return isCommunicationRoomActive(room) ? room : null;
  }

  if (query.error && isMissingColumnError(query.error, "content_access_rule")) {
    const fallback = await supabase
      .from(COMMUNICATION_ROOMS_TABLE)
      .select(COMMUNICATION_ROOM_BASE_SELECT)
      .eq("room_code", normalizedRoomCode)
      .returns<CommunicationRoomBaseRow>()
      .maybeSingle();
    if (!fallback.error && fallback.data) {
      const room = parseCommunicationRoomPayload(fallback.data);
      return isCommunicationRoomActive(room) ? room : null;
    }
    if (fallback.error) throw createCommunicationOperationError("room-code fallback read", fallback.error);
  }
  if (query.error) throw createCommunicationOperationError("room-code read", query.error);
  return null;
}

export async function listCommunicationRoomMemberships(roomId: string): Promise<CommunicationRoomMembership[]> {
  const normalizedRoomId = formatCommunicationRoomCode(roomId);
  if (!normalizedRoomId) return [];

  const { data, error } = await supabase
    .from(COMMUNICATION_ROOM_MEMBERSHIPS_TABLE)
    .select(COMMUNICATION_ROOM_MEMBERSHIP_SELECT)
    .eq("room_id", normalizedRoomId)
    .order("joined_at", { ascending: true })
    .returns<CommunicationMembershipRow[]>();

  if (error) throw createCommunicationOperationError("membership read", error);
  return (data ?? []).map(parseCommunicationMembershipPayload).filter(isDefined);
}

export async function getCommunicationRoomSnapshot(roomId: string): Promise<CommunicationRoomSnapshot | null> {
  const [room, memberships] = await Promise.all([
    getCommunicationRoom(roomId),
    listCommunicationRoomMemberships(roomId),
  ]);

  if (!room) return null;
  return { room, memberships };
}

export const getActiveCommunicationMemberships = (memberships: CommunicationRoomMembership[]) =>
  memberships.filter((membership) => {
    const state = normalizeRoomMembershipState(membership.membershipState);
    if (state !== "active" && state !== "reconnecting") return false;
    const lastSeenAt = new Date(membership.lastSeenAt).getTime();
    if (!Number.isFinite(lastSeenAt)) return state === "active";
    return Date.now() - lastSeenAt <= COMMUNICATION_ACTIVE_MEMBER_WINDOW_MILLIS;
  });

export async function evaluateCommunicationRoomAccess(options: {
  room: CommunicationRoomState;
  membership?: CommunicationRoomMembership | null;
  userId?: string;
}): Promise<RoomAccessDecision> {
  const writableUserId = await getWritablePartyUserId();
  const membership = options.membership ?? null;

  return evaluateRoomAccess({
    partyId: options.room.linkedPartyId || options.room.roomId,
    room: options.room,
    membership,
    hasWritableIdentity: !!writableUserId,
  });
}

export type CommunicationRoomAdmission = Readonly<{
  roomId: string;
  userId: string;
  attemptId: string;
  expectedPreviousGeneration: string | null;
}>;

const createCommunicationAdmissionAttemptId = () => {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw createCommunicationOperationError("membership admission", { message: "Secure device randomness is unavailable." });
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export async function prepareCommunicationRoomAdmission(options: {
  roomId: string;
  userId?: string;
}): Promise<CommunicationRoomAdmission> {
  const roomId = formatCommunicationRoomCode(options.roomId);
  const userId = normalizeAuthenticatedUserId(options.userId ?? await getWritablePartyUserId());
  if (!roomId || !userId) throw createCommunicationOperationError("membership admission", { message: "admission identity required" });
  // This exact-session read distinguishes a genuinely absent own row from an
  // RLS-hidden row. Capture its CAS precondition once, before the mutation.
  const { data, error } = await runExactSessionAccountBoundSupabaseMutationRpc<{
    roomId?: unknown; userId?: unknown; previousGeneration?: unknown;
  }>("read_communication_room_admission", { p_room_id: roomId }, userId);
  if (error) throw createCommunicationOperationError("membership admission", error);
  if (!data || typeof data !== "object" || Array.isArray(data)
    || data.roomId !== roomId || data.userId !== userId
    || !(data.previousGeneration === null || (typeof data.previousGeneration === "string"
      && AUTHENTICATED_USER_ID_PATTERN.test(data.previousGeneration)))) {
    throw createCommunicationOperationError("membership admission", { message: "admission snapshot not confirmed" });
  }
  return Object.freeze({ roomId, userId, attemptId: createCommunicationAdmissionAttemptId(),
    expectedPreviousGeneration: data.previousGeneration as string | null });
}

export async function joinCommunicationRoomSession(options: {
  roomId: string;
  userId?: string;
  admission: CommunicationRoomAdmission;
  displayName?: string;
  avatarUrl?: string;
  cameraEnabled?: boolean;
  micEnabled?: boolean;
}): Promise<CommunicationRoomMembership | null> {
  const roomId = formatCommunicationRoomCode(options.roomId);
  const requestedUserId = normalizeAuthenticatedUserId(options.userId ?? await getWritablePartyUserId());
  const admission = options.admission;
  if (!roomId || !requestedUserId || !admission
    || admission.roomId !== roomId || admission.userId !== requestedUserId
    || !AUTHENTICATED_USER_ID_PATTERN.test(admission.attemptId)
    || !(admission.expectedPreviousGeneration === null
      || AUTHENTICATED_USER_ID_PATTERN.test(admission.expectedPreviousGeneration))) {
    throw createCommunicationOperationError("membership join", { message: "prepared admission identity required" });
  }
  const { data, error } = await runExactSessionAccountBoundSupabaseMutationRpc<
    CommunicationMembershipRow[] | CommunicationMembershipRow
  >("join_owned_communication_room_session", {
    p_room_id: roomId,
    p_admission_attempt: admission.attemptId,
    p_expected_previous_generation: admission.expectedPreviousGeneration,
    p_display_name: String(options.displayName ?? "").trim() || null,
    p_avatar_url: String(options.avatarUrl ?? "").trim() || null,
    p_camera_enabled: !!options.cameraEnabled,
    p_mic_enabled: typeof options.micEnabled === "boolean" ? options.micEnabled : true,
  }, requestedUserId);
  const row = Array.isArray(data) ? data.length === 1 ? data[0] : null : data;
  if (error) throw createCommunicationOperationError("membership join", error);
  const membership = row && typeof row === "object" ? parseCommunicationMembershipPayload(row) : null;
  if (!membership || membership.roomId !== roomId || membership.userId !== requestedUserId
    || !AUTHENTICATED_USER_ID_PATTERN.test(membership.membershipGeneration ?? "")
    || membership.membershipAdmissionAttempt !== admission.attemptId
    || !["active", "reconnecting"].includes(String(row?.membership_state))
    || typeof row?.camera_enabled !== "boolean" || typeof row?.mic_enabled !== "boolean"
    || row?.left_at !== null) {
    throw createCommunicationOperationError("membership join", {
      message: "admission postcondition not confirmed", code: "account_bound_rpc_outcome_unknown",
    });
  }
  return membership;
}

export async function touchCommunicationRoomSession(options: {
  roomId: string;
  userId?: string;
  expectedMembershipGeneration: string;
  membershipState?: RoomMembershipState;
  cameraEnabled?: boolean;
  micEnabled?: boolean;
  displayName?: string;
  avatarUrl?: string;
}): Promise<CommunicationRoomMembership | null> {
  const roomId = formatCommunicationRoomCode(options.roomId);
  const userId = normalizeAuthenticatedUserId(options.userId ?? await getWritablePartyUserId());
  const generation = String(options.expectedMembershipGeneration ?? "").trim();
  if (!roomId || !userId || !AUTHENTICATED_USER_ID_PATTERN.test(generation)) {
    throw createCommunicationOperationError("membership update", { message: "membership update identity required" });
  }
  const { data, error } = await runExactSessionAccountBoundSupabaseMutationRpc<
    CommunicationMembershipRow[] | CommunicationMembershipRow
  >("touch_owned_communication_room_session", {
    p_room_id: roomId, p_expected_membership_generation: generation,
    p_membership_state: options.membershipState === undefined ? null : normalizeRoomMembershipState(options.membershipState),
    p_camera_enabled: options.cameraEnabled === undefined ? null : !!options.cameraEnabled,
    p_mic_enabled: options.micEnabled === undefined ? null : !!options.micEnabled,
    p_display_name: options.displayName === undefined ? null : String(options.displayName).trim() || null,
    p_avatar_url: options.avatarUrl === undefined ? null : String(options.avatarUrl).trim() || null,
    p_update_display_name: options.displayName !== undefined,
    p_update_avatar_url: options.avatarUrl !== undefined,
  }, userId);
  if (error) throw createCommunicationOperationError("membership update", error);
  const row = Array.isArray(data) ? data.length === 1 ? data[0] : null : data;
  const membership = row && typeof row === "object" ? parseCommunicationMembershipPayload(row) : null;
  if (!membership || membership.roomId !== roomId || membership.userId !== userId
    || membership.membershipGeneration !== generation
    || !AUTHENTICATED_USER_ID_PATTERN.test(membership.membershipAdmissionAttempt ?? "")
    || !["active", "reconnecting"].includes(String(row?.membership_state))
    || typeof row?.camera_enabled !== "boolean" || typeof row?.mic_enabled !== "boolean"
    || row?.left_at !== null) {
    throw createCommunicationOperationError("membership update", {
      message: "membership update postcondition not confirmed", code: "account_bound_rpc_outcome_unknown",
    });
  }
  return membership;
}

export async function leaveCommunicationRoomSession(options: {
  roomId: string;
  userId?: string;
  expectedMembershipGeneration?: string;
}): Promise<CommunicationRoomMembership | null> {
  const roomId = formatCommunicationRoomCode(options.roomId);
  const userId = normalizeAuthenticatedUserId(options.userId ?? await getWritablePartyUserId());
  const generation = String(options.expectedMembershipGeneration ?? "").trim();
  if (!roomId || !userId || !AUTHENTICATED_USER_ID_PATTERN.test(generation)) {
    throw createCommunicationOperationError("membership leave", { message: "cleanup identity required" });
  }
  const { data, error } = await runExactSessionAccountBoundSupabaseMutationRpc<
    CommunicationMembershipRow[] | CommunicationMembershipRow
  >("leave_communication_room_session", {
    p_room_id: roomId,
    p_expected_membership_generation: generation,
  }, userId);
  if (error) throw createCommunicationOperationError("membership leave", error);
  const row = Array.isArray(data) ? data.length === 1 ? data[0] : null : data;
  const membership = row && typeof row === "object" ? parseCommunicationMembershipPayload(row) : null;
  if (!membership || membership.roomId !== roomId || membership.userId !== userId
    || membership.membershipGeneration !== generation
    || !["left", "removed"].includes(membership.membershipState)
    || row?.camera_enabled !== false || row?.mic_enabled !== false
    || !membership.leftAt || !Number.isFinite(Date.parse(membership.leftAt))) {
    throw createCommunicationOperationError("membership leave", {
      message: "cleanup postcondition not confirmed",
      code: "account_bound_rpc_outcome_unknown",
    });
  }
  return membership;
}

export async function heartbeatCommunicationRoomSession(options: {
  roomId: string;
  userId: string;
  expectedMembershipGeneration: string;
}): Promise<CommunicationRoomMembership | null> {
  // A heartbeat must preserve the current media/state. The owned RPC reads
  // those values under lock; no delayed client snapshot is written back.
  return touchCommunicationRoomSession(options);
}

export async function getLinkedCommunicationRoom(linkedPartyId: string): Promise<CommunicationRoomState | null> {
  const normalizedPartyId = formatCommunicationRoomCode(linkedPartyId);
  if (!normalizedPartyId) return null;

  const query = await supabase
    .from(COMMUNICATION_ROOMS_TABLE)
    .select(COMMUNICATION_ROOM_SELECT)
    .eq("linked_party_id", normalizedPartyId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<CommunicationRoomFullRow>()
    .maybeSingle();

  if (!query.error && query.data) {
    const room = parseCommunicationRoomPayload(query.data);
    return isCommunicationRoomActive(room) ? room : null;
  }

  if (query.error && isMissingColumnError(query.error, "content_access_rule")) {
    const fallback = await supabase
      .from(COMMUNICATION_ROOMS_TABLE)
      .select(COMMUNICATION_ROOM_BASE_SELECT)
      .eq("linked_party_id", normalizedPartyId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<CommunicationRoomBaseRow>()
      .maybeSingle();
    if (!fallback.error && fallback.data) {
      const room = parseCommunicationRoomPayload(fallback.data);
      return isCommunicationRoomActive(room) ? room : null;
    }
  }

  return null;
}

export async function getOrCreateLinkedCommunicationRoom(options: {
  partyId: string;
  roomCode?: string;
  roomMode?: CommunicationLinkedRoomMode | string | null;
  hostUserId?: string;
}): Promise<CreateCommunicationRoomResult> {
  const normalizedPartyId = formatCommunicationRoomCode(options.partyId);
  if (!normalizedPartyId) {
    return { error: { message: "Missing watch-party room identity for communication room." } };
  }

  const existingRoom = await getLinkedCommunicationRoom(normalizedPartyId);
  if (existingRoom) return existingRoom;

  return createCommunicationRoom({
    hostUserId: options.hostUserId,
    linkedPartyId: normalizedPartyId,
    linkedRoomCode: options.roomCode,
    linkedRoomMode: options.roomMode,
  });
}

export async function endCommunicationRoom(roomId: string, authenticatedUserId?: string): Promise<void> {
  const normalizedRoomId = formatCommunicationRoomCode(roomId);
  const writableUserId = normalizeAuthenticatedUserId(
    authenticatedUserId ?? await getWritablePartyUserId(),
  );
  if (!normalizedRoomId || !writableUserId) return;

  const updates: CommunicationRoomUpdate = {
    status: "ended",
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from(COMMUNICATION_ROOMS_TABLE)
    .update(updates)
    .eq("room_id", normalizedRoomId)
    .eq("host_user_id", writableUserId);
  if (error) throw createCommunicationOperationError("room end", error);
}

export async function readCommunicationIdentity(authenticatedUserId?: string): Promise<CommunicationIdentity> {
  // Communication membership is an authenticated write path. A generated
  // Watch Party guest identity must never become the expected call subject:
  // the join RPC binds membership to auth.uid() and exact current-session
  // authority instead.
  const userId = normalizeAuthenticatedUserId(
    authenticatedUserId ?? await getWritablePartyUserId(),
  );
  const profile = await readUserProfile().catch(() => ({ username: "", avatarIndex: 0 }));

  let avatarUrl = "";
  try {
    const authUser = await supabase.auth.getUser();
    const metadata = authUser.data.user?.user_metadata as Record<string, unknown> | undefined;
    avatarUrl = String(metadata?.avatar_url ?? metadata?.picture ?? "").trim();
  } catch {
    avatarUrl = "";
  }

  const channelProfile = buildUserChannelProfile({
    id: userId,
    profile,
    avatarUrl,
    fallbackDisplayName: "You",
  });

  return {
    userId: String(userId ?? "").trim(),
    displayName: channelProfile.displayName,
    avatarUrl: channelProfile.avatarUrl || undefined,
    tagline: channelProfile.tagline,
  };
}

export const buildCommunicationPresencePayload = (options: {
  identity: CommunicationIdentity;
  room: CommunicationRoomState;
  media: CommunicationMediaPreferences;
  joinedAt: string;
}): CommunicationParticipantPresence => ({
  userId: options.identity.userId,
  displayName: options.identity.displayName,
  avatarUrl: options.identity.avatarUrl,
  cameraOn: !!options.media.cameraEnabled,
  micOn: !!options.media.micEnabled,
  joinedAt: options.joinedAt,
  isHost: options.room.hostUserId === options.identity.userId,
});

export const getCommunicationRoomCapabilities = async (options: {
  room: CommunicationRoomState;
  membership?: CommunicationRoomMembership | null;
  userId?: string;
}) => {
  const access = await evaluateCommunicationRoomAccess(options);
  return buildRoomCapabilities({
    access,
    hostUserId: options.room.hostUserId,
    membership: options.membership ? { ...options.membership, userId: options.userId ?? options.membership.userId } : undefined,
  });
};

export async function createCommunicationMediaStream(options: {
  audio: boolean;
  video: boolean;
  facingMode?: "user" | "environment";
}): Promise<MediaStream | null> {
  const rtc = getCommunicationRTCModule();
  if (!rtc) return null;
  if (!options.audio && !options.video) return null;

  return rtc.mediaDevices.getUserMedia({
    audio: options.audio,
    video: options.video
      ? {
          // The native SDK binds a camera when it creates the track. Changing
          // lens therefore reacquires video with this explicit preference;
          // applying constraints to an existing track cannot switch cameras.
          facingMode: options.facingMode ?? "user",
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 24 },
        }
      : false,
  });
}

export const getCommunicationStreamURL = (stream: MediaStream | null | undefined) => {
  if (!stream) return "";
  return (stream as any).toURL();
};

export const getCommunicationTrack = (
  stream: MediaStream | null | undefined,
  kind: "audio" | "video",
) => {
  if (!stream) return null;
  const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
  return tracks[0] ?? null;
};

export const setCommunicationTrackEnabled = (
  stream: MediaStream | null | undefined,
  kind: "audio" | "video",
  enabled: boolean,
) => {
  const track = getCommunicationTrack(stream, kind);
  if (!track) return false;
  track.enabled = enabled;
  return true;
};

export const stopCommunicationStream = (stream: MediaStream | null | undefined) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // noop
    }
  });
  try {
    (stream as any).release?.();
  } catch {
    // noop
  }
};
