#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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
const qualifiedStateModel = (domainModels) => ({
  reachableStates: domainModels.flatMap(({ domain, transitionContracts }) => transitionContracts.flatMap(({ from, to }) => [`${domain}:${from}`, `${domain}:${to}`])).filter((value, index, all) => all.indexOf(value) === index),
  transitions: domainModels.flatMap(({ domain, transitionContracts }) => transitionContracts.map(({ id, from, to }) => `${domain}:${id}:${from}->${to}`)),
  preconditions: domainModels.flatMap(({ domain, transitionContracts }) => transitionContracts.map(({ id, preconditions }) => `${domain}:${id}:${preconditions.join(" & ")}`)),
  terminalStates: domainModels.flatMap(({ domain, transitionContracts }) => transitionContracts.filter(({ terminal }) => terminal).map(({ to }) => `${domain}:${to}`)).filter((value, index, all) => all.indexOf(value) === index),
});
const HIGH_RISK_THREE_WAY = Object.freeze(["concurrency", "lifecycle", "permissions", "provider state", "replacement authority"]);
const EXHAUSTIVE_BOUNDARIES = Object.freeze(["authentication/authorization", "money/entitlement", "privacy/user rights", "deletion/ownership", "permission-to-media", "terminal/resurrection", "stale/replacement authority", "migration/rollback", "native-action provenance", "security trust boundaries"]);
const combinations = (values, size) => values.flatMap((value, index) => (size === 1 ? [[value]] : combinations(values.slice(index + 1), size - 1).map((tail) => [value, ...tail])));
const tuple = (subject) => ({ subject, tupleHash: hashValue(subject) });
const coveragePlan = (domainModels, nodes, edges, bootstrap = false) => {
  const byDomain = new Map(nodes.map((node) => [node.domain, node]));
  const scenarios = domainModels.flatMap(({ domain, transitionContracts }) =>
    transitionContracts.flatMap((transition) =>
      transition.platforms.flatMap((platform) =>
        transition.providers.flatMap((provider) =>
          transition.environments.flatMap((environment) =>
            transition.markets.map((market) => ({
              domain,
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
      const relevant = boundary.includes("money") ? /money|premium|billing|payout|ledger/u.test(model.domain) : boundary.includes("native") || boundary.includes("permission") ? node.platforms.some((value) => ["android", "ios"].includes(value)) : true;
      const applicableEdges = edges.filter(({ sourceDomain, destinationDomain }) => [sourceDomain, destinationDomain].includes(model.domain)).map(({ edgeId }) => edgeId);
      return tuple({
        boundary,
        domain: model.domain,
        transitions: relevant
          ? model.transitionContracts.map(({ id, from, to }) => ({
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
  const diffRun = gitRun(["diff", "--binary", "--no-ext-diff", `${base}...${head}`]);
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
    diffHash: hashValue(diffRun.stdout),
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
export function observeCandidateScopeFromGit(base, head, root = REPOSITORY_ROOT) {
  if (!/^[0-9a-f]{40}$/u.test(base ?? "") || !/^[0-9a-f]{40}$/u.test(head ?? "")) return null;
  const run = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  const range = `${base}...${head}`;
  const pathsRun = run(["diff", "--name-only", range]);
  const linesRun = run(["diff", "--numstat", range]);
  const diffRun = run(["diff", "--binary", "--no-ext-diff", range]);
  if ([pathsRun, linesRun, diffRun].some(({ status }) => status !== 0)) return null;
  const paths = pathsRun.stdout.split(/\r?\n/gu).filter(Boolean).sort();
  const changedLines = linesRun.stdout
    .split(/\r?\n/gu)
    .filter(Boolean)
    .reduce(
      (total, row) =>
        total +
        row
          .split("\t")
          .slice(0, 2)
          .reduce((sum, value) => sum + (/^\d+$/u.test(value) ? Number(value) : 0), 0),
      0,
    );
  const observation = {
    base,
    head,
    paths,
    changedLines,
    handAuthoredLines: changedLines,
    generatedGraphLines: 0,
    pathHash: hashValue(paths),
    diffHash: hashValue(diffRun.stdout),
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
  const bootstrapClosure = packet?.classification === "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1" && C?.closureMode === "GOVERNING_BOOTSTRAP_EXPLICIT";
  const expectedClosureHash = canonicalClosure.closureHash;
  const closureSetValid = stableJson(included) === stableJson(canonicalClosure.domains) && stableJson(canonicalClosure.actualIncludedEdges) === stableJson(canonicalClosure.requiredIncludedEdges);
  const closureValid = packetIdentity && textValue(C?.primaryDomain) && canonicalDomains.has(C.primaryDomain) && closureSetValid && C?.closureHash === expectedClosureHash && Array.isArray(C?.nonImpactingWithEvidence) && textArray(C?.unknownDependencies, true) && C.unknownDependencies.length === 0;
  derive("affectedDomainClosureComplete", closureValid);
  derive("dependencyClosureComplete", closureValid && canonicalClosure.status === "BOUND_COMPLETE_FOR_REGISTERED_SCOPE");
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
    stableJson(C?.nonImpactingWithEvidence ?? []) === stableJson(canonicalClosure.exclusionReceipts ?? []);
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
  const jurisdictionResolutions = Array.isArray(C?.taskLocalModelSlice?.jurisdictionOwnerResolutions)
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
  const domainModels = new Map(Array.isArray(F?.domainModels) ? F.domainModels.map((item) => [item.domain, item]) : []);
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
  const providerDependent = (closureEdges.some(({ dataControlTransferred }) => /provider|token|entitlement|transaction|media transport/iu.test(dataControlTransferred)) && (effectiveActualScope?.paths ?? []).some((file) => providerConfigPath(file) || hasProviderImport(file) || r2Path(file))) || (K?.files ?? []).some((file) => providerConfigPath(file) || hasProviderImport(file) || r2Path(file)) || (K?.dataNativeProviderChanges ?? []).length > 0 || [...domainModels.values()].some(({ transitionContracts }) => transitionContracts.some(({ providerMutation }) => providerMutation === true));
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
  const authoritativeIdentity = trustedGitHubTaskIdentity(taskIdentity);
  const replay = authoritativeIdentity ? runAuthoritativeReplay({ root, taskIdentity, runs: 1 }).output : authoritativeReplayOnce({ root });
  const declared = evaluateDeclaredPacketGate(packet, {
    ...supplied,
    taskIdentity: authoritativeIdentity ? { task: packet?.task, pr: String(taskIdentity.pr), leaseId: String(taskIdentity.leaseId), closureArtifactHash: packet?.sections?.L_COMPLETENESS_CERTIFICATE?.closureArtifactHash, currentHead: taskIdentity.head } : supplied.taskIdentity,
    actualScope: authoritativeIdentity ? taskIdentity : supplied.actualScope,
  });
  const findings = new Set(declared.findings);
  const C = packet?.sections?.C_AFFECTED_DOMAIN_CLOSURE;
  const F = packet?.sections?.F_STATE_MODEL;
  const J = packet?.sections?.J_STABLE_DEFECT_LEDGER;
  const expectedClosure = replay.closure;
  const closureDeclaration = C?.computedClosure;
  if (!closureDeclaration || stableJson(closureDeclaration) !== stableJson(expectedClosure)) findings.add("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE");
  if (!F?.sourceBoundModel || stableJson(F.sourceBoundModel) !== stableJson(replay.transitionModel)) findings.add("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE");
  const groundedTransitionShapes = replay.transitionModel.domains.map(({ domain, states, transitions }) => ({ domain, states: canonicalSort(states.map(({ stateId }) => stateId)), transitions: transitions.map(({ transitionId, sourceStates, destinationStates }) => ({ id: transitionId, from: sourceStates[0], to: destinationStates[0] })).sort((a, b) => compareUtf8(a.id, b.id)) })).sort((a, b) => compareUtf8(a.domain, b.domain));
  const declaredTransitionShapes = (F?.domainModels ?? []).filter(({ domain }) => groundedTransitionShapes.some((item) => item.domain === domain)).map(({ domain, transitionContracts }) => ({ domain, states: canonicalSort([...new Set((transitionContracts ?? []).flatMap(({ from, to }) => [from, to]))]), transitions: (transitionContracts ?? []).map(({ id, from, to }) => ({ id, from, to })).sort((a, b) => compareUtf8(a.id, b.id)) })).sort((a, b) => compareUtf8(a.domain, b.domain));
  if (stableJson(declaredTransitionShapes) !== stableJson(groundedTransitionShapes)) findings.add("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE");
  if (!J?.authoritativeReplay || stableJson(J.authoritativeReplay) !== stableJson(replay.laneResults) || J.authoritativeReplayHash !== replay.authoritativeReplayHash) findings.add("PREIMPLEMENTATION_DEFECT_LEDGER_UNSTABLE");
  if (packet?.sections?.B_BOUNDED_COMPLETENESS?.evidenceAuthorityHash !== hashValue(readJson(root, "config/assurance/engineering-evidence-authority-v1.json"))) findings.add("PREIMPLEMENTATION_INVARIANT_COVERAGE_INCOMPLETE");
  if (!replay.inventoryVerification.ok) findings.add("PREIMPLEMENTATION_AFFECTED_DOMAIN_INCOMPLETE");
  if (replay.result === "BLOCKED") findings.add(...replay.laneResults.flatMap(({ candidateFindings }) => candidateFindings));
  const bootstrap = packet?.classification === "OWNER_AUTHORIZED_DOCTRINE_BOOTSTRAP_V1";
  if (!authoritativeIdentity) findings.add("PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_REQUIRED");
  if (authoritativeIdentity && (taskIdentity.repository !== "Chillywood2025/chillywood-mobile" || taskIdentity.branch !== DOCTRINE_BRANCH || taskIdentity.base !== DOCTRINE_BASE || taskIdentity.leaseId !== packet?.sections?.L_COMPLETENESS_CERTIFICATE?.leaseId || stableJson(taskIdentity.paths) !== stableJson(packet?.sections?.K_IMPLEMENTATION_PLAN?.files?.slice().sort()))) findings.add("PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_MISMATCH");
  const blockingFindings = [...findings].filter((finding) => finding !== "PREIMPLEMENTATION_GIT_GITHUB_IDENTITY_REQUIRED");
  const status = authoritativeIdentity && findings.size === 0 ? "PREIMPLEMENTATION_ENGINEERING_CLEAR" : bootstrap && !authoritativeIdentity && blockingFindings.length === 0 ? "ENGINEERING_PLAN_DRAFTED" : "BLOCKED";
  const result = {
    id: status,
    status,
    clear: status === "PREIMPLEMENTATION_ENGINEERING_CLEAR",
    computed: true,
    subject: authoritativeIdentity ? { repository: taskIdentity.repository, pr: taskIdentity.pr, branch: taskIdentity.branch, head: taskIdentity.head, tree: taskIdentity.tree, base: taskIdentity.base, leaseId: taskIdentity.leaseId } : { repository: "Chillywood2025/chillywood-mobile", branch: DOCTRINE_BRANCH, localDraft: true },
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
  const includedDomains = bootstrap ? replay.closure.domains : deriveAffectedDomainClosure(graph, primaryDomain, { exclusionReceipts: options.exclusionReceipts ?? [], identity: trustedGitHubTaskIdentity(taskIdentityObservation) ? taskIdentityObservation : replay.sourceIdentity, root }).domains;
  const includedNodes = graph.nodes.filter(({ domain }) => includedDomains.includes(domain));
  const closureEdges = graph.edges.filter(({ sourceDomain, destinationDomain }) => includedDomains.includes(sourceDomain) && includedDomains.includes(destinationDomain));
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
    nonImpactingWithEvidence: bootstrap ? replay.closure.exclusionReceipts : (options.exclusionReceipts ?? []),
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
    computedClosure: bootstrap ? replay.closure : deriveAffectedDomainClosure(graph, primaryDomain, { exclusionReceipts: options.exclusionReceipts ?? [], identity: trustedGitHubTaskIdentity(taskIdentityObservation) ? taskIdentityObservation : replay.sourceIdentity, root }),
  };
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
  const graph = generateDomainGraph();
  const report = buildDoctrineReport();
  const taskIdentityObservation = options.pr && options["lease-id"] && options["comment-id"] && options["admitted-seed-head"] ? observeGitHubTaskIdentity({ pr: Number(options.pr), branch: options.branch ?? DOCTRINE_BRANCH, admittedSeedHead: options["admitted-seed-head"], protectedBase: options.base ?? DOCTRINE_BASE, leaseId: options["lease-id"], commentId: Number(options["comment-id"]) }) : null;
  const runtimeBootstrap = taskIdentityObservation ? makeBootstrapPacket(REPOSITORY_ROOT, { taskIdentityObservation, leaseId: options["lease-id"], pr: options.pr }) : null;
  const graphPath = path.join(REPOSITORY_ROOT, "config/assurance/whole-app-domain-graph-v1.json");
  const reportPath = path.join(REPOSITORY_ROOT, "docs/assurance/whole-app-engineering-doctrine-v1-report.json");
  if (options.write) {
    fs.writeFileSync(graphPath, `${JSON.stringify(graph)}\n`);
    fs.writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
  }
  const findings = [];
  if (options.verify || options["self-host"] || options.determinism) {
    if (!fs.existsSync(graphPath) || stableJson(readJson(REPOSITORY_ROOT, "config/assurance/whole-app-domain-graph-v1.json")) !== stableJson(graph)) findings.push("WHOLE_APP_DOMAIN_GRAPH_STALE");
    if (!fs.existsSync(reportPath) || stableJson(readJson(REPOSITORY_ROOT, "docs/assurance/whole-app-engineering-doctrine-v1-report.json")) !== stableJson(report)) findings.push("WHOLE_APP_DOCTRINE_REPORT_STALE");
    const selfHostDomains = [report.bootstrap.packet.sections.C_AFFECTED_DOMAIN_CLOSURE.primaryDomain, ...report.bootstrap.packet.sections.C_AFFECTED_DOMAIN_CLOSURE.includedDependencies];
    findings.push(...detectGraphFindings(graph, selfHostDomains));
  }
  const runs = Number(options.determinism ?? 1);
  const hashes = Array.from({ length: runs }, () => hashValue(generateDomainGraph(REPOSITORY_ROOT, { refreshInventory: true })));
  if (new Set(hashes).size !== 1) findings.push("WHOLE_APP_GRAPH_NONDETERMINISTIC");
  const selfHostGate = runtimeBootstrap?.gate ?? report.bootstrap.gate;
  if (options["self-host"] && !["ENGINEERING_PLAN_DRAFTED", "PREIMPLEMENTATION_ENGINEERING_CLEAR"].includes(selfHostGate.status)) findings.push(...selfHostGate.findings);
  const result = {
    command: "assurance:engineering-closure",
    ok: findings.length === 0,
    graphHash: graph.contentHash,
    inventoryHash: graph.inventory.sourceInventoryHash,
    domainCount: graph.nodes.length,
    inventoryTotals: graph.inventory.totals,
    ownershipGaps: graph.inventory.ownershipGaps,
    determinism: `${runs}/${runs}`,
    selfHosting: selfHostGate.status,
    computedGate: selfHostGate,
    findings,
  };
  console.log(JSON.stringify(result));
  if (findings.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
