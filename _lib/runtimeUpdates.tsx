import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import React, { useEffect, useRef } from "react";
import { AppState, InteractionManager, Platform, type AppStateStatus } from "react-native";

import { trackEvent } from "./analytics";
import { debugLog, reportRuntimeError } from "./logger";

const LAST_CHECK_AT_KEY = "chillywood.runtimeUpdate.lastCheckAt";
const LAST_RELOAD_FINGERPRINT_KEY = "chillywood.runtimeUpdate.lastReloadFingerprint";
const RESUME_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 1800;

type RuntimeUpdateReason = "startup" | "resume";

const shouldUseRuntimeUpdates = () => !__DEV__ && Platform.OS !== "web" && Updates.isEnabled;

const getManifestFingerprint = (manifest: unknown) => {
  if (!manifest || typeof manifest !== "object") return null;

  const record = manifest as Record<string, unknown>;
  const candidates = [
    record.id,
    record.updateId,
    record.createdAt,
    record.commitTime,
    record.runtimeVersion,
  ].map((value) => String(value ?? "").trim()).filter(Boolean);

  return candidates.length > 0 ? candidates.join(":") : null;
};

const getLastCheckAt = async () => {
  const raw = String(await AsyncStorage.getItem(LAST_CHECK_AT_KEY) ?? "").trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
};

const reloadIntoFetchedUpdate = async (fingerprint: string, reason: RuntimeUpdateReason) => {
  const lastReloadFingerprint = String(await AsyncStorage.getItem(LAST_RELOAD_FINGERPRINT_KEY) ?? "").trim();
  if (lastReloadFingerprint === fingerprint) {
    debugLog("runtime-updates", "Skipping already-applied update reload", {
      fingerprint,
      reason,
    });
    return;
  }

  await AsyncStorage.setItem(LAST_RELOAD_FINGERPRINT_KEY, fingerprint);
  trackEvent("runtime_update_reload_ready", {
    reason,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
  });

  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      void Updates.reloadAsync().catch((error) => {
        reportRuntimeError("runtime-update-reload", error, {
          reason,
          channel: Updates.channel,
          runtimeVersion: Updates.runtimeVersion,
        });
      });
    }, 350);
  });
};

const checkForRuntimeUpdate = async (reason: RuntimeUpdateReason, force = false) => {
  if (!shouldUseRuntimeUpdates()) return;

  const now = Date.now();
  if (!force) {
    const lastCheckAt = await getLastCheckAt();
    if (now - lastCheckAt < RESUME_CHECK_INTERVAL_MS) return;
  }

  await AsyncStorage.setItem(LAST_CHECK_AT_KEY, String(now));

  const checkResult = await Updates.checkForUpdateAsync();
  const hasUpdate = checkResult.isAvailable || checkResult.isRollBackToEmbedded;

  debugLog("runtime-updates", "Checked for runtime update", {
    reason,
    hasUpdate,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
  });

  if (!hasUpdate) return;

  const fetchResult = await Updates.fetchUpdateAsync();
  if (!fetchResult.isNew && !fetchResult.isRollBackToEmbedded) return;

  const fingerprint = getManifestFingerprint(fetchResult.manifest)
    ?? (fetchResult.isRollBackToEmbedded ? "rollback-to-embedded" : null);
  if (!fingerprint) return;

  await reloadIntoFetchedUpdate(fingerprint, reason);
};

export function RuntimeUpdateGate() {
  const checkInFlightRef = useRef(false);

  useEffect(() => {
    if (!shouldUseRuntimeUpdates()) return undefined;

    const runCheck = (reason: RuntimeUpdateReason, force = false) => {
      if (checkInFlightRef.current) return;
      checkInFlightRef.current = true;

      checkForRuntimeUpdate(reason, force)
        .catch((error) => {
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
