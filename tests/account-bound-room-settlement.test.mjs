import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { invokeAccountBoundSupabaseRpc, isAccountBoundSupabaseRpcOutcomeAmbiguous } from "../_lib/accountBoundSupabaseRpc.mjs";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };

function harness() {
  let nextTimer = 0;
  const timers = new Map();
  const clock = {
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const load = (file, imports) => {
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
      module, exports: module.exports, ...clock,
      require(name) { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; },
    });
    return module.exports;
  };
  const authority = { userId: "test-user", accountId: "test-user", state: "ACTIVE", sessionGeneration: "generation-1", restoreOnly: false };
  const response = deferred();
  let current = authority;
  let calls = 0;
  const deadlines = load("_lib/entitlementAuthority.ts", {});
  const helper = load("_lib/accountBoundSupabaseMutation.ts", {
    "./entitlementAuthority": deadlines,
    "./accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: () => current,
      sameAccountSessionAuthority: (left, right) => Boolean(right) && left.userId === right.userId && left.sessionGeneration === right.sessionGeneration,
    },
    "./accountBoundSupabaseRpc.mjs": {
      isAccountBoundSupabaseRpcOutcomeAmbiguous,
      invokeAccountBoundSupabaseRpc: (options) => invokeAccountBoundSupabaseRpc({
        ...options,
        fetchImpl: async (_url, request) => {
          calls++;
          assert.equal(request.headers.Authorization, "Bearer initiating-token");
          return response.promise;
        },
      }),
    },
    "./supabase": {
      SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "local-anon",
      supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: authority.userId }, access_token: "initiating-token" } } }) } },
    },
    "react-native": { Platform: { OS: "ios" } },
  });
  return {
    helper, response, calls: () => calls,
    replaceAccount: () => { current = { ...authority, userId: "next-user", sessionGeneration: "generation-2" }; },
    async passReadDeadline() {
      await flush();
      for (const [id, timer] of [...timers]) {
        if (timer.delay <= deadlines.AUTHORITY_READ_TIMEOUT_MS) { timers.delete(id); timer.callback(); }
      }
      await flush();
    },
  };
}

for (const name of ["join_communication_room_session", "join_owned_communication_room_session", "touch_owned_communication_room_session", "leave_communication_room_session"]) {
  test(`${name} retains real transport completion after the former read deadline`, async () => {
    const h = harness();
    let settled = false;
    const pending = h.helper.runExactSessionAccountBoundSupabaseMutationRpc(name, {}, "test-user")
      .then((result) => { settled = true; return result; });
    await h.passReadDeadline();
    assert.equal(h.calls(), 1);
    assert.equal(settled, false, "UI deadline cannot complete or cancel this durable mutation");
    h.response.resolve({ ok: true, status: 200, json: async () => [{ membership_state: "left" }] });
    const result = await pending;
    assert.equal(result.error, null);
    assert.equal(result.data[0].membership_state, "left");
  });
}

for (const name of ["heartbeat_watch_party_room_session", "read_communication_room_admission"]) {
  test(`${name} retains the existing bounded read deadline`, async () => {
    const h = harness();
    const pending = h.helper.runExactSessionAccountBoundSupabaseMutationRpc(name, {}, "test-user");
    await h.passReadDeadline();
    assert.equal((await pending).error.message, "account_bound_rpc_timeout");
    h.response.resolve({ ok: true, status: 200, json: async () => [] });
  });
}

test("late room result cannot become a success for a replacement account", async () => {
  const h = harness();
  const pending = h.helper.runExactSessionAccountBoundSupabaseMutationRpc("leave_communication_room_session", {}, "test-user");
  await h.passReadDeadline();
  h.replaceAccount();
  h.response.resolve({ ok: true, status: 200, json: async () => [] });
  await assert.rejects(pending, /signed-in account changed/u);
});

test("a real transport failure remains an ambiguous error, never invented cleanup success", async () => {
  const h = harness();
  const pending = h.helper.runExactSessionAccountBoundSupabaseMutationRpc("leave_communication_room_session", {}, "test-user");
  await h.passReadDeadline();
  h.response.resolve({ ok: true, status: 200, json: async () => { throw new Error("truncated response"); } });
  const result = await pending;
  assert.equal(result.data, null);
  assert.equal(result.error.message, "account_bound_rpc_unavailable");
  assert.equal(h.helper.isAccountBoundSupabaseMutationOutcomeAmbiguous(result.error), true);
});

for (const [label, response] of [
  ["HTML gateway 502", { ok: false, status: 502, json: async () => { throw new Error("HTML gateway response"); } }],
  ["JSON gateway 504", { ok: false, status: 504, json: async () => ({ message: "upstream timeout", code: "P0001" }) }],
  ["unstructured HTTP 400", { ok: false, status: 400, json: async () => ({ message: "request failed" }) }],
  ["HTTP 408", { ok: false, status: 408, json: async () => ({ message: "request timed out", code: "57014" }) }],
  ["missing response", null],
]) {
  for (const name of ["join_communication_room_session", "join_owned_communication_room_session", "touch_owned_communication_room_session", "leave_communication_room_session"]) {
    test(`${name} retains uncertain ownership after ${label}`, async () => {
      const h = harness();
      const pending = h.helper.runExactSessionAccountBoundSupabaseMutationRpc(name, {}, "test-user");
      await flush();
      h.response.resolve(response);
      const result = await pending;
      assert.equal(result.data, null);
      assert.equal(result.error.code, "account_bound_rpc_outcome_unknown");
      assert.equal(h.helper.isAccountBoundSupabaseMutationOutcomeAmbiguous(result.error), true);
    });
  }
}

for (const [status, code, message] of [
  [400, "P0001", "communication_membership_cleanup_generation_changed"],
  [403, "42501", "permission denied for function leave_communication_room_session"],
  [401, "PGRST301", "JWT expired"],
]) {
  test(`structured ${code} rejection remains definitive and keeps its server identity`, async () => {
    const h = harness();
    const pending = h.helper.runExactSessionAccountBoundSupabaseMutationRpc("leave_communication_room_session", {}, "test-user");
    await flush();
    h.response.resolve({ ok: false, status, json: async () => ({ code, message, details: null, hint: null }) });
    const result = await pending;
    assert.equal(result.error.code, code);
    assert.equal(result.error.message, message);
    assert.equal(h.helper.isAccountBoundSupabaseMutationOutcomeAmbiguous(result.error), false);
  });
}
