import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { releaseHash } from "./release-control-plane-lib.mjs";

const SHA40 = /^[0-9a-f]{40}$/u;
const REQUIRED = ["package.json", "package-lock.json", "app.json", "app.config.ts", "eas.json", ".easignore", "config/release/production-ota-generation.json"];
const runGit = (root, args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, "OTA_NATIVE_SOURCE_GIT_OBJECT_UNAVAILABLE");
  return result.stdout;
};

const readJson = (root, sha, name) => JSON.parse(runGit(root, ["show", `${sha}:${name}`]));

// Deliberately conservative source equality, not a claim of compiled-binary
// equivalence. Lock/config changes require native requalification; ordinary app
// JS, tests, docs and release readback updates do not change these inputs.
export function nativeSourceSnapshot({ repositoryRoot = process.cwd(), platform, sourceSha, sourceTree }) {
  assert.ok(platform === "ios" || platform === "android", "OTA_NATIVE_SOURCE_PLATFORM_INVALID");
  assert.match(sourceSha ?? "", SHA40, "OTA_NATIVE_SOURCE_SHA_INVALID");
  const tree = runGit(repositoryRoot, ["rev-parse", "--verify", `${sourceSha}^{tree}`]).trim();
  assert.match(tree, SHA40, "OTA_NATIVE_SOURCE_TREE_INVALID");
  if (sourceTree != null) assert.equal(tree, sourceTree, "OTA_NATIVE_SOURCE_TREE_MISMATCH");
  const entries = runGit(repositoryRoot, ["ls-tree", "-r", "-z", sourceSha]).split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/u.exec(entry);
    assert.ok(match, "OTA_NATIVE_SOURCE_TREE_ENTRY_INVALID");
    return { mode: match[1], type: match[2], object: match[3], path: match[4] };
  });
  const paths = new Set(entries.map((entry) => entry.path));
  const required = [...REQUIRED, platform === "ios"
    ? "modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift"
    : "plugins/withChillyChatNativeCallNotifications.js"];
  for (const name of required) assert.ok(paths.has(name), `OTA_NATIVE_SOURCE_INPUT_MISSING:${name}`);
  const included = (name) => {
    if (["package.json", "config/release/production-ota-generation.json"].includes(name)) return false;
    if (REQUIRED.includes(name) || [".npmrc", "google-services.json", "GoogleService-Info.plist"].includes(name)) return true;
    if (/^app\.config\./u.test(name) || /^(?:patches|vendor)\//u.test(name)) return true;
    if (name.startsWith(`${platform}/`) || name.startsWith(`config/${platform}/`)) return true;
    if (name.startsWith("modules/")) return !name.includes(platform === "ios" ? "/android/" : "/ios/");
    if (name.startsWith("plugins/")) {
      if (platform === "ios" && name === "plugins/withChillyChatNativeCallNotifications.js") return false;
      if (platform === "android" && ["plugins/withChillyChatIosNativeCalls.js", "plugins/withLiveKitIosStaticFrameworkCompatibility.js"].includes(name)) return false;
      return true;
    }
    return /^assets\/sounds\/chilly-chat\//u.test(name)
      || /^assets\/images\/(?:icon|splash-icon|android-icon-[^/]+)\./u.test(name);
  };
  const files = entries.filter((entry) => included(entry.path)).map((entry) => {
    assert.ok(entry.type === "blob" && ["100644", "100755"].includes(entry.mode), `OTA_NATIVE_SOURCE_INPUT_NOT_REGULAR:${entry.path}`);
    return { path: entry.path, mode: entry.mode, blob: entry.object };
  });
  const pkg = readJson(repositoryRoot, sourceSha, "package.json");
  const { scripts = {}, ...packageInputs } = pkg;
  packageInputs.scripts = Object.fromEntries(Object.entries(scripts).filter(([name]) => /^(?:preinstall|install|postinstall|prepare|prepublish|eas-build-)/u.test(name)));
  // These are app.config.ts inputs, not historical binary receipts. Including
  // receipt digests/build IDs here would make a release readback self-invalidating.
  const generation = readJson(repositoryRoot, sourceSha, "config/release/production-ota-generation.json");
  const generationInputs = { schemaVersion: generation.schemaVersion, generation: generation.generation, channel: generation.channel, runtimeVersion: generation[`${platform}RuntimeVersion`] };
  const androidManifestInputs = platform === "android" ? ["android-production", "android-chat-livekit-qa"].map((name) => {
    const value = readJson(repositoryRoot, sourceSha, `config/release/${name}.json`);
    return { name, packageIdentifier: value.packageIdentifier, runtimeVersion: value.runtimeVersion, nativeBuildSource: value.nativeBuildSource ?? null };
  }) : [];
  const input = { schemaVersion: 1, platform, files, packageInputs, generationInputs, androidManifestInputs };
  return { sourceSha, sourceTree: tree, digest: releaseHash(input), input };
}

export function deriveOtaNativeSourceCompatibility({ repositoryRoot = process.cwd(), platform, sourceSha, sourceTree, signedBinary }) {
  const source = nativeSourceSnapshot({ repositoryRoot, platform, sourceSha, sourceTree });
  assert.match(signedBinary?.sourceTree ?? "", SHA40, "OTA_BINARY_SOURCE_TREE_INVALID");
  const binary = nativeSourceSnapshot({ repositoryRoot, platform, sourceSha: signedBinary?.sourceSha, sourceTree: signedBinary?.sourceTree });
  let cohortDigest = null;
  let cohortSourceSha = null;
  let cohortSourceDigest = source.digest;
  let cohortAlgorithm = "git-native-inputs/v1";
  if (platform === "ios") {
    const cohort = readJson(repositoryRoot, sourceSha, "config/release/ios-internal-v2.json");
    assert.equal(cohort.runtimeVersion, "1.0.0-ios-production-v2", "OTA_NATIVE_COHORT_RUNTIME_INVALID");
    // This historical runtime member is not represented as the current device.
    // A newer receipt cannot silently redefine the existing runtime cohort.
    cohortSourceSha = cohort.expectedBinarySourceCommit;
    cohortDigest = nativeSourceSnapshot({ repositoryRoot, platform, sourceSha: cohortSourceSha }).digest;
  } else {
    assert.equal(runGit(repositoryRoot, ["rev-parse", "HEAD"]).trim(), sourceSha, "OTA_NATIVE_SOURCE_NOT_CHECKED_OUT");
    const computed = spawnSync(process.execPath, [new URL("./android-native-compatibility.mjs", import.meta.url).pathname, "--json"], { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(computed.status, 0, "OTA_NATIVE_COHORT_COMPUTATION_FAILED");
    cohortSourceDigest = JSON.parse(computed.stdout).digest;
    cohortDigest = readJson(repositoryRoot, sourceSha, "config/release/production-ota-generation.json").nativeCompatibility?.androidDigest;
    cohortAlgorithm = "android-native-compatibility/v1";
  }
  return { schemaVersion: 1, algorithm: "git-native-inputs/v1", platform, sourceDigest: source.digest, binaryDigest: binary.digest, cohortAlgorithm, cohortDigest, cohortSourceDigest, cohortSourceSha };
}
