import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { modelDefinitions, runCommands } from "../../../_lib/assurance/state-models/models.mjs";
import { runEscapedDefectChecks } from "../../../_lib/assurance/state-models/properties.mjs";

test("historical variants reproduce escaped defects while the fixed contract model rejects them", () => {
  const report = runEscapedDefectChecks();
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual([report.fixtureCount, report.canonicalFixtureCount, report.supplementalFixtureCount], [22, 17, 5]);
  const catalogIds = new Set(JSON.parse(fs.readFileSync("config/assurance/escaped-defect-catalog-v1.json", "utf8")).defects.map(({ id }) => id));
  for (const result of report.results) assert.equal(result.classification, catalogIds.has(result.defectId) ? "canonical" : "supplemental", result.defectId);
  for (const required of [
    "EAS_ENVIRONMENT_OVERRIDE", "MISSING_NATIVE_MODULE_IN_RUNTIME", "DOUBLE_SERIALIZED_JSONB",
    "PLATFORM_SCOPE_MISMATCH", "PUSHKIT_DELIVERY_SUPPRESSED",
    "LIVEKIT_MEDIA_WITHOUT_UI_RESOLUTION", "MIGRATION_VERSION_NAME_MISMATCH"
  ]) {
    assert.equal(report.results.find(({ defectId }) => defectId === required)?.classification, "canonical", required);
  }
  for (const result of report.results) {
    assert.equal(result.historicalDetected, true, `${result.defectId} historical variant was not detected`);
    assert.equal(result.currentModelPass, true, `${result.defectId} escaped the fixed contract model`);
    assert.deepEqual(result.currentViolations, []);
  }
});

test("hostile review cases cannot create vacuous model clearance or clobber replay evidence", () => {
  const chatAction = runCommands("chat-call", [{ type: "invite", generation: 1, provider: "livekit" }, { type: "native_action", actionId: 1, generation: 1, expiresAt: 2 }, { type: "native_action", actionId: 1, generation: 1, expiresAt: 9 }, { type: "tick", amount: 3 }, { type: "native_action", actionId: 1, generation: 1, expiresAt: 9 }, { type: "auth_ready" }, { type: "react_ready" }, { type: "consume_native" }]).state;
  assert.deepEqual([chatAction.expiredNativeActions, chatAction.consumedNativeActions], [["action-1-1"], []]);
  assert.deepEqual(runCommands("chat-call", [{ type: "invite", generation: 1, provider: "livekit" }, { type: "native_action", actionId: 1, generation: 1, expiresAt: 9 }, { type: "timeout" }, { type: "invite", generation: 2, provider: "livekit" }, { type: "auth_ready" }, { type: "react_ready" }, { type: "consume_native" }]).state.consumedNativeActions, []);
  const expiredNativeAccept = runCommands("chat-call", [{ type: "invite", generation: 1, provider: "livekit" }, { type: "native_action", actionId: 1, generation: 1, expiresAt: 2 }, { type: "tick", amount: 2 }, { type: "accept_native", actionId: 1, generation: 1 }]);
  assert.deepEqual([expiredNativeAccept.state.inviteStatus, expiredNativeAccept.state.acceptanceAuthority, expiredNativeAccept.violations], ["ringing", null, []]);
  const inAppAccept = runCommands("chat-call", [{ type: "invite", generation: 1, provider: "livekit" }, { type: "accept_in_app" }]);
  assert.deepEqual([inAppAccept.state.inviteStatus, inAppAccept.state.acceptanceAuthority, inAppAccept.violations], ["accepted", "in_app", []]);
  const native = runCommands("notification-native-action", [{ type: "native_answer", id: "1", expiresAt: 2 }, { type: "native_answer", id: "1", expiresAt: 9 }, { type: "tick", amount: 3 }, { type: "native_answer", id: "1", expiresAt: 9 }, { type: "auth_ready" }, { type: "react_ready" }, { type: "consume_action", id: "1" }, { type: "server_accept", id: "1" }]).state;
  assert.deepEqual([native.expiredActions, native.serverAccepted, native.serverStatus], [["1"], [], "ringing"]);
  for (const [command, status] of [["server_cancel", "cancelled"], ["server_timeout", "timed_out"]]) {
    const terminal = runCommands("notification-native-action", [{ type: "native_answer", id: "pending", expiresAt: 5 }, { type: command }, { type: "auth_ready" }, { type: "react_ready" }, { type: "consume_action", id: "pending" }]).state;
    assert.deepEqual([terminal.serverStatus, terminal.pendingActions, terminal.retiredActions, terminal.consumedActions], [status, [], ["pending"], []]);
  }
  const declined = runCommands("notification-native-action", [{ type: "native_decline", id: "d", expiresAt: 5 }, { type: "native_answer", id: "other", expiresAt: 5 }, { type: "auth_ready" }, { type: "react_ready" }, { type: "consume_action", id: "d" }, { type: "server_decline", id: "d" }, { type: "consume_action", id: "other" }]).state;
  assert.deepEqual([declined.serverStatus, declined.pendingActions, declined.retiredActions, declined.consumedActions], ["declined", [], ["other"], ["d"]]);
  const mustReport = [{ type: "receive_push", id: "push", mustReport: true }, { type: "server_timeout" }];
  assert.deepEqual([runCommands("notification-native-action", mustReport).state.serverStatus, runCommands("notification-native-action", mustReport, "terminal-without-report").violations], ["ringing", ["PUSHKIT_MUST_REPORT_BREACH"]]);
  assert.equal(runCommands("notification-native-action", [{ type: "receive_push", id: "push", mustReport: true }, { type: "report_callkit", id: "push", mustReport: true }, { type: "server_timeout" }]).state.serverStatus, "ringing");
  assert.equal(runCommands("notification-native-action", [{ type: "receive_push", id: "push", mustReport: true }, { type: "report_callkit", id: "push", mustReport: true }, { type: "complete_push", id: "push", mustReport: true }, { type: "server_timeout" }]).state.serverStatus, "timed_out");
  const answer = [{ type: "native_answer", id: "answer", expiresAt: 5 }, { type: "auth_ready" }, { type: "react_ready" }, { type: "consume_action", id: "answer" }, { type: "server_accept", id: "answer" }];
  assert.equal(runCommands("notification-native-action", [{ type: "receive_push", id: "push", mustReport: true }, ...answer]).state.serverStatus, "ringing");
  assert.equal(runCommands("notification-native-action", [{ type: "receive_push", id: "push", mustReport: true }, { type: "report_callkit", id: "push", mustReport: true }, { type: "complete_push", id: "push", mustReport: true }, ...answer]).state.serverStatus, "accepted");
  assert.equal(modelDefinitions["notification-native-action"].featureId, "pushkit-callkit");
  const event = (eventId, eventTime, authority) => ({ type: "event", eventId, eventType: authority === "provider" ? "purchase" : "manual", eventTime, store: "apple", environment: "production", authority, appUser: "user-a", target: "user-b", product: "premium.monthly", expiresAt: 20 });
  assert.equal(runCommands("revenuecat", [event("shared", 100, "manual"), event("shared", 1, "provider")]).state.productionAccess, true);
  const equalEvent = (eventId, eventType) => ({ ...event(eventId, 5, "provider"), eventType });
  assert.deepEqual(["purchase,refund", "refund,purchase"].map((order) => runCommands("revenuecat", order.split(",").map((type) => equalEvent(type, type))).state.entitlement), ["refunded", "refunded"]);
  const build = { type: "install_build", platform: "android", environment: "internal", runtime: "runtime-1", channel: "internal", nativeDigest: "native-a", sourceCommit: "source-a", embeddedSafe: true, providedCapabilities: [] };
  const update = { ...build, type: "activate_update", sourceCommit: "source-b", requiredCapabilities: [] };
  assert.equal(runCommands("ota-build", [build, update]).state.currentUpdate, null);
  assert.equal(runCommands("ota-build", [build, { ...update, sourceCommit: "source-a" }]).state.currentUpdate.sourceCommit, "source-a");
  assert.deepEqual(runCommands("migrations", [{ type: "forward_correction", version: "3", name: "successor", hash: "hash-3" }, { type: "forward_correction", version: "3", name: "mutated", hash: "hash-4" }]).state.forwardSuccessors, [{ version: "3", name: "successor", hash: "hash-3" }]);
  assert.equal(runCommands("livekit", [{ type: "advance", stage: "ui", platform: "ios", fixture: false }, { type: "declare_pass" }]).state.pass, false);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-replay-"));
  const output = path.join(directory, "replay.json");
  fs.writeFileSync(output, "preserve");
  const malformed = spawnSync(process.execPath, ["scripts/assurance/models/run.mjs", "--domain=chat-call", "--path=bad:path"], { encoding: "utf8" });
  const emptyReplay = spawnSync(process.execPath, ["scripts/assurance/models/run.mjs", "--domain=chat-call", "--path=999:999"], { encoding: "utf8" });
  const concurrencyReplay = spawnSync(process.execPath, ["scripts/assurance/models/run.mjs", "--suite=concurrency", "--domain=chat-call", "--path=0"], { encoding: "utf8" });
  const concurrencyDomain = spawnSync(process.execPath, ["scripts/assurance/models/run.mjs", "--suite=concurrency", "--domain=chat-call"], { encoding: "utf8" });
  const seedWithoutDomain = spawnSync(process.execPath, ["scripts/assurance/models/run.mjs", "--suite=property", "--seed=173501"], { encoding: "utf8" });
  const seedWithConcurrency = spawnSync(process.execPath, ["scripts/assurance/models/run.mjs", "--suite=concurrency", "--domain=chat-call", "--seed=173501"], { encoding: "utf8" });
  const deferredRouting = spawnSync(process.execPath, ["scripts/assurance/models/run.mjs", "--suite=concurrency"], { encoding: "utf8" });
  const clobber = spawnSync(process.execPath, ["scripts/assurance/models/run.mjs", "--domain=missing", `--replay-output=${output}`], { encoding: "utf8" });
  assert.deepEqual([malformed.status, JSON.parse(malformed.stdout).findings[0].id], [1, "ASSURANCE_MODEL_REPLAY_PATH_INVALID"]);
  assert.equal(JSON.parse(malformed.stdout).requestIdentity.path, "bad:path");
  assert.deepEqual([emptyReplay.status, JSON.parse(emptyReplay.stdout).property.status], [1, "BLOCKED_INTERNAL"]);
  assert.equal(JSON.parse(emptyReplay.stdout).requestIdentity.path, "999:999");
  assert.deepEqual([concurrencyReplay.status, JSON.parse(concurrencyReplay.stdout).findings[0].id], [1, "ASSURANCE_MODEL_REPLAY_SUITE_UNSUPPORTED"]);
  assert.deepEqual([concurrencyDomain.status, JSON.parse(concurrencyDomain.stdout).findings[0].id], [1, "ASSURANCE_MODEL_DOMAIN_SUITE_UNSUPPORTED"]);
  assert.deepEqual([seedWithoutDomain.status, JSON.parse(seedWithoutDomain.stdout).findings[0].id], [1, "ASSURANCE_MODEL_SEED_DOMAIN_REQUIRED"]);
  assert.deepEqual([seedWithConcurrency.status, JSON.parse(seedWithConcurrency.stdout).findings[0].id], [1, "ASSURANCE_MODEL_SEED_SUITE_UNSUPPORTED"]);
  assert.deepEqual([deferredRouting.status, JSON.parse(deferredRouting.stdout).deferredFindings[0].id], [0, "ASSURANCE_MODEL_JOB_ROUTING_DEFERRED_PR_E"]);
  assert.deepEqual([clobber.status, JSON.parse(clobber.stdout).replayPersistence.finding, fs.readFileSync(output, "utf8")], [1, "ASSURANCE_MODEL_REPLAY_OUTPUT_EXISTS", "preserve"]);
  fs.rmSync(directory, { recursive: true });
});
