import { createClient } from "npm:@supabase/supabase-js@2";
import {
  captureSecurityRequestContext,
  securityContextAuditMetadata,
  type SecurityRequestContextResult,
} from "../_shared/security-request-context.ts";
import { resolveCreatorVideoObjectAuthority } from "../_shared/creator-video-object-authority.ts";
import {
  readExactCurrentSessionAuthority,
  readExactPermissionKeys,
  readExactPlatformRole,
} from "../_shared/exact-subject-authority.ts";
import {
  canDeliverExternalMediaObject,
  canIssueCreatorVideoDownload,
  canIssueSocialAttachmentDownload,
  creatorContentResolutionAllowed,
  visibilityResolutionAllowed,
} from "../_shared/media-download-authority.ts";
import {
  buildCanonicalSignedHeaders,
  buildRequiredUploadHeaders,
  CREATOR_VIDEO_UPLOAD_EXPIRES_SECONDS,
  matchesUploadReservation,
  normalizeMediaContentType,
  PRIVATE_MEDIA_DOWNLOAD_EXPIRES_SECONDS,
  readObservedMediaObject,
  SOCIAL_ATTACHMENT_UPLOAD_EXPIRES_SECONDS,
} from "../_shared/media-upload-integrity.ts";

type MediaStorageAction = "create_upload_url" | "verify_upload" | "create_download_url" | "delete_object";
type MediaStorageSurfaceType = "creator_video" | "social_attachment";
type MediaOriginStorageProvider = "s3" | "cloudflare_r2";

type MediaStoragePayload = {
  action?: unknown;
  surfaceType?: unknown;
  objectKey?: unknown;
  bucket?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  recordId?: unknown;
};

type SupabaseClient = any;
type AuthenticatedMediaUser = { id: string; email: string };

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const CREATOR_VIDEO_MAX_BYTES = 5 * 1024 * 1024 * 1024;
const SOCIAL_ATTACHMENT_MAX_BYTES = 250 * 1024 * 1024;
const PUBLIC_SCAN_STATUSES = new Set(["clean"]);

const CREATOR_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const SOCIAL_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);

const textEncoder = new TextEncoder();

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: JSON_HEADERS, status });

const toText = (value: unknown) => String(value ?? "").trim();

const readRequiredEnv = (name: string) => {
  const value = toText(Deno.env.get(name));
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

const readOptionalEnv = (name: string) => toText(Deno.env.get(name));

const readMediaOriginStorageConfig = () => {
  const mediaOriginProvider = readOptionalEnv("MEDIA_ORIGIN_PROVIDER").toLowerCase();

  if (mediaOriginProvider === "cloudflare_r2") {
    const privateOnly = readOptionalEnv("MEDIA_ORIGIN_PRIVATE_ONLY").toLowerCase();
    const publicPlaybackDisabled = readOptionalEnv("MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED").toLowerCase();
    if (privateOnly !== "true" || publicPlaybackDisabled !== "true") {
      throw new Error("Cloudflare R2 media origin must be configured private-only with public playback disabled.");
    }
    return {
      provider: "cloudflare_r2" as const,
      bucket: readRequiredEnv("MEDIA_ORIGIN_BUCKET"),
      endpoint: readRequiredEnv("MEDIA_ORIGIN_R2_ENDPOINT"),
      region: readOptionalEnv("MEDIA_ORIGIN_R2_REGION") || "auto",
      accessKeyId: readRequiredEnv("MEDIA_ORIGIN_R2_ACCESS_KEY_ID"),
      secretAccessKey: readRequiredEnv("MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY"),
    };
  }

  const s3Provider = readRequiredEnv("S3_PROVIDER");
  if (s3Provider.toLowerCase() !== "hetzner") {
    throw new Error("Media storage provider is not configured for launch.");
  }
  return {
    provider: "s3" as const,
    bucket: readRequiredEnv("S3_BUCKET"),
    endpoint: readRequiredEnv("S3_ENDPOINT"),
    region: readRequiredEnv("S3_REGION"),
    accessKeyId: readRequiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: readRequiredEnv("S3_SECRET_ACCESS_KEY"),
  };
};

const isSupportedObjectProvider = (value: unknown) => {
  const provider = toText(value).toLowerCase();
  return provider === "s3" || provider === "cloudflare_r2";
};

const normalizeAction = (value: unknown): MediaStorageAction | null => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "create_upload_url"
    || normalized === "verify_upload"
    || normalized === "create_download_url"
    || normalized === "delete_object"
  ) {
    return normalized;
  }
  return null;
};

const normalizeSurfaceType = (value: unknown): MediaStorageSurfaceType | null => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "creator_video" || normalized === "social_attachment") return normalized;
  return null;
};

const parseSizeBytes = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

const isSafeObjectKey = (value: string) => (
  !!value
  && value.length <= 1024
  && !value.startsWith("/")
  && !value.includes("..")
  && !/[\u0000-\u001F\u007F]/u.test(value)
);

const objectKeyOwner = (objectKey: string) => objectKey.split("/")[0] ?? "";
const isPublicScanSafe = (value: unknown) => PUBLIC_SCAN_STATUSES.has(toText(value));

const encodeS3Path = (objectKey: string) => objectKey
  .split("/")
  .map((part) => encodeURIComponent(part))
  .join("/");

const awsEncode = (value: string) => encodeURIComponent(value)
  .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

const bytesToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");

const hmac = async (key: ArrayBuffer | Uint8Array, data: string) => {
  const keyData = key instanceof ArrayBuffer ? key : new Uint8Array(key).buffer as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
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
  const amzDate = iso;
  const dateStamp = amzDate.slice(0, 8);
  return { amzDate, dateStamp };
};

const getSigningKey = async (secretAccessKey: string, dateStamp: string, region: string) => {
  const dateKey = await hmac(textEncoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
};

const createS3ObjectUrl = (endpoint: string, bucket: string, objectKey: string) => {
  const endpointUrl = new URL(endpoint);
  const host = `${bucket}.${endpointUrl.host}`;
  const protocol = endpointUrl.protocol || "https:";
  return {
    canonicalUri: `/${encodeS3Path(objectKey)}`,
    host,
    protocol,
  };
};

const createPresignedS3Url = async (input: {
  method: "DELETE" | "GET" | "HEAD" | "PUT";
  endpoint: string;
  region: string;
  bucket: string;
  objectKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  requiredHeaders?: Record<string, string>;
}) => {
  const { amzDate, dateStamp } = formatAmzDates();
  const { canonicalUri, host, protocol } = createS3ObjectUrl(input.endpoint, input.bucket, input.objectKey);
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const { canonicalHeaders, signedHeaders } = buildCanonicalSignedHeaders(
    host,
    input.requiredHeaders ?? {},
  );
  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.entries(queryParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");
  const signingKey = await getSigningKey(input.secretAccessKey, dateStamp, input.region);
  const signature = bytesToHex(await hmac(signingKey, stringToSign));
  return `${protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
};

const authenticateRequest = async (req: Request, supabaseUrl: string, supabaseAnonKey: string) => {
  const authorization = toText(req.headers.get("Authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: json(401, { error: "missing_auth", message: "Sign in before using media storage." }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await authClient.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId || !(await readExactCurrentSessionAuthority(authClient, userId))) {
    return { error: json(401, { error: "invalid_auth", message: "Sign in before using media storage." }) };
  }

  return {
    actorClient: authClient,
    user: {
      id: userId,
      email: toText(data.user?.email).toLowerCase(),
    },
  };
};

const userHasPlatformRole = async (
  adminClient: SupabaseClient,
  user: { id: string; email: string },
  roles: string[],
) => {
  return !!(await readExactPlatformRole(adminClient, user.id, roles));
};

const isPlatformOwnerUser = async (
  adminClient: SupabaseClient,
  userId: string,
) => {
  const normalizedUserId = toText(userId);
  if (!normalizedUserId) return false;
  return (await readExactPlatformRole(adminClient, normalizedUserId, ["owner"])) === "owner";
};

const userHasScopedStaffPermission = async (
  adminClient: SupabaseClient,
  user: { id: string; email: string },
  permissionKeys: string[],
) => {
  if (await userHasPlatformRole(adminClient, user, ["owner"])) return true;
  if (!(await userHasPlatformRole(adminClient, user, ["operator", "moderator"]))) return false;

  const normalizedKeys = Array.from(new Set(permissionKeys.map((key) => toText(key).toLowerCase()).filter(Boolean)));
  if (!normalizedKeys.length) return false;
  return (await readExactPermissionKeys(adminClient, user.id, normalizedKeys)).size > 0;
};

const ownerMediaBlockedForStaff = async (
  adminClient: SupabaseClient,
  user: { id: string; email: string },
  ownerId: string,
) => {
  const normalizedOwnerId = toText(ownerId);
  if (!normalizedOwnerId || normalizedOwnerId === user.id) return false;
  if (await userHasPlatformRole(adminClient, user, ["owner"])) return false;
  return isPlatformOwnerUser(adminClient, normalizedOwnerId);
};

const writePrivateMediaAccessAudit = async (
  adminClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  input: {
    action: "media_download_url" | "media_delete";
    objectKey: string;
    ownerId: string | null;
    recordId: string;
    securityContext?: SecurityRequestContextResult | null;
    surfaceType: MediaStorageSurfaceType;
  },
) => {
  const securityMetadata = securityContextAuditMetadata(input.securityContext ?? null);
  const { error } = await adminClient.from("platform_admin_audit_logs").insert({
    action: input.action,
    action_category: "content",
    actor_email: user.email || null,
    actor_role: await userHasPlatformRole(adminClient, user, ["owner"]) ? "owner" : "staff",
    actor_user_id: user.id,
    metadata: {
      object_key_owner: objectKeyOwner(input.objectKey),
      surface_type: input.surfaceType,
      ...securityMetadata,
    },
    reason: "Scoped staff media access through media-storage.",
    severity: input.action === "media_delete" ? "warning" : "notice",
    target_id: input.recordId || input.objectKey,
    target_type: input.surfaceType,
    target_user_id: input.ownerId,
    security_context_id: input.securityContext?.id ?? null,
  });
  if (error) throw new Error(`Private media audit write failed: ${error.message}`);

  const mediaEventError = await adminClient.from("media_security_audit_events").insert({
    action: input.action === "media_delete" ? "private_media_delete" : "private_media_download_url",
    actor_email: user.email || null,
    actor_user_id: user.id,
    metadata: securityMetadata,
    object_key_owner: objectKeyOwner(input.objectKey),
    reason: "Scoped staff media access through media-storage.",
    record_id: input.recordId || null,
    result: "success",
    security_context_id: input.securityContext?.id ?? null,
    surface_type: input.surfaceType,
  });
  if (mediaEventError.error) throw new Error(`Private media security event write failed: ${mediaEventError.error.message}`);
};

const writeMediaSecurityEvent = async (
  adminClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  input: {
    action: MediaStorageAction;
    objectKey: string;
    recordId?: string | null;
    result?: "success" | "denied" | "blocked" | "error";
    securityContext?: SecurityRequestContextResult | null;
    surfaceType: MediaStorageSurfaceType;
  },
) => {
  const securityMetadata = securityContextAuditMetadata(input.securityContext ?? null);
  const { error } = await adminClient.from("media_security_audit_events").insert({
    action: input.action,
    actor_email: user.email || null,
    actor_user_id: user.id,
    metadata: securityMetadata,
    object_key_owner: objectKeyOwner(input.objectKey),
    record_id: input.recordId ?? null,
    result: input.result ?? "success",
    security_context_id: input.securityContext?.id ?? null,
    surface_type: input.surfaceType,
  });
  if (error) throw new Error(`Media security event write failed: ${error.message}`);
};

const safeWriteMediaSecurityEvent = async (
  adminClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  input: Parameters<typeof writeMediaSecurityEvent>[2],
) => {
  try {
    await writeMediaSecurityEvent(adminClient, user, input);
  } catch (error) {
    console.warn("media-storage security event skipped", error instanceof Error ? error.message : "unknown_error");
  }
};

const enforceMediaStorageAbuseLimit = async (
  adminClient: SupabaseClient,
  input: {
    user: AuthenticatedMediaUser;
    surfaceType: MediaStorageSurfaceType;
    action: MediaStorageAction;
    recordId: string;
  },
) => {
  if (input.action !== "create_upload_url") return;
  const limit = input.surfaceType === "creator_video" ? 8 : 20;
  const windowSeconds = input.surfaceType === "creator_video" ? 3600 : 600;
  const targetKey = input.surfaceType === "creator_video"
    ? "creator_video"
    : `social_attachment:${input.recordId || "new"}`;
  const { error } = await adminClient.rpc("enforce_abuse_rate_limit", {
    p_actor_user_id: input.user.id,
    p_action_key: "media_upload_url",
    p_target_key: targetKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
    p_metadata: {
      source: "media-storage",
      surface_type: input.surfaceType,
    },
  });

  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("rate_limited")) {
      return {
        error: json(429, {
          error: "rate_limited",
          message: "Media upload is busy right now. Please try again in a moment.",
        }),
      };
    }
    throw new Error(`Media upload rate-limit check failed: ${error.message}`);
  }
};

const isAccountAccessRestricted = async (
  adminClient: SupabaseClient,
  userId: string,
) => {
  const { data, error } = await adminClient.rpc("is_account_access_restricted", {
    p_user_id: userId,
  });
  if (error) throw new Error(`Account status check failed: ${error.message}`);
  return data === true;
};

const validateUpload = (input: {
  surfaceType: MediaStorageSurfaceType;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  userId: string;
}) => {
  if (!isSafeObjectKey(input.objectKey)) {
    return { error: json(400, { error: "invalid_object_key", message: "Media object key is invalid." }) };
  }

  if (objectKeyOwner(input.objectKey) !== input.userId) {
    return { error: json(403, { error: "invalid_owner_prefix", message: "Media object key must belong to the signed-in user." }) };
  }

  if (input.sizeBytes <= 0) {
    return { error: json(400, { error: "empty_file", message: "This media file is empty." }) };
  }

  const maxBytes = input.surfaceType === "creator_video" ? CREATOR_VIDEO_MAX_BYTES : SOCIAL_ATTACHMENT_MAX_BYTES;
  if (input.sizeBytes > maxBytes) {
    return { error: json(413, { error: "file_too_large", message: "This media file is too large for this surface." }) };
  }

  const normalizedMimeType = input.mimeType.toLowerCase();
  const allowed = input.surfaceType === "creator_video"
    ? CREATOR_VIDEO_MIME_TYPES.has(normalizedMimeType)
    : SOCIAL_ATTACHMENT_MIME_TYPES.has(normalizedMimeType);
  if (!allowed) {
    return { error: json(415, { error: "unsupported_media_type", message: "This media type is not supported here." }) };
  }

  return { ok: true };
};

const userHasActivePremiumEntitlement = async (
  adminClient: SupabaseClient,
  userId: string,
) => {
  const { data, error } = await adminClient
    .from("user_entitlements")
    .select("entitlement_key,status,expires_at,revoked_at")
    .eq("user_id", userId)
    .eq("entitlement_key", "premium")
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  const status = toText(data.status);
  const expiresAt = toText(data.expires_at);
  const revokedAt = toText(data.revoked_at);
  const isActiveStatus = status === "active" || status === "trialing" || status === "grace_period";
  const isExpired = expiresAt ? Date.parse(expiresAt) <= Date.now() : false;
  return isActiveStatus && !revokedAt && !isExpired;
};

const userCanUsePremiumCreatorTools = async (
  adminClient: SupabaseClient,
  user: AuthenticatedMediaUser,
) => {
  if (await userHasActivePremiumEntitlement(adminClient, user.id)) return true;
  return userHasPlatformRole(adminClient, user, ["owner", "operator"]);
};

const hasExactCleanMediaScan = async (
  adminClient: SupabaseClient,
  input: {
    bucket: string;
    objectKey: string;
    targetColumn: "rendition" | "source" | "thumbnail";
    targetId: string;
    targetTable: "video_renditions" | "videos";
  },
) => {
  const { data, error } = await adminClient
    .from("media_scan_jobs")
    .select("id")
    .eq("target_table", input.targetTable)
    .eq("target_column", input.targetColumn)
    .eq("target_id", input.targetId)
    .eq("storage_bucket", input.bucket)
    .eq("storage_object_key", input.objectKey)
    .eq("status", "clean")
    .limit(1)
    .maybeSingle();
  return !error && !!data?.id;
};

const resolveCreatorVideoVisibilityAllowed = async (
  adminClient: SupabaseClient,
  videoId: string,
  ownerUserId: string,
  viewerUserId: string,
) => {
  const { data, error } = await adminClient.rpc(
    "resolve_creator_video_visibility_access",
    {
      p_video_id: videoId,
      p_viewer_user_id: viewerUserId,
    },
  );
  return !error && visibilityResolutionAllowed(data, { ownerUserId, viewerUserId });
};

const resolveCreatorContentAccessAllowed = async (
  actorClient: SupabaseClient,
  videoId: string,
) => {
  const { data, error } = await actorClient.rpc("resolve_creator_content_access", {
    p_content_id: videoId,
    p_content_type: "creator_video",
  });
  return !error && creatorContentResolutionAllowed(data);
};

const resolveProfileVisibilityAllowed = async (
  actorClient: SupabaseClient,
  profileOwnerId: string,
  viewerUserId: string,
) => {
  const { data, error } = await actorClient.rpc("resolve_profile_visibility_access", {
    profile_owner_id: profileOwnerId,
    viewer_id: viewerUserId,
  });
  return !error && visibilityResolutionAllowed(data, {
    ownerUserId: profileOwnerId,
    viewerUserId,
  });
};

const readCreatorVideoForObject = async (
  adminClient: SupabaseClient,
  recordId: string,
  provider: MediaOriginStorageProvider,
  bucket: string,
  objectKey: string,
  requireActiveObjectProvenance = true,
) => {
  if (!recordId) return null;
  const { data } = await adminClient
    .from("videos")
    .select("id,owner_id,visibility,moderation_status,scan_status,storage_provider,storage_bucket,storage_object_key,storage_path,thumb_storage_path")
    .eq("id", recordId)
    .maybeSingle();
  if (!data || toText(data.storage_provider) !== provider) return null;

  const authorityInput = {
    ownerId: toText(data.owner_id),
    storageProvider: toText(data.storage_provider),
    storageBucket: toText(data.storage_bucket),
    storageObjectKey: toText(data.storage_object_key),
    storagePath: toText(data.storage_path),
    thumbnailStoragePath: toText(data.thumb_storage_path),
    requestedBucket: bucket,
    requestedObjectKey: objectKey,
  };

  let objectKind = requireActiveObjectProvenance
    ? resolveCreatorVideoObjectAuthority(authorityInput)
    : objectKey === (toText(data.storage_object_key) || toText(data.storage_path))
    ? "source" as const
    : objectKey === toText(data.thumb_storage_path)
    ? "thumbnail" as const
    : null;
  if (!objectKind) {
    const { data: legacyAuditVerified, error: legacyAuditError } = await adminClient.rpc(
      "has_verified_legacy_video_object_provenance",
      {
        p_video_id: recordId,
        p_provider: toText(data.storage_provider),
        p_bucket: bucket,
        p_object_key: objectKey,
      },
    );
    if (legacyAuditError || legacyAuditVerified !== true) return null;
    objectKind = resolveCreatorVideoObjectAuthority({
      ...authorityInput,
      legacyMigrationAuditVerified: true,
    });
  }
  if (!objectKind) return null;

  return {
    ...data,
    object_kind: objectKind,
  } as {
    id: string;
    owner_id: string;
    visibility: string;
    moderation_status: string;
    scan_status: string;
    storage_bucket: string;
    storage_object_key: string | null;
    storage_path: string | null;
    object_kind: "source" | "thumbnail";
  };
};

const readCreatorVideoRenditionForObject = async (
  adminClient: SupabaseClient,
  recordId: string,
  provider: MediaOriginStorageProvider,
  bucket: string,
  objectKey: string,
) => {
  if (!recordId) return null;
  const { data: storagePathRendition } = await adminClient
    .from("video_renditions")
    .select("id,video_id,owner_id,quality_label,status,access_tier,scan_status,storage_bucket,storage_path,manifest_path")
    .eq("video_id", recordId)
    .eq("storage_bucket", bucket)
    .eq("storage_path", objectKey)
    .limit(1)
    .maybeSingle();
  let rendition = storagePathRendition;
  if (!rendition) {
    const { data: manifestPathRendition } = await adminClient
      .from("video_renditions")
      .select("id,video_id,owner_id,quality_label,status,access_tier,scan_status,storage_bucket,storage_path,manifest_path")
      .eq("video_id", recordId)
      .eq("storage_bucket", bucket)
      .eq("manifest_path", objectKey)
      .limit(1)
      .maybeSingle();
    rendition = manifestPathRendition;
  }
  if (!rendition) return null;

  const { data: video } = await adminClient
    .from("videos")
    .select("id,owner_id,visibility,moderation_status,scan_status,storage_provider,storage_bucket,storage_object_key,storage_path")
    .eq("id", recordId)
    .maybeSingle();
  if (!video || toText(video.storage_provider) !== provider) return null;

  return {
    id: toText(rendition.id),
    videoId: toText(rendition.video_id),
    ownerId: toText(rendition.owner_id || video.owner_id),
    qualityLabel: toText(rendition.quality_label),
    status: toText(rendition.status),
    accessTier: toText(rendition.access_tier),
    scanStatus: toText(rendition.scan_status),
    visibility: toText(video.visibility),
    moderationStatus: toText(video.moderation_status),
    videoScanStatus: toText(video.scan_status),
    sourceStorageBucket: toText(video.storage_bucket),
    sourceStorageObjectKey: toText(video.storage_object_key) || toText(video.storage_path),
  };
};

const hasExactDeleteObjectProvenance = async (
  adminClient: SupabaseClient,
  input: {
    ownerUserId: string;
    surfaceType: MediaStorageSurfaceType;
    provider: MediaOriginStorageProvider;
    bucket: string;
    objectKey: string;
    recordId: string;
    legacyTableName: "videos" | "social_attachments";
  },
) => {
  if (objectKeyOwner(input.objectKey) === input.ownerUserId) return true;
  const [{ data: exactLegacy, error: legacyError }, { data: tombstone, error: tombstoneError }] = await Promise.all([
    adminClient.rpc("has_verified_legacy_media_object_provenance", {
      p_table_name: input.legacyTableName,
      p_row_id: input.recordId,
      p_provider: input.provider,
      p_bucket: input.bucket,
      p_object_key: input.objectKey,
    }),
    adminClient
      .from("media_upload_reservations")
      .select("id")
      .eq("owner_user_id", input.ownerUserId)
      .eq("surface_type", input.surfaceType)
      .eq("storage_provider", input.provider)
      .eq("storage_bucket", input.bucket)
      .eq("storage_object_key", input.objectKey)
      .eq("attached_record_id", input.recordId)
      .eq("status", "deleted")
      .not("deleted_at", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);
  if (tombstoneError) return false;
  return (!legacyError && exactLegacy === true) || !!tombstone?.id;
};

const hasExactAttachedUploadAuthorityForDelete = async (
  adminClient: SupabaseClient,
  input: {
    ownerUserId: string;
    surfaceType: MediaStorageSurfaceType;
    provider: MediaOriginStorageProvider;
    bucket: string;
    objectKey: string;
    recordId: string;
  },
) => {
  if (!input.recordId) return false;
  const { data, error } = await adminClient
    .from("media_upload_reservations")
    .select("id,status,verified_at,attached_at,deleted_at")
    .eq("owner_user_id", input.ownerUserId)
    .eq("surface_type", input.surfaceType)
    .eq("storage_provider", input.provider)
    .eq("storage_bucket", input.bucket)
    .eq("storage_object_key", input.objectKey)
    .eq("attached_record_id", input.recordId)
    .in("status", ["verified", "deleted"])
    .limit(1)
    .maybeSingle();
  if (error || !data?.id || !data.attached_at) return false;
  return data.status === "verified"
    ? !!data.verified_at
    : data.status === "deleted" && !!data.deleted_at;
};

const userHasActiveEntitlement = async (
  adminClient: SupabaseClient,
  userId: string,
  entitlementKeys: string[],
) => {
  const { data } = await adminClient
    .from("user_entitlements")
    .select("user_id")
    .eq("user_id", userId)
    .in("entitlement_key", entitlementKeys)
    .in("status", ["active", "trialing", "grace_period"])
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1)
    .maybeSingle();
  return !!data?.user_id;
};

const canReadCreatorVideoRendition = async (
  adminClient: SupabaseClient,
  actorClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  recordId: string,
  provider: MediaOriginStorageProvider,
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const rendition = await readCreatorVideoRenditionForObject(adminClient, recordId, provider, bucket, objectKey);
  if (!rendition) return null;
  if (rendition.status !== "ready") return false;
  if (rendition.ownerId === user.id) return true;
  if (await ownerMediaBlockedForStaff(adminClient, user, rendition.ownerId)) return false;
  if (rendition.qualityLabel === "original") {
    if (await userHasScopedStaffPermission(adminClient, user, ["content_moderation", "reports_review"])) {
      await writePrivateMediaAccessAudit(adminClient, user, {
        action: "media_download_url",
        objectKey,
        ownerId: rendition.ownerId,
        recordId,
        securityContext,
        surfaceType: "creator_video",
      });
      return true;
    }
    return false;
  }
  const [visibilityAllowed, contentAccessAllowed, exactSourceScanClean, exactRenditionScanClean] = await Promise.all([
    resolveCreatorVideoVisibilityAllowed(adminClient, rendition.videoId, rendition.ownerId, user.id),
    resolveCreatorContentAccessAllowed(actorClient, rendition.videoId),
    hasExactCleanMediaScan(adminClient, {
      bucket: rendition.sourceStorageBucket,
      objectKey: rendition.sourceStorageObjectKey,
      targetColumn: "source",
      targetId: rendition.videoId,
      targetTable: "videos",
    }),
    hasExactCleanMediaScan(adminClient, {
      bucket,
      objectKey,
      targetColumn: "rendition",
      targetId: rendition.id,
      targetTable: "video_renditions",
    }),
  ]);
  const renditionTierAllowed = rendition.accessTier === "free"
    || (
      rendition.accessTier === "premium"
      && (
        await userHasPlatformRole(adminClient, user, ["owner"])
        || await userHasActiveEntitlement(adminClient, user.id, ["premium"])
      )
    );
  return canIssueCreatorVideoDownload({
    contentAccessAllowed,
    exactObjectScanClean: exactRenditionScanClean && isPublicScanSafe(rendition.scanStatus),
    exactSourceScanClean: exactSourceScanClean && isPublicScanSafe(rendition.videoScanStatus),
    objectKind: "rendition",
    renditionTierAllowed,
    visibilityAllowed,
  });
};

const canReadCreatorVideo = async (
  adminClient: SupabaseClient,
  actorClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  recordId: string,
  provider: MediaOriginStorageProvider,
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const renditionAllowed = await canReadCreatorVideoRendition(adminClient, actorClient, user, recordId, provider, bucket, objectKey, securityContext);
  if (renditionAllowed !== null) return renditionAllowed;

  const video = await readCreatorVideoForObject(adminClient, recordId, provider, bucket, objectKey);
  if (!video) return false;
  if (toText(video.owner_id) === user.id) return true;
  if (await ownerMediaBlockedForStaff(adminClient, user, toText(video.owner_id))) return false;
  const sourceObjectKey = toText(video.storage_object_key) || toText(video.storage_path);
  const [visibilityAllowed, exactSourceScanClean, exactObjectScanClean, contentAccessAllowed] = await Promise.all([
    resolveCreatorVideoVisibilityAllowed(adminClient, recordId, toText(video.owner_id), user.id),
    hasExactCleanMediaScan(adminClient, {
      bucket: toText(video.storage_bucket),
      objectKey: sourceObjectKey,
      targetColumn: "source",
      targetId: recordId,
      targetTable: "videos",
    }),
    video.object_kind === "source"
      ? hasExactCleanMediaScan(adminClient, {
        bucket,
        objectKey,
        targetColumn: "source",
        targetId: recordId,
        targetTable: "videos",
      })
      : hasExactCleanMediaScan(adminClient, {
        bucket,
        objectKey,
        targetColumn: "thumbnail",
        targetId: recordId,
        targetTable: "videos",
      }),
    video.object_kind === "thumbnail"
      ? Promise.resolve(false)
      : resolveCreatorContentAccessAllowed(actorClient, recordId),
  ]);
  if (canIssueCreatorVideoDownload({
    contentAccessAllowed,
    exactObjectScanClean,
    exactSourceScanClean: exactSourceScanClean && isPublicScanSafe(video.scan_status),
    objectKind: video.object_kind,
    visibilityAllowed,
  })) {
    return true;
  }
  if (await userHasScopedStaffPermission(adminClient, user, ["content_moderation", "reports_review"])) {
    await writePrivateMediaAccessAudit(adminClient, user, {
      action: "media_download_url",
      objectKey,
      ownerId: toText(video.owner_id),
      recordId,
      securityContext,
      surfaceType: "creator_video",
    });
    return true;
  }
  return false;
};

const canDeleteCreatorVideo = async (
  adminClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  recordId: string,
  provider: MediaOriginStorageProvider,
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const video = await readCreatorVideoForObject(adminClient, recordId, provider, bucket, objectKey, false);
  if (!video) {
    if (!recordId) return objectKeyOwner(objectKey) === user.id;
    return hasExactAttachedUploadAuthorityForDelete(adminClient, {
      ownerUserId: user.id,
      surfaceType: "creator_video",
      provider,
      bucket,
      objectKey,
      recordId,
    });
  }
  const ownerUserId = toText(video.owner_id);
  if (!await hasExactDeleteObjectProvenance(adminClient, {
    ownerUserId,
    surfaceType: "creator_video",
    provider,
    bucket,
    objectKey,
    recordId: toText(video.id),
    legacyTableName: "videos",
  })) return false;
  if (ownerUserId === user.id) return true;
  if (await ownerMediaBlockedForStaff(adminClient, user, ownerUserId)) return false;
  if (await userHasScopedStaffPermission(adminClient, user, ["content_moderation", "emergency_break_glass"])) {
    await writePrivateMediaAccessAudit(adminClient, user, {
      action: "media_delete",
      objectKey,
      ownerId: ownerUserId,
      recordId,
      securityContext,
      surfaceType: "creator_video",
    });
    return true;
  }
  return false;
};

const readSocialAttachmentForObject = async (
  adminClient: SupabaseClient,
  recordId: string,
  provider: MediaOriginStorageProvider,
  bucket: string,
  objectKey: string,
) => {
  if (!recordId) return null;
  const { data } = await adminClient
    .from("social_attachments")
    .select("id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,storage_object_key,storage_path,moderation_status,scan_status,deleted_at")
    .eq("id", recordId)
    .maybeSingle();
  if (!data) return null;

  const rowBucket = toText(data.storage_bucket);
  const rowKey = toText(data.storage_object_key) || toText(data.storage_path);
  if (
    !isSupportedObjectProvider(data.storage_provider)
    || toText(data.storage_provider) !== provider
    || rowBucket !== bucket
    || rowKey !== objectKey
  ) return null;
  if (data.deleted_at || !["clean", "reported"].includes(toText(data.moderation_status))) return null;
  return data as {
    id: string;
    owner_user_id: string;
    surface_type: string;
    surface_id: string;
    scan_status: string;
  };
};

const canReadSocialAttachmentSurface = async (
  adminClient: SupabaseClient,
  actorClient: SupabaseClient,
  user: { id: string; email: string },
  attachment: { surface_type: string; surface_id: string },
) => {
  const surfaceType = toText(attachment.surface_type);
  const surfaceId = toText(attachment.surface_id);

  if (surfaceType === "profile_post") {
    const { data } = await adminClient
      .from("profile_posts")
      .select("id,user_id")
      .eq("id", surfaceId)
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"])
      .is("deleted_at", null)
      .maybeSingle();
    const profileOwnerId = toText(data?.user_id);
    return !!data?.id
      && !!profileOwnerId
      && await resolveProfileVisibilityAllowed(actorClient, profileOwnerId, user.id);
  }

  if (surfaceType === "profile_post_comment") {
    const { data } = await adminClient
      .from("profile_post_comments")
      .select("id,post_id")
      .eq("id", surfaceId)
      .in("moderation_status", ["clean", "reported"])
      .is("deleted_at", null)
      .maybeSingle();
    const postId = toText(data?.post_id);
    if (!postId) return false;
    const post = await adminClient
      .from("profile_posts")
      .select("id,user_id")
      .eq("id", postId)
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"])
      .is("deleted_at", null)
      .maybeSingle();
    const profileOwnerId = toText(post.data?.user_id);
    return !!post.data?.id
      && !!profileOwnerId
      && await resolveProfileVisibilityAllowed(actorClient, profileOwnerId, user.id);
  }

  if (surfaceType === "creator_video_comment") {
    const { data } = await adminClient
      .from("creator_video_comments")
      .select("id,video_id")
      .eq("id", surfaceId)
      .in("moderation_status", ["clean", "reported"])
      .is("deleted_at", null)
      .maybeSingle();
    const videoId = toText(data?.video_id);
    if (!videoId) return false;
    const video = await adminClient
      .from("videos")
      .select("id,owner_id,scan_status")
      .eq("id", videoId)
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"])
      .maybeSingle();
    if (!video.data?.id || !isPublicScanSafe(video.data.scan_status)) return false;
    const [visibilityAllowed, contentAccessAllowed] = await Promise.all([
      resolveCreatorVideoVisibilityAllowed(adminClient, videoId, toText(video.data.owner_id), user.id),
      resolveCreatorContentAccessAllowed(actorClient, videoId),
    ]);
    return visibilityAllowed && contentAccessAllowed;
  }

  if (surfaceType === "chat_message") {
    const { data } = await adminClient
      .from("chat_messages")
      .select("id,thread_id")
      .eq("id", surfaceId)
      .maybeSingle();
    const threadId = toText(data?.thread_id);
    if (!threadId) return false;
    const { data: allowed, error } = await actorClient.rpc("can_access_chat_thread", {
      target_thread_id: threadId,
    });
    return !error && allowed === true;
  }

  if (surfaceType === "watch_party_room_message") {
    const { data: message, error: messageError } = await adminClient
      .from("watch_party_room_messages")
      .select("id,party_id")
      .eq("id", surfaceId)
      .maybeSingle();
    const partyId = toText(message?.party_id).toUpperCase();
    if (messageError || !message?.id || !partyId) return false;
    const { data: allowed, error } = await actorClient.rpc(
      "can_read_watch_party_room_authority",
      { p_party_id: partyId },
    );
    return !error && allowed === true;
  }

  return false;
};

const canReadSocialAttachment = async (
  adminClient: SupabaseClient,
  actorClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  recordId: string,
  provider: MediaOriginStorageProvider,
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const attachment = await readSocialAttachmentForObject(adminClient, recordId, provider, bucket, objectKey);
  if (!attachment) return false;
  if (toText(attachment.owner_user_id) === user.id) {
    // Object ownership is not parent-surface authority. A commenter/sender can
    // later be blocked, removed from a thread/room, or lose paid-video access;
    // every attached object therefore rechecks the exact current parent gate.
    return canReadSocialAttachmentSurface(adminClient, actorClient, user, attachment);
  }
  const exactAttachmentScanClean = isPublicScanSafe(attachment.scan_status);
  if (!exactAttachmentScanClean) {
    if (await userHasScopedStaffPermission(adminClient, user, ["content_moderation", "reports_review"])) {
      await writePrivateMediaAccessAudit(adminClient, user, {
        action: "media_download_url",
        objectKey,
        ownerId: toText(attachment.owner_user_id),
        recordId,
        securityContext,
        surfaceType: "social_attachment",
      });
      return true;
    }
    return false;
  }
  if (canIssueSocialAttachmentDownload({
    exactAttachmentScanClean,
    surfaceAuthorityAllowed: await canReadSocialAttachmentSurface(adminClient, actorClient, user, attachment),
  })) return true;
  if (await ownerMediaBlockedForStaff(adminClient, user, toText(attachment.owner_user_id))) return false;
  if (await userHasScopedStaffPermission(adminClient, user, ["content_moderation", "reports_review"])) {
    await writePrivateMediaAccessAudit(adminClient, user, {
      action: "media_download_url",
      objectKey,
      ownerId: toText(attachment.owner_user_id),
      recordId,
      securityContext,
      surfaceType: "social_attachment",
    });
    return true;
  }
  return false;
};

const canDeleteSocialAttachment = async (
  adminClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  recordId: string,
  provider: MediaOriginStorageProvider,
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const attachment = await readSocialAttachmentForObject(adminClient, recordId, provider, bucket, objectKey);
  if (!attachment) {
    if (!recordId) return objectKeyOwner(objectKey) === user.id;
    return hasExactAttachedUploadAuthorityForDelete(adminClient, {
      ownerUserId: user.id,
      surfaceType: "social_attachment",
      provider,
      bucket,
      objectKey,
      recordId,
    });
  }
  const ownerUserId = toText(attachment.owner_user_id);
  if (!await hasExactDeleteObjectProvenance(adminClient, {
    ownerUserId,
    surfaceType: "social_attachment",
    provider,
    bucket,
    objectKey,
    recordId: toText(attachment.id),
    legacyTableName: "social_attachments",
  })) return false;
  if (ownerUserId === user.id) return true;
  if (await ownerMediaBlockedForStaff(adminClient, user, ownerUserId)) return false;
  if (await userHasScopedStaffPermission(adminClient, user, ["content_moderation", "emergency_break_glass"])) {
    await writePrivateMediaAccessAudit(adminClient, user, {
      action: "media_delete",
      objectKey,
      ownerId: ownerUserId,
      recordId,
      securityContext,
      surfaceType: "social_attachment",
    });
    return true;
  }
  return false;
};

type MediaUploadReservationRow = {
  id: string;
  owner_user_id: string;
  surface_type: MediaStorageSurfaceType;
  storage_provider: MediaOriginStorageProvider;
  storage_bucket: string;
  storage_object_key: string;
  expected_mime_type: string;
  expected_size_bytes: number;
  status: "reserved" | "verified" | "quarantined" | "deleted";
  expires_at: string;
  observed_mime_type?: string | null;
  observed_size_bytes?: number | null;
  verified_at?: string | null;
  attached_record_id?: string | null;
  attached_at?: string | null;
  deleted_at?: string | null;
};

const exactStorageTupleAlreadyExists = async (
  adminClient: SupabaseClient,
  input: {
    surfaceType: MediaStorageSurfaceType;
    provider: MediaOriginStorageProvider;
    bucket: string;
    objectKey: string;
  },
) => {
  const table = input.surfaceType === "creator_video" ? "videos" : "social_attachments";
  const keyColumns = input.surfaceType === "creator_video"
    ? ["storage_object_key", "storage_path", "thumb_storage_path"]
    : ["storage_object_key", "storage_path"];
  for (const column of keyColumns) {
    const { data, error } = await adminClient
      .from(table)
      .select("id")
      .eq("storage_provider", input.provider)
      .eq("storage_bucket", input.bucket)
      .eq(column, input.objectKey)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Existing media tuple check failed: ${error.message}`);
    if (data?.id) return true;
  }
  return false;
};

const readExactUploadReservation = async (
  adminClient: SupabaseClient,
  input: {
    userId: string;
    surfaceType: MediaStorageSurfaceType;
    provider: MediaOriginStorageProvider;
    bucket: string;
    objectKey: string;
  },
) => {
  const { data, error } = await adminClient
    .from("media_upload_reservations")
    .select("id,owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,observed_mime_type,observed_size_bytes,verified_at,attached_record_id,attached_at,deleted_at")
    .eq("owner_user_id", input.userId)
    .eq("surface_type", input.surfaceType)
    .eq("storage_provider", input.provider)
    .eq("storage_bucket", input.bucket)
    .eq("storage_object_key", input.objectKey)
    .maybeSingle();
  if (error) throw new Error(`Media upload reservation lookup failed: ${error.message}`);
  return data as MediaUploadReservationRow | null;
};

type GatewayMediaObjectBinding = {
  legacyRowId: string;
  legacyTableName: "videos" | "video_renditions" | "social_attachments";
  ownerUserId: string;
  recordId: string;
};

const resolveGatewayMediaObjectBinding = async (
  adminClient: SupabaseClient,
  input: {
    surfaceType: MediaStorageSurfaceType;
    provider: MediaOriginStorageProvider;
    bucket: string;
    objectKey: string;
    recordId: string;
    includeRevokedLegacy?: boolean;
  },
): Promise<GatewayMediaObjectBinding | null> => {
  if (!input.recordId) return null;
  if (input.surfaceType === "creator_video") {
    const video = await readCreatorVideoForObject(
      adminClient,
      input.recordId,
      input.provider,
      input.bucket,
      input.objectKey,
      !input.includeRevokedLegacy,
    );
    if (video) {
      return {
        legacyRowId: toText(video.id),
        legacyTableName: "videos",
        ownerUserId: toText(video.owner_id),
        recordId: toText(video.id),
      };
    }
    const rendition = await readCreatorVideoRenditionForObject(
      adminClient,
      input.recordId,
      input.provider,
      input.bucket,
      input.objectKey,
    );
    if (!rendition) return null;
    return {
      legacyRowId: rendition.id,
      legacyTableName: "video_renditions",
      ownerUserId: rendition.ownerId,
      recordId: rendition.id,
    };
  }

  const attachment = await readSocialAttachmentForObject(
    adminClient,
    input.recordId,
    input.provider,
    input.bucket,
    input.objectKey,
  );
  if (!attachment) return null;
  return {
    legacyRowId: toText(attachment.id),
    legacyTableName: "social_attachments",
    ownerUserId: toText(attachment.owner_user_id),
    recordId: toText(attachment.id),
  };
};

const hasExactAuditedLegacyProvenance = async (
  adminClient: SupabaseClient,
  input: GatewayMediaObjectBinding & {
    provider: MediaOriginStorageProvider;
    bucket: string;
    objectKey: string;
  },
) => {
  const { data, error } = await adminClient.rpc(
    "has_verified_legacy_media_object_provenance",
    {
      p_table_name: input.legacyTableName,
      p_row_id: input.legacyRowId,
      p_provider: input.provider,
      p_bucket: input.bucket,
      p_object_key: input.objectKey,
    },
  );
  return !error && data === true;
};

const canDeliverGatewayMediaObject = async (
  adminClient: SupabaseClient,
  input: GatewayMediaObjectBinding & {
    surfaceType: MediaStorageSurfaceType;
    provider: MediaOriginStorageProvider;
    bucket: string;
    objectKey: string;
  },
) => {
  const [reservation, exactAuditedLegacyProvenance] = await Promise.all([
    readExactUploadReservation(adminClient, {
      userId: input.ownerUserId,
      surfaceType: input.surfaceType,
      provider: input.provider,
      bucket: input.bucket,
      objectKey: input.objectKey,
    }),
    hasExactAuditedLegacyProvenance(adminClient, input),
  ]);
  return canDeliverExternalMediaObject({
    exactAuditedLegacyProvenance,
    reservationAttachedAt: reservation?.attached_at,
    reservationAttachedRecordId: reservation?.attached_record_id,
    reservationStatus: reservation?.status,
    reservationVerifiedAt: reservation?.verified_at,
    requestedRecordId: input.recordId,
  });
};

const revokeGatewayMediaObjectBeforeDelete = async (
  adminClient: SupabaseClient,
  input: {
    binding: GatewayMediaObjectBinding | null;
    fallbackOwnerUserId: string;
    fallbackRecordId: string | null;
    surfaceType: MediaStorageSurfaceType;
    provider: MediaOriginStorageProvider;
    bucket: string;
    objectKey: string;
  },
) => {
  const { data, error } = await adminClient.rpc(
    "revoke_media_object_delivery",
    {
      p_surface_type: input.surfaceType,
      p_storage_provider: input.provider,
      p_storage_bucket: input.bucket,
      p_storage_object_key: input.objectKey,
      p_owner_user_id: input.binding?.ownerUserId ?? input.fallbackOwnerUserId,
      p_record_id: input.binding?.recordId ?? input.fallbackRecordId,
      p_legacy_table_name: input.binding?.legacyTableName ?? null,
      p_legacy_row_id: input.binding?.legacyRowId ?? null,
    },
  );
  return !error
    && !!data
    && typeof data === "object"
    && !Array.isArray(data)
    && (data as Record<string, unknown>).revoked === true;
};

const deleteReservedOriginObject = async (
  originStorage: ReturnType<typeof readMediaOriginStorageConfig>,
  objectKey: string,
) => {
  const deleteUrl = await createPresignedS3Url({
    method: "DELETE",
    endpoint: originStorage.endpoint,
    region: originStorage.region,
    bucket: originStorage.bucket,
    objectKey,
    accessKeyId: originStorage.accessKeyId,
    secretAccessKey: originStorage.secretAccessKey,
    expiresSeconds: 60,
  });
  const response = await fetch(deleteUrl, { method: "DELETE" });
  return response.ok || response.status === 404;
};

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST for media storage requests." });
  }

  try {
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const originStorage = readMediaOriginStorageConfig();

    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error ?? json(401, { error: "invalid_auth" });
    const actorClient = authResult.actorClient;
    const user = authResult.user;
    const payload = await req.json().catch(() => null) as MediaStoragePayload | null;
    if (!payload || typeof payload !== "object") {
      return json(400, { error: "invalid_body", message: "Request body must be a JSON object." });
    }

    const action = normalizeAction(payload.action);
    const surfaceType = normalizeSurfaceType(payload.surfaceType);
    const objectKey = toText(payload.objectKey);
    const bucket = toText(payload.bucket) || originStorage.bucket;
    const recordId = toText(payload.recordId);

    if (!action) return json(400, { error: "invalid_action", message: "Unknown media storage action." });
    if (!surfaceType) return json(400, { error: "invalid_surface", message: "Unknown media storage surface." });
    if (!isSafeObjectKey(objectKey)) return json(400, { error: "invalid_object_key", message: "Media object key is invalid." });
    if (bucket !== originStorage.bucket) return json(403, { error: "invalid_bucket", message: "Media bucket is not allowed." });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const securityContext = await captureSecurityRequestContext(adminClient, req, {
      source: "media-storage",
      userId: user.id,
    });

    if (await isAccountAccessRestricted(adminClient, user.id)) {
      await safeWriteMediaSecurityEvent(adminClient, user, {
        action,
        objectKey,
        recordId,
        result: "denied",
        securityContext,
        surfaceType,
      });
      return json(403, {
        error: "account_access_restricted",
        message: "This account cannot use private media features right now. Visit Support if you think this is a mistake.",
      });
    }

    if (action === "create_upload_url") {
      const mimeType = normalizeMediaContentType(payload.mimeType) || "application/octet-stream";
      const sizeBytes = parseSizeBytes(payload.sizeBytes);
      if (surfaceType === "creator_video" && !(await userCanUsePremiumCreatorTools(adminClient, user))) {
        return json(403, {
          error: "premium_required",
          message: "Premium required. Creator video uploads require active Premium entitlement or owner/operator setup access.",
        });
      }
      const uploadValidation = validateUpload({
        surfaceType,
        objectKey,
        mimeType,
        sizeBytes,
        userId: user.id,
      });
      if ("error" in uploadValidation) return uploadValidation.error ?? json(400, { error: "invalid_upload" });

      const abuseLimit = await enforceMediaStorageAbuseLimit(adminClient, {
        action,
        recordId,
        surfaceType,
        user,
      });
      if (abuseLimit && "error" in abuseLimit) return abuseLimit.error;

      if (await exactStorageTupleAlreadyExists(adminClient, {
        surfaceType,
        provider: originStorage.provider,
        bucket: originStorage.bucket,
        objectKey,
      })) {
        return json(409, {
          error: "media_object_already_registered",
          message: "This media object key is already registered and cannot be reused.",
        });
      }

      const expiresSeconds = surfaceType === "creator_video"
        ? CREATOR_VIDEO_UPLOAD_EXPIRES_SECONDS
        : SOCIAL_ATTACHMENT_UPLOAD_EXPIRES_SECONDS;
      const expiresAt = new Date(Date.now() + expiresSeconds * 1000).toISOString();
      const requiredUploadHeaders = buildRequiredUploadHeaders(mimeType, sizeBytes);
      const uploadUrl = await createPresignedS3Url({
        method: "PUT",
        endpoint: originStorage.endpoint,
        region: originStorage.region,
        bucket: originStorage.bucket,
        objectKey,
        accessKeyId: originStorage.accessKeyId,
        secretAccessKey: originStorage.secretAccessKey,
        expiresSeconds,
        requiredHeaders: requiredUploadHeaders,
      });
      const { error: reservationError } = await adminClient
        .from("media_upload_reservations")
        .insert({
          owner_user_id: user.id,
          surface_type: surfaceType,
          storage_provider: originStorage.provider,
          storage_bucket: originStorage.bucket,
          storage_object_key: objectKey,
          expected_mime_type: mimeType,
          expected_size_bytes: sizeBytes,
          status: "reserved",
          expires_at: expiresAt,
        });
      if (reservationError) {
        const duplicate = toText(reservationError.code) === "23505";
        if (duplicate) {
          return json(409, {
            error: "media_object_key_reserved",
            message: "This media object key has already been reserved and cannot be reused.",
          });
        }
        throw new Error(`Media upload reservation failed: ${reservationError.message}`);
      }
      await safeWriteMediaSecurityEvent(adminClient, user, {
        action,
        objectKey,
        recordId,
        securityContext,
        surfaceType,
      });

      return json(200, {
        provider: originStorage.provider,
        bucket: originStorage.bucket,
        objectKey,
        uploadUrl,
        uploadHeaders: {
          "Content-Length": requiredUploadHeaders["content-length"],
          "Content-Type": requiredUploadHeaders["content-type"],
          "If-None-Match": requiredUploadHeaders["if-none-match"],
        },
        expiresAt,
        reservationExpiresAt: expiresAt,
      });
    }

    if (action === "verify_upload") {
      const reservation = await readExactUploadReservation(adminClient, {
        userId: user.id,
        surfaceType,
        provider: originStorage.provider,
        bucket: originStorage.bucket,
        objectKey,
      });
      if (!reservation || reservation.status === "deleted" || reservation.status === "quarantined") {
        return json(409, {
          error: "upload_reservation_required",
          message: "This upload does not have an active exact reservation.",
        });
      }
      if (reservation.status === "verified" && reservation.verified_at) {
        return json(200, {
          verified: true,
          provider: originStorage.provider,
          bucket: originStorage.bucket,
          objectKey,
          observedMimeType: toText(reservation.observed_mime_type),
          observedSizeBytes: Number(reservation.observed_size_bytes ?? 0),
          verifiedAt: reservation.verified_at,
        });
      }

      if (Date.parse(reservation.expires_at) <= Date.now()) {
        const deleted = await deleteReservedOriginObject(originStorage, objectKey).catch(() => false);
        await adminClient.from("media_upload_reservations").update({
          status: "quarantined",
          updated_at: new Date().toISOString(),
        }).eq("owner_user_id", user.id)
          .eq("storage_provider", originStorage.provider)
          .eq("storage_bucket", originStorage.bucket)
          .eq("storage_object_key", objectKey)
          .eq("status", "reserved");
        return json(409, {
          error: "upload_reservation_expired",
          message: deleted
            ? "The upload reservation expired and its object was removed."
            : "The upload reservation expired and its object is quarantined.",
        });
      }

      const headUrl = await createPresignedS3Url({
        method: "HEAD",
        endpoint: originStorage.endpoint,
        region: originStorage.region,
        bucket: originStorage.bucket,
        objectKey,
        accessKeyId: originStorage.accessKeyId,
        secretAccessKey: originStorage.secretAccessKey,
        expiresSeconds: 60,
      });
      const headResponse = await fetch(headUrl, { method: "HEAD" });
      if (headResponse.status === 404) {
        return json(409, {
          error: "upload_not_observed",
          message: "The uploaded object is not visible to the storage provider yet.",
        });
      }
      if (!headResponse.ok) {
        return json(502, {
          error: "upload_verification_unavailable",
          message: "The storage provider could not verify this upload.",
        });
      }

      const observed = readObservedMediaObject(headResponse.headers);
      const exact = matchesUploadReservation({
        mimeType: reservation.expected_mime_type,
        sizeBytes: Number(reservation.expected_size_bytes),
      }, observed);
      const observedMimeType = observed?.mimeType ?? null;
      const observedSizeBytes = observed?.sizeBytes ?? null;
      if (!exact) {
        const deleted = await deleteReservedOriginObject(originStorage, objectKey).catch(() => false);
        await adminClient.from("media_upload_reservations").update({
          status: "quarantined",
          observed_mime_type: observedMimeType,
          observed_size_bytes: observedSizeBytes,
          updated_at: new Date().toISOString(),
        }).eq("owner_user_id", user.id)
          .eq("storage_provider", originStorage.provider)
          .eq("storage_bucket", originStorage.bucket)
          .eq("storage_object_key", objectKey)
          .eq("status", "reserved");
        await safeWriteMediaSecurityEvent(adminClient, user, {
          action,
          objectKey,
          recordId,
          result: "blocked",
          securityContext,
          surfaceType,
        });
        return json(409, {
          error: "upload_integrity_mismatch",
          message: deleted
            ? "The uploaded object did not match its reservation and was removed."
            : "The uploaded object did not match its reservation and is quarantined.",
        });
      }

      const verifiedAt = new Date().toISOString();
      const { data: verifiedReservation, error: verifyError } = await adminClient
        .from("media_upload_reservations")
        .update({
          status: "verified",
          observed_mime_type: observedMimeType,
          observed_size_bytes: observedSizeBytes,
          verified_at: verifiedAt,
          updated_at: verifiedAt,
        })
        .eq("owner_user_id", user.id)
        .eq("surface_type", surfaceType)
        .eq("storage_provider", originStorage.provider)
        .eq("storage_bucket", originStorage.bucket)
        .eq("storage_object_key", objectKey)
        .eq("status", "reserved")
        .select("verified_at")
        .maybeSingle();
      if (verifyError || !verifiedReservation?.verified_at) {
        throw new Error(`Media upload verification state failed: ${verifyError?.message ?? "reservation_changed"}`);
      }
      await safeWriteMediaSecurityEvent(adminClient, user, {
        action,
        objectKey,
        recordId,
        securityContext,
        surfaceType,
      });
      return json(200, {
        verified: true,
        provider: originStorage.provider,
        bucket: originStorage.bucket,
        objectKey,
        observedMimeType,
        observedSizeBytes,
        verifiedAt: verifiedReservation.verified_at,
      });
    }

    if (action === "create_download_url") {
      let allowed = false;
      if (surfaceType === "creator_video") {
        allowed = await canReadCreatorVideo(
          adminClient,
          actorClient,
          user,
          recordId,
          originStorage.provider,
          originStorage.bucket,
          objectKey,
          securityContext,
        );
      } else {
        allowed = await canReadSocialAttachment(
          adminClient,
          actorClient,
          user,
          recordId,
          originStorage.provider,
          originStorage.bucket,
          objectKey,
          securityContext,
        );
      }

      if (!allowed) return json(403, { error: "not_allowed", message: "You cannot access this media object." });
      const binding = await resolveGatewayMediaObjectBinding(adminClient, {
        surfaceType,
        provider: originStorage.provider,
        bucket: originStorage.bucket,
        objectKey,
        recordId,
      });
      if (!binding || !await canDeliverGatewayMediaObject(adminClient, {
        ...binding,
        surfaceType,
        provider: originStorage.provider,
        bucket: originStorage.bucket,
        objectKey,
      })) {
        return json(403, {
          error: "media_delivery_provenance_required",
          message: "This media object does not have current immutable delivery provenance.",
        });
      }

      const downloadUrl = await createPresignedS3Url({
        method: "GET",
        endpoint: originStorage.endpoint,
        region: originStorage.region,
        bucket: originStorage.bucket,
        objectKey,
        accessKeyId: originStorage.accessKeyId,
        secretAccessKey: originStorage.secretAccessKey,
        expiresSeconds: PRIVATE_MEDIA_DOWNLOAD_EXPIRES_SECONDS,
      });
      await safeWriteMediaSecurityEvent(adminClient, user, {
        action,
        objectKey,
        recordId,
        securityContext,
        surfaceType,
      });

      return json(200, {
        downloadUrl,
        expiresAt: new Date(Date.now() + PRIVATE_MEDIA_DOWNLOAD_EXPIRES_SECONDS * 1000).toISOString(),
      });
    }

    const allowed = surfaceType === "creator_video"
      ? await canDeleteCreatorVideo(
        adminClient,
        user,
        recordId,
        originStorage.provider,
        originStorage.bucket,
        objectKey,
        securityContext,
      )
      : await canDeleteSocialAttachment(
        adminClient,
        user,
        recordId,
        originStorage.provider,
        originStorage.bucket,
        objectKey,
        securityContext,
      );
    if (!allowed) return json(403, { error: "not_allowed", message: "You cannot delete this media object." });

    const binding = recordId
      ? await resolveGatewayMediaObjectBinding(adminClient, {
        surfaceType,
        provider: originStorage.provider,
        bucket: originStorage.bucket,
        objectKey,
        recordId,
        includeRevokedLegacy: true,
      })
      : null;
    if (!await revokeGatewayMediaObjectBeforeDelete(adminClient, {
      binding,
      fallbackOwnerUserId: user.id,
      fallbackRecordId: recordId || null,
      surfaceType,
      provider: originStorage.provider,
      bucket: originStorage.bucket,
      objectKey,
    })) {
      return json(409, {
        error: "media_delivery_revocation_required",
        message: "Media delivery authority could not be revoked before deletion.",
      });
    }

    if (!(await deleteReservedOriginObject(originStorage, objectKey))) {
      return json(502, { error: "delete_failed", message: "Unable to delete this media object right now." });
    }
    await safeWriteMediaSecurityEvent(adminClient, user, {
      action,
      objectKey,
      recordId,
      securityContext,
      surfaceType,
    });

    return json(200, { ok: true });
  } catch (error) {
    console.error("media-storage failure", error);
    return json(500, {
      error: "media_storage_failed",
      message: "Media storage is not available right now.",
    });
  }
});
