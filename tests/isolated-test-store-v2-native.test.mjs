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
const contract = JSON.parse(fs.readFileSync(path.join(root, "config/test-store-debug-v2.json"), "utf8"));
const provider = { projectId: "fixture_project", appId: "fixture_test_store", publicSdkKey: "test_local_fixture_not_a_real_key" };
const transpile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const { isolatedTestStoreV2DebugConfig: resolve } = require("../config/test-store-debug-v2-config.js");
const base = { name: "main", slug: "main", scheme: "main", ios: { bundleIdentifier: "com.chillywood.mobile", associatedDomains: ["applinks:main.invalid"], entitlements: { "keychain-access-groups": ["shared"] } }, android: { package: "com.chillywood.mobile", googleServicesFile: "main.json" }, extra: { eas: { projectId: "main" } }, plugins: [] };
const env = (platform = "ios") => ({ EAS_BUILD_PROFILE: `isolated-test-store-v2-debug-${platform}`, CHILLYWOOD_TEST_STORE_V2_FLAVOR: "isolated-test-store-debug-v2", CHILLYWOOD_TEST_STORE_V2_NATIVE_CONFIG: JSON.stringify(provider) });
const build = platform => ({ ...resolve(base, env(platform)).ios.infoPlist.SCV2TestStoreConfiguration, nativeDebug: true });
function nativeHelper(native = null, applicationId = contract.applicationId, platform = "ios") {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const c = { exports: {}, Date, require: name => {
      if (name === "expo-application") return { applicationId };
      if (name === "expo-modules-core") return { requireOptionalNativeModule: () => native };
      if (name === "react-native") return { Platform: { OS: platform } };
      if (name.startsWith("./isolatedTestStore")) return load(`_lib/${name.slice(2)}.ts`);
      throw Error(`unexpected import ${name}`);
    } }; vm.runInNewContext(transpile(file), c); cache.set(file, c.exports); return c.exports;
  }
  return load("_lib/isolatedTestStoreV2Build.ts");
}

test("v2 is a separate unconfigured native app, namespace/runtime and explicit Debug profile", () => {
  assert.notEqual(contract.applicationId, JSON.parse(fs.readFileSync(path.join(root, "config/test-store-debug-v1.json"))).applicationId);
  assert.equal(contract.providerConfiguration, null);
  assert.equal(resolve(base, {}), null); assert.equal(resolve(base, { EAS_BUILD_PROFILE: "isolated-test-store-debug-ios" }), null);
  for (const platform of ["ios", "android"]) {
    const c = resolve(base, { ...env(platform), CHILLYWOOD_TEST_STORE_V2_NATIVE_CONFIG: undefined });
    assert.equal(c.ios.bundleIdentifier, contract.applicationId); assert.equal(c.android.package, contract.applicationId);
    assert.equal(c.updates.enabled, false); assert.equal(c.android.allowBackup, false); assert.equal(c.extra.eas, undefined);
    assert.deepEqual(Object.keys(c.ios.entitlements), []); assert.deepEqual(Object.keys(c.ios.infoPlist.SCV2TestStoreConfiguration), []);
    assert.equal(c.ios.infoPlist.SCV1TestStoreConfiguration, undefined);
  }
  for (const invalid of [{ ...env(), EAS_BUILD_PROFILE: "production" }, { ...env(), CHILLYWOOD_TEST_STORE_FLAVOR: "isolated-test-store-debug-v1" },
    { ...env(), CHILLYWOOD_TEST_STORE_NATIVE_CONFIG: "{}" }, { CHILLYWOOD_TEST_STORE_V2_FLAVOR: "isolated-test-store-debug-v2" }]) assert.throws(() => resolve(base, invalid));
  // Exercise Expo's real dynamic-config loader, not TypeScript transpileModule:
  // Expo transforms app.config.ts but imported helpers must be Node-loadable.
  for (const profile of ["ios", "ios-simulator", "android"]) {
    const environment = { ...process.env, EXPO_NO_DOTENV: "1", EAS_BUILD_PROFILE: `isolated-test-store-v2-debug-${profile}`,
      CHILLYWOOD_TEST_STORE_V2_FLAVOR: "isolated-test-store-debug-v2" };
    for (const name of ["CHILLYWOOD_TEST_STORE_FLAVOR", "CHILLYWOOD_TEST_STORE_NATIVE_CONFIG", "CHILLYWOOD_TEST_STORE_V2_NATIVE_CONFIG"]) delete environment[name];
    const loaded = spawnSync(process.execPath, ["-e", `const {getConfig}=require('@expo/config');const c=getConfig(process.cwd(),{skipPlugins:true}).exp;
      if(c.ios.bundleIdentifier!==${JSON.stringify(contract.applicationId)}||c.android.package!==${JSON.stringify(contract.applicationId)}||c.updates.enabled!==false||Object.keys(c.ios.infoPlist.SCV2TestStoreConfiguration).length!==0)process.exit(2);`],
    { cwd: root, env: environment, encoding: "utf8", timeout: 30000 });
    assert.equal(loaded.status, 0, `Actual Expo loader failed for ${profile}: ${loaded.stderr}`);
  }
});

test("v2 canonical descriptor pins exact Test Store key/profile; provider values never enter OTA extras", () => {
  const config = resolve(base, env()); const b = config.ios.infoPlist.SCV2TestStoreConfiguration;
  const descriptor = { protocol: contract.protocol, mode: contract.mode, platform: "ios", applicationId: contract.applicationId,
    projectId: provider.projectId, appId: provider.appId, publicSdkKeySha256: createHash("sha256").update(provider.publicSdkKey).digest("hex"), storageNamespace: contract.storageNamespace };
  assert.equal(b.configId, createHash("sha256").update(JSON.stringify(descriptor)).digest("hex"));
  assert.equal(JSON.stringify(config.extra).includes(provider.publicSdkKey), false);
  for (const invalid of [{ ...provider, publicSdkKey: "appl_not_allowed" }, { ...provider, extra: true }, []])
    assert.throws(() => resolve(base, { ...env(), CHILLYWOOD_TEST_STORE_V2_NATIVE_CONFIG: JSON.stringify(invalid) }));
});

test("v2 flavor suppression survives invalid native proof and JS development flags never admit Release", () => {
  assert.equal(nativeHelper().isIsolatedTestStoreV2Flavor(), true); assert.equal(nativeHelper().readIsolatedTestStoreV2Build(), null);
  assert.equal(nativeHelper(null, "com.chillywood.mobile").isIsolatedTestStoreV2Flavor(), false);
  assert.ok(nativeHelper({ build: build("ios") }).readIsolatedTestStoreV2Build());
  for (const mutate of [v => { v.nativeDebug = false; }, v => { v.protocol = "isolated-test-store-build-v1"; }, v => { v.platform = "android"; },
    v => { v.storageNamespace = "@chillywood/test-store-debug-v1"; }, v => { v.extra = true; }]) {
    const value = build("ios"); mutate(value); assert.equal(nativeHelper({ build: value }).readIsolatedTestStoreV2Build(), null);
  }
});

test("native installation and recovery validate exact identity and cannot manufacture completed callbacks", async () => {
  const uuid = "a0000000-0000-4000-8000-000000000001";
  const snapshot = { protocol: "isolated-test-store-native-v2", installationId: uuid, configurationDigest: build("ios").configId,
    customer: null, processRetired: false, activeInvocationId: null };
  const helper = nativeHelper({ build: build("ios"), inspectInstallation: async () => snapshot, readInvocation: async () => null });
  assert.equal((await helper.inspectIsolatedTestStoreV2Installation()).installationId, uuid);
  assert.equal(await helper.readIsolatedTestStoreV2NativeInvocation(uuid), null);
  for (const altered of [{ ...snapshot, configurationDigest: "0".repeat(64) }, { ...snapshot, activeInvocationId: "legacy" }, { ...snapshot, extra: true }])
    await assert.rejects(nativeHelper({ build: build("ios"), inspectInstallation: async () => altered }).inspectIsolatedTestStoreV2Installation());
  for (const invalid of [{ state: "completed" }, { protocol: "isolated-test-store-native-v1", invocationId: uuid }])
    await assert.rejects(nativeHelper({ build: build("ios"), readInvocation: async () => invalid }).readIsolatedTestStoreV2NativeInvocation(uuid));
});

test("v2 Debug build profiles have no release submission or v1 inheritance", () => {
  const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
  for (const platform of ["ios", "android"]) {
    const p = eas.build[`isolated-test-store-v2-debug-${platform}`]; assert.equal(p.extends, undefined); assert.equal(p.developmentClient, true);
    assert.equal(p.env.CHILLYWOOD_TEST_STORE_V2_FLAVOR, "isolated-test-store-debug-v2"); assert.equal(p.env.CHILLYWOOD_TEST_STORE_FLAVOR, undefined);
    assert.equal(eas.submit[`isolated-test-store-v2-debug-${platform}`], undefined);
  }
  assert.equal(eas.build["isolated-test-store-v2-debug-ios"].ios.buildConfiguration, "Debug");
  assert.equal(eas.build["isolated-test-store-v2-debug-android"].android.gradleCommand, ":app:assembleDebug");
});

test("completed unavailable package lookup has a narrow typed result and no invocation or purchase capability", async () => {
  const id = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const customer = { id: `scv2_customer_${id(1)}`, buyerId: id(2), installationId: id(3), providerAppUserId: `scv2_teststore_${id(4)}`,
    configurationDigest: build("ios").configId, projectId: provider.projectId, appId: provider.appId, providerScopeKey: "fixture-scope", economicApplicationId: "fixture-economic",
    provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX" };
  const allocation = { id: `scv2_allocation_${id(5)}`, intentId: `scv1_intent_${id(6)}`, dispatchId: id(7), customerBindingId: customer.id,
    configurationDigest: customer.configurationDigest, productId: "tip_fixture", acceptPurchaseUntil: "2030-01-01T00:00:00Z",
    quote: { offerId: `scv1_offer_${id(8)}`, offerRevision: 1, resourceId: `scv1_resource_${id(9)}`, resourceRevision: 1, creatorId: id(10), kind: "creator_tip", amountMinor: 500, currency: "usd" },
    registration: { id: `scv2_registration_${id(11)}`, providerOfferingId: "ofrng_fixture", offeringIdentifier: "lookup_fixture", providerPackageId: "pkge_fixture", packageIdentifier: "package_fixture", providerProductId: "prod_fixture", productId: "tip_fixture" } };
  let purchases = 0;
  const native = { build: build("ios"), preparePackage: async () => ({ status: "package_unavailable", handleId: null, invocation: null }), purchasePrepared: async () => { purchases++; } };
  const result = await nativeHelper(native).prepareIsolatedTestStoreV2NativePackage(customer, allocation, id(12));
  assert.equal(result.status, "package_unavailable"); assert.equal(result.handleId, null); assert.equal(result.invocation, null); assert.equal(purchases, 0);
  for (const response of [{ status: "package_unavailable", handleId: id(13), invocation: null }, { status: "package_unavailable", handleId: null, invocation: null, noCharge: true }])
    await assert.rejects(nativeHelper({ ...native, preparePackage: async () => response }).prepareIsolatedTestStoreV2NativePackage(customer, allocation, id(12)));
});

test("native plugin removes v1 metadata and inherited shared identity", () => {
  const handlers = {}, c = { exports: {}, module: { exports: {} }, require: name => {
    if (name === "../config/test-store-debug-v2.json") return contract;
    if (name === "@expo/config-plugins") return { createRunOncePlugin: f => f, withInfoPlist: (c, f) => { handlers.ios = f; return c; },
      withEntitlementsPlist: (c, f) => { handlers.entitlements = f; return c; }, withAndroidManifest: (c, f) => { handlers.android = f; return c; } };
    throw Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "plugins/withIsolatedTestStoreV2Debug.js"), "utf8"), c);
  c.module.exports.withIsolatedTestStoreV2Debug(resolve(base, env("android")));
  const info = handlers.ios({ modResults: { SCV1TestStoreFlavor: true, SCV1TestStoreConfiguration: {} } }).modResults;
  assert.equal(info.SCV1TestStoreFlavor, undefined); assert.equal(info.SCV2TestStoreFlavor, true);
  assert.deepEqual(Object.keys(handlers.entitlements({ modResults: { "keychain-access-groups": ["shared"] } }).modResults), []);
  const manifest = { modResults: { manifest: { $: {}, application: [{ $: {}, "meta-data": [{ $: { "android:name": "SCV1_TESTSTORE_CONFIG", "android:value": "legacy" } }] }] } } };
  const app = handlers.android(manifest).modResults.manifest.application[0]; assert.equal(app.$["android:allowBackup"], "false");
  assert.equal(app["meta-data"].some(i => i.$["android:name"].startsWith("SCV1")), false);
  manifest.modResults.manifest.$["android:sharedUserId"] = "legacy"; assert.throws(() => handlers.android(manifest));
});

if (process.env.ISOLATED_TEST_STORE_V2_NATIVE_POLICY === "1") test("compiled native lifecycle persists before invocation, retains unknown work and supports only same-owner completed repetition", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-teststore-v2-policy-"));
  const run = (bin, args) => { const result = spawnSync(bin, args, { cwd: temporary, encoding: "utf8", timeout: 120000, maxBuffer: 2_000_000 });
    assert.equal(result.status, 0, `${path.basename(bin)}: ${(result.stderr ?? "").slice(-10000)}`); return result.stdout; };
  const ids = [1, 2, 3, 4, 5, 6].map(n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`), fingerprint = "a".repeat(64);
  try {
    const java = process.env.TEST_STORE_JAVA_HOME ?? "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
    fs.writeFileSync(path.join(temporary, "LifecycleTest.java"), `import java.util.*; import expo.modules.chillywoodteststore.TestStoreV2Policy;
public class LifecycleTest {
 static void check(boolean b){if(!b)throw new AssertionError();} static void denied(Runnable r){try{r.run();throw new AssertionError();}catch(IllegalStateException expected){}}
 static class Store implements TestStoreV2Policy.Store { Map<String,String> value; boolean fail; public Map<String,String> load(){return value==null?null:new HashMap<>(value);} public void commit(Map<String,String> v){if(fail)throw new IllegalStateException();value=new HashMap<>(v);} }
 public static void main(String[] args){String sid="${ids[0]}", first="${ids[1]}", second="${ids[2]}", fp="${fingerprint}"; Store store=new Store(); TestStoreV2Policy p=new TestStoreV2Policy(store); final int[] configured={0}; String install=p.installationId();
 check(TestStoreV2Policy.cacheMatches("expected",false,List.of()));check(TestStoreV2Policy.cacheMatches("expected",true,List.of("expected")));check(!TestStoreV2Policy.cacheMatches("expected",true,List.of()));check(!TestStoreV2Policy.cacheMatches("expected",true,List.of("expected","other")));
 p.bind("owner-A",sid,()->false,()->configured[0]++);p.bind("owner-A",sid,()->true,()->configured[0]++);check(configured[0]==1);
 String missed=p.beginLookup(first,sid);denied(()->p.beginLookup(first,sid));check(p.read(first)==null);p.endLookup(missed);check(p.read(first)==null);String available=p.beginLookup(first,sid);String ticket=p.reserveAfterLookup(available,first,sid,fp,"prepared");check("prepared".equals(store.value.get("record:"+first)));denied(()->p.endLookup(available));
 denied(()->p.reserve(second,sid,fp,"prepared"));denied(()->p.invoke(ticket,first,sid,"b".repeat(64),"invoking"));p.invoke(ticket,first,sid,fp,"invoking");check("invoking".equals(store.value.get("record:"+first)));denied(()->p.invoke(ticket,first,sid,fp,"invoking"));
 Store restartStore=new Store();restartStore.value=store.load();TestStoreV2Policy restart=new TestStoreV2Policy(restartStore);check(!restart.isNativeInvocation(first));check(restart.active().equals(first));restart.bind("owner-A",sid,()->false,()->{});denied(()->restart.reserve(second,sid,fp,"prepared"));
 store.fail=true;denied(()->p.complete(first,"completed"));check(p.active().equals(first));store.fail=false;p.complete(first,"completed");check(p.active().isEmpty());String next=p.reserve(second,sid,fp,"prepared2");p.invoke(next,second,sid,fp,"invoking2");p.complete(second,"completed2");check(p.read(first).equals("completed"));denied(()->p.reserve(first,sid,fp,"again"));
 TestStoreV2Policy reopened=new TestStoreV2Policy(store);check(reopened.installationId().equals(install));check(reopened.read(first).equals("completed"));reopened.bind("owner-A",sid,()->false,()->{});denied(()->reopened.bind("owner-B",sid,()->false,()->{}));denied(()->reopened.bind("owner-A",sid,()->false,()->{}));
 Store abaStore=new Store();TestStoreV2Policy aba=new TestStoreV2Policy(abaStore);aba.bind("owner-A",sid,()->false,()->{});aba.retire(sid);denied(()->aba.bind("owner-A",sid,()->false,()->{}));
 Store generationStore=new Store();TestStoreV2Policy generation=new TestStoreV2Policy(generationStore);generation.bind("owner-A",sid,()->false,()->{});denied(()->generation.bind("owner-A","${ids[3]}",()->false,()->{}));denied(()->generation.current(sid));
 Store failed=new Store();TestStoreV2Policy unknown=new TestStoreV2Policy(failed);denied(()->unknown.bind("owner-A",sid,()->false,()->{throw new IllegalStateException();}));denied(()->unknown.bind("owner-A",sid,()->false,()->{}));
 System.out.println("java-lifecycle-passed"); }
}`);
    run(path.join(java, "bin/javac"), ["-d", temporary, path.join(root, "modules/chillywood-test-store-admission/android/src/main/java/expo/modules/chillywoodteststore/TestStoreV2Policy.java"), path.join(temporary, "LifecycleTest.java")]);
    assert.match(run(path.join(java, "bin/java"), ["-cp", temporary, "LifecycleTest"]), /java-lifecycle-passed/u);
    fs.writeFileSync(path.join(temporary, "main.swift"), `import Foundation
final class Store {var value:[String:String]?;var fail=false;func load()->[String:String]?{value};func save(_ v:[String:String])throws{if fail{throw TestStoreV2Error.unavailable};value=v}}
func denied(_ f:()throws->Void){do{try f();preconditionFailure()}catch{}}
let sid="${ids[0]}", first="${ids[1]}", second="${ids[2]}",fp="${fingerprint}";let store=Store();let p=try TestStoreV2Policy(load:store.load,commit:store.save);var calls=0;let install=p.installationId
precondition(TestStoreV2Policy.cacheMatches(expected:"expected",footprint:false,identities:[]));precondition(TestStoreV2Policy.cacheMatches(expected:"expected",footprint:true,identities:["expected"]));precondition(!TestStoreV2Policy.cacheMatches(expected:"expected",footprint:true,identities:[]));precondition(!TestStoreV2Policy.cacheMatches(expected:"expected",footprint:true,identities:["expected","other"]))
try p.bind(ownerDocument:"owner-A",capturedSession:sid,alreadyConfigured:{false},configure:{calls += 1});try p.bind(ownerDocument:"owner-A",capturedSession:sid,alreadyConfigured:{true},configure:{calls += 1});precondition(calls==1)
let missed=try p.beginLookup(dispatchId:first,capturedSession:sid);denied{_ = try p.beginLookup(dispatchId:first,capturedSession:sid)};let absent=try p.read(first);precondition(absent==nil);try p.endLookup(missed);let available=try p.beginLookup(dispatchId:first,capturedSession:sid)
let ticket=try p.reserveAfterLookup(token:available,dispatchId:first,capturedSession:sid,fingerprint:fp,document:"prepared");precondition(store.value?["record:"+first]=="prepared");denied{try p.endLookup(available)}
denied{_ = try p.reserve(dispatchId:second,capturedSession:sid,fingerprint:fp,preparedDocument:"other")};try p.invoke(ticket:ticket,dispatchId:first,capturedSession:sid,fingerprint:fp,invokingDocument:"invoking");denied{try p.invoke(ticket:ticket,dispatchId:first,capturedSession:sid,fingerprint:fp,invokingDocument:"invoking")}
let restartStore=Store();restartStore.value=store.value;let restart=try TestStoreV2Policy(load:restartStore.load,commit:restartStore.save);precondition(!restart.isNativeInvocation(first));try restart.bind(ownerDocument:"owner-A",capturedSession:sid,alreadyConfigured:{false},configure:{});denied{_ = try restart.reserve(dispatchId:second,capturedSession:sid,fingerprint:fp,preparedDocument:"other")}
store.fail=true;denied{try p.complete(dispatchId:first,completedDocument:"completed")};precondition(p.active==first);store.fail=false;try p.complete(dispatchId:first,completedDocument:"completed")
let next=try p.reserve(dispatchId:second,capturedSession:sid,fingerprint:fp,preparedDocument:"prepared2");try p.invoke(ticket:next,dispatchId:second,capturedSession:sid,fingerprint:fp,invokingDocument:"invoking2");try p.complete(dispatchId:second,completedDocument:"completed2");let retained=try p.read(first);precondition(retained=="completed")
let reopened=try TestStoreV2Policy(load:store.load,commit:store.save);precondition(reopened.installationId==install);try reopened.bind(ownerDocument:"owner-A",capturedSession:sid,alreadyConfigured:{false},configure:{});denied{try reopened.bind(ownerDocument:"owner-B",capturedSession:sid,alreadyConfigured:{false},configure:{})};denied{try reopened.bind(ownerDocument:"owner-A",capturedSession:sid,alreadyConfigured:{false},configure:{})}
let s=Store();let aba=try TestStoreV2Policy(load:s.load,commit:s.save);try aba.bind(ownerDocument:"owner-A",capturedSession:sid,alreadyConfigured:{false},configure:{});aba.retire(sid);denied{try aba.current(sid)}
let g=Store();let generation=try TestStoreV2Policy(load:g.load,commit:g.save);try generation.bind(ownerDocument:"owner-A",capturedSession:sid,alreadyConfigured:{false},configure:{});denied{try generation.bind(ownerDocument:"owner-A",capturedSession:"${ids[3]}",alreadyConfigured:{false},configure:{})};denied{try generation.current(sid)}
let c:[String:String]=["protocol":"isolated-test-store-build-v2","mode":"test-store-debug-v2","platform":"ios","applicationId":"${contract.applicationId}","projectId":"fixture_project","appId":"fixture_test_store","publicSdkKey":"${provider.publicSdkKey}","configId":"${fingerprint}","storageNamespace":"${contract.storageNamespace}"]
#if DEBUG
precondition(TestStoreV2Contract.build("${contract.applicationId}",c) != nil)
#else
precondition(TestStoreV2Contract.build("${contract.applicationId}",c) == nil)
#endif
print("swift-lifecycle-passed")
`);
    const sources = ["TestStoreV2Policy.swift", "TestStoreV2Contract.swift"].map(f => path.join(root, "modules/chillywood-test-store-admission/ios", f));
    for (const mode of ["debug", "release"]) {
      run("/usr/bin/swiftc", ["-module-cache-path", path.join(temporary, "module-cache"), ...(mode === "debug" ? ["-D", "DEBUG"] : []), ...sources, path.join(temporary, "main.swift"), "-o", path.join(temporary, mode)]);
      assert.match(run(path.join(temporary, mode), []), /swift-lifecycle-passed/u);
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
