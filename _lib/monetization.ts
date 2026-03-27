import AsyncStorage from "@react-native-async-storage/async-storage";
import { FEATURE_FLAGS, getAppMonetizationRuntimeFeatures } from "./featureFlags";
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

export async function readUserPlan(): Promise<UserPlan> {
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
  const plan = await readUserPlan();
  return plan.tier === "premium";
}

export async function hasPartyPassAccess(partyId: string): Promise<boolean> {
  const runtime = getAppMonetizationRuntimeFeatures();
  if (!FEATURE_FLAGS.monetization.partyPass || !runtime.partyPassEnabled) return true;

  const plan = await readUserPlan();
  if (plan.watchPartyPerks) return true;

  const userId = await getSignedInUserId();
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from(PARTY_PASS_TABLE)
      .select("id")
      .eq("room_id", partyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
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
  const safeUserId = String(userId ?? await getSignedInUserId()).trim();
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
}): Promise<ContentAccessDecision> {
  const runtime = getAppMonetizationRuntimeFeatures();
  const accessRule = normalizeMonetizationAccessRule(options.accessRule);
  const accessKey = String(options.accessKey ?? "").trim().toUpperCase() || undefined;
  const plan = options.plan ?? await readUserPlan();

  if (accessRule === "premium") {
    if (!FEATURE_FLAGS.monetization.subscriptions || !runtime.premiumEnabled || plan.tier === "premium") {
      return {
        allowed: true,
        reason: "allowed",
        accessRule,
        requiresPremium: false,
        requiresPartyPass: false,
        accessKey,
        plan,
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
    };
  }

  if (accessRule === "party_pass") {
    if (!FEATURE_FLAGS.monetization.partyPass || !runtime.partyPassEnabled || plan.watchPartyPerks) {
      return {
        allowed: true,
        reason: "allowed",
        accessRule,
        requiresPremium: false,
        requiresPartyPass: false,
        accessKey,
        plan,
      };
    }

    const hasAccess = accessKey ? await hasPartyPassAccess(accessKey) : false;
    if (hasAccess) {
      return {
        allowed: true,
        reason: "allowed",
        accessRule,
        requiresPremium: false,
        requiresPartyPass: false,
        accessKey,
        plan,
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
    accessKey: String(options.titleId ?? "").trim().toUpperCase() || undefined,
    plan: options.plan,
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
