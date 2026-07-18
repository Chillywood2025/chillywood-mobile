import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";

type JsonObject = Record<string, unknown>;
type ClaimedDelivery = {
  deliveryId?: unknown;
  inviteId?: unknown;
  actorUserId?: unknown;
  action?: unknown;
  attemptCount?: unknown;
};

const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const FINAL_STATUSES = new Set(["sent", "created", "skipped", "blocked", "disabled"]);
const toText = (value: unknown) => String(value ?? "").trim();
const jsonResponse = (status: number, body: JsonObject) => (
  new Response(JSON.stringify(body), { headers: JSON_HEADERS, status })
);
const requiredEnv = (name: string) => {
  const value = toText(Deno.env.get(name));
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};
const safeCount = (value: unknown) => {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
};
const safeReason = (value: unknown) => toText(value)
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer_[redacted]")
  .replace(/[A-Za-z0-9._~+/=-]{48,}/gu, "[redacted]")
  .replace(/[^A-Za-z0-9_.:-]/gu, "_")
  .slice(0, 120) || "terminal_delivery_failed";

const sanitizeDispatchResponse = (value: unknown) => {
  const payload = value && typeof value === "object" ? value as JsonObject : {};
  const result = payload.result && typeof payload.result === "object" ? payload.result as JsonObject : {};
  const channels = payload.channels && typeof payload.channels === "object" ? payload.channels as JsonObject : {};
  const sanitizeChannel = (input: unknown) => {
    const channel = input && typeof input === "object" ? input as JsonObject : {};
    return {
      eligible: channel.eligible === true,
      attempted: channel.attempted === true,
      notificationCreated: channel.notificationCreated === true,
      pushSent: channel.pushSent === true,
      sentCount: safeCount(channel.sentCount),
      failedCount: safeCount(channel.failedCount),
      skippedCount: safeCount(channel.skippedCount),
      reason: safeReason(channel.reason),
      status: safeReason(channel.status).slice(0, 32),
    };
  };
  return {
    eligible: payload.eligible === true,
    result: {
      notificationCreated: result.notificationCreated === true,
      pushSent: result.pushSent === true,
      reason: safeReason(result.reason),
      status: safeReason(result.status).slice(0, 32),
    },
    channels: {
      androidNative: sanitizeChannel(channels.androidNative),
      iosVoip: sanitizeChannel(channels.iosVoip),
      ordinaryPush: sanitizeChannel(channels.ordinaryPush),
      inAppNotification: sanitizeChannel(channels.inAppNotification),
    },
  };
};

Deno.serve(async (req): Promise<Response> => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    const retryToken = toText(req.headers.get("x-chillywood-retry-token"));
    if (!retryToken) return jsonResponse(401, { error: "missing_retry_authorization" });

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: authorized, error: authorizationError } = await adminClient.rpc(
      "authorize_chilly_chat_call_transition_retry",
      { p_token: retryToken },
    );
    if (authorizationError || authorized !== true) {
      return jsonResponse(401, { error: "invalid_retry_authorization" });
    }

    const body = await req.json().catch(() => ({})) as JsonObject;
    const batchSize = Math.min(Math.max(safeCount(body.batchSize) || 10, 1), 10);
    const { data, error: claimError } = await adminClient.rpc(
      "claim_chilly_chat_call_transition_delivery_batch",
      { p_limit: batchSize },
    );
    if (claimError) throw new Error(`delivery_batch_claim_failed:${claimError.message}`);
    const deliveries = Array.isArray(data) ? data as ClaimedDelivery[] : [];

    let succeeded = 0;
    let failed = 0;
    let capped = 0;
    for (const delivery of deliveries) {
      const deliveryId = toText(delivery.deliveryId);
      const inviteId = toText(delivery.inviteId);
      const action = toText(delivery.action);
      if (!deliveryId || !inviteId || !action) continue;

      let safeDispatch: ReturnType<typeof sanitizeDispatchResponse>;
      let status = "failed";
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/chilly-chat-call-dispatch`, {
          body: JSON.stringify({ action, deliveryId, inviteId }),
          headers: {
            // The Vault-held retry token is the dedicated cross-function
            // credential. Do not use the database service-role key as an HTTP
            // bearer token; opaque service keys are not user JWTs and may be
            // rejected before the scoped delivery check can run.
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
            "Content-Type": "application/json",
            "x-chillywood-retry-token": retryToken,
          },
          method: "POST",
          signal: AbortSignal.timeout(12_000),
        });
        safeDispatch = sanitizeDispatchResponse(await response.json().catch(() => ({})));
        const responseStatus = toText(safeDispatch.result.status).toLowerCase();
        status = response.ok && (FINAL_STATUSES.has(responseStatus) || responseStatus === "failed")
          ? responseStatus
          : "failed";
      } catch (error) {
        safeDispatch = sanitizeDispatchResponse({
          eligible: false,
          result: { reason: safeReason(error), status: "failed" },
        });
      }

      const { data: completion, error: completionError } = await adminClient.rpc(
        "complete_chilly_chat_call_transition_delivery",
        { p_delivery_id: deliveryId, p_result: safeDispatch, p_status: status },
      );
      if (completionError) throw new Error(`delivery_completion_failed:${completionError.message}`);
      if (status === "failed") failed += 1;
      else succeeded += 1;
      if ((completion as { capped?: unknown } | null)?.capped === true) capped += 1;
    }

    return jsonResponse(200, {
      capped,
      claimed: deliveries.length,
      failed,
      status: failed > 0 ? "retry_pending" : "ok",
      succeeded,
    });
  } catch (error) {
    return jsonResponse(500, { error: safeReason(error), status: "failed" });
  }
});
