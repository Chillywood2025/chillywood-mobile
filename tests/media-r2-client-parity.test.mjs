import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const mediaStorage = read("_lib/mediaStorage.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const socialAttachments = read("_lib/socialAttachments.ts");
const vodQuality = read("_lib/vodQuality.ts");
const clipStudio = read("_lib/clipStudio.ts");
const migration = read("supabase/migrations/202608250002_whole_app_media_authority_closure.sql");

test("the private-origin gateway recognizes both supported S3-compatible providers", () => {
  assert.match(
    mediaStorage,
    /provider === "s3" \|\| provider === "cloudflare_r2"/u,
  );
  assert.match(mediaStorage, /action: "verify_upload"/u);
  for (const header of ["Content-Length", "Content-Type", "If-None-Match"]) {
    assert.match(mediaStorage, new RegExp(`"${header}"`, "u"));
  }
  assert.match(mediaStorage, /sizeBytes: verifiedSizeBytes/u);
});

test("creator source, cover, and delete paths route R2 through the authority gateway", () => {
  assert.match(creatorVideos, /usesPrivateOriginMediaGateway\(input\.storageProvider\)/u);
  assert.match(creatorVideos, /usesPrivateOriginMediaGateway\(provider\)/u);
  assert.equal(creatorVideos.includes('provider === "s3"'), false);
  assert.ok(
    creatorVideos.indexOf("await deleteStoredMediaObject")
      < creatorVideos.indexOf('.from("videos").delete()'),
    "delivery authority/object deletion must finish before video metadata deletion",
  );
  assert.match(clipStudio, /usesPrivateOriginMediaGateway\(previousProvider\)/u);
  assert.equal(clipStudio.includes("createSignedMediaDownload"), false);
  assert.ok(
    clipStudio.indexOf('update\(update\)')
      < clipStudio.indexOf('objectKey: previousCoverPath'),
    "cover metadata must commit before the previous private object is retired",
  );
  assert.match(clipStudio, /coverMetadataCommitted = toText\(currentVideo\?\.thumb_storage_path\) === uploadedObject\.objectKey/u);
  assert.match(clipStudio, /deleteStoredMediaObject\([\s\S]*?objectKey: previousCoverPath,[\s\S]*?\)\.catch\(\(\) => undefined\)/u);
  assert.match(creatorVideos, /file_size_bytes: uploadedObject\.sizeBytes/u);
  assert.match(clipStudio, /fileSizeBytes: uploadedObject\.sizeBytes/u);
});

test("social attachments use the R2 gateway and preserve retry identity until deletion succeeds", () => {
  assert.match(socialAttachments, /usesPrivateOriginMediaGateway\(storageProvider\)/u);
  assert.match(socialAttachments, /usesPrivateOriginMediaGateway\(provider\)/u);
  assert.equal(socialAttachments.includes('provider === "s3"'), false);
  assert.ok(
    socialAttachments.indexOf("await deleteStoredMediaObject")
      < socialAttachments.indexOf('.from("social_attachments")\n    .delete()'),
    "object authority/deletion must finish before attachment metadata deletion",
  );
  assert.match(socialAttachments, /size_bytes: uploadedObject\.sizeBytes/u);
});

test("VOD fallback routes R2 through exact signed delivery", () => {
  assert.match(vodQuality, /usesPrivateOriginMediaGateway\(provider\)/u);
  assert.match(vodQuality, /createSignedMediaDownload/u);
});

test("database insertion accepts only the exact current R2 origin tuple", () => {
  assert.match(
    migration,
    /storage_provider = 'cloudflare_r2' and storage_bucket = 'chillywood-media-origin'/u,
  );
  assert.match(
    migration,
    /split_part\(coalesce\(nullif\(storage_object_key, ''\), storage_path\), '\/', 1\) = auth\.uid\(\)::text/u,
  );
});

test("restricted-owner cutover remediation scopes its trigger bypass to one transaction", () => {
  const disable = 'disable trigger "enforce_videos_account_access_guard"';
  const quarantine = "set scan_status = 'quarantined'";
  const thumbnailReset = "set thumb_url = null";
  const enable = 'enable trigger "enforce_videos_account_access_guard"';
  const transactionStart = `begin;\nalter table public.videos\n  ${disable}`;

  const transactionStartAt = migration.indexOf(transactionStart);
  const disableAt = migration.indexOf(disable);
  const quarantineAt = migration.indexOf(quarantine);
  const thumbnailResetAt = migration.indexOf(thumbnailReset);
  const enableAt = migration.indexOf(enable);
  const transactionEndAt = migration.indexOf('commit;', enableAt);

  assert.ok(transactionStartAt >= 0, "the trigger bypass starts in an explicit transaction");
  assert.ok(disableAt >= 0, "the exact account-access trigger is disabled for cutover DML");
  assert.ok(disableAt < quarantineAt, "the trigger is disabled before provenance quarantine");
  assert.ok(quarantineAt < thumbnailResetAt, "both trusted video remediations share the bounded window");
  assert.ok(thumbnailResetAt < enableAt, "the trigger is restored immediately after remediation");
  assert.ok(transactionEndAt >= enableAt, "the explicit transaction commits only after trigger restoration");
  assert.equal(migration.split(disable).length - 1, 1, "the exact trigger is disabled once");
  assert.equal(migration.split(enable).length - 1, 1, "the exact trigger is restored once");
  assert.doesNotMatch(migration, /disable trigger (?:all|user)/iu);
  assert.doesNotMatch(migration, /session_replication_role/iu);
  assert.doesNotMatch(
    migration,
    /create or replace function public\."enforce_videos_account_access_guard"/iu,
    "the migration does not install a permanent runtime bypass",
  );
});

test("profile-media cutover remediation scopes its new runtime guard to one transaction", () => {
  const disable = 'disable trigger "zz_guard_profile_media_client_authority"';
  const avatarReduction = 'set avatar_url = case';
  const backgroundReduction = 'set profile_background_url = case';
  const enable = 'enable trigger "zz_guard_profile_media_client_authority"';
  const transactionStart = `begin;\nalter table public.user_profiles\n  ${disable}`;

  const transactionStartAt = migration.indexOf(transactionStart);
  const disableAt = migration.indexOf(disable);
  const avatarReductionAt = migration.indexOf(avatarReduction, disableAt);
  const backgroundReductionAt = migration.indexOf(
    backgroundReduction,
    avatarReductionAt,
  );
  const enableAt = migration.indexOf(enable, backgroundReductionAt);
  const commitAt = migration.indexOf('commit;', enableAt);

  assert.ok(transactionStartAt >= 0);
  assert.ok(disableAt < avatarReductionAt);
  assert.ok(avatarReductionAt < backgroundReductionAt);
  assert.ok(backgroundReductionAt < enableAt);
  assert.ok(enableAt < commitAt);
  assert.equal(migration.split(disable).length - 1, 1);
  assert.equal(migration.split(enable).length - 1, 1);
});
