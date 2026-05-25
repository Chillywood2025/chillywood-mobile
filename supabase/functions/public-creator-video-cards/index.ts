import { createClient } from "npm:@supabase/supabase-js@2";

type PublicCreatorVideoCardAction = "list_by_owner" | "list_for_owners" | "list_latest";

type PublicCreatorVideoCardPayload = {
  action?: unknown;
  ownerId?: unknown;
  ownerIds?: unknown;
  limit?: unknown;
};

type PublicCreatorVideoRow = {
  id: string;
  owner_id: string;
  title: string | null;
  description: string | null;
  thumb_url: string | null;
  created_at: string | null;
  visibility: string | null;
  moderation_status: string | null;
  moderation_reason: string | null;
  moderated_at: string | null;
  moderated_by: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  thumb_storage_path: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  updated_at: string | null;
};

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const CREATOR_VIDEO_BUCKET = "creator-videos";
const SIGNED_URL_SECONDS = 60 * 60;
const PUBLIC_MODERATION_STATUSES = ["clean", "reported"];
const PUBLIC_CREATOR_VIDEO_SELECT = [
  "id",
  "owner_id",
  "title",
  "description",
  "thumb_url",
  "created_at",
  "visibility",
  "moderation_status",
  "moderation_reason",
  "moderated_at",
  "moderated_by",
  "storage_provider",
  "storage_bucket",
  "thumb_storage_path",
  "mime_type",
  "file_size_bytes",
  "updated_at",
].join(",");

const textEncoder = new TextEncoder();

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: JSON_HEADERS, status });

const toText = (value: unknown) => String(value ?? "").trim();

const readRequiredEnv = (name: string) => {
  const value = toText(Deno.env.get(name));
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

const normalizeAction = (value: unknown): PublicCreatorVideoCardAction | null => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "list_by_owner" || normalized === "list_for_owners" || normalized === "list_latest") {
    return normalized;
  }
  return null;
};

const normalizeLimit = (value: unknown) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.min(50, parsed));
};

const normalizeOwnerIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(toText).filter(Boolean))).slice(0, 100);
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const isSafeVideoThumbnailPath = (row: PublicCreatorVideoRow, thumbnailPath: string) => {
  const ownerId = toText(row.owner_id);
  const videoId = toText(row.id);
  return !!ownerId && !!videoId && thumbnailPath.startsWith(`${ownerId}/${videoId}/`);
};

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
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
};

const getSigningKey = async (secretAccessKey: string, dateStamp: string, region: string) => {
  const dateKey = await hmac(textEncoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
};

const createPresignedS3GetUrl = async (input: {
  endpoint: string;
  region: string;
  bucket: string;
  objectKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  forcePathStyle?: boolean;
}) => {
  const endpointUrl = new URL(input.endpoint);
  const bucketPrefix = `${input.bucket}.`.toLowerCase();
  const endpointHost = endpointUrl.host.toLowerCase();
  const endpointHostIncludesBucket = endpointHost.startsWith(bucketPrefix);
  const host = input.forcePathStyle
    ? endpointHostIncludesBucket ? endpointUrl.host.slice(input.bucket.length + 1) : endpointUrl.host
    : endpointHostIncludesBucket ? endpointUrl.host : `${input.bucket}.${endpointUrl.host}`;
  const protocol = endpointUrl.protocol || "https:";
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
  const signature = bytesToHex(await hmac(signingKey, stringToSign));
  return `${protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
};

const isReadableImageUrl = async (url: string) => {
  try {
    const response = await fetch(url, { headers: { range: "bytes=0-64" } });
    const ok = response.ok && toText(response.headers.get("content-type")).toLowerCase().startsWith("image/");
    await response.body?.cancel().catch(() => undefined);
    return ok;
  } catch {
    return false;
  }
};

const createThumbnailUrl = async (
  adminClient: any,
  row: PublicCreatorVideoRow,
  s3Config: {
    bucket: string;
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  },
) => {
  const thumbnailPath = toText(row.thumb_storage_path);
  if (!thumbnailPath) {
    const legacyThumbUrl = toText(row.thumb_url);
    return isHttpUrl(legacyThumbUrl) ? legacyThumbUrl : "";
  }
  if (!isSafeVideoThumbnailPath(row, thumbnailPath)) return "";

  if (toText(row.storage_provider).toLowerCase() === "s3") {
    const bucket = toText(row.storage_bucket) || s3Config.bucket;
    if (bucket !== s3Config.bucket) return "";
    for (const forcePathStyle of [false, true]) {
      const signedUrl = await createPresignedS3GetUrl({
        endpoint: s3Config.endpoint,
        region: s3Config.region,
        bucket,
        objectKey: thumbnailPath,
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
        expiresSeconds: SIGNED_URL_SECONDS,
        forcePathStyle,
      });
      if (await isReadableImageUrl(signedUrl)) return signedUrl;
    }
    return "";
  }

  const { data } = await adminClient.storage
    .from(CREATOR_VIDEO_BUCKET)
    .createSignedUrl(thumbnailPath, SIGNED_URL_SECONDS);
  return toText(data?.signedUrl);
};

const mapPublicVideo = async (
  adminClient: any,
  row: PublicCreatorVideoRow,
  s3Config: {
    bucket: string;
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  },
) => ({
  id: toText(row.id),
  ownerId: toText(row.owner_id),
  title: toText(row.title) || "Untitled Video",
  description: toText(row.description),
  visibility: "public",
  moderationStatus: PUBLIC_MODERATION_STATUSES.includes(toText(row.moderation_status))
    ? toText(row.moderation_status)
    : "clean",
  moderationReason: toText(row.moderation_reason) || null,
  moderatedAt: toText(row.moderated_at) || null,
  moderatedBy: toText(row.moderated_by) || null,
  thumbnailUrl: await createThumbnailUrl(adminClient, row, s3Config),
  mimeType: toText(row.mime_type),
  fileSizeBytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null,
  createdAt: toText(row.created_at) || new Date().toISOString(),
  updatedAt: toText(row.updated_at) || toText(row.created_at) || new Date().toISOString(),
});

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST for public creator video cards." });
  }

  try {
    const payload = await req.json().catch(() => null) as PublicCreatorVideoCardPayload | null;
    if (!payload || typeof payload !== "object") {
      return json(400, { error: "invalid_body", message: "Request body must be a JSON object." });
    }

    const action = normalizeAction(payload.action);
    if (!action) return json(400, { error: "invalid_action", message: "Unknown public video card action." });

    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const s3Config = {
      bucket: readRequiredEnv("S3_BUCKET"),
      endpoint: readRequiredEnv("S3_ENDPOINT"),
      region: readRequiredEnv("S3_REGION"),
      accessKeyId: readRequiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: readRequiredEnv("S3_SECRET_ACCESS_KEY"),
    };

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const limit = normalizeLimit(payload.limit);
    let query = adminClient
      .from("videos")
      .select(PUBLIC_CREATOR_VIDEO_SELECT)
      .eq("visibility", "public")
      .in("moderation_status", PUBLIC_MODERATION_STATUSES)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (action === "list_by_owner") {
      const ownerId = toText(payload.ownerId);
      if (!ownerId) return json(400, { error: "missing_owner", message: "Missing owner id." });
      query = query.eq("owner_id", ownerId);
    } else if (action === "list_for_owners") {
      const ownerIds = normalizeOwnerIds(payload.ownerIds);
      if (!ownerIds.length) return json(200, { videos: [] });
      query = query.in("owner_id", ownerIds);
    }

    const { data, error } = await query.returns<PublicCreatorVideoRow[]>();
    if (error) {
      console.error("public creator video card query failed", error.message);
      return json(500, { error: "query_failed", message: "Public videos are unavailable right now." });
    }

    const videos = await Promise.all((data ?? []).map((row) => mapPublicVideo(adminClient, row, s3Config)));
    return json(200, { videos });
  } catch (error) {
    console.error("public creator video card failure", error);
    return json(500, {
      error: "public_creator_video_cards_failed",
      message: "Public videos are unavailable right now.",
    });
  }
});
