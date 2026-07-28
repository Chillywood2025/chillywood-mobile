import assert from "node:assert/strict";
import test from "node:test";
import {
  hashJson,
  makeResponse,
  validateEnvelope,
} from "../src/contracts.mjs";
import { PRINCIPAL_BY_ID, RUNTIME_MANIFEST } from "../src/manifest.mjs";

const UUID_A = "10000000-0000-4000-8000-000000000001";
const UUID_B = "20000000-0000-4000-8000-000000000002";
const UUID_C = "30000000-0000-4000-8000-000000000003";
const COMMIT = "a".repeat(40);

const sentinelPayload = {
  action: "collect_sentinel_run",
  collectionIdempotencyHash: "1".repeat(64),
  environment: "production",
  evaluationExpiresAt: "2026-07-24T12:10:00.000Z",
  evidenceManifestHash: "2".repeat(64),
  metricManifest: {
    sanitizationVersion: "bounded-nonpersonal-v1",
    schemaVersion: "product-sentinel-v1",
  },
  observationFinishedAt: "2026-07-24T12:00:05.000Z",
  observationStartedAt: "2026-07-24T12:00:00.000Z",
  physicalProofStatus: "installed_ui_observed",
  platform: "android",
  projectId: UUID_C,
  resultStatus: "failed",
  routeOrSurface: "Home main tab",
  runtimeIdentityHash: "3".repeat(64),
  sentinelKey: "visual_product_experience_sentinel",
  sourceBuildHash: "4".repeat(64),
  taskId: UUID_B,
};

const envelope = async (changes = {}) => {
  const payload = changes.payload ?? sentinelPayload;
  return {
    deadlineAt: "2026-07-24T12:00:30.000Z",
    environment: "production",
    operation: "collect_sentinel_run",
    payload,
    payloadHash: await hashJson(payload),
    platform: "android",
    principal: "cognitive_sentinel_collector",
    projectId: UUID_C,
    requestId: UUID_A,
    schemaVersion: RUNTIME_MANIFEST.schemaVersion,
    sourceCommit: COMMIT,
    taskId: UUID_B,
    ...changes,
  };
};

test("accepts one exact reviewed sentinel contract", async () => {
  const result = await validateEnvelope(
    await envelope(),
    Date.parse("2026-07-24T12:00:00.000Z"),
    60_000,
    (principal) => PRINCIPAL_BY_ID.get(principal),
  );
  assert.equal(result.ok, true);
});

test("accepts the exact sentinel preflight only for the sentinel principal", async () => {
  const payload = {
    ...sentinelPayload,
    action: "preflight_visual_sentinel_collection",
  };
  const valid = await envelope({
    operation: "preflight_visual_sentinel_collection",
    payload,
  });

  assert.equal(
    (await validateEnvelope(
      valid,
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).ok,
    true,
  );
  assert.equal(
    (await validateEnvelope(
      {
        ...valid,
        principal: "cognitive_product_quality_triage",
      },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "envelope_scope_rejected",
  );
});

test("accepts only the collector generic-manifest predicate diagnostic", async () => {
  const payload = {
    action: "preflight_visual_generic_manifest_predicates",
    evidenceManifestHash: "2".repeat(64),
    metricManifest: sentinelPayload.metricManifest,
    sentinelKey: "visual_product_experience_sentinel",
  };
  const valid = await envelope({
    operation: "preflight_visual_generic_manifest_predicates",
    payload,
  });

  assert.equal(
    (await validateEnvelope(
      valid,
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).ok,
    true,
  );
  assert.equal(
    (await validateEnvelope(
      {
        ...valid,
        principal: "cognitive_product_quality_triage",
      },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "envelope_scope_rejected",
  );
});

test("LiveKit no-finding attestation is evaluator-only and schema-closed", async () => {
  const payload = {
    action: "attest_livekit_bounded_failure_no_finding",
    sentinelRunId: UUID_A,
  };
  const valid = await envelope({
    operation: "attest_livekit_bounded_failure_no_finding",
    payload,
    principal: "cognitive_product_quality_evaluator",
  });
  assert.equal(
    (await validateEnvelope(
      valid,
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).ok,
    true,
  );
  assert.equal(
    (await validateEnvelope(
      {
        ...valid,
        principal: "cognitive_product_quality_triage",
      },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "envelope_scope_rejected",
  );
  const tamperedPayload = { ...payload, verdict: "passed" };
  assert.equal(
    (await validateEnvelope(
      {
        ...valid,
        payload: tamperedPayload,
        payloadHash: await hashJson(tamperedPayload),
      },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "operation_schema_rejected",
  );
});

test("LiveKit bounded no-finding consumption is triage-only and schema-closed", async () => {
  const payload = {
    action: "triage_livekit_bounded_failure_no_finding",
    attestationId: UUID_A,
  };
  const valid = await envelope({
    operation: "triage_livekit_bounded_failure_no_finding",
    payload,
    principal: "cognitive_product_quality_triage",
  });
  assert.equal(
    (await validateEnvelope(
      valid,
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).ok,
    true,
  );
  assert.equal(
    (await validateEnvelope(
      {
        ...valid,
        principal: "cognitive_product_quality_evaluator",
      },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "envelope_scope_rejected",
  );
  const tamperedPayload = { ...payload, verdict: "passed" };
  assert.equal(
    (await validateEnvelope(
      {
        ...valid,
        payload: tamperedPayload,
        payloadHash: await hashJson(tamperedPayload),
      },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "operation_schema_rejected",
  );
});

test("rejects extra fields, action drift, hash drift, scope drift and expiry", async () => {
  const valid = await envelope();
  assert.equal(
    (await validateEnvelope(
      { ...valid, extra: true },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).ok,
    false,
  );
  assert.equal(
    (await validateEnvelope(
      { ...valid, payload: { ...valid.payload, action: "record_run" } },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "operation_schema_rejected",
  );
  assert.equal(
    (await validateEnvelope(
      { ...valid, payloadHash: "f".repeat(64) },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "payload_hash_mismatch",
  );
  assert.equal(
    (await validateEnvelope(
      { ...valid, taskId: UUID_A },
      Date.parse("2026-07-24T12:00:00.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "task_scope_mismatch",
  );
  assert.equal(
    (await validateEnvelope(
      valid,
      Date.parse("2026-07-24T12:00:31.000Z"),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    )).error,
    "envelope_deadline_rejected",
  );
});

test("response envelope is exact and result-bound", async () => {
  const input = await envelope();
  const response = await makeResponse({
    envelope: input,
    result: { findingId: UUID_A, status: "persisted" },
    runtime: {
      sourceCommit: COMMIT,
      versionId: "version-safe-id",
    },
    status: "completed",
  });
  assert.equal(response.resultHash, await hashJson(response.result));
  assert.deepEqual(Object.keys(response).sort(), [
    "operation", "principal", "requestId", "result", "resultHash", "runtime",
    "schemaVersion", "status",
  ]);
  await assert.rejects(
    () =>
      makeResponse({
        envelope: input,
        result: undefined,
        runtime: {},
        status: "completed",
      }),
    /response_payload_rejected/u,
  );
});
