import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createAdminClient,
  createAuthClient,
  hasForbiddenBroadcastInput,
  jsonResponse,
  notConfiguredPayload,
  optionsResponse,
  parseJsonPayload,
  readBroadcastSession,
  requestedBroadcastSessionId,
  safeBroadcastStatus,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  type AuthenticatedUser,
  type SpectatorBroadcastPayload,
  type SupabaseClientLike,
  userHasPlatformRole,
  writeAuditLog,
} from "../_shared/spectator-broadcast.ts";

const FUNCTION_NAME = "spectator-broadcast-stop";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      message: "Use POST for spectator broadcast stop skeleton requests.",
      stopped: false,
      livekitApiCalled: false,
      hlsEnabled: false,
      fullRoomTokenForSpectators: false,
    });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let broadcastSessionId: string | null = null;
  let requestedAuditLogId: string | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<SpectatorBroadcastPayload>(req);
    if ("error" in parsed) return parsed.error;

    if (hasForbiddenBroadcastInput(parsed.value)) {
      return jsonResponse(400, {
        error: "broadcast_instruction_not_allowed",
        message:
          "Egress, HLS, playback URL, token, secret, CDN, viewer count, and spectator count instructions are not accepted by this skeleton.",
        stopped: false,
        livekitApiCalled: false,
        hlsEnabled: false,
        fullRoomTokenForSpectators: false,
      });
    }

    broadcastSessionId = requestedBroadcastSessionId(parsed.value);

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload({
          reason: adminConfig.reason,
          message: adminConfig.message,
          auditWritten: false,
          stopped: false,
        }),
      );
    }
    adminClient = adminConfig.client;

    const hasOperatorRole = await userHasPlatformRole(adminClient, currentUser, ["owner", "operator"]);
    if (!hasOperatorRole) {
      return jsonResponse(403, {
        error: "operator_required",
        message: "Spectator broadcast stop skeleton is admin/operator-only.",
        stopped: false,
        livekitApiCalled: false,
        hlsEnabled: false,
        fullRoomTokenForSpectators: false,
      });
    }

    const session = broadcastSessionId ? await readBroadcastSession(adminClient, broadcastSessionId) : null;
    if (broadcastSessionId && !session) {
      return jsonResponse(404, {
        error: "not_found",
        message: "Broadcast session was not found.",
        broadcastSessionId,
        stopped: false,
        livekitApiCalled: false,
        hlsEnabled: false,
        fullRoomTokenForSpectators: false,
      });
    }

    const safeStatus = safeBroadcastStatus(session);

    requestedAuditLogId = await writeAuditLog(adminClient, FUNCTION_NAME, {
      action: "spectator_broadcast_stop_requested",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      afterState: notConfiguredPayload({
        auditWritten: false,
        broadcastSession: safeStatus,
        reason: "egress_not_connected",
        stopped: false,
      }),
      metadata: {
        broadcast_session_id: broadcastSessionId,
        status: "requested",
      },
      reason: "Spectator broadcast stop requested; skeleton did not call Egress stop or mutate playback fields.",
      targetId: broadcastSessionId,
      targetType: broadcastSessionId ? "room_broadcast_session" : "spectator_broadcast_stop",
    });

    const blockedAuditLogId = await writeAuditLog(adminClient, FUNCTION_NAME, {
      action: "spectator_broadcast_stop_blocked_not_configured",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      beforeState: {
        requested_audit_log_id: requestedAuditLogId,
      },
      afterState: notConfiguredPayload({
        auditWritten: true,
        broadcastSession: safeStatus,
        reason: "egress_not_connected",
        stopped: false,
      }),
      metadata: {
        broadcast_session_id: broadcastSessionId,
        egress_configured: false,
        reason: "egress_not_connected",
        requested_audit_log_id: requestedAuditLogId,
      },
      reason: "Spectator broadcast stop remains blocked because no connected Egress session exists.",
      targetId: broadcastSessionId,
      targetType: broadcastSessionId ? "room_broadcast_session" : "spectator_broadcast_stop",
    });

    return jsonResponse(
      200,
      notConfiguredPayload({
        audit: {
          blockedAuditLogId,
          requested: true,
          requestedAuditLogId,
          written: true,
        },
        broadcastSession: safeStatus,
        broadcastSessionId,
        reason: "egress_not_connected",
        stopped: false,
      }),
    );
  } catch (error) {
    const failureAuditLogId = await safeWriteAuditLog(adminClient, FUNCTION_NAME, {
      action: "spectator_broadcast_stop_failed",
      actorEmail: currentUser?.email ?? null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        broadcast_session_id: broadcastSessionId,
        error: sanitizeErrorMessage(error),
        requested_audit_log_id: requestedAuditLogId,
      },
      reason: "Spectator broadcast stop skeleton failed; no Egress, HLS, playback, or token action occurred.",
      severity: "warning",
      targetId: broadcastSessionId,
      targetType: broadcastSessionId ? "room_broadcast_session" : "spectator_broadcast_stop",
    });

    return jsonResponse(500, {
      error: "spectator_broadcast_stop_failed",
      message: sanitizeErrorMessage(error),
      audit: {
        failureAuditLogId,
      },
      stopped: false,
      livekitApiCalled: false,
      hlsEnabled: false,
      fullRoomTokenForSpectators: false,
      playbackEnabled: false,
    });
  }
});
