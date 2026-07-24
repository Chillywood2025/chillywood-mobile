import { bootstrapTargetHash } from "./index.ts";

const assertEquals = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
};

Deno.test("bootstrap target hash binds the complete canonical approval tuple", async () => {
  const targetHash = await bootstrapTargetHash({
    repositoryFullName: "Chillywood2025/chillywood-mobile",
    branchName: "codex/cognitive-live-activation-finalize",
    sourceCommit: "a".repeat(40),
    retentionPolicyHash: "b".repeat(64),
    constitutionHash: "c".repeat(64),
    rollbackHash: "d".repeat(64),
    evaluatorRequirementHash: "e".repeat(64),
    policyVersion: "collective-governance-v1",
  });
  assertEquals(
    targetHash,
    "aa86f48627c8535f2d25eec672e32282e80fd3a7e66822c67b3f1f9dac4dd2ba",
    "canonical bootstrap target hash",
  );
});

Deno.test("bootstrap target hash changes for every authority-bearing field", async () => {
  const payload = {
    repositoryFullName: "Chillywood2025/chillywood-mobile",
    branchName: "codex/cognitive-live-activation-finalize",
    sourceCommit: "a".repeat(40),
    retentionPolicyHash: "b".repeat(64),
    constitutionHash: "c".repeat(64),
    rollbackHash: "d".repeat(64),
    evaluatorRequirementHash: "e".repeat(64),
    policyVersion: "collective-governance-v1",
  };
  const baseline = await bootstrapTargetHash(payload);
  const changes: Record<string, unknown>[] = [
    { repositoryFullName: "Chillywood2025/other" },
    { branchName: "codex/other" },
    { sourceCommit: "f".repeat(40) },
    { retentionPolicyHash: "f".repeat(64) },
    { constitutionHash: "f".repeat(64) },
    { rollbackHash: "f".repeat(64) },
    { evaluatorRequirementHash: "f".repeat(64) },
    { policyVersion: "collective-governance-v2" },
  ];
  for (const change of changes) {
    const changed = await bootstrapTargetHash({ ...payload, ...change });
    if (changed === baseline) {
      throw new Error(
        `bootstrap target hash did not bind ${Object.keys(change)[0]}`,
      );
    }
  }
});
