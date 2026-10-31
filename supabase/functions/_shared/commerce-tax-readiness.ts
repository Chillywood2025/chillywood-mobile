// Read-only provider policy: never infer liability or registration from a buyer,
// a zero tax amount, a platform label, or a Stripe charge pattern.
type TaxInput = { feature: "physical_merch" | "event_auction" | "room_auction";
  identityId: string; productId: string; accountId: string; environment: "sandbox" | "test";
  permittedScope: "US_all_destinations" | "worldwide" };
type Rpc = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export type CommerceTaxReadiness = { ready: false; reason: string } | {
  ready: true; policyId: string; taxBehavior: "inclusive" | "exclusive"; taxCode: string;
  liabilityType: "self" | "account"; liabilityAccountId: string | null;
  collectionMode: "automatic" | "verified_no_collection";
};
const reasons = new Set(["tax_qualification_required", "tax_qualification_expired", "tax_pricing_behavior_required",
  "tax_scope_coverage_required", "provider_tax_settings_unverified", "tax_policy_changed", "tax_checkout_identity_invalid", "tax_pricing_behavior_unsupported"]);
export async function readCommerceTaxReadiness(client: Rpc, input: TaxInput): Promise<CommerceTaxReadiness> {
  const blocked = { ready: false as const, reason: "tax_qualification_required" };
  const result = await client.rpc("bind_commerce_tax_checkout_policy", {
    p_feature: input.feature, p_identity_id: input.identityId, p_product_id: input.productId,
    p_account_id: input.accountId, p_environment: input.environment, p_permitted_scope: input.permittedScope,
  });
  if (result.error || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) return blocked;
  const p = result.data as Record<string, unknown>;
  if (p.ready !== true) return { ready: false, reason: typeof p.reason === "string" && reasons.has(p.reason) ? p.reason : blocked.reason };
  if (p.taxBehavior === "exclusive") return { ready: false, reason: "tax_pricing_behavior_unsupported" };
  if (typeof p.policyId !== "string" || !/^[0-9a-f-]{36}$/i.test(p.policyId)
    || !["inclusive", "exclusive"].includes(String(p.taxBehavior))
    || (input.feature !== "physical_merch" && p.taxBehavior !== "inclusive")
    || typeof p.taxCode !== "string" || !/^txcd_[0-9]+$/.test(p.taxCode)
    || !["automatic", "verified_no_collection"].includes(String(p.collectionMode))
    || !["self", "account"].includes(String(p.liabilityType))
    || (p.liabilityType === "account" ? typeof p.liabilityAccountId !== "string" || !/^acct_[A-Za-z0-9]+$/.test(p.liabilityAccountId) : p.liabilityAccountId !== null)) return blocked;
  return p as CommerceTaxReadiness;
}

export function commerceTaxParameters(policy: Extract<CommerceTaxReadiness, { ready: true }>): Record<string, string> {
  return {
    "automatic_tax[enabled]": String(policy.collectionMode === "automatic"),
    "line_items[0][price_data][tax_behavior]": policy.taxBehavior,
    ...(policy.collectionMode === "automatic" ? {
      "automatic_tax[liability][type]": policy.liabilityType,
      ...(policy.liabilityType === "account" ? { "automatic_tax[liability][account]": policy.liabilityAccountId! } : {}),
    } : {}),
    "metadata[commerce_tax_policy_id]": policy.policyId,
    "payment_intent_data[metadata][commerce_tax_policy_id]": policy.policyId,
  };
}
