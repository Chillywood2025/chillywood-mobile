import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  readExactCurrentSessionAuthority,
  readExactPlatformRole,
} from "../_shared/exact-subject-authority.ts";

type SupabaseClient = ReturnType<typeof createClient>;

const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const toText = (value: unknown) => String(value ?? "").trim();

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown revenue source import error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{24,}/g, "[redacted]")
    .slice(0, 240);
};

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const authenticateRequest = async (req: Request, supabaseUrl: string, supabaseAnonKey: string) => {
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
  if (error || !userId || !(await readExactCurrentSessionAuthority(authClient, userId))) {
    return { error: json(401, { error: "invalid_session", message: "Supabase could not verify the current user session." }) };
  }

  return {
    user: {
      id: userId,
      email: toText(data.user?.email).toLowerCase(),
    },
  };
};

const userHasPlatformRole = async (
  adminClient: SupabaseClient,
  user: { id: string; email: string },
  roles: string[],
) => {
  return !!(await readExactPlatformRole(adminClient, user.id, roles));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST for revenue source import foundation requests." });
  }

  try {
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const hasOperatorRole = await userHasPlatformRole(adminClient, authResult.user, ["owner", "operator"]);
    if (!hasOperatorRole) {
      return json(403, {
        error: "not_authorized",
        liveMoneyAction: false,
        message: "Active owner or operator role required for revenue source import foundation requests.",
      });
    }

    return json(200, {
      status: "not_configured",
      provider: "none",
      mode: "foundation",
      liveMoneyAction: false,
      sourceMoneyImported: false,
      creatorEarningsCreated: false,
      payableBalanceCreated: false,
      payoutLedgerWritten: false,
      providerCall: false,
      providerSecretRead: false,
      message: "Revenue source imports are not connected yet. This skeleton performs no provider imports and creates no creator earnings.",
    });
  } catch (error) {
    return json(500, {
      error: "revenue_source_import_unavailable",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
    });
  }
});
