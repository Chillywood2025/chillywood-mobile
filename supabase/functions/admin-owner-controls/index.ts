import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;
type StaffRole = "owner" | "operator" | "moderator";
type AuthenticatedUser = {
  activeBreakGlassSessionId: string | null;
  email: string | null;
  id: string;
  permissions: Set<string>;
  role: StaffRole;
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

const PERMISSION_TEMPLATES: Record<string, { label: string; permissions: string[] }> = {
  creator_support: { label: "Creator Support", permissions: ["creator_support", "support_inbox", "user_lookup"] },
  evidence_exporter: { label: "Evidence Exporter", permissions: ["legal_review", "evidence_export", "legal_request_intake"] },
  legal_reviewer: { label: "Legal Reviewer", permissions: ["legal_review", "legal_request_intake"] },
  live_ops_operator: { label: "Live Ops Operator", permissions: ["live_ops"] },
  moderator: { label: "Moderator", permissions: ["reports_review", "content_moderation"] },
  senior_moderator: { label: "Senior Moderator", permissions: ["reports_review", "content_moderation", "user_lookup"] },
  support_agent: { label: "Support Agent", permissions: ["support_inbox", "user_lookup"] },
};

const TEMPLATE_KEYS = Object.keys(PERMISSION_TEMPLATES);
const CONTROL_PERMISSION_KEYS = [
  "admin_grants",
  "audit_review",
  "billing_support_read",
  "content_moderation",
  "creator_support",
  "emergency_break_glass",
  "evidence_export",
  "legal_request_intake",
  "legal_review",
  "live_ops",
  "manage_moderators",
  "reports_review",
  "security_review",
  "staff_permission_templates",
  "support_inbox",
  "user_lookup",
] as const;

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

const normalizeEmail = (value: unknown) => toText(value).toLowerCase();
const normalizePermission = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "moderator_grants") return "manage_moderators";
  return CONTROL_PERMISSION_KEYS.includes(normalized as typeof CONTROL_PERMISSION_KEYS[number])
    ? normalized
    : "";
};

const redactText = (value: unknown, max = 600) =>
  toText(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/wss?:\/\/\S+/gi, "[redacted-url]")
    .replace(/eyJ[A-Za-z0-9._~+/=-]+/g, "[redacted-token]")
    .replace(/sk_(test|live)_[A-Za-z0-9_]+/gi, "sk_[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/g, "[redacted]")
    .slice(0, max);

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 80).map(sanitizeValue);
  if (!isRecord(value)) return value;

  const output: JsonObject = {};
  for (const [key, entry] of Object.entries(value).slice(0, 120)) {
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

const parseLimit = (value: unknown, fallback = 50, max = 200) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
};

const requireReason = (value: unknown, label = "reason") => {
  const reason = redactText(value, 1000);
  if (reason.length < 6) throw new Error(`${label}_required`);
  return reason;
};

const hasPermission = (user: AuthenticatedUser, key: string) =>
  user.role === "owner" || user.permissions.has(normalizePermission(key));

const hasAnyPermission = (user: AuthenticatedUser, keys: string[]) =>
  user.role === "owner" || keys.some((key) => user.permissions.has(normalizePermission(key)));

const shouldWriteAppAudit = (user: AuthenticatedUser) =>
  user.role !== "owner" || !!user.activeBreakGlassSessionId;

const resolveAdminReason = (user: AuthenticatedUser, value: unknown, fallback: string) => {
  if (user.role === "owner" && !user.activeBreakGlassSessionId) {
    return redactText(value, 1000) || fallback;
  }
  return requireReason(value);
};

const readActivePermissions = async (
  adminClient: SupabaseClientLike,
  userId: string,
  email: string | null,
) => {
  const normalizedEmail = normalizeEmail(email);
  let query = adminClient
    .from("platform_staff_permission_grants")
    .select("permission_key,expires_at")
    .eq("status", "active");

  if (normalizedEmail) {
    query = query.or(`target_user_id.eq.${userId},target_email.ilike.${normalizedEmail}`);
  } else {
    query = query.eq("target_user_id", userId);
  }

  const { data, error } = await query.limit(200);
  if (error) throw new Error(`Permission lookup failed: ${error.message}`);
  const now = Date.now();
  return new Set(
    ((data ?? []) as JsonObject[])
      .filter((row) => {
        const expiresAt = toText(row.expires_at);
        return !expiresAt || Date.parse(expiresAt) > now;
      })
      .map((row) => normalizePermission(row.permission_key))
      .filter(Boolean),
  );
};

const readActiveBreakGlassSessionId = async (
  adminClient: SupabaseClientLike,
  userId: string,
  email: string | null,
) => {
  const normalizedEmail = normalizeEmail(email);
  let query = adminClient
    .from("platform_break_glass_sessions")
    .select("id,expires_at")
    .eq("status", "active");
  if (normalizedEmail) {
    query = query.or(`actor_user_id.eq.${userId},actor_email.ilike.${normalizedEmail}`);
  } else {
    query = query.eq("actor_user_id", userId);
  }
  const { data, error } = await query.order("activated_at", { ascending: false }).limit(5);
  if (error) throw new Error(`Break Glass lookup failed: ${error.message}`);
  const now = Date.now();
  const active = ((data ?? []) as JsonObject[]).find((row) => {
    const expiresAt = toText(row.expires_at);
    return !expiresAt || Date.parse(expiresAt) > now;
  });
  return toText(active?.id) || null;
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
  if (error || !userId) return { error: json(401, { error: "invalid_session" }) };

  const email = data.user?.email ?? null;
  const normalizedEmail = normalizeEmail(email);
  const roleLookup = await adminClient
    .from("platform_role_memberships")
    .select("role")
    .eq("status", "active")
    .in("role", ["owner", "operator", "moderator"])
    .eq("user_id", userId)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (roleLookup.error) throw new Error(`Role lookup failed: ${roleLookup.error.message}`);
  let role = toText((roleLookup.data as JsonObject | null)?.role);

  if (!role && normalizedEmail) {
    const emailLookup = await adminClient
      .from("platform_role_memberships")
      .select("role")
      .eq("status", "active")
      .in("role", ["owner", "operator", "moderator"])
      .ilike("email", normalizedEmail)
      .order("role", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (emailLookup.error) throw new Error(`Role email lookup failed: ${emailLookup.error.message}`);
    role = toText((emailLookup.data as JsonObject | null)?.role);
  }

  if (role !== "owner" && role !== "operator" && role !== "moderator") {
    return { error: json(403, { error: "staff_role_required" }) };
  }

  const permissions = await readActivePermissions(adminClient, userId, email);
  const activeBreakGlassSessionId = await readActiveBreakGlassSessionId(adminClient, userId, email);
  return { user: { activeBreakGlassSessionId, email, id: userId, permissions, role: role as StaffRole } };
};

const expireStaleGrants = async (adminClient: SupabaseClientLike) => {
  const now = new Date().toISOString();
  const { data, error } = await adminClient
    .from("platform_staff_permission_grants")
    .update({ status: "expired", updated_at: now })
    .eq("status", "active")
    .not("expires_at", "is", null)
    .lte("expires_at", now)
    .select("*")
    .limit(100);
  if (error) throw new Error(`Permission expiry failed: ${error.message}`);

  for (const grant of ((data ?? []) as JsonObject[])) {
    const metadata = sanitizeObject(grant.metadata);
    if (metadata.audit_required !== true && toText(metadata.granted_actor_role) === "owner") continue;
    await adminClient.from("platform_staff_permission_audit").insert({
      action: "expire",
      actor_email: "system",
      actor_role: "system",
      actor_user_id: null,
      metadata: { expired_at: now, grant_id: toText(grant.id), system_expiry: true },
      permission_key: toText(grant.permission_key),
      reason: "Temporary permission grant expired server-side.",
      target_email: toText(grant.target_email) || null,
      target_user_id: toText(grant.target_user_id) || null,
    });
  }
};

const writePlatformAudit = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
  input: {
    action: string;
    category?: string;
    metadata?: JsonObject;
    reason?: string | null;
    severity?: "notice" | "warning" | "critical";
    targetId?: string | null;
    targetType?: string | null;
  },
) => {
  if (!shouldWriteAppAudit(user)) return;
  const metadata = {
    ...sanitizeObject(input.metadata ?? {}),
    break_glass_active: !!user.activeBreakGlassSessionId,
    break_glass_session_id: user.activeBreakGlassSessionId,
  };
  const { error } = await adminClient.from("platform_admin_audit_logs").insert({
    action: input.action,
    action_category: input.category ?? "system",
    actor_email: user.email,
    actor_role: user.role,
    actor_user_id: user.id,
    metadata,
    reason: redactText(input.reason ?? "", 1000) || null,
    severity: input.severity ?? "notice",
    target_id: input.targetId ?? null,
    target_type: input.targetType ?? null,
  });
  if (error) throw new Error(`Platform audit write failed: ${error.message}`);
};

const writeBreakGlassAudit = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
  input: {
    action: "activate" | "end" | "blocked" | "owner_action" | "admin_action";
    metadata?: JsonObject;
    reason: string;
    sessionId?: string | null;
    targetId?: string | null;
    targetType?: string | null;
  },
) => {
  const { error } = await adminClient.from("platform_break_glass_audit").insert({
    action: input.action,
    actor_email: user.email,
    actor_role: user.role,
    actor_user_id: user.id,
    metadata: sanitizeObject(input.metadata ?? {}),
    reason: input.reason,
    session_id: input.sessionId || user.activeBreakGlassSessionId || null,
    target_id: input.targetId || null,
    target_type: input.targetType || null,
  });
  if (error) throw new Error(`Break Glass audit write failed: ${error.message}`);
};

const targetHasAdminRole = async (adminClient: SupabaseClientLike, email: string) => {
  const { data, error } = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .eq("role", "operator")
    .ilike("email", email)
    .limit(1);
  if (error) throw new Error(`Target role lookup failed: ${error.message}`);
  return (data ?? []).length > 0;
};

const templateList = async () => json(200, {
  templates: TEMPLATE_KEYS.map((key) => ({
    key,
    label: PERMISSION_TEMPLATES[key].label,
    permissions: PERMISSION_TEMPLATES[key].permissions,
  })),
});

const resolveExpiresAt = (value: unknown) => {
  const preset = toText(value).toLowerCase();
  const now = Date.now();
  if (preset === "1h" || preset === "1_hour") return new Date(now + 60 * 60 * 1000).toISOString();
  if (preset === "24h" || preset === "24_hours") return new Date(now + 24 * 60 * 60 * 1000).toISOString();
  if (preset === "7d" || preset === "7_days") return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (!preset || preset === "until_revoked") return null;
  const parsed = Date.parse(preset);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const templateApply = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (!hasAnyPermission(user, ["staff_permission_templates", "admin_grants"])) {
    return json(403, { error: "staff_permission_templates_required" });
  }
  const templateKey = toText(payload.templateKey ?? payload.template_key).toLowerCase();
  const template = PERMISSION_TEMPLATES[templateKey];
  if (!template) return json(400, { error: "template_not_found" });

  const targetEmail = normalizeEmail(payload.targetEmail ?? payload.target_email);
  if (!targetEmail) return json(400, { error: "target_email_required" });
  if (user.role !== "owner" && targetEmail === normalizeEmail(user.email)) {
    await writePlatformAudit(adminClient, user, {
      action: "staff_permission_template_blocked",
      metadata: { blocked_reason: "self_grant_blocked", template_key: templateKey },
      reason: "Admins cannot apply permission templates to themselves.",
      severity: "warning",
      targetId: targetEmail,
      targetType: "staff_permission_template",
    });
    return json(403, { error: "self_grant_denied" });
  }

  if (!(await targetHasAdminRole(adminClient, targetEmail))) {
    return json(409, { error: "target_admin_required" });
  }

  const reason = resolveAdminReason(user, payload.reason, `Owner applied ${template.label} permission template.`);
  const expiresAt = resolveExpiresAt(payload.expiresAt ?? payload.expires_at ?? payload.duration);
  const now = new Date().toISOString();
  const results: JsonObject[] = [];

  for (const permissionKey of template.permissions) {
    const update = await adminClient
      .from("platform_staff_permission_grants")
      .update({
        expires_at: expiresAt,
        granted_at: now,
        granted_by: user.id,
        metadata: {
          audit_required: shouldWriteAppAudit(user),
          break_glass_active: !!user.activeBreakGlassSessionId,
          break_glass_session_id: user.activeBreakGlassSessionId,
          granted_actor_role: user.role,
          template_key: templateKey,
        },
        reason,
        revoked_at: null,
        revoked_by: null,
        status: "active",
        target_email: targetEmail,
        updated_at: now,
      })
      .eq("permission_key", permissionKey)
      .ilike("target_email", targetEmail)
      .select("id,permission_key,status,expires_at")
      .maybeSingle();

    if (update.error) throw new Error(`Template permission update failed: ${update.error.message}`);

    if (update.data) {
      results.push(sanitizeObject(update.data));
      continue;
    }

    const insert = await adminClient
      .from("platform_staff_permission_grants")
      .insert({
        expires_at: expiresAt,
        granted_by: user.id,
        metadata: {
          audit_required: shouldWriteAppAudit(user),
          break_glass_active: !!user.activeBreakGlassSessionId,
          break_glass_session_id: user.activeBreakGlassSessionId,
          granted_actor_role: user.role,
          template_key: templateKey,
        },
        permission_key: permissionKey,
        reason,
        status: "active",
        target_email: targetEmail,
      })
      .select("id,permission_key,status,expires_at")
      .single();
    if (insert.error) throw new Error(`Template permission insert failed: ${insert.error.message}`);
    results.push(sanitizeObject(insert.data));
  }

  await writePlatformAudit(adminClient, user, {
    action: "staff_permission_template_apply",
    category: "role",
    metadata: { expires_at: expiresAt, permissions: template.permissions, template_key: templateKey },
    reason,
    targetId: targetEmail,
    targetType: "staff_permission_template",
  });
  if (user.activeBreakGlassSessionId) {
    await writeBreakGlassAudit(adminClient, user, {
      action: user.role === "owner" ? "owner_action" : "admin_action",
      metadata: { permissions: template.permissions, template_key: templateKey },
      reason,
      targetId: targetEmail,
      targetType: "staff_permission_template",
    });
  }

  return json(200, { ok: true, permissions: results, template: { key: templateKey, label: template.label, permissions: template.permissions } });
};

const templateRevoke = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (!hasAnyPermission(user, ["staff_permission_templates", "admin_grants"])) {
    return json(403, { error: "staff_permission_templates_required" });
  }
  const templateKey = toText(payload.templateKey ?? payload.template_key).toLowerCase();
  const template = PERMISSION_TEMPLATES[templateKey];
  if (!template) return json(400, { error: "template_not_found" });

  const targetEmail = normalizeEmail(payload.targetEmail ?? payload.target_email);
  if (!targetEmail) return json(400, { error: "target_email_required" });
  if (user.role !== "owner" && targetEmail === normalizeEmail(user.email)) return json(403, { error: "self_revoke_denied" });

  const reason = resolveAdminReason(user, payload.reason, `Owner revoked ${template.label} permission template.`);
  const { data, error } = await adminClient
    .from("platform_staff_permission_grants")
    .update({
      reason,
      revoked_at: new Date().toISOString(),
      revoked_by: user.id,
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "active")
    .ilike("target_email", targetEmail)
    .in("permission_key", template.permissions)
    .select("id,permission_key,status");
  if (error) throw new Error(`Template revoke failed: ${error.message}`);

  await writePlatformAudit(adminClient, user, {
    action: "staff_permission_template_revoke",
    category: "role",
    metadata: { permissions: template.permissions, template_key: templateKey, revoked_count: (data ?? []).length },
    reason,
    targetId: targetEmail,
    targetType: "staff_permission_template",
  });
  if (user.activeBreakGlassSessionId) {
    await writeBreakGlassAudit(adminClient, user, {
      action: user.role === "owner" ? "owner_action" : "admin_action",
      metadata: { permissions: template.permissions, template_key: templateKey },
      reason,
      targetId: targetEmail,
      targetType: "staff_permission_template",
    });
  }

  return json(200, { ok: true, revoked: ((data ?? []) as JsonObject[]).map(sanitizeObject) });
};

const breakGlassStatus = async (adminClient: SupabaseClientLike, user: AuthenticatedUser) => {
  if (!hasPermission(user, "emergency_break_glass")) return json(403, { error: "break_glass_permission_required" });
  let query = adminClient
    .from("platform_break_glass_sessions")
    .select("*");
  const email = normalizeEmail(user.email);
  query = email ? query.or(`actor_user_id.eq.${user.id},actor_email.ilike.${email}`) : query.eq("actor_user_id", user.id);
  const { data, error } = await query
    .order("activated_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(`Break Glass status failed: ${error.message}`);
  return json(200, {
    activeSessionId: user.activeBreakGlassSessionId,
    sessions: ((data ?? []) as JsonObject[]).map(sanitizeObject),
  });
};

const breakGlassActivate = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (!hasPermission(user, "emergency_break_glass")) return json(403, { error: "break_glass_permission_required" });
  if (user.activeBreakGlassSessionId) return json(409, { error: "break_glass_already_active", sessionId: user.activeBreakGlassSessionId });
  const reason = requireReason(payload.reason, "break_glass_reason");
  const duration = toText(payload.duration).toLowerCase();
  const requestedExpiry = duration || payload.expiresAt || payload.expires_at;
  const expiresAt = user.role === "owner"
    ? resolveExpiresAt(requestedExpiry)
    : resolveExpiresAt(duration || "1h");
  if (user.role !== "owner" && !expiresAt) return json(400, { error: "admin_break_glass_duration_required" });
  const { data, error } = await adminClient.from("platform_break_glass_sessions").insert({
    actor_email: user.email,
    actor_role: user.role,
    actor_user_id: user.id,
    case_id: redactText(payload.caseId ?? payload.case_id, 180) || null,
    expires_at: expiresAt,
    metadata: sanitizeObject(payload.metadata),
    reason,
    report_id: redactText(payload.reportId ?? payload.report_id, 180) || null,
    status: "active",
  }).select("*").single();
  if (error) throw new Error(`Break Glass activate failed: ${error.message}`);
  const sessionId = toText((data as JsonObject).id);
  await writeBreakGlassAudit(adminClient, { ...user, activeBreakGlassSessionId: sessionId }, {
    action: "activate",
    metadata: { expires_at: expiresAt },
    reason,
    sessionId,
  });
  return json(200, { ok: true, session: sanitizeObject(data) });
};

const breakGlassEnd = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (!hasPermission(user, "emergency_break_glass")) return json(403, { error: "break_glass_permission_required" });
  const sessionId = toText(payload.sessionId ?? payload.session_id) || user.activeBreakGlassSessionId;
  if (!sessionId) return json(404, { error: "break_glass_not_active" });
  const reason = redactText(payload.reason, 1000) || "Break Glass session ended.";
  let query = adminClient
    .from("platform_break_glass_sessions")
    .update({
      ended_at: new Date().toISOString(),
      ended_by_email: user.email,
      ended_by_user_id: user.id,
      status: "ended",
    })
    .eq("id", sessionId)
    .eq("status", "active");
  if (user.role !== "owner") query = query.eq("actor_user_id", user.id);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(`Break Glass end failed: ${error.message}`);
  if (!data) return json(404, { error: "break_glass_not_found" });
  await writeBreakGlassAudit(adminClient, user, { action: "end", reason, sessionId });
  return json(200, { ok: true, session: sanitizeObject(data) });
};

const legalRequestList = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (!hasAnyPermission(user, ["legal_request_intake", "legal_review"])) return json(403, { error: "legal_request_intake_required" });
  const limit = parseLimit(payload.limit, 25, 100);
  let query = adminClient.from("legal_request_intake").select("*");
  const status = toText(payload.status);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Legal intake list failed: ${error.message}`);
  return json(200, { requests: ((data ?? []) as JsonObject[]).map(sanitizeObject) });
};

const legalRequestCreate = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (!hasAnyPermission(user, ["legal_request_intake", "legal_review"])) return json(403, { error: "legal_request_intake_required" });
  const reason = resolveAdminReason(user, payload.auditReason ?? payload.audit_reason ?? payload.requestReason ?? payload.request_reason, "Owner legal request intake record.");
  const requestingAgency = redactText(payload.requestingAgency ?? payload.requesting_agency, 180);
  const requestReason = redactText(payload.requestReason ?? payload.request_reason ?? reason, 1000);
  if (requestingAgency.length < 2) return json(400, { error: "requesting_agency_required" });
  if (requestReason.length < 6) return json(400, { error: "request_reason_required" });
  const { data, error } = await adminClient.from("legal_request_intake").insert({
    case_number: redactText(payload.caseNumber ?? payload.case_number, 180) || null,
    contact_name: redactText(payload.contactName ?? payload.contact_name, 180) || null,
    date_from: toText(payload.dateFrom ?? payload.date_from) || null,
    date_to: toText(payload.dateTo ?? payload.date_to) || null,
    exported_summary: redactText(payload.exportedSummary ?? payload.exported_summary, 1000) || null,
    handled_by_email: user.email,
    handled_by_user_id: user.id,
    metadata: {
      break_glass_active: !!user.activeBreakGlassSessionId,
      break_glass_session_id: user.activeBreakGlassSessionId,
      created_actor_role: user.role,
    },
    request_reason: requestReason,
    requesting_agency: requestingAgency,
    reviewed_summary: redactText(payload.reviewedSummary ?? payload.reviewed_summary, 1000) || null,
    status: toText(payload.status) || "open",
    target_content_id: redactText(payload.targetContentId ?? payload.target_content_id, 180) || null,
    target_report_id: redactText(payload.targetReportId ?? payload.target_report_id, 180) || null,
    target_room_id: redactText(payload.targetRoomId ?? payload.target_room_id, 180) || null,
    target_thread_id: redactText(payload.targetThreadId ?? payload.target_thread_id, 180) || null,
    target_user_id: redactText(payload.targetUserId ?? payload.target_user_id, 180) || null,
  }).select("*").single();
  if (error) throw new Error(`Legal intake create failed: ${error.message}`);

  await writePlatformAudit(adminClient, user, {
    action: "legal_request_intake_create",
    metadata: { legal_request_id: toText((data as JsonObject).id), status: toText((data as JsonObject).status) },
    reason,
    targetId: toText((data as JsonObject).id),
    targetType: "legal_request_intake",
  });
  if (user.activeBreakGlassSessionId) {
    await writeBreakGlassAudit(adminClient, user, {
      action: user.role === "owner" ? "owner_action" : "admin_action",
      metadata: { legal_request_id: toText((data as JsonObject).id) },
      reason,
      targetId: toText((data as JsonObject).id),
      targetType: "legal_request_intake",
    });
  }

  return json(200, { ok: true, request: sanitizeObject(data) });
};

const legalRequestUpdate = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (!hasAnyPermission(user, ["legal_request_intake", "legal_review"])) return json(403, { error: "legal_request_intake_required" });
  const requestId = toText(payload.id ?? payload.requestId ?? payload.request_id);
  if (!requestId) return json(400, { error: "legal_request_id_required" });
  const reason = resolveAdminReason(user, payload.auditReason ?? payload.audit_reason ?? payload.reason, "Owner updated legal request intake.");
  const patch: JsonObject = {
    handled_by_email: user.email,
    handled_by_user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  for (const [inputKey, column] of [
    ["status", "status"],
    ["reviewedSummary", "reviewed_summary"],
    ["reviewed_summary", "reviewed_summary"],
    ["exportedSummary", "exported_summary"],
    ["exported_summary", "exported_summary"],
  ]) {
    if (payload[inputKey] !== undefined) patch[column] = redactText(payload[inputKey], 1000);
  }
  const { data, error } = await adminClient.from("legal_request_intake")
    .update(patch)
    .eq("id", requestId)
    .select("*")
    .single();
  if (error) throw new Error(`Legal intake update failed: ${error.message}`);
  await writePlatformAudit(adminClient, user, {
    action: "legal_request_intake_update",
    metadata: { patch_keys: Object.keys(patch) },
    reason,
    targetId: requestId,
    targetType: "legal_request_intake",
  });
  return json(200, { ok: true, request: sanitizeObject(data) });
};

const normalizeAuditRow = (source: string, row: JsonObject) => {
  const metadata = sanitizeObject(row.metadata ?? row.result ?? {});
  const actorRole = toText(row.actor_role ?? row.requested_by_role ?? row.requested_by_actor_role);
  const breakGlassActive = metadata.break_glass_active === true || source === "break_glass";
  return {
    action: toText(row.action ?? row.action_type ?? row.event_type ?? row.status ?? source),
    actorEmail: toText(row.actor_email ?? row.requested_by_email ?? row.handled_by_email) || null,
    actorRole: actorRole || null,
    actorUserId: toText(row.actor_user_id ?? row.requested_by_user_id ?? row.handled_by_user_id) || null,
    breakGlassActive,
    dryRun: row.dry_run === true || metadata.dry_run === true,
    id: toText(row.id),
    metadata,
    occurredAt: toText(row.created_at ?? row.granted_at ?? row.activated_at ?? row.updated_at) || null,
    permissionKey: toText(row.permission_key) || null,
    reason: redactText(row.reason ?? row.request_reason ?? "", 500) || null,
    source,
    summary: redactText(row.error_message ?? row.requesting_agency ?? row.action ?? row.action_type ?? source, 240),
    targetId: toText(row.target_id ?? row.target_user_id ?? row.target_email ?? row.incident_id ?? row.id) || null,
    targetType: toText(row.target_type ?? source) || source,
  };
};

const auditList = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (!hasAnyPermission(user, ["audit_review", "security_review"])) return json(403, { error: "audit_review_required" });
  const limit = parseLimit(payload.limit, 60, 200);
  const sources: Array<{ table: string; source: string; order: string }> = [
    { order: "created_at", source: "staff_permission", table: "platform_staff_permission_audit" },
    { order: "created_at", source: "staff_role", table: "platform_staff_role_audit" },
    { order: "created_at", source: "legal_evidence", table: "legal_evidence_audit_log" },
    { order: "created_at", source: "live_ops", table: "admin_live_ops_action_audit" },
    { order: "created_at", source: "platform_admin", table: "platform_admin_audit_logs" },
    { order: "created_at", source: "legal_request", table: "legal_request_intake" },
    { order: "created_at", source: "canary", table: "admin_canary_runs" },
    { order: "created_at", source: "break_glass", table: "platform_break_glass_audit" },
  ];
  const rows: JsonObject[] = [];
  for (const source of sources) {
    const { data, error } = await adminClient.from(source.table).select("*").order(source.order, { ascending: false }).limit(limit);
    if (!error) rows.push(...((data ?? []) as JsonObject[]).map((row) => normalizeAuditRow(source.source, row)));
  }

  const actorUserId = toText(payload.actorUserId ?? payload.actor_user_id);
  const targetUserId = toText(payload.targetUserId ?? payload.target_user_id);
  const targetId = toText(payload.targetId ?? payload.target_id);
  const actionType = toText(payload.actionType ?? payload.action_type).toLowerCase();
  const permissionKey = normalizePermission(payload.permissionKey ?? payload.permission_key);
  const sourceFilter = toText(payload.source).toLowerCase();
  const breakGlassOnly = payload.breakGlassOnly === true || payload.break_glass_only === true;
  const dryRunFilter = payload.dryRun === true ? true : payload.dryRun === false ? false : null;
  const dateFrom = Date.parse(toText(payload.dateFrom ?? payload.date_from));
  const dateTo = Date.parse(toText(payload.dateTo ?? payload.date_to));

  const filtered = rows
    .filter((row) => !(row.actorRole === "owner" && row.breakGlassActive !== true && row.source !== "break_glass"))
    .filter((row) => !actorUserId || row.actorUserId === actorUserId)
    .filter((row) => !targetUserId || row.targetId === targetUserId || toText((row.metadata as JsonObject | undefined)?.target_user_id) === targetUserId)
    .filter((row) => !targetId || row.targetId === targetId || Object.values(row.metadata ?? {}).some((value) => toText(value) === targetId))
    .filter((row) => !actionType || toText(row.action).toLowerCase().includes(actionType))
    .filter((row) => !permissionKey || row.permissionKey === permissionKey || toText((row.metadata as JsonObject | undefined)?.permission_key) === permissionKey)
    .filter((row) => !sourceFilter || row.source === sourceFilter)
    .filter((row) => !breakGlassOnly || row.breakGlassActive === true)
    .filter((row) => dryRunFilter === null || row.dryRun === dryRunFilter)
    .filter((row) => !Number.isFinite(dateFrom) || Date.parse(toText(row.occurredAt)) >= dateFrom)
    .filter((row) => !Number.isFinite(dateTo) || Date.parse(toText(row.occurredAt)) <= dateTo)
    .sort((left, right) => toText(right.occurredAt).localeCompare(toText(left.occurredAt)))
    .slice(0, limit);

  return json(200, { rows: filtered, summary: { returned: filtered.length, scanned: rows.length } });
};

const readCount = async (adminClient: SupabaseClientLike, table: string, filters: Record<string, unknown> = {}) => {
  let query = adminClient.from(table).select("id", { count: "exact", head: true });
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count, error } = await query;
  if (error) return null;
  return count ?? 0;
};

const securityStatus = async (adminClient: SupabaseClientLike, user: AuthenticatedUser) => {
  if (user.role !== "owner") return json(403, { error: "owner_required" });
  const [activeBreakGlass, activeProofRoles, activeProofGrants, unresolvedLegalRequests, activeLegalHolds, openReports] = await Promise.all([
    readCount(adminClient, "platform_break_glass_sessions", { status: "active" }),
    adminClient.from("platform_role_memberships").select("id", { count: "exact", head: true }).eq("status", "active").ilike("email", "liveops.proof+%"),
    adminClient.from("platform_staff_permission_grants").select("id", { count: "exact", head: true }).eq("status", "active").ilike("target_email", "liveops.proof+%"),
    adminClient.from("legal_request_intake").select("id", { count: "exact", head: true }).in("status", ["open", "reviewing"]),
    readCount(adminClient, "legal_holds", { status: "active" }),
    readCount(adminClient, "safety_reports"),
  ]);

  const proofRolesCount = activeProofRoles.error ? null : activeProofRoles.count ?? 0;
  const proofGrantsCount = activeProofGrants.error ? null : activeProofGrants.count ?? 0;
  const legalRequestCount = unresolvedLegalRequests.error ? null : unresolvedLegalRequests.count ?? 0;

  return json(200, {
    security: {
      activeBreakGlassCount: activeBreakGlass,
      emergencyOwnerToolLock: { status: "unknown", message: "No safe backend emergency lock capability is configured." },
      forceLogoutAllOwnerSessions: { status: "unknown", message: "Supabase owner-session force logout is manual unless a reviewed Admin API lane is added." },
      ownerCliChecklist: [
        "Keep owner CLI secrets in local keychain-backed ignored files only.",
        "Do not paste service-role, Cloudflare, LiveKit, or ops tokens into app code or mobile logs.",
        "Rotate temporary proof grants after each controlled proof run.",
      ],
      ownerSessions: { status: "unknown", message: "Owner session/device listing requires a separate reviewed Supabase Admin API integration." },
      proofGrantCount: proofGrantsCount,
      proofRoleCount: proofRolesCount,
      realLiveOpsFlags: { status: "unknown", message: "Live Ops real-action flags require ops service health/config proof." },
    },
    safetyDashboard: {
      activeLegalHolds,
      openReports,
      repeatedReportTargets: { status: "unknown", message: "Repeated-report aggregation is not configured in this low-risk read model." },
      unresolvedLegalRequests: legalRequestCount,
    },
  });
};

const canaryResult = (key: string, label: string, status: "pass" | "fail" | "unknown", message: string, metadata: JsonObject = {}) => ({
  key,
  label,
  metadata: sanitizeObject(metadata),
  message: redactText(message, 500),
  status,
});

const canaryRun = async (
  adminClient: SupabaseClientLike,
  anonClient: SupabaseClientLike,
  user: AuthenticatedUser,
) => {
  if (!hasAnyPermission(user, ["audit_review", "security_review"])) return json(403, { error: "audit_review_required" });
  const results: JsonObject[] = [];

  const ownerLookup = await adminClient
    .from("platform_role_memberships")
    .select("user_id,email")
    .eq("status", "active")
    .eq("role", "owner")
    .order("granted_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const ownerUserId = toText((ownerLookup.data as JsonObject | null)?.user_id);
  if (!ownerUserId) {
    results.push(canaryResult("owner_profile_hidden", "Owner profile hidden from public", "unknown", "No owner user id is available for public RPC proof."));
  } else {
    const publicProfile = await anonClient.rpc("read_public_channel_profile", { profile_user_id: ownerUserId }).catch((error: unknown) => ({ data: null, error }));
    const publicRows = Array.isArray(publicProfile.data) ? publicProfile.data : publicProfile.data ? [publicProfile.data] : [];
    results.push(canaryResult(
      "owner_profile_hidden",
      "Owner profile hidden from public",
      publicProfile.error ? "unknown" : publicRows.length === 0 ? "pass" : "fail",
      publicProfile.error ? "Public profile RPC could not be checked." : publicRows.length === 0 ? "Owner public profile RPC returned no rows." : "Owner profile was visible through the public RPC.",
    ));

    const discovery = await anonClient.from("user_profiles").select("user_id").eq("user_id", ownerUserId).limit(1).catch((error: unknown) => ({ data: null, error }));
    results.push(canaryResult(
      "owner_hidden_discovery",
      "Owner hidden from public discovery/search",
      discovery.error ? "unknown" : (discovery.data ?? []).length === 0 ? "pass" : "fail",
      discovery.error ? "Public user_profiles select could not be checked." : (discovery.data ?? []).length === 0 ? "Owner was not visible in public profile listing." : "Owner appeared in a public profile listing.",
    ));
  }

  results.push(canaryResult("normal_premium_gates", "Normal premium gates active", "unknown", "Requires a real regular account without entitlement for runtime proof; no fake RevenueCat proof is produced."));
  results.push(canaryResult("admin_self_grant_denied", "Admin cannot self-grant", "unknown", "Requires a real non-owner admin proof account; direct fake proof is intentionally not produced."));
  results.push(canaryResult("moderator_grant_denied", "Moderator cannot grant moderators", "unknown", "Requires a real moderator proof account; direct fake proof is intentionally not produced."));
  results.push(canaryResult("legal_evidence_restricted", "Legal Evidence restricted", "unknown", "Requires a real ungranted admin/viewer token to prove function denial."));

  const opsBaseUrl = readOptionalEnv("OPS_AUTOMATION_BASE_URL");
  if (!opsBaseUrl) {
    results.push(canaryResult("live_ops_flags", "Live Ops dry-run and real-action flags", "unknown", "OPS_AUTOMATION_BASE_URL is not configured for this function."));
  } else {
    results.push(canaryResult("live_ops_flags", "Live Ops dry-run and real-action flags", "unknown", "Ops service config proof requires a read-token health contract; not marked green."));
  }

  const supportUrl = readOptionalEnv("PUBLIC_SUPPORT_URL");
  results.push(canaryResult("support_links", "Support/legal links working", supportUrl ? "unknown" : "unknown", supportUrl ? "External link health requires fetch proof in a later lane." : "No support URL env configured for server-side proof."));
  results.push(canaryResult("supabase_redirect_urls", "Supabase redirect URLs configured", readOptionalEnv("SUPABASE_MANAGEMENT_TOKEN") ? "unknown" : "unknown", "Supabase Auth URL proof requires a reviewed Management API lane; not marked green."));

  const publicCandidate = await adminClient
    .from("user_profiles")
    .select("user_id")
    .neq("user_id", ownerUserId || "none")
    .limit(1)
    .maybeSingle()
    .catch((error: unknown) => ({ data: null, error }));
  const candidateUserId = toText((publicCandidate.data as JsonObject | null)?.user_id);
  if (candidateUserId) {
    const publicProfile = await anonClient.rpc("read_public_channel_profile", { profile_user_id: candidateUserId }).catch((error: unknown) => ({ data: null, error }));
    results.push(canaryResult(
      "public_channel_sanitized_rpc",
      "Public profile/channel sanitized RPCs working",
      publicProfile.error ? "unknown" : "pass",
      publicProfile.error ? "Public sanitized RPC could not be checked." : "Public sanitized RPC responded without exposing owner data.",
    ));
  } else {
    results.push(canaryResult("public_channel_sanitized_rpc", "Public profile/channel sanitized RPCs working", "unknown", "No non-owner public profile candidate was available."));
  }

  const activeProofRoles = await adminClient.from("platform_role_memberships").select("id", { count: "exact", head: true }).eq("status", "active").ilike("email", "liveops.proof+%");
  const activeProofGrants = await adminClient.from("platform_staff_permission_grants").select("id", { count: "exact", head: true }).eq("status", "active").ilike("target_email", "liveops.proof+%");
  const proofCount = (activeProofRoles.count ?? 0) + (activeProofGrants.count ?? 0);
  results.push(canaryResult(
    "proof_roles_cleaned",
    "Proof roles/grants cleaned up",
    activeProofRoles.error || activeProofGrants.error ? "unknown" : proofCount === 0 ? "pass" : "fail",
    activeProofRoles.error || activeProofGrants.error ? "Proof role/grant cleanup query failed." : proofCount === 0 ? "No active liveops.proof role/grant rows remain." : `${proofCount} active liveops.proof role/grant rows remain.`,
  ));

  const passCount = results.filter((row) => row.status === "pass").length;
  const failCount = results.filter((row) => row.status === "fail").length;
  const unknownCount = results.filter((row) => row.status === "unknown").length;
  const status = failCount > 0 ? "failed" : unknownCount > 0 ? "partial" : "completed";
  const summary = { failCount, passCount, unknownCount };
  const { data, error } = await adminClient.from("admin_canary_runs").insert({
    requested_by_email: user.email,
    requested_by_role: user.role,
    requested_by_user_id: user.id,
    results,
    status,
    summary,
  }).select("*").single();
  if (error) throw new Error(`Canary run insert failed: ${error.message}`);
  return json(200, { run: sanitizeObject(data), summary });
};

const canaryList = async (adminClient: SupabaseClientLike, user: AuthenticatedUser) => {
  if (!hasAnyPermission(user, ["audit_review", "security_review"])) return json(403, { error: "audit_review_required" });
  const { data, error } = await adminClient.from("admin_canary_runs").select("*").order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error(`Canary list failed: ${error.message}`);
  return json(200, { runs: ((data ?? []) as JsonObject[]).map(sanitizeObject) });
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
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const auth = await authenticate(req, adminClient, supabaseUrl, anonKey);
    if ("error" in auth) return auth.error;

    await expireStaleGrants(adminClient);

    const payload = await req.json().catch(() => null) as JsonObject | null;
    if (!isRecord(payload)) return json(400, { error: "invalid_body" });
    const action = toText(payload.action).toLowerCase();

    if (action === "audit_list") return await auditList(adminClient, auth.user, payload);
    if (action === "template_list") return await templateList();
    if (action === "template_apply") return await templateApply(adminClient, auth.user, payload);
    if (action === "template_revoke") return await templateRevoke(adminClient, auth.user, payload);
    if (action === "break_glass_status") return await breakGlassStatus(adminClient, auth.user);
    if (action === "break_glass_activate") return await breakGlassActivate(adminClient, auth.user, payload);
    if (action === "break_glass_end") return await breakGlassEnd(adminClient, auth.user, payload);
    if (action === "legal_request_create") return await legalRequestCreate(adminClient, auth.user, payload);
    if (action === "legal_request_update") return await legalRequestUpdate(adminClient, auth.user, payload);
    if (action === "legal_request_list") return await legalRequestList(adminClient, auth.user, payload);
    if (action === "security_status") return await securityStatus(adminClient, auth.user);
    if (action === "canary_run") return await canaryRun(adminClient, anonClient, auth.user);
    if (action === "canary_list") return await canaryList(adminClient, auth.user);

    return json(400, { error: "invalid_action" });
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : "owner_controls_failed");
    console.error("admin-owner-controls failure", message);
    return json(500, { error: "owner_controls_failed", message });
  }
});
