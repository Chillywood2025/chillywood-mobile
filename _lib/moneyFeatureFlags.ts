import { supabase } from "./supabase";

export type MoneyFeatureFlagState = "off" | "on" | "locked" | "maintenance" | "sandbox_only";

export type MoneyFeatureFlagKey =
  | "money_center_visible"
  | "digital_sales_enabled"
  | "tips_enabled"
  | "watch_party_tickets_enabled"
  | "watch_party_seats_enabled"
  | "live_watch_party_access_enabled"
  | "live_watch_party_seats_enabled"
  | "paid_content_enabled"
  | "merch_enabled"
  | "creator_balance_visible"
  | "payouts_enabled"
  | "stripe_connect_enabled"
  | "revenuecat_google_play_enabled"
  | "provider_webhooks_enabled"
  | "live_money_enabled"
  | "creator_monetization_enabled"
  | "creator_revenue_imports_enabled"
  | "tax_kyc_collection_enabled"
  | "ads_revenue_enabled"
  | "sponsorships_enabled";

export type MoneyFeatureFlagSummaryRow = {
  key: MoneyFeatureFlagKey;
  state: MoneyFeatureFlagState;
  displayLabel: string;
  displaySummary: string;
  updatedAt: string | null;
  publicSafe: boolean;
};

export type PlatformMoneyKillSwitchRow = {
  key: MoneyFeatureFlagKey;
  state: MoneyFeatureFlagState;
  displayLabel: string;
  description: string;
  reason: string;
  ownerOnlyReason: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  latestAuditAt: string | null;
  latestAuditReason: string | null;
};

export type PlatformMoneyKillSwitchAuditRow = {
  id: string;
  actorUserId: string | null;
  switchKey: MoneyFeatureFlagKey;
  oldState: MoneyFeatureFlagState | null;
  newState: MoneyFeatureFlagState;
  reason: string;
  createdAt: string | null;
};

type MoneyFeatureFlagDbRow = {
  key?: unknown;
  state?: unknown;
  display_label?: unknown;
  display_summary?: unknown;
  updated_at?: unknown;
  public_safe?: unknown;
};

type PlatformMoneyKillSwitchDbRow = {
  key?: unknown;
  state?: unknown;
  display_label?: unknown;
  description?: unknown;
  reason?: unknown;
  owner_only_reason?: unknown;
  updated_by?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
  latest_audit_at?: unknown;
  latest_audit_reason?: unknown;
};

type PlatformMoneyKillSwitchAuditDbRow = {
  id?: unknown;
  actor_user_id?: unknown;
  switch_key?: unknown;
  old_state?: unknown;
  new_state?: unknown;
  reason?: unknown;
  created_at?: unknown;
};

type MoneyFeatureFlagRpcResult<T> = {
  data: T | null;
  error: unknown;
};

const moneyFlagClient = supabase as unknown as {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<MoneyFeatureFlagRpcResult<T>>;
};

export const MONEY_FEATURE_FLAG_KEYS: readonly MoneyFeatureFlagKey[] = [
  "money_center_visible",
  "digital_sales_enabled",
  "tips_enabled",
  "watch_party_tickets_enabled",
  "watch_party_seats_enabled",
  "live_watch_party_access_enabled",
  "live_watch_party_seats_enabled",
  "paid_content_enabled",
  "merch_enabled",
  "creator_balance_visible",
  "payouts_enabled",
  "stripe_connect_enabled",
  "revenuecat_google_play_enabled",
  "provider_webhooks_enabled",
  "live_money_enabled",
  "creator_monetization_enabled",
  "creator_revenue_imports_enabled",
  "tax_kyc_collection_enabled",
  "ads_revenue_enabled",
  "sponsorships_enabled",
];

export const MONEY_FEATURE_FLAG_DEFAULT_STATES: Record<MoneyFeatureFlagKey, MoneyFeatureFlagState> = {
  money_center_visible: "on",
  digital_sales_enabled: "off",
  tips_enabled: "off",
  watch_party_tickets_enabled: "off",
  watch_party_seats_enabled: "off",
  live_watch_party_access_enabled: "off",
  live_watch_party_seats_enabled: "off",
  paid_content_enabled: "off",
  merch_enabled: "off",
  creator_balance_visible: "on",
  payouts_enabled: "off",
  stripe_connect_enabled: "sandbox_only",
  revenuecat_google_play_enabled: "sandbox_only",
  provider_webhooks_enabled: "sandbox_only",
  live_money_enabled: "off",
  creator_monetization_enabled: "sandbox_only",
  creator_revenue_imports_enabled: "off",
  tax_kyc_collection_enabled: "off",
  ads_revenue_enabled: "off",
  sponsorships_enabled: "off",
};

const MONEY_FEATURE_FLAG_LABELS: Record<MoneyFeatureFlagKey, string> = {
  money_center_visible: "Money Center visible",
  digital_sales_enabled: "Digital sales",
  tips_enabled: "Tips",
  watch_party_tickets_enabled: "Watch-Party Seat Passes",
  watch_party_seats_enabled: "Watch-Party seats",
  live_watch_party_access_enabled: "Live Watch-Party access",
  live_watch_party_seats_enabled: "Live Watch-Party seats",
  paid_content_enabled: "Paid content",
  merch_enabled: "Merch",
  creator_balance_visible: "Creator balance visible",
  payouts_enabled: "Payouts",
  stripe_connect_enabled: "Stripe Connect",
  revenuecat_google_play_enabled: "RevenueCat / Google Play",
  provider_webhooks_enabled: "Provider webhooks",
  live_money_enabled: "Live money",
  creator_monetization_enabled: "Creator monetization",
  creator_revenue_imports_enabled: "Revenue imports",
  tax_kyc_collection_enabled: "Tax and KYC collection",
  ads_revenue_enabled: "Ad revenue",
  sponsorships_enabled: "Sponsorships",
};

const MONEY_FEATURE_FLAG_DESCRIPTIONS: Record<MoneyFeatureFlagKey, string> = {
  money_center_visible: "Controls whether creators can see the consolidated Money Center surface.",
  digital_sales_enabled: "Controls paid digital access claims and sale controls.",
  tips_enabled: "Controls creator-support tip products and tip checkout claims.",
  watch_party_tickets_enabled: "Controls paid Watch-Party Live Seat Pass claims and sale controls.",
  watch_party_seats_enabled: "Controls paid Watch-Party seat access claims and sale controls.",
  live_watch_party_access_enabled: "Controls paid Live Watch-Party / Live Stage entry access pass claims and sale controls.",
  live_watch_party_seats_enabled: "Controls paid Live Watch-Party / Live Stage seat eligibility claims and sale controls.",
  paid_content_enabled: "Controls paid videos, posts, collections, and digital content access claims.",
  merch_enabled: "Controls physical merch checkout and merch-order claims.",
  creator_balance_visible: "Controls the read-only creator balance section.",
  payouts_enabled: "Controls payout and cash-out availability claims.",
  stripe_connect_enabled: "Controls Stripe Connect setup/readiness surfaces.",
  revenuecat_google_play_enabled: "Controls store readiness surfaces for Android digital purchases.",
  provider_webhooks_enabled: "Controls provider webhook processing beyond audit/readiness.",
  live_money_enabled: "Global switch for production money movement and live money claims.",
  creator_monetization_enabled: "Optional global scaffold for creator monetization readiness.",
  creator_revenue_imports_enabled: "Optional switch for provider-backed creator revenue imports.",
  tax_kyc_collection_enabled: "Optional switch for live tax/KYC collection workflows.",
  ads_revenue_enabled: "Optional switch for creator ad revenue sharing.",
  sponsorships_enabled: "Optional switch for creator sponsorship money tools.",
};

const STATES = new Set<MoneyFeatureFlagState>(["off", "on", "locked", "maintenance", "sandbox_only"]);
const KEYS = new Set<MoneyFeatureFlagKey>(MONEY_FEATURE_FLAG_KEYS);

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeKey = (value: unknown): MoneyFeatureFlagKey | null => {
  const key = normalizeText(value) as MoneyFeatureFlagKey;
  return KEYS.has(key) ? key : null;
};

const normalizeState = (value: unknown): MoneyFeatureFlagState => {
  const state = normalizeText(value) as MoneyFeatureFlagState;
  return STATES.has(state) ? state : "off";
};

export const getMoneyFeatureStateLabel = (state: MoneyFeatureFlagState) => {
  if (state === "on") return "Active";
  if (state === "sandbox_only") return "Sandbox ready";
  if (state === "locked") return "Blocked";
  if (state === "maintenance") return "Disabled";
  return "Disabled";
};

export const getMoneyFeaturePublicSummary = (state: MoneyFeatureFlagState) => {
  if (state === "on") return "Available only when provider checks also pass.";
  if (state === "sandbox_only") return "Sandbox checks can be reviewed, but live money is not active.";
  if (state === "maintenance") return "Temporarily unavailable.";
  if (state === "locked") return "This money feature is unavailable.";
  return "Turned off by owner.";
};

const toSummaryRow = (row: MoneyFeatureFlagDbRow): MoneyFeatureFlagSummaryRow | null => {
  const key = normalizeKey(row.key);
  if (!key) return null;
  const state = normalizeState(row.state);
  return {
    key,
    state,
    displayLabel: normalizeText(row.display_label) || getMoneyFeatureStateLabel(state),
    displaySummary: normalizeText(row.display_summary) || getMoneyFeaturePublicSummary(state),
    updatedAt: normalizeText(row.updated_at) || null,
    publicSafe: row.public_safe !== false,
  };
};

const toKillSwitchRow = (row: PlatformMoneyKillSwitchDbRow): PlatformMoneyKillSwitchRow | null => {
  const key = normalizeKey(row.key);
  if (!key) return null;
  const state = normalizeState(row.state);
  return {
    key,
    state,
    displayLabel: normalizeText(row.display_label) || MONEY_FEATURE_FLAG_LABELS[key],
    description: normalizeText(row.description) || MONEY_FEATURE_FLAG_DESCRIPTIONS[key],
    reason: normalizeText(row.reason) || getMoneyFeaturePublicSummary(state),
    ownerOnlyReason: normalizeText(row.owner_only_reason) || null,
    updatedBy: normalizeText(row.updated_by) || null,
    updatedAt: normalizeText(row.updated_at) || null,
    createdAt: normalizeText(row.created_at) || null,
    latestAuditAt: normalizeText(row.latest_audit_at) || null,
    latestAuditReason: normalizeText(row.latest_audit_reason) || null,
  };
};

const toAuditRow = (row: PlatformMoneyKillSwitchAuditDbRow): PlatformMoneyKillSwitchAuditRow | null => {
  const switchKey = normalizeKey(row.switch_key);
  if (!switchKey) return null;
  const id = normalizeText(row.id);
  if (!id) return null;
  return {
    id,
    actorUserId: normalizeText(row.actor_user_id) || null,
    switchKey,
    oldState: row.old_state === null || row.old_state === undefined ? null : normalizeState(row.old_state),
    newState: normalizeState(row.new_state),
    reason: normalizeText(row.reason) || "No reason returned.",
    createdAt: normalizeText(row.created_at) || null,
  };
};

export const getMoneyFeatureFlagFallbackSummary = (): MoneyFeatureFlagSummaryRow[] => (
  MONEY_FEATURE_FLAG_KEYS.map((key) => {
    const state = MONEY_FEATURE_FLAG_DEFAULT_STATES[key];
    return {
      key,
      state,
      displayLabel: getMoneyFeatureStateLabel(state),
      displaySummary: getMoneyFeaturePublicSummary(state),
      updatedAt: null,
      publicSafe: true,
    };
  })
);

export const getPlatformMoneyKillSwitchFallbackRows = (): PlatformMoneyKillSwitchRow[] => (
  MONEY_FEATURE_FLAG_KEYS.map((key) => {
    const state = MONEY_FEATURE_FLAG_DEFAULT_STATES[key];
    return {
      key,
      state,
      displayLabel: MONEY_FEATURE_FLAG_LABELS[key],
      description: MONEY_FEATURE_FLAG_DESCRIPTIONS[key],
      reason: getMoneyFeaturePublicSummary(state),
      ownerOnlyReason: null,
      updatedBy: null,
      updatedAt: null,
      createdAt: null,
      latestAuditAt: null,
      latestAuditReason: null,
    };
  })
);

export async function readMoneyFeatureFlagSummary(): Promise<MoneyFeatureFlagSummaryRow[]> {
  try {
    const { data, error } = await moneyFlagClient.rpc<MoneyFeatureFlagDbRow[]>(
      "get_money_feature_flags_summary",
    );
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : [])
      .map(toSummaryRow)
      .filter((row): row is MoneyFeatureFlagSummaryRow => !!row)
      .filter((row) => row.publicSafe);
    return rows.length ? rows : getMoneyFeatureFlagFallbackSummary();
  } catch {
    return getMoneyFeatureFlagFallbackSummary();
  }
}

export async function readPlatformMoneyKillSwitches(): Promise<PlatformMoneyKillSwitchRow[]> {
  const { data, error } = await moneyFlagClient.rpc<PlatformMoneyKillSwitchDbRow[]>(
    "get_platform_money_kill_switches",
  );
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : [])
    .map(toKillSwitchRow)
    .filter((row): row is PlatformMoneyKillSwitchRow => !!row);
  return rows.length ? rows : getPlatformMoneyKillSwitchFallbackRows();
}

export async function listPlatformMoneyKillSwitchAudit(limit = 25): Promise<PlatformMoneyKillSwitchAuditRow[]> {
  const { data, error } = await moneyFlagClient.rpc<PlatformMoneyKillSwitchAuditDbRow[]>(
    "list_platform_money_kill_switch_audit",
    { p_limit: limit },
  );
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map(toAuditRow)
    .filter((row): row is PlatformMoneyKillSwitchAuditRow => !!row);
}

export async function setPlatformMoneyKillSwitchState(input: {
  key: MoneyFeatureFlagKey;
  state: MoneyFeatureFlagState;
  reason: string;
  ownerOnlyReason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<unknown> {
  const { data, error } = await moneyFlagClient.rpc("set_platform_money_kill_switch_state", {
    p_key: input.key,
    p_state: input.state,
    p_reason: input.reason,
    p_owner_only_reason: input.ownerOnlyReason ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw error;
  return data;
}

export const getMoneyFeatureFlag = (
  rows: readonly MoneyFeatureFlagSummaryRow[],
  key: MoneyFeatureFlagKey,
): MoneyFeatureFlagSummaryRow => (
  rows.find((row) => row.key === key) ?? getMoneyFeatureFlagFallbackSummary().find((row) => row.key === key)!
);

export const getPlatformMoneyKillSwitch = (
  rows: readonly PlatformMoneyKillSwitchRow[],
  key: MoneyFeatureFlagKey,
): PlatformMoneyKillSwitchRow => (
  rows.find((row) => row.key === key) ?? getPlatformMoneyKillSwitchFallbackRows().find((row) => row.key === key)!
);

export const isMoneyFeatureSandboxOrOn = (state: MoneyFeatureFlagState) => (
  state === "on" || state === "sandbox_only"
);

export const isMoneyFeatureLiveOn = (state: MoneyFeatureFlagState) => state === "on";
