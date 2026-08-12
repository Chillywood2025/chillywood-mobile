#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const contractPath = "config/assurance/android-generated-native-lifecycle-v1.json";
const d1ContractPath = "config/assurance/release-target-parity-v1.json";
const registryPath = "config/assurance/native-capability-registry-v1.json";
const reportPath = "docs/assurance/pr-d2a-android-generated-native-lifecycle-report-v1.json";
const pluginPath = "plugins/withChillyChatNativeCallNotifications.js";
const unitTemplate = "tools/android-native-call-harness/ChillyChatNativeCallActionStoreTest.kt";
const instrumentationTemplate = "tools/android-native-call-harness/ChillyChatNativeLifecycleInstrumentationTest.kt";
const micInstrumentationTemplate = "tools/android-native-call-harness/ChillyChatMicControlInstrumentationTest.kt";
const micContractPath = "config/assurance/android-chat-call-mic-control-v1.json";
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (relative) => fs.readFileSync(path.join(root, relative));
const readText = (relative) => read(relative).toString("utf8");
const readJson = (relative) => JSON.parse(readText(relative));
const clone = (value) => structuredClone(value);
const stable = (value) => JSON.stringify(value, (_, current) => current && typeof current === "object" && !Array.isArray(current)
  ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))) : current);

class GateError extends Error {
  constructor(code, message, details = {}) { super(message); this.code = code; this.details = details; }
}
const gate = (condition, code, message, details) => { if (!condition) throw new GateError(code, message, details); };
const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: options.cwd ?? root,
  env: options.env ?? process.env,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  timeout: options.timeout ?? 15 * 60 * 1000,
  stdio: options.stdio,
});
const git = (...args) => {
  const result = run("git", args);
  gate(result.status === 0, "GIT_READ_FAILED", `git ${args[0]} failed`);
  return result.stdout.trim();
};
const profile = (eas, name, seen = []) => {
  gate(!seen.includes(name), "PROFILE_EXTENDS_CYCLE", `EAS profile cycle at ${name}`);
  const current = eas.build?.[name];
  gate(current, "BUILD_PROFILE_UNKNOWN", `Unknown EAS profile ${name}`);
  if (!current.extends) return clone(current);
  return { ...profile(eas, current.extends, [...seen, name]), ...clone(current), env: { ...profile(eas, current.extends, [...seen, name]).env, ...current.env } };
};

const fixtureDefinitions = Object.freeze({
  "answer-path-bypassed": ["ANDROID_ANSWER_ACTION_PATH_BYPASSED", (s) => { s.plugin = s.plugin.replace("buildActionPendingIntent(context, data, ACTION_ANSWER, 1)", "buildActivityPendingIntent(context, data, \"answer\", 1)"); }],
  "persistence-order-invalid": ["ANDROID_ACTION_PERSISTENCE_ORDER_INVALID", (s) => { s.plugin = s.plugin.replace("if (!ChillyChatNativeCallActionStore.captureTrustedNotificationAction(", "context.startActivity(Intent())\n    if (!ChillyChatNativeCallActionStore.captureTrustedNotificationAction("); }],
  "warm-intent-handler-missing": ["ANDROID_WARM_INTENT_HANDLER_MISSING", (s) => { s.plugin = s.plugin.replaceAll("override fun onNewIntent(intent: Intent)", "fun removedOnNewIntent(intent: Intent)"); }],
  "consume-not-atomic": ["ANDROID_ACTION_CONSUME_NOT_ATOMIC", (s) => { s.plugin = s.plugin.replace("@Synchronized\n  fun consume", "fun consume"); }],
  "duplicate-extends-ttl": ["ANDROID_ACTION_DUPLICATE_EXTENDS_TTL", (s) => { s.plugin = s.plugin.replace("Log.i(LOG_TAG, \"ACTION_BUFFERED\")\n        return true", "return capture(context, intent)"); }],
  "receiver-exposure": ["ANDROID_RECEIVER_EXPOSURE_INVALID", (s) => { s.plugin = s.plugin.replace('"android:exported": "false",\n      "android:name": ".ChillyChatCallNotificationActionReceiver"', '"android:exported": "true",\n      "android:name": ".ChillyChatCallNotificationActionReceiver"'); }],
  "native-server-authority": ["ANDROID_NATIVE_SERVER_AUTHORITY_VIOLATION", (s) => { s.plugin += "\nfun acceptInviteDirectly() {}\n"; }],
  "preaccept-media-authority": ["ANDROID_PREACCEPT_MEDIA_AUTHORITY_VIOLATION", (s) => { s.plugin += "\nfun requestLiveKitTokenAndStartMedia() {}\n"; }],
  "private-storage-field": ["ANDROID_NATIVE_ACTION_SCHEMA_PRIVATE_DATA", (s) => { s.plugin = s.plugin.replace('private const val KEY_CREATED_AT = "created_at"', 'private const val KEY_CREATED_AT = "created_at"\n  private const val KEY_TOKEN = "credential_token"'); }],
  "module-registration-removed": ["ANDROID_REQUIRED_MODULE_REGISTRATION_MISSING", (s) => { s.plugin = s.plugin.replaceAll("add(ChillyChatCallNotificationPackage())", "// removed package"); }],
  "generated-digest-stale": ["ANDROID_GENERATED_NATIVE_DIGEST_STALE", (s) => { s.expectedDigest = "0".repeat(64); }],
  "platform-proof-crossover": ["PLATFORM_PROOF_SCOPE_MISMATCH", (s) => { s.platform = "ios"; }],
});
export const fixtureIds = Object.freeze(Object.keys(fixtureDefinitions));

const sourceState = () => {
  const contract = readJson(contractPath);
  return { contract, plugin: readText(pluginPath), expectedDigest: contract.target.d1GeneratedSourceDigest, platform: contract.target.platform };
};
export const validateSourceModel = (state = sourceState(), observedDigest = state.expectedDigest) => {
  const plugin = state.plugin;
  const trustedLaunch = plugin.match(/fun launchAfterTrustedAction[\s\S]*?context\.startActivity\(intent\)/u)?.[0] ?? "";
  const warmIntentHandler = plugin.match(/override fun onNewIntent\(intent: Intent\) \{[\s\S]*?\n  \}/u)?.[0] ?? "";
  gate(state.platform === "android", "PLATFORM_PROOF_SCOPE_MISMATCH", "Android lifecycle evidence cannot be supplied for another platform");
  gate(plugin.includes("val answerIntent = buildActionPendingIntent(context, data, ACTION_ANSWER, 1)")
    && plugin.includes('ChillyChatCallNotifications.ACTION_ANSWER -> "answer"')
    && plugin.includes("ChillyChatCallNotifications.launchAfterTrustedAction(context, inviteId, threadId, nativeAction)")
    && !plugin.includes('buildActivityPendingIntent(context, data, "answer"'), "ANDROID_ANSWER_ACTION_PATH_BYPASSED", "Answer must traverse the explicit private receiver and trusted native persistence path");
  gate(trustedLaunch.indexOf("captureTrustedNotificationAction(") >= 0
    && trustedLaunch.indexOf("captureTrustedNotificationAction(") < trustedLaunch.search(/context\.startActivity\(/u),
  "ANDROID_ACTION_PERSISTENCE_ORDER_INVALID", "Trusted receiver persistence must precede Activity launch");
  gate(warmIntentHandler.includes("shouldEmitPendingAction(intent, ChillyChatNativeCallActionStore.readStatus(reactContext))")
    && warmIntentHandler.includes("pendingActionEmitter()")
    && !warmIntentHandler.includes("captureTrustedNotificationAction")
    && !plugin.includes("captureForActivity"),
  "ANDROID_WARM_INTENT_HANDLER_MISSING", "Warm Activity delivery must emit an already-persisted trusted action without manufacturing authority");
  gate(/@Synchronized\s+fun consume\(context: Context\)/u.test(plugin) && /val editor = removePending\(preferences\.edit\(\)\)/u.test(plugin),
    "ANDROID_ACTION_CONSUME_NOT_ATOMIC", "Pending actions must be consumed atomically");
  gate(/existingRequestKey == requestKey[\s\S]{0,120}ACTION_BUFFERED[\s\S]{0,80}return true/u.test(plugin),
    "ANDROID_ACTION_DUPLICATE_EXTENDS_TTL", "A duplicate must return without rewriting its original timestamps");
  gate(/"android:exported": "false",\s+"android:name": "\.ChillyChatCallNotificationActionReceiver"/u.test(plugin),
    "ANDROID_RECEIVER_EXPOSURE_INVALID", "Action receiver must be non-exported");
  gate(!/(?:acceptInviteDirectly|updateChillyChatCallInviteStatus|supabase\.functions\.invoke)/u.test(plugin),
    "ANDROID_NATIVE_SERVER_AUTHORITY_VIOLATION", "Native notification code must not accept a server invite");
  gate(!/(?:requestLiveKitTokenAndStartMedia|LiveKit|startCamera|startMicrophone|startMedia)/u.test(plugin),
    "ANDROID_PREACCEPT_MEDIA_AUTHORITY_VIOLATION", "Native notification code must not request tokens or activate media");
  gate(!/(?:KEY_|putString\()[^\n]*(?:credential|token|private_media|caller_name|raw_payload)/iu.test(plugin),
    "ANDROID_NATIVE_ACTION_SCHEMA_PRIVATE_DATA", "Pending action storage contains a forbidden private field class");
  gate((plugin.match(/add\(ChillyChatCallNotificationPackage\(\)\)/gu) ?? []).length >= 1,
    "ANDROID_REQUIRED_MODULE_REGISTRATION_MISSING", "Generated MainApplication package injection is absent");
  gate((plugin.match(/PendingIntent\.FLAG_UPDATE_CURRENT or PendingIntent\.FLAG_IMMUTABLE/gu) ?? []).length >= 2,
    "ANDROID_PENDING_INTENT_SECURITY_INVALID", "Activity and receiver PendingIntents must be immutable");
  gate(plugin.includes("Intent(context, ChillyChatCallNotificationActionReceiver::class.java)")
    && plugin.includes("component = launchComponent"), "ANDROID_PENDING_INTENT_TARGET_NOT_EXPLICIT", "PendingIntents must resolve to explicit app components");
  gate(/"android:exported": "false",\s+"android:name": "\.ChillyChatFirebaseMessagingService"/u.test(plugin),
    "ANDROID_SERVICE_EXPOSURE_INVALID", "Firebase service must be non-exported");
  gate(observedDigest === state.expectedDigest, "ANDROID_GENERATED_NATIVE_DIGEST_STALE", "Generated source digest differs from the D1 target binding",
    {observedDigest, expectedDigest: state.expectedDigest});
  const logCategories = [...plugin.matchAll(/Log\.i\([^,]+,\s*"([A-Z_]+)"\)/gu)].map((match) => match[1]).sort();
  const logging = state.contract.logging;
  const allowed = new Set([...logging.canonicalAllowlist, ...logging.observedNoncanonical.map((item) => item.category)]);
  gate(logCategories.every((category) => allowed.has(category)), "ANDROID_NATIVE_LOG_CATEGORY_UNCLASSIFIED", "Native log category is not classified");
  gate(!/Log\.[a-z]+\([^\n]*(?:threadId|inviteId|requestKey|callerName|raw_payload)/iu.test(plugin),
    "ANDROID_NATIVE_LOG_PRIVATE_VALUE", "Native logs must contain categories only");
  return {
    sourceAssertions: 17,
    serverAuthority: false,
    preacceptMediaAuthority: false,
    expectedGeneratedSourceDigest: state.expectedDigest,
    externalActionOriginRiskRequiresInstrumentation: true,
    logging: {categories: [...new Set(logCategories)], canonical: logCategories.filter((item) => logging.canonicalAllowlist.includes(item)), noncanonical: logging.observedNoncanonical, rawValuesRetained: false},
  };
};

export const runNegativeControls = () => {
  const accepted = sourceState();
  return Object.entries(fixtureDefinitions).map(([fixtureId, [expected, mutate]]) => {
    const fixture = clone(accepted);
    mutate(fixture);
    let observed = "NO_FAILURE";
    try { validateSourceModel(fixture, accepted.expectedDigest); } catch (error) { observed = error.code ?? "UNCLASSIFIED"; }
    gate(observed === expected, "NEGATIVE_CONTROL_FAILED", `${fixtureId}: expected ${expected}, observed ${observed}`);
    return { fixtureId, expected, observed, result: "FAIL_CLOSED" };
  });
};

export const evaluateD1SourceCapabilityParity = ({
  d1 = readJson(d1ContractPath), registry = readJson(registryPath), contract = readJson(contractPath), sourceReader = readText,
} = {}) => {
  const target = d1.targets.find((entry) => entry.targetId === contract.target.targetId);
  gate(target, "ANDROID_D1_CAPABILITY_TARGET_MISSING", "D1 target is absent");
  const required = [...new Set(target.requiredCapabilities)].sort();
  const contractRequired = [...new Set(contract.requiredCapabilities)].sort();
  gate(stable(required) === stable(contractRequired), "ANDROID_D1_CAPABILITY_CONTRACT_DRIFT", "D2A required capabilities differ from the D1 target");
  const applicable = registry.capabilities.filter((capability) => capability.platform === "android"
    && capability.targetApplicability.includes(target.targetId));
  const sourceProvided = applicable.filter((capability) => capability.providedBy.length > 0 && capability.providedBy.every((evidence) => {
    let content; try { content = sourceReader(evidence.path); } catch { return false; }
    return evidence.includes.every((marker) => content.includes(marker));
  })).map(({capabilityId}) => capabilityId).sort();
  const missing = required.filter((capability) => !sourceProvided.includes(capability));
  const extra = sourceProvided.filter((capability) => !required.includes(capability));
  gate(missing.length === 0, "ANDROID_D1_SOURCE_CAPABILITY_MISSING", `Missing ${missing.length} required source capabilities`);
  return {required: required.length, sourceProvided: sourceProvided.length, sourceMissing: missing.length, requiredCapabilities: required,
    sourceProvidedCapabilities: sourceProvided, missingCapabilities: missing, extraCapabilities: extra,
    derivation: {required: d1ContractPath, sourceProvided: registryPath, independent: true}, setDigest: digest(stable({required, sourceProvided}))};
};

export const validateInstalledDirectPackageSet = ({modules, packageJson, lock, installedPackageReader = (name) => JSON.parse(fs.readFileSync(path.join(modules, name, "package.json"), "utf8"))}) => {
  const production = packageJson.dependencies ?? {}; const development = packageJson.devDependencies ?? {};
  gate(Object.keys(production).every((name) => !Object.hasOwn(development, name)), "DEPENDENCY_DIRECT_CLASSIFICATION_OVERLAP", "A direct dependency is classified as both production and development");
  const declared = {...production, ...development};
  const lockedRoot = {...(lock.packages?.[""]?.dependencies ?? {}), ...(lock.packages?.[""]?.devDependencies ?? {})};
  gate(stable(declared) === stable(lockedRoot), "DEPENDENCY_LOCK_ROOT_MISMATCH", "Direct dependency declarations differ from the lock root");
  const identities = [];
  const selected = Object.keys(declared).sort();
  gate(selected.length > 0, "DEPENDENCY_DIRECT_SET_EMPTY", "No declared direct packages were found");
  for (const name of selected) {
    const locked = lock.packages?.[`node_modules/${name}`];
    gate(typeof locked?.version === "string", "DEPENDENCY_LOCK_IDENTITY_MISSING", `Locked direct package identity is missing for ${name}`);
    let installed; try { installed = installedPackageReader(name); } catch {
      throw new GateError("DEPENDENCY_INSTALLED_IDENTITY_MISSING", `Installed direct package identity is missing for ${name}`);
    }
    const expectedPackageName = locked.name ?? name;
    gate(installed.name === expectedPackageName && installed.version === locked.version, "DEPENDENCY_INSTALLED_VERSION_MISMATCH", `Installed direct package identity differs for ${name}`);
    identities.push(`${name}=${expectedPackageName}@${locked.version}`);
  }
  return {directPackageCount: identities.length, productionPackageCount: Object.keys(production).length, developmentPackageCount: Object.keys(development).length,
    identityDigest: digest(identities.join("\n")), versionsMatched: identities.length, allDeclaredDirectDependenciesValidated: true, pathsRecorded: false};
};

export const resolveDependencySet = () => {
  const packageBytes = read("package.json"); const lockBytes = read("package-lock.json");
  const packageHash = digest(packageBytes); const lockHash = digest(lockBytes);
  const packageJson = JSON.parse(packageBytes); const lock = JSON.parse(lockBytes);
  const modules = path.join(root, "node_modules");
  gate(fs.existsSync(modules), "DEPENDENCY_SET_MISMATCH", "The current D2A worktree dependency set is unavailable");
  const direct = validateInstalledDirectPackageSet({modules, packageJson, lock});
  return {
    modules,
    evidence: {
      packageSha256: packageHash,
      lockSha256: lockHash,
      ...direct,
      dependencySource: "CURRENT_D2A_WORKTREE_ONLY",
      status: "EXACT_LOCKED_ALL_DECLARED_DIRECT_PACKAGE_IDENTITIES"
    }
  };
};
const copyTracked = (destination) => {
  for (const relative of git("ls-files", "-z").split("\0").filter(Boolean)) {
    const source = path.join(root, relative);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { dereference: false });
  }
};
const generationEnv = (temp, resolvedProfile, modules) => ({
  PATH: `${path.dirname(process.execPath)}:${path.dirname(fs.realpathSync(path.join(modules, ".bin/expo")))}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
  CI: "1", EXPO_OFFLINE: "1", EXPO_NO_TELEMETRY: "1", npm_config_offline: "true", TMPDIR: temp,
  ...(resolvedProfile.env ?? {}),
});
const normalize = (content, temp, modules) => content.toString("binary").replaceAll(temp, "<DISPOSABLE>")
  .replaceAll(path.dirname(modules), "<DEPENDENCIES>").replaceAll("\r\n", "\n");
const autolinking = (temp, modules, env) => {
  const binary = path.join(modules, ".bin/expo-modules-autolinking");
  const output = path.join(temp, "android/.assurance");
  fs.mkdirSync(output, { recursive: true });
  for (const [name, args] of [
    ["expo-modules-resolve.json", ["resolve", "--platform", "android", "--project-root", temp, "--json"]],
    ["react-native-config.json", ["react-native-config", "--platform", "android", "--project-root", temp, "--source-dir", path.join(temp, "android"), "--json"]],
  ]) {
    const result = run(binary, args, { cwd: temp, env });
    gate(result.status === 0, "AUTOLINKING_EVIDENCE_FAILED", `${name} failed`);
    let parsed;
    try { parsed = JSON.parse(result.stdout); } catch { throw new GateError("AUTOLINKING_EVIDENCE_MALFORMED", `${name} emitted malformed JSON`); }
    fs.writeFileSync(path.join(output, name), `${stable(parsed).replaceAll(temp, "<DISPOSABLE>").replaceAll(path.dirname(modules), "<DEPENDENCIES>")}\n`, { mode: 0o600 });
  }
};
const generatedDigest = (temp, modules, paths) => digest(paths.slice().sort().map((relative) => {
  const absolute = path.join(temp, relative);
  gate(fs.existsSync(absolute), "GENERATED_NATIVE_SOURCE_MISSING", `Missing generated path ${relative}`);
  return `${relative}\0${digest(normalize(fs.readFileSync(absolute), temp, modules))}\n`;
}).join(""));
const stripXmlComments = (xml) => xml.replace(/<!--[\s\S]*?-->/gu, "");
const startTag = (xml, tag) => stripXmlComments(xml).match(new RegExp(`<${tag}(?=\\s|>)[^>]*>`, "u"))?.[0] ?? "";
const manifestApplicationAttribute = (manifest, name) => startTag(manifest, "application").match(new RegExp(`android:${name}="([^"]+)"`, "u"))?.[1] ?? null;
const resourcePath = (reference) => reference?.match(/^@xml\/([a-zA-Z0-9_]+)$/u)?.[1]
  ? `android/app/src/main/res/xml/${reference.slice(5)}.xml` : null;
const exactSharedPrefExclusion = (xml) => /<exclude\b(?=[^>]*\bdomain="sharedpref")(?=[^>]*\bpath="chilly_chat_native_call_action_v1\.xml")[^>]*\/?\s*>/u.test(stripXmlComments(xml));
const section = (xml, tag) => stripXmlComments(xml).match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "u"))?.[1] ?? "";
export const evaluateBackupPolicy = ({manifest, resources = {}}) => {
  const allowBackupFalse = manifestApplicationAttribute(manifest, "allowBackup") === "false";
  const legacyReference = manifestApplicationAttribute(manifest, "fullBackupContent");
  const extractionReference = manifestApplicationAttribute(manifest, "dataExtractionRules");
  const legacyPath = resourcePath(legacyReference);
  const extractionPath = resourcePath(extractionReference);
  const legacyXml = legacyPath ? resources[legacyPath] : null;
  const extractionXml = extractionPath ? resources[extractionPath] : null;
  const legacyExcluded = typeof legacyXml === "string" && exactSharedPrefExclusion(legacyXml);
  const cloudExcluded = typeof extractionXml === "string" && exactSharedPrefExclusion(section(extractionXml, "cloud-backup"));
  const deviceTransferExcluded = typeof extractionXml === "string" && exactSharedPrefExclusion(section(extractionXml, "device-transfer"));
  const clear = allowBackupFalse || (legacyExcluded && cloudExcluded && deviceTransferExcluded);
  return {
    clear, allowBackupFalse, legacyReference, extractionReference, legacyPath, extractionPath,
    legacyExcluded, cloudExcluded, deviceTransferExcluded,
    missingReferencedResources: [legacyPath && !legacyXml ? legacyPath : null, extractionPath && !extractionXml ? extractionPath : null].filter(Boolean),
  };
};
export const assertBackupPolicyClear = (policy) => gate(policy.clear, "ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING",
  "Generated backup policy does not exclude pending native action state");
const generatedSecurity = (temp, modules, manifest) => {
  const references = [resourcePath(manifestApplicationAttribute(manifest, "fullBackupContent")), resourcePath(manifestApplicationAttribute(manifest, "dataExtractionRules"))].filter(Boolean);
  const resources = Object.fromEntries(references.filter((relative) => fs.existsSync(path.join(temp, relative)))
    .map((relative) => [relative, fs.readFileSync(path.join(temp, relative), "utf8")]));
  const backupPolicy = evaluateBackupPolicy({manifest, resources});
  const securityPaths = ["android/app/src/main/AndroidManifest.xml", ...Object.keys(resources)].sort();
  const securityDigest = digest(securityPaths.map((relative) => `${relative}\0${digest(normalize(fs.readFileSync(path.join(temp, relative)), temp, modules))}\n`).join(""));
  const notifications = fs.readFileSync(path.join(temp, "android/app/src/main/java/com/chillywood/mobile/ChillyChatCallNotifications.kt"), "utf8");
  const component = (tag, name) => stripXmlComments(manifest).match(new RegExp(`<${tag}\\b(?=[^>]*android:name="${name.replaceAll(".", "\\.")}")[^>]*>`, "u"))?.[0] ?? "";
  const receiver = component("receiver", ".ChillyChatCallNotificationActionReceiver");
  const service = component("service", ".ChillyChatFirebaseMessagingService");
  const activity = component("activity", ".MainActivity");
  gate(receiver.includes('android:exported="false"'), "ANDROID_RECEIVER_EXPOSURE_INVALID", "Generated receiver must be non-exported");
  gate(service.includes('android:exported="false"'), "ANDROID_SERVICE_EXPOSURE_INVALID", "Generated Firebase service must be non-exported");
  gate(activity.includes('android:exported="true"'), "ANDROID_MAIN_ACTIVITY_EXPORT_CONTRACT_INVALID", "Generated deep-link Activity export marker is missing");
  gate((notifications.match(/PendingIntent\.FLAG_UPDATE_CURRENT or PendingIntent\.FLAG_IMMUTABLE/gu) ?? []).length >= 2,
    "ANDROID_PENDING_INTENT_SECURITY_INVALID", "Generated PendingIntents must be immutable");
  return {backupPolicy, securityDigest, boundPaths: securityPaths, componentAssertions: 4};
};
export const generateOnce = ({ retain = false } = {}) => {
  const contract = readJson(contractPath);
  const dependencies = resolveDependencySet();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-pr-d2a-"));
  fs.chmodSync(temp, 0o700);
  let retained = false;
  try {
    copyTracked(temp);
    fs.rmSync(path.join(temp, "android"), { recursive: true, force: true });
    fs.symlinkSync(dependencies.modules, path.join(temp, "node_modules"), "dir");
    const resolvedProfile = profile(readJson("eas.json"), contract.target.buildProfile);
    const env = generationEnv(temp, resolvedProfile, dependencies.modules);
    const expoCli = path.join(dependencies.modules, "expo/bin/cli");
    const template = path.join(dependencies.modules, "expo/template.tgz");
    const result = run(process.execPath, [expoCli, "prebuild", "--no-install", "--platform", "android", "--template", template], { cwd: temp, env });
    gate(result.status === 0, "GENERATED_ANDROID_SOURCE_FAILED", "Disposable offline Expo Android prebuild failed");
    autolinking(temp, dependencies.modules, env);
    const sourceDigest = generatedDigest(temp, dependencies.modules, contract.generatedAuthoritativePaths);
    const manifest = fs.readFileSync(path.join(temp, "android/app/src/main/AndroidManifest.xml"), "utf8");
    const security = generatedSecurity(temp, dependencies.modules, manifest);
    const output = { temp, env, modules: dependencies.modules, dependencyEvidence: dependencies.evidence, digest: sourceDigest, security };
    retained = retain;
    return output;
  } finally {
    if (!retained) fs.rmSync(temp, { recursive: true, force: true });
  }
};
export const generateThree = () => {
  const runs = [generateOnce(), generateOnce(), generateOnce()];
  const digests = runs.map((item) => item.digest);
  gate(new Set(digests).size === 1, "GENERATED_ANDROID_NONDETERMINISTIC", "Android generated source differs across three runs");
  const contract = readJson(contractPath);
  validateSourceModel(sourceState(), digests[0]);
  gate(new Set(runs.map((item) => item.security.securityDigest)).size === 1, "GENERATED_ANDROID_SECURITY_EVIDENCE_NONDETERMINISTIC", "Android backup/component evidence differs across three runs");
  return {
    runs: "3/3", digest: digests[0], expected: contract.target.d1GeneratedSourceDigest,
    securityDigest: runs[0].security.securityDigest,
    securityBoundPaths: runs[0].security.boundPaths,
    backupPolicy: runs[0].security.backupPolicy,
    generatedComponentAssertions: runs[0].security.componentAssertions,
  };
};

const findSdk = () => {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean);
  const sdkmanager = run("sh", ["-c", "command -v sdkmanager"]);
  if (sdkmanager.status === 0) {
    let cursor = path.dirname(fs.realpathSync(sdkmanager.stdout.trim()));
    while (cursor !== path.dirname(cursor)) {
      if (fs.existsSync(path.join(cursor, "platforms"))) { candidates.push(cursor); break; }
      cursor = path.dirname(cursor);
    }
  }
  const sdk = candidates.find((candidate) => fs.existsSync(path.join(candidate, "platforms")));
  gate(sdk, "ANDROID_SDK_MISSING", "Android SDK is not available");
  return sdk;
};
export const injectTests = (temp) => {
  const unitTarget = path.join(temp, "android/app/src/test/java/com/chillywood/mobile/ChillyChatNativeCallActionStoreTest.kt");
  const instrumentationTarget = path.join(temp, "android/app/src/androidTest/java/com/chillywood/mobile/ChillyChatNativeLifecycleInstrumentationTest.kt");
  const lifecycleProbeTarget = path.join(temp, "android/app/src/debug/java/com/chillywood/mobile/ChillyChatLifecycleProbeActivity.kt");
  fs.mkdirSync(path.dirname(unitTarget), { recursive: true });
  fs.mkdirSync(path.dirname(instrumentationTarget), { recursive: true });
  fs.mkdirSync(path.dirname(lifecycleProbeTarget), { recursive: true });
  fs.copyFileSync(path.join(root, unitTemplate), unitTarget);
  fs.copyFileSync(path.join(root, instrumentationTemplate), instrumentationTarget);
  fs.writeFileSync(lifecycleProbeTarget, `package com.chillywood.mobile

import android.app.Activity

class ChillyChatLifecycleProbeActivity : Activity()
`, "utf8");
  const debugManifestPath = path.join(temp, "android/app/src/debug/AndroidManifest.xml");
  const debugManifest = fs.readFileSync(debugManifestPath, "utf8");
  const debugApplication = debugManifest.match(/<application\b[^>]*\/>/u)?.[0];
  gate(debugApplication, "ANDROID_DEBUG_MANIFEST_APPLICATION_MISSING", "Disposable debug manifest application marker is absent");
  fs.writeFileSync(debugManifestPath, debugManifest.replace(debugApplication, `${debugApplication.slice(0, -2)}>
        <activity android:name=".ChillyChatLifecycleProbeActivity" android:exported="false" />
    </application>`), "utf8");
  const gradlePath = path.join(temp, "android/app/build.gradle");
  const original = fs.readFileSync(gradlePath, "utf8");
  fs.writeFileSync(gradlePath, `${original.trimEnd()}

android {
    defaultConfig { testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner" }
    testOptions { unitTests.includeAndroidResources = false }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("org.robolectric:robolectric:4.13")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
}
`, "utf8");
};
const gradleEvidence = (generated) => {
  const sdk = findSdk();
  const javaHome = process.env.JAVA_HOME;
  gate(javaHome && fs.existsSync(javaHome), "JAVA_HOME_MISSING", "A local Java runtime is required for Gradle");
  fs.writeFileSync(path.join(generated.temp, "android/local.properties"), `sdk.dir=${sdk.replaceAll("\\", "\\\\")}\n`, { mode: 0o600 });
  injectTests(generated.temp);
  const tasks = readJson(contractPath).requiredGradleTasks;
  const wrapper = path.join(generated.temp, "android/gradlew");
  const env = { ...generated.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, GRADLE_USER_HOME: path.join(os.homedir(), ".gradle") };
  const results = [];
  for (const task of tasks) {
    const started = Date.now();
    const result = run(wrapper, [task, "--no-daemon", "--console=plain", "--stacktrace"], { cwd: path.join(generated.temp, "android"), env, timeout: 2 * 60 * 60 * 1000 });
    results.push({ task, passed: result.status === 0, durationMs: Date.now() - started, category: result.status === 0 ? "PASS" : "GRADLE_TASK_FAILED" });
    const diagnosticLines = `${result.stderr ?? ""}\n${result.stdout ?? ""}`
      .replaceAll(generated.temp, "<DISPOSABLE>")
      .replaceAll(root, "<REPOSITORY>")
      .replaceAll(generated.modules, "<DEPENDENCIES>")
      .replaceAll(sdk, "<ANDROID_SDK>")
      .replaceAll(os.homedir(), "<OWNER_HOME>")
      .split("\n")
      .filter(Boolean);
    const errorLines = diagnosticLines.filter((line) => /(?:^e:|\berror\b|fail(?:ed|ure)|exception|what went wrong|compilation|unresolved reference|daemon disappeared|out of memory|could not)/iu.test(line));
    const diagnostic = errorLines.slice(-48)
      .join(" | ")
      .slice(0, 2400);
    gate(result.error?.code !== "ETIMEDOUT", "ANDROID_GRADLE_TASK_TIMEOUT", `${task} exceeded the two-hour native task ceiling`, { task });
    gate(result.status === 0, "ANDROID_GRADLE_COMPILE_FAILED", `${task} failed${diagnostic ? `: ${diagnostic}` : ""}`, { task });
  }
  return { results, sdk, env };
};
const adbRun = (serial, args, options = {}) => run("adb", ["-s", serial, ...args], { ...options, timeout: options.timeout ?? 5 * 60 * 1000 });
const scenarioDefinitions = Object.freeze({
  FOREGROUND: {method: "activityCreationCapturesAndConsumesOnce", runner: "INSTRUMENTATION"},
  BACKGROUND: {method: "backgroundActionResumesAndConsumesOnce", runner: "INSTRUMENTATION"},
  ACTIVITY_RECREATION: {method: "recreationRetainsPendingAction", runner: "INSTRUMENTATION"},
  ACTIVITY_DESTROYED_PROCESS_ALIVE: {method: "destroyedActivityRetainsPendingAction", runner: "INSTRUMENTATION"},
  PROCESS_COLD: {method: "processColdReceiverPersistsBeforeReactAndConsumesOnce", runner: "INSTRUMENTATION"},
  REACT_CONTEXT_UNAVAILABLE: {method: "receiverBeforeReactContextRetainsAction", runner: "INSTRUMENTATION"},
  WARM_NEW_INTENT: {method: "warmIntentReusesActivityAndCannotReplay", runner: "INSTRUMENTATION"},
  DECLINE: {method: "declineForegroundAndCold", runner: "INSTRUMENTATION"},
  EXPIRATION: {method: "expiredActionRejectedAndDeleted", runner: "INSTRUMENTATION"},
  MALFORMED_ADVERSARIAL: {method: "explicitReceiverRejectsUnsupportedActionWithoutCrash", runner: "INSTRUMENTATION"},
  EXTERNAL_CUSTOM_SCHEME_ORIGIN: {method: "verifyExternallyLaunchedActionWasNotPersisted", runner: "EXTERNAL_URI_THEN_INSTRUMENTATION"},
  BACKUP_POLICY: {method: "backupPolicyPreflightConfirmedOnInstalledDebugApp", runner: "BACKUP_PREFLIGHT_THEN_INSTRUMENTATION"},
});
const methodDeclared = (template, method) => new RegExp(`@Test\\s+fun\\s+${method}\\s*\\(`, "u").test(template);
export const evaluateScenarioMatrix = (template = readText(instrumentationTemplate), backupPolicyClear = false) => {
  const required = readJson(contractPath).lifecycleScenarios;
  const mappings = required.map((scenario) => ({scenario, ...scenarioDefinitions[scenario]}));
  const mappingValid = mappings.every(({method}) => typeof method === "string" && method.length > 0)
    && new Set(mappings.map(({method}) => method)).size === required.length;
  const executionPlan = mappings.filter(({scenario, method, runner}) => methodDeclared(template, method) && typeof runner === "string"
    && (scenario !== "BACKUP_POLICY" || backupPolicyClear));
  const implemented = executionPlan.map(({scenario}) => scenario);
  return {required, implemented, missing: required.filter((scenario) => !implemented.includes(scenario)), executionPlan,
    mappingValid, complete: mappingValid && implemented.length === required.length};
};
export const assertCompleteScenarioMatrix = (matrix) => gate(matrix.complete, "ANDROID_EMULATOR_SCENARIO_MATRIX_INCOMPLETE",
  `Missing mandatory scenarios: ${matrix.missing.join(",")}`);
export const assertNativeEntryPreflight = ({report = readJson(reportPath), template = readText(instrumentationTemplate), backupPolicyClear = false} = {}) => {
  const confirmedBackupDefect = report.productDefects?.some(({code, status}) => code === "ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING"
    && !String(status).startsWith("RESOLVED"));
  gate(!confirmedBackupDefect, "ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING", "Confirmed generated backup defect blocks native compilation and installation");
  const matrix = evaluateScenarioMatrix(template, backupPolicyClear); assertCompleteScenarioMatrix(matrix); return matrix;
};
const packagePresent = (serial, packageName) => {
  const result = adbRun(serial, ["shell", "pm", "path", packageName]);
  return result.status === 0 && result.stdout.trim().startsWith("package:");
};
const emulatorEvidence = (generated, native, installState) => {
  const scenarioMatrix = evaluateScenarioMatrix(readText(instrumentationTemplate), generated.security.backupPolicy.clear);
  assertCompleteScenarioMatrix(scenarioMatrix);
  const devices = run("adb", ["devices"]);
  gate(devices.status === 0, "ANDROID_ADB_UNAVAILABLE", "ADB is unavailable");
  const serials = devices.stdout.split("\n").slice(1).map((line) => line.trim().split(/\s+/u)).filter((parts) => parts[1] === "device" && parts[0].startsWith("emulator-")).map((parts) => parts[0]);
  gate(serials.length === 1, "ANDROID_EMULATOR_NOT_EXACTLY_ONE", "Exactly one local Android emulator must be available");
  const serial = serials[0];
  installState.serial = serial;
  const appPreexisting = packagePresent(serial, installState.appPackage);
  const testPreexisting = packagePresent(serial, installState.testPackage);
  installState.preexistingChecked = true;
  installState.preexistingNone = !appPreexisting && !testPreexisting;
  gate(installState.preexistingNone,
    "ANDROID_EMULATOR_PACKAGE_PREEXISTED", "Target or test package already existed on the selected emulator");
  const appApk = path.join(generated.temp, "android/app/build/outputs/apk/debug/app-debug.apk");
  const testApk = path.join(generated.temp, "android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk");
  gate(fs.existsSync(appApk) && fs.existsSync(testApk), "ANDROID_TEST_APK_MISSING", "Disposable debug/test APKs were not produced");
  const appInstall = adbRun(serial, ["install", appApk]);
  installState.installedApp = packagePresent(serial, installState.appPackage);
  const appVerified = appInstall.status === 0 && installState.installedApp;
  gate(appVerified, "ANDROID_DEBUG_APK_INSTALL_FAILED", "Disposable debug APK installation failed");
  const testInstall = adbRun(serial, ["install", testApk]);
  installState.installedTest = packagePresent(serial, installState.testPackage);
  const testVerified = testInstall.status === 0 && installState.installedTest;
  gate(testVerified, "ANDROID_TEST_APK_INSTALL_FAILED", "Disposable test APK installation failed");
  const component = "com.chillywood.mobile.test/androidx.test.runner.AndroidJUnitRunner";
  gate(scenarioMatrix.executionPlan.length === scenarioMatrix.required.length
    && new Set(scenarioMatrix.executionPlan.map(({method}) => method)).size === scenarioMatrix.required.length,
  "ANDROID_EMULATOR_SCENARIO_EXECUTION_PLAN_INVALID", "Every required scenario must have one unique executable instrumentation method");
  const methodResults = [];
  for (const {scenario, method, runner} of scenarioMatrix.executionPlan) {
    if (runner === "EXTERNAL_URI_THEN_INSTRUMENTATION") {
      adbRun(serial, ["shell", "pm", "clear", "com.chillywood.mobile"]);
      adbRun(serial, ["shell", "am", "force-stop", "com.chillywood.mobile"]);
      const externalUri = "chillywoodmobile://chat/11111111-1111-4111-8111-111111111111?callInviteId=22222222-2222-4222-8222-222222222222&nativeCallAction=answer";
      const launch = adbRun(serial, ["shell", "am", "start", "-W", "-n", "com.chillywood.mobile/.MainActivity", "-a", "android.intent.action.VIEW", "-d", externalUri]);
      gate(launch.status === 0, "ANDROID_EXTERNAL_ACTION_TEST_SETUP_FAILED", "External custom-scheme launch setup failed");
    }
    const result = adbRun(serial, ["shell", "am", "instrument", "-w", "-e", "class", `com.chillywood.mobile.ChillyChatNativeLifecycleInstrumentationTest#${method}`, component]);
    const passed = result.status === 0 && /OK \(1 test\)/u.test(result.stdout) && !result.stdout.includes("FAILURES!!!");
    const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
      .split("\n")
      .filter((line) => /(?:FAILURES|Failure in|ComparisonFailure|AssertionError|expected:|but was:|INSTRUMENTATION_FAILED)/u.test(line))
      .slice(-24)
      .join(" | ")
      .slice(0, 1600);
    if (scenario === "EXTERNAL_CUSTOM_SCHEME_ORIGIN" && !passed) throw new GateError("ANDROID_EXTERNAL_NATIVE_ACTION_ORIGIN_UNTRUSTED",
      "An external custom-scheme Activity launch persisted a trusted native call action", {compiled: true, emulatorReproduced: true, identifiersRecorded: false});
    methodResults.push({scenario, method, runner, passed});
    gate(passed, "ANDROID_EMULATOR_LIFECYCLE_FAILED", `${scenario} failed${diagnostic ? `: ${diagnostic}` : ""}`);
  }
  gate(methodResults.length === scenarioMatrix.required.length && methodResults.every(({passed}) => passed),
    "ANDROID_EMULATOR_SCENARIO_EXECUTION_INCOMPLETE", "Every required scenario must execute exactly once and pass");
  return { emulatorCount: 1, serialRecorded: false, methodResults, scenarioMatrix, externalOriginRejected: true, signedArtifactProof: false, physicalDeviceProof: false };
};
const cleanupSelectedEmulator = (state) => {
  if (!state.serial) return {attempted: false, verified: true};
  if (!state.installedTest && !state.installedApp) return {attempted: false, verified: true};
  if (state.installedTest) gate(adbRun(state.serial, ["uninstall", state.testPackage]).status === 0,
    "ANDROID_TEST_PACKAGE_CLEANUP_FAILED", "Failed to remove the test package installed by this run");
  if (state.installedApp) gate(adbRun(state.serial, ["uninstall", state.appPackage]).status === 0,
    "ANDROID_APP_PACKAGE_CLEANUP_FAILED", "Failed to remove the app package installed by this run");
  gate(!packagePresent(state.serial, state.testPackage) && !packagePresent(state.serial, state.appPackage),
    "ANDROID_EMULATOR_PACKAGE_CLEANUP_UNVERIFIED", "Installed packages remain on the selected emulator");
  return {attempted: state.installedTest || state.installedApp, verified: true};
};

export const deterministicEvidenceDigest = (value) => {
  const normalized = clone(value);
  delete normalized.deterministicEvidenceSha256;
  for (const task of normalized.gradle?.tasks ?? []) delete task.durationMs;
  return digest(stable(normalized));
};

export const evaluateMicNativeAudioMatrix = (template = readText(micInstrumentationTemplate), hostMethods = []) => {
  const required = readJson(micContractPath).nativeLayer.audioMatrix.required;
  const implemented = required.filter(({method, runner}) => runner.startsWith("INSTRUMENTATION")
    ? methodDeclared(template, method) : hostMethods.includes(method));
  return {required: required.map(({id}) => id), implemented: implemented.map(({id}) => id),
    missing: required.filter(({id}) => !implemented.some((entry) => entry.id === id)).map(({id}) => id),
    complete: implemented.length === required.length};
};
export const assertCompleteMicNativeAudioMatrix = (matrix = evaluateMicNativeAudioMatrix()) => gate(matrix.complete,
  "ANDROID_MIC_NATIVE_AUDIO_MATRIX_INCOMPLETE", `Missing native microphone scenarios: ${matrix.missing.join(",")}`,
  {classification: "BLOCKED_INTERNAL", required: matrix.required.length, implemented: matrix.implemented.length});

export const runIndependentMicNativeLayer = () => {
  const audioMatrix = evaluateMicNativeAudioMatrix(); assertCompleteMicNativeAudioMatrix(audioMatrix);
  assertNativeEntryPreflight({backupPolicyClear: true});
  const generated = generateOnce({retain: true});
  const installState = {serial: null, appPackage: "com.chillywood.mobile", testPackage: "com.chillywood.mobile.test", preexistingChecked: false, preexistingNone: false, installedApp: false, installedTest: false};
  try {
    const sdk = findSdk();
    const javaHome = process.env.JAVA_HOME;
    gate(javaHome && fs.existsSync(javaHome), "JAVA_HOME_MISSING", "A local Java runtime is required for Gradle");
    fs.writeFileSync(path.join(generated.temp, "android/local.properties"), `sdk.dir=${sdk.replaceAll("\\", "\\\\")}\n`, {mode: 0o600});
    const testTarget = path.join(generated.temp, "android/app/src/androidTest/java/com/chillywood/mobile/ChillyChatMicControlInstrumentationTest.kt");
    fs.mkdirSync(path.dirname(testTarget), {recursive: true});
    fs.copyFileSync(path.join(root, micInstrumentationTemplate), testTarget);
    const gradlePath = path.join(generated.temp, "android/app/build.gradle");
    fs.appendFileSync(gradlePath, `

android { defaultConfig { testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner" } }
dependencies {
  androidTestImplementation("androidx.test:core:1.6.1")
  androidTestImplementation("androidx.test.ext:junit:1.2.1")
  androidTestImplementation("androidx.test:runner:1.6.2")
}
`);
    const env = {...generated.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, GRADLE_USER_HOME: path.join(os.homedir(), ".gradle")};
    const wrapper = path.join(generated.temp, "android/gradlew");
    const tasks = [":app:compileDebugKotlin", ":app:compileDebugAndroidTestKotlin", ":app:assembleDebug", ":app:assembleDebugAndroidTest"];
    const taskResults = tasks.map((task) => {
      const result = run(wrapper, [task, "--no-daemon", "--console=plain"], {cwd: path.join(generated.temp, "android"), env, timeout: 2 * 60 * 60 * 1000});
      gate(result.error?.code !== "ETIMEDOUT", "ANDROID_MIC_NATIVE_TASK_TIMEOUT", `${task} exceeded the two-hour native task ceiling`);
      gate(result.status === 0, "ANDROID_MIC_NATIVE_COMPILE_FAILED", `${task} failed`);
      return {task, result: "PASS"};
    });
    const devices = run("adb", ["devices"]);
    gate(devices.status === 0, "ANDROID_ADB_UNAVAILABLE", "ADB is unavailable");
    const serials = devices.stdout.split("\n").slice(1).map((line) => line.trim().split(/\s+/u)).filter((parts) => parts[1] === "device" && parts[0].startsWith("emulator-")).map((parts) => parts[0]);
    gate(serials.length === 1, "ANDROID_EMULATOR_NOT_EXACTLY_ONE", "Exactly one local Android emulator must be available");
    installState.serial = serials[0];
    installState.preexistingChecked = true;
    installState.preexistingNone = !packagePresent(installState.serial, installState.appPackage) && !packagePresent(installState.serial, installState.testPackage);
    gate(installState.preexistingNone, "ANDROID_EMULATOR_PACKAGE_PREEXISTED", "Target or test package already existed on the selected emulator");
    const appApk = path.join(generated.temp, "android/app/build/outputs/apk/debug/app-debug.apk");
    const testApk = path.join(generated.temp, "android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk");
    const appInstall = adbRun(installState.serial, ["install", appApk]);
    installState.installedApp = packagePresent(installState.serial, installState.appPackage);
    const appVerified = appInstall.status === 0 && installState.installedApp;
    gate(appVerified, "ANDROID_DEBUG_APK_INSTALL_FAILED", "Disposable debug APK installation failed");
    const testInstall = adbRun(installState.serial, ["install", testApk]);
    installState.installedTest = packagePresent(installState.serial, installState.testPackage);
    const testVerified = testInstall.status === 0 && installState.installedTest;
    gate(testVerified, "ANDROID_TEST_APK_INSTALL_FAILED", "Disposable test APK installation failed");
    const instrumentation = adbRun(installState.serial, ["shell", "am", "instrument", "-w", "-e", "class", "com.chillywood.mobile.ChillyChatMicControlInstrumentationTest", "com.chillywood.mobile.test/androidx.test.runner.AndroidJUnitRunner"]);
    gate(instrumentation.status === 0 && /OK \(4 tests\)/u.test(instrumentation.stdout) && !instrumentation.stdout.includes("FAILURES!!!"),
      "ANDROID_MIC_NATIVE_INSTRUMENTATION_FAILED", "Native WebRTC mic instrumentation did not pass 4/4");
    return {status: "ANDROID_MIC_NATIVE_AUDIO_MATRIX_CLEAR", audioMatrix, generatedSourceDigest: generated.digest, gradle: taskResults, emulatorSerialRecorded: false, providerContact: false, physicalProof: false, signedArtifactProof: false};
  } finally {
    try { cleanupSelectedEmulator(installState); } finally { fs.rmSync(generated.temp, {recursive: true, force: true}); }
  }
};

export const evaluate = ({ native = false, emulator = false, fixture } = {}) => {
  if (fixture) {
    gate(fixtureDefinitions[fixture], "UNKNOWN_FIXTURE", `Unknown fixture ${fixture}`);
    const state = sourceState();
    fixtureDefinitions[fixture][1](state);
    validateSourceModel(state, sourceState().expectedDigest);
    throw new GateError("NEGATIVE_FIXTURE_DID_NOT_FAIL", `${fixture} was accepted`);
  }
  const source = validateSourceModel();
  const sourceCapabilityParity = evaluateD1SourceCapabilityParity();
  const negativeResults = runNegativeControls();
  const generation = generateThree();
  if (!generation.backupPolicy.clear) {
    const blocker = {code: "ANDROID_NATIVE_ACTION_BACKUP_EXCLUSION_MISSING", classification: "BLOCKED_INTERNAL_NATIVE_PRODUCT_DEFECT", compiled: false};
    const evidence = {
      schemaVersion: 1, evidenceId: "android-generated-native-lifecycle-evidence-v1", implementationHead: git("rev-parse", "HEAD"), implementationTree: git("rev-parse", "HEAD^{tree}"),
      targetId: readJson(contractPath).target.targetId, source, generation,
      gradle: {status: "NOT_RUN_FAIL_CLOSED_BEFORE_TEST_INJECTION"},
      instrumentation: {status: "NOT_RUN_FAIL_CLOSED_BEFORE_EMULATOR", scenarioMatrix: evaluateScenarioMatrix(readText(instrumentationTemplate), false)},
      d1SourceCapabilityParity: sourceCapabilityParity,
      compiledRuntimeCapabilityParity: {provided: "UNKNOWN", missing: "UNKNOWN", status: "BLOCKED_INTERNAL_NOT_INDEPENDENTLY_MEASURED"},
      negativeControls: {required: 12, passed: negativeResults.length, results: negativeResults}, blocker,
      status: blocker.classification, proofTiers: readJson(contractPath).proofTiers,
      nonInterference: {providerContact: false, releaseBuild: false, signedArtifact: false, ota: false, physicalDevice: false, productSourceMutation: false},
      cleanup: {disposableProjectRemoved: true, debugAndTestApksRemoved: true, emulatorPackagesRemoved: false, selectedEmulatorOnly: true, generatedAndroidCommitted: false, deviceSerialRecorded: false},
      deterministicNormalization: ["gradle.tasks[].durationMs omitted from deterministic hash"],
    };
    evidence.deterministicEvidenceSha256 = deterministicEvidenceDigest(evidence);
    throw new GateError(blocker.code, "Generated backup policy does not exclude pending native action state", {evidence});
  }
  let generated;
  let gradle;
  let instrumentation;
  let blocker = null;
  const installState = {serial: null, appPackage: "com.chillywood.mobile", testPackage: "com.chillywood.mobile.test", preexistingChecked: false, preexistingNone: false, installedApp: false, installedTest: false};
  let emulatorCleanup = {attempted: false, verified: true};
  try {
    if (native || emulator) {
      generated = generateOnce({ retain: true });
      gradle = gradleEvidence(generated);
      if (emulator) {
        try { instrumentation = emulatorEvidence(generated, gradle, installState); } catch (error) {
          if (error.code === "ANDROID_EXTERNAL_NATIVE_ACTION_ORIGIN_UNTRUSTED") blocker = { code: error.code, classification: "BLOCKED_INTERNAL_NATIVE_PRODUCT_DEFECT", ...error.details };
          else throw error;
        }
      }
    }
  } finally {
    try {
      if (emulator) emulatorCleanup = cleanupSelectedEmulator(installState);
    } finally {
      if (generated?.temp) fs.rmSync(generated.temp, { recursive: true, force: true });
    }
  }
  const evidence = {
    schemaVersion: 1,
    evidenceId: "android-generated-native-lifecycle-evidence-v1",
    implementationHead: git("rev-parse", "HEAD"),
    implementationTree: git("rev-parse", "HEAD^{tree}"),
    targetId: readJson(contractPath).target.targetId,
    source,
    generation,
    gradle: gradle ? { tasks: gradle.results, localDebugTestCompilationOnly: true } : { status: "NOT_RUN" },
    instrumentation: instrumentation ?? { status: emulator ? "BLOCKED_BY_PRODUCT_DEFECT" : "NOT_RUN", emulatorProofOnly: true, physicalProof: false },
    d1SourceCapabilityParity: sourceCapabilityParity,
    compiledRuntimeCapabilityParity: {provided: "UNKNOWN", missing: "UNKNOWN", status: "BLOCKED_INTERNAL_NOT_INDEPENDENTLY_MEASURED"},
    negativeControls: { required: 12, passed: negativeResults.length, results: negativeResults },
    blocker,
    status: blocker?.classification ?? (emulator ? "ANDROID_EMULATOR_LIFECYCLE_CLEAR" : native ? "ANDROID_NATIVE_COMPILE_CLEAR" : "ANDROID_GENERATED_NATIVE_SOURCE_CLEAR"),
    proofTiers: readJson(contractPath).proofTiers,
    nonInterference: { providerContact: false, releaseBuild: false, signedArtifact: false, ota: false, physicalDevice: false, productSourceMutation: false },
    cleanup: { disposableProjectRemoved: true, debugAndTestApksRemoved: true, emulatorPackagesRemoved: emulatorCleanup.verified && emulatorCleanup.attempted, selectedEmulatorOnly: true, generatedAndroidCommitted: false, deviceSerialRecorded: false },
    deterministicNormalization: ["gradle.tasks[].durationMs omitted from deterministic hash"],
  };
  evidence.deterministicEvidenceSha256 = deterministicEvidenceDigest(evidence);
  if (blocker) throw new GateError(blocker.code, "D2A reproduced a current generated/product-native defect", { evidence });
  return evidence;
};

const parseArgs = (argv) => {
  const options = {};
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--native") options.native = true;
    else if (arg === "--emulator") { options.native = true; options.emulator = true; }
    else if (arg.startsWith("--fixture=")) options.fixture = arg.slice(10);
    else throw new GateError("UNKNOWN_FLAG", `Unknown flag ${arg}`);
  }
  return options;
};
const main = () => {
  const json = process.argv.includes("--json");
  try {
    const options = parseArgs(process.argv.slice(2));
    const evidence = evaluate(options);
    if (json) process.stdout.write(`${JSON.stringify({ ok: true, evidence })}\n`);
    else console.log(`android native lifecycle: PASS — ${evidence.status}; generation 3/3; negative controls 12/12`);
  } catch (error) {
    const payload = { ok: false, findings: [{ code: error.code ?? "UNCLASSIFIED_FAILURE", message: error.message }], ...(error.details?.evidence ? { evidence: error.details.evidence } : {}) };
    if (json) process.stdout.write(`${JSON.stringify(payload)}\n`);
    else console.error(`android native lifecycle: FAIL — ${payload.findings[0].code}: ${payload.findings[0].message}`);
    process.exitCode = 1;
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
