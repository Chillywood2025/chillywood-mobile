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
