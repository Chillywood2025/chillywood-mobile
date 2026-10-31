import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { observeStripeFeeReport, type FeeReportContext } from "../_shared/stripe-fee-report-evidence.ts";

// Dormant service-only observation ingest. No scheduling, provider writes or
// settlement qualification. Account/order chain comes from the private DB.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`)
    return jsonResponse(403, { error: "service_authority_required" });
  try {
    if (!req.body) throw Error("request_body_required");
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 4096) throw Error("request_too_large");
        chunks.push(part.value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(k => !["contract_id", "report_run_id", "file_id", "interval_start", "interval_end"].includes(k))
      || typeof body.contract_id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.contract_id))
      return jsonResponse(400, { error: "fee_report_identity_required" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "server_not_configured" });
    const read = await admin.client.rpc("get_commerce_fee_report_import_context", { p_contract_id: body.contract_id });
    if (read.error || !read.data || read.data.contractId !== body.contract_id) throw Error("context_unavailable");
    const bound = read.data;
    // Explicit environment-qualified configuration. No fallback between modes.
    if (!["test", "live"].includes(bound.environment)) throw Error("mode_invalid");
    const suffix = bound.environment.toUpperCase();
    const key = readOptionalEnv(`STRIPE_FEE_REPORT_${suffix}_KEY`);
    const account = readOptionalEnv(`STRIPE_FEE_REPORT_${suffix}_ACCOUNT_ID`);
    if (!key || !account || account !== bound.accountId)
      return jsonResponse(503, { error: "fee_report_import_not_configured", financialAuthority: false });
    const evidence = await observeStripeFeeReport({ accountId: bound.accountId, environment: bound.environment,
      chargeId: bound.chargeId, refundIds: bound.refundIds, currency: bound.currency,
      reportRunId: body.report_run_id, fileId: body.file_id, intervalStart: body.interval_start,
      intervalEnd: body.interval_end, reportType: "all_fees.incurred_at.itemized.2" } as FeeReportContext, key);
    const recorded = await admin.client.rpc("record_commerce_fee_report_observation", {
      p_contract_id: body.contract_id, p_source_observation_id: bound.sourceObservationId, p_evidence: evidence,
    });
    if (recorded.error || !recorded.data) throw Error("record_failed");
    return jsonResponse(200, { ...recorded.data, financialAuthority: false, settlementReady: false });
  } catch {
    return jsonResponse(409, { error: "fee_report_import_incomplete", financialAuthority: false, settlementReady: false });
  }
});
