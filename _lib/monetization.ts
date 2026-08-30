import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CustomerInfo, PurchasesOffering, PurchasesPackage, PurchasesOfferings } from "react-native-purchases";
import { Platform } from "react-native";

import { trackEvent } from "./analytics";
import {
  getCurrentAccountSessionAuthoritySnapshot,
  readCurrentAccountSessionAuthority,
  sameAccountSessionAuthority,
  subscribeToAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";
import { FEATURE_FLAGS, getAppMonetizationRuntimeFeatures } from "./featureFlags";
import { debugLog, reportRuntimeError } from "./logger";
import {
  getMoneyFeatureFlag,
  readMoneyFeatureFlagSummaryWithStatus,
  type MoneyFeatureFlagState,
} from "./moneyFeatureFlags";
import {
  canMakeRevenueCatPurchases,
  configureRevenueCatOnce,
  openRevenueCatManageSubscriptions,
  purchaseRevenueCatPackage,
  readRevenueCatCustomerInfo,
  readRevenueCatOfferings,
  restoreRevenueCatPurchases,
  syncRevenueCatCustomerIdentity,
  type RevenueCatConfigurationState,
} from "./revenuecat";
import type { Tables, TablesInsert } from "../supabase/database.types";
import {
  readCurrentUserEntitlements,
  type PremiumEntitlementDecision,
  type PremiumEntitlementKey,
} from "./premiumEntitlements";
import { resolveAlternativeEntitlementAuthority, withAuthorityReadDeadline, type EntitlementAuthorityState } from "./entitlementAuthority";
import { hasPlatformRoleMembership, readMyPlatformRoleMemberships } from "./moderation";
import { getRuntimeConfig, isBetaOperatorIdentity } from "./runtimeConfig";
import { supabase } from "./supabase";
import {
  isRevenueCatUserCancellation,
  pollProviderAuthority,
} from "./revenuecatPurchaseClosure";

export type PlanTier = "free" | "premium";
export const PREMIUM_PURCHASE_AUTHORITY_POLL_ATTEMPTS = 12;
export const PREMIUM_PURCHASE_AUTHORITY_POLL_DELAY_MS = 1250;
export type MonetizationAccessRule = "open" | "party_pass" | "premium";
export type TitleAccessRule = "open" | "premium";
export type SponsorPlacement = "none" | "detail_banner" | "player_banner";

export type UserPlan = {
  tier: PlanTier;
  adFree: boolean;
  watchPartyPerks: boolean;
  updatedAt: number;
  ownerPlatformAccess?: boolean;
  accessSource?: "entitlement" | "owner_platform_access" | "local_legacy";
};

export type AdMode = "none" | "pre-roll" | "mid-roll" | "banner";

export type CreatorPermissionSet = {
  userId: string;
  canUsePartyPassRooms: boolean;
  canUsePremiumRooms: boolean;
  canPublishPremiumTitles: boolean;
  canUseSponsorPlacements: boolean;
  canUsePlayerAds: boolean;
  updatedAt: number;
};

export type ContentAccessReason = "allowed" | "entitlement_unknown" | "party_pass_required" | "premium_required";

export type ContentAccessDecision = {
  allowed: boolean;
  reason: ContentAccessReason;
  accessRule: MonetizationAccessRule;
  requiresPremium: boolean;
  requiresPartyPass: boolean;
  accessKey?: string;
  plan: UserPlan;
  monetization: MonetizationGateResolution;
};

export type MonetizationTargetId =
  | "premium_subscription"
  | "paid_title_access"
  | "premium_live_access"
  | "premium_watch_party_access";

export type MonetizationTargetKind = "subscription" | "one_time_unlock";

export type MonetizationTargetDefinition = {
  id: MonetizationTargetId;
  label: string;
  summary: string;
  kind: MonetizationTargetKind;
  offeringId: string;
  entitlementIds: string[];
  accessRule: MonetizationAccessRule;
};

export type MonetizationTargetState = {
  definition: MonetizationTargetDefinition;
  status: "entitled" | "available" | "unavailable" | "unknown";
  hasEntitlement: boolean;
  entitlementAuthoritative: boolean;
  entitlementState: EntitlementAuthorityState;
  offeringAvailable: boolean;
  configuredOfferingId: string;
  resolvedOfferingId: string | null;
  offeringResolution: "configured" | "fallback" | "missing";
  packageCount: number;
  availablePackageIds: string[];
  recommendedPackageId?: string;
};

export type MonetizationGateResolution = {
  primaryTargetId?: MonetizationTargetId;
  purchaseTargetId?: MonetizationTargetId;
  qualifyingTargetIds: MonetizationTargetId[];
  entitledTargetIds: MonetizationTargetId[];
  availableTargetIds: MonetizationTargetId[];
  recommendedPackageId?: string;
  canPurchase: boolean;
  entitlementAuthorityAvailable: boolean;
  entitlementState: EntitlementAuthorityState;
  ownerPlatformAccess?: boolean;
  snapshotStatus: "disabled" | "ready" | "store_unavailable" | "partial";
  issues: string[];
};

export type MonetizationSnapshot = {
  status: "disabled" | "ready" | "store_unavailable" | "partial";
  configuration: RevenueCatConfigurationState;
  userId: string | null;
  revenueCatAppUserId: string;
  isAnonymousCustomer: boolean;
  canMakePayments: boolean;
  customerInfoLoaded: boolean;
  offeringsLoaded: boolean;
  currentOfferingId: string | null;
  availableOfferingIds: string[];
  activeEntitlementIds: string[];
  activeProductIds: string[];
  targets: Record<MonetizationTargetId, MonetizationTargetState>;
  issues: string[];
  updatedAt: number;
};

export type MonetizationPurchaseOutcome = {
  ok: boolean;
  target: MonetizationTargetId;
  snapshot: MonetizationSnapshot;
  customerInfo: CustomerInfo | null;
  message: string;
  packageId?: string;
  productId?: string;
};

export type MonetizationRestoreOutcome = {
  ok: boolean;
  snapshot: MonetizationSnapshot;
  customerInfo: CustomerInfo | null;
  message: string;
};

export type MonetizationAccessSheetPresentation = {
  kicker: string;
  title: string;
  body: string;
  actionLabel: string;
};

export type MonetizationAccessSheetAction = "purchase" | "retry";

export type MonetizationAccessSheetStatusTone = "neutral" | "warning";

export type MonetizationAccessSheetOffer = {
  title: string;
  priceLabel: string;
  detail: string;
  caption?: string;
  badge?: string;
  packageId?: string;
};

export type MonetizationAccessSheetState = {
  snapshot: MonetizationSnapshot;
  presentation: MonetizationAccessSheetPresentation;
  primaryAction: MonetizationAccessSheetAction;
  primaryLabel: string;
  primaryDisabled: boolean;
  helperKicker: string;
  helperBody: string;
  helperTone: MonetizationAccessSheetStatusTone;
  offer: MonetizationAccessSheetOffer | null;
  canRestore: boolean;
  canManage: boolean;
};

export type MonetizationPurchaseMode = "public" | "internal_tester_sandbox";

export type InternalTesterSandboxPurchaseModeState = {
  enabled: boolean;
  mode: MonetizationPurchaseMode;
  label: string;
  reason: string;
  allowedRoles: string[];
  liveMoneyEnabled: boolean;
  payoutsEnabled: boolean;
  cashoutEnabled: boolean;
  providerSandboxCandidate: boolean;
  storePurchaseRailState: MoneyFeatureFlagState;
  storePurchaseRailReadbackComplete: boolean;
};

export type MonetizationAccessPurchaseOutcome = {
  ok: boolean;
  targetId?: MonetizationTargetId;
  snapshot: MonetizationSnapshot;
  customerInfo: CustomerInfo | null;
  message: string;
  packageId?: string;
  productId?: string;
};

type MonetizationAccessPolicy = {
  primaryTargetId?: MonetizationTargetId;
  qualifyingTargetIds: MonetizationTargetId[];
};

type GateLike = {
  reason?: string | null;
  monetization?: MonetizationGateResolution | null;
};

type CreatorPermissionRow = Tables<"creator_permissions">;
type CreatorPermissionInsert = TablesInsert<"creator_permissions">;

const USER_PLAN_KEY = "@chillywood/user-plan";
const SUBSCRIPTIONS_TABLE = "user_subscriptions";
const CREATOR_PERMISSIONS_TABLE = "creator_permissions";

const defaultPlan: UserPlan = {
  tier: "free",
  adFree: false,
  watchPartyPerks: false,
  updatedAt: Date.now(),
};

const MONETIZATION_TARGETS: Record<MonetizationTargetId, MonetizationTargetDefinition> = {
  premium_subscription: {
    id: "premium_subscription",
    label: "Chi'llywood Premium",
    summary: "Subscription-based premium access for premium titles, premium live, and ad-free playback.",
    kind: "subscription",
    offeringId: "premium",
    entitlementIds: ["premium"],
    accessRule: "premium",
  },
  paid_title_access: {
    id: "paid_title_access",
    label: "Title Unlock",
    summary: "Reserved for later direct title unlocks. Current premium titles still resolve through Chi'llywood Premium on current public routes.",
    kind: "one_time_unlock",
    offeringId: "paid-content",
    entitlementIds: ["paid_content"],
    accessRule: "premium",
  },
  premium_live_access: {
    id: "premium_live_access",
    label: "Premium Live Access",
    summary: "Reserved for later live-entry monetization. Current premium live entry still resolves through Chi'llywood Premium on current public routes.",
    kind: "one_time_unlock",
    offeringId: "premium-live",
    entitlementIds: ["premium_live", "premium"],
    accessRule: "premium",
  },
  premium_watch_party_access: {
    id: "premium_watch_party_access",
    label: "Watch-Party Seat Pass Access",
    summary: "Watch-Party Seat Pass room access for watch-party entry, while active Premium can still satisfy the same gate where that entitlement already applies.",
    kind: "one_time_unlock",
    offeringId: "premium-watch-party",
    entitlementIds: ["premium_watch_party", "premium"],
    accessRule: "party_pass",
  },
};

const PREMIUM_SUBSCRIPTION_TARGET_IDS: MonetizationTargetId[] = ["premium_subscription"];
const TITLE_ACCESS_TARGET_IDS: MonetizationTargetId[] = ["paid_title_access", "premium_subscription"];
const LIVE_ACCESS_TARGET_IDS: MonetizationTargetId[] = ["premium_live_access", "premium_subscription"];
const WATCH_PARTY_ACCESS_TARGET_IDS: MonetizationTargetId[] = ["premium_watch_party_access", "premium_subscription"];
const INVALID_IDENTITY_LITERALS = new Set(["null", "undefined"]);

export const PREMIUM_PURCHASE_SHELL_ON_HOLD = true;
export const ANDROID_PREMIUM_PURCHASE_SHELL_HOLD_MESSAGE =
  "Premium purchase is temporarily unavailable while Google Play and RevenueCat setup is verified.";
export const IOS_PREMIUM_PURCHASE_SHELL_HOLD_MESSAGE =
  "Premium purchase is temporarily unavailable while App Store and RevenueCat setup is verified.";
export const PREMIUM_PURCHASE_SHELL_HOLD_MESSAGE =
  Platform.OS === "ios"
    ? IOS_PREMIUM_PURCHASE_SHELL_HOLD_MESSAGE
    : ANDROID_PREMIUM_PURCHASE_SHELL_HOLD_MESSAGE;
export const INTERNAL_TESTER_SANDBOX_PURCHASE_MODE = "internal_tester_sandbox" satisfies MonetizationPurchaseMode;
export const INTERNAL_TESTER_SANDBOX_PURCHASE_MODE_LABEL = "Provider sandbox purchases";
export const ANDROID_INTERNAL_TESTER_SANDBOX_PURCHASE_COPY =
  "Provider-backed sandbox purchase through Google Play / RevenueCat. No production money, payouts, cash-out, withdrawal, transfer, or payable balance is enabled.";
export const IOS_INTERNAL_TESTER_SANDBOX_PURCHASE_COPY =
  "Provider-backed sandbox purchase through App Store / RevenueCat. No production money, payouts, cash-out, withdrawal, transfer, or payable balance is enabled.";
export const INTERNAL_TESTER_SANDBOX_PURCHASE_COPY =
  Platform.OS === "ios"
    ? IOS_INTERNAL_TESTER_SANDBOX_PURCHASE_COPY
    : ANDROID_INTERNAL_TESTER_SANDBOX_PURCHASE_COPY;

const revenueCatStoreLabel = () => Platform.OS === "ios" ? "App Store / RevenueCat" : "Google Play / RevenueCat";
const storePurchasesEnabledForPlatform = () => (
  Platform.OS !== "ios" || getRuntimeConfig().revenueCat.appStorePurchasesEnabled === true
);

export const isPremiumPurchaseShellAvailable = () => {
  const runtime = getAppMonetizationRuntimeFeatures();
  return FEATURE_FLAGS.monetization.subscriptions
    && runtime.premiumEnabled
    && storePurchasesEnabledForPlatform()
    && !PREMIUM_PURCHASE_SHELL_ON_HOLD;
};

export const isPremiumPurchaseShellAvailableForMode = (
  mode: MonetizationPurchaseMode = "public",
) => {
  if (isPremiumPurchaseShellAvailable()) return true;
  const runtime = getAppMonetizationRuntimeFeatures();
  return mode === INTERNAL_TESTER_SANDBOX_PURCHASE_MODE
    && FEATURE_FLAGS.monetization.subscriptions
    && runtime.premiumEnabled
    && storePurchasesEnabledForPlatform()
    && !runtime.liveMoneyEnabled
    && !runtime.payoutsEnabled
    && !runtime.cashoutEnabled;
};

const getPurchaseModeFromOption = (mode?: MonetizationPurchaseMode | null): MonetizationPurchaseMode => (
  mode === INTERNAL_TESTER_SANDBOX_PURCHASE_MODE ? INTERNAL_TESTER_SANDBOX_PURCHASE_MODE : "public"
);

export async function resolveInternalTesterSandboxPurchaseMode(options?: {
  userId?: string | null;
  email?: string | null;
  betaAccessActive?: boolean;
}): Promise<InternalTesterSandboxPurchaseModeState> {
  const runtime = getAppMonetizationRuntimeFeatures();
  const liveMoneyEnabled = runtime.liveMoneyEnabled === true;
  const payoutsEnabled = runtime.payoutsEnabled === true;
  const cashoutEnabled = runtime.cashoutEnabled === true;
  const providerSandboxCandidate = !!String(options?.userId ?? options?.email ?? "").trim();
  const roles: string[] = [];
  const storePurchaseRailKey = Platform.OS === "ios"
    ? "revenuecat_app_store_enabled"
    : "revenuecat_google_play_enabled";
  const storePurchaseRailReadback = await readMoneyFeatureFlagSummaryWithStatus();
  const storePurchaseRailState = getMoneyFeatureFlag(
    storePurchaseRailReadback.rows,
    storePurchaseRailKey,
  ).state;
  const railState = {
    storePurchaseRailState,
    storePurchaseRailReadbackComplete: storePurchaseRailReadback.readbackComplete,
  };

  if (!FEATURE_FLAGS.monetization.subscriptions || !runtime.premiumEnabled) {
    return {
      enabled: false,
      mode: "public",
      label: INTERNAL_TESTER_SANDBOX_PURCHASE_MODE_LABEL,
      reason: "Premium sandbox purchases are unavailable because Premium runtime support is disabled.",
      allowedRoles: roles,
      liveMoneyEnabled,
      payoutsEnabled,
      cashoutEnabled,
      providerSandboxCandidate,
      ...railState,
    };
  }

  if (liveMoneyEnabled || payoutsEnabled || cashoutEnabled) {
    return {
      enabled: false,
      mode: "public",
      label: INTERNAL_TESTER_SANDBOX_PURCHASE_MODE_LABEL,
      reason: "Sandbox purchase mode is blocked while live money, payouts, or cash-out is enabled.",
      allowedRoles: roles,
      liveMoneyEnabled,
      payoutsEnabled,
      cashoutEnabled,
      providerSandboxCandidate,
      ...railState,
    };
  }

  if (!storePurchasesEnabledForPlatform()) {
    return {
      enabled: false,
      mode: "public",
      label: INTERNAL_TESTER_SANDBOX_PURCHASE_MODE_LABEL,
      reason: "App Store sandbox purchases are disabled for this iOS build.",
      allowedRoles: roles,
      liveMoneyEnabled,
      payoutsEnabled,
      cashoutEnabled,
      providerSandboxCandidate,
      ...railState,
    };
  }

  if (!storePurchaseRailReadback.readbackComplete) {
    return {
      enabled: false,
      mode: "public",
      label: INTERNAL_TESTER_SANDBOX_PURCHASE_MODE_LABEL,
      reason: `Unable to verify the ${revenueCatStoreLabel()} sandbox server rail. Try again.`,
      allowedRoles: roles,
      liveMoneyEnabled,
      payoutsEnabled,
      cashoutEnabled,
      providerSandboxCandidate,
      ...railState,
    };
  }

  if (storePurchaseRailState !== "sandbox_only") {
    return {
      enabled: false,
      mode: "public",
      label: INTERNAL_TESTER_SANDBOX_PURCHASE_MODE_LABEL,
      reason: `${revenueCatStoreLabel()} sandbox purchases are not enabled on the server yet.`,
      allowedRoles: roles,
      liveMoneyEnabled,
      payoutsEnabled,
      cashoutEnabled,
      providerSandboxCandidate,
      ...railState,
    };
  }

  const memberships = await readMyPlatformRoleMemberships().catch(() => []);
  const ownerOperator = hasPlatformRoleMembership(memberships, ["owner", "operator"]);
  if (ownerOperator) roles.push("owner_or_operator_diagnostic");

  if (isBetaOperatorIdentity({ userId: options?.userId, email: options?.email })) {
    roles.push("runtime_allowlisted_tester_diagnostic");
  }

  if (options?.betaAccessActive === true) {
    roles.push("active_internal_tester_diagnostic");
  }

  if (!providerSandboxCandidate) {
    return {
      enabled: false,
      mode: "public",
      label: INTERNAL_TESTER_SANDBOX_PURCHASE_MODE_LABEL,
      reason: `Sign in before starting a ${revenueCatStoreLabel()} sandbox Premium purchase.`,
      allowedRoles: roles,
      liveMoneyEnabled,
      payoutsEnabled,
      cashoutEnabled,
      providerSandboxCandidate,
      ...railState,
    };
  }

  return {
    enabled: true,
    mode: INTERNAL_TESTER_SANDBOX_PURCHASE_MODE,
    label: INTERNAL_TESTER_SANDBOX_PURCHASE_MODE_LABEL,
    reason: `Provider-backed sandbox purchase mode is available for this signed-in account when ${revenueCatStoreLabel()} offerings are ready. Internal tester roles are diagnostics only.`,
    allowedRoles: roles,
    liveMoneyEnabled,
    payoutsEnabled,
    cashoutEnabled,
    providerSandboxCandidate,
    ...railState,
  };
}

export const createEmptyMonetizationGateResolution = (
  snapshotStatus: MonetizationGateResolution["snapshotStatus"] = "disabled",
  issues: string[] = [],
): MonetizationGateResolution => ({
  qualifyingTargetIds: [],
  entitledTargetIds: [],
  availableTargetIds: [],
  canPurchase: false,
  entitlementAuthorityAvailable: false,
  entitlementState: "UNKNOWN",
  snapshotStatus,
  issues: [...issues],
});

const normalizeOptionalIdentity = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return INVALID_IDENTITY_LITERALS.has(normalized.toLowerCase()) ? "" : normalized;
};

const getDefaultMonetizationTargetState = (
  definition: MonetizationTargetDefinition,
): MonetizationTargetState => ({
  definition,
  status: "unknown",
  hasEntitlement: false,
  entitlementAuthoritative: false,
  entitlementState: "UNKNOWN",
  offeringAvailable: false,
  configuredOfferingId: definition.offeringId,
  resolvedOfferingId: null,
  offeringResolution: "missing",
  packageCount: 0,
  availablePackageIds: [],
});

const createEmptyMonetizationSnapshot = (
  configuration: RevenueCatConfigurationState,
  userId: string | null,
): MonetizationSnapshot => ({
  status: configuration.shouldConfigure ? "partial" : "disabled",
  configuration,
  userId,
  revenueCatAppUserId: "",
  isAnonymousCustomer: true,
  canMakePayments: false,
  customerInfoLoaded: false,
  offeringsLoaded: false,
  currentOfferingId: null,
  availableOfferingIds: [],
  activeEntitlementIds: [],
  activeProductIds: [],
  targets: {
    premium_subscription: getDefaultMonetizationTargetState(MONETIZATION_TARGETS.premium_subscription),
    paid_title_access: getDefaultMonetizationTargetState(MONETIZATION_TARGETS.paid_title_access),
    premium_live_access: getDefaultMonetizationTargetState(MONETIZATION_TARGETS.premium_live_access),
    premium_watch_party_access: getDefaultMonetizationTargetState(MONETIZATION_TARGETS.premium_watch_party_access),
  },
  issues: configuration.reason ? [configuration.reason] : [],
  updatedAt: Date.now(),
});

let cachedMonetizationSnapshot: MonetizationSnapshot = createEmptyMonetizationSnapshot(
  { mode: "disabled", apiKey: "", shouldConfigure: false, reason: "RevenueCat has not been configured yet." },
  null,
);
let cachedMonetizationAuthority: AccountSessionAuthorityBinding | null = null;
let lastTrackedMonetizationSnapshotSignature = "";

const monetizationSnapshotListeners = new Set<() => void>();

export const DEFAULT_CREATOR_PERMISSION_SET: CreatorPermissionSet = {
  userId: "",
  canUsePartyPassRooms: true,
  canUsePremiumRooms: true,
  canPublishPremiumTitles: true,
  canUseSponsorPlacements: true,
  canUsePlayerAds: true,
  updatedAt: Date.now(),
};

const isMissingTableError = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return code === "42P01";
};

export const normalizeMonetizationAccessRule = (value: unknown): MonetizationAccessRule => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "party_pass") return "party_pass";
  if (normalized === "premium") return "premium";
  return "open";
};

export const normalizeTitleAccessRule = (value: unknown): TitleAccessRule => (
  String(value ?? "").trim().toLowerCase() === "premium" ? "premium" : "open"
);

export const normalizeSponsorPlacement = (value: unknown): SponsorPlacement => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "detail_banner") return "detail_banner";
  if (normalized === "player_banner") return "player_banner";
  return "none";
};

export const normalizeCreatorPermissionSet = (
  value?: Partial<CreatorPermissionSet> | CreatorPermissionRow | null,
  fallbackUserId = "",
): CreatorPermissionSet => {
  const isRowValue = !!value && typeof value === "object" && "user_id" in value;
  const localValue = value && !isRowValue ? value : null;
  const rowValue = isRowValue ? value : null;
  const updatedAtRaw = typeof localValue?.updatedAt === "number"
    ? localValue.updatedAt
    : new Date(String(rowValue?.updated_at ?? Date.now())).getTime();

  return {
    userId: String(
      rowValue?.user_id ?? localValue?.userId ?? fallbackUserId,
    ).trim() || fallbackUserId,
    canUsePartyPassRooms: typeof localValue?.canUsePartyPassRooms === "boolean"
      ? localValue.canUsePartyPassRooms
      : typeof rowValue?.can_use_party_pass_rooms === "boolean"
        ? !!rowValue.can_use_party_pass_rooms
        : DEFAULT_CREATOR_PERMISSION_SET.canUsePartyPassRooms,
    canUsePremiumRooms: typeof localValue?.canUsePremiumRooms === "boolean"
      ? localValue.canUsePremiumRooms
      : typeof rowValue?.can_use_premium_rooms === "boolean"
        ? !!rowValue.can_use_premium_rooms
        : DEFAULT_CREATOR_PERMISSION_SET.canUsePremiumRooms,
    canPublishPremiumTitles: typeof localValue?.canPublishPremiumTitles === "boolean"
      ? localValue.canPublishPremiumTitles
      : typeof rowValue?.can_publish_premium_titles === "boolean"
        ? !!rowValue.can_publish_premium_titles
        : DEFAULT_CREATOR_PERMISSION_SET.canPublishPremiumTitles,
    canUseSponsorPlacements: typeof localValue?.canUseSponsorPlacements === "boolean"
      ? localValue.canUseSponsorPlacements
      : typeof rowValue?.can_use_sponsor_placements === "boolean"
        ? !!rowValue.can_use_sponsor_placements
        : DEFAULT_CREATOR_PERMISSION_SET.canUseSponsorPlacements,
    canUsePlayerAds: typeof localValue?.canUsePlayerAds === "boolean"
      ? localValue.canUsePlayerAds
      : typeof rowValue?.can_use_player_ads === "boolean"
        ? !!rowValue.can_use_player_ads
        : DEFAULT_CREATOR_PERMISSION_SET.canUsePlayerAds,
    updatedAt: Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now(),
  };
};

async function getSignedInUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

const notifyMonetizationSnapshotListeners = () => {
  monetizationSnapshotListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener failures
    }
  });
};

subscribeToAccountSessionAuthority((authority) => {
  if (sameAccountSessionAuthority(cachedMonetizationAuthority, authority)) return;
  cachedMonetizationAuthority = null;
  cachedMonetizationSnapshot = createEmptyMonetizationSnapshot(cachedMonetizationSnapshot.configuration, authority?.userId ?? null);
  notifyMonetizationSnapshotListeners();
});

const getOfferingByIdentifier = (
  offerings: PurchasesOfferings | null,
  offeringId: string,
): PurchasesOffering | null => {
  if (!offerings) return null;
  return offerings.all[offeringId] ?? null;
};

const hasPurchasablePackages = (offering?: PurchasesOffering | null) => (
  !!offering && offering.availablePackages.length > 0
);

const resolveOfferingForTarget = (
  offerings: PurchasesOfferings | null,
  definition: MonetizationTargetDefinition,
): {
  offering: PurchasesOffering | null;
  resolution: MonetizationTargetState["offeringResolution"];
} => {
  const configuredOffering = getOfferingByIdentifier(offerings, definition.offeringId);
  if (definition.id !== "premium_subscription" || hasPurchasablePackages(configuredOffering)) {
    return {
      offering: configuredOffering,
      resolution: configuredOffering ? "configured" : "missing",
    };
  }

  const fallbackOffering = [
    offerings?.current,
    offerings?.all.default,
    ...Object.values(offerings?.all ?? {}),
  ].find(hasPurchasablePackages)
    ?? null;

  if (fallbackOffering) {
    return {
      offering: fallbackOffering,
      resolution: "fallback",
    };
  }

  return {
    offering: configuredOffering ?? null,
    resolution: configuredOffering ? "configured" : "missing",
  };
};

const getOfferingForTarget = (
  offerings: PurchasesOfferings | null,
  definition: MonetizationTargetDefinition,
): PurchasesOffering | null => {
  return resolveOfferingForTarget(offerings, definition).offering;
};

const selectRecommendedPackage = (offering: PurchasesOffering | null): PurchasesPackage | null => {
  if (!offering) return null;
  return offering.monthly
    ?? offering.annual
    ?? offering.threeMonth
    ?? offering.sixMonth
    ?? offering.weekly
    ?? offering.lifetime
    ?? offering.availablePackages[0]
    ?? null;
};

const findPackageForTarget = (
  targetId: MonetizationTargetId,
  offerings: PurchasesOfferings | null,
  packageId?: string | null,
) => {
  const definition = MONETIZATION_TARGETS[targetId];
  const offering = getOfferingForTarget(offerings, definition);
  if (!offering) return null;

  const normalizedPackageId = String(packageId ?? "").trim();
  if (normalizedPackageId) {
    const explicitPackage = offering.availablePackages.find((entry) => {
      const entryPackageId = String(entry.identifier ?? "").trim();
      return entryPackageId && entryPackageId === normalizedPackageId;
    });
    if (explicitPackage) return explicitPackage;
  }

  return selectRecommendedPackage(offering);
};

const formatPackageBadge = (pkg: PurchasesPackage | null) => {
  const packageType = String(pkg?.packageType ?? "").trim().toUpperCase();
  if (packageType === "MONTHLY") return "MONTHLY PLAN";
  if (packageType === "ANNUAL") return "ANNUAL PLAN";
  if (packageType === "WEEKLY") return "WEEKLY PLAN";
  if (packageType === "THREE_MONTH") return "3-MONTH PLAN";
  if (packageType === "SIX_MONTH") return "6-MONTH PLAN";
  if (packageType === "LIFETIME") return "LIFETIME ACCESS";
  return "LIVE OFFER";
};

const formatPackageDetail = (pkg: PurchasesPackage | null, target: MonetizationTargetDefinition) => {
  const product = pkg?.product;
  if (!product) return target.summary;

  const subscriptionPeriod = String(product.subscriptionPeriod ?? "").trim().toUpperCase();
  if (subscriptionPeriod === "P1W") return "Billed weekly through the active store configuration.";
  if (subscriptionPeriod === "P1M") return "Billed monthly through the active store configuration.";
  if (subscriptionPeriod === "P3M") return "Billed every 3 months through the active store configuration.";
  if (subscriptionPeriod === "P6M") return "Billed every 6 months through the active store configuration.";
  if (subscriptionPeriod === "P1Y") return "Billed yearly through the active store configuration.";

  const packageType = String(pkg.packageType ?? "").trim().toUpperCase();
  if (packageType === "LIFETIME") return "One-time unlock through the active store configuration.";

  return String(product.description ?? "").trim() || target.summary;
};

const buildMonetizationAccessSheetOffer = (options: {
  targetId: MonetizationTargetId;
  targetState: MonetizationTargetState;
  packageId?: string | null;
  offerings: PurchasesOfferings | null;
}): MonetizationAccessSheetOffer | null => {
  const target = MONETIZATION_TARGETS[options.targetId];
  const selectedPackage = findPackageForTarget(options.targetId, options.offerings, options.packageId);
  if (!selectedPackage) return null;

  const product = selectedPackage.product;
  const availableCount = options.targetState.packageCount;
  const offerTitle = String(product.title ?? "").trim() || target.label;
  const offerPrice = String(product.priceString ?? "").trim();
  if (!offerPrice) return null;

  return {
    title: offerTitle,
    priceLabel: offerPrice,
    detail: formatPackageDetail(selectedPackage, target),
    caption: availableCount > 1
      ? `${availableCount} live packages are configured for this offer.`
      : "Pricing is coming from the current configured offer.",
    badge: formatPackageBadge(selectedPackage),
    packageId: String(selectedPackage.identifier ?? "").trim() || undefined,
  };
};

const resolveTargetEntitlementAuthority = (
  definition: MonetizationTargetDefinition,
  decisions: readonly PremiumEntitlementDecision[],
) => {
  const decisionsByKey = new Map(decisions.map((decision) => [decision.entitlementKey, decision]));
  const targetDecisions = definition.entitlementIds.map(
    (entitlementId) => decisionsByKey.get(entitlementId as PremiumEntitlementKey),
  )
    .filter((decision): decision is PremiumEntitlementDecision => !!decision);
  const entitlement = resolveAlternativeEntitlementAuthority(targetDecisions, definition.entitlementIds.length);
  return {
    authoritative: entitlement.authoritative,
    hasEntitlement: entitlement.grantsProtectedAccess,
    state: entitlement.state,
  };
};

const buildMonetizationTargetState = (
  definition: MonetizationTargetDefinition,
  entitlementDecisions: readonly PremiumEntitlementDecision[],
  offerings: PurchasesOfferings | null,
): MonetizationTargetState => {
  const offeringResolution = resolveOfferingForTarget(offerings, definition);
  const offering = offeringResolution.offering;
  const recommendedPackage = selectRecommendedPackage(offering);
  const entitlement = resolveTargetEntitlementAuthority(definition, entitlementDecisions);
  const packageIds = offering?.availablePackages.map((entry) => String(entry.identifier ?? "").trim()).filter(Boolean) ?? [];
  const resolvedOfferingId = String(offering?.identifier ?? "").trim() || null;

  if (entitlement.hasEntitlement) {
    return {
      definition,
      status: "entitled",
      hasEntitlement: true,
      entitlementAuthoritative: true,
      entitlementState: entitlement.state,
      offeringAvailable: !!offering,
      configuredOfferingId: definition.offeringId,
      resolvedOfferingId,
      offeringResolution: offeringResolution.resolution,
      packageCount: packageIds.length,
      availablePackageIds: packageIds,
      recommendedPackageId: recommendedPackage ? String(recommendedPackage.identifier ?? "").trim() : undefined,
    };
  }

  if (!entitlement.authoritative) {
    return {
      definition, status: "unknown", hasEntitlement: false,
      entitlementAuthoritative: false, entitlementState: "UNKNOWN", offeringAvailable: !!offering,
      configuredOfferingId: definition.offeringId, resolvedOfferingId,
      offeringResolution: offeringResolution.resolution,
      packageCount: packageIds.length, availablePackageIds: packageIds,
    };
  }

  if (offering && packageIds.length > 0) {
    return {
      definition,
      status: "available",
      hasEntitlement: false,
      entitlementAuthoritative: true,
      entitlementState: entitlement.state,
      offeringAvailable: true,
      configuredOfferingId: definition.offeringId,
      resolvedOfferingId,
      offeringResolution: offeringResolution.resolution,
      packageCount: packageIds.length,
      availablePackageIds: packageIds,
      recommendedPackageId: recommendedPackage ? String(recommendedPackage.identifier ?? "").trim() : undefined,
    };
  }

  return {
    definition,
    status: "unavailable",
    hasEntitlement: false,
    entitlementAuthoritative: true,
    entitlementState: entitlement.state,
    offeringAvailable: !!offering,
    configuredOfferingId: definition.offeringId,
    resolvedOfferingId,
    offeringResolution: offeringResolution.resolution,
    packageCount: packageIds.length,
    availablePackageIds: packageIds,
  };
};

const derivePlanFromMonetizationSnapshot = (
  snapshot: MonetizationSnapshot,
  fallback = defaultPlan,
): UserPlan => {
  const premiumTarget = snapshot.targets.premium_subscription;
  const watchPartyTarget = snapshot.targets.premium_watch_party_access;
  const hasPremium = premiumTarget.hasEntitlement;
  const watchPartyPerks = hasPremium || watchPartyTarget.hasEntitlement;

  return {
    tier: hasPremium ? "premium" : "free",
    adFree: hasPremium,
    watchPartyPerks,
    updatedAt: snapshot.updatedAt || fallback.updatedAt,
    accessSource: hasPremium ? "entitlement" : undefined,
  };
};

const getMonetizationAccessPolicy = (options: {
  accessRule: MonetizationAccessRule;
  targetHint?: MonetizationTargetId | null;
}): MonetizationAccessPolicy => {
  if (options.accessRule === "party_pass") {
    return {
      primaryTargetId: "premium_watch_party_access",
      qualifyingTargetIds: [...WATCH_PARTY_ACCESS_TARGET_IDS],
    };
  }

  if (options.accessRule !== "premium") {
    return { qualifyingTargetIds: [] };
  }

  if (options.targetHint === "paid_title_access") {
    return {
      primaryTargetId: "paid_title_access",
      qualifyingTargetIds: [...TITLE_ACCESS_TARGET_IDS],
    };
  }

  if (options.targetHint === "premium_live_access") {
    return {
      primaryTargetId: "premium_live_access",
      qualifyingTargetIds: [...LIVE_ACCESS_TARGET_IDS],
    };
  }

  if (options.targetHint === "premium_watch_party_access") {
    return {
      primaryTargetId: "premium_watch_party_access",
      qualifyingTargetIds: [...WATCH_PARTY_ACCESS_TARGET_IDS],
    };
  }

  return {
    primaryTargetId: "premium_subscription",
    qualifyingTargetIds: [...PREMIUM_SUBSCRIPTION_TARGET_IDS],
  };
};

export const buildMonetizationGateResolution = (
  snapshot: MonetizationSnapshot,
  policy: MonetizationAccessPolicy,
): MonetizationGateResolution => {
  const entitledTargetIds = policy.qualifyingTargetIds.filter((targetId) => snapshot.targets[targetId]?.hasEntitlement);
  const gateEntitlement = resolveAlternativeEntitlementAuthority(policy.qualifyingTargetIds.map((targetId) => ({
    authoritative: snapshot.targets[targetId]?.entitlementAuthoritative === true,
    grantsProtectedAccess: snapshot.targets[targetId]?.hasEntitlement === true,
    state: snapshot.targets[targetId]?.entitlementState ?? "UNKNOWN",
  })), policy.qualifyingTargetIds.length);
  const availableTargetIds = policy.qualifyingTargetIds.filter((targetId) => {
    const target = snapshot.targets[targetId];
    return target?.status === "available" && target.offeringAvailable && target.packageCount > 0;
  });
  const purchaseTargetId = gateEntitlement.grantsProtectedAccess ? undefined
    : [policy.primaryTargetId, ...policy.qualifyingTargetIds]
      .filter((targetId): targetId is MonetizationTargetId => !!targetId)
      .find((targetId, index, list) => list.indexOf(targetId) === index && availableTargetIds.includes(targetId));
  const selectedTargetState = purchaseTargetId ? snapshot.targets[purchaseTargetId] : null;

  return {
    primaryTargetId: policy.primaryTargetId,
    purchaseTargetId,
    qualifyingTargetIds: [...policy.qualifyingTargetIds],
    entitledTargetIds,
    availableTargetIds,
    recommendedPackageId: selectedTargetState?.recommendedPackageId,
    canPurchase: !!purchaseTargetId && snapshot.configuration.shouldConfigure && snapshot.canMakePayments,
    entitlementAuthorityAvailable: gateEntitlement.authoritative,
    entitlementState: gateEntitlement.state,
    snapshotStatus: snapshot.status,
    issues: [...snapshot.issues],
  };
};

export const setCachedMonetizationSnapshot = (
  snapshot: MonetizationSnapshot,
  authority: AccountSessionAuthorityBinding | null,
) => {
  const currentAuthority = getCurrentAccountSessionAuthoritySnapshot();
  const authorityStillCurrent = authority
    ? sameAccountSessionAuthority(authority, currentAuthority)
    : currentAuthority === null;
  if (!authorityStillCurrent) {
    const current = createEmptyMonetizationSnapshot(snapshot.configuration, currentAuthority?.userId ?? null);
    return { ...current, issues: [...current.issues, "Account changed before monetization authority could be committed."] };
  }
  cachedMonetizationSnapshot = snapshot;
  cachedMonetizationAuthority = authority;
  notifyMonetizationSnapshotListeners();
  return snapshot;
};

const trackMonetizationSnapshotResolution = (snapshot: MonetizationSnapshot) => {
  const signature = [
    snapshot.status,
    snapshot.userId ?? "",
    snapshot.revenueCatAppUserId,
    snapshot.isAnonymousCustomer ? "anonymous" : "identified",
    snapshot.canMakePayments ? "billing-ready" : "billing-blocked",
    snapshot.currentOfferingId ?? "",
    snapshot.availableOfferingIds.join(","),
    snapshot.activeEntitlementIds.join(","),
    snapshot.issues.join("|"),
  ].join("::");

  if (signature === lastTrackedMonetizationSnapshotSignature) return;
  lastTrackedMonetizationSnapshotSignature = signature;

  trackEvent("monetization_entitlement_resolved", {
    status: snapshot.status,
    signedIn: !!snapshot.userId,
    providerIdentityMatched: !!snapshot.userId && snapshot.revenueCatAppUserId === snapshot.userId,
    isAnonymousCustomer: snapshot.isAnonymousCustomer,
    canMakePayments: snapshot.canMakePayments,
    customerInfoLoaded: snapshot.customerInfoLoaded,
    offeringsLoaded: snapshot.offeringsLoaded,
    currentOfferingPresent: !!snapshot.currentOfferingId,
    availableOfferingCount: snapshot.availableOfferingIds.length,
    activeEntitlementCount: snapshot.activeEntitlementIds.length,
    issueCount: snapshot.issues.length,
  });
};

export function getMonetizationCatalog() {
  return MONETIZATION_TARGETS;
}

export function getCachedMonetizationSnapshot() {
  const currentAuthority = getCurrentAccountSessionAuthoritySnapshot();
  if (!sameAccountSessionAuthority(cachedMonetizationAuthority, currentAuthority)) {
    return createEmptyMonetizationSnapshot(cachedMonetizationSnapshot.configuration, currentAuthority?.userId ?? null);
  }
  return cachedMonetizationSnapshot;
}

export function subscribeToMonetizationSnapshot(listener: () => void) {
  monetizationSnapshotListeners.add(listener);
  return () => {
    monetizationSnapshotListeners.delete(listener);
  };
}

export async function readMonetizationSnapshot(options?: {
  forceRefresh?: boolean;
  userId?: string | null;
  purchaseMode?: MonetizationPurchaseMode | null;
}): Promise<MonetizationSnapshot> {
  if (options?.userId === null) return createEmptyMonetizationSnapshot(cachedMonetizationSnapshot.configuration, null);
  const requestedUserId = normalizeOptionalIdentity(options?.userId);
  const authority = await readCurrentAccountSessionAuthority();
  const userId = authority?.userId ?? null;
  let configuration: RevenueCatConfigurationState;
  try {
    configuration = configureRevenueCatOnce();
  } catch {
    configuration = {
      mode: "disabled",
      apiKey: "",
      shouldConfigure: false,
      reason: "RevenueCat configuration is unavailable right now.",
    };
  }
  const baseSnapshot = createEmptyMonetizationSnapshot(configuration, userId);
  const purchaseMode = getPurchaseModeFromOption(options?.purchaseMode);
  const purchaseShellAvailable = isPremiumPurchaseShellAvailableForMode(purchaseMode);

  if (!authority || authority.restoreOnly || (requestedUserId && requestedUserId !== authority.userId)) {
    const snapshot = { ...baseSnapshot, issues: [...baseSnapshot.issues, "Account entitlement authority is unavailable right now."] };
    trackMonetizationSnapshotResolution(snapshot);
    return snapshot;
  }

  try {
    const entitlementDecisions = await readCurrentUserEntitlements(
      ["premium", "premium_watch_party", "premium_live", "paid_content"],
      { authority },
    );
    const entitlementAuthorityAvailable = entitlementDecisions.length === 4
      && entitlementDecisions.every((decision) => decision.authoritative);
    const identity = configuration.shouldConfigure
      ? await syncRevenueCatCustomerIdentity(authority.userId)
      : null;
    const providerIdentityMatched = identity?.matchesSourceUser === true
      && sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority());
    const [providerCanMakePayments, customerInfo, offerings] = providerIdentityMatched
      ? await Promise.all([
          purchaseShellAvailable ? canMakeRevenueCatPurchases() : Promise.resolve(false),
          readRevenueCatCustomerInfo({ refresh: !!options?.forceRefresh }),
          purchaseShellAvailable ? readRevenueCatOfferings() : Promise.resolve(null),
        ])
      : [false, null, null] as const;
    const currentAuthority = await readCurrentAccountSessionAuthority();
    if (!sameAccountSessionAuthority(authority, currentAuthority)) {
      return { ...baseSnapshot, issues: [...baseSnapshot.issues, "Account changed while entitlement authority was loading."] };
    }
    const canMakePayments = providerCanMakePayments && entitlementAuthorityAvailable;

    const issues = [...baseSnapshot.issues];
    if (!entitlementAuthorityAvailable) issues.push("Account entitlement status is unavailable right now.");
    if (configuration.shouldConfigure && !providerIdentityMatched) issues.push("Billing identity is unavailable for the current account.");
    if (!purchaseShellAvailable) issues.push(PREMIUM_PURCHASE_SHELL_HOLD_MESSAGE);
    if (purchaseShellAvailable && purchaseMode === INTERNAL_TESTER_SANDBOX_PURCHASE_MODE) {
      issues.push(INTERNAL_TESTER_SANDBOX_PURCHASE_COPY);
    }
    if (purchaseShellAvailable && !canMakePayments) issues.push("Billing is not currently available on this device/account.");
    if (purchaseShellAvailable && !offerings) issues.push("Offer configuration is unavailable right now.");

    const snapshot: MonetizationSnapshot = {
      status: !configuration.shouldConfigure
        ? "disabled"
        : !purchaseShellAvailable
        ? "partial"
        : !canMakePayments
        ? "store_unavailable"
        : customerInfo && offerings
          ? "ready"
          : "partial",
      configuration,
      userId,
      revenueCatAppUserId: identity?.appUserId ?? "",
      isAnonymousCustomer: identity?.isAnonymous ?? true,
      canMakePayments,
      customerInfoLoaded: !!customerInfo,
      offeringsLoaded: purchaseShellAvailable && !!offerings,
      currentOfferingId: purchaseShellAvailable ? offerings?.current?.identifier ?? null : null,
      availableOfferingIds: purchaseShellAvailable ? Object.keys(offerings?.all ?? {}) : [],
      activeEntitlementIds: entitlementDecisions.filter((decision) => decision.isActive).map((decision) => decision.entitlementKey),
      activeProductIds: customerInfo?.activeSubscriptions ?? [],
      targets: {
        premium_subscription: buildMonetizationTargetState(MONETIZATION_TARGETS.premium_subscription, entitlementDecisions, offerings),
        paid_title_access: buildMonetizationTargetState(MONETIZATION_TARGETS.paid_title_access, entitlementDecisions, offerings),
        premium_live_access: buildMonetizationTargetState(MONETIZATION_TARGETS.premium_live_access, entitlementDecisions, offerings),
        premium_watch_party_access: buildMonetizationTargetState(MONETIZATION_TARGETS.premium_watch_party_access, entitlementDecisions, offerings),
      },
      issues,
      updatedAt: Date.now(),
    };

    debugLog("monetization", "Monetization snapshot refreshed", {
      activeEntitlementCount: snapshot.activeEntitlementIds.length,
      availableOfferingCount: snapshot.availableOfferingIds.length,
      providerIdentityMatched,
      status: snapshot.status,
    });

    const resolvedSnapshot = setCachedMonetizationSnapshot(snapshot, authority);
    trackMonetizationSnapshotResolution(resolvedSnapshot);
    return resolvedSnapshot;
  } catch {
    reportRuntimeError("monetization-snapshot", new Error("Monetization authority refresh failed."), {
      signedIn: true,
    });
    if (!sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())) {
      return { ...baseSnapshot, issues: [...baseSnapshot.issues, "Account changed while entitlement authority was loading."] };
    }
    const fallbackSnapshot = setCachedMonetizationSnapshot({
      ...baseSnapshot,
      status: "partial",
      issues: [...baseSnapshot.issues, "Failed to refresh the monetization snapshot."],
      updatedAt: Date.now(),
    }, authority);
    trackMonetizationSnapshotResolution(fallbackSnapshot);
    return fallbackSnapshot;
  }
}

export async function bootstrapMonetizationFoundation(userId?: string | null) {
  return readMonetizationSnapshot({ userId });
}

export async function purchaseMonetizationTarget(
  targetId: MonetizationTargetId,
  options?: { packageId?: string | null; userId?: string | null; purchaseMode?: MonetizationPurchaseMode | null },
): Promise<MonetizationPurchaseOutcome> {
  const target = MONETIZATION_TARGETS[targetId];
  const purchaseMode = getPurchaseModeFromOption(options?.purchaseMode);
  const operationAuthority = await readCurrentAccountSessionAuthority();
  const snapshot = await readMonetizationSnapshot({
    forceRefresh: true,
    purchaseMode,
    userId: options?.userId,
  });
  const targetState = snapshot.targets[targetId];

  if (!operationAuthority || operationAuthority.restoreOnly
    || !sameAccountSessionAuthority(operationAuthority, await readCurrentAccountSessionAuthority())) {
    return { ok: false, target: targetId, snapshot, customerInfo: null,
      message: "Account changed while Premium authority was loading. Recheck before continuing." };
  }

  if (!isPremiumPurchaseShellAvailableForMode(purchaseMode)) {
    return {
      ok: false,
      target: targetId,
      snapshot,
      customerInfo: null,
      message: PREMIUM_PURCHASE_SHELL_HOLD_MESSAGE,
    };
  }

  if (!snapshot.configuration.shouldConfigure) {
    return {
      ok: false,
      target: targetId,
      snapshot,
      customerInfo: null,
      message: snapshot.configuration.reason ?? "Monetization is not configured for this build.",
    };
  }

  if (!targetState.entitlementAuthoritative) {
    return {
      ok: false,
      target: targetId,
      snapshot,
      customerInfo: null,
      message: "Account entitlement status is unavailable. Recheck before starting a purchase.",
    };
  }

  if (!snapshot.canMakePayments) {
    return {
      ok: false,
      target: targetId,
      snapshot,
      customerInfo: null,
      message: "Billing is not currently available on this device/account.",
    };
  }

  if (targetState.hasEntitlement) {
    return {
      ok: true,
      target: targetId,
      snapshot,
      customerInfo: null,
      message: `${target.label} is already active for this account.`,
    };
  }

  const offerings = await readRevenueCatOfferings();
  const offering = getOfferingForTarget(offerings, target);
  const selectedPackage = offering?.availablePackages.find((entry) => {
    const packageId = String(entry.identifier ?? "").trim();
    return packageId && packageId === String(options?.packageId ?? "").trim();
  }) ?? selectRecommendedPackage(offering);

  if (!selectedPackage) {
    return {
      ok: false,
      target: targetId,
      snapshot,
      customerInfo: null,
      message: `${target.label} is not available in the current offer configuration yet.`,
    };
  }

  if (!sameAccountSessionAuthority(operationAuthority, await readCurrentAccountSessionAuthority())) {
    return { ok: false, target: targetId, snapshot: getCachedMonetizationSnapshot(), customerInfo: null,
      message: "Account changed before billing could start. Recheck the current account." };
  }

  const waitForPremiumAuthority = () => pollProviderAuthority({
    attempts: PREMIUM_PURCHASE_AUTHORITY_POLL_ATTEMPTS,
    delayMs: PREMIUM_PURCHASE_AUTHORITY_POLL_DELAY_MS,
    authorityCurrent: async () => sameAccountSessionAuthority(
      operationAuthority,
      await readCurrentAccountSessionAuthority(),
    ),
    read: () => readMonetizationSnapshot({
      forceRefresh: true,
      purchaseMode,
      userId: options?.userId,
    }),
    accepts: (candidate) => candidate.targets[targetId].entitlementAuthoritative
      && candidate.targets[targetId].hasEntitlement,
  });

  try {
    const result = await purchaseRevenueCatPackage(selectedPackage, { authority: operationAuthority });
    if (!sameAccountSessionAuthority(operationAuthority, await readCurrentAccountSessionAuthority())) {
      return { ok: false, target: targetId, snapshot: getCachedMonetizationSnapshot(), customerInfo: null,
        message: "Account changed before the purchase result returned. Recheck the current account." };
    }
    const refreshedSnapshot = await waitForPremiumAuthority();
    if (!refreshedSnapshot) {
      return {
        ok: false,
        target: targetId,
        snapshot: await readMonetizationSnapshot({ purchaseMode, userId: options?.userId }),
        customerInfo: result.customerInfo,
        message: `${target.label} purchase was received. Waiting for verified access to finish.`,
        packageId: String(selectedPackage.identifier ?? "").trim() || undefined,
        productId: String(result.productIdentifier ?? "").trim() || undefined,
      };
    }

    return {
      ok: true,
      target: targetId,
      snapshot: refreshedSnapshot,
      customerInfo: result.customerInfo,
      message: `${target.label} purchase completed.`,
      packageId: String(selectedPackage.identifier ?? "").trim() || undefined,
      productId: String(result.productIdentifier ?? "").trim() || undefined,
    };
  } catch (error) {
    reportRuntimeError("monetization-purchase", new Error("Monetization purchase failed."), {
      target: targetId,
    });

    if (!isRevenueCatUserCancellation(error)) {
      const reconciledSnapshot = await waitForPremiumAuthority();
      if (reconciledSnapshot) {
        return {
          ok: true,
          target: targetId,
          snapshot: reconciledSnapshot,
          customerInfo: await readRevenueCatCustomerInfo({ refresh: true }),
          message: `${target.label} purchase completed.`,
          packageId: String(selectedPackage.identifier ?? "").trim() || undefined,
        };
      }
    }

    return {
      ok: false,
      target: targetId,
      snapshot: await readMonetizationSnapshot({ purchaseMode, userId: options?.userId }),
      customerInfo: null,
      message: isRevenueCatUserCancellation(error)
        ? `${target.label} purchase was canceled. Nothing changed.`
        : `${target.label} purchase result is not verified yet. Restore or recheck before trying again.`,
      packageId: String(selectedPackage.identifier ?? "").trim() || undefined,
    };
  }
}

export async function restoreMonetizationAccess(options?: {
  userId?: string | null;
  purchaseMode?: MonetizationPurchaseMode | null;
}): Promise<MonetizationRestoreOutcome> {
  const purchaseMode = getPurchaseModeFromOption(options?.purchaseMode);
  const operationAuthority = await readCurrentAccountSessionAuthority();
  const snapshot = await readMonetizationSnapshot({
    forceRefresh: true,
    purchaseMode,
    userId: options?.userId,
  });

  if (!operationAuthority || operationAuthority.restoreOnly
    || !sameAccountSessionAuthority(operationAuthority, await readCurrentAccountSessionAuthority())) {
    return { ok: false, snapshot, customerInfo: null,
      message: "Account changed while restore authority was loading. Recheck before continuing." };
  }

  if (!snapshot.configuration.shouldConfigure) {
    return {
      ok: false,
      snapshot,
      customerInfo: null,
      message: snapshot.configuration.reason ?? "Monetization is not configured for this build.",
    };
  }

  try {
    const customerInfo = await restoreRevenueCatPurchases({ authority: operationAuthority });
    if (!sameAccountSessionAuthority(operationAuthority, await readCurrentAccountSessionAuthority())) {
      return { ok: false, snapshot: getCachedMonetizationSnapshot(), customerInfo: null,
        message: "Account changed before the restore result returned. Recheck the current account." };
    }
    const providerPremiumActive = !!customerInfo.entitlements.active.premium;
    const readRefreshedSnapshot = () => readMonetizationSnapshot({
      forceRefresh: true,
      purchaseMode,
      userId: options?.userId,
    });
    const refreshedSnapshot = providerPremiumActive
      ? await pollProviderAuthority({
          attempts: PREMIUM_PURCHASE_AUTHORITY_POLL_ATTEMPTS,
          delayMs: PREMIUM_PURCHASE_AUTHORITY_POLL_DELAY_MS,
          authorityCurrent: async () => sameAccountSessionAuthority(
            operationAuthority,
            await readCurrentAccountSessionAuthority(),
          ),
          read: readRefreshedSnapshot,
          accepts: (candidate) => candidate.targets.premium_subscription.entitlementAuthoritative
            && candidate.targets.premium_subscription.hasEntitlement,
        })
      : await readRefreshedSnapshot();
    if (!refreshedSnapshot) {
      return {
        ok: false,
        snapshot: await readMonetizationSnapshot({ purchaseMode, userId: options?.userId }),
        customerInfo,
        message: "The store restored Premium, but verified app access is still reconciling. Recheck shortly.",
      };
    }
    if (!refreshedSnapshot.targets.premium_subscription.entitlementAuthoritative) {
      return { ok: false, snapshot: refreshedSnapshot, customerInfo: null,
        message: "Purchases were restored, but Premium status is unavailable and unverified. Recheck before continuing." };
    }

    return {
      ok: true,
      snapshot: refreshedSnapshot,
      customerInfo,
      message: "Purchases restored.",
    };
  } catch {
    reportRuntimeError("monetization-restore", new Error("Monetization restore failed."), {
      signedIn: !!operationAuthority,
    });

    return {
      ok: false,
      snapshot: await readMonetizationSnapshot({ purchaseMode, userId: options?.userId }),
      customerInfo: null,
      message: "Unable to restore purchases right now.",
    };
  }
}

export async function openManageSubscriptionFlow() {
  return openRevenueCatManageSubscriptions();
}

export function getMonetizationAccessSheetPresentation(options: {
  gate: GateLike | null | undefined;
  appDisplayName?: string;
  premiumUpsellTitle?: string;
  premiumUpsellBody?: string;
}): MonetizationAccessSheetPresentation {
  const appDisplayName = String(options.appDisplayName ?? "Chi'llywood").trim() || "Chi'llywood";
  const gateReason = String(options.gate?.reason ?? "").trim().toLowerCase();
  const primaryTargetId = options.gate?.monetization?.primaryTargetId;

  if (gateReason === "entitlement_unknown") {
    return {
      kicker: "PREMIUM STATUS",
      title: "Premium status unavailable",
      body: "Your entitlement or Premium status is unavailable and unverified right now. Protected access remains locked until the current account can be verified.",
      actionLabel: "Check Premium Status",
    };
  }

  if (primaryTargetId === "paid_title_access") {
    return {
      kicker: "TITLE ACCESS",
      title: "Premium Access Required",
      body: `This title currently resolves through ${appDisplayName} Premium on this route. Direct title unlocks are later and are not active here yet.`,
      actionLabel: "Unlock Premium",
    };
  }

  if (primaryTargetId === "premium_live_access") {
    return {
      kicker: "LIVE ACCESS",
      title: "Premium Access Required",
      body: `This live entry point currently resolves through ${appDisplayName} Premium on this route. Separate live unlocks are later and are not active here yet.`,
      actionLabel: "Unlock Premium",
    };
  }

  if (gateReason === "party_pass_required") {
    return {
      kicker: "SEAT PASS ACCESS",
      title: "Unlock This Room",
      body: `This room uses Watch-Party Seat Pass access. Review the current room gate here, or use an active ${appDisplayName} Premium subscription when that entitlement already clears the room.`,
      actionLabel: "Get Seat Pass",
    };
  }

  return {
    kicker: "PREMIUM ACCESS",
    title: String(options.premiumUpsellTitle ?? "").trim() || "Go Premium",
    body: String(options.premiumUpsellBody ?? "").trim()
      || `Premium unlocks premium titles and premium-entry rooms inside ${appDisplayName}, while keeping playback ad-free.`,
    actionLabel: "Unlock Premium",
  };
}

export async function readMonetizationAccessSheetState(options: {
  gate: GateLike | null | undefined;
  userId?: string | null;
  purchaseMode?: MonetizationPurchaseMode | null;
  appDisplayName?: string;
  premiumUpsellTitle?: string;
  premiumUpsellBody?: string;
}): Promise<MonetizationAccessSheetState> {
  const purchaseMode = getPurchaseModeFromOption(options.purchaseMode);
  const snapshot = await readMonetizationSnapshot({
    forceRefresh: true,
    purchaseMode,
    userId: options.userId,
  });
  const presentation = getMonetizationAccessSheetPresentation({
    gate: options.gate,
    appDisplayName: options.appDisplayName,
    premiumUpsellTitle: options.premiumUpsellTitle,
    premiumUpsellBody: options.premiumUpsellBody,
  });
  const purchaseTargetId = options.gate?.monetization?.purchaseTargetId;
  const primaryTargetId = options.gate?.monetization?.primaryTargetId;
  const targetId = purchaseTargetId ?? primaryTargetId;
  const targetState = targetId ? snapshot.targets[targetId] : null;
  const gateReason = String(options.gate?.reason ?? "").trim().toLowerCase();
  const isPremiumBackedGate = gateReason === "premium_required"
    || targetId === "premium_subscription"
    || targetId === "premium_live_access"
    || targetId === "premium_watch_party_access"
    || targetId === "paid_title_access";
  const purchaseShellAvailable = isPremiumPurchaseShellAvailableForMode(purchaseMode);
  if (gateReason === "entitlement_unknown") {
    return {
      snapshot, presentation, primaryAction: "retry", primaryLabel: "Check Premium Status", primaryDisabled: false,
      helperKicker: "STATUS UNAVAILABLE",
      helperBody: "Entitlement authority is unavailable and unverified for the current account. Protected access remains locked.",
      helperTone: "warning", offer: null, canRestore: false, canManage: false,
    };
  }
  const offerings = snapshot.offeringsLoaded && purchaseShellAvailable ? await readRevenueCatOfferings() : null;
  const offer = targetId && targetState
    ? buildMonetizationAccessSheetOffer({
        targetId,
        targetState,
        packageId: options.gate?.monetization?.recommendedPackageId,
        offerings,
      })
    : null;

  if (!purchaseShellAvailable && !targetState?.hasEntitlement) {
    return {
      snapshot,
      presentation: {
        ...presentation,
        title: "Premium access is being checked",
        body: `Premium purchase status can be checked here. Signed-in users can use the ${revenueCatStoreLabel()} sandbox flow when provider setup is available; live settlement stays off.`,
        actionLabel: "Check Premium Status",
      },
      primaryAction: "retry",
      primaryLabel: "Check Premium Status",
      primaryDisabled: false,
      helperKicker: "SETUP NEEDED",
      helperBody: PREMIUM_PURCHASE_SHELL_HOLD_MESSAGE,
      helperTone: "warning",
      offer: null,
      canRestore: true,
      canManage: true,
    };
  }

  if (!snapshot.configuration.shouldConfigure) {
    return {
      snapshot,
      presentation,
      primaryAction: "retry",
      primaryLabel: "Open Status Check",
      primaryDisabled: false,
      helperKicker: "MONETIZATION STATUS",
      helperBody: snapshot.configuration.reason ?? "Monetization is not configured for this build yet.",
      helperTone: "warning",
      offer,
      canRestore: true,
      canManage: true,
    };
  }

  if (!snapshot.canMakePayments) {
    return {
      snapshot,
      presentation,
      primaryAction: "retry",
      primaryLabel: "Retry Billing Check",
      primaryDisabled: false,
      helperKicker: "BILLING STATUS",
      helperBody: snapshot.issues[0]
        ?? "Billing is not currently available on this device/account.",
      helperTone: "warning",
      offer,
      canRestore: true,
      canManage: true,
    };
  }

  if (!purchaseTargetId || !targetState?.offeringAvailable || !targetState.packageCount || !offer) {
    return {
      snapshot,
      presentation,
      primaryAction: "retry",
      primaryLabel: isPremiumBackedGate ? "View Premium" : "Retry Offer Lookup",
      primaryDisabled: false,
      helperKicker: isPremiumBackedGate ? "PREMIUM" : "OFFER STATUS",
      helperBody: isPremiumBackedGate
        ? "Watch-Party Live is included with Premium."
        : snapshot.issues[0]
          ?? "This purchase path is not available in the current offer configuration yet.",
      helperTone: "warning",
      offer,
      canRestore: true,
      canManage: true,
    };
  }

  if (targetState.hasEntitlement) {
    return {
      snapshot,
      presentation,
      primaryAction: "retry",
      primaryLabel: "Recheck Access",
      primaryDisabled: false,
      helperKicker: "ACCESS READY",
      helperBody: `${targetState.definition.label} is already active for this account. Recheck access, restore purchases, or manage your subscription if needed.`,
      helperTone: "neutral",
      offer,
      canRestore: true,
      canManage: true,
    };
  }

  return {
    snapshot,
    presentation,
    primaryAction: "purchase",
    primaryLabel: purchaseMode === INTERNAL_TESTER_SANDBOX_PURCHASE_MODE
      ? "Start Sandbox Premium Test"
      : presentation.actionLabel,
    primaryDisabled: false,
    helperKicker: purchaseMode === INTERNAL_TESTER_SANDBOX_PURCHASE_MODE ? "SANDBOX TEST" : "LIVE OFFER",
    helperBody: purchaseMode === INTERNAL_TESTER_SANDBOX_PURCHASE_MODE
      ? `This provider-backed path opens ${Platform.OS === "ios" ? "App Store" : "Google Play"} sandbox billing only. No production money, payout, cash-out, withdrawal, transfer, or payable balance is created. Premium access still requires RevenueCat and Supabase entitlement readback.`
      : "This pricing is coming from the current configured offer for this build.",
    helperTone: "neutral",
    offer,
    canRestore: true,
    canManage: true,
  };
}

export async function purchaseBlockedAccess(options: {
  gate: GateLike | null | undefined;
  userId?: string | null;
  purchaseMode?: MonetizationPurchaseMode | null;
}): Promise<MonetizationAccessPurchaseOutcome> {
  const purchaseMode = getPurchaseModeFromOption(options.purchaseMode);
  const snapshot = await readMonetizationSnapshot({
    forceRefresh: true,
    purchaseMode,
    userId: options.userId,
  });
  const gateReason = String(options.gate?.reason ?? "").trim().toLowerCase();
  const purchaseTargetId = options.gate?.monetization?.purchaseTargetId;
  const recommendedPackageId = options.gate?.monetization?.recommendedPackageId;

  if (gateReason !== "premium_required" && gateReason !== "party_pass_required") {
    return {
      ok: false,
      snapshot,
      customerInfo: null,
      message: "This surface is not currently blocked by a monetization requirement.",
    };
  }

  if (!purchaseTargetId) {
    return {
      ok: false,
      snapshot,
      customerInfo: null,
      message: snapshot.issues[0]
        ?? "This purchase path is not available in the current RevenueCat offering configuration yet.",
    };
  }

  const result = await purchaseMonetizationTarget(purchaseTargetId, {
    packageId: recommendedPackageId,
    purchaseMode,
    userId: options.userId,
  });

  return {
    ok: result.ok,
    targetId: purchaseTargetId,
    snapshot: result.snapshot,
    customerInfo: result.customerInfo,
    message: result.message,
    packageId: result.packageId,
    productId: result.productId,
  };
}

const localPlanKey = (authority: AccountSessionAuthorityBinding) =>
  `${USER_PLAN_KEY}:${authority.accountId}:${authority.sessionGeneration}`;

async function readLocalPlan(authority: AccountSessionAuthorityBinding | null): Promise<UserPlan> {
  if (!authority || authority.restoreOnly) return defaultPlan;
  try {
    const raw = await AsyncStorage.getItem(localPlanKey(authority));
    if (!sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())) return defaultPlan;
    if (!raw) return defaultPlan;
    const parsed = JSON.parse(raw) as Partial<UserPlan>;
    const tier: PlanTier = parsed.tier === "premium" ? "premium" : "free";
    return {
      tier,
      adFree: tier === "premium",
      watchPartyPerks: tier === "premium",
      updatedAt: Number(parsed.updatedAt ?? Date.now()),
    };
  } catch {
    return defaultPlan;
  }
}

async function saveLocalPlan(plan: UserPlan, authority: AccountSessionAuthorityBinding): Promise<void> {
  try {
    if (!sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())) return;
    await AsyncStorage.setItem(localPlanKey(authority), JSON.stringify(plan));
  } catch {
    // ignore storage failures
  }
}

async function readLegacyUserPlan(
  expectedAuthority?: AccountSessionAuthorityBinding | null,
): Promise<UserPlan> {
  const authority = expectedAuthority === undefined ? await readCurrentAccountSessionAuthority() : expectedAuthority;
  const local = await readLocalPlan(authority);
  if (!FEATURE_FLAGS.monetization.subscriptions) return local;
  if (!authority || authority.restoreOnly) return defaultPlan;

  try {
    const result = await withAuthorityReadDeadline(supabase
      .from(SUBSCRIPTIONS_TABLE)
      .select("tier,updated_at")
      .eq("user_id", authority.userId)
      .maybeSingle(), null);

    if (!sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())) return defaultPlan;
    if (!result || result.error || !result.data) return local;
    const { data } = result;

    const tier: PlanTier = data.tier === "premium" ? "premium" : "free";
    const merged: UserPlan = {
      tier,
      adFree: tier === "premium",
      watchPartyPerks: tier === "premium",
      updatedAt: new Date(data.updated_at ?? Date.now()).getTime(),
    };

    await saveLocalPlan(merged, authority);
    return merged;
  } catch {
    return authority && sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())
      ? local : defaultPlan;
  }
}

export async function readUserPlan(): Promise<UserPlan> {
  const authority = await readCurrentAccountSessionAuthority();
  if (!authority || authority.restoreOnly) return defaultPlan;
  if (await readOwnerPlatformAccessEnabled(authority)) {
    return {
      tier: "premium",
      adFree: true,
      watchPartyPerks: true,
      updatedAt: Date.now(),
      ownerPlatformAccess: true,
      accessSource: "owner_platform_access",
    };
  }
  const runtime = getAppMonetizationRuntimeFeatures();
  if (!FEATURE_FLAGS.monetization.subscriptions || !runtime.premiumEnabled) {
    return defaultPlan;
  }

  const snapshot = await readMonetizationSnapshot({ userId: authority.userId });
  if (!sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())) return defaultPlan;
  const plan = derivePlanFromMonetizationSnapshot(snapshot);
  if (snapshot.targets.premium_subscription.entitlementAuthoritative) {
    await saveLocalPlan(plan, authority);
  }
  return plan;
}

export async function setUserPlan(tier: PlanTier): Promise<UserPlan> {
  const authority = await readCurrentAccountSessionAuthority();
  if (!authority || authority.restoreOnly) {
    throw new Error("Sign in is required before changing premium access.");
  }

  if (tier === "premium") {
    throw new Error("Premium access must be granted by billing or an operator-backed entitlement.");
  }

  const next: UserPlan = {
    tier,
    adFree: false,
    watchPartyPerks: false,
    updatedAt: Date.now(),
  };

  await saveLocalPlan(next, authority);
  return next;
}

export async function hasPremiumAccess(): Promise<boolean> {
  const authority = await readCurrentAccountSessionAuthority();
  if (!authority || authority.restoreOnly) return false;
  if (await readOwnerPlatformAccessEnabled(authority)) return true;
  const snapshot = await readMonetizationSnapshot({ userId: authority.userId });
  return sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())
    && snapshot.targets.premium_subscription.hasEntitlement;
}

export async function hasPartyPassAccess(partyId: string): Promise<boolean> {
  void partyId;
  const authority = await readCurrentAccountSessionAuthority();
  if (!authority || authority.restoreOnly) return false;
  if (await readOwnerPlatformAccessEnabled(authority)) return true;
  const snapshot = await readMonetizationSnapshot({ userId: authority.userId });
  return sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())
    && (snapshot.targets.premium_subscription.hasEntitlement
      || snapshot.targets.premium_watch_party_access.hasEntitlement);
}

export async function unlockPartyPass(partyId: string): Promise<boolean> {
  void partyId;
  return false;
}

export async function readCreatorPermissions(userId?: string | null): Promise<CreatorPermissionSet> {
  const explicitUserId = normalizeOptionalIdentity(userId);
  const safeUserId = explicitUserId || normalizeOptionalIdentity(await getSignedInUserId());
  if (!safeUserId) return normalizeCreatorPermissionSet(null);

  try {
    const { data, error } = await supabase
      .from(CREATOR_PERMISSIONS_TABLE)
      .select(
        "user_id,can_use_party_pass_rooms,can_use_premium_rooms,can_publish_premium_titles,can_use_sponsor_placements,can_use_player_ads,updated_at",
      )
      .eq("user_id", safeUserId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return normalizeCreatorPermissionSet(null, safeUserId);
      return normalizeCreatorPermissionSet(null, safeUserId);
    }

    if (!data) return normalizeCreatorPermissionSet(null, safeUserId);
    return normalizeCreatorPermissionSet(data, safeUserId);
  } catch {
    return normalizeCreatorPermissionSet(null, safeUserId);
  }
}

export async function saveCreatorPermissions(
  userId: string,
  permissions: Partial<CreatorPermissionSet>,
): Promise<CreatorPermissionSet> {
  const safeUserId = String(userId ?? "").trim();
  if (!safeUserId) throw new Error("Missing creator user id.");

  const next = normalizeCreatorPermissionSet(
    {
      ...(await readCreatorPermissions(safeUserId)),
      ...permissions,
      userId: safeUserId,
      updatedAt: Date.now(),
    },
    safeUserId,
  );

  const payload: CreatorPermissionInsert = {
    user_id: safeUserId,
    can_use_party_pass_rooms: next.canUsePartyPassRooms,
    can_use_premium_rooms: next.canUsePremiumRooms,
    can_publish_premium_titles: next.canPublishPremiumTitles,
    can_use_sponsor_placements: next.canUseSponsorPlacements,
    can_use_player_ads: next.canUsePlayerAds,
    updated_at: new Date(next.updatedAt).toISOString(),
  };

  const { error } = await supabase
    .from(CREATOR_PERMISSIONS_TABLE)
    .upsert(payload, { onConflict: "user_id" });

  if (error) throw error;
  return next;
}

export const sanitizeCreatorRoomAccessRule = (
  requestedRule: MonetizationAccessRule | string | null | undefined,
  permissions?: Partial<CreatorPermissionSet> | null,
): MonetizationAccessRule => {
  const normalizedRule = normalizeMonetizationAccessRule(requestedRule);
  const normalizedPermissions = normalizeCreatorPermissionSet(permissions ?? null);
  if (normalizedRule === "party_pass" && !normalizedPermissions.canUsePartyPassRooms) return "open";
  if (normalizedRule === "premium" && !normalizedPermissions.canUsePremiumRooms) return "open";
  return normalizedRule;
};

export const sanitizeCreatorTitleAccessRule = (
  requestedRule: TitleAccessRule | string | null | undefined,
  permissions?: Partial<CreatorPermissionSet> | null,
): TitleAccessRule => {
  const normalizedRule = normalizeTitleAccessRule(requestedRule);
  const normalizedPermissions = normalizeCreatorPermissionSet(permissions ?? null);
  if (normalizedRule === "premium" && !normalizedPermissions.canPublishPremiumTitles) return "open";
  return normalizedRule;
};

export const sanitizeCreatorSponsorPlacement = (
  requestedPlacement: SponsorPlacement | string | null | undefined,
  permissions?: Partial<CreatorPermissionSet> | null,
): SponsorPlacement => {
  const normalizedPlacement = normalizeSponsorPlacement(requestedPlacement);
  const normalizedPermissions = normalizeCreatorPermissionSet(permissions ?? null);
  if (normalizedPlacement === "none") return "none";
  if (!normalizedPermissions.canUseSponsorPlacements) return "none";
  if (normalizedPlacement === "player_banner" && !normalizedPermissions.canUsePlayerAds) return "none";
  return normalizedPlacement;
};

export const sanitizeCreatorTitleMonetization = (options: {
  contentAccessRule?: TitleAccessRule | string | null;
  adsEnabled?: unknown;
  sponsorPlacement?: SponsorPlacement | string | null;
  sponsorLabel?: string | null;
  permissions?: Partial<CreatorPermissionSet> | null;
}) => {
  const normalizedPermissions = normalizeCreatorPermissionSet(options.permissions ?? null);
  const contentAccessRule = sanitizeCreatorTitleAccessRule(options.contentAccessRule, normalizedPermissions);
  const sponsorPlacement = sanitizeCreatorSponsorPlacement(options.sponsorPlacement, normalizedPermissions);
  const adsEnabled = !!options.adsEnabled
    && normalizedPermissions.canUseSponsorPlacements
    && normalizedPermissions.canUsePlayerAds
    && sponsorPlacement !== "none";
  const sponsorLabel = String(options.sponsorLabel ?? "").trim() || null;

  return {
    contentAccessRule,
    adsEnabled,
    sponsorPlacement,
    sponsorLabel,
  };
};

async function readOwnerPlatformAccessEnabled(authority: AccountSessionAuthorityBinding) {
  const memberships = await withAuthorityReadDeadline(readMyPlatformRoleMemberships(), []);
  return sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())
    && hasPlatformRoleMembership(memberships, ["owner"]);
}

export async function resolveMonetizationAccess(options: {
  accessRule?: MonetizationAccessRule | string | null;
  accessKey?: string | null;
  plan?: UserPlan | null;
  targetHint?: MonetizationTargetId | null;
  strictEntitlementRequired?: boolean;
}): Promise<ContentAccessDecision> {
  const runtime = getAppMonetizationRuntimeFeatures();
  const accessRule = normalizeMonetizationAccessRule(options.accessRule);
  const accessKey = String(options.accessKey ?? "").trim() || undefined;
  const operationAuthority = await readCurrentAccountSessionAuthority();
  const snapshot = await readMonetizationSnapshot({ userId: operationAuthority?.userId });
  const fallbackPlan = options.plan ?? await readLegacyUserPlan(operationAuthority);
  const snapshotPlan = derivePlanFromMonetizationSnapshot(snapshot, fallbackPlan);
  const policy = getMonetizationAccessPolicy({
    accessRule,
    targetHint: options.targetHint,
  });
  const entitlementBackedGate = buildMonetizationGateResolution(snapshot, policy);
  const ownerPlatformAccess = operationAuthority
    ? await readOwnerPlatformAccessEnabled(operationAuthority)
    : false;
  if (!operationAuthority
    || !sameAccountSessionAuthority(operationAuthority, await readCurrentAccountSessionAuthority())) {
    const monetization = {
      ...buildMonetizationGateResolution(createEmptyMonetizationSnapshot(snapshot.configuration, null), policy),
      issues: ["Account entitlement or Premium status is unavailable and unverified."],
    };
    return { allowed: accessRule === "open", reason: accessRule === "open" ? "allowed" : "entitlement_unknown",
      accessRule, requiresPremium: false, requiresPartyPass: false, accessKey,
      plan: { ...defaultPlan, updatedAt: Date.now() }, monetization };
  }
  const ownerPlatformAccessCanSatisfyGate = ownerPlatformAccess && !options.strictEntitlementRequired;
  const monetization: MonetizationGateResolution = ownerPlatformAccessCanSatisfyGate
    ? {
      ...entitlementBackedGate,
      ownerPlatformAccess: true,
      issues: entitlementBackedGate.issues.filter((issue) => !issue.toLowerCase().includes("entitlement")),
    }
    : entitlementBackedGate;
  const hasTrustedEntitlement = monetization.entitledTargetIds.length > 0;
  const plan: UserPlan = hasTrustedEntitlement && monetization.entitledTargetIds.includes("premium_subscription")
    ? {
      tier: "premium",
      adFree: true,
      watchPartyPerks: true,
      updatedAt: Date.now(),
      accessSource: "entitlement",
    }
    : ownerPlatformAccessCanSatisfyGate
      ? {
        tier: "premium",
        adFree: true,
        watchPartyPerks: true,
        updatedAt: Date.now(),
        ownerPlatformAccess: true,
        accessSource: "owner_platform_access",
      }
    : {
      ...snapshotPlan,
      tier: "free",
      adFree: false,
      watchPartyPerks: false,
      accessSource: snapshotPlan.accessSource ?? "local_legacy",
    };

  if (accessRule !== "open" && !monetization.entitlementAuthorityAvailable && !ownerPlatformAccessCanSatisfyGate) {
    return { allowed: false, reason: "entitlement_unknown", accessRule,
      requiresPremium: false, requiresPartyPass: false, accessKey, plan,
      monetization: { ...monetization, canPurchase: false } };
  }

  if (accessRule === "premium") {
    if (
      (hasTrustedEntitlement && (
        !FEATURE_FLAGS.monetization.subscriptions
        || !runtime.premiumEnabled
      ))
      || ownerPlatformAccessCanSatisfyGate
      || hasTrustedEntitlement
    ) {
      return {
        allowed: true,
        reason: "allowed",
        accessRule,
        requiresPremium: false,
        requiresPartyPass: false,
        accessKey,
        plan,
        monetization,
      };
    }

    return {
      allowed: false,
      reason: "premium_required",
      accessRule,
      requiresPremium: true,
      requiresPartyPass: false,
      accessKey,
      plan,
      monetization,
    };
  }

  if (accessRule === "party_pass") {
    if (
      (hasTrustedEntitlement && (
        !FEATURE_FLAGS.monetization.partyPass
        || !runtime.partyPassEnabled
      ))
      || ownerPlatformAccessCanSatisfyGate
      || hasTrustedEntitlement
    ) {
      return {
        allowed: true,
        reason: "allowed",
        accessRule,
        requiresPremium: false,
        requiresPartyPass: false,
        accessKey,
        plan,
        monetization,
      };
    }

    return {
      allowed: false,
      reason: "party_pass_required",
      accessRule,
      requiresPremium: false,
      requiresPartyPass: true,
      accessKey,
      plan,
      monetization,
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    accessRule: "open",
    requiresPremium: false,
    requiresPartyPass: false,
    accessKey,
    plan,
    monetization,
  };
}

export async function evaluateTitleAccess(options: {
  titleId?: string | null;
  accessRule?: TitleAccessRule | string | null;
  plan?: UserPlan | null;
}): Promise<ContentAccessDecision> {
  const accessRule = normalizeTitleAccessRule(options.accessRule);
  return resolveMonetizationAccess({
    accessRule,
    accessKey: String(options.titleId ?? "").trim() || undefined,
    plan: options.plan,
    targetHint: accessRule === "premium" ? "paid_title_access" : null,
  });
}

export async function resolveSponsorPlacement(options: {
  accessRule?: TitleAccessRule | string | null;
  placement?: SponsorPlacement | string | null;
  adsEnabled?: unknown;
  plan?: UserPlan | null;
  isRoomContext?: boolean;
  isLiveContext?: boolean;
}): Promise<SponsorPlacement> {
  const runtime = getAppMonetizationRuntimeFeatures();
  const placement = normalizeSponsorPlacement(options.placement);
  if (!FEATURE_FLAGS.monetization.ads || !runtime.sponsorPlacementsEnabled) return "none";
  if (!options.adsEnabled || placement === "none") return "none";
  if (options.isRoomContext || options.isLiveContext) return "none";
  if (normalizeTitleAccessRule(options.accessRule) !== "open") return "none";

  const plan = options.plan ?? await readUserPlan();
  if (plan.adFree) return "none";
  if (placement === "player_banner" && !runtime.playerBannerEnabled) return "none";

  return placement;
}

export function getAdMode(plan: UserPlan, phase: "pre" | "mid" | "banner"): AdMode {
  const runtime = getAppMonetizationRuntimeFeatures();
  if (!FEATURE_FLAGS.monetization.ads || plan.adFree) return "none";

  if (phase === "pre" && FEATURE_FLAGS.monetization.preRollAds) return "pre-roll";
  if (phase === "mid" && FEATURE_FLAGS.monetization.midRollAds && runtime.playerMidRollEnabled) return "mid-roll";
  if (phase === "banner" && FEATURE_FLAGS.monetization.bannerAds && runtime.playerBannerEnabled) return "banner";
  return "none";
}

export function getMidRollTriggerMillis(durationMillis: number): number {
  if (durationMillis <= 0) return 0;
  return Math.floor(durationMillis * 0.45);
}

export function shouldTriggerMidRoll(
  positionMillis: number,
  durationMillis: number,
  alreadyTriggered: boolean,
): boolean {
  if (alreadyTriggered) return false;
  if (durationMillis <= 0) return false;
  const triggerPoint = getMidRollTriggerMillis(durationMillis);
  return positionMillis >= triggerPoint;
}
