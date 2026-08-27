import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const webhook = readFileSync(
  "supabase/functions/stripe-tip-webhook/index.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260827220000_stripe_tip_webhook_atomic_lifecycle.sql",
  "utf8",
);
const concurrencyHarness = readFileSync(
  "scripts/test-stripe-tip-webhook-concurrency.mjs",
  "utf8",
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const sliceBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, start);
  assert.ok(endIndex > startIndex, end);
  return source.slice(startIndex, endIndex);
};

test("Stripe tip deliveries use an attempt-token lease and retry active work with non-2xx", () => {
  const reserve = sliceBetween(
    webhook,
    "const reserveWebhookEvent",
    "const finalizeWebhookEvent",
  );
  assert.match(reserve, /crypto\.randomUUID\(\)/u);
  assert.match(reserve, /rpc\("reserve_stripe_tip_webhook_event"/u);
  assert.match(reserve, /p_raw_event_hash: await hashText\(rawBody\)/u);
  assert.match(reserve, /returnedAttemptId !== processingAttemptId/u);

  const handler = webhook.slice(webhook.indexOf("Deno.serve"));
  assert.match(handler, /webhookClaim\.disposition === "duplicate"/u);
  assert.match(
    handler,
    /webhookClaim\.disposition === "in_progress"[\s\S]+jsonResponse\(409/u,
  );
  assert.match(handler, /finalizeWebhookEvent\([\s\S]+"failed"/u);
  assert.doesNotMatch(
    webhook,
    /\.from\("monetization_webhook_events"\)[\s\S]{0,80}\.(?:insert|update)\(/u,
  );
});

test("failed and stale claims are reclaimable but an active claim has one owner", () => {
  const reserve = sliceBetween(
    migration,
    'create or replace function public."reserve_stripe_tip_webhook_event"',
    'create or replace function public."finalize_stripe_tip_webhook_event"',
  );
  assert.match(reserve, /pg_advisory_xact_lock/u);
  assert.match(reserve, /raw_event_hash" is distinct from p_raw_event_hash/u);
  assert.match(
    reserve,
    /status" in \('processed', 'ignored'\)[\s\S]+disposition', 'duplicate'/u,
  );
  assert.match(
    reserve,
    /status" = 'received'[\s\S]+coalesce\(v_event\."processing_started_at", v_event\."created_at"\)[\s\S]+interval '5 minutes'[\s\S]+disposition', 'in_progress'/u,
  );
  assert.match(reserve, /status" not in \('received', 'failed'\)/u);
  assert.match(
    reserve,
    /processing_attempt_count" = coalesce\(event_row\."processing_attempt_count", 0\) \+ 1/u,
  );

  const finalize = sliceBetween(
    migration,
    'create or replace function public."finalize_stripe_tip_webhook_event"',
    'create or replace function public."process_stripe_tip_webhook_lifecycle"',
  );
  assert.match(finalize, /status" <> 'received'/u);
  assert.match(
    finalize,
    /processing_attempt_id" is distinct from p_processing_attempt_id/u,
  );
  assert.match(finalize, /stripe_tip_webhook_claim_not_current/u);
});

test("tip lifecycle projection serializes the claim and tip and finalizes in the same transaction", () => {
  const projector = sliceBetween(
    migration,
    'create or replace function public."process_stripe_tip_webhook_lifecycle"',
    'revoke all on function public."reserve_stripe_tip_webhook_event"',
  );
  const claimLock = projector.indexOf(
    'from public."monetization_webhook_events" event_row',
  );
  const tipLock = projector.indexOf(
    'from public."creator_tip_transactions" tip_row',
  );
  const tipUpdate = projector.lastIndexOf(
    'update public."creator_tip_transactions" tip_row',
  );
  const eventInsert = projector.lastIndexOf(
    'insert into public."creator_tip_events"',
  );
  const claimFinalize = projector.lastIndexOf(
    'update public."monetization_webhook_events" event_row',
  );
  assert.ok(claimLock >= 0);
  assert.ok(tipLock > claimLock);
  assert.ok(tipUpdate > tipLock);
  assert.ok(eventInsert > tipUpdate);
  assert.ok(claimFinalize > eventInsert);
  assert.match(projector.slice(claimLock, tipLock), /for update/u);
  assert.match(projector.slice(tipLock, tipUpdate), /for update/u);
  assert.match(
    projector,
    /on conflict \("provider", "provider_environment", "provider_event_id", "event_type"\)[\s\S]+do nothing/u,
  );

  const edgeProjector = sliceBetween(
    webhook,
    "const updateTipForEvent",
    "Deno.serve",
  );
  assert.match(edgeProjector, /rpc\("process_stripe_tip_webhook_lifecycle"/u);
  assert.doesNotMatch(
    edgeProjector,
    /\.from\("creator_tip_transactions"\)\s*\.update/u,
  );
  assert.doesNotMatch(
    edgeProjector,
    /\.from\("creator_tip_events"\)\.insert/u,
  );
  assert.equal(
    (webhook.match(/\.eq\("provider", "stripe_connect"\)/gu) ?? []).length,
    3,
  );
  assert.match(
    projector,
    /v_tip\."provider" = 'stripe_connect'[\s\S]+v_tip\."provider_environment" = 'test'/u,
  );
  assert.match(projector, /if v_identity_exact is not true then/u);
  assert.match(
    projector,
    /creator_tip_buyer_session_authority_internal/u,
  );
  assert.match(
    projector,
    /when v_buyer_authority_valid and not v_effective_compensation_required[\s\S]+when v_tip\."refunded_amount_cents" > 0 then least\([\s\S]+v_tip\."tip_amount_cents" - v_tip\."refunded_amount_cents"[\s\S]+else v_tip\."tip_amount_cents"[\s\S]+else 0/u,
  );
  assert.doesNotMatch(projector, /p_transition->'creator_net_cents'/u);
});

test("monotonic provider transitions preserve terminal and paid states", () => {
  const projector = sliceBetween(
    migration,
    'create or replace function public."process_stripe_tip_webhook_lifecycle"',
    'revoke all on function public."reserve_stripe_tip_webhook_event"',
  );
  assert.match(
    projector,
    /when 'disputed' then v_requested_status = 'disputed'/u,
  );
  assert.match(
    projector,
    /when 'refunded' then v_requested_status in \('refunded', 'disputed'\)/u,
  );
  assert.match(
    projector,
    /when 'canceled' then v_requested_status = 'canceled'/u,
  );
  assert.match(
    projector,
    /when 'paid' then v_requested_status in \('paid', 'refunded', 'disputed'\)/u,
  );
  assert.match(
    projector,
    /if not v_transition_allowed then[\s\S]+tip_terminal_state_preserved/u,
  );
  assert.match(
    migration,
    /create trigger "enforce_stripe_tip_lifecycle_monotonic"/u,
  );
  assert.match(migration, /suppressed_provider_event_id/u);
  assert.match(migration, /stripe_tip_webhook_projector_claim_required/u);
  assert.match(migration, /app\.stripe_tip_projector_attempt_id/u);
  assert.match(
    migration,
    /v_legacy_claim := exists[\s\S]+processing_attempt_id" is null[\s\S]+coalesce\(event_row\."processing_started_at", event_row\."created_at"\)[\s\S]+interval '5 minutes'/u,
  );
  assert.match(
    migration,
    /v_legacy_claim[\s\S]+creator_tip_buyer_session_authority_internal/u,
  );
  assert.match(
    migration,
    /"status" not in \('processed', 'ignored', 'failed'\)[\s\S]+"processing_attempt_id" is null/u,
  );

  const transitionAllowed = (current, requested) => {
    if (current === "disputed") return requested === "disputed";
    if (current === "refunded") {
      return requested === "refunded" || requested === "disputed";
    }
    if (current === "canceled") return requested === "canceled";
    if (current === "paid") {
      return ["paid", "refunded", "disputed"].includes(requested);
    }
    return true;
  };
  for (const terminal of ["canceled", "refunded", "disputed"]) {
    assert.equal(transitionAllowed(terminal, "paid"), false);
  }
  assert.equal(transitionAllowed("paid", "failed"), false);
  assert.equal(transitionAllowed("paid", "canceled"), false);
  assert.equal(transitionAllowed("paid", "refunded"), true);
  assert.equal(transitionAllowed("refunded", "disputed"), true);
});

test("charge.refunded validates exact charge facts and applies cumulative refunds monotonically", () => {
  const edgeMatcher = sliceBetween(
    webhook,
    "const providerRemovalOrFailureMatchesTip",
    "const tipEventTypeForStripeEvent",
  );
  for (const requiredFact of [
    "object.amount",
    "object.amount_refunded",
    "object.currency",
    "object.refunded",
    "tip.total_paid_cents",
    "tip.provider_payment_intent_id",
  ]) {
    assert.ok(edgeMatcher.includes(requiredFact), requiredFact);
  }
  assert.match(edgeMatcher, /toText\(object\.id\)\.startsWith\("ch_"\)/u);
  assert.match(edgeMatcher, /amountRefunded === chargeAmount/u);

  const edgeProjector = sliceBetween(
    webhook,
    "const updateTipForEvent",
    "Deno.serve",
  );
  assert.match(edgeProjector, /amount_refunded_cents: amountRefunded/u);
  assert.match(edgeProjector, /refunded,/u);

  const projector = sliceBetween(
    migration,
    'create or replace function public."process_stripe_tip_webhook_lifecycle"',
    'revoke all on function public."reserve_stripe_tip_webhook_event"',
  );
  assert.match(
    projector,
    /when 'charge\.refunded' then 'refunded'[\s\S]+when 'charge\.refunded' then null/u,
  );
  assert.match(projector, /v_object_id ~ '\^ch_/u);
  assert.match(projector, /v_amount = v_tip\."total_paid_cents"/u);
  assert.match(projector, /v_currency = lower\(v_tip\."currency"\)/u);
  assert.match(projector, /v_amount_refunded <= v_amount/u);
  assert.match(projector, /v_refunded = \(v_amount_refunded = v_amount\)/u);
  assert.match(
    projector,
    /v_effective_refunded := least\([\s\S]+greatest\(v_previous_refunded, coalesce\(v_amount_refunded, 0\)\)/u,
  );
  assert.match(projector, /v_refund_delta := greatest\(0, v_effective_refunded - v_previous_refunded\)/u);
  assert.match(
    projector,
    /least\([\s\S]+coalesce\(v_tip\."creator_net_cents", 0\)[\s\S]+v_tip\."tip_amount_cents" - v_effective_refunded/u,
  );
  assert.match(projector, /tip_partial_refund_recorded/u);
  assert.match(projector, /tip_full_refund_recorded/u);
  assert.match(projector, /tip_refund_state_preserved/u);
  assert.match(migration, /add column if not exists "refunded_amount_cents" integer not null default 0/u);
  assert.match(
    migration,
    /update public\."creator_tip_transactions" tip_row[\s\S]+set "creator_net_cents" = 0,[\s\S]+"payout_status" = 'reversed',[\s\S]+"refunded_amount_cents" = tip_row\."total_paid_cents"[\s\S]+where tip_row\."status" = 'refunded'[\s\S]+or tip_row\."payment_status" = 'refunded'/u,
  );
});

test("duplicate and unsupported tip audits are explicit, idempotent, and retry-safe", () => {
  const auditInsert = sliceBetween(
    webhook,
    "const insertIdempotentTipAuditEvent",
    "const readTipIdByObject",
  );
  assert.match(auditInsert, /provider: "stripe_connect"/u);
  assert.match(auditInsert, /provider_environment: "test"/u);
  assert.match(auditInsert, /error && toText\(error\.code\) !== "23505"/u);
  assert.match(auditInsert, /throw new Error\("Tip webhook audit event insert failed\."\)/u);

  const handler = webhook.slice(webhook.indexOf("Deno.serve"));
  assert.equal(
    (handler.match(/insertIdempotentTipAuditEvent\(/gu) ?? []).length,
    2,
  );
  const unsupported = sliceBetween(
    handler,
    "if (!tipEventTypes.has(eventType))",
    "const result = await updateTipForEvent",
  );
  assert.ok(
    unsupported.indexOf("insertIdempotentTipAuditEvent")
      < unsupported.indexOf("finalizeWebhookEvent"),
    "unsupported audit must commit before claim finalization so a failed insert can retry",
  );
});

test("Stripe tip claim and projector RPCs are service-only security definers", () => {
  for (
    const signature of [
      'reserve_stripe_tip_webhook_event"(text,text,text,uuid)',
      'finalize_stripe_tip_webhook_event"(text,uuid,text)',
      'process_stripe_tip_webhook_lifecycle"(text,uuid,uuid,jsonb,jsonb,jsonb)',
    ]
  ) {
    const revoke =
      `revoke all on function public."${signature}\n  from public, anon, authenticated, service_role;`;
    const grant =
      `grant execute on function public."${signature}\n  to service_role;`;
    assert.ok(migration.includes(revoke), revoke);
    assert.ok(migration.includes(grant), grant);
  }
  assert.equal(
    (migration.match(/security definer\nset search_path = ''/gu) ?? []).length,
    6,
  );
});

test("two-session concurrency gate witnesses lifecycle, attempt, and authority serialization", () => {
  assert.equal(
    packageJson.scripts["test:stripe-tip-webhook-concurrency"],
    "node ./scripts/test-stripe-tip-webhook-concurrency.mjs",
  );
  assert.match(concurrencyHarness, /pg_stat_activity/u);
  assert.match(concurrencyHarness, /wait_event_type='Lock'/u);
  assert.match(concurrencyHarness, /stripe-tip-refund-/u);
  assert.match(concurrencyHarness, /stripe-tip-completion-/u);
  assert.match(concurrencyHarness, /stripe-tip-reclaim-/u);
  assert.match(concurrencyHarness, /stripe-tip-stale-/u);
  assert.match(concurrencyHarness, /stripe-tip-authority-/u);
  assert.match(concurrencyHarness, /stripe-tip-restriction-/u);
  assert.match(concurrencyHarness, /completionApplied: false/u);
  assert.match(concurrencyHarness, /stale projector unexpectedly succeeded/u);
  assert.match(concurrencyHarness, /stripe_tip_webhook_claim_not_current/u);
  assert.match(concurrencyHarness, /restrictionCommitted: true/u);
  assert.match(concurrencyHarness, /authority serialization: 3\/3 passed/u);
  assert.doesNotMatch(concurrencyHarness, /pg_sleep/u);
});
