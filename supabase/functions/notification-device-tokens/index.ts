import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

type AuthenticatedUserResult =
  | { error: Response; user?: never }
  | { error?: never; user: AuthenticatedUser };

type TokenPayload = {
  action?: unknown;
  appVersion?: unknown;
  buildVersion?: unknown;
  deviceId?: unknown;
  installId?: unknown;
  metadata?: unknown;
  permissionStatus?: unknown;
  platform?: unknown;
  provider?: unknown;
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
  if (normalized === "revoke" || normalized === "status") return normalized;
  return "register";
};

const normalizePlatform = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "ios") return "ios";
  return "android";
};

const normalizeProvider = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "fcm") return "fcm";
  return "expo";
};

const isValidToken = (provider: string, token: string) => {
  if (!token || token.length > 2048) return false;
  if (provider === "expo") {
    return /^Expo(nent)?PushToken\[[^\]]+\]$/u.test(token);
  }
  return token.length >= 32;
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const safeMetadata = (value: unknown, permissionStatus: string) => {
  const metadata: JsonObject = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    Object.entries(value as JsonObject).forEach(([key, entry]) => {
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        metadata[key] = entry;
      }
    });
  }
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
    const auth = await readAuthenticatedUser(req);
    if (auth.error) return auth.error;

    const payload = await parseJsonPayload(req);
    if (payload.error) return payload.error;
    const body = payload.value ?? {};
    const action = normalizeAction(body.action);
    const provider = normalizeProvider(body.provider);
    const platform = normalizePlatform(body.platform);
    const installId = toText(body.installId) || null;

    if (platform === "ios" && provider !== "expo") {
      return jsonResponse(400, { error: "invalid_provider_for_platform" });
    }

    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    if (action === "status") {
      if (!installId) return jsonResponse(400, { error: "missing_install_id" });

      const { data: token, error } = await adminClient
        .from("user_push_tokens")
        .select("id,platform,provider,token_fingerprint,enabled,last_seen_at,revoked_at")
        .eq("user_id", auth.user.id)
        .eq("platform", platform)
        .eq("provider", provider)
        .eq("install_id", installId)
        .eq("enabled", true)
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return jsonResponse(500, { error: "status_failed", message: sanitizeErrorMessage(error) });

      return jsonResponse(200, {
        lastSeenAt: token?.last_seen_at ?? null,
        platform,
        provider,
        registered: !!token,
        status: token ? "registered" : "not_registered",
        tokenFingerprint: token?.token_fingerprint ?? null,
      });
    }

    const rawToken = toText(body.token);
    const permissionStatus = toText(body.permissionStatus) || "unknown";

    if (action === "revoke") {
      let query = adminClient
        .from("user_push_tokens")
        .update({
          enabled: false,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", auth.user.id)
        .eq("platform", platform)
        .eq("provider", provider);

      if (installId) {
        query = query.eq("install_id", installId);
      } else if (rawToken) {
        query = query.eq("token_hash", await sha256Hex(`${provider}:${rawToken}`));
      } else {
        return jsonResponse(400, { error: "missing_revoke_target" });
      }

      const { error } = await query;
      if (error) return jsonResponse(500, { error: "revoke_failed", message: sanitizeErrorMessage(error) });

      return jsonResponse(200, { status: "revoked" });
    }

    if (!isValidToken(provider, rawToken)) {
      return jsonResponse(400, { error: "invalid_token" });
    }

    const tokenHash = await sha256Hex(`${provider}:${rawToken}`);
    const tokenFingerprint = tokenHash.slice(0, 12);
    const now = new Date().toISOString();

    const { data: upserted, error: upsertError } = await adminClient
      .from("user_push_tokens")
      .upsert({
        app_version: toText(body.appVersion) || null,
        build_version: toText(body.buildVersion) || null,
        device_id: toText(body.deviceId) || null,
        enabled: true,
        install_id: installId,
        last_seen_at: now,
        metadata: safeMetadata(body.metadata, permissionStatus),
        platform,
        provider,
        revoked_at: null,
        token: rawToken,
        token_fingerprint: tokenFingerprint,
        token_hash: tokenHash,
        updated_at: now,
        user_id: auth.user.id,
      }, { onConflict: "provider,token_hash" })
      .select("id,token_fingerprint")
      .maybeSingle();

    if (upsertError || !upserted) {
      return jsonResponse(500, { error: "register_failed", message: sanitizeErrorMessage(upsertError) });
    }

    if (installId) {
      await adminClient
        .from("user_push_tokens")
        .update({
          enabled: false,
          revoked_at: now,
          updated_at: now,
        })
        .eq("user_id", auth.user.id)
        .eq("platform", platform)
        .eq("provider", provider)
        .eq("install_id", installId)
        .neq("token_hash", tokenHash);
    }

    await adminClient
      .from("notification_preferences")
      .upsert({ user_id: auth.user.id }, { onConflict: "user_id" });

    return jsonResponse(200, {
      provider,
      status: "registered",
      tokenFingerprint: upserted.token_fingerprint,
    });
  } catch (error) {
    return jsonResponse(500, { error: "notification_token_error", message: sanitizeErrorMessage(error) });
  }
});
