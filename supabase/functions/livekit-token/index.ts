import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2";
import {
  captureSecurityRequestContext,
  hashSecurityText,
  securityContextAuditMetadata,
  type SecurityRequestContextResult,
} from "../_shared/security-request-context.ts";
import {
  normalizeLiveKitRoutingRoomType,
  resolveLiveKitAssignment,
} from "../_shared/livekit-routing.ts";
import { readLiveCostGuardTokenDecision } from "../_shared/live-cost-guard.ts";

type LiveKitJoinSurface = "live-stage" | "watch-party-live" | "chat-call";
type LiveKitParticipantRole = "host" | "speaker" | "viewer";
type LiveKitTokenAction = "mint-token" | "enforce-participant-state";
type SupabaseClientLike = any;

type LiveKitRequestedGrants = {
  roomJoin: boolean;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
};

type TokenRequestPayload = {
  action?: unknown;
  surface?: unknown;
  roomName?: unknown;
  role?: unknown;
  participantRole?: unknown;
  participantIdentity?: unknown;
  participantName?: unknown;
  requestedGrants?: unknown;
  targetParticipantIdentity?: unknown;
  metadata?: unknown;
};

type ScalarMetadataValue = boolean | number | string | null;

type WatchPartyMembershipRecord = {
  userId: string;
  role: string;
  stageRole: string;
  canSpeak: boolean;
  isMuted: boolean;
  membershipState: string;
  joinedAt: string | null;
  updatedAt: string | null;
  lastSeenAt: string | null;
};

type EffectiveRoleResolution =
  | {
      ok: true;
      participantRole: LiveKitParticipantRole;
      canPublish: boolean;
      membership: WatchPartyMembershipRecord | null;
      reason: string;
    }
  | {
      ok: false;
      error: string;
      message: string;
      status: number;
    };

type ResolvedRoomRecord =
  | {
      kind: "watch-party";
      roomName: string;
      hostUserId: string;
      roomType: string | null;
      isActive: boolean;
      startedAt: string | null;
      updatedAt: string | null;
      lastActivityAt: string | null;
    }
  | {
      kind: "communication";
      roomName: string;
      hostUserId: string;
      status: string;
      createdAt: string | null;
      updatedAt: string | null;
      lastActivityAt: string | null;
      chatThreadId: string | null;
    };

type LiveKitAuthenticatedUser = {
  email?: string | null;
  id: string;
  user_metadata?: Record<string, unknown> | null;
};

type LiveKitAuthResult = { user: LiveKitAuthenticatedUser } | { error: Response };

const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const ACTIVE_MEMBERSHIP_STATES = new Set(["active", "reconnecting"]);
const ROOM_ACTIVITY_ACTIVE_WINDOW_MS = 15 * 60_000;
const WATCH_PARTY_ROOM_ACTIVE_WINDOW_MS = ROOM_ACTIVITY_ACTIVE_WINDOW_MS;
const COMMUNICATION_ROOM_ACTIVE_WINDOW_MS = ROOM_ACTIVITY_ACTIVE_WINDOW_MS;
const WATCH_PARTY_MEMBERSHIP_ACTIVE_WINDOW_MS = 45_000;
const COMMUNICATION_MEMBERSHIP_ACTIVE_WINDOW_MS = 45_000;
const LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS = 4;

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const sanitizeText = (value: unknown) => String(value ?? "").trim();

const parseTimeMillis = (value: unknown): number | null => {
  const parsed = Date.parse(sanitizeText(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const firstValidTimeMillis = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = parseTimeMillis(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

const isRecentTime = (value: unknown, windowMillis: number, nowMillis = Date.now()) => {
  const parsed = parseTimeMillis(value);
  return parsed !== null && nowMillis - parsed <= windowMillis;
};

const isWatchPartyRoomCurrentlyActive = (room: Extract<ResolvedRoomRecord, { kind: "watch-party" }>) => {
  if (!room.isActive) return false;
  const activityMillis = firstValidTimeMillis(room.lastActivityAt, room.updatedAt, room.startedAt);
  return activityMillis !== null && Date.now() - activityMillis <= WATCH_PARTY_ROOM_ACTIVE_WINDOW_MS;
};

const isCommunicationRoomCurrentlyActive = (room: Extract<ResolvedRoomRecord, { kind: "communication" }>) => {
  if (sanitizeText(room.status).toLowerCase() !== "active") return false;
  const activityMillis = firstValidTimeMillis(room.lastActivityAt, room.updatedAt, room.createdAt);
  return activityMillis !== null && Date.now() - activityMillis <= COMMUNICATION_ROOM_ACTIVE_WINDOW_MS;
};

const sanitizeMetadata = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, entry]) => (
      typeof entry === "string"
      || typeof entry === "number"
      || typeof entry === "boolean"
      || entry === null
    )),
  ) as Record<string, ScalarMetadataValue>;
};

const normalizeSurface = (value: unknown): LiveKitJoinSurface | null => {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === "live-stage") return "live-stage";
  if (normalized === "watch-party-live") return "watch-party-live";
  if (normalized === "chat-call") return "chat-call";
  return null;
};

const normalizeAction = (value: unknown): LiveKitTokenAction | null => {
  const normalized = sanitizeText(value || "mint-token").toLowerCase();
  if (!normalized || normalized === "mint-token" || normalized === "token") return "mint-token";
  if (normalized === "enforce-participant-state") return "enforce-participant-state";
  return null;
};

const normalizeRole = (payload: TokenRequestPayload): LiveKitParticipantRole | null => {
  const raw = sanitizeText(payload.participantRole ?? payload.role).toLowerCase();
  if (raw === "host") return "host";
  if (raw === "speaker") return "speaker";
  if (raw === "viewer") return "viewer";
  return null;
};

const getRequestedLiveKitGrants = (
  participantRole: LiveKitParticipantRole,
  canPublishOverride?: boolean,
): LiveKitRequestedGrants => {
  const canPublish = typeof canPublishOverride === "boolean"
    ? canPublishOverride
    : participantRole === "host" || participantRole === "speaker";

  if (participantRole === "host" || participantRole === "speaker") {
    return {
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
    };
  }

  return {
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: true,
  };
};

const resolveParticipantName = (payload: TokenRequestPayload, user: { email?: string | null; user_metadata?: Record<string, unknown> | null }) => {
  const requested = sanitizeText(payload.participantName);
  if (requested) return requested;

  const metadataName = sanitizeText(user.user_metadata?.display_name ?? user.user_metadata?.full_name);
  if (metadataName) return metadataName;

  const emailLocalPart = sanitizeText(user.email).split("@")[0]?.trim();
  if (emailLocalPart) return emailLocalPart;

  return "Chi'llywood Member";
};

const normalizeWatchPartyMembership = (row: Record<string, unknown>): WatchPartyMembershipRecord => ({
  userId: sanitizeText(row.user_id),
  role: sanitizeText(row.role).toLowerCase(),
  stageRole: sanitizeText(row.stage_role).toLowerCase(),
  canSpeak: row.can_speak === true,
  isMuted: row.is_muted === true,
  membershipState: sanitizeText(row.membership_state).toLowerCase(),
  joinedAt: sanitizeText(row.joined_at) || null,
  updatedAt: sanitizeText(row.updated_at) || null,
  lastSeenAt: sanitizeText(row.last_seen_at) || null,
});

const isFreshWatchPartyMembership = (
  membership: WatchPartyMembershipRecord | null | undefined,
  nowMillis = Date.now(),
) => !!membership
  && ACTIVE_MEMBERSHIP_STATES.has(membership.membershipState)
  && isRecentTime(membership.lastSeenAt, WATCH_PARTY_MEMBERSHIP_ACTIVE_WINDOW_MS, nowMillis);

const isWatchPartySpeakerSeatMembership = (membership: WatchPartyMembershipRecord | null | undefined) => !!membership
  && (
    membership.role === "host"
    || membership.stageRole === "host"
    || membership.stageRole === "speaker"
    || membership.canSpeak
  );

const membershipSeatMillis = (membership: WatchPartyMembershipRecord) => (
  firstValidTimeMillis(membership.updatedAt, membership.joinedAt, membership.lastSeenAt) ?? Number.MAX_SAFE_INTEGER
);

const getAuthorizedWatchPartySpeakerSeatIds = (
  memberships: WatchPartyMembershipRecord[],
  hostUserId: string,
  nowMillis = Date.now(),
) => {
  const authorizedSeatIds = new Set<string>();
  if (hostUserId) authorizedSeatIds.add(hostUserId);

  const speakerMemberships = memberships
    .filter((membership) => (
      membership.userId
      && membership.userId !== hostUserId
      && isFreshWatchPartyMembership(membership, nowMillis)
      && isWatchPartySpeakerSeatMembership(membership)
    ))
    .sort((a, b) => {
      const timeDiff = membershipSeatMillis(a) - membershipSeatMillis(b);
      if (timeDiff !== 0) return timeDiff;
      return a.userId.localeCompare(b.userId);
    });

  for (const membership of speakerMemberships) {
    if (authorizedSeatIds.size >= LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS) break;
    authorizedSeatIds.add(membership.userId);
  }

  return authorizedSeatIds;
};

async function fetchWatchPartyMemberships(
  adminClient: SupabaseClientLike,
  roomName: string,
) {
  const memberships = await adminClient
    .from("watch_party_room_memberships")
    .select("user_id,role,stage_role,can_speak,is_muted,membership_state,joined_at,last_seen_at,updated_at")
    .eq("party_id", roomName);

  if (memberships.error) return null;
  return ((memberships.data ?? []) as Record<string, unknown>[]).map(normalizeWatchPartyMembership);
}

const deriveLiveKitApiUrl = (serverUrl: string, internalApiUrl?: string | null) => {
  const configured = sanitizeText(internalApiUrl) || sanitizeText(Deno.env.get("LIVEKIT_API_URL"));
  if (configured) return configured;
  const publicUrl = sanitizeText(serverUrl);
  if (publicUrl.startsWith("wss://")) return `https://${publicUrl.slice("wss://".length)}`;
  if (publicUrl.startsWith("ws://")) return `http://${publicUrl.slice("ws://".length)}`;
  return publicUrl;
};

async function fetchExistingLiveKitAssignmentEndpoint(
  adminClient: SupabaseClientLike,
  roomName: string,
) {
  const assignment = await adminClient
    .from("livekit_room_assignments")
    .select("assigned_server_id")
    .eq("app_room_id", roomName)
    .eq("livekit_room_name", roomName)
    .in("assignment_status", ["assigned", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const serverRowId = sanitizeText(assignment.data?.assigned_server_id);
  if (assignment.error || !serverRowId) return null;

  const server = await adminClient
    .from("livekit_servers")
    .select("public_ws_url,internal_api_url")
    .eq("id", serverRowId)
    .maybeSingle();

  if (server.error || !server.data) return null;

  const publicWsUrl = sanitizeText(server.data.public_ws_url);
  if (!publicWsUrl) return null;

  return {
    apiUrl: deriveLiveKitApiUrl(publicWsUrl, sanitizeText(server.data.internal_api_url) || null),
    serverUrl: publicWsUrl,
  };
}

async function enforceParticipantState(
  adminClient: SupabaseClientLike,
  room: ResolvedRoomRecord,
  surface: LiveKitJoinSurface,
  targetUserId: string,
  actorUserId: string,
  livekitApiKey: string,
  livekitApiSecret: string,
): Promise<Response> {
  if (room.kind !== "watch-party") {
    return json(400, {
      error: "unsupported_surface",
      message: "Participant state enforcement is currently scoped to Live Stage and Watch-Party Live rooms.",
    });
  }

  if (actorUserId !== targetUserId && actorUserId !== room.hostUserId) {
    return json(403, {
      error: "insufficient_role",
      message: "Only the room host or the affected participant can enforce this LiveKit participant state.",
    });
  }

  const roomActive = isWatchPartyRoomCurrentlyActive(room);
  const roleResolution = roomActive
    ? await resolveEffectiveParticipantRole(adminClient, room, surface, "speaker", targetUserId)
    : null;
  const participantRole = roleResolution?.ok ? roleResolution.participantRole : "viewer";
  const canPublish = roleResolution?.ok ? roleResolution.canPublish : false;
  const requestedGrants = getRequestedLiveKitGrants(participantRole, canPublish);

  if (canPublish) {
    return json(200, {
      ok: true,
      disconnected: false,
      participantRole,
      requestedGrants,
      reason: roleResolution?.ok ? roleResolution.reason : "publish_allowed",
    });
  }

  const assignmentEndpoint = await fetchExistingLiveKitAssignmentEndpoint(adminClient, room.roomName);
  if (!assignmentEndpoint?.apiUrl) {
    return json(200, {
      ok: true,
      disconnected: false,
      participantRole,
      requestedGrants,
      reason: "no_existing_livekit_assignment",
    });
  }

  try {
    const roomService = new RoomServiceClient(assignmentEndpoint.apiUrl, livekitApiKey, livekitApiSecret);
    await roomService.removeParticipant(room.roomName, targetUserId);
    return json(200, {
      ok: true,
      disconnected: true,
      participantRole,
      requestedGrants,
      reason: roleResolution?.ok ? roleResolution.reason : "room_inactive_or_membership_stale",
    });
  } catch (error) {
    console.error("livekit participant enforcement failure", error);
    return json(502, {
      error: "participant_enforcement_failed",
      message: "Chi'llywood could not enforce the LiveKit participant downgrade on the assigned server.",
      participantRole,
      requestedGrants,
    });
  }
}

const readRequiredEnv = (key: string) => {
  const value = sanitizeText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

async function authenticateRequest(req: Request, supabaseUrl: string, supabaseAnonKey: string): Promise<LiveKitAuthResult> {
  const authorization = sanitizeText(req.headers.get("Authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: json(401, { error: "missing_authorization", message: "Bearer authorization is required." }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    return { error: json(401, { error: "invalid_session", message: "Supabase could not verify the current user session." }) };
  }

  return { user: data.user as LiveKitAuthenticatedUser };
}

async function isAccountAccessRestricted(
  adminClient: SupabaseClientLike,
  userId: string,
) {
  const { data, error } = await adminClient.rpc("is_account_access_restricted", {
    p_user_id: userId,
  });
  if (error) throw new Error(`Account status check failed: ${error.message}`);
  return data === true;
}

const writeLiveKitTokenRequestAudit = async (
  adminClient: SupabaseClientLike,
  input: {
    action?: LiveKitTokenAction | "unknown" | null;
    actorUserId: string;
    canPublish?: boolean | null;
    canPublishData?: boolean | null;
    canSubscribe?: boolean | null;
    effectiveParticipantRole?: LiveKitParticipantRole | null;
    errorCode?: string | null;
    outcome: "success" | "denied" | "error";
    requestedParticipantRole?: LiveKitParticipantRole | null;
    room?: ResolvedRoomRecord | null;
    roomJoin?: boolean | null;
    roomName?: string | null;
    securityContext?: SecurityRequestContextResult | null;
    surface?: LiveKitJoinSurface | null;
  },
) => {
  try {
    const roomName = sanitizeText(input.room?.roomName ?? input.roomName).toUpperCase();
    const roomHash = roomName ? await hashSecurityText(roomName, "livekit-token-request:room") : null;
    await adminClient.from("livekit_token_request_audit").insert({
      action: input.action ?? "unknown",
      actor_user_id: input.actorUserId,
      app_room_id_hash: roomHash,
      can_publish: typeof input.canPublish === "boolean" ? input.canPublish : null,
      can_publish_data: typeof input.canPublishData === "boolean" ? input.canPublishData : null,
      can_subscribe: typeof input.canSubscribe === "boolean" ? input.canSubscribe : null,
      effective_participant_role: input.effectiveParticipantRole ?? null,
      error_code: input.errorCode ? sanitizeText(input.errorCode).slice(0, 120) : null,
      metadata: {
        ...securityContextAuditMetadata(input.securityContext),
        token_stored: false,
      },
      outcome: input.outcome,
      requested_participant_role: input.requestedParticipantRole ?? null,
      room_join: typeof input.roomJoin === "boolean" ? input.roomJoin : null,
      room_kind: input.room?.kind ?? null,
      room_name_hash: roomHash,
      room_type: input.room?.kind === "watch-party" ? input.room.roomType : input.room?.kind === "communication" ? "chat-call" : null,
      security_context_id: input.securityContext?.id ?? null,
      surface: input.surface ?? null,
    });
  } catch (error) {
    console.error("livekit-token audit write failed", error instanceof Error ? error.message : String(error));
  }
};

async function resolveTargetRoom(
  adminClient: SupabaseClientLike,
  surface: LiveKitJoinSurface,
  roomName: string,
): Promise<ResolvedRoomRecord | null> {
  if (surface === "chat-call") {
    const communicationRoom = await adminClient
      .from("communication_rooms")
      .select("room_id,host_user_id,status,created_at,updated_at,last_activity_at")
      .eq("room_id", roomName)
      .maybeSingle();

    if (communicationRoom.error || !communicationRoom.data) return null;

    const chatThread = await adminClient
      .from("chat_threads")
      .select("id")
      .eq("active_communication_room_id", sanitizeText(communicationRoom.data.room_id))
      .maybeSingle();

    if (chatThread.error) return null;

    return {
      kind: "communication",
      roomName: sanitizeText(communicationRoom.data.room_id),
      hostUserId: sanitizeText(communicationRoom.data.host_user_id),
      status: sanitizeText(communicationRoom.data.status) || "ended",
      createdAt: sanitizeText(communicationRoom.data.created_at) || null,
      updatedAt: sanitizeText(communicationRoom.data.updated_at) || null,
      lastActivityAt: sanitizeText(communicationRoom.data.last_activity_at) || null,
      chatThreadId: chatThread.data ? sanitizeText(chatThread.data.id) : null,
    };
  }

  const watchPartyRoom = await adminClient
    .from("watch_party_rooms")
    .select("party_id,host_user_id,room_type,is_active,started_at,updated_at,last_activity_at")
    .eq("party_id", roomName)
    .maybeSingle();

  if (watchPartyRoom.error || !watchPartyRoom.data) return null;

  return {
    kind: "watch-party",
    roomName: sanitizeText(watchPartyRoom.data.party_id),
    hostUserId: sanitizeText(watchPartyRoom.data.host_user_id),
    roomType: sanitizeText(watchPartyRoom.data.room_type) || null,
    isActive: watchPartyRoom.data.is_active === true,
    startedAt: sanitizeText(watchPartyRoom.data.started_at) || null,
    updatedAt: sanitizeText(watchPartyRoom.data.updated_at) || null,
    lastActivityAt: sanitizeText(watchPartyRoom.data.last_activity_at) || null,
  };
}

async function userCanAccessChatThread(
  adminClient: SupabaseClientLike,
  threadId: string,
  userId: string,
) {
  const membership = await adminClient
    .from("chat_thread_members")
    .select("thread_id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  return !membership.error && !!membership.data;
}

async function isWatchPartyActorBlockedByHost(
  adminClient: SupabaseClientLike,
  room: Extract<ResolvedRoomRecord, { kind: "watch-party" }>,
  userId: string,
) {
  const actorUserId = sanitizeText(userId);
  if (!actorUserId || actorUserId === room.hostUserId) return false;

  const block = await adminClient
    .from("channel_audience_blocks")
    .select("channel_user_id")
    .eq("channel_user_id", room.hostUserId)
    .eq("blocked_user_id", actorUserId)
    .maybeSingle();

  if (block.error) return false;
  return !!block.data;
}

async function resolveEffectiveParticipantRole(
  adminClient: SupabaseClientLike,
  room: ResolvedRoomRecord,
  surface: LiveKitJoinSurface,
  requestedParticipantRole: LiveKitParticipantRole,
  userId: string,
) : Promise<EffectiveRoleResolution> {
  if (room.kind === "communication" && surface === "chat-call") {
    if (!room.chatThreadId) {
      return {
        ok: false,
        error: "missing_chat_thread",
        message: "This call is not linked to an active Chi'lly Chat thread.",
        status: 404,
      };
    }
    const canAccessChatThread = await userCanAccessChatThread(adminClient, room.chatThreadId, userId);
    if (!canAccessChatThread) {
      return {
        ok: false,
        error: "insufficient_role",
        message: "The current authenticated user is not allowed to join this Chi'lly Chat call.",
        status: 403,
      };
    }
  }

  if (room.hostUserId === userId) {
    return {
      ok: true,
      participantRole: "host",
      canPublish: true,
      membership: null,
      reason: "room_host",
    };
  }

  if (room.kind === "watch-party") {
    const blockedByHost = await isWatchPartyActorBlockedByHost(adminClient, room, userId);
    if (blockedByHost) {
      return {
        ok: false,
        error: "blocked_from_room",
        message: "This Chi'llywood room is not available for the current authenticated user.",
        status: 403,
      };
    }

    const memberships = await fetchWatchPartyMemberships(adminClient, room.roomName);
    if (!memberships) {
      return {
        ok: false,
        error: "membership_lookup_failed",
        message: "Chi'llywood could not verify this room membership before issuing a LiveKit token.",
        status: 503,
      };
    }

    const nowMillis = Date.now();
    const currentMembership = memberships.find((membership) => membership.userId === userId) ?? null;
    if (!isFreshWatchPartyMembership(currentMembership, nowMillis)) {
      return {
        ok: false,
        error: "insufficient_role",
        message: "The current authenticated user does not have a fresh active membership for this room.",
        status: 403,
      };
    }

    if (requestedParticipantRole === "viewer") {
      return {
        ok: true,
        participantRole: "viewer",
        canPublish: false,
        membership: currentMembership,
        reason: "viewer_requested",
      };
    }

    const speakerSeatIds = getAuthorizedWatchPartySpeakerSeatIds(memberships, room.hostUserId, nowMillis);
    const canUseSpeakerSeat = isWatchPartySpeakerSeatMembership(currentMembership)
      && speakerSeatIds.has(userId);

    if (!canUseSpeakerSeat) {
      return {
        ok: true,
        participantRole: "viewer",
        canPublish: false,
        membership: currentMembership,
        reason: "speaker_not_approved_or_over_cap",
      };
    }

    return {
      ok: true,
      participantRole: "speaker",
      canPublish: !currentMembership?.isMuted,
      membership: currentMembership,
      reason: currentMembership?.isMuted ? "approved_speaker_muted" : "approved_speaker",
    };
  }

  const membership = await adminClient
    .from("communication_room_memberships")
    .select("role,membership_state,last_seen_at")
    .eq("room_id", room.roomName)
    .eq("user_id", userId)
    .maybeSingle();

  if (membership.error || !membership.data) {
    return {
      ok: false,
      error: "insufficient_role",
      message: "The current authenticated user does not have a fresh active membership for this call.",
      status: 403,
    };
  }

  const role = sanitizeText(membership.data.role).toLowerCase();
  const membershipState = sanitizeText(membership.data.membership_state).toLowerCase();
  const lastSeenAt = sanitizeText(membership.data.last_seen_at);

  if (
    !ACTIVE_MEMBERSHIP_STATES.has(membershipState)
    || !isRecentTime(lastSeenAt, COMMUNICATION_MEMBERSHIP_ACTIVE_WINDOW_MS)
    || (role !== "host" && role !== "participant")
  ) {
    return {
      ok: false,
      error: "insufficient_role",
      message: "The current authenticated user does not have a fresh active membership for this call.",
      status: 403,
    };
  }

  if (requestedParticipantRole === "host" || requestedParticipantRole === "speaker") {
    return {
      ok: false,
      error: "insufficient_role",
      message: "Only the call host can mint a publish-capable Chi'lly Chat LiveKit token.",
      status: 403,
    };
  }

  return {
    ok: true,
    participantRole: "viewer",
    canPublish: false,
    membership: null,
    reason: "communication_participant_viewer",
  };
}

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  }

  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST for livekit-token requests." });
  }

  try {
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const livekitApiKey = readRequiredEnv("LIVEKIT_API_KEY");
    const livekitApiSecret = readRequiredEnv("LIVEKIT_API_SECRET");

    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const userId = sanitizeText(authResult.user.id);
    const securityContext = await captureSecurityRequestContext(adminClient, req, {
      source: "livekit-token",
      userId,
    });
    const auditAndJson = async (
      status: number,
      payload: Record<string, unknown>,
      details: {
        action?: LiveKitTokenAction | "unknown" | null;
        canPublish?: boolean | null;
        canPublishData?: boolean | null;
        canSubscribe?: boolean | null;
        effectiveParticipantRole?: LiveKitParticipantRole | null;
        requestedParticipantRole?: LiveKitParticipantRole | null;
        room?: ResolvedRoomRecord | null;
        roomJoin?: boolean | null;
        roomName?: string | null;
        surface?: LiveKitJoinSurface | null;
      } = {},
    ) => {
      await writeLiveKitTokenRequestAudit(adminClient, {
        ...details,
        actorUserId: userId,
        errorCode: sanitizeText(payload.error) || null,
        outcome: status >= 500 ? "error" : status >= 400 ? "denied" : "success",
        securityContext,
      });
      return json(status, payload);
    };

    if (await isAccountAccessRestricted(adminClient, userId)) {
      return await auditAndJson(403, {
        error: "account_access_restricted",
        message: "This account cannot join private live rooms or calls right now. Visit Support if you think this is a mistake.",
      }, {
        action: "unknown",
      });
    }

    const payload = await req.json().catch(() => null) as TokenRequestPayload | null;
    if (!payload || typeof payload !== "object") {
      return await auditAndJson(400, { error: "invalid_body", message: "Request body must be a JSON object." }, {
        action: "unknown",
      });
    }

    const surface = normalizeSurface(payload.surface);
    const action = normalizeAction(payload.action);
    const roomName = sanitizeText(payload.roomName).toUpperCase();
    const participantRole = normalizeRole(payload);

    if (!action) {
      return await auditAndJson(400, { error: "invalid_action", message: "action must be mint-token or enforce-participant-state." }, {
        action: "unknown",
        requestedParticipantRole: participantRole,
        roomName,
        surface,
      });
    }

    if (!surface) {
      return await auditAndJson(400, { error: "invalid_surface", message: "surface must be live-stage, watch-party-live, or chat-call." }, {
        action,
        requestedParticipantRole: participantRole,
        roomName,
      });
    }

    if (!roomName) {
      return await auditAndJson(400, { error: "missing_room_name", message: "roomName is required." }, {
        action,
        requestedParticipantRole: participantRole,
        surface,
      });
    }

    if (action === "mint-token" && !participantRole) {
      return await auditAndJson(400, { error: "invalid_role", message: "role must be host, speaker, or viewer." }, {
        action,
        roomName,
        surface,
      });
    }

    const room = await resolveTargetRoom(adminClient, surface, roomName);
    if (!room) {
      return await auditAndJson(404, {
        error: "room_not_found",
        message: "The requested Chi'llywood room does not exist in the current backend truth.",
      }, {
        action,
        requestedParticipantRole: participantRole,
        roomName,
        surface,
      });
    }

    if (action === "enforce-participant-state") {
      const targetUserId = sanitizeText(payload.targetParticipantIdentity ?? payload.participantIdentity);
      if (!targetUserId) {
        return await auditAndJson(400, {
          error: "missing_target_participant",
          message: "targetParticipantIdentity is required for participant state enforcement.",
        }, {
          action,
          room,
          roomName,
          surface,
        });
      }

      const enforcementResponse = await enforceParticipantState(
        adminClient,
        room,
        surface,
        targetUserId,
        userId,
        livekitApiKey,
        livekitApiSecret,
      );
      await writeLiveKitTokenRequestAudit(adminClient, {
        action,
        actorUserId: userId,
        errorCode: enforcementResponse.status >= 400 ? "participant_state_enforcement" : null,
        outcome: enforcementResponse.status >= 500 ? "error" : enforcementResponse.status >= 400 ? "denied" : "success",
        room,
        roomName,
        securityContext,
        surface,
      });
      return enforcementResponse ?? json(500, {
        error: "participant_enforcement_failed",
        message: "Chi'llywood could not enforce the LiveKit participant downgrade on the assigned server.",
      });
    }

    if (!participantRole) {
      return await auditAndJson(400, { error: "invalid_role", message: "role must be host, speaker, or viewer." }, {
        action,
        room,
        roomName,
        surface,
      });
    }

    if (room.kind === "watch-party") {
      if (!isWatchPartyRoomCurrentlyActive(room)) {
        return await auditAndJson(410, {
          error: "room_expired",
          message: "This Chi'llywood room has ended or expired. Return to the lobby to start or join a fresh room.",
        }, {
          action,
          requestedParticipantRole: participantRole,
          room,
          roomName,
          surface,
        });
      }

      const roomType = sanitizeText(room.roomType).toLowerCase();
      if (surface === "live-stage" && roomType !== "live") {
        return await auditAndJson(409, {
          error: "room_surface_mismatch",
          message: "Live Stage tokens can only be issued for Live Watch-Party rooms.",
        }, {
          action,
          requestedParticipantRole: participantRole,
          room,
          roomName,
          surface,
        });
      }

      if (surface === "watch-party-live" && roomType === "live") {
        return await auditAndJson(409, {
          error: "room_surface_mismatch",
          message: "Watch-Party Live tokens can only be issued for Party Room sources.",
        }, {
          action,
          requestedParticipantRole: participantRole,
          room,
          roomName,
          surface,
        });
      }
    }

    if (room.kind === "communication" && !isCommunicationRoomCurrentlyActive(room)) {
      return await auditAndJson(410, {
        error: "room_expired",
        message: "This Chi'llywood call has ended or expired. Return to the thread to start or join a fresh call.",
      }, {
        action,
        requestedParticipantRole: participantRole,
        room,
        roomName,
        surface,
      });
    }

    const tokenMetadata = sanitizeMetadata(payload.metadata);
    const effectiveRole = await resolveEffectiveParticipantRole(
      adminClient,
      room,
      surface,
      participantRole,
      userId,
    );

    if (!effectiveRole.ok) {
      return await auditAndJson(effectiveRole.status, {
        error: effectiveRole.error,
        message: effectiveRole.message,
      }, {
        action,
        requestedParticipantRole: participantRole,
        room,
        roomName,
        surface,
      });
    }

    const participantName = resolveParticipantName(payload, authResult.user);
    const effectiveParticipantRole = effectiveRole.participantRole;
    const requestedGrants = getRequestedLiveKitGrants(effectiveParticipantRole, effectiveRole.canPublish);
    const participantIdentity = userId;
    const routingRoomType = normalizeLiveKitRoutingRoomType(
      surface,
      room.kind,
      room.kind === "watch-party" ? room.roomType : null,
    );
    const routing = await resolveLiveKitAssignment(adminClient, {
      actorUserId: userId,
      appRoomId: room.roomName,
      livekitRoomName: room.roomName,
      metadata: {
        roomKind: room.kind,
        roomType: room.kind === "watch-party" ? room.roomType : null,
        surface,
      },
      requestedRegion: sanitizeText(tokenMetadata.requestedRegion ?? tokenMetadata.region) || null,
      roomType: routingRoomType,
    });

    if (!routing.ok) {
      return await auditAndJson(routing.status, {
        error: routing.error,
        message: routing.message,
      }, {
        action,
        effectiveParticipantRole,
        requestedParticipantRole: participantRole,
        room,
        roomName,
        surface,
      });
    }

    const liveCostGuardDecision = await readLiveCostGuardTokenDecision(adminClient, surface);
    if (liveCostGuardDecision.blockNewLiveRooms) {
      return await auditAndJson(429, {
        error: "live_cost_guard_pause_active",
        message: liveCostGuardDecision.reason ?? "Live Cost Guard is temporarily pausing new live room tokens.",
      }, {
        action,
        effectiveParticipantRole,
        requestedParticipantRole: participantRole,
        room,
        roomName,
        surface,
      });
    }

    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: participantIdentity,
      metadata: JSON.stringify({
        app: "chillywood-mobile",
        roomKind: room.kind,
        roomType: room.kind === "watch-party" ? room.roomType : null,
        roomName: room.roomName,
        surface,
        userId,
        participantRole: effectiveParticipantRole,
        requestedParticipantRole: participantRole,
        roleResolution: effectiveRole.reason,
        ...tokenMetadata,
      }),
      name: participantName,
      ttl: liveCostGuardDecision.tokenTtlSeconds ? `${liveCostGuardDecision.tokenTtlSeconds}s` : "1h",
    });

    accessToken.addGrant({
      canPublish: requestedGrants.canPublish,
      canPublishData: requestedGrants.canPublishData,
      canSubscribe: requestedGrants.canSubscribe,
      room: room.roomName,
      roomJoin: requestedGrants.roomJoin,
    });

    const participantToken = await accessToken.toJwt();

    return await auditAndJson(200, {
      participantToken,
      participantRole: effectiveParticipantRole,
      requestedParticipantRole: participantRole,
      requestedGrants,
      serverUrl: routing.serverUrl,
    }, {
      action,
      canPublish: requestedGrants.canPublish,
      canPublishData: requestedGrants.canPublishData,
      canSubscribe: requestedGrants.canSubscribe,
      effectiveParticipantRole,
      requestedParticipantRole: participantRole,
      room,
      roomJoin: requestedGrants.roomJoin,
      roomName,
      surface,
    });
  } catch (error) {
    console.error("livekit-token failure", error);
    return json(500, {
      error: "token_issuance_failed",
      message: "Chi'llywood could not mint a LiveKit participant token for this request.",
    });
  }
});
