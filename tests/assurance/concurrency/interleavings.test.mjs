import assert from "node:assert/strict";
import test from "node:test";
import { runDeterministicInterleavings } from "../../../_lib/assurance/state-models/concurrency.mjs";

test("required races run in both deterministic orders behind barriers and a transaction lock", async () => {
  const report = await runDeterministicInterleavings();
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.scenarioCount, 10);
  assert.equal(report.scheduleCount, 20);
  assert.deepEqual(report.mechanism, ["controlled barriers", "promises", "transaction lock", "explicit schedules"]);
  for (const required of [
    "accept-versus-timeout", "accept-versus-cancel", "old-cleanup-versus-new-invite",
    "end-versus-membership-update", "revenuecat-renewal-versus-transfer",
    "revenuecat-expiration-versus-delayed-renewal", "push-receipt-versus-session-boot",
    "native-answer-versus-react-initialization", "update-activation-versus-rollback",
    "emergency-stop-versus-mutation"
  ]) {
    assert.equal(report.results.filter(({ scenario }) => scenario === required).length, 2);
  }
  assert.equal(report.results.filter(({ scenario, finalState }) => scenario === "revenuecat-expiration-versus-delayed-renewal" && finalState.authoritativeTime === 20 && !finalState.access).length, 2);
  const exactSchedules = {
    "accept-versus-timeout/accept -> timeout": { outcome: "accepted", resolutionCount: 1 },
    "accept-versus-timeout/timeout -> accept": { outcome: "timed_out", resolutionCount: 1 },
    "accept-versus-cancel/accept -> cancel": { outcome: "accepted", resolutionCount: 1 },
    "accept-versus-cancel/cancel -> accept": { outcome: "cancelled", resolutionCount: 1 },
    "update-activation-versus-rollback/activate -> rollback": { active: "embedded", compatible: true, activationEnabled: false, activationAttempts: 1, activations: 1, rollbacks: 1 },
    "update-activation-versus-rollback/rollback -> activate": { active: "embedded", compatible: true, activationEnabled: false, activationAttempts: 1, activations: 0, rollbacks: 1 },
    "emergency-stop-versus-mutation/emergency_stop -> mutation": { stopped: true, mutations: 0, deniedMutations: 1 },
    "emergency-stop-versus-mutation/mutation -> emergency_stop": { stopped: true, mutations: 1, deniedMutations: 0 }
  };
  const exactResults = report.results.filter(({ expectedState }) => expectedState);
  assert.equal(exactResults.length, 8);
  for (const result of exactResults) {
    const expected = exactSchedules[`${result.scenario}/${result.schedule}`];
    assert.deepEqual(result.expectedState, expected);
    assert.deepEqual(result.finalState, expected, `${result.scenario}/${result.schedule}`);
  }
  assert.equal(Object.keys(exactSchedules).length, exactResults.length);
});
