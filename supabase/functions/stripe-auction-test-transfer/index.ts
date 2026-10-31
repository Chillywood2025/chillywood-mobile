import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { dispatchAuctionTestTransfer, reconcileAuctionTestTransfer, dispatchAuctionTestReversal, reconcileAuctionTestReversal,
  type AuctionTransferOperation, type AuctionReversalOperation } from "../_shared/stripe-auction-transfer.ts";

// Source-only test executor. No configuration is installed by this patch.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`) return jsonResponse(403, { error: "service_authority_required" });
  const key = readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_KEY"), account = readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID");
  if (readOptionalEnv("STRIPE_AUCTION_TEST_TRANSFER_EXECUTION_ENABLED") !== "true" || !key || !account || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key))
    return jsonResponse(503, { error: "test_transfer_execution_disabled", financialAuthority: false });
  try {
    const body = await req.json();
    if (!body || Object.keys(body).some(k => !["operation_id", "action"].includes(k))
      || typeof body.operation_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.operation_id)
      || !["dispatch", "reconcile", "dispatch_reversal", "reconcile_reversal"].includes(body.action))
      return jsonResponse(400, { error: "exact_operation_and_action_required" });
    const admin = createAdminClient(); if (!admin.configured) throw Error("server_not_configured");
    const reversal = body.action.endsWith("_reversal"), dispatch = body.action.startsWith("dispatch");
    const noun = reversal ? "reversal" : "transfer";
    const claimed = await admin.client.rpc(dispatch ? `claim_auction_test_${noun}_dispatch` : `read_auction_test_${noun}_operation`,
      { p_operation_id: body.operation_id });
    if (claimed.error || !claimed.data) throw Error("operation_unavailable");
    if (dispatch && claimed.data.dispatchAuthorized !== true)
      return jsonResponse(409, { status: claimed.data.status, dispatchAuthorized: false, financialAuthority: false });
    const evidence = reversal
      ? await (dispatch ? dispatchAuctionTestReversal : reconcileAuctionTestReversal)(claimed.data as AuctionReversalOperation, key, account)
      : await (dispatch ? dispatchAuctionTestTransfer : reconcileAuctionTestTransfer)(claimed.data as AuctionTransferOperation, key, account);
    const recorded = await admin.client.rpc(`record_auction_test_${noun}_result`, { p_operation_id: body.operation_id, p_evidence: evidence });
    if (recorded.error || !recorded.data) throw Error("result_not_recorded");
    return jsonResponse(200, { ...recorded.data, financialAuthority: false });
  } catch {
    // Includes the case Stripe succeeded but result persistence failed. The
    // consumed dispatch permit remains unknown, and recovery must be GET-only.
    return jsonResponse(409, { error: "provider_result_unresolved", retryable: false, reconcileOnly: true, financialAuthority: false });
  }
});
