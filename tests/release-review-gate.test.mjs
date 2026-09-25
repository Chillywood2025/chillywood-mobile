import assert from "node:assert/strict";
import test from "node:test";

import { evaluateReleaseReviewIssues } from "../scripts/release-review-gate.mjs";

test("release review gate passes only with no open sentinel issues", () => {
  assert.deepEqual(evaluateReleaseReviewIssues([]), { ok: true, findings: [] });
});

test("open sentinel issue remains an action-specific release blocker", () => {
  const result = evaluateReleaseReviewIssues([{ number: 203, state: "open" }]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["RELEASE_REVIEW_FINDINGS_OPEN:#203"]);
});

test("malformed or closed evidence supplied as open readback fails closed", () => {
  assert.equal(evaluateReleaseReviewIssues([{}]).ok, false);
  assert.equal(evaluateReleaseReviewIssues([{ number: 203, state: "closed" }]).ok, false);
});
