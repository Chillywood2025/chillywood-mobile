import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_QUALITY_TRIAGE_ADAPTERS } from "../src/adapters/triage.mjs";
import { TRIAGE_STATEMENTS } from "../src/database-statements/triage.mjs";

const RUN_ID = "10000000-0000-4000-8000-000000000001";
const PROOF_ID = "20000000-0000-4000-8000-000000000002";
const PROOF_HASH = "a".repeat(64);
const ASSERTION = "t".repeat(40);

test("isolated triage consumes one exact no-finding proof", async () => {
  const calls = [];
  const result = await PRODUCT_QUALITY_TRIAGE_ADAPTERS
    .triage_no_finding.execute({
      database: {
        call: async (id, parameters) => {
          calls.push({ id, parameters });
          return {
            disposition: "no_finding",
            evaluatorProofId: PROOF_ID,
            sentinelRunId: RUN_ID,
          };
        },
      },
      env: {
        COGNITIVE_PRODUCT_QUALITY_TRIAGE_ASSERTION: ASSERTION,
      },
      payload: {
        action: "triage_no_finding",
        evaluatorProofHash: PROOF_HASH,
        evaluatorProofId: PROOF_ID,
        sentinelRunId: RUN_ID,
      },
    });

  assert.equal(result.disposition, "no_finding");
  assert.deepEqual(calls, [{
    id: "triageNoFinding",
    parameters: [
      RUN_ID,
      PROOF_ID,
      PROOF_HASH,
      "cognitive_product_quality_triage",
      ASSERTION,
    ],
  }]);
  assert.equal(TRIAGE_STATEMENTS.triageNoFinding.arity, 5);
  assert.match(
    TRIAGE_STATEMENTS.triageNoFinding.text,
    /cognitive_runtime\.product_quality_triage_no_finding/u,
  );
  assert.doesNotMatch(
    TRIAGE_STATEMENTS.triageNoFinding.text,
    /\b(?:insert|update|delete)\b/iu,
  );
});
