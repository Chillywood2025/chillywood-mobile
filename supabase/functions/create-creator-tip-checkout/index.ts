import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
  storedStripeConfiguration,
  toText,
  type AuthenticatedUser,
  type CreatorPayoutAccountRow,
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
  request_id?: unknown;
  requestId?: unknown;
  capability_id?: unknown;
  google_play_external_transaction_token?: unknown;
  google_play_external_link_api_version?: unknown;
};

type StripeCheckoutSession = {
  id?: string;
  livemode?: boolean;
  payment_intent?: string | null;
  url?: string | null;
  client_reference_id?: string;
  amount_total?: number;
  currency?: string;
  status?: string;
  expires_at?: number;
  metadata?: Record<string,string>;
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

type PayoutAccountRow = CreatorPayoutAccountRow & {
  charges_enabled?: boolean | null;
  onboarding_status?: string | null;
  payouts_enabled?: boolean | null;
  provider_account_id?: string | null;
  status?: string | null;
};

type BuyerSessionAuthority = {
  userId: string;
  accountId: string;
  sessionGeneration: string;
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
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
};

const normalizeUuid = (value: unknown) => {
  const text = toText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};

const normalizeBuyerSessionAuthority = (
  value: unknown,
  expectedUserId: string,
): BuyerSessionAuthority | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const userId = normalizeUuid(row.userId);
  const accountId = normalizeUuid(row.accountId);
  const sessionGeneration = normalizeUuid(row.sessionGeneration);
  if (
    row.authoritative !== true
    || row.state !== "ACTIVE"
    || row.restoreOnly !== false
    || !userId
    || userId !== expectedUserId
    || accountId !== userId
    || !sessionGeneration
  ) return null;
  return { userId, accountId, sessionGeneration };
};

const readBuyerSessionAuthority = async (
  client: SupabaseClientLike,
  expectedUserId: string,
) => {
  try {
    const { data, error } = await client.rpc("wave1_session_authority_readback");
    return error ? null : normalizeBuyerSessionAuthority(data, expectedUserId);
  } catch {
    return null;
  }
};

const sameBuyerSessionAuthority = (
  left: BuyerSessionAuthority,
  right: BuyerSessionAuthority | null,
) => !!right
  && left.userId === right.userId
  && left.accountId === right.accountId
  && left.sessionGeneration === right.sessionGeneration;

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
    if (!allowedWebOrigins.has(parsed.origin) && !allowedDeepLinkProtocols.has(parsed.protocol)) {
      const safe = new URL(fallback); safe.searchParams.set("tip_id", tipId); return safe.toString();
    }
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
  input?: { body: Record<string, unknown>; idempotencyKey: string },
) => {
  const response = await fetch(`${STRIPE_API_BASE_URL}${path}`, {
    body: input ? encodeStripeForm(input.body) : undefined,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(input ? { "Idempotency-Key": input.idempotencyKey } : {}),
      "Stripe-Version": STRIPE_API_VERSION,
    },
    method: input ? "POST" : "GET",
    signal: AbortSignal.timeout(15_000), redirect: "error",
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

const payoutAccountReadyForTip = (account: PayoutAccountRow | null) =>
  !!account && account.charges_enabled === true && account.payouts_enabled === true
  && account.onboarding_status === "ready_for_payouts"
  && storedStripeConfiguration(account).configurationStatus === "match";

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
  const status = settings.tips_enabled === true && payoutAccountReadyForTip(payoutAccount)
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

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for tip checkout requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let tipId: string | null = null;
  let attemptResponse: Record<string, unknown> | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;
    const authorization = toText(req.headers.get("Authorization"));
    const buyerAuthorityClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(200, notConfiguredPayload(adminConfig.reason, adminConfig.message, {
        checkoutCreated: false,
        tipCreated: false,
      }));
    }
    adminClient = adminConfig.client;

    const buyerAuthority = await readBuyerSessionAuthority(buyerAuthorityClient, currentUser.id);
    if (!buyerAuthority) {
      return jsonResponse(403, {
        error: "buyer_authority_required",
        checkoutCreated: false,
        liveMoneyAction: false,
        message: "An active unrestricted account session is required before starting a tip.",
      });
    }

    const parsed = await parseJsonPayload<TipCheckoutPayload>(req);
    if ("error" in parsed) {
      return parsed.error ?? jsonResponse(400, {
        error: "invalid_body",
        message: "Request body could not be verified.",
      });
    }

    const creatorId = normalizeUuid(parsed.value.creator_id ?? parsed.value.creatorId);
    const amountCents = toAmountCents(parsed.value.amount_cents ?? parsed.value.amountCents);
    const currency = toText(parsed.value.currency || "usd").toLowerCase();
    const privateNote = sanitizePrivateNote(parsed.value.private_note ?? parsed.value.privateNote);
    const requestId = normalizeUuid(parsed.value.request_id ?? parsed.value.requestId);
    if (!requestId) return jsonResponse(400, { error: "tip_request_id_required", message: "Use a durable tip checkout attempt." });

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
    // New custom tips use a server-owned, buyer-session-bound capability's
    // provider/method limits, not the creator's historical preset range.
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

    tipId = crypto.randomUUID();
    const successUrl = safeRedirectUrl(parsed.value.return_url ?? parsed.value.returnUrl, DEFAULT_SUCCESS_URL, tipId);
    const cancelUrl = safeRedirectUrl(parsed.value.cancel_url ?? parsed.value.cancelUrl, DEFAULT_CANCEL_URL, tipId);
    const productName = `Tip ${creatorDisplayName}`;

    const requestedBody = {
        expires_at: Math.floor(Date.now() / 1000) + 3600,
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
        "payment_method_types[0]": "card",
        "payment_intent_data[metadata][chillywood_tip_id]": tipId,
        "payment_intent_data[metadata][creator_user_id]": creatorId,
        "payment_intent_data[metadata][fan_user_id]": currentUser.id,
        "payment_intent_data[metadata][no_access_granted]": "true",
        "payment_intent_data[metadata][pure_contribution_only]": "true",
        "payment_intent_data[metadata][rail]": "creator_tip",
        "payment_intent_data[transfer_data][destination]": providerAccountId,
        success_url: successUrl,
      };
    const { data: reserved, error: reserveError } = await adminClient.rpc("reserve_creator_tip_checkout_attempt", {
      p_buyer_id: buyerAuthority.accountId, p_session_id: buyerAuthority.sessionGeneration, p_request_id: requestId,
      p_quote: { tipId, creatorId, amountCents, currency, privateNote, providerAccountId,
        capabilityId: normalizeUuid(parsed.value.capability_id), body: requestedBody },
    });
    if (reserveError || !reserved || typeof reserved !== "object") throw new Error("Tip checkout attempt could not be reserved.");
    const attempt = reserved as Record<string, unknown>;
    const externalCapability = attempt.externalCapability && typeof attempt.externalCapability === "object"
      ? attempt.externalCapability as Record<string, unknown> : null;
    const androidExternal = externalCapability?.routeKind === "android_external_content_link";
    tipId = normalizeUuid(attempt.tipId);
    if (!tipId || attempt.requestId !== requestId || attempt.buyerId !== currentUser.id || attempt.creatorId !== creatorId
      || attempt.amountCents !== amountCents || attempt.currency !== currency || typeof attempt.body !== "object" || !attempt.body
      || typeof attempt.idempotencyKey !== "string") throw new Error("Tip checkout quote could not be verified.");
    attemptResponse = { requestId, buyerId: currentUser.id, creatorId, amountCents, currency, tipId,
      provider: "stripe", providerKey: "stripe_connect", mode: "test", checkoutCreated: false,
      routeKind: androidExternal ? "android_external_content_link" : "external_browser_checkout",
      launchStrategy: androidExternal ? "google_play_external_content_link" : "system_browser",
      liveMoneyAction: false, noAccessGranted: true, pureContributionOnly: true, url: null };
    if (!["pending", "checkout_started"].includes(String(attempt.status))) return jsonResponse(200, {
      ...attemptResponse, status: attempt.status, message: "This tip already has a recorded outcome. Refresh Purchases for its receipt.",
    });
    const currentBuyerAuthority = await readBuyerSessionAuthority(buyerAuthorityClient, currentUser.id);
    if (!sameBuyerSessionAuthority(buyerAuthority, currentBuyerAuthority)) return jsonResponse(200, {
      ...attemptResponse, status: "pending", error: "buyer_authority_changed",
      message: "Your session changed. Check Purchases for the original attempt before trying again.",
    });
    const knownSession = toText(attempt.providerSessionId);
    const latestPayout = await readCreatorPayoutAccount(adminClient, creatorId) as PayoutAccountRow | null;
    const recipientCurrent = payoutAccountReadyForTip(latestPayout)
      && (attempt.body as Record<string, unknown>)["payment_intent_data[transfer_data][destination]"] === toText(latestPayout?.provider_account_id);
    const { data: dispatchAuthority, error: dispatchAuthorityError } = await adminClient.rpc("read_creator_tip_checkout_dispatch_authority", {
      p_buyer_id: buyerAuthority.accountId, p_session_id: buyerAuthority.sessionGeneration, p_request_id: requestId,
    });
    const routeCurrent = !dispatchAuthorityError && dispatchAuthority && typeof dispatchAuthority === "object"
      && (dispatchAuthority as Record<string, unknown>).allowed === true;
    if (!knownSession && !routeCurrent) return jsonResponse(200, {
      ...attemptResponse, status: "reconciliation_required", message: "The approved payment route is no longer available. Keep this original attempt and check Purchases.",
    });
    if (!knownSession && !recipientCurrent) return jsonResponse(200, {
      ...attemptResponse, status: "reconciliation_required", message: "The original recipient setup changed. This tip needs review before checkout can continue.",
    });
    if (!knownSession && attempt.retryAllowed !== true) return jsonResponse(200, {
      ...attemptResponse, status: "reconciliation_required", message: "The original checkout needs reconciliation. No new checkout was started.",
    });
    // A known provider session may still be read for reconciliation when the
    // native observation expires. A payment URL may only be returned after a
    // fresh native admission is privately bound to this exact frozen quote.
    let nativeBound = !androidExternal;
    if (androidExternal && routeCurrent && recipientCurrent) {
      const nativeToken = parsed.value.google_play_external_transaction_token;
      if (typeof nativeToken === "string" && nativeToken.length > 0 && nativeToken.length <= 16384
        && parsed.value.google_play_external_link_api_version === 1) {
        const { data: bound, error: bindError } = await adminClient.rpc("bind_google_play_external_checkout", {
          p_buyer_id: buyerAuthority.accountId, p_session_id: buyerAuthority.sessionGeneration,
          p_feature: "creator_tip", p_quote_id: tipId,
          p_external_transaction_token: nativeToken, p_api_version: 1,
        });
        nativeBound = !bindError && !!bound && typeof bound === "object"
          && (bound as Record<string, unknown>).routeKind === "android_external_content_link"
          && !!normalizeUuid((bound as Record<string, unknown>).bindingId);
      }
    }
    if (!knownSession && !nativeBound) return jsonResponse(200, {
      ...attemptResponse, status: "pending", error: "google_play_external_launch_required",
      message: "Reopen this original tip using the Google Play checkout flow. No new payment was started.",
    });
    if (knownSession && !/^cs_test_[A-Za-z0-9]+$/.test(knownSession)) throw new Error("Tip checkout session identity is invalid.");
    // Retrieve known sessions; retry unknown creation only with frozen terms and key.
    const session = knownSession
      ? await stripeRequest<StripeCheckoutSession>(stripeSecret.secret, `/checkout/sessions/${knownSession}`)
      : await stripeRequest<StripeCheckoutSession>(stripeSecret.secret, "/checkout/sessions", {
        body: attempt.body as Record<string, unknown>, idempotencyKey: String(attempt.idempotencyKey),
      });

    const sessionId = toText(session.id);
    const sessionUrl = toText(session.url);
    if (!/^cs_test_[A-Za-z0-9]+$/.test(sessionId) || (knownSession && sessionId !== knownSession)
      || session.livemode !== false || session.client_reference_id !== tipId
      || session.amount_total !== amountCents || session.currency !== currency
      || !Number.isSafeInteger(session.expires_at) || session.expires_at !== (attempt.body as Record<string, unknown>).expires_at
      || session.metadata?.chillywood_tip_id !== tipId) throw new Error("Stripe checkout identity could not be verified.");
    const { data: recorded, error: updateError } = await adminClient.rpc("record_creator_tip_checkout_session", {
      p_buyer_id: buyerAuthority.accountId, p_session_id: buyerAuthority.sessionGeneration, p_request_id: requestId,
      p_checkout_session_id: sessionId, p_payment_intent_id: toText(session.payment_intent) || null,
    });
    if (updateError || !recorded || typeof recorded !== "object") throw new Error("Tip checkout receipt could not be recorded.");
    const saved = recorded as Record<string, unknown>;
    if (saved.tipId !== tipId || saved.providerSessionId !== sessionId) throw new Error("Tip checkout receipt identity changed.");
    const { data: finalRoute, error: finalRouteError } = await adminClient.rpc("read_creator_tip_checkout_dispatch_authority", {
      p_buyer_id: buyerAuthority.accountId, p_session_id: buyerAuthority.sessionGeneration, p_request_id: requestId,
    });
    if (!nativeBound || !routeCurrent || finalRouteError || !finalRoute || typeof finalRoute !== "object" || (finalRoute as Record<string, unknown>).allowed !== true
      || !recipientCurrent || !sameBuyerSessionAuthority(buyerAuthority, await readBuyerSessionAuthority(buyerAuthorityClient, currentUser.id))
      || !["pending", "checkout_started"].includes(String(saved.status)) || session.status !== "open") return jsonResponse(200, {
      ...attemptResponse, status: saved.status, message: "Check Purchases for this original tip. No new payment link is available.",
    });
    const checkoutUrl = new URL(sessionUrl);
    if (checkoutUrl.origin !== "https://checkout.stripe.com" || checkoutUrl.username || checkoutUrl.password
      || !/^\/(?:c\/)?pay\//u.test(checkoutUrl.pathname)) throw new Error("Stripe checkout link could not be verified.");

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
      ...attemptResponse,
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

    if (attemptResponse) return jsonResponse(200, { ...attemptResponse, status: "pending",
      message: "Checkout could not be confirmed. Keep this original attempt and check Purchases before trying again." });
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
