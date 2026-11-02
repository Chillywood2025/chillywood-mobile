const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRunOncePlugin, withDangerousMod } = require("@expo/config-plugins");
const specification = require("./expo-camera-no-barcode/patches.json");

const PLUGIN_NAME = "with-expo-camera-no-barcode";
const SDK_VERSION = "17.0.10";
const SOURCE_BUILD_PATTERN = "^expo-camera$";
const SOURCE_BUILD_PATTERNS = [SOURCE_BUILD_PATTERN, "^expo-image-picker$"];
const PATCHES = specification.files;
const DEV_LAUNCHER_VERSION = "6.0.21";
const DEV_LAUNCHER_PATCHES = specification.devLauncher.files;
const digest = (source) => crypto.createHash("sha256").update(source).digest("hex");

// Offsets are in the exact original UTF-8 source (all patched files are ASCII).
// Reverse offsets include preceding size changes, so deleted blocks can be
// restored without ambiguous empty-string or substring replacements.
function transformNativeSource(patches, relativePath, source, reverse = false) {
  const patch = patches.find((entry) => entry.path === relativePath);
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

function transformSource(relativePath, source, reverse = false) {
  return transformNativeSource(PATCHES, relativePath, source, reverse);
}

function transformDevLauncherSource(relativePath, source, reverse = false) {
  return transformNativeSource(DEV_LAUNCHER_PATCHES, relativePath, source, reverse);
}

function assertSourceBuildConfigured(projectRoot) {
  const application = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const patterns = application.expo?.autolinking?.android?.buildFromSource;
  // SDK 54 otherwise links Expo Camera's published AAR and ignores our Kotlin
  // changes. Require the reviewed Android-only, exact Gradle-project regex;
  // a broad wildcard, iOS option or top-level lookalike is not this contract.
  if (!Array.isArray(patterns) || JSON.stringify(patterns) !== JSON.stringify(SOURCE_BUILD_PATTERNS)) {
    throw new Error(`${PLUGIN_NAME}: package.json expo.autolinking.android.buildFromSource must be ${JSON.stringify(SOURCE_BUILD_PATTERNS)} so both reviewed native source repairs are compiled.`);
  }
}

function applyNoBarcodePatch(projectRoot) {
  assertSourceBuildConfigured(projectRoot);
  const canonicalProjectRoot = fs.realpathSync(projectRoot);
  const requireContainedPath = (root, filename, description) => {
    const relative = path.relative(root, filename);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`${PLUGIN_NAME}: ${description} escapes projectRoot/package; refusing to patch ancestor or shared dependencies.`);
    }
  };
  // Validate BOTH packages and ALL thirteen files before any write. A late
  // launcher mismatch must not leave the camera partially patched, and vice
  // versa. Accept original or reviewed patched hashes for repeatable prebuild.
  const packages = [
    { name: "expo-camera", version: SDK_VERSION, spec: specification },
    { name: "expo-dev-launcher", version: DEV_LAUNCHER_VERSION, spec: specification.devLauncher },
  ];
  const plans = packages.map(({ name, version, spec }) => {
    const packagePath = fs.realpathSync(require.resolve(`${name}/package.json`, { paths: [projectRoot] }));
    const sdkRoot = path.dirname(packagePath);
    requireContainedPath(canonicalProjectRoot, sdkRoot, `resolved ${name} package`);
    const sdk = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (sdk.version !== version || spec.packageVersion !== version) {
      throw new Error(`${PLUGIN_NAME}: review required for SDK version ${sdk.version} (${name}).`);
    }
    return spec.files.map(({ path: relativePath, patchedSha256 }) => {
      const filename = fs.realpathSync(path.join(sdkRoot, relativePath));
      requireContainedPath(sdkRoot, filename, `${name} source ${relativePath}`);
      const original = fs.readFileSync(filename, "utf8");
      return { filename, relativePath, original, patched: transformNativeSource(spec.files, relativePath, original), sha256: patchedSha256 };
    });
  });
  for (const item of plans.flat()) {
    if (item.patched !== item.original) fs.writeFileSync(item.filename, item.patched);
  }
  const receipt = (plan) => plan.map(({ relativePath, sha256 }) => ({ path: relativePath, sha256 }));
  return { sdkVersion: SDK_VERSION, files: receipt(plans[0]), devLauncherVersion: DEV_LAUNCHER_VERSION, devLauncherFiles: receipt(plans[1]) };
}

function withExpoCameraNoBarcode(config) {
  return withDangerousMod(config, ["android", (nextConfig) => {
    applyNoBarcodePatch(nextConfig.modRequest.projectRoot);
    return nextConfig;
  }]);
}

module.exports = createRunOncePlugin(withExpoCameraNoBarcode, PLUGIN_NAME, "1.0.0");
module.exports.__test = { SDK_VERSION, SOURCE_BUILD_PATTERN, SOURCE_BUILD_PATTERNS, PATCHES, DEV_LAUNCHER_VERSION, DEV_LAUNCHER_PATCHES, digest, transformSource, transformDevLauncherSource, assertSourceBuildConfigured, applyNoBarcodePatch };
