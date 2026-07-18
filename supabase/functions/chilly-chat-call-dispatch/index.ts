import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";

import {
  IOS_NOTIFICATION_CATEGORIES,
  buildPlatformExpoPushMessage,
} from "../_shared/notification-payload.mjs";
import { reconcileRecentExpoPushReceipts } from "../_shared/expo-push-receipts.ts";
import {
  buildBlockedChillyChatCallDispatch,
  buildChillyChatCallPresentationCopy,
  buildChillyChatNativeActionData,
  createChillyChatCallChannelResult,
  resolveChillyChatCallPreferencePolicy,
  summarizeChillyChatCallDispatch,
} from "../_shared/chilly-chat-call-dispatch-policy.mjs";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

type DispatchAction = "incoming" | "missed" | "cancel" | "declined" | "end" | "timeout";

type DispatchPayload = {
  action?: unknown;
  deliveryId?: unknown;
  delivery_id?: unknown;
  inviteId?: unknown;
  invite_id?: unknown;
};

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

type AuthResult =
  | { error: Response; user?: never }
  | { error?: never; authorization: string; user: AuthenticatedUser };

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

type CallDispatchStatus = "sent" | "created" | "skipped" | "failed" | "blocked" | "disabled" | "unknown";

type ChillyCallChannelResult = {
  eligible: boolean;
  attempted: boolean;
  notificationCreated: boolean;
  pushSent: boolean;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  reason: string;
  status: CallDispatchStatus;
};

type ChillyDispatchChannelResult = {
  androidNative: ChillyCallChannelResult;
  iosVoip: ChillyCallChannelResult;
  ordinaryPush: ChillyCallChannelResult;
  inAppNotification: ChillyCallChannelResult;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-chillywood-retry-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
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
const isTerminalAction = (action: DispatchAction) => (
  action === "cancel" || action === "declined" || action === "end" || action === "timeout"
);
const shouldInvokeIosVoip = (action: DispatchAction) => action === "incoming" || isTerminalAction(action);

const isIncomingOrMissedAction = (action: DispatchAction) => (
  action === "incoming" || action === "missed"
);
type IosVoipDispatchPayload = {
  action?: unknown;
  eligible?: unknown;
  failedCount?: unknown;
  reason?: unknown;
  sentCount?: unknown;
  skippedCount?: unknown;
  status?: unknown;
};

const channelResult = (
  overrides: Partial<ChillyCallChannelResult> = {},
): ChillyCallChannelResult => createChillyChatCallChannelResult(overrides) as ChillyCallChannelResult;

const summarizeDispatch = (
  eligible: boolean,
  channels: ChillyDispatchChannelResult,
  blockedReason = "",
) => summarizeChillyChatCallDispatch(eligible, channels, blockedReason);

const blockedDispatch = (reason: string) => buildBlockedChillyChatCallDispatch(reason);

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
  if (normalized === "cancel" || normalized === "dispatch_cancel") return "cancel";
  if (normalized === "declined" || normalized === "decline" || normalized === "dispatch_declined") return "declined";
  if (normalized === "end" || normalized === "ended" || normalized === "dispatch_end") return "end";
  if (normalized === "timeout" || normalized === "dispatch_timeout") return "timeout";
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
    authorization: authHeader,
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

async function invokeIosVoipDispatch(input: {
  action: DispatchAction;
  authHeader: string;
  deliveryId?: string;
  inviteId: string;
  retryToken?: string;
}): Promise<ChillyCallChannelResult> {
  if (!shouldInvokeIosVoip(input.action)) {
    return channelResult();
  }
  try {
    const response = await fetch(`${readRequiredEnv("SUPABASE_URL")}/functions/v1/ios-voip-call-dispatch`, {
      body: JSON.stringify({ action: input.action, deliveryId: input.deliveryId, inviteId: input.inviteId }),
      headers: {
        Authorization: input.authHeader,
        apikey: readRequiredEnv("SUPABASE_ANON_KEY"),
        "Content-Type": "application/json",
        ...(input.retryToken ? { "x-chillywood-retry-token": input.retryToken } : {}),
      },
      method: "POST",
    });

    const payload = await response.json().catch(() => ({})) as IosVoipDispatchPayload;
    const eligible = typeof payload.eligible === "boolean" ? payload.eligible : response.ok;
    const safeCount = (value: unknown) => {
      const parsed = Number(value ?? 0);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
    };
    const sentCount = safeCount(payload.sentCount);
    const failedCount = safeCount(payload.failedCount) + (!response.ok ? 1 : 0);
    const skippedCount = safeCount(payload.skippedCount);
    const rawStatus = toText(payload.status).toLowerCase();
    const status: CallDispatchStatus = rawStatus === "sent"
      || rawStatus === "created"
      || rawStatus === "skipped"
      || rawStatus === "failed"
      || rawStatus === "blocked"
      || rawStatus === "disabled"
      ? rawStatus
      : sentCount > 0
        ? "sent"
        : failedCount > 0
          ? "failed"
          : "skipped";
    return channelResult({
      eligible,
      attempted: response.ok && status !== "blocked" && status !== "disabled" && status !== "skipped"
        ? true
        : failedCount > 0,
      pushSent: sentCount > 0,
      sentCount,
      failedCount,
      skippedCount,
      reason: toText(payload.reason) || (response.ok ? status : `ios_voip_http_${response.status}`),
      status,
    });
  } catch {
    return channelResult({
      eligible: true,
      attempted: true,
      failedCount: 1,
      reason: "ios_voip_dispatch_unavailable",
      status: "failed",
    });
  }
}

const buildCopy = (action: DispatchAction, callType: string, callerName: string) => {
  return buildChillyChatCallPresentationCopy({ action, callType, callerName }) as {
    title: string;
    body: string;
  } | null;
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
  authHeader: string;
  deliveryId?: string;
  retryToken?: string;
}) {
  const preference = await readPreferences(adminClient, input.recipientUserId);
  const preferencePolicy = resolveChillyChatCallPreferencePolicy({
    action: input.action,
    chillyChatCallsEnabled: preference?.chilly_chat_calls_enabled,
    inAppEnabled: preference?.in_app_enabled,
    pushEnabled: preference?.push_enabled,
  });
  const actionAllowed = preferencePolicy.actionAllowed;
  const pushAllowed = preferencePolicy.ordinaryPush;
  const presentationAction = isIncomingOrMissedAction(input.action);
  const inAppAllowed = preferencePolicy.inAppNotification;
  const sourceType = "chat_call_invite";
  const route = buildRoute(input.invite.thread_id, input.invite.id, input.action);
  const copy = buildCopy(input.action, input.callType, input.callerName);

  if (!actionAllowed) {
    const blocked = channelResult({ reason: "chilly_chat_calls_disabled", status: "blocked" });
    return summarizeDispatch(false, {
      androidNative: { ...blocked },
      iosVoip: { ...blocked },
      ordinaryPush: { ...blocked },
      inAppNotification: { ...blocked },
    }, "chilly_chat_calls_disabled");
  }

  // PushKit is deliberately started before notification or ordinary-token
  // work. A valid VoIP token is an independent incoming-call channel.
  const iosVoipPromise = invokeIosVoipDispatch({
    action: input.action,
    authHeader: input.authHeader,
    deliveryId: input.deliveryId,
    inviteId: input.invite.id,
    retryToken: input.retryToken,
  });

  let notificationId: string | null = null;
  let presentationDuplicate = false;
  let inAppNotification = channelResult({
    eligible: inAppAllowed,
    reason: inAppAllowed ? "not_attempted" : presentationAction ? "in_app_preference_disabled" : "terminal_action_no_presentation",
  });

  if (isTerminalAction(input.action)) {
    const now = new Date().toISOString();
    await adminClient
      .from("notifications")
      .update({ dismissed_at: now, read_at: now, status: "dismissed", updated_at: now })
      .eq("source_type", sourceType)
      .eq("source_id", input.invite.id)
      .eq("notification_type", "chilly_chat_call")
      .in("status", ["pending", "sent"]);
    inAppNotification = channelResult({ reason: "existing_call_notification_closed" });
  } else if (copy) {
    const notificationType = input.action === "missed" ? "chilly_chat_missed_call" : "chilly_chat_call";
    const timingKey = input.action === "missed" ? "missed" : "ringing";
    const dedupeKey = [notificationType, input.recipientUserId, sourceType, input.invite.id, timingKey].join(":");
    const { error: dedupeError } = await adminClient.from("notification_event_dedupes").insert({
      dedupe_key: dedupeKey,
      recipient_user_id: input.recipientUserId,
      source_id: input.invite.id,
      source_type: sourceType,
      timing_key: timingKey,
      trigger_type: notificationType,
    });
    presentationDuplicate = !!dedupeError;

    if (presentationDuplicate) {
      inAppNotification = channelResult({
        eligible: inAppAllowed,
        skippedCount: 1,
        reason: "duplicate_prevented",
      });
    } else if (inAppAllowed) {
      const channelId = input.action === "missed" ? MISSED_CALL_CHANNEL_ID : CHAT_CALL_CHANNEL_ID;
      const { data, error } = await adminClient
        .from("notifications")
        .insert({
          actor_user_id: input.actorUserId,
          body: copy.body,
          category: notificationType,
          deep_link: `chillywoodmobile://${route.replace(/^\//u, "")}`,
          eligibility_reason: input.action === "missed" ? "chat_call_missed" : "chat_call_ringing",
          notification_type: notificationType,
          priority: input.action === "missed" ? 4 : 2,
          source_id: input.invite.id,
          source_type: sourceType,
          status: "pending",
          target_context: {
            action: input.action,
            callUuid: input.invite.id,
            callInviteId: input.invite.id,
            callType: input.callType,
            expiresAt: input.invite.expires_at,
            notificationChannelId: channelId,
            openCall: input.action === "incoming",
            threadId: input.invite.thread_id,
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
        inAppNotification = channelResult({
          eligible: true,
          attempted: true,
          failedCount: 1,
          reason: "notification_insert_failed",
          status: "failed",
        });
      } else {
        notificationId = data.id;
        await adminClient.from("notification_event_dedupes").update({ notification_id: notificationId }).eq("dedupe_key", dedupeKey);
        inAppNotification = channelResult({
          eligible: true,
          attempted: true,
          notificationCreated: true,
          reason: "notification_created",
          status: "created",
        });
      }
    }
  }

  if (pushAllowed) {
    await reconcileRecentExpoPushReceipts(adminClient, input.recipientUserId).catch(() => null);
  }
  const tokens = pushAllowed ? await readPushTokens(adminClient, input.recipientUserId) : [];
  const androidTokens = tokens.filter((token) => token.platform === "android");
  const fcmTokens = androidTokens.filter((token) => token.provider === "fcm");
  const androidExpoTokens = androidTokens.filter((token) => token.provider === "expo");
  const iosExpoTokens = tokens.filter((token) => token.platform === "ios" && token.provider === "expo");
  const iosRolloutEnabled = isIosOrdinaryPushRolloutEnabled();
  const channelId = input.action === "missed" ? MISSED_CALL_CHANNEL_ID : CHAT_CALL_CHANNEL_ID;
  const nativeActionData = buildChillyChatNativeActionData({
    action: input.action,
    callInviteId: input.invite.id,
    callType: input.callType,
    callerName: input.callerName,
    expiresAt: input.invite.expires_at,
    notificationChannelId: channelId,
    notificationId,
    path: route,
    threadId: input.invite.thread_id,
  }) as Record<string, string>;

  let androidSent = 0;
  let androidFailed = 0;
  let androidSkipped = 0;
  let androidReason = pushAllowed ? "no_enabled_fcm_token" : "ordinary_push_preference_disabled";
  const fcmEligible = pushAllowed && (input.action === "incoming" || isTerminalAction(input.action));
  if (presentationDuplicate && input.action === "incoming") {
    androidSkipped = fcmTokens.length || 1;
    androidReason = "duplicate_prevented";
  } else if (fcmEligible) {
    for (const token of fcmTokens) {
      const pushResult = await sendFcmDataMessage({
        data: nativeActionData,
        token: token.token,
        ttlSeconds: input.action === "incoming" ? 45 : 300,
      });
      const sent = pushResult.ok;
      if (sent) androidSent += 1;
      else androidFailed += 1;
      androidReason = sent ? "sent" : pushResult.errorCode || "fcm_provider_failed";
      await insertDeliveryAttempt(adminClient, {
        errorCode: sent ? null : androidReason,
        errorMessage: sent ? null : sanitizeErrorMessage(pushResult.body),
        notificationId,
        provider: "fcm",
        providerMessageId: pushResult.providerMessageId,
        pushTokenId: token.id,
        recipientUserId: input.recipientUserId,
        status: sent ? "sent" : "failed",
      });
      if (androidReason === "UNREGISTERED" || androidReason === "SENDER_ID_MISMATCH") {
        await revokePushToken(adminClient, token.id);
      }
    }
  }
  const androidNative = channelResult({
    eligible: fcmEligible,
    attempted: fcmTokens.length > 0 && !(presentationDuplicate && input.action === "incoming"),
    pushSent: androidSent > 0,
    sentCount: androidSent,
    failedCount: androidFailed,
    skippedCount: androidSkipped,
    reason: androidReason,
    status: androidSent > 0 ? "sent" : androidFailed > 0 ? "failed" : "skipped",
  });

  if (!iosRolloutEnabled) {
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

  const expoCandidates = input.action === "missed" && iosRolloutEnabled
    ? [...androidExpoTokens, ...iosExpoTokens]
    : androidExpoTokens;
  const shouldAttemptExpo = pushAllowed
    && !presentationDuplicate
    && (input.action === "missed" || androidSent === 0);
  let expoSent = 0;
  let expoFailed = 0;
  let expoSkipped = 0;
  let expoReason = pushAllowed ? "no_enabled_expo_token" : "ordinary_push_preference_disabled";
  for (const token of shouldAttemptExpo ? expoCandidates : []) {
    let pushMessage: JsonObject = {
      data: nativeActionData,
      priority: "high",
      to: token.token,
      ttl: input.action === "incoming" ? 45 : 300,
    };
    if (input.action === "missed" && copy) {
      pushMessage = buildPlatformExpoPushMessage({
        androidChannelId: channelId,
        badge: 1,
        body: copy.body,
        categoryId: IOS_NOTIFICATION_CATEGORIES.missedCall,
        data: nativeActionData,
        interruptionLevel: "active",
        platform: token.platform,
        priority: "high",
        sound: "default",
        title: copy.title,
        to: token.token,
        ttl: 3600,
      });
    }
    const pushResult = await sendExpoPush(pushMessage);
    const firstTicket = Array.isArray((pushResult.body as { data?: unknown }).data)
      ? ((pushResult.body as { data: JsonObject[] }).data[0] ?? {})
      : ((pushResult.body as { data?: JsonObject }).data ?? {});
    const ticketStatus = toText(firstTicket.status || (pushResult.ok ? "sent" : "failed"));
    const providerMessageId = toText(firstTicket.id) || null;
    const errorCode = toText(firstTicket.details && typeof firstTicket.details === "object"
      ? (firstTicket.details as JsonObject).error
      : firstTicket.message) || null;
    const sent = pushResult.ok && ticketStatus === "ok";
    if (sent) expoSent += 1;
    else expoFailed += 1;
    expoReason = sent ? "sent" : errorCode || "expo_provider_failed";
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
    if (errorCode === "DeviceNotRegistered") await revokePushToken(adminClient, token.id);
  }
  if (pushAllowed && presentationDuplicate) {
    expoSkipped = expoCandidates.length || 1;
    expoReason = "duplicate_prevented";
  } else if (androidSent > 0 && expoCandidates.length) {
    expoSkipped = expoCandidates.length;
    expoReason = "android_native_sent";
  }
  const ordinaryPush = channelResult({
    eligible: pushAllowed && (input.action === "missed" || expoCandidates.length > 0),
    attempted: shouldAttemptExpo && expoCandidates.length > 0,
    pushSent: expoSent > 0,
    sentCount: expoSent,
    failedCount: expoFailed,
    skippedCount: expoSkipped,
    reason: expoReason,
    status: expoSent > 0 ? "sent" : expoFailed > 0 ? "failed" : "skipped",
  });

  const iosVoip = await iosVoipPromise;
  const remoteDelivered = androidNative.pushSent || ordinaryPush.pushSent || iosVoip.pushSent;
  if (notificationId) {
    await adminClient
      .from("notifications")
      .update(remoteDelivered
        ? { delivered_at: new Date().toISOString(), status: "sent" }
        : { delivered_at: null, status: "pending" })
      .eq("id", notificationId);
  }

  return summarizeDispatch(true, {
    androidNative,
    iosVoip,
    ordinaryPush,
    inAppNotification,
  });
}

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const payload = await parseJsonPayload(req);
    if (payload.error) return payload.error;
    const body = payload.value ?? {};
    const action = normalizeAction(body.action);
    const deliveryId = toText(body.deliveryId ?? body.delivery_id);
    const inviteId = toText(body.inviteId ?? body.invite_id);
    if (!action) return jsonResponse(400, { error: "invalid_action" });
    if (!inviteId) return jsonResponse(400, { error: "missing_invite_id" });

    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const authorization = req.headers.get("authorization") ?? "";
    const retryToken = toText(req.headers.get("x-chillywood-retry-token"));
    let actorUserId = "";
    let dispatchAuthorization = authorization;
    if (retryToken) {
      if (!deliveryId || !isTerminalAction(action)) {
        return jsonResponse(401, { error: "invalid_internal_delivery_scope" });
      }
      const { data: authorized, error: authorizationError } = await adminClient.rpc(
        "authorize_chilly_chat_call_transition_retry",
        { p_token: retryToken },
      );
      if (authorizationError || authorized !== true) {
        return jsonResponse(401, { error: "invalid_retry_authorization" });
      }
      const { data: internalDelivery, error: internalDeliveryError } = await adminClient
        .from("chat_call_transition_deliveries")
        .select("id,actor_user_id,call_invite_id,dispatch_action,delivery_status")
        .eq("id", deliveryId)
        .maybeSingle();
      if (
        internalDeliveryError
        || !internalDelivery
        || toText(internalDelivery.call_invite_id) !== inviteId
        || toText(internalDelivery.dispatch_action) !== action
        || toText(internalDelivery.delivery_status) !== "dispatching"
      ) {
        return jsonResponse(403, { error: "internal_delivery_scope_rejected" });
      }
      actorUserId = toText(internalDelivery.actor_user_id);
      dispatchAuthorization = `Bearer ${readRequiredEnv("SUPABASE_ANON_KEY")}`;
    } else if (authorization === `Bearer ${serviceRoleKey}`) {
      if (!deliveryId || !isTerminalAction(action)) {
        return jsonResponse(401, { error: "invalid_internal_delivery_scope" });
      }
      const { data: internalDelivery, error: internalDeliveryError } = await adminClient
        .from("chat_call_transition_deliveries")
        .select("id,actor_user_id,call_invite_id,dispatch_action,delivery_status")
        .eq("id", deliveryId)
        .maybeSingle();
      if (
        internalDeliveryError
        || !internalDelivery
        || toText(internalDelivery.call_invite_id) !== inviteId
        || toText(internalDelivery.dispatch_action) !== action
        || toText(internalDelivery.delivery_status) !== "dispatching"
      ) {
        return jsonResponse(403, { error: "internal_delivery_scope_rejected" });
      }
      actorUserId = toText(internalDelivery.actor_user_id);
    } else {
      const auth = await readAuthenticatedUser(req);
      if (auth.error) return auth.error;
      actorUserId = toText(auth.user.id);
      dispatchAuthorization = auth.authorization;
    }
    const invite = await readInvite(adminClient, inviteId);
    if (!invite) return jsonResponse(404, { error: "invite_not_found" });

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
      return jsonResponse(200, blockedDispatch("audience_block"));
    }

    if (
      await isAccountAccessRestricted(adminClient, callerUserId)
      || await isAccountAccessRestricted(adminClient, calleeUserId)
    ) {
      return jsonResponse(200, blockedDispatch("account_access_restricted"));
    }

    const status = toText(invite.status).toLowerCase();
    const now = Date.now();
    const expiresAt = Date.parse(toText(invite.expires_at));
    if (action === "incoming") {
      if (actorUserId !== callerUserId) return jsonResponse(403, { error: "caller_required" });
      if (status !== "ringing") {
        return jsonResponse(200, blockedDispatch("invite_not_ringing"));
      }
      if (Number.isFinite(expiresAt) && expiresAt <= now) {
        return jsonResponse(200, blockedDispatch("invite_expired"));
      }
    }

    if (action === "missed") {
      if (status !== "missed") {
        return jsonResponse(200, blockedDispatch(TERMINAL_STATUSES.has(status) ? `invite_${status}` : "invite_not_missed"));
      }
    }

    if (action === "cancel" && (actorUserId !== callerUserId || status !== "canceled")) {
      return actorUserId !== callerUserId
        ? jsonResponse(403, { error: "caller_required" })
        : jsonResponse(200, blockedDispatch(`invite_${status}`));
    }
    if (action === "declined" && (actorUserId !== calleeUserId || status !== "declined")) {
      return actorUserId !== calleeUserId
        ? jsonResponse(403, { error: "callee_required" })
        : jsonResponse(200, blockedDispatch(`invite_${status}`));
    }
    if (action === "end" && status !== "ended") {
      return jsonResponse(200, blockedDispatch(`invite_${status}`));
    }
    if (action === "timeout") {
      if (status !== "missed" && status !== "busy") {
        return jsonResponse(200, blockedDispatch(`invite_${status}`));
      }
      if (!Number.isFinite(expiresAt) || expiresAt > now) {
        return jsonResponse(200, blockedDispatch("invite_not_expired"));
      }
    }

    const caller = members.find((member) => toText(member.user_id) === callerUserId);
    const recipientUserId = action === "declined"
      ? callerUserId
      : action === "end"
        ? (actorUserId === callerUserId ? calleeUserId : callerUserId)
        : calleeUserId;
    const result = await dispatchCallNotification(adminClient, {
      action,
      actorUserId: callerUserId,
      callerName: toText(caller?.display_name) || "Someone",
      callType: normalizeCallType(invite.call_type),
      invite,
      recipientUserId,
      authHeader: dispatchAuthorization,
      deliveryId: deliveryId || undefined,
      retryToken: retryToken || undefined,
    });

    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(500, { error: "chilly_chat_call_dispatch_error", message: sanitizeErrorMessage(error) });
  }
});
