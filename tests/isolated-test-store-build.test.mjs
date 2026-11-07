import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url), ts = require("typescript");
const root = path.resolve(import.meta.dirname, "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "config/test-store-debug-v1.json"), "utf8"));
const provider = { projectId: "fixture_project", appId: "fixture_test_store", publicSdkKey: "test_local_fixture_not_a_real_key" };
const uid = "scv1_teststore_a0000000-0000-4000-8000-000000000001";
const otherUid = "scv1_teststore_a0000000-0000-4000-8000-000000000002";
const compile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true,
} }).outputText;
const configContext = { exports: {}, require: name => name === "./test-store-debug-v1.json" ? contract : require(name) };
vm.runInNewContext(compile("config/test-store-debug-config.ts"), configContext);
const resolve = configContext.exports.isolatedTestStoreDebugConfig;
const environment = (platform = "ios", configured = true) => ({ EAS_BUILD_PROFILE: `isolated-test-store-debug-${platform}`,
  CHILLYWOOD_TEST_STORE_FLAVOR: "isolated-test-store-debug-v1", ...(configured ? { CHILLYWOOD_TEST_STORE_NATIVE_CONFIG: JSON.stringify(provider) } : {}) });
const base = { name: "Main", slug: "main", version: "1.0.0", scheme: "main", updates: { url: "https://main.invalid" },
  ios: { bundleIdentifier: "com.chillywood.mobile", googleServicesFile: "main.plist", associatedDomains: ["applinks:main.invalid"], entitlements: { "keychain-access-groups": ["main"] } },
  android: { package: "com.chillywood.mobile", googleServicesFile: "main.json", intentFilters: [{ action: "VIEW" }] },
  extra: { eas: { projectId: "main_project" } }, plugins: [] };
const build = platform => ({ ...resolve(base, environment(platform)).ios.infoPlist.SCV1TestStoreConfiguration, nativeDebug: true });
function loadNative({ native = null, applicationId = contract.applicationId, platform = "ios", dev = true } = {}) {
  const context = { exports: {}, __DEV__: dev, require: name => {
    if (name === "expo-application") return { applicationId };
    if (name === "expo-modules-core") return { requireOptionalNativeModule: () => native };
    if (name === "react-native") return { Platform: { OS: platform } };
    throw Error("unexpected import");
  } };
  vm.runInNewContext(compile("_lib/isolatedTestStoreBuild.ts"), context); return context.exports;
}

test("normal config stays untouched; explicit debug profiles isolate native and storage identity", () => {
  const before = JSON.stringify(base);
  for (const profile of [undefined, "production", "preview", "ios-internal-v2", "android-internal-device-v3"]) assert.equal(resolve(base, { EAS_BUILD_PROFILE: profile }), null);
  assert.equal(JSON.stringify(base), before);
  for (const platform of ["ios", "android"]) {
    const c = resolve(base, environment(platform, false));
    assert.equal(c.ios.bundleIdentifier, contract.applicationId); assert.equal(c.android.package, contract.applicationId);
    assert.equal(c.scheme, contract.scheme); assert.equal(c.updates.enabled, false); assert.equal(c.updates.url, undefined);
    assert.equal(c.android.allowBackup, false); assert.equal(c.ios.googleServicesFile, undefined); assert.equal(c.android.googleServicesFile, undefined);
    assert.deepEqual(Object.keys(c.ios.entitlements), []); assert.equal(c.extra.eas, undefined);
    assert.deepEqual(Object.keys(c.ios.infoPlist.SCV1TestStoreConfiguration), []);
    assert.ok(!JSON.stringify(c.extra).includes("publicSdkKey"));
  }
  for (const bad of [{ CHILLYWOOD_TEST_STORE_FLAVOR: "isolated-test-store-debug-v1" }, { EAS_BUILD_PROFILE: "isolated-test-store-debug-ios" },
    { ...environment(), EAS_BUILD_PROFILE: "production" }]) assert.throws(() => resolve(base, bad), /explicit debug/u);
});

test("native descriptor digest matches canonical backend key-hash contract and excludes OTA key delivery", () => {
  const c = resolve(base, environment()); const native = c.ios.infoPlist.SCV1TestStoreConfiguration;
  const descriptor = { protocol: contract.protocol, mode: contract.mode, platform: "ios", applicationId: contract.applicationId,
    projectId: provider.projectId, appId: provider.appId, publicSdkKeySha256: createHash("sha256").update(provider.publicSdkKey).digest("hex"), storageNamespace: contract.storageNamespace };
  assert.equal(native.configId, createHash("sha256").update(JSON.stringify(descriptor)).digest("hex"));
  assert.equal(native.publicSdkKey, provider.publicSdkKey); assert.equal(JSON.stringify(c.extra).includes(provider.publicSdkKey), false);
  for (const value of [{ ...provider, publicSdkKey: "appl_real_store" }, { ...provider, token: "forbidden" }, { ...provider, projectId: "" }, []])
    assert.throws(() => resolve(base, { ...environment(), CHILLYWOOD_TEST_STORE_NATIVE_CONFIG: JSON.stringify(value) }), /Invalid native/u);
});

test("EAS profiles select actual Debug compilation and never inherit production distribution", () => {
  const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
  for (const platform of ["ios", "android"]) {
    const p = eas.build[`isolated-test-store-debug-${platform}`];
    assert.equal(p.developmentClient, true); assert.equal(p.distribution, "internal"); assert.equal(p.extends, undefined);
    assert.equal(p.env.CHILLYWOOD_TEST_STORE_FLAVOR, "isolated-test-store-debug-v1");
    assert.ok(p.channel.startsWith("isolated-test-store-debug-v1-"));
  }
  assert.equal(eas.build["isolated-test-store-debug-ios"].ios.buildConfiguration, "Debug");
  assert.equal(eas.build["isolated-test-store-debug-android"].android.gradleCommand, ":app:assembleDebug");
  assert.equal(eas.submit["isolated-test-store-debug-ios"], undefined);
});

test("flavor remains isolated when native proof is missing/release/invalid; JS DEV never grants admission", () => {
  assert.equal(loadNative().isIsolatedTestStoreFlavor(), true); assert.equal(loadNative().readIsolatedTestStoreBuild(), null);
  const production = loadNative({ applicationId: "com.chillywood.mobile", native: { isolatedTestStoreFlavor: false, build: build("ios") } });
  assert.equal(production.isIsolatedTestStoreFlavor(), false); assert.equal(production.readIsolatedTestStoreBuild(), null);
  const marked = loadNative({ applicationId: "com.chillywood.mobile", native: { isolatedTestStoreFlavor: true } });
  assert.equal(marked.isIsolatedTestStoreFlavor(), true); assert.equal(marked.readIsolatedTestStoreBuild(), null);
  for (const mutate of [v => { v.nativeDebug = false; }, v => { v.platform = "android"; }, v => { v.publicSdkKey = "appl_live"; },
    v => { v.applicationId = "com.chillywood.mobile"; }, v => { v.configId = "bad"; }, v => { v.otaEnabled = true; }]) {
    const v = build("ios"); mutate(v); assert.equal(loadNative({ native: { build: v }, dev: true }).readIsolatedTestStoreBuild(), null);
  }
  assert.ok(loadNative({ native: { build: build("ios") }, dev: false }).readIsolatedTestStoreBuild());
});

test("only native pinned configure is called once with explicit opaque UID; unknown outcome retires JS path", async () => {
  let calls = 0;
  const native = { build: build("ios"), configureTestStore: async user => {
    calls++; assert.equal(user, uid); return { configured: true, configId: native.build.configId, providerAppUserId: user };
  }, ownsProviderIdentity: async user => user === uid };
  const api = loadNative({ native });
  await assert.rejects(api.configureIsolatedTestStoreNative("ordinary-auth-user"), /UNAVAILABLE/u); assert.equal(calls, 0);
  const result = await api.configureIsolatedTestStoreNative(uid); assert.equal(result.providerAppUserId, uid);
  await assert.rejects(api.configureIsolatedTestStoreNative(otherUid), /UNAVAILABLE/u); assert.equal(calls, 1);
  assert.equal(await api.ownsIsolatedTestStoreProviderIdentity(uid), true); assert.equal(await api.ownsIsolatedTestStoreProviderIdentity(otherUid), false);
  const uncertain = loadNative({ native: { build: build("ios"), configureTestStore: async () => { throw Error("unknown"); } } });
  await assert.rejects(uncertain.configureIsolatedTestStoreNative(uid));
  await assert.rejects(uncertain.configureIsolatedTestStoreNative(uid), /UNAVAILABLE/u);
});

test("native result cannot assert another identity/configuration or untyped truth", async () => {
  for (const result of [{ configured: "true", configId: build("ios").configId, providerAppUserId: uid },
    { configured: true, configId: "0".repeat(64), providerAppUserId: uid },
    { configured: true, configId: build("ios").configId, providerAppUserId: otherUid }]) {
    const api = loadNative({ native: { build: build("ios"), configureTestStore: async () => result } });
    await assert.rejects(api.configureIsolatedTestStoreNative(uid), /UNKNOWN/u);
    await assert.rejects(api.configureIsolatedTestStoreNative(uid), /UNAVAILABLE/u);
  }
});

test("native plugin writes isolated immutable metadata and refuses shared Android identity", async () => {
  const handlers = {}; const context = { exports: {}, module: { exports: {} }, require: name => {
    if (name === "../config/test-store-debug-v1.json") return contract;
    if (name === "@expo/config-plugins") return { createRunOncePlugin: f => f,
      withInfoPlist: (c, f) => { handlers.ios = f; return c; }, withEntitlementsPlist: (c, f) => { handlers.entitlements = f; return c; },
      withAndroidManifest: (c, f) => { handlers.android = f; return c; } };
    throw Error("unexpected import");
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "plugins/withIsolatedTestStoreDebug.js"), "utf8"), context);
  const c = resolve(base, environment("android")); context.module.exports.withIsolatedTestStoreDebug(c, { nativeConfig: c.ios.infoPlist.SCV1TestStoreConfiguration });
  assert.deepEqual(Object.keys(handlers.entitlements({ modResults: { "keychain-access-groups": ["shared"] } }).modResults), []);
  const manifest = { modResults: { manifest: { $: {}, application: [{ $: {}, "meta-data": [] }] } } };
  const app = handlers.android(manifest).modResults.manifest.application[0];
  assert.equal(app.$["android:allowBackup"], "false"); assert.equal(app.$["android:fullBackupContent"], "false");
  assert.equal(app["meta-data"].find(i => i.$["android:name"] === "SCV1_TESTSTORE_FLAVOR").$["android:value"], "true");
  manifest.modResults.manifest.$["android:sharedUserId"] = "shared";
  assert.throws(() => handlers.android(manifest), /cannot share/u);
});

const nativeRequested = process.env.ISOLATED_TEST_STORE_NATIVE_POLICY === "1";
if (nativeRequested) test("compiled Java and Swift admission rejects Release before callback and latches configuration/UID for process lifetime", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-teststore-policy-"));
  const run = (binary, args) => {
    const p = spawnSync(binary, args, { cwd: temporary, encoding: "utf8", timeout: 120000, maxBuffer: 1_000_000 });
    assert.equal(p.status, 0, `${path.basename(binary)} failed: ${(p.stderr ?? "").slice(-6000)}`); return p.stdout;
  };
  try {
    const java = process.env.TEST_STORE_JAVA_HOME ?? "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
    fs.writeFileSync(path.join(temporary, "AdmissionTest.java"), `import java.util.*; import expo.modules.chillywoodteststore.TestStoreAdmissionPolicy;
public class AdmissionTest {
 static void check(boolean x) { if(!x) throw new AssertionError(); }
 static void denied(Runnable r) { try { r.run(); throw new AssertionError(); } catch(IllegalStateException|IllegalArgumentException expected) {} }
 public static void main(String[] args) {
  Map<String,String> c=new HashMap<>();
  c.put("protocol","isolated-test-store-build-v1"); c.put("mode","test-store-debug"); c.put("platform","android");
  c.put("applicationId","${contract.applicationId}"); c.put("projectId","fixture_project"); c.put("appId","fixture_test_store");
  c.put("publicSdkKey","${provider.publicSdkKey}"); c.put("configId","${"a".repeat(64)}"); c.put("storageNamespace","${contract.storageNamespace}");
  final int[] calls={0}; String app="${contract.applicationId}", user="${uid}";
  if(args[0].equals("release")) { denied(()->TestStoreAdmissionPolicy.configure(false,true,app,c,user,()->false,()->calls[0]++)); denied(()->TestStoreAdmissionPolicy.configure(true,false,app,c,user,()->false,()->calls[0]++)); check(calls[0]==0); }
  else if(args[0].equals("identity")) { denied(()->TestStoreAdmissionPolicy.configure(true,true,"com.chillywood.mobile",c,user,()->false,()->calls[0]++)); c.put("publicSdkKey","appl_live"); denied(()->TestStoreAdmissionPolicy.configure(true,true,app,c,user,()->false,()->calls[0]++)); check(calls[0]==0); }
  else if(args[0].equals("foreign")) { denied(()->TestStoreAdmissionPolicy.configure(true,true,app,c,user,()->true,()->calls[0]++)); denied(()->TestStoreAdmissionPolicy.configure(true,true,app,c,user,()->false,()->calls[0]++)); check(calls[0]==0); }
  else if(args[0].equals("unknown")) { denied(()->TestStoreAdmissionPolicy.configure(true,true,app,c,user,()->false,()->{calls[0]++; throw new IllegalStateException();})); denied(()->TestStoreAdmissionPolicy.configure(true,true,app,c,user,()->false,()->calls[0]++)); check(calls[0]==1); check(!TestStoreAdmissionPolicy.owns(user,()->true)); }
  else { denied(()->TestStoreAdmissionPolicy.configure(true,true,app,c,"anonymous",()->false,()->calls[0]++)); TestStoreAdmissionPolicy.configure(true,true,app,c,user,()->false,()->calls[0]++); check(TestStoreAdmissionPolicy.owns(user,()->true)); check(!TestStoreAdmissionPolicy.owns(user,()->false)); check(!TestStoreAdmissionPolicy.owns("${otherUid}",()->true)); denied(()->TestStoreAdmissionPolicy.configure(true,true,app,c,"${otherUid}",()->false,()->calls[0]++)); check(calls[0]==1); }
 }
}`);
    run(path.join(java, "bin/javac"), ["-d", temporary, path.join(root, "modules/chillywood-test-store-admission/android/src/main/java/expo/modules/chillywoodteststore/TestStoreAdmissionPolicy.java"), path.join(temporary, "AdmissionTest.java")]);
    for (const scenario of ["release", "identity", "foreign", "unknown", "success"]) run(path.join(java, "bin/java"), ["-cp", temporary, "AdmissionTest", scenario]);
    fs.writeFileSync(path.join(temporary, "main.swift"), `import Foundation
func check(_ value: Bool) { precondition(value) }
func denied(_ operation: () throws -> Void) { do { try operation(); preconditionFailure() } catch {} }
var c:[String:String] = ["protocol":"isolated-test-store-build-v1","mode":"test-store-debug","platform":"ios","applicationId":"${contract.applicationId}","projectId":"fixture_project","appId":"fixture_test_store","publicSdkKey":"${provider.publicSdkKey}","configId":"${"a".repeat(64)}","storageNamespace":"${contract.storageNamespace}"]
var calls=0; let user="${uid}"; let app="${contract.applicationId}"; let scenario=CommandLine.arguments[1]
func attempt(_ id: String = "${uid}", _ foreign: Bool = false, _ uncertain: Bool = false) throws { _ = try TestStoreAdmissionPolicy.configure(applicationId: app, config: c, user: id, alreadyConfigured: {foreign}, configure: {calls += 1; if uncertain {throw TestStoreAdmissionError.configurationUnknown} }) }
if !TestStoreAdmissionPolicy.compiledDebug { denied {try attempt()}; check(calls==0) }
else if scenario=="identity" { check(TestStoreAdmissionPolicy.snapshot(applicationId:"com.chillywood.mobile",config:c)==nil); c["publicSdkKey"]="appl_live"; denied {try attempt()}; check(calls==0) }
else if scenario=="foreign" { denied {try attempt(user,true)}; denied {try attempt()}; check(calls==0) }
else if scenario=="unknown" { denied {try attempt(user,false,true)}; denied {try attempt()}; check(calls==1); check(!TestStoreAdmissionPolicy.owns(user:user,currentIdentityMatches:{true})) }
else { denied {try attempt("anonymous")}; try attempt(); check(TestStoreAdmissionPolicy.owns(user:user,currentIdentityMatches:{true})); check(!TestStoreAdmissionPolicy.owns(user:user,currentIdentityMatches:{false})); check(!TestStoreAdmissionPolicy.owns(user:"${otherUid}",currentIdentityMatches:{true})); denied {try attempt("${otherUid}")}; check(calls==1) }
`);
    const swiftSource = path.join(root, "modules/chillywood-test-store-admission/ios/TestStoreAdmissionPolicy.swift");
    run("/usr/bin/swiftc", ["-module-cache-path", path.join(temporary, "module-cache"), "-D", "DEBUG", swiftSource, path.join(temporary, "main.swift"), "-o", path.join(temporary, "debug-policy")]);
    run("/usr/bin/swiftc", ["-module-cache-path", path.join(temporary, "module-cache"), swiftSource, path.join(temporary, "main.swift"), "-o", path.join(temporary, "release-policy")]);
    for (const scenario of ["identity", "foreign", "unknown", "success"]) run(path.join(temporary, "debug-policy"), [scenario]);
    run(path.join(temporary, "release-policy"), ["release"]);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  assert.equal(fs.existsSync(temporary), false);
});
