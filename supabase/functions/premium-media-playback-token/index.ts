import { createClient } from "npm:@supabase/supabase-js@2";
import {
  creatorContentResolutionAllowed,
  creatorVideoParentResolutionAllowed,
  isCrossOwnerCreatorContentStaffAccess,
} from "../_shared/media-download-authority.ts";

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
  video_id: string | null;
  creator_id: string | null;
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

type CreatorVideoParentRow = {
  id: string;
  owner_id: string;
  moderation_status: string | null;
  scan_status: string | null;
  quarantined_at: string | null;
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
    SUPABASE_ANON_KEY: readEnv("SUPABASE_ANON_KEY"),
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

const hasScopedCrossOwnerPlaybackAuthority = async (actorClient: SupabaseClient) => {
  const [moderation, reports] = await Promise.all([
    actorClient.rpc("has_platform_permission", { p_permission_key: "content_moderation" }),
    actorClient.rpc("has_platform_permission", { p_permission_key: "reports_review" }),
  ]);
  if (moderation.error || reports.error) return false;
  return moderation.data === true || reports.data === true;
};

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

const validateRenditionRow = (
  row: PremiumRenditionRow,
  requestedPath: string,
  parent: CreatorVideoParentRow,
) => {
  const sourceType = toText(row.source_type);
  const sourceId = toText(row.source_id);
  const renditionLabel = toLowerText(row.rendition_label);
  const path = normalizePath(row.protected_playback_path || row.manifest_path);

  if (sourceType !== "creator_video") return "unsupported_source_type";
  if (!sourceId || !isUuid(sourceId)) return "invalid_source_id";
  if (toText(row.video_id) !== sourceId || sourceId !== toText(parent.id)) return "source_parent_binding_mismatch";
  if (!isUuid(toText(parent.owner_id)) || toText(row.creator_id) !== toText(parent.owner_id)) {
    return "creator_parent_binding_mismatch";
  }
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

const readCreatorVideoParent = async (adminClient: SupabaseClient, sourceId: string) => {
  const { data, error } = await adminClient
    .from("videos")
    .select("id,owner_id,moderation_status,scan_status,quarantined_at")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) return { error: json(503, { ok: false, reason: "source_parent_check_failed" }) };
  if (!data) return { error: json(403, { ok: false, reason: "source_parent_unavailable" }) };
  return { row: data as CreatorVideoParentRow };
};

const readPremiumRendition = async (
  adminClient: SupabaseClient,
  payload: RequestPayload,
  parent: CreatorVideoParentRow,
) => {
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
      "video_id",
      "creator_id",
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
    .eq("video_id", sourceId)
    .eq("creator_id", parent.owner_id)
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
    .map((row) => ({ row, blockedReason: validateRenditionRow(row, requestedPath, parent) }))
    .filter((entry) => !entry.blockedReason);
  if (!validRows.length) return { error: json(404, { ok: false, reason: "premium_hd_rendition_unavailable" }) };
  return { row: validRows[0].row };
};

const rereadExactPremiumRendition = async (
  adminClient: SupabaseClient,
  renditionId: string,
  payload: RequestPayload,
  parent: CreatorVideoParentRow,
) => {
  const requestedPath = normalizePath(payload.path || payload.manifest_path);
  const { data, error } = await adminClient
    .from("media_renditions")
    .select([
      "id",
      "video_id",
      "creator_id",
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
    .eq("id", renditionId)
    .eq("source_type", "creator_video")
    .eq("source_id", parent.id)
    .eq("video_id", parent.id)
    .eq("creator_id", parent.owner_id)
    .maybeSingle();
  if (error) return { error: json(503, { ok: false, reason: "rendition_recheck_failed" }) };
  if (!data) return { error: json(403, { ok: false, reason: "rendition_changed_before_signing" }) };
  const row = data as PremiumRenditionRow;
  if (validateRenditionRow(row, requestedPath, parent) !== null) {
    return { error: json(403, { ok: false, reason: "rendition_changed_before_signing" }) };
  }
  return { row };
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

  const authorization = `Bearer ${jwt}`;
  const actorClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: authorization,
        "X-Client-Info": "premium-media-playback-token",
      },
    },
  });

  const { data: authData, error: authError } = await actorClient.auth.getUser();
  const userId = toText(authData?.user?.id);
  if (authError || !userId || !isUuid(userId)) return json(401, { ok: false, reason: "invalid_auth" });

  const { data: premiumActive, error: premiumError } = await actorClient
    .rpc("monetization_has_active_premium", { p_user_id: userId });
  if (premiumError) return json(503, { ok: false, reason: "premium_entitlement_check_failed" });
  if (premiumActive !== true) return json(403, { ok: false, reason: "premium_entitlement_required" });

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, reason: "invalid_json" });
  }

  const sourceType = toText(payload.source_type);
  const sourceId = toText(payload.source_id);
  if (sourceType !== "creator_video") return json(400, { ok: false, reason: "unsupported_source_type" });
  if (!sourceId || !isUuid(sourceId)) return json(400, { ok: false, reason: "invalid_source_id" });

  const { data: sourceAccess, error: sourceAccessError } = await actorClient.rpc(
    "resolve_creator_content_access",
    {
      p_content_id: sourceId,
      p_content_type: sourceType,
    },
  );
  if (sourceAccessError) return json(503, { ok: false, reason: "source_access_check_failed" });
  if (!creatorContentResolutionAllowed(sourceAccess)) {
    return json(403, { ok: false, reason: "source_access_required" });
  }

  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "premium-media-playback-token" } },
  });
  // The commerce resolver intentionally lets an exact owner/operator inspect
  // classification state. That authority cannot override malware quarantine
  // or moderation for playback. Read only parent safety/binding fields before
  // any service-role rendition path is selected.
  const parentRead = await readCreatorVideoParent(adminClient, sourceId);
  if (parentRead.error) return parentRead.error;
  const parent = parentRead.row;
  if (!creatorVideoParentResolutionAllowed({
    sourceAccessResolution: sourceAccess,
    requestedSourceId: sourceId,
    parent,
  })) {
    return json(403, { ok: false, reason: "source_parent_not_safe" });
  }

  const crossOwnerStaffAccess = isCrossOwnerCreatorContentStaffAccess({
    sourceAccessResolution: sourceAccess,
    viewerUserId: userId,
    parentOwnerId: toText(parent.owner_id),
  });
  if (
    crossOwnerStaffAccess
    && !(await hasScopedCrossOwnerPlaybackAuthority(actorClient))
  ) {
    return json(403, { ok: false, reason: "scoped_staff_permission_required" });
  }
  if (crossOwnerStaffAccess) {
    const { error: auditError } = await adminClient.from("platform_admin_audit_logs").insert({
      action: "premium_creator_video_playback_token",
      action_category: "content",
      actor_email: toText(authData?.user?.email).toLowerCase() || null,
      actor_role: "owner_or_operator",
      actor_user_id: userId,
      metadata: {
        source_type: sourceType,
        rendition_label: toLowerText(payload.rendition_label) || null,
        protected_source_metadata_disclosed: false,
      },
      reason: "Cross-owner staff Premium playback access.",
      severity: "notice",
      target_id: sourceId,
      target_type: "creator_video",
      target_user_id: toText(parent.owner_id),
    });
    if (auditError) return json(503, { ok: false, reason: "staff_access_audit_failed" });
  }

  const renditionRead = await readPremiumRendition(adminClient, payload, parent);
  if (renditionRead.error) return renditionRead.error;
  const row = renditionRead.row;

  // Do not sign from a stale first read. Refund/revocation, account restriction,
  // moderation, or Premium expiry may commit while the rendition is resolved.
  const [latestPremium, latestSourceAccess, latestParentRead] = await Promise.all([
    actorClient.rpc("monetization_has_active_premium", { p_user_id: userId }),
    actorClient.rpc("resolve_creator_content_access", {
      p_content_id: sourceId,
      p_content_type: sourceType,
    }),
    readCreatorVideoParent(adminClient, sourceId),
  ]);
  if (latestPremium.error || latestSourceAccess.error || latestParentRead.error) {
    return json(503, { ok: false, reason: "authority_recheck_failed" });
  }
  const latestParent = latestParentRead.row;
  const latestCrossOwnerStaffAccess = isCrossOwnerCreatorContentStaffAccess({
    sourceAccessResolution: latestSourceAccess.data,
    viewerUserId: userId,
    parentOwnerId: toText(latestParent.owner_id),
  });
  if (
    latestPremium.data !== true
    || !creatorVideoParentResolutionAllowed({
      sourceAccessResolution: latestSourceAccess.data,
      requestedSourceId: sourceId,
      parent: latestParent,
    })
    || toText(latestParent.owner_id) !== toText(parent.owner_id)
    || latestCrossOwnerStaffAccess !== crossOwnerStaffAccess
    || (
      latestCrossOwnerStaffAccess
      && !(await hasScopedCrossOwnerPlaybackAuthority(actorClient))
    )
  ) {
    return json(403, { ok: false, reason: "authority_changed_before_signing" });
  }

  // Re-read the selected immutable identity after every authority check. A
  // worker or moderator may revoke readiness, scan/moderation safety, binding,
  // or the protected path while the earlier row is in memory. Signing derives
  // only from this fresh exact-id snapshot.
  const latestRenditionRead = await rereadExactPremiumRendition(
    adminClient,
    toText(row.id),
    payload,
    latestParent,
  );
  if (latestRenditionRead.error) return latestRenditionRead.error;
  const latestRow = latestRenditionRead.row;
  const path = normalizePath(latestRow.protected_playback_path || latestRow.manifest_path);

  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  const expiresInSeconds = normalizeTtlSeconds(env.PREMIUM_CDN_TOKEN_TTL_SECONDS);
  const claims = {
    tokenType: "premium_cdn_playback",
    version: 1,
    premiumEntitlement: true,
    userId,
    sourceType: toText(latestRow.source_type),
    sourceId: toText(latestRow.source_id),
    renditionLabel: toLowerText(latestRow.rendition_label) as PremiumRenditionLabel,
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
