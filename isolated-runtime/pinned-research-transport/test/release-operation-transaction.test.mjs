import assert from "node:assert/strict";
import {
  execFileSync,
  spawn,
  spawnSync,
} from "node:child_process";
import {
  chmod,
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
const compatibilityTemplate = resolve(
  deployDirectory,
  "chillywood-research-transport-credential-compat.conf.template",
);
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
  await chmod(systemctl, 0o700);
  await chmod(readiness, 0o700);
  await chmod(atomicMove, 0o700);
  await writeFile(readinessMode, "pass\n");
  return {
    binDirectory,
    dropIn,
    hostRoot,
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
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
      await readFile(compatibilityTemplate, "utf8"),
    );
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
    const stableOverlay = await readFile(compatibilityTemplate);
    await writeFile(harness.dropIn, stableOverlay);

    const result = run(
      rollbackScript,
      [legacy.sourceCommit, legacy.manifestSha256],
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
    await writeFile(harness.dropIn, "stable-overlay\n");
    const lock = resolve(
      harness.transportRoot,
      ".deployment-rollback.lock",
    );
    const initialCurrentTarget = await readlink(currentLink);

    await mkdir(lock);
    const stale = run(
      rollbackScript,
      [legacy.sourceCommit, legacy.manifestSha256],
      harness.hostRoot,
    );
    assert.equal(stale.status, 73, stale.stderr);
    assert.equal(await readlink(currentLink), initialCurrentTarget);
    assert.equal(await readFile(harness.dropIn, "utf8"), "stable-overlay\n");
    assert.equal(await exists(lock), true);
    await rm(lock, { recursive: true });

    await writeFile(harness.readinessMode, "block\n");
    const first = spawn(
      rollbackScript,
      [legacy.sourceCommit, legacy.manifestSha256],
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
      [current.sourceCommit, current.manifestSha256],
      harness.hostRoot,
    );
    assert.equal(concurrent.status, 73, concurrent.stderr);
    assert.equal(await readlink(currentLink), await realpath(legacyDirectory));
    assert.equal(await readFile(harness.dropIn, "utf8"), "stable-overlay\n");
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
