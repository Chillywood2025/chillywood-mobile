#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(
  root,
  "config/intelligence/cognitive-level01-deferred-evidence-manifest-v1.json",
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_TEXT = /^[A-Za-z0-9_.:-]{1,128}$/u;
const ENTRY_KEYS = [
  "appBuild",
  "appChannel",
  "appRuntime",
  "evaluatorResult",
  "evidenceKey",
  "evidenceType",
  "expiresAt",
  "findingKey",
  "futureImportKey",
  "importEligibility",
  "importStatus",
  "metricHashes",
  "observedAt",
  "platform",
  "retentionClass",
  "sourceCommit",
  "synthetic",
].sort();
const IMPORT_ELIGIBILITY = new Set([
  "audit_only",
  "eligible_after_runtime_unlock",
  "not_eligible",
  "requires_reevaluation",
]);

const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const hashJson = (value) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const validTimestamp = (value) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(Date.parse(value)).toISOString() === value;
const validNullableSafeText = (value) =>
  value === null || (typeof value === "string" && SAFE_TEXT.test(value));

assert.equal(
  manifest.schemaVersion,
  "chillywood-cognitive-deferred-evidence-v1",
);
assert.equal(manifest.appendOnly, true);
assert.deepEqual(manifest.modeStates, {
  isolatedAutonomous: "ISOLATED_AUTONOMOUS_PENDING",
  ownerAssisted: "OWNER_ASSISTED_ACTIVE",
});
assert.equal(manifest.rawEvidencePolicy, "outside_git_owner_only");
assert.equal(manifest.remotePersistencePerformed, false);
assert.ok(Array.isArray(manifest.entries) && manifest.entries.length > 0);

const evidenceKeys = new Set();
const importKeys = new Set();
let priorObservedAt = 0;
for (const entry of manifest.entries) {
  assert.ok(exactKeys(entry, ENTRY_KEYS), "deferred evidence entry shape drift");
  assert.match(entry.evidenceKey, SHA256);
  assert.match(entry.futureImportKey, SHA256);
  assert.match(entry.sourceCommit, COMMIT);
  assert.ok(!evidenceKeys.has(entry.evidenceKey), "duplicate evidence key");
  assert.ok(!importKeys.has(entry.futureImportKey), "duplicate import key");
  evidenceKeys.add(entry.evidenceKey);
  importKeys.add(entry.futureImportKey);
  assert.ok(SAFE_TEXT.test(entry.evidenceType));
  assert.ok(SAFE_TEXT.test(entry.platform));
  assert.ok(SAFE_TEXT.test(entry.appChannel));
  assert.ok(SAFE_TEXT.test(entry.appRuntime));
  assert.ok(validNullableSafeText(entry.appBuild));
  assert.ok(SAFE_TEXT.test(entry.evaluatorResult));
  assert.ok(entry.findingKey === null || SHA256.test(entry.findingKey));
  assert.equal(entry.importStatus, "not_imported");
  assert.ok(IMPORT_ELIGIBILITY.has(entry.importEligibility));
  assert.equal(entry.retentionClass, "sanitized_nonpersonal_30d");
  assert.equal(typeof entry.synthetic, "boolean");
  assert.ok(
    Array.isArray(entry.metricHashes) &&
      entry.metricHashes.length > 0 &&
      entry.metricHashes.length <= 16 &&
      entry.metricHashes.every((value) => SHA256.test(value)),
  );
  assert.ok(validTimestamp(entry.observedAt));
  assert.ok(validTimestamp(entry.expiresAt));
  const observedAt = Date.parse(entry.observedAt);
  assert.ok(observedAt >= priorObservedAt, "manifest must be append ordered");
  assert.ok(Date.parse(entry.expiresAt) > observedAt);
  priorObservedAt = observedAt;
}

const plan = manifest.entries.map((entry) => {
  const action = entry.importEligibility === "eligible_after_runtime_unlock"
    ? "defer_until_isolated_intake_active"
    : entry.importEligibility === "requires_reevaluation"
    ? "reevaluate_after_unlock"
    : "do_not_import";
  return {
    action,
    evidenceKey: entry.evidenceKey,
    idempotencyKey: entry.futureImportKey,
    importTime: null,
    originalObservedAt: entry.observedAt,
    preserveOriginalObservedAt: true,
  };
});
const summary = {
  entries: manifest.entries.length,
  manifestHash: hashJson(manifest),
  mode: manifest.modeStates.ownerAssisted,
  remotePersistencePerformed: false,
};

if (process.argv.includes("--plan")) {
  console.log(JSON.stringify({
    schemaVersion: "chillywood-cognitive-deferred-import-plan-v1",
    isolatedIntakeRequired: true,
    duplicatePolicy: "future_import_key_conflict_is_no_op",
    staleEvidencePolicy: "reevaluate_before_import",
    plan,
    summary,
  }, null, 2));
} else {
  console.log(JSON.stringify(summary));
}
