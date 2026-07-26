#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
export const V1_MANIFEST_PATH = path.join(
  root,
  "config/intelligence/cognitive-level01-deferred-evidence-manifest-v1.json",
);
export const V2_MANIFEST_PATH = path.join(
  root,
  "config/intelligence/cognitive-level01-deferred-evidence-manifest-v2.json",
);
export const ANDROID_RELEASE_PATH = path.join(
  root,
  "config/release/android-production.json",
);
export const V1_SCHEMA = "chillywood-cognitive-deferred-evidence-v1";
export const V2_SCHEMA = "chillywood-cognitive-deferred-evidence-v2";
export const SOURCE_CORRECTION_TIMESTAMP = "2026-07-25T15:29:25.000Z";
export const POST_INTEGRATION_CORRECTION_KIND =
  "new_android_build84_post_ota_observation";

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_TEXT = /^[A-Za-z0-9_.:-]{1,128}$/u;
const IMPORT_ELIGIBILITY = new Set([
  "audit_only",
  "eligible_after_runtime_unlock",
  "not_eligible",
  "requires_reevaluation",
]);
const CORRECTED_ANDROID_EVIDENCE_TYPES = new Set([
  "android_accessibility_touch_target",
  "android_crash_anr_observation",
  "android_installed_route_repeat",
  "android_session_lifecycle",
  "android_signout_signin",
  "livekit_installed_observer_gate",
]);
const V1_ENTRY_KEYS = [
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
const V2_ENTRY_KEYS = [
  ...V1_ENTRY_KEYS,
  "amendmentKey",
  "amendsFutureImportKey",
  "amendsManifestVersion",
  "appVersion",
  "correctionKind",
  "distributionSource",
  "originalEvidenceKey",
].sort();
const V2_TOP_LEVEL_KEYS = [
  "appendOnly",
  "canonicalForFutureImport",
  "correction",
  "entries",
  "manifestHash",
  "manifestHashAlgorithm",
  "manifestVersion",
  "modeStates",
  "originalEvidenceKeys",
  "rawEvidencePolicy",
  "remotePersistencePerformed",
  "schemaVersion",
  "supersedesManifestHash",
  "supersedesManifestVersion",
].sort();
const IMMUTABLE_ENTRY_KEYS = [
  "evaluatorResult",
  "evidenceKey",
  "evidenceType",
  "expiresAt",
  "findingKey",
  "importEligibility",
  "importStatus",
  "metricHashes",
  "observedAt",
  "platform",
  "retentionClass",
  "sourceCommit",
  "synthetic",
];

export const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));
export const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
export const hashJson = (value) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const computeManifestHash = (manifest) => {
  const { manifestHash: _storedManifestHash, ...hashableManifest } = manifest;
  return hashJson(hashableManifest);
};
const exactKeys = (value, keys) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const validTimestamp = (value) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(Date.parse(value)).toISOString() === value;
const validNullableSafeText = (value) =>
  value === null || (typeof value === "string" && SAFE_TEXT.test(value));
const assertModeTruth = (manifest) => {
  assert.deepEqual(manifest.modeStates, {
    isolatedAutonomous: "ISOLATED_AUTONOMOUS_PENDING",
    ownerAssisted: "OWNER_ASSISTED_ACTIVE",
  });
  assert.equal(manifest.appendOnly, true);
  assert.equal(manifest.rawEvidencePolicy, "outside_git_owner_only");
  assert.equal(manifest.remotePersistencePerformed, false);
};
const validateCommonEntry = (entry) => {
  assert.match(entry.evidenceKey, SHA256);
  assert.match(entry.futureImportKey, SHA256);
  assert.match(entry.sourceCommit, COMMIT);
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
  assert.ok(Date.parse(entry.expiresAt) > Date.parse(entry.observedAt));
};

export const validateHistoricalV1 = (manifest) => {
  assert.equal(manifest.schemaVersion, V1_SCHEMA);
  assertModeTruth(manifest);
  assert.ok(Array.isArray(manifest.entries) && manifest.entries.length > 0);
  const evidenceKeys = new Set();
  const importKeys = new Set();
  let priorObservedAt = 0;
  for (const entry of manifest.entries) {
    assert.ok(exactKeys(entry, V1_ENTRY_KEYS), "historical v1 entry shape drift");
    validateCommonEntry(entry);
    assert.ok(!evidenceKeys.has(entry.evidenceKey), "duplicate evidence key");
    assert.ok(!importKeys.has(entry.futureImportKey), "duplicate import key");
    evidenceKeys.add(entry.evidenceKey);
    importKeys.add(entry.futureImportKey);
    const observedAt = Date.parse(entry.observedAt);
    assert.ok(observedAt >= priorObservedAt, "manifest must be append ordered");
    priorObservedAt = observedAt;
  }
  return {
    canonicalForFutureImport: false,
    entries: manifest.entries.length,
    manifestHash: hashJson(manifest),
    schemaVersion: manifest.schemaVersion,
  };
};

const correctedIdentityFor = (entry, release) =>
  CORRECTED_ANDROID_EVIDENCE_TYPES.has(entry.evidenceType)
    ? {
        appBuild: release.nativeBuild,
        appChannel: release.channel,
        appRuntime: release.runtimeVersion,
        appVersion: release.appVersion,
        correctionKind: "corrected_android_build84_release_identity",
        distributionSource: release.distributionSource,
      }
    : {
        appBuild: entry.appBuild,
        appChannel: entry.appChannel,
        appRuntime: entry.appRuntime,
        appVersion: null,
        correctionKind: "carried_forward_unmodified_identity",
        distributionSource: null,
      };
const amendmentMaterialFor = ({
  entry,
  identity,
  supersedesManifestHash,
}) => ({
  amendsFutureImportKey: entry.futureImportKey,
  correctionKind: identity.correctionKind,
  correctedIdentity: {
    appBuild: identity.appBuild,
    appChannel: identity.appChannel,
    appRuntime: identity.appRuntime,
    appVersion: identity.appVersion,
    distributionSource: identity.distributionSource,
  },
  originalEvidenceKey: entry.evidenceKey,
  schemaVersion: V2_SCHEMA,
  supersedesManifestHash,
});
const futureImportMaterialFor = (entry) => ({
  amendmentKey: entry.amendmentKey,
  appBuild: entry.appBuild,
  appChannel: entry.appChannel,
  appRuntime: entry.appRuntime,
  appVersion: entry.appVersion,
  distributionSource: entry.distributionSource,
  evidenceKey: entry.evidenceKey,
  evidenceType: entry.evidenceType,
  importEligibility: entry.importEligibility,
  observedAt: entry.observedAt,
  originalEvidenceKey: entry.originalEvidenceKey,
  schemaVersion: V2_SCHEMA,
  sourceCommit: entry.sourceCommit,
});
const postIntegrationAmendmentMaterialFor = (entry) => ({
  appBuild: entry.appBuild,
  appChannel: entry.appChannel,
  appRuntime: entry.appRuntime,
  appVersion: entry.appVersion,
  correctionKind: entry.correctionKind,
  distributionSource: entry.distributionSource,
  evidenceKey: entry.evidenceKey,
  evidenceType: entry.evidenceType,
  observedAt: entry.observedAt,
  schemaVersion: V2_SCHEMA,
  sourceCommit: entry.sourceCommit,
});

export const buildPostIntegrationEntry = ({ evidence, release }) => {
  const entry = {
    ...evidence,
    amendmentKey: "",
    amendsFutureImportKey: null,
    amendsManifestVersion: V2_SCHEMA,
    appBuild: release.nativeBuild,
    appChannel: release.channel,
    appRuntime: release.runtimeVersion,
    appVersion: release.appVersion,
    correctionKind: POST_INTEGRATION_CORRECTION_KIND,
    distributionSource: release.distributionSource,
    futureImportKey: "",
    originalEvidenceKey: evidence.evidenceKey,
  };
  entry.amendmentKey = hashJson(postIntegrationAmendmentMaterialFor(entry));
  entry.futureImportKey = hashJson(futureImportMaterialFor(entry));
  return entry;
};

export const buildV2FromV1 = ({
  release,
  sourceCorrectionTimestamp = SOURCE_CORRECTION_TIMESTAMP,
  v1,
}) => {
  const v1Summary = validateHistoricalV1(v1);
  const entries = v1.entries.map((entry) => {
    const identity = correctedIdentityFor(entry, release);
    const amendmentKey = hashJson(amendmentMaterialFor({
      entry,
      identity,
      supersedesManifestHash: v1Summary.manifestHash,
    }));
    const amendedEntry = {
      ...entry,
      ...identity,
      amendmentKey,
      amendsFutureImportKey: entry.futureImportKey,
      amendsManifestVersion: V1_SCHEMA,
      originalEvidenceKey: entry.evidenceKey,
    };
    amendedEntry.futureImportKey = hashJson(futureImportMaterialFor(amendedEntry));
    return amendedEntry;
  });
  const manifest = {
    schemaVersion: V2_SCHEMA,
    manifestVersion: 2,
    canonicalForFutureImport: true,
    appendOnly: true,
    supersedesManifestVersion: V1_SCHEMA,
    supersedesManifestHash: v1Summary.manifestHash,
    manifestHashAlgorithm: "sha256_canonical_json_excluding_manifestHash",
    manifestHash: "",
    correction: {
      reason:
        "Correct Android build-84 release identity by separating app version, native build, runtime, EAS update channel, and distribution source; preserve every original observation and evidence key.",
      releaseIdentitySource: "config/release/android-production.json",
      sourceCorrectionTimestamp,
    },
    originalEvidenceKeys: v1.entries.map((entry) => entry.evidenceKey),
    modeStates: { ...v1.modeStates },
    rawEvidencePolicy: v1.rawEvidencePolicy,
    remotePersistencePerformed: false,
    entries,
  };
  manifest.manifestHash = computeManifestHash(manifest);
  return manifest;
};

const assertReleaseIdentity = (entry, release) => {
  assert.equal(
    entry.appVersion,
    release.appVersion,
    `${entry.evidenceType} appVersion release identity mismatch`,
  );
  assert.equal(
    entry.appBuild,
    release.nativeBuild,
    `${entry.evidenceType} appBuild release identity mismatch`,
  );
  assert.equal(
    entry.appRuntime,
    release.runtimeVersion,
    `${entry.evidenceType} appRuntime release identity mismatch`,
  );
  assert.equal(
    entry.appChannel,
    release.channel,
    `${entry.evidenceType} appChannel release identity mismatch`,
  );
  assert.equal(
    entry.distributionSource,
    release.distributionSource,
    `${entry.evidenceType} distributionSource release identity mismatch`,
  );
};

export const validateCanonicalV2 = ({ manifest, release, v1 }) => {
  const v1Summary = validateHistoricalV1(v1);
  assert.ok(exactKeys(manifest, V2_TOP_LEVEL_KEYS), "v2 top-level shape drift");
  assert.equal(manifest.schemaVersion, V2_SCHEMA);
  assert.equal(manifest.manifestVersion, 2);
  assert.equal(manifest.canonicalForFutureImport, true);
  assert.equal(manifest.supersedesManifestVersion, V1_SCHEMA);
  assert.equal(manifest.supersedesManifestHash, v1Summary.manifestHash);
  assert.equal(
    manifest.manifestHashAlgorithm,
    "sha256_canonical_json_excluding_manifestHash",
  );
  assert.equal(
    manifest.manifestHash,
    computeManifestHash(manifest),
    "v2 deterministic manifest hash mismatch",
  );
  assertModeTruth(manifest);
  assert.ok(validTimestamp(manifest.correction.sourceCorrectionTimestamp));
  assert.equal(
    manifest.correction.releaseIdentitySource,
    "config/release/android-production.json",
  );
  assert.ok(
    manifest.correction.reason.includes("Android build-84 release identity"),
  );
  assert.deepEqual(
    manifest.originalEvidenceKeys,
    v1.entries.map((entry) => entry.evidenceKey),
  );
  assert.ok(
    manifest.entries.length >= v1.entries.length,
    "canonical v2 cannot drop historical entries",
  );

  const evidenceKeys = new Set();
  const importKeys = new Set();
  const amendmentKeys = new Set();
  let priorObservedAt = 0;
  for (const [index, entry] of manifest.entries.entries()) {
    assert.ok(exactKeys(entry, V2_ENTRY_KEYS), "canonical v2 entry shape drift");
    validateCommonEntry(entry);
    assert.match(entry.amendmentKey, SHA256);
    assert.ok(!evidenceKeys.has(entry.evidenceKey), "duplicate evidence key");
    assert.ok(!importKeys.has(entry.futureImportKey), "duplicate import key");
    assert.ok(!amendmentKeys.has(entry.amendmentKey), "duplicate amendment key");
    evidenceKeys.add(entry.evidenceKey);
    importKeys.add(entry.futureImportKey);
    amendmentKeys.add(entry.amendmentKey);
    if (index < v1.entries.length) {
      const original = v1.entries[index];
      assert.equal(entry.originalEvidenceKey, original.evidenceKey);
      assert.equal(entry.evidenceKey, original.evidenceKey);
      assert.equal(entry.amendsManifestVersion, V1_SCHEMA);
      assert.equal(entry.amendsFutureImportKey, original.futureImportKey);
      for (const key of IMMUTABLE_ENTRY_KEYS) {
        assert.deepEqual(
          entry[key],
          original[key],
          `${entry.evidenceType} historical ${key} changed`,
        );
      }
      assert.notEqual(
        entry.futureImportKey,
        original.futureImportKey,
        "v2 future import key was not regenerated",
      );
      const expectedIdentity = correctedIdentityFor(original, release);
      assert.equal(entry.correctionKind, expectedIdentity.correctionKind);
      if (CORRECTED_ANDROID_EVIDENCE_TYPES.has(entry.evidenceType)) {
        assert.equal(
          entry.correctionKind,
          "corrected_android_build84_release_identity",
        );
        assertReleaseIdentity(entry, release);
      } else {
        assert.equal(entry.appVersion, null);
        assert.equal(entry.distributionSource, null);
        assert.equal(entry.appBuild, original.appBuild);
        assert.equal(entry.appRuntime, original.appRuntime);
        assert.equal(entry.appChannel, original.appChannel);
      }
      assert.equal(
        entry.amendmentKey,
        hashJson(amendmentMaterialFor({
          entry: original,
          identity: expectedIdentity,
          supersedesManifestHash: manifest.supersedesManifestHash,
        })),
        `${entry.evidenceType} amendment linkage mismatch`,
      );
    } else {
      assert.equal(entry.correctionKind, POST_INTEGRATION_CORRECTION_KIND);
      assert.equal(entry.originalEvidenceKey, entry.evidenceKey);
      assert.equal(entry.amendsManifestVersion, V2_SCHEMA);
      assert.equal(entry.amendsFutureImportKey, null);
      assert.equal(entry.platform, "android");
      assertReleaseIdentity(entry, release);
      assert.equal(
        entry.amendmentKey,
        hashJson(postIntegrationAmendmentMaterialFor(entry)),
        `${entry.evidenceType} post-integration linkage mismatch`,
      );
    }
    assert.equal(
      entry.futureImportKey,
      hashJson(futureImportMaterialFor(entry)),
      `${entry.evidenceType} future import key mismatch`,
    );
    const observedAt = Date.parse(entry.observedAt);
    assert.ok(observedAt >= priorObservedAt, "manifest must be append ordered");
    priorObservedAt = observedAt;
  }
  assert.equal(
    manifest.entries.filter((entry) =>
      CORRECTED_ANDROID_EVIDENCE_TYPES.has(entry.evidenceType)).length,
    CORRECTED_ANDROID_EVIDENCE_TYPES.size,
  );
  return {
    canonicalForFutureImport: true,
    correctedAndroidEntries: CORRECTED_ANDROID_EVIDENCE_TYPES.size,
    entries: manifest.entries.length,
    manifestHash: manifest.manifestHash,
    schemaVersion: manifest.schemaVersion,
    supersedesManifestHash: manifest.supersedesManifestHash,
  };
};

export const buildImportPlan = ({
  evaluatedAt = new Date().toISOString(),
  manifest,
}) => {
  assert.equal(
    manifest.schemaVersion,
    V2_SCHEMA,
    "canonical v2 manifest required for future import planning",
  );
  assert.equal(
    manifest.canonicalForFutureImport,
    true,
    "historical manifest cannot be selected for future import",
  );
  assert.ok(validTimestamp(evaluatedAt));
  const plan = manifest.entries.map((entry) => {
    const stale = Date.parse(entry.expiresAt) <= Date.parse(evaluatedAt);
    const action = stale
      ? "reevaluate_stale_evidence_before_import"
      : entry.importEligibility === "eligible_after_runtime_unlock"
      ? "defer_until_isolated_intake_active"
      : entry.importEligibility === "requires_reevaluation"
      ? "reevaluate_after_unlock"
      : "do_not_import";
    return {
      action,
      conflictBehavior: "future_import_key_conflict_is_no_op",
      evidenceKey: entry.evidenceKey,
      idempotencyKey: entry.futureImportKey,
      importTime: null,
      originalObservedAt: entry.observedAt,
      preserveOriginalObservedAt: true,
      requiresFreshnessCheck: true,
    };
  });
  return {
    schemaVersion: "chillywood-cognitive-deferred-import-plan-v2",
    canonicalManifestPath:
      "config/intelligence/cognitive-level01-deferred-evidence-manifest-v2.json",
    canonicalManifestHash: manifest.manifestHash,
    isolatedIntakeRequired: true,
    duplicatePolicy: "future_import_key_conflict_is_no_op",
    staleEvidencePolicy: "reevaluate_before_import",
    evaluatedAt,
    plan,
  };
};

const runCli = () => {
  const args = new Set(process.argv.slice(2));
  const v1 = readJson(V1_MANIFEST_PATH);
  if (args.has("--historical-v1")) {
    assert.ok(
      !args.has("--plan"),
      "historical v1 cannot be selected for future import planning",
    );
    console.log(JSON.stringify(validateHistoricalV1(v1)));
    return;
  }
  const release = readJson(ANDROID_RELEASE_PATH);
  if (args.has("--generate-v2")) {
    console.log(JSON.stringify(buildV2FromV1({ release, v1 }), null, 2));
    return;
  }
  const manifest = readJson(V2_MANIFEST_PATH);
  const summary = validateCanonicalV2({ manifest, release, v1 });
  if (args.has("--plan")) {
    console.log(JSON.stringify(buildImportPlan({ manifest }), null, 2));
  } else {
    console.log(JSON.stringify(summary));
  }
};

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  runCli();
}
