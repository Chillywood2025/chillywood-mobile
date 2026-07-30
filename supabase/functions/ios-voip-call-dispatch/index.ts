import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  buildIosVoipApnsPayload,
  buildIosVoipTopic,
  IOS_VOIP_DISPATCH_ENABLED_ENV,
  isApnsInvalidVoipTokenReason,
  isIosVoipDispatchExplicitlyEnabled,
  sanitizeApnsProviderReason,
} from "../_shared/ios-voip-policy.mjs";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

type DispatchPayload = {
  action?: unknown;
  inviteId?: unknown;
  invite_id?: unknown;
};

type DispatchAction = "incoming";

type CallInvite = {
  id: string;
  thread_id: string;
  caller_user_id: string;
  callee_user_id: string;
  call_type: string;
  status: string;
  expires_at: string;
};

type ThreadMember = {
  user_id: string;
  display_name: string | null;
};

type VoipToken = {
  id: string;
  token: string;
  token_fingerprint: string;
  apns_environment: "development" | "production";
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

const normalizeAction = (value: unknown): DispatchAction | null => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "incoming" || normalized === "dispatch_incoming") return "incoming";
  return null;
};

const jsonResponse = (status: number, body: JsonObject) => (
  new Response(JSON.stringify(body), { headers: JSON_HEADERS, status })
);
const optionsResponse = () => new Response("ok", { headers: CORS_HEADERS, status: 200 });

const readRequiredEnv = (name: string) => {
  const value = toText(Deno.env.get(name));
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};

const parseBody = async (req: Request): Promise<DispatchPayload | null> => {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as DispatchPayload : null;
  } catch {
    return null;
  }
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

const readInvite = async (adminClient: SupabaseClientLike, inviteId: string) => {
  const { data, error } = await adminClient
    .from("chat_call_invites")
    .select("id,thread_id,caller_user_id,callee_user_id,call_type,status,expires_at")
    .eq("id", inviteId)
    .maybeSingle();
  return error || !data ? null : data as CallInvite;
};

const readThreadMembers = async (adminClient: SupabaseClientLike, threadId: string) => {
  const { data, error } = await adminClient
    .from("chat_thread_members")
    .select("user_id,display_name")
    .eq("thread_id", threadId);
  if (error) throw new Error("thread_membership_read_failed");
  return (data ?? []) as ThreadMember[];
};

const hasAudienceBlock = async (
  adminClient: SupabaseClientLike,
  callerUserId: string,
  calleeUserId: string,
) => {
  const [callerBlock, calleeBlock] = await Promise.all([
    adminClient
      .from("channel_audience_blocks")
      .select("channel_user_id")
      .eq("channel_user_id", callerUserId)
      .eq("blocked_user_id", calleeUserId)
      .limit(1),
    adminClient
      .from("channel_audience_blocks")
      .select("channel_user_id")
      .eq("channel_user_id", calleeUserId)
      .eq("blocked_user_id", callerUserId)
      .limit(1),
  ]);
  if (callerBlock.error || calleeBlock.error) throw new Error("block_status_read_failed");
  return !!callerBlock.data?.length || !!calleeBlock.data?.length;
};

const isAccountRestricted = async (adminClient: SupabaseClientLike, userId: string) => {
  const { data, error } = await adminClient.rpc("is_account_access_restricted", { p_user_id: userId });
  if (error) throw new Error("account_status_read_failed");
  return data === true;
};

const readCallPreference = async (adminClient: SupabaseClientLike, userId: string) => {
  const { data, error } = await adminClient
    .from("notification_preferences")
    .select("chilly_chat_calls_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("call_preference_read_failed");
  // PushKit is a dedicated native-call rail. The call preference is
  // authoritative; the ordinary push preference does not disable VoIP.
  return data?.chilly_chat_calls_enabled !== false;
};

const enforceDispatchRateLimit = async (
  adminClient: SupabaseClientLike,
  callerUserId: string,
  inviteId: string,
) => {
  const scopes = [
    { action: "ios_voip_dispatch", limit: 30, target: "account", window: 3600 },
    { action: "ios_voip_dispatch_invite", limit: 3, target: inviteId, window: 60 },
  ];
  for (const scope of scopes) {
    const { error } = await adminClient.rpc("enforce_abuse_rate_limit", {
      p_action_key: scope.action,
      p_actor_user_id: callerUserId,
      p_limit: scope.limit,
      p_metadata: { source: "ios-voip-call-dispatch" },
      p_target_key: scope.target,
      p_window_seconds: scope.window,
    });
    if (error) {
      if (toText(error.message).toLowerCase().includes("rate_limited")) return false;
      throw new Error("voip_dispatch_rate_limit_failed");
    }
  }
  return true;
};

const base64UrlEncode = (value: string | Uint8Array) => {
  const binary = typeof value === "string"
    ? value
    : Array.from(value, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
};

const pemToPkcs8 = (pem: string) => {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/gu, "")
    .replace(/-----END PRIVATE KEY-----/gu, "")
    .replace(/\s+/gu, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
};

let cachedApnsAuthorization: { expiresAt: number; token: string } | null = null;

const createApnsAuthorization = async (input: {
  keyId: string;
  privateKey: string;
  teamId: string;
}) => {
  const now = Math.floor(Date.now() / 1000);
  if (cachedApnsAuthorization && cachedApnsAuthorization.expiresAt > now + 300) {
    return cachedApnsAuthorization.token;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "ES256", kid: input.keyId }));
  const claims = base64UrlEncode(JSON.stringify({ iat: now, iss: input.teamId }));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(input.privateKey.replace(/\\n/gu, "\n")),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { hash: "SHA-256", name: "ECDSA" },
    key,
    encoder.encode(signingInput),
  ));
  const token = `${signingInput}.${base64UrlEncode(signature)}`;
  cachedApnsAuthorization = { expiresAt: now + 3000, token };
  return token;
};

const sendVoipPush = async (input: {
  apnsEnvironment: "development" | "production";
  authorization: string;
  expiration: number;
  inviteId: string;
  payload: JsonObject;
  token: string;
  topic: string;
}) => {
  const host = input.apnsEnvironment === "production"
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com";
  const response = await fetch(`https://${host}/3/device/${encodeURIComponent(input.token)}`, {
    body: JSON.stringify(input.payload),
    headers: {
      "apns-collapse-id": input.inviteId,
      "apns-expiration": String(input.expiration),
      "apns-priority": "10",
      "apns-push-type": "voip",
      "apns-topic": input.topic,
      Authorization: `bearer ${input.authorization}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(8_000),
  });
  const providerBody = await response.json().catch(() => ({})) as { reason?: unknown };
  return {
    ok: response.ok,
    providerMessageId: toText(response.headers.get("apns-id")) || null,
    reason: response.ok ? null : sanitizeApnsProviderReason(providerBody.reason),
    status: response.status,
  };
};

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const body = await parseBody(req);
    if (!body) return jsonResponse(400, { error: "invalid_json_body" });
    const action = normalizeAction(body.action);
    const inviteId = toText(body.inviteId ?? body.invite_id);
    if (!action) {
      return jsonResponse(200, {
        eligible: false,
        failedCount: 0,
        reason: "non_incoming_uses_authoritative_state",
        sentCount: 0,
        skippedCount: 1,
        status: "skipped",
      });
    }
    if (!inviteId) return jsonResponse(400, { error: "missing_invite_id" });

    const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(
      readRequiredEnv("SUPABASE_URL"),
      serviceRoleKey,
      { auth: { persistSession: false } },
    );
    const callerUserId = await readAuthenticatedUserId(req) ?? "";
    if (!callerUserId) return jsonResponse(401, { error: "unauthenticated" });
    const invite = await readInvite(adminClient, inviteId);
    if (!invite) return jsonResponse(404, { error: "invite_not_found" });
    const inviteCallerUserId = toText(invite.caller_user_id);
    const calleeUserId = toText(invite.callee_user_id);
    if (callerUserId !== inviteCallerUserId && callerUserId !== calleeUserId) {
      return jsonResponse(403, { error: "not_call_participant" });
    }

    const members = await readThreadMembers(adminClient, invite.thread_id);
    const memberIds = new Set(members.map((member) => toText(member.user_id)).filter(Boolean));
    if (!memberIds.has(inviteCallerUserId) || !memberIds.has(calleeUserId)) {
      return jsonResponse(403, { error: "thread_membership_required" });
    }

    const recipientUserId = calleeUserId;
    if (await hasAudienceBlock(adminClient, inviteCallerUserId, calleeUserId)) {
      return jsonResponse(200, { eligible: false, reason: "audience_block", status: "blocked" });
    }
    if (
      await isAccountRestricted(adminClient, inviteCallerUserId)
      || await isAccountRestricted(adminClient, calleeUserId)
    ) {
      return jsonResponse(200, { eligible: false, reason: "account_access_restricted", status: "blocked" });
    }
    if (!await readCallPreference(adminClient, recipientUserId)) {
      return jsonResponse(200, { eligible: false, reason: "call_preference_disabled", status: "blocked" });
    }

    const inviteStatus = toText(invite.status).toLowerCase();
    const expiresAt = Date.parse(toText(invite.expires_at));
    if (callerUserId !== inviteCallerUserId) {
      return jsonResponse(403, { error: "caller_required" });
    }
    if (inviteStatus !== "ringing") {
      return jsonResponse(200, { eligible: false, reason: "invite_not_ringing", status: "blocked" });
    }
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return jsonResponse(200, { eligible: false, reason: "invite_expired", status: "blocked" });
    }
    if (!await enforceDispatchRateLimit(adminClient, callerUserId, inviteId)) {
      return jsonResponse(429, { eligible: false, reason: "rate_limited", status: "blocked" });
    }

    // Source and schema can be deployed safely while provider traffic remains
    // fail-closed. The secret must be explicitly true after physical proof.
    if (!isIosVoipDispatchExplicitlyEnabled(Deno.env.get(IOS_VOIP_DISPATCH_ENABLED_ENV))) {
      return jsonResponse(200, {
        eligible: true,
        failedCount: 0,
        reason: "runtime_disabled_pending_physical_proof",
        sentCount: 0,
        skippedCount: 0,
        status: "disabled",
      });
    }

    const teamId = readRequiredEnv("APPLE_TEAM_ID");
    const keyId = readRequiredEnv("APNS_KEY_ID");
    const privateKey = readRequiredEnv("APNS_PRIVATE_KEY");
    const topic = buildIosVoipTopic(readRequiredEnv("IOS_BUNDLE_IDENTIFIER"));
    if (!topic) return jsonResponse(503, { error: "apns_topic_unavailable" });
    const authorization = await createApnsAuthorization({ keyId, privateKey, teamId });

    const { data: tokenRows, error: tokenError } = await adminClient
      .from("user_voip_push_tokens")
      .select("id,token,token_fingerprint,apns_environment")
      .eq("user_id", recipientUserId)
      .eq("enabled", true)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(5);
    if (tokenError) return jsonResponse(500, { error: "voip_token_read_failed" });
    const tokens = (tokenRows ?? []) as VoipToken[];
    if (!tokens.length) {
      return jsonResponse(200, {
        eligible: true,
        failedCount: 0,
        reason: "no_enabled_voip_token",
        sentCount: 0,
        skippedCount: 0,
        status: "skipped",
      });
    }

    const caller = members.find((member) => toText(member.user_id) === inviteCallerUserId);
    const payload = buildIosVoipApnsPayload({
      action,
      callInviteId: invite.id,
      callerName: toText(caller?.display_name) || "Chi'llywood caller",
      callType: invite.call_type,
      expiresAt: invite.expires_at,
      threadId: invite.thread_id,
    }) as JsonObject;
    // A zero APNs expiration prevents stale incoming-call pushes from being
    // stored and delivered after the caller has already stopped ringing.
    const expiration = 0;
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const tokenRow of tokens) {
      const dispatchKey = await sha256Hex(`ios_voip:${invite.id}:${tokenRow.id}:${action}`);
      let { data: attempt, error: attemptError } = await adminClient
        .from("voip_push_delivery_attempts")
        .insert({
          apns_environment: tokenRow.apns_environment,
          call_invite_id: invite.id,
          dispatch_key: dispatchKey,
          recipient_user_id: recipientUserId,
          status: "attempted",
          voip_push_token_id: tokenRow.id,
        })
        .select("id,attempt_count")
        .maybeSingle();
      if (attemptError?.code === "23505") {
        const { data: existingAttempt, error: existingAttemptError } = await adminClient
          .from("voip_push_delivery_attempts")
          .select("id,status,attempt_count,updated_at")
          .eq("dispatch_key", dispatchKey)
          .maybeSingle();
        if (existingAttemptError || !existingAttempt?.id) {
          failedCount += 1;
          continue;
        }

        const attemptCount = Number(existingAttempt.attempt_count ?? 1);
        const staleAttempted = existingAttempt.status === "attempted"
          && Date.parse(toText(existingAttempt.updated_at)) <= Date.now() - 15_000;
        const retryable = existingAttempt.status === "failed" || staleAttempted;
        if (!retryable || !Number.isInteger(attemptCount) || attemptCount >= 3) {
          skippedCount += 1;
          continue;
        }

        const { data: retryAttempt, error: retryError } = await adminClient
          .from("voip_push_delivery_attempts")
          .update({
            attempt_count: attemptCount + 1,
            error_code: null,
            provider_message_id: null,
            provider_status_code: null,
            status: "attempted",
          })
          .eq("id", existingAttempt.id)
          .eq("attempt_count", attemptCount)
          .eq("status", existingAttempt.status)
          .select("id,attempt_count")
          .maybeSingle();
        if (retryError || !retryAttempt?.id) {
          skippedCount += 1;
          continue;
        }
        attempt = retryAttempt;
        attemptError = null;
      }
      if (attemptError || !attempt) {
        failedCount += 1;
        continue;
      }

      const result = await sendVoipPush({
        apnsEnvironment: tokenRow.apns_environment,
        authorization,
        expiration,
        inviteId: invite.id,
        payload,
        token: tokenRow.token,
        topic,
      }).catch(() => ({
        ok: false,
        providerMessageId: null,
        reason: "apns_transport_error",
        status: 0,
      }));
      const status = result.ok ? "sent" : "failed";
      await adminClient
        .from("voip_push_delivery_attempts")
        .update({
          error_code: result.reason,
          provider_message_id: result.providerMessageId,
          provider_status_code: result.status >= 100 ? result.status : null,
          status,
        })
        .eq("id", attempt.id);

      if (result.ok) {
        sentCount += 1;
      } else {
        failedCount += 1;
        if (isApnsInvalidVoipTokenReason(result.reason)) {
          const revokedAt = new Date().toISOString();
          await adminClient
            .from("user_voip_push_tokens")
            .update({ enabled: false, revoked_at: revokedAt, updated_at: revokedAt })
            .eq("id", tokenRow.id);
        }
      }
    }

    return jsonResponse(200, {
      eligible: true,
      failedCount,
      reason: sentCount > 0 ? "sent" : failedCount > 0 ? "provider_failed" : "duplicate_prevented",
      sentCount,
      skippedCount,
      status: sentCount > 0 ? "sent" : failedCount > 0 ? "failed" : "skipped",
    });
  } catch {
    return jsonResponse(500, { error: "ios_voip_dispatch_error" });
  }
});
