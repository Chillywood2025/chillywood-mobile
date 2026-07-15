import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  IOS_NOTIFICATION_CATEGORIES,
  buildPlatformExpoPushMessage,
} from "../_shared/notification-payload.mjs";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

type DispatchAction = "incoming" | "missed";

type DispatchPayload = {
  action?: unknown;
  inviteId?: unknown;
  invite_id?: unknown;
};

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

type AuthResult =
  | { error: Response; user?: never }
  | { error?: never; user: AuthenticatedUser };

type CallInvite = {
  id: string;
  thread_id: string;
  communication_room_id: string | null;
  caller_user_id: string;
  callee_user_id: string;
  call_type: string;
  status: string;
  created_at: string;
  expires_at: string;
};

type ChatMember = {
  user_id: string;
  display_name: string | null;
};

type NotificationPreference = {
  chilly_chat_calls_enabled: boolean | null;
  in_app_enabled: boolean | null;
  push_enabled: boolean | null;
  user_id: string;
};

type PushToken = {
  id: string;
  platform: "android" | "ios";
  provider: string;
  token: string;
  token_fingerprint: string;
};

type DeliveryAttempt = {
  id: string;
  provider_message_id: string | null;
  push_token_id: string | null;
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

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHAT_CALL_CHANNEL_ID = "chilly_chat_calls_fullscreen_v1";
const MISSED_CALL_CHANNEL_ID = "chilly_chat_missed_calls";
const VALID_CALL_TYPES = new Set(["voice", "video"]);
const TERMINAL_STATUSES = new Set(["accepted", "declined", "missed", "canceled", "ended", "busy"]);

let cachedFcmAccessToken: { expiresAt: number; token: string } | null = null;

const toText = (value: unknown) => String(value ?? "").trim();
const isIosOrdinaryPushRolloutEnabled = () => (
  toText(Deno.env.get("IOS_ORDINARY_PUSH_ROLLOUT_ENABLED")).toLowerCase() === "true"
);

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const optionsResponse = () => new Response("ok", { headers: CORS_HEADERS, status: 200 });

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown Chi'lly Chat call dispatch error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/Expo(nent)?PushToken\[[^\]]+\]/gi, "ExpoPushToken[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/g, "[redacted]")
    .slice(0, 260);
};

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const readOptionalEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = toText(Deno.env.get(key));
    if (value) return value;
  }
  return "";
};

const normalizeAction = (value: unknown): DispatchAction | null => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "incoming" || normalized === "dispatch_incoming") return "incoming";
  if (normalized === "missed" || normalized === "dispatch_missed") return "missed";
  return null;
};

const normalizeCallType = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  return VALID_CALL_TYPES.has(normalized) ? normalized : "video";
};

const parseJsonPayload = async (req: Request): Promise<{ value?: DispatchPayload; error?: Response }> => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return { value: {} };

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: jsonResponse(400, { error: "invalid_body" }) };
    }
    return { value: parsed as DispatchPayload };
  } catch {
    return { error: jsonResponse(400, { error: "invalid_json" }) };
  }
};

async function readAuthenticatedUser(req: Request): Promise<AuthResult> {
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
  if (error || !userId) return { error: jsonResponse(401, { error: "unauthenticated" }) };

  return {
    user: {
      email: data.user?.email ?? null,
      id: userId,
    } satisfies AuthenticatedUser,
  };
}

async function readInvite(adminClient: SupabaseClientLike, inviteId: string) {
  const { data, error } = await adminClient
    .from("chat_call_invites")
    .select("id,thread_id,communication_room_id,caller_user_id,callee_user_id,call_type,status,created_at,expires_at")
    .eq("id", inviteId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CallInvite;
}

async function markInviteMissed(adminClient: SupabaseClientLike, invite: CallInvite, actorUserId: string) {
  const now = new Date().toISOString();
  const { data, error } = await adminClient
    .from("chat_call_invites")
    .update({ status: "missed" })
    .eq("id", invite.id)
    .eq("status", "ringing")
    .select("id,thread_id,communication_room_id,caller_user_id,callee_user_id,call_type,status,created_at,expires_at")
    .maybeSingle();

  if (error || !data) return null;
  await adminClient.from("chat_call_events").insert({
    actor_user_id: actorUserId,
    call_invite_id: invite.id,
    call_type: normalizeCallType(invite.call_type),
    event_type: "missed",
    thread_id: invite.thread_id,
    created_at: now,
  });
  return data as CallInvite;
}

async function readThreadMembers(adminClient: SupabaseClientLike, threadId: string) {
  const { data } = await adminClient
    .from("chat_thread_members")
    .select("user_id,display_name")
    .eq("thread_id", threadId);

  return (data ?? []) as ChatMember[];
}

async function hasAudienceBlock(adminClient: SupabaseClientLike, callerUserId: string, calleeUserId: string) {
  const { data: callerBlockedCallee } = await adminClient
    .from("channel_audience_blocks")
    .select("channel_user_id")
    .eq("channel_user_id", callerUserId)
    .eq("blocked_user_id", calleeUserId)
    .limit(1);

  if (callerBlockedCallee?.length) return true;

  const { data: calleeBlockedCaller } = await adminClient
    .from("channel_audience_blocks")
    .select("channel_user_id")
    .eq("channel_user_id", calleeUserId)
    .eq("blocked_user_id", callerUserId)
    .limit(1);

  return !!calleeBlockedCaller?.length;
}

async function isAccountAccessRestricted(adminClient: SupabaseClientLike, userId: string) {
  const { data, error } = await adminClient.rpc("is_account_access_restricted", {
    p_user_id: userId,
  });
  if (error) throw new Error(`Account status check failed: ${error.message}`);
  return data === true;
}

async function readPreferences(adminClient: SupabaseClientLike, userId: string) {
  const { data } = await adminClient
    .from("notification_preferences")
    .select("user_id,push_enabled,in_app_enabled,chilly_chat_calls_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  return data as NotificationPreference | null;
}

async function readPushTokens(adminClient: SupabaseClientLike, userId: string) {
  const readPlatformTokens = async (platform: PushToken["platform"]) => {
    const { data } = await adminClient
      .from("user_push_tokens")
      .select("id,platform,provider,token,token_fingerprint")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("enabled", true)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(5);
    return (data ?? []) as PushToken[];
  };

  const [androidTokens, iosTokens] = await Promise.all([
    readPlatformTokens("android"),
    readPlatformTokens("ios"),
  ]);
  return [...androidTokens, ...iosTokens];
}

async function revokePushToken(adminClient: SupabaseClientLike, tokenId: string) {
  await adminClient
    .from("user_push_tokens")
    .update({
      enabled: false,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenId);
}

async function reconcileRecentExpoReceipts(adminClient: SupabaseClientLike, userId: string) {
  const { data } = await adminClient
    .from("notification_delivery_attempts")
    .select("id,provider_message_id,push_token_id")
    .eq("recipient_user_id", userId)
    .eq("provider", "expo")
    .eq("status", "sent")
    .not("provider_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const attempts = ((data ?? []) as DeliveryAttempt[]).filter((attempt) => toText(attempt.provider_message_id));
  if (!attempts.length) return;

  const response = await fetch(EXPO_RECEIPTS_URL, {
    body: JSON.stringify({ ids: attempts.map((attempt) => attempt.provider_message_id) }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) return;

  const payload = await response.json().catch(() => ({}));
  const receipts = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data?: Record<string, JsonObject> }).data ?? {}
    : {};

  for (const attempt of attempts) {
    const providerMessageId = toText(attempt.provider_message_id);
    const receipt = receipts[providerMessageId];
    const receiptStatus = toText(receipt?.status).toLowerCase();
    if (receiptStatus !== "error") continue;

    const details = receipt?.details && typeof receipt.details === "object" ? receipt.details as JsonObject : {};
    const errorCode = toText(details.error) || "expo_receipt_error";
    await adminClient
      .from("notification_delivery_attempts")
      .update({
        error_code: errorCode,
        error_message: sanitizeErrorMessage(receipt?.message ?? errorCode),
        status: "failed",
      })
      .eq("id", attempt.id);

    if (errorCode === "DeviceNotRegistered" && attempt.push_token_id) {
      await revokePushToken(adminClient, attempt.push_token_id);
    }
  }
}

async function insertDeliveryAttempt(adminClient: SupabaseClientLike, input: {
  errorCode?: string | null;
  errorMessage?: string | null;
  notificationId: string | null;
  provider: string;
  providerMessageId?: string | null;
  pushTokenId?: string | null;
  recipientUserId: string;
  status: "attempted" | "sent" | "failed" | "skipped";
}) {
  await adminClient.from("notification_delivery_attempts").insert({
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ? sanitizeErrorMessage(input.errorMessage) : null,
    notification_id: input.notificationId,
    provider: input.provider,
    provider_message_id: input.providerMessageId ?? null,
    push_token_id: input.pushTokenId ?? null,
    recipient_user_id: input.recipientUserId,
    status: input.status,
  });
}

async function sendExpoPush(message: JsonObject) {
  const response = await fetch(EXPO_PUSH_URL, {
    body: JSON.stringify(message),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await response.json().catch(() => ({}));
  return { body, ok: response.ok, status: response.status };
}

type FcmServiceAccount = {
  clientEmail: string;
  privateKey: string;
  projectId: string;
};

const base64UrlEncode = (input: string | Uint8Array) => {
  const binary = typeof input === "string"
    ? input
    : Array.from(input, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const parseFcmServiceAccount = (): FcmServiceAccount | null => {
  const rawJson = readOptionalEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "FCM_SERVICE_ACCOUNT_JSON", "GOOGLE_SERVICE_ACCOUNT_JSON");
  const rawJsonBase64 = readOptionalEnv(
    "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64",
    "FCM_SERVICE_ACCOUNT_JSON_BASE64",
    "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
  );

  let parsed: Record<string, unknown> | null = null;
  if (rawJson) {
    try {
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  } else if (rawJsonBase64) {
    try {
      const decoded = atob(rawJsonBase64);
      parsed = JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  }

  const projectId = toText(parsed?.project_id) || readOptionalEnv("FIREBASE_PROJECT_ID", "FCM_PROJECT_ID", "GOOGLE_CLOUD_PROJECT");
  const clientEmail = toText(parsed?.client_email) || readOptionalEnv("FIREBASE_CLIENT_EMAIL", "FCM_CLIENT_EMAIL");
  const privateKey = (toText(parsed?.private_key) || readOptionalEnv("FIREBASE_PRIVATE_KEY", "FCM_PRIVATE_KEY"))
    .replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) return null;
  return { clientEmail, privateKey, projectId };
};

const pemToArrayBuffer = (pem: string) => {
  const normalized = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
};

async function createServiceAccountJwt(account: FcmServiceAccount) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
    iss: account.clientEmail,
    scope: FCM_SCOPE,
  }));
  const unsignedJwt = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.privateKey),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt),
  ));
  return `${unsignedJwt}.${base64UrlEncode(signature)}`;
}

async function readFcmAccessToken(account: FcmServiceAccount) {
  if (cachedFcmAccessToken && cachedFcmAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedFcmAccessToken.token;
  }

  const jwt = await createServiceAccountJwt(account);
  const body = new URLSearchParams({
    assertion: jwt,
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
  });
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    body,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  const token = toText((payload as { access_token?: unknown }).access_token);
  const expiresIn = Number((payload as { expires_in?: unknown }).expires_in ?? 3600);
  if (!response.ok || !token) {
    throw new Error(`FCM OAuth failed: ${sanitizeErrorMessage(payload)}`);
  }
  cachedFcmAccessToken = {
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    token,
  };
  return token;
}

async function sendFcmDataMessage(input: {
  data: Record<string, string>;
  token: string;
  ttlSeconds: number;
}) {
  const account = parseFcmServiceAccount();
  if (!account) {
    return {
      body: {},
      errorCode: "fcm_credentials_missing",
      ok: false,
      providerMessageId: null,
      status: 0,
    };
  }

  const accessToken = await readFcmAccessToken(account);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`, {
    body: JSON.stringify({
      message: {
        android: {
          priority: "HIGH",
          ttl: `${Math.max(1, Math.floor(input.ttlSeconds))}s`,
        },
        data: input.data,
        token: input.token,
      },
    }),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await response.json().catch(() => ({}));
  const providerMessageId = toText((body as { name?: unknown }).name) || null;
  const errorPayload = body && typeof body === "object" && "error" in body
    ? (body as { error?: JsonObject }).error ?? {}
    : {};
  const errorCode = toText(errorPayload.status)
    || toText(errorPayload.message)
    || (response.ok ? null : `fcm_http_${response.status}`);

  return {
    body,
    errorCode,
    ok: response.ok && !!providerMessageId,
    providerMessageId,
    status: response.status,
  };
}

const buildCopy = (action: DispatchAction, callType: string, callerName: string) => {
  const callLabel = callType === "voice" ? "voice" : "video";
  if (action === "missed") {
    return {
      title: `Missed Chi'lly Chat ${callLabel} call`,
      body: callerName ? `You missed a ${callLabel} call from ${callerName}.` : `You missed a Chi'lly Chat ${callLabel} call.`,
    };
  }
  return {
    title: `Incoming Chi'lly Chat ${callLabel} call`,
    body: callerName ? `${callerName} is calling you on Chi'lly Chat.` : `Incoming Chi'lly Chat ${callLabel} call.`,
  };
};

function buildRoute(threadId: string, inviteId: string, action: DispatchAction) {
  const params = new URLSearchParams({
    callInviteId: inviteId,
  });
  return `/chat/${threadId}?${params.toString()}`;
}

async function dispatchCallNotification(adminClient: SupabaseClientLike, input: {
  action: DispatchAction;
  actorUserId: string;
  callType: string;
  callerName: string;
  invite: CallInvite;
  recipientUserId: string;
}) {
  const preference = await readPreferences(adminClient, input.recipientUserId);
  const callAlertsEnabled = preference?.chilly_chat_calls_enabled !== false;
  const pushAllowed = preference?.push_enabled !== false && callAlertsEnabled;
  const inAppAllowed = preference?.in_app_enabled !== false && callAlertsEnabled;
  const sourceType = "chat_call_invite";
  const notificationType = input.action === "missed" ? "chilly_chat_missed_call" : "chilly_chat_call";
  const category = notificationType;
  const route = buildRoute(input.invite.thread_id, input.invite.id, input.action);
  const copy = buildCopy(input.action, input.callType, input.callerName);
  const dedupeKey = [
    notificationType,
    input.recipientUserId,
    sourceType,
    input.invite.id,
    input.action === "missed" ? "missed" : "ringing",
  ].join(":");

  const { error: dedupeError } = await adminClient.from("notification_event_dedupes").insert({
    dedupe_key: dedupeKey,
    recipient_user_id: input.recipientUserId,
    source_id: input.invite.id,
    source_type: sourceType,
    timing_key: input.action === "missed" ? "missed" : "ringing",
    trigger_type: notificationType,
  });
  if (dedupeError) {
    return {
      notificationId: null,
      pushSent: false,
      recipientUserId: input.recipientUserId,
      reason: "duplicate_prevented",
      status: "skipped",
    };
  }

  let notificationId: string | null = null;
  if (inAppAllowed) {
    const { data, error } = await adminClient
      .from("notifications")
      .insert({
        actor_user_id: input.actorUserId,
        body: copy.body,
        category,
        deep_link: `chillywoodmobile://${route.replace(/^\//u, "")}`,
        eligibility_reason: input.action === "missed" ? "chat_call_missed" : "chat_call_ringing",
        notification_type: notificationType,
        priority: input.action === "missed" ? 4 : 2,
        source_id: input.invite.id,
        source_type: sourceType,
        status: "pending",
        target_context: {
          callInviteId: input.invite.id,
          callType: input.callType,
          notificationChannelId: input.action === "missed" ? MISSED_CALL_CHANNEL_ID : CHAT_CALL_CHANNEL_ID,
          openCall: input.action === "incoming",
        },
        target_entity_id: input.invite.thread_id,
        target_route: "/chat/[threadId]",
        title: copy.title,
        user_id: input.recipientUserId,
      })
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      await adminClient.from("notification_event_dedupes").delete().eq("dedupe_key", dedupeKey);
      return {
        notificationId: null,
        pushSent: false,
        recipientUserId: input.recipientUserId,
        reason: "notification_insert_failed",
        status: "failed",
      };
    }
    notificationId = data.id;
    await adminClient.from("notification_event_dedupes").update({ notification_id: notificationId }).eq("dedupe_key", dedupeKey);
  }

  if (!pushAllowed) {
    await insertDeliveryAttempt(adminClient, {
      errorCode: "preference_disabled",
      notificationId,
      provider: "none",
      recipientUserId: input.recipientUserId,
      status: "skipped",
    });
    return {
      notificationId,
      pushSent: false,
      recipientUserId: input.recipientUserId,
      reason: "preference_disabled",
      status: inAppAllowed ? "created" : "skipped",
    };
  }

  await reconcileRecentExpoReceipts(adminClient, input.recipientUserId);

  const tokens = await readPushTokens(adminClient, input.recipientUserId);
  if (!tokens.length) {
    await insertDeliveryAttempt(adminClient, {
      errorCode: "no_enabled_push_token",
      notificationId,
      provider: "expo",
      recipientUserId: input.recipientUserId,
      status: "skipped",
    });
    return {
      notificationId,
      pushSent: false,
      recipientUserId: input.recipientUserId,
      reason: "no_enabled_push_token",
      status: inAppAllowed ? "created" : "skipped",
    };
  }

  const channelId = input.action === "missed" ? MISSED_CALL_CHANNEL_ID : CHAT_CALL_CHANNEL_ID;
  const ordinaryCallData: Record<string, string> = {
    callInviteId: input.invite.id,
    callType: input.callType,
    callerName: input.callerName,
    notificationId: notificationId ?? "",
    openCall: input.action === "incoming" ? "true" : "false",
    path: route,
    threadId: input.invite.thread_id,
    triggerType: notificationType,
  };
  const nativeCallData: Record<string, string> = {
    ...ordinaryCallData,
    body: copy.body,
    nativeCallStyle: input.action === "incoming" ? "android_callstyle" : "standard",
    notificationChannelId: channelId,
    title: copy.title,
  };
  const androidTokens = tokens.filter((token) => token.platform === "android");
  const iosExpoTokens = tokens.filter((token) => token.platform === "ios" && token.provider === "expo");
  const fcmTokens = androidTokens.filter((token) => token.provider === "fcm");
  const expoTokens = androidTokens.filter((token) => token.provider === "expo");
  const iosRolloutEnabled = isIosOrdinaryPushRolloutEnabled();
  let nativeSentCount = 0;
  let expoSentCount = 0;
  let lastFailureReason = "";

  if (input.action === "incoming") {
    for (const token of iosExpoTokens) {
      await insertDeliveryAttempt(adminClient, {
        errorCode: "ios_native_calls_disabled",
        notificationId,
        provider: token.provider,
        pushTokenId: token.id,
        recipientUserId: input.recipientUserId,
        status: "skipped",
      });
    }
    if (!fcmTokens.length) {
      await insertDeliveryAttempt(adminClient, {
        errorCode: "no_enabled_push_token",
        notificationId,
        provider: "fcm",
        recipientUserId: input.recipientUserId,
        status: "skipped",
      });
      lastFailureReason = "no_enabled_push_token";
    }

    for (const token of fcmTokens) {
      const pushResult = await sendFcmDataMessage({
        data: nativeCallData,
        token: token.token,
        ttlSeconds: 45,
      });
      const sent = pushResult.ok;
      if (sent) nativeSentCount += 1;
      lastFailureReason = sent ? "" : pushResult.errorCode || "fcm_provider_failed";
      await insertDeliveryAttempt(adminClient, {
        errorCode: sent ? null : lastFailureReason,
        errorMessage: sent ? null : sanitizeErrorMessage(pushResult.body),
        notificationId,
        provider: "fcm",
        providerMessageId: pushResult.providerMessageId,
        pushTokenId: token.id,
        recipientUserId: input.recipientUserId,
        status: sent ? "sent" : "failed",
      });

      if (lastFailureReason === "UNREGISTERED" || lastFailureReason === "SENDER_ID_MISMATCH") {
        await revokePushToken(adminClient, token.id);
      }
    }
  }

  if (input.action === "missed" && !iosRolloutEnabled) {
    for (const token of iosExpoTokens) {
      await insertDeliveryAttempt(adminClient, {
        errorCode: "ios_push_rollout_disabled",
        notificationId,
        provider: token.provider,
        pushTokenId: token.id,
        recipientUserId: input.recipientUserId,
        status: "skipped",
      });
    }
  }

  const ordinaryExpoTokens = input.action === "missed" && iosRolloutEnabled
    ? [...expoTokens, ...iosExpoTokens]
    : expoTokens;
  const shouldAttemptExpo = input.action === "missed" || nativeSentCount === 0;
  for (const token of shouldAttemptExpo ? ordinaryExpoTokens : []) {
    let pushMessage: JsonObject = {
      data: nativeCallData,
      priority: "high",
      to: token.token,
      ttl: 45,
    };
    if (input.action === "missed") {
      pushMessage = buildPlatformExpoPushMessage({
        androidChannelId: channelId,
        badge: 1,
        body: copy.body,
        categoryId: IOS_NOTIFICATION_CATEGORIES.missedCall,
        data: token.platform === "ios" ? ordinaryCallData : nativeCallData,
        interruptionLevel: "active",
        platform: token.platform,
        priority: "high",
        sound: "default",
        title: copy.title,
        to: token.token,
        ttl: 3600,
      });
      if (token.platform === "android") {
        pushMessage.body = copy.body;
        pushMessage.channelId = channelId;
        pushMessage.sound = "default";
        pushMessage.title = copy.title;
      }
    }
    const pushResult = await sendExpoPush(pushMessage);
    const firstTicket = Array.isArray((pushResult.body as { data?: unknown }).data)
      ? ((pushResult.body as { data: JsonObject[] }).data[0] ?? {})
      : ((pushResult.body as { data?: JsonObject }).data ?? {});
    const status = toText(firstTicket.status || (pushResult.ok ? "sent" : "failed"));
    const providerMessageId = toText(firstTicket.id) || null;
    const errorCode = toText(firstTicket.details && typeof firstTicket.details === "object"
      ? (firstTicket.details as JsonObject).error
      : firstTicket.message) || null;
    const sent = pushResult.ok && status === "ok";

    if (sent) expoSentCount += 1;
    await insertDeliveryAttempt(adminClient, {
      errorCode,
      errorMessage: sent ? null : toText(firstTicket.message) || `Expo push returned ${pushResult.status}`,
      notificationId,
      provider: token.provider,
      providerMessageId,
      pushTokenId: token.id,
      recipientUserId: input.recipientUserId,
      status: sent ? "sent" : "failed",
    });

    if (errorCode === "DeviceNotRegistered") {
      await revokePushToken(adminClient, token.id);
    }
  }

  if (notificationId) {
    const delivered = input.action === "incoming" ? nativeSentCount > 0 : expoSentCount > 0;
    const update: JsonObject = delivered
      ? { delivered_at: new Date().toISOString(), status: "sent" }
      : input.action === "incoming" && inAppAllowed
        ? { status: "pending" }
        : { delivered_at: null, status: "failed" };
    await adminClient.from("notifications").update(update).eq("id", notificationId);
  }

  const deliveredCount = input.action === "incoming" ? nativeSentCount : expoSentCount;
  const expoFallbackOnly = input.action === "incoming" && nativeSentCount === 0 && expoSentCount > 0;
  return {
    notificationId,
    pushSent: deliveredCount > 0,
    recipientUserId: input.recipientUserId,
    reason: deliveredCount > 0
      ? "sent"
      : expoFallbackOnly
        ? "native_fcm_unavailable_expo_fallback"
        : lastFailureReason || "provider_failed",
    status: deliveredCount > 0 ? "sent" : inAppAllowed ? "created" : "failed",
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
    const inviteId = toText(body.inviteId ?? body.invite_id);
    if (!action) return jsonResponse(400, { error: "invalid_action" });
    if (!inviteId) return jsonResponse(400, { error: "missing_invite_id" });

    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    let invite = await readInvite(adminClient, inviteId);
    if (!invite) return jsonResponse(404, { error: "invite_not_found" });

    const actorUserId = toText(auth.user.id);
    const callerUserId = toText(invite.caller_user_id);
    const calleeUserId = toText(invite.callee_user_id);
    if (actorUserId !== callerUserId && actorUserId !== calleeUserId) {
      return jsonResponse(403, { error: "not_call_participant" });
    }

    const members = await readThreadMembers(adminClient, invite.thread_id);
    const memberIds = new Set(members.map((member) => toText(member.user_id)).filter(Boolean));
    if (!memberIds.has(callerUserId) || !memberIds.has(calleeUserId)) {
      return jsonResponse(403, { error: "thread_membership_required" });
    }

    if (await hasAudienceBlock(adminClient, callerUserId, calleeUserId)) {
      return jsonResponse(200, {
        blockedReason: "audience_block",
        eligible: false,
        pushSent: false,
      });
    }

    if (
      await isAccountAccessRestricted(adminClient, callerUserId)
      || await isAccountAccessRestricted(adminClient, calleeUserId)
    ) {
      return jsonResponse(200, {
        blockedReason: "account_access_restricted",
        eligible: false,
        pushSent: false,
      });
    }

    const status = toText(invite.status).toLowerCase();
    const now = Date.now();
    const expiresAt = Date.parse(toText(invite.expires_at));
    if (action === "incoming") {
      if (actorUserId !== callerUserId) return jsonResponse(403, { error: "caller_required" });
      if (status !== "ringing") {
        return jsonResponse(200, {
          blockedReason: "invite_not_ringing",
          eligible: false,
          pushSent: false,
          status,
        });
      }
      if (Number.isFinite(expiresAt) && expiresAt <= now) {
        return jsonResponse(200, {
          blockedReason: "invite_expired",
          eligible: false,
          pushSent: false,
          status,
        });
      }
    }

    if (action === "missed") {
      if (status === "ringing" && Number.isFinite(expiresAt) && expiresAt <= now) {
        const missedInvite = await markInviteMissed(adminClient, invite, actorUserId);
        if (!missedInvite) {
          return jsonResponse(200, {
            blockedReason: "missed_update_failed",
            eligible: false,
            pushSent: false,
            status,
          });
        }
        invite = missedInvite;
      } else if (status !== "missed") {
        return jsonResponse(200, {
          blockedReason: TERMINAL_STATUSES.has(status) ? `invite_${status}` : "invite_not_missed",
          eligible: false,
          pushSent: false,
          status,
        });
      }
    }

    const caller = members.find((member) => toText(member.user_id) === callerUserId);
    const result = await dispatchCallNotification(adminClient, {
      action,
      actorUserId: callerUserId,
      callerName: toText(caller?.display_name) || "Someone",
      callType: normalizeCallType(invite.call_type),
      invite,
      recipientUserId: calleeUserId,
    });

    return jsonResponse(200, {
      channelId: action === "missed" ? MISSED_CALL_CHANNEL_ID : CHAT_CALL_CHANNEL_ID,
      eligible: true,
      result: {
        notificationCreated: !!result.notificationId,
        pushSent: result.pushSent,
        reason: result.reason,
        status: result.status,
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: "chilly_chat_call_dispatch_error", message: sanitizeErrorMessage(error) });
  }
});
