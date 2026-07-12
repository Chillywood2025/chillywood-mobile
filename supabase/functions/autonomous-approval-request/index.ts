import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-autonomous-approval-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const SECRET_PATTERN = /(secret|token|password|authorization|service[_-]?role|participant[_-]?token|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url)/i;

const ALLOWED_SYSTEM_IDS = [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
  "observability_runtime_operator",
  "owner_command_operator",
] as const;

const ALLOWED_REQUESTER_ACTOR_TYPES = [
  "admin",
  "moderator",
  "operator",
  "owner",
  "rachi",
  "super_admin",
  ...ALLOWED_SYSTEM_IDS,
] as const;

const toText = (value: unknown) => String(value ?? "").trim();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toUuidOrNull = (value: unknown) => {
  const text = toText(value);
  return UUID_PATTERN.test(text) ? text : null;
};

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const readOptionalEnv = (key: string) => toText(Deno.env.get(key));

const sha256Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const constantTimeEqual = (left: string, right: string) => {
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  let diff = leftText.length ^ rightText.length;
  const maxLength = Math.max(leftText.length, rightText.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }
  return diff === 0;
};

const createAdminClient = (): SupabaseClientLike => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const authenticateTrustedRequester = async (request: Request) => {
  const token = toText(request.headers.get("x-autonomous-approval-token"));
  if (!token) return false;
  const expectedHash = readOptionalEnv("AUTONOMOUS_APPROVAL_REQUEST_TOKEN_SHA256");
  const opsApprovalToken = readOptionalEnv("OPS_APPROVAL_TOKEN");
  const actualHash = await sha256Hex(token);
  const hashMatches = expectedHash ? constantTimeEqual(actualHash, expectedHash) : false;
  const opsApprovalMatches = opsApprovalToken ? constantTimeEqual(token, opsApprovalToken) : false;
  return hashMatches || opsApprovalMatches;
};

const readBearerToken = (request: Request) => {
  const authorization = toText(request.headers.get("authorization"));
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const redactText = (value: unknown) => String(value ?? "").replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]");

const containsSecretLikeValue = (value: unknown): boolean => {
  if (typeof value === "string") return SECRET_PATTERN.test(value) || /[A-Za-z0-9._~+/=-]{48,}/.test(value);
  if (Array.isArray(value)) return value.some(containsSecretLikeValue);
  if (value && typeof value === "object") {
    return Object.entries(value as JsonObject).some(([key, entry]) => SECRET_PATTERN.test(key) || containsSecretLikeValue(entry));
  }
  return false;
};

const safeMetadata = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .filter(([key, entry]) => !SECRET_PATTERN.test(key) && !containsSecretLikeValue(entry))
      .slice(0, 48)
      .map(([key, entry]) => [key, typeof entry === "string" ? redactText(entry) : entry]),
  );
};

const safeStringArray = (value: unknown) => (
  Array.isArray(value)
    ? value.map((entry) => redactText(entry)).filter(Boolean).slice(0, 32)
    : []
);

const validateRequestPayload = (payload: JsonObject) => {
  const failures: string[] = [];
  const approvalLevel = Number(payload.approval_level ?? payload.approvalLevel);
  const requiredTextFields = [
    "system_id",
    "action_id",
    "requested_by_actor_type",
    "title",
    "reason",
    "risk_summary",
    "proposed_action",
    "rollback_plan",
    "kill_switch_plan",
    "proof_plan",
    "validation_plan",
    "expires_at",
  ];

  if (approvalLevel !== 3 && approvalLevel !== 4) failures.push("approval_level_must_be_3_or_4");
  for (const field of requiredTextFields) {
    if (!toText(payload[field])) failures.push(`${field}_required`);
  }
  if (!ALLOWED_SYSTEM_IDS.includes(toText(payload.system_id) as typeof ALLOWED_SYSTEM_IDS[number])) failures.push("unknown_system_id");
  if (!ALLOWED_REQUESTER_ACTOR_TYPES.includes(toText(payload.requested_by_actor_type) as typeof ALLOWED_REQUESTER_ACTOR_TYPES[number])) {
    failures.push("unknown_requested_by_actor_type");
  }
  if (!safeStringArray(payload.allowed_write_scope).length) failures.push("allowed_write_scope_required");
  if (!safeStringArray(payload.forbidden_scope).length) failures.push("forbidden_scope_required");
  if (containsSecretLikeValue(payload)) failures.push("secret_like_payload_blocked");
  const expiresAt = Date.parse(toText(payload.expires_at));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) failures.push("expires_at_must_be_future");
  return failures;
};

const insertApprovalEvent = async (
  client: SupabaseClientLike,
  input: {
    actorId?: string | null;
    actorType: string;
    eventSummary: string;
    eventType: string;
    metadata?: JsonObject;
    requestId: string;
  },
) => client.from("autonomous_approval_request_events").insert({
  actor_id: input.actorId ?? null,
  actor_type: input.actorType,
  event_summary: input.eventSummary,
  event_type: input.eventType,
  metadata: safeMetadata(input.metadata),
  request_id: input.requestId,
});

const authorizeOwnerOrSuperAdmin = async (request: Request, client: SupabaseClientLike) => {
  const bearer = readBearerToken(request);
  if (!bearer) return { ok: false as const, error: "owner_authorization_required" };

  const { data: userData, error: userError } = await client.auth.getUser(bearer);
  const user = userData?.user;
  if (userError || !user?.id) return { ok: false as const, error: "owner_authorization_invalid" };

  const userId = user.id;
  const email = toText(user.email).toLowerCase();

  const userRows = await client
    .from("platform_role_memberships")
    .select("role,status")
    .eq("status", "active")
    .in("role", ["owner", "super_admin"])
    .eq("user_id", userId)
    .limit(1);

  let role = toText(userRows.data?.[0]?.role);
  if (!role && email) {
    const emailRows = await client
      .from("platform_role_memberships")
      .select("role,status")
      .eq("status", "active")
      .in("role", ["owner", "super_admin"])
      .eq("email", email)
      .limit(1);
    role = toText(emailRows.data?.[0]?.role);
  }

  if (role !== "owner" && role !== "super_admin") {
    return { ok: false as const, error: "owner_or_super_admin_required", userId };
  }

  return { ok: true as const, role, userId };
};

const readRequests = async (client: SupabaseClientLike, status = "pending", requestId?: string) => {
  let query = client
    .from("autonomous_approval_requests")
    .select("id,system_id,action_id,requested_by_actor_type,requested_by_actor_id,approval_level,status,title,reason,risk_summary,proposed_action,allowed_write_scope,forbidden_scope,rollback_plan,kill_switch_plan,proof_plan,validation_plan,expires_at,approved_by,approved_at,denied_by,denied_at,denial_reason,execution_result,metadata,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (requestId) query = query.eq("id", requestId).limit(1);
  else if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new Error("read_requests_failed");

  const ids = (data ?? []).map((row: { id: string }) => row.id);
  if (!ids.length) return [];

  const events = await client
    .from("autonomous_approval_request_events")
    .select("id,request_id,event_type,actor_type,actor_id,event_summary,metadata,created_at")
    .in("request_id", ids)
    .order("created_at", { ascending: true });

  const eventsByRequest = new Map<string, unknown[]>();
  for (const event of events.data ?? []) {
    const requestEvents = eventsByRequest.get(event.request_id) ?? [];
    requestEvents.push(event);
    eventsByRequest.set(event.request_id, requestEvents);
  }

  return (data ?? []).map((row: { id: string }) => ({
    ...row,
    events: eventsByRequest.get(row.id) ?? [],
  }));
};

const requireTrusted = (trusted: boolean) => (
  trusted ? null : jsonResponse(401, { error: "autonomous_approval_token_required" })
);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  let body: JsonObject;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const action = toText(body.action);
  const trusted = await authenticateTrustedRequester(request);
  const client = createAdminClient();

  if (action === "create_request") {
    const trustedFailure = requireTrusted(trusted);
    if (trustedFailure) return trustedFailure;

    const payload = (body.request && typeof body.request === "object" ? body.request : body) as JsonObject;
    const failures = validateRequestPayload(payload);
    if (failures.length) return jsonResponse(422, { error: "invalid_approval_request", failures });

    const insertPayload = {
      action_id: toText(payload.action_id),
      allowed_write_scope: safeStringArray(payload.allowed_write_scope),
      approval_level: Number(payload.approval_level ?? payload.approvalLevel),
      expires_at: toText(payload.expires_at),
      forbidden_scope: safeStringArray(payload.forbidden_scope),
      kill_switch_plan: redactText(payload.kill_switch_plan),
      metadata: safeMetadata(payload.metadata),
      proof_plan: redactText(payload.proof_plan),
      proposed_action: redactText(payload.proposed_action),
      reason: redactText(payload.reason),
      requested_by_actor_id: toUuidOrNull(payload.requested_by_actor_id),
      requested_by_actor_type: toText(payload.requested_by_actor_type),
      risk_summary: redactText(payload.risk_summary),
      rollback_plan: redactText(payload.rollback_plan),
      status: "pending",
      system_id: toText(payload.system_id),
      title: redactText(payload.title),
      validation_plan: redactText(payload.validation_plan),
    };

    const { data, error } = await client
      .from("autonomous_approval_requests")
      .insert(insertPayload)
      .select("id,status,system_id,action_id,approval_level,expires_at")
      .single();

    if (error) return jsonResponse(500, { error: "create_request_failed" });

    await insertApprovalEvent(client, {
      actorType: insertPayload.requested_by_actor_type,
      eventSummary: "Autonomous Level 3/4 approval request created.",
      eventType: "requested",
      metadata: { system_id: insertPayload.system_id, action_id: insertPayload.action_id },
      requestId: data.id,
    });

    return jsonResponse(200, { ok: true, request: data });
  }

  if (action === "list_pending" || action === "read_pending" || action === "get_request" || action === "system_status") {
    const owner = trusted ? null : await authorizeOwnerOrSuperAdmin(request, client);
    if (owner && !owner.ok) return jsonResponse(403, { error: owner.error });

    if (action === "system_status") {
      const { data, error } = await client
        .from("autonomous_system_emergency_states")
        .select("system_id,status,reason,updated_at,metadata")
        .order("system_id", { ascending: true });
      if (error) return jsonResponse(500, { error: "system_status_failed" });
      return jsonResponse(200, { ok: true, approvalExecutionStatus: "live_owner_super_admin_backed", states: data ?? [] });
    }

    try {
      const requests = await readRequests(
        client,
        toText(body.status) || "pending",
        action === "get_request" ? toText(body.request_id) : undefined,
      );
      return jsonResponse(200, {
        ok: true,
        approvalExecutionStatus: "live_owner_super_admin_backed",
        requests,
      });
    } catch {
      return jsonResponse(500, { error: "read_pending_failed" });
    }
  }

  if (action === "approve_request") {
    const owner = await authorizeOwnerOrSuperAdmin(request, client);
    if (!owner.ok) return jsonResponse(403, { error: owner.error });

    const requestId = toText(body.request_id);
    if (!requestId) return jsonResponse(400, { error: "request_id_required" });
    if (containsSecretLikeValue(body.metadata)) return jsonResponse(422, { error: "secret_like_payload_blocked" });

    const rows = await readRequests(client, "", requestId);
    const current = rows[0] as JsonObject | undefined;
    if (!current) return jsonResponse(404, { error: "request_not_found" });
    if (current.status !== "pending") return jsonResponse(409, { error: "request_not_pending" });
    if (Date.parse(toText(current.expires_at)) <= Date.now()) {
      await client.from("autonomous_approval_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", requestId);
      await insertApprovalEvent(client, {
        actorId: owner.userId,
        actorType: owner.role,
        eventSummary: "Autonomous approval request expired during review.",
        eventType: "expired",
        requestId,
      });
      return jsonResponse(409, { error: "request_expired" });
    }
    if (toText(current.requested_by_actor_id) && toText(current.requested_by_actor_id) === owner.userId) {
      return jsonResponse(403, { error: "self_approval_denied" });
    }

    const { data, error } = await client
      .from("autonomous_approval_requests")
      .update({
        approved_at: new Date().toISOString(),
        approved_by: owner.userId,
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id,status,system_id,action_id,approval_level,approved_at")
      .single();
    if (error) return jsonResponse(500, { error: "approve_request_failed" });

    await insertApprovalEvent(client, {
      actorId: owner.userId,
      actorType: owner.role,
      eventSummary: "Owner/super-admin approved autonomous Level 3/4 request. Fresh preflight is still required before execution.",
      eventType: "approved",
      metadata: { executionRequiresFreshPreflight: true },
      requestId,
    });

    return jsonResponse(200, { ok: true, request: data });
  }

  if (action === "deny_request") {
    const owner = await authorizeOwnerOrSuperAdmin(request, client);
    if (!owner.ok) return jsonResponse(403, { error: owner.error });

    const requestId = toText(body.request_id);
    const denialReason = toText(body.denial_reason || body.reason);
    if (!requestId) return jsonResponse(400, { error: "request_id_required" });
    if (!denialReason) return jsonResponse(400, { error: "denial_reason_required" });

    const rows = await readRequests(client, "", requestId);
    const current = rows[0] as JsonObject | undefined;
    if (!current) return jsonResponse(404, { error: "request_not_found" });
    if (current.status !== "pending") return jsonResponse(409, { error: "request_not_pending" });
    if (toText(current.requested_by_actor_id) && toText(current.requested_by_actor_id) === owner.userId) {
      return jsonResponse(403, { error: "self_denial_denied" });
    }

    const { data, error } = await client
      .from("autonomous_approval_requests")
      .update({
        denial_reason: redactText(denialReason).slice(0, 2000),
        denied_at: new Date().toISOString(),
        denied_by: owner.userId,
        status: "denied",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id,status,system_id,action_id,approval_level,denied_at")
      .single();
    if (error) return jsonResponse(500, { error: "deny_request_failed" });

    await insertApprovalEvent(client, {
      actorId: owner.userId,
      actorType: owner.role,
      eventSummary: "Owner/super-admin denied autonomous approval request.",
      eventType: "denied",
      metadata: { reason: redactText(denialReason).slice(0, 2000) },
      requestId,
    });

    return jsonResponse(200, { ok: true, request: data });
  }

  if (action === "cancel_request") {
    const owner = trusted ? null : await authorizeOwnerOrSuperAdmin(request, client);
    if (owner && !owner.ok) return jsonResponse(403, { error: owner.error });
    if (!trusted && !owner?.ok) return jsonResponse(401, { error: "autonomous_approval_token_or_owner_required" });

    const requestId = toText(body.request_id);
    if (!requestId) return jsonResponse(400, { error: "request_id_required" });
    const actorType = owner?.ok ? owner.role : "operator";
    const actorId = owner?.ok ? owner.userId : null;

    const { data, error } = await client
      .from("autonomous_approval_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id,status")
      .single();
    if (error) return jsonResponse(500, { error: "cancel_request_failed" });
    await insertApprovalEvent(client, {
      actorId,
      actorType,
      eventSummary: "Autonomous approval request cancelled.",
      eventType: "cancelled",
      requestId,
    });
    return jsonResponse(200, { ok: true, request: data });
  }

  if (action === "mark_preflight_result") {
    const trustedFailure = requireTrusted(trusted);
    if (trustedFailure) return trustedFailure;
    const requestId = toText(body.request_id);
    if (!requestId) return jsonResponse(400, { error: "request_id_required" });
    const { data, error } = await client.rpc("mark_autonomous_approval_preflight_result", {
      p_metadata: safeMetadata(body.metadata),
      p_passed: body.passed === true,
      p_request_id: requestId,
      p_summary: redactText(body.summary || (body.passed === true ? "Fresh preflight passed." : "Fresh preflight failed.")),
    });
    if (error) return jsonResponse(409, { error: "mark_preflight_result_failed" });
    return jsonResponse(200, { ok: true, request: data });
  }

  if (action === "mark_executed") {
    const trustedFailure = requireTrusted(trusted);
    if (trustedFailure) return trustedFailure;
    const requestId = toText(body.request_id);
    if (!requestId) return jsonResponse(400, { error: "request_id_required" });
    const { data, error } = await client.rpc("mark_autonomous_approval_request_executed", {
      p_action_id: toText(body.action_id),
      p_execution_result: redactText(body.execution_result || "Approved autonomous action completed."),
      p_metadata: safeMetadata(body.metadata),
      p_request_id: requestId,
      p_system_id: toText(body.system_id),
    });
    if (error) return jsonResponse(409, { error: "mark_executed_failed" });
    return jsonResponse(200, { ok: true, request: data });
  }

  if (action === "expire_old_requests") {
    const trustedFailure = requireTrusted(trusted);
    if (trustedFailure) return trustedFailure;
    const { data, error } = await client.rpc("expire_autonomous_approval_requests");
    if (error) return jsonResponse(500, { error: "expire_old_requests_failed" });
    return jsonResponse(200, { ok: true, expiredCount: Number(data ?? 0) });
  }

  if (action === "emergency_pause_system" || action === "resume_system") {
    const owner = await authorizeOwnerOrSuperAdmin(request, client);
    if (!owner.ok) return jsonResponse(403, { error: owner.error });
    const systemId = toText(body.system_id);
    const reason = toText(body.reason) || (action === "resume_system" ? "Owner/super-admin resumed autonomous system." : "Owner/super-admin paused autonomous system.");
    const status = action === "resume_system" ? "active" : toText(body.status) === "paused" ? "paused" : "emergency_stop";
    if (!ALLOWED_SYSTEM_IDS.includes(systemId as typeof ALLOWED_SYSTEM_IDS[number])) return jsonResponse(400, { error: "unknown_system_id" });
    if (containsSecretLikeValue(body.metadata)) return jsonResponse(422, { error: "secret_like_payload_blocked" });

    const { data, error } = await client
      .from("autonomous_system_emergency_states")
      .upsert({
        metadata: safeMetadata(body.metadata),
        reason: redactText(reason).slice(0, 2000),
        status,
        system_id: systemId,
        updated_at: new Date().toISOString(),
        updated_by: owner.userId,
      }, { onConflict: "system_id" })
      .select("system_id,status,reason,updated_at,metadata")
      .single();
    if (error) return jsonResponse(500, { error: "system_state_update_failed" });

    await client.from("autonomous_system_control_events").insert({
      actor_id: owner.userId,
      actor_role: owner.role,
      event_summary: status === "active"
        ? "Owner/super-admin resumed autonomous system."
        : status === "paused"
          ? "Owner/super-admin paused autonomous system."
          : "Owner/super-admin put autonomous system into emergency stop.",
      event_type: status === "active" ? "resumed" : status === "paused" ? "paused" : "emergency_paused",
      metadata: { reason: redactText(reason).slice(0, 2000) },
      system_id: systemId,
    });

    return jsonResponse(200, { ok: true, state: data });
  }

  return jsonResponse(400, { error: "unknown_action" });
});
