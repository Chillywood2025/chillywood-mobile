import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { invokeAccountBoundSupabaseRpc, isAccountBoundSupabaseRpcOutcomeAmbiguous } from "../_lib/accountBoundSupabaseRpc.mjs";

const ts = createRequire(import.meta.url)("typescript");
const uuid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(17), state: "ACTIVE", restoreOnly: false };
const B = { ...A, userId: uuid(2), accountId: uuid(2), sessionGeneration: uuid(18) };
const ids = Object.fromEntries(["resource", "offer", "intent", "receipt", "grant"].map((type, n) => [type, `scv1_${type}_${uuid(n + 10)}`]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function load(relativePath, bindings) {
  const context = { exports: {}, require: (name) => {
    if (!(name in bindings)) throw new Error(`Unexpected dependency ${name}`);
    return bindings[name];
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context, { filename: relativePath });
  return context.exports;
}
function fixture(initialActor = A) {
  const A = initialActor;
  const calls = [];
  let responseTransform = (value) => value;
  let beforeCommerce = async () => {};
  let beforeSessionRead = async () => {};
  let rawResponse = null;
  let expireCommerceRead = false;
  let sessionActor = A;
  const supabaseBindings = {
    SUPABASE_URL: "https://isolated-fixture.invalid", SUPABASE_ANON_KEY: "public-fixture-key",
    supabase: { auth: { getSession: async () => {
      await beforeSessionRead();
      return { data: { session: { access_token: `frozen-fixture-token-${sessionActor.userId}`, user: { id: sessionActor.userId } } } };
    } } },
  };
  const deadline = { withAuthorityReadDeadline: async (operation, fallback) => expireCommerceRead && fallback?.error?.message === "account_bound_rpc_timeout" ? fallback : await operation };
  const authority = load("../_lib/accountSessionAuthority.ts", { "./supabase": supabaseBindings, "./entitlementAuthority": deadline });
  authority.publishAccountSessionAuthoritySnapshot(A);
  const transport = {
    isAccountBoundSupabaseRpcOutcomeAmbiguous,
    invokeAccountBoundSupabaseRpc: (args) => invokeAccountBoundSupabaseRpc({ ...args, fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, headers: init.headers, body });
      if (url.endsWith("/wave1_session_authority_readback")) return Response.json({ ...sessionActor, authoritative: true });
      assert.ok(url.endsWith("/isolated_sandbox_commerce_v1"));
      await beforeCommerce(body);
      if (rawResponse) return rawResponse();
      const actor = { userId: A.userId, accountId: body.p_expected_account_id, sessionGeneration: body.p_expected_session_generation };
      const { p_command: command, p_payload: payload } = body;
      const resource = { id: ids.resource, kind: "paid_content", creatorId: A.userId, revision: 1, status: "draft" };
      const offer = { id: ids.offer, resourceId: ids.resource, kind: "paid_content", revision: 1, status: "published", amountMinor: 199, currency: "usd" };
      const intent = { id: ids.intent, offerId: ids.offer, resourceId: ids.resource, kind: "paid_content", status: "prepared", providerDispatchAllowed: false };
      const receipt = { id: ids.receipt, intentId: ids.intent, offerId: ids.offer, resourceId: ids.resource, kind: "paid_content", status: "verified", receiptType: "provider_verified" };
      const data = {
        "creator.declare": { eligible: payload.declared18Plus && payload.countryCode === "US" },
        "resource.create": { resource: { ...resource, kind: payload.kind } }, "resource.read": { resource },
        "offer.publish": { offer }, "offer.read": { offer }, "checkout.prepare": { intent }, "checkout.read": { intent },
        "receipt.read": { receipt, grantsAccess: false },
        "delivery.resolve": { resourceId: ids.resource, kind: "paid_content", decision: "unavailable" },
      }[command];
      return Response.json(responseTransform({ protocol: "sandbox-commerce-v1", environment: "sandbox", command, requestId: payload.requestId, actor, status: "ok", data }));
    } }),
  };
  const mutation = load("../_lib/accountBoundSupabaseMutation.ts", {
    "./accountSessionAuthority": authority, "./entitlementAuthority": deadline,
    "./accountBoundSupabaseRpc.mjs": transport, "./supabase": supabaseBindings, "react-native": { Platform: { OS: "ios" } },
  });
  const api = load("../_lib/isolatedSandboxCommerce.ts", {
    "./accountSessionAuthority": authority, "./accountBoundSupabaseMutation": mutation,
    "./accountBoundSupabaseRpc.mjs": transport, "./supabase": supabaseBindings, "react-native": { Platform: { OS: "ios" } },
  });
  return {
    api, calls, capture: () => api.captureIsolatedSandboxCommerceClient(A),
    publish: (value) => { authority.publishAccountSessionAuthoritySnapshot(value); },
    changeSession: (value) => { sessionActor = value; },
    transform: (fn) => { responseTransform = fn; }, beforeCommerce: (fn) => { beforeCommerce = fn; },
    beforeSessionRead: (fn) => { beforeSessionRead = fn; }, rawResponse: (fn) => { rawResponse = fn; },
    expireRead: () => { expireCommerceRead = true; },
  };
}
const errorIs = (code, outcome, requestId) => (error) => {
  assert.equal(error.code, code); assert.equal(error.outcome, outcome);
  if (requestId !== undefined) assert.equal(error.requestId, requestId);
  assert.doesNotMatch(error.message, /frozen-fixture-token/u);
  return true;
};
const readResource = (client, requestId = uuid(100)) => client.request("resource.read", requestId, { resourceId: ids.resource });

test("real account-bound helper and RPC transport retain the exact token, actor, protocol and typed IDs", async () => {
  const f = fixture(); const client = await f.capture();
  const result = await readResource(client);
  assert.equal(result.data.resource.id, ids.resource);
  assert.equal(f.calls.length, 2);
  const call = f.calls[1];
  assert.equal(call.headers.Authorization, `Bearer frozen-fixture-token-${A.userId}`);
  assert.equal(call.headers["Content-Profile"], "public");
  assert.equal(call.headers["x-chillywood-platform"], "ios");
  assert.deepEqual(call.body, { p_command: "resource.read", p_payload: { protocol: "sandbox-commerce-v1", requestId: uuid(100), resourceId: ids.resource }, p_expected_account_id: A.accountId, p_expected_session_generation: A.sessionGeneration });
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.actor) && Object.isFrozen(result.data.resource));
  client.dispose();
});

test("all actual product families can be authored without provider dispatch or legacy route calls", async () => {
  const f = fixture(); const client = await f.capture();
  const expected = ["creator_tip", "paid_content", "watch_party_live", "live_watch_party_access", "live_watch_party_seat", "event", "channel_subscription", "vip_pass", "physical_merch", "event_auction", "room_seat_auction:party_admission", "room_seat_auction:stage_reserved_seat"];
  assert.deepEqual(clone(f.api.ISOLATED_SANDBOX_PRODUCT_KINDS), expected);
  for (const [index, kind] of expected.entries()) {
    const result = await client.request("resource.create", uuid(200 + index), { kind, title: "Sandbox resource" });
    assert.equal(result.data.resource.kind, kind); assert.equal(result.data.resource.creatorId, A.userId);
  }
  assert.ok(f.calls.slice(1).every((call) => call.url.endsWith("/isolated_sandbox_commerce_v1")));
  client.dispose();
});

test("authoring, checkout, receipt and unavailable delivery shapes preserve separate authority", async () => {
  const f = fixture(); const client = await f.capture();
  const steps = [
    ["creator.declare", { declared18Plus: false, countryCode: "US", regionCode: "CA", declarationVersion: "adult-us-creator-v1" }],
    ["offer.publish", { resourceId: ids.resource, amountMinor: 199, currency: "usd", expectedRevision: 1 }],
    ["offer.read", { offerId: ids.offer }], ["checkout.prepare", { offerId: ids.offer, expectedRevision: 1 }],
    ["checkout.read", { intentId: ids.intent }], ["receipt.read", { receiptId: ids.receipt }],
    ["delivery.resolve", { resourceId: ids.resource, expectedRevision: 1 }],
  ];
  const results = [];
  for (const [index, [command, payload]] of steps.entries()) results.push(await client.request(command, uuid(300 + index), payload));
  assert.equal(results[0].data.eligible, false);
  assert.equal(results[3].data.intent.providerDispatchAllowed, false);
  assert.equal(results[5].data.receipt.status, "verified");
  assert.equal(results[5].data.grantsAccess, false);
  assert.equal(results[6].data.decision, "unavailable");
  client.dispose();
});

test("held, denied and pending are explicit results with no capability payload", async () => {
  const f = fixture(); const client = await f.capture();
  for (const [index, status] of ["held", "denied", "pending"].entries()) {
    f.transform((value) => ({ ...value, status, data: { reason: "provider_binding_unqualified" } }));
    const result = await readResource(client, uuid(400 + index));
    assert.equal(result.status, status); assert.deepEqual(clone(result.data), { reason: "provider_binding_unqualified" });
  }
  f.transform((value) => ({ ...value, status: "held", data: { reason: "held", grantsAccess: true } }));
  await assert.rejects(readResource(client, uuid(404)), errorIs("invalid_response", "unknown"));
  client.dispose();
});

test("SQL-shaped held delivery binds the exact resource and cannot smuggle an authorized destination", async () => {
  const f = fixture(); const client = await f.capture();
  f.transform((value) => ({ ...value, status: "held", data: { ...value.data, reason: "mode_delivery_adapter_unavailable" } }));
  const result = await client.request("delivery.resolve", uuid(410), { resourceId: ids.resource, expectedRevision: 1 });
  assert.equal(result.status, "held"); assert.equal(result.data.decision, "unavailable"); assert.equal(result.data.resourceId, ids.resource);
  for (const [index, change] of [
    { resourceId: `scv1_resource_${uuid(999)}` }, { resourceId: uuid(10) },
    { decision: "authorized" }, { destination: { kind: "video", url: "https://example.invalid/asset" } },
  ].entries()) {
    f.transform((value) => ({ ...value, status: "held", data: { ...value.data, reason: "mode_delivery_adapter_unavailable", ...change } }));
    await assert.rejects(client.request("delivery.resolve", uuid(411 + index), { resourceId: ids.resource, expectedRevision: 1 }), errorIs("invalid_response", "unknown"));
  }
  client.dispose();
});

test("invalid, legacy, cross-kind and injected requests never reach transport", async () => {
  const f = fixture(); const client = await f.capture(); const before = f.calls.length;
  const invalid = [
    ["resource.read", { resourceId: uuid(10) }], ["resource.read", { resourceId: ids.offer }],
    ["resource.read", { resourceId: ids.resource, protocol: "legacy" }],
    ["resource.create", { kind: "premium", title: "Upgrade" }],
    ["resource.create", { kind: "paid_content", title: "Asset", url: "https://example.invalid/file" }],
    ["offer.publish", { resourceId: ids.resource, amountMinor: 0, currency: "usd", expectedRevision: 1 }],
    ["checkout.prepare", { offerId: ids.offer, expectedRevision: "1" }],
    ["creator.declare", { declared18Plus: true, countryCode: "US", regionCode: null, declarationVersion: "adult-us-creator-v1", acceptedCreatorTerms: true }],
    ["creator.declare", { declared18Plus: "true", countryCode: "US", regionCode: null, declarationVersion: "adult-us-creator-v1" }],
    ["cashout.request", {}], ["toString", {}],
  ];
  for (const [command, payload] of invalid) await assert.rejects(client.request(command, uuid(500), payload), errorIs("invalid_request", "not_dispatched"));
  await assert.rejects(readResource(client, "unversioned-request"), errorIs("invalid_request", "not_dispatched", null));
  assert.equal(f.calls.length, before); client.dispose();
});

test("response protocol, request, command, exact actor, generation type and resource substitution fail closed", async () => {
  const f = fixture(); const client = await f.capture();
  const transforms = [
    (v) => ({ ...v, protocol: "sandbox-commerce-v2" }), (v) => ({ ...v, environment: "live" }),
    (v) => ({ ...v, command: "offer.read" }), (v) => ({ ...v, requestId: uuid(999) }),
    (v) => ({ ...v, actor: { ...v.actor, userId: B.userId } }),
    (v) => ({ ...v, actor: { ...v.actor, accountId: B.accountId } }),
    (v) => ({ ...v, actor: { ...v.actor, sessionGeneration: 17 } }),
    (v) => ({ ...v, actor: { ...v.actor, sessionGeneration: "18" } }),
    (v) => ({ ...v, data: { resource: { ...v.data.resource, id: uuid(10) } } }),
    (v) => ({ ...v, data: { resource: { ...v.data.resource, id: `scv1_resource_${uuid(999)}` } } }),
    (v) => ({ ...v, data: { resource: { ...v.data.resource, status: ["draft"] } } }),
    (v) => ({ ...v, data: { resource: { ...v.data.resource, signedUrl: "https://example.invalid/secret" } } }),
    (v) => ({ ...v, data: { resource: { ...v.data.resource, revision: 1.5 } } }),
    (v) => ({ ...v, financialAuthority: true }), () => null, () => [],
  ];
  for (const [index, transform] of transforms.entries()) {
    f.transform(transform); await assert.rejects(readResource(client, uuid(600 + index)), errorIs("invalid_response", "unknown"));
  }
  client.dispose();
});

test("synthetic receipts, purchase-derived grants and premature provider or delivery capabilities are rejected", async () => {
  const f = fixture(); const client = await f.capture();
  const cases = [
    ["receipt.read", { receiptId: ids.receipt }, (v) => ({ ...v, data: { ...v.data, receipt: { ...v.data.receipt, receiptType: "synthetic_offline" } } })],
    ["receipt.read", { receiptId: ids.receipt }, (v) => ({ ...v, data: { ...v.data, grantsAccess: true } })],
    ["checkout.read", { intentId: ids.intent }, (v) => ({ ...v, data: { intent: { ...v.data.intent, providerDispatchAllowed: true } } })],
    ["delivery.resolve", { resourceId: ids.resource, expectedRevision: 1 }, (v) => ({ ...v, data: { ...v.data, decision: "authorized", grantId: ids.grant } })],
  ];
  for (const [index, [command, payload, transform]] of cases.entries()) {
    f.transform(transform); await assert.rejects(client.request(command, uuid(700 + index), payload), errorIs("invalid_response", "unknown"));
  }
  client.dispose();
});

test("declaration eligibility is the server's current projection, including replay after a newer declaration", async () => {
  const f = fixture(); const client = await f.capture();
  const payload = { declared18Plus: false, countryCode: "US", regionCode: "CA", declarationVersion: "adult-us-creator-v1" };
  assert.equal((await client.request("creator.declare", uuid(740), payload)).data.eligible, false);
  // A later affirmative declaration can change current eligibility. Replaying
  // the old request must not overwrite it or infer authority from old payload.
  f.transform((value) => ({ ...value, data: { eligible: true } }));
  assert.equal((await client.request("creator.declare", uuid(740), payload)).data.eligible, true);
  client.dispose();
});

test("quarantined provider receipt remains visible evidence without access or a fabricated refund", async () => {
  const f = fixture(); const client = await f.capture();
  f.transform((value) => ({ ...value, data: { ...value.data, receipt: { ...value.data.receipt, status: "quarantined" } } }));
  const result = await client.request("receipt.read", uuid(750), { receiptId: ids.receipt });
  assert.equal(result.data.receipt.status, "quarantined");
  assert.equal(result.data.receipt.receiptType, "provider_verified");
  assert.equal(result.data.grantsAccess, false);
  client.dispose();
});

test("restore-only, invalid actor and stale-screen capture fail before auth reads", async () => {
  const f = fixture();
  for (const invalid of [{ ...A, restoreOnly: true }, { ...A, accountId: B.accountId }, { ...A, sessionGeneration: "1.5" }, { ...A, sessionGeneration: "9223372036854775808" }]) {
    await assert.rejects(f.api.captureIsolatedSandboxCommerceClient(invalid), errorIs("authority_retired", "not_dispatched"));
  }
  f.publish(B); await assert.rejects(f.capture(), errorIs("authority_retired", "not_dispatched"));
  assert.equal(f.calls.length, 0);
});

test("authority gap during token capture retires even when A returns before completion", async () => {
  const f = fixture(); const reached = deferred(); const resume = deferred();
  f.beforeSessionRead(async () => { reached.resolve(); await resume.promise; });
  const capture = f.capture(); await reached.promise;
  f.publish(null); f.publish(A); resume.resolve();
  await assert.rejects(capture, errorIs("authority_retired", "not_dispatched"));
  assert.equal(f.calls.filter((v) => v.url.endsWith("/isolated_sandbox_commerce_v1")).length, 0);
});

test("account switch after capture blocks dispatch, including A→B→A and restore quarantine", async () => {
  for (const replacement of [B, null, { ...A, restoreOnly: true }]) {
    const f = fixture(); const client = await f.capture(); const before = f.calls.length;
    f.publish(replacement); f.publish(A);
    await assert.rejects(readResource(client), errorIs("authority_retired", "not_dispatched", uuid(100)));
    assert.equal(f.calls.length, before); client.dispose();
  }
});

test("in-flight account change prevents stale result delivery and retains unknown outcome", async () => {
  for (const returnToA of [false, true]) {
    const f = fixture(); const client = await f.capture(); const reached = deferred(); const resume = deferred();
    f.beforeCommerce(async () => { reached.resolve(); await resume.promise; });
    const request = readResource(client); await reached.promise;
    f.publish(B); if (returnToA) f.publish(A); resume.resolve();
    await assert.rejects(request, errorIs("authority_retired", "unknown", uuid(100)));
    assert.equal(f.calls[1].headers.Authorization, `Bearer frozen-fixture-token-${A.userId}`);
    client.dispose();
  }
});

test("HTTP rejection differs from ambiguous gateway and unreadable success; no automatic retry", async () => {
  const cases = [
    [() => Response.json({ code: "42501", message: "forbidden" }, { status: 403 }), "transport_rejected", "rejected"],
    [() => Response.json({ code: "42501", message: "gateway" }, { status: 502 }), "outcome_unknown", "unknown"],
    [() => new Response("invalid JSON", { status: 200 }), "outcome_unknown", "unknown"],
    [() => { throw new Error("disconnected"); }, "outcome_unknown", "unknown"],
  ];
  for (const [response, code, outcome] of cases) {
    const f = fixture(); const client = await f.capture(); f.rawResponse(response);
    await assert.rejects(readResource(client), errorIs(code, outcome, uuid(100)));
    assert.equal(f.calls.length, 2); client.dispose();
  }
});

test("display deadline cannot release actual transport or admit an overlapping same-ID request", async () => {
  const f = fixture(); const client = await f.capture(); const reached = deferred(); const resume = deferred();
  f.beforeCommerce(async () => { reached.resolve(); await resume.promise; }); f.expireRead();
  let settled = false;
  const pending = readResource(client).finally(() => { settled = true; });
  await reached.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  await assert.rejects(readResource(client), errorIs("request_conflict", "not_dispatched"));
  assert.equal(f.calls.length, 2);
  resume.resolve(); assert.equal((await pending).status, "ok"); client.dispose();
});

test("a retry rejection cannot erase an earlier unknown request outcome; only an exact valid response resolves it", async () => {
  const f = fixture(); const client = await f.capture();
  f.rawResponse(() => new Response("gateway", { status: 502 }));
  await assert.rejects(readResource(client), errorIs("outcome_unknown", "unknown"));
  f.rawResponse(() => Response.json({ code: "55P03", message: "sandbox_request_busy" }, { status: 409 }));
  await assert.rejects(readResource(client), errorIs("outcome_unknown", "unknown"));
  f.rawResponse(null);
  assert.equal((await readResource(client)).status, "ok");
  f.rawResponse(() => Response.json({ code: "42501", message: "forbidden" }, { status: 403 }));
  await assert.rejects(readResource(client, uuid(999)), errorIs("transport_rejected", "rejected"));
  client.dispose();
});

test("request IDs cannot be repurposed or dispatched concurrently; payload and captured actor cannot be changed", async () => {
  const f = fixture(); const expected = { ...A }; const client = await f.api.captureIsolatedSandboxCommerceClient(expected);
  expected.userId = B.userId;
  const reached = deferred(); const resume = deferred();
  f.beforeCommerce(async () => { reached.resolve(); await resume.promise; });
  const payload = { resourceId: ids.resource }; const pending = client.request("resource.read", uuid(900), payload);
  await reached.promise; payload.resourceId = `scv1_resource_${uuid(999)}`;
  await assert.rejects(readResource(client, uuid(900)), errorIs("request_conflict", "not_dispatched"));
  resume.resolve(); const result = await pending; assert.equal(result.data.resource.id, ids.resource);
  await assert.rejects(client.request("offer.read", uuid(900), { offerId: ids.offer }), errorIs("request_conflict", "not_dispatched"));
  const before = f.calls.length; client.dispose(); await assert.rejects(readResource(client), errorIs("authority_retired", "not_dispatched"));
  assert.equal(f.calls.length, before);
});

// The native DB harness may write real RPC outputs to this contract file. This
// optional bridge is not provider/device evidence and does not query a DB.
test("native PostgreSQL command outputs satisfy the real client contract for every product mode", {
  skip: !process.env.ISOLATED_SANDBOX_COMMAND_FIXTURE,
}, async () => {
  const saved = JSON.parse(fs.readFileSync(process.env.ISOLATED_SANDBOX_COMMAND_FIXTURE, "utf8"));
  assert.equal(saved.protocol, "sandbox-commerce-v1");
  assert.ok(Array.isArray(saved.cases) && saved.cases.length > 0);
  const f = fixture(saved.actor); const client = await f.capture(); const authoredKinds = new Set();
  try {
    for (const row of saved.cases) {
      f.transform(() => row.response);
      const result = await client.request(row.command, row.requestId, row.payload);
      assert.deepEqual(clone(result), row.response);
      if (row.command === "resource.create" && result.status === "ok") authoredKinds.add(result.data.resource.kind);
    }
    assert.deepEqual([...authoredKinds].sort(), [...f.api.ISOLATED_SANDBOX_PRODUCT_KINDS].sort());
  } finally { client.dispose(); }
});
