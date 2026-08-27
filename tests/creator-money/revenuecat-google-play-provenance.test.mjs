import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const webhook = readFileSync("supabase/functions/revenuecat-webhook/index.ts", "utf8");
const closeout = readFileSync(
  "supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql",
  "utf8",
);

const sliceBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, start);
  assert.ok(endIndex > startIndex, end);
  return source.slice(startIndex, endIndex);
};

const providerIdentitySource = () => sliceBetween(webhook, "const providerText", "const toStringArray")
  .replace("value: unknown", "value")
  .replace("event: RevenueCatEvent", "event")
  .replace("key: string", "key");

const loadProviderValueResolver = () => {
  const resolverSource = sliceBetween(
    webhook,
    "const ISO_CURRENCY_ZERO_MINOR_UNITS",
    "const resolveCreatorMoneyProviderValue",
  )
    .replace("currency: string", "currency")
    .replace("rawAmount: unknown, exponent: number", "rawAmount, exponent")
    .replace("event: RevenueCatEvent", "event")
    .replace("authorityActive: boolean", "authorityActive")
    .replace("): CreatorMoneyProviderValue =>", ") =>");
  return Function(
    `"use strict"; ${resolverSource}; return resolveAuthorityProviderValue;`,
  )();
};

const loadCurrencyExponentResolver = () => {
  const resolverSource = sliceBetween(
    webhook,
    "const ISO_CURRENCY_ZERO_MINOR_UNITS",
    "const decimalMajorToMinor",
  ).replace("currency: string", "currency");
  return Function(
    `"use strict"; ${resolverSource}; return currencyMinorUnitExponent;`,
  )();
};

const loadEventIdResolver = () => {
  const providerTextSource = providerIdentitySource();
  const resolverSource = sliceBetween(webhook, "const resolveEventId", "const resolveEntitlementStatus")
    .replace("event: RevenueCatEvent", "event")
    .replace("_rawBody: string", "_rawBody");
  return Function(`"use strict"; ${providerTextSource}; ${resolverSource}; return resolveEventId;`)();
};

const loadOriginalTransactionResolver = () => {
  const providerTextSource = providerIdentitySource();
  const resolverSource = sliceBetween(
    webhook,
    "const resolveOriginalTransactionId",
    "const resolveGooglePlayProductReference",
  ).replace("event: RevenueCatEvent", "event");
  return Function(
    `"use strict"; ${providerTextSource}; ${resolverSource}; return resolveOriginalTransactionId;`,
  )();
};

const loadProductIdResolver = () => {
  const providerTextSource = providerIdentitySource();
  const resolverSource = sliceBetween(
    webhook,
    "const resolveProductId",
    "const resolveOriginalTransactionId",
  ).replace("event: RevenueCatEvent", "event");
  return Function(`"use strict"; ${providerTextSource}; ${resolverSource}; return resolveProductId;`)();
};

const loadUserIdResolver = () => {
  const providerTextSource = providerIdentitySource();
  const resolverSource = sliceBetween(
    webhook,
    "const resolveUserId",
    "const resolveEventId",
  ).replace("event: RevenueCatEvent", "event");
  return Function(`"use strict"; ${providerTextSource}; ${resolverSource}; return resolveUserId;`)();
};

const loadPremiumProviderProductSignal = () => {
  const source = sliceBetween(
    webhook,
    "const hasPremiumProviderProductSignal",
    "const hasPremiumSignal",
  ).replace("value: string", "value");
  return Function(
    `"use strict"; const PREMIUM_PRODUCT_ID = "premium_subscription"; const APP_STORE_PREMIUM_PRODUCT_IDS = new Set(["com.chillywood.premium.monthly", "com.chillywood.premium.yearly"]); ${source}; return hasPremiumProviderProductSignal;`,
  )();
};

const loadRevenueCatEventExtractor = () => {
  const source = sliceBetween(
    webhook,
    "const extractRevenueCatEvent",
    "const resolveEntitlementIds",
  )
    .replace("rawBody: string", "rawBody")
    .replace(": RevenueCatEvent", "")
    .replace(" as unknown", "");
  return Function(
    `"use strict"; const INVALID_REVENUECAT_PAYLOAD_MARKER = "__chillywood_invalid_revenuecat_payload"; const isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value); ${source}; return { extractRevenueCatEvent, INVALID_REVENUECAT_PAYLOAD_MARKER };`,
  )();
};

test("authoritative RevenueCat event identity never falls back to transaction, original-transaction, or payload hash", async () => {
  const resolver = sliceBetween(webhook, "const resolveEventId", "const resolveEntitlementStatus");
  assert.match(webhook, /typeof value === "string"[\s\S]+value\.length <= 512[\s\S]+value === value\.trim\(\)[\s\S]+!\/\[\\u0000-\\u001f\\u007f\]\//u);
  assert.match(resolver, /const id = providerText\(event\.id\)/u);
  assert.match(resolver, /const eventId = providerText\(event\.event_id\)/u);
  assert.match(resolver, /if \(id && eventId && id !== eventId\)/u);
  assert.match(resolver, /event id is ambiguous/u);
  assert.match(resolver, /event id is missing/u);
  assert.doesNotMatch(resolver, /transaction_id|original_transaction_id|hashText/u);

  const resolveEventId = loadEventIdResolver();
  assert.equal(await resolveEventId({ id: "event-1" }, "payload"), "event-1");
  assert.equal(await resolveEventId({ event_id: "event-2" }, "payload"), "event-2");
  assert.equal(await resolveEventId({ id: "event-3", event_id: "event-3" }, "payload"), "event-3");
  await assert.rejects(
    resolveEventId({ id: "event-4", event_id: "event-5" }, "payload"),
    /event id is ambiguous/u,
  );
  await assert.rejects(
    resolveEventId({ transaction_id: "transaction-fallback" }, "payload"),
    /event id is missing/u,
  );
  await assert.rejects(
    resolveEventId({ original_transaction_id: "original-fallback" }, "payload"),
    /event id is missing/u,
  );
  await assert.rejects(resolveEventId({ id: " event-6 " }, "payload"), /event id is missing/u);
  await assert.rejects(resolveEventId({ id: "event\n7" }, "payload"), /event id is missing/u);
  await assert.rejects(resolveEventId({ id: "e".repeat(513) }, "payload"), /event id is missing/u);
  await assert.rejects(
    resolveEventId({ id: "event-8", event_id: " bad-event-alias " }, "payload"),
    /event id is missing or invalid/u,
  );
});

test("every non-quarantined exact signed webhook identity is durably reserved before store or authority routing", () => {
  assert.match(
    webhook,
    /\.rpc\("reserve_revenuecat_webhook_ingress_event",\s*\{[\s\S]+p_provider_event_id: eventId,[\s\S]+p_raw_payload_hash: rawPayloadHash/u,
  );
  const extraction = webhook.indexOf("const event = extractRevenueCatEvent(rawBody)");
  const reservation = webhook.indexOf("await reserveRevenueCatWebhookIngress(adminConfig.client, event, rawBody)", extraction);
  const testRouting = webhook.indexOf('normalizeEventType(event.type) === "TEST"', extraction);
  const storeRouting = webhook.indexOf("const storePolicy = revenueCatStorePolicy(event)", extraction);
  assert.ok(extraction >= 0);
  assert.ok(reservation > extraction);
  assert.ok(testRouting > reservation);
  assert.ok(storeRouting > reservation);

  assert.match(closeout, /create table public\."revenuecat_webhook_ingress_events"/u);
  assert.match(closeout, /create or replace function public\."reserve_revenuecat_webhook_ingress_event"/u);
  assert.match(closeout, /revenuecat_webhook_ingress_identity_mismatch/u);
  assert.match(closeout, /grant execute on function public\."reserve_revenuecat_webhook_ingress_event"\(text,text\)[\s\S]+to service_role/u);
  assert.match(closeout, /before update or delete on public\."revenuecat_webhook_ingress_events"/u);
});

test("verified deliveries remain retryable when durable backend evidence is unavailable", () => {
  const handler = sliceBetween(webhook, "const signatureVerified =", "const event = extractRevenueCatEvent");
  assert.match(handler, /if \(!signatureVerified\)[\s\S]+jsonResponse\(401/u);
  assert.match(handler, /if \(!adminConfig\.configured\)[\s\S]+jsonResponse\(503/u);
  assert.match(handler, /status: "backend_unavailable"/u);
  assert.match(handler, /webhookProcessed: false/u);
  assert.match(handler, /premiumGranted: false/u);
  assert.match(handler, /retryable: true/u);
  assert.doesNotMatch(handler, /if \(!adminConfig\.configured\)[\s\S]+jsonResponse\(200/u);
});

test("provider original-transaction identity is exact and alias conflicts fail closed", () => {
  const resolveOriginalTransactionId = loadOriginalTransactionResolver();
  assert.equal(resolveOriginalTransactionId({ original_transaction_id: "original-1" }), "original-1");
  assert.equal(resolveOriginalTransactionId({ originalTransactionId: "original-2" }), "original-2");
  assert.equal(resolveOriginalTransactionId({
    original_transaction_id: "original-3",
    originalTransactionId: "original-3",
  }), "original-3");
  assert.equal(resolveOriginalTransactionId({
    original_transaction_id: "original-4",
    originalTransactionId: "original-5",
  }), null);
  assert.equal(resolveOriginalTransactionId({ original_transaction_id: " original-6 " }), null);
  assert.equal(resolveOriginalTransactionId({
    original_transaction_id: "original-7",
    originalTransactionId: " malformed-original ",
  }), null);
  assert.equal(resolveOriginalTransactionId({}), null);
});

test("provider product aliases resolve only when exact and nonconflicting", () => {
  const resolveProductId = loadProductIdResolver();
  assert.equal(resolveProductId({ product_id: "product-1" }), "product-1");
  assert.equal(resolveProductId({ product_identifier: "product-2" }), "product-2");
  assert.equal(resolveProductId({ product_id: "product-3", product_identifier: "product-3" }), "product-3");
  assert.equal(resolveProductId({ product_id: "product-4", product_identifier: "product-5" }), null);
  assert.equal(resolveProductId({ product_id: " product-6 " }), null);
  assert.equal(resolveProductId({ product_id: "product\u0000-7" }), null);
  assert.equal(resolveProductId({ product_id: "p".repeat(513) }), null);
  assert.equal(resolveProductId({
    product_id: "product-8",
    product_identifier: " malformed-product ",
  }), null);
  assert.equal(resolveProductId({}), null);
});

test("provider user identity is exact and malformed/conflicting aliases fail closed", () => {
  const resolveUserId = loadUserIdResolver();
  const userId = "11111111-1111-4111-8111-111111111111";
  assert.equal(resolveUserId({ app_user_id: userId }), userId);
  assert.equal(resolveUserId({ appUserId: userId }), userId);
  assert.equal(resolveUserId({ app_user_id: userId, appUserId: userId }), userId);
  assert.equal(resolveUserId({ app_user_id: userId, appUserId: "22222222-2222-4222-8222-222222222222" }), "");
  assert.equal(resolveUserId({ app_user_id: userId, appUserId: " malformed-user " }), "");
  assert.equal(resolveUserId({ app_user_id: "$RCAnonymousID:untrusted" }), "");
  assert.equal(resolveUserId({}), "");
});

test("exact Premium signals route malformed aliases and Google base-plan terminals to the fail-closed Premium projector", () => {
  const hasPremiumProviderProductSignal = loadPremiumProviderProductSignal();
  assert.equal(hasPremiumProviderProductSignal("premium_subscription"), true);
  assert.equal(hasPremiumProviderProductSignal("premium_subscription:monthly"), true);
  assert.equal(hasPremiumProviderProductSignal("premium_subscription:"), false);
  assert.equal(hasPremiumProviderProductSignal("creator_subscription:monthly"), false);
  assert.equal(hasPremiumProviderProductSignal("arbitrary-premium-looking-product"), false);

  const detector = sliceBetween(webhook, "const hasPremiumProviderProductSignal", "const resolveUserId");
  const entitlementDecision = detector.indexOf("entitlementIds.includes(PREMIUM_ENTITLEMENT_KEY)");
  const productConflict = detector.indexOf("productId && productIdentifier && productId !== productIdentifier");
  assert.ok(entitlementDecision >= 0 && productConflict > entitlementDecision);
  assert.match(detector, /if \(entitlementIds\.includes\(PREMIUM_ENTITLEMENT_KEY\)\) return true/u);
  assert.match(detector, /parts\.length === 2 && parts\[0\] === PREMIUM_PRODUCT_ID && !!parts\[1\]/u);
  assert.match(detector, /return productSignalsPremium/u);

  const premiumWriter = sliceBetween(
    webhook,
    "const writePremiumEntitlementFromRevenueCatEvent",
    "const writePremiumTransferFromRevenueCatEvent",
  );
  assert.match(premiumWriter, /p_original_transaction_id: originalTransactionId/u);
  assert.match(premiumWriter, /\.rpc\("process_revenuecat_premium_event_atomic"/u);
  assert.match(closeout, /if v_terminal_event then/u);
  assert.match(closeout, /premium_original_transaction_terminal_or_blocked/u);
});

test("Google Play creator money uses only the service-side atomic provenance path", () => {
  const handler = sliceBetween(webhook, "if (!hasPremiumSignal(event))", "const entitlementWrite");
  assert.match(handler, /storePolicy\.provider === "revenuecat_google_play"/u);
  assert.match(handler, /writeGooglePlayCreatorMoneyFromRevenueCatEvent/u);
  assert.doesNotMatch(handler, /mirrorRevenueCatDynamicMoneyAccess/u);
  assert.doesNotMatch(webhook, /mirrorRevenueCatPremiumMoneyAccess/u);
  assert.doesNotMatch(webhook, /mirrorRevenueCatDynamicMoneyAccess/u);
  assert.doesNotMatch(webhook, /syncChannelSubscriptionLifecycle/u);

  const googleWriter = sliceBetween(
    webhook,
    "const writeGooglePlayCreatorMoneyFromRevenueCatEvent",
    "const writePremiumEntitlementFromRevenueCatEvent",
  );
  assert.match(googleWriter, /\.rpc\("process_revenuecat_google_play_event_atomic"/u);
  assert.match(googleWriter, /p_input_reason: inputReason/u);
  assert.doesNotMatch(googleWriter, /\.from\("revenuecat_consumable_transaction_intents"\)/u);
  assert.doesNotMatch(googleWriter, /\.order\("created_at"/u);
});

test("malformed signed terminal identity is quarantined before exact ingress or domain routing", () => {
  const inspector = sliceBetween(
    webhook,
    "const inspectRevenueCatTerminalEnvelope",
    "const quarantineRevenueCatTerminalAuthority",
  );
  for (const reason of [
    "event_type_missing_or_unsupported",
    "event_id_conflicting",
    "event_id_missing_or_invalid",
    "user_id_conflicting",
    "user_id_missing_or_invalid",
    "original_transaction_id_conflicting",
    "original_transaction_id_missing_or_invalid",
    "store_identity_missing_or_unsupported",
    "environment_missing_or_invalid",
  ]) assert.match(inspector, new RegExp(reason, "u"));
  assert.match(inspector, /reportedEventType === "TEST"[\s\S]+ACTIVE_EVENT_TYPES\.has\(reportedEventType\)/u);
  assert.match(inspector, /if \(reportedEventType === "TRANSFER"\)/u);
  assert.match(inspector, /TERMINAL_DISPATCH_EVENT_TYPES\.has\(reportedEventType\) \? reportedEventType : "UNKNOWN"/u);
  assert.match(inspector, /terminal_identity_multiple_invalid/u);
  assert.doesNotMatch(inspector, /reasons\.join\(/u);

  const handler = sliceBetween(webhook, "const event = extractRevenueCatEvent", "if (normalizeEventType(event.type) === \"TEST\")");
  const quarantineCall = handler.indexOf("quarantineRevenueCatTerminalAuthority");
  const ingressCall = handler.indexOf("reserveRevenueCatWebhookIngress");
  assert.ok(quarantineCall >= 0 && ingressCall > quarantineCall);
  assert.match(handler, /if \(terminalEnvelope\?\.reason\)/u);
  assert.match(handler, /authorityGranted: false/u);

  const quarantineWriter = sliceBetween(
    webhook,
    "const quarantineRevenueCatTerminalAuthority",
    "const reserveRevenueCatWebhookIngress",
  );
  assert.match(quarantineWriter, /\.rpc\("quarantine_revenuecat_terminal_authority"/u);
  assert.match(quarantineWriter, /result\.authorityGranted !== false/u);
  assert.match(closeout, /create or replace function public\."quarantine_revenuecat_terminal_authority"/u);
  assert.match(closeout, /'SUBSCRIPTION_PAUSED','TRANSFER','UNKNOWN'/u);
  assert.match(closeout, /create or replace function public\."revenuecat_authority_quarantined_internal"/u);
  assert.match(closeout, /revenuecat_terminal_authority_quarantined/u);
});

test("valid-signature malformed JSON and non-object payloads enter an idempotent global UNKNOWN quarantine", () => {
  const { extractRevenueCatEvent, INVALID_REVENUECAT_PAYLOAD_MARKER } = loadRevenueCatEventExtractor();
  for (const rawBody of ["{", "null", "[]", "true", "42", '"event"']) {
    assert.deepEqual(extractRevenueCatEvent(rawBody), {
      [INVALID_REVENUECAT_PAYLOAD_MARKER]: true,
    });
  }
  assert.deepEqual(extractRevenueCatEvent('{"event":{"id":"event-1"}}'), { id: "event-1" });
  assert.deepEqual(extractRevenueCatEvent('{"id":"event-2"}'), { id: "event-2" });

  const inspector = sliceBetween(
    webhook,
    "const inspectRevenueCatTerminalEnvelope",
    "const quarantineRevenueCatTerminalAuthority",
  );
  assert.match(inspector, /event\[INVALID_REVENUECAT_PAYLOAD_MARKER\] === true/u);
  assert.match(inspector, /eventType: "UNKNOWN"/u);
  assert.match(inspector, /provider: "revenuecat"/u);
  assert.match(inspector, /providerEventId: null/u);
  assert.match(inspector, /userId: null/u);
  assert.match(inspector, /environment: null/u);
  assert.match(inspector, /terminal_identity_invalid:payload_missing_or_invalid/u);

  const handler = sliceBetween(
    webhook,
    "const event = extractRevenueCatEvent(rawBody)",
    "await reserveRevenueCatWebhookIngress",
  );
  assert.ok(handler.indexOf("quarantineRevenueCatTerminalAuthority") >= 0);
  assert.match(handler, /return jsonResponse\(200,[\s\S]+authorityQuarantined: true/u);

  const quarantineFunction = sliceBetween(
    closeout,
    'create or replace function public."quarantine_revenuecat_terminal_authority"',
    'create or replace function public."revenuecat_authority_quarantined_internal"',
  );
  assert.match(quarantineFunction, /where quarantine\."raw_payload_hash"=p_raw_payload_hash/u);
  assert.match(quarantineFunction, /'duplicateEvent',true,'authorityGranted',false/u);
  assert.match(quarantineFunction, /revenuecat_terminal_quarantine_identity_mismatch/u);
  assert.match(quarantineFunction, /apply_revenuecat_terminal_quarantine_projection_internal/u);
});

test("same provider event id with changed terminal bytes quarantines instead of overwriting ingress or preserving stale authority", () => {
  const activeBytes = JSON.stringify({
    event: {
      id: "event-reused-across-lifecycle",
      type: "INITIAL_PURCHASE",
      app_user_id: "11111111-1111-4111-8111-111111111111",
      original_transaction_id: "store-transaction-1",
      store: "APP_STORE",
      environment: "SANDBOX",
    },
  });
  const changedTerminalBytes = JSON.stringify({
    event: {
      id: "event-reused-across-lifecycle",
      type: "REFUND",
      app_user_id: "11111111-1111-4111-8111-111111111111",
      original_transaction_id: "store-transaction-1",
      store: "APP_STORE",
      environment: "SANDBOX",
    },
  });
  assert.equal(JSON.parse(activeBytes).event.id, JSON.parse(changedTerminalBytes).event.id);
  assert.notEqual(
    createHash("sha256").update(activeBytes).digest("hex"),
    createHash("sha256").update(changedTerminalBytes).digest("hex"),
  );

  const handler = sliceBetween(
    webhook,
    "const event = extractRevenueCatEvent(rawBody)",
    'if (normalizeEventType(event.type) === "TEST")',
  );
  const reserveCall = handler.indexOf("await reserveRevenueCatWebhookIngress");
  const collisionCheck = handler.indexOf("revenuecat_webhook_ingress_identity_mismatch");
  const quarantineCall = handler.indexOf("quarantineRevenueCatTerminalAuthority", collisionCheck);
  assert.ok(reserveCall >= 0 && collisionCheck > reserveCall && quarantineCall > collisionCheck);
  assert.match(handler, /terminalEnvelope[\s\S]+event_payload_identity_mismatch/u);
  assert.match(handler, /ingress_identity_overwritten: false/u);
  assert.match(handler, /ingressIdentityOverwritten: false/u);
  assert.match(handler, /authorityGranted: false/u);
  assert.match(handler, /throw error/u);

  const ingressReservation = sliceBetween(
    closeout,
    'create or replace function public."reserve_revenuecat_webhook_ingress_event"',
    'revoke all on function public."block_revenuecat_webhook_ingress_mutation_internal"',
  );
  assert.match(ingressReservation, /revenuecat_webhook_ingress_identity_mismatch/u);
  assert.doesNotMatch(ingressReservation, /update public\."revenuecat_webhook_ingress_events"/u);

  const quarantineFunction = sliceBetween(
    closeout,
    'create or replace function public."quarantine_revenuecat_terminal_authority"',
    'create or replace function public."revenuecat_authority_quarantined_internal"',
  );
  assert.match(quarantineFunction, /where quarantine\."raw_payload_hash"=p_raw_payload_hash/u);
  assert.match(quarantineFunction, /revenuecat_terminal_quarantine_identity_mismatch/u);
  assert.match(quarantineFunction, /'duplicateEvent',true,'authorityGranted',false/u);

  const terminalDispatch = webhook.indexOf("writeRevenueCatTerminalEventFromRevenueCatEvent");
  const collisionQuarantine = webhook.indexOf("revenuecat_terminal_ingress_collision_quarantined");
  assert.ok(collisionQuarantine >= 0 && terminalDispatch >= 0);
  assert.ok(collisionQuarantine < webhook.lastIndexOf("writeRevenueCatTerminalEventFromRevenueCatEvent"));
});

test("malformed TRANSFER is quarantined at exact source scope while valid transfer remains atomic", () => {
  const inspector = sliceBetween(
    webhook,
    "const inspectRevenueCatTerminalEnvelope",
    "const quarantineRevenueCatTerminalAuthority",
  );
  for (const reason of [
    "event_id_conflicting",
    "event_id_missing_or_invalid",
    "transfer_source_identity_missing_or_ambiguous",
    "transfer_target_identity_missing_or_ambiguous",
    "transfer_time_conflicting",
    "transfer_time_missing_or_invalid",
    "transfer_store_identity_missing_or_unsupported",
    "transfer_environment_missing_or_invalid",
  ]) assert.match(inspector, new RegExp(reason, "u"), reason);
  assert.match(inspector, /userId: sourceUserId/u);
  assert.match(inspector, /const provider = storePolicy\.provider === "revenuecat_app_store"[\s\S]+storePolicy\.provider === "revenuecat_google_play"/u);
  assert.match(inspector, /eventType: "TRANSFER"/u);

  const handler = sliceBetween(webhook, "const event = extractRevenueCatEvent", "if \(normalizeEventType(event.type) === \"TEST\"\)");
  assert.ok(handler.indexOf("inspectRevenueCatTerminalEnvelope") < handler.indexOf("reserveRevenueCatWebhookIngress"));
  const validTransferBranch = sliceBetween(
    webhook,
    'if (normalizeEventType(event.type) === "TRANSFER")',
    "const terminalEventType",
  );
  assert.match(validTransferBranch, /writePremiumTransferFromRevenueCatEvent/u);
  const transferWriter = sliceBetween(
    webhook,
    "const writePremiumTransferFromRevenueCatEvent",
    "Deno.serve",
  );
  assert.match(transferWriter, /resolveRevenueCatTransferUsers\(event\)/u);
  assert.match(transferWriter, /isVerifiedRevenueCatTransferPolicy\(storePolicy, environment\)/u);
  assert.match(transferWriter, /\.rpc\("process_revenuecat_premium_transfer_atomic"/u);

  const quarantineResolution = sliceBetween(
    closeout,
    'create or replace function public."resolve_revenuecat_terminal_quarantine_internal"',
    'revoke all on function public."quarantine_revenuecat_terminal_authority"',
  );
  assert.doesNotMatch(quarantineResolution, /event\."event_type"[^;]+TRANSFER/u);
  assert.match(closeout, /revenuecat_authority_quarantined_internal[\s\S]+revenuecat_terminal_authority_quarantines/u);
});

test("active creator-money events require an exact positive provider amount and ISO currency", () => {
  const parser = sliceBetween(webhook, "const ISO_CURRENCY_ZERO_MINOR_UNITS", "const resolveCreatorMoneyProviderValue");
  assert.match(parser, /if \(!authorityActive\)/u);
  assert.match(parser, /event\.price_in_purchased_currency/u);
  assert.match(parser, /BigInt\(majorUnits\) \* scale \+ BigInt\(paddedFraction\)/u);
  assert.match(parser, /amountMinorBigInt > 2_147_483_647n/u);
  assert.match(parser, /typeof event\.currency === "string"/u);
  assert.match(parser, /\/\^\[a-z\]\{3\}\$\//u);
  assert.match(parser, /currencyMinorUnitExponent\(currency\)/u);
  assert.doesNotMatch(parser, /Math\.round|\*\s*100\b/u);
  for (const reason of [
    "provider_price_missing_or_invalid",
    "provider_price_minor_invalid",
    "provider_price_precision_invalid",
    "provider_currency_missing_or_invalid",
  ]) assert.match(parser, new RegExp(reason, "u"), reason);
  assert.doesNotMatch(parser, /\|\|\s*"usd"|\?\?\s*"usd"/u);
});

test("malformed active price and currency inputs fail closed while valid localized currency is preserved", () => {
  const resolveProviderValue = loadProviderValueResolver();

  assert.deepEqual(
    resolveProviderValue({ currency: "USD" }, true),
    { amountMinor: null, currency: null, invalidReason: "provider_price_missing_or_invalid" },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: -1, currency: "USD" }, true),
    { amountMinor: null, currency: null, invalidReason: "provider_price_missing_or_invalid" },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: "4,99", currency: "EUR" }, true),
    { amountMinor: null, currency: null, invalidReason: "provider_price_missing_or_invalid" },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: " 4.99 ", currency: "EUR" }, true),
    { amountMinor: null, currency: null, invalidReason: "provider_price_missing_or_invalid" },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: 0, currency: "USD" }, true),
    { amountMinor: null, currency: null, invalidReason: "provider_price_minor_invalid" },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: 4.99 }, true),
    { amountMinor: null, currency: null, invalidReason: "provider_currency_missing_or_invalid" },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: 4.99, currency: "US1" }, true),
    { amountMinor: null, currency: null, invalidReason: "provider_currency_missing_or_invalid" },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: 4.99, currency: " USD " }, true),
    { amountMinor: null, currency: null, invalidReason: "provider_currency_missing_or_invalid" },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: "4.99", currency: "EUR" }, true),
    { amountMinor: 499, currency: "eur", invalidReason: null },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: "499", currency: "JPY" }, true),
    { amountMinor: 499, currency: "jpy", invalidReason: null },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: "1.234", currency: "KWD" }, true),
    { amountMinor: 1234, currency: "kwd", invalidReason: null },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: "2.345", currency: "BHD" }, true),
    { amountMinor: 2345, currency: "bhd", invalidReason: null },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: "1.23", currency: "MGA" }, true),
    { amountMinor: 123, currency: "mga", invalidReason: null },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: "1.23", currency: "XCG" }, true),
    { amountMinor: 123, currency: "xcg", invalidReason: null },
  );
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: "21474836.47", currency: "USD" }, true),
    { amountMinor: 2_147_483_647, currency: "usd", invalidReason: null },
  );
  for (const input of [
    { price_in_purchased_currency: "4.99", currency: "ZZZ" },
    { price_in_purchased_currency: "4.99", currency: "ANG" },
    { price_in_purchased_currency: "4.99", currency: "BGN" },
    { price_in_purchased_currency: "499.0", currency: "JPY" },
    { price_in_purchased_currency: "4.999", currency: "USD" },
    { price_in_purchased_currency: "1.2345", currency: "KWD" },
    { price_in_purchased_currency: 0.1 + 0.2, currency: "USD" },
  ]) {
    const result = resolveProviderValue(input, true);
    assert.equal(result.amountMinor, null);
    assert.equal(result.currency, null);
    assert.ok(result.invalidReason);
  }
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: "21474836.48", currency: "USD" }, true),
    { amountMinor: null, currency: null, invalidReason: "provider_price_minor_invalid" },
  );
});

test("Edge and SQL use the same explicit ISO-4217 minor-unit exponent map", () => {
  const resolveExponent = loadCurrencyExponentResolver();
  const sqlMap = new Map(
    [...closeout.matchAll(/when '([a-z]{3})' then ([023])/gu)]
      .map((match) => [match[1], Number(match[2])]),
  );
  assert.ok(sqlMap.size > 100);
  for (const [currency, exponent] of sqlMap) {
    assert.equal(resolveExponent(currency), exponent, currency);
  }
  for (const currency of ["zzz", "xxx", "xau", "usd ", "US1"]) {
    assert.equal(resolveExponent(currency), null, currency);
  }
});

test("terminal creator-money events send no payload-derived financial authority", () => {
  const parser = sliceBetween(webhook, "const resolveAuthorityProviderValue", "const resolveCreatorMoneyProviderValue");
  assert.match(parser, /amountMinor: null, currency: null, invalidReason: null/u);

  const googleWriter = sliceBetween(
    webhook,
    "const writeGooglePlayCreatorMoneyFromRevenueCatEvent",
    "const writePremiumEntitlementFromRevenueCatEvent",
  );
  assert.match(googleWriter, /p_amount_minor: providerValue\.amountMinor/u);
  assert.match(googleWriter, /p_currency: providerValue\.currency/u);
  assert.match(closeout, /Lifecycle and terminal deliveries carry no authority over price/u);
  assert.match(closeout, /v_event_amount := coalesce\(v_bound_amount, v_intent\."amount_minor"\)/u);
  assert.match(closeout, /v_currency := coalesce\(v_bound_currency, lower\(v_intent\."currency"\)\)/u);

  const resolveProviderValue = loadProviderValueResolver();
  assert.deepEqual(
    resolveProviderValue({ price_in_purchased_currency: 999_999, currency: "ZZZ" }, false),
    { amountMinor: null, currency: null, invalidReason: null },
  );
});

test("all removal lifecycle events use one atomic cross-domain original-transaction dispatcher", () => {
  const writer = sliceBetween(
    webhook,
    "const writeRevenueCatTerminalEventFromRevenueCatEvent",
    "const writePremiumEntitlementFromRevenueCatEvent",
  );
  assert.match(writer, /\.rpc\("process_revenuecat_terminal_event_atomic"/u);
  for (const argument of [
    "p_provider", "p_provider_event_id", "p_event_type", "p_user_id",
    "p_reported_provider_product_id", "p_reported_provider_base_plan_id",
    "p_environment", "p_entitlement_status", "p_starts_at", "p_expires_at",
    "p_occurred_at", "p_raw_payload_hash", "p_period_type", "p_store",
    "p_platform", "p_original_transaction_id",
  ]) assert.match(writer, new RegExp(`${argument}:`, "u"), argument);
  assert.doesNotMatch(writer, /\.from\(|revenuecat_premium_transaction_authority|revenuecat_consumable_transaction_intents/u);
  assert.match(writer, /result\.duplicateEvent === true \|\| result\.duplicateProviderEvent === true/u);

  const handler = sliceBetween(webhook, "const storePolicy = revenueCatStorePolicy(event)", "const entitlementWrite = await");
  const dispatch = handler.indexOf("writeRevenueCatTerminalEventFromRevenueCatEvent");
  const genericCreator = handler.indexOf("if (!hasPremiumSignal(event))");
  assert.ok(dispatch >= 0 && genericCreator > dispatch);
  assert.match(handler, /TERMINAL_DISPATCH_EVENT_TYPES\.has\(terminalEventType\)/u);
  assert.match(handler, /&& terminalOriginalTransactionId/u);
  assert.match(handler, /never performs a TOCTOU-prone authority lookup/u);

  const eventSet = sliceBetween(webhook, "const TERMINAL_DISPATCH_EVENT_TYPES", "const isRecord");
  for (const eventType of [
    "CANCELLATION", "BILLING_ISSUE", "EXPIRATION", "REFUND", "REVOCATION", "SUBSCRIPTION_PAUSED",
  ]) assert.match(eventSet, new RegExp(`"${eventType}"`, "u"), eventType);

  const dispatcher = sliceBetween(
    closeout,
    'create or replace function public."process_revenuecat_terminal_event_atomic"',
    '-- Compatibility entry points also use the neutral terminal dispatcher',
  );
  assert.match(dispatcher, /v_premium_count\+v_creator_count=0/u);
  assert.match(dispatcher, /v_premium_count=1 and v_creator_count=1/u);
  assert.match(dispatcher, /terminal_dispatch_binding_missing/u);
  assert.match(dispatcher, /terminal_dispatch_binding_ambiguous/u);
  assert.match(dispatcher, /terminal_dispatch_subject_or_environment_mismatch/u);
  assert.match(dispatcher, /insert into public\."provider_events"/u);
  assert.match(dispatcher, /insert into public\."revenuecat_unbound_terminal_authority"/u);
  assert.match(dispatcher, /if v_domain='creator_money'/u);
  assert.match(dispatcher, /terminal_dispatch_domain','premium'/u);
  assert.match(dispatcher, /'authorityGranted',false/u);
  assert.match(dispatcher, /to service_role/u);
});

test("missing provider time blocks active authority but exact-bound terminal delivery revokes at receipt time", () => {
  const googleWriter = sliceBetween(
    webhook,
    "const writeGooglePlayCreatorMoneyFromRevenueCatEvent",
    "const writePremiumEntitlementFromRevenueCatEvent",
  );
  assert.match(googleWriter, /!providerOccurredAt\s*\? "provider_occurred_at_missing_or_invalid"/u);
  assert.match(googleWriter, /p_occurred_at: providerOccurredAt \?\? new Date\(\)\.toISOString\(\)/u);
  assert.match(googleWriter, /Active events with a missing provider time are ignored/u);
  assert.match(googleWriter, /signed non-active delivery, receipt time is a[\s\S]+conservative ordering fallback/u);

  const atomicInternal = sliceBetween(
    closeout,
    "create or replace function public.\"process_revenuecat_consumable_event_provider_internal\"",
    "create or replace function public.\"process_revenuecat_consumable_event_atomic\"",
  );
  assert.match(
    atomicInternal,
    /v_ignore_reason text := case when v_is_active\s+then nullif\(trim\(coalesce\(p_input_reason, ''\)\), ''\) else null end/u,
  );
  assert.match(atomicInternal, /v_authority_occurred_at := least\(v_occurred_at, v_now\)/u);
  assert.match(atomicInternal, /if v_ignore_reason is null and not v_is_active then/u);
  assert.match(atomicInternal, /original_transaction_binding_missing/u);
  assert.match(atomicInternal, /terminal_original_transaction_cannot_reopen/u);
});

test("Premium malformed active authority reaches the atomic ignored-event projector", () => {
  const premiumWriter = sliceBetween(
    webhook,
    "const writePremiumEntitlementFromRevenueCatEvent",
    "const writePremiumTransferFromRevenueCatEvent",
  );
  const rpcCall = premiumWriter.indexOf('.rpc("process_revenuecat_premium_event_atomic"');
  assert.ok(rpcCall >= 0);
  assert.match(premiumWriter, /const startsAt = toIsoFromMs\(event\.purchased_at_ms\)/u);
  assert.match(premiumWriter, /const providerOccurredAt = toIsoFromMs\(event\.event_timestamp_ms\)/u);
  assert.match(premiumWriter, /resolvePremiumProviderValue\(event, status\)/u);
  assert.doesNotMatch(premiumWriter, /if \(!productId\) return ignoredPremiumWrite/u);
  assert.match(premiumWriter, /UNRESOLVED_PROVIDER_PRODUCT_ID/u);
  assert.match(premiumWriter, /p_amount_minor: providerValue\.amountMinor/u);
  assert.match(premiumWriter, /p_currency: providerValue\.currency/u);
  assert.match(premiumWriter, /p_original_transaction_id: originalTransactionId/u);
  assert.match(
    premiumWriter,
    /p_occurred_at: authorityActive \? providerOccurredAt : providerOccurredAt \?\? new Date\(\)\.toISOString\(\)/u,
  );
  assert.doesNotMatch(premiumWriter, /if \(premiumInputReason\) return/u);
  assert.doesNotMatch(
    premiumWriter.slice(0, rpcCall + 60),
    /p_amount_minor: resolveAmountMinor|p_currency: resolveCurrency/u,
  );

  const premiumAtomic = sliceBetween(
    closeout,
    'create or replace function public."process_revenuecat_premium_event_atomic"',
    'revoke all on function public."record_revenuecat_premium_ignored_internal"',
  );
  assert.match(premiumAtomic, /premium_occurred_at_required/u);
  assert.match(premiumAtomic, /premium_occurred_at_future_skew/u);
  assert.match(premiumAtomic, /premium_finite_period_invalid/u);
  assert.match(premiumAtomic, /premium_positive_amount_required/u);
  assert.match(premiumAtomic, /premium_currency_invalid/u);
  assert.match(premiumAtomic, /record_revenuecat_premium_ignored_internal/u);
});

test("Google Play Premium binds the exact raw product/base-plan to one canonical server product", () => {
  const resolver = sliceBetween(
    webhook,
    "const resolveGooglePlayProductReference",
    "const isCreatorMoneyNotificationProduct",
  );
  assert.match(resolver, /const parts = rawProductId\.split\(":"\)/u);
  assert.match(resolver, /parts\.length !== 2 \|\| !parts\[0\] \|\| !parts\[1\]/u);
  assert.match(resolver, /\.eq\("provider_product_id", googleReference\.providerProductId\)/u);
  assert.match(resolver, /productQuery\.eq\("provider_base_plan_id", googleReference\.providerBasePlanId\)/u);
  assert.match(resolver, /productQuery\.is\("provider_base_plan_id", null\)/u);
  assert.match(resolver, /productQuery\.limit\(2\)/u);
  assert.match(resolver, /products\.length === 1 \? products\[0\] : null/u);
  assert.match(resolver, /providerProductId: providerText\(product\?\.provider_product_id\)/u);

  const premiumWriter = sliceBetween(
    webhook,
    "const writePremiumEntitlementFromRevenueCatEvent",
    "const writePremiumTransferFromRevenueCatEvent",
  );
  assert.match(
    premiumWriter,
    /const productIdentityResolved = rawProductIdentityUsable\s*&& hasExactPremiumStoreProductIdentity/u,
  );
  assert.match(premiumWriter, /const resolvedProductId = productIdentityResolved \?[^;]+: null/u);
  assert.match(premiumWriter, /const resolvedStoreMappingId = productIdentityResolved[\s\S]+: null/u);
  assert.match(premiumWriter, /p_provider_product_id: resolvedProviderProductId/u);
  assert.match(premiumWriter, /p_product_id: resolvedProductId/u);
  assert.match(premiumWriter, /p_store_mapping_id: resolvedStoreMappingId/u);
  assert.match(
    premiumWriter,
    /googleProductReference\?\.providerBasePlanId \?\? null/u,
  );
  assert.doesNotMatch(
    premiumWriter,
    /if \(!hasExactPremiumStoreProductIdentity\([\s\S]+return ignoredPremiumWrite/u,
  );
  assert.match(closeout, /premium_store_product_resolution_missing_or_ambiguous/u);
  assert.doesNotMatch(premiumWriter, /productId \?\? PREMIUM_PRODUCT_ID/u);
});

test("App Store Premium catalog lookup requires unique mapping cardinality", () => {
  const resolver = sliceBetween(
    webhook,
    "const readStoreProductResolution",
    "const isCreatorMoneyNotificationProduct",
  );
  assert.match(resolver, /const \{ data: mappingRows/u);
  assert.match(resolver, /\.limit\(2\)/u);
  assert.match(resolver, /const mappings = Array\.isArray\(mappingRows\)/u);
  assert.match(resolver, /mappings\.length === 1 \? mappings\[0\] : null/u);
  const mappingQuery = sliceBetween(resolver, "const { data: mappingRows", "if (mappingError)");
  assert.doesNotMatch(mappingQuery, /\.limit\(1\)|\.maybeSingle/u);
});

test("exact unresolved Premium catalog identity reaches durable ignored transaction tombstone", () => {
  const premiumWriter = sliceBetween(
    webhook,
    "const writePremiumEntitlementFromRevenueCatEvent",
    "const writePremiumTransferFromRevenueCatEvent",
  );
  const resolution = premiumWriter.indexOf("const productIdentityResolved");
  const rpc = premiumWriter.indexOf('.rpc("process_revenuecat_premium_event_atomic"');
  assert.ok(resolution >= 0 && rpc > resolution);
  assert.match(premiumWriter, /p_product_id: resolvedProductId/u);
  assert.match(premiumWriter, /p_store_mapping_id: resolvedStoreMappingId/u);
  assert.match(premiumWriter, /p_original_transaction_id: originalTransactionId/u);
  assert.match(premiumWriter, /p_provider_product_id: resolvedProviderProductId/u);

  const premiumAtomicStart = closeout.lastIndexOf(
    'create or replace function public."process_revenuecat_premium_event_atomic"',
  );
  assert.ok(premiumAtomicStart >= 0);
  const premiumAtomic = closeout.slice(premiumAtomicStart);
  assert.match(premiumAtomic, /if p_product_id is null then/u);
  assert.match(premiumAtomic, /premium_store_product_resolution_missing_or_ambiguous/u);
  assert.match(premiumAtomic, /revenuecat_premium_transaction_authority/u);
  assert.match(premiumAtomic, /'blocked'/u);
});

test("missing or conflicting signed product identity is durably consumed before it can be corrected", () => {
  assert.match(webhook, /const UNRESOLVED_PROVIDER_PRODUCT_ID = "<missing-or-ambiguous>"/u);
  assert.match(
    webhook,
    /const UNRESOLVED_PROVIDER_PRODUCT_REASON = "provider_product_identity_missing_or_ambiguous"/u,
  );

  const iosWriter = sliceBetween(
    webhook,
    "const writeIosConsumableFromRevenueCatEvent",
    "const writeGooglePlayCreatorMoneyFromRevenueCatEvent",
  );
  const googleWriter = sliceBetween(
    webhook,
    "const writeGooglePlayCreatorMoneyFromRevenueCatEvent",
    "const writePremiumEntitlementFromRevenueCatEvent",
  );
  const premiumWriter = sliceBetween(
    webhook,
    "const writePremiumEntitlementFromRevenueCatEvent",
    "const writePremiumTransferFromRevenueCatEvent",
  );
  for (const writer of [iosWriter, googleWriter]) {
    assert.doesNotMatch(writer, /if \(!productId\)[\s\S]*ignoredDynamicMoneyAccess/u);
    assert.match(writer, /!productId\s*\? UNRESOLVED_PROVIDER_PRODUCT_REASON/u);
    assert.match(writer, /p_provider_product_id: productId \?\? UNRESOLVED_PROVIDER_PRODUCT_ID/u);
  }
  assert.doesNotMatch(premiumWriter, /if \(!productId\) return ignoredPremiumWrite/u);
  assert.match(premiumWriter, /const providerProductIdentity = rawProductIdentityUsable && productId/u);
  assert.match(premiumWriter, /: UNRESOLVED_PROVIDER_PRODUCT_ID/u);
  assert.match(premiumWriter, /p_provider_product_id: resolvedProviderProductId/u);
  assert.match(premiumWriter, /p_original_transaction_id: originalTransactionId/u);

  const creatorAtomic = sliceBetween(
    closeout,
    'create or replace function public."process_revenuecat_consumable_event_provider_internal"',
    'create or replace function public."process_revenuecat_consumable_event_atomic"',
  );
  assert.match(creatorAtomic, /v_product_identity_unresolved boolean := v_provider_product_id = '<missing-or-ambiguous>'/u);
  assert.match(creatorAtomic, /revenuecat_provider_event_replay_mismatch/u);
  assert.match(creatorAtomic, /revenuecat_unbound_initial_authority/u);
  assert.match(creatorAtomic, /unbound_initial_original_transaction_reserved/u);

  const premiumAtomicStart = closeout.lastIndexOf(
    'create or replace function public."process_revenuecat_premium_event_atomic"',
  );
  assert.ok(premiumAtomicStart >= 0);
  const premiumAtomic = closeout.slice(premiumAtomicStart);
  assert.match(premiumAtomic, /premium_store_product_resolution_missing_or_ambiguous/u);
  assert.match(premiumAtomic, /revenuecat_premium_transaction_authority/u);
  assert.match(closeout, /revenuecat_premium_event_id_identity_mismatch/u);
});

test("ignored Premium authority is a deterministic blocked 200 and never reports a mirrored grant", () => {
  const premiumWriter = sliceBetween(
    webhook,
    "const writePremiumEntitlementFromRevenueCatEvent",
    "const writePremiumTransferFromRevenueCatEvent",
  );
  assert.match(premiumWriter, /const ignoredEvent = toText\(result\.status\) === "ignored"/u);
  assert.match(premiumWriter, /applied: !duplicateEvent && !ignoredEvent/u);
  assert.match(premiumWriter, /ignoreReason: ignoredEvent \? toText\(result\.reason\)/u);

  const response = sliceBetween(webhook, "const entitlementWrite = await", "} catch (error)");
  assert.match(response, /entitlementWrite\.ignoredEvent \? "ignored"/u);
  assert.match(response, /webhookProcessed: !entitlementWrite\.ignoredEvent/u);
  assert.match(response, /premiumGranted: entitlementWrite\.entitlementActive === true/u);
  assert.match(response, /moneyAccessMirrored: !entitlementWrite\.staleEvent && !entitlementWrite\.ignoredEvent/u);
  assert.match(response, /ignoreReason: entitlementWrite\.ignoreReason/u);
});

test("supported purchase events reach atomic switch enforcement instead of an in-memory early return", () => {
  const handler = sliceBetween(webhook, "const storePolicy = revenueCatStorePolicy(event)", "const entitlementWrite = await");
  assert.doesNotMatch(handler, /readGooglePlayPurchaseSwitchState/u);
  assert.doesNotMatch(handler, /google_play_purchase_switch_disabled/u);
  assert.match(handler, /normalizeEventType\(event\.type\) === "TRANSFER"/u);
  assert.doesNotMatch(handler, /readAppStorePurchaseSwitchState/u);
  assert.match(handler, /transferWrite\.status === "ignored"/u);
  assert.match(handler, /webhookProcessed: transferWrite\.status !== "ignored"/u);
  const premiumWriter = sliceBetween(
    webhook,
    "const writePremiumEntitlementFromRevenueCatEvent",
    "const writePremiumTransferFromRevenueCatEvent",
  );
  assert.doesNotMatch(premiumWriter, /google_play_product_environment_not_authoritative/u);

  const premiumAtomic = sliceBetween(
    closeout,
    'create or replace function public."process_revenuecat_premium_event_atomic"',
    'revoke all on function public."record_revenuecat_premium_ignored_internal"',
  );
  assert.match(premiumAtomic, /'revenuecat_google_play_enabled'/u);
  assert.match(premiumAtomic, /'provider_webhooks_enabled'/u);
  assert.match(premiumAtomic, /premium_provider_rail_disabled/u);
  assert.match(premiumAtomic, /premium_google_product_not_active/u);

  const transferAtomic = sliceBetween(
    closeout,
    'create or replace function public."process_revenuecat_premium_transfer_atomic"',
    'revoke all on function public."process_premium_transfer_pre_closeout"',
  );
  assert.match(transferAtomic, /'revenuecat_app_store_enabled'/u);
  assert.match(transferAtomic, /'provider_webhooks_enabled'/u);
  assert.match(transferAtomic, /'premium_provider_rail_disabled'/u);
  assert.match(transferAtomic, /v_event_id,'revenuecat_app_store'[\s\S]*'TRANSFER','ignored'/u);
});

test("App Store creator-money malformed active events use the durable ignored-event wrapper", () => {
  const iosWriter = sliceBetween(
    webhook,
    "const writeIosConsumableFromRevenueCatEvent",
    "const writeGooglePlayCreatorMoneyFromRevenueCatEvent",
  );
  assert.match(iosWriter, /\.rpc\("process_revenuecat_app_store_event_atomic"/u);
  assert.match(iosWriter, /p_input_reason: inputReason/u);
  assert.match(iosWriter, /p_amount_minor: providerValue\.amountMinor/u);
  assert.match(iosWriter, /p_currency: providerValue\.currency/u);
  assert.match(iosWriter, /p_occurred_at: providerOccurredAt \?\? new Date\(\)\.toISOString\(\)/u);
  assert.doesNotMatch(iosWriter, /if \(providerValue\.invalidReason\)[\s\S]*ignoredDynamicMoneyAccess/u);
  assert.doesNotMatch(iosWriter, /if \(!providerOccurredAt\)[\s\S]*ignoredDynamicMoneyAccess/u);
  assert.match(closeout, /process_revenuecat_app_store_event_atomic/u);
});

test("ignored events and original transactions cannot become authoritative after payload correction or switch activation", () => {
  const creatorAtomic = sliceBetween(
    closeout,
    'create or replace function public."process_revenuecat_consumable_event_provider_internal"',
    'create or replace function public."process_revenuecat_consumable_event_atomic"',
  );
  assert.match(creatorAtomic, /revenuecat_provider_event_replay_mismatch/u);
  assert.match(creatorAtomic, /v_provider\."raw_payload_hash" is distinct from p_raw_payload_hash/u);
  assert.match(creatorAtomic, /revenuecat_unbound_initial_authority/u);
  assert.match(creatorAtomic, /unbound_initial_original_transaction_reserved/u);
  assert.match(creatorAtomic, /first_ignore_reason/u);
  assert.match(creatorAtomic, /"status" = 'ignored'/u);

  const premiumIgnored = sliceBetween(
    closeout,
    'create or replace function public."record_revenuecat_premium_ignored_internal"',
    'alter function public."process_revenuecat_premium_event_atomic"',
  );
  assert.match(premiumIgnored, /revenuecat_premium_event_id_identity_mismatch/u);
  assert.match(premiumIgnored, /v_event\."raw_payload_hash" is distinct from p_raw_payload_hash/u);
  assert.match(premiumIgnored, /v_environment,v_event_type,'ignored'/u);

  const premiumTransactionTable = sliceBetween(
    closeout,
    'create table public."revenuecat_premium_transaction_authority"',
    'create or replace function public."premium_subject_has_finite_authority_internal"',
  );
  assert.match(premiumTransactionTable, /unique \("provider","original_transaction_id"\)/u);
  assert.match(premiumTransactionTable, /enable row level security/u);
  assert.match(premiumTransactionTable, /force row level security/u);
  assert.match(premiumTransactionTable, /revoke all on table[\s\S]*public,anon,authenticated,service_role/u);

  const premiumTransactionWrapper = sliceBetween(
    closeout,
    'create or replace function public."process_revenuecat_premium_event_atomic"(\n  p_provider text,',
    '-- TRANSFER is a retain/move lifecycle action',
  );
  assert.match(premiumTransactionWrapper, /p_original_transaction_id text/u);
  assert.match(premiumTransactionWrapper, /premium_original_transaction_id_required/u);
  assert.match(premiumTransactionWrapper, /revenuecat_premium_event_original_transaction_mismatch/u);
  assert.match(premiumTransactionWrapper, /revenuecat_premium_original_transaction_subject_mismatch/u);
  assert.match(premiumTransactionWrapper, /revenuecat_premium_original_transaction_product_mismatch/u);
  assert.match(premiumTransactionWrapper, /premium_original_transaction_initial_replay/u);
  assert.match(premiumTransactionWrapper, /premium_original_transaction_terminal_or_blocked/u);
  assert.match(premiumTransactionWrapper, /v_event_type='PRODUCT_CHANGE'/u);
  assert.match(premiumTransactionWrapper, /20-argument overload is the sole service API/u);
  assert.match(premiumTransactionWrapper, /uuid,uuid,text[\s\S]*\) to service_role/u);
});

test("successor database path uniquely binds and reuses exact original transaction provenance", () => {
  assert.match(closeout, /process_revenuecat_google_play_event_atomic/u);
  assert.match(closeout, /'revenuecat_google_play','android','google_play'/u);
  assert.match(closeout, /revenuecat_consumable_transaction_intents/u);
  assert.match(closeout, /binding_state" = 'exact'/u);
  assert.match(closeout, /cardinality\(v_candidate_ids\) <> 1/u);
  assert.match(closeout, /purchase_intent_binding_ambiguous/u);
  assert.match(closeout, /original_transaction_binding_ambiguous/u);
  assert.match(closeout, /bound_purchase_intent_authority_mismatch/u);
  assert.match(closeout, /v_intent\."provider" is distinct from v_provider_key/u);
  assert.match(closeout, /v_intent\."provider_product_id" is distinct from v_provider_product_id/u);
  assert.match(closeout, /v_intent\."source_type" is distinct from v_expected_source_type/u);
});

test("charged creator-money events preserve the immutable quote while revalidating current safety", () => {
  const sourceCheck = closeout.indexOf("The pending intent is the immutable quote accepted before Store checkout");
  const grantWrite = closeout.indexOf('insert into public."access_grants"', sourceCheck);
  assert.ok(sourceCheck >= 0);
  assert.ok(grantWrite > sourceCheck);
  for (const table of [
    "user_profiles",
    "paid_watch_party_offers",
    "videos",
    "paid_creator_events",
    "creator_vip_pass_offers",
    "creator_channel_subscription_offers",
  ]) assert.match(closeout.slice(sourceCheck, grantWrite), new RegExp(table, "u"), table);
  assert.match(closeout.slice(sourceCheck, grantWrite), /offer\."creator_id" = v_intent\."creator_id"/u);
  assert.match(closeout.slice(sourceCheck, grantWrite), /video\."owner_id" = v_intent\."creator_id"/u);
  assert.match(closeout.slice(sourceCheck, grantWrite), /media_scan_public_safe/u);
  assert.doesNotMatch(closeout.slice(sourceCheck, grantWrite), /offer\."price_cents" = v_mapping\."reference_price_minor"/u);
  assert.match(closeout, /'provider_reconciliation_required',v_is_active/u);
  assert.match(closeout, /refund_or_authoritative_provider_reconciliation_required/u);
});

test("Seat Pass capacity and exact-room admission remain bound to the projected active ticket", () => {
  const seatSource = sliceBetween(
    closeout,
    "elsif v_mapping.\"concept\" = 'seat_pass' then",
    "elsif v_mapping.\"concept\" = 'paid_video' then",
  );
  assert.match(seatSource, /join public\."watch_party_rooms" room on room\."party_id"=offer\."party_id"/u);
  assert.match(seatSource, /coalesce\(room\."is_active",false\)/u);
  assert.match(seatSource, /room\."room_type"='title'/u);
  assert.match(seatSource, /for update of offer/u);
  assert.match(seatSource, /ticket\."status"='active'/u);
  assert.match(seatSource, /ticket\."buyer_id"=p_user_id/u);
  assert.match(seatSource, /seat_pass_already_owned/u);
  assert.match(seatSource, /seat_pass_sold_out/u);

  const roomAdmission = sliceBetween(
    closeout,
    "create or replace function public.\"watch_party_room_self_access_allowed_internal\"",
    "alter table public.\"watch_party_room_memberships\"",
  );
  assert.match(roomAdmission, /join public\."paid_watch_party_tickets" ticket/u);
  assert.match(roomAdmission, /ticket\."access_grant_id"=grant_row\."id"/u);
  assert.match(roomAdmission, /ticket\."offer_id"=offer\."id"/u);
  assert.match(roomAdmission, /ticket\."party_id"=offer\."party_id"/u);
  assert.match(roomAdmission, /ticket\."buyer_id"=grant_row\."user_id"/u);
  assert.match(roomAdmission, /ticket\."status"='active'/u);
  assert.match(roomAdmission, /not transaction_link\."terminal"/u);
});

test("terminal and stale lifecycle deliveries cannot reopen access", () => {
  assert.match(closeout, /terminal_original_transaction_cannot_reopen/u);
  assert.match(closeout, /stale_provider_authority_event/u);
  assert.match(closeout, /"terminal" = "terminal" or v_is_access_terminal/u);
  assert.match(closeout, /where "provider" = v_provider_key/u);
  assert.match(closeout, /where "id" = v_intent\."id"[\s\S]+and "status" in \('consumed','revoked'\)/u);
});

test("Google Play path remains sandbox-only and cannot create payable or production authority", () => {
  const googleWriter = sliceBetween(
    webhook,
    "const writeGooglePlayCreatorMoneyFromRevenueCatEvent",
    "const writePremiumEntitlementFromRevenueCatEvent",
  );
  assert.match(googleWriter, /environment !== "sandbox"/u);
  assert.match(googleWriter, /google_play_sandbox_required/u);
  assert.match(closeout, /coalesce\(v_live_state, 'off'\) <> 'off'/u);
  assert.match(closeout, /'payout_ready',false/u);
  assert.match(closeout, /'live_money_action',false/u);
  assert.doesNotMatch(googleWriter, /api\.revenuecat\.com|fetch\(/u);
});
