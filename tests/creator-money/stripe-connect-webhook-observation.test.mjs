import assert from "node:assert/strict";
import test from "node:test";
import { deferred } from "../helpers/studio-source-harness.mjs";
import { account, connect, creator, load } from "./stripe-connect-observed-fixture.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const events = [], accounts = [{ id: "row-synthetic", creator_user_id: creator, provider: "stripe_connect", provider_environment: "test",
    provider_account_id: account().id, provider_configuration_observed_at: null }];
  const client = { from(table) {
    const rows = table === "creator_payout_accounts" ? accounts : table === "creator_payout_provider_webhook_events" ? events : null;
    assert.ok(rows, `unexpected direct table ${table}`);
    let operation = "select", values, filters = [];
    const q = { select: () => q, eq: (key, value) => { filters.push(row => row[key] === value); return q; },
      is: (key, value) => { filters.push(row => (row[key] ?? null) === value); return q; },
      in: (key, values) => { filters.push(row => values.includes(row[key])); return q; },
      insert: value => { operation = "insert"; values = value; return q; }, update: value => { operation = "update"; values = value; return q; },
      execute() {
        if (operation === "insert") {
          if (rows.some(row => table === "creator_payout_accounts" ? row.creator_user_id === values.creator_user_id : row.event_id === values.event_id)) return { data: null, error: { code: "23505", message: "duplicate" } };
          const row = { ...clone(values), id: `synthetic-${rows.length}` }; rows.push(row); return { data: [clone(row)], error: null };
        }
        const matching = rows.filter(row => filters.every(filter => filter(row)));
        if (operation === "update") matching.forEach(row => Object.assign(row, clone(values)));
        return { data: clone(matching), error: null };
      },
      async single() { const r = q.execute(); return { data: r.data?.[0] ?? null, error: r.error || (r.data?.length !== 1 ? { message: "observation compare-and-set conflict" } : null) }; },
      async maybeSingle() { const r = q.execute(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then(resolve, reject) { return Promise.resolve(q.execute()).then(resolve, reject); },
    }; return q;
  } };
  let handler, current = account(), retrieval = async () => clone(current), readCount = 0;
  const api = { ...connect, createAdminClient: () => ({ configured: true, client }),
    readStripeWebhookSecret: () => ({ configured: true, secret: "synthetic" }),
    verifyStripeWebhookSignature: async () => true,
    readStripeTestSecret: () => ({ configured: true, secret: "synthetic" }),
    retrieveStripeConnectAccount: async (_secret, id) => { readCount++; assert.equal(id, account().id); return retrieval(); },
    writeAuditLog: async () => null, safeWriteAuditLog: async () => null,
  };
  load("supabase/functions/stripe-connect-webhook/index.ts", {
    "jsr:@supabase/functions-js/edge-runtime.d.ts": {}, "../_shared/stripe-connect.ts": api,
  }, { Deno: { serve: callback => { handler = callback; } } });
  return { accounts, events, client, current: value => { current = value; }, retrieval: fn => { retrieval = fn; }, reads: () => readCount,
    request: async (id = "evt_synthetic", changes = {}) => {
      const response = await handler(new Request("https://synthetic.test/webhook", { method: "POST", body: JSON.stringify({
        id, type: "account.updated", livemode: false, account: account().id, data: { object: account() }, ...changes,
      }) }));
      return { code: response.status, body: await response.json() };
    } };
}

test("reordered account snapshots read current provider configuration and unknown fields remain unknown", async () => {
  const h = fixture(), mismatch = account(); mismatch.controller.stripe_dashboard.type = "none"; mismatch.controller.requirement_collection = "application";
  h.current(mismatch);
  const result = await h.request();
  assert.equal(result.code, 200); assert.equal(result.body.account.provider_configuration.status, "mismatch");
  assert.equal(h.accounts[0].provider_dashboard_type, "none"); assert.equal(h.accounts[0].provider_ready, undefined);
  assert.equal(h.events[0].status, "processed");
  const reads = h.reads(); assert.equal((await h.request()).body.status, "duplicate"); assert.equal(h.reads(), reads);
  h.current(account({ controller: undefined }));
  assert.equal((await h.request("evt_synthetic_unknown")).body.account.provider_configuration.status, "unknown");
  assert.equal(h.accounts[0].provider_dashboard_type, "unknown");
});

test("failed provider read retains a retryable receipt and retry uses exact event/account/type/environment binding", async () => {
  const h = fixture(); h.retrieval(async () => { throw new Error("synthetic read unavailable"); });
  assert.equal((await h.request()).code, 500); assert.equal(h.events[0].status, "failed");
  assert.equal(h.accounts[0].provider_configuration_observed_at, null);
  h.retrieval(async () => account());
  for (const changes of [{ type: "payout.paid" }, { account: "acct_wrong" }, { livemode: true }]) {
    const result = await h.request("evt_synthetic", changes);
    assert.ok(result.code !== 200 || result.body.status === "ignored");
    assert.equal(h.events[0].status, "failed");
  }
  assert.equal((await h.request()).code, 200); assert.equal(h.events[0].status, "processed");
});

test("concurrent same-event CAS loser cannot demote a processed receipt or overwrite newer observation", async () => {
  const h = fixture(), gate = deferred(); let reads = 0;
  const mismatch = account(); mismatch.controller.stripe_dashboard.type = "none";
  h.retrieval(async () => ++reads === 1 ? gate.promise : mismatch);
  const first = h.request(); while (reads === 0) await Promise.resolve();
  assert.equal((await h.request()).code, 200);
  assert.equal(h.events[0].status, "processed");
  gate.resolve(account()); assert.equal((await first).code, 500);
  assert.equal(h.events[0].status, "processed"); assert.equal(h.accounts[0].provider_dashboard_type, "none");
});

test("separate stale-event CAS failure remains retryable and fetches fresh state on retry", async () => {
  const h = fixture(), gate = deferred(); let reads = 0;
  const mismatch = account(); mismatch.controller.requirement_collection = "application";
  h.retrieval(async () => ++reads === 1 ? gate.promise : mismatch);
  const first = h.request("evt_older"); while (reads === 0) await Promise.resolve();
  assert.equal((await h.request("evt_newer")).code, 200); gate.resolve(account());
  assert.equal((await first).code, 500); assert.equal(h.events.find(row => row.event_id === "evt_older").status, "failed");
  assert.equal((await h.request("evt_older")).code, 200);
  assert.equal(h.accounts[0].provider_requirements_collection, "platform");
  assert.equal(h.events.find(row => row.event_id === "evt_older").status, "processed");
});
