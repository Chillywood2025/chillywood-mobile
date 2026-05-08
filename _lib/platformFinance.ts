import { supabase } from "./supabase";

export const PLATFORM_FINANCE_LEDGER_EVENTS_TABLE = "platform_finance_ledger_events";
export const CREATOR_PAYOUT_LEDGER_ENTRIES_TABLE = "creator_payout_ledger_entries";
export const NETWORK_BILLING_ACCOUNTS_TABLE = "network_billing_accounts";
export const NETWORK_INVOICE_RECORDS_TABLE = "network_invoice_records";
export const NETWORK_PLAN_RECORDS_TABLE = "network_plan_records";
export const NETWORK_ACCOUNT_PLAN_ASSIGNMENTS_TABLE = "network_account_plan_assignments";
export const NETWORK_QUOTA_RECORDS_TABLE = "network_quota_records";
export const NETWORK_INVOICE_LINE_ITEMS_TABLE = "network_invoice_line_items";
export const NETWORK_OVERAGE_EVENTS_TABLE = "network_overage_events";
export const NETWORK_BILLING_AUDIT_LOGS_TABLE = "network_billing_audit_logs";
export const SPONSOR_DEAL_RECORDS_TABLE = "sponsor_deal_records";
export const PLATFORM_FRAUD_HOLDS_TABLE = "platform_fraud_holds";
export const CREATOR_PAYOUT_ACCOUNTS_TABLE = "creator_payout_accounts";
export const CREATOR_PAYOUT_BATCHES_TABLE = "creator_payout_batches";
export const CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE = "creator_payout_provider_transfers";
export const CREATOR_PAYOUT_HOLDS_TABLE = "creator_payout_holds";
export const CREATOR_PAYOUT_AUDIT_LOG_TABLE = "creator_payout_audit_log";

export type AdminFinanceReadModel = {
  financeLedgerEventCount: number | null;
  creatorPayoutLedgerEntryCount: number | null;
  creatorPayoutAccountCount: number | null;
  creatorPayoutBatchCount: number | null;
  creatorPayoutProviderTransferCount: number | null;
  creatorPayoutHoldCount: number | null;
  creatorPayoutAuditLogCount: number | null;
  networkBillingAccountCount: number | null;
  networkInvoiceRecordCount: number | null;
  networkPlanRecordCount: number | null;
  networkAccountPlanAssignmentCount: number | null;
  networkQuotaRecordCount: number | null;
  networkInvoiceLineItemCount: number | null;
  networkOverageEventCount: number | null;
  networkBillingAuditLogCount: number | null;
  sponsorDealRecordCount: number | null;
  platformFraudHoldCount: number | null;
  generatedAt: string;
};

type CountQueryResult = {
  count: number | null;
  error: unknown;
};

const financeClient = supabase as unknown as {
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => PromiseLike<CountQueryResult>;
  };
};

const safeRead = async <T>(loader: () => Promise<T>): Promise<T | null> => {
  try {
    return await loader();
  } catch {
    return null;
  }
};

async function readTableCount(table: string) {
  const { count, error } = await financeClient
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return Number(count ?? 0);
}

export const formatFinanceFoundationCount = (value: number | null, singular: string, plural: string) => {
  if (value === null) return "Not connected yet";
  return `${value} ${value === 1 ? singular : plural} found.`;
};

export async function readAdminFinanceReadModel(): Promise<AdminFinanceReadModel> {
  const [
    financeLedgerEventCount,
    creatorPayoutLedgerEntryCount,
    creatorPayoutAccountCount,
    creatorPayoutBatchCount,
    creatorPayoutProviderTransferCount,
    creatorPayoutHoldCount,
    creatorPayoutAuditLogCount,
    networkBillingAccountCount,
    networkInvoiceRecordCount,
    networkPlanRecordCount,
    networkAccountPlanAssignmentCount,
    networkQuotaRecordCount,
    networkInvoiceLineItemCount,
    networkOverageEventCount,
    networkBillingAuditLogCount,
    sponsorDealRecordCount,
    platformFraudHoldCount,
  ] = await Promise.all([
    safeRead(() => readTableCount(PLATFORM_FINANCE_LEDGER_EVENTS_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_LEDGER_ENTRIES_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_ACCOUNTS_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_BATCHES_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_HOLDS_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_AUDIT_LOG_TABLE)),
    safeRead(() => readTableCount(NETWORK_BILLING_ACCOUNTS_TABLE)),
    safeRead(() => readTableCount(NETWORK_INVOICE_RECORDS_TABLE)),
    safeRead(() => readTableCount(NETWORK_PLAN_RECORDS_TABLE)),
    safeRead(() => readTableCount(NETWORK_ACCOUNT_PLAN_ASSIGNMENTS_TABLE)),
    safeRead(() => readTableCount(NETWORK_QUOTA_RECORDS_TABLE)),
    safeRead(() => readTableCount(NETWORK_INVOICE_LINE_ITEMS_TABLE)),
    safeRead(() => readTableCount(NETWORK_OVERAGE_EVENTS_TABLE)),
    safeRead(() => readTableCount(NETWORK_BILLING_AUDIT_LOGS_TABLE)),
    safeRead(() => readTableCount(SPONSOR_DEAL_RECORDS_TABLE)),
    safeRead(() => readTableCount(PLATFORM_FRAUD_HOLDS_TABLE)),
  ]);

  return {
    financeLedgerEventCount,
    creatorPayoutLedgerEntryCount,
    creatorPayoutAccountCount,
    creatorPayoutBatchCount,
    creatorPayoutProviderTransferCount,
    creatorPayoutHoldCount,
    creatorPayoutAuditLogCount,
    networkBillingAccountCount,
    networkInvoiceRecordCount,
    networkPlanRecordCount,
    networkAccountPlanAssignmentCount,
    networkQuotaRecordCount,
    networkInvoiceLineItemCount,
    networkOverageEventCount,
    networkBillingAuditLogCount,
    sponsorDealRecordCount,
    platformFraudHoldCount,
    generatedAt: new Date().toISOString(),
  };
}
