import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkout = readFileSync("supabase/functions/create-creator-tip-checkout/index.ts", "utf8");
const webhook = readFileSync("supabase/functions/stripe-tip-webhook/index.ts", "utf8");
const wave1 = readFileSync(
  "supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql",
  "utf8",
);
const successor = readFileSync(
  "supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql",
  "utf8",
);
const stripeLifecycle = readFileSync(
  "supabase/migrations/20260827220000_stripe_tip_webhook_atomic_lifecycle.sql",
  "utf8",
);

const sliceBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, start);
  assert.ok(endIndex > startIndex, end);
  return source.slice(startIndex, endIndex);
};

const loadBuyerAuthorityNormalizer = () => {
  const uuidSource = sliceBetween(checkout, "const normalizeUuid", "const normalizeBuyerSessionAuthority")
    .replace("value: unknown", "value");
  const normalizerSource = sliceBetween(checkout, "const normalizeBuyerSessionAuthority", "const readBuyerSessionAuthority")
    .replace("value: unknown", "value")
    .replace("expectedUserId: string", "expectedUserId")
    .replace("): BuyerSessionAuthority | null =>", ") =>")
    .replace("value as Record<string, unknown>", "value");
  return Function(
    `"use strict"; const toText = (value) => String(value ?? "").trim(); ${uuidSource}; ${normalizerSource}; return normalizeBuyerSessionAuthority;`,
  )();
};

const loadSameBuyerAuthority = () => {
  const source = sliceBetween(checkout, "const sameBuyerSessionAuthority", "const sanitizePrivateNote")
    .replace("left: BuyerSessionAuthority", "left")
    .replace("right: BuyerSessionAuthority | null", "right");
  return Function(`"use strict"; ${source}; return sameBuyerSessionAuthority;`)();
};

const loadStripeTipIdentityMatchers = () => {
  const uuidSource = sliceBetween(webhook, "const normalizeUuid", "const readStripeTipWebhookSecret")
    .replace("value: unknown", "value");
  const paymentIntentSource = sliceBetween(
    webhook,
    "const paymentIntentFromObject",
    "const checkoutSessionFromObject",
  ).replace("object: StripeObject | null", "object");
  const completionSource = sliceBetween(
    webhook,
    "const providerCompletionMatchesTip",
    "const providerRemovalOrFailureMatchesTip",
  )
    .replace("eventType: string", "eventType")
    .replace("object: StripeObject | null", "object")
    .replace("tip: TipTransactionRow", "tip");
  const removalSource = sliceBetween(
    webhook,
    "const providerRemovalOrFailureMatchesTip",
    "const tipEventTypeForStripeEvent",
  )
    .replace("eventType: string", "eventType")
    .replace("object: StripeObject | null", "object")
    .replace("tip: TipTransactionRow", "tip");
  return Function(
    `"use strict"; const toText = (value) => typeof value === "string" ? value.trim() : String(value ?? "").trim(); ${uuidSource}; ${paymentIntentSource}; ${completionSource}; ${removalSource}; return { providerCompletionMatchesTip, providerRemovalOrFailureMatchesTip };`,
  )();
};

const userId = "11111111-1111-4111-8111-111111111111";
const sessionGeneration = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const validAuthority = {
  authoritative: true,
  userId,
  accountId: userId,
  sessionGeneration,
  state: "ACTIVE",
  restoreOnly: false,
};

test("tip checkout accepts only an exact active non-restore buyer session binding", () => {
  const normalize = loadBuyerAuthorityNormalizer();
  assert.deepEqual(normalize(validAuthority, userId), {
    userId,
    accountId: userId,
    sessionGeneration,
  });
  for (const malformed of [
    { ...validAuthority, authoritative: false },
    { ...validAuthority, state: "TERMINATED" },
    { ...validAuthority, restoreOnly: true },
    { ...validAuthority, userId: "22222222-2222-4222-8222-222222222222" },
    { ...validAuthority, accountId: "22222222-2222-4222-8222-222222222222" },
    { ...validAuthority, sessionGeneration: "stale-or-malformed" },
    { ...validAuthority, sessionGeneration: null },
    {},
  ]) assert.equal(normalize(malformed, userId), null);
});

test("tip checkout rejects a session-generation change immediately before Stripe", () => {
  const sameAuthority = loadSameBuyerAuthority();
  const binding = { userId, accountId: userId, sessionGeneration };
  assert.equal(sameAuthority(binding, { ...binding }), true);
  assert.equal(sameAuthority(binding, {
    ...binding,
    sessionGeneration: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  }), false);
  assert.equal(sameAuthority(binding, null), false);
});

test("authoritative buyer readback precedes transaction creation and is revalidated before Stripe mutation", () => {
  const handler = sliceBetween(checkout, "Deno.serve", "} catch (error)");
  const firstAuthority = handler.indexOf("const buyerAuthority = await readBuyerSessionAuthority");
  const transactionInsert = handler.indexOf('.from("creator_tip_transactions")\n      .insert');
  const secondAuthority = handler.indexOf("const currentBuyerAuthority = await readBuyerSessionAuthority");
  const stripeMutation = handler.indexOf("const session = await stripeRequest");
  assert.ok(firstAuthority >= 0);
  assert.ok(transactionInsert > firstAuthority);
  assert.ok(secondAuthority > transactionInsert);
  assert.ok(stripeMutation > secondAuthority);
  assert.match(handler, /if \(!sameBuyerSessionAuthority\(buyerAuthority, currentBuyerAuthority\)\)/u);
  assert.match(handler, /payment_status: "failed"[\s\S]+status: "failed"/u);
  assert.match(handler, /error: "buyer_authority_changed"/u);
  assert.match(handler, /checkoutCreated: false/u);
  const insert = sliceBetween(
    handler,
    '.from("creator_tip_transactions")\n      .insert',
    '.select("id,idempotency_key")',
  );
  assert.match(insert, /buyer_account_id: buyerAuthority\.accountId/u);
  assert.match(insert, /buyer_session_generation: buyerAuthority\.sessionGeneration/u);
  assert.match(insert, /buyer_authority_bound: true/u);
});

test("buyer authority RPC is user-scoped and fails closed on error or malformed readback", () => {
  const reader = sliceBetween(checkout, "const readBuyerSessionAuthority", "const sameBuyerSessionAuthority");
  assert.match(reader, /client\.rpc\("wave1_session_authority_readback"\)/u);
  assert.match(reader, /return error \? null : normalizeBuyerSessionAuthority/u);
  assert.match(reader, /catch \{[\s\S]+return null/u);

  const clientSetup = sliceBetween(checkout, "const authorization =", "const adminConfig =");
  assert.match(clientSetup, /createClient\(supabaseUrl, supabaseAnonKey/u);
  assert.match(clientSetup, /Authorization: authorization/u);
  assert.doesNotMatch(clientSetup, /serviceRole/u);
});

test("server readback binds auth subject, live session generation, restriction, and restore-only state", () => {
  const authorityRpc = sliceBetween(
    wave1,
    'create or replace function public."wave1_session_authority_readback"()',
    'create or replace function public."wave1_legal_requirements_readback"',
  );
  assert.match(authorityRpc, /v_user uuid := auth\.uid\(\)/u);
  assert.match(authorityRpc, /v_generation text := nullif\(auth\.jwt\(\)->>'session_id', ''\)/u);
  assert.match(authorityRpc, /from auth\.sessions where id::text = v_generation and user_id = v_user/u);
  assert.match(authorityRpc, /public\."is_account_access_restricted"\(v_user::text\)/u);
  assert.match(authorityRpc, /public\."is_account_deletion_scheduled"\(v_user::text\)/u);
  assert.match(authorityRpc, /'state', v_state, 'restoreOnly', v_scheduled/u);
});

test("tip rows and service readback are durably bound to the exact initiating session", () => {
  const binding = sliceBetween(
    successor,
    'alter table public."creator_tip_transactions"\n  add column if not exists "buyer_account_id"',
    'create or replace function public."wave1_current_caller_authority_internal"()',
  );
  assert.match(binding, /add column if not exists "buyer_session_generation" uuid/u);
  assert.match(binding, /"buyer_account_id"="sender_id"/u);
  assert.match(binding, /creator_tip_buyer_session_authority_internal/u);
  assert.match(binding, /money_purchase_intent_session_authorized_internal/u);
  assert.match(binding, /public\."is_account_access_restricted"/u);
  assert.match(binding, /grant execute on function public\."creator_tip_buyer_session_authority"\(uuid,uuid\)\n  to service_role/u);
  assert.doesNotMatch(binding, /to authenticated/u);
});

test("provider completion derives exact buyer authority inside the locked SQL projection", () => {
  const projector = sliceBetween(
    stripeLifecycle,
    'create or replace function public."process_stripe_tip_webhook_lifecycle"',
    'revoke all on function public."reserve_stripe_tip_webhook_event"',
  );
  const tipLock = projector.indexOf('from public."creator_tip_transactions" tip_row');
  const globalLock = projector.indexOf("'stripe-tip-buyer-authority-global'");
  const userLock = projector.indexOf("'stripe-tip-buyer-authority-user:'");
  const authorityRead = projector.indexOf(
    'public."creator_tip_buyer_session_authority_internal"',
  );
  const providerUpdate = projector.indexOf(
    'update public."creator_tip_transactions" tip_row',
  );
  assert.ok(tipLock >= 0);
  assert.ok(globalLock > tipLock);
  assert.ok(userLock > globalLock);
  assert.ok(authorityRead > userLock);
  assert.ok(providerUpdate > authorityRead);
  assert.match(projector.slice(tipLock, authorityRead), /for update/u);
  assert.equal(
    projector.slice(tipLock, authorityRead).match(/pg_advisory_xact_lock_shared/gu)
      ?.length,
    2,
  );
  assert.match(projector, /v_tip\."buyer_account_id" is not distinct from v_tip\."sender_id"/u);
  for (const table of [
    'auth."users"',
    'auth."sessions"',
    'public."account_deletion_requests"',
    'public."user_profiles"',
    'public."wave1_legal_acceptances"',
    'public."wave1_legal_document_versions"',
  ]) assert.match(stripeLifecycle, new RegExp(table, "u"));

  const edgeProjector = sliceBetween(webhook, "const updateTipForEvent", "Deno.serve");
  assert.doesNotMatch(edgeProjector, /creator_tip_buyer_session_authority/u);
  assert.doesNotMatch(edgeProjector, /buyer_authority_valid_at_completion:/u);
});

test("a captured payment with stale buyer authority remains a provider fact but cannot become payable", () => {
  const projector = sliceBetween(
    stripeLifecycle,
    'create or replace function public."process_stripe_tip_webhook_lifecycle"',
    'revoke all on function public."reserve_stripe_tip_webhook_event"',
  );
  assert.match(projector, /v_buyer_authority_valid := v_tip\."buyer_account_id" is not null/u);
  assert.match(projector, /v_incoming_compensation_required := not v_buyer_authority_valid/u);
  assert.match(projector, /v_old_compensation_required or v_incoming_compensation_required/u);
  assert.match(
    projector,
    /when v_buyer_authority_valid and not v_effective_compensation_required[\s\S]+when v_tip\."refunded_amount_cents" > 0 then least\([\s\S]+else v_tip\."tip_amount_cents"[\s\S]+else 0/u,
  );
  assert.match(projector, /"payment_status" = 'succeeded'/u);
  assert.match(projector, /"payout_status" = 'not_payable'/u);
  assert.match(projector, /"status" = 'paid'/u);

  const edgeProjector = sliceBetween(webhook, "const updateTipForEvent", "Deno.serve");
  assert.doesNotMatch(edgeProjector, /creator_net_cents/u);
  assert.doesNotMatch(edgeProjector, /compensation_required:/u);
  assert.match(edgeProjector, /authority_granted: false/u);
  assert.match(edgeProjector, /payout_eligible: false/u);
  assert.match(edgeProjector, /compensationRequired: projection\.compensationRequired/u);
  assert.match(edgeProjector, /access_granted: false/u);
});

test("provider completion is exact-bound to the Stripe object, buyer, creator, amount, and currency", () => {
  const matcher = sliceBetween(
    webhook,
    "const providerCompletionMatchesTip",
    "const tipEventTypeForStripeEvent",
  );
  assert.match(matcher, /providerObjectId === toText\(tip\.provider_checkout_session_id\)/u);
  assert.match(matcher, /providerObjectId === toText\(tip\.provider_payment_intent_id\)/u);
  assert.match(matcher, /Number\.isSafeInteger\(amount\)/u);
  assert.match(matcher, /amount === tip\.tip_amount_cents/u);
  assert.match(matcher, /currency === toText\(tip\.currency\)\.toLowerCase\(\)/u);
  assert.match(matcher, /metadataSenderId === senderId/u);
  assert.match(matcher, /metadataCreatorId === creatorId/u);
  assert.match(matcher, /metadataTipId === tipId/u);
  assert.match(matcher, /!toText\(tip\.provider_payment_intent_id\)[\s\S]+providerObjectId === toText\(tip\.provider_payment_intent_id\)/u);
  const projector = sliceBetween(webhook, "const updateTipForEvent", "Deno.serve");
  assert.match(projector, /provider_completion_exact/u);
});

test("cross-user, cross-creator, cross-object, amount, and currency substitutions fail the executable Stripe matcher", () => {
  const { providerCompletionMatchesTip, providerRemovalOrFailureMatchesTip } = loadStripeTipIdentityMatchers();
  const tip = {
    id: "33333333-3333-4333-8333-333333333333",
    sender_id: userId,
    creator_id: "22222222-2222-4222-8222-222222222222",
    provider_checkout_session_id: "cs_test_exact",
    provider_payment_intent_id: null,
    tip_amount_cents: 499,
    total_paid_cents: 499,
    currency: "usd",
  };
  const metadata = {
    chillywood_tip_id: tip.id,
    fan_user_id: tip.sender_id,
    creator_user_id: tip.creator_id,
  };
  const checkout = {
    id: "cs_test_exact",
    payment_intent: "pi_test_exact",
    amount_total: 499,
    currency: "usd",
    metadata,
  };
  assert.equal(providerCompletionMatchesTip("checkout.session.completed", checkout, tip), true);
  const paymentIntent = {
    id: "pi_test_exact",
    amount: 499,
    currency: "usd",
    metadata,
  };
  assert.equal(providerCompletionMatchesTip("payment_intent.succeeded", paymentIntent, tip), true);
  for (const malformed of [
    { ...checkout, id: "cs_test_other" },
    { ...checkout, amount_total: 500 },
    { ...checkout, currency: "eur" },
    { ...checkout, metadata: { ...metadata, fan_user_id: tip.creator_id } },
    { ...checkout, metadata: { ...metadata, creator_user_id: tip.sender_id } },
    { ...checkout, metadata: { ...metadata, chillywood_tip_id: userId } },
  ]) assert.equal(providerCompletionMatchesTip("checkout.session.completed", malformed, tip), false);
  assert.equal(providerCompletionMatchesTip(
    "payment_intent.succeeded",
    paymentIntent,
    { ...tip, provider_payment_intent_id: "pi_test_other" },
  ), false);

  const boundTip = { ...tip, provider_payment_intent_id: "pi_test_exact" };
  const validRefund = {
    id: "ch_test_exact",
    payment_intent: "pi_test_exact",
    amount: 499,
    amount_refunded: 100,
    currency: "usd",
    refunded: false,
  };
  assert.equal(providerRemovalOrFailureMatchesTip(
    "charge.refunded",
    validRefund,
    boundTip,
  ), true);
  for (const malformedRefund of [
    { ...validRefund, payment_intent: "pi_test_other" },
    { ...validRefund, amount: 500 },
    { ...validRefund, currency: "eur" },
    { ...validRefund, amount_refunded: 0 },
    { ...validRefund, amount_refunded: 500 },
    { ...validRefund, refunded: true },
  ]) {
    assert.equal(
      providerRemovalOrFailureMatchesTip("charge.refunded", malformedRefund, boundTip),
      false,
    );
  }
});

test("mismatched provider lifecycle identity reaches the atomic fail-closed projector", () => {
  const lifecycleMatcher = sliceBetween(
    webhook,
    "const providerRemovalOrFailureMatchesTip",
    "const tipEventTypeForStripeEvent",
  );
  assert.match(lifecycleMatcher, /object\.id\) === toText\(tip\.provider_checkout_session_id\)/u);
  assert.match(lifecycleMatcher, /object\.id\) === toText\(tip\.provider_payment_intent_id\)/u);
  assert.match(lifecycleMatcher, /paymentIntentId === toText\(tip\.provider_payment_intent_id\)/u);

  const projector = sliceBetween(webhook, "const updateTipForEvent", "Deno.serve");
  const transactionUpdate = projector.indexOf('adminClient.rpc("process_stripe_tip_webhook_lifecycle"');
  assert.ok(transactionUpdate >= 0);
  assert.equal(projector.indexOf("if (!providerLifecycleExact)"), -1);
  assert.doesNotMatch(projector, /from\("creator_tip_events"\)\.insert/u);
  assert.match(projector, /provider_lifecycle_exact_at_edge: providerLifecycleExact/u);
  assert.match(projector, /p_provider_facts:/u);
  assert.doesNotMatch(projector, /provider_checkout_session_id:/u);
  assert.doesNotMatch(projector, /provider_payment_intent_id:/u);
  assert.match(
    stripeLifecycle,
    /"provider_payment_intent_id" = coalesce\(v_payment_intent_id, tip_row\."provider_payment_intent_id"\)/u,
  );
});

test("completion compensation is sticky and existing transaction metadata is preserved", () => {
  const projector = sliceBetween(
    stripeLifecycle,
    'create or replace function public."process_stripe_tip_webhook_lifecycle"',
    'revoke all on function public."reserve_stripe_tip_webhook_event"',
  );
  assert.match(projector, /coalesce\(v_tip\."metadata", '\{\}'::jsonb\)/u);
  assert.match(projector, /v_old_compensation_required or v_incoming_compensation_required/u);
  assert.match(projector, /tip_buyer_session_previously_invalid/u);
  assert.match(projector, /tip_terminal_state_preserved/u);
  assert.match(projector, /'compensation_required', v_effective_compensation_required/u);

  const edgeProjector = sliceBetween(webhook, "const updateTipForEvent", "Deno.serve");
  assert.doesNotMatch(edgeProjector, /\.\.\.existingMetadata/u);
  assert.match(edgeProjector, /process_stripe_tip_webhook_lifecycle/u);
});
