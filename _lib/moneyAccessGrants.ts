import { supabase } from "./supabase";

export const MONETIZATION_PRODUCTS_TABLE = "monetization_products";
export const PROVIDER_EVENTS_TABLE = "provider_events";
export const ACCESS_GRANTS_TABLE = "access_grants";
export const MONEY_ACCESS_LEDGER_EVENTS_TABLE = "money_access_ledger_events";
export const MONEY_PURCHASE_INTENTS_TABLE = "money_purchase_intents";
export const MERCH_PRODUCTS_TABLE = "merch_products";
export const MERCH_ORDERS_TABLE = "merch_orders";

export type MonetizationProductType =
  | "premium_subscription"
  | "paid_content_access"
  | "watch_party_live_ticket"
  | "live_watch_party_access_pass"
  | "live_watch_party_seat_pass"
  | "creator_tip"
  | "merch_physical_good"
  | "event_pass"
  | "channel_subscription"
  | "vip_pass";

export type MonetizationProductStatus = "setup" | "sandbox" | "active" | "disabled" | "retired";
export type AccessGrantStatus = "active" | "pending" | "expired" | "revoked" | "refunded" | "blocked" | "sandbox_only" | "setup_only";
export type LedgerEnvironment = "setup" | "sandbox" | "production";
export type LedgerPayableState =
  | "not_payable"
  | "pending_verification"
  | "payable"
  | "paid"
  | "refunded"
  | "reversed"
  | "chargeback";
export type MoneyPurchaseIntentStatus = "pending" | "consumed" | "expired" | "cancelled" | "failed" | "revoked";

export type MoneyAccessReadout = {
  productCatalogCount: number;
  accessGrantCount: number;
  providerEventCount: number;
  ledgerEventCount: number;
  purchaseIntentCount: number;
  pendingPurchaseIntentCount: number;
  consumedPurchaseIntentCount: number;
  merchProductCount: number;
  merchOrderCount: number;
  sandboxNotPayableLedgerCount: number;
  setupNotPayableLedgerCount: number;
  payableLedgerCount: number;
  liveMoneyEnabled: boolean;
};

type MoneyAccessReadoutDb = Partial<Record<keyof MoneyAccessReadout, unknown>>;

const moneyAccessClient = supabase as unknown as {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
};

const toCount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const normalizeMoneyAccessReadout = (row: MoneyAccessReadoutDb | null | undefined): MoneyAccessReadout => ({
  productCatalogCount: toCount(row?.productCatalogCount),
  accessGrantCount: toCount(row?.accessGrantCount),
  providerEventCount: toCount(row?.providerEventCount),
  ledgerEventCount: toCount(row?.ledgerEventCount),
  purchaseIntentCount: toCount(row?.purchaseIntentCount),
  pendingPurchaseIntentCount: toCount(row?.pendingPurchaseIntentCount),
  consumedPurchaseIntentCount: toCount(row?.consumedPurchaseIntentCount),
  merchProductCount: toCount(row?.merchProductCount),
  merchOrderCount: toCount(row?.merchOrderCount),
  sandboxNotPayableLedgerCount: toCount(row?.sandboxNotPayableLedgerCount),
  setupNotPayableLedgerCount: toCount(row?.setupNotPayableLedgerCount),
  payableLedgerCount: toCount(row?.payableLedgerCount),
  liveMoneyEnabled: row?.liveMoneyEnabled === true,
});

export async function readAdminMoneyAccessReadout(): Promise<MoneyAccessReadout> {
  const { data, error } = await moneyAccessClient.rpc<MoneyAccessReadoutDb>("get_admin_money_access_readout");
  if (error) throw new Error("Money access readout is not available yet.");
  return normalizeMoneyAccessReadout(data);
}

export const MONEY_ACCESS_POLICY_PROOF = {
  paymentCreatesAccessRecordsOnly: true,
  premiumSourceRemainsUserEntitlements: true,
  androidDigitalRail: "revenuecat_google_play",
  merchSeparateFromDigitalAccess: true,
  liveKitPublishGrantedByPayment: false,
  hostPowerGrantedByPayment: false,
  payoutAccessGrantedByPayment: false,
  sandboxLedgerPayable: false,
  setupLedgerPayable: false,
  dynamicPurchaseIntentsSandboxOnly: true,
  missingPurchaseIntentGrantsAccess: false,
  expiredPurchaseIntentGrantsAccess: false,
  consumedPurchaseIntentCanBeReused: false,
} as const;
