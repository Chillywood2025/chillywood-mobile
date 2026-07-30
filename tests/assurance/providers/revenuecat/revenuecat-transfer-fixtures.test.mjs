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

const runOrderingSchedule = ({ operations }) => {
  const authority = { source: 0, target: 0 };
  const appliedTransfers = new Set();
  const outcomes = [];
  let owner = "source";

  for (const operation of operations) {
    if (operation.kind === "lifecycle") {
      authority[operation.user] = operation.occurredAt;
      owner = operation.user;
      outcomes.push("lifecycle_applied");
      continue;
    }
    if (appliedTransfers.has(operation.eventId)) {
      outcomes.push("duplicate_ignored");
      continue;
    }
    if (Math.max(authority.source, authority.target) > operation.occurredAt) {
      outcomes.push("transfer_event_stale");
      continue;
    }
    appliedTransfers.add(operation.eventId);
    authority.source = operation.occurredAt;
    authority.target = operation.occurredAt;
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
  assert.match(source, /revenuecat-premium:/u);
  assert.match(source, /transfer_event_stale/u);
  assert.match(source, /p_occurred_at is null/u);
  assert.match(source, /process_revenuecat_premium_transfer_ordered_internal/u);
  assert.doesNotMatch(source, /create or replace function public\."process_revenuecat_premium_transfer_atomic_internal"/u);
  assert.ok(source.indexOf('if v_source_transfer_event."id" is not null') < source.indexOf("transfer_event_stale"));
  assert.match(source, /if v_source_transfer_event\."id" is not null[\s\S]+or v_target_transfer_event\."id" is not null[\s\S]+process_revenuecat_premium_transfer_atomic_internal/u);
  assert.match(deployedSource, /v_source_transfer_event\."id" is null[\s\S]+or v_target_transfer_event\."id" is null[\s\S]+transfer_partial_or_identity_mismatch/u);
});
