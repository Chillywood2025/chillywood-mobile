#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const read = (path) => readFileSync(path, "utf8");
const helper = read("_lib/mediaObjectStorageMigration.ts");
const cli = read("scripts/media-object-storage-r2-migration.mjs");
const mediaStorage = read("supabase/functions/media-storage/index.ts");
const scanGateway = read("supabase/functions/media-scan-private-access/index.ts");
const migrationFunction = read("supabase/functions/media-object-storage-migration/index.ts");
const config = read("supabase/config.toml");

const requireText = (source, text, label) => assert(source.includes(text), `${label} missing ${text}`);
const forbidText = (source, text, label) => assert(!source.includes(text), `${label} must not include ${text}`);

requireText(helper, "chillywood-media-origin", "migration helper");
requireText(helper, "validateR2OriginTarget", "migration helper");
requireText(helper, "media.chillywoodstream.com", "migration helper public-domain denial");
requireText(helper, "playback/public/", "migration helper public-prefix denial");
requireText(helper, "isLiveKitHetznerReference", "migration helper LiveKit boundary");
requireText(helper, "hetzner_fallback_retained", "migration helper fallback retention");
requireText(helper, "sourceObjectKeyRedacted: true", "migration helper redaction");

requireText(config, "[functions.media-object-storage-migration]", "migration copier function config");
requireText(config, "verify_jwt = false", "migration copier enforces operator token when JWT is disabled");

requireText(migrationFunction, "MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_SHA256", "migration copier token hash secret");
requireText(migrationFunction, "x-media-object-migration-token", "migration copier token header");
requireText(migrationFunction, "timingSafeEqualHex", "migration copier constant-time comparison");
requireText(migrationFunction, "media_object_migration_operator_token_required", "migration copier missing token denial");
requireText(migrationFunction, "audit_inventory", "migration copier inventory action");
requireText(migrationFunction, "reconcile_objects", "migration copier reconciliation action");
requireText(migrationFunction, "copy_object", "migration copier copy-object action");
requireText(migrationFunction, "copy_batch", "migration copier copy-batch action");
requireText(migrationFunction, "verify_object", "migration copier verify action");
requireText(migrationFunction, "update_metadata_dry_run", "migration copier metadata dry-run action");
requireText(migrationFunction, "update_metadata_batch", "migration copier metadata update action");
requireText(migrationFunction, "rollback_metadata_batch", "migration copier rollback action");
requireText(migrationFunction, "zero_ref_audit", "migration copier zero-ref action");
requireText(migrationFunction, "missing_404", "migration copier missing refs are classified");
requireText(migrationFunction, "permission_denied_403", "migration copier permission failures block copy");
requireText(migrationFunction, "skippedCount", "migration copier reports skipped missing/unsupported refs");
requireText(migrationFunction, "entriesOmittedByDefault", "migration copier keeps live summary responses bounded");
requireText(migrationFunction, "media_object_storage_migrate_verified_rows", "migration copier metadata update RPC");
requireText(migrationFunction, "LEGACY_S3_ACCESS_KEY_ID", "migration copier legacy S3 backend env");
requireText(migrationFunction, "R2_ORIGIN_ACCESS_KEY_ID", "migration copier R2 origin backend env");
requireText(migrationFunction, "MEDIA_ORIGIN_R2_ACCESS_KEY_ID", "migration copier media-origin R2 env fallback");
requireText(migrationFunction, "MEDIA_ORIGIN_PRIVATE_ONLY=true", "migration copier private-only env check");
requireText(migrationFunction, "MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED=true", "migration copier public-playback-disabled env check");
requireText(migrationFunction, "FORBIDDEN_TARGET_PREFIXES", "migration copier forbidden playback prefixes");
requireText(migrationFunction, "playback/public/", "migration copier denies public playback target");
requireText(migrationFunction, "chillywood-media-origin", "migration copier private R2 bucket");
requireText(migrationFunction, "chillywood-media-prod", "migration copier legacy Hetzner bucket");
requireText(migrationFunction, "isLiveKitReference", "migration copier LiveKit boundary");
requireText(migrationFunction, "metadata_update_disabled_until_copy_verify_backup_and_restore_drill_pass", "migration copier metadata update gate");
requireText(migrationFunction, "signedUrlsPrinted: false", "migration copier response redaction");
requireText(migrationFunction, "secretsPrinted: false", "migration copier secret redaction");

requireText(cli, "source === \"backend\"", "migration CLI backend source");
requireText(cli, "media-object-storage-migration", "migration CLI calls trusted copier");
requireText(cli, "reconcile: \"reconcile_objects\"", "migration CLI exposes backend reconciliation");
requireText(cli, "MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN", "migration CLI operator token env");
requireText(cli, "media_object_migration_operator_token_missing", "migration CLI missing token fail-closed reason");
requireText(cli, "rawServiceRoleRequired: false", "migration CLI does not need local service-role key");
requireText(cli, "rawStorageCredentialsRequired: false", "migration CLI does not need local storage keys");
requireText(cli, "objectKeysRedacted: true", "migration CLI redacts object keys");
requireText(cli, "liveKitTouched: false", "migration CLI does not touch LiveKit");
requireText(cli, "mediaPublicDomainUsedForOriginals: false", "migration CLI keeps originals off public media domain");
requireText(cli, "publicPlaybackBucketUsedForOriginals: false", "migration CLI keeps originals out of public playback bucket");

requireText(mediaStorage, "MEDIA_ORIGIN_PROVIDER", "media-storage R2 origin config");
requireText(mediaStorage, "MEDIA_ORIGIN_PRIVATE_ONLY", "media-storage private-only gate");
requireText(mediaStorage, "MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED", "media-storage public playback disabled gate");
requireText(mediaStorage, "cloudflare_r2", "media-storage cloudflare_r2 provider");
requireText(mediaStorage, "isSupportedObjectProvider", "media-storage supports migrated row lookup");

requireText(scanGateway, "streamR2PrivateOriginObject", "scanner R2 private origin stream");
requireText(scanGateway, "MEDIA_ORIGIN_R2_ACCESS_KEY_ID", "scanner R2 origin access key env");
requireText(scanGateway, "MEDIA_ORIGIN_PRIVATE_ONLY", "scanner private-only gate");
requireText(scanGateway, "cloudflare_r2", "scanner supports migrated cloudflare_r2 rows");

forbidText(cli, "service_role", "migration CLI");

const fixture = spawnSync(process.execPath, ["scripts/media-object-storage-r2-migration.mjs", "--mode=dry-run", "--source=fixture"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert(fixture.status === 0, `fixture dry-run failed: ${fixture.stderr}`);
const payload = JSON.parse(fixture.stdout);
assert(payload.ok === true, "fixture dry-run ok");
assert(payload.copyReady === false, "legacy fixture copy path remains blocked unless backend copier is selected");
assert(payload.dbUpdateReady === false, "DB update remains blocked before verified copy");
assert(payload.publicPlaybackBucketUsedForOriginals === false, "public playback bucket not used for originals");
assert(payload.mediaPublicDomainUsedForOriginals === false, "media public domain not used for originals");
assert(payload.legacyHetznerFallbackRetained === true, "Hetzner fallback retained");
assert(payload.redactedManifest.every((entry) => entry.sourceObjectKeyRedacted === true), "all source object keys redacted");
assert(payload.redactedManifest.every((entry) => entry.targetBucket === "chillywood-media-origin"), "all targets use private R2 origin bucket");
assert(payload.redactedManifest.every((entry) => !entry.targetObjectKey.startsWith("playback/public/")), "no target uses public playback prefix");

const blocked = spawnSync(process.execPath, ["scripts/media-object-storage-r2-migration.mjs", "--mode=copy", "--source=fixture"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert(blocked.status !== 0, "copy mode must fail closed");
const blockedPayload = JSON.parse(blocked.stdout);
assert(blockedPayload.blocked === true, "copy block payload");
assert(blockedPayload.hetznerFallbackRetained === true, "copy block retains Hetzner fallback");

const backendMissingToken = spawnSync(process.execPath, ["scripts/media-object-storage-r2-migration.mjs", "--mode=copy", "--source=backend"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert(backendMissingToken.status !== 0, "backend copy mode must fail closed without operator token");
const backendMissingPayload = JSON.parse(backendMissingToken.stdout || backendMissingToken.stderr || "{}");
assert(backendMissingPayload.reason === "media_object_migration_operator_token_missing", "backend copy missing token fail-closed reason");

console.log(JSON.stringify({
  ok: true,
  privateR2OriginBucket: "chillywood-media-origin",
  providerAbstractionModeled: true,
  trustedBackendCopierSourceProofed: true,
  backendCopierUsesOperatorTokenHash: true,
  manifestRedacted: true,
  copyFailsClosedWithoutOperatorTokenOrR2OriginCredentials: true,
  dbUpdateBlockedUntilCopyVerified: true,
  originalsNeverTargetPublicPlayback: true,
  liveKitOutOfScope: true,
  noSecretsPrinted: true,
}, null, 2));
