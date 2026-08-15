export const ENTITLEMENT_AUTHORITY_STATES = ["UNKNOWN", "INACTIVE", "ACTIVE", "GRACE", "EXPIRED", "REVOKED", "REFUNDED"] as const;

export type EntitlementAuthorityState = typeof ENTITLEMENT_AUTHORITY_STATES[number];
export type EntitlementSessionBinding = { userId: string; accountId: string; sessionGeneration: string; restoreOnly: boolean };
export type EntitlementAuthorityReason =
  | "authoritative_active" | "authoritative_grace" | "authoritative_inactive"
  | "authoritative_expired" | "authoritative_revoked" | "authoritative_refunded" | "signed_out"
  | "authority_unavailable" | "invalid_entitlement_key" | "query_failed" | "malformed_response" | "stale_generation" | "restore_only";
export type EntitlementAuthorityDecision = EntitlementSessionBinding & {
  entitlementKey: string; state: EntitlementAuthorityState; source: string | null; expiresAt: string | null;
  revokedAt: string | null; authoritativeAt: string | null; authoritative: boolean;
  grantsProtectedAccess: boolean; reason: EntitlementAuthorityReason;
};

const STATE_SET = new Set<string>(ENTITLEMENT_AUTHORITY_STATES); const KEY_PATTERN = /^[a-z0-9][a-z0-9_]{0,63}$/;
const text = (value: unknown) => String(value ?? "").trim();
const optionalText = (value: unknown) => text(value) || null;
const timestamp = (value: unknown) => { const normalized = optionalText(value); return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null; };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export const normalizeEntitlementAuthorityKey = (value: unknown) => { const normalized = text(value).toLowerCase(); return KEY_PATTERN.test(normalized) ? normalized : null; };
export const normalizeEntitlementAuthorityState = (value: unknown): EntitlementAuthorityState | null => { const normalized = text(value).toUpperCase(); return STATE_SET.has(normalized) ? normalized as EntitlementAuthorityState : null; };
export const normalizeEntitlementSessionBinding = (value: unknown): EntitlementSessionBinding | null => {
  if (!record(value)) return null;
  const userId = text(value.userId); const accountId = text(value.accountId); const sessionGeneration = text(value.sessionGeneration);
  return userId && accountId && sessionGeneration && typeof value.restoreOnly === "boolean"
    ? { userId, accountId, sessionGeneration, restoreOnly: value.restoreOnly }
    : null;
};
export const matchesEntitlementSessionGeneration = (expected?: EntitlementSessionBinding | null, actual?: EntitlementSessionBinding | null) => !!expected && !!actual
  && expected.userId === actual.userId && expected.accountId === actual.accountId
  && expected.sessionGeneration === actual.sessionGeneration && expected.restoreOnly === actual.restoreOnly;

export const createUnknownEntitlementDecision = (
  entitlementKey: unknown, reason: Exclude<EntitlementAuthorityReason, `authoritative_${string}`> = "authority_unavailable",
  binding?: EntitlementSessionBinding | null,
): EntitlementAuthorityDecision => ({
  userId: binding?.userId ?? "", accountId: binding?.accountId ?? "",
  sessionGeneration: binding?.sessionGeneration ?? "", restoreOnly: binding?.restoreOnly ?? false,
  entitlementKey: normalizeEntitlementAuthorityKey(entitlementKey) ?? "unknown",
  state: "UNKNOWN", source: null, expiresAt: null, revokedAt: null, authoritativeAt: null,
  authoritative: false, grantsProtectedAccess: false, reason,
});
export const createInactiveEntitlementDecision = (options: {
  entitlementKey: unknown; binding: EntitlementSessionBinding; authoritativeAt: string; source?: string | null;
}): EntitlementAuthorityDecision => {
  const entitlementKey = normalizeEntitlementAuthorityKey(options.entitlementKey);
  const binding = normalizeEntitlementSessionBinding(options.binding);
  const authoritativeAt = timestamp(options.authoritativeAt);
  if (!entitlementKey || !binding || !authoritativeAt) {
    return createUnknownEntitlementDecision(options.entitlementKey, "malformed_response", binding ?? options.binding);
  }
  if (binding.restoreOnly) return createUnknownEntitlementDecision(entitlementKey, "restore_only", binding);
  return { ...binding, entitlementKey, state: "INACTIVE", source: optionalText(options.source), expiresAt: null,
    revokedAt: null, authoritativeAt, authoritative: true, grantsProtectedAccess: false, reason: "authoritative_inactive" };
};
const stateReason = (state: Exclude<EntitlementAuthorityState, "UNKNOWN">): EntitlementAuthorityReason => ({ ACTIVE: "authoritative_active", GRACE: "authoritative_grace", INACTIVE: "authoritative_inactive", EXPIRED: "authoritative_expired", REVOKED: "authoritative_revoked", REFUNDED: "authoritative_refunded" } as const)[state];

export const normalizeEntitlementAuthorityReadback = (options: {
  entitlementKey: unknown; expectedBinding: EntitlementSessionBinding; readback: unknown;
}): EntitlementAuthorityDecision => {
  const key = normalizeEntitlementAuthorityKey(options.entitlementKey);
  if (!key) return createUnknownEntitlementDecision(options.entitlementKey, "invalid_entitlement_key", options.expectedBinding);
  if (options.expectedBinding.restoreOnly) return createUnknownEntitlementDecision(key, "restore_only", options.expectedBinding);
  if (!record(options.readback)) return createUnknownEntitlementDecision(key, "malformed_response", options.expectedBinding);
  const binding = normalizeEntitlementSessionBinding(options.readback);
  if (!binding || !matchesEntitlementSessionGeneration(options.expectedBinding, binding)) {
    return createUnknownEntitlementDecision(key, "stale_generation", options.expectedBinding);
  }
  const state = normalizeEntitlementAuthorityState(options.readback.state);
  const authoritativeAt = timestamp(options.readback.authoritativeAt);
  if (normalizeEntitlementAuthorityKey(options.readback.entitlementKey) !== key || !state || state === "UNKNOWN" || !authoritativeAt) {
    return createUnknownEntitlementDecision(key, "malformed_response", options.expectedBinding);
  }
  const rawExpiresAt = optionalText(options.readback.expiresAt);
  const rawRevokedAt = optionalText(options.readback.revokedAt);
  const expiresAt = timestamp(rawExpiresAt);
  const revokedAt = timestamp(rawRevokedAt);
  if ((rawExpiresAt && !expiresAt) || (rawRevokedAt && !revokedAt)) {
    return createUnknownEntitlementDecision(key, "malformed_response", options.expectedBinding);
  }
  const grantsProtectedAccess = state === "ACTIVE" || state === "GRACE";
  return { ...binding, entitlementKey: key, state, source: optionalText(options.readback.source), expiresAt,
    revokedAt, authoritativeAt, authoritative: true, grantsProtectedAccess, reason: stateReason(state) };
};
export const rejectStaleEntitlementDecision = (
  decision: EntitlementAuthorityDecision, currentBinding?: EntitlementSessionBinding | null,
) => matchesEntitlementSessionGeneration(decision, currentBinding)
  ? decision
  : createUnknownEntitlementDecision(decision.entitlementKey, "stale_generation", currentBinding);
export const entitlementGrantsProtectedAccess = (decision?: EntitlementAuthorityDecision | null) => (
  decision?.authoritative === true && decision.restoreOnly === false && decision.grantsProtectedAccess === true
  && (decision.state === "ACTIVE" || decision.state === "GRACE")
);
