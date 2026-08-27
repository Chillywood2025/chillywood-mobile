import {
  buildCanonicalSignedHeaders,
  buildRequiredUploadHeaders,
  classifyConditionalUploadStatus,
  CREATOR_VIDEO_UPLOAD_EXPIRES_SECONDS,
  matchesUploadReservation,
  PRIVATE_MEDIA_DOWNLOAD_EXPIRES_SECONDS,
  readObservedMediaObject,
  SOCIAL_ATTACHMENT_UPLOAD_EXPIRES_SECONDS,
} from "./media-upload-integrity.ts";

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

Deno.test("upload signatures bind exact length, Content-Type, and non-overwrite precondition", () => {
  const required = buildRequiredUploadHeaders(" Video/MP4; charset=binary ", 12_345);
  assertEquals(required, {
    "content-length": "12345",
    "content-type": "video/mp4",
    "if-none-match": "*",
  }, "required headers");

  assertEquals(buildCanonicalSignedHeaders("bucket.example.com", required), {
    canonicalHeaders: "content-length:12345\ncontent-type:video/mp4\nhost:bucket.example.com\nif-none-match:*\n",
    signedHeaders: "content-length;content-type;host;if-none-match",
  }, "canonical signature headers");
});

Deno.test("provider readback rejects changed or missing observed metadata", () => {
  const expected = { mimeType: "video/mp4", sizeBytes: 12_345 };
  assertEquals(matchesUploadReservation(expected, readObservedMediaObject(new Headers({
    "Content-Length": "12345",
    "Content-Type": "video/mp4",
  }))), true, "exact observed metadata");
  assertEquals(matchesUploadReservation(expected, readObservedMediaObject(new Headers({
    "Content-Length": "12346",
    "Content-Type": "video/mp4",
  }))), false, "changed size");
  assertEquals(matchesUploadReservation(expected, readObservedMediaObject(new Headers({
    "Content-Length": "12345",
    "Content-Type": "image/png",
  }))), false, "changed MIME");
  assertEquals(matchesUploadReservation(expected, readObservedMediaObject(new Headers({
    "Content-Type": "video/mp4",
  }))), false, "missing provider length");
});

Deno.test("conditional overwrite response 412 is fail-closed", () => {
  assertEquals(classifyConditionalUploadStatus(200), "created", "first PUT");
  assertEquals(classifyConditionalUploadStatus(412), "already_exists", "overwrite precondition");
  assertEquals(classifyConditionalUploadStatus(500), "failed", "provider failure");
});

Deno.test("private media URLs expire within the room-authority freshness window", () => {
  assertEquals(PRIVATE_MEDIA_DOWNLOAD_EXPIRES_SECONDS, 45, "download expiry seconds");
});

Deno.test("single-use upload URLs use bounded practical lifetimes", () => {
  assertEquals(CREATOR_VIDEO_UPLOAD_EXPIRES_SECONDS, 60 * 60, "large creator upload expiry");
  assertEquals(SOCIAL_ATTACHMENT_UPLOAD_EXPIRES_SECONDS, 15 * 60, "social upload expiry");
});
