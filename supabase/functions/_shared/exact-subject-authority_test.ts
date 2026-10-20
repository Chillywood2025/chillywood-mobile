import {
  normalizeExactSubjectId,
  parseExactCurrentSessionAuthority,
  readExactCurrentSessionAuthority,
  readExactPermissionKeys,
  readExactPlatformRole,
  resolveExactBetaAccess,
  resolveExactBreakGlassSessionId,
  resolveExactPermissionKeys,
  resolveExactPlatformRole,
  resolveExactTargetStaffSubject,
} from "./exact-subject-authority.ts";

const EXACT_USER = "94000000-0000-4000-8000-000000000001";
const WRONG_USER = "94000000-0000-4000-8000-000000000002";
const SESSION_ID = "95000000-0000-4000-8000-000000000001";
const NOW = Date.parse("2026-08-25T12:00:00.000Z");

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  const actualValue = actual instanceof Set ? [...actual].sort() : actual;
  const expectedValue = expected instanceof Set ? [...expected].sort() : expected;
  if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
    throw new Error(`${label}: expected ${JSON.stringify(expectedValue)}, received ${JSON.stringify(actualValue)}`);
  }
};

Deno.test("exact live-session authority accepts only the immutable current subject", () => {
  assertEquals(parseExactCurrentSessionAuthority({
    accountId: EXACT_USER,
    authoritative: true,
    restoreOnly: false,
    sessionGeneration: SESSION_ID,
    state: "ACTIVE",
    userId: EXACT_USER,
  }, EXACT_USER), { sessionGeneration: SESSION_ID, userId: EXACT_USER }, "exact session");

  for (const [label, authority, expectedUserId] of [
    ["wrong user id", { accountId: WRONG_USER, authoritative: true, restoreOnly: false, sessionGeneration: SESSION_ID, state: "ACTIVE", userId: WRONG_USER }, EXACT_USER],
    ["restore-only", { accountId: EXACT_USER, authoritative: true, restoreOnly: true, sessionGeneration: SESSION_ID, state: "ACTIVE", userId: EXACT_USER }, EXACT_USER],
    ["terminated", { accountId: EXACT_USER, authoritative: true, restoreOnly: false, sessionGeneration: SESSION_ID, state: "TERMINATED", userId: EXACT_USER }, EXACT_USER],
    ["missing session", { accountId: EXACT_USER, authoritative: true, restoreOnly: false, state: "ACTIVE", userId: EXACT_USER }, EXACT_USER],
    ["missing user", { accountId: EXACT_USER, authoritative: true, restoreOnly: false, sessionGeneration: SESSION_ID, state: "ACTIVE" }, EXACT_USER],
    ["malformed expected id", { accountId: EXACT_USER, authoritative: true, restoreOnly: false, sessionGeneration: SESSION_ID, state: "ACTIVE", userId: EXACT_USER }, "not-a-uuid"],
  ] as const) {
    assertEquals(parseExactCurrentSessionAuthority(authority, expectedUserId), null, label);
  }
  assertEquals(normalizeExactSubjectId(null), null, "missing user id");
});

Deno.test("shared Edge session reader fails closed before privileged mutation", async () => {
  const read = async (data: unknown, error: unknown = null) => {
    let privilegedMutationCalls = 0;
    const authority = await readExactCurrentSessionAuthority({
      rpc: async (functionName: string) => {
        assertEquals(
          functionName,
          "wave1_session_authority_readback",
          "shared root RPC",
        );
        return { data, error };
      },
    }, EXACT_USER);
    if (authority) privilegedMutationCalls += 1;
    return { authority, privilegedMutationCalls };
  };

  const active = await read({
    accountId: EXACT_USER,
    authoritative: true,
    restoreOnly: false,
    sessionGeneration: SESSION_ID,
    state: "ACTIVE",
    userId: EXACT_USER,
  });
  assertEquals(
    active,
    {
      authority: { sessionGeneration: SESSION_ID, userId: EXACT_USER },
      privilegedMutationCalls: 1,
    },
    "valid shared authority may continue",
  );

  for (const [label, data, error] of [
    ["expired retained session", {
      accountId: EXACT_USER,
      authoritative: true,
      restoreOnly: false,
      sessionGeneration: SESSION_ID,
      state: "TERMINATED",
      userId: EXACT_USER,
    }, null],
    ["malformed readback", {
      authoritative: true,
      state: "ACTIVE",
    }, null],
    ["readback error", null, { message: "rpc unavailable" }],
  ] as const) {
    assertEquals(
      await read(data, error),
      { authority: null, privilegedMutationCalls: 0 },
      `${label} stops before privileged mutation`,
    );
  }
});

Deno.test("recycled email and email-only rows cannot grant platform role or permission", () => {
  const roleRows = [
    { email: "recycled@example.test", expires_at: null, role: "owner", status: "active", user_id: WRONG_USER },
    { email: "recycled@example.test", expires_at: null, role: "operator", status: "active", user_id: null },
  ];
  const permissionRows = [
    { expires_at: null, permission_key: "security_review", status: "active", target_email: "recycled@example.test", target_user_id: WRONG_USER },
    { expires_at: null, permission_key: "audit_review", status: "active", target_email: "recycled@example.test", target_user_id: null },
  ];
  assertEquals(resolveExactPlatformRole(roleRows, EXACT_USER, ["owner", "operator"], NOW), null, "recycled role");
  assertEquals(resolveExactPermissionKeys(permissionRows, EXACT_USER, ["security_review", "audit_review"], NOW), new Set(), "recycled permission");
});

Deno.test("Super Admin is accepted only when requested and never substitutes for operator", () => {
  const superAdmin = { role: "super_admin", status: "active", user_id: EXACT_USER, expires_at: null };
  const operator = { role: "operator", status: "active", user_id: EXACT_USER, expires_at: null };
  assertEquals(resolveExactPlatformRole([superAdmin], EXACT_USER, ["owner", "operator"], NOW), null, "Super Admin-only caller");
  assertEquals(resolveExactPlatformRole([superAdmin], EXACT_USER, ["owner", "super_admin", "operator"], NOW), "super_admin", "explicitly supported Super Admin");
  assertEquals(resolveExactPlatformRole([superAdmin, operator], EXACT_USER, ["owner", "operator"], NOW), "operator", "real additional operator membership");
  for (const [label, invalidOperator] of [
    ["wrong subject", { ...operator, user_id: WRONG_USER }],
    ["email-only", { ...operator, user_id: null, email: "audit@example.test" }],
    ["revoked", { ...operator, status: "revoked" }],
    ["expired at boundary", { ...operator, expires_at: new Date(NOW).toISOString() }],
    ["malformed expiry", { ...operator, expires_at: "invalid" }],
  ] as const) {
    assertEquals(resolveExactPlatformRole([superAdmin, invalidOperator], EXACT_USER, ["operator"], NOW), null, label);
  }
});

Deno.test("scoped legal and Live Ops permissions require their own exact active grants", () => {
  const grant = { permission_key: "legal_hold", status: "active", target_user_id: EXACT_USER, expires_at: null };
  const requested = ["legal_hold", "legal_ops", "evidence_export", "live_ops"];
  assertEquals(resolveExactPermissionKeys([grant], EXACT_USER, requested, NOW), new Set(["legal_hold"]), "one grant does not expand to every requested scope");
  for (const [label, invalidGrant] of [
    ["wrong subject", { ...grant, target_user_id: WRONG_USER }],
    ["email-only", { ...grant, target_user_id: null, target_email: "audit@example.test" }],
    ["revoked", { ...grant, status: "revoked" }],
    ["expired at boundary", { ...grant, expires_at: new Date(NOW).toISOString() }],
    ["malformed expiry", { ...grant, expires_at: "invalid" }],
    ["different permission", { ...grant, permission_key: "audit_review" }],
  ] as const) {
    assertEquals(resolveExactPermissionKeys([invalidGrant], EXACT_USER, requested, NOW), new Set(), label);
  }
});

// Query-construction unit contract only; the real-client PostgreSQL suite owns
// session, RLS and persisted-grant authority proof.
Deno.test("shared readers request exact roles and grants without role-derived permission shortcuts", async () => {
  const calls: unknown[] = [];
  let rows: unknown = [{ role: "super_admin", status: "active", user_id: EXACT_USER, expires_at: null }];
  const client = {
    from(relation: string) {
      calls.push(["from", relation]);
      return {
        select(columns: string) { calls.push(["select", columns]); return this; },
        eq(column: string, value: unknown) { calls.push(["eq", column, value]); return this; },
        in(column: string, values: string[]) { calls.push(["in", column, values]); return this; },
        async limit(value: number) { calls.push(["limit", value]); return { data: rows, error: null }; },
      };
    },
  };
  assertEquals(await readExactPlatformRole(client, EXACT_USER, ["owner", "operator"], NOW), null, "reader cannot alias returned Super Admin");
  assertEquals(calls.find((call) => Array.isArray(call) && call[0] === "in"), ["in", "role", ["owner", "operator"]], "query does not silently add roles");
  calls.length = 0;
  rows = [{ permission_key: "legal_hold", status: "active", target_user_id: EXACT_USER, expires_at: null }];
  assertEquals(await readExactPermissionKeys(client, EXACT_USER, ["legal_hold", "legal_ops", "live_ops"], NOW), new Set(["legal_hold"]), "reader returns only persisted grant rows");
  assertEquals(calls.filter((call) => Array.isArray(call) && call[0] === "from"), [["from", "platform_staff_permission_grants"]], "permission reader never turns membership into grants");
  assertEquals(calls.filter((call) => Array.isArray(call) && call[0] === "eq"), [["eq", "target_user_id", EXACT_USER], ["eq", "status", "active"]], "grant lookup is bound to exact active subject");
});

Deno.test("email-only and wrong-subject Break Glass rows cannot bind the caller", () => {
  const rows = [
    { actor_email: "recycled@example.test", actor_user_id: WRONG_USER, expires_at: "2026-08-25T13:00:00.000Z", id: "96000000-0000-4000-8000-000000000001", status: "active" },
    { actor_email: "recycled@example.test", actor_user_id: null, expires_at: "2026-08-25T13:00:00.000Z", id: "96000000-0000-4000-8000-000000000002", status: "active" },
  ];
  assertEquals(resolveExactBreakGlassSessionId(rows, EXACT_USER, NOW), null, "recycled Break Glass");
});

Deno.test("exact-subject role, permission, Break Glass, and beta rows remain functional", () => {
  assertEquals(resolveExactPlatformRole([
    { email: "audit@example.test", expires_at: "2026-08-25T13:00:00.000Z", role: "owner", status: "active", user_id: EXACT_USER },
  ], EXACT_USER, ["owner", "operator"], NOW), "owner", "exact role");
  assertEquals(resolveExactPermissionKeys([
    { expires_at: "2026-08-25T13:00:00.000Z", permission_key: "security_review", status: "active", target_email: "audit@example.test", target_user_id: EXACT_USER },
  ], EXACT_USER, ["security_review"], NOW), new Set(["security_review"]), "exact permission");
  assertEquals(resolveExactBreakGlassSessionId([
    { actor_email: "audit@example.test", actor_user_id: EXACT_USER, expires_at: "2026-08-25T13:00:00.000Z", id: "96000000-0000-4000-8000-000000000001", status: "active" },
  ], EXACT_USER, NOW), "96000000-0000-4000-8000-000000000001", "exact Break Glass");
  assertEquals(resolveExactBetaAccess([
    { access_status: "active", email: "audit@example.test", user_id: EXACT_USER },
  ], EXACT_USER), true, "exact beta access");
});

Deno.test("expired or malformed exact-subject rows fail closed", () => {
  assertEquals(resolveExactPlatformRole([
    { expires_at: "2026-08-25T11:59:59.000Z", role: "owner", status: "active", user_id: EXACT_USER },
  ], EXACT_USER, ["owner"], NOW), null, "expired role");
  assertEquals(resolveExactPermissionKeys([
    { expires_at: "malformed", permission_key: "security_review", status: "active", target_user_id: EXACT_USER },
  ], EXACT_USER, ["security_review"], NOW), new Set(), "malformed permission expiry");
  assertEquals(resolveExactBreakGlassSessionId([
    { actor_user_id: EXACT_USER, expires_at: "2026-08-25T11:59:59.000Z", id: "96000000-0000-4000-8000-000000000001", status: "active" },
  ], EXACT_USER, NOW), null, "expired Break Glass");
  assertEquals(resolveExactBreakGlassSessionId([
    { actor_user_id: EXACT_USER, expires_at: null, id: "96000000-0000-4000-8000-000000000001", status: "active" },
  ], EXACT_USER, NOW), null, "unbounded Break Glass");
  assertEquals(resolveExactBetaAccess([
    { access_status: "active", user_id: EXACT_USER },
  ], "missing"), false, "malformed beta subject");
});

Deno.test("permission-template targets resolve only the current confirmed immutable subject", () => {
  const exactMembership = [{
    email: "operator@example.test",
    expires_at: "2026-08-25T13:00:00.000Z",
    role: "operator",
    status: "active",
    user_id: EXACT_USER,
  }];
  const exactAuthUser = {
    user: {
      deleted_at: null,
      email: "operator@example.test",
      email_confirmed_at: "2026-08-24T12:00:00.000Z",
      id: EXACT_USER,
      is_anonymous: false,
    },
  };
  assertEquals(
    resolveExactTargetStaffSubject(
      exactMembership,
      exactAuthUser,
      "OPERATOR@example.test",
      "operator",
      NOW,
    ),
    { email: "operator@example.test", userId: EXACT_USER },
    "exact target",
  );

  assertEquals(resolveExactTargetStaffSubject(
    [{ ...exactMembership[0], email: "recycled@example.test" }],
    { user: { ...exactAuthUser.user, email: "former-address@example.test" } },
    "recycled@example.test",
    "operator",
    NOW,
  ), null, "recycled email cannot reactivate the historical subject");
  assertEquals(resolveExactTargetStaffSubject(
    [{ ...exactMembership[0], user_id: null }],
    exactAuthUser,
    "operator@example.test",
    "operator",
    NOW,
  ), null, "email-only role cannot identify a target");
  assertEquals(resolveExactTargetStaffSubject(
    exactMembership,
    { user: { ...exactAuthUser.user, id: WRONG_USER } },
    "operator@example.test",
    "operator",
    NOW,
  ), null, "wrong auth user id cannot identify the target");
  assertEquals(resolveExactTargetStaffSubject(
    exactMembership,
    { user: { ...exactAuthUser.user, email_confirmed_at: null } },
    "operator@example.test",
    "operator",
    NOW,
  ), null, "unconfirmed target fails closed");
  assertEquals(resolveExactTargetStaffSubject(
    [{ ...exactMembership[0], expires_at: "2026-08-25T11:59:59.000Z" }],
    exactAuthUser,
    "operator@example.test",
    "operator",
    NOW,
  ), null, "expired target role fails closed");
});
