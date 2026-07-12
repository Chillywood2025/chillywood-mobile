import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-owner-command-operator-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const ACTIVE_SYSTEMS = [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
  "observability_runtime_operator",
] as const;

const SYSTEM_KEYWORDS: Record<string, readonly string[]> = {
  media_automation: ["media", "r2", "hls", "transcode", "rendition", "video", "storage", "cdn", "scan", "quarantine"],
  livekit_operator: ["livekit", "live room", "watch party", "party room", "heartbeat", "token", "router", "camera"],
  money_flow_control: ["money", "revenuecat", "google play", "stripe", "billing", "payout", "cashout", "ledger", "premium", "webhook", "provider"],
  notification_delivery_operator: ["notification", "push", "expo", "device token", "delivery", "alert"],
  release_ota_operator: ["release", "ota", "eas", "updateid", "runtime", "channel", "rollback", "publish", "play store", "app store"],
  security_owner_operator: ["security", "owner", "super_admin", "super admin", "admin", "rls", "auth", "secret scan", "rachi", "approval"],
  moderation_safety_operator: ["moderation", "safety", "report", "ban", "suspend", "restrict", "delete content", "case", "fraud hold"],
  observability_runtime_operator: ["observability", "crash", "crashlytics", "analytics", "performance", "anr", "runtime health", "error rate", "backend error"],
};

const LEVEL_FOUR_PATTERNS = [
  /move\s+money/i,
  /charge\s+(customer|card|user)/i,
  /create\s+(payout|transfer|cashout|invoice|payment link|checkout)/i,
  /release\s+payout/i,
  /mark\s+payout\s+paid/i,
  /publish\s+(production\s+)?ota/i,
  /rollback\s+(production\s+)?ota/i,
  /public\s+release/i,
  /expose\s+(private|premium|original)/i,
];

const LEVEL_THREE_PATTERNS = [
  /change\s+(auth|rls|owner|super_admin|super admin)/i,
  /(assign|revoke|grant)\s+(owner|super_admin|super admin)/i,
  /(ban|suspend|restrict)\s+user/i,
  /delete\s+content/i,
  /remote\s+config/i,
  /feature\s+flag/i,
  /provider\s+(dashboard|config|product|secret|credential)/i,
  /broad\s+(media|push|notification|backfill|campaign)/i,
  /manual\s+premium/i,
  /bypass\s+premium/i,
  /rotate\s+secret/i,
];

const SAFE_WRITE_PATTERNS = [
  /record\s+(finding|status|health|review)/i,
  /mark\s+requires[_\s-]?review/i,
  /sync\s+status/i,
  /cleanup\s+revoked\s+token/i,
  /device(?:\s|-)?not(?:\s|-)?registered/i,
];

const READ_ONLY_PATTERNS = [/status/i, /report/i, /health/i, /diagnos/i, /readback/i, /check/i, /show/i, /summar/i, /audit/i];
const SECRET_PATTERN = /(secret|token|password|credential|authorization|service[_-]?role|participant[_-]?token|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|webhook[_-]?secret)/i;
const LONG_SECRET_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

const toText = (value: unknown) => String(value ?? "").trim();
const normalizeText = (value: unknown) => toText(value).replace(/\s+/g, " ");

const jsonResponse = (status: number, payload: JsonObject) => new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const createAdminClient = (): SupabaseClientLike => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const constantTimeEqual = (left: string, right: string) => {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return diff === 0;
};

const authenticateTrustedOperator = async (request: Request) => {
  const expectedHash = toText(Deno.env.get("OWNER_COMMAND_OPERATOR_TOKEN_SHA256"));
  const token = toText(request.headers.get("x-owner-command-operator-token"));
  if (!expectedHash || !token) return false;
  return constantTimeEqual(await sha256Hex(token), expectedHash);
};

const readBearerToken = (request: Request) => {
  const authorization = toText(request.headers.get("authorization"));
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
};

const containsSecretLikeValue = (value: unknown): boolean => {
  if (typeof value === "string") return SECRET_PATTERN.test(value) || LONG_SECRET_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsSecretLikeValue);
  if (value && typeof value === "object") {
    return Object.entries(value as JsonObject).some(([key, entry]) => SECRET_PATTERN.test(key) || containsSecretLikeValue(entry));
  }
  return false;
};

const redactText = (value: unknown) => String(value ?? "").replace(LONG_SECRET_PATTERN, "[redacted]").slice(0, 4000);

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
    ? value.map((entry) => redactText(entry)).filter(Boolean).slice(0, 64)
    : []
);

const commandMatches = (text: string, patterns: readonly RegExp[]) => patterns.some((pattern) => pattern.test(text));

const mapSystems = (commandText: string) => {
  const text = commandText.toLowerCase();
  return ACTIVE_SYSTEMS.filter((systemId) => SYSTEM_KEYWORDS[systemId].some((keyword) => text.includes(keyword)));
};

const classifyRisk = (commandText: string) => {
  const text = normalizeText(commandText);
  if (!text) return 3;
  if (commandMatches(text, LEVEL_FOUR_PATTERNS)) return 4;
  if (commandMatches(text, LEVEL_THREE_PATTERNS)) return 3;
  if (commandMatches(text, SAFE_WRITE_PATTERNS)) return 2;
  if (commandMatches(text, READ_ONLY_PATTERNS)) return 1;
  return mapSystems(text).length ? 2 : 3;
};

const intentForSystems = (systems: readonly string[]) => {
  if (systems.length > 1) return "multi_system";
  const systemId = systems[0];
  if (systemId === "media_automation") return "media_operations";
  if (systemId === "livekit_operator") return "livekit_operations";
  if (systemId === "money_flow_control") return "money_provider_operations";
  if (systemId === "notification_delivery_operator") return "notification_delivery";
  if (systemId === "release_ota_operator") return "release_ota_operations";
  if (systemId === "security_owner_operator") return "security_owner_authority";
  if (systemId === "moderation_safety_operator") return "moderation_safety";
  if (systemId === "observability_runtime_operator") return "observability_runtime";
  return "unknown";
};

const systemForbiddenScope = (systemId: string) => {
  const map: Record<string, string[]> = {
    media_automation: ["private/Premium/original exposure", "unapproved broad media processing"],
    livekit_operator: ["LiveKit routing policy change", "fake heartbeat", "LiveKit token output"],
    money_flow_control: ["money movement", "manual Premium grant", "provider product/mode mutation"],
    notification_delivery_operator: ["notification preference bypass", "broad push campaign"],
    release_ota_operator: ["unapproved OTA publish", "unapproved OTA rollback", "fake installed proof"],
    security_owner_operator: ["auth/RLS mutation without approval", "owner role mutation without approval", "Rachi/operator self-approval"],
    moderation_safety_operator: ["unapproved ban/suspend/restrict", "unapproved content deletion", "hidden enforcement"],
    observability_runtime_operator: ["crash evidence deletion", "crash reporting silence", "Remote Config mutation without approval"],
  };
  return map[systemId] ?? ["unknown target system"];
};

const buildPlan = (commandText: string) => {
  const command = normalizeText(commandText);
  const systems = mapSystems(command);
  const approvalLevel = classifyRisk(command);
  const blockers: string[] = [];
  if (!command) blockers.push("command_text_required");
  if (containsSecretLikeValue(command)) blockers.push("secret_like_command_payload_blocked");
  if (!systems.length) blockers.push("target_system_not_identified");

  const commonPreflight = [
    "verify owner/super_admin authority",
    "verify target system registry scope",
    "verify target system emergency state is active",
    "verify fresh preflight",
    "verify exact scope match",
  ];
  const allowedScope = systems.map((systemId) => `${systemId}:route_via_existing_operator_scope`);
  const forbiddenScope = [
    "approval bypass",
    "fresh preflight bypass",
    "emergency-state bypass",
    "secret/token output",
    "broad DB mutation",
    ...systems.flatMap(systemForbiddenScope),
  ];
  const executionPlan = systems.map((systemId, index) => ({
    stepIndex: index + 1,
    targetSystem: systemId,
    actionId: approvalLevel >= 3 ? "owner_command_approval_required" : approvalLevel === 2 ? "owner_command_scoped_safe_write" : "owner_command_report",
    approvalLevel,
    status: approvalLevel >= 3 ? "approval_required" : "preflight_pending",
    preflightPlan: commonPreflight,
    allowedScope: [`${systemId}:scoped_operator_command_step`],
    forbiddenScope: ["approval bypass", ...systemForbiddenScope(systemId)],
    proofPlan: ["owner_command_events", "owner_command_execution_steps", "target operator proof/report"],
    rollbackPlan: ["stop remaining steps on failure", "use target operator rollback/quarantine policy"],
  }));
  return {
    status: blockers.length ? "blocked" : approvalLevel >= 3 ? "approval_required" : "planned",
    commandText: redactText(command),
    normalizedIntent: intentForSystems(systems),
    approvalLevel,
    targetSystems: systems,
    allowedScope,
    forbiddenScope,
    preflightPlan: approvalLevel === 4 ? [...commonPreflight, "verify external confirmation"] : commonPreflight,
    executionPlan,
    rollbackPlan: ["stop at first failed preflight", "record exact blocker", "use target operator rollback/quarantine policy"],
    proofPlan: ["owner command request", "owner command events", "execution step audit", "approval request for Level 3/4"],
    validationPlan: ["owner/super_admin authority", "approval status for Level 3/4", "fresh preflight", "exact scope match", "emergency state active"],
    approvalRequired: approvalLevel >= 3,
    externalConfirmationRequired: approvalLevel === 4,
    blockers,
  };
};

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

  if (role !== "owner" && role !== "super_admin") return { ok: false as const, error: "owner_or_super_admin_required", userId };
  return { ok: true as const, role, userId };
};

const insertEvent = async (
  client: SupabaseClientLike,
  input: {
    actorId?: string | null;
    actorType: string;
    commandId: string;
    eventSummary: string;
    eventType: string;
    metadata?: JsonObject;
    status: string;
  },
) => client.from("owner_command_events").insert({
  actor_id: input.actorId ?? null,
  actor_type: input.actorType,
  command_id: input.commandId,
  event_summary: redactText(input.eventSummary),
  event_type: input.eventType,
  metadata: safeMetadata(input.metadata),
  status: input.status,
});

const insertBlockers = async (client: SupabaseClientLike, commandId: string, blockers: readonly string[]) => {
  if (!blockers.length) return;
  await client.from("owner_command_blockers").insert(blockers.map((blocker) => ({
    blocker_code: blocker,
    blocker_summary: blocker,
    command_id: commandId,
    next_action: blocker === "target_system_not_identified" ? "clarify target autonomous system" : blocker,
    metadata: {},
  })));
};

const insertSteps = async (client: SupabaseClientLike, commandId: string, plan: JsonObject) => {
  const steps = Array.isArray(plan.executionPlan) ? plan.executionPlan : [];
  if (!steps.length) return;
  await client.from("owner_command_execution_steps").insert(steps.map((step: JsonObject) => ({
    action_id: toText(step.actionId),
    allowed_scope: safeStringArray(step.allowedScope),
    approval_level: Number(step.approvalLevel ?? 3),
    command_id: commandId,
    execution_status: Number(step.approvalLevel ?? 3) >= 3 ? "approval_required" : "not_started",
    metadata: safeMetadata(step),
    preflight_status: "pending",
    proof: {},
    status: toText(step.status) || "preflight_pending",
    step_index: Number(step.stepIndex ?? 1),
    target_system: toText(step.targetSystem),
  })));
};

const createApprovalRequestForCommand = async (client: SupabaseClientLike, commandId: string, plan: JsonObject) => {
  const targetSystems = Array.isArray(plan.targetSystems) ? plan.targetSystems.map(String) : [];
  const systemId = ACTIVE_SYSTEMS.includes(targetSystems[0] as typeof ACTIVE_SYSTEMS[number]) ? targetSystems[0] : "security_owner_operator";
  const approvalLevel = Number(plan.approvalLevel ?? 3) === 4 ? 4 : 3;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("autonomous_approval_requests")
    .insert({
      action_id: "owner_command_high_risk_execution",
      allowed_write_scope: safeStringArray(plan.allowedScope),
      approval_level: approvalLevel,
      expires_at: expiresAt,
      forbidden_scope: safeStringArray(plan.forbiddenScope),
      kill_switch_plan: "Every target system emergency state must be active before owner command execution.",
      metadata: { command_id: commandId, target_systems: targetSystems },
      proof_plan: "Owner command event history, fresh preflight, exact scope validation, and target operator proof are required.",
      proposed_action: redactText(plan.commandText),
      reason: "Owner command maps to a Level 3/4 action and must use the existing approval path.",
      requested_by_actor_id: null,
      requested_by_actor_type: "operator",
      risk_summary: approvalLevel === 4
        ? "Level 4 owner command requires owner/super-admin approval plus external confirmation."
        : "Level 3 owner command requires owner/super-admin approval and fresh preflight.",
      rollback_plan: "Stop execution and use target operator rollback/quarantine policy if any preflight or execution step fails.",
      status: "pending",
      system_id: systemId,
      title: `Owner command approval: ${toText(plan.normalizedIntent)}`,
      validation_plan: "Verify approval, fresh preflight, exact scope, emergency state, and external confirmation when required.",
    })
    .select("id,status,system_id,action_id,approval_level,expires_at")
    .single();
  if (error) throw new Error("approval_request_create_failed");

  await client.from("autonomous_approval_request_events").insert({
    actor_id: null,
    actor_type: "operator",
    event_summary: "Owner Command Operator created approval request and stopped before high-risk execution.",
    event_type: "requested",
    metadata: { command_id: commandId, created_by: "owner_command_operator" },
    request_id: data.id,
  });

  await client.from("owner_command_requests").update({
    approval_request_id: data.id,
    status: "approval_required",
    updated_at: new Date().toISOString(),
  }).eq("id", commandId);
  await insertEvent(client, {
    actorType: "owner_command_operator",
    commandId,
    eventSummary: "Approval request created; high-risk command stopped before execution.",
    eventType: "approval_request_created",
    metadata: { approval_request_id: data.id },
    status: "approval_required",
  });
  return data;
};

const createCommand = async (client: SupabaseClientLike, owner: { role: string; userId: string }, commandText: string, metadata: unknown) => {
  if (containsSecretLikeValue(commandText) || containsSecretLikeValue(metadata)) {
    return { error: jsonResponse(422, { error: "secret_like_payload_blocked" }) };
  }
  const plan = buildPlan(commandText);
  const status = plan.blockers.length ? "blocked" : plan.approvalRequired ? "approval_required" : "planned";
  const { data, error } = await client
    .from("owner_command_requests")
    .insert({
      allowed_scope: plan.allowedScope,
      approval_level: plan.approvalLevel,
      command_text: plan.commandText,
      execution_plan: plan.executionPlan,
      external_confirmation_required: plan.externalConfirmationRequired,
      external_confirmation_status: plan.externalConfirmationRequired ? "required" : "not_required",
      forbidden_scope: plan.forbiddenScope,
      metadata: safeMetadata(metadata),
      normalized_intent: plan.normalizedIntent,
      owner_user_id: owner.userId,
      preflight_plan: plan.preflightPlan,
      proof_plan: plan.proofPlan,
      rollback_plan: plan.rollbackPlan,
      status,
      target_systems: plan.targetSystems,
      validation_plan: plan.validationPlan,
    })
    .select("id,status,approval_level,target_systems,approval_request_id,created_at")
    .single();
  if (error) return { error: jsonResponse(500, { error: "create_command_failed" }) };

  await insertEvent(client, {
    actorId: owner.userId,
    actorType: owner.role,
    commandId: data.id,
    eventSummary: "Owner command received, classified, and planned.",
    eventType: plan.blockers.length ? "blocked" : "planned",
    metadata: { normalized_intent: plan.normalizedIntent, target_systems: plan.targetSystems, approval_level: plan.approvalLevel },
    status,
  });
  await insertSteps(client, data.id, plan);
  await insertBlockers(client, data.id, plan.blockers);

  let approvalRequest = null;
  if (!plan.blockers.length && plan.approvalRequired) {
    approvalRequest = await createApprovalRequestForCommand(client, data.id, plan);
  }
  return { command: data, plan, approvalRequest };
};

const readCommand = async (client: SupabaseClientLike, commandId: string) => {
  const { data: command, error } = await client
    .from("owner_command_requests")
    .select("*")
    .eq("id", commandId)
    .single();
  if (error || !command) return null;

  const events = await client
    .from("owner_command_events")
    .select("id,event_type,actor_type,status,event_summary,metadata,created_at")
    .eq("command_id", commandId)
    .order("created_at", { ascending: true });
  const steps = await client
    .from("owner_command_execution_steps")
    .select("id,step_index,target_system,action_id,approval_level,status,preflight_status,execution_status,proof,result_summary,created_at,updated_at")
    .eq("command_id", commandId)
    .order("step_index", { ascending: true });
  const blockers = await client
    .from("owner_command_blockers")
    .select("id,blocker_code,blocker_summary,next_action,resolved_at,created_at")
    .eq("command_id", commandId)
    .order("created_at", { ascending: true });

  return {
    ...command,
    events: events.data ?? [],
    steps: steps.data ?? [],
    blockers: blockers.data ?? [],
  };
};

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
  const client = createAdminClient();
  const trusted = await authenticateTrustedOperator(request);
  const owner = ["create_command", "classify_command", "plan_command", "dry_run_command", "create_approval_request", "cancel_command"].includes(action)
    ? await authorizeOwnerOrSuperAdmin(request, client)
    : null;

  if (owner && !owner.ok) return jsonResponse(403, { error: owner.error });

  if (action === "classify_command" || action === "plan_command" || action === "dry_run_command") {
    const commandText = normalizeText(body.command_text ?? body.commandText);
    if (containsSecretLikeValue(commandText)) return jsonResponse(422, { error: "secret_like_payload_blocked" });
    const plan = buildPlan(commandText);
    return jsonResponse(200, {
      ok: !plan.blockers.length,
      action,
      classification: {
        normalizedIntent: plan.normalizedIntent,
        riskLevel: plan.approvalLevel,
        approvalRequired: plan.approvalRequired,
        externalConfirmationRequired: plan.externalConfirmationRequired,
        targetSystems: plan.targetSystems,
        blockers: plan.blockers,
      },
      plan,
      executed: false,
      moneyMoved: false,
      highRiskExecuted: false,
    });
  }

  if (action === "create_command") {
    const result = await createCommand(client, owner as { role: string; userId: string }, normalizeText(body.command_text ?? body.commandText), body.metadata);
    if ("error" in result) return result.error ?? jsonResponse(500, { error: "create_command_failed" });
    return jsonResponse(200, {
      ok: !result.plan.blockers.length,
      command: result.command,
      plan: result.plan,
      approvalRequest: result.approvalRequest,
      executed: false,
      moneyMoved: false,
      highRiskExecuted: false,
    });
  }

  if (action === "create_approval_request") {
    const commandId = toText(body.command_id);
    if (!commandId) return jsonResponse(400, { error: "command_id_required" });
    const command = await readCommand(client, commandId);
    if (!command) return jsonResponse(404, { error: "command_not_found" });
    if (Number(command.approval_level) < 3) return jsonResponse(409, { error: "approval_not_required" });
    if (toText(command.approval_request_id)) return jsonResponse(200, { ok: true, approvalRequestId: command.approval_request_id });
    const plan = buildPlan(command.command_text);
    const approvalRequest = await createApprovalRequestForCommand(client, commandId, plan);
    return jsonResponse(200, { ok: true, approvalRequest });
  }

  if (action === "command_status" || action === "command_report") {
    const ownerStatus = trusted ? null : await authorizeOwnerOrSuperAdmin(request, client);
    if (ownerStatus && !ownerStatus.ok) return jsonResponse(403, { error: ownerStatus.error });
    const commandId = toText(body.command_id);
    if (commandId) {
      const command = await readCommand(client, commandId);
      if (!command) return jsonResponse(404, { error: "command_not_found" });
      return jsonResponse(200, { ok: true, command });
    }
    const { data, error } = await client
      .from("owner_command_requests")
      .select("id,status,normalized_intent,target_systems,approval_level,approval_request_id,external_confirmation_required,result_summary,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) return jsonResponse(500, { error: "command_report_failed" });
    return jsonResponse(200, { ok: true, commands: data ?? [] });
  }

  if (action === "execute_approved_command") {
    const ownerStatus = trusted ? null : await authorizeOwnerOrSuperAdmin(request, client);
    if (ownerStatus && !ownerStatus.ok) return jsonResponse(403, { error: ownerStatus.error });
    if (!trusted && !ownerStatus?.ok) return jsonResponse(401, { error: "owner_or_trusted_operator_required" });
    const commandId = toText(body.command_id);
    if (!commandId) return jsonResponse(400, { error: "command_id_required" });
    const command = await readCommand(client, commandId);
    if (!command) return jsonResponse(404, { error: "command_not_found" });

    const approvalLevel = Number(command.approval_level ?? 3);
    const blockers: string[] = [];
    if (command.status === "cancelled" || command.status === "denied") blockers.push("command_not_executable");
    if (approvalLevel >= 3 && !toText(command.approval_request_id)) blockers.push("approval_request_required");
    if (approvalLevel >= 3) {
      const { data: approval } = await client
        .from("autonomous_approval_requests")
        .select("id,status,expires_at,approval_level,system_id,action_id")
        .eq("id", command.approval_request_id)
        .maybeSingle();
      if (!approval || approval.status !== "approved") blockers.push("owner_approval_required");
      if (approval && Date.parse(toText(approval.expires_at)) <= Date.now()) blockers.push("approval_expired");
    }
    if (command.external_confirmation_required && body.external_confirmation_status !== "provided_production") {
      blockers.push("external_confirmation_required");
    }

    if (blockers.length) {
      await client.from("owner_command_requests").update({ status: "blocked", updated_at: new Date().toISOString() }).eq("id", commandId);
      await insertBlockers(client, commandId, blockers);
      await insertEvent(client, {
        actorType: trusted ? "owner_command_operator" : (ownerStatus?.ok ? ownerStatus.role : "system"),
        actorId: ownerStatus?.ok ? ownerStatus.userId : null,
        commandId,
        eventSummary: "Owner command execution blocked by required gate.",
        eventType: "blocked",
        metadata: { blockers },
        status: "blocked",
      });
      return jsonResponse(409, {
        ok: false,
        error: "owner_command_execution_blocked",
        blockers,
        nextAction: blockers[0],
        moneyMoved: false,
        highRiskExecuted: false,
      });
    }

    if (approvalLevel >= 3) {
      await insertEvent(client, {
        actorType: trusted ? "owner_command_operator" : (ownerStatus?.ok ? ownerStatus.role : "system"),
        actorId: ownerStatus?.ok ? ownerStatus.userId : null,
        commandId,
        eventSummary: "High-risk owner command passed gates and is ready for exact-scope target operator execution; no direct mutation was performed by Owner Command Operator.",
        eventType: "preflight_passed",
        metadata: { direct_mutation_performed: false },
        status: "preflight_passed",
      });
      await client.from("owner_command_requests").update({
        result_summary: "High-risk command gate passed; target operator exact-scope execution remains required.",
        status: "preflight_passed",
        updated_at: new Date().toISOString(),
      }).eq("id", commandId);
      return jsonResponse(200, {
        ok: true,
        result: "preflight_passed_target_operator_execution_required",
        executed: false,
        moneyMoved: false,
        highRiskExecuted: false,
      });
    }

    await client.from("owner_command_execution_steps").update({
      execution_status: "executed",
      preflight_status: "passed",
      proof: { routed_via_owner_command_operator: true, direct_domain_mutation: false },
      result_summary: "Safe owner command report step executed as audit-only command.",
      status: "executed",
      updated_at: new Date().toISOString(),
    }).eq("command_id", commandId);
    await client.from("owner_command_requests").update({
      result_summary: "Safe owner command executed as scoped audit/report work.",
      status: "executed",
      updated_at: new Date().toISOString(),
    }).eq("id", commandId);
    await insertEvent(client, {
      actorType: trusted ? "owner_command_operator" : (ownerStatus?.ok ? ownerStatus.role : "system"),
      actorId: ownerStatus?.ok ? ownerStatus.userId : null,
      commandId,
      eventSummary: "Safe owner command executed; no high-risk action or direct domain mutation occurred.",
      eventType: "executed",
      metadata: { moneyMoved: false, highRiskExecuted: false, direct_domain_mutation: false },
      status: "executed",
    });
    return jsonResponse(200, { ok: true, result: "safe_command_executed", moneyMoved: false, highRiskExecuted: false });
  }

  if (action === "cancel_command") {
    const commandId = toText(body.command_id);
    if (!commandId) return jsonResponse(400, { error: "command_id_required" });
    await client.from("owner_command_requests").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", commandId);
    await insertEvent(client, {
      actorId: (owner as { userId: string }).userId,
      actorType: (owner as { role: string }).role,
      commandId,
      eventSummary: "Owner command cancelled.",
      eventType: "cancelled",
      status: "cancelled",
    });
    return jsonResponse(200, { ok: true, status: "cancelled" });
  }

  return jsonResponse(400, { error: "unknown_action" });
});
