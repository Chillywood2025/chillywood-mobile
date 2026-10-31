import assert from "node:assert/strict";
import { createHash, createHmac, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loadStudioFunctions } from "../helpers/studio-source-harness.mjs";
import { loadPureTypeScriptModule } from "../helpers/pure-typescript-module.mjs";
const { googlePlayStripeTaxEvidence } = loadPureTypeScriptModule("supabase/functions/_shared/google-play-stripe-tax-evidence.ts");

const file = "supabase/functions/stripe-tip-webhook/index.ts";
const source = readFileSync(file, "utf8");
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const code = ts.transpileModule(
  ast.statements.filter((node) => !ts.isImportDeclaration(node))
    .map((node) => node.getText(ast)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

const tipId = "ec000000-0000-4000-8000-000000000001";
const buyerId = "ec000000-0000-4000-8000-000000000002";
const creatorId = "ec000000-0000-4000-8000-000000000003";
const rowId = "ec000000-0000-4000-8000-000000000004";
const secret = "whsec_synthetic_tip_settlement_fixture";
const copy = (value) => structuredClone(value);
const metadata = { chillywood_tip_id: tipId, fan_user_id: buyerId, creator_user_id: creatorId };
const checkoutObject = (changes = {}) => ({
  id: "cs_test_settlement", object: "checkout.session", livemode: false,
  mode: "payment", status: "complete", payment_status: "paid",
  client_reference_id: tipId, payment_intent: "pi_settlement",
  amount_total: 499, currency: "usd", metadata: copy(metadata), ...changes,
});
const intentObject = (changes = {}) => ({
  id: "pi_settlement", object: "payment_intent", livemode: false,
  status: "succeeded", amount: 499, amount_received: 499,
  currency: "usd", metadata: copy(metadata), ...changes,
});
const stripeEvent = (type = "checkout.session.completed", object = checkoutObject(), changes = {}) => ({
  id: "evt_tip_settlement", type, livemode: false, data: { object }, ...changes,
});
const projection = (changes = {}) => ({
  tipId, updated: true, reason: "tip_updated", buyerAuthorityValid: true,
  compensationRequired: false, webhookFinalized: true, ...changes,
});

function harness(options = {}) {
  let handler;
  let claimCount = 0;
  let tip = {
    id: tipId, sender_id: buyerId, creator_id: creatorId,
    tip_amount_cents: 499, total_paid_cents: 499, currency: "usd",
    provider: "stripe_connect", provider_environment: "test",
    provider_checkout_session_id: "cs_test_settlement",
    provider_payment_intent_id: "pi_settlement", ...options.tip,
  };
  const state = { disposition: "claimed", projection: projection(), projectionError: null, ...options };
  const rpcCalls = [], reads = [], inserts = [], audits = [], envReads = [];
  const env = { STRIPE_TIP_WEBHOOK_SECRET: secret, ...options.env };
  const admin = {
    from(table) {
      if (table === "creator_tip_events") return {
        async insert(value) { inserts.push({ table, value: copy(value) }); return { error: null }; },
      };
      // Callback settlement must not reread gates admitting new purchases.
      assert.equal(table, "creator_tip_transactions", `unexpected callback table ${table}`);
      const filters = [];
      let columns;
      const query = {
        select(value) { columns = value; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        async maybeSingle() {
          reads.push({ table, columns, filters: copy(filters) });
          const match = tip && filters.every(([key, value]) => tip[key] === value);
          return { data: match ? copy(columns === "id" ? { id: tip.id } : tip) : null, error: null };
        },
      };
      return query;
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args: copy(args) });
      if (name === "reserve_stripe_tip_webhook_event") {
        const claimed = state.disposition === "claimed";
        return { data: {
          disposition: state.disposition, rowId, claimAcquired: claimed,
          processingAttemptId: claimed ? args.p_processing_attempt_id : null,
          retry: claimCount++ > 0,
        }, error: null };
      }
      if (name === "process_stripe_tip_webhook_lifecycle") {
        // This is only the SQL IO boundary. Database authority and transaction
        // semantics are exercised by the separate PostgreSQL fixture suite.
        return { data: copy(state.projection), error: state.projectionError };
      }
      if (name === "finalize_stripe_tip_webhook_event") {
        return { data: { rowId, status: args.p_status }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const Deno = {
    env: { get(key) { envReads.push(key); return env[key]; } },
    serve(value) { handler = value; },
  };
  const globals = { Response, Request, TextEncoder, Date, Error, crypto: webcrypto, Deno, googlePlayStripeTaxEvidence };
  const shared = loadStudioFunctions("supabase/functions/_shared/stripe-connect.ts", [
    "JSON_HEADERS", "DB_PROVIDER", "RESPONSE_PROVIDER", "PROVIDER_ENVIRONMENT",
    "toText", "jsonResponse", "optionsResponse", "sanitizeErrorMessage", "notConfiguredPayload",
    "readOptionalEnv", "readStripeWebhookSecret", "parseStripeEvent",
    "hexToBytes", "timingSafeEqualHex", "verifyStripeWebhookSignature",
  ], { ...globals });
  const settlement = loadStudioFunctions("supabase/functions/_shared/stripe-payment-settlement.ts", [
    "positiveMinorAmount", "checkoutSettlementOutcome", "paymentIntentSettlementOutcome",
  ], {});
  vm.runInNewContext(code, {
    ...globals, ...shared, ...settlement,
    createAdminClient: () => ({ configured: true, client: admin }),
    safeWriteAuditLog: async (_client, value) => { audits.push(copy(value)); },
    fetch: () => { throw new Error("Callback attempted unexpected provider IO"); },
  }, { filename: file });
  assert.equal(typeof handler, "function");
  return {
    rpcCalls, reads, inserts, audits, envReads, settlement,
    set(changes) { Object.assign(state, changes); },
    setTip(changes) { tip = { ...tip, ...changes }; },
    calls(name) { return rpcCalls.filter((call) => call.name === name); },
    async run(event = stripeEvent(), requestOptions = {}) {
      const body = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
      const response = await handler(new Request("https://local.invalid/tip-webhook", {
        method: "POST", body,
        headers: { "stripe-signature": requestOptions.signature ?? `t=${timestamp},v1=${signature}` },
      }));
      return { status: response.status, body: await response.json(), rawBody: body };
    },
  };
}

test("actual tip handler verifies the signature and forwards exact raw payment facts to atomic SQL", async () => {
  const h = harness();
  const event = stripeEvent();
  const result = await h.run(event);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "processed");
  assert.equal(result.body.noAccessGranted, true);
  assert.equal(result.body.liveMoneyAction, false);
  const reserve = h.calls("reserve_stripe_tip_webhook_event")[0];
  assert.equal(reserve.args.p_raw_event_hash, createHash("sha256").update(result.rawBody).digest("hex"));
  const projected = h.calls("process_stripe_tip_webhook_lifecycle")[0];
  assert.equal(projected.args.p_processing_attempt_id, reserve.args.p_processing_attempt_id);
  assert.equal(projected.args.p_webhook_event_id, event.id);
  assert.equal(projected.args.p_tip_id, tipId);
  assert.deepEqual(projected.args.p_provider_facts, {
    google_play_tax: null, provider_occurred_at: null,
    amount_cents: 499, amount_received_cents: undefined, amount_refunded_cents: undefined,
    event_livemode: false, event_account: null, client_reference_id: tipId,
    object_livemode: false, object_type: "checkout.session", object_status: "complete",
    checkout_mode: "payment", payment_status: "paid", currency: "usd",
    metadata_creator_id: creatorId, metadata_sender_id: buyerId, metadata_tip_id: tipId,
    object_id: "cs_test_settlement", payment_intent_id: "pi_settlement", refunded: undefined,
  });
  assert.equal(projected.args.p_tip_event_metadata.provider_completion_exact, true);
  assert.equal(projected.args.p_transition.metadata.authority_granted, false);
  assert.equal(projected.args.p_transition.metadata.payout_eligible, false);
  assert.equal(projected.args.p_transition.metadata.access_granted, false);
  assert.equal(h.calls("finalize_stripe_tip_webhook_event").length, 0,
    "the successful atomic SQL projector already finalized its claim");
});

test("signed event creation time survives parsing and only validated seconds become provider evidence", async () => {
  for (const created of [1793394000, 253402300799, undefined, null, "1793394000", {}, 1.5, 0, -1, 253402300800]) {
    const h = harness();
    const result = await h.run(stripeEvent("checkout.session.completed", checkoutObject({ created: 1 }), { created }));
    assert.equal(result.status, 200);
    const facts = h.calls("process_stripe_tip_webhook_lifecycle")[0].args.p_provider_facts;
    const expected = typeof created === "number" && Number.isSafeInteger(created) && created > 0 && created <= 253402300799
      ? new Date(created * 1000).toISOString() : null;
    assert.equal(facts.provider_occurred_at, expected);
  }
});

test("malformed Checkout economics never fall back to another amount or Edge diagnostic authority", async () => {
  for (const object of [
    checkoutObject({ amount_total: undefined, amount: 499 }),
    checkoutObject({ amount_total: "499", amount: 499 }),
    checkoutObject({ amount_total: 500 }),
    checkoutObject({ payment_status: "unpaid" }),
    checkoutObject({ payment_status: "no_payment_required" }),
    checkoutObject({ payment_status: undefined }),
    checkoutObject({ livemode: undefined }),
    checkoutObject({ livemode: true }),
    checkoutObject({ client_reference_id: buyerId }),
  ]) {
    const h = harness({ projection: projection({ updated: false, reason: "tip_provider_lifecycle_identity_mismatch" }) });
    const result = await h.run(stripeEvent("checkout.session.completed", object));
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "ignored");
    const projected = h.calls("process_stripe_tip_webhook_lifecycle")[0];
    assert.equal(projected.args.p_provider_facts.amount_cents, object.amount_total);
    assert.equal(projected.args.p_provider_facts.payment_status, object.payment_status);
    assert.equal(projected.args.p_provider_facts.object_livemode, object.livemode);
    assert.equal(projected.args.p_provider_facts.client_reference_id, object.client_reference_id);
    assert.equal(projected.args.p_tip_event_metadata.provider_completion_exact, false);
    assert.equal(projected.args.p_transition.metadata.authority_granted, false);
  }
});

test("non-platform, live and unspecified event environments are rejected before reserving a claim", async () => {
  for (const changes of [
    { livemode: true }, { livemode: undefined }, { livemode: null }, { livemode: "false" },
    { account: "acct_other_platform_context" }, { account: "" },
  ]) {
    const h = harness();
    const result = await h.run(stripeEvent(undefined, undefined, changes));
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "ignored");
    assert.equal(result.body.eventStored, false);
    assert.equal(result.body.webhookProcessed, false);
    assert.equal(h.rpcCalls.length, 0);
    assert.equal(h.reads.length, 0);
    assert.equal(h.audits[0].metadata.failure_reason, "platform_test_mode_event_required");
  }
  const h = harness();
  assert.equal((await h.run(stripeEvent(undefined, undefined, { account: null }))).status, 200);
  assert.equal(h.calls("process_stripe_tip_webhook_lifecycle").length, 1);
});

test("invalid signatures cannot reserve, look up or project a tip", async () => {
  const h = harness();
  const result = await h.run(stripeEvent(), { signature: "t=0,v1=00" });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "invalid_signature");
  assert.equal(h.rpcCalls.length, 0);
  assert.equal(h.reads.length, 0);
});

test("an existing receipt can settle without consulting switches that admit new purchases", async () => {
  const h = harness();
  const result = await h.run(stripeEvent("checkout.session.async_payment_succeeded"));
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "processed");
  assert.deepEqual(h.envReads, ["STRIPE_TIP_WEBHOOK_SECRET"]);
  assert.ok(h.reads.length > 0);
  assert.ok(h.reads.every(({ table }) => table === "creator_tip_transactions"));
  assert.deepEqual(h.rpcCalls.map(({ name }) => name), [
    "reserve_stripe_tip_webhook_event", "process_stripe_tip_webhook_lifecycle",
  ]);
});

test("unbound PaymentIntent projection remains retryable until the exact receipt is persisted", async () => {
  const h = harness({
    tip: { provider_payment_intent_id: null },
    projection: projection({ updated: false, reason: "tip_provider_identity_pending", buyerAuthorityValid: null }),
  });
  const event = stripeEvent("payment_intent.succeeded", intentObject());
  const pending = await h.run(event);
  assert.equal(pending.status, 409);
  assert.equal(pending.body.status, "pending");
  assert.equal(pending.body.webhookProcessed, false);
  assert.equal(h.calls("process_stripe_tip_webhook_lifecycle")[0].args.p_tip_event_metadata.provider_completion_exact, false);
  assert.equal(h.calls("finalize_stripe_tip_webhook_event").length, 0,
    "the retryable SQL result must not be replaced with a terminal ignored claim");
  h.setTip({ provider_payment_intent_id: "pi_settlement" });
  h.set({ projection: projection() });
  const settled = await h.run(event);
  assert.equal(settled.status, 200);
  assert.equal(settled.body.eventRetried, true);
  assert.equal(h.calls("process_stripe_tip_webhook_lifecycle")[1].args.p_tip_event_metadata.provider_completion_exact, true);
  assert.deepEqual(
    h.calls("process_stripe_tip_webhook_lifecycle").map(({ args }) => args.p_provider_facts),
    [h.calls("process_stripe_tip_webhook_lifecycle")[0].args.p_provider_facts,
      h.calls("process_stripe_tip_webhook_lifecycle")[0].args.p_provider_facts],
    "receipt binding changes authority without rewriting signed provider facts",
  );
});

test("duplicate and in-progress dispositions never invoke the payment projector", async () => {
  for (const disposition of ["duplicate", "in_progress"]) {
    const h = harness({ disposition });
    const result = await h.run();
    assert.equal(result.status, disposition === "duplicate" ? 200 : 409);
    assert.equal(result.body.status, disposition);
    assert.deepEqual(h.rpcCalls.map(({ name }) => name), ["reserve_stripe_tip_webhook_event"]);
    assert.equal(h.reads.length, 0);
    assert.equal(h.inserts.length, disposition === "duplicate" ? 1 : 0);
    if (disposition === "duplicate") assert.equal(h.inserts[0].value.event_type, "webhook_duplicate");
  }
});

test("a failed projector response marks the current attempt failed and retries the same provider facts", async () => {
  const h = harness({ projection: null, projectionError: { message: "synthetic transaction unavailable" } });
  const failed = await h.run();
  assert.equal(failed.status, 500);
  assert.equal(failed.body.webhookProcessed, false);
  const finalize = h.calls("finalize_stripe_tip_webhook_event")[0];
  assert.equal(finalize.args.p_status, "failed");
  assert.equal(finalize.args.p_processing_attempt_id, h.calls("reserve_stripe_tip_webhook_event")[0].args.p_processing_attempt_id);
  h.set({ projection: projection(), projectionError: null });
  const retry = await h.run();
  assert.equal(retry.status, 200);
  assert.equal(retry.body.eventRetried, true);
  const calls = h.calls("process_stripe_tip_webhook_lifecycle");
  assert.deepEqual(calls[0].args.p_provider_facts, calls[1].args.p_provider_facts);
  assert.notEqual(calls[0].args.p_processing_attempt_id, calls[1].args.p_processing_attempt_id);
});

test("actual shared settlement helpers require paid Checkout or confirmed exact received PI amounts", () => {
  const { checkoutSettlementOutcome, paymentIntentSettlementOutcome } = harness().settlement;
  for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
    assert.equal(checkoutSettlementOutcome(type, checkoutObject()), "succeeded");
    assert.equal(checkoutSettlementOutcome(type, checkoutObject({ payment_status: "unpaid" })), "pending");
    for (const changes of [
      { payment_status: "no_payment_required" }, { payment_status: undefined }, { payment_status: "unknown" },
      { amount_total: 0 }, { amount_total: -1 }, { amount_total: 1.5 }, { amount_total: "499" },
      { status: "open" }, { mode: "subscription" }, { object: "payment_intent" },
    ]) assert.equal(checkoutSettlementOutcome(type, checkoutObject(changes)), "unsupported");
  }
  assert.equal(checkoutSettlementOutcome("checkout.session.async_payment_failed", checkoutObject({ payment_status: "unpaid" })), "failed");
  for (const payment_status of ["paid", "no_payment_required", undefined]) {
    assert.equal(checkoutSettlementOutcome("checkout.session.async_payment_failed", checkoutObject({ payment_status })), "unsupported");
  }
  assert.equal(paymentIntentSettlementOutcome("payment_intent.succeeded", intentObject()), "succeeded");
  for (const changes of [
    { status: "processing" }, { amount_received: 498 }, { amount_received: 500 },
    { amount_received: undefined }, { amount: 0, amount_received: 0 },
  ]) assert.equal(paymentIntentSettlementOutcome("payment_intent.succeeded", intentObject(changes)), "unsupported");
  assert.equal(paymentIntentSettlementOutcome("payment_intent.payment_failed",
    intentObject({ status: "requires_payment_method", amount_received: 0 })), "failed");
  assert.equal(paymentIntentSettlementOutcome("payment_intent.payment_failed", intentObject()), "unsupported");
});

test("delayed success and failure reach the real handler and preserve the event-specific facts", async () => {
  for (const [type, object, normalized, completion] of [
    ["checkout.session.async_payment_succeeded", checkoutObject(), "checkout_completed", true],
    ["checkout.session.async_payment_failed", checkoutObject({ payment_status: "unpaid" }), "payment_failed", false],
    ["payment_intent.payment_failed", intentObject({ status: "requires_payment_method", amount_received: 0 }), "payment_failed", false],
  ]) {
    const h = harness();
    const result = await h.run(stripeEvent(type, object));
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "processed");
    assert.equal(h.inserts.length, 0, "supported delayed events do not take the ignored-event path");
    const args = h.calls("process_stripe_tip_webhook_lifecycle")[0].args;
    assert.equal(args.p_tip_event_metadata.normalized_tip_event_type, normalized);
    assert.equal(args.p_tip_event_metadata.provider_lifecycle_exact_at_edge, true);
    assert.equal(args.p_tip_event_metadata.provider_completion_exact, completion ? true : null);
    assert.equal(args.p_provider_facts.amount_received_cents, object.amount_received);
    assert.equal(args.p_provider_facts.payment_status, object.payment_status);
  }
});

test("partial refund and dispute raw identities and amounts survive the adapter without entitlement grants", async () => {
  for (const [type, object] of [
    ["charge.refunded", { id: "ch_settlement", object: "charge", amount: 499, amount_refunded: 100, refunded: false }],
    ["charge.dispute.created", { id: "dp_settlement", object: "dispute", amount: 250 }],
  ]) {
    const h = harness();
    const event = stripeEvent(type, { ...object, livemode: false, payment_intent: "pi_settlement", currency: "usd" });
    const result = await h.run(event);
    assert.equal(result.status, 200);
    const args = h.calls("process_stripe_tip_webhook_lifecycle")[0].args;
    assert.equal(args.p_provider_facts.amount_cents, object.amount);
    assert.equal(args.p_provider_facts.object_id, object.id);
    assert.equal(args.p_provider_facts.payment_intent_id, "pi_settlement");
    assert.equal(args.p_provider_facts.amount_refunded_cents, object.amount_refunded);
    assert.equal(args.p_provider_facts.refunded, object.refunded);
    assert.equal(args.p_tip_event_metadata.provider_lifecycle_exact_at_edge, true);
    assert.equal(args.p_transition.metadata.access_granted, false);
    assert.equal(args.p_transition.metadata.payout_eligible, false);
  }
});

test("malformed SQL authority cannot be acknowledged as a completed settlement", async () => {
  for (const result of [
    projection({ tipId: buyerId }), projection({ updated: "true" }),
    projection({ webhookFinalized: false }), projection({ buyerAuthorityValid: "true" }),
  ]) {
    const h = harness({ projection: result });
    const response = await h.run();
    assert.equal(response.status, 500);
    assert.equal(response.body.webhookProcessed, false);
    assert.equal(h.calls("finalize_stripe_tip_webhook_event")[0].args.p_status, "failed");
  }
});


test("metadata-free removals before PI receipt binding retry and then reach exact SQL authority", async () => {
  for (const [type, object] of [
    ["charge.refunded", { object: "charge", id: "ch_settlement", amount_refunded: 100, refunded: false }],
    ["charge.dispute.created", { object: "dispute", id: "dp_settlement" }],
  ]) {
    const h = harness({ tip: { provider_payment_intent_id: null } });
    const event = stripeEvent(type, { ...object, amount: 499, currency: "usd", livemode: false, payment_intent: "pi_settlement" });
    const pending = await h.run(event);
    assert.equal(pending.status, 409);
    assert.equal(pending.body.webhookProcessed, false);
    assert.equal(h.calls("process_stripe_tip_webhook_lifecycle").length, 0);
    assert.equal(h.calls("finalize_stripe_tip_webhook_event")[0].args.p_status, "failed");
    h.setTip({ provider_payment_intent_id: "pi_settlement" });
    const recognized = await h.run(event);
    assert.equal(recognized.status, 200);
    assert.equal(recognized.body.eventRetried, true);
    const call = h.calls("process_stripe_tip_webhook_lifecycle")[0];
    assert.equal(call.args.p_tip_id, tipId);
    assert.equal(call.args.p_provider_facts.payment_intent_id, "pi_settlement");
    assert.equal(call.args.p_tip_event_metadata.provider_lifecycle_exact_at_edge, true);
    assert.equal(call.args.p_transition.metadata.authority_granted, false);
  }
});

test("unrouted removals require strict test-mode shape and positive valid economics to request retry", async () => {
  const baseline = { object: "charge", id: "ch_settlement", amount: 499, amount_refunded: 100,
    refunded: false, currency: "usd", livemode: false, payment_intent: "pi_settlement" };
  for (const patch of [
    { amount: 0 }, { amount: -1 }, { amount: "499" }, { amount_refunded: 0 }, { amount_refunded: 500 },
    { amount_refunded: "100" }, { refunded: true }, { refunded: undefined }, { currency: "eur" },
    { livemode: true }, { livemode: undefined }, { payment_intent: null }, { payment_intent: "wrong" },
    { object: "refund" }, { id: "re_wrong" },
  ]) {
    const h = harness({ tip: { provider_payment_intent_id: null } });
    const result = await h.run(stripeEvent("charge.refunded", { ...baseline, ...patch }));
    assert.equal(result.status, 200, JSON.stringify(patch));
    assert.equal(result.body.status, "ignored");
    assert.equal(h.calls("process_stripe_tip_webhook_lifecycle").length, 0);
    assert.equal(h.calls("finalize_stripe_tip_webhook_event")[0].args.p_status, "ignored");
  }
});
