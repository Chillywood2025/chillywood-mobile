import assert from "node:assert/strict";
import {
  execFileSync,
  spawn,
  spawnSync,
} from "node:child_process";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildReviewedRelease,
  CURRENT_REVIEWED_RELEASE_PROFILE,
  installReleaseMetadata,
  REVIEWED_RELEASE_PROFILES,
  verifyReviewedBundle,
} from "../deploy/reviewed-release-contract.mjs";
import {
  buildLegacyV1Fixture,
} from "./release-fixture-helpers.mjs";

const repository = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const deployDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../deploy",
);
const deployScript = resolve(deployDirectory, "deploy-reviewed-release.sh");
const rollbackScript = resolve(
  deployDirectory,
  "rollback-reviewed-release.sh",
);
const compatibilityTemplateRelative =
  "isolated-runtime/pinned-research-transport/deploy/chillywood-research-transport-credential-compat.conf.template";
const legacySourceCommit =
  "132a2022acc4ad83618e77652c7a554637599aeb";
const legacyThirteenModuleSourceCommit =
  "607dda39f18d3c65149717ae157a0667a5eef691";

const currentCommit = () =>
  execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

const exists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
};

const buildBundle = async ({
  directory,
  profile,
  sourceRepository = repository,
  sourceCommit,
}) => {
  const artifactName = `${profile.id}-${sourceCommit}`;
  const archivePath = resolve(directory, `${artifactName}.tar`);
  const manifestPath = resolve(directory, `${artifactName}.manifest.json`);
  const built = profile.runtimeActivationAllowed
    ? await buildReviewedRelease({
        archivePath,
        manifestPath,
        releaseProfile: profile,
        repository: sourceRepository,
        sourceCommit,
      })
    : await buildLegacyV1Fixture({
        archivePath,
        manifestPath,
        profile,
        repository: sourceRepository,
        sourceCommit,
      });
  return {
    archivePath,
    manifestPath,
    manifestSha256: built.manifestSha256,
    profile,
    sourceCommit,
  };
};

const installBundle = async ({ bundle, releaseRoot }) => {
  const releaseDirectory = resolve(releaseRoot, bundle.sourceCommit);
  await mkdir(releaseDirectory);
  execFileSync("tar", [
    "--extract",
    "--file",
    bundle.archivePath,
    "--directory",
    releaseDirectory,
    "--no-same-owner",
    "--no-same-permissions",
  ]);
  const { manifest } = await verifyReviewedBundle({
    archivePath: bundle.archivePath,
    expectedManifestSha256: bundle.manifestSha256,
    manifestPath: bundle.manifestPath,
  });
  await installReleaseMetadata({
    directory: releaseDirectory,
    expectedManifestSha256: bundle.manifestSha256,
    manifestPath: bundle.manifestPath,
  });
  assert.equal(manifest.sourceCommit, bundle.sourceCommit);
  assert.equal(manifest.releaseProfile, bundle.profile.id);
  return releaseDirectory;
};

const shell = (script) => `#!/bin/sh\nset -eu\n${script}\n`;

const createHarness = async (temporary) => {
  const hostRoot = resolve(temporary, "host");
  const binDirectory = resolve(hostRoot, ".test-bin");
  const transportRoot = resolve(
    hostRoot,
    "opt/chillywood/research-transport",
  );
  const releaseRoot = resolve(transportRoot, "releases");
  const dropIn = resolve(
    hostRoot,
    "etc/systemd/system/chillywood-research-transport.service.d/10-credential-compat.conf",
  );
  const systemctlLog = resolve(hostRoot, "systemctl.log");
  const readinessMode = resolve(hostRoot, "readiness.mode");
  const readinessEntered = resolve(hostRoot, "readiness.entered");
  const readinessLog = resolve(hostRoot, "readiness.log");
  const ownerMismatch = resolve(hostRoot, "owner.mismatch");
  const systemctl = resolve(
    hostRoot,
    ".chillywood-reviewed-host-test-systemctl",
  );
  const readiness = resolve(
    hostRoot,
    ".chillywood-reviewed-host-test-readiness",
  );
  await mkdir(releaseRoot, { recursive: true });
  await mkdir(binDirectory);
  await writeFile(
    resolve(hostRoot, ".chillywood-reviewed-host-test-root"),
    "chillywood-reviewed-host-shell-harness-v1\n",
  );
  await writeFile(
    systemctl,
    shell(`printf '%s\\n' "$*" >> '${systemctlLog}'`),
  );
  await writeFile(
    readiness,
    shell(`
current_link=$1
target=$(readlink -f "$current_link")
printf '%s\\n' "$target" >> '${readinessLog}'
mode=$(cat '${readinessMode}')
case "$mode" in
  fail-current-once:*)
    rejected=\${mode#fail-current-once:}
    if [ "$target" = "$rejected" ]; then
      printf '%s\\n' pass > '${readinessMode}'
      exit 1
    fi
    ;;
  block)
    : > '${readinessEntered}'
    while [ "$(cat '${readinessMode}')" = block ]; do
      sleep 0.02
    done
    ;;
  pass) ;;
  *) exit 65 ;;
esac
`),
  );
  const atomicMove = resolve(binDirectory, "mv");
  await writeFile(
    atomicMove,
    shell(`
case "$#" in
  2)
    node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$1" "$2"
    ;;
  3)
    if [ "$1" != "-Tf" ]; then
      exit 64
    fi
    node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$2" "$3"
    ;;
  *) exit 64 ;;
esac
`),
  );
  const identity = resolve(binDirectory, "id");
  await writeFile(
    identity,
    shell(`
if [ -f '${ownerMismatch}' ]; then
  case "\${1:-}" in
    -u|-g) printf '%s\\n' 999999; exit 0 ;;
  esac
fi
exec /usr/bin/id "$@"
`),
  );
  await chmod(systemctl, 0o700);
  await chmod(readiness, 0o700);
  await chmod(atomicMove, 0o700);
  await chmod(identity, 0o700);
  await writeFile(readinessMode, "pass\n");
  return {
    binDirectory,
    dropIn,
    hostRoot,
    ownerMismatch,
    readinessEntered,
    readinessLog,
    readinessMode,
    releaseRoot,
    systemctlLog,
    transportRoot,
  };
};

const run = (script, args, hostRoot) =>
  spawnSync(script, args, {
    encoding: "utf8",
    env: {
      PATH: `${resolve(hostRoot, ".test-bin")}:${process.env.PATH}`,
      CHILLYWOOD_RESEARCH_TRANSPORT_TEST_ROOT: hostRoot,
    },
  });

const rollbackArguments = (target, overlaySource) => [
  target.sourceCommit,
  target.manifestSha256,
  overlaySource.sourceCommit,
  overlaySource.manifestSha256,
];

const assertCleanOperationState = async ({ dropIn, transportRoot }) => {
  assert.equal(await exists(resolve(transportRoot, ".current.next")), false);
  assert.equal(
    await exists(resolve(transportRoot, ".deployment-rollback.lock")),
    false,
  );
  assert.equal(await exists(`${dropIn}.next`), false);
  assert.deepEqual(
    (await readdir(transportRoot)).filter(
      (entry) =>
        entry.startsWith(".credential-overlay.previous.") ||
        entry.startsWith(".release."),
    ),
    [],
  );
};

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  assert.fail("bounded wait expired");
};

const removeTemporary = async (temporary) => {
  execFileSync("chmod", ["-R", "u+w", temporary]);
  await rm(temporary, { force: true, recursive: true });
};

const createFutureCompatibleRepository = async (temporary) => {
  const clonedRepository = resolve(temporary, "compatible-repository");
  execFileSync("git", [
    "clone",
    "--quiet",
    "--no-hardlinks",
    repository,
    clonedRepository,
  ]);
  const baselineCommit = currentCommit();
  execFileSync("git", [
    "-C",
    clonedRepository,
    "checkout",
    "--quiet",
    baselineCommit,
  ]);
  await writeFile(
    resolve(clonedRepository, "compatible-release-fixture.txt"),
    "future compatible source tree marker\n",
  );
  execFileSync("git", [
    "-C",
    clonedRepository,
    "add",
    "compatible-release-fixture.txt",
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
      "test: create future compatible release",
    ],
  );
  const futureCommit = execFileSync(
    "git",
    ["-C", clonedRepository, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  return { baselineCommit, clonedRepository, futureCommit };
};

test("failed v2 deployment restores an exact legacy v1 release and overlay inactive-only without readiness", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-auto-rollback-"),
  );
  try {
    const harness = await createHarness(temporary);
    const legacy = await buildBundle({
      directory: temporary,
      profile: REVIEWED_RELEASE_PROFILES[1],
      sourceCommit: legacyThirteenModuleSourceCommit,
    });
    const current = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: currentCommit(),
    });
    const legacyDirectory = await installBundle({
      bundle: legacy,
      releaseRoot: harness.releaseRoot,
    });
    await symlink(
      legacyDirectory,
      resolve(harness.transportRoot, "current"),
    );
    await mkdir(dirname(harness.dropIn), { recursive: true });
    await writeFile(harness.dropIn, "previous-overlay\n");
    const currentDirectory = resolve(
      await realpath(harness.releaseRoot),
      current.sourceCommit,
    );
    await writeFile(
      harness.readinessMode,
      `fail-current-once:${currentDirectory}\n`,
    );

    const result = run(
      deployScript,
      [
        current.archivePath,
        current.manifestPath,
        current.manifestSha256,
      ],
      harness.hostRoot,
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(
      result.stderr,
      /automatic_rollback=INACTIVE_ONLY_ABI_INCOMPATIBLE/u,
    );
    assert.equal(
      await readlink(resolve(harness.transportRoot, "current")),
      await realpath(legacyDirectory),
    );
    assert.equal(
      await readFile(harness.dropIn, "utf8"),
      "previous-overlay\n",
    );
    assert.equal(
      await readFile(harness.readinessLog, "utf8"),
      `${currentDirectory}\n`,
    );
    assert.match(
      await readFile(harness.systemctlLog, "utf8"),
      /stop chillywood-research-transport\.service/u,
    );
    await assertCleanOperationState(harness);
  } finally {
    await removeTemporary(temporary);
  }
});

test("failed future compatible v2 deployment automatically restores and readies the exact prior v2 ABI and overlay", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-compatible-auto-rollback-"),
  );
  try {
    const harness = await createHarness(temporary);
    const {
      baselineCommit,
      clonedRepository,
      futureCommit,
    } = await createFutureCompatibleRepository(temporary);
    const baseline = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: baselineCommit,
      sourceRepository: clonedRepository,
    });
    const future = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: futureCommit,
      sourceRepository: clonedRepository,
    });
    const baselineDirectory = await installBundle({
      bundle: baseline,
      releaseRoot: harness.releaseRoot,
    });
    await symlink(
      baselineDirectory,
      resolve(harness.transportRoot, "current"),
    );
    await mkdir(dirname(harness.dropIn), { recursive: true });
    const baselineOverlay = await readFile(
      resolve(baselineDirectory, compatibilityTemplateRelative),
    );
    await writeFile(harness.dropIn, baselineOverlay);
    const futureDirectory = resolve(
      await realpath(harness.releaseRoot),
      future.sourceCommit,
    );
    await writeFile(
      harness.readinessMode,
      `fail-current-once:${futureDirectory}\n`,
    );

    const result = run(
      deployScript,
      [
        future.archivePath,
        future.manifestPath,
        future.manifestSha256,
      ],
      harness.hostRoot,
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(
      result.stderr,
      /automatic_rollback=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION/u,
    );
    assert.doesNotMatch(result.stderr, /INACTIVE_ONLY_ABI_INCOMPATIBLE/u);
    assert.equal(
      await readlink(resolve(harness.transportRoot, "current")),
      await realpath(baselineDirectory),
    );
    assert.deepEqual(await readFile(harness.dropIn), baselineOverlay);
    assert.deepEqual(
      (await readFile(harness.readinessLog, "utf8"))
        .trim()
        .split("\n"),
      [futureDirectory, await realpath(baselineDirectory)],
    );
    await assertCleanOperationState(harness);
  } finally {
    await removeTemporary(temporary);
  }
});

test("current-profile deployment ignores a tampered adjacent template and installs only the verified release overlay", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-adjacent-overlay-"),
  );
  try {
    const harness = await createHarness(temporary);
    const legacy = await buildBundle({
      directory: temporary,
      profile: REVIEWED_RELEASE_PROFILES[0],
      sourceCommit: legacySourceCommit,
    });
    const current = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: currentCommit(),
    });
    const legacyDirectory = await installBundle({
      bundle: legacy,
      releaseRoot: harness.releaseRoot,
    });
    await symlink(
      legacyDirectory,
      resolve(harness.transportRoot, "current"),
    );
    const toolDirectory = resolve(temporary, "deployment-tools");
    await mkdir(toolDirectory);
    for (const file of [
      "deploy-reviewed-release.sh",
      "reviewed-release-contract.mjs",
      "chillywood-research-transport-credential-compat.conf.template",
    ]) {
      await cp(resolve(deployDirectory, file), resolve(toolDirectory, file));
    }
    const copiedDeploy = resolve(
      toolDirectory,
      "deploy-reviewed-release.sh",
    );
    await chmod(copiedDeploy, 0o700);
    await writeFile(
      resolve(
        toolDirectory,
        "chillywood-research-transport-credential-compat.conf.template",
      ),
      "tampered-adjacent-overlay\n",
    );

    const result = run(
      copiedDeploy,
      [
        current.archivePath,
        current.manifestPath,
        current.manifestSha256,
      ],
      harness.hostRoot,
    );
    assert.equal(result.status, 0, result.stderr);
    const currentDirectory = resolve(
      await realpath(harness.releaseRoot),
      current.sourceCommit,
    );
    assert.equal(
      await readlink(resolve(harness.transportRoot, "current")),
      currentDirectory,
    );
    const installedOverlay = await readFile(harness.dropIn);
    assert.deepEqual(
      installedOverlay,
      await readFile(
        resolve(currentDirectory, compatibilityTemplateRelative),
      ),
    );
    assert.notDeepEqual(
      installedOverlay,
      await readFile(
        resolve(
          toolDirectory,
          "chillywood-research-transport-credential-compat.conf.template",
        ),
      ),
    );
    await assertCleanOperationState(harness);
  } finally {
    await removeTemporary(temporary);
  }
});

test("direct deployment rejects exact legacy ten- and prior thirteen-module v1 releases before host mutation", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-legacy-deploy-"),
  );
  try {
    const harness = await createHarness(temporary);
    for (const [profile, sourceCommit] of [
      [REVIEWED_RELEASE_PROFILES[0], legacySourceCommit],
      [REVIEWED_RELEASE_PROFILES[1], legacyThirteenModuleSourceCommit],
    ]) {
      const legacy = await buildBundle({
        directory: temporary,
        profile,
        sourceCommit,
      });
      const result = run(
        deployScript,
        [
          legacy.archivePath,
          legacy.manifestPath,
          legacy.manifestSha256,
        ],
        harness.hostRoot,
      );
      assert.equal(result.status, 65, result.stderr);
      assert.match(
        result.stderr,
        /reviewed_release_runtime_abi_rejected/u,
      );
      assert.match(result.stderr, /release_bundle_rejected/u);
      assert.equal(
        await exists(resolve(harness.transportRoot, "current")),
        false,
      );
      assert.equal(await exists(harness.dropIn), false);
      await assertCleanOperationState(harness);
    }
  } finally {
    await removeTemporary(temporary);
  }
});

test("standalone rollback rejects a legacy v1 target before link or overlay mutation", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-standalone-rollback-"),
  );
  try {
    const harness = await createHarness(temporary);
    const legacy = await buildBundle({
      directory: temporary,
      profile: REVIEWED_RELEASE_PROFILES[0],
      sourceCommit: legacySourceCommit,
    });
    const current = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: currentCommit(),
    });
    const currentDirectory = await installBundle({
      bundle: current,
      releaseRoot: harness.releaseRoot,
    });
    await symlink(
      currentDirectory,
      resolve(harness.transportRoot, "current"),
    );
    await mkdir(dirname(harness.dropIn), { recursive: true });
    const stableOverlay = await readFile(
      resolve(currentDirectory, compatibilityTemplateRelative),
    );
    await writeFile(harness.dropIn, stableOverlay);

    const result = run(
      rollbackScript,
      rollbackArguments(legacy, legacy),
      harness.hostRoot,
    );
    assert.equal(result.status, 65, result.stderr);
    assert.match(result.stderr, /reviewed_release_runtime_abi_rejected/u);
    assert.match(result.stderr, /rollback_target_rejected/u);
    assert.equal(
      await readlink(resolve(harness.transportRoot, "current")),
      await realpath(currentDirectory),
    );
    assert.deepEqual(await readFile(harness.dropIn), stableOverlay);
    assert.equal(await exists(harness.readinessLog), false);
    await assertCleanOperationState(harness);
  } finally {
    await removeTemporary(temporary);
  }
});

test("standalone rollback activates only a compatible v2 target with its exact installed overlay", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-compatible-rollback-"),
  );
  try {
    const harness = await createHarness(temporary);
    const {
      baselineCommit,
      clonedRepository,
      futureCommit,
    } = await createFutureCompatibleRepository(temporary);
    const baseline = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: baselineCommit,
      sourceRepository: clonedRepository,
    });
    const future = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: futureCommit,
      sourceRepository: clonedRepository,
    });
    const [baselineDirectory, futureDirectory] = await Promise.all([
      installBundle({
        bundle: baseline,
        releaseRoot: harness.releaseRoot,
      }),
      installBundle({
        bundle: future,
        releaseRoot: harness.releaseRoot,
      }),
    ]);
    const currentLink = resolve(harness.transportRoot, "current");
    await symlink(futureDirectory, currentLink);
    await mkdir(dirname(harness.dropIn), { recursive: true });
    const targetOverlay = await readFile(
      resolve(baselineDirectory, compatibilityTemplateRelative),
    );
    await writeFile(harness.dropIn, targetOverlay);

    const result = run(
      rollbackScript,
      rollbackArguments(baseline, baseline),
      harness.hostRoot,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /rollback=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION/u,
    );
    assert.equal(await readlink(currentLink), await realpath(baselineDirectory));
    assert.deepEqual(await readFile(harness.dropIn), targetOverlay);
    assert.equal(
      (await readFile(harness.readinessLog, "utf8")).trim(),
      await realpath(baselineDirectory),
    );
    await assertCleanOperationState(harness);
  } finally {
    await removeTemporary(temporary);
  }
});

test("standalone rollback rejects a separately selected overlay release before host mutation", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-overlay-binding-"),
  );
  try {
    const harness = await createHarness(temporary);
    const legacy = await buildBundle({
      directory: temporary,
      profile: REVIEWED_RELEASE_PROFILES[0],
      sourceCommit: legacySourceCommit,
    });
    const current = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: currentCommit(),
    });
    const currentDirectory = await installBundle({
      bundle: current,
      releaseRoot: harness.releaseRoot,
    });
    const currentLink = resolve(harness.transportRoot, "current");
    await symlink(currentDirectory, currentLink);
    await mkdir(dirname(harness.dropIn), { recursive: true });
    const stableOverlay = await readFile(
      resolve(currentDirectory, compatibilityTemplateRelative),
    );
    await writeFile(harness.dropIn, stableOverlay);

    const result = run(
      rollbackScript,
      rollbackArguments(current, legacy),
      harness.hostRoot,
    );
    assert.equal(result.status, 65, result.stderr);
    assert.match(result.stderr, /rollback_overlay_binding_rejected/u);
    assert.equal(await readlink(currentLink), await realpath(currentDirectory));
    assert.deepEqual(await readFile(harness.dropIn), stableOverlay);
    assert.equal(await exists(harness.readinessLog), false);
    await assertCleanOperationState(harness);
  } finally {
    await removeTemporary(temporary);
  }
});

test("standalone rollback rejects tampered content, wrong mode, wrong owner, and symlink overlays before current mutation", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-overlay-negative-"),
  );
  try {
    const harness = await createHarness(temporary);
    const current = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: currentCommit(),
    });
    const currentDirectory = await installBundle({
      bundle: current,
      releaseRoot: harness.releaseRoot,
    });
    const currentLink = resolve(harness.transportRoot, "current");
    await symlink(currentDirectory, currentLink);
    await mkdir(dirname(harness.dropIn), { recursive: true });
    const stableOverlay = await readFile(
      resolve(currentDirectory, compatibilityTemplateRelative),
    );
    const resetOverlay = async () => {
      await rm(harness.dropIn, { force: true });
      await rm(harness.ownerMismatch, { force: true });
      await writeFile(harness.dropIn, stableOverlay);
      await chmod(harness.dropIn, 0o644);
    };
    const originalCurrentTarget = await readlink(currentLink);
    const cases = [
      {
        mutate: async () => {
          await writeFile(harness.dropIn, "tampered-installed-overlay\n");
        },
        name: "tampered_content",
      },
      {
        mutate: async () => {
          await chmod(harness.dropIn, 0o600);
        },
        name: "wrong_mode",
      },
      {
        mutate: async () => {
          await writeFile(harness.ownerMismatch, "active\n");
        },
        name: "wrong_owner",
      },
      {
        mutate: async () => {
          await rm(harness.dropIn);
          await symlink(
            resolve(currentDirectory, compatibilityTemplateRelative),
            harness.dropIn,
          );
        },
        name: "symlink",
      },
    ];

    for (const scenario of cases) {
      await resetOverlay();
      await scenario.mutate();
      const result = run(
        rollbackScript,
        rollbackArguments(current, current),
        harness.hostRoot,
      );
      assert.equal(result.status, 65, `${scenario.name}: ${result.stderr}`);
      assert.match(
        result.stderr,
        /installed_credential_overlay_rejected/u,
        scenario.name,
      );
      assert.equal(
        await readlink(currentLink),
        originalCurrentTarget,
        scenario.name,
      );
      assert.equal(
        await exists(
          resolve(harness.transportRoot, ".deployment-rollback.lock"),
        ),
        false,
        scenario.name,
      );
    }
  } finally {
    await removeTemporary(temporary);
  }
});

test("stale and concurrent operation locks reject before current or overlay mutation and successful owner cleanup removes temporary state", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-operation-lock-"),
  );
  try {
    const harness = await createHarness(temporary);
    const current = await buildBundle({
      directory: temporary,
      profile: CURRENT_REVIEWED_RELEASE_PROFILE,
      sourceCommit: currentCommit(),
    });
    const currentDirectory = await installBundle({
      bundle: current,
      releaseRoot: harness.releaseRoot,
    });
    const currentLink = resolve(harness.transportRoot, "current");
    await symlink(currentDirectory, currentLink);
    await mkdir(dirname(harness.dropIn), { recursive: true });
    const stableOverlay = await readFile(
      resolve(currentDirectory, compatibilityTemplateRelative),
    );
    await writeFile(harness.dropIn, stableOverlay);
    const lock = resolve(
      harness.transportRoot,
      ".deployment-rollback.lock",
    );
    const initialCurrentTarget = await readlink(currentLink);

    await mkdir(lock);
    const stale = run(
      rollbackScript,
      rollbackArguments(current, current),
      harness.hostRoot,
    );
    assert.equal(stale.status, 73, stale.stderr);
    assert.equal(await readlink(currentLink), initialCurrentTarget);
    assert.deepEqual(await readFile(harness.dropIn), stableOverlay);
    assert.equal(await exists(lock), true);
    await rm(lock, { recursive: true });

    await writeFile(harness.readinessMode, "block\n");
    const first = spawn(
      rollbackScript,
      rollbackArguments(current, current),
      {
        env: {
          PATH: `${harness.binDirectory}:${process.env.PATH}`,
          CHILLYWOOD_RESEARCH_TRANSPORT_TEST_ROOT: harness.hostRoot,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await waitFor(() => exists(harness.readinessEntered));
    const concurrent = run(
      rollbackScript,
      rollbackArguments(current, current),
      harness.hostRoot,
    );
    assert.equal(concurrent.status, 73, concurrent.stderr);
    assert.equal(await readlink(currentLink), await realpath(currentDirectory));
    assert.deepEqual(await readFile(harness.dropIn), stableOverlay);
    await writeFile(harness.readinessMode, "pass\n");
    const firstResult = await new Promise((resolvePromise) => {
      let stderr = "";
      first.stderr.setEncoding("utf8");
      first.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      first.on("close", (status) => resolvePromise({ status, stderr }));
    });
    assert.equal(firstResult.status, 0, firstResult.stderr);
    await assertCleanOperationState(harness);
  } finally {
    await removeTemporary(temporary);
  }
});
