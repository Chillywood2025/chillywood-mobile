import { createClient } from "npm:@supabase/supabase-js@2";

type MigrationAction =
  | "audit_inventory"
  | "reconcile_objects"
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
  storageObjectKeyCandidates: string[];
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
  skipped: boolean;
  sourceStatus: ReconciliationStatus;
  skipReason: string;
  sourceSizeBytes: number | null;
  targetSizeBytes: number | null;
  sourceEtagPresent: boolean;
  targetEtagPresent: boolean;
  checksumComparable: boolean;
  checksumMatched: boolean | null;
};

type ReconciliationStatus =
  | "exists_exact"
  | "exists_normalized_key"
  | "exists_path_style"
  | "exists_alt_key"
  | "missing_404"
  | "permission_denied_403"
  | "bucket_missing"
  | "unsupported_provider"
  | "duplicate_ref"
  | "already_r2_equivalent_exists"
  | "unknown_error";

type ObjectKeyCandidateKind = "exact" | "normalized_key" | "alt_key";

type ObjectKeyCandidate = {
  objectKey: string;
  kind: ObjectKeyCandidateKind;
};

type HeadResult = {
  ok: boolean;
  status: number;
  sizeBytes: number | null;
  etag: string;
  contentType: string;
  forcePathStyle: boolean;
};

type ReconciliationResult = {
  entry: ManifestEntry;
  status: ReconciliationStatus;
  resolvedObjectKey: string;
  resolvedCandidateKind: ObjectKeyCandidateKind | "";
  sourceHead: HeadResult | null;
  targetExists: boolean;
  targetSizeBytes: number | null;
  targetEtagPresent: boolean;
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

const sanitizeFailureReason = (error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  const allowed = [
    "unsafe_r2_target",
    "invalid_source_bucket",
    "invalid_target_bucket",
    "source_object_head_failed",
    "source_object_download_failed",
    "r2_origin_upload_failed",
    "r2_origin_readback_failed",
    "inventory_videos_failed",
    "inventory_social_attachments_failed",
    "inventory_media_scan_jobs_failed",
    "inventory_video_renditions_failed",
    "inventory_media_renditions_failed",
  ];
  if (allowed.includes(message)) return message;
  if (/^(source_object_head_failed|source_object_download_failed|r2_origin_upload_failed|r2_origin_readback_failed)_[0-9]{3}$/u.test(message)) {
    return message;
  }
  return "media_object_storage_migration_failed";
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
    || action === "reconcile_objects"
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

const shouldIncludeEntries = (payload: Record<string, unknown>) => payload.include_entries === true;

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

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const normalizeObjectKeyValue = (value: string, bucket = LEGACY_HETZNER_BUCKET) => {
  const candidates = new Set<string>();
  const addCandidate = (candidate: string) => {
    const trimmed = toText(candidate).replace(/^\/+/u, "");
    if (!trimmed) return;
    candidates.add(trimmed);
    candidates.add(safeDecodeURIComponent(trimmed));
    for (const key of Array.from(candidates)) {
      const withBucketPrefix = `${bucket}/`;
      if (key.startsWith(withBucketPrefix)) candidates.add(key.slice(withBucketPrefix.length));
    }
  };

  if (isHttpUrl(value)) {
    try {
      const url = new URL(value);
      addCandidate(url.pathname);
    } catch {
      // Ignore unparsable URLs. The migration never returns or logs raw URL values.
    }
  } else {
    addCandidate(value);
  }

  return Array.from(candidates).filter(isSafeObjectKey);
};

const uniqueObjectKeys = (values: string[]) => Array.from(new Set(values.filter(isSafeObjectKey)));

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

const createS3ObjectUrl = (endpoint: string, bucket: string, objectKey: string, forcePathStyle = false) => {
  const endpointUrl = new URL(endpoint);
  const bucketPrefix = `${bucket}.`.toLowerCase();
  const endpointHost = endpointUrl.host.toLowerCase();
  const endpointHostIncludesBucket = endpointHost.startsWith(bucketPrefix);
  const host = forcePathStyle
    ? endpointHostIncludesBucket ? endpointUrl.host.slice(bucket.length + 1) : endpointUrl.host
    : endpointHostIncludesBucket ? endpointUrl.host : `${bucket}.${endpointUrl.host}`;
  const canonicalUri = forcePathStyle
    ? `/${encodeURIComponent(bucket)}/${encodeObjectKey(objectKey)}`
    : `/${encodeObjectKey(objectKey)}`;
  return {
    canonicalUri,
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
  forcePathStyle?: boolean;
}) => {
  const { amzDate, dateStamp } = formatAmzDates();
  const { canonicalUri, host, protocol } = createS3ObjectUrl(
    input.endpoint,
    input.bucket,
    input.objectKey,
    Boolean(input.forcePathStyle),
  );
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

const sourceObjectKeyFieldsFrom = (row: Record<string, unknown>) => [
  toText(row.storage_object_key),
  toText(row.storage_path),
  toText(row.manifest_path),
  toText(row.public_playback_path),
  toText(row.protected_playback_path),
].filter(Boolean);

const sourceObjectKeyCandidatesFrom = (row: Record<string, unknown>, bucket = LEGACY_HETZNER_BUCKET) => uniqueObjectKeys(
  sourceObjectKeyFieldsFrom(row).flatMap((value) => normalizeObjectKeyValue(value, bucket)),
);

const sourceObjectKeyFrom = (row: Record<string, unknown>) => sourceObjectKeyCandidatesFrom(row)[0] ?? "";

const fromRow = (tableName: string, row: Record<string, unknown>, overrides: Partial<InventoryReference> = {}): InventoryReference => {
  const storageBucket = toText(overrides.storageBucket) || toText(row.storage_bucket);
  const rowCandidates = sourceObjectKeyCandidatesFrom(row, storageBucket || LEGACY_HETZNER_BUCKET);
  const storageObjectKey = toText(overrides.storageObjectKey) || rowCandidates[0] || sourceObjectKeyFrom(row);
  const storageObjectKeyCandidates = uniqueObjectKeys([
    storageObjectKey,
    ...rowCandidates,
    ...(overrides.storageObjectKeyCandidates ?? []),
  ]);
  return {
    tableName,
    rowId: toText(row.id),
    sourceType: toText(overrides.sourceType) || toText(row.source_type) || tableName,
    sourceId: toText(overrides.sourceId) || toText(row.source_id) || toText(row.video_id) || toText(row.target_id) || toText(row.id),
    storageProvider: toText(overrides.storageProvider) || toText(row.storage_provider),
    storageBucket,
    storageObjectKey,
    storageObjectKeyCandidates,
    visibility: toText(overrides.visibility) || toText(row.visibility) || tableName,
    accessTier: toText(overrides.accessTier) || toText(row.access_tier) || (toLowerText(row.visibility) === "premium" ? "premium" : "free"),
    scanStatus: toText(overrides.scanStatus) || toText(row.scan_status) || toText(row.status),
    moderationStatus: toText(overrides.moderationStatus) || toText(row.moderation_status) || toText(row.status),
    isOriginal: Boolean(overrides.isOriginal ?? (toLowerText(row.quality_label) === "original")),
    liveKitRelated: Boolean(overrides.liveKitRelated) || isLiveKitReference(row.storage_bucket) || isLiveKitReference(row.storage_path),
  };
};

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
  sourceObjectKeyCandidateCount: entry.storageObjectKeyCandidates.length || (entry.sourceObjectKeyPresent ? 1 : 0),
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

const headObject = async (config: S3Config, objectKey: string, forcePathStyle = false) => {
  const url = await createPresignedS3Url({
    method: "HEAD",
    endpoint: config.endpoint,
    region: config.region,
    bucket: config.bucket,
    objectKey,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresSeconds: 60,
    forcePathStyle,
  });
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) return { ok: false, status: response.status, sizeBytes: null, etag: "", contentType: "", forcePathStyle };
  const sizeText = response.headers.get("content-length");
  const parsedSize = sizeText ? Number.parseInt(sizeText, 10) : Number.NaN;
  return {
    ok: true,
    status: response.status,
    sizeBytes: Number.isFinite(parsedSize) ? parsedSize : null,
    etag: toText(response.headers.get("etag")).replaceAll('"', ""),
    contentType: toText(response.headers.get("content-type")) || "application/octet-stream",
    forcePathStyle,
  };
};

const headSourceObject = async (config: S3Config, objectKey: string) => {
  let last = await headObject(config, objectKey, false);
  if (last.ok) return last;
  last = await headObject(config, objectKey, true);
  return last;
};

const objectKeyCandidatesForEntry = (entry: ManifestEntry): ObjectKeyCandidate[] => {
  const candidates: ObjectKeyCandidate[] = [];
  const seen = new Set<string>();
  const add = (objectKey: string, kind: ObjectKeyCandidateKind) => {
    for (const candidate of normalizeObjectKeyValue(objectKey, entry.sourceBucket || LEGACY_HETZNER_BUCKET)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      candidates.push({ objectKey: candidate, kind });
    }
  };

  add(entry.storageObjectKey, "exact");
  for (const candidate of entry.storageObjectKeyCandidates) {
    add(candidate, candidate === entry.storageObjectKey ? "exact" : "alt_key");
  }
  for (const candidate of Array.from(seen)) {
    const normalized = normalizeObjectKeyValue(candidate, entry.sourceBucket || LEGACY_HETZNER_BUCKET);
    for (const normalizedCandidate of normalized) {
      if (seen.has(normalizedCandidate)) continue;
      seen.add(normalizedCandidate);
      candidates.push({ objectKey: normalizedCandidate, kind: "normalized_key" });
    }
  }
  return candidates;
};

const statusForResolvedCandidate = (candidate: ObjectKeyCandidate, head: HeadResult): ReconciliationStatus => {
  if (candidate.kind === "exact" && head.forcePathStyle) return "exists_path_style";
  if (candidate.kind === "exact") return "exists_exact";
  if (candidate.kind === "normalized_key") return "exists_normalized_key";
  return "exists_alt_key";
};

const isExistingSourceStatus = (status: ReconciliationStatus) => (
  status === "exists_exact"
  || status === "exists_normalized_key"
  || status === "exists_path_style"
  || status === "exists_alt_key"
);

const reconcileObject = async (
  entry: ManifestEntry,
  sourceConfig: S3Config,
  targetConfig: S3Config,
): Promise<ReconciliationResult> => {
  if (normalizeProvider(entry.storageProvider) !== "hetzner_s3") {
    return {
      entry,
      status: "unsupported_provider",
      resolvedObjectKey: "",
      resolvedCandidateKind: "",
      sourceHead: null,
      targetExists: false,
      targetSizeBytes: null,
      targetEtagPresent: false,
    };
  }
  if (entry.sourceBucket !== sourceConfig.bucket) {
    return {
      entry,
      status: "bucket_missing",
      resolvedObjectKey: "",
      resolvedCandidateKind: "",
      sourceHead: null,
      targetExists: false,
      targetSizeBytes: null,
      targetEtagPresent: false,
    };
  }

  let saw404 = false;
  let sawUnknown = false;
  for (const candidate of objectKeyCandidatesForEntry(entry)) {
    const virtualHostHead = await headObject(sourceConfig, candidate.objectKey, false);
    if (virtualHostHead.ok) {
      return {
        entry,
        status: statusForResolvedCandidate(candidate, virtualHostHead),
        resolvedObjectKey: candidate.objectKey,
        resolvedCandidateKind: candidate.kind,
        sourceHead: virtualHostHead,
        targetExists: false,
        targetSizeBytes: null,
        targetEtagPresent: false,
      };
    }
    if (virtualHostHead.status === 403) {
      return {
        entry,
        status: "permission_denied_403",
        resolvedObjectKey: candidate.objectKey,
        resolvedCandidateKind: candidate.kind,
        sourceHead: virtualHostHead,
        targetExists: false,
        targetSizeBytes: null,
        targetEtagPresent: false,
      };
    }
    saw404 ||= virtualHostHead.status === 404;
    sawUnknown ||= virtualHostHead.status !== 404;

    const pathStyleHead = await headObject(sourceConfig, candidate.objectKey, true);
    if (pathStyleHead.ok) {
      return {
        entry,
        status: statusForResolvedCandidate(candidate, pathStyleHead),
        resolvedObjectKey: candidate.objectKey,
        resolvedCandidateKind: candidate.kind,
        sourceHead: pathStyleHead,
        targetExists: false,
        targetSizeBytes: null,
        targetEtagPresent: false,
      };
    }
    if (pathStyleHead.status === 403) {
      return {
        entry,
        status: "permission_denied_403",
        resolvedObjectKey: candidate.objectKey,
        resolvedCandidateKind: candidate.kind,
        sourceHead: pathStyleHead,
        targetExists: false,
        targetSizeBytes: null,
        targetEtagPresent: false,
      };
    }
    saw404 ||= pathStyleHead.status === 404;
    sawUnknown ||= pathStyleHead.status !== 404;
  }

  const targetHead = await headObject(targetConfig, entry.targetObjectKey);
  if (targetHead.ok) {
    return {
      entry,
      status: "already_r2_equivalent_exists",
      resolvedObjectKey: "",
      resolvedCandidateKind: "",
      sourceHead: null,
      targetExists: true,
      targetSizeBytes: targetHead.sizeBytes,
      targetEtagPresent: !!targetHead.etag,
    };
  }

  return {
    entry,
    status: saw404 && !sawUnknown ? "missing_404" : "unknown_error",
    resolvedObjectKey: "",
    resolvedCandidateKind: "",
    sourceHead: null,
    targetExists: false,
    targetSizeBytes: null,
    targetEtagPresent: false,
  };
};

const redactedReconciliationEntry = (result: ReconciliationResult) => redactedManifestEntry(result.entry, {
  reconciliationStatus: result.status,
  resolvedObjectKeyRedacted: !!result.resolvedObjectKey,
  resolvedCandidateKind: result.resolvedCandidateKind || null,
  sourceSizeBytes: result.sourceHead?.sizeBytes ?? null,
  sourceEtagPresent: !!result.sourceHead?.etag,
  targetExists: result.targetExists,
  targetSizeBytes: result.targetSizeBytes,
  targetEtagPresent: result.targetEtagPresent,
});

const summarizeReconciliation = (results: ReconciliationResult[], duplicateCount: number) => {
  const byStatus = results.reduce<Record<string, number>>((summary, result) => {
    summary[result.status] = (summary[result.status] ?? 0) + 1;
    return summary;
  }, {});
  const existsCount = results.filter((result) => isExistingSourceStatus(result.status)).length;
  return {
    totalDistinctRefs: results.length,
    existsCount,
    missingCount: byStatus.missing_404 ?? 0,
    permissionDeniedCount: byStatus.permission_denied_403 ?? 0,
    duplicateCount,
    unknownCount: byStatus.unknown_error ?? 0,
    alreadyR2EquivalentCount: byStatus.already_r2_equivalent_exists ?? 0,
    byStatus,
  };
};

const reconcileObjects = async (
  entries: ManifestEntry[],
  sourceConfig: S3Config,
  targetConfig: S3Config,
) => {
  const results: ReconciliationResult[] = [];
  for (const entry of entries) {
    results.push(await reconcileObject(entry, sourceConfig, targetConfig));
  }
  return results;
};

const copyObject = async (
  entry: ManifestEntry,
  sourceConfig: S3Config,
  targetConfig: S3Config,
  reconciled?: ReconciliationResult,
): Promise<CopyResult> => {
  const targetValidation = validateR2Target(targetConfig.bucket, entry.targetObjectKey);
  if (!targetValidation.ok) throw new Error("unsafe_r2_target");
  if (entry.sourceBucket !== sourceConfig.bucket) throw new Error("invalid_source_bucket");
  if (targetConfig.bucket !== R2_ORIGIN_BUCKET) throw new Error("invalid_target_bucket");

  const reconciliation = reconciled ?? await reconcileObject(entry, sourceConfig, targetConfig);
  if (!isExistingSourceStatus(reconciliation.status) || !reconciliation.sourceHead || !reconciliation.resolvedObjectKey) {
    return {
      tableName: entry.tableName,
      rowId: entry.rowId,
      targetBucket: entry.targetBucket,
      targetObjectKey: entry.targetObjectKey,
      copied: false,
      verified: false,
      skipped: true,
      sourceStatus: reconciliation.status,
      skipReason: reconciliation.status,
      sourceSizeBytes: null,
      targetSizeBytes: reconciliation.targetSizeBytes,
      sourceEtagPresent: false,
      targetEtagPresent: reconciliation.targetEtagPresent,
      checksumComparable: false,
      checksumMatched: null,
    };
  }

  const sourceHead = reconciliation.sourceHead;

  const sourceUrl = await createPresignedS3Url({
    method: "GET",
    endpoint: sourceConfig.endpoint,
    region: sourceConfig.region,
    bucket: sourceConfig.bucket,
    objectKey: reconciliation.resolvedObjectKey,
    accessKeyId: sourceConfig.accessKeyId,
    secretAccessKey: sourceConfig.secretAccessKey,
    expiresSeconds: 120,
    forcePathStyle: sourceHead.forcePathStyle,
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
  if (!sourceResponse.ok || !sourceResponse.body) throw new Error(`source_object_download_failed_${sourceResponse.status}`);
  const uploadResponse = await fetch(targetUrl, {
    method: "PUT",
    body: sourceResponse.body,
    headers: {
      "Content-Type": sourceHead.contentType || sourceResponse.headers.get("content-type") || "application/octet-stream",
    },
  });
  if (!uploadResponse.ok) throw new Error(`r2_origin_upload_failed_${uploadResponse.status}`);

  const targetHead = await headObject(targetConfig, entry.targetObjectKey);
  if (!targetHead.ok) throw new Error(`r2_origin_readback_failed_${targetHead.status}`);
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
    skipped: false,
    sourceStatus: reconciliation.status,
    skipReason: "",
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

const migrationSourceKey = (entry: ManifestEntry) => `${entry.sourceBucket}\n${entry.storageObjectKey}`;

const verifyCopiedEntry = async (
  reconciliation: ReconciliationResult,
  targetConfig: S3Config,
) => {
  if (!isExistingSourceStatus(reconciliation.status) || !reconciliation.sourceHead) return false;
  const targetHead = await headObject(targetConfig, reconciliation.entry.targetObjectKey);
  if (!targetHead.ok) return false;
  const checksumComparable = !!reconciliation.sourceHead.etag
    && !!targetHead.etag
    && !reconciliation.sourceHead.etag.includes("-")
    && !targetHead.etag.includes("-");
  const checksumMatched = checksumComparable ? reconciliation.sourceHead.etag === targetHead.etag : null;
  return reconciliation.sourceHead.sizeBytes !== null
    && targetHead.sizeBytes !== null
    && reconciliation.sourceHead.sizeBytes === targetHead.sizeBytes
    && checksumMatched !== false;
};

const updateCopiedMetadataBatch = async (input: {
  adminClient: SupabaseClient;
  manifest: ManifestEntry[];
  reconciliation: ReconciliationResult[];
  targetConfig: S3Config;
}) => {
  const verifiedSourceKeys = new Set<string>();
  for (const result of input.reconciliation) {
    if (await verifyCopiedEntry(result, input.targetConfig)) {
      verifiedSourceKeys.add(migrationSourceKey(result.entry));
    }
  }

  const rowsToUpdate = input.manifest.filter((entry) => verifiedSourceKeys.has(migrationSourceKey(entry)));
  if (rowsToUpdate.length === 0) {
    return {
      ok: false,
      blocked: true,
      reason: "no_verified_copied_rows_for_metadata_update",
      updatedRows: 0,
      skippedRows: input.manifest.length,
    };
  }

  const batchId = `media-object-storage-r2-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const updates = rowsToUpdate.map((entry) => ({
    migration_id: entry.migrationId,
    table_name: entry.tableName,
    row_id: entry.rowId,
    source_type: entry.sourceType,
    source_id: entry.sourceId,
    target_bucket: entry.targetBucket,
    target_object_key: entry.targetObjectKey,
  }));
  const { data, error } = await input.adminClient.rpc("media_object_storage_migrate_verified_rows", {
    p_batch_id: batchId,
    p_updates: updates,
  });
  if (error) {
    return {
      ok: false,
      blocked: true,
      reason: "metadata_update_rpc_failed",
      errorCode: error.code ?? "unknown",
      updatedRows: 0,
      skippedRows: input.manifest.length,
    };
  }
  const updatedRows = Number(data?.updated_rows ?? 0);
  return {
    ok: true,
    batchId,
    updatedRows,
    skippedRows: input.manifest.length - updatedRows,
    updated: updates.map((row) => ({
      tableName: row.table_name,
      rowId: row.row_id,
      targetBucket: row.target_bucket,
      targetObjectKey: row.target_object_key,
    })),
  };
};

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

    if (action === "reconcile_objects") {
      const reconciliation = await reconcileObjects(distinct, sourceConfig.config, targetConfig.config);
      const reconciliationSummary = summarizeReconciliation(reconciliation, Math.max(0, manifest.length - distinct.length));
      const includeEntries = shouldIncludeEntries(payload);
      return json(reconciliationSummary.permissionDeniedCount > 0 ? 409 : 200, {
        ok: reconciliationSummary.permissionDeniedCount === 0,
        action,
        summary,
        reconciliation: reconciliationSummary,
        redactedReconciliation: includeEntries ? reconciliation.map(redactedReconciliationEntry) : undefined,
        redactedReconciliationCount: reconciliation.length,
        entriesOmittedByDefault: !includeEntries,
        hetznerFallbackRetained: true,
      });
    }

    if (action === "update_metadata_batch") {
      const reconciliation = await reconcileObjects(distinct, sourceConfig.config, targetConfig.config);
      const reconciliationSummary = summarizeReconciliation(reconciliation, Math.max(0, manifest.length - distinct.length));
      const includeEntries = shouldIncludeEntries(payload);
      if (reconciliationSummary.permissionDeniedCount > 0) {
        return json(409, {
          ok: false,
          action,
          blocked: true,
          reason: "permission_denied_403",
          reconciliation: reconciliationSummary,
          redactedReconciliation: includeEntries ? reconciliation.map(redactedReconciliationEntry) : undefined,
          redactedReconciliationCount: reconciliation.length,
          entriesOmittedByDefault: !includeEntries,
          hetznerFallbackRetained: true,
        });
      }
      const updateResult = await updateCopiedMetadataBatch({
        adminClient,
        manifest,
        reconciliation,
        targetConfig: targetConfig.config,
      });
      return json(updateResult.ok ? 200 : 409, {
        action,
        ...updateResult,
        reconciliation: reconciliationSummary,
        redactedReconciliation: includeEntries ? reconciliation.map(redactedReconciliationEntry) : undefined,
        redactedReconciliationCount: reconciliation.length,
        entriesOmittedByDefault: !includeEntries,
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
          skipped: result.skipped,
          sourceStatus: result.sourceStatus,
          skipReason: result.skipReason || null,
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
      const reconciliation = await reconcileObjects(selected, sourceConfig.config, targetConfig.config);
      const reconciliationSummary = summarizeReconciliation(reconciliation, Math.max(0, manifest.length - distinct.length));
      const includeEntries = shouldIncludeEntries(payload);
      if (reconciliationSummary.permissionDeniedCount > 0) {
        return json(409, {
          ok: false,
          action,
          blocked: true,
          reason: "permission_denied_403",
          selectedCount: selected.length,
          reconciliation: reconciliationSummary,
          redactedReconciliation: includeEntries ? reconciliation.map(redactedReconciliationEntry) : undefined,
          redactedReconciliationCount: reconciliation.length,
          entriesOmittedByDefault: !includeEntries,
          dbUpdateReady: false,
          hetznerFallbackRetained: true,
        });
      }
      const results: CopyResult[] = [];
      for (const reconciled of reconciliation) {
        if (!isExistingSourceStatus(reconciled.status)) {
          results.push(await copyObject(reconciled.entry, sourceConfig.config, targetConfig.config, reconciled));
          continue;
        }
        try {
          results.push(await copyObject(reconciled.entry, sourceConfig.config, targetConfig.config, reconciled));
        } catch (error) {
          const failureReason = sanitizeFailureReason(error);
          if (
            failureReason.includes("_403")
            || failureReason.startsWith("r2_origin_")
            || failureReason === "unsafe_r2_target"
            || failureReason === "invalid_source_bucket"
            || failureReason === "invalid_target_bucket"
          ) {
            return json(409, {
              ok: false,
              action,
              blocked: true,
              reason: failureReason,
              selectedCount: selected.length,
              reconciliation: reconciliationSummary,
              redactedReconciliation: includeEntries ? reconciliation.map(redactedReconciliationEntry) : undefined,
              redactedReconciliationCount: reconciliation.length,
              entriesOmittedByDefault: !includeEntries,
              dbUpdateReady: false,
              hetznerFallbackRetained: true,
            });
          }
          results.push({
            tableName: reconciled.entry.tableName,
            rowId: reconciled.entry.rowId,
            targetBucket: reconciled.entry.targetBucket,
            targetObjectKey: reconciled.entry.targetObjectKey,
            copied: false,
            verified: false,
            skipped: true,
            sourceStatus: reconciled.status,
            skipReason: failureReason,
            sourceSizeBytes: reconciled.sourceHead?.sizeBytes ?? null,
            targetSizeBytes: null,
            sourceEtagPresent: !!reconciled.sourceHead?.etag,
            targetEtagPresent: false,
            checksumComparable: false,
            checksumMatched: null,
          });
        }
      }
      const copiedResults = results.filter((result) => result.copied);
      const verifiedResults = results.filter((result) => result.verified);
      const skippedResults = results.filter((result) => result.skipped);
      const copyFailures = results.filter((result) => result.copied && !result.verified);
      const allCopyableVerified = copiedResults.length === reconciliationSummary.existsCount && copyFailures.length === 0;
      return json(200, {
        ok: allCopyableVerified && skippedResults.length === 0,
        partial: skippedResults.length > 0 || !allCopyableVerified,
        action,
        selectedCount: selected.length,
        copiedCount: copiedResults.length,
        verifiedCount: verifiedResults.length,
        skippedCount: skippedResults.length,
        copyFailedCount: copyFailures.length,
        reconciliation: reconciliationSummary,
        redactedReconciliation: includeEntries ? reconciliation.map(redactedReconciliationEntry) : undefined,
        redactedReconciliationCount: reconciliation.length,
        entriesOmittedByDefault: !includeEntries,
        results: includeEntries ? results.map((result) => ({
          tableName: result.tableName,
          rowId: result.rowId,
          targetBucket: result.targetBucket,
          targetObjectKey: result.targetObjectKey,
          copied: result.copied,
          verified: result.verified,
          skipped: result.skipped,
          sourceStatus: result.sourceStatus,
          skipReason: result.skipReason || null,
          sourceSizeBytes: result.sourceSizeBytes,
          targetSizeBytes: result.targetSizeBytes,
          checksumComparable: result.checksumComparable,
          checksumMatched: result.checksumMatched,
        })) : undefined,
        resultCount: results.length,
        dbUpdateReady: allCopyableVerified && copiedResults.length > 0,
        hetznerFallbackRetained: true,
      });
    }

    return json(400, { ok: false, error: "unhandled_action" });
  } catch (error) {
    const failureReason = sanitizeFailureReason(error);
    console.error("media-object-storage-migration failure", failureReason);
    return json(500, {
      ok: false,
      error: "media_object_storage_migration_failed",
      failureReason,
      hetznerFallbackRetained: true,
    });
  }
};

Deno.serve(handler);
