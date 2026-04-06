import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CustomerInfo, PurchasesOffering, PurchasesPackage, PurchasesOfferings } from "react-native-purchases";

import { FEATURE_FLAGS, getAppMonetizationRuntimeFeatures } from "./featureFlags";
import { debugLog, reportRuntimeError } from "./logger";
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
import { supabase } from "./supabase";

export type PlanTier = "free" | "premium";
export type MonetizationAccessRule = "open" | "party_pass" | "premium";
export type TitleAccessRule = "open" | "premium";
export type SponsorPlacement = "none" | "detail_banner" | "player_banner";

export type UserPlan = {
  tier: PlanTier;
  adFree: boolean;
  watchPartyPerks: boolean;
  updatedAt: number;
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

export type ContentAccessReason = "allowed" | "party_pass_required" | "premium_required";

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
  status: "entitled" | "available" | "unavailable";
  hasEntitlement: boolean;
  offeringAvailable: boolean;
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

const USER_PLAN_KEY = "@chillywood/user-plan";
const SUBSCRIPTIONS_TABLE = "user_subscriptions";
const PARTY_PASS_TABLE = "watch_party_pass_unlocks";
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
    summary: "One-time paid-content access for titles when creator-paid unlocks go live.",
    kind: "one_time_unlock",
    offeringId: "paid-content",
    entitlementIds: ["paid_content"],
    accessRule: "premium",
  },
  premium_live_access: {
    id: "premium_live_access",
    label: "Premium Live Access",
    summary: "Premium entry for live-first sessions that should stay outside the free baseline.",
    kind: "one_time_unlock",
    offeringId: "premium-live",
    entitlementIds: ["premium_live", "premium"],
    accessRule: "premium",
  },
  premium_watch_party_access: {
    id: "premium_watch_party_access",
    label: "Watch-Party Access",
    summary: "Premium shared-room access for Watch-Party Live and paid room entry.",
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

export const createEmptyMonetizationGateResolution = (
  snapshotStatus: MonetizationGateResolution["snapshotStatus"] = "disabled",
  issues: string[] = [],
): MonetizationGateResolution => ({
  qualifyingTargetIds: [],
  entitledTargetIds: [],
  availableTargetIds: [],
  canPurchase: false,
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
  status: "unavailable",
  hasEntitlement: false,
  offeringAvailable: false,
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

type CreatorPermissionRow = {
  user_id?: string | null;
  can_use_party_pass_rooms?: boolean | null;
  can_use_premium_rooms?: boolean | null;
  can_publish_premium_titles?: boolean | null;
  can_use_sponsor_placements?: boolean | null;
  can_use_player_ads?: boolean | null;
  updated_at?: string | null;
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
  const localValue = value && !("user_id" in value) ? value as Partial<CreatorPermissionSet> : null;
  const rowValue = value && "user_id" in value ? value as CreatorPermissionRow : null;
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

const getOfferingByIdentifier = (
  offerings: PurchasesOfferings | null,
  offeringId: string,
): PurchasesOffering | null => {
  if (!offerings) return null;
  return offerings.all[offeringId] ?? null;
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
  const offering = getOfferingByIdentifier(offerings, definition.offeringId);
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
  if (subscriptionPeriod === "P1W") return "Billed weekly through Google Play.";
  if (subscriptionPeriod === "P1M") return "Billed monthly through Google Play.";
  if (subscriptionPeriod === "P3M") return "Billed every 3 months through Google Play.";
  if (subscriptionPeriod === "P6M") return "Billed every 6 months through Google Play.";
  if (subscriptionPeriod === "P1Y") return "Billed yearly through Google Play.";

  const packageType = String(pkg.packageType ?? "").trim().toUpperCase();
  if (packageType === "LIFETIME") return "One-time unlock through Google Play.";

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
      : "Pricing is coming from the current RevenueCat offering.",
    badge: formatPackageBadge(selectedPackage),
    packageId: String(selectedPackage.identifier ?? "").trim() || undefined,
  };
};

const hasActiveEntitlement = (
  customerInfo: CustomerInfo | null,
  entitlementIds: string[],
): boolean => {
  if (!customerInfo) return false;
  return entitlementIds.some((entitlementId) => {
    const normalizedId = String(entitlementId ?? "").trim();
    if (!normalizedId) return false;
    return !!customerInfo.entitlements.active[normalizedId];
  });
};

const buildMonetizationTargetState = (
  definition: MonetizationTargetDefinition,
  customerInfo: CustomerInfo | null,
  offerings: PurchasesOfferings | null,
): MonetizationTargetState => {
  const offering = getOfferingByIdentifier(offerings, definition.offeringId);
  const recommendedPackage = selectRecommendedPackage(offering);
  const hasEntitlement = hasActiveEntitlement(customerInfo, definition.entitlementIds);
  const packageIds = offering?.availablePackages.map((entry) => String(entry.identifier ?? "").trim()).filter(Boolean) ?? [];

  if (hasEntitlement) {
    return {
      definition,
      status: "entitled",
      hasEntitlement: true,
      offeringAvailable: !!offering,
      packageCount: packageIds.length,
      availablePackageIds: packageIds,
      recommendedPackageId: recommendedPackage ? String(recommendedPackage.identifier ?? "").trim() : undefined,
    };
  }

  if (offering && packageIds.length > 0) {
    return {
      definition,
      status: "available",
      hasEntitlement: false,
      offeringAvailable: true,
      packageCount: packageIds.length,
      availablePackageIds: packageIds,
      recommendedPackageId: recommendedPackage ? String(recommendedPackage.identifier ?? "").trim() : undefined,
    };
  }

  return {
    definition,
    status: "unavailable",
    hasEntitlement: false,
    offeringAvailable: !!offering,
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

const buildMonetizationGateResolution = (
  snapshot: MonetizationSnapshot,
  policy: MonetizationAccessPolicy,
): MonetizationGateResolution => {
  const entitledTargetIds = policy.qualifyingTargetIds.filter((targetId) => snapshot.targets[targetId]?.hasEntitlement);
  const availableTargetIds = policy.qualifyingTargetIds.filter((targetId) => {
    const target = snapshot.targets[targetId];
    return !!target?.offeringAvailable && target.packageCount > 0;
  });
  const purchaseTargetId = [policy.primaryTargetId, ...policy.qualifyingTargetIds]
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
    snapshotStatus: snapshot.status,
    issues: [...snapshot.issues],
  };
};

const setCachedMonetizationSnapshot = (snapshot: MonetizationSnapshot) => {
  cachedMonetizationSnapshot = snapshot;
  notifyMonetizationSnapshotListeners();
  return snapshot;
};

export function getMonetizationCatalog() {
  return MONETIZATION_TARGETS;
}

export function getCachedMonetizationSnapshot() {
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
}): Promise<MonetizationSnapshot> {
  const requestedUserId = normalizeOptionalIdentity(options?.userId);
  const signedInUserId = requestedUserId ? "" : normalizeOptionalIdentity(await getSignedInUserId());
  const userId = requestedUserId || signedInUserId || null;
  const configuration = configureRevenueCatOnce();
  const baseSnapshot = createEmptyMonetizationSnapshot(configuration, userId);

  if (!configuration.shouldConfigure) {
    return setCachedMonetizationSnapshot(baseSnapshot);
  }

  try {
    const identity = await syncRevenueCatCustomerIdentity(userId);
    const [canMakePayments, customerInfo, offerings] = await Promise.all([
      canMakeRevenueCatPurchases(),
      readRevenueCatCustomerInfo({ refresh: !!options?.forceRefresh }),
      readRevenueCatOfferings(),
    ]);

    const issues = [...baseSnapshot.issues];
    if (!canMakePayments) {
      issues.push("Google Play billing is not currently available on this device/account.");
    }
    if (!customerInfo) {
      issues.push("Customer info is unavailable from RevenueCat.");
    }
    if (!offerings) {
      issues.push("Offerings are unavailable from RevenueCat.");
    }

    const snapshot: MonetizationSnapshot = {
      status: !canMakePayments
        ? "store_unavailable"
        : customerInfo && offerings
          ? "ready"
          : "partial",
      configuration,
      userId,
      revenueCatAppUserId: identity.appUserId,
      isAnonymousCustomer: identity.isAnonymous,
      canMakePayments,
      customerInfoLoaded: !!customerInfo,
      offeringsLoaded: !!offerings,
      currentOfferingId: offerings?.current?.identifier ?? null,
      availableOfferingIds: Object.keys(offerings?.all ?? {}),
      activeEntitlementIds: Object.keys(customerInfo?.entitlements.active ?? {}),
      activeProductIds: customerInfo?.activeSubscriptions ?? [],
      targets: {
        premium_subscription: buildMonetizationTargetState(MONETIZATION_TARGETS.premium_subscription, customerInfo, offerings),
        paid_title_access: buildMonetizationTargetState(MONETIZATION_TARGETS.paid_title_access, customerInfo, offerings),
        premium_live_access: buildMonetizationTargetState(MONETIZATION_TARGETS.premium_live_access, customerInfo, offerings),
        premium_watch_party_access: buildMonetizationTargetState(MONETIZATION_TARGETS.premium_watch_party_access, customerInfo, offerings),
      },
      issues,
      updatedAt: Date.now(),
    };

    debugLog("monetization", "Monetization snapshot refreshed", {
      activeEntitlements: snapshot.activeEntitlementIds.join(","),
      appUserId: snapshot.revenueCatAppUserId,
      availableOfferings: snapshot.availableOfferingIds.join(","),
      status: snapshot.status,
      userId: snapshot.userId,
    });

    return setCachedMonetizationSnapshot(snapshot);
  } catch (error) {
    reportRuntimeError("monetization-snapshot", error, {
      userId: userId ?? "anonymous",
    });
    return setCachedMonetizationSnapshot({
      ...baseSnapshot,
      status: "partial",
      issues: [...baseSnapshot.issues, "Failed to refresh the monetization snapshot."],
      updatedAt: Date.now(),
    });
  }
}

export async function bootstrapMonetizationFoundation(userId?: string | null) {
  return readMonetizationSnapshot({ userId });
}

export async function purchaseMonetizationTarget(
  targetId: MonetizationTargetId,
  options?: { packageId?: string | null; userId?: string | null },
): Promise<MonetizationPurchaseOutcome> {
  const target = MONETIZATION_TARGETS[targetId];
  const snapshot = await readMonetizationSnapshot({
    forceRefresh: true,
    userId: options?.userId,
  });
  const targetState = snapshot.targets[targetId];

  if (!snapshot.configuration.shouldConfigure) {
    return {
      ok: false,
      target: targetId,
      snapshot,
      customerInfo: null,
      message: snapshot.configuration.reason ?? "RevenueCat is not configured for this build.",
    };
  }

  if (!snapshot.canMakePayments) {
    return {
      ok: false,
      target: targetId,
      snapshot,
      customerInfo: null,
      message: "Google Play billing is not currently available on this device/account.",
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
  const offering = getOfferingByIdentifier(offerings, target.offeringId);
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
      message: `${target.label} is not available in the current RevenueCat offerings yet.`,
    };
  }

  try {
    const result = await purchaseRevenueCatPackage(selectedPackage);
    const refreshedSnapshot = await readMonetizationSnapshot({
      forceRefresh: true,
      userId: options?.userId,
    });

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
    reportRuntimeError("monetization-purchase", error, {
      packageId: String(selectedPackage.identifier ?? "").trim() || "unknown",
      target: targetId,
    });

    return {
      ok: false,
      target: targetId,
      snapshot: await readMonetizationSnapshot({ userId: options?.userId }),
      customerInfo: null,
      message: `${target.label} purchase could not be completed.`,
      packageId: String(selectedPackage.identifier ?? "").trim() || undefined,
    };
  }
}

export async function restoreMonetizationAccess(options?: { userId?: string | null }): Promise<MonetizationRestoreOutcome> {
  const snapshot = await readMonetizationSnapshot({
    forceRefresh: true,
    userId: options?.userId,
  });

  if (!snapshot.configuration.shouldConfigure) {
    return {
      ok: false,
      snapshot,
      customerInfo: null,
      message: snapshot.configuration.reason ?? "RevenueCat is not configured for this build.",
    };
  }

  try {
    const customerInfo = await restoreRevenueCatPurchases();
    const refreshedSnapshot = await readMonetizationSnapshot({
      forceRefresh: true,
      userId: options?.userId,
    });

    return {
      ok: true,
      snapshot: refreshedSnapshot,
      customerInfo,
      message: "Purchases restored.",
    };
  } catch (error) {
    reportRuntimeError("monetization-restore", error, {
      userId: options?.userId ?? "anonymous",
    });

    return {
      ok: false,
      snapshot: await readMonetizationSnapshot({ userId: options?.userId }),
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

  if (primaryTargetId === "paid_title_access") {
    return {
      kicker: "TITLE ACCESS",
      title: "Unlock This Title",
      body: `This title is gated. Unlock it directly when title access is available, or use an active ${appDisplayName} Premium subscription.`,
      actionLabel: "Unlock Title",
    };
  }

  if (primaryTargetId === "premium_live_access") {
    return {
      kicker: "LIVE ACCESS",
      title: "Unlock Live Access",
      body: `This live entry point requires premium live access or an active ${appDisplayName} Premium subscription before you can continue.`,
      actionLabel: "Unlock Live Access",
    };
  }

  if (gateReason === "party_pass_required") {
    return {
      kicker: "WATCH-PARTY ACCESS",
      title: "Unlock This Room",
      body: `This room uses Watch-Party access. Unlock it for shared entry, or use an active ${appDisplayName} Premium subscription when that offer is available.`,
      actionLabel: "Unlock Access",
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
  appDisplayName?: string;
  premiumUpsellTitle?: string;
  premiumUpsellBody?: string;
}): Promise<MonetizationAccessSheetState> {
  const snapshot = await readMonetizationSnapshot({
    forceRefresh: true,
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
  const offerings = snapshot.offeringsLoaded ? await readRevenueCatOfferings() : null;
  const offer = targetId && targetState
    ? buildMonetizationAccessSheetOffer({
        targetId,
        targetState,
        packageId: options.gate?.monetization?.recommendedPackageId,
        offerings,
      })
    : null;

  if (!snapshot.configuration.shouldConfigure) {
    return {
      snapshot,
      presentation,
      primaryAction: "retry",
      primaryLabel: "Monetization Disabled",
      primaryDisabled: true,
      helperKicker: "MONETIZATION STATUS",
      helperBody: snapshot.configuration.reason ?? "RevenueCat is not configured for this build yet.",
      helperTone: "warning",
      offer,
      canRestore: false,
      canManage: false,
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
        ?? "Google Play billing is not currently available on this device/account.",
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
      primaryLabel: "Retry Offer Lookup",
      primaryDisabled: false,
      helperKicker: "OFFER STATUS",
      helperBody: snapshot.issues[0]
        ?? "This purchase path is not available in the current RevenueCat offering configuration yet.",
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
    primaryLabel: presentation.actionLabel,
    primaryDisabled: false,
    helperKicker: "LIVE OFFER",
    helperBody: "This pricing is coming from the current RevenueCat offering on this Android dev build.",
    helperTone: "neutral",
    offer,
    canRestore: true,
    canManage: true,
  };
}

export async function purchaseBlockedAccess(options: {
  gate: GateLike | null | undefined;
  userId?: string | null;
}): Promise<MonetizationAccessPurchaseOutcome> {
  const snapshot = await readMonetizationSnapshot({
    forceRefresh: true,
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

async function readLocalPlan(): Promise<UserPlan> {
  try {
    const raw = await AsyncStorage.getItem(USER_PLAN_KEY);
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

async function saveLocalPlan(plan: UserPlan): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_PLAN_KEY, JSON.stringify(plan));
  } catch {
    // ignore storage failures
  }
}

async function readLegacyUserPlan(): Promise<UserPlan> {
  const local = await readLocalPlan();
  const userId = await getSignedInUserId();
  if (!FEATURE_FLAGS.monetization.subscriptions) return local;
  if (!userId) return defaultPlan;

  try {
    const { data, error } = await supabase
      .from(SUBSCRIPTIONS_TABLE)
      .select("tier,updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return local;

    const tier: PlanTier = data.tier === "premium" ? "premium" : "free";
    const merged: UserPlan = {
      tier,
      adFree: tier === "premium",
      watchPartyPerks: tier === "premium",
      updatedAt: new Date(data.updated_at ?? Date.now()).getTime(),
    };

    await saveLocalPlan(merged);
    return merged;
  } catch {
    return local;
  }
}

async function hasLegacyPartyPassGrant(partyId: string): Promise<boolean> {
  const safePartyId = String(partyId ?? "").trim();
  if (!safePartyId) return false;

  const userId = await getSignedInUserId();
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from(PARTY_PASS_TABLE)
      .select("id")
      .eq("room_id", safePartyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
}

export async function readUserPlan(): Promise<UserPlan> {
  const legacy = await readLegacyUserPlan();
  const runtime = getAppMonetizationRuntimeFeatures();
  if (!FEATURE_FLAGS.monetization.subscriptions || !runtime.premiumEnabled) return legacy;

  const snapshot = await readMonetizationSnapshot();
  if (!snapshot.configuration.shouldConfigure || !snapshot.customerInfoLoaded) {
    return legacy;
  }

  const plan = derivePlanFromMonetizationSnapshot(snapshot, legacy);
  await saveLocalPlan(plan);
  return plan;
}

export async function setUserPlan(tier: PlanTier): Promise<UserPlan> {
  const userId = await getSignedInUserId();
  if (!userId) {
    throw new Error("Sign in is required before changing premium access.");
  }

  const next: UserPlan = {
    tier,
    adFree: tier === "premium",
    watchPartyPerks: tier === "premium",
    updatedAt: Date.now(),
  };

  await saveLocalPlan(next);
  if (!FEATURE_FLAGS.monetization.subscriptions) return next;

  try {
    await supabase.from(SUBSCRIPTIONS_TABLE).upsert(
      {
        user_id: userId,
        tier,
        updated_at: new Date(next.updatedAt).toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch {
    // table may not exist yet; local fallback still works
  }

  return next;
}

export async function hasPremiumAccess(): Promise<boolean> {
  const runtime = getAppMonetizationRuntimeFeatures();
  if (!FEATURE_FLAGS.monetization.subscriptions || !runtime.premiumEnabled) return true;
  const snapshot = await readMonetizationSnapshot();
  if (snapshot.configuration.shouldConfigure && snapshot.customerInfoLoaded) {
    return snapshot.targets.premium_subscription.hasEntitlement;
  }

  const plan = await readLegacyUserPlan();
  return plan.tier === "premium";
}

export async function hasPartyPassAccess(partyId: string): Promise<boolean> {
  const runtime = getAppMonetizationRuntimeFeatures();
  if (!FEATURE_FLAGS.monetization.partyPass || !runtime.partyPassEnabled) return true;

  const snapshot = await readMonetizationSnapshot();
  if (snapshot.configuration.shouldConfigure && snapshot.customerInfoLoaded) {
    if (
      snapshot.targets.premium_subscription.hasEntitlement
      || snapshot.targets.premium_watch_party_access.hasEntitlement
    ) {
      return true;
    }
  }

  const plan = await readLegacyUserPlan();
  if (plan.watchPartyPerks) return true;
  return hasLegacyPartyPassGrant(partyId);
}

export async function unlockPartyPass(partyId: string): Promise<boolean> {
  const runtime = getAppMonetizationRuntimeFeatures();
  if (!FEATURE_FLAGS.monetization.partyPass || !runtime.partyPassEnabled) return true;

  const userId = await getSignedInUserId();
  if (!userId) return false;

  try {
    const { error } = await supabase.from(PARTY_PASS_TABLE).upsert(
      {
        room_id: partyId,
        user_id: userId,
        unlocked_at: new Date().toISOString(),
      },
      { onConflict: "room_id,user_id" },
    );

    return !error;
  } catch {
    return false;
  }
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
    return normalizeCreatorPermissionSet(data as CreatorPermissionRow, safeUserId);
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

  const payload = {
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

export async function resolveMonetizationAccess(options: {
  accessRule?: MonetizationAccessRule | string | null;
  accessKey?: string | null;
  plan?: UserPlan | null;
  targetHint?: MonetizationTargetId | null;
}): Promise<ContentAccessDecision> {
  const runtime = getAppMonetizationRuntimeFeatures();
  const accessRule = normalizeMonetizationAccessRule(options.accessRule);
  const accessKey = String(options.accessKey ?? "").trim() || undefined;
  const snapshot = await readMonetizationSnapshot();
  const fallbackPlan = options.plan ?? await readLegacyUserPlan();
  const plan = snapshot.configuration.shouldConfigure && snapshot.customerInfoLoaded
    ? derivePlanFromMonetizationSnapshot(snapshot, fallbackPlan)
    : fallbackPlan;
  const policy = getMonetizationAccessPolicy({
    accessRule,
    targetHint: options.targetHint,
  });
  const monetization = buildMonetizationGateResolution(snapshot, policy);

  if (accessRule === "premium") {
    if (
      !FEATURE_FLAGS.monetization.subscriptions
      || !runtime.premiumEnabled
      || plan.tier === "premium"
      || monetization.entitledTargetIds.length > 0
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
      !FEATURE_FLAGS.monetization.partyPass
      || !runtime.partyPassEnabled
      || plan.watchPartyPerks
      || monetization.entitledTargetIds.length > 0
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

    const hasAccess = accessKey ? await hasLegacyPartyPassGrant(accessKey) : false;
    if (hasAccess) {
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
