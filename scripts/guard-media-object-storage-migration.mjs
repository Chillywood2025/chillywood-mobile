#!/usr/bin/env node

import { readFileSync } from "node:fs";

const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => readFileSync(path, "utf8");
const includes = (source, text, label) => {
  if (!source.includes(text)) fail(`${label} missing ${text}`);
};
const includesAny = (source, texts, label) => {
  if (!texts.some((text) => source.includes(text))) fail(`${label} missing one of: ${texts.join(" | ")}`);
};
const notIncludes = (source, text, label) => {
  if (source.includes(text)) fail(`${label} must not include ${text}`);
};

const runbook = read("docs/MEDIA_OBJECT_STORAGE_R2_MIGRATION_RUNBOOK.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const architecture = read("docs/MEDIA_DELIVERY_SCALE_ARCHITECTURE.md");
const automation = read("docs/MEDIA_AUTOMATION_OPERATOR_RUNBOOK.md");
const worker = read("docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md");
const helper = read("_lib/mediaObjectStorageMigration.ts");
const cli = read("scripts/media-object-storage-r2-migration.mjs");
const mediaStorage = read("supabase/functions/media-storage/index.ts");
const scanGateway = read("supabase/functions/media-scan-private-access/index.ts");
const migrationFunction = read("supabase/functions/media-object-storage-migration/index.ts");
const config = read("supabase/config.toml");

const docs = [runbook, currentState, nextTask, architecture, automation, worker].join("\n\n");

includes(docs, "Hetzner Object Storage", "migration docs");
includes(docs, "Hetzner LiveKit", "migration docs");
includes(docs, "do not shut down Hetzner LiveKit", "migration docs");
includes(docs, "chillywood-media-origin", "migration docs");
includes(docs, "private R2 origin", "migration docs");
includes(docs, "0 Hetzner object-storage", "migration docs");
includes(docs, "Hetzner fallback retained", "migration docs");
includesAny(docs, ["no media was processed", "No media was processed"], "migration docs");
includesAny(docs, ["no playback rows were written", "No playback rows were written", "no media_transcode_jobs or media_renditions rows were written"], "migration docs");
includes(docs, "shutdown-ready by active-reference semantics", "migration docs");
includes(docs, "activeUnresolvedHetznerObjectRefs=0", "migration docs");
includes(docs, "not deleted, not marked migrated, and not replaced with fake R2 objects", "migration docs");

includes(helper, "MEDIA_ORIGIN_BUCKET = \"chillywood-media-origin\"", "migration helper");
includes(helper, "validateR2OriginTarget", "migration helper");
includes(helper, "isLiveKitHetznerReference", "migration helper");
includes(helper, "canCloseHetznerObjectStorage", "migration helper");
includes(cli, "source === \"backend\"", "migration CLI");
includes(cli, "media-object-storage-migration", "migration CLI");
includes(cli, "MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN", "migration CLI");
includes(cli, "objectKeysRedacted: true", "migration CLI");
includes(cli, "liveKitTouched: false", "migration CLI");
includes(mediaStorage, "MEDIA_ORIGIN_PRIVATE_ONLY", "media-storage function");
includes(mediaStorage, "MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED", "media-storage function");
includes(mediaStorage, "provider: originStorage.provider", "media-storage function");
includes(scanGateway, "streamR2PrivateOriginObject", "scanner gateway");
includes(config, "[functions.media-object-storage-migration]", "migration copier config");
includes(migrationFunction, "MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_SHA256", "migration copier function");
includes(migrationFunction, "x-media-object-migration-token", "migration copier function");
includes(migrationFunction, "timingSafeEqualHex", "migration copier function");
includes(migrationFunction, "reconcile_objects", "migration copier function");
includes(migrationFunction, "missing_404", "migration copier function");
includes(migrationFunction, "permission_denied_403", "migration copier function");
includes(migrationFunction, "copy_batch", "migration copier function");
includes(migrationFunction, "update_metadata_batch", "migration copier function");
includes(migrationFunction, "rollback_metadata_batch", "migration copier function");
includes(migrationFunction, "media_object_storage_migrate_verified_rows", "migration copier function");
includes(migrationFunction, "media_object_storage_resolve_scan_job_refs", "migration copier function");
includes(migrationFunction, "activeUnresolvedHetznerObjectRefs", "migration copier function");
includes(migrationFunction, "rawRefsTreatedAsMigrated: false", "migration copier function");
includes(migrationFunction, "R2_ORIGIN_SECRET_ACCESS_KEY", "migration copier function");
includes(migrationFunction, "MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY", "migration copier function");
includes(migrationFunction, "metadata_update_disabled_until_copy_verify_backup_and_restore_drill_pass", "migration copier function");
includes(migrationFunction, "stale_ref_resolution_update_disabled_until_backup_and_dry_run_pass", "migration copier function");
includes(migrationFunction, "skippedCount", "migration copier function");
includes(migrationFunction, "entriesOmittedByDefault", "migration copier function");
includes(migrationFunction, "playback/public/", "migration copier function");
includes(migrationFunction, "liveKitTouched: false", "migration copier function");

notIncludes(runbook, "shut down Hetzner server", "migration runbook");
notIncludes(runbook, "shut down LiveKit", "migration runbook");
notIncludes(docs, "delete Hetzner objects now", "migration docs");
notIncludes(docs, "media.chillywoodstream.com for originals", "migration docs");
notIncludes(docs, "public originals", "migration docs");
notIncludes(docs, "Premium HD unsigned public", "migration docs");
notIncludes(docs, "eyJhbGci", "migration docs");
notIncludes(docs, "postgres://", "migration docs");
notIncludes(docs, "postgresql://", "migration docs");
notIncludes(cli, "eyJhbGci", "migration CLI");
notIncludes(cli, "postgres://", "migration CLI");
notIncludes(cli, "postgresql://", "migration CLI");
notIncludes(migrationFunction, "console.log", "migration copier function");
notIncludes(migrationFunction, "signedUrl,", "migration copier function");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  objectStorageLiveKitBoundary: true,
  zeroReferenceShutdownGate: true,
  privateR2OriginBoundary: true,
  hetznerFallbackRetainedUntilProof: true,
  noSecretsPrinted: true,
}, null, 2));
