import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;
type AuthenticatedUser = {
  email: string | null;
  id: string;
  permissions: Set<string>;
  role: "owner" | "operator" | "moderator";
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

const sanitizeText = (value: unknown, max = 240) =>
  toText(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/wss?:\/\/\S+/gi, "[redacted-url]")
    .replace(/eyJ[A-Za-z0-9._~+/=-]+/g, "[redacted-token]")
    .replace(/sk_(test|live)_[A-Za-z0-9_]+/gi, "sk_[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/g, "[redacted]")
    .slice(0, max);

const sanitizeObject = (value: unknown): JsonObject => {
  if (!isRecord(value)) return {};
  const output: JsonObject = {};
  for (const [key, entry] of Object.entries(value).slice(0, 80)) {
    if (/(authorization|credential|header|jwt|key|password|secret|service_role|token)/i.test(key)) {
      output[key] = "[redacted]";
    } else if (typeof entry === "string") {
      output[key] = sanitizeText(entry);
    } else if (Array.isArray(entry)) {
      output[key] = entry.slice(0, 25).map((item) => typeof item === "string" ? sanitizeText(item) : sanitizeObject(item));
    } else if (isRecord(entry)) {
      output[key] = sanitizeObject(entry);
    } else {
      output[key] = entry;
    }
  }
  return output;
};

const normalizePermission = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "moderator_grants") return "manage_moderators";
  return normalized;
};

const requireReason = (value: unknown) => {
  const reason = sanitizeText(value, 500);
  if (reason.length < 6) throw new Error("legal_reason_required");
  return reason;
};

const hasPermission = (user: AuthenticatedUser, key: string) =>
  user.role === "owner" || user.permissions.has(normalizePermission(key));

const hasAnyPermission = (user: AuthenticatedUser, keys: string[]) =>
  user.role === "owner" || keys.some((key) => user.permissions.has(normalizePermission(key)));

const readActivePermissions = async (
  adminClient: SupabaseClientLike,
  userId: string,
  email: string | null,
) => {
  const normalizedEmail = toText(email).toLowerCase();
  let query = adminClient
    .from("platform_staff_permission_grants")
    .select("permission_key,expires_at")
    .eq("status", "active");

  if (normalizedEmail) {
    query = query.or(`target_user_id.eq.${userId},target_email.ilike.${normalizedEmail}`);
  } else {
    query = query.eq("target_user_id", userId);
  }

  const { data, error } = await query.limit(100);
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
  const normalizedEmail = toText(email).toLowerCase();
  const userLookup = await adminClient
    .from("platform_role_memberships")
    .select("role")
    .eq("status", "active")
    .in("role", ["owner", "operator", "moderator"])
    .eq("user_id", userId)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (userLookup.error) throw new Error(`Role lookup failed: ${userLookup.error.message}`);
  let role = toText((userLookup.data as JsonObject | null)?.role);

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
  const user = { email, id: userId, permissions, role } as AuthenticatedUser;
  if (!hasAnyPermission(user, ["legal_review", "evidence_export"])) {
    return { error: json(403, { error: "legal_permission_required" }) };
  }
  return { user };
};

const writeAudit = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
  input: {
    action: string;
    reason: string;
    targetId?: string | null;
    targetType?: string | null;
    requestId?: string | null;
    metadata?: JsonObject;
  },
) => {
  const { error } = await adminClient.from("legal_evidence_audit_log").insert({
    action: input.action,
    actor_email: user.email,
    actor_role: user.role,
    actor_user_id: user.id,
    metadata: sanitizeObject(input.metadata ?? {}),
    reason: input.reason,
    request_id: input.requestId || null,
    target_id: input.targetId || null,
    target_type: input.targetType || null,
  });
  if (error) throw new Error(`Legal audit write failed: ${error.message}`);
};

const readTableRows = async (
  adminClient: SupabaseClientLike,
  table: string,
  column: string,
  value: string,
  select = "*",
) => {
  const { data, error } = await adminClient
    .from(table)
    .select(select)
    .eq(column, value)
    .limit(25);
  if (error) throw new Error(`Evidence read failed for ${table}: ${error.message}`);
  return ((data ?? []) as JsonObject[]).map(sanitizeObject);
};

const buildPreview = async (adminClient: SupabaseClientLike, payload: JsonObject) => {
  const targetType = toText(payload.targetType).toLowerCase();
  const targetId = sanitizeText(payload.targetId, 180);
  const dateFrom = sanitizeText(payload.dateFrom, 80);
  const dateTo = sanitizeText(payload.dateTo, 80);
  if (!targetType) throw new Error("legal_target_type_required");

  const result: JsonObject = {
    generatedAt: new Date().toISOString(),
    redaction: "metadata_only_default",
    targetId: targetId || null,
    targetType,
  };

  if (targetType === "user_id") {
    if (!targetId) throw new Error("legal_target_id_required");
    result.profile = await readTableRows(adminClient, "user_profiles", "user_id", targetId, "user_id,username,display_name,profile_visibility,updated_at");
    result.reports = await readTableRows(adminClient, "safety_reports", "target_id", targetId, "id,target_type,target_id,category,created_at");
  } else if (targetType === "content_id") {
    if (!targetId) throw new Error("legal_target_id_required");
    result.videos = await readTableRows(adminClient, "videos", "id", targetId, "id,owner_id,title,visibility,moderation_status,created_at,updated_at");
    result.profilePosts = await readTableRows(adminClient, "profile_posts", "id", targetId, "id,user_id,visibility,moderation_status,created_at,updated_at");
  } else if (targetType === "room_id") {
    if (!targetId) throw new Error("legal_target_id_required");
    result.watchPartyRooms = await readTableRows(adminClient, "watch_party_rooms", "party_id", targetId, "party_id,host_user_id,room_type,is_active,created_at,updated_at");
    result.communicationRooms = await readTableRows(adminClient, "communication_rooms", "room_id", targetId, "room_id,host_user_id,status,created_at,updated_at,last_activity_at");
  } else if (targetType === "chat_thread_id") {
    if (!targetId) throw new Error("legal_target_id_required");
    result.thread = await readTableRows(adminClient, "chat_threads", "id", targetId, "id,created_by,thread_kind,created_at,updated_at,active_communication_room_id,active_call_type");
    result.members = await readTableRows(adminClient, "chat_thread_members", "thread_id", targetId, "thread_id,user_id,joined_at,last_read_at");
    result.messages = await readTableRows(adminClient, "chat_messages", "thread_id", targetId, "id,thread_id,sender_user_id,message_type,created_at,updated_at");
  } else if (targetType === "report_id") {
    if (!targetId) throw new Error("legal_target_id_required");
    result.report = await readTableRows(adminClient, "safety_reports", "id", targetId, "id,reporter_user_id,target_type,target_id,category,room_id,title_id,created_at");
  } else if (targetType === "date_range") {
    if (!dateFrom || !dateTo) throw new Error("legal_date_range_required");
    const fromIso = new Date(dateFrom).toISOString();
    const toIso = new Date(dateTo).toISOString();
    const { count: reportCount } = await adminClient
      .from("safety_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    result.dateRange = { from: fromIso, safetyReportCount: reportCount ?? 0, to: toIso };
  } else {
    throw new Error("legal_target_type_unsupported");
  }

  return result;
};

const sha256Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const supabaseUrl = readRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = readRequiredEnv("SUPABASE_ANON_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const auth = await authenticate(req, adminClient, supabaseUrl, anonKey);
    if ("error" in auth) return auth.error;

    const payload = sanitizeObject(await req.json().catch(() => ({})));
    const action = toText(payload.action).toLowerCase() || "preview";
    const reason = requireReason(payload.reason);

    if (action === "preview" || action === "search") {
      if (!hasPermission(auth.user, "legal_review")) return json(403, { error: "legal_review_required" });
      const preview = await buildPreview(adminClient, payload);
      const { data, error } = await adminClient.from("legal_evidence_requests").insert({
        preview,
        reason,
        request_kind: action === "search" ? "search" : "preview",
        requested_by_email: auth.user.email,
        requested_by_user_id: auth.user.id,
        search_scope: sanitizeObject(payload),
        status: "previewed",
      }).select("id,created_at").single();
      if (error) throw new Error(`Legal preview write failed: ${error.message}`);
      const requestId = toText((data as JsonObject).id);
      await writeAudit(adminClient, auth.user, {
        action,
        metadata: { resultKeys: Object.keys(preview) },
        reason,
        requestId,
        targetId: toText(payload.targetId) || null,
        targetType: toText(payload.targetType) || null,
      });
      return json(200, { preview, request: sanitizeObject(data), ok: true });
    }

    if (action === "export") {
      if (!hasPermission(auth.user, "evidence_export")) return json(403, { error: "evidence_export_required" });
      const preview = await buildPreview(adminClient, payload);
      const manifest = {
        exportedAt: new Date().toISOString(),
        exportedBy: auth.user.id,
        preview,
        reason,
        redaction: "metadata_only_default",
        searchScope: sanitizeObject(payload),
      };
      const exportHash = await sha256Hex(JSON.stringify(manifest));
      const { data, error } = await adminClient.from("legal_evidence_requests").insert({
        completed_at: new Date().toISOString(),
        export_hash: exportHash,
        export_manifest: manifest,
        preview,
        reason,
        request_kind: "export",
        requested_by_email: auth.user.email,
        requested_by_user_id: auth.user.id,
        search_scope: sanitizeObject(payload),
        status: "exported",
      }).select("id,created_at,export_hash,status").single();
      if (error) throw new Error(`Legal export write failed: ${error.message}`);
      const requestId = toText((data as JsonObject).id);
      await writeAudit(adminClient, auth.user, {
        action: "export",
        metadata: { exportHash },
        reason,
        requestId,
        targetId: toText(payload.targetId) || null,
        targetType: toText(payload.targetType) || null,
      });
      return json(200, { export: sanitizeObject(data), ok: true });
    }

    if (action === "place_hold") {
      if (!hasPermission(auth.user, "legal_review")) return json(403, { error: "legal_review_required" });
      const targetType = sanitizeText(payload.targetType, 80);
      const targetId = sanitizeText(payload.targetId, 180);
      if (!targetType || !targetId) throw new Error("legal_hold_target_required");
      const { data, error } = await adminClient.from("legal_holds").insert({
        metadata: sanitizeObject(payload.metadata),
        placed_by_email: auth.user.email,
        placed_by_user_id: auth.user.id,
        reason,
        status: "active",
        target_id: targetId,
        target_type: targetType,
      }).select("*").single();
      if (error) throw new Error(`Legal hold write failed: ${error.message}`);
      await writeAudit(adminClient, auth.user, {
        action: "hold_place",
        metadata: { holdId: toText((data as JsonObject).id) },
        reason,
        targetId,
        targetType,
      });
      return json(200, { hold: sanitizeObject(data), ok: true });
    }

    if (action === "release_hold") {
      if (auth.user.role !== "owner") return json(403, { error: "owner_required" });
      const holdId = sanitizeText(payload.holdId, 180);
      if (!holdId) throw new Error("legal_hold_id_required");
      const { data, error } = await adminClient.from("legal_holds")
        .update({
          release_reason: reason,
          released_at: new Date().toISOString(),
          released_by_email: auth.user.email,
          released_by_user_id: auth.user.id,
          status: "released",
        })
        .eq("id", holdId)
        .eq("status", "active")
        .select("*")
        .single();
      if (error) throw new Error(`Legal hold release failed: ${error.message}`);
      await writeAudit(adminClient, auth.user, {
        action: "hold_release",
        metadata: { holdId },
        reason,
        targetId: toText((data as JsonObject).target_id) || null,
        targetType: toText((data as JsonObject).target_type) || null,
      });
      return json(200, { hold: sanitizeObject(data), ok: true });
    }

    return json(400, { error: "unsupported_action" });
  } catch (error) {
    return json(500, {
      error: "admin_legal_evidence_failed",
      message: sanitizeText(error instanceof Error ? error.message : "unknown_error"),
    });
  }
});
