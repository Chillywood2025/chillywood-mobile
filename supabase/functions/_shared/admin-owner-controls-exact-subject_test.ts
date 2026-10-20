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

Deno.test("Owner grant handlers use one actor RPC without an automatic expiry write", () => {
  const revoke = sliceBetween("const revokeOwnerSecurityGrants", "type CanaryStatus");
  assertExcludes(source, "expireStaleGrants", "unrelated actions cannot depend on a stale-grant UPDATE");
  assertIncludes(revoke, 'actorClient.rpc("owner_security_revoke_grants"', "caller-authenticated transaction");
  assertIncludes(revoke, "requireTrustedCurrentOwnerDevice", "current device authority");
  assertIncludes(revoke, "bindOwnerSecurityMutationContext", "exact caller context binding");
  assertIncludes(revoke, "p_request_id: requestId", "idempotent operation identity");
  assertIncludes(revoke, "p_grant_id: grantId", "exact single grant identity");
  assertIncludes(revoke, "row.requestId === requestId", "receipt matches operation");
  assertIncludes(revoke, "row.grantIds[0] === grantId", "single result matches requested grant");
  assertExcludes(revoke, '.from("platform_staff_permission_grants")', "no service-role grant writes");
  assertExcludes(revoke, '.from("platform_staff_permission_audit")', "no separate post-mutation audit request");
});

Deno.test("canary proof authority is run-scoped and cleanup cannot sweep collisions", async () => {
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
  assertIncludes(proofHelpers, "app_metadata:", "server-owned proof identity metadata");
  assertIncludes(proofHelpers, "id: userId", "manifest-preallocated Auth identity");
  assertIncludes(proofHelpers, 'adminClient.rpc("register_admin_canary_user"', "server registration of exact Auth identity");
  assertIncludes(proofHelpers, 'actorClient.rpc("provision_admin_canary_fixture"', "actor-authenticated fixed fixture transaction");
  assertExcludes(proofHelpers, '.from("platform_role_memberships")', "no direct service role mutation");
  assertExcludes(proofHelpers, '.from("platform_staff_permission_grants")', "no direct service grant mutation");
  const cleanup = sliceBetween("const cleanupProofAccess", "const provisionProofFixture");
  assertIncludes(cleanup, 'adminClient.rpc("cleanup_admin_canary_run"', "durable exact cleanup transaction");
  assertIncludes(cleanup, 'row.status === "closed" && row.activeCount === 0', "verified committed cleanup receipt");
  assertIncludes(cleanup, "entry.userId === planned.userId && entry.email === planned.email", "cleanup Auth identities match the original manifest");
  assertIncludes(cleanup, "let activeCount: number | null = null", "unknown cleanup is not zero");
  assertIncludes(cleanup, "deleteUser(userId)", "exact receipt-authorized Auth deletion");
  if (cleanup.indexOf("deleteUser(userId)") < cleanup.indexOf("requireMutationReceipt")) {
    throw new Error("Auth deletion must follow verified authority cleanup");
  }
  assertIncludes(canaryRun, 'actorClient.rpc("begin_admin_canary_run"', "persist manifest before external Auth creation");
  assertIncludes(canaryRun, "const proofScope = readCanaryProofScope(begun.data, runId)", "database-planned run scope");
  assertIncludes(canaryRun, 'status: cleanup.ok ? "pass" : "fail"', "cleanup failures cannot pass canary");

  const migration = await Deno.readTextFile(new URL(
    "../../migrations/20261020151834_transactional_owner_security_canary.sql", import.meta.url,
  ));
  const cleanupSql = migration.slice(migration.indexOf("create function public.cleanup_admin_canary_run"));
  assertIncludes(cleanupSql, "private.admin_canary_fixture_roles where run_id=p_run_id", "database role scope is this manifest");
  assertIncludes(cleanupSql, "where id=item.role_id for update", "exact recorded role lock");
  assertIncludes(cleanupSql, "where id=m.id", "exact recorded role update");
  assertIncludes(cleanupSql, "private.admin_canary_fixture_grants where run_id=p_run_id", "database grant scope is this manifest");
  assertIncludes(cleanupSql, "where id=item.grant_id for update", "exact recorded grant lock");
  assertIncludes(cleanupSql, "where id=g.id", "exact recorded grant update");
});
