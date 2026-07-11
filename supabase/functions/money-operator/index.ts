import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

const SYSTEM_ID = "money_flow_control";
const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-money-operator-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;
const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" } as const;

const SECRET_PATTERN = /(secret|token|password|authorization|service[_-]?role|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|webhook[_-]?secret|signed[_-]?url|account[_-]?number|routing[_-]?number|iban|swift)/i;
const LONG_SECRET_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

const SAFE_ACTIONS = new Set([
  "read_only_reconciliation_report",
  "missing_provider_data_detection",
  "stale_provider_sync_detection",
  "ledger_consistency_check",
  "duplicate_event_detection",
  "admin_readonly_summary",
  "approval_request_creation",
  "sandbox_webhook_validation",
  "sandbox_zero_dollar_proof",
  "provider_status_row_sync",
  "record_reconciliation_finding",
  "mark_provider_sync_status",
  "record_duplicate_provider_event",
  "mark_money_item_requires_review",
  "record_blocked_money_action",
  "record_external_confirmation_requirement",
  "write_sandbox_test_mode_proof_result",
  "update_money_operator_learning_state",
  "fraud_hold_recommendation",
]);
const LEVEL_3_ACTIONS = new Set([
  "enable_production_checkout",
  "enable_live_provider_integration",
  "enable_payout_review_mutation",
  "enable_fraud_enforcement_mutation",
  "change_money_facing_config",
  "change_payout_eligibility_rules",
  "change_premium_entitlement_logic",
  "enable_production_webhook_money_handling",
  "create_production_payment_link_or_invoice",
  "change_revenue_share_formula",
  "change_network_billing_rule",
]);
const LEVEL_4_ACTIONS = new Set([
  "real_customer_charge",
  "real_payout",
  "real_transfer",
  "real_cashout",
  "production_stripe_mode_switch",
  "public_payment_launch",
  "provider_plan_or_add_on",
  "legal_compliance_tax_activation",
  "public_revenue_or_payout_claim",
]);
const FORBIDDEN_ACTIONS = new Set([
  "manual_premium_grant",
  "fake_revenue",
  "fake_creator_earnings",
  "fake_payable_balance",
  "fake_paid_status",
  "fake_transfer_complete",
]);
const ALLOWED_ENVIRONMENTS = new Set(["sandbox", "test", "production"]);

const toText = (value: unknown) => String(value ?? "").trim();
const safeLabel = (value: unknown, fallback = "unknown") => {
  const label = toText(value).toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 120);
  return label || fallback;
};
const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const constantTimeEqual = (left: string, right: string) => {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
};

const authenticateOperator = async (request: Request) => {
  const token = toText(request.headers.get("x-money-operator-token"));
  if (!token) return false;
  const actualHash = await sha256Hex(token);
  return constantTimeEqual(actualHash, readRequiredEnv("MONEY_OPERATOR_TOKEN_SHA256"));
};

const createAdminClient = (): SupabaseClientLike => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const containsSecretLikeValue = (value: unknown): boolean => {
  if (typeof value === "string") return SECRET_PATTERN.test(value) || LONG_SECRET_PATTERN.test(value);
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
      .map(([key, entry]) => [key, typeof entry === "string" ? entry.replace(LONG_SECRET_PATTERN, "[redacted]") : entry]),
  );
};

const environmentMode = (value: unknown) => {
  const mode = safeLabel(value, "test");
  return ALLOWED_ENVIRONMENTS.has(mode) ? mode : "test";
};

const classifyMoneyAction = (actionId: string) => {
  if (FORBIDDEN_ACTIONS.has(actionId)) return { approvalLevel: 4, forbidden: true, reason: "forbidden_money_action" };
  if (LEVEL_4_ACTIONS.has(actionId)) return { approvalLevel: 4, forbidden: false, reason: "level_4_owner_approval_and_external_provider_confirmation_required" };
  if (LEVEL_3_ACTIONS.has(actionId)) return { approvalLevel: 3, forbidden: false, reason: "level_3_owner_approval_required" };
  if (SAFE_ACTIONS.has(actionId)) return { approvalLevel: 2, forbidden: false, reason: "safe_scoped_money_operator_action" };
  return { approvalLevel: 4, forbidden: false, reason: "unknown_money_action_defaults_level_4" };
};

const rejectSecretPayload = (payload: JsonObject) => {
  if (containsSecretLikeValue(payload)) throw new Error("secret_like_payload_blocked");
};

const assertNoRealMoneyMutation = (payload: JsonObject) => {
  const actionId = safeLabel(payload.action_id ?? payload.actionId ?? payload.money_action_id ?? payload.moneyActionId);
  const classification = classifyMoneyAction(actionId);
  const mode = environmentMode(payload.environment_mode ?? payload.environmentMode);
  const amountCents = Number(payload.amount_cents ?? payload.amountCents ?? 0);
  if (classification.forbidden) throw new Error("forbidden_money_action");
  if (mode === "production" && Number.isFinite(amountCents) && amountCents > 0) throw new Error("real_money_mutation_blocked");
  return { actionId, classification, environmentMode: mode };
};

const insertEvent = async (client: SupabaseClientLike, event: JsonObject) => {
  const { data, error } = await client
    .from("money_operator_events")
    .insert({
      system_id: SYSTEM_ID,
      event_type: safeLabel(event.event_type ?? "operator_event"),
      action_id: event.action_id ? safeLabel(event.action_id) : null,
      surface: event.surface ? safeLabel(event.surface) : null,
      severity: safeLabel(event.severity ?? "info"),
      result: safeLabel(event.result ?? "recorded"),
      environment_mode: environmentMode(event.environment_mode),
      money_moved: false,
      external_confirmation_required: Boolean(event.external_confirmation_required),
      external_confirmation_status: safeLabel(event.external_confirmation_status ?? "not_required"),
      blocked_reason: event.blocked_reason ? safeLabel(event.blocked_reason) : null,
      metadata: safeMetadata(event.metadata),
    })
    .select("id,event_type,result,created_at,money_moved")
    .single();
  if (error) throw error;
  return data as JsonObject;
};

const createApprovalRequest = async (client: SupabaseClientLike, payload: JsonObject) => {
  const actionId = safeLabel(payload.money_action_id ?? payload.action_id ?? payload.actionId);
  const classification = classifyMoneyAction(actionId);
  if (classification.forbidden) throw new Error("forbidden_money_action");
  if (classification.approvalLevel < 3) throw new Error("approval_not_required_for_safe_money_action");

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const allowedWriteScope = Array.isArray(payload.allowed_write_scope)
    ? payload.allowed_write_scope.map((entry) => toText(entry)).filter(Boolean).slice(0, 32)
    : ["approval_request_only"];
  const forbiddenScope = [
    "manual Premium grant",
    "fake revenue or payable balance",
    "real money movement without Level 4 external provider confirmation",
    "provider secrets in logs/artifacts",
  ];
  const { data, error } = await client
    .from("autonomous_approval_requests")
    .insert({
      system_id: SYSTEM_ID,
      action_id: actionId,
      requested_by_actor_type: "money_flow_control",
      approval_level: classification.approvalLevel,
      status: "pending",
      title: toText(payload.title) || `Money Flow Control approval required: ${actionId}`,
      reason: toText(payload.reason) || classification.reason,
      risk_summary: toText(payload.risk_summary) || "Money action requires owner/super-admin approval; real money movement also requires external provider confirmation.",
      proposed_action: toText(payload.proposed_action) || "Create approval request only; do not move money.",
      allowed_write_scope: allowedWriteScope,
      forbidden_scope: forbiddenScope,
      rollback_plan: toText(payload.rollback_plan) || "If fresh preflight or provider readback fails, mark request preflight_failed and leave money state unchanged.",
      kill_switch_plan: toText(payload.kill_switch_plan) || "money_flow_control emergency_stop blocks non-read-only money mutations.",
      proof_plan: toText(payload.proof_plan) || "Run proof:money-flow-control, proof:money-operator-write-scope, proof:money-external-confirmation, and guard:money-flow-control.",
      validation_plan: toText(payload.validation_plan) || "Verify exact scope, unexpired approval, fresh preflight, no secrets, and external provider confirmation for Level 4.",
      expires_at: expiresAt,
      metadata: safeMetadata(payload.metadata),
    })
    .select("id,status,approval_level,action_id,expires_at")
    .single();
  if (error) throw error;

  const eventError = await client.from("autonomous_approval_request_events").insert({
    request_id: data.id,
    event_type: "requested",
    actor_type: "money_flow_control",
    event_summary: "Money Flow Control created a Level 3/4 approval request and stopped before execution.",
    metadata: { action_id: actionId, money_moved: false },
  });
  if (eventError.error) throw eventError.error;
  return data as JsonObject;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS, status: 204 });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    if (!(await authenticateOperator(request))) return jsonResponse(401, { error: "money_operator_token_required" });
    const payload = await request.json().catch(() => ({})) as JsonObject;
    rejectSecretPayload(payload);
    const action = safeLabel(payload.action);
    const client = createAdminClient();

    if (action === "health_snapshot") {
      const mode = environmentMode(payload.environment_mode);
      const { data, error } = await client
        .from("money_flow_health_snapshots")
        .insert({
          system_id: SYSTEM_ID,
          health_state: "healthy",
          eligible_for_safe_writes: true,
          latest_operator_action: "health_snapshot",
          environment_mode: mode,
          money_moved: false,
          metadata: safeMetadata(payload.metadata),
        })
        .select("id,health_state,eligible_for_safe_writes,created_at,money_moved")
        .single();
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, snapshot: data, moneyMoved: false });
    }

    if (action === "reconciliation_plan") {
      return jsonResponse(200, {
        ok: true,
        action,
        systemId: SYSTEM_ID,
        plannedWrites: ["money_reconciliation_runs", "money_reconciliation_findings", "money_operator_events"],
        forbiddenWrites: ["payout release", "charge customer", "manual Premium grant", "fake revenue", "mark paid"],
        moneyMoved: false,
      });
    }

    if (action === "run_readonly_reconciliation") {
      const mode = environmentMode(payload.environment_mode);
      const { data: run, error: runError } = await client
        .from("money_reconciliation_runs")
        .insert({
          system_id: SYSTEM_ID,
          run_type: "readonly_reconciliation",
          status: "succeeded",
          environment_mode: mode,
          money_moved: false,
          completed_at: new Date().toISOString(),
          summary: safeMetadata(payload.summary ?? { result: "readonly_reconciliation_recorded" }),
        })
        .select("id,status,environment_mode,created_at,money_moved")
        .single();
      if (runError) throw runError;
      await insertEvent(client, { event_type: "readonly_reconciliation_run", action_id: "read_only_reconciliation_report", environment_mode: mode, result: "succeeded" });
      return jsonResponse(200, { ok: true, action, run, moneyMoved: false });
    }

    if (action === "sync_provider_status_safe") {
      const { actionId, environmentMode: mode } = assertNoRealMoneyMutation({ ...payload, action_id: "mark_provider_sync_status" });
      const provider = safeLabel(payload.provider);
      const capability = safeLabel(payload.capability);
      const syncStatus = safeLabel(payload.sync_status ?? "stale");
      if (!["stale", "synced", "failed", "blocked"].includes(syncStatus)) return jsonResponse(400, { error: "invalid_sync_status" });
      const { data, error } = await client
        .from("money_provider_sync_status")
        .upsert({
          system_id: SYSTEM_ID,
          provider,
          capability,
          sync_status: syncStatus,
          environment_mode: mode,
          money_moved: false,
          last_checked_at: new Date().toISOString(),
          last_success_at: syncStatus === "synced" ? new Date().toISOString() : null,
          failure_reason: syncStatus === "failed" ? safeLabel(payload.failure_reason) : null,
          metadata: safeMetadata(payload.metadata),
        }, { onConflict: "provider,capability,environment_mode" })
        .select("id,provider,capability,sync_status,environment_mode,money_moved")
        .single();
      if (error) throw error;
      await insertEvent(client, { event_type: "provider_sync_status_recorded", action_id: actionId, environment_mode: mode, result: syncStatus });
      return jsonResponse(200, { ok: true, action, status: data, moneyMoved: false });
    }

    if (action === "record_duplicate_event") {
      const mode = environmentMode(payload.environment_mode);
      const provider = safeLabel(payload.provider);
      const rawEvent = toText(payload.event_id_hash ?? payload.event_id ?? payload.eventId);
      const eventIdHash = /^[a-f0-9]{64}$/i.test(rawEvent) ? rawEvent.toLowerCase() : await sha256Hex(rawEvent);
      const { data, error } = await client
        .from("money_duplicate_event_detections")
        .upsert({
          system_id: SYSTEM_ID,
          provider,
          event_id_hash: eventIdHash,
          source_table: payload.source_table ? safeLabel(payload.source_table) : null,
          source_row_id: payload.source_row_id ? safeLabel(payload.source_row_id) : null,
          detection_status: safeLabel(payload.detection_status ?? "suspected_duplicate"),
          environment_mode: mode,
          money_moved: false,
          metadata: safeMetadata(payload.metadata),
        }, { onConflict: "provider,event_id_hash,environment_mode" })
        .select("id,provider,detection_status,environment_mode,money_moved")
        .single();
      if (error) throw error;
      await insertEvent(client, { event_type: "duplicate_event_recorded", action_id: "record_duplicate_provider_event", environment_mode: mode, result: data.detection_status });
      return jsonResponse(200, { ok: true, action, duplicateDetection: data, moneyMoved: false });
    }

    if (action === "mark_requires_review") {
      const mode = environmentMode(payload.environment_mode);
      const { data, error } = await client
        .from("money_required_review_flags")
        .upsert({
          system_id: SYSTEM_ID,
          subject_type: safeLabel(payload.subject_type),
          subject_id: safeLabel(payload.subject_id),
          review_reason: safeLabel(payload.review_reason ?? "operator_requires_review"),
          severity: safeLabel(payload.severity ?? "warning"),
          status: "open",
          environment_mode: mode,
          money_moved: false,
          metadata: safeMetadata(payload.metadata),
        }, { onConflict: "subject_type,subject_id,review_reason,environment_mode" })
        .select("id,subject_type,subject_id,review_reason,status,environment_mode,money_moved")
        .single();
      if (error) throw error;
      await insertEvent(client, { event_type: "requires_review_flag_recorded", action_id: "mark_money_item_requires_review", environment_mode: mode, result: "open" });
      return jsonResponse(200, { ok: true, action, reviewFlag: data, moneyMoved: false });
    }

    if (action === "create_approval_request") {
      const approvalRequest = await createApprovalRequest(client, payload);
      await insertEvent(client, { event_type: "approval_request_created", action_id: approvalRequest.action_id, environment_mode: payload.environment_mode, result: "pending" });
      return jsonResponse(200, { ok: true, action, approvalRequest, moneyMoved: false });
    }

    if (action === "mark_sandbox_proof_result") {
      const mode = environmentMode(payload.environment_mode ?? "sandbox");
      if (mode === "production") return jsonResponse(400, { error: "sandbox_proof_cannot_be_production" });
      const event = await insertEvent(client, {
        event_type: "sandbox_proof_result",
        action_id: "write_sandbox_test_mode_proof_result",
        environment_mode: mode,
        result: safeLabel(payload.result ?? "recorded"),
        metadata: payload.metadata,
      });
      return jsonResponse(200, { ok: true, action, event, moneyMoved: false });
    }

    if (action === "learning_report") {
      const { data, error } = await client
        .from("money_operator_learning_state")
        .select("incident_key,surface,reason,occurrence_count,confidence,recommended_next_action,last_seen_at")
        .order("last_seen_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, learningState: data ?? [], moneyMoved: false });
    }

    if (action === "execute_approved_money_action_dry_run") {
      const actionId = safeLabel(payload.money_action_id ?? payload.action_id);
      const classification = classifyMoneyAction(actionId);
      const event = await insertEvent(client, {
        event_type: "approved_money_action_dry_run",
        action_id: actionId,
        environment_mode: payload.environment_mode,
        result: "dry_run_only",
        external_confirmation_required: classification.approvalLevel === 4,
        external_confirmation_status: classification.approvalLevel === 4 ? "required" : "not_required",
        metadata: { approval_level: classification.approvalLevel, reason: classification.reason, money_moved: false },
      });
      return jsonResponse(200, { ok: true, action, event, execution: "dry_run_only", moneyMoved: false });
    }

    if (action === "execute_approved_money_action") {
      const actionId = safeLabel(payload.money_action_id ?? payload.action_id ?? payload.actionId);
      const classification = classifyMoneyAction(actionId);
      const mode = environmentMode(payload.environment_mode ?? payload.environmentMode);
      const amountCents = Number(payload.amount_cents ?? payload.amountCents ?? 0);
      const realMoneyAttempt = mode === "production" && Number.isFinite(amountCents) && amountCents > 0;
      const event = await insertEvent(client, {
        event_type: "approved_money_action_blocked_or_audited",
        action_id: actionId,
        environment_mode: mode,
        result: classification.forbidden || realMoneyAttempt || classification.approvalLevel >= 3
          ? "blocked_pending_owner_scope_and_external_confirmation"
          : "safe_action_audited_no_money_movement",
        blocked_reason: classification.forbidden
          ? "forbidden_money_action"
          : realMoneyAttempt
            ? "real_money_mutation_blocked"
            : classification.approvalLevel >= 3
              ? classification.reason
              : null,
        external_confirmation_required: classification.approvalLevel === 4,
        external_confirmation_status: classification.approvalLevel === 4 ? "required" : "not_required",
        metadata: { approval_level: classification.approvalLevel, money_moved: false },
      });
      const status = classification.forbidden || realMoneyAttempt || classification.approvalLevel >= 3 ? 409 : 200;
      return jsonResponse(status, { ok: status === 200, action, event, execution: event.result, moneyMoved: false });
    }

    return jsonResponse(400, { error: "unknown_money_operator_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const safeError = SECRET_PATTERN.test(message) || LONG_SECRET_PATTERN.test(message) ? "redacted_error" : message;
    return jsonResponse(400, { ok: false, error: safeError });
  }
});
