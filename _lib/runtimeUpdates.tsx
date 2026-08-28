import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname, useRouter } from "expo-router";
import * as Updates from "expo-updates";
import React, { useEffect, useRef } from "react";
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";

import { trackEvent } from "./analytics";
import { debugLog, reportRuntimeError } from "./logger";
import { recordReleaseUpdateCheckResult } from "./releaseDiagnostics";
import {
  resolveFetchedRuntimeUpdateActivationKey,
  resolvePendingRuntimeUpdateActivationKey,
} from "./runtimeUpdateActivationPolicy.mjs";
import { useSession } from "./session";

const LAST_CHECK_AT_KEY = "chillywood.runtimeUpdate.lastCheckAt";
const NAVIGATION_RESUME_KEY_PREFIX = "chillywood.navigation.lastPath.v1";
const NAVIGATION_RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RESUME_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const MIN_BACKGROUND_BEFORE_RESUME_CHECK_MS = 10 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 1800;
const RELOAD_DELAY_MS = 250;

const BLOCKED_NAVIGATION_RESUME_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/reset-password",
  "/auth-callback",
  "/callback",
  "/terms",
  "/privacy",
  "/community-guidelines",
  "/copyright",
  "/dmca",
  "/account-deletion",
  "/communication",
  "/watch-party/live-stage",
] as const;

type RuntimeUpdateReason = "startup" | "resume";

type NavigationResumeRecord = {
  pathname: string;
  savedAt: number;
};

const shouldUseRuntimeUpdates = () => !__DEV__ && Platform.OS !== "web" && Updates.isEnabled;

const getNavigationResumeKey = (userId: string) => `${NAVIGATION_RESUME_KEY_PREFIX}:${userId}`;

const normalizeNavigationResumePath = (pathname: string | null | undefined) => {
  const normalized = String(pathname ?? "").trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (normalized.includes("?") || normalized.includes("#") || normalized.includes("\\")) return null;
  if (normalized.length > 512) return null;

  const lowerPath = normalized.toLowerCase();
  if (BLOCKED_NAVIGATION_RESUME_PATH_PREFIXES.some((prefix) => (
    lowerPath === prefix || lowerPath.startsWith(`${prefix}/`)
  ))) return null;

  return normalized;
};

const parseNavigationResumeRecord = (raw: string | null, now = Date.now()) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NavigationResumeRecord>;
    const pathname = normalizeNavigationResumePath(parsed.pathname);
    const savedAt = Number(parsed.savedAt);
    if (!pathname || !Number.isFinite(savedAt)) return null;
    if (savedAt > now || now - savedAt > NAVIGATION_RESUME_MAX_AGE_MS) return null;
    return { pathname, savedAt } satisfies NavigationResumeRecord;
  } catch {
    return null;
  }
};

const getManifestUpdateId = (manifest: unknown) => {
  if (!manifest || typeof manifest !== "object") return null;

  const record = manifest as Record<string, unknown>;
  const updateId = String(record.id ?? record.updateId ?? "").trim();
  return updateId || null;
};

const getLastCheckAt = async () => {
  const raw = String(await AsyncStorage.getItem(LAST_CHECK_AT_KEY) ?? "").trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
};

const reloadIntoFetchedUpdate = (
  activationKey: string,
  reason: RuntimeUpdateReason | "pending",
  reloadRequestedRef: React.MutableRefObject<string | null>,
) => {
  if (reloadRequestedRef.current === activationKey) return;
  reloadRequestedRef.current = activationKey;
  trackEvent("runtime_update_reload_ready", {
    reason,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
  });

  setTimeout(() => {
    void Updates.reloadAsync().catch((error) => {
      if (reloadRequestedRef.current === activationKey) {
        reloadRequestedRef.current = null;
      }
      recordReleaseUpdateCheckResult({
        reason,
        status: "error",
      });
      reportRuntimeError("runtime-update-reload", error, {
        reason,
        channel: Updates.channel,
        runtimeVersion: Updates.runtimeVersion,
      });
    });
  }, RELOAD_DELAY_MS);
};

const activatePendingNativeUpdate = (
  pendingState: {
    downloadedUpdateId?: string;
    isRollbackToEmbedded: boolean;
    isUpdatePending: boolean;
  },
  reloadRequestedRef: React.MutableRefObject<string | null>,
) => {
  const activationKey = resolvePendingRuntimeUpdateActivationKey({
    currentUpdateId: Updates.updateId,
    downloadedUpdateId: pendingState.downloadedUpdateId,
    inFlightActivationKey: reloadRequestedRef.current,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    isRollbackToEmbedded: pendingState.isRollbackToEmbedded,
    isUpdatePending: pendingState.isUpdatePending,
  });

  if (!activationKey) return;
  recordReleaseUpdateCheckResult({
    reason: "pending",
    status: "downloaded",
  });
  reloadIntoFetchedUpdate(activationKey, "pending", reloadRequestedRef);
};

const checkForRuntimeUpdate = async (
  reason: RuntimeUpdateReason,
  reloadRequestedRef: React.MutableRefObject<string | null>,
  force = false,
) => {
  if (!shouldUseRuntimeUpdates()) return;

  const now = Date.now();
  if (!force) {
    const lastCheckAt = await getLastCheckAt();
    if (now - lastCheckAt < RESUME_CHECK_INTERVAL_MS) return;
  }

  await AsyncStorage.setItem(LAST_CHECK_AT_KEY, String(now));

  const checkResult = await Updates.checkForUpdateAsync();
  const hasUpdate = checkResult.isAvailable || checkResult.isRollBackToEmbedded;
  recordReleaseUpdateCheckResult({
    reason,
    status: hasUpdate ? "available" : "unavailable",
  });

  debugLog("runtime-updates", "Checked for runtime update", {
    reason,
    hasUpdate,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
  });

  if (!hasUpdate) return;

  const fetchResult = await Updates.fetchUpdateAsync();
  if (!fetchResult.isNew && !fetchResult.isRollBackToEmbedded) {
    recordReleaseUpdateCheckResult({
      reason,
      status: "unavailable",
    });
    return;
  }
  recordReleaseUpdateCheckResult({
    reason,
    status: "downloaded",
  });

  const activationKey = resolveFetchedRuntimeUpdateActivationKey({
    currentUpdateId: Updates.updateId,
    fetchedUpdateId: getManifestUpdateId(fetchResult.manifest),
    inFlightActivationKey: reloadRequestedRef.current,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    isRollbackToEmbedded: fetchResult.isRollBackToEmbedded,
  });
  if (!activationKey) return;

  reloadIntoFetchedUpdate(activationKey, reason, reloadRequestedRef);
};

export function RuntimeUpdateGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isSignedIn, user } = useSession();
  const authenticatedUserId = String(user?.id ?? "").trim();
  const restoreAttemptedUserRef = useRef<string | null>(null);
  const restoreSettledUserRef = useRef<string | null>(null);
  const checkInFlightRef = useRef(false);
  const reloadRequestedRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAtRef = useRef<number | null>(null);
  const updatesState = Updates.useUpdates();
  const downloadedUpdateId = updatesState.downloadedUpdate?.updateId;
  const isRollbackToEmbedded = Boolean(
    updatesState.downloadedUpdate && !downloadedUpdateId,
  );

  useEffect(() => {
    if (isLoading || !isSignedIn || !authenticatedUserId) return undefined;
    if (restoreAttemptedUserRef.current === authenticatedUserId) return undefined;
    restoreAttemptedUserRef.current = authenticatedUserId;

    if (pathname !== "/") {
      restoreSettledUserRef.current = authenticatedUserId;
      return undefined;
    }

    let active = true;
    const storageKey = getNavigationResumeKey(authenticatedUserId);
    void Promise.all([
      Linking.getInitialURL().catch(() => null),
      AsyncStorage.getItem(storageKey).catch(() => null),
    ]).then(([initialUrl, rawRecord]) => {
      if (!active || initialUrl) return;
      const record = parseNavigationResumeRecord(rawRecord);
      if (!record || record.pathname === "/") return;
      router.replace(record.pathname as Parameters<typeof router.replace>[0]);
      debugLog("navigation-resume", "Restored durable route after app relaunch", {
        pathname: record.pathname,
      });
    }).catch((error) => {
      reportRuntimeError("navigation-resume-restore", error, {
        source: "runtime-update-gate",
      });
    }).finally(() => {
      if (active) restoreSettledUserRef.current = authenticatedUserId;
    });

    return () => {
      active = false;
    };
  }, [authenticatedUserId, isLoading, isSignedIn, pathname, router]);

  useEffect(() => {
    if (!isSignedIn || !authenticatedUserId) return;
    if (pathname === "/" && restoreSettledUserRef.current !== authenticatedUserId) return;

    const normalizedPath = normalizeNavigationResumePath(pathname);
    const storageKey = getNavigationResumeKey(authenticatedUserId);

    if (!normalizedPath) {
      void AsyncStorage.removeItem(storageKey).catch(() => null);
      return;
    }

    const record: NavigationResumeRecord = {
      pathname: normalizedPath,
      savedAt: Date.now(),
    };
    void AsyncStorage.setItem(storageKey, JSON.stringify(record)).catch(() => null);
  }, [authenticatedUserId, isSignedIn, pathname]);

  useEffect(() => {
    if (!shouldUseRuntimeUpdates()) return;
    activatePendingNativeUpdate({
      downloadedUpdateId,
      isRollbackToEmbedded,
      isUpdatePending: updatesState.isUpdatePending,
    }, reloadRequestedRef);
  }, [
    downloadedUpdateId,
    isRollbackToEmbedded,
    updatesState.isUpdatePending,
  ]);

  useEffect(() => {
    if (!shouldUseRuntimeUpdates()) return undefined;

    const runCheck = (reason: RuntimeUpdateReason, force = false) => {
      if (checkInFlightRef.current) return;
      checkInFlightRef.current = true;

      checkForRuntimeUpdate(reason, reloadRequestedRef, force)
        .catch((error) => {
          recordReleaseUpdateCheckResult({
            reason,
            status: "error",
          });
          reportRuntimeError("runtime-update-check", error, {
            reason,
            channel: Updates.channel,
            runtimeVersion: Updates.runtimeVersion,
          });
        })
        .finally(() => {
          checkInFlightRef.current = false;
        });
    };

    const startupTimer = setTimeout(() => runCheck("startup", true), STARTUP_CHECK_DELAY_MS);
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState !== "active") {
        if (previousState === "active" && backgroundedAtRef.current === null) {
          backgroundedAtRef.current = Date.now();
        }
        return;
      }

      if (previousState === "active") return;

      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (backgroundedAt === null) return;

      const backgroundDurationMs = Date.now() - backgroundedAt;
      if (backgroundDurationMs < MIN_BACKGROUND_BEFORE_RESUME_CHECK_MS) {
        debugLog("runtime-updates", "Skipped resume update check after short background", {
          backgroundDurationMs,
          channel: Updates.channel,
          runtimeVersion: Updates.runtimeVersion,
        });
        return;
      }

      runCheck("resume");
    });

    return () => {
      clearTimeout(startupTimer);
      subscription.remove();
    };
  }, []);

  return null;
}
