const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRunOncePlugin, withDangerousMod } = require("@expo/config-plugins");
const specification = require("./expo-camera-no-barcode/patches.json");

const PLUGIN_NAME = "with-expo-camera-no-barcode";
const SDK_VERSION = "17.0.10";
const SOURCE_BUILD_PATTERN = "^expo-camera$";
const PATCHES = specification.files;
const digest = (source) => crypto.createHash("sha256").update(source).digest("hex");

// Offsets are in the exact original UTF-8 source (all patched files are ASCII).
// Reverse offsets include preceding size changes, so deleted blocks can be
// restored without ambiguous empty-string or substring replacements.
function transformSource(relativePath, source, reverse = false) {
  const patch = PATCHES.find((entry) => entry.path === relativePath);
  if (!patch) throw new Error(`${PLUGIN_NAME}: unknown native source ${relativePath}.`);
  const required = reverse ? patch.patchedSha256 : patch.originalSha256;
  const desired = reverse ? patch.originalSha256 : patch.patchedSha256;
  const current = digest(source);
  if (current === desired) return source;
  if (current !== required) {
    throw new Error(`${PLUGIN_NAME}: unreviewed native source digest for ${relativePath}.`);
  }

  let delta = 0;
  const changes = patch.changes.map(({ offset, before, after }) => {
    const change = reverse
      ? { offset: offset + delta, before: after, after: before }
      : { offset, before, after };
    delta += after.length - before.length;
    return change;
  });
  let result = source;
  for (const { offset, before, after } of changes.reverse()) {
    if (result.slice(offset, offset + before.length) !== before) {
      throw new Error(`${PLUGIN_NAME}: native source anchor changed for ${relativePath}.`);
    }
    result = result.slice(0, offset) + after + result.slice(offset + before.length);
  }
  if (digest(result) !== desired) {
    throw new Error(`${PLUGIN_NAME}: generated source digest mismatch for ${relativePath}.`);
  }
  return result;
}

function assertSourceBuildConfigured(projectRoot) {
  const application = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const patterns = application.expo?.autolinking?.android?.buildFromSource;
  // SDK 54 otherwise links Expo Camera's published AAR and ignores our Kotlin
  // changes. Require the reviewed Android-only, exact Gradle-project regex;
  // a broad wildcard, iOS option or top-level lookalike is not this contract.
  if (!Array.isArray(patterns) || patterns.length !== 1 || patterns[0] !== SOURCE_BUILD_PATTERN) {
    throw new Error(`${PLUGIN_NAME}: package.json expo.autolinking.android.buildFromSource must be ["${SOURCE_BUILD_PATTERN}"] so the patched Expo Camera source is compiled.`);
  }
}

function applyNoBarcodePatch(projectRoot) {
  assertSourceBuildConfigured(projectRoot);
  const packagePath = require.resolve("expo-camera/package.json", { paths: [projectRoot] });
  const sdk = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (sdk.version !== SDK_VERSION || specification.packageVersion !== SDK_VERSION) {
    throw new Error(`${PLUGIN_NAME}: review required for SDK version ${sdk.version}.`);
  }
  const sdkRoot = path.dirname(packagePath);

  // Complete validation is a single read/transform phase. In particular, a bad
  // LAST file must not leave the earlier files partially patched. Both original
  // and already-patched hashes are accepted to make repeated prebuild safe.
  const plan = PATCHES.map(({ path: relativePath, patchedSha256 }) => {
    const filename = path.join(sdkRoot, relativePath);
    const original = fs.readFileSync(filename, "utf8");
    return { filename, relativePath, original, patched: transformSource(relativePath, original), sha256: patchedSha256 };
  });
  for (const item of plan) {
    if (item.patched !== item.original) fs.writeFileSync(item.filename, item.patched);
  }
  return { sdkVersion: sdk.version, files: plan.map(({ relativePath, sha256 }) => ({ path: relativePath, sha256 })) };
}

function withExpoCameraNoBarcode(config) {
  return withDangerousMod(config, ["android", (nextConfig) => {
    applyNoBarcodePatch(nextConfig.modRequest.projectRoot);
    return nextConfig;
  }]);
}

module.exports = createRunOncePlugin(withExpoCameraNoBarcode, PLUGIN_NAME, "1.0.0");
module.exports.__test = { SDK_VERSION, SOURCE_BUILD_PATTERN, PATCHES, digest, transformSource, assertSourceBuildConfigured, applyNoBarcodePatch };
