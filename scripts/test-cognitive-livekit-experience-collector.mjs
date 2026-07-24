#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const collector = read(
  "supabase/functions/cognitive-livekit-experience-collector/index.ts",
);
const collectorTest = read(
  "supabase/functions/cognitive-livekit-experience-collector/index_test.ts",
);
const harness = read("scripts/livekit-headless-synthetic-participant.mjs");
const runtimeDoc = read(
  "docs/intelligence/LIVEKIT_LEVEL01_EXPERIENCE_COLLECTOR.md",
);

for (const required of [
  'const SERVICE_IDENTITY = "cognitive_sentinel_collector"',
  'const SENTINEL_KEY = "livekit_experience_sentinel"',
  "livekit_experience_sentinel",
  "COGNITIVE_LIVEKIT_SENTINEL_INVOKE_SHA256",
  "COGNITIVE_LIVEKIT_SENTINEL_ASSERTION",
  "product_experience_collect_sentinel_run",
  "product-sentinel-v1",
  "bounded-nonpersonal-v1",
  "livekit_experience",
  "p_collection_idempotency_hash",
  "p_evaluation_expires_at",
  "p_observation_finished_at",
  "p_observation_started_at",
  "p_service_assertion",
  "p_source_build_hash",
  "independentEvaluationRequired",
  "installed_ui_observed",
  "source_only",
  "token_backend_failure",
  "websocket_failure",
  "ice_turn_failure",
  "local_publish_failure",
  "remote_subscription_failure",
  "installed_ui_connecting_stuck",
  "background_foreground_recovery_failed",
  "provider_degradation",
]) {
  assert.ok(collector.includes(required), `collector missing ${required}`);
}

for (const forbidden of [
  "product_quality_record_finding",
  "governance_execute_approved_switch",
  "mergePullRequest",
  "SUPABASE_ANON_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_API_KEY",
  "finding_created",
]) {
  assert.ok(!collector.includes(forbidden), `collector gained forbidden ${forbidden}`);
}

for (const required of [
  'await import("@livekit/rtc-node")',
  "AudioSource",
  "AudioFrame.create",
  "LocalAudioTrack.createAudioTrack",
  "AudioStream",
  "VideoStream",
  "TrackSubscribed",
  "ParticipantConnected",
  "getRtcStats",
  "candidatePair",
  "transport",
  "installedEvidence",
  "installedUiObserved: !!installedEvidence",
  "O_NOFOLLOW",
  "fstatSync",
  "stats.ino !== pathStats.ino",
  "_must_be_0600",
  "_must_be_outside_git",
  "TEST_TONE_HZ = 440",
]) {
  assert.ok(harness.includes(required), `headless harness missing ${required}`);
}

for (const forbidden of [
  "console.log",
  "process.env",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_API_KEY",
  "product_experience_record_sentinel_run",
  "rawScreenshot",
  "rawLog",
]) {
  assert.ok(!harness.includes(forbidden), `headless harness gained forbidden ${forbidden}`);
}
assert.ok(
  harness.includes('action: "prepare_run"') &&
    harness.includes("const evidenceManifestHash = hashJson(metric)") &&
    harness.includes('schemaVersion: "product-sentinel-v1"') &&
    harness.includes('sanitizationVersion: "bounded-nonpersonal-v1"') &&
    harness.includes('observationKind: "livekit_experience"') &&
    harness.includes("runtimeIdentityHash: input.runtimeIdentityHash") &&
    harness.includes("sourceBuildHash: input.sourceBuildHash"),
  "headless harness does not emit the bounded collector packet",
);

for (const required of [
  "headless-only evidence never claims installed UI pass",
  "media flow with unresolved Connecting is an installed UI failure",
  "ICE failure is distinct from room and token failure",
  "canonical evidence hashes ignore object insertion order",
  "requires its private invocation",
]) {
  assert.ok(collectorTest.includes(required), `collector test missing ${required}`);
}

for (const required of [
  "does not prove installed UI",
  "deterministic 440 Hz",
  "owner-only",
  "independent evaluation",
  "no deployment",
]) {
  assert.ok(runtimeDoc.includes(required), `runtime doc missing ${required}`);
}

const selfTest = spawnSync(
  process.execPath,
  [path.join(root, "scripts/livekit-headless-synthetic-participant.mjs"), "--self-test"],
  {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  },
);
assert.equal(selfTest.status, 0, selfTest.stderr);
const selfTestResult = JSON.parse(selfTest.stdout);
assert.equal(selfTestResult.ok, true);
assert.equal(selfTestResult.headlessOnlyCannotClaimInstalledUi, true);
assert.ok(selfTestResult.stageCount >= 30);

process.stdout.write(JSON.stringify({
  collectorBoundaries: "pass",
  headlessHarness: "pass",
  installedUiSeparation: "pass",
  ok: true,
}) + "\n");
