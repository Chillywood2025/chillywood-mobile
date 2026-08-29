type JsonObject = Record<string, unknown>;

export type SupabaseAuthorityClientLike = {
  from: (relation: string) => any;
  rpc: (
    functionName: string,
    parameters?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type ExactCurrentSessionAuthority = Readonly<{
  sessionGeneration: string;
  userId: string;
}>;

export type ExactTargetStaffSubject = Readonly<{
  email: string;
  userId: string;
}>;

export const EXACT_SUBJECT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toText = (value: unknown) => String(value ?? "").trim();
const normalizeEmail = (value: unknown) => toText(value).toLowerCase();

export const normalizeExactSubjectId = (value: unknown): string | null => {
  const subjectId = toText(value).toLowerCase();
  return EXACT_SUBJECT_UUID_PATTERN.test(subjectId) ? subjectId : null;
};

const asRows = (value: unknown): JsonObject[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is JsonObject =>
      !!entry && typeof entry === "object" && !Array.isArray(entry)
    );
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? [value as JsonObject]
    : [];
};

const isUnexpired = (value: unknown, nowMs: number): boolean => {
  const expiresAt = toText(value);
  if (!expiresAt) return true;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
};

const hasExactActiveRole = (
  value: unknown,
  expectedUserId: unknown,
  role: string,
  nowMs = Date.now(),
): boolean => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  const normalizedRole = toText(role).toLowerCase();
  if (!subjectId || !normalizedRole) return false;
  return asRows(value).some((row) =>
    normalizeExactSubjectId(row.user_id) === subjectId &&
    toText(row.status).toLowerCase() === "active" &&
    toText(row.role).toLowerCase() === normalizedRole &&
    isUnexpired(row.expires_at, nowMs)
  );
};

export const resolveExactTargetStaffSubject = (
  membershipValue: unknown,
  authUserValue: unknown,
  expectedEmail: unknown,
  requiredRole = "operator",
  nowMs = Date.now(),
): ExactTargetStaffSubject | null => {
  const email = normalizeEmail(expectedEmail);
  const role = toText(requiredRole).toLowerCase();
  if (!email || !role) return null;

  const exactMembershipRows = asRows(membershipValue).filter((row) =>
    normalizeEmail(row.email) === email &&
    toText(row.status).toLowerCase() === "active" &&
    toText(row.role).toLowerCase() === role &&
    isUnexpired(row.expires_at, nowMs)
  );
  const subjectIds = Array.from(new Set(
    exactMembershipRows
      .map((row) => normalizeExactSubjectId(row.user_id))
      .filter((value): value is string => !!value),
  ));
  if (subjectIds.length !== 1) return null;

  const authContainer = authUserValue && typeof authUserValue === "object" &&
      !Array.isArray(authUserValue)
    ? authUserValue as JsonObject
    : null;
  const authUser = authContainer?.user && typeof authContainer.user === "object" &&
      !Array.isArray(authContainer.user)
    ? authContainer.user as JsonObject
    : authContainer;
  if (!authUser) return null;

  const subjectId = subjectIds[0];
  if (
    normalizeExactSubjectId(authUser.id) !== subjectId ||
    normalizeEmail(authUser.email) !== email ||
    !toText(authUser.email_confirmed_at) ||
    !!toText(authUser.deleted_at) ||
    authUser.is_anonymous === true
  ) {
    return null;
  }

  return Object.freeze({ email, userId: subjectId });
};

export const readExactTargetStaffSubject = async (
  adminClient: SupabaseAuthorityClientLike & {
    auth: {
      admin: {
        getUserById: (userId: string) => PromiseLike<{
          data: unknown;
          error: unknown;
        }>;
      };
    };
  },
  expectedEmail: unknown,
  requiredRole = "operator",
  nowMs = Date.now(),
): Promise<ExactTargetStaffSubject | null> => {
  const email = normalizeEmail(expectedEmail);
  const role = toText(requiredRole).toLowerCase();
  if (!email || !role) return null;

  const escapedEmailPattern = email.replace(/([\\%_])/g, "\\$1");
  const memberships = await adminClient
    .from("platform_role_memberships")
    .select("user_id,email,role,status,expires_at")
    .eq("status", "active")
    .eq("role", role)
    .ilike("email", escapedEmailPattern)
    .limit(50);
  if (memberships.error) {
    throw new Error(`Exact target staff lookup failed: ${toText(memberships.error.message)}`);
  }

  const candidateIds = Array.from(new Set(
    asRows(memberships.data)
      .filter((row) =>
        normalizeEmail(row.email) === email &&
        toText(row.status).toLowerCase() === "active" &&
        toText(row.role).toLowerCase() === role &&
        isUnexpired(row.expires_at, nowMs)
      )
      .map((row) => normalizeExactSubjectId(row.user_id))
      .filter((value): value is string => !!value),
  ));
  if (candidateIds.length !== 1) return null;

  try {
    const subject = await adminClient.auth.admin.getUserById(candidateIds[0]);
    if (subject.error) return null;
    return resolveExactTargetStaffSubject(
      memberships.data,
      subject.data,
      email,
      role,
      nowMs,
    );
  } catch {
    return null;
  }
};

export const parseExactCurrentSessionAuthority = (
  value: unknown,
  expectedUserId: unknown,
): ExactCurrentSessionAuthority | null => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  if (!subjectId || !value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const authority = value as JsonObject;
  const authorityUserId = normalizeExactSubjectId(authority.userId);
  const authorityAccountId = normalizeExactSubjectId(authority.accountId);
  const sessionGeneration = normalizeExactSubjectId(authority.sessionGeneration);
  if (
    authority.authoritative !== true ||
    toText(authority.state) !== "ACTIVE" ||
    authority.restoreOnly !== false ||
    authorityUserId !== subjectId ||
    authorityAccountId !== subjectId ||
    !sessionGeneration
  ) {
    return null;
  }

  return Object.freeze({ sessionGeneration, userId: subjectId });
};

export const readExactCurrentSessionAuthority = async (
  actorClient: Pick<SupabaseAuthorityClientLike, "rpc">,
  expectedUserId: unknown,
): Promise<ExactCurrentSessionAuthority | null> => {
  if (!normalizeExactSubjectId(expectedUserId)) return null;
  try {
    const result = await actorClient.rpc("wave1_session_authority_readback");
    if (result.error) return null;
    return parseExactCurrentSessionAuthority(result.data, expectedUserId);
  } catch {
    return null;
  }
};

export const resolveExactPlatformRole = (
  value: unknown,
  expectedUserId: unknown,
  allowedRoles: readonly string[],
  nowMs = Date.now(),
): string | null => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  const roles = allowedRoles.map((role) => toText(role).toLowerCase()).filter(Boolean);
  if (!subjectId || roles.length === 0) return null;

  const rows = asRows(value);
  for (const role of roles) {
    if (hasExactActiveRole(rows, subjectId, role, nowMs)) return role;
  }

  // Super Admin is owner-equivalent for permission-scoped operator work, but not
  // for true-owner-only boundaries. Mapping it to operator only when a caller
  // explicitly allows operator preserves first-owner/break-glass separation.
  if (!roles.includes("super_admin") && roles.includes("operator") &&
      hasExactActiveRole(rows, subjectId, "super_admin", nowMs)) {
    return "operator";
  }
  return null;
};

export const readExactPlatformRole = async (
  adminClient: Pick<SupabaseAuthorityClientLike, "from">,
  expectedUserId: unknown,
  allowedRoles: readonly string[],
  nowMs = Date.now(),
): Promise<string | null> => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  const roles = allowedRoles.map((role) => toText(role).toLowerCase()).filter(Boolean);
  if (!subjectId || roles.length === 0) return null;

  const queryRoles = Array.from(new Set([
    ...roles,
    ...(!roles.includes("super_admin") && roles.includes("operator") ? ["super_admin"] : []),
  ]));
  const result = await adminClient
    .from("platform_role_memberships")
    .select("user_id,role,status,expires_at")
    .eq("user_id", subjectId)
    .eq("status", "active")
    .in("role", queryRoles)
    .limit(50);
  if (result.error) throw new Error(`Exact platform role lookup failed: ${toText(result.error.message)}`);
  return resolveExactPlatformRole(result.data, subjectId, roles, nowMs);
};

export const resolveExactPermissionKeys = (
  value: unknown,
  expectedUserId: unknown,
  allowedPermissionKeys: readonly string[],
  nowMs = Date.now(),
): Set<string> => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  const allowed = new Set(
    allowedPermissionKeys.map((key) => toText(key).toLowerCase()).filter(Boolean),
  );
  if (!subjectId || allowed.size === 0) return new Set();

  return new Set(
    asRows(value)
      .filter((row) => {
        const permissionKey = toText(row.permission_key).toLowerCase();
        return normalizeExactSubjectId(row.target_user_id) === subjectId &&
          toText(row.status).toLowerCase() === "active" &&
          allowed.has(permissionKey) &&
          isUnexpired(row.expires_at, nowMs);
      })
      .map((row) => toText(row.permission_key).toLowerCase()),
  );
};

export const readExactPermissionKeys = async (
  adminClient: Pick<SupabaseAuthorityClientLike, "from">,
  expectedUserId: unknown,
  allowedPermissionKeys: readonly string[],
  nowMs = Date.now(),
): Promise<Set<string>> => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  const keys = Array.from(new Set(
    allowedPermissionKeys.map((key) => toText(key).toLowerCase()).filter(Boolean),
  ));
  if (!subjectId || keys.length === 0) return new Set();

  // Super Admin receives the same permission-scoped authority as Owner, while
  // true-owner-only call sites continue to require an exact owner role.
  const roleResult = await adminClient
    .from("platform_role_memberships")
    .select("user_id,role,status,expires_at")
    .eq("user_id", subjectId)
    .eq("status", "active")
    .eq("role", "super_admin")
    .limit(10);
  if (roleResult.error) throw new Error(`Exact Super Admin lookup failed: ${toText(roleResult.error.message)}`);
  if (hasExactActiveRole(roleResult.data, subjectId, "super_admin", nowMs)) {
    return new Set(keys);
  }

  const result = await adminClient
    .from("platform_staff_permission_grants")
    .select("target_user_id,permission_key,status,expires_at")
    .eq("target_user_id", subjectId)
    .eq("status", "active")
    .in("permission_key", keys)
    .limit(200);
  if (result.error) throw new Error(`Exact platform permission lookup failed: ${toText(result.error.message)}`);
  return resolveExactPermissionKeys(result.data, subjectId, keys, nowMs);
};

export const resolveExactBreakGlassSessionId = (
  value: unknown,
  expectedUserId: unknown,
  nowMs = Date.now(),
): string | null => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  if (!subjectId) return null;
  const row = asRows(value).find((entry) => {
    const expiresAtMs = Date.parse(toText(entry.expires_at));
    return normalizeExactSubjectId(entry.actor_user_id) === subjectId &&
      toText(entry.status).toLowerCase() === "active" &&
      Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
  return row ? normalizeExactSubjectId(row.id) : null;
};

export const readExactBreakGlassSessionId = async (
  adminClient: Pick<SupabaseAuthorityClientLike, "from">,
  expectedUserId: unknown,
  nowMs = Date.now(),
): Promise<string | null> => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  if (!subjectId) return null;
  const result = await adminClient
    .from("platform_break_glass_sessions")
    .select("id,actor_user_id,status,expires_at,activated_at")
    .eq("actor_user_id", subjectId)
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .limit(10);
  if (result.error) throw new Error(`Exact Break Glass lookup failed: ${toText(result.error.message)}`);
  return resolveExactBreakGlassSessionId(result.data, subjectId, nowMs);
};

export const resolveExactBetaAccess = (
  value: unknown,
  expectedUserId: unknown,
): boolean => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  return !!subjectId && asRows(value).some((row) =>
    normalizeExactSubjectId(row.user_id) === subjectId &&
    toText(row.access_status).toLowerCase() === "active"
  );
};

export const readExactBetaAccess = async (
  adminClient: Pick<SupabaseAuthorityClientLike, "from">,
  expectedUserId: unknown,
): Promise<boolean> => {
  const subjectId = normalizeExactSubjectId(expectedUserId);
  if (!subjectId) return false;
  const result = await adminClient
    .from("beta_access_memberships")
    .select("user_id,access_status")
    .eq("user_id", subjectId)
    .eq("access_status", "active")
    .limit(10);
  if (result.error) throw new Error(`Exact beta access lookup failed: ${toText(result.error.message)}`);
  return resolveExactBetaAccess(result.data, subjectId);
};
