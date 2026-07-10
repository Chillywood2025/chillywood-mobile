import { createClient } from "npm:@supabase/supabase-js@2";

type MigrationAction =
  | "audit_inventory"
  | "copy_object"
  | "verify_object"
  | "copy_batch"
  | "update_metadata_dry_run"
  | "update_metadata_batch"
  | "zero_ref_audit"
  | "rollback_metadata_batch";

type SupabaseClient = any;

type InventoryReference = {
  tableName: string;
  rowId: string;
  sourceType: string;
  sourceId: string;
  storageProvider: string;
  storageBucket: string;
  storageObjectKey: string;
  visibility: string;
  accessTier: string;
  scanStatus: string;
  moderationStatus: string;
  isOriginal: boolean;
  liveKitRelated: boolean;
};

type ManifestEntry = InventoryReference & {
  migrationId: string;
  sourceProvider: "hetzner_s3";
  sourceBucket: string;
  targetProvider: "cloudflare_r2";
  targetBucket: string;
  targetObjectKey: string;
  sourceObjectKeyRedacted: true;
  sourceObjectKeyPresent: boolean;
};

type S3Config = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type CopyResult = {
  tableName: string;
  rowId: string;
  targetBucket: string;
  targetObjectKey: string;
  copied: boolean;
  verified: boolean;
  sourceSizeBytes: number | null;
  targetSizeBytes: number | null;
  sourceEtagPresent: boolean;
  targetEtagPresent: boolean;
  checksumComparable: boolean;
  checksumMatched: boolean | null;
};

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-media-object-migration-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const LEGACY_HETZNER_BUCKET = "chillywood-media-prod";
const R2_ORIGIN_BUCKET = "chillywood-media-origin";
const ALLOWED_TARGET_PREFIXES = ["originals/", "uploads/", "source/", "processing/", "quarantine/"];
const FORBIDDEN_TARGET_PREFIXES = ["playback/public/", "playback/protected/", "playback/premium/"];
const DEFAULT_COPY_BATCH_LIMIT = 25;
const MAX_COPY_BATCH_LIMIT = 100;
const textEncoder = new TextEncoder();

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({
    objectKeysRedacted: true,
    signedUrlsPrinted: false,
    secretsPrinted: false,
    liveKitTouched: false,
    ...body,
  }), { status, headers: JSON_HEADERS });

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const readEnv = (name: string) => toText(Deno.env.get(name));

const firstEnv = (...names: string[]) => {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return { name, value };
  }
  return { name: names[0] ?? "", value: "" };
};

const missingEnvResponse = (reason: string, names: string[]) => json(409, {
  ok: false,
  blocked: true,
  reason,
  missingEnvNames: names,
  hetznerFallbackRetained: true,
});

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

const authenticateMigrationOperator = async (req: Request) => {
  const expectedHash = toLowerText(readEnv("MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_SHA256"));
  const token = toText(req.headers.get("x-media-object-migration-token"));
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  if (!token || token.length < 32 || token.length > 512) return false;
  const actualHash = await sha256Hex(token);
  return timingSafeEqualHex(actualHash, expectedHash);
};

const normalizeAction = (value: unknown): MigrationAction | null => {
  const action = toLowerText(value);
  if (
    action === "audit_inventory"
    || action === "copy_object"
    || action === "verify_object"
    || action === "copy_batch"
    || action === "update_metadata_dry_run"
    || action === "update_metadata_batch"
    || action === "zero_ref_audit"
    || action === "rollback_metadata_batch"
  ) return action;
  return null;
};

const normalizeProvider = (value: unknown) => {
  const provider = toLowerText(value);
  if (provider === "s3" || provider === "hetzner" || provider === "hetzner_s3") return "hetzner_s3";
  if (provider === "cloudflare_r2" || provider === "r2") return "cloudflare_r2";
  if (provider === "supabase" || provider === "supabase_storage") return "supabase_storage";
  return provider || "unknown";
};

const isLiveKitReference = (value: unknown) => {
  const normalized = toLowerText(value);
  return normalized.includes("live.chillywoodstream.com") || normalized.includes("chillywood-prod-01");
};

const isSafeObjectKey = (value: string) => (
  !!value
  && value.length <= 2048
  && !value.startsWith("/")
  && !value.includes("..")
  && !/^https?:\/\//i.test(value)
  && !/[\u0000-\u001F\u007F]/u.test(value)
);

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

const createPresignedS3Url = async (input: {
  method: "GET" | "HEAD" | "PUT";
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
    input.method,
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

const readLegacyS3Config = (): { config?: S3Config; missing: string[] } => {
  const endpoint = firstEnv("LEGACY_S3_ENDPOINT", "S3_ENDPOINT");
  const region = firstEnv("LEGACY_S3_REGION", "S3_REGION");
  const accessKeyId = firstEnv("LEGACY_S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID");
  const secretAccessKey = firstEnv("LEGACY_S3_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY");
  const bucket = firstEnv("LEGACY_S3_BUCKET", "S3_BUCKET");
  const missing = [
    endpoint.value ? "" : "LEGACY_S3_ENDPOINT or S3_ENDPOINT",
    region.value ? "" : "LEGACY_S3_REGION or S3_REGION",
    accessKeyId.value ? "" : "LEGACY_S3_ACCESS_KEY_ID or S3_ACCESS_KEY_ID",
    secretAccessKey.value ? "" : "LEGACY_S3_SECRET_ACCESS_KEY or S3_SECRET_ACCESS_KEY",
    bucket.value ? "" : "LEGACY_S3_BUCKET or S3_BUCKET",
  ].filter(Boolean);
  if (missing.length) return { missing };
  return {
    missing: [],
    config: {
      bucket: bucket.value,
      endpoint: endpoint.value,
      region: region.value,
      accessKeyId: accessKeyId.value,
      secretAccessKey: secretAccessKey.value,
    },
  };
};

const readR2OriginConfig = (): { config?: S3Config; missing: string[] } => {
  const privateOnly = toLowerText(firstEnv("MEDIA_ORIGIN_PRIVATE_ONLY").value);
  const publicPlaybackDisabled = toLowerText(firstEnv("MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED").value);
  const bucket = firstEnv("R2_ORIGIN_BUCKET", "MEDIA_ORIGIN_BUCKET");
  const endpoint = firstEnv("R2_ORIGIN_ENDPOINT", "MEDIA_ORIGIN_R2_ENDPOINT");
  const region = firstEnv("R2_ORIGIN_REGION", "MEDIA_ORIGIN_R2_REGION");
  const accessKeyId = firstEnv("R2_ORIGIN_ACCESS_KEY_ID", "MEDIA_ORIGIN_R2_ACCESS_KEY_ID");
  const secretAccessKey = firstEnv("R2_ORIGIN_SECRET_ACCESS_KEY", "MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY");
  const missing = [
    privateOnly === "true" ? "" : "MEDIA_ORIGIN_PRIVATE_ONLY=true",
    publicPlaybackDisabled === "true" ? "" : "MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED=true",
    bucket.value ? "" : "R2_ORIGIN_BUCKET or MEDIA_ORIGIN_BUCKET",
    endpoint.value ? "" : "R2_ORIGIN_ENDPOINT or MEDIA_ORIGIN_R2_ENDPOINT",
    accessKeyId.value ? "" : "R2_ORIGIN_ACCESS_KEY_ID or MEDIA_ORIGIN_R2_ACCESS_KEY_ID",
    secretAccessKey.value ? "" : "R2_ORIGIN_SECRET_ACCESS_KEY or MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY",
  ].filter(Boolean);
  if (missing.length) return { missing };
  return {
    missing: [],
    config: {
      bucket: bucket.value,
      endpoint: endpoint.value,
      region: region.value || "auto",
      accessKeyId: accessKeyId.value,
      secretAccessKey: secretAccessKey.value,
    },
  };
};

const safeSlug = (value: unknown) => {
  const slug = toLowerText(value).replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "unknown";
};

const objectExtension = (objectKey: string) => {
  const last = objectKey.split("/").pop() ?? "";
  const match = last.match(/(\.[a-z0-9]{1,12})$/i);
  return match ? match[1].toLowerCase() : "";
};

const buildTargetObjectKey = (reference: InventoryReference) => {
  const prefix = reference.isOriginal || toLowerText(reference.accessTier) === "owner" ? "originals" : "source";
  return [
    prefix,
    safeSlug(reference.tableName),
    safeSlug(reference.sourceType || reference.tableName),
    safeSlug(reference.sourceId || reference.rowId),
    `${safeSlug(reference.rowId)}${objectExtension(reference.storageObjectKey)}`,
  ].join("/");
};

const validateR2Target = (targetBucket: string, targetObjectKey: string) => {
  const allowedPrefix = ALLOWED_TARGET_PREFIXES.some((prefix) => targetObjectKey.startsWith(prefix));
  const forbiddenPrefix = FORBIDDEN_TARGET_PREFIXES.some((prefix) => targetObjectKey.startsWith(prefix));
  const forbiddenBucket = /public|playback/i.test(targetBucket);
  return {
    ok: targetBucket === R2_ORIGIN_BUCKET
      && allowedPrefix
      && !forbiddenPrefix
      && !forbiddenBucket
      && isSafeObjectKey(targetObjectKey),
    allowedPrefix,
    forbiddenPrefix,
    forbiddenBucket,
    privateOriginBucket: targetBucket === R2_ORIGIN_BUCKET,
  };
};

const isHetznerObjectStorageReference = (reference: InventoryReference) => {
  if (reference.liveKitRelated) return false;
  return normalizeProvider(reference.storageProvider) === "hetzner_s3" || reference.storageBucket === LEGACY_HETZNER_BUCKET;
};

const sourceObjectKeyFrom = (row: Record<string, unknown>) =>
  toText(row.storage_object_key)
  || (toText(row.storage_path).match(/^https?:\/\//i) ? "" : toText(row.storage_path))
  || (toText(row.manifest_path).match(/^https?:\/\//i) ? "" : toText(row.manifest_path))
  || (toText(row.public_playback_path).match(/^https?:\/\//i) ? "" : toText(row.public_playback_path))
  || (toText(row.protected_playback_path).match(/^https?:\/\//i) ? "" : toText(row.protected_playback_path));

const fromRow = (tableName: string, row: Record<string, unknown>, overrides: Partial<InventoryReference> = {}): InventoryReference => ({
  tableName,
  rowId: toText(row.id),
  sourceType: toText(overrides.sourceType) || toText(row.source_type) || tableName,
  sourceId: toText(overrides.sourceId) || toText(row.source_id) || toText(row.video_id) || toText(row.target_id) || toText(row.id),
  storageProvider: toText(overrides.storageProvider) || toText(row.storage_provider),
  storageBucket: toText(overrides.storageBucket) || toText(row.storage_bucket),
  storageObjectKey: toText(overrides.storageObjectKey) || sourceObjectKeyFrom(row),
  visibility: toText(overrides.visibility) || toText(row.visibility) || tableName,
  accessTier: toText(overrides.accessTier) || toText(row.access_tier) || (toLowerText(row.visibility) === "premium" ? "premium" : "free"),
  scanStatus: toText(overrides.scanStatus) || toText(row.scan_status) || toText(row.status),
  moderationStatus: toText(overrides.moderationStatus) || toText(row.moderation_status) || toText(row.status),
  isOriginal: Boolean(overrides.isOriginal ?? (toLowerText(row.quality_label) === "original")),
  liveKitRelated: Boolean(overrides.liveKitRelated) || isLiveKitReference(row.storage_bucket) || isLiveKitReference(row.storage_path),
});

const queryTable = async (
  adminClient: SupabaseClient,
  table: string,
  select: string,
  build: (row: Record<string, unknown>) => InventoryReference,
) => {
  const { data, error } = await adminClient.from(table).select(select).limit(10000);
  if (error) throw new Error(`inventory_${table}_failed`);
  return ((data ?? []) as Record<string, unknown>[]).map(build);
};

const readInventoryReferences = async (adminClient: SupabaseClient) => {
  const references: InventoryReference[] = [];

  references.push(...(await queryTable(
    adminClient,
    "videos",
    "id,visibility,scan_status,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path",
    (row) => fromRow("videos", row, { sourceType: "creator_video" }),
  )));

  references.push(...(await queryTable(
    adminClient,
    "social_attachments",
    "id,scan_status,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path",
    (row) => fromRow("social_attachments", row, { sourceType: "social_attachment", visibility: "attachment", accessTier: "free" }),
  )));

  references.push(...(await queryTable(
    adminClient,
    "media_scan_jobs",
    "id,target_table,target_id,status,storage_provider,storage_bucket,storage_object_key",
    (row) => fromRow("media_scan_jobs", row, {
      sourceType: toText(row.target_table) || "media_scan_job",
      sourceId: toText(row.target_id) || toText(row.id),
      visibility: "scan_job",
      accessTier: "unknown",
      moderationStatus: "unknown",
    }),
  )));

  references.push(...(await queryTable(
    adminClient,
    "video_renditions",
    "id,video_id,quality_label,access_tier,status,scan_status,storage_bucket,storage_path,manifest_path",
    (row) => fromRow("video_renditions", row, {
      sourceType: "creator_video",
      sourceId: toText(row.video_id),
      storageProvider: "s3",
      visibility: "rendition",
      moderationStatus: toText(row.status),
      isOriginal: toLowerText(row.quality_label) === "original",
    }),
  )));

  references.push(...(await queryTable(
    adminClient,
    "media_renditions",
    "id,source_type,source_id,visibility,scan_status,moderation_status,storage_provider,storage_bucket,storage_path,manifest_path,public_playback_path,protected_playback_path,is_original",
    (row) => fromRow("media_renditions", row, {
      sourceType: toText(row.source_type) || "creator_video",
      sourceId: toText(row.source_id),
      isOriginal: Boolean(row.is_original),
    }),
  )));

  return references.filter((reference) => (
    isHetznerObjectStorageReference(reference)
    || normalizeProvider(reference.storageProvider) === "cloudflare_r2"
    || normalizeProvider(reference.storageProvider) === "supabase_storage"
  ));
};

const summarizeInventory = (references: InventoryReference[]) => references.reduce((summary, reference) => {
  const provider = normalizeProvider(reference.storageProvider);
  const hetzner = isHetznerObjectStorageReference(reference);
  return {
    totalReferences: summary.totalReferences + 1,
    hetznerObjectStorageReferences: summary.hetznerObjectStorageReferences + (hetzner ? 1 : 0),
    r2References: summary.r2References + (provider === "cloudflare_r2" ? 1 : 0),
    supabaseStorageReferences: summary.supabaseStorageReferences + (provider === "supabase_storage" ? 1 : 0),
    migrationCandidates: summary.migrationCandidates + (hetzner ? 1 : 0),
    liveKitReferences: summary.liveKitReferences + (reference.liveKitRelated ? 1 : 0),
    blockedOrUnknownReferences: summary.blockedOrUnknownReferences + (provider === "unknown" ? 1 : 0),
  };
}, {
  totalReferences: 0,
  hetznerObjectStorageReferences: 0,
  r2References: 0,
  supabaseStorageReferences: 0,
  migrationCandidates: 0,
  liveKitReferences: 0,
  blockedOrUnknownReferences: 0,
});

const buildManifest = (references: InventoryReference[], migrationId = "media-object-storage-r2-20260710") => (
  references
    .filter(isHetznerObjectStorageReference)
    .filter((reference) => isSafeObjectKey(reference.storageObjectKey))
    .map((reference): ManifestEntry => {
      const targetObjectKey = buildTargetObjectKey(reference);
      return {
        ...reference,
        migrationId,
        sourceProvider: "hetzner_s3",
        sourceBucket: reference.storageBucket,
        sourceObjectKeyRedacted: true,
        sourceObjectKeyPresent: !!reference.storageObjectKey,
        targetProvider: "cloudflare_r2",
        targetBucket: R2_ORIGIN_BUCKET,
        targetObjectKey,
      };
    })
);

const redactedManifestEntry = (entry: ManifestEntry, extra: Record<string, unknown> = {}) => ({
  migrationId: entry.migrationId,
  tableName: entry.tableName,
  rowId: entry.rowId,
  sourceType: entry.sourceType,
  sourceId: entry.sourceId,
  sourceProvider: entry.sourceProvider,
  sourceBucket: entry.sourceBucket,
  sourceObjectKeyRedacted: true,
  sourceObjectKeyPresent: entry.sourceObjectKeyPresent,
  targetProvider: entry.targetProvider,
  targetBucket: entry.targetBucket,
  targetObjectKey: entry.targetObjectKey,
  visibility: entry.visibility,
  accessTier: entry.accessTier,
  scanStatus: entry.scanStatus,
  moderationStatus: entry.moderationStatus,
  isOriginal: entry.isOriginal,
  rollbackStatus: "hetzner_fallback_retained",
  ...extra,
});

const distinctManifest = (manifest: ManifestEntry[]) => {
  const seen = new Set<string>();
  const distinct: ManifestEntry[] = [];
  for (const entry of manifest) {
    const key = `${entry.sourceBucket}\n${entry.storageObjectKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(entry);
  }
  return distinct;
};

const selectEntry = (manifest: ManifestEntry[], payload: Record<string, unknown>) => {
  const tableName = toText(payload.table_name || payload.tableName);
  const rowId = toText(payload.row_id || payload.rowId);
  if (!tableName || !rowId) return null;
  return manifest.find((entry) => entry.tableName === tableName && entry.rowId === rowId) ?? null;
};

const headObject = async (config: S3Config, objectKey: string) => {
  const url = await createPresignedS3Url({
    method: "HEAD",
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    objectKey,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresSeconds: 60,
  });
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) return { ok: false, status: response.status, sizeBytes: null, etag: "", contentType: "" };
  const sizeText = response.headers.get("content-length");
  const parsedSize = sizeText ? Number.parseInt(sizeText, 10) : Number.NaN;
  return {
    ok: true,
    status: response.status,
    sizeBytes: Number.isFinite(parsedSize) ? parsedSize : null,
    etag: toText(response.headers.get("etag")).replaceAll('"', ""),
    contentType: toText(response.headers.get("content-type")) || "application/octet-stream",
  };
};

const copyObject = async (entry: ManifestEntry, sourceConfig: S3Config, targetConfig: S3Config): Promise<CopyResult> => {
  const targetValidation = validateR2Target(targetConfig.bucket, entry.targetObjectKey);
  if (!targetValidation.ok) throw new Error("unsafe_r2_target");
  if (entry.sourceBucket !== sourceConfig.bucket) throw new Error("invalid_source_bucket");
  if (targetConfig.bucket !== R2_ORIGIN_BUCKET) throw new Error("invalid_target_bucket");

  const sourceHead = await headObject(sourceConfig, entry.storageObjectKey);
  if (!sourceHead.ok) throw new Error("source_object_head_failed");

  const sourceUrl = await createPresignedS3Url({
    method: "GET",
    endpoint: sourceConfig.endpoint,
    region: sourceConfig.region,
    bucket: sourceConfig.bucket,
    objectKey: entry.storageObjectKey,
    accessKeyId: sourceConfig.accessKeyId,
    secretAccessKey: sourceConfig.secretAccessKey,
    expiresSeconds: 120,
  });
  const targetUrl = await createPresignedS3Url({
    method: "PUT",
    endpoint: targetConfig.endpoint,
    region: targetConfig.region,
    bucket: targetConfig.bucket,
    objectKey: entry.targetObjectKey,
    accessKeyId: targetConfig.accessKeyId,
    secretAccessKey: targetConfig.secretAccessKey,
    expiresSeconds: 120,
  });

  const sourceResponse = await fetch(sourceUrl);
  if (!sourceResponse.ok || !sourceResponse.body) throw new Error("source_object_download_failed");
  const uploadResponse = await fetch(targetUrl, {
    method: "PUT",
    body: sourceResponse.body,
    headers: {
      "Content-Type": sourceHead.contentType || sourceResponse.headers.get("content-type") || "application/octet-stream",
    },
  });
  if (!uploadResponse.ok) throw new Error("r2_origin_upload_failed");

  const targetHead = await headObject(targetConfig, entry.targetObjectKey);
  if (!targetHead.ok) throw new Error("r2_origin_readback_failed");
  const checksumComparable = !!sourceHead.etag && !!targetHead.etag && !sourceHead.etag.includes("-") && !targetHead.etag.includes("-");
  const checksumMatched = checksumComparable ? sourceHead.etag === targetHead.etag : null;
  const verified = sourceHead.sizeBytes !== null
    && targetHead.sizeBytes !== null
    && sourceHead.sizeBytes === targetHead.sizeBytes
    && (checksumMatched !== false);

  return {
    tableName: entry.tableName,
    rowId: entry.rowId,
    targetBucket: entry.targetBucket,
    targetObjectKey: entry.targetObjectKey,
    copied: true,
    verified,
    sourceSizeBytes: sourceHead.sizeBytes,
    targetSizeBytes: targetHead.sizeBytes,
    sourceEtagPresent: !!sourceHead.etag,
    targetEtagPresent: !!targetHead.etag,
    checksumComparable,
    checksumMatched,
  };
};

const dryRunPlan = (manifest: ManifestEntry[]) => {
  const blocked = manifest
    .map((entry) => ({ entry, validation: validateR2Target(entry.targetBucket, entry.targetObjectKey) }))
    .filter(({ validation }) => !validation.ok);
  return {
    safe: blocked.length === 0,
    blockedCount: blocked.length,
    redactedManifest: manifest.map((entry) => redactedManifestEntry(entry, {
      targetValidation: validateR2Target(entry.targetBucket, entry.targetObjectKey),
      copyStatus: "not_started",
      verifyStatus: "not_started",
      dbUpdateStatus: "blocked_until_copy_verified",
    })),
  };
};

const updateMetadataDryRun = (manifest: ManifestEntry[]) => ({
  ok: true,
  updateReady: false,
  reason: "metadata_update_requires_verified_copy_and_fresh_logical_backup",
  plannedRows: manifest.length,
  tables: Array.from(new Set(manifest.map((entry) => entry.tableName))).sort(),
  rollbackScope: "exact_row_ids_and_exact_r2_target_keys",
  hetznerFallbackRetained: true,
});

const zeroRefAudit = (references: InventoryReference[]) => {
  const summary = summarizeInventory(references);
  return {
    ok: summary.hetznerObjectStorageReferences === 0,
    remainingHetznerObjectStorageReferences: summary.hetznerObjectStorageReferences,
    hetznerObjectStorageShutdownReady: summary.hetznerObjectStorageReferences === 0,
    liveKitOutOfScope: true,
  };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  try {
    if (!(await authenticateMigrationOperator(req))) {
      return json(401, { ok: false, error: "media_object_migration_operator_token_required" });
    }

    const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object") return json(400, { ok: false, error: "invalid_body" });
    const action = normalizeAction(payload.action);
    if (!action) return json(400, { ok: false, error: "invalid_action" });

    const supabaseUrl = readEnv("SUPABASE_URL");
    const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return missingEnvResponse("supabase_service_authority_missing", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const references = await readInventoryReferences(adminClient);
    const manifest = buildManifest(references);
    const distinct = distinctManifest(manifest);
    const summary = summarizeInventory(references);

    if (action === "audit_inventory") {
      return json(200, {
        ok: true,
        action,
        summary,
        distinctObjectReferenceCount: distinct.length,
        redactedManifestCount: manifest.length,
        redactedDistinctManifestCount: distinct.length,
        redactedManifest: manifest.map((entry) => redactedManifestEntry(entry)),
        r2PrivateOriginBucket: R2_ORIGIN_BUCKET,
        hetznerFallbackRetained: true,
      });
    }

    if (action === "zero_ref_audit") {
      return json(200, {
        action,
        summary,
        ...zeroRefAudit(references),
      });
    }

    if (action === "update_metadata_dry_run") {
      return json(200, {
        action,
        ...updateMetadataDryRun(manifest),
      });
    }

    if (action === "rollback_metadata_batch") {
      return json(409, {
        ok: false,
        action,
        blocked: true,
        reason: "rollback_requires_explicit_verified_migration_manifest_and_owner_visible_scope",
        hetznerFallbackRetained: true,
      });
    }

    if (action === "update_metadata_batch") {
      if (toLowerText(readEnv("MEDIA_OBJECT_MIGRATION_DB_UPDATE_ENABLED")) !== "true") {
        return json(409, {
          ok: false,
          action,
          blocked: true,
          reason: "metadata_update_disabled_until_copy_verify_backup_and_restore_drill_pass",
          requiredEnvName: "MEDIA_OBJECT_MIGRATION_DB_UPDATE_ENABLED",
          hetznerFallbackRetained: true,
        });
      }
      return json(409, {
        ok: false,
        action,
        blocked: true,
        reason: "metadata_update_not_executed_without_persisted_verified_copy_manifest",
        hetznerFallbackRetained: true,
      });
    }

    const plan = dryRunPlan(distinct);
    if (!plan.safe) {
      return json(409, {
        ok: false,
        action,
        blocked: true,
        reason: "unsafe_r2_target_in_manifest",
        blockedCount: plan.blockedCount,
        redactedManifest: plan.redactedManifest,
        hetznerFallbackRetained: true,
      });
    }

    const sourceConfig = readLegacyS3Config();
    if (!sourceConfig.config) return missingEnvResponse("legacy_s3_read_config_missing", sourceConfig.missing);
    const targetConfig = readR2OriginConfig();
    if (!targetConfig.config) return missingEnvResponse("r2_origin_write_config_missing", targetConfig.missing);
    if (sourceConfig.config.bucket !== LEGACY_HETZNER_BUCKET) {
      return json(409, {
        ok: false,
        action,
        blocked: true,
        reason: "unexpected_legacy_s3_bucket",
        expectedBucket: LEGACY_HETZNER_BUCKET,
        actualBucketMatchesExpected: false,
        hetznerFallbackRetained: true,
      });
    }
    if (targetConfig.config.bucket !== R2_ORIGIN_BUCKET) {
      return json(409, {
        ok: false,
        action,
        blocked: true,
        reason: "unexpected_r2_origin_bucket",
        expectedBucket: R2_ORIGIN_BUCKET,
        actualBucketMatchesExpected: false,
        hetznerFallbackRetained: true,
      });
    }

    if (action === "copy_object" || action === "verify_object") {
      const entry = selectEntry(manifest, payload);
      if (!entry) return json(404, { ok: false, error: "manifest_entry_not_found" });
      if (action === "verify_object") {
        const targetHead = await headObject(targetConfig.config, entry.targetObjectKey);
        return json(targetHead.ok ? 200 : 404, {
          ok: targetHead.ok,
          action,
          entry: redactedManifestEntry(entry),
          targetExists: targetHead.ok,
          targetSizeBytes: targetHead.sizeBytes,
          targetEtagPresent: !!targetHead.etag,
        });
      }
      const result = await copyObject(entry, sourceConfig.config, targetConfig.config);
      return json(result.verified ? 200 : 409, {
        ok: result.verified,
        action,
        result: redactedManifestEntry(entry, {
          copied: result.copied,
          verified: result.verified,
          sourceSizeBytes: result.sourceSizeBytes,
          targetSizeBytes: result.targetSizeBytes,
          checksumComparable: result.checksumComparable,
          checksumMatched: result.checksumMatched,
        }),
        hetznerFallbackRetained: true,
      });
    }

    if (action === "copy_batch") {
      const requestedLimit = Number(payload.limit ?? DEFAULT_COPY_BATCH_LIMIT);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(MAX_COPY_BATCH_LIMIT, Math.max(1, Math.floor(requestedLimit)))
        : DEFAULT_COPY_BATCH_LIMIT;
      const selected = distinct.slice(0, limit);
      const results: CopyResult[] = [];
      for (const entry of selected) {
        const result = await copyObject(entry, sourceConfig.config, targetConfig.config);
        results.push(result);
        if (!result.verified) break;
      }
      const allVerified = results.length === selected.length && results.every((result) => result.verified);
      return json(allVerified ? 200 : 409, {
        ok: allVerified,
        action,
        selectedCount: selected.length,
        copiedCount: results.length,
        verifiedCount: results.filter((result) => result.verified).length,
        results: results.map((result) => ({
          tableName: result.tableName,
          rowId: result.rowId,
          targetBucket: result.targetBucket,
          targetObjectKey: result.targetObjectKey,
          copied: result.copied,
          verified: result.verified,
          sourceSizeBytes: result.sourceSizeBytes,
          targetSizeBytes: result.targetSizeBytes,
          checksumComparable: result.checksumComparable,
          checksumMatched: result.checksumMatched,
        })),
        dbUpdateReady: allVerified,
        hetznerFallbackRetained: true,
      });
    }

    return json(400, { ok: false, error: "unhandled_action" });
  } catch (error) {
    console.error("media-object-storage-migration failure", error instanceof Error ? error.message : "unknown_error");
    return json(500, {
      ok: false,
      error: "media_object_storage_migration_failed",
      hetznerFallbackRetained: true,
    });
  }
};

Deno.serve(handler);
