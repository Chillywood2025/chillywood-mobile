import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";

type JsonObject = Record<string, unknown>;

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

type AuthenticatedUserResult =
  | { error: Response; user?: never }
  | { error?: never; user: AuthenticatedUser };

type TokenPayload = {
  accountId?: unknown;
  action?: unknown;
  appVersion?: unknown;
  buildVersion?: unknown;
  deviceId?: unknown;
  installId?: unknown;
  metadata?: unknown;
  operationKey?: unknown;
  permissionStatus?: unknown;
  platform?: unknown;
  provider?: unknown;
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

const textEncoder = new TextEncoder();

const toText = (value: unknown) => String(value ?? "").trim();

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const optionsResponse = () => new Response("ok", { headers: CORS_HEADERS, status: 200 });

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown notification token error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/Expo(nent)?PushToken\[[^\]]+\]/gi, "ExpoPushToken[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/g, "[redacted]")
    .slice(0, 240);
};

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const parseJsonPayload = async (req: Request): Promise<{ value?: TokenPayload; error?: Response }> => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return { value: {} };

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: jsonResponse(400, { error: "invalid_body" }) };
    }
    return { value: parsed as TokenPayload };
  } catch {
    return { error: jsonResponse(400, { error: "invalid_json" }) };
  }
};

const normalizeAction = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "register" || normalized === "revoke" || normalized === "status") return normalized;
  return null;
};

const normalizePlatform = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  return normalized === "ios" || normalized === "android" ? normalized : null;
};

const normalizeProvider = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  return normalized === "fcm" || normalized === "expo" ? normalized : null;
};

const isValidToken = (provider: string, token: string) => {
  if (!token || token.length > 2048) return false;
  if (provider === "expo") {
    return /^Expo(nent)?PushToken\[[^\]]+\]$/u.test(token);
  }
  return token.length >= 32;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REVOCATION_REASONS = new Set([
  "sign_out",
  "account_switch",
  "auth_invalidation",
  "account_deletion",
  "recovery_replacement",
  "auth_loss",
  "user_request",
]);

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const safeMetadata = (value: unknown, permissionStatus: string) => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
  const metadata: JsonObject = typeof source.nativeCallStyle === "boolean"
    ? { nativeCallStyle: source.nativeCallStyle }
    : {};
  metadata.permissionStatus = permissionStatus;
  return metadata;
};

async function readAuthenticatedUser(req: Request): Promise<AuthenticatedUserResult> {
  const supabaseUrl = readRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { error: jsonResponse(401, { error: "missing_authorization" }) };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId) {
    return { error: jsonResponse(401, { error: "unauthenticated" }) };
  }

  return {
    user: {
      email: data.user?.email ?? null,
      id: userId,
    } satisfies AuthenticatedUser,
  };
}

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const payload = await parseJsonPayload(req);
    if (payload.error) return payload.error;
    const body = payload.value ?? {};
    const action = normalizeAction(body.action);
    if (!action) return jsonResponse(400, { error: "invalid_action" });
    const provider = normalizeProvider(body.provider);
    const platform = normalizePlatform(body.platform);
    const installId = toText(body.installId) || null;

    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (action === "revoke") {
      const accountId = toText(body.accountId);
      const operationKey = toText(body.operationKey);
      const reason = toText(body.reason).toLowerCase();
      const revocationCredential = toText(body.revocationCredential);
      const sessionGeneration = toText(body.sessionGeneration);
      const userId = toText(body.userId);
      if (!platform || !installId || !UUID_PATTERN.test(userId) || accountId !== userId || !sessionGeneration
        || !operationKey || operationKey.length > 160 || !REVOCATION_REASONS.has(reason)
        || !/^[0-9a-f]{64}$/u.test(revocationCredential)) {
        return jsonResponse(400, { requestAccepted: false, status: "invalid" });
      }
      const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      const { data: revoked, error } = await adminClient.rpc("wave1_revoke_push_ownership", {
        p_expected_account_id: accountId,
        p_expected_user_id: userId,
        p_install_id: installId,
        p_operation_key: operationKey,
        p_platform: platform,
        p_reason: reason,
        p_revocation_credential_hash: await sha256Hex(revocationCredential),
        p_session_generation: sessionGeneration,
      });
      const result = revoked && typeof revoked === "object" && !Array.isArray(revoked) ? revoked as JsonObject : {};
      const disposition = toText(result.disposition);
      const exactReceipt = result.requestAccepted === true && result.status === "revoked"
        && ["revoked", "already_revoked", "already_detached"].includes(disposition)
        && result.userId === userId && result.accountId === accountId
        && result.sessionGeneration === sessionGeneration && result.installId === installId
        && result.platform === platform && result.operationKey === operationKey;
      if (error || !exactReceipt) return jsonResponse(503, { error: "revocation_retry_required" });
      return jsonResponse(200, {
        accountId: result.accountId, disposition, installId: result.installId,
        operationKey: result.operationKey, platform: result.platform, requestAccepted: true,
        sessionGeneration: result.sessionGeneration, status: "revoked", userId: result.userId,
      });
    }

    if (!platform || !provider) return jsonResponse(400, { error: "invalid_push_transport" });
    if (platform === "ios" && provider !== "expo") {
      return jsonResponse(400, { error: "invalid_provider_for_platform" });
    }

    const auth = await readAuthenticatedUser(req);
    if (auth.error) return auth.error;
    const authHeader = req.headers.get("authorization") ?? "";
    const userClient = createClient(supabaseUrl, readRequiredEnv("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    if (action === "status") {
      if (!installId) return jsonResponse(400, { error: "missing_install_id" });
      const { data: status, error } = await userClient.rpc("wave1_push_ownership_readback", {
        p_install_id: installId,
        p_platform: platform,
        p_provider: provider,
      });
      if (error) return jsonResponse(500, { error: "status_failed", message: sanitizeErrorMessage(error) });
      const result = status && typeof status === "object" && !Array.isArray(status) ? status as JsonObject : {};
      return jsonResponse(200, {
        lastSeenAt: result.lastSeenAt ?? null,
        platform,
        provider,
        registered: result.registered === true,
        status: result.registered === true ? "registered" : "not_registered",
        tokenFingerprint: result.tokenFingerprint ?? null,
      });
    }

    const rawToken = toText(body.token);
    const permissionStatus = toText(body.permissionStatus) || "unknown";
    if (!isValidToken(provider, rawToken)) {
      return jsonResponse(400, { error: "invalid_token" });
    }
    const accountId = toText(body.accountId);
    const operationKey = toText(body.operationKey);
    const revocationCredential = toText(body.revocationCredential);
    const sessionGeneration = toText(body.sessionGeneration);
    const userId = toText(body.userId);
    if (!installId || userId !== auth.user.id || accountId !== userId || !sessionGeneration
      || !operationKey || operationKey.length > 160 || !/^[0-9a-f]{64}$/u.test(revocationCredential)) {
      return jsonResponse(400, { error: "session_binding_invalid" });
    }
    const { data: registered, error: registerError } = await userClient.rpc("wave1_register_push_token", {
      p_app_version: toText(body.appVersion) || null,
      p_build_version: toText(body.buildVersion) || null,
      p_expected_account_id: accountId,
      p_expected_user_id: userId,
      p_install_id: installId,
      p_metadata: safeMetadata(body.metadata, permissionStatus),
      p_operation_key: operationKey,
      p_permission_status: permissionStatus,
      p_platform: platform,
      p_provider: provider,
      p_revocation_credential_hash: await sha256Hex(revocationCredential),
      p_session_generation: sessionGeneration,
      p_token: rawToken,
    });
    if (registerError || !registered || typeof registered !== "object") {
      return jsonResponse(500, { error: "register_failed", message: sanitizeErrorMessage(registerError) });
    }
    const result = registered as JsonObject;
    const tokenFingerprint = toText(result.tokenFingerprint);
    if (result.status !== "registered" || result.ownershipState !== "ACCOUNT_BOUND"
      || result.sessionGeneration !== sessionGeneration || !/^[0-9a-f]{12}$/u.test(tokenFingerprint)) {
      return jsonResponse(503, { error: "register_confirmation_failed" });
    }
    return jsonResponse(200, {
      accountId, installId, operationKey, platform, provider, requestAccepted: true,
      sessionGeneration, status: "registered", tokenFingerprint, userId,
    });
  } catch (error) {
    return jsonResponse(500, { error: "notification_token_error", message: sanitizeErrorMessage(error) });
  }
});
