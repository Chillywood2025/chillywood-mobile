import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const packages = lock.packages ?? {};
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clone = (value) => structuredClone(value);

class CompatibilityError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function gate(condition, code, message) {
  if (!condition) throw new CompatibilityError(code, message);
}

const expectedMinimatch = Object.freeze({
  "node_modules/@expo/fingerprint/node_modules/minimatch": "10.2.5",
  "node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch": "10.2.4",
  "node_modules/expo/node_modules/minimatch": "9.0.9",
  "node_modules/glob/node_modules/minimatch": "10.2.4",
  "node_modules/minimatch": "3.1.5",
});
const expectedBraceExpansion = Object.freeze({
  "node_modules/brace-expansion": "5.0.9",
  "node_modules/expo/node_modules/brace-expansion": "2.1.4",
  "node_modules/minimatch/node_modules/brace-expansion": "1.1.18",
});
const expectedOverrides = Object.freeze({
  minimatch3: ["minimatch@3.1.5", "brace-expansion", "1.1.18"],
  minimatch9: ["minimatch@9.0.9", "brace-expansion", "2.1.4"],
  minimatch10: [
    ["@expo/fingerprint@0.15.5", "minimatch@10.2.5", "brace-expansion", "5.0.9"],
    ["@typescript-eslint/typescript-estree@8.57.2", "minimatch@10.2.4", "brace-expansion", "5.0.9"],
    ["glob@13.0.6", "minimatch@10.2.4", "brace-expansion", "5.0.9"],
  ],
});
const expectedImageSize = Object.freeze({
  declaration: "file:vendor/image-size-safe/chillywood-image-size-safe-1.2.1-chillywood.1.tgz",
  name: "@chillywood/image-size-safe",
  version: "1.2.1-chillywood.1",
  resolved: "file:vendor/image-size-safe/chillywood-image-size-safe-1.2.1-chillywood.1.tgz",
  integrity: "sha512-cGvr+Whcqj51TOAJ1/WATSs9hwNrJtTgIGcqCJhEWueF/WdRwtRcMczBFjW00MI3J+gFLNFjZnyO6oeuco1S2w==",
});
const expectedNanoid = Object.freeze({
  version: "3.3.18",
  resolved: "https://registry.npmjs.org/nanoid/-/nanoid-3.3.18.tgz",
  integrity: "sha512-DTg4MJbGMWkfi6VZFdNt2/caMbQy4Ou+Op/hJQvGEWcnVfoA1QA+xzRKAzw9jD6+GVOOeYr/mIcuDSdug6F6+w==",
  parents: Object.freeze([
    "node_modules/@react-navigation/core",
    "node_modules/@react-navigation/native",
    "node_modules/@react-navigation/routers",
    "node_modules/expo-router",
    "node_modules/postcss",
  ]),
});
// Exact reviewed lock graph after the bounded browserslist advisory closure.
// Any later package identity drift still fails closed at this digest.
const expectedUnrelatedPackageGraphSha256 = "f435827fb0d29912cd3f85981cefbd283631a512ba63ec688d6fec87e99712df";
const compatibilityClosurePaths = new Set([
  "node_modules/concat-map",
  "node_modules/expo/node_modules/balanced-match",
  "node_modules/expo/node_modules/brace-expansion",
  "node_modules/minimatch/node_modules/balanced-match",
  "node_modules/minimatch/node_modules/brace-expansion",
  "node_modules/nanoid",
]);

function valueAt(object, keys) {
  return keys.reduce((value, key) => value?.[key], object);
}

function minimatchEntries(sourceLock = lock) {
  return Object.fromEntries(Object.entries(sourceLock.packages ?? {})
    .filter(([entryPath]) => entryPath === "node_modules/minimatch" || entryPath.endsWith("/node_modules/minimatch"))
    .map(([entryPath, metadata]) => [entryPath, metadata.version]));
}

function braceExpansionEntries(sourceLock = lock) {
  return Object.fromEntries(Object.entries(sourceLock.packages ?? {})
    .filter(([entryPath]) => entryPath === "node_modules/brace-expansion" || entryPath.endsWith("/node_modules/brace-expansion"))
    .map(([entryPath, metadata]) => [entryPath, metadata.version]));
}

function unrelatedPackageGraphSha256(sourceLock = lock) {
  const entries = Object.entries(sourceLock.packages ?? {})
    .filter(([entryPath]) => entryPath !== ""
      && !compatibilityClosurePaths.has(entryPath)
      && !entryPath.endsWith("/node_modules/brace-expansion"))
    .map(([entryPath, metadata]) => [entryPath, {
      version: metadata.version ?? null,
      resolved: metadata.resolved ?? null,
      integrity: metadata.integrity ?? null,
      link: metadata.link ?? null,
    }])
    .sort(([left], [right]) => left.localeCompare(right));
  return sha256(JSON.stringify(entries));
}

function validatePolicy(model) {
  gate(!Object.hasOwn(model.overrides, "brace-expansion"), "GLOBAL_BRACE_OVERRIDE_FORBIDDEN", "A global brace-expansion override collapses incompatible API lines");
  const min3 = valueAt(model.overrides, expectedOverrides.minimatch3.slice(0, -1));
  const min9 = valueAt(model.overrides, expectedOverrides.minimatch9.slice(0, -1));
  gate(typeof min3 === "string", "MINIMATCH_3_OVERRIDE_MISSING", "The minimatch 3 version-line mapping is missing");
  gate(typeof min9 === "string", "MINIMATCH_9_OVERRIDE_MISSING", "The minimatch 9 version-line mapping is missing");
  const min10 = expectedOverrides.minimatch10.map((keys) => valueAt(model.overrides, keys.slice(0, -1)));
  gate(min10.every((value) => typeof value === "string"), "MINIMATCH_10_OVERRIDE_MISSING", "A minimatch 10 declaring-parent mapping is missing");
  gate(min3.startsWith("1."), "MINIMATCH_3_BRACE_LINE_INVALID", "Minimatch 3 requires the brace-expansion 1.x callable API");
  gate(min9.startsWith("2."), "MINIMATCH_9_BRACE_LINE_INVALID", "Minimatch 9 requires the brace-expansion 2.x callable API");
  gate(min10.every((value) => value.startsWith("5.")), "MINIMATCH_10_BRACE_LINE_INVALID", "Minimatch 10 requires brace-expansion 5.x named exports");
  gate(min3 === "1.1.18", "BRACE_EXPANSION_1_VULNERABLE", "The reviewed secure 1.x brace-expansion release is required");
  gate(min9 === "2.1.4", "BRACE_EXPANSION_2_VULNERABLE", "The reviewed secure 2.x brace-expansion release is required");
  gate(min10.every((value) => value === "5.0.9"), "BRACE_EXPANSION_5_VULNERABLE", "The reviewed secure 5.x brace-expansion release is required");
  gate(model.postinstall === undefined && !model.patchScriptExists, "POSTINSTALL_MUTATION_FORBIDDEN", "Install-time dependency source mutation is forbidden");
  gate(model.sourceShapeClear, "INSTALLED_MINIMATCH_SOURCE_MUTATED", "Installed minimatch source differs from its upstream API shape");
  gate(model.npmProblems.length === 0, "NPM_LS_PROBLEMS_PRESENT", "npm ls reported dependency graph problems");
  gate(JSON.stringify(model.minimatch) === JSON.stringify(expectedMinimatch)
    && JSON.stringify(model.braceExpansion) === JSON.stringify(expectedBraceExpansion), "LOCK_OVERRIDE_GRAPH_MISMATCH", "The lock graph differs from the approved version-line mapping");
  gate(JSON.stringify(model.imageSize) === JSON.stringify(expectedImageSize), "IMAGE_SIZE_SAFE_IDENTITY_CHANGED", "The vendored image-size-safe identity changed");
  gate(model.overrides.nanoid === expectedNanoid.version
    && model.nanoid.version === expectedNanoid.version
    && model.nanoid.resolved === expectedNanoid.resolved
    && model.nanoid.integrity === expectedNanoid.integrity,
  "NANOID_VERSION_VULNERABLE", "Every production nanoid consumer must resolve the reviewed 3.3.18 zero-size fix");
  gate(JSON.stringify(model.nanoid.parents) === JSON.stringify(expectedNanoid.parents), "NANOID_PARENT_SET_CHANGED", "The reviewed nanoid production parent set changed");
  gate(model.unrelatedPackageGraphSha256 === expectedUnrelatedPackageGraphSha256, "UNRELATED_PACKAGE_VERSION_CHANGED", "An unrelated package identity changed");
  return true;
}

function installedSourceShapeClear() {
  const min3 = fs.readFileSync(path.join(root, "node_modules/minimatch/minimatch.js"), "utf8");
  const min9Cjs = fs.readFileSync(path.join(root, "node_modules/expo/node_modules/minimatch/dist/commonjs/index.js"), "utf8");
  const min9Esm = fs.readFileSync(path.join(root, "node_modules/expo/node_modules/minimatch/dist/esm/index.js"), "utf8");
  const all = [min3, min9Cjs, min9Esm].join("\n");
  return /var expand = require\('brace-expansion'\)/u.test(min3)
    && /__importDefault\(require\("brace-expansion"\)\)/u.test(min9Cjs)
    && /import expand from 'brace-expansion';/u.test(min9Esm)
    && !/Chi(?:'|’)llywood|braceExpansion = require\('brace-expansion'\)/iu.test(all);
}

function npmProblems() {
  try {
    const result = JSON.parse(execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ls", "--all", "--json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
    return result.problems ?? [];
  } catch (error) {
    try { return JSON.parse(error.stdout ?? "{}").problems ?? ["npm ls failed"]; } catch { return ["npm ls failed"]; }
  }
}

function actualModel() {
  const image = packages["node_modules/image-size"] ?? {};
  const nanoid = packages["node_modules/nanoid"] ?? {};
  return {
    overrides: clone(packageJson.overrides ?? {}),
    postinstall: packageJson.scripts?.postinstall,
    patchScriptExists: fs.existsSync(path.join(root, "scripts/patch-brace-expansion-consumers.mjs")),
    sourceShapeClear: installedSourceShapeClear(),
    npmProblems: npmProblems(),
    minimatch: minimatchEntries(),
    braceExpansion: braceExpansionEntries(),
    imageSize: {
      declaration: packageJson.dependencies?.["image-size"],
      name: image.name,
      version: image.version,
      resolved: image.resolved,
      integrity: image.integrity,
    },
    nanoid: {
      version: nanoid.version,
      resolved: nanoid.resolved,
      integrity: nanoid.integrity,
      parents: Object.entries(packages)
        .filter(([, metadata]) => typeof metadata?.dependencies?.nanoid === "string")
        .map(([entryPath]) => entryPath)
        .sort(),
    },
    unrelatedPackageGraphSha256: unrelatedPackageGraphSha256(),
  };
}

async function validateNanoidApis() {
  const nanoidRoot = path.join(root, "node_modules/nanoid");
  const metadata = JSON.parse(fs.readFileSync(path.join(nanoidRoot, "package.json"), "utf8"));
  assert.equal(metadata.version, expectedNanoid.version);
  for (const parentPath of expectedNanoid.parents) {
    const dependency = resolveInstalledPackage(parentPath, "nanoid");
    assert.equal(dependency.packagePath, "node_modules/nanoid", parentPath);
    assert.equal(dependency.metadata.version, expectedNanoid.version, parentPath);
  }
  const commonJs = createRequire(path.join(nanoidRoot, "package.json"))(nanoidRoot);
  assert.equal(commonJs.customAlphabet("abc", 0)(), "");
  const asyncModule = await import(pathToFileURL(path.join(nanoidRoot, "async/index.js")));
  assert.equal(await asyncModule.customAlphabet("abc", 0)(), "");
  const nativeAsyncSource = fs.readFileSync(path.join(nanoidRoot, "async/index.native.js"), "utf8");
  assert.match(nativeAsyncSource, /if \(size <= 0\) return Promise\.resolve\(''\)/u);
  return {
    version: metadata.version,
    parentCount: expectedNanoid.parents.length,
    commonJsZeroSize: "PASS",
    asyncZeroSize: "PASS",
    nativeZeroSizeGuard: "PASS",
  };
}

function resolveInstalledPackage(requesterPackagePath, dependency) {
  const requester = createRequire(path.join(root, requesterPackagePath, "package.json"));
  const resolvedPackageJson = requester.resolve(`${dependency}/package.json`);
  return {
    requester,
    packagePath: path.relative(root, resolvedPackageJson).replace(/\/package\.json$/u, ""),
    metadata: JSON.parse(fs.readFileSync(resolvedPackageJson, "utf8")),
  };
}

async function validateInstalledApis() {
  const observations = [];
  for (const [entryPath, expectedVersion] of Object.entries(expectedMinimatch)) {
    const packageRoot = path.join(root, entryPath);
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(metadata.version, expectedVersion, entryPath);
    const major = Number(expectedVersion.split(".")[0]);
    const dependency = resolveInstalledPackage(entryPath, "brace-expansion");
    const expectedBraceVersion = major === 3 ? "1.1.18" : major === 9 ? "2.1.4" : "5.0.9";
    assert.equal(dependency.metadata.version, expectedBraceVersion, entryPath);
    const braceCommonJs = dependency.requester("brace-expansion");
    if (major < 10) assert.equal(typeof braceCommonJs, "function", entryPath);
    else assert.equal(typeof braceCommonJs.expand, "function", entryPath);

    const commonJsEntry = major === 3 ? packageRoot : path.join(packageRoot, "dist/commonjs/index.js");
    const commonJsModule = createRequire(path.join(packageRoot, "package.json"))(commonJsEntry);
    const commonJsMinimatch = commonJsModule.minimatch ?? commonJsModule;
    assert.equal(commonJsMinimatch("a", "{a,b}"), true, entryPath);
    let esmResult = "NOT_EXPORTED";
    if (major >= 9) {
      const esmModule = await import(pathToFileURL(path.join(packageRoot, "dist/esm/index.js")));
      assert.equal(esmModule.minimatch("a", "{a,b}"), true, entryPath);
      esmResult = "PASS";
    }

    const child = spawnSync(process.execPath, ["-e", [
      "const entry=process.argv[1]",
      "const loaded=require(entry)",
      "const mm=loaded.minimatch||loaded",
      "try{mm('x','{1..100000000}')}catch{}",
    ].join(";"), commonJsEntry], { encoding: "utf8", timeout: 2_000 });
    assert.notEqual(child.error?.code, "ETIMEDOUT", entryPath);
    assert.equal(child.signal, null, entryPath);
    observations.push({
      packagePath: entryPath,
      minimatchVersion: expectedVersion,
      braceExpansionPath: dependency.packagePath,
      braceExpansionVersion: expectedBraceVersion,
      commonJs: "PASS",
      esm: esmResult,
      boundedMaliciousFixture: "PASS",
    });
  }
  return observations;
}

function relevantSourceHashes() {
  const files = Object.keys(expectedMinimatch).flatMap((entryPath) => {
    const version = expectedMinimatch[entryPath];
    return version.startsWith("3.")
      ? [path.join(entryPath, "minimatch.js")]
      : [path.join(entryPath, "dist/commonjs/index.js"), path.join(entryPath, "dist/esm/index.js")];
  });
  for (const entryPath of Object.keys(expectedBraceExpansion)) {
    const version = expectedBraceExpansion[entryPath];
    files.push(...(version.startsWith("5.")
      ? [path.join(entryPath, "dist/commonjs/index.js"), path.join(entryPath, "dist/esm/index.js")]
      : [path.join(entryPath, "index.js")]));
  }
  files.push("node_modules/nanoid/index.js", "node_modules/nanoid/async/index.js", "node_modules/nanoid/async/index.native.js");
  return Object.fromEntries(files.sort().map((relative) => [relative, sha256(fs.readFileSync(path.join(root, relative)))]));
}

function killNegativeControls(base) {
  const controls = [
    ["RESTORE_GLOBAL_5_OVERRIDE", "GLOBAL_BRACE_OVERRIDE_FORBIDDEN", (m) => { m.overrides["brace-expansion"] = "5.0.9"; }],
    ["MAP_MINIMATCH_3_TO_5", "MINIMATCH_3_BRACE_LINE_INVALID", (m) => { m.overrides["minimatch@3.1.5"]["brace-expansion"] = "5.0.9"; }],
    ["MAP_MINIMATCH_9_TO_5", "MINIMATCH_9_BRACE_LINE_INVALID", (m) => { m.overrides["minimatch@9.0.9"]["brace-expansion"] = "5.0.9"; }],
    ["MAP_MINIMATCH_10_TO_2", "MINIMATCH_10_BRACE_LINE_INVALID", (m) => { m.overrides["@expo/fingerprint@0.15.5"]["minimatch@10.2.5"]["brace-expansion"] = "2.1.4"; }],
    ["RESTORE_BRACE_1_1_17", "BRACE_EXPANSION_1_VULNERABLE", (m) => { m.overrides["minimatch@3.1.5"]["brace-expansion"] = "1.1.17"; }],
    ["RESTORE_BRACE_2_1_3", "BRACE_EXPANSION_2_VULNERABLE", (m) => { m.overrides["minimatch@9.0.9"]["brace-expansion"] = "2.1.3"; }],
    ["RESTORE_BRACE_5_0_8", "BRACE_EXPANSION_5_VULNERABLE", (m) => { m.overrides["@expo/fingerprint@0.15.5"]["minimatch@10.2.5"]["brace-expansion"] = "5.0.8"; }],
    ["REMOVE_MINIMATCH_3_MAPPING", "MINIMATCH_3_OVERRIDE_MISSING", (m) => { delete m.overrides["minimatch@3.1.5"]; }],
    ["REMOVE_MINIMATCH_9_MAPPING", "MINIMATCH_9_OVERRIDE_MISSING", (m) => { delete m.overrides["minimatch@9.0.9"]; }],
    ["REMOVE_MINIMATCH_10_MAPPING", "MINIMATCH_10_OVERRIDE_MISSING", (m) => { delete m.overrides["glob@13.0.6"]; }],
    ["REINTRODUCE_POSTINSTALL_PATCH", "POSTINSTALL_MUTATION_FORBIDDEN", (m) => { m.postinstall = "node ./scripts/patch-brace-expansion-consumers.mjs"; m.patchScriptExists = true; }],
    ["ALTER_INSTALLED_MINIMATCH_SOURCE", "INSTALLED_MINIMATCH_SOURCE_MUTATED", (m) => { m.sourceShapeClear = false; }],
    ["ACCEPT_NPM_LS_PROBLEM", "NPM_LS_PROBLEMS_PRESENT", (m) => { m.npmProblems = ["invalid dependency"]; }],
    ["DIVERGE_LOCK_FROM_OVERRIDE", "LOCK_OVERRIDE_GRAPH_MISMATCH", (m) => { m.braceExpansion["node_modules/minimatch/node_modules/brace-expansion"] = "5.0.9"; }],
    ["CHANGE_IMAGE_SIZE_SAFE", "IMAGE_SIZE_SAFE_IDENTITY_CHANGED", (m) => { m.imageSize.version = "1.2.1"; }],
    ["RESTORE_NANOID_3_3_17", "NANOID_VERSION_VULNERABLE", (m) => { m.overrides.nanoid = "3.3.17"; m.nanoid.version = "3.3.17"; }],
    ["CHANGE_NANOID_PARENT_SET", "NANOID_PARENT_SET_CHANGED", (m) => { m.nanoid.parents = m.nanoid.parents.slice(1); }],
    ["CHANGE_UNRELATED_PACKAGE", "UNRELATED_PACKAGE_VERSION_CHANGED", (m) => { m.unrelatedPackageGraphSha256 = "0".repeat(64); }],
  ];
  return controls.map(([id, expectedCode, mutate]) => {
    const mutant = clone(base);
    mutate(mutant);
    let observedCode = null;
    try { validatePolicy(mutant); } catch (error) { observedCode = error.code; }
    assert.equal(observedCode, expectedCode, id);
    return { id, expectedCode, result: "KILLED" };
  });
}

const model = actualModel();
validatePolicy(model);
const apiObservations = await validateInstalledApis();
const nanoidObservation = await validateNanoidApis();
const negativeControls = killNegativeControls(model);
const gitStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim();
gate(gitStatus === "", "TRACKED_REPOSITORY_CHANGED_AFTER_INSTALL", "A clean install changed tracked repository files");
const output = {
  classification: "EXACT_VERSION_LINE_COMPATIBLE_LOCK_GRAPH",
  installMode: process.env.BRACE_COMPAT_INSTALL_MODE ?? "UNSPECIFIED",
  node: process.version,
  npm: execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"], { encoding: "utf8" }).trim(),
  lockfileVersion: lock.lockfileVersion,
  packageLockSha256: sha256(fs.readFileSync(lockPath)),
  graphSha256: sha256(JSON.stringify({ minimatch: model.minimatch, braceExpansion: model.braceExpansion })),
  apiObservations,
  nanoidObservation,
  relevantSourceHashes: relevantSourceHashes(),
  npmLsProblems: model.npmProblems.length,
  negativeControls: { required: negativeControls.length, killed: negativeControls.length, results: negativeControls },
  postinstallMutation: false,
  trackedRepositoryChanges: 0,
  imageSizeSafePreserved: true,
  unrelatedPackageGraphSha256: model.unrelatedPackageGraphSha256,
};
output.resultSha256 = sha256(JSON.stringify(output));
process.stdout.write(`${JSON.stringify(output)}\n`);
