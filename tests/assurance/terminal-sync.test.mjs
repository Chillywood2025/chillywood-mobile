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
  const second = projectTerminalSynchronization({ record: first.record, transition: stale });
  assert.equal(second.ok, false);
  assert.equal(second.mutated, false);
  assert.deepEqual(second.findings, ["TERMINAL_SYNCHRONIZATION_CONFLICT"]);
});
