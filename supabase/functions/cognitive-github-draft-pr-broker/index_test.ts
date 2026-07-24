import {
  APPROVED_SCOPE_MANIFEST_HASH,
  deriveDraftPlanContract,
  handler,
  validateDraftPlan,
} from "./index.ts";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertEquals = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
};

const basePlan = (): Record<string, unknown> => ({
  action: "execute_canary",
  approvalScopeHash: "a".repeat(64),
  baseCommit: "d".repeat(40),
  branchName: "codex/cognitive-canary/documentation-proof",
  callId: "canary-call-001",
  canaryKey: "documentation_draft_pr",
  capabilityId: "capability_001",
  capabilityNonce: "n".repeat(40),
  capabilityToken: "t".repeat(40),
  commitMessage: "Add bounded documentation canary",
  content: "# Governed documentation canary\n\nNo production mutation.\n",
  path: "docs/intelligence/canaries/documentation-proof.md",
  planSnapshotHash: "b".repeat(64),
  preflightReceiptId: "00000000-0000-4000-8000-000000000004",
  priorBlobSha: "absent",
  projectId: "00000000-0000-4000-8000-000000000002",
  requiredTestsHash: "c".repeat(64),
  resourceLeaseId: "00000000-0000-4000-8000-000000000003",
  taskId: "00000000-0000-4000-8000-000000000001",
  title: "Add governed documentation canary",
});

Deno.test("GitHub broker accepts only the exact documentation canary path", () => {
  const valid = validateDraftPlan(basePlan());
  assert(valid, "valid documentation plan rejected");
  assertEquals(
    valid?.path,
    "docs/intelligence/canaries/documentation-proof.md",
    "validated path",
  );
});

Deno.test("GitHub broker supports bounded test-only and low-risk source canaries", () => {
  const testPlan = validateDraftPlan({
    ...basePlan(),
    branchName: "codex/cognitive-canary/test-proof",
    canaryKey: "test_only_draft_pr",
    content: "Deno.test('bounded canary', () => {});",
    path: "scripts/cognitive-canaries/bounded-proof.mjs",
    title: "Add bounded test-only canary",
  });
  const sourcePlan = validateDraftPlan({
    ...basePlan(),
    branchName: "codex/cognitive-canary/source-proof",
    canaryKey: "low_risk_source_draft_pr",
    content: "export const boundedPresentationValue = true;\n",
    path: "components/presentation/BoundedValue.ts",
    priorBlobSha: "e".repeat(40),
    title: "Add bounded low-risk source canary",
  });
  assert(testPlan, "test-only plan rejected");
  assert(sourcePlan, "low-risk source plan rejected");
});

Deno.test("GitHub broker rejects privilege and scope expansion paths", () => {
  const rejected = [
    { path: ".github/workflows/release.yml" },
    { path: "supabase/migrations/20990101000000_expand.sql" },
    { path: "android/app/src/main/AndroidManifest.xml" },
    { path: "ios/ChiLlywood/Info.plist" },
    { path: "package.json" },
    { path: "src/auth/session.ts" },
    { path: "src/auth.ts" },
    { path: "app/payments.ts" },
    { path: "components/moderation.tsx" },
    { path: "src/provider-client.ts" },
    { path: "../docs/intelligence/canaries/escape.md" },
    { branchName: "main" },
    { branchName: "codex/cognitive-level01-operationalization" },
  ];
  for (const change of rejected) {
    assert(
      validateDraftPlan({ ...basePlan(), ...change }) === null,
      `privilege expansion accepted: ${JSON.stringify(change)}`,
    );
  }
});

Deno.test("GitHub broker rejects cross-canary file classes", () => {
  assert(
    validateDraftPlan({
      ...basePlan(),
      canaryKey: "documentation_draft_pr",
      path: "components/presentation/NotDocumentation.ts",
    }) === null,
    "documentation canary wrote source",
  );
  assert(
    validateDraftPlan({
      ...basePlan(),
      canaryKey: "test_only_draft_pr",
      path: "docs/intelligence/canaries/not-a-test.md",
    }) === null,
    "test canary wrote documentation",
  );
});

Deno.test("GitHub broker rejects secret-shaped content and oversized packets", () => {
  assert(
    validateDraftPlan({
      ...basePlan(),
      title: "Add aZ1_Bc2-De3_Fg4-Hi5_Jk6-Lm7_Np8_Qr9 canary",
    }) === null,
    "high-entropy title accepted",
  );
  assert(
    validateDraftPlan({
      ...basePlan(),
      commitMessage: `Add bearer eyJ${"a".repeat(12)}.${"b".repeat(12)}.${
        "c".repeat(12)
      }`,
    }) === null,
    "JWT-shaped commit message accepted",
  );
  assert(
    validateDraftPlan({
      ...basePlan(),
      content: `github_pat_${"x".repeat(40)}`,
    }) === null,
    "secret-shaped content accepted",
  );
  assert(
    validateDraftPlan({
      ...basePlan(),
      content: "x".repeat(12289),
    }) === null,
    "oversized documentation content accepted",
  );
});

Deno.test("GitHub broker binds each canary to exact base and prior blob state", () => {
  assert(
    validateDraftPlan({ ...basePlan(), baseCommit: "not-a-commit" }) === null,
    "invalid base commit accepted",
  );
  assert(
    validateDraftPlan({ ...basePlan(), priorBlobSha: "f".repeat(40) }) === null,
    "documentation canary accepted an existing prior blob",
  );
  assert(
    validateDraftPlan({
      ...basePlan(),
      canaryKey: "low_risk_source_draft_pr",
      path: "components/presentation/BoundedValue.ts",
      priorBlobSha: "absent",
    }) === null,
    "source canary accepted an absent prior blob",
  );
});

Deno.test("GitHub broker rejects extra caller-authored fields", () => {
  assert(
    validateDraftPlan({ ...basePlan(), merge: true }) === null,
    "caller-authored merge field accepted",
  );
});

Deno.test("approved plan contract detects every mutable GitHub substitution", async () => {
  const validated = validateDraftPlan(basePlan());
  assert(validated, "valid plan was not available for contract derivation");
  if (!validated) return;
  const approved = await deriveDraftPlanContract(validated);
  assertEquals(
    approved.planContractHash,
    "6191bf740d757f16cac96e71ac9c34a09014d822366d9e7d278b2058fb2b1b2b",
    "cross-runtime canonical plan hash",
  );
  const mutations: Record<string, unknown>[] = [
    { content: `${validated.content}\nSubstituted content.\n` },
    { title: "Substitute governed documentation canary" },
    { commitMessage: "Substitute bounded documentation canary" },
    { path: "docs/intelligence/canaries/substituted-proof.md" },
    { baseCommit: "e".repeat(40) },
    { priorBlobSha: "f".repeat(40) },
    { requiredTestsHash: "d".repeat(64) },
    {
      branchName: "codex/cognitive-canary/substituted-proof",
    },
    {
      canaryKey: "test_only_draft_pr",
      path: "scripts/cognitive-canaries/substituted-proof.mjs",
    },
  ];
  for (const mutation of mutations) {
    const changed = await deriveDraftPlanContract({
      ...validated,
      ...mutation,
    });
    assert(
      changed.planContractHash !== approved.planContractHash,
      `plan substitution retained approval hash: ${Object.keys(mutation)}`,
    );
  }
  assertEquals(
    approved.prBodyHash.length,
    64,
    "deterministic draft body hash",
  );
});

Deno.test("GitHub runtime pins the reviewed least-privilege scope manifest", () => {
  assertEquals(
    APPROVED_SCOPE_MANIFEST_HASH,
    "ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554",
    "reviewed GitHub App scope manifest",
  );
});

Deno.test("GitHub broker requires both gateway and broker authentication", async () => {
  const response = await handler(
    new Request("https://example.invalid", {
      body: JSON.stringify({ action: "status" }),
      method: "POST",
    }),
  );
  assertEquals(response.status, 401, "unauthenticated request status");
});

Deno.test("GitHub broker reports missing credential without external mutation", async () => {
  const names = [
    "COGNITIVE_GITHUB_DRAFT_PR_BROKER_INVOKE_SHA256",
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_REPOSITORY_ID",
  ];
  const previous = new Map(names.map((name) => [name, Deno.env.get(name)]));
  const invocation = "bounded-github-broker-test-invocation";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(invocation),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  try {
    for (const name of names) Deno.env.delete(name);
    Deno.env.set("COGNITIVE_GITHUB_DRAFT_PR_BROKER_INVOKE_SHA256", hash);
    const response = await handler(
      new Request("https://example.invalid", {
        body: JSON.stringify({ action: "status" }),
        headers: {
          authorization: `Bearer ${"a".repeat(40)}`,
          "x-cognitive-github-broker-invocation": invocation,
        },
        method: "POST",
      }),
    );
    const body = await response.json();
    assertEquals(response.status, 200, "status response");
    assertEquals(body.credential, "MISSING", "credential state");
    assertEquals(
      body.blocker,
      "GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED",
      "credential blocker",
    );
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});

Deno.test("GitHub broker fails closed until provider no-merge proof exists", async () => {
  const names = [
    "COGNITIVE_GITHUB_DRAFT_PR_BROKER_INVOKE_SHA256",
    "COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN",
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_REPOSITORY_ID",
  ];
  const previous = new Map(names.map((name) => [name, Deno.env.get(name)]));
  const invocation = "bounded-github-broker-provider-proof-test";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(invocation),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const requestHeaders = {
    authorization: `Bearer ${"a".repeat(40)}`,
    "x-cognitive-github-broker-invocation": invocation,
  };
  try {
    Deno.env.set("COGNITIVE_GITHUB_DRAFT_PR_BROKER_INVOKE_SHA256", hash);
    Deno.env.set(
      "COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN",
      "bounded-service-identity",
    );
    Deno.env.set("GITHUB_APP_ID", "123");
    Deno.env.set("GITHUB_APP_INSTALLATION_ID", "456");
    Deno.env.set("GITHUB_APP_PRIVATE_KEY", "not-read-by-blocked-operation");
    Deno.env.set("GITHUB_REPOSITORY_ID", "1159469393");

    const statusResponse = await handler(
      new Request("https://example.invalid", {
        body: JSON.stringify({ action: "status" }),
        headers: requestHeaders,
        method: "POST",
      }),
    );
    const statusBody = await statusResponse.json();
    assertEquals(statusResponse.status, 200, "status response");
    assertEquals(
      statusBody.blocker,
      "GITHUB_NO_MERGE_PROVIDER_PROOF_REQUIRED",
      "provider proof blocker",
    );
    assertEquals(
      statusBody.providerTokenCapability,
      "CONTENTS_WRITE_MERGE_CAPABLE",
      "provider token capability",
    );
    assertEquals(
      statusBody.providerMergeEnforcement,
      "UNPROVED",
      "provider merge enforcement",
    );
    assertEquals(statusBody.runtimeAuthority, "blocked", "runtime authority");

    const attestationResponse = await handler(
      new Request("https://example.invalid", {
        body: JSON.stringify({
          action: "attest_provider_readback",
          projectId: "00000000-0000-4000-8000-000000000002",
          taskId: "00000000-0000-4000-8000-000000000001",
        }),
        headers: requestHeaders,
        method: "POST",
      }),
    );
    assertEquals(attestationResponse.status, 503, "attestation response");
    assertEquals(
      (await attestationResponse.json()).error,
      "GITHUB_NO_MERGE_PROVIDER_PROOF_REQUIRED",
      "attestation blocker",
    );
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
