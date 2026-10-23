import assert from "node:assert/strict";
// Exercise production profile, username and mutation-capture functions with
// synthetic sessions and an in-memory transport. Never access hosted Auth.
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function load(file, mocks) {
  const context = {
    exports: {},
    console,
    require: (specifier) => {
      assert.ok(specifier in mocks, `unmocked dependency ${specifier}`);
      return mocks[specifier];
    },
  };
  const sourceFile = process.env.SIGNUP_PROFILE_AUDIT_BASELINE_DIR
    && (file === "_lib/signupProfileCompletion.ts" || file === "_lib/usernameHandles.ts")
    ? `${process.env.SIGNUP_PROFILE_AUDIT_BASELINE_DIR}/${file}` : file;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(sourceFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText, context, { filename: file });
  return context.exports;
}

async function harness() {
  const a = { id: "fixture-user-a", user_metadata: { username: "fixturealpha" } };
  const b = { id: "fixture-user-b", user_metadata: { username: "fixturebravo" } };
  let currentUser = a;
  let generation = "initial";
  const binding = () => ({ userId: currentUser.id, accountId: currentUser.id,
    sessionGeneration: `session-${currentUser.id}-${generation}`, state: "ACTIVE", restoreOnly: false });
  let releaseProfile;
  let enteredProfile;
  const profileEntered = new Promise((resolve) => { enteredProfile = resolve; });
  const profilePending = new Promise((resolve) => { releaseProfile = resolve; });
  const reads = [];
  const calls = [];
  let transportHook = () => {};
  const supabase = {
    auth: { getSession: async () => ({ data: { session: {
      user: currentUser, access_token: `synthetic-${currentUser.id}-${generation}`,
    } } }) },
    from: (table) => ({ select: () => ({ eq: (column, value) => ({
      maybeSingle: () => {
        reads.push({ table, column, value });
        enteredProfile();
        return profilePending;
      },
    }) }) }),
  };
  const supabaseModule = { supabase, SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "synthetic-public" };
  const mutation = load("_lib/accountBoundSupabaseMutation.ts", {
    "./accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: binding,
      parseAccountSessionAuthorityReadback: (value) => value,
      sameAccountSessionAuthority: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    },
    "./entitlementAuthority": { withAuthorityReadDeadline: async (pending) => pending },
    "./accountBoundSupabaseRpc.mjs": {
      isAccountBoundSupabaseRpcOutcomeAmbiguous: () => false,
      invokeAccountBoundSupabaseRpc: async (call) => {
        calls.push(call);
        const data = call.functionName === "wave1_session_authority_readback"
          ? binding() : { username: call.args.p_username };
        await transportHook(call);
        return { data, error: null };
      },
    },
    "./supabase": supabaseModule,
    "react-native": { Platform: { OS: "web" } },
  });
  const usernames = load("_lib/usernameHandles.ts", {
    "./supabase": supabaseModule,
    "./accountBoundSupabaseMutation": mutation,
  });
  const profile = load("_lib/signupProfileCompletion.ts", {
    "./supabase": supabaseModule,
    "./usernameHandles": usernames,
  });
  return { a, b, profile, usernames, reads, calls, profileEntered, releaseProfile,
    setTransportHook: (hook) => { transportHook = hook; },
    switchTo: (user, nextGeneration = generation) => { currentUser = user; generation = nextGeneration; } };
}

test("delayed signup-profile read for A cannot update current B's username", async () => {
  const h = await harness();
  const pending = h.profile.completePendingSignupProfile({ user: h.a });
  await h.profileEntered;
  h.switchTo(h.b);
  h.releaseProfile({ data: null, error: null });
  const result = await pending;
  assert.equal(h.reads[0].value, h.a.id);
  assert.equal(h.calls.length, 0);
  assert.equal(result.ok, false);
});

test("already-mismatched input and session users fail before profile reads", async () => {
  const h = await harness();
  h.switchTo(h.b);
  const result = await h.profile.completePendingSignupProfile({ user: h.a });
  assert.equal(result.ok, false);
  assert.match(result.message, /Sign in again/);
  assert.equal(h.reads.length, 0);
  assert.equal(h.calls.length, 0);
});

test("matching A completes username setup with A's captured session", async () => {
  const h = await harness();
  const pending = h.profile.completePendingSignupProfile({ user: h.a });
  await h.profileEntered;
  h.releaseProfile({ data: null, error: null });
  const result = await pending;
  const update = h.calls.find((call) => call.functionName === "update_my_username");
  assert.equal(update.accessToken, `synthetic-${h.a.id}-initial`);
  assert.equal(update.args.p_username, h.a.user_metadata.username);
  assert.equal(result.ok && result.completed, true);
});

test("existing username callers without expected user still bind to their current account", async () => {
  const h = await harness();
  h.switchTo(h.b);
  const result = await h.usernames.updateMyUsername("fixturebravonew");
  const update = h.calls.find((call) => call.functionName === "update_my_username");
  assert.equal(update.accessToken, `synthetic-${h.b.id}-initial`);
  assert.equal(result.username, "fixturebravonew");
});

test("same-user session replaced before mutation capture binds to the replacement, not original session", async () => {
  // The new fence is expected-user, not initiating-session. The existing helper
  // captures the current generation when the username mutation actually starts.
  const h = await harness();
  const pending = h.profile.completePendingSignupProfile({ user: h.a });
  await h.profileEntered;
  h.switchTo(h.a, "replacement");
  h.releaseProfile({ data: null, error: null });
  const result = await pending;
  const update = h.calls.find((call) => call.functionName === "update_my_username");
  assert.equal(update.accessToken, `synthetic-${h.a.id}-replacement`);
  assert.equal(result.ok && result.completed, true);
});

test("existing mutation helper rejects same-user generation replacement after capture", async () => {
  const h = await harness();
  h.setTransportHook((call) => {
    if (call.functionName === "wave1_session_authority_readback") h.switchTo(h.a, "replacement");
  });
  const pending = h.profile.completePendingSignupProfile({ user: h.a });
  await h.profileEntered;
  h.releaseProfile({ data: null, error: null });
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(h.calls.filter((call) => call.functionName === "update_my_username").length, 0);
});
