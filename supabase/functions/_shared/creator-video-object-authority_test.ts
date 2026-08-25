import { resolveCreatorVideoObjectAuthority } from "./creator-video-object-authority.ts";

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
};

const base = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  storageProvider: "cloudflare_r2",
  storageBucket: "chillywood-media-origin",
  storageObjectKey: "11111111-1111-4111-8111-111111111111/videos/source.mp4",
  storagePath: "11111111-1111-4111-8111-111111111111/videos/source-fallback.mp4",
  thumbnailStoragePath: "11111111-1111-4111-8111-111111111111/videos/cover.webp",
  requestedBucket: "chillywood-media-origin",
};

Deno.test("creator video provenance accepts only the exact owner-bound source or thumbnail", () => {
  assertEquals(resolveCreatorVideoObjectAuthority({
    ...base,
    requestedObjectKey: base.storageObjectKey,
  }), "source", "exact source");

  assertEquals(resolveCreatorVideoObjectAuthority({
    ...base,
    storageObjectKey: "",
    requestedObjectKey: base.storagePath,
  }), "source", "exact source fallback");

  assertEquals(resolveCreatorVideoObjectAuthority({
    ...base,
    requestedObjectKey: base.thumbnailStoragePath,
  }), "thumbnail", "exact thumbnail");

  for (const [label, input] of [
    ["wrong source", { ...base, requestedObjectKey: `${base.ownerId}/videos/other.mp4` }],
    ["wrong bucket", { ...base, requestedBucket: "other", requestedObjectKey: base.storageObjectKey }],
    ["wrong provider", { ...base, storageProvider: "unknown", requestedObjectKey: base.storageObjectKey }],
    [
      "wrong-owner source",
      {
        ...base,
        storageObjectKey: "22222222-2222-4222-8222-222222222222/videos/source.mp4",
        requestedObjectKey: "22222222-2222-4222-8222-222222222222/videos/source.mp4",
      },
    ],
    [
      "wrong-owner thumbnail",
      {
        ...base,
        thumbnailStoragePath: "22222222-2222-4222-8222-222222222222/videos/cover.webp",
        requestedObjectKey: "22222222-2222-4222-8222-222222222222/videos/cover.webp",
      },
    ],
  ] as const) {
    assertEquals(resolveCreatorVideoObjectAuthority(input), null, label);
  }
});

Deno.test("creator video provenance accepts only exact audited legacy R2 keys", () => {
  for (const prefix of ["originals", "uploads", "source", "processing", "quarantine"]) {
    const key = `${prefix}/legacy-video.mp4`;
    assertEquals(resolveCreatorVideoObjectAuthority({
      ...base,
      storageObjectKey: key,
      requestedObjectKey: key,
      legacyMigrationAuditVerified: true,
    }), "source", `${prefix} audited source`);
  }

  const legacyThumbnail = "originals/legacy-cover.webp";
  assertEquals(resolveCreatorVideoObjectAuthority({
    ...base,
    thumbnailStoragePath: legacyThumbnail,
    requestedObjectKey: legacyThumbnail,
    legacyMigrationAuditVerified: true,
  }), "thumbnail", "audited legacy thumbnail");

  assertEquals(resolveCreatorVideoObjectAuthority({
    ...base,
    storageObjectKey: "originals/legacy-video.mp4",
    requestedObjectKey: "originals/legacy-video.mp4",
  }), null, "missing audit");

  assertEquals(resolveCreatorVideoObjectAuthority({
    ...base,
    storageProvider: "s3",
    storageObjectKey: "originals/legacy-video.mp4",
    requestedObjectKey: "originals/legacy-video.mp4",
    legacyMigrationAuditVerified: true,
  }), null, "legacy exception is R2-only");

  assertEquals(resolveCreatorVideoObjectAuthority({
    ...base,
    storageObjectKey: "unexpected/legacy-video.mp4",
    requestedObjectKey: "unexpected/legacy-video.mp4",
    legacyMigrationAuditVerified: true,
  }), null, "legacy prefix is bounded");

  assertEquals(resolveCreatorVideoObjectAuthority({
    ...base,
    storageObjectKey: "source/legacy-video.mp4",
    requestedObjectKey: "source/not-the-audited-key.mp4",
    legacyMigrationAuditVerified: true,
  }), null, "audit cannot substitute another key");
});
