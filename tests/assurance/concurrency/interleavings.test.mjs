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
});
