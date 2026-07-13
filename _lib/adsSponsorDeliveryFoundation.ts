export const ADS_SPONSOR_DELIVERY_OPERATOR_ID = "ads_sponsor_delivery_operator" as const;

export const ADS_SPONSOR_FOUNDATION_STATUS = {
  systemId: ADS_SPONSOR_DELIVERY_OPERATOR_ID,
  status: "foundation_only_guarded",
  activeActivationMode: "off",
  schedulerStatus: "no_scheduler_foundation_only",
  allowedSurfaces: [
    "ad_provider_readiness",
    "sponsor_deal_readiness",
    "sponsor_checkout_readiness",
    "ad_inventory_readiness",
    "brand_safety_readiness",
    "sponsor_reporting_readiness",
    "ad_revenue_future_scope",
    "sponsor_payout_future_scope",
  ],
  forbidden: [
    "serving ads",
    "initializing ad SDK live behavior",
    "sponsor checkout",
    "sponsor upload/approval",
    "sponsor payout split",
    "ad revenue claim",
    "fake sponsor revenue",
    "fake ad impressions",
    "changing ad provider config",
    "child/unsafe context ad serving",
    "CTV inventory claim",
    "live billing/payout",
  ],
} as const;

export const buildAdsSponsorFutureOwnerCommand = () => ({
  commandText: "Ads/Sponsor Delivery foundation request: readiness planning only; do not serve ads, sponsor checkout, claim revenue, or mutate provider/billing behavior.",
  normalizedIntent: "ads_sponsor_delivery",
  targetSystems: [ADS_SPONSOR_DELIVERY_OPERATOR_ID],
  approvalLevel: 4,
  allowedScope: ["future readiness planning", "owner command request"],
  forbiddenScope: ADS_SPONSOR_FOUNDATION_STATUS.forbidden,
});
