#!/usr/bin/env node
// Execute the production Deno boundary tests with local TypeScript and mocked
// imports. No network, database, provider, or deployment access is performed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const tests = [];
const audits = [];
const context = vm.createContext({
  console,
  TextDecoder,
  atob,
  Deno: { env: { get: () => undefined }, serve: () => {}, test: (name, run) => tests.push({ name, run }) },
});
const cache = new Map();
function load(relative, exposeMonitor = false) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file);
  const source = readFileSync(file, "utf8") + (exposeMonitor ? "\nexport { countLiveKitState };\n" : "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
    fileName: file,
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0, `${relative}: TypeScript transpilation diagnostics`);
  const module = { exports: {} };
  cache.set(file, module.exports);
  const require = (specifier) => {
    if (specifier === "jsr:@std/assert@1") return { assertEquals: assert.deepEqual };
    if (specifier === "jsr:@supabase/functions-js/edge-runtime.d.ts") return {};
    if (specifier === "npm:@supabase/supabase-js@2") return {};
    if (specifier === "npm:livekit-server-sdk@2") return {};
    if (specifier === "../_shared/livekit-routing.ts") {
      return { writeLiveKitRoutingAudit: async (_client, event) => audits.push(event) };
    }
    assert.ok(specifier.startsWith("."), `Unexpected external import: ${specifier}`);
    return load(path.resolve(path.dirname(file), specifier));
  };
  vm.runInContext(`(function (exports, require, module) {\n${compiled.outputText}\n})`, context, { filename: file })(
    module.exports, require, module,
  );
  return module.exports;
}

load("supabase/functions/_shared/livekit-seat-session-enforcement_test.ts");
load("supabase/functions/_shared/watch-party-livekit-authority_test.ts");
for (const test of tests) {
  try {
    await test.run();
  } catch (error) {
    console.error(`FAIL: ${test.name}`);
    throw error;
  }
}

// Verify the real Edge monitor wiring reads the exact room membership, keeps
// listeners connected, and retries a failed provider revocation next pass.
const { countLiveKitState } = load("supabase/functions/livekit-heartbeat-monitor/index.ts", true);
const identity = "11111111-1111-4111-8111-111111111111";
const host = "33333333-3333-4333-8333-333333333333";
const generation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const roomName = "PARTY-ONE";
const queries = [];
let hostMuted = false;
let canPublish = true;
let removalFails = false;
let removalAttempts = 0;
const adminClient = {
  from(table) {
    const query = { table, fields: null, filters: [] };
    queries.push(query);
    const builder = {
      select(fields) { query.fields = fields; return builder; },
      eq(key, value) { query.filters.push([key, value]); return builder; },
      in() { return builder; },
      limit() { return builder; },
      maybeSingle() { return builder; },
      then(resolve, reject) {
        let data;
        if (table === "livekit_room_assignments") data = [{ room_type: "live_stage" }];
        else if (table === "watch_party_rooms") data = { party_id: roomName, host_user_id: host, is_active: true };
        else if (table === "communication_rooms") data = null;
        else if (table === "watch_party_room_memberships") data = [{
          user_id: identity, role: "member", stage_role: "speaker", can_speak: true,
          host_muted: hostMuted, self_muted: false, is_muted: false,
          membership_state: "active", last_seen_at: new Date().toISOString(),
          joined_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }];
        else assert.fail(`Unexpected table: ${table}`);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
  async rpc(name, args) {
    assert.equal(name, "resolve_watch_party_livekit_viewer_authority");
    assert.equal(args.p_party_id, roomName);
    assert.equal(args.p_user_id, identity);
    assert.equal(args.p_session_generation, generation);
    return { error: null, data: {
      allowed: true, paidSeatRequired: false, speakerEligible: true,
      hostAuthority: false, expiresAt: null, reason: "non_seat_room_authority",
    } };
  },
};
const roomService = {
  async listRooms() { return [{ name: roomName }]; },
  async listParticipants() { return [{
    identity, tracks: [], permission: { canPublish },
    metadata: JSON.stringify({ app: "chillywood-mobile", roomName, userId: identity, sessionGeneration: generation }),
  }]; },
  async removeParticipant(room, user) {
    assert.equal(room, roomName);
    assert.equal(user, identity);
    removalAttempts += 1;
    if (removalFails) throw new Error("provider unavailable");
  },
};
assert.equal((await countLiveKitState(roomService, adminClient, "server-row")).currentParticipants, 1);
assert.equal(removalAttempts, 0);
assert.ok(queries.some((query) => query.table === "watch_party_room_memberships"
  && query.fields.includes("host_muted,self_muted")
  && query.filters.some(([key, value]) => key === "party_id" && value === roomName)));
hostMuted = true;
removalFails = true;
assert.equal((await countLiveKitState(roomService, adminClient, "server-row")).currentParticipants, 1);
assert.equal(removalAttempts, 1);
assert.equal(audits.at(-1).metadata.retry_on_next_monitor, true);
removalFails = false;
assert.equal((await countLiveKitState(roomService, adminClient, "server-row")).currentParticipants, 0);
assert.equal(removalAttempts, 2);
canPublish = false;
queries.length = 0;
assert.equal((await countLiveKitState(roomService, adminClient, "server-row")).currentParticipants, 1);
assert.equal(removalAttempts, 2);
assert.equal(queries.some((query) => query.table === "watch_party_room_memberships"), true);

// Execute the real token role resolver (not a copy of its branch). Extracting
// declarations avoids loading the Edge server and external provider SDKs in CI.
const tokenSource = ts.createSourceFile("livekit-token.ts", readFileSync(
  path.join(root,"supabase/functions/livekit-token/index.ts"),"utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const selected = new Set([
  "ACTIVE_MEMBERSHIP_STATES", "WATCH_PARTY_MEMBERSHIP_ACTIVE_WINDOW_MS", "LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS",
  "sanitizeText", "parseTimeMillis", "firstValidTimeMillis", "isRecentTime", "normalizeWatchPartyMembership",
  "isFreshWatchPartyMembership", "isWatchPartySpeakerSeatMembership", "membershipSeatMillis",
  "getAuthorizedWatchPartySpeakerSeatIds", "fetchWatchPartyMemberships", "resolveCurrentWatchPartyLiveKitAuthority",
  "resolveEffectiveParticipantRole",
]);
const nodes = tokenSource.statements.filter((node) => {
  if (ts.isFunctionDeclaration(node) && node.name) return selected.has(node.name.text);
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.some((decl) => ts.isIdentifier(decl.name) && selected.has(decl.name.text));
  return false;
});
assert.equal(nodes.length,selected.size,"all production role declarations were selected");
const roleCode = ts.transpileModule(nodes.map((node) => node.getText(tokenSource)).join("\n"), {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
const parser = load("supabase/functions/_shared/watch-party-livekit-authority.ts");
const resolveRole = vm.runInContext(`(function(parseWatchPartyLiveKitAuthorityDecision) { ${roleCode}\nreturn resolveEffectiveParticipantRole; })`,context)(parser.parseWatchPartyLiveKitAuthorityDecision);
const now = Date.now();
const paidAuthority = { allowed:true,paidSeatRequired:true,speakerEligible:true,hostAuthority:false,
  expiresAt:new Date(now+25_000).toISOString(),reason:"exact_live_seat_eligibility_authority" };
const targetMembership = { user_id:identity,role:"viewer",stage_role:"listener",can_speak:false,
  is_muted:false,host_muted:false,self_muted:false,membership_state:"active",
  last_seen_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString(),joined_at:new Date(now).toISOString() };
const roleClient = (memberships,authority=paidAuthority) => ({
  rpc:async () => ({data:authority,error:null}),
  from:() => ({select:() => ({eq:async () => ({data:memberships,error:null})})}),
});
const room = {kind:"watch-party",roomName,hostUserId:host};
for (const memberships of [
  [targetMembership],
  [
    ...["44444444-4444-4444-8444-444444444444","55555555-5555-4555-8555-555555555555","66666666-6666-4666-8666-666666666666"]
      .map((user_id,index) => ({...targetMembership,user_id,stage_role:"speaker",can_speak:true,updated_at:new Date(now-4000+index).toISOString()})),
    {...targetMembership,stage_role:"speaker",can_speak:true},
  ],
]) {
  const resolution = await resolveRole(roleClient(memberships),room,"live-stage","speaker",identity,generation,{});
  assert.equal(resolution.ok,true);
  assert.equal(resolution.participantRole,"viewer");
  assert.equal(resolution.canPublish,false);
  assert.equal(resolution.reason,"speaker_not_approved_or_over_cap");
  assert.equal(resolution.watchPartyAuthority?.expiresAt,paidAuthority.expiresAt,"downgrade retains exact finite proof");
  assert.ok(parser.resolveWatchPartyLiveKitTokenTtlSeconds(resolution.watchPartyAuthority,3600,now)<=25,"downgrade cannot inherit default one-hour TTL");
}
console.log(`LiveKit authority passed: ${tests.length} boundary tests, real Edge monitor wiring, and token downgrade TTL branches.`);
