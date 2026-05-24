import { supabase } from "./supabase";
import {
  CREATOR_INSTANT_CASHOUT_FEE_BPS,
  CREATOR_INSTANT_CASHOUT_FEE_CAP_CENTS,
  calculateScheduledPayoutFeeCents,
  type CreatorMonetizationRuntimeFlags,
} from "./creatorMonetization";

export const CREATOR_PAYOUT_LEDGER_ENTRIES_TABLE = "creator_payout_ledger_entries";
export const CREATOR_PAYOUT_ELIGIBILITY_RECORDS_TABLE = "creator_payout_eligibility_records";
export const STRIPE_CONNECT_TEST_ENABLED = true;
export const PAYOUT_DRY_RUN_ENABLED = true;
export const TEST_PAYOUT_WORKFLOW_ENABLED = true;

export type CreatorPayoutRequestKind = "scheduled" | "instant";

export type CreatorPayoutSetupStatus =
  | "not_active"
  | "provider_not_configured"
  | "setup_required"
  | "opening_setup_link"
  | "onboarding_in_progress"
  | "action_required"
  | "under_review"
  | "provider_ready_payouts_not_active"
  | "on_hold"
  | "payouts_disabled";

export type CreatorPayoutSetupRequirement = {
  label: string;
  value: string;
};

export type CreatorPayoutLedgerFoundationRow = {
  id: string;
  status: string;
  statusLabel: string;
  entryType: string;
  entryTypeLabel: string;
  amountMinor: number;
  currency: string;
  createdAt: string | null;
  holdUntil: string | null;
  holdReason: string | null;
  foundationOnly: boolean;
  notPayable: true;
};

export type CreatorPayoutDashboardReadModel = {
  status: "not_active";
  setupStatus: CreatorPayoutSetupStatus;
  setupStatusLabel: string;
  setupStatusBody: string;
  setupActionLabel: string | null;
  canStartProviderSetup: boolean;
  canRefreshProviderStatus: boolean;
  providerReady: boolean;
  eligibleForPayouts: boolean;
  holdPeriodCleared: boolean;
  kycReady: boolean;
  minimumPayoutMet: boolean;
  payoutAccountReady: boolean;
  taxReady: boolean;
  fraudHoldActive: boolean;
  adminReviewStatus: string | null;
  eligibilityReason: string | null;
  ledgerConnected: boolean;
  ledgerRowCount: number | null;
  latestRows: CreatorPayoutLedgerFoundationRow[];
  generatedAt: string;
};

export type CreatorPayoutReadinessResolution = {
  canReceivePayouts: boolean;
  canRequestScheduledPayout: boolean;
  canRequestInstantCashout: boolean;
  blockedReasons: string[];
  nextRequiredActions: string[];
  taxOrKycPending: boolean;
  providerRestricted: boolean;
  fraudOrDmcaHold: boolean;
  suspendedAccount: boolean;
  liveMoneyDisabled: boolean;
  payoutFeatureDisabled: boolean;
  cashoutFeatureDisabled: boolean;
  scheduledPayoutFeeCents: number;
  instantCashoutFeeBps: number;
  instantCashoutHasDefaultCap: boolean;
};

export type CreatorPayoutPreproductionWorkflowPreview = {
  amountCents: number;
  payoutType: CreatorPayoutRequestKind;
  scheduledFeeCents: number;
  instantFeeCents: number;
  totalFeeCents: number;
  testMode: true;
  dryRunEnabled: boolean;
  testWorkflowEnabled: boolean;
  stripeConnectTestEnabled: boolean;
  ownerApprovalRequired: true;
  adminReadOnly: true;
  productionExecutionAllowed: false;
  canCreateDryRunRequest: boolean;
  canExecuteTestTransfer: false;
  canExecuteProductionPayout: false;
  blockedReasons: string[];
  approvalSteps: string[];
  safetyLabel: string;
};

type CreatorPayoutLedgerDbRow = {
  id?: number | string | null;
  entry_type?: string | null;
  amount_minor?: number | null;
  currency?: string | null;
  status?: string | null;
  hold_reason?: string | null;
  hold_until?: string | null;
  created_at?: string | null;
  metadata?: unknown;
};

type CreatorPayoutQueryResult = {
  data: CreatorPayoutLedgerDbRow[] | null;
  count: number | null;
  error: unknown;
};

type CreatorPayoutEligibilityDbRow = {
  admin_review_status?: string | null;
  eligibility_reason?: string | null;
  eligibility_status?: string | null;
  eligible_for_payouts?: boolean | null;
  fraud_hold_active?: boolean | null;
  hold_period_cleared?: boolean | null;
  kyc_ready?: boolean | null;
  minimum_payout_met?: boolean | null;
  payout_account_ready?: boolean | null;
  provider_ready?: boolean | null;
  tax_ready?: boolean | null;
};

type CreatorPayoutEligibilityQueryResult = {
  data: CreatorPayoutEligibilityDbRow | null;
  error: unknown;
};

export type CreatorPayoutFunctionPayload = {
  account?: {
    charges_enabled?: boolean;
    details_submitted?: boolean;
    disabled_reason?: string | null;
    onboarding_status?: string;
    payouts_enabled?: boolean;
    provider_ready?: boolean;
    requirements_currently_due_count?: number;
    requirements_past_due_count?: number;
  };
  accountCreated?: boolean;
  accountReused?: boolean;
  accountSynced?: boolean;
  audit?: Record<string, unknown>;
  checkoutCreated?: boolean;
  creatorUserId?: string;
  error?: string;
  expires_at?: string | null;
  liveMoneyAction?: boolean;
  message?: string;
  mode?: string;
  onboardingUrlCreated?: boolean;
  onboarding_url?: string;
  payoutCreated?: boolean;
  provider?: string;
  providerAccountPresent?: boolean;
  providerCall?: boolean;
  providerKey?: string;
  providerWrite?: boolean;
  status?: string;
  transferCreated?: boolean;
};

type CreatorPayoutLimitBuilder = PromiseLike<CreatorPayoutQueryResult>;

type CreatorPayoutOrderBuilder = {
  limit: (limit: number) => CreatorPayoutLimitBuilder;
};

type CreatorPayoutFilterBuilder = {
  order: (column: string, options?: { ascending?: boolean }) => CreatorPayoutOrderBuilder;
};

type CreatorPayoutSelectBuilder = {
  eq: (column: string, value: string) => CreatorPayoutFilterBuilder;
};

type CreatorPayoutEligibilitySelectBuilder = {
  eq: (column: string, value: string) => {
    maybeSingle: () => PromiseLike<CreatorPayoutEligibilityQueryResult>;
  };
};

type CreatorPayoutFunctionResult<T> = {
  data: T | null;
  error: unknown;
};

const payoutClient = supabase as unknown as {
  from: (table: string) => {
    select: {
      (columns: string, options: { count: "exact" }): CreatorPayoutSelectBuilder;
      (columns: string): CreatorPayoutEligibilitySelectBuilder;
    };
  };
  functions: {
    invoke: <T>(
      name: string,
      options?: { body?: Record<string, unknown> },
    ) => Promise<CreatorPayoutFunctionResult<T>>;
  };
};

export const CREATOR_PAYOUT_REQUIREMENTS: readonly CreatorPayoutSetupRequirement[] = [
  { label: "Payout provider", value: "Stripe Connect later" },
  { label: "KYC", value: "Not available yet" },
  { label: "Tax forms", value: "Not available yet" },
  { label: "Payout account", value: "Not available yet" },
  { label: "Fraud review", value: "Required before release" },
  { label: "Hold period", value: "7–30 days" },
  { label: "Minimum payout", value: "Undecided" },
];

const normalizePositiveLimit = (value: unknown, fallback: number, max: number) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(normalized)));
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const normalizeAmountMinor = (value: unknown) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return 0;
  return Math.floor(normalized);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

export const formatCreatorPayoutLedgerCount = (value: number | null) => {
  if (value === null) return "Not available";
  return `${value} ${value === 1 ? "record" : "records"}`;
};

export const formatCreatorPayoutFoundationAmount = (amountMinor: number, currency: string) => {
  const code = String(currency || "usd").trim().toUpperCase();
  return `${code} ${(Math.max(0, amountMinor) / 100).toFixed(2)}`;
};

const formatEntryTypeLabel = (value: string) => {
  switch (value) {
    case "hold":
      return "Hold record";
    case "release":
      return "Release record";
    case "payout":
      return "Payout record";
    case "reversal":
      return "Reversal record";
    case "adjustment":
      return "Adjustment record";
    default:
      return "Ledger record";
  }
};

const formatStatusLabel = (value: string) => {
  switch (value) {
    case "pending":
      return "Pending record";
    case "held":
      return "Held record";
    case "available":
      return "Read-only record";
    case "scheduled":
      return "Scheduled record";
    case "paid":
      return "Read-only historical record";
    case "canceled":
      return "Canceled record";
    case "reversed":
      return "Reversed record";
    default:
      return value ? value.replaceAll("_", " ") : "Read-only record";
  }
};

const normalizeSetupStatus = (value: unknown): CreatorPayoutSetupStatus => {
  switch (normalizeText(value)) {
    case "setup_not_available":
      return "provider_not_configured";
    case "setup_required":
      return "setup_required";
    case "onboarding_in_progress":
      return "onboarding_in_progress";
    case "action_required":
      return "action_required";
    case "under_review":
      return "under_review";
    case "ready_for_payouts":
      return "provider_ready_payouts_not_active";
    case "on_hold":
      return "on_hold";
    case "payouts_disabled":
      return "payouts_disabled";
    case "not_active":
    case null:
      return "setup_required";
    default:
      return "setup_required";
  }
};

const formatSetupStatusLabel = (status: CreatorPayoutSetupStatus) => {
  switch (status) {
    case "provider_not_configured":
      return "Provider not configured";
    case "setup_required":
      return "Setup required";
    case "opening_setup_link":
      return "Opening setup";
    case "onboarding_in_progress":
      return "Onboarding in progress";
    case "action_required":
      return "Action required";
    case "under_review":
      return "Under review";
    case "provider_ready_payouts_not_active":
      return "Provider ready";
    case "on_hold":
      return "On hold";
    case "payouts_disabled":
      return "Payouts disabled";
    default:
      return "Not active yet";
  }
};

const formatSetupStatusBody = (
  status: CreatorPayoutSetupStatus,
  eligibilityReason: string | null,
) => {
  if (eligibilityReason) return eligibilityReason;

  switch (status) {
    case "provider_not_configured":
      return "Payout setup is not available yet.";
    case "setup_required":
      return "Set up the payout provider account when available. Withdrawals are still not active.";
    case "onboarding_in_progress":
      return "Continue provider setup. Withdrawals remain inactive.";
    case "action_required":
      return "The provider needs setup information before readiness can be reviewed.";
    case "under_review":
      return "Provider or platform review is pending. No payout action is available.";
    case "provider_ready_payouts_not_active":
      return "Payout provider readiness is available. Withdrawals are not active yet.";
    case "on_hold":
      return "A fraud, policy, or review hold is active. No payout action is available.";
    case "payouts_disabled":
      return "Provider or platform payouts are disabled. No payout action is available.";
    default:
      return "Creator payouts are not active yet.";
  }
};

const resolveSetupActionLabel = (status: CreatorPayoutSetupStatus) => {
  switch (status) {
    case "setup_required":
      return "Set up payouts";
    case "onboarding_in_progress":
      return "Continue setup";
    case "action_required":
      return "Update payout account";
    default:
      return null;
  }
};

const toCreatorPayoutSetupFields = (
  eligibility: CreatorPayoutEligibilityDbRow | null,
) => {
  const baseStatus = normalizeSetupStatus(eligibility?.eligibility_status);
  const status = eligibility?.fraud_hold_active
    ? "on_hold"
    : eligibility?.provider_ready
      ? "provider_ready_payouts_not_active"
      : baseStatus;
  const eligibilityReason = normalizeText(eligibility?.eligibility_reason);

  return {
    adminReviewStatus: normalizeText(eligibility?.admin_review_status),
    canRefreshProviderStatus: status !== "provider_not_configured",
    canStartProviderSetup: ["setup_required", "onboarding_in_progress", "action_required"].includes(status),
    eligibilityReason,
    eligibleForPayouts: eligibility?.eligible_for_payouts === true,
    fraudHoldActive: eligibility?.fraud_hold_active === true,
    holdPeriodCleared: eligibility?.hold_period_cleared === true,
    kycReady: eligibility?.kyc_ready === true,
    minimumPayoutMet: eligibility?.minimum_payout_met === true,
    payoutAccountReady: eligibility?.payout_account_ready === true,
    providerReady: eligibility?.provider_ready === true,
    setupActionLabel: resolveSetupActionLabel(status),
    setupStatus: status,
    setupStatusBody: formatSetupStatusBody(status, eligibilityReason),
    setupStatusLabel: formatSetupStatusLabel(status),
    taxReady: eligibility?.tax_ready === true,
  };
};

const toCreatorPayoutLedgerRow = (row: CreatorPayoutLedgerDbRow): CreatorPayoutLedgerFoundationRow | null => {
  const id = normalizeText(row.id);
  if (!id) return null;

  const entryType = normalizeText(row.entry_type) ?? "payable";
  const status = normalizeText(row.status) ?? "pending";
  const currency = normalizeText(row.currency) ?? "usd";
  const metadata = isPlainObject(row.metadata) ? row.metadata : {};

  return {
    id,
    status,
    statusLabel: formatStatusLabel(status),
    entryType,
    entryTypeLabel: formatEntryTypeLabel(entryType),
    amountMinor: normalizeAmountMinor(row.amount_minor),
    currency,
    createdAt: normalizeText(row.created_at),
    holdUntil: normalizeText(row.hold_until),
    holdReason: normalizeText(row.hold_reason),
    foundationOnly:
      metadata.creator_payout_dashboard_proof === true
      || metadata.finance_foundation_proof === true
      || metadata.foundation_only === true
      || metadata.not_live_money === true,
    notPayable: true,
  };
};

export function createEmptyCreatorPayoutDashboardReadModel(): CreatorPayoutDashboardReadModel {
  const setupFields = toCreatorPayoutSetupFields(null);

  return {
    status: "not_active",
    ...setupFields,
    ledgerConnected: false,
    ledgerRowCount: null,
    latestRows: [],
    generatedAt: new Date().toISOString(),
  };
}

async function readCreatorPayoutEligibility(creatorUserId: string) {
  const { data, error } = await payoutClient
    .from(CREATOR_PAYOUT_ELIGIBILITY_RECORDS_TABLE)
    .select(
      "eligibility_status,eligibility_reason,eligible_for_payouts,fraud_hold_active,hold_period_cleared,minimum_payout_met,payout_account_ready,tax_ready,kyc_ready,provider_ready,admin_review_status",
    )
    .eq("creator_user_id", creatorUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function readCreatorPayoutDashboardSummary(options: {
  creatorUserId: string | null | undefined;
  limit?: number;
}): Promise<CreatorPayoutDashboardReadModel> {
  const creatorUserId = String(options.creatorUserId ?? "").trim();
  const limit = normalizePositiveLimit(options.limit, 5, 12);

  if (!creatorUserId) {
    return createEmptyCreatorPayoutDashboardReadModel();
  }

  try {
    const eligibilityPromise = readCreatorPayoutEligibility(creatorUserId).catch(() => null);
    const { data, count, error } = await payoutClient
      .from(CREATOR_PAYOUT_LEDGER_ENTRIES_TABLE)
      .select(
        "id,entry_type,amount_minor,currency,status,hold_reason,hold_until,created_at,metadata",
        { count: "exact" },
      )
      .eq("creator_user_id", creatorUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const eligibility = await eligibilityPromise;
    const latestRows = (data ?? [])
      .map(toCreatorPayoutLedgerRow)
      .filter((row): row is CreatorPayoutLedgerFoundationRow => !!row);

    return {
      status: "not_active",
      ...toCreatorPayoutSetupFields(eligibility),
      ledgerConnected: true,
      ledgerRowCount: Number(count ?? latestRows.length),
      latestRows,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return createEmptyCreatorPayoutDashboardReadModel();
  }
}

const uniqueStrings = (values: readonly string[]) => Array.from(new Set(values.filter(Boolean)));

export function resolveCreatorPayoutReadiness(
  summary: CreatorPayoutDashboardReadModel,
  flags?: Pick<
    CreatorMonetizationRuntimeFlags,
    "cashoutEnabled" | "liveMoneyEnabled" | "payoutsEnabled" | "stripeConnectProductionEnabled"
  > | null,
): CreatorPayoutReadinessResolution {
  const liveMoneyEnabled = flags?.liveMoneyEnabled === true;
  const productionConnectEnabled = flags?.stripeConnectProductionEnabled === true;
  const payoutFeatureEnabled = flags?.payoutsEnabled === true && liveMoneyEnabled && productionConnectEnabled;
  const cashoutFeatureEnabled = flags?.cashoutEnabled === true && payoutFeatureEnabled;
  const taxOrKycPending = !summary.kycReady || !summary.taxReady;
  const providerRestricted =
    !summary.providerReady
    || ["action_required", "on_hold", "payouts_disabled", "setup_required"].includes(summary.setupStatus);
  const fraudOrDmcaHold = summary.fraudHoldActive;
  const suspendedAccount = summary.setupStatus === "payouts_disabled";
  const payoutFeatureDisabled = !payoutFeatureEnabled;
  const cashoutFeatureDisabled = !cashoutFeatureEnabled;
  const hasPayableFoundationState =
    summary.providerReady
    && summary.eligibleForPayouts
    && summary.minimumPayoutMet
    && summary.holdPeriodCleared
    && !taxOrKycPending
    && !providerRestricted
    && !fraudOrDmcaHold
    && !suspendedAccount;

  const blockedReasons = uniqueStrings([
    liveMoneyEnabled ? "" : "Live money is disabled.",
    productionConnectEnabled ? "" : "Production payout provider readiness is disabled.",
    payoutFeatureEnabled ? "" : "Payouts are disabled.",
    cashoutFeatureEnabled ? "" : "Cash-out is disabled.",
    summary.providerReady ? "" : "Payout provider readiness is not complete.",
    summary.eligibleForPayouts ? "" : "Creator payout eligibility is not approved.",
    summary.minimumPayoutMet ? "" : "Minimum payout is not met or not implemented.",
    summary.holdPeriodCleared ? "" : "Required payout hold period is not cleared.",
    summary.kycReady ? "" : "KYC readiness is pending.",
    summary.taxReady ? "" : "Tax/1099 readiness is pending.",
    fraudOrDmcaHold ? "Fraud, DMCA, or review hold blocks payout readiness." : "",
    suspendedAccount ? "Provider account is disabled or restricted." : "",
    "No payable balance can be created by the mobile app.",
  ]);

  const nextRequiredActions = uniqueStrings([
    summary.setupStatus === "setup_required" ? "Create or continue payout provider onboarding." : "",
    summary.setupStatus === "onboarding_in_progress" ? "Finish Stripe Connect onboarding." : "",
    summary.setupStatus === "action_required" ? "Resolve provider-required account information." : "",
    taxOrKycPending ? "Complete provider-backed KYC/tax readiness before payouts." : "",
    summary.minimumPayoutMet ? "" : "Wait for a real provider-backed payable balance and minimum payout rule.",
    summary.holdPeriodCleared ? "" : "Wait for the configured hold period to clear.",
    liveMoneyEnabled && productionConnectEnabled ? "" : "Complete provider, legal, tax, and Owner approval before live payouts.",
  ]);

  const canReceivePayouts = hasPayableFoundationState && payoutFeatureEnabled;

  return {
    canReceivePayouts,
    canRequestScheduledPayout: canReceivePayouts,
    canRequestInstantCashout: canReceivePayouts && cashoutFeatureEnabled,
    blockedReasons,
    nextRequiredActions,
    taxOrKycPending,
    providerRestricted,
    fraudOrDmcaHold,
    suspendedAccount,
    liveMoneyDisabled: !liveMoneyEnabled,
    payoutFeatureDisabled,
    cashoutFeatureDisabled,
    scheduledPayoutFeeCents: calculateScheduledPayoutFeeCents(),
    instantCashoutFeeBps: CREATOR_INSTANT_CASHOUT_FEE_BPS,
    instantCashoutHasDefaultCap: CREATOR_INSTANT_CASHOUT_FEE_CAP_CENTS !== null,
  };
}

export function previewCreatorPayoutPreproductionWorkflow(
  summary: CreatorPayoutDashboardReadModel,
  input: {
    amountCents: number;
    payoutType: CreatorPayoutRequestKind;
  },
  flags?: Pick<
    CreatorMonetizationRuntimeFlags,
    "cashoutEnabled" | "liveMoneyEnabled" | "payoutsEnabled" | "stripeConnectProductionEnabled"
  > | null,
): CreatorPayoutPreproductionWorkflowPreview {
  const amountCents = Math.max(0, Math.trunc(Number.isFinite(input.amountCents) ? input.amountCents : 0));
  const payoutType = input.payoutType === "instant" ? "instant" : "scheduled";
  const readiness = resolveCreatorPayoutReadiness(summary, flags);
  const scheduledFeeCents = calculateScheduledPayoutFeeCents();
  const instantFeeCents = payoutType === "instant" ? Math.ceil((amountCents * CREATOR_INSTANT_CASHOUT_FEE_BPS) / 10_000) : 0;
  const blockedReasons = uniqueStrings([
    readiness.liveMoneyDisabled ? "Production live money is disabled." : "",
    readiness.payoutFeatureDisabled ? "Production payout execution is disabled." : "",
    payoutType === "instant" && readiness.cashoutFeatureDisabled ? "Production cash-out execution is disabled." : "",
    STRIPE_CONNECT_TEST_ENABLED ? "" : "Payout provider setup is disabled.",
    TEST_PAYOUT_WORKFLOW_ENABLED ? "" : "Payout setup review is disabled.",
    PAYOUT_DRY_RUN_ENABLED ? "" : "Payout setup preview is disabled.",
    amountCents > 0 ? "" : "A positive payout amount is required.",
    summary.providerReady ? "" : "Payout provider readiness is not complete.",
    summary.kycReady ? "" : "KYC readiness is pending.",
    summary.taxReady ? "" : "Tax/1099 readiness is pending.",
    summary.minimumPayoutMet ? "" : "Minimum payout is not met by a real provider-backed balance.",
    summary.holdPeriodCleared ? "" : "Payout hold period has not cleared.",
    summary.eligibleForPayouts ? "" : "Creator payout eligibility is not approved.",
    "Owner approval is required before any payout execution can move forward.",
    "No production transfer or bank payout is allowed from this preview.",
  ]);

  const canCreateDryRunRequest =
    PAYOUT_DRY_RUN_ENABLED
    && TEST_PAYOUT_WORKFLOW_ENABLED
    && STRIPE_CONNECT_TEST_ENABLED
    && amountCents > 0;

  return {
    amountCents,
    payoutType,
    scheduledFeeCents,
    instantFeeCents,
    totalFeeCents: payoutType === "instant" ? instantFeeCents : scheduledFeeCents,
    testMode: true,
    dryRunEnabled: PAYOUT_DRY_RUN_ENABLED,
    testWorkflowEnabled: TEST_PAYOUT_WORKFLOW_ENABLED,
    stripeConnectTestEnabled: STRIPE_CONNECT_TEST_ENABLED,
    ownerApprovalRequired: true,
    adminReadOnly: true,
    productionExecutionAllowed: false,
    canCreateDryRunRequest,
    canExecuteTestTransfer: false,
    canExecuteProductionPayout: false,
    blockedReasons,
    approvalSteps: [
      "Creator payout or cash-out setup can be reviewed before any money moves.",
      "Server checks derived available balance, Connect readiness, KYC, tax/1099, holds, and minimum payout.",
      "Admin can review readiness but cannot release money.",
      "Owner approval is required before any later execution workflow.",
      "Production execution remains blocked until provider, legal/accounting, and payout readiness are approved.",
    ],
    safetyLabel: "SETUP CHECK ONLY",
  };
}

const assertSafePayoutFunctionPayload = (payload: CreatorPayoutFunctionPayload | null) => {
  if (!payload) return;
  if (payload.liveMoneyAction !== false) {
    throw new Error("Unexpected payout provider response shape.");
  }
  if (payload.payoutCreated || payload.transferCreated || payload.checkoutCreated) {
    throw new Error("Unexpected live money action response.");
  }
  if (payload.mode && payload.mode !== "test") {
    throw new Error("Only payout provider setup preview mode is supported.");
  }
};

async function invokeCreatorPayoutFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<CreatorPayoutFunctionPayload> {
  const { data, error } = await payoutClient.functions.invoke<CreatorPayoutFunctionPayload>(name, { body });
  if (error) {
    throw new Error("Payout provider setup request failed.");
  }
  assertSafePayoutFunctionPayload(data);
  return data ?? { liveMoneyAction: false, mode: "test", status: "unknown" };
}

export async function createOrReuseCreatorPayoutProviderAccount(creatorUserId: string) {
  return invokeCreatorPayoutFunction("stripe-connect-account", {
    creator_user_id: creatorUserId,
    requested_account_type: "express",
  });
}

export async function createCreatorPayoutOnboardingLink(options: {
  creatorUserId: string;
  returnUrl: string;
  refreshUrl: string;
}) {
  return invokeCreatorPayoutFunction("stripe-connect-onboarding-link", {
    creator_user_id: options.creatorUserId,
    return_url: options.returnUrl,
    refresh_url: options.refreshUrl,
  });
}

export async function syncCreatorPayoutProviderStatus(creatorUserId: string) {
  return invokeCreatorPayoutFunction("stripe-connect-account-sync", {
    creator_user_id: creatorUserId,
  });
}
