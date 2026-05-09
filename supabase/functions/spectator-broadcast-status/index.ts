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
  readD7DTestEgressReadiness,
  readSpectatorBroadcastOutputConfigStatus,
  requestedBroadcastSessionId,
  safeBroadcastStatus,
  sanitizeErrorMessage,
  type SpectatorBroadcastPayload,
  userHasPlatformRole,
} from "../_shared/spectator-broadcast.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      message: "Use POST for spectator broadcast status skeleton requests.",
      livekitApiCalled: false,
      hlsEnabled: false,
      fullRoomTokenForSpectators: false,
    });
  }

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;

    const parsed = await parseJsonPayload<SpectatorBroadcastPayload>(req);
    if ("error" in parsed) return parsed.error;

    if (hasForbiddenBroadcastInput(parsed.value)) {
      return jsonResponse(400, {
        error: "broadcast_instruction_not_allowed",
        message:
          "Egress, HLS, playback URL, token, secret, CDN, viewer count, and spectator count instructions are not accepted by this skeleton.",
        livekitApiCalled: false,
        hlsEnabled: false,
        fullRoomTokenForSpectators: false,
      });
    }

    const broadcastSessionId = requestedBroadcastSessionId(parsed.value);
    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload({
          reason: adminConfig.reason,
          message: adminConfig.message,
          broadcastSessionId,
        }),
      );
    }

    const adminClient = adminConfig.client;
    const hasOperatorRole = await userHasPlatformRole(adminClient, authResult.user, ["owner", "operator"]);
    if (!hasOperatorRole) {
      return jsonResponse(403, {
        error: "operator_required",
        message: "Spectator broadcast status skeleton is admin/operator-only.",
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
        livekitApiCalled: false,
        hlsEnabled: false,
        fullRoomTokenForSpectators: false,
      });
    }

    return jsonResponse(200, {
      ...notConfiguredPayload({
        broadcastSession: safeBroadcastStatus(session),
        broadcastSessionId,
        d7dReadiness: readD7DTestEgressReadiness(),
        outputConfig: readSpectatorBroadcastOutputConfigStatus(),
      }),
      statusRead: true,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "spectator_broadcast_status_failed",
      message: sanitizeErrorMessage(error),
      livekitApiCalled: false,
      hlsEnabled: false,
      fullRoomTokenForSpectators: false,
      playbackEnabled: false,
    });
  }
});
