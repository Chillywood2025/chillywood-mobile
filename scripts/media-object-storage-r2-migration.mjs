#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "true"];
}));

const mode = args.get("mode") || "status";
const source = args.get("source") || "fixture";

const R2_ORIGIN_BUCKET = "chillywood-media-origin";
const LEGACY_HETZNER_BUCKET = "chillywood-media-prod";
const expectedProjectRef = "bmkkhihfbmsnnmcqkoly";
const defaultFunctionsUrl = `https://${expectedProjectRef}.supabase.co/functions/v1`;
const migrationFunctionUrl = `${String(process.env.MEDIA_OBJECT_MIGRATION_FUNCTIONS_URL || defaultFunctionsUrl).replace(/\/+$/g, "")}/media-object-storage-migration`;

const fixtureRows = [
  { table_name: "videos", row_id: "public-video", source_type: "creator_video", source_id: "public-video", storage_provider: "s3", storage_bucket: LEGACY_HETZNER_BUCKET, object_key_present: true, visibility: "public", access_tier: "free", scan_status: "clean", moderation_status: "clean", is_original: false },
  { table_name: "videos", row_id: "private-video", source_type: "creator_video", source_id: "private-video", storage_provider: "s3", storage_bucket: LEGACY_HETZNER_BUCKET, object_key_present: true, visibility: "private", access_tier: "free", scan_status: "clean", moderation_status: "clean", is_original: false },
  { table_name: "media_renditions", row_id: "r2-public", source_type: "creator_video", source_id: "r2-public", storage_provider: "cloudflare_r2", storage_bucket: "chillywood-media-public-playback-proof", object_key_present: true, visibility: "public", access_tier: "free", scan_status: "clean", moderation_status: "allowed", is_original: false },
  { table_name: "livekit_servers", row_id: "livekit", source_type: "livekit", source_id: "chillywood-prod-01", storage_provider: "hetzner_livekit", storage_bucket: "", object_key_present: false, visibility: "n/a", access_tier: "n/a", scan_status: "n/a", moderation_status: "n/a", is_original: false, livekit_related: true },
];

const inventorySql = `
with object_refs as (
  select
    'videos'::text as table_name,
    id::text as row_id,
    'creator_video'::text as source_type,
    id::text as source_id,
    coalesce(storage_provider, '')::text as storage_provider,
    coalesce(storage_bucket, '')::text as storage_bucket,
    coalesce(storage_object_key, storage_path, '')::text as object_key,
    coalesce(visibility, '')::text as visibility,
    case when coalesce(visibility, '') = 'premium' then 'premium' else 'free' end::text as access_tier,
    coalesce(scan_status, '')::text as scan_status,
    coalesce(moderation_status, '')::text as moderation_status,
    false as is_original,
    false as livekit_related
  from public.videos
  where storage_provider in ('s3', 'hetzner_s3') or storage_bucket = '${LEGACY_HETZNER_BUCKET}'
  union all
  select
    'social_attachments',
    id::text,
    'social_attachment',
    id::text,
    coalesce(storage_provider, '')::text,
    coalesce(storage_bucket, '')::text,
    coalesce(storage_object_key, storage_path, '')::text,
    'attachment',
    'free',
    coalesce(scan_status, '')::text,
    coalesce(moderation_status, '')::text,
    false,
    false
  from public.social_attachments
  where storage_provider in ('s3', 'hetzner_s3') or storage_bucket = '${LEGACY_HETZNER_BUCKET}'
  union all
  select
    'media_scan_jobs',
    id::text,
    coalesce(target_table, 'media_scan_job')::text,
    coalesce(target_id::text, id::text),
    coalesce(storage_provider, '')::text,
    coalesce(storage_bucket, '')::text,
    coalesce(storage_object_key, '')::text,
    'scan_job',
    'unknown',
    coalesce(status, '')::text,
    'unknown',
    false,
    false
  from public.media_scan_jobs
  where storage_provider in ('s3', 'hetzner_s3') or storage_bucket = '${LEGACY_HETZNER_BUCKET}'
  union all
  select
    'video_renditions',
    id::text,
    'creator_video',
    video_id::text,
    's3',
    coalesce(storage_bucket, '')::text,
    coalesce(storage_path, manifest_path, '')::text,
    'rendition',
    coalesce(access_tier, '')::text,
    coalesce(scan_status, '')::text,
    coalesce(status, '')::text,
    coalesce(quality_label, '') = 'original',
    false
  from public.video_renditions
  where storage_bucket = '${LEGACY_HETZNER_BUCKET}'
  union all
  select
    'media_renditions',
    id::text,
    coalesce(source_type, 'creator_video')::text,
    source_id::text,
    coalesce(storage_provider, '')::text,
    coalesce(storage_bucket, '')::text,
    coalesce(storage_path, manifest_path, public_playback_path, protected_playback_path, '')::text,
    coalesce(visibility, '')::text,
    coalesce(visibility, '')::text,
    coalesce(scan_status, '')::text,
    coalesce(moderation_status, '')::text,
    coalesce(is_original, false),
    false
  from public.media_renditions
  where storage_provider in ('s3', 'hetzner_s3') or storage_bucket = '${LEGACY_HETZNER_BUCKET}'
)
select
  table_name,
  row_id,
  source_type,
  source_id,
  storage_provider,
  storage_bucket,
  object_key <> '' as object_key_present,
  visibility,
  access_tier,
  scan_status,
  moderation_status,
  is_original,
  livekit_related
from object_refs
order by table_name, row_id;
`;

const countsSql = `
with storage_counts as (
  select 'videos'::text table_name, coalesce(storage_provider, 'unknown')::text storage_provider, coalesce(storage_bucket, '')::text storage_bucket, count(*)::int total
  from public.videos
  group by 1,2,3
  union all
  select 'social_attachments', coalesce(storage_provider, 'unknown')::text, coalesce(storage_bucket, '')::text, count(*)::int
  from public.social_attachments
  group by 1,2,3
  union all
  select 'media_scan_jobs', coalesce(storage_provider, 'unknown')::text, coalesce(storage_bucket, '')::text, count(*)::int
  from public.media_scan_jobs
  group by 1,2,3
  union all
  select 'video_renditions', 'legacy_video_renditions', coalesce(storage_bucket, '')::text, count(*)::int
  from public.video_renditions
  group by 1,2,3
  union all
  select 'media_renditions', coalesce(storage_provider, 'unknown')::text, coalesce(storage_bucket, '')::text, count(*)::int
  from public.media_renditions
  group by 1,2,3
)
select * from storage_counts order by table_name, storage_provider, storage_bucket;
`;

const parseSupabaseJson = (output) => {
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Supabase CLI did not return JSON.");
  return JSON.parse(output.slice(start));
};

const assertNoSecretLikeText = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (
    /postgres(?:ql)?:\/\//i.test(text)
    || new RegExp(`X-Amz-${"Signature"}=`, "i").test(text)
    || /\bBearer\s+[A-Za-z0-9._-]+/i.test(text)
    || /https?:\/\/(?!bmkkhihfbmsnnmcqkoly\.supabase\.co\b|media\.chillywoodstream\.com\b|premium-media\.chillywoodstream\.com\b)[^\s"']+/i.test(text)
  ) {
    throw new Error("secret_or_private_url_like_value_refused");
  }
};

const readMigrationOperatorTokenFromLocalSecretFile = () => {
  const configuredPath = String(process.env.MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_FILE || "").trim();
  const candidates = configuredPath ? [configuredPath] : [".env.media-object-migration.local", ".env.local"];
  for (const path of candidates) {
    try {
      const content = readFileSync(path, "utf8");
      const match = content.match(/^MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN=(.+)$/m);
      if (match?.[1]) return match[1].trim();
    } catch {
      // Missing local secret files are expected on most machines.
    }
  }
  return "";
};

const assertMigrationOperatorToken = () => {
  const token = String(process.env.MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN || readMigrationOperatorTokenFromLocalSecretFile() || "").trim();
  if (!token) {
    console.error(JSON.stringify({
      ok: false,
      blocked: true,
      reason: "media_object_migration_operator_token_missing",
      missingCredential: "MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN",
      acceptedSources: ["MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN", "MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_FILE", "existing_untracked_local_secret_file"],
      rawServiceRoleRequired: false,
      rawStorageCredentialsRequired: false,
      objectKeysRedacted: true,
      secretsPrinted: false,
    }, null, 2));
    process.exit(1);
  }
  assertNoSecretLikeText({ tokenRedacted: "[REDACTED_MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN]" });
  return token;
};

const invokeMigrationFunction = async (action, payload = {}) => {
  const token = assertMigrationOperatorToken();
  const response = await fetch(migrationFunctionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-media-object-migration-token": token,
    },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(120000),
  });
  const bodyText = await response.text();
  assertNoSecretLikeText(bodyText);
  let body;
  try {
    body = JSON.parse(bodyText || "{}");
  } catch {
    body = { ok: false, responseNotJson: true };
  }
  return { status: response.status, ok: response.ok, body };
};

const handleBackendMode = async () => {
  const actionByMode = {
    status: "audit_inventory",
    inventory: "audit_inventory",
    "dry-run": "update_metadata_dry_run",
    copy: "copy_batch",
    run: "copy_batch",
    "db-update": "update_metadata_batch",
    verify: "verify_object",
    "zero-hetzner": "zero_ref_audit",
  };
  const action = actionByMode[mode];
  if (!action) {
    console.error(JSON.stringify({ ok: false, reason: "unsupported_backend_mode", mode, objectKeysRedacted: true, secretsPrinted: false }, null, 2));
    process.exit(1);
  }
  const limit = Number.parseInt(String(args.get("limit") || process.env.MEDIA_OBJECT_MIGRATION_BATCH_LIMIT || "100"), 10);
  const result = await invokeMigrationFunction(action, {
    limit: Number.isFinite(limit) ? limit : 100,
    table_name: args.get("table") || args.get("table_name"),
    row_id: args.get("row") || args.get("row_id"),
  });
  console.log(JSON.stringify({
    backendFunction: "media-object-storage-migration",
    httpStatus: result.status,
    ...result.body,
  }, null, 2));
  process.exit(result.ok && result.body?.ok !== false ? 0 : 1);
};

const queryLinkedRows = (sql) => {
  const output = execFileSync("npx", ["supabase", "db", "query", "--linked", "--output-format", "json", sql], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return parseSupabaseJson(output).rows ?? [];
};

const normalizeProvider = (value) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "s3" || text === "hetzner" || text === "hetzner_s3") return "hetzner_s3";
  if (text === "cloudflare_r2" || text === "r2") return "cloudflare_r2";
  if (text === "supabase" || text === "supabase_storage") return "supabase_storage";
  return "unknown";
};

const isHetznerObjectRef = (row) => {
  if (row.livekit_related) return false;
  return normalizeProvider(row.storage_provider) === "hetzner_s3" || row.storage_bucket === LEGACY_HETZNER_BUCKET;
};

const summarize = (rows) => rows.reduce((summary, row) => {
  const provider = normalizeProvider(row.storage_provider);
  const hetzner = isHetznerObjectRef(row);
  return {
    totalReferences: summary.totalReferences + 1,
    hetznerObjectStorageReferences: summary.hetznerObjectStorageReferences + (hetzner ? 1 : 0),
    r2References: summary.r2References + (provider === "cloudflare_r2" ? 1 : 0),
    supabaseStorageReferences: summary.supabaseStorageReferences + (provider === "supabase_storage" ? 1 : 0),
    migrationCandidates: summary.migrationCandidates + (hetzner ? 1 : 0),
    blockedOrUnknownReferences: summary.blockedOrUnknownReferences + (provider === "unknown" ? 1 : 0),
    liveKitReferences: summary.liveKitReferences + (row.livekit_related ? 1 : 0),
  };
}, {
  totalReferences: 0,
  hetznerObjectStorageReferences: 0,
  r2References: 0,
  supabaseStorageReferences: 0,
  migrationCandidates: 0,
  blockedOrUnknownReferences: 0,
  liveKitReferences: 0,
});

const targetKeyFor = (row) => {
  const tableName = String(row.table_name ?? "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const sourceType = String(row.source_type ?? row.table_name ?? "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const sourceId = String(row.source_id ?? row.row_id ?? "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const rowId = String(row.row_id ?? "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const prefix = row.is_original ? "originals" : "source";
  return `${prefix}/${tableName}/${sourceType}/${sourceId}/${rowId}`;
};

const buildRedactedManifest = (rows) => rows.filter(isHetznerObjectRef).map((row) => ({
  migrationId: "media-object-storage-r2-20260710",
  tableName: row.table_name,
  rowId: row.row_id,
  sourceType: row.source_type,
  sourceId: row.source_id,
  sourceProvider: "hetzner_s3",
  sourceBucket: row.storage_bucket || LEGACY_HETZNER_BUCKET,
  sourceObjectKeyRedacted: true,
  sourceObjectKeyPresent: !!row.object_key_present,
  targetProvider: "cloudflare_r2",
  targetBucket: R2_ORIGIN_BUCKET,
  targetObjectKey: targetKeyFor(row),
  visibility: row.visibility || "unknown",
  accessTier: row.access_tier || "unknown",
  scanStatus: row.scan_status || "unknown",
  moderationStatus: row.moderation_status || "unknown",
  isOriginal: !!row.is_original,
  copyStatus: "not_started",
  verifyStatus: "not_started",
  dbUpdateStatus: "blocked_until_copy_verified",
  rollbackStatus: "hetzner_fallback_retained",
}));

const loadRows = () => source === "linked" ? queryLinkedRows(inventorySql) : fixtureRows;
const loadCounts = () => source === "linked" ? queryLinkedRows(countsSql) : [];

if (source === "backend") {
  await handleBackendMode();
}

const rows = loadRows();
const summary = summarize(rows);
const counts = mode === "status" || mode === "inventory" ? loadCounts() : [];

if (mode === "copy" || mode === "run" || mode === "db-update") {
  console.log(JSON.stringify({
    ok: false,
    mode,
    blocked: true,
    reason: "copy_and_db_update_require_backend_copier_source_and_r2_origin_credentials",
    hetznerFallbackRetained: true,
    objectKeysRedacted: true,
    secretsPrinted: false,
  }, null, 2));
  process.exit(1);
}

if (mode === "zero-hetzner") {
  console.log(JSON.stringify({
    ok: summary.hetznerObjectStorageReferences === 0,
    mode,
    source,
    remainingHetznerObjectStorageReferences: summary.hetznerObjectStorageReferences,
    liveKitOutOfScope: true,
    hetznerObjectStorageShutdownReady: summary.hetznerObjectStorageReferences === 0,
    objectKeysRedacted: true,
    secretsPrinted: false,
  }, null, 2));
  process.exit(summary.hetznerObjectStorageReferences === 0 ? 0 : 1);
}

const manifest = buildRedactedManifest(rows);
const dryRun = mode === "dry-run";

console.log(JSON.stringify({
  ok: true,
  mode,
  source,
  r2PrivateOriginBucket: R2_ORIGIN_BUCKET,
  targetPrivateOnly: true,
  publicPlaybackBucketUsedForOriginals: false,
  mediaPublicDomainUsedForOriginals: false,
  legacyHetznerFallbackRetained: true,
  copyReady: false,
  copyBlockedReason: "copy requires source=backend trusted copier plus backend R2 private-origin write config",
  dbUpdateReady: false,
  dbUpdateBlockedReason: "DB metadata must not move until every copied object has verified size/checksum/readback",
  summary,
  counts,
  redactedManifest: dryRun ? manifest : undefined,
  redactedManifestCount: manifest.length,
  objectKeysRedacted: true,
  signedUrlsPrinted: false,
  secretsPrinted: false,
  liveKitTouched: false,
  liveKitShutdownReady: false,
}, null, 2));
