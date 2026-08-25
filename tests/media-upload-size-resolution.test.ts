import assert from "node:assert/strict";
import test from "node:test";

import { resolveMediaUploadSizeBytes } from "../_lib/mediaUploadSize.ts";

test("uses an exact picker-provided size without an extra filesystem read", async () => {
  let reads = 0;
  const size = await resolveMediaUploadSizeBytes({
    providedSizeBytes: 4096,
    readSizeBytes: async () => {
      reads += 1;
      return 8192;
    },
  });

  assert.equal(size, 4096);
  assert.equal(reads, 0);
});

for (const providedSizeBytes of [undefined, null]) {
  test(`measures the prepared file when picker size is ${String(providedSizeBytes)}`, async () => {
    const size = await resolveMediaUploadSizeBytes({
      providedSizeBytes,
      readSizeBytes: async () => 8192,
    });

    assert.equal(size, 8192);
  });
}

test("rejects an unverifiable prepared file without creating a guessed reservation", async () => {
  for (const measured of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "4096"]) {
    await assert.rejects(
      resolveMediaUploadSizeBytes({
        providedSizeBytes: null,
        readSizeBytes: async () => measured,
      }),
      /Media file size could not be verified before upload/u,
    );
  }

  await assert.rejects(
    resolveMediaUploadSizeBytes({
      providedSizeBytes: null,
      readSizeBytes: async () => {
        throw new Error("filesystem unavailable");
      },
    }),
    /Media file size could not be verified before upload/u,
  );
});

test("applies a caller-specific limit to a filesystem-measured picker asset", async () => {
  await assert.rejects(
    resolveMediaUploadSizeBytes({
      providedSizeBytes: undefined,
      readSizeBytes: async () => 20 * 1024 * 1024 + 1,
      maximumSizeBytes: 20 * 1024 * 1024,
      tooLargeMessage: "Cover image is too large.",
    }),
    /Cover image is too large\./u,
  );
});
