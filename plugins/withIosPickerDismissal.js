const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRunOncePlugin, withDangerousMod } = require("@expo/config-plugins");
const specification = require("./ios-picker-dismissal/patches.json");

const PLUGIN_NAME = "with-ios-picker-dismissal";
const digest = (source) => crypto.createHash("sha256").update(source).digest("hex");
const helperSource = () => fs.readFileSync(require.resolve("./native/ChillywoodPickerDismissal.swift"), "utf8");

function transformSource(definition, source, reverse = false) {
  const required = reverse ? definition.patchedSha256 : definition.originalSha256;
  const desired = reverse ? definition.originalSha256 : definition.patchedSha256;
  if (digest(source) === desired) return source;
  if (digest(source) !== required) throw new Error(`${PLUGIN_NAME}: unreviewed source ${definition.path}.`);
  let delta = 0;
  const changes = definition.changes.map(({ offset, before, after }) => {
    const change = reverse ? { offset: offset + delta, before: after, after: before } : { offset, before, after };
    delta += after.length - before.length;
    return change;
  });
  let result = source;
  for (const { offset, before, after } of changes.reverse()) {
    if (result.slice(offset, offset + before.length) !== before) throw new Error(`${PLUGIN_NAME}: changed source anchor.`);
    result = result.slice(0, offset) + after + result.slice(offset + before.length);
  }
  if (digest(result) !== desired) throw new Error(`${PLUGIN_NAME}: patched digest mismatch.`);
  return result;
}

function requireContained(root, filename) {
  const relative = path.relative(root, filename);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${PLUGIN_NAME}: source escapes project/package; refusing shared dependency writes.`);
  }
}

function applyDismissalPatch(projectRoot) {
  const root = fs.realpathSync(projectRoot);
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const helper = helperSource();
  if (digest(helper) !== specification.helper.sha256) throw new Error(`${PLUGIN_NAME}: unreviewed dismissal helper.`);
  // Validate every file in BOTH SDKs before writing anything. A changed Files
  // SDK must not leave only Photos patched, or vice versa. Prebuild is repeatable.
  const plans = specification.packages.flatMap((sdk) => {
    const locked = lock.packages?.[`node_modules/${sdk.name}`];
    if (locked?.version !== sdk.version || locked?.integrity !== sdk.integrity) {
      throw new Error(`${PLUGIN_NAME}: review required for locked ${sdk.name}.`);
    }
    const packagePath = fs.realpathSync(require.resolve(`${sdk.name}/package.json`, { paths: [root] }));
    const sdkRoot = path.dirname(packagePath);
    requireContained(root, sdkRoot);
    const installed = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (installed.version !== sdk.version || installed.name !== sdk.name) {
      throw new Error(`${PLUGIN_NAME}: review required for installed ${sdk.name} version.`);
    }
    const files = sdk.files.map((definition) => {
      const filename = fs.realpathSync(path.join(sdkRoot, definition.path));
      requireContained(sdkRoot, filename);
      const source = fs.readFileSync(filename, "utf8");
      return { filename, source: transformSource(definition, source), sha256: definition.patchedSha256 };
    });
    const helperPath = path.join(sdkRoot, specification.helper.path);
    requireContained(sdkRoot, fs.realpathSync(path.dirname(helperPath)));
    if (fs.existsSync(helperPath)) {
      requireContained(sdkRoot, fs.realpathSync(helperPath));
      if (digest(fs.readFileSync(helperPath)) !== specification.helper.sha256) {
        throw new Error(`${PLUGIN_NAME}: unreviewed existing dismissal helper.`);
      }
    }
    return [...files, { filename: helperPath, source: helper, sha256: specification.helper.sha256 }];
  });
  for (const { filename, source } of plans) fs.writeFileSync(filename, source);
  return plans.map(({ filename, sha256 }) => ({ path: path.relative(root, filename), sha256 }));
}

function withIosPickerDismissal(config) {
  return withDangerousMod(config, ["ios", (nextConfig) => {
    applyDismissalPatch(nextConfig.modRequest.projectRoot);
    return nextConfig;
  }]);
}

module.exports = createRunOncePlugin(withIosPickerDismissal, PLUGIN_NAME, "1.0.0");
module.exports.__test = { specification, digest, helperSource, transformSource, applyDismissalPatch };
