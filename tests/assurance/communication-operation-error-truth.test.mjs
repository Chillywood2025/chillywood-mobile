#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");
const source = fs.readFileSync("_lib/communication.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "_lib/communication.ts",
}).outputText;

const roomRow = {
  capture_policy: "no_recording",
  content_access_rule: "participants_only",
  created_at: "2026-08-30T00:00:00.000Z",
  host_user_id: "11111111-1111-4111-8111-111111111111",
  last_activity_at: "2026-08-30T00:00:00.000Z",
  linked_party_id: null,
  linked_room_code: null,
  linked_room_mode: null,
  room_code: "ROOM-ERROR",
  room_id: "ROOM-ERROR",
  status: "active",
  updated_at: "2026-08-30T00:00:00.000Z",
};

function loadCommunication(clientOverride) {
  const runtime = {
    accountBoundError: null,
    accountBoundRpcCalls: [],
    queryResponses: new Map(),
    rpcResponse: { data: null, error: null },
  };
  class QueryBuilder {
    constructor(table) { this.table = table; }
    delete() { return this; }
    eq() { return this; }
    insert() { return this; }
    limit() { return this; }
    maybeSingle() { return Promise.resolve(runtime.queryResponses.get(this.table) ?? { data: null, error: null }); }
    order() { return this; }
    returns() { return this; }
    select() { return this; }
    single() { return Promise.resolve(runtime.queryResponses.get(this.table) ?? { data: null, error: null }); }
    then(resolve, reject) {
      return Promise.resolve(runtime.queryResponses.get(this.table) ?? { data: null, error: null }).then(resolve, reject);
    }
    update() { return this; }
  }
  const supabase = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from(table) { return new QueryBuilder(table); },
    rpc() {
      assert.equal(this, supabase, "RPC retains its SDK receiver binding");
      return Promise.resolve(runtime.rpcResponse);
    },
  };
  const moduleMocks = {
    "./accountBoundSupabaseMutation": {
      runExactSessionAccountBoundSupabaseMutationRpc: async (functionName, args, expectedUserId) => {
        runtime.accountBoundRpcCalls.push({ args, expectedUserId, functionName });
        if (runtime.accountBoundError) throw runtime.accountBoundError;
        return runtime.rpcResponse;
      },
    },
    "./appConfig": { readAppConfig: async () => null, resolveRoomDefaultConfig: () => ({ communication: {} }) },
    "./monetization": { readCreatorPermissions: async () => null, sanitizeCreatorRoomAccessRule: (value) => value },
    "./performancePolicy": { ROOM_ACTIVITY_ACTIVE_WINDOW_MS: 60_000, ROOM_HEARTBEAT_MS: 15_000 },
    "./roomRules": {
      ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS: 60_000,
      buildRoomCapabilities: (value) => value,
      evaluateRoomAccess: async () => ({ isAllowed: true }),
      normalizeCapturePolicy: (value) => value ?? "no_recording",
      normalizeContentAccessRule: (value) => value ?? "participants_only",
      normalizeRoomMembershipState: (value) => value ?? "active",
    },
    "./supabase": { supabase: clientOverride ?? supabase },
    "./userData": { buildUserChannelProfile: () => ({ displayName: "User" }), readUserProfile: async () => null },
    "./watchParty": {
      createPartyIdentifier: () => "ROOM-ERROR",
      getWritablePartyUserId: async () => "11111111-1111-4111-8111-111111111111",
    },
    "expo-constants": { __esModule: true, default: { expoConfig: { extra: {} } } },
    "react-native": { Platform: { OS: "ios" } },
  };
  const commonJsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    console,
    exports: commonJsModule.exports,
    module: commonJsModule,
    process: { env: {} },
    require: (specifier) => {
      if (Object.hasOwn(moduleMocks, specifier)) return moduleMocks[specifier];
      throw new Error(`UNEXPECTED_COMMUNICATION_IMPORT:${specifier}`);
    },
    setTimeout,
  }, { filename: "_lib/communication.ts" });
  return { api: commonJsModule.exports, runtime };
}

test("communication signaling distinguishes an SDK/RPC failure from a negative result", async () => {
  const { api, runtime } = loadCommunication();
  runtime.rpcResponse = { data: null, error: { message: "signal unavailable" } };
  await assert.rejects(
    api.broadcastCommunicationRoomSignal({ event: "media:update", payload: {}, roomId: "ROOM-ERROR" }),
    /signal unavailable/u,
  );
});

test("communication signaling rejects a malformed success response", async () => {
  const { api, runtime } = loadCommunication();
  runtime.rpcResponse = { data: { event: "media:update", roomId: "ROOM-ERROR", sent: false }, error: null };
  await assert.rejects(
    api.broadcastCommunicationRoomSignal({ event: "media:update", payload: {}, roomId: "ROOM-ERROR" }),
    /invalid response/u,
  );
});

test("communication membership reads preserve operational failure evidence", async () => {
  const { api, runtime } = loadCommunication();
  runtime.queryResponses.set("communication_rooms", { data: roomRow, error: null });
  runtime.queryResponses.set("communication_room_memberships", { data: null, error: { message: "membership read unavailable" } });
  await assert.rejects(api.getCommunicationRoomSnapshot("ROOM-ERROR"), /membership read unavailable/u);
});

test("communication membership join preserves RPC failure evidence", async () => {
  const { api, runtime } = loadCommunication();
  runtime.rpcResponse = { data: null, error: { message: "join denied operationally" } };
  await assert.rejects(api.joinCommunicationRoomSession({
    roomId: "ROOM-ERROR",
    userId: "11111111-1111-4111-8111-111111111111",
  }), /join denied operationally/u);
  assert.deepEqual(
    runtime.accountBoundRpcCalls.map(({ expectedUserId, functionName }) => ({ expectedUserId, functionName })),
    [{
      expectedUserId: "11111111-1111-4111-8111-111111111111",
      functionName: "join_communication_room_session",
    }],
  );
});

test("communication membership join preserves account replacement rejection", async () => {
  const { api, runtime } = loadCommunication();
  runtime.accountBoundError = new Error("The signed-in account changed before this action finished.");
  await assert.rejects(api.joinCommunicationRoomSession({
    roomId: "ROOM-ERROR",
    userId: "11111111-1111-4111-8111-111111111111",
  }), /signed-in account changed/u);
});

test("communication membership update preserves database failure evidence", async () => {
  const { api, runtime } = loadCommunication();
  runtime.queryResponses.set("communication_room_memberships", { data: null, error: { message: "membership update unavailable" } });
  await assert.rejects(api.touchCommunicationRoomSession({
    roomId: "ROOM-ERROR",
    userId: "11111111-1111-4111-8111-111111111111",
  }), /membership update unavailable/u);
});

test("communication room end preserves durable update failure evidence", async () => {
  const { api, runtime } = loadCommunication();
  runtime.queryResponses.set("communication_rooms", { data: null, error: { message: "room end unavailable" } });
  await assert.rejects(
    api.endCommunicationRoom(
      "ROOM-ERROR",
      "11111111-1111-4111-8111-111111111111",
    ),
    /room end unavailable/u,
  );
});

const cleanupIdentity = {
  roomId: "ROOM-ERROR",
  userId: "11111111-1111-4111-8111-111111111111",
  expectedMembershipGeneration: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const terminalMembership = {
  room_id: cleanupIdentity.roomId,
  user_id: cleanupIdentity.userId,
  role: "host",
  membership_state: "left",
  membership_generation: cleanupIdentity.expectedMembershipGeneration,
  camera_enabled: false,
  mic_enabled: false,
  joined_at: "2026-09-28T12:00:00Z",
  left_at: "2026-09-28T12:01:00Z",
  last_seen_at: "2026-09-28T12:01:00Z",
};

test("terminal leave confirms the exact real RPC row instead of repeating an invisible table update", async () => {
  const { api, runtime } = loadCommunication();
  runtime.queryResponses.set("communication_room_memberships", { data: null, error: { message: "terminal table inaccessible" } });
  runtime.rpcResponse = { data: [terminalMembership], error: null };
  const left = await api.leaveCommunicationRoomSession(cleanupIdentity);
  assert.equal(left.membershipState, "left");
  assert.equal(left.membershipGeneration, cleanupIdentity.expectedMembershipGeneration);
  assert.equal(runtime.accountBoundRpcCalls[0].functionName, "leave_communication_room_session");
  assert.equal(runtime.accountBoundRpcCalls[0].expectedUserId, cleanupIdentity.userId);
  assert.equal(runtime.accountBoundRpcCalls[0].args.p_expected_membership_generation, cleanupIdentity.expectedMembershipGeneration);
});

test("terminal leave preserves current-account and stale-generation rejection", async () => {
  const { api, runtime } = loadCommunication();
  runtime.accountBoundError = new Error("The signed-in account changed before this action finished.");
  await assert.rejects(api.leaveCommunicationRoomSession(cleanupIdentity), /signed-in account changed/u);
  runtime.accountBoundError = null;
  runtime.rpcResponse = { data: null, error: { message: "communication_membership_cleanup_generation_changed" } };
  await assert.rejects(api.leaveCommunicationRoomSession(cleanupIdentity), /generation_changed/u);
});

test("terminal leave fails before sending when exact generation is missing", async () => {
  const { api, runtime } = loadCommunication();
  for (const expectedMembershipGeneration of [undefined, "", "not-a-generation"]) {
    await assert.rejects(api.leaveCommunicationRoomSession({ ...cleanupIdentity, expectedMembershipGeneration }), /cleanup identity/u);
  }
  assert.equal(runtime.accountBoundRpcCalls.length, 0);
});

test("terminal leave never treats null, missing, wrong-identity, or active-media responses as success", async () => {
  const { api, runtime } = loadCommunication();
  const invalid = [
    null, [], [terminalMembership, terminalMembership],
    { ...terminalMembership, user_id: "22222222-2222-4222-8222-222222222222" },
    { ...terminalMembership, room_id: "OTHER-ROOM" },
    { ...terminalMembership, membership_generation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { ...terminalMembership, membership_state: "active" },
    { ...terminalMembership, camera_enabled: true },
    { ...terminalMembership, mic_enabled: true },
    { ...terminalMembership, left_at: null },
  ];
  for (const data of invalid) {
    runtime.rpcResponse = { data, error: null };
    await assert.rejects(api.leaveCommunicationRoomSession(cleanupIdentity), /cleanup postcondition/u);
  }
});

test("terminal leave accepts removed/off as terminal without converting its authority to left", async () => {
  const { api, runtime } = loadCommunication();
  runtime.rpcResponse = { data: [{ ...terminalMembership, membership_state: "removed" }], error: null };
  assert.equal((await api.leaveCommunicationRoomSession(cleanupIdentity)).membershipState, "removed");
});

function createHeartbeatSdkHarness() {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let requestStarted;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  const row = {
    room_id: "ROOM-ERROR",
    user_id: "11111111-1111-4111-8111-111111111111",
    role: "participant",
    membership_state: "active",
    camera_enabled: true,
    mic_enabled: true,
    joined_at: "2026-09-27T00:00:00.000Z",
    last_seen_at: "2026-09-27T00:00:00.000Z",
    left_at: null,
  };
  const runtime = { row, requests: [], error: null };
  const client = createClient("http://localhost:54321", "test-public-key", {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (!url.pathname.endsWith("/communication_room_memberships")) {
          return new Response("null", { headers: { "Content-Type": "application/json" } });
        }
        const patch = JSON.parse(await request.text());
        runtime.requests.push({ method: request.method, patch, url });
        requestStarted();
        await barrier;
        if (runtime.error) return new Response(JSON.stringify({ message: runtime.error }), {
          headers: { "Content-Type": "application/json" }, status: 403,
        });
        // This boundary checks the installed SDK's real PATCH/filter request;
        // the in-memory row models concurrent server state, not RLS proof.
        const matches = url.searchParams.get("room_id") === `eq.${row.room_id}`
          && url.searchParams.get("user_id") === `eq.${row.user_id}`
          && url.searchParams.get("membership_state") === "in.(active,reconnecting)"
          && url.searchParams.get("left_at") === "is.null"
          && ["active", "reconnecting"].includes(row.membership_state)
          && row.left_at === null;
        if (matches) Object.assign(row, patch);
        return new Response(JSON.stringify(matches ? row : null), { headers: { "Content-Type": "application/json" } });
      },
    },
  });
  return { ...loadCommunication(client), release, started, heartbeatRuntime: runtime };
}

test("communication heartbeat uses the installed SDK to update only current membership liveness", async () => {
  const { api, release, started, heartbeatRuntime: runtime } = createHeartbeatSdkHarness();
  const pending = api.heartbeatCommunicationRoomSession({ roomId: runtime.row.room_id, userId: runtime.row.user_id });
  await started;
  runtime.row.camera_enabled = false;
  runtime.row.mic_enabled = false;
  release();
  const membership = await pending;
  assert.equal(runtime.requests[0].method, "PATCH");
  assert.deepEqual(Object.keys(runtime.requests[0].patch).sort(), ["last_seen_at", "updated_at"]);
  assert.equal(membership.cameraEnabled, false);
  assert.equal(membership.micEnabled, false);
  assert.equal(runtime.row.membership_state, "active");
});

test("communication heartbeat cannot revive a membership that leaves before the delayed request applies", async () => {
  const { api, release, started, heartbeatRuntime: runtime } = createHeartbeatSdkHarness();
  const pending = api.heartbeatCommunicationRoomSession({ roomId: runtime.row.room_id, userId: runtime.row.user_id });
  await started;
  runtime.row.membership_state = "left";
  runtime.row.left_at = "2026-09-27T00:01:00.000Z";
  const snapshot = { ...runtime.row };
  release();
  assert.equal(await pending, null);
  assert.deepEqual(runtime.row, snapshot);
});

test("communication heartbeat preserves a server rejection without manufacturing membership success", async () => {
  const { api, release, started, heartbeatRuntime: runtime } = createHeartbeatSdkHarness();
  runtime.error = "heartbeat authorization rejected";
  const pending = api.heartbeatCommunicationRoomSession({ roomId: runtime.row.room_id, userId: runtime.row.user_id });
  await started;
  release();
  await assert.rejects(pending, /heartbeat authorization rejected/u);
});
