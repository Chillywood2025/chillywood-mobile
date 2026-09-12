import assert from "node:assert/strict";
import test from "node:test";

import { terminalFixture } from "../../scripts/assurance/control-plane-qualification.mjs";
import { projectTerminalSynchronization, terminalSynchronizationIdempotent } from "../../scripts/assurance/control-plane-v2.mjs";

test("terminal synchronization converges once and the exact second execution is a no-op", () => {
  const fixture = terminalFixture();
  const first = projectTerminalSynchronization(fixture);
  assert.equal(first.ok, true);
  assert.equal(first.mutated, true);
  const second = projectTerminalSynchronization({ record: first.record, transition: fixture.transition });
  assert.equal(second.ok, true);
  assert.equal(second.mutated, false);
  assert.deepEqual(second.record, first.record);
  assert.deepEqual(terminalSynchronizationIdempotent(fixture), {
    ok: true,
    firstMutation: true,
    secondMutation: false,
    record: first.record,
    findings: [],
  });
});

test("terminal synchronization rejects evidence changes after convergence", () => {
  const fixture = terminalFixture();
  const first = projectTerminalSynchronization(fixture);
  const stale = structuredClone(fixture.transition);
  stale.nextTask = "DIFFERENT_NEXT_TASK";
  stale.noActiveEngineeringDoctrine.nextPermittedAction = "DIFFERENT_NEXT_TASK";
  const second = projectTerminalSynchronization({ record: first.record, transition: stale });
  assert.equal(second.ok, false);
  assert.equal(second.mutated, false);
  assert.deepEqual(second.findings, ["TERMINAL_SYNCHRONIZATION_CONFLICT"]);
});

test("terminal synchronization converges a valid consumed amendment and remains idempotent", () => {
  const fixture = terminalFixture({ amended: true });
  const first = projectTerminalSynchronization(fixture);
  assert.equal(first.ok, true, first.findings?.join(","));
  assert.equal(first.terminalOutcome.amendmentReceipt.authorityClassification, "LIVE_IMMUTABLE_OWNER_RECEIPT");
  const second = projectTerminalSynchronization({ record: first.record, transition: fixture.transition });
  assert.equal(second.ok, true);
  assert.equal(second.mutated, false);
});

test("terminal synchronization rejects forged validation, final-source, lease, and next-action evidence before writing", () => {
  const mutations = [
    (transition) => { transition.implementations[0].validation.phase1RawLanesPassed = 12; },
    (transition) => { transition.implementations[0].validation.assuranceDisposition = "PASS"; transition.implementations[0].validation.bypassedChecks = ["hidden bypass"]; },
    (transition) => { transition.finalSourceEvidence.source = "CALLER_ASSERTED"; },
    (transition) => { transition.finalSourceEvidence.implementationEvidence[0].headSha = "f".repeat(40); },
    (transition) => { transition.baseLease.allowedPaths = ["different"]; transition.baseLeaseHash = "0".repeat(64); },
    (transition) => { transition.noActiveEngineeringDoctrine.nextPermittedAction = "DIFFERENT_NEXT_TASK"; },
  ];
  for (const mutate of mutations) {
    const fixture = terminalFixture();
    mutate(fixture.transition);
    const result = projectTerminalSynchronization(fixture);
    assert.equal(result.ok, false);
    assert.equal(result.mutated, false);
  }
});
