import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readCashoutBody } from "../_shared/creator-cashout-execution.ts";
import { runProviderObservations } from "../_shared/creator-provider-observation.ts";

// Source only. No schedule, deployment, provider permission or activation here.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`)
    return jsonResponse(403, { error: "service_authority_required" });
  try {
    const text = await readCashoutBody(req.body, 256, 5000);
    const body = text.trim() ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)
      return jsonResponse(400, { error: "empty_body_required" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "database_unavailable" });
    const result = await runProviderObservations(admin.client, {
      test: readOptionalEnv("STRIPE_SECRET_KEY") ?? "", live: readOptionalEnv("STRIPE_CASHOUT_LIVE_KEY") ?? "",
    });
    return jsonResponse(200, result);
  } catch { return jsonResponse(409, { error: "observation_unresolved", providerWrite: false }); }
});
