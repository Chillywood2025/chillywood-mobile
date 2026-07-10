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

const requireText = (source, text, label) => assert(source.includes(text), `${label} missing ${text}`);
const forbidText = (source, text, label) => assert(!source.includes(text), `${label} must not include ${text}`);

requireText(helper, "chillywood-media-origin", "migration helper");
requireText(helper, "validateR2OriginTarget", "migration helper");
requireText(helper, "media.chillywoodstream.com", "migration helper public-domain denial");
requireText(helper, "playback/public/", "migration helper public-prefix denial");
requireText(helper, "isLiveKitHetznerReference", "migration helper LiveKit boundary");
requireText(helper, "hetzner_fallback_retained", "migration helper fallback retention");
requireText(helper, "sourceObjectKeyRedacted: true", "migration helper redaction");

requireText(cli, "mode === \"copy\" || mode === \"run\" || mode === \"db-update\"", "migration CLI blocked mutation modes");
requireText(cli, "copy_and_db_update_require_verified_trusted_copier_and_r2_origin_credentials", "migration CLI fail-closed reason");
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
assert(payload.copyReady === false, "copy remains blocked without verified copier");
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

console.log(JSON.stringify({
  ok: true,
  privateR2OriginBucket: "chillywood-media-origin",
  providerAbstractionModeled: true,
  manifestRedacted: true,
  copyFailsClosedWithoutTrustedCopier: true,
  dbUpdateBlockedUntilCopyVerified: true,
  originalsNeverTargetPublicPlayback: true,
  liveKitOutOfScope: true,
  noSecretsPrinted: true,
}, null, 2));
