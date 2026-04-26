import type { Tables } from "../supabase/database.types";
import { supabase } from "./supabase";

export const USER_ENTITLEMENTS_TABLE = "user_entitlements";

export type PremiumEntitlementKey = "premium" | "premium_watch_party" | "premium_live" | "paid_content";
export type PremiumEntitlementStatus =
  | "active"
  | "trialing"
  | "grace_period"
  | "pending"
  | "expired"
  | "canceled"
  | "revoked";

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

export type PremiumEntitlementDecision = {
  entitlementKey: PremiumEntitlementKey;
  isActive: boolean;
  status: PremiumEntitlementStatus | "missing" | "signed_out" | "unavailable";
  source: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  reason: "active" | "signed_out" | "missing" | "expired" | "revoked" | "inactive" | "unavailable";
};

type UserEntitlementRow = Tables<"user_entitlements">;

const ACTIVE_ENTITLEMENT_STATUSES = new Set<PremiumEntitlementStatus>(["active", "trialing", "grace_period"]);

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

const normalizeEntitlementStatus = (value: unknown): PremiumEntitlementStatus => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "active"
    || normalized === "trialing"
    || normalized === "grace_period"
    || normalized === "expired"
    || normalized === "canceled"
    || normalized === "revoked"
  ) {
    return normalized;
  }
  return "pending";
};

const hasPassed = (value: string | null) => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
};

const toDecision = (
  entitlementKey: PremiumEntitlementKey,
  row: UserEntitlementRow | null,
): PremiumEntitlementDecision => {
  if (!row) {
    return {
      entitlementKey,
      isActive: false,
      status: "missing",
      source: null,
      expiresAt: null,
      revokedAt: null,
      reason: "missing",
    };
  }

  const status = normalizeEntitlementStatus(row.status);
  const expiresAt = normalizeText(row.expires_at) || null;
  const revokedAt = normalizeText(row.revoked_at) || null;

  if (revokedAt || status === "revoked") {
    return {
      entitlementKey,
      isActive: false,
      status,
      source: normalizeText(row.source) || null,
      expiresAt,
      revokedAt,
      reason: "revoked",
    };
  }

  if (hasPassed(expiresAt) || status === "expired" || status === "canceled") {
    return {
      entitlementKey,
      isActive: false,
      status,
      source: normalizeText(row.source) || null,
      expiresAt,
      revokedAt,
      reason: "expired",
    };
  }

  if (!ACTIVE_ENTITLEMENT_STATUSES.has(status)) {
    return {
      entitlementKey,
      isActive: false,
      status,
      source: normalizeText(row.source) || null,
      expiresAt,
      revokedAt,
      reason: "inactive",
    };
  }

  return {
    entitlementKey,
    isActive: true,
    status,
    source: normalizeText(row.source) || null,
    expiresAt,
    revokedAt,
    reason: "active",
  };
};

const unavailableDecision = (
  entitlementKey: PremiumEntitlementKey,
  reason: PremiumEntitlementDecision["reason"] = "unavailable",
): PremiumEntitlementDecision => ({
  entitlementKey,
  isActive: false,
  status: reason === "signed_out" ? "signed_out" : "unavailable",
  source: null,
  expiresAt: null,
  revokedAt: null,
  reason,
});

export async function readCurrentUserEntitlement(
  entitlementKey: PremiumEntitlementKey,
): Promise<PremiumEntitlementDecision> {
  const normalizedKey = normalizeEntitlementKey(entitlementKey);
  if (!normalizedKey) return unavailableDecision("premium");

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = normalizeText(sessionData.session?.user?.id);
  if (!userId) return unavailableDecision(normalizedKey, "signed_out");

  try {
    const { data, error } = await supabase
      .from(USER_ENTITLEMENTS_TABLE)
      .select("user_id,entitlement_key,status,source,starts_at,expires_at,revoked_at,updated_at,metadata")
      .eq("user_id", userId)
      .eq("entitlement_key", normalizedKey)
      .maybeSingle();

    if (error) return unavailableDecision(normalizedKey);

    return toDecision(normalizedKey, data);
  } catch {
    return unavailableDecision(normalizedKey);
  }
}

export async function readCurrentUserEntitlements(
  entitlementKeys: readonly PremiumEntitlementKey[],
): Promise<PremiumEntitlementDecision[]> {
  const normalizedKeys = Array.from(new Set(entitlementKeys.map(normalizeEntitlementKey).filter(isPremiumEntitlementKey)));
  if (!normalizedKeys.length) return [];

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = normalizeText(sessionData.session?.user?.id);
  if (!userId) {
    return normalizedKeys.map((key) => unavailableDecision(key, "signed_out"));
  }

  try {
    const { data, error } = await supabase
      .from(USER_ENTITLEMENTS_TABLE)
      .select("user_id,entitlement_key,status,source,starts_at,expires_at,revoked_at,updated_at,metadata")
      .eq("user_id", userId)
      .in("entitlement_key", normalizedKeys);

    if (error) {
      return normalizedKeys.map((key) => unavailableDecision(key));
    }

    const rowsByKey = new Map<string, UserEntitlementRow>();
    for (const row of data ?? []) {
      const rowKey = normalizeEntitlementKey(row.entitlement_key);
      if (rowKey) rowsByKey.set(rowKey, row);
    }

    return normalizedKeys.map((key) => toDecision(key, rowsByKey.get(key) ?? null));
  } catch {
    return normalizedKeys.map((key) => unavailableDecision(key));
  }
}

export function hasActiveEntitlement(decisions: readonly PremiumEntitlementDecision[]) {
  return decisions.some((decision) => decision.isActive);
}
