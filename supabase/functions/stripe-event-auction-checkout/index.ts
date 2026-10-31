import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, createAdminClient, createAuthClient, jsonResponse, optionsResponse,
  readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readExactCurrentSessionAuthority } from "../_shared/exact-subject-authority.ts";

// Platform-owned test charge. Transfers are separate and remain disabled.
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const unavailable = (reason: string, status = 200) => jsonResponse(status,
  { status: "unavailable", reason, checkoutCreated: false, liveMoneyAction: false });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return unavailable("method_not_allowed", 405);
  let started = false;
  try {
    // Dedicated configuration is required; never fall back to another money rail.
    const key = readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_KEY");
    const platformAccount = readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID");
    const returnUrl = readOptionalEnv("STRIPE_EVENT_AUCTION_RETURN_URL");
    if (!key || !/^(rk|sk)_test_[A-Za-z0-9]+$/.test(key) || !/^acct_[A-Za-z0-9]+$/.test(platformAccount ?? "") || !returnUrl) return unavailable("provider_not_configured");
    const destination = new URL(returnUrl);
    if (destination.protocol !== "https:" || destination.username || destination.password) return unavailable("return_destination_not_configured");
    const { supabaseUrl, supabaseAnonKey } = createAuthClient();
    const auth = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in auth) return auth.error;
    const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const authority = await readExactCurrentSessionAuthority(client, auth.user.id);
    if (!authority) return unavailable("buyer_session_authority_required", 403);
    const payload = await req.json();
    if (!uuid(payload?.quote_id) || !uuid(payload?.attempt_id)
      || Object.keys(payload).some(k => !["quote_id", "attempt_id", "google_play_external_transaction_token", "google_play_external_link_api_version"].includes(k))) return unavailable("checkout_identity_required", 400);
    const admin = createAdminClient();
    if (!admin.configured) return unavailable("server_not_configured");
    // Atomic claim creates the immutable award intent and shared reservation.
    // Missing server capability/product qualification rolls the entire claim back.
    const claim = await admin.client.rpc("prepare_creator_event_auction_platform_checkout", {
      p_quote_id: payload.quote_id, p_buyer_id: auth.user.id,
      p_session_id: authority.sessionGeneration, p_attempt_id: payload.attempt_id,
    });
    if (claim.error || !claim.data) return unavailable("approved_checkout_unavailable");
    let q = claim.data;
    const recovering = q.startAuthorized !== true;
    if (recovering) {
      const recovered = await admin.client.rpc("recover_creator_event_auction_platform_checkout", {
        p_quote_id: payload.quote_id, p_buyer_id: auth.user.id,
        p_session_id: authority.sessionGeneration, p_attempt_id: payload.attempt_id,
      });
      if (recovered.error || recovered.data?.recoveryAuthorized !== true
        || !/^cs_test_[A-Za-z0-9]+$/.test(recovered.data.providerCheckoutSessionId)) {
        return jsonResponse(200, { status: "pending", reason: "checkout_already_claimed",
          checkoutCreated: false, liveMoneyAction: false });
      }
      q = recovered.data;
    }
    started = true;
    const android = q.platform === "android" && q.routeKind === "android_external_content_link";
    const browser = ["ios", "web"].includes(q.platform) && q.routeKind === "external_browser_checkout";
    if (q.environment !== "test" || q.buyerId !== auth.user.id || q.quoteId !== payload.quote_id
      || (!android && !browser)
      || q.storefrontCountry !== "US"
      || q.checkoutAttemptId !== payload.attempt_id || !uuid(q.creatorId) || !uuid(q.auctionId)
      || !Number.isSafeInteger(q.amountMinor) || q.amountMinor <= 0 || !/^[a-z]{3}$/.test(q.currency)
      || q.providerAccountId !== platformAccount || q.chargePattern !== "platform_separate_transfer"
      || q.settlementPolicy !== "auction_platform_net_80_20_v1" || !uuid(q.settlementContractId)
      || q.financialAuthority !== false || !/^acct_[A-Za-z0-9]+$/.test(q.recipientAccountId)
      || q.recipientAccountId === platformAccount
      || !/^prod_[A-Za-z0-9]+$/.test(q.providerProductId)) throw new Error("invalid_claim");
    if (android) {
      // Bind the same fresh native observation that admitted this buyer/quote.
      // The opaque token stays private and is never sent as Stripe metadata.
      const nativeBinding = await admin.client.rpc("bind_google_play_external_checkout", {
        p_buyer_id: auth.user.id, p_session_id: authority.sessionGeneration,
        p_feature: "event_auction", p_quote_id: q.quoteId,
        p_external_transaction_token: payload.google_play_external_transaction_token,
        p_api_version: payload.google_play_external_link_api_version,
      });
      if (nativeBinding.error || !uuid(nativeBinding.data?.bindingId)
        || nativeBinding.data?.routeKind !== "android_external_content_link") throw new Error("native_checkout_binding_required");
    } else if (payload.google_play_external_transaction_token !== undefined
      || payload.google_play_external_link_api_version !== undefined) throw new Error("unexpected_native_token");
    const expires = Math.floor(Date.parse(q.expiresAt) / 1000);
    if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000) + (recovering ? 1 : 1800)
      || expires > Math.floor(Date.now() / 1000) + 86400) throw new Error("checkout_window_unsupported");
    const body = new URLSearchParams({ mode: "payment", "allowed_payment_method_types[0]": "card",
      client_reference_id: q.quoteId, success_url: destination.href, cancel_url: destination.href,
      expires_at: String(expires), "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": q.currency,
      "line_items[0][price_data][unit_amount]": String(q.amountMinor),
      "line_items[0][price_data][product]": q.providerProductId,
      "adaptive_pricing[enabled]": "false", allow_promotion_codes: "false",
      integration_identifier: `chillywood_event_auction_${payload.attempt_id.replaceAll("-", "").slice(0, 8).replace(/[0-9a-f]/g, (v: string) => String.fromCharCode(97 + parseInt(v, 16)))}`,
    });
    if (android) {
      // The winning bid is the full buyer price, including tax. Program setup
      // must qualify the product tax category and account registration first.
      body.set("automatic_tax[enabled]", "true");
      body.set("billing_address_collection", "required");
      body.set("line_items[0][price_data][tax_behavior]", "inclusive");
    }
    const metadata = { auction_quote_id: q.quoteId, auction_id: q.auctionId, buyer_user_id: q.buyerId,
      creator_user_id: q.creatorId, provider_product_id: q.providerProductId, environment: "test", rail: "stripe_event_auction",
      settlement_contract_id: q.settlementContractId, settlement_policy: q.settlementPolicy };
    for (const [name, value] of Object.entries(metadata)) {
      body.set(`metadata[${name}]`, String(value));
      body.set(`payment_intent_data[metadata][${name}]`, String(value));
    }
    const providerUrl = "https://api.stripe.com/v1/checkout/sessions"
      + (recovering ? `/${encodeURIComponent(q.providerCheckoutSessionId)}` : "");
    const accountResponse = await fetch("https://api.stripe.com/v1/account", { method: "GET", redirect: "error",
      headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2026-10-28.endive" }, signal: AbortSignal.timeout(15000) });
    if (!accountResponse.ok) throw new Error("platform_account_unverified");
    const providerAccount = await accountResponse.json();
    if (providerAccount.object !== "account" || providerAccount.id !== platformAccount) throw new Error("platform_account_mismatch");
    const response = await fetch(providerUrl, { method: recovering ? "GET" : "POST",
      headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2026-10-28.endive",
        "Idempotency-Key": `event-auction-platform-v1-${q.quoteId}`,
        "Content-Type": "application/x-www-form-urlencoded" }, body: recovering ? undefined : body, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("provider_checkout_uncertain");
    const session = await response.json();
    const url = new URL(session.url);
    if (session.object !== "checkout.session" || session.livemode !== false || session.mode !== "payment"
      || session.status !== "open" || session.payment_status !== "unpaid"
      || !/^cs_test_[A-Za-z0-9]+$/.test(session.id) || session.client_reference_id !== q.quoteId
      || (recovering && session.id !== q.providerCheckoutSessionId)
      || session.amount_total !== q.amountMinor || session.amount_subtotal !== q.amountMinor || session.currency !== q.currency
      || (android && session.automatic_tax?.enabled !== true)
      || session.expires_at !== expires
      || Object.entries(metadata).some(([name, value]) => session.metadata?.[name] !== value)
      || !Array.isArray(session.payment_method_types) || session.payment_method_types.length !== 1 || session.payment_method_types[0] !== "card"
      || url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password
      || (session.payment_intent !== null && !/^pi_[A-Za-z0-9]+$/.test(session.payment_intent))) throw new Error("provider_response_mismatch");
    const bound = await admin.client.rpc("bind_creator_event_auction_checkout", { p_quote_id: q.quoteId,
      p_attempt_id: payload.attempt_id, p_session_id: session.id, p_payment_intent_id: session.payment_intent,
      p_account_id: q.providerAccountId, p_amount_minor: q.amountMinor, p_currency: q.currency });
    if (bound.error) throw new Error("checkout_binding_uncertain");
    const currentAuthority = await readExactCurrentSessionAuthority(client, auth.user.id);
    if (!currentAuthority || currentAuthority.sessionGeneration !== authority.sessionGeneration) throw new Error("buyer_session_changed");
    const release = await admin.client.rpc("revalidate_creator_event_auction_platform_checkout", {
      p_quote_id: q.quoteId, p_buyer_id: auth.user.id, p_session_id: authority.sessionGeneration, p_attempt_id: payload.attempt_id,
    });
    if (release.error || release.data !== true) throw new Error("checkout_release_unavailable");
    return jsonResponse(200, { status: "checkout_ready", checkoutCreated: true, liveMoneyAction: false,
      quoteId: q.quoteId, attemptId: payload.attempt_id, buyerId: q.buyerId, auctionId: q.auctionId,
      amountMinor: q.amountMinor, currency: q.currency, environment: q.environment, checkoutUrl: url.href,
      routeKind: q.routeKind, platform: q.platform, storefrontCountry: q.storefrontCountry, launchStrategy: android ? "google_play_external_content_link" : "system_browser" });
  } catch {
    // Never undo an uncertain dispatch, release its inventory, or permit a new
    // attempt. A signed terminal event or separately authorized reconciliation
    // must settle it. Do not log payloads, keys or hosted checkout URLs.
    return jsonResponse(started ? 202 : 400, { status: started ? "pending" : "unavailable",
      reason: started ? "provider_reconciliation_required" : "checkout_request_invalid",
      checkoutCreated: false, liveMoneyAction: false });
  }
});
