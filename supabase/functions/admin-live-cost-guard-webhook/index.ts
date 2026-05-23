import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  applyLiveCostGuardAction,
  classifyLiveCostGuardSeverity,
  createLiveCostGuardAdminClient,
  liveCostGuardJson,
  liveCostGuardOptions,
  normalizeLiveCostGuardSeverity,
  readLiveCostGuardOptionalEnv,
  readLiveCostGuardSettings,
  recommendedLiveCostGuardAction,
  recordLiveCostGuardEvent,
  sanitizeLiveCostGuardError,
  toLiveCostGuardText,
  type LiveCostGuardSeverity,
} from "../_shared/live-cost-guard.ts";
import {
  captureSecurityRequestContext,
  securityContextAuditMetadata,
} from "../_shared/security-request-context.ts";

type AlertmanagerAlert = {
  annotations?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  status?: unknown;
};

type AlertmanagerPayload = {
  alerts?: AlertmanagerAlert[];
  commonAnnotations?: Record<string, unknown>;
  commonLabels?: Record<string, unknown>;
  status?: unknown;
};

const timingSafeEqual = (left: string, right: string) => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let mismatch = 0;
  leftBytes.forEach((byte, index) => {
    mismatch |= byte ^ rightBytes[index];
  });
  return mismatch === 0;
};

const parseNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickField = (
  alert: AlertmanagerAlert,
  keys: string[],
  fallback?: Record<string, unknown>,
) => {
  const sources = [alert.labels, alert.annotations, fallback].filter(Boolean) as Record<string, unknown>[];
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && toLiveCostGuardText(value)) return value;
    }
  }
  return null;
};

const parseSeverity = (
  alert: AlertmanagerAlert,
  settings: Awaited<ReturnType<typeof readLiveCostGuardSettings>>,
  fallback?: Record<string, unknown>,
): LiveCostGuardSeverity => {
  const explicitSeverity = normalizeLiveCostGuardSeverity(pickField(alert, ["severity"], fallback));
  if (explicitSeverity !== "normal") return explicitSeverity;

  const estimatedTurnMbps = parseNumber(pickField(alert, [
    "estimated_turn_mbps",
    "turn_mbps",
    "bandwidth_out_mbps",
    "egress_mbps",
  ], fallback));
  const estimatedUsdPerHour = parseNumber(pickField(alert, [
    "estimated_usd_per_hour",
    "usd_per_hour",
    "burn_per_hour",
  ], fallback));

  return classifyLiveCostGuardSeverity({ estimatedTurnMbps, estimatedUsdPerHour }, settings);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return liveCostGuardOptions();
  if (req.method !== "POST") {
    return liveCostGuardJson(405, { error: "method_not_allowed", message: "Use POST for Live Cost Guard webhooks." });
  }

  try {
    const expectedSecret = readLiveCostGuardOptionalEnv("LIVE_COST_GUARD_WEBHOOK_SECRET");
    if (!expectedSecret) {
      return liveCostGuardJson(401, { error: "webhook_not_configured" });
    }
    const suppliedSecret = toLiveCostGuardText(req.headers.get("x-chillywood-live-cost-guard-secret"));
    if (!suppliedSecret || !timingSafeEqual(suppliedSecret, expectedSecret)) {
      return liveCostGuardJson(401, { error: "invalid_webhook_secret" });
    }

    const payload = await req.json().catch(() => null) as AlertmanagerPayload | null;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return liveCostGuardJson(400, { error: "invalid_body", message: "Alertmanager payload must be a JSON object." });
    }

    const adminClient = createLiveCostGuardAdminClient();
    const securityContext = await captureSecurityRequestContext(adminClient, req, {
      source: "admin-live-cost-guard-webhook",
    });
    const securityContextMetadata = securityContextAuditMetadata(securityContext);
    const settings = await readLiveCostGuardSettings(adminClient);
    const alerts = Array.isArray(payload.alerts) && payload.alerts.length ? payload.alerts : [{ labels: payload.commonLabels, annotations: payload.commonAnnotations, status: payload.status }];
    const insertedEvents = [];
    const insertedActions = [];

    for (const alert of alerts) {
      const mergedFallback = {
        ...(payload.commonLabels ?? {}),
        ...(payload.commonAnnotations ?? {}),
      };
      const severity = parseSeverity(alert, settings, mergedFallback);
      const recommendedAction = recommendedLiveCostGuardAction(severity);
      const roomName = toLiveCostGuardText(pickField(alert, ["room_name", "room", "livekit_room"], mergedFallback)) || null;
      const participantIdentity = toLiveCostGuardText(pickField(alert, ["participant_identity", "identity", "participant"], mergedFallback)) || null;
      const estimatedUsdPerHour = parseNumber(pickField(alert, ["estimated_usd_per_hour", "usd_per_hour", "burn_per_hour"], mergedFallback));
      const metricSnapshot = {
        alertname: toLiveCostGuardText(pickField(alert, ["alertname"], mergedFallback)) || "LiveCostGuardAlert",
        estimated_turn_mbps: parseNumber(pickField(alert, ["estimated_turn_mbps", "turn_mbps", "bandwidth_out_mbps", "egress_mbps"], mergedFallback)),
        status: toLiveCostGuardText(alert.status ?? payload.status) || "unknown",
      };

      const shouldAutoProtect = settings.enabled && settings.mode === "auto_protect" && recommendedAction !== null;
      const actionStatus = !settings.enabled
        ? "logged_disabled"
        : settings.mode === "observe_only"
          ? "logged_observe_only"
          : settings.mode === "manual_approval"
            ? "pending_manual_approval"
            : shouldAutoProtect
              ? "auto_protect_requested"
              : "logged";

      const event = await recordLiveCostGuardEvent(adminClient, {
        actionStatus,
        actionTaken: shouldAutoProtect ? recommendedAction : null,
        estimatedUsdPerHour,
        metricSnapshot,
        participantIdentity,
        recommendedAction,
        roomName,
        securityContextId: securityContext?.id ?? null,
        securityContextMetadata,
        severity,
        source: "alertmanager",
      });
      insertedEvents.push(event);

      if (shouldAutoProtect && recommendedAction) {
        const action = await applyLiveCostGuardAction(
          adminClient,
          settings,
          {
            actionType: recommendedAction,
            participantIdentity,
            reason: `Auto-protect response for ${severity} Live Cost Guard alert.`,
            roomName,
          },
          {
            actorType: "system",
            securityContextId: securityContext?.id ?? null,
            securityContextMetadata,
          },
        );
        insertedActions.push(action);
      }
    }

    return liveCostGuardJson(200, {
      actionsInserted: insertedActions.length,
      eventsInserted: insertedEvents.length,
      mode: settings.mode,
      status: "ok",
    });
  } catch (error) {
    return liveCostGuardJson(500, {
      error: "live_cost_guard_webhook_failed",
      message: sanitizeLiveCostGuardError(error),
    });
  }
});
