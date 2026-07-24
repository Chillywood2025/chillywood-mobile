import { isStrictBootstrapApprovalPayload } from "./index.ts";

const validPayload = () => ({
  action: "record_bootstrap_approval",
  branchName: "codex/cognitive-live-activation-finalize",
  constitutionHash: "c".repeat(64),
  evaluatorRequirementHash: "e".repeat(64),
  policyVersion: "collective-governance-v1",
  repositoryFullName: "Chillywood2025/chillywood-mobile",
  retentionPolicyHash: "b".repeat(64),
  rollbackHash: "d".repeat(64),
  sourceCommit: "a".repeat(40),
  validitySeconds: 3600,
});

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

Deno.test("strict bootstrap approval accepts only the exact bounded schema", () => {
  assert(
    isStrictBootstrapApprovalPayload(validPayload()),
    "valid bootstrap approval payload was rejected",
  );
});

Deno.test("strict bootstrap approval rejects extras and malformed authority fields", () => {
  const rejected = [
    { ...validPayload(), extra: true },
    { ...validPayload(), action: "record_owner_approval" },
    { ...validPayload(), repositoryFullName: "Chillywood2025/other" },
    { ...validPayload(), policyVersion: "collective-governance-v2" },
    { ...validPayload(), branchName: "main" },
    { ...validPayload(), branchName: "codex/main/activation" },
    { ...validPayload(), branchName: "codex/release" },
    { ...validPayload(), sourceCommit: "A".repeat(40) },
    { ...validPayload(), sourceCommit: "a".repeat(39) },
    { ...validPayload(), sourceCommit: 1 },
    { ...validPayload(), retentionPolicyHash: "b".repeat(63) },
    { ...validPayload(), constitutionHash: "z".repeat(64) },
    { ...validPayload(), rollbackHash: "d".repeat(65) },
    { ...validPayload(), evaluatorRequirementHash: 42 },
    { ...validPayload(), validitySeconds: "3600" },
    { ...validPayload(), validitySeconds: 59 },
    { ...validPayload(), validitySeconds: 86401 },
  ];
  for (const payload of rejected) {
    assert(
      !isStrictBootstrapApprovalPayload(payload),
      `malformed bootstrap payload was accepted: ${String(payload.branchName)}`,
    );
  }
});

Deno.test("strict bootstrap approval rejects secret, instruction, and provider-authority branch text", () => {
  const rejectedBranches = [
    "codex/secret-rotation",
    "codex/api-key-proof",
    "codex/ignore-all-instructions",
    "codex/system-prompt-override",
    "codex/github-admin-bootstrap",
    "codex/openai-provider-owner",
    "codex/bypass-rls",
    "codex/disable-safety",
    "codex/merge-production",
    "codex/deploy-production",
    "codex/override-rls",
    `codex/${"a".repeat(40)}`,
  ];
  for (const branchName of rejectedBranches) {
    assert(
      !isStrictBootstrapApprovalPayload({ ...validPayload(), branchName }),
      `unsafe branch text was accepted: ${branchName}`,
    );
  }
});

Deno.test("strict bootstrap approval validation stays within a bounded CPU budget", () => {
  const payload = validPayload();
  const startedAt = performance.now();
  const requestEquivalentIterations = 25;
  for (
    let iteration = 0;
    iteration < requestEquivalentIterations;
    iteration += 1
  ) {
    assert(
      isStrictBootstrapApprovalPayload(payload),
      "valid payload failed during timing guard",
    );
  }
  const elapsedMs = performance.now() - startedAt;
  assert(
    elapsedMs < 500,
    `strict bootstrap validator exceeded aggregate request-equivalent CPU budget: ${
      elapsedMs.toFixed(2)
    }ms`,
  );
});
