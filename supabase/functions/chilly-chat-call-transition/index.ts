import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;
type TransitionStatus = "accepted" | "declined" | "missed" | "canceled" | "ended" | "busy";

type TransitionPayload = {
  durationSeconds?: unknown;
  inviteId?: unknown;
  invite_id?: unknown;
  status?: unknown;
};

type TransitionResult = {
  idempotent?: unknown;
  invite?: JsonObject;
  delivery?: {
    id?: unknown;
    action?: unknown;
    status?: unknown;
    attemptCount?: unknown;
    result?: unknown;
  };
};

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;
const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" } as const;
const FINAL_DELIVERY_STATUSES = new Set(["sent", "created", "skipped", "blocked", "disabled"]);
const VALID_STATUSES = new Set<TransitionStatus>([
  "accepted",
  "declined",
  "missed",
  "canceled",
  "ended",
  "busy",
]);

const toText = (value: unknown) => String(value ?? "").trim();
const jsonResponse = (status: number, body: JsonObject) => (
  new Response(JSON.stringify(body), { headers: JSON_HEADERS, status })
);
const optionsResponse = () => new Response("ok", { headers: CORS_HEADERS, status: 200 });
const requiredEnv = (name: string) => {
  const value = toText(Deno.env.get(name));
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};
const safeErrorReason = (error: unknown) => {
  const raw = error instanceof Error ? error.message : toText(error);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer_[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/gu, "[redacted]")
    .replace(/[^A-Za-z0-9_.:-]/gu, "_")
    .slice(0, 180) || "call_transition_failed";
};

const parseBody = async (req: Request): Promise<TransitionPayload | null> => {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as TransitionPayload
      : null;
  } catch {
    return null;
  }
};

const parseDuration = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
};

const sanitizeDispatchResponse = (value: unknown) => {
  const payload = value && typeof value === "object" ? value as JsonObject : {};
  const result = payload.result && typeof payload.result === "object" ? payload.result as JsonObject : {};
  const channels = payload.channels && typeof payload.channels === "object" ? payload.channels as JsonObject : {};
  const sanitizeChannel = (input: unknown) => {
    const channel = input && typeof input === "object" ? input as JsonObject : {};
    const safeCount = (count: unknown) => Number.isInteger(Number(count)) && Number(count) >= 0 ? Number(count) : 0;
    return {
      eligible: channel.eligible === true,
      attempted: channel.attempted === true,
      notificationCreated: channel.notificationCreated === true,
      pushSent: channel.pushSent === true,
      sentCount: safeCount(channel.sentCount),
      failedCount: safeCount(channel.failedCount),
      skippedCount: safeCount(channel.skippedCount),
      reason: toText(channel.reason).slice(0, 120) || "unknown",
      status: toText(channel.status).slice(0, 32) || "unknown",
    };
  };
  return {
    eligible: payload.eligible === true,
    result: {
      notificationCreated: result.notificationCreated === true,
      pushSent: result.pushSent === true,
      reason: toText(result.reason).slice(0, 120) || "unknown",
      status: toText(result.status).slice(0, 32) || "unknown",
    },
    channels: {
      androidNative: sanitizeChannel(channels.androidNative),
      iosVoip: sanitizeChannel(channels.iosVoip),
      ordinaryPush: sanitizeChannel(channels.ordinaryPush),
      inAppNotification: sanitizeChannel(channels.inAppNotification),
    },
  };
};

const hydrateInviteMediaProvider = async (
  adminClient: SupabaseClientLike,
  invite: JsonObject | null | undefined,
) => {
  const inviteId = toText(invite?.id);
  if (!inviteId) return invite ?? null;
  const { data, error } = await adminClient
    .from("chat_call_invites")
    .select("chat_call_media_provider")
    .eq("id", inviteId)
    .maybeSingle();
  if (error || !data) return invite ?? null;
  const providerRow = data as JsonObject;
  return {
    ...(invite ?? {}),
    chatCallMediaProvider: toText(providerRow.chat_call_media_provider) === "livekit"
      ? "livekit"
      : "legacy_webrtc",
  };
};

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const authorization = req.headers.get("authorization") ?? "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return jsonResponse(401, { error: "missing_authorization" });
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const actorUserId = toText(authData.user?.id);
    if (authError || !actorUserId) return jsonResponse(401, { error: "unauthenticated" });

    const body = await parseBody(req);
    if (!body) return jsonResponse(400, { error: "invalid_json_body" });
    const inviteId = toText(body.inviteId ?? body.invite_id);
    const status = toText(body.status).toLowerCase() as TransitionStatus;
    const durationSeconds = parseDuration(body.durationSeconds);
    if (!inviteId) return jsonResponse(400, { error: "missing_invite_id" });
    if (!VALID_STATUSES.has(status)) return jsonResponse(400, { error: "invalid_status" });
    if (Number.isNaN(durationSeconds)) return jsonResponse(400, { error: "invalid_duration" });

    const adminClient = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { data: transitionData, error: transitionError } = await adminClient.rpc(
      "transition_chilly_chat_call_invite",
      {
        p_actor_user_id: actorUserId,
        p_duration_seconds: durationSeconds,
        p_invite_id: inviteId,
        p_target_status: status,
      },
    );
    if (transitionError || !transitionData) {
      const reason = safeErrorReason(transitionError?.message ?? "transition_failed");
      const forbidden = /forbidden|participant|membership/iu.test(reason);
      const notFound = /not_found/iu.test(reason);
      return jsonResponse(notFound ? 404 : forbidden ? 403 : 409, {
        error: reason,
        retryable: false,
      });
    }

    const transition = transitionData as TransitionResult;
    const hydratedInvite = await hydrateInviteMediaProvider(adminClient, transition.invite);
    const delivery = transition.delivery ?? {};
    const deliveryId = toText(delivery.id);
    const action = toText(delivery.action);
    const currentDeliveryStatus = toText(delivery.status).toLowerCase();
    if (!deliveryId || !action || FINAL_DELIVERY_STATUSES.has(currentDeliveryStatus)) {
      return jsonResponse(200, {
        idempotent: transition.idempotent === true,
        invite: hydratedInvite,
        delivery,
      });
    }

    const { data: claim, error: claimError } = await adminClient.rpc(
      "claim_chilly_chat_call_transition_delivery",
      { p_delivery_id: deliveryId },
    );
    if (claimError) throw new Error(`delivery_claim_failed:${claimError.message}`);
    if (!claim) {
      const { data: latestDelivery } = await adminClient
        .from("chat_call_transition_deliveries")
        .select("id,dispatch_action,delivery_status,attempt_count,delivery_result")
        .eq("id", deliveryId)
        .maybeSingle();
      return jsonResponse(200, {
        idempotent: true,
        invite: hydratedInvite,
        delivery: latestDelivery ?? delivery,
      });
    }

    const dispatchResponse = await fetch(`${supabaseUrl}/functions/v1/chilly-chat-call-dispatch`, {
      body: JSON.stringify({ action, inviteId }),
      headers: {
        Authorization: authorization,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const rawDispatch = await dispatchResponse.json().catch(() => ({}));
    const safeDispatch = sanitizeDispatchResponse(rawDispatch);
    const finalStatus = dispatchResponse.ok
      ? toText(safeDispatch.result.status).toLowerCase() || "failed"
      : "failed";
    const allowedFinalStatus = FINAL_DELIVERY_STATUSES.has(finalStatus) || finalStatus === "failed"
      ? finalStatus
      : "failed";
    const completedAt = allowedFinalStatus === "failed" ? null : new Date().toISOString();
    const { error: completionError } = await adminClient
      .from("chat_call_transition_deliveries")
      .update({
        completed_at: completedAt,
        delivery_result: safeDispatch,
        delivery_status: allowedFinalStatus,
      })
      .eq("id", deliveryId)
      .eq("delivery_status", "dispatching");
    if (completionError) throw new Error(`delivery_record_failed:${completionError.message}`);

    return jsonResponse(dispatchResponse.ok ? 200 : 502, {
      idempotent: transition.idempotent === true,
      invite: hydratedInvite,
      delivery: {
        id: deliveryId,
        action,
        status: allowedFinalStatus,
        attemptCount: (claim as { attemptCount?: unknown }).attemptCount ?? null,
        result: safeDispatch,
      },
      retryable: !dispatchResponse.ok,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: safeErrorReason(error),
      retryable: true,
    });
  }
});
