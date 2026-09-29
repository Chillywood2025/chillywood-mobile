#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { invokeAccountBoundSupabaseRpc, isAccountBoundSupabaseRpcOutcomeAmbiguous } from "../../_lib/accountBoundSupabaseRpc.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
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

function loadCommunication(clientOverride, runExactSessionOverride) {
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
        if (runExactSessionOverride) return runExactSessionOverride(functionName, args, expectedUserId);
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
    crypto: webcrypto,
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
    admission: cleanupIdentity.admission,
  }), /join denied operationally/u);
  assert.deepEqual(
    runtime.accountBoundRpcCalls.map(({ expectedUserId, functionName }) => ({ expectedUserId, functionName })),
    [{
      expectedUserId: "11111111-1111-4111-8111-111111111111",
      functionName: "join_owned_communication_room_session",
    }],
  );
});

test("communication membership join preserves account replacement rejection", async () => {
  const { api, runtime } = loadCommunication();
  runtime.accountBoundError = new Error("The signed-in account changed before this action finished.");
  await assert.rejects(api.joinCommunicationRoomSession({
    roomId: "ROOM-ERROR",
    userId: "11111111-1111-4111-8111-111111111111",
    admission: cleanupIdentity.admission,
  }), /signed-in account changed/u);
});

test("communication membership update preserves database failure evidence", async () => {
  const { api, runtime } = loadCommunication();
  runtime.rpcResponse = { data: null, error: { message: "membership update unavailable" } };
  await assert.rejects(api.touchCommunicationRoomSession({
    roomId: "ROOM-ERROR",
    userId: "11111111-1111-4111-8111-111111111111",
    expectedMembershipGeneration: cleanupIdentity.expectedMembershipGeneration,
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
  admission: Object.freeze({ roomId: "ROOM-ERROR", userId: "11111111-1111-4111-8111-111111111111",
    attemptId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", expectedPreviousGeneration: null }),
};
const terminalMembership = {
  room_id: cleanupIdentity.roomId,
  user_id: cleanupIdentity.userId,
  role: "host",
  membership_state: "left",
  membership_generation: cleanupIdentity.expectedMembershipGeneration,
  membership_admission_attempt: cleanupIdentity.admission.attemptId,
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
    { ...terminalMembership, left_at: "invalid-time" },
    { ...terminalMembership, camera_enabled: undefined },
  ];
  for (const data of invalid) {
    runtime.rpcResponse = { data, error: null };
    await assert.rejects(api.leaveCommunicationRoomSession(cleanupIdentity), (error) => {
      assert.match(error.message, /cleanup postcondition/u);
      assert.equal(isAccountBoundSupabaseRpcOutcomeAmbiguous(error), true);
      return true;
    });
  }
});

test("unusable successful join receipts retain uncertainty instead of authorizing replacement admission", async () => {
  const { api, runtime } = loadCommunication();
  const joined = { ...terminalMembership, membership_state: "active", left_at: null };
  const invalid = [
    null, [], [joined, joined], "not a row", {},
    { ...joined, user_id: "22222222-2222-4222-8222-222222222222" },
    { ...joined, room_id: "OTHER-ROOM" },
    { ...joined, membership_generation: null },
    { ...joined, membership_admission_attempt: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
    { ...joined, membership_state: "left" },
    { ...joined, camera_enabled: undefined },
    { ...joined, left_at: terminalMembership.left_at },
  ];
  for (const data of invalid) {
    runtime.rpcResponse = { data, error: null };
    await assert.rejects(api.joinCommunicationRoomSession(cleanupIdentity), (error) => {
      assert.match(error.message, /admission postcondition/u);
      assert.equal(isAccountBoundSupabaseRpcOutcomeAmbiguous(error), true);
      return true;
    });
  }
  runtime.rpcResponse = { data: [joined], error: null };
  assert.equal((await api.joinCommunicationRoomSession(cleanupIdentity)).membershipGeneration, cleanupIdentity.expectedMembershipGeneration);
});

test("actual gateway error identity survives the communication wrapper for join and leave", async () => {
  const { api, runtime } = loadCommunication();
  runtime.rpcResponse = await invokeAccountBoundSupabaseRpc({
    supabaseUrl: "http://127.0.0.1:54321", anonKey: "local", accessToken: "test",
    functionName: "leave_communication_room_session",
    fetchImpl: async () => ({ ok: false, status: 504, json: async () => { throw new Error("HTML timeout"); } }),
  });
  for (const operation of [api.joinCommunicationRoomSession, api.leaveCommunicationRoomSession]) {
    await assert.rejects(operation(cleanupIdentity), (error) => {
      assert.equal(error.code, "account_bound_rpc_outcome_unknown");
      assert.equal(isAccountBoundSupabaseRpcOutcomeAmbiguous(error), true);
      return true;
    });
  }
  runtime.rpcResponse = { data: null, error: { code: "P0001", message: "communication_membership_cleanup_generation_changed" } };
  await assert.rejects(api.leaveCommunicationRoomSession(cleanupIdentity), (error) => {
    assert.equal(error.code, "P0001");
    assert.equal(isAccountBoundSupabaseRpcOutcomeAmbiguous(error), false);
    return true;
  });
});

test("terminal leave accepts removed/off as terminal without converting its authority to left", async () => {
  const { api, runtime } = loadCommunication();
  runtime.rpcResponse = { data: [{ ...terminalMembership, membership_state: "removed" }], error: null };
  assert.equal((await api.leaveCommunicationRoomSession(cleanupIdentity)).membershipState, "removed");
});

function createHeartbeatRpcHarness() {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let requestStarted;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  const row = { ...terminalMembership, membership_state: "active", camera_enabled: true, mic_enabled: true, left_at: null };
  const runtime = { row, requests: [], error: null };
  const runExactSession = (functionName, args, expectedUserId) => invokeAccountBoundSupabaseRpc({
    supabaseUrl: "http://localhost:54321", anonKey: "test-public-key", accessToken: "frozen-initiating-token",
    functionName, args,
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      assert.equal(expectedUserId, row.user_id);
      assert.equal(request.headers.get("Authorization"), "Bearer frozen-initiating-token");
      const patch = JSON.parse(await request.text());
      runtime.requests.push({ method: request.method, patch, url });
      requestStarted();
      await barrier;
      let error = runtime.error;
      if (patch.p_expected_membership_generation !== row.membership_generation) error = "communication_membership_generation_changed";
      if (!["active", "reconnecting"].includes(row.membership_state) || row.left_at !== null) error = "communication_membership_inactive";
      if (error) return new Response(JSON.stringify({ message: error, code: "P0001" }), {
        headers: { "Content-Type": "application/json" }, status: 400,
      });
      // Controlled server boundary only: this proves the actual frozen-JWT RPC
      // shape carries no stale media intent. Database tests prove SQL behavior.
      row.last_seen_at = new Date().toISOString();
      return new Response(JSON.stringify([row]), { headers: { "Content-Type": "application/json" } });
    },
  });
  return { ...loadCommunication(undefined, runExactSession), release, started, heartbeatRuntime: runtime };
}

test("communication heartbeat sends only owned liveness intent through the real frozen-JWT RPC transport", async () => {
  const { api, release, started, heartbeatRuntime: runtime } = createHeartbeatRpcHarness();
  const pending = api.heartbeatCommunicationRoomSession(cleanupIdentity);
  await started;
  runtime.row.camera_enabled = false;
  runtime.row.mic_enabled = false;
  release();
  const membership = await pending;
  const request = runtime.requests[0];
  assert.equal(request.method, "POST");
  assert.equal(request.url.pathname, "/rest/v1/rpc/touch_owned_communication_room_session");
  assert.equal(request.patch.p_expected_membership_generation, cleanupIdentity.expectedMembershipGeneration);
  for (const field of ["p_camera_enabled", "p_mic_enabled", "p_membership_state", "p_display_name", "p_avatar_url"]) assert.equal(request.patch[field], null);
  assert.equal(request.patch.p_update_display_name, false);
  assert.equal(request.patch.p_update_avatar_url, false);
  assert.equal(membership.cameraEnabled, false);
  assert.equal(membership.micEnabled, false);
  assert.equal(runtime.row.membership_state, "active");
});

test("communication heartbeat cannot revive a membership that leaves before its owned request applies", async () => {
  const { api, release, started, heartbeatRuntime: runtime } = createHeartbeatRpcHarness();
  const pending = api.heartbeatCommunicationRoomSession(cleanupIdentity);
  await started;
  runtime.row.membership_state = "left";
  runtime.row.left_at = "2026-09-27T00:01:00.000Z";
  const snapshot = { ...runtime.row };
  release();
  await assert.rejects(pending, /membership_inactive/u);
  assert.deepEqual(runtime.row, snapshot);
});

test("communication heartbeat preserves server rejection without manufacturing membership success", async () => {
  const { api, release, started, heartbeatRuntime: runtime } = createHeartbeatRpcHarness();
  runtime.error = "heartbeat authorization rejected";
  const pending = api.heartbeatCommunicationRoomSession(cleanupIdentity);
  await started;
  release();
  await assert.rejects(pending, /heartbeat authorization rejected/u);
});

test("admission preparation uses the exact-session read and freezes one CAS snapshot and secure attempt", async () => {
  const { api, runtime } = loadCommunication();
  runtime.rpcResponse = { data: { roomId: cleanupIdentity.roomId, userId: cleanupIdentity.userId,
    previousGeneration: cleanupIdentity.expectedMembershipGeneration }, error: null };
  const first = await api.prepareCommunicationRoomAdmission(cleanupIdentity);
  const second = await api.prepareCommunicationRoomAdmission(cleanupIdentity);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.expectedPreviousGeneration, cleanupIdentity.expectedMembershipGeneration);
  assert.match(first.attemptId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.notEqual(first.attemptId, second.attemptId);
  assert.equal(runtime.accountBoundRpcCalls[0].functionName, "read_communication_room_admission");
  assert.equal(runtime.accountBoundRpcCalls[0].expectedUserId, cleanupIdentity.userId);
  for (const data of [null, {}, { ...runtime.rpcResponse.data, previousGeneration: undefined },
    { ...runtime.rpcResponse.data, userId: "other" }, { ...runtime.rpcResponse.data, roomId: "OTHER-ROOM" }]) {
    runtime.rpcResponse = { data, error: null };
    await assert.rejects(api.prepareCommunicationRoomAdmission(cleanupIdentity), /admission snapshot not confirmed/u);
  }
});

test("owned join never rereads or replaces its prepared CAS identity", async () => {
  const { api, runtime } = loadCommunication();
  runtime.rpcResponse = { data: [{ ...terminalMembership, membership_state: "active", left_at: null }], error: null };
  await api.joinCommunicationRoomSession(cleanupIdentity);
  await api.joinCommunicationRoomSession(cleanupIdentity);
  assert.equal(runtime.accountBoundRpcCalls.length, 2);
  for (const call of runtime.accountBoundRpcCalls) {
    assert.equal(call.functionName, "join_owned_communication_room_session");
    assert.equal(call.args.p_admission_attempt, cleanupIdentity.admission.attemptId);
    assert.equal(call.args.p_expected_previous_generation, null);
  }
  await assert.rejects(api.joinCommunicationRoomSession({ ...cleanupIdentity, admission: undefined }), /prepared admission identity/u);
  await assert.rejects(api.joinCommunicationRoomSession({ ...cleanupIdentity, admission: { ...cleanupIdentity.admission, userId: "other" } }), /prepared admission identity/u);
  assert.equal(runtime.accountBoundRpcCalls.length, 2);
});

test("owned media and heartbeat fail closed on missing generation or a replacement response", async () => {
  const { api, runtime } = loadCommunication();
  for (const operation of [api.touchCommunicationRoomSession, api.heartbeatCommunicationRoomSession]) {
    await assert.rejects(operation({ ...cleanupIdentity, expectedMembershipGeneration: undefined }), /membership update identity/u);
    runtime.rpcResponse = { data: [{ ...terminalMembership, membership_state: "active", left_at: null,
      membership_generation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }], error: null };
    await assert.rejects(operation(cleanupIdentity), /membership update postcondition/u);
  }
});

test("owned signaling binds sender and generation and strips caller-supplied authority", async () => {
  const { api, runtime } = loadCommunication();
  const receipt = { sent: true, event: "webrtc:offer", roomId: cleanupIdentity.roomId,
    fromUserId: cleanupIdentity.userId, membershipGeneration: cleanupIdentity.expectedMembershipGeneration };
  runtime.rpcResponse = { data: receipt, error: null };
  const options = { ...cleanupIdentity, event: "webrtc:offer", payload: { fromUserId: "forged", membershipGeneration: "forged", description: { type: "offer", sdp: "fixture" } } };
  assert.equal(await api.broadcastCommunicationRoomSignal(options), true);
  const call = runtime.accountBoundRpcCalls[0];
  assert.equal(call.functionName, "broadcast_owned_communication_room_signal");
  assert.equal(call.expectedUserId, cleanupIdentity.userId);
  assert.equal(call.args.p_payload.fromUserId, undefined);
  assert.equal(call.args.p_payload.membershipGeneration, undefined);
  assert.equal(call.args.p_expected_membership_generation, cleanupIdentity.expectedMembershipGeneration);
  for (const changed of [{ fromUserId: "other" }, { membershipGeneration: "other" }, { roomId: "OTHER-ROOM" }, { sent: false }]) {
    runtime.rpcResponse = { data: { ...receipt, ...changed }, error: null };
    await assert.rejects(api.broadcastCommunicationRoomSignal(options), /invalid response/u);
  }
});
