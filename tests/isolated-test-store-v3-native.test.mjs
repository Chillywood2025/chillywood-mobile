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
const contract = JSON.parse(fs.readFileSync(path.join(root, "config/test-store-debug-v3.json"), "utf8"));
const provider = { projectId: "fixture_project", appId: "fixture_test_store", publicSdkKey: "test_local_fixture_not_a_real_key" };
const transpile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const { isolatedTestStoreV3DebugConfig: resolve } = require("../config/test-store-debug-v3-config.js");
const base = { name: "main", slug: "main", scheme: "main", ios: { bundleIdentifier: "com.chillywood.mobile", associatedDomains: ["applinks:main.invalid"], entitlements: { "keychain-access-groups": ["shared"] } }, android: { package: "com.chillywood.mobile", googleServicesFile: "main.json" }, extra: { eas: { projectId: "main" } }, plugins: [] };
const env = (platform = "ios") => ({ EAS_BUILD_PROFILE: `isolated-test-store-v3-debug-${platform}`, CHILLYWOOD_TEST_STORE_V3_FLAVOR: "isolated-test-store-debug-v3", CHILLYWOOD_TEST_STORE_V3_NATIVE_CONFIG: JSON.stringify(provider) });
const build = platform => ({ ...resolve(base, env(platform)).ios.infoPlist.SCV3TestStoreConfiguration, nativeDebug: true });
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
  return load("_lib/isolatedTestStoreV3Build.ts");
}

test("v3 is a separate unconfigured native app, namespace/runtime and explicit Debug profile", () => {
  for (const version of ["v1", "v2"]) assert.notEqual(contract.applicationId, JSON.parse(fs.readFileSync(path.join(root, `config/test-store-debug-${version}.json`))).applicationId);
  assert.equal(contract.providerConfiguration, null);
  assert.equal(resolve(base, {}), null); assert.equal(resolve(base, { EAS_BUILD_PROFILE: "isolated-test-store-debug-ios" }), null);
  for (const platform of ["ios", "android"]) {
    const c = resolve(base, { ...env(platform), CHILLYWOOD_TEST_STORE_V3_NATIVE_CONFIG: undefined });
    assert.equal(c.ios.bundleIdentifier, contract.applicationId); assert.equal(c.android.package, contract.applicationId);
    assert.equal(c.updates.enabled, false); assert.equal(c.android.allowBackup, false); assert.equal(c.extra.eas, undefined);
    assert.deepEqual(Object.keys(c.ios.entitlements), []); assert.deepEqual(Object.keys(c.ios.infoPlist.SCV3TestStoreConfiguration), []);
    assert.equal(c.ios.infoPlist.SCV1TestStoreConfiguration, undefined);
  }
  for (const invalid of [{ ...env(), EAS_BUILD_PROFILE: "production" }, { ...env(), CHILLYWOOD_TEST_STORE_FLAVOR: "isolated-test-store-debug-v1" },
    { ...env(), CHILLYWOOD_TEST_STORE_NATIVE_CONFIG: "{}" }, { CHILLYWOOD_TEST_STORE_V3_FLAVOR: "isolated-test-store-debug-v3" }]) assert.throws(() => resolve(base, invalid));
  // Exercise Expo's real dynamic-config loader, not TypeScript transpileModule:
  // Expo transforms app.config.ts but imported helpers must be Node-loadable.
  for (const profile of ["ios", "ios-simulator", "android"]) {
    const environment = { ...process.env, EXPO_NO_DOTENV: "1", EAS_BUILD_PROFILE: `isolated-test-store-v3-debug-${profile}`,
      CHILLYWOOD_TEST_STORE_V3_FLAVOR: "isolated-test-store-debug-v3" };
    for (const name of ["CHILLYWOOD_TEST_STORE_FLAVOR", "CHILLYWOOD_TEST_STORE_NATIVE_CONFIG", "CHILLYWOOD_TEST_STORE_V3_NATIVE_CONFIG", "CHILLYWOOD_TEST_STORE_V2_FLAVOR", "CHILLYWOOD_TEST_STORE_V2_NATIVE_CONFIG"]) delete environment[name];
    const loaded = spawnSync(process.execPath, ["-e", `const {getConfig}=require('@expo/config');const c=getConfig(process.cwd(),{skipPlugins:true}).exp;
      if(c.ios.bundleIdentifier!==${JSON.stringify(contract.applicationId)}||c.android.package!==${JSON.stringify(contract.applicationId)}||c.updates.enabled!==false||Object.keys(c.ios.infoPlist.SCV3TestStoreConfiguration).length!==0)process.exit(2);`],
    { cwd: root, env: environment, encoding: "utf8", timeout: 30000 });
    assert.equal(loaded.status, 0, `Actual Expo loader failed for ${profile}: ${loaded.stderr}`);
  }
});

test("v3 canonical descriptor pins exact Test Store key/profile; provider values never enter OTA extras", () => {
  const config = resolve(base, env()); const b = config.ios.infoPlist.SCV3TestStoreConfiguration;
  const descriptor = { protocol: contract.protocol, mode: contract.mode, platform: "ios", applicationId: contract.applicationId,
    projectId: provider.projectId, appId: provider.appId, publicSdkKeySha256: createHash("sha256").update(provider.publicSdkKey).digest("hex"), storageNamespace: contract.storageNamespace };
  assert.equal(b.configId, createHash("sha256").update(JSON.stringify(descriptor)).digest("hex"));
  assert.equal(JSON.stringify(config.extra).includes(provider.publicSdkKey), false);
  for (const invalid of [{ ...provider, publicSdkKey: "appl_not_allowed" }, { ...provider, extra: true }, []])
    assert.throws(() => resolve(base, { ...env(), CHILLYWOOD_TEST_STORE_V3_NATIVE_CONFIG: JSON.stringify(invalid) }));
});

test("v3 flavor suppression survives invalid native proof and JS development flags never admit Release", () => {
  assert.equal(nativeHelper().isIsolatedTestStoreV3Flavor(), true); assert.equal(nativeHelper().readIsolatedTestStoreV3Build(), null);
  assert.equal(nativeHelper(null, "com.chillywood.mobile").isIsolatedTestStoreV3Flavor(), false);
  assert.ok(nativeHelper({ build: build("ios") }).readIsolatedTestStoreV3Build());
  for (const mutate of [v => { v.nativeDebug = false; }, v => { v.protocol = "isolated-test-store-build-v1"; }, v => { v.platform = "android"; },
    v => { v.storageNamespace = "@chillywood/test-store-debug-v1"; }, v => { v.extra = true; }]) {
    const value = build("ios"); mutate(value); assert.equal(nativeHelper({ build: value }).readIsolatedTestStoreV3Build(), null);
  }
});

test("native installation and recovery validate exact identity and cannot manufacture completed callbacks", async () => {
  const uuid = "a0000000-0000-4000-8000-000000000001";
  const snapshot = { protocol: "isolated-test-store-native-v3", installationId: uuid, configurationDigest: build("ios").configId,
    customer: null, processRetired: false, activeInvocationId: null };
  const helper = nativeHelper({ build: build("ios"), inspectInstallation: async () => snapshot, readInvocation: async () => null });
  assert.equal((await helper.inspectIsolatedTestStoreV3Installation()).installationId, uuid);
  assert.equal(await helper.readIsolatedTestStoreV3NativeInvocation(uuid), null);
  for (const altered of [{ ...snapshot, configurationDigest: "0".repeat(64) }, { ...snapshot, activeInvocationId: "legacy" }, { ...snapshot, extra: true }])
    await assert.rejects(nativeHelper({ build: build("ios"), inspectInstallation: async () => altered }).inspectIsolatedTestStoreV3Installation());
  for (const invalid of [{ state: "completed" }, { protocol: "isolated-test-store-native-v1", invocationId: uuid }])
    await assert.rejects(nativeHelper({ build: build("ios"), readInvocation: async () => invalid }).readIsolatedTestStoreV3NativeInvocation(uuid));
});

test("v3 Debug build profiles have no release submission or v1 inheritance", () => {
  const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
  for (const platform of ["ios", "android"]) {
    const p = eas.build[`isolated-test-store-v3-debug-${platform}`]; assert.equal(p.extends, undefined); assert.equal(p.developmentClient, true);
    assert.equal(p.env.CHILLYWOOD_TEST_STORE_V3_FLAVOR, "isolated-test-store-debug-v3"); assert.equal(p.env.CHILLYWOOD_TEST_STORE_FLAVOR, undefined);
    assert.equal(eas.submit[`isolated-test-store-v3-debug-${platform}`], undefined);
  }
  assert.equal(eas.build["isolated-test-store-v3-debug-ios"].ios.buildConfiguration, "Debug");
  assert.equal(eas.build["isolated-test-store-v3-debug-android"].android.gradleCommand, ":app:assembleDebug");
});

test("completed unavailable package lookup has a narrow typed result and no invocation or purchase capability", async () => {
  const id = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const customer = { id: `scv3_customer_${id(1)}`, buyerId: id(2), installationId: id(3), providerAppUserId: `scv3_teststore_${id(4)}`,
    configurationDigest: build("ios").configId, projectId: provider.projectId, appId: provider.appId, providerScopeKey: JSON.stringify(["revenuecat", provider.projectId, provider.appId, "TEST_STORE", "SANDBOX"]), economicApplicationId: `rc_test_store:${provider.projectId}:${provider.appId}`,
    provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX" };
  const allocation = { id: `scv3_allocation_${id(5)}`, intentId: `scv1_intent_${id(6)}`, dispatchId: id(7), customerBindingId: customer.id,
    configurationDigest: customer.configurationDigest, productId: "tip_fixture", acceptPurchaseUntil: "2030-01-01T00:00:00Z",
    quote: { offerId: `scv1_offer_${id(8)}`, offerRevision: 1, resourceId: `scv1_resource_${id(9)}`, resourceRevision: 1, creatorId: id(10), kind: "paid_content", amountMinor: 500, currency: "usd", asset: { id: `scv1_asset_${id(20)}`, incarnation: id(21), sha256: "a".repeat(64), byteLength: 1024, resourceRevision: 1, profile: "scpv-mp4-h264-aac-v1" } },
    registration: { id: `scv3_registration_${id(11)}`, providerOfferingId: "ofrng_fixture", offeringIdentifier: "lookup_fixture", providerPackageId: "pkge_fixture", packageIdentifier: "package_fixture", providerProductId: "prod_fixture", productId: "tip_fixture" } };
  let purchases = 0;
  const native = { build: build("ios"), preparePackage: async () => ({ status: "package_unavailable", handleId: null, invocation: null }), purchasePrepared: async () => { purchases++; } };
  const result = await nativeHelper(native).prepareIsolatedTestStoreV3NativePackage(customer, allocation, id(12));
  assert.equal(result.status, "package_unavailable"); assert.equal(result.handleId, null); assert.equal(result.invocation, null); assert.equal(purchases, 0);
  for (const response of [{ status: "package_unavailable", handleId: id(13), invocation: null }, { status: "package_unavailable", handleId: null, invocation: null, noCharge: true }])
    await assert.rejects(nativeHelper({ ...native, preparePackage: async () => response }).prepareIsolatedTestStoreV3NativePackage(customer, allocation, id(12)));
});

test("native plugin removes old metadata and inherited shared identity", () => {
  const handlers = {}, c = { exports: {}, module: { exports: {} }, require: name => {
    if (name === "../config/test-store-debug-v3.json") return contract;
    if (name === "@expo/config-plugins") return { createRunOncePlugin: f => f, withInfoPlist: (c, f) => { handlers.ios = f; return c; },
      withEntitlementsPlist: (c, f) => { handlers.entitlements = f; return c; }, withAndroidManifest: (c, f) => { handlers.android = f; return c; } };
    throw Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "plugins/withIsolatedTestStoreV3Debug.js"), "utf8"), c);
  c.module.exports.withIsolatedTestStoreV3Debug(resolve(base, env("android")));
  const info = handlers.ios({ modResults: { SCV1TestStoreFlavor: true, SCV1TestStoreConfiguration: {}, SCV2TestStoreFlavor: true, SCV2TestStoreConfiguration: {}, SCQQualificationConfiguration: {} } }).modResults;
  assert.equal(info.SCV1TestStoreFlavor, undefined); assert.equal(info.SCV2TestStoreFlavor, undefined); assert.equal(info.SCV2TestStoreConfiguration, undefined); assert.equal(info.SCQQualificationConfiguration, undefined); assert.equal(info.SCV3TestStoreFlavor, true);
  assert.deepEqual(Object.keys(handlers.entitlements({ modResults: { "keychain-access-groups": ["shared"] } }).modResults), []);
  const manifest = { modResults: { manifest: { $: {}, application: [{ $: {}, "meta-data": [{ $: { "android:name": "SCV1_TESTSTORE_CONFIG", "android:value": "legacy" } }] }] } } };
  const app = handlers.android(manifest).modResults.manifest.application[0]; assert.equal(app.$["android:allowBackup"], "false");
  assert.equal(app["meta-data"].some(i => i.$["android:name"].startsWith("SCV1")), false);
  manifest.modResults.manifest.$["android:sharedUserId"] = "legacy"; assert.throws(() => handlers.android(manifest));
});

function purchaseFixture() {
  const id = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const customer = { id: `scv3_customer_${id(1)}`, buyerId: id(2), installationId: id(3), providerAppUserId: `scv3_teststore_${id(4)}`,
    configurationDigest: build("ios").configId, projectId: provider.projectId, appId: provider.appId,
    providerScopeKey: JSON.stringify(["revenuecat", provider.projectId, provider.appId, "TEST_STORE", "SANDBOX"]),
    economicApplicationId: "rc_test_store:" + provider.projectId + ":" + provider.appId, provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX" };
  const allocation = { id: `scv3_allocation_${id(5)}`, intentId: `scv1_intent_${id(6)}`, dispatchId: id(7), customerBindingId: customer.id,
    configurationDigest: customer.configurationDigest, productId: "video_fixture", acceptPurchaseUntil: "2030-01-01T00:00:00Z",
    quote: { offerId: `scv1_offer_${id(8)}`, offerRevision: 1, resourceId: `scv1_resource_${id(9)}`, resourceRevision: 1, creatorId: id(10), kind: "paid_content", amountMinor: 500, currency: "usd",
      asset: { id: `scv1_asset_${id(11)}`, incarnation: id(12), sha256: "a".repeat(64), byteLength: 4096, resourceRevision: 1, profile: "scpv-mp4-h264-aac-v1" } },
    registration: { id: `scv3_registration_${id(13)}`, providerOfferingId: "ofrng_fixture", offeringIdentifier: "lookup_fixture", providerPackageId: "pkge_fixture", packageIdentifier: "package_fixture", providerProductId: "prod_fixture", productId: "video_fixture" } };
  const observation = { protocol: "isolated-test-store-native-v3", invocationId: allocation.dispatchId, customerBindingId: customer.id,
    installationId: customer.installationId, buyerId: customer.buyerId, configurationDigest: customer.configurationDigest, providerAppUserId: customer.providerAppUserId,
    allocationId: allocation.id, registrationId: allocation.registration.id, sessionId: id(14), quote: structuredClone(allocation.quote),
    state: "prepared", outcome: null, transactionHint: null, completedAt: null };
  const prepared = { status: "prepared", handleId: id(15), invocation: observation };
  const completed = { ...observation, state: "completed", outcome: "sdk_success", transactionHint: "untrusted-sdk-hint", completedAt: new Date().toISOString() };
  const claim = { protocol: "isolated-test-store-v3", command: "claim", requestId: id(16), actor: { userId: customer.buyerId, sessionId: observation.sessionId },
    generation: 1, environment: "sandbox", result: { status: "dispatch_claimed", reason: "first_claim", dispatchAllowed: true, retryProviderMutation: false, grantsAccess: false, notPayable: true,
      customer, allocation, reservation: { revision: 1, activeAllocationId: allocation.id }, authorityValidUntil: new Date(Date.now() + 4000).toISOString(), receipt: null } };
  const freshClaim = () => ({ ...claim, result: { ...claim.result, authorityValidUntil: new Date(Date.now() + 4000).toISOString() } });
  return { id, customer, allocation, observation, prepared, completed, freshClaim };
}

test("native preparation and completion remain bound to every immutable asset field", async () => {
  const { id, customer, allocation, observation, prepared, completed, freshClaim } = purchaseFixture();
  let sdkCalls = 0;
  const bridge = { build: build("ios"), preparePackage: async () => prepared, purchasePrepared: async () => { sdkCalls++; return completed; } };
  const result = await nativeHelper(bridge).prepareIsolatedTestStoreV3NativePackage(customer, allocation, observation.sessionId);
  assert.equal(result.status, "prepared");
  assert.equal((await nativeHelper(bridge).purchaseIsolatedTestStoreV3NativePackage(result, customer, allocation, freshClaim())).state, "completed");
  for (const key of ["id", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"]) {
    const changed = structuredClone(observation);
    changed.quote.asset[key] = key === "byteLength" || key === "resourceRevision" ? changed.quote.asset[key] + 1
      : key === "id" ? `scv1_asset_${id(20)}` : key === "incarnation" ? id(21) : key === "sha256" ? "b".repeat(64) : "other";
    await assert.rejects(nativeHelper({ ...bridge, preparePackage: async () => ({ ...prepared, invocation: changed }) })
      .prepareIsolatedTestStoreV3NativePackage(customer, allocation, observation.sessionId));
    const before = sdkCalls;
    await assert.rejects(nativeHelper({ ...bridge, purchasePrepared: async () => { sdkCalls++; return { ...completed, quote: changed.quote }; } })
      .purchaseIsolatedTestStoreV3NativePackage(result, customer, allocation, freshClaim()));
    assert.equal(sdkCalls, before + 1, "rejection follows the actual native observation, not a stale lease");
  }
});

test("prepared closure readback preserves the original session and cannot masquerade as SDK completion", async () => {
  const { id, customer, allocation, observation, prepared, freshClaim } = purchaseFixture();
  const closure = { protocol: "isolated-test-store-native-prepared-closure-v3", state: "prepared_closed", invocation: observation, closedAt: new Date().toISOString() };
  let calls = 0;
  const bridge = { build: build("ios"), readInvocation: async () => closure,
    closePrepared: async (c, a, session) => { calls++; assert.deepEqual(JSON.parse(c), customer); assert.deepEqual(JSON.parse(a), allocation); assert.equal(session, id(40)); return closure; },
    purchasePrepared: async () => closure };
  const helper = nativeHelper(bridge);
  assert.deepEqual(await helper.closeIsolatedTestStoreV3NativePrepared(customer, allocation, id(40)), closure);
  assert.equal((await helper.readIsolatedTestStoreV3NativeInvocation(allocation.dispatchId)).invocation.sessionId, observation.sessionId);
  assert.notEqual(observation.sessionId, id(40)); assert.equal(calls, 1);
  await assert.rejects(helper.purchaseIsolatedTestStoreV3NativePackage(prepared, customer, allocation, freshClaim()));
  for (const mutate of [v => { v.noCharge = true; }, v => { v.protocol = "isolated-test-store-native-v3"; },
    v => { v.invocation.state = "invoking"; }, v => { v.invocation.outcome = "sdk_cancelled"; }, v => { v.closedAt = "invalid"; },
    v => { v.invocation.invocationId = id(50); }, v => { v.invocation.configurationDigest = "b".repeat(64); }]) {
    const changed = structuredClone(closure); mutate(changed);
    await assert.rejects(nativeHelper({ ...bridge, readInvocation: async () => changed }).readIsolatedTestStoreV3NativeInvocation(allocation.dispatchId));
  }
  for (const mutate of [v => { v.invocation.allocationId = `scv3_allocation_${id(51)}`; }, v => { v.invocation.buyerId = id(52); },
    v => { v.invocation.quote.asset.sha256 = "b".repeat(64); }, v => { v.invocation.quote.asset.incarnation = id(53); }]) {
    const changed = structuredClone(closure); mutate(changed);
    await assert.rejects(nativeHelper({ ...bridge, closePrepared: async () => changed }).closeIsolatedTestStoreV3NativePrepared(customer, allocation, id(40)));
  }
  for (const platform of ["android/src/main/java/expo/modules/chillywoodteststore/ChillywoodTestStoreV3Module.kt", "ios/ChillywoodTestStoreV3Module.swift"]) {
    const source = fs.readFileSync(path.join(root, "modules/chillywood-test-store-admission", platform), "utf8");
    assert.match(source, /fun closePrepared|func closePrepared/u);
    assert.match(source, /invocation(?:\.get\("state"\)|\["state"\] as\? String) == "prepared"/u);
    assert.match(source, /packages\.(?:clear|removeAll)\(\)[\s\S]*?policy\.closePrepared/u);
  }
});

if (process.env.ISOLATED_TEST_STORE_V3_NATIVE_POLICY === "1") test("compiled v3 ownership retires after any uncertain persistence and preserves original asset identity", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-teststore-v3-policy-"));
  const run = (bin, args) => { const result = spawnSync(bin, args, { cwd: temporary, encoding: "utf8", timeout: 120000, maxBuffer: 2_000_000 });
    assert.equal(result.status, 0, `${path.basename(bin)}: ${(result.stderr ?? "").slice(-10000)}`); return result.stdout; };
  const id = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, fp = "a".repeat(64);
  try {
    const java = process.env.TEST_STORE_JAVA_HOME ?? "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
    fs.writeFileSync(path.join(temporary, "LifecycleTest.java"), `import java.util.*;import java.io.IOException;import expo.modules.chillywoodteststore.TestStoreV3Policy;
public class LifecycleTest {
 static String sid="${id(1)}",first="${id(2)}",second="${id(3)}",fp="${fp}";
 static void check(boolean b){if(!b)throw new AssertionError();}static void denied(Runnable r){try{r.run();throw new AssertionError();}catch(IllegalStateException expected){}}
 @SuppressWarnings("unchecked") static <E extends Throwable> void sneaky(Throwable e)throws E{throw (E)e;}
 static class Store implements TestStoreV3Policy.Store {
  Map<String,String> value;String mode="";int writes;boolean written;
  public Map<String,String> load(){if(written&&mode.equals("read_error"))sneaky(new IOException("readback"));Map<String,String> r=value==null?null:new HashMap<>(value);if(written&&mode.equals("read_mismatch"))r.put("active","");return r;}
  public void commit(Map<String,String> v){writes++;if(mode.equals("before"))sneaky(new IOException("before"));value=new HashMap<>(v);written=true;if(mode.equals("after"))sneaky(new IOException("after"));}
 }
 static TestStoreV3Policy bound(Store s){TestStoreV3Policy p=new TestStoreV3Policy(s);p.bind("owner",sid,()->false,()->{});return p;}
 static void failed(String mode,boolean completion){Store s=new Store();TestStoreV3Policy p=bound(s);String ticket="";
  if(completion){ticket=p.reserve(first,sid,fp,"prepared");p.invoke(ticket,first,sid,fp,"invoking");}
  s.mode=mode;s.written=false;int before=s.writes;if(completion)denied(()->p.complete(first,"completed"));else denied(()->p.reserve(first,sid,fp,"prepared"));
  check(p.retired());check(s.writes==before+1);Map<String,String> disk=new HashMap<>(s.value);int attempts=s.writes;s.mode="";
  denied(()->p.current(sid));denied(()->p.bind("owner",sid,()->false,()->{}));denied(()->p.reserve(second,sid,fp,"replacement"));denied(()->p.complete(first,"stale-rewrite"));p.retire(sid);
  check(s.writes==attempts);check(s.value.equals(disk));TestStoreV3Policy recovered=new TestStoreV3Policy(s);check(recovered.installationId().equals(p.installationId()));
 }
 public static void main(String[] args){
  check(TestStoreV3Policy.cacheMatches("uid",false,List.of()));check(TestStoreV3Policy.cacheMatches("uid",true,List.of("uid")));check(!TestStoreV3Policy.cacheMatches("uid",true,List.of()));check(!TestStoreV3Policy.cacheMatches("uid",true,List.of("other")));
  Store s=new Store();TestStoreV3Policy p=bound(s);String install=p.installationId();String miss=p.beginLookup(first,sid);denied(()->p.beginLookup(first,sid));check(p.read(first)==null);p.endLookup(miss);String lookup=p.beginLookup(first,sid);
  String ticket=p.reserveAfterLookup(lookup,first,sid,fp,"prepared");check(s.value.get("record:"+first).equals("prepared"));denied(()->p.endLookup(lookup));denied(()->p.reserve(second,sid,fp,"other"));
  Store preparedCopy=new Store();preparedCopy.value=s.load();TestStoreV3Policy lost=bound(preparedCopy);denied(()->lost.invoke(ticket,first,sid,fp,"forged"));denied(()->lost.reserve(second,sid,fp,"other"));
  denied(()->p.invoke(ticket,first,sid,"b".repeat(64),"changed"));p.invoke(ticket,first,sid,fp,"invoking");denied(()->p.invoke(ticket,first,sid,fp,"again"));
  Store restartCopy=new Store();restartCopy.value=s.load();TestStoreV3Policy restarted=bound(restartCopy);check(!restarted.isNativeInvocation(first));denied(()->restarted.complete(first,"invented"));denied(()->restarted.reserve(second,sid,fp,"other"));
  p.complete(first,"completed");String next=p.reserve(second,sid,fp,"prepared2");p.invoke(next,second,sid,fp,"invoking2");p.retire(sid);p.complete(second,"completed2");check(p.read(first).equals("completed"));check(p.active().isEmpty());denied(()->p.reserve(first,sid,fp,"again"));
  TestStoreV3Policy reopened=bound(s);check(reopened.installationId().equals(install));denied(()->reopened.bind("other",sid,()->false,()->{}));denied(()->reopened.bind("owner",sid,()->false,()->{}));
  TestStoreV3Policy aba=bound(new Store());aba.retire(sid);denied(()->aba.bind("owner",sid,()->false,()->{}));TestStoreV3Policy generation=bound(new Store());denied(()->generation.bind("owner","${id(4)}",()->false,()->{}));denied(()->generation.current(sid));
  for(String mode:List.of("before","after","read_error","read_mismatch")){failed(mode,false);if(!mode.equals("read_mismatch"))failed(mode,true);}
  Store legacy=new Store();legacy.value=new HashMap<>(s.value);legacy.value.put("version","2");denied(()->new TestStoreV3Policy(legacy));
  Store closureStore=new Store();TestStoreV3Policy closer=bound(closureStore);String stale=closer.reserve(first,sid,fp,"prepared-original");
  denied(()->closer.closePrepared(first,sid,"wrong","closed"));closer.closePrepared(first,sid,"prepared-original","closed-original");
  check(closer.active().isEmpty()&&closer.read(first).equals("closed-original"));denied(()->closer.invoke(stale,first,sid,fp,"late"));
  denied(()->closer.reserve(first,sid,fp,"again"));String nextClose=closer.reserve(second,sid,fp,"prepared-next");closer.invoke(nextClose,second,sid,fp,"invoking-next");
  denied(()->closer.closePrepared(second,sid,"prepared-next","closed"));Store invokingDisk=new Store();invokingDisk.value=closureStore.load();
  TestStoreV3Policy invokingRestart=bound(invokingDisk);denied(()->invokingRestart.closePrepared(second,sid,"prepared-next","closed"));
  Store preparedDisk=new Store();TestStoreV3Policy beforeRestart=bound(preparedDisk);beforeRestart.reserve(first,sid,fp,"original-session-document");
  TestStoreV3Policy afterRestart=new TestStoreV3Policy(preparedDisk);String newSession="${id(4)}";afterRestart.bind("owner",newSession,()->false,()->{});
  afterRestart.closePrepared(first,newSession,"original-session-document","closed-original-session-document");check(afterRestart.read(first).equals("closed-original-session-document"));
  Store retiredDisk=new Store();TestStoreV3Policy retiredPrepared=bound(retiredDisk);retiredPrepared.reserve(first,sid,fp,"prepared");retiredPrepared.retire(sid);
  denied(()->retiredPrepared.closePrepared(first,sid,"prepared","closed"));check(retiredPrepared.active().equals(first));
  for(String mode:List.of("before","after","read_error")){Store broken=new Store();TestStoreV3Policy owner=bound(broken);String old=owner.reserve(first,sid,fp,"prepared");
    broken.mode=mode;broken.written=false;denied(()->owner.closePrepared(first,sid,"prepared","closed"));check(owner.retired());Map<String,String> disk=broken.value;int writes=broken.writes;broken.mode="";
    denied(()->owner.closePrepared(first,sid,"prepared","retry"));denied(()->owner.invoke(old,first,sid,fp,"late"));denied(()->owner.complete(first,"invented"));check(broken.writes==writes&&Objects.equals(disk,broken.value));}
  for(int n=0;n<40;n++){Store raceStore=new Store();TestStoreV3Policy race=bound(raceStore);String old=race.reserve(first,sid,fp,"prepared");
    java.util.concurrent.CountDownLatch ready=new java.util.concurrent.CountDownLatch(1);java.util.concurrent.atomic.AtomicInteger winners=new java.util.concurrent.atomic.AtomicInteger();
    Thread closing=new Thread(()->{try{ready.await();race.closePrepared(first,sid,"prepared","closed");winners.incrementAndGet();}catch(IllegalStateException expected){}catch(InterruptedException e){throw new AssertionError(e);}});
    Thread invoking=new Thread(()->{try{ready.await();race.invoke(old,first,sid,fp,"invoking");winners.incrementAndGet();}catch(IllegalStateException expected){}catch(InterruptedException e){throw new AssertionError(e);}});
    closing.start();invoking.start();ready.countDown();try{closing.join();invoking.join();}catch(InterruptedException e){throw new AssertionError(e);}check(winners.get()==1);
    check(race.read(first).equals("closed")?race.active().isEmpty()&&!race.isNativeInvocation(first):race.active().equals(first)&&race.isNativeInvocation(first));}
  System.out.println("java-v3-lifecycle-passed");
 }
}`);
    run(path.join(java, "bin/javac"), ["-d", temporary, path.join(root, "modules/chillywood-test-store-admission/android/src/main/java/expo/modules/chillywoodteststore/TestStoreV3Policy.java"), path.join(temporary, "LifecycleTest.java")]);
    assert.match(run(path.join(java, "bin/java"), ["-cp", temporary, "LifecycleTest"]), /java-v3-lifecycle-passed/u);
    const c = { ...build("ios") }; delete c.nativeDebug;
    const customer = { id: `scv3_customer_${id(5)}`, buyerId: id(6), installationId: id(7), providerAppUserId: `scv3_teststore_${id(8)}`,
      configurationDigest: c.configId, projectId: provider.projectId, appId: provider.appId,
      providerScopeKey: JSON.stringify(["revenuecat", provider.projectId, provider.appId, "TEST_STORE", "SANDBOX"]),
      economicApplicationId: `rc_test_store:${provider.projectId}:${provider.appId}`, provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX" };
    const a = { id: `scv3_allocation_${id(9)}`, intentId: `scv1_intent_${id(10)}`, dispatchId: id(11), customerBindingId: customer.id,
      configurationDigest: c.configId, productId: "video_fixture", acceptPurchaseUntil: "2030-01-01T00:00:00Z",
      quote: { offerId: `scv1_offer_${id(12)}`, offerRevision: 1, resourceId: `scv1_resource_${id(13)}`, resourceRevision: 1, creatorId: id(14), kind: "paid_content", amountMinor: 500, currency: "usd",
        asset: { id: `scv1_asset_${id(15)}`, incarnation: id(16), sha256: fp, byteLength: 1024, resourceRevision: 1, profile: "scpv-mp4-h264-aac-v1" } },
      registration: { id: `scv3_registration_${id(17)}`, providerOfferingId: "ofrng", offeringIdentifier: "lookup", providerPackageId: "pkge", packageIdentifier: "package", providerProductId: "prod", productId: "video_fixture" } };
    fs.writeFileSync(path.join(temporary, "main.swift"), `import Foundation
final class Store {
 var value:[String:String]?;var mode="";var writes=0;var written=false
 func load()throws->[String:String]?{if written && mode=="read_error"{throw TestStoreV3Error.unavailable};var r=value;if written && mode=="read_mismatch"{r?["active"]=""};return r}
 func save(_ v:[String:String])throws{writes += 1;if mode=="before"{throw TestStoreV3Error.unavailable};value=v;written=true;if mode=="after"{throw TestStoreV3Error.unavailable}}
}
func denied(_ f:()throws->Void){do{try f();preconditionFailure()}catch{}}
let sid="${id(1)}",first="${id(2)}",second="${id(3)}",fp="${fp}"
func bound(_ s:Store)throws->TestStoreV3Policy{let p=try TestStoreV3Policy(load:s.load,commit:s.save);try p.bind(ownerDocument:"owner",capturedSession:sid,alreadyConfigured:{false},configure:{});return p}
func failed(_ mode:String,_ completion:Bool)throws{let s=Store();let p=try bound(s)
 if completion{let h=try p.reserve(dispatchId:first,capturedSession:sid,fingerprint:fp,preparedDocument:"prepared");try p.invoke(ticket:h,dispatchId:first,capturedSession:sid,fingerprint:fp,invokingDocument:"invoking")}
 s.mode=mode;s.written=false;let before=s.writes
 if completion{denied{try p.complete(dispatchId:first,completedDocument:"completed")}}else{denied{_ = try p.reserve(dispatchId:first,capturedSession:sid,fingerprint:fp,preparedDocument:"prepared")}}
 precondition(p.retired && s.writes==before+1);let disk=s.value;let attempts=s.writes;s.mode=""
 denied{try p.current(sid)};denied{try p.bind(ownerDocument:"owner",capturedSession:sid,alreadyConfigured:{false},configure:{})};denied{_ = try p.reserve(dispatchId:second,capturedSession:sid,fingerprint:fp,preparedDocument:"replacement")};denied{try p.complete(dispatchId:first,completedDocument:"stale-rewrite")};p.retire(sid)
 precondition(s.writes==attempts && s.value==disk);let recovered=try TestStoreV3Policy(load:s.load,commit:s.save);precondition(recovered.installationId==p.installationId)
}
precondition(TestStoreV3Policy.cacheMatches(expected:"uid",footprint:false,identities:[]));precondition(TestStoreV3Policy.cacheMatches(expected:"uid",footprint:true,identities:["uid"]));precondition(!TestStoreV3Policy.cacheMatches(expected:"uid",footprint:true,identities:[]));precondition(!TestStoreV3Policy.cacheMatches(expected:"uid",footprint:true,identities:["other"]))
let s=Store();let p=try bound(s);let install=p.installationId;let miss=try p.beginLookup(dispatchId:first,capturedSession:sid);denied{_ = try p.beginLookup(dispatchId:first,capturedSession:sid)};let absent=try p.read(first);precondition(absent==nil);try p.endLookup(miss);let lookup=try p.beginLookup(dispatchId:first,capturedSession:sid)
let h=try p.reserveAfterLookup(token:lookup,dispatchId:first,capturedSession:sid,fingerprint:fp,document:"prepared");denied{try p.endLookup(lookup)};precondition(s.value?["record:"+first]=="prepared")
let preparedCopy=Store();preparedCopy.value=s.value;let lost=try bound(preparedCopy);denied{try lost.invoke(ticket:h,dispatchId:first,capturedSession:sid,fingerprint:fp,invokingDocument:"forged")};denied{_ = try lost.reserve(dispatchId:second,capturedSession:sid,fingerprint:fp,preparedDocument:"other")}
try p.invoke(ticket:h,dispatchId:first,capturedSession:sid,fingerprint:fp,invokingDocument:"invoking");denied{try p.invoke(ticket:h,dispatchId:first,capturedSession:sid,fingerprint:fp,invokingDocument:"again")}
let restartCopy=Store();restartCopy.value=s.value;let restarted=try bound(restartCopy);precondition(!restarted.isNativeInvocation(first));denied{try restarted.complete(dispatchId:first,completedDocument:"invented")}
try p.complete(dispatchId:first,completedDocument:"completed");let next=try p.reserve(dispatchId:second,capturedSession:sid,fingerprint:fp,preparedDocument:"prepared2");try p.invoke(ticket:next,dispatchId:second,capturedSession:sid,fingerprint:fp,invokingDocument:"invoking2");p.retire(sid);try p.complete(dispatchId:second,completedDocument:"completed2");let retained=try p.read(first);precondition(retained=="completed" && p.active.isEmpty);denied{_ = try p.reserve(dispatchId:first,capturedSession:sid,fingerprint:fp,preparedDocument:"again")}
let reopened=try bound(s);precondition(reopened.installationId==install);denied{try reopened.bind(ownerDocument:"other",capturedSession:sid,alreadyConfigured:{false},configure:{})};denied{try reopened.bind(ownerDocument:"owner",capturedSession:sid,alreadyConfigured:{false},configure:{})}
let aba=try bound(Store());aba.retire(sid);denied{try aba.current(sid)};let generation=try bound(Store());denied{try generation.bind(ownerDocument:"owner",capturedSession:"${id(4)}",alreadyConfigured:{false},configure:{})};denied{try generation.current(sid)}
for mode in ["before","after","read_error","read_mismatch"]{try failed(mode,false);if mode != "read_mismatch"{try failed(mode,true)}}
let legacy=Store();legacy.value=s.value;legacy.value?["version"]="2";denied{_ = try TestStoreV3Policy(load:legacy.load,commit:legacy.save)}
let config = try TestStoreV3Contract.object(#"${JSON.stringify(c)}"#) as! [String:String]
#if DEBUG
precondition(TestStoreV3Contract.build("${contract.applicationId}",config) != nil)
#else
precondition(TestStoreV3Contract.build("${contract.applicationId}",config) == nil)
#endif
let customer = try TestStoreV3Contract.customer(#"${JSON.stringify(customer)}"#,config,"${customer.installationId}")
let allocation = try TestStoreV3Contract.allocation(#"${JSON.stringify(a)}"#,customer)
let invocation = try TestStoreV3Contract.invocation(customer,allocation,sid)
let storedQuote = try TestStoreV3Contract.json(invocation["quote"]!);let originalQuote = try TestStoreV3Contract.json(allocation["quote"]!);precondition(storedQuote==originalQuote)
for (key,value) in [("id","scv3_asset_${id(15)}" as Any),("incarnation","legacy" as Any),("sha256",String(repeating:"A",count:64) as Any),("byteLength",0 as Any),("byteLength",16777217 as Any),("resourceRevision",2 as Any),("profile","unscanned" as Any)] {
 var changed=allocation;var q=changed["quote"] as! [String:Any];var asset=q["asset"] as! [String:Any];asset[key]=value;q["asset"]=asset;changed["quote"]=q;denied{_ = try TestStoreV3Contract.allocation(TestStoreV3Contract.json(changed),customer)}
}
var wrongScope=customer;wrongScope["economicApplicationId"]="wrong";denied{_ = try TestStoreV3Contract.customer(TestStoreV3Contract.json(wrongScope),config,"${customer.installationId}")}
let closureStore=Store();let closer=try bound(closureStore);let stale=try closer.reserve(dispatchId:first,capturedSession:sid,fingerprint:fp,preparedDocument:"prepared-original")
denied{try closer.closePrepared(dispatchId:first,capturedSession:sid,preparedDocument:"wrong",closedDocument:"closed")}
try closer.closePrepared(dispatchId:first,capturedSession:sid,preparedDocument:"prepared-original",closedDocument:"closed-original")
let closed=try closer.read(first);precondition(closer.active.isEmpty && closed=="closed-original")
denied{try closer.invoke(ticket:stale,dispatchId:first,capturedSession:sid,fingerprint:fp,invokingDocument:"late")};denied{_ = try closer.reserve(dispatchId:first,capturedSession:sid,fingerprint:fp,preparedDocument:"again")}
let nextClose=try closer.reserve(dispatchId:second,capturedSession:sid,fingerprint:fp,preparedDocument:"prepared-next");try closer.invoke(ticket:nextClose,dispatchId:second,capturedSession:sid,fingerprint:fp,invokingDocument:"invoking-next")
denied{try closer.closePrepared(dispatchId:second,capturedSession:sid,preparedDocument:"prepared-next",closedDocument:"closed")}
let invokingDisk=Store();invokingDisk.value=closureStore.value;let invokingRestart=try bound(invokingDisk);denied{try invokingRestart.closePrepared(dispatchId:second,capturedSession:sid,preparedDocument:"prepared-next",closedDocument:"closed")}
let preparedDisk=Store();let beforeRestart=try bound(preparedDisk);_ = try beforeRestart.reserve(dispatchId:first,capturedSession:sid,fingerprint:fp,preparedDocument:"original-session-document")
let afterRestart=try TestStoreV3Policy(load:preparedDisk.load,commit:preparedDisk.save);let newSession="${id(4)}";try afterRestart.bind(ownerDocument:"owner",capturedSession:newSession,alreadyConfigured:{false},configure:{})
try afterRestart.closePrepared(dispatchId:first,capturedSession:newSession,preparedDocument:"original-session-document",closedDocument:"closed-original-session-document")
let retainedClosure=try afterRestart.read(first);precondition(retainedClosure=="closed-original-session-document")
let retiredDisk=Store();let retiredPrepared=try bound(retiredDisk);_ = try retiredPrepared.reserve(dispatchId:first,capturedSession:sid,fingerprint:fp,preparedDocument:"prepared");retiredPrepared.retire(sid)
denied{try retiredPrepared.closePrepared(dispatchId:first,capturedSession:sid,preparedDocument:"prepared",closedDocument:"closed")};precondition(retiredPrepared.active==first)
for mode in ["before","after","read_error"]{let broken=Store();let owner=try bound(broken);let old=try owner.reserve(dispatchId:first,capturedSession:sid,fingerprint:fp,preparedDocument:"prepared")
 broken.mode=mode;broken.written=false;denied{try owner.closePrepared(dispatchId:first,capturedSession:sid,preparedDocument:"prepared",closedDocument:"closed")};precondition(owner.retired);let disk=broken.value;let writes=broken.writes;broken.mode=""
 denied{try owner.closePrepared(dispatchId:first,capturedSession:sid,preparedDocument:"prepared",closedDocument:"retry")};denied{try owner.invoke(ticket:old,dispatchId:first,capturedSession:sid,fingerprint:fp,invokingDocument:"late")};denied{try owner.complete(dispatchId:first,completedDocument:"invented")};precondition(broken.writes==writes && broken.value==disk)
}
let closure=try TestStoreV3Contract.preparedClosure(invocation,TestStoreV3Contract.now());_ = try TestStoreV3Contract.validatePreparedClosure(closure,invocation)
var fakeCompleted=invocation;fakeCompleted["state"]="completed";denied{_ = try TestStoreV3Contract.preparedClosure(fakeCompleted,TestStoreV3Contract.now())}
print("swift-v3-lifecycle-passed")
`);
    const sources = ["TestStoreV3Policy.swift", "TestStoreV3Contract.swift"].map(f => path.join(root, "modules/chillywood-test-store-admission/ios", f));
    for (const mode of ["debug", "release"]) {
      run("/usr/bin/swiftc", ["-module-cache-path", path.join(temporary, "module-cache"), ...(mode === "debug" ? ["-D", "DEBUG"] : []), ...sources, path.join(temporary, "main.swift"), "-o", path.join(temporary, mode)]);
      assert.match(run(path.join(temporary, mode), []), /swift-v3-lifecycle-passed/u);
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
