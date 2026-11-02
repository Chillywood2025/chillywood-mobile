const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRunOncePlugin, withDangerousMod } = require("@expo/config-plugins");
const specification = require("./expo-image-picker-android-result-retention/patches.json");

const PLUGIN_NAME = "with-expo-image-picker-android-result-retention";
const SOURCE_BUILD_PATTERNS = ["^expo-camera$", "^expo-image-picker$"];
const digest = (source) => crypto.createHash("sha256").update(source).digest("hex");

function transformSource(packageName, relativePath, source, reverse = false) {
  const pkg = specification.packages.find((entry) => entry.name === packageName);
  const patch = pkg?.files.find((entry) => entry.path === relativePath);
  if (!patch) throw new Error(`${PLUGIN_NAME}: unknown native source.`);
  const required = reverse ? patch.patchedSha256 : patch.originalSha256;
  const desired = reverse ? patch.originalSha256 : patch.patchedSha256;
  if (digest(source) === desired) return source;
  if (digest(source) !== required) throw new Error(`${PLUGIN_NAME}: unreviewed ${packageName} native source digest (${relativePath}).`);
  let result = source;
  for (const [before, after] of reverse ? [...patch.changes].reverse() : patch.changes) {
    const from = reverse ? after : before;
    const to = reverse ? before : after;
    if (result.split(from).length !== 2) throw new Error(`${PLUGIN_NAME}: native source anchor changed.`);
    result = result.replace(from, to);
  }
  if (digest(result) !== desired) throw new Error(`${PLUGIN_NAME}: generated native source digest mismatch.`);
  return result;
}

function assertSourceBuildConfigured(projectRoot) {
  const application = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const patterns = application.expo?.autolinking?.android?.buildFromSource;
  if (!Array.isArray(patterns) || JSON.stringify(patterns) !== JSON.stringify(SOURCE_BUILD_PATTERNS)) {
    throw new Error(`${PLUGIN_NAME}: reviewed Android buildFromSource patterns required so patched ImagePicker source, not its prebuilt AAR, is linked.`);
  }
}

function requireContainedPath(root, filename) {
  const relative = path.relative(root, filename);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${PLUGIN_NAME}: dependency escapes projectRoot/package; refusing shared or ancestor mutation.`);
  }
}

function applyRetentionPatch(projectRoot) {
  assertSourceBuildConfigured(projectRoot);
  const canonicalRoot = fs.realpathSync(projectRoot);
  // Validate both exact versions and all six files before any write. This also
  // rejects shared/symlinked dependencies; generate in an isolated install.
  const plans = specification.packages.flatMap((pkg) => {
    const packagePath = fs.realpathSync(require.resolve(`${pkg.name}/package.json`, { paths: [projectRoot] }));
    const sdkRoot = path.dirname(packagePath);
    requireContainedPath(canonicalRoot, sdkRoot);
    const sdk = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (sdk.version !== pkg.version) throw new Error(`${PLUGIN_NAME}: review required for ${pkg.name} version ${sdk.version}.`);
    return pkg.files.map((entry) => {
      const filename = fs.realpathSync(path.join(sdkRoot, entry.path));
      requireContainedPath(sdkRoot, filename);
      const original = fs.readFileSync(filename, "utf8");
      return { packageName: pkg.name, version: pkg.version, path: entry.path, filename, original,
        patched: transformSource(pkg.name, entry.path, original), sha256: entry.patchedSha256 };
    });
  });
  for (const item of plans) if (item.original !== item.patched) fs.writeFileSync(item.filename, item.patched);
  return plans.map(({ packageName, version, path: relativePath, sha256 }) => ({ packageName, version, path: relativePath, sha256 }));
}

function withExpoImagePickerAndroidResultRetention(config) {
  return withDangerousMod(config, ["android", (nextConfig) => {
    applyRetentionPatch(nextConfig.modRequest.projectRoot);
    return nextConfig;
  }]);
}

module.exports = createRunOncePlugin(withExpoImagePickerAndroidResultRetention, PLUGIN_NAME, "1.0.0");
module.exports.__test = { specification, SOURCE_BUILD_PATTERNS, digest, transformSource, assertSourceBuildConfigured, applyRetentionPatch };
