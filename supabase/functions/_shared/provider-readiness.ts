import { createClient } from "npm:@supabase/supabase-js@2.110.6";

type JsonObject = Record<string, unknown>;
export type SupabaseClientLike = ReturnType<typeof createClient<any, "public", any>>;

export type ProviderReadinessStatus =
  | "missing"
  | "setup_needed"
  | "configured"
  | "ready_for_review"
  | "sandbox_ready"
  | "active"
  | "disabled"
  | "blocked"
  | "error";

export type SafeProviderStatus = {
  provider: string;
  capability: string;
  status: ProviderReadinessStatus;
  displayLabel: string;
  displaySummary: string;
  nextStep: string;
  lastCheckedAt: string | null;
  isLiveMoneyEnabled: boolean;
  publicSafe: boolean;
};

export type ProviderReadinessAdapterResult = {
  status: ProviderReadinessStatus;
  configured: boolean;
  safeSummary: string;
  nextStep: string;
  liveMoneyAction: false;
};

export type ProviderReadinessAdapter = {
  checkConfiguration: () => ProviderReadinessAdapterResult | Promise<ProviderReadinessAdapterResult>;
  checkReadiness: () => ProviderReadinessAdapterResult | Promise<ProviderReadinessAdapterResult>;
  getSafeStatus: () => ProviderReadinessAdapterResult;
  verifyWebhookSignature?: (req: Request, rawBody: string) => Promise<{ ok: boolean; reason: string }>;
  handleWebhookEvent?: (event: unknown) => Promise<ProviderReadinessAdapterResult>;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature, x-chillywood-webhook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const encoder = new TextEncoder();

export const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), {
    headers: CORS_HEADERS,
    status,
  });

export const optionsResponse = () => new Response("ok", { headers: CORS_HEADERS, status: 200 });

export const toText = (value: unknown) => String(value ?? "").trim();

export const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown provider readiness error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk_(test|live)_[A-Za-z0-9_]+/gi, "sk_[redacted]")
    .replace(/rk_(test|live)_[A-Za-z0-9_]+/gi, "rk_[redacted]")
    .replace(/whsec_[A-Za-z0-9_]+/gi, "whsec_[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{64,}/g, "[redacted]")
    .slice(0, 280);
};

const timingSafeEqualText = (left: string, right: string) => {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
};

export const hashText = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const readOptionalEnv = (key: string) => toText(Deno.env.get(key)) || null;

export const createAdminClient = () => {
  const supabaseUrl = readOptionalEnv("SUPABASE_URL");
  const serviceRoleKey = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      configured: false as const,
      reason: "supabase_service_not_configured",
      message: "Server readiness checks are not configured.",
    };
  }

  return {
    configured: true as const,
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
  };
};

export const authenticateBearerUser = async (adminClient: SupabaseClientLike, authorization: string | null) => {
  const token = toText(authorization).replace(/^Bearer\s+/i, "");
  if (!token) {
    return { user: null, response: jsonResponse(401, { error: "auth_required", message: "Sign in to check readiness." }) };
  }

  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data.user?.id) {
    return { user: null, response: jsonResponse(401, { error: "auth_required", message: "Sign in again to check readiness." }) };
  }

  return { user: data.user, response: null };
};

export const verifySharedWebhookSecret = (req: Request, secret: string) => {
  const authorizationSecret = toText(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  const explicitSecret = toText(req.headers.get("x-chillywood-webhook-secret"));
  const providedSecret = authorizationSecret || explicitSecret;
  return !!providedSecret && timingSafeEqualText(providedSecret, secret);
};

export const missingProviderStatus = (provider: string, capability: string, safeSummary: string): SafeProviderStatus => ({
  provider,
  capability,
  status: "setup_needed",
  displayLabel: "Setup needed",
  displaySummary: safeSummary,
  nextStep: "Add server-side provider setup before review.",
  lastCheckedAt: null,
  isLiveMoneyEnabled: false,
  publicSafe: true,
});

export const toSafeProviderStatus = (row: Record<string, unknown>): SafeProviderStatus | null => {
  const provider = toText(row.provider);
  const capability = toText(row.capability);
  if (!provider || !capability) return null;
  return {
    provider,
    capability,
    status: (toText(row.status) || "setup_needed") as ProviderReadinessStatus,
    displayLabel: toText(row.display_label) || "Setup needed",
    displaySummary: toText(row.display_summary) || "Setup checks are not active yet.",
    nextStep: toText(row.next_step) || "Add provider setup before review.",
    lastCheckedAt: toText(row.last_checked_at) || null,
    isLiveMoneyEnabled: row.is_live_money_enabled === true,
    publicSafe: row.public_safe !== false,
  };
};

export const readProviderReadinessRows = async (adminClient: SupabaseClientLike) => {
  const { data, error } = await adminClient.rpc("get_provider_readiness_summary");
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map((row) => toSafeProviderStatus(row as Record<string, unknown>))
    .filter((row): row is SafeProviderStatus => !!row && row.publicSafe);
};

export const writeProviderReadinessAudit = async (
  adminClient: SupabaseClientLike,
  input: {
    actorUserId?: string | null;
    provider?: string | null;
    capability?: string | null;
    action: string;
    statusBefore?: string | null;
    statusAfter?: string | null;
    reason: string;
    proofSource?: string | null;
    metadata?: JsonObject;
  },
) => {
  await adminClient.from("provider_readiness_audit_log").insert({
    actor_user_id: input.actorUserId ?? null,
    provider: input.provider ?? null,
    capability: input.capability ?? null,
    action: input.action,
    status_before: input.statusBefore ?? null,
    status_after: input.statusAfter ?? null,
    reason: input.reason,
    proof_source: input.proofSource ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      secret_values_logged: false,
      live_money_action: false,
    },
  });
};

export class FailClosedProviderAdapter implements ProviderReadinessAdapter {
  private readonly configured: boolean;
  private readonly configuredSummary: string;
  private readonly missingSummary: string;

  constructor(options: {
    configured: boolean;
    configuredSummary: string;
    missingSummary: string;
  }) {
    this.configured = options.configured;
    this.configuredSummary = options.configuredSummary;
    this.missingSummary = options.missingSummary;
  }

  checkConfiguration() {
    return this.getSafeStatus();
  }

  checkReadiness() {
    return this.getSafeStatus();
  }

  getSafeStatus(): ProviderReadinessAdapterResult {
    return {
      status: this.configured ? "configured" : "setup_needed",
      configured: this.configured,
      safeSummary: this.configured ? this.configuredSummary : this.missingSummary,
      nextStep: this.configured
        ? "Run provider proof before enabling."
        : "Add server-side provider setup before review.",
      liveMoneyAction: false,
    };
  }
}

export class RevenueCatAdapter extends FailClosedProviderAdapter {}
export class GooglePlayAdapter extends FailClosedProviderAdapter {}
export class StripeAdapter extends FailClosedProviderAdapter {}
export class StripeConnectAdapter extends FailClosedProviderAdapter {}
