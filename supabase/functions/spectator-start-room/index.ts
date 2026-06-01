import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  captureSecurityRequestContext,
  securityContextAuditMetadata,
  type SecurityRequestContextResult,
} from "../_shared/security-request-context.ts";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

type AuthenticatedUser = {
  email: string | null;
  id: string;
};

type StartRoomAction = "start_watch_party" | "start_live_reaction";
type ChildSourceType = "watch_party_live" | "live_stage" | "replay" | "creator_video";

type StartRoomPayload = {
  action?: unknown;
  item_id?: unknown;
  itemId?: unknown;
};
type ParsedPayloadResult =
  | { value: StartRoomPayload }
  | { error: Response };

type DiscoveryFeedItemRow = {
  access_type: string | null;
  allow_live_reaction_rooms: boolean | null;
  allow_public_share: boolean | null;
  allow_replay_watch_party: boolean | null;
  allow_spectator_view: boolean | null;
  allow_watch_party_from_spectator: boolean | null;
  channel_user_id: string | null;
  ended_at: string | null;
  event_id: string | null;
  host_user_id: string | null;
  id: string;
  is_publicly_discoverable: boolean | null;
  is_spectator_enabled: boolean | null;
  is_spectator_playback_enabled: boolean | null;
  item_type: string | null;
  live_state: string | null;
  metadata: JsonObject | null;
  moderation_status: string | null;
  owner_user_id: string | null;
  requires_premium_to_join: boolean | null;
  requires_subscription_to_watch: boolean | null;
  requires_ticket_to_watch: boolean | null;
  rights_status: string | null;
  room_id: string | null;
  source_id: string | null;
  source_type: string | null;
  title: string | null;
  visibility: string | null;
};

type PlaybackRecordRow = {
  access_type: string | null;
  broadcast_session_id: string;
  channel_user_id: string | null;
  creator_event_id: string | null;
  host_user_id: string | null;
  id: string;
  is_publicly_watchable: boolean | null;
  is_spectator_playback_enabled: boolean | null;
  playback_status: string | null;
  playlist_path: string | null;
  requires_premium: boolean | null;
  requires_ticket: boolean | null;
  rights_status: string | null;
  source_room_id: string | null;
  visibility: string | null;
  watch_party_room_id: string | null;
};

type BroadcastSessionRow = {
  access_type: string | null;
  hls_playback_url: string | null;
  id: string;
  is_publicly_watchable: boolean | null;
  is_spectator_playback_enabled: boolean | null;
  metadata: JsonObject | null;
  playback_url_status: string | null;
  requires_premium: boolean | null;
  requires_ticket: boolean | null;
  rights_status: string | null;
};

type ParentSourceLinkRow = {
  child_room_id: string;
  parent_room_id: string | null;
  root_source_id: string;
  source_item_id: string;
};

type AppConfigRow = {
  config: JsonObject | null;
};

type EligibilityResult =
  | {
      ok: true;
      childSourceType: ChildSourceType;
      parentRoomId: string | null;
      playback: PlaybackRecordRow;
      rootSourceId: string;
    }
  | {
      ok: false;
      reason:
        | "blocked"
        | "premium_required"
        | "rate_limited"
        | "source_ended"
        | "source_not_found"
        | "source_not_public"
        | "source_reuse_disabled";
      status: number;
    };

const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const FUNCTION_NAME = "spectator-start-room";
const PUBLIC_SAFE_RIGHTS = new Set(["creator_owned", "chillywood_original", "licensed_for_public_stream"]);
const ROOM_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 6;
const SOURCE_WINDOW_MS = 60 * 60_000;
const SOURCE_MAX_CHILD_ROOMS = 25;

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const optionsResponse = () => new Response("ok", { headers: JSON_HEADERS, status: 200 });
const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const isUuid = (value: unknown) => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(toText(value))
);

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown spectator room error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._~+/=-]+/g, "[redacted-token]")
    .replace(/[A-Za-z0-9._~+/=-]{64,}/g, "[redacted]")
    .replace(/https:\/\/[^\s"']+/gi, "[redacted-url]")
    .slice(0, 260);
};

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const createAdminClient = () => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const authenticateRequest = async (req: Request): Promise<{ user: AuthenticatedUser } | { error: Response }> => {
  const authorization = toText(req.headers.get("Authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return {
      error: jsonResponse(401, {
        error: "sign_in_required",
        message: "Sign in before starting a watch party from Spectator.",
      }),
    };
  }

  const authClient = createClient(readRequiredEnv("SUPABASE_URL"), readRequiredEnv("SUPABASE_ANON_KEY"), {
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
  const userId = toText(data.user?.id);
  if (error || !userId) {
    return {
      error: jsonResponse(401, {
        error: "sign_in_required",
        message: "Sign in before starting a watch party from Spectator.",
      }),
    };
  }

  return {
    user: {
      email: data.user?.email ?? null,
      id: userId,
    },
  };
};

const parseJsonPayload = async (req: Request): Promise<ParsedPayloadResult> => {
  const raw = await req.text();
  if (!raw.trim()) return { value: {} as StartRoomPayload };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: jsonResponse(400, { error: "invalid_body", message: "Request body must be a JSON object." }) };
    }
    return { value: parsed as StartRoomPayload };
  } catch {
    return { error: jsonResponse(400, { error: "invalid_json", message: "Request body must be valid JSON." }) };
  }
};

const normalizeAction = (value: unknown): StartRoomAction | null => {
  const normalized = toLowerText(value || "start_watch_party");
  if (normalized === "start_watch_party" || normalized === "watch_party_live") return "start_watch_party";
  if (
    normalized === "start_live_reaction"
    || normalized === "start_live_watch_party"
    || normalized === "start_reaction_room"
  ) {
    return "start_live_reaction";
  }
  return null;
};

const requestedItemId = (payload: StartRoomPayload) => toText(payload.item_id ?? payload.itemId);

const randomRoomId = (length = 6) => {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  }
  return out;
};

const actionEvents = (action: StartRoomAction) => (
  action === "start_live_reaction"
    ? {
        attempt: "spectator_start_live_reaction_attempt",
        denied: "spectator_start_live_reaction_denied",
        success: "spectator_start_live_reaction_success",
      }
    : {
        attempt: "spectator_start_watch_party_attempt",
        denied: "spectator_start_watch_party_denied",
        success: "spectator_start_watch_party_success",
      }
);

const cleanAuditMetadata = (value: JsonObject = {}) => {
  const forbidden = /(participantToken|livekit|raw_hls|hls_playback_url|storage_path|speaker_credentials|host_controls|secret)/i;
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => (
    !forbidden.test(key)
    && !forbidden.test(String(entry ?? ""))
  )));
};

const writeAudit = async (
  adminClient: SupabaseClientLike,
  input: {
    action: StartRoomAction;
    actorUserId: string | null;
    childRoomId?: string | null;
    eventType: string;
    metadata?: JsonObject;
    reason?: string | null;
    securityContext?: SecurityRequestContextResult | null;
    sourceItemId?: string | null;
  },
) => {
  await adminClient.from("spectator_child_room_audit_log").insert({
    actor_user_id: isUuid(input.actorUserId) ? input.actorUserId : null,
    child_room_id: toText(input.childRoomId) || null,
    denial_reason: toText(input.reason) || null,
    event_type: input.eventType,
    metadata: cleanAuditMetadata({
      ...input.metadata,
      ...securityContextAuditMetadata(input.securityContext),
      function_name: FUNCTION_NAME,
      full_room_token_for_spectators: false,
      original_room_publish_permission: false,
      original_room_token_stored: false,
      requested_action: input.action,
    }),
    security_context_id: input.securityContext?.id ?? null,
    source_item_id: isUuid(input.sourceItemId) ? input.sourceItemId : null,
  });
};

const safeWriteAudit = async (
  adminClient: SupabaseClientLike,
  input: Parameters<typeof writeAudit>[1],
) => {
  try {
    await writeAudit(adminClient, input);
  } catch {
    // Product audit should not leak implementation errors or block clean denials.
  }
};

const readDiscoveryItem = async (adminClient: SupabaseClientLike, itemId: string) => {
  const { data, error } = await adminClient
    .from("discovery_feed_items")
    .select([
      "access_type",
      "allow_live_reaction_rooms",
      "allow_public_share",
      "allow_replay_watch_party",
      "allow_spectator_view",
      "allow_watch_party_from_spectator",
      "channel_user_id",
      "ended_at",
      "event_id",
      "host_user_id",
      "id",
      "is_publicly_discoverable",
      "is_spectator_enabled",
      "is_spectator_playback_enabled",
      "item_type",
      "live_state",
      "metadata",
      "moderation_status",
      "owner_user_id",
      "requires_premium_to_join",
      "requires_subscription_to_watch",
      "requires_ticket_to_watch",
      "rights_status",
      "room_id",
      "source_id",
      "source_type",
      "title",
      "visibility",
    ].join(","))
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw new Error(`source_read_failed:${error.message}`);
  return (data ?? null) as DiscoveryFeedItemRow | null;
};

const readViewerBlock = async (adminClient: SupabaseClientLike, itemId: string, userId: string) => {
  const { data, error } = await adminClient
    .from("discovery_feed_item_blocks")
    .select("id")
    .eq("feed_item_id", itemId)
    .eq("blocked_user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`source_block_read_failed:${error.message}`);
  return !!(data as { id?: unknown } | null)?.id;
};

const sourceRoomCandidates = (item: DiscoveryFeedItemRow) => Array.from(new Set([
  item.room_id,
  item.source_id,
  item.event_id,
  item.id,
].map(toText).filter(Boolean)));

const readPlaybackRecord = async (adminClient: SupabaseClientLike, item: DiscoveryFeedItemRow) => {
  const candidates = sourceRoomCandidates(item);
  if (!candidates.length) return null;

  const { data, error } = await adminClient
    .from("spectator_hls_playback_records")
    .select([
      "access_type",
      "broadcast_session_id",
      "channel_user_id",
      "creator_event_id",
      "host_user_id",
      "id",
      "is_publicly_watchable",
      "is_spectator_playback_enabled",
      "playback_status",
      "playlist_path",
      "requires_premium",
      "requires_ticket",
      "rights_status",
      "source_room_id",
      "visibility",
      "watch_party_room_id",
    ].join(","))
    .in("source_room_id", candidates)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`playback_read_failed:${error.message}`);
  return ((data as PlaybackRecordRow[] | null)?.[0] ?? null) as PlaybackRecordRow | null;
};

const isPublicSafeItem = (item: DiscoveryFeedItemRow) => (
  item.is_publicly_discoverable === true
  && item.visibility === "public"
  && item.moderation_status === "clean"
  && PUBLIC_SAFE_RIGHTS.has(toText(item.rights_status))
  && item.access_type === "public_free"
  && item.requires_premium_to_join === false
  && item.requires_ticket_to_watch === false
  && item.requires_subscription_to_watch === false
);

const isPublicSafePlayback = (playback: PlaybackRecordRow | null) => !!playback
  && playback.visibility === "public"
  && playback.playback_status === "live"
  && !!toText(playback.playlist_path)
  && playback.is_publicly_watchable === true
  && playback.is_spectator_playback_enabled === true
  && PUBLIC_SAFE_RIGHTS.has(toText(playback.rights_status))
  && playback.access_type === "public_free"
  && playback.requires_premium === false
  && playback.requires_ticket === false;

const isApprovedPlaylistUrl = (value: unknown) => {
  const normalized = toText(value);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" && parsed.pathname.endsWith(".m3u8");
  } catch {
    return false;
  }
};

const readBroadcastSession = async (adminClient: SupabaseClientLike, playback: PlaybackRecordRow) => {
  const broadcastSessionId = toText(playback.broadcast_session_id);
  if (!broadcastSessionId) return null;
  const { data, error } = await adminClient
    .from("room_broadcast_sessions")
    .select([
      "access_type",
      "hls_playback_url",
      "id",
      "is_publicly_watchable",
      "is_spectator_playback_enabled",
      "metadata",
      "playback_url_status",
      "requires_premium",
      "requires_ticket",
      "rights_status",
    ].join(","))
    .eq("id", broadcastSessionId)
    .maybeSingle();

  if (error) throw new Error(`broadcast_session_read_failed:${error.message}`);
  return (data ?? null) as BroadcastSessionRow | null;
};

const isPublicSafeBroadcastSession = (session: BroadcastSessionRow | null) => !!session
  && session.is_publicly_watchable === true
  && session.is_spectator_playback_enabled === true
  && PUBLIC_SAFE_RIGHTS.has(toText(session.rights_status))
  && session.access_type === "public_free"
  && session.requires_premium === false
  && session.requires_ticket === false
  && session.playback_url_status === "public_safe_available"
  && (session.metadata?.d7f_public_safe_approved === true || session.metadata?.d7f_public_safe_approved === "true")
  && isApprovedPlaylistUrl(session.hls_playback_url);

const readParentLink = async (adminClient: SupabaseClientLike, item: DiscoveryFeedItemRow) => {
  const candidates = sourceRoomCandidates(item);
  if (!candidates.length) return null;

  const { data, error } = await adminClient
    .from("spectator_child_room_sources")
    .select("child_room_id,parent_room_id,root_source_id,source_item_id")
    .in("child_room_id", candidates)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(`parent_source_read_failed:${error.message}`);
  return ((data as ParentSourceLinkRow[] | null)?.[0] ?? null) as ParentSourceLinkRow | null;
};

const readAppConfig = async (adminClient: SupabaseClientLike) => {
  const { data } = await adminClient
    .from("app_configurations")
    .select("config")
    .eq("config_key", "global")
    .maybeSingle();
  return (data ?? null) as AppConfigRow | null;
};

const runtimeControlEnabled = (config: AppConfigRow | null, key: "live_watch_party_enabled" | "watch_party_live_enabled") => {
  const runtimeControls = config?.config && typeof config.config === "object"
    ? (config.config.runtimeControls as JsonObject | undefined)
    : null;
  return runtimeControls?.[key] !== false;
};

const userHasPremiumAccess = async (adminClient: SupabaseClientLike, userId: string, keys: string[]) => {
  const { data, error } = await adminClient
    .from("user_entitlements")
    .select("entitlement_key,status,expires_at,revoked_at")
    .eq("user_id", userId)
    .in("entitlement_key", keys);

  if (error) throw new Error(`premium_read_failed:${error.message}`);
  const now = Date.now();
  return ((data ?? []) as { entitlement_key?: unknown; expires_at?: unknown; revoked_at?: unknown; status?: unknown }[]).some((row) => {
    if (!keys.includes(toText(row.entitlement_key))) return false;
    if (!["active", "trialing", "grace_period"].includes(toText(row.status))) return false;
    if (toText(row.revoked_at)) return false;
    const expiresAt = Date.parse(toText(row.expires_at));
    return !Number.isFinite(expiresAt) || expiresAt > now;
  });
};

const enforceRateLimit = async (adminClient: SupabaseClientLike, userId: string, itemId: string) => {
  const attemptSince = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const sourceSince = new Date(Date.now() - SOURCE_WINDOW_MS).toISOString();

  const [actorAttempts, sourceRooms] = await Promise.all([
    adminClient
      .from("spectator_child_room_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("actor_user_id", userId)
      .in("event_type", [
        "spectator_start_watch_party_attempt",
        "spectator_start_live_reaction_attempt",
      ])
      .gte("created_at", attemptSince),
    adminClient
      .from("spectator_child_room_sources")
      .select("child_room_id", { count: "exact", head: true })
      .eq("source_item_id", itemId)
      .gte("created_at", sourceSince),
  ]);

  if (actorAttempts.error) throw new Error(`rate_limit_actor_read_failed:${actorAttempts.error.message}`);
  if (sourceRooms.error) throw new Error(`rate_limit_source_read_failed:${sourceRooms.error.message}`);

  return (actorAttempts.count ?? 0) < RATE_LIMIT_MAX_ATTEMPTS
    && (sourceRooms.count ?? 0) < SOURCE_MAX_CHILD_ROOMS;
};

const deriveChildSourceType = (
  action: StartRoomAction,
  item: DiscoveryFeedItemRow,
): ChildSourceType => {
  if (action === "start_live_reaction") return "live_stage";
  if (item.live_state === "replay_available_later" || item.item_type === "replay_later") return "replay";
  if (item.source_type === "creator_video" || item.item_type === "creator_upload") return "creator_video";
  return "watch_party_live";
};

const isLiveSource = (item: DiscoveryFeedItemRow) => {
  const metadata = item.metadata ?? {};
  const metadataSourceType = toLowerText(metadata.source_type ?? metadata.sourceType ?? metadata.room_type ?? metadata.roomType);
  return item.item_type === "live_room"
    || metadataSourceType === "live_stage"
    || metadataSourceType === "live"
    || (item.source_type === "watch_party_room" && item.live_state === "live");
};

const resolveEligibility = async (
  adminClient: SupabaseClientLike,
  action: StartRoomAction,
  item: DiscoveryFeedItemRow | null,
  user: AuthenticatedUser,
  config: AppConfigRow | null,
): Promise<EligibilityResult> => {
  if (!item) return { ok: false, reason: "source_not_found", status: 404 };
  if (!isPublicSafeItem(item) || item.allow_spectator_view !== true) {
    return { ok: false, reason: "source_not_public", status: 403 };
  }

  const blocked = await readViewerBlock(adminClient, item.id, user.id);
  if (blocked) return { ok: false, reason: "blocked", status: 403 };

  const liveState = toText(item.live_state);
  if (liveState === "ended" && item.allow_replay_watch_party !== true) {
    return { ok: false, reason: "source_ended", status: 409 };
  }

  if (action === "start_watch_party") {
    if (item.allow_watch_party_from_spectator !== true) {
      return { ok: false, reason: "source_reuse_disabled", status: 403 };
    }
    if (!runtimeControlEnabled(config, "watch_party_live_enabled")) {
      return { ok: false, reason: "source_reuse_disabled", status: 403 };
    }
  }

  if (action === "start_live_reaction") {
    if (item.allow_live_reaction_rooms !== true || !isLiveSource(item)) {
      return { ok: false, reason: "source_reuse_disabled", status: 403 };
    }
    if (!runtimeControlEnabled(config, "live_watch_party_enabled")) {
      return { ok: false, reason: "source_reuse_disabled", status: 403 };
    }
  }

  const hasPremium = await userHasPremiumAccess(
    adminClient,
    user.id,
    action === "start_live_reaction" ? ["premium", "premium_live", "premium_watch_party"] : ["premium", "premium_watch_party"],
  );
  if (!hasPremium) return { ok: false, reason: "premium_required", status: 402 };

  const rateLimitAllowed = await enforceRateLimit(adminClient, user.id, item.id);
  if (!rateLimitAllowed) return { ok: false, reason: "rate_limited", status: 429 };

  const playback = await readPlaybackRecord(adminClient, item);
  if (!isPublicSafePlayback(playback)) {
    return playback?.playback_status === "ended"
      ? { ok: false, reason: "source_ended", status: 409 }
      : { ok: false, reason: "source_reuse_disabled", status: 403 };
  }

  const safePlayback = playback as PlaybackRecordRow;
  const broadcastSession = await readBroadcastSession(adminClient, safePlayback);
  if (!isPublicSafeBroadcastSession(broadcastSession)) {
    return { ok: false, reason: "source_reuse_disabled", status: 403 };
  }

  const parentLink = await readParentLink(adminClient, item);
  const sourceCandidates = sourceRoomCandidates(item);
  const rootSourceId = toText(parentLink?.root_source_id)
    || toText(item.source_id)
    || toText(item.room_id)
    || item.id;
  const parentRoomId = item.source_type === "watch_party_room" || parentLink
    ? toText(parentLink?.child_room_id ?? item.room_id ?? item.source_id) || null
    : null;

  return {
    ok: true,
    childSourceType: deriveChildSourceType(action, item),
    parentRoomId,
    playback: safePlayback,
    rootSourceId: rootSourceId || sourceCandidates[0] || item.id,
  };
};

const insertChildRoom = async (
  adminClient: SupabaseClientLike,
  action: StartRoomAction,
  userId: string,
  itemId: string,
) => {
  const roomType = action === "start_live_reaction" ? "live" : "title";
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const partyId = randomRoomId();
    const now = new Date().toISOString();
    const { data, error } = await adminClient
      .from("watch_party_rooms")
      .insert({
        capture_policy: "best_effort",
        content_access_rule: "open",
        host_user_id: userId,
        is_active: true,
        join_policy: "open",
        last_activity_at: now,
        party_id: partyId,
        playback_position_millis: 0,
        playback_state: "paused",
        reactions_policy: "enabled",
        room_type: roomType,
        source_id: itemId,
        source_type: "spectator_playback",
        started_at: now,
        title_id: null,
        updated_at: now,
      })
      .select("party_id,room_type,source_id,source_type")
      .maybeSingle();

    if (!error && data) {
      return {
        partyId,
        roomType,
      };
    }

    lastError = error;
    const code = toText((error as { code?: unknown } | null)?.code);
    if (code !== "23505") break;
  }

  throw new Error(`child_room_insert_failed:${sanitizeErrorMessage(lastError)}`);
};

const insertSourceLink = async (
  adminClient: SupabaseClientLike,
  input: {
    childRoomId: string;
    createdByUserId: string;
    eligibility: Extract<EligibilityResult, { ok: true }>;
    item: DiscoveryFeedItemRow;
  },
) => {
  const { error } = await adminClient.from("spectator_child_room_sources").insert({
    child_room_id: input.childRoomId,
    created_by_user_id: input.createdByUserId,
    metadata: cleanAuditMetadata({
      full_room_token_for_spectators: false,
      original_host_controls_exposed: false,
      original_room_publish_permission: false,
      resolver_owned_playback: true,
      source_live_state: input.item.live_state,
      source_title_present: !!toText(input.item.title),
    }),
    parent_room_id: input.eligibility.parentRoomId,
    root_source_id: input.eligibility.rootSourceId,
    source_item_id: input.item.id,
    source_owner_user_id: toText(input.item.owner_user_id ?? input.item.host_user_id ?? input.item.channel_user_id) || null,
    source_platform_id: toText(input.item.channel_user_id) || null,
    source_public_playback_id: input.eligibility.playback.id,
    source_type: input.eligibility.childSourceType,
  });

  if (error) throw new Error(`source_link_insert_failed:${error.message}`);
};

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      message: "Use POST to start a watch party from Spectator.",
    });
  }

  let adminClient: SupabaseClientLike | null = null;
  let securityContext: SecurityRequestContextResult | null = null;
  let action: StartRoomAction = "start_watch_party";
  let itemId: string | null = null;
  let user: AuthenticatedUser | null = null;

  try {
    adminClient = createAdminClient();
    const authResult = await authenticateRequest(req);
    if ("error" in authResult) return authResult.error;
    user = authResult.user;
    securityContext = await captureSecurityRequestContext(adminClient, req, {
      source: FUNCTION_NAME,
      userId: user.id,
    }).catch(() => null);

    const parsed = await parseJsonPayload(req);
    if ("error" in parsed) return parsed.error;

    const normalizedAction = normalizeAction(parsed.value.action);
    if (!normalizedAction) {
      return jsonResponse(400, {
        error: "source_reuse_disabled",
        message: "This live can’t be used for a watch party.",
      });
    }
    action = normalizedAction;
    itemId = requestedItemId(parsed.value);

    if (!isUuid(itemId)) {
      await safeWriteAudit(adminClient, {
        action,
        actorUserId: user.id,
        eventType: actionEvents(action).denied,
        reason: "source_not_found",
        securityContext,
      });
      return jsonResponse(404, {
        error: "source_not_found",
        message: "This source is not available.",
      });
    }

    const events = actionEvents(action);
    await safeWriteAudit(adminClient, {
      action,
      actorUserId: user.id,
      eventType: events.attempt,
      securityContext,
      sourceItemId: itemId,
    });

    const [item, config] = await Promise.all([
      readDiscoveryItem(adminClient, itemId),
      readAppConfig(adminClient).catch(() => null),
    ]);

    const eligibility = await resolveEligibility(adminClient, action, item, user, config);
    if (!eligibility.ok) {
      await safeWriteAudit(adminClient, {
        action,
        actorUserId: user.id,
        eventType: events.denied,
        reason: eligibility.reason,
        securityContext,
        sourceItemId: itemId,
      });

      const message = eligibility.reason === "premium_required"
        ? "Premium is required before starting this watch party."
        : eligibility.reason === "source_ended"
          ? "Source live has ended"
          : eligibility.reason === "rate_limited"
            ? "Try again in a few minutes."
            : eligibility.reason === "blocked"
              ? "This source is not available to this account."
              : eligibility.reason === "source_not_found"
                ? "This source is not available."
              : eligibility.reason === "source_not_public"
                ? "This source is not public-safe."
                : "This live can’t be used for a watch party";
      return jsonResponse(eligibility.status, {
        error: eligibility.reason,
        message,
      });
    }

    const childRoom = await insertChildRoom(adminClient, action, user.id, itemId);
    if (item) {
      await insertSourceLink(adminClient, {
        childRoomId: childRoom.partyId,
        createdByUserId: user.id,
        eligibility,
        item,
      });
    }

    await safeWriteAudit(adminClient, {
      action,
      actorUserId: user.id,
      childRoomId: childRoom.partyId,
      eventType: events.success,
      metadata: {
        child_room_type: childRoom.roomType,
        root_source_id: eligibility.rootSourceId,
        source_public_playback_id: eligibility.playback.id,
      },
      securityContext,
      sourceItemId: itemId,
    });

    return jsonResponse(200, {
      childRoomId: childRoom.partyId,
      fullRoomTokenForSpectators: false,
      originalRoomPublishPermission: false,
      originalRoomTokenReturned: false,
      route: childRoom.roomType === "live"
        ? `/watch-party/live-stage/${childRoom.partyId}`
        : `/watch-party/${childRoom.partyId}`,
      roomType: childRoom.roomType,
      source: {
        rootSourceId: eligibility.rootSourceId,
        sourceItemId: itemId,
        sourcePublicPlaybackId: eligibility.playback.id,
        sourceType: eligibility.childSourceType,
      },
    });
  } catch (error) {
    if (adminClient && user) {
      await safeWriteAudit(adminClient, {
        action,
        actorUserId: user.id,
        eventType: actionEvents(action).denied,
        reason: "source_reuse_disabled",
        securityContext,
        sourceItemId: itemId,
      });
    }

    return jsonResponse(500, {
      error: "source_reuse_disabled",
      message: "This live can’t be used for a watch party",
      safeError: sanitizeErrorMessage(error),
    });
  }
});
