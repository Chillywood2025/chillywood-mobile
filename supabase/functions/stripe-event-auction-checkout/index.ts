import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, createAdminClient, createAuthClient, jsonResponse, optionsResponse,
  readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readExactCurrentSessionAuthority } from "../_shared/exact-subject-authority.ts";

// Separate direct-account event checkout. No merch, tip, IAP, transfer or payout.
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
    const key = readOptionalEnv("STRIPE_EVENT_AUCTION_TEST_KEY");
    const returnUrl = readOptionalEnv("STRIPE_EVENT_AUCTION_RETURN_URL");
    if (!key || !/^(rk|sk)_test_[A-Za-z0-9]+$/.test(key) || !returnUrl) return unavailable("provider_not_configured");
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
      || Object.keys(payload).some(k => !["quote_id", "attempt_id"].includes(k))) return unavailable("checkout_identity_required", 400);
    const admin = createAdminClient();
    if (!admin.configured) return unavailable("server_not_configured");
    // Atomic claim creates the immutable award intent and shared reservation.
    // Missing server capability/product qualification rolls the entire claim back.
    const claim = await admin.client.rpc("prepare_creator_event_auction_checkout", {
      p_quote_id: payload.quote_id, p_buyer_id: auth.user.id,
      p_session_id: authority.sessionGeneration, p_attempt_id: payload.attempt_id,
    });
    if (claim.error || !claim.data) return unavailable("approved_checkout_unavailable");
    let q = claim.data;
    const recovering = q.startAuthorized !== true;
    if (recovering) {
      const recovered = await admin.client.rpc("recover_creator_event_auction_checkout", {
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
    if (q.environment !== "test" || q.buyerId !== auth.user.id || q.quoteId !== payload.quote_id
      || q.routeKind !== "external_browser_checkout" || !["ios", "web"].includes(q.platform)
      || q.storefrontCountry !== "US"
      || q.checkoutAttemptId !== payload.attempt_id || !uuid(q.creatorId) || !uuid(q.auctionId)
      || !Number.isSafeInteger(q.amountMinor) || q.amountMinor <= 0 || !/^[a-z]{3}$/.test(q.currency)
      || !/^acct_[A-Za-z0-9]+$/.test(q.providerAccountId)
      || !/^prod_[A-Za-z0-9]+$/.test(q.providerProductId)) throw new Error("invalid_claim");
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
    const metadata = { auction_quote_id: q.quoteId, auction_id: q.auctionId, buyer_user_id: q.buyerId,
      creator_user_id: q.creatorId, provider_product_id: q.providerProductId, environment: "test", rail: "stripe_event_auction" };
    for (const [name, value] of Object.entries(metadata)) {
      body.set(`metadata[${name}]`, String(value));
      body.set(`payment_intent_data[metadata][${name}]`, String(value));
    }
    const providerUrl = "https://api.stripe.com/v1/checkout/sessions"
      + (recovering ? `/${encodeURIComponent(q.providerCheckoutSessionId)}` : "");
    const response = await fetch(providerUrl, { method: recovering ? "GET" : "POST",
      headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2026-10-28.endive",
        "Stripe-Account": q.providerAccountId, "Idempotency-Key": `event-auction-${q.quoteId}`,
        "Content-Type": "application/x-www-form-urlencoded" }, body: recovering ? undefined : body, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("provider_checkout_uncertain");
    const session = await response.json();
    const url = new URL(session.url);
    if (session.object !== "checkout.session" || session.livemode !== false || session.mode !== "payment"
      || session.status !== "open" || session.payment_status !== "unpaid"
      || !/^cs_test_[A-Za-z0-9]+$/.test(session.id) || session.client_reference_id !== q.quoteId
      || (recovering && session.id !== q.providerCheckoutSessionId)
      || session.amount_total !== q.amountMinor || session.amount_subtotal !== q.amountMinor || session.currency !== q.currency
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
    const release = await admin.client.rpc("revalidate_creator_event_auction_checkout", {
      p_quote_id: q.quoteId, p_buyer_id: auth.user.id, p_session_id: authority.sessionGeneration, p_attempt_id: payload.attempt_id,
    });
    if (release.error || release.data !== true) throw new Error("checkout_release_unavailable");
    return jsonResponse(200, { status: "checkout_ready", checkoutCreated: true, liveMoneyAction: false,
      quoteId: q.quoteId, attemptId: payload.attempt_id, buyerId: q.buyerId, auctionId: q.auctionId,
      amountMinor: q.amountMinor, currency: q.currency, environment: q.environment, checkoutUrl: url.href,
      routeKind: q.routeKind, platform: q.platform, storefrontCountry: q.storefrontCountry, launchStrategy: "system_browser" });
  } catch {
    // Never undo an uncertain dispatch, release its inventory, or permit a new
    // attempt. A signed terminal event or separately authorized reconciliation
    // must settle it. Do not log payloads, keys or hosted checkout URLs.
    return jsonResponse(started ? 202 : 400, { status: started ? "pending" : "unavailable",
      reason: started ? "provider_reconciliation_required" : "checkout_request_invalid",
      checkoutCreated: false, liveMoneyAction: false });
  }
});
