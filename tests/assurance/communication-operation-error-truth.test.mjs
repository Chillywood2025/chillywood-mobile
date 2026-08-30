#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

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

function loadCommunication() {
  const runtime = {
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
    "./supabase": { supabase },
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
});

test("communication membership update preserves database failure evidence", async () => {
  const { api, runtime } = loadCommunication();
  runtime.queryResponses.set("communication_room_memberships", { data: null, error: { message: "membership update unavailable" } });
  await assert.rejects(api.touchCommunicationRoomSession({
    roomId: "ROOM-ERROR",
    userId: "11111111-1111-4111-8111-111111111111",
  }), /membership update unavailable/u);
});
