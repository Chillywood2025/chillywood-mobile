import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CREATOR_UPLOAD_ACKNOWLEDGEMENT,
  LEGAL_POLICIES,
  LIVE_REPLAY_ACKNOWLEDGEMENT,
  countPolicyWords,
  getPolicyText,
} from "../../../legal/policies.mjs";

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
  evidence_exporter: { label: "Evidence Exporter", permissions: ["evidence_preview", "evidence_export", "legal_request_intake"] },
  dmca_reviewer: { label: "DMCA Reviewer", permissions: ["dmca_review", "copyright_review", "legal_review"] },
  legal_operator: { label: "Legal Operator", permissions: ["legal_ops", "legal_request_intake", "evidence_preview", "evidence_export", "legal_hold", "legal_review"] },
  legal_reviewer: { label: "Legal Reviewer", permissions: ["legal_review", "evidence_preview", "dmca_review", "copyright_review", "legal_request_intake"] },
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
  "copyright_review",
  "dmca_review",
  "emergency_break_glass",
  "evidence_preview",
  "evidence_export",
  "legal_hold",
  "legal_request_intake",
  "legal_ops",
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
    if (
      /(authorization|credential|header|jwt|password|secret|service_role|token|url|uri)/i.test(key) ||
      /(^|_)(api|approval|private|secret|service_role|signing)_(key)$/i.test(key)
    ) {
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

const LEGAL_REQUEST_STATUSES = new Set([
  "received",
  "needs_more_info",
  "under_review",
  "preserved_legal_hold",
  "evidence_prepared",
  "exported",
  "closed",
  "rejected_no_action",
]);

const normalizeLegalRequestStatus = (value: unknown, fallback = "received") => {
  const normalized = toText(value).toLowerCase();
  const mapped = normalized === "open" ? "received"
    : normalized === "reviewing" ? "under_review"
      : normalized === "fulfilled" ? "exported"
        : normalized === "rejected" ? "rejected_no_action"
          : normalized;
  return LEGAL_REQUEST_STATUSES.has(mapped) ? mapped : fallback;
};

const normalizeLegalRequestType = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  return [
    "law_enforcement",
    "civil_legal",
    "preservation",
    "court_order",
    "subpoena",
    "emergency",
    "dmca_related",
    "other",
  ].includes(normalized) ? normalized : "law_enforcement";
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

const writeLegalRequestEvent = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
  input: {
    eventType: string;
    legalRequestId: string;
    message: string;
    metadata?: JsonObject;
    reason: string;
  },
) => {
  const { error } = await adminClient.from("legal_request_events").insert({
    actor_email: user.email,
    actor_role: user.role,
    actor_user_id: user.id,
    event_type: input.eventType,
    legal_request_id: input.legalRequestId,
    message: redactText(input.message, 500),
    metadata: sanitizeObject({
      ...(input.metadata ?? {}),
      break_glass_active: !!user.activeBreakGlassSessionId,
      break_glass_session_id: user.activeBreakGlassSessionId,
    }),
    reason: input.reason,
  });
  if (error) throw new Error(`Legal request event write failed: ${error.message}`);
};

const legalRequestList = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (user.role === "moderator") return json(403, { error: "owner_or_approved_operator_required" });
  if (!hasAnyPermission(user, ["legal_request_intake", "legal_review", "legal_ops", "evidence_preview", "evidence_export", "legal_hold"])) return json(403, { error: "legal_permission_required" });
  const limit = parseLimit(payload.limit, 25, 100);
  let query = adminClient.from("legal_request_intake").select("*");
  const status = toText(payload.status);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Legal intake list failed: ${error.message}`);
  const rows = ((data ?? []) as JsonObject[])
    .filter((row) => !isRecord(row.metadata) || row.metadata.canary_proof !== true);
  return json(200, { requests: rows.map(sanitizeObject) });
};

const legalRequestDetail = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (user.role === "moderator") return json(403, { error: "owner_or_approved_operator_required" });
  if (!hasAnyPermission(user, ["legal_request_intake", "legal_review", "legal_ops", "evidence_preview", "evidence_export", "legal_hold"])) return json(403, { error: "legal_permission_required" });
  const requestId = toText(payload.id ?? payload.requestId ?? payload.request_id);
  if (!requestId) return json(400, { error: "legal_request_id_required" });
  const request = await adminClient.from("legal_request_intake").select("*").eq("id", requestId).maybeSingle();
  if (request.error) throw new Error(`Legal intake detail failed: ${request.error.message}`);
  if (!request.data) return json(404, { error: "legal_request_not_found" });
  const [events, evidenceRequests, holds] = await Promise.all([
    adminClient.from("legal_request_events").select("*").eq("legal_request_id", requestId).order("created_at", { ascending: true }).limit(100),
    adminClient.from("legal_evidence_requests").select("id,request_kind,status,target_type,target_id,export_hash,created_at,completed_at,requested_by_user_id,requested_by_email,search_scope,preview").eq("legal_request_id", requestId).order("created_at", { ascending: false }).limit(50),
    adminClient.from("legal_holds").select("*").eq("legal_request_id", requestId).order("placed_at", { ascending: false }).limit(50),
  ]);
  const firstError = events.error || evidenceRequests.error || holds.error;
  if (firstError) throw new Error(`Legal intake detail child read failed: ${firstError.message}`);
  return json(200, {
    events: ((events.data ?? []) as JsonObject[]).map(sanitizeObject),
    evidenceRequests: ((evidenceRequests.data ?? []) as JsonObject[]).map(sanitizeObject),
    holds: ((holds.data ?? []) as JsonObject[]).map(sanitizeObject),
    request: sanitizeObject(request.data),
  });
};

const legalRequestCreate = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (user.role === "moderator") return json(403, { error: "owner_or_approved_operator_required" });
  if (!hasAnyPermission(user, ["legal_request_intake", "legal_review", "legal_ops"])) return json(403, { error: "legal_request_intake_required" });
  const reason = resolveAdminReason(user, payload.auditReason ?? payload.audit_reason ?? payload.requestReason ?? payload.request_reason, "Owner legal request intake record.");
  const requestingAgency = redactText(payload.requestingAgency ?? payload.requesting_agency, 180);
  const requestReason = redactText(payload.requestReason ?? payload.request_reason ?? reason, 1000);
  if (requestingAgency.length < 2) return json(400, { error: "requesting_agency_required" });
  if (requestReason.length < 6) return json(400, { error: "request_reason_required" });
  const status = normalizeLegalRequestStatus(payload.status, "received");
  const { data, error } = await adminClient.from("legal_request_intake").insert({
    case_number: redactText(payload.caseNumber ?? payload.case_number, 180) || null,
    contact_email: normalizeEmail(payload.contactEmail ?? payload.contact_email) || null,
    contact_name: redactText(payload.contactName ?? payload.contact_name, 180) || null,
    contact_phone: redactText(payload.contactPhone ?? payload.contact_phone, 80) || null,
    date_from: toText(payload.dateFrom ?? payload.date_from) || null,
    date_to: toText(payload.dateTo ?? payload.date_to) || null,
    due_at: toText(payload.dueAt ?? payload.due_at) || null,
    exported_summary: redactText(payload.exportedSummary ?? payload.exported_summary, 1000) || null,
    handled_by_email: user.email,
    handled_by_user_id: user.id,
    metadata: {
      break_glass_active: !!user.activeBreakGlassSessionId,
      break_glass_session_id: user.activeBreakGlassSessionId,
      created_actor_role: user.role,
      canary_proof: payload.canaryProof === true || payload.canary_proof === true,
    },
    notes: redactText(payload.notes, 1500) || null,
    request_reason: requestReason,
    request_type: normalizeLegalRequestType(payload.requestType ?? payload.request_type),
    requesting_agency: requestingAgency,
    reviewed_summary: redactText(payload.reviewedSummary ?? payload.reviewed_summary, 1000) || null,
    status,
    target_content_id: redactText(payload.targetContentId ?? payload.target_content_id, 180) || null,
    target_report_id: redactText(payload.targetReportId ?? payload.target_report_id, 180) || null,
    target_room_id: redactText(payload.targetRoomId ?? payload.target_room_id, 180) || null,
    target_thread_id: redactText(payload.targetThreadId ?? payload.target_thread_id, 180) || null,
    target_user_id: redactText(payload.targetUserId ?? payload.target_user_id, 180) || null,
  }).select("*").single();
  if (error) throw new Error(`Legal intake create failed: ${error.message}`);
  const legalRequestId = toText((data as JsonObject).id);
  await writeLegalRequestEvent(adminClient, user, {
    eventType: "request_created",
    legalRequestId,
    message: "Legal request created.",
    metadata: { status },
    reason,
  });
  if (
    toText(payload.targetUserId ?? payload.target_user_id)
    || toText(payload.targetContentId ?? payload.target_content_id)
    || toText(payload.targetThreadId ?? payload.target_thread_id)
    || toText(payload.targetRoomId ?? payload.target_room_id)
    || toText(payload.targetReportId ?? payload.target_report_id)
  ) {
    await writeLegalRequestEvent(adminClient, user, {
      eventType: "target_linked",
      legalRequestId,
      message: "Target identifiers linked.",
      metadata: {
        target_content_id: redactText(payload.targetContentId ?? payload.target_content_id, 180) || null,
        target_report_id: redactText(payload.targetReportId ?? payload.target_report_id, 180) || null,
        target_room_id: redactText(payload.targetRoomId ?? payload.target_room_id, 180) || null,
        target_thread_id: redactText(payload.targetThreadId ?? payload.target_thread_id, 180) || null,
        target_user_id: redactText(payload.targetUserId ?? payload.target_user_id, 180) || null,
      },
      reason,
    });
  }

  await writePlatformAudit(adminClient, user, {
    action: "legal_request_intake_create",
    metadata: { legal_request_id: legalRequestId, status: toText((data as JsonObject).status) },
    reason,
    targetId: legalRequestId,
    targetType: "legal_request_intake",
  });
  if (user.activeBreakGlassSessionId) {
    await writeBreakGlassAudit(adminClient, user, {
      action: user.role === "owner" ? "owner_action" : "admin_action",
      metadata: { legal_request_id: legalRequestId },
      reason,
      targetId: legalRequestId,
      targetType: "legal_request_intake",
    });
  }

  return json(200, { ok: true, request: sanitizeObject(data) });
};

const legalRequestUpdate = async (adminClient: SupabaseClientLike, user: AuthenticatedUser, payload: JsonObject) => {
  if (user.role === "moderator") return json(403, { error: "owner_or_approved_operator_required" });
  if (!hasAnyPermission(user, ["legal_request_intake", "legal_review", "legal_ops"])) return json(403, { error: "legal_request_intake_required" });
  const requestId = toText(payload.id ?? payload.requestId ?? payload.request_id);
  if (!requestId) return json(400, { error: "legal_request_id_required" });
  const reason = resolveAdminReason(user, payload.auditReason ?? payload.audit_reason ?? payload.reason, "Owner updated legal request intake.");
  const before = await adminClient.from("legal_request_intake").select("*").eq("id", requestId).maybeSingle();
  if (before.error) throw new Error(`Legal intake lookup failed: ${before.error.message}`);
  if (!before.data) return json(404, { error: "legal_request_not_found" });
  const patch: JsonObject = {
    handled_by_email: user.email,
    handled_by_user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  for (const [inputKey, column] of [
    ["reviewedSummary", "reviewed_summary"],
    ["reviewed_summary", "reviewed_summary"],
    ["exportedSummary", "exported_summary"],
    ["exported_summary", "exported_summary"],
    ["notes", "notes"],
    ["targetUserId", "target_user_id"],
    ["target_user_id", "target_user_id"],
    ["targetContentId", "target_content_id"],
    ["target_content_id", "target_content_id"],
    ["targetThreadId", "target_thread_id"],
    ["target_thread_id", "target_thread_id"],
    ["targetRoomId", "target_room_id"],
    ["target_room_id", "target_room_id"],
    ["targetReportId", "target_report_id"],
    ["target_report_id", "target_report_id"],
  ]) {
    if (payload[inputKey] !== undefined) patch[column] = redactText(payload[inputKey], column === "notes" ? 1500 : 1000) || null;
  }
  if (payload.status !== undefined) {
    const nextStatus = normalizeLegalRequestStatus(payload.status, toText((before.data as JsonObject).status) || "received");
    patch.status = nextStatus;
    if (nextStatus === "closed" || nextStatus === "rejected_no_action") patch.closed_at = new Date().toISOString();
    if (toText((before.data as JsonObject).status) === "closed" && nextStatus !== "closed") patch.reopened_at = new Date().toISOString();
  }
  const { data, error } = await adminClient.from("legal_request_intake")
    .update(patch)
    .eq("id", requestId)
    .select("*")
    .single();
  if (error) throw new Error(`Legal intake update failed: ${error.message}`);
  const nextStatus = toText((data as JsonObject).status);
  const previousStatus = toText((before.data as JsonObject).status);
  if (payload.status !== undefined && nextStatus !== previousStatus) {
    await writeLegalRequestEvent(adminClient, user, {
      eventType: nextStatus === "closed" || nextStatus === "rejected_no_action" ? "request_closed" : previousStatus === "closed" ? "request_reopened" : "status_changed",
      legalRequestId: requestId,
      message: `Status changed from ${previousStatus || "unknown"} to ${nextStatus}.`,
      metadata: { next_status: nextStatus, previous_status: previousStatus },
      reason,
    });
  }
  if (payload.notes !== undefined && redactText(payload.notes, 1500)) {
    await writeLegalRequestEvent(adminClient, user, {
      eventType: "note_added",
      legalRequestId: requestId,
      message: "Internal note added.",
      metadata: { note_length: redactText(payload.notes, 1500).length },
      reason,
    });
  }
  if (
    payload.targetUserId !== undefined
    || payload.target_user_id !== undefined
    || payload.targetContentId !== undefined
    || payload.target_content_id !== undefined
    || payload.targetThreadId !== undefined
    || payload.target_thread_id !== undefined
    || payload.targetRoomId !== undefined
    || payload.target_room_id !== undefined
    || payload.targetReportId !== undefined
    || payload.target_report_id !== undefined
  ) {
    await writeLegalRequestEvent(adminClient, user, {
      eventType: "target_linked",
      legalRequestId: requestId,
      message: "Target identifiers updated.",
      metadata: {
        target_content_id: toText((data as JsonObject).target_content_id) || null,
        target_report_id: toText((data as JsonObject).target_report_id) || null,
        target_room_id: toText((data as JsonObject).target_room_id) || null,
        target_thread_id: toText((data as JsonObject).target_thread_id) || null,
        target_user_id: toText((data as JsonObject).target_user_id) || null,
      },
      reason,
    });
  }
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
    adminClient.from("legal_request_intake").select("id", { count: "exact", head: true }).in("status", ["received", "needs_more_info", "under_review", "preserved_legal_hold", "evidence_prepared"]),
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

type CanaryStatus = "pass" | "fail" | "manual_required";
type CanaryResultInput = {
  actor: string;
  actual: string;
  cleanupStatus?: string | null;
  details?: JsonObject;
  expected: string;
  key: string;
  label: string;
  section: string;
  status: CanaryStatus;
  testedAt?: string;
  testedSurface: string;
};

const DEFAULT_SUPPORT_EMAIL = "support@chillywoodstream.com";
const DEFAULT_PRIVACY_URL = "https://live.chillywoodstream.com/privacy";
const DEFAULT_TERMS_URL = "https://live.chillywoodstream.com/terms";
const PROOF_EMAILS = {
  admin: "liveops.proof+admin@chillywoodstream.com",
  grantedAdmin: "liveops.proof+granted-admin@chillywoodstream.com",
  moderator: "liveops.proof+moderator@chillywoodstream.com",
  targetModerator: "liveops.proof+target-moderator@chillywoodstream.com",
  viewer: "liveops.proof+viewer@chillywoodstream.com",
} as const;
const PREMIUM_ENTITLEMENT_KEYS = ["premium", "premium_watch_party", "premium_live", "paid_content"] as const;

const canaryResult = (input: CanaryResultInput) => ({
  actor: input.actor,
  actual: redactText(input.actual, 500),
  cleanupStatus: input.cleanupStatus ? redactText(input.cleanupStatus, 260) : null,
  details: sanitizeObject(input.details ?? {}),
  expected: redactText(input.expected, 500),
  key: input.key,
  label: input.label,
  message: redactText(input.actual, 500),
  metadata: sanitizeObject(input.details ?? {}),
  section: input.section,
  status: input.status,
  testedAt: input.testedAt ?? new Date().toISOString(),
  testedSurface: redactText(input.testedSurface, 260),
});

const safeSupabaseCall = async (operation: () => PromiseLike<{ data?: unknown; error?: unknown; count?: number | null }>) => {
  try {
    return await operation();
  } catch (error) {
    return { data: null, error };
  }
};

const randomProofPassword = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `Canary!${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}aA1`;
};

const listAuthUserByEmail = async (adminClient: SupabaseClientLike, email: string) => {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Proof auth list failed: ${error.message}`);
    const users = Array.isArray(data?.users) ? data.users : [];
    const user = users.find((entry: JsonObject) => normalizeEmail(entry.email) === email);
    if (user) return user as JsonObject;
    if (users.length < 1000) break;
  }
  return null;
};

const ensureProofUser = async (
  adminClient: SupabaseClientLike,
  anonClient: SupabaseClientLike,
  email: string,
  label: string,
) => {
  const password = randomProofPassword();
  let user: JsonObject | null = null;
  const created = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { canary_proof: true, proof_label: label },
  });

  if (created.error) {
    const message = toText(created.error.message).toLowerCase();
    if (!message.includes("already") && !message.includes("registered") && !message.includes("exists")) {
      throw new Error(`Proof auth create failed for ${label}: ${created.error.message}`);
    }
    user = await listAuthUserByEmail(adminClient, email);
    if (!user) throw new Error(`Proof auth reuse failed for ${label}: user not found`);
    const update = await adminClient.auth.admin.updateUserById(toText(user.id), {
      email_confirm: true,
      password,
      user_metadata: { ...(isRecord(user.user_metadata) ? user.user_metadata : {}), canary_proof: true, proof_label: label },
    });
    if (update.error) throw new Error(`Proof auth update failed for ${label}: ${update.error.message}`);
    user = update.data?.user as JsonObject;
  } else {
    user = created.data?.user as JsonObject;
  }

  const userId = toText(user?.id);
  if (!userId) throw new Error(`Proof auth user id missing for ${label}`);
  const signedIn = await anonClient.auth.signInWithPassword({ email, password });
  const accessToken = toText(signedIn.data?.session?.access_token);
  if (signedIn.error || !accessToken) throw new Error(`Proof auth sign-in failed for ${label}: ${signedIn.error?.message ?? "missing session"}`);
  return { accessToken, email, label, userId };
};

const proofClientForToken = (supabaseUrl: string, anonKey: string, accessToken: string) => createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
});

const cleanupProofAccess = async (adminClient: SupabaseClientLike, reason: string) => {
  const now = new Date().toISOString();
  const roles = await adminClient
    .from("platform_role_memberships")
    .update({ notes: reason, revoked_at: now, revoked_by: "admin-owner-controls-canary", status: "revoked", updated_at: now })
    .eq("status", "active")
    .ilike("email", "liveops.proof+%")
    .select("id,role,email");
  const grants = await adminClient
    .from("platform_staff_permission_grants")
    .update({ reason, revoked_at: now, revoked_by: "admin-owner-controls-canary", status: "revoked", updated_at: now })
    .eq("status", "active")
    .ilike("target_email", "liveops.proof+%")
    .select("id,permission_key,target_email");
  const activeRoles = await adminClient
    .from("platform_role_memberships")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .ilike("email", "liveops.proof+%");
  const activeGrants = await adminClient
    .from("platform_staff_permission_grants")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .ilike("target_email", "liveops.proof+%");

  const errors = [roles.error, grants.error, activeRoles.error, activeGrants.error]
    .filter(Boolean)
    .map((error: { message?: string }) => redactText(error.message, 220));
  const activeCount = (activeRoles.count ?? 0) + (activeGrants.count ?? 0);
  return {
    activeCount,
    errors,
    ok: errors.length === 0 && activeCount === 0,
    summary: errors.length
      ? `cleanup failed: ${errors.join("; ")}`
      : activeCount === 0
        ? `cleanup passed; revoked ${(roles.data ?? []).length} proof roles and ${(grants.data ?? []).length} proof grants`
        : `cleanup incomplete; ${activeCount} active proof role/grant rows remain`,
  };
};

const ensureProofRole = async (
  adminClient: SupabaseClientLike,
  proofUser: { email: string; userId: string },
  role: "operator" | "moderator",
) => {
  const now = new Date().toISOString();
  let existing = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("role", role)
    .ilike("email", proofUser.email)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(`Proof role lookup failed: ${existing.error.message}`);
  if (!existing.data?.id) {
    existing = await adminClient
      .from("platform_role_memberships")
      .select("id")
      .eq("role", role)
      .eq("user_id", proofUser.userId)
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error(`Proof role lookup failed: ${existing.error.message}`);
  }
  if (existing.data?.id) {
    const update = await adminClient
      .from("platform_role_memberships")
      .update({
        email: proofUser.email,
        granted_at: now,
        granted_by: "admin-owner-controls-canary",
        notes: "CANARY PROOF temporary role; revoke during canary cleanup.",
        revoked_at: null,
        revoked_by: null,
        status: "active",
        updated_at: now,
        user_id: proofUser.userId,
      })
      .eq("id", existing.data.id);
    if (update.error) throw new Error(`Proof role update failed: ${update.error.message}`);
    return;
  }
  const insert = await adminClient.from("platform_role_memberships").insert({
    email: proofUser.email,
    granted_by: "admin-owner-controls-canary",
    notes: "CANARY PROOF temporary role; revoke during canary cleanup.",
    role,
    status: "active",
    user_id: proofUser.userId,
  });
  if (insert.error) throw new Error(`Proof role insert failed: ${insert.error.message}`);
};

const ensureProofPermission = async (
  adminClient: SupabaseClientLike,
  proofUser: { email: string; userId: string },
  permissionKey: string,
) => {
  const insert = await adminClient.from("platform_staff_permission_grants").insert({
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    granted_by: "admin-owner-controls-canary",
    metadata: { canary_proof: true, cleanup_required: true, granted_actor_role: "system" },
    permission_key: permissionKey,
    reason: "CANARY PROOF temporary scoped permission; revoke during canary cleanup.",
    status: "active",
    target_email: proofUser.email,
    target_user_id: proofUser.userId,
  });
  if (insert.error) throw new Error(`Proof permission insert failed: ${insert.error.message}`);
};

const countOwnerNormalAuditRows = async (adminClient: SupabaseClientLike) => {
  const [platform, legal] = await Promise.all([
    adminClient.from("platform_admin_audit_logs").select("id", { count: "exact", head: true }).eq("actor_role", "owner"),
    adminClient.from("legal_evidence_audit_log").select("id", { count: "exact", head: true }).eq("actor_role", "owner"),
  ]);
  return {
    legal: legal.error ? null : legal.count ?? 0,
    platform: platform.error ? null : platform.count ?? 0,
  };
};

const didCountStaySame = (before: { legal: number | null; platform: number | null }, after: { legal: number | null; platform: number | null }) =>
  before.legal !== null && before.platform !== null && before.legal === after.legal && before.platform === after.platform;

const createTimedClient = (supabaseUrl: string, anonKey: string, token: string) => proofClientForToken(supabaseUrl, anonKey, token);

const callLegalEvidence = async (
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  action: string,
  input: JsonObject = {},
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/admin-legal-evidence`, {
      body: JSON.stringify({
        action: action === "hold" ? "place_hold" : action,
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-01-01T00:01:00.000Z",
        reason: "CANARY PROOF legal evidence permission check.",
        targetType: "date_range",
        ...sanitizeObject(input),
      }),
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, payload: sanitizeObject(payload), status: response.status };
  } catch (error) {
    return { ok: false, payload: { error: redactText(error instanceof Error ? error.message : error) }, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
};

const callOwnerControls = async (
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  action: string,
  input: JsonObject = {},
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/admin-owner-controls`, {
      body: JSON.stringify({ ...sanitizeObject(input), action }),
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, payload: sanitizeObject(payload), status: response.status };
  } catch (error) {
    return { ok: false, payload: { error: redactText(error instanceof Error ? error.message : error) }, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchJsonWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { text: redactText(text, 500) };
    }
    return { body: sanitizeObject(body), ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchRawJsonWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    return { body: isRecord(body) ? body : {}, ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchStatusWithTimeout = async (url: string, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
};

const legalPolicyCanaryResults = (supportEmail: string, privacyUrl: string, termsUrl: string) => {
  const results: JsonObject[] = [];
  const requiredMinimum = 1500;

  for (const policy of LEGAL_POLICIES) {
    const wordCount = countPolicyWords(policy);
    results.push(canaryResult({
      actor: "system",
      actual: `${policy.title} bundled policy has ${wordCount} words.`,
      details: { path: policy.path, slug: policy.slug, word_count: wordCount },
      expected: `Bundled ${policy.title} exists and has at least ${requiredMinimum} words.`,
      key: `legal_policy_${policy.slug}`,
      label: `${policy.title} exists and is production length`,
      section: "Legal Readiness",
      status: wordCount >= requiredMinimum ? "pass" : "fail",
      testedSurface: `bundled policy: ${policy.path}`,
    }));
  }

  const allPolicyText = LEGAL_POLICIES.map(getPolicyText).join("\n\n").toLowerCase();
  const creatorPolicy = LEGAL_POLICIES.find((policy) => policy.slug === "creator-rules");
  const creatorPolicyText = getPolicyText(creatorPolicy).toLowerCase();
  const accountDeletion = LEGAL_POLICIES.find((policy) => policy.slug === "account-deletion");
  const accountDeletionText = getPolicyText(accountDeletion).toLowerCase();
  const copyright = LEGAL_POLICIES.find((policy) => policy.slug === "copyright");
  const copyrightText = getPolicyText(copyright).toLowerCase();
  const supportEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail);
  const publicLinksConfigured = /^https:\/\/[^/]+/.test(privacyUrl) && /^https:\/\/[^/]+/.test(termsUrl);
  const creatorLicenseOk = creatorPolicyText.includes("worldwide, non-exclusive, royalty-free, sublicensable, transferable license")
    && creatorPolicyText.includes("host, store, cache, back up, stream")
    && creatorPolicyText.includes("monetize, and display");
  const uploadAckOk = CREATOR_UPLOAD_ACKNOWLEDGEMENT.includes("I own this content or have permission")
    && CREATOR_UPLOAD_ACKNOWLEDGEMENT.includes("monetize this content as described in the Creator Terms");
  const liveAckOk = LIVE_REPLAY_ACKNOWLEDGEMENT.includes("live content, speaker audio/video, chat, replays")
    && LIVE_REPLAY_ACKNOWLEDGEMENT.includes("preserved as allowed by Chi'llwood rules and legal requirements");
  const ownershipBad = /chi'?ll'?wood\s+owns\s+(creator\s+)?(your\s+)?content/i.test(allPolicyText)
    || /content\s+belongs\s+to\s+chi'?ll'?wood/i.test(allPolicyText);
  const licenseBad = /chi'?ll'?wood\s+(does\s+not|doesn't|lacks)\s+(have\s+)?(a\s+)?(license|right).{0,80}(host|use|display|stream|monetize)/i.test(allPolicyText);
  const deletionOk = accountDeletionText.includes("google play")
    && accountDeletionText.includes("in-app")
    && accountDeletionText.includes("public web")
    && accountDeletionText.includes("account deletion");
  const dmcaChecklistOk = copyrightText.includes("owner launch checklist")
    && copyrightText.includes("designated agent")
    && copyrightText.includes("counter-notice")
    && copyrightText.includes("repeat infringer");

  const checks = [
    {
      actual: creatorLicenseOk ? "Creator Content License clause includes ownership retention and broad service license." : "Creator Content License clause is missing required ownership/license terms.",
      expected: "Creator policy grants Chi'llwood a broad service license while preserving creator ownership.",
      key: "legal_creator_content_license_clause",
      label: "Creator Content License clause exists",
      status: creatorLicenseOk ? "pass" : "fail",
      surface: "bundled policy: /creator-rules",
    },
    {
      actual: uploadAckOk ? "Upload/publish acknowledgement text is present." : "Upload/publish acknowledgement text is missing.",
      expected: "Creator upload acknowledgement includes ownership, third-party rights, platform use, moderation, and monetization notice.",
      key: "legal_upload_acknowledgement",
      label: "Upload/publish acknowledgement exists",
      status: uploadAckOk ? "pass" : "fail",
      surface: "constant: CREATOR_UPLOAD_ACKNOWLEDGEMENT",
    },
    {
      actual: liveAckOk ? "Live/replay acknowledgement text is present." : "Live/replay acknowledgement text is missing.",
      expected: "Live/replay acknowledgement covers speaker audio/video, chat, replays, metadata, moderation, and preservation.",
      key: "legal_live_replay_acknowledgement",
      label: "Live/replay acknowledgement exists",
      status: liveAckOk ? "pass" : "fail",
      surface: "constant: LIVE_REPLAY_ACKNOWLEDGEMENT",
    },
    {
      actual: ownershipBad ? "A prohibited Chi'llwood-owns-content phrase was detected." : "No prohibited Chi'llwood-owns-creator-content phrase was detected.",
      expected: "Legal text must not say Chi'llwood owns creator content.",
      key: "legal_no_ownership_claim",
      label: "No legal text says Chi'llwood owns creator content",
      status: ownershipBad ? "fail" : "pass",
      surface: "bundled legal policy corpus",
    },
    {
      actual: licenseBad ? "A prohibited no-license/right-to-use phrase was detected." : "No prohibited no-license/right-to-use phrase was detected.",
      expected: "Legal text must not say Chi'llwood lacks rights to host/use uploaded content.",
      key: "legal_no_license_disclaimer",
      label: "No legal text says Chi'llwood lacks rights to host/use uploaded content",
      status: licenseBad ? "fail" : "pass",
      surface: "bundled legal policy corpus",
    },
    {
      actual: deletionOk ? "Account Deletion policy includes Google Play, in-app, and public web deletion paths." : "Account Deletion policy is missing Google Play/in-app/public web deletion language.",
      expected: "Google Play account deletion links and paths are documented.",
      key: "legal_google_play_deletion_paths",
      label: "Google Play account deletion links/paths exist",
      status: deletionOk ? "pass" : "fail",
      surface: "bundled policy: /account-deletion",
    },
    {
      actual: dmcaChecklistOk ? "Copyright policy includes DMCA agent launch checklist." : "Copyright policy is missing DMCA agent checklist language.",
      expected: "DMCA agent registration checklist exists.",
      key: "legal_dmca_agent_checklist",
      label: "DMCA agent checklist exists",
      status: dmcaChecklistOk ? "pass" : "fail",
      surface: "bundled policy: /copyright",
    },
    {
      actual: supportEmailOk ? "Support email format is configured." : "Support email is missing or invalid.",
      expected: "Support email/path configured.",
      key: "legal_support_email_configured",
      label: "Support email/path configured",
      status: supportEmailOk ? "pass" : "fail",
      surface: "env/default: PUBLIC_SUPPORT_EMAIL",
    },
    {
      actual: publicLinksConfigured ? "Public legal URLs are configured and bundled fallback policies are present." : "Public legal URLs are missing; bundled fallback policies are present.",
      expected: "Public legal links configured or bundled fallback available.",
      key: "legal_public_links_or_bundled_fallback",
      label: "Public legal links configured or bundled fallback available",
      status: publicLinksConfigured || LEGAL_POLICIES.length >= 12 ? "pass" : "fail",
      surface: "runtime legal URLs + bundled policies",
    },
  ];

  for (const check of checks) {
    results.push(canaryResult({
      actor: "system",
      actual: check.actual,
      expected: check.expected,
      key: check.key,
      label: check.label,
      section: "Legal Readiness",
      status: check.status as CanaryStatus,
      testedSurface: check.surface,
    }));
  }

  return results;
};

const DMCA_CANARY_CONTENT_ID = "CANARY-DMCA-CONTENT-DO-NOT-MODERATE";
const CANONICAL_PUBLIC_DMCA_URL = "https://chillywoodstream.com/copyright-report";
const DMCA_EVIDENCE_BUCKET = "dmca-evidence";
const DMCA_EMAIL_INTAKE_STATUS =
  "Manual email intake enabled through support/admin recording; automated inbound email ingestion is not configured.";
const DMCA_CONTENT_MUTATION_MATRIX = [
  { contentType: "creator_video", stateLookup: "videos", mutation: "enabled", reason: "Safe moderation_status disable/hide/restore route exists on videos." },
  { contentType: "profile_post", stateLookup: "profile_posts", mutation: "enabled", reason: "Safe moderation_status disable/hide/restore route exists on profile_posts." },
  { contentType: "profile_post_comment", stateLookup: "profile_post_comments", mutation: "enabled", reason: "Safe moderation_status disable/hide/restore route exists on profile_post_comments." },
  { contentType: "comment", stateLookup: "profile_post_comments", mutation: "enabled", reason: "Comment aliases profile_post_comments for safe moderation_status mutation." },
  { contentType: "creator_video_comment", stateLookup: "creator_video_comments", mutation: "enabled", reason: "Safe moderation_status disable/hide/restore route exists on creator_video_comments." },
  { contentType: "reply", stateLookup: "creator_video_comments", mutation: "enabled", reason: "Reply aliases creator_video_comments for safe moderation_status mutation." },
  { contentType: "social_attachment", stateLookup: "social_attachments", mutation: "enabled", reason: "Safe moderation_status disable/hide/restore route exists on social_attachments." },
  { contentType: "attachment", stateLookup: "social_attachments", mutation: "enabled", reason: "Attachment aliases social_attachments for safe moderation_status mutation." },
  { contentType: "live_room", stateLookup: null, mutation: "disabled", reason: "Missing backend piece: safe DMCA disable/restore route for live_room/replay-live content; preserve evidence and route through legal/live operations without LiveKit actions." },
  { contentType: "channel", stateLookup: null, mutation: "disabled", reason: "Missing backend piece: safe DMCA disable/restore route for channel-level takedowns; preserve evidence and use support/legal handling." },
  { contentType: "other", stateLookup: null, mutation: "disabled", reason: "Missing backend piece: no backed content table for other; preserved_evidence and rejected_no_action remain available as case records." },
] as const;

const buildDmcaCanaryPayload = (label: string) => ({
  accuracyPenaltyPerjuryStatement: true,
  authorityStatement: true,
  claimantCompany: "Chi'llwood Canary",
  claimantEmail: "liveops.proof+dmca@chillywoodstream.com",
  claimantName: "CANARY PROOF DMCA Reporter",
  contentId: DMCA_CANARY_CONTENT_ID,
  contentType: "other",
  contentUrl: "/canary/dmca-proof-content",
  copyrightOwnerName: "CANARY PROOF Copyright Owner",
  copyrightedWorkDescription: `${label}: canary-only copyrighted work description.`,
  copyrightedWorkUrls: ["https://example.invalid/canary-dmca-work"],
  electronicSignature: "CANARY PROOF DMCA Reporter",
  goodFaithStatement: true,
  infringingMaterialDescription: `${label}: canary-only allegedly infringing material description.`,
  reporterCompany: "Chi'llwood Canary",
  reporterEmail: "liveops.proof+dmca@chillywoodstream.com",
  reporterIsOwner: true,
  reporterName: "CANARY PROOF DMCA Reporter",
});

const cleanupDmcaCanaryCase = async (adminClient: SupabaseClientLike, caseId: string) => {
  if (!caseId) return "cleanup skipped; no DMCA canary case id";
  const attachmentRows = await adminClient
    .from("dmca_attachments")
    .select("object_path")
    .eq("dmca_case_id", caseId);
  const attachmentPaths = Array.isArray(attachmentRows.data)
    ? (attachmentRows.data as JsonObject[]).map((row) => toText(row.object_path)).filter(Boolean)
    : [];
  const storageRemoval = attachmentPaths.length
    ? await adminClient.storage.from(DMCA_EVIDENCE_BUCKET).remove(attachmentPaths)
    : { data: [], error: null };
  const deletes = await Promise.all([
    adminClient.from("dmca_attachments").delete().eq("dmca_case_id", caseId),
    adminClient.from("dmca_audit_log").delete().eq("dmca_case_id", caseId),
    adminClient.from("dmca_content_actions").delete().eq("dmca_case_id", caseId),
    adminClient.from("dmca_strikes").delete().eq("dmca_case_id", caseId),
    adminClient.from("dmca_counter_notices").delete().eq("dmca_case_id", caseId),
  ]);
  const caseDelete = await adminClient.from("dmca_cases").delete().eq("id", caseId);
  const errors = [attachmentRows, storageRemoval, ...deletes, caseDelete]
    .map((result) => result.error)
    .filter(Boolean)
    .map((error: { message?: string }) => redactText(error.message, 220));
  return errors.length
    ? `cleanup failed: ${errors.join("; ")}`
    : `cleanup passed; DMCA canary case, child records, and ${attachmentPaths.length} evidence object(s) deleted`;
};

const dmcaAdminCanaryResults = async (
  adminClient: SupabaseClientLike,
  anonClient: SupabaseClientLike,
  grantedDmcaClient: SupabaseClientLike,
  viewerClient: SupabaseClientLike,
  grantedProof: { email: string; userId: string },
  viewerProof: { userId: string },
) => {
  const results: JsonObject[] = [];
  let caseId = "";
  let caseNumber = "";
  let strikeId = "";
  let counterNoticeId = "";
  let dmcaCleanupStatus = "not needed";
  let publicCaseId = "";
  let publicDmcaCleanupStatus = "not needed";

  const tableNames = ["dmca_cases", "dmca_content_actions", "dmca_strikes", "dmca_counter_notices", "dmca_attachments", "dmca_audit_log"] as const;
  const tableChecks = await Promise.all(tableNames.map((table) =>
    safeSupabaseCall(() => adminClient.from(table).select("id", { count: "exact", head: true }).limit(1))
  ));
  const tableErrors = tableChecks
    .map((result, index) => result.error ? `${tableNames[index]}: ${redactText((result.error as { message?: string }).message, 180)}` : "")
    .filter(Boolean);
  results.push(canaryResult({
    actor: "system",
    actual: tableErrors.length ? `DMCA table proof failed: ${tableErrors.join("; ")}` : "DMCA case, action, strike, counter-notice, attachment, and history tables responded.",
    details: { checked_tables: [...tableNames], errors: tableErrors },
    expected: "DMCA cases table and child case-record tables exist.",
    key: "dmca_cases_table_exists",
    label: "DMCA cases tables exist",
    section: "DMCA / Copyright",
    status: tableErrors.length ? "fail" : "pass",
    testedSurface: "tables: dmca_cases, dmca_content_actions, dmca_strikes, dmca_counter_notices, dmca_attachments, dmca_audit_log",
  }));

  const publicNotice = await safeSupabaseCall(() => anonClient.rpc("submit_dmca_notice", {
    p_payload: buildDmcaCanaryPayload("Public hosted form canary"),
  }));
  const publicCreated = Array.isArray(publicNotice.data)
    ? publicNotice.data[0]
    : isRecord(publicNotice.data)
      ? publicNotice.data
      : {};
  publicCaseId = toText((publicCreated as JsonObject).id);
  const publicAttachmentToken = toText((publicCreated as JsonObject).attachment_token);
  const publicCaseRead = publicCaseId
    ? await safeSupabaseCall(() => adminClient
      .from("dmca_cases")
      .select("id,case_number,source,copyright_owner_name,allegedly_infringing_material_description")
      .eq("id", publicCaseId)
      .maybeSingle())
    : { data: null, error: publicNotice.error ?? new Error("public_case_id_missing") };
  const publicCaseRow = isRecord(publicCaseRead.data) ? publicCaseRead.data : {};
  const publicFormOk = !publicNotice.error
    && !publicCaseRead.error
    && !!publicCaseId
    && toText(publicCaseRow.source) === "public_form"
    && !!toText(publicCaseRow.copyright_owner_name)
    && !!toText(publicCaseRow.allegedly_infringing_material_description);
  results.push(canaryResult({
    actor: "signed-out public",
    actual: publicFormOk
      ? `Public DMCA notice submission created case ${toText(publicCaseRow.case_number) || publicCaseId} with full required public fields.`
      : "Public DMCA notice submission did not create a complete case record.",
    cleanupStatus: "pending public DMCA proof cleanup",
    details: {
      case_created: !!publicCaseId,
      public_notice_error: publicNotice.error ? redactText((publicNotice.error as { message?: string }).message, 260) : null,
      public_read_error: publicCaseRead.error ? redactText((publicCaseRead.error as { message?: string }).message, 260) : null,
      source: toText(publicCaseRow.source),
      stored_copyright_owner: !!toText(publicCaseRow.copyright_owner_name),
      stored_infringing_material_description: !!toText(publicCaseRow.allegedly_infringing_material_description),
    },
    expected: "Public DMCA form backing creates a real Admin DMCA case without admin login.",
    key: "dmca_public_form_submission",
    label: "DMCA public form submission works",
    section: "DMCA / Copyright",
    status: publicFormOk ? "pass" : "fail",
    testedSurface: "rpc: submit_dmca_notice as anon + admin readback for required fields",
  }));

  const publicAttachmentPath = publicCaseId && publicAttachmentToken
    ? `public-intake/${publicCaseId}/${publicAttachmentToken}/canary-public-evidence.txt`
    : "";
  const publicAttachmentUpload = publicAttachmentPath
    ? await safeSupabaseCall(() => anonClient.storage
      .from(DMCA_EVIDENCE_BUCKET)
      .upload(publicAttachmentPath, new Blob(["CANARY PROOF public DMCA evidence"], { type: "text/plain" }), {
        contentType: "text/plain",
        upsert: false,
      }))
    : { data: null, error: publicNotice.error ?? new Error("public_attachment_token_missing") };
  const publicAttachmentMetadata = publicAttachmentPath && !publicAttachmentUpload.error
    ? await safeSupabaseCall(() => anonClient.rpc("submit_dmca_attachment_metadata", {
      p_payload: {
        attachmentToken: publicAttachmentToken,
        caseId: publicCaseId,
        fileName: "canary-public-evidence.txt",
        mimeType: "text/plain",
        objectPath: publicAttachmentPath,
        sizeBytes: 32,
        source: "public_notice",
      },
    }))
    : { data: null, error: publicAttachmentUpload.error ?? new Error("public_attachment_upload_failed") };
  const publicAttachmentId = toText((isRecord(publicAttachmentMetadata.data) ? publicAttachmentMetadata.data : {}).id);
  const publicAttachmentRead = publicAttachmentId
    ? await safeSupabaseCall(() => adminClient
      .from("dmca_attachments")
      .select("id,dmca_case_id,source,scan_status,retention_status,object_path")
      .eq("id", publicAttachmentId)
      .maybeSingle())
    : { data: null, error: publicAttachmentMetadata.error ?? new Error("public_attachment_metadata_missing") };
  const anonAttachmentRead = publicAttachmentPath
    ? await safeSupabaseCall(() => anonClient.storage.from(DMCA_EVIDENCE_BUCKET).download(publicAttachmentPath))
    : { data: null, error: new Error("public_attachment_path_missing") };
  const publicAttachmentRow = isRecord(publicAttachmentRead.data) ? publicAttachmentRead.data : {};
  const publicAttachmentOk = !publicAttachmentUpload.error
    && !publicAttachmentMetadata.error
    && !publicAttachmentRead.error
    && toText(publicAttachmentRow.source) === "public_notice"
    && toText(publicAttachmentRow.scan_status) === "pending_manual_review"
    && !!anonAttachmentRead.error;
  results.push(canaryResult({
    actor: "signed-out public",
    actual: publicAttachmentOk
      ? "Public DMCA evidence upload created private attachment metadata; anonymous download was denied and scan status is pending manual review."
      : "Public DMCA evidence attachment flow failed or was readable publicly.",
    cleanupStatus: "pending public DMCA proof cleanup",
    details: {
      admin_attachment_read: !publicAttachmentRead.error,
      anon_download_denied: !!anonAttachmentRead.error,
      metadata_error: publicAttachmentMetadata.error ? redactText((publicAttachmentMetadata.error as { message?: string }).message, 260) : null,
      scan_status: toText(publicAttachmentRow.scan_status),
      storage_upload_error: publicAttachmentUpload.error ? redactText((publicAttachmentUpload.error as { message?: string }).message, 260) : null,
    },
    expected: "Public DMCA attachments upload to a private bucket, create case metadata, and do not fake malware scan success.",
    key: "dmca_attachment_support",
    label: "DMCA attachment upload works",
    section: "DMCA / Copyright",
    status: publicAttachmentOk ? "pass" : "fail",
    testedSurface: "storage: dmca-evidence public-intake + rpc: submit_dmca_attachment_metadata + anon download denial",
  }));

  const dmcaScopedGrant = await safeSupabaseCall(() => adminClient.from("platform_staff_permission_grants").insert({
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    granted_by: "admin-owner-controls-canary",
    metadata: { canary_proof: true, cleanup_required: true, granted_actor_role: "system" },
    permission_key: "dmca_review",
    reason: "CANARY PROOF temporary DMCA scoped permission; revoke during canary cleanup.",
    status: "active",
    target_email: grantedProof.email,
    target_user_id: grantedProof.userId,
  }));
  results.push(canaryResult({
    actor: "system",
    actual: dmcaScopedGrant.error ? "dmca_review scoped grant failed." : "dmca_review scoped permission key accepted.",
    cleanupStatus: "pending proof cleanup",
    details: { error: dmcaScopedGrant.error ? redactText((dmcaScopedGrant.error as { message?: string }).message, 240) : null },
    expected: "dmca_review can be granted as a scoped Admin/Operator permission.",
    key: "dmca_scoped_permission_key",
    label: "DMCA scoped permission key accepted",
    section: "DMCA / Copyright",
    status: dmcaScopedGrant.error ? "fail" : "pass",
    testedSurface: "table: platform_staff_permission_grants permission_key=dmca_review",
  }));

  const intake = await safeSupabaseCall(() => grantedDmcaClient.rpc("admin_dmca_create_case", {
    p_payload: buildDmcaCanaryPayload("Formal notice intake canary"),
    p_source: "admin_manual",
  }));
  const createdCase = isRecord(intake.data) ? intake.data : {};
  caseId = toText(createdCase.id);
  caseNumber = toText(createdCase.case_number);
  results.push(canaryResult({
    actor: "proof admin with legal_review/dmca_review",
    actual: !intake.error && caseId ? `Formal DMCA notice intake created case ${caseNumber || caseId}.` : "Formal DMCA notice intake failed.",
    cleanupStatus: "pending DMCA proof cleanup",
    details: { case_created: !!caseId, error: intake.error ? redactText((intake.error as { message?: string }).message, 260) : null },
    expected: "Formal notice intake RPC creates a real DMCA case.",
    key: "dmca_formal_notice_intake",
    label: "Formal notice intake works",
    section: "DMCA / Copyright",
    status: !intake.error && !!caseId ? "pass" : "fail",
    testedSurface: "rpc: admin_dmca_create_case",
  }));

  if (caseId) {
    const [caseDetail, auditDetail] = await Promise.all([
      safeSupabaseCall(() => grantedDmcaClient.from("dmca_cases").select("*").eq("id", caseId).single()),
      safeSupabaseCall(() => grantedDmcaClient.from("dmca_audit_log").select("id,event_type").eq("dmca_case_id", caseId).limit(20)),
    ]);
    const auditRows = Array.isArray(auditDetail.data) ? auditDetail.data as JsonObject[] : [];
    results.push(canaryResult({
      actor: "proof admin with legal_review/dmca_review",
      actual: !caseDetail.error && isRecord(caseDetail.data) && auditRows.length > 0
        ? "DMCA case detail and timeline rows loaded."
        : "DMCA case detail or timeline could not be loaded.",
      cleanupStatus: "pending DMCA proof cleanup",
      details: {
        audit_rows: auditRows.length,
        case_loaded: isRecord(caseDetail.data),
        error: caseDetail.error ? redactText((caseDetail.error as { message?: string }).message, 260) : null,
      },
      expected: "Opened DMCA case detail includes case row and history.",
      key: "dmca_case_detail_opens",
      label: "DMCA case detail opens",
      section: "DMCA / Copyright",
      status: !caseDetail.error && isRecord(caseDetail.data) && auditRows.length > 0 ? "pass" : "fail",
      testedSurface: "tables: dmca_cases + dmca_audit_log through RLS",
    }));

    const contentAction = await safeSupabaseCall(() => grantedDmcaClient.rpc("admin_dmca_record_content_action", {
      p_action: "preserved_evidence",
      p_case_id: caseId,
      p_content_id: DMCA_CANARY_CONTENT_ID,
      p_content_type: "other",
      p_reason: "CANARY PROOF preserved evidence only; no backed content mutation.",
    }));
    results.push(canaryResult({
      actor: "proof admin with legal_review/dmca_review",
      actual: contentAction.error ? "DMCA content action recording failed." : "DMCA preserved-evidence content action recorded without deleting content.",
      cleanupStatus: "pending DMCA proof cleanup",
      details: { error: contentAction.error ? redactText((contentAction.error as { message?: string }).message, 260) : null },
      expected: "Content action recording creates a case record and timeline entry.",
      key: "dmca_content_action_recording",
      label: "DMCA content action recording works",
      section: "DMCA / Copyright",
      status: contentAction.error ? "fail" : "pass",
      testedSurface: "rpc: admin_dmca_record_content_action(action=preserved_evidence)",
    }));

    const strikeAdd = await safeSupabaseCall(() => grantedDmcaClient.rpc("admin_dmca_add_strike", {
      p_case_id: caseId,
      p_channel_id: null,
      p_content_id: DMCA_CANARY_CONTENT_ID,
      p_content_type: "other",
      p_reason: "CANARY PROOF valid takedown/preservation strike.",
      p_severity: "standard",
      p_user_id: viewerProof.userId,
    }));
    strikeId = toText((isRecord(strikeAdd.data) ? strikeAdd.data : {}).id);
    const strikeDispute = strikeId
      ? await safeSupabaseCall(() => grantedDmcaClient.rpc("admin_dmca_update_strike_status", {
        p_reason: "CANARY PROOF counter-notice dispute.",
        p_status: "disputed",
        p_strike_id: strikeId,
      }))
      : { data: null, error: new Error("strike_id_missing") };
    const strikeResolve = strikeId
      ? await safeSupabaseCall(() => grantedDmcaClient.rpc("admin_dmca_update_strike_status", {
        p_reason: "CANARY PROOF dispute resolved.",
        p_status: "resolved",
        p_strike_id: strikeId,
      }))
      : { data: null, error: new Error("strike_id_missing") };
    const strikeOk = !strikeAdd.error && !strikeDispute.error && !strikeResolve.error;
    results.push(canaryResult({
      actor: "proof admin with legal_review/dmca_review",
      actual: strikeOk ? "Copyright strike add, dispute, and resolve flow succeeded." : "Copyright strike flow failed.",
      cleanupStatus: "pending DMCA proof cleanup",
      details: {
        add_error: strikeAdd.error ? redactText((strikeAdd.error as { message?: string }).message, 220) : null,
        dispute_error: strikeDispute.error ? redactText((strikeDispute.error as { message?: string }).message, 220) : null,
        resolve_error: strikeResolve.error ? redactText((strikeResolve.error as { message?: string }).message, 220) : null,
      },
      expected: "Strike add/remove/dispute backing RPC flow works.",
      key: "dmca_strike_flow",
      label: "DMCA strike add/dispute/resolve works",
      section: "DMCA / Copyright",
      status: strikeOk ? "pass" : "fail",
      testedSurface: "rpcs: admin_dmca_add_strike + admin_dmca_update_strike_status",
    }));

    const counterNotice = await safeSupabaseCall(() => grantedDmcaClient.rpc("admin_dmca_record_counter_notice", {
      p_case_id: caseId,
      p_forwarded_to_claimant: false,
      p_payload: {
        electronicSignature: "CANARY PROOF Counter Submitter",
        goodFaithMistakeStatement: true,
        jurisdictionConsentStatement: true,
        removedMaterialDescription: "CANARY PROOF removed material statement.",
        removedMaterialUrlOrLocation: DMCA_CANARY_CONTENT_ID,
        serviceAcceptanceStatement: true,
        submitterEmail: "liveops.proof+counter@chillywoodstream.com",
        submitterName: "CANARY PROOF Counter Submitter",
        submitterUserId: viewerProof.userId,
      },
    }));
    counterNoticeId = toText((isRecord(counterNotice.data) ? counterNotice.data : {}).id);
    const counterForward = counterNoticeId
      ? await safeSupabaseCall(() => grantedDmcaClient.rpc("admin_dmca_forward_counter_notice", {
        p_counter_notice_id: counterNoticeId,
        p_reason: "CANARY PROOF forwarding window.",
      }))
      : { data: null, error: new Error("counter_notice_id_missing") };
    const counterEligible = counterNoticeId
      ? await safeSupabaseCall(() => grantedDmcaClient.rpc("admin_dmca_mark_restore_eligible", {
        p_case_id: caseId,
        p_counter_notice_id: counterNoticeId,
        p_reason: "CANARY PROOF response window eligibility.",
      }))
      : { data: null, error: new Error("counter_notice_id_missing") };
    const counterOk = !counterNotice.error && !counterForward.error && !counterEligible.error;
    results.push(canaryResult({
      actor: "proof admin with legal_review/dmca_review",
      actual: counterOk ? "Counter-notice record, forward, and restore-eligible flow succeeded." : "Counter-notice flow failed.",
      cleanupStatus: "pending DMCA proof cleanup",
      details: {
        eligible_error: counterEligible.error ? redactText((counterEligible.error as { message?: string }).message, 220) : null,
        forward_error: counterForward.error ? redactText((counterForward.error as { message?: string }).message, 220) : null,
        record_error: counterNotice.error ? redactText((counterNotice.error as { message?: string }).message, 220) : null,
      },
      expected: "Counter-notice recording and response-window actions work.",
      key: "dmca_counter_notice_recording",
      label: "DMCA counter-notice flow works",
      section: "DMCA / Copyright",
      status: counterOk ? "pass" : "fail",
      testedSurface: "rpcs: admin_dmca_record_counter_notice + forward + mark_restore_eligible",
    }));

    await safeSupabaseCall(() => adminClient
      .from("dmca_cases")
      .update({
        status: "content_disabled",
        updated_at: new Date().toISOString(),
        uploader_user_id: viewerProof.userId,
      })
      .eq("id", caseId));
    const uploaderCaseRead = await safeSupabaseCall(() => viewerClient.rpc("read_my_dmca_counter_notice_case", {
      p_case_id: caseId,
    }));
    const uploaderCounterNotice = await safeSupabaseCall(() => viewerClient.rpc("submit_dmca_counter_notice", {
      p_case_id: caseId,
      p_payload: {
        electronicSignature: "CANARY PROOF Uploader Counter Submitter",
        goodFaithMistakeStatement: true,
        jurisdictionConsentStatement: true,
        removedMaterialDescription: "CANARY PROOF uploader self-service counter-notice statement.",
        removedMaterialUrlOrLocation: DMCA_CANARY_CONTENT_ID,
        serviceAcceptanceStatement: true,
        submitterEmail: "liveops.proof+viewer@chillywoodstream.com",
        submitterName: "CANARY PROOF Uploader Counter Submitter",
      },
    }));
    const uploaderCounterNoticeId = toText((isRecord(uploaderCounterNotice.data) ? uploaderCounterNotice.data : {}).id);
    const uploaderAttachmentPath = uploaderCounterNoticeId
      ? `uploader-counter-notice/${caseId}/${viewerProof.userId}/${uploaderCounterNoticeId}/canary-counter-evidence.txt`
      : "";
    const uploaderAttachmentUpload = uploaderAttachmentPath
      ? await safeSupabaseCall(() => viewerClient.storage
        .from(DMCA_EVIDENCE_BUCKET)
        .upload(uploaderAttachmentPath, new Blob(["CANARY PROOF uploader counter-notice evidence"], { type: "text/plain" }), {
          contentType: "text/plain",
          upsert: false,
        }))
      : { data: null, error: uploaderCounterNotice.error ?? new Error("uploader_counter_notice_id_missing") };
    const uploaderAttachmentMetadata = uploaderAttachmentPath && !uploaderAttachmentUpload.error
      ? await safeSupabaseCall(() => viewerClient.rpc("submit_dmca_attachment_metadata", {
        p_payload: {
          caseId,
          counterNoticeId: uploaderCounterNoticeId,
          fileName: "canary-counter-evidence.txt",
          mimeType: "text/plain",
          objectPath: uploaderAttachmentPath,
          sizeBytes: 44,
          source: "uploader_counter_notice",
        },
      }))
      : { data: null, error: uploaderAttachmentUpload.error ?? new Error("uploader_counter_attachment_upload_failed") };
    const unauthorizedCounterNotice = await safeSupabaseCall(() => grantedDmcaClient.rpc("submit_dmca_counter_notice", {
      p_case_id: caseId,
      p_payload: {
        electronicSignature: "CANARY PROOF Wrong Uploader",
        goodFaithMistakeStatement: true,
        jurisdictionConsentStatement: true,
        removedMaterialDescription: "CANARY PROOF should be denied for another user's case.",
        removedMaterialUrlOrLocation: DMCA_CANARY_CONTENT_ID,
        serviceAcceptanceStatement: true,
        submitterEmail: "liveops.proof+granted-admin@chillywoodstream.com",
        submitterName: "CANARY PROOF Wrong Uploader",
      },
    }));
    const adminCounterRead = await safeSupabaseCall(() => grantedDmcaClient
      .from("dmca_counter_notices")
      .select("id,submitter_user_id,status")
      .eq("id", uploaderCounterNoticeId)
      .maybeSingle());
    const adminAttachmentRead = await safeSupabaseCall(() => grantedDmcaClient
      .from("dmca_attachments")
      .select("id,counter_notice_id,source,scan_status")
      .eq("counter_notice_id", uploaderCounterNoticeId)
      .limit(10));
    const adminAttachmentRows = Array.isArray(adminAttachmentRead.data) ? adminAttachmentRead.data as JsonObject[] : [];
    const uploaderCounterOk = !uploaderCaseRead.error
      && !uploaderCounterNotice.error
      && !!uploaderCounterNoticeId
      && !uploaderAttachmentUpload.error
      && !uploaderAttachmentMetadata.error
      && !adminCounterRead.error
      && adminAttachmentRows.some((row) => toText(row.source) === "uploader_counter_notice")
      && !!unauthorizedCounterNotice.error;
    results.push(canaryResult({
      actor: "proof uploader",
      actual: uploaderCounterOk
        ? "Uploader self-service counter-notice succeeded for the case owner, attached evidence for manual scan review, appeared in Admin detail data, and denied another user."
        : "Uploader self-service counter-notice flow failed or did not enforce ownership.",
      cleanupStatus: "pending DMCA proof cleanup",
      details: {
        admin_attachment_rows: adminAttachmentRows.length,
        admin_attachment_read_error: adminAttachmentRead.error ? redactText((adminAttachmentRead.error as { message?: string }).message, 220) : null,
        admin_counter_read_error: adminCounterRead.error ? redactText((adminCounterRead.error as { message?: string }).message, 220) : null,
        attachment_metadata_error: uploaderAttachmentMetadata.error ? redactText((uploaderAttachmentMetadata.error as { message?: string }).message, 220) : null,
        attachment_upload_error: uploaderAttachmentUpload.error ? redactText((uploaderAttachmentUpload.error as { message?: string }).message, 220) : null,
        case_read_error: uploaderCaseRead.error ? redactText((uploaderCaseRead.error as { message?: string }).message, 220) : null,
        counter_notice_id: uploaderCounterNoticeId ? "[created]" : "",
        counter_submit_error: uploaderCounterNotice.error ? redactText((uploaderCounterNotice.error as { message?: string }).message, 220) : null,
        unauthorized_denied: !!unauthorizedCounterNotice.error,
        unauthorized_error: unauthorizedCounterNotice.error ? redactText((unauthorizedCounterNotice.error as { message?: string }).message, 220) : null,
      },
      expected: "Uploader self-service counter-notice works only for the matching uploader and Admin sees the counter-notice plus attachments.",
      key: "dmca_uploader_counter_notice_status",
      label: "Uploader counter-notice self-service works",
      section: "DMCA / Copyright",
      status: uploaderCounterOk ? "pass" : "fail",
      testedSurface: "rpcs: read_my_dmca_counter_notice_case + submit_dmca_counter_notice + private counter attachment upload + Admin RLS readback",
    }));

    const searchPattern = `%${caseNumber || caseId}%`;
    const filterSearch = await safeSupabaseCall(() => grantedDmcaClient
      .from("dmca_cases")
      .select("id,status,case_number,reporter_email,allegedly_infringing_content_id")
      .or(`case_number.ilike.${searchPattern},id.eq.${caseId},reporter_email.ilike.%liveops.proof+dmca%,allegedly_infringing_content_id.ilike.%CANARY-DMCA%`)
      .limit(10));
    const filterRows = Array.isArray(filterSearch.data) ? filterSearch.data as JsonObject[] : [];
    results.push(canaryResult({
      actor: "proof admin with legal_review/dmca_review",
      actual: !filterSearch.error && filterRows.some((row) => toText(row.id) === caseId)
        ? "DMCA filter/search query returned the proof case."
        : "DMCA filter/search query did not return the proof case.",
      cleanupStatus: "pending DMCA proof cleanup",
      details: { error: filterSearch.error ? redactText((filterSearch.error as { message?: string }).message, 260) : null, returned_rows: filterRows.length },
      expected: "Search by case id/case number/reporter/content id works through backend filtering.",
      key: "dmca_filters_search",
      label: "DMCA filters and search work",
      section: "DMCA / Copyright",
      status: !filterSearch.error && filterRows.some((row) => toText(row.id) === caseId) ? "pass" : "fail",
      testedSurface: "table: dmca_cases RLS search/filter select",
    }));

    const unauthorizedCreate = await safeSupabaseCall(() => viewerClient.rpc("admin_dmca_create_case", {
      p_payload: buildDmcaCanaryPayload("Unauthorized viewer canary"),
      p_source: "admin_manual",
    }));
    const unauthorizedRead = await safeSupabaseCall(() => viewerClient.from("dmca_cases").select("id").eq("id", caseId).limit(1));
    const unauthorizedRows = Array.isArray(unauthorizedRead.data) ? unauthorizedRead.data as JsonObject[] : [];
    const denied = !!unauthorizedCreate.error && unauthorizedRows.length === 0;
    results.push(canaryResult({
      actor: "proof viewer",
      actual: denied ? "Regular viewer was denied by DMCA RPC and RLS." : "Regular viewer could access an Admin DMCA surface.",
      cleanupStatus: "pending DMCA proof cleanup",
      details: {
        create_error: unauthorizedCreate.error ? redactText((unauthorizedCreate.error as { message?: string }).message, 240) : null,
        read_rows: unauthorizedRows.length,
      },
      expected: "Unauthorized users are denied server-side.",
      key: "dmca_unauthorized_denied",
      label: "DMCA unauthorized users denied server-side",
      section: "DMCA / Copyright",
      status: denied ? "pass" : "fail",
      testedSurface: "rpc/table: admin_dmca_create_case + dmca_cases RLS as viewer",
    }));

    const backedFlowOk = !intake.error && !contentAction.error && strikeOk && counterOk && !filterSearch.error && denied;
    results.push(canaryResult({
      actor: "system",
      actual: backedFlowOk ? "All DMCA Admin visible workflow buttons are backed by working RPC/table flows in canary." : "One or more DMCA Admin workflow backing checks failed.",
      cleanupStatus: "pending DMCA proof cleanup",
      expected: "No visible DMCA Admin buttons are dead.",
      key: "dmca_no_dead_buttons",
      label: "DMCA no-dead-button backing checks",
      section: "DMCA / Copyright",
      status: backedFlowOk ? "pass" : "fail",
      testedSurface: "aggregate DMCA workflow canary",
    }));
  }

  dmcaCleanupStatus = await cleanupDmcaCanaryCase(adminClient, caseId);
  publicDmcaCleanupStatus = await cleanupDmcaCanaryCase(adminClient, publicCaseId);
  for (const row of results) {
    if (isRecord(row) && toText(row.cleanupStatus) === "pending DMCA proof cleanup") row.cleanupStatus = dmcaCleanupStatus;
    if (isRecord(row) && toText(row.cleanupStatus) === "pending public DMCA proof cleanup") row.cleanupStatus = publicDmcaCleanupStatus;
  }

  const proofDmcaCases = await safeSupabaseCall(() => adminClient
    .from("dmca_cases")
    .select("id", { count: "exact", head: true })
    .eq("is_test_case", false)
    .or("reporter_email.ilike.%proof%,reporter_name.ilike.%proof%,reporter_name.ilike.%demo%,reporter_name.ilike.%canary%,reporter_email.ilike.%canary%"));
  const proofCount = proofDmcaCases.count ?? 0;
  results.push(canaryResult({
    actor: "system",
    actual: proofDmcaCases.error ? "DMCA proof/demo case visibility query failed." : proofCount === 0 ? "No unmarked proof/demo DMCA cases are visible after cleanup." : `${proofCount} proof/demo DMCA case rows remain unmarked.`,
    cleanupStatus: dmcaCleanupStatus,
    details: { error: proofDmcaCases.error ? redactText((proofDmcaCases.error as { message?: string }).message, 220) : null, proof_demo_case_count: proofCount },
    expected: "Proof/demo cases are absent or explicitly marked test-only so production clients hide them.",
    key: "dmca_no_demo_cases",
    label: "DMCA no proof/demo cases visible",
    section: "DMCA / Copyright",
    status: proofDmcaCases.error ? "manual_required" : proofCount === 0 ? "pass" : "fail",
    testedSurface: "table: dmca_cases proof/demo cleanup query",
  }));

  const configuredPublicDmcaUrl = readOptionalEnv("PUBLIC_DMCA_URL") ?? readOptionalEnv("PUBLIC_COPYRIGHT_REPORT_URL");
  const publicDmcaUrl = configuredPublicDmcaUrl || CANONICAL_PUBLIC_DMCA_URL;
  try {
    const publicLink = await fetchStatusWithTimeout(publicDmcaUrl);
    results.push(canaryResult({
      actor: "system",
      actual: publicLink.ok
        ? `Public DMCA URL returned HTTP 2xx (${configuredPublicDmcaUrl ? "env configured" : "repo canonical default"}).`
        : `Public DMCA URL returned HTTP ${publicLink.status}.`,
      details: { configured_by_env: !!configuredPublicDmcaUrl, http_status: publicLink.status, url: publicDmcaUrl },
      expected: "Public DMCA/legal link is configured and reachable.",
      key: "dmca_public_link_config",
      label: "DMCA public hosted URL configured",
      section: "DMCA / Copyright",
      status: publicLink.ok ? "pass" : "fail",
      testedSurface: configuredPublicDmcaUrl ? "GET PUBLIC_DMCA_URL/PUBLIC_COPYRIGHT_REPORT_URL" : "GET canonical repo public DMCA URL",
    }));
  } catch (error) {
    results.push(canaryResult({
      actor: "system",
      actual: `Public DMCA URL fetch failed: ${redactText(error instanceof Error ? error.message : error, 420)}`,
      details: { configured_by_env: !!configuredPublicDmcaUrl, url: publicDmcaUrl },
      expected: "Public DMCA/legal link is configured and reachable.",
      key: "dmca_public_link_config",
      label: "DMCA public hosted URL configured",
      section: "DMCA / Copyright",
      status: "fail",
      testedSurface: configuredPublicDmcaUrl ? "GET PUBLIC_DMCA_URL/PUBLIC_COPYRIGHT_REPORT_URL" : "GET canonical repo public DMCA URL",
    }));
  }

  results.push(canaryResult({
    actor: "system",
    actual: DMCA_EMAIL_INTAKE_STATUS,
    expected: "DMCA email intake automation/manual mode is clearly reported.",
    key: "dmca_email_intake_status",
    label: "DMCA email intake mode reported",
    section: "DMCA / Copyright",
    status: "pass",
    testedSurface: "Admin intake copy + canary config status",
  }));

  for (const item of DMCA_CONTENT_MUTATION_MATRIX) {
    results.push(canaryResult({
      actor: "system",
      actual: item.mutation === "enabled"
        ? `${item.contentType}: disable/hide/restore enabled through ${item.stateLookup}. ${item.reason}`
        : `${item.contentType}: disable/hide/restore disabled. ${item.reason}`,
      details: {
        content_type: item.contentType,
        mutation: item.mutation,
        state_lookup: item.stateLookup,
        reason: item.reason,
      },
      expected: "Every DMCA content type has backed mutation support or an exact disabled reason.",
      key: `dmca_content_mutation_${item.contentType}`,
      label: `DMCA content mutation: ${item.contentType}`,
      section: "DMCA / Copyright",
      status: "pass",
      testedSurface: item.stateLookup ? `rpc: admin_dmca_record_content_action + admin_dmca_get_content_state (${item.stateLookup})` : "Admin disabled reason / preserve-only case record",
    }));
  }

  return results;
};

const canaryRun = async (
  adminClient: SupabaseClientLike,
  anonClient: SupabaseClientLike,
  user: AuthenticatedUser,
  supabaseUrl: string,
  anonKey: string,
) => {
  if (!hasAnyPermission(user, ["audit_review", "security_review"])) return json(403, { error: "audit_review_required" });
  const results: JsonObject[] = [];
  const ownerAuditBefore = await countOwnerNormalAuditRows(adminClient);
  let cleanupStatus = "not needed";
  await cleanupProofAccess(adminClient, "CANARY PROOF pre-run cleanup.");

  const ownerLookup = await adminClient
    .from("platform_role_memberships")
    .select("user_id,email")
    .eq("status", "active")
    .eq("role", "owner")
    .order("granted_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  let ownerUserId = toText((ownerLookup.data as JsonObject | null)?.user_id);
  if (!ownerUserId && user.role === "owner") ownerUserId = user.id;
  if (!ownerUserId) {
    results.push(canaryResult({
      actor: "system",
      actual: "No owner user id is available for public RPC proof.",
      expected: "Active owner user id is resolvable.",
      key: "owner_profile_hidden",
      label: "Owner profile hidden from public",
      section: "Owner Protection",
      status: "manual_required",
      testedSurface: "platform_role_memberships owner lookup",
    }));
  } else {
    const publicProfile = await safeSupabaseCall(() => anonClient.rpc("read_public_channel_profile", { profile_user_id: ownerUserId }));
    const publicRows = Array.isArray(publicProfile.data) ? publicProfile.data : publicProfile.data ? [publicProfile.data] : [];
    results.push(canaryResult({
      actor: "signed-out public",
      actual: publicProfile.error ? "Public profile RPC could not be checked." : publicRows.length === 0 ? "Owner public profile RPC returned no rows." : "Owner profile was visible through the public RPC.",
      details: { row_count: publicRows.length },
      expected: "Owner public profile RPC returns no rows.",
      key: "owner_profile_hidden",
      label: "Owner profile hidden from public",
      section: "Owner Protection",
      status: publicProfile.error ? "manual_required" : publicRows.length === 0 ? "pass" : "fail",
      testedSurface: "rpc: read_public_channel_profile(profile_user_id=owner)",
    }));

    const discovery = await safeSupabaseCall(() => anonClient.from("user_profiles").select("user_id").eq("user_id", ownerUserId).limit(1));
    const discoveryRows = Array.isArray(discovery.data) ? discovery.data : [];
    const discoveryErrorText = discovery.error ? redactText(discovery.error, 420) : "";
    const discoveryReadBlocked = /42501|403|forbidden|not authorized|permission denied|row-level security/i.test(discoveryErrorText);
    results.push(canaryResult({
      actor: "signed-out public",
      actual: discoveryRows.length > 0
        ? "Owner appeared in a public profile listing."
        : discovery.error
          ? "Public user_profiles listing returned no owner rows and raw listing is blocked; owner cannot be returned through this public surface."
          : "Owner was not visible in public profile listing.",
      details: {
        public_read_blocked_by_policy: discovery.error ? discoveryReadBlocked : false,
        row_count: discoveryRows.length,
      },
      expected: "Owner is absent from public user_profiles listing/search.",
      key: "owner_hidden_discovery",
      label: "Owner hidden from public discovery/search",
      section: "Owner Protection",
      status: discoveryRows.length > 0 ? "fail" : "pass",
      testedSurface: "table: user_profiles public select",
    }));
  }

  if (user.role === "owner") {
    const ownerLegalCreate = await legalRequestCreate(adminClient, user, {
      canaryProof: true,
      caseNumber: `CANARY-OWNER-LEGAL-${Date.now()}`,
      requestReason: "CANARY PROOF owner normal Legal Intake functional case record.",
      requestType: "other",
      requestingAgency: "Canary Owner Legal Proof",
      status: "received",
    });
    const ownerLegalPayload = await ownerLegalCreate.json().catch(() => ({}));
    results.push(canaryResult({
      actor: "owner",
      actual: ownerLegalCreate.ok
        ? "Owner normal Legal Intake create wrote a functional hidden case record without needing an app-audit reason prompt."
        : `Owner normal Legal Intake create failed with HTTP ${ownerLegalCreate.status}.`,
      cleanupStatus: "hidden canary legal request retained as metadata.canary_proof=true",
      details: { request_id: toText((sanitizeObject(ownerLegalPayload).request as JsonObject | undefined)?.id), status: ownerLegalCreate.status },
      expected: "Owner can use Legal Intake normally; functional case history exists, but owner-sensitive app audit rows are not required unless Break Glass is active.",
      key: "legal_owner_normal_intake_no_prompt",
      label: "Owner normal Legal Intake works without reason prompt",
      section: "Legal / Evidence",
      status: ownerLegalCreate.ok ? "pass" : "fail",
      testedSurface: "function: admin-owner-controls legal_request_create as owner",
    }));
  } else {
    results.push(canaryResult({
      actor: "system",
      actual: "Canary was not run by owner, so owner-normal Legal Intake runtime proof was not executed in this run.",
      expected: "Owner-run canary proves owner normal Legal Intake does not require app-audit reason prompts.",
      key: "legal_owner_normal_intake_no_prompt",
      label: "Owner normal Legal Intake works without reason prompt",
      section: "Legal / Evidence",
      status: "manual_required",
      testedSurface: "function: admin-owner-controls legal_request_create as owner",
    }));
  }

  try {
    const [viewer, adminProof, grantedAdmin, moderatorProof] = await Promise.all([
      ensureProofUser(adminClient, anonClient, PROOF_EMAILS.viewer, "viewer"),
      ensureProofUser(adminClient, anonClient, PROOF_EMAILS.admin, "admin_without_grants"),
      ensureProofUser(adminClient, anonClient, PROOF_EMAILS.grantedAdmin, "admin_with_legal_review"),
      ensureProofUser(adminClient, anonClient, PROOF_EMAILS.moderator, "moderator"),
    ]);
    await Promise.all([
      ensureProofUser(adminClient, anonClient, PROOF_EMAILS.targetModerator, "moderator_target"),
      ensureProofRole(adminClient, adminProof, "operator"),
      ensureProofRole(adminClient, grantedAdmin, "operator"),
      ensureProofRole(adminClient, moderatorProof, "moderator"),
    ]);
    await ensureProofPermission(adminClient, grantedAdmin, "legal_review");
    await adminClient.from("user_entitlements").delete().eq("user_id", viewer.userId).in("entitlement_key", [...PREMIUM_ENTITLEMENT_KEYS]);

    const viewerClient = createTimedClient(supabaseUrl, anonKey, viewer.accessToken);
    const viewerEntitlements = await safeSupabaseCall(() => viewerClient
      .from("user_entitlements")
      .select("entitlement_key,status,expires_at,revoked_at")
      .in("entitlement_key", [...PREMIUM_ENTITLEMENT_KEYS]));
    const entitlementRows = Array.isArray(viewerEntitlements.data) ? viewerEntitlements.data as JsonObject[] : [];
    const activeEntitlements = entitlementRows.filter((row) => {
      const status = toText(row.status);
      const revokedAt = toText(row.revoked_at);
      const expiresAt = toText(row.expires_at);
      return ["active", "trialing", "grace_period"].includes(status) && !revokedAt && (!expiresAt || Date.parse(expiresAt) > Date.now());
    });
    results.push(canaryResult({
      actor: "proof viewer",
      actual: viewerEntitlements.error ? "Proof viewer entitlement read failed." : activeEntitlements.length === 0 ? "Proof viewer has no active premium entitlement rows." : `${activeEntitlements.length} active premium entitlement rows found for proof viewer.`,
      cleanupStatus: "pending proof cleanup",
      details: { entitlement_keys_tested: [...PREMIUM_ENTITLEMENT_KEYS], returned_rows: entitlementRows.length },
      expected: "Regular proof viewer without RevenueCat/user_entitlements is denied premium-backed access.",
      key: "normal_premium_gates",
      label: "Normal premium gates active",
      section: "Premium / Entitlements",
      status: viewerEntitlements.error ? "fail" : activeEntitlements.length === 0 ? "pass" : "fail",
      testedSurface: "table: user_entitlements RLS/readCurrentUserEntitlements keys",
    }));

    const adminClientAsProof = createTimedClient(supabaseUrl, anonKey, adminProof.accessToken);
    const selfGrant = await safeSupabaseCall(() => adminClientAsProof.rpc("admin_grant_platform_staff_permission_by_email", {
      p_expires_at: null,
      p_permission_key: "admin_grants",
      p_reason: "CANARY PROOF self-grant denial.",
      p_target_email: adminProof.email,
    }));
    results.push(canaryResult({
      actor: "proof admin without grants",
      actual: selfGrant.error ? "Self-grant was denied server-side." : "Self-grant unexpectedly succeeded.",
      cleanupStatus: "pending proof cleanup",
      details: { error: selfGrant.error ? redactText((selfGrant.error as { message?: string }).message, 260) : null },
      expected: "Admin cannot grant admin_grants to itself.",
      key: "admin_self_grant_denied",
      label: "Admin cannot self-grant",
      section: "Staff Permissions",
      status: selfGrant.error ? "pass" : "fail",
      testedSurface: "rpc: admin_grant_platform_staff_permission_by_email",
    }));

    const moderatorClient = createTimedClient(supabaseUrl, anonKey, moderatorProof.accessToken);
    const moderatorGrant = await safeSupabaseCall(() => moderatorClient.rpc("admin_grant_platform_role_by_email", {
      p_reason: "CANARY PROOF moderator grant denial.",
      p_role: "moderator",
      p_target_email: PROOF_EMAILS.targetModerator,
    }));
    results.push(canaryResult({
      actor: "proof moderator",
      actual: moderatorGrant.error ? "Moderator role grant was denied server-side." : "Moderator role grant unexpectedly succeeded.",
      cleanupStatus: "pending proof cleanup",
      details: { error: moderatorGrant.error ? redactText((moderatorGrant.error as { message?: string }).message, 260) : null },
      expected: "Moderator cannot add another moderator by default.",
      key: "moderator_grant_denied",
      label: "Moderator cannot grant moderators",
      section: "Staff Permissions",
      status: moderatorGrant.error ? "pass" : "fail",
      testedSurface: "rpc: admin_grant_platform_role_by_email",
    }));

    const deniedCalls = await Promise.all([
      callLegalEvidence(supabaseUrl, anonKey, viewer.accessToken, "preview"),
      callLegalEvidence(supabaseUrl, anonKey, viewer.accessToken, "export"),
      callLegalEvidence(supabaseUrl, anonKey, viewer.accessToken, "hold", { targetId: viewer.userId, targetType: "user_id" }),
      callLegalEvidence(supabaseUrl, anonKey, adminProof.accessToken, "preview"),
      callLegalEvidence(supabaseUrl, anonKey, adminProof.accessToken, "export"),
      callLegalEvidence(supabaseUrl, anonKey, adminProof.accessToken, "hold", { targetId: viewer.userId, targetType: "user_id" }),
      callLegalEvidence(supabaseUrl, anonKey, moderatorProof.accessToken, "preview"),
    ]);
    const grantedPreview = await callLegalEvidence(supabaseUrl, anonKey, grantedAdmin.accessToken, "preview");
    const exportBeforeGrant = await callLegalEvidence(supabaseUrl, anonKey, grantedAdmin.accessToken, "export");
    const holdBeforeGrant = await callLegalEvidence(supabaseUrl, anonKey, grantedAdmin.accessToken, "hold", { targetId: viewer.userId, targetType: "user_id" });
    await ensureProofPermission(adminClient, grantedAdmin, "evidence_export");
    const grantedExport = await callLegalEvidence(supabaseUrl, anonKey, grantedAdmin.accessToken, "export");
    await ensureProofPermission(adminClient, grantedAdmin, "legal_hold");
    const grantedHold = await callLegalEvidence(supabaseUrl, anonKey, grantedAdmin.accessToken, "hold", { targetId: viewer.userId, targetType: "user_id" });
    const deniedOk = deniedCalls.every((call) => call.status === 401 || call.status === 403);
    const scopedOk = grantedPreview.ok
      && (exportBeforeGrant.status === 401 || exportBeforeGrant.status === 403)
      && (holdBeforeGrant.status === 401 || holdBeforeGrant.status === 403)
      && grantedExport.ok
      && grantedHold.ok;
    results.push(canaryResult({
      actor: "proof viewer, proof moderator, proof admin without grants, proof admin with scoped legal grants",
      actual: deniedOk && scopedOk
        ? "Viewer, moderator, and ungranted admin were denied; legal_review preview worked; export/hold required their exact scoped grants."
        : `Legal Evidence proof mismatch: denied statuses ${deniedCalls.map((call) => call.status).join(", ")}, preview ${grantedPreview.status}, export before/after ${exportBeforeGrant.status}/${grantedExport.status}, hold before/after ${holdBeforeGrant.status}/${grantedHold.status}.`,
      cleanupStatus: "pending proof cleanup; legal audit proof retained append-only",
      details: {
        denied_statuses: deniedCalls.map((call) => call.status),
        export_after_grant_status: grantedExport.status,
        export_before_grant_status: exportBeforeGrant.status,
        granted_preview_status: grantedPreview.status,
        hold_after_grant_status: grantedHold.status,
        hold_before_grant_status: holdBeforeGrant.status,
      },
      expected: "Legal Evidence denies viewer/moderator/ungranted admin and requires exact preview/export/hold permission.",
      key: "legal_evidence_restricted",
      label: "Legal Evidence restricted",
      section: "Legal / Evidence",
      status: deniedOk && scopedOk ? "pass" : "fail",
      testedSurface: "function: admin-legal-evidence preview/export/hold",
    }));

    await ensureProofPermission(adminClient, grantedAdmin, "legal_request_intake");
    const legalList = await callOwnerControls(supabaseUrl, anonKey, grantedAdmin.accessToken, "legal_request_list", { limit: 10 });
    const legalCreate = await callOwnerControls(supabaseUrl, anonKey, grantedAdmin.accessToken, "legal_request_create", {
      canaryProof: true,
      caseNumber: `CANARY-LEGAL-${Date.now()}`,
      contactEmail: "legal-canary-requester@example.invalid",
      contactName: "Canary Legal Contact",
      contactPhone: "+1-555-0100",
      dateFrom: "2026-01-01T00:00:00.000Z",
      dateTo: "2026-01-01T00:01:00.000Z",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      notes: "CANARY PROOF hidden legal request; production list excludes canary-proof records.",
      requestReason: "CANARY PROOF legal intake create and detail workflow.",
      requestType: "law_enforcement",
      requestingAgency: "Canary Legal Agency",
      status: "received",
      targetUserId: viewer.userId,
    });
    const legalRequestId = toText((legalCreate.payload.request as JsonObject | undefined)?.id);
    const legalDetail = legalRequestId
      ? await callOwnerControls(supabaseUrl, anonKey, grantedAdmin.accessToken, "legal_request_detail", { id: legalRequestId })
      : { ok: false, payload: {}, status: 0 };
    const legalUpdate = legalRequestId
      ? await callOwnerControls(supabaseUrl, anonKey, grantedAdmin.accessToken, "legal_request_update", {
        id: legalRequestId,
        notes: "CANARY PROOF status update and note.",
        reason: "CANARY PROOF legal intake status update.",
        status: "under_review",
      })
      : { ok: false, payload: {}, status: 0 };
    const linkedPreview = legalRequestId
      ? await callLegalEvidence(supabaseUrl, anonKey, grantedAdmin.accessToken, "preview", { legalRequestId, targetId: viewer.userId, targetType: "user_id" })
      : { ok: false, payload: {}, status: 0 };
    const linkedExport = legalRequestId
      ? await callLegalEvidence(supabaseUrl, anonKey, grantedAdmin.accessToken, "export", { legalRequestId, targetId: viewer.userId, targetType: "user_id" })
      : { ok: false, payload: {}, status: 0 };
    const linkedHold = legalRequestId
      ? await callLegalEvidence(supabaseUrl, anonKey, grantedAdmin.accessToken, "hold", { legalRequestId, targetId: viewer.userId, targetType: "user_id" })
      : { ok: false, payload: {}, status: 0 };
    const legalDetailAfter = legalRequestId
      ? await callOwnerControls(supabaseUrl, anonKey, grantedAdmin.accessToken, "legal_request_detail", { id: legalRequestId })
      : { ok: false, payload: {}, status: 0 };
    const legalEvents = Array.isArray(legalDetailAfter.payload.events) ? legalDetailAfter.payload.events as JsonObject[] : [];
    const legalEvidenceRows = Array.isArray(legalDetailAfter.payload.evidenceRequests) ? legalDetailAfter.payload.evidenceRequests as JsonObject[] : [];
    const legalHoldRows = Array.isArray(legalDetailAfter.payload.holds) ? legalDetailAfter.payload.holds as JsonObject[] : [];
    const legalIntakeOk = legalList.ok
      && legalCreate.ok
      && !!legalRequestId
      && legalDetail.ok
      && legalUpdate.ok
      && linkedPreview.ok
      && linkedExport.ok
      && linkedHold.ok
      && legalEvents.length >= 5
      && legalEvidenceRows.length >= 2
      && legalHoldRows.length >= 1;
    results.push(canaryResult({
      actor: "proof admin with legal_request_intake/evidence_export/legal_hold",
      actual: legalIntakeOk
        ? `Legal Intake list/create/open/status/timeline/evidence linkage passed for hidden proof request ${legalRequestId}.`
        : `Legal Intake proof failed: list ${legalList.status}, create ${legalCreate.status}, detail ${legalDetail.status}, update ${legalUpdate.status}, preview/export/hold ${linkedPreview.status}/${linkedExport.status}/${linkedHold.status}, events ${legalEvents.length}.`,
      cleanupStatus: "pending proof cleanup; hidden legal canary request retained as canary_proof",
      details: {
        detail_status: legalDetail.status,
        evidence_rows: legalEvidenceRows.length,
        event_count: legalEvents.length,
        export_status: linkedExport.status,
        hold_rows: legalHoldRows.length,
        hold_status: linkedHold.status,
        list_status: legalList.status,
        preview_status: linkedPreview.status,
        request_id: legalRequestId,
        update_status: legalUpdate.status,
      },
      expected: "Legal Intake list loads, create works, detail opens, status updates, timeline records events, and evidence preview/export/hold link to the request.",
      key: "legal_intake_workflow",
      label: "Legal Intake workflow works",
      section: "Legal / Evidence",
      status: legalIntakeOk ? "pass" : "fail",
      testedSurface: "function: admin-owner-controls legal_request_* + admin-legal-evidence linked actions",
    }));

    const legalUnauthorized = await Promise.all([
      callOwnerControls(supabaseUrl, anonKey, viewer.accessToken, "legal_request_list", { limit: 1 }),
      callOwnerControls(supabaseUrl, anonKey, adminProof.accessToken, "legal_request_list", { limit: 1 }),
      callOwnerControls(supabaseUrl, anonKey, moderatorProof.accessToken, "legal_request_list", { limit: 1 }),
    ]);
    const legalUnauthorizedOk = legalUnauthorized.every((call) => call.status === 401 || call.status === 403);
    results.push(canaryResult({
      actor: "proof viewer, proof moderator, proof admin without grants",
      actual: legalUnauthorizedOk
        ? "Viewer, moderator, and ungranted admin were denied Legal Intake server-side."
        : `Legal Intake denial mismatch: statuses ${legalUnauthorized.map((call) => call.status).join(", ")}.`,
      cleanupStatus: "pending proof cleanup",
      details: { denied_statuses: legalUnauthorized.map((call) => call.status) },
      expected: "Unauthorized roles cannot list/open Legal Intake through the backend.",
      key: "legal_intake_unauthorized_denied",
      label: "Legal Intake unauthorized users denied",
      section: "Legal / Evidence",
      status: legalUnauthorizedOk ? "pass" : "fail",
      testedSurface: "function: admin-owner-controls legal_request_list",
    }));

    const matrixInputs = [
      ["user_id", viewer.userId],
      ["profile_channel", viewer.userId],
      ["creator_video", "00000000-0000-0000-0000-000000000000"],
      ["profile_post", "00000000-0000-0000-0000-000000000000"],
      ["comment", "00000000-0000-0000-0000-000000000000"],
      ["social_attachment", "00000000-0000-0000-0000-000000000000"],
      ["content_id", "00000000-0000-0000-0000-000000000000"],
      ["chat_thread_id", "00000000-0000-0000-0000-000000000000"],
      ["room_id", "canary-room-id"],
      ["live_room", "canary-live-room-id"],
      ["report_id", "00000000-0000-0000-0000-000000000000"],
      ["dmca_case", "00000000-0000-0000-0000-000000000000"],
      ["date_range", null],
    ] as const;
    const matrixResult = await callLegalEvidence(
      supabaseUrl,
      anonKey,
      grantedAdmin.accessToken,
      "preview_matrix",
    );
    const matrixPayload = isRecord(matrixResult.payload) ? matrixResult.payload : {};
    const matrix = isRecord(matrixPayload.matrix) ? matrixPayload.matrix : {};
    const matrixResults = matrixInputs.map(([targetType]) => {
      const entry = isRecord(matrix[targetType]) ? matrix[targetType] : {};
      const disabledReason = redactText(entry.disabledReason, 300);
      const status = entry.status ?? matrixResult.status;
      return {
        disabledReason,
        ok: matrixResult.ok && (entry.ok === true || disabledReason.length > 0),
        status,
      };
    });
    const matrixOk = matrixResults.every((entry) => entry.ok);
    results.push(canaryResult({
      actor: "proof admin with legal_review/evidence_preview",
      actual: matrixOk
        ? "Legal Evidence preview matrix passed for user/account, profile/channel, creator video, profile post, comments/replies, attachment, chat thread, room/live metadata, reports, DMCA case, and date range."
        : `Legal Evidence matrix had failures: ${matrixResults.map((entry, index) => `${matrixInputs[index][0]}=${entry.status}`).join(", ")}.`,
      cleanupStatus: "legal audit proof retained append-only",
      details: Object.fromEntries(matrixInputs.map((entry, index) => [
        entry[0],
        matrixResults[index].disabledReason
          ? `${matrixResults[index].status}: ${matrixResults[index].disabledReason}`
          : matrixResults[index].status,
      ])),
      expected: "Every claimed Legal Evidence target type previews successfully or is disabled with an exact reason.",
      key: "legal_evidence_target_matrix",
      label: "Legal Evidence target matrix covered",
      section: "Legal / Evidence",
      status: matrixOk ? "pass" : "fail",
      testedSurface: "function: admin-legal-evidence preview_matrix target coverage",
    }));

    const unmarkedLegalProofRows = await safeSupabaseCall(() => adminClient
      .from("legal_request_intake")
      .select("id,metadata")
      .or("requesting_agency.ilike.%proof%,requesting_agency.ilike.%demo%,requesting_agency.ilike.%canary%,case_number.ilike.%CANARY%"));
    const hiddenLegalProofRows = await safeSupabaseCall(() => adminClient
      .from("legal_request_intake")
      .select("id", { count: "exact", head: true })
      .eq("metadata->>canary_proof", "true"));
    const legalProofRows = Array.isArray(unmarkedLegalProofRows.data) ? unmarkedLegalProofRows.data as JsonObject[] : [];
    const unmarkedCount = legalProofRows.filter((row) => !isRecord(row.metadata) || row.metadata.canary_proof !== true).length;
    results.push(canaryResult({
      actor: "system",
      actual: unmarkedLegalProofRows.error
        ? "Legal proof/demo visibility query failed."
        : unmarkedCount === 0
          ? "No unmarked proof/demo Legal Intake records are visible to production lists."
          : `${unmarkedCount} unmarked proof/demo Legal Intake records matched proof/demo markers.`,
      cleanupStatus: "hidden canary legal requests are metadata.canary_proof=true and excluded from production list action",
      details: {
        hidden_canary_count: hiddenLegalProofRows.count ?? null,
        query_error: unmarkedLegalProofRows.error ? redactText((unmarkedLegalProofRows.error as { message?: string }).message, 220) : null,
        unmarked_count: unmarkedCount,
      },
      expected: "Proof/demo legal cases are not visible in production mode unless marked test-only.",
      key: "legal_no_demo_cases",
      label: "Legal no proof/demo cases visible",
      section: "Legal / Evidence",
      status: unmarkedLegalProofRows.error ? "manual_required" : unmarkedCount === 0 ? "pass" : "fail",
      testedSurface: "table/function: legal_request_intake canary marker + legal_request_list filter",
    }));

    const grantedDmcaClient = createTimedClient(supabaseUrl, anonKey, grantedAdmin.accessToken);
    results.push(...await dmcaAdminCanaryResults(adminClient, anonClient, grantedDmcaClient, viewerClient, grantedAdmin, viewer));
  } catch (error) {
    results.push(canaryResult({
      actor: "system",
      actual: `Proof harness setup failed: ${redactText(error instanceof Error ? error.message : error, 420)}`,
      cleanupStatus: "cleanup attempted after setup failure",
      expected: "Proof accounts can be created/reused and temporary roles granted safely.",
      key: "proof_harness_setup",
      label: "Proof harness setup",
      section: "Cleanup / Proof Hygiene",
      status: "fail",
      testedSurface: "supabase.auth.admin proof account setup",
    }));
  }

  const opsBaseUrl = readOptionalEnv("OPS_AUTOMATION_BASE_URL");
  if (!opsBaseUrl) {
    results.push(canaryResult({
      actor: "system",
      actual: "OPS_AUTOMATION_BASE_URL is not configured for this function.",
      expected: "Ops service base URL is configured so health can prove dry-run flags.",
      key: "live_ops_flags",
      label: "Live Ops dry-run and real-action flags",
      section: "Live Ops",
      status: "manual_required",
      testedSurface: "env: OPS_AUTOMATION_BASE_URL",
    }));
  } else {
    try {
      const opsHealth = await fetchJsonWithTimeout(`${opsBaseUrl.replace(/\/$/, "")}/healthz`, {
        headers: readOptionalEnv("OPS_ADMIN_READ_TOKEN") ? { "X-Ops-Admin-Token": readOptionalEnv("OPS_ADMIN_READ_TOKEN") as string } : {},
      });
      const body = opsHealth.body;
      const safeFlags = body.dryRun === true
        && body.allowLiveActions === false
        && body.allowNetShaping === false
        && body.allowGithubActions === false
        && body.allowInfraActions === false
        && body.allowLiveOpsRegistryActions === false;
      results.push(canaryResult({
        actor: "system",
        actual: opsHealth.ok && safeFlags ? "Ops service health proved dry-run with all real-action flags off." : `Ops health status ${opsHealth.status}; real-action flag proof did not pass.`,
        details: {
          allowGithubActions: body.allowGithubActions,
          allowInfraActions: body.allowInfraActions,
          allowLiveActions: body.allowLiveActions,
          allowLiveOpsRegistryActions: body.allowLiveOpsRegistryActions,
          allowNetShaping: body.allowNetShaping,
          dryRun: body.dryRun,
          http_status: opsHealth.status,
        },
        expected: "dryRun true and all real-action flags false.",
        key: "live_ops_flags",
        label: "Live Ops dry-run and real-action flags",
        section: "Live Ops",
        status: opsHealth.ok && safeFlags ? "pass" : "fail",
        testedSurface: "GET ops-alert-automation /healthz",
      }));
    } catch (error) {
      results.push(canaryResult({
        actor: "system",
        actual: `Ops service health fetch failed: ${redactText(error instanceof Error ? error.message : error, 420)}`,
        expected: "Reachable ops service health endpoint.",
        key: "live_ops_flags",
        label: "Live Ops dry-run and real-action flags",
        section: "Live Ops",
        status: "fail",
        testedSurface: "GET ops-alert-automation /healthz",
      }));
    }
  }

  const supportEmail = readOptionalEnv("PUBLIC_SUPPORT_EMAIL") ?? DEFAULT_SUPPORT_EMAIL;
  const privacyUrl = readOptionalEnv("PUBLIC_PRIVACY_URL") ?? DEFAULT_PRIVACY_URL;
  const termsUrl = readOptionalEnv("PUBLIC_TERMS_URL") ?? DEFAULT_TERMS_URL;
  try {
    const [privacy, terms] = await Promise.all([fetchStatusWithTimeout(privacyUrl), fetchStatusWithTimeout(termsUrl)]);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail);
    const linksOk = emailOk && privacy.ok && terms.ok;
    results.push(canaryResult({
      actor: "system",
      actual: linksOk ? "Support email format and public privacy/terms links passed." : `Support/legal proof failed: privacy ${privacy.status}, terms ${terms.status}, support email ${emailOk ? "valid" : "invalid"}.`,
      details: { privacy_status: privacy.status, support_email_configured: emailOk, terms_status: terms.status },
      expected: "Support email configured and privacy/terms URLs return HTTP 2xx.",
      key: "support_links",
      label: "Support/legal links working",
      section: "Public Web / Support",
      status: linksOk ? "pass" : "fail",
      testedSurface: "GET public privacy/terms URLs + support email config",
    }));
  } catch (error) {
    results.push(canaryResult({
      actor: "system",
      actual: `Support/legal URL fetch failed: ${redactText(error instanceof Error ? error.message : error, 420)}`,
      expected: "Privacy/terms URLs are publicly reachable.",
      key: "support_links",
      label: "Support/legal links working",
      section: "Public Web / Support",
      status: "fail",
      testedSurface: "GET public privacy/terms URLs + support email config",
    }));
  }

  results.push(...legalPolicyCanaryResults(supportEmail, privacyUrl, termsUrl));

  const managementToken = readOptionalEnv("CANARY_SUPABASE_ACCESS_TOKEN")
    ?? readOptionalEnv("SUPABASE_ACCESS_TOKEN")
    ?? readOptionalEnv("SUPABASE_MANAGEMENT_TOKEN");
  const projectRef = readOptionalEnv("CANARY_SUPABASE_PROJECT_REF")
    ?? readOptionalEnv("SUPABASE_PROJECT_REF")
    ?? "bmkkhihfbmsnnmcqkoly";
  if (!managementToken) {
    results.push(canaryResult({
      actor: "system",
      actual: "CANARY_SUPABASE_ACCESS_TOKEN/SUPABASE_ACCESS_TOKEN/SUPABASE_MANAGEMENT_TOKEN is not configured for hosted Auth URL proof.",
      expected: "Management token exists so hosted Auth URL settings can be verified.",
      key: "supabase_redirect_urls",
      label: "Supabase redirect URLs configured",
      section: "Auth / Redirects",
      status: "manual_required",
      testedSurface: "Supabase Management API auth config",
    }));
  } else {
    try {
      const authConfig = await fetchRawJsonWithTimeout(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
        headers: { Authorization: `Bearer ${managementToken}` },
      });
      const body = authConfig.body;
      const siteUrl = toText(body.site_url ?? body.siteUrl ?? body.SITE_URL);
      const redirectSources = [
        body.redirect_urls,
        body.additional_redirect_urls,
        body.uri_allow_list,
        body.redirect_uri,
        body.redirect_uris,
      ].flatMap((value) => Array.isArray(value) ? value.map(toText) : toText(value).split(/[,\n]/).map(toText)).filter(Boolean);
      const siteOk = /^https:\/\/[^/]+/.test(siteUrl) && !siteUrl.includes("localhost") && !siteUrl.includes("127.0.0.1");
      const resetOk = redirectSources.includes("chillywoodmobile://reset-password");
      results.push(canaryResult({
        actor: "system",
        actual: authConfig.ok && siteOk && resetOk ? "Hosted Auth Site URL and reset-password redirect are configured." : `Hosted Auth URL proof failed: status ${authConfig.status}, site ${siteOk ? "ok" : "bad"}, reset redirect ${resetOk ? "found" : "missing"}.`,
        details: { http_status: authConfig.status, redirect_count: redirectSources.length, reset_redirect_found: resetOk, site_url_ok: siteOk },
        expected: "Real Site URL is non-localhost and chillywoodmobile://reset-password is allowlisted.",
        key: "supabase_redirect_urls",
        label: "Supabase redirect URLs configured",
        section: "Auth / Redirects",
        status: authConfig.ok && siteOk && resetOk ? "pass" : "fail",
        testedSurface: "Supabase Management API GET project auth config",
      }));
    } catch (error) {
      results.push(canaryResult({
        actor: "system",
        actual: `Supabase Management API auth config fetch failed: ${redactText(error instanceof Error ? error.message : error, 420)}`,
        expected: "Management API auth config can be read.",
        key: "supabase_redirect_urls",
        label: "Supabase redirect URLs configured",
        section: "Auth / Redirects",
        status: "fail",
        testedSurface: "Supabase Management API GET project auth config",
      }));
    }
  }

  const publicCandidate = await safeSupabaseCall(() => adminClient
    .from("user_profiles")
    .select("user_id")
    .neq("user_id", ownerUserId || "none")
    .limit(1)
    .maybeSingle());
  const candidateUserId = toText((publicCandidate.data as JsonObject | null)?.user_id);
  if (candidateUserId) {
    const publicProfile = await safeSupabaseCall(() => anonClient.rpc("read_public_channel_profile", { profile_user_id: candidateUserId }));
    results.push(canaryResult({
      actor: "signed-out public",
      actual: publicProfile.error ? "Public sanitized RPC could not be checked." : "Public sanitized RPC responded without exposing owner data.",
      expected: "Public sanitized profile/channel RPC responds for a non-owner candidate.",
      key: "public_channel_sanitized_rpc",
      label: "Public profile/channel sanitized RPCs working",
      section: "Public Web / Support",
      status: publicProfile.error ? "manual_required" : "pass",
      testedSurface: "rpc: read_public_channel_profile(profile_user_id=non-owner)",
    }));
  } else {
    results.push(canaryResult({
      actor: "system",
      actual: "No non-owner public profile candidate was available.",
      expected: "At least one non-owner public profile candidate exists.",
      key: "public_channel_sanitized_rpc",
      label: "Public profile/channel sanitized RPCs working",
      section: "Public Web / Support",
      status: "manual_required",
      testedSurface: "table: user_profiles candidate lookup",
    }));
  }

  const cleanup = await cleanupProofAccess(adminClient, "CANARY PROOF post-run cleanup.");
  cleanupStatus = cleanup.summary;
  for (const row of results) {
    if (isRecord(row) && toText(row.cleanupStatus) === "pending proof cleanup") row.cleanupStatus = cleanupStatus;
    if (isRecord(row) && toText(row.cleanupStatus).includes("pending proof cleanup")) row.cleanupStatus = cleanupStatus;
  }

  const activeProofRoles = await adminClient.from("platform_role_memberships").select("id", { count: "exact", head: true }).eq("status", "active").ilike("email", "liveops.proof+%");
  const activeProofGrants = await adminClient.from("platform_staff_permission_grants").select("id", { count: "exact", head: true }).eq("status", "active").ilike("target_email", "liveops.proof+%");
  const proofCount = (activeProofRoles.count ?? 0) + (activeProofGrants.count ?? 0);
  results.push(canaryResult({
    actor: "system",
    actual: activeProofRoles.error || activeProofGrants.error ? "Proof role/grant cleanup query failed." : proofCount === 0 ? "No active liveops.proof role/grant rows remain." : `${proofCount} active liveops.proof role/grant rows remain.`,
    cleanupStatus,
    details: { active_proof_grants: activeProofGrants.count ?? null, active_proof_roles: activeProofRoles.count ?? null },
    expected: "No active elevated proof role/grant rows remain.",
    key: "proof_roles_cleaned",
    label: "Proof roles/grants cleaned up",
    section: "Cleanup / Proof Hygiene",
    status: activeProofRoles.error || activeProofGrants.error ? "manual_required" : proofCount === 0 ? "pass" : "fail",
    testedSurface: "tables: platform_role_memberships + platform_staff_permission_grants",
  }));

  const ownerAuditAfter = await countOwnerNormalAuditRows(adminClient);
  results.push(canaryResult({
    actor: "owner/system",
    actual: didCountStaySame(ownerAuditBefore, ownerAuditAfter)
      ? "Owner normal canary use did not add owner app-level audit rows."
      : "Owner app-level audit count changed during canary run.",
    details: { after: ownerAuditAfter, before: ownerAuditBefore },
    expected: "Owner normal canary/admin use creates no owner-sensitive app-level audit rows.",
    key: "owner_normal_no_audit_rows",
    label: "Owner normal no-audit rule preserved",
    section: "Owner Protection",
    status: didCountStaySame(ownerAuditBefore, ownerAuditAfter) ? "pass" : "fail",
    testedSurface: "tables: platform_admin_audit_logs + legal_evidence_audit_log",
  }));

  const passCount = results.filter((row) => row.status === "pass").length;
  const failCount = results.filter((row) => row.status === "fail").length;
  const manualRequiredCount = results.filter((row) => row.status === "manual_required" || row.status === "unknown").length;
  const status = failCount > 0 ? "failed" : manualRequiredCount > 0 ? "partial" : "completed";
  const summary = {
    fail: failCount,
    failCount,
    manualRequired: manualRequiredCount,
    manualRequiredCount,
    pass: passCount,
    passCount,
    unknownCount: manualRequiredCount,
  };
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
    if (action === "legal_request_detail") return await legalRequestDetail(adminClient, auth.user, payload);
    if (action === "legal_request_list") return await legalRequestList(adminClient, auth.user, payload);
    if (action === "security_status") return await securityStatus(adminClient, auth.user);
    if (action === "canary_run") return await canaryRun(adminClient, anonClient, auth.user, supabaseUrl, anonKey);
    if (action === "canary_list") return await canaryList(adminClient, auth.user);

    return json(400, { error: "invalid_action" });
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : "owner_controls_failed");
    console.error("admin-owner-controls failure", message);
    return json(500, { error: "owner_controls_failed", message });
  }
});
