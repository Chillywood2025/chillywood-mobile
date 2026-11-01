import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readCashoutBody } from "../_shared/creator-cashout-execution.ts";
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`) return jsonResponse(403, { error: "service_authority_required" });
  if (readOptionalEnv("CREATOR_CASHOUT_EXECUTION_ENABLED") !== "true") return jsonResponse(200, { status: "disabled" });
  const project = readOptionalEnv("SUPABASE_URL"), admin = createAdminClient();
  if (!admin.configured || !project || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(project)) return jsonResponse(503, { error: "cashout_driver_not_configured" });
  try {
    const body = await readCashoutBody(req.body, 64); if (body.trim() && body.trim() !== "{}") return jsonResponse(400, { error: "empty_body_required" });
    const claimed = await admin.client.rpc("claim_creator_cashout_work");
    if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length > 3) throw Error("queue_unavailable");
    const jobs = claimed.data as {requestId: string; lease: string}[];
    if (jobs.some(job => !/^[a-f0-9-]{36}$/i.test(job.requestId) || !/^[a-f0-9-]{36}$/i.test(job.lease))
      || new Set(jobs.map(job => job.requestId)).size !== jobs.length) throw Error("queue_invalid");
    const outcomes = await Promise.all(jobs.map(async job => {
      let complete = false;
      try {
        const response = await fetch(`${project.replace(/\/$/, "")}/functions/v1/creator-cashout-worker`, {
          method: "POST", redirect: "error", headers: { Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: job.requestId }), signal: AbortSignal.timeout(75000),
        });
        const result = JSON.parse(await readCashoutBody(response.body, 4096));
        complete = response.ok && typeof result.status === "string" && !result.error;
      } catch { /* The lease expires; uncertain money state is never released. */ }
      const saved = await admin.client.rpc("complete_creator_cashout_work", { p_request_id: job.requestId, p_lease: job.lease, p_complete: complete });
      return complete && !saved.error && saved.data === true;
    }));
    return jsonResponse(200, { claimed: jobs.length, completed: outcomes.filter(Boolean).length });
  } catch { return jsonResponse(503, { error: "cashout_queue_incomplete" }); }
});
