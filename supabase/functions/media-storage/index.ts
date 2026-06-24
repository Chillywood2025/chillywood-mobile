import { createClient } from "npm:@supabase/supabase-js@2";
import {
  captureSecurityRequestContext,
  securityContextAuditMetadata,
  type SecurityRequestContextResult,
} from "../_shared/security-request-context.ts";

type MediaStorageAction = "create_upload_url" | "create_download_url" | "delete_object";
type MediaStorageSurfaceType = "creator_video" | "social_attachment";

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
const CREATOR_VIDEO_UPLOAD_EXPIRES_SECONDS = 2 * 60 * 60;
const SOCIAL_ATTACHMENT_UPLOAD_EXPIRES_SECONDS = 30 * 60;
const DOWNLOAD_EXPIRES_SECONDS = 60 * 60;
const PUBLIC_SCAN_STATUSES = new Set(["clean", "manual_review"]);

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

const normalizeAction = (value: unknown): MediaStorageAction | null => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "create_upload_url"
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
  method: "DELETE" | "GET" | "PUT";
  endpoint: string;
  region: string;
  bucket: string;
  objectKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
}) => {
  const { amzDate, dateStamp } = formatAmzDates();
  const { canonicalUri, host, protocol } = createS3ObjectUrl(input.endpoint, input.bucket, input.objectKey);
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
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "host",
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
  if (error || !userId) {
    return { error: json(401, { error: "invalid_auth", message: "Sign in before using media storage." }) };
  }

  return {
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
  const userQuery = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .in("role", roles)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (userQuery.data?.id) return true;
  if (!user.email) return false;

  const emailQuery = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .in("role", roles)
    .ilike("email", user.email)
    .limit(1)
    .maybeSingle();

  return !!emailQuery.data?.id;
};

const isPlatformOwnerUser = async (
  adminClient: SupabaseClient,
  userId: string,
) => {
  const normalizedUserId = toText(userId);
  if (!normalizedUserId) return false;

  const userRoleQuery = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .eq("role", "owner")
    .eq("user_id", normalizedUserId)
    .limit(1)
    .maybeSingle();
  if (userRoleQuery.data?.id) return true;

  const { data: authUser } = await adminClient.auth.admin.getUserById(normalizedUserId).catch(() => ({ data: null }));
  const ownerEmail = toText(authUser?.user?.email).toLowerCase();
  if (!ownerEmail) return false;

  const emailRoleQuery = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .eq("role", "owner")
    .ilike("email", ownerEmail)
    .limit(1)
    .maybeSingle();
  return !!emailRoleQuery.data?.id;
};

const userHasScopedStaffPermission = async (
  adminClient: SupabaseClient,
  user: { id: string; email: string },
  permissionKeys: string[],
) => {
  if (await userHasPlatformRole(adminClient, user, ["owner"])) return true;
  if (!(await userHasPlatformRole(adminClient, user, ["operator", "moderator"]))) return false;

  const normalizedEmail = toText(user.email).toLowerCase();
  const normalizedKeys = Array.from(new Set(permissionKeys.map((key) => toText(key).toLowerCase()).filter(Boolean)));
  if (!normalizedKeys.length) return false;

  let query = adminClient
    .from("platform_staff_permission_grants")
    .select("id,expires_at")
    .eq("status", "active")
    .in("permission_key", normalizedKeys);

  if (normalizedEmail) {
    query = query.or(`target_user_id.eq.${user.id},target_email.ilike.${normalizedEmail}`);
  } else {
    query = query.eq("target_user_id", user.id);
  }

  const { data, error } = await query.limit(20);
  if (error) throw new Error(`Scoped staff permission lookup failed: ${error.message}`);

  const now = Date.now();
  return (data ?? []).some((row: any) => {
    const expiresAt = toText(row.expires_at);
    return !expiresAt || Date.parse(expiresAt) > now;
  });
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

const readCreatorVideoForObject = async (
  adminClient: SupabaseClient,
  recordId: string,
  bucket: string,
  objectKey: string,
) => {
  if (!recordId) return null;
  const { data } = await adminClient
    .from("videos")
    .select("id,owner_id,visibility,moderation_status,scan_status,storage_provider,storage_bucket,storage_object_key,storage_path")
    .eq("id", recordId)
    .maybeSingle();
  if (!data) return null;

  const rowBucket = toText(data.storage_bucket);
  const rowKey = toText(data.storage_object_key) || toText(data.storage_path);
  if (toText(data.storage_provider) !== "s3" || rowBucket !== bucket || rowKey !== objectKey) return null;
  return data as {
    id: string;
    owner_id: string;
    visibility: string;
    moderation_status: string;
    scan_status: string;
  };
};

const readCreatorVideoRenditionForObject = async (
  adminClient: SupabaseClient,
  recordId: string,
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
    .select("id,owner_id,visibility,moderation_status,scan_status")
    .eq("id", recordId)
    .maybeSingle();
  if (!video) return null;

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
  };
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
  user: AuthenticatedMediaUser,
  recordId: string,
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const rendition = await readCreatorVideoRenditionForObject(adminClient, recordId, bucket, objectKey);
  if (!rendition) return null;
  if (rendition.status !== "ready") return false;
  if (rendition.ownerId === user.id) return true;
  if (await ownerMediaBlockedForStaff(adminClient, user, rendition.ownerId)) return false;
  const publicSafe = rendition.visibility === "public"
    && ["clean", "reported"].includes(rendition.moderationStatus)
    && isPublicScanSafe(rendition.videoScanStatus)
    && isPublicScanSafe(rendition.scanStatus);
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
  if (!publicSafe) return false;
  if (rendition.accessTier === "free") return true;
  if (rendition.accessTier === "premium") {
    if (await userHasPlatformRole(adminClient, user, ["owner"])) return true;
    return userHasActiveEntitlement(adminClient, user.id, ["premium"]);
  }
  return false;
};

const canReadCreatorVideo = async (
  adminClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  recordId: string,
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const renditionAllowed = await canReadCreatorVideoRendition(adminClient, user, recordId, bucket, objectKey, securityContext);
  if (renditionAllowed !== null) return renditionAllowed;

  const video = await readCreatorVideoForObject(adminClient, recordId, bucket, objectKey);
  if (!video) return false;
  if (toText(video.owner_id) === user.id) return true;
  if (await ownerMediaBlockedForStaff(adminClient, user, toText(video.owner_id))) return false;
  if (
    toText(video.visibility) === "public"
    && ["clean", "reported"].includes(toText(video.moderation_status))
    && isPublicScanSafe(video.scan_status)
  ) {
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
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const video = await readCreatorVideoForObject(adminClient, recordId, bucket, objectKey);
  if (!video) return objectKeyOwner(objectKey) === user.id;
  if (toText(video.owner_id) === user.id) return true;
  if (await ownerMediaBlockedForStaff(adminClient, user, toText(video.owner_id))) return false;
  if (await userHasScopedStaffPermission(adminClient, user, ["content_moderation", "emergency_break_glass"])) {
    await writePrivateMediaAccessAudit(adminClient, user, {
      action: "media_delete",
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

const readSocialAttachmentForObject = async (
  adminClient: SupabaseClient,
  recordId: string,
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
  if (toText(data.storage_provider) !== "s3" || rowBucket !== bucket || rowKey !== objectKey) return null;
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
  user: { id: string; email: string },
  attachment: { surface_type: string; surface_id: string },
) => {
  const surfaceType = toText(attachment.surface_type);
  const surfaceId = toText(attachment.surface_id);

  if (surfaceType === "profile_post") {
    const { data } = await adminClient
      .from("profile_posts")
      .select("id")
      .eq("id", surfaceId)
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"])
      .is("deleted_at", null)
      .maybeSingle();
    return !!data?.id;
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
      .select("id")
      .eq("id", postId)
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"])
      .is("deleted_at", null)
      .maybeSingle();
    return !!post.data?.id;
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
      .select("id,scan_status")
      .eq("id", videoId)
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"])
      .maybeSingle();
    return !!video.data?.id && isPublicScanSafe(video.data.scan_status);
  }

  if (surfaceType === "chat_message") {
    const { data } = await adminClient
      .from("chat_messages")
      .select("id,thread_id")
      .eq("id", surfaceId)
      .maybeSingle();
    const threadId = toText(data?.thread_id);
    if (!threadId) return false;
    const member = await adminClient
      .from("chat_thread_members")
      .select("thread_id")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();
    return !!member.data?.thread_id;
  }

  if (surfaceType === "watch_party_room_message") {
    const { data } = await adminClient
      .from("watch_party_room_messages")
      .select("id")
      .eq("id", surfaceId)
      .maybeSingle();
    return !!data?.id;
  }

  return false;
};

const canReadSocialAttachment = async (
  adminClient: SupabaseClient,
  user: AuthenticatedMediaUser,
  recordId: string,
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const attachment = await readSocialAttachmentForObject(adminClient, recordId, bucket, objectKey);
  if (!attachment) return false;
  if (toText(attachment.owner_user_id) === user.id) return true;
  if (!isPublicScanSafe(attachment.scan_status)) {
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
  if (await canReadSocialAttachmentSurface(adminClient, user, attachment)) return true;
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
  bucket: string,
  objectKey: string,
  securityContext?: SecurityRequestContextResult | null,
) => {
  const attachment = await readSocialAttachmentForObject(adminClient, recordId, bucket, objectKey);
  if (!attachment) return objectKeyOwner(objectKey) === user.id;
  if (toText(attachment.owner_user_id) === user.id) return true;
  if (await ownerMediaBlockedForStaff(adminClient, user, toText(attachment.owner_user_id))) return false;
  if (await userHasScopedStaffPermission(adminClient, user, ["content_moderation", "emergency_break_glass"])) {
    await writePrivateMediaAccessAudit(adminClient, user, {
      action: "media_delete",
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

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST for media storage requests." });
  }

  try {
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const s3Provider = readRequiredEnv("S3_PROVIDER");
    const s3Bucket = readRequiredEnv("S3_BUCKET");
    const s3Endpoint = readRequiredEnv("S3_ENDPOINT");
    const s3Region = readRequiredEnv("S3_REGION");
    const s3AccessKeyId = readRequiredEnv("S3_ACCESS_KEY_ID");
    const s3SecretAccessKey = readRequiredEnv("S3_SECRET_ACCESS_KEY");

    if (s3Provider.toLowerCase() !== "hetzner") {
      return json(500, { error: "invalid_provider", message: "Media storage provider is not configured for launch." });
    }

    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error ?? json(401, { error: "invalid_auth" });
    const user = authResult.user;
    const payload = await req.json().catch(() => null) as MediaStoragePayload | null;
    if (!payload || typeof payload !== "object") {
      return json(400, { error: "invalid_body", message: "Request body must be a JSON object." });
    }

    const action = normalizeAction(payload.action);
    const surfaceType = normalizeSurfaceType(payload.surfaceType);
    const objectKey = toText(payload.objectKey);
    const bucket = toText(payload.bucket) || s3Bucket;
    const recordId = toText(payload.recordId);

    if (!action) return json(400, { error: "invalid_action", message: "Unknown media storage action." });
    if (!surfaceType) return json(400, { error: "invalid_surface", message: "Unknown media storage surface." });
    if (!isSafeObjectKey(objectKey)) return json(400, { error: "invalid_object_key", message: "Media object key is invalid." });
    if (bucket !== s3Bucket) return json(403, { error: "invalid_bucket", message: "Media bucket is not allowed." });

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

    if (action === "create_upload_url") {
      const mimeType = toText(payload.mimeType).toLowerCase() || "application/octet-stream";
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

      const expiresSeconds = surfaceType === "creator_video"
        ? CREATOR_VIDEO_UPLOAD_EXPIRES_SECONDS
        : SOCIAL_ATTACHMENT_UPLOAD_EXPIRES_SECONDS;
      const uploadUrl = await createPresignedS3Url({
        method: "PUT",
        endpoint: s3Endpoint,
        region: s3Region,
        bucket: s3Bucket,
        objectKey,
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
        expiresSeconds,
      });
      await safeWriteMediaSecurityEvent(adminClient, user, {
        action,
        objectKey,
        recordId,
        securityContext,
        surfaceType,
      });

      return json(200, {
        provider: "s3",
        bucket: s3Bucket,
        objectKey,
        uploadUrl,
        expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
      });
    }

    if (action === "create_download_url") {
      let allowed = false;
      if (!recordId && objectKeyOwner(objectKey) === user.id) {
        allowed = true;
      } else if (surfaceType === "creator_video") {
        allowed = await canReadCreatorVideo(adminClient, user, recordId, s3Bucket, objectKey, securityContext);
      } else {
        allowed = await canReadSocialAttachment(adminClient, user, recordId, s3Bucket, objectKey, securityContext);
      }

      if (!allowed) return json(403, { error: "not_allowed", message: "You cannot access this media object." });

      const downloadUrl = await createPresignedS3Url({
        method: "GET",
        endpoint: s3Endpoint,
        region: s3Region,
        bucket: s3Bucket,
        objectKey,
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
        expiresSeconds: DOWNLOAD_EXPIRES_SECONDS,
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
        expiresAt: new Date(Date.now() + DOWNLOAD_EXPIRES_SECONDS * 1000).toISOString(),
      });
    }

    const allowed = surfaceType === "creator_video"
      ? await canDeleteCreatorVideo(adminClient, user, recordId, s3Bucket, objectKey, securityContext)
      : await canDeleteSocialAttachment(adminClient, user, recordId, s3Bucket, objectKey, securityContext);
    if (!allowed) return json(403, { error: "not_allowed", message: "You cannot delete this media object." });

    const deleteUrl = await createPresignedS3Url({
      method: "DELETE",
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      objectKey,
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
      expiresSeconds: 60,
    });
    const deleteResponse = await fetch(deleteUrl, { method: "DELETE" });
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
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
