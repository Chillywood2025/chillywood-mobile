import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { setImmediate as flush } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";

// Execute production registration, storage, ownership checks and deadline.
// Only mobile SDK, account-authority and backend receipts are controlled here.
function declarations(file, names) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return names.map((name) => {
    const node = ast.statements.find((candidate) => candidate.name?.text === name || (
      ts.isVariableStatement(candidate)
      && candidate.declarationList.declarations.some((entry) => entry.name.text === name)
    ));
    assert.ok(node, `execute actual ${name}`);
    return node.getText(ast);
  }).join("\n");
}
const compiled = ts.transpileModule([
  declarations("../_lib/notifications.ts", [
    "normalizeText", "NOTIFICATION_INSTALL_ID_STORAGE_KEY", "NOTIFICATION_REVOCATION_CREDENTIAL_STORAGE_KEY",
    "buildClientId", "randomHex", "getNotificationInstallId", "getNotificationRevocationCredential",
    "readCurrentPushSessionBinding", "samePushSessionBinding", "registerPushTokenWithBackend",
    "registerAndroidNativeFcmToken", "mergeAndroidPushRegistrationResults",
    "PUSH_REGISTRATION_PROVIDER_DEADLINE_MS", "buildPushRegistrationProviderError",
    "registerCurrentPushProvidersWithDeadline", "requestPushPermissionAndRegister", "refreshPushRegistrationIfGranted",
  ]),
  declarations("../_lib/entitlementAuthority.ts", ["AUTHORITY_READ_TIMEOUT_MS", "withAuthorityReadDeadline"]),
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const binding = (suffix = "a") => ({ userId: `user-${suffix}`, accountId: `user-${suffix}`, sessionGeneration: `session-${suffix}`, restoreOnly: false });

function load(options = {}) {
  const storage = new Map();
  const writes = [];
  const registrations = [];
  const revocations = [];
  const reads = { expo: 0, fcm: 0 };
  const timers = new Map();
  let clock = 0;
  let nextTimer = 0;
  let current = options.authority === undefined ? binding() : options.authority;
  const context = vm.createContext({
    exports: {}, crypto: webcrypto, Uint8Array,
    Platform: { OS: options.platform ?? "android" }, Device: { isDevice: true },
    Application: { nativeApplicationVersion: "1.0.0", nativeBuildVersion: "test-build" },
    IOS_ORDINARY_PUSH_ENABLED: true,
    configureNotificationRuntime: async () => {}, readExpoProjectId: () => "test-project",
    resolvePushPermissionState: () => "granted", pushPermissionAllowsRegistration: () => true,
    readCurrentAccountSessionAuthority: async () => current,
    revokePushOwnershipForSession: async (old) => { revocations.push({ ...old }); },
    AsyncStorage: {
      getItem: async (key) => storage.get(key) ?? null,
      setItem: async (key, value) => { writes.push({ key, value }); storage.set(key, value); },
    },
    Notifications: {
      getPermissionsAsync: async () => ({ granted: true }),
      getExpoPushTokenAsync: async () => { reads.expo += 1; return options.expo ? options.expo() : { data: "expo-test-token" }; },
      getDevicePushTokenAsync: async () => { reads.fcm += 1; return options.fcm ? options.fcm() : { data: "fcm-test-token" }; },
    },
    supabase: { functions: { invoke: async (name, { body }) => {
      assert.equal(name, "notification-device-tokens");
      registrations.push({ ...body });
      if (options.backend) await options.backend(body);
      const data = { requestAccepted: true, status: "registered", userId: body.userId,
        accountId: body.accountId, sessionGeneration: body.sessionGeneration,
        installId: body.installId, platform: body.platform, provider: body.provider,
        operationKey: body.operationKey, tokenFingerprint: body.provider === "expo" ? "111111111111" : "222222222222" };
      if (options.receipt) options.receipt(data);
      return { data, error: null };
    } } },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  new vm.Script(compiled).runInContext(context);
  return {
    reads, registrations, revocations, storage, writes, timers,
    changeAuthority(value) { current = value; },
    start(method = "refreshPushRegistrationIfGranted") {
      const observed = { settled: false, result: null };
      observed.promise = context.exports[method]().then((result) => { observed.settled = true; observed.result = result; return result; });
      return observed;
    },
    async advance(milliseconds) {
      clock += milliseconds;
      for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.callback(); }
      await flush();
    },
  };
}

for (const [label, options] of [
  ["Expo acquisition rejects", { expo: async () => { throw new Error("private provider failure"); } }],
  ["Expo token is empty", { expo: async () => ({ data: "" }) }],
  ["Expo backend rejects", { backend: async ({ provider }) => { if (provider === "expo") throw new Error("private backend failure"); } }],
]) {
  for (const method of ["requestPushPermissionAndRegister", "refreshPushRegistrationIfGranted"]) {
    test(`${method}: ${label} still registers Android FCM`, async () => {
      const h = load(options); const observed = h.start(method); await flush();
      assert.equal(h.reads.fcm, 1);
      assert.equal(observed.settled, true);
      assert.equal(observed.result.status, "registered");
      assert.equal(observed.result.provider, "fcm");
      assert.equal(observed.result.tokenFingerprint, null);
      assert.equal(observed.result.nativeTokenFingerprint, "222222222222");
      assert.equal(JSON.stringify(observed.result).includes("private"), false);
    });
  }
}

test("held Expo acquisition does not delay a proved native registration", async () => {
  const hold = deferred(); const h = load({ expo: () => hold.promise });
  const observed = h.start(); await flush();
  assert.equal(h.reads.fcm, 1); assert.equal(observed.settled, true);
  assert.equal(observed.result.provider, "fcm"); assert.equal(observed.result.tokenFingerprint, null);
  h.changeAuthority(binding("b")); hold.resolve({ data: "late-expo-token" }); await flush();
  assert.deepEqual(h.registrations.map((row) => row.provider), ["fcm"], "late old-owner token never registers to a replacement account");
});

test("held native acquisition does not delay a proved Expo registration; late failure is handled", async () => {
  const hold = deferred(); const h = load({ fcm: () => hold.promise });
  const observed = h.start(); await flush();
  assert.equal(observed.settled, true); assert.equal(observed.result.provider, "expo");
  assert.equal(observed.result.nativeTokenFingerprint, null);
  hold.reject(new Error("late native failure")); await flush();
  assert.equal(observed.result.provider, "expo");
});

test("fresh Android fan-out shares one stored install ID and revocation credential", async () => {
  const h = load(); const observed = h.start(); await flush();
  assert.equal(observed.result.status, "registered"); assert.equal(h.registrations.length, 2);
  assert.equal(new Set(h.registrations.map((row) => row.installId)).size, 1);
  assert.equal(new Set(h.registrations.map((row) => row.revocationCredential)).size, 1);
  assert.equal(h.writes.length, 2, "initialize each storage identity once before concurrent backend reads");
  assert.equal(new Set(h.registrations.map((row) => row.operationKey)).size, 2);
  assert.equal(h.registrations.every((row) => row.accountId === "user-a" && row.sessionGeneration === "session-a"), true);
});

test("both rejected providers settle honestly without a success or unhandled rejection", async () => {
  const h = load({ expo: async () => { throw new Error("expo"); }, fcm: async () => { throw new Error("native"); } });
  const observed = h.start(); await flush();
  assert.equal(h.reads.fcm, 1); assert.equal(observed.settled, true);
  assert.equal(observed.result.status, "error"); assert.equal(h.registrations.length, 0);
});

test("both held providers release at the unchanged 15 second deadline and reject stale late tokens", async () => {
  const expo = deferred(); const fcm = deferred(); const h = load({ expo: () => expo.promise, fcm: () => fcm.promise });
  const observed = h.start(); await flush(); assert.equal(h.reads.fcm, 1);
  await h.advance(14_999); assert.equal(observed.settled, false);
  await h.advance(1); assert.equal(observed.result.status, "error");
  h.changeAuthority(binding("b")); expo.resolve({ data: "late-expo" }); fcm.resolve({ data: "late-native" }); await flush();
  assert.equal(h.registrations.length, 0); assert.equal(observed.result.status, "error");
});

test("account replacement while both backend writes are pending rejects success and cleans up old ownership", async () => {
  const hold = deferred(); const h = load({ backend: () => hold.promise });
  const observed = h.start(); await flush(); assert.equal(h.registrations.length, 2);
  h.changeAuthority(binding("b")); hold.resolve(); await flush();
  assert.equal(observed.result.status, "error"); assert.equal(h.revocations.length, 2);
  assert.equal(h.revocations.every((row) => row.userId === "user-a" && row.sessionGeneration === "session-a" && row.reason === "account_switch"), true);
});

test("late native backend completion retains cleanup after Expo already proved registration", async () => {
  const hold = deferred(); const h = load({ backend: ({ provider }) => provider === "fcm" ? hold.promise : undefined });
  const observed = h.start(); await flush(); assert.equal(observed.result.provider, "expo");
  h.changeAuthority(binding("b")); hold.resolve(); await flush();
  assert.equal(h.revocations.length, 1); assert.equal(h.revocations[0].accountId, "user-a");
  assert.equal(observed.result.nativeTokenFingerprint, null);
});

test("held Expo backend cannot hold native success and retains late old-owner cleanup", async () => {
  const hold = deferred(); const h = load({ backend: ({ provider }) => provider === "expo" ? hold.promise : undefined });
  const observed = h.start(); await flush();
  assert.equal(observed.settled, true); assert.equal(observed.result.provider, "fcm");
  assert.equal(observed.result.tokenFingerprint, null);
  h.changeAuthority(binding("b")); hold.resolve(); await flush();
  assert.equal(h.revocations.length, 1); assert.equal(h.revocations[0].accountId, "user-a");
  assert.equal(observed.result.provider, "fcm"); assert.equal(observed.result.tokenFingerprint, null);
});

for (const authority of [null, { ...binding(), restoreOnly: true }]) {
  test(`no provider work without exact active authority (${authority ? "restore-only" : "signed-out"})`, async () => {
    const h = load({ authority }); const observed = h.start(); await flush();
    assert.equal(observed.result.status, "error"); assert.deepEqual(h.reads, { expo: 0, fcm: 0 });
    assert.equal(h.registrations.length, 0); assert.equal(h.writes.length, 0);
  });
}

test("wrong backend identity cannot qualify either provider", async () => {
  const h = load({ receipt: (receipt) => { receipt.sessionGeneration = "wrong"; } });
  const observed = h.start(); await flush();
  assert.equal(observed.result.status, "error"); assert.equal(h.registrations.length, 2);
});

test("iOS retains Expo-only success and rejection semantics", async () => {
  for (const expo of [undefined, async () => { throw new Error("controlled"); }]) {
    const h = load({ platform: "ios", expo }); const observed = h.start(); await flush();
    assert.equal(h.reads.fcm, 0); assert.equal(observed.result.provider, "expo");
    assert.equal(observed.result.status, expo ? "error" : "registered");
  }
});

test("iOS held Expo still releases at the existing deadline without native work", async () => {
  const hold = deferred(); const h = load({ platform: "ios", expo: () => hold.promise });
  const observed = h.start(); await flush(); await h.advance(15_000);
  assert.equal(observed.result.status, "error"); assert.equal(h.reads.fcm, 0);
  h.changeAuthority(null); hold.resolve({ data: "late" }); await flush(); assert.equal(h.registrations.length, 0);
});
