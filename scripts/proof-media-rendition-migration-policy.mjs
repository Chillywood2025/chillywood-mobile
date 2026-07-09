#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const draftMigrationPath = "supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql";
const migrationPlanPath = "docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md";

const migration = read(draftMigrationPath);
const migrationPlan = read(migrationPlanPath);
const architecture = read("docs/MEDIA_DELIVERY_SCALE_ARCHITECTURE.md");
const vodDoc = read("docs/VOD_QUALITY_LADDER_AND_PLAYBACK_RESOLVER.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");

const failures = [];
const fail = (message) => failures.push(message);

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertMatches = (source, pattern, label) => {
  if (!pattern.test(source)) fail(`${label} must match ${pattern}`);
};

const assertNotMatches = (source, pattern, label) => {
  const match = source.match(pattern);
  if (match) fail(`${label} must not match ${pattern}: ${match[0]}`);
};

const splitSentences = (source) => (
  source
    .split(/\n+/)
    .flatMap((line) => line.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.replace(/^[-*\d.]+\s*/, "").trim())
    .filter(Boolean)
);

const hasNegatingLanguage = (sentence) => (
  /\b(not|no|never|missing|pending|planned|future|blocked|fallback|without|until|cannot|does not|do not|must not|unchanged)\b/i.test(sentence)
);

const docsCorpus = [migrationPlan, architecture, vodDoc, currentState, nextTask].join("\n\n");
const proofCorpus = [migration, docsCorpus, read("scripts/proof-media-rendition-migration-policy.mjs")].join("\n\n");

assertIncludes(migration, 'create table if not exists public."media_transcode_jobs"', "draft migration");
assertIncludes(migration, 'create table if not exists public."media_renditions"', "draft migration");
assertIncludes(migration, 'alter table public."media_transcode_jobs" enable row level security;', "draft migration RLS");
assertIncludes(migration, 'alter table public."media_renditions" enable row level security;', "draft migration RLS");

for (const tableName of ["media_transcode_jobs", "media_renditions"]) {
  assertIncludes(migration, `revoke all on table public."${tableName}" from "anon";`, `${tableName} grants`);
  assertIncludes(migration, `revoke all on table public."${tableName}" from "authenticated";`, `${tableName} grants`);
  assertIncludes(migration, `grant all on table public."${tableName}" to "service_role";`, `${tableName} service role grant`);
  assertIncludes(migration, `${tableName}_no_direct_client_insert`, `${tableName} insert policy`);
  assertIncludes(migration, `${tableName}_no_direct_client_update`, `${tableName} update policy`);
  assertIncludes(migration, `${tableName}_no_direct_client_delete`, `${tableName} delete policy`);
}

assertNotMatches(
  migration,
  /\bgrant\s+(insert|update|delete|all)\b[^;]*\bto\s+"?(anon|authenticated)"?/i,
  "draft migration must not grant client writes",
);
assertNotMatches(
  migration,
  /for\s+(insert|update|delete)\s+to\s+(anon|authenticated)[\s\S]{0,160}(with check|using)\s*\((?!false\))/i,
  "draft migration client write policies must be fail-closed",
);

for (const trustedField of [
  '"source_type"',
  '"source_id"',
  '"rendition_label"',
  '"delivery_format"',
  '"delivery_provider"',
  '"storage_provider"',
  '"bucket_role"',
  '"public_playback_path"',
  '"manifest_path"',
  '"variant_playlist_path"',
  '"width"',
  '"height"',
  '"codec"',
  '"bitrate"',
  '"duration_ms"',
  '"cache_policy"',
  '"visibility"',
  '"scan_status"',
  '"moderation_status"',
  '"is_public_playback_safe"',
  '"is_original"',
  '"is_ready"',
  '"worker_version"',
  '"source_hash"',
]) {
  assertIncludes(migration, trustedField, `trusted field ${trustedField}`);
}

assertIncludes(migration, 'constraint "media_renditions_original_private_check"', "original/master constraint");
assertIncludes(migration, 'constraint "media_renditions_hd_not_public_free_check"', "HD public/free constraint");
assertIncludes(migration, 'constraint "media_renditions_ready_requires_worker_proof_check"', "ready worker proof constraint");
assertIncludes(migration, 'constraint "media_renditions_public_cdn_safety_check"', "public CDN safety constraint");
assertIncludes(migration, '"is_ready" = true', "public CDN requires ready");
assertIncludes(migration, '"is_public_playback_safe" = true', "public CDN requires public safety");
assertIncludes(migration, '"visibility" = \'public\'', "public CDN requires public visibility");
assertIncludes(migration, '"is_original" = false', "public CDN rejects originals");
assertIncludes(migration, '"storage_provider" = \'cloudflare_r2\'', "public CDN requires R2 storage");
assertIncludes(migration, '"delivery_provider" = \'cloudflare_r2_custom_domain\'', "public CDN requires Cloudflare custom domain");
assertIncludes(migration, '"bucket_role" = \'public_playback\'', "public CDN requires public playback bucket role");
assertIncludes(migration, '"scan_status" in (\'clean\', \'approved\')', "public CDN requires clean/approved scan");
assertIncludes(migration, '"moderation_status" in (\'clean\', \'approved\', \'allowed\')', "public CDN requires allowed moderation");
assertIncludes(migration, '"public_playback_path" like \'playback/public/%\'', "public CDN requires playback/public prefix");
assertIncludes(migration, 'originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned', "public CDN rejects private prefixes");
assertIncludes(migration, '"manifest_path" like \'%/master.m3u8\'', "HLS master manifest constraint");
assertIncludes(migration, 'nullif(btrim(coalesce("worker_version", \'\')), \'\') is not null', "ready rows require worker_version");
assertIncludes(migration, 'nullif(btrim(coalesce("source_hash", \'\')), \'\') is not null', "ready rows require source_hash");

for (const indexName of [
  "media_transcode_jobs_source_idx",
  "media_transcode_jobs_status_idx",
  "media_renditions_source_idx",
  "media_renditions_ready_idx",
  "media_renditions_label_idx",
  "media_renditions_delivery_provider_idx",
  "media_renditions_visibility_idx",
]) {
  assertIncludes(migration, indexName, `required index ${indexName}`);
}

assertIncludes(migrationPlan, "Status: design/proof only.", "migration plan status");
assertIncludes(migrationPlan, "The draft migration has not been applied to production.", "migration plan unapplied status");
assertIncludes(migrationPlan, "`service_role` / backend worker is the only intended writer", "migration plan write authority");
assertIncludes(migrationPlan, "Public CDN eligibility must never come from app/client input", "migration plan client trust boundary");
assertIncludes(migrationPlan, "Clients cannot mark rows ready.", "migration plan RLS requirements");
assertIncludes(migrationPlan, "Clients cannot set `public_playback_path`.", "migration plan RLS requirements");
assertIncludes(migrationPlan, "Clients cannot set `is_public_playback_safe`.", "migration plan RLS requirements");
assertIncludes(migrationPlan, "Owner approval to apply the migration.", "migration plan activation gate");

assertIncludes(architecture, "Trusted backend migration path status:", "architecture migration status");
assertIncludes(vodDoc, "Trusted backend migration path:", "VOD migration status");
assertIncludes(currentState, "Trusted backend migration path is design/proof-only:", "current state migration status");
assertIncludes(nextTask, "Trusted backend migration path exists as docs, a draft SQL migration, and `npm run proof:media-rendition-migration-policy` only;", "next task migration status");

assertMatches(
  docsCorpus,
  /\b(production DB migration|draft migration|migration)\b[^.]*\b(not applied|has not been applied|not live)\b/i,
  "docs must say production migration is not applied",
);
assertMatches(
  docsCorpus,
  /\bproduction playback\b[^.]*\b(unchanged|not switched|remains signed-origin fallback|remains unchanged)\b/i,
  "docs must say production playback is unchanged",
);
assertMatches(
  docsCorpus,
  /\bclients?\b[^.]*\b(cannot|must never|may not)\b[^.]*\b(is_ready|ready|is_public_playback_safe|public_playback_path|trusted CDN eligibility|trusted rows)\b/i,
  "docs must say clients cannot write trusted eligibility fields",
);

assertNotMatches(
  docsCorpus,
  /\bproduction (?:DB )?migration (?:is )?(?:applied|live|active)\b/i,
  "docs must not claim production migration is applied",
);
for (const sentence of splitSentences(docsCorpus)) {
  if (
    /\bproduction transcod(?:e|er|ing|e queue|e service)\b/i.test(sentence)
    && /\b(live|active|deployed|production-ready)\b/i.test(sentence)
    && !hasNegatingLanguage(sentence)
  ) {
    fail(`docs must not claim production transcoding is live: ${sentence}`);
  }
  if (
    /\bproduction playback\b/i.test(sentence)
    && /\b(switched|migrated|uses Cloudflare|uses media\.chillywoodstream\.com)\b/i.test(sentence)
    && !hasNegatingLanguage(sentence)
  ) {
    fail(`docs must not claim production playback switched: ${sentence}`);
  }
}
assertNotMatches(
  docsCorpus,
  /\bclient(?:s)?\b[^.]*\b(can|may|allowed to)\b[^.]*\b(set|write|mark)\b[^.]*\b(is_ready|ready|is_public_playback_safe|public_playback_path|trusted CDN eligibility)\b/i,
  "docs must not allow client trusted writes",
);
assertNotMatches(
  proofCorpus,
  /\bAKIA[0-9A-Z]{16}\b|\bASIA[0-9A-Z]{16}\b|\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  "proof corpus secret scan",
);

if (failures.length) {
  console.error("Media rendition migration policy proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  proof: "media-rendition-migration-policy",
  draftMigration: draftMigrationPath,
  productionMigrationApplied: false,
  productionPlaybackSwitched: false,
  productionTranscodeWorkerLive: false,
  clientTrustedWritesAllowed: false,
  serviceRoleWorkerRequired: true,
  publicCdnEligibilityFromTrustedRowsOnly: true,
  originalMasterNormalPlaybackAllowed: false,
  premiumPrivatePublicCdnWithoutTokenAllowed: false,
}, null, 2));
