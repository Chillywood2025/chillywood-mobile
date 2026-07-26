import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildReviewedRelease,
  canonicalCredentialDirectoryContractSource,
  CURRENT_CREDENTIAL_DIRECTORY_ABI,
  CURRENT_CREDENTIAL_DIRECTORY_PATH,
  CURRENT_REVIEWED_RELEASE_PROFILE,
  installReleaseMetadata,
  LEGACY_REVIEWED_RELEASE_CONTRACT,
  REVIEWED_RELEASE_CONTRACT,
  REVIEWED_RELEASE_PROFILES,
  requireCurrentDeployable,
  verifyActiveInstalledRelease,
  verifyExtractedRelease,
  verifyInstalledRelease,
  verifyReviewedBundle,
} from "../deploy/reviewed-release-contract.mjs";
import {
  buildCompatibleV2Fixture,
  buildLegacyV1Fixture,
} from "./release-fixture-helpers.mjs";

const repository = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const currentCommit = () =>
  execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
const legacyTenModuleCommit =
  "132a2022acc4ad83618e77652c7a554637599aeb";
const legacyThirteenModuleCommit =
  "607dda39f18d3c65149717ae157a0667a5eef691";
const priorCompatibleV3Commit =
  "1770d3e9d9d6e7b8351d3f984b3cdd8a398b68cf";

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
    assert.equal(verified.manifest.contract, REVIEWED_RELEASE_CONTRACT);
    assert.equal(
      verified.manifest.credentialDirectoryAbi,
      CURRENT_CREDENTIAL_DIRECTORY_ABI,
    );
    assert.equal(
      verified.manifest.credentialDirectoryPath,
      CURRENT_CREDENTIAL_DIRECTORY_PATH,
    );
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
    const extractedHostService = await import(
      `${
        pathToFileURL(
          resolve(
            extracted,
            "isolated-runtime/pinned-research-transport/src/host-service.mjs",
          ),
        ).href
      }?release=${built.manifestSha256}`
    );
    assert.equal(
      typeof extractedHostService.createPinnedResearchHostServer,
      "function",
    );
    const extractedEntrypoint = await import(
      `${
        pathToFileURL(
          resolve(
            extracted,
            "isolated-runtime/pinned-research-transport/bin/server.mjs",
          ),
        ).href
      }?release=${built.manifestSha256}`
    );
    const exactRuntimeEnvironment = {
      CREDENTIALS_DIRECTORY: CURRENT_CREDENTIAL_DIRECTORY_PATH,
      COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_ABI:
        CURRENT_CREDENTIAL_DIRECTORY_ABI,
      COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_PATH:
        CURRENT_CREDENTIAL_DIRECTORY_PATH,
      COGNITIVE_RESEARCH_TRANSPORT_RELEASE_MANIFEST_SHA256:
        built.manifestSha256,
      COGNITIVE_RESEARCH_TRANSPORT_SOURCE_COMMIT: sourceCommit,
      COGNITIVE_RESEARCH_TRANSPORT_SOURCE_TREE:
        built.manifest.sourceTree,
    };
    assert.deepEqual(
      extractedEntrypoint.validateResearchHostConfiguration(
        exactRuntimeEnvironment,
      ),
      {
        credentialDirectory: CURRENT_CREDENTIAL_DIRECTORY_PATH,
        releaseManifestSha256: built.manifestSha256,
        sourceCommit,
        sourceTree: built.manifest.sourceTree,
      },
    );
    for (const override of [
      {
        COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_ABI:
          "legacy-abi",
      },
      {
        COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_PATH:
          "/run/credentials/chillywood-research-transport.service",
      },
      {
        CREDENTIALS_DIRECTORY:
          "/run/credentials/chillywood-research-transport.service",
      },
    ]) {
      assert.throws(
        () =>
          extractedEntrypoint.validateResearchHostConfiguration({
            ...exactRuntimeEnvironment,
            ...override,
          }),
        /research_host_configuration_rejected/u,
      );
    }
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
        `COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_ABI=${CURRENT_CREDENTIAL_DIRECTORY_ABI}`,
        `COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_PATH=${CURRENT_CREDENTIAL_DIRECTORY_PATH}`,
        "",
      ].join("\n"),
    );
    assert.equal(
      (
        await verifyActiveInstalledRelease({
          directory: extracted,
          expectedManifestSha256: built.manifestSha256,
          expectedSourceCommit: sourceCommit,
        })
      ).manifest.runtimeActivationAllowed,
      true,
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

test("release profile selection accepts only the exact allowlisted ordered module inventories", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-reviewed-research-profile-"),
  );
  try {
    const archivePath = resolve(temporary, "release.tar");
    const manifestPath = resolve(temporary, "release.manifest.json");
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
    assert.equal(
      verified.manifest.releaseProfile,
      "chillywood-pinned-research-host-runtime-v4-current-14",
    );

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.modules.splice(4, 1);
    manifest.moduleGraphSha256 = createHash("sha256")
      .update(`${JSON.stringify(manifest.modules)}\n`)
      .digest("hex");
    const arbitraryManifest = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(manifestPath, arbitraryManifest);
    const arbitraryHash = createHash("sha256")
      .update(arbitraryManifest)
      .digest("hex");
    await assert.rejects(
      verifyReviewedBundle({
        archivePath,
        expectedManifestSha256: arbitraryHash,
        manifestPath,
      }),
      /reviewed_release_profile_rejected/u,
    );
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});

test("exact legacy v1 ten- and thirteen-module manifests remain canonical and verifiable but inactive-only", async () => {
  for (const [profile, sourceCommit] of [
    [REVIEWED_RELEASE_PROFILES[0], legacyTenModuleCommit],
    [REVIEWED_RELEASE_PROFILES[1], legacyThirteenModuleCommit],
  ]) {
    const temporary = await mkdtemp(
      resolve(tmpdir(), "chillywood-reviewed-research-legacy-"),
    );
    try {
      const archivePath = resolve(temporary, "release.tar");
      const manifestPath = resolve(temporary, "release.manifest.json");
      const extracted = resolve(temporary, "extracted");
      await mkdir(extracted);
      const built = await buildLegacyV1Fixture({
        archivePath,
        manifestPath,
        profile,
        repository,
        sourceCommit,
      });
      const verified = await verifyReviewedBundle({
        archivePath,
        expectedManifestSha256: built.manifestSha256,
        manifestPath,
      });
      assert.equal(
        verified.manifest.contract,
        LEGACY_REVIEWED_RELEASE_CONTRACT,
      );
      assert.equal(verified.manifest.releaseProfile, profile.id);
      assert.equal(verified.manifest.currentDeployable, false);
      assert.equal(verified.manifest.runtimeActivationAllowed, false);
      assert.equal(verified.manifest.credentialDirectoryAbi, null);
      assert.equal(verified.manifest.credentialDirectoryPath, null);
      extract(archivePath, extracted);
      await installReleaseMetadata({
        directory: extracted,
        expectedManifestSha256: built.manifestSha256,
        manifestPath,
      });
      assert.equal(
        (
          await verifyInstalledRelease({
            directory: extracted,
            expectedManifestSha256: built.manifestSha256,
            expectedSourceCommit: sourceCommit,
          })
        ).manifest.releaseProfile,
        profile.id,
      );
      assert.deepEqual(
        await readFile(resolve(extracted, ".release-environment"), "utf8"),
        [
          `COGNITIVE_RESEARCH_TRANSPORT_SOURCE_COMMIT=${sourceCommit}`,
          `COGNITIVE_RESEARCH_TRANSPORT_SOURCE_TREE=${built.manifest.sourceTree}`,
          `COGNITIVE_RESEARCH_TRANSPORT_RELEASE_MANIFEST_SHA256=${built.manifestSha256}`,
          "",
        ].join("\n"),
      );
      await assert.rejects(
        verifyActiveInstalledRelease({
          directory: extracted,
          expectedManifestSha256: built.manifestSha256,
          expectedSourceCommit: sourceCommit,
        }),
        /reviewed_release_runtime_abi_rejected/u,
      );
      if (profile === REVIEWED_RELEASE_PROFILES[1]) {
        const legacyEntrypoint = resolve(
          extracted,
          "isolated-runtime/pinned-research-transport/bin/server.mjs",
        );
        const execution = spawnSync(process.execPath, [legacyEntrypoint], {
          encoding: "utf8",
          env: {
            CREDENTIALS_DIRECTORY:
              "/run/credentials/chillywood-research-transport.service",
            COGNITIVE_RESEARCH_TRANSPORT_RELEASE_MANIFEST_SHA256:
              built.manifestSha256,
            COGNITIVE_RESEARCH_TRANSPORT_SOURCE_COMMIT: sourceCommit,
            COGNITIVE_RESEARCH_TRANSPORT_SOURCE_TREE:
              built.manifest.sourceTree,
          },
        });
        assert.equal(execution.status, 1);
        assert.doesNotMatch(
          execution.stderr,
          /research_host_configuration_rejected/u,
        );
        assert.match(execution.stderr, /ENOENT/u);
      }
    } finally {
      await rm(temporary, { force: true, recursive: true });
    }
  }
});

test("exact prior v3 contract remains installed-verifiable and active-compatible but not current-deployable", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-reviewed-research-prior-v3-"),
  );
  try {
    const archivePath = resolve(temporary, "release.tar");
    const manifestPath = resolve(temporary, "release.manifest.json");
    const extracted = resolve(temporary, "extracted");
    await mkdir(extracted);
    const profile = REVIEWED_RELEASE_PROFILES[2];
    assert.equal(
      profile.id,
      "chillywood-pinned-research-host-runtime-v3-current-13",
    );
    const built = await buildCompatibleV2Fixture({
      archivePath,
      manifestPath,
      profile,
      repository,
      sourceCommit: priorCompatibleV3Commit,
    });
    const verified = await verifyReviewedBundle({
      archivePath,
      expectedManifestSha256: built.manifestSha256,
      manifestPath,
    });
    assert.equal(verified.manifest.releaseProfile, profile.id);
    assert.equal(verified.manifest.runtimeActivationAllowed, true);
    assert.equal(verified.manifest.currentDeployable, false);
    extract(archivePath, extracted);
    await installReleaseMetadata({
      directory: extracted,
      expectedManifestSha256: built.manifestSha256,
      manifestPath,
    });
    assert.equal(
      (
        await verifyInstalledRelease({
          directory: extracted,
          expectedManifestSha256: built.manifestSha256,
          expectedSourceCommit: priorCompatibleV3Commit,
        })
      ).manifest.releaseProfile,
      profile.id,
    );
    assert.equal(
      (
        await verifyActiveInstalledRelease({
          directory: extracted,
          expectedManifestSha256: built.manifestSha256,
          expectedSourceCommit: priorCompatibleV3Commit,
        })
      ).manifest.releaseProfile,
      profile.id,
    );
    assert.throws(
      () => requireCurrentDeployable(verified.manifest),
      /reviewed_release_current_deployable_rejected/u,
    );
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});

test("new builds reject inactive profiles and source entrypoints without the exact credential ABI", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-reviewed-research-build-abi-"),
  );
  try {
    await assert.rejects(
      buildReviewedRelease({
        archivePath: resolve(temporary, "legacy.tar"),
        manifestPath: resolve(temporary, "legacy.json"),
        releaseProfile: REVIEWED_RELEASE_PROFILES[0],
        repository,
        sourceCommit: legacyTenModuleCommit,
      }),
      /reviewed_release_profile_rejected/u,
    );
    await assert.rejects(
      buildReviewedRelease({
        archivePath: resolve(temporary, "prior.tar"),
        manifestPath: resolve(temporary, "prior.json"),
        releaseProfile: CURRENT_REVIEWED_RELEASE_PROFILE,
        repository,
        sourceCommit: legacyThirteenModuleCommit,
      }),
      /reviewed_release_runtime_abi_source_rejected/u,
    );
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});

test("canonical credential contract source matches the complete reviewed module bytes", async () => {
  assert.equal(
    await readFile(
      resolve(
        repository,
        "isolated-runtime/pinned-research-transport/src/credential-directory-contract.mjs",
      ),
      "utf8",
    ),
    canonicalCredentialDirectoryContractSource(),
  );
});

test("new builds reject a side-effecting credential contract before candidate evaluation", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-reviewed-research-semantic-abi-"),
  );
  try {
    const clonedRepository = resolve(temporary, "repository");
    const sideEffectMarker = resolve(temporary, "candidate-executed");
    execFileSync("git", [
      "clone",
      "--quiet",
      "--no-hardlinks",
      repository,
      clonedRepository,
    ]);
    execFileSync("git", [
      "-C",
      clonedRepository,
      "checkout",
      "--quiet",
      currentCommit(),
    ]);
    await writeFile(
      resolve(
        clonedRepository,
        "isolated-runtime/pinned-research-transport/src/credential-directory-contract.mjs",
      ),
      [
        'import { writeFileSync } from "node:fs";',
        `writeFileSync(${
          JSON.stringify(sideEffectMarker)
        }, "candidate_executed", { mode: 0o600 });`,
        canonicalCredentialDirectoryContractSource(),
      ].join("\n"),
    );
    execFileSync("git", [
      "-C",
      clonedRepository,
      "add",
      "isolated-runtime/pinned-research-transport/src/credential-directory-contract.mjs",
    ]);
    execFileSync(
      "git",
      [
        "-C",
        clonedRepository,
        "-c",
        "user.name=Chi'llywood Test",
        "-c",
        "user.email=release-fixture@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "test: create permissive credential contract",
      ],
    );
    const sourceCommit = execFileSync(
      "git",
      ["-C", clonedRepository, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim();
    await assert.rejects(
      buildReviewedRelease({
        archivePath: resolve(temporary, "permissive.tar"),
        manifestPath: resolve(temporary, "permissive.json"),
        repository: clonedRepository,
        sourceCommit,
      }),
      /reviewed_release_runtime_abi_source_rejected/u,
    );
    await assert.rejects(readFile(sideEffectMarker), /ENOENT/u);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});

test("v2 canonical manifest and release environment reject ABI, path, order, and metadata tampering", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-reviewed-research-abi-tamper-"),
  );
  try {
    const archivePath = resolve(temporary, "release.tar");
    const manifestPath = resolve(temporary, "release.manifest.json");
    const sourceCommit = currentCommit();
    const built = await buildReviewedRelease({
      archivePath,
      manifestPath,
      repository,
      sourceCommit,
    });
    const original = JSON.parse(await readFile(manifestPath, "utf8"));
    for (const mutate of [
      (value) => {
        value.credentialDirectoryAbi = `${value.credentialDirectoryAbi}-tampered`;
      },
      (value) => {
        value.credentialDirectoryPath = "/run/credentials/legacy";
      },
    ]) {
      const changed = structuredClone(original);
      mutate(changed);
      const raw = `${JSON.stringify(changed, null, 2)}\n`;
      await writeFile(manifestPath, raw);
      await assert.rejects(
        verifyReviewedBundle({
          archivePath,
          expectedManifestSha256: createHash("sha256")
            .update(raw)
            .digest("hex"),
          manifestPath,
        }),
        /reviewed_release_manifest_rejected/u,
      );
    }
    const reordered = {
      contract: original.contract,
      archiveSha256: original.archiveSha256,
      credentialDirectoryAbi: original.credentialDirectoryAbi,
      credentialDirectoryPath: original.credentialDirectoryPath,
      moduleGraphSha256: original.moduleGraphSha256,
      modules: original.modules,
      sourceCommit: original.sourceCommit,
      sourceTree: original.sourceTree,
    };
    const reorderedRaw = `${JSON.stringify(reordered, null, 2)}\n`;
    await writeFile(manifestPath, reorderedRaw);
    await assert.rejects(
      verifyReviewedBundle({
        archivePath,
        expectedManifestSha256: createHash("sha256")
          .update(reorderedRaw)
          .digest("hex"),
        manifestPath,
      }),
      /reviewed_release_manifest_not_canonical/u,
    );
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});
