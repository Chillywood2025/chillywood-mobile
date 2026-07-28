import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_QUALITY_TRIAGE_ADAPTERS } from "../src/adapters/triage.mjs";
import { TRIAGE_STATEMENTS } from "../src/database-statements/triage.mjs";

const ATTESTATION_ID = "10000000-0000-4000-8000-000000000001";
const ASSERTION = "t".repeat(40);

test("isolated triage consumes one exact LiveKit bounded no-finding attestation", async () => {
  const calls = [];
  const result = await PRODUCT_QUALITY_TRIAGE_ADAPTERS
    .triage_livekit_bounded_failure_no_finding.execute({
      database: {
        call: async (id, parameters) => {
          calls.push({ id, parameters });
          return {
            attestationId: ATTESTATION_ID,
            disposition: "bounded_failure_no_finding",
            findingCreated: false,
          };
        },
      },
      env: {
        COGNITIVE_PRODUCT_QUALITY_TRIAGE_ASSERTION: ASSERTION,
      },
      payload: {
        action: "triage_livekit_bounded_failure_no_finding",
        attestationId: ATTESTATION_ID,
      },
    });

  assert.equal(result.disposition, "bounded_failure_no_finding");
  assert.equal(result.findingCreated, false);
  assert.deepEqual(calls, [{
    id: "triageLiveKitBoundedNoFinding",
    parameters: [ATTESTATION_ID, ASSERTION],
  }]);
  assert.equal(
    TRIAGE_STATEMENTS.triageLiveKitBoundedNoFinding.arity,
    2,
  );
  assert.match(
    TRIAGE_STATEMENTS.triageLiveKitBoundedNoFinding.text,
    /cognitive_runtime\.product_quality_triage_livekit_bounded_no_finding/u,
  );
  assert.doesNotMatch(
    TRIAGE_STATEMENTS.triageLiveKitBoundedNoFinding.text,
    /\b(?:insert|update|delete)\b/iu,
  );
});
