import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ScopedOperatorConfig = {
  systemId: string;
  tokenHeader: string;
  tokenHashEnv: string;
  tokenError: string;
  eventTable: string;
  snapshotTable: string;
  reviewTable: string;
  allowedActions: readonly string[];
  approvalActions: readonly string[];
  actionTables: Record<string, string>;
  defaultHealthState: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

const secretKeyPattern = /(secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url)/i;

export const scopedOperatorCorsHeaders = (tokenHeader: string) => ({
  ...jsonHeaders,
  "access-control-allow-headers": `authorization, content-type, ${tokenHeader}`,
});

export const scopedJsonResponse = (tokenHeader: string, status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  { status, headers: scopedOperatorCorsHeaders(tokenHeader) },
);

export const sanitizeOperatorMetadata = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((entry) => sanitizeOperatorMetadata(entry));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 160) return `${value.slice(0, 20)}...[redacted:${value.length}]`;
    return value;
  }

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    secretKeyPattern.test(key) ? "[redacted]" : sanitizeOperatorMetadata(entry),
  ]));
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const constantTimeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
};

const authenticate = async (request: Request, config: ScopedOperatorConfig) => {
  const expectedHash = Deno.env.get(config.tokenHashEnv) ?? "";
  const token = request.headers.get(config.tokenHeader) ?? "";
  if (!expectedHash || !token) return false;
  return constantTimeEqual(await sha256Hex(token), expectedHash);
};

const adminClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_service_env_missing");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

const insertEvent = async (
  client: SupabaseClient,
  config: ScopedOperatorConfig,
  actionId: string,
  result: string,
  metadata: Record<string, unknown>,
) => {
  const { error } = await client.from(config.eventTable).insert({
    system_id: config.systemId,
    actor_type: String(metadata.actor_type ?? "operator"),
    actor_id: String(metadata.operator_id ?? config.systemId),
    action_id: actionId,
    result,
    environment_mode: String(metadata.environment_mode ?? "production"),
    user_rights_changed: false,
    money_moved: false,
    metadata: sanitizeOperatorMetadata(metadata),
  });
  if (error) throw error;
};

const insertSnapshot = async (
  client: SupabaseClient,
  config: ScopedOperatorConfig,
  actionId: string,
  metadata: Record<string, unknown>,
) => {
  const row: Record<string, unknown> = {
    system_id: config.systemId,
    health_state: String(metadata.health_state ?? config.defaultHealthState),
    environment_mode: String(metadata.environment_mode ?? "production"),
    user_rights_changed: false,
    money_moved: false,
    metadata: sanitizeOperatorMetadata(metadata),
  };
  if (config.systemId === "notification_delivery_operator") {
    row.provider = String(metadata.provider ?? "expo");
    row.retry_backlog = Number(metadata.retry_backlog ?? 0);
    row.failed_attempt_count = Number(metadata.failed_attempt_count ?? 0);
  }
  if (config.systemId === "release_ota_operator") {
    row.channel = metadata.channel ?? null;
    row.runtime_version = metadata.runtime_version ?? null;
    row.update_id = metadata.update_id ?? null;
    row.embedded_launch = typeof metadata.embedded_launch === "boolean" ? metadata.embedded_launch : null;
    row.emergency_launch = typeof metadata.emergency_launch === "boolean" ? metadata.emergency_launch : null;
  }
  if (config.systemId === "security_owner_operator") {
    row.critical_finding_count = Number(metadata.critical_finding_count ?? 0);
    row.warning_count = Number(metadata.warning_count ?? 0);
  }
  if (config.systemId === "moderation_safety_operator") {
    row.stale_case_count = Number(metadata.stale_case_count ?? 0);
    row.urgent_review_count = Number(metadata.urgent_review_count ?? 0);
  }
  if (config.systemId === "observability_runtime_operator") {
    row.crash_cluster_count = Number(metadata.crash_cluster_count ?? 0);
    row.js_error_count = Number(metadata.js_error_count ?? 0);
    row.performance_regression_count = Number(metadata.performance_regression_count ?? 0);
    row.backend_error_rate_percent = typeof metadata.backend_error_rate_percent === "number" ? metadata.backend_error_rate_percent : null;
    row.channel = metadata.channel ?? null;
    row.runtime_version = metadata.runtime_version ?? null;
    row.update_id = metadata.update_id ?? null;
    row.embedded_launch = typeof metadata.embedded_launch === "boolean" ? metadata.embedded_launch : null;
    row.emergency_launch = typeof metadata.emergency_launch === "boolean" ? metadata.emergency_launch : null;
  }
  const { error } = await client.from(config.snapshotTable).insert(row);
  if (error) throw error;
  await insertEvent(client, config, actionId, "snapshot_recorded", metadata);
};

const readReport = async (
  client: SupabaseClient,
  config: ScopedOperatorConfig,
) => {
  const { data: latestEvents, error: eventsError } = await client
    .from(config.eventTable)
    .select("id,system_id,actor_type,actor_id,action_id,result,environment_mode,user_rights_changed,money_moved,metadata,created_at")
    .eq("system_id", config.systemId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (eventsError) throw eventsError;

  const { data: latestSnapshots, error: snapshotError } = await client
    .from(config.snapshotTable)
    .select("*")
    .eq("system_id", config.systemId)
    .order("created_at", { ascending: false })
    .limit(3);
  if (snapshotError) throw snapshotError;

  return {
    latestEvents: sanitizeOperatorMetadata(latestEvents ?? []),
    latestSnapshots: sanitizeOperatorMetadata(latestSnapshots ?? []),
  };
};

const insertReview = async (
  client: SupabaseClient,
  config: ScopedOperatorConfig,
  actionId: string,
  metadata: Record<string, unknown>,
) => {
  const targetTable = config.actionTables[actionId] ?? config.reviewTable;
  const row: Record<string, unknown> = {
    system_id: config.systemId,
    environment_mode: String(metadata.environment_mode ?? "production"),
    user_rights_changed: false,
    money_moved: false,
    metadata: sanitizeOperatorMetadata(metadata),
  };

  if (targetTable.includes("provider_sync_status")) {
    row.provider = String(metadata.provider ?? "unknown");
    row.capability = String(metadata.capability ?? actionId);
    row.sync_status = String(metadata.sync_status ?? "unknown");
    row.last_checked_at = new Date().toISOString();
  } else if (targetTable.includes("duplicate")) {
    row.dedupe_key = String(metadata.dedupe_key ?? `${config.systemId}:${actionId}`);
    if (targetTable.includes("notification_duplicate")) {
      row.duplicate_count = Number(metadata.duplicate_count ?? 1);
    } else {
      row.report_count = Number(metadata.report_count ?? metadata.duplicate_count ?? 1);
    }
  } else if (targetTable.includes("stale_case")) {
    row.case_type = String(metadata.case_type ?? "unknown");
    row.stale_age_seconds = Number(metadata.stale_age_seconds ?? 0);
  } else if (targetTable.includes("rollout_anomaly")) {
    row.anomaly_type = String(metadata.anomaly_type ?? actionId);
    row.severity = String(metadata.severity ?? "review");
  } else if (targetTable.includes("rollback_readiness")) {
    row.readiness_state = String(metadata.readiness_state ?? "review");
    row.rollback_available = Boolean(metadata.rollback_available ?? false);
  } else if (targetTable.includes("ota_diagnostics")) {
    row.channel = metadata.channel ?? null;
    row.runtime_version = metadata.runtime_version ?? null;
    row.update_id = metadata.update_id ?? null;
    row.embedded_launch = typeof metadata.embedded_launch === "boolean" ? metadata.embedded_launch : null;
    row.emergency_launch = typeof metadata.emergency_launch === "boolean" ? metadata.emergency_launch : null;
  } else if (targetTable.includes("owner_authority") || targetTable.includes("approval_integrity") || targetTable.includes("secret_scan")) {
    row.finding_type = String(metadata.finding_type ?? actionId);
    row.severity = String(metadata.severity ?? "review");
  } else if (targetTable.includes("safety_review")) {
    row.recommendation_type = String(metadata.recommendation_type ?? actionId);
    row.severity = String(metadata.severity ?? "review");
  } else if (targetTable.includes("case_priority")) {
    row.flag_type = String(metadata.flag_type ?? actionId);
    row.priority = String(metadata.priority ?? "review");
  } else {
    row.flag_type = String(metadata.flag_type ?? actionId);
    row.severity = String(metadata.severity ?? "review");
    row.target_type = metadata.target_type ?? null;
    row.target_id = metadata.target_id ?? null;
  }

  if (config.systemId === "observability_runtime_operator") {
    row.update_id = metadata.update_id ?? null;
    row.runtime_version = metadata.runtime_version ?? null;
    row.channel = metadata.channel ?? null;
    if (targetTable.includes("crash_cluster") || targetTable.includes("js_error")) {
      row.signature_hash = metadata.signature_hash ?? null;
    }
    if (targetTable.includes("performance_regression")) {
      row.metric_name = metadata.metric_name ?? null;
      row.metric_value = typeof metadata.metric_value === "number" ? metadata.metric_value : null;
    }
    if (targetTable.includes("analytics_delivery")) {
      row.provider = metadata.provider ?? null;
      row.capability = metadata.capability ?? null;
    }
    if (targetTable.includes("release_health")) {
      row.embedded_launch = typeof metadata.embedded_launch === "boolean" ? metadata.embedded_launch : null;
      row.emergency_launch = typeof metadata.emergency_launch === "boolean" ? metadata.emergency_launch : null;
    }
    if (targetTable.includes("backend_error_rate")) {
      row.backend_surface = metadata.backend_surface ?? null;
      row.error_rate_percent = typeof metadata.error_rate_percent === "number" ? metadata.error_rate_percent : null;
    }
  }

  const { error } = await client.from(targetTable).insert(row);
  if (error) throw error;
  await insertEvent(client, config, actionId, "review_recorded", metadata);
};

const createApprovalRequest = async (
  client: SupabaseClient,
  config: ScopedOperatorConfig,
  payload: Record<string, unknown>,
) => {
  const actionId = String(payload.action_id ?? payload.actionId ?? "approval_required_action");
  const approvalLevel = Number(payload.approval_level ?? payload.approvalLevel ?? 3);
  if (approvalLevel !== 3 && approvalLevel !== 4) throw new Error("approval_level_must_be_3_or_4");

  const insertPayload = {
    system_id: config.systemId,
    action_id: actionId,
    requested_by_actor_type: "operator",
    requested_by_actor_id: payload.requested_by_actor_id ?? null,
    approval_level: approvalLevel,
    status: "pending",
    title: String(payload.title ?? `${config.systemId} approval request`),
    reason: String(payload.reason ?? "Scoped autonomous operator requires owner/super-admin approval."),
    risk_summary: String(payload.risk_summary ?? "High-risk action requires owner approval, fresh preflight, exact scope match, and emergency-state check."),
    proposed_action: String(payload.proposed_action ?? actionId),
    allowed_write_scope: Array.isArray(payload.allowed_write_scope) ? payload.allowed_write_scope : ["owner-approved scoped write only"],
    forbidden_scope: Array.isArray(payload.forbidden_scope) ? payload.forbidden_scope : ["approval bypass", "secret output", "broad mutation"],
    rollback_plan: String(payload.rollback_plan ?? "Owner-approved rollback plan required before execution."),
    kill_switch_plan: String(payload.kill_switch_plan ?? "Emergency stop must be false and available before execution."),
    proof_plan: String(payload.proof_plan ?? "Run system proof and guard before execution."),
    validation_plan: String(payload.validation_plan ?? "Re-run fresh preflight and exact scope validation before execution."),
    expires_at: String(payload.expires_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
    metadata: sanitizeOperatorMetadata(payload.metadata ?? {}),
  };

  const { data, error } = await client
    .from("autonomous_approval_requests")
    .insert(insertPayload)
    .select("id,status,system_id,action_id,approval_level,expires_at")
    .single();
  if (error) throw error;

  await client.from("autonomous_approval_request_events").insert({
    request_id: data.id,
    event_type: "created",
    actor_type: "operator",
    actor_id: null,
    event_summary: `${config.systemId} requested approval for ${actionId}`,
    metadata: { created_by: config.systemId },
  });
  await insertEvent(client, config, "create_approval_request", "approval_request_created", { approval_request_id: data.id, action_id: actionId });
  return data;
};

const withAuditIdentity = (config: ScopedOperatorConfig, payload: Record<string, unknown>) => ({
  ...payload,
  scheduler: String(payload.scheduler ?? "direct_token_call"),
  operator_id: String(payload.operator_id ?? config.systemId),
  source: String(payload.source ?? `direct_token_call:${config.systemId}`),
});

export const handleScopedOperatorRequest = (config: ScopedOperatorConfig) => async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: scopedOperatorCorsHeaders(config.tokenHeader) });
  if (request.method !== "POST") return scopedJsonResponse(config.tokenHeader, 405, { error: "method_not_allowed" });
  if (!(await authenticate(request, config))) return scopedJsonResponse(config.tokenHeader, 401, { error: config.tokenError });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return scopedJsonResponse(config.tokenHeader, 400, { error: "invalid_json" });
  }

  const action = String(payload.action ?? "health_snapshot");
  if (![...config.allowedActions, ...config.approvalActions, "create_approval_request"].includes(action)) {
    return scopedJsonResponse(config.tokenHeader, 422, {
      error: "unsupported_action_requires_approval",
      systemId: config.systemId,
      action,
      approvalRequired: true,
      moneyMoved: false,
      userRightsChanged: false,
    });
  }

  try {
    const client = adminClient();
    const metadata = (sanitizeOperatorMetadata(withAuditIdentity(config, { ...payload, action })) ?? {}) as Record<string, unknown>;

    if (action === "create_approval_request" || config.approvalActions.includes(action)) {
      const requestRow = await createApprovalRequest(client, config, { ...payload, action_id: payload.action_id ?? action });
      return scopedJsonResponse(config.tokenHeader, 200, {
        ok: true,
        systemId: config.systemId,
        action,
        approvalRequest: requestRow,
        executedHighRiskAction: false,
        moneyMoved: false,
        userRightsChanged: false,
      });
    }

    if (action === "report") {
      const report = await readReport(client, config);
      return scopedJsonResponse(config.tokenHeader, 200, {
        ok: true,
        systemId: config.systemId,
        action,
        result: "report_read",
        ...report,
        moneyMoved: false,
        userRightsChanged: false,
        highRiskExecuted: false,
      });
    }

    if (["health_snapshot", "watch_once", "status"].includes(action)) {
      await insertSnapshot(client, config, action, metadata);
    } else {
      if (config.systemId === "notification_delivery_operator" && action === "mark_token_provider_revoked" && metadata.provider_evidence !== "DeviceNotRegistered") {
        return scopedJsonResponse(config.tokenHeader, 422, { error: "device_not_registered_evidence_required", moneyMoved: false, userRightsChanged: false });
      }
      if ((config.actionTables[action] ?? config.reviewTable) === config.eventTable) {
        await insertEvent(client, config, action, "event_recorded", metadata);
      } else {
        await insertReview(client, config, action, metadata);
      }
    }

    return scopedJsonResponse(config.tokenHeader, 200, {
      ok: true,
      systemId: config.systemId,
      action,
      result: "safe_write_recorded",
      auditIdentity: {
        scheduler: metadata.scheduler,
        operatorId: metadata.operator_id,
        source: metadata.source,
      },
      moneyMoved: false,
      userRightsChanged: false,
      highRiskExecuted: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return scopedJsonResponse(config.tokenHeader, 500, {
      error: "operator_action_failed",
      message,
      systemId: config.systemId,
      moneyMoved: false,
      userRightsChanged: false,
    });
  }
};
