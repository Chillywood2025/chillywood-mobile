import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createD7DTestBroadcastSession,
  createAdminClient,
  createAuthClient,
  hasForbiddenBroadcastInput,
  jsonResponse,
  notConfiguredPayload,
  optionsResponse,
  parseJsonPayload,
  readBroadcastSession,
  readD7DTestEgressReadiness,
  readSpectatorBroadcastOutputConfigStatus,
  requestedBroadcastSessionId,
  safeBroadcastStatus,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  shouldCreateD7DTestSession,
  startD7DTestEgress,
  type AuthenticatedUser,
  type SpectatorBroadcastPayload,
  type SupabaseClientLike,
  userHasPlatformRole,
  writeAuditLog,
} from "../_shared/spectator-broadcast.ts";

const FUNCTION_NAME = "spectator-broadcast-start";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      message: "Use POST for spectator broadcast start skeleton requests.",
      started: false,
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
        started: false,
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
          started: false,
        }),
      );
    }
    adminClient = adminConfig.client;

    const hasOperatorRole = await userHasPlatformRole(adminClient, currentUser, ["owner", "operator"]);
    if (!hasOperatorRole) {
      return jsonResponse(403, {
        error: "operator_required",
        message: "Spectator broadcast start skeleton is admin/operator-only.",
        started: false,
        livekitApiCalled: false,
        hlsEnabled: false,
        fullRoomTokenForSpectators: false,
      });
    }

    let session = broadcastSessionId ? await readBroadcastSession(adminClient, broadcastSessionId) : null;
    if (broadcastSessionId && !session) {
      return jsonResponse(404, {
        error: "not_found",
        message: "Broadcast session was not found.",
        broadcastSessionId,
        started: false,
        livekitApiCalled: false,
        hlsEnabled: false,
        fullRoomTokenForSpectators: false,
      });
    }

    if (!session && shouldCreateD7DTestSession(parsed.value)) {
      session = await createD7DTestBroadcastSession(adminClient, parsed.value, currentUser.id);
      broadcastSessionId = session?.id ?? null;
    }

    const safeStatus = safeBroadcastStatus(session);
    const outputConfig = readSpectatorBroadcastOutputConfigStatus();
    const readiness = readD7DTestEgressReadiness();

    requestedAuditLogId = await writeAuditLog(adminClient, FUNCTION_NAME, {
      action: "spectator_broadcast_start_requested",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      afterState: notConfiguredPayload({
        auditWritten: false,
        broadcastSession: safeStatus,
        d7dReadiness: readiness,
        outputConfig,
        started: false,
      }),
      metadata: {
        broadcast_session_id: broadcastSessionId,
        output_config_alias_used: outputConfig.fallbackSecretNamesUsed.length > 0,
        output_config_names_present: outputConfig.outputSecretsConfigured,
        output_config_source: outputConfig.outputSecretSource,
        status: "requested",
      },
      reason: "Spectator broadcast start requested; skeleton did not call Egress or enable playback.",
      targetId: broadcastSessionId,
      targetType: broadcastSessionId ? "room_broadcast_session" : "spectator_broadcast_start",
    });

    const d7dStart = session ? await startD7DTestEgress(adminClient, session) : {
      result: null,
      status: "not_configured" as const,
      readiness,
    };

    if (d7dStart.status === "started") {
      const startedAuditLogId = await writeAuditLog(adminClient, FUNCTION_NAME, {
        action: "spectator_broadcast_started",
        actorEmail: currentUser.email,
        actorUserId: currentUser.id,
        beforeState: {
          requested_audit_log_id: requestedAuditLogId,
        },
        afterState: {
          ...d7dStart.result,
          fullRoomTokenForSpectators: false,
          hlsUrlReturned: false,
          publicPlaybackEnabled: false,
          spectatorPlaybackEnabled: false,
        },
        metadata: {
          broadcast_session_id: broadcastSessionId,
          egress_connected: true,
          egress_id_written: true,
          foundation_only: false,
          hls_enabled: true,
          hls_url_generated: false,
          livekit_api_called: true,
          requested_audit_log_id: requestedAuditLogId,
        },
        reason: "D7D test Egress start was called for a private proof session; public spectator playback remains disabled.",
        targetId: broadcastSessionId,
        targetType: "room_broadcast_session",
      });

      return jsonResponse(200, {
        audit: {
          requested: true,
          requestedAuditLogId,
          startedAuditLogId,
          written: true,
        },
        broadcastSessionId,
        d7dReadiness: d7dStart.readiness,
        egressIdPresent: true,
        fullRoomTokenForSpectators: false,
        hlsEnabled: true,
        hlsUrlReturned: false,
        livekitApiCalled: true,
        playbackEnabled: false,
        publicPlaybackEnabled: false,
        spectatorPlaybackEnabled: false,
        started: true,
        status: "test_started",
      });
    }

    const blockedAuditLogId = await writeAuditLog(adminClient, FUNCTION_NAME, {
      action: "spectator_broadcast_start_blocked_not_configured",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      beforeState: {
        requested_audit_log_id: requestedAuditLogId,
      },
      afterState: notConfiguredPayload({
        auditWritten: true,
        broadcastSession: safeStatus,
        d7dReadiness: d7dStart.readiness,
        outputConfig,
        started: false,
      }),
      metadata: {
        broadcast_session_id: broadcastSessionId,
        egress_configured: false,
        output_config_alias_used: outputConfig.fallbackSecretNamesUsed.length > 0,
        output_config_names_present: outputConfig.outputSecretsConfigured,
        output_config_source: outputConfig.outputSecretSource,
        reason: "egress_not_connected",
        requested_audit_log_id: requestedAuditLogId,
      },
      reason: "Spectator broadcast start remains blocked because LiveKit Egress/HLS is not connected.",
      targetId: broadcastSessionId,
      targetType: broadcastSessionId ? "room_broadcast_session" : "spectator_broadcast_start",
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
        d7dReadiness: d7dStart.readiness,
        outputConfig,
        started: false,
      }),
    );
  } catch (error) {
    const failureAuditLogId = await safeWriteAuditLog(adminClient, FUNCTION_NAME, {
      action: "spectator_broadcast_start_failed",
      actorEmail: currentUser?.email ?? null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        broadcast_session_id: broadcastSessionId,
        error: sanitizeErrorMessage(error),
        requested_audit_log_id: requestedAuditLogId,
      },
      reason: "Spectator broadcast start skeleton failed; no Egress, HLS, playback, or token action occurred.",
      severity: "warning",
      targetId: broadcastSessionId,
      targetType: broadcastSessionId ? "room_broadcast_session" : "spectator_broadcast_start",
    });

    return jsonResponse(500, {
      error: "spectator_broadcast_start_failed",
      message: sanitizeErrorMessage(error),
      audit: {
        failureAuditLogId,
      },
      started: false,
      livekitApiCalled: false,
      hlsEnabled: false,
      fullRoomTokenForSpectators: false,
      playbackEnabled: false,
    });
  }
});
