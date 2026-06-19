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

const FUNCTION_NAME = "stripe-merch-checkout";
const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-02-25.clover";
const DEFAULT_SUCCESS_URL = "chillywoodmobile://money/merch/sandbox/success";
const DEFAULT_CANCEL_URL = "chillywoodmobile://money/merch/sandbox/cancel";

type MerchCheckoutPayload = {
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

const allowedWebOrigins = new Set([
  "https://chillywoodstream.com",
  "https://www.chillywoodstream.com",
]);

const allowedDeepLinkProtocols = new Set([
  "chillywoodmobile:",
  "com.chillywood.mobile:",
]);

const normalizeQuantity = (value: unknown) => {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return null;
  return quantity;
};

const safeRedirectUrl = (value: unknown, fallback: string) => {
  const raw = toText(value) || fallback;
  try {
    const parsed = new URL(raw);
    if (allowedWebOrigins.has(parsed.origin) || allowedDeepLinkProtocols.has(parsed.protocol)) return parsed.toString();
  } catch {
    return fallback;
  }

  return fallback;
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

const readConfiguredSandboxTesterEmails = () => {
  const raw = [
    Deno.env.get("INTERNAL_SANDBOX_TESTER_EMAILS"),
    Deno.env.get("EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST"),
  ]
    .map((value) => toText(value))
    .filter(Boolean)
    .join(",");

  return new Set(
    raw
      .split(/[,\s]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.includes("@")),
  );
};

const userHasConfiguredSandboxTesterAccess = (currentUser: AuthenticatedUser) => {
  const email = toText(currentUser.email).toLowerCase();
  if (!email) return false;
  return readConfiguredSandboxTesterEmails().has(email);
};

const userHasActiveSandboxTesterAccess = async (
  adminClient: SupabaseClientLike,
  currentUser: AuthenticatedUser,
) => {
  const email = toText(currentUser.email).toLowerCase();
  const byUser = await adminClient
    .from("beta_access_memberships")
    .select("id")
    .eq("user_id", currentUser.id)
    .eq("access_status", "active")
    .maybeSingle();
  if (!byUser.error && byUser.data) return true;

  if (!email) return false;
  const byEmail = await adminClient
    .from("beta_access_memberships")
    .select("id")
    .eq("access_status", "active")
    .ilike("email", email)
    .maybeSingle();

  return !byEmail.error && !!byEmail.data;
};

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
    const isConfiguredTester = userHasConfiguredSandboxTesterAccess(currentUser);
    if (!isOperator && !isSandboxTester && !isConfiguredTester) {
      return jsonResponse(403, {
        error: "sandbox_tester_required",
        message: "Sandbox physical merch checkout is limited to owner/operator accounts, active beta testers, or server-configured internal tester sandbox accounts.",
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

    const amountSubtotal = (product.price_minor ?? 0) * quantity;
    const { data: order, error: orderError } = await adminClient
      .from("merch_orders")
      .insert({
        amount_subtotal_minor: amountSubtotal,
        amount_total_minor: amountSubtotal,
        buyer_id: currentUser.id,
        creator_id: product.creator_id ?? null,
        currency: product.currency ?? "usd",
        environment: "sandbox",
        fulfillment_status: "not_started",
        metadata: {
          cash_out_enabled: false,
          checkout_created_by: FUNCTION_NAME,
          creates_digital_access: false,
          app_access_record_created: false,
          live_money_action: false,
          physical_merch_only: true,
          premium_entitlement_created: false,
          revenuecat_entitlement_created: false,
          sandbox_only: true,
        },
        order_status: "pending",
        payment_status: "pending",
        product_id: product.id,
        provider: "stripe_physical_goods",
        shipping_required: true,
      })
      .select("id")
      .single();

    if (orderError) throw new Error(`Merch order insert failed: ${orderError.message}`);
    const orderId = toText((order as { id?: unknown } | null)?.id);
    if (!orderId) throw new Error("Merch order insert did not return an id.");

    const { error: itemError } = await adminClient
      .from("merch_order_items")
      .insert({
        currency: product.currency ?? "usd",
        order_id: orderId,
        product_id: product.id,
        quantity,
        unit_amount_minor: product.price_minor,
      });

    if (itemError) throw new Error(`Merch order item insert failed: ${itemError.message}`);

    const productName = toText(product.title ?? product.display_name) || "Chi'llywood sandbox merch";
    const successUrl = safeRedirectUrl(parsed.value.success_url ?? parsed.value.successUrl, DEFAULT_SUCCESS_URL);
    const cancelUrl = safeRedirectUrl(parsed.value.cancel_url ?? parsed.value.cancelUrl, DEFAULT_CANCEL_URL);
    const session = await stripeRequest<StripeCheckoutSession>(stripeSecret.secret, "/checkout/sessions", {
      body: {
        cancel_url: cancelUrl,
        client_reference_id: orderId,
        "line_items[0][price_data][currency]": product.currency ?? "usd",
        "line_items[0][price_data][product_data][metadata][chillywood_merch_product_id]": product.id,
        "line_items[0][price_data][product_data][metadata][creates_digital_access]": "false",
        "line_items[0][price_data][product_data][metadata][environment]": "sandbox",
        "line_items[0][price_data][product_data][metadata][rail]": "physical_merch",
        "line_items[0][price_data][product_data][name]": productName,
        "line_items[0][price_data][unit_amount]": product.price_minor,
        "line_items[0][quantity]": quantity,
        "metadata[buyer_user_id]": currentUser.id,
        "metadata[chillywood_order_id]": orderId,
        "metadata[chillywood_product_id]": product.id,
        "metadata[creates_digital_access]": "false",
        "metadata[environment]": "sandbox",
        "metadata[not_payable]": "true",
        "metadata[rail]": "physical_merch",
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
    if (session.livemode === true) throw new Error("Stripe checkout session was live-mode; refusing checkout.");

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
