import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import React, { useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import { trackEvent } from "./analytics";
import { debugLog, reportRuntimeError } from "./logger";
import { recordReleaseUpdateCheckResult } from "./releaseDiagnostics";
import {
  resolveFetchedRuntimeUpdateActivationKey,
  resolvePendingRuntimeUpdateActivationKey,
} from "./runtimeUpdateActivationPolicy.mjs";

const LAST_CHECK_AT_KEY = "chillywood.runtimeUpdate.lastCheckAt";
const RESUME_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 1800;
const RELOAD_DELAY_MS = 250;

type RuntimeUpdateReason = "startup" | "resume";

const shouldUseRuntimeUpdates = () => !__DEV__ && Platform.OS !== "web" && Updates.isEnabled;

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
  const checkInFlightRef = useRef(false);
  const reloadRequestedRef = useRef<string | null>(null);
  const updatesState = Updates.useUpdates();
  const downloadedUpdateId = updatesState.downloadedUpdate?.updateId;
  const isRollbackToEmbedded = Boolean(
    updatesState.downloadedUpdate && !downloadedUpdateId,
  );

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
      if (nextState === "active") runCheck("resume");
    });

    return () => {
      clearTimeout(startupTimer);
      subscription.remove();
    };
  }, []);

  return null;
}
