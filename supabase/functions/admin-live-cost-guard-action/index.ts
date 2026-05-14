import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  applyLiveCostGuardAction,
  authenticateLiveCostGuardAdmin,
  liveCostGuardJson,
  liveCostGuardOptions,
  normalizeLiveCostGuardActionType,
  readLiveCostGuardSettings,
  sanitizeLiveCostGuardError,
  toLiveCostGuardText,
} from "../_shared/live-cost-guard.ts";

type ActionPayload = {
  action_type?: unknown;
  actionType?: unknown;
  participant_identity?: unknown;
  participantIdentity?: unknown;
  reason?: unknown;
  room_name?: unknown;
  roomName?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return liveCostGuardOptions();
  if (req.method !== "POST") {
    return liveCostGuardJson(405, { error: "method_not_allowed", message: "Use POST for Live Cost Guard action requests." });
  }

  try {
    const auth = await authenticateLiveCostGuardAdmin(req);
    if ("error" in auth) return auth.error;

    const payload = await req.json().catch(() => null) as ActionPayload | null;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return liveCostGuardJson(400, { error: "invalid_body", message: "Action request must be a JSON object." });
    }

    const actionType = normalizeLiveCostGuardActionType(payload.actionType ?? payload.action_type);
    const reason = toLiveCostGuardText(payload.reason);
    if (!actionType) {
      return liveCostGuardJson(400, { error: "invalid_action_type" });
    }
    if (!reason) {
      return liveCostGuardJson(400, { error: "reason_required" });
    }

    const settings = await readLiveCostGuardSettings(auth.adminClient);
    const action = await applyLiveCostGuardAction(
      auth.adminClient,
      settings,
      {
        actionType,
        participantIdentity: toLiveCostGuardText(payload.participantIdentity ?? payload.participant_identity) || null,
        reason,
        roomName: toLiveCostGuardText(payload.roomName ?? payload.room_name) || null,
      },
      { actorId: auth.userId, actorType: "admin" },
    );

    return liveCostGuardJson(200, {
      action,
      mode: settings.mode,
      status: action.success ? "applied_or_recorded" : "recorded_not_applied",
    });
  } catch (error) {
    return liveCostGuardJson(500, {
      error: "live_cost_guard_action_failed",
      message: sanitizeLiveCostGuardError(error),
    });
  }
});
