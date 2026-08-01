import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const reportPath = "docs/assurance/reconciliation/b0-chat-call-remote-history.json";
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const expectedDeployed = [
  {
    version: "20260728141417",
    name: "chilly_chat_livekit_media_rollout",
    path: "supabase/migrations/20260728141417_chilly_chat_livekit_media_rollout.sql",
    rawSha256: "569bc5df653527fbb1f20b0decd3d24259b5776f989b99a6854b6c15ef35fab0",
    byteCount: 8550,
  },
  {
    version: "20260729175447",
    name: "chilly_chat_active_thread_clear_race_guard",
    path: "supabase/migrations/20260729175447_chilly_chat_active_thread_clear_race_guard.sql",
    rawSha256: "d1da4798a9398e850ef300007ac7471e4590203d6d0304688809498f0e1f452e",
    byteCount: 1770,
  },
  {
    version: "20260729204336",
    name: "chilly_chat_active_thread_clear_race_guard",
    path: "supabase/migrations/20260729204336_chilly_chat_active_thread_clear_race_guard.sql",
    rawSha256: "d1da4798a9398e850ef300007ac7471e4590203d6d0304688809498f0e1f452e",
    byteCount: 1770,
  },
  {
    version: "20260730034533",
    name: "chilly_chat_authoritative_busy_begin",
    path: "supabase/migrations/20260730034533_chilly_chat_authoritative_busy_begin.sql",
    rawSha256: "018ebe4cbb7f0346fce34aa2d47ca9b675004dcbfd9b677c945b0c0a08f4a429",
    byteCount: 8243,
  },
  {
    version: "20260730040727",
    name: "chilly_chat_busy_active_thread_guard",
    path: "supabase/migrations/20260730040727_chilly_chat_busy_active_thread_guard.sql",
    rawSha256: "79fcdb34fe5575dcc461900c9b146fb60d6b825162742c39d7ac172338bdd948",
    byteCount: 8555,
  },
];

const expectedRetired = [
  {
    version: "20260728143000",
    path: "supabase/migrations/20260728143000_chilly_chat_livekit_media_rollout.sql",
  },
  {
    version: "20260729185000",
    path: "supabase/migrations/20260729185000_chilly_chat_active_thread_clear_race_guard.sql",
  },
  {
    version: "20260730032500",
    path: "supabase/migrations/20260730032500_chilly_chat_authoritative_busy_begin.sql",
  },
  {
    version: "20260730040000",
    path: "supabase/migrations/20260730040000_chilly_chat_busy_active_thread_guard.sql",
  },
];

test("five deployed Chat Call migrations have exact version, name, bytes, and raw hash", () => {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.featureId, "chilly-chat-call-lifecycle");
  assert.equal(report.remoteSnapshot.mode, "coordinator-supplied-prior-read-only-list-and-statement-hashes");
  assert.equal(report.remoteSnapshot.newProviderReadback, false);
  assert.equal(report.remoteSnapshot.providerMutation, false);
  assert.equal(report.remoteSnapshot.databaseMutation, false);
  assert.deepEqual(
    report.deployedMigrations.map(({ version }) => version),
    expectedDeployed.map(({ version }) => version),
  );

  for (const expected of expectedDeployed) {
    const recorded = report.deployedMigrations.find(({ version }) => version === expected.version);
    assert.ok(recorded, expected.version);
    assert.equal(recorded.name, expected.name, expected.version);
    assert.equal(recorded.path, expected.path, expected.version);
    assert.equal(recorded.rawSha256, expected.rawSha256, expected.version);
    assert.equal(recorded.byteCount, expected.byteCount, expected.version);
    assert.equal(recorded.classification, "REMOTE_AND_SOURCE_MATCH", expected.version);
    assert.equal(
      expected.path,
      `supabase/migrations/${expected.version}_${expected.name}.sql`,
      expected.version,
    );

    const bytes = readFileSync(expected.path);
    assert.equal(bytes.byteLength, expected.byteCount, expected.version);
    assert.equal(sha256(bytes), expected.rawSha256, expected.version);
  }
});

test("four non-remote candidate versions are retired only after recorded absence", () => {
  assert.equal(report.remoteSnapshot.candidateAbsenceConfirmed, true);
  assert.deepEqual(
    report.retiredCandidates.map(({ version }) => version),
    expectedRetired.map(({ version }) => version),
  );

  for (const expected of expectedRetired) {
    const recorded = report.retiredCandidates.find(({ version }) => version === expected.version);
    assert.ok(recorded, expected.version);
    assert.equal(recorded.remotePresent, false, expected.version);
    assert.equal(recorded.path, expected.path, expected.version);
    assert.equal(existsSync(expected.path), false, expected.version);
  }
});

test("both deployed active-thread guard versions preserve the identical remote body", () => {
  const repeated = report.deployedMigrations.filter(
    ({ name }) => name === "chilly_chat_active_thread_clear_race_guard",
  );
  assert.deepEqual(repeated.map(({ remoteDeploymentSequence }) => remoteDeploymentSequence), [1, 2]);
  assert.equal(repeated[0].rawSha256, repeated[1].rawSha256);
  assert.deepEqual(readFileSync(repeated[0].path), readFileSync(repeated[1].path));
  assert.deepEqual(report.duplicateDeployment.versions, ["20260729175447", "20260729204336"]);
  assert.equal(report.duplicateDeployment.identicalRawBody, true);
  assert.equal(report.duplicateDeployment.rawSha256, repeated[0].rawSha256);
});

test("the authoritative-busy body mismatch uses the exact prior read-only remote hash", () => {
  const retired = report.retiredCandidates.find(({ version }) => version === "20260730032500");
  const deployed = report.deployedMigrations.find(({ version }) => version === "20260730034533");
  assert.ok(retired);
  assert.ok(deployed);
  assert.equal(retired.classification, "VERSION_MISMATCH_AND_BODY_MISMATCH");
  assert.notEqual(retired.rawSha256, deployed.rawSha256);
  assert.equal(
    deployed.sourceProvenance,
    "git:e4589c1bd3d80e84cff96794e9895f3683d37696:supabase/migrations/20260730032500_chilly_chat_authoritative_busy_begin.sql",
  );
  assert.equal(deployed.rawSha256, "018ebe4cbb7f0346fce34aa2d47ca9b675004dcbfd9b677c945b0c0a08f4a429");
});

test("the report keeps exact source parity separate from higher proof tiers", () => {
  assert.equal(report.proofTiers.T1_SOURCE, "SOURCE_CLEAR");
  assert.equal(report.proofTiers.T2_MODEL, "NOT_APPLICABLE");
  assert.equal(report.proofTiers.T3_INTEGRATION, "BLOCKED_INTERNAL");
  assert.equal(report.claimedFeatureCompletion, false);
  assert.match(report.finalPermittedNextAction, /assembled linked no-apply dry-run/u);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u);
  assert.doesNotMatch(serialized, /(?:service_role|webhook_secret|api[_-]?key)\s*[:=]\s*[^,$}\]]+/iu);
});
