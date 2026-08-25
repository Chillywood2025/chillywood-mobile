import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  readExactCurrentSessionAuthority,
  readExactPlatformRole,
} from "../_shared/exact-subject-authority.ts";

type JsonObject = Record<string, unknown>;
type AuthenticatedUser = {
  email: string | null;
  id: string;
};

type BroadcastSessionRow = {
  access_type: string | null;
  broadcast_status: string | null;
  channel_user_id: string | null;
  creator_event_id: string | null;
  egress_status: string | null;
  hls_playback_url: string | null;
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
  watch_party_room_id: string | null;
};

type DiscoveryFeedItemRow = {
  access_type: string | null;
  event_id: string | null;
  id: string;
  is_publicly_discoverable: boolean | null;
  is_spectator_enabled: boolean | null;
  is_spectator_playback_enabled: boolean | null;
  live_state: string | null;
  moderation_status: string | null;
  requires_premium_to_join: boolean | null;
  requires_subscription_to_watch: boolean | null;
  requires_ticket_to_watch: boolean | null;
  rights_status: string | null;
  room_id: string | null;
  source_id: string | null;
  source_type: string | null;
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
  metadata: JsonObject | null;
  playback_status: string | null;
  playlist_path: string | null;
  requires_premium: boolean | null;
  requires_ticket: boolean | null;
  rights_status: string | null;
  source_room_id: string | null;
  visibility: string | null;
  watch_party_room_id: string | null;
};
type CircleSpectatorFeedItemRow = {
  access_type: string | null;
  allow_spectator_view: boolean | null;
  creator_user_id: string | null;
  host_user_id: string | null;
  id: string;
  is_spectator_enabled: boolean | null;
  is_spectator_playback_enabled: boolean | null;
  moderation_status: string | null;
  playback_record_id: string | null;
  rights_status: string | null;
  status: string | null;
  visibility: string | null;
};
type PublicSafePlaybackRecordRow = PlaybackRecordRow & {
  playlist_path: string;
};
type PublicSafeBroadcastSessionRow = BroadcastSessionRow & {
  hls_playback_url: string;
};

type PlaybackPayload = {
  broadcast_session_id?: unknown;
  broadcastSessionId?: unknown;
  item_id?: unknown;
  itemId?: unknown;
  mode?: unknown;
  source_room_id?: unknown;
  sourceRoomId?: unknown;
};

type SupabaseClientLike = any;

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

const PUBLIC_SAFE_RIGHTS = new Set(["creator_owned", "chillywood_original", "licensed_for_public_stream"]);
const FUNCTION_NAME = "spectator-playback";

const toText = (value: unknown) => String(value ?? "").trim();

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const optionsResponse = () => new Response("ok", { headers: CORS_HEADERS, status: 200 });

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown spectator playback error.");

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

const readOptionalEnv = (key: string) => toText(Deno.env.get(key)) || null;

const textEncoder = new TextEncoder();

const normalizeEndpoint = (value: string) => {
  const trimmed = value.replace(/\/+$/g, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const readHlsOutputConfig = () => {
  const bucket = readOptionalEnv("EGRESS_OUTPUT_BUCKET") || readOptionalEnv("S3_BUCKET");
  const endpoint = readOptionalEnv("EGRESS_OUTPUT_ENDPOINT") || readOptionalEnv("S3_ENDPOINT");
  const region = readOptionalEnv("EGRESS_OUTPUT_REGION") || readOptionalEnv("S3_REGION");
  const accessKeyId = readOptionalEnv("EGRESS_OUTPUT_ACCESS_KEY_ID") || readOptionalEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = readOptionalEnv("EGRESS_OUTPUT_SECRET_ACCESS_KEY") || readOptionalEnv("S3_SECRET_ACCESS_KEY");

  if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) return null;
  return {
    accessKeyId,
    bucket,
    endpoint: normalizeEndpoint(endpoint),
    region,
    secretAccessKey,
  };
};

const awsEncode = (value: string) => encodeURIComponent(value)
  .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

const encodeS3Path = (objectKey: string) => objectKey
  .split("/")
  .map((part) => encodeURIComponent(part))
  .join("/");

const bytesToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");

const toArrayBuffer = (value: ArrayBuffer | Uint8Array): ArrayBuffer => {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
};

const hmacSha256 = async (key: ArrayBuffer | Uint8Array, data: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(data));
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToHex(digest);
};

const formatAmzDates = (date = new Date()) => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
};

const getSigningKey = async (secretAccessKey: string, dateStamp: string, region: string) => {
  const dateKey = await hmacSha256(textEncoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, "s3");
  return hmacSha256(serviceKey, "aws4_request");
};

const isSafeHlsObjectKey = (value: string) => (
  !!value
  && value.length <= 1024
  && !value.startsWith("/")
  && !value.split("/").includes("..")
  && !/[\u0000-\u001F\u007F]/u.test(value)
);

const objectKeyFromConfiguredOutputUrl = (value: string) => {
  const outputConfig = readHlsOutputConfig();
  if (!outputConfig) return null;

  const parsed = new URL(value);
  const endpoint = new URL(outputConfig.endpoint);
  const sourceHost = parsed.host.toLowerCase();
  const endpointHost = endpoint.host.toLowerCase();
  const endpointHostIncludesBucket = endpointHost.startsWith(`${outputConfig.bucket}.`.toLowerCase());
  const bucketHost = `${outputConfig.bucket}.${endpointHost}`.toLowerCase();
  const normalizedPath = parsed.pathname.replace(/^\/+/g, "");
  const sourceUrlOutputConfig = {
    ...outputConfig,
    endpoint: `${parsed.protocol}//${parsed.host}`,
  };

  if (sourceHost.startsWith(`${outputConfig.bucket}.`.toLowerCase())) {
    return isSafeHlsObjectKey(normalizedPath)
      ? { objectKey: normalizedPath, outputConfig: sourceUrlOutputConfig }
      : null;
  }

  if (sourceHost === bucketHost) {
    return isSafeHlsObjectKey(normalizedPath) ? { objectKey: normalizedPath, outputConfig } : null;
  }

  if (sourceHost === endpointHost && endpointHostIncludesBucket) {
    return isSafeHlsObjectKey(normalizedPath) ? { objectKey: normalizedPath, outputConfig } : null;
  }

  if (sourceHost === endpointHost) {
    const [bucket, ...pathParts] = normalizedPath.split("/");
    if (bucket === outputConfig.bucket) {
      const objectKey = pathParts.join("/");
      return isSafeHlsObjectKey(objectKey) ? { objectKey, outputConfig: sourceUrlOutputConfig } : null;
    }
  }

  return null;
};

const createPresignedS3GetUrl = async (input: {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  expiresSeconds: number;
  forcePathStyle?: boolean;
  objectKey: string;
  region: string;
  secretAccessKey: string;
}) => {
  const endpoint = new URL(input.endpoint);
  const bucketPrefix = `${input.bucket}.`.toLowerCase();
  const endpointHost = endpoint.host.toLowerCase();
  const endpointHostIncludesBucket = endpointHost.startsWith(bucketPrefix);
  const host = input.forcePathStyle
    ? endpointHostIncludesBucket ? endpoint.host.slice(input.bucket.length + 1) : endpoint.host
    : endpointHostIncludesBucket ? endpoint.host : `${input.bucket}.${endpoint.host}`;
  const protocol = endpoint.protocol || "https:";
  const canonicalUri = input.forcePathStyle
    ? `/${encodeURIComponent(input.bucket)}/${encodeS3Path(input.objectKey)}`
    : `/${encodeS3Path(input.objectKey)}`;
  const { amzDate, dateStamp } = formatAmzDates();
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.entries(queryParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = await getSigningKey(input.secretAccessKey, dateStamp, input.region);
  const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));
  return `${protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
};

const fetchApprovedHlsUrl = async (url: string, headers: HeadersInit = {}) => {
  const response = await fetch(url, { headers });
  if (response.ok) return { response };

  await response.body?.cancel().catch(() => undefined);
  const configuredOutput = objectKeyFromConfiguredOutputUrl(url);
  if (!configuredOutput) return { response };

  let fallbackResponse: Response | null = null;
  for (const forcePathStyle of [false, true]) {
    const signedUrl = await createPresignedS3GetUrl({
      ...configuredOutput.outputConfig,
      expiresSeconds: 60,
      forcePathStyle,
      objectKey: configuredOutput.objectKey,
    });
    fallbackResponse = await fetch(signedUrl, { headers });
    if (fallbackResponse.ok) return { response: fallbackResponse };
    await fallbackResponse.body?.cancel().catch(() => undefined);
  }

  return { response: fallbackResponse ?? response };
};

const createAdminClient = () => {
  const supabaseUrl = readRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return {
      configured: false as const,
      message: "Supabase service role secret is not configured for spectator playback reads.",
      reason: "service_role_missing",
    };
  }

  return {
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    configured: true as const,
  };
};

const createAuthClient = () => ({
  supabaseAnonKey: readRequiredEnv("SUPABASE_ANON_KEY"),
  supabaseUrl: readRequiredEnv("SUPABASE_URL"),
});

const authenticateRequest = async (
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<{ user: AuthenticatedUser } | { error: Response }> => {
  const authorization = toText(req.headers.get("Authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: jsonResponse(401, { error: "missing_authorization", message: "Bearer authorization is required." }) };
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
  const userId = toText(data.user?.id);
  if (error || !userId || !(await readExactCurrentSessionAuthority(authClient, userId))) {
    return { error: jsonResponse(401, { error: "invalid_session", message: "Supabase could not verify the current user session." }) };
  }

  return {
    user: {
      email: data.user?.email ?? null,
      id: userId,
    },
  };
};

const userHasPlatformRole = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
  roles: string[],
) => {
  return !!(await readExactPlatformRole(adminClient, user.id, roles));
};

const parseJsonPayload = async (req: Request): Promise<{ value: PlaybackPayload } | { error: Response }> => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return { value: {} as PlaybackPayload };

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: jsonResponse(400, { error: "invalid_body", message: "Request body must be a JSON object." }) };
    }

    return { value: parsed as PlaybackPayload };
  } catch {
    return { error: jsonResponse(400, { error: "invalid_json", message: "Request body must be valid JSON." }) };
  }
};

const normalizeMode = (value: unknown) => {
  const mode = toText(value).toLowerCase();
  if (mode === "admin_publish" || mode === "admin_sync" || mode === "admin_disable") return mode;
  return "state";
};

const requestedItemId = (payload: PlaybackPayload) => toText(payload.item_id ?? payload.itemId) || null;
const requestedBroadcastSessionId = (payload: PlaybackPayload) =>
  toText(payload.broadcast_session_id ?? payload.broadcastSessionId) || null;
const requestedSourceRoomId = (payload: PlaybackPayload) => toText(payload.source_room_id ?? payload.sourceRoomId) || null;

const isProofRoomId = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  return normalized.startsWith("d7d_test_") || normalized.startsWith("d7e_");
};

const isPublicSafeRights = (value: unknown) => PUBLIC_SAFE_RIGHTS.has(toText(value));

const isApprovedHlsPlaylistUrl = (value: unknown) => {
  const normalized = toText(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") return null;
    if (!parsed.pathname.toLowerCase().endsWith(".m3u8")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const playlistPathFromUrl = (value: unknown) => {
  const approvedUrl = isApprovedHlsPlaylistUrl(value);
  if (!approvedUrl) return null;
  return new URL(approvedUrl).pathname.replace(/^\/+/g, "");
};

const functionBaseUrl = (req: Request) => {
  const url = new URL(req.url);
  const isLocalhost = ["127.0.0.1", "localhost"].includes(url.hostname);
  const protocol = isLocalhost ? url.protocol : "https:";
  const origin = `${protocol}//${url.host}`;
  const marker = "/functions/v1/spectator-playback";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex >= 0) return `${origin}${url.pathname.slice(0, markerIndex + marker.length)}`;
  return `${origin}/functions/v1/spectator-playback`;
};

const controlledPlaylistUrl = (req: Request, recordId: string) =>
  `${functionBaseUrl(req)}/records/${encodeURIComponent(recordId)}/index.m3u8`;

const base64UrlEncode = (value: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof value === "string"
    ? textEncoder.encode(value)
    : value instanceof Uint8Array
      ? value
      : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecodeText = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return String.fromCharCode(...Array.from(binary).map((character) => character.charCodeAt(0)));
  } catch {
    return "";
  }
};

const signCirclePlaybackToken = async (recordId: string, userId: string, expiresAtMillis: number) => {
  const payload = `${recordId}.${userId}.${expiresAtMillis}`;
  const signature = await hmacSha256(textEncoder.encode(readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")), payload);
  return `${base64UrlEncode(payload)}.${base64UrlEncode(signature)}`;
};

const verifyCirclePlaybackToken = async (token: string, recordId: string) => {
  const [encodedPayload, encodedSignature] = toText(token).split(".");
  if (!encodedPayload || !encodedSignature) return null;
  const payload = base64UrlDecodeText(encodedPayload);
  const [tokenRecordId, userId, expiresAtText] = payload.split(".");
  const expiresAtMillis = Number(expiresAtText);
  if (tokenRecordId !== recordId || !userId || !Number.isFinite(expiresAtMillis) || expiresAtMillis <= Date.now()) {
    return null;
  }
  const expectedSignature = await hmacSha256(textEncoder.encode(readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")), payload);
  if (base64UrlEncode(expectedSignature) !== encodedSignature) return null;
  return { userId };
};

const controlledCirclePlaylistUrl = async (req: Request, recordId: string, userId: string) => {
  const token = await signCirclePlaybackToken(recordId, userId, Date.now() + 5 * 60_000);
  return `${controlledPlaylistUrl(req, recordId)}?circleToken=${encodeURIComponent(token)}`;
};

const baseState = (state: string, title: string, copy: string, extra: JsonObject = {}) => ({
  canRenderPlayback: false,
  copy,
  fullRoomTokenForSpectators: false,
  playbackUrl: null,
  publicHlsBaseUrlUsed: false,
  rawHlsUrlReturned: false,
  state,
  title,
  ...extra,
});

const readDiscoveryItem = async (adminClient: SupabaseClientLike, itemId: string) => {
  const { data, error } = await adminClient
    .from("discovery_feed_items")
    .select(
      [
        "id",
        "room_id",
        "source_id",
        "source_type",
        "event_id",
        "visibility",
        "moderation_status",
        "rights_status",
        "access_type",
        "is_publicly_discoverable",
        "is_spectator_enabled",
        "is_spectator_playback_enabled",
        "requires_premium_to_join",
        "requires_ticket_to_watch",
        "requires_subscription_to_watch",
        "live_state",
      ].join(","),
    )
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw new Error(`Discovery item read failed: ${error.message}`);
  return (data ?? null) as DiscoveryFeedItemRow | null;
};

const readCircleSpectatorItem = async (adminClient: SupabaseClientLike, itemId: string) => {
  const { data, error } = await adminClient
    .from("circle_spectator_feed_items")
    .select(
      [
        "id",
        "creator_user_id",
        "host_user_id",
        "playback_record_id",
        "visibility",
        "access_type",
        "status",
        "moderation_status",
        "rights_status",
        "is_spectator_enabled",
        "is_spectator_playback_enabled",
        "allow_spectator_view",
      ].join(","),
    )
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw new Error(`Circle spectator item read failed: ${error.message}`);
  return (data ?? null) as CircleSpectatorFeedItemRow | null;
};

const canReadCircleSpectatorItem = async (
  adminClient: SupabaseClientLike,
  itemId: string,
  viewerUserId: string,
) => {
  const { data, error } = await adminClient.rpc("can_read_circle_spectator_feed_item", {
    p_item_id: itemId,
    p_viewer_user_id: viewerUserId,
  });
  if (error) return false;
  return data === true;
};

const canReadCirclePlaybackRecord = async (
  adminClient: SupabaseClientLike,
  recordId: string,
  viewerUserId: string,
) => {
  const { data, error } = await adminClient.rpc("can_read_circle_spectator_playback_record", {
    p_record_id: recordId,
    p_viewer_user_id: viewerUserId,
  });
  if (error) return false;
  return data === true;
};

const discoveryBlockState = (item: DiscoveryFeedItemRow | null) => {
  if (!item) return null;
  if (item.is_publicly_discoverable !== true || item.visibility !== "public" || item.moderation_status !== "clean") {
    return baseState(
      "blocked_not_public_safe",
      "Spectator playback is blocked.",
      "This item is not public-safe discovery content.",
    );
  }
  if (!isPublicSafeRights(item.rights_status)) {
    return baseState(
      toText(item.rights_status).includes("protected") ? "blocked_protected" : "blocked_title_rights",
      "Spectator playback is blocked by rights.",
      "This content is not available for public spectator playback.",
    );
  }
  if (item.access_type === "private" || item.access_type === "invite_only") {
    return baseState(
      "blocked_private",
      "Spectator playback is private.",
      "This room is not available for public spectator playback.",
    );
  }
  if (item.requires_ticket_to_watch || item.access_type === "ticketed") {
    return baseState(
      "blocked_ticketed",
      "Spectator playback is ticketed.",
      "Seat Pass public playback needs a backed purchase flow before it can be exposed.",
    );
  }
  if (item.requires_premium_to_join || item.access_type === "premium_only") {
    return baseState(
      "blocked_premium_full_room",
      "Full room access requires Premium.",
      "Spectator metadata is public-safe, but full room participation remains Premium-gated.",
    );
  }
  if (item.requires_subscription_to_watch || item.access_type === "subscriber_only_later") {
    return baseState(
      "blocked_not_public_safe",
      "Spectator playback is subscriber-only.",
      "Subscriber-only playback is not public-safe spectator playback.",
    );
  }
  if (!item.is_spectator_enabled) {
    return baseState(
      "not_configured",
      "Spectator playback is not configured.",
      "Spectator metadata is available, but broadcast playback has not been enabled for this item.",
    );
  }
  if (!item.is_spectator_playback_enabled) {
    return baseState(
      "waiting_for_egress",
      "Spectator playback is waiting on Egress/HLS proof.",
      "A public-safe playback record has not been approved for this item yet.",
    );
  }

  return null;
};

const circleBlockState = (
  item: CircleSpectatorFeedItemRow | null,
  viewerAllowed: boolean,
) => {
  if (!item) return null;
  if (!viewerAllowed) {
    return baseState(
      "blocked_private",
      "Spectator playback is private.",
      "This item is private to the creator's Chi'lly Circle.",
    );
  }
  if (
    item.status !== "active"
    || item.visibility !== "circle"
    || item.access_type !== "circle"
    || item.moderation_status !== "clean"
    || !isPublicSafeRights(item.rights_status)
  ) {
    return baseState(
      "blocked_not_public_safe",
      "Spectator playback is blocked.",
      "This Chi'lly Circle spectator item is not safety-cleared.",
    );
  }
  if (!item.is_spectator_enabled || !item.allow_spectator_view) {
    return baseState(
      "not_configured",
      "Spectator playback is not configured.",
      "Private spectator metadata is available, but playback has not been enabled.",
    );
  }
  if (!item.is_spectator_playback_enabled) {
    return baseState(
      "waiting_for_egress",
      "Spectator playback is waiting on Egress/HLS proof.",
      "A Chi'lly Circle playback record has not been approved for this item yet.",
    );
  }
  return null;
};

const readBroadcastSession = async (adminClient: SupabaseClientLike, broadcastSessionId: string) => {
  const { data, error } = await adminClient
    .from("room_broadcast_sessions")
    .select(
      [
        "id",
        "source_type",
        "source_room_id",
        "watch_party_room_id",
        "creator_event_id",
        "host_user_id",
        "channel_user_id",
        "broadcast_status",
        "egress_status",
        "hls_playback_url",
        "playback_url_status",
        "rights_status",
        "access_type",
        "is_publicly_watchable",
        "is_spectator_playback_enabled",
        "requires_premium",
        "requires_ticket",
        "metadata",
      ].join(","),
    )
    .eq("id", broadcastSessionId)
    .maybeSingle();

  if (error) throw new Error(`Broadcast session read failed: ${error.message}`);
  return (data ?? null) as BroadcastSessionRow | null;
};

const readPlaybackRecordById = async (adminClient: SupabaseClientLike, id: string) => {
  const { data, error } = await adminClient
    .from("spectator_hls_playback_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Spectator playback record read failed: ${error.message}`);
  return (data ?? null) as PlaybackRecordRow | null;
};

const readPlaybackRecordForState = async (
  adminClient: SupabaseClientLike,
  input: { broadcastSessionId?: string | null; sourceRoomIds?: string[] },
) => {
  const broadcastSessionId = toText(input.broadcastSessionId);
  if (broadcastSessionId) {
    const { data, error } = await adminClient
      .from("spectator_hls_playback_records")
      .select("*")
      .eq("broadcast_session_id", broadcastSessionId)
      .maybeSingle();

    if (error) throw new Error(`Spectator playback record read failed: ${error.message}`);
    if (data) return data as PlaybackRecordRow;
  }

  const sourceRoomIds = Array.from(new Set((input.sourceRoomIds ?? []).map(toText).filter(Boolean)));
  if (sourceRoomIds.length === 0) return null;

  const { data, error } = await adminClient
    .from("spectator_hls_playback_records")
    .select("*")
    .in("source_room_id", sourceRoomIds)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Spectator playback record read failed: ${error.message}`);
  return ((data as PlaybackRecordRow[] | null)?.[0] ?? null) as PlaybackRecordRow | null;
};

const isPublicSafeRecord = (record: PlaybackRecordRow | null): record is PublicSafePlaybackRecordRow => !!record
  && record.visibility === "public"
  && record.playback_status === "live"
  && !!toText(record.playlist_path)
  && record.is_publicly_watchable === true
  && record.is_spectator_playback_enabled === true
  && isPublicSafeRights(record.rights_status)
  && record.access_type === "public_free"
  && record.requires_premium === false
  && record.requires_ticket === false
  && !isProofRoomId(record.source_room_id);

const isPublicSafeSession = (session: BroadcastSessionRow | null): session is PublicSafeBroadcastSessionRow => !!session
  && session.is_publicly_watchable === true
  && session.is_spectator_playback_enabled === true
  && isPublicSafeRights(session.rights_status)
  && session.access_type === "public_free"
  && session.requires_premium === false
  && session.requires_ticket === false
  && session.playback_url_status === "public_safe_available"
  && (session.metadata?.d7f_public_safe_approved === true || session.metadata?.d7f_public_safe_approved === "true")
  && !!isApprovedHlsPlaylistUrl(session.hls_playback_url)
  && !isProofRoomId(session.source_room_id ?? session.watch_party_room_id ?? session.creator_event_id);

const isCircleSafeRecord = (record: PlaybackRecordRow | null): record is PublicSafePlaybackRecordRow => !!record
  && record.visibility === "circle"
  && record.playback_status === "live"
  && !!toText(record.playlist_path)
  && record.is_publicly_watchable === false
  && record.is_spectator_playback_enabled === true
  && isPublicSafeRights(record.rights_status)
  && record.access_type === "circle"
  && record.requires_premium === false
  && record.requires_ticket === false
  && !isProofRoomId(record.source_room_id);

const isCircleSafeSession = (session: BroadcastSessionRow | null) => !!session
  && session.is_publicly_watchable === false
  && session.is_spectator_playback_enabled === true
  && isPublicSafeRights(session.rights_status)
  && session.access_type === "circle"
  && session.requires_premium === false
  && session.requires_ticket === false
  && session.playback_url_status === "circle_safe_available"
  && (session.metadata?.circle_spectator_approved === true || session.metadata?.circle_spectator_approved === "true")
  && !!isApprovedHlsPlaylistUrl(session.hls_playback_url)
  && !isProofRoomId(session.source_room_id ?? session.watch_party_room_id ?? session.creator_event_id);

const blockedStateForRecord = (
  record: PlaybackRecordRow | null,
  session: BroadcastSessionRow | null,
  itemBlock: JsonObject | null,
) => {
  if (itemBlock) return itemBlock;
  if (!record) {
    return baseState(
      "not_configured",
      "Spectator playback is not configured.",
      "No approved public-safe playback record exists for this item.",
    );
  }
  if (record.visibility === "proof" || isProofRoomId(record.source_room_id) || isProofRoomId(session?.source_room_id)) {
    return baseState(
      "blocked_not_public_safe",
      "Proof room playback is blocked.",
      "Private proof rooms are not public spectator playback.",
    );
  }
  if (record.visibility !== "public" || session?.access_type === "private" || session?.access_type === "invite_only") {
    return baseState(
      "blocked_private",
      "Spectator playback is private.",
      "This room is not available for public spectator playback.",
    );
  }
  if (!isPublicSafeRights(record.rights_status) || !isPublicSafeRights(session?.rights_status)) {
    return baseState(
      toText(record.rights_status ?? session?.rights_status).includes("protected") ? "blocked_protected" : "blocked_title_rights",
      "Spectator playback is blocked by rights.",
      "This content is not available for public spectator playback.",
    );
  }
  if (record.requires_ticket || session?.requires_ticket || record.access_type === "ticketed" || session?.access_type === "ticketed") {
    return baseState(
      "blocked_ticketed",
      "Spectator playback is ticketed.",
      "Seat Pass public playback needs a backed purchase flow before it can be exposed.",
    );
  }
  if (record.requires_premium || session?.requires_premium || record.access_type === "premium_only" || session?.access_type === "premium_only") {
    return baseState(
      "blocked_premium_full_room",
      "Full room access requires Premium.",
      "Spectator playback cannot bypass Premium full-room access.",
    );
  }
  if (record.playback_status === "disabled") {
    return baseState(
      "unavailable",
      "Spectator playback is disabled.",
      "This public-safe playback record has been disabled by an operator.",
    );
  }
  if (record.playback_status === "failed") {
    return baseState(
      "error",
      "Spectator playback is unavailable.",
      "The approved HLS session failed. No fallback playback is shown.",
    );
  }
  if (record.playback_status === "ended") {
    return baseState(
      "ended",
      "This broadcast has ended.",
      "No public replay is available from spectator playback.",
    );
  }

  return baseState(
    "waiting_for_egress",
    "Spectator playback is waiting on Egress/HLS proof.",
    "The public-safe playback record is not live yet.",
  );
};

const resolvePlaybackState = (
  req: Request,
  record: PlaybackRecordRow | null,
  session: BroadcastSessionRow | null,
  itemBlock: JsonObject | null,
  circleUserId?: string | null,
) => {
  const itemBlockState = toText(itemBlock?.state);
  if (itemBlock && (
    itemBlockState === "blocked_not_public_safe"
    || itemBlockState === "blocked_protected"
    || itemBlockState === "blocked_title_rights"
    || itemBlockState === "blocked_private"
    || itemBlockState === "blocked_ticketed"
    || itemBlockState === "blocked_premium_full_room"
  )) {
    return itemBlock;
  }

  if (isPublicSafeRecord(record) && isPublicSafeSession(session)) {
    return {
      canRenderPlayback: true,
      copy: "This room has an approved public-safe HLS source and remains watch-only for spectators.",
      fullRoomTokenForSpectators: false,
      playbackUrl: controlledPlaylistUrl(req, record.id),
      publicHlsBaseUrlUsed: false,
      rawHlsUrlReturned: false,
      state: "available",
      title: "Spectator playback is available.",
    };
  }

  if (circleUserId && isCircleSafeRecord(record) && isCircleSafeSession(session)) {
    return {
      canRenderPlayback: true,
      copy: "This item is private to your Chi'lly Circle and remains watch-only for spectators.",
      fullRoomTokenForSpectators: false,
      playbackUrl: null,
      publicHlsBaseUrlUsed: false,
      rawHlsUrlReturned: false,
      state: "available",
      title: "Circle spectator playback is available.",
    };
  }

  return blockedStateForRecord(record, session, itemBlock);
};

const readState = async (req: Request, adminClient: SupabaseClientLike, payload: PlaybackPayload) => {
  const itemId = requestedItemId(payload);
  const sourceRoomId = requestedSourceRoomId(payload);
  const broadcastSessionId = requestedBroadcastSessionId(payload);
  const item = itemId ? await readDiscoveryItem(adminClient, itemId) : null;
  const { supabaseAnonKey, supabaseUrl } = createAuthClient();
  const authResult = item ? null : await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
  const circleItem = !item && itemId ? await readCircleSpectatorItem(adminClient, itemId) : null;
  const circleUser = authResult && !("error" in authResult) ? authResult.user : null;
  const circleAllowed = circleItem && circleUser
    ? await canReadCircleSpectatorItem(adminClient, circleItem.id, circleUser.id)
    : false;
  const itemBlock = item ? discoveryBlockState(item) : circleBlockState(circleItem, circleAllowed);
  const sourceRoomIds = [
    sourceRoomId,
    item?.room_id,
    item?.source_id,
    item?.event_id,
    item?.id,
    circleItem?.id,
  ].map(toText).filter(Boolean);
  const record = circleItem?.playback_record_id
    ? await readPlaybackRecordById(adminClient, circleItem.playback_record_id)
    : await readPlaybackRecordForState(adminClient, { broadcastSessionId, sourceRoomIds });
  const session = record ? await readBroadcastSession(adminClient, record.broadcast_session_id) : null;
  const state = resolvePlaybackState(req, record, session, itemBlock, circleAllowed && circleUser ? circleUser.id : null);

  return {
    ...state,
    ...(state.canRenderPlayback === true && circleAllowed && circleUser && record?.id
      ? { playbackUrl: await controlledCirclePlaylistUrl(req, record.id, circleUser.id) }
      : {}),
    broadcastSessionId: record?.broadcast_session_id ?? null,
    recordId: record?.id ?? null,
  };
};

const playbackStatusForSession = (session: BroadcastSessionRow) => {
  if (session.broadcast_status === "ended" || session.egress_status === "stopped_later") return "ended";
  if (session.broadcast_status === "failed_later" || session.egress_status === "failed_later") return "failed";
  if (session.broadcast_status === "active_later" || session.egress_status === "active_later") return "live";
  return "pending";
};

const publicSafeSessionFailure = (session: BroadcastSessionRow | null) => {
  if (!session) return "not_found";
  if (!toText(session.source_room_id ?? session.watch_party_room_id ?? session.creator_event_id)) return "source_room_missing";
  if (isProofRoomId(session.source_room_id ?? session.watch_party_room_id ?? session.creator_event_id)) return "proof_room_blocked";
  if (!isPublicSafeRights(session.rights_status)) return "rights_not_public_safe";
  if (session.access_type !== "public_free") return "access_not_public_free";
  if (session.requires_premium) return "premium_full_room_blocked";
  if (session.requires_ticket) return "ticketed_blocked";
  if (!isApprovedHlsPlaylistUrl(session.hls_playback_url)) return "approved_hls_playlist_missing";
  return null;
};

const writeAuditLog = async (
  adminClient: SupabaseClientLike,
  input: {
    action: string;
    actorEmail?: string | null;
    actorUserId?: string | null;
    afterState?: unknown;
    beforeState?: unknown;
    reason: string;
    severity?: string;
    targetId?: string | null;
  },
) => {
  await adminClient.from("platform_admin_audit_logs").insert({
    action: input.action,
    action_category: "foundation",
    actor_email: input.actorEmail ?? null,
    actor_role: "operator",
    actor_user_id: input.actorUserId ?? null,
    after_state: input.afterState ?? null,
    before_state: input.beforeState ?? null,
    metadata: {
      backend_only: true,
      function_name: FUNCTION_NAME,
      full_room_token_for_spectators: false,
      public_hls_base_url_used: false,
      raw_hls_url_returned: false,
      route_owner: "/spectate/[itemId]",
    },
    reason: input.reason,
    severity: input.severity ?? "notice",
    target_id: input.targetId ?? null,
    target_type: "spectator_hls_playback_record",
  });
};

const requireOperator = async (req: Request, adminClient: SupabaseClientLike) => {
  const { supabaseAnonKey, supabaseUrl } = createAuthClient();
  const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
  if ("error" in authResult) return authResult;

  const hasOperatorRole = await userHasPlatformRole(adminClient, authResult.user, ["owner", "operator"]);
  if (!hasOperatorRole) {
    return {
      error: jsonResponse(403, {
        error: "operator_required",
        fullRoomTokenForSpectators: false,
        message: "Spectator playback admin actions require owner/operator role.",
        rawHlsUrlReturned: false,
      }),
    };
  }

  return authResult;
};

const upsertPlaybackRecord = async (
  adminClient: SupabaseClientLike,
  session: BroadcastSessionRow,
  visibility: "public" | "disabled",
) => {
  const playlistPath = playlistPathFromUrl(session.hls_playback_url);
  const playbackStatus = visibility === "disabled" ? "disabled" : playbackStatusForSession(session);
  const { data, error } = await adminClient
    .from("spectator_hls_playback_records")
    .upsert({
      access_type: session.access_type,
      broadcast_session_id: session.id,
      channel_user_id: session.channel_user_id,
      creator_event_id: session.creator_event_id,
      host_user_id: session.host_user_id,
      is_publicly_watchable: visibility === "public",
      is_spectator_playback_enabled: visibility === "public",
      metadata: {
        d7f_public_safe_gate: true,
        full_room_token_for_spectators: false,
        raw_hls_url_visible_to_public: false,
        source_type: session.source_type,
      },
      playback_status: playbackStatus,
      playlist_path: visibility === "public" ? playlistPath : null,
      requires_premium: session.requires_premium,
      requires_ticket: session.requires_ticket,
      rights_status: session.rights_status,
      source_room_id: session.source_room_id ?? session.watch_party_room_id ?? session.creator_event_id ?? session.id,
      updated_at: new Date().toISOString(),
      visibility,
      watch_party_room_id: session.watch_party_room_id,
    }, { onConflict: "broadcast_session_id" })
    .select("*")
    .single();

  if (error) throw new Error(`Spectator playback record write failed: ${error.message}`);
  return data as PlaybackRecordRow;
};

const syncDiscoverySpectatorFlags = async (
  adminClient: SupabaseClientLike,
  session: BroadcastSessionRow,
  record: PlaybackRecordRow,
  enabled: boolean,
) => {
  const nextPlaybackEnabled = enabled && record.playback_status === "live";
  const updates = {
    is_spectator_enabled: enabled,
    is_spectator_playback_enabled: nextPlaybackEnabled,
    updated_at: new Date().toISOString(),
  };
  const candidates = Array.from(new Set([
    session.source_room_id,
    session.watch_party_room_id,
    session.creator_event_id,
  ].map(toText).filter(Boolean)));
  const filters = ["room_id", "source_id", "event_id"] as const;

  for (const candidate of candidates) {
    for (const filter of filters) {
      const { error } = await adminClient
        .from("discovery_feed_items")
        .update(updates)
        .eq(filter, candidate);
      if (error) throw new Error(`Discovery spectator flag sync failed: ${error.message}`);
    }
  }
};

const handleAdminMode = async (
  req: Request,
  adminClient: SupabaseClientLike,
  mode: "admin_publish" | "admin_sync" | "admin_disable",
  payload: PlaybackPayload,
) => {
  const operator = await requireOperator(req, adminClient);
  if ("error" in operator) return operator.error;

  const broadcastSessionId = requestedBroadcastSessionId(payload);
  if (!broadcastSessionId) {
    return jsonResponse(400, {
      error: "broadcast_session_required",
      message: "broadcastSessionId is required for spectator playback admin actions.",
    });
  }

  const session = await readBroadcastSession(adminClient, broadcastSessionId);
  if (!session) {
    return jsonResponse(404, {
      error: "not_found",
      message: "Broadcast session was not found.",
      rawHlsUrlReturned: false,
    });
  }

  if (mode === "admin_disable") {
    const disabledRecord = await upsertPlaybackRecord(adminClient, session, "disabled");
    await syncDiscoverySpectatorFlags(adminClient, session, disabledRecord, false);
    await writeAuditLog(adminClient, {
      action: "spectator_playback_disabled",
      actorEmail: operator.user.email,
      actorUserId: operator.user.id,
      afterState: { recordId: disabledRecord.id, state: "disabled" },
      reason: "D7F public-safe spectator playback read model disabled by owner/operator.",
      targetId: disabledRecord.id,
    }).catch(() => null);

    return jsonResponse(200, {
      ...baseState(
        "unavailable",
        "Spectator playback is disabled.",
        "This public-safe playback record has been disabled by an operator.",
      ),
      broadcastSessionId,
      recordId: disabledRecord.id,
    });
  }

  const failure = publicSafeSessionFailure(session);
  if (failure) {
    await writeAuditLog(adminClient, {
      action: "spectator_playback_public_safe_blocked",
      actorEmail: operator.user.email,
      actorUserId: operator.user.id,
      afterState: {
        failure,
        full_room_token_for_spectators: false,
        raw_hls_url_returned: false,
      },
      reason: "D7F public-safe spectator playback publish/sync blocked by safety checks.",
      severity: "warning",
      targetId: broadcastSessionId,
    }).catch(() => null);

    return jsonResponse(409, {
      error: failure,
      fullRoomTokenForSpectators: false,
      message: "Broadcast session is not eligible for public-safe spectator playback.",
      rawHlsUrlReturned: false,
    });
  }

  let approvedSession = session;
  if (mode === "admin_publish" && !isPublicSafeSession(session)) {
    const nextMetadata = {
      ...(session.metadata ?? {}),
      d7f_public_safe_approved: true,
      full_room_token_for_spectators: false,
      public_playback_enabled: true,
      raw_hls_url_returned_to_public: false,
      spectator_playback_enabled: true,
    };
    const { data, error } = await adminClient
      .from("room_broadcast_sessions")
      .update({
        is_publicly_watchable: true,
        is_spectator_playback_enabled: true,
        metadata: nextMetadata,
        playback_url_status: "public_safe_available",
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .select("*")
      .single();

    if (error) throw new Error(`Broadcast session public-safe publish failed: ${error.message}`);
    approvedSession = data as BroadcastSessionRow;
  }

  if (!isPublicSafeSession(approvedSession)) {
    return jsonResponse(409, {
      error: "public_safe_approval_missing",
      fullRoomTokenForSpectators: false,
      message: "Broadcast session is not approved for public-safe spectator playback.",
      rawHlsUrlReturned: false,
    });
  }

  const record = await upsertPlaybackRecord(adminClient, approvedSession, "public");
  await syncDiscoverySpectatorFlags(adminClient, approvedSession, record, true);
  const state = resolvePlaybackState(req, record, approvedSession, null);
  await writeAuditLog(adminClient, {
    action: mode === "admin_publish" ? "spectator_playback_public_safe_published" : "spectator_playback_public_safe_synced",
    actorEmail: operator.user.email,
    actorUserId: operator.user.id,
    afterState: {
      broadcastSessionId,
      canRenderPlayback: state.canRenderPlayback === true,
      full_room_token_for_spectators: false,
      recordId: record.id,
      raw_hls_url_returned: false,
      state: state.state,
    },
    reason: "D7F public-safe spectator playback read model updated from an approved HLS broadcast session.",
    targetId: record.id,
  }).catch(() => null);

  return jsonResponse(200, {
    ...state,
    broadcastSessionId,
    recordId: record.id,
  });
};

const readRecordAndSession = async (adminClient: SupabaseClientLike, recordId: string) => {
  const record = await readPlaybackRecordById(adminClient, recordId);
  const session = record ? await readBroadcastSession(adminClient, record.broadcast_session_id) : null;
  return { record, session };
};

const parseRecordRoute = (req: Request) => {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const functionIndex = segments.findIndex((segment) => segment === "spectator-playback");
  const route = functionIndex >= 0 ? segments.slice(functionIndex + 1) : segments;
  if (route[0] !== "records" || !route[1]) return null;

  if (route[2] === "index.m3u8") {
    return { kind: "playlist" as const, recordId: route[1], segmentPath: null };
  }

  if (route[2] === "segment") {
    return {
      kind: "segment" as const,
      recordId: route[1],
      segmentPath: url.searchParams.get("path"),
    };
  }

  return null;
};

const rewritePlaylist = (req: Request, recordId: string, playlist: string) =>
  playlist.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const circleToken = new URL(req.url).searchParams.get("circleToken");
    const tokenQuery = circleToken ? `&circleToken=${encodeURIComponent(circleToken)}` : "";
    return `${functionBaseUrl(req)}/records/${encodeURIComponent(recordId)}/segment?path=${encodeURIComponent(trimmed)}${tokenQuery}`;
  }).join("\n");

const handlePlaylistFetch = async (req: Request, adminClient: SupabaseClientLike, recordId: string) => {
  const { record, session } = await readRecordAndSession(adminClient, recordId);
  const circleToken = new URL(req.url).searchParams.get("circleToken");
  const circleTokenPayload = circleToken ? await verifyCirclePlaybackToken(circleToken, recordId) : null;
  const circleAllowed = circleTokenPayload
    ? await canReadCirclePlaybackRecord(adminClient, recordId, circleTokenPayload.userId)
    : false;
  const state = resolvePlaybackState(req, record, session, null, circleAllowed ? circleTokenPayload?.userId : null);
  if (state.canRenderPlayback !== true || !record || !session) {
    return jsonResponse(403, {
      ...state,
      rawHlsUrlReturned: false,
    });
  }

  const sourceUrl = isApprovedHlsPlaylistUrl(session.hls_playback_url);
  if (!sourceUrl) {
    return jsonResponse(404, {
      ...baseState(
        "unavailable",
        "Spectator playback is unavailable.",
        "The approved HLS playlist is missing.",
      ),
      rawHlsUrlReturned: false,
    });
  }

  const playlistFetch = await fetchApprovedHlsUrl(sourceUrl, {
    Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain",
  });
  const response = playlistFetch.response;
  if (!response.ok) {
    return jsonResponse(502, {
      ...baseState(
        "error",
        "Spectator playback is unavailable.",
        "The approved HLS playlist could not be fetched.",
      ),
      rawHlsUrlReturned: false,
    });
  }

  const playlist = await response.text();
  return new Response(rewritePlaylist(req, record.id, playlist), {
    headers: PLAYLIST_HEADERS,
    status: 200,
  });
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

const handleSegmentFetch = async (
  req: Request,
  adminClient: SupabaseClientLike,
  recordId: string,
  segmentPath: string | null,
) => {
  const { record, session } = await readRecordAndSession(adminClient, recordId);
  const circleToken = new URL(req.url).searchParams.get("circleToken");
  const circleTokenPayload = circleToken ? await verifyCirclePlaybackToken(circleToken, recordId) : null;
  const circleAllowed = circleTokenPayload
    ? await canReadCirclePlaybackRecord(adminClient, recordId, circleTokenPayload.userId)
    : false;
  const state = resolvePlaybackState(req, record, session, null, circleAllowed ? circleTokenPayload?.userId : null);
  if (state.canRenderPlayback !== true || !record || !session) {
    return jsonResponse(403, {
      ...state,
      rawHlsUrlReturned: false,
    });
  }

  const sourceUrl = isApprovedHlsPlaylistUrl(session.hls_playback_url);
  const targetUrl = sourceUrl && segmentPath ? safeSegmentUrl(sourceUrl, segmentPath) : null;
  if (!targetUrl) {
    return jsonResponse(400, {
      error: "invalid_segment",
      message: "Segment path is not valid for this playback record.",
      rawHlsUrlReturned: false,
    });
  }

  const segmentFetch = await fetchApprovedHlsUrl(targetUrl);
  const upstream = segmentFetch.response;
  if (!upstream.ok || !upstream.body) {
    return jsonResponse(502, {
      error: "segment_fetch_failed",
      message: "The approved HLS segment could not be fetched.",
      rawHlsUrlReturned: false,
    });
  }

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
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(200, {
        ...baseState(
          "not_configured",
          "Spectator playback is not configured.",
          adminConfig.message,
        ),
        reason: adminConfig.reason,
      });
    }
    const adminClient = adminConfig.client;

    if (req.method === "GET") {
      const route = parseRecordRoute(req);
      if (!route) {
        return jsonResponse(404, {
          error: "not_found",
          message: "Use the public state endpoint or a controlled playback record URL.",
        });
      }
      if (route.kind === "playlist") return await handlePlaylistFetch(req, adminClient, route.recordId);
      return await handleSegmentFetch(req, adminClient, route.recordId, route.segmentPath);
    }

    if (req.method !== "POST") {
      return jsonResponse(405, {
        error: "method_not_allowed",
        message: "Use GET for controlled playback resources or POST for state/admin actions.",
      });
    }

    const parsed = await parseJsonPayload(req);
    if ("error" in parsed) return parsed.error;

    const mode = normalizeMode(parsed.value.mode);
    if (mode === "admin_publish" || mode === "admin_sync" || mode === "admin_disable") {
      return await handleAdminMode(req, adminClient, mode, parsed.value);
    }

    return jsonResponse(200, await readState(req, adminClient, parsed.value));
  } catch (error) {
    return jsonResponse(500, {
      ...baseState(
        "error",
        "Spectator playback is unavailable.",
        "The spectator playback resolver failed safely.",
      ),
      error: "spectator_playback_failed",
      message: sanitizeErrorMessage(error),
    });
  }
});
