import {
  createCanaryProofScope,
  recordCanaryProofGrant,
  recordCanaryProofRole,
  recordCanaryProofUser,
  selectRecordedCanaryRows,
} from "./canary-proof-scope.ts";

const RUN_A = "95000000-0000-4000-8000-000000000001";
const RUN_B = "95000000-0000-4000-8000-000000000002";

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
};

Deno.test("canary proof identities are unique to a run and cannot collide with prior proof users", () => {
  const first = createCanaryProofScope(RUN_A);
  const second = createCanaryProofScope(RUN_B);
  assertEquals(
    Object.values(first.emails).some((email) =>
      Object.values(second.emails).includes(email)
    ),
    false,
    "run-specific emails",
  );
  assertEquals(
    first.emails.admin.includes(RUN_A),
    true,
    "run id carried in exact proof email",
  );
});

Deno.test("canary cleanup selection preserves prefix collisions and non-canary rows", () => {
  const scope = createCanaryProofScope(RUN_A);
  recordCanaryProofUser(scope, "95000000-0000-4000-8000-000000000011");
  recordCanaryProofRole(scope, 41);
  recordCanaryProofRole(scope, 41);
  recordCanaryProofGrant(scope, "95000000-0000-4000-8000-000000000021");
  const rows = [
    { email: scope.emails.admin, id: 41 },
    { email: "liveops.proof+historical@chillywoodstream.com", id: 42 },
    { email: "real.staff@chillywoodstream.com", id: 43 },
  ];
  assertEquals(
    selectRecordedCanaryRows(rows, scope.roleIds).map((row) => row.id),
    [41],
    "only exact recorded role",
  );
  assertEquals(scope.roleIds, [41], "recorded ids are deduplicated");
  assertEquals(
    scope.userIds,
    ["95000000-0000-4000-8000-000000000011"],
    "exact created user recorded",
  );
  assertEquals(
    scope.grantIds,
    ["95000000-0000-4000-8000-000000000021"],
    "exact created grant recorded",
  );
});

Deno.test("malformed canary run identity fails closed", () => {
  let rejected = false;
  try {
    createCanaryProofScope("fixed-or-malformed");
  } catch {
    rejected = true;
  }
  assertEquals(rejected, true, "malformed run id rejected");
});
