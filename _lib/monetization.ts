import AsyncStorage from "@react-native-async-storage/async-storage";
import { FEATURE_FLAGS } from "./featureFlags";
import { supabase } from "./supabase";

export type PlanTier = "free" | "premium";

export type UserPlan = {
  tier: PlanTier;
  adFree: boolean;
  watchPartyPerks: boolean;
  updatedAt: number;
};

export type AdMode = "none" | "pre-roll" | "mid-roll" | "banner";

const USER_PLAN_KEY = "@chillywood/user-plan";
const SUBSCRIPTIONS_TABLE = "user_subscriptions";
const PARTY_PASS_TABLE = "watch_party_pass_unlocks";

const defaultPlan: UserPlan = {
  tier: "free",
  adFree: false,
  watchPartyPerks: false,
  updatedAt: Date.now(),
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
  if (!userId || !FEATURE_FLAGS.monetization.subscriptions) return local;

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
  const next: UserPlan = {
    tier,
    adFree: tier === "premium",
    watchPartyPerks: tier === "premium",
    updatedAt: Date.now(),
  };

  await saveLocalPlan(next);

  const userId = await getSignedInUserId();
  if (!userId || !FEATURE_FLAGS.monetization.subscriptions) return next;

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
  const plan = await readUserPlan();
  return plan.tier === "premium";
}

export async function hasPartyPassAccess(partyId: string): Promise<boolean> {
  if (!FEATURE_FLAGS.monetization.partyPass) return true;

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
  if (!FEATURE_FLAGS.monetization.partyPass) return true;

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

export function getAdMode(plan: UserPlan, phase: "pre" | "mid" | "banner"): AdMode {
  if (!FEATURE_FLAGS.monetization.ads || plan.adFree) return "none";

  if (phase === "pre" && FEATURE_FLAGS.monetization.preRollAds) return "pre-roll";
  if (phase === "mid" && FEATURE_FLAGS.monetization.midRollAds) return "mid-roll";
  if (phase === "banner" && FEATURE_FLAGS.monetization.bannerAds) return "banner";
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
