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
  installReleaseMetadata,
  REVIEWED_RELEASE_PROFILES,
  verifyReviewedBundle,
} from "../deploy/reviewed-release-contract.mjs";

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
  sourceCommit,
}) => {
  const archivePath = resolve(directory, `${profile.id}.tar`);
  const manifestPath = resolve(directory, `${profile.id}.manifest.json`);
  const built = await buildReviewedRelease({
    archivePath,
    manifestPath,
    releaseProfile: profile,
    repository,
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

test("failed current-profile deployment automatically rolls back to the exact legacy profile while retaining the reviewed overlay", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-auto-rollback-"),
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
      profile: REVIEWED_RELEASE_PROFILES[1],
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
      /automatic_rollback=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION/u,
    );
    assert.equal(
      await readlink(resolve(harness.transportRoot, "current")),
      await realpath(legacyDirectory),
    );
    assert.equal(
      await readFile(harness.dropIn, "utf8"),
      await readFile(
        resolve(currentDirectory, compatibilityTemplateRelative),
        "utf8",
      ),
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
      profile: REVIEWED_RELEASE_PROFILES[1],
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

test("direct deployment of the legacy compatibility profile is rejected before host mutation", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "chillywood-release-legacy-deploy-"),
  );
  try {
    const harness = await createHarness(temporary);
    const legacy = await buildBundle({
      directory: temporary,
      profile: REVIEWED_RELEASE_PROFILES[0],
      sourceCommit: legacySourceCommit,
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
    assert.match(result.stderr, /release_profile_rejected/u);
    assert.equal(
      await exists(resolve(harness.transportRoot, "current")),
      false,
    );
    assert.equal(await exists(harness.dropIn), false);
    await assertCleanOperationState(harness);
  } finally {
    await removeTemporary(temporary);
  }
});

test("standalone rollback selects the legacy profile without changing the stable reviewed overlay", async () => {
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
      profile: REVIEWED_RELEASE_PROFILES[1],
      sourceCommit: currentCommit(),
    });
    const [legacyDirectory, currentDirectory] = await Promise.all([
      installBundle({ bundle: legacy, releaseRoot: harness.releaseRoot }),
      installBundle({ bundle: current, releaseRoot: harness.releaseRoot }),
    ]);
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
      rollbackArguments(legacy, current),
      harness.hostRoot,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /rollback=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION/u,
    );
    assert.equal(
      await readlink(resolve(harness.transportRoot, "current")),
      await realpath(legacyDirectory),
    );
    assert.deepEqual(await readFile(harness.dropIn), stableOverlay);
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
    const legacy = await buildBundle({
      directory: temporary,
      profile: REVIEWED_RELEASE_PROFILES[0],
      sourceCommit: legacySourceCommit,
    });
    const current = await buildBundle({
      directory: temporary,
      profile: REVIEWED_RELEASE_PROFILES[1],
      sourceCommit: currentCommit(),
    });
    const [legacyDirectory, currentDirectory] = await Promise.all([
      installBundle({ bundle: legacy, releaseRoot: harness.releaseRoot }),
      installBundle({ bundle: current, releaseRoot: harness.releaseRoot }),
    ]);
    assert(await exists(legacyDirectory));
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
        rollbackArguments(legacy, current),
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
    const legacy = await buildBundle({
      directory: temporary,
      profile: REVIEWED_RELEASE_PROFILES[0],
      sourceCommit: legacySourceCommit,
    });
    const current = await buildBundle({
      directory: temporary,
      profile: REVIEWED_RELEASE_PROFILES[1],
      sourceCommit: currentCommit(),
    });
    const [legacyDirectory, currentDirectory] = await Promise.all([
      installBundle({ bundle: legacy, releaseRoot: harness.releaseRoot }),
      installBundle({ bundle: current, releaseRoot: harness.releaseRoot }),
    ]);
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
      rollbackArguments(legacy, current),
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
      rollbackArguments(legacy, current),
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
    assert.equal(await readlink(currentLink), await realpath(legacyDirectory));
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
