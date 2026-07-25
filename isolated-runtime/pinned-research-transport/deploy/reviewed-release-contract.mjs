import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmod,
  lstat,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { resolve, sep } from "node:path";

export const REVIEWED_RELEASE_CONTRACT =
  "chillywood-reviewed-research-transport-release-v1";

export const RESEARCH_HOST_RUNTIME_MODULE_PATHS = Object.freeze([
  "config/intelligence/research-authorities.json",
  "isolated-runtime/pinned-research-transport/bin/server.mjs",
  "isolated-runtime/pinned-research-transport/deploy/readiness.sh",
  "isolated-runtime/pinned-research-transport/deploy/reviewed-release-contract.mjs",
  "isolated-runtime/pinned-research-transport/src/authority-policy.mjs",
  "isolated-runtime/pinned-research-transport/src/host-auth.mjs",
  "isolated-runtime/pinned-research-transport/src/host-service.mjs",
  "isolated-runtime/pinned-research-transport/src/invocation-contract.mjs",
  "isolated-runtime/pinned-research-transport/src/pinned-public-research-transport.mjs",
]);

const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MANIFEST_NAME = ".reviewed-release-manifest.json";
const MANIFEST_SHA_NAME = ".reviewed-release-manifest.sha256";
const RELEASE_ENVIRONMENT_NAME = ".release-environment";
const RELEASE_METADATA_FILES = new Set([
  MANIFEST_NAME,
  MANIFEST_SHA_NAME,
  RELEASE_ENVIRONMENT_NAME,
]);

const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const canonicalModuleGraph = (modules) =>
  `${JSON.stringify(modules)}\n`;

const canonicalManifest = (manifest) =>
  `${JSON.stringify(manifest, null, 2)}\n`;

const assertSafeModulePath = (value) => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("reviewed_release_module_path_rejected");
  }
  return value;
};

const allowedDirectoryEntries = () => {
  const entries = new Set();
  for (const modulePath of RESEARCH_HOST_RUNTIME_MODULE_PATHS) {
    const parts = modulePath.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      entries.add(`${parts.slice(0, index).join("/")}/`);
    }
  }
  return entries;
};

const normalizeManifest = (value) => {
  if (
    !exactKeys(value, [
      "archiveSha256",
      "contract",
      "moduleGraphSha256",
      "modules",
      "sourceCommit",
      "sourceTree",
    ]) ||
    value.contract !== REVIEWED_RELEASE_CONTRACT ||
    !SHA1.test(value.sourceCommit) ||
    !SHA1.test(value.sourceTree) ||
    !SHA256.test(value.archiveSha256) ||
    !SHA256.test(value.moduleGraphSha256) ||
    !Array.isArray(value.modules) ||
    value.modules.length !== RESEARCH_HOST_RUNTIME_MODULE_PATHS.length
  ) {
    throw new Error("reviewed_release_manifest_rejected");
  }
  const modules = value.modules.map((entry) => {
    if (
      !exactKeys(entry, ["blobOid", "mode", "path", "sha256"]) ||
      !SHA1.test(entry.blobOid) ||
      !["100644", "100755"].includes(entry.mode) ||
      !SHA256.test(entry.sha256)
    ) {
      throw new Error("reviewed_release_module_rejected");
    }
    return Object.freeze({
      blobOid: entry.blobOid,
      mode: entry.mode,
      path: assertSafeModulePath(entry.path),
      sha256: entry.sha256,
    });
  });
  const paths = modules.map(({ path }) => path);
  if (
    paths.join("\n") !== RESEARCH_HOST_RUNTIME_MODULE_PATHS.join("\n") ||
    new Set(paths).size !== paths.length ||
    sha256(canonicalModuleGraph(modules)) !== value.moduleGraphSha256
  ) {
    throw new Error("reviewed_release_module_graph_rejected");
  }
  return Object.freeze({
    archiveSha256: value.archiveSha256,
    contract: value.contract,
    moduleGraphSha256: value.moduleGraphSha256,
    modules: Object.freeze(modules),
    sourceCommit: value.sourceCommit,
    sourceTree: value.sourceTree,
  });
};

const readValidatedManifest = async (manifestPath, expectedManifestSha256) => {
  if (!SHA256.test(expectedManifestSha256)) {
    throw new Error("reviewed_release_manifest_hash_rejected");
  }
  const raw = await readFile(manifestPath);
  if (sha256(raw) !== expectedManifestSha256) {
    throw new Error("reviewed_release_manifest_hash_mismatch");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("reviewed_release_manifest_rejected");
  }
  const manifest = normalizeManifest(parsed);
  if (canonicalManifest(manifest) !== raw.toString("utf8")) {
    throw new Error("reviewed_release_manifest_not_canonical");
  }
  return { manifest, raw };
};

const readGit = (repository, args, encoding = null) =>
  execFileSync("git", ["-C", repository, ...args], {
    encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

const requireAbsent = async (path) => {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error("reviewed_release_output_exists");
};

export const buildReviewedRelease = async ({
  archivePath,
  manifestPath,
  repository,
  sourceCommit,
}) => {
  if (!SHA1.test(sourceCommit)) {
    throw new Error("reviewed_release_source_commit_rejected");
  }
  await Promise.all([requireAbsent(archivePath), requireAbsent(manifestPath)]);
  const canonicalCommit = readGit(
    repository,
    ["rev-parse", "--verify", `${sourceCommit}^{commit}`],
    "utf8",
  ).trim();
  if (canonicalCommit !== sourceCommit) {
    throw new Error("reviewed_release_source_commit_mismatch");
  }
  const sourceTree = readGit(
    repository,
    ["rev-parse", `${sourceCommit}^{tree}`],
    "utf8",
  ).trim();
  if (!SHA1.test(sourceTree)) {
    throw new Error("reviewed_release_source_tree_rejected");
  }
  const modules = RESEARCH_HOST_RUNTIME_MODULE_PATHS.map((modulePath) => {
    const treeEntry = readGit(
      repository,
      ["ls-tree", sourceCommit, "--", modulePath],
      "utf8",
    ).trim();
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(
      treeEntry,
    );
    if (!match || match[3] !== modulePath) {
      throw new Error("reviewed_release_git_module_rejected");
    }
    const content = readGit(
      repository,
      ["show", `${sourceCommit}:${modulePath}`],
    );
    return Object.freeze({
      blobOid: match[2],
      mode: match[1],
      path: modulePath,
      sha256: sha256(content),
    });
  });
  readGit(repository, [
    "archive",
    "--format=tar",
    `--output=${archivePath}`,
    sourceCommit,
    "--",
    ...RESEARCH_HOST_RUNTIME_MODULE_PATHS,
  ]);
  const archive = await readFile(archivePath);
  const manifest = Object.freeze({
    archiveSha256: sha256(archive),
    contract: REVIEWED_RELEASE_CONTRACT,
    moduleGraphSha256: sha256(canonicalModuleGraph(modules)),
    modules,
    sourceCommit,
    sourceTree,
  });
  await writeFile(manifestPath, canonicalManifest(manifest), {
    flag: "wx",
    mode: 0o600,
  });
  await chmod(archivePath, 0o600);
  const manifestSha256 = sha256(await readFile(manifestPath));
  return Object.freeze({ manifest, manifestSha256 });
};

export const verifyReviewedBundle = async ({
  archivePath,
  expectedManifestSha256,
  manifestPath,
}) => {
  const [{ manifest }, archive] = await Promise.all([
    readValidatedManifest(manifestPath, expectedManifestSha256),
    readFile(archivePath),
  ]);
  if (sha256(archive) !== manifest.archiveSha256) {
    throw new Error("reviewed_release_archive_hash_mismatch");
  }
  const rawEntries = execFileSync("tar", ["-tf", archivePath], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).split("\n").filter(Boolean);
  const fileEntries = [];
  const permittedDirectories = allowedDirectoryEntries();
  for (const entry of rawEntries) {
    if (
      entry.startsWith("/") ||
      entry.includes("\\") ||
      entry.split("/").some((part) => part === "." || part === "..")
    ) {
      throw new Error("reviewed_release_archive_path_rejected");
    }
    if (entry.endsWith("/")) {
      if (!permittedDirectories.has(entry)) {
        throw new Error("reviewed_release_archive_directory_rejected");
      }
    } else {
      fileEntries.push(entry);
    }
  }
  if (
    fileEntries.join("\n") !== RESEARCH_HOST_RUNTIME_MODULE_PATHS.join("\n") ||
    new Set(fileEntries).size !== fileEntries.length
  ) {
    throw new Error("reviewed_release_archive_inventory_rejected");
  }
  return Object.freeze({ manifest });
};

const walkFiles = async (root, relative = "") => {
  const directory = resolve(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error("reviewed_release_symlink_rejected");
    }
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, path));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      throw new Error("reviewed_release_file_type_rejected");
    }
  }
  return files;
};

export const verifyExtractedRelease = async ({
  directory,
  manifest,
  releaseMetadataAllowed = false,
}) => {
  const resolvedDirectory = resolve(directory);
  const files = (await walkFiles(resolvedDirectory)).sort();
  const expected = manifest.modules.map(({ path }) => path);
  if (releaseMetadataAllowed) {
    expected.push(...RELEASE_METADATA_FILES);
  }
  if (files.join("\n") !== expected.sort().join("\n")) {
    throw new Error("reviewed_release_extracted_inventory_rejected");
  }
  for (const module of manifest.modules) {
    const modulePath = resolve(resolvedDirectory, module.path);
    if (!modulePath.startsWith(`${resolvedDirectory}${sep}`)) {
      throw new Error("reviewed_release_module_path_rejected");
    }
    const metadata = await stat(modulePath);
    const executable = (metadata.mode & 0o111) !== 0;
    if (
      !metadata.isFile() ||
      sha256(await readFile(modulePath)) !== module.sha256 ||
      executable !== (module.mode === "100755")
    ) {
      throw new Error("reviewed_release_extracted_module_mismatch");
    }
  }
  return true;
};

const releaseEnvironment = (manifest, manifestSha256) =>
  [
    `COGNITIVE_RESEARCH_TRANSPORT_SOURCE_COMMIT=${manifest.sourceCommit}`,
    `COGNITIVE_RESEARCH_TRANSPORT_SOURCE_TREE=${manifest.sourceTree}`,
    `COGNITIVE_RESEARCH_TRANSPORT_RELEASE_MANIFEST_SHA256=${manifestSha256}`,
    "",
  ].join("\n");

export const installReleaseMetadata = async ({
  directory,
  expectedManifestSha256,
  manifestPath,
}) => {
  const { manifest, raw } = await readValidatedManifest(
    manifestPath,
    expectedManifestSha256,
  );
  await Promise.all([
    writeFile(
      resolve(directory, MANIFEST_NAME),
      raw,
      { flag: "wx", mode: 0o444 },
    ),
    writeFile(
      resolve(directory, MANIFEST_SHA_NAME),
      `${expectedManifestSha256}\n`,
      { flag: "wx", mode: 0o444 },
    ),
    writeFile(
      resolve(directory, RELEASE_ENVIRONMENT_NAME),
      releaseEnvironment(manifest, expectedManifestSha256),
      { flag: "wx", mode: 0o444 },
    ),
  ]);
  return manifest;
};

export const verifyInstalledRelease = async ({
  directory,
  expectedManifestSha256 = null,
  expectedSourceCommit = null,
}) => {
  const manifestPath = resolve(directory, MANIFEST_NAME);
  const storedManifestSha256 = (
    await readFile(resolve(directory, MANIFEST_SHA_NAME), "utf8")
  ).trim();
  if (
    !SHA256.test(storedManifestSha256) ||
    (
      expectedManifestSha256 !== null &&
      storedManifestSha256 !== expectedManifestSha256
    )
  ) {
    throw new Error("reviewed_release_stored_manifest_hash_rejected");
  }
  const { manifest } = await readValidatedManifest(
    manifestPath,
    storedManifestSha256,
  );
  if (
    expectedSourceCommit !== null &&
    manifest.sourceCommit !== expectedSourceCommit
  ) {
    throw new Error("reviewed_release_stored_source_commit_rejected");
  }
  const environment = await readFile(
    resolve(directory, RELEASE_ENVIRONMENT_NAME),
    "utf8",
  );
  if (environment !== releaseEnvironment(manifest, storedManifestSha256)) {
    throw new Error("reviewed_release_environment_rejected");
  }
  await verifyExtractedRelease({
    directory,
    manifest,
    releaseMetadataAllowed: true,
  });
  return Object.freeze({
    manifest,
    manifestSha256: storedManifestSha256,
  });
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  if (command === "build" && args.length === 4) {
    const [repository, sourceCommit, archivePath, manifestPath] = args;
    const result = await buildReviewedRelease({
      archivePath,
      manifestPath,
      repository,
      sourceCommit,
    });
    process.stdout.write(
      [
        `source_commit=${result.manifest.sourceCommit}`,
        `source_tree=${result.manifest.sourceTree}`,
        `source_archive_sha256=${result.manifest.archiveSha256}`,
        `module_graph_sha256=${result.manifest.moduleGraphSha256}`,
        `release_manifest_sha256=${result.manifestSha256}`,
        "",
      ].join("\n"),
    );
    return;
  }
  if (command === "verify-bundle" && args.length === 3) {
    const [archivePath, manifestPath, expectedManifestSha256] = args;
    const { manifest } = await verifyReviewedBundle({
      archivePath,
      expectedManifestSha256,
      manifestPath,
    });
    process.stdout.write(
      `${manifest.sourceCommit} ${manifest.sourceTree} ${manifest.archiveSha256} ${manifest.moduleGraphSha256}\n`,
    );
    return;
  }
  if (command === "verify-extracted" && args.length === 2) {
    const [directory, manifestPath] = args;
    const raw = await readFile(manifestPath, "utf8");
    const manifest = normalizeManifest(JSON.parse(raw));
    await verifyExtractedRelease({ directory, manifest });
    process.stdout.write("extracted_release=MATCH\n");
    return;
  }
  if (command === "install-metadata" && args.length === 3) {
    const [directory, manifestPath, expectedManifestSha256] = args;
    await installReleaseMetadata({
      directory,
      expectedManifestSha256,
      manifestPath,
    });
    process.stdout.write("release_metadata=MATCH\n");
    return;
  }
  if (
    command === "verify-release" &&
    (args.length === 1 || args.length === 3)
  ) {
    const [directory, expectedSourceCommit, expectedManifestSha256] = args;
    const result = await verifyInstalledRelease({
      directory,
      expectedManifestSha256: expectedManifestSha256 ?? null,
      expectedSourceCommit: expectedSourceCommit ?? null,
    });
    process.stdout.write(
      `${result.manifest.sourceCommit} ${result.manifest.sourceTree} ${result.manifestSha256}\n`,
    );
    return;
  }
  throw new Error("reviewed_release_contract_usage_rejected");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "reviewed_release_rejected"}\n`,
    );
    process.exitCode = 1;
  });
}
