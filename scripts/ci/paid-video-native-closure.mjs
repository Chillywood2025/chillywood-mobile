import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const EXPO_CRYPTO_VERSION = "15.0.9";
const hash = value => createHash("sha256").update(value).digest("hex");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const V3_SOURCES = Object.freeze({
  android: ["ChillywoodTestStoreV3Module.kt", "TestStoreV3Contract.kt", "TestStoreV3Policy.java"],
  ios: ["ChillywoodTestStoreV3Module.swift", "TestStoreV3Contract.swift", "TestStoreV3Policy.swift"],
});

export function requireTestStoreV3Sources(resolution, projectRoot, platform, admissionProject) {
  assert(platform === "android" || platform === "ios", "Explicit native platform required");
  const modules = resolution?.modules?.filter(value => value.packageName === "chillywood-test-store-admission") ?? [];
  assert.equal(modules.length, 1, "V3 must use the single existing admission module");
  const classes = platform === "android" ? modules[0].projects?.[0]?.modules : modules[0].modules;
  const prefix = platform === "android" ? "expo.modules.chillywoodteststore." : "";
  for (const name of ["ChillywoodTestStoreAdmissionModule", "ChillywoodTestStoreV2Module", "ChillywoodTestStoreV3Module"]) {
    assert.equal(classes?.filter(value => value === prefix + name).length, 1, "Each v1/v2/v3 bridge must autolink exactly once");
  }
  const expected = path.join(projectRoot, "modules/chillywood-test-store-admission", platform === "android" ? "android" : "ios");
  assert.equal(admissionProject.sourceDir, expected, "V3 must compile the resolved admission source project");
  return V3_SOURCES[platform].map(name => {
    const file = path.join(expected, platform === "android" ? "src/main/java/expo/modules/chillywoodteststore" : "", name);
    assert(fs.lstatSync(file).isFile(), "Required V3 source must be a regular file");
    return { path: path.relative(projectRoot, file), sha256: hash(fs.readFileSync(file)) };
  });
}

export function parseTestStoreV3NativePolicyReport(output) {
  // Successor includes the prepared-only closure case: nine portable groups and
  // one actual Java/Swift Debug+Release group. The earlier nine-group proof is historical.
  for (const [name, count] of [["tests", 10], ["pass", 10], ["fail", 0], ["cancelled", 0], ["skipped", 0], ["todo", 0]]) {
    const values = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gmu"))];
    assert.equal(values.length, 1, "Exactly one complete V3 native report is required");
    assert.equal(Number(values[0][1]), count, "All V3 portable and compiled lifecycle cases must execute");
  }
  assert.match(output, /^ok 10 - compiled v3 ownership retires after any uncertain persistence and preserves original asset identity$/mu);
  return { groups: 10, nativeExecutables: 3, failures: 0, skipped: 0, providerSdkInvoked: false };
}

// Expo normally selects a bundled Maven publication for this package. The
// disposable compiler copy explicitly compiles its pinned source as additional
// evidence; it does not change the app's normal dependency configuration.
export function prepareExpoCryptoSourceCompile(projectRoot) {
  for (const name of ["modules/chillywood-test-store-admission/android/build", "node_modules/expo-crypto/android/build"]) {
    assert(!fs.existsSync(path.join(projectRoot, name)), "Fresh native qualification must not copy stale Android compile outputs");
  }
  const filename = path.join(projectRoot, "package.json");
  const original = fs.readFileSync(filename);
  const pkg = JSON.parse(original);
  const lock = readJson(path.join(projectRoot, "package-lock.json"));
  const installed = readJson(path.join(projectRoot, "node_modules/expo-crypto/package.json"));
  for (const version of [pkg.dependencies?.["expo-crypto"], lock.packages?.[""]?.dependencies?.["expo-crypto"],
    lock.packages?.["node_modules/expo-crypto"]?.version, installed.version]) assert.equal(version, EXPO_CRYPTO_VERSION,
  "ExpoCrypto declaration, lock and installed source must match the exact reviewed version");
  assert.equal(installed.name, "expo-crypto");
  const pin = lock.packages["node_modules/expo-crypto"];
  assert.equal(pin.resolved, `https://registry.npmjs.org/expo-crypto/-/expo-crypto-${EXPO_CRYPTO_VERSION}.tgz`);
  assert.match(pin.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u, "Exact installed package integrity must be recorded");
  const prior = pkg.expo?.autolinking?.android?.buildFromSource ?? [];
  assert(Array.isArray(prior) && prior.every(value => typeof value === "string"));
  pkg.expo ??= {}; pkg.expo.autolinking ??= {}; pkg.expo.autolinking.android ??= {};
  pkg.expo.autolinking.android.buildFromSource = [...new Set([...prior, "^expo-crypto$"])];
  const generated = `${JSON.stringify(pkg, null, 2)}\n`;
  const sourceFiles = ["android/src/main/java/expo/modules/crypto/CryptoModule.kt", "ios/CryptoModule.swift"].map(name => {
    const file = path.join(projectRoot, "node_modules/expo-crypto", name);
    assert(fs.lstatSync(file).isFile(), "Pinned Crypto bridge source must be a regular file");
    return { path: path.relative(projectRoot, file), sha256: hash(fs.readFileSync(file)) };
  });
  fs.writeFileSync(filename, generated);
  return { version: EXPO_CRYPTO_VERSION, integrity: pin.integrity, packageSourceSha256: hash(original),
    disposablePackageSha256: hash(generated), sourceFiles, compileFromSourceOverride: true, signedArtifactEquivalent: false };
}

// Every requested prebuild must finish with the normal product configuration.
// In particular, the Android picker plugin deliberately rejects any additional
// buildFromSource pattern. Apply the compiler-only Crypto override after *all*
// prebuilds, so a subsequent iOS generation cannot observe the Android override.
export function prebuildBeforeExpoCryptoSourceCompile(projectRoot, platforms, prebuild) {
  assert(Array.isArray(platforms) && platforms.length > 0 && platforms.length <= 2
    && platforms.every(platform => platform === "android" || platform === "ios")
    && new Set(platforms).size === platforms.length, "Explicit unique prebuild platforms required");
  assert.equal(typeof prebuild, "function");
  const filename = path.join(projectRoot, "package.json");
  const normal = readJson(filename).expo?.autolinking?.android?.buildFromSource;
  assert(Array.isArray(normal) && normal.every(value => typeof value === "string")
    && !normal.includes("^expo-crypto$"), "Prebuild requires the normal package before the disposable Crypto override");
  const prebuilds = platforms.map(platform => {
    assert.deepEqual(readJson(filename).expo?.autolinking?.android?.buildFromSource, normal);
    const packageBeforeSha256 = hash(fs.readFileSync(filename));
    const result = prebuild(platform);
    assert(!result?.then, "Native prebuild must complete before applying source overrides");
    assert.deepEqual(readJson(filename).expo?.autolinking?.android?.buildFromSource, normal,
      "Prebuild must preserve the reviewed product source patterns");
    const generated = path.join(projectRoot, platform);
    assert(fs.lstatSync(generated).isDirectory() && !fs.lstatSync(generated).isSymbolicLink(),
      "Actual platform prebuild must produce a contained native directory");
    return { platform, packageBeforeSha256, packageAfterSha256: hash(fs.readFileSync(filename)) };
  });
  return { ...prepareExpoCryptoSourceCompile(projectRoot), prebuilds, overrideAppliedAfterAllPrebuilds: true };
}

// Existing product regression checks re-run the exact picker plugin guard.
// Restore the captured normal package only for those synchronous checks, then
// restore the byte-exact compiler override even when a check fails. Neither
// configuration is guessed or reconstructed from mutable package fields.
export function withNormalPrebuildPackageForChecks(projectRoot, normalPackage, receipt, check) {
  assert(Buffer.isBuffer(normalPackage) && hash(normalPackage) === receipt.packageSourceSha256,
    "Checks require the exact package captured after normal prebuild");
  const filename = path.join(projectRoot, "package.json"), compiledPackage = fs.readFileSync(filename);
  assert.equal(hash(compiledPackage), receipt.disposablePackageSha256, "Compiler override changed before normal-config checks");
  assert.equal(typeof check, "function");
  fs.writeFileSync(filename, normalPackage);
  try {
    const result = check();
    assert(!result?.then, "Normal-config checks must complete synchronously");
    return result;
  } finally {
    let unchanged = false;
    try { unchanged = fs.readFileSync(filename).equals(normalPackage); }
    finally { fs.writeFileSync(filename, compiledPackage); }
    assert(unchanged, "Regression checks must not change the captured normal package");
  }
}

export function resolveExpoCryptoSourceProject(resolution, projectRoot, platform) {
  assert(platform === "android" || platform === "ios");
  const modules = resolution?.modules?.filter(value => value.packageName === "expo-crypto") ?? [];
  assert.equal(modules.length, 1, "Exactly one pinned ExpoCrypto module must autolink");
  const module = modules[0];
  assert.equal(module.packageVersion, EXPO_CRYPTO_VERSION, "Actual autolinking must resolve the pinned Crypto package");
  const sourceDir = path.join(projectRoot, "node_modules/expo-crypto", platform === "android" ? "android" : "ios");
  if (platform === "android") {
    assert.equal(module.projects?.length, 1);
    const project = module.projects[0];
    assert.equal(project.name, "expo-crypto"); assert.equal(project.sourceDir, sourceDir);
    assert.equal(project.modules?.filter(name => name === "expo.modules.crypto.CryptoModule").length, 1);
    assert(!project.publication || resolution.configuration?.buildFromSource?.some(pattern =>
      typeof pattern === "string" && new RegExp(`^(?:${pattern})$`, "u").test("expo-crypto")),
    "Crypto compilation must select the pinned source, never a prebuilt AAR");
    assert(fs.lstatSync(path.join(sourceDir, "src/main/java/expo/modules/crypto/CryptoModule.kt")).isFile());
    return { name: project.name, sourceDir };
  }
  assert.equal(module.pods?.length, 1); assert.equal(module.pods[0].podName, "ExpoCrypto");
  assert.equal(module.pods[0].podspecDir, sourceDir);
  assert.equal(module.modules?.filter(name => name === "CryptoModule").length, 1);
  assert(fs.lstatSync(path.join(sourceDir, "CryptoModule.swift")).isFile());
  return { name: "ExpoCrypto", sourceDir };
}

export function expoCryptoCompileTasks() {
  return [":expo-crypto:compileDebugKotlin", ":expo-crypto:compileReleaseKotlin"];
}

export function verifyExpoCryptoRuntimeGraph(graph) {
  assert.equal(graph.components.filter(value => value.kind === "project" && value.buildPath === ":"
    && value.projectPath === ":expo-crypto").length, 1, "Actual app runtime must include the compiled Crypto source project exactly once");
  assert(!graph.components.some(value => value.kind === "module" && /expo[.-]modules[.-]crypto|expo-crypto/u.test(`${value.group}:${value.name}`)),
    "The source-compile fixture must not silently also use a bundled Crypto runtime publication");
}

function artifact(root, filename) {
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(filename));
  assert(relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative),
    "Native artifact must belong to this exact isolated build workspace");
  assert(fs.lstatSync(filename).isFile(), "Native artifact must be a regular file");
  const bytes = fs.readFileSync(filename); assert(bytes.length > 0, "Native compile must emit a nonempty artifact");
  return { path: relative, sha256: hash(bytes), byteLength: bytes.length };
}

export function collectPaidVideoAndroidArtifacts(projectRoot) {
  return ["debug", "release"].flatMap(variant => {
    const title = variant[0].toUpperCase() + variant.slice(1);
    const admission = path.join(projectRoot, "modules/chillywood-test-store-admission/android/build");
    const prefix = "expo/modules/chillywoodteststore";
    return [
      ...["ChillywoodTestStoreV3Module", "TestStoreV3Contract"].map(name => path.join(admission, "tmp/kotlin-classes", variant, prefix, `${name}.class`)),
      path.join(admission, "intermediates/javac", variant, `compile${title}JavaWithJavac/classes`, prefix, "TestStoreV3Policy.class"),
      path.join(projectRoot, "node_modules/expo-crypto/android/build/tmp/kotlin-classes", variant, "expo/modules/crypto/CryptoModule.class"),
    ].map(file => artifact(projectRoot, file));
  });
}

export function collectPaidVideoIosArtifacts(workspace, architecture, settingsByTarget) {
  assert(["arm64", "x86_64"].includes(architecture));
  return Object.entries({ ChillywoodTestStoreAdmission: ["ChillywoodTestStoreV3Module", "TestStoreV3Contract", "TestStoreV3Policy"],
    ExpoCrypto: ["CryptoModule"] }).flatMap(([target, names]) => {
    const settings = settingsByTarget[target];
    for (const key of ["OBJECT_FILE_DIR_normal", "TARGET_BUILD_DIR", "EXECUTABLE_PATH"]) assert.equal(typeof settings?.[key], "string",
      `Actual ${target} target build settings must bind ${key}`);
    assert(!path.isAbsolute(settings.EXECUTABLE_PATH), "Target product path must be relative to its build directory");
    return [...names.map(name => path.join(settings.OBJECT_FILE_DIR_normal, architecture, `${name}.o`)),
      path.join(settings.TARGET_BUILD_DIR, settings.EXECUTABLE_PATH)].map(file => artifact(workspace, file));
  });
}
