import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createAdminClient,
  createAuthClient,
  jsonResponse,
  notConfiguredPayload,
  optionsResponse,
  parseJsonPayload,
  readCreatorPayoutAccount,
  readStripeTestSecret,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  toText,
  type AuthenticatedUser,
  type SupabaseClientLike,
} from "../_shared/stripe-connect.ts";

const FUNCTION_NAME = "create-creator-tip-checkout";
const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-02-25.clover";
const DEFAULT_SUCCESS_URL = "chillywoodmobile://tip-status";
const DEFAULT_CANCEL_URL = "chillywoodmobile://tip-status";

type TipCheckoutPayload = {
  amount_cents?: unknown;
  amountCents?: unknown;
  cancel_url?: unknown;
  cancelUrl?: unknown;
  creator_id?: unknown;
  creatorId?: unknown;
  currency?: unknown;
  private_note?: unknown;
  privateNote?: unknown;
  return_url?: unknown;
  returnUrl?: unknown;
};

type StripeCheckoutSession = {
  id?: string;
  livemode?: boolean;
  payment_intent?: string | null;
  url?: string | null;
};

type TipSettingsRow = {
  creator_id: string;
  currency?: string | null;
  max_amount_cents?: number | null;
  min_amount_cents?: number | null;
  provider_charges_enabled?: boolean | null;
  provider_payouts_enabled?: boolean | null;
  status?: string | null;
  tips_enabled?: boolean | null;
};

type PayoutAccountRow = {
  charges_enabled?: boolean | null;
  onboarding_status?: string | null;
  payouts_enabled?: boolean | null;
  provider_account_id?: string | null;
  status?: string | null;
};

const allowedWebOrigins = new Set([
  "https://chillywoodstream.com",
  "https://www.chillywoodstream.com",
]);

const allowedDeepLinkProtocols = new Set([
  "chillywoodmobile:",
  "com.chillywood.mobile:",
]);

const toAmountCents = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isInteger(amount)) return null;
  return amount;
};

const normalizeUuid = (value: unknown) => {
  const text = toText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};

const sanitizePrivateNote = (value: unknown) => {
  const note = toText(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return note ? note.slice(0, 280) : null;
};

const safeRedirectUrl = (value: unknown, fallback: string, tipId: string) => {
  const raw = toText(value) || fallback;
  try {
    const parsed = new URL(raw);
    if (!allowedWebOrigins.has(parsed.origin) && !allowedDeepLinkProtocols.has(parsed.protocol)) return fallback;
    parsed.searchParams.set("tip_id", tipId);
    return parsed.toString();
  } catch {
    const parsed = new URL(fallback);
    parsed.searchParams.set("tip_id", tipId);
    return parsed.toString();
  }
};

const encodeStripeForm = (params: Record<string, unknown>) => {
  const form = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    form.append(key, String(value));
  });
  return form;
};

const stripeRequest = async <T extends object>(
  secret: string,
  path: string,
  input: { body: Record<string, unknown>; idempotencyKey: string },
) => {
  const response = await fetch(`${STRIPE_API_BASE_URL}${path}`, {
    body: encodeStripeForm(input.body),
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": input.idempotencyKey,
      "Stripe-Version": STRIPE_API_VERSION,
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

const readMoneySwitchState = async (adminClient: SupabaseClientLike, key: string) => {
  const { data, error } = await adminClient
    .from("platform_money_kill_switches")
    .select("state")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Money switch lookup failed: ${error.message}`);
  return toText((data as { state?: unknown } | null)?.state) || "off";
};

const hasAudienceBlock = async (adminClient: SupabaseClientLike, creatorId: string, fanId: string) => {
  const { data, error } = await adminClient
    .from("channel_audience_blocks")
    .select("channel_user_id")
    .or(`and(channel_user_id.eq.${creatorId},blocked_user_id.eq.${fanId}),and(channel_user_id.eq.${fanId},blocked_user_id.eq.${creatorId})`)
    .limit(1);
  if (error) throw new Error(`Block lookup failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
};

const readCreatorDisplayName = async (adminClient: SupabaseClientLike, creatorId: string) => {
  const { data, error } = await adminClient
    .from("user_profiles")
    .select("display_name,username")
    .eq("user_id", creatorId)
    .maybeSingle();
  if (error) throw new Error(`Creator profile lookup failed: ${error.message}`);
  const row = data as { display_name?: unknown; username?: unknown } | null;
  return toText(row?.display_name) || toText(row?.username) || "creator";
};

const recentPendingTipAttempts = async (adminClient: SupabaseClientLike, fanId: string, creatorId: string) => {
  const since = new Date(Date.now() - 15_000).toISOString();
  const { count, error } = await adminClient
    .from("creator_tip_transactions")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", fanId)
    .eq("creator_id", creatorId)
    .in("status", ["pending", "checkout_started"])
    .gte("created_at", since);
  if (error) throw new Error(`Tip rate-limit lookup failed: ${error.message}`);
  return Number(count ?? 0);
};

const readTipSettings = async (adminClient: SupabaseClientLike, creatorId: string) => {
  const { data, error } = await adminClient
    .from("creator_tip_settings")
    .select("creator_id,tips_enabled,status,currency,min_amount_cents,max_amount_cents,provider_charges_enabled,provider_payouts_enabled")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (error) throw new Error(`Tip settings lookup failed: ${error.message}`);
  return data as TipSettingsRow | null;
};

const syncSettingsFromPayout = async (
  adminClient: SupabaseClientLike,
  creatorId: string,
  settings: TipSettingsRow | null,
  payoutAccount: PayoutAccountRow | null,
) => {
  if (!settings) return null;
  const providerStatus = toText(payoutAccount?.onboarding_status) || "setup_required";
  const chargesEnabled = payoutAccount?.charges_enabled === true;
  const payoutsEnabled = payoutAccount?.payouts_enabled === true;
  const status = settings.tips_enabled === true && chargesEnabled && payoutsEnabled && providerStatus === "ready_for_payouts"
    ? "active"
    : settings.tips_enabled === true && providerStatus === "payouts_disabled"
      ? "blocked"
      : settings.tips_enabled === true
        ? "setup_incomplete"
        : "paused";

  const { data, error } = await adminClient
    .from("creator_tip_settings")
    .update({
      provider_account_id: toText(payoutAccount?.provider_account_id) || null,
      provider_charges_enabled: chargesEnabled,
      provider_onboarding_status: providerStatus,
      provider_payouts_enabled: payoutsEnabled,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("creator_id", creatorId)
    .select("creator_id,tips_enabled,status,currency,min_amount_cents,max_amount_cents,provider_charges_enabled,provider_payouts_enabled")
    .single();
  if (error) throw new Error(`Tip settings provider sync failed: ${error.message}`);
  return data as TipSettingsRow;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for tip checkout requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let tipId: string | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(200, notConfiguredPayload(adminConfig.reason, adminConfig.message, {
        checkoutCreated: false,
        tipCreated: false,
      }));
    }
    adminClient = adminConfig.client;

    const parsed = await parseJsonPayload<TipCheckoutPayload>(req);
    if ("error" in parsed) return parsed.error;

    const creatorId = normalizeUuid(parsed.value.creator_id ?? parsed.value.creatorId);
    const amountCents = toAmountCents(parsed.value.amount_cents ?? parsed.value.amountCents);
    const currency = toText(parsed.value.currency || "usd").toLowerCase();
    const privateNote = sanitizePrivateNote(parsed.value.private_note ?? parsed.value.privateNote);

    if (!creatorId) return jsonResponse(400, { error: "creator_required", message: "Choose a creator to tip." });
    if (creatorId === currentUser.id) return jsonResponse(403, { error: "self_tip_blocked", message: "Creators cannot tip themselves." });
    if (currency !== "usd") return jsonResponse(400, { error: "unsupported_currency", message: "Tips are only available in USD for this test." });
    if (!amountCents || amountCents <= 0) return jsonResponse(400, { error: "invalid_amount", message: "Choose a tip amount." });

    const [tipsSwitch, liveMoneySwitch, providerWebhookSwitch] = await Promise.all([
      readMoneySwitchState(adminClient, "tips_enabled"),
      readMoneySwitchState(adminClient, "live_money_enabled"),
      readMoneySwitchState(adminClient, "provider_webhooks_enabled"),
    ]);

    if (!["on", "sandbox_only"].includes(tipsSwitch)) {
      return jsonResponse(403, { error: "tips_disabled", message: "Tips are unavailable right now." });
    }
    if (!["on", "sandbox_only"].includes(providerWebhookSwitch)) {
      return jsonResponse(403, { error: "webhook_disabled", message: "Payments are unavailable right now." });
    }
    if (liveMoneySwitch === "on") {
      return jsonResponse(403, { error: "live_mode_not_approved", message: "Tips V1 is test mode only until live approval." });
    }

    const stripeSecret = readStripeTestSecret();
    if (!stripeSecret.configured) {
      return jsonResponse(200, notConfiguredPayload(stripeSecret.reason, stripeSecret.message, {
        checkoutCreated: false,
        tipCreated: false,
      }));
    }

    const [initialSettings, payoutAccount, blocked, recentAttempts, creatorDisplayName] = await Promise.all([
      readTipSettings(adminClient, creatorId),
      readCreatorPayoutAccount(adminClient, creatorId) as Promise<PayoutAccountRow | null>,
      hasAudienceBlock(adminClient, creatorId, currentUser.id),
      recentPendingTipAttempts(adminClient, currentUser.id, creatorId),
      readCreatorDisplayName(adminClient, creatorId),
    ]);

    if (blocked) return jsonResponse(403, { error: "audience_blocked", message: "Tips are unavailable for this creator." });
    if (recentAttempts >= 3) return jsonResponse(429, { error: "too_many_tip_attempts", message: "Wait a moment before starting another tip." });
    if (!initialSettings?.tips_enabled) return jsonResponse(403, { error: "tips_not_enabled", message: "This creator has not enabled tips." });

    const settings = await syncSettingsFromPayout(adminClient, creatorId, initialSettings, payoutAccount);
    const minAmount = Number(settings?.min_amount_cents ?? 100);
    const maxAmount = Number(settings?.max_amount_cents ?? 50000);
    if (amountCents < minAmount || amountCents > maxAmount) {
      return jsonResponse(400, { error: "amount_out_of_range", message: "Choose a tip amount within the creator's allowed range." });
    }
    if (settings?.status !== "active" || !settings.provider_charges_enabled || !settings.provider_payouts_enabled) {
      await adminClient.from("creator_tip_events").insert({
        actor_id: currentUser.id,
        event_type: "provider_blocked",
        metadata: {
          creator_id: creatorId,
          status: settings?.status ?? "setup_incomplete",
          provider_charges_enabled: settings?.provider_charges_enabled === true,
          provider_payouts_enabled: settings?.provider_payouts_enabled === true,
        },
      });
      return jsonResponse(403, { error: "provider_not_ready", message: "This creator cannot receive tips yet." });
    }

    const providerAccountId = toText(payoutAccount?.provider_account_id);
    if (!providerAccountId) return jsonResponse(403, { error: "provider_not_connected", message: "This creator needs to connect payouts first." });

    const { data: tipRow, error: tipError } = await adminClient
      .from("creator_tip_transactions")
      .insert({
        creator_id: creatorId,
        creator_net_cents: amountCents,
        currency,
        idempotency_key: crypto.randomUUID(),
        message_private: privateNote,
        metadata: {
          access_granted: false,
          checkout_created_by: FUNCTION_NAME,
          live_money_action: false,
          no_badge: true,
          no_digital_content: true,
          no_perk: true,
          no_room_access: true,
          no_vip: true,
          pure_contribution_only: true,
          test_mode: true,
        },
        payment_status: "pending",
        platform_fee_cents: 0,
        provider: "stripe_connect",
        provider_account_id: providerAccountId,
        provider_environment: "test",
        provider_fee_cents: 0,
        payout_status: "not_payable",
        sender_id: currentUser.id,
        service_fee_cents: 0,
        status: "pending",
        tip_amount_cents: amountCents,
        total_paid_cents: amountCents,
      })
      .select("id,idempotency_key")
      .single();

    if (tipError) throw new Error(`Tip transaction insert failed: ${tipError.message}`);
    tipId = toText((tipRow as { id?: unknown } | null)?.id);
    const idempotencyKey = toText((tipRow as { idempotency_key?: unknown } | null)?.idempotency_key) || `tip-${tipId}`;
    if (!tipId) throw new Error("Tip transaction insert did not return an id.");

    const successUrl = safeRedirectUrl(parsed.value.return_url ?? parsed.value.returnUrl, DEFAULT_SUCCESS_URL, tipId);
    const cancelUrl = safeRedirectUrl(parsed.value.cancel_url ?? parsed.value.cancelUrl, DEFAULT_CANCEL_URL, tipId);
    const productName = `Tip ${creatorDisplayName}`;

    const session = await stripeRequest<StripeCheckoutSession>(stripeSecret.secret, "/checkout/sessions", {
      body: {
        cancel_url: cancelUrl,
        client_reference_id: tipId,
        "line_items[0][price_data][currency]": currency,
        "line_items[0][price_data][product_data][metadata][chillywood_tip_id]": tipId,
        "line_items[0][price_data][product_data][metadata][no_access_granted]": "true",
        "line_items[0][price_data][product_data][metadata][pure_contribution_only]": "true",
        "line_items[0][price_data][product_data][name]": productName,
        "line_items[0][price_data][unit_amount]": amountCents,
        "line_items[0][quantity]": 1,
        "metadata[creator_user_id]": creatorId,
        "metadata[fan_user_id]": currentUser.id,
        "metadata[chillywood_tip_id]": tipId,
        "metadata[environment]": "test",
        "metadata[live_money_action]": "false",
        "metadata[no_access_granted]": "true",
        "metadata[pure_contribution_only]": "true",
        "metadata[rail]": "creator_tip",
        mode: "payment",
        "payment_intent_data[metadata][chillywood_tip_id]": tipId,
        "payment_intent_data[metadata][creator_user_id]": creatorId,
        "payment_intent_data[metadata][fan_user_id]": currentUser.id,
        "payment_intent_data[metadata][no_access_granted]": "true",
        "payment_intent_data[metadata][pure_contribution_only]": "true",
        "payment_intent_data[metadata][rail]": "creator_tip",
        "payment_intent_data[transfer_data][destination]": providerAccountId,
        success_url: successUrl,
      },
      idempotencyKey: `chillywood-tip-checkout-${idempotencyKey}`,
    });

    const sessionId = toText(session.id);
    const sessionUrl = toText(session.url);
    if (!sessionId || !sessionUrl) throw new Error("Stripe checkout session did not include an id and URL.");
    if (session.livemode === true) throw new Error("Stripe checkout session was live-mode; refusing checkout.");

    const { error: updateError } = await adminClient
      .from("creator_tip_transactions")
      .update({
        checkout_started_at: new Date().toISOString(),
        payment_status: "pending",
        provider_checkout_session_id: sessionId,
        provider_payment_intent_id: toText(session.payment_intent) || null,
        status: "checkout_started",
        updated_at: new Date().toISOString(),
      })
      .eq("id", tipId);
    if (updateError) throw new Error(`Tip checkout update failed: ${updateError.message}`);

    await adminClient.from("creator_tip_events").insert({
      actor_id: currentUser.id,
      event_type: "checkout_created",
      tip_transaction_id: tipId,
      metadata: {
        amount_cents: amountCents,
        checkout_session_id: sessionId,
        creator_id: creatorId,
        no_access_granted: true,
        pure_contribution_only: true,
      },
    });

    await safeWriteAuditLog(adminClient, {
      action: "creator_tip_checkout_created",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      metadata: {
        amount_cents: amountCents,
        checkout_created: true,
        function_name: FUNCTION_NAME,
        no_access_granted: true,
        platform_fee_cents: 0,
        pure_contribution_only: true,
        test_mode: true,
      },
      reason: "Stripe test-mode creator tip checkout session created.",
      targetId: tipId,
      targetType: "creator_tip_transaction",
      targetUserId: creatorId,
    });

    return jsonResponse(200, {
      status: "checkout_created",
      provider: "stripe",
      providerKey: "stripe_connect",
      mode: "test",
      checkoutCreated: true,
      liveMoneyAction: false,
      noAccessGranted: true,
      pureContributionOnly: true,
      tipId,
      url: sessionUrl,
    });
  } catch (error) {
    await safeWriteAuditLog(adminClient, {
      action: "creator_tip_checkout_failed",
      actorEmail: currentUser?.email ?? null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        error: sanitizeErrorMessage(error),
        function_name: FUNCTION_NAME,
        tip_id: tipId,
      },
      reason: "Stripe test-mode creator tip checkout failed.",
      severity: "warning",
      targetId: tipId,
      targetType: "creator_tip_transaction",
    });

    return jsonResponse(500, {
      error: "creator_tip_checkout_failed",
      checkoutCreated: false,
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      mode: "test",
      provider: "stripe",
      providerKey: "stripe_connect",
    });
  }
});
