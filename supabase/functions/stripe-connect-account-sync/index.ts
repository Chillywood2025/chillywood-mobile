import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type StripeConnectSyncSkeletonPayload = {
  creator_user_id?: unknown;
  creatorUserId?: unknown;
  provider_account_id?: unknown;
  providerAccountId?: unknown;
};

type AuthResult = { user: { id: string } } | { error: Response };
type ParsePayloadResult = { value: StripeConnectSyncSkeletonPayload } | { error: Response };

const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const PROVIDER = "stripe_connect";
const MODE = "test";

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const toText = (value: unknown) => String(value ?? "").trim();

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown Stripe Connect skeleton error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{24,}/g, "[redacted]")
    .slice(0, 240);
};

const parseJsonPayload = async (req: Request): Promise<ParsePayloadResult> => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return { value: {} as StripeConnectSyncSkeletonPayload };

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: json(400, { error: "invalid_body", message: "Request body must be a JSON object." }) };
    }

    return { value: parsed as StripeConnectSyncSkeletonPayload };
  } catch {
    return { error: json(400, { error: "invalid_json", message: "Request body must be valid JSON." }) };
  }
};

const authenticateRequest = async (req: Request, supabaseUrl: string, supabaseAnonKey: string): Promise<AuthResult> => {
  const authorization = toText(req.headers.get("Authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: json(401, { error: "missing_authorization", message: "Bearer authorization is required." }) };
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
    return { error: json(401, { error: "invalid_session", message: "Supabase could not verify the current user session." }) };
  }

  return { user: { id: userId } };
};

const requestedCreatorUserId = (payload: StripeConnectSyncSkeletonPayload) =>
  toText(payload.creator_user_id ?? payload.creatorUserId);

const hasClientProviderAccountId = (payload: StripeConnectSyncSkeletonPayload) =>
  !!toText(payload.provider_account_id ?? payload.providerAccountId);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST for Stripe Connect account-sync skeleton requests." });
  }

  try {
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;

    const parsed = await parseJsonPayload(req);
    if ("error" in parsed) return parsed.error;

    if (hasClientProviderAccountId(parsed.value)) {
      return json(400, {
        error: "provider_account_id_not_allowed",
        message: "Provider account ids are backend-owned and are not accepted from the client.",
      });
    }

    const requestedCreatorId = requestedCreatorUserId(parsed.value);
    if (requestedCreatorId && requestedCreatorId !== authResult.user.id) {
      return json(403, {
        error: "creator_mismatch",
        message: "Creator payout setup can only be requested for the current authenticated creator.",
      });
    }

    return json(200, {
      status: "not_configured",
      provider: PROVIDER,
      mode: MODE,
      liveMoneyAction: false,
      creatorUserId: authResult.user.id,
      providerCall: false,
      providerWrite: false,
      accountSynced: false,
      audit: {
        written: false,
        requiredLater: true,
      },
      message: "Stripe Connect account sync is skeleton-only in this foundation pass. No provider status was synced.",
    });
  } catch (error) {
    return json(500, {
      error: "stripe_connect_account_sync_skeleton_failed",
      message: sanitizeErrorMessage(error),
    });
  }
});
