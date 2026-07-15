import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeApnsEnvironment } from "../_shared/ios-voip-policy.mjs";

type JsonObject = Record<string, unknown>;
type TokenAction = "register" | "rotate" | "status" | "revoke";
type SupabaseClientLike = any;

type TokenPayload = {
  action?: unknown;
  apnsEnvironment?: unknown;
  appVersion?: unknown;
  buildVersion?: unknown;
  installId?: unknown;
  token?: unknown;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const encoder = new TextEncoder();
const toText = (value: unknown) => String(value ?? "").trim();
const jsonResponse = (status: number, body: JsonObject) => (
  new Response(JSON.stringify(body), { headers: JSON_HEADERS, status })
);
const optionsResponse = () => new Response("ok", { headers: CORS_HEADERS, status: 200 });

const readRequiredEnv = (name: string) => {
  const value = toText(Deno.env.get(name));
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};

const normalizeAction = (value: unknown): TokenAction | null => {
  const action = toText(value).toLowerCase();
  if (action === "register" || action === "rotate" || action === "status" || action === "revoke") return action;
  return null;
};

const isValidInstallId = (value: string) => value.length >= 8 && value.length <= 200;
const isValidVoipToken = (value: string) => /^[0-9a-f]{64,200}$/u.test(value);

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const parseBody = async (req: Request): Promise<TokenPayload | null> => {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as TokenPayload : null;
  } catch {
    return null;
  }
};

const readAuthenticatedUserId = async (req: Request) => {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;

  const userClient = createClient(
    readRequiredEnv("SUPABASE_URL"),
    readRequiredEnv("SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authorization } },
    },
  );
  const { data, error } = await userClient.auth.getUser();
  return error ? null : toText(data.user?.id) || null;
};

const enforceTokenRateLimit = async (
  adminClient: SupabaseClientLike,
  userId: string,
  action: TokenAction,
  installId: string,
) => {
  const scopes = [
    {
      action: "ios_voip_token_lifecycle",
      limit: 40,
      target: "account",
      windowSeconds: 3600,
    },
    {
      action: `ios_voip_token_${action}`,
      limit: action === "status" ? 60 : 12,
      target: `install:${installId}`,
      windowSeconds: action === "status" ? 600 : 600,
    },
  ];

  for (const scope of scopes) {
    const { error } = await adminClient.rpc("enforce_abuse_rate_limit", {
      p_action_key: scope.action,
      p_actor_user_id: userId,
      p_limit: scope.limit,
      p_metadata: { source: "ios-voip-push-tokens" },
      p_target_key: scope.target,
      p_window_seconds: scope.windowSeconds,
    });
    if (error) {
      if (toText(error.message).toLowerCase().includes("rate_limited")) return false;
      throw new Error("voip_token_rate_limit_failed");
    }
  }
  return true;
};

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const userId = await readAuthenticatedUserId(req);
    if (!userId) return jsonResponse(401, { error: "unauthenticated" });

    const body = await parseBody(req);
    if (!body) return jsonResponse(400, { error: "invalid_json_body" });

    const action = normalizeAction(body.action);
    if (!action) return jsonResponse(400, { error: "invalid_action" });

    const installId = toText(body.installId);
    if (!isValidInstallId(installId)) return jsonResponse(400, { error: "invalid_install_id" });

    const apnsEnvironment = normalizeApnsEnvironment(body.apnsEnvironment);
    const adminClient = createClient(
      readRequiredEnv("SUPABASE_URL"),
      readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const { data: accessRestricted, error: accessError } = await adminClient.rpc(
      "is_account_access_restricted",
      { p_user_id: userId },
    );
    if (accessError) return jsonResponse(503, { error: "account_status_unavailable" });
    if (accessRestricted === true) return jsonResponse(403, { error: "account_access_restricted" });

    if (!await enforceTokenRateLimit(adminClient, userId, action, installId)) {
      return jsonResponse(429, { error: "rate_limited" });
    }

    if (action === "status") {
      const { data, error } = await adminClient
        .from("user_voip_push_tokens")
        .select("token_fingerprint,apns_environment,enabled,last_seen_at,revoked_at")
        .eq("user_id", userId)
        .eq("install_id", installId)
        .eq("apns_environment", apnsEnvironment)
        .eq("enabled", true)
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return jsonResponse(500, { error: "status_failed" });

      return jsonResponse(200, {
        apnsEnvironment,
        lastSeenAt: data?.last_seen_at ?? null,
        registered: !!data,
        status: data ? "registered" : "not_registered",
        tokenFingerprint: data?.token_fingerprint ?? null,
      });
    }

    const now = new Date().toISOString();
    if (action === "revoke") {
      const { data, error } = await adminClient
        .from("user_voip_push_tokens")
        .update({ enabled: false, revoked_at: now, updated_at: now })
        .eq("user_id", userId)
        .eq("install_id", installId)
        .eq("apns_environment", apnsEnvironment)
        .eq("enabled", true)
        .is("revoked_at", null)
        .select("id");
      if (error) return jsonResponse(500, { error: "revoke_failed" });
      return jsonResponse(200, { revokedCount: data?.length ?? 0, status: "revoked" });
    }

    const token = toText(body.token).toLowerCase();
    if (!isValidVoipToken(token)) return jsonResponse(400, { error: "invalid_voip_token" });

    const tokenHash = await sha256Hex(`apns_voip:${apnsEnvironment}:${token}`);
    const tokenFingerprint = tokenHash.slice(0, 12);
    const { data: registered, error: registerError } = await adminClient
      .from("user_voip_push_tokens")
      .upsert({
        apns_environment: apnsEnvironment,
        app_version: toText(body.appVersion) || null,
        build_version: toText(body.buildVersion) || null,
        enabled: true,
        install_id: installId,
        last_seen_at: now,
        revoked_at: null,
        token,
        token_fingerprint: tokenFingerprint,
        token_hash: tokenHash,
        updated_at: now,
        user_id: userId,
      }, { onConflict: "apns_environment,token_hash" })
      .select("id,token_fingerprint,last_seen_at")
      .maybeSingle();
    if (registerError || !registered) return jsonResponse(500, { error: "register_failed" });

    const { error: staleTokenError } = await adminClient
      .from("user_voip_push_tokens")
      .update({ enabled: false, revoked_at: now, updated_at: now })
      .eq("user_id", userId)
      .eq("install_id", installId)
      .eq("apns_environment", apnsEnvironment)
      .eq("enabled", true)
      .is("revoked_at", null)
      .neq("token_hash", tokenHash);
    if (staleTokenError) return jsonResponse(500, { error: "rotation_cleanup_failed" });

    return jsonResponse(200, {
      apnsEnvironment,
      lastSeenAt: registered.last_seen_at,
      status: action === "rotate" ? "rotated" : "registered",
      tokenFingerprint: registered.token_fingerprint,
    });
  } catch {
    return jsonResponse(500, { error: "ios_voip_token_lifecycle_error" });
  }
});
