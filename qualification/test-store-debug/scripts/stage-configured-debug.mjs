import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compileEnvironment, sourceFiles, verifyLock, verifyAutolink, verifyPodLock } from "./compile-native.mjs";

const require = createRequire(import.meta.url);
const { descriptor, applicationId } = require("../config.js");
const source = path.resolve(import.meta.dirname, "..");
const sha = value => createHash("sha256").update(value).digest("hex");
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const object = value => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const same = (a, b) => JSON.stringify(a, (_key, v) => object(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
  === JSON.stringify(b, (_key, v) => object(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const fail = code => { throw new Error(`scq_local_build_${code}`); };
const needed = (condition, code = "invalid_input") => { if (!condition) fail(code); };
const catalogueKeys = ["providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId", "amountMinor", "currency"];
const buildOnlyFiles = sourceFiles.filter(name => !name.startsWith("tests/") && !name.startsWith("scripts/") && name !== "README.md");
export const stagedSourceFiles = Object.freeze([...buildOnlyFiles]);

/** JSON.parse alone accepts duplicate identity keys. Reject ambiguous input,
 * excessive nesting and trailing tokens before validating the exact schema. */
export function parsePrivateJson(raw) {
  needed(typeof raw === "string" && Buffer.byteLength(raw) <= 131072);
  let at = 0, nodes = 0;
  const space = () => { while (/\s/u.test(raw[at] ?? "") && at < raw.length) at++; };
  const string = () => {
    const start = at; needed(raw[at++] === '"');
    while (at < raw.length) { if (raw[at] === "\\") { at += 2; continue; } if (raw[at++] === '"') return JSON.parse(raw.slice(start, at)); }
    return fail("invalid_input");
  };
  const value = depth => {
    needed(depth <= 24 && ++nodes <= 5000); space();
    if (raw[at] === '"') { string(); return; }
    if (raw[at] === "{" || raw[at] === "[") {
      const isObject = raw[at++] === "{", end = isObject ? "}" : "]", keys = new Set(); space();
      if (raw[at] === end) { at++; return; }
      while (at < raw.length) {
        if (isObject) { space(); const key = string(); needed(!keys.has(key)); keys.add(key); space(); needed(raw[at++] === ":"); }
        value(depth + 1); space(); if (raw[at] === end) { at++; return; } needed(raw[at++] === ",");
      }
      return fail("invalid_input");
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(raw.slice(at));
    needed(token); at += token[0].length;
  };
  try { value(0); space(); needed(at === raw.length); return JSON.parse(raw); } catch { return fail("invalid_input"); }
}

export function validateInput(value, platform, now = Date.now()) {
  needed(["ios", "android"].includes(platform));
  needed(exact(value, ["schema", "descriptor", "readback"]) && value.schema === "scq-local-build-input-v1");
  let native; try { native = descriptor(JSON.stringify(value.descriptor), platform); } catch { return fail("invalid_descriptor"); }
  needed(native, "invalid_descriptor");
  const d = value.descriptor, r = value.readback;
  needed(!["44662861", "c5629a24"].includes(d.projectId.toLowerCase().replace(/^proj/u, "")), "excluded_project");
  needed(exact(r, ["observedAt", "expiresAt", "project", "receiver", "catalog", "providerEvidenceSha256", "receiverEvidenceSha256"]));
  needed(typeof r.observedAt === "string" && typeof r.expiresAt === "string");
  const observed = Date.parse(r.observedAt), expires = Date.parse(r.expiresAt);
  needed(Number.isFinite(now) && Number.isFinite(observed) && Number.isFinite(expires) && observed <= now && now < expires
    && expires > observed && expires - observed <= 3600000, "readback_expired");
  needed(digest(r.providerEvidenceSha256) && digest(r.receiverEvidenceSha256));
  needed(exact(r.project, ["id", "appIds", "stores", "publicSdkKeySha256"]) && r.project.id === d.projectId
    && same(r.project.appIds, [d.appId]) && same(r.project.stores, ["TEST_STORE"])
    && r.project.publicSdkKeySha256 === sha(d.publicSdkKey), "provider_readback_mismatch");
  const c = r.receiver;
  needed(exact(c, ["endpoint", "connectionId", "connectionRevision", "projectId", "appId", "phase", "maxEntries", "maxDeliveries", "maxTotalBytes", "entriesUsed", "deliveriesUsed", "totalBytesUsed"]));
  let url; try { url = new URL(c.endpoint); } catch { return fail("receiver_readback_mismatch"); }
  needed(url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
    && url.pathname === "/functions/v1/isolated-test-store-qualification-v1" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && c.connectionId === d.qualificationConnectionId && c.connectionRevision === d.qualificationConnectionRevision
    && c.projectId === d.projectId && c.appId === d.appId && c.phase === "capturing", "receiver_readback_mismatch");
  for (const [cap, used, maximum] of [["maxEntries", "entriesUsed", 256], ["maxDeliveries", "deliveriesUsed", 1024], ["maxTotalBytes", "totalBytesUsed", 67108864]])
    needed(Number.isSafeInteger(c[cap]) && c[cap] > 0 && c[cap] <= maximum && Number.isSafeInteger(c[used]) && c[used] >= 0 && c[used] < c[cap], "receiver_capacity_unavailable");
  needed(Array.isArray(r.catalog) && r.catalog.length > 0 && r.catalog.length <= 8 && r.catalog.every(row => exact(row, catalogueKeys)), "catalog_mismatch");
  const catalog = d.scenarios.map(row => Object.fromEntries(catalogueKeys.map(key => [key, row[key]])));
  needed(r.catalog.every((row, index) => r.catalog.findIndex(other => same(row, other)) === index)
    && catalog.every(row => r.catalog.some(other => same(row, other))) && r.catalog.every(row => catalog.some(other => same(row, other))), "catalog_mismatch");
  return { native, input: value, inputDigest: sha(JSON.stringify(value)), readbackDigest: sha(JSON.stringify(r)) };
}

function outsideGit(directory) {
  for (let here = directory;; here = path.dirname(here)) {
    needed(!fs.existsSync(path.join(here, ".git")), "private_path_in_git");
    if (path.dirname(here) === here) return;
  }
}
function privateDirectory(directory) {
  const absolute = path.resolve(directory), stat = fs.lstatSync(absolute);
  needed(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0, "private_permissions_required");
  needed(fs.realpathSync(absolute) === absolute, "symlink_path_rejected"); outsideGit(absolute); return absolute;
}
export function readPrivateInput(file, platform, now = Date.now()) {
  const absolute = path.resolve(file); privateDirectory(path.dirname(absolute));
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    needed(stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0 && stat.nlink === 1 && stat.size <= 131072, "private_permissions_required");
    return validateInput(parsePrivateJson(fs.readFileSync(fd, "utf8")), platform, now);
  } finally { fs.closeSync(fd); }
}
function receiptWrite(directory, value) {
  const file = path.join(directory, "receipt.json"), temporary = path.join(directory, "receipt.next.json");
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" }); fs.renameSync(temporary, file);
}
function summary(validated, platform) {
  const d = validated.input.descriptor;
  return { platform, applicationId, runtime: `scq-v1-${platform}`, configurationDigest: validated.native.configurationDigest,
    publicSdkKeySha256: sha(d.publicSdkKey), projectId: d.projectId, appId: d.appId,
    qualificationConnectionId: d.qualificationConnectionId, qualificationConnectionRevision: d.qualificationConnectionRevision,
    inputDigest: validated.inputDigest, readbackDigest: validated.readbackDigest, readbackExpiresAt: validated.input.readback.expiresAt,
    readbackAuthority: "operator assertion; not independent provider or receiver attestation" };
}
function hashSources(directory) {
  return Object.fromEntries(stagedSourceFiles.map(name => {
    const full = path.join(directory, name), stat = fs.lstatSync(full);
    needed(stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(full) === full, "source_changed");
    return [name, sha(fs.readFileSync(full))];
  }));
}
export function stage({ descriptorFile, outputDirectory, platform, now = Date.now() }) {
  const validated = readPrivateInput(descriptorFile, platform, now), directory = path.resolve(outputDirectory);
  privateDirectory(path.dirname(directory)); needed(!fs.existsSync(directory), "output_exists");
  const hashes = hashSources(source); verifyLock(JSON.parse(fs.readFileSync(path.join(source, "package-lock.json"), "utf8")));
  fs.mkdirSync(directory, { mode: 0o700 }); const project = path.join(directory, "project"); fs.mkdirSync(project, { mode: 0o700 });
  for (const name of stagedSourceFiles) {
    const to = path.join(project, name); fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
    fs.writeFileSync(to, fs.readFileSync(path.join(source, name)), { mode: 0o600, flag: "wx" });
  }
  needed(same(hashes, hashSources(project)) && same(hashes, hashSources(source)), "source_changed");
  const receipt = { protocol: "scq-configured-local-build-v1", status: "staged", ...summary(validated, platform), sourceHashes: hashes,
    helperSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), commands: [], artifacts: {}, providerContacted: false,
    sdkInvoked: false, installed: false, launched: false, purchaseInvoked: false, metroRequired: true,
    privateWorkspaceRequired: true, generatedConfigurationPresent: false };
  receiptWrite(directory, receipt); return receipt;
}

/** No raw child output, argv, environment, descriptor or exception messages are
 * written to logs/receipts. The bounded output exists in memory only for checks. */
export async function runPrivate(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", bytes = 0, failed = false;
    const stop = () => { try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { /* Close still determines completion. */ } };
    const kill = () => { failed = true; stop(); };
    process.once("SIGINT", kill); process.once("SIGTERM", kill);
    const timer = setTimeout(kill, 35 * 60_000);
    const append = value => { bytes += value.length; if (bytes > 16 * 1024 * 1024) kill(); else output += value.toString(); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    child.once("error", () => { failed = true; });
    child.once("close", code => { clearTimeout(timer); stop(); process.removeListener("SIGINT", kill); process.removeListener("SIGTERM", kill);
      if (failed || code !== 0) reject(new Error("scq_local_build_child_failed")); else resolve(output); });
  });
}
export function childEnvironment(inherited, scratch, platform, nativeDescriptor = null) {
  const env = { ...compileEnvironment(inherited, scratch), SCQ_PLATFORM: platform };
  if (nativeDescriptor) env.SCQ_NATIVE_DESCRIPTOR = JSON.stringify(nativeDescriptor);
  return env;
}
const xmlValue = value => value.replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");
export function verifyAndroidManifest(xml, native) {
  needed(typeof xml === "string" && xml.includes(`package="${applicationId}"`) && /android:debuggable="true"/u.test(xml)
    && /android:allowBackup="false"/u.test(xml) && /android:fullBackupContent="false"/u.test(xml) && !/sharedUserId/u.test(xml), "artifact_identity_mismatch");
  const metadata = [...xml.matchAll(/<meta-data\b[^>]*>/gu)].map(match => Object.fromEntries([...match[0].matchAll(/android:(name|value)="([^"]*)"/gu)].map(x => [x[1], xmlValue(x[2])])));
  const configs = metadata.filter(row => row.name === "SCQ_QUALIFICATION_CONFIG");
  needed(configs.length === 1 && same(parsePrivateJson(configs[0].value), native), "artifact_identity_mismatch");
  needed(metadata.some(row => row.name === "expo.modules.updates.ENABLED" && row.value === "false"), "artifact_identity_mismatch");
  needed(!metadata.some(row => /^SCV|TestStoreConfiguration/u.test(row.name ?? "")), "artifact_identity_mismatch");
}
export function verifyIosInfo(info, native) {
  needed(info.CFBundleIdentifier === applicationId && same(info.SCQQualificationConfiguration, native)
    && info.DTPlatformName === "iphonesimulator" && !info.SCV1TestStoreConfiguration && !info.SCV2TestStoreConfiguration, "artifact_identity_mismatch");
}
export function restoreExpectedPrebuildPackage(file, originalBytes) {
  const original = parsePrivateJson(originalBytes), generatedBytes = fs.readFileSync(file, "utf8"), generated = parsePrivateJson(generatedBytes);
  const expected = { ...original, scripts: { ...original.scripts, android: original.scripts?.android ?? "expo run:android", ios: original.scripts?.ios ?? "expo run:ios" } };
  needed(same(generated, original) || same(generated, expected), "generated_package_changed");
  fs.writeFileSync(file, originalBytes, { mode: 0o600 });
  return sha(generatedBytes);
}
function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name); needed(!entry.isSymbolicLink(), "artifact_identity_mismatch");
    return entry.isDirectory() ? filesBelow(full) : entry.isFile() ? [full] : fail("artifact_identity_mismatch");
  });
}

export async function build({ descriptorFile, outputDirectory, platform }, { execute = runPrivate, inherited = process.env } = {}) {
  const directory = privateDirectory(outputDirectory), project = path.join(directory, "project"), validated = readPrivateInput(descriptorFile, platform);
  const receipt = parsePrivateJson(fs.readFileSync(path.join(directory, "receipt.json"), "utf8"));
  needed(receipt.protocol === "scq-configured-local-build-v1" && receipt.status === "staged" && receipt.inputDigest === validated.inputDigest
    && receipt.configurationDigest === validated.native.configurationDigest && receipt.platform === platform
    && receipt.helperSha256 === sha(fs.readFileSync(fileURLToPath(import.meta.url))) && same(receipt.sourceHashes, hashSources(project)), "stage_mismatch");
  const scratch = path.join(directory, "scratch"); fs.mkdirSync(scratch, { mode: 0o700 });
  const env = childEnvironment(inherited, scratch, platform);
  for (const name of [env.npm_config_userconfig, env.npm_config_globalconfig]) fs.writeFileSync(name, "", { mode: 0o600, flag: "wx" });
  const run = async (label, command, args, cwd = project, configured = false) => {
    const item = { step: label, status: "running" }; receipt.commands.push(item); receiptWrite(directory, receipt);
    try { const output = await execute(command, args, { cwd, env: configured ? childEnvironment(inherited, scratch, platform, validated.input.descriptor) : env }); item.status = "passed"; return output; }
    catch { item.status = "failed"; return fail("child_failed"); } finally { receiptWrite(directory, receipt); }
  };
  receipt.status = "building"; receipt.generatedConfigurationPresent = true; receiptWrite(directory, receipt);
  try {
    await run("locked_public_dependencies", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
    const linked = await run("standalone_autolink", process.execPath, ["node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js", "resolve", "--platform", platform === "ios" ? "apple" : "android", "--json"]);
    verifyAutolink(JSON.parse(linked), project, platform);
    const packageFile = path.join(project, "package.json"), originalPackage = fs.readFileSync(packageFile, "utf8");
    await run("configured_prebuild", process.execPath, ["node_modules/expo/bin/cli", "prebuild", "--platform", platform, "--no-install"], project, true);
    receipt.generatedPackageSha256 = restoreExpectedPrebuildPackage(packageFile, originalPackage);
    if (platform === "android") {
      const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT; needed(sdk && env.JAVA_HOME, "toolchain_missing");
      const analyzer = path.join(sdk, "cmdline-tools/latest/bin/apkanalyzer"); needed(fs.existsSync(analyzer), "toolchain_missing");
      await run("android_debug_app", path.join(project, "android/gradlew"), [":app:assembleDebug", "--no-daemon", "--max-workers=2", "-Pkotlin.compiler.execution.strategy=in-process"], path.join(project, "android"));
      const apk = path.join(project, "android/app/build/outputs/apk/debug/app-debug.apk"); needed(fs.existsSync(apk), "artifact_missing");
      verifyAndroidManifest(await run("verify_android_manifest", analyzer, ["manifest", "print", apk]), validated.native);
      receipt.artifacts[path.relative(directory, apk)] = sha(fs.readFileSync(apk)); receipt.signing = "Android development signing only; no release signing";
    } else {
      needed(process.platform === "darwin", "toolchain_missing");
      await run("locked_native_dependencies", "pod", ["install", "--repo-update"], path.join(project, "ios"));
      verifyPodLock(fs.readFileSync(path.join(project, "ios/Podfile.lock"), "utf8"));
      const workspaces = fs.readdirSync(path.join(project, "ios")).filter(name => name.endsWith(".xcworkspace")); needed(workspaces.length === 1, "generated_identity_mismatch");
      const apps = fs.readdirSync(path.join(project, "ios")).filter(name => /^[A-Za-z][A-Za-z0-9_]*$/u.test(name) && fs.existsSync(path.join(project, "ios", name, "Info.plist"))); needed(apps.length === 1, "generated_identity_mismatch");
      const entitlement = path.join(project, "ios", apps[0], `${apps[0]}.entitlements`);
      needed(same(JSON.parse(await run("verify_empty_entitlements", "/usr/bin/plutil", ["-convert", "json", "-o", "-", entitlement])), {}), "generated_identity_mismatch");
      await run("ios_debug_simulator_app", "xcodebuild", ["-workspace", workspaces[0], "-scheme", apps[0], "-configuration", "Debug", "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", path.join(directory, "ios-derived"), "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO", "build"], path.join(project, "ios"));
      const products = path.join(directory, "ios-derived/Build/Products/Debug-iphonesimulator");
      const names = fs.readdirSync(products).filter(name => name.endsWith(".app")); needed(names.length === 1, "artifact_missing");
      const app = path.join(products, names[0]);
      verifyIosInfo(JSON.parse(await run("verify_ios_info", "/usr/bin/plutil", ["-convert", "json", "-o", "-", path.join(app, "Info.plist")])), validated.native);
      const updates = JSON.parse(await run("verify_ios_updates", "/usr/bin/plutil", ["-convert", "json", "-o", "-", path.join(app, "Expo.plist")])); needed(updates.EXUpdatesEnabled === false, "artifact_identity_mismatch");
      receipt.artifacts = Object.fromEntries(filesBelow(app).map(file => [path.relative(directory, file), sha(fs.readFileSync(file))])); receipt.signing = "unsigned iOS Simulator only";
    }
    needed(same(receipt.sourceHashes, hashSources(project)), "source_changed");
    receipt.status = "compiled_not_installed";
    receipt.launchReadiness = "not established; fresh receiver readback, exact target authorization and frozen localhost-only Metro are still required";
  } catch { receipt.status = "failed_unknown_partial_artifacts"; receipt.failure = "Build stopped; raw output withheld. Retain the private workspace for local inspection."; return fail("build_failed"); }
  finally { receiptWrite(directory, receipt); }
  return receipt;
}

export async function main(argv = process.argv.slice(2)) {
  needed(argv.length === 7 && ["stage", "build"].includes(argv[0]) && argv[1] === "--descriptor-file" && argv[3] === "--output" && argv[5] === "--platform", "usage");
  const options = { descriptorFile: argv[2], outputDirectory: argv[4], platform: argv[6] };
  const result = argv[0] === "stage" ? stage(options) : await build(options);
  process.stdout.write(JSON.stringify({ status: result.status, platform: result.platform, configurationDigest: result.configurationDigest, publicSdkKeySha256: result.publicSdkKeySha256, installed: false, launched: false, metroRequired: true }) + "\n");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { process.stderr.write("Qualification staging/build unavailable. Input and child output were withheld.\n"); process.exitCode = 1; });
