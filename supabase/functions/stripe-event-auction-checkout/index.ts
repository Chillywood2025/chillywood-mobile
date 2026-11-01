import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, createAdminClient, createAuthClient, jsonResponse, optionsResponse,
  readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readExactCurrentSessionAuthority } from "../_shared/exact-subject-authority.ts";
import { readCommerceTaxReadiness, commerceTaxParameters } from "../_shared/commerce-tax-readiness.ts";

// Mode-bound platform charge. Transfers remain a separate guarded authority.
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
    const returnUrl = readOptionalEnv("STRIPE_EVENT_AUCTION_RETURN_URL");
    if (!returnUrl) return unavailable("provider_not_configured");
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
    const provider = await admin.client.rpc("get_auction_checkout_provider_context", {
      p_lane: "event", p_quote_id: payload.quote_id, p_buyer_id: auth.user.id, p_session_id: authority.sessionGeneration,
    });
    if (provider.error || !["test", "live"].includes(provider.data?.environment)) return unavailable("approved_checkout_unavailable");
    const mode = provider.data.environment as "test" | "live", live = mode === "live";
    const key = readOptionalEnv(live ? "STRIPE_AUCTION_PLATFORM_LIVE_KEY" : "STRIPE_AUCTION_PLATFORM_TEST_KEY");
    const platformAccount = readOptionalEnv(live ? "STRIPE_AUCTION_PLATFORM_LIVE_ACCOUNT_ID" : "STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID");
    if (!key || !new RegExp(`^(rk|sk)_${mode}_[A-Za-z0-9]+$`).test(key)
      || !/^acct_[A-Za-z0-9]+$/.test(platformAccount ?? "") || platformAccount !== provider.data.platformAccountId)
      return unavailable("provider_not_configured");
    // Atomic claim creates the immutable award intent and shared reservation.
    // Missing server capability/product qualification rolls the entire claim back.
    const claim = await admin.client.rpc("prepare_creator_event_auction_platform_checkout", {
      p_quote_id: payload.quote_id, p_buyer_id: auth.user.id,
      p_session_id: authority.sessionGeneration, p_attempt_id: payload.attempt_id,
    });
    if (claim.error || !claim.data) {
      const taxReason = /\b(tax_qualification_required|tax_qualification_expired|tax_pricing_behavior_required|tax_pricing_behavior_unsupported|tax_scope_coverage_required|provider_tax_settings_unverified|tax_policy_changed)\b/.exec(claim.error?.message ?? "")?.[1];
      return unavailable(taxReason ?? "approved_checkout_unavailable");
    }
    let q = claim.data;
    const recovering = q.startAuthorized !== true;
    if (recovering) {
      const recovered = await admin.client.rpc("recover_creator_event_auction_platform_checkout", {
        p_quote_id: payload.quote_id, p_buyer_id: auth.user.id,
        p_session_id: authority.sessionGeneration, p_attempt_id: payload.attempt_id,
      });
      if (recovered.error || recovered.data?.recoveryAuthorized !== true
        || !new RegExp(`^cs_${mode}_[A-Za-z0-9]+$`).test(recovered.data.providerCheckoutSessionId)) {
        return jsonResponse(200, { status: "pending", reason: "checkout_already_claimed",
          checkoutCreated: false, liveMoneyAction: false });
      }
      q = recovered.data;
    }
    started = true;
    const android = q.platform === "android" && q.routeKind === "android_external_content_link";
    const browser = ["ios", "web"].includes(q.platform) && q.routeKind === "external_browser_checkout";
    if (q.environment !== mode || q.buyerId !== auth.user.id || q.quoteId !== payload.quote_id
      || (!android && !browser)
      || q.storefrontCountry !== "US"
      || q.checkoutAttemptId !== payload.attempt_id || !uuid(q.creatorId) || !uuid(q.auctionId)
      || !Number.isSafeInteger(q.amountMinor) || q.amountMinor <= 0 || !/^[a-z]{3}$/.test(q.currency)
      || q.providerAccountId !== platformAccount || q.chargePattern !== "platform_separate_transfer"
      || q.settlementPolicy !== "auction_platform_net_80_20_v1" || !uuid(q.settlementContractId)
      || q.financialAuthority !== false || !/^acct_[A-Za-z0-9]+$/.test(q.recipientAccountId)
      || q.recipientAccountId === platformAccount
      || !/^prod_[A-Za-z0-9]+$/.test(q.providerProductId)) throw new Error("invalid_claim");
    const taxPolicy = recovering ? null : await readCommerceTaxReadiness(admin.client, { feature: "event_auction", identityId: q.quoteId,
      productId: q.providerProductId, accountId: platformAccount!, environment: mode, permittedScope: "worldwide" });
    if (taxPolicy && !taxPolicy.ready) return unavailable(taxPolicy.reason);
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
    // Full permitted destination coverage, not the storefront country, qualified
    // this immutable policy. Every platform keeps the winning bid tax-inclusive.
    if (taxPolicy?.ready) for (const [name, value] of Object.entries(commerceTaxParameters(taxPolicy))) body.set(name, value);
    body.set("billing_address_collection", "required");
    const metadata = { auction_quote_id: q.quoteId, auction_id: q.auctionId, buyer_user_id: q.buyerId,
      creator_user_id: q.creatorId, provider_product_id: q.providerProductId, environment: mode, rail: "stripe_event_auction",
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
    if (taxPolicy?.ready) {
      const productResponse = await fetch(`https://api.stripe.com/v1/products/${encodeURIComponent(q.providerProductId)}`, {
        method: "GET", redirect: "error", headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2026-10-28.endive" },
        signal: AbortSignal.timeout(15000) });
      if (!productResponse.ok) throw new Error("tax_product_unverified");
      const taxProduct = await productResponse.json();
      if (taxProduct.id !== q.providerProductId || taxProduct.object !== "product" || taxProduct.livemode !== live || taxProduct.active !== true
        || taxProduct.tax_code !== taxPolicy.taxCode) throw new Error("tax_product_unverified");
    }
    if (!recovering) {
      // Provider reads can outlast a qualification or a stop decision. Recheck
      // current server authority immediately before the one permitted POST.
      const dispatch = await admin.client.rpc("get_auction_checkout_provider_context", {
        p_lane: "event", p_quote_id: q.quoteId, p_buyer_id: auth.user.id, p_session_id: authority.sessionGeneration,
      });
      if (dispatch.error || dispatch.data?.environment !== mode || dispatch.data?.platformAccountId !== platformAccount)
        throw new Error("checkout_dispatch_authority_changed");
      const currentTax = await readCommerceTaxReadiness(admin.client, { feature: "event_auction", identityId: q.quoteId,
        productId: q.providerProductId, accountId: platformAccount!, environment: mode, permittedScope: "worldwide" });
      if (!currentTax.ready || !taxPolicy?.ready || currentTax.policyId !== taxPolicy.policyId)
        throw new Error("checkout_dispatch_tax_changed");
    }
    const response = await fetch(providerUrl, { method: recovering ? "GET" : "POST",
      headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2026-10-28.endive",
        "Idempotency-Key": `event-auction-platform-v1-${q.quoteId}`,
        "Content-Type": "application/x-www-form-urlencoded" }, body: recovering ? undefined : body, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("provider_checkout_uncertain");
    const session = await response.json();
    const url = new URL(session.url);
    if (session.object !== "checkout.session" || session.livemode !== live || session.mode !== "payment"
      || session.status !== "open" || session.payment_status !== "unpaid"
      || !new RegExp(`^cs_${mode}_[A-Za-z0-9]+$`).test(session.id) || session.client_reference_id !== q.quoteId
      || (recovering && session.id !== q.providerCheckoutSessionId)
      || session.amount_total !== q.amountMinor || session.amount_subtotal !== q.amountMinor || session.currency !== q.currency
      || (taxPolicy?.ready && (session.automatic_tax?.enabled !== (taxPolicy.collectionMode === "automatic")
        || session.metadata?.commerce_tax_policy_id !== taxPolicy.policyId))
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
    return jsonResponse(200, { status: "checkout_ready", checkoutCreated: true, liveMoneyAction: live && !recovering,
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
