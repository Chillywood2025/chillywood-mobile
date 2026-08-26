import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import { normalizeApnsEnvironment } from "../_shared/ios-voip-policy.mjs";

type JsonObject = Record<string, unknown>;
type TokenAction = "register" | "rotate" | "status" | "revoke";
type RegistrationAction = Extract<TokenAction, "register" | "rotate">;
type SupabaseClientLike = any;

type TokenPayload = {
  accountId?: unknown;
  action?: unknown;
  apnsEnvironment?: unknown;
  appVersion?: unknown;
  buildVersion?: unknown;
  installId?: unknown;
  operationKey?: unknown;
  reason?: unknown;
  revocationCredential?: unknown;
  sessionGeneration?: unknown;
  token?: unknown;
  userId?: unknown;
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REVOCATION_REASONS = new Set([
  "account_deletion",
  "account_switch",
  "auth_invalidation",
  "auth_loss",
  "provider_invalid",
  "recovery_replacement",
  "sign_out",
  "user_request",
]);
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
const isValidOperationKey = (value: string) => value.length >= 8 && value.length <= 160;
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

const readAuthenticatedContext = async (req: Request) => {
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
  const userId = toText(data.user?.id);
  return error || !UUID_PATTERN.test(userId) ? null : { userClient, userId };
};

const enforceTokenRateLimit = async (
  adminClient: SupabaseClientLike,
  userId: string,
  action: RegistrationAction,
  installId: string,
) => {
  const scopes = [
    { action: "ios_voip_token_lifecycle", limit: 40, target: "account", windowSeconds: 3600 },
    { action: `ios_voip_token_${action}`, limit: 12, target: `install:${installId}`, windowSeconds: 600 },
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

const exactBinding = (body: TokenPayload) => {
  const accountId = toText(body.accountId);
  const operationKey = toText(body.operationKey);
  const revocationCredential = toText(body.revocationCredential).toLowerCase();
  const sessionGeneration = toText(body.sessionGeneration);
  const userId = toText(body.userId);
  return {
    accountId,
    operationKey,
    revocationCredential,
    sessionGeneration,
    userId,
    valid: UUID_PATTERN.test(userId)
      && accountId === userId
      && UUID_PATTERN.test(sessionGeneration)
      && isValidOperationKey(operationKey)
      && /^[0-9a-f]{64}$/u.test(revocationCredential),
  };
};

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const body = await parseBody(req);
    if (!body) return jsonResponse(400, { error: "invalid_json_body" });
    const action = normalizeAction(body.action);
    if (!action) return jsonResponse(400, { error: "invalid_action" });

    const installId = toText(body.installId);
    if (!isValidInstallId(installId)) return jsonResponse(400, { error: "invalid_install_id" });
    const apnsEnvironment = action === "revoke" && toText(body.apnsEnvironment).toLowerCase() === "all"
      ? "all"
      : normalizeApnsEnvironment(body.apnsEnvironment);
    const adminClient = createClient(
      readRequiredEnv("SUPABASE_URL"),
      readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    // A still-valid JWT is deliberately not required for revocation. The
    // request is bound to the exact old account/session/install and a 256-bit
    // device credential, so logout can persist and retry it after teardown.
    if (action === "revoke") {
      const binding = exactBinding(body);
      const reason = toText(body.reason).toLowerCase();
      if (!binding.valid || !REVOCATION_REASONS.has(reason)) {
        return jsonResponse(400, { requestAccepted: false, status: "invalid" });
      }
      const { data, error } = await adminClient.rpc("whole_app_revoke_ios_voip_push_ownership", {
        p_apns_environment: apnsEnvironment,
        p_expected_account_id: binding.accountId,
        p_expected_user_id: binding.userId,
        p_install_id: installId,
        p_operation_key: binding.operationKey,
        p_reason: reason,
        p_revocation_credential_hash: await sha256Hex(binding.revocationCredential),
        p_session_generation: binding.sessionGeneration,
      });
      const result = data && typeof data === "object" && !Array.isArray(data) ? data as JsonObject : {};
      const disposition = toText(result.disposition);
      const exactReceipt = !error
        && result.requestAccepted === true
        && result.status === "revoked"
        && ["revoked", "already_revoked", "already_detached"].includes(disposition)
        && toText(result.userId) === binding.userId
        && toText(result.accountId) === binding.accountId
        && toText(result.sessionGeneration) === binding.sessionGeneration
        && toText(result.installId) === installId
        && toText(result.platform) === "ios"
        && toText(result.provider) === "apns_voip"
        && toText(result.operationKey) === binding.operationKey;
      if (!exactReceipt) return jsonResponse(503, { error: "revocation_retry_required" });
      return jsonResponse(200, {
        accountId: result.accountId,
        disposition,
        installId: result.installId,
        operationKey: result.operationKey,
        platform: result.platform,
        provider: result.provider,
        requestAccepted: true,
        sessionGeneration: result.sessionGeneration,
        status: "revoked",
        userId: result.userId,
      });
    }

    const auth = await readAuthenticatedContext(req);
    if (!auth) return jsonResponse(401, { error: "unauthenticated" });
    const binding = exactBinding(body);
    if (!binding.valid || binding.userId !== auth.userId) {
      return jsonResponse(400, { error: "session_binding_invalid" });
    }

    if (action === "status") {
      const { data, error } = await auth.userClient.rpc("whole_app_ios_voip_push_readback", {
        p_apns_environment: apnsEnvironment,
        p_expected_account_id: binding.accountId,
        p_expected_user_id: binding.userId,
        p_install_id: installId,
        p_session_generation: binding.sessionGeneration,
      });
      const result = data && typeof data === "object" && !Array.isArray(data) ? data as JsonObject : {};
      const exactReceipt = !error
        && result.requestAccepted === true
        && toText(result.userId) === binding.userId
        && toText(result.accountId) === binding.accountId
        && toText(result.sessionGeneration) === binding.sessionGeneration
        && toText(result.installId) === installId
        && toText(result.platform) === "ios"
        && toText(result.provider) === "apns_voip";
      if (!exactReceipt) return jsonResponse(503, { error: "status_unavailable" });
      return jsonResponse(200, {
        accountId: result.accountId,
        installId: result.installId,
        lastSeenAt: result.lastSeenAt ?? null,
        platform: result.platform,
        provider: result.provider,
        registered: result.registered === true,
        requestAccepted: true,
        sessionGeneration: result.sessionGeneration,
        status: result.registered === true ? "registered" : "not_registered",
        tokenFingerprint: result.tokenFingerprint ?? null,
        userId: result.userId,
      });
    }

    if (!await enforceTokenRateLimit(adminClient, auth.userId, action, installId)) {
      return jsonResponse(429, { error: "rate_limited" });
    }
    const token = toText(body.token).toLowerCase();
    if (!isValidVoipToken(token)) return jsonResponse(400, { error: "invalid_voip_token" });

    const { data, error } = await auth.userClient.rpc("whole_app_register_ios_voip_push_token", {
      p_apns_environment: apnsEnvironment,
      p_app_version: toText(body.appVersion) || null,
      p_build_version: toText(body.buildVersion) || null,
      p_expected_account_id: binding.accountId,
      p_expected_user_id: binding.userId,
      p_install_id: installId,
      p_operation_key: binding.operationKey,
      p_revocation_credential_hash: await sha256Hex(binding.revocationCredential),
      p_session_generation: binding.sessionGeneration,
      p_token: token,
    });
    const result = data && typeof data === "object" && !Array.isArray(data) ? data as JsonObject : {};
    const exactReceipt = !error
      && result.requestAccepted === true
      && result.status === "registered"
      && result.ownershipState === "ACCOUNT_BOUND"
      && toText(result.userId) === binding.userId
      && toText(result.accountId) === binding.accountId
      && toText(result.sessionGeneration) === binding.sessionGeneration
      && toText(result.installId) === installId
      && toText(result.platform) === "ios"
      && toText(result.provider) === "apns_voip"
      && toText(result.apnsEnvironment) === apnsEnvironment
      && toText(result.operationKey) === binding.operationKey
      && /^[0-9a-f]{12}$/u.test(toText(result.tokenFingerprint));
    if (!exactReceipt) return jsonResponse(409, { error: "registration_rejected" });

    return jsonResponse(200, {
      accountId: result.accountId,
      apnsEnvironment: result.apnsEnvironment,
      installId: result.installId,
      operationKey: result.operationKey,
      ownershipState: result.ownershipState,
      platform: result.platform,
      provider: result.provider,
      requestAccepted: true,
      sessionGeneration: result.sessionGeneration,
      status: "registered",
      tokenFingerprint: result.tokenFingerprint,
      userId: result.userId,
    });
  } catch {
    return jsonResponse(500, { error: "ios_voip_token_lifecycle_error" });
  }
});
