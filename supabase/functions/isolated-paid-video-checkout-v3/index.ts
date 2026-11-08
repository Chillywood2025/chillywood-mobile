import { authenticateRequest, createAuthClient, createAdminClient } from "../_shared/stripe-connect.ts";
import { createPaidVideoCheckoutV3Handler } from "../_shared/isolated-paid-video-checkout-v3.ts";
import { readVerifiedSupabaseSessionGeneration } from "../_shared/livekit-session-generation.ts";

// Closure RPCs prove exact allocation/claim absence; they never cancel a provider purchase.
export const handler = createPaidVideoCheckoutV3Handler({
  authenticate: async req => {
    const authorization = req.headers.get("authorization");
    if (!authorization || authorization.length > 8192) return null;
    const frozen = new Request(req.url, { method: req.method, headers: { authorization } });
    const { supabaseUrl, supabaseAnonKey } = createAuthClient();
    const result = await authenticateRequest(frozen, supabaseUrl, supabaseAnonKey);
    if (!("user" in result)) return null;
    const tokenSession = readVerifiedSupabaseSessionGeneration(authorization);
    return tokenSession && tokenSession === result.user.sessionGeneration
      ? { userId: result.user.id, sessionId: tokenSession } : null;
  },
  execute: async ({ actor, request }) => {
    const admin = createAdminClient(); if (!admin.configured) throw Error("paid_video_checkout_backend_unavailable");
    const rpc = request.command === "abandon" ? "isolated_paid_video_abandon_v3"
      : request.command === "close_prepared" || request.command === "recover_close_prepared" ? "isolated_paid_video_close_prepared_v3"
      : request.command === "resolve_playback" ? "isolated_paid_video_resolve_playback_v3"
      : "isolated_paid_video_checkout_v3";
    const { data, error } = await admin.client.rpc(rpc, {
      p_buyer_id: actor.userId, p_session_id: actor.sessionId, p_command: request.command,
      p_request_id: request.requestId, p_configuration_digest: request.configurationDigest, p_payload: request.payload,
    });
    if (error) throw Error("paid_video_checkout_uncertain");
    return data;
  },
});
if (import.meta.main) Deno.serve(handler);
