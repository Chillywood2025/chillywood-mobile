import { createClient } from "npm:@supabase/supabase-js@2";

type PublicCreatorVideoCardAction = "list_by_owner" | "list_for_owners" | "list_latest";
type SupabaseAdminClient = any;

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
  scan_status: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  thumb_storage_path: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  updated_at: string | null;
};

type OfficialRachiOriginalVideoLinkRow = {
  video_id: string;
};

type PublicClipMetadataRow = {
  video_id: string;
  title_overlay_text: string | null;
  title_overlay_subtitle: string | null;
  title_overlay_position: string | null;
  title_overlay_style: string | null;
  template_preset: string | null;
};

type PublicClipMetadata = {
  clip_metadata_public: boolean;
  clip_title_text: string;
  clip_subtitle_text: string;
  clip_template_preset: string;
  clip_title_style: string;
  clip_title_position: string;
};

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const CREATOR_VIDEO_BUCKET = "creator-videos";
const RACHI_OFFICIAL_USER_ID = "platform_rachi_official";
const SIGNED_URL_SECONDS = 60 * 60;
const CLIP_TITLE_MAX_LENGTH = 80;
const CLIP_SUBTITLE_MAX_LENGTH = 140;
const PUBLIC_MODERATION_STATUSES = ["clean", "reported"];
const PUBLIC_SCAN_STATUSES = ["clean"];
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
  "scan_status",
  "storage_provider",
  "storage_bucket",
  "thumb_storage_path",
  "mime_type",
  "file_size_bytes",
  "updated_at",
].join(",");
const PUBLIC_CLIP_EDIT_SELECT = [
  "video_id",
  "title_overlay_text",
  "title_overlay_subtitle",
  "title_overlay_position",
  "title_overlay_style",
  "template_preset",
].join(",");
const EMPTY_PUBLIC_CLIP_METADATA: PublicClipMetadata = {
  clip_metadata_public: false,
  clip_title_text: "",
  clip_subtitle_text: "",
  clip_template_preset: "",
  clip_title_style: "",
  clip_title_position: "",
};

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

const clipText = (value: unknown, maxLength: number) => toText(value).slice(0, maxLength);

const normalizeClipTitlePosition = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "top" || normalized === "center") return normalized;
  return "bottom";
};

const normalizeClipTitleStyle = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "bold" || normalized === "spotlight" || normalized === "trailer") return normalized;
  return "clean";
};

const normalizeClipTemplatePreset = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "trailer"
    || normalized === "highlight"
    || normalized === "promo"
    || normalized === "event"
    || normalized === "reaction"
    || normalized === "platform_intro"
  ) {
    return normalized;
  }
  return "";
};

const mapPublicClipMetadata = (row: PublicClipMetadataRow): PublicClipMetadata => {
  const title = clipText(row.title_overlay_text, CLIP_TITLE_MAX_LENGTH);
  const subtitle = clipText(row.title_overlay_subtitle, CLIP_SUBTITLE_MAX_LENGTH);
  const template = normalizeClipTemplatePreset(row.template_preset);
  const hasPublicMetadata = !!(title || subtitle || template);
  if (!hasPublicMetadata) return EMPTY_PUBLIC_CLIP_METADATA;

  return {
    clip_metadata_public: true,
    clip_title_text: title,
    clip_subtitle_text: subtitle,
    clip_template_preset: template,
    clip_title_style: normalizeClipTitleStyle(row.title_overlay_style),
    clip_title_position: normalizeClipTitlePosition(row.title_overlay_position),
  };
};

const readPublicClipMetadata = async (
  adminClient: SupabaseAdminClient,
  videoIds: string[],
) => {
  const normalizedVideoIds = Array.from(new Set(videoIds.map(toText).filter(Boolean))).slice(0, 100);
  if (!normalizedVideoIds.length) return new Map<string, PublicClipMetadata>();

  const { data, error } = await adminClient
    .from("creator_clip_edits")
    .select(PUBLIC_CLIP_EDIT_SELECT)
    .in("video_id", normalizedVideoIds);

  if (error || !data) {
    if (error) console.error("public creator video clip metadata query failed", error.message);
    return new Map<string, PublicClipMetadata>();
  }

  const rows = (data ?? []) as PublicClipMetadataRow[];
  return new Map(rows.map((row) => [toText(row.video_id), mapPublicClipMetadata(row)]));
};

const readPublishedOfficialRachiOriginalVideoIds = async (
  adminClient: SupabaseAdminClient,
  limit: number,
) => {
  const { data, error } = await adminClient
    .from("official_rachi_original_videos")
    .select("video_id")
    .eq("official_account_id", RACHI_OFFICIAL_USER_ID)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) console.error("official Rachi Originals link query failed", error.message);
    return [];
  }

  const rows = (data ?? []) as OfficialRachiOriginalVideoLinkRow[];
  return Array.from(new Set(rows.map((row) => toText(row.video_id)).filter(Boolean))).slice(0, limit);
};

const readOfficialRachiOwnerOverrides = async (
  adminClient: SupabaseAdminClient,
  videoIds: string[],
) => {
  const normalizedVideoIds = Array.from(new Set(videoIds.map(toText).filter(Boolean))).slice(0, 100);
  if (!normalizedVideoIds.length) return new Map<string, string>();

  const { data, error } = await adminClient
    .from("official_rachi_original_videos")
    .select("video_id")
    .eq("official_account_id", RACHI_OFFICIAL_USER_ID)
    .eq("status", "published")
    .in("video_id", normalizedVideoIds);

  if (error || !data) {
    if (error) console.error("official Rachi Originals owner override query failed", error.message);
    return new Map<string, string>();
  }

  const rows = (data ?? []) as OfficialRachiOriginalVideoLinkRow[];
  return new Map(rows.map((row) => [toText(row.video_id), RACHI_OFFICIAL_USER_ID]));
};

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
  adminClient: SupabaseAdminClient,
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
  adminClient: SupabaseAdminClient,
  row: PublicCreatorVideoRow,
  publicClipMetadata: PublicClipMetadata | undefined,
  ownerIdOverride: string | undefined,
  s3Config: {
    bucket: string;
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  },
) => ({
  id: toText(row.id),
  ownerId: toText(ownerIdOverride) || toText(row.owner_id),
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
  ...(publicClipMetadata ?? EMPTY_PUBLIC_CLIP_METADATA),
});

const sortPublicRowsNewestFirst = (rows: PublicCreatorVideoRow[]) => rows.sort((left, right) => {
  const leftTime = Date.parse(toText(left.created_at));
  const rightTime = Date.parse(toText(right.created_at));
  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
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
    let rows: PublicCreatorVideoRow[] = [];

    if (action === "list_by_owner") {
      const ownerId = toText(payload.ownerId);
      if (!ownerId) return json(400, { error: "missing_owner", message: "Missing owner id." });
      const officialRachiVideoIds = ownerId === RACHI_OFFICIAL_USER_ID
        ? await readPublishedOfficialRachiOriginalVideoIds(adminClient, limit)
        : [];
      if (ownerId === RACHI_OFFICIAL_USER_ID && !officialRachiVideoIds.length) {
        return json(200, { videos: [] });
      }

      let query = adminClient
        .from("videos")
        .select(PUBLIC_CREATOR_VIDEO_SELECT)
        .eq("visibility", "public")
        .in("moderation_status", PUBLIC_MODERATION_STATUSES)
        .in("scan_status", PUBLIC_SCAN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(limit);

      query = ownerId === RACHI_OFFICIAL_USER_ID
        ? query.in("id", officialRachiVideoIds)
        : query.eq("owner_id", ownerId);

      const { data, error } = await query.returns<PublicCreatorVideoRow[]>();
      if (error) {
        console.error("public creator video card query failed", error.message);
        return json(500, { error: "query_failed", message: "Public videos are unavailable right now." });
      }
      rows = data ?? [];
    } else if (action === "list_for_owners") {
      const ownerIds = normalizeOwnerIds(payload.ownerIds);
      if (!ownerIds.length) return json(200, { videos: [] });
      const includesOfficialRachi = ownerIds.includes(RACHI_OFFICIAL_USER_ID);
      const regularOwnerIds = ownerIds.filter((ownerId) => ownerId !== RACHI_OFFICIAL_USER_ID);
      const results: { data: PublicCreatorVideoRow[] | null; error: { message?: string } | null }[] = [];

      if (regularOwnerIds.length) {
        results.push(await adminClient
          .from("videos")
          .select(PUBLIC_CREATOR_VIDEO_SELECT)
          .eq("visibility", "public")
          .in("moderation_status", PUBLIC_MODERATION_STATUSES)
          .in("scan_status", PUBLIC_SCAN_STATUSES)
          .in("owner_id", regularOwnerIds)
          .order("created_at", { ascending: false })
          .limit(limit)
          .returns<PublicCreatorVideoRow[]>());
      }

      if (includesOfficialRachi) {
        const officialRachiVideoIds = await readPublishedOfficialRachiOriginalVideoIds(adminClient, limit);
        if (officialRachiVideoIds.length) {
          results.push(await adminClient
            .from("videos")
            .select(PUBLIC_CREATOR_VIDEO_SELECT)
            .eq("visibility", "public")
            .in("moderation_status", PUBLIC_MODERATION_STATUSES)
            .in("scan_status", PUBLIC_SCAN_STATUSES)
            .in("id", officialRachiVideoIds)
            .order("created_at", { ascending: false })
            .limit(limit)
            .returns<PublicCreatorVideoRow[]>());
        }
      }

      const failed = results.find((result) => result.error);
      if (failed?.error) {
        console.error("public creator video card query failed", failed.error.message);
        return json(500, { error: "query_failed", message: "Public videos are unavailable right now." });
      }

      const deduped = new Map<string, PublicCreatorVideoRow>();
      for (const result of results) {
        for (const row of result.data ?? []) {
          const id = toText(row.id);
          if (id) deduped.set(id, row);
        }
      }
      rows = sortPublicRowsNewestFirst(Array.from(deduped.values())).slice(0, limit);
    } else {
      const { data, error } = await adminClient
        .from("videos")
        .select(PUBLIC_CREATOR_VIDEO_SELECT)
        .eq("visibility", "public")
        .in("moderation_status", PUBLIC_MODERATION_STATUSES)
        .in("scan_status", PUBLIC_SCAN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<PublicCreatorVideoRow[]>();
      if (error) {
        console.error("public creator video card query failed", error.message);
        return json(500, { error: "query_failed", message: "Public videos are unavailable right now." });
      }
      rows = data ?? [];
    }

    const metadataByVideoId = await readPublicClipMetadata(adminClient, rows.map((row) => row.id));
    const ownerOverridesByVideoId = await readOfficialRachiOwnerOverrides(adminClient, rows.map((row) => row.id));
    const videos = await Promise.all(rows.map((row) => mapPublicVideo(
      adminClient,
      row,
      metadataByVideoId.get(toText(row.id)),
      ownerOverridesByVideoId.get(toText(row.id)),
      s3Config,
    )));
    return json(200, { videos });
  } catch (error) {
    console.error("public creator video card failure", error);
    return json(500, {
      error: "public_creator_video_cards_failed",
      message: "Public videos are unavailable right now.",
    });
  }
});
