import { isStrictSentinelEvaluationPayload } from "./index.ts";

const validPayload = () => ({
  action: "record_sentinel_evaluator_proof",
  assessmentHash: "a".repeat(64),
  assessmentKind: "finding_detection",
  evaluatorOutputHash: "b".repeat(64),
  evaluatorProofHash: "c".repeat(64),
  evidenceManifestHash: "d".repeat(64),
  sentinelRunId: "11111111-1111-4111-8111-111111111111",
  verdict: "passed",
});
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

Deno.test("sentinel evaluator accepts only exact proof persistence", () => {
  assert(
    isStrictSentinelEvaluationPayload(validPayload()),
    "valid evaluator payload rejected",
  );
  for (
    const payload of [
      { ...validPayload(), extra: true },
      { ...validPayload(), verdict: "approved" },
      { ...validPayload(), action: "triage_finding" },
      { ...validPayload(), evaluatorProofHash: "c".repeat(63) },
    ]
  ) {
    assert(
      !isStrictSentinelEvaluationPayload(payload),
      "unsafe evaluator payload accepted",
    );
  }
});
