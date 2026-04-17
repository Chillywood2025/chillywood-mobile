import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

type LiveKitJoinSurface = "live-stage" | "watch-party-live" | "chat-call";
type LiveKitParticipantRole = "host" | "speaker" | "viewer";

type LiveKitRequestedGrants = {
  roomJoin: boolean;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
};

type TokenRequestPayload = {
  surface?: unknown;
  roomName?: unknown;
  role?: unknown;
  participantRole?: unknown;
  participantIdentity?: unknown;
  participantName?: unknown;
  requestedGrants?: unknown;
  metadata?: unknown;
};

type ScalarMetadataValue = boolean | number | string | null;

type ResolvedRoomRecord =
  | {
      kind: "watch-party";
      roomName: string;
      hostUserId: string;
      roomType: string | null;
    }
  | {
      kind: "communication";
      roomName: string;
      hostUserId: string;
    };

const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const ACTIVE_MEMBERSHIP_STATES = new Set(["active", "reconnecting"]);

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const sanitizeText = (value: unknown) => String(value ?? "").trim();

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

const normalizeRole = (payload: TokenRequestPayload): LiveKitParticipantRole | null => {
  const raw = sanitizeText(payload.participantRole ?? payload.role).toLowerCase();
  if (raw === "host") return "host";
  if (raw === "speaker") return "speaker";
  if (raw === "viewer") return "viewer";
  return null;
};

const getRequestedLiveKitGrants = (
  participantRole: LiveKitParticipantRole,
): LiveKitRequestedGrants => {
  if (participantRole === "host" || participantRole === "speaker") {
    return {
      roomJoin: true,
      canPublish: true,
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

const readRequiredEnv = (key: string) => {
  const value = sanitizeText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

async function authenticateRequest(req: Request, supabaseUrl: string, supabaseAnonKey: string) {
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

  return { user: data.user };
}

async function resolveTargetRoom(
  adminClient: ReturnType<typeof createClient>,
  surface: LiveKitJoinSurface,
  roomName: string,
): Promise<ResolvedRoomRecord | null> {
  if (surface === "chat-call") {
    const communicationRoom = await adminClient
      .from("communication_rooms")
      .select("room_id,host_user_id")
      .eq("room_id", roomName)
      .maybeSingle();

    if (communicationRoom.error || !communicationRoom.data) return null;

    return {
      kind: "communication",
      roomName: sanitizeText(communicationRoom.data.room_id),
      hostUserId: sanitizeText(communicationRoom.data.host_user_id),
    };
  }

  const watchPartyRoom = await adminClient
    .from("watch_party_rooms")
    .select("party_id,host_user_id,room_type")
    .eq("party_id", roomName)
    .maybeSingle();

  if (watchPartyRoom.error || !watchPartyRoom.data) return null;

  return {
    kind: "watch-party",
    roomName: sanitizeText(watchPartyRoom.data.party_id),
    hostUserId: sanitizeText(watchPartyRoom.data.host_user_id),
    roomType: sanitizeText(watchPartyRoom.data.room_type) || null,
  };
}

async function userCanJoinAsRequestedRole(
  adminClient: ReturnType<typeof createClient>,
  room: ResolvedRoomRecord,
  participantRole: LiveKitParticipantRole,
  userId: string,
) {
  if (room.hostUserId === userId) return true;

  if (room.kind === "watch-party") {
    if (participantRole === "viewer") return true;

    const membership = await adminClient
      .from("watch_party_room_memberships")
      .select("role,stage_role,can_speak,membership_state")
      .eq("party_id", room.roomName)
      .eq("user_id", userId)
      .maybeSingle();

    if (membership.error || !membership.data) return false;

    const role = sanitizeText(membership.data.role).toLowerCase();
    const stageRole = sanitizeText(membership.data.stage_role).toLowerCase();
    const membershipState = sanitizeText(membership.data.membership_state).toLowerCase();
    const canSpeak = membership.data.can_speak === true;

    if (!ACTIVE_MEMBERSHIP_STATES.has(membershipState)) return false;
    if (participantRole === "host") return role === "host";
    return role === "host" || stageRole === "host" || stageRole === "speaker" || canSpeak;
  }

  const membership = await adminClient
    .from("communication_room_memberships")
    .select("role,membership_state")
    .eq("room_id", room.roomName)
    .eq("user_id", userId)
    .maybeSingle();

  if (membership.error || !membership.data) return false;

  const role = sanitizeText(membership.data.role).toLowerCase();
  const membershipState = sanitizeText(membership.data.membership_state).toLowerCase();

  if (!ACTIVE_MEMBERSHIP_STATES.has(membershipState)) return false;
  if (participantRole === "viewer") return role === "host" || role === "participant";
  if (participantRole === "host") return role === "host";
  return role === "host";
}

Deno.serve(async (req) => {
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
    const livekitServerUrl = readRequiredEnv("LIVEKIT_URL");

    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;

    const payload = await req.json().catch(() => null) as TokenRequestPayload | null;
    if (!payload || typeof payload !== "object") {
      return json(400, { error: "invalid_body", message: "Request body must be a JSON object." });
    }

    const surface = normalizeSurface(payload.surface);
    const roomName = sanitizeText(payload.roomName).toUpperCase();
    const participantRole = normalizeRole(payload);

    if (!surface) {
      return json(400, { error: "invalid_surface", message: "surface must be live-stage, watch-party-live, or chat-call." });
    }

    if (!roomName) {
      return json(400, { error: "missing_room_name", message: "roomName is required." });
    }

    if (!participantRole) {
      return json(400, { error: "invalid_role", message: "role must be host, speaker, or viewer." });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const room = await resolveTargetRoom(adminClient, surface, roomName);
    if (!room) {
      return json(404, {
        error: "room_not_found",
        message: "The requested Chi'llywood room does not exist in the current backend truth.",
      });
    }

    const userId = sanitizeText(authResult.user.id);
    const canJoinRequestedRole = await userCanJoinAsRequestedRole(adminClient, room, participantRole, userId);

    if (!canJoinRequestedRole) {
      return json(403, {
        error: "insufficient_role",
        message:
          "The current authenticated user is not allowed to mint the requested LiveKit participant role for this room.",
      });
    }

    const participantName = resolveParticipantName(payload, authResult.user);
    const requestedGrants = getRequestedLiveKitGrants(participantRole);
    const tokenMetadata = sanitizeMetadata(payload.metadata);
    const participantIdentity = userId;
    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: participantIdentity,
      metadata: JSON.stringify({
        app: "chillywood-mobile",
        roomKind: room.kind,
        roomType: room.kind === "watch-party" ? room.roomType : null,
        roomName: room.roomName,
        surface,
        userId,
        ...tokenMetadata,
      }),
      name: participantName,
      ttl: "1h",
    });

    accessToken.addGrant({
      canPublish: requestedGrants.canPublish,
      canPublishData: requestedGrants.canPublishData,
      canSubscribe: requestedGrants.canSubscribe,
      room: room.roomName,
      roomJoin: requestedGrants.roomJoin,
    });

    const participantToken = await accessToken.toJwt();

    return json(200, {
      participantToken,
      serverUrl: livekitServerUrl,
    });
  } catch (error) {
    console.error("livekit-token failure", error);
    return json(500, {
      error: "token_issuance_failed",
      message: "Chi'llywood could not mint a LiveKit participant token for this request.",
    });
  }
});
