import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

type AuthenticatedUser = {
  email: string | null;
  id: string;
};

type ReplayItemRow = {
  id: string;
  owner_user_id: string;
  title: string | null;
  description: string | null;
  visibility: string | null;
  rights_status: string | null;
  save_status: string | null;
  playback_record_id: string | null;
  moderation_status: string | null;
  money_status: string | null;
  error_code: string | null;
};

type PlaybackRecordRow = {
  broadcast_session_id: string;
  id: string;
  playback_status: string | null;
};

type BroadcastSessionRow = {
  hls_playback_url: string | null;
  id: string;
  playback_url_status: string | null;
  rights_status: string | null;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const PLAYLIST_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "no-store",
  "Content-Type": "application/vnd.apple.mpegurl",
} as const;

const SAFE_REPLAY_RIGHTS = new Set(["creator_owned", "chillywood_original", "licensed_for_public_stream"]);
const TOKEN_TTL_SECONDS = 15 * 60;
const textEncoder = new TextEncoder();

const toText = (value: unknown) => String(value ?? "").trim();

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown creator replay playback error.");
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

const readOptionalEnv = (key: string) => toText(Deno.env.get(key)) || null;

const createAdminClient = () => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const createAnonClient = (authorization: string) => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_ANON_KEY"),
  {
    auth: { persistSession: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
  },
);

const authenticateOptional = async (req: Request): Promise<AuthenticatedUser | null> => {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const { data, error } = await createAnonClient(authorization).auth.getUser();
  if (error || !data.user) return null;
  return { email: data.user.email ?? null, id: data.user.id };
};

const readReplayItem = async (adminClient: SupabaseClientLike, replayId: string) => {
  const { data, error } = await adminClient
    .from("creator_replay_library_items")
    .select("id,owner_user_id,title,description,visibility,rights_status,save_status,playback_record_id,moderation_status,money_status,error_code")
    .eq("id", replayId)
    .maybeSingle();
  if (error) throw new Error(`replay_read_failed:${error.message}`);
  return (data ?? null) as ReplayItemRow | null;
};

const readPlaybackRecord = async (adminClient: SupabaseClientLike, recordId: string) => {
  const { data, error } = await adminClient
    .from("spectator_hls_playback_records")
    .select("id,broadcast_session_id,playback_status")
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw new Error(`playback_record_read_failed:${error.message}`);
  return (data ?? null) as PlaybackRecordRow | null;
};

const readBroadcastSession = async (adminClient: SupabaseClientLike, sessionId: string) => {
  const { data, error } = await adminClient
    .from("room_broadcast_sessions")
    .select("id,hls_playback_url,playback_url_status,rights_status")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`broadcast_session_read_failed:${error.message}`);
  return (data ?? null) as BroadcastSessionRow | null;
};

const rpcBoolean = async (adminClient: SupabaseClientLike, name: string, args: JsonObject) => {
  const { data, error } = await adminClient.rpc(name, args);
  if (error) return false;
  return data === true;
};

const isApprovedHlsPlaylistUrl = (value: unknown) => {
  const normalized = toText(value);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" && parsed.pathname.toLowerCase().endsWith(".m3u8")
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const functionBaseUrl = (req: Request) => {
  const url = new URL(req.url);
  const isLocalhost = ["127.0.0.1", "localhost"].includes(url.hostname);
  const protocol = isLocalhost ? url.protocol : "https:";
  const origin = `${protocol}//${url.host}`;
  const marker = "/functions/v1/creator-replay-playback";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex >= 0) return `${origin}${url.pathname.slice(0, markerIndex + marker.length)}`;
  return `${origin}/functions/v1/creator-replay-playback`;
};

const baseState = (
  state: string,
  title: string,
  copy: string,
  extra: JsonObject = {},
) => ({
  canRenderPlayback: false,
  copy,
  fullRoomTokenForSpectators: false,
  liveKitPublishAuthorityGranted: false,
  playbackUrl: null,
  rawHlsUrlReturned: false,
  state,
  title,
  ...extra,
});

const signToken = async (payload: JsonObject) => {
  const secret = readOptionalEnv("CREATOR_REPLAY_PLAYBACK_TOKEN_SECRET")
    || readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(body));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${body}.${sig}`;
};

const decodeBase64UrlJson = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return JSON.parse(atob(padded)) as JsonObject;
};

const verifyToken = async (token: string, replayId: string) => {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const parsedPayload = (() => {
    try {
      return decodeBase64UrlJson(body);
    } catch {
      return null;
    }
  })();
  if (!parsedPayload) return null;
  const expected = await signToken(parsedPayload).catch(() => "");
  if (expected !== token) return null;
  const payload = parsedPayload as { replayId?: unknown; userId?: unknown; exp?: unknown };
  if (toText(payload.replayId) !== replayId) return null;
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return { userId: toText(payload.userId) || null };
};

const resolveReplayAccess = async (
  adminClient: SupabaseClientLike,
  replay: ReplayItemRow,
  viewer: AuthenticatedUser | null,
) => {
  const visibility = toText(replay.visibility) || "draft";
  const saveStatus = toText(replay.save_status) || "requested";
  const rightsStatus = toText(replay.rights_status) || "unknown_block_replay";
  const moderationStatus = toText(replay.moderation_status) || "clean";
  const viewerId = viewer?.id ?? null;
  const isOwner = !!viewerId && viewerId === replay.owner_user_id;

  if (saveStatus === "deleted") {
    return baseState("unavailable", "Replay unavailable", "This replay is no longer available.");
  }

  if (saveStatus === "processing_replay" || saveStatus === "requested" || saveStatus === "recording_active" || saveStatus === "recording_stopping") {
    return isOwner
      ? baseState("processing", "Replay is processing", "Replay is processing. You'll see it in Content Library when it's ready.", { ownerAllowed: true })
      : baseState("locked_private", "Replay unavailable", "This replay is not available publicly.");
  }

  if (saveStatus === "failed" || saveStatus === "recording_not_started") {
    return isOwner
      ? baseState("failed", "Replay failed", replay.error_code || "Replay processing failed or was not recorded.", { ownerAllowed: true })
      : baseState("locked_private", "Replay unavailable", "This replay is not available publicly.");
  }

  if (!SAFE_REPLAY_RIGHTS.has(rightsStatus)) {
    return baseState("blocked_by_rights", "Replay blocked by rights", "This replay cannot play because replay rights are not cleared.");
  }

  if (moderationStatus !== "clean" && moderationStatus !== "reported") {
    return baseState("blocked_by_rights", "Replay unavailable", "This replay is blocked until safety review clears it.");
  }

  if (isOwner) {
    return { allowed: true, accessReason: "owner_allowed", tokenRequired: visibility !== "public" };
  }

  if (visibility === "public") {
    if (viewerId && await rpcBoolean(adminClient, "is_creator_replay_viewer_blocked", {
      p_owner_user_id: replay.owner_user_id,
      p_viewer_user_id: viewerId,
    })) {
      return baseState("locked_private", "Replay unavailable", "This replay is not available to this viewer.");
    }
    return { allowed: true, accessReason: "public_allowed", tokenRequired: false };
  }

  if (visibility === "circle") {
    if (!viewerId) return baseState("locked_private", "Replay private", "This replay is private to the creator's Chi'lly Circle.");
    const canRead = await rpcBoolean(adminClient, "can_read_creator_replay_library_item", {
      p_replay_id: replay.id,
      p_viewer_user_id: viewerId,
    });
    if (!canRead) return baseState("locked_private", "Replay private", "This replay is private to the creator's Chi'lly Circle.");
    return { allowed: true, accessReason: "circle_member_allowed", tokenRequired: true };
  }

  return baseState("locked_private", "Replay private", "This replay is saved as a Draft in the creator's Content Library.");
};

const readReadyPlayback = async (adminClient: SupabaseClientLike, replay: ReplayItemRow) => {
  const recordId = toText(replay.playback_record_id);
  if (!recordId) return { error: baseState("unavailable", "Replay unavailable", "No controlled playback record is attached to this replay.") };
  const record = await readPlaybackRecord(adminClient, recordId);
  if (!record) return { error: baseState("unavailable", "Replay unavailable", "The controlled playback record is unavailable.") };
  const session = await readBroadcastSession(adminClient, record.broadcast_session_id);
  if (!session) return { error: baseState("unavailable", "Replay unavailable", "The replay broadcast session is unavailable.") };
  if (!SAFE_REPLAY_RIGHTS.has(toText(session.rights_status))) {
    return { error: baseState("blocked_by_rights", "Replay blocked by rights", "This replay cannot play because replay rights are not cleared.") };
  }
  if (!isApprovedHlsPlaylistUrl(session.hls_playback_url)) {
    return { error: baseState("unavailable", "Replay unavailable", "The approved controlled playback source is missing.") };
  }
  return { record, session };
};

const handleStateRead = async (req: Request, adminClient: SupabaseClientLike, replayId: string) => {
  const replay = await readReplayItem(adminClient, replayId);
  if (!replay) return baseState("unavailable", "Replay unavailable", "This replay could not be found.");
  const viewer = await authenticateOptional(req);
  const access = await resolveReplayAccess(adminClient, replay, viewer);
  if (!("allowed" in access) || access.allowed !== true) return access;
  const playback = await readReadyPlayback(adminClient, replay);
  if ("error" in playback) return playback.error;
  const now = Math.floor(Date.now() / 1000);
  const token = access.tokenRequired || replay.visibility !== "public"
    ? await signToken({ exp: now + TOKEN_TTL_SECONDS, replayId: replay.id, userId: viewer?.id ?? "public" })
    : "";
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
  return {
    accessReason: access.accessReason,
    canRenderPlayback: true,
    copy: "Replay playback is controlled and watch-only.",
    fullRoomTokenForSpectators: false,
    liveKitPublishAuthorityGranted: false,
    playbackUrl: `${functionBaseUrl(req)}/records/${encodeURIComponent(replay.id)}/index.m3u8${tokenQuery}`,
    rawHlsUrlReturned: false,
    state: "ready",
    title: replay.title || "Saved Replay",
  };
};

const parseRecordRoute = (req: Request) => {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const functionIndex = segments.findIndex((segment) => segment === "creator-replay-playback");
  const route = functionIndex >= 0 ? segments.slice(functionIndex + 1) : segments;
  if (route[0] !== "records" || !route[1]) return null;
  if (route[2] === "index.m3u8") return { kind: "playlist" as const, replayId: route[1], segmentPath: null };
  if (route[2] === "segment") return { kind: "segment" as const, replayId: route[1], segmentPath: url.searchParams.get("path") };
  return null;
};

const safeSegmentUrl = (playlistUrl: string, segmentPath: string) => {
  if (!segmentPath || /[\u0000-\u001F]/.test(segmentPath) || segmentPath.length > 600) return null;
  const base = new URL(playlistUrl);
  const target = new URL(segmentPath, base);
  const baseDir = base.pathname.slice(0, base.pathname.lastIndexOf("/") + 1);
  if (target.origin !== base.origin) return null;
  if (!target.pathname.startsWith(baseDir)) return null;
  return target.toString();
};

const fetchApprovedHlsUrl = (url: string, headers?: HeadersInit) => fetch(url, { headers, redirect: "follow" });

const authorizeRecordRoute = async (
  req: Request,
  adminClient: SupabaseClientLike,
  replayId: string,
): Promise<
  | { error: Response }
  | { replay: ReplayItemRow; session: BroadcastSessionRow; token: string }
> => {
  const replay = await readReplayItem(adminClient, replayId);
  if (!replay) return { error: jsonResponse(404, baseState("unavailable", "Replay unavailable", "This replay could not be found.")) };
  const token = new URL(req.url).searchParams.get("token") || "";
  const tokenPayload = token ? await verifyToken(token, replay.id) : null;
  const viewer = tokenPayload?.userId && tokenPayload.userId !== "public"
    ? { email: null, id: tokenPayload.userId }
    : await authenticateOptional(req);
  const access = await resolveReplayAccess(adminClient, replay, viewer);
  if (!("allowed" in access) || access.allowed !== true) {
    return { error: jsonResponse(403, { ...access, rawHlsUrlReturned: false }) };
  }
  if ((access.tokenRequired || replay.visibility !== "public") && !tokenPayload) {
    return { error: jsonResponse(403, baseState("locked_private", "Replay private", "Replay playback requires an authorized controlled URL.")) };
  }
  const playback = await readReadyPlayback(adminClient, replay);
  if ("error" in playback) return { error: jsonResponse(403, { ...playback.error, rawHlsUrlReturned: false }) };
  return { replay, session: playback.session, token };
};

const rewritePlaylist = (req: Request, replayId: string, playlist: string) => {
  const token = new URL(req.url).searchParams.get("token") || "";
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";
  return playlist.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    return `${functionBaseUrl(req)}/records/${encodeURIComponent(replayId)}/segment?path=${encodeURIComponent(trimmed)}${tokenQuery}`;
  }).join("\n");
};

const handlePlaylistFetch = async (req: Request, adminClient: SupabaseClientLike, replayId: string): Promise<Response> => {
  const authorized = await authorizeRecordRoute(req, adminClient, replayId);
  if ("error" in authorized) return authorized.error;
  const sourceUrl = isApprovedHlsPlaylistUrl(authorized.session.hls_playback_url);
  if (!sourceUrl) return jsonResponse(404, baseState("unavailable", "Replay unavailable", "The approved playback source is missing."));
  const upstream = await fetchApprovedHlsUrl(sourceUrl, {
    Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain",
  });
  if (!upstream.ok) return jsonResponse(502, baseState("error", "Replay unavailable", "The controlled playback source could not be fetched."));
  return new Response(rewritePlaylist(req, replayId, await upstream.text()), {
    headers: PLAYLIST_HEADERS,
    status: 200,
  });
};

const handleSegmentFetch = async (req: Request, adminClient: SupabaseClientLike, replayId: string, segmentPath: string | null): Promise<Response> => {
  const authorized = await authorizeRecordRoute(req, adminClient, replayId);
  if ("error" in authorized) return authorized.error;
  const sourceUrl = isApprovedHlsPlaylistUrl(authorized.session.hls_playback_url);
  const targetUrl = sourceUrl && segmentPath ? safeSegmentUrl(sourceUrl, segmentPath) : null;
  if (!targetUrl) {
    return jsonResponse(400, {
      error: "invalid_segment",
      message: "Segment path is not valid for this replay.",
      rawHlsUrlReturned: false,
    });
  }
  const upstream = await fetchApprovedHlsUrl(targetUrl);
  if (!upstream.ok || !upstream.body) return jsonResponse(502, baseState("error", "Replay unavailable", "The controlled playback segment could not be fetched."));
  return new Response(upstream.body, {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("Content-Type") || "video/mp2t",
    },
    status: 200,
  });
};

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  const adminClient = createAdminClient();
  try {
    const route = parseRecordRoute(req);
    if (req.method === "GET" && route?.kind === "playlist") return await handlePlaylistFetch(req, adminClient, route.replayId);
    if (req.method === "GET" && route?.kind === "segment") return await handleSegmentFetch(req, adminClient, route.replayId, route.segmentPath);
    if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for replay state or GET for controlled playback resources." });
    const payload = await req.json().catch(() => ({})) as { replayId?: unknown; replay_id?: unknown };
    const replayId = toText(payload.replayId ?? payload.replay_id);
    if (!replayId) return jsonResponse(400, { error: "replay_id_required", message: "replayId is required." });
    const state = await handleStateRead(req, adminClient, replayId);
    return jsonResponse(200, state ?? baseState("error", "Replay unavailable", "Replay playback is unavailable right now."));
  } catch (error) {
    return jsonResponse(500, {
      error: "creator_replay_playback_failed",
      message: sanitizeErrorMessage(error),
      rawHlsUrlReturned: false,
      fullRoomTokenForSpectators: false,
      liveKitPublishAuthorityGranted: false,
    });
  }
});
