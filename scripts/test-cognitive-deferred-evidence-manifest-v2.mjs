#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  ANDROID_RELEASE_PATH,
  POST_INTEGRATION_CORRECTION_KIND,
  V1_MANIFEST_PATH,
  V2_MANIFEST_PATH,
  buildImportPlan,
  buildPostIntegrationEntry,
  buildV2FromV1,
  computeManifestHash,
  readJson,
  validateCanonicalV2,
  validateHistoricalV1,
} from "./validate-cognitive-deferred-evidence-manifest.mjs";

const v1 = readJson(V1_MANIFEST_PATH);
const v2 = readJson(V2_MANIFEST_PATH);
const release = readJson(ANDROID_RELEASE_PATH);
const clone = (value) => structuredClone(value);
let passed = 0;
const test = (name, callback) => {
  callback();
  passed += 1;
  return name;
};
const expectV2Failure = (mutate, expected) => {
  const candidate = clone(v2);
  mutate(candidate);
  candidate.manifestHash = computeManifestHash(candidate);
  assert.throws(
    () => validateCanonicalV2({ manifest: candidate, release, v1 }),
    expected,
  );
};

test("historical v1 validates but is not canonical", () => {
  assert.equal(validateHistoricalV1(v1).canonicalForFutureImport, false);
});
test("canonical v2 validates", () => {
  assert.equal(
    validateCanonicalV2({ manifest: v2, release, v1 }).canonicalForFutureImport,
    true,
  );
});
test("v2 deterministically rebuilds from v1 and release identity", () => {
  const rebuilt = buildV2FromV1({ release, v1 });
  const currentHistoricalPrefix = {
    ...v2,
    entries: v2.entries.slice(0, v1.entries.length),
    manifestHash: rebuilt.manifestHash,
  };
  assert.deepEqual(rebuilt, currentHistoricalPrefix);
});
test("v2 deterministic manifest hash verifies", () => {
  assert.equal(v2.manifestHash, computeManifestHash(v2));
});
test("v2 preserves all original evidence keys", () => {
  assert.deepEqual(
    v2.entries
      .slice(0, v1.entries.length)
      .map((entry) => entry.originalEvidenceKey),
    v1.entries.map((entry) => entry.evidenceKey),
  );
});
test("v2 regenerates every future import key", () => {
  assert.ok(
    v2.entries.slice(0, v1.entries.length).every(
      (entry, index) => entry.futureImportKey !== v1.entries[index].futureImportKey,
    ),
  );
});
test("v2 amendment linkage covers every corrected Android entry", () => {
  assert.equal(
    v2.entries.filter(
      (entry) =>
        entry.correctionKind === "corrected_android_build84_release_identity",
    ).length,
    6,
  );
});
test("build 84 identities match the release manifest", () => {
  const corrected = v2.entries.filter(
    (entry) =>
      entry.correctionKind === "corrected_android_build84_release_identity",
  );
  assert.ok(
    corrected.every(
      (entry) =>
        entry.appVersion === release.appVersion &&
        entry.appBuild === release.nativeBuild &&
        entry.appRuntime === release.runtimeVersion &&
        entry.appChannel === release.channel &&
        entry.distributionSource === release.distributionSource,
    ),
  );
});
test("mismatched app version fails", () => {
  expectV2Failure(
    (candidate) => {
      candidate.entries[1].appVersion = "1.0.1";
    },
    /appVersion release identity mismatch/u,
  );
});
test("mismatched native build fails", () => {
  expectV2Failure(
    (candidate) => {
      candidate.entries[1].appBuild = "80";
    },
    /appBuild release identity mismatch/u,
  );
});
test("mismatched runtime fails", () => {
  expectV2Failure(
    (candidate) => {
      candidate.entries[1].appRuntime = "1.0.0";
    },
    /appRuntime release identity mismatch/u,
  );
});
test("distribution source cannot be used as update channel", () => {
  expectV2Failure(
    (candidate) => {
      candidate.entries[1].appChannel = "google_play_internal";
    },
    /appChannel release identity mismatch/u,
  );
});
test("mismatched distribution source fails", () => {
  expectV2Failure(
    (candidate) => {
      candidate.entries[1].distributionSource = "sideload";
    },
    /distributionSource release identity mismatch/u,
  );
});
test("historical v1 cannot produce an import plan", () => {
  assert.throws(
    () => buildImportPlan({ manifest: v1 }),
    /canonical v2 manifest required/u,
  );
});
test("canonical plan selects v2 and conflict-as-no-op", () => {
  const plan = buildImportPlan({
    evaluatedAt: "2026-07-25T15:30:00.000Z",
    manifest: v2,
  });
  assert.match(plan.canonicalManifestPath, /manifest-v2\.json$/u);
  assert.equal(plan.duplicatePolicy, "future_import_key_conflict_is_no_op");
  assert.ok(
    plan.plan.every(
      (entry) =>
        entry.conflictBehavior === "future_import_key_conflict_is_no_op",
    ),
  );
});
test("stale evidence requires reevaluation", () => {
  const plan = buildImportPlan({
    evaluatedAt: "2026-09-01T00:00:00.000Z",
    manifest: v2,
  });
  assert.ok(
    plan.plan.every(
      (entry) => entry.action === "reevaluate_stale_evidence_before_import",
    ),
  );
});
test("original observation time remains distinct from import time", () => {
  const plan = buildImportPlan({
    evaluatedAt: "2026-07-25T15:30:00.000Z",
    manifest: v2,
  });
  assert.ok(
    plan.plan.every(
      (entry, index) =>
        entry.originalObservedAt === v2.entries[index].observedAt &&
        entry.importTime === null &&
        entry.preserveOriginalObservedAt,
    ),
  );
});
test("a post-OTA observation appends without rewriting historical entries", () => {
  const candidate = clone(v2);
  const evidenceKey = "a".repeat(64);
  const entry = buildPostIntegrationEntry({
    evidence: {
      evaluatorResult: "accepted",
      evidenceKey,
      evidenceType: "android_post_ota_after_state",
      expiresAt: "2026-08-24T20:00:00.000Z",
      findingKey: null,
      importEligibility: "audit_only",
      importStatus: "not_imported",
      metricHashes: ["b".repeat(64)],
      observedAt: "2026-07-25T20:00:00.000Z",
      platform: "android",
      retentionClass: "sanitized_nonpersonal_30d",
      sourceCommit: "c".repeat(40),
      synthetic: false,
    },
    release,
  });
  candidate.entries.push(entry);
  candidate.manifestHash = computeManifestHash(candidate);
  const summary = validateCanonicalV2({
    manifest: candidate,
    release,
    v1,
  });
  assert.equal(summary.entries, v2.entries.length + 1);
  assert.equal(entry.correctionKind, POST_INTEGRATION_CORRECTION_KIND);
  assert.deepEqual(
    candidate.entries.slice(0, v2.entries.length),
    v2.entries,
  );
  const plan = buildImportPlan({
    evaluatedAt: "2026-07-25T20:01:00.000Z",
    manifest: candidate,
  });
  const appendedPlanEntry = plan.plan.at(-1);
  assert.equal(appendedPlanEntry.originalObservedAt, entry.observedAt);
  assert.equal(appendedPlanEntry.idempotencyKey, entry.futureImportKey);
  assert.equal(appendedPlanEntry.importTime, null);
  assert.equal(appendedPlanEntry.preserveOriginalObservedAt, true);
});
test("a post-OTA observation with release identity drift fails", () => {
  const candidate = clone(v2);
  const entry = buildPostIntegrationEntry({
    evidence: {
      evaluatorResult: "accepted",
      evidenceKey: "d".repeat(64),
      evidenceType: "android_post_ota_after_state",
      expiresAt: "2026-08-24T20:00:00.000Z",
      findingKey: null,
      importEligibility: "audit_only",
      importStatus: "not_imported",
      metricHashes: ["e".repeat(64)],
      observedAt: "2026-07-25T20:00:00.000Z",
      platform: "android",
      retentionClass: "sanitized_nonpersonal_30d",
      sourceCommit: "f".repeat(40),
      synthetic: false,
    },
    release,
  });
  entry.appRuntime = "1.0.0";
  candidate.entries.push(entry);
  candidate.manifestHash = computeManifestHash(candidate);
  assert.throws(
    () => validateCanonicalV2({ manifest: candidate, release, v1 }),
    /appRuntime release identity mismatch/u,
  );
});
test("duplicate evidence fails", () => {
  expectV2Failure(
    (candidate) => {
      candidate.entries[1].evidenceKey = candidate.entries[0].evidenceKey;
      candidate.entries[1].originalEvidenceKey =
        candidate.entries[0].originalEvidenceKey;
    },
    /strictly equal|duplicate evidence key/u,
  );
});
test("duplicate future import key fails", () => {
  expectV2Failure(
    (candidate) => {
      candidate.entries[1].futureImportKey =
        candidate.entries[0].futureImportKey;
    },
    /duplicate import key/u,
  );
});
test("no entry fabricates remote persistence", () => {
  assert.equal(v2.remotePersistencePerformed, false);
  assert.ok(v2.entries.every((entry) => entry.importStatus === "not_imported"));
});

console.log(`Cognitive deferred evidence identity: ${passed}/${passed} passed`);
