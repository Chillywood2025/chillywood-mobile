import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createAdminClient,
  createAuthClient,
  jsonResponse,
  notConfiguredPayload,
  optionsResponse,
  parseJsonPayload,
  readStripeTestSecret,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  toText,
  userHasPlatformRole,
  type AuthenticatedUser,
  type SupabaseClientLike,
} from "../_shared/stripe-connect.ts";
import { parseExactCurrentSessionAuthority, readExactBetaAccess } from "../_shared/exact-subject-authority.ts";

const FUNCTION_NAME = "stripe-merch-checkout";
const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-02-25.clover";
const DEFAULT_SUCCESS_URL = "chillywoodmobile://merch/orders";
const DEFAULT_CANCEL_URL = "chillywoodmobile://merch/orders";

type MerchCheckoutPayload = {
  tracking_mode?: unknown;
  expected_unit_price_minor?: unknown;
  expected_currency?: unknown;
  attempt_id?: unknown;
  variant_id?: unknown;
  cancel_url?: unknown;
  cancelUrl?: unknown;
  product_id?: unknown;
  product_key?: unknown;
  productId?: unknown;
  productKey?: unknown;
  quantity?: unknown;
  success_url?: unknown;
  successUrl?: unknown;
};

type MerchProductRow = {
  creates_digital_access?: boolean | null;
  creator_id?: string | null;
  currency?: string | null;
  display_name?: string | null;
  environment?: string | null;
  fulfillment_model?: string | null;
  id: string;
  is_physical_good?: boolean | null;
  metadata?: Record<string, unknown> | null;
  price_minor?: number | null;
  product_key?: string | null;
  provider?: string | null;
  status?: string | null;
  title?: string | null;
};

type StripeCheckoutSession = {
  amount_subtotal?: number;
  amount_total?: number;
  currency?: string;
  id?: string;
  livemode?: boolean;
  object?: string;
  payment_intent?: string | null;
  url?: string | null;
};

const normalizeQuantity = (value: unknown) => {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return null;
  return quantity;
};

const stripeRequest = async <T extends object>(
  secret: string,
  path: string,
  input: { body?: Record<string, unknown>; idempotencyKey?: string },
) => {
  const body = new URLSearchParams();
  Object.entries(input.body ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    body.append(key, String(value));
  });

  const response = await fetch(`${STRIPE_API_BASE_URL}${path}`, {
    body,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: { message?: string; type?: string } }) | null;

  if (!response.ok) {
    const message = payload?.error?.message
      ? `${payload.error.type ?? "stripe_error"}: ${payload.error.message}`
      : `Stripe request failed with status ${response.status}.`;
    throw new Error(sanitizeErrorMessage(message));
  }

  if (!payload || typeof payload !== "object") throw new Error("Stripe response was empty.");
  return payload as T;
};

const readProduct = async (adminClient: SupabaseClientLike, payload: MerchCheckoutPayload) => {
  const productId = toText(payload.product_id ?? payload.productId);
  const productKey = toText(payload.product_key ?? payload.productKey);
  if (!productId && !productKey) throw new Error("A merch product id or product key is required.");

  const query = adminClient
    .from("merch_products")
    .select("id, product_key, creator_id, display_name, title, provider, status, fulfillment_model, price_minor, currency, environment, is_physical_good, creates_digital_access, metadata")
    .limit(1);

  const result = productId
    ? await query.eq("id", productId).maybeSingle()
    : await query.eq("product_key", productKey).maybeSingle();

  if (result.error) throw new Error(`Merch product lookup failed: ${result.error.message}`);
  if (!result.data) throw new Error("Merch product was not found.");
  return result.data as MerchProductRow;
};

const assertPhysicalSandboxMerchProduct = (product: MerchProductRow) => {
  if (product.provider !== "stripe_physical_goods") throw new Error("Only Stripe physical merch products can use this checkout.");
  if (product.environment !== "sandbox") throw new Error("Stripe merch checkout is sandbox-only in this lane.");
  if (product.status !== "sandbox") throw new Error("Only sandbox merch products can use this checkout.");
  if (product.is_physical_good !== true) throw new Error("Merch checkout requires a physical good.");
  if (product.creates_digital_access === true) throw new Error("Merch checkout cannot create digital access.");
  if (!Number.isInteger(product.price_minor) || (product.price_minor ?? 0) <= 0) throw new Error("Merch product price is missing.");
  if (!/^[a-z]{3}$/.test(product.currency ?? "")) throw new Error("Merch product currency is invalid.");
};

const userHasActiveSandboxTesterAccess = async (
  adminClient: SupabaseClientLike,
  currentUser: AuthenticatedUser,
) => readExactBetaAccess(adminClient, currentUser.id);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe merch checkout requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(200, notConfiguredPayload(adminConfig.reason, adminConfig.message, {
        checkoutCreated: false,
        digitalAccessGrantCreated: false,
        revenueCatEntitlementCreated: false,
        premiumEntitlementCreated: false,
        payoutCreated: false,
        cashOutEnabled: false,
      }));
    }
    adminClient = adminConfig.client;

    const [isOperator, isSandboxTester] = await Promise.all([
      userHasPlatformRole(adminClient, currentUser, ["owner", "operator"]),
      userHasActiveSandboxTesterAccess(adminClient, currentUser),
    ]);
    if (!isOperator && !isSandboxTester) {
      return jsonResponse(403, {
        error: "sandbox_tester_required",
        message: "Sandbox physical merch checkout is limited to exact owner/operator subjects or active exact-subject beta testers.",
        liveMoneyAction: false,
        checkoutCreated: false,
      });
    }

    const parsed = await parseJsonPayload<MerchCheckoutPayload>(req);
    if ("error" in parsed) return parsed.error;
    const quantity = normalizeQuantity(parsed.value.quantity);
    if (!quantity) {
      return jsonResponse(400, { error: "invalid_quantity", message: "Quantity must be an integer between 1 and 10." });
    }

    const product = await readProduct(adminClient, parsed.value);
    assertPhysicalSandboxMerchProduct(product);

    const stripeSecret = readStripeTestSecret();
    if (!stripeSecret.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(stripeSecret.reason, stripeSecret.message, {
          checkoutCreated: false,
          physicalMerchOnly: true,
          digitalAccessGrantCreated: false,
          revenueCatEntitlementCreated: false,
          premiumEntitlementCreated: false,
          payoutCreated: false,
          cashOutEnabled: false,
        }),
      );
    }

    const attemptId = toText(parsed.value.attempt_id);
    const variantId = toText(parsed.value.variant_id);
    if (variantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(variantId)) {
      return jsonResponse(400, { error: "invalid_variant", message: "Choose a valid size/color option." });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
      return jsonResponse(400, { error: "invalid_attempt", message: "A stable checkout attempt id is required." });
    }
    // Freeze buyer/session authority in the original JWT. SQL owns inventory,
    // publication/visibility checks and retry identity atomically.
    const authorityResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/wave1_session_authority_readback`, {
      method: "POST",
      headers: { apikey: supabaseAnonKey, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" },
      body: "{}",
    });
    const authority = authorityResponse.ok
      ? parseExactCurrentSessionAuthority(await authorityResponse.json().catch(() => null), currentUser.id) : null;
    if (!authority) return jsonResponse(401, { error: "invalid_session", checkoutCreated: false });
    const reservationResult = await adminClient.rpc("reserve_merch_checkout_for_actor_with_tracking", {
      p_buyer_id: authority.userId, p_session_id: authority.sessionGeneration,
      p_product_id: product.id, p_quantity: quantity, p_attempt_id: attemptId,
      p_variant_id: variantId || null,
      p_expected_tracking_mode: parsed.value.tracking_mode === "tracked" || parsed.value.tracking_mode === "untracked" ? parsed.value.tracking_mode : null,
      p_expected_unit_price: Number.isSafeInteger(parsed.value.expected_unit_price_minor) ? parsed.value.expected_unit_price_minor : null,
      p_expected_currency: typeof parsed.value.expected_currency === "string" ? parsed.value.expected_currency : null,
    });
    const reservation = reservationResult.data as {
      id?: string; title?: string; priceMinor?: number; currency?: string; createdAt?: string;
      netSharePolicyVersion?: string | null; platformNetShareBps?: number | null; creatorNetShareBps?: number | null;
      shippingTrackingMode?: "tracked" | "untracked" | null; returnPolicyVersion?: string | null; returnWindowDays?: number | null;
      variantId?: string | null; sku?: string | null; size?: string | null; color?: string | null;
    } | null;
    if (reservationResult.error || !reservation?.id || !Number.isFinite(Date.parse(reservation.createdAt ?? "")) || !Number.isInteger(reservation.priceMinor)
      || (reservation.priceMinor ?? 0) <= 0 || reservation.currency !== "usd") {
      const safeReasons: Record<string, string> = {
        merch_tracking_declaration_required: "The creator must declare tracked or untracked shipping before a new purchase.",
        merch_tracking_declaration_changed: "The shipping and return terms changed. Refresh the shop and review them before checkout.",
        merch_displayed_price_changed: "The price changed. Refresh the shop and review the current price before checkout.",
        merch_existing_pending_order_check_orders: "You already have a pending order for this product. Resume it from My orders instead of starting another.",
        merch_pending_order_limit_check_orders: "You have three unresolved sandbox orders. Check My orders before starting another.",
        merch_attempt_closed_check_orders: "This checkout window has ended. Check My orders for provider confirmation; do not start a replacement payment.",
        merch_sold_out: "There is not enough available stock. Refresh the shop or choose a smaller quantity.",
        merch_variant_unavailable: "Choose an available size/color option. Refresh the shop if the option has changed.",
        merch_variant_not_expected: "This product no longer uses that option. Refresh the shop before checkout.",
        merch_creator_not_ready: "This creator is not ready to accept sandbox orders. Your existing order status remains available.",
        merch_platform_unavailable: "This Platform is not available to your account. Your existing order status remains available.",
      };
      const reason = Object.keys(safeReasons).find(key => reservationResult.error?.message?.includes(key));
      return jsonResponse(409, { error: "merch_reservation_unavailable", checkoutCreated: false,
        message: reason ? safeReasons[reason] : "This product or checkout attempt is unavailable. Refresh the shop and check My orders before retrying." });
    }
    const hasNetTerms = reservation.netSharePolicyVersion != null;
    if ((hasNetTerms && (reservation.netSharePolicyVersion !== "physical_merch_net_90_10_v1"
      || reservation.platformNetShareBps !== 1000 || reservation.creatorNetShareBps !== 9000))
      || (!hasNetTerms && (reservation.platformNetShareBps != null || reservation.creatorNetShareBps != null))) {
      return jsonResponse(409, { error: "merch_net_share_terms_invalid", checkoutCreated: false });
    }
    const orderId = reservation.id;
    // Only immutable reservation snapshots contribute to provider parameters.
    // Renaming an option after checkout cannot alter an idempotent retry.
    const optionName = [reservation.size, reservation.color].filter(Boolean).join(" / ");
    const productName = `${reservation.title || "Chi'llywood sandbox merch"}${optionName ? ` — ${optionName}` : ""}`;
    // These fixed return destinations are not proof of payment; My orders reads
    // the signed-webhook projection. Caller redirects cannot alter retry params.
    const successUrl = `${DEFAULT_SUCCESS_URL}?orderId=${encodeURIComponent(orderId)}`;
    const cancelUrl = `${DEFAULT_CANCEL_URL}?orderId=${encodeURIComponent(orderId)}`;
    const session = await stripeRequest<StripeCheckoutSession>(stripeSecret.secret, "/checkout/sessions", {
      body: {
        cancel_url: cancelUrl,
        expires_at: Math.floor(Date.parse(reservation.createdAt ?? "") / 1000) + 3600,
        client_reference_id: orderId,
        "line_items[0][price_data][currency]": reservation.currency,
        "line_items[0][price_data][product_data][metadata][chillywood_merch_product_id]": product.id,
        "line_items[0][price_data][product_data][metadata][chillywood_merch_variant_id]": reservation.variantId ?? undefined,
        "line_items[0][price_data][product_data][metadata][sku]": reservation.sku ?? undefined,
        "line_items[0][price_data][product_data][metadata][creates_digital_access]": "false",
        "line_items[0][price_data][product_data][metadata][environment]": "sandbox",
        "line_items[0][price_data][product_data][metadata][rail]": "physical_merch",
        "line_items[0][price_data][product_data][name]": productName,
        "line_items[0][price_data][unit_amount]": reservation.priceMinor,
        "line_items[0][quantity]": quantity,
        "metadata[buyer_user_id]": currentUser.id,
        "metadata[chillywood_order_id]": orderId,
        "metadata[chillywood_product_id]": product.id,
        "metadata[creates_digital_access]": "false",
        "metadata[environment]": "sandbox",
        "metadata[not_payable]": "true",
        ...(reservation.shippingTrackingMode ? {
          "metadata[shipping_tracking_mode]": reservation.shippingTrackingMode,
          "metadata[return_policy_version]": reservation.returnPolicyVersion,
        } : {}),
        "metadata[rail]": "physical_merch",
        ...(hasNetTerms ? {
          "metadata[net_share_policy_version]": reservation.netSharePolicyVersion,
          "metadata[platform_net_share_bps]": reservation.platformNetShareBps,
          "metadata[creator_net_share_bps]": reservation.creatorNetShareBps,
          "payment_intent_data[metadata][net_share_policy_version]": reservation.netSharePolicyVersion,
          "payment_intent_data[metadata][platform_net_share_bps]": reservation.platformNetShareBps,
          "payment_intent_data[metadata][creator_net_share_bps]": reservation.creatorNetShareBps,
        } : {}),
        mode: "payment",
        "payment_intent_data[metadata][chillywood_order_id]": orderId,
        "payment_intent_data[metadata][creates_digital_access]": "false",
        "payment_intent_data[metadata][environment]": "sandbox",
        "payment_intent_data[metadata][rail]": "physical_merch",
        "shipping_address_collection[allowed_countries][0]": "US",
        success_url: successUrl,
      },
      idempotencyKey: `chillywood-merch-checkout-${orderId}`,
    });

    const sessionId = toText(session.id);
    const sessionUrl = toText(session.url);
    if (!sessionId || !sessionUrl) throw new Error("Stripe checkout session did not include an id and URL.");
    if (session.livemode !== false) throw new Error("Stripe checkout session did not confirm test mode; refusing checkout.");

    const { error: updateError } = await adminClient
      .from("merch_orders")
      .update({
        provider_order_id: sessionId,
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: toText(session.payment_intent) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateError) throw new Error(`Merch order session update failed: ${updateError.message}`);

    await safeWriteAuditLog(adminClient, {
      action: "stripe_merch_checkout_created",
      actorEmail: currentUser.email,
      actorRole: "operator",
      actorUserId: currentUser.id,
      metadata: {
        checkout_created: true,
        creates_digital_access: false,
        function_name: FUNCTION_NAME,
        order_id: orderId,
        product_id: product.id,
        rail: "physical_merch",
        sandbox_only: true,
      },
      reason: "Stripe sandbox physical merch checkout session created.",
      targetId: orderId,
      targetType: "merch_order",
      targetUserId: currentUser.id,
    });

    return jsonResponse(200, {
      status: "checkout_created",
      provider: "stripe",
      providerKey: "stripe_physical_goods",
      mode: "sandbox",
      liveMoneyAction: false,
      checkoutCreated: true,
      physicalMerchOnly: true,
      digitalAccessGrantCreated: false,
      revenueCatEntitlementCreated: false,
      premiumEntitlementCreated: false,
      payoutCreated: false,
      cashOutEnabled: false,
      orderId,
      sessionId,
      url: sessionUrl,
      message: "Stripe sandbox Checkout session created for physical merch only.",
    });
  } catch (error) {
    await safeWriteAuditLog(adminClient, {
      action: "stripe_merch_checkout_failed",
      actorEmail: currentUser?.email ?? null,
      actorRole: "operator",
      actorUserId: currentUser?.id ?? null,
      metadata: {
        error: sanitizeErrorMessage(error),
        function_name: FUNCTION_NAME,
      },
      reason: "Stripe sandbox physical merch checkout failed.",
      severity: "warning",
      targetType: "merch_order",
      targetUserId: currentUser?.id ?? null,
    });

    return jsonResponse(500, {
      error: "stripe_merch_checkout_failed",
      liveMoneyAction: false,
      checkoutCreated: false,
      physicalMerchOnly: true,
      digitalAccessGrantCreated: false,
      revenueCatEntitlementCreated: false,
      premiumEntitlementCreated: false,
      payoutCreated: false,
      cashOutEnabled: false,
      message: sanitizeErrorMessage(error),
      provider: "stripe",
      providerKey: "stripe_physical_goods",
      mode: "sandbox",
    });
  }
});
