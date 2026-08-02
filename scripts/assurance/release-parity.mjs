#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const contractPath = "config/assurance/release-target-parity-v1.json";
const capabilityPath = "config/assurance/native-capability-registry-v1.json";
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (relative) => fs.readFileSync(path.join(root, relative));
const readJson = (relative) => JSON.parse(read(relative));
const clone = (value) => structuredClone(value);
const stable = (value) => JSON.stringify(value, (_, current) => current && typeof current === "object" && !Array.isArray(current)
  ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))) : current);

class GateError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const requireGate = (condition, code, message) => { if (!condition) throw new GateError(code, message); };
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  requireGate(result.status === 0, "GIT_READ_FAILED", `git ${args[0]} failed`);
  return result.stdout.trim();
};
const get = (value, dotted) => dotted.split(".").reduce((current, key) => current?.[key], value);
const merge = (base, next) => {
  if (!base || typeof base !== "object" || Array.isArray(base)) return clone(next);
  const output = clone(base);
  for (const [key, value] of Object.entries(next ?? {})) output[key] = value && typeof value === "object" && !Array.isArray(value)
    ? merge(output[key] ?? {}, value) : clone(value);
  return output;
};
const profile = (eas, name, seen = []) => {
  requireGate(!seen.includes(name), "PROFILE_EXTENDS_CYCLE", `EAS profile cycle at ${name}`);
  const value = eas.build?.[name];
  requireGate(value, "BUILD_PROFILE_UNKNOWN", `Unknown EAS profile ${name}`);
  return value.extends ? merge(profile(eas, value.extends, [...seen, name]), value) : clone(value);
};
const evidencePasses = (entry, base = root) => {
  const absolute = path.join(base, entry.path);
  if (!fs.existsSync(absolute)) return false;
  const content = fs.readFileSync(absolute, "utf8");
  return (entry.includes ?? []).every((marker) => content.includes(marker));
};

let dependencyCache;
const dependencyIntegrity = () => {
  if (dependencyCache) return dependencyCache;
  const packageSha256 = digest(read("package.json"));
  const lockSha256 = digest(read("package-lock.json"));
  const packageJson = readJson("package.json");
  const lock = readJson("package-lock.json");
  const direct = Object.keys({ ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) }).sort();
  const worktrees = git("worktree", "list", "--porcelain").split("\n")
    .filter((line) => line.startsWith("worktree ")).map((line) => line.slice(9)).sort();
  for (const candidate of worktrees) {
    const modules = path.join(candidate, "node_modules");
    if (!fs.existsSync(modules)) continue;
    const candidatePackage = path.join(candidate, "package.json");
    const candidateLock = path.join(candidate, "package-lock.json");
    if (!fs.existsSync(candidatePackage) || !fs.existsSync(candidateLock)) continue;
    if (digest(fs.readFileSync(candidatePackage)) !== packageSha256 || digest(fs.readFileSync(candidateLock)) !== lockSha256) continue;
    const mismatches = direct.filter((name) => {
      const expected = lock.packages?.[`node_modules/${name}`]?.version;
      const installedPath = path.join(modules, name, "package.json");
      if (!expected || !fs.existsSync(installedPath)) return true;
      return JSON.parse(fs.readFileSync(installedPath, "utf8")).version !== expected;
    });
    if (!mismatches.length) {
      const npmTree = spawnSync("npm", ["ls", "--all", "--json", "--offline"], { cwd: candidate, env: { ...process.env, npm_config_offline: "true" }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      let parsed;
      try { parsed = JSON.parse(npmTree.stdout); } catch { parsed = null; }
      if (npmTree.status !== 0 || !parsed || (parsed.problems?.length ?? 0) !== 0) continue;
      dependencyCache = { modules, evidence: { packageSha256, lockSha256, directPackages: direct.length, mismatches: [], fullTreeProblems: [], fullTreeValidated: true, status: "EXACT_LOCKED_DEPENDENCY_SET" } };
      return dependencyCache;
    }
  }
  throw new GateError("DEPENDENCY_SET_MISMATCH", "No installed worktree exactly matches package.json, package-lock.json, and every direct locked package");
};

const copyTrackedSource = (destination) => {
  for (const relative of git("ls-files", "-z").split("\0").filter(Boolean)) {
    const source = path.join(root, relative);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { dereference: false });
  }
};
const sanitizedIosPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CLIENT_ID</key><string>offline.invalid</string><key>REVERSED_CLIENT_ID</key><string>offline.invalid</string><key>API_KEY</key><string>offline-invalid</string><key>GCM_SENDER_ID</key><string>0</string><key>PLIST_VERSION</key><string>1</string><key>BUNDLE_ID</key><string>com.chillywood.mobile</string><key>PROJECT_ID</key><string>offline-invalid</string><key>GOOGLE_APP_ID</key><string>0:0:ios:offline</string></dict></plist>
`;
const generationEnv = (target, temp, resolvedProfile) => ({
  PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, CI: "1", EXPO_OFFLINE: "1", EXPO_NO_TELEMETRY: "1", npm_config_offline: "true", TMPDIR: temp,
  ...(resolvedProfile.env ?? {}),
  ...(target.platform === "ios" ? {
    IOS_GOOGLE_SERVICES_FILE: "./.assurance/GoogleService-Info.plist",
  } : {}),
});
const normalizeGenerated = (content, relative, temp, modules) => {
  let normalized = content.toString("binary").replaceAll(temp, "<DISPOSABLE>")
    .replaceAll(path.dirname(modules), "<DEPENDENCIES>").replaceAll("\r\n", "\n");
  if (relative.endsWith("project.pbxproj")) {
    const ids = new Map();
    normalized = normalized.replace(/\b[A-F0-9]{24}\b/gu, (id) => {
      if (!ids.has(id)) ids.set(id, `PBX${String(ids.size + 1).padStart(21, "0")}`);
      return ids.get(id);
    });
  }
  return normalized;
};
const writeAutolinkingEvidence = (target, temp, dependencies, env) => {
  const binary = path.join(dependencies.modules, ".bin/expo-modules-autolinking");
  const commands = [
    ["expo-modules-resolve.json", ["resolve", "--platform", target.platform === "ios" ? "apple" : "android", "--project-root", temp, "--json"]],
    ["react-native-config.json", ["react-native-config", "--platform", target.platform, "--project-root", temp, "--source-dir", path.join(temp, target.platform), "--json"]],
  ];
  const outputDir = path.join(temp, target.platform, ".assurance");
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [name, args] of commands) {
    const run = spawnSync(binary, args, { cwd: temp, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    requireGate(run.status === 0, "AUTOLINKING_EVIDENCE_FAILED", `${args[0]} ${target.platform} failed`);
    let parsed;
    try { parsed = JSON.parse(run.stdout); } catch { throw new GateError("AUTOLINKING_EVIDENCE_MALFORMED", `${args[0]} did not emit JSON`); }
    const canonical = stable(parsed).replaceAll(temp, "<DISPOSABLE>").replaceAll(path.dirname(dependencies.modules), "<DEPENDENCIES>");
    fs.writeFileSync(path.join(outputDir, name), `${canonical}\n`, { mode: 0o600 });
  }
};
const generateOnce = (target, contract, registry, dependencies) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-pr-d1-"));
  fs.chmodSync(temp, 0o700);
  try {
    copyTrackedSource(temp);
    fs.rmSync(path.join(temp, target.platform), { recursive: true, force: true });
    fs.symlinkSync(dependencies.modules, path.join(temp, "node_modules"), "dir");
    let privateConfig;
    if (target.platform === "android") {
      const source = ["google-services.json", "android/app/google-services.json"].map((item) => path.join(root, item)).find(fs.existsSync);
      requireGate(source, "PRIVATE_NATIVE_CONFIG_MISSING", "Android generated source requires an owner-local Google services input");
      fs.copyFileSync(source, path.join(temp, "google-services.json"));
      privateConfig = { state: "PRESENT", sha256: digest(fs.readFileSync(source)), contentRecorded: false };
    } else {
      fs.mkdirSync(path.join(temp, ".assurance"), { recursive: true });
      fs.writeFileSync(path.join(temp, ".assurance/GoogleService-Info.plist"), sanitizedIosPlist, { mode: 0o600 });
      privateConfig = { state: "MISSING_SANITIZED_FIXTURE_USED", sha256: digest(sanitizedIosPlist), contentRecorded: false };
    }
    const expoCli = path.join(dependencies.modules, "expo/bin/cli");
    const template = path.join(dependencies.modules, "expo/template.tgz");
    const resolvedProfile = profile(readJson("eas.json"), target.buildProfile);
    const env = generationEnv(target, temp, resolvedProfile);
    const run = spawnSync(process.execPath, [expoCli, "prebuild", "--no-install", "--platform", target.platform, "--template", template], {
      cwd: temp, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    });
    const detail = `${run.stderr ?? ""}\n${run.stdout ?? ""}`.replaceAll(temp, "<DISPOSABLE>").split("\n").filter(Boolean).slice(-1)[0] ?? "unknown";
    requireGate(run.status === 0, "GENERATED_NATIVE_SOURCE_FAILED", `Offline Expo prebuild failed: ${detail.slice(0, 240)}`);
    writeAutolinkingEvidence(target, temp, dependencies, env);
    const generatedEntries = registry.capabilities.filter((capability) => capability.platform === target.platform).flatMap((capability) => capability.generatedBy);
    const files = [...new Set([...contract.generatedSource[`${target.platform}Files`], ...generatedEntries.map((entry) => entry.path)])].sort();
    const chunks = [];
    const contents = {};
    for (const relative of files) {
      const absolute = path.join(temp, relative);
      requireGate(fs.existsSync(absolute), "GENERATED_NATIVE_SOURCE_MISSING", `Generated file missing: ${relative}`);
      const normalized = normalizeGenerated(fs.readFileSync(absolute), relative, temp, dependencies.modules);
      contents[relative] = normalized;
      chunks.push(`${relative}\0${digest(normalized)}\n`);
    }
    return { digest: digest(chunks.join("")), files, privateConfig, contents };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
};
const generateThree = (target, contract, registry, dependencies) => {
  const runs = [];
  try {
    for (let index = 0; index < 3; index += 1) runs.push(generateOnce(target, contract, registry, dependencies));
    const unstable = runs[0].files.filter((relative) => new Set(runs.map((run) => digest(run.contents[relative]))).size !== 1);
    requireGate(!unstable.length, "GENERATED_NATIVE_NONDETERMINISTIC", `${target.targetId} differs across three runs: ${unstable.join(",")}`);
    return {
      public: { digest: runs[0].digest, classification: target.generatedSourceClassification, method: contract.generatedSource.method, proofTier: "T1_SOURCE", runs: "3/3", fileCount: runs[0].files.length, compiledNativeProof: false, signedArtifactProof: false, privateConfig: runs[0].privateConfig },
      snapshots: runs.map((run) => run.contents),
    };
  } catch (error) { throw error; }
};

const fixtureDefinitions = {
  "wrong-environment": ["ENVIRONMENT_MISMATCH", (state) => { state.contract.targets[0].environment = "preview"; }],
  "runtime-channel-cross-bound": ["RUNTIME_CHANNEL_MISMATCH", (state) => { state.contract.targets[0].channel = "ios-qa"; }],
  "platform-profile-cross-bound": ["PLATFORM_PROFILE_MISMATCH", (state) => { state.contract.targets[0].buildProfile = "ios-qa"; }],
  "required-capability-omitted": ["REQUIRED_NATIVE_CAPABILITY_MISSING", (state) => { state.registry.capabilities.find((item) => item.capabilityId === "android.native-call-actions").generatedBy[0].includes.push("ABSENT_NEGATIVE_CONTROL"); }],
  "generated-native-digest-stale": ["GENERATED_NATIVE_DIGEST_STALE", (state) => { state.contract.targets[0].recordedGeneratedNativeDigest = "0".repeat(64); }],
  "signed-identity-falsely-proved": ["SIGNED_ARTIFACT_PROOF_MISSING", (state) => { state.claims.signedArtifactClear = true; }],
  "incompatible-rollback-accepted": ["ROLLBACK_INCOMPATIBLE", (state) => { state.claims.acceptRollback = true; }],
  "proof-substitution": ["PROOF_SUBSTITUTION_REJECTED", (state) => { state.claims.providerOrInstalledClear = true; }],
  "source-tree-mismatch": ["SOURCE_TREE_MISMATCH", (state) => { state.claims.tree = "0".repeat(40); }],
  "package-bundle-mismatch": ["PACKAGE_BUNDLE_MISMATCH", (state) => { state.contract.targets[0].packageIdentifier = "invalid.example"; }],
  "duplicate-target": ["DUPLICATE_TARGET", (state) => { state.contract.targets.push(clone(state.contract.targets[0])); }],
  "unknown-capability": ["UNKNOWN_CAPABILITY", (state) => { state.contract.targets[0].requiredCapabilities.push("android.unknown"); }],
  "cross-platform-evidence": ["CROSS_PLATFORM_EVIDENCE_REJECTED", (state) => { state.registry.capabilities.find((item) => item.capabilityId === "ios.callkit").generatedBy[0].path = "android/app/build.gradle"; }],
  "unsafe-normalization": ["UNSAFE_NORMALIZATION", (state) => { state.contract.generatedSource.normalizationAllowlist.push("arbitrary content"); }],
  "unqualified-target-classification": ["TARGET_CLASSIFICATION_INVALID", (state) => { state.contract.targets[0].classification = "READY"; }],
  "unknown-fail-closed-target-classification": ["TARGET_CLASSIFICATION_UNKNOWN_FAIL_CLOSED", (state) => { state.contract.targets[0].classification = "UNKNOWN_FAIL_CLOSED"; }],
  "current-release-identity-unproved": ["CURRENT_RELEASE_IDENTITY_UNPROVED", (state) => { state.contract.targets[0].releaseIdentityClassification = "CURRENTLY_REPROVED"; }],
  "profile-runtime-env-cross-bound": ["PROFILE_RUNTIME_ENV_MISMATCH", (state) => { state.contract.targets[0].runtimeBinding.value = "wrong-runtime"; }],
  "profile-distribution-cross-bound": ["PROFILE_DISTRIBUTION_MISMATCH", (state) => { state.contract.targets[0].profileDistribution = "internal"; }],
  "direct-import-capability-omitted": ["REQUIRED_CAPABILITY_COVERAGE_MISMATCH", (state) => { state.contract.targets[0].requiredCapabilities = state.contract.targets[0].requiredCapabilities.filter((id) => id !== "android.document-file-system"); }],
  "direct-import-mapping-omitted": ["DIRECT_NATIVE_IMPORT_UNCLASSIFIED", (state) => { delete state.registry.importCoverage.mappings["expo-document-picker"]; }],
  "direct-import-wrong-platform": ["DIRECT_NATIVE_IMPORT_PLATFORM_MISMATCH", (state) => { state.registry.importCoverage.mappings["expo-document-picker"].android = "ios.document-file-system"; }],
  "historical-source-substitution": ["HISTORICAL_SOURCE_SUBSTITUTION_REJECTED", (state) => { state.contract.targets[2].generatedSourceClassification = "HISTORICAL_ARTIFACT_DIGEST"; }],
};

const directImportClosure = (state, capabilityById) => {
  const direct = new Set(Object.keys(readJson("package.json").dependencies ?? {}));
  const roots = state.registry.importCoverage.scanRoots;
  const files = git("ls-files", "-z").split("\0").filter((relative) => roots.some((prefix) => relative.startsWith(prefix)) && /\.[cm]?[jt]sx?$/u.test(relative));
  const imported = new Set();
  const importPattern = /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/gu;
  for (const relative of files) {
    const source = read(relative).toString("utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
      if (direct.has(packageName)) imported.add(packageName);
    }
  }
  const mapped = [...imported].filter((name) => state.registry.importCoverage.mappings[name]).sort();
  const reviewedJsOnly = [...imported].filter((name) => state.registry.importCoverage.excludedPackages[name]).sort();
  const unclassified = [...imported].filter((name) => !state.registry.importCoverage.mappings[name] && !state.registry.importCoverage.excludedPackages[name]).sort();
  requireGate(!unclassified.length, "DIRECT_NATIVE_IMPORT_UNCLASSIFIED", `Direct imports lack classification: ${unclassified.join(",")}`);
  for (const [packageName, platforms] of Object.entries(state.registry.importCoverage.mappings)) for (const [platform, capabilityId] of Object.entries(platforms)) {
    const capability = capabilityById.get(capabilityId);
    requireGate(capability && capability.platform === platform, "DIRECT_NATIVE_IMPORT_PLATFORM_MISMATCH", `${packageName} maps ${platform} to ${capabilityId}`);
  }
  return { discovered: [...imported].sort(), mapped, reviewedJsOnly, unclassified };
};

const validateCatalog = (state) => {
  const exactNormalization = ["absolute disposable/dependency roots", "line endings", "file order", "opaque Xcode object IDs via relationship-preserving first-occurrence mapping"];
  requireGate(stable(state.contract.generatedSource.normalizationAllowlist) === stable(exactNormalization), "UNSAFE_NORMALIZATION", "Generated-source normalization must match the reviewed allowlist");
  const ids = state.contract.targets.map((target) => target.targetId);
  requireGate(new Set(ids).size === ids.length, "DUPLICATE_TARGET", "Release target IDs must be unique");
  const capabilityIds = new Set(state.registry.capabilities.map((item) => item.capabilityId));
  for (const target of state.contract.targets) {
    requireGate(state.contract.targetClassifications.includes(target.classification), "TARGET_CLASSIFICATION_INVALID", `${target.targetId} classification is unqualified`);
    requireGate(target.classification !== "UNKNOWN_FAIL_CLOSED", "TARGET_CLASSIFICATION_UNKNOWN_FAIL_CLOSED", `${target.targetId} remains unknown`);
    requireGate(state.contract.releaseIdentityClassifications.includes(target.releaseIdentityClassification), "RELEASE_IDENTITY_CLASSIFICATION_INVALID", `${target.targetId} release identity classification is invalid`);
    requireGate(target.releaseIdentityClassification !== "CURRENTLY_REPROVED" || state.claims.independentCurrentArtifactProof, "CURRENT_RELEASE_IDENTITY_UNPROVED", `${target.targetId} lacks independent current artifact proof`);
    if (target.classification === "HISTORICAL_ARTIFACT") {
      requireGate(target.generatedSourceClassification === "CURRENT_SOURCE_PROFILE_REPLAY_T1_ONLY_NOT_HISTORICAL_BUILD_84_PROOF" && target.historicalArtifactEquivalentToCurrentReplay === false, "HISTORICAL_SOURCE_SUBSTITUTION_REJECTED", `${target.targetId} current replay cannot become historical artifact proof`);
    } else requireGate(target.generatedSourceClassification === "CURRENT_SOURCE_PROFILE_REPLAY", "GENERATED_SOURCE_CLASSIFICATION_INVALID", `${target.targetId} source replay classification is invalid`);
    for (const id of target.requiredCapabilities) requireGate(capabilityIds.has(id), "UNKNOWN_CAPABILITY", `Unknown capability ${id}`);
  }
  for (const capability of state.registry.capabilities) for (const generated of capability.generatedBy) {
    requireGate(generated.path.startsWith(`${capability.platform}/`), "CROSS_PLATFORM_EVIDENCE_REJECTED", `${capability.capabilityId} uses ${generated.path}`);
  }
  const registered = state.contract.targets.map((target) => target.releaseManifest).sort();
  const manifests = fs.readdirSync(path.join(root, "config/release")).filter((name) => name.endsWith(".json")).map((name) => `config/release/${name}`).sort();
  requireGate(stable(registered) === stable(manifests), "UNCLASSIFIED_RELEASE_MANIFEST", "Every release manifest must have exactly one target classification");
};

const validateTargetSource = (target, state) => {
  const manifest = readJson(target.releaseManifest);
  const eas = readJson("eas.json");
  const app = readJson("app.json").expo;
  const resolved = profile(eas, target.buildProfile);
  requireGate(state.contract.profilePlatforms[target.buildProfile] === target.platform, "PLATFORM_PROFILE_MISMATCH", `${target.targetId} profile platform differs`);
  requireGate(resolved.environment === target.environment, "ENVIRONMENT_MISMATCH", `${target.targetId} environment differs`);
  requireGate(resolved.distribution === target.profileDistribution, "PROFILE_DISTRIBUTION_MISMATCH", `${target.targetId} profile distribution differs`);
  if (target.runtimeBinding.source === "EAS_PROFILE_ENV") {
    requireGate(target.runtimeBinding.key && resolved.env?.[target.runtimeBinding.key] === target.runtimeBinding.value && target.runtimeBinding.value === target.runtimeVersion, "PROFILE_RUNTIME_ENV_MISMATCH", `${target.targetId} EAS runtime environment binding differs`);
  } else requireGate(target.runtimeBinding.source === "RELEASE_MANIFEST" && target.runtimeBinding.key === null && target.runtimeBinding.value === manifest.runtimeVersion, "PROFILE_RUNTIME_ENV_MISMATCH", `${target.targetId} manifest runtime binding differs`);
  requireGate(manifest.runtimeVersion === target.runtimeVersion && manifest.channel === target.channel && resolved.channel === target.channel, "RUNTIME_CHANNEL_MISMATCH", `${target.targetId} runtime/channel differs`);
  const manifestPackage = manifest.packageIdentifier ?? manifest.bundleIdentifier;
  const appPackage = target.platform === "android" ? app.android.package : app.ios.bundleIdentifier;
  requireGate(manifestPackage === target.packageIdentifier && appPackage === target.packageIdentifier, "PACKAGE_BUNDLE_MISMATCH", `${target.targetId} package/bundle differs`);
  requireGate(manifest.platform === target.platform, "PLATFORM_MISMATCH", `${target.targetId} manifest platform differs`);
  requireGate(manifest.appVersion === target.appVersion && app.version === target.appVersion, "APP_VERSION_MISMATCH", `${target.targetId} app version differs`);
  requireGate(String(manifest.expectedNativeBuild ?? manifest.nativeBuild) === target.nativeBuild, "NATIVE_BUILD_MISMATCH", `${target.targetId} native build differs`);
  requireGate(manifest.distributionSource === target.distribution, "DISTRIBUTION_MISMATCH", `${target.targetId} distribution differs`);
  requireGate(manifest.buildProfile === undefined || manifest.buildProfile === target.buildProfile, "BUILD_PROFILE_MISMATCH", `${target.targetId} manifest profile differs`);
  if (target.classification === "HISTORICAL_ARTIFACT") requireGate(target.historicalArtifactSource === manifest.expectedBinarySourceCommit, "HISTORICAL_SOURCE_IDENTITY_MISMATCH", `${target.targetId} historical artifact source differs`);
  return manifest;
};

const evaluateCore = (state, selectedIds, generationCache = new Map()) => {
  validateCatalog(state);
  const head = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}");
  requireGate(!state.claims.tree || state.claims.tree === tree, "SOURCE_TREE_MISMATCH", "Expected source tree differs from current tree");
  const dependencies = dependencyIntegrity();
  const capabilityById = new Map(state.registry.capabilities.map((item) => [item.capabilityId, item]));
  const importClosure = directImportClosure(state, capabilityById);
  const targetResults = [];
  {
    for (const target of state.contract.targets.filter((item) => selectedIds.includes(item.targetId))) {
      const manifest = validateTargetSource(target, state);
      const historicalReplay = target.generatedSourceClassification === "CURRENT_SOURCE_PROFILE_REPLAY_T1_ONLY_NOT_HISTORICAL_BUILD_84_PROOF";
      const applies = (capability) => capability.platform === target.platform && (historicalReplay || capability.targetApplicability.includes(target.targetId));
      const expectedRequired = state.registry.capabilities.filter(applies).map((item) => item.capabilityId).sort();
      requireGate(stable([...target.requiredCapabilities].sort()) === stable(expectedRequired), "REQUIRED_CAPABILITY_COVERAGE_MISMATCH", `${target.targetId} required capabilities do not exactly cover current source`);
      const importRequired = [...new Set(importClosure.mapped.map((packageName) => state.registry.importCoverage.mappings[packageName][target.platform]).filter(Boolean))].sort();
      requireGate(importRequired.every((id) => target.requiredCapabilities.includes(id)), "REQUIRED_CAPABILITY_COVERAGE_MISMATCH", `${target.targetId} omits an imported native capability`);
      for (const id of target.requiredCapabilities) {
        const capability = capabilityById.get(id);
        requireGate(applies(capability), "CAPABILITY_TARGET_MISMATCH", `${id} does not apply to ${target.targetId}`);
        requireGate(capability.requiredBy.every((entry) => evidencePasses(entry)), "REQUIRED_CAPABILITY_EVIDENCE_MISSING", `${id} required-by evidence is incomplete`);
        requireGate(capability.providedBy.every((entry) => evidencePasses(entry)), "REQUIRED_NATIVE_CAPABILITY_MISSING", `${id} provided-by source evidence is incomplete`);
      }
      let generated = generationCache.get(target.targetId);
      if (!generated) {
        generated = generateThree(target, state.contract, state.registry, dependencies);
        generationCache.set(target.targetId, generated);
      }
      const provided = state.registry.capabilities.filter((capability) => applies(capability)
        && capability.providedBy.every((entry) => evidencePasses(entry))
        && capability.generatedBy.every((entry) => generated.snapshots.every((snapshot) => {
          const content = snapshot[entry.path];
          return content !== undefined && (entry.includes ?? []).every((marker) => content.includes(marker));
        }))).map((item) => item.capabilityId).sort();
      const missing = target.requiredCapabilities.filter((id) => !provided.includes(id));
      requireGate(!missing.length, "REQUIRED_NATIVE_CAPABILITY_MISSING", `${target.targetId} misses ${missing.join(",")}`);
      requireGate(!target.recordedGeneratedNativeDigest || target.recordedGeneratedNativeDigest === generated.public.digest, "GENERATED_NATIVE_DIGEST_STALE", `${target.targetId} generated digest is stale`);
      const identityValues = target.releaseIdentityFields.map((field) => get(manifest, field));
      requireGate(identityValues.every((value) => value !== undefined && value !== null && value !== ""), "RELEASE_IDENTITY_MISSING", `${target.targetId} historical identity is incomplete`);
      const rollbackMissing = target.requiredCapabilities.filter((id) => !(target.rollback.providedCapabilities ?? []).includes(id));
      const rollbackCompatible = target.rollback.identityStatus !== "MISSING" && target.rollback.identityStatus !== "MISSING_HISTORICAL_ARTIFACT_IDENTITY" && rollbackMissing.length === 0;
      requireGate(!(state.claims.acceptRollback && !rollbackCompatible), "ROLLBACK_INCOMPATIBLE", `${target.targetId} rollback cannot be accepted`);
      requireGate(!state.claims.signedArtifactClear, "SIGNED_ARTIFACT_PROOF_MISSING", "Historical signed identity is not current signed-artifact proof");
      requireGate(!state.claims.providerOrInstalledClear, "PROOF_SUBSTITUTION_REJECTED", "Source evidence cannot substitute for provider or installed proof");
      targetResults.push({
        targetId: target.targetId, classification: target.classification, platform: target.platform, buildProfile: target.buildProfile, environment: target.environment,
        packageIdentifier: target.packageIdentifier, appVersion: target.appVersion, nativeBuild: target.nativeBuild, runtimeVersion: target.runtimeVersion,
        channel: target.channel, distribution: target.distribution, profileDistribution: target.profileDistribution, runtimeBinding: target.runtimeBinding, generatedNative: generated.public,
        requiredCapabilities: [...target.requiredCapabilities].sort(), providedCapabilities: provided, missingCapabilities: missing,
        directImportClosure: { discovered: importClosure.discovered.length, nativeMapped: importClosure.mapped.length, reviewedJsOnly: importClosure.reviewedJsOnly.length, unclassified: 0, requiredCapabilities: importRequired },
        releaseIdentity: { classification: target.releaseIdentityClassification, recordedFields: target.releaseIdentityFields, identityDigest: digest(stable(identityValues)), currentlyReproved: false },
        ...(historicalReplay ? { historicalArtifactSource: target.historicalArtifactSource, historicalArtifactEquivalentToCurrentReplay: false } : {}),
        rollback: { classification: rollbackCompatible ? "ROLLBACK_COMPATIBLE_SOURCE_MODEL" : "ROLLBACK_INCOMPATIBLE", identityStatus: target.rollback.identityStatus, missingCapabilities: rollbackMissing, accepted: false },
        proofTiers: { T0_REQUIREMENT: "REQUIREMENTS_CLEAR", T1_SOURCE: "SOURCE_CLEAR", T2_MODEL: "MODEL_CLEAR", T3_INTEGRATION: "BLOCKED_INTERNAL", T4_NATIVE_PROVIDER: "BLOCKED_EXTERNAL", T5_SIGNED_ARTIFACT: "HISTORICAL_INPUT_NOT_REPROVED", T6_INSTALLED_PHYSICAL: "HISTORICAL_INPUT_NOT_REPROVED", T7_PUBLIC_CANARY: "BLOCKED_EXTERNAL" },
        mayProceed: { nativeCompilation: false, signedArtifactInspection: false, updatePublication: false, release: false },
      });
    }
    const sourcePaths = [...new Set([contractPath, capabilityPath, ...state.contract.authoritativeInputs,
      ...state.registry.capabilities.flatMap((item) => [...item.requiredBy, ...item.providedBy].map((entry) => entry.path))])].sort();
    const inputSetDigest = digest(sourcePaths.map((relative) => `${relative}\0${digest(read(relative))}\n`).join(""));
    return { head, tree, dependencies: dependencies.evidence, importClosure, inputSetDigest, targets: targetResults, generationCache };
  }
};

export const fixtureIds = Object.freeze(Object.keys(fixtureDefinitions));
const acceptedGenerationCache = new Map();
export const evaluateParity = ({ targetIds, fixture, includeNegativeControls = true } = {}) => {
  const state = { contract: readJson(contractPath), registry: readJson(capabilityPath), claims: {} };
  if (fixture) {
    requireGate(fixtureDefinitions[fixture], "UNKNOWN_FIXTURE", `Unknown fixture ${fixture}`);
    fixtureDefinitions[fixture][1](state);
  }
  const ids = targetIds ?? state.contract.targets.map((target) => target.targetId);
  for (const id of ids) requireGate(state.contract.targets.some((target) => target.targetId === id), "UNKNOWN_TARGET", `Unknown target ${id}`);
  const result = evaluateCore(state, ids, acceptedGenerationCache);
  const negativeControls = [];
  if (!fixture && includeNegativeControls) for (const [fixtureId, [expected, mutate]] of Object.entries(fixtureDefinitions)) {
    const fixtureState = { contract: clone(state.contract), registry: clone(state.registry), claims: {} };
    mutate(fixtureState);
    let observed = "NO_FAILURE";
    try { evaluateCore(fixtureState, [fixtureState.contract.targets[0].targetId], result.generationCache); } catch (error) { observed = error.code ?? "UNCLASSIFIED"; }
    requireGate(observed === expected, "NEGATIVE_CONTROL_FAILED", `${fixtureId}: expected ${expected}, observed ${observed}`);
    negativeControls.push({ fixtureId, expected, observed, result: "FAIL_CLOSED" });
  }
  const evidence = {
    schemaVersion: 1, contractId: "release-parity-evidence-v1", mode: "OFFLINE_READ_ONLY", implementationHead: result.head, implementationTree: result.tree,
    selectedTargets: ids, skippedTargets: state.contract.targets.map((target) => target.targetId).filter((id) => !ids.includes(id)),
    inputSetDigest: result.inputSetDigest, dependencyIntegrity: result.dependencies,
    directImportClosure: { discovered: result.importClosure.discovered.length, nativeMapped: result.importClosure.mapped.length, reviewedJsOnly: result.importClosure.reviewedJsOnly.length, unclassified: result.importClosure.unclassified.length }, targets: result.targets,
    negativeControls: { required: 8, total: negativeControls.length, passed: negativeControls.length, results: negativeControls },
    proofBoundary: state.contract.proofBoundary, networkAccess: false, providerContact: false, buildPerformed: false, otaPublished: false,
  };
  evidence.deterministicOutputSha256 = digest(stable(evidence));
  return evidence;
};

const parseArgs = (argv) => {
  const options = { targets: [] };
  for (const arg of argv) {
    if (arg === "--all") options.all = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--replace") options.replace = true;
    else if (arg.startsWith("--target=")) options.targets.push(arg.slice(9));
    else if (arg.startsWith("--fixture=")) options.fixture = arg.slice(10);
    else if (arg.startsWith("--write-evidence=")) options.output = arg.slice(17);
    else throw new GateError("UNKNOWN_FLAG", `Unknown flag ${arg}`);
  }
  requireGate(!(options.all && options.targets.length), "ARGUMENT_CONFLICT", "Use --all or --target, not both");
  requireGate(!(options.fixture && (options.all || options.targets.length)), "ARGUMENT_CONFLICT", "Fixtures select their own target");
  requireGate(!options.replace || options.output, "ARGUMENT_CONFLICT", "--replace requires --write-evidence");
  return options;
};
const main = () => {
  let jsonRequested = process.argv.includes("--json");
  try {
    const options = parseArgs(process.argv.slice(2));
    jsonRequested = options.json;
    const output = options.output ? path.resolve(root, options.output) : null;
    requireGate(!output || options.replace || !fs.existsSync(output), "EVIDENCE_OUTPUT_EXISTS", `Refusing to overwrite ${options.output}`);
    const evidence = evaluateParity({ targetIds: options.all || !options.targets.length ? undefined : options.targets, fixture: options.fixture, includeNegativeControls: !options.fixture });
    if (output) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: options.replace ? "w" : "wx", mode: 0o600 });
    }
    if (options.fixture) throw new GateError("NEGATIVE_FIXTURE_DID_NOT_FAIL", `${options.fixture} was accepted`);
    if (options.json) process.stdout.write(`${JSON.stringify({ ok: true, evidence })}\n`);
    else console.log(`release parity: PASS — ${evidence.targets.length} target(s), generated source 3/3, negative controls ${evidence.negativeControls.passed}/${evidence.negativeControls.total}; T0-T2 clear, T3-T7 blocked`);
  } catch (error) {
    const finding = { code: error.code ?? "UNCLASSIFIED_FAILURE", message: error.message };
    if (jsonRequested) process.stdout.write(`${JSON.stringify({ ok: false, findings: [finding] })}\n`);
    else console.error(`release parity: FAIL — ${finding.code}: ${finding.message}`);
    process.exitCode = 1;
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
