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
