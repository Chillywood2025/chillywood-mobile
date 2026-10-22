import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const current = file => readFileSync(new URL(file, root), "utf8");
const screen = () => current("app/chat/[threadId].tsx");
const helper = () => current("_lib/chat.ts");
const replace = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Mutation anchor must occur exactly once: ${before}`);
  return source.replace(before, after);
};
const omitRecoveryFreshness = () => replace(screen(),
  "const isCurrent = () => pendingCallStartRecoveryRef.current?.operation === pending.operation\n      && isStartOperationCurrent(pending.operation) && isThreadReadCurrent(read);",
  "const isCurrent = () => true;");
const unknownScenario = "controlled unknown begin response never gains a confirmed-start receipt and remains retryable";

// These controls reverse only the named protection and run its existing oracle.
// They never replace a product callback with an invented successful fixture.
const controls = [
  {
    name: "recovery-result error separation",
    scenario: "confirmed Start returns only typed recovery state, never the internal readback error",
    assertion: "pending result must carry domain state, not a raw error or customer-copy object",
    helper: () => replace(helper(),
      'disposition: "readback_pending",\n        receipt: {',
      'disposition: "readback_pending",\n        error: readbackError,\n        receipt: {'),
  },
  {
    name: "sanitized recovery error copy",
    scenario: "persistent read failures and incoherent rows preserve the confirmed receipt and remain read-only retryable",
    assertion: "recovery error copy must not expose the internal provider failure",
    screen: () => replace(screen(),
      'error: getUserFacingErrorMessage(recoveryError, "Call status is still unavailable. Refresh call status to try again.")',
      'error: recoveryError.message'),
  },
  {
    name: "reconciled Start callback retirement",
    scenario: "recovery retires pre-recovery Start callbacks for accepted after projection commit",
    assertion: "retired Start cannot read, replay setup, or reopen recovered media",
    screen: () => replace(screen(),
      "if (settledCallStartRecoveryRef.current !== settledCallStartRecovery) return;", ""),
  },
  {
    name: "duplicate-Start barriers",
    scenario: "actual helper \\+ mounted video Start preserves confirmed dispatch after error readback",
    assertion: "fresh/stale Start and Open Call cannot replay begin or dispatch",
    screen: () => replace(replace(screen(),
      "if (callBusy || pendingCallStartRecoveryRef.current) return;", ""),
    "|| operationRef.current || startOperationRef.current || visibleInviteRef.current) return null;",
    "|| operationRef.current || visibleInviteRef.current) return null;"),
  },
  {
    name: "recovery read single-flight",
    scenario: "read recovery is single-flight even through retained callbacks",
    assertion: "duplicate refreshes cannot issue another read while one is pending",
    screen: () => replace(screen(),
      "|| !isStartOperationCurrent(pending.operation) || callStartRecoveryReadRef.current) return;",
      "|| !isStartOperationCurrent(pending.operation)) return;"),
  },
  {
    name: "retained recovery callback ownership",
    scenario: "retained recovery callbacks cannot read or release a successor pending Start",
    assertion: "an old button cannot accidentally recover a newer Start",
    screen: () => replace(screen(),
      "if (!pending || pending.operation !== pendingCallStartRecovery?.operation",
      "if (!pending"),
  },
  {
    name: "remote-End recovery freshness",
    scenario: "remote End fences an in-flight recovery, then a fresh terminal read safely releases Start",
    assertion: "a late ringing snapshot cannot undo authoritative End",
    screen: omitRecoveryFreshness,
  },
  {
    name: "newer-call recovery freshness",
    scenario: "newer call projection owns the screen over late recovery",
    assertion: "a stale receipt cannot overwrite newer call or terminal state",
    screen: omitRecoveryFreshness,
  },
  {
    name: "actual-End recovery freshness",
    scenario: "newer call and actual End owns the screen over late recovery",
    assertion: "a stale receipt cannot overwrite newer call or terminal state",
    screen: omitRecoveryFreshness,
  },
  {
    name: "layered owner/session/route recovery fences",
    scenario: "late recovery cannot project into a replacement (owner|session|route)",
    assertion: "old success/error must not alter the replacement owner's UI",
    expectedFailures: 3,
    screen: omitRecoveryFreshness,
    // The API authority check and screen operation fence independently reject
    // stale owners. Remove both to test the UI oracle, not a surviving layer.
    helper: () => replace(helper(),
      "const assertChatReadBindingCurrent = (binding: AccountSessionAuthorityBinding) => {\n  if (!sameAccountSessionAuthority(binding, getCurrentAccountSessionAuthoritySnapshot())) {\n    throw new UserFacingError(\"chat_action\", CHAT_ACCOUNT_CHANGED_MESSAGE);\n  }\n};",
      "const assertChatReadBindingCurrent = (_binding: AccountSessionAuthorityBinding) => {};"),
  },
  {
    name: "truthful unknown-begin delivery copy",
    scenario: unknownScenario,
    assertion: "unknown begin delivery copy must preserve uncertainty",
    screen: () => replace(screen(),
      "Unable to confirm call setup. Refresh the thread before trying again.",
      "Delivery status: invite failed. Call was not started and receiver notification was not sent."),
  },
  {
    name: "truthful unknown-begin error banner",
    scenario: unknownScenario,
    assertion: "unknown begin must not assert that the invite was never saved",
    helper: () => replace(helper(),
      "Unable to confirm whether this Chi'lly Chat call was started. Refresh the thread before trying again.",
      "Unable to start Chi'lly Chat call. The receiver invite could not be saved."),
  },
];

for (const control of controls) {
  test(`confirmed Start negative control rejects missing ${control.name}`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "chat-start-negative-"));
    try {
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      delete env.CHILLY_CHAT_FULL_THREAD_TEST_SOURCE;
      delete env.CHILLY_CHAT_START_HELPER_TEST_SOURCE;
      if (control.screen) {
        const file = path.join(directory, "thread.tsx");
        writeFileSync(file, control.screen());
        env.CHILLY_CHAT_FULL_THREAD_TEST_SOURCE = file;
      }
      if (control.helper) {
        const file = path.join(directory, "chat.ts");
        writeFileSync(file, control.helper());
        env.CHILLY_CHAT_START_HELPER_TEST_SOURCE = file;
      }
      const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap",
        `--test-name-pattern=^${control.scenario}$`, "tests/chat-thread-confirmed-start-recovery.test.mjs"],
      { cwd: root, env, encoding: "utf8", timeout: 60_000 });
      const output = result.stdout + result.stderr;
      assert.equal(result.error, undefined, output);
      assert.equal(result.status, 1, output);
      const failures = output.match(/^not ok [0-9]+ - /gm) ?? [];
      assert.equal(failures.length, control.expectedFailures ?? 1, output);
      assert.equal((output.match(/^  code: 'ERR_ASSERTION'$/gm) ?? []).length, failures.length, output);
      assert.ok(output.includes(control.assertion), output);
      assert.doesNotMatch(output, /SyntaxError|ReferenceError|TypeError|Cannot find module|Unmodeled|cancelledByParent|testTimeoutFailure/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
