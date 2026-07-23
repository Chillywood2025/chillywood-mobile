import {
  recordCredentialFromTrustedRecords,
  recordDeliberationFromTrustedRecords,
  recordResearchFromTrustedRecords,
} from "./index.ts";

const SCOPE = Object.freeze({
  projectId: "00000000-0000-4000-8000-000000000001",
  taskId: "00000000-0000-4000-8000-000000000002",
});
const SERVICE_IDENTITY_TOKEN = "synthetic-governance-control-test-token";
const BROKER_RECEIPT_ID = "00000000-0000-4000-8000-000000000004";
const CLAIM_ID = "00000000-0000-4000-8000-000000000005";
const DELIBERATION_ID = "00000000-0000-4000-8000-000000000006";
const DECISION_MANIFEST_ID = "00000000-0000-4000-8000-000000000007";
const PROVIDER_ATTESTATION_ID = "00000000-0000-4000-8000-000000000008";
const PROVIDER_READBACK_ID = "00000000-0000-4000-8000-000000000009";
const EVALUATOR_RECORD_ID = "00000000-0000-4000-8000-00000000000a";

const assertEquals = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
};

const body = async (response: Response): Promise<Record<string, unknown>> =>
  await response.json() as Record<string, unknown>;

type ResearchClient = Parameters<
  typeof recordResearchFromTrustedRecords
>[0];
type DeliberationClient = Parameters<
  typeof recordDeliberationFromTrustedRecords
>[0];
type CredentialClient = Parameters<
  typeof recordCredentialFromTrustedRecords
>[0];

const client = (
  implementation: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>,
): ResearchClient & DeliberationClient & CredentialClient =>
  ({ rpc: implementation }) as unknown as
    & ResearchClient
    & DeliberationClient
    & CredentialClient;

Deno.test("owner JSON cannot mint a research transport receipt or passed claim", async () => {
  let calls = 0;
  const response = await recordResearchFromTrustedRecords(
    client(async () => {
      calls += 1;
      return { data: null, error: null };
    }),
    SCOPE,
    SERVICE_IDENTITY_TOKEN,
    {
      action: "record_public_research_canary",
      canaryKey: "platform_policy_research",
      category: "platform_policy",
      claim: "Synthetic owner-supplied claim",
      sourceCommit: "a".repeat(40),
      sources: [{
        reference: "https://example.com/",
        transportReceiptHashes: ["a".repeat(64)],
      }],
    },
  );
  assertEquals(
    response.status,
    400,
    "legacy research payload must fail closed",
  );
  assertEquals(
    await body(response),
    { error: "trusted_research_records_required" },
    "legacy payload rejection must be explicit",
  );
  assertEquals(
    calls,
    0,
    "legacy research payload must not invoke a database RPC",
  );
});

Deno.test("arbitrary research record IDs cannot pass without DB verification", async () => {
  const response = await recordResearchFromTrustedRecords(
    client(async (name) => ({
      data: null,
      error: name === "cognitive_accept_verified_research_canary"
        ? { code: "PGRST202" }
        : null,
    })),
    SCOPE,
    SERVICE_IDENTITY_TOKEN,
    {
      action: "record_public_research_canary",
      brokerReceiptId: BROKER_RECEIPT_ID,
      canaryKey: "platform_policy_research",
      evaluatorRecordId: EVALUATOR_RECORD_ID,
      researchClaimId: CLAIM_ID,
    },
  );
  assertEquals(
    response.status,
    409,
    "unverified research records must fail closed",
  );
  assertEquals(
    await body(response),
    { error: "trusted_research_records_rejected" },
    "DB verification failure must remain non-passing",
  );
});

Deno.test("trusted record acceptance requires the dedicated governance service identity", async () => {
  let calls = 0;
  const response = await recordResearchFromTrustedRecords(
    client(async () => {
      calls += 1;
      return { data: null, error: null };
    }),
    SCOPE,
    "",
    {
      action: "record_public_research_canary",
      brokerReceiptId: BROKER_RECEIPT_ID,
      canaryKey: "platform_policy_research",
      evaluatorRecordId: EVALUATOR_RECORD_ID,
      researchClaimId: CLAIM_ID,
    },
  );
  assertEquals(
    response.status,
    400,
    "missing service identity must fail closed",
  );
  assertEquals(calls, 0, "missing identity must not invoke the acceptance RPC");
});

Deno.test("topic-only owner JSON cannot synthesize collective deliberation", async () => {
  let calls = 0;
  const response = await recordDeliberationFromTrustedRecords(
    client(async () => {
      calls += 1;
      return { data: null, error: null };
    }),
    SCOPE,
    SERVICE_IDENTITY_TOKEN,
    {
      action: "record_collective_deliberation_canary",
      canaryKey: "low_risk_ux_deliberation",
      sourceCommit: "b".repeat(40),
      topic: "A topic cannot stand in for independent council assessments.",
    },
  );
  assertEquals(
    response.status,
    400,
    "topic-only deliberation must fail closed",
  );
  assertEquals(
    await body(response),
    { error: "trusted_deliberation_records_required" },
    "synthetic deliberation rejection must be explicit",
  );
  assertEquals(
    calls,
    0,
    "topic-only deliberation must not invoke a database RPC",
  );
});

Deno.test("mismatched DB deliberation records cannot be accepted", async () => {
  const response = await recordDeliberationFromTrustedRecords(
    client(async () => ({
      data: {
        accepted: true,
        canary_key: "low_risk_ux_deliberation",
        decision_manifest_id: DECISION_MANIFEST_ID,
        deliberation_id: "00000000-0000-4000-8000-00000000000b",
        evaluator_record_id: EVALUATOR_RECORD_ID,
        evaluator_state: "pass",
        result_status: "passed",
      },
      error: null,
    })),
    SCOPE,
    SERVICE_IDENTITY_TOKEN,
    {
      action: "record_collective_deliberation_canary",
      canaryKey: "low_risk_ux_deliberation",
      decisionManifestId: DECISION_MANIFEST_ID,
      deliberationId: DELIBERATION_ID,
      evaluatorRecordId: EVALUATOR_RECORD_ID,
    },
  );
  assertEquals(
    response.status,
    409,
    "mismatched trusted records must fail closed",
  );
});

Deno.test("owner JSON cannot self-attest a credential with supplied hashes", async () => {
  let calls = 0;
  const response = await recordCredentialFromTrustedRecords(
    client(async () => {
      calls += 1;
      return { data: null, error: null };
    }),
    SCOPE,
    SERVICE_IDENTITY_TOKEN,
    {
      action: "record_level01_credential_attestation",
      credentialKind: "github_draft_pr",
      publicFingerprintHash: "c".repeat(64),
      scopeManifestHash: "d".repeat(64),
    },
  );
  assertEquals(
    response.status,
    400,
    "self-attested credential must fail closed",
  );
  assertEquals(
    await body(response),
    { error: "trusted_credential_records_required" },
    "credential verifier records must be mandatory",
  );
  assertEquals(calls, 0, "self-attestation must not invoke a database RPC");
});

Deno.test("matching immutable DB records are the only accepted research path", async () => {
  const response = await recordResearchFromTrustedRecords(
    client(async (name, parameters) => {
      assertEquals(
        name,
        "cognitive_accept_verified_research_canary",
        "trusted acceptance RPC name",
      );
      assertEquals(
        "p_owner_actor_id" in parameters,
        false,
        "the database must bind Owner authorization to auth.uid()",
      );
      assertEquals(
        "p_service_identity" in parameters,
        false,
        "the database derives service identity from the verified token",
      );
      assertEquals(
        parameters.p_service_identity_token,
        SERVICE_IDENTITY_TOKEN,
        "dedicated service identity token must reach only the acceptance RPC",
      );
      return {
        data: {
          accepted: true,
          broker_receipt_id: BROKER_RECEIPT_ID,
          canary_key: "platform_policy_research",
          canary_run_id: "00000000-0000-4000-8000-00000000000c",
          evaluator_record_id: EVALUATOR_RECORD_ID,
          evaluator_state: "pass",
          research_claim_id: CLAIM_ID,
          result_status: "passed",
        },
        error: null,
      };
    }),
    SCOPE,
    SERVICE_IDENTITY_TOKEN,
    {
      action: "record_public_research_canary",
      brokerReceiptId: BROKER_RECEIPT_ID,
      canaryKey: "platform_policy_research",
      evaluatorRecordId: EVALUATOR_RECORD_ID,
      researchClaimId: CLAIM_ID,
    },
  );
  assertEquals(response.status, 200, "verified research records may pass");
  assertEquals(
    (await body(response)).source,
    "verified_database_records",
    "success must identify the authoritative record source",
  );
});

Deno.test("matching immutable DB records are the only configured credential path", async () => {
  const response = await recordCredentialFromTrustedRecords(
    client(async () => ({
      data: {
        accepted: true,
        credential_kind: "github_draft_pr",
        evaluator_record_id: EVALUATOR_RECORD_ID,
        evaluator_state: "pass",
        provider_attestation_id: PROVIDER_ATTESTATION_ID,
        provider_readback_id: PROVIDER_READBACK_ID,
        state: "configured",
      },
      error: null,
    })),
    SCOPE,
    SERVICE_IDENTITY_TOKEN,
    {
      action: "record_level01_credential_attestation",
      credentialKind: "github_draft_pr",
      evaluatorRecordId: EVALUATOR_RECORD_ID,
      providerAttestationId: PROVIDER_ATTESTATION_ID,
      providerReadbackId: PROVIDER_READBACK_ID,
    },
  );
  assertEquals(
    response.status,
    200,
    "verified credential records may configure",
  );
  assertEquals(
    (await body(response)).source,
    "verified_database_records",
    "credential success must identify authoritative records",
  );
});
