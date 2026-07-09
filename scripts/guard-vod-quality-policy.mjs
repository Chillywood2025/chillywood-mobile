#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const assertIncludes = (content, needle, label) => {
  if (!content.includes(needle)) {
    throw new Error(`${label}: missing ${needle}`);
  }
};

const assertNotIncludes = (content, needle, label) => {
  if (content.includes(needle)) {
    throw new Error(`${label}: unexpected ${needle}`);
  }
};

const assertNotMatches = (content, pattern, label) => {
  const match = content.match(pattern);
  if (match) {
    throw new Error(`${label}: unexpected ${match[0]}`);
  }
};

const migration = read("supabase/migrations/202605140010_vod_quality_ladder_resolver.sql");
const scanSafeResolverMigration = read("supabase/migrations/20260623170000_creator_media_scan_safe_playback_resolver.sql");
const trustedRenditionMigration = read("supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql");
const vodDoc = read("docs/VOD_QUALITY_LADDER_AND_PLAYBACK_RESOLVER.md");
const mediaMigrationPlan = read("docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md");
const mediaTranscodeWorkerRunbook = read("docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md");
const vodLib = read("_lib/vodQuality.ts");
const mediaRenditionMetadata = read("_lib/mediaRenditionMetadata.ts");
const mediaTranscodeOperator = read("_lib/mediaTranscodeOperator.ts");
const mediaTranscodeWorkerSafety = read("_lib/mediaTranscodeWorkerSafety.ts");
const mediaRecoveryOperator = read("_lib/mediaRecoveryOperator.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const mediaStorageFunction = read("supabase/functions/media-storage/index.ts");
const player = read("app/player/[id].tsx");
const performancePolicy = read("_lib/performancePolicy.ts");
const packageJson = read("package.json");
const mediaRenditionMetadataProof = read("scripts/proof-media-rendition-metadata.mjs");
const mediaRenditionMigrationPolicyProof = read("scripts/proof-media-rendition-migration-policy.mjs");
const mediaRenditionMigrationDryRunProof = read("scripts/proof-media-rendition-migration-dry-run.mjs");
const mediaTranscodeWorkerLocalProof = read("scripts/proof-media-transcode-worker-local.mjs");
const mediaTranscodeOperatorProof = read("scripts/proof-media-transcode-operator-control.mjs");
const mediaTranscodeWorkerAuditorProof = read("scripts/proof-media-transcode-worker-auditor.mjs");

assertIncludes(performancePolicy, "VOD_FREE_MAX_HEIGHT_V1 = 480", "performance policy");
assertIncludes(performancePolicy, "VOD_PREMIUM_MAX_HEIGHT_V1 = 1080", "performance policy");

assertIncludes(migration, 'create table if not exists public."video_renditions"', "VOD migration");
assertIncludes(migration, '"quality_label" in (\'original\', \'360p\', \'480p\', \'720p\', \'1080p\')', "VOD migration");
assertIncludes(migration, '"quality_label" <> \'original\'', "resolver excludes original");
assertIncludes(migration, '"access_tier" = \'free\'', "resolver free tier");
assertIncludes(migration, '"access_tier" = \'premium\' and v_has_premium', "resolver premium entitlement");
assertIncludes(migration, "public.user_has_active_entitlement(v_viewer_id::text, array['premium'::text])", "resolver premium check");
assertIncludes(migration, "'pending_renditions'", "legacy fallback truth");
assertIncludes(migration, "video_renditions_select_owner_operator", "rendition RLS");
assertIncludes(migration, "video_renditions_no_direct_client_insert", "no direct client insert");
assertIncludes(migration, "creator_videos_storage_select_premium_renditions", "premium storage policy");
assertIncludes(scanSafeResolverMigration, "public.media_scan_public_safe(v_video.\"scan_status\")", "scan-safe resolver");
assertIncludes(scanSafeResolverMigration, "public.media_scan_public_safe(rendition.\"scan_status\")", "scan-safe resolver");

assertIncludes(vodLib, "VOD_FREE_PLAYBACK_QUALITY_LABELS = [\"360p\", \"480p\"]", "VOD lib");
assertIncludes(vodLib, "VOD_PREMIUM_PLAYBACK_QUALITY_LABELS = [\"720p\", \"1080p\"]", "VOD lib");
assertIncludes(vodLib, "resolveVideoPlayback", "VOD resolver helper");
assertIncludes(vodLib, "resolveSignedVideoPlaybackSource", "signed resolver helper");
assertIncludes(vodLib, "recordOriginalVideoRendition", "original rendition helper");
assertIncludes(vodLib, "publicPlaybackSafe: false", "production VOD signed-origin fallback");

assertIncludes(vodDoc, "Trusted rendition metadata foundation:", "VOD doc trusted rendition foundation");
assertIncludes(vodDoc, "Existing `video_renditions` rows are a live schema foundation, but they are not yet trusted production Cloudflare R2/HLS playback rows.", "VOD doc trusted row boundary");
assertIncludes(vodDoc, "`_lib/mediaRenditionMetadata.ts` defines the source-only `TrustedMediaRenditionMetadata` contract", "VOD doc trusted source model");
assertIncludes(vodDoc, "Original/master rows are private processing sources and cannot be marked normal playback.", "VOD doc original/master CDN boundary");
assertIncludes(vodDoc, "Premium/private rows still require signed/token CDN access later and cannot use public CDN while `MEDIA_CDN_SIGNING_MODE=off`.", "VOD doc Premium/private CDN boundary");
assertIncludes(vodDoc, "`npm run proof:media-rendition-metadata` uses proof-only City Lights HLS fixture rows for 360p and 480p", "VOD doc trusted fixture proof");
assertIncludes(vodDoc, "Trusted backend migration path:", "VOD doc trusted backend migration path");
assertIncludes(vodDoc, "Migration `supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql` is applied to production as schema only", "VOD doc production schema migration");
assertIncludes(vodDoc, "service role or backend worker authority the only trusted write path", "VOD doc trusted write authority");
assertIncludes(vodDoc, "Clients cannot mark rows ready, set `public_playback_path`, set `is_public_playback_safe`, set `worker_version`, set `source_hash`, or create public CDN eligibility from client-controlled data.", "VOD doc client trusted write block");
assertIncludes(vodDoc, "`npm run proof:media-rendition-migration-policy` statically proves the migration SQL and docs keep client writes blocked", "VOD doc migration policy proof");
assertIncludes(vodDoc, "`npm run proof:media-rendition-migration-dry-run` passes static SQL validation plus runtime apply/RLS checks in an in-memory disposable local Postgres runtime via `@electric-sql/pglite`.", "VOD doc migration dry-run runtime proof");
assertIncludes(vodDoc, "proves anon/authenticated trusted writes are denied, proves service-role/worker writes pass, proves resolver-safe anon select returns one clean public-ready row", "VOD doc migration dry-run RLS proof");
assertIncludes(vodDoc, "Production transcode worker runbook and local proof harness: `docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md` and `npm run proof:media-transcode-worker-local` model the future worker locally with the approved City Lights demo only.", "VOD doc production transcode worker local proof");
assertIncludes(vodDoc, "Operator-controlled worker safety:", "VOD doc operator control section");
assertIncludes(vodDoc, "`_lib/mediaTranscodeOperator.ts`, `_lib/mediaTranscodeWorkerSafety.ts`, `_lib/mediaRecoveryOperator.ts`", "VOD doc operator source helpers");
assertIncludes(vodDoc, "auditor pass before resolver trust", "VOD doc auditor before resolver trust");
assertIncludes(vodDoc, "Self-auditing reduces one-job risk but does not replace PITR for continuous production.", "VOD doc self-audit PITR boundary");
assertIncludes(vodDoc, "Production transcode worker design/local proof exists, but the production worker is not deployed.", "VOD doc production worker not deployed");
assertIncludes(vodDoc, "Backup/PITR gate status is Blocked", "VOD doc backup gate blocked");
assertIncludes(vodDoc, "`pitr_enabled=false`, `walg_enabled=true`, `backups=[]`, and `physical_backup_data={}`", "VOD doc backup gate readback");
assertIncludes(vodDoc, "paid PITR variants require explicit owner approval before any provider billing/add-on mutation", "VOD doc PITR billing approval");
assertIncludes(vodDoc, "PITR or owner-approved backup/restore readiness is required before future production worker writes, production backfill, or worker activation.", "VOD doc PITR worker gate");
assertIncludes(vodDoc, "Operator control and auditor proofs are source-only. They do not write production rows, do not deploy a worker, and do not switch playback.", "VOD doc operator production boundary");
assertIncludes(vodDoc, "Production schema readback and rollback-only RLS proof passed on 2026-07-09, final production row counts stayed zero, and production playback remains unchanged.", "VOD doc production schema proof");
assertIncludes(vodDoc, "Trusted backend migration schema is applied to production as empty schema only.", "VOD doc trusted migration schema-only");
assertIncludes(vodDoc, "Trusted backend migration dry-run passes in the embedded disposable local Postgres runtime, and production rollback-only RLS proof passed with final row counts back to zero.", "VOD doc trusted migration proof checkpoint");

assertIncludes(mediaMigrationPlan, "Status: production schema applied as schema only.", "trusted rendition migration plan status");
assertIncludes(mediaMigrationPlan, "Production schema migration status: applied to production on 2026-07-09 for project `bmkkhihfbmsnnmcqkoly` (`Chillywood2025's Project`);", "trusted rendition migration plan production schema status");
assertIncludes(mediaMigrationPlan, "Production data/write boundary: no production media backfill, real media row insert, production `video_renditions` write, production resolver bridge, production transcode worker, or production playback switch is live.", "trusted rendition migration plan production data boundary");
assertIncludes(mediaMigrationPlan, "`service_role` / backend worker is the only intended writer", "trusted rendition migration plan service role writer");
assertIncludes(mediaMigrationPlan, "Public CDN eligibility must never come from app/client input", "trusted rendition migration plan client trust boundary");
assertIncludes(mediaMigrationPlan, "Clients cannot mark rows ready.", "trusted rendition migration plan ready write block");
assertIncludes(mediaMigrationPlan, "Clients cannot set `public_playback_path`.", "trusted rendition migration plan path write block");
assertIncludes(mediaMigrationPlan, "Clients cannot set `is_public_playback_safe`.", "trusted rendition migration plan public safety write block");
assertIncludes(mediaMigrationPlan, "A separate `media_renditions` table is safer", "trusted rendition migration plan separate table decision");
assertIncludes(mediaMigrationPlan, "## Dry-Run Status", "trusted rendition migration plan dry-run section");
assertIncludes(mediaMigrationPlan, "`npm run proof:media-rendition-migration-dry-run`", "trusted rendition migration plan dry-run proof script");
assertIncludes(mediaMigrationPlan, "Static SQL validation passed.", "trusted rendition migration plan static dry-run status");
assertIncludes(mediaMigrationPlan, "Runtime dry-run passed in an in-memory disposable local Postgres runtime via `@electric-sql/pglite`.", "trusted rendition migration plan runtime dry-run status");
assertIncludes(mediaMigrationPlan, "## Worker Runbook And Local Proof Status", "trusted rendition migration plan worker local proof section");
assertIncludes(mediaMigrationPlan, "`npm run proof:media-transcode-worker-local` is local proof only.", "trusted rendition migration plan local worker proof");
assertIncludes(mediaTranscodeWorkerRunbook, "Status: design and local proof only.", "media transcode worker runbook status");
assertIncludes(mediaTranscodeWorkerRunbook, "The worker must never mark `is_ready=true` before source probing, HLS generation, upload-path validation, manifest validation, and resolver eligibility checks pass.", "media transcode worker runbook ready guard");

assertIncludes(trustedRenditionMigration, 'create table if not exists public."media_transcode_jobs"', "trusted rendition draft jobs table");
assertIncludes(trustedRenditionMigration, 'create table if not exists public."media_renditions"', "trusted rendition draft renditions table");
assertIncludes(trustedRenditionMigration, 'alter table public."media_transcode_jobs" enable row level security;', "trusted rendition draft jobs RLS");
assertIncludes(trustedRenditionMigration, 'alter table public."media_renditions" enable row level security;', "trusted rendition draft renditions RLS");
assertIncludes(trustedRenditionMigration, 'grant all on table public."media_transcode_jobs" to "service_role";', "trusted rendition draft jobs service role grant");
assertIncludes(trustedRenditionMigration, 'grant all on table public."media_renditions" to "service_role";', "trusted rendition draft renditions service role grant");
assertIncludes(trustedRenditionMigration, "media_transcode_jobs_no_direct_client_insert", "trusted rendition draft jobs insert block");
assertIncludes(trustedRenditionMigration, "media_transcode_jobs_no_direct_client_update", "trusted rendition draft jobs update block");
assertIncludes(trustedRenditionMigration, "media_renditions_no_direct_client_insert", "trusted rendition draft renditions insert block");
assertIncludes(trustedRenditionMigration, "media_renditions_no_direct_client_update", "trusted rendition draft renditions update block");
assertIncludes(trustedRenditionMigration, 'constraint "media_renditions_original_private_check"', "trusted rendition draft original private constraint");
assertIncludes(trustedRenditionMigration, 'constraint "media_renditions_hd_not_public_free_check"', "trusted rendition draft HD public/free constraint");
assertIncludes(trustedRenditionMigration, 'constraint "media_renditions_ready_requires_worker_proof_check"', "trusted rendition draft ready worker proof constraint");
assertIncludes(trustedRenditionMigration, 'constraint "media_renditions_public_cdn_safety_check"', "trusted rendition draft public CDN safety constraint");
assertIncludes(trustedRenditionMigration, '"is_ready" = true', "trusted rendition draft ready public CDN requirement");
assertIncludes(trustedRenditionMigration, '"is_public_playback_safe" = true', "trusted rendition draft public safety requirement");
assertIncludes(trustedRenditionMigration, '"bucket_role" = \'public_playback\'', "trusted rendition draft public bucket role requirement");
assertIncludes(trustedRenditionMigration, '"scan_status" in (\'clean\', \'approved\')', "trusted rendition draft scan requirement");
assertIncludes(trustedRenditionMigration, '"moderation_status" in (\'clean\', \'approved\', \'allowed\')', "trusted rendition draft moderation requirement");
assertIncludes(trustedRenditionMigration, '"public_playback_path" like \'playback/public/%\'', "trusted rendition draft public prefix requirement");
assertIncludes(trustedRenditionMigration, 'originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned', "trusted rendition draft forbidden prefix guard");
assertNotMatches(trustedRenditionMigration, /\bgrant\s+(insert|update|delete|all)\b[^;]*\bto\s+"?(anon|authenticated)"?/i, "trusted rendition draft must not grant client writes");

assertIncludes(mediaRenditionMetadata, "TrustedMediaRenditionMetadata", "trusted media rendition metadata model");
assertIncludes(mediaRenditionMetadata, "delivery_format", "trusted media rendition delivery format field");
assertIncludes(mediaRenditionMetadata, "delivery_provider", "trusted media rendition delivery provider field");
assertIncludes(mediaRenditionMetadata, "storage_provider", "trusted media rendition storage provider field");
assertIncludes(mediaRenditionMetadata, "bucket_role", "trusted media rendition bucket role field");
assertIncludes(mediaRenditionMetadata, "public_playback_path", "trusted media rendition public playback path field");
assertIncludes(mediaRenditionMetadata, "manifest_path", "trusted media rendition manifest path field");
assertIncludes(mediaRenditionMetadata, "variant_playlist_path", "trusted media rendition variant playlist field");
assertIncludes(mediaRenditionMetadata, "cache_policy", "trusted media rendition cache policy field");
assertIncludes(mediaRenditionMetadata, "scan_status", "trusted media rendition scan status field");
assertIncludes(mediaRenditionMetadata, "moderation_status", "trusted media rendition moderation status field");
assertIncludes(mediaRenditionMetadata, "is_public_playback_safe", "trusted media rendition public safety flag");
assertIncludes(mediaRenditionMetadata, "is_original", "trusted media rendition original flag");
assertIncludes(mediaRenditionMetadata, "is_ready", "trusted media rendition readiness flag");
assertIncludes(mediaRenditionMetadata, "canUseTrustedRenditionForPublicCdn", "trusted media rendition CDN gate");
assertIncludes(mediaRenditionMetadata, "buildMediaDeliveryAssetFromTrustedRendition", "trusted media rendition resolver bridge");
assertIncludes(mediaRenditionMetadata, "buildCityLightsTrustedHlsRenditionFixtures", "trusted media rendition City Lights proof fixture");
assertIncludes(mediaRenditionMetadata, "original_or_master_blocked", "trusted media rendition original/master block");
assertIncludes(mediaRenditionMetadata, "premium_requires_token_cdn", "trusted media rendition Premium block");
assertIncludes(mediaRenditionMetadata, "private_requires_token_cdn", "trusted media rendition private block");
assertIncludes(mediaRenditionMetadata, "scan_not_clean", "trusted media rendition scan block");
assertIncludes(mediaRenditionMetadata, "moderation_not_allowed", "trusted media rendition moderation block");
assertIncludes(mediaRenditionMetadata, "wrong_bucket_role", "trusted media rendition bucket role block");
assertIncludes(mediaRenditionMetadata, "non_playback_prefix", "trusted media rendition prefix block");
assertNotMatches(mediaRenditionMetadata, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "trusted media rendition metadata helper must not perform network or database writes");
assertIncludes(mediaTranscodeOperator, "MEDIA_TRANSCODE_OPERATOR_DEFAULT_MODE: MediaTranscodeOperatorMode = \"disabled\"", "media transcode operator disabled default");
assertIncludes(mediaTranscodeOperator, "emergency_stop_always_blocks", "media transcode operator emergency stop");
assertIncludes(mediaTranscodeOperator, "worker_cannot_self_enable", "media transcode operator worker self-enable block");
assertIncludes(mediaTranscodeOperator, "one_job_requires_source_allowlist", "media transcode operator source allowlist");
assertIncludes(mediaTranscodeOperator, "continuous_requires_backup_gate_closed", "media transcode operator continuous backup gate");
assertIncludes(mediaTranscodeOperator, "resolveOperatorAutoDisable", "media transcode operator auto-disable helper");
assertIncludes(mediaTranscodeWorkerSafety, "missing_operator_lease", "media transcode worker safety no lease");
assertIncludes(mediaTranscodeWorkerSafety, "lease_source_mismatch", "media transcode worker safety source mismatch");
assertIncludes(mediaTranscodeWorkerSafety, "max_job_count_exceeded", "media transcode worker safety max jobs");
assertIncludes(mediaTranscodeWorkerSafety, "canWorkerWriteRenditionStatus", "media transcode worker safety pending audit helper");
assertIncludes(mediaRecoveryOperator, "auditMediaRecoveryBatch", "media recovery operator audit helper");
assertIncludes(mediaRecoveryOperator, "unexpected_ready_row_before_audit", "media recovery operator ready before audit block");
assertIncludes(mediaRecoveryOperator, "canResolverTrustAuditedRows", "media recovery operator resolver trust helper");
assertNotMatches(mediaTranscodeOperator, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "media transcode operator helper must not perform network or database writes");
assertNotMatches(mediaTranscodeWorkerSafety, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "media transcode worker safety helper must not perform network or database writes");
assertNotMatches(mediaRecoveryOperator, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "media recovery operator helper must not perform network or database writes");

assertIncludes(packageJson, "\"proof:media-rendition-metadata\"", "trusted media rendition metadata proof script");
assertIncludes(packageJson, "\"proof:media-rendition-migration-policy\"", "trusted media rendition migration policy proof script");
assertIncludes(packageJson, "\"proof:media-rendition-migration-dry-run\"", "trusted media rendition migration dry-run proof script");
assertIncludes(packageJson, "\"proof:media-transcode-worker-local\"", "local transcode worker proof script");
assertIncludes(packageJson, "\"proof:media-transcode-backup-gate\"", "backup PITR proof script");
assertIncludes(packageJson, "\"proof:media-transcode-operator-control\"", "operator control proof script");
assertIncludes(packageJson, "\"proof:media-transcode-worker-auditor\"", "worker auditor proof script");
assertIncludes(packageJson, "\"proof:media-recovery-operator\"", "recovery operator proof script");
assertIncludes(packageJson, "\"proof:media-transcode-worker-safety\"", "worker safety proof script");
assertIncludes(mediaTranscodeOperatorProof, "defaultDisabled", "operator proof default disabled");
assertIncludes(mediaTranscodeOperatorProof, "continuousModeBlockedByBackupGate", "operator proof continuous backup gate");
assertIncludes(mediaTranscodeOperatorProof, "workerSelfEnableDenied", "operator proof worker self-enable denied");
assertIncludes(mediaTranscodeOperatorProof, "auditFailureQuarantinesAndAutoDisables", "operator proof quarantine auto-disable");
assertIncludes(mediaTranscodeWorkerAuditorProof, "operatorLeaseRequired", "worker auditor proof lease required");
assertIncludes(mediaTranscodeWorkerAuditorProof, "auditPassRequiredBeforeResolverTrust", "worker auditor proof audit before trust");
assertIncludes(mediaTranscodeWorkerAuditorProof, "rollbackPlanScopedToBatchAndPrefix", "worker auditor proof rollback scope");
assertIncludes(mediaTranscodeWorkerAuditorProof, "autoDisableAfterAuditPassOrFailure", "worker auditor proof auto-disable");
assertIncludes(mediaRenditionMetadataProof, "trusted-media-rendition-metadata", "trusted media rendition metadata proof mode");
assertIncludes(mediaRenditionMetadataProof, "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1", "trusted media rendition City Lights source id");
assertIncludes(mediaRenditionMetadataProof, "360p", "trusted media rendition 360p fixture proof");
assertIncludes(mediaRenditionMetadataProof, "480p", "trusted media rendition 480p fixture proof");
assertIncludes(mediaRenditionMetadataProof, "not_ready", "trusted media rendition not-ready proof");
assertIncludes(mediaRenditionMetadataProof, "original_or_master_blocked", "trusted media rendition original/master proof");
assertIncludes(mediaRenditionMetadataProof, "premium_requires_token_cdn", "trusted media rendition Premium proof");
assertIncludes(mediaRenditionMetadataProof, "private_requires_token_cdn", "trusted media rendition private proof");
assertIncludes(mediaRenditionMetadataProof, "scan_not_clean", "trusted media rendition scan proof");
assertIncludes(mediaRenditionMetadataProof, "moderation_not_allowed", "trusted media rendition moderation proof");
assertIncludes(mediaRenditionMetadataProof, "wrong_bucket_role", "trusted media rendition bucket role proof");
assertIncludes(mediaRenditionMetadataProof, "non_playback_prefix", "trusted media rendition non-public prefix proof");
assertIncludes(mediaRenditionMetadataProof, "not_in_public_playback_allowlist", "trusted media rendition allowlist proof");
assertIncludes(mediaRenditionMetadataProof, "default production creator-video path should keep signed-origin fallback", "trusted media rendition production fallback proof");
assertIncludes(mediaRenditionMetadataProof, "productionVideoRenditionWritesLive: false", "trusted media rendition no production row writes");
assertIncludes(mediaRenditionMetadataProof, "productionDbWritesEnabled: false", "trusted media rendition no production DB writes");
assertIncludes(mediaRenditionMetadataProof, "productionPlaybackSwitched: false", "trusted media rendition no production playback switch");
assertNotMatches(mediaRenditionMetadataProof, /\bsupabase\.from\b|\bcreateClient\b/i, "trusted rendition metadata proof must not write production DB or create a Supabase client");
assertIncludes(mediaRenditionMigrationPolicyProof, "media-rendition-migration-policy", "trusted media rendition migration policy proof mode");
assertIncludes(mediaRenditionMigrationPolicyProof, "supabase/migrations/20260709033207_trusted_media_transcode_renditions.sql", "trusted media rendition migration policy draft path");
assertIncludes(mediaRenditionMigrationPolicyProof, "clientTrustedWritesAllowed: false", "trusted media rendition migration no client writes proof");
assertIncludes(mediaRenditionMigrationPolicyProof, "serviceRoleWorkerRequired: true", "trusted media rendition migration service role proof");
assertIncludes(mediaRenditionMigrationPolicyProof, "publicCdnEligibilityFromTrustedRowsOnly: true", "trusted media rendition migration trusted rows proof");
assertIncludes(mediaRenditionMigrationPolicyProof, "productionSchemaMigrationApplied: true", "trusted media rendition migration production schema apply");
assertIncludes(mediaRenditionMigrationPolicyProof, "productionMediaRowsWritten: false", "trusted media rendition migration no production media rows");
assertIncludes(mediaRenditionMigrationPolicyProof, "productionBackfillRun: false", "trusted media rendition migration no production backfill");
assertIncludes(mediaRenditionMigrationPolicyProof, "productionPlaybackSwitched: false", "trusted media rendition migration no production playback switch");
assertNotMatches(mediaRenditionMigrationPolicyProof, /\bsupabase\.from\b|\bcreateClient\b/i, "trusted rendition migration policy proof must not write production DB or create a Supabase client");
assertIncludes(mediaRenditionMigrationDryRunProof, "media-rendition-migration-dry-run", "trusted media rendition migration dry-run proof mode");
assertIncludes(mediaRenditionMigrationDryRunProof, "MEDIA_RENDITION_DRY_RUN_DATABASE_URL", "trusted media rendition migration dry-run safe DB env");
assertIncludes(mediaRenditionMigrationDryRunProof, "pglite_disposable_local", "trusted media rendition migration dry-run embedded runtime proof");
assertIncludes(mediaRenditionMigrationDryRunProof, "runtimeApplyPassed", "trusted media rendition migration dry-run runtime apply field");
assertIncludes(mediaRenditionMigrationDryRunProof, "clientWriteDenied", "trusted media rendition migration dry-run client denial field");
assertIncludes(mediaRenditionMigrationDryRunProof, "serviceRoleWritePassed", "trusted media rendition migration dry-run service role field");
assertIncludes(mediaRenditionMigrationDryRunProof, "resolverSafeSelectPassed", "trusted media rendition migration dry-run resolver select field");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionDbRefused", "trusted media rendition migration dry-run production refusal field");
assertIncludes(mediaRenditionMigrationDryRunProof, "noSecretsPrinted", "trusted media rendition migration dry-run no secrets field");
assertIncludes(mediaRenditionMigrationDryRunProof, "clientWriteDenials", "trusted media rendition migration dry-run client denial proof");
assertIncludes(mediaRenditionMigrationDryRunProof, "serviceRoleWorkerWrites", "trusted media rendition migration dry-run service role proof");
assertIncludes(mediaRenditionMigrationDryRunProof, "resolverSafeSelect", "trusted media rendition migration dry-run resolver-safe select proof");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionSchemaMigrationApplied: true", "trusted media rendition migration dry-run production schema apply");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionDataRowsWritten: false", "trusted media rendition migration dry-run no production data rows");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionBackfillRun: false", "trusted media rendition migration dry-run no production backfill");
assertIncludes(mediaRenditionMigrationDryRunProof, "productionPlaybackSwitched: false", "trusted media rendition migration dry-run no production playback switch");
assertIncludes(mediaTranscodeWorkerLocalProof, "media-transcode-worker-local", "local transcode worker proof mode");
assertIncludes(mediaTranscodeWorkerLocalProof, "playback/public/proof-worker/chillywood-city-lights/v1-b670602fa00934ca-local-hls", "local transcode worker output prefix");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionWorkerDeployed: false", "local transcode worker no production worker deploy");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionDbWritesEnabled: false", "local transcode worker no production DB writes");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionRowsWritten: false", "local transcode worker no production row writes");
assertIncludes(mediaTranscodeWorkerLocalProof, "productionPlaybackSwitched: false", "local transcode worker no production playback switch");
assertIncludes(mediaTranscodeWorkerLocalProof, "pitrBackupGateRequired: true", "local transcode worker PITR gate");
assertNotMatches(mediaTranscodeWorkerLocalProof, /\bsupabase\.from\b|\bcreateClient\b|\bwrangler\b/i, "local transcode worker proof must not write production DB, create a Supabase client, or upload through Wrangler");

assertIncludes(creatorVideos, "resolveSignedVideoPlaybackSource", "creator video player resolver integration");
assertIncludes(creatorVideos, "recordOriginalVideoRendition(id)", "creator upload original status");
assertIncludes(creatorVideos, "legacyQualityEnforcement === \"resolver_unavailable\"", "legacy resolver fallback");

assertIncludes(mediaStorageFunction, "readCreatorVideoRenditionForObject", "media storage rendition authorization");
assertIncludes(mediaStorageFunction, "userHasActiveEntitlement", "media storage premium entitlement");
assertIncludes(mediaStorageFunction, "rendition.qualityLabel === \"original\"", "media storage original guard");

assertIncludes(player, "readCreatorVideoForPlayer", "Player stays on creator video resolver path");
assertNotIncludes(player, "720p", "Player must not hardcode HD access");
assertNotIncludes(player, "1080p", "Player must not hardcode HD access");

console.log("VOD quality ladder/resolver guard passed.");
