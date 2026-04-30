import { createClient } from "npm:@supabase/supabase-js@2";

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

type SupabaseClient = ReturnType<typeof createClient>;

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

const CREATOR_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
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

const encodeS3Path = (objectKey: string) => objectKey
  .split("/")
  .map((part) => encodeURIComponent(part))
  .join("/");

const awsEncode = (value: string) => encodeURIComponent(value)
  .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

const bytesToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");

const hmac = async (key: ArrayBuffer | Uint8Array, data: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
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

const readCreatorVideoForObject = async (
  adminClient: SupabaseClient,
  recordId: string,
  bucket: string,
  objectKey: string,
) => {
  if (!recordId) return null;
  const { data } = await adminClient
    .from("videos")
    .select("id,owner_id,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path")
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
  };
};

const canReadCreatorVideo = async (
  adminClient: SupabaseClient,
  user: { id: string; email: string },
  recordId: string,
  bucket: string,
  objectKey: string,
) => {
  const video = await readCreatorVideoForObject(adminClient, recordId, bucket, objectKey);
  if (!video) return false;
  if (toText(video.owner_id) === user.id) return true;
  if (
    toText(video.visibility) === "public"
    && ["clean", "reported"].includes(toText(video.moderation_status))
  ) {
    return true;
  }
  return userHasPlatformRole(adminClient, user, ["operator", "moderator"]);
};

const canDeleteCreatorVideo = async (
  adminClient: SupabaseClient,
  user: { id: string; email: string },
  recordId: string,
  bucket: string,
  objectKey: string,
) => {
  const video = await readCreatorVideoForObject(adminClient, recordId, bucket, objectKey);
  if (!video) return objectKeyOwner(objectKey) === user.id;
  if (toText(video.owner_id) === user.id) return true;
  return userHasPlatformRole(adminClient, user, ["operator"]);
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
    .select("id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,storage_object_key,storage_path,moderation_status,deleted_at")
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
      .select("id")
      .eq("id", videoId)
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"])
      .maybeSingle();
    return !!video.data?.id;
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
  user: { id: string; email: string },
  recordId: string,
  bucket: string,
  objectKey: string,
) => {
  const attachment = await readSocialAttachmentForObject(adminClient, recordId, bucket, objectKey);
  if (!attachment) return false;
  if (toText(attachment.owner_user_id) === user.id) return true;
  if (await userHasPlatformRole(adminClient, user, ["operator", "moderator"])) return true;
  return canReadSocialAttachmentSurface(adminClient, user, attachment);
};

const canDeleteSocialAttachment = async (
  adminClient: SupabaseClient,
  user: { id: string; email: string },
  recordId: string,
  bucket: string,
  objectKey: string,
) => {
  const attachment = await readSocialAttachmentForObject(adminClient, recordId, bucket, objectKey);
  if (!attachment) return objectKeyOwner(objectKey) === user.id;
  if (toText(attachment.owner_user_id) === user.id) return true;
  return userHasPlatformRole(adminClient, user, ["operator"]);
};

Deno.serve(async (req) => {
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
    if ("error" in authResult) return authResult.error;
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

    if (action === "create_upload_url") {
      const mimeType = toText(payload.mimeType).toLowerCase() || "application/octet-stream";
      const sizeBytes = parseSizeBytes(payload.sizeBytes);
      const uploadValidation = validateUpload({
        surfaceType,
        objectKey,
        mimeType,
        sizeBytes,
        userId: user.id,
      });
      if ("error" in uploadValidation) return uploadValidation.error;

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
        allowed = await canReadCreatorVideo(adminClient, user, recordId, s3Bucket, objectKey);
      } else {
        allowed = await canReadSocialAttachment(adminClient, user, recordId, s3Bucket, objectKey);
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

      return json(200, {
        downloadUrl,
        expiresAt: new Date(Date.now() + DOWNLOAD_EXPIRES_SECONDS * 1000).toISOString(),
      });
    }

    const allowed = surfaceType === "creator_video"
      ? await canDeleteCreatorVideo(adminClient, user, recordId, s3Bucket, objectKey)
      : await canDeleteSocialAttachment(adminClient, user, recordId, s3Bucket, objectKey);
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

    return json(200, { ok: true });
  } catch (error) {
    console.error("media-storage failure", error);
    return json(500, {
      error: "media_storage_failed",
      message: "Media storage is not available right now.",
    });
  }
});
