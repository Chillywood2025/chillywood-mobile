import { createClient } from "npm:@supabase/supabase-js@2";

type GatewayAction = "audit_candidate" | "download" | "transcode_download" | "premium_hd_download" | "record_scan_result";
type SupabaseClient = any;

type GatewayPayload = {
  action?: unknown;
  source_type?: unknown;
  source_id?: unknown;
  scanner_name?: unknown;
  scanner_version?: unknown;
  scanner_type?: unknown;
  status?: unknown;
  proof?: unknown;
};

type ScanCandidate = {
  id: string;
  owner_id: string | null;
  title: string | null;
  visibility: string | null;
  scan_status: string | null;
  moderation_status: string | null;
  mime_type: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_object_key: string | null;
  storage_path: string | null;
  playback_url: string | null;
  file_size_bytes: number | null;
};

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-media-scan-operator-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const textEncoder = new TextEncoder();
const PUBLIC_SCAN_PENDING_STATUSES = new Set(["", "pending", "pending_scan", "scanning", "manual_review", "unscanned"]);
const PUBLIC_SCAN_CLEAN_STATUSES = new Set(["clean", "approved"]);
const BLOCKED_SCAN_STATUSES = new Set(["malware", "malware_detected", "quarantined"]);
const PUBLIC_MODERATION_STATUSES = new Set(["clean", "approved", "allowed"]);
const BLOCKED_MODERATION_STATUSES = new Set(["blocked", "hidden", "removed", "banned", "rejected"]);
const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "application/vnd.apple.mpegurl",
]);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: JSON_HEADERS, status });

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const readRequiredEnv = (name: string) => {
  const value = toText(Deno.env.get(name));
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
};

const bytesToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToHex(digest);
};

const timingSafeEqualHex = (left: string, right: string) => {
  const a = toLowerText(left);
  const b = toLowerText(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
};

const authenticateScanner = async (req: Request) => {
  const expectedHash = toText(Deno.env.get("MEDIA_SCAN_OPERATOR_TOKEN_SHA256")).toLowerCase();
  const token = toText(req.headers.get("x-media-scan-operator-token"));
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  if (!token || token.length < 32 || token.length > 512) return false;
  const actualHash = await sha256Hex(token);
  return timingSafeEqualHex(actualHash, expectedHash);
};

const normalizeAction = (value: unknown): GatewayAction | null => {
  const action = toLowerText(value);
  if (
    action === "audit_candidate"
    || action === "download"
    || action === "transcode_download"
    || action === "premium_hd_download"
    || action === "record_scan_result"
  ) return action;
  return null;
};

const parseUuid = (value: unknown) => {
  const text = toText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
};

const isSafeObjectKey = (value: string) => (
  !!value
  && value.length <= 1024
  && !value.startsWith("/")
  && !value.includes("..")
  && !/[\u0000-\u001F\u007F]/u.test(value)
);

const isSupportedMimeType = (value: unknown) => {
  const mimeType = toLowerText(value || "video/mp4");
  if (!mimeType) return true;
  return SUPPORTED_VIDEO_MIME_TYPES.has(mimeType) || mimeType.startsWith("video/");
};

const sourceIsOriginalOnly = (candidate: ScanCandidate) => {
  const combined = [
    candidate.storage_path,
    candidate.storage_object_key,
    candidate.playback_url,
  ].map((value) => toText(value)).join("/");
  return /(^|\/)(originals?|masters?)(\/|$)/i.test(combined);
};

const objectKeyOwner = (objectKey: string) => objectKey.split("/")[0] ?? "";

const encodeObjectKey = (objectKey: string) => objectKey
  .split("/")
  .map((segment) => encodeURIComponent(segment))
  .join("/");

const awsEncode = (value: string) => encodeURIComponent(value)
  .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

const hmac = async (key: ArrayBuffer | Uint8Array, data: string) => {
  const keyData = key instanceof ArrayBuffer ? key : new Uint8Array(key).buffer as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(data));
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
  return {
    canonicalUri: `/${encodeObjectKey(objectKey)}`,
    host,
    protocol: endpointUrl.protocol || "https:",
  };
};

const createPresignedS3GetUrl = async (input: {
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
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
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

const readCandidate = async (adminClient: SupabaseClient, sourceType: string, sourceId: string) => {
  if (sourceType !== "creator_video") return { error: json(400, { error: "unsupported_source_type" }) };
  const { data, error } = await adminClient
    .from("videos")
    .select("id,owner_id,title,visibility,scan_status,moderation_status,mime_type,storage_provider,storage_bucket,storage_object_key,storage_path,playback_url,file_size_bytes")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw new Error(`candidate_read_failed:${error.message}`);
  if (!data) return { error: json(404, { error: "candidate_not_found" }) };
  return { candidate: data as ScanCandidate };
};

const hasPremiumLock = async (adminClient: SupabaseClient, sourceId: string, visibility: unknown) => {
  if (toLowerText(visibility) === "premium") return true;
  const priceQuery = await adminClient
    .from("creator_content_prices")
    .select("id")
    .eq("content_id", sourceId)
    .eq("is_paid", true)
    .not("status", "in", "(disabled,deleted,inactive)")
    .limit(1)
    .maybeSingle();
  if (priceQuery.data?.id) return true;
  const monetizationQuery = await adminClient
    .from("creator_monetization_configs")
    .select("id")
    .eq("source_id", sourceId)
    .not("status", "in", "(disabled,deleted,inactive)")
    .or("creates_digital_access.eq.true,production_enabled.eq.true,product_type.ilike.%paid%")
    .limit(1)
    .maybeSingle();
  return !!monetizationQuery.data?.id;
};

const hasAuditedHls = async (adminClient: SupabaseClient, sourceId: string) => {
  const { data } = await adminClient
    .from("media_renditions")
    .select("id")
    .eq("source_type", "creator_video")
    .eq("source_id", sourceId)
    .eq("delivery_format", "hls")
    .eq("delivery_provider", "cloudflare_r2_custom_domain")
    .eq("is_ready", true)
    .eq("is_public_playback_safe", true)
    .eq("visibility", "public")
    .eq("is_original", false)
    .eq("bucket_role", "public_playback")
    .like("public_playback_path", "playback/public/%")
    .limit(1)
    .maybeSingle();
  return !!data?.id;
};

const resolveObjectMetadata = (candidate: ScanCandidate) => {
  const provider = toLowerText(candidate.storage_provider);
  const bucket = toText(candidate.storage_bucket);
  const objectKey = toText(candidate.storage_object_key)
    || (toText(candidate.storage_path).match(/^https?:\/\//i) ? "" : toText(candidate.storage_path));
  return { provider, bucket, objectKey };
};

const validateCandidate = async (
  adminClient: SupabaseClient,
  sourceType: string,
  sourceId: string,
  options: { requirePendingScan: boolean; requireCleanScan?: boolean; allowAlreadyAuditedHls?: boolean },
) => {
  const read = await readCandidate(adminClient, sourceType, sourceId);
  if ("error" in read) return read;
  const candidate = (read as { candidate: ScanCandidate }).candidate;
  const storage = resolveObjectMetadata(candidate);
  const blockedReasons: string[] = [];
  if (toLowerText(candidate.visibility) !== "public") blockedReasons.push("private_denied");
  if (await hasPremiumLock(adminClient, sourceId, candidate.visibility)) blockedReasons.push("premium_denied");
  if (sourceIsOriginalOnly(candidate)) blockedReasons.push("original_master_denied");
  if (!PUBLIC_MODERATION_STATUSES.has(toLowerText(candidate.moderation_status))) {
    blockedReasons.push(BLOCKED_MODERATION_STATUSES.has(toLowerText(candidate.moderation_status)) ? "moderation_blocked" : "moderation_not_allowed");
  }
  if (BLOCKED_SCAN_STATUSES.has(toLowerText(candidate.scan_status))) blockedReasons.push("scan_blocked");
  if (options.requirePendingScan && !PUBLIC_SCAN_PENDING_STATUSES.has(toLowerText(candidate.scan_status))) {
    blockedReasons.push("scan_not_pending");
  }
  if (options.requireCleanScan && !PUBLIC_SCAN_CLEAN_STATUSES.has(toLowerText(candidate.scan_status))) {
    blockedReasons.push("scan_not_clean");
  }
  if (options.allowAlreadyAuditedHls !== true && await hasAuditedHls(adminClient, sourceId)) {
    blockedReasons.push("already_audited_hls");
  }
  if (!isSupportedMimeType(candidate.mime_type)) blockedReasons.push("unsupported_mime_type");
  if (!storage.provider || !["s3", "supabase"].includes(storage.provider)) blockedReasons.push("unsupported_storage_provider");
  if (!storage.bucket || !isSafeObjectKey(storage.objectKey)) blockedReasons.push("missing_source_object");

  const maxBytes = Number.parseInt(toText(Deno.env.get("MEDIA_SCAN_MAX_DOWNLOAD_BYTES")) || String(512 * 1024 * 1024), 10);
  const sizeBytes = Number(candidate.file_size_bytes ?? 0);
  if (Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes > maxBytes) blockedReasons.push("object_too_large_for_gateway_scan");

  if (blockedReasons.length) {
    return {
      error: json(403, {
        error: "candidate_not_scannable",
        blockedReasons,
        sourceType,
        sourceId,
      }),
    };
  }

  return { candidate, storage };
};

const redactedCandidatePayload = (candidate: ScanCandidate, storage: { provider: string; bucket: string; objectKey: string }) => ({
  sourceType: "creator_video",
  sourceId: candidate.id,
  title: toText(candidate.title) || "Untitled video",
  visibility: toText(candidate.visibility),
  scanStatus: toText(candidate.scan_status),
  moderationStatus: toText(candidate.moderation_status),
  mimeType: toText(candidate.mime_type) || "video/mp4",
  storageProvider: storage.provider,
  storageBucket: storage.bucket,
  objectMetadataPresent: !!storage.objectKey,
  objectKeyRedacted: true,
  publicCandidate: true,
  premiumLocked: false,
});

const streamS3Object = async (storage: { provider: string; bucket: string; objectKey: string }) => {
  const s3Endpoint = readRequiredEnv("S3_ENDPOINT");
  const s3Region = readRequiredEnv("S3_REGION");
  const s3AccessKeyId = readRequiredEnv("S3_ACCESS_KEY_ID");
  const s3SecretAccessKey = readRequiredEnv("S3_SECRET_ACCESS_KEY");
  const expectedBucket = readRequiredEnv("S3_BUCKET");
  if (storage.bucket !== expectedBucket) return json(403, { error: "invalid_s3_bucket" });
  const signedObjectUrl = await createPresignedS3GetUrl({
    endpoint: s3Endpoint,
    region: s3Region,
    bucket: storage.bucket,
    objectKey: storage.objectKey,
    accessKeyId: s3AccessKeyId,
    secretAccessKey: s3SecretAccessKey,
    expiresSeconds: 60,
  });
  const response = await fetch(signedObjectUrl);
  if (!response.ok || !response.body) return json(502, { error: "source_download_failed", storageProvider: "s3" });
  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Media-Scan-Storage-Provider": "s3",
    },
  });
};

const streamSupabaseStorageObject = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  storage: { provider: string; bucket: string; objectKey: string },
) => {
  const objectUrl = `${supabaseUrl.replace(/\/+$/g, "")}/storage/v1/object/${encodeURIComponent(storage.bucket)}/${encodeObjectKey(storage.objectKey)}`;
  const response = await fetch(objectUrl, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok || !response.body) return json(502, { error: "source_download_failed", storageProvider: "supabase" });
  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Media-Scan-Storage-Provider": "supabase",
    },
  });
};

const normalizeScanResult = (payload: GatewayPayload) => {
  const status = toLowerText(payload.status);
  const scannerName = toText(payload.scanner_name);
  const scannerVersion = toText(payload.scanner_version);
  const scannerType = toLowerText(payload.scanner_type || "ffprobe_media_readability");
  const proof = (payload.proof && typeof payload.proof === "object" ? payload.proof : {}) as Record<string, unknown>;
  const blockedReasons: string[] = [];
  if (scannerType !== "ffprobe_media_readability") blockedReasons.push("unsupported_scanner_type");
  if (!scannerName) blockedReasons.push("scanner_name_required");
  if (!scannerVersion) blockedReasons.push("scanner_version_required");
  if (!["clean", "scan_failed"].includes(status)) blockedReasons.push("unsupported_scan_status");
  if (status === "clean") {
    if (proof.observedReadable !== true) blockedReasons.push("observed_readable_required");
    if (Number(proof.decodedStreams ?? 0) <= 0) blockedReasons.push("decoded_stream_required");
  }
  return {
    valid: blockedReasons.length === 0,
    status,
    scannerName,
    scannerVersion,
    scannerType,
    proof,
    blockedReasons,
  };
};

const writeScanResult = async (
  adminClient: SupabaseClient,
  candidate: ScanCandidate,
  storage: { provider: string; bucket: string; objectKey: string },
  result: ReturnType<typeof normalizeScanResult>,
) => {
  const now = new Date().toISOString();
  const scanStatus = result.status === "clean" ? "clean" : "scan_failed";
  const scanResult = result.status === "clean"
    ? "ffprobe_media_readability_clean_not_malware_or_content_moderation"
    : toText(result.proof.errorCode) || "ffprobe_media_readability_failed";
  const { error } = await adminClient
    .from("videos")
    .update({
      scan_status: scanStatus,
      scan_provider: result.scannerName,
      scan_result: scanResult,
      scanned_at: result.status === "clean" ? now : null,
      scan_error: result.status === "clean" ? null : scanResult,
      updated_at: now,
    })
    .eq("id", candidate.id)
    .eq("visibility", "public")
    .not("moderation_status", "in", "(blocked,hidden,removed,banned,rejected)");
  if (error) throw new Error(`scan_result_write_failed:${error.message}`);

  await adminClient.from("media_security_audit_events").insert({
    action: "media_scan_result_recorded",
    actor_email: null,
    actor_user_id: null,
    metadata: {
      scannerType: result.scannerType,
      scannerName: result.scannerName,
      scannerVersion: result.scannerVersion,
      proofType: "ffprobe_media_readability_only_not_malware_or_content_moderation",
      decodedStreams: Number(result.proof.decodedStreams ?? 0),
      durationMillis: Number(result.proof.durationMillis ?? 0),
      storageProvider: storage.provider,
    },
    object_key_owner: objectKeyOwner(storage.objectKey),
    record_id: candidate.id,
    reason: "Trusted backend media scan gateway recorded ffprobe media-readability result.",
    result: "success",
    security_context_id: null,
    surface_type: "creator_video",
  });

  return {
    sourceType: "creator_video",
    sourceId: candidate.id,
    scanStatus,
    scannerName: result.scannerName,
    scannerVersion: result.scannerVersion,
    scannerType: result.scannerType,
    scannerDisclosure: "ffprobe_media_readability_only_not_malware_or_content_moderation",
  };
};

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    if (!(await authenticateScanner(req))) return json(401, { error: "scanner_operator_token_required" });

    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json().catch(() => null) as GatewayPayload | null;
    if (!payload || typeof payload !== "object") return json(400, { error: "invalid_body" });

    const action = normalizeAction(payload.action);
    const sourceType = toLowerText(payload.source_type || "creator_video");
    const sourceId = parseUuid(payload.source_id);
    if (!action) return json(400, { error: "invalid_action" });
    if (!sourceId) return json(400, { error: "invalid_source_id" });

    const validation = await validateCandidate(adminClient, sourceType, sourceId, {
      requirePendingScan: action === "download" || action === "record_scan_result",
      requireCleanScan: action === "transcode_download" || action === "premium_hd_download",
      allowAlreadyAuditedHls: action === "premium_hd_download",
    });
    if ("error" in validation) return validation.error ?? json(403, { error: "candidate_not_scannable" });
    const validated = validation as { candidate: ScanCandidate; storage: { provider: string; bucket: string; objectKey: string } };
    const candidate = validated.candidate;
    const storage = validated.storage;

    if (action === "audit_candidate") {
      return json(200, {
        ok: true,
        candidate: redactedCandidatePayload(candidate, storage),
        noSecretsReturned: true,
      });
    }

    if (action === "download" || action === "transcode_download" || action === "premium_hd_download") {
      if (storage.provider === "s3") return streamS3Object(storage);
      if (storage.provider === "supabase") return streamSupabaseStorageObject(supabaseUrl, serviceRoleKey, storage);
      return json(403, { error: "unsupported_storage_provider" });
    }

    const scanResult = normalizeScanResult(payload);
    if (!scanResult.valid) return json(400, { error: "invalid_scan_result", blockedReasons: scanResult.blockedReasons });
    const writeResult = await writeScanResult(adminClient, candidate, storage, scanResult);
    return json(200, {
      ok: true,
      result: writeResult,
      noSecretsReturned: true,
    });
  } catch (error) {
    console.error("media-scan-private-access failure", error instanceof Error ? error.message : "unknown_error");
    return json(500, { error: "media_scan_private_access_failed" });
  }
});
