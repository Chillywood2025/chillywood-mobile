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

const docs = [runbook, currentState, nextTask, architecture, automation, worker].join("\n\n");

includes(docs, "Hetzner Object Storage", "migration docs");
includes(docs, "Hetzner LiveKit", "migration docs");
includes(docs, "do not shut down Hetzner LiveKit", "migration docs");
includes(docs, "chillywood-media-origin", "migration docs");
includes(docs, "private R2 origin", "migration docs");
includes(docs, "0 Hetzner object-storage", "migration docs");
includes(docs, "Hetzner fallback retained", "migration docs");
includesAny(docs, ["no media was processed", "No media was processed"], "migration docs");
includesAny(docs, ["no media rows were written", "No media rows were written"], "migration docs");
includes(docs, "not ready for shutdown", "migration docs");

includes(helper, "MEDIA_ORIGIN_BUCKET = \"chillywood-media-origin\"", "migration helper");
includes(helper, "validateR2OriginTarget", "migration helper");
includes(helper, "isLiveKitHetznerReference", "migration helper");
includes(helper, "canCloseHetznerObjectStorage", "migration helper");
includes(cli, "copy_and_db_update_require_verified_trusted_copier_and_r2_origin_credentials", "migration CLI");
includes(cli, "objectKeysRedacted: true", "migration CLI");
includes(cli, "liveKitTouched: false", "migration CLI");
includes(mediaStorage, "MEDIA_ORIGIN_PRIVATE_ONLY", "media-storage function");
includes(mediaStorage, "MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED", "media-storage function");
includes(mediaStorage, "provider: originStorage.provider", "media-storage function");
includes(scanGateway, "streamR2PrivateOriginObject", "scanner gateway");

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
