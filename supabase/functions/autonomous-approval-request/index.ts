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

const toText = (value: unknown) => String(value ?? "").trim();

const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

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

const authenticateTrustedRequester = async (request: Request) => {
  const token = toText(request.headers.get("x-autonomous-approval-token"));
  if (!token) return false;
  const expectedHash = readRequiredEnv("AUTONOMOUS_APPROVAL_REQUEST_TOKEN_SHA256");
  const actualHash = await sha256Hex(token);
  return constantTimeEqual(actualHash, expectedHash);
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
  if (!safeStringArray(payload.allowed_write_scope).length) failures.push("allowed_write_scope_required");
  if (!safeStringArray(payload.forbidden_scope).length) failures.push("forbidden_scope_required");
  if (containsSecretLikeValue(payload)) failures.push("secret_like_payload_blocked");
  const expiresAt = Date.parse(toText(payload.expires_at));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) failures.push("expires_at_must_be_future");
  return failures;
};

const createAdminClient = (): SupabaseClientLike => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const insertApprovalEvent = async (
  client: SupabaseClientLike,
  input: {
    actorType: string;
    eventSummary: string;
    eventType: string;
    metadata?: JsonObject;
    requestId: string;
  },
) => client.from("autonomous_approval_request_events").insert({
  actor_type: input.actorType,
  event_summary: input.eventSummary,
  event_type: input.eventType,
  metadata: safeMetadata(input.metadata),
  request_id: input.requestId,
});

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

  if (action === "approve_request" || action === "deny_request") {
    return jsonResponse(409, {
      error: "owner_approval_execution_foundation_only",
      ownerApprovalBacking: "explicit_owner_super_admin_backing_incomplete",
      platformRoleTruth: "platform_role_memberships",
      rachiCanApprove: false,
      operatorSelfApprovalAllowed: false,
    });
  }

  const trusted = await authenticateTrustedRequester(request);
  if (!trusted) return jsonResponse(401, { error: "autonomous_approval_token_required" });

  const client = createAdminClient();

  if (action === "create_request") {
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
      requested_by_actor_id: toText(payload.requested_by_actor_id) || null,
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
      eventType: "created",
      metadata: { system_id: insertPayload.system_id, action_id: insertPayload.action_id },
      requestId: data.id,
    });

    return jsonResponse(200, { ok: true, request: data });
  }

  if (action === "read_pending") {
    const { data, error } = await client
      .from("autonomous_approval_requests")
      .select("id,system_id,action_id,approval_level,status,title,risk_summary,proposed_action,rollback_plan,kill_switch_plan,proof_plan,validation_plan,expires_at,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return jsonResponse(500, { error: "read_pending_failed" });
    return jsonResponse(200, { ok: true, approvalExecutionStatus: "foundation_only", requests: data ?? [] });
  }

  if (action === "cancel_request") {
    const requestId = toText(body.request_id);
    if (!requestId) return jsonResponse(400, { error: "request_id_required" });
    const { data, error } = await client
      .from("autonomous_approval_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id,status")
      .single();
    if (error) return jsonResponse(500, { error: "cancel_request_failed" });
    await insertApprovalEvent(client, {
      actorType: "operator",
      eventSummary: "Autonomous approval request cancelled by trusted requester.",
      eventType: "cancelled",
      requestId,
    });
    return jsonResponse(200, { ok: true, request: data });
  }

  if (action === "expire_old_requests") {
    const { data, error } = await client
      .from("autonomous_approval_requests")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString())
      .select("id,status");
    if (error) return jsonResponse(500, { error: "expire_old_requests_failed" });
    return jsonResponse(200, { ok: true, expiredCount: Array.isArray(data) ? data.length : 0 });
  }

  if (action === "mark_executed") {
    return jsonResponse(409, {
      error: "execution_requires_live_owner_approval_backing",
      executionRequiresFreshPreflight: true,
      approvalExecutionStatus: "foundation_only",
    });
  }

  return jsonResponse(400, { error: "unknown_action" });
});
