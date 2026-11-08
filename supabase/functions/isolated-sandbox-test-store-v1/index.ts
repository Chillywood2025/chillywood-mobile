import { authenticateRequest, createAuthClient, createAdminClient } from "../_shared/stripe-connect.ts";
import { createIsolatedTestStoreCommandHandler } from "../_shared/isolated-test-store-command.ts";
import { readVerifiedSupabaseSessionGeneration } from "../_shared/livekit-session-generation.ts";

// No HTTP initiation toggle: SQL's empty/default-off qualified configuration
// controls admission while reads and uncertain-outcome recovery stay available.
export const handler = createIsolatedTestStoreCommandHandler({
  authenticate: async req => {
    const authorization = req.headers.get("authorization");
    if (!authorization || authorization.length > 8192) return null;
    // Freeze the exact bearer used by getUser and the authority readback. A
    // caller cannot replace it while either asynchronous verification runs.
    const frozen = new Request(req.url, { method: req.method, headers: { authorization } });
    const { supabaseUrl, supabaseAnonKey } = createAuthClient();
    const result = await authenticateRequest(frozen, supabaseUrl, supabaseAnonKey);
    if (!("user" in result)) return null;
    // Decoding alone is not authentication. Only after Auth accepted this
    // exact token, require its session to equal the legacy current readback.
    const tokenSession = readVerifiedSupabaseSessionGeneration(authorization);
    return tokenSession && tokenSession === result.user.sessionGeneration
      ? { userId: result.user.id, sessionId: tokenSession } : null;
  },
  execute: async ({ actor, request }) => {
    const admin = createAdminClient(); if (!admin.configured) throw Error("test_store_backend_unavailable");
    const { data, error } = await admin.client.rpc("isolated_test_store_command_v1", {
      p_buyer_id: actor.userId, p_session_id: actor.sessionId, p_command: request.command,
      p_request_id: request.requestId, p_configuration_digest: request.configurationDigest, p_payload: request.payload,
    });
    if (error) throw Error("test_store_command_uncertain"); return data;
  },
});
if (import.meta.main) Deno.serve(handler);
