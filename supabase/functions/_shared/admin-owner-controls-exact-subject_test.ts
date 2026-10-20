const source = await Deno.readTextFile(
  new URL("../admin-owner-controls/index.ts", import.meta.url),
);

const sliceBetween = (start: string, end: string) => {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  if (startAt < 0 || endAt < 0) {
    throw new Error(`source_slice_missing:${start}:${end}`);
  }
  return source.slice(startAt, endAt);
};

const assertIncludes = (value: string, expected: string, label: string) => {
  if (!value.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
};

const assertExcludes = (value: string, forbidden: string, label: string) => {
  if (value.includes(forbidden)) {
    throw new Error(`${label}: contains ${forbidden}`);
  }
};

Deno.test("permission templates resolve one exact subject and mutate through one actor RPC", async () => {
  const templateMutation = sliceBetween(
    "const templateApply",
    "const breakGlassStatus",
  );
  assertIncludes(
    templateMutation,
    'readPermissionTemplateTarget(adminClient, targetEmail, templateKey)',
    "confirmed subject resolver",
  );
  assertIncludes(
    templateMutation,
    'mutatePermissionTemplate(actorClient, {',
    "actor-authenticated transactional mutation",
  );
  assertIncludes(
    templateMutation,
    "targetUserId: target.userId",
    "exact target insert/readback",
  );
  assertExcludes(
    templateMutation,
    '.eq("target_email", targetEmail)',
    "email-derived target mutation",
  );
  assertExcludes(
    templateMutation,
    '.ilike("target_email"',
    "case-insensitive email-derived target mutation",
  );
  assertExcludes(templateMutation, '.from("platform_staff_permission_grants")', "no service-role partial permission writes");
  const helper = await Deno.readTextFile(new URL("./staff-permission-templates.ts", import.meta.url));
  assertIncludes(helper, 'readExactTargetStaffSubject(adminClient, email, role)', "canonical confirmed subject reader");
  assertIncludes(helper, 'p_target_user_id: input.targetUserId', "RPC binds immutable subject");
  assertIncludes(helper, '"admin_mutate_staff_permission_template"', "single transactional RPC");
});

Deno.test("First Owner succession membership ids are selected by exact subjects", () => {
  const succession = sliceBetween(
    "const firstOwnerStartStepDown",
    "const firstOwnerCompleteStepDown",
  );
  assertIncludes(
    succession,
    'readExactTargetStaffSubject(\n    adminClient,\n    successorEmail,\n    "owner"',
    "exact confirmed successor",
  );
  assertIncludes(
    succession,
    "toText(row.user_id) === user.id",
    "exact actor owner membership",
  );
  assertIncludes(
    succession,
    "toText(row.user_id) === successorSubject.userId",
    "exact successor owner membership",
  );
  assertExcludes(
    succession,
    "normalizeEmail(row.email)",
    "email-derived succession membership",
  );
});

Deno.test("canary proof authority is run-scoped and cleanup cannot sweep collisions", () => {
  const proofHelpers = sliceBetween(
    "const randomProofPassword",
    "const countOwnerNormalAuditRows",
  );
  const canaryRun = sliceBetween("const canaryRun", "const canaryList");
  for (const value of [proofHelpers, canaryRun]) {
    assertExcludes(value, "PROOF_EMAILS", "fixed proof identities");
    assertExcludes(value, "listAuthUserByEmail", "proof account reuse");
    assertExcludes(
      value,
      "updateUserById",
      "proof password reset or metadata takeover",
    );
    assertExcludes(
      value,
      'ilike("email", "liveops.proof+%")',
      "wildcard role cleanup",
    );
    assertExcludes(
      value,
      'ilike("target_email", "liveops.proof+%")',
      "wildcard grant cleanup",
    );
  }
  assertIncludes(
    proofHelpers,
    "canary_proof_run_id: scope.runId",
    "run metadata",
  );
  assertIncludes(
    proofHelpers,
    '.in("id", exactRoleIds)',
    "exact role cleanup ids",
  );
  assertIncludes(
    proofHelpers,
    '.in("id", exactGrantIds)',
    "exact grant cleanup ids",
  );
  assertIncludes(
    proofHelpers,
    "deleteUser(userId)",
    "exact created auth-user cleanup",
  );
  assertIncludes(
    canaryRun,
    "const proofScope = createCanaryProofScope()",
    "run-specific scope",
  );
});
