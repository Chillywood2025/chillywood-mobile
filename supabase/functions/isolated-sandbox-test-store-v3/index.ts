import { authenticateRequest, createAuthClient, createAdminClient } from "../_shared/stripe-connect.ts";
import { createIsolatedTestStoreV3CommandHandler } from "../_shared/isolated-test-store-v3-command.ts";
import { readVerifiedSupabaseSessionGeneration } from "../_shared/livekit-session-generation.ts";

// This wake-up is not a provider permission or receipt. SQL consumes each
// exact operation permit before the separate service-authenticated worker sends
// it. A lost wake-up is recovered from the durable plan on a subsequent read.
async function wakeProvisioner(buyerId: string, intentId: string): Promise<void> {
  if (Deno.env.get("TEST_STORE_V3_PROVISIONING_ENABLED") !== "true") return;
  const admin = createAdminClient(), base = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!admin.configured || !base || !key) return;
  const { data, error } = await admin.client.rpc("isolated_test_store_v3_provisioning_plan_v1", {
    p_buyer_id: buyerId, p_intent_id: intentId,
  });
  if (error || !data || typeof data.planId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(data.planId)) return;
  const url = new URL("/functions/v1/isolated-test-store-provisioner-v3", base);
  if (url.protocol !== "https:") return;
  const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ protocol: "isolated-test-store-v3-provision-worker", planId: data.planId }) });
  // No response body or credential is logged. Worker progress is read from SQL.
  await response.body?.cancel();
}

export const handler = createIsolatedTestStoreV3CommandHandler({
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
    const admin = createAdminClient(); if (!admin.configured) throw Error("test_store_backend_unavailable");
    const { data, error } = await admin.client.rpc("isolated_test_store_command_v3", {
      p_buyer_id: actor.userId, p_session_id: actor.sessionId, p_command: request.command,
      p_request_id: request.requestId, p_configuration_digest: request.configurationDigest, p_payload: request.payload,
    });
    if (error) throw Error("test_store_command_uncertain");
    if ((request.command === "allocate" || request.command === "read") && data?.result?.status === "provisioning"
      && typeof request.payload.intentId === "string") {
      const work = wakeProvisioner(actor.userId, request.payload.intentId.slice("scv1_intent_".length)).catch(() => {});
      // Background support is platform-specific; durable plans also survive a
      // lost process. No HTTP response from this path authorizes SDK invocation.
      const runtime = globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil: (work: Promise<unknown>) => void } };
      runtime.EdgeRuntime?.waitUntil(work);
    }
    return data;
  },
});
if (import.meta.main) Deno.serve(handler);
