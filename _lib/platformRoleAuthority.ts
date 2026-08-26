export type PlatformRoleAuthorityRow = Readonly<{
  expires_at?: unknown;
  expiresAt?: unknown;
  permissionKeys?: readonly string[] | null;
  status?: unknown;
  user_id?: unknown;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const text = (value: unknown) => String(value ?? "").trim();

export const normalizePlatformRoleSubjectId = (
  value: unknown,
): string | null => {
  const subjectId = text(value).toLowerCase();
  return UUID_PATTERN.test(subjectId) ? subjectId : null;
};

export const platformRoleStatusAndExpiryAreActive = (
  status: unknown,
  expiresAtValue: unknown,
  nowMs = Date.now(),
): boolean => {
  if (text(status).toLowerCase() !== "active") return false;
  const expiresAt = text(expiresAtValue);
  if (!expiresAt) return true;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
};

export const platformRoleAuthorityRowIsExactAndActive = (
  row: PlatformRoleAuthorityRow,
  expectedUserId: unknown,
  nowMs = Date.now(),
): boolean => {
  const subjectId = normalizePlatformRoleSubjectId(expectedUserId);
  if (
    !subjectId ||
    normalizePlatformRoleSubjectId(row.user_id) !== subjectId ||
    !platformRoleStatusAndExpiryAreActive(row.status, row.expires_at, nowMs)
  ) {
    return false;
  }
  return true;
};

export const selectExactActivePlatformRoleRows = <
  T extends PlatformRoleAuthorityRow,
>(
  value: readonly T[] | null | undefined,
  expectedUserId: unknown,
  nowMs = Date.now(),
): T[] =>
  (value ?? []).filter((row) =>
    platformRoleAuthorityRowIsExactAndActive(row, expectedUserId, nowMs)
  );

export const activePlatformRoleHasAnyPermission = (
  row: PlatformRoleAuthorityRow,
  requiredPermissionKeys: ReadonlySet<string>,
  nowMs = Date.now(),
): boolean => {
  if (
    !requiredPermissionKeys.size ||
    !platformRoleStatusAndExpiryAreActive(
      row.status,
      row.expiresAt ?? row.expires_at,
      nowMs,
    )
  ) {
    return false;
  }
  return (row.permissionKeys ?? []).some((key) =>
    requiredPermissionKeys.has(key)
  );
};
