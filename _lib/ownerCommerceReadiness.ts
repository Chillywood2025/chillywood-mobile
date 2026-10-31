import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";

export const COMMERCE_READINESS_REASONS = {
  tax_qualification_required: "Tax responsibility needs determination",
  tax_qualification_expired: "Tax determination needs renewed verification",
  tax_pricing_behavior_required: "Tax-inclusive or tax-exclusive pricing needs verification",
  tax_pricing_behavior_unsupported: "Tax-added pricing is not supported by the current checkout",
  tax_scope_coverage_required: "Tax determination does not cover all checkout destinations",
  provider_tax_settings_unverified: "Provider tax configuration needs verification",
} as const;
export const COMMERCE_READINESS_FEATURES = {
  physical_merch: "Creator merchandise",
  event_auction: "Event auctions",
  room_auction: "Room seat auctions",
} as const;
export type OwnerCommerceReadinessItem = {
  feature: keyof typeof COMMERCE_READINESS_FEATURES;
  reason: keyof typeof COMMERCE_READINESS_REASONS;
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
};
// This read is observation-only. Never accept a response granting financial authority.
export async function readOwnerCommerceReadiness(): Promise<OwnerCommerceReadinessItem[]> {
  try {
    const result = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("get_owner_commerce_tax_readiness", {});
    if (result.error) throw new Error();
    const data = record(result.data);
    if (data.schemaVersion !== 1 || data.status !== "blocked" || data.financialAuthority !== false
      || data.liveActivationAllowed !== false || !Array.isArray(data.items) || data.items.length !== 3) throw new Error();
    const items = data.items.map(value => {
      const item = record(value);
      if (typeof item.feature !== "string" || !Object.hasOwn(COMMERCE_READINESS_FEATURES, item.feature)
        || typeof item.reason !== "string" || !Object.hasOwn(COMMERCE_READINESS_REASONS, item.reason)
        || item.status !== "blocked" || item.taxServiceFeeStatus !== "unverified") throw new Error();
      return { feature: item.feature as OwnerCommerceReadinessItem["feature"], reason: item.reason as OwnerCommerceReadinessItem["reason"] };
    });
    if (new Set(items.map(item => item.feature)).size !== 3) throw new Error();
    return items;
  } catch { throw new Error("Commerce setup status is unavailable. Nothing has been enabled."); }
}
