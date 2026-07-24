import { handler, validateDraftPlan } from "./index.ts";

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

Deno.test("GitHub broker rejects extra caller-authored fields", () => {
  assert(
    validateDraftPlan({ ...basePlan(), merge: true }) === null,
    "caller-authored merge field accepted",
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
