import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";

import {
  LEGACY_REVIEWED_RELEASE_CONTRACT,
} from "../deploy/reviewed-release-contract.mjs";

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const readGit = (repository, args, encoding = null) =>
  execFileSync("git", ["-C", repository, ...args], {
    encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

export const buildLegacyV1Fixture = async ({
  archivePath,
  manifestPath,
  profile,
  repository,
  sourceCommit,
}) => {
  if (
    profile?.contract !== LEGACY_REVIEWED_RELEASE_CONTRACT ||
    profile?.runtimeActivationAllowed !== false
  ) {
    throw new Error("legacy_fixture_profile_rejected");
  }
  const sourceTree = readGit(
    repository,
    ["rev-parse", `${sourceCommit}^{tree}`],
    "utf8",
  ).trim();
  const modules = profile.modulePaths.map((modulePath) => {
    const treeEntry = readGit(
      repository,
      ["ls-tree", sourceCommit, "--", modulePath],
      "utf8",
    ).trim();
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(
      treeEntry,
    );
    if (!match || match[3] !== modulePath) {
      throw new Error("legacy_fixture_module_rejected");
    }
    return {
      blobOid: match[2],
      mode: match[1],
      path: modulePath,
      sha256: sha256(
        readGit(repository, ["show", `${sourceCommit}:${modulePath}`]),
      ),
    };
  });
  readGit(repository, [
    "archive",
    "--format=tar",
    `--output=${archivePath}`,
    sourceCommit,
    "--",
    ...profile.modulePaths,
  ]);
  const manifest = {
    archiveSha256: sha256(await readFile(archivePath)),
    contract: LEGACY_REVIEWED_RELEASE_CONTRACT,
    moduleGraphSha256: sha256(`${JSON.stringify(modules)}\n`),
    modules,
    sourceCommit,
    sourceTree,
  };
  const raw = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, raw, { flag: "wx", mode: 0o600 });
  await chmod(archivePath, 0o600);
  return {
    manifest,
    manifestSha256: sha256(raw),
  };
};
