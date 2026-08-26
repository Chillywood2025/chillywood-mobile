export const CANARY_PROOF_LABELS = [
  "admin",
  "granted-admin",
  "moderator",
  "target-moderator",
  "viewer",
] as const;

export type CanaryProofLabel = typeof CANARY_PROOF_LABELS[number];

export type CanaryProofScope = {
  emails: Record<CanaryProofLabel, string>;
  grantIds: string[];
  roleIds: number[];
  runId: string;
  userIds: string[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const exactUnique = <T extends number | string>(values: readonly T[]): T[] =>
  Array.from(new Set(values));

export const createCanaryProofScope = (
  runId: string = crypto.randomUUID(),
): CanaryProofScope => {
  const normalizedRunId = String(runId).trim().toLowerCase();
  if (!UUID_PATTERN.test(normalizedRunId)) {
    throw new Error("canary_proof_run_id_invalid");
  }
  return {
    emails: Object.fromEntries(CANARY_PROOF_LABELS.map((label) => [
      label,
      `liveops.proof+${label}.${normalizedRunId}@chillywoodstream.com`,
    ])) as Record<CanaryProofLabel, string>,
    grantIds: [],
    roleIds: [],
    runId: normalizedRunId,
    userIds: [],
  };
};

export const recordCanaryProofUser = (
  scope: CanaryProofScope,
  userId: string,
) => {
  scope.userIds = exactUnique([...scope.userIds, userId]);
};

export const recordCanaryProofRole = (
  scope: CanaryProofScope,
  roleId: number,
) => {
  scope.roleIds = exactUnique([...scope.roleIds, roleId]);
};

export const recordCanaryProofGrant = (
  scope: CanaryProofScope,
  grantId: string,
) => {
  scope.grantIds = exactUnique([...scope.grantIds, grantId]);
};

export const selectRecordedCanaryRows = <T extends { id?: unknown }>(
  rows: readonly T[],
  recordedIds: readonly (number | string)[],
): T[] => {
  const exactIds = new Set(recordedIds.map((id) => String(id)));
  return rows.filter((row) => exactIds.has(String(row.id ?? "")));
};
