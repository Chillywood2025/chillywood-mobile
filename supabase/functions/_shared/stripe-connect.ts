import { createClient } from "npm:@supabase/supabase-js@2";

export type AuthenticatedUser = {
  email: string | null;
  id: string;
};

type AuthResult = { user: AuthenticatedUser } | { error: Response };
type JsonObject = Record<string, unknown>;
export type SupabaseClientLike = ReturnType<typeof createClient>;

export type StripeConnectAccountPayload = {
  creator_user_id?: unknown;
  creatorUserId?: unknown;
  provider_account_id?: unknown;
  providerAccountId?: unknown;
  requested_account_type?: unknown;
  requestedAccountType?: unknown;
};

export type StripeConnectOnboardingPayload = StripeConnectAccountPayload & {
  refresh_url?: unknown;
  refreshUrl?: unknown;
  return_url?: unknown;
  returnUrl?: unknown;
};

export type StripeConnectSyncPayload = StripeConnectAccountPayload;

type StripeRequirements = {
  currently_due?: unknown;
  eventually_due?: unknown;
  past_due?: unknown;
  disabled_reason?: unknown;
};

export type StripeAccountObject = {
  capabilities?: Record<string, unknown>;
  charges_enabled?: boolean;
  country?: string;
  default_currency?: string;
  details_submitted?: boolean;
  id?: string;
  livemode?: boolean;
  payouts_enabled?: boolean;
  requirements?: StripeRequirements | null;
};

export type NormalizedStripeAccount = {
  cardPaymentsCapabilityStatus: string;
  chargesEnabled: boolean;
  country: string | null;
  defaultCurrency: string;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  id: string;
  kycReady: boolean;
  legacyStatus: string;
  onboardingStatus: string;
  payoutsEnabled: boolean;
  providerReady: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  requirementsPastDue: string[];
  transfersCapabilityStatus: string;
};

export type CreatorPayoutAccountRow = {
  id: string;
  creator_user_id: string;
  metadata?: unknown;
  onboarding_completed_at?: string | null;
  onboarding_started_at?: string | null;
  provider_account_id?: string | null;
  status?: string;
};

export type StripeProviderEvent = {
  account?: string | null;
  data?: {
    object?: unknown;
  };
  id?: string;
  livemode?: boolean;
  type?: string;
};

export type StripeConnectTransferSyncPayload = {
  provider_payout_id?: unknown;
  provider_transfer_id?: unknown;
  provider_transfer_record_id?: unknown;
  providerPayoutId?: unknown;
  providerTransferId?: unknown;
  providerTransferRecordId?: unknown;
};

export type CreatorPayoutProviderTransferRow = {
  amount_minor?: number | null;
  created_at?: string | null;
  creator_user_id?: string | null;
  currency?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  id: string;
  last_provider_sync_at?: string | null;
  metadata?: unknown;
  payout_account_id?: string | null;
  payout_entry_id?: number | null;
  platform_admin_audit_log_id?: string | null;
  provider?: string | null;
  provider_environment?: string | null;
  provider_payout_id?: string | null;
  provider_status?: string | null;
  provider_transfer_id?: string | null;
  status?: string | null;
};

export type StripeTransferObject = {
  amount?: number;
  created?: number;
  currency?: string;
  destination?: string | null;
  id?: string;
  livemode?: boolean;
  metadata?: Record<string, unknown>;
  object?: string;
  reversed?: boolean;
};

export type StripePayoutObject = {
  amount?: number;
  arrival_date?: number;
  created?: number;
  currency?: string;
  failure_code?: string | null;
  failure_message?: string | null;
  id?: string;
  livemode?: boolean;
  metadata?: Record<string, unknown>;
  object?: string;
  status?: string;
};

export const DB_PROVIDER = "stripe_connect";
export const RESPONSE_PROVIDER = "stripe";
export const PROVIDER_ENVIRONMENT = "test";
export const STRIPE_API_VERSION = "2026-02-25.clover";

const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const DEFAULT_ALLOWED_REDIRECT_ORIGINS = new Set([
  "https://chillywoodstream.com",
  "https://www.chillywoodstream.com",
]);

const DEFAULT_ALLOWED_DEEP_LINK_SCHEMES = new Set([
  "chillywoodmobile",
  "com.chillywood.mobile",
]);

export const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

export const optionsResponse = () => new Response("ok", { headers: JSON_HEADERS, status: 200 });

export const toText = (value: unknown) => String(value ?? "").trim();

export const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown Stripe Connect provider error.");

  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk_(test|live)_[A-Za-z0-9_]+/gi, "sk_[redacted]")
    .replace(/rk_(test|live)_[A-Za-z0-9_]+/gi, "rk_[redacted]")
    .replace(/whsec_[A-Za-z0-9_]+/gi, "whsec_[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{64,}/g, "[redacted]")
    .slice(0, 280);
};

export const parseJsonPayload = async <Payload extends object>(req: Request) => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return { value: {} as Payload };

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: jsonResponse(400, { error: "invalid_body", message: "Request body must be a JSON object." }) };
    }

    return { value: parsed as Payload };
  } catch {
    return { error: jsonResponse(400, { error: "invalid_json", message: "Request body must be valid JSON." }) };
  }
};

export const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const readOptionalEnv = (key: string) => toText(Deno.env.get(key)) || null;

export const readStripeTestSecret = () => {
  const value = readOptionalEnv("STRIPE_SECRET_KEY");
  if (!value) {
    return {
      configured: false as const,
      message: "Stripe Connect test-mode secret is not configured for this Edge Function.",
      reason: "stripe_secret_missing",
    };
  }

  if (!value.startsWith("sk_test_")) {
    return {
      configured: false as const,
      message: "Stripe secret is not a test-mode secret. Refusing provider calls.",
      reason: "stripe_secret_not_test_mode",
    };
  }

  return { configured: true as const, secret: value };
};

export const readStripeWebhookSecret = () => {
  const value = readOptionalEnv("STRIPE_WEBHOOK_SECRET");
  if (!value) {
    return {
      configured: false as const,
      message: "Stripe Connect webhook secret is not configured for this Edge Function.",
      reason: "stripe_webhook_secret_missing",
    };
  }

  if (!value.startsWith("whsec_")) {
    return {
      configured: false as const,
      message: "Stripe webhook secret is not in the expected server-side format. Refusing webhook processing.",
      reason: "stripe_webhook_secret_invalid",
    };
  }

  return { configured: true as const, secret: value };
};

export const createAuthClient = () => {
  const supabaseUrl = readRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");

  return {
    supabaseAnonKey,
    supabaseUrl,
  };
};

export const createAdminClient = () => {
  const supabaseUrl = readRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return {
      configured: false as const,
      message: "Supabase service role secret is not configured for provider-owned Edge Function writes.",
      reason: "service_role_missing",
    };
  }

  return {
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    configured: true as const,
  };
};

export const authenticateRequest = async (
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<AuthResult> => {
  const authorization = toText(req.headers.get("Authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: jsonResponse(401, { error: "missing_authorization", message: "Bearer authorization is required." }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId) {
    return { error: jsonResponse(401, { error: "invalid_session", message: "Supabase could not verify the current user session." }) };
  }

  return {
    user: {
      email: data.user?.email ?? null,
      id: userId,
    },
  };
};

export const userHasPlatformRole = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
  roles: string[],
) => {
  const normalizedEmail = toText(user.email).toLowerCase();
  const userQuery = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .in("role", roles)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (userQuery.error) throw new Error(`Platform role lookup failed: ${userQuery.error.message}`);
  if ((userQuery.data as { id?: unknown } | null)?.id) return true;
  if (!normalizedEmail) return false;

  const emailQuery = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .in("role", roles)
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (emailQuery.error) throw new Error(`Platform role email lookup failed: ${emailQuery.error.message}`);
  return !!(emailQuery.data as { id?: unknown } | null)?.id;
};

export const requestedCreatorUserId = (payload: StripeConnectAccountPayload) =>
  toText(payload.creator_user_id ?? payload.creatorUserId);

export const hasClientProviderAccountId = (payload: StripeConnectAccountPayload) =>
  !!toText(payload.provider_account_id ?? payload.providerAccountId);

export const requestedAccountType = (payload: StripeConnectAccountPayload) =>
  toText(payload.requested_account_type ?? payload.requestedAccountType) || null;

export const notConfiguredPayload = (reason: string, message: string, extra: JsonObject = {}) => ({
  status: "not_configured",
  provider: RESPONSE_PROVIDER,
  providerKey: DB_PROVIDER,
  mode: PROVIDER_ENVIRONMENT,
  liveMoneyAction: false,
  providerCall: false,
  providerWrite: false,
  reason,
  message,
  ...extra,
});

const metadataObject = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
};

const redactMetadata = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactMetadata);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, item]) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("password") ||
        lowerKey.includes("card") ||
        lowerKey.includes("bank") ||
        lowerKey.includes("identity_document")
      ) {
        return [key, "[redacted]"];
      }

      if (typeof item === "string") return [key, sanitizeErrorMessage(item)];
      return [key, redactMetadata(item)];
    }),
  );
};

const safeMetadata = (metadata: JsonObject = {}) =>
  redactMetadata({
    ...metadata,
    foundation_only: false,
    live_money_action: false,
    payout_execution: false,
    provider: RESPONSE_PROVIDER,
    provider_key: DB_PROVIDER,
    provider_environment: PROVIDER_ENVIRONMENT,
    stripe_api_version: STRIPE_API_VERSION,
    stripe_connect_test_mode: true,
  }) as JsonObject;

export const writeAuditLog = async (
  adminClient: SupabaseClientLike,
  input: {
    action: string;
    actorEmail?: string | null;
    actorRole?: string | null;
    actorUserId?: string | null;
    afterState?: unknown;
    beforeState?: unknown;
    metadata?: JsonObject;
    reason?: string | null;
    requestId?: string | null;
    severity?: string;
    targetId?: string | null;
    targetType?: string | null;
    targetUserId?: string | null;
  },
) => {
  const { data, error } = await adminClient
    .from("platform_admin_audit_logs")
    .insert({
      action: input.action,
      action_category: "payout",
      actor_email: input.actorEmail ?? null,
      actor_role: input.actorRole ?? "creator_self_service",
      actor_user_id: input.actorUserId ?? null,
      after_state: input.afterState == null ? null : (redactMetadata(input.afterState) as JsonObject),
      before_state: input.beforeState == null ? null : (redactMetadata(input.beforeState) as JsonObject),
      metadata: safeMetadata(input.metadata),
      reason: input.reason ?? "Stripe Connect test-mode provider action.",
      request_id: input.requestId ?? null,
      severity: input.severity ?? "info",
      target_id: input.targetId ?? null,
      target_type: input.targetType ?? null,
      target_user_id: input.targetUserId ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Audit log insert failed: ${error.message}`);
  return toText((data as { id?: unknown } | null)?.id) || null;
};

export const safeWriteAuditLog = async (
  adminClient: SupabaseClientLike | null,
  input: Parameters<typeof writeAuditLog>[1],
) => {
  if (!adminClient) return null;

  try {
    return await writeAuditLog(adminClient, input);
  } catch {
    return null;
  }
};

const arrayOfStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => toText(item))
    .filter(Boolean)
    .slice(0, 100);
};

const capabilityStatus = (value: unknown) => {
  const status = toText(value);
  if (["requested", "pending", "active", "inactive", "rejected"].includes(status)) return status;
  return status ? "unknown" : "not_requested";
};

export const normalizeStripeAccount = (account: StripeAccountObject): NormalizedStripeAccount => {
  const id = toText(account.id);
  if (!id) throw new Error("Stripe account response did not include an account id.");

  const requirements = account.requirements ?? {};
  const currentlyDue = arrayOfStrings(requirements.currently_due);
  const eventuallyDue = arrayOfStrings(requirements.eventually_due);
  const pastDue = arrayOfStrings(requirements.past_due);
  const disabledReason = toText(requirements.disabled_reason) || null;
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  const transfersCapabilityStatus = capabilityStatus(account.capabilities?.transfers);
  const cardPaymentsCapabilityStatus = capabilityStatus(account.capabilities?.card_payments);
  const providerReady = payoutsEnabled && detailsSubmitted && !disabledReason && currentlyDue.length === 0 && pastDue.length === 0;
  const kycReady = detailsSubmitted && !disabledReason && currentlyDue.length === 0 && pastDue.length === 0;
  const onboardingStatus = (() => {
    if (disabledReason) return "payouts_disabled";
    if (currentlyDue.length > 0 || pastDue.length > 0) return "action_required";
    if (providerReady) return "ready_for_payouts";
    if (detailsSubmitted) return "under_review";
    return "setup_required";
  })();
  const legacyStatus = (() => {
    if (disabledReason) return "pending_review";
    if (providerReady) return "eligible";
    if (currentlyDue.length > 0 || pastDue.length > 0) return "pending_kyc";
    if (!detailsSubmitted) return "setup_required";
    return "pending_review";
  })();

  return {
    cardPaymentsCapabilityStatus,
    chargesEnabled,
    country: toText(account.country) || null,
    defaultCurrency: toText(account.default_currency).toLowerCase() || "usd",
    detailsSubmitted,
    disabledReason,
    id,
    kycReady,
    legacyStatus,
    onboardingStatus,
    payoutsEnabled,
    providerReady,
    requirementsCurrentlyDue: currentlyDue,
    requirementsEventuallyDue: eventuallyDue,
    requirementsPastDue: pastDue,
    transfersCapabilityStatus,
  };
};

const accountMetadata = (
  existing: CreatorPayoutAccountRow | null,
  normalized: NormalizedStripeAccount,
  source: string,
) =>
  safeMetadata({
    ...metadataObject(existing?.metadata),
    last_provider_sync_source: source,
    provider_account_status: normalized.legacyStatus,
    provider_ready: normalized.providerReady,
    requirements_summary: {
      currently_due_count: normalized.requirementsCurrentlyDue.length,
      eventually_due_count: normalized.requirementsEventuallyDue.length,
      past_due_count: normalized.requirementsPastDue.length,
      disabled_reason_present: !!normalized.disabledReason,
    },
  });

export const readCreatorPayoutAccount = async (adminClient: SupabaseClientLike, creatorUserId: string) => {
  const { data, error } = await adminClient
    .from("creator_payout_accounts")
    .select("*")
    .eq("creator_user_id", creatorUserId)
    .eq("provider", DB_PROVIDER)
    .maybeSingle();

  if (error) throw new Error(`Payout account read failed: ${error.message}`);
  return (data ?? null) as CreatorPayoutAccountRow | null;
};

export const readCreatorPayoutAccountByProviderId = async (adminClient: SupabaseClientLike, providerAccountId: string) => {
  const { data, error } = await adminClient
    .from("creator_payout_accounts")
    .select("*")
    .eq("provider", DB_PROVIDER)
    .eq("provider_environment", PROVIDER_ENVIRONMENT)
    .eq("provider_account_id", providerAccountId)
    .maybeSingle();

  if (error) throw new Error(`Payout account provider lookup failed: ${error.message}`);
  return (data ?? null) as CreatorPayoutAccountRow | null;
};

export const upsertCreatorPayoutAccountFromStripe = async (
  adminClient: SupabaseClientLike,
  creatorUserId: string,
  normalized: NormalizedStripeAccount,
  existing: CreatorPayoutAccountRow | null,
  auditLogId: string | null,
  source: string,
) => {
  const now = new Date().toISOString();
  const onboardingCompletedAt =
    normalized.providerReady && !existing?.onboarding_completed_at ? now : existing?.onboarding_completed_at ?? null;

  const { data, error } = await adminClient
    .from("creator_payout_accounts")
    .upsert(
      {
        card_payments_capability_status: normalized.cardPaymentsCapabilityStatus,
        charges_enabled: normalized.chargesEnabled,
        country: normalized.country,
        creator_user_id: creatorUserId,
        default_currency: normalized.defaultCurrency,
        details_submitted: normalized.detailsSubmitted,
        disabled_reason: normalized.disabledReason,
        kyc_status: normalized.kycReady ? "verified" : "pending",
        last_platform_admin_audit_log_id: auditLogId,
        last_provider_sync_at: now,
        metadata: accountMetadata(existing, normalized, source),
        onboarding_completed_at: onboardingCompletedAt,
        onboarding_status: normalized.onboardingStatus,
        payouts_enabled: normalized.payoutsEnabled,
        provider: DB_PROVIDER,
        provider_account_id: normalized.id,
        provider_account_type: "express",
        provider_configuration_key: "stripe_connect_test_express_controller_v1",
        provider_dashboard_type: "express",
        provider_environment: PROVIDER_ENVIRONMENT,
        provider_fees_payer: "platform",
        provider_losses_collector: "platform",
        provider_requirements_collection: "stripe",
        requirements_currently_due: normalized.requirementsCurrentlyDue,
        requirements_eventually_due: normalized.requirementsEventuallyDue,
        requirements_past_due: normalized.requirementsPastDue,
        status: normalized.legacyStatus,
        tax_status: "not_connected",
        transfers_capability_status: normalized.transfersCapabilityStatus,
        updated_at: now,
      },
      { onConflict: "creator_user_id" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Payout account upsert failed: ${error.message}`);
  return data as CreatorPayoutAccountRow;
};

export const markOnboardingStarted = async (
  adminClient: SupabaseClientLike,
  account: CreatorPayoutAccountRow,
  auditLogId: string | null,
) => {
  const now = new Date().toISOString();
  const { data, error } = await adminClient
    .from("creator_payout_accounts")
    .update({
      last_platform_admin_audit_log_id: auditLogId,
      metadata: safeMetadata({
        ...metadataObject(account.metadata),
        last_provider_sync_source: "stripe_connect_onboarding_link",
      }),
      onboarding_started_at: account.onboarding_started_at ?? now,
      onboarding_status: "onboarding_in_progress",
      status: account.status === "eligible" ? "eligible" : "pending_kyc",
      updated_at: now,
    })
    .eq("id", account.id)
    .select("*")
    .single();

  if (error) throw new Error(`Payout account onboarding-start update failed: ${error.message}`);
  return data as CreatorPayoutAccountRow;
};

export const upsertEligibilityRecord = async (
  adminClient: SupabaseClientLike,
  creatorUserId: string,
  payoutAccountId: string,
  normalized: NormalizedStripeAccount,
  auditLogId: string | null,
) => {
  const now = new Date().toISOString();
  const { error } = await adminClient.from("creator_payout_eligibility_records").upsert(
    {
      admin_review_status: "not_started",
      creator_user_id: creatorUserId,
      eligibility_reason: normalized.providerReady
        ? "Stripe Connect test-mode provider readiness is synced. Payout execution is not active."
        : "Stripe Connect test-mode setup is not complete. Payout execution is not active.",
      eligibility_status: normalized.onboardingStatus,
      eligible_for_payouts: false,
      fraud_hold_active: false,
      hold_period_cleared: false,
      kyc_ready: normalized.kycReady,
      last_evaluated_at: now,
      metadata: safeMetadata({
        provider_ready: normalized.providerReady,
        provider_status_only: true,
        no_payable_balance: true,
      }),
      minimum_payout_met: false,
      payout_account_id: payoutAccountId,
      payout_account_ready: normalized.providerReady,
      platform_admin_audit_log_id: auditLogId,
      provider_ready: normalized.providerReady,
      tax_ready: false,
      updated_at: now,
    },
    { onConflict: "creator_user_id" },
  );

  if (error) throw new Error(`Payout eligibility upsert failed: ${error.message}`);
};

const encodeStripeForm = (params: Record<string, unknown>) => {
  const form = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") return;
    form.set(key, String(value));
  });
  return form;
};

class StripeRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const stripeRequest = async <T>(
  secret: string,
  path: string,
  options: {
    body?: Record<string, unknown>;
    idempotencyKey?: string;
    method: "GET" | "POST";
  },
) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };

  let body: URLSearchParams | undefined;
  if (options.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = encodeStripeForm(options.body);
  }

  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(`${STRIPE_API_BASE_URL}${path}`, {
    body,
    headers,
    method: options.method,
  });
  const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string; type?: string } } | null;

  if (!response.ok) {
    const stripeError = payload?.error;
    const message = stripeError?.message
      ? `${stripeError.type ?? "stripe_error"}: ${stripeError.message}`
      : `Stripe API request failed with status ${response.status}.`;
    throw new StripeRequestError(response.status, sanitizeErrorMessage(message));
  }

  return payload as T;
};

const accountCountry = () => {
  const configured = readOptionalEnv("STRIPE_CONNECT_ACCOUNT_COUNTRY");
  return configured && /^[A-Za-z]{2}$/.test(configured) ? configured.toUpperCase() : "US";
};

const accountCurrency = () => {
  const configured = readOptionalEnv("STRIPE_CONNECT_DEFAULT_CURRENCY");
  return configured && /^[A-Za-z]{3}$/.test(configured) ? configured.toLowerCase() : "usd";
};

export const createStripeConnectAccount = async (secret: string, user: AuthenticatedUser) => {
  const params: Record<string, unknown> = {
    country: accountCountry(),
    "controller[fees][payer]": "application",
    "controller[losses][payments]": "application",
    "controller[requirement_collection]": "stripe",
    "controller[stripe_dashboard][type]": "express",
    default_currency: accountCurrency(),
    "capabilities[transfers][requested]": true,
    "metadata[chillywood_provider]": DB_PROVIDER,
    "metadata[chillywood_provider_environment]": PROVIDER_ENVIRONMENT,
    "metadata[chillywood_payout_s3c_test_mode]": true,
    "metadata[creator_user_id]": user.id,
  };

  if (user.email) params.email = user.email;

  return stripeRequest<StripeAccountObject>(secret, "/accounts", {
    body: params,
    idempotencyKey: `chillywood-stripe-connect-account-${user.id}`,
    method: "POST",
  });
};

export const retrieveStripeConnectAccount = async (secret: string, providerAccountId: string) =>
  stripeRequest<StripeAccountObject>(secret, `/accounts/${encodeURIComponent(providerAccountId)}`, {
    method: "GET",
  });

export const retrieveStripeTransfer = async (secret: string, providerTransferId: string) =>
  stripeRequest<StripeTransferObject>(secret, `/transfers/${encodeURIComponent(providerTransferId)}`, {
    method: "GET",
  });

export const retrieveStripePayout = async (secret: string, providerPayoutId: string) =>
  stripeRequest<StripePayoutObject>(secret, `/payouts/${encodeURIComponent(providerPayoutId)}`, {
    method: "GET",
  });

export const requestedProviderTransferRecordId = (payload: StripeConnectTransferSyncPayload) =>
  toText(payload.provider_transfer_record_id ?? payload.providerTransferRecordId);

export const hasClientProviderTransferReference = (payload: StripeConnectTransferSyncPayload) =>
  !!toText(
    payload.provider_transfer_id ?? payload.providerTransferId ?? payload.provider_payout_id ?? payload.providerPayoutId,
  );

export const readProviderTransferRecord = async (
  adminClient: SupabaseClientLike,
  providerTransferRecordId: string,
) => {
  const { data, error } = await adminClient
    .from("creator_payout_provider_transfers")
    .select("*")
    .eq("id", providerTransferRecordId)
    .maybeSingle();

  if (error) throw new Error(`Provider transfer record read failed: ${error.message}`);
  return (data ?? null) as CreatorPayoutProviderTransferRow | null;
};

const stripeUnixSecondsToIso = (value: unknown) => {
  const seconds = typeof value === "number" && Number.isFinite(value) ? value : null;
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
};

export const safeTransferStatusPayload = (row: CreatorPayoutProviderTransferRow) => ({
  amount_is_payable: false,
  checkout_created: false,
  creator_user_id: row.creator_user_id ?? null,
  currency: row.currency ?? "usd",
  failure_code: row.failure_code ?? null,
  failure_message_present: !!row.failure_message,
  local_transfer_record_id: row.id,
  live_money_action: false,
  payout_created: false,
  provider: row.provider ?? DB_PROVIDER,
  provider_environment: row.provider_environment ?? PROVIDER_ENVIRONMENT,
  provider_payout_id_present: !!row.provider_payout_id,
  provider_status: row.provider_status ?? null,
  provider_transfer_id_present: !!row.provider_transfer_id,
  status: row.status ?? "not_active",
  transfer_created: false,
});

export const normalizeStripeTransferStatus = (transfer: StripeTransferObject) => {
  if (transfer.livemode === true) {
    throw new Error("Live-mode Stripe transfer object was rejected by the test-mode sync foundation.");
  }

  const reversed = transfer.reversed === true;
  return {
    failureCode: null as string | null,
    failureMessage: null as string | null,
    localStatus: reversed ? "reversed_later" : "synced_test",
    providerCreatedAt: stripeUnixSecondsToIso(transfer.created),
    providerStatus: reversed ? "reversed" : "created",
  };
};

export const normalizeStripePayoutStatus = (payout: StripePayoutObject) => {
  if (payout.livemode === true) {
    throw new Error("Live-mode Stripe payout object was rejected by the test-mode sync foundation.");
  }

  const providerStatus = toText(payout.status).toLowerCase() || "unknown";
  const localStatus = (() => {
    if (providerStatus === "pending") return "pending_later";
    if (providerStatus === "in_transit") return "in_transit_later";
    if (providerStatus === "paid") return "paid_later";
    if (providerStatus === "failed") return "failed_later";
    if (providerStatus === "canceled" || providerStatus === "cancelled") return "cancelled_later";
    return "synced_test";
  })();

  return {
    estimatedArrivalAt: stripeUnixSecondsToIso(payout.arrival_date),
    failureCode: toText(payout.failure_code) || null,
    failureMessage: toText(payout.failure_message) || null,
    localStatus,
    providerCreatedAt: stripeUnixSecondsToIso(payout.created),
    providerStatus,
  };
};

export const updateProviderTransferSyncResult = async (
  adminClient: SupabaseClientLike,
  row: CreatorPayoutProviderTransferRow,
  input: {
    auditLogId?: string | null;
    estimatedArrivalAt?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    providerCreatedAt?: string | null;
    providerStatus: string;
    source: string;
    status: string;
  },
) => {
  const now = new Date().toISOString();
  const metadata = safeMetadata({
    ...metadataObject(row.metadata),
    last_provider_sync_source: input.source,
    provider_status_imported: true,
    status_import_only: true,
    transfer_creation: false,
    payout_creation: false,
  });

  const { data, error } = await adminClient
    .from("creator_payout_provider_transfers")
    .update({
      estimated_arrival_at: input.estimatedArrivalAt ?? null,
      failure_code: input.failureCode ?? null,
      failure_message: input.failureMessage ?? null,
      last_provider_sync_at: now,
      metadata,
      platform_admin_audit_log_id: input.auditLogId ?? row.platform_admin_audit_log_id ?? null,
      provider_created_at: input.providerCreatedAt ?? null,
      provider_status: input.providerStatus,
      status: input.status,
      updated_at: now,
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) throw new Error(`Provider transfer sync update failed: ${error.message}`);
  return data as CreatorPayoutProviderTransferRow;
};

export const createStripeConnectOnboardingLink = async (
  secret: string,
  providerAccountId: string,
  returnUrl: string,
  refreshUrl: string,
) =>
  stripeRequest<{ created?: number; expires_at?: number; object?: string; url?: string }>(secret, "/account_links", {
    body: {
      account: providerAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    },
    idempotencyKey: `chillywood-stripe-connect-link-${providerAccountId}-${crypto.randomUUID()}`,
    method: "POST",
  });

export const insertOnboardingSession = async (
  adminClient: SupabaseClientLike,
  input: {
    account: CreatorPayoutAccountRow;
    auditLogId: string | null;
    createdByUserId: string;
    expiresAt: string | null;
    refreshUrl: string;
    returnUrl: string;
  },
) => {
  const now = new Date().toISOString();
  const { error } = await adminClient.from("creator_payout_onboarding_sessions").insert({
    created_by_user_id: input.createdByUserId,
    creator_user_id: input.account.creator_user_id,
    expires_at: input.expiresAt,
    metadata: safeMetadata({
      onboarding_url_stored: false,
      return_url_origin: safeUrlOrigin(input.returnUrl),
      refresh_url_origin: safeUrlOrigin(input.refreshUrl),
    }),
    onboarding_url_created_at: now,
    payout_account_id: input.account.id,
    platform_admin_audit_log_id: input.auditLogId,
    provider: DB_PROVIDER,
    provider_account_id: input.account.provider_account_id ?? null,
    provider_environment: PROVIDER_ENVIRONMENT,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    status: "link_created",
    updated_at: now,
  });

  if (error) throw new Error(`Onboarding session insert failed: ${error.message}`);
};

const allowedRedirectOrigins = () => {
  const configured = readOptionalEnv("STRIPE_CONNECT_ALLOWED_REDIRECT_ORIGINS");
  const values = new Set(DEFAULT_ALLOWED_REDIRECT_ORIGINS);
  if (!configured) return values;

  configured
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      try {
        const parsed = new URL(item);
        values.add(parsed.origin.toLowerCase());
      } catch {
        const scheme = item.replace(/:$/, "").toLowerCase();
        if (scheme) values.add(`${scheme}:`);
      }
    });

  return values;
};

export const safeUrlOrigin = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin.toLowerCase();
    return parsed.protocol.toLowerCase();
  } catch {
    return "invalid";
  }
};

export const resolveRedirectUrls = (payload: StripeConnectOnboardingPayload) => {
  const returnUrl = toText(payload.return_url ?? payload.returnUrl) || readOptionalEnv("STRIPE_CONNECT_RETURN_URL");
  const refreshUrl = toText(payload.refresh_url ?? payload.refreshUrl) || readOptionalEnv("STRIPE_CONNECT_REFRESH_URL");

  if (!returnUrl || !refreshUrl) {
    return {
      error: jsonResponse(400, {
        error: "redirect_url_required",
        message: "return_url and refresh_url are required before an onboarding link can be created.",
      }),
    };
  }

  const returnUrlError = validateAllowedRedirectUrl(returnUrl, "return_url");
  const refreshUrlError = validateAllowedRedirectUrl(refreshUrl, "refresh_url");
  if (returnUrlError || refreshUrlError) {
    return {
      error: jsonResponse(400, {
        error: "invalid_redirect_url",
        message: returnUrlError ?? refreshUrlError,
      }),
    };
  }

  return { value: { refreshUrl, returnUrl } };
};

const validateAllowedRedirectUrl = (rawUrl: string, fieldName: string) => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return `${fieldName} must be a valid URL.`;
  }

  if (parsed.username || parsed.password) return `${fieldName} must not include credentials.`;
  if (rawUrl.length > 2048) return `${fieldName} is too long.`;

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === "https:") {
    const allowedOrigins = allowedRedirectOrigins();
    if (!allowedOrigins.has(parsed.origin.toLowerCase())) {
      return `${fieldName} origin is not allowed for Stripe Connect onboarding.`;
    }
    return null;
  }

  if (protocol === "http:") {
    return `${fieldName} must use https or the Chi'llywood app deep-link scheme.`;
  }

  const scheme = protocol.replace(/:$/, "");
  const envAllowsScheme = allowedRedirectOrigins().has(protocol);
  if (!DEFAULT_ALLOWED_DEEP_LINK_SCHEMES.has(scheme) && !envAllowsScheme) {
    return `${fieldName} scheme is not allowed for Stripe Connect onboarding.`;
  }

  return null;
};

const unixSecondsToIso = (value: unknown) => {
  const seconds = typeof value === "number" && Number.isFinite(value) ? value : null;
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
};

export const onboardingLinkExpiresAt = (value: unknown) => unixSecondsToIso(value);

export const verifyStripeWebhookSignature = async (rawBody: string, signatureHeader: string | null, webhookSecret: string) => {
  const header = toText(signatureHeader);
  if (!header) return false;

  const parts = header.split(",").map((item) => item.trim());
  const timestamp = toText(parts.find((part) => part.startsWith("t="))?.slice(2));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);

  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(webhookSecret), { hash: "SHA-256", name: "HMAC" }, false, [
    "sign",
  ]);
  const signedPayload = `${timestamp}.${rawBody}`;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return signatures.some((provided) => timingSafeEqualHex(expectedHex, provided));
};

const timingSafeEqualHex = (expected: string, provided: string) => {
  if (!/^[a-f0-9]+$/i.test(provided)) return false;

  const expectedBytes = hexToBytes(expected);
  const providedBytes = hexToBytes(provided);
  if (expectedBytes.length !== providedBytes.length) return false;

  let result = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    result |= expectedBytes[index] ^ providedBytes[index];
  }

  return result === 0;
};

const hexToBytes = (value: string) => {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

export const parseStripeEvent = (rawBody: string) => {
  const parsed = JSON.parse(rawBody) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Stripe webhook body was not an event object.");
  const event = parsed as StripeProviderEvent;
  if (!toText(event.id) || !toText(event.type)) throw new Error("Stripe webhook event is missing id or type.");
  return event;
};

export const stripeAccountFromEvent = (event: StripeProviderEvent) => {
  const object = event.data?.object;
  if (!object || typeof object !== "object" || Array.isArray(object)) return null;
  return object as StripeAccountObject;
};

export const insertProviderWebhookEvent = async (
  adminClient: SupabaseClientLike,
  event: StripeProviderEvent,
  providerAccountId: string | null,
) => {
  const eventId = toText(event.id);
  const eventType = toText(event.type);
  const { data, error } = await adminClient
    .from("creator_payout_provider_webhook_events")
    .insert({
      connected_account_id: toText(event.account) || null,
      event_id: eventId,
      event_type: eventType,
      idempotency_key: `stripe-connect-webhook-${eventId}`,
      livemode: event.livemode === true,
      metadata: safeMetadata({
        event_type: eventType,
        raw_event_stored: false,
      }),
      provider: DB_PROVIDER,
      provider_account_id: providerAccountId,
      provider_environment: PROVIDER_ENVIRONMENT,
      status: "received",
    })
    .select("*")
    .single();

  if (error && error.code === "23505") {
    const { data: existing, error: readError } = await adminClient
      .from("creator_payout_provider_webhook_events")
      .select("*")
      .eq("provider", DB_PROVIDER)
      .eq("provider_environment", PROVIDER_ENVIRONMENT)
      .eq("event_id", eventId)
      .maybeSingle();

    if (readError) throw new Error(`Webhook event duplicate lookup failed: ${readError.message}`);
    return { duplicate: true as const, row: existing as { id?: string; status?: string } | null };
  }

  if (error) throw new Error(`Webhook event insert failed: ${error.message}`);
  return { duplicate: false as const, row: data as { id?: string; status?: string } | null };
};

export const updateProviderWebhookEvent = async (
  adminClient: SupabaseClientLike,
  rowId: string,
  input: {
    auditLogId?: string | null;
    failureReason?: string | null;
    metadata?: JsonObject;
    status: "processed" | "ignored" | "failed" | "retry_required";
  },
) => {
  const { error } = await adminClient
    .from("creator_payout_provider_webhook_events")
    .update({
      failure_reason: input.failureReason ?? null,
      metadata: safeMetadata(input.metadata ?? {}),
      platform_admin_audit_log_id: input.auditLogId ?? null,
      processed_at: new Date().toISOString(),
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);

  if (error) throw new Error(`Webhook event update failed: ${error.message}`);
};

export const safeRequirementsSummary = (normalized: NormalizedStripeAccount) => ({
  currentlyDueCount: normalized.requirementsCurrentlyDue.length,
  eventuallyDueCount: normalized.requirementsEventuallyDue.length,
  pastDueCount: normalized.requirementsPastDue.length,
  disabledReasonPresent: !!normalized.disabledReason,
});

export const safeAccountStatusPayload = (normalized: NormalizedStripeAccount) => ({
  charges_enabled: normalized.chargesEnabled,
  details_submitted: normalized.detailsSubmitted,
  onboarding_status: normalized.onboardingStatus,
  payout_execution_active: false,
  payouts_enabled: normalized.payoutsEnabled,
  provider_account_status: normalized.legacyStatus,
  provider_account_type: "express",
  provider_ready: normalized.providerReady,
  requirements: safeRequirementsSummary(normalized),
});
