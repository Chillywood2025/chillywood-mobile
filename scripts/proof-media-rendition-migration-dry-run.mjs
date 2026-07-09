#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const draftMigrationPath = "supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql";
const databaseUrlEnvName = "MEDIA_RENDITION_DRY_RUN_DATABASE_URL";
const embeddedRuntimePackage = "@electric-sql/pglite";

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const migration = read(draftMigrationPath);

const failures = [];
const fail = (message) => failures.push(message);
const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
};
const assertNotMatches = (source, pattern, label) => {
  const match = source.match(pattern);
  if (match) fail(`${label} must not match ${pattern}: ${match[0]}`);
};

const requiredColumns = [
  "source_type",
  "source_id",
  "rendition_label",
  "delivery_format",
  "delivery_provider",
  "storage_provider",
  "bucket_role",
  "public_playback_path",
  "manifest_path",
  "variant_playlist_path",
  "width",
  "height",
  "codec",
  "bitrate",
  "duration_ms",
  "cache_policy",
  "visibility",
  "scan_status",
  "moderation_status",
  "is_public_playback_safe",
  "is_original",
  "is_ready",
  "worker_version",
  "source_hash",
];

const commandExists = (command) => {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
};

const checkLocalPort = (host, port, timeoutMs = 500) => new Promise((resolve) => {
  const socket = new net.Socket();
  let settled = false;
  const finish = (open) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolve(open);
  };
  socket.setTimeout(timeoutMs);
  socket.once("connect", () => finish(true));
  socket.once("timeout", () => finish(false));
  socket.once("error", () => finish(false));
  socket.connect(port, host);
});

const importEmbeddedPostgres = async () => {
  try {
    return await import(embeddedRuntimePackage);
  } catch {
    return null;
  }
};

const redactError = (value) => (
  String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://redacted")
    .replace(/password=[^\s]+/gi, "password=redacted")
    .split("\n")
    .slice(0, 4)
    .join(" ")
    .trim()
);

const validateStaticSql = () => {
  const summary = {
    mode: "static",
    migration: draftMigrationPath,
    syntaxStatic: {
      dollarQuotesBalanced: (migration.match(/\$\$/g) ?? []).length % 2 === 0,
      statementTerminators: (migration.match(/;/g) ?? []).length,
    },
    tables: [],
    indexes: [],
    policies: [],
    grants: [],
    comments: [],
    limitations: [],
  };

  assertIncludes(migration, 'create table if not exists public."media_transcode_jobs"', "migration jobs table");
  assertIncludes(migration, 'create table if not exists public."media_renditions"', "migration renditions table");
  summary.tables.push("media_transcode_jobs", "media_renditions");

  for (const column of requiredColumns) {
    assertIncludes(migration, `"${column}"`, `migration column ${column}`);
  }

  for (const indexName of [
    "media_transcode_jobs_source_idx",
    "media_transcode_jobs_status_idx",
    "media_transcode_jobs_creator_idx",
    "media_renditions_source_idx",
    "media_renditions_ready_idx",
    "media_renditions_label_idx",
    "media_renditions_delivery_provider_idx",
    "media_renditions_visibility_idx",
    "media_renditions_job_idx",
  ]) {
    assertIncludes(migration, indexName, `migration index ${indexName}`);
    summary.indexes.push(indexName);
  }

  for (const policyName of [
    "media_transcode_jobs_select_owner_operator",
    "media_transcode_jobs_no_direct_client_insert",
    "media_transcode_jobs_no_direct_client_update",
    "media_transcode_jobs_no_direct_client_delete",
    "media_renditions_select_owner_operator",
    "media_renditions_select_public_safe_metadata",
    "media_renditions_no_direct_client_insert",
    "media_renditions_no_direct_client_update",
    "media_renditions_no_direct_client_delete",
  ]) {
    assertIncludes(migration, policyName, `migration policy ${policyName}`);
    summary.policies.push(policyName);
  }

  assertIncludes(migration, 'alter table public."media_transcode_jobs" enable row level security;', "jobs RLS");
  assertIncludes(migration, 'alter table public."media_renditions" enable row level security;', "renditions RLS");
  assertIncludes(migration, 'grant all on table public."media_transcode_jobs" to "service_role";', "jobs service role grant");
  assertIncludes(migration, 'grant all on table public."media_renditions" to "service_role";', "renditions service role grant");
  assertNotMatches(migration, /\bgrant\s+(insert|update|delete|all)\b[^;]*\bto\s+"?(anon|authenticated)"?/i, "client write grants");
  summary.grants.push("service_role all", "anon/authenticated no direct writes");

  for (const requiredText of [
    'constraint "media_renditions_original_private_check"',
    'constraint "media_renditions_hd_not_public_free_check"',
    'constraint "media_renditions_ready_requires_worker_proof_check"',
    'constraint "media_renditions_public_cdn_safety_check"',
    '"is_ready" = true',
    '"is_public_playback_safe" = true',
    '"visibility" = \'public\'',
    '"is_original" = false',
    '"storage_provider" = \'cloudflare_r2\'',
    '"delivery_provider" = \'cloudflare_r2_custom_domain\'',
    '"bucket_role" = \'public_playback\'',
    '"scan_status" in (\'clean\', \'approved\')',
    '"moderation_status" in (\'clean\', \'approved\', \'allowed\')',
    '"public_playback_path" like \'playback/public/%\'',
    'originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned',
    'nullif(btrim(coalesce("worker_version", \'\')), \'\') is not null',
    'nullif(btrim(coalesce("source_hash", \'\')), \'\') is not null',
  ]) {
    assertIncludes(migration, requiredText, "public CDN/trusted-row constraint");
  }

  for (const commentNeedle of [
    'comment on table public."media_transcode_jobs"',
    'comment on table public."media_renditions"',
    'comment on column public."media_renditions"."is_public_playback_safe"',
    'comment on column public."media_renditions"."is_ready"',
    'comment on column public."media_renditions"."public_playback_path"',
  ]) {
    assertIncludes(migration, commentNeedle, `migration comment ${commentNeedle}`);
    summary.comments.push(commentNeedle);
  }

  if (!summary.syntaxStatic.dollarQuotesBalanced) {
    fail("migration has unbalanced $$ dollar quotes");
  }
  if (summary.syntaxStatic.statementTerminators < 20) {
    fail("migration has unexpectedly few SQL statement terminators");
  }

  return summary;
};

const classifyDryRunDatabaseUrl = (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${databaseUrlEnvName} is not a valid URL`);
  }

  if (!/^postgres(?:ql)?:$/i.test(parsed.protocol)) {
    throw new Error(`${databaseUrlEnvName} must use a postgres:// or postgresql:// URL`);
  }

  const host = parsed.hostname.toLowerCase();
  const labelText = [host, parsed.pathname, parsed.username].join(" ").toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const safeLabeled = /(^|[-_/.])(local|shadow|test|dryrun|dry-run|dev|proof|staging)($|[-_/.])/.test(labelText);
  const allowRemoteShadow = process.env.MEDIA_RENDITION_DRY_RUN_ALLOW_REMOTE_SHADOW === "true";
  const looksProduction = /(^|[-_/.])(prod|production)($|[-_/.])/.test(labelText)
    && !/(nonprod|non-production|not-production)/.test(labelText);

  if (looksProduction) {
    throw new Error(`${databaseUrlEnvName} looks production-labeled; refusing dry-run connection`);
  }
  if (!isLocal && !allowRemoteShadow) {
    throw new Error(`${databaseUrlEnvName} is not local; set MEDIA_RENDITION_DRY_RUN_ALLOW_REMOTE_SHADOW=true only for an explicitly safe shadow/test database`);
  }
  if (!isLocal && !safeLabeled) {
    throw new Error(`${databaseUrlEnvName} remote URL is not test/shadow/dev/proof-labeled; refusing`);
  }

  return {
    parsed,
    isLocal,
    safeLabeled,
    remoteShadowAllowed: !isLocal && allowRemoteShadow,
    redactedTarget: isLocal ? `${host}:${parsed.port || "5432"}` : "remote-shadow-redacted",
  };
};

const proveProductionDbRefusal = () => {
  try {
    classifyDryRunDatabaseUrl("postgresql://dry_run_user:redacted@db.production.example.com/production");
    return false;
  } catch {
    return true;
  }
};

const writeTempSql = (sql) => {
  const filePath = path.join(os.tmpdir(), `chillywood-media-rendition-dry-run-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(filePath, sql);
  return filePath;
};

const runPsql = (databaseUrl, sql, options = {}) => {
  const sqlFile = writeTempSql(sql);
  try {
    const args = [
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--quiet",
      "--tuples-only",
      "--no-align",
      "--file",
      sqlFile,
      databaseUrl,
    ];
    const result = spawnSync("psql", args, {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT || "10",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!options.allowFailure && result.status !== 0) {
      throw new Error(redactError(result.stderr || result.stdout || `psql exited ${result.status}`));
    }
    return result;
  } finally {
    fs.rmSync(sqlFile, { force: true });
  }
};

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const replaceDatabaseName = (rawUrl, databaseName) => {
  const parsed = new URL(rawUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
};

const safeReadyRenditionValues = (suffix) => `
  (
    'dry-run-media-${suffix}',
    'proof_demo',
    'dry-run-source-${suffix}',
    '480p',
    'hls',
    'cloudflare_r2_custom_domain',
    'cloudflare_r2',
    'public_playback',
    'playback/public/dry-run/${suffix}/master.m3u8',
    'playback/public/dry-run/${suffix}/master.m3u8',
    'playback/public/dry-run/${suffix}/480p/index.m3u8',
    854,
    480,
    52208,
    'h264',
    1200000,
    'public, max-age=300',
    'public',
    'clean',
    'allowed',
    true,
    false,
    true,
    'dry-run-worker-v1',
    'sha256:dry-run-source'
  )
`;

const insertReadyRenditionSql = (suffix, overrides = {}) => {
  const row = {
    mediaId: `dry-run-media-${suffix}`,
    sourceId: `dry-run-source-${suffix}`,
    renditionLabel: "480p",
    deliveryFormat: "hls",
    deliveryProvider: "cloudflare_r2_custom_domain",
    storageProvider: "cloudflare_r2",
    bucketRole: "public_playback",
    publicPlaybackPath: `playback/public/dry-run/${suffix}/master.m3u8`,
    manifestPath: `playback/public/dry-run/${suffix}/master.m3u8`,
    variantPlaylistPath: `playback/public/dry-run/${suffix}/480p/index.m3u8`,
    width: 854,
    height: 480,
    durationMs: 52208,
    codec: "h264",
    bitrate: 1200000,
    cachePolicy: "public, max-age=300",
    visibility: "public",
    scanStatus: "clean",
    moderationStatus: "allowed",
    publicSafe: true,
    isOriginal: false,
    isReady: true,
    workerVersion: "dry-run-worker-v1",
    sourceHash: "sha256:dry-run-source",
    ...overrides,
  };

  const sqlString = (value) => value === null ? "null" : `'${String(value).replace(/'/g, "''")}'`;
  return `
    insert into public."media_renditions" (
      "media_id", "source_type", "source_id", "rendition_label",
      "delivery_format", "delivery_provider", "storage_provider", "bucket_role",
      "public_playback_path", "manifest_path", "variant_playlist_path",
      "width", "height", "duration_ms", "codec", "bitrate", "cache_policy",
      "visibility", "scan_status", "moderation_status", "is_public_playback_safe",
      "is_original", "is_ready", "worker_version", "source_hash"
    )
    values (
      ${sqlString(row.mediaId)},
      'proof_demo',
      ${sqlString(row.sourceId)},
      ${sqlString(row.renditionLabel)},
      ${sqlString(row.deliveryFormat)},
      ${sqlString(row.deliveryProvider)},
      ${sqlString(row.storageProvider)},
      ${sqlString(row.bucketRole)},
      ${sqlString(row.publicPlaybackPath)},
      ${sqlString(row.manifestPath)},
      ${sqlString(row.variantPlaylistPath)},
      ${row.width},
      ${row.height},
      ${row.durationMs},
      ${sqlString(row.codec)},
      ${row.bitrate},
      ${sqlString(row.cachePolicy)},
      ${sqlString(row.visibility)},
      ${sqlString(row.scanStatus)},
      ${sqlString(row.moderationStatus)},
      ${row.publicSafe ? "true" : "false"},
      ${row.isOriginal ? "true" : "false"},
      ${row.isReady ? "true" : "false"},
      ${sqlString(row.workerVersion)},
      ${sqlString(row.sourceHash)}
    );
  `;
};

const runEmbeddedPostgresDryRun = async (capability) => {
  const embeddedPostgres = await importEmbeddedPostgres();
  if (!embeddedPostgres?.PGlite) return null;

  const db = new embeddedPostgres.PGlite();
  const exec = async (sql) => db.exec(sql);
  const query = async (sql) => (await db.query(sql)).rows;
  const resetRole = async () => {
    try {
      await exec("reset role;");
    } catch {
      // Best-effort cleanup after an expected permission failure.
    }
  };
  const expectDenied = async (label, sql) => {
    await resetRole();
    try {
      await exec(sql);
      throw new Error(`${label} unexpectedly succeeded`);
    } catch (error) {
      await resetRole();
      if (String(error?.message ?? "").includes("unexpectedly succeeded")) throw error;
      return {
        label,
        denied: true,
        sqlState: String(error?.code ?? "error"),
      };
    }
  };

  try {
    await exec(`
      create role "anon";
      create role "authenticated";
      create role "service_role" bypassrls;
      create schema if not exists auth;
      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create or replace function public.has_platform_role(text[])
      returns boolean
      language sql
      stable
      as $$
        select false
      $$;
      create table if not exists public."videos" (
        "id" uuid primary key default gen_random_uuid()
      );
      grant usage on schema public to "anon", "authenticated", "service_role";
      grant usage on schema auth to "anon", "authenticated", "service_role";
      grant execute on function auth.uid() to "anon", "authenticated", "service_role";
      grant execute on function public.has_platform_role(text[]) to "anon", "authenticated", "service_role";
    `);
    await exec(migration);

    const tableRows = await query(`
      select relname, relrowsecurity
      from pg_class
      where relname in ('media_transcode_jobs', 'media_renditions')
      order by relname;
    `);
    const tableMap = new Map(tableRows.map((row) => [row.relname, row]));
    for (const tableName of ["media_transcode_jobs", "media_renditions"]) {
      if (!tableMap.has(tableName)) throw new Error(`${tableName} missing after embedded apply`);
      if (tableMap.get(tableName).relrowsecurity !== true) throw new Error(`${tableName} RLS not enabled`);
    }

    const indexRows = await query(`
      select indexname
      from pg_indexes
      where tablename in ('media_transcode_jobs', 'media_renditions')
      order by indexname;
    `);
    const indexNames = indexRows.map((row) => row.indexname);
    for (const indexName of [
      "media_transcode_jobs_source_idx",
      "media_transcode_jobs_status_idx",
      "media_transcode_jobs_creator_idx",
      "media_renditions_source_idx",
      "media_renditions_ready_idx",
      "media_renditions_label_idx",
      "media_renditions_delivery_provider_idx",
      "media_renditions_visibility_idx",
      "media_renditions_job_idx",
    ]) {
      if (!indexNames.includes(indexName)) throw new Error(`${indexName} missing after embedded apply`);
    }

    const policyRows = await query(`
      select policyname
      from pg_policies
      where tablename in ('media_transcode_jobs', 'media_renditions')
      order by policyname;
    `);
    const policyNames = policyRows.map((row) => row.policyname);
    for (const policyName of [
      "media_transcode_jobs_select_owner_operator",
      "media_transcode_jobs_no_direct_client_insert",
      "media_transcode_jobs_no_direct_client_update",
      "media_transcode_jobs_no_direct_client_delete",
      "media_renditions_select_owner_operator",
      "media_renditions_select_public_safe_metadata",
      "media_renditions_no_direct_client_insert",
      "media_renditions_no_direct_client_update",
      "media_renditions_no_direct_client_delete",
    ]) {
      if (!policyNames.includes(policyName)) throw new Error(`${policyName} missing after embedded apply`);
    }

    const grantRows = await query(`
      select
        has_table_privilege('service_role', 'public.media_transcode_jobs', 'insert') as service_job_insert,
        has_table_privilege('service_role', 'public.media_transcode_jobs', 'update') as service_job_update,
        has_table_privilege('service_role', 'public.media_renditions', 'insert') as service_rendition_insert,
        has_table_privilege('service_role', 'public.media_renditions', 'update') as service_rendition_update,
        has_table_privilege('anon', 'public.media_renditions', 'insert') as anon_rendition_insert,
        has_table_privilege('authenticated', 'public.media_renditions', 'update') as authenticated_rendition_update,
        has_table_privilege('authenticated', 'public.media_transcode_jobs', 'insert') as authenticated_job_insert;
    `);
    const grants = grantRows[0] ?? {};
    if (
      grants.service_job_insert !== true
      || grants.service_job_update !== true
      || grants.service_rendition_insert !== true
      || grants.service_rendition_update !== true
      || grants.anon_rendition_insert !== false
      || grants.authenticated_rendition_update !== false
      || grants.authenticated_job_insert !== false
    ) {
      throw new Error("embedded apply grants do not match trusted writer/client denial contract");
    }

    const clientWriteDenials = [
      await expectDenied("anon/client insert trusted ready rendition row", `
        set role "anon";
        ${insertReadyRenditionSql("anon-denied")}
      `),
      await expectDenied("authenticated/client update is_ready=true", `
        set role "authenticated";
        update public."media_renditions"
        set "is_ready" = true
        where "media_id" = 'dry-run-media-safe';
      `),
      await expectDenied("authenticated/client set public_playback_path", `
        set role "authenticated";
        update public."media_renditions"
        set "public_playback_path" = 'playback/public/dry-run/client-set/master.m3u8'
        where "media_id" = 'dry-run-media-safe';
      `),
      await expectDenied("authenticated/client set is_public_playback_safe=true", `
        set role "authenticated";
        update public."media_renditions"
        set "is_public_playback_safe" = true
        where "media_id" = 'dry-run-media-safe';
      `),
      await expectDenied("authenticated/client insert trusted transcode job as ready", `
        set role "authenticated";
        insert into public."media_transcode_jobs" (
          "source_type", "source_id", "input_provider", "input_path",
          "output_provider", "output_prefix", "status", "requested_renditions",
          "worker_version", "source_hash", "proof_mode"
        )
        values (
          'proof_demo', 'client-ready-job', 'cloudflare_r2_custom_domain',
          'playback/public/dry-run/client/input.mp4',
          'cloudflare_r2_custom_domain', 'playback/public/dry-run/client',
          'ready', '["360p"]'::jsonb, 'client-worker',
          'sha256:client', true
        );
      `),
    ];

    await exec(`
      reset role;
      set role "service_role";
      insert into public."media_transcode_jobs" (
        "source_type", "source_id", "input_provider", "input_path",
        "output_provider", "output_prefix", "status", "requested_renditions",
        "worker_version", "source_hash", "proof_mode"
      )
      values (
        'proof_demo', 'dry-run-source-safe', 'cloudflare_r2_custom_domain',
        'playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4',
        'cloudflare_r2_custom_domain', 'playback/public/dry-run/safe',
        'queued', '["360p", "480p"]'::jsonb, 'dry-run-worker-v1',
        'sha256:dry-run-source', true
      );
      update public."media_transcode_jobs"
      set "status" = 'probing', "started_at" = timezone('utc'::text, now())
      where "source_id" = 'dry-run-source-safe';
      update public."media_transcode_jobs"
      set "status" = 'transcoding'
      where "source_id" = 'dry-run-source-safe';
      update public."media_transcode_jobs"
      set "status" = 'uploading'
      where "source_id" = 'dry-run-source-safe';
      update public."media_transcode_jobs"
      set "status" = 'ready',
          "completed_renditions" = '["360p", "480p"]'::jsonb,
          "completed_at" = timezone('utc'::text, now())
      where "source_id" = 'dry-run-source-safe';
      insert into public."media_transcode_jobs" (
        "source_type", "source_id", "input_provider", "input_path",
        "output_provider", "output_prefix", "status", "requested_renditions",
        "worker_version", "source_hash", "error_code", "error_message", "proof_mode"
      )
      values (
        'proof_demo', 'dry-run-source-failed', 'cloudflare_r2_custom_domain',
        'playback/public/dry-run/failed/input.mp4',
        'cloudflare_r2_custom_domain', 'playback/public/dry-run/failed',
        'failed', '["360p"]'::jsonb, 'dry-run-worker-v1',
        'sha256:dry-run-failed', 'proof_failed', 'proof failure state', true
      );
      ${insertReadyRenditionSql("safe")}
      reset role;
    `);

    const safetyCaseDenials = [
      await expectDenied("original/master row cannot be public CDN eligible", `
        set role "service_role";
        ${insertReadyRenditionSql("original", {
          renditionLabel: "original",
          visibility: "private",
          bucketRole: "private_origin",
          publicSafe: false,
          isOriginal: true,
        })}
      `),
      await expectDenied("Premium row cannot be public CDN eligible without token mode", `
        set role "service_role";
        ${insertReadyRenditionSql("premium", { visibility: "premium" })}
      `),
      await expectDenied("private row cannot be public CDN eligible without token mode", `
        set role "service_role";
        ${insertReadyRenditionSql("private", { visibility: "private" })}
      `),
      await expectDenied("unscanned row cannot be resolver eligible", `
        set role "service_role";
        ${insertReadyRenditionSql("unscanned", { scanStatus: "pending_scan" })}
      `),
      await expectDenied("moderation-blocked row cannot be resolver eligible", `
        set role "service_role";
        ${insertReadyRenditionSql("moderation-blocked", { moderationStatus: "blocked" })}
      `),
      await expectDenied("wrong bucket role cannot be resolver eligible", `
        set role "service_role";
        ${insertReadyRenditionSql("wrong-bucket", { bucketRole: "private_origin" })}
      `),
      await expectDenied("non-public prefix cannot be resolver eligible", `
        set role "service_role";
        ${insertReadyRenditionSql("non-public-prefix", {
          publicPlaybackPath: "private/dry-run/non-public-prefix/master.m3u8",
          manifestPath: "private/dry-run/non-public-prefix/master.m3u8",
          variantPlaylistPath: "private/dry-run/non-public-prefix/480p/index.m3u8",
        })}
      `),
    ];

    await exec('set role "anon";');
    const resolverRows = await query(`
      select
        count(*)::int as safe_count,
        min("public_playback_path") as path
      from public."media_renditions"
      where "source_type" = 'proof_demo'
        and "source_id" = 'dry-run-source-safe'
        and "is_ready" = true
        and "is_public_playback_safe" = true
        and "visibility" = 'public'
        and "delivery_provider" = 'cloudflare_r2_custom_domain'
        and "storage_provider" = 'cloudflare_r2'
        and "bucket_role" = 'public_playback'
        and "scan_status" in ('clean', 'approved')
        and "moderation_status" in ('clean', 'approved', 'allowed')
        and "public_playback_path" like 'playback/public/%';
    `);
    await resetRole();
    const resolverSafeCount = Number(resolverRows[0]?.safe_count ?? 0);
    if (resolverSafeCount !== 1) {
      throw new Error(`resolver-safe anon select expected 1 row, got ${resolverSafeCount}`);
    }

    return {
      status: "passed",
      runtime: "pglite_disposable_local",
      safeBecause: "in-memory disposable local Postgres runtime; no network DB URL, no production Supabase project, no production service-role key",
      target: "embedded-local-disposable",
      migrationApplied: true,
      tablesExist: ["media_transcode_jobs", "media_renditions"],
      indexesVerified: indexNames,
      policiesVerified: policyNames,
      grantsVerified: {
        serviceRoleCanWrite: true,
        anonAuthenticatedDirectWritesDenied: true,
      },
      rlsEnabled: true,
      clientWriteDenials,
      serviceRoleWorkerWrites: {
        queuedJobInsertAllowed: true,
        statusTransitionsAllowed: ["queued", "probing", "transcoding", "uploading", "ready"],
        readyPublicSafeRenditionInsertAllowed: true,
        failedJobInsertAllowed: true,
      },
      safetyCaseDenials,
      resolverSafeSelect: {
        role: "anon",
        count: resolverSafeCount,
        path: resolverRows[0]?.path,
      },
      capability,
    };
  } finally {
    await db.close();
  }
};

const runRuntimeDryRun = async () => {
  const rawUrl = process.env[databaseUrlEnvName];
  const psqlAvailable = commandExists("psql");
  const defaultSupabaseLocalPortOpen = await checkLocalPort("127.0.0.1", 54322);
  const embeddedPostgresAvailable = Boolean(await importEmbeddedPostgres());

  const capability = {
    psqlAvailable,
    defaultSupabaseLocalPortOpen,
    databaseUrlProvided: Boolean(rawUrl),
    embeddedPostgresAvailable,
  };

  if (!rawUrl) {
    const embeddedResult = await runEmbeddedPostgresDryRun(capability);
    if (embeddedResult) return embeddedResult;

    return {
      status: "skipped_static_only",
      reason: `${databaseUrlEnvName} is not set; no local/shadow database runtime is available in this shell`,
      capability,
      localShadowApply: "not_run",
      rlsBehavior: "static_only",
    };
  }

  if (!psqlAvailable) {
    throw new Error("psql is required for local/shadow runtime dry-run when a database URL is provided");
  }

  const classification = classifyDryRunDatabaseUrl(rawUrl);
  const tempDbName = `chillywood_media_rendition_dry_run_${Date.now()}_${process.pid}`.replace(/[^a-zA-Z0-9_]/g, "_");
  const tempDbUrl = replaceDatabaseName(rawUrl, tempDbName);
  const roleRows = runPsql(
    rawUrl,
    "select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role') order by rolname;",
  ).stdout.split(/\s+/).filter(Boolean);
  const existingRoles = new Set(roleRows);
  const rolesCreated = [];

  const createRoleIfMissing = (roleName, options = "") => {
    if (existingRoles.has(roleName)) return;
    runPsql(rawUrl, `create role ${quoteIdentifier(roleName)} nologin ${options};`);
    rolesCreated.push(roleName);
  };

  let tempDbCreated = false;
  try {
    createRoleIfMissing("anon");
    createRoleIfMissing("authenticated");
    createRoleIfMissing("service_role", "bypassrls");
    runPsql(rawUrl, `alter role "service_role" bypassrls;`, { allowFailure: true });
    runPsql(rawUrl, `create database ${quoteIdentifier(tempDbName)};`);
    tempDbCreated = true;

    const fixtureSql = `
      create extension if not exists pgcrypto;
      create schema if not exists auth;
      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create or replace function public.has_platform_role(text[])
      returns boolean
      language sql
      stable
      as $$
        select false
      $$;
      create table if not exists public."videos" (
        "id" uuid primary key default gen_random_uuid()
      );
    `;
    runPsql(tempDbUrl, `${fixtureSql}\n${migration}`);

    const introspectionSql = `
      do $$
      begin
        if not exists (select 1 from pg_class where relname = 'media_transcode_jobs' and relkind = 'r') then
          raise exception 'media_transcode_jobs missing';
        end if;
        if not exists (select 1 from pg_class where relname = 'media_renditions' and relkind = 'r') then
          raise exception 'media_renditions missing';
        end if;
        if not exists (select 1 from pg_class where relname = 'media_transcode_jobs' and relrowsecurity) then
          raise exception 'media_transcode_jobs RLS missing';
        end if;
        if not exists (select 1 from pg_class where relname = 'media_renditions' and relrowsecurity) then
          raise exception 'media_renditions RLS missing';
        end if;
        if not has_table_privilege('service_role', 'public.media_transcode_jobs', 'insert') then
          raise exception 'service_role cannot insert jobs';
        end if;
        if not has_table_privilege('service_role', 'public.media_renditions', 'insert') then
          raise exception 'service_role cannot insert renditions';
        end if;
        if has_table_privilege('anon', 'public.media_renditions', 'insert') then
          raise exception 'anon unexpectedly has rendition insert';
        end if;
        if has_table_privilege('authenticated', 'public.media_renditions', 'update') then
          raise exception 'authenticated unexpectedly has rendition update';
        end if;
        if not exists (select 1 from pg_policies where tablename = 'media_renditions' and policyname = 'media_renditions_select_public_safe_metadata') then
          raise exception 'public-safe select policy missing';
        end if;
        if not exists (select 1 from pg_indexes where tablename = 'media_renditions' and indexname = 'media_renditions_ready_idx') then
          raise exception 'ready index missing';
        end if;
      end $$;
    `;
    runPsql(tempDbUrl, introspectionSql);

    const expectDenied = (label, sql) => {
      const result = runPsql(tempDbUrl, sql, { allowFailure: true });
      if (result.status === 0) {
        throw new Error(`${label} unexpectedly succeeded`);
      }
      return { label, denied: true };
    };

    const deniedResults = [
      expectDenied("anon/client insert trusted ready row", `
        set role "anon";
        ${insertReadyRenditionSql("anon-denied")}
      `),
      expectDenied("authenticated/client update trusted public path", `
        set role "authenticated";
        update public."media_renditions"
        set "public_playback_path" = 'playback/public/dry-run/changed/master.m3u8'
        where "media_id" = 'dry-run-media-safe';
      `),
      expectDenied("authenticated/client set is_ready true", `
        set role "authenticated";
        update public."media_renditions"
        set "is_ready" = true
        where "media_id" = 'dry-run-media-safe';
      `),
    ];

    runPsql(tempDbUrl, `
      set role "service_role";
      insert into public."media_transcode_jobs" (
        "source_type", "source_id", "input_provider", "input_path",
        "output_provider", "output_prefix", "status", "requested_renditions",
        "worker_version", "source_hash", "proof_mode"
      )
      values (
        'proof_demo', 'dry-run-source-safe', 'cloudflare_r2_custom_domain',
        'playback/public/demo/chillywood-city-lights/v1/chillywood-city-lights-v1-b670602fa00934ca.mp4',
        'cloudflare_r2_custom_domain', 'playback/public/dry-run/safe',
        'queued', '["360p", "480p"]'::jsonb, 'dry-run-worker-v1',
        'sha256:dry-run-source', true
      );
      ${insertReadyRenditionSql("safe")}
    `);

    const constraintResults = [
      expectDenied("unsafe scan row cannot be CDN eligible", `
        set role "service_role";
        ${insertReadyRenditionSql("unsafe-scan", { scanStatus: "pending_scan" })}
      `),
      expectDenied("original/master row cannot be public CDN eligible", `
        set role "service_role";
        ${insertReadyRenditionSql("original", {
          renditionLabel: "original",
          isOriginal: true,
          publicPlaybackPath: "playback/public/dry-run/original/master.m3u8",
          manifestPath: "playback/public/dry-run/original/master.m3u8",
          variantPlaylistPath: "playback/public/dry-run/original/480p/index.m3u8",
        })}
      `),
      expectDenied("Premium/private row cannot use public CDN without token mode", `
        set role "service_role";
        ${insertReadyRenditionSql("premium", { visibility: "premium" })}
      `),
    ];

    const resolverSafeCount = runPsql(tempDbUrl, `
      set role "anon";
      select count(*)::int
      from public."media_renditions"
      where "source_type" = 'proof_demo'
        and "source_id" = 'dry-run-source-safe'
        and "is_ready" = true
        and "is_public_playback_safe" = true
        and "visibility" = 'public'
        and "delivery_provider" = 'cloudflare_r2_custom_domain'
        and "bucket_role" = 'public_playback'
        and "public_playback_path" like 'playback/public/%';
    `).stdout.trim().split(/\s+/).pop();

    if (resolverSafeCount !== "1") {
      throw new Error(`resolver-safe anon select expected 1 row, got ${resolverSafeCount || "empty"}`);
    }

    return {
      status: "passed",
      target: classification.redactedTarget,
      createdTemporaryDatabase: true,
      temporaryDatabaseDropped: true,
      tablesExist: ["media_transcode_jobs", "media_renditions"],
      rlsEnabled: true,
      indexesVerified: true,
      clientWriteDenials: deniedResults,
      serviceRoleWorkerWrites: {
        queuedJobInsertAllowed: true,
        readyPublicSafeRenditionInsertAllowed: true,
      },
      constraintDenials: constraintResults,
      resolverSafeSelect: {
        role: "anon",
        count: Number(resolverSafeCount),
      },
      capability,
    };
  } finally {
    if (tempDbCreated) {
      runPsql(rawUrl, `drop database if exists ${quoteIdentifier(tempDbName)};`, { allowFailure: true });
    }
    for (const roleName of rolesCreated.reverse()) {
      runPsql(rawUrl, `drop role if exists ${quoteIdentifier(roleName)};`, { allowFailure: true });
    }
  }
};

const staticValidation = validateStaticSql();
const staticSqlValidationPassed = failures.length === 0;
const localShadow = await runRuntimeDryRun().catch((error) => {
  fail(`local/shadow dry-run failed: ${redactError(error.message)}`);
  return null;
});
const productionDbRefused = proveProductionDbRefusal();
if (!productionDbRefused) {
  fail("production-looking database URL was not refused");
}

const runtimeApplyAttempted = Boolean(localShadow && localShadow.status !== "skipped_static_only");
const runtimeApplyPassed = Boolean(localShadow?.status === "passed");
const clientWriteDenied = Boolean(
  localShadow?.clientWriteDenials?.length >= 5
  && localShadow.clientWriteDenials.every((result) => result.denied === true),
);
const serviceRoleWritePassed = Boolean(
  localShadow?.serviceRoleWorkerWrites?.queuedJobInsertAllowed === true
  && localShadow?.serviceRoleWorkerWrites?.readyPublicSafeRenditionInsertAllowed === true,
);
const resolverSafeSelectPassed = Boolean(localShadow?.resolverSafeSelect?.count === 1);

assertNotMatches(
  JSON.stringify({
    staticValidation,
    localShadow,
    staticSqlValidationPassed,
    runtimeApplyAttempted,
    runtimeApplyPassed,
    clientWriteDenied,
    serviceRoleWritePassed,
    resolverSafeSelectPassed,
    productionDbRefused,
    noSecretsPrinted: true,
  }),
  /\bAKIA[0-9A-Z]{16}\b|\bASIA[0-9A-Z]{16}\b|\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  "dry-run proof output",
);

if (failures.length) {
  console.error("Media rendition migration dry-run proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  proof: "media-rendition-migration-dry-run",
  productionMigrationApplied: false,
  productionDbWritesEnabled: false,
  productionPlaybackSwitched: false,
  staticSqlValidationPassed,
  runtimeApplyAttempted,
  runtimeApplyPassed,
  clientWriteDenied,
  serviceRoleWritePassed,
  resolverSafeSelectPassed,
  productionDbRefused,
  noSecretsPrinted: true,
  staticValidation,
  localShadow,
}, null, 2));
