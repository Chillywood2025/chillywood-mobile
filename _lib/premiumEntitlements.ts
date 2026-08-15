import {
  readCurrentAccountSessionAuthority,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import {
  createUnknownEntitlementDecision,
  entitlementGrantsProtectedAccess,
  normalizeEntitlementAuthorityReadback,
  type EntitlementAuthorityDecision,
  type EntitlementAuthorityReason,
  type EntitlementAuthorityState,
} from "./entitlementAuthority";
import { supabase } from "./supabase";

export const USER_ENTITLEMENTS_TABLE = "user_entitlements";
export const ENTITLEMENT_AUTHORITY_READBACK_RPC = "wave1_entitlement_authority_readback";
export type PremiumEntitlementKey = "premium" | "premium_watch_party" | "premium_live" | "paid_content";
export type PremiumEntitlementStatus =
  | "active"
  | "trialing"
  | "grace_period"
  | "pending"
  | "expired"
  | "canceled"
  | "revoked"
  | "unknown"
  | "inactive"
  | "refunded";

export type PremiumEntitlementRecord = {
  userId: string;
  entitlementKey: PremiumEntitlementKey;
  status: PremiumEntitlementStatus;
  source: string;
  startsAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
};
export type PremiumEntitlementDecision = EntitlementAuthorityDecision & {
  entitlementKey: PremiumEntitlementKey;
  isActive: boolean;
  status: PremiumEntitlementStatus;
};
export type PremiumEntitlementReadOptions = { authority?: AccountSessionAuthorityBinding | null };
type EntitlementAuthorityRpc = PromiseLike<{ data: unknown; error: { message?: string } | null }>;

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeEntitlementKey = (value: unknown): PremiumEntitlementKey | null => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "premium"
    || normalized === "premium_watch_party"
    || normalized === "premium_live"
    || normalized === "paid_content"
  ) {
    return normalized;
  }
  return null;
};

const isPremiumEntitlementKey = (value: PremiumEntitlementKey | null): value is PremiumEntitlementKey => !!value;
const statusOf = (state: EntitlementAuthorityState): PremiumEntitlementStatus => ({
  ACTIVE: "active", GRACE: "grace_period", EXPIRED: "expired", REVOKED: "revoked",
  REFUNDED: "refunded", INACTIVE: "inactive", UNKNOWN: "unknown",
})[state] as PremiumEntitlementStatus;
const premiumDecision = (
  key: PremiumEntitlementKey,
  decision: EntitlementAuthorityDecision,
): PremiumEntitlementDecision => ({
  ...decision, entitlementKey: key, isActive: entitlementGrantsProtectedAccess(decision), status: statusOf(decision.state),
});
const unknownDecision = (
  key: PremiumEntitlementKey,
  reason: Exclude<EntitlementAuthorityReason, `authoritative_${string}`>,
  authority?: AccountSessionAuthorityBinding | null,
) => premiumDecision(key, createUnknownEntitlementDecision(key, reason, authority));
const currentMatches = async (authority: AccountSessionAuthorityBinding) => (
  sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())
);
const readBound = async (key: PremiumEntitlementKey, authority: AccountSessionAuthorityBinding) => {
  try {
    const rpc = (supabase.rpc as unknown as (
      name: typeof ENTITLEMENT_AUTHORITY_READBACK_RPC,
      args: { p_entitlement_key: string },
    ) => EntitlementAuthorityRpc)(ENTITLEMENT_AUTHORITY_READBACK_RPC, { p_entitlement_key: key });
    const { data, error } = await rpc;
    return error
      ? unknownDecision(key, "query_failed", authority)
      : premiumDecision(key, normalizeEntitlementAuthorityReadback({ entitlementKey: key, expectedBinding: authority, readback: data }));
  } catch {
    return unknownDecision(key, "query_failed", authority);
  }
};

export async function readCurrentUserEntitlement(
  entitlementKey: PremiumEntitlementKey,
  options?: PremiumEntitlementReadOptions,
): Promise<PremiumEntitlementDecision> {
  const key = normalizeEntitlementKey(entitlementKey);
  if (!key) return unknownDecision("premium", "invalid_entitlement_key");
  return (await readCurrentUserEntitlements([key], options))[0]
    ?? unknownDecision(key, "authority_unavailable", options?.authority);
}

export async function readCurrentUserEntitlements(
  entitlementKeys: readonly PremiumEntitlementKey[],
  options?: PremiumEntitlementReadOptions,
): Promise<PremiumEntitlementDecision[]> {
  const keys = Array.from(new Set(entitlementKeys.map(normalizeEntitlementKey).filter(isPremiumEntitlementKey)));
  if (!keys.length) return [];
  const authority = options?.authority ?? await readCurrentAccountSessionAuthority();
  if (!authority) return keys.map((key) => unknownDecision(key, "authority_unavailable"));
  if (authority.restoreOnly) return keys.map((key) => unknownDecision(key, "restore_only", authority));
  if (options?.authority && !await currentMatches(authority)) {
    return keys.map((key) => unknownDecision(key, "stale_generation", authority));
  }
  const decisions = await Promise.all(keys.map((key) => readBound(key, authority)));
  return await currentMatches(authority)
    ? decisions
    : keys.map((key) => unknownDecision(key, "stale_generation", authority));
}

export function hasActiveEntitlement(decisions: readonly PremiumEntitlementDecision[]) {
  return decisions.some(entitlementGrantsProtectedAccess);
}
