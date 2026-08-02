import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveRevenueCatTransferUsers } from "../../../../supabase/functions/revenuecat-webhook/store-policy.mjs";

const corpus = JSON.parse(readFileSync(
  new URL("./revenuecat-transfer-fixtures-v1.json", import.meta.url),
  "utf8",
));
const requiredCategories = [
  "success",
  "invalid_signature",
  "duplicate",
  "delayed",
  "out_of_order",
  "missing_field",
  "unknown_type",
  "retry",
  "partial_failure",
  "provider_timeout",
  "environment_mismatch",
];

const eventFor = (fixture) => {
  const event = { ...corpus.baseEvent, ...(fixture.eventPatch ?? {}) };
  for (const field of fixture.removeFields ?? []) delete event[field];
  return event;
};

const authorityRank = Object.freeze({
  cancellation: 1,
  purchase: 2,
  renewal: 3,
  transfer: 4,
  expiration: 5,
  refund: 6,
  revocation: 7,
});
const authorityTuple = (operation) => ({
  eventId: operation.eventId,
  rank: authorityRank[operation.eventType ?? (operation.kind === "transfer" ? "transfer" : "renewal")],
  time: operation.occurredAt,
});
const isNewer = (existing, candidate) => existing && (
  existing.time > candidate.time
  || (existing.time === candidate.time && (
    existing.rank > candidate.rank
    || (existing.rank === candidate.rank && existing.eventId.localeCompare(candidate.eventId) > 0)
  ))
);

const runOrderingSchedule = ({ operations }, { ignoreLifecycleOrdering = false } = {}) => {
  const authority = { source: null, target: null };
  const appliedTransfers = new Set();
  const appliedLifecycle = new Set();
  const outcomes = [];
  let owner = "source";

  for (const operation of operations) {
    if (operation.kind === "lifecycle") {
      if (appliedLifecycle.has(operation.eventId)) {
        outcomes.push("duplicate_ignored");
        continue;
      }
      const candidate = authorityTuple(operation);
      if (!ignoreLifecycleOrdering && isNewer(authority[operation.user], candidate)) {
        outcomes.push("revenuecat_event_stale");
        continue;
      }
      appliedLifecycle.add(operation.eventId);
      authority[operation.user] = candidate;
      owner = operation.user;
      outcomes.push("lifecycle_applied");
      continue;
    }
    if (appliedTransfers.has(operation.eventId)) {
      outcomes.push("duplicate_ignored");
      continue;
    }
    const candidate = authorityTuple(operation);
    if (isNewer(authority.source, candidate) || isNewer(authority.target, candidate)) {
      outcomes.push("transfer_event_stale");
      continue;
    }
    appliedTransfers.add(operation.eventId);
    authority.source = candidate;
    authority.target = candidate;
    owner = "target";
    outcomes.push("transfer_applied");
  }
  return { outcomes, owner };
};

test("sanitized corpus covers every required provider-event class exactly once", () => {
  assert.equal(corpus.sanitized, true);
  assert.equal(corpus.syntheticOnly, true);
  assert.equal(corpus.liveProviderReadback, false);
  assert.equal(corpus.providerBehaviorProved, false);
  assert.deepEqual(
    corpus.cases.map(({ category }) => category).sort(),
    requiredCategories.toSorted(),
  );
  assert.equal(new Set(corpus.cases.map(({ id }) => id)).size, corpus.cases.length);
});

test("ordering schedules deterministically preserve newer authority and duplicate idempotency", () => {
  for (const schedule of corpus.orderingSchedules) {
    const result = runOrderingSchedule(schedule);
    assert.deepEqual(result.outcomes, schedule.expectedOutcomes, schedule.id);
    assert.equal(result.owner, schedule.expectedOwner, schedule.id);
    assert.equal(result.outcomes.length, schedule.operations.length, schedule.id);
  }
});

test("reverse-order negative control fails when lifecycle chronology enforcement is removed", () => {
  const schedule = corpus.orderingSchedules.find(
    ({ id }) => id === "newer-transfer-before-waiting-older-source-renewal",
  );
  assert.ok(schedule);
  assert.notDeepEqual(
    runOrderingSchedule(schedule, { ignoreLifecycleOrdering: true }).outcomes,
    schedule.expectedOutcomes,
  );
});

test("fixture payloads exercise the pure transfer-identity contract and keep harness faults out of payloads", () => {
  for (const fixture of corpus.cases) {
    const event = eventFor(fixture);
    const resolved = resolveRevenueCatTransferUsers(event);
    assert.equal(
      resolved !== null,
      fixture.resolverExpectation === "identities_resolved",
      fixture.id,
    );
    assert.equal(Object.hasOwn(event, "harnessFault"), false, fixture.id);
    assert.equal(Object.hasOwn(event, "harnessAuthorization"), false, fixture.id);
    assert.equal(Object.hasOwn(event, "failpoint"), false, fixture.id);
  }
});

test("corpus contains no credential-shaped field or value", () => {
  const serialized = JSON.stringify(corpus);
  assert.doesNotMatch(serialized, /api[_-]?key|bearer\s|private[_-]?key|webhook[_-]?secret|sk_(live|test)_/iu);
});

test("endpoint source keeps signature rejection, transfer routing, atomic RPC, and retry classification explicit", () => {
  const source = readFileSync(
    new URL("../../../../supabase/functions/revenuecat-webhook/index.ts", import.meta.url),
    "utf8",
  );
  const signatureGate = source.indexOf("if (!signatureVerified)");
  const transferRoute = source.indexOf('normalizeEventType(event.type) === "TRANSFER"');
  const atomicRpc = source.indexOf('.rpc("process_revenuecat_premium_transfer_atomic"');
  const retryableFailure = source.indexOf("retryableFailure: !nonRetriablePayloadError");

  assert.ok(signatureGate >= 0);
  assert.ok(transferRoute > signatureGate);
  assert.ok(atomicRpc >= 0);
  assert.ok(retryableFailure > transferRoute);
});

test("forward-only ordering migration shares authority locks and preserves deployed definitions", () => {
  const source = readFileSync(
    new URL("../../../../supabase/migrations/20260730170000_revenuecat_transfer_authoritative_ordering.sql", import.meta.url),
    "utf8",
  );
  const deployedSource = readFileSync(
    new URL("../../../../supabase/migrations/20260730153724_revenuecat_verified_transfer_reconciliation.sql", import.meta.url),
    "utf8",
  );
  const ordinaryStart = source.indexOf('create or replace function public."process_revenuecat_premium_event_ordered_internal"');
  const ordinaryEnd = source.indexOf('create or replace function public."process_revenuecat_premium_event_atomic"', ordinaryStart);
  const ordinarySource = source.slice(ordinaryStart, ordinaryEnd);
  assert.match(source, /revenuecat-premium:/u);
  assert.match(source, /transfer_event_stale/u);
  assert.match(source, /p_occurred_at is null/u);
  assert.match(source, /process_revenuecat_premium_transfer_ordered_internal/u);
  assert.match(source, /process_revenuecat_premium_event_ordered_internal/u);
  assert.match(source, /lock table public\."monetization_products" in share mode/u);
  assert.equal(source.match(/lock table public\."monetization_products" in share mode/gu)?.length, 2);
  assert.match(source, /revenuecat_event_stale/u);
  assert.equal(source.match(/revenuecat_premium_authority_is_newer_internal/gu)?.length, 4);
  assert.equal(source.match(/!~ '\^\[0-9a-f\]\{64\}\$'/gu)?.length, 2);
  assert.match(source, /transfer_source_provider_grant_ambiguous/u);
  assert.match(source, /transfer_target_provider_grant_ambiguous/u);
  assert.match(source, /event\."metadata"->>'transfer_provider_event_id'/u);
  assert.match(source, /'status', 'duplicate_ignored'/u);
  assert.doesNotMatch(source, /create or replace function public\."process_revenuecat_premium_transfer_atomic_internal"/u);
  assert.doesNotMatch(source, /create or replace function public\."process_revenuecat_premium_event_atomic_internal"/u);
  assert.ok(source.indexOf('if v_source_transfer_event."id" is not null') < source.indexOf("transfer_event_stale"));
  assert.ok(source.indexOf("'revenuecat-premium:'") < source.indexOf("'revenuecat-transfer:'"));
  assert.ok(ordinarySource.indexOf("'revenuecat-premium:'") < ordinarySource.indexOf("'revenuecat-event:'"));
  assert.ok(ordinarySource.indexOf("v_has_newer_authority") < ordinarySource.lastIndexOf("process_revenuecat_premium_event_atomic_internal"));
  assert.match(source, /if v_source_transfer_event\."id" is not null[\s\S]+or v_target_transfer_event\."id" is not null[\s\S]+transfer_partial_or_identity_mismatch[\s\S]+'duplicateEvent', true/u);
  assert.match(deployedSource, /v_source_transfer_event\."id" is null[\s\S]+or v_target_transfer_event\."id" is null[\s\S]+transfer_partial_or_identity_mismatch/u);
});

test("database concurrency harness uses observable advisory barriers for every required race", () => {
  const source = readFileSync(
    new URL("../../../../scripts/test-revenuecat-transfer-concurrency.mjs", import.meta.url),
    "utf8",
  );
  for (const race of [
    "source-renewal", "target-renewal", "source-refund", "source-revocation",
    "shared-source", "shared-target", "reversed-users", "duplicate",
    "after_source", "after_target",
  ]) assert.match(source, new RegExp(race, "u"), race);
  assert.match(source, /pg_stat_activity/u);
  assert.match(source, /wait_event_type='Lock' and wait_event='advisory'/u);
  assert.match(source, /count\(distinct mapping\.product_id\)/u); assert.match(source, /json_agg\(id::text order by id\)/u); assert.equal(source.match(/canonicalProduct: mappedProductId/gu)?.length, 3); assert.equal(source.match(/canonicalProduct: firstTransferProductId/gu)?.length, 4); assert.match(source, /for \(const eventType of \["REFUND", "REVOCATION"\]\)/u); assert.match(source, /provider='revenuecat_app_store'[\s\S]+provider_product_id='com\.chillywood\.premium\.monthly'[\s\S]+environment='sandbox'[\s\S]+concept='premium'[\s\S]+platform='ios'[\s\S]+store='app_store'[\s\S]+status='sandbox'[\s\S]+unlocks_digital_access is true[\s\S]+grants_livekit_authority is false[\s\S]+creates_payable_balance is false/u);
  assert.match(source, /pg_locks/u);
  assert.match(source, /secondWaiting/u);
  assert.match(source, /firstGranted/u);
  assert.match(source, /pg_advisory_xact_lock/u);
  assert.doesNotMatch(source, /pg_sleep/u);
});
