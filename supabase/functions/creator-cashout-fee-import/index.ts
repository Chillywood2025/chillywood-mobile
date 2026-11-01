import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readCashoutBody } from "../_shared/creator-cashout-execution.ts";
import { observeStripeFeeReport, type PayoutFeeReportContext, type TransferFeeReportContext } from "../_shared/stripe-fee-report-evidence.ts";

// Authenticated read-only provider evidence. It never creates a report or payout.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`) return jsonResponse(403, { error: "service_authority_required" });
  try {
    const body = JSON.parse(await readCashoutBody(req.body, 4096));
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(k => !["request_id", "report_run_id", "file_id", "interval_start", "interval_end"].includes(k))
      || typeof body.request_id !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.request_id)) throw Error("request_invalid");
    const admin = createAdminClient();
    if (!admin.configured) throw Error("server_not_configured");
    const read = await admin.client.rpc("get_creator_cashout_fee_import_context", { p_request_id: body.request_id });
    if (read.error || !read.data || read.data.environment !== "live") throw Error("context_unavailable");
    const bound = read.data, key = readOptionalEnv("STRIPE_FEE_REPORT_LIVE_KEY");
    if (!key || readOptionalEnv("STRIPE_FEE_REPORT_LIVE_ACCOUNT_ID") !== bound.accountId) throw Error("fee_report_account_not_configured");
    const evidence = await observeStripeFeeReport({ accountId: bound.accountId, environment: bound.environment,
      ...(bound.transferId ? {transferId: bound.transferId} : {payoutId: bound.payoutId}), currency: bound.currency, reportRunId: body.report_run_id, fileId: body.file_id,
      intervalStart: body.interval_start, intervalEnd: body.interval_end,
      reportType: "all_fees.incurred_at.itemized.2" } as PayoutFeeReportContext | TransferFeeReportContext, key);
    const recorded = await admin.client.rpc("record_creator_cashout_fee_report", { p_request_id: body.request_id, p_evidence: evidence });
    if (recorded.error || !recorded.data) throw Error("record_failed");
    return jsonResponse(200, { ...recorded.data, providerMutation: false });
  } catch { return jsonResponse(409, { error: "cashout_fee_evidence_incomplete", providerMutation: false }); }
});
