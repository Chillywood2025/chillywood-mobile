import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;
type AuthenticatedUser = {
  email: string | null;
  id: string;
  role: "owner" | "operator";
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

const ACTION_ROUTES: Record<string, string> = {
  approve: "approve",
  create_pr_only: "create-pr-only",
  reject: "deny",
};

const REMEDIATION_ACTIONS = new Set(["approve", "create_pr_only"]);

const toText = (value: unknown) => String(value ?? "").trim();

const isRecord = (value: unknown): value is JsonObject =>
  !!value && typeof value === "object" && !Array.isArray(value);

const json = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const readOptionalEnv = (key: string) => toText(Deno.env.get(key)) || null;

const redactText = (value: string) =>
  value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/wss?:\/\/\S+/gi, "[redacted-url]")
    .replace(/eyJ[A-Za-z0-9._~+/=-]+/g, "[redacted-token]")
    .replace(/sk_(test|live)_[A-Za-z0-9_]+/gi, "sk_[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/g, "[redacted]")
    .slice(0, 500);

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeValue);
  if (!isRecord(value)) return value;

  const output: JsonObject = {};
  for (const [key, entry] of Object.entries(value).slice(0, 80)) {
    if (/(authorization|credential|header|jwt|key|password|secret|service_role|token|url|uri)/i.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeValue(entry);
  }
  return output;
};

const sanitizeObject = (value: unknown): JsonObject =>
  isRecord(value) ? sanitizeValue(value) as JsonObject : {};

const hasActiveStaffPermission = async (
  adminClient: SupabaseClientLike,
  userId: string,
  email: string | null,
  permissionKey: string,
) => {
  const normalizedEmail = toText(email).toLowerCase();
  let query = adminClient
    .from("platform_staff_permission_grants")
    .select("id,expires_at")
    .eq("status", "active")
    .eq("permission_key", permissionKey);

  if (normalizedEmail) {
    query = query.or(`target_user_id.eq.${userId},target_email.ilike.${normalizedEmail}`);
  } else {
    query = query.eq("target_user_id", userId);
  }

  const { data, error } = await query.limit(10);
  if (error) throw new Error(`Platform permission lookup failed: ${error.message}`);
  const now = Date.now();
  return ((data ?? []) as JsonObject[]).some((row) => {
    const expiresAt = toText(row.expires_at);
    return !expiresAt || Date.parse(expiresAt) > now;
  });
};

const authenticate = async (
  req: Request,
  adminClient: SupabaseClientLike,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ error: Response } | { user: AuthenticatedUser }> => {
  const authorization = toText(req.headers.get("authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: json(401, { error: "missing_authorization" }) };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await authClient.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId) {
    return { error: json(401, { error: "invalid_session" }) };
  }

  const normalizedEmail = toText(data.user?.email).toLowerCase();
  const userLookup = await adminClient
    .from("platform_role_memberships")
    .select("role")
    .eq("status", "active")
    .in("role", ["owner", "operator"])
    .eq("user_id", userId)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (userLookup.error) throw new Error(`Platform role lookup failed: ${userLookup.error.message}`);
  const userRole = toText((userLookup.data as JsonObject | null)?.role);
  if (userRole === "owner" || userRole === "operator") {
    if (userRole === "operator" && !(await hasActiveStaffPermission(adminClient, userId, data.user?.email ?? null, "live_ops"))) {
      return { error: json(403, { error: "live_ops_permission_required" }) };
    }
    return { user: { email: data.user?.email ?? null, id: userId, role: userRole } };
  }

  if (normalizedEmail) {
    const emailLookup = await adminClient
      .from("platform_role_memberships")
      .select("role")
      .eq("status", "active")
      .in("role", ["owner", "operator"])
      .ilike("email", normalizedEmail)
      .order("role", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (emailLookup.error) throw new Error(`Platform role email lookup failed: ${emailLookup.error.message}`);
    const emailRole = toText((emailLookup.data as JsonObject | null)?.role);
    if (emailRole === "owner" || emailRole === "operator") {
      if (emailRole === "operator" && !(await hasActiveStaffPermission(adminClient, userId, data.user?.email ?? null, "live_ops"))) {
        return { error: json(403, { error: "live_ops_permission_required" }) };
      }
      return { user: { email: data.user?.email ?? null, id: userId, role: emailRole } };
    }
  }

  return { error: json(403, { error: "owner_operator_required" }) };
};

const listIncidents = async (adminClient: SupabaseClientLike, payload: JsonObject) => {
  const rawLimit = Number(payload.limit ?? 25);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(Math.trunc(rawLimit), 100)) : 25;
  let incidentQuery = adminClient
    .from("admin_live_ops_incidents")
    .select("*");

  const status = toText(payload.status);
  if (status) incidentQuery = incidentQuery.eq("status", status);
  const incidentsResult = await incidentQuery
    .order("created_at", { ascending: false })
    .limit(limit);
  if (incidentsResult.error) throw new Error(`Live Ops incidents query failed: ${incidentsResult.error.message}`);

  const incidentIds = ((incidentsResult.data ?? []) as JsonObject[]).map((row) => toText(row.id)).filter(Boolean);
  const auditResult = incidentIds.length
    ? await adminClient
      .from("admin_live_ops_action_audit")
      .select("*")
      .in("incident_id", incidentIds)
      .order("created_at", { ascending: false })
      .limit(150)
    : { data: [], error: null };

  if (auditResult.error) throw new Error(`Live Ops audit query failed: ${auditResult.error.message}`);

  return json(200, {
    audits: ((auditResult.data ?? []) as JsonObject[]).map(sanitizeObject),
    incidents: ((incidentsResult.data ?? []) as JsonObject[]).map(sanitizeObject),
  });
};

const fetchIncident = async (adminClient: SupabaseClientLike, incidentId: string) => {
  const { data, error } = await adminClient
    .from("admin_live_ops_incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();

  if (error) throw new Error(`Live Ops incident lookup failed: ${error.message}`);
  return data as JsonObject | null;
};

const recentActionCount = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
  action: string,
) => {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await adminClient
    .from("admin_live_ops_action_audit")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", user.id)
    .eq("action_type", action)
    .gte("created_at", since);

  if (error) throw new Error(`Live Ops rate-limit lookup failed: ${error.message}`);
  return count ?? 0;
};

const writeAudit = async (
  adminClient: SupabaseClientLike,
  input: {
    action: string;
    dryRun: boolean;
    errorMessage?: string | null;
    eventType: string;
    incident: JsonObject;
    result?: JsonObject;
    success: boolean;
    user: AuthenticatedUser;
  },
) => {
  const incidentId = toText(input.incident.id);
  const opsJobId = toText(input.incident.ops_job_id) || null;
  const idempotencyKey = toText(input.incident.idempotency_key) || `${incidentId}:${input.action}`;
  const target = {
    affected_call_id: input.incident.affected_call_id,
    affected_purpose: input.incident.affected_purpose,
    affected_route: input.incident.affected_route,
    affected_rooms: input.incident.affected_rooms,
    affected_server_id: input.incident.affected_server_id,
    affected_thread_id: input.incident.affected_thread_id,
    call_mode: input.incident.call_mode,
    ops_job_id: opsJobId,
  };

  const { error } = await adminClient.from("admin_live_ops_action_audit").insert({
    action_type: input.action,
    actor_email: input.user.email,
    actor_role: input.user.role,
    actor_user_id: input.user.id,
    dry_run: input.dryRun,
    error_message: input.errorMessage ? redactText(input.errorMessage) : null,
    event_type: input.eventType,
    idempotency_key: `${idempotencyKey}:${input.action}:${input.eventType}:${Date.now()}`,
    incident_id: incidentId,
    ops_job_id: opsJobId,
    result: sanitizeObject(input.result ?? {}),
    risk_level: toText(input.incident.risk_level) || "low",
    rollback_note: toText(input.incident.rollback_note) || null,
    success: input.success,
    target: sanitizeObject(target),
  });

  if (error) throw new Error(`Live Ops audit insert failed: ${error.message}`);

  await adminClient.from("platform_admin_audit_logs").insert({
    action: `live_ops_${input.action}`,
    action_category: "system",
    actor_email: input.user.email,
    actor_role: input.user.role,
    actor_user_id: input.user.id,
    metadata: sanitizeObject({
      dry_run: input.dryRun,
      event_type: input.eventType,
      incident_id: incidentId,
      ops_job_id: opsJobId,
      success: input.success,
    }),
    reason: `Live Ops Fix Center ${input.eventType}`,
    severity: input.success ? "notice" : "warning",
    target_id: incidentId,
    target_type: "admin_live_ops_incident",
  });
};

const updateIncidentFromJob = async (
  adminClient: SupabaseClientLike,
  incident: JsonObject,
  action: string,
  responseBody: JsonObject,
) => {
  const job = sanitizeObject(responseBody.job);
  const rawStatus = toText(job.status);
  const status = rawStatus === "denied" ? "rejected" : rawStatus || toText(incident.status) || "detected";
  const allowedStatus = new Set(["detected", "waiting_approval", "dry_run_completed", "approved", "rejected", "executed", "failed"]);
  const dryRunResult = sanitizeObject(job.executionResult ?? job.dryRunResult ?? responseBody.result ?? {});

  const { error } = await adminClient
    .from("admin_live_ops_incidents")
    .update({
      dry_run_result: rawStatus === "dry_run_completed" ? dryRunResult : incident.dry_run_result ?? null,
      last_action_at: new Date().toISOString(),
      metadata: {
        ...sanitizeObject(incident.metadata),
        last_proxy_action: action,
        last_ops_response: responseBody,
      },
      status: allowedStatus.has(status) ? status : "failed",
    })
    .eq("id", toText(incident.id));

  if (error) throw new Error(`Live Ops incident update failed: ${error.message}`);
};

const callOps = async (
  adminClient: SupabaseClientLike,
  payload: JsonObject,
  user: AuthenticatedUser,
  action: string,
) => {
  if (!ACTION_ROUTES[action]) return json(400, { error: "invalid_action" });
  const incidentId = toText(payload.incidentId ?? payload.incident_id);
  if (!incidentId) return json(400, { error: "missing_incident_id" });

  const incident = await fetchIncident(adminClient, incidentId);
  if (!incident) return json(404, { error: "incident_not_found" });

  const opsJobId = toText(incident.ops_job_id);
  if (!opsJobId) return json(409, { error: "incident_missing_ops_job_id" });

  if (REMEDIATION_ACTIONS.has(action)) {
    const recent = await recentActionCount(adminClient, user, action);
    if (recent >= 3) {
      await writeAudit(adminClient, {
        action,
        dryRun: true,
        errorMessage: "rate_limited",
        eventType: "fail",
        incident,
        success: false,
        user,
      });
      return json(429, { error: "rate_limited", message: "Too many Live Ops remediation actions in the last 15 minutes." });
    }
  }

  const baseUrl = readOptionalEnv("OPS_AUTOMATION_BASE_URL");
  const approvalToken = readOptionalEnv("OPS_APPROVAL_TOKEN");
  if (!baseUrl || !approvalToken) {
    await writeAudit(adminClient, {
      action,
      dryRun: true,
      errorMessage: "ops_proxy_not_configured",
      eventType: "fail",
      incident,
      success: false,
      user,
    });
    return json(503, { error: "ops_proxy_not_configured" });
  }

  await writeAudit(adminClient, {
    action,
    dryRun: true,
    eventType: action === "reject" ? "reject" : "approve",
    incident,
    result: { proxy_request: "accepted" },
    success: true,
    user,
  });

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/jobs/${encodeURIComponent(opsJobId)}/${ACTION_ROUTES[action]}`, {
    body: JSON.stringify({
      actorRole: user.role,
      reason: redactText(toText(payload.reason)),
    }),
    headers: {
      "Content-Type": "application/json",
      "X-Ops-Approval-Token": approvalToken,
      "X-Ops-Approved-By": user.email ?? user.id,
    },
    method: "POST",
  });

  const responseBody = sanitizeObject(await response.json().catch(() => ({ error: "invalid_ops_response" })));
  if (!response.ok) {
    await writeAudit(adminClient, {
      action,
      dryRun: true,
      errorMessage: toText(responseBody.error) || `ops_http_${response.status}`,
      eventType: "fail",
      incident,
      result: responseBody,
      success: false,
      user,
    });
    return json(response.status, responseBody.error ? responseBody : { error: `ops_http_${response.status}` });
  }

  await updateIncidentFromJob(adminClient, incident, action, responseBody);
  await writeAudit(adminClient, {
    action,
    dryRun: responseBody.job && isRecord(responseBody.job) ? toText((responseBody.job as JsonObject).status) === "dry_run_completed" : true,
    eventType: action === "create_pr_only" ? "create_pr_only" : action === "reject" ? "reject" : "execute",
    incident,
    result: responseBody,
    success: true,
    user,
  });

  return json(200, responseBody);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const anonKey = readRequiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const auth = await authenticate(req, adminClient, supabaseUrl, anonKey);
    if ("error" in auth) return auth.error;

    const payload = await req.json().catch(() => null) as JsonObject | null;
    if (!isRecord(payload)) return json(400, { error: "invalid_body" });

    const action = toText(payload.action).toLowerCase();
    if (action === "list") return await listIncidents(adminClient, payload);
    if (action === "approve" || action === "reject" || action === "create_pr_only") {
      return await callOps(adminClient, payload, auth.user, action);
    }

    return json(400, { error: "invalid_action" });
  } catch (error) {
    const message = error instanceof Error ? redactText(error.message) : "live_ops_proxy_failed";
    console.error("admin-live-ops-fix-center failure", message);
    return json(500, { error: "live_ops_proxy_failed", message });
  }
});
