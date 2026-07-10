import { createClient } from "npm:@supabase/supabase-js@2";

type PremiumRenditionLabel = "720p" | "1080p";
type SupabaseClient = any;

type RequestPayload = {
  source_type?: unknown;
  source_id?: unknown;
  rendition_label?: unknown;
  path?: unknown;
  manifest_path?: unknown;
};

type PremiumRenditionRow = {
  id: string;
  source_type: string | null;
  source_id: string | null;
  rendition_label: string | null;
  delivery_format: string | null;
  delivery_provider: string | null;
  storage_provider: string | null;
  bucket_role: string | null;
  visibility: string | null;
  public_playback_path: string | null;
  protected_playback_path: string | null;
  manifest_path: string | null;
  variant_playlist_path: string | null;
  scan_status: string | null;
  moderation_status: string | null;
  is_ready: boolean | null;
  is_original: boolean | null;
  is_public_playback_safe: boolean | null;
  is_protected_playback_safe: boolean | null;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const PREMIUM_RENDITIONS = new Set(["720p", "1080p"]);
const CLEAN_SCAN_STATUSES = new Set(["clean", "approved"]);
const ALLOWED_MODERATION_STATUSES = new Set(["clean", "approved", "allowed"]);
const PROTECTED_PREFIXES = [
  "playback/protected/premium/",
  "playback/premium/",
];
const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 900;
const encoder = new TextEncoder();

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });

const readEnv = (name: string) => toText(Deno.env.get(name));

const readRequiredEnv = () => {
  const env = {
    SUPABASE_URL: readEnv("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    PREMIUM_CDN_TOKEN_SECRET: readEnv("PREMIUM_CDN_TOKEN_SECRET"),
    PREMIUM_MEDIA_WORKER_BASE_URL: readEnv("PREMIUM_MEDIA_WORKER_BASE_URL"),
    PREMIUM_CDN_TOKEN_TTL_SECONDS: readEnv("PREMIUM_CDN_TOKEN_TTL_SECONDS"),
  };
  const missing = Object.entries(env)
    .filter(([name, value]) => name !== "PREMIUM_CDN_TOKEN_TTL_SECONDS" && !value)
    .map(([name]) => name);
  return { env, missing };
};

const normalizePath = (value: unknown) => toText(value).replace(/\\/g, "/").replace(/^\/+/g, "");

const isInvalidObjectPath = (path: string) => (
  !path
  || path.includes("..")
  || /^https?:\/\//i.test(path)
  || /[\u0000-\u001F\u007F]/u.test(path)
);

const isProtectedPremiumPath = (path: string) => (
  PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))
);

const isUuid = (value: string) => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
);

const normalizeTtlSeconds = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(1, Math.floor(parsed)));
};

const readBearerToken = (req: Request) => {
  const auth = toText(req.headers.get("authorization"));
  return /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "";
};

const base64UrlEncodeBytes = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlEncodeText = (value: string) => base64UrlEncodeBytes(encoder.encode(value));

const importHmacKey = async (secret: string) => (
  crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
);

const signPremiumCdnToken = async (claims: Record<string, unknown>, secret: string) => {
  const header = { alg: "HS256", typ: "premium-media-access", version: 1 };
  const headerPart = base64UrlEncodeText(JSON.stringify(header));
  const payloadPart = base64UrlEncodeText(JSON.stringify(claims));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${headerPart}.${payloadPart}`));
  return `${headerPart}.${payloadPart}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
};

const safeWorkerBaseUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !parsed.hostname) return "";
    parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/g, "");
  } catch {
    return "";
  }
};

const pathMatchesSource = (path: string, sourceType: string, sourceId: string) => {
  const encodedSourceType = encodeURIComponent(sourceType);
  const encodedSourceId = encodeURIComponent(sourceId);
  return path.startsWith(`playback/protected/premium/${encodedSourceType}/${encodedSourceId}/`)
    || path.startsWith(`playback/premium/${encodedSourceType}/${encodedSourceId}/`);
};

const validateRenditionRow = (row: PremiumRenditionRow, requestedPath: string) => {
  const sourceType = toText(row.source_type);
  const sourceId = toText(row.source_id);
  const renditionLabel = toLowerText(row.rendition_label);
  const path = normalizePath(row.protected_playback_path || row.manifest_path);

  if (sourceType !== "creator_video") return "unsupported_source_type";
  if (!sourceId || !isUuid(sourceId)) return "invalid_source_id";
  if (!PREMIUM_RENDITIONS.has(renditionLabel)) return "unsupported_rendition";
  if (toLowerText(row.visibility) !== "premium") return "unsupported_visibility";
  if (row.is_ready !== true) return "rendition_not_ready";
  if (row.is_original === true) return "original_or_master_blocked";
  if (row.is_public_playback_safe === true) return "unsafe_public_hd_row";
  if (row.is_protected_playback_safe !== true) return "protected_playback_not_safe";
  if (!CLEAN_SCAN_STATUSES.has(toLowerText(row.scan_status))) return "scan_not_clean";
  if (!ALLOWED_MODERATION_STATUSES.has(toLowerText(row.moderation_status))) return "moderation_not_allowed";
  if (toLowerText(row.delivery_format) !== "hls") return "unsupported_delivery_format";
  if (toLowerText(row.delivery_provider) !== "cloudflare_r2_premium_token") return "unsupported_delivery_provider";
  if (toLowerText(row.storage_provider) !== "cloudflare_r2") return "unsupported_storage_provider";
  if (toLowerText(row.bucket_role) !== "protected_premium") return "wrong_bucket_role";
  if (!path) return "missing_protected_path";
  if (isInvalidObjectPath(path)) return "invalid_protected_path";
  if (!isProtectedPremiumPath(path)) return "outside_protected_premium_prefix";
  if (!pathMatchesSource(path, sourceType, sourceId)) return "source_path_scope_mismatch";
  if (!path.endsWith("/master.m3u8")) return "manifest_path_required";
  if (requestedPath && requestedPath !== path) return "requested_path_mismatch";
  return null;
};

const readPremiumRendition = async (adminClient: SupabaseClient, payload: RequestPayload) => {
  const sourceType = toText(payload.source_type);
  const sourceId = toText(payload.source_id);
  const requestedLabel = toLowerText(payload.rendition_label);
  const requestedPath = normalizePath(payload.path || payload.manifest_path);

  if (sourceType !== "creator_video") return { error: json(400, { ok: false, reason: "unsupported_source_type" }) };
  if (!sourceId || !isUuid(sourceId)) return { error: json(400, { ok: false, reason: "invalid_source_id" }) };
  if (requestedLabel && !PREMIUM_RENDITIONS.has(requestedLabel)) {
    return { error: json(400, { ok: false, reason: "unsupported_rendition" }) };
  }
  if (requestedPath && (!isProtectedPremiumPath(requestedPath) || isInvalidObjectPath(requestedPath))) {
    return { error: json(400, { ok: false, reason: "invalid_requested_path" }) };
  }

  let query = adminClient
    .from("media_renditions")
    .select([
      "id",
      "source_type",
      "source_id",
      "rendition_label",
      "delivery_format",
      "delivery_provider",
      "storage_provider",
      "bucket_role",
      "visibility",
      "public_playback_path",
      "protected_playback_path",
      "manifest_path",
      "variant_playlist_path",
      "scan_status",
      "moderation_status",
      "is_ready",
      "is_original",
      "is_public_playback_safe",
      "is_protected_playback_safe",
    ].join(","))
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("delivery_format", "hls")
    .eq("delivery_provider", "cloudflare_r2_premium_token")
    .eq("storage_provider", "cloudflare_r2")
    .eq("bucket_role", "protected_premium")
    .eq("visibility", "premium")
    .eq("is_ready", true)
    .eq("is_original", false)
    .eq("is_public_playback_safe", false)
    .eq("is_protected_playback_safe", true)
    .in("rendition_label", requestedLabel ? [requestedLabel] : ["1080p", "720p"])
    .in("scan_status", ["clean", "approved"])
    .in("moderation_status", ["clean", "approved", "allowed"])
    .order("height", { ascending: false })
    .limit(4);

  const { data, error } = await query;
  if (error) return { error: json(500, { ok: false, reason: "rendition_query_failed" }) };
  const rows = (data ?? []) as PremiumRenditionRow[];
  const validRows = rows
    .map((row) => ({ row, blockedReason: validateRenditionRow(row, requestedPath) }))
    .filter((entry) => !entry.blockedReason);
  if (!validRows.length) return { error: json(404, { ok: false, reason: "premium_hd_rendition_unavailable" }) };
  return { row: validRows[0].row };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, reason: "method_not_allowed" });

  const { env, missing } = readRequiredEnv();
  if (missing.length) return json(503, { ok: false, reason: "missing_token_issuer_env", missing_env: missing });

  const workerBaseUrl = safeWorkerBaseUrl(env.PREMIUM_MEDIA_WORKER_BASE_URL);
  if (!workerBaseUrl) return json(503, { ok: false, reason: "invalid_worker_base_url" });

  const jwt = readBearerToken(req);
  if (!jwt) return json(401, { ok: false, reason: "missing_auth" });

  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "premium-media-playback-token" } },
  });

  const { data: authData, error: authError } = await adminClient.auth.getUser(jwt);
  const userId = toText(authData?.user?.id);
  if (authError || !userId || !isUuid(userId)) return json(401, { ok: false, reason: "invalid_auth" });

  const { data: premiumActive, error: premiumError } = await adminClient
    .rpc("monetization_has_active_premium", { p_user_id: userId });
  if (premiumError) return json(503, { ok: false, reason: "premium_entitlement_check_failed" });
  if (premiumActive !== true) return json(403, { ok: false, reason: "premium_entitlement_required" });

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, reason: "invalid_json" });
  }

  const renditionRead = await readPremiumRendition(adminClient, payload);
  if (renditionRead.error) return renditionRead.error;
  const row = renditionRead.row;
  const path = normalizePath(row.protected_playback_path || row.manifest_path);
  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const expiresInSeconds = normalizeTtlSeconds(env.PREMIUM_CDN_TOKEN_TTL_SECONDS);
  const claims = {
    tokenType: "premium_cdn_playback",
    version: 1,
    premiumEntitlement: true,
    userId,
    sourceType: toText(row.source_type),
    sourceId: toText(row.source_id),
    renditionLabel: toLowerText(row.rendition_label) as PremiumRenditionLabel,
    path,
    issuedAtEpochSeconds: nowEpochSeconds,
    expiresAtEpochSeconds: nowEpochSeconds + expiresInSeconds,
    scope: "single_hls_rendition",
  };
  const token = await signPremiumCdnToken(claims, env.PREMIUM_CDN_TOKEN_SECRET);
  const playbackUrl = `${workerBaseUrl}/${path}?token=${encodeURIComponent(token)}`;

  return json(200, {
    ok: true,
    playbackUrl,
    provider: "cloudflare_r2_premium_token",
    deliveryFormat: "hls",
    renditionLabel: claims.renditionLabel,
    tokenized: true,
    protectedPlayback: true,
    expiresInSeconds,
    rawUrlRedacted: true,
    noSecretsReturned: true,
  });
});
