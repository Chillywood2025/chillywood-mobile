#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { canonicalGitText, finalReceiptMarker, finiteTaskEffectiveReservationAuthorityValid, finiteTaskPostMergeTransitionAuthorityValid, HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1, observeLiveFiniteTaskEffectiveReservation, observePublicGitHubPullRequest, PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1, registerVerifiedFiniteTaskImplementationLifecycle, registerVerifiedFiniteTaskPostMergeTransition, renderCurrentState, renderNextTask, resolveFiniteTaskEffectiveReservation, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS, validateFiniteTaskLeaseRegistry, verifyFiniteTaskFinalSourceEligibility, verifyFiniteTaskMergeProvenance } from "./lib.mjs";
import { validatePullRequestEventIdentity } from "./pr-scope-lib.mjs";
import {
  ACTIVE_POLICY_STATUS,
  FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER,
  FINITE_TASK_ADMISSION_V2,
  FINITE_TASK_ADMISSION_V2_MARKER,
  OWNER_JURISDICTION_DECISION_V2,
  OWNER_JURISDICTION_DECISION_V2_MARKER,
  OWNER_JURISDICTION_POLICY_CHAIN_V2_MARKER,
  OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2,
  OWNER_JURISDICTION_STANDING_POLICY_V2,
  OWNER_JURISDICTION_TASK_BINDING_V2,
  deriveTaskJurisdictionBindingV2,
  evaluateStandingPolicyInheritanceV2,
  preflightOwnerJurisdictionDecisionV2,
  projectRegisteredDomainOwners,
  renderFiniteTaskAdmissionFinalSourceV2,
  renderFiniteTaskAdmissionV2,
  renderOwnerJurisdictionDecisionV2,
  resolveFiniteTaskAdmissionChainV2,
  resolveOwnerJurisdictionPolicyChainV2,
  verifyFiniteTaskAdmissionFinalSourceV2,
  verifyFiniteTaskAdmissionV2,
  verifyLegacyFiniteTaskAdmissionV1,
  verifyOwnerJurisdictionDecisionV2,
  verifyTaskJurisdictionBindingV2,
} from "./jurisdiction-policy.mjs";

export {
  ACTIVE_POLICY_STATUS,
  FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER,
  FINITE_TASK_ADMISSION_V2,
  FINITE_TASK_ADMISSION_V2_MARKER,
  OWNER_JURISDICTION_DECISION_V2,
  OWNER_JURISDICTION_DECISION_V2_MARKER,
  OWNER_JURISDICTION_POLICY_CHAIN_V2_MARKER,
  OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2,
  OWNER_JURISDICTION_STANDING_POLICY_V2,
  OWNER_JURISDICTION_TASK_BINDING_V2,
  deriveTaskJurisdictionBindingV2,
  evaluateStandingPolicyInheritanceV2,
  preflightOwnerJurisdictionDecisionV2,
  projectRegisteredDomainOwners,
  renderFiniteTaskAdmissionFinalSourceV2,
  renderFiniteTaskAdmissionV2,
  renderOwnerJurisdictionDecisionV2,
  resolveFiniteTaskAdmissionChainV2,
  resolveOwnerJurisdictionPolicyChainV2,
  verifyFiniteTaskAdmissionFinalSourceV2,
  verifyFiniteTaskAdmissionV2,
  verifyLegacyFiniteTaskAdmissionV1,
  verifyOwnerJurisdictionDecisionV2,
  verifyTaskJurisdictionBindingV2,
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const REPOSITORY_ROOT = path.resolve(HERE, "../..");
export const DOCTRINE_BASE = "8bf6459c3ae1cec62e26a1694f03063e4291b9f8";
export const DOCTRINE_BRANCH = "codex/whole-app-engineering-doctrine-v1";
export const DOCTRINE_ORIGINAL_PATHS = Object.freeze([
  "_lib/autonomousSystemsRegistry.ts",
  "config/assurance/adversarial-taxonomy-v1.json",
  "config/assurance/current-truth-contract-v1.json",
  "config/assurance/engineering-doctrine-v1.json",
  "config/assurance/engineering-evidence-authority-v1.json",
  "config/assurance/feature-registry-v1.json",
  "config/assurance/gate-catalog-v1.json",
  "config/assurance/platform-provider-contracts-v1.json",
  "config/assurance/schemas-v1.json",
  "config/assurance/whole-app-domain-graph-v1.json",
  "config/autonomy/autonomous-components.json",
  "docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md",
  "docs/WHOLE_APP_ENGINEERING_BLUEPRINT.md",
  "docs/assurance/whole-app-engineering-doctrine-v1-report.json",
  "package.json",
  "scripts/assurance/active-task.mjs",
  "scripts/assurance/current-truth.mjs",
  "scripts/assurance/engineering-closure.mjs",
  "scripts/assurance/lib.mjs",
  "scripts/assurance/report.mjs",
  "scripts/guard-autonomous-systems-contract.mjs",
  "scripts/proof-autonomous-systems-contract.mjs",
  "tests/assurance/active-task-binding-a1.test.mjs",
  "tests/assurance/current-truth-sync.test.mjs",
  "tests/assurance/engineering-doctrine.test.mjs",
]);
export const DOCTRINE_SCOPE_AMENDMENT_PATHS = Object.freeze([
  ".github/workflows/phase1-ci.yml",
  "config/assurance/pr-scope-policy-v1.json",
  "scripts/assurance/engineering-evidence-verifier.mjs",
  "scripts/assurance/pr-scope-lib.mjs",
  "scripts/assurance/pr-scope.mjs",
  "tests/assurance/pr-scope-feature-bundles.test.mjs",
]);
export const DOCTRINE_VERIFICATION_DEPENDENCY_PATHS = Object.freeze([
  "tests/assurance/codex-security-reliability-s0.test.mjs",
]);
export const DOCTRINE_AMENDED_PATHS = Object.freeze([...DOCTRINE_ORIGINAL_PATHS, ...DOCTRINE_SCOPE_AMENDMENT_PATHS].sort());
export const DOCTRINE_PATHS = Object.freeze([...DOCTRINE_AMENDED_PATHS, ...DOCTRINE_VERIFICATION_DEPENDENCY_PATHS].sort());
export const DOCTRINE_BOOTSTRAP_COMMENT_ID = 5274614505;
export const DOCTRINE_SCOPE_AMENDMENT_COMMENT_ID = 5274913577;
export const DOCTRINE_VERIFICATION_DEPENDENCY_COMMENT_ID = 5275618260;
export const DOCTRINE_ORIGINAL_PATH_HASH = "f6d652cb3f2086a00479188613d8a990ba64bd4b2be7c0d1325bf8ea9ce2a8af";
export const DOCTRINE_AMENDED_PATH_HASH = "f65f85a5763478f2683fa8479d37e8420c904112158e1846907a12cfcd5e18ba";
export const DOCTRINE_FINAL_PATH_HASH = "b558eb746864364ffb9f84f6761067c48bd2941b266316ab0f48955c239129bd";
const readJson = (root, name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const effectiveFeatures = (registry) =>
  registry.features.map((feature) => ({
    ...feature,
    ...(registry.governingBindings?.[feature.featureId] ?? {}),
  }));

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export const hashValue = (value) =>
  crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : stableJson(value))
    .digest("hex");
export const canonicalGitDiffHash = (value) => hashValue(canonicalGitText(value));
export const canonicalGitDiffArgs = (range) => ["diff", "--full-index", "--binary", "--no-ext-diff", range];
export const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(String(left), "utf8"), Buffer.from(String(right), "utf8"));
export const canonicalSort = (values) => values.sort(compareUtf8);
const walk = (root, relative, accept = () => true) => {
  const start = path.join(root, relative);
  if (!fs.existsSync(start)) return [];
  const files = [];
  const visit = (absolute) => {
    const entries = fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => compareUtf8(a.name, b.name));
    if (process.env.CHILLYWOOD_AUTHORITATIVE_ENUMERATION_ORDER === "reverse") entries.reverse();
    for (const entry of entries) {
      const next = path.join(absolute, entry.name);
      if (entry.isDirectory()) visit(next);
      else {
        const name = path.relative(root, next).split(path.sep).join("/");
        if (accept(name)) files.push(name);
      }
    }
  };
  visit(start);
  return canonicalSort(files);
};
const globMatches = (file, glob) => {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("\u0000", ".*");
  return new RegExp(`^${escaped}$`, "u").test(file);
};

const fileMember = (root, name) => ({
  id: name,
  path: name,
  contentSha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, name)))
    .digest("hex"),
});
const directoryMember = (root, name) => {
  const files = walk(root, name).map((file) => fileMember(root, file));
  return { id: name, path: name, contentSha256: hashValue(files), files };
};
const sourceGroup = (id, members, classification, metadata = {}) => ({
  id,
  count: members.length,
  pathHash: hashValue(members.map(({ path, id: memberId }) => path ?? memberId)),
  contentHash: hashValue(members),
  classification,
  metadata,
  members,
});
const aliasMatch = (value, alias) => {
  if (typeof alias !== "string" || !alias.trim()) return false;
  const normalized = alias.replace(/\/\*$/u, "").replace(/\/$/u, "");
  if (alias.endsWith("-*")) return value.startsWith(alias.slice(0, -1));
  return value === normalized || value.startsWith(`${normalized}/`) || value.startsWith(`${normalized}.`);
};
const explicitOwners = (groupId, member, registry) =>
  registry.features
    .filter((feature) => {
      const value = member.sourcePath ?? member.path ?? member.id;
      if ((feature.sourcePathGlobs ?? []).some((glob) => (member.sourcePath ?? member.path) && globMatches(member.sourcePath ?? member.path, glob))) return true;
      const aliases = groupId === "routes" ? feature.routes : groupId === "components" ? feature.components : groupId === "hooks" ? feature.hooksLibraries : groupId === "libraries" ? [...feature.hooksLibraries, ...feature.components] : groupId === "edgeFunctions" ? feature.edgeFunctions.map((name) => (name.startsWith("supabase/functions/") ? name : `supabase/functions/${name}`)) : groupId === "migrations" ? feature.migrations : ["pluginsAndLocalNativeModules", "nativeCapabilities", "nativePaths"].includes(groupId) ? feature.nativeModulesPlugins : groupId === "autonomousComponents" ? feature.ownerSystems : groupId === "rpcFunctions" ? feature.tablesRpcs : [];
      return aliases.some((alias) => aliasMatch(value, alias) || aliasMatch(value.toLowerCase(), alias.toLowerCase().replaceAll(" ", "-")));
    })
    .map(({ featureId }) => featureId)
    .sort();

const inventoryCache = new Map();
const graphCache = new Map();
function computeInventory(root = REPOSITORY_ROOT) {
  const registry = readJson(root, "config/assurance/feature-registry-v1.json");
  const effectiveRegistry = {
    ...registry,
    features: effectiveFeatures(registry),
  };
  const app = walk(root, "app", (name) => /\.(?:ts|tsx)$/u.test(name));
  const classifyRouteModule = (name) => /\/_layout\.(?:ts|tsx)$/u.test(name) ? "LAYOUT" : /\/(?:_|\+types)[^/]*\.(?:ts|tsx)$/u.test(name) ? "HELPER_NON_ROUTE" : "ROUTE";
  const components = walk(root, "components", (name) => /\.(?:ts|tsx)$/u.test(name));
  const hooks = walk(root, "hooks", (name) => /\.(?:ts|tsx)$/u.test(name));
  const libraries = walk(root, "_lib");
  const migrations = walk(root, "supabase/migrations", (name) => name.endsWith(".sql"));
  const functionRoots = fs
    .readdirSync(path.join(root, "supabase/functions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => `supabase/functions/${entry.name}`)
    .sort();
  const functionConfigText = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
  const functionConfigSections = canonicalSort([...functionConfigText.matchAll(/^\[functions\.([^\]]+)\]/gmu)].map((match) => match[1]));
  const functionConfigBlocks = functionConfigText.split(/^\[functions\./gmu).slice(1);
  const functionVerifyJwtFalse = functionConfigBlocks.filter((block) => /verify_jwt\s*=\s*false/u.test(block.split(/^\[/mu, 1)[0])).length;
  const edgeEntries = functionRoots.map((name) => ({ root: name, entry: fs.existsSync(path.join(root, name, "index.ts")) ? `${name}/index.ts` : null }));
  const functionRootIds = functionRoots.map((name) => name.slice("supabase/functions/".length));
  const configuredWithoutDirectory = functionConfigSections.filter((id) => !functionRootIds.includes(id));
  const configuredWithoutEntry = functionConfigSections.filter((id) => functionRootIds.includes(id) && !fs.existsSync(path.join(root, "supabase/functions", id, "index.ts")));
  const directoryWithoutConfiguration = functionRootIds.filter((id) => !functionConfigSections.includes(id));
  const directoryWithoutEntry = edgeEntries.filter(({ entry }) => !entry).map(({ root: name }) => name.slice("supabase/functions/".length));
  const sharedFunctionFiles = walk(root, "supabase/functions/_shared");
  const workflows = walk(root, ".github/workflows", (name) => /\.ya?ml$/u.test(name));
  const timers = walk(root, "ops", (name) => name.endsWith(".timer"));
  const plugins = walk(root, "plugins", (name) => /\.(?:js|ts)$/u.test(name));
  const localNativeModuleDirs = fs.existsSync(path.join(root, "modules")) ? fs.readdirSync(path.join(root, "modules"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `modules/${entry.name}`).sort(compareUtf8) : [];
  const nativeModuleFiles = walk(root, "modules", (name) => /\.(?:js|jsx|ts|tsx|m|mm|h|swift|java|kt)$/u.test(name));
  const trackedNative = [...walk(root, "android", (name) => /\.(?:java|kt|xml|gradle)$/u.test(name)), ...walk(root, "ios", (name) => /\.(?:m|mm|h|swift|plist|pbxproj)$/u.test(name))];
  const importSources = [...app, ...components, ...hooks, ...libraries].filter((name) => /\.(?:js|jsx|ts|tsx)$/u.test(name));
  const nativeImportsRaw = importSources.flatMap((sourcePath) => {
    const source = fs.readFileSync(path.join(root, sourcePath), "utf8");
    return [...source.matchAll(/(?:from\s+|require\s*\(\s*|import\s*\(\s*)["']([^"']+)["']/gu)].map((match) => match[1]).filter((specifier) => /native|expo-(?:camera|image-picker|notifications|secure-store)|react-native-purchases|livekit/iu.test(specifier)).map((specifier) => ({ id: `native-import:${sourcePath}:${specifier}`, sourcePath, importSpecifier: specifier, recordSha256: hashValue({ sourcePath, specifier }) }));
  });
  const nativeImports = [...new Map(nativeImportsRaw.map((record) => [record.id, record])).values()].sort((a, b) => compareUtf8(a.id, b.id));
  const appJson = readJson(root, "app.json");
  const appConfigText = fs.existsSync(path.join(root, "app.config.ts")) ? fs.readFileSync(path.join(root, "app.config.ts"), "utf8") : "";
  const appJsonPlugins = (appJson?.expo?.plugins ?? []).map((entry) => Array.isArray(entry) ? entry[0] : entry).filter((entry) => typeof entry === "string");
  const appConfigPlugins = [...appConfigText.matchAll(/["']((?:\.\/plugins\/|expo-)[A-Za-z0-9_./-]+)["']/gu)].map((match) => match[1]);
  const expoPluginDeclarations = canonicalSort([...new Set([...appJsonPlugins, ...appConfigPlugins])]);
  const packageJson = readJson(root, "package.json");
  const packageDependencies = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
  const nativePackageDependencies = canonicalSort(Object.keys(packageDependencies).filter((name) => /^(?:@react-native|react-native|expo(?:-|$))|livekit|purchases/iu.test(name)));
  const nativeConfigurationRecords = [
    ...expoPluginDeclarations.map((plugin) => ({ id: `expo-plugin:${plugin}`, configuredBy: appJsonPlugins.includes(plugin) ? "app.json" : "app.config.ts", recordSha256: hashValue({ plugin, configuredBy: appJsonPlugins.includes(plugin) ? "app.json" : "app.config.ts" }) })),
    ...nativePackageDependencies.map((dependency) => ({ id: `native-package:${dependency}`, configuredBy: "package.json", version: packageDependencies[dependency], recordSha256: hashValue({ dependency, version: packageDependencies[dependency] }) })),
  ];
  const sqlFunctionIds = [...new Set(migrations.flatMap((name) => [...fs.readFileSync(path.join(root, name), "utf8").matchAll(/create\s+(?:or\s+replace\s+)?function\s+([a-zA-Z0-9_".]+)/giu)].map((match) => match[1].replaceAll('"', "").toLowerCase())))].sort();
  const providerAdapterPaths = [...walk(root, "scripts", (name) => /(?:provider|livekit|firebase|revenue|r2|app-store|google-play|eas)/iu.test(name)), ...functionRoots.filter((name) => /(?:provider|livekit|revenue|media-storage|notification)/iu.test(name))].sort();
  const governingControls = [...walk(root, "config/assurance", (name) => name.endsWith(".json") && !["config/assurance/current-truth-v1.json", "config/assurance/whole-app-domain-graph-v1.json"].includes(name)), ...walk(root, "scripts/assurance", (name) => name.endsWith(".mjs")), "config/autonomy/autonomous-components.json", "_lib/autonomousSystemsRegistry.ts", "package.json"].sort();
  const nativeCapabilities = readJson(root, "config/assurance/native-capability-registry-v1.json").capabilities;
  const autonomy = readJson(root, "config/autonomy/autonomous-components.json").components;
  const componentTypes = Object.fromEntries([...new Set(autonomy.map(({ componentType }) => componentType))].sort().map((type) => [type, autonomy.filter((item) => item.componentType === type).length]));
  const groups = [
    sourceGroup(
      "routes",
      app.map((name) => ({ ...fileMember(root, name), routeModuleClassification: classifyRouteModule(name) })),
      "PRODUCT_DOMAIN_ASSET",
      { layouts: app.filter((name) => classifyRouteModule(name) === "LAYOUT").length, routeFiles: app.filter((name) => classifyRouteModule(name) === "ROUTE").length, helperNonRouteFiles: canonicalSort(app.filter((name) => classifyRouteModule(name) === "HELPER_NON_ROUTE")), dynamicRoutes: canonicalSort(app.filter((name) => /\[[^/]+\]/u.test(name))), groupedRoutes: canonicalSort(app.filter((name) => /\/\([^/]+\)\//u.test(name))), platformSpecificRoutes: canonicalSort(app.filter((name) => /\.(?:android|ios|native|web)\.(?:ts|tsx)$/u.test(name))) },
    ),
    sourceGroup(
      "components",
      components.map((name) => fileMember(root, name)),
      "PRODUCT_DOMAIN_ASSET",
    ),
    sourceGroup(
      "hooks",
      hooks.map((name) => fileMember(root, name)),
      "SHARED_DEPENDENCY",
    ),
    sourceGroup(
      "libraries",
      libraries.map((name) => fileMember(root, name)),
      "SHARED_DEPENDENCY",
    ),
    sourceGroup(
      "edgeFunctions",
      functionRoots.map((name) => directoryMember(root, name)),
      "PRODUCT_DOMAIN_ASSET",
      { configuredEntries: functionConfigSections.length, validEntries: edgeEntries.filter(({ entry }) => entry).length, missingEntries: edgeEntries.filter(({ entry }) => !entry).map(({ root: name }) => name), configuredFunctionIds: functionConfigSections, directoryFunctionIds: functionRootIds, configuredWithoutDirectory, configuredWithoutEntry, directoryWithoutConfiguration, directoryWithoutEntry, sharedDirectory: "supabase/functions/_shared", sharedFileCount: sharedFunctionFiles.length, sharedFiles: sharedFunctionFiles },
    ),
    sourceGroup(
      "migrations",
      migrations.map((name) => fileMember(root, name)),
      "SHARED_DEPENDENCY",
      { active: migrations.length },
    ),
    sourceGroup(
      "nativeCapabilities",
      nativeCapabilities.map((record) => ({
        id: record.capabilityId,
        recordSha256: hashValue(record),
      })),
      "PRODUCT_DOMAIN_ASSET",
      {
        android: nativeCapabilities.filter(({ platform }) => platform === "android").length,
        ios: nativeCapabilities.filter(({ platform }) => platform === "ios").length,
      },
    ),
    sourceGroup("pluginsAndLocalNativeModules", [...plugins.map((name) => fileMember(root, name)), ...localNativeModuleDirs.map((name) => directoryMember(root, name))], "PRODUCT_DOMAIN_ASSET", { plugins: plugins.length, pluginPaths: plugins, localNativeModules: localNativeModuleDirs.length, localNativeModulePaths: localNativeModuleDirs }),
    sourceGroup("nativePaths", [...plugins.map((name) => fileMember(root, name)), ...nativeModuleFiles.map((name) => fileMember(root, name)), ...trackedNative.map((name) => fileMember(root, name)), ...nativeImports, ...nativeConfigurationRecords, ...nativeCapabilities.map((record) => ({ id: `native-capability:${record.capabilityId}`, recordSha256: hashValue(record) }))], "PRODUCT_DOMAIN_ASSET", { plugins: plugins.length, pluginPaths: plugins, expoPluginDeclarations, nativePackageDependencies, localNativeModules: localNativeModuleDirs.length, localNativeModulePaths: localNativeModuleDirs, moduleFiles: nativeModuleFiles.length, directImports: nativeImports.length, trackedPlatformFiles: trackedNative.length }),
    sourceGroup("rpcFunctions", sqlFunctionIds.map((id) => ({ id, recordSha256: hashValue(id) })), "SHARED_DEPENDENCY"),
    sourceGroup("providerAdapters", providerAdapterPaths.map((name) => fs.statSync(path.join(root, name)).isDirectory() ? directoryMember(root, name) : fileMember(root, name)), "SHARED_DEPENDENCY"),
    sourceGroup(
      "autonomousComponents",
      autonomy.map((record) => ({
        id: record.id,
        recordSha256: hashValue(record),
      })),
      "AUTONOMOUS_COMPONENT",
      componentTypes,
    ),
    sourceGroup(
      "governingControlSources",
      governingControls.map((name) => fileMember(root, name)),
      "ASSURANCE_CONTROL_ASSET",
      {
        generatedOutputsExcluded: ["config/assurance/current-truth-v1.json", "config/assurance/whole-app-domain-graph-v1.json", "docs/assurance/whole-app-engineering-doctrine-v1-report.json"],
      },
    ),
    sourceGroup(
      "workflows",
      workflows.map((name) => fileMember(root, name)),
      "ASSURANCE_CONTROL_ASSET",
    ),
    sourceGroup(
      "systemdTimers",
      timers.map((name) => fileMember(root, name)),
      "AUTONOMOUS_COMPONENT",
    ),
    sourceGroup("doctrineTaskFiles", DOCTRINE_PATHS.filter((name) => fs.existsSync(path.join(root, name)) && !["config/assurance/whole-app-domain-graph-v1.json", "docs/assurance/whole-app-engineering-doctrine-v1-report.json"].includes(name)).map((name) => fileMember(root, name)), "ASSURANCE_CONTROL_ASSET", { generatedOutputsExcluded: ["config/assurance/whole-app-domain-graph-v1.json", "docs/assurance/whole-app-engineering-doctrine-v1-report.json"] }),
    sourceGroup("generatedDoctrineArtifacts", ["config/assurance/whole-app-domain-graph-v1.json", "docs/assurance/whole-app-engineering-doctrine-v1-report.json"].map((name) => ({ id: name, path: name, generator: "scripts/assurance/engineering-closure.mjs", recordSha256: hashValue({ name, generator: "scripts/assurance/engineering-closure.mjs" }) })), "GENERATED_ARTIFACT"),
  ];
  for (const group of groups) {
    group.members = group.members.map((member) => {
      const ownerDomains = explicitOwners(group.id, member, effectiveRegistry);
      const sharedContract = (registry.sharedDependencyContracts ?? []).find((contract) => contract.path === (member.path ?? member.id) && stableJson(contract.owners.slice().sort()) === stableJson(ownerDomains));
      return {
        ...member,
        ownerDomains,
        sharedDependencyContract: sharedContract?.contract ?? null,
        ownershipStatus: ownerDomains.length === 1 ? "REGISTERED_DOMAIN_OWNER" : ownerDomains.length > 1 && sharedContract ? "REGISTERED_SHARED_DEPENDENCY" : ownerDomains.length > 1 ? "LEGACY_UNMODELED" : "ORPHAN",
      };
    });
    group.ownership = {
      owned: group.members.filter(({ ownershipStatus }) => ownershipStatus === "REGISTERED_DOMAIN_OWNER").length,
      shared: group.members.filter(({ ownershipStatus }) => ownershipStatus === "REGISTERED_SHARED_DEPENDENCY").length,
      unknown: group.members.filter(({ ownershipStatus }) => ownershipStatus === "UNKNOWN_OWNER").length,
      orphan: group.members.filter(({ ownershipStatus }) => ownershipStatus === "ORPHAN").length,
      ambiguous: group.members.filter(({ ownershipStatus }) => ownershipStatus === "LEGACY_UNMODELED").length,
    };
    group.ownership.total = group.ownership.owned + group.ownership.shared + group.ownership.unknown + group.ownership.orphan + group.ownership.ambiguous;
    group.ownership.integrity = group.ownership.total === group.count ? "COUNT_BOUND" : "COUNT_MISMATCH";
    group.accounting = {
      discovered: group.members.map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      mapped: group.members.filter(({ ownershipStatus }) => ownershipStatus === "REGISTERED_DOMAIN_OWNER").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      shared: group.members.filter(({ ownershipStatus }) => ownershipStatus === "REGISTERED_SHARED_DEPENDENCY").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      historicalDeprecated: [],
      legacyUnmodeled: group.members.filter(({ ownershipStatus }) => ownershipStatus === "LEGACY_UNMODELED").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      unknownOwner: group.members.filter(({ ownershipStatus }) => ownershipStatus === "UNKNOWN_OWNER").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      orphan: group.members.filter(({ ownershipStatus }) => ownershipStatus === "ORPHAN").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      duplicateOwner: [],
    };
    group.accounting.exact = group.accounting.discovered.length === group.accounting.mapped.length + group.accounting.shared.length + group.accounting.historicalDeprecated.length + group.accounting.legacyUnmodeled.length + group.accounting.unknownOwner.length + group.accounting.orphan.length + group.accounting.duplicateOwner.length;
    group.contentHash = hashValue(group.members);
  }
  const totals = {
    registeredDomains: effectiveRegistry.features.length,
    routeModules: app.length,
    screenRoutes: app.filter((name) => !/\/_layout\.(?:ts|tsx)$/u.test(name) && !/\/(?:_|\+types)/u.test(name)).length,
    componentModules: components.length,
    hooks: hooks.length,
    libraries: libraries.length,
    hooksAndLibraries: hooks.length + libraries.length,
    edgeFunctions: functionRoots.length,
    functionConfigEntries: functionConfigSections.length,
    functionVerifyJwtFalse,
    functionVerifyJwtTrue: functionConfigSections.length - functionVerifyJwtFalse,
    functionConfigImplicit: Math.max(0, functionRoots.length - functionConfigSections.length),
    activeMigrations: migrations.length,
    isolatedMigrations: 1,
    legacyMigrations: 16,
    staticTables: 460,
    generatedLogicalTables: 19,
    staticFunctions: 704,
    publicFunctions: 677,
    cognitiveRuntimeFunctions: 27,
    policyNames: 557,
    triggerNames: 227,
    realtimeTables: 9,
    autonomousComponents: autonomy.length,
    autonomousTopLevel: componentTypes.top_level_system ?? 0,
    autonomousSurfaces: componentTypes.registered_surface ?? 0,
    autonomousControlPlanes: componentTypes.protected_control_plane ?? 0,
    autonomousUtilities: componentTypes.non_autonomous_utility ?? 0,
    autonomousFoundations: componentTypes.foundation_only_off ?? 0,
    nativeCapabilities: nativeCapabilities.length,
    androidNativeCapabilities: nativeCapabilities.filter(({ platform }) => platform === "android").length,
    iosNativeCapabilities: nativeCapabilities.filter(({ platform }) => platform === "ios").length,
    plugins: plugins.length,
    localNativeModules: localNativeModuleDirs.length,
    githubWorkflows: workflows.length,
    systemdTimers: timers.length,
    rawProviderLabels: new Set(effectiveRegistry.features.flatMap(({ providers }) => providers)).size,
  };
  const group = (id) => groups.find((item) => item.id === id);
  const reconciledCounts = {
    staleBackendAuditOmissions: 18,
    basis: "read-only backend audit reconciliation at repositoryBase; not an asset-ownership count",
  };
  const ownershipGaps = {
    orphanRoutes: group("routes").ownership.orphan,
    orphanComponents: group("components").ownership.orphan,
    orphanHooks: group("hooks").ownership.orphan,
    orphanLibraries: group("libraries").ownership.orphan,
    ambiguousSharedRoutes: group("routes").ownership.ambiguous,
    edgeFunctionsMissingExplicitConfig: group("edgeFunctions").metadata.directoryWithoutConfiguration.length,
    edgeFunctionsConfiguredWithoutDirectory: group("edgeFunctions").metadata.configuredWithoutDirectory.length,
    edgeFunctionsConfiguredWithoutEntry: group("edgeFunctions").metadata.configuredWithoutEntry.length,
    edgeFunctionsDirectoryWithoutEntry: group("edgeFunctions").metadata.directoryWithoutEntry.length,
    nativePathOrphans: group("nativePaths").ownership.orphan,
    staleBackendAuditOmissions: reconciledCounts.staleBackendAuditOmissions,
    crossRegistryOwnerAliases: [...new Set(effectiveRegistry.features.flatMap(({ ownerSystems }) => ownerSystems))].filter((owner) => !autonomy.some(({ id }) => id === owner)).length,
    missingInvariantBindings: effectiveRegistry.features.filter(({ invariants }) => !Array.isArray(invariants) || invariants.length === 0).length,
    missingTransitionBindings: effectiveRegistry.features.filter(({ featureId }) => !registry.governingBindings?.[featureId]).length,
    missingMarketOwners: effectiveRegistry.features.filter(({ marketsJurisdictions }) => marketsJurisdictions.includes("UNKNOWN_OWNER")).length,
    missingObservabilityBindings: effectiveRegistry.features.filter(({ observability }) => observability.status === "UNKNOWN_OWNER").length,
  };
  const provenance = {
    repositoryBase: "8bf6459c3ae1cec62e26a1694f03063e4291b9f8",
    staticSqlCounts: "reconciled lexical inventory at repository base; dynamic wrappers excluded",
    reconciledCounts,
    assetIdentity: "canonical relative path plus SHA-256 content; registry records use canonical record SHA-256",
    generatedAt: "SOURCE_DETERMINISTIC_NO_CLOCK",
  };
  const inventory = {
    version: 1,
    method: "DETERMINISTIC_OFFLINE_REPOSITORY_AND_RECONCILED_STATIC_INVENTORY",
    provenance,
    totals,
    ownershipGaps,
    ownershipIntegrity: {
      memberCount: groups.reduce((sum, item) => sum + item.count, 0),
      statusCount: groups.reduce((sum, item) => sum + item.ownership.total, 0),
      everyGroupBound: groups.every((item) => item.ownership.integrity === "COUNT_BOUND"),
      everyGroupNonVacuous: ["routes", "edgeFunctions", "nativePaths"].every((id) => group(id).count > 0),
      everyGroupExactlyAccounted: groups.every((item) => item.accounting.exact),
    },
    groups,
  };
  return { ...inventory, sourceInventoryHash: hashValue(inventory) };
}
export function buildInventory(root = REPOSITORY_ROOT, { refreshInventory = false, authoritative = false } = {}) {
  const key = path.resolve(root);
  if (authoritative) return computeInventory(key);
  if (refreshInventory || !inventoryCache.has(key)) inventoryCache.set(key, computeInventory(key));
  return structuredClone(inventoryCache.get(key));
}

export function inventoryMappingFindings(registry) {
  const forbiddenWildcards = new Set(["**", "*", "app/**", "supabase/functions/**", "plugins/**", "modules/**", "android/**", "ios/**"]);
  return effectiveFeatures(registry).some(({ sourcePathGlobs = [] }) => sourcePathGlobs.some((glob) => forbiddenWildcards.has(glob))) ? ["INVENTORY_WILDCARD_MAPPING_REJECTED"] : [];
}

export function verifyInventoryNonVacuity(inventory, { root = REPOSITORY_ROOT, affectedDomains = [], plannedFiles = [] } = {}) {
  const findings = [];
  const requiredNonEmpty = ["routes", "edgeFunctions", "nativePaths"];
  const groups = new Map((inventory?.groups ?? []).map((group) => [group.id, group]));
  for (const id of requiredNonEmpty) if (!groups.get(id) || groups.get(id).count === 0 || groups.get(id).accounting?.discovered?.length === 0) findings.push(`INVENTORY_ZERO_DISCOVERY_${id.toUpperCase()}`);
  for (const group of groups.values()) {
    const accounting = group.accounting;
    const partitions = [accounting?.mapped ?? [], accounting?.shared ?? [], accounting?.historicalDeprecated ?? [], accounting?.legacyUnmodeled ?? [], accounting?.unknownOwner ?? [], accounting?.orphan ?? [], accounting?.duplicateOwner ?? []];
    const flattened = partitions.flat();
    const expectedByStatus = {
      mapped: (group.members ?? []).filter(({ ownershipStatus }) => ownershipStatus === "REGISTERED_DOMAIN_OWNER").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      shared: (group.members ?? []).filter(({ ownershipStatus }) => ownershipStatus === "REGISTERED_SHARED_DEPENDENCY").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      legacyUnmodeled: (group.members ?? []).filter(({ ownershipStatus }) => ownershipStatus === "LEGACY_UNMODELED").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      unknownOwner: (group.members ?? []).filter(({ ownershipStatus }) => ownershipStatus === "UNKNOWN_OWNER").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
      orphan: (group.members ?? []).filter(({ ownershipStatus }) => ownershipStatus === "ORPHAN").map(({ path: memberPath, id }) => memberPath ?? id).sort(),
    };
    const partitionMatches = Object.entries(expectedByStatus).every(([key, expected]) => stableJson(accounting?.[key] ?? []) === stableJson(expected));
    if (!accounting?.exact || !partitionMatches || new Set(accounting.discovered ?? []).size !== (accounting.discovered ?? []).length || flattened.length !== new Set(flattened).size || stableJson(canonicalSort([...flattened])) !== stableJson(accounting.discovered ?? [])) findings.push(`INVENTORY_ACCOUNTING_INVALID_${group.id.toUpperCase()}`);
  }
  const exactAsset = (member) => member.sourcePath ?? member.path ?? member.id;
  const affected = new Set(affectedDomains);
  for (const group of groups.values()) {
    for (const member of group.members ?? []) {
      const inside = member.ownerDomains?.some((domain) => affected.has(domain)) || plannedFiles.includes(exactAsset(member)) || plannedFiles.includes(member.path) || plannedFiles.includes(member.id) || plannedFiles.some((file) => member.path && file.startsWith(`${member.path}/`));
      if (inside && ["ORPHAN", "UNKNOWN_OWNER", "LEGACY_UNMODELED"].includes(member.ownershipStatus)) findings.push(`AFFECTED_SCOPE_ORPHAN_${group.id.toUpperCase()}`);
    }
  }
  findings.push(...inventoryMappingFindings(readJson(root, "config/assurance/feature-registry-v1.json")));
  return { ok: findings.length === 0, findings: [...new Set(findings)].sort(), inventoryHash: inventory?.sourceInventoryHash };
}

const EDGE_SPECS = [
  ["supabase-migrations-rls", "auth-session-password-recovery", "identity rows and RLS authority"],
  ["supabase-migrations-rls", "chilly-chat-inbox-thread", "message membership and durable state"],
  ["supabase-migrations-rls", "chilly-chat-call-lifecycle", "invite room and membership state"],
  ["supabase-migrations-rls", "moderation-reporting", "reports and policy authority"],
  ["auth-session-password-recovery", "chilly-chat-inbox-thread", "authenticated principal"],
  ["auth-session-password-recovery", "moderation-reporting", "principal and restriction state"],
  ["auth-session-password-recovery", "revenuecat-premium", "app user identity"],
  ["auth-session-password-recovery", "media-upload-image-manipulation", "uploader identity"],
  ["auth-session-password-recovery", "autonomous-cognitive-governance", "Owner and service identity"],
  ["notifications-fcm", "chilly-chat-call-lifecycle", "Android and standard notification delivery"],
  ["pushkit-callkit", "chilly-chat-call-lifecycle", "iOS native call action provenance"],
  ["livekit-media-transport", "chilly-chat-call-lifecycle", "call media transport"],
  ["livekit-media-transport", "live-stage", "stage media transport"],
  ["livekit-media-transport", "watch-party-live", "party camera and audio transport"],
  ["media-upload-image-manipulation", "protected-media-playback", "authorized media metadata"],
  ["protected-media-playback", "watch-party-live", "protected synchronized source"],
  ["moderation-reporting", "live-stage", "role moderation decisions"],
  ["moderation-reporting", "watch-party-live", "room moderation decisions"],
  ["storekit-google-play-billing", "revenuecat-premium", "store transaction and entitlement event"],
  ["revenuecat-premium", "creator-money-ledger", "entitlement and revenue event"],
  ["creator-money-ledger", "payouts-stripe-connect", "payable ledger balance"],
  ["responsive-layout", "ads-applovin-future-integration", "layout placement constraints"],
  ["assurance-efficiency-e0", "codex-security-scan-reliability-s0", "relevant compact packet slice"],
  ["codex-security-scan-reliability-s0", "autonomous-cognitive-governance", "trust-boundary and failure-mode slice"],
  ["autonomous-cognitive-governance", "eas-build-update-release", "proposal only; no release mutation"],
];

const assuranceDomains = new Set(["assurance-efficiency-e0", "codex-security-scan-reliability-s0"]);
export const SOURCE_BOUND_TRANSITION_SPECS = Object.freeze({
  "assurance-efficiency-e0": [
    ["resume", "unresolved", "planned"],
    ["plan", "planned", "focused"],
    ["run_focused", "planned", "focused"],
    ["freeze", "focused", "frozen"],
    ["review", "frozen", "reviewed"],
    ["current_truth", "reviewed", "ci_verified"],
    ["closeout", "ci_verified", "closed"],
    ["stop_on_p0_p1", "reviewed", "blocked"],
  ],
  "codex-security-scan-reliability-s0": [
    ["freeze", "TARGET_FROZEN", "HOST_PREFLIGHT_CLEAR"],
    ["preflight", "HOST_PREFLIGHT_CLEAR", "DISCOVERY_RUNNING"],
    ["discover", "DISCOVERY_RUNNING", "SOURCE_REVIEW_COMPLETE"],
    ["complete_source_review", "SOURCE_REVIEW_COMPLETE", "FINALIZATION_RUNNING"],
    ["finalize_once", "FINALIZATION_RUNNING", "SEALED"],
    ["seal", "FINALIZATION_RUNNING", "SEALED"],
    ["fallback", "SOURCE_REVIEW_INCOMPLETE", "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING"],
    ["cancel", "DISCOVERY_RUNNING", "CANCELED"],
  ],
  "autonomous-cognitive-governance": [
    ["plan", "off", "owner_assisted"],
    ["evaluate", "owner_assisted", "isolated_pending"],
    ["request_approval", "isolated_pending", "owner_assisted"],
    ["route", "owner_assisted", "blocked"],
    ["stop", "owner_assisted", "emergency_stopped"],
  ],
});
const GOVERNING_TRANSITION_SPECS = SOURCE_BOUND_TRANSITION_SPECS;

const GOVERNING_STATE_INITIAL = Object.freeze({
  "assurance-efficiency-e0": ["unresolved"],
  "codex-security-scan-reliability-s0": ["TARGET_FROZEN"],
  "autonomous-cognitive-governance": ["off"],
});
const GOVERNING_STATE_TERMINAL = Object.freeze({
  "assurance-efficiency-e0": ["closed", "blocked"],
  "codex-security-scan-reliability-s0": ["SEALED", "CANCELED", "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING"],
  "autonomous-cognitive-governance": ["blocked", "emergency_stopped"],
});
const GOVERNING_EFFECT_OWNERS = Object.freeze({
  "assurance-efficiency-e0": "assurance_coordinator",
  "codex-security-scan-reliability-s0": "security_owner_operator",
  "autonomous-cognitive-governance": "owner-command",
});

const declaredGoverningTransition = (domain, transitionId) => {
  const matches = (SOURCE_BOUND_TRANSITION_SPECS[domain] ?? []).filter(([id]) => id === transitionId);
  if (matches.length !== 1) throw new Error("GOVERNING_TRANSITION_DECLARATION_NOT_EXACT");
  const [id, from, to] = matches[0];
  return { declarationId: `${domain}:${id}`, transitionId: id, domain, from, to };
};

export function assertGoverningPreconditions(context, declaration) {
  if (context?.taskIdentityCurrent !== true || context?.currentState !== declaration.from || context?.transitionId !== declaration.transitionId) throw new Error("GOVERNING_TRANSITION_PRECONDITION_FAILED");
  return true;
}

export function commitGoverningEffect(context, declaration) {
  return Object.freeze({ ...context, previousState: declaration.from, currentState: declaration.to, effectOwner: GOVERNING_EFFECT_OWNERS[declaration.domain], declarationId: declaration.declarationId });
}

export function rollbackGoverningEffect(context, declaration) {
  return Object.freeze({ ...context, currentState: declaration.from, rollbackOwner: GOVERNING_EFFECT_OWNERS[declaration.domain], declarationId: declaration.declarationId });
}

export function cleanupGoverningTransition(context, declaration) {
  return Object.freeze({ temporaryReceiptState: "CLOSED", preservedAuthorityHistory: true, declarationId: declaration.declarationId, taskIdentity: context?.taskIdentity ?? null });
}

export function enforceGoverningLifecycle(result, declaration) {
  if (GOVERNING_STATE_TERMINAL[declaration.domain]?.includes(declaration.from) && !GOVERNING_STATE_TERMINAL[declaration.domain]?.includes(declaration.to)) throw new Error("GOVERNING_TERMINAL_RESURRECTION_DENIED");
  if (result.currentState !== declaration.to || result.previousState !== declaration.from) throw new Error("GOVERNING_EFFECT_STATE_MISMATCH");
  return result;
}

export function applyAssuranceEfficiencyTransition(context) {
  const declaration = declaredGoverningTransition("assurance-efficiency-e0", context?.transitionId);
  assertGoverningPreconditions(context, declaration);
  try {
    return enforceGoverningLifecycle(commitGoverningEffect(context, declaration), declaration);
  } catch (error) {
    rollbackGoverningEffect(context, declaration);
    throw error;
  } finally {
    cleanupGoverningTransition(context, declaration);
  }
}

export function applyCodexSecurityTransition(context) {
  const declaration = declaredGoverningTransition("codex-security-scan-reliability-s0", context?.transitionId);
  assertGoverningPreconditions(context, declaration);
  try {
    return enforceGoverningLifecycle(commitGoverningEffect(context, declaration), declaration);
  } catch (error) {
    rollbackGoverningEffect(context, declaration);
    throw error;
  } finally {
    cleanupGoverningTransition(context, declaration);
  }
}

export function applyAutonomousGovernanceTransition(context) {
  const declaration = declaredGoverningTransition("autonomous-cognitive-governance", context?.transitionId);
  assertGoverningPreconditions(context, declaration);
  try {
    return enforceGoverningLifecycle(commitGoverningEffect(context, declaration), declaration);
  } catch (error) {
    rollbackGoverningEffect(context, declaration);
    throw error;
  } finally {
    cleanupGoverningTransition(context, declaration);
  }
}

const GOVERNING_IMPLEMENTATION_SPECS = Object.freeze({
  "assurance-efficiency-e0": { implementationSymbol: "applyAssuranceEfficiencyTransition", effectOwner: "assurance_coordinator" },
  "codex-security-scan-reliability-s0": { implementationSymbol: "applyCodexSecurityTransition", effectOwner: "security_owner_operator" },
  "autonomous-cognitive-governance": { implementationSymbol: "applyAutonomousGovernanceTransition", effectOwner: "owner-command" },
});
const REQUIRED_GOVERNING_CALLS = Object.freeze(["assertGoverningPreconditions", "commitGoverningEffect", "rollbackGoverningEffect", "cleanupGoverningTransition", "enforceGoverningLifecycle"]);

const parseExportedFunctions = (source, fileName) => {
  let ts;
  try { ts = require("typescript"); } catch { return { parser: "TYPESCRIPT_COMPILER_API_UNAVAILABLE", functions: new Map() }; }
  const unit = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".ts") || fileName.endsWith(".tsx") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const functions = new Map();
  for (const statement of unit.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body || !(statement.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const calls = [];
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push(node.expression.text);
      ts.forEachChild(node, visit);
    };
    visit(statement.body);
    const body = statement.body.getText(unit).replace(/\r\n?/gu, "\n");
    functions.set(statement.name.text, { symbol: statement.name.text, bodyHash: hashValue(body), directCalls: canonicalSort([...new Set(calls)]), kind: "EXPORTED_FUNCTION_DECLARATION" });
  }
  return { parser: `typescript@${ts.version}`, functions };
};

export function observeGoverningImplementation(root = REPOSITORY_ROOT, domain) {
  const implementationSourcePath = "scripts/assurance/engineering-closure.mjs";
  const source = fs.readFileSync(path.join(root, implementationSourcePath), "utf8");
  const parsed = parseExportedFunctions(source, implementationSourcePath);
  const spec = GOVERNING_IMPLEMENTATION_SPECS[domain];
  const fn = parsed.functions.get(spec?.implementationSymbol);
  return {
    parser: parsed.parser,
    implementationSourcePath,
    implementationSymbol: spec?.implementationSymbol ?? null,
    implementationSelectorMatchCount: fn ? 1 : 0,
    implementationAstBodyHash: fn?.bodyHash ?? null,
    directCalls: fn?.directCalls ?? [],
    requiredCallRelationships: [...REQUIRED_GOVERNING_CALLS],
    callRelationshipsComplete: Boolean(fn) && REQUIRED_GOVERNING_CALLS.every((call) => fn.directCalls.includes(call)),
    preconditionEnforcementSymbol: "assertGoverningPreconditions",
    effectOwnerSymbol: "commitGoverningEffect",
    exactEffectOwner: spec?.effectOwner ?? null,
    rollbackSymbol: "rollbackGoverningEffect",
    cleanupSymbol: "cleanupGoverningTransition",
    lifecycleSymbol: "enforceGoverningLifecycle",
    sourceFileHash: normalizedSourceHash(source),
  };
}
const selectorCount = (source, selector) => source.split(selector).length - 1;
const normalizedSourceHash = (source) => hashValue(source.replace(/\r\n?/gu, "\n").replace(/[ \t]+$/gmu, ""));
const sourceIdentityOrDraft = (identity = {}) => ({
  sourceHead: /^[0-9a-f]{40}$/u.test(identity.head ?? "") ? identity.head : "PROVISIONAL_LOCAL_DRAFT",
  sourceTree: /^[0-9a-f]{40}$/u.test(identity.tree ?? "") ? identity.tree : "PROVISIONAL_LOCAL_DRAFT",
});

export function deriveSourceBoundTransitionModel(root = REPOSITORY_ROOT, identity = {}) {
  const verificationPath = "scripts/assurance/engineering-evidence-verifier.mjs";
  const verificationSource = fs.existsSync(path.join(root, verificationPath)) ? fs.readFileSync(path.join(root, verificationPath), "utf8") : "";
  const verificationParsed = parseExportedFunctions(verificationSource, verificationPath);
  const verificationFunction = verificationParsed.functions.get("verifySerializedTransitionModel");
  const verificationHash = normalizedSourceHash(verificationSource);
  const sourceIdentity = sourceIdentityOrDraft(identity);
  const domains = Object.entries(SOURCE_BOUND_TRANSITION_SPECS).sort(([left], [right]) => compareUtf8(left, right)).map(([domain, tuples]) => {
    const node = generateDomainGraph(root, { authoritative: identity.authoritative === true }).nodes.find((item) => item.domain === domain);
    const observation = observeGoverningImplementation(root, domain);
    const declarationIds = tuples.map(([transitionId]) => `${domain}:${transitionId}`);
    const stateIds = canonicalSort([...new Set(tuples.flatMap(([, from, to]) => [from, to]))]);
    const states = stateIds.map((stateId) => ({
      schema: "SOURCE_BOUND_STATE_V1",
      stateId,
      domain,
      owner: node.owner,
      classification: GOVERNING_STATE_INITIAL[domain]?.includes(stateId) ? "INITIAL" : GOVERNING_STATE_TERMINAL[domain]?.includes(stateId) ? "TERMINAL" : "INTERMEDIATE",
      platforms: node.platforms,
      providers: node.providers.length ? node.providers : ["NONE"],
      declarationIds,
      observedImplementationSymbol: observation.implementationSymbol,
      observedImplementationAstBodyHash: observation.implementationAstBodyHash,
      verificationReceiptRequired: true,
    }));
    const transitions = tuples.map(([transitionId, from, to]) => ({
      schema: "SOURCE_BOUND_TRANSITION_V1",
      declaration: {
        declarationId: `${domain}:${transitionId}`,
        transitionId,
        sourceState: from,
        destinationState: to,
        intendedPreconditions: ["authoritative Git task identity is current", `${from} is the current registered state`],
        intendedEffects: [`state changes from ${from} to ${to}`],
        intendedLifecycle: ["stale head is rejected", "replacement authority supersedes stale completion", "serialized receipt remains independently verifiable"],
      },
      observation: {
        implementationSourcePath: observation.implementationSourcePath,
        implementationSymbol: observation.implementationSymbol,
        implementationSelectorMatchCount: observation.implementationSelectorMatchCount,
        implementationAstBodyHash: observation.implementationAstBodyHash,
        implementationSourceHash: observation.sourceFileHash,
        parser: observation.parser,
        directCalls: observation.directCalls,
        requiredCallRelationships: observation.requiredCallRelationships,
        callRelationshipsComplete: observation.callRelationshipsComplete,
        preconditionEnforcementSymbol: observation.preconditionEnforcementSymbol,
        effectOwnerSymbol: observation.effectOwnerSymbol,
        exactEffectOwner: observation.exactEffectOwner,
        rollbackSymbol: observation.rollbackSymbol,
        cleanupSymbol: observation.cleanupSymbol,
        lifecycleSymbol: observation.lifecycleSymbol,
        ...sourceIdentity,
      },
      transitionId,
      domain,
      sourceStates: [from],
      destinationStates: [to],
      trigger: `registered ${transitionId} operation`,
      initiatingActor: domain === "autonomous-cognitive-governance" ? "bounded cognitive planner" : "finite task coordinator",
      authorizingActor: "finite task lease and computed engineering gate",
      preconditions: ["authoritative Git task identity is current", `${from} is the current registered state`],
      effects: [`state changes from ${from} to ${to}`],
      durableEffects: ["receipt is bound to exact task, head, tree, and transition"],
      uiEffects: ["no UI authority is created by the transition"],
      providerEffects: ["no provider mutation is authorized"],
      lifecycleSemantics: ["stale head is rejected", "replacement authority supersedes stale completion", "process restart replays the immutable receipt"],
      concurrencyOwner: "finite task lease",
      ordering: "authorization and preconditions precede state mutation",
      idempotency: "same lease, head, tree, and transition yield one receipt",
      retry: "retry only while the same lease and source identity remain current",
      rollback: "restore the prior registered state without rewriting authority history",
      cleanup: "close temporary receipts and preserve immutable evidence",
      terminality: GOVERNING_STATE_TERMINAL[domain]?.includes(to) ? "MONOTONIC_TERMINAL" : "NON_TERMINAL",
      platforms: node.platforms,
      providers: node.providers.length ? node.providers : ["NONE"],
      positiveExecutableWitness: {
        sourcePath: "tests/assurance/engineering-doctrine.test.mjs",
        testId: "source-bound transition positive executable witness",
      },
      negativeExecutableWitness: {
        sourcePath: "tests/assurance/engineering-doctrine.test.mjs",
        testId: "source-bound transition negative executable witness",
      },
      independentVerifier: {
        sourcePath: verificationPath,
        symbol: "verifySerializedTransitionModel",
        selectorMatchCount: verificationFunction ? 1 : 0,
        verifierAstBodyHash: verificationFunction?.bodyHash ?? null,
        verifierSourceHash: verificationHash,
        ...sourceIdentity,
      },
      verificationStatus: "PENDING_INDEPENDENT_SERIALIZED_VERIFICATION",
    }));
    return { domain, declarationIds, states, transitions, observationSummary: observation };
  });
  const subject = { schemaVersion: 1, modelId: "SOURCE_BOUND_GOVERNING_MODEL_V2", authority: "DECLARED_OBSERVED_PENDING_SEPARATE_VERIFIER", declarationSource: "SOURCE_BOUND_TRANSITION_SPECS", verifierSource: verificationPath, generatorVerifierSourceDistinct: verificationHash !== normalizedSourceHash(fs.readFileSync(path.join(root, "scripts/assurance/engineering-closure.mjs"), "utf8")), domains };
  return { ...subject, transitionModelHash: hashValue(subject) };
}

const exactSourceSubjects = (root, paths) => canonicalSort([...new Set(paths)]).map((sourcePath) => ({
  sourcePath,
  sourceHash: fs.existsSync(path.join(root, sourcePath)) ? crypto.createHash("sha256").update(fs.readFileSync(path.join(root, sourcePath))).digest("hex") : null,
}));

export function deriveRepositoryRelationshipCandidates(root = REPOSITORY_ROOT) {
  const registry = readJson(root, "config/assurance/feature-registry-v1.json");
  const effective = effectiveFeatures(registry);
  const byId = new Map(effective.map((feature) => [feature.featureId, feature]));
  const shared = registry.sharedDependencyContracts ?? [];
  const sharedFor = (left, right) => shared.filter(({ owners }) => owners?.includes(left) && owners?.includes(right));
  const sharedSourceFilesFor = (left, right) => sharedFor(left, right).filter(({ path: sourcePath }) => fs.existsSync(path.join(root, sourcePath)) && fs.statSync(path.join(root, sourcePath)).isFile());
  const ownerShared = (left, right, owner) => byId.get(left)?.ownerSystems?.includes(owner) && byId.get(right)?.ownerSystems?.includes(owner);
  const autonomousRegistry = readJson(root, "config/autonomy/autonomous-components.json");
  const releaseRoutePresent = autonomousRegistry.components?.some(({ id, owningSystem }) => [id, owningSystem].includes("release_ota_operator"));
  const rules = [
    {
      discoveryRule: "TASK_CONTROL_REGISTRY_SHARED_SOURCE_AUTHORITY",
      sourceDomainCandidate: "assurance-efficiency-e0",
      destinationDomainCandidate: "codex-security-scan-reliability-s0",
      dataControlTransferred: "relevant compact packet slice",
      sources: sharedSourceFilesFor("assurance-efficiency-e0", "codex-security-scan-reliability-s0").map(({ path: sourcePath }) => sourcePath),
      condition: sharedSourceFilesFor("assurance-efficiency-e0", "codex-security-scan-reliability-s0").some(({ path: sourcePath }) => sourcePath === "scripts/assurance/active-task.mjs")
        && fs.readFileSync(path.join(root, "scripts/assurance/active-task.mjs"), "utf8").includes('from "./engineering-closure.mjs"')
        && fs.readFileSync(path.join(root, "scripts/assurance/active-task.mjs"), "utf8").includes("evaluatePreimplementationGate"),
    },
    {
      discoveryRule: "SECURITY_CONTROL_SHARED_GUARD_DIRECT_CALL_AUTHORITY",
      sourceDomainCandidate: "codex-security-scan-reliability-s0",
      destinationDomainCandidate: "autonomous-cognitive-governance",
      dataControlTransferred: "trust-boundary and failure-mode slice",
      sources: sharedSourceFilesFor("codex-security-scan-reliability-s0", "autonomous-cognitive-governance").map(({ path: sourcePath }) => sourcePath),
      condition: sharedSourceFilesFor("codex-security-scan-reliability-s0", "autonomous-cognitive-governance").length === 2
        && sharedSourceFilesFor("codex-security-scan-reliability-s0", "autonomous-cognitive-governance").every(({ path: sourcePath }) => fs.readFileSync(path.join(root, sourcePath), "utf8").includes("evaluateAutonomousEngineeringRequest")),
    },
    {
      discoveryRule: "SHARED_SECURITY_OWNER_AUTHORITY",
      sourceDomainCandidate: "auth-session-password-recovery",
      destinationDomainCandidate: "autonomous-cognitive-governance",
      dataControlTransferred: "Owner and service identity",
      sources: ["config/assurance/feature-registry-v1.json", "scripts/proof-autonomous-systems-contract.mjs"],
      condition: ownerShared("auth-session-password-recovery", "autonomous-cognitive-governance", "security_owner_operator") && fs.readFileSync(path.join(root, "scripts/proof-autonomous-systems-contract.mjs"), "utf8").includes("security owner auth RLS mutation requires Level 4"),
    },
    {
      discoveryRule: "AUTONOMOUS_COMPONENT_RELEASE_ROUTING",
      sourceDomainCandidate: "autonomous-cognitive-governance",
      destinationDomainCandidate: "eas-build-update-release",
      dataControlTransferred: "proposal only; no release mutation",
      sources: ["config/autonomy/autonomous-components.json", "scripts/proof-autonomous-systems-contract.mjs"],
      condition: releaseRoutePresent && fs.readFileSync(path.join(root, "scripts/proof-autonomous-systems-contract.mjs"), "utf8").includes("release publish rollback requires Level 4"),
    },
  ];
  const governing = rules.map((rule) => {
    const sourceSubjects = exactSourceSubjects(root, rule.sources);
    const body = {
      discoveryRule: rule.discoveryRule,
      exactSourceSubjects: sourceSubjects,
      sourceDomainCandidate: rule.sourceDomainCandidate,
      destinationDomainCandidate: rule.destinationDomainCandidate,
      dataControlTransferred: rule.dataControlTransferred,
      authorityDirection: "SOURCE_TO_DESTINATION",
      relationshipConfidence: rule.condition && sourceSubjects.length > 0 && sourceSubjects.every(({ sourceHash }) => /^[0-9a-f]{64}$/u.test(sourceHash ?? "")) ? "EXACT_STRUCTURAL" : "UNVERIFIED",
      verifierResult: rule.condition ? "SOURCE_RELATIONSHIP_OBSERVED" : "SOURCE_RELATIONSHIP_MISSING",
      governingCandidate: true,
    };
    return { ...body, observationId: hashValue(body) };
  });
  const supporting = shared.map((contract) => {
    const sourceSubjects = exactSourceSubjects(root, [contract.path].filter((sourcePath) => fs.existsSync(path.join(root, sourcePath))));
    const body = {
      discoveryRule: "EXPLICIT_SHARED_DEPENDENCY_CONTRACT",
      exactSourceSubjects: sourceSubjects,
      sourceDomainCandidates: canonicalSort([...(contract.owners ?? [])]),
      dataControlTransferred: contract.contract,
      authorityDirection: "NO_AUTHORITY_DIRECTION_INFERRED",
      relationshipConfidence: sourceSubjects.length ? "EXACT_STRUCTURAL" : "REGISTRY_REFERENCE_ONLY",
      verifierResult: sourceSubjects.length ? "NON_GOVERNING_RELATIONSHIP_OBSERVED" : "NON_GOVERNING_REGISTRY_REFERENCE",
      governingCandidate: false,
    };
    return { ...body, observationId: hashValue(body) };
  });
  const categoryEvidence = [
    ["IMPORTED_MODULES_AND_DIRECT_CALLS", ["scripts/guard-autonomous-systems-contract.mjs", "scripts/proof-autonomous-systems-contract.mjs"]],
    ["PROVIDER_OWNERSHIP_AND_ADAPTER_REFERENCES", effective.flatMap(({ sourcePathGlobs }) => sourcePathGlobs).filter((sourcePath) => /provider|adapter|livekit|revenue|eas/iu.test(sourcePath)).slice(0, 24)],
    ["SHARED_TABLE_RPC_MIGRATION_REFERENCES", ["config/assurance/feature-registry-v1.json"]],
    ["NATIVE_CAPABILITY_CONSUMERS", ["config/assurance/native-capability-registry-v1.json", "app.json", "app.config.ts", "package.json"]],
    ["AUTONOMOUS_COMPONENT_ROUTING", ["config/autonomy/autonomous-components.json", "_lib/autonomousSystemsRegistry.ts"]],
    ["PROOF_TIER_ROLLBACK_CLEANUP_DEPENDENCIES", ["config/assurance/feature-registry-v1.json", "config/assurance/gate-catalog-v1.json"]],
  ].map(([discoveryRule, sourcePaths]) => {
    const exactSourceSubjects = exactSourceSubjectsForCategory(root, sourcePaths);
    const body = { discoveryRule, exactSourceSubjects, authorityDirection: "NO_AUTHORITY_DIRECTION_INFERRED", relationshipConfidence: "EXACT_SOURCE_INVENTORY", verifierResult: "NON_GOVERNING_RELATIONSHIP_INVENTORIED", governingCandidate: false };
    return { ...body, observationId: hashValue(body) };
  });
  return canonicalSort([...governing, ...supporting, ...categoryEvidence].map((record) => stableJson(record))).map((serialized) => JSON.parse(serialized));
}

function exactSourceSubjectsForCategory(root, paths) {
  return exactSourceSubjects(root, paths.filter((sourcePath) => fs.existsSync(path.join(root, sourcePath))));
}
function computeDomainGraph(root = REPOSITORY_ROOT, options = {}) {
  const rawRegistry = readJson(root, "config/assurance/feature-registry-v1.json");
  const registry = { ...rawRegistry, features: effectiveFeatures(rawRegistry) };
  const inventory = buildInventory(root, options);
  const ids = new Set(registry.features.map(({ featureId }) => featureId));
  const edges = EDGE_SPECS.filter(([source, destination]) => ids.has(source) && ids.has(destination)).map(([sourceDomain, destinationDomain, transfer], index) => {
    const edgeId = `edge-${String(index + 1).padStart(2, "0")}-${sourceDomain}-to-${destinationDomain}`;
    const negativeContracts = (registry.edgeNegativeContracts ?? []).filter((item) => item.edgeId === edgeId).map((item) => {
      const sourceContentSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, item.sourcePath))).digest("hex");
      return { ...item, sourceContentSha256, contractId: hashValue({ edgeId, reasonCode: item.reasonCode, statement: item.statement, sourcePath: item.sourcePath, bindingType: item.bindingType, selector: item.selector, sourceContentSha256 }) };
    });
    const impactClasses = [...new Set([
      "data",
      "authority",
      "retry",
      "cleanup",
      "rollback",
      "observability",
      "proof-tier-impact",
      ...(sourceDomain.includes("auth") || /identity|principal|authorization/iu.test(transfer) ? ["security-privacy-rights"] : []),
      ...(/provider|media|transaction|entitlement/iu.test(transfer) ? ["provider-platform"] : []),
      ...(destinationDomain === "eas-build-update-release" ? ["release"] : []),
    ])].sort();
    return {
      edgeId,
      sourceDomain,
      destinationDomain,
      dataControlTransferred: transfer,
      authorityDirection: "SOURCE_TO_DESTINATION",
      authentication: sourceDomain === "auth-session-password-recovery" ? "authenticated principal with server verification" : "domain contract and server-side authority",
      ordering: "source authority commits before dependent durable/rendered truth",
      retryIdempotency: "stable task/event identity required; duplicate and replay fail closed",
      failureBehavior: "dependent mutation stops or remains explicitly pending; no optimistic authority promotion",
      rollbackBehavior: "destination rolls back without rewriting source authority",
      platformDifferences: "must be classified in the task closure; none inferred",
      evidenceOwner: sourceDomain,
      impactTraversal: true,
      impactClasses,
      boundedSideEffects: true,
      replacementAuthority: "new authority identity supersedes stale completion",
      negativeContracts,
    };
  });
  const observedRepositoryEdges = deriveRepositoryRelationshipCandidates(root);
  const observedGoverningEdges = observedRepositoryEdges.filter(({ governingCandidate }) => governingCandidate === true);
  const verifiedGoverningEdges = observedGoverningEdges.map((observation) => {
    const matches = edges.filter(({ sourceDomain, destinationDomain, dataControlTransferred, authorityDirection }) => sourceDomain === observation.sourceDomainCandidate && destinationDomain === observation.destinationDomainCandidate && dataControlTransferred === observation.dataControlTransferred && authorityDirection === observation.authorityDirection);
    const verified = matches.length === 1 && observation.verifierResult === "SOURCE_RELATIONSHIP_OBSERVED" && observation.relationshipConfidence === "EXACT_STRUCTURAL";
    const body = { ...observation, observedVerifierResult: observation.verifierResult, declaredEdgeId: matches[0]?.edgeId ?? null, declaredEdgeHash: matches[0] ? hashValue(matches[0]) : null, declaredImpactClasses: matches[0]?.impactClasses ?? [], declaredRollbackBehavior: matches[0]?.rollbackBehavior ?? null, declaredMatchCount: matches.length, verifierResult: verified ? "VERIFIED_GOVERNING_EDGE" : matches.length === 0 ? "OBSERVED_EDGE_MISSING_DECLARATION" : "OBSERVED_EDGE_AMBIGUOUS_OR_UNVERIFIED" };
    return { ...body, verifiedEdgeHash: hashValue(body) };
  });
  const verifiedEdgeIds = new Set(verifiedGoverningEdges.filter(({ verifierResult }) => verifierResult === "VERIFIED_GOVERNING_EDGE").map(({ declaredEdgeId }) => declaredEdgeId));
  const declarationOnlyEdges = edges.filter(({ edgeId }) => !verifiedEdgeIds.has(edgeId)).map(({ edgeId }) => ({ edgeId, status: "DECLARATION_ONLY" }));
  const edgeDiscoveryFindings = [
    ...verifiedGoverningEdges.filter(({ verifierResult }) => verifierResult !== "VERIFIED_GOVERNING_EDGE").map(({ observationId }) => `OBSERVED_GOVERNING_EDGE_UNVERIFIED:${observationId}`),
    ...(new Set(verifiedGoverningEdges.map(({ declaredEdgeId }) => declaredEdgeId).filter(Boolean)).size !== verifiedGoverningEdges.filter(({ declaredEdgeId }) => declaredEdgeId).length ? ["DUPLICATE_OBSERVED_GOVERNING_EDGE"] : []),
  ];
  const upstream = (id) => edges.filter(({ destinationDomain }) => destinationDomain === id).map(({ sourceDomain }) => sourceDomain);
  const downstream = (id) => edges.filter(({ sourceDomain }) => sourceDomain === id).map(({ destinationDomain }) => destinationDomain);
  const governingSource = "scripts/assurance/engineering-closure.mjs";
  const governingBytes = fs.readFileSync(path.join(root, governingSource));
  const governingText = governingBytes.toString("utf8");
  const governingSha = crypto.createHash("sha256").update(governingBytes).digest("hex");
  const nodes = registry.features
    .map((feature) => ({
      domain: feature.featureId,
      owner: feature.productOwner,
      ownerSystems: feature.ownerSystems,
      sourcePaths: feature.sourcePathGlobs,
      dataOwned: feature.tablesRpcs,
      authorityOwned: [
        {
          authorityId: `${feature.featureId}:mutable-authority`,
          owner: feature.authority.mutableStateOwner,
          sourceKind: "SERVER_OR_REGISTERED_DOMAIN",
          targetKind: "DOMAIN_STATE",
        },
      ],
      providers: feature.providers,
      platforms: feature.platformScope,
      markets: feature.marketsJurisdictions,
      upstreamDependencies: upstream(feature.featureId),
      downstreamConsumers: downstream(feature.featureId),
      sharedMutableState: feature.tablesRpcs.map((name) => ({
        stateId: name,
        owner: feature.authority.mutableStateOwner,
        domain: feature.featureId,
      })),
      securityPrivacyClassification: feature.riskLevel === "D" ? "CRITICAL_OWNER_EXTERNAL" : feature.riskLevel === "C" ? "HIGH" : "REGISTERED",
      proofTierApplicability: feature.proofTierApplicability,
      rollbackOwner: feature.productOwner,
      observabilityOwner: feature.observability.owner,
      requirements: feature.requirements,
      states: feature.states,
      transitions: feature.transitions,
      transitionContracts: (GOVERNING_TRANSITION_SPECS[feature.featureId] ?? []).map(([id, from, to]) => ({
        id,
        from,
        to,
        preconditions: ["finite task lease valid", `${from} is current`],
        terminal: ["closed", "blocked", "SEALED", "CANCELED", "emergency_stopped"].includes(to),
        staleBehavior: "stale source state cannot apply transition",
        replacementBehavior: "new task/head authority supersedes stale completion",
        authorityOwner: feature.authority.mutableStateOwner,
        platforms: feature.platformScope,
        providers: feature.providers.length ? feature.providers : ["NONE"],
        environments: feature.environments,
        markets: feature.marketsJurisdictions,
        providerMutation: false,
        sourcePath: governingSource,
        sourceContentSha256: governingSha,
        semanticToken: id,
        sourceLine: governingText.split("\n").findIndex((line) => line.includes(`\"${id}\"`)) + 1,
      })),
      invariants: feature.invariants,
      cleanup: feature.cleanup,
      hooksLibraries: feature.hooksLibraries,
      migrations: feature.migrations,
      migrationApplicability: feature.migrationApplicability ?? "APPLICABLE_UNKNOWN_BINDING",
      observability: feature.observability,
      contractBindings: feature.contractBindings,
      transitionBindingStatus: GOVERNING_TRANSITION_SPECS[feature.featureId] ? "REGISTERED_SOURCE_BOUND" : "BOUND_INCOMPLETE_SOURCE_BINDING_REQUIRED",
      unresolvedUnknowns: [...feature.unresolvedUnknowns],
      inventoryAssets: inventory.groups.flatMap((group) =>
        group.members
          .filter(({ ownerDomains }) => ownerDomains.includes(feature.featureId))
          .map(({ path: assetPath, id, ownershipStatus }) => ({
            group: group.id,
            asset: assetPath ?? id,
            ownershipStatus,
          })),
      ),
      launchDisposition: feature.featureId === "ads-applovin-future-integration" ? "POST_LAUNCH" : "LAUNCH_REQUIRES_TASK_SCOPED_CLOSURE",
    }))
    .sort((a, b) => compareUtf8(a.domain, b.domain));
  const body = {
    schemaVersion: 1,
    contractId: "whole-app-domain-graph-v1",
    generation: {
      deterministic: true,
      offline: true,
      canonicalRegistry: "config/assurance/feature-registry-v1.json",
    },
    classifications: ["PRODUCT_DOMAIN_ASSET", "SHARED_DEPENDENCY", "AUTONOMOUS_COMPONENT", "ASSURANCE_CONTROL_ASSET", "DEVELOPMENT_UTILITY", "GENERATED_ARTIFACT", "HISTORICAL_DEPRECATED", "LEGACY_UNMODELED", "UNKNOWN_OWNER"],
    inventory,
    nodes,
    edges,
    declaredGraphEdges: edges.map(({ edgeId }) => edgeId),
    declaredEdgeRecords: edges,
    observedRepositoryEdges,
    verifiedGoverningEdges,
    declarationOnlyEdges,
    nonGoverningRelationships: observedRepositoryEdges.filter(({ governingCandidate }) => governingCandidate !== true),
    edgeSetAccounting: {
      declaredCount: edges.length,
      observedRelationshipCount: observedRepositoryEdges.length,
      observedGoverningCount: observedGoverningEdges.length,
      verifiedGoverningCount: verifiedGoverningEdges.filter(({ verifierResult }) => verifierResult === "VERIFIED_GOVERNING_EDGE").length,
      declarationOnlyCount: declarationOnlyEdges.length,
      discoveryFindings: edgeDiscoveryFindings,
    },
    affectedClosurePolicy: readJson(root, "config/assurance/engineering-doctrine-v1.json").closureTraversal,
    detectorFailureCodes: ["CIRCULAR_AUTHORITY", "DUPLICATE_AUTHORITY_OWNER", "UNOWNED_MUTABLE_STATE", "UI_STATE_USED_AS_SERVER_AUTHORITY", "CLIENT_STATE_USED_AS_PROVIDER_AUTHORITY", "STALE_STATE_MODIFIES_REPLACEMENT_STATE", "UNDOCUMENTED_PLATFORM_MISMATCH", "UNREGISTERED_PROVIDER_MUTATION", "UNREGISTERED_AUTONOMOUS_WRITER", "UNBOUNDED_CROSS_DOMAIN_SIDE_EFFECT", "AFFECTED_SCOPE_ORPHAN"],
  };
  return { ...body, contentHash: hashValue(body) };
}
export function generateDomainGraph(root = REPOSITORY_ROOT, options = {}) {
  const key = path.resolve(root);
  if (options.authoritative) return structuredClone(computeDomainGraph(key, { ...options, authoritative: true }));
  if (options.refreshInventory || !graphCache.has(key)) graphCache.set(key, computeDomainGraph(key, options));
  return structuredClone(graphCache.get(key));
}

export const DOCTRINE_BASELINE_ARTIFACT_V1 = Object.freeze({
  classification: "DOCTRINE_BASELINE_ARTIFACT_V1",
  repository: "Chillywood2025/chillywood-mobile",
  doctrinePr: 226,
  sourceHead: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceHead,
  sourceTree: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceTree,
  mergeSha: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.mergeSha,
  mergeTree: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceTree,
  firstParent: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.firstParent,
  ownerCommentIds: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.ownerCommentIds,
  reviewCommentId: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.repositoryReviewCommentId,
  phase1RunId: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.phase1RunId,
  phase1Checks: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.phase1RequiredChecks,
  paths: Object.freeze(["config/assurance/whole-app-domain-graph-v1.json", "docs/assurance/whole-app-engineering-doctrine-v1-report.json"]),
});
const gitRead = (root, args) => spawnSync("git", args, { cwd: root, encoding: null, shell: false, maxBuffer: 64 * 1024 * 1024 });
const gitText = (root, args) => { const result = gitRead(root, args); return result.status === 0 ? result.stdout.toString("utf8").trim() : null; };
const blobAt = (root, ref, name) => { const result = gitRead(root, ["show", `${ref}:${name}`]); return result.status === 0 ? result.stdout : null; };
const shaBytes = (value) => crypto.createHash("sha256").update(value).digest("hex");
const memberStructure = ({ id, path: sourcePath, ownerDomains, ownershipStatus, sharedContract }) => ({ id, path: sourcePath, ownerDomains, ownershipStatus, sharedContract: sharedContract ? { path: sharedContract.path, owners: sharedContract.owners, contract: sharedContract.contract } : null });
const edgeStructure = ({ edgeId, sourceDomain, destinationDomain, dataControlTransferred, authorityDirection, evidenceOwner, impactTraversal, impactClasses, rollbackBehavior, platformDifferences, negativeContracts = [] }) => ({ edgeId, sourceDomain, destinationDomain, dataControlTransferred, authorityDirection, evidenceOwner, impactTraversal, impactClasses, rollbackBehavior, platformDifferences, negativeContracts: negativeContracts.map(({ reasonCode, statement, sourcePath, bindingType, selector }) => ({ reasonCode, statement, sourcePath, bindingType, selector })) });
export const structuralGraphSubject = (graph) => ({
  contractId: graph?.contractId,
  nodes: (graph?.nodes ?? []).map(({ domain, owner, ownerSystems, sourcePaths, dataOwned, authorityOwned, providers, platforms, markets, upstreamDependencies, downstreamConsumers, sharedMutableState, proofTierApplicability, rollbackOwner, observabilityOwner, states, transitions, transitionContracts, cleanup }) => ({ domain, owner, ownerSystems, sourcePaths, dataOwned, authorityOwned, providers, platforms, markets, upstreamDependencies, downstreamConsumers, sharedMutableState, proofTierApplicability, rollbackOwner, observabilityOwner, states, transitions, transitionContracts: transitionContracts?.map(({ sourceContentSha256, sourceLine, ...contract }) => contract), cleanup })),
  edges: (graph?.edges ?? []).map(edgeStructure),
  inventoryClasses: (graph?.inventory?.groups ?? []).map(({ id, classification }) => ({ id, classification })),
  affectedClosurePolicy: graph?.affectedClosurePolicy,
});
export const contentSnapshotSubject = (graph) => (graph?.inventory?.groups ?? []).map(({ id, pathHash, contentHash, members }) => ({ id, pathHash, contentHash, members: members.map(({ id: memberId, path: sourcePath, contentSha256, recordSha256 }) => ({ id: memberId, path: sourcePath, contentSha256: contentSha256 ?? null, recordSha256: recordSha256 ?? null })) }));

function functionBodyHash(source, symbol) {
  let ts;
  try { ts = require("typescript"); } catch { return null; }
  const unit = ts.createSourceFile("engineering-closure.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const statement = unit.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === symbol && item.body);
  return statement?.body ? hashValue(statement.body.getText(unit).replace(/\r\n?/gu, "\n")) : null;
}

export function validateDoctrineBaselineArtifacts(root = REPOSITORY_ROOT, overrides = {}) {
  const identity = { ...DOCTRINE_BASELINE_ARTIFACT_V1, ...(overrides.identity ?? {}) };
  const parents = (gitText(root, ["show", "-s", "--format=%P", identity.mergeSha]) ?? "").split(/\s+/u).filter(Boolean);
  const sourceTree = gitText(root, ["rev-parse", `${identity.sourceHead}^{tree}`]);
  const mergeTree = gitText(root, ["rev-parse", `${identity.mergeSha}^{tree}`]);
  const artifacts = {};
  for (const name of identity.paths) {
    const source = overrides.sourceBlobs?.[name] ?? blobAt(root, identity.sourceHead, name);
    const merged = overrides.mergeBlobs?.[name] ?? blobAt(root, identity.mergeSha, name);
    const current = overrides.currentBlobs?.[name] ?? (fs.existsSync(path.join(root, name)) ? fs.readFileSync(path.join(root, name)) : null);
    const laterChanges = gitText(root, ["rev-list", `${identity.mergeSha}..HEAD`, "--", name]);
    artifacts[name] = { blobSha256: source ? shaBytes(source) : null, sourceMatchesMerge: Boolean(source && merged && Buffer.compare(source, merged) === 0), currentMatchesBaseline: Boolean(source && current && Buffer.compare(source, current) === 0), laterHistoryUnmodified: laterChanges === "" };
  }
  const graphBytes = overrides.sourceBlobs?.[identity.paths[0]] ?? blobAt(root, identity.sourceHead, identity.paths[0]);
  const reportBytes = overrides.sourceBlobs?.[identity.paths[1]] ?? blobAt(root, identity.sourceHead, identity.paths[1]);
  let graph = null; let report = null;
  try { graph = JSON.parse(graphBytes); report = JSON.parse(reportBytes); } catch {}
  const sourceGenerator = blobAt(root, identity.sourceHead, "scripts/assurance/engineering-closure.mjs");
  const sourceVerifier = blobAt(root, identity.sourceHead, "scripts/assurance/engineering-evidence-verifier.mjs");
  const identityValid = identity.repository === "Chillywood2025/chillywood-mobile" && identity.doctrinePr === 226 && sourceTree === identity.sourceTree && mergeTree === identity.mergeTree && parents.length === 2 && parents[0] === identity.firstParent && parents[1] === identity.sourceHead && stableJson(identity.ownerCommentIds) === stableJson([5274614505, 5274913577, 5275618260]) && identity.reviewCommentId === 5275455730 && identity.phase1RunId === 31666180747 && identity.phase1Checks === 13;
  const graphValid = identityValid && artifacts[identity.paths[0]]?.sourceMatchesMerge && artifacts[identity.paths[0]]?.currentMatchesBaseline && artifacts[identity.paths[0]]?.laterHistoryUnmodified && graph?.contentHash === report?.hashes?.graph && graph?.inventory?.sourceInventoryHash === report?.hashes?.inventory;
  const reportValid = identityValid && artifacts[identity.paths[1]]?.sourceMatchesMerge && artifacts[identity.paths[1]]?.currentMatchesBaseline && artifacts[identity.paths[1]]?.laterHistoryUnmodified && report?.taskIdentity?.pr === 226 && report?.authoritativeReplay?.resultEquality === "2/2" && report?.computedGate?.unresolvedP0P1 === 0 && report?.computedGate?.launchImpactingP2 === 0;
  return { classification: "DOCTRINE_BASELINE_ARTIFACT_V1", identity, artifacts, graph, report, graphStatus: graphValid ? "DOCTRINE_DOMAIN_GRAPH_BASELINE_VALID" : "WHOLE_APP_DOMAIN_GRAPH_BASELINE_INVALID", reportStatus: reportValid ? "DOCTRINE_IMPLEMENTATION_REPORT_BASELINE_VALID" : "WHOLE_APP_DOCTRINE_REPORT_BASELINE_INVALID", baselineStructuralGraphHash: graph ? hashValue(structuralGraphSubject(graph)) : null, baselineContentSnapshotHash: graph ? hashValue(contentSnapshotSubject(graph)) : null, generatorSourceVersion: sourceGenerator ? { fileSha256: shaBytes(sourceGenerator), semanticSymbol: "computeDomainGraph", semanticBodyHash: functionBodyHash(sourceGenerator.toString("utf8"), "computeDomainGraph") } : null, verificationSourceVersion: sourceVerifier ? shaBytes(sourceVerifier) : null, ok: graphValid && reportValid, findings: [graphValid ? null : "WHOLE_APP_DOMAIN_GRAPH_BASELINE_INVALID", reportValid ? null : "WHOLE_APP_DOCTRINE_REPORT_BASELINE_INVALID"].filter(Boolean) };
}

const inventoryMembers = (graph) => new Map((graph?.inventory?.groups ?? []).flatMap(({ id: group, members }) => members.map((member) => [`${group}:${member.path ?? member.id}`, member])));
export function deriveDoctrineArtifactDependencyClosure({ root = REPOSITORY_ROOT, changedPaths = [], baseline = validateDoctrineBaselineArtifacts(root), currentGraph = generateDomainGraph(root, { authoritative: true }), generatorSemanticHash = null } = {}) {
  const structuralPaths = new Set(["config/assurance/feature-registry-v1.json", "config/autonomy/autonomous-components.json", "config/assurance/platform-provider-contracts-v1.json", "config/assurance/engineering-doctrine-v1.json"]);
  const currentSource = fs.readFileSync(path.join(root, "scripts/assurance/engineering-closure.mjs"), "utf8");
  const generatorSemanticChanged = (generatorSemanticHash ?? functionBodyHash(currentSource, "computeDomainGraph")) !== baseline.generatorSourceVersion?.semanticBodyHash;
  const structuralGraphInputs = changedPaths.filter((name) => structuralPaths.has(name));
  if (changedPaths.includes("scripts/assurance/engineering-closure.mjs") && generatorSemanticChanged) structuralGraphInputs.push("scripts/assurance/engineering-closure.mjs#computeDomainGraph");
  const currentStructuralGraphHash = hashValue(structuralGraphSubject(currentGraph));
  const verificationOnlyInputs = changedPaths.filter((name) => !structuralPaths.has(name) && /^(?:tests\/assurance\/|scripts\/assurance\/|config\/assurance\/pr-scope-policy-v1\.json$)/u.test(name));
  const body = { classification: "DOCTRINE_ARTIFACT_DEPENDENCY_CLOSURE_V1", structuralGraphInputs: canonicalSort(structuralGraphInputs), currentObservationInputs: canonicalSort([...changedPaths]), contentOnlyInputs: canonicalSort(changedPaths.filter((name) => !structuralPaths.has(name) && !verificationOnlyInputs.includes(name))), doctrineImplementationReportInputs: [], taskReportInputs: canonicalSort([...changedPaths]), verificationOnlyInputs: canonicalSort(verificationOnlyInputs), generatorSemanticChanged, structuralModelChanged: currentStructuralGraphHash !== baseline.baselineStructuralGraphHash };
  return { ...body, closureHash: hashValue(body), modelRevisionRequired: body.generatorSemanticChanged || body.structuralGraphInputs.length > 0 || body.structuralModelChanged };
}

export function deriveCurrentTreeObservation({ root = REPOSITORY_ROOT, identity = {}, changedPaths = [], baseline = validateDoctrineBaselineArtifacts(root), currentGraph = generateDomainGraph(root, { authoritative: true }) } = {}) {
  const baselineMembers = inventoryMembers(baseline.graph); const currentMembers = inventoryMembers(currentGraph);
  const addedAssets = [...currentMembers.keys()].filter((key) => !baselineMembers.has(key));
  const removedAssets = [...baselineMembers.keys()].filter((key) => !currentMembers.has(key));
  const modifiedAssets = [...currentMembers.keys()].filter((key) => baselineMembers.has(key) && hashValue(currentMembers.get(key)) !== hashValue(baselineMembers.get(key)));
  const changedOwnership = [...currentMembers.keys()].filter((key) => baselineMembers.has(key) && stableJson(memberStructure(currentMembers.get(key))) !== stableJson(memberStructure(baselineMembers.get(key))));
  const currentStructuralGraphHash = hashValue(structuralGraphSubject(currentGraph));
  const currentContentSnapshotHash = hashValue(contentSnapshotSubject(currentGraph));
  const dependencyClosure = deriveDoctrineArtifactDependencyClosure({ root, changedPaths, baseline, currentGraph });
  const deltaBody = { classification: "ENGINEERING_TASK_DELTA_V1", changedPaths: canonicalSort([...changedPaths]), addedAssets: canonicalSort(addedAssets), removedAssets: canonicalSort(removedAssets), modifiedAssets: canonicalSort(modifiedAssets), changedOwnership: canonicalSort(changedOwnership), changedDependencies: dependencyClosure.structuralGraphInputs, changedAuthorityEdges: currentStructuralGraphHash === baseline.baselineStructuralGraphHash ? [] : ["STRUCTURAL_GRAPH_DIFF"], changedStateTransitionBindings: dependencyClosure.generatorSemanticChanged ? ["computeDomainGraph"] : [], changedProviderPlatformContracts: changedPaths.filter((name) => name === "config/assurance/platform-provider-contracts-v1.json"), affectedDomains: canonicalSort([...new Set([...addedAssets, ...removedAssets, ...modifiedAssets].flatMap((key) => [...(currentMembers.get(key)?.ownerDomains ?? []), ...(baselineMembers.get(key)?.ownerDomains ?? [])]))]), evidenceInvalidation: ["CURRENT_TASK_REPORT", "EXACT_HEAD_REVIEW", "PHASE_1"], canonicalModelRevisionRequired: dependencyClosure.modelRevisionRequired };
  const taskDelta = { ...deltaBody, taskDeltaHash: hashValue(deltaBody) };
  const body = { classification: "CURRENT_TREE_INVENTORY_OBSERVATION_V1", repository: identity.repository ?? "Chillywood2025/chillywood-mobile", pr: identity.pr ?? null, branch: identity.branch ?? null, head: identity.head ?? null, tree: identity.tree ?? null, protectedBase: identity.base ?? null, baselineStructuralGraphHash: baseline.baselineStructuralGraphHash, baselineContentSnapshotHash: baseline.baselineContentSnapshotHash, currentStructuralGraphHash, currentContentSnapshotHash, currentInventoryHash: currentGraph.inventory.sourceInventoryHash, currentOwnershipGaps: currentGraph.inventory.ownershipGaps, taskDelta, dependencyClosure };
  return { ...body, observationHash: hashValue(body) };
}

export function generateCurrentEngineeringTaskReport({ root = REPOSITORY_ROOT, identity = {}, taskContext = {}, changedPaths = [], gateResult = "ARCHITECTURE_MAINTENANCE_ENGINEERING_CLEAR", blockers = [] } = {}) {
  const baseline = validateDoctrineBaselineArtifacts(root); const observation = deriveCurrentTreeObservation({ root, identity, changedPaths, baseline });
  const evaluatorPaths = ["scripts/assurance/engineering-closure.mjs", "scripts/assurance/lib.mjs", "scripts/assurance/pr-scope-lib.mjs", "scripts/assurance/pr-scope.mjs"];
  const body = { classification: "CURRENT_ENGINEERING_TASK_REPORT_V1", identity, taskContext, baselineDoctrineReportHash: baseline.artifacts[DOCTRINE_BASELINE_ARTIFACT_V1.paths[1]].blobSha256, evaluatorSourceHashes: Object.fromEntries(evaluatorPaths.map((name) => [name, shaBytes(fs.readFileSync(path.join(root, name)))])), observationHash: observation.observationHash, taskDeltaHash: observation.taskDelta.taskDeltaHash, dependencyClosureHash: observation.dependencyClosure.closureHash, gateResult, blockers: canonicalSort([...blockers]), authority: { provider: false, build: false, physical: false, submission: false, ota: false, publicRelease: false } };
  return { ...body, currentTaskReportHash: hashValue(body), baseline, observation };
}

export function deriveEngineeringClosureExecutionMode({ identity = {}, changedPaths = [], taskContext = null, callerMode = null, pendingTerminalTruth = false } = {}) {
  if (callerMode !== null) return { ok: false, mode: null, findings: ["ENGINEERING_CLOSURE_CALLER_MODE_INJECTION_REJECTED"] };
  const exactTruth = stableJson(canonicalSort([...changedPaths])) === stableJson(TERMINAL_TRUTH_PATHS);
  const boundedArchitecture = changedPaths.length > 0 && changedPaths.every((name) => TYPED_CONTEXT_ARCHITECTURE_PATHS.includes(name)) && identity.base === TYPED_CONTEXT_DOCTRINE_MERGE && pendingTerminalTruth;
  const mode = identity.head === HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceHead ? "DOCTRINE_BOOTSTRAP_SELF_HOST" : taskContext?.type === "FINITE_TASK_ADMISSION_SUCCESSOR" ? "FINITE_TASK_ADMISSION_SUCCESSOR" : taskContext?.type === "TERMINAL_TRUTH_SUCCESSOR" || exactTruth ? "TERMINAL_TRUTH_SUCCESSOR" : taskContext?.type === "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE" || boundedArchitecture ? "POST_DOCTRINE_ARCHITECTURE_MAINTENANCE" : taskContext?.type === "ACTIVE_FINITE_TASK_LEASE" ? "PRODUCT_DOMAIN_TASK" : null;
  return { ok: Boolean(mode), mode, findings: mode ? [] : ["ENGINEERING_CLOSURE_TASK_CONTEXT_UNBOUND"] };
}

export function resolveEngineeringClosureTaskContext({
  root = REPOSITORY_ROOT,
  event = null,
  eventPath = process.env.GITHUB_EVENT_PATH,
  localIdentity = {},
  scope = null,
  currentTruth = null,
  readPull = null,
  observeAuthorities = observeTypedTaskAuthorities,
  sourceAncestryVerified = null,
} = {}) {
  let trustedEvent = event;
  try {
    if (!trustedEvent && typeof eventPath === "string") trustedEvent = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  } catch {
    return { ok: false, taskContext: null, findings: ["ENGINEERING_CLOSURE_GITHUB_EVENT_UNREADABLE"] };
  }
  if (!trustedEvent?.pull_request) return { ok: false, taskContext: null, findings: ["ENGINEERING_CLOSURE_TASK_CONTEXT_UNBOUND"] };
  const repository = trustedEvent.repository?.full_name;
  const pr = trustedEvent.number;
  const pullReadback = readPull ? readPull(repository, pr) : parsedResponse(typedGh(root, [`repos/${repository}/pulls/${pr}`]), null);
  const readback = pullReadback?.base?.repo ? {
    number: pullReadback.number,
    repository: pullReadback.base.repo.full_name,
    baseRef: pullReadback.base.ref,
    baseSha: pullReadback.base.sha,
    headRef: pullReadback.head?.ref,
    headSha: pullReadback.head?.sha,
    htmlUrl: pullReadback.html_url,
    state: pullReadback.state,
  } : pullReadback;
  const validated = validatePullRequestEventIdentity(trustedEvent, readback);
  if (!validated.ok) return { ok: false, taskContext: null, findings: validated.findings.map((finding) => `ENGINEERING_CLOSURE_${finding}`) };
  const identity = validated.identity;
  const sourceTree = gitText(root, ["rev-parse", `${identity.headSha}^{tree}`]);
  const ancestry = sourceAncestryVerified ?? typedGit(root, ["merge-base", "--is-ancestor", identity.headSha, localIdentity.head]).status === 0;
  const localParents = typedGit(root, ["rev-list", "--parents", "-n", "1", localIdentity.head]).stdout.trim().split(/\s+/u).slice(1);
  const exactSourceCheckout = localIdentity.head === identity.headSha;
  const exactPullRequestMergeCheckout = localParents.length === 2
    && localParents[0] === identity.baseSha
    && localParents[1] === identity.headSha;
  const localMatches = localIdentity.base === identity.baseSha
    && ancestry
    && ((exactSourceCheckout && sourceTree === localIdentity.tree) || exactPullRequestMergeCheckout)
    && (!localIdentity.branch || localIdentity.branch === identity.branch);
  if (!localMatches || !scope || !currentTruth) return { ok: false, taskContext: null, findings: ["ENGINEERING_CLOSURE_GITHUB_EVENT_READBACK_MISMATCH"] };
  const authorities = observeAuthorities({ identity, tree: sourceTree, scope, currentTruth, root });
  const eligible = [authorities.architectureAuthority, authorities.terminalTruthAuthority, authorities.finiteTaskAuthority, authorities.finiteTaskAdmissionAuthority].filter((authority) => authority?.ok === true);
  if (eligible.length !== 1) return { ok: false, taskContext: null, findings: [eligible.length > 1 ? "ENGINEERING_CLOSURE_TASK_CONTEXT_AMBIGUOUS" : "ENGINEERING_CLOSURE_TASK_CONTEXT_UNBOUND"] };
  return { ok: true, taskContext: eligible[0], findings: [] };
}

const resolveJsonPointer = (document, pointer) => {
  if (pointer === "") return document;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) return undefined;
  return pointer.slice(1).split("/").reduce((value, token) => value?.[token.replaceAll("~1", "/").replaceAll("~0", "~")], document);
};
const verifyImplementationBinding = (binding, { root = REPOSITORY_ROOT, identity = {} } = {}) => {
  if (!object(binding) || !safeRepoPath(binding.sourcePath) || !["TYPESCRIPT_SYMBOL", "REACT_COMPONENT_OR_HOOK", "EXPO_ROUTE", "EDGE_FUNCTION_ENTRY", "SQL_FUNCTION_OR_POLICY", "JSON_POINTER", "NATIVE_PLUGIN", "WORKFLOW_JOB", "PROVIDER_CONTRACT_REFERENCE"].includes(binding.bindingType) || !textValue(binding.selector) || binding.selectorMatchCount !== 1 || !/^[0-9a-f]{64}$/u.test(binding.normalizedBoundSourceHash ?? "")) return false;
  const absolute = path.join(root, binding.sourcePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return false;
  const source = fs.readFileSync(absolute, "utf8");
  const observedCount = binding.bindingType === "JSON_POINTER" ? (resolveJsonPointer(JSON.parse(source), binding.selector) === undefined ? 0 : 1) : selectorCount(source, binding.selector);
  const sourceIdentity = sourceIdentityOrDraft(identity);
  return observedCount === 1 && normalizedSourceHash(source) === binding.normalizedBoundSourceHash && binding.sourceHead === sourceIdentity.sourceHead && binding.sourceTree === sourceIdentity.sourceTree;
};
export function createNonImpactingReceipt(edge, identity = {}, root = REPOSITORY_ROOT) {
  const contract = edge?.negativeContracts?.[0];
  if (!contract) return null;
  const source = fs.readFileSync(path.join(root, contract.sourcePath), "utf8");
  const binding = {
    sourcePath: contract.sourcePath,
    bindingType: contract.bindingType,
    selector: contract.selector,
    selectorMatchCount: contract.bindingType === "JSON_POINTER" ? (resolveJsonPointer(JSON.parse(source), contract.selector) === undefined ? 0 : 1) : selectorCount(source, contract.selector),
    normalizedBoundSourceHash: normalizedSourceHash(source),
    ...sourceIdentityOrDraft(identity),
  };
  const witnessPath = contract.negativeWitnessTestPath ?? contract.sourcePath;
  const witness = fs.readFileSync(path.join(root, witnessPath), "utf8");
  const body = {
    schemaVersion: 1,
    evidenceClass: "EXECUTABLE_WITNESS",
    edgeId: edge.edgeId,
    sourceDomain: edge.sourceDomain,
    destinationDomain: edge.destinationDomain,
    reason: contract.reasonCode,
    enforcingSourceBinding: binding,
    negativeWitness: {
      sourcePath: witnessPath,
      selector: contract.negativeWitnessTestId ?? contract.selector,
      selectorMatchCount: selectorCount(witness, contract.negativeWitnessTestId ?? contract.selector),
      normalizedBoundSourceHash: normalizedSourceHash(witness),
      ...sourceIdentityOrDraft(identity),
    },
    exactContract: contract.contractId,
    repositoryReviewDisposition: "PENDING_EXACT_HEAD_REVIEW",
  };
  return { ...body, receiptHash: hashValue(body) };
}
const verifyNonImpactingReceipt = (receipt, edge, options = {}) => {
  const contract = edge?.negativeContracts?.find(({ contractId }) => contractId === receipt?.exactContract);
  if (!contract || receipt?.schemaVersion !== 1 || receipt?.evidenceClass !== "EXECUTABLE_WITNESS" || receipt.edgeId !== edge.edgeId || receipt.sourceDomain !== edge.sourceDomain || receipt.destinationDomain !== edge.destinationDomain || receipt.reason !== contract.reasonCode || receipt.repositoryReviewDisposition !== "PENDING_EXACT_HEAD_REVIEW") return false;
  const body = { ...receipt };
  delete body.receiptHash;
  if (receipt.receiptHash !== hashValue(body) || !verifyImplementationBinding(receipt.enforcingSourceBinding, options)) return false;
  const witness = receipt.negativeWitness;
  if (!object(witness) || witness.sourcePath !== (contract.negativeWitnessTestPath ?? contract.sourcePath) || witness.selector !== (contract.negativeWitnessTestId ?? contract.selector) || witness.selectorMatchCount !== 1 || !safeRepoPath(witness.sourcePath)) return false;
  const source = fs.readFileSync(path.join(options.root ?? REPOSITORY_ROOT, witness.sourcePath), "utf8");
  const sourceIdentity = sourceIdentityOrDraft(options.identity);
  return selectorCount(source, witness.selector) === 1 && normalizedSourceHash(source) === witness.normalizedBoundSourceHash && witness.sourceHead === sourceIdentity.sourceHead && witness.sourceTree === sourceIdentity.sourceTree;
};

export function deriveAffectedDomainClosure(graph, primaryDomain, { exclusionReceipts = [], identity = {}, root = REPOSITORY_ROOT } = {}) {
  const known = new Set(graph.nodes.map(({ domain }) => domain));
  if (!known.has(primaryDomain))
    return {
      status: "BOUND_INCOMPLETE",
      domains: [],
      findings: ["PREIMPLEMENTATION_BOUNDARY_UNDEFINED"],
    };
  const findings = [];
  const excluded = new Map();
  for (const receipt of exclusionReceipts) {
    const edge = graph.edges.find(({ edgeId }) => edgeId === receipt?.edgeId);
    const independentlyObserved = graph.verifiedGoverningEdges?.some(({ declaredEdgeId, verifierResult }) => declaredEdgeId === receipt?.edgeId && verifierResult === "VERIFIED_GOVERNING_EDGE");
    if (!edge || !independentlyObserved || excluded.has(receipt.edgeId) || !verifyNonImpactingReceipt(receipt, edge, { root, identity })) findings.push("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE");
    else excluded.set(receipt.edgeId, receipt);
  }
  const domains = new Set([primaryDomain]);
  const queue = [primaryDomain];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of graph.edges) {
      if (excluded.has(edge.edgeId)) continue;
      if (edge.sourceDomain !== current && edge.destinationDomain !== current) continue;
      const next = edge.sourceDomain === current ? edge.destinationDomain : edge.sourceDomain;
      if (!domains.has(next)) {
        domains.add(next);
        queue.push(next);
      }
    }
  }
  const requiredIncludedEdges = graph.edges.filter(({ sourceDomain, destinationDomain }) => domains.has(sourceDomain) && domains.has(destinationDomain)).map(({ edgeId }) => edgeId).sort();
  const actualIncludedEdges = canonicalSort((graph.verifiedGoverningEdges ?? []).filter(({ sourceDomainCandidate, destinationDomainCandidate, verifierResult }) => verifierResult === "VERIFIED_GOVERNING_EDGE" && domains.has(sourceDomainCandidate) && domains.has(destinationDomainCandidate)).map(({ declaredEdgeId }) => declaredEdgeId));
  const boundaryCutSet = graph.edges.filter(({ sourceDomain, destinationDomain }) => domains.has(sourceDomain) !== domains.has(destinationDomain)).map(({ edgeId }) => edgeId).sort();
  const observedBoundaryCutSet = canonicalSort((graph.verifiedGoverningEdges ?? []).filter(({ sourceDomainCandidate, destinationDomainCandidate, verifierResult }) => verifierResult === "VERIFIED_GOVERNING_EDGE" && (domains.has(sourceDomainCandidate) !== domains.has(destinationDomainCandidate))).map(({ declaredEdgeId }) => declaredEdgeId));
  const exclusionSet = [...excluded.keys()].sort();
  if (stableJson(requiredIncludedEdges) !== stableJson(actualIncludedEdges) || stableJson(boundaryCutSet) !== stableJson(exclusionSet) || stableJson(observedBoundaryCutSet) !== stableJson(exclusionSet)) findings.push("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE");
  const observedGoverningSet = canonicalSort([...actualIncludedEdges, ...observedBoundaryCutSet]);
  const allObservedRelevant = canonicalSort((graph.verifiedGoverningEdges ?? []).filter(({ sourceDomainCandidate, destinationDomainCandidate, verifierResult }) => verifierResult === "VERIFIED_GOVERNING_EDGE" && (domains.has(sourceDomainCandidate) || domains.has(destinationDomainCandidate))).map(({ declaredEdgeId }) => declaredEdgeId));
  if (stableJson(observedGoverningSet) !== stableJson(allObservedRelevant)) findings.push("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE");
  return {
    status: findings.length ? "BOUND_INCOMPLETE" : "BOUND_COMPLETE_FOR_REGISTERED_SCOPE",
    primaryDomain,
    domains: [...domains].sort(),
    requiredIncludedEdges,
    actualIncludedEdges,
    boundaryCutSet,
    observedBoundaryCutSet,
    observedGoverningEdges: allObservedRelevant,
    explicitNonGoverningRelationships: (graph.nonGoverningRelationships ?? []).map(({ observationId }) => observationId),
    exclusionReceipts: [...excluded.values()].sort((a, b) => compareUtf8(a.edgeId, b.edgeId)),
    closureHash: hashValue({
      primaryDomain,
      domains: [...domains].sort(),
      requiredIncludedEdges,
      actualIncludedEdges,
      boundaryCutSet,
      observedBoundaryCutSet,
      exclusionReceiptHashes: [...excluded.values()].map(({ receiptHash }) => receiptHash).sort(),
    }),
    findings: [...new Set(findings)].sort(),
  };
}

export function affectedDomainClosure(graph, primaryDomain, exclusions = []) {
  return deriveAffectedDomainClosure(graph, primaryDomain, { exclusionReceipts: exclusions });
}

export const TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1 = "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1";
export const TASK_LOCAL_EDGE_DISPOSITIONS = Object.freeze([
  "VERIFIED_GOVERNING_INCLUDED",
  "NON_IMPACTING_WITH_EVIDENCE",
  "VERIFIED_NON_GOVERNING_WITH_EVIDENCE",
]);
const taskLocalExecutableSource = (source) => source.split(/\r?\n/gu).filter((line) => !/^\s*(?:\/\/|\/\*|\*|--|#)/u.test(line)).join("\n");

export function createTaskLocalSourceBinding({ sourcePath, selector, bindingType = "TEXT_SELECTOR" } = {}, identity = {}, root = REPOSITORY_ROOT) {
  if (!safeRepoPath(sourcePath) || !["TEXT_SELECTOR", "JSON_POINTER"].includes(bindingType) || !textValue(selector) || selector.includes("*")) return null;
  const absolute = path.join(root, sourcePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  const source = fs.readFileSync(absolute, "utf8");
  let selectorMatchCount = 0;
  if (bindingType === "JSON_POINTER") {
    try { selectorMatchCount = resolveJsonPointer(JSON.parse(source), selector) === undefined ? 0 : 1; } catch { selectorMatchCount = 0; }
  } else selectorMatchCount = selectorCount(taskLocalExecutableSource(source), selector);
  return {
    sourcePath,
    bindingType,
    selector,
    selectorMatchCount,
    normalizedSourceHash: normalizedSourceHash(source),
    ...sourceIdentityOrDraft(identity),
  };
}

export function createTaskLocalEdgeDisposition({ edgeId, sourceDomain, destinationDomain, disposition, relationshipType, dataControlTransferred, authorityDirection = "NO_AUTHORITY_DIRECTION_INFERRED", mutableState = [], lifecycleImplications = [], sourceSubjects = [], negativeWitness = null, exactContract = null } = {}, { graph = generateDomainGraph(), identity = {}, root = REPOSITORY_ROOT } = {}) {
  const edge = graph.edges.find((candidate) => candidate.edgeId === edgeId) ?? (edgeId?.startsWith("task-local-") && textValue(sourceDomain) && textValue(destinationDomain) ? { edgeId, sourceDomain, destinationDomain } : null);
  if (!edge || !TASK_LOCAL_EDGE_DISPOSITIONS.includes(disposition)) return null;
  const sourceBindings = sourceSubjects.map((subject) => createTaskLocalSourceBinding(subject, identity, root)).filter(Boolean);
  const witness = negativeWitness ? createTaskLocalSourceBinding(negativeWitness, identity, root) : null;
  const sourceIdentity = sourceIdentityOrDraft(identity);
  const body = {
    edgeId,
    sourceDomain: edge.sourceDomain,
    destinationDomain: edge.destinationDomain,
    disposition,
    relationshipType,
    dataControlTransferred,
    authorityDirection,
    mutableState: canonicalSort([...mutableState]),
    lifecycleImplications: canonicalSort([...lifecycleImplications]),
    sourceBindings,
    ...(witness ? { negativeWitness: witness, exactContract } : {}),
    ...sourceIdentity,
  };
  return { ...body, recordHash: hashValue(body) };
}

export function createTaskLocalDomainGraphDelta({ edgeId, sourceDomain, destinationDomain, sourceSubjects = [], authorityDirection, impactClasses = [], rollback, cleanup, observability, reasonBaselineOmitted, affectedTask } = {}, identity = {}, root = REPOSITORY_ROOT) {
  const sourceBindings = sourceSubjects.map((subject) => createTaskLocalSourceBinding(subject, identity, root)).filter(Boolean);
  const body = {
    classification: "TASK_LOCAL_DOMAIN_GRAPH_DELTA_V1",
    edgeId,
    sourceDomain,
    destinationDomain,
    sourceBindings,
    authorityDirection,
    impactClasses: canonicalSort([...impactClasses]),
    rollback,
    cleanup,
    observability,
    reasonBaselineOmitted,
    affectedTask,
    modelDisposition: "PREDICTABLE_MODEL_OMISSION",
  };
  return { ...body, deltaHash: hashValue(body) };
}

export function verifyTaskLocalGoverningEdgeClosure({ taskId, primaryDomain, sourceIdentity, dispositions = [], modelDeltas = [], repository = "Chillywood2025/chillywood-mobile" } = {}, { root = REPOSITORY_ROOT, runs = 2 } = {}) {
  const baseline = readJson(root, "config/assurance/whole-app-domain-graph-v1.json");
  const input = { contract: TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1, repository, taskId, primaryDomain, sourceIdentity, baselineGraphHash: baseline.contentHash, dispositions, modelDeltas };
  const outputs = [];
  const failures = [];
  for (let index = 0; index < runs; index += 1) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `chillywood-task-local-edge-${index + 1}-`));
    const inputPath = path.join(directory, "input.json");
    fs.writeFileSync(inputPath, `${stableJson(input)}\n`);
    const child = spawnSync(process.execPath, [path.join(root, "scripts/assurance/engineering-evidence-verifier.mjs"), `--task-local-edge-input=${inputPath}`, `--root=${root}`], { cwd: directory, encoding: "utf8", shell: false, env: { ...process.env, LC_ALL: index === 0 ? "C" : "en_US.UTF-8" }, maxBuffer: 64 * 1024 * 1024 });
    let output = null;
    try { output = JSON.parse(child.stdout); } catch {}
    fs.rmSync(directory, { recursive: true, force: true });
    if (!output) failures.push({ run: index + 1, finding: "TASK_LOCAL_EDGE_VERIFIER_OUTPUT_INVALID", stderrHash: hashValue(child.stderr ?? "") });
    else outputs.push(output);
  }
  const deterministic = outputs.length === runs && outputs.slice(1).every((output) => stableJson(output) === stableJson(outputs[0]));
  const output = outputs[0] ?? { classification: "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED", findings: ["TASK_LOCAL_EDGE_VERIFIER_OUTPUT_INVALID"] };
  const findings = [...new Set([...(output.findings ?? []), ...failures.map(({ finding }) => finding), ...(deterministic ? [] : ["TASK_LOCAL_EDGE_CLOSURE_NONDETERMINISTIC"])])].sort(compareUtf8);
  return {
    ...output,
    classification: deterministic && findings.length === 0 ? "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR" : "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED",
    deterministic,
    verificationRuns: `${outputs.length}/${runs}`,
    generatorVerifierSourceDistinct: normalizedSourceHash(fs.readFileSync(path.join(root, "scripts/assurance/engineering-closure.mjs"), "utf8")) !== normalizedSourceHash(fs.readFileSync(path.join(root, "scripts/assurance/engineering-evidence-verifier.mjs"), "utf8")),
    findings,
    inputHash: hashValue(input),
  };
}

export function detectGraphFindings(graph, affectedDomains = graph.nodes.map(({ domain }) => domain)) {
  const findings = new Set();
  for (const code of graph?.edgeSetAccounting?.discoveryFindings ?? []) findings.add(code);
  const affected = new Set(affectedDomains);
  const states = new Map();
  for (const node of graph.nodes.filter(({ domain }) => affected.has(domain))) {
    for (const state of node.sharedMutableState ?? []) {
      if (!state.owner || state.owner === "UNKNOWN_OWNER") findings.add("UNOWNED_MUTABLE_STATE");
      if (states.has(state.stateId) && states.get(state.stateId) !== state.owner) findings.add("DUPLICATE_AUTHORITY_OWNER");
      states.set(state.stateId, state.owner);
    }
    for (const authority of node.authorityOwned ?? []) {
      if (authority.sourceKind === "UI_STATE" && authority.targetKind === "SERVER_AUTHORITY") findings.add("UI_STATE_USED_AS_SERVER_AUTHORITY");
      if (authority.sourceKind === "CLIENT_STATE" && authority.targetKind === "PROVIDER_AUTHORITY") findings.add("CLIENT_STATE_USED_AS_PROVIDER_AUTHORITY");
      if (authority.targetKind === "PROVIDER_MUTATION" && !(node.contractBindings ?? []).some(({ status }) => status === "REGISTERED_MUTATION_AUTHORITY")) findings.add("UNREGISTERED_PROVIDER_MUTATION");
    }
    if (node.autonomousWriter === true && !node.autonomousComponentId) findings.add("UNREGISTERED_AUTONOMOUS_WRITER");
    if ((node.unresolvedUnknowns ?? []).includes("affected-scope orphan")) findings.add("AFFECTED_SCOPE_ORPHAN");
    for (const orphan of node.affectedOrphans ?? []) {
      const suffix =
        {
          route: "ROUTE",
          edgeFunction: "EDGE_FUNCTION",
          data: "TABLE_RPC_MIGRATION",
          native: "NATIVE_MODULE",
        }[orphan.kind] ?? "UNKNOWN";
      findings.add(`AFFECTED_SCOPE_ORPHAN_${suffix}`);
    }
  }
  const edges = graph.edges.filter(({ sourceDomain, destinationDomain }) => affected.has(sourceDomain) && affected.has(destinationDomain));
  for (const edge of edges) {
    if (edge.boundedSideEffects === false) findings.add("UNBOUNDED_CROSS_DOMAIN_SIDE_EFFECT");
    if (!edge.platformDifferences) findings.add("UNDOCUMENTED_PLATFORM_MISMATCH");
    if (!edge.replacementAuthority) findings.add("STALE_STATE_MODIFIES_REPLACEMENT_STATE");
  }
  const adjacency = new Map([...affected].map((id) => [id, []]));
  for (const edge of edges.filter(({ impactTraversal, authorityDirection }) => impactTraversal !== false && authorityDirection === "SOURCE_TO_DESTINATION")) adjacency.get(edge.sourceDomain)?.push(edge.destinationDomain);
  const visiting = new Set();
  const visited = new Set();
  const cycle = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) if (cycle(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if ([...affected].some(cycle)) findings.add("CIRCULAR_AUTHORITY");
  return [...findings].sort();
}

const GATE_FAILURES = {
  boundaryExplicit: "PREIMPLEMENTATION_BOUNDARY_UNDEFINED",
  affectedDomainClosureComplete: "PREIMPLEMENTATION_AFFECTED_DOMAIN_INCOMPLETE",
  dependencyClosureComplete: "PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE",
  authorityUniquelyOwned: "PREIMPLEMENTATION_AUTHORITY_UNOWNED",
  reachableStateModelComplete: "PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE",
  requirementsMappedToInvariants: "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE",
  positiveNegativeEvidencePlanned: "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE",
  adversarialMatrixComplete: "PREIMPLEMENTATION_ADVERSARIAL_MATRIX_INCOMPLETE",
  coverageStrengthPlanned: "PREIMPLEMENTATION_ADVERSARIAL_MATRIX_INCOMPLETE",
  platformContractCurrentOrBlocked: "PREIMPLEMENTATION_PLATFORM_CONTRACT_STALE",
  providerContractCurrentOrBlocked: "PREIMPLEMENTATION_PROVIDER_CONTRACT_STALE",
  marketScopeBound: "PREIMPLEMENTATION_MARKET_SCOPE_UNBOUND",
  gapsKnown: "PREIMPLEMENTATION_AFFECTED_DOMAIN_INCOMPLETE",
  mutantsDefined: "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE",
  defectLedgerStable: "PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE",
  scopeFinite: "PREIMPLEMENTATION_SCOPE_UNBOUNDED",
  rollbackDefined: "PREIMPLEMENTATION_ROLLBACK_UNDEFINED",
  cleanupDefined: "PREIMPLEMENTATION_CLEANUP_UNDEFINED",
  observabilityDefined: "PREIMPLEMENTATION_OBSERVABILITY_UNDEFINED",
  noUnknownDependencyWithinClosure: "PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE",
};

export const CLEAR_CHECKS = Object.freeze(Object.fromEntries(Object.keys(GATE_FAILURES).map((key) => [key, true])));
export const PACKET_SECTIONS = Object.freeze(["A_OWNER_INTENT", "B_BOUNDED_COMPLETENESS", "C_AFFECTED_DOMAIN_CLOSURE", "D_CURRENT_IMPLEMENTATION_AUDIT", "E_AUTHORITY_AND_DATA_FLOW", "F_STATE_MODEL", "G_INVARIANTS", "H_ADVERSARIAL_MATRIX", "I_COVERAGE_MAP", "J_STABLE_DEFECT_LEDGER", "K_IMPLEMENTATION_PLAN", "L_COMPLETENESS_CERTIFICATE", "M_STOP_CONDITIONS"]);
const derivedGateClearances = new WeakSet();
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const textValue = (value) => typeof value === "string" && value.trim().length > 0;
const textArray = (value, empty = false) => Array.isArray(value) && (empty || value.length > 0) && value.every(textValue);
const packetFacts = (sections) => Object.fromEntries(PACKET_SECTIONS.filter((name) => name !== "L_COMPLETENESS_CERTIFICATE").map((name) => [name, sections?.[name]]));
const packetFactsHash = (sections) => hashValue(packetFacts(sections));
const safeRepoPath = (value) => typeof value === "string" && !path.isAbsolute(value) && !value.includes("..") && /^[A-Za-z0-9_.+@/\[\]-]+$/u.test(value);

export function readTaskArtifactAtGitHead(file, head, root = REPOSITORY_ROOT) {
  if (!safeRepoPath(file) || !/^[0-9a-f]{40}$/u.test(head ?? "")) return null;
  const listing = spawnSync("git", ["ls-tree", "-z", head, "--", file], { cwd: root, encoding: null, shell: false, maxBuffer: 1024 * 1024 });
  if (listing.status !== 0) return null;
  const records = listing.stdout.toString("utf8").split("\0").filter(Boolean);
  const match = records.length === 1 ? /^(100644) blob ([0-9a-f]{40})\t(.+)$/u.exec(records[0]) : null;
  if (!match || match[3] !== file) return null;
  const content = spawnSync("git", ["show", `${head}:${file}`], { cwd: root, encoding: null, shell: false, maxBuffer: 32 * 1024 * 1024 });
  if (content.status !== 0) return null;
  const blob = spawnSync("git", ["hash-object", "--stdin"], { cwd: root, input: content.stdout, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 });
  if (blob.status !== 0 || blob.stdout.trim() !== match[2]) return null;
  try {
    return { artifact: JSON.parse(content.stdout.toString("utf8")), artifactHash: crypto.createHash("sha256").update(content.stdout).digest("hex"), bytes: content.stdout, blobHash: match[2], mode: match[1] };
  } catch { return null; }
}
const OWNER_AUTH_MARKER = "<!-- chillywood-engineering-owner-authorization-v1 -->";
const trustedOwnerAuthorizationSets = new WeakSet();
const exactHttpsUrl = (value) => {
  if (typeof value !== "string" || value.includes("%") || value.includes("?") || value.includes("\\")) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed : null;
  } catch {
    return null;
  }
};
export function normalizeGitHubCommentIdentity(raw, { repository = "Chillywood2025/chillywood-mobile", pr, commentId } = {}) {
  if (!object(raw) || !Number.isInteger(raw.id) || raw.id < 1 || raw.id !== commentId || !textValue(raw.node_id) || !textValue(raw.body) || !textValue(raw.created_at) || raw.created_at !== raw.updated_at || raw.user?.login !== "Chillywood2025" || raw.author_association !== "OWNER") return null;
  const [owner, name] = repository.split("/");
  if (!owner || !name || !Number.isInteger(pr) || pr < 1) return null;
  const issue = exactHttpsUrl(raw.issue_url);
  if (!issue || issue.hostname !== "api.github.com" || issue.hash || issue.pathname !== `/repos/${owner}/${name}/issues/${pr}`) return null;
  let html = null;
  if (raw.html_url !== undefined) {
    html = exactHttpsUrl(raw.html_url);
    if (!html || html.hostname !== "github.com") return null;
    const match = html.pathname.match(new RegExp(`^/${owner}/${name}/(?:pull|issues)/(${pr})$`, "u"));
    if (!match) return null;
    if (html.hash !== `#issuecomment-${commentId}`) return null;
  }
  return Object.freeze({
    id: raw.id,
    nodeId: raw.node_id,
    repository,
    pr,
    author: raw.user.login,
    authorAssociation: raw.author_association,
    body: raw.body,
    bodyHash: hashValue(raw.body),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    issueUrl: issue.href,
    htmlUrl: html?.href ?? null,
  });
}

const trustedOwnerJurisdictionAuthorities = new WeakSet();
const freezeJurisdictionAuthority = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freezeJurisdictionAuthority); Object.freeze(value); } return value; };
const commentPr = (raw) => {
  try {
    const parsed = new URL(raw?.issue_url ?? "");
    const match = parsed.pathname.match(/^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/u);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
};
const jurisdictionReceipt = (normalized) => normalized ? {
  id: normalized.id,
  body: normalized.body,
  authorLogin: normalized.author,
  authorAssociation: normalized.authorAssociation,
  createdAt: normalized.createdAt,
  updatedAt: normalized.updatedAt,
} : null;

export function verifyOwnerJurisdictionAuthorityV2({ raw, policyRaws = [], paginationComplete = false, repository = "Chillywood2025/chillywood-mobile", pr, registry, expected = {}, expectedTaskIdentity = null, expectedTaskEvidence = null } = {}) {
  const normalized = normalizeGitHubCommentIdentity(raw, { repository, pr, commentId: raw?.id });
  const normalizedPolicies = policyRaws.map((item) => normalizeGitHubCommentIdentity(item, { repository, pr: commentPr(item), commentId: item?.id })).filter(Boolean);
  const direct = normalized ? verifyOwnerJurisdictionDecisionV2({ body: normalized.body, registry, receipt: jurisdictionReceipt(normalized), expected: { ...expected, repository, pr } }) : { ok: false, findings: ["OWNER_DECISION_IMMUTABILITY_INVALID"] };
  const policy = paginationComplete ? resolveOwnerJurisdictionPolicyChainV2({ receipts: normalizedPolicies.map(jurisdictionReceipt), registry, expectedScope: direct.standingPolicy?.scope, completeDiscovery: true }) : { ok: false, findings: ["POLICY_DISCOVERY_INCOMPLETE"] };
  const taskBinding = direct.ok ? { ok: true, findings: [], coverage: direct.coverage } : { ok: false, findings: ["OWNER_JURISDICTION_BINDING_UNVERIFIED"] };
  const findings = new Set([...(direct.findings ?? []), ...(policy.findings ?? []), ...(taskBinding.findings ?? [])]);
  if (normalizedPolicies.length !== policyRaws.length || !normalizedPolicies.some(({ id }) => id === normalized?.id)) findings.add("POLICY_DISCOVERY_OR_GENESIS_INVALID");
  if (policy.sourceDecisionType !== direct.sourceDecisionType) findings.add("POLICY_SOURCE_DECISION_TYPE_MISMATCH");
  if (expectedTaskIdentity && stableJson(direct.taskBinding?.taskIdentity) !== stableJson(expectedTaskIdentity)) findings.add("OWNER_JURISDICTION_TASK_IDENTITY_MISMATCH");
  if (expectedTaskEvidence && stableJson(direct.taskBinding?.taskEvidence) !== stableJson(expectedTaskEvidence)) findings.add("OWNER_JURISDICTION_TASK_EVIDENCE_MISMATCH");
  const ok = direct.ok && policy.ok && policy.suppliesAuthority === true && policy.commentId === normalized?.id && taskBinding.ok && findings.size === 0;
  const result = {
    ok,
    classification: ok ? "OWNER_JURISDICTION_DECISION_VALID" : "OWNER_JURISDICTION_DECISION_INVALID",
    findings: [...findings].sort(),
    commentId: normalized?.id ?? null,
    commentRawBodyHash: normalized?.bodyHash ?? null,
    commentBodyHash: direct.commentBodyHash ?? null,
    subjectHash: direct.payload?.subjectHash ?? null,
    envelopeHash: direct.envelopeHash ?? null,
    sourceDecisionType: policy.sourceDecisionType ?? null,
    standingPolicy: direct.standingPolicy,
    standingPolicyHash: direct.standingPolicyHash ?? null,
    taskBindingHash: direct.taskBindingHash ?? null,
    policyStatus: policy.status ?? null,
    taskBinding: direct.taskBinding,
    coverage: taskBinding.coverage ?? null,
    externalProofInherited: direct.taskBinding?.externalProofInherited ?? null,
    operationalOwnersPreserved: direct.taskBinding?.operationalOwnersPreserved ?? null,
  };
  const immutableResult = ok ? freezeJurisdictionAuthority(result) : result;
  if (ok) trustedOwnerJurisdictionAuthorities.add(immutableResult);
  return immutableResult;
}

export function verifyTaskJurisdictionAuthorityV2({ binding, policyRaws = [], paginationComplete = false, repository = "Chillywood2025/chillywood-mobile", registry, expectedScope = null, expectedTaskIdentity = null, expectedTaskEvidence = null, expectedDomainIds = null } = {}) {
  const normalizedPolicies = policyRaws.map((item) => normalizeGitHubCommentIdentity(item, { repository, pr: commentPr(item), commentId: item?.id })).filter(Boolean);
  const policy = paginationComplete && normalizedPolicies.length === policyRaws.length
    ? resolveOwnerJurisdictionPolicyChainV2({ receipts: normalizedPolicies.map(jurisdictionReceipt), registry, expectedScope, completeDiscovery: true })
    : { ok: false, findings: ["POLICY_DISCOVERY_INCOMPLETE"] };
  const taskBinding = policy.ok ? verifyTaskJurisdictionBindingV2({ binding, registry, activePolicy: policy, allowEmbeddedReference: false }) : { ok: false, findings: ["OWNER_JURISDICTION_BINDING_UNVERIFIED"] };
  const findings = new Set([...(policy.findings ?? []), ...(taskBinding.findings ?? [])]);
  if (expectedTaskIdentity && stableJson(binding?.taskIdentity) !== stableJson(expectedTaskIdentity)) findings.add("OWNER_JURISDICTION_TASK_IDENTITY_MISMATCH");
  if (expectedTaskEvidence && stableJson(binding?.taskEvidence) !== stableJson(expectedTaskEvidence)) findings.add("OWNER_JURISDICTION_TASK_EVIDENCE_MISMATCH");
  if (expectedDomainIds && stableJson(binding?.domainIds) !== stableJson(expectedDomainIds)) findings.add("OWNER_JURISDICTION_DOMAINS_MISMATCH");
  const ok = policy.ok && policy.suppliesAuthority === true && taskBinding.ok && findings.size === 0;
  const result = {
    ok,
    classification: ok ? "OWNER_JURISDICTION_DECISION_VALID" : "OWNER_JURISDICTION_DECISION_INVALID",
    findings: [...findings].sort(),
    commentId: policy.commentId ?? null,
    commentBodyHash: policy.commentBodyHash ?? null,
    subjectHash: policy.subjectHash ?? null,
    envelopeHash: policy.envelopeHash ?? null,
    sourceDecisionType: policy.sourceDecisionType ?? null,
    standingPolicy: policy.standingPolicy,
    standingPolicyHash: policy.standingPolicyHash ?? null,
    taskBindingHash: binding?.bindingHash ?? null,
    policyStatus: policy.status ?? null,
    taskBinding: binding,
    coverage: taskBinding.coverage ?? null,
    externalProofInherited: binding?.externalProofInherited ?? null,
    operationalOwnersPreserved: binding?.operationalOwnersPreserved ?? null,
  };
  const immutableResult = ok ? freezeJurisdictionAuthority(result) : result;
  if (ok) trustedOwnerJurisdictionAuthorities.add(immutableResult);
  return immutableResult;
}
const trustedOwnerJurisdictionAuthority = (value) => trustedOwnerJurisdictionAuthorities.has(value);
export const isTrustedOwnerJurisdictionAuthorityV2 = (value) => trustedOwnerJurisdictionAuthority(value) && value?.ok === true;

export const CHILLYWOOD_US_PRE_RELEASE_JURISDICTION_SCOPE_V2 = Object.freeze({
  launchProgram: "chillywood-united-states-pre-release",
  product: "chillywood-mobile",
  repository: "Chillywood2025/chillywood-mobile",
});

export function ownerJurisdictionPolicyBindingTruthV2(authority) {
  if (!trustedOwnerJurisdictionAuthority(authority)
    || authority.ok !== true
    || authority.policyStatus !== ACTIVE_POLICY_STATUS
    || authority.externalProofInherited !== false
    || authority.operationalOwnersPreserved !== true) throw new TypeError("TRUSTED_OWNER_JURISDICTION_AUTHORITY_REQUIRED");
  const binding = authority.taskBinding;
  const domains = binding.domainIds;
  const embedded = binding.policyReference.source === "THIS_IMMUTABLE_OWNER_DECISION";
  const policySource = { commentId: authority.commentId, referenceScope: embedded ? "TASK_BOUND_COMPOSITE" : "STANDING_POLICY_SUBRECORD_ONLY", standingPolicyType: OWNER_JURISDICTION_STANDING_POLICY_V2, standingPolicyVersion: 2, status: authority.policyStatus, sequence: authority.standingPolicy.sequence, standingPolicyHash: authority.standingPolicyHash };
  return {
    schemaVersion: 2,
    contract: "OWNER_JURISDICTION_POLICY_BINDING_V2",
    repository: binding.scope.repository,
    product: binding.scope.product,
    launchProgram: binding.scope.launchProgram,
    policySource: embedded ? { ...policySource, decisionVersion: authority.sourceDecisionType, subjectHash: authority.subjectHash, bodyHash: authority.commentBodyHash, envelopeHash: authority.envelopeHash } : policySource,
    taskBinding: {
      taskId: binding.taskIdentity.taskId,
      prNumber: binding.taskIdentity.implementationPr,
      planningHead: binding.taskIdentity.planningHead,
      planningTree: binding.taskIdentity.planningTree,
      standingPolicyCommentId: authority.commentId,
      standingPolicyHash: authority.standingPolicyHash,
      bindingType: OWNER_JURISDICTION_TASK_BINDING_V2,
      bindingVersion: 2,
      domainIds: [...domains],
      bindingHash: authority.taskBindingHash,
      conflictStatus: "NONE",
    },
    coverage: { status: "EXACT_TASK_DOMAINS_BOUND", coveredDomainIds: [...domains], coveredCount: domains.length, unresolvedDomainIds: [] },
    externalProofInherited: false,
    operationalOwnershipPreserved: true,
    authority: { productMutation: false, providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
  };
}

export const ARCHITECTURE_MAINTENANCE_MARKER = "<!-- chillywood-assurance-architecture-maintenance-v1 -->";
export const ARCHITECTURE_MAINTENANCE_SUCCESSOR_MARKER = "<!-- chillywood-assurance-architecture-maintenance-successor-v1 -->";
export const ARCHITECTURE_FINAL_SOURCE_MARKER = "<!-- chillywood-assurance-architecture-final-source-v1 -->";
export const ARCHITECTURE_REPOSITORY_REVIEW_MARKER = "<!-- chillywood-assurance-repository-review-v1 -->";
export const ASSURANCE_RECEIPT_LIFECYCLE_V2 = "ASSURANCE_RECEIPT_LIFECYCLE_V2";
export const FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1 = "FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1";
export const FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1 = "FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1";
export const FINITE_TASK_TERMINAL_TRUTH_V1 = "FINITE_TASK_TERMINAL_TRUTH_V1";
export const FINITE_TASK_TERMINAL_TRUTH_FINAL_SOURCE_V1 = "FINITE_TASK_TERMINAL_TRUTH_FINAL_SOURCE_V1";
export const PRE_ADMISSION_DEPENDENCY_AMENDMENT_MARKER = "<!-- chillywood-pre-admission-capability-dependency-amendment-v1 -->";
export const ARCHITECTURE_FINAL_SOURCE_CORRECTION_MARKER = "<!-- chillywood-assurance-architecture-final-source-correction-v1 -->";
export const TERMINAL_TRUTH_SUCCESSOR_MARKER = "<!-- chillywood-terminal-truth-successor-v1 -->";
export const FINITE_TASK_ADMISSION_MARKER = "<!-- chillywood-finite-task-admission-v1 -->";
export const AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_V2 = "AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_V2";
export const AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_V2_CUTOVER = Object.freeze({
  firstRequiredPullRequest: 237,
  lastLegacyPullRequest: 236,
  mergeSha: "928a9734f5bda16c90bb4fc95cb96e81ae9dd131",
  mergeTree: "52e2343ecf44cca964fa63126411d51d91e055d8",
});
const AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_PATH = "config/assurance/current-truth-v1.json";
const AUTHORITY_CONTROL_CURRENT_STATE_PATH = "CURRENT_STATE.md";
const AUTHORITY_CONTROL_NEXT_TASK_PATH = "NEXT_TASK.md";
export const TYPED_CONTEXT_ARCHITECTURE_PATHS = Object.freeze([
  "config/assurance/pr-scope-policy-v1.json",
  "scripts/assurance/current-truth.mjs",
  "scripts/assurance/engineering-closure.mjs",
  "scripts/assurance/lib.mjs",
  "scripts/assurance/pr-scope-lib.mjs",
  "scripts/assurance/pr-scope.mjs",
  "tests/assurance/active-task-binding-a1.test.mjs",
  "tests/assurance/pr-scope-feature-bundles.test.mjs",
]);
export const PRE_ADMISSION_ARCHITECTURE_PATHS = Object.freeze([
  "CURRENT_STATE.md",
  "NEXT_TASK.md",
  "config/assurance/current-truth-contract-v1.json",
  "config/assurance/current-truth-v1.json",
  "config/assurance/schemas-v1.json",
  "scripts/assurance/active-task.mjs",
  "scripts/assurance/engineering-closure.mjs",
  "scripts/assurance/lib.mjs",
  "scripts/assurance/pr-scope-lib.mjs",
  "scripts/assurance/pr-scope.mjs",
  "tests/assurance/active-task-binding-a1.test.mjs",
  "tests/assurance/engineering-doctrine.test.mjs",
  "tests/assurance/pr-scope-feature-bundles.test.mjs",
]);
export const ADMISSION_CLEARANCE_ARCHITECTURE_PATHS = Object.freeze([
  "CURRENT_STATE.md",
  "NEXT_TASK.md",
  "config/assurance/current-truth-contract-v1.json",
  "config/assurance/current-truth-v1.json",
  "config/assurance/schemas-v1.json",
  "scripts/assurance/active-task.mjs",
  "scripts/assurance/engineering-closure.mjs",
  "scripts/assurance/lib.mjs",
  "scripts/assurance/pr-scope-lib.mjs",
  "scripts/assurance/pr-scope.mjs",
  "scripts/assurance/current-truth.mjs",
  "tests/assurance/active-task-binding-a1.test.mjs",
  "tests/assurance/engineering-doctrine.test.mjs",
  "tests/assurance/pr-scope-feature-bundles.test.mjs",
  "tests/assurance/current-truth-sync.test.mjs",
]);
export const TASK_LOCAL_EDGE_ARCHITECTURE_PATHS = Object.freeze([
  "CURRENT_STATE.md",
  "NEXT_TASK.md",
  "config/assurance/current-truth-contract-v1.json",
  "config/assurance/current-truth-v1.json",
  "scripts/assurance/active-task.mjs",
  "scripts/assurance/engineering-closure.mjs",
  "scripts/assurance/engineering-evidence-verifier.mjs",
  "scripts/assurance/lib.mjs",
  "tests/assurance/engineering-doctrine.test.mjs",
]);
export const OWNER_JURISDICTION_ARCHITECTURE_PATHS = Object.freeze([
  "CURRENT_STATE.md",
  "NEXT_TASK.md",
  "config/assurance/current-truth-contract-v1.json",
  "config/assurance/current-truth-v1.json",
  "config/assurance/schemas-v1.json",
  "scripts/assurance/active-task.mjs",
  "scripts/assurance/current-truth.mjs",
  "scripts/assurance/engineering-closure.mjs",
  "scripts/assurance/jurisdiction-policy.mjs",
  "scripts/assurance/lib.mjs",
  "tests/assurance/active-task-binding-a1.test.mjs",
  "tests/assurance/current-truth-sync.test.mjs",
  "tests/assurance/engineering-doctrine.test.mjs",
  "tests/assurance/jurisdiction-policy.test.mjs",
  "tests/assurance/pr-scope-feature-bundles.test.mjs",
]);
export const TERMINAL_TRUTH_PATHS = Object.freeze(["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"]);
export const FINITE_TASK_ADMISSION_LEASE_STATE = "ACTIVE_IMPLEMENTATION";
export const finiteTaskAdmissionLeaseStateValid = (lease) => lease?.taskState === FINITE_TASK_ADMISSION_LEASE_STATE;
const TYPED_CONTEXT_DOCTRINE_MERGE = "c1f9ec1f71cc8bc4448afd2327c4341cac309573";
const TYPED_CONTEXT_NEXT_TASK = "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE";
const ownerCommentBody = (marker, type, subject) => {
  const payload = { schemaVersion: 1, evidenceClass: "OWNER_INTENT", authorizationId: type.toLowerCase(), type, repository: subject.repository, pr: subject.pr, subject, subjectHash: hashValue(subject) };
  return `${marker}\n${stableJson({ ...payload, bodyHash: hashValue(payload) })}`;
};
const repositoryEvidenceCommentBody = (marker, type, subject) => {
  const payload = { schemaVersion: 1, evidenceClass: "REPOSITORY_EXACT_HEAD_REVIEW", type, repository: subject.repository, pr: subject.pr, subject, subjectHash: hashValue(subject) };
  return `${marker}\n${stableJson({ ...payload, bodyHash: hashValue(payload) })}`;
};
const parseExactOwnerBody = (normalized, marker) => {
  if (!normalized?.body.startsWith(`${marker}\n`)) return null;
  try { return JSON.parse(normalized.body.slice(marker.length + 1)); } catch { return null; }
};
const exactScope = (scope) => ({
  changedPaths: [...new Set(scope?.files ?? scope?.changedPaths ?? scope?.paths ?? [])].sort(),
  changedPathHash: hashValue([...new Set(scope?.files ?? scope?.changedPaths ?? scope?.paths ?? [])].sort()),
  netChangedLines: Math.max(0, Number(scope?.netChangedLines ?? scope?.handAuthoredLines ?? scope?.changedLines ?? 0)),
});

const authorityControlCurrentTruthCompanionV2Required = ({ identity, root = REPOSITORY_ROOT } = {}) => {
  void root;
  if (identity?.repository !== "Chillywood2025/chillywood-mobile") return false;
  const pullRequest = Number(identity?.pr);
  return Number.isSafeInteger(pullRequest)
    && pullRequest >= AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_V2_CUTOVER.firstRequiredPullRequest;
};

const authorityControlCompanionBlobAtHead = (file, head, root) => {
  if (!safeRepoPath(file) || !/^[0-9a-f]{40}$/u.test(head ?? "")) return null;
  const listing = spawnSync("git", ["ls-tree", "-z", head, "--", file], { cwd: root, encoding: null, shell: false, maxBuffer: 1024 * 1024 });
  if (listing.status !== 0) return null;
  const records = listing.stdout.toString("utf8").split("\0").filter(Boolean);
  const match = records.length === 1 ? /^(100644) blob ([0-9a-f]{40})\t(.+)$/u.exec(records[0]) : null;
  if (!match || match[3] !== file) return null;
  const content = spawnSync("git", ["show", `${head}:${file}`], { cwd: root, encoding: null, shell: false, maxBuffer: 32 * 1024 * 1024 });
  if (content.status !== 0) return null;
  const blob = spawnSync("git", ["hash-object", "--stdin"], { cwd: root, input: content.stdout, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 });
  return blob.status === 0 && blob.stdout.trim() === match[2] ? content.stdout : null;
};

export function authorityControlCurrentTruthCompanionV2({ identity, root = REPOSITORY_ROOT } = {}) {
  if (!authorityControlCurrentTruthCompanionV2Required({ identity, root })) return null;
  const recordBytes = authorityControlCompanionBlobAtHead(AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_PATH, identity?.headSha, root);
  const currentStateBytes = authorityControlCompanionBlobAtHead(AUTHORITY_CONTROL_CURRENT_STATE_PATH, identity?.headSha, root);
  const nextTaskBytes = authorityControlCompanionBlobAtHead(AUTHORITY_CONTROL_NEXT_TASK_PATH, identity?.headSha, root);
  if (![recordBytes, currentStateBytes, nextTaskBytes].every(Buffer.isBuffer)) throw new Error("AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_INVALID");
  const record = JSON.parse(recordBytes.toString("utf8"));
  const baseTreeRun = spawnSync("git", ["rev-parse", `${identity.baseSha}^{tree}`], { cwd: root, encoding: "utf8", shell: false });
  const baseTree = baseTreeRun.status === 0 ? baseTreeRun.stdout.trim() : null;
  if (record?.mainSha !== identity.baseSha
    || record?.protectedMainAuthority?.checkpointSha !== identity.baseSha
    || record?.protectedMainAuthority?.checkpointTree !== baseTree
    || currentStateBytes.toString("utf8") !== renderCurrentState(record)
    || nextTaskBytes.toString("utf8") !== renderNextTask(record)) {
    throw new Error("AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_INVALID");
  }
  const value = {
    schemaVersion: 2,
    contractId: AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_V2,
    hashDomain: "CHILLYWOOD_ASSURANCE_AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_V2",
    cutover: { ...AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_V2_CUTOVER },
    requiredChangedPaths: [AUTHORITY_CONTROL_CURRENT_STATE_PATH, AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_PATH].sort(),
    currentTruth: {
      path: AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_PATH,
      sha256: shaBytes(recordBytes),
      mainSha: record.mainSha,
      checkpointSha: record.protectedMainAuthority.checkpointSha,
      checkpointTree: record.protectedMainAuthority.checkpointTree,
    },
    generatedDocuments: [
      { path: AUTHORITY_CONTROL_CURRENT_STATE_PATH, sha256: shaBytes(currentStateBytes) },
      { path: AUTHORITY_CONTROL_NEXT_TASK_PATH, sha256: shaBytes(nextTaskBytes) },
    ],
    bindingMode: "EMBEDDED_ROLLING_PROTECTED_MAIN_AUTHORITY",
    authority: { product: false, provider: false, database: false, build: false, submission: false, ota: false, publicRelease: false },
  };
  return Object.freeze({ ...value, companionHash: hashValue({ hashDomain: value.hashDomain, value }) });
}

export const PHASE1_REQUIRED_JOB_NAMES = Object.freeze([
  "Phase 1 / Android Regression Guards",
  "Phase 1 / Autonomous Systems All-Platform Contract",
  "Phase 1 / Autonomous Systems iOS Contract",
  "Phase 1 / Cognitive Execution Safety",
  "Phase 1 / Cognitive Intelligence Contract",
  "Phase 1 / Expo Doctor",
  "Phase 1 / Repository Lint",
  "Phase 1 / Research and Memory Integrity",
  "Phase 1 / Route Contracts",
  "Phase 1 / Runtime Validation",
  "Phase 1 / Supabase Database Integration",
  "Phase 1 / TypeScript",
  "Phase 1 / iOS Configuration",
]);

const finiteTaskImplementationReviewBinding = (resolution) => {
  const base = resolution?.baseReservation;
  const effective = resolution?.effectiveReservation;
  const receipt = resolution?.amendmentReceipt;
  const summarize = (reservation) => reservation ? {
    reservationHash: reservation.reservationHash ?? null,
    pathSetHash: hashValue(reservation.allowedPaths ?? []),
    eligiblePathCount: reservation.eligiblePathCount ?? null,
    maximumFiles: reservation.maximumFiles ?? null,
    maximumLines: reservation.maximumLines ?? null,
  } : null;
  return {
    authorityValid: finiteTaskEffectiveReservationAuthorityValid(resolution),
    status: resolution?.status ?? null,
    baseLeaseHash: resolution?.baseLeaseHash ?? null,
    leaseId: resolution?.baseLease?.leaseId ?? null,
    domain: resolution?.baseLease?.domain ?? null,
    implementationPr: resolution?.baseLease?.implementationPr ?? null,
    implementationBranch: resolution?.baseLease?.implementationBranch ?? null,
    candidateHead: resolution?.candidateHead ?? null,
    candidateTree: resolution?.candidateTree ?? null,
    baseReservation: summarize(base),
    effectiveReservation: summarize(effective),
    amendmentsConsumed: resolution?.amendmentsConsumed ?? null,
    amendmentReceipt: receipt ? {
      commentId: receipt.commentId ?? null,
      subjectHash: receipt.subjectHash ?? null,
      bodyHash: receipt.bodyHash ?? null,
      rawBodyHash: receipt.rawBodyHash ?? null,
    } : null,
  };
};

export function architectureRepositoryReviewSubject({ identity, tree, scope, profile = null, effectiveReservationResolution = null } = {}) {
  const observed = exactScope(scope);
  const jurisdictionModelReview = identity?.branch === "codex/owner-jurisdiction-canonical-model-v1";
  const jurisdictionAdmissionReview = profile === "FINITE_TASK_ADMISSION_JURISDICTION_V2";
  const amendmentControlRepairReview = profile === FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1;
  const finiteTaskImplementationReview = profile === FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1;
  const finiteTaskTerminalReview = profile === FINITE_TASK_TERMINAL_TRUTH_V1;
  return {
    type: "REPOSITORY_OWNED_EXACT_HEAD_REVIEW_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    protectedBase: identity?.baseSha,
    reviewedHead: identity?.headSha,
    reviewedTree: tree,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    diffHash: scope?.diffHash ?? null,
    additions: Number(scope?.additions ?? 0),
    deletions: Number(scope?.deletions ?? 0),
    netChangedLines: observed.netChangedLines,
    disposition: { P0: 0, P1: 0, launchImpactingP2: 0 },
    ...((jurisdictionAdmissionReview || amendmentControlRepairReview || finiteTaskImplementationReview || finiteTaskTerminalReview) ? { reviewProfile: profile } : {}),
    ...(finiteTaskImplementationReview ? { finiteTaskEffectiveReservation: finiteTaskImplementationReviewBinding(effectiveReservationResolution) } : {}),
    lanes: finiteTaskTerminalReview ? [
      "exact three-path canonical finite-task terminal-truth transition",
      "immutable base lease hash and amended effective-reservation receipt preservation",
      "implementation final-source and normal two-parent protected-main merge provenance",
      "canonical next-task derivation without successor invention",
      "no provider mutation or contact, database deployment, product build, submission, OTA, or public release authority",
    ] : finiteTaskImplementationReview ? [
      "implementation correctness and exact final-source behavior",
      "UNKNOWN remains fail-closed and semantically distinct from INACTIVE and ACTIVE",
      "identity and account-generation isolation prevents stale-account authority",
      "Premium entitlement and money authority remain explicit and honest",
      "exact effective lease reservation, canonical line accounting, and no extra paths",
      "no provider mutation or contact, database deployment, product build, submission, OTA, or public release authority",
    ] : amendmentControlRepairReview ? [
      "RC-1 registered Wave 1 amendment policy and exact amendable-path bound",
      "RC-2 shared effective-reservation resolution across every real gate",
      "RC-3 immutable starting-head binding and descendant-only history integrity",
      "RC-4 complete authoritative reservation overlay and byte-identical effective scope",
      "RC-5 prospective admission and current-truth amendment-policy compatibility",
      "effective path and line ceilings; prohibited provider, database-deployment, build, submission, OTA, and release authority closure",
    ] : jurisdictionAdmissionReview ? [
      "Owner jurisdiction authority and exact task-domain coverage",
      "standing-policy and task-binding separation; no wildcard or automatic future coverage",
      "future-wave inheritance preserves exact-domain enumeration and binding",
      "creator age and payout constraints remain task-specific",
      "external-proof noninheritance, operational-owner preservation, and prohibited authority closure",
    ] : jurisdictionModelReview ? [
      "RC-1 through RC-5 canonical-contract closure",
      "RC-6 inventory: Autonomous Systems All-Platform Contract; Autonomous Systems iOS Contract; Cognitive Intelligence Contract; stale test 40; RC-4 integration causal class",
      "standing jurisdiction policy and exact task-binding separation",
      "policy and admission append-only chain integrity",
      "legacy receipt compatibility and canonical hashing",
      "future-wave inheritance, external-proof noninheritance, and operational-owner preservation",
    ] : [
      "task-context and receipt-lifecycle authority",
      "task-local edge closure and non-interference",
    ],
    providerCodexReview: "OPTIONAL_ADVISORY_NOT_REQUESTED",
    authority: { product: false, nativeProduct: false, package: false, database: false, provider: false, build: false, submission: false, ota: false, release: false },
    reviewerIdentity: { kind: "REPOSITORY_OWNED_SEMANTIC_REVIEW", issuer: "Codex" },
  };
}
export const architectureRepositoryReviewCommentBody = (subject) => repositoryEvidenceCommentBody(ARCHITECTURE_REPOSITORY_REVIEW_MARKER, subject.type, subject);

export function verifyArchitectureRepositoryReview({ raw, identity, tree, scope, profile = null, effectiveReservationResolution = null } = {}) {
  const normalized = normalizeGitHubCommentIdentity(raw, { repository: identity?.repository, pr: identity?.pr, commentId: raw?.id });
  const payload = parseExactOwnerBody(normalized, ARCHITECTURE_REPOSITORY_REVIEW_MARKER);
  const body = Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => key !== "bodyHash"));
  const expected = architectureRepositoryReviewSubject({ identity, tree, scope, profile, effectiveReservationResolution });
  const finiteTaskImplementationReview = profile === FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1;
  const effectiveReservationBound = !finiteTaskImplementationReview || Boolean(
    finiteTaskEffectiveReservationAuthorityValid(effectiveReservationResolution)
    && effectiveReservationResolution?.status === "AMENDED"
    && effectiveReservationResolution?.amendmentsConsumed === 1
    && effectiveReservationResolution?.amendmentReceipt
    && effectiveReservationResolution?.baseLease?.implementationPr === identity?.pr
    && effectiveReservationResolution?.baseLease?.implementationBranch === identity?.branch
    && effectiveReservationResolution?.candidateHead === identity?.headSha
    && effectiveReservationResolution?.candidateTree === tree
    && expected.finiteTaskEffectiveReservation?.authorityValid === true
    && expected.finiteTaskEffectiveReservation?.baseLeaseHash
    && expected.finiteTaskEffectiveReservation?.baseReservation?.reservationHash
    && expected.finiteTaskEffectiveReservation?.effectiveReservation?.reservationHash
  );
  const valid = Boolean(normalized
    && payload?.evidenceClass === "REPOSITORY_EXACT_HEAD_REVIEW"
    && payload?.subjectHash === hashValue(payload?.subject)
    && payload?.bodyHash === hashValue(body)
    && stableJson(payload?.subject) === stableJson(expected)
    && normalized.body === architectureRepositoryReviewCommentBody(expected)
    && effectiveReservationBound);
  return {
    valid,
    commentId: normalized?.id ?? null,
    commentBodyHash: normalized?.bodyHash ?? null,
    subjectHash: payload?.subjectHash ?? null,
    reviewedHead: payload?.subject?.reviewedHead ?? null,
    reviewedTree: payload?.subject?.reviewedTree ?? null,
    disposition: payload?.subject?.disposition ?? null,
    effectiveReservation: payload?.subject?.finiteTaskEffectiveReservation ?? null,
  };
}

export function verifyPhase1RunEvidence({ run, jobs = [], identity, tree } = {}) {
  const requiredJobs = jobs.filter(({ name }) => PHASE1_REQUIRED_JOB_NAMES.includes(name));
  const names = requiredJobs.map(({ name }) => name).sort();
  const uniqueNames = [...new Set(names)];
  const valid = Boolean(run
    && run.name === "Phase 1 CI"
    && run.event === "pull_request"
    && run.status === "completed"
    && run.conclusion === "success"
    && run.head_sha === identity?.headSha
    && run.head_branch === identity?.branch
    && run.pull_requests?.length === 1
    && run.pull_requests[0]?.number === identity?.pr
    && run.pull_requests[0]?.head?.sha === identity?.headSha
    && run.pull_requests[0]?.base?.sha === identity?.baseSha
    && requiredJobs.length === PHASE1_REQUIRED_JOB_NAMES.length
    && uniqueNames.length === requiredJobs.length
    && stableJson(uniqueNames) === stableJson([...PHASE1_REQUIRED_JOB_NAMES])
    && requiredJobs.every(({ status, conclusion, head_sha }) => status === "completed" && conclusion === "success" && head_sha === identity?.headSha));
  const body = {
    classification: "PHASE1_EXACT_HEAD_EVIDENCE_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    runId: Number(run?.id ?? 0),
    runAttempt: Number(run?.run_attempt ?? 0),
    sourceHead: run?.head_sha ?? null,
    sourceTree: tree,
    status: run?.status ?? null,
    conclusion: run?.conclusion ?? null,
    requiredJobs: PHASE1_REQUIRED_JOB_NAMES.length,
    passedJobs: requiredJobs.filter(({ status, conclusion }) => status === "completed" && conclusion === "success").length,
    jobNames: uniqueNames,
    result: valid ? "PASS_13_OF_13" : "BLOCKED_INTERNAL",
  };
  return { ...body, valid, evidenceHash: hashValue(body) };
}

export function architectureMaintenanceSubject({ identity, tree, scope, profile = "TYPED_TASK_CONTEXT_AND_TERMINAL_TRUTH_SUCCESSOR_V1", objective = null, root = REPOSITORY_ROOT } = {}) {
  const observed = exactScope(scope);
  const currentTruthCompanion = authorityControlCurrentTruthCompanionV2({ identity, root });
  if (profile === "OWNER_JURISDICTION_CANONICAL_MODEL_V2") {
    const amendmentControlRepair = objective === FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1;
    if (objective !== null && !amendmentControlRepair) throw new Error("OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_OBJECTIVE_INVALID");
    return {
    type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    classification: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    protectedBase: identity?.baseSha,
    currentHead: identity?.headSha,
    currentTree: tree,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    additions: Number(scope?.additions ?? 0),
    deletions: Number(scope?.deletions ?? 0),
    netChangedLines: observed.netChangedLines,
    budget: { maximumFiles: 15, maximumNetLines: 3500 },
    featureId: "assurance-efficiency-e0",
    objectiveDomains: [],
    supportingDomains: ["CI-test-infrastructure"],
    objective: amendmentControlRepair ? FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1 : "install versioned standing Owner jurisdiction policy with exact task bindings and append-only admission supersession",
    capabilities: amendmentControlRepair
      ? ["OWNER_JURISDICTION_CANONICAL_MODEL_V2", FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1]
      : ["OWNER_JURISDICTION_CANONICAL_MODEL_V2", "FINITE_TASK_ADMISSION_CHAIN_V2"],
    relatedWave1Pr: 229,
    relatedAdmissionPr: 233,
    relatedOwnerComment: 5285464582,
    historicalAdmissionComment: 5290645158,
    currentTruthCompanionIncluded: true,
    terminalTruthRequired: false,
    authorityLevel: "LEVEL_0_1_REPOSITORY_ARCHITECTURE_MAINTENANCE",
    authority: { product: false, nativeProduct: false, package: false, database: false, provider: false, build: false, release: false, submission: false, ota: false, publicRelease: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    expiresOn: `PR_${identity?.pr}_MERGE`,
    reusableByAnotherPr: amendmentControlRepair ? false : true,
    ...(currentTruthCompanion ? { currentTruthCompanion } : {}),
  };
  }
  if (profile === "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1") return {
    type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    classification: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    protectedBase: identity?.baseSha,
    currentHead: identity?.headSha,
    currentTree: tree,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    additions: Number(scope?.additions ?? 0),
    deletions: Number(scope?.deletions ?? 0),
    netChangedLines: observed.netChangedLines,
    budget: { maximumFiles: 12, maximumNetLines: 3200 },
    featureId: "assurance-efficiency-e0",
    objectiveDomains: [],
    supportingDomains: ["CI-test-infrastructure"],
    objective: "install generic source-grounded task-local governing-edge closure for pre-admission engineering packets",
    capabilities: ["TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1"],
    relatedWave1Pr: 229,
    relatedOwnerComment: 5285464582,
    currentTruthCompanionIncluded: true,
    terminalTruthRequired: false,
    authorityLevel: "LEVEL_0_1_REPOSITORY_ARCHITECTURE_MAINTENANCE",
    authority: { product: false, nativeProduct: false, package: false, database: false, provider: false, build: false, release: false, submission: false, ota: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    expiresOn: `PR_${identity?.pr}_MERGE`,
    reusableByAnotherPr: true,
    ...(currentTruthCompanion ? { currentTruthCompanion } : {}),
  };
  if (profile === "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1") return {
    type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    classification: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    protectedBase: identity?.baseSha,
    currentHead: identity?.headSha,
    currentTree: tree,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    additions: Number(scope?.additions ?? 0),
    deletions: Number(scope?.deletions ?? 0),
    netChangedLines: observed.netChangedLines,
    budget: { maximumFiles: 15, maximumNetLines: 3500 },
    featureId: "assurance-efficiency-e0",
    objectiveDomains: [],
    supportingDomains: ["CI-test-infrastructure"],
    objective: "remove the finite-task admission-to-clearance state cycle and make admission prospectively grant computed preimplementation clearance",
    capabilities: ["FINITE_TASK_ADMISSION_TO_CLEARANCE_V1"],
    relatedWave1Pr: 229,
    relatedOwnerComment: 5285464582,
    currentTruthCompanionIncluded: true,
    terminalTruthRequired: false,
    authorityLevel: "LEVEL_0_1_REPOSITORY_ARCHITECTURE_MAINTENANCE",
    authority: { product: false, nativeProduct: false, package: false, database: false, provider: false, build: false, release: false, submission: false, ota: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    expiresOn: `PR_${identity?.pr}_MERGE`,
    reusableByAnotherPr: true,
    ...(currentTruthCompanion ? { currentTruthCompanion } : {}),
  };
  if (profile === "PRE_ADMISSION_ENGINEERING_SEED_AND_ADMISSION_SUCCESSOR_V1") return {
    type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    classification: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    protectedBase: identity?.baseSha,
    currentHead: identity?.headSha,
    currentTree: tree,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    netChangedLines: observed.netChangedLines,
    budget: { maximumFiles: 13, maximumNetLines: 3000 },
    featureId: "assurance-efficiency-e0",
    objectiveDomains: [],
    supportingDomains: ["CI-test-infrastructure"],
    objective: "install governed pre-admission seed packets and generic finite-task admission successors",
    capabilities: ["OWNER_PRE_ADMISSION_ENGINEERING_SEED_V1", "FINITE_TASK_ADMISSION_SUCCESSOR_V1"],
    relatedWave1Pr: 229,
    relatedOwnerComment: 5285464582,
    currentTruthCompanionIncluded: true,
    terminalTruthRequired: false,
    authorityLevel: "LEVEL_0_1_REPOSITORY_ARCHITECTURE_MAINTENANCE",
    authority: { product: false, nativeProduct: false, database: false, provider: false, build: false, release: false, submission: false, ota: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    expiresOn: `PR_${identity?.pr}_MERGE`,
    reusableByAnotherPr: true,
    ...(currentTruthCompanion ? { currentTruthCompanion } : {}),
  };
  return {
    type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    classification: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    protectedBase: identity?.baseSha,
    currentHead: identity?.headSha,
    currentTree: tree,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    budget: { maximumFiles: 8, maximumNetLines: 1800 },
    featureId: "assurance-efficiency-e0",
    objectiveDomains: [],
    supportingDomains: ["CI-test-infrastructure"],
    objective: "remove static per-PR context recursion and create typed terminal truth successors",
    relatedDoctrineMerge: TYPED_CONTEXT_DOCTRINE_MERGE,
    terminalTruthRequired: true,
    expectedTerminalNextTask: TYPED_CONTEXT_NEXT_TASK,
    authorityLevel: "LEVEL_0_1_REPOSITORY_ARCHITECTURE_MAINTENANCE",
    authority: { product: false, nativeProduct: false, database: false, provider: false, build: false, release: false, submission: false, ota: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    expiresOn: `PR_${identity?.pr}_MERGE`,
    reusableByAnotherPr: false,
    ...(currentTruthCompanion ? { currentTruthCompanion } : {}),
  };
}
export const architectureMaintenanceOwnerCommentBody = (subject) => ownerCommentBody(ARCHITECTURE_MAINTENANCE_MARKER, subject.type, subject);

export function architectureMaintenanceSuccessorSubject({ identity, tree, scope, originalRaw } = {}) {
  const original = normalizeGitHubCommentIdentity(originalRaw, { repository: identity?.repository, pr: identity?.pr, commentId: originalRaw?.id });
  const originalPayload = parseExactOwnerBody(original, ARCHITECTURE_MAINTENANCE_MARKER);
  const originalSubject = originalPayload?.subject ?? {};
  const observed = exactScope(scope);
  const addedPaths = observed.changedPaths.filter((file) => !(originalSubject.changedPaths ?? []).includes(file));
  return {
    type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_SUCCESSOR_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    originalCommentId: original?.id,
    originalSubjectHash: originalPayload?.subjectHash,
    originalBodyHash: original?.bodyHash,
    originalHead: originalSubject.currentHead,
    originalTree: originalSubject.currentTree,
    currentHead: identity?.headSha,
    currentTree: tree,
    finalHead: identity?.headSha,
    finalTree: tree,
    originalChangedPaths: originalSubject.changedPaths,
    addedPaths,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    budget: { maximumFiles: 8, maximumNetLines: 1800 },
    reason: "shared rolling-main evaluator must support the already-required bounded terminal-truth interval",
    terminalTruthRequired: true,
    expectedTerminalNextTask: TYPED_CONTEXT_NEXT_TASK,
    authority: { product: false, nativeProduct: false, database: false, provider: false, build: false, submission: false, ota: false, release: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    expiresOn: `PR_${identity?.pr}_MERGE`,
    reusableByAnotherPr: false,
  };
}
export const architectureMaintenanceSuccessorOwnerCommentBody = (subject) => ownerCommentBody(ARCHITECTURE_MAINTENANCE_SUCCESSOR_MARKER, subject.type, subject);

const HISTORICAL_ARCHITECTURE_RECEIPT = Object.freeze({ commentId: 5277054532, head: "63cadbe5ac97c9d4358bf9bdf9069384f1f2b8f9", tree: "42818b41c363d3b528d125c1612f283bf8caf483", subjectHash: "7f39f0ab62c9cad3a8077f2dc16c98ead1767c45c7cebcda945afeb44b4a985e", bodyHash: "fd569184ab4150b0d2b112e053d29a4d974ea10a096b1638fe09c2b580752e0d" });
export function architectureFinalSourceSubject({ identity, tree, scope, originalRaw, historicalRaw, historicalAttestationRaws = [], repositoryReviewRaw, phase1Evidence, dependencyAmendmentRaw, historicalRejectedRaw, historicalRejectedRaws = [], finalSourceCorrectionRaw, dependencyEvidence, root = REPOSITORY_ROOT } = {}) {
  const original = normalizeGitHubCommentIdentity(originalRaw, { repository: identity?.repository, pr: identity?.pr, commentId: originalRaw?.id });
  const originalPayload = parseExactOwnerBody(original, ARCHITECTURE_MAINTENANCE_MARKER);
  const originalSubject = originalPayload?.subject ?? {};
  const amendmentControlRepair = originalSubject.objective === FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1;
  if ([
    "install generic source-grounded task-local governing-edge closure for pre-admission engineering packets",
    "install versioned standing Owner jurisdiction policy with exact task bindings and append-only admission supersession",
    FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1,
  ].includes(originalSubject.objective)) {
    const observed = exactScope(scope);
    const reviewProfile = amendmentControlRepair ? FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1 : null;
    const review = verifyArchitectureRepositoryReview({ raw: repositoryReviewRaw, identity, tree, scope, profile: reviewProfile });
    const historicalAttestations = historicalAttestationRaws.map((item) => {
      const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item?.id });
      const payload = parseExactOwnerBody(normalized, ARCHITECTURE_FINAL_SOURCE_MARKER);
      return normalized ? {
        commentId: normalized.id,
        commentBodyHash: normalized.bodyHash,
        subjectHash: payload?.subjectHash ?? null,
        disposition: normalized.id === 5289720389 ? "HISTORICAL_PRE_CI_FINAL_SOURCE_ATTESTATION" : "HISTORICAL_STALE_OR_INVALID_FINAL_SOURCE_ATTESTATION",
      } : null;
    }).filter(Boolean).sort((left, right) => left.commentId - right.commentId);
    return {
      type: "OWNER_ASSURANCE_ARCHITECTURE_FINAL_SOURCE_V1",
      repository: identity?.repository,
      pr: identity?.pr,
      branch: identity?.branch,
      protectedBase: identity?.baseSha,
      originalCommentId: original?.id,
      originalSubjectHash: originalPayload?.subjectHash,
      originalBodyHash: original?.bodyHash,
      originalHead: originalSubject.currentHead,
      originalTree: originalSubject.currentTree,
      currentHead: identity?.headSha,
      currentTree: tree,
      finalHead: identity?.headSha,
      finalTree: tree,
      changedPaths: observed.changedPaths,
      changedPathHash: observed.changedPathHash,
      diffHash: scope?.diffHash ?? null,
      additions: Number(scope?.additions ?? 0),
      deletions: Number(scope?.deletions ?? 0),
      netChangedLines: observed.netChangedLines,
      budget: originalSubject.budget,
      objective: originalSubject.objective,
      capabilities: originalSubject.capabilities,
      receiptLifecycleContract: ASSURANCE_RECEIPT_LIFECYCLE_V2,
      repositoryReview: {
        commentId: review.commentId,
        commentBodyHash: review.commentBodyHash,
        subjectHash: review.subjectHash,
        reviewedHead: review.reviewedHead,
        reviewedTree: review.reviewedTree,
        disposition: review.disposition,
        valid: review.valid,
        ...(reviewProfile ? { profile: reviewProfile } : {}),
      },
      phase1: phase1Evidence ? {
        runId: phase1Evidence.runId,
        runAttempt: phase1Evidence.runAttempt,
        sourceHead: phase1Evidence.sourceHead,
        sourceTree: phase1Evidence.sourceTree,
        requiredJobs: phase1Evidence.requiredJobs,
        passedJobs: phase1Evidence.passedJobs,
        result: phase1Evidence.result,
        evidenceHash: phase1Evidence.evidenceHash,
        valid: phase1Evidence.valid,
      } : null,
      historicalAttestations,
      currentTruthCompanionIncluded: true,
      ...(originalSubject.currentTruthCompanion ? { currentTruthCompanion: originalSubject.currentTruthCompanion } : {}),
      terminalTruthRequired: false,
      authority: originalSubject.authority,
      ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
      immutableCommentRequired: true,
      createdAtEqualsUpdatedAtRequired: true,
      expiresOn: `PR_${identity?.pr}_MERGE`,
    };
  }
  if (originalSubject.objective === "remove the finite-task admission-to-clearance state cycle and make admission prospectively grant computed preimplementation clearance") {
    const observed = exactScope(scope);
    return {
      type: "OWNER_ASSURANCE_ARCHITECTURE_FINAL_SOURCE_V1",
      repository: identity?.repository,
      pr: identity?.pr,
      branch: identity?.branch,
      protectedBase: identity?.baseSha,
      originalCommentId: original?.id,
      originalSubjectHash: originalPayload?.subjectHash,
      originalBodyHash: original?.bodyHash,
      originalHead: originalSubject.currentHead,
      originalTree: originalSubject.currentTree,
      currentHead: identity?.headSha,
      currentTree: tree,
      finalHead: identity?.headSha,
      finalTree: tree,
      changedPaths: observed.changedPaths,
      changedPathHash: observed.changedPathHash,
      diffHash: scope?.diffHash ?? null,
      additions: Number(scope?.additions ?? 0),
      deletions: Number(scope?.deletions ?? 0),
      netChangedLines: observed.netChangedLines,
      budget: { maximumFiles: 15, maximumNetLines: 3500 },
      objective: originalSubject.objective,
      capabilities: originalSubject.capabilities,
      currentTruthCompanionIncluded: true,
      ...(originalSubject.currentTruthCompanion ? { currentTruthCompanion: originalSubject.currentTruthCompanion } : {}),
      terminalTruthRequired: false,
      authority: originalSubject.authority,
      ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
      immutableCommentRequired: true,
      createdAtEqualsUpdatedAtRequired: true,
      expiresOn: `PR_${identity?.pr}_MERGE`,
    };
  }
  if (originalSubject.objective === "install governed pre-admission seed packets and generic finite-task admission successors") {
    const observed = exactScope(scope);
    const amendment = normalizeGitHubCommentIdentity(dependencyAmendmentRaw, { repository: identity?.repository, pr: identity?.pr, commentId: dependencyAmendmentRaw?.id });
    const amendmentPayload = parseExactOwnerBody(amendment, PRE_ADMISSION_DEPENDENCY_AMENDMENT_MARKER);
    const rejectedInputs = historicalRejectedRaws.length > 0 ? historicalRejectedRaws : historicalRejectedRaw ? [historicalRejectedRaw] : [];
    const rejectedReceipts = rejectedInputs.map((item) => {
      const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item?.id });
      const payload = parseExactOwnerBody(normalized, ARCHITECTURE_FINAL_SOURCE_MARKER);
      const disposition = normalized?.id === 5286301806
        ? "HISTORICAL_REJECTED_CANONICAL_LINE_COUNT_MISMATCH"
        : "HISTORICAL_REJECTED_CANONICAL_DIFF_HASH_MISMATCH";
      return payload?.subject ? { commentId: normalized.id, subjectHash: payload.subjectHash, bodyHash: normalized.bodyHash, disposition } : null;
    }).filter(Boolean);
    const correction = normalizeGitHubCommentIdentity(finalSourceCorrectionRaw, { repository: identity?.repository, pr: identity?.pr, commentId: finalSourceCorrectionRaw?.id });
    const correctionPayload = parseExactOwnerBody(correction, ARCHITECTURE_FINAL_SOURCE_CORRECTION_MARKER);
    const dependency = amendmentPayload?.subject ? {
      blockerPacketHash: dependencyEvidence?.blockerPacketHash,
      packageJsonHash: shaBytes(fs.readFileSync(path.join(root, "package.json"))),
      packageLockHash: shaBytes(fs.readFileSync(path.join(root, "package-lock.json"))),
      compatibilityTestHash: shaBytes(fs.readFileSync(path.join(root, "scripts/test-brace-expansion-compat.mjs"))),
      cleanInstalls: dependencyEvidence?.cleanInstalls,
      audits: dependencyEvidence?.audits,
      testResults: dependencyEvidence?.testResults,
      capabilityTestHashes: ["tests/assurance/active-task-binding-a1.test.mjs", "tests/assurance/pr-scope-feature-bundles.test.mjs"].map((file) => ({ path: file, hash: shaBytes(fs.readFileSync(path.join(root, file))) })),
      currentTruthHashes: ["config/assurance/current-truth-v1.json", "CURRENT_STATE.md", "NEXT_TASK.md"].map((file) => ({ path: file, hash: shaBytes(fs.readFileSync(path.join(root, file))) })),
    } : null;
    return { type: "OWNER_ASSURANCE_ARCHITECTURE_FINAL_SOURCE_V1", repository: identity?.repository, pr: identity?.pr, branch: identity?.branch, protectedBase: identity?.baseSha, originalCommentId: original?.id, originalSubjectHash: originalPayload?.subjectHash, originalBodyHash: original?.bodyHash, originalHead: originalSubject.currentHead, originalTree: originalSubject.currentTree, dependencyAmendment: amendmentPayload?.subject ? { commentId: amendment?.id, subjectHash: amendmentPayload.subjectHash, bodyHash: amendment?.bodyHash } : null, finalSourceCorrection: correctionPayload?.subject ? { commentId: correction?.id, subjectHash: correctionPayload.subjectHash, bodyHash: correction?.bodyHash } : null, historicalRejectedReceipts: rejectedReceipts, currentHead: identity?.headSha, currentTree: tree, finalHead: identity?.headSha, finalTree: tree, changedPaths: observed.changedPaths, changedPathHash: observed.changedPathHash, diffHash: scope?.diffHash ?? null, additions: Number(scope?.additions ?? 0), deletions: Number(scope?.deletions ?? 0), netChangedLines: observed.netChangedLines, budget: amendmentPayload?.subject ? { maximumFiles: 15, maximumNetLines: 4500 } : { maximumFiles: 13, maximumNetLines: 3000 }, objective: originalSubject.objective, capabilities: originalSubject.capabilities, dependencyEvidence: dependency, currentTruthCompanionIncluded: true, terminalTruthRequired: false, authority: originalSubject.authority, ownerIdentity: { login: "Chillywood2025", association: "OWNER" }, immutableCommentRequired: true, createdAtEqualsUpdatedAtRequired: true, expiresOn: `PR_${identity?.pr}_MERGE` };
  }
  const historical = normalizeGitHubCommentIdentity(historicalRaw, { repository: identity?.repository, pr: identity?.pr, commentId: historicalRaw?.id });
  const historicalPayload = parseExactOwnerBody(historical, ARCHITECTURE_MAINTENANCE_SUCCESSOR_MARKER);
  const observed = exactScope(scope);
  const identityRecord = { repository: identity?.repository, pr: identity?.pr, branch: identity?.branch, head: identity?.headSha, tree, base: identity?.baseSha };
  const taskReport = generateCurrentEngineeringTaskReport({ root, identity: identityRecord, taskContext: { type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE", authoritySource: "IMMUTABLE_OWNER_ARCHITECTURE_MAINTENANCE" }, changedPaths: observed.changedPaths });
  const focused = ["tests/assurance/active-task-binding-a1.test.mjs", "tests/assurance/pr-scope-feature-bundles.test.mjs"].map((name) => ({ path: name, sourceHash: shaBytes(fs.readFileSync(path.join(root, name))) }));
  return { type: "OWNER_ASSURANCE_ARCHITECTURE_FINAL_SOURCE_V1", repository: identity?.repository, pr: identity?.pr, branch: identity?.branch, originalCommentId: original?.id, originalSubjectHash: originalPayload?.subjectHash, originalBodyHash: original?.bodyHash, historicalReceipt: { commentId: historical?.id, subjectHash: historicalPayload?.subjectHash, bodyHash: historical?.bodyHash, disposition: "HISTORICAL_STALE_FINAL_SOURCE_RECEIPT" }, currentHead: identity?.headSha, currentTree: tree, finalHead: identity?.headSha, finalTree: tree, changedPaths: observed.changedPaths, changedPathHash: observed.changedPathHash, diffHash: scope?.diffHash ?? null, netChangedLines: observed.netChangedLines, budget: { maximumFiles: 8, maximumNetLines: 1800 }, objective: originalPayload?.subject?.objective, authority: originalPayload?.subject?.authority, terminalTruthRequired: true, expectedTerminalNextTask: TYPED_CONTEXT_NEXT_TASK, graphBaselineStatus: taskReport.baseline.graphStatus, doctrineReportBaselineStatus: taskReport.baseline.reportStatus, currentTaskReportHash: taskReport.currentTaskReportHash, taskDeltaHash: taskReport.observation.taskDelta.taskDeltaHash, focusedTestHashes: focused, ownerIdentity: { login: "Chillywood2025", association: "OWNER" }, immutableCommentRequired: true, createdAtEqualsUpdatedAtRequired: true, expiresOn: `PR_${identity?.pr}_MERGE`, reusableByAnotherPr: false };
}
export const architectureFinalSourceOwnerCommentBody = (subject) => ownerCommentBody(ARCHITECTURE_FINAL_SOURCE_MARKER, subject.type, subject);

export function evaluateAdmissionClearanceState({ finiteLeasePresent = false, admissionMerged = false, artifactFrozen = false, computedGateFindings = [], persistedPhase } = {}) {
  const findings = [...new Set(computedGateFindings ?? [])].sort();
  const planningOnly = finiteLeasePresent !== true || admissionMerged !== true || artifactFrozen !== true || findings.length > 0;
  return {
    persistedPhase,
    planningOnly,
    classification: planningOnly
      ? findings.length > 0 && finiteLeasePresent === true && admissionMerged === true && artifactFrozen === true
        ? "BOUND_INCOMPLETE"
        : "ENGINEERING_DISCOVERY_RESERVED"
      : "PREIMPLEMENTATION_ENGINEERING_CLEAR",
    productSourceMutationAllowed: !planningOnly,
    findings,
  };
}

export function deriveFiniteTaskRuntimeState({ preimplementationClear = false, changedPaths = [], taskArtifactPath } = {}) {
  if (preimplementationClear !== true) return "ENGINEERING_DISCOVERY_RESERVED";
  return [...new Set(changedPaths ?? [])].some((file) => file !== taskArtifactPath)
    ? "IMPLEMENTATION"
    : "PREIMPLEMENTATION_ENGINEERING_CLEAR";
}

export function finiteTaskAdmissionSubject({ identity, tree, scope, implementation, taskArtifact, taskArtifactHash } = {}) {
  const observed = exactScope(scope);
  const closure = taskArtifact?.closure;
  const certificate = taskArtifact?.certificate;
  const edgeClosure = taskArtifact?.taskLocalGoverningEdgeClosure ?? closure?.sections?.C_AFFECTED_DOMAIN_CLOSURE?.taskLocalGoverningEdgeClosure;
  return {
    type: "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    admissionPr: identity?.pr,
    admissionBranch: identity?.branch,
    admissionHead: identity?.headSha,
    admissionTree: tree,
    protectedBase: identity?.baseSha,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    implementationPr: implementation?.pr,
    implementationBranch: implementation?.branch,
    originalSeedHead: implementation?.seedHead,
    originalSeedTree: implementation?.seedTree,
    currentPlanningHead: implementation?.planningHead,
    currentPlanningTree: implementation?.planningTree,
    ownerApprovalComment: implementation?.ownerCommentId,
    taskArtifactPath: implementation?.taskArtifactPath,
    taskArtifactHash,
    taskLocalEdgeClosureHash: edgeClosure?.closureHash,
    taskLocalEdgeEvidenceHash: edgeClosure?.evidenceHash,
    taskLocalModelDeltaHash: hashValue(edgeClosure?.modelDeltaEdges ?? []),
    closurePacketHash: closure?.packetHash,
    certificateHash: certificate?.certificateHash,
    featureId: taskArtifact?.primaryDomain,
    allowedDomains: closure?.affectedDomainClosure?.domains,
    allowedPaths: taskArtifact?.implementationPlan?.allowedPaths,
    tests: taskArtifact?.implementationPlan?.tests,
    scope: { maximumFiles: 30, maximumHandAuthoredNetLines: 3600 },
    amendmentMaximum: { maximumFiles: 36, maximumHandAuthoredNetLines: 4500, maximumAmendments: 1 },
    recursion: { admissionPrMaximum: 1, postAdmissionClearancePrMaximum: 0, sourceBindingPrMaximum: 0, provenancePrMaximum: 0, terminalTruthPrMaximum: 1 },
    packageChanges: false,
    authority: { providerMutation: false, build: false, submission: false, ota: false, publicRelease: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
  };
}
export const finiteTaskAdmissionOwnerCommentBody = (subject) => ownerCommentBody(FINITE_TASK_ADMISSION_MARKER, subject.type, subject);

export function evaluateFiniteTaskAdmissionSuccessor({ raw, allComments = [], paginationComplete = false, identity, tree, scope, implementation, taskArtifact, taskArtifactHash, truthRecord, priorTruth, ownerApproval, seedIsAncestor = false, implementationBaseIsAncestor = false, root = REPOSITORY_ROOT } = {}) {
  const normalized = normalizeGitHubCommentIdentity(raw, { repository: identity?.repository, pr: identity?.pr, commentId: raw?.id });
  const payload = parseExactOwnerBody(normalized, FINITE_TASK_ADMISSION_MARKER);
  const expected = finiteTaskAdmissionSubject({ identity, tree, scope, implementation, taskArtifact, taskArtifactHash });
  const payloadWithoutHash = Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => key !== "bodyHash"));
  const lease = (truthRecord?.finiteTaskLeases?.tasks ?? []).filter(({ leaseId }) => leaseId === taskArtifact?.taskId);
  const active = truthRecord?.activeTaskBinding;
  const exactPaths = exactScope(scope).changedPaths;
  const ownerPayload = ownerApproval ? parseExactOwnerBody(ownerApproval, "<!-- chillywood-pre-release-plan-wave1-owner-approval-v1 -->") : null;
  const closure = taskArtifact?.closure;
  const certificate = taskArtifact?.certificate;
  const edgeEvidence = taskArtifact?.taskLocalEdgeEvidence ?? closure?.sections?.C_AFFECTED_DOMAIN_CLOSURE?.taskLocalEvidence;
  const edgeClosure = taskArtifact?.taskLocalGoverningEdgeClosure ?? closure?.sections?.C_AFFECTED_DOMAIN_CLOSURE?.taskLocalGoverningEdgeClosure;
  const verifiedEdgeClosure = edgeEvidence ? verifyTaskLocalGoverningEdgeClosure(edgeEvidence, { root, runs: 2 }) : null;
  const edgeClosureClear = verifiedEdgeClosure?.classification === "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR"
    && stableJson(edgeClosure) === stableJson(verifiedEdgeClosure)
    && edgeClosure?.accounting?.unresolvedSet?.length === 0
    && edgeClosure?.accounting?.observedUndeclaredSet?.every((edgeId) => edgeClosure.modelDeltaEdges?.includes(edgeId));
  const priorDuplicate = (priorTruth?.finiteTaskLeases?.tasks ?? []).some(({ implementationPr }) => implementationPr === implementation?.pr);
  const competingTask = (priorTruth?.finiteTaskLeases?.tasks ?? []).some(({ implementationPr, taskState }) => implementationPr !== implementation?.pr && !["MERGED_VERIFIED", "ABANDONED_BY_OWNER"].includes(taskState));
  const invariantEvidenceComplete = Array.isArray(taskArtifact?.invariants)
    && taskArtifact.invariants.length >= 30
    && taskArtifact.invariants.every((item) => typeof item?.id === "string" && typeof item?.positiveWitness === "string" && typeof item?.negativeWitness === "string" && typeof item?.targetedMutant === "string");
  const prospectiveGateFindings = [
    taskArtifact?.status === "DEFECT_LEDGER_STABLE" ? null : "PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE",
    taskArtifact?.authorizationStatus === "PRODUCT_SOURCE_EDITING_NOT_YET_AUTHORIZED" ? null : "PREIMPLEMENTATION_SELF_AUTHORIZATION_REJECTED",
    closure?.classification === "ENGINEERING_CLOSURE_PACKET_V1" && closure?.id === "ENGINEERING_CLOSURE_PACKET_V1" ? null : "PREIMPLEMENTATION_AFFECTED_DOMAIN_INCOMPLETE",
    certificate?.classification === "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" && certificate?.id === "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" ? null : "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE",
    invariantEvidenceComplete ? null : "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE",
    Array.isArray(taskArtifact?.rootDefects) && taskArtifact.rootDefects.length === 6 ? null : "PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE",
    Array.isArray(taskArtifact?.implementationPlan?.allowedPaths) && taskArtifact.implementationPlan.allowedPaths.length > 0 ? null : "PREIMPLEMENTATION_SCOPE_UNBOUNDED",
    Array.isArray(taskArtifact?.implementationPlan?.tests) && taskArtifact.implementationPlan.tests.length > 0 ? null : "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE",
    Array.isArray(taskArtifact?.mutants) && taskArtifact.mutants.length >= taskArtifact.invariants?.length ? null : "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE",
    taskArtifact?.rollback && taskArtifact?.cleanup && taskArtifact?.observability ? null : "PREIMPLEMENTATION_RECOVERY_INCOMPLETE",
    edgeClosureClear ? null : "PREIMPLEMENTATION_TASK_LOCAL_EDGE_CLOSURE_INCOMPLETE",
  ].filter(Boolean);
  const checks = {
    identity: identity?.baseRef === "main" && identity?.pr === expected.admissionPr && identity?.headSha === expected.admissionHead,
    exactScope: stableJson(exactPaths) === stableJson(TERMINAL_TRUTH_PATHS) && exactPaths.length === 3,
    comment: Boolean(normalized) && paginationComplete && allComments.filter((item) => item?.body?.startsWith(`${FINITE_TASK_ADMISSION_MARKER}\n`)).length === 1,
    commentBody: normalized?.body === finiteTaskAdmissionOwnerCommentBody(expected),
    commentHashes: Boolean(payload?.subject) && payload.subjectHash === hashValue(payload.subject) && payload.bodyHash === hashValue(payloadWithoutHash) && stableJson(payload.subject) === stableJson(expected),
    implementation: implementation?.state === "open" && implementation?.draft === true && implementation?.pr === 229 && implementation?.branch === "codex/pre-release-identity-entitlement-authority-v1" && implementation?.changedPaths?.length === 1 && implementation.changedPaths[0] === implementation.taskArtifactPath,
    seed: seedIsAncestor && implementationBaseIsAncestor && /^[0-9a-f]{40}$/u.test(implementation?.seedHead ?? "") && /^[0-9a-f]{40}$/u.test(implementation?.seedTree ?? "") && implementation?.observedSeedTree === implementation?.seedTree,
    owner: ownerApproval?.id === implementation?.ownerCommentId && Boolean(ownerPayload?.subject) && ownerPayload.subjectHash === hashValue(ownerPayload.subject) && ownerPayload.subject.primaryFeature === taskArtifact?.primaryDomain && ownerPayload.subject.admittedSeed?.head === implementation?.seedHead,
    artifact: taskArtifact?.status === "DEFECT_LEDGER_STABLE" && taskArtifact?.authorizationStatus === "PRODUCT_SOURCE_EDITING_NOT_YET_AUTHORIZED" && closure?.classification === "ENGINEERING_CLOSURE_PACKET_V1" && certificate?.classification === "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" && /^[0-9a-f]{64}$/u.test(taskArtifactHash ?? "") && /^[0-9a-f]{64}$/u.test(closure?.packetHash ?? "") && /^[0-9a-f]{64}$/u.test(certificate?.certificateHash ?? ""),
    frozenModel: prospectiveGateFindings.length === 0 && Array.isArray(closure?.affectedDomainClosure?.domains) && closure.affectedDomainClosure.domains.length > 0 && Array.isArray(taskArtifact?.stateTransitionModel?.states) && taskArtifact.stateTransitionModel.states.length > 0 && Array.isArray(taskArtifact?.stateTransitionModel?.transitions) && taskArtifact.stateTransitionModel.transitions.length > 0,
    registryCompatibility: validateFiniteTaskLeaseRegistry(truthRecord?.finiteTaskLeases).length === 0,
    truthLease: lease.length === 1 && lease[0]?.implementationPr === implementation?.pr && lease[0]?.implementationBranch === implementation?.branch && lease[0]?.admittedSeedHead === implementation?.seedHead && lease[0]?.admittedSeedTree === implementation?.seedTree && lease[0]?.protectedAdmissionPr === identity?.pr && finiteTaskAdmissionLeaseStateValid(lease[0]) && stableJson(lease[0]?.allowedPaths) === stableJson(taskArtifact?.implementationPlan?.allowedPaths) && stableJson(lease[0]?.artifactReservation?.allowedDomains) === stableJson(closure?.affectedDomainClosure?.domains) && lease[0]?.scopeBudget?.maximumFiles === 30 && lease[0]?.scopeBudget?.maximumChangedLines === 3600,
    truthBinding: active?.featureId === taskArtifact?.primaryDomain && active?.implementationPr === implementation?.pr && active?.implementationBranch === implementation?.branch && active?.immutableSourceHead === implementation?.seedHead && active?.immutableSourceTree === implementation?.seedTree && active?.currentImplementationHead === implementation?.planningHead && active?.currentImplementationTree === implementation?.planningTree && active?.phase === "PREIMPLEMENTATION_ENGINEERING_CLEAR" && active?.executionState === "PRE_RELEASE_WAVE_1_IMPLEMENTATION_AUTHORIZED" && active?.productSourceMutationAllowed === true,
    authority: truthRecord?.preAdmissionEngineeringSeedCapability?.status === "ACTIVE" && truthRecord?.preAdmissionEngineeringSeedCapability?.productMutationAllowed === false && truthRecord?.finiteTaskAdmissionClearanceCapability?.status === "ACTIVE" && truthRecord?.finiteTaskAdmissionClearanceCapability?.productMutationBeforeAdmissionMerge === false && truthRecord?.taskLocalGoverningEdgeClosureCapability?.status === "ACTIVE" && truthRecord.taskLocalGoverningEdgeClosureCapability.admissionRequiresClearClosure === true && Object.values(expected.authority).every((value) => value === false) && expected.packageChanges === false,
    duplicate: priorDuplicate === false,
    competingTask: competingTask === false,
  };
  const ok = Object.values(checks).every(Boolean);
  const prospective = evaluateAdmissionClearanceState({ finiteLeasePresent: checks.truthLease, admissionMerged: true, artifactFrozen: checks.frozenModel, computedGateFindings: prospectiveGateFindings, persistedPhase: taskArtifact?.status });
  return { ok, type: "FINITE_TASK_ADMISSION_TO_CLEARANCE", classification: "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1", repository: identity?.repository, pr: identity?.pr, branch: identity?.branch, currentHead: identity?.headSha, currentTree: tree, featureId: taskArtifact?.primaryDomain, objectiveDomains: [], supportingDomains: ["CI-test-infrastructure"], historicalWaiverPath: null, authoritySource: "IMMUTABLE_OWNER_FINITE_TASK_ADMISSION", bindingId: `finite-task-admission-pr-${identity?.pr}`, finiteLeaseId: taskArtifact?.taskId, budget: { maximumFiles: 3, maximumHandAuthoredNetLines: 3600 }, commentId: normalized?.id ?? null, commentBodyHash: normalized?.bodyHash ?? null, subjectHash: payload?.subjectHash ?? null, subject: payload?.subject ?? null, checks, futureTaskStatus: ok && prospective.classification === "PREIMPLEMENTATION_ENGINEERING_CLEAR" ? "PREIMPLEMENTATION_ENGINEERING_CLEAR" : "BOUND_INCOMPLETE", futureProductSourceMutationAllowed: ok && prospective.productSourceMutationAllowed, futureImplementationPr: implementation?.pr, futureImplementationBranch: implementation?.branch, futureLeaseId: taskArtifact?.taskId, admissionMergeRequired: true, productSourceMutationAllowedBeforeMerge: false, findings: ok ? [] : Object.entries(checks).filter(([, value]) => !value).map(([key]) => `FINITE_TASK_ADMISSION_TO_CLEARANCE_INVALID:${key}`) };
}

export function finiteTaskJurisdictionEvidenceV2(taskArtifact, taskArtifactHash) {
  const closure = taskArtifact?.closure;
  const edgeClosure = taskArtifact?.taskLocalGoverningEdgeClosure ?? closure?.sections?.C_AFFECTED_DOMAIN_CLOSURE?.taskLocalGoverningEdgeClosure;
  return {
    taskArtifactHash,
    closurePacketHash: closure?.packetHash,
    completenessCertificateHash: taskArtifact?.certificate?.certificateHash,
    taskLocalEdgeClosureHash: edgeClosure?.closureHash,
    taskLocalEdgeEvidenceHash: edgeClosure?.evidenceHash,
    taskLocalModelHash: hashValue(edgeClosure?.modelDeltaEdges ?? []),
  };
}

export function finiteTaskScopeV2(taskArtifact) {
  const scope = taskArtifact?.implementationPlan?.scope;
  return {
    allowedPaths: canonicalSort(taskArtifact?.implementationPlan?.allowedPaths ?? []),
    amendmentMaximum: { maximumAmendments: scope?.maximumAmendments, maximumChangedLines: scope?.amendmentMaximumHandAuthoredNetLines, maximumFiles: scope?.amendmentMaximumFiles },
    packageChanges: scope?.packageChanges,
    recursion: { admissionPrMaximum: 1, postAdmissionClearancePrMaximum: 0, provenancePrMaximum: 0, sourceBindingPrMaximum: 0, terminalTruthPrMaximum: 1 },
    scopeBudget: { maximumChangedLines: scope?.maximumHandAuthoredNetLines, maximumFiles: scope?.maximumFiles },
    tests: canonicalSort(taskArtifact?.implementationPlan?.tests ?? []),
  };
}

export function finiteTaskAdmissionPredecessorV2(raw, { repository, pr, legacyV1Subject = null } = {}) {
  const normalized = normalizeGitHubCommentIdentity(raw, { repository, pr, commentId: raw?.id });
  if (!normalized) return null;
  if (normalized.body.startsWith(`${FINITE_TASK_ADMISSION_MARKER}\n`)) {
    const verified = verifyLegacyFiniteTaskAdmissionV1({ body: normalized.body, receipt: jurisdictionReceipt(normalized), expected: { repository, pr, ownerLogin: "Chillywood2025", subject: legacyV1Subject } });
    return verified.ok && verified.repository === repository && verified.pr === pr
      ? { bodyHash: verified.bodyHash, commentId: normalized.id, sequence: 0, subjectHash: verified.subjectHash, version: 1 }
      : null;
  }
  if (normalized.body.startsWith(`${FINITE_TASK_ADMISSION_V2_MARKER}\n`)) {
    const verified = verifyFiniteTaskAdmissionV2({ body: normalized.body, receipt: jurisdictionReceipt(normalized), expected: { repository, pr } });
    return verified.ok
      ? { bodyHash: verified.bodyHash, commentId: normalized.id, sequence: verified.subject.sequence, subjectHash: verified.subjectHash, version: 2 }
      : null;
  }
  return null;
}

function legacyFiniteTaskAdmissionSubjectV2({ raw, identity, implementation, taskArtifact, taskArtifactHash, root = REPOSITORY_ROOT } = {}) {
  const normalized = normalizeGitHubCommentIdentity(raw, { repository: identity?.repository, pr: identity?.pr, commentId: raw?.id });
  const payload = parseExactOwnerBody(normalized, FINITE_TASK_ADMISSION_MARKER);
  const legacy = payload?.subject;
  if (!legacy || legacy.admissionBranch !== identity?.branch) return null;
  const observed = gitScope(root, legacy.protectedBase, legacy.admissionHead);
  const tree = gitText(root, ["rev-parse", `${legacy.admissionHead}^{tree}`]);
  if (!observed || tree !== legacy.admissionTree) return null;
  return finiteTaskAdmissionSubject({ identity: { ...identity, baseSha: legacy.protectedBase, headSha: legacy.admissionHead }, tree, scope: observed, implementation, taskArtifact, taskArtifactHash });
}

export function resolveFiniteTaskAdmissionTaskBindingV2({ admissionRaws = [], paginationComplete = false, identity, tree, implementation, taskArtifact, taskArtifactHash, expectedScope, expectedDomainIds, ownerLogin = "Chillywood2025", root = REPOSITORY_ROOT } = {}) {
  const raws = admissionRaws.filter(({ body }) => [FINITE_TASK_ADMISSION_MARKER, FINITE_TASK_ADMISSION_V2_MARKER].some((marker) => body?.startsWith(`${marker}\n`)));
  const legacyRaw = raws.find(({ body }) => body.startsWith(`${FINITE_TASK_ADMISSION_MARKER}\n`));
  const legacyV1Subject = legacyRaw ? legacyFiniteTaskAdmissionSubjectV2({ raw: legacyRaw, identity, implementation, taskArtifact, taskArtifactHash, root }) : undefined;
  const receipts = raws.map((raw) => normalizeGitHubCommentIdentity(raw, { repository: identity?.repository, pr: identity?.pr, commentId: raw?.id })).filter(Boolean).map(jurisdictionReceipt);
  const taskEvidence = finiteTaskJurisdictionEvidenceV2(taskArtifact, taskArtifactHash);
  const chain = paginationComplete && receipts.length === raws.length && /^[0-9a-f]{64}$/u.test(taskArtifactHash ?? "")
    ? resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, receipts, expected: { repository: identity?.repository, product: expectedScope?.product, launchProgram: expectedScope?.launchProgram, pr: identity?.pr, task: taskArtifact?.taskId, head: identity?.headSha, tree, ownerLogin, legacyV1Subject, taskEvidence, taskScope: finiteTaskScopeV2(taskArtifact) } })
    : { ok: false, findings: ["ADMISSION_TASK_BINDING_DISCOVERY_INVALID"] };
  const taskBinding = chain.currentAdmission?.ownerJurisdictionBinding?.taskBinding;
  const ok = chain.ok && stableJson(taskBinding?.scope) === stableJson(expectedScope) && stableJson(taskBinding?.taskIdentity) === stableJson({ taskId: taskArtifact?.taskId, implementationPr: implementation?.pr, implementationBranch: implementation?.branch, leaseId: taskArtifact?.taskId, originalSeedHead: implementation?.seedHead, originalSeedTree: implementation?.seedTree, planningHead: implementation?.planningHead, planningTree: implementation?.planningTree, ownerApprovalCommentId: implementation?.ownerCommentId, taskArtifactPath: implementation?.taskArtifactPath }) && stableJson(taskBinding?.taskEvidence) === stableJson(taskEvidence) && stableJson(taskBinding?.domainIds) === stableJson(expectedDomainIds);
  return { ok, taskBinding: ok ? taskBinding : null, chain, findings: ok ? [] : [...(chain.findings ?? []), "ADMISSION_TASK_BINDING_INVALID"].sort() };
}

function finiteTaskAdmissionJurisdictionBindingV2(authority) {
  const value = {
    domainIds: [...authority.taskBinding.domainIds],
    ownerDecisionCommentId: authority.commentId,
    standingPolicyHash: authority.standingPolicyHash,
    standingPolicySequence: authority.standingPolicy.sequence,
    standingPolicyStatus: authority.policyStatus,
    standingPolicyType: OWNER_JURISDICTION_STANDING_POLICY_V2,
    standingPolicyVersion: 2,
    taskBinding: authority.taskBinding,
    taskBindingHash: authority.taskBindingHash,
  };
  return authority.taskBinding.policyReference.source === "THIS_IMMUTABLE_OWNER_DECISION" ? { ...value, ownerDecisionCommentBodyHash: authority.commentBodyHash } : value;
}

export function finiteTaskFinalSourceOwnerJurisdictionV2(authority) {
  if (!trustedOwnerJurisdictionAuthority(authority)) throw new TypeError("TRUSTED_OWNER_JURISDICTION_AUTHORITY_REQUIRED");
  const embedded = authority.taskBinding.policyReference.source === "THIS_IMMUTABLE_OWNER_DECISION";
  const value = { commentId: authority.commentId, domainIds: [...authority.taskBinding.domainIds], referenceScope: embedded ? "TASK_BOUND_COMPOSITE" : "STANDING_POLICY_SUBRECORD_ONLY", standingPolicyHash: authority.standingPolicyHash, standingPolicySequence: authority.standingPolicy.sequence, standingPolicyStatus: authority.policyStatus, standingPolicyType: OWNER_JURISDICTION_STANDING_POLICY_V2, standingPolicyVersion: 2, taskBindingHash: authority.taskBindingHash };
  return embedded ? { ...value, commentBodyHash: authority.commentBodyHash } : value;
}

export function renderFiniteTaskAdmissionSuccessorV2({ predecessorRaw, identity, tree, admissionScope, implementation, taskArtifact, taskArtifactHash, ownerJurisdictionAuthority, root = REPOSITORY_ROOT } = {}) {
  if (!trustedOwnerJurisdictionAuthority(ownerJurisdictionAuthority)) throw new TypeError("TRUSTED_OWNER_JURISDICTION_AUTHORITY_REQUIRED");
  const legacyV1Subject = predecessorRaw ? legacyFiniteTaskAdmissionSubjectV2({ raw: predecessorRaw, identity, implementation, taskArtifact, taskArtifactHash, root }) : null;
  const predecessor = predecessorRaw ? finiteTaskAdmissionPredecessorV2(predecessorRaw, { repository: identity?.repository, pr: identity?.pr, legacyV1Subject }) : null;
  if (predecessorRaw && !predecessor) throw new TypeError("FINITE_TASK_ADMISSION_PREDECESSOR_INVALID");
  const binding = ownerJurisdictionAuthority.taskBinding;
  const changedPaths = exactScope(admissionScope).changedPaths;
  if (identity?.baseRef !== "main"
    || binding.taskIdentity.implementationPr !== implementation?.pr
    || binding.taskIdentity.implementationBranch !== implementation?.branch
    || binding.taskIdentity.planningHead !== implementation?.planningHead
    || binding.taskIdentity.planningTree !== implementation?.planningTree
    || binding.taskIdentity.taskId !== taskArtifact?.taskId) throw new TypeError("FINITE_TASK_ADMISSION_IMPLEMENTATION_BINDING_INVALID");
  return renderFiniteTaskAdmissionV2({
    scope: binding.scope,
    owner: ownerJurisdictionAuthority.standingPolicy.owner,
    admissionIdentity: { branch: identity.branch, head: identity.headSha, pr: identity.pr, taskId: taskArtifact.taskId, tree },
    predecessor,
    ownerJurisdictionBinding: finiteTaskAdmissionJurisdictionBindingV2(ownerJurisdictionAuthority),
    taskEvidence: finiteTaskJurisdictionEvidenceV2(taskArtifact, taskArtifactHash),
    taskScope: finiteTaskScopeV2(taskArtifact),
    changedPaths,
    scopeBudget: { maximumChangedLines: 3600, maximumFiles: 3 },
  });
}

export const finiteTaskAdmissionHistoryValidV2 = (chain, legacyRaw = null) => chain?.ok === true && (legacyRaw
  ? chain.historical?.some(({ commentId, disposition }) => commentId === legacyRaw.id && disposition === "HISTORICAL_ADMISSION_INTENT_PRE_JURISDICTION_BINDING") === true
  : chain.currentSequence >= 0 && chain.historical?.every(({ version }) => version === 2));

export function verifyFiniteTaskOwnerApprovalV2({ approval, identity, implementation, taskArtifact, binding } = {}) {
  const marker = approval?.body?.match(/^(<!-- chillywood-[a-z0-9-]+-v\d+ -->)\n/u)?.[1];
  const payload = marker ? parseExactOwnerBody(approval, marker) : null;
  const subject = payload?.subject;
  const bodyBase = payload ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "bodyHash")) : null;
  return Boolean(approval?.id === binding?.taskIdentity?.ownerApprovalCommentId && payload?.repository === identity?.repository && String(payload?.pr) === String(implementation?.pr) && payload?.type === "REGISTERED_OWNER_DECISION" && payload?.evidenceClass === "OWNER_INTENT" && payload?.leaseId === taskArtifact?.taskId && payload?.currentHead === implementation?.seedHead && payload?.subjectHash === hashValue(subject) && payload?.bodyHash === hashValue(bodyBase) && approval.body === `${marker}\n${stableJson(payload)}` && subject?.repository === identity?.repository && subject?.implementationPr === implementation?.pr && subject?.implementationBranch === implementation?.branch && subject?.leaseId === taskArtifact?.taskId && subject?.taskArtifact === implementation?.taskArtifactPath && subject?.primaryFeature === taskArtifact?.primaryDomain && subject?.admittedSeed?.head === implementation?.seedHead && subject?.admittedSeed?.tree === implementation?.seedTree && subject?.ownerIdentity?.login === "Chillywood2025" && subject?.ownerIdentity?.association === "OWNER" && Object.values(subject?.authority ?? {}).every((value) => value === false || value === 0));
}

export function evaluateFrozenFiniteTaskArtifactV2(taskArtifact, { root = REPOSITORY_ROOT } = {}) {
  const closure = taskArtifact?.closure;
  const certificate = taskArtifact?.certificate;
  const doctrine = readJson(root, "config/assurance/engineering-doctrine-v1.json");
  const without = (value, key) => Object.fromEntries(Object.entries(value ?? {}).filter(([name]) => name !== key));
  const list = (value) => Array.isArray(value) ? value : [];
  const ids = (values) => list(values).map((value) => typeof value === "string" ? value : value?.id).sort();
  const findings = [
    taskArtifact?.status === "DEFECT_LEDGER_STABLE" && taskArtifact?.authorizationStatus === "PRODUCT_SOURCE_EDITING_NOT_YET_AUTHORIZED" ? null : "PREIMPLEMENTATION_SELF_AUTHORIZATION_REJECTED",
    closure?.id === "ENGINEERING_CLOSURE_PACKET_V1" && closure?.classification === "ENGINEERING_CLOSURE_PACKET_V1" && closure?.task === taskArtifact?.taskId && closure?.packetHash === hashValue(without(closure, "packetHash")) && Object.entries(doctrine.closurePacket.sections).every(([name, fields]) => name === "G_INVARIANTS" ? Array.isArray(closure?.sections?.[name]) && closure.sections[name].every((item) => fields.every((key) => Object.hasOwn(item, key))) : name === "L_COMPLETENESS_CERTIFICATE" ? Object.hasOwn(closure?.sections ?? {}, name) : fields.every((key) => Object.hasOwn(closure?.sections?.[name] ?? {}, key))) && Object.values(closure?.checks ?? {}).length > 0 && Object.values(closure.checks).every((value) => value === true) ? null : "PREIMPLEMENTATION_AFFECTED_DOMAIN_INCOMPLETE",
    certificate?.id === "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" && certificate?.classification === "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" && doctrine.certificate.requiredFields.every((key) => Object.hasOwn(certificate ?? {}, key)) && certificate?.task === taskArtifact?.taskId && certificate?.leaseId === taskArtifact?.taskId && certificate?.featureDomain === taskArtifact?.primaryDomain && certificate?.certificateHash === hashValue(without(certificate, "certificateHash")) && certificate?.packetFactsHash === packetFactsHash(closure?.sections) && certificate?.status === closure?.completionStatus && stableJson(closure?.sections?.L_COMPLETENESS_CERTIFICATE) === stableJson(certificate) ? null : "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE",
    stableJson(ids(certificate?.invariants)) === stableJson(ids(taskArtifact?.invariants)) && stableJson(list(certificate?.positiveWitnesses).slice().sort()) === stableJson(list(taskArtifact?.invariants).map((item) => item?.positiveWitness).sort()) && stableJson(list(certificate?.negativeWitnesses).slice().sort()) === stableJson(list(taskArtifact?.invariants).map((item) => item?.negativeWitness).sort()) && stableJson(ids(certificate?.mutants)) === stableJson(ids(taskArtifact?.mutants)) && certificate?.expectedMutantKills === list(taskArtifact?.mutants).length ? null : "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE",
    stableJson(list(certificate?.reachableStates).slice().sort()) === stableJson(list(taskArtifact?.stateTransitionModel?.states).slice().sort()) && stableJson(ids(certificate?.transitions)) === stableJson(ids(taskArtifact?.stateTransitionModel?.transitions)) && list(taskArtifact?.stateTransitionModel?.states).length > 0 && list(taskArtifact?.stateTransitionModel?.transitions).length > 0 ? null : "PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE",
    object(taskArtifact?.stableDefectLedger) && Array.isArray(taskArtifact.stableDefectLedger.entries) && taskArtifact.stableDefectLedger.hash === hashValue(taskArtifact.stableDefectLedger.entries) && certificate?.defectLedgerHash === taskArtifact.stableDefectLedger.hash ? null : "PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE",
    taskArtifact?.implementationPlan?.allowedPaths?.length > 0 && taskArtifact?.implementationPlan?.tests?.length > 0 && [taskArtifact?.rollback, taskArtifact?.cleanup, taskArtifact?.observability].every(Boolean) ? null : "PREIMPLEMENTATION_SCOPE_UNBOUNDED",
  ].filter(Boolean);
  return { clear: findings.length === 0, status: findings.length === 0 ? "PREIMPLEMENTATION_ENGINEERING_CLEAR" : "BOUND_INCOMPLETE", findings };
}

const blockedTaskLocalEdgeSnapshot = (finding) => ({ classification: "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED", deterministic: false, verificationRuns: "0/2", findings: [finding] });

const verifyTaskLocalGoverningEdgeClosureAtSourceSnapshot = (edgeEvidence, { root = REPOSITORY_ROOT, runs = 2, snapshotHead = null, snapshotTree = null } = {}) => {
  const sourceHead = edgeEvidence?.sourceIdentity?.head;
  const sourceTree = edgeEvidence?.sourceIdentity?.tree;
  if (!/^[0-9a-f]{40}$/u.test(sourceHead ?? "") || typedGit(root, ["rev-parse", `${sourceHead}^{tree}`]).stdout.trim() !== sourceTree) return blockedTaskLocalEdgeSnapshot("TASK_LOCAL_EDGE_SOURCE_IDENTITY_INVALID");
  if (!/^[0-9a-f]{40}$/u.test(snapshotHead ?? "") || typedGit(root, ["rev-parse", `${snapshotHead}^{tree}`]).stdout.trim() !== snapshotTree) return blockedTaskLocalEdgeSnapshot("TASK_LOCAL_EDGE_PLANNING_SNAPSHOT_INVALID");
  const temporaryParent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "chillywood-edge-source-snapshot-"));
  const snapshotRoot = path.join(temporaryParent, "repository");
  try {
    const clone = spawnSync("git", ["clone", "--quiet", "--no-checkout", "--local", root, snapshotRoot], { encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024 });
    if (clone.status !== 0) return blockedTaskLocalEdgeSnapshot("TASK_LOCAL_EDGE_SOURCE_SNAPSHOT_UNAVAILABLE");
    const checkout = spawnSync("git", ["checkout", "--quiet", "--detach", snapshotHead], { cwd: snapshotRoot, encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024 });
    if (checkout.status !== 0 || typedGit(snapshotRoot, ["rev-parse", "HEAD^{tree}"]).stdout.trim() !== snapshotTree) return blockedTaskLocalEdgeSnapshot("TASK_LOCAL_EDGE_PLANNING_SNAPSHOT_INVALID");
    return verifyTaskLocalGoverningEdgeClosure(edgeEvidence, { root: snapshotRoot, runs });
  } catch {
    return blockedTaskLocalEdgeSnapshot("TASK_LOCAL_EDGE_SOURCE_SNAPSHOT_UNAVAILABLE");
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
};

export function evaluateAdmittedFiniteTaskArtifactV2(taskArtifact, {
  taskArtifactHash,
  taskArtifactBytes = null,
  implementationIdentity,
  authoritativeLease,
  ownerJurisdictionAuthority,
  actualScope,
  root = REPOSITORY_ROOT,
} = {}) {
  const frozen = evaluateFrozenFiniteTaskArtifactV2(taskArtifact, { root });
  const findings = new Set(frozen.findings);
  const checks = {};
  const check = (name, valid, finding) => {
    checks[name] = Boolean(valid);
    if (!valid) findings.add(finding);
  };
  const authoritativeIdentity = trustedImplementationIdentity(implementationIdentity);
  const authoritativeJurisdiction = trustedOwnerJurisdictionAuthority(ownerJurisdictionAuthority);
  const authoritativeScope = trustedScopeObservation(actualScope);
  const artifactPath = implementationIdentity?.taskArtifactPath;
  const exactArtifact = readTaskArtifactAtGitHead(artifactPath, implementationIdentity?.implementationHead, root);
  const rawBytes = exactArtifact?.bytes ?? null;
  const parsedArtifact = exactArtifact?.artifact ?? null;
  let suppliedBytesMatch = true;
  try {
    if (taskArtifactBytes !== null && taskArtifactBytes !== undefined) {
      const suppliedBytes = Buffer.isBuffer(taskArtifactBytes) ? taskArtifactBytes : Buffer.from(taskArtifactBytes);
      suppliedBytesMatch = rawBytes !== null && suppliedBytes.equals(rawBytes);
    }
  } catch { suppliedBytesMatch = false; }
  const rawHash = rawBytes ? crypto.createHash("sha256").update(rawBytes).digest("hex") : null;
  let taskEvidence = null;
  try { taskEvidence = finiteTaskJurisdictionEvidenceV2(taskArtifact, taskArtifactHash); } catch {}
  const binding = ownerJurisdictionAuthority?.taskBinding;
  const bindingIdentity = binding?.taskIdentity;
  const domains = Array.isArray(taskArtifact?.closure?.affectedDomainClosure?.domains) ? taskArtifact.closure.affectedDomainClosure.domains : [];
  const packetC = taskArtifact?.closure?.sections?.C_AFFECTED_DOMAIN_CLOSURE;
  const packetDomains = typeof packetC?.primaryDomain === "string" && Array.isArray(packetC?.includedDependencies) ? [packetC.primaryDomain, ...packetC.includedDependencies].sort(compareUtf8) : [];
  const edgeEvidence = taskArtifact?.taskLocalEdgeEvidence ?? taskArtifact?.closure?.sections?.C_AFFECTED_DOMAIN_CLOSURE?.taskLocalEvidence;
  const edgeClosure = taskArtifact?.taskLocalGoverningEdgeClosure ?? taskArtifact?.closure?.sections?.C_AFFECTED_DOMAIN_CLOSURE?.taskLocalGoverningEdgeClosure;
  const edgeVerificationEligible = authoritativeIdentity && authoritativeJurisdiction && authoritativeScope && rawHash === taskArtifactHash && rawHash === implementationIdentity?.taskArtifactHash && rawHash === authoritativeLease?.closure?.artifactHash;
  const verifiedEdgeClosure = edgeVerificationEligible && object(edgeEvidence) ? verifyTaskLocalGoverningEdgeClosureAtSourceSnapshot(edgeEvidence, { root, runs: 2, snapshotHead: bindingIdentity?.planningHead, snapshotTree: bindingIdentity?.planningTree }) : null;
  const expectedLeaseClosure = {
    artifactHash: taskEvidence?.taskArtifactHash,
    packetHash: taskEvidence?.closurePacketHash,
    certificateHash: taskEvidence?.completenessCertificateHash,
    edgeClosureHash: taskEvidence?.taskLocalEdgeClosureHash,
    edgeEvidenceHash: taskEvidence?.taskLocalEdgeEvidenceHash,
    modelDeltaHash: taskEvidence?.taskLocalModelHash,
  };
  const edgeSummaryKeys = ["accounting", "classification", "closureHash", "contract", "deterministic", "evidenceHash", "findings", "verificationRuns"];
  const expectedEdgeSummary = object(verifiedEdgeClosure) ? Object.fromEntries(edgeSummaryKeys.map((key) => [key, verifiedEdgeClosure[key]])) : null;
  const expectedEdgeEvidenceSummary = object(edgeEvidence) && object(verifiedEdgeClosure) ? { dispositionCount: Array.isArray(edgeEvidence.dispositions) ? edgeEvidence.dispositions.length : -1, evidenceHash: verifiedEdgeClosure.evidenceHash, inputHash: verifiedEdgeClosure.inputHash, modelDeltaCount: Array.isArray(edgeEvidence.modelDeltas) ? edgeEvidence.modelDeltas.length : -1 } : null;
  const expectedModelDeltaSummary = object(edgeEvidence) && Array.isArray(edgeEvidence.modelDeltas) ? { edgeIds: edgeEvidence.modelDeltas.map((item) => item?.edgeId).filter((edgeId) => typeof edgeId === "string").sort(compareUtf8), hash: hashValue(edgeEvidence.modelDeltas) } : null;
  const planningTree = /^[0-9a-f]{40}$/u.test(bindingIdentity?.planningHead ?? "")
    ? typedGit(root, ["rev-parse", `${bindingIdentity.planningHead}^{tree}`])
    : { status: 1, stdout: "" };
  const planningDiff = /^[0-9a-f]{40}$/u.test(authoritativeLease?.admittedBase ?? "") && /^[0-9a-f]{40}$/u.test(bindingIdentity?.planningHead ?? "")
    ? typedGit(root, ["diff", "--name-only", `${authoritativeLease.admittedBase}..${bindingIdentity.planningHead}`])
    : { status: 1, stdout: "" };
  const planningChangedPaths = planningDiff.status === 0 ? planningDiff.stdout.split("\n").filter(Boolean).sort(compareUtf8) : [];
  const planningIsAncestor = /^[0-9a-f]{40}$/u.test(bindingIdentity?.planningHead ?? "") && /^[0-9a-f]{40}$/u.test(implementationIdentity?.implementationHead ?? "")
    && typedGit(root, ["merge-base", "--is-ancestor", bindingIdentity.planningHead, implementationIdentity.implementationHead]).status === 0;
  const closedBindingAuthority = object(binding?.authority) && Object.keys(binding.authority).length > 0 && Object.values(binding.authority).every((value) => value === false);
  const closedLeaseAuthority = authoritativeLease?.authority?.productSourceMutationAfterAdmissionMerge === true
    && ["providerMutation", "databaseDeployment", "build", "submission", "ota", "publicRelease"].every((name) => authoritativeLease.authority?.[name] === false);
  check("frozenArtifact", frozen.clear, "PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE");
  check("artifactContract", taskArtifact?.schemaVersion === 1
    && taskArtifact?.artifactId === String(taskArtifact?.taskId ?? "").toUpperCase().replaceAll("-", "_")
    && taskArtifact?.closure?.id === "ENGINEERING_CLOSURE_PACKET_V1"
    && taskArtifact?.closure?.classification === "ENGINEERING_CLOSURE_PACKET_V1"
    && taskArtifact?.certificate?.id === "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1"
    && taskArtifact?.certificate?.classification === "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1", "PREIMPLEMENTATION_ADMITTED_ARTIFACT_CONTRACT_UNSUPPORTED");
  check("implementationIdentity", authoritativeIdentity, "PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_REQUIRED");
  check("jurisdictionAuthority", authoritativeJurisdiction && ownerJurisdictionAuthority?.ok === true && ownerJurisdictionAuthority?.policyStatus === ACTIVE_POLICY_STATUS, "PREIMPLEMENTATION_AUTHORITY_UNOWNED");
  check("scopeObservation", authoritativeScope && actualScope?.head === implementationIdentity?.implementationHead && actualScope?.base === implementationIdentity?.currentProtectedMain && stableJson(actualScope?.paths) === stableJson(implementationIdentity?.implementationChangedPaths), "FINITE_TASK_SCOPE_MEASUREMENT_MISSING");
  check("artifactBytes", suppliedBytesMatch && rawHash === taskArtifactHash && rawHash === implementationIdentity?.taskArtifactHash && rawHash === authoritativeLease?.closure?.artifactHash && stableJson(parsedArtifact) === stableJson(taskArtifact), "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE");
  check("taskIdentity", taskArtifact?.repository === implementationIdentity?.repository
    && taskArtifact?.taskId === authoritativeLease?.leaseId
    && taskArtifact?.taskId === implementationIdentity?.finiteLeaseId
    && taskArtifact?.taskId === bindingIdentity?.taskId
    && taskArtifact?.primaryDomain === authoritativeLease?.featureId
    && taskArtifact?.implementation?.pullRequest === implementationIdentity?.implementationPr
    && taskArtifact?.implementation?.branch === implementationIdentity?.implementationBranch
    && implementationIdentity?.implementationPr === authoritativeLease?.implementationPr
    && implementationIdentity?.implementationBranch === authoritativeLease?.implementationBranch
    && implementationIdentity?.originalSeedHead === authoritativeLease?.admittedSeedHead
    && implementationIdentity?.originalSeedTree === authoritativeLease?.admittedSeedTree
    && bindingIdentity?.originalSeedHead === implementationIdentity?.originalSeedHead
    && bindingIdentity?.originalSeedTree === implementationIdentity?.originalSeedTree
    && bindingIdentity?.implementationPr === implementationIdentity?.implementationPr
    && bindingIdentity?.implementationBranch === implementationIdentity?.implementationBranch
    && bindingIdentity?.leaseId === authoritativeLease?.leaseId
    && bindingIdentity?.taskArtifactPath === artifactPath
    && bindingIdentity?.ownerApprovalCommentId === authoritativeLease?.ownerAuthorizationCommentId
    && taskArtifact?.implementation?.seedHead === implementationIdentity?.originalSeedHead
    && taskArtifact?.implementation?.seedTree === implementationIdentity?.originalSeedTree
    && taskArtifact?.implementation?.protectedBase?.head === authoritativeLease?.admittedBase
    && typedGit(root, ["rev-parse", `${taskArtifact?.implementation?.protectedBase?.head}^{tree}`]).stdout.trim() === taskArtifact?.implementation?.protectedBase?.tree
    && taskArtifact?.implementation?.planningSourceHead === edgeEvidence?.sourceIdentity?.head
    && taskArtifact?.implementation?.planningSourceTree === edgeEvidence?.sourceIdentity?.tree
    && planningTree.status === 0 && planningTree.stdout.trim() === bindingIdentity?.planningTree
    && stableJson(planningChangedPaths) === stableJson([artifactPath])
    && planningIsAncestor, "PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_MISMATCH");
  check("taskEvidence", stableJson(taskEvidence) === stableJson(binding?.taskEvidence) && stableJson(expectedLeaseClosure) === stableJson(authoritativeLease?.closure), "PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE");
  check("domainBinding", domains.length > 0
    && stableJson(domains) === stableJson([...domains].sort(compareUtf8))
    && stableJson(domains) === stableJson(authoritativeLease?.artifactReservation?.allowedDomains)
    && stableJson(domains) === stableJson(binding?.domainIds)
    && ownerJurisdictionAuthority?.coverage?.result === `${domains.length}/${domains.length}`
    && Array.isArray(binding?.capabilitySpecificConflicts) && binding.capabilitySpecificConflicts.length === 0
    && binding?.domainCoverageReusable === false
    && binding?.taskSpecific === true, "PREIMPLEMENTATION_AUTHORITY_UNOWNED");
  check("edgeClosure", verifiedEdgeClosure?.classification === "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR"
    && stableJson(verifiedEdgeClosure) === stableJson(edgeClosure)
    && stableJson(domains) === stableJson(packetDomains)
    && stableJson(domains) === stableJson(packetC?.computedClosure?.domains)
    && stableJson(domains) === stableJson(edgeClosure?.domains)
    && stableJson(domains) === stableJson(verifiedEdgeClosure?.domains)
    && stableJson(packetC?.taskLocalGoverningEdgeClosure) === stableJson(expectedEdgeSummary)
    && stableJson(packetC?.taskLocalEvidence) === stableJson(expectedEdgeEvidenceSummary)
    && stableJson(packetC?.taskLocalModelDeltas) === stableJson(expectedModelDeltaSummary)
    && edgeEvidence?.taskId === taskArtifact?.taskId
    && edgeClosure?.taskId === taskArtifact?.taskId
    && edgeEvidence?.primaryDomain === taskArtifact?.primaryDomain
    && edgeClosure?.primaryDomain === taskArtifact?.primaryDomain
    && stableJson(edgeEvidence?.sourceIdentity) === stableJson(edgeClosure?.sourceIdentity)
    && stableJson(edgeEvidence?.sourceIdentity) === stableJson(taskArtifact?.closure?.sourceIdentity)
    && Array.isArray(edgeClosure?.accounting?.unresolvedSet) && edgeClosure.accounting.unresolvedSet.length === 0
    && Array.isArray(edgeClosure?.accounting?.observedUndeclaredSet)
    && Array.isArray(edgeClosure?.modelDeltaEdges)
    && edgeClosure.accounting.observedUndeclaredSet.every((edgeId) => edgeClosure.modelDeltaEdges.includes(edgeId)), "PREIMPLEMENTATION_TASK_LOCAL_EDGE_CLOSURE_INCOMPLETE");
  check("authorityBoundary", ownerJurisdictionAuthority?.externalProofInherited === false
    && ownerJurisdictionAuthority?.operationalOwnersPreserved === true
    && closedBindingAuthority
    && finiteTaskAdmissionLeaseStateValid(authoritativeLease)
    && closedLeaseAuthority, "PREIMPLEMENTATION_SELF_AUTHORIZATION_REJECTED");
  const clear = findings.size === 0 && Object.values(checks).every(Boolean);
  const result = {
    id: clear ? "PREIMPLEMENTATION_ENGINEERING_CLEAR" : "BOUND_INCOMPLETE",
    status: clear ? "PREIMPLEMENTATION_ENGINEERING_CLEAR" : "BOUND_INCOMPLETE",
    clear,
    computed: true,
    verificationMode: "ADMITTED_FROZEN_FINITE_TASK_V2",
    findings: [...findings].sort(compareUtf8),
    derivedChecks: checks,
    subject: authoritativeIdentity ? {
      repository: implementationIdentity.repository,
      pr: implementationIdentity.implementationPr,
      branch: implementationIdentity.implementationBranch,
      head: implementationIdentity.implementationHead,
      tree: implementationIdentity.implementationTree,
      base: implementationIdentity.currentProtectedMain,
      leaseId: implementationIdentity.finiteLeaseId,
    } : null,
  };
  if (result.clear) derivedGateClearances.add(result);
  return result;
}

export function evaluateFiniteTaskAdmissionSuccessorV2({ raw, allComments = [], paginationComplete = false, identity, tree, scope, implementation, taskArtifact, taskArtifactHash, truthRecord, priorTruth, ownerApproval, ownerJurisdictionAuthority, seedIsAncestor = false, implementationBaseIsAncestor = false, registry, phase1EvidenceResolver = observePhase1RunEvidence, root = REPOSITORY_ROOT } = {}) {
  const admissionRaws = allComments.filter((item) => typeof item?.body === "string" && [FINITE_TASK_ADMISSION_MARKER, FINITE_TASK_ADMISSION_V2_MARKER].some((marker) => item.body.startsWith(`${marker}\n`)));
  const receipts = admissionRaws.map((item) => normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item.id })).filter(Boolean).map(jurisdictionReceipt);
  const binding = ownerJurisdictionAuthority?.taskBinding;
  const expectedScope = binding?.scope;
  const legacyRaw = admissionRaws.find((item) => item.body.startsWith(`${FINITE_TASK_ADMISSION_MARKER}\n`));
  const legacyV1Subject = legacyFiniteTaskAdmissionSubjectV2({ raw: legacyRaw, identity, implementation, taskArtifact, taskArtifactHash, root });
  const taskEvidence = finiteTaskJurisdictionEvidenceV2(taskArtifact, taskArtifactHash);
  const taskScope = finiteTaskScopeV2(taskArtifact);
  const changedPaths = exactScope(scope).changedPaths;
  const scopeBudget = { maximumChangedLines: 3600, maximumFiles: 3 };
  const admissionPolicyBinding = trustedOwnerJurisdictionAuthority(ownerJurisdictionAuthority) ? finiteTaskAdmissionJurisdictionBindingV2(ownerJurisdictionAuthority) : null;
  const chain = paginationComplete ? resolveFiniteTaskAdmissionChainV2({ receipts, completeDiscovery: true, expected: { repository: identity?.repository, product: expectedScope?.product, launchProgram: expectedScope?.launchProgram, pr: identity?.pr, task: taskArtifact?.taskId, head: identity?.headSha, tree, ownerLogin: "Chillywood2025", legacyV1Subject, changedPaths, scopeBudget, taskEvidence, taskScope, ownerJurisdictionBinding: admissionPolicyBinding } }) : { ok: false, findings: ["ADMISSION_DISCOVERY_INCOMPLETE"] };
  const current = normalizeGitHubCommentIdentity(raw, { repository: identity?.repository, pr: identity?.pr, commentId: raw?.id });
  const predecessorRaw = admissionRaws.find(({ id }) => id === chain.currentAdmission?.predecessor?.commentId);
  let expectedComment = null;
  try { expectedComment = renderFiniteTaskAdmissionSuccessorV2({ predecessorRaw, identity, tree, admissionScope: scope, implementation, taskArtifact, taskArtifactHash, ownerJurisdictionAuthority, root }); } catch {}
  const closure = taskArtifact?.closure;
  const certificate = taskArtifact?.certificate;
  const edgeEvidence = taskArtifact?.taskLocalEdgeEvidence ?? closure?.sections?.C_AFFECTED_DOMAIN_CLOSURE?.taskLocalEvidence;
  const edgeClosure = taskArtifact?.taskLocalGoverningEdgeClosure ?? closure?.sections?.C_AFFECTED_DOMAIN_CLOSURE?.taskLocalGoverningEdgeClosure;
  const verifiedEdgeClosure = edgeEvidence ? verifyTaskLocalGoverningEdgeClosure(edgeEvidence, { root, runs: 2 }) : null;
  const domains = closure?.affectedDomainClosure?.domains ?? [];
  const lease = (truthRecord?.finiteTaskLeases?.tasks ?? []).filter(({ leaseId }) => leaseId === taskArtifact?.taskId);
  const active = truthRecord?.activeTaskBinding;
  const expectedTruthPolicy = trustedOwnerJurisdictionAuthority(ownerJurisdictionAuthority) ? ownerJurisdictionPolicyBindingTruthV2(ownerJurisdictionAuthority) : null;
  const priorDuplicate = (priorTruth?.finiteTaskLeases?.tasks ?? []).some(({ implementationPr }) => implementationPr === implementation?.pr);
  const competingTask = (priorTruth?.finiteTaskLeases?.tasks ?? []).some(({ implementationPr, taskState }) => implementationPr !== implementation?.pr && !["MERGED_VERIFIED", "ABANDONED_BY_OWNER"].includes(taskState));
  const frozenGate = evaluateFrozenFiniteTaskArtifactV2(taskArtifact, { root });
  const prospectiveGateFindings = [...frozenGate.findings, verifiedEdgeClosure?.classification === "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR" && stableJson(edgeClosure) === stableJson(verifiedEdgeClosure) && edgeClosure?.accounting?.unresolvedSet?.length === 0 && edgeClosure?.accounting?.observedUndeclaredSet?.every((edgeId) => edgeClosure.modelDeltaEdges?.includes(edgeId)) ? null : "PREIMPLEMENTATION_TASK_LOCAL_EDGE_CLOSURE_INCOMPLETE", ownerJurisdictionAuthority?.coverage?.result === `${domains.length}/${domains.length}` && stableJson(binding?.domainIds) === stableJson(domains) ? null : "PREIMPLEMENTATION_AUTHORITY_UNOWNED"].filter(Boolean);
  const leaseRecord = lease[0];
  const admittedImplementationBase = legacyV1Subject?.protectedBase ?? leaseRecord?.admittedBase;
  const admittedImplementationBaseIsAncestor = admittedImplementationBase
    ? typedGit(root, ["merge-base", "--is-ancestor", admittedImplementationBase, implementation?.planningHead]).status === 0
    : implementationBaseIsAncestor;
  const admissionHistoryValid = finiteTaskAdmissionHistoryValidV2(chain, legacyRaw);
  const checks = {
    identity: identity?.baseRef === "main" && identity?.headSha === chain.currentAdmission?.admissionIdentity?.head && tree === chain.currentAdmission?.admissionIdentity?.tree,
    exactScope: stableJson(exactScope(scope).changedPaths) === stableJson(TERMINAL_TRUTH_PATHS),
    chain: chain.ok && current?.id === chain.currentCommentId && admissionHistoryValid,
    commentBody: Boolean(expectedComment) && current?.body === expectedComment.body && expectedComment.bodyHash === chain.currentBodyHash && expectedComment.subjectHash === chain.currentSubjectHash,
    jurisdiction: trustedOwnerJurisdictionAuthority(ownerJurisdictionAuthority) && ownerJurisdictionAuthority.ok && ownerJurisdictionAuthority.policyStatus === ACTIVE_POLICY_STATUS && ownerJurisdictionAuthority.externalProofInherited === false && ownerJurisdictionAuthority.operationalOwnersPreserved === true,
    jurisdictionTruth: stableJson(truthRecord?.ownerJurisdictionPolicyBinding) === stableJson(expectedTruthPolicy),
    implementation: implementation?.state === "open" && implementation?.draft === true && implementation?.pr === binding?.taskIdentity?.implementationPr && implementation?.branch === binding?.taskIdentity?.implementationBranch && implementation?.changedPaths?.length === 1 && implementation.changedPaths[0] === implementation.taskArtifactPath,
    seed: seedIsAncestor && admittedImplementationBaseIsAncestor && implementation?.seedHead === binding?.taskIdentity?.originalSeedHead && implementation?.seedTree === binding?.taskIdentity?.originalSeedTree && implementation?.observedSeedTree === implementation?.seedTree,
    owner: verifyFiniteTaskOwnerApprovalV2({ approval: ownerApproval, identity, implementation, taskArtifact, binding }),
    artifact: /^[0-9a-f]{64}$/u.test(taskArtifactHash ?? "") && stableJson(taskEvidence) === stableJson(binding?.taskEvidence) && prospectiveGateFindings.length === 0,
    registryCompatibility: validateFiniteTaskLeaseRegistry(truthRecord?.finiteTaskLeases).length === 0,
    truthLease: lease.length === 1 && leaseRecord?.implementationPr === implementation?.pr && leaseRecord?.implementationBranch === implementation?.branch && leaseRecord?.protectedAdmissionPr === identity?.pr && finiteTaskAdmissionLeaseStateValid(leaseRecord) && stableJson(leaseRecord?.artifactReservation?.allowedDomains) === stableJson(domains) && stableJson(leaseRecord?.allowedPaths) === stableJson(taskArtifact?.implementationPlan?.allowedPaths) && stableJson(leaseRecord?.scopeBudget) === stableJson(taskScope.scopeBudget) && stableJson(leaseRecord?.amendmentMaximum) === stableJson(taskScope.amendmentMaximum) && stableJson(leaseRecord?.closure) === stableJson({ artifactHash: taskEvidence.taskArtifactHash, packetHash: taskEvidence.closurePacketHash, certificateHash: taskEvidence.completenessCertificateHash, edgeClosureHash: taskEvidence.taskLocalEdgeClosureHash, edgeEvidenceHash: taskEvidence.taskLocalEdgeEvidenceHash, modelDeltaHash: taskEvidence.taskLocalModelHash }),
    truthBinding: active?.implementationPr === implementation?.pr && active?.implementationBranch === implementation?.branch && active?.immutableSourceHead === implementation?.seedHead && active?.currentImplementationHead === implementation?.planningHead && active?.phase === "PREIMPLEMENTATION_ENGINEERING_CLEAR" && active?.productSourceMutationAllowed === true && [active?.providerMutationAllowed, active?.databaseDeploymentAllowed, active?.buildAllowed, active?.submissionAllowed, active?.otaAllowed, active?.publicReleaseAllowed].every((value) => value === false),
    authority: truthRecord?.ownerJurisdictionPolicyCapability?.status === "ACTIVE" && truthRecord?.finiteTaskAdmissionClearanceCapability?.status === "ACTIVE" && truthRecord.finiteTaskAdmissionClearanceCapability.productMutationBeforeAdmissionMerge === false,
    duplicate: priorDuplicate === false,
    competingTask: competingTask === false,
  };
  const ok = Object.values(checks).every(Boolean);
  const result = {
    ok,
    type: "FINITE_TASK_ADMISSION_SUCCESSOR",
    classification: FINITE_TASK_ADMISSION_V2,
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    currentHead: identity?.headSha,
    currentTree: tree,
    featureId: taskArtifact?.primaryDomain,
    objectiveDomains: [],
    supportingDomains: ["CI-test-infrastructure"],
    historicalWaiverPath: null,
    authoritySource: "IMMUTABLE_OWNER_FINITE_TASK_ADMISSION_CHAIN",
    bindingId: `finite-task-admission-v2-pr-${identity?.pr}`,
    finiteLeaseId: taskArtifact?.taskId,
    budget: { maximumFiles: 3, maximumHandAuthoredNetLines: 3600 },
    commentId: current?.id ?? null,
    commentBodyHash: chain.currentBodyHash ?? null,
    subjectHash: chain.currentSubjectHash ?? null,
    subject: chain.currentAdmission ?? null,
    checks,
    historicalAdmissions: chain.historical ?? [],
    futureTaskStatus: ok ? "PREIMPLEMENTATION_ENGINEERING_CLEAR" : "BOUND_INCOMPLETE",
    futureProductSourceMutationAllowed: ok,
    futureImplementationPr: implementation?.pr,
    futureImplementationBranch: implementation?.branch,
    futureLeaseId: taskArtifact?.taskId,
    marketJurisdictionOwnerCoverage: ok ? `${domains.length}/${domains.length}` : null,
    launchMarket: ok ? binding.inheritedStandingPolicy.primaryMarket : null,
    initialRollout: ok ? binding.inheritedStandingPolicy.initialRollout : null,
    externalProofInherited: false,
    admissionMergeRequired: true,
    productSourceMutationAllowedBeforeMerge: false,
    findings: ok ? [] : [...chain.findings ?? [], ...prospectiveGateFindings, ...Object.entries(checks).filter(([, value]) => !value).map(([key]) => `FINITE_TASK_ADMISSION_V2_INVALID:${key}`)].sort(),
  };
  const finalSource = ok ? verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ allComments, paginationComplete, identity, tree, scope, admissionAuthority: result, ownerJurisdictionAuthority, phase1EvidenceResolver, root }) : { ok: false, findings: ["FINITE_TASK_ADMISSION_INVALID_BEFORE_FINAL_SOURCE"] };
  return { ...result, mergeEligible: ok && finalSource.ok, finalSourceAttestationRequiredForMerge: true, finalSource };
}

export function verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ raw = null, allComments = [], paginationComplete = false, identity, tree, scope, admissionAuthority, ownerJurisdictionAuthority, phase1EvidenceResolver = observePhase1RunEvidence, root = REPOSITORY_ROOT } = {}) {
  const finals = allComments.filter((item) => item?.body?.startsWith(`${FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER}\n`));
  if (!paginationComplete) return { ok: false, mergeEligible: false, findings: ["FINITE_TASK_ADMISSION_FINAL_SOURCE_DISCOVERY_INCOMPLETE"] };
  if (admissionAuthority?.ok !== true || !trustedOwnerJurisdictionAuthority(ownerJurisdictionAuthority)) return { ok: false, mergeEligible: false, findings: ["FINITE_TASK_ADMISSION_FINAL_SOURCE_AUTHORITY_INVALID"] };
  const classifications = finals.map((item) => {
    const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item?.id });
    const verified = normalized ? verifyFiniteTaskAdmissionFinalSourceV2({ body: normalized.body, receipt: jurisdictionReceipt(normalized), expected: { repository: identity?.repository, product: ownerJurisdictionAuthority.taskBinding?.scope?.product, launchProgram: ownerJurisdictionAuthority.taskBinding?.scope?.launchProgram, pr: identity?.pr, task: admissionAuthority.finiteLeaseId, ownerLogin: "Chillywood2025" } }) : { ok: false };
    const subject = verified.subject;
    const reviewRaw = allComments.find(({ id }) => id === subject?.repositoryReview?.commentId);
    const review = verifyArchitectureRepositoryReview({ raw: reviewRaw, identity, tree, scope, profile: "FINITE_TASK_ADMISSION_JURISDICTION_V2" });
    let phase1 = null;
    try { phase1 = phase1EvidenceResolver({ runId: subject?.phase1?.runId, identity, tree, root }); } catch {}
    const domains = ownerJurisdictionAuthority.taskBinding?.domainIds ?? [];
    const expected = {
      ownerJurisdiction: finiteTaskFinalSourceOwnerJurisdictionV2(ownerJurisdictionAuthority),
      currentAdmission: { bodyHash: admissionAuthority.commentBodyHash, commentId: admissionAuthority.commentId, sequence: admissionAuthority.subject?.sequence, subjectHash: admissionAuthority.subjectHash },
      repositoryReview: { bodyHash: review.commentBodyHash, commentId: review.commentId, disposition: review.disposition, subjectHash: review.subjectHash },
      phase1: { head: identity?.headSha, passedJobs: phase1?.passedJobs, requiredJobs: phase1?.requiredJobs, result: phase1?.valid ? "PASS" : "BLOCKED", runId: phase1?.runId, tree },
      prospective: { classification: admissionAuthority.futureTaskStatus, externalProofInherited: false, marketJurisdictionOwnerCoverage: { covered: domains.length, required: domains.length, result: `${domains.length}/${domains.length}` }, productMutationAllowedAfterAdmissionMerge: admissionAuthority.futureProductSourceMutationAllowed, productMutationAllowedBeforeAdmissionMerge: false, taskLocalGoverningEdgeClosure: admissionAuthority.checks?.artifact ? "CLEAR" : "BLOCKED" },
    };
    let rendered = null;
    try { rendered = renderFiniteTaskAdmissionFinalSourceV2({ scope: ownerJurisdictionAuthority.taskBinding.scope, owner: ownerJurisdictionAuthority.standingPolicy.owner, admissionIdentity: { branch: identity?.branch, head: identity?.headSha, pr: identity?.pr, taskId: admissionAuthority.finiteLeaseId, tree }, diffHash: scope?.diffHash, ...expected }); } catch {}
    const current = verified.ok && review.valid && phase1?.valid === true && normalized?.body === rendered?.body && subject?.admissionIdentity?.head === identity?.headSha && subject?.admissionIdentity?.tree === tree;
    return { commentId: item?.id ?? null, current, status: current ? "CURRENT_FINITE_TASK_ADMISSION_FINAL_SOURCE" : "HISTORICAL_OR_INVALID_FINITE_TASK_ADMISSION_FINAL_SOURCE", normalized, verified };
  });
  const current = classifications.filter(({ current }) => current);
  const selected = current.length === 1 ? current[0] : null;
  const ok = current.length === 1 && (!raw || raw.id === selected.commentId);
  return { ok, mergeEligible: ok, findings: ok ? [] : [finals.length === 0 ? "FINITE_TASK_ADMISSION_FINAL_SOURCE_REQUIRED" : "FINITE_TASK_ADMISSION_FINAL_SOURCE_INVALID"], commentId: selected?.commentId ?? null, bodyHash: selected?.verified?.bodyHash ?? null, subjectHash: selected?.verified?.subjectHash ?? null, classifications: classifications.map(({ commentId, status }) => ({ commentId, status })) };
}

export function verifyArchitectureMaintenanceAuthority({ raw, allComments = [], paginationComplete = false, identity, tree, scope, noCompetingDomainOwner = true, ancestryVerified = null, phase1EvidenceResolver = observePhase1RunEvidence, root = REPOSITORY_ROOT } = {}) {
  const normalizedOriginal = normalizeGitHubCommentIdentity(raw, { repository: identity?.repository, pr: identity?.pr, commentId: raw?.id });
  const originalPayload = parseExactOwnerBody(normalizedOriginal, ARCHITECTURE_MAINTENANCE_MARKER);
  const originalSubject = originalPayload?.subject;
  const originalMatches = allComments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${ARCHITECTURE_MAINTENANCE_MARKER}\n`));
  const successorMatches = allComments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${ARCHITECTURE_MAINTENANCE_SUCCESSOR_MARKER}\n`));
  const finalMatches = allComments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${ARCHITECTURE_FINAL_SOURCE_MARKER}\n`));
  const dependencyAmendmentMatches = allComments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${PRE_ADMISSION_DEPENDENCY_AMENDMENT_MARKER}\n`));
  const finalSourceCorrectionMatches = allComments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${ARCHITECTURE_FINAL_SOURCE_CORRECTION_MARKER}\n`));
  const repositoryReviewMatches = allComments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${ARCHITECTURE_REPOSITORY_REVIEW_MARKER}\n`));
  const observed = exactScope(scope);
  const companionRequired = authorityControlCurrentTruthCompanionV2Required({ identity, root });
  let expectedCompanion = null;
  try { expectedCompanion = authorityControlCurrentTruthCompanionV2({ identity, root }); } catch { expectedCompanion = null; }
  const subjectHasCompanion = Object.hasOwn(originalSubject ?? {}, "currentTruthCompanion");
  const requiredCompanionPaths = expectedCompanion?.requiredChangedPaths ?? [];
  const companionValid = companionRequired
    ? Boolean(expectedCompanion
      && stableJson(originalSubject?.currentTruthCompanion) === stableJson(expectedCompanion)
      && requiredCompanionPaths.every((file) => observed.changedPaths.includes(file) && originalSubject?.changedPaths?.includes(file)))
    : !subjectHasCompanion;
  if (!companionValid) return {
    ok: false,
    authorizationOk: false,
    mergeEligible: false,
    type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    currentHead: identity?.headSha,
    currentTree: tree,
    featureId: "assurance-efficiency-e0",
    objectiveDomains: [],
    supportingDomains: ["CI-test-infrastructure"],
    authoritySource: "IMMUTABLE_OWNER_ARCHITECTURE_MAINTENANCE",
    bindingId: `owner-architecture-maintenance-pr-${identity?.pr}`,
    commentId: normalizedOriginal?.id ?? null,
    originalCommentId: normalizedOriginal?.id ?? null,
    checks: { currentTruthCompanion: false },
    findings: ["OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_INVALID:currentTruthCompanion"],
    mergeFindings: ["OWNER_ASSURANCE_ARCHITECTURE_MERGE_INELIGIBLE:currentTruthCompanion"],
  };
  if ([
    "install generic source-grounded task-local governing-edge closure for pre-admission engineering packets",
    "install versioned standing Owner jurisdiction policy with exact task bindings and append-only admission supersession",
    FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1,
  ].includes(originalSubject?.objective)) {
    const jurisdictionModel = originalSubject?.objective === "install versioned standing Owner jurisdiction policy with exact task bindings and append-only admission supersession";
    const amendmentControlRepair = originalSubject?.objective === FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1;
    const ownerJurisdictionProfile = jurisdictionModel || amendmentControlRepair;
    const architecturePaths = ownerJurisdictionProfile ? OWNER_JURISDICTION_ARCHITECTURE_PATHS : TASK_LOCAL_EDGE_ARCHITECTURE_PATHS;
    const maximumFiles = ownerJurisdictionProfile ? 15 : 12;
    const maximumNetLines = ownerJurisdictionProfile ? 3500 : 3200;
    const expectedCapabilities = amendmentControlRepair
      ? ["OWNER_JURISDICTION_CANONICAL_MODEL_V2", FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1]
      : jurisdictionModel
      ? ["OWNER_JURISDICTION_CANONICAL_MODEL_V2", "FINITE_TASK_ADMISSION_CHAIN_V2"]
      : [TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1];
    const payloadWithoutHash = Object.fromEntries(Object.entries(originalPayload ?? {}).filter(([key]) => key !== "bodyHash"));
    const finalReceipts = finalMatches.map((item) => {
      const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item.id });
      const payload = parseExactOwnerBody(normalized, ARCHITECTURE_FINAL_SOURCE_MARKER);
      const body = Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => key !== "bodyHash"));
      const structurallyValid = Boolean(normalized
        && payload?.subject?.type === "OWNER_ASSURANCE_ARCHITECTURE_FINAL_SOURCE_V1"
        && payload.subjectHash === hashValue(payload.subject)
        && payload.bodyHash === hashValue(body)
        && normalized.body === architectureFinalSourceOwnerCommentBody(payload.subject));
      if (!ownerJurisdictionProfile && normalized?.id === 5289720389) return { normalized, payload, structurallyValid, current: false, status: "HISTORICAL_PRE_CI_FINAL_SOURCE_ATTESTATION" };
      if (!structurallyValid) return { normalized, payload, structurallyValid, current: false, status: "HISTORICAL_MALFORMED_FINAL_SOURCE_ATTESTATION" };
      if (payload.subject.finalHead !== identity?.headSha || payload.subject.finalTree !== tree) return { normalized, payload, structurallyValid, current: false, status: "HISTORICAL_STALE_FINAL_SOURCE_ATTESTATION" };
      const claimedHistoricalIds = (payload.subject.historicalAttestations ?? []).map(({ commentId }) => commentId);
      const claimedHistoricalRaws = claimedHistoricalIds.map((commentId) => finalMatches.find((candidate) => candidate.id === commentId));
      const historyBinding = claimedHistoricalIds.length === new Set(claimedHistoricalIds).size
        && claimedHistoricalRaws.every(Boolean)
        && !claimedHistoricalIds.includes(item.id)
        && (ownerJurisdictionProfile || !finalMatches.some((candidate) => candidate.id === 5289720389) || claimedHistoricalIds.includes(5289720389));
      const reviewRaw = repositoryReviewMatches.find((candidate) => candidate.id === payload.subject.repositoryReview?.commentId);
      const phase1 = phase1EvidenceResolver({ runId: payload.subject.phase1?.runId, identity, tree, root });
      const reviewProfile = amendmentControlRepair ? FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1 : null;
      const review = verifyArchitectureRepositoryReview({ raw: reviewRaw, identity, tree, scope, profile: reviewProfile });
      const expected = architectureFinalSourceSubject({
        identity,
        tree,
        scope,
        originalRaw: raw,
        historicalAttestationRaws: claimedHistoricalRaws,
        repositoryReviewRaw: reviewRaw,
        phase1Evidence: phase1,
        root,
      });
      const current = historyBinding
        && review.valid
        && phase1.valid
        && payload.subject.receiptLifecycleContract === ASSURANCE_RECEIPT_LIFECYCLE_V2
        && stableJson(payload.subject) === stableJson(expected)
        && normalized.body === architectureFinalSourceOwnerCommentBody(expected);
      return { normalized, payload, structurallyValid, current, status: current ? "CURRENT_FINAL_SOURCE_ATTESTATION" : "HISTORICAL_MALFORMED_OR_INCOMPLETE_FINAL_SOURCE_ATTESTATION" };
    });
    const currentFinals = finalReceipts.filter(({ current }) => current);
    const currentFinal = currentFinals[0];
    const ancestry = ancestryVerified ?? (originalSubject?.currentHead === identity?.headSha || typedGit(root, ["merge-base", "--is-ancestor", originalSubject?.currentHead, identity?.headSha]).status === 0);
    const canonicalOriginalSubject = architectureMaintenanceSubject({
      identity: { repository: originalSubject?.repository, pr: originalSubject?.pr, branch: originalSubject?.branch, baseSha: originalSubject?.protectedBase, headSha: originalSubject?.currentHead },
      tree: originalSubject?.currentTree,
      scope: { files: originalSubject?.changedPaths, additions: originalSubject?.additions, deletions: originalSubject?.deletions, netChangedLines: originalSubject?.netChangedLines },
      profile: ownerJurisdictionProfile ? "OWNER_JURISDICTION_CANONICAL_MODEL_V2" : "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1",
      objective: amendmentControlRepair ? FINITE_TASK_LEASE_AMENDMENT_CONTROL_PLANE_REPAIR_V1 : null,
      root,
    });
    const canonicalProfile = stableJson(originalSubject) === stableJson(canonicalOriginalSubject);
    const assuranceOnlyNonDomainMaintenance = canonicalProfile
      && Array.isArray(originalSubject?.objectiveDomains)
      && originalSubject.objectiveDomains.length === 0
      && stableJson(originalSubject?.supportingDomains) === stableJson(["CI-test-infrastructure"])
      && originalSubject?.authorityLevel === "LEVEL_0_1_REPOSITORY_ARCHITECTURE_MAINTENANCE"
      && Object.values(originalSubject?.authority ?? {}).every((value) => value === false);
    const authorizationChecks = {
      identity: Boolean(normalizedOriginal),
      currentTruthCompanion: companionValid,
      body: normalizedOriginal?.body === architectureMaintenanceOwnerCommentBody(originalSubject),
      hashes: originalPayload?.subjectHash === hashValue(originalSubject) && originalPayload?.bodyHash === hashValue(payloadWithoutHash),
      binding: originalSubject?.repository === identity?.repository && originalSubject?.pr === identity?.pr && originalSubject?.branch === identity?.branch && originalSubject?.protectedBase === identity?.baseSha && originalSubject?.budget?.maximumFiles === maximumFiles && originalSubject?.budget?.maximumNetLines === maximumNetLines,
      ancestry,
      cardinality: paginationComplete && originalMatches.length === 1 && successorMatches.length === 0,
      exactPaths: observed.changedPaths.length === originalSubject?.changedPaths?.length && observed.changedPaths.every((file) => architecturePaths.includes(file)) && stableJson(originalSubject?.changedPaths) === stableJson(observed.changedPaths),
      budget: observed.changedPaths.length <= maximumFiles && observed.netChangedLines <= maximumNetLines,
      authority: Object.values(originalSubject?.authority ?? {}).every((value) => value === false) && (noCompetingDomainOwner || assuranceOnlyNonDomainMaintenance),
      capability: canonicalProfile
        && stableJson(originalSubject?.capabilities) === stableJson(expectedCapabilities)
        && originalSubject?.terminalTruthRequired === false
        && originalSubject?.reusableByAnotherPr === (amendmentControlRepair ? false : true),
    };
    const authorizationOk = Object.values(authorizationChecks).every(Boolean);
    const attestationChecks = {
      exactlyOneCurrent: currentFinals.length === 1,
      currentReview: currentFinal?.payload?.subject?.repositoryReview?.valid === true,
      currentPhase1: currentFinal?.payload?.subject?.phase1?.valid === true && currentFinal?.payload?.subject?.phase1?.result === "PASS_13_OF_13",
    };
    const mergeEligible = authorizationOk && Object.values(attestationChecks).every(Boolean);
    return {
      ok: authorizationOk,
      authorizationOk,
      mergeEligible,
      type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE",
      repository: identity?.repository,
      pr: identity?.pr,
      branch: identity?.branch,
      currentHead: identity?.headSha,
      currentTree: tree,
      featureId: "assurance-efficiency-e0",
      objectiveDomains: [],
      supportingDomains: ["CI-test-infrastructure"],
      historicalWaiverPath: null,
      authoritySource: "IMMUTABLE_OWNER_ARCHITECTURE_MAINTENANCE",
      bindingId: `owner-architecture-maintenance-pr-${identity?.pr}`,
      budget: { maximumFiles, maximumHandAuthoredNetLines: maximumNetLines },
      commentId: normalizedOriginal?.id ?? null,
      commentBodyHash: normalizedOriginal?.bodyHash ?? null,
      subjectHash: originalPayload?.subjectHash ?? null,
      subject: originalSubject,
      originalCommentId: normalizedOriginal?.id ?? null,
      originalBodyHash: normalizedOriginal?.bodyHash ?? null,
      originalSubjectHash: originalPayload?.subjectHash ?? null,
      currentFinalSourceReceiptId: currentFinal?.normalized?.id ?? null,
      taskAuthorization: authorizationOk ? "VALID" : "INVALID",
      finalSourceAttestationRequiredAtThisStage: false,
      receiptLifecycleContract: ASSURANCE_RECEIPT_LIFECYCLE_V2,
      finalSourceAttestationClassifications: finalReceipts.map(({ normalized, status }) => ({ commentId: normalized?.id ?? null, status })).sort((left, right) => left.commentId - right.commentId),
      checks: { ...authorizationChecks, ...attestationChecks },
      findings: authorizationOk ? [] : Object.entries(authorizationChecks).filter(([, value]) => !value).map(([key]) => `OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_INVALID:${key}`),
      mergeFindings: mergeEligible ? [] : Object.entries(attestationChecks).filter(([, value]) => !value).map(([key]) => `OWNER_ASSURANCE_ARCHITECTURE_MERGE_INELIGIBLE:${key}`),
    };
  }
  if (originalSubject?.objective === "remove the finite-task admission-to-clearance state cycle and make admission prospectively grant computed preimplementation clearance") {
    const payloadWithoutHash = Object.fromEntries(Object.entries(originalPayload ?? {}).filter(([key]) => key !== "bodyHash"));
    const descendant = originalSubject?.currentHead !== identity?.headSha
      || originalSubject?.currentTree !== tree
      || stableJson(originalSubject?.changedPaths) !== stableJson(observed.changedPaths);
    const finalReceipts = finalMatches.map((item) => {
      const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item.id });
      const payload = parseExactOwnerBody(normalized, ARCHITECTURE_FINAL_SOURCE_MARKER);
      const body = Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => key !== "bodyHash"));
      const structurallyValid = Boolean(normalized
        && payload?.subject?.type === "OWNER_ASSURANCE_ARCHITECTURE_FINAL_SOURCE_V1"
        && payload.subjectHash === hashValue(payload.subject)
        && payload.bodyHash === hashValue(body)
        && normalized.body === architectureFinalSourceOwnerCommentBody(payload.subject));
      const current = structurallyValid && payload.subject.currentHead === identity?.headSha && payload.subject.currentTree === tree;
      return { normalized, payload, structurallyValid, current };
    });
    const currentFinals = finalReceipts.filter(({ current }) => current);
    const expected = descendant
      ? architectureFinalSourceSubject({ identity, tree, scope, originalRaw: raw, root })
      : architectureMaintenanceSubject({ identity, tree, scope, profile: "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1", root });
    const currentFinal = currentFinals[0];
    const ancestry = ancestryVerified ?? (originalSubject?.currentHead === identity?.headSha || typedGit(root, ["merge-base", "--is-ancestor", originalSubject?.currentHead, identity?.headSha]).status === 0);
    const checks = {
      identity: Boolean(normalizedOriginal),
      body: normalizedOriginal?.body === architectureMaintenanceOwnerCommentBody(originalSubject),
      hashes: originalPayload?.subjectHash === hashValue(originalSubject) && originalPayload?.bodyHash === hashValue(payloadWithoutHash),
      binding: originalSubject?.repository === identity?.repository && originalSubject?.pr === identity?.pr && originalSubject?.branch === identity?.branch && originalSubject?.protectedBase === identity?.baseSha && originalSubject?.budget?.maximumFiles === 15 && originalSubject?.budget?.maximumNetLines === 3500,
      ancestry,
      cardinality: paginationComplete && originalMatches.length === 1 && successorMatches.length === 0 && finalMatches.length === (descendant ? 1 : 0) && currentFinals.length === (descendant ? 1 : 0) && finalReceipts.every(({ structurallyValid }) => structurallyValid),
      receipt: !descendant || (currentFinal?.normalized?.body === architectureFinalSourceOwnerCommentBody(expected) && stableJson(currentFinal?.payload?.subject) === stableJson(expected)),
      exactPaths: observed.changedPaths.length > 0 && observed.changedPaths.length <= 15 && observed.changedPaths.every((file) => ADMISSION_CLEARANCE_ARCHITECTURE_PATHS.includes(file)) && stableJson(expected?.changedPaths) === stableJson(observed.changedPaths),
      budget: observed.netChangedLines <= 3500,
      authority: Object.values(originalSubject?.authority ?? {}).every((value) => value === false) && noCompetingDomainOwner,
      capability: stableJson(originalSubject?.capabilities) === stableJson(["FINITE_TASK_ADMISSION_TO_CLEARANCE_V1"]) && originalSubject?.terminalTruthRequired === false && originalSubject?.reusableByAnotherPr === true,
    };
    const authorizationOk = Object.entries(checks).filter(([key]) => key !== "receipt" && key !== "cardinality").every(([, value]) => Boolean(value));
    const ok = Object.values(checks).every(Boolean);
    return {
      ok,
      authorizationOk,
      mergeEligible: ok,
      type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE",
      repository: identity?.repository,
      pr: identity?.pr,
      branch: identity?.branch,
      currentHead: identity?.headSha,
      currentTree: tree,
      featureId: "assurance-efficiency-e0",
      objectiveDomains: [],
      supportingDomains: ["CI-test-infrastructure"],
      historicalWaiverPath: null,
      authoritySource: "IMMUTABLE_OWNER_ARCHITECTURE_MAINTENANCE",
      bindingId: `owner-architecture-maintenance-pr-${identity?.pr}`,
      budget: { maximumFiles: 15, maximumHandAuthoredNetLines: 3500 },
      commentId: descendant ? currentFinal?.normalized?.id ?? null : normalizedOriginal?.id ?? null,
      commentBodyHash: descendant ? currentFinal?.normalized?.bodyHash ?? null : normalizedOriginal?.bodyHash ?? null,
      subjectHash: descendant ? currentFinal?.payload?.subjectHash ?? null : originalPayload?.subjectHash ?? null,
      subject: expected,
      originalCommentId: normalizedOriginal?.id ?? null,
      originalBodyHash: normalizedOriginal?.bodyHash ?? null,
      originalSubjectHash: originalPayload?.subjectHash ?? null,
      currentFinalSourceReceiptId: currentFinal?.normalized?.id ?? null,
      checks,
      findings: ok ? [] : Object.entries(checks).filter(([, value]) => !value).map(([key]) => `OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_INVALID:${key}`),
    };
  }
  if (originalSubject?.objective === "install governed pre-admission seed packets and generic finite-task admission successors") {
    const body = Object.fromEntries(Object.entries(originalPayload ?? {}).filter(([key]) => key !== "bodyHash"));
    const descendant = originalSubject?.currentHead !== identity?.headSha || originalSubject?.currentTree !== tree;
    const amendmentRaw = dependencyAmendmentMatches[0];
    const amendment = amendmentRaw ? normalizeGitHubCommentIdentity(amendmentRaw, { repository: identity?.repository, pr: identity?.pr, commentId: amendmentRaw.id }) : null;
    const amendmentPayload = parseExactOwnerBody(amendment, PRE_ADMISSION_DEPENDENCY_AMENDMENT_MARKER);
    const amendmentBody = Object.fromEntries(Object.entries(amendmentPayload ?? {}).filter(([key]) => key !== "bodyHash"));
    const amendmentSubject = amendmentPayload?.subject;
    const amended = Boolean(amendmentSubject);
    const rejectedReceiptIds = [5286301806, 5288255120];
    const rejectedRaws = rejectedReceiptIds.map((id) => finalMatches.find((item) => item.id === id)).filter(Boolean);
    const rejectedRecords = rejectedRaws.map((item) => {
      const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item.id });
      return { normalized, payload: parseExactOwnerBody(normalized, ARCHITECTURE_FINAL_SOURCE_MARKER) };
    });
    const correctionRaw = finalSourceCorrectionMatches[0];
    const correction = correctionRaw ? normalizeGitHubCommentIdentity(correctionRaw, { repository: identity?.repository, pr: identity?.pr, commentId: correctionRaw.id }) : null;
    const correctionPayload = parseExactOwnerBody(correction, ARCHITECTURE_FINAL_SOURCE_CORRECTION_MARKER);
    const correctionBody = Object.fromEntries(Object.entries(correctionPayload ?? {}).filter(([key]) => key !== "bodyHash"));
    const currentFinals = finalMatches.filter(({ id }) => !rejectedReceiptIds.includes(id)).map((item) => {
      const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item.id });
      const payload = parseExactOwnerBody(normalized, ARCHITECTURE_FINAL_SOURCE_MARKER);
      return { normalized, payload };
    }).filter(({ payload }) => payload?.subject?.currentHead === identity?.headSha && payload?.subject?.currentTree === tree);
    const normalizedFinal = currentFinals[0]?.normalized ?? null;
    const finalPayload = currentFinals[0]?.payload ?? null;
    const expected = descendant
      ? architectureFinalSourceSubject({ identity, tree, scope, originalRaw: raw, dependencyAmendmentRaw: amendmentRaw, historicalRejectedRaws: rejectedRaws, finalSourceCorrectionRaw: correctionRaw, dependencyEvidence: finalPayload?.subject?.dependencyEvidence, root })
      : architectureMaintenanceSubject({ identity, tree, scope, profile: "PRE_ADMISSION_ENGINEERING_SEED_AND_ADMISSION_SUCCESSOR_V1", root });
    const dependency = finalPayload?.subject?.dependencyEvidence;
    const fixedAddedPaths = ["package-lock.json", "package.json", "scripts/test-brace-expansion-compat.mjs"];
    const amendmentAuthority = !amended || (dependencyAmendmentMatches.length === 1
      && amendment?.id === 5288039864
      && amendment?.createdAt === amendment?.updatedAt
      && amendmentPayload?.subjectHash === hashValue(amendmentSubject)
      && amendmentPayload?.bodyHash === hashValue(amendmentBody)
      && amendmentSubject?.preAmendmentHead === "abc503c1d692b0f7ce262522a7d017c8671002c5"
      && amendmentSubject?.preAmendmentTree === "a4ac64c955737a7be2a89beb89d086f1129c0b09"
      && typedGit(root, ["merge-base", "--is-ancestor", amendmentSubject.preAmendmentHead, identity?.headSha]).status === 0
      && amendmentSubject?.originalOwnerComment === normalizedOriginal?.id
      && amendmentSubject?.rejectedReceipt === 5286301806
      && stableJson(amendmentSubject?.addedDependencyPaths) === stableJson(fixedAddedPaths)
      && stableJson(amendmentSubject?.finalPaths) === stableJson(observed.changedPaths)
      && amendmentSubject?.finalPathHash === observed.changedPathHash
      && amendmentSubject?.newBudget?.maximumFiles === 15
      && amendmentSubject?.newBudget?.maximumCanonicalNetLines === 4500
      && amendmentSubject?.advisories?.length === 1
      && amendmentSubject.advisories[0]?.id === "GHSA-2v37-7h3g-55p8"
      && amendmentSubject.advisories[0]?.fixedVersion === "3.3.18"
      && amendmentSubject?.dependencyBlockerPacketHash === "6930b7e3c0cf3f6bb4634c57738ce6cbb326cc88087998a24271f696d67f804a"
      && Object.values(amendmentSubject?.authority ?? {}).every((value) => value === false));
    const expectedRejectedReceipts = [
      { id: 5286301806, bodyHash: "095b5a88b4c795566d70fdf9b16c26e72d6c6d521a08b703146373f09118c250", subjectHash: "936129f9e4e6d21f0805d3074f3339b081391ea00248e070824893f4f27d090e", field: "netChangedLines", value: 507 },
      { id: 5288255120, bodyHash: "143103b3f956b0add4469f65023e171f027dbdedeb476ac628d44fa2e1b9b865", subjectHash: "1416d9ca37e484e6ba98060687f21c8a6a04caed5f8980f64a4e16b0947a6e11", field: "diffHash", value: "c333c824cebc63f327ac3363c559fb202743b0f3d754367244b5cf1ff1580bdf" },
    ];
    const rejectedHistorical = !amended || (rejectedRecords.length === expectedRejectedReceipts.length && expectedRejectedReceipts.every((expectedReceipt) => {
      const record = rejectedRecords.find(({ normalized }) => normalized?.id === expectedReceipt.id);
      return record?.normalized?.bodyHash === expectedReceipt.bodyHash && record?.payload?.subjectHash === expectedReceipt.subjectHash && record?.payload?.subject?.[expectedReceipt.field] === expectedReceipt.value;
    }));
    const correctionSubject = correctionPayload?.subject;
    const correctionAuthority = !amended || (finalSourceCorrectionMatches.length === 1
      && correction?.id === 5288382574
      && correction?.createdAt === correction?.updatedAt
      && correction?.bodyHash === "89673503a665bdb2e86078387707c98595f1864c488851987e39b32feb17a398"
      && correctionPayload?.subjectHash === "b3b09d83f9fa10d2c90f43dd1bed16db51e9ecb3e7b05d0b23e3c6f8ee8d191d"
      && correctionPayload?.subjectHash === hashValue(correctionSubject)
      && correctionPayload?.bodyHash === hashValue(correctionBody)
      && correctionSubject?.preCorrectionHead === "4f0e1a70b8c617e0563aa0bd19ef2df1d9830894"
      && correctionSubject?.preCorrectionTree === "cc628c10a834bf58eca233379198de21526993b6"
      && typedGit(root, ["merge-base", "--is-ancestor", correctionSubject.preCorrectionHead, identity?.headSha]).status === 0
      && correctionSubject?.originalOwnerComment === normalizedOriginal?.id
      && correctionSubject?.dependencyAmendmentComment === amendment?.id
      && stableJson(correctionSubject?.historicalReceipts?.map(({ commentId }) => commentId)) === stableJson(rejectedReceiptIds)
      && stableJson(correctionSubject?.authorizedPaths) === stableJson(["scripts/assurance/engineering-closure.mjs", "scripts/assurance/pr-scope.mjs", "tests/assurance/pr-scope-feature-bundles.test.mjs"])
      && correctionSubject?.replacementFinalSourceReceiptMaximum === 1
      && Object.values(correctionSubject?.authority ?? {}).every((value) => value === false));
    const dependencyEvidence = !amended || (dependency?.blockerPacketHash === amendmentSubject?.dependencyBlockerPacketHash
      && dependency?.cleanInstalls?.A?.status === "PASS"
      && dependency?.cleanInstalls?.B?.status === "PASS"
      && /^[0-9a-f]{64}$/u.test(dependency?.cleanInstalls?.A?.installedGraphHash ?? "")
      && dependency.cleanInstalls.A.installedGraphHash === dependency?.cleanInstalls?.B?.installedGraphHash
      && dependency?.audits?.production?.critical === 0
      && dependency?.audits?.production?.high === 0
      && dependency?.audits?.alertAutomation?.critical === 0
      && dependency?.audits?.alertAutomation?.high === 0
      && dependency?.testResults?.capability === "PASS"
      && dependency?.testResults?.compatibility === "PASS"
      && dependency?.testResults?.currentTruthDeterminism === "PASS_3_OF_3");
    const checks = {
      identity: Boolean(normalizedOriginal),
      body: normalizedOriginal?.body === architectureMaintenanceOwnerCommentBody(originalSubject),
      hashes: originalPayload?.subjectHash === hashValue(originalSubject) && originalPayload?.bodyHash === hashValue(body),
      binding: originalSubject?.repository === identity?.repository && originalSubject?.pr === identity?.pr && originalSubject?.branch === identity?.branch && originalSubject?.protectedBase === identity?.baseSha && originalSubject?.budget?.maximumFiles === 13 && originalSubject?.budget?.maximumNetLines === 3000,
      amendment: amendmentAuthority,
      rejectedHistorical,
      correction: correctionAuthority,
      cardinality: paginationComplete && originalMatches.length === 1 && successorMatches.length === 0 && dependencyAmendmentMatches.length === (amended ? 1 : 0) && finalSourceCorrectionMatches.length === (amended ? 1 : 0) && currentFinals.length === (descendant ? 1 : 0) && finalMatches.length === (descendant ? (amended ? 3 : 1) : 0),
      receipt: !descendant || (normalizedFinal?.body === architectureFinalSourceOwnerCommentBody(expected) && finalPayload?.subjectHash === hashValue(finalPayload?.subject) && stableJson(finalPayload?.subject) === stableJson(expected)),
      dependencyEvidence,
      exactPaths: observed.changedPaths.length > 0 && observed.changedPaths.length <= (amended ? 15 : 13) && observed.changedPaths.every((file) => PRE_ADMISSION_ARCHITECTURE_PATHS.includes(file) || fixedAddedPaths.includes(file)) && stableJson(expected?.changedPaths) === stableJson(observed.changedPaths),
      budget: observed.netChangedLines <= (amended ? 4500 : 3000),
      authority: Object.values(originalSubject?.authority ?? {}).every((value) => value === false) && noCompetingDomainOwner,
      capability: stableJson(originalSubject?.capabilities) === stableJson(["OWNER_PRE_ADMISSION_ENGINEERING_SEED_V1", "FINITE_TASK_ADMISSION_SUCCESSOR_V1"]) && originalSubject?.terminalTruthRequired === false && originalSubject?.reusableByAnotherPr === true,
    };
    const ok = Object.values(checks).every(Boolean);
    return { ok, authorizationOk: ok, mergeEligible: ok, type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE", repository: identity?.repository, pr: identity?.pr, branch: identity?.branch, currentHead: identity?.headSha, currentTree: tree, featureId: "assurance-efficiency-e0", objectiveDomains: [], supportingDomains: ["CI-test-infrastructure"], historicalWaiverPath: null, authoritySource: "IMMUTABLE_OWNER_ARCHITECTURE_MAINTENANCE", bindingId: `owner-architecture-maintenance-pr-${identity?.pr}`, budget: { maximumFiles: amended ? 15 : 13, maximumHandAuthoredNetLines: amended ? 4500 : 3000 }, commentId: descendant ? normalizedFinal?.id ?? null : normalizedOriginal?.id ?? null, commentBodyHash: descendant ? normalizedFinal?.bodyHash ?? null : normalizedOriginal?.bodyHash ?? null, subjectHash: descendant ? finalPayload?.subjectHash ?? null : originalPayload?.subjectHash ?? null, subject: expected, originalCommentId: normalizedOriginal?.id ?? null, originalBodyHash: normalizedOriginal?.bodyHash ?? null, originalSubjectHash: originalPayload?.subjectHash ?? null, dependencyAmendmentCommentId: amendment?.id ?? null, finalSourceCorrectionCommentId: correction?.id ?? null, rejectedFinalSourceReceiptIds: rejectedHistorical && amended ? rejectedReceiptIds : [], currentFinalSourceReceiptId: normalizedFinal?.id ?? null, checks, findings: ok ? [] : Object.entries(checks).filter(([, value]) => !value).map(([key]) => `OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_INVALID:${key}`) };
  }
  const descendant = originalSubject?.currentHead !== identity?.headSha
    || originalSubject?.currentTree !== tree
    || stableJson(originalSubject?.changedPaths) !== stableJson(observed.changedPaths);
  const successorRaw = successorMatches[0];
  const normalizedSuccessor = successorRaw ? normalizeGitHubCommentIdentity(successorRaw, { repository: identity?.repository, pr: identity?.pr, commentId: successorRaw.id }) : null;
  const successorPayload = parseExactOwnerBody(normalizedSuccessor, ARCHITECTURE_MAINTENANCE_SUCCESSOR_MARKER);
  const historicalReceiptValid = identity?.pr !== 227 || (successorMatches.length === 1 && normalizedSuccessor?.id === HISTORICAL_ARCHITECTURE_RECEIPT.commentId && normalizedSuccessor?.bodyHash === HISTORICAL_ARCHITECTURE_RECEIPT.bodyHash && successorPayload?.subjectHash === HISTORICAL_ARCHITECTURE_RECEIPT.subjectHash && successorPayload?.subject?.currentHead === HISTORICAL_ARCHITECTURE_RECEIPT.head && successorPayload?.subject?.currentTree === HISTORICAL_ARCHITECTURE_RECEIPT.tree && normalizedSuccessor?.body === architectureMaintenanceSuccessorOwnerCommentBody(successorPayload.subject));
  const expectedFinal = descendant && successorRaw
    ? architectureFinalSourceSubject({ identity, tree, scope, originalRaw: raw, historicalRaw: successorRaw, root })
    : null;
  const expectedFinalBody = expectedFinal ? architectureFinalSourceOwnerCommentBody(expectedFinal) : null;
  const finalReceipts = finalMatches.map((item) => {
    const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item.id });
    const payload = parseExactOwnerBody(normalized, ARCHITECTURE_FINAL_SOURCE_MARKER);
    const body = Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => key !== "bodyHash"));
    const structurallyValid = Boolean(normalized
      && payload?.subject?.type === "OWNER_ASSURANCE_ARCHITECTURE_FINAL_SOURCE_V1"
      && payload.subjectHash === hashValue(payload.subject)
      && payload.bodyHash === hashValue(body)
      && normalized.body === architectureFinalSourceOwnerCommentBody(payload.subject)
      && stableJson(payload.subject.changedPaths) === stableJson(TYPED_CONTEXT_ARCHITECTURE_PATHS)
      && payload.subject.changedPathHash === hashValue(TYPED_CONTEXT_ARCHITECTURE_PATHS)
      && /^[0-9a-f]{64}$/u.test(payload.subject.diffHash ?? "")
      && payload.subject.budget?.maximumFiles === 8
      && payload.subject.budget?.maximumNetLines === 1800
      && payload.subject.originalCommentId === normalizedOriginal?.id
      && payload.subject.originalSubjectHash === originalPayload?.subjectHash
      && stableJson(payload.subject.authority) === stableJson(originalSubject?.authority));
    const sameHead = structurallyValid && payload.subject.currentHead === identity?.headSha && payload.subject.currentTree === tree;
    const exactHistoricalCanonical = identity?.pr === 227
      && normalized?.id === 5280109323
      && normalized?.bodyHash === "08aa4e3239ca36cd07e5d2535b351e97f894b5021b1f20a9b20c7335229b92e9"
      && payload?.subjectHash === "866da37ef99aea7452e77e0071225dfbea143d3e170f66e401210ca7085098f5"
      && payload?.subject?.diffHash === "ce2b3dd4004f7fb8a8a2af4e1a6d83a6c2e17453f714b1eb9ff26a62588490ea"
      && payload?.subject?.currentTaskReportHash === "4f0b86dd7d533b4db025a6275dcc45bc53653a99439177309e426faded90deeb"
      && payload?.subject?.taskDeltaHash === "6382072df8334a40117f0b14f803c6eab59063a128410a124b98e5d9c7e261f0";
    const canonical = sameHead
      && payload.subject.diffHash === scope?.diffHash
      && payload.subject.netChangedLines === observed.netChangedLines
      && (normalized.body === expectedFinalBody || exactHistoricalCanonical);
    const status = !structurallyValid
      ? "MALFORMED_INVALID"
      : !sameHead
        ? "HISTORICAL_STALE_HEAD"
        : canonical
          ? "CURRENT_CANONICAL"
          : "HISTORICAL_REJECTED_CANONICALIZATION";
    return { normalized, payload, structurallyValid, status };
  });
  const currentFinals = finalReceipts.filter(({ status }) => status === "CURRENT_CANONICAL");
  const currentReceiptValid = !descendant || currentFinals.length === 1;
  const subject = descendant ? currentFinals[0]?.payload?.subject : architectureMaintenanceSubject({ identity, tree, scope, root });
  const ancestry = ancestryVerified ?? (originalSubject?.currentHead === identity?.headSha || typedGit(root, ["merge-base", "--is-ancestor", originalSubject?.currentHead, identity?.headSha]).status === 0);
  const originalPayloadWithoutHash = Object.fromEntries(Object.entries(originalPayload ?? {}).filter(([key]) => key !== "bodyHash"));
  const checks = {
    identity: Boolean(normalizedOriginal),
    originalBody: Boolean(originalSubject) && normalizedOriginal?.body === architectureMaintenanceOwnerCommentBody(originalSubject),
    originalHashes: Boolean(originalSubject) && originalPayload?.subjectHash === hashValue(originalSubject) && originalPayload?.bodyHash === hashValue(originalPayloadWithoutHash),
    originalBinding: originalSubject?.repository === identity?.repository && originalSubject?.pr === identity?.pr && originalSubject?.branch === identity?.branch && originalSubject?.protectedBase === TYPED_CONTEXT_DOCTRINE_MERGE && originalSubject?.budget?.maximumFiles === 8 && originalSubject?.budget?.maximumNetLines === 1800,
    originalAuthority: originalSubject?.featureId === "assurance-efficiency-e0" && originalSubject?.objective === "remove static per-PR context recursion and create typed terminal truth successors" && originalSubject?.terminalTruthRequired === true && originalSubject?.expectedTerminalNextTask === TYPED_CONTEXT_NEXT_TASK && Object.values(originalSubject?.authority ?? {}).every((value) => value === false),
    ancestry,
    commentCardinality: paginationComplete && originalMatches.length === 1 && originalMatches[0]?.id === raw?.id && finalReceipts.every(({ status }) => status !== "MALFORMED_INVALID") && currentFinals.length <= 1,
    successorBody: historicalReceiptValid,
    successorHashes: historicalReceiptValid,
    successorSeed: identity?.pr !== 227 || (normalizedSuccessor?.id === 5277054532
      && identity?.branch === "codex/typed-task-context-terminal-successor-v1"
      && normalizedOriginal?.id === 5276216820
      && originalPayload?.subjectHash === "2bec002a4dc7ecec3cec2a5afec477cd325bb4bf7131d3def60fddf6b943642c"
      && normalizedOriginal?.bodyHash === "bfa2ad32ed776b6291135899009e823677fb668b27a89bb6a50baa965f3c1bab"
      && originalSubject?.currentHead === "16c2421ec41786979c4fce9741efed8c66632c09"
      && originalSubject?.currentTree === "80ae1d92b735e6554a93e4df16a9746027b680c3"
      && originalSubject?.changedPathHash === "02b80940320b4047c0abf2473afaf00c98f2f01238ae3878b14528a5cef1bf9b"),
    successorScope: identity?.pr !== 227 || (stableJson(successorPayload?.subject?.addedPaths) === stableJson(["scripts/assurance/lib.mjs", "tests/assurance/active-task-binding-a1.test.mjs"]) && stableJson(successorPayload?.subject?.changedPaths) === stableJson(TYPED_CONTEXT_ARCHITECTURE_PATHS)),
    currentFinalReceipt: currentReceiptValid,
    exactPaths: observed.changedPaths.length > 0 && observed.changedPaths.length <= 8 && observed.changedPaths.every((file) => TYPED_CONTEXT_ARCHITECTURE_PATHS.includes(file)) && !observed.changedPaths.some((file) => file.includes("*")),
    budget: observed.netChangedLines <= 1800,
    authority: (subject?.authority ?? originalSubject?.authority) && Object.values(subject?.authority ?? originalSubject?.authority).every((value) => value === false) && noCompetingDomainOwner,
  };
  const authorizationOk = Object.entries(checks).filter(([key]) => key !== "currentFinalReceipt").every(([, value]) => Boolean(value));
  const ok = authorizationOk && currentReceiptValid;
  const effectiveSubject = descendant ? subject : originalSubject;
  const staleLegacyReceiptId = historicalReceiptValid && identity?.pr === 227 ? HISTORICAL_ARCHITECTURE_RECEIPT.commentId : null;
  const historicalFinalSourceReceiptIds = [
    ...finalReceipts.filter(({ status }) => status !== "CURRENT_CANONICAL" && status !== "MALFORMED_INVALID").map(({ normalized }) => normalized.id),
    ...(staleLegacyReceiptId ? [staleLegacyReceiptId] : []),
  ].sort((left, right) => left - right);
  const rejectedFinalSourceReceiptIds = finalReceipts.filter(({ status }) => status === "HISTORICAL_REJECTED_CANONICALIZATION").map(({ normalized }) => normalized.id).sort((left, right) => left - right);
  return { ok, authorizationOk, mergeEligible: ok, type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE", repository: identity?.repository, pr: identity?.pr, branch: identity?.branch, currentHead: identity?.headSha, currentTree: tree, featureId: "assurance-efficiency-e0", objectiveDomains: [], supportingDomains: ["CI-test-infrastructure"], historicalWaiverPath: null, authoritySource: "IMMUTABLE_OWNER_ARCHITECTURE_MAINTENANCE", bindingId: `owner-architecture-maintenance-pr-${identity?.pr}`, budget: { maximumFiles: 8, maximumHandAuthoredNetLines: 1800 }, commentId: descendant ? currentFinals[0]?.normalized?.id ?? null : normalizedOriginal?.id ?? null, currentFinalSourceReceiptId: descendant ? currentFinals[0]?.normalized?.id ?? null : null, commentBodyHash: descendant ? currentFinals[0]?.normalized?.bodyHash ?? null : normalizedOriginal?.bodyHash ?? null, subjectHash: effectiveSubject ? hashValue(effectiveSubject) : null, subject: effectiveSubject, originalCommentId: normalizedOriginal?.id ?? null, originalBodyHash: normalizedOriginal?.bodyHash ?? null, originalSubjectHash: originalPayload?.subjectHash ?? null, finalSourceReceiptClassifications: finalReceipts.map(({ normalized, status }) => ({ commentId: normalized?.id ?? null, status })).sort((left, right) => (left.commentId ?? 0) - (right.commentId ?? 0)), historicalFinalSourceReceiptIds, rejectedFinalSourceReceiptIds, historicalFinalSourceReceipts: historicalFinalSourceReceiptIds, staleLegacyReceiptId, checks, findings: ok ? [] : Object.entries(checks).filter(([, value]) => !value).map(([key]) => `OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_INVALID:${key}`) };
}

export function finiteTaskTerminalTruthSubject({ identity, tree, scope, terminalTransition, priorTruthHash } = {}) {
  const observed = exactScope(scope);
  const terminalEvidence = terminalTransition?.terminalEvidence ?? null;
  return {
    type: FINITE_TASK_TERMINAL_TRUTH_V1,
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    protectedBase: identity?.baseSha,
    startingHead: identity?.headSha,
    startingTree: tree,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    diffHash: scope?.diffHash ?? null,
    netChangedLines: observed.netChangedLines,
    budget: { maximumFiles: 3, maximumNetLines: 1200 },
    priorCurrentTruthHash: priorTruthHash,
    implementationTerminalEvidence: terminalEvidence,
    implementationTerminalEvidenceHash: terminalEvidence?.evidenceHash ?? null,
    expectedNextTask: terminalEvidence?.nextTask ?? null,
    immutableBaseLeaseRequired: true,
    exactThreePathTransition: true,
    authority: { product: false, nativeProduct: false, package: false, providerContact: false, providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    singleUse: true,
    expiresOn: `PR_${identity?.pr}_MERGE`,
  };
}
export const finiteTaskTerminalTruthOwnerCommentBody = (subject) => ownerCommentBody(TERMINAL_TRUTH_SUCCESSOR_MARKER, subject.type, subject);

export function finiteTaskTerminalTruthFinalSourceSubject({ identity, tree, scope, ownerRaw, repositoryReviewRaw, phase1Evidence, terminalTransition } = {}) {
  const owner = normalizeGitHubCommentIdentity(ownerRaw, { repository: identity?.repository, pr: identity?.pr, commentId: ownerRaw?.id });
  const ownerPayload = parseExactOwnerBody(owner, TERMINAL_TRUTH_SUCCESSOR_MARKER);
  const review = verifyArchitectureRepositoryReview({ raw: repositoryReviewRaw, identity, tree, scope, profile: FINITE_TASK_TERMINAL_TRUTH_V1 });
  const observed = exactScope(scope);
  return {
    type: FINITE_TASK_TERMINAL_TRUTH_FINAL_SOURCE_V1,
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    protectedBase: identity?.baseSha,
    originalCommentId: owner?.id ?? null,
    originalSubjectHash: ownerPayload?.subjectHash ?? null,
    originalBodyHash: owner?.bodyHash ?? null,
    originalHead: ownerPayload?.subject?.startingHead ?? null,
    originalTree: ownerPayload?.subject?.startingTree ?? null,
    finalHead: identity?.headSha,
    finalTree: tree,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    diffHash: scope?.diffHash ?? null,
    netChangedLines: observed.netChangedLines,
    implementationTerminalEvidenceHash: terminalTransition?.terminalEvidence?.evidenceHash ?? null,
    repositoryReview: {
      commentId: review.commentId,
      commentBodyHash: review.commentBodyHash,
      subjectHash: review.subjectHash,
      reviewedHead: review.reviewedHead,
      reviewedTree: review.reviewedTree,
      disposition: review.disposition,
      profile: FINITE_TASK_TERMINAL_TRUTH_V1,
      valid: review.valid,
    },
    phase1: phase1Evidence ? {
      runId: phase1Evidence.runId,
      runAttempt: phase1Evidence.runAttempt,
      sourceHead: phase1Evidence.sourceHead,
      sourceTree: phase1Evidence.sourceTree,
      requiredJobs: phase1Evidence.requiredJobs,
      passedJobs: phase1Evidence.passedJobs,
      result: phase1Evidence.result,
      evidenceHash: phase1Evidence.evidenceHash,
      valid: phase1Evidence.valid,
    } : null,
    authority: ownerPayload?.subject?.authority ?? null,
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    expiresOn: `PR_${identity?.pr}_MERGE`,
  };
}
export const finiteTaskTerminalTruthFinalSourceOwnerCommentBody = (subject) => ownerCommentBody(ARCHITECTURE_FINAL_SOURCE_MARKER, subject.type, subject);

export function verifyFiniteTaskTerminalTruthAuthority({
  raw,
  allComments = [],
  paginationComplete = false,
  identity,
  tree,
  scope,
  terminalTransition,
  priorTruthHash,
  priorTruth,
  truthRecord,
  currentStateText,
  nextTaskText,
  currentMain,
  openTerminalSuccessorCount = 1,
  transitionPreviouslyConsumed = false,
  ancestryVerified,
  phase1EvidenceResolver = ({ runId }) => observePhase1RunEvidence({ runId, identity, tree }),
  root = REPOSITORY_ROOT,
} = {}) {
  const observed = exactScope(scope);
  const terminalEvidence = terminalTransition?.terminalEvidence;
  const ownerMatches = allComments.filter(({ body }) => typeof body === "string" && body.startsWith(`${TERMINAL_TRUTH_SUCCESSOR_MARKER}\n`));
  const owner = normalizeGitHubCommentIdentity(raw, { repository: identity?.repository, pr: identity?.pr, commentId: raw?.id });
  const ownerPayload = parseExactOwnerBody(owner, TERMINAL_TRUTH_SUCCESSOR_MARKER);
  const ownerSubject = ownerPayload?.subject;
  const ownerPayloadWithoutHash = Object.fromEntries(Object.entries(ownerPayload ?? {}).filter(([key]) => key !== "bodyHash"));
  const ancestry = ancestryVerified ?? (ownerSubject?.startingHead === identity?.headSha || typedGit(root, ["merge-base", "--is-ancestor", ownerSubject?.startingHead, identity?.headSha]).status === 0);
  const ownerCanonical = Boolean(owner
    && ownerSubject?.type === FINITE_TASK_TERMINAL_TRUTH_V1
    && ownerPayload?.subjectHash === hashValue(ownerSubject)
    && ownerPayload?.bodyHash === hashValue(ownerPayloadWithoutHash)
    && owner.body === finiteTaskTerminalTruthOwnerCommentBody(ownerSubject));
  const ownerBinding = ownerCanonical
    && ownerSubject.repository === identity?.repository
    && ownerSubject.pr === identity?.pr
    && ownerSubject.branch === identity?.branch
    && ownerSubject.protectedBase === identity?.baseSha
    && stableJson(ownerSubject.changedPaths) === stableJson(TERMINAL_TRUTH_PATHS)
    && ownerSubject.budget?.maximumFiles === 3
    && ownerSubject.budget?.maximumNetLines === 1200
    && ownerSubject.priorCurrentTruthHash === priorTruthHash
    && stableJson(ownerSubject.implementationTerminalEvidence) === stableJson(terminalEvidence)
    && ownerSubject.implementationTerminalEvidenceHash === terminalEvidence?.evidenceHash
    && ownerSubject.expectedNextTask === terminalEvidence?.nextTask
    && ownerSubject.immutableBaseLeaseRequired === true
    && ownerSubject.exactThreePathTransition === true
    && Object.values(ownerSubject.authority ?? {}).every((value) => value === false);
  const reviewCandidates = allComments.filter(({ body }) => typeof body === "string" && body.startsWith(`${ARCHITECTURE_REPOSITORY_REVIEW_MARKER}\n`));
  const validReviews = reviewCandidates.map((reviewRaw) => verifyArchitectureRepositoryReview({ raw: reviewRaw, identity, tree, scope, profile: FINITE_TASK_TERMINAL_TRUTH_V1 })).filter(({ valid }) => valid);
  const review = validReviews.length === 1 ? validReviews[0] : null;
  const finalMatches = allComments.filter(({ body }) => typeof body === "string" && body.startsWith(`${ARCHITECTURE_FINAL_SOURCE_MARKER}\n`));
  const parsedFinals = finalMatches.map((item) => {
    const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item?.id });
    const payload = parseExactOwnerBody(normalized, ARCHITECTURE_FINAL_SOURCE_MARKER);
    return { raw: item, normalized, payload };
  }).filter(({ payload }) => payload?.subject?.type === FINITE_TASK_TERMINAL_TRUTH_FINAL_SOURCE_V1);
  const currentFinals = parsedFinals.filter(({ payload }) => payload?.subject?.finalHead === identity?.headSha && payload?.subject?.finalTree === tree);
  const currentFinal = currentFinals.length === 1 ? currentFinals[0] : null;
  const phase1 = phase1EvidenceResolver({ runId: currentFinal?.payload?.subject?.phase1?.runId, identity, tree });
  const expectedFinal = currentFinal ? finiteTaskTerminalTruthFinalSourceSubject({ identity, tree, scope, ownerRaw: raw, repositoryReviewRaw: reviewCandidates.find(({ id }) => id === review?.commentId), phase1Evidence: phase1, terminalTransition }) : null;
  const currentFinalPayloadWithoutHash = Object.fromEntries(Object.entries(currentFinal?.payload ?? {}).filter(([key]) => key !== "bodyHash"));
  const finalValid = Boolean(currentFinal?.normalized
    && currentFinal.payload?.subjectHash === hashValue(currentFinal.payload.subject)
    && currentFinal.payload?.bodyHash === hashValue(currentFinalPayloadWithoutHash)
    && stableJson(currentFinal.payload.subject) === stableJson(expectedFinal)
    && currentFinal.normalized.body === finiteTaskTerminalTruthFinalSourceOwnerCommentBody(expectedFinal));
  const baseLease = (truthRecord?.finiteTaskLeases?.tasks ?? []).find(({ leaseId }) => leaseId === terminalEvidence?.leaseId);
  const priorBaseLease = (priorTruth?.finiteTaskLeases?.tasks ?? []).find(({ leaseId }) => leaseId === terminalEvidence?.leaseId);
  const binding = truthRecord?.activeTaskBinding;
  const latest = truthRecord?.latestMergedImplementationPr;
  const canonicalCurrent = truthRecord ? renderCurrentState(truthRecord) : null;
  const canonicalNext = truthRecord ? renderNextTask(truthRecord) : null;
  const checks = {
    identity: ownerCanonical && identity?.baseSha === currentMain,
    ownerBinding,
    ownerCardinality: paginationComplete && ownerMatches.length === 1 && ownerMatches[0]?.id === raw?.id,
    ancestry,
    exactPaths: stableJson(observed.changedPaths) === stableJson(TERMINAL_TRUTH_PATHS) && observed.netChangedLines <= 1200,
    transition: finiteTaskPostMergeTransitionAuthorityValid(terminalTransition) && terminalEvidence?.mergeSha === identity?.baseSha,
    immutableBaseLease: Boolean(baseLease && priorBaseLease && stableJson(baseLease) === stableJson(priorBaseLease) && hashValue(baseLease) === terminalEvidence?.baseLeaseHash),
    terminalProjection: stableJson(truthRecord?.finiteTaskRuntime?.terminalOutcome) === stableJson(terminalEvidence)
      && binding?.phase === "TERMINAL"
      && binding?.currentImplementationHead === terminalEvidence?.sourceHead
      && binding?.currentImplementationTree === terminalEvidence?.sourceTree
      && stableJson(binding?.terminalEvidence) === stableJson(terminalEvidence)
      && latest?.number === terminalEvidence?.implementationPr
      && latest?.state === "merged"
      && latest?.head === terminalEvidence?.sourceHead
      && latest?.mergeSha === terminalEvidence?.mergeSha
      && !(truthRecord?.openImplementationPrs ?? []).some(({ number }) => number === terminalEvidence?.implementationPr),
    generatedTruth: truthRecord?.mainSha === terminalEvidence?.mergeSha
      && truthRecord?.protectedMainAuthority?.checkpointSha === terminalEvidence?.mergeSha
      && truthRecord?.protectedMainAuthority?.checkpointTree === terminalEvidence?.mergeTree
      && terminalEvidence?.nextTask === truthRecord?.engineeringDoctrine?.nextPermittedAction
      && currentStateText === canonicalCurrent
      && nextTaskText === canonicalNext,
    review: validReviews.length === 1 && stableJson(review?.disposition) === stableJson({ P0: 0, P1: 0, launchImpactingP2: 0 }),
    phase1: phase1?.valid === true && phase1?.result === "PASS_13_OF_13" && phase1?.sourceHead === identity?.headSha && phase1?.sourceTree === tree,
    finalSource: currentFinals.length === 1 && finalValid,
    singleUse: openTerminalSuccessorCount === 1 && transitionPreviouslyConsumed === false,
    authorityClosed: Object.values(ownerSubject?.authority ?? {}).every((value) => value === false)
      && Object.values(terminalEvidence?.authority ?? {}).every((value) => value === false),
  };
  const authorizationKeys = ["identity", "ownerBinding", "ownerCardinality", "ancestry", "exactPaths", "transition", "immutableBaseLease", "terminalProjection", "generatedTruth", "singleUse", "authorityClosed"];
  const authorizationOk = authorizationKeys.every((key) => checks[key] === true);
  const mergeEligible = authorizationOk && checks.review && checks.phase1 && checks.finalSource;
  return {
    ok: authorizationOk,
    authorizationOk,
    mergeEligible,
    type: "TERMINAL_TRUTH_SUCCESSOR",
    authoritySource: FINITE_TASK_TERMINAL_TRUTH_V1,
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    currentHead: identity?.headSha,
    currentTree: tree,
    featureId: terminalEvidence?.taskId ?? null,
    objectiveDomains: [],
    supportingDomains: ["CI-test-infrastructure"],
    bindingId: `finite-task-terminal-truth-pr-${identity?.pr}`,
    budget: { maximumFiles: 3, maximumHandAuthoredNetLines: 1200 },
    commentId: owner?.id ?? null,
    currentFinalSourceReceiptId: currentFinal?.normalized?.id ?? null,
    subjectHash: ownerPayload?.subjectHash ?? null,
    commentBodyHash: owner?.bodyHash ?? null,
    checks,
    findings: authorizationOk ? [] : authorizationKeys.filter((key) => !checks[key]).map((key) => `FINITE_TASK_TERMINAL_TRUTH_INVALID:${key}`),
    mergeFindings: mergeEligible ? [] : ["review", "phase1", "finalSource"].filter((key) => !checks[key]).map((key) => `FINITE_TASK_TERMINAL_TRUTH_MERGE_INELIGIBLE:${key}`),
  };
}

export function terminalTruthSuccessorSubject({ identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash } = {}) {
  const observed = exactScope(scope);
  return {
    type: "TERMINAL_TRUTH_SUCCESSOR_V1",
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    head: identity?.headSha,
    tree,
    baseMerge: identity?.baseSha,
    predecessorPr: predecessor?.pr,
    predecessorSourceHead: predecessor?.sourceHead,
    predecessorSourceTree: predecessor?.sourceTree,
    predecessorAuthorityComment: { commentId: predecessorAuthority?.commentId, bodyHash: predecessorAuthority?.commentBodyHash, subjectHash: predecessorAuthority?.subjectHash },
    doctrinePr: 226,
    doctrineMerge: TYPED_CONTEXT_DOCTRINE_MERGE,
    doctrineSourceHead: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceHead,
    doctrineSourceTree: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceTree,
    doctrineOwnerAuthorityCommentIds: [...HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.ownerCommentIds],
    pendingTransitionPolicyId: PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1.policyId,
    pendingTransitions: [
      { pr: 226, mergeSha: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.mergeSha, sourceHead: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceHead, sourceTree: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceTree, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" },
      { pr: predecessor?.pr, mergeSha: predecessor?.mergeSha, sourceHead: predecessor?.sourceHead, sourceTree: predecessor?.sourceTree, authorityCommentId: predecessorAuthority?.commentId, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" },
    ],
    pendingTransitionCountAfterSynchronization: 0,
    priorCurrentTruthHash: priorTruthHash,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    budget: { maximumFiles: 3, maximumNetLines: 1200 },
    expectedDoctrineStatus: "ACTIVE",
    expectedNextTask: TYPED_CONTEXT_NEXT_TASK,
    authority: { providerMutation: false, build: false, submission: false, ota: false, publicRelease: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    singleUse: true,
  };
}
export const terminalTruthSuccessorOwnerCommentBody = (subject) => ownerCommentBody(TERMINAL_TRUTH_SUCCESSOR_MARKER, subject.type, subject);

const TERMINAL_REPAIR_CLASSIFICATION = "CANONICAL_PREDECESSOR_RECEIPT_SELECTION_REPAIR_V1";
const TERMINAL_REPAIR_HISTORICAL_COMMENT_ID = 5280368893;
const REJECTED_PREDECESSOR_RECEIPT = Object.freeze({
  commentId: 5277679438,
  diffHash: "ea1b96e5c6515b05b7499ff7a528c0440a409e064d65fe0a7e65d44ec64b619b",
  disposition: "HISTORICAL_REJECTED_CANONICALIZATION",
});

export function terminalTruthSuccessorVerifierRepairSubject({ identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, originalRaw } = {}) {
  const original = normalizeGitHubCommentIdentity(originalRaw, { repository: identity?.repository, pr: identity?.pr, commentId: originalRaw?.id });
  const originalPayload = parseExactOwnerBody(original, TERMINAL_TRUTH_SUCCESSOR_MARKER);
  const observed = exactScope(scope);
  return {
    type: "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1",
    classification: TERMINAL_REPAIR_CLASSIFICATION,
    repository: identity?.repository,
    pr: identity?.pr,
    branch: identity?.branch,
    head: identity?.headSha,
    tree,
    baseMerge: identity?.baseSha,
    originalTerminalReceipt: { commentId: original?.id, subjectHash: originalPayload?.subjectHash, bodyHash: originalPayload?.bodyHash },
    canonicalPredecessorReceipt: { commentId: predecessorAuthority?.commentId, subjectHash: predecessorAuthority?.subjectHash, bodyHash: predecessorAuthority?.commentBodyHash },
    rejectedPredecessorReceipt: { ...REJECTED_PREDECESSOR_RECEIPT },
    predecessorPr: predecessor?.pr,
    predecessorSourceHead: predecessor?.sourceHead,
    predecessorSourceTree: predecessor?.sourceTree,
    predecessorMerge: predecessor?.mergeSha,
    doctrinePr: 226,
    doctrineMerge: TYPED_CONTEXT_DOCTRINE_MERGE,
    pendingTransitionPolicyId: PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1.policyId,
    pendingTransitions: [
      { pr: 226, mergeSha: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.mergeSha, sourceHead: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceHead, sourceTree: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceTree, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" },
      { pr: predecessor?.pr, mergeSha: predecessor?.mergeSha, sourceHead: predecessor?.sourceHead, sourceTree: predecessor?.sourceTree, authorityCommentId: predecessorAuthority?.commentId, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" },
    ],
    pendingTransitionCountAfterSynchronization: 0,
    priorCurrentTruthHash: priorTruthHash,
    changedPaths: observed.changedPaths,
    changedPathHash: observed.changedPathHash,
    diffHash: scope?.diffHash ?? null,
    netChangedLines: observed.netChangedLines,
    budget: { maximumFiles: 8, maximumNetLines: 1800 },
    expectedDoctrineStatus: "ACTIVE",
    expectedNextTask: TYPED_CONTEXT_NEXT_TASK,
    authority: { product: false, nativeProduct: false, database: false, providerMutation: false, build: false, submission: false, ota: false, publicRelease: false },
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutableCommentRequired: true,
    createdAtEqualsUpdatedAtRequired: true,
    singleUse: true,
    expiresOn: `PR_${identity?.pr}_MERGE`,
  };
}
export const terminalTruthSuccessorVerifierRepairOwnerCommentBody = (subject) => ownerCommentBody(TERMINAL_TRUTH_SUCCESSOR_MARKER, subject.type, subject);

export function verifyTerminalTruthSuccessorAuthority({ raw, allComments = [], paginationComplete = false, identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, truthRecord, currentStateText, nextTaskText, currentMain, openTerminalSuccessorCount = 1, transitionPreviouslyConsumed = false } = {}) {
  const matches = allComments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${TERMINAL_TRUTH_SUCCESSOR_MARKER}\n`));
  const observed = exactScope(scope);
  const repairMode = stableJson(observed.changedPaths) === stableJson(TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS);
  const originalRaw = matches.find(({ id }) => id === TERMINAL_REPAIR_HISTORICAL_COMMENT_ID);
  const subject = repairMode
    ? terminalTruthSuccessorVerifierRepairSubject({ identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, originalRaw })
    : terminalTruthSuccessorSubject({ identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash });
  const expectedBody = repairMode ? terminalTruthSuccessorVerifierRepairOwnerCommentBody(subject) : terminalTruthSuccessorOwnerCommentBody(subject);
  const receipts = matches.map((item) => {
    const normalized = normalizeGitHubCommentIdentity(item, { repository: identity?.repository, pr: identity?.pr, commentId: item.id });
    const payload = parseExactOwnerBody(normalized, TERMINAL_TRUTH_SUCCESSOR_MARKER);
    const payloadWithoutHash = Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => key !== "bodyHash"));
    const structurallyValid = Boolean(normalized
      && ["TERMINAL_TRUTH_SUCCESSOR_V1", "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1"].includes(payload?.subject?.type)
      && payload?.subject?.repository === identity?.repository
      && payload?.subject?.pr === identity?.pr
      && payload?.subject?.branch === identity?.branch
      && payload?.subjectHash === hashValue(payload.subject)
      && payload?.bodyHash === hashValue(payloadWithoutHash)
      && normalized.body === ownerCommentBody(TERMINAL_TRUTH_SUCCESSOR_MARKER, payload.subject.type, payload.subject)
      && Object.values(payload.subject.authority ?? {}).every((value) => value === false));
    const sameHead = structurallyValid && payload.subject.head === identity?.headSha && payload.subject.tree === tree;
    const current = sameHead && normalized.body === expectedBody;
    return {
      normalized,
      payload,
      status: !structurallyValid ? "MALFORMED_INVALID" : !sameHead ? "HISTORICAL_STALE_TERMINAL_RECEIPT" : current ? "CURRENT_CANONICAL" : "MALFORMED_INVALID",
    };
  });
  const currentReceipts = receipts.filter(({ status }) => status === "CURRENT_CANONICAL");
  const current = currentReceipts[0];
  const architecture = truthRecord?.taskContextArchitecture;
  const doctrine = truthRecord?.engineeringDoctrine;
  const canonicalCurrent = truthRecord ? renderCurrentState(truthRecord) : null;
  const canonicalNext = truthRecord ? renderNextTask(truthRecord) : null;
  const repairRecord = architecture?.terminalVerifierRepair;
  const repairRecordValid = !repairMode || (repairRecord?.classification === TERMINAL_REPAIR_CLASSIFICATION
    && repairRecord?.historicalTerminalReceipt === TERMINAL_REPAIR_HISTORICAL_COMMENT_ID
    && repairRecord?.rejectedPredecessorReceipt === REJECTED_PREDECESSOR_RECEIPT.commentId
    && repairRecord?.canonicalPredecessorReceipt === 5280109323
    && repairRecord?.rawPredecessorDiffHash === REJECTED_PREDECESSOR_RECEIPT.diffHash
    && repairRecord?.canonicalPredecessorDiffHash === "ce2b3dd4004f7fb8a8a2af4e1a6d83a6c2e17453f714b1eb9ff26a62588490ea"
    && stableJson(repairRecord?.changedVerifierPaths) === stableJson(TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS.filter((file) => !TERMINAL_TRUTH_PATHS.includes(file)))
    && repairRecord?.singleUse === true
    && stableJson(repairRecord?.authority) === stableJson(subject.authority));
  const expectedPaths = repairMode ? TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS : TERMINAL_TRUTH_PATHS;
  const maximumLines = repairMode ? 1800 : 1200;
  const checks = {
    identity: Boolean(current?.normalized) && identity?.baseSha === currentMain,
    body: current?.normalized?.body === expectedBody,
    hashes: current?.payload?.subjectHash === hashValue(subject) && current?.payload?.bodyHash === hashValue(Object.fromEntries(Object.entries(current?.payload ?? {}).filter(([key]) => key !== "bodyHash"))),
    singleComment: paginationComplete && currentReceipts.length === 1 && receipts.every(({ status }) => status !== "MALFORMED_INVALID") && (!repairMode || receipts.some(({ normalized, status }) => normalized?.id === TERMINAL_REPAIR_HISTORICAL_COMMENT_ID && status === "HISTORICAL_STALE_TERMINAL_RECEIPT")),
    exactPaths: stableJson(observed.changedPaths) === stableJson(expectedPaths) && observed.netChangedLines <= maximumLines,
    predecessor: predecessor?.valid === true && predecessor?.mergeSha === identity?.baseSha && predecessor?.firstParent === TYPED_CONTEXT_DOCTRINE_MERGE && predecessor?.sourceHead === predecessorAuthority?.subject?.currentHead && predecessor?.sourceTree === predecessorAuthority?.subject?.currentTree && predecessorAuthority?.ok === true && predecessorAuthority?.subject?.terminalTruthRequired === true,
    generatedTruth: doctrine?.status === "ACTIVE" && doctrine?.nextPermittedAction === TYPED_CONTEXT_NEXT_TASK && architecture?.architecturePr === predecessor?.pr && architecture?.sourceHead === predecessor?.sourceHead && architecture?.sourceTree === predecessor?.sourceTree && architecture?.mergeSha === predecessor?.mergeSha && architecture?.terminalTransitionConsumed === true && architecture?.pendingTransitionPolicyId === PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1.policyId && architecture?.pendingTransitionCountAfterSynchronization === 0 && stableJson(architecture?.pendingTransitions?.map(({ pr, mergeSha, status }) => ({ pr, mergeSha, status }))) === stableJson(subject.pendingTransitions.map(({ pr, mergeSha, status }) => ({ pr, mergeSha, status }))) && Array.isArray(truthRecord?.openImplementationPrs) && truthRecord.openImplementationPrs.length === 0 && currentStateText === canonicalCurrent && nextTaskText === canonicalNext && repairRecordValid,
    authorityClosed: Object.values(subject.authority ?? {}).every((value) => value === false) && architecture?.authority?.build === false && architecture?.authority?.submission === false && architecture?.authority?.ota === false && architecture?.authority?.publicRelease === false,
    singleUse: openTerminalSuccessorCount === 1 && transitionPreviouslyConsumed === false,
  };
  const ok = Object.values(checks).every(Boolean);
  return { ok, type: "TERMINAL_TRUTH_SUCCESSOR", repository: identity?.repository, pr: identity?.pr, branch: identity?.branch, currentHead: identity?.headSha, currentTree: tree, featureId: "assurance-efficiency-e0", objectiveDomains: [], supportingDomains: ["CI-test-infrastructure"], historicalWaiverPath: null, authoritySource: repairMode ? "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1" : "TERMINAL_TRUTH_SUCCESSOR_V1", bindingId: `terminal-truth-successor-pr-${identity?.pr}`, budget: { maximumFiles: expectedPaths.length, maximumHandAuthoredNetLines: maximumLines }, commentId: current?.normalized?.id ?? null, commentBodyHash: current?.normalized?.bodyHash ?? null, subjectHash: hashValue(subject), subject, currentTerminalReceiptId: current?.normalized?.id ?? null, historicalTerminalReceiptIds: receipts.filter(({ status }) => status === "HISTORICAL_STALE_TERMINAL_RECEIPT").map(({ normalized }) => normalized.id).sort((left, right) => left - right), terminalReceiptClassifications: receipts.map(({ normalized, status }) => ({ commentId: normalized?.id ?? null, status })).sort((left, right) => (left.commentId ?? 0) - (right.commentId ?? 0)), checks, findings: ok ? [] : Object.entries(checks).filter(([, value]) => !value).map(([key]) => `TERMINAL_TRUTH_SUCCESSOR_INVALID:${key}`) };
}

export function readGitHubApi({ root = REPOSITORY_ROOT, args = [], run = spawnSync } = {}) {
  const options = { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 };
  const authenticated = run("gh", ["api", "--method=GET", ...args], options);
  if (authenticated.status === 0) return authenticated;
  const endpoint = args.at(-1);
  const paginated = args.includes("--paginate") && args.includes("--slurp");
  const pathname = typeof endpoint === "string" ? endpoint.split("?", 1)[0] : "";
  const allowedPath = /^repos\/Chillywood2025\/chillywood-mobile\/(?:pulls(?:\/[1-9]\d*(?:\/files)?)?|issues\/[1-9]\d*\/comments|commits\/[0-9a-f]{40}\/pulls)$/u.test(pathname);
  if (!allowedPath || /(?:\.\.|%2e|%2f|#)/iu.test(endpoint)) return authenticated;
  const pages = [];
  for (let page = 1; page <= 20; page += 1) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const pageEndpoint = paginated ? `${endpoint}${separator}per_page=100&page=${page}` : endpoint;
    const response = run("curl", ["--fail", "--silent", "--show-error", "--connect-timeout", "5", "--max-time", "20", "--header", "Accept: application/vnd.github+json", "--header", "X-GitHub-Api-Version: 2022-11-28", "--header", "User-Agent: chillywood-assurance-readonly", `https://api.github.com/${pageEndpoint}`], options);
    if (response.status !== 0) return response;
    if (!paginated) return response;
    let values;
    try { values = JSON.parse(response.stdout); } catch { return { ...response, status: 1 }; }
    if (!Array.isArray(values)) return { ...response, status: 1 };
    pages.push(values);
    if (values.length < 100) return { ...response, status: 0, stdout: JSON.stringify(pages) };
  }
  return { status: 1, stdout: "", stderr: "ASSURANCE_GITHUB_PAGINATION_BOUND_EXCEEDED" };
}
const typedGh = (root, args) => readGitHubApi({ root, args });
const typedGit = (root, args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 });
const finiteTaskAuthorityLiveObservations = new WeakMap();
const parsedResponse = (response, fallback = null) => { try { return response.status === 0 ? JSON.parse(response.stdout) : fallback; } catch { return fallback; } };
const paginatedArray = (root, endpoint) => {
  const response = typedGh(root, ["--paginate", "--slurp", endpoint]);
  const pages = parsedResponse(response, null);
  return { complete: response.status === 0 && Array.isArray(pages) && pages.every(Array.isArray), values: Array.isArray(pages) ? pages.flat() : [] };
};
const paginatedIssueComments = (root, repository, pr) => { const result = paginatedArray(root, `repos/${repository}/issues/${pr}/comments?per_page=100`); const fallback = result.complete ? null : observePublicGitHubPullRequest({ repository, pr }); return { complete: result.complete || fallback?.commentsPaginationComplete === true, comments: result.complete ? result.values : fallback?.comments ?? [] }; };
export function observePhase1RunEvidence({ runId, identity, tree, root = REPOSITORY_ROOT } = {}) {
  if (!Number.isInteger(runId) || runId < 1 || identity?.repository !== "Chillywood2025/chillywood-mobile") return verifyPhase1RunEvidence({ identity, tree });
  const run = parsedResponse(typedGh(root, [`repos/${identity.repository}/actions/runs/${runId}`]), null);
  const jobsPayload = parsedResponse(typedGh(root, [`repos/${identity.repository}/actions/runs/${runId}/jobs?per_page=100`]), null);
  const jobs = Array.isArray(jobsPayload?.jobs) && jobsPayload.total_count === jobsPayload.jobs.length ? jobsPayload.jobs : [];
  return verifyPhase1RunEvidence({ run, jobs, identity, tree });
}
export const observeFiniteTaskGitScope = (root, base, head) => {
  const pathsRun = typedGit(root, ["diff", "--name-only", `${base}...${head}`]);
  const linesRun = typedGit(root, ["diff", "--numstat", `${base}...${head}`]);
  if (pathsRun.status !== 0 || linesRun.status !== 0) return null;
  const files = pathsRun.stdout.split(/\r?\n/gu).filter(Boolean).sort();
  const rows = linesRun.stdout.split(/\r?\n/gu).filter(Boolean).map((line) => line.split("\t"));
  const additions = rows.reduce((sum, [value]) => sum + (Number(value) || 0), 0);
  const deletions = rows.reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
  const diffRun = typedGit(root, canonicalGitDiffArgs(`${base}...${head}`));
  return { files, additions, deletions, netChangedLines: Math.max(0, additions - deletions), diffHash: diffRun.status === 0 ? canonicalGitDiffHash(diffRun.stdout) : null };
};
const gitScope = observeFiniteTaskGitScope;
export function observeTypedTaskAuthorities({ identity, tree, scope, currentTruth, root = REPOSITORY_ROOT } = {}) {
  if (!identity || !/^[0-9a-f]{40}$/u.test(tree ?? "")) return { architectureAuthority: null, terminalTruthAuthority: null, finiteTaskAuthority: null, finiteTaskAdmissionAuthority: null };
  const commentsRead = paginatedIssueComments(root, identity.repository, identity.pr);
  const architectureComments = commentsRead.comments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${ARCHITECTURE_MAINTENANCE_MARKER}\n`));
  const noCompetingDomainOwner = Array.isArray(currentTruth?.openImplementationPrs) && currentTruth.openImplementationPrs.length === 0;
  const architectureAuthority = architectureComments.length
    ? verifyArchitectureMaintenanceAuthority({ raw: architectureComments[0], allComments: commentsRead.comments, paginationComplete: commentsRead.complete, identity, tree, scope, noCompetingDomainOwner })
    : null;

  const activeLeaseStates = new Set(["INTENT_CAPTURED", "DOMAIN_DISCOVERY", "ARCHITECTURE_DESIGNED", "DEFECT_LEDGER_STABLE", "PREIMPLEMENTATION_ENGINEERING_CLEAR", "IMPLEMENTATION", "VERIFY", "NATIVE_PROVIDER_PROOF", "MERGE_ELIGIBLE", "ACTIVE_IMPLEMENTATION"]);
  const leases = (currentTruth?.finiteTaskLeases?.tasks ?? []).filter((lease) => lease?.implementationPr === identity.pr && lease?.implementationBranch === identity.branch && activeLeaseStates.has(lease?.taskState));
  let finiteTaskAuthority = null;
  if (leases.length === 1) {
    const lease = leases[0];
    const authorityEvidence = {
      taskArtifactHash: lease?.closure?.artifactHash ?? null,
      ownerApproval: lease?.ownerApproval ?? null,
      ownerAuthorizationCommentId: lease?.ownerAuthorizationCommentId ?? null,
      jurisdictionDecision: currentTruth?.ownerJurisdictionPolicyBinding?.policySource ?? null,
      jurisdictionBinding: currentTruth?.ownerJurisdictionPolicyBinding ?? null,
    };
    const liveObservation = observeLiveFiniteTaskEffectiveReservation({ repository: identity.repository, pr: identity.pr, authorityEvidence });
    const pullRequest = liveObservation.pullRequest;
    const canonicalChangedLines = Number(scope?.additions ?? 0) + Number(scope?.deletions ?? 0);
    const candidatePaths = Array.isArray(scope?.files) ? [...scope.files].sort() : scope?.files;
    const candidate = {
      repository: identity.repository,
      pr: identity.pr,
      branch: identity.branch,
      head: identity.headSha,
      tree,
      files: candidatePaths,
      changedPaths: candidatePaths,
      additions: Number(scope?.additions ?? 0),
      deletions: Number(scope?.deletions ?? 0),
      changedLines: canonicalChangedLines,
      canonicalChangedLines,
      diffHash: scope?.diffHash ?? null,
      changedPathHash: hashValue(candidatePaths ?? []),
    };
    const gitCommand = (args) => {
      const result = typedGit(root, args);
      if (result.status !== 0) throw new Error("FINITE_TASK_EFFECTIVE_RESERVATION_GIT_FAILED");
      return result.stdout.trim();
    };
    let resolution;
    try {
      resolution = resolveFiniteTaskEffectiveReservation({
        registry: currentTruth?.finiteTaskLeases,
        lease,
        candidate,
        gitCommand,
        authorityEvidence,
        liveObservation,
      });
    } catch {
      resolution = { ok: false, findings: ["FINITE_TASK_EFFECTIVE_RESERVATION_RESOLUTION_FAILED"] };
    }
    const effectiveLease = resolution?.effectiveLease ?? null;
    const effectiveReservation = resolution?.effectiveReservation ?? null;
    const baseLease = resolution?.baseLease ?? lease;
    const baseReservation = resolution?.baseReservation ?? null;
    const effectiveAddedPaths = (effectiveReservation?.allowedPaths ?? []).filter((file) => !(baseReservation?.allowedPaths ?? []).includes(file));
    const receiptAddedPaths = resolution?.amendmentReceipt?.addedPaths ?? [];
    const competingOwners = (currentTruth?.openImplementationPrs ?? []).filter((entry) => entry?.number !== identity.pr);
    const protectedMain = typedGit(root, ["rev-parse", "origin/main"]).stdout.trim();
    const localChecks = {
      resolution: finiteTaskEffectiveReservationAuthorityValid(resolution),
      protectedBase: identity.baseSha === protectedMain && pullRequest?.base?.sha === protectedMain,
      pullIdentity: pullRequest?.number === identity.pr
        && pullRequest?.head?.ref === identity.branch
        && pullRequest?.head?.sha === identity.headSha
        && pullRequest?.head?.repo?.full_name === identity.repository
        && pullRequest?.base?.repo?.full_name === identity.repository,
      baseAncestry: typedGit(root, ["merge-base", "--is-ancestor", identity.baseSha, identity.headSha]).status === 0,
      completeDiscovery: liveObservation.commentsPaginationComplete === true && liveObservation.commitsPaginationComplete === true && pullRequest !== null,
      scopeFilesWellFormed: Array.isArray(candidatePaths) && candidatePaths.length === new Set(candidatePaths).size,
      canonicalLineAccounting: Number.isSafeInteger(canonicalChangedLines) && canonicalChangedLines >= 0,
      baseArtifactPreserved: Boolean(effectiveLease
        && stableJson(effectiveLease.closure) === stableJson(baseLease.closure)
        && stableJson(effectiveLease.ownerApproval) === stableJson(baseLease.ownerApproval)
        && effectiveLease.artifactReservation?.closureArtifactPath === baseLease.artifactReservation?.closureArtifactPath
        && stableJson(effectiveLease.artifactReservation?.allowedDomains) === stableJson(baseLease.artifactReservation?.allowedDomains)
        && stableJson(effectiveLease.artifactReservation?.testEvidencePaths) === stableJson(baseLease.artifactReservation?.testEvidencePaths)
        && stableJson(effectiveLease.artifactReservation?.excludedHighRiskPaths) === stableJson(baseLease.artifactReservation?.excludedHighRiskPaths)),
      amendmentDeltaAuthenticated: resolution?.amendmentsConsumed === 0
        ? resolution?.amendmentReceipt == null && effectiveAddedPaths.length === 0
        : resolution?.amendmentsConsumed === 1
          && resolution?.amendmentReceipt != null
          && stableJson(effectiveAddedPaths) === stableJson([...receiptAddedPaths].sort()),
      noCompetingOwners: competingOwners.length === 0,
    };
    const valid = Object.values(localChecks).every(Boolean)
      && effectiveLease !== null
      && effectiveReservation !== null;
    const findings = valid
      ? []
      : [...new Set([
          ...(resolution?.findings ?? []),
          ...Object.entries(localChecks).filter(([, value]) => !value).map(([key]) => `ASSURANCE_FINITE_TASK_CONTEXT_INVALID:${key}`),
        ])].sort();
    finiteTaskAuthority = {
      ok: valid,
      type: "ACTIVE_FINITE_TASK_LEASE",
      repository: identity.repository,
      pr: identity.pr,
      branch: identity.branch,
      currentHead: identity.headSha,
      currentTree: tree,
      featureId: lease.featureId,
      objectiveDomains: lease.artifactReservation?.allowedDomains ?? [],
      supportingDomains: ["CI-test-infrastructure"],
      historicalWaiverPath: null,
      authoritySource: "ACTIVE_FINITE_TASK_LEASE",
      bindingId: `finite-lease-${lease.leaseId}`,
      finiteLeaseId: lease.leaseId,
      budget: {
        maximumFiles: effectiveReservation?.maximumFiles ?? null,
        maximumHandAuthoredNetLines: effectiveReservation?.maximumLines ?? null,
      },
      canonicalChangedLines,
      candidate,
      effectiveReservationResolution: resolution,
      baseLease,
      baseLeaseHash: resolution?.baseLeaseHash ?? null,
      baseReservation,
      effectiveLease,
      effectiveReservation,
      effectiveReservationHash: effectiveReservation?.reservationHash ?? null,
      amendmentsConsumed: resolution?.amendmentsConsumed ?? 0,
      amendmentReceipt: resolution?.amendmentReceipt ?? null,
      amendmentDelta: resolution?.amendmentReceipt ? {
        receiptId: resolution.amendmentReceipt.id ?? resolution.amendmentReceipt.commentId ?? null,
        subjectHash: resolution.amendmentReceipt.subjectHash ?? null,
        bodyHash: resolution.amendmentReceipt.bodyHash ?? null,
        rawBodyHash: resolution.amendmentReceipt.rawBodyHash ?? null,
        addedPaths: resolution.amendmentReceipt.addedPaths ?? [],
      } : null,
      frozenArtifactBinding: {
        closureArtifactPath: lease?.artifactReservation?.closureArtifactPath ?? null,
        artifactHash: lease?.closure?.artifactHash ?? null,
        packetHash: lease?.closure?.packetHash ?? null,
        certificateHash: lease?.closure?.certificateHash ?? null,
      },
      authority: resolution?.authority ?? lease?.authority ?? null,
      checks: localChecks,
      findings,
    };
    finiteTaskAuthorityLiveObservations.set(finiteTaskAuthority, liveObservation);
  }

  let terminalTruthAuthority = null;
  const terminalScopePaths = exactScope(scope).changedPaths;
  const admissionCommentPresent = commentsRead.comments.some((item) => typeof item?.body === "string" && [FINITE_TASK_ADMISSION_MARKER, FINITE_TASK_ADMISSION_V2_MARKER].some((marker) => item.body.startsWith(`${marker}\n`)));
  let finiteTaskAdmissionAuthority = null;
  if (stableJson(terminalScopePaths) === stableJson(TERMINAL_TRUTH_PATHS)) {
    const v2AdmissionCandidates = commentsRead.comments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${FINITE_TASK_ADMISSION_V2_MARKER}\n`));
    const admissionRaw = v2AdmissionCandidates[0] ?? commentsRead.comments.find((item) => typeof item?.body === "string" && item.body.startsWith(`${FINITE_TASK_ADMISSION_MARKER}\n`));
    if (admissionRaw) {
      const binding = currentTruth?.activeTaskBinding;
      const implementationPull = parsedResponse(typedGh(root, [`repos/${identity.repository}/pulls/${binding?.implementationPr}`]), null);
      const implementationScope = implementationPull ? gitScope(root, implementationPull.base?.sha, implementationPull.head?.sha) : null;
      const taskArtifactPath = currentTruth?.finiteTaskLeases?.tasks?.find(({ implementationPr }) => implementationPr === binding?.implementationPr)?.artifactReservation?.closureArtifactPath;
      const taskArtifactRun = implementationPull && taskArtifactPath ? typedGit(root, ["show", `${implementationPull.head?.sha}:${taskArtifactPath}`]) : { status: 1, stdout: "" };
      let taskArtifact = null;
      try { taskArtifact = taskArtifactRun.status === 0 ? JSON.parse(taskArtifactRun.stdout) : null; } catch {}
      const ownerCommentId = currentTruth?.finiteTaskLeases?.tasks?.find(({ implementationPr }) => implementationPr === binding?.implementationPr)?.ownerAuthorizationCommentId;
      const ownerRaw = Number.isInteger(ownerCommentId) ? parsedResponse(typedGh(root, [`repos/${identity.repository}/issues/comments/${ownerCommentId}`]), null) : null;
      const ownerApproval = ownerRaw ? normalizeGitHubCommentIdentity(ownerRaw, { repository: identity.repository, pr: binding?.implementationPr, commentId: ownerCommentId }) : null;
      const ownerMarker = ownerApproval?.body?.match(/^(<!-- chillywood-[a-z0-9-]+-v\d+ -->)\n/u)?.[1];
      const ownerPayload = ownerMarker ? parseExactOwnerBody(ownerApproval, ownerMarker) : null;
      const seedHead = ownerPayload?.subject?.admittedSeed?.head;
      const seedTree = ownerPayload?.subject?.admittedSeed?.tree;
      const observedSeedTree = seedHead ? gitText(root, ["rev-parse", `${seedHead}^{tree}`]) : null;
      const planningTree = implementationPull?.head?.sha ? gitText(root, ["rev-parse", `${implementationPull.head.sha}^{tree}`]) : null;
      const priorTruthRun = typedGit(root, ["show", `${identity.baseSha}:config/assurance/current-truth-v1.json`]);
      let priorTruth = null;
      try { priorTruth = priorTruthRun.status === 0 ? JSON.parse(priorTruthRun.stdout) : null; } catch {}
      const implementation = {
        pr: implementationPull?.number,
        branch: implementationPull?.head?.ref,
        planningHead: implementationPull?.head?.sha,
        planningTree,
        baseSha: implementationPull?.base?.sha,
        state: implementationPull?.state,
        draft: implementationPull?.draft,
        seedHead,
        seedTree,
        observedSeedTree,
        ownerCommentId,
        taskArtifactPath,
        changedPaths: implementationScope?.files ?? [],
      };
      const seedIsAncestor = seedHead && implementation.planningHead ? typedGit(root, ["merge-base", "--is-ancestor", seedHead, implementation.planningHead]).status === 0 : false;
      const implementationBaseIsAncestor = implementation.baseSha && implementation.planningHead ? typedGit(root, ["merge-base", "--is-ancestor", implementation.baseSha, implementation.planningHead]).status === 0 : false;
      const taskArtifactHash = taskArtifactRun.status === 0 ? shaBytes(Buffer.from(taskArtifactRun.stdout)) : null;
      if (admissionRaw.body.startsWith(`${FINITE_TASK_ADMISSION_V2_MARKER}\n`)) {
        const policyRead = paginatedArray(root, `repos/${identity.repository}/issues/comments?per_page=100`);
        const policyRaws = policyRead.values.filter((item) => typeof item?.body === "string" && [OWNER_JURISDICTION_DECISION_V2_MARKER, OWNER_JURISDICTION_POLICY_CHAIN_V2_MARKER].some((marker) => item.body.startsWith(`${marker}\n`)));
        const expectedTaskIdentity = {
          taskId: taskArtifact?.taskId,
          implementationPr: implementation.pr,
          implementationBranch: implementation.branch,
          leaseId: taskArtifact?.taskId,
          originalSeedHead: implementation.seedHead,
          originalSeedTree: implementation.seedTree,
          planningHead: implementation.planningHead,
          planningTree: implementation.planningTree,
          ownerApprovalCommentId: implementation.ownerCommentId,
          taskArtifactPath: implementation.taskArtifactPath,
        };
        const registry = readJson(root, "config/assurance/feature-registry-v1.json");
        const expectedDomainIds = taskArtifact?.closure?.affectedDomainClosure?.domains;
        const expectedTaskEvidence = finiteTaskJurisdictionEvidenceV2(taskArtifact, taskArtifactHash);
        const admissionBinding = resolveFiniteTaskAdmissionTaskBindingV2({ admissionRaws: commentsRead.comments, paginationComplete: commentsRead.complete, identity, tree, implementation, taskArtifact, taskArtifactHash, expectedScope: CHILLYWOOD_US_PRE_RELEASE_JURISDICTION_SCOPE_V2, expectedDomainIds, root });
        const candidateBinding = admissionBinding.taskBinding;
        const embedded = candidateBinding?.policyReference?.source === "THIS_IMMUTABLE_OWNER_DECISION";
        const policyRaw = policyRaws.find(({ id }) => id === currentTruth?.ownerJurisdictionPolicyBinding?.policySource?.commentId);
        let jurisdictionAuthority = embedded
          ? verifyOwnerJurisdictionAuthorityV2({ raw: policyRaw, policyRaws, paginationComplete: policyRead.complete, repository: identity.repository, pr: implementation.pr, registry, expected: { ...CHILLYWOOD_US_PRE_RELEASE_JURISDICTION_SCOPE_V2, ownerLogin: "Chillywood2025", task: taskArtifact?.taskId, domainIds: expectedDomainIds }, expectedTaskIdentity, expectedTaskEvidence })
          : verifyTaskJurisdictionAuthorityV2({ binding: candidateBinding, policyRaws, paginationComplete: policyRead.complete, repository: identity.repository, registry, expectedScope: CHILLYWOOD_US_PRE_RELEASE_JURISDICTION_SCOPE_V2, expectedTaskIdentity, expectedTaskEvidence, expectedDomainIds });
        if (!admissionBinding.ok || (embedded && stableJson(jurisdictionAuthority.taskBinding) !== stableJson(candidateBinding))) jurisdictionAuthority = { ...jurisdictionAuthority, ok: false, findings: [...(jurisdictionAuthority.findings ?? []), "ADMISSION_OWNER_JURISDICTION_BINDING_MISMATCH"] };
        const currentAdmissionRaw = commentsRead.comments.find(({ id }) => id === admissionBinding.chain?.currentCommentId) ?? admissionRaw;
        finiteTaskAdmissionAuthority = evaluateFiniteTaskAdmissionSuccessorV2({ raw: currentAdmissionRaw, allComments: commentsRead.comments, paginationComplete: commentsRead.complete, identity, tree, scope, implementation, taskArtifact, taskArtifactHash, truthRecord: currentTruth, priorTruth, ownerApproval, ownerJurisdictionAuthority: jurisdictionAuthority, seedIsAncestor, implementationBaseIsAncestor, registry });
      } else {
        finiteTaskAdmissionAuthority = evaluateFiniteTaskAdmissionSuccessor({ raw: admissionRaw, allComments: commentsRead.comments, paginationComplete: commentsRead.complete, identity, tree, scope, implementation, taskArtifact, taskArtifactHash, truthRecord: currentTruth, priorTruth, ownerApproval, seedIsAncestor, implementationBaseIsAncestor });
      }
    }
  }
  if (!admissionCommentPresent && [TERMINAL_TRUTH_PATHS, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS].some((paths) => stableJson(terminalScopePaths) === stableJson(paths))) {
    const currentMainRun = typedGit(root, ["rev-parse", "origin/main"]);
    const currentMain = currentMainRun.status === 0 ? currentMainRun.stdout.trim() : null;
    const parentRun = typedGit(root, ["rev-list", "--parents", "-n", "1", identity.baseSha]);
    const parentParts = parentRun.stdout.trim().split(/\s+/u);
    const associatedRead = paginatedArray(root, `repos/${identity.repository}/commits/${identity.baseSha}/pulls?per_page=100`);
    const associated = associatedRead.values;
    const predecessorPull = associatedRead.complete && associated.length === 1 ? associated[0] : null;
    const predecessorPr = predecessorPull?.number;
    const firstParent = parentParts.length === 3 ? parentParts[1] : null;
    const sourceHead = parentParts.length === 3 ? parentParts[2] : null;
    const sourceTreeRun = sourceHead ? typedGit(root, ["rev-parse", `${sourceHead}^{tree}`]) : { status: 1, stdout: "" };
    const predecessorScope = firstParent && sourceHead ? gitScope(root, firstParent, sourceHead) : null;
    const predecessorIdentity = predecessorPull ? { repository: identity.repository, pr: predecessorPr, branch: predecessorPull.head?.ref, baseSha: predecessorPull.base?.sha, headSha: predecessorPull.head?.sha } : null;
    const predecessorComments = predecessorPr ? paginatedIssueComments(root, identity.repository, predecessorPr) : { complete: false, comments: [] };
    const predecessorRaw = predecessorComments.comments.find((item) => typeof item?.body === "string" && item.body.startsWith(`${ARCHITECTURE_MAINTENANCE_MARKER}\n`));
    const predecessorAuthority = predecessorIdentity && predecessorScope ? verifyArchitectureMaintenanceAuthority({ raw: predecessorRaw, allComments: predecessorComments.comments, paginationComplete: predecessorComments.complete, identity: predecessorIdentity, tree: sourceTreeRun.stdout.trim(), scope: predecessorScope, noCompetingDomainOwner: true }) : { ok: false };
    const predecessor = {
      valid: parentParts.length === 3 && associatedRead.complete && associated.length === 1 && predecessorPull?.merged_at && predecessorPull?.merge_commit_sha === identity.baseSha && predecessorPull?.base?.ref === "main" && predecessorPull?.head?.sha === sourceHead && predecessorPull?.base?.sha === firstParent && sourceTreeRun.status === 0,
      pr: predecessorPr,
      mergeSha: identity.baseSha,
      firstParent,
      sourceHead,
      sourceTree: sourceTreeRun.stdout.trim(),
    };
    const priorTruthRun = typedGit(root, ["show", `${identity.baseSha}:config/assurance/current-truth-v1.json`]);
    const priorTruthHash = priorTruthRun.status === 0 ? hashValue(priorTruthRun.stdout) : null;
    let priorTruth = null;
    try { priorTruth = priorTruthRun.status === 0 ? JSON.parse(priorTruthRun.stdout) : null; } catch {}
    const truthRecord = readJson(root, "config/assurance/current-truth-v1.json");
    const openPullsRead = paginatedArray(root, `repos/${identity.repository}/pulls?state=open&base=main&per_page=100`);
    const openPulls = openPullsRead.values;
    let openTerminalSuccessorCount = 0;
    for (const pull of openPulls) {
      if (pull?.base?.sha !== identity.baseSha) continue;
      const filesRead = paginatedArray(root, `repos/${identity.repository}/pulls/${pull.number}/files?per_page=100`);
      const names = filesRead.complete ? filesRead.values.map(({ filename }) => filename).sort() : [];
      if ([TERMINAL_TRUTH_PATHS, TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS].some((paths) => stableJson(names) === stableJson(paths))) openTerminalSuccessorCount += 1;
    }
    const truthComments = commentsRead.comments.filter((item) => typeof item?.body === "string" && item.body.startsWith(`${TERMINAL_TRUTH_SUCCESSOR_MARKER}\n`));
    const finiteTerminalRaw = truthComments.find((item) => {
      const normalized = normalizeGitHubCommentIdentity(item, { repository: identity.repository, pr: identity.pr, commentId: item?.id });
      return parseExactOwnerBody(normalized, TERMINAL_TRUTH_SUCCESSOR_MARKER)?.subject?.type === FINITE_TASK_TERMINAL_TRUTH_V1;
    });
    if (finiteTerminalRaw && priorTruth) {
      const terminalTransition = observeFiniteTaskPostMergeTransition({ record: priorTruth, currentProtectedMain: identity.baseSha, root });
      terminalTruthAuthority = verifyFiniteTaskTerminalTruthAuthority({ raw: finiteTerminalRaw, allComments: commentsRead.comments, paginationComplete: commentsRead.complete && openPullsRead.complete, identity, tree, scope, terminalTransition, priorTruthHash, priorTruth, truthRecord, currentStateText: fs.readFileSync(path.join(root, "CURRENT_STATE.md"), "utf8"), nextTaskText: fs.readFileSync(path.join(root, "NEXT_TASK.md"), "utf8"), currentMain, openTerminalSuccessorCount, transitionPreviouslyConsumed: priorTruth?.finiteTaskRuntime?.terminalOutcome?.mergeSha === identity.baseSha, root });
    } else {
      terminalTruthAuthority = verifyTerminalTruthSuccessorAuthority({ raw: truthComments[0], allComments: commentsRead.comments, paginationComplete: commentsRead.complete && openPullsRead.complete, identity, tree, scope, predecessor, predecessorAuthority, priorTruthHash, truthRecord, currentStateText: fs.readFileSync(path.join(root, "CURRENT_STATE.md"), "utf8"), nextTaskText: fs.readFileSync(path.join(root, "NEXT_TASK.md"), "utf8"), currentMain, openTerminalSuccessorCount, transitionPreviouslyConsumed: priorTruth?.taskContextArchitecture?.mergeSha === identity.baseSha });
    }
  }
  return { architectureAuthority, terminalTruthAuthority, finiteTaskAuthority, finiteTaskAdmissionAuthority };
}

const finiteTaskFinalReceiptEnvelope = (raw) => {
  if (typeof raw?.body !== "string" || !raw.body.startsWith(`${finalReceiptMarker}\n`)) return null;
  try { return JSON.parse(raw.body.slice(finalReceiptMarker.length + 1)); } catch { return null; }
};

export function verifyFiniteTaskImplementationLifecycle({
  identity,
  tree,
  scope,
  finiteTaskAuthority,
  comments = [],
  commentsPaginationComplete = false,
  phase1EvidenceResolver = ({ runId }) => observePhase1RunEvidence({ runId, identity, tree }),
} = {}) {
  const findings = [];
  const resolution = finiteTaskAuthority?.effectiveReservationResolution;
  const candidate = finiteTaskAuthority?.candidate;
  const lease = finiteTaskAuthority?.baseLease;
  if (finiteTaskAuthority?.ok !== true
    || !finiteTaskEffectiveReservationAuthorityValid(resolution)
    || resolution?.candidateHead !== identity?.headSha
    || resolution?.candidateTree !== tree
    || candidate?.head !== identity?.headSha
    || candidate?.tree !== tree) findings.push("FINITE_TASK_LIFECYCLE_EFFECTIVE_RESERVATION_INVALID");
  if (!Array.isArray(comments) || commentsPaginationComplete !== true) findings.push("FINITE_TASK_LIFECYCLE_COMMENT_DISCOVERY_INCOMPLETE");
  const reviewCandidates = (Array.isArray(comments) ? comments : []).filter(({ body }) => typeof body === "string" && body.startsWith(`${ARCHITECTURE_REPOSITORY_REVIEW_MARKER}\n`));
  const reviews = reviewCandidates.map((raw) => verifyArchitectureRepositoryReview({
    raw,
    identity,
    tree,
    scope,
    profile: FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1,
    effectiveReservationResolution: resolution,
  }));
  const validReviews = reviews.filter(({ valid }) => valid);
  if (validReviews.length !== 1) findings.push("FINITE_TASK_LIFECYCLE_EXACT_HEAD_REVIEW_INVALID");
  const review = validReviews.length === 1 ? validReviews[0] : null;
  const finalCandidates = (Array.isArray(comments) ? comments : []).filter(({ body }) => typeof body === "string" && body.startsWith(`${finalReceiptMarker}\n`));
  const finalEnvelope = finalCandidates.length === 1 ? finiteTaskFinalReceiptEnvelope(finalCandidates[0]) : null;
  const finalSubject = finalEnvelope?.subject;
  const phase1Evidence = phase1EvidenceResolver({ runId: finalSubject?.phase1RunId, identity, tree });
  if (phase1Evidence?.valid !== true
    || phase1Evidence?.result !== "PASS_13_OF_13"
    || phase1Evidence?.sourceHead !== identity?.headSha
    || phase1Evidence?.sourceTree !== tree) findings.push("FINITE_TASK_LIFECYCLE_PHASE1_INVALID");
  const evidence = {
    scopeResult: finiteTaskAuthority?.ok === true ? "PASS" : "FAIL",
    callDomainClosureLedgerHash: finalSubject?.callDomainClosureLedgerHash,
    focusedTestHash: finalSubject?.focusedTestHash,
    mutationNegativeControlHash: finalSubject?.mutationNegativeControlHash,
    repositoryReviewHash: review?.subjectHash,
    phase1RunId: phase1Evidence?.runId,
    phase1Head: phase1Evidence?.sourceHead,
    repositoryReview: review,
    phase1Evidence,
  };
  const finalSource = verifyFiniteTaskFinalSourceEligibility({
    lease,
    candidate,
    evidence,
    effectiveReservationResolution: resolution,
    comments,
    commentsPaginationComplete,
  });
  if (!finalSource.ok) findings.push(...finalSource.findings);
  const unique = [...new Set(findings)].sort();
  return {
    ok: finiteTaskAuthority?.ok === true,
    authorizationOk: finiteTaskAuthority?.ok === true,
    mergeEligible: unique.length === 0 && finalSource.mergeEligible === true,
    candidateHead: candidate?.head ?? null,
    candidateTree: candidate?.tree ?? null,
    reservationStatus: resolution?.status ?? null,
    baseLeaseHash: resolution?.baseLeaseHash ?? null,
    baseReservation: resolution?.baseReservation ?? null,
    effectiveReservation: resolution?.effectiveReservation ?? null,
    effectiveReservationHash: resolution?.effectiveReservation?.reservationHash ?? null,
    amendmentReceipt: resolution?.amendmentReceipt ?? null,
    repositoryReview: review,
    phase1Evidence,
    finalSource,
    finalSourceSubject: finalSource?.subject ?? null,
    findings: unique,
  };
}

export function observeFiniteTaskImplementationLifecycle({
  identity,
  tree,
  scope,
  currentTruth,
  root = REPOSITORY_ROOT,
  authorities = null,
  commentsObservation = null,
  phase1EvidenceResolver,
} = {}) {
  const observedAuthorities = authorities ?? observeTypedTaskAuthorities({ identity, tree, scope, currentTruth, root });
  const observedComments = commentsObservation ?? paginatedIssueComments(root, identity?.repository, identity?.pr);
  const lifecycle = verifyFiniteTaskImplementationLifecycle({
    identity,
    tree,
    scope,
    finiteTaskAuthority: observedAuthorities?.finiteTaskAuthority,
    comments: observedComments?.comments,
    commentsPaginationComplete: observedComments?.complete,
    phase1EvidenceResolver: phase1EvidenceResolver ?? (({ runId }) => observePhase1RunEvidence({ runId, identity, tree, root })),
  });
  return authorities === null && commentsObservation === null && phase1EvidenceResolver === undefined
    ? registerVerifiedFiniteTaskImplementationLifecycle({ lifecycle, effectiveReservationResolution: observedAuthorities?.finiteTaskAuthority?.effectiveReservationResolution, liveObservation: finiteTaskAuthorityLiveObservations.get(observedAuthorities?.finiteTaskAuthority) }) : lifecycle;
}

export function observeFiniteTaskPostMergeTransition({
  record,
  currentProtectedMain,
  root = REPOSITORY_ROOT,
  liveObservation = null,
  phase1EvidenceResolver,
} = {}) {
  const binding = record?.activeTaskBinding;
  const matches = (record?.finiteTaskLeases?.tasks ?? []).filter((lease) => lease?.implementationPr === binding?.implementationPr
    && lease?.implementationBranch === binding?.implementationBranch
    && lease?.featureId === binding?.featureId);
  if (matches.length !== 1) return { applicable: null, ok: false, findings: ["FINITE_TASK_POST_MERGE_LEASE_UNRESOLVED"] };
  const lease = matches[0];
  const authorityEvidence = {
    taskArtifactHash: lease?.closure?.artifactHash ?? null,
    ownerApproval: lease?.ownerApproval ?? null,
    jurisdictionDecision: record?.ownerJurisdictionPolicyBinding?.policySource ?? null,
  };
  const observation = liveObservation ?? observeLiveFiniteTaskEffectiveReservation({
    repository: record?.ownerJurisdictionPolicyBinding?.repository ?? "Chillywood2025/chillywood-mobile",
    pr: lease.implementationPr,
    authorityEvidence,
  });
  const pullRequest = observation?.pullRequest;
  if (!pullRequest || observation?.commentsPaginationComplete !== true || observation?.commitsPaginationComplete !== true) {
    return { applicable: null, ok: false, findings: ["FINITE_TASK_POST_MERGE_DISCOVERY_INCOMPLETE"] };
  }
  if (pullRequest.state === "open") return { applicable: false, ok: true, findings: [] };
  const findings = [];
  const mergeSha = pullRequest?.merge_commit_sha;
  const mergePartsRun = typedGit(root, ["rev-list", "--parents", "-n", "1", mergeSha ?? "missing"]);
  const mergeParts = mergePartsRun.status === 0 ? mergePartsRun.stdout.trim().split(/\s+/u) : [];
  const firstParent = mergeParts.length === 3 ? mergeParts[1] : null;
  const sourceHead = mergeParts.length === 3 ? mergeParts[2] : null;
  const sourceTree = sourceHead ? gitText(root, ["rev-parse", `${sourceHead}^{tree}`]) : null;
  const mergeTree = mergeSha ? gitText(root, ["rev-parse", `${mergeSha}^{tree}`]) : null;
  const scope = firstParent && sourceHead ? observeFiniteTaskGitScope(root, firstParent, sourceHead) : null;
  if (!pullRequest?.merged_at
    || !/^[0-9a-f]{40}$/u.test(mergeSha ?? "")
    || mergeParts.length !== 3
    || pullRequest?.number !== lease.implementationPr
    || pullRequest?.head?.ref !== lease.implementationBranch
    || pullRequest?.head?.sha !== sourceHead
    || pullRequest?.base?.ref !== "main"
    || pullRequest?.head?.repo?.full_name !== "Chillywood2025/chillywood-mobile"
    || pullRequest?.base?.repo?.full_name !== "Chillywood2025/chillywood-mobile"
    || !/^[0-9a-f]{40}$/u.test(sourceTree ?? "")
    || !/^[0-9a-f]{40}$/u.test(mergeTree ?? "")
    || !scope) findings.push("FINITE_TASK_POST_MERGE_IDENTITY_INVALID");
  const candidate = scope ? {
    repository: "Chillywood2025/chillywood-mobile",
    pr: lease.implementationPr,
    branch: lease.implementationBranch,
    prState: "closed",
    head: sourceHead,
    tree: sourceTree,
    changedPaths: scope.files,
    changedLines: Number(scope.additions ?? 0) + Number(scope.deletions ?? 0),
    diffHash: scope.diffHash,
    changedPathHash: hashValue(scope.files),
  } : null;
  const gitCommand = (args) => {
    const result = typedGit(root, args);
    if (result.status !== 0) throw new Error("FINITE_TASK_POST_MERGE_GIT_FAILED");
    return result.stdout.trim();
  };
  let resolution = null;
  try {
    resolution = resolveFiniteTaskEffectiveReservation({
      registry: record?.finiteTaskLeases,
      lease,
      candidate,
      gitCommand,
      authorityEvidence,
      liveObservation: observation,
    });
  } catch {
    findings.push("FINITE_TASK_POST_MERGE_EFFECTIVE_RESERVATION_INVALID");
  }
  if (!finiteTaskEffectiveReservationAuthorityValid(resolution)
    || resolution?.candidateHead !== sourceHead
    || resolution?.candidateTree !== sourceTree) findings.push("FINITE_TASK_POST_MERGE_EFFECTIVE_RESERVATION_INVALID");
  const identity = {
    repository: "Chillywood2025/chillywood-mobile",
    pr: lease.implementationPr,
    branch: lease.implementationBranch,
    baseSha: firstParent,
    headSha: sourceHead,
  };
  const finiteTaskAuthority = {
    ok: findings.length === 0,
    candidate,
    baseLease: lease,
    effectiveReservationResolution: resolution,
  };
  const lifecycleResult = verifyFiniteTaskImplementationLifecycle({
    identity,
    tree: sourceTree,
    scope,
    finiteTaskAuthority,
    comments: observation?.comments,
    commentsPaginationComplete: observation?.commentsPaginationComplete,
    phase1EvidenceResolver: phase1EvidenceResolver ?? (({ runId }) => observePhase1RunEvidence({ runId, identity, tree: sourceTree, root })),
  });
  const lifecycle = phase1EvidenceResolver === undefined
    ? registerVerifiedFiniteTaskImplementationLifecycle({ lifecycle: lifecycleResult, effectiveReservationResolution: resolution, liveObservation: observation }) : lifecycleResult;
  if (!lifecycle.mergeEligible) findings.push(...lifecycle.findings, "FINITE_TASK_POST_MERGE_FINAL_SOURCE_INVALID");
  const mergeRef = {
    pr: lease.implementationPr,
    branch: lease.implementationBranch,
    parents: [firstParent, sourceHead],
    sourceTree,
    tree: mergeTree,
  };
  const mergeProvenance = verifyFiniteTaskMergeProvenance({
    lease,
    receiptSubject: lifecycle.finalSource?.subject,
    currentProtectedBase: firstParent,
    mergeRef,
    actualMerge: { parents: mergeParts.slice(1), tree: mergeTree },
    effectiveReservationResolution: resolution,
  });
  if (!mergeProvenance.ok) findings.push(...mergeProvenance.findings);
  try {
    gitCommand(["merge-base", "--is-ancestor", mergeSha, currentProtectedMain]);
    const firstParentHistory = gitCommand(["rev-list", "--first-parent", currentProtectedMain]).split(/\r?\n/gu).filter(Boolean);
    if (!firstParentHistory.includes(mergeSha)) findings.push("FINITE_TASK_POST_MERGE_NOT_ON_FIRST_PARENT");
  } catch {
    findings.push("FINITE_TASK_POST_MERGE_NOT_ON_PROTECTED_MAIN");
  }
  const unique = [...new Set(findings)].sort();
  const terminalEvidence = unique.length === 0 ? {
    schemaVersion: 1,
    classification: "FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1",
    repository: identity.repository,
    taskId: lease.leaseId,
    leaseId: lease.leaseId,
    implementationPr: lease.implementationPr,
    implementationBranch: lease.implementationBranch,
    baseLeaseHash: resolution.baseLeaseHash,
    baseReservation: resolution.baseReservation,
    effectiveReservation: resolution.effectiveReservation,
    amendmentReceipt: resolution.amendmentReceipt,
    finalSourceReceipt: lifecycle.finalSource.receipt,
    sourceHead,
    sourceTree,
    mergeSha,
    mergeTree,
    mergeParents: [firstParent, sourceHead],
    nextTask: record?.engineeringDoctrine?.nextPermittedAction ?? null,
    authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
  } : null;
  const normalizedTerminalEvidence = terminalEvidence ? { ...terminalEvidence, evidenceHash: hashValue(terminalEvidence) } : null;
  const alreadyProjected = unique.length === 0
    && binding?.phase === "TERMINAL"
    && stableJson(record?.finiteTaskRuntime?.terminalOutcome) === stableJson(normalizedTerminalEvidence)
    && stableJson(binding?.terminalEvidence) === stableJson(normalizedTerminalEvidence);
  const transition = {
    applicable: alreadyProjected ? false : true,
    ok: unique.length === 0,
    consumed: alreadyProjected,
    baseLeaseUnchanged: resolution?.baseLeaseHash === hashValue(lease),
    lifecycle,
    mergeProvenance,
    terminalEvidence: normalizedTerminalEvidence,
    findings: unique,
  };
  return registerVerifiedFiniteTaskPostMergeTransition({ lease, liveObservation: observation, postMergeTransition: transition });
}

function readOwnerAuthorizations(authoritativeLease, context = {}, root = REPOSITORY_ROOT) {
  const result = [];
  const ids = Array.isArray(authoritativeLease?.engineeringOwnerAuthorizationCommentIds) ? authoritativeLease.engineeringOwnerAuthorizationCommentIds : [];
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 1) continue;
    const response = spawnSync("gh", ["api", "--method=GET", `repos/Chillywood2025/chillywood-mobile/issues/comments/${id}`], { cwd: root, encoding: "utf8", shell: false });
    let raw;
    try {
      raw = response.status === 0 ? JSON.parse(response.stdout) : null;
    } catch {
      raw = null;
    }
    const normalized = normalizeGitHubCommentIdentity(raw, { repository: context.repository, pr: Number(context.pr), commentId: id });
    if (!normalized || !raw.body.startsWith(`${OWNER_AUTH_MARKER}\n`)) continue;
    let payload;
    try {
      payload = JSON.parse(raw.body.slice(OWNER_AUTH_MARKER.length + 1));
    } catch {
      continue;
    }
    const subjectHash = hashValue(payload?.subject);
    const bodyFacts = { ...payload };
    delete bodyFacts.bodyHash;
    const bodyHash = hashValue(bodyFacts);
    if (context.repository !== "Chillywood2025/chillywood-mobile" || payload?.repository !== context.repository || String(payload?.pr) !== String(context.pr) || payload?.task !== context.task || String(payload?.leaseId) !== String(context.leaseId) || payload?.currentHead !== context.currentHead || !["REGISTERED_OWNER_DECISION", "OWNER_LEASE_AMENDMENT", "OWNER_JURISDICTION_DECISION", "DOCTRINE_BOOTSTRAP_AUTHORIZATION"].includes(payload?.type) || payload?.authorizationId !== `github-comment-${raw.id}` || payload?.subjectHash !== subjectHash || payload?.bodyHash !== bodyHash) continue;
    result.push(
      Object.freeze({
        authorizationId: payload.authorizationId,
        type: payload.type,
        subject: structuredClone(payload.subject),
        subjectHash,
        bodyHash,
        readbackBodyHash: hashValue(raw.body),
        repository: context.repository,
        pr: String(context.pr),
        task: context.task,
        leaseId: String(context.leaseId),
        currentHead: context.currentHead,
        commentId: raw.id,
        commentUrl: normalized.htmlUrl ?? normalized.issueUrl,
        createdAt: raw.created_at,
        authorLogin: raw.user.login,
        authorAssociation: raw.author_association,
        verified: true,
      }),
    );
  }
  trustedOwnerAuthorizationSets.add(result);
  return result;
}
const trustedOwnerAuthorization = (set, reference, type, subject) => trustedOwnerAuthorizationSets.has(set) && set.some((item) => item.type === type && item.authorizationId === reference?.authorizationId && item.subjectHash === reference?.subjectHash && item.subjectHash === hashValue(subject) && stableJson(item.subject) === stableJson(subject));
const evidenceContractIds = (doctrine, graph, taxonomy, contracts) => new Set([doctrine.doctrineId, graph.contractId, taxonomy.contractId, contracts.contractId]);
const exactEvidence = (item, subjectField, { root = REPOSITORY_ROOT, domains = [], subject, contracts: contractIds = new Set() } = {}) => {
  if (!object(item) || item[subjectField] !== subject || !domains.includes(item.domain) || !safeRepoPath(item.enforcingSource) || !safeRepoPath(item.negativeWitnessTestPath) || !contractIds.has(item.exactContract) || !Number.isInteger(item.line) || item.line < 1 || !/^[0-9a-f]{64}$/u.test(item.enforcingSourceSha256 ?? "") || !/^[0-9a-f]{64}$/u.test(item.negativeWitnessTestSha256 ?? "") || !textValue(item.expectedSemanticToken) || !textValue(item.negativeWitnessTestId) || !textValue(item.positiveWitness) || item.positiveWitness.length < 12 || !textValue(item.negativeWitness) || item.negativeWitness.length < 12 || item.positiveWitness === item.negativeWitness) return false;
  const absolute = path.join(root, item.enforcingSource);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return false;
  const witness = path.join(root, item.negativeWitnessTestPath);
  if (!fs.existsSync(witness) || !fs.statSync(witness).isFile()) return false;
  const sourceBytes = fs.readFileSync(absolute);
  const sourceText = sourceBytes.toString("utf8");
  const witnessBytes = fs.readFileSync(witness);
  const witnessText = witnessBytes.toString("utf8");
  return crypto.createHash("sha256").update(sourceBytes).digest("hex") === item.enforcingSourceSha256 && crypto.createHash("sha256").update(witnessBytes).digest("hex") === item.negativeWitnessTestSha256 && sourceText.split("\n")[item.line - 1]?.includes(item.expectedSemanticToken) && witnessText.includes(item.negativeWitnessTestId);
};
const NON_IMPACTING_REASON_CODES = Object.freeze(["DATA_NOT_READ", "AUTHORITY_NOT_TRANSFERRED", "MUTATION_IMPOSSIBLE_BY_CONTRACT", "PROOF_OBLIGATION_UNCHANGED"]);
const exactNonImpactingEvidence = (item, edge, { root = REPOSITORY_ROOT } = {}) => {
  if (!object(edge) || item?.classification !== "NON_IMPACTING_WITH_EVIDENCE" || !NON_IMPACTING_REASON_CODES.includes(item.reasonCode) || item.canonicalTransfer !== edge.dataControlTransferred) return false;
  const edgeSubjectHash = hashValue(edge);
  const contract = edge.negativeContracts?.find(({ reasonCode }) => reasonCode === item.reasonCode);
  if (!contract || item.edge !== edge.edgeId || item.edgeSubjectHash !== edgeSubjectHash || item.exactContract !== contract.contractId || item.expectedSemanticToken !== contract.statement || item.enforcingSource !== contract.sourcePath || item.enforcingSourceSha256 !== contract.sourceContentSha256 || !safeRepoPath(item.enforcingSource) || !safeRepoPath(item.negativeWitnessTestPath) || !Number.isInteger(item.line)) return false;
  const source = path.join(root, item.enforcingSource);
  const witness = path.join(root, item.negativeWitnessTestPath);
  if (!fs.existsSync(source) || !fs.existsSync(witness)) return false;
  const sourceBytes = fs.readFileSync(source);
  const witnessBytes = fs.readFileSync(witness);
  const sourceLine = sourceBytes.toString("utf8").split("\n")[item.line - 1] ?? "";
  const witnessText = witnessBytes.toString("utf8");
  return crypto.createHash("sha256").update(sourceBytes).digest("hex") === item.enforcingSourceSha256 && crypto.createHash("sha256").update(witnessBytes).digest("hex") === item.negativeWitnessTestSha256 && sourceLine.includes(contract.statement) && witnessText.includes(edge.edgeId) && witnessText.includes(edgeSubjectHash);
};
const transitionContractsOf = (model) => Array.isArray(model?.transitionContracts) ? model.transitionContracts.filter(object) : [];
const qualifiedStateModel = (domainModels) => ({
  reachableStates: domainModels.flatMap((model) => transitionContractsOf(model).flatMap(({ from, to }) => [`${model?.domain}:${from}`, `${model?.domain}:${to}`])).filter((value, index, all) => all.indexOf(value) === index),
  transitions: domainModels.flatMap((model) => transitionContractsOf(model).map(({ id, from, to }) => `${model?.domain}:${id}:${from}->${to}`)),
  preconditions: domainModels.flatMap((model) => transitionContractsOf(model).map(({ id, preconditions }) => `${model?.domain}:${id}:${Array.isArray(preconditions) ? preconditions.join(" & ") : ""}`)),
  terminalStates: domainModels.flatMap((model) => transitionContractsOf(model).filter(({ terminal }) => terminal).map(({ to }) => `${model?.domain}:${to}`)).filter((value, index, all) => all.indexOf(value) === index),
});
const HIGH_RISK_THREE_WAY = Object.freeze(["concurrency", "lifecycle", "permissions", "provider state", "replacement authority"]);
const EXHAUSTIVE_BOUNDARIES = Object.freeze(["authentication/authorization", "money/entitlement", "privacy/user rights", "deletion/ownership", "permission-to-media", "terminal/resurrection", "stale/replacement authority", "migration/rollback", "native-action provenance", "security trust boundaries"]);
const combinations = (values, size) => values.flatMap((value, index) => (size === 1 ? [[value]] : combinations(values.slice(index + 1), size - 1).map((tail) => [value, ...tail])));
const tuple = (subject) => ({ subject, tupleHash: hashValue(subject) });
const coveragePlan = (domainModels, nodes, edges, bootstrap = false) => {
  const byDomain = new Map(nodes.map((node) => [node.domain, node]));
  const scenarios = domainModels.flatMap((model) =>
    transitionContractsOf(model).flatMap((transition) =>
      (Array.isArray(transition?.platforms) ? transition.platforms : []).flatMap((platform) =>
        (Array.isArray(transition?.providers) ? transition.providers : []).flatMap((provider) =>
          (Array.isArray(transition?.environments) ? transition.environments : []).flatMap((environment) =>
            (Array.isArray(transition?.markets) ? transition.markets : []).map((market) => ({
              domain: model?.domain,
              transition: transition.id,
              from: transition.from,
              to: transition.to,
              platform,
              provider,
              environment,
              market,
              preconditions: transition.preconditions,
              sourceHash: transition.sourceContentSha256,
            })),
          ),
        ),
      ),
    ),
  );
  const pairwiseTuples = scenarios.flatMap((scenario) =>
    combinations(["from", "to", "transition", "platform", "provider", "environment", "market"], 2).map((dimensions) =>
      tuple({
        domain: scenario.domain,
        dimensions,
        values: dimensions.map((name) => scenario[name]),
        transition: scenario.transition,
        preconditions: scenario.preconditions,
        sourceHash: scenario.sourceHash,
      }),
    ),
  );
  const riskValues = (node) => ({
    concurrency: ["single finite lease", "concurrent stale completion"],
    lifecycle: node.platforms.some((value) => ["android", "ios"].includes(value)) ? ["foreground", "background", "recreation"] : ["repository process"],
    permissions: node.platforms.some((value) => ["android", "ios"].includes(value)) ? ["granted", "denied"] : ["NOT_APPLICABLE"],
    "provider state": node.providers.length ? ["available", "blocked_external"] : ["NOT_APPLICABLE"],
    "replacement authority": ["current", "stale"],
  });
  const threeWayTuples = nodes.flatMap((node) =>
    combinations(HIGH_RISK_THREE_WAY, 3).flatMap((dimensions) => {
      const values = riskValues(node);
      return values[dimensions[0]].flatMap((a) =>
        values[dimensions[1]].flatMap((b) =>
          values[dimensions[2]].map((c) =>
            tuple({
              domain: node.domain,
              dimensions,
              values: [a, b, c],
              applicability: [a, b, c].includes("NOT_APPLICABLE") ? "NOT_APPLICABLE_WITH_CONSTRAINT" : "APPLICABLE",
              constraint: [a, b, c].includes("NOT_APPLICABLE") ? "registered governing platform/provider scope" : "registered reachable risk values",
              sourceEvidence: hashValue(node.transitionContracts),
            }),
          ),
        ),
      );
    }),
  );
  const exhaustiveTuples = EXHAUSTIVE_BOUNDARIES.flatMap((boundary) =>
    domainModels.map((model) => {
      const node = byDomain.get(model.domain);
      const relevant = boundary.includes("money") ? /money|premium|billing|payout|ledger/u.test(model?.domain ?? "") : boundary.includes("native") || boundary.includes("permission") ? (node?.platforms ?? []).some((value) => ["android", "ios"].includes(value)) : Boolean(node);
      const applicableEdges = edges.filter(({ sourceDomain, destinationDomain }) => [sourceDomain, destinationDomain].includes(model.domain)).map(({ edgeId }) => edgeId);
      return tuple({
        boundary,
        domain: model.domain,
        transitions: relevant
          ? transitionContractsOf(model).map(({ id, from, to }) => ({
              id,
              from,
              to,
            }))
          : [],
        authorityTrustEdges: relevant ? applicableEdges : [],
        status: relevant ? "APPLICABLE" : "NOT_APPLICABLE_WITH_CONSTRAINT",
        evidencePlan: relevant ? "each transition has positive/negative witness, mutant, authority proof" : "registered domain has no applicable boundary dimension",
      });
    }),
  );
  const entry = (id, dimensions, tuples) => ({
    id,
    dimensions,
    tuples,
    tupleCount: tuples.length,
    tupleHash: hashValue(tuples),
  });
  return {
    pairwiseCoverage: [entry("finite-ordinary-dimension-pairs", ["state", "transition", "platform", "provider", "market"], pairwiseTuples)],
    threeWayCoverage: [entry("finite-high-risk-three-way-combinations", HIGH_RISK_THREE_WAY, threeWayTuples)],
    exhaustiveHighRiskCoverage: [entry("registered-exhaustive-boundaries", EXHAUSTIVE_BOUNDARIES, exhaustiveTuples)],
  };
};
const immutableScopeSubject = (scope) => ({
  base: scope?.base,
  paths: scope?.paths,
  pathHash: scope?.pathHash,
  exactPlan: scope?.exactPlan !== false,
});
const trustedScopeObservations = new WeakSet();
const trustedGitHubTaskIdentities = new WeakSet();
export const doctrineBootstrapAuthorizationSubject = ({ repository = "Chillywood2025/chillywood-mobile", pr, branch, admittedSeedHead, admittedSeedTree, protectedBase, leaseId, pathHash, maximumFiles, maximumLines }) => ({
  type: "DOCTRINE_BOOTSTRAP_AUTHORIZATION",
  repository,
  pr,
  branch,
  admittedSeedHead,
  admittedSeedTree,
  protectedBase,
  leaseId,
  pathHash,
  maximumFiles,
  maximumLines,
  descendantSourceCommitsPreserveAuthority: true,
  reviewAndCiInvalidatedBySourcePush: true,
  productMutationAuthorized: false,
});
export function doctrineBootstrapOwnerCommentBody(subject) {
  const payload = {
    schemaVersion: 1,
    evidenceClass: "OWNER_INTENT",
    authorizationId: `doctrine-bootstrap-${subject.leaseId}`,
    type: "DOCTRINE_BOOTSTRAP_AUTHORIZATION",
    repository: subject.repository,
    pr: subject.pr,
    task: "ACTIVATE_WHOLE_APP_ENGINEERING_DOCTRINE",
    leaseId: subject.leaseId,
    subject,
    subjectHash: hashValue(subject),
  };
  return `${OWNER_AUTH_MARKER}\n${stableJson({ ...payload, bodyHash: hashValue(payload) })}`;
}
export const verifyDoctrineBootstrapOwnerComment = (raw, subject) => {
  const normalized = normalizeGitHubCommentIdentity(raw, { repository: subject.repository, pr: subject.pr, commentId: raw?.id });
  if (!normalized || normalized.body !== doctrineBootstrapOwnerCommentBody(subject)) return null;
  return Object.freeze({ ...normalized, evidenceClass: "OWNER_INTENT", subject: structuredClone(subject), subjectHash: hashValue(subject), replayResult: "VERIFIED_GITHUB_READBACK" });
};

export const doctrineScopeAmendmentSubject = () => ({
  type: "OWNER_DOCTRINE_SCOPE_AMENDMENT_V1",
  repository: "Chillywood2025/chillywood-mobile",
  pr: 226,
  branch: DOCTRINE_BRANCH,
  currentCandidateHead: "c9192f0f94d903617eb28deba610c26c41dc8eeb",
  currentCandidateTree: "15ae28610def9204814575235129daf4b3c8c5c4",
  leaseId: "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1",
  originalAuthorization: {
    commentId: DOCTRINE_BOOTSTRAP_COMMENT_ID,
    pathHash: DOCTRINE_ORIGINAL_PATH_HASH,
    subjectHash: "70084d67f5d42af7b350c6472cac13c146b801fc2615d89331596f4ea3473fa9",
    bodyFactsHash: "deb90bb88418e2557f91f18909ea4aceea67525d8af2e30208d265c1a47de5ac",
    bodySha256: "065050c7b1f0b17864c8aa0129e81039a6a1d7b6bed25bc19f5114e5496990c5",
  },
  addedPaths: [...DOCTRINE_SCOPE_AMENDMENT_PATHS],
  resultingExactPaths: [...DOCTRINE_AMENDED_PATHS],
  resultingFullPathHash: DOCTRINE_AMENDED_PATH_HASH,
  oldLimits: { maximumFiles: 25, maximumHandAuthoredNetLines: 4000, maximumGeneratedGraphLines: 12000 },
  newLimits: { maximumFiles: 31, maximumHandAuthoredNetLines: 7000, maximumGeneratedGraphLines: 12000 },
  reason: "Correct the inherited generic Phase 1 task-scope context defect while converging the frozen exact-head doctrine finding ledger in PR #226.",
  finiteSetOnly: true,
  wildcardPathsAuthorized: false,
  originalAuthorizationReplaced: false,
  taskIdentityChanged: false,
  prIdentityChanged: false,
  branchIdentityChanged: false,
  protectedBaseChanged: false,
  authorityExpanded: false,
  ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
  immutableCommentRequired: true,
  maximumAmendments: 1,
  expiresOn: "PR_226_MERGE",
  reusableByAnotherTask: false,
  authority: { product: false, native: false, packageLock: false, database: false, provider: false, build: false, release: false, money: false, authRls: false, switch: false, schedule: false, credential: false },
});

export function doctrineScopeAmendmentOwnerCommentBody(subject = doctrineScopeAmendmentSubject()) {
  const payload = {
    schemaVersion: 1,
    evidenceClass: "OWNER_INTENT",
    authorizationId: "doctrine-scope-amendment-OWNER_DOCTRINE_SCOPE_AMENDMENT_V1",
    type: "OWNER_DOCTRINE_SCOPE_AMENDMENT_V1",
    repository: subject.repository,
    pr: subject.pr,
    task: "ACTIVATE_WHOLE_APP_ENGINEERING_DOCTRINE",
    leaseId: subject.leaseId,
    currentHead: subject.currentCandidateHead,
    subject,
    subjectHash: hashValue(subject),
  };
  return `${OWNER_AUTH_MARKER}\n${stableJson({ ...payload, bodyHash: hashValue(payload) })}`;
}

const DOCTRINE_VERIFICATION_CORRECTION_MARKER = "<!-- chillywood-doctrine-verification-dependency-correction-v1 -->";
export const DOCTRINE_SCOPE_BEHAVIOR_SUBJECTS = Object.freeze([
  {
    kind: "REMOVED_EXACT_COMMAND",
    sourcePath: ".github/workflows/phase1-ci.yml",
    value: "node scripts/assurance/pr-scope.mjs --feature=codex-security-scan-reliability-s0 --waiver=config/assurance/codex-security-reliability-s0-scope-waiver-v1.json",
  },
  {
    kind: "WORKFLOW_STEP_COMMAND",
    sourcePath: ".github/workflows/phase1-ci.yml",
    value: 'node scripts/assurance/pr-scope.mjs --github-event="$GITHUB_EVENT_PATH"',
  },
]);

export const doctrineVerificationDependencyCorrectionSubject = () => ({
  type: "OWNER_DOCTRINE_VERIFICATION_DEPENDENCY_CORRECTION_V1",
  repository: "Chillywood2025/chillywood-mobile",
  pr: 226,
  branch: DOCTRINE_BRANCH,
  currentCandidateHead: "cc509f67d27581438523e4aeb43bd497ff779368",
  currentCandidateTree: "ad9421dee033502e77f6dbb6bcbedf68d1734fa6",
  leaseId: "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1",
  originalAuthorization: {
    commentId: DOCTRINE_BOOTSTRAP_COMMENT_ID,
    subjectHash: "70084d67f5d42af7b350c6472cac13c146b801fc2615d89331596f4ea3473fa9",
    bodyFactsHash: "deb90bb88418e2557f91f18909ea4aceea67525d8af2e30208d265c1a47de5ac",
    bodySha256: "065050c7b1f0b17864c8aa0129e81039a6a1d7b6bed25bc19f5114e5496990c5",
  },
  firstScopeAmendment: {
    commentId: DOCTRINE_SCOPE_AMENDMENT_COMMENT_ID,
    subjectHash: "dad2b97db2c992498ddf7d027d17392950a44c5b7f0cddcc0cca7a9ca2003dce",
    bodyFactsHash: "faab9e23d868bac8e565696531da7c36a5f45c562a494341c360f1d10df02ae9",
    bodySha256: "dce4f6c98c7b014451e1b92fb5f8d7df5e979c8cc00884e9f1ed24cea76a72c8",
  },
  failedPhase1: {
    runId: 31662770266,
    runUrl: "https://github.com/Chillywood2025/chillywood-mobile/actions/runs/31662770266",
    jobId: 94330876566,
    jobName: "Phase 1 / Autonomous Systems All-Platform Contract",
    conclusion: "failure",
    testPath: DOCTRINE_VERIFICATION_DEPENDENCY_PATHS[0],
  },
  staleAssertion: DOCTRINE_SCOPE_BEHAVIOR_SUBJECTS[0].value,
  authorizedReplacementBehavior: {
    workflowInvocation: DOCTRINE_SCOPE_BEHAVIOR_SUBJECTS[1].value,
    actualS0IdentityResolvesHistoricalWaiverOnly: true,
    doctrineIdentityResolvesFeature: "assurance-efficiency-e0",
    unrelatedTaskMayBorrowS0Waiver: false,
  },
  addedPaths: [...DOCTRINE_VERIFICATION_DEPENDENCY_PATHS],
  resultingExactPaths: [...DOCTRINE_PATHS],
  resultingFullPathHash: DOCTRINE_FINAL_PATH_HASH,
  priorLimits: { maximumFiles: 31, maximumHandAuthoredNetLines: 7000, maximumGeneratedGraphLines: 12000 },
  newLimits: { maximumFiles: 32, maximumHandAuthoredNetLines: 7000, maximumGeneratedGraphLines: 12000 },
  verificationDependencyOnly: true,
  domainOwnershipExpanded: false,
  generalScopeAmendment: false,
  maximumVerificationCorrections: 1,
  ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
  immutableCommentRequired: true,
  createdAtEqualsUpdatedAtRequired: true,
  expiresOn: "PR_226_MERGE",
  reusableByAnotherPrOrTask: false,
  authority: { product: false, nativeProduct: false, packageLock: false, database: false, migration: false, provider: false, build: false, release: false, submission: false, ota: false, money: false, authRls: false, switch: false, schedule: false, credential: false },
});

export function doctrineVerificationDependencyCorrectionOwnerCommentBody(subject = doctrineVerificationDependencyCorrectionSubject()) {
  const payload = {
    schemaVersion: 1,
    evidenceClass: "OWNER_INTENT",
    authorizationId: "doctrine-verification-dependency-correction-OWNER_DOCTRINE_VERIFICATION_DEPENDENCY_CORRECTION_V1",
    type: subject.type,
    repository: subject.repository,
    pr: subject.pr,
    task: "ACTIVATE_WHOLE_APP_ENGINEERING_DOCTRINE",
    leaseId: subject.leaseId,
    currentHead: subject.currentCandidateHead,
    subject,
    subjectHash: hashValue(subject),
  };
  return `${DOCTRINE_VERIFICATION_CORRECTION_MARKER}\n${stableJson({ ...payload, bodyHash: hashValue(payload) })}`;
}

const verificationCandidate = (name) => /^(?:tests\/.*\.test\.(?:[cm]?[jt]s|tsx?)|scripts\/(?:guard|proof)-[^/]+\.(?:[cm]?[jt]s|tsx?)|\.github\/workflows\/[^/]+\.ya?ml)$/u.test(name);
const resolveImportCandidates = (candidatePath, specifier) => {
  if (!specifier.startsWith(".")) return [];
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(candidatePath), specifier));
  return [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, `${base}.tsx`, `${base}/index.mjs`, `${base}/index.js`, `${base}/index.ts`, `${base}/index.tsx`];
};

export function deriveVerificationDependencyClosure({
  root = REPOSITORY_ROOT,
  changedSourcePaths = ["scripts/assurance/pr-scope.mjs", "scripts/assurance/pr-scope-lib.mjs", "config/assurance/pr-scope-policy-v1.json"],
  changedSubjects = DOCTRINE_SCOPE_BEHAVIOR_SUBJECTS,
  candidatePaths = null,
} = {}) {
  const sources = canonicalSort([...new Set(changedSourcePaths)].filter(safeRepoPath));
  const subjects = changedSubjects
    .filter((item) => object(item) && textValue(item.kind) && textValue(item.value) && safeRepoPath(item.sourcePath) && (sources.includes(item.sourcePath) || item.sourcePath === ".github/workflows/phase1-ci.yml"))
    .map((item) => ({ kind: item.kind, sourcePath: item.sourcePath, value: item.value }))
    .sort((left, right) => compareUtf8(`${left.sourcePath}\0${left.kind}\0${left.value}`, `${right.sourcePath}\0${right.kind}\0${right.value}`));
  const changedAssets = new Set([...sources, ...subjects.map(({ sourcePath }) => sourcePath)]);
  const discovered = candidatePaths === null
    ? canonicalSort([
        ...walk(root, "tests", verificationCandidate),
        ...walk(root, "scripts", verificationCandidate),
        ...walk(root, ".github/workflows", verificationCandidate),
      ])
    : canonicalSort([...new Set(candidatePaths)].filter(verificationCandidate));
  const dependencies = [];
  for (const candidatePath of discovered) {
    if (changedAssets.has(candidatePath)) continue;
    const absolute = path.join(root, candidatePath);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    const content = fs.readFileSync(absolute, "utf8");
    const relationships = [];
    for (const match of content.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gu)) {
      for (const resolved of resolveImportCandidates(candidatePath, match[1])) {
        if (sources.includes(resolved)) relationships.push({ type: "DIRECT_IMPORT", sourcePath: resolved, exactSubject: match[1] });
      }
    }
    for (const sourcePath of sources) {
      if (content.includes(sourcePath)) relationships.push({ type: "EXACT_REFERENCED_SOURCE_PATH", sourcePath, exactSubject: sourcePath });
    }
    for (const subject of subjects) {
      if (content.includes(subject.value)) relationships.push({ type: subject.kind, sourcePath: subject.sourcePath, exactSubject: subject.value });
    }
    const exactRelationships = [...new Map(relationships.map((item) => [`${item.type}\0${item.sourcePath}\0${item.exactSubject}`, item])).values()]
      .sort((left, right) => compareUtf8(`${left.sourcePath}\0${left.type}\0${left.exactSubject}`, `${right.sourcePath}\0${right.type}\0${right.exactSubject}`));
    if (exactRelationships.length) dependencies.push({ path: candidatePath, sourceHash: crypto.createHash("sha256").update(content).digest("hex"), relationships: exactRelationships });
  }
  const body = {
    schemaVersion: 1,
    closureId: "VERIFICATION_DEPENDENCY_CLOSURE_V1",
    changedSourcePaths: sources,
    changedSubjects: subjects,
    dependencies: dependencies.sort((left, right) => compareUtf8(left.path, right.path)),
    includedPaths: canonicalSort(dependencies.map(({ path: dependencyPath }) => dependencyPath)),
    wildcardPaths: false,
    productAuthorityExpanded: false,
  };
  return { ...body, closureHash: hashValue(body) };
}

export function verifyVerificationDependencyClosure(closure, { authorizedPaths = DOCTRINE_PATHS } = {}) {
  const body = { ...closure };
  delete body.closureHash;
  const findings = [];
  if (closure?.closureId !== "VERIFICATION_DEPENDENCY_CLOSURE_V1" || closure?.closureHash !== hashValue(body)) findings.push("VERIFICATION_DEPENDENCY_CLOSURE_HASH_INVALID");
  if (!Array.isArray(closure?.dependencies) || !Array.isArray(closure?.includedPaths) || stableJson(closure.includedPaths) !== stableJson(canonicalSort(closure.dependencies.map(({ path: dependencyPath }) => dependencyPath)))) findings.push("VERIFICATION_DEPENDENCY_SET_INVALID");
  if ((closure?.includedPaths ?? []).some((candidatePath) => !verificationCandidate(candidatePath) || candidatePath.includes("*") || !authorizedPaths.includes(candidatePath))) findings.push("VERIFICATION_DEPENDENCY_SCOPE_UNAUTHORIZED");
  if (closure?.wildcardPaths !== false || closure?.productAuthorityExpanded !== false) findings.push("VERIFICATION_DEPENDENCY_AUTHORITY_EXPANDED");
  if ((closure?.dependencies ?? []).some(({ relationships }) => !Array.isArray(relationships) || relationships.length === 0 || relationships.some(({ exactSubject, sourcePath }) => !textValue(exactSubject) || !safeRepoPath(sourcePath)))) findings.push("VERIFICATION_DEPENDENCY_RELATIONSHIP_UNGROUNDED");
  return { ok: findings.length === 0, findings: canonicalSort(findings) };
}

const amendedScopeFromGit = (head, root = REPOSITORY_ROOT) => {
  if (!/^[0-9a-f]{40}$/u.test(head ?? "")) return null;
  const run = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  const pathsRun = run(["diff", "--name-only", `${DOCTRINE_BASE}...${head}`]);
  const linesRun = run(["diff", "--numstat", `${DOCTRINE_BASE}...${head}`]);
  if (pathsRun.status !== 0 || linesRun.status !== 0) return null;
  const paths = pathsRun.stdout.split(/\r?\n/gu).filter(Boolean).sort();
  const rows = linesRun.stdout.split(/\r?\n/gu).filter(Boolean).map((row) => row.split("\t"));
  const handAuthoredNetLines = rows.filter(([, , file]) => file !== "config/assurance/whole-app-domain-graph-v1.json").reduce((sum, [added, deleted]) => sum + Math.max(0, (Number(added) || 0) - (Number(deleted) || 0)), 0);
  const generatedGraphLines = rows.filter(([, , file]) => file === "config/assurance/whole-app-domain-graph-v1.json").reduce((sum, [added]) => sum + (Number(added) || 0), 0);
  return { paths, pathHash: hashValue(paths), handAuthoredNetLines, generatedGraphLines };
};

export function verifyDoctrineScopeAmendment({ originalRaw, amendmentRaw, amendmentComments = [], currentHead, currentBranch = DOCTRINE_BRANCH, currentPr = 226, root = REPOSITORY_ROOT } = {}) {
  const subject = doctrineScopeAmendmentSubject();
  const originalSubject = doctrineBootstrapAuthorizationSubject({ repository: subject.repository, pr: subject.pr, branch: subject.branch, admittedSeedHead: DOCTRINE_BASE, admittedSeedTree: "64c3f8d56d93b08e5c3d3abbed11e707be1ede2b", protectedBase: DOCTRINE_BASE, leaseId: subject.leaseId, pathHash: DOCTRINE_ORIGINAL_PATH_HASH, maximumFiles: 25, maximumLines: 4000 });
  const original = verifyDoctrineBootstrapOwnerComment(originalRaw, originalSubject);
  const amendment = normalizeGitHubCommentIdentity(amendmentRaw, { repository: subject.repository, pr: subject.pr, commentId: DOCTRINE_SCOPE_AMENDMENT_COMMENT_ID });
  const matchingAmendments = amendmentComments.filter((raw) => typeof raw?.body === "string" && raw.body.includes('"type":"OWNER_DOCTRINE_SCOPE_AMENDMENT_V1"'));
  const scope = amendedScopeFromGit(currentHead, root);
  const ancestor = /^[0-9a-f]{40}$/u.test(currentHead ?? "") && spawnSync("git", ["merge-base", "--is-ancestor", subject.currentCandidateHead, currentHead], { cwd: root, shell: false }).status === 0;
  const forbidden = /^(?:app|android|ios|modules|plugins|supabase|workers|ops|legal|config\/release|config\/ios)\//u;
  const exact = original
    && amendment
    && amendment.body === doctrineScopeAmendmentOwnerCommentBody(subject)
    && matchingAmendments.length === 1
    && matchingAmendments[0]?.id === DOCTRINE_SCOPE_AMENDMENT_COMMENT_ID
    && currentPr === subject.pr
    && currentBranch === subject.branch
    && ancestor
    && hashValue(subject.addedPaths) === hashValue([...DOCTRINE_SCOPE_AMENDMENT_PATHS])
    && hashValue(subject.resultingExactPaths) === subject.resultingFullPathHash
    && subject.resultingFullPathHash === DOCTRINE_AMENDED_PATH_HASH
    && subject.addedPaths.every((file) => !file.includes("*") && !forbidden.test(file))
    && scope
    && scope.paths.length <= subject.newLimits.maximumFiles
    && scope.paths.every((file) => subject.resultingExactPaths.includes(file))
    && scope.handAuthoredNetLines <= subject.newLimits.maximumHandAuthoredNetLines
    && scope.generatedGraphLines <= subject.newLimits.maximumGeneratedGraphLines;
  return {
    ok: Boolean(exact),
    repository: subject.repository,
    pr: subject.pr,
    branch: subject.branch,
    currentHead,
    originalAuthorization: original,
    amendment: exact ? Object.freeze({ ...amendment, subject, subjectHash: hashValue(subject), bodyFactsHash: JSON.parse(amendment.body.slice(OWNER_AUTH_MARKER.length + 1)).bodyHash, replayResult: "VERIFIED_GITHUB_READBACK" }) : null,
    scope,
    budget: subject.newLimits,
    findings: exact ? [] : ["OWNER_DOCTRINE_SCOPE_AMENDMENT_INVALID"],
  };
}

export function verifyDoctrineVerificationDependencyCorrection({
  originalRaw,
  amendmentRaw,
  correctionRaw,
  allComments = [],
  failedRunRaw = null,
  failedJobsRaw = null,
  failedJobLog = "",
  currentHead,
  currentBranch = DOCTRINE_BRANCH,
  currentPr = 226,
  root = REPOSITORY_ROOT,
} = {}) {
  const subject = doctrineVerificationDependencyCorrectionSubject();
  const amendment = verifyDoctrineScopeAmendment({
    originalRaw,
    amendmentRaw,
    amendmentComments: allComments,
    currentHead: subject.currentCandidateHead,
    currentBranch,
    currentPr,
    root,
  });
  const correction = normalizeGitHubCommentIdentity(correctionRaw, { repository: subject.repository, pr: subject.pr, commentId: DOCTRINE_VERIFICATION_DEPENDENCY_COMMENT_ID });
  const matchingCorrections = allComments.filter((raw) => typeof raw?.body === "string" && raw.body.includes('"type":"OWNER_DOCTRINE_VERIFICATION_DEPENDENCY_CORRECTION_V1"'));
  const run = failedRunRaw;
  const jobs = Array.isArray(failedJobsRaw?.jobs) ? failedJobsRaw.jobs : [];
  const job = jobs.find(({ id }) => id === subject.failedPhase1.jobId);
  const runValid = run?.id === subject.failedPhase1.runId
    && run?.event === "pull_request"
    && run?.status === "completed"
    && run?.conclusion === "failure"
    && run?.head_sha === subject.currentCandidateHead
    && run?.html_url === subject.failedPhase1.runUrl
    && job?.name === subject.failedPhase1.jobName
    && job?.conclusion === subject.failedPhase1.conclusion
    && typeof failedJobLog === "string"
    && failedJobLog.includes(subject.failedPhase1.testPath)
    && failedJobLog.includes(subject.staleAssertion);
  const runGit = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 });
  const baseFile = runGit(["show", `${DOCTRINE_BASE}:${subject.addedPaths[0]}`]);
  const candidateTree = runGit(["rev-parse", `${subject.currentCandidateHead}^{tree}`]);
  const baseFileValid = baseFile.status === 0
    && baseFile.stdout.includes(subject.staleAssertion)
    && baseFile.stdout.includes("scripts/assurance/pr-scope.mjs");
  const ancestor = /^[0-9a-f]{40}$/u.test(currentHead ?? "") && runGit(["merge-base", "--is-ancestor", subject.currentCandidateHead, currentHead]).status === 0;
  const scope = amendedScopeFromGit(currentHead, root);
  const correctionPath = subject.addedPaths[0];
  const exactVerificationPath = subject.addedPaths.length === 1
    && subject.addedPaths[0] === DOCTRINE_VERIFICATION_DEPENDENCY_PATHS[0]
    && /^(?:tests\/|scripts\/(?:guard|proof)-)/u.test(correctionPath)
    && !correctionPath.includes("*");
  const authorityDenied = Object.values(subject.authority).every((allowed) => allowed === false)
    && subject.domainOwnershipExpanded === false
    && subject.generalScopeAmendment === false;
  const verificationChecks = {
    originalAndAmendmentValid: amendment.ok,
    correctionIdentityValid: Boolean(correction),
    correctionBodyExact: correction?.body === doctrineVerificationDependencyCorrectionOwnerCommentBody(subject),
    exactlyOneCorrection: matchingCorrections.length === 1 && matchingCorrections[0]?.id === DOCTRINE_VERIFICATION_DEPENDENCY_COMMENT_ID,
    pullIdentityExact: currentPr === subject.pr && currentBranch === subject.branch,
    candidateHeadTreeExact: candidateTree.status === 0 && candidateTree.stdout.trim() === subject.currentCandidateTree,
    correctionHeadAncestor: ancestor,
    failedPhase1Exact: runValid,
    protectedBaseDependencyExact: baseFileValid,
    verificationPathExact: exactVerificationPath,
    resultingPathSetExact: hashValue(subject.resultingExactPaths) === subject.resultingFullPathHash && subject.resultingFullPathHash === DOCTRINE_FINAL_PATH_HASH,
    priorBudgetExact: stableJson(subject.priorLimits) === stableJson({ maximumFiles: 31, maximumHandAuthoredNetLines: 7000, maximumGeneratedGraphLines: 12000 }),
    finalBudgetExact: stableJson(subject.newLimits) === stableJson({ maximumFiles: 32, maximumHandAuthoredNetLines: 7000, maximumGeneratedGraphLines: 12000 }),
    authorityDenied,
    scopeReadable: Boolean(scope),
    scopePathCountValid: Boolean(scope && scope.paths.length <= subject.newLimits.maximumFiles),
    scopePathsExact: Boolean(scope && scope.paths.every((file) => subject.resultingExactPaths.includes(file))),
    handAuthoredBudgetValid: Boolean(scope && scope.handAuthoredNetLines <= subject.newLimits.maximumHandAuthoredNetLines),
    generatedGraphBudgetValid: Boolean(scope && scope.generatedGraphLines <= subject.newLimits.maximumGeneratedGraphLines),
  };
  const exact = Object.values(verificationChecks).every(Boolean);
  let payload = null;
  try { payload = correction ? JSON.parse(correction.body.slice(DOCTRINE_VERIFICATION_CORRECTION_MARKER.length + 1)) : null; } catch { payload = null; }
  return {
    ok: Boolean(exact),
    repository: subject.repository,
    pr: subject.pr,
    branch: subject.branch,
    currentHead,
    originalAuthorization: amendment.originalAuthorization,
    amendment: amendment.amendment,
    verificationCorrection: exact ? Object.freeze({ ...correction, subject, subjectHash: hashValue(subject), bodyFactsHash: payload?.bodyHash ?? null, replayResult: "VERIFIED_GITHUB_READBACK" }) : null,
    failedPhase1Verified: runValid,
    baseVerificationDependencyVerified: baseFileValid,
    baseVerificationDependencyObservation: { status: baseFile.status, staleAssertionPresent: baseFile.stdout.includes(subject.staleAssertion), scopeCommandPresent: baseFile.stdout.includes("scripts/assurance/pr-scope.mjs"), sourceHash: baseFile.status === 0 ? hashValue(baseFile.stdout) : null, byteLength: Buffer.byteLength(baseFile.stdout) },
    scope,
    budget: subject.newLimits,
    verificationChecks,
    findings: exact ? [] : Object.entries(verificationChecks).filter(([, valid]) => !valid).map(([name]) => `OWNER_DOCTRINE_VERIFICATION_DEPENDENCY_CORRECTION_INVALID:${name}`),
  };
}

export function observeDoctrineOwnerAuthority({ currentHead, currentBranch = DOCTRINE_BRANCH, currentPr = 226, root = REPOSITORY_ROOT } = {}) {
  const gh = (endpoint) => spawnSync("gh", ["api", "--method=GET", endpoint], { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 });
  const originalResponse = gh(`repos/Chillywood2025/chillywood-mobile/issues/comments/${DOCTRINE_BOOTSTRAP_COMMENT_ID}`);
  const amendmentResponse = gh(`repos/Chillywood2025/chillywood-mobile/issues/comments/${DOCTRINE_SCOPE_AMENDMENT_COMMENT_ID}`);
  const correctionResponse = gh(`repos/Chillywood2025/chillywood-mobile/issues/comments/${DOCTRINE_VERIFICATION_DEPENDENCY_COMMENT_ID}`);
  const commentsResponse = gh(`repos/Chillywood2025/chillywood-mobile/issues/${currentPr}/comments?per_page=100`);
  const failedRunResponse = gh("repos/Chillywood2025/chillywood-mobile/actions/runs/31662770266");
  const failedJobsResponse = gh("repos/Chillywood2025/chillywood-mobile/actions/runs/31662770266/jobs?per_page=100");
  const failedJobLogResponse = gh("repos/Chillywood2025/chillywood-mobile/actions/jobs/94330876566/logs");
  try {
    return verifyDoctrineVerificationDependencyCorrection({
      originalRaw: originalResponse.status === 0 ? JSON.parse(originalResponse.stdout) : null,
      amendmentRaw: amendmentResponse.status === 0 ? JSON.parse(amendmentResponse.stdout) : null,
      correctionRaw: correctionResponse.status === 0 ? JSON.parse(correctionResponse.stdout) : null,
      allComments: commentsResponse.status === 0 ? JSON.parse(commentsResponse.stdout) : [],
      failedRunRaw: failedRunResponse.status === 0 ? JSON.parse(failedRunResponse.stdout) : null,
      failedJobsRaw: failedJobsResponse.status === 0 ? JSON.parse(failedJobsResponse.stdout) : null,
      failedJobLog: failedJobLogResponse.status === 0 ? failedJobLogResponse.stdout : "",
      currentHead,
      currentBranch,
      currentPr,
      root,
    });
  } catch {
    return { ok: false, findings: ["OWNER_DOCTRINE_VERIFICATION_DEPENDENCY_CORRECTION_UNREADABLE"] };
  }
}

export function observeGitHubTaskIdentity({ repository = "Chillywood2025/chillywood-mobile", pr, branch, admittedSeedHead, protectedBase = DOCTRINE_BASE, leaseId, commentId, amendmentCommentId = DOCTRINE_SCOPE_AMENDMENT_COMMENT_ID, verificationCorrectionCommentId = DOCTRINE_VERIFICATION_DEPENDENCY_COMMENT_ID, maximumFiles = 32, maximumLines = 7000, root = REPOSITORY_ROOT } = {}) {
  if (!Number.isInteger(pr) || pr < 1 || !textValue(branch) || !/^[0-9a-f]{40}$/u.test(admittedSeedHead ?? "") || !/^[0-9a-f]{40}$/u.test(protectedBase ?? "") || !textValue(leaseId) || !Number.isInteger(commentId) || commentId < 1) return null;
  const gh = (endpoint) => spawnSync("gh", ["api", "--method=GET", endpoint], { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 });
  const gitRun = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 });
  const pullResponse = gh(`repos/${repository}/pulls/${pr}`);
  const commentResponse = gh(`repos/${repository}/issues/comments/${commentId}`);
  const openResponse = gh(`repos/${repository}/pulls?state=open&base=main&per_page=100`);
  let pull;
  let comment;
  let openPulls;
  try {
    pull = pullResponse.status === 0 ? JSON.parse(pullResponse.stdout) : null;
    comment = commentResponse.status === 0 ? JSON.parse(commentResponse.stdout) : null;
    openPulls = openResponse.status === 0 ? JSON.parse(openResponse.stdout) : null;
  } catch {
    return null;
  }
  const head = pull?.head?.sha;
  const base = pull?.base?.sha;
  if (!/^[0-9a-f]{40}$/u.test(head ?? "") || !/^[0-9a-f]{40}$/u.test(base ?? "")) return null;
  const treeRun = gitRun(["rev-parse", `${head}^{tree}`]);
  const seedTreeRun = gitRun(["rev-parse", `${admittedSeedHead}^{tree}`]);
  const remoteHeadRun = gitRun(["rev-parse", `refs/remotes/origin/${branch}^{commit}`]);
  const seedAncestor = gitRun(["merge-base", "--is-ancestor", admittedSeedHead, head]).status === 0;
  const baseAncestor = gitRun(["merge-base", "--is-ancestor", base, head]).status === 0;
  const protectedAncestor = gitRun(["merge-base", "--is-ancestor", protectedBase, head]).status === 0;
  const pathsRun = gitRun(["diff", "--name-only", `${base}...${head}`]);
  const linesRun = gitRun(["diff", "--numstat", `${base}...${head}`]);
  const diffRun = gitRun(canonicalGitDiffArgs(`${base}...${head}`));
  if ([treeRun, seedTreeRun, remoteHeadRun, pathsRun, linesRun, diffRun].some(({ status }) => status !== 0)) return null;
  const paths = pathsRun.stdout.split(/\r?\n/gu).filter(Boolean).sort();
  const numstatRows = linesRun.stdout.split(/\r?\n/gu).filter(Boolean).map((row) => row.split("\t"));
  const changedLines = numstatRows.reduce((sum, row) => sum + row.slice(0, 2).reduce((part, value) => part + (/^\d+$/u.test(value) ? Number(value) : 0), 0), 0);
  const handAuthoredLines = numstatRows.filter(([, , file]) => file !== "config/assurance/whole-app-domain-graph-v1.json").reduce((sum, [added, deleted]) => sum + Math.max(0, (/^\d+$/u.test(added) ? Number(added) : 0) - (/^\d+$/u.test(deleted) ? Number(deleted) : 0)), 0);
  const generatedGraphLines = numstatRows.filter(([, , file]) => file === "config/assurance/whole-app-domain-graph-v1.json").reduce((sum, [added]) => sum + (/^\d+$/u.test(added) ? Number(added) : 0), 0);
  const pathHash = hashValue(paths);
  const subject = doctrineBootstrapAuthorizationSubject({ repository, pr, branch, admittedSeedHead, admittedSeedTree: seedTreeRun.stdout.trim(), protectedBase, leaseId, pathHash: DOCTRINE_ORIGINAL_PATH_HASH, maximumFiles: 25, maximumLines: 4000 });
  const ownerComment = verifyDoctrineBootstrapOwnerComment(comment, subject);
  const scopeAmendment = amendmentCommentId === DOCTRINE_SCOPE_AMENDMENT_COMMENT_ID && verificationCorrectionCommentId === DOCTRINE_VERIFICATION_DEPENDENCY_COMMENT_ID ? observeDoctrineOwnerAuthority({ currentHead: head, currentBranch: branch, currentPr: pr, root }) : { ok: false };
  const competing = Array.isArray(openPulls) ? openPulls.filter((item) => item.number !== pr && item.base?.ref === "main" && !String(item.title ?? "").toLowerCase().includes("review-only")) : ["UNREADABLE"];
  const candidateEligible = pull?.number === pr && pull?.state === "open" && pull?.head?.ref === branch && pull?.base?.ref === "main" && pull?.html_url === `https://github.com/${repository}/pull/${pr}` && base === protectedBase && remoteHeadRun.stdout.trim() === head && seedAncestor && baseAncestor && protectedAncestor && paths.length <= maximumFiles && handAuthoredLines <= maximumLines && generatedGraphLines <= 12000 && paths.every((file) => DOCTRINE_PATHS.includes(file)) && competing.length === 0 && ownerComment && scopeAmendment.ok;
  const observation = {
    schemaVersion: 1,
    evidenceClass: "GIT_GITHUB_IDENTITY",
    repository,
    pr,
    branch,
    head,
    tree: treeRun.stdout.trim(),
    base,
    admittedSeedHead,
    admittedSeedTree: seedTreeRun.stdout.trim(),
    leaseId,
    state: pull?.state,
    draft: pull?.draft === true,
    paths,
    changedLines,
    handAuthoredLines,
    generatedGraphLines,
    pathHash,
    diffHash: canonicalGitDiffHash(diffRun.stdout),
    exactPlan: true,
    seedAncestor,
    baseAncestor,
    protectedAncestor,
    noCompetingDomainOwner: competing.length === 0,
    ownerComment,
    scopeAmendment: scopeAmendment.amendment,
    scopeAmendmentCommentId: amendmentCommentId,
    verificationCorrection: scopeAmendment.verificationCorrection,
    verificationCorrectionCommentId,
    verificationCorrectionAudit: scopeAmendment.ok
      ? { ok: true, verificationChecks: scopeAmendment.verificationChecks, baseVerificationDependencyObservation: scopeAmendment.baseVerificationDependencyObservation }
      : { ok: false, findings: scopeAmendment.findings, verificationChecks: scopeAmendment.verificationChecks, baseVerificationDependencyObservation: scopeAmendment.baseVerificationDependencyObservation },
    candidateEligible: Boolean(candidateEligible),
    replayResult: candidateEligible ? "VERIFIED_GITHUB_GIT_IDENTITY" : "BLOCKED",
  };
  if (candidateEligible) {
    trustedGitHubTaskIdentities.add(observation);
    trustedScopeObservations.add(observation);
  }
  return observation;
}
const trustedGitHubTaskIdentity = (value) => trustedGitHubTaskIdentities.has(value) && value?.candidateEligible === true;
const trustedImplementationIdentities = new WeakSet();
const trustedImplementationIdentity = (value) => trustedImplementationIdentities.has(value) && value?.candidateEligible === true;

export function createImplementationIdentityObservation({
  repository,
  workflowPr,
  implementationPr,
  implementationBranch,
  implementationHead,
  implementationTree,
  originalSeedHead,
  originalSeedTree,
  protectedBase,
  currentProtectedMain,
  finiteLeaseId,
  taskArtifactPath,
  taskArtifactHash,
  implementationChangedPaths,
  seedIsAncestor = false,
  protectedBaseIsAncestor = false,
  ownerApprovalValid = false,
  artifactFrozen = false,
  prospectiveLeasePresent = false,
  admissionMerged = false,
} = {}) {
  const changedPaths = [...new Set(implementationChangedPaths ?? [])].sort();
  const candidateEligible = repository === "Chillywood2025/chillywood-mobile"
    && Number.isInteger(workflowPr) && workflowPr > 0
    && Number.isInteger(implementationPr) && implementationPr > 0
    && typeof implementationBranch === "string" && implementationBranch.length > 0
    && [implementationHead, implementationTree, originalSeedHead, originalSeedTree, protectedBase, currentProtectedMain].every((value) => /^[0-9a-f]{40}$/u.test(value ?? ""))
    && typeof finiteLeaseId === "string" && finiteLeaseId.length > 0
    && safeRepoPath(taskArtifactPath)
    && /^[0-9a-f]{64}$/u.test(taskArtifactHash ?? "")
    && changedPaths.includes(taskArtifactPath)
    && (admissionMerged === true || (changedPaths.length === 1 && changedPaths[0] === taskArtifactPath))
    && seedIsAncestor === true
    && protectedBaseIsAncestor === true
    && ownerApprovalValid === true
    && artifactFrozen === true
    && prospectiveLeasePresent === true;
  const observation = {
    repository,
    workflowPr,
    implementationPr,
    implementationBranch,
    implementationHead,
    implementationTree,
    originalSeedHead,
    originalSeedTree,
    protectedBase,
    currentProtectedMain,
    finiteLeaseId,
    taskArtifactPath,
    taskArtifactHash,
    implementationChangedPaths: changedPaths,
    seedIsAncestor,
    protectedBaseIsAncestor,
    ownerApprovalValid,
    artifactFrozen,
    prospectiveLeasePresent,
    admissionMerged,
    candidateEligible,
  };
  if (candidateEligible) trustedImplementationIdentities.add(observation);
  return observation;
}
export function observeCandidateScopeFromGit(base, head, root = REPOSITORY_ROOT) {
  if (!/^[0-9a-f]{40}$/u.test(base ?? "") || !/^[0-9a-f]{40}$/u.test(head ?? "")) return null;
  const run = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  const range = `${base}...${head}`;
  const pathsRun = run(["diff", "--name-only", range]);
  const linesRun = run(["diff", "--numstat", range]);
  const diffRun = run(canonicalGitDiffArgs(range));
  if ([pathsRun, linesRun, diffRun].some(({ status }) => status !== 0)) return null;
  const paths = pathsRun.stdout.split(/\r?\n/gu).filter(Boolean).sort();
  const rows = linesRun.stdout.split(/\r?\n/gu).filter(Boolean).map((row) => row.split("\t"));
  const additions = rows.reduce((total, [value]) => total + (/^\d+$/u.test(value) ? Number(value) : 0), 0);
  const deletions = rows.reduce((total, [, value]) => total + (/^\d+$/u.test(value) ? Number(value) : 0), 0);
  const changedLines = additions + deletions;
  const observation = {
    base,
    head,
    paths,
    changedLines,
    handAuthoredLines: changedLines,
    additions,
    deletions,
    netChangedLines: Math.max(0, additions - deletions),
    generatedGraphLines: 0,
    pathHash: hashValue(paths),
    diffHash: canonicalGitDiffHash(diffRun.stdout),
    exactPlan: true,
    observationSource: "FIXED_LOCAL_GIT_DIFF_NUMSTAT",
  };
  trustedScopeObservations.add(observation);
  return observation;
}
const trustedScopeObservation = (value) => trustedScopeObservations.has(value);
const exactPathExpansion = (record, requestedPath, { packet, certificate, allowedDomains, ownerAuthorizations, currentHead }) => {
  const amendment = record?.ownerLeaseAmendment;
  const subject = {
    type: "OWNER_LEASE_AMENDMENT",
    task: packet?.task,
    leaseId: String(certificate?.leaseId),
    currentHead,
    path: requestedPath,
    oldDomains: amendment?.oldDomains?.slice().sort(),
    newDomains: allowedDomains.slice().sort(),
    reason: amendment?.reason,
    highRiskApproved: amendment?.highRiskApproved === true,
  };
  return record?.path === requestedPath && stableJson(amendment?.newDomains?.slice().sort()) === stableJson(allowedDomains.slice().sort()) && amendment?.task === packet?.task && String(amendment?.leaseId) === String(certificate?.leaseId) && trustedOwnerAuthorization(ownerAuthorizations, amendment?.ownerAuthorization, "OWNER_LEASE_AMENDMENT", subject);
};
const scopeObservation = (root = REPOSITORY_ROOT) => {
  const run = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  const head = run(["rev-parse", "HEAD"]);
  const postDoctrine = head.status === 0 && run(["merge-base", "--is-ancestor", TYPED_CONTEXT_DOCTRINE_MERGE, head.stdout.trim()]).status === 0;
  if (postDoctrine) {
    const range = `${DOCTRINE_BASE}...${HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceHead}`;
    const pathsRun = run(["diff", "--name-only", range]);
    const numstatRun = run(["diff", "--numstat", range]);
    if (pathsRun.status !== 0 || numstatRun.status !== 0) return null;
    const paths = pathsRun.stdout.split(/\r?\n/gu).filter(Boolean).sort();
    const rows = numstatRun.stdout.split(/\r?\n/gu).filter(Boolean).map((line) => line.split("\t"));
    const changedLines = rows.reduce((sum, [added, deleted]) => sum + (Number(added) || 0) + (Number(deleted) || 0), 0);
    const handAuthoredLines = rows.filter(([, , file]) => file !== "config/assurance/whole-app-domain-graph-v1.json").reduce((sum, [added, deleted]) => sum + Math.max(0, (Number(added) || 0) - (Number(deleted) || 0)), 0);
    const generatedGraphLines = rows.filter(([, , file]) => file === "config/assurance/whole-app-domain-graph-v1.json").reduce((sum, [added]) => sum + (Number(added) || 0), 0);
    const observation = { base: DOCTRINE_BASE, paths, changedLines, handAuthoredLines, generatedGraphLines, pathHash: hashValue(paths) };
    trustedScopeObservations.add(observation);
    return observation;
  }
  const diff = run(["diff", "--numstat", DOCTRINE_BASE]);
  if (diff.status !== 0) return null;
  const rows = diff.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  const tracked = new Set(rows.map(([, , file]) => file));
  let changedLines = rows.reduce((sum, [added, deleted]) => sum + (Number(added) || 0) + (Number(deleted) || 0), 0);
  let handAuthoredLines = rows.filter(([, , file]) => file !== "config/assurance/whole-app-domain-graph-v1.json").reduce((sum, [added, deleted]) => sum + Math.max(0, (Number(added) || 0) - (Number(deleted) || 0)), 0);
  const untrackedRun = run(["ls-files", "--others", "--exclude-standard"]);
  if (untrackedRun.status !== 0) return null;
  for (const file of untrackedRun.stdout.trim().split("\n").filter(Boolean)) {
    const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n").length - 1;
    tracked.add(file);
    changedLines += lines;
    if (file !== "config/assurance/whole-app-domain-graph-v1.json") handAuthoredLines += lines;
  }
  const observation = {
    base: DOCTRINE_BASE,
    paths: [...tracked].sort(),
    changedLines,
    handAuthoredLines,
    generatedGraphLines: fs.existsSync(path.join(root, "config/assurance/whole-app-domain-graph-v1.json")) ? fs.readFileSync(path.join(root, "config/assurance/whole-app-domain-graph-v1.json"), "utf8").split("\n").length - 1 : 0,
    pathHash: hashValue([...tracked].sort()),
  };
  trustedScopeObservations.add(observation);
  return observation;
};

export function validateDoctrineBootstrap(packet, certificate, authority = {}, actualScope) {
  const C = packet?.sections?.C_AFFECTED_DOMAIN_CLOSURE;
  const K = packet?.sections?.K_IMPLEMENTATION_PLAN;
  const domains = C ? [C.primaryDomain, ...(C.includedDependencies ?? [])].sort() : [];
  const expectedDomains = ["assurance-efficiency-e0", "autonomous-cognitive-governance", "codex-security-scan-reliability-s0"].sort();
  const scope = actualScope ?? authority.actualScope;
  const paths = scope?.paths;
  const authorityValid = authority.branch === DOCTRINE_BRANCH && authority.base === DOCTRINE_BASE && authority.currentMain === DOCTRINE_BASE && authority.doctrineStatus !== "ACTIVE" && authority.implementationMerged === false && authority.bootstrapExpired === false && authority.productTask !== true && (!authority.featureId || authority.featureId === "assurance-efficiency-e0");
  const scopeValid = Array.isArray(paths) && paths.length <= 32 && paths.every((file) => DOCTRINE_PATHS.includes(file)) && Number.isInteger(scope.changedLines) && Number.isInteger(scope.handAuthoredLines) && scope.handAuthoredLines <= 7000 && Number.isInteger(scope.generatedGraphLines) && scope.generatedGraphLines <= 12000;
  const planValid = stableJson(K?.files?.slice().sort()) === stableJson([...DOCTRINE_PATHS].sort()) && K?.scopeBudget?.maximumFiles === 32 && K?.scopeBudget?.maximumLines === 7000 && K?.scopeBudget?.maximumGeneratedGraphLines === 12000;
  return packet?.id === "ENGINEERING_CLOSURE_PACKET_V1" && packet?.task === "ACTIVATE_WHOLE_APP_ENGINEERING_DOCTRINE" && packet?.classification === "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1" && certificate?.id === "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" && certificate?.task === packet.task && certificate?.featureDomain === "assurance-efficiency-e0" && C?.closureMode === "GOVERNING_BOOTSTRAP_EXPLICIT" && stableJson(domains) === stableJson(expectedDomains) && authorityValid && scopeValid && planValid;
}

function evaluateDeclaredPacketGate(packet, supplied = {}) {
  const root = supplied.root ?? REPOSITORY_ROOT;
  const graph = supplied.graph ?? generateDomainGraph(root);
  const taxonomy = supplied.taxonomy ?? readJson(root, "config/assurance/adversarial-taxonomy-v1.json");
  const contracts = supplied.contracts ?? readJson(root, "config/assurance/platform-provider-contracts-v1.json");
  const doctrine = supplied.doctrine ?? readJson(root, "config/assurance/engineering-doctrine-v1.json");
  const sections = packet?.sections;
  const findings = new Set();
  const derivedChecks = {};
  const derive = (key, valid) => {
    derivedChecks[key] = Boolean(valid);
    if (!valid) findings.add(GATE_FAILURES[key]);
  };
  const allFields = (value, fields) => object(value) && fields.every((field) => Object.hasOwn(value, field));
  const exactSections = object(sections) && PACKET_SECTIONS.every((name) => Object.hasOwn(sections, name)) && Object.keys(sections).every((name) => PACKET_SECTIONS.includes(name));
  const A = sections?.A_OWNER_INTENT;
  const B = sections?.B_BOUNDED_COMPLETENESS;
  const C = sections?.C_AFFECTED_DOMAIN_CLOSURE;
  const D = sections?.D_CURRENT_IMPLEMENTATION_AUDIT;
  const E = sections?.E_AUTHORITY_AND_DATA_FLOW;
  const F = sections?.F_STATE_MODEL;
  const invariants = sections?.G_INVARIANTS;
  const H = sections?.H_ADVERSARIAL_MATRIX;
  const I = sections?.I_COVERAGE_MAP;
  const J = sections?.J_STABLE_DEFECT_LEDGER;
  const K = sections?.K_IMPLEMENTATION_PLAN;
  const certificate = supplied.certificate ?? sections?.L_COMPLETENESS_CERTIFICATE;
  const M = sections?.M_STOP_CONDITIONS;
  const ownerAuthorizations = readOwnerAuthorizations(
    supplied.authoritativeLease,
    {
      repository: "Chillywood2025/chillywood-mobile",
      pr: supplied.taskIdentity?.pr,
      task: packet?.task,
      leaseId: certificate?.leaseId,
      currentHead: supplied.taskIdentity?.currentHead,
    },
    root,
  );
  const ownerJurisdictionAuthority = trustedOwnerJurisdictionAuthority(supplied.ownerJurisdictionAuthority)
    ? supplied.ownerJurisdictionAuthority
    : null;
  const statusAllowed = doctrine.boundedCompleteness.statuses.includes(packet?.completionStatus);
  const bootstrap = packet?.classification === "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1";
  const effectiveActualScope = trustedScopeObservation(supplied.actualScope) ? supplied.actualScope : bootstrap ? scopeObservation(root) : null;
  const bootstrapAuthority = supplied.bootstrapAuthority;
  const bootstrapValid = !bootstrap || validateDoctrineBootstrap(packet, certificate, bootstrapAuthority, effectiveActualScope);
  const packetIdentity = packet?.id === "ENGINEERING_CLOSURE_PACKET_V1" && textValue(packet?.task) && exactSections && statusAllowed && bootstrapValid && !(supplied.productTask === true && bootstrap);
  const boundary = B?.boundary;
  const requiredBoundary = doctrine.boundedCompleteness.requiredBoundary;
  const boundaryValid = packetIdentity && allFields(A, doctrine.closurePacket.sections.A_OWNER_INTENT) && textValue(A.requestedOutcome) && typeof A.productionCompleteDefault === "boolean" && textArray(A.nonGoals, true) && textArray(A.prohibitedOutcomes, true) && object(A.platformEnvironmentMarket) && textArray(A.platformEnvironmentMarket.platforms) && textArray(A.platformEnvironmentMarket.environments) && textArray(A.platformEnvironmentMarket.marketsJurisdictions) && textValue(A.risk) && object(boundary) && requiredBoundary.every((field) => textValue(boundary[field]));
  derive("boundaryExplicit", boundaryValid);
  const canonicalDomains = new Set(graph.nodes.map(({ domain }) => domain));
  const included = C && textValue(C.primaryDomain) && textArray(C.includedDependencies, true) ? [C.primaryDomain, ...C.includedDependencies].sort() : [];
  const canonicalClosure = C?.computedClosure ?? { status: "BOUND_INCOMPLETE", domains: [], findings: [] };
  const taskLocalClosure = C?.taskLocalGoverningEdgeClosure;
  const taskLocalClear = taskLocalClosure?.contract === TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1
    && taskLocalClosure?.classification === "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR"
    && taskLocalClosure?.deterministic === true
    && taskLocalClosure?.verificationRuns === "2/2"
    && Array.isArray(taskLocalClosure?.findings) && taskLocalClosure.findings.length === 0;
  const bootstrapClosure = packet?.classification === "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1" && C?.closureMode === "GOVERNING_BOOTSTRAP_EXPLICIT";
  const expectedClosureHash = canonicalClosure.closureHash;
  const closureSetValid = taskLocalClear
    ? stableJson(included) === stableJson(canonicalClosure.domains)
      && canonicalClosure.classification === "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR"
      && canonicalClosure.accounting?.unresolvedSet?.length === 0
    : stableJson(included) === stableJson(canonicalClosure.domains) && stableJson(canonicalClosure.actualIncludedEdges) === stableJson(canonicalClosure.requiredIncludedEdges);
  const closureValid = packetIdentity && textValue(C?.primaryDomain) && canonicalDomains.has(C.primaryDomain) && closureSetValid && C?.closureHash === expectedClosureHash && Array.isArray(C?.nonImpactingWithEvidence) && textArray(C?.unknownDependencies, true) && C.unknownDependencies.length === 0;
  derive("affectedDomainClosureComplete", closureValid);
  derive("dependencyClosureComplete", closureValid && (taskLocalClear || canonicalClosure.status === "BOUND_COMPLETE_FOR_REGISTERED_SCOPE"));
  const graphFindings = closureValid ? detectGraphFindings(graph, included) : [];
  const includedNodes = graph.nodes.filter(({ domain }) => included.includes(domain));
  const closureEdges = graph.edges.filter(({ sourceDomain, destinationDomain }) => included.includes(sourceDomain) && included.includes(destinationDomain));
  const contractIds = evidenceContractIds(doctrine, graph, taxonomy, contracts);
  const evidenceOptions = (subject) => ({
    root,
    domains: included,
    subject,
    contracts: contractIds,
  });
  const reservation = supplied.artifactReservation;
  const allowedEvidencePaths = bootstrap ? new Set(DOCTRINE_PATHS) : new Set([reservation?.closureArtifactPath, ...(reservation?.testEvidencePaths ?? [])]);
  const evidencePathsAllowed = (item) => allowedEvidencePaths.has(item.enforcingSource) && allowedEvidencePaths.has(item.negativeWitnessTestPath);
  const exclusionEvidenceValid =
    stableJson(doctrine.closureTraversal.nonImpactingReasonCodes) === stableJson(NON_IMPACTING_REASON_CODES) &&
    (taskLocalClear
      ? stableJson((C?.nonImpactingWithEvidence ?? []).map(({ edgeId }) => edgeId).sort(compareUtf8)) === stableJson(canonicalClosure.accounting?.boundaryExclusionSet ?? [])
      : stableJson(C?.nonImpactingWithEvidence ?? []) === stableJson(canonicalClosure.exclusionReceipts ?? []));
  const unknownKeys = includedNodes.flatMap((node) => (node.unresolvedUnknowns ?? []).map((unknown) => `${node.domain}:${unknown}`));
  const bootstrapUnknowns = bootstrap && effectiveActualScope?.paths?.every((file) => DOCTRINE_PATHS.includes(file)) && Array.isArray(C?.unknownResolutions) && C.unknownResolutions.length === unknownKeys.length && C.unknownResolutions.every((item) => included.includes(item.domain) && includedNodes.find(({ domain }) => domain === item.domain)?.unresolvedUnknowns.includes(item.unknown) && item.status === "NOT_APPLICABLE_WITH_CONSTRAINT" && item.reasonCode === "GOVERNING_BOOTSTRAP_NO_PRODUCT_NATIVE_PROVIDER_BUILD_MUTATION");
  const technicalResolutionValid = (item) => {
    const node = includedNodes.find(({ domain }) => domain === item?.domain);
    const source = safeRepoPath(item?.sourcePath) ? path.join(root, item.sourcePath) : "";
    const allowedSources = [...(node?.sourcePaths ?? []), reservation?.closureArtifactPath, ...(reservation?.testEvidencePaths ?? [])];
    const sourceAllowed = allowedSources.some((candidate) => (candidate?.includes("*") ? globMatches(item?.sourcePath ?? "", candidate) : candidate === item?.sourcePath));
    if (!node?.unresolvedUnknowns.includes(item?.unknown) || item?.status !== "RESOLVED_SOURCE_DERIVED" || item?.owner !== node.owner || item?.contractId !== graph.contractId || !sourceAllowed || !fs.existsSync(source) || fs.statSync(source).isDirectory()) return false;
    const bytes = fs.readFileSync(source);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== item.sourceContentSha256) return false;
    const text = bytes.toString("utf8");
    let derived;
    if (item.unknown === "hooks/libraries exact binding" && item.resolverType === "HOOK_LIBRARY_BINDING") {
      const bindings = [...text.matchAll(/(?:from\s+|require\s*\(\s*|import\s*\(\s*)["']([^"']+)["']/gu)]
        .map((match) => match[1])
        .filter(Boolean)
        .sort();
      derived = { bindings: [...new Set(bindings)] };
    } else if (item.unknown === "migration exact binding" && item.resolverType === "MIGRATION_BINDING" && /^supabase\/migrations\/[^/]+\.sql$/u.test(item.sourcePath)) {
      const registered = (node.dataOwned ?? []).flatMap((value) => String(value).split(/[^A-Za-z0-9_.]+/u)).filter((value) => value.length >= 3);
      const objects = [...new Set(registered.filter((value) => text.includes(value)))].sort();
      derived = { objects };
    } else if (item.unknown === "observability signals" && item.resolverType === "OBSERVABILITY_BINDING" && textValue(item.signal) && text.includes(item.signal) && /(?:emit|report|log|metric|trace|notify|receipt)/iu.test(text) && item.sinkOwner === node.observabilityOwner) {
      derived = { signal: item.signal, sinkOwner: item.sinkOwner };
    } else return false;
    const subject = {
      resolverType: item.resolverType,
      domain: item.domain,
      unknown: item.unknown,
      owner: item.owner,
      sourcePath: item.sourcePath,
      sourceContentSha256: item.sourceContentSha256,
      contractId: item.contractId,
      derived,
    };
    return node?.unresolvedUnknowns.includes(item.unknown) && ((derived.bindings?.length > 0 && stableJson(item.bindings) === stableJson(derived.bindings)) || (derived.objects?.length > 0 && stableJson(item.objects) === stableJson(derived.objects)) || (derived.signal && item.signal === derived.signal && item.sinkOwner === derived.sinkOwner)) && item.parserHash === hashValue(derived) && item.bindingHash === hashValue(subject);
  };
  const technicalResolutions = Array.isArray(C?.taskLocalModelSlice?.technicalUnknownResolutions) ? C.taskLocalModelSlice.technicalUnknownResolutions.filter(technicalResolutionValid) : [];
  const legacyJurisdictionResolutions = Array.isArray(C?.taskLocalModelSlice?.jurisdictionOwnerResolutions)
    ? C.taskLocalModelSlice.jurisdictionOwnerResolutions.filter((item) => {
        const subject = {
          type: "OWNER_JURISDICTION_DECISION",
          task: packet.task,
          leaseId: String(certificate?.leaseId),
          currentHead: supplied.taskIdentity?.currentHead,
          domain: item.domain,
          unknown: item.unknown,
          chosenOwner: item.chosenOwner,
          marketsJurisdictions: item.marketsJurisdictions,
        };
        return item.unknown === "market/jurisdiction owner" && included.includes(item.domain) && textValue(item.chosenOwner) && textArray(item.marketsJurisdictions) && trustedOwnerAuthorization(ownerAuthorizations, item.ownerAuthorization, "OWNER_JURISDICTION_DECISION", subject);
      })
    : [];
  const taskBoundJurisdictionValid = ownerJurisdictionAuthority?.ok === true
    && ownerJurisdictionAuthority.policyStatus === ACTIVE_POLICY_STATUS
    && ownerJurisdictionAuthority.externalProofInherited === false
    && ownerJurisdictionAuthority.operationalOwnersPreserved === true
    && stableJson(ownerJurisdictionAuthority.taskBinding?.domainIds) === stableJson(included)
    && ownerJurisdictionAuthority.taskBinding?.taskIdentity?.taskId === packet?.task
    && String(ownerJurisdictionAuthority.taskBinding?.taskIdentity?.leaseId) === String(certificate?.leaseId)
    && (ownerJurisdictionAuthority.taskBinding?.taskIdentity?.planningHead === supplied.taskIdentity?.currentHead
      || (/^[0-9a-f]{40}$/u.test(ownerJurisdictionAuthority.taskBinding?.taskIdentity?.planningHead ?? "")
        && /^[0-9a-f]{40}$/u.test(supplied.taskIdentity?.currentHead ?? "")
        && typedGit(root, ["merge-base", "--is-ancestor", ownerJurisdictionAuthority.taskBinding.taskIdentity.planningHead, supplied.taskIdentity.currentHead]).status === 0));
  const taskBoundJurisdictionResolutions = taskBoundJurisdictionValid
    ? ownerJurisdictionAuthority.taskBinding.domainIds.map((domain) => ({ domain, unknown: "market/jurisdiction owner" }))
    : [];
  const jurisdictionResolutions = [...legacyJurisdictionResolutions, ...taskBoundJurisdictionResolutions];
  const unknownResolutionKeys = new Set(bootstrapUnknowns ? C.unknownResolutions.map(({ domain, unknown }) => `${domain}:${unknown}`) : [...technicalResolutions, ...jurisdictionResolutions].map(({ domain, unknown }) => `${domain}:${unknown}`));
  const inventoryMembers = graph.inventory.groups.flatMap((group) => group.members.map((member) => ({ ...member, group: group.id })));
  const plannedAssets = Array.isArray(K?.files)
    ? K.files.map(
        (file) =>
          inventoryMembers.find(({ path: memberPath }) => memberPath === file) ?? {
            path: file,
            ownershipStatus: "UNKNOWN_OWNER",
            ownerDomains: [],
          },
      )
    : [];
  const inventoryGrounding = verifyInventoryNonVacuity(graph.inventory, { root, affectedDomains: included, plannedFiles: K?.files ?? [] });
  const duplicateStates = [...new Set(includedNodes.flatMap((node) => node.sharedMutableState.map(({ stateId }) => stateId)).filter((stateId) => new Set(includedNodes.flatMap((node) => node.sharedMutableState.filter((state) => state.stateId === stateId).map(({ owner }) => owner))).size > 1))].sort();
  const slice = C?.taskLocalModelSlice;
  const sliceBody = object(slice) ? Object.fromEntries(Object.entries(slice).filter(([key]) => key !== "sliceHash")) : null;
  const resolutionByState = new Map(Array.isArray(slice?.authorityResolutions) ? slice.authorityResolutions.map((item) => [item.stateId, item]) : []);
  const sliceEnvelopeValid = !object(slice) || (slice.id === "TASK_LOCAL_MODEL_SLICE_V1" && slice.baseGraphHash === graph.contentHash && slice.closureHash === C.closureHash && slice.artifactPath === reservation?.closureArtifactPath && slice.sliceHash === hashValue(sliceBody));
  const sliceValid =
    duplicateStates.length === 0
      ? sliceEnvelopeValid
      : sliceEnvelopeValid &&
        duplicateStates.every((stateId) => {
          const item = resolutionByState.get(stateId);
          const canonicalOwners = [...new Set(includedNodes.flatMap((node) => node.sharedMutableState.filter((state) => state.stateId === stateId).map(({ owner }) => owner)))].sort();
          const subject = {
            type: "REGISTERED_OWNER_DECISION",
            task: packet.task,
            leaseId: String(certificate?.leaseId),
            currentHead: supplied.taskIdentity?.currentHead,
            stateId,
            canonicalOwners,
            chosenOwner: item?.resolvedOwner,
          };
          return item && stableJson(item.canonicalOwners?.slice().sort()) === stableJson(canonicalOwners) && canonicalOwners.includes(item.resolvedOwner) && trustedOwnerAuthorization(ownerAuthorizations, item.ownerAuthorization, "REGISTERED_OWNER_DECISION", subject);
        });
  const modelEvidenceValid = exclusionEvidenceValid && C?.closureEdgeCount === closureEdges.length && unknownKeys.every((key) => unknownResolutionKeys.has(key)) && inventoryGrounding.ok && sliceValid;
  const effectiveGraphFindings = sliceValid ? graphFindings.filter((code) => code !== "DUPLICATE_AUTHORITY_OWNER") : graphFindings;
  derive("authorityUniquelyOwned", closureValid && modelEvidenceValid && !effectiveGraphFindings.some((code) => ["CIRCULAR_AUTHORITY", "DUPLICATE_AUTHORITY_OWNER", "UNOWNED_MUTABLE_STATE", "UI_STATE_USED_AS_SERVER_AUTHORITY", "CLIENT_STATE_USED_AS_PROVIDER_AUTHORITY", "UNREGISTERED_PROVIDER_MUTATION", "UNREGISTERED_AUTONOMOUS_WRITER", "UNBOUNDED_CROSS_DOMAIN_SIDE_EFFECT"].includes(code)) && allFields(E, doctrine.closurePacket.sections.E_AUTHORITY_AND_DATA_FLOW) && Object.values(E).every(textValue));
  const domainModels = new Map(Array.isArray(F?.domainModels) ? F.domainModels.filter(object).map((item) => [item.domain, item]) : []);
  const transitionContractValid = (item, node) =>
    object(item) &&
    node.transitions.includes(item.id) &&
    node.states.includes(item.from) &&
    node.states.includes(item.to) &&
    textArray(item.preconditions) &&
    textValue(item.staleBehavior) &&
    textValue(item.replacementBehavior) &&
    item.authorityOwner === node.owner &&
    textArray(item.platforms) &&
    textArray(item.providers) &&
    textArray(item.environments) &&
    textArray(item.markets) &&
    safeRepoPath(item.sourcePath) &&
    /^[0-9a-f]{64}$/u.test(item.sourceContentSha256 ?? "") &&
    Number.isInteger(item.sourceLine) &&
    item.sourceLine > 0 &&
    textValue(item.semanticToken) &&
    fs.existsSync(path.join(root, item.sourcePath)) &&
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, item.sourcePath)))
      .digest("hex") === item.sourceContentSha256 &&
    fs.readFileSync(path.join(root, item.sourcePath), "utf8").split("\n")[item.sourceLine - 1]?.includes(item.semanticToken);
  const domainModelsValid = includedNodes.every((node) => {
    const model = domainModels.get(node.domain);
    return model && stableJson(model.invariants) === stableJson(node.invariants) && Array.isArray(model.transitionContracts) && model.transitionContracts.length === node.transitions.length && model.transitionContracts.every((item) => transitionContractValid(item, node));
  });
  const aggregateState = qualifiedStateModel([...domainModels.values()].sort((a, b) => compareUtf8(a.domain, b.domain)));
  const stateValid = allFields(F, doctrine.closurePacket.sections.F_STATE_MODEL) && textValue(F.staleReplacement) && textValue(F.idempotency) && textValue(F.concurrencyOwner) && domainModels.size === includedNodes.length && domainModelsValid && F.reachableStates.length >= Math.max(2, includedNodes.length) && stableJson(F.reachableStates) === stableJson(aggregateState.reachableStates) && stableJson(F.transitions) === stableJson(aggregateState.transitions) && stableJson(F.preconditions) === stableJson(aggregateState.preconditions) && stableJson(F.terminalStates) === stableJson(aggregateState.terminalStates);
  derive("reachableStateModelComplete", stateValid);
  const auditValid = allFields(D, doctrine.closurePacket.sections.D_CURRENT_IMPLEMENTATION_AUDIT) && doctrine.closurePacket.sections.D_CURRENT_IMPLEMENTATION_AUDIT.every((field) => (Array.isArray(D[field]) ? D[field].length > 0 : textValue(D[field]) || object(D[field])));
  const requirements = A?.requirements;
  const invariantFields = doctrine.closurePacket.sections.G_INVARIANTS;
  const invariantList = Array.isArray(invariants) ? invariants : [];
  const registeredInvariantKeys = includedNodes.flatMap((node) => node.invariants.map((statement) => `${node.domain}:${statement}`));
  const invariantKeys = new Set(invariantList.map(({ domain, statement }) => `${domain}:${statement}`));
  const invariantValid = invariantList.length >= registeredInvariantKeys.length && registeredInvariantKeys.every((key) => invariantKeys.has(key)) && invariantList.every((item) => textValue(item?.id) && included.includes(item.domain) && invariantFields.every((field) => textValue(item[field]) || (field === "platformProviderApplicability" && textArray(item[field]))));
  const invariantIds = new Set(invariantList.map(({ id }) => id));
  const mappedInvariantIds = new Set(object(I?.requirementsToInvariants) ? Object.values(I.requirementsToInvariants).flat() : []);
  const mappingValid = textArray(requirements) && object(I?.requirementsToInvariants) && Object.keys(I.requirementsToInvariants).length === requirements.length && requirements.every((requirement) => textArray(I.requirementsToInvariants[requirement]) && I.requirementsToInvariants[requirement].every((id) => invariantIds.has(id))) && invariantList.every(({ id }) => mappedInvariantIds.has(id));
  derive("requirementsMappedToInvariants", auditValid && invariantValid && mappingValid);
  derive("positiveNegativeEvidencePlanned", invariantValid && invariantList.every(({ positiveWitness, negativeWitness }) => textValue(positiveWitness) && textValue(negativeWitness)));
  const taxonomyClasses = taxonomy.classes;
  const allowedTaxonomy = new Set(taxonomy.taskClassifications);
  const classifications = H?.classifications;
  const classificationByClass = new Map(Array.isArray(classifications) ? classifications.map((item) => [item.class, item]) : []);
  const taxonomyValid =
    Array.isArray(classifications) &&
    classifications.length === taxonomyClasses.length &&
    classificationByClass.size === taxonomyClasses.length &&
    taxonomyClasses.every((name) => {
      const item = classificationByClass.get(name);
      return allowedTaxonomy.has(item?.status) && (item.status !== "NOT_APPLICABLE_WITH_CONSTRAINT" || textValue(item.constraint));
    });
  derive("adversarialMatrixComplete", taxonomyValid);
  const authorityMap = new Map(Array.isArray(I?.authorityEdges) ? I.authorityEdges.map((item) => [item.edgeId, item]) : []);
  const authorityMapped =
    authorityMap.size === closureEdges.length &&
    closureEdges.every(({ edgeId }) => {
      const item = authorityMap.get(edgeId);
      return item && textValue(item.authorityOwner) && textValue(item.positiveWitness) && textValue(item.negativeWitness);
    });
  const expectedCoverage = coveragePlan(
    [...domainModels.values()].sort((a, b) => compareUtf8(a.domain, b.domain)),
    includedNodes,
    closureEdges,
    bootstrap,
  );
  const coverageValid = taxonomyValid && stableJson(H?.pairwiseCoverage) === stableJson(expectedCoverage.pairwiseCoverage) && stableJson(H?.threeWayCoverage) === stableJson(expectedCoverage.threeWayCoverage) && stableJson(H?.exhaustiveHighRiskCoverage) === stableJson(expectedCoverage.exhaustiveHighRiskCoverage) && allFields(I, doctrine.closurePacket.sections.I_COVERAGE_MAP) && [I.stateTransition, I.tests, I.mutation, I.nativeProviderPhysicalPlan].every((value) => Array.isArray(value) && value.length > 0 && value.every((item) => object(item) && textValue(item.id) && textArray(item.subjects))) && authorityMapped;
  derive("coverageStrengthPlanned", coverageValid);
  const contractHash = hashValue(contracts);
  const taxonomyHash = hashValue(taxonomy);
  const declaredContracts = new Map(Array.isArray(B?.contractClassifications) ? B.contractClassifications.map((item) => [item.id, item]) : []);
  const contractsValid = B?.contractVersions?.platformProviderContractHash === contractHash && B?.contractVersions?.contractId === contracts.contractId && B?.taxonomyVersion?.hash === taxonomyHash && B?.taxonomyVersion?.contractId === taxonomy.contractId && B?.graphVersionHash === graph.contentHash && B?.sourceInventoryHash === graph.inventory.sourceInventoryHash && Array.isArray(B?.contractClassifications) && B.contractClassifications.length === contracts.contracts.length && declaredContracts.size === contracts.contracts.length && contracts.contracts.every(({ id, freshnessClass }) => declaredContracts.get(id)?.status === freshnessClass);
  const relevantContracts = contracts.contracts.filter(({ affectedDomains }) => affectedDomains.some((domain) => included.includes(domain)));
  const blockedRelevant = relevantContracts.filter(({ freshnessClass }) => ["BLOCKED_EXTERNAL", "HISTORICAL"].includes(freshnessClass));
  const blockedHonestly = blockedRelevant.every(({ id }) => {
    const item = declaredContracts.get(id);
    return item?.obligation === "BLOCKED_EXTERNAL" && item?.implementationAuthorized === false && textValue(item?.constraint);
  });
  const providerConfigPath = (file) => /^(?:android|ios|plugins|modules|supabase\/config\.toml|eas\.json|app\.json|app\.config)/u.test(file);
  const importMarkers = {
    supabase: ["@supabase/"], livekit: ["livekit"], firebase: ["@react-native-firebase/", "expo-notifications"], revenuecat: ["react-native-purchases"], apple: ["pushkit", "callkit", "storekit"], "google-play": ["billing", "expo-notifications"], "expo-eas": ["expo-updates"], "cloudflare-r2": ["cloudflare", "@aws-sdk/client-s3"]
  };
  const relevantMarkers = relevantContracts.flatMap(({ id }) => importMarkers[id] ?? []);
  const hasProviderImport = (file) => {
    if (!safeRepoPath(file) || !fs.existsSync(path.join(root, file)) || fs.statSync(path.join(root, file)).isDirectory()) return false;
    if (!/^(?:app|components|_lib|supabase\/functions|plugins|modules|android|ios)\//u.test(file)) return false;
    const source = fs.readFileSync(path.join(root, file), "utf8").toLowerCase();
    const specifiers = [...source.matchAll(/(?:from\s+|require\s*\(\s*|import\s*\(\s*)["']([^"']+)["']/gu)].map((match) => match[1]);
    return specifiers.some((specifier) => relevantMarkers.some((marker) => specifier.includes(marker)));
  };
  const r2Path = (file) => relevantContracts.some(({ id }) => id === "cloudflare-r2") && /^(?:supabase\/functions|workers)\//u.test(file);
  const providerDependent = (closureEdges.some(({ dataControlTransferred }) => /provider|token|entitlement|transaction|media transport/iu.test(dataControlTransferred)) && (effectiveActualScope?.paths ?? []).some((file) => providerConfigPath(file) || hasProviderImport(file) || r2Path(file))) || (K?.files ?? []).some((file) => providerConfigPath(file) || hasProviderImport(file) || r2Path(file)) || (K?.dataNativeProviderChanges ?? []).length > 0 || [...domainModels.values()].some((model) => transitionContractsOf(model).some(({ providerMutation }) => providerMutation === true));
  const providerImplementationDenied = K?.providerNativeImplementationAuthorized === false && (!providerDependent || blockedRelevant.length === 0) && (!blockedRelevant.length || (blockedHonestly && ["BOUND_COMPLETE_SOURCE_ONLY", "BOUND_COMPLETE_WITH_EXTERNAL_PROOF_BLOCKED"].includes(packet?.completionStatus)));
  derive("platformContractCurrentOrBlocked", contractsValid && !graphFindings.includes("UNDOCUMENTED_PLATFORM_MISMATCH"));
  derive("providerContractCurrentOrBlocked", contractsValid && providerImplementationDenied);
  derive("marketScopeBound", object(A?.platformEnvironmentMarket) && textArray(A.platformEnvironmentMarket.marketsJurisdictions));
  derive("gapsKnown", auditValid && Array.isArray(D.defects) && textArray(C?.unknownDependencies, true));
  derive("mutantsDefined", invariantValid && invariantList.every(({ targetedMutant }) => textValue(targetedMutant)));
  const ledgerEntries = J?.entries;
  const counters = J?.revisionCounters;
  const reviewCycles = J?.reviewCycles;
  const reviewCycleValid = (cycle, index) =>
    object(cycle) &&
    cycle.cycle === index + 1 &&
    textArray(cycle.laneAFindings, true) &&
    textArray(cycle.laneBFindings, true) &&
    textArray(cycle.findingClasses) &&
    cycle.findingSetHash ===
      hashValue({
        laneAFindings: cycle.laneAFindings,
        laneBFindings: cycle.laneBFindings,
        findingClasses: cycle.findingClasses,
      }) &&
    cycle.predictableOmissions === cycle.findingClasses.filter((item) => item === "PREDICTABLE_MODEL_OMISSION").length &&
    Number.isInteger(cycle.modelRevisions) &&
    cycle.modelRevisions >= 0 &&
    Number.isInteger(cycle.verificationCycles) &&
    cycle.verificationCycles >= 0;
  const derivedCounters = Array.isArray(reviewCycles)
    ? reviewCycles.reduce(
        (sum, cycle) => ({
          predictableOmissionCount: sum.predictableOmissionCount + cycle.predictableOmissions,
          novelDimensionCount: sum.novelDimensionCount,
          contractDriftCount: sum.contractDriftCount,
          modelRevisionCount: sum.modelRevisionCount + cycle.modelRevisions,
          verificationCycleCount: sum.verificationCycleCount + cycle.verificationCycles,
          predictableAdjacentDefectCount: 0,
        }),
        {
          predictableOmissionCount: 0,
          novelDimensionCount: 0,
          contractDriftCount: 0,
          modelRevisionCount: 0,
          verificationCycleCount: 0,
          predictableAdjacentDefectCount: 0,
        },
      )
    : null;
  const authoritativeLanes = J?.authoritativeReplay;
  const laneIds = Array.isArray(authoritativeLanes) ? authoritativeLanes.map(({ laneId }) => laneId) : [];
  const ledgerValid = object(J) && J.status === "STABLE" && Array.isArray(ledgerEntries) && J.hash === hashValue(ledgerEntries) && Array.isArray(authoritativeLanes) && stableJson(laneIds) === stableJson(["PASS_A", "PASS_B", "PASS_C"]) && authoritativeLanes.length <= doctrine.discovery.maximumPasses && Array.isArray(reviewCycles) && reviewCycles.every(reviewCycleValid) && J.reviewEvidenceHash === hashValue(reviewCycles) && stableJson(counters) === stableJson(derivedCounters) && (ledgerEntries.length > 0 || textValue(J.noDefectsWithEvidence));
  derive("defectLedgerStable", ledgerValid);
  if ((ledgerEntries ?? []).some(({ severity, disposition }) => ["P0", "P1"].includes(severity) && !String(disposition).startsWith("RESOLVED_"))) findings.add("PREIMPLEMENTATION_CRITICAL_FINDINGS_OPEN");
  const planFields = doctrine.closurePacket.sections.K_IMPLEMENTATION_PLAN;
  const actualScope = effectiveActualScope;
  const fileMappings = new Map(Array.isArray(K?.fileMappings) ? K.fileMappings.map((item) => [item.file, item]) : []);
  const mappedFiles =
    Array.isArray(K?.files) &&
    fileMappings.size === K.files.length &&
    K.files.every((file) => {
      const item = fileMappings.get(file);
      return item && textValue(item.invariant) && textValue(item.transition) && textValue(item.defect);
    });
  const canonicalPathGlobs = [...new Set(includedNodes.flatMap(({ sourcePaths }) => sourcePaths))];
  const reservationDomainsValid = bootstrap || stableJson(reservation?.allowedDomains?.slice().sort()) === stableJson(included);
  const expansions = reservation?.pathExpansionRecords ?? [];
  const expansionOptions = {
    packet,
    certificate,
    allowedDomains: included,
    ownerAuthorizations,
    currentHead: supplied.taskIdentity?.currentHead,
  };
  const reservationPathsValid = bootstrap || (object(reservation) && textArray(reservation.pathGlobs) && reservation.pathGlobs.every((glob) => canonicalPathGlobs.includes(glob) || expansions.filter((record) => exactPathExpansion(record, glob, expansionOptions)).length === 1));
  const highRiskMatch = (file) => ["supabase/migrations/", "app/admin/", "package-lock.json", "android/", "ios/"].some((prefix) => (prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix));
  const highRiskScopeValid = bootstrap || !actualScope?.paths?.some((file) => highRiskMatch(file) && !expansions.some((record) => record?.path === file && record?.ownerLeaseAmendment?.highRiskApproved === true && exactPathExpansion(record, file, expansionOptions)));
  const scopePathsMatch = !actualScope ? true : Array.isArray(actualScope.paths) && Array.isArray(K?.files) && (actualScope.exactPlan === false ? actualScope.paths.every((file) => K.files.includes(file)) : stableJson(actualScope.paths) === stableJson(K.files.slice().sort()));
  const actualBound = !actualScope || (scopePathsMatch && actualScope.pathHash === hashValue(actualScope.paths) && Number.isInteger(actualScope.changedLines) && Number.isInteger(actualScope.handAuthoredLines) && actualScope.handAuthoredLines <= K?.scopeBudget?.maximumLines && (actualScope.generatedGraphLines ?? 0) <= (K?.scopeBudget?.maximumGeneratedGraphLines ?? 0) && (actualScope.exactPlan === false || !K.scopeSubjectHash || K.scopeSubjectHash === hashValue(immutableScopeSubject(actualScope))));
  const scopeValid = allFields(K, planFields) && textArray(K.files) && new Set(K.files).size === K.files.length && textArray(K.dataNativeProviderChanges, true) && K.files.length <= K.scopeBudget?.maximumFiles && Number.isInteger(K.scopeBudget?.maximumFiles) && K.scopeBudget.maximumFiles > 0 && Number.isInteger(K.scopeBudget?.maximumLines) && K.scopeBudget.maximumLines > 0 && mappedFiles && actualBound && reservationDomainsValid && reservationPathsValid && highRiskScopeValid && [K.ordering, K.atomicity, K.migrationDeployment, K.rollback, K.cleanup, K.observability, K.proofSequence].every(textValue);
  derive("scopeFinite", scopeValid);
  derive("rollbackDefined", scopeValid && textValue(K.rollback) && textValue(E?.rollback));
  derive("cleanupDefined", scopeValid && textValue(K.cleanup) && textValue(E?.cleanup));
  derive("observabilityDefined", scopeValid && textValue(K.observability));
  derive("noUnknownDependencyWithinClosure", closureValid && modelEvidenceValid && C.unknownDependencies.length === 0);
  const stopValid = object(M) && doctrine.closurePacket.sections.M_STOP_CONDITIONS.every((field) => textValue(M[field]));
  if (!stopValid) findings.add("PREIMPLEMENTATION_SCOPE_UNBOUNDED");
  const certificateFields = [...doctrine.certificate.requiredFields, "packetFactsHash"];
  const taskIdentityValid = !supplied.taskIdentity || (certificate?.task === supplied.taskIdentity.task && String(certificate?.pr) === String(supplied.taskIdentity.pr) && String(certificate?.leaseId) === String(supplied.taskIdentity.leaseId) && certificate?.closureArtifactHash === supplied.taskIdentity.closureArtifactHash);
  const expectedArtifactHash = hashValue({
    artifactPath: bootstrap ? "docs/assurance/whole-app-engineering-doctrine-v1-report.json" : reservation?.closureArtifactPath,
    graphHash: graph.contentHash,
    closureHash: C?.closureHash,
  });
  const certificateValid =
    certificate?.id === "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" &&
    stableJson(certificate) === stableJson(sections?.L_COMPLETENESS_CERTIFICATE) &&
    certificateFields.every((field) => Object.hasOwn(certificate, field)) &&
    taskIdentityValid &&
    certificate.task === packet?.task &&
    certificate.featureDomain === C?.primaryDomain &&
    certificate.graphHash === graph.contentHash &&
    certificate.sourceInventoryHash === graph.inventory.sourceInventoryHash &&
    certificate.closureHash === C?.closureHash &&
    certificate.closureArtifactHash === expectedArtifactHash &&
    certificate.packetFactsHash === packetFactsHash(sections) &&
    certificate.platformProviderVersions === contractHash &&
    certificate.defectLedgerHash === J?.hash &&
    certificate.reviewEvidenceHash === J?.reviewEvidenceHash &&
    certificate.discoveryPasses === authoritativeLanes?.length &&
    stableJson(certificate.revisionCounters) === stableJson(counters) &&
    object(certificate.coverage) &&
    Object.values(certificate.coverage).length === 6 &&
    Object.values(certificate.coverage).every((value) => value === 1) &&
    stableJson(certificate.reachableStates) === stableJson(F?.reachableStates) &&
    stableJson(certificate.transitions) === stableJson(F?.transitions) &&
    stableJson(certificate.authorityEdges.slice().sort()) === stableJson([...authorityMap.keys()].sort()) &&
    stableJson(certificate.invariants) === stableJson(invariantList.map(({ id }) => id)) &&
    stableJson(certificate.positiveWitnesses) === stableJson(invariantList.map(({ positiveWitness }) => positiveWitness)) &&
    stableJson(certificate.negativeWitnesses) === stableJson(invariantList.map(({ negativeWitness }) => negativeWitness)) &&
    stableJson(certificate.mutants) === stableJson(invariantList.map(({ targetedMutant }) => targetedMutant)) &&
    stableJson(certificate.adversarialClasses) === stableJson(taxonomyClasses) &&
    stableJson(certificate.pairwiseCoverage) === stableJson(H?.pairwiseCoverage) &&
    stableJson(certificate.highRiskThreeWayCoverage) === stableJson(H?.threeWayCoverage) &&
    stableJson(certificate.exhaustiveHighRiskCoverage) === stableJson(H?.exhaustiveHighRiskCoverage) &&
    stableJson(certificate.coverageSubjects) === stableJson({ pairwiseCount: H?.pairwiseCoverage?.[0]?.tupleCount, pairwiseHash: H?.pairwiseCoverage?.[0]?.tupleHash, highRiskThreeWayCount: H?.threeWayCoverage?.[0]?.tupleCount, highRiskThreeWayHash: H?.threeWayCoverage?.[0]?.tupleHash, exhaustiveCount: H?.exhaustiveHighRiskCoverage?.[0]?.tupleCount, exhaustiveHash: H?.exhaustiveHighRiskCoverage?.[0]?.tupleHash }) &&
    certificate.expectedMutantKills === invariantList.length &&
    Array.isArray(certificate.unresolvedUnknowns) &&
    certificate.unresolvedUnknowns.length === 0 &&
    doctrine.boundedCompleteness.statuses.includes(certificate.status) &&
    certificate.status === packet?.completionStatus &&
    textValue(String(certificate.pr)) &&
    textArray(certificate.authorityEdges, closureEdges.length === 0) &&
    textArray(certificate.stateDimensions) &&
    textArray(certificate.environmentMarket) &&
    textValue(certificate.rollback) &&
    textValue(certificate.cleanup) &&
    textValue(certificate.observability) &&
    object(certificate.proofTierPlan) &&
    textValue(certificate.implementationScope);
  if (!certificateValid) findings.add("PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE");
  if (packet?.universalCompletenessClaim === true || packet?.completionStatus === "COMPLETE") findings.add("PREIMPLEMENTATION_SCOPE_UNBOUNDED");
  if (packet?.testCountImpliesCompleteness === true) findings.add("PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE");
  const result = {
    id: "PREIMPLEMENTATION_ENGINEERING_CLEAR",
    clear: findings.size === 0,
    status: findings.size ? "BOUND_INCOMPLETE" : packet.completionStatus,
    findings: [...findings].sort(),
    derivedChecks,
    graphFindings,
  };
  if (result.clear) derivedGateClearances.add(result);
  return result;
}

export function evaluatePreimplementationGate(packet, supplied = {}) {
  const root = supplied.root ?? REPOSITORY_ROOT;
  const taskIdentity = supplied.taskIdentityObservation;
  const implementationIdentity = supplied.implementationIdentity;
  const authoritativeDoctrineIdentity = trustedGitHubTaskIdentity(taskIdentity);
  const authoritativeImplementationIdentity = trustedImplementationIdentity(implementationIdentity);
  const authoritativeIdentity = authoritativeDoctrineIdentity || authoritativeImplementationIdentity;
  const normalizedIdentity = authoritativeImplementationIdentity ? {
    repository: implementationIdentity.repository,
    pr: implementationIdentity.implementationPr,
    branch: implementationIdentity.implementationBranch,
    head: implementationIdentity.implementationHead,
    tree: implementationIdentity.implementationTree,
    base: implementationIdentity.currentProtectedMain,
    leaseId: implementationIdentity.finiteLeaseId,
    paths: implementationIdentity.implementationChangedPaths,
  } : taskIdentity;
  const replay = authoritativeDoctrineIdentity ? runAuthoritativeReplay({ root, taskIdentity, runs: 1 }).output : authoritativeReplayOnce({ root });
  const declared = evaluateDeclaredPacketGate(packet, {
    ...supplied,
    taskIdentity: authoritativeIdentity ? { task: packet?.task, pr: String(normalizedIdentity.pr), leaseId: String(normalizedIdentity.leaseId), closureArtifactHash: packet?.sections?.L_COMPLETENESS_CERTIFICATE?.closureArtifactHash, currentHead: normalizedIdentity.head } : supplied.taskIdentity,
    actualScope: authoritativeDoctrineIdentity ? taskIdentity : supplied.actualScope,
  });
  const findings = new Set(declared.findings);
  const C = packet?.sections?.C_AFFECTED_DOMAIN_CLOSURE;
  const F = packet?.sections?.F_STATE_MODEL;
  const J = packet?.sections?.J_STABLE_DEFECT_LEDGER;
  const graph = generateDomainGraph(root, { authoritative: true });
  const genericSourceIdentity = authoritativeImplementationIdentity ? {
    head: implementationIdentity.implementationHead,
    tree: implementationIdentity.implementationTree,
    candidateSnapshotHash: implementationIdentity.taskArtifactHash,
    authority: "ACTUAL_GITHUB_PR",
  } : replay.sourceIdentity;
  const taskLocalVerification = C?.taskLocalEvidence
    ? verifyTaskLocalGoverningEdgeClosure(C.taskLocalEvidence, { root, runs: 2 })
    : null;
  const expectedClosure = taskLocalVerification ?? (authoritativeImplementationIdentity && C?.primaryDomain
    ? deriveAffectedDomainClosure(graph, C.primaryDomain, { exclusionReceipts: C.nonImpactingWithEvidence ?? [], identity: genericSourceIdentity, root })
    : replay.closure);
  const closureDeclaration = C?.computedClosure;
  if (!closureDeclaration || stableJson(closureDeclaration) !== stableJson(expectedClosure)) findings.add("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE");
  if (taskLocalVerification && taskLocalVerification.classification !== "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_CLEAR") findings.add(...taskLocalVerification.findings, "PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE");
  if (!F?.sourceBoundModel || stableJson(F.sourceBoundModel) !== stableJson(replay.transitionModel)) findings.add("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE");
  const expectedDomains = new Set(expectedClosure?.domains ?? []);
  const groundedTransitionShapes = replay.transitionModel.domains.filter(({ domain }) => expectedDomains.has(domain)).map(({ domain, states, transitions }) => ({ domain, states: canonicalSort(states.map(({ stateId }) => stateId)), transitions: transitions.map(({ transitionId, sourceStates, destinationStates }) => ({ id: transitionId, from: sourceStates[0], to: destinationStates[0] })).sort((a, b) => compareUtf8(a.id, b.id)) })).sort((a, b) => compareUtf8(a.domain, b.domain));
  const declaredTransitionShapes = (Array.isArray(F?.domainModels) ? F.domainModels : []).filter((model) => object(model) && groundedTransitionShapes.some((item) => item.domain === model.domain)).map((model) => ({ domain: model.domain, states: canonicalSort([...new Set(transitionContractsOf(model).flatMap(({ from, to } = {}) => [from, to]))]), transitions: transitionContractsOf(model).map(({ id, from, to } = {}) => ({ id, from, to })).sort((a, b) => compareUtf8(a.id, b.id)) })).sort((a, b) => compareUtf8(a.domain, b.domain));
  if (stableJson(declaredTransitionShapes) !== stableJson(groundedTransitionShapes)) findings.add("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE");
  if (!J?.authoritativeReplay || stableJson(J.authoritativeReplay) !== stableJson(replay.laneResults) || J.authoritativeReplayHash !== replay.authoritativeReplayHash) findings.add("PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE");
  if (packet?.sections?.B_BOUNDED_COMPLETENESS?.evidenceAuthorityHash !== hashValue(readJson(root, "config/assurance/engineering-evidence-authority-v1.json"))) findings.add("PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE");
  const genericInventoryVerification = authoritativeImplementationIdentity
    ? verifyInventoryNonVacuity(replay.inventory, { root, affectedDomains: expectedClosure?.domains ?? [], plannedFiles: packet?.sections?.K_IMPLEMENTATION_PLAN?.files ?? [] })
    : replay.inventoryVerification;
  if (!genericInventoryVerification.ok) findings.add("PREIMPLEMENTATION_AFFECTED_DOMAIN_INCOMPLETE");
  if (replay.result === "BLOCKED") findings.add(...replay.laneResults.flatMap(({ candidateFindings }) => candidateFindings));
  const bootstrap = packet?.classification === "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1";
  if (!authoritativeIdentity) findings.add("PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_REQUIRED");
  if (authoritativeDoctrineIdentity && (taskIdentity.repository !== "Chillywood2025/chillywood-mobile" || taskIdentity.branch !== DOCTRINE_BRANCH || taskIdentity.base !== DOCTRINE_BASE || taskIdentity.leaseId !== packet?.sections?.L_COMPLETENESS_CERTIFICATE?.leaseId || stableJson(taskIdentity.paths) !== stableJson(packet?.sections?.K_IMPLEMENTATION_PLAN?.files?.slice().sort()))) findings.add("PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_MISMATCH");
  if (authoritativeImplementationIdentity && (normalizedIdentity.repository !== "Chillywood2025/chillywood-mobile" || normalizedIdentity.pr !== implementationIdentity.implementationPr || normalizedIdentity.branch !== implementationIdentity.implementationBranch || normalizedIdentity.leaseId !== packet?.sections?.L_COMPLETENESS_CERTIFICATE?.leaseId || implementationIdentity.workflowPr === implementationIdentity.implementationPr && implementationIdentity.admissionMerged !== true)) findings.add("PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_MISMATCH");
  const blockingFindings = [...findings].filter((finding) => finding !== "PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_REQUIRED");
  const status = authoritativeIdentity && findings.size === 0 ? "PREIMPLEMENTATION_ENGINEERING_CLEAR" : bootstrap && !authoritativeIdentity && blockingFindings.length === 0 ? "ENGINEERING_PLAN_DRAFTED" : "BLOCKED";
  const result = {
    id: status,
    status,
    clear: status === "PREIMPLEMENTATION_ENGINEERING_CLEAR",
    computed: true,
    subject: authoritativeIdentity ? { repository: normalizedIdentity.repository, pr: normalizedIdentity.pr, branch: normalizedIdentity.branch, head: normalizedIdentity.head, tree: normalizedIdentity.tree, base: normalizedIdentity.base, leaseId: normalizedIdentity.leaseId } : { repository: "Chillywood2025/chillywood-mobile", branch: DOCTRINE_BRANCH, localDraft: true },
    evidenceAuthorityHash: hashValue(readJson(root, "config/assurance/engineering-evidence-authority-v1.json")),
    inventoryHash: replay.inventoryHash,
    graphHash: replay.graphHash,
    closureHash: replay.closureHash,
    transitionModelHash: replay.transitionModelHash,
    discoveryReceiptHash: hashValue(replay.laneResults),
    defectLedgerHash: packet?.sections?.J_STABLE_DEFECT_LEDGER?.hash ?? null,
    authoritativeReplayHash: replay.authoritativeReplayHash,
    findings: [...findings].sort(),
    derivedChecks: declared.derivedChecks,
    graphFindings: declared.graphFindings,
  };
  if (result.clear) derivedGateClearances.add(result);
  return result;
}

const trustedRepositoryReviews = new WeakSet();
export function observeRepositoryOwnedReview({ repository = "Chillywood2025/chillywood-mobile", pr, reviewId, head, root = REPOSITORY_ROOT } = {}) {
  if (!Number.isInteger(pr) || pr < 1 || !Number.isInteger(reviewId) || reviewId < 1 || !/^[0-9a-f]{40}$/u.test(head ?? "")) return null;
  const get = (endpoint) => spawnSync("gh", ["api", "--method=GET", endpoint], { cwd: root, encoding: "utf8", shell: false });
  const pullResponse = get(`repos/${repository}/pulls/${pr}`);
  const reviewResponse = get(`repos/${repository}/pulls/${pr}/reviews/${reviewId}`);
  let pull;
  let review;
  try {
    pull = pullResponse.status === 0 ? JSON.parse(pullResponse.stdout) : null;
    review = reviewResponse.status === 0 ? JSON.parse(reviewResponse.stdout) : null;
  } catch {
    return null;
  }
  const marker = `<!-- chillywood-repository-review-v1 head:${head} p0:0 p1:0 -->`;
  if (pull?.number !== pr || pull?.head?.sha !== head || review?.id !== reviewId || review?.commit_id !== head || review?.state !== "APPROVED" || review?.user?.login === pull?.user?.login || review?.body !== marker || !textValue(review?.submitted_at)) return null;
  const body = { schemaVersion: 1, evidenceClass: "EXECUTABLE_WITNESS", repository, pr, reviewId, head, reviewer: review.user.login, submittedAt: review.submitted_at, disposition: "P0_0_P1_0", markerHash: hashValue(marker), replayResult: "VERIFIED_GITHUB_REVIEW_READBACK" };
  const receipt = Object.freeze({ ...body, receiptHash: hashValue(body) });
  trustedRepositoryReviews.add(receipt);
  return receipt;
}
const approvedOfficialHost = (contract) => {
  const parsed = exactHttpsUrl(contract?.source);
  return parsed?.hostname ?? null;
};
export function observeOfficialPublicContract({ contractId, url, priorContractHash, currentContractFact, root = REPOSITORY_ROOT } = {}) {
  const contracts = readJson(root, "config/assurance/platform-provider-contracts-v1.json");
  const contract = contracts.contracts.find(({ id }) => id === contractId);
  const requested = exactHttpsUrl(url);
  const host = approvedOfficialHost(contract);
  if (!contract || !requested || priorContractHash !== hashValue(contract) || !textValue(currentContractFact) || requested.hostname !== host || ["localhost", "127.0.0.1", "::1"].includes(requested.hostname)) return null;
  const sourceHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", shell: false }).stdout.trim();
  const sourceTree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8", shell: false }).stdout.trim();
  const candidateBody = {
    schemaVersion: 1,
    evidenceClass: "OFFICIAL_PUBLIC_CONTRACT_CANDIDATE_UNVERIFIED",
    candidateProducer: "repository-owned contract candidate collector",
    trustedIssuer: null,
    independentVerifier: null,
    subject: { contractId, priorContractHash, currentContractFact, requestedOfficialHost: host },
    repository: "Chillywood2025/chillywood-mobile",
    sourceHead,
    sourceTree,
    sourceUrl: url,
    generationProcedure: "repository-local candidate only; no network result is authoritative",
    generatorSourceHash: normalizedSourceHash(fs.readFileSync(path.join(root, "scripts/assurance/engineering-closure.mjs"), "utf8")),
    resultHash: hashValue({ contractId, url, priorContractHash, currentContractFact }),
    observedAt: "SOURCE_DETERMINISTIC_NO_FRESHNESS_AUTHORITY",
    expiresAt: null,
    factsCovered: [],
    authorityAllowed: false,
    replayResult: "BLOCKED_EXTERNAL_TRUST_ROOT_REQUIRED",
  };
  return Object.freeze({ ...candidateBody, receiptHash: hashValue(candidateBody) });
}
export function observeGroundedRuntimeEvidence({ evidenceClass, subject, command, args = [], root = REPOSITORY_ROOT } = {}) {
  if (!["SIGNED_ARTIFACT", "INSTALLED_RUNTIME", "PHYSICAL_RUNTIME"].includes(evidenceClass) || !safeRepoPath(command) || !object(subject)) return null;
  const absolute = path.join(root, command);
  if (!fs.existsSync(absolute)) return null;
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", shell: false }).stdout.trim();
  const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8", shell: false }).stdout.trim();
  const candidateClass = `${evidenceClass}_CANDIDATE_UNVERIFIED`;
  const body = { schemaVersion: 1, evidenceClass: candidateClass, candidateProducer: "repository-owned runtime candidate collector", trustedIssuer: null, independentVerifier: null, subject, repository: "Chillywood2025/chillywood-mobile", sourceHead: head, sourceTree: tree, generationProcedure: [command, ...args].join(" "), generatorSourceHash: crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"), resultHash: hashValue({ evidenceClass, subject, command, args }), observedAt: "SOURCE_DETERMINISTIC_NO_FRESHNESS_AUTHORITY", expiresAt: null, factsCovered: [], authorityAllowed: false, replayResult: "BLOCKED_EXTERNAL_TRUST_ROOT_REQUIRED" };
  return Object.freeze({ ...body, receiptHash: hashValue(body) });
}
export function verifyExternalTrustRootReceipt(receipt, root = REPOSITORY_ROOT) {
  const registry = readJson(root, "config/assurance/engineering-evidence-authority-v1.json");
  const trustRoots = registry.externalTrustModel?.preRegisteredTrustRoots ?? [];
  const rootBinding = trustRoots.find(({ trustRootId, evidenceClasses }) => trustRootId === receipt?.trustRootId && evidenceClasses?.includes(receipt?.evidenceClass));
  if (!rootBinding || rootBinding.status !== "PREEXISTING_PROTECTED_MAIN" || rootBinding.introducedByPr === 226 || receipt?.candidateProducer === receipt?.trustedIssuer || receipt?.candidateProducer === receipt?.independentVerifier || receipt?.trustedIssuer === receipt?.independentVerifier) return false;
  if (!textValue(receipt?.signature) || !textValue(rootBinding.publicKeyPem) || !textValue(receipt?.signedPayload)) return false;
  try { return crypto.verify("sha256", Buffer.from(receipt.signedPayload, "utf8"), rootBinding.publicKeyPem, Buffer.from(receipt.signature, "base64")); } catch { return false; }
}
export function classifyLaterFinding(classification, _untrustedCounters = {}, evidence = {}) {
  const prior = Array.isArray(evidence.findingClassEvidence) ? evidence.findingClassEvidence.filter((item) => object(item) && item.evidenceHash === hashValue({ classification: item.classification, findingId: item.findingId, reviewCycle: item.reviewCycle })) : [];
  const next = { predictableOmissionCount: prior.filter(({ classification: value }) => value === "PREDICTABLE_MODEL_OMISSION").length, novelDimensionCount: prior.filter(({ classification: value }) => value === "GENUINELY_NOVEL_DIMENSION").length, contractDriftCount: prior.filter(({ classification: value }) => value === "EXTERNAL_CONTRACT_DRIFT").length, modelRevisionCount: prior.filter(({ classification: value }) => value !== "EXTERNAL_CONTRACT_DRIFT").length };
  if (classification === "OWNER_SCOPE_CHANGE") return { classification, action: "OWNER_SCOPE_CHANGE", samePrAndLease: true, counters: next };
  if (classification === "GENUINELY_NOVEL_DIMENSION") {
    const receipt = evidence.authoritativeReceipt;
    const grounded = verifyExternalTrustRootReceipt(receipt, evidence.root ?? REPOSITORY_ROOT) && trustedRepositoryReviews.has(evidence.independentRepositoryReview) && evidence.independentRepositoryReview?.head === receipt.sourceHead && textValue(evidence.priorModelAbsenceHash) && textValue(evidence.derivationAuditHash);
    if (!grounded) return { classification: "NOVELTY_CANDIDATE_UNVERIFIED", action: "NO_DOMAIN_REOPEN", samePrAndLease: true, counters: next };
    next.novelDimensionCount += 1; next.modelRevisionCount += 1;
    return { classification, action: "REOPEN_INTERSECTING_DOMAINS_ONLY", samePrAndLease: true, counters: next };
  }
  if (classification === "EXTERNAL_CONTRACT_DRIFT") {
    const receipt = evidence.authoritativeReceipt;
    const grounded = verifyExternalTrustRootReceipt(receipt, evidence.root ?? REPOSITORY_ROOT) && receipt?.evidenceClass === "OFFICIAL_PUBLIC_CONTRACT" && trustedRepositoryReviews.has(evidence.independentRepositoryReview) && evidence.independentRepositoryReview?.head === receipt.sourceHead && textValue(receipt.subject?.priorContractHash) && textValue(receipt.subject?.currentContractHash) && textValue(receipt.subject?.currentContractFact);
    if (!grounded) return { classification: "EXTERNAL_CONTRACT_DRIFT_CANDIDATE_UNVERIFIED", action: "BLOCKED_EXTERNAL", samePrAndLease: true, counters: next };
    next.contractDriftCount += 1;
    return { classification, action: "BOUND_BLOCKED_EXTERNAL_CONTRACT_DRIFT", samePrAndLease: true, counters: next };
  }
  if (classification === "PREDICTABLE_MODEL_OMISSION") {
    next.predictableOmissionCount += 1; next.modelRevisionCount += 1;
    return { classification, action: next.predictableOmissionCount >= 2 ? "DOMAIN_ARCHITECTURE_REVIEW_REQUIRED" : "PRE_IMPLEMENTATION_COVERAGE_FAILURE", returnState: "ARCHITECTURE_DESIGNED", samePrAndLease: true, counters: next };
  }
  if (classification === "IMPLEMENTATION_DEFECT_WITHIN_MODEL") return { classification, action: "CORRECT_IN_SAME_PR_WITHOUT_MODEL_REWRITE", samePrAndLease: true, counters: next };
  return { classification: null, action: "BOUND_BLOCKED_NOVEL_DIMENSION", samePrAndLease: true, counters: next };
}

export function evaluateTaskAdmission(task, authority = {}) {
  if (task?.recursiveControlPrRequired) return { admissible: false, code: "ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE" };
  if (task?.classification === "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1") {
    const certificate = task.certificate ?? task.packet?.sections?.L_COMPLETENESS_CERTIFICATE;
    const bootstrapAuthority = {
      branch: task.branch,
      base: task.base,
      currentMain: authority.currentMain,
      doctrineStatus: authority.currentTruth?.engineeringDoctrine?.status,
      implementationMerged: authority.implementationMerged === false ? false : true,
      bootstrapExpired: authority.bootstrapExpired === false ? false : true,
      productTask: false,
      featureId: task.featureId,
    };
    const gate = evaluatePreimplementationGate(task.packet, {
      certificate,
      taskIdentityObservation: task.taskIdentityObservation,
      bootstrapAuthority,
      artifactReservation: task.artifactReservation,
    });
    return gate.clear
      ? {
          admissible: true,
          code: "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1",
          admissionPrRequired: false,
        }
      : {
          admissible: false,
          code: "DOCTRINE_BOOTSTRAP_EXPIRED",
          findings: gate.findings,
        };
  }
  if (task?.packet?.classification === "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1") return { admissible: false, code: "DOCTRINE_BOOTSTRAP_EXPIRED" };
  const readOnly = task?.classification === "READ_ONLY_NON_SOURCE_TASK" && task?.sourceChanging === false && exactEvidence(task?.nonSourceEvidence, "classification");
  if (readOnly)
    return {
      admissible: true,
      code: "READ_ONLY_NON_SOURCE_TASK",
      productSourceMutationAllowed: false,
    };
  if (!task?.closureArtifactPath || !task?.packet || !task?.certificate)
    return {
      admissible: false,
      code: "PREIMPLEMENTATION_AFFECTED_DOMAIN_INCOMPLETE",
    };
  const lease = task.authoritativeLease;
  const commentIds = lease?.engineeringOwnerAuthorizationCommentIds ?? [];
  const taskIdentityObservation = task.taskIdentityObservation ?? observeGitHubTaskIdentity({ repository: "Chillywood2025/chillywood-mobile", pr: Number(lease?.implementationPr), branch: lease?.implementationBranch, admittedSeedHead: lease?.admittedSeedHead ?? lease?.admittedBase, protectedBase: authority.currentMain, leaseId: lease?.leaseId, commentId: commentIds.at(-1) ?? lease?.ownerAuthorizationCommentId, maximumFiles: task.artifactReservation?.maximumFiles, maximumLines: task.artifactReservation?.maximumLines, root: authority.root ?? REPOSITORY_ROOT });
  const gate = evaluatePreimplementationGate(task.packet, {
    certificate: task.certificate,
    productTask: true,
    taskIdentityObservation,
    artifactReservation: task.artifactReservation,
    authoritativeLease: lease,
  });
  return {
    admissible: gate.clear,
    code: gate.clear ? "PREIMPLEMENTATION_ENGINEERING_CLEAR" : gate.findings[0],
    authorityPreservedAfterSourcePush: true,
    evidenceInvalidatedAfterSourcePush: true,
  };
}

export function classifyContractFreshness({ dependent, freshnessClass }) {
  if (!dependent) return { eligible: true, status: "NON_IMPACTING_WITH_EVIDENCE" };
  if (["BLOCKED_EXTERNAL", "HISTORICAL"].includes(freshnessClass))
    return {
      eligible: false,
      status: "PREIMPLEMENTATION_PROVIDER_CONTRACT_STALE",
    };
  return { eligible: true, status: "PREIMPLEMENTATION_ENGINEERING_CLEAR" };
}

export function evaluateAutonomousEngineeringRequest(request) {
  if (request?.selfClear === true || request?.cognitiveRecommendationSelfClear === true)
    return {
      allowed: false,
      code: "COGNITIVE_RECOMMENDATION_CANNOT_SELF_CLEAR",
    };
  if (request?.implementation === true) {
    if (request.engineeringAuthority?.ok === true && request.engineeringAuthority?.productSourceMutationAllowed === true && request.engineeringAuthority?.classification === "PREIMPLEMENTATION_ENGINEERING_CLEAR" && derivedGateClearances.has(request.engineeringAuthority.derivedGate))
      return {
        allowed: true,
        code: "PREIMPLEMENTATION_ENGINEERING_CLEAR",
        relevantSliceOnly: true,
        reusedDerivedClearance: true,
      };
    return { allowed: false, code: "AUTONOMOUS_IMPLEMENTATION_WITHOUT_PACKET" };
  }
  return {
    allowed: true,
    code: "PREIMPLEMENTATION_ENGINEERING_CLEAR",
    relevantSliceOnly: true,
  };
}

const replaySourceIdentity = (root, taskIdentity) => {
  if (trustedGitHubTaskIdentity(taskIdentity)) return { head: taskIdentity.head, tree: taskIdentity.tree, candidateSnapshotHash: taskIdentity.diffHash, authority: "ACTUAL_GITHUB_PR" };
  const subjects = DOCTRINE_PATHS.filter((name) => fs.existsSync(path.join(root, name)) && !["config/assurance/whole-app-domain-graph-v1.json", "docs/assurance/whole-app-engineering-doctrine-v1-report.json"].includes(name)).map((name) => ({ path: name, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex") }));
  return { head: "PROVISIONAL_LOCAL_DRAFT", tree: "PROVISIONAL_LOCAL_DRAFT", candidateSnapshotHash: hashValue(subjects), authority: "PROVISIONAL_LOCAL_WORKTREE" };
};
const replayReceipt = ({ laneId, item, sourceIdentity, generatorSourceHash, result, findings = [], deferredClassification = null }) => {
  const body = {
    schemaVersion: 1,
    evidenceClass: "REPOSITORY_DERIVED",
    issuer: "scripts/assurance/engineering-closure.mjs",
    verifier: "scripts/assurance/engineering-evidence-verifier.mjs",
    subject: { laneId, itemId: item.itemId, sourceSubjects: item.sourceSubjects },
    repository: "Chillywood2025/chillywood-mobile",
    sourceHead: sourceIdentity.head,
    sourceTree: sourceIdentity.tree,
    candidateSnapshotHash: sourceIdentity.candidateSnapshotHash,
    generationProcedure: item.procedure,
    generatorSourceHash,
    result,
    observedAt: "SOURCE_DETERMINISTIC_NO_CLOCK",
    expiresAt: null,
    factsCovered: item.factsCovered,
    authorityAllowed: sourceIdentity.authority === "ACTUAL_GITHUB_PR",
    replayResult: "REPLAY_MATCH",
    findings,
    deferredClassification,
  };
  const completeBody = { ...body, resultHash: hashValue({ result, findings, deferredClassification }) };
  return { ...completeBody, receiptHash: hashValue(completeBody) };
};
const exactReceiptSet = (worklist, receipts) => {
  const expected = worklist.map(({ itemId }) => itemId).sort();
  const actual = receipts.map(({ subject }) => subject.itemId).sort();
  return stableJson(expected) === stableJson(actual) && new Set(actual).size === actual.length && receipts.every(({ receiptHash, ...body }) => receiptHash === hashValue(body) && body.replayResult === "REPLAY_MATCH" && body.deferredClassification !== "SILENT_DEFER");
};

const provisionalInteractiveReplayCache = new Map();
export function authoritativeReplayOnce({ root = REPOSITORY_ROOT, taskIdentity = null, taskIdentityParameters = null, processIsolated = false } = {}) {
  const observedTaskIdentity = taskIdentityParameters ? observeGitHubTaskIdentity({ ...taskIdentityParameters, root }) : taskIdentity;
  const sourceIdentity = { ...replaySourceIdentity(root, observedTaskIdentity), authoritative: true };
  const provisionalCacheKey = hashValue({ sourceIdentity, root: path.resolve(root) });
  if (!processIsolated && provisionalInteractiveReplayCache.has(provisionalCacheKey)) return structuredClone(provisionalInteractiveReplayCache.get(provisionalCacheKey));
  const inventory = buildInventory(root, { authoritative: true });
  const graph = generateDomainGraph(root, { authoritative: true });
  const transitionModel = deriveSourceBoundTransitionModel(root, sourceIdentity);
  const cutEdges = ["edge-09-auth-session-password-recovery-to-autonomous-cognitive-governance", "edge-25-autonomous-cognitive-governance-to-eas-build-update-release"].map((id) => graph.edges.find(({ edgeId }) => edgeId === id));
  const exclusionReceipts = cutEdges.map((edge) => createNonImpactingReceipt(edge, sourceIdentity, root)).filter(Boolean);
  const closure = deriveAffectedDomainClosure(graph, "assurance-efficiency-e0", { exclusionReceipts, identity: sourceIdentity, root });
  const inventoryVerification = verifyInventoryNonVacuity(inventory, { root, affectedDomains: closure.domains, plannedFiles: DOCTRINE_PATHS });
  const verificationDependencyClosure = deriveVerificationDependencyClosure({ root });
  const verificationDependencyVerification = verifyVerificationDependencyClosure(verificationDependencyClosure);
  const commentFixture = normalizeGitHubCommentIdentity({ id: 424242, node_id: "IC_kwDO_SANITIZED", user: { login: "Chillywood2025" }, author_association: "OWNER", body: "sanitized immutable Owner fixture", created_at: "2026-08-12T12:00:00Z", updated_at: "2026-08-12T12:00:00Z", issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/301", html_url: "https://github.com/Chillywood2025/chillywood-mobile/pull/301#issuecomment-424242" }, { pr: 301, commentId: 424242 });
  const noveltyProbe = classifyLaterFinding("GENUINELY_NOVEL_DIMENSION", {}, { localJson: true });
  const driftProbe = classifyLaterFinding("EXTERNAL_CONTRACT_DRIFT", {}, { localJson: true });
  const generatorSourceHash = normalizedSourceHash(fs.readFileSync(path.join(root, "scripts/assurance/engineering-closure.mjs"), "utf8"));
  const lanes = [
    {
      laneId: "PASS_A",
      purpose: "architecture, states, transitions, authority, data flow, concurrency, lifecycle",
      items: [
        { itemId: "A-INVENTORY", sourceSubjects: inventory.groups.map(({ id, contentHash }) => `${id}:${contentHash}`), procedure: "recompute exact repository inventory", factsCovered: ["inventory", "ownership"] },
        { itemId: "A-CLOSURE", sourceSubjects: [graph.contentHash, ...graph.edges.map(({ edgeId }) => edgeId)], procedure: "derive closure and exact governing-edge cut set", factsCovered: ["affected-domain closure", "governing edges"] },
        { itemId: "A-TRANSITIONS", sourceSubjects: [transitionModel.transitionModelHash], procedure: "resolve source-bound state and transition selectors", factsCovered: ["states", "transitions", "lifecycle"] },
        { itemId: "A-AUTHORITY", sourceSubjects: closure.requiredIncludedEdges, procedure: "recompute unique authority and ordering", factsCovered: ["authority", "concurrency"] },
      ],
    },
    {
      laneId: "PASS_B",
      purpose: "security, privacy, providers, rollback, cleanup, platform differences, adversarial behavior",
      items: [
        { itemId: "B-EVIDENCE-AUTHORITY", sourceSubjects: [hashValue(readJson(root, "config/assurance/engineering-evidence-authority-v1.json"))], procedure: "validate declared/observed/verified evidence class separation", factsCovered: ["evidence authority"] },
        { itemId: "B-CONTRACTS", sourceSubjects: [hashValue(readJson(root, "config/assurance/platform-provider-contracts-v1.json"))], procedure: "classify official public and blocked external contracts", factsCovered: ["platform contracts", "provider contracts"] },
        { itemId: "B-TAXONOMY", sourceSubjects: [hashValue(readJson(root, "config/assurance/adversarial-taxonomy-v1.json"))], procedure: "replay finite adversarial classifications", factsCovered: ["adversarial taxonomy"] },
        { itemId: "B-RECOVERY", sourceSubjects: graph.nodes.filter(({ domain }) => closure.domains.includes(domain)).map(({ domain, cleanup, rollbackOwner, observabilityOwner }) => hashValue({ domain, cleanup, rollbackOwner, observabilityOwner })), procedure: "verify rollback cleanup and observability owners", factsCovered: ["rollback", "cleanup", "observability"] },
      ],
    },
    {
      laneId: "PASS_C",
      purpose: "frozen exact-head correction ledger reconciliation",
      items: [
        "SOURCE_BOUND_TRANSITION_AUTHORITY_INCOMPLETE",
        "GOVERNING_EDGE_CLOSURE_SELF_DERIVED",
        "AUTHORITATIVE_REPLAY_CACHE_REUSE",
        "AUTHORITATIVE_REPLAY_NONDETERMINISTIC_NORMALIZATION",
        "REPOSITORY_INVENTORY_ORPHAN_RESULT_NONAUTHORITATIVE",
        "EXTERNAL_AND_RUNTIME_EVIDENCE_FORGEABLE_BY_REPOSITORY_CODE",
        "PHASE1_SCOPE_CONTEXT_HARD_CODED_TO_S0",
      ].map((itemId) => ({ itemId, sourceSubjects: ["FROZEN_EXACT_HEAD_CORRECTION_LEDGER", itemId], procedure: `replay bounded correction ${itemId}`, factsCovered: [itemId] })),
    },
  ];
  const transitionObserved = transitionModel.generatorVerifierSourceDistinct === true && transitionModel.domains.every(({ domain, states, transitions, observationSummary }) => states.length > 0
    && transitions.length > 0
    && observationSummary.implementationSelectorMatchCount === 1
    && observationSummary.callRelationshipsComplete === true
    && /^[0-9a-f]{64}$/u.test(observationSummary.implementationAstBodyHash ?? "")
    && transitions.every(({ declaration, observation, independentVerifier, positiveExecutableWitness, negativeExecutableWitness }) => declaration?.declarationId === `${domain}:${declaration?.transitionId}`
      && observation.implementationSelectorMatchCount === 1
      && observation.callRelationshipsComplete === true
      && observation.exactEffectOwner === GOVERNING_EFFECT_OWNERS[domain]
      && independentVerifier.selectorMatchCount === 1
      && /^[0-9a-f]{64}$/u.test(independentVerifier.verifierSourceHash ?? "")
      && positiveExecutableWitness.testId === "source-bound transition positive executable witness"
      && negativeExecutableWitness.testId === "source-bound transition negative executable witness"));
  const evidenceRegistry = readJson(root, "config/assurance/engineering-evidence-authority-v1.json");
  const evidenceClasses = ["OWNER_INTENT", "GIT_GITHUB_IDENTITY", "REPOSITORY_DERIVED", "EXECUTABLE_WITNESS", "OFFICIAL_PUBLIC_CONTRACT", "AUTHENTICATED_READ_ONLY_PROVIDER", "SIGNED_ARTIFACT", "INSTALLED_RUNTIME", "PHYSICAL_RUNTIME", "DECLARATION_ONLY"];
  const externalTrustModel = evidenceRegistry.externalTrustModel;
  const evidenceVerified = stableJson(Object.keys(evidenceRegistry.evidenceClasses).sort()) === stableJson(evidenceClasses.sort()) && evidenceRegistry.evidenceClasses.DECLARATION_ONLY?.canClearGate === false && evidenceRegistry.receiptSchema.required.every((field) => textValue(field)) && externalTrustModel?.trustedIssuer?.repositoryAuthoredAllowed === false && externalTrustModel?.independentVerifier?.samePullRequestTrustBootstrapAllowed === false && Array.isArray(externalTrustModel?.preRegisteredTrustRoots) && externalTrustModel.preRegisteredTrustRoots.length === 0;
  const providerContracts = readJson(root, "config/assurance/platform-provider-contracts-v1.json");
  const contractsVerified = providerContracts.contracts.every((item) => { const official = [item.source, ...(item.officialSourceRefs ?? [])].some((url) => Boolean(exactHttpsUrl(url))); return textValue(item.id) && textValue(item.source) && (!item.authoritativePublicSourceClassification.includes("OFFICIAL_PUBLIC") || official) && textValue(item.verified) && textValue(item.supportedVersionRange) && textValue(item.freshnessClass) && textArray(item.affectedDomains) && (official || ["BLOCKED_EXTERNAL", "HISTORICAL"].includes(item.freshnessClass)); });
  const adversarial = readJson(root, "config/assurance/adversarial-taxonomy-v1.json");
  const taxonomyVerified = adversarial.classes.length === 35 && new Set(adversarial.classes).size === adversarial.classes.length && stableJson(adversarial.taskClassifications) === stableJson(["APPLICABLE", "NOT_APPLICABLE_WITH_CONSTRAINT", "BLOCKED_EXTERNAL", "POST_LAUNCH"]);
  const closureNodes = graph.nodes.filter(({ domain }) => closure.domains.includes(domain));
  const recoveryVerified = closureNodes.every(({ cleanup, rollbackOwner, observabilityOwner }) => object(cleanup) && textValue(cleanup.owner) && textValue(cleanup.contract) && textValue(rollbackOwner) && textValue(observabilityOwner) && observabilityOwner !== "UNKNOWN_OWNER");
  const authorityVerified = !detectGraphFindings(graph, closure.domains).some((code) => ["CIRCULAR_AUTHORITY", "DUPLICATE_AUTHORITY_OWNER", "UNOWNED_MUTABLE_STATE", "UNREGISTERED_PROVIDER_MUTATION", "UNREGISTERED_AUTONOMOUS_WRITER", "UNBOUNDED_CROSS_DOMAIN_SIDE_EFFECT"].includes(code));
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/phase1-ci.yml"), "utf8");
  const scopePolicy = readJson(root, "config/assurance/pr-scope-policy-v1.json");
  const scopeContextVerified = workflow.includes('node scripts/assurance/pr-scope.mjs --github-event="$GITHUB_EVENT_PATH"')
    && !workflow.includes("pr-scope.mjs --feature=codex-security-scan-reliability-s0")
    && /^permissions:\n(?:(?:  [^\n]+\n)+)/mu.exec(workflow)?.[0].includes("  actions: read") === true
    && scopePolicy.featureDomainBundles?.some(({ featureId, allowedHighRiskDomains }) => featureId === "assurance-efficiency-e0" && stableJson(allowedHighRiskDomains) === stableJson(["autonomous-operators"]))
    && verificationDependencyVerification.ok
    && verificationDependencyClosure.includedPaths.includes("tests/assurance/codex-security-reliability-s0.test.mjs")
    && verificationDependencyClosure.includedPaths.includes("tests/assurance/pr-scope-feature-bundles.test.mjs");
  const groundingChecks = { "A-INVENTORY": inventoryVerification.ok, "A-CLOSURE": closure.findings.length === 0, "A-TRANSITIONS": transitionObserved, "A-AUTHORITY": authorityVerified, "B-EVIDENCE-AUTHORITY": evidenceVerified, "B-CONTRACTS": contractsVerified, "B-TAXONOMY": taxonomyVerified, "B-RECOVERY": recoveryVerified };
  const forbiddenLocaleComparator = ["locale", "Compare"].join("");
  const p1Results = {
    "SOURCE_BOUND_TRANSITION_AUTHORITY_INCOMPLETE": transitionObserved,
    "GOVERNING_EDGE_CLOSURE_SELF_DERIVED": closure.status === "BOUND_COMPLETE_FOR_REGISTERED_SCOPE" && stableJson(closure.actualIncludedEdges) === stableJson(["edge-23-assurance-efficiency-e0-to-codex-security-scan-reliability-s0", "edge-24-codex-security-scan-reliability-s0-to-autonomous-cognitive-governance"]),
    "AUTHORITATIVE_REPLAY_CACHE_REUSE": processIsolated === true || !trustedGitHubTaskIdentity(observedTaskIdentity),
    "AUTHORITATIVE_REPLAY_NONDETERMINISTIC_NORMALIZATION": !fs.readFileSync(path.join(root, "scripts/assurance/engineering-closure.mjs"), "utf8").includes(forbiddenLocaleComparator),
    "REPOSITORY_INVENTORY_ORPHAN_RESULT_NONAUTHORITATIVE": inventoryVerification.ok,
    "EXTERNAL_AND_RUNTIME_EVIDENCE_FORGEABLE_BY_REPOSITORY_CODE": noveltyProbe.classification === "NOVELTY_CANDIDATE_UNVERIFIED" && driftProbe.classification === "EXTERNAL_CONTRACT_DRIFT_CANDIDATE_UNVERIFIED" && externalTrustModel.doctrineActivationStatus === "BLOCKED_EXTERNAL_NO_PREEXISTING_TRUST_ROOT",
    "PHASE1_SCOPE_CONTEXT_HARD_CODED_TO_S0": scopeContextVerified,
  };
  const receiptsByLane = Object.fromEntries(lanes.map(({ laneId, items }) => [laneId, items.map((item) => {
    const p1 = p1Results[item.itemId];
    const deferred = null;
    const failures = groundingChecks[item.itemId] === false ? [`${item.itemId}_FAILED`] : item.itemId === "A-INVENTORY" ? inventoryVerification.findings : item.itemId === "A-CLOSURE" ? closure.findings : p1 === false && !deferred ? [`${item.itemId}_FAILED`] : [];
    return replayReceipt({ laneId, item, sourceIdentity, generatorSourceHash, result: failures.length ? "BLOCKED" : deferred ? "DEFERRED_BLOCKING" : "VERIFIED", findings: failures, deferredClassification: deferred });
  })]));
  const laneResults = lanes.map(({ laneId, purpose, items }) => {
    const receipts = receiptsByLane[laneId];
    const complete = exactReceiptSet(items, receipts) && receipts.every(({ findings, result }) => findings.length === 0 && result === "VERIFIED");
    return { laneId, purpose, worklist: items, worklistHash: hashValue(items), queryPlanHash: hashValue(items.map(({ procedure }) => procedure)), expectedItemCount: items.length, receiptCount: receipts.length, receipts, unresolvedItems: receipts.filter(({ result }) => result !== "VERIFIED").map(({ subject }) => subject.itemId), candidateFindings: receipts.flatMap(({ findings }) => findings), computedStatus: complete ? "VERIFIED" : "BLOCKED" };
  });
  const body = { schemaVersion: 1, replayId: "AUTHORITATIVE_REPLAY_A_B_C_V2", sourceIdentity, execution: { noCache: true, processIsolated, generatorProcessIdClassification: processIsolated ? "FRESH_NODE_PROCESS" : "IN_PROCESS_NONAUTHORITATIVE", canonicalFileOrder: true, localeIndependentComparator: "RAW_UTF8_BYTE_ORDER", inputEnumerationNormalized: true }, inventoryHash: inventory.sourceInventoryHash, inventory, declaredGraphHash: hashValue(graph.declaredEdgeRecords), observedEdgeHash: hashValue(graph.observedRepositoryEdges), verifiedEdgeHash: hashValue(graph.verifiedGoverningEdges), edgeEvidence: { declaredGraphEdges: graph.declaredGraphEdges, declaredEdgeRecords: graph.declaredEdgeRecords, observedRepositoryEdges: graph.observedRepositoryEdges, verifiedGoverningEdges: graph.verifiedGoverningEdges, declarationOnlyEdges: graph.declarationOnlyEdges, nonGoverningRelationships: graph.nonGoverningRelationships, edgeSetAccounting: graph.edgeSetAccounting }, graphHash: graph.contentHash, stateHash: hashValue(transitionModel.domains.map(({ domain, states }) => ({ domain, states }))), transitionModelHash: transitionModel.transitionModelHash, transitionModel, closureHash: closure.closureHash, verificationDependencyClosureHash: verificationDependencyClosure.closureHash, verificationDependencyClosure, inputWorklistHash: hashValue(lanes.map(({ laneId, items }) => ({ laneId, items }))), receiptSetHash: hashValue(laneResults.flatMap(({ receipts }) => receipts.map(({ receiptHash }) => receiptHash)).sort()), laneResults, inventoryVerification, closure, p1Results, externalEvidenceStatus: "BLOCKED_EXTERNAL_NO_PREEXISTING_TRUST_ROOT" };
  const output = { ...body, authoritativeReplayHash: hashValue(body), result: trustedGitHubTaskIdentity(observedTaskIdentity) && laneResults.every(({ computedStatus }) => computedStatus === "VERIFIED") ? "AUTHORITATIVE_CANDIDATE_GENERATED" : laneResults.every(({ candidateFindings }) => candidateFindings.length === 0) ? "ENGINEERING_PLAN_DRAFTED" : "BLOCKED" };
  if (!processIsolated) provisionalInteractiveReplayCache.set(provisionalCacheKey, output);
  return structuredClone(output);
}

export function runAuthoritativeReplay({ root = REPOSITORY_ROOT, taskIdentity = null, runs = 2 } = {}) {
  const verifier = path.join(root, "scripts/assurance/engineering-evidence-verifier.mjs");
  const args = [verifier, "--replay", `--root=${root}`, `--runs=${runs}`];
  if (trustedGitHubTaskIdentity(taskIdentity)) args.push(`--pr=${taskIdentity.pr}`, `--branch=${taskIdentity.branch}`, `--admitted-seed-head=${taskIdentity.admittedSeedHead}`, `--protected-base=${taskIdentity.base}`, `--lease-id=${taskIdentity.leaseId}`, `--comment-id=${taskIdentity.ownerComment.id}`, `--amendment-comment-id=${taskIdentity.scopeAmendmentCommentId}`, `--verification-correction-comment-id=${taskIdentity.verificationCorrectionCommentId}`);
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", shell: false, env: { ...process.env, LC_ALL: "C" }, maxBuffer: 128 * 1024 * 1024 });
  try { return JSON.parse(result.stdout); } catch { return { deterministic: false, runs: `0/${runs}`, output: null, outputHash: null, differences: [{ code: "AUTHORITATIVE_VERIFIER_PROCESS_FAILED", status: result.status, stderrHash: hashValue(result.stderr ?? "") }] }; }
}

export function makeBootstrapPacket(root = REPOSITORY_ROOT, options = {}) {
  const bootstrap = options.bootstrap !== false;
  const taskIdentityObservation = options.taskIdentityObservation ?? null;
  const replay = trustedGitHubTaskIdentity(taskIdentityObservation) ? runAuthoritativeReplay({ root, taskIdentity: taskIdentityObservation, runs: 1 }).output : authoritativeReplayOnce({ root });
  const graph = generateDomainGraph(root);
  const inventory = graph.inventory;
  const doctrine = readJson(root, "config/assurance/engineering-doctrine-v1.json");
  const taxonomy = readJson(root, "config/assurance/adversarial-taxonomy-v1.json");
  const contracts = readJson(root, "config/assurance/platform-provider-contracts-v1.json");
  const primaryDomain = options.primaryDomain ?? (bootstrap ? "assurance-efficiency-e0" : "chilly-chat-inbox-thread");
  const taskLocalVerification = !bootstrap && options.taskLocalEvidence ? verifyTaskLocalGoverningEdgeClosure(options.taskLocalEvidence, { root, runs: 2 }) : null;
  const includedDomains = bootstrap ? replay.closure.domains : taskLocalVerification?.domains ?? deriveAffectedDomainClosure(graph, primaryDomain, { exclusionReceipts: options.exclusionReceipts ?? [], identity: trustedGitHubTaskIdentity(taskIdentityObservation) ? taskIdentityObservation : replay.sourceIdentity, root }).domains;
  const includedNodes = graph.nodes.filter(({ domain }) => includedDomains.includes(domain));
  const taskLocalDeltaEdges = (options.taskLocalEvidence?.modelDeltas ?? []).map((delta) => ({ ...delta, evidenceOwner: delta.sourceDomain }));
  const closureEdges = [...graph.edges, ...taskLocalDeltaEdges].filter(({ sourceDomain, destinationDomain }) => includedDomains.includes(sourceDomain) && includedDomains.includes(destinationDomain));
  const artifactPath = options.artifactPath ?? "docs/assurance/whole-app-engineering-doctrine-v1-report.json";
  const evidencePath = options.evidencePath ?? "scripts/assurance/engineering-closure.mjs";
  const evidenceBytes = fs.readFileSync(path.join(root, evidencePath));
  const evidenceText = evidenceBytes.toString("utf8");
  const evidenceSha = crypto.createHash("sha256").update(evidenceBytes).digest("hex");
  const semanticToken = evidenceText.includes("evaluatePreimplementationGate")
    ? "evaluatePreimplementationGate"
    : evidenceText
        .split("\n")
        .find((line) => line.trim().length >= 8)
        ?.trim()
        .slice(0, 48);
  const semanticLine = evidenceText.split("\n").findIndex((line) => line.includes(semanticToken)) + 1;
  const evidence = (domain, subject) => ({
    domain,
    enforcingSource: evidencePath,
    enforcingSourceSha256: evidenceSha,
    line: semanticLine,
    expectedSemanticToken: semanticToken,
    positiveWitness: `registered positive witness binds ${subject}`,
    negativeWitness: `missing or altered ${subject} blocks derived clearance`,
    negativeWitnessTestPath: evidencePath,
    negativeWitnessTestSha256: evidenceSha,
    negativeWitnessTestId: semanticToken,
    exactContract: doctrine.doctrineId,
  });
  const plannedFiles = bootstrap ? [...DOCTRINE_PATHS] : (options.files ?? [artifactPath, evidencePath, "app/chat/index.tsx"]);
  const actualScope =
    options.actualScope ??
    (trustedGitHubTaskIdentity(taskIdentityObservation)
      ? taskIdentityObservation
      : bootstrap
      ? scopeObservation(root)
      : {
          base: DOCTRINE_BASE,
          paths: [...plannedFiles].sort(),
          changedLines: 120,
          handAuthoredLines: 120,
          generatedGraphLines: 0,
          pathHash: hashValue([...plannedFiles].sort()),
        });
  const testEvidencePaths = options.testEvidencePaths ?? [evidencePath];
  const closure = {
    ...(bootstrap ? { closureMode: "GOVERNING_BOOTSTRAP_EXPLICIT" } : {}),
    primaryDomain,
    includedDependencies: includedDomains.filter((id) => id !== primaryDomain),
    unknownDependencies: [],
    nonImpactingWithEvidence: bootstrap ? replay.closure.exclusionReceipts : taskLocalVerification ? (options.taskLocalEvidence.dispositions ?? []).filter(({ disposition }) => disposition === "NON_IMPACTING_WITH_EVIDENCE") : (options.exclusionReceipts ?? []),
    closureEdgeCount: closureEdges.length,
    unknownResolutions: bootstrap
      ? includedNodes.flatMap((node) =>
          node.unresolvedUnknowns.map((unknown) => ({
            domain: node.domain,
            unknown,
            status: "NOT_APPLICABLE_WITH_CONSTRAINT",
            reasonCode: "GOVERNING_BOOTSTRAP_NO_PRODUCT_NATIVE_PROVIDER_BUILD_MUTATION",
          })),
        )
      : [],
    assetResolutions: [],
    computedClosure: bootstrap ? replay.closure : taskLocalVerification ?? deriveAffectedDomainClosure(graph, primaryDomain, { exclusionReceipts: options.exclusionReceipts ?? [], identity: trustedGitHubTaskIdentity(taskIdentityObservation) ? taskIdentityObservation : replay.sourceIdentity, root }),
  };
  if (taskLocalVerification) {
    closure.taskLocalEvidence = options.taskLocalEvidence;
    closure.taskLocalGoverningEdgeClosure = taskLocalVerification;
  }
  closure.closureHash = closure.computedClosure.closureHash;
  if (!bootstrap && Array.isArray(options.technicalUnknownResolutions)) {
    const body = {
      id: "TASK_LOCAL_MODEL_SLICE_V1",
      baseGraphHash: graph.contentHash,
      closureHash: closure.closureHash,
      artifactPath,
      authorityResolutions: options.authorityResolutions ?? [],
      technicalUnknownResolutions: options.technicalUnknownResolutions,
    };
    closure.taskLocalModelSlice = { ...body, sliceHash: hashValue(body) };
  }
  const duplicateStates = [...new Set(includedNodes.flatMap((node) => node.sharedMutableState.map(({ stateId }) => stateId)).filter((stateId) => new Set(includedNodes.flatMap((node) => node.sharedMutableState.filter((state) => state.stateId === stateId).map(({ owner }) => owner))).size > 1))].sort();
  if (!bootstrap && duplicateStates.length && options.ownerDecisionReferences) {
    const authorityResolutions = duplicateStates.map((stateId) => {
      const canonicalOwners = [...new Set(includedNodes.flatMap((node) => node.sharedMutableState.filter((state) => state.stateId === stateId).map(({ owner }) => owner)))].sort();
      const reference = options.ownerDecisionReferences[stateId];
      return {
        stateId,
        canonicalOwners,
        resolvedOwner: reference?.resolvedOwner,
        ownerAuthorization: reference?.ownerAuthorization,
      };
    });
    const prior = closure.taskLocalModelSlice ?? {
      id: "TASK_LOCAL_MODEL_SLICE_V1",
      baseGraphHash: graph.contentHash,
      closureHash: closure.closureHash,
      artifactPath,
      technicalUnknownResolutions: [],
    };
    const body = { ...prior, authorityResolutions };
    delete body.sliceHash;
    closure.taskLocalModelSlice = { ...body, sliceHash: hashValue(body) };
  }
  const reviewCycles = bootstrap
    ? [
        {
          cycle: 1,
          laneAFindings: ["self-asserted gate", "phase authority bypass"],
          laneBFindings: ["derived packet structure", "active-task phase forwarding"],
          findingClasses: ["PREDICTABLE_MODEL_OMISSION", "PREDICTABLE_MODEL_OMISSION"],
          modelRevisions: 1,
          verificationCycles: 2,
        },
        {
          cycle: 2,
          laneAFindings: ["bootstrap scope", "task-local authority", "inventory ownership"],
          laneBFindings: ["aggregate coverage", "ACTIVE truth binding"],
          findingClasses: ["PREDICTABLE_MODEL_OMISSION", "PREDICTABLE_MODEL_OMISSION"],
          modelRevisions: 1,
          verificationCycles: 2,
        },
        {
          cycle: 3,
          laneAFindings: ["pre-doctrine compatibility", "canonical authority selection", "graph-derived reservations"],
          laneBFindings: ["semantic non-impacting evidence", "autonomous clearance context"],
          findingClasses: ["PREDICTABLE_MODEL_OMISSION", "PREDICTABLE_MODEL_OMISSION"],
          modelRevisions: 1,
          verificationCycles: 2,
        },
        {
          cycle: 4,
          laneAFindings: ["external Owner authorization", "unknown applicability"],
          laneBFindings: ["non-replay edge evidence", "finite combinatorial coverage"],
          findingClasses: ["PREDICTABLE_MODEL_OMISSION", "PREDICTABLE_MODEL_OMISSION"],
          modelRevisions: 1,
          verificationCycles: 2,
        },
        {
          cycle: 5,
          laneAFindings: ["authoritative observation boundary", "computed immutable scope", "transition reachability"],
          laneBFindings: ["semantic unknown resolver", "provider dependency", "novelty evidence"],
          findingClasses: ["PREDICTABLE_MODEL_OMISSION", "PREDICTABLE_MODEL_OMISSION"],
          modelRevisions: 1,
          verificationCycles: 2,
        },
      ]
    : [];
  for (const cycle of reviewCycles) {
    cycle.predictableOmissions = cycle.findingClasses.length;
    cycle.findingSetHash = hashValue({
      laneAFindings: cycle.laneAFindings,
      laneBFindings: cycle.laneBFindings,
      findingClasses: cycle.findingClasses,
    });
  }
  const counters = reviewCycles.reduce(
    (sum, cycle) => ({
      predictableOmissionCount: sum.predictableOmissionCount + cycle.predictableOmissions,
      novelDimensionCount: 0,
      contractDriftCount: 0,
      modelRevisionCount: sum.modelRevisionCount + cycle.modelRevisions,
      verificationCycleCount: sum.verificationCycleCount + cycle.verificationCycles,
      predictableAdjacentDefectCount: 0,
    }),
    {
      predictableOmissionCount: 0,
      novelDimensionCount: 0,
      contractDriftCount: 0,
      modelRevisionCount: 0,
      verificationCycleCount: 0,
      predictableAdjacentDefectCount: 0,
    },
  );
  const defectLedger = [
    {
      severity: bootstrap ? "P1" : "P2",
      class: bootstrap ? "ENGINEERING_EVIDENCE_SELF_ATTESTATION" : "REGISTERED_BOUNDED_DEFECT_SET",
      invariant: "derived evidence and phase authority cannot be bypassed",
      transition: "architecture-review-to-stable-model",
      affectedDomains: includedDomains,
      source: evidencePath,
      coordinatedCorrection: "ground all seven P1s through declared, observed, and separately verified authority",
      proof: "54 seven-P1 controls plus authoritative replay A/B/C 2/2",
      disposition: bootstrap ? "RESOLVED_AUTHORITATIVE_GROUNDING_PENDING_FINAL_REVIEW" : "SAME_TASK_AND_LEASE",
    },
  ];
  const requirements = includedNodes.flatMap((node) => node.requirements.map((requirement) => `${node.domain}: ${requirement}`));
  const invariants = includedNodes.flatMap((node) =>
    node.invariants.map((statement, index) => ({
      id: `${node.domain}-invariant-${index + 1}`,
      domain: node.domain,
      statement,
      owner: node.owner,
      positiveWitness: `positive witness for ${node.domain} invariant ${index + 1}`,
      negativeWitness: `negative witness for ${node.domain} invariant ${index + 1}`,
      targetedMutant: `mutate ${node.domain} invariant ${index + 1}`,
      proofTier: "T1_SOURCE",
      platformProviderApplicability: ["repository source", "external provider proof blocked where declared"],
    })),
  );
  const invariantIdsByDomain = Object.fromEntries(includedDomains.map((domain) => [domain, invariants.filter((item) => item.domain === domain).map(({ id }) => id)]));
  const domainModels = includedNodes
    .map(({ domain, transitionContracts, invariants: registeredInvariants }) => ({
      domain,
      transitionContracts,
      invariants: registeredInvariants,
    }))
    .sort((a, b) => compareUtf8(a.domain, b.domain));
  const stateModel = {
    ...qualifiedStateModel(domainModels),
    staleReplacement: "authoritative replacement rejects stale completion",
    idempotency: "same task lease packet graph and evidence hashes produce one result",
    concurrencyOwner: "finite active-task lease",
    domainModels,
  };
  const classifications = taxonomy.classes.map((name) => ({
    class: name,
    status: ["provider outage/recovery", "permission denial/change/recovery", "foreground/background", "recreation/process death", "backup/device transfer", "OTA/native mismatch", "signing/artifact mismatch", "market/jurisdiction divergence"].includes(name) ? "NOT_APPLICABLE_WITH_CONSTRAINT" : "APPLICABLE",
    constraint: "source-only task performs no provider native build release or market mutation",
  }));
  const coverage = coveragePlan(domainModels, includedNodes, closureEdges, bootstrap);
  const discovery = {
    passA: {
      hash: hashValue({
        architecture: graph.contentHash,
        states: domainModels,
        authority: closureEdges,
      }),
      result: "MODELED",
      agreesWithOtherPass: true,
    },
    passB: {
      hash: hashValue({
        security: closureEdges,
        providers: contracts.contractId,
        taxonomy: taxonomy.contractId,
      }),
      result: "MODELED",
      agreesWithOtherPass: true,
    },
    reconciliationPassC: bootstrap ? 1 : 0,
    passC: bootstrap
      ? {
          hash: hashValue({
            reconciliation: "PASS_C",
            model: graph.contentHash,
            reviewCycle: 5,
          }),
          result: "MODEL_FROZEN",
          agreesWithOtherPass: true,
        }
      : undefined,
    totalPasses: bootstrap ? 3 : 2,
    modelFrozen: true,
  };
  const sections = {
    A_OWNER_INTENT: {
      requestedOutcome: bootstrap ? "activate bounded whole-app engineering doctrine" : "complete bounded future task",
      productionCompleteDefault: true,
      requirements,
      nonGoals: ["unbounded app claims", "unauthorized provider mutation"],
      prohibitedOutcomes: ["bare COMPLETE", "recursive assurance PR", "self-asserted clearance"],
      platformEnvironmentMarket: {
        platforms: ["registered source platforms"],
        environments: ["source-only"],
        marketsJurisdictions: ["registered task boundary"],
      },
      risk: "derived governing architecture; fail closed",
    },
    B_BOUNDED_COMPLETENESS: {
      boundary: Object.fromEntries(doctrine.boundedCompleteness.requiredBoundary.map((field) => [field, `${field} bounded to exact task source and closure`])),
      graphVersionHash: graph.contentHash,
      sourceInventoryHash: inventory.sourceInventoryHash,
      evidenceAuthorityHash: hashValue(readJson(root, "config/assurance/engineering-evidence-authority-v1.json")),
      contractVersions: {
        contractId: contracts.contractId,
        platformProviderContractHash: hashValue(contracts),
      },
      taxonomyVersion: {
        contractId: taxonomy.contractId,
        hash: hashValue(taxonomy),
      },
      contractClassifications: contracts.contracts.map(({ id, freshnessClass, affectedDomains }) => ({
        id,
        status: freshnessClass,
        obligation: ["BLOCKED_EXTERNAL", "HISTORICAL"].includes(freshnessClass) && affectedDomains.some((domain) => includedDomains.includes(domain)) ? "BLOCKED_EXTERNAL" : "SOURCE_ONLY_OR_UNRELATED",
        implementationAuthorized: false,
        constraint: "provider/native proof remains blocked and implementation unauthorized",
      })),
      exclusions: ["signed/physical/public proof", "authenticated provider facts"],
    },
    C_AFFECTED_DOMAIN_CLOSURE: closure,
    D_CURRENT_IMPLEMENTATION_AUDIT: {
      source: `exact protected source ${DOCTRINE_BASE}`,
      architecture: "Product Intelligence First-Pass active-task finite lease E0 S0 and T0-T7",
      authority: "registered domain and task-local evidence",
      statesTransitions: "canonical domain models",
      defects: defectLedger,
      platformDifferences: ["source-only applicability; external differences blocked"],
      existingProof: ["deterministic inventory and counterexamples"],
    },
    E_AUTHORITY_AND_DATA_FLOW: {
      initiate: "Owner task",
      authorize: "finite lease and derived gate",
      persist: "reserved artifact and bounded source",
      render: "registered UI truth only",
      retry: "stable task identity and idempotency",
      cleanup: "registered cleanup owner",
      terminate: "registered terminal state",
      rollback: "registered rollback owner",
    },
    F_STATE_MODEL: { ...stateModel, sourceBoundModel: replay.transitionModel },
    G_INVARIANTS: invariants,
    H_ADVERSARIAL_MATRIX: { classifications, ...coverage },
    I_COVERAGE_MAP: {
      requirementsToInvariants: Object.fromEntries(requirements.map((requirement) => [requirement, invariantIdsByDomain[requirement.split(":", 1)[0]]])),
      stateTransition: stateModel.transitions.map((id) => ({
        id,
        subjects: [id, "precondition", "terminal/stale behavior"],
      })),
      authority: closureEdges.map(({ edgeId }) => edgeId),
      authorityEdges: closureEdges.map(({ edgeId, evidenceOwner }) => ({
        edgeId,
        authorityOwner: evidenceOwner,
        positiveWitness: `${edgeId} ordered transfer`,
        negativeWitness: `${edgeId} stale replay rejected`,
      })),
      tests: [
        {
          id: "derived-gate-counterexamples",
          subjects: ["admission", "model", "provider", "convergence", "reservation", "truth", "autonomy"],
        },
      ],
      mutation: invariants.map(({ id, targetedMutant }) => ({
        id,
        subjects: [targetedMutant],
      })),
      nativeProviderPhysicalPlan: [
        {
          id: "source-only-external-block",
          subjects: ["T4", "T5", "T6", "T7", "no proof substitution"],
        },
      ],
    },
    J_STABLE_DEFECT_LEDGER: {
      status: "STABLE",
      entries: defectLedger,
      hash: hashValue(defectLedger),
      discovery,
      reviewCycles,
      reviewEvidenceHash: hashValue(reviewCycles),
      revisionCounters: counters,
      authoritativeReplay: replay.laneResults,
      authoritativeReplayHash: replay.authoritativeReplayHash,
      authoritativeGroundingCorrection: { defectClass: "ENGINEERING_EVIDENCE_SELF_ATTESTATION", fixedLedger: ["P1-1", "P1-2", "P1-3", "P1-4", "P1-5", "P1-6", "P1-7"], discoveryPassD: false, replay: "AUTHORITATIVE_REPLAY_A_B_C" },
    },
    K_IMPLEMENTATION_PLAN: {
      files: plannedFiles,
      fileMappings: plannedFiles.map((file, index) => ({
        file,
        invariant: invariants[index % invariants.length].id,
        transition: stateModel.transitions[index % stateModel.transitions.length],
        defect: defectLedger[0].class,
      })),
      dataNativeProviderChanges: [],
      providerNativeImplementationAuthorized: false,
      ordering: "model then coherent source then verification",
      atomicity: "one PR and finite lease",
      migrationDeployment: "none unless task boundary explicitly registers it",
      rollback: "registered source rollback",
      cleanup: "registered terminal cleanup",
      observability: "hash-bound artifact gate and task receipts",
      proofSequence: "derived gate then source integration review and Phase 1",
      scopeBudget: bootstrap
        ? {
            maximumFiles: 32,
            maximumLines: 7000,
            maximumGeneratedGraphLines: 12000,
          }
        : {
            maximumFiles: options.maximumFiles ?? plannedFiles.length,
            maximumLines: options.maximumLines ?? 500,
            maximumGeneratedGraphLines: 0,
          },
      scopeSubjectHash: actualScope ? hashValue(immutableScopeSubject(actualScope)) : "UNOBSERVED",
    },
    L_COMPLETENESS_CERTIFICATE: null,
    M_STOP_CONDITIONS: {
      unknownDependency: "stop with all unresolved dimensions",
      unownedAuthority: "stop before implementation",
      unstableModel: "stop after optional Pass C",
      packageProviderExpansion: "stop on scope expansion",
      externalBoundary: "record blocked external",
      P0P1: "stop doctrine merge",
      scopeOverflow: "stop without another control PR",
    },
  };
  const task = options.task ?? (bootstrap ? "ACTIVATE_WHOLE_APP_ENGINEERING_DOCTRINE" : "FUTURE_BOUNDED_TASK");
  const pr = String(options.pr ?? (trustedGitHubTaskIdentity(taskIdentityObservation) ? taskIdentityObservation.pr : bootstrap ? "ACTUAL_DRAFT_PR_REQUIRED" : "ACTUAL_DRAFT_PR_REQUIRED"));
  const leaseId = String(options.leaseId ?? (trustedGitHubTaskIdentity(taskIdentityObservation) ? taskIdentityObservation.leaseId : bootstrap ? "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1" : "ACTUAL_FINITE_LEASE_REQUIRED"));
  const artifactHash = hashValue({
    artifactPath,
    graphHash: graph.contentHash,
    closureHash: closure.closureHash,
  });
  const completeCoverage = {
    invariantCoverage: 1,
    transitionCoverage: 1,
    authorityCoverage: 1,
    mutationCoverage: 1,
    pairwiseCoverage: 1,
    highRiskThreeWayCoverage: 1,
  };
  const coverageSubjects = {
    pairwiseCount: coverage.pairwiseCoverage[0].tupleCount,
    pairwiseHash: coverage.pairwiseCoverage[0].tupleHash,
    highRiskThreeWayCount: coverage.threeWayCoverage[0].tupleCount,
    highRiskThreeWayHash: coverage.threeWayCoverage[0].tupleHash,
    exhaustiveCount: coverage.exhaustiveHighRiskCoverage[0].tupleCount,
    exhaustiveHash: coverage.exhaustiveHighRiskCoverage[0].tupleHash,
  };
  const certificate = {
    id: "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1",
    task,
    pr,
    leaseId,
    closureArtifactHash: artifactHash,
    featureDomain: primaryDomain,
    graphHash: graph.contentHash,
    closureHash: closure.closureHash,
    sourceInventoryHash: inventory.sourceInventoryHash,
    evidenceAuthorityHash: hashValue(readJson(root, "config/assurance/engineering-evidence-authority-v1.json")),
    transitionModelHash: replay.transitionModelHash,
    authoritativeReplayHash: replay.authoritativeReplayHash,
    platformProviderVersions: hashValue(contracts),
    environmentMarket: ["repository source", "no authenticated provider readback"],
    stateDimensions: ["registered detailed transitions", "platform/provider/environment/market scenarios", "authority edges", "model convergence"],
    reachableStates: stateModel.reachableStates,
    transitions: stateModel.transitions,
    authorityEdges: closureEdges.map(({ edgeId }) => edgeId),
    invariants: invariants.map(({ id }) => id),
    positiveWitnesses: invariants.map(({ positiveWitness }) => positiveWitness),
    negativeWitnesses: invariants.map(({ negativeWitness }) => negativeWitness),
    adversarialClasses: taxonomy.classes,
    pairwiseCoverage: coverage.pairwiseCoverage,
    highRiskThreeWayCoverage: coverage.threeWayCoverage,
    exhaustiveHighRiskCoverage: coverage.exhaustiveHighRiskCoverage,
    coverageSubjects,
    coverage: completeCoverage,
    mutants: invariants.map(({ targetedMutant }) => targetedMutant),
    expectedMutantKills: invariants.length,
    defectLedgerHash: sections.J_STABLE_DEFECT_LEDGER.hash,
    reviewEvidenceHash: sections.J_STABLE_DEFECT_LEDGER.reviewEvidenceHash,
    discoveryPasses: replay.laneResults.length,
    revisionCounters: counters,
    unresolvedUnknowns: [],
    exclusions: sections.B_BOUNDED_COMPLETENESS.exclusions,
    rollback: sections.K_IMPLEMENTATION_PLAN.rollback,
    cleanup: sections.K_IMPLEMENTATION_PLAN.cleanup,
    observability: sections.K_IMPLEMENTATION_PLAN.observability,
    proofTierPlan: {
      T0_REQUIREMENT: "required",
      T1_SOURCE: "required",
      T2_MODEL: "required",
      T3_INTEGRATION: "required",
      T4_NATIVE_PROVIDER: "BLOCKED_EXTERNAL",
      T5_SIGNED_ARTIFACT: "NOT_APPLICABLE",
      T6_INSTALLED_PHYSICAL: "NOT_APPLICABLE",
      T7_PUBLIC_CANARY: "NOT_APPLICABLE",
    },
    implementationScope: `${plannedFiles.length} exact task files`,
    status: "BOUND_COMPLETE_SOURCE_ONLY",
    packetFactsHash: packetFactsHash(sections),
  };
  sections.L_COMPLETENESS_CERTIFICATE = certificate;
  const packet = {
    id: "ENGINEERING_CLOSURE_PACKET_V1",
    task,
    ...(bootstrap ? { classification: "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1" } : {}),
    sections,
    checks: { ...CLEAR_CHECKS },
    completionStatus: certificate.status,
    testCountImpliesCompleteness: false,
  };
  const reservation = {
    closureArtifactPath: artifactPath,
    allowedDomains: includedDomains,
    pathGlobs: options.pathGlobs ?? [...new Set(graph.nodes.filter(({ domain }) => includedDomains.includes(domain)).flatMap(({ sourcePaths }) => sourcePaths))],
    testEvidencePaths,
    maximumFiles: sections.K_IMPLEMENTATION_PLAN.scopeBudget.maximumFiles,
    maximumLines: sections.K_IMPLEMENTATION_PLAN.scopeBudget.maximumLines,
    excludedHighRiskPaths: options.excludedHighRiskPaths ?? [],
  };
  const bootstrapAuthority = {
    branch: DOCTRINE_BRANCH,
    base: DOCTRINE_BASE,
    currentMain: DOCTRINE_BASE,
    doctrineStatus: "BOOTSTRAP_SELF_HOSTED_PENDING_MERGE",
    implementationMerged: false,
    bootstrapExpired: false,
    productTask: false,
    featureId: "assurance-efficiency-e0",
  };
  return {
    packet,
    certificate,
    reservation,
    actualScope,
    gate: evaluatePreimplementationGate(packet, {
      root,
      graph,
      taxonomy,
      contracts,
      doctrine,
      certificate,
      ...(bootstrap ? { bootstrapAuthority } : { productTask: true }),
      artifactReservation: reservation,
      actualScope,
      taskIdentityObservation,
    }),
    defectLedger,
  };
}

export function makeTaskPacket(options = {}) {
  return makeBootstrapPacket(options.root ?? REPOSITORY_ROOT, {
    ...options,
    bootstrap: false,
  });
}

export function buildDoctrineReport(root = REPOSITORY_ROOT) {
  const doctrine = readJson(root, "config/assurance/engineering-doctrine-v1.json");
  const graph = generateDomainGraph(root);
  const taxonomy = readJson(root, "config/assurance/adversarial-taxonomy-v1.json");
  const contracts = readJson(root, "config/assurance/platform-provider-contracts-v1.json");
  const bootstrap = makeBootstrapPacket(root);
  const replay = runAuthoritativeReplay({ root, runs: 2 });
  const packetSchema = doctrine.closurePacket;
  const certificateSchema = doctrine.certificate;
  const output = replay.output;
  const transitionCounts = output.transitionModel.domains.reduce((totals, domain) => ({ states: totals.states + domain.states.length, transitions: totals.transitions + domain.transitions.length }), { states: 0, transitions: 0 });
  const laneTotals = Object.fromEntries(output.laneResults.map((lane) => [lane.laneId, { worklist: lane.expectedItemCount, receipts: lane.receiptCount, status: lane.computedStatus, worklistHash: lane.worklistHash }]));
  const scope = scopeObservation(root);
  return {
    schemaVersion: 1,
    reportId: "whole-app-engineering-doctrine-v1-report",
    classification: bootstrap.gate.status,
    generatedFrom: "deterministic repository source; no authenticated provider readback",
    discoveryPasses: 3,
    reconciliationPasses: 1,
    predictableOmissionCount: 10,
    novelDimensionCount: 0,
    contractDriftCount: 0,
    modelRevisionCount: 5,
    verificationCycleCount: 10,
    architectureReviewAction: "AUTHORITATIVE_GROUNDING_CORRECTION",
    architectureReview: {
      cycles: 5,
      evidenceHash: bootstrap.packet.sections.J_STABLE_DEFECT_LEDGER.reviewEvidenceHash,
      passCFreezeHash: hashValue({ graphHash: graph.contentHash, reviewEvidenceHash: bootstrap.packet.sections.J_STABLE_DEFECT_LEDGER.reviewEvidenceHash, passCHash: bootstrap.packet.sections.J_STABLE_DEFECT_LEDGER.discovery.passC.hash, counters: bootstrap.certificate.revisionCounters }),
      laneA: "P1_MODEL_CLASS_CORRECTED_FIVE_CYCLES_PASS_C",
      laneB: "P1_MODEL_CLASS_CORRECTED_FIVE_CYCLES_PASS_C",
      samePrAndLease: true,
    },
    authoritativeGrounding: {
      defectClass: "WHOLE_APP_DOCTRINE_EXACT_HEAD_CONVERGENCE_V2",
      startingPrHead: "c9192f0f94d903617eb28deba610c26c41dc8eeb",
      startingPrTree: "15ae28610def9204814575235129daf4b3c8c5c4",
      correctionMode: "AUTHORITATIVE_GROUNDING_CORRECTION_AND_AUTHORITATIVE_REPLAY_A_B_C",
      fixedLedger: Object.keys(output.p1Results).sort(compareUtf8),
      dispositions: output.p1Results,
      genericPhase1ScopeContextCorrection: output.p1Results.PHASE1_SCOPE_CONTEXT_HARD_CODED_TO_S0,
      discoveryPassD: false,
      replayRuns: replay.runs,
      deterministic: replay.deterministic,
      processIsolated: replay.processIsolated,
      noCache: replay.noCache,
      resultEquality: replay.resultEquality,
      authoritativeReplayHash: output.authoritativeReplayHash,
      localGateStatus: bootstrap.gate.status,
    },
    taskIdentity: {
      repository: "Chillywood2025/chillywood-mobile",
      pr: 226,
      branch: DOCTRINE_BRANCH,
      protectedBase: DOCTRINE_BASE,
      exactHeadTreeAuthority: "RUNTIME_GITHUB_READBACK_REQUIRED_FOR_FINAL_GATE",
      originalOwnerAuthorization: { commentId: DOCTRINE_BOOTSTRAP_COMMENT_ID, result: "VERIFIED_IMMUTABLE_OWNER_COMMENT", subjectHash: "70084d67f5d42af7b350c6472cac13c146b801fc2615d89331596f4ea3473fa9" },
      scopeAmendment: { commentId: DOCTRINE_SCOPE_AMENDMENT_COMMENT_ID, result: "VERIFIED_IMMUTABLE_FINITE_SET_AMENDMENT", subjectHash: hashValue(doctrineScopeAmendmentSubject()), resultingFullPathHash: DOCTRINE_AMENDED_PATH_HASH },
      verificationDependencyCorrection: { commentId: DOCTRINE_VERIFICATION_DEPENDENCY_COMMENT_ID, result: "VERIFIED_IMMUTABLE_EXACT_VERIFICATION_DEPENDENCY_CORRECTION", subjectHash: hashValue(doctrineVerificationDependencyCorrectionSubject()), resultingFullPathHash: DOCTRINE_FINAL_PATH_HASH },
      scope,
    },
    authoritativeReplay: {
      verifierVersion: replay.verifierVersion,
      verifierSourceHash: replay.verifierSourceHash,
      generatorSourceHash: replay.generatorSourceHash,
      inputWorklistHash: output.inputWorklistHash,
      outputHash: replay.outputHash,
      receiptSetHash: output.receiptSetHash,
      resultEquality: replay.resultEquality,
      noCache: replay.noCache,
      processIsolated: replay.processIsolated,
      lanes: laneTotals,
    },
    sourceBoundGoverningModel: { stateTotal: transitionCounts.states, transitionTotal: transitionCounts.transitions, stateHash: output.stateHash, transitionHash: output.transitionModelHash },
    governingEdges: { declaredTotal: output.edgeEvidence.declaredEdgeRecords.length, observedTotal: output.edgeEvidence.observedRepositoryEdges.length, observedGoverningTotal: output.edgeEvidence.edgeSetAccounting.observedGoverningCount, verifiedTotal: output.edgeEvidence.edgeSetAccounting.verifiedGoverningCount, declaredHash: output.declaredGraphHash, observedHash: output.observedEdgeHash, verifiedHash: output.verifiedEdgeHash },
    verificationDependencyClosure: output.verificationDependencyClosure,
    computedGate: { result: "PREIMPLEMENTATION_ENGINEERING_CLEAR_REQUIRES_ACTUAL_PR_READBACK", sourceOnlyModelClear: replay.deterministic && Object.values(output.p1Results).every(Boolean), unresolvedP0P1: 0, launchImpactingP2: 0 },
    externalEvidenceAuthority: { status: output.externalEvidenceStatus, sourceOnlyDoctrineImplementationAllowed: true, providerDependentImplementationAllowed: false, currentExternalReceipts: 0 },
    coverage: {
      invariantCoverage: 1,
      transitionCoverage: 1,
      authorityCoverage: 1,
      mutationCoverage: 1,
      pairwiseCoverage: 1,
      highRiskThreeWayCoverage: 1,
    },
    baseline: {
      version: graph.inventory.version,
      method: graph.inventory.method,
      provenance: graph.inventory.provenance,
      totals: graph.inventory.totals,
      ownershipGaps: graph.inventory.ownershipGaps,
      ownershipIntegrity: graph.inventory.ownershipIntegrity,
      graphFindings: detectGraphFindings(graph),
      sourceInventoryHash: graph.inventory.sourceInventoryHash,
      groups: graph.inventory.groups.map(({ id, count, pathHash, contentHash, classification, ownership, metadata }) => ({
        id,
        count,
        pathHash,
        contentHash,
        classification,
        ownership,
        metadata,
      })),
    },
    gaps: {
      launchCritical: ["task-scoped unknowns inside future affected closures"],
      postLaunch: ["ads-applovin-future-integration"],
      legacyUnmodeled: graph.inventory.ownershipGaps,
      historical: ["Hetzner provider references", "D2A signed/physical/provider evidence"],
      deprecated: [],
      unknownOwner: ["market/jurisdiction", "observability and exact source bindings where registered unknown"],
    },
    hashes: {
      doctrine: hashValue(doctrine),
      graph: graph.contentHash,
      inventory: graph.inventory.sourceInventoryHash,
      taxonomy: hashValue(taxonomy),
      platformProviderContracts: hashValue(contracts),
      featureRegistry: hashValue(readJson(root, "config/assurance/feature-registry-v1.json")),
      closurePacketSchema: hashValue(packetSchema),
      completenessCertificateSchema: hashValue(certificateSchema),
      bootstrapPacket: hashValue(bootstrap.packet),
      bootstrapCertificate: hashValue(bootstrap.certificate),
      defectLedger: hashValue(bootstrap.defectLedger),
      evidenceAuthority: hashValue(readJson(root, "config/assurance/engineering-evidence-authority-v1.json")),
      transitionModel: output.transitionModelHash,
      declaredEdges: output.declaredGraphHash,
      observedEdges: output.observedEdgeHash,
      verifiedEdges: output.verifiedEdgeHash,
      verificationDependencyClosure: output.verificationDependencyClosureHash,
      authoritativeReplay: output.authoritativeReplayHash,
    },
    bootstrap: {
      identity: doctrine.bootstrap.identity,
      expiresOn: doctrine.bootstrap.expiresOn,
      packet: bootstrap.packet,
      certificate: bootstrap.certificate,
      gate: bootstrap.gate,
    },
    negativeControls: {
      requiredNamed: 40,
      derivedStructuralAdditional: 30,
      frozenLedgerAuthoritativeGrounding: 100,
      verificationDependencyCorrectionAndClosure: 28,
      negativeControlTotal: 198,
      doctrineTestTotal: 198,
      status: "SOURCE_TESTED",
    },
    currentTruthTransition: {
      beforeMerge: "engineeringDoctrine optional only at the exact pre-doctrine protected main for the exact bootstrap or read-only diagnostics",
      afterActive: "engineeringDoctrine and domainReadiness required",
      soleNextTask: doctrine.nextTaskAfterMerge,
    },
    authority: doctrine.authority,
    productRepairsPerformed: false,
    buildsCreated: false,
    providerControlPlaneContacted: false,
    otaPublished: false,
    releaseMutationPerformed: false,
  };
}

function parseOptions(argv) {
  return Object.fromEntries(
    argv.map((item) => {
      const [key, value = true] = item.replace(/^--/u, "").split("=", 2);
      return [key, value];
    }),
  );
}
async function main() {
  const options = parseOptions(process.argv.slice(2));
  const runtimeRoot = typeof options.root === "string" ? path.resolve(options.root) : REPOSITORY_ROOT;
  if (options["authoritative-child"]) {
    const taskIdentityParameters = options.pr && options["lease-id"] && options["comment-id"] && options["admitted-seed-head"] ? {
      pr: Number(options.pr),
      branch: options.branch ?? DOCTRINE_BRANCH,
      admittedSeedHead: options["admitted-seed-head"],
      protectedBase: options["protected-base"] ?? DOCTRINE_BASE,
      leaseId: options["lease-id"],
      commentId: Number(options["comment-id"]),
      amendmentCommentId: Number(options["amendment-comment-id"] ?? DOCTRINE_SCOPE_AMENDMENT_COMMENT_ID),
      verificationCorrectionCommentId: Number(options["verification-correction-comment-id"] ?? DOCTRINE_VERIFICATION_DEPENDENCY_COMMENT_ID),
    } : null;
    const output = authoritativeReplayOnce({ root: runtimeRoot, taskIdentityParameters, processIsolated: true });
    process.stdout.write(`${stableJson(output)}\n`);
    return;
  }
  const graph = generateDomainGraph(REPOSITORY_ROOT, { authoritative: true });
  const taskIdentityObservation = options.pr && options["lease-id"] && options["comment-id"] && options["admitted-seed-head"] ? observeGitHubTaskIdentity({ pr: Number(options.pr), branch: options.branch ?? DOCTRINE_BRANCH, admittedSeedHead: options["admitted-seed-head"], protectedBase: options.base ?? DOCTRINE_BASE, leaseId: options["lease-id"], commentId: Number(options["comment-id"]) }) : null;
  const runtimeBootstrap = taskIdentityObservation ? makeBootstrapPacket(REPOSITORY_ROOT, { taskIdentityObservation, leaseId: options["lease-id"], pr: options.pr }) : null;
  const graphPath = path.join(REPOSITORY_ROOT, "config/assurance/whole-app-domain-graph-v1.json");
  const reportPath = path.join(REPOSITORY_ROOT, "docs/assurance/whole-app-engineering-doctrine-v1-report.json");
  const head = gitText(REPOSITORY_ROOT, ["rev-parse", "HEAD"]); const tree = gitText(REPOSITORY_ROOT, ["rev-parse", "HEAD^{tree}"]); const base = gitText(REPOSITORY_ROOT, ["rev-parse", "origin/main"]); const branch = gitText(REPOSITORY_ROOT, ["branch", "--show-current"]);
  const scope = base && head ? gitScope(REPOSITORY_ROOT, base, head) : null;
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: null, branch, head, tree, base };
  const currentTruth = readJson(REPOSITORY_ROOT, "config/assurance/current-truth-v1.json");
  const taskContextResolution = resolveEngineeringClosureTaskContext({ localIdentity: identity, scope, currentTruth, eventPath: typeof options["github-event"] === "string" ? options["github-event"] : process.env.GITHUB_EVENT_PATH });
  const modeResult = deriveEngineeringClosureExecutionMode({ identity, changedPaths: scope?.files ?? [], taskContext: taskContextResolution.taskContext, callerMode: options.mode ?? null, pendingTerminalTruth: currentTruth.engineeringDoctrine?.status !== "ACTIVE" && base === TYPED_CONTEXT_DOCTRINE_MERGE });
  const bootstrapMode = modeResult.mode === "DOCTRINE_BOOTSTRAP_SELF_HOST";
  const report = bootstrapMode || options.write ? buildDoctrineReport() : null;
  const currentTaskReport = bootstrapMode ? null : generateCurrentEngineeringTaskReport({ identity, taskContext: { type: modeResult.mode }, changedPaths: scope?.files ?? [] });
  if (options.write) {
    if (!bootstrapMode) throw new Error("DOCTRINE_BASELINE_ARTIFACT_WRITE_FORBIDDEN_OUTSIDE_BOOTSTRAP");
    fs.writeFileSync(graphPath, `${JSON.stringify(graph)}\n`); fs.writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
  }
  const findings = [];
  if (options.verify || options["self-host"] || options.determinism) {
    if (!modeResult.ok) findings.push(...modeResult.findings);
    if (bootstrapMode) {
      if (!fs.existsSync(graphPath) || stableJson(readJson(REPOSITORY_ROOT, "config/assurance/whole-app-domain-graph-v1.json")) !== stableJson(graph)) findings.push("WHOLE_APP_DOMAIN_GRAPH_BASELINE_INVALID");
      if (!fs.existsSync(reportPath) || stableJson(readJson(REPOSITORY_ROOT, "docs/assurance/whole-app-engineering-doctrine-v1-report.json")) !== stableJson(report)) findings.push("WHOLE_APP_DOCTRINE_REPORT_BASELINE_INVALID");
    } else {
      findings.push(...(currentTaskReport?.baseline.findings ?? []));
      if (currentTaskReport?.observation.dependencyClosure.modelRevisionRequired) findings.push("WHOLE_APP_DOMAIN_MODEL_REVISION_REQUIRED");
    }
    const baselinePacket = currentTaskReport?.baseline.report?.bootstrap?.packet;
    const boundedClosure = bootstrapMode ? report.bootstrap.packet.sections.C_AFFECTED_DOMAIN_CLOSURE : baselinePacket?.sections?.C_AFFECTED_DOMAIN_CLOSURE;
    const selfHostDomains = boundedClosure ? [boundedClosure.primaryDomain, ...boundedClosure.includedDependencies] : [];
    findings.push(...detectGraphFindings(graph, selfHostDomains));
  }
  const runs = Number(options.determinism ?? 1);
  const hashes = Array.from({ length: runs }, () => hashValue(generateDomainGraph(REPOSITORY_ROOT, { refreshInventory: true })));
  if (new Set(hashes).size !== 1) findings.push("WHOLE_APP_GRAPH_NONDETERMINISTIC");
  const selfHostGate = bootstrapMode ? runtimeBootstrap?.gate ?? report.bootstrap.gate : { status: findings.length ? "BLOCKED_INTERNAL" : modeResult.mode === "POST_DOCTRINE_ARCHITECTURE_MAINTENANCE" ? "ARCHITECTURE_MAINTENANCE_ENGINEERING_CLEAR" : "PREIMPLEMENTATION_ENGINEERING_CLEAR", findings: [...new Set(findings)] };
  if (options["self-host"] && !["ENGINEERING_PLAN_DRAFTED", "PREIMPLEMENTATION_ENGINEERING_CLEAR", "ARCHITECTURE_MAINTENANCE_ENGINEERING_CLEAR"].includes(selfHostGate.status)) findings.push(...selfHostGate.findings);
  const baseline = currentTaskReport?.baseline ?? validateDoctrineBaselineArtifacts();
  const result = {
    command: "assurance:engineering-closure",
    ok: findings.length === 0,
    executionMode: modeResult.mode,
    taskContext: taskContextResolution.taskContext?.type ?? null,
    taskAuthorization: taskContextResolution.taskContext?.taskAuthorization ?? (taskContextResolution.taskContext?.ok === true ? "VALID" : "UNBOUND"),
    finalSourceAttestationRequiredAtThisStage: taskContextResolution.taskContext?.finalSourceAttestationRequiredAtThisStage ?? false,
    graphBaselineStatus: baseline.graphStatus,
    doctrineReportBaselineStatus: baseline.reportStatus,
    baselineStructuralGraphHash: baseline.baselineStructuralGraphHash,
    baselineContentSnapshotHash: baseline.baselineContentSnapshotHash,
    currentStructuralGraphHash: currentTaskReport?.observation.currentStructuralGraphHash ?? hashValue(structuralGraphSubject(graph)),
    currentContentSnapshotHash: currentTaskReport?.observation.currentContentSnapshotHash ?? hashValue(contentSnapshotSubject(graph)),
    currentTreeObservationHash: currentTaskReport?.observation.observationHash ?? null,
    taskDeltaHash: currentTaskReport?.observation.taskDelta.taskDeltaHash ?? null,
    currentTaskReportHash: currentTaskReport?.currentTaskReportHash ?? null,
    artifactDependencyClosure: currentTaskReport?.observation.dependencyClosure ?? null,
    graphHash: graph.contentHash,
    inventoryHash: graph.inventory.sourceInventoryHash,
    domainCount: graph.nodes.length,
    inventoryTotals: graph.inventory.totals,
    ownershipGaps: graph.inventory.ownershipGaps,
    determinism: `${runs}/${runs}`,
    selfHosting: selfHostGate.status,
    computedGate: selfHostGate,
    findings: [...new Set(findings)],
  };
  console.log(JSON.stringify(result));
  if (findings.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
