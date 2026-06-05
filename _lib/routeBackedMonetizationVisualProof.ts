import { supabase } from "./supabase";

export type RouteBackedMonetizationProofConfig = {
  id: string;
  sourceType: string;
  sourceId: string;
  productKey: string;
  productType: string;
  provider: string;
  providerProductId: string;
  displayName: string;
  priceLabel: string;
  environment: string;
  status: string;
  payableState: string;
  productionEnabled: boolean;
  payoutEnabled: boolean;
  grantsLiveKitPublish: boolean;
  grantsHostAuthority: boolean;
  requiresHostApproval: boolean;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const mapProofConfig = (row: Record<string, unknown>): RouteBackedMonetizationProofConfig => ({
  id: normalizeText(row.id),
  sourceType: normalizeText(row.source_type),
  sourceId: normalizeText(row.source_id),
  productKey: normalizeText(row.product_key),
  productType: normalizeText(row.product_type),
  provider: normalizeText(row.provider),
  providerProductId: normalizeText(row.provider_product_id),
  displayName: normalizeText(row.display_name),
  priceLabel: normalizeText(row.price_label),
  environment: normalizeText(row.environment),
  status: normalizeText(row.status),
  payableState: normalizeText(row.payable_state),
  productionEnabled: row.production_enabled === true,
  payoutEnabled: row.payout_enabled === true,
  grantsLiveKitPublish: row.grants_livekit_publish === true,
  grantsHostAuthority: row.grants_host_authority === true,
  requiresHostApproval: row.requires_host_approval === true,
});

export async function readRouteBackedMonetizationProofConfig(options: {
  sourceId: string | null | undefined;
  sourceTypes: readonly string[];
}): Promise<RouteBackedMonetizationProofConfig | null> {
  const sourceId = normalizeText(options.sourceId);
  const sourceTypes = options.sourceTypes.map(normalizeText).filter(Boolean);
  if (!sourceId || !sourceTypes.length) return null;

  const { data, error } = await (supabase as any)
    .from("creator_monetization_configs")
    .select([
      "id",
      "source_type",
      "source_id",
      "product_key",
      "product_type",
      "provider",
      "provider_product_id",
      "display_name",
      "price_label",
      "environment",
      "status",
      "payable_state",
      "production_enabled",
      "payout_enabled",
      "grants_livekit_publish",
      "grants_host_authority",
      "requires_host_approval",
    ].join(","))
    .eq("source_id", sourceId)
    .in("source_type", sourceTypes)
    .eq("environment", "sandbox")
    .eq("payable_state", "not_payable")
    .eq("production_enabled", false)
    .eq("payout_enabled", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapProofConfig(data as Record<string, unknown>);
}
