import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildReviewedRelease,
  installReleaseMetadata,
  verifyExtractedRelease,
  verifyInstalledRelease,
  verifyReviewedBundle,
} from "../deploy/reviewed-release-contract.mjs";

const repository = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const currentCommit = () =>
  execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

const extract = (archivePath, directory) => {
  execFileSync("tar", [
    "--extract",
    "--file",
    archivePath,
    "--directory",
    directory,
    "--no-same-owner",
    "--no-same-permissions",
  ]);
};

test("reviewed release binds exact Git archive, tree, module graph, and release metadata", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-reviewed-research-release-"),
  );
  try {
    const archivePath = resolve(temporary, "release.tar");
    const manifestPath = resolve(temporary, "release.manifest.json");
    const extracted = resolve(temporary, "extracted");
    await mkdir(extracted);
    const sourceCommit = currentCommit();
    const built = await buildReviewedRelease({
      archivePath,
      manifestPath,
      repository,
      sourceCommit,
    });
    const verified = await verifyReviewedBundle({
      archivePath,
      expectedManifestSha256: built.manifestSha256,
      manifestPath,
    });
    assert.equal(verified.manifest.sourceCommit, sourceCommit);
    assert.match(verified.manifest.sourceTree, /^[a-f0-9]{40}$/u);
    assert.match(verified.manifest.moduleGraphSha256, /^[a-f0-9]{64}$/u);

    extract(archivePath, extracted);
    assert.equal(
      await verifyExtractedRelease({
        directory: extracted,
        manifest: verified.manifest,
      }),
      true,
    );
    await installReleaseMetadata({
      directory: extracted,
      expectedManifestSha256: built.manifestSha256,
      manifestPath,
    });
    const installed = await verifyInstalledRelease({
      directory: extracted,
      expectedManifestSha256: built.manifestSha256,
      expectedSourceCommit: sourceCommit,
    });
    assert.equal(installed.manifest.sourceCommit, sourceCommit);
    assert.equal(installed.manifestSha256, built.manifestSha256);
    assert.equal(
      await readFile(resolve(extracted, ".release-environment"), "utf8"),
      [
        `COGNITIVE_RESEARCH_TRANSPORT_SOURCE_COMMIT=${sourceCommit}`,
        `COGNITIVE_RESEARCH_TRANSPORT_SOURCE_TREE=${built.manifest.sourceTree}`,
        `COGNITIVE_RESEARCH_TRANSPORT_RELEASE_MANIFEST_SHA256=${built.manifestSha256}`,
        "",
      ].join("\n"),
    );
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});

test("reviewed bundle and installed release reject archive, module, and metadata tampering", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-reviewed-research-tamper-"),
  );
  try {
    const archivePath = resolve(temporary, "release.tar");
    const manifestPath = resolve(temporary, "release.manifest.json");
    const extracted = resolve(temporary, "extracted");
    const sourceCommit = currentCommit();
    const built = await buildReviewedRelease({
      archivePath,
      manifestPath,
      repository,
      sourceCommit,
    });
    const archive = await readFile(archivePath);
    await writeFile(archivePath, Buffer.concat([archive, Buffer.from("tamper")]));
    await assert.rejects(
      verifyReviewedBundle({
        archivePath,
        expectedManifestSha256: built.manifestSha256,
        manifestPath,
      }),
      /reviewed_release_archive_hash_mismatch/u,
    );
    await writeFile(archivePath, archive);
    const verified = await verifyReviewedBundle({
      archivePath,
      expectedManifestSha256: built.manifestSha256,
      manifestPath,
    });
    await mkdir(extracted);
    extract(archivePath, extracted);
    await writeFile(
      resolve(
        extracted,
        "isolated-runtime/pinned-research-transport/bin/server.mjs",
      ),
      "tampered",
    );
    await assert.rejects(
      verifyExtractedRelease({
        directory: extracted,
        manifest: verified.manifest,
      }),
      /reviewed_release_extracted_module_mismatch/u,
    );
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});
