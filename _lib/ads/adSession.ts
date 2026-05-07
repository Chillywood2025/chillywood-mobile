import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ADS_LAUNCH_CONFIG_DEFAULTS,
  type AdsLaunchConfig,
  type AdsPlacementKind,
} from "./adConfig";

export type AdCounterValues = {
  interstitial: number;
  native_feed: number;
};

export type AdSessionSnapshot = AdCounterValues & {
  activeBrowsingSeconds: number;
  lastInterstitialShowAt: number | null;
  sessionStartedAt: number;
  updatedAt: number;
};

export type AdDailyCounterSnapshot = AdCounterValues & {
  userKey: string;
  localDate: string;
  storageKey: string;
  updatedAt: number;
};

export type AdCapSnapshot = {
  placementKind: AdsPlacementKind;
  sessionCount: number;
  dailyCount: number;
  sessionLimit: number;
  dailyLimit: number;
  remainingSessionCount: number;
  remainingDailyCount: number;
  activeBrowsingSeconds: number;
  firstInterstitialDelayRemainingSeconds: number;
  interstitialSpacingRemainingSeconds: number;
};

export type RecordPlaceholderAdShowResult = AdCapSnapshot & {
  recorded: boolean;
  reason: string;
};

const ADS_DAILY_COUNTERS_STORAGE_PREFIX = "@chillywood/ads/daily-placeholder-shows";
const ADS_ANONYMOUS_COUNTER_KEY = "@chillywood/ads/anonymous-counter-key";

const nowMs = () => Date.now();

let sessionSnapshot: AdSessionSnapshot = {
  interstitial: 0,
  native_feed: 0,
  activeBrowsingSeconds: 0,
  lastInterstitialShowAt: null,
  sessionStartedAt: nowMs(),
  updatedAt: nowMs(),
};

const clampSeconds = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), 60 * 60);
};

const toLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeUserKey = async (userId?: string | null) => {
  const normalizedUserId = String(userId ?? "").trim();
  if (normalizedUserId) return `user:${normalizedUserId}`;

  try {
    const existing = String(await AsyncStorage.getItem(ADS_ANONYMOUS_COUNTER_KEY) ?? "").trim();
    if (existing) return `anonymous:${existing}`;

    const generated = `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(ADS_ANONYMOUS_COUNTER_KEY, generated);
    return `anonymous:${generated}`;
  } catch {
    return "anonymous:storage-unavailable";
  }
};

export const getAdSessionSnapshot = (): AdSessionSnapshot => ({
  ...sessionSnapshot,
});

export const resetAdSessionCounters = () => {
  const timestamp = nowMs();
  sessionSnapshot = {
    interstitial: 0,
    native_feed: 0,
    activeBrowsingSeconds: 0,
    lastInterstitialShowAt: null,
    sessionStartedAt: timestamp,
    updatedAt: timestamp,
  };
  return getAdSessionSnapshot();
};

export const addActiveBrowsingSeconds = (
  seconds: number,
  options?: {
    canTrack?: boolean;
    isAdFree?: boolean | null;
    now?: number;
  },
) => {
  if (!options?.canTrack || options.isAdFree !== false) return getAdSessionSnapshot();

  const increment = clampSeconds(seconds);
  if (increment <= 0) return getAdSessionSnapshot();

  sessionSnapshot = {
    ...sessionSnapshot,
    activeBrowsingSeconds: sessionSnapshot.activeBrowsingSeconds + increment,
    updatedAt: options.now ?? nowMs(),
  };

  return getAdSessionSnapshot();
};

export const getAdDailyStorageKey = async (
  userId?: string | null,
  date = new Date(),
) => {
  const userKey = await normalizeUserKey(userId);
  const localDate = toLocalDateKey(date);
  const storageKey = `${ADS_DAILY_COUNTERS_STORAGE_PREFIX}/${encodeURIComponent(userKey)}/${localDate}`;

  return {
    userKey,
    localDate,
    storageKey,
  };
};

const emptyDailyCounters = (seed: {
  userKey: string;
  localDate: string;
  storageKey: string;
}): AdDailyCounterSnapshot => ({
  ...seed,
  interstitial: 0,
  native_feed: 0,
  updatedAt: nowMs(),
});

export const loadDailyAdCounters = async (
  userId?: string | null,
  date = new Date(),
): Promise<AdDailyCounterSnapshot> => {
  const seed = await getAdDailyStorageKey(userId, date);

  try {
    const raw = await AsyncStorage.getItem(seed.storageKey);
    if (!raw) return emptyDailyCounters(seed);

    const parsed = JSON.parse(raw) as Partial<AdDailyCounterSnapshot>;
    return {
      ...seed,
      interstitial: Math.max(0, Number.parseInt(String(parsed.interstitial ?? 0), 10) || 0),
      native_feed: Math.max(0, Number.parseInt(String(parsed.native_feed ?? 0), 10) || 0),
      updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : nowMs(),
    };
  } catch {
    return emptyDailyCounters(seed);
  }
};

export const saveDailyAdCounters = async (
  counters: AdDailyCounterSnapshot,
): Promise<AdDailyCounterSnapshot> => {
  const next = {
    ...counters,
    interstitial: Math.max(0, Math.floor(counters.interstitial)),
    native_feed: Math.max(0, Math.floor(counters.native_feed)),
    updatedAt: nowMs(),
  };

  try {
    await AsyncStorage.setItem(next.storageKey, JSON.stringify(next));
  } catch {
    // Daily counters are local guardrails only in V1A; storage failure keeps the app conservative.
  }

  return next;
};

export const getSessionAdLimit = (
  placementKind: AdsPlacementKind,
  config: AdsLaunchConfig = ADS_LAUNCH_CONFIG_DEFAULTS,
  activeBrowsingSeconds = sessionSnapshot.activeBrowsingSeconds,
) => {
  const longUseUnlocked = activeBrowsingSeconds >= config.long_use_minutes * 60;

  if (placementKind === "interstitial") {
    return config.session_interstitial_base_cap
      + (longUseUnlocked ? config.long_use_interstitial_extra_cap : 0);
  }

  return config.session_native_base_cap
    + (longUseUnlocked ? config.long_use_native_extra_cap : 0);
};

export const getDailyAdLimit = (
  placementKind: AdsPlacementKind,
  config: AdsLaunchConfig = ADS_LAUNCH_CONFIG_DEFAULTS,
) => (
  placementKind === "interstitial"
    ? config.daily_interstitial_cap
    : config.daily_native_cap
);

const getCounterValue = (
  counters: AdCounterValues,
  placementKind: AdsPlacementKind,
) => counters[placementKind];

export const getAdCapSnapshot = async (
  placementKind: AdsPlacementKind,
  options?: {
    config?: AdsLaunchConfig;
    userId?: string | null;
    now?: Date;
    activeBrowsingSeconds?: number;
  },
): Promise<AdCapSnapshot> => {
  const config = options?.config ?? ADS_LAUNCH_CONFIG_DEFAULTS;
  const session = getAdSessionSnapshot();
  const daily = await loadDailyAdCounters(options?.userId, options?.now ?? new Date());
  const activeBrowsingSeconds = Math.max(
    0,
    Math.floor(options?.activeBrowsingSeconds ?? session.activeBrowsingSeconds),
  );
  const sessionCount = getCounterValue(session, placementKind);
  const dailyCount = getCounterValue(daily, placementKind);
  const sessionLimit = getSessionAdLimit(placementKind, config, activeBrowsingSeconds);
  const dailyLimit = getDailyAdLimit(placementKind, config);
  const nowTime = options?.now?.getTime() ?? nowMs();
  const firstInterstitialDelayRemainingSeconds = placementKind === "interstitial"
    ? Math.max(0, config.min_seconds_before_first_interstitial - activeBrowsingSeconds)
    : 0;
  const interstitialSpacingRemainingSeconds = placementKind === "interstitial" && session.lastInterstitialShowAt
    ? Math.max(
        0,
        config.min_seconds_between_interstitials
          - Math.floor((nowTime - session.lastInterstitialShowAt) / 1000),
      )
    : 0;

  return {
    placementKind,
    sessionCount,
    dailyCount,
    sessionLimit,
    dailyLimit,
    remainingSessionCount: Math.max(0, sessionLimit - sessionCount),
    remainingDailyCount: Math.max(0, dailyLimit - dailyCount),
    activeBrowsingSeconds,
    firstInterstitialDelayRemainingSeconds,
    interstitialSpacingRemainingSeconds,
  };
};

export const recordPlaceholderAdShow = async (
  placementKind: AdsPlacementKind,
  options: {
    eligible: boolean;
    isAdFree?: boolean | null;
    config?: AdsLaunchConfig;
    userId?: string | null;
    now?: Date;
    activeBrowsingSeconds?: number;
  },
): Promise<RecordPlaceholderAdShowResult> => {
  const cap = await getAdCapSnapshot(placementKind, {
    config: options.config,
    userId: options.userId,
    now: options.now,
    activeBrowsingSeconds: options.activeBrowsingSeconds,
  });

  if (!options.eligible) {
    return { ...cap, recorded: false, reason: "not_eligible" };
  }

  if (options.isAdFree !== false) {
    return { ...cap, recorded: false, reason: "ad_free_or_unknown" };
  }

  if (cap.remainingSessionCount <= 0) {
    return { ...cap, recorded: false, reason: "session_cap_exhausted" };
  }

  if (cap.remainingDailyCount <= 0) {
    return { ...cap, recorded: false, reason: "daily_cap_exhausted" };
  }

  const daily = await loadDailyAdCounters(options.userId, options.now ?? new Date());
  const timestamp = options.now?.getTime() ?? nowMs();

  sessionSnapshot = {
    ...sessionSnapshot,
    [placementKind]: sessionSnapshot[placementKind] + 1,
    lastInterstitialShowAt: placementKind === "interstitial"
      ? timestamp
      : sessionSnapshot.lastInterstitialShowAt,
    updatedAt: timestamp,
  };

  await saveDailyAdCounters({
    ...daily,
    [placementKind]: daily[placementKind] + 1,
  });

  const nextCap = await getAdCapSnapshot(placementKind, {
    config: options.config,
    userId: options.userId,
    now: options.now,
    activeBrowsingSeconds: options.activeBrowsingSeconds,
  });

  return { ...nextCap, recorded: true, reason: "placeholder_show_recorded" };
};
