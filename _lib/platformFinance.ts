import { supabase } from "./supabase";

export const PLATFORM_FINANCE_LEDGER_EVENTS_TABLE = "platform_finance_ledger_events";
export const CREATOR_REVENUE_SHARE_RULES_TABLE = "creator_revenue_share_rules";
export const CREATOR_REVENUE_SHARE_LEDGER_ENTRIES_TABLE = "creator_revenue_share_ledger_entries";
export const CREATOR_PAYOUT_LEDGER_ENTRIES_TABLE = "creator_payout_ledger_entries";
export const NETWORK_BILLING_ACCOUNTS_TABLE = "network_billing_accounts";
export const NETWORK_INVOICE_RECORDS_TABLE = "network_invoice_records";
export const NETWORK_PLAN_RECORDS_TABLE = "network_plan_records";
export const NETWORK_ACCOUNT_PLAN_ASSIGNMENTS_TABLE = "network_account_plan_assignments";
export const NETWORK_QUOTA_RECORDS_TABLE = "network_quota_records";
export const NETWORK_INVOICE_LINE_ITEMS_TABLE = "network_invoice_line_items";
export const NETWORK_OVERAGE_EVENTS_TABLE = "network_overage_events";
export const NETWORK_BILLING_AUDIT_LOGS_TABLE = "network_billing_audit_logs";
export const SPONSOR_BRAND_RECORDS_TABLE = "sponsor_brand_records";
export const SPONSOR_DEAL_RECORDS_TABLE = "sponsor_deal_records";
export const SPONSOR_CREATIVE_RECORDS_TABLE = "sponsor_creative_records";
export const SPONSOR_PLACEMENT_RECORDS_TABLE = "sponsor_placement_records";
export const SPONSOR_DISCLOSURE_RECORDS_TABLE = "sponsor_disclosure_records";
export const SPONSOR_REVIEW_LOGS_TABLE = "sponsor_review_logs";
export const SPONSOR_REVIEW_QUEUE_RECORDS_TABLE = "sponsor_review_queue_records";
export const SPONSOR_SAFETY_REVIEW_RECORDS_TABLE = "sponsor_safety_review_records";
export const SPONSOR_PAYMENT_RECORDS_TABLE = "sponsor_payment_records";
export const SPONSOR_PAYOUT_SPLIT_RECORDS_TABLE = "sponsor_payout_split_records";
export const PLATFORM_FRAUD_HOLDS_TABLE = "platform_fraud_holds";
export const FRAUD_REASON_RECORDS_TABLE = "fraud_reason_records";
export const FRAUD_EVIDENCE_RECORDS_TABLE = "fraud_evidence_records";
export const FRAUD_ACTION_RECORDS_TABLE = "fraud_action_records";
export const FRAUD_ENFORCEMENT_POLICY_RECORDS_TABLE = "fraud_enforcement_policy_records";
export const FRAUD_REVIEW_QUEUE_RECORDS_TABLE = "fraud_review_queue_records";
export const FRAUD_REVIEW_NOTES_TABLE = "fraud_review_notes";
export const FRAUD_APPEAL_RECORDS_TABLE = "fraud_appeal_records";
export const FRAUD_AUDIT_LOGS_TABLE = "fraud_audit_logs";
export const CREATOR_PAYOUT_ACCOUNTS_TABLE = "creator_payout_accounts";
export const CREATOR_PAYOUT_ELIGIBILITY_RECORDS_TABLE = "creator_payout_eligibility_records";
export const CREATOR_PAYOUT_ONBOARDING_SESSIONS_TABLE = "creator_payout_onboarding_sessions";
export const CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE = "creator_payout_provider_webhook_events";
export const CREATOR_PAYOUT_BATCHES_TABLE = "creator_payout_batches";
export const CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE = "creator_payout_provider_transfers";
export const CREATOR_PAYOUT_HOLDS_TABLE = "creator_payout_holds";
export const CREATOR_PAYOUT_AUDIT_LOG_TABLE = "creator_payout_audit_log";
export const CREATOR_PAYOUT_REVIEW_RECORDS_TABLE = "creator_payout_review_records";
export const CREATOR_PAYOUT_REVIEW_NOTES_TABLE = "creator_payout_review_notes";
export const CREATOR_PAYOUT_BATCH_ITEMS_TABLE = "creator_payout_batch_items";

export type AdminFinanceReadModel = {
  financeLedgerEventCount: number | null;
  creatorRevenueShareRuleCount: number | null;
  creatorRevenueShareLedgerEntryCount: number | null;
  creatorRevenueShareLedgerFoundationCount: number | null;
  creatorPayoutLedgerEntryCount: number | null;
  creatorPayoutAccountCount: number | null;
  creatorPayoutAccountTestModeCount: number | null;
  creatorPayoutAccountReadyLaterCount: number | null;
  creatorPayoutAccountActionRequiredCount: number | null;
  creatorPayoutAccountPayoutsEnabledCount: number | null;
  creatorPayoutOnboardingSessionCount: number | null;
  creatorPayoutOnboardingLinkCreatedCount: number | null;
  creatorPayoutEligibilityRecordCount: number | null;
  creatorPayoutEligibilityProviderReadyCount: number | null;
  creatorPayoutEligibilityEligibleCount: number | null;
  creatorPayoutProviderWebhookEventCount: number | null;
  creatorPayoutProviderWebhookProcessedCount: number | null;
  creatorPayoutProviderWebhookIgnoredCount: number | null;
  creatorPayoutProviderWebhookFailedCount: number | null;
  creatorPayoutReviewRecordCount: number | null;
  creatorPayoutReviewNoteCount: number | null;
  creatorPayoutBatchCount: number | null;
  creatorPayoutBatchItemCount: number | null;
  creatorPayoutProviderTransferCount: number | null;
  creatorPayoutProviderTransferSyncRequiredCount: number | null;
  creatorPayoutProviderTransferSyncedTestCount: number | null;
  creatorPayoutProviderTransferSyncFailedCount: number | null;
  creatorPayoutHoldCount: number | null;
  creatorPayoutAuditLogCount: number | null;
  networkBillingAccountCount: number | null;
  networkInvoiceRecordCount: number | null;
  networkInvoiceDraftCount: number | null;
  networkPlanRecordCount: number | null;
  networkAccountPlanAssignmentCount: number | null;
  networkQuotaRecordCount: number | null;
  networkInvoiceLineItemCount: number | null;
  networkInvoiceLineItemDraftCount: number | null;
  networkOverageEventCount: number | null;
  networkOverageWarningOnlyCount: number | null;
  networkOverageReviewRequiredCount: number | null;
  networkBillingAuditLogCount: number | null;
  sponsorBrandRecordCount: number | null;
  sponsorDealRecordCount: number | null;
  sponsorCreativeRecordCount: number | null;
  sponsorPlacementRecordCount: number | null;
  sponsorDisclosureRecordCount: number | null;
  sponsorDisclosureRequiredCount: number | null;
  sponsorReviewLogCount: number | null;
  sponsorReviewQueueRecordCount: number | null;
  sponsorReviewQueueFoundationCount: number | null;
  sponsorReviewQueueDisclosureRequiredCount: number | null;
  sponsorReviewQueueSafetyRequiredCount: number | null;
  sponsorReviewQueuePaymentReadinessCount: number | null;
  sponsorSafetyReviewRecordCount: number | null;
  sponsorSafetyReviewUnsafeProductCount: number | null;
  sponsorSafetyReviewScamCount: number | null;
  sponsorPaymentRecordCount: number | null;
  sponsorPaymentTestModePlannedCount: number | null;
  sponsorPayoutSplitRecordCount: number | null;
  platformFraudHoldCount: number | null;
  fraudReasonRecordCount: number | null;
  fraudEvidenceRecordCount: number | null;
  fraudActionRecordCount: number | null;
  fraudEnforcementPolicyCount: number | null;
  fraudEnforcementPolicyFoundationCount: number | null;
  fraudActionNotExecutableCount: number | null;
  fraudReviewQueueRecordCount: number | null;
  fraudReviewQueuePendingCount: number | null;
  fraudReviewQueueNeedsEvidenceCount: number | null;
  fraudReviewQueueEscalatedCount: number | null;
  fraudReviewQueueEnforcementPlannedCount: number | null;
  fraudReviewQueueAppealedCount: number | null;
  fraudReviewNoteCount: number | null;
  fraudAppealRecordCount: number | null;
  fraudAuditLogCount: number | null;
  generatedAt: string;
};

type CountQueryResult = {
  count: number | null;
  error: unknown;
};

type CountQuery = PromiseLike<CountQueryResult> & {
  eq: (column: string, value: string | number | boolean) => PromiseLike<CountQueryResult>;
};

const financeClient = supabase as unknown as {
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => CountQuery;
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

async function readTableCountWhereEq(table: string, column: string, value: string | number | boolean) {
  const { count, error } = await financeClient
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
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
    creatorRevenueShareRuleCount,
    creatorRevenueShareLedgerEntryCount,
    creatorRevenueShareLedgerFoundationCount,
    creatorPayoutLedgerEntryCount,
    creatorPayoutAccountCount,
    creatorPayoutAccountTestModeCount,
    creatorPayoutAccountReadyLaterCount,
    creatorPayoutAccountActionRequiredCount,
    creatorPayoutAccountPayoutsEnabledCount,
    creatorPayoutOnboardingSessionCount,
    creatorPayoutOnboardingLinkCreatedCount,
    creatorPayoutEligibilityRecordCount,
    creatorPayoutEligibilityProviderReadyCount,
    creatorPayoutEligibilityEligibleCount,
    creatorPayoutProviderWebhookEventCount,
    creatorPayoutProviderWebhookProcessedCount,
    creatorPayoutProviderWebhookIgnoredCount,
    creatorPayoutProviderWebhookFailedCount,
    creatorPayoutReviewRecordCount,
    creatorPayoutReviewNoteCount,
    creatorPayoutBatchCount,
    creatorPayoutBatchItemCount,
    creatorPayoutProviderTransferCount,
    creatorPayoutProviderTransferSyncRequiredCount,
    creatorPayoutProviderTransferSyncedTestCount,
    creatorPayoutProviderTransferSyncFailedCount,
    creatorPayoutHoldCount,
    creatorPayoutAuditLogCount,
    networkBillingAccountCount,
    networkInvoiceRecordCount,
    networkInvoiceDraftCount,
    networkPlanRecordCount,
    networkAccountPlanAssignmentCount,
    networkQuotaRecordCount,
    networkInvoiceLineItemCount,
    networkInvoiceLineItemDraftCount,
    networkOverageEventCount,
    networkOverageWarningOnlyCount,
    networkOverageReviewRequiredCount,
    networkBillingAuditLogCount,
    sponsorBrandRecordCount,
    sponsorDealRecordCount,
    sponsorCreativeRecordCount,
    sponsorPlacementRecordCount,
    sponsorDisclosureRecordCount,
    sponsorDisclosureRequiredCount,
    sponsorReviewLogCount,
    sponsorReviewQueueRecordCount,
    sponsorReviewQueueFoundationCount,
    sponsorReviewQueueDisclosureRequiredCount,
    sponsorReviewQueueSafetyRequiredCount,
    sponsorReviewQueuePaymentReadinessCount,
    sponsorSafetyReviewRecordCount,
    sponsorSafetyReviewUnsafeProductCount,
    sponsorSafetyReviewScamCount,
    sponsorPaymentRecordCount,
    sponsorPaymentTestModePlannedCount,
    sponsorPayoutSplitRecordCount,
    platformFraudHoldCount,
    fraudReasonRecordCount,
    fraudEvidenceRecordCount,
    fraudActionRecordCount,
    fraudEnforcementPolicyCount,
    fraudEnforcementPolicyFoundationCount,
    fraudActionNotExecutableCount,
    fraudReviewQueueRecordCount,
    fraudReviewQueuePendingCount,
    fraudReviewQueueNeedsEvidenceCount,
    fraudReviewQueueEscalatedCount,
    fraudReviewQueueEnforcementPlannedCount,
    fraudReviewQueueAppealedCount,
    fraudReviewNoteCount,
    fraudAppealRecordCount,
    fraudAuditLogCount,
  ] = await Promise.all([
    safeRead(() => readTableCount(PLATFORM_FINANCE_LEDGER_EVENTS_TABLE)),
    safeRead(() => readTableCount(CREATOR_REVENUE_SHARE_RULES_TABLE)),
    safeRead(() => readTableCount(CREATOR_REVENUE_SHARE_LEDGER_ENTRIES_TABLE)),
    safeRead(() => readTableCountWhereEq(CREATOR_REVENUE_SHARE_LEDGER_ENTRIES_TABLE, "status", "foundation")),
    safeRead(() => readTableCount(CREATOR_PAYOUT_LEDGER_ENTRIES_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_ACCOUNTS_TABLE)),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_ACCOUNTS_TABLE, "provider_environment", "test")),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_ACCOUNTS_TABLE, "onboarding_status", "ready_for_payouts")),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_ACCOUNTS_TABLE, "onboarding_status", "action_required")),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_ACCOUNTS_TABLE, "payouts_enabled", true)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_ONBOARDING_SESSIONS_TABLE)),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_ONBOARDING_SESSIONS_TABLE, "status", "link_created")),
    safeRead(() => readTableCount(CREATOR_PAYOUT_ELIGIBILITY_RECORDS_TABLE)),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_ELIGIBILITY_RECORDS_TABLE, "provider_ready", true)),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_ELIGIBILITY_RECORDS_TABLE, "eligible_for_payouts", true)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE)),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE, "status", "processed")),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE, "status", "ignored")),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_PROVIDER_WEBHOOK_EVENTS_TABLE, "status", "failed")),
    safeRead(() => readTableCount(CREATOR_PAYOUT_REVIEW_RECORDS_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_REVIEW_NOTES_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_BATCHES_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_BATCH_ITEMS_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE)),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE, "status", "sync_required")),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE, "status", "synced_test")),
    safeRead(() => readTableCountWhereEq(CREATOR_PAYOUT_PROVIDER_TRANSFERS_TABLE, "status", "sync_failed")),
    safeRead(() => readTableCount(CREATOR_PAYOUT_HOLDS_TABLE)),
    safeRead(() => readTableCount(CREATOR_PAYOUT_AUDIT_LOG_TABLE)),
    safeRead(() => readTableCount(NETWORK_BILLING_ACCOUNTS_TABLE)),
    safeRead(() => readTableCount(NETWORK_INVOICE_RECORDS_TABLE)),
    safeRead(() => readTableCountWhereEq(NETWORK_INVOICE_RECORDS_TABLE, "status", "draft")),
    safeRead(() => readTableCount(NETWORK_PLAN_RECORDS_TABLE)),
    safeRead(() => readTableCount(NETWORK_ACCOUNT_PLAN_ASSIGNMENTS_TABLE)),
    safeRead(() => readTableCount(NETWORK_QUOTA_RECORDS_TABLE)),
    safeRead(() => readTableCount(NETWORK_INVOICE_LINE_ITEMS_TABLE)),
    safeRead(() => readTableCountWhereEq(NETWORK_INVOICE_LINE_ITEMS_TABLE, "status", "draft")),
    safeRead(() => readTableCount(NETWORK_OVERAGE_EVENTS_TABLE)),
    safeRead(() => readTableCountWhereEq(NETWORK_OVERAGE_EVENTS_TABLE, "status", "warning_only")),
    safeRead(() => readTableCountWhereEq(NETWORK_OVERAGE_EVENTS_TABLE, "status", "review_required")),
    safeRead(() => readTableCount(NETWORK_BILLING_AUDIT_LOGS_TABLE)),
    safeRead(() => readTableCount(SPONSOR_BRAND_RECORDS_TABLE)),
    safeRead(() => readTableCount(SPONSOR_DEAL_RECORDS_TABLE)),
    safeRead(() => readTableCount(SPONSOR_CREATIVE_RECORDS_TABLE)),
    safeRead(() => readTableCount(SPONSOR_PLACEMENT_RECORDS_TABLE)),
    safeRead(() => readTableCount(SPONSOR_DISCLOSURE_RECORDS_TABLE)),
    safeRead(() => readTableCountWhereEq(SPONSOR_DISCLOSURE_RECORDS_TABLE, "status", "required_later")),
    safeRead(() => readTableCount(SPONSOR_REVIEW_LOGS_TABLE)),
    safeRead(() => readTableCount(SPONSOR_REVIEW_QUEUE_RECORDS_TABLE)),
    safeRead(() => readTableCountWhereEq(SPONSOR_REVIEW_QUEUE_RECORDS_TABLE, "review_status", "foundation")),
    safeRead(() => readTableCountWhereEq(SPONSOR_REVIEW_QUEUE_RECORDS_TABLE, "review_status", "needs_disclosure_review_later")),
    safeRead(() => readTableCountWhereEq(SPONSOR_REVIEW_QUEUE_RECORDS_TABLE, "review_status", "needs_safety_review_later")),
    safeRead(() => readTableCountWhereEq(SPONSOR_REVIEW_QUEUE_RECORDS_TABLE, "review_status", "needs_payment_review_later")),
    safeRead(() => readTableCount(SPONSOR_SAFETY_REVIEW_RECORDS_TABLE)),
    safeRead(() => readTableCountWhereEq(SPONSOR_SAFETY_REVIEW_RECORDS_TABLE, "risk_category", "unsafe_product")),
    safeRead(() => readTableCountWhereEq(SPONSOR_SAFETY_REVIEW_RECORDS_TABLE, "risk_category", "scam_promotion")),
    safeRead(() => readTableCount(SPONSOR_PAYMENT_RECORDS_TABLE)),
    safeRead(() => readTableCountWhereEq(SPONSOR_PAYMENT_RECORDS_TABLE, "status", "test_mode_planned")),
    safeRead(() => readTableCount(SPONSOR_PAYOUT_SPLIT_RECORDS_TABLE)),
    safeRead(() => readTableCount(PLATFORM_FRAUD_HOLDS_TABLE)),
    safeRead(() => readTableCount(FRAUD_REASON_RECORDS_TABLE)),
    safeRead(() => readTableCount(FRAUD_EVIDENCE_RECORDS_TABLE)),
    safeRead(() => readTableCount(FRAUD_ACTION_RECORDS_TABLE)),
    safeRead(() => readTableCount(FRAUD_ENFORCEMENT_POLICY_RECORDS_TABLE)),
    safeRead(() => readTableCountWhereEq(FRAUD_ENFORCEMENT_POLICY_RECORDS_TABLE, "status", "foundation")),
    safeRead(() => readTableCountWhereEq(FRAUD_ACTION_RECORDS_TABLE, "execution_status", "not_executable")),
    safeRead(() => readTableCount(FRAUD_REVIEW_QUEUE_RECORDS_TABLE)),
    safeRead(() => readTableCountWhereEq(FRAUD_REVIEW_QUEUE_RECORDS_TABLE, "review_status", "pending_review_later")),
    safeRead(() => readTableCountWhereEq(FRAUD_REVIEW_QUEUE_RECORDS_TABLE, "review_status", "needs_evidence_later")),
    safeRead(() => readTableCountWhereEq(FRAUD_REVIEW_QUEUE_RECORDS_TABLE, "review_status", "escalated_later")),
    safeRead(() => readTableCountWhereEq(FRAUD_REVIEW_QUEUE_RECORDS_TABLE, "review_status", "enforcement_planned_later")),
    safeRead(() => readTableCountWhereEq(FRAUD_REVIEW_QUEUE_RECORDS_TABLE, "review_status", "appealed_later")),
    safeRead(() => readTableCount(FRAUD_REVIEW_NOTES_TABLE)),
    safeRead(() => readTableCount(FRAUD_APPEAL_RECORDS_TABLE)),
    safeRead(() => readTableCount(FRAUD_AUDIT_LOGS_TABLE)),
  ]);

  return {
    financeLedgerEventCount,
    creatorRevenueShareRuleCount,
    creatorRevenueShareLedgerEntryCount,
    creatorRevenueShareLedgerFoundationCount,
    creatorPayoutLedgerEntryCount,
    creatorPayoutAccountCount,
    creatorPayoutAccountTestModeCount,
    creatorPayoutAccountReadyLaterCount,
    creatorPayoutAccountActionRequiredCount,
    creatorPayoutAccountPayoutsEnabledCount,
    creatorPayoutOnboardingSessionCount,
    creatorPayoutOnboardingLinkCreatedCount,
    creatorPayoutEligibilityRecordCount,
    creatorPayoutEligibilityProviderReadyCount,
    creatorPayoutEligibilityEligibleCount,
    creatorPayoutProviderWebhookEventCount,
    creatorPayoutProviderWebhookProcessedCount,
    creatorPayoutProviderWebhookIgnoredCount,
    creatorPayoutProviderWebhookFailedCount,
    creatorPayoutReviewRecordCount,
    creatorPayoutReviewNoteCount,
    creatorPayoutBatchCount,
    creatorPayoutBatchItemCount,
    creatorPayoutProviderTransferCount,
    creatorPayoutProviderTransferSyncRequiredCount,
    creatorPayoutProviderTransferSyncedTestCount,
    creatorPayoutProviderTransferSyncFailedCount,
    creatorPayoutHoldCount,
    creatorPayoutAuditLogCount,
    networkBillingAccountCount,
    networkInvoiceRecordCount,
    networkInvoiceDraftCount,
    networkPlanRecordCount,
    networkAccountPlanAssignmentCount,
    networkQuotaRecordCount,
    networkInvoiceLineItemCount,
    networkInvoiceLineItemDraftCount,
    networkOverageEventCount,
    networkOverageWarningOnlyCount,
    networkOverageReviewRequiredCount,
    networkBillingAuditLogCount,
    sponsorBrandRecordCount,
    sponsorDealRecordCount,
    sponsorCreativeRecordCount,
    sponsorPlacementRecordCount,
    sponsorDisclosureRecordCount,
    sponsorDisclosureRequiredCount,
    sponsorReviewLogCount,
    sponsorReviewQueueRecordCount,
    sponsorReviewQueueFoundationCount,
    sponsorReviewQueueDisclosureRequiredCount,
    sponsorReviewQueueSafetyRequiredCount,
    sponsorReviewQueuePaymentReadinessCount,
    sponsorSafetyReviewRecordCount,
    sponsorSafetyReviewUnsafeProductCount,
    sponsorSafetyReviewScamCount,
    sponsorPaymentRecordCount,
    sponsorPaymentTestModePlannedCount,
    sponsorPayoutSplitRecordCount,
    platformFraudHoldCount,
    fraudReasonRecordCount,
    fraudEvidenceRecordCount,
    fraudActionRecordCount,
    fraudEnforcementPolicyCount,
    fraudEnforcementPolicyFoundationCount,
    fraudActionNotExecutableCount,
    fraudReviewQueueRecordCount,
    fraudReviewQueuePendingCount,
    fraudReviewQueueNeedsEvidenceCount,
    fraudReviewQueueEscalatedCount,
    fraudReviewQueueEnforcementPlannedCount,
    fraudReviewQueueAppealedCount,
    fraudReviewNoteCount,
    fraudAppealRecordCount,
    fraudAuditLogCount,
    generatedAt: new Date().toISOString(),
  };
}
