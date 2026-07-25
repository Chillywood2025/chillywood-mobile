import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import {
  chmod,
  lstat,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { resolve, sep } from "node:path";

import {
  CURRENT_CREDENTIAL_DIRECTORY_ABI,
  CURRENT_CREDENTIAL_DIRECTORY_PATH,
} from "../src/credential-directory-contract.mjs";

export const LEGACY_REVIEWED_RELEASE_CONTRACT =
  "chillywood-reviewed-research-transport-release-v1";
export const REVIEWED_RELEASE_CONTRACT =
  "chillywood-reviewed-research-transport-release-v2";
export {
  CURRENT_CREDENTIAL_DIRECTORY_ABI,
  CURRENT_CREDENTIAL_DIRECTORY_PATH,
};

const LEGACY_V1_RUNTIME_MODULE_PATHS = Object.freeze([
  "config/intelligence/research-authorities.json",
  "isolated-runtime/cloudflare/src/adapters/research-fetch-transport.mjs",
  "isolated-runtime/pinned-research-transport/bin/server.mjs",
  "isolated-runtime/pinned-research-transport/deploy/readiness.sh",
  "isolated-runtime/pinned-research-transport/deploy/reviewed-release-contract.mjs",
  "isolated-runtime/pinned-research-transport/src/authority-policy.mjs",
  "isolated-runtime/pinned-research-transport/src/host-auth.mjs",
  "isolated-runtime/pinned-research-transport/src/host-service.mjs",
  "isolated-runtime/pinned-research-transport/src/invocation-contract.mjs",
  "isolated-runtime/pinned-research-transport/src/pinned-public-research-transport.mjs",
]);

const LEGACY_V1_THIRTEEN_MODULE_PATHS = Object.freeze([
  "config/intelligence/research-authorities.json",
  "isolated-runtime/cloudflare/src/adapters/research-fetch-transport.mjs",
  "isolated-runtime/pinned-research-transport/bin/server.mjs",
  "isolated-runtime/pinned-research-transport/deploy/chillywood-research-transport-credential-compat.conf.template",
  "isolated-runtime/pinned-research-transport/deploy/deploy-reviewed-release.sh",
  "isolated-runtime/pinned-research-transport/deploy/readiness.sh",
  "isolated-runtime/pinned-research-transport/deploy/reviewed-release-contract.mjs",
  "isolated-runtime/pinned-research-transport/deploy/rollback-reviewed-release.sh",
  "isolated-runtime/pinned-research-transport/src/authority-policy.mjs",
  "isolated-runtime/pinned-research-transport/src/host-auth.mjs",
  "isolated-runtime/pinned-research-transport/src/host-service.mjs",
  "isolated-runtime/pinned-research-transport/src/invocation-contract.mjs",
  "isolated-runtime/pinned-research-transport/src/pinned-public-research-transport.mjs",
]);

export const RESEARCH_HOST_RUNTIME_MODULE_PATHS = Object.freeze([
  ...LEGACY_V1_THIRTEEN_MODULE_PATHS.slice(0, 9),
  "isolated-runtime/pinned-research-transport/src/credential-directory-contract.mjs",
  ...LEGACY_V1_THIRTEEN_MODULE_PATHS.slice(9),
]);

export const REVIEWED_RELEASE_PROFILES = Object.freeze([
  Object.freeze({
    id: "chillywood-pinned-research-host-runtime-v1-legacy-10",
    contract: LEGACY_REVIEWED_RELEASE_CONTRACT,
    credentialDirectoryAbi: null,
    credentialDirectoryPath: null,
    modulePaths: LEGACY_V1_RUNTIME_MODULE_PATHS,
    runtimeActivationAllowed: false,
  }),
  Object.freeze({
    id: "chillywood-pinned-research-host-runtime-v2-legacy-13",
    contract: LEGACY_REVIEWED_RELEASE_CONTRACT,
    credentialDirectoryAbi: null,
    credentialDirectoryPath: null,
    modulePaths: LEGACY_V1_THIRTEEN_MODULE_PATHS,
    runtimeActivationAllowed: false,
  }),
  Object.freeze({
    id: "chillywood-pinned-research-host-runtime-v4-current-14",
    contract: REVIEWED_RELEASE_CONTRACT,
    credentialDirectoryAbi: CURRENT_CREDENTIAL_DIRECTORY_ABI,
    credentialDirectoryPath: CURRENT_CREDENTIAL_DIRECTORY_PATH,
    modulePaths: RESEARCH_HOST_RUNTIME_MODULE_PATHS,
    runtimeActivationAllowed: true,
  }),
]);

export const CURRENT_REVIEWED_RELEASE_PROFILE =
  REVIEWED_RELEASE_PROFILES[2];

const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const CREDENTIAL_DIRECTORY_CONTRACT_MODULE_PATH =
  "isolated-runtime/pinned-research-transport/src/credential-directory-contract.mjs";
const MANIFEST_NAME = ".reviewed-release-manifest.json";
const MANIFEST_SHA_NAME = ".reviewed-release-manifest.sha256";
const RELEASE_ENVIRONMENT_NAME = ".release-environment";
export const CREDENTIAL_OVERLAY_MODULE_PATH =
  "isolated-runtime/pinned-research-transport/deploy/chillywood-research-transport-credential-compat.conf.template";
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

const validateExactCredentialDirectoryContract = async ({
  source,
  sourceCommit,
  sourceTree,
}) => {
  const sourceSha256 = sha256(source);
  let contract;
  try {
    contract = await import(
      `data:text/javascript;base64,${
        Buffer.from(source).toString("base64")
      }#${sourceCommit}-${sourceSha256}`
    );
  } catch {
    throw new Error("reviewed_release_runtime_abi_source_rejected");
  }
  if (
    Object.keys(contract).sort().join("\n") !==
      [
        "CURRENT_CREDENTIAL_DIRECTORY_ABI",
        "CURRENT_CREDENTIAL_DIRECTORY_PATH",
        "validateResearchHostConfiguration",
      ].join("\n") ||
    contract.CURRENT_CREDENTIAL_DIRECTORY_ABI !==
      CURRENT_CREDENTIAL_DIRECTORY_ABI ||
    contract.CURRENT_CREDENTIAL_DIRECTORY_PATH !==
      CURRENT_CREDENTIAL_DIRECTORY_PATH ||
    typeof contract.validateResearchHostConfiguration !== "function"
  ) {
    throw new Error("reviewed_release_runtime_abi_source_rejected");
  }
  const exactEnvironment = Object.freeze({
    CREDENTIALS_DIRECTORY: CURRENT_CREDENTIAL_DIRECTORY_PATH,
    COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_ABI:
      CURRENT_CREDENTIAL_DIRECTORY_ABI,
    COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_PATH:
      CURRENT_CREDENTIAL_DIRECTORY_PATH,
    COGNITIVE_RESEARCH_TRANSPORT_RELEASE_MANIFEST_SHA256:
      "0".repeat(64),
    COGNITIVE_RESEARCH_TRANSPORT_SOURCE_COMMIT: sourceCommit,
    COGNITIVE_RESEARCH_TRANSPORT_SOURCE_TREE: sourceTree,
  });
  let validated;
  try {
    validated =
      contract.validateResearchHostConfiguration(exactEnvironment);
  } catch {
    throw new Error("reviewed_release_runtime_abi_source_rejected");
  }
  if (
    !Object.isFrozen(validated) ||
    !exactKeys(validated, [
      "credentialDirectory",
      "releaseManifestSha256",
      "sourceCommit",
      "sourceTree",
    ]) ||
    validated.credentialDirectory !==
      CURRENT_CREDENTIAL_DIRECTORY_PATH ||
    validated.releaseManifestSha256 !== "0".repeat(64) ||
    validated.sourceCommit !== sourceCommit ||
    validated.sourceTree !== sourceTree
  ) {
    throw new Error("reviewed_release_runtime_abi_source_rejected");
  }
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
    try {
      contract.validateResearchHostConfiguration({
        ...exactEnvironment,
        ...override,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "research_host_configuration_rejected"
      ) {
        continue;
      }
    }
    throw new Error("reviewed_release_runtime_abi_source_rejected");
  }
};

const canonicalModuleGraph = (modules) =>
  `${JSON.stringify(modules)}\n`;

const canonicalManifest = (manifest) => {
  const value = {
    archiveSha256: manifest.archiveSha256,
    contract: manifest.contract,
  };
  if (manifest.contract === REVIEWED_RELEASE_CONTRACT) {
    value.credentialDirectoryAbi = manifest.credentialDirectoryAbi;
    value.credentialDirectoryPath = manifest.credentialDirectoryPath;
  }
  value.moduleGraphSha256 = manifest.moduleGraphSha256;
  value.modules = manifest.modules;
  value.sourceCommit = manifest.sourceCommit;
  value.sourceTree = manifest.sourceTree;
  return `${JSON.stringify(value, null, 2)}\n`;
};

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

const reviewedReleaseProfile = (paths, contract) => {
  const profile = REVIEWED_RELEASE_PROFILES.find(
    ({ contract: profileContract, modulePaths }) =>
      profileContract === contract &&
      modulePaths.join("\n") === paths.join("\n"),
  );
  if (!profile) {
    throw new Error("reviewed_release_profile_rejected");
  }
  return profile;
};

const allowedDirectoryEntries = (modulePaths) => {
  const entries = new Set();
  for (const modulePath of modulePaths) {
    const parts = modulePath.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      entries.add(`${parts.slice(0, index).join("/")}/`);
    }
  }
  return entries;
};

const normalizeManifest = (value) => {
  const isLegacy =
    value?.contract === LEGACY_REVIEWED_RELEASE_CONTRACT;
  const isCurrent = value?.contract === REVIEWED_RELEASE_CONTRACT;
  const expectedKeys = isCurrent
    ? [
        "archiveSha256",
        "contract",
        "credentialDirectoryAbi",
        "credentialDirectoryPath",
        "moduleGraphSha256",
        "modules",
        "sourceCommit",
        "sourceTree",
      ]
    : [
        "archiveSha256",
        "contract",
        "moduleGraphSha256",
        "modules",
        "sourceCommit",
        "sourceTree",
      ];
  if (
    (!isLegacy && !isCurrent) ||
    !exactKeys(value, expectedKeys) ||
    !SHA1.test(value.sourceCommit) ||
    !SHA1.test(value.sourceTree) ||
    !SHA256.test(value.archiveSha256) ||
    !SHA256.test(value.moduleGraphSha256) ||
    !Array.isArray(value.modules) ||
    (
      isCurrent &&
      (
        value.credentialDirectoryAbi !==
          CURRENT_CREDENTIAL_DIRECTORY_ABI ||
        value.credentialDirectoryPath !==
          CURRENT_CREDENTIAL_DIRECTORY_PATH
      )
    )
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
  const profile = reviewedReleaseProfile(paths, value.contract);
  if (
    new Set(paths).size !== paths.length ||
    sha256(canonicalModuleGraph(modules)) !== value.moduleGraphSha256
  ) {
    throw new Error("reviewed_release_module_graph_rejected");
  }
  return Object.freeze({
    archiveSha256: value.archiveSha256,
    contract: value.contract,
    credentialDirectoryAbi:
      isCurrent ? value.credentialDirectoryAbi : null,
    credentialDirectoryPath:
      isCurrent ? value.credentialDirectoryPath : null,
    moduleGraphSha256: value.moduleGraphSha256,
    modules: Object.freeze(modules),
    releaseProfile: profile.id,
    runtimeActivationAllowed: profile.runtimeActivationAllowed,
    sourceCommit: value.sourceCommit,
    sourceTree: value.sourceTree,
  });
};

export const requireCurrentRuntimeAbi = (manifest) => {
  if (
    manifest?.contract !== REVIEWED_RELEASE_CONTRACT ||
    manifest?.releaseProfile !== CURRENT_REVIEWED_RELEASE_PROFILE.id ||
    manifest?.runtimeActivationAllowed !== true ||
    manifest?.credentialDirectoryAbi !==
      CURRENT_CREDENTIAL_DIRECTORY_ABI ||
    manifest?.credentialDirectoryPath !==
      CURRENT_CREDENTIAL_DIRECTORY_PATH
  ) {
    throw new Error("reviewed_release_runtime_abi_rejected");
  }
  return true;
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
  releaseProfile = CURRENT_REVIEWED_RELEASE_PROFILE,
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
  const selectedProfile = REVIEWED_RELEASE_PROFILES.find(
    ({ id }) => id === releaseProfile?.id,
  );
  if (
    !selectedProfile ||
    selectedProfile.id !== CURRENT_REVIEWED_RELEASE_PROFILE.id ||
    selectedProfile.contract !== REVIEWED_RELEASE_CONTRACT ||
    selectedProfile.runtimeActivationAllowed !== true ||
    !Array.isArray(releaseProfile?.modulePaths) ||
    releaseProfile.modulePaths.join("\n") !==
      selectedProfile.modulePaths.join("\n")
  ) {
    throw new Error("reviewed_release_profile_rejected");
  }
  const sourceTree = readGit(
    repository,
    ["rev-parse", `${sourceCommit}^{tree}`],
    "utf8",
  ).trim();
  if (!SHA1.test(sourceTree)) {
    throw new Error("reviewed_release_source_tree_rejected");
  }
  let selectedCredentialDirectoryContract;
  try {
    selectedCredentialDirectoryContract = readGit(
      repository,
      [
        "show",
        `${sourceCommit}:${CREDENTIAL_DIRECTORY_CONTRACT_MODULE_PATH}`,
      ],
    );
  } catch {
    throw new Error("reviewed_release_runtime_abi_source_rejected");
  }
  await validateExactCredentialDirectoryContract({
    source: selectedCredentialDirectoryContract,
    sourceCommit,
    sourceTree,
  });
  const modules = selectedProfile.modulePaths.map((modulePath) => {
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
    ...selectedProfile.modulePaths,
  ]);
  const archive = await readFile(archivePath);
  const manifest = Object.freeze({
    archiveSha256: sha256(archive),
    contract: REVIEWED_RELEASE_CONTRACT,
    credentialDirectoryAbi: CURRENT_CREDENTIAL_DIRECTORY_ABI,
    credentialDirectoryPath: CURRENT_CREDENTIAL_DIRECTORY_PATH,
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
  const modulePaths = manifest.modules.map(({ path }) => path);
  const permittedDirectories = allowedDirectoryEntries(modulePaths);
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
    fileEntries.join("\n") !== modulePaths.join("\n") ||
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
    ...(
      manifest.contract === REVIEWED_RELEASE_CONTRACT
        ? [
            `COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_ABI=${manifest.credentialDirectoryAbi}`,
            `COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_PATH=${manifest.credentialDirectoryPath}`,
          ]
        : []
    ),
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

export const verifyCredentialOverlaySource = async ({
  directory,
  expectedManifestSha256,
  expectedSourceCommit,
}) => {
  const release = await verifyInstalledRelease({
    directory,
    expectedManifestSha256,
    expectedSourceCommit,
  });
  requireCurrentRuntimeAbi(release.manifest);
  const module = release.manifest.modules.find(
    ({ path }) => path === CREDENTIAL_OVERLAY_MODULE_PATH,
  );
  if (!module) {
    throw new Error("reviewed_release_overlay_module_rejected");
  }
  return Object.freeze({
    credentialDirectoryAbi:
      release.manifest.credentialDirectoryAbi,
    credentialDirectoryPath:
      release.manifest.credentialDirectoryPath,
    releaseProfile: release.manifest.releaseProfile,
    sha256: module.sha256,
  });
};

export const verifyActiveInstalledRelease = async ({
  directory,
  expectedManifestSha256 = null,
  expectedSourceCommit = null,
}) => {
  const release = await verifyInstalledRelease({
    directory,
    expectedManifestSha256,
    expectedSourceCommit,
  });
  requireCurrentRuntimeAbi(release.manifest);
  return release;
};

export const verifyInstalledCredentialOverlay = async ({
  expectedGid,
  expectedSha256,
  expectedUid,
  overlayPath,
}) => {
  if (
    !Number.isSafeInteger(expectedUid) ||
    expectedUid < 0 ||
    !Number.isSafeInteger(expectedGid) ||
    expectedGid < 0 ||
    !SHA256.test(expectedSha256)
  ) {
    throw new Error("installed_credential_overlay_contract_rejected");
  }
  const metadata = await lstat(overlayPath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== expectedUid ||
    metadata.gid !== expectedGid ||
    (metadata.mode & 0o777) !== 0o644 ||
    sha256(await readFile(overlayPath)) !== expectedSha256
  ) {
    throw new Error("installed_credential_overlay_rejected");
  }
  return true;
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
      `${manifest.sourceCommit} ${manifest.sourceTree} ${manifest.archiveSha256} ${manifest.moduleGraphSha256} ${manifest.releaseProfile}\n`,
    );
    return;
  }
  if (command === "verify-deployable-bundle" && args.length === 3) {
    const [archivePath, manifestPath, expectedManifestSha256] = args;
    const { manifest } = await verifyReviewedBundle({
      archivePath,
      expectedManifestSha256,
      manifestPath,
    });
    requireCurrentRuntimeAbi(manifest);
    process.stdout.write(
      `${manifest.sourceCommit} ${manifest.sourceTree} ${manifest.archiveSha256} ${manifest.moduleGraphSha256} ${manifest.releaseProfile}\n`,
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
  if (
    command === "verify-active-release" &&
    (args.length === 1 || args.length === 3)
  ) {
    const [directory, expectedSourceCommit, expectedManifestSha256] = args;
    const result = await verifyActiveInstalledRelease({
      directory,
      expectedManifestSha256: expectedManifestSha256 ?? null,
      expectedSourceCommit: expectedSourceCommit ?? null,
    });
    process.stdout.write(
      `${result.manifest.sourceCommit} ${result.manifest.sourceTree} ${result.manifestSha256}\n`,
    );
    return;
  }
  if (command === "verify-overlay-source" && args.length === 3) {
    const [directory, expectedSourceCommit, expectedManifestSha256] = args;
    const result = await verifyCredentialOverlaySource({
      directory,
      expectedManifestSha256,
      expectedSourceCommit,
    });
    process.stdout.write(`${result.sha256}\n`);
    return;
  }
  if (command === "verify-installed-overlay" && args.length === 4) {
    const [overlayPath, expectedSha256, expectedUidRaw, expectedGidRaw] = args;
    if (
      !/^(?:0|[1-9][0-9]*)$/u.test(expectedUidRaw) ||
      !/^(?:0|[1-9][0-9]*)$/u.test(expectedGidRaw)
    ) {
      throw new Error("installed_credential_overlay_contract_rejected");
    }
    await verifyInstalledCredentialOverlay({
      expectedGid: Number(expectedGidRaw),
      expectedSha256,
      expectedUid: Number(expectedUidRaw),
      overlayPath,
    });
    process.stdout.write("installed_credential_overlay=MATCH\n");
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
