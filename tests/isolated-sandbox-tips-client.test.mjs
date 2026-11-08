import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";
import { invokeAccountBoundSupabaseRpc, isAccountBoundSupabaseRpcOutcomeAmbiguous } from "../_lib/accountBoundSupabaseRpc.mjs";
const ts = createRequire(import.meta.url)("typescript");
const uuid = n => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), state: "ACTIVE", restoreOnly: false };
const B = { ...A, userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4) };
const actor = ({ userId, accountId, sessionGeneration }) => ({ userId, accountId, sessionGeneration });
const id = kind => `scv1_${kind}_${uuid(10)}`;
const createdAt = "2026-11-07T10:00:00+00:00";
const clone = value => JSON.parse(JSON.stringify(value));
const offer = { id: id("offer"), resourceId: id("resource"), creatorId: A.userId, kind: "creator_tip", title: "Support", revision: 1, resourceRevision: 1, status: "published", amountMinor: 199, currency: "usd", createdAt, available: true, checkoutConnected: false };
const resource = { id: id("resource"), creatorId: A.userId, kind: "creator_tip", title: "Support", revision: 1, status: "published", createdAt, offers: [offer], offersNextCursor: null, offersTruncated: false };
const receipt = { id: id("receipt"), intentId: id("intent"), status: "verified", receiptType: "provider_verified", purchasedAt: createdAt, amountMinor: 199, currency: "usd", grantsAccess: false, notPayable: true };
const entry = { id: id("intent"), offerId: id("offer"), offerRevision: 1, resourceId: id("resource"), resourceRevision: 1, creatorId: A.userId, kind: "creator_tip", amountMinor: 199, currency: "usd", status: "verified", createdAt, expiresAt: "2026-11-07T10:05:00+00:00", originalSessionMatchesCurrent: true, dispatchState: "bound", receipt, abandonment: null, providerDispatchAllowed: false, noDispatchProven: false };
const capability = { generationState: "active", canAuthor: true, creatorEligible: true, creatorReason: "eligible", canReadHistory: true, canRetireOwnOffers: true, checkoutConnected: false, declaration: null };
function load(path, bindings) {
  const context = { exports: {}, crypto: webcrypto, require(name) { assert.ok(name in bindings, `Unmodeled dependency ${name}`); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context, { filename: path });
  return context.exports;
}
function fixture(initial = A) {
  let session = initial; let transform = value => value; let before = async () => {}; const calls = [];
  const supabase = { SUPABASE_URL: "https://isolated-fixture.invalid", SUPABASE_ANON_KEY: "fixture-public-key", supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: session.userId }, access_token: `fixture-${session.sessionGeneration}` } } }) } } };
  const deadline = { withAuthorityReadDeadline: async operation => await operation };
  const authority = load("../_lib/accountSessionAuthority.ts", { "./supabase": supabase, "./entitlementAuthority": deadline }); authority.publishAccountSessionAuthoritySnapshot(initial);
  const transport = { isAccountBoundSupabaseRpcOutcomeAmbiguous, invokeAccountBoundSupabaseRpc: args => invokeAccountBoundSupabaseRpc({ ...args, fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body, headers: init.headers });
    if (url.endsWith("/wave1_session_authority_readback")) return Response.json({ ...session, authoritative: true });
    assert.ok(url.endsWith(body.p_command === "checkout.prepare" ? "/isolated_sandbox_commerce_v1" : "/isolated_sandbox_tips_v1")); await before();
    const payload = body.p_payload;
    const data = { "capability.read": capability, "studio.read": { resources: [resource], nextCursor: null, catalog: [{ kind: "creator_tip", amountMinor: 199, currency: "usd", publicationAvailable: true, checkoutConnected: false }], catalogTruncated: false }, "offers.read": { resourceId: resource.id, offers: [offer], nextCursor: null }, "offer.read": { offer }, "history.read": { role: payload.role, items: [entry], nextCursor: null }, "status.read": { entry }, "request.read": { resolution: "unknown", originalRequestId: payload.originalRequestId, recordedCommand: null, recordedSessionId: null, recordedPayload: null, resource: null, offer: null, entry: null, declaration: null, retryAllowed: false, noDispatchProven: false }, "offer.retire": { offer: { ...offer, status: "retired", available: false } } }[body.p_command];
    const prepared = body.p_command === "checkout.prepare" ? { intent: { id: id("intent"), offerId: payload.offerId, resourceId: id("resource"), kind: "creator_tip", status: "prepared", providerDispatchAllowed: false } } : data;
    return Response.json(transform(clone({ protocol: "sandbox-commerce-v1", environment: "sandbox", command: body.p_command, requestId: payload.requestId, actor: { userId: body.p_expected_account_id, accountId: body.p_expected_account_id, sessionGeneration: body.p_expected_session_generation }, status: "ok", data: prepared })));
  } }) };
  const bindings = { "./accountSessionAuthority": authority, "./accountBoundSupabaseRpc.mjs": transport, "./supabase": supabase, "react-native": { Platform: { OS: "ios" } }, "./entitlementAuthority": deadline };
  const mutation = load("../_lib/accountBoundSupabaseMutation.ts", bindings);
  const commerce = load("../_lib/isolatedSandboxCommerce.ts", { ...bindings, "./accountBoundSupabaseMutation": mutation });
  const api = load("../_lib/isolatedSandboxTips.ts", { ...bindings, "react-native-get-random-values": {}, "./accountBoundSupabaseMutation": mutation, "./isolatedSandboxCommerce": commerce });
  return { api, calls, capture: () => api.captureIsolatedTipClient(session), change(next) { session = next; authority.publishAccountSessionAuthoritySnapshot(next); }, transform(fn) { transform = fn; }, before(fn) { before = fn; } };
}
const envelope = (command, data, requestId = uuid(100), subject = actor(A)) => ({ protocol: "sandbox-commerce-v1", environment: "sandbox", command, requestId, actor: subject, status: "ok", data });

test("dedicated reads use real account-bound capture and raw RPC transport with exact token/session", async () => {
  const f = fixture(); const client = await f.capture();
  const result = await client.request("history.read", uuid(100), { role: "buyer", cursor: null, limit: 20 });
  const call = f.calls.at(-1);
  assert.equal(call.url, "https://isolated-fixture.invalid/rest/v1/rpc/isolated_sandbox_tips_v1");
  assert.equal(call.headers.Authorization, `Bearer fixture-${A.sessionGeneration}`);
  assert.deepEqual(call.body, { p_command: "history.read", p_payload: { protocol: "sandbox-commerce-v1", requestId: uuid(100), role: "buyer", cursor: null, limit: 20 }, p_expected_account_id: A.userId, p_expected_session_generation: A.sessionGeneration });
  assert.equal(result.data.items[0].receipt.grantsAccess, false); assert.ok(Object.isFrozen(result.data.items[0].receipt));
  assert.equal(f.calls.some(call => /premium|purchaseStore|restore/u.test(call.url)), false); client.dispose();
});
test("all read surfaces and offer retirement accept exact current source contract", async () => {
  const f = fixture(); const client = await f.capture();
  for (const [command, payload] of Object.entries({ "capability.read": {}, "studio.read": { cursor: null, limit: 20 }, "offers.read": { resourceId: resource.id, cursor: null, limit: 20 }, "offer.read": { offerId: offer.id }, "history.read": { role: "creator", cursor: null, limit: 20 }, "status.read": { intentId: entry.id, receiptId: null }, "request.read": { originalRequestId: uuid(99) }, "offer.retire": { offerId: offer.id, expectedRevision: 1 } })) assert.equal((await client.request(command, f.api.newTipRequestId(), payload)).status, "ok");
  client.dispose();
});
test("Free buyer preparation uses the commerce RPC with the captured account and never dispatches a provider", async () => {
  const f = fixture(B); const client = await f.capture();
  const result = await client.prepareCheckout(uuid(210), { offerId: offer.id, expectedRevision: 1 });
  const call = f.calls.at(-1);
  assert.equal(call.url, "https://isolated-fixture.invalid/rest/v1/rpc/isolated_sandbox_commerce_v1");
  assert.equal(call.body.p_command, "checkout.prepare"); assert.equal(call.body.p_expected_account_id, B.userId);
  assert.equal(call.headers.Authorization, `Bearer fixture-${B.sessionGeneration}`);
  assert.equal(result.data.intent.providerDispatchAllowed, false); assert.equal(result.data.intent.status, "prepared");
  assert.ok(f.calls.every(item => !/begin_dispatch|bind_dispatch|restore|purchaseStore/u.test(item.url)));
  client.dispose();
});
test("buyer preparation rejects injected fields before transport and non-tip or dispatch-capable responses", async () => {
  const f = fixture(B); const client = await f.capture(); const before = f.calls.length;
  for (const payload of [{ offerId: uuid(10), expectedRevision: 1 }, { offerId: offer.id, expectedRevision: 0 }, { offerId: offer.id, expectedRevision: 1, dispatchAllowed: true }])
    await assert.rejects(client.prepareCheckout(f.api.newTipRequestId(), payload), error => error.code === "invalid_request" && error.outcome === "not_dispatched");
  assert.equal(f.calls.length, before);
  for (const change of [value => { value.data.intent.kind = "paid_content"; }, value => { value.data.intent.providerDispatchAllowed = true; }, value => { value.actor.sessionGeneration = A.sessionGeneration; }]) {
    f.transform(value => { change(value); return value; });
    await assert.rejects(client.prepareCheckout(f.api.newTipRequestId(), { offerId: offer.id, expectedRevision: 1 }), error => error.code === "invalid_response" && error.outcome === "unknown");
  }
  client.dispose();
});
test("buyer preparation stays unknown after A to B to A and the old client cannot prepare again", async () => {
  const f = fixture(); const client = await f.capture(); let resolve; const pending = new Promise(done => { resolve = done; });
  f.before(() => pending); const result = client.prepareCheckout(uuid(220), { offerId: offer.id, expectedRevision: 1 });
  f.change(B); f.change(A); resolve();
  await assert.rejects(result, error => error.code === "authority_retired" && error.outcome === "unknown");
  const sent = f.calls.length;
  await assert.rejects(client.prepareCheckout(uuid(221), { offerId: offer.id, expectedRevision: 1 }), error => error.code === "authority_retired" && error.outcome === "not_dispatched");
  assert.equal(f.calls.length, sent); client.dispose();
});
test("A to B to A retires the old client permanently including an outstanding read", async () => {
  const f = fixture(); const client = await f.capture(); let resolve; const pending = new Promise(done => { resolve = done; }); f.before(() => pending);
  const result = client.request("capability.read", uuid(100), {}); f.change(B); f.change(A); resolve();
  await assert.rejects(result, error => error.code === "authority_retired");
  await assert.rejects(client.request("capability.read", uuid(101), {}), error => error.code === "authority_retired" && error.outcome === "not_dispatched");
  f.before(async () => {}); const fresh = await f.capture(); assert.equal((await fresh.request("capability.read", uuid(102), {})).status, "ok"); fresh.dispose(); client.dispose();
});
test("strict envelope rejects wrong actor/session, payment continuation and synthetic or money-bearing receipt", async () => {
  const f = fixture(); const client = await f.capture();
  const changes = [v => { v.actor.userId = B.userId; }, v => { v.actor.sessionGeneration = B.sessionGeneration; }, v => { v.environment = "live"; }, v => { v.data.entry.providerDispatchAllowed = true; }, v => { v.data.entry.receipt.receiptType = "synthetic_offline"; }, v => { v.data.entry.receipt.grantsAccess = true; }, v => { v.data.entry.receipt.notPayable = false; }, v => { v.data.entry.receipt.amountMinor += 1; }, v => { v.data.entry.checkoutUrl = "https://checkout.stripe.com/fake"; }];
  for (const change of changes) { f.transform(value => { change(value); return value; }); await assert.rejects(client.request("status.read", f.api.newTipRequestId(), { intentId: entry.id, receiptId: null }), error => error.code === "invalid_response"); }
  client.dispose();
});
test("missing recovery is unknown; it cannot prove no dispatch or authorize retry", async () => {
  const f = fixture(); const client = await f.capture(); const result = await client.request("request.read", uuid(100), { originalRequestId: uuid(200) });
  assert.equal(result.data.resolution, "unknown"); assert.equal(result.data.retryAllowed, false); assert.equal(result.data.noDispatchProven, false);
  for (const key of ["retryAllowed", "noDispatchProven"]) { f.transform(value => { value.data[key] = true; return value; }); await assert.rejects(client.request("request.read", f.api.newTipRequestId(), { originalRequestId: uuid(200) }), /invalid_response/u); }
  assert.ok(f.calls.filter(call => !call.url.endsWith("wave1_session_authority_readback")).every(call => call.body.p_command === "request.read")); client.dispose();
});
test("plain UUID stable cursor must refer to exact last row, duplicate and wrong-owner pages reject", () => {
  const f = fixture(); const payload = { role: "creator", cursor: null, limit: 20 };
  const page = { role: "creator", items: [clone(entry)], nextCursor: { asOf: "2026-11-07T11:00:00Z", createdAt, id: uuid(10) } };
  f.api.parseIsolatedTipResult(envelope("history.read", page), "history.read", uuid(100), payload, actor(A));
  for (const change of [value => { value.items.push(clone(entry)); }, value => { value.items[0].creatorId = B.userId; }, value => { value.nextCursor.id = entry.id; }, value => { value.nextCursor.id = uuid(11); }]) { const altered = clone(page); change(altered); assert.throws(() => f.api.parseIsolatedTipResult(envelope("history.read", altered), "history.read", uuid(100), payload, actor(A)), /invalid_response/u); }
});
test("retained refunded and reviewed receipts remain separate from payment/access success", () => {
  const f = fixture();
  for (const status of ["verified", "refunded", "revoked", "quarantined"]) { const item = clone(entry); item.receipt.status = status; const result = f.api.parseIsolatedTipResult(envelope("status.read", { entry: item }), "status.read", uuid(100), { intentId: entry.id, receiptId: null }, actor(A)); assert.equal(result.data.entry.receipt.status, status); assert.equal(result.data.entry.providerDispatchAllowed, false); }
  const redacted = { ...entry, status: "abandoned", receipt: null, dispatchState: "not_recorded", originalSessionMatchesCurrent: false };
  f.api.parseIsolatedTipResult(envelope("history.read", { role: "creator", items: [redacted], nextCursor: null }), "history.read", uuid(100), { role: "creator", cursor: null, limit: 20 }, actor(A));
});
test("legacy IDs, unknown request keys and unsafe status selectors never dispatch", async () => {
  const f = fixture(); const client = await f.capture(); const count = f.calls.length;
  for (const [command, payload] of [["offer.read", { offerId: uuid(10) }], ["capability.read", { enabled: true }], ["status.read", { intentId: entry.id, receiptId: receipt.id }], ["history.read", { role: "buyer", cursor: null, limit: 51 }]]) await assert.rejects(client.request(command, f.api.newTipRequestId(), payload), error => error.code === "invalid_request");
  assert.equal(f.calls.length, count); client.dispose();
});
test("found recovery binds exactly one projection to the recorded command and original immutable quote", () => {
  const f = fixture(); const original = uuid(200); const payload = { originalRequestId: original };
  const data = { resolution: "found", originalRequestId: original, recordedCommand: "checkout.prepare", recordedSessionId: A.sessionGeneration,
    recordedPayload: { protocol: "sandbox-commerce-v1", requestId: original, offerId: offer.id, expectedRevision: 1 }, resource: null, offer: null, entry: clone(entry), declaration: null, retryAllowed: false, noDispatchProven: false };
  f.api.parseIsolatedTipResult(envelope("request.read", clone(data)), "request.read", uuid(100), payload, actor(A));
  for (const change of [value => { value.entry.offerId = `scv1_offer_${uuid(11)}`; }, value => { value.resource = clone(resource); }, value => { value.recordedCommand = "resource.create"; value.recordedPayload = { protocol: "sandbox-commerce-v1", requestId: original, kind: "creator_tip", title: "A draft" }; }]) {
    const altered = clone(data); change(altered); assert.throws(() => f.api.parseIsolatedTipResult(envelope("request.read", altered), "request.read", uuid(100), payload, actor(A)), /invalid_response/u);
  }
});
test("keyset pages advance strictly even within one PostgreSQL millisecond", () => {
  const f = fixture(); const cursor = { asOf: "2026-11-07T11:00:00Z", createdAt: "2026-11-07T10:00:00.000005Z", id: uuid(30) };
  const payload = { role: "creator", cursor, limit: 20 };
  const valid = { ...clone(entry), createdAt: "2026-11-07T10:00:00.000004Z" };
  const check = items => f.api.parseIsolatedTipResult(envelope("history.read", { role: "creator", items, nextCursor: null }), "history.read", uuid(100), payload, actor(A));
  check([clone(valid)]);
  assert.throws(() => check([{ ...clone(valid), createdAt: "2026-11-07T10:00:00.000006Z" }]), /invalid_response/u);
  assert.throws(() => check([clone(valid), { ...clone(valid), id: `scv1_intent_${uuid(11)}` }]), /invalid_response/u);
});

test("nested offer pages are owner/resource bound and advance the exact preview cursor", () => {
  const f = fixture(); const cursor = { asOf: "2026-11-07T11:00:00Z", createdAt, id: uuid(20) };
  const payload = { resourceId: resource.id, cursor, limit: 20 }; const data = { resourceId: resource.id, offers: [clone(offer)], nextCursor: null };
  f.api.parseIsolatedTipResult(envelope("offers.read", clone(data)), "offers.read", uuid(100), payload, actor(A));
  for (const change of [value => { value.resourceId = `scv1_resource_${uuid(99)}`; }, value => { value.offers[0].resourceId = `scv1_resource_${uuid(99)}`; }, value => { value.offers[0].creatorId = B.userId; }, value => { value.offers[0].id = `scv1_offer_${uuid(21)}`; }, value => { value.offers[0].checkoutConnected = true; }]) {
    const altered = clone(data); change(altered); assert.throws(() => f.api.parseIsolatedTipResult(envelope("offers.read", altered), "offers.read", uuid(100), payload, actor(A)), /invalid_response/u);
  }
});
test("resource preview is bounded and cannot omit or contradict its continuation", () => {
  const f = fixture(); const offers = Array.from({ length: 10 }, (_, n) => ({ ...clone(offer), id: `scv1_offer_${uuid(30 - n)}` }));
  const preview = { ...clone(resource), offers, offersNextCursor: { asOf: "2026-11-07T11:00:00Z", createdAt, id: uuid(21) }, offersTruncated: true };
  const payload = { cursor: null, limit: 20 }; const data = { resources: [preview], nextCursor: null, catalog: [], catalogTruncated: false };
  f.api.parseIsolatedTipResult(envelope("studio.read", clone(data)), "studio.read", uuid(100), payload, actor(A));
  for (const change of [value => { value.offersTruncated = false; }, value => { delete value.offersNextCursor; }, value => { value.offersNextCursor.id = uuid(22); }, value => { value.offers.push({ ...clone(offer), id: `scv1_offer_${uuid(20)}` }); }, value => { value.offers.reverse(); }]) {
    const altered = clone(data); change(altered.resources[0]); assert.throws(() => f.api.parseIsolatedTipResult(envelope("studio.read", altered), "studio.read", uuid(100), payload, actor(A)), /invalid_response/u);
  }
});
const nativeFixturePath = process.env.ISOLATED_TIPS_NATIVE_FIXTURES ?? process.env.ISOLATED_SANDBOX_TIPS_FIXTURE;
if (nativeFixturePath) test("current real local PostgreSQL responses pass the strict client parser", () => {
  const fixtureData = JSON.parse(fs.readFileSync(nativeFixturePath, "utf8"));
  const records = Array.isArray(fixtureData) ? fixtureData : fixtureData.cases; const f = fixture();
  assert.ok(Array.isArray(records) && records.length > 0);
  const failures = [];
  for (const [index, item] of records.entries()) {
    const { protocol: _protocol, requestId: payloadRequestId, ...payload } = item.payload;
    try { f.api.parseIsolatedTipResult(item.response, item.command, item.requestId ?? payloadRequestId, payload, item.actor ?? item.response.actor); }
    catch (error) { failures.push(`Native fixture ${index} ${item.command}: ${error.message}`); }
  }
  assert.deepEqual(failures, []);
  assert.ok(records.length >= 30, "Native bridge must include current capability, history, recovery and lifecycle cases");
});
if (process.env.ISOLATED_SANDBOX_COMMAND_FIXTURE) test("actual PostgreSQL Free buyer preparation passes captured transport without provider continuation", async () => {
  const saved = JSON.parse(fs.readFileSync(process.env.ISOLATED_SANDBOX_COMMAND_FIXTURE, "utf8"));
  assert.ok(Array.isArray(saved.checkoutCases) && saved.checkoutCases.length > 0, "Need actual successful buyer preparation captures");
  for (const item of saved.checkoutCases) {
    assert.equal(item.command, "checkout.prepare"); assert.equal(item.response.status, "ok");
    assert.notEqual(item.actor.userId, item.quote.creatorId);
    const f = fixture(item.actor); const client = await f.capture(); f.transform(() => clone(item.response));
    try { const result = await client.prepareCheckout(item.requestId, item.payload); assert.deepEqual(clone(result), item.response); assert.equal(result.data.intent.providerDispatchAllowed, false); }
    finally { client.dispose(); }
  }
});
