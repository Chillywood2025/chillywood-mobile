import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.env.PARTY_CREATE_SOURCE_ROOT || process.cwd();
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const owner = (generation = "session-a", userId = USER_A) => ({
  userId, accountId: userId, sessionGeneration: generation, state: "ACTIVE", restoreOnly: false,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

// Load whole production modules, including the exact session/token capture and
// frozen RPC transport. Real Supabase query builders + auth-fetch dispatch run
// against a modeled HTTP boundary; no source declaration is reimplemented.
function harness({ mutate = (source) => source } = {}) {
  const state = {
    authority: owner(), token: "token-a", authUser: USER_A, hooks: new Map(),
    responses: [], title: "title-a", allowed: true, reads: [], writes: [], rpc: [],
    tokenOwners: new Map([["token-a", owner()]]),
  };
  const checkpoint = async (stage) => {
    state.reads.push(stage);
    const hook = state.hooks.get(stage);
    if (hook) { state.hooks.delete(stage); await hook(); }
  };
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    if (url.pathname.endsWith("/rpc/wave1_session_authority_readback")) {
      const token = headers.get("Authorization")?.replace(/^Bearer /, "");
      const authority = state.tokenOwners.get(token);
      state.rpc.push({ token, authority });
      await checkpoint("readback");
      return json(authority ? { ...authority, authoritative: true } : null);
    }
    if (url.pathname.endsWith("/titles") && init.method === "GET") {
      await checkpoint("title");
      return json({ id: state.title, is_published: true, status: "published" });
    }
    assert.ok(url.pathname.endsWith("/watch_party_rooms"));
    assert.equal(init.method, "POST");
    const payload = JSON.parse(init.body);
    state.writes.push({ payload, authorization: headers.get("Authorization") });
    await checkpoint("insert");
    const response = state.responses.shift();
    if (typeof response === "function") return response(payload);
    return response ?? json({ is_active: true, ...payload }, 201);
  };
  const client = createClient("https://party-adapter.invalid", "fixture-anon-key", {
    accessToken: async () => { await checkpoint("transport-token"); return state.token; },
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const supabase = {
    from: client.from.bind(client), rpc: client.rpc.bind(client),
    auth: {
      async getSession() {
        await checkpoint("session");
        return { data: { session: { access_token: state.token, user: { id: state.authUser } } }, error: null };
      },
      async getUser() { return { data: { user: { id: state.authUser } }, error: null }; },
    },
  };
  const modules = new Map();
  const mocks = {
    "@supabase/supabase-js": { createClient: (_url, _key, options) => createClient(_url, _key, { ...options, global: { ...options.global, fetch } }) },
    "@react-native-async-storage/async-storage": {},
    "react-native": { Platform: { OS: "android" } },
    "./supabase": { supabase, SUPABASE_URL: "https://party-adapter.invalid", SUPABASE_ANON_KEY: "fixture-anon-key" },
    "./logger": { debugLog() {}, reportRuntimeError() {} },
    "./appConfig": {
      async readAppConfig() { await checkpoint("config"); return {}; },
      resolveRoomDefaultConfig: () => ({ watchParty: {
        joinPolicy: "open", reactionsPolicy: "enabled", contentAccessRule: "open", capturePolicy: "best_effort",
      } }),
    },
    "./userData": { async readUserProfile() { await checkpoint("profile"); return {}; } },
    "./monetization": {
      async readCreatorPermissions(userId) { assert.equal(userId, USER_A); await checkpoint("permissions"); return {}; },
      sanitizeCreatorRoomAccessRule: (rule) => rule,
    },
    "./premiumWatchPartyAccess": {
      async requireLiveFirstPremium() { await checkpoint("premium"); return { allowed: state.allowed, reason: "premium_required" }; },
      async requireWatchPartyLivePremium() { await checkpoint("premium"); return { allowed: state.allowed, reason: "premium_required" }; },
      isRuntimeControlBlockedAccess: () => false,
      LIVE_FIRST_PREMIUM_UPSELL_COPY: { message: "Premium required" },
      WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY: { message: "Premium required" },
    },
    "./performancePolicy": {}, "./paidWatchPartyTickets": {}, "./socialAttachments": {},
  };
  const actual = new Map([
    ["./watchParty", "_lib/watchParty.ts"], ["./watchPartyHostSettings", "_lib/watchPartyHostSettings.ts"],
    ["./accountSessionAuthority", "_lib/accountSessionAuthority.ts"],
    ["./accountBoundSupabaseMutation", "_lib/accountBoundSupabaseMutation.ts"],
    ["./accountBoundSupabaseRpc.mjs", "_lib/accountBoundSupabaseRpc.mjs"],
    ["./entitlementAuthority", "_lib/entitlementAuthority.ts"],
    ["./actionSingleFlight.mjs", "_lib/actionSingleFlight.mjs"],
    ["./roomRules", "_lib/roomRules.ts"], ["./publicTitles", "_lib/publicTitles.ts"],
    ["./watch-party/watch-party-live-source-truth", "_lib/watch-party/watch-party-live-source-truth.ts"],
  ]);
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const source = fs.readFileSync(file === "_lib/watchParty.ts" && process.env.PARTY_CREATE_SOURCE
      ? process.env.PARTY_CREATE_SOURCE : path.join(ROOT, file), "utf8");
    vm.runInNewContext(ts.transpileModule(file === "_lib/watchParty.ts" ? mutate(source) : source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText, {
      exports, fetch, URL, Headers, Date, Promise, setTimeout, clearTimeout,
      require(id) {
        if (Object.hasOwn(mocks, id)) return mocks[id];
        assert.ok(actual.has(id), `Unmodeled dependency ${file}: ${id}`);
        return load(actual.get(id));
      },
    }, { filename: file });
    return exports;
  }
  const authority = load("_lib/accountSessionAuthority.ts");
  authority.publishAccountSessionAuthoritySnapshot(state.authority);
  const api = load("_lib/watchParty.ts");
  state.reads.length = 0; // Ignore the SDK's initial realtime token lookup.
  return {
    state, api,
    create: (options) => api.createPartyRoom("title-a", USER_A, 1234, "playing", options),
    replace(next, token = next ? `token-${next.userId}-${next.sessionGeneration}` : "signed-out") {
      state.authority = next; state.authUser = next?.userId ?? ""; state.token = token;
      if (next) state.tokenOwners.set(token, next);
      authority.publishAccountSessionAuthoritySnapshot(next);
    },
    hold(stage) {
      const entered = deferred(), release = deferred();
      state.hooks.set(stage, async () => { entered.resolve(); await release.promise; });
      return { entered: entered.promise, release: release.resolve };
    },
  };
}

test("creation validates the supplied initiating host and active authority before IO", async () => {
  for (const authority of [null, { ...owner(), restoreOnly: true }, owner("session-b", USER_B)]) {
    const h = harness(); h.replace(authority);
    const result = await h.create();
    assert.equal(result.error?.code, "account_changed");
    assert.equal(result.error?.payload?.mutationDispatched, false);
    assert.equal(h.state.reads.length, 0);
    assert.equal(h.state.writes.length, 0);
  }
  const h = harness();
  for (const host of ["", USER_B]) {
    assert.equal((await h.api.createPartyRoom("title-a", host, 0, "paused")).error?.code, "account_changed");
  }
  assert.equal(h.state.reads.length, 0);
});

test("the call-site snapshot survives the single-flight microtask", async () => {
  const h = harness(), pending = h.create();
  h.replace(owner("session-b"));
  assert.equal((await pending).error?.code, "account_changed");
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.state.reads.length, 0);
});

for (const stage of ["session", "readback", "title", "config", "profile", "permissions", "premium"]) {
  for (const replacement of ["account", "session", "logout", "restore"]) {
    test(`no creation after ${replacement} changes while awaiting ${stage}`, async () => {
      const h = harness(), gate = h.hold(stage), pending = h.create();
      await gate.entered;
      h.replace(replacement === "account" ? owner("session-b", USER_B)
        : replacement === "logout" ? null
          : replacement === "restore" ? { ...owner(), restoreOnly: true } : owner("session-b"));
      gate.release();
      const result = await pending;
      assert.equal(result.error?.code, "account_changed");
      assert.equal(result.error?.payload?.mutationDispatched, false);
      assert.equal(h.state.writes.length, 0);
    });
  }
}

test("unpublished token replacement fails exact server readback before preparation", async () => {
  const h = harness(), gate = h.hold("session"), pending = h.create();
  await gate.entered;
  h.state.token = "same-user-other-session";
  h.state.tokenOwners.set(h.state.token, owner("session-b"));
  gate.release();
  assert.equal((await pending).error?.code, "account_changed");
  assert.equal(h.state.writes.length, 0);
  assert.ok(!h.state.reads.includes("title"));
});

test("transient pre-insert capture failure is explicitly safe to retry", async () => {
  const h = harness();
  h.state.hooks.set("readback", async () => { throw new Error("readback temporarily unavailable"); });
  const failure = await h.create();
  assert.ok(failure.error);
  assert.equal(failure.error.payload.mutationDispatched, false);
  assert.equal(failure.error.payload.mutationRejected, false);
  assert.equal(h.state.writes.length, 0);
  assert.equal((await h.create()).hostUserId, USER_A);
  assert.equal(h.state.writes.length, 1);
});

test("same-session token refresh never replaces the frozen initiating transport token", async () => {
  const h = harness(), gate = h.hold("premium"), pending = h.create();
  await gate.entered;
  h.state.token = "refreshed-token"; h.state.tokenOwners.set(h.state.token, owner());
  gate.release();
  const room = await pending;
  assert.equal(room.hostUserId, USER_A);
  assert.equal(h.state.writes.length, 1);
  assert.equal(h.state.writes[0].authorization, "Bearer token-a");
});

test("SDK dispatch-time account replacement cannot rebind a submitted creation", async () => {
  const h = harness(), premium = h.hold("premium"), pending = h.create();
  await premium.entered;
  const transport = h.hold("transport-token"); premium.release();
  await transport.entered;
  h.replace(owner("session-b", USER_B)); transport.release();
  assert.equal((await pending).error?.code, "account_changed");
  assert.equal(h.state.writes.length, 1);
  assert.equal(h.state.writes[0].payload.host_user_id, USER_A);
  assert.equal(h.state.writes[0].authorization, "Bearer token-a");
});

test("delayed creation acknowledgement is never returned to a replacement session", async () => {
  const h = harness(), gate = h.hold("insert"), pending = h.create();
  await gate.entered; h.replace(owner("session-b")); gate.release();
  const result = await pending;
  assert.equal(result.error?.code, "account_changed");
  assert.equal(result.error?.payload?.mutationDispatched, true);
  assert.equal(result.error?.payload?.mutationRejected, false);
  assert.equal(h.state.writes.length, 1);
});

test("duplicates share one creation but a new session does not inherit the old promise", async () => {
  const h = harness(), gate = h.hold("insert"), first = h.create(), duplicate = h.create();
  assert.equal(first, duplicate);
  await gate.entered;
  h.replace(owner("session-b"));
  const second = h.create();
  assert.equal(second === first, false, "A replacement session must receive a new creation promise");
  assert.equal((await second).hostUserId, USER_A);
  gate.release();
  assert.equal((await first).error?.code, "account_changed");
  assert.equal(h.state.writes.length, 2);
  assert.notEqual(h.state.writes[0].authorization, h.state.writes[1].authorization);
});

test("creation options are frozen at invocation and denied Premium still blocks inserts", async () => {
  const h = harness(), gate = h.hold("premium");
  const options = { sourceType: "creator_video", sourceId: "video-a", joinPolicy: "locked" };
  const pending = h.create(options);
  await gate.entered; options.sourceId = "video-b"; options.joinPolicy = "open"; gate.release();
  const room = await pending;
  assert.equal(room.sourceId, "video-a"); assert.equal(room.joinPolicy, "locked");
  const denied = harness(); denied.state.allowed = false;
  assert.equal((await denied.create()).error?.code, "premium_required");
  assert.equal(denied.state.writes.length, 0);
});

test("explicit schema rejection permits one token-bound legacy insert", async () => {
  const h = harness();
  h.state.responses.push(json({ code: "PGRST204", message: "Could not find source_type column" }, 400));
  assert.equal((await h.create()).hostUserId, USER_A);
  assert.equal(h.state.writes.length, 2);
  assert.equal(h.state.writes[0].payload.party_id, h.state.writes[1].payload.party_id);
  assert.ok(h.state.writes.every((write) => write.authorization === "Bearer token-a"));
  assert.equal(Object.hasOwn(h.state.writes[1].payload, "source_type"), false);
});

test("legacy dispatch retains the first token even if auth rotates during SDK dispatch", async () => {
  const h = harness(), firstInsert = h.hold("insert");
  h.state.responses.push(json({ code: "PGRST204", message: "source_type column missing" }, 400));
  const pending = h.create(); await firstInsert.entered;
  const fallbackTransport = h.hold("transport-token"); firstInsert.release();
  await fallbackTransport.entered;
  h.state.token = "refreshed-token"; fallbackTransport.release();
  assert.equal((await pending).hostUserId, USER_A);
  assert.equal(h.state.writes.length, 2);
  assert.ok(h.state.writes.every((write) => write.authorization === "Bearer token-a"));
});

test("source-linked rooms never downgrade to the legacy source-less schema", async () => {
  const h = harness();
  h.state.responses.push(json({ code: "42703", message: "source_type column does not exist" }, 400));
  assert.equal((await h.create({ sourceType: "creator_video", sourceId: "video-a" })).error?.code, "42703");
  assert.equal(h.state.writes.length, 1);
});

test("only explicit conflict rejection permits another room code, with bounded attempts", async () => {
  const h = harness();
  h.state.responses.push(json({ code: "23505", message: "duplicate party id" }, 409));
  assert.equal((await h.create()).hostUserId, USER_A);
  assert.equal(h.state.writes.length, 2);
  assert.notEqual(h.state.writes[0].payload.party_id, h.state.writes[1].payload.party_id);
  const exhausted = harness();
  exhausted.state.responses.push(...Array.from({ length: 6 }, () => json({ code: "23505", message: "duplicate" }, 409)));
  assert.equal((await exhausted.create()).error?.code, "23505");
  assert.equal(exhausted.state.writes.length, 5);
});

test("explicit RLS rejection permits a fresh manual retry without automatic 403 replay", async () => {
  const h = harness();
  h.state.responses.push(json({ code: "42501", message: "new row violates row-level security policy" }, 403));
  const rejected = await h.create();
  assert.equal(rejected.error?.code, "42501");
  assert.equal(rejected.error?.payload?.mutationDispatched, true);
  assert.equal(rejected.error?.payload?.mutationRejected, true);
  assert.equal(h.state.writes.length, 1, "RLS denial is never retried automatically");
  assert.equal((await h.create()).hostUserId, USER_A);
  assert.equal(h.state.writes.length, 2);
});

test("rejection proof resets before each later insert with an ambiguous result", async () => {
  for (const first of [
    { code: "PGRST204", message: "source_type column missing" },
    { code: "23505", message: "duplicate room code" },
  ]) {
    const h = harness();
    h.state.responses.push(json(first, 400), json({ code: "23505", message: "upstream response uncertain" }, 502));
    const uncertain = await h.create();
    assert.equal(uncertain.error?.code, "room_creation_outcome_unknown");
    assert.equal(uncertain.error?.payload?.mutationDispatched, true);
    assert.equal(uncertain.error?.payload?.mutationRejected, false);
    assert.equal(h.state.writes.length, 2);
  }
});

test("malformed 4xx bodies cannot establish rejection proof", async () => {
  for (const response of [
    {}, { code: 42501, message: "denied" },
    { code: "42501", message: {} }, { code: "42501", message: "  " },
  ]) {
    const h = harness(); h.state.responses.push(json(response, 403));
    const uncertain = await h.create();
    assert.equal(uncertain.error?.code, "room_creation_outcome_unknown");
    assert.equal(uncertain.error?.payload?.mutationDispatched, true);
    assert.equal(uncertain.error?.payload?.mutationRejected, false);
    assert.equal(h.state.writes.length, 1);
  }
});

test("representation and unknown structured 4xx errors cannot establish rejection proof", async () => {
  for (const code of ["PGRST116", "PGRST999", "ZZ999", "23599"]) {
    const h = harness();
    h.state.responses.push(json({ code, message: "Room representation could not be returned" }, 406));
    const uncertain = await h.create();
    assert.equal(uncertain.error?.code, "room_creation_outcome_unknown");
    assert.equal(uncertain.error?.payload?.mutationDispatched, true);
    assert.equal(uncertain.error?.payload?.mutationRejected, false);
    assert.equal(h.state.writes.length, 1);
  }
});

for (const error of [
  { code: "23505", message: "duplicate" },
  { code: "42703", message: "source_type column missing" },
  { message: "source_type column missing" },
]) {
  for (const status of [408, 499, 502, 504]) {
    test(`uncertain ${status}/${error.code ?? "no-code"} response cannot trigger any retry`, async () => {
      const h = harness();
      h.state.title = "alternate-title"; // More than one candidate exposes unsafe outer-loop retries.
      h.state.responses.push(json(error, status));
      const result = await h.create();
      assert.equal(result.error?.code, "room_creation_outcome_unknown");
      assert.equal(result.error?.payload?.mutationDispatched, true);
      assert.equal(result.error?.payload?.mutationRejected, false);
      assert.equal(h.state.writes.length, 1);
    });
  }
}

test("malformed, wrong-subject and empty success acknowledgements are uncertain, never retried", async () => {
  for (const response of [
    () => json({}), () => json(null), () => new Response("invalid-json", { status: 201 }),
    (payload) => json({ ...payload, host_user_id: USER_B }),
    (payload) => json({ ...payload, party_id: "OTHER" }),
    (payload) => json({ ...payload, source_id: "other-title" }),
    (payload) => json({ ...payload, is_active: false }),
    (payload) => json({ ...payload, is_active: null }),
    (payload) => json({ ...payload, is_active: undefined }),
    () => { throw new Error("network dropped after commit"); },
  ]) {
    const h = harness(); h.state.title = "alternate-title"; h.state.responses.push(response);
    assert.equal((await h.create()).error?.code, "room_creation_outcome_unknown");
    assert.equal(h.state.writes.length, 1);
  }
});

test("legacy acknowledgement uncertainty cannot escape into another title-candidate insert", async () => {
  const h = harness(); h.state.title = "alternate-title";
  h.state.responses.push(json({ code: "PGRST204", message: "source_type column missing" }, 400), json({}, 201));
  assert.equal((await h.create()).error?.code, "room_creation_outcome_unknown");
  assert.equal(h.state.writes.length, 2);
});

test("inactive or missing-activity legacy acknowledgements never permit navigation or retry", async () => {
  for (const active of [false, null, undefined]) {
    const h = harness(); h.state.title = "alternate-title";
    h.state.responses.push(json({ code: "PGRST204", message: "source_type column missing" }, 400),
      (payload) => json({ ...payload, is_active: active }));
    const result = await h.create();
    assert.equal(result.error?.code, "room_creation_outcome_unknown");
    assert.equal(result.error?.payload?.mutationDispatched, true);
    assert.equal(h.state.writes.length, 2);
  }
});

test("account change after a rejected insert prevents schema or conflict retries", async () => {
  for (const rejection of [
    { code: "23505", message: "duplicate" }, { code: "PGRST204", message: "source_type column missing" },
  ]) {
    const h = harness(), gate = h.hold("insert");
    h.state.responses.push(json(rejection, 400));
    const pending = h.create(); await gate.entered; h.replace(owner("session-b")); gate.release();
    assert.equal((await pending).error?.code, "account_changed");
    assert.equal(h.state.writes.length, 1);
  }
});

test("schema-like text without an explicit schema rejection is not retried", async () => {
  for (const error of [
    { message: "source_type column missing" },
    { code: "42501", message: "source_type column access denied" },
  ]) {
    const h = harness(); h.state.responses.push(json(error, 400));
    assert.ok((await h.create()).error);
    assert.equal(h.state.writes.length, 1);
  }
});

test("removed await-bound authority checks are killed by session replacement", async () => {
  const h = harness({ mutate: (source) => source
    .replaceAll("assertInitiatingAuthority();", "")
    .replaceAll("assertAccountBoundSupabaseMutationSubjectCurrent(subject);", "") });
  const gate = h.hold("premium"), pending = h.create(); await gate.entered;
  h.replace(owner("session-b")); gate.release();
  const result = await pending;
  assert.throws(() => assert.equal(result.error?.code, "account_changed"), /AssertionError/);
  assert.equal(h.state.writes.length, 1);
});

test("removed session-key binding is killed by the public concurrent-call contract", async () => {
  const h = harness({ mutate: (source) => source.replace("  authority.sessionGeneration,", "") });
  const gate = h.hold("insert"), first = h.create(); await gate.entered;
  h.replace(owner("session-b")); const second = h.create(); gate.release(); await Promise.all([first, second]);
  assert.throws(() => assert.notEqual(second, first), /AssertionError/);
});

test("transport-binding mutation is killed by dispatch-time token assertion", async () => {
  const h = harness({ mutate: (source) => source.replaceAll('.setHeader("Authorization", `Bearer ${subject.accessToken}`)', "") });
  const gate = h.hold("premium"), pending = h.create(); await gate.entered;
  h.state.token = "replacement-token"; gate.release(); await pending;
  assert.throws(() => assert.equal(h.state.writes[0].authorization, "Bearer token-a"), /AssertionError/);
});

test("removed initiating-host validation is killed before any IO", async () => {
  const h = harness({ mutate: (source) => source.replace("|| !requestedHostUserId || requestedHostUserId !== initiatingAuthority.userId", "") });
  const result = await h.api.createPartyRoom("title-a", USER_B, 0, "paused");
  // The separate capture boundary remains fail-closed even after this mutation;
  // blank-host coercion would otherwise silently adopt the current account.
  assert.equal(result.error?.code, "account_changed");
  const blank = await h.api.createPartyRoom("title-a", "", 0, "paused");
  assert.throws(() => assert.equal(blank.error?.code, "account_changed"), /AssertionError/);
});
