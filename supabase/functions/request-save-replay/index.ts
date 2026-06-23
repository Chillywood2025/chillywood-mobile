import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

type AuthenticatedUser = {
  email: string | null;
  id: string;
};

type ReplayPayload = {
  action?: unknown;
  partyId?: unknown;
  party_id?: unknown;
  sourceType?: unknown;
  source_type?: unknown;
  title?: unknown;
  description?: unknown;
};

type PartyRoomRow = {
  host_user_id: string | null;
  is_active: boolean | null;
  party_id: string;
  source_id: string | null;
  source_type: string | null;
  title_id: string | null;
};

type BroadcastSessionRow = {
  access_type: string | null;
  broadcast_status: string | null;
  channel_user_id: string | null;
  egress_status: string | null;
  host_user_id: string | null;
  id: string;
  is_publicly_watchable: boolean | null;
  is_spectator_playback_enabled: boolean | null;
  metadata: JsonObject | null;
  playback_url_status: string | null;
  requires_premium: boolean | null;
  requires_ticket: boolean | null;
  rights_status: string | null;
  source_room_id: string | null;
  source_type: string | null;
  thumbnail_url: string | null;
  watch_party_room_id: string | null;
};

type PlaybackRecordRow = {
  access_type: string | null;
  broadcast_session_id: string;
  id: string;
  is_publicly_watchable: boolean | null;
  is_spectator_playback_enabled: boolean | null;
  playback_status: string | null;
  requires_premium: boolean | null;
  requires_ticket: boolean | null;
  rights_status: string | null;
  visibility: string | null;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const SAFE_REPLAY_RIGHTS = new Set(["creator_owned", "chillywood_original", "licensed_for_public_stream"]);

const toText = (value: unknown) => String(value ?? "").trim();

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown Save Replay error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._~+/=-]+/g, "[redacted-token]")
    .replace(/https:\/\/[^\s"']+/gi, "[redacted-url]")
    .slice(0, 240);
};

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const createAdminClient = () => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const authenticateRequest = async (req: Request): Promise<{ user: AuthenticatedUser } | { error: Response }> => {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return {
      error: jsonResponse(401, {
        error: "auth_required",
        message: "Sign in before saving a replay.",
      }),
    };
  }

  const authClient = createClient(readRequiredEnv("SUPABASE_URL"), readRequiredEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    return {
      error: jsonResponse(401, {
        error: "invalid_session",
        message: "Sign in before saving a replay.",
      }),
    };
  }
  return { user: { email: data.user.email ?? null, id: data.user.id } };
};

const normalizeSourceType = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "live_stage" || normalized === "live_stage_room" || normalized === "live") return "live_stage";
  return "watch_party_live";
};

const readPartyRoom = async (adminClient: SupabaseClientLike, partyId: string) => {
  const { data, error } = await adminClient
    .from("watch_party_rooms")
    .select("party_id,host_user_id,title_id,source_type,source_id,is_active")
    .eq("party_id", partyId)
    .maybeSingle();
  if (error) throw new Error(`party_room_read_failed:${error.message}`);
  return (data ?? null) as PartyRoomRow | null;
};

const readBroadcastSession = async (adminClient: SupabaseClientLike, partyId: string) => {
  const { data, error } = await adminClient
    .from("room_broadcast_sessions")
    .select([
      "id",
      "source_type",
      "source_room_id",
      "watch_party_room_id",
      "host_user_id",
      "channel_user_id",
      "broadcast_status",
      "egress_status",
      "playback_url_status",
      "rights_status",
      "access_type",
      "is_publicly_watchable",
      "is_spectator_playback_enabled",
      "requires_premium",
      "requires_ticket",
      "thumbnail_url",
      "metadata",
    ].join(","))
    .or(`source_room_id.eq.${partyId},watch_party_room_id.eq.${partyId}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`broadcast_session_read_failed:${error.message}`);
  return (data ?? null) as BroadcastSessionRow | null;
};

const readPlaybackRecord = async (adminClient: SupabaseClientLike, broadcastSessionId: string) => {
  const { data, error } = await adminClient
    .from("spectator_hls_playback_records")
    .select([
      "id",
      "broadcast_session_id",
      "visibility",
      "access_type",
      "rights_status",
      "playback_status",
      "is_publicly_watchable",
      "is_spectator_playback_enabled",
      "requires_premium",
      "requires_ticket",
    ].join(","))
    .eq("broadcast_session_id", broadcastSessionId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`playback_record_read_failed:${error.message}`);
  return (data ?? null) as PlaybackRecordRow | null;
};

const isReplayRightsSafe = (rightsStatus: unknown) => SAFE_REPLAY_RIGHTS.has(toText(rightsStatus));

const sourceRightsBlocked = (sourceType: string, room: PartyRoomRow, session: BroadcastSessionRow | null) => {
  if (!isReplayRightsSafe(session?.rights_status)) return true;
  if (sourceType === "watch_party_live" && toText(room.source_type) === "platform_title") return true;
  return false;
};

const computeSaveStatus = (session: BroadcastSessionRow | null, record: PlaybackRecordRow | null) => {
  if (!session) return "recording_not_started";
  if (session.egress_status === "failed_later" || session.broadcast_status === "failed_later") return "failed";
  if (!record) {
    if (session.egress_status === "active_later" || session.egress_status === "stopping_later") return "processing_replay";
    return "recording_not_started";
  }
  if (record.playback_status === "failed") return "failed";
  if (record.playback_status === "live" || record.playback_status === "ended") return "ready";
  return "processing_replay";
};

const safeTitle = (payload: ReplayPayload, sourceType: string, partyId: string) => {
  const requested = toText(payload.title);
  if (requested) return requested.slice(0, 140);
  return sourceType === "live_stage" ? `Live Stage Replay ${partyId}` : `Watch-Party Live Replay ${partyId}`;
};

const markRoomEnded = async (adminClient: SupabaseClientLike, partyId: string) => {
  await adminClient
    .from("watch_party_rooms")
    .update({
      is_active: false,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("party_id", partyId);
};

const endWithoutSaving = async (adminClient: SupabaseClientLike, partyId: string) => {
  await markRoomEnded(adminClient, partyId);
  return jsonResponse(200, {
    action: "end_without_saving",
    ended: true,
    replayCreated: false,
    rawHlsUrlReturned: false,
    fullRoomTokenForSpectators: false,
    liveKitPublishAuthorityGranted: false,
  });
};

const requestSaveReplay = async (
  adminClient: SupabaseClientLike,
  partyId: string,
  sourceType: string,
  room: PartyRoomRow,
  payload: ReplayPayload,
) => {
  const session = await readBroadcastSession(adminClient, partyId);
  const record = session ? await readPlaybackRecord(adminClient, session.id) : null;
  const saveStatus = computeSaveStatus(session, record);

  if (!session || saveStatus === "recording_not_started") {
    return jsonResponse(409, {
      error: "recording_not_started",
      message: "Replay was not recording for this session. End without saving?",
      saveStatus: "recording_not_started",
      replayCreated: false,
      rawHlsUrlReturned: false,
      fullRoomTokenForSpectators: false,
      liveKitPublishAuthorityGranted: false,
    });
  }

  if (sourceRightsBlocked(sourceType, room, session)) {
    return jsonResponse(403, {
      error: "replay_rights_blocked",
      message: "This Watch-Party Live replay cannot be saved because replay rights are not cleared.",
      saveStatus: "failed",
      replayCreated: false,
      rawHlsUrlReturned: false,
      fullRoomTokenForSpectators: false,
      liveKitPublishAuthorityGranted: false,
    });
  }

  const ownerUserId = toText(session.channel_user_id) || toText(session.host_user_id) || toText(room.host_user_id);
  const replayPayload = {
    owner_user_id: ownerUserId,
    source_type: sourceType,
    source_room_id: toText(session.source_room_id) || partyId,
    party_id: partyId,
    broadcast_session_id: session.id,
    title: safeTitle(payload, sourceType, partyId),
    description: toText(payload.description) || "Saved host replay. It stays in Content Library until the creator changes visibility.",
    thumbnail_url: toText(session.thumbnail_url) || null,
    visibility: "draft",
    rights_status: toText(session.rights_status) || "unknown_block_replay",
    save_status: saveStatus === "ready" ? "ready" : saveStatus,
    playback_record_id: record?.id ?? null,
    moderation_status: "clean",
    money_status: "free",
    error_code: saveStatus === "failed" ? "broadcast_failed" : null,
    metadata: {
      created_by: "request-save-replay",
      full_room_token_for_spectators: false,
      livekit_publish_authority_granted: false,
      replay_destination: "content_library",
      source_route: sourceType === "live_stage" ? "/watch-party/live-stage/[partyId]" : "/watch-party/[partyId]",
    },
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminClient
    .from("creator_replay_library_items")
    .upsert(replayPayload, { onConflict: "broadcast_session_id" })
    .select("id,save_status,visibility,playback_record_id")
    .single();
  if (error) throw new Error(`creator_replay_upsert_failed:${error.message}`);

  await markRoomEnded(adminClient, partyId);

  return jsonResponse(200, {
    action: "request_save_replay",
    ended: true,
    replayCreated: true,
    replayItemId: data.id,
    saveStatus: data.save_status,
    visibility: data.visibility,
    playbackRecordBacked: !!data.playback_record_id,
    rawHlsUrlReturned: false,
    fullRoomTokenForSpectators: false,
    liveKitPublishAuthorityGranted: false,
    message: data.save_status === "ready"
      ? "Replay saved to Content Library."
      : "Replay is processing. You'll see it in Content Library when it's ready.",
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      message: "Use POST to request Save Replay.",
    });
  }

  try {
    const authResult = await authenticateRequest(req);
    if ("error" in authResult) return authResult.error;

    const payload = (await req.json().catch(() => ({}))) as ReplayPayload;
    const partyId = toText(payload.partyId ?? payload.party_id).toUpperCase();
    if (!partyId) {
      return jsonResponse(400, {
        error: "party_id_required",
        message: "partyId is required to save a replay.",
      });
    }

    const adminClient = createAdminClient();
    const room = await readPartyRoom(adminClient, partyId);
    if (!room) {
      return jsonResponse(404, {
        error: "room_not_found",
        message: "This live room could not be found.",
      });
    }

    if (toText(room.host_user_id) !== authResult.user.id) {
      return jsonResponse(403, {
        error: "host_required",
        message: "Only the host can save this replay.",
        rawHlsUrlReturned: false,
        fullRoomTokenForSpectators: false,
        liveKitPublishAuthorityGranted: false,
      });
    }

    const action = toText(payload.action) || "request_save_replay";
    if (action === "end_without_saving") {
      return await endWithoutSaving(adminClient, partyId);
    }

    return await requestSaveReplay(
      adminClient,
      partyId,
      normalizeSourceType(payload.sourceType ?? payload.source_type),
      room,
      payload,
    );
  } catch (error) {
    return jsonResponse(500, {
      error: "save_replay_failed",
      message: sanitizeErrorMessage(error),
      rawHlsUrlReturned: false,
      fullRoomTokenForSpectators: false,
      liveKitPublishAuthorityGranted: false,
    });
  }
});
