import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

const SYSTEM_ID = "support_success_operator";
const THRESHOLD_UNIQUE_USERS = 3;
const THRESHOLD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
} as const;

const REPORT_TYPES = [
  "safety_abuse",
  "harassment",
  "impersonation",
  "copyright",
  "illegal_or_dangerous_content",
  "bug_broken_feature",
  "feature_request",
  "account_access",
  "premium_or_billing",
  "payout_or_money",
  "media_playback",
  "upload_or_transcode",
  "livekit_live_watchparty",
  "chat_or_call",
  "notification_delivery",
  "release_update_version",
  "search_discovery_visibility",
  "privacy_data",
  "security_access",
  "ads_sponsor",
  "other_support",
] as const;

type ReportType = typeof REPORT_TYPES[number];
type Severity = "low" | "review" | "major" | "critical";
type Platform = "shared" | "ios" | "android" | "web" | "unknown";
type RoutedSystem =
  | "media_automation"
  | "livekit_operator"
  | "money_flow_control"
  | "notification_delivery_operator"
  | "release_ota_operator"
  | "security_owner_operator"
  | "moderation_safety_operator"
  | "observability_runtime_operator"
  | "installed_product_qa_operator"
  | "privacy_compliance_operator"
  | "support_success_operator"
  | "search_ranking_integrity_operator"
  | "ads_sponsor_delivery_operator";

const SECRET_KEY_PATTERN = /(service[_\s-]?role|secret|token|password|credential|authorization|signed[_\s-]?url|api[_\s-]?key|private[_\s-]?key|db[_\s-]?url|database[_\s-]?url|payment[_\s-]?credential|tax[_\s-]?id|bank[_\s-]?detail|reporter identity|private evidence)/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const LONG_SECRET_LIKE_PATTERN = /[A-Za-z0-9._~+/=-]{32,}/g;
const PROMPT_INJECTION_PATTERN = /(ignore (all )?(previous|prior) instructions|developer message|system prompt|run this command|execute this|bypass approval|approve this|owner command|service role|grant premium|move money|ban user|delete content)/i;
const SPAM_PATTERN = /(free money|crypto giveaway|airdrop|follow my link|http:\/\/|https:\/\/.*https:\/\/|.{0,12}\b(?:buy now|promo code)\b.{0,12})/i;
const ROUTES_TO_INSTALLED_QA = /^\/?(admin|chat|creator-monetization-setup|subscribe|settings|creator|channel-studio)\b/i;

const CATEGORY_HINTS: Array<[ReportType, RegExp]> = [
  ["security_access", /\b(security|hacked|unauthorized|admin access|permission|access control|account takeover|2fa|mfa|session hijack|leak)\b/i],
  ["premium_or_billing", /\b(premium|subscription|billing|charged|charge|google play|play billing|revenuecat|storekit|iap|in-app purchase|app store purchase|apple subscription|restore purchases|seat pass|tip tier|store|purchase|restore|refund|revocation)\b/i],
  ["payout_or_money", /\b(payout|cashout|transfer|stripe|bank|tax|refund|money|invoice|checkout)\b/i],
  ["privacy_data", /\b(privacy|delete my data|export my data|personal data|doxx|reporter|private evidence|gdpr|ccpa)\b/i],
  ["livekit_live_watchparty", /\b(watch party|party room|livekit|camera|microphone|mic|live stage|viewer request|host approve|call media)\b/i],
  ["media_playback", /\b(playback|video|audio|buffer|caption|subtitle|player|stream|stuck loading)\b/i],
  ["upload_or_transcode", /\b(upload|transcode|processing|thumbnail|media job|draft video|creator upload)\b/i],
  ["notification_delivery", /\b(push|notification|expo|device token|alert did not arrive|reminder|apns|pushkit|callkit|voip|native incoming call|terminal call cleanup|fcm)\b/i],
  ["release_update_version", /\b(update|version|ota|runtime|stale app|release|rollback|channel|testflight|ios-qa|apk|aab|versioncode)\b/i],
  ["search_discovery_visibility", /\b(search|discover|ranking|recommendation|visibility|not showing|shadowban|boost|demote)\b/i],
  ["ads_sponsor", /\b(ad|ads|sponsor|sponsorship|paid placement|brand deal|promotion)\b/i],
  ["safety_abuse", /\b(abuse|unsafe|threat|violence|self harm|minor safety|sexual exploitation|report abuse)\b/i],
  ["harassment", /\b(harass|bully|hate|slur|stalking)\b/i],
  ["impersonation", /\b(impersonat|fake account|pretending to be)\b/i],
  ["copyright", /\b(copyright|dmca|takedown|stolen video|unauthorized media)\b/i],
  ["illegal_or_dangerous_content", /\b(illegal|dangerous|weapon|explosive|drug sale|trafficking)\b/i],
  ["account_access", /\b(sign in|login|logout|account|password|email change|locked out|delete account)\b/i],
  ["chat_or_call", /\b(chat|message|thread|inbox|call|voice)\b/i],
  ["feature_request", /\b(feature request|suggest|please add|could you add|improvement|idea)\b/i],
  ["bug_broken_feature", /\b(bug|broken|not working|crash|error|blank|button|route|screen|marker|stuck|dead end|fix)\b/i],
];

const jsonResponse = (status: number, payload: JsonObject) => new Response(JSON.stringify(payload), {
  headers: JSON_HEADERS,
  status,
});

const toText = (value: unknown) => String(value ?? "").trim();

const normalizePlatform = (value: unknown): Platform => {
  const platform = toText(value).toLowerCase();
  if (["ios", "iphone", "ipad", "testflight", "app_store"].includes(platform)) return "ios";
  if (["android", "google_play", "play_store", "firebase_test_lab"].includes(platform)) return "android";
  if (["web", "browser", "pwa"].includes(platform)) return "web";
  if (platform === "shared") return "shared";
  return "unknown";
};

const classifyPlatform = (payload: JsonObject, reportType: ReportType): Platform => {
  if (["safety_abuse", "harassment", "impersonation", "copyright", "illegal_or_dangerous_content", "privacy_data", "account_access"].includes(reportType)) return "shared";
  const explicit = normalizePlatform(payload.platform ?? payload.devicePlatform ?? payload.device_platform);
  if (explicit !== "unknown") return explicit;
  const text = `${payload.surface ?? ""} ${payload.route ?? ""} ${payload.summary ?? ""} ${payload.details ?? ""}`;
  if (/\b(ios|iphone|ipad|testflight|app store|storekit|iap|apple subscription|apns|pushkit|callkit|voip)\b/i.test(text)) return "ios";
  if (/\b(android|google play|play billing|fcm|apk|aab|versioncode|firebase test lab)\b/i.test(text)) return "android";
  if (/\b(web|browser|pwa|website)\b/i.test(text)) return "web";
  return "unknown";
};

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`${key}_missing`);
  return value;
};

const createAdminClient = (): SupabaseClientLike => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const sanitizeText = (value: unknown, maxLength = 420) => {
  const redacted = toText(value)
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(IPV4_PATTERN, "[redacted-ip]")
    .replace(SECRET_KEY_PATTERN, "[redacted-sensitive-term]")
    .replace(LONG_SECRET_LIKE_PATTERN, "[redacted-long-value]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 15)}...[redacted]` : redacted;
};

const normalizeKeywordText = (value: string) => value
  .toLowerCase()
  .replace(EMAIL_PATTERN, " email ")
  .replace(PHONE_PATTERN, " phone ")
  .replace(IPV4_PATTERN, " ip ")
  .replace(LONG_SECRET_LIKE_PATTERN, " id ")
  .replace(/[^a-z0-9/_ -]+/g, " ")
  .replace(/\b[0-9a-f]{8,}\b/g, " id ")
  .replace(/\s+/g, " ")
  .trim();

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const isReportType = (value: unknown): value is ReportType => (
  (REPORT_TYPES as readonly string[]).includes(toText(value).toLowerCase().replace(/[\s-]+/g, "_"))
);

const inferReportType = (payload: JsonObject): ReportType => {
  const explicit = toText(payload.reportType ?? payload.report_type ?? payload.category).toLowerCase().replace(/[\s-]+/g, "_");
  if (isReportType(explicit)) return explicit;
  const text = `${payload.category ?? ""} ${payload.summary ?? ""} ${payload.details ?? ""} ${payload.surface ?? ""} ${payload.route ?? ""}`;
  for (const [category, pattern] of CATEGORY_HINTS) {
    if (pattern.test(text)) return category;
  }
  return "other_support";
};

const inferSeverity = (payload: JsonObject, text: string): Severity => {
  const severity = toText(payload.severity).toLowerCase();
  if (["critical", "urgent", "blocking"].includes(severity)) return "critical";
  if (["major", "high"].includes(severity)) return "major";
  if (["low", "polish", "insight"].includes(severity)) return "low";
  if (/\b(data leak|hacked|unauthorized|charged|charge failed|minor safety|threat|self harm|exploit|provider down)\b/i.test(text)) {
    return "critical";
  }
  if (/\b(crash|blocked|dead end|cannot sign in|not working|broken)\b/i.test(text)) return "major";
  return "review";
};

const routeSystem = (reportType: ReportType, payload: JsonObject): RoutedSystem => {
  const route = toText(payload.route);
  const text = `${payload.surface ?? ""} ${payload.summary ?? ""} ${payload.details ?? ""}`;
  if (["safety_abuse", "harassment", "impersonation", "copyright", "illegal_or_dangerous_content"].includes(reportType)) {
    return "moderation_safety_operator";
  }
  if (reportType === "premium_or_billing" || reportType === "payout_or_money") return "money_flow_control";
  if (reportType === "security_access") return "security_owner_operator";
  if (reportType === "privacy_data") return "privacy_compliance_operator";
  if (reportType === "livekit_live_watchparty") return "livekit_operator";
  if (reportType === "media_playback" || reportType === "upload_or_transcode") return "media_automation";
  if (reportType === "notification_delivery") return "notification_delivery_operator";
  if (reportType === "release_update_version") return "release_ota_operator";
  if (reportType === "search_discovery_visibility") return "search_ranking_integrity_operator";
  if (reportType === "ads_sponsor") return "ads_sponsor_delivery_operator";
  if (reportType === "chat_or_call" && /\b(apns|pushkit|callkit|voip|native incoming call|terminal call cleanup)\b/i.test(text)) return "notification_delivery_operator";
  if (reportType === "chat_or_call" && /\b(camera|microphone|mic|call media|livekit|live|watch party)\b/i.test(text)) return "livekit_operator";
  if (reportType === "bug_broken_feature" && /\b(crash|fatal|slow|performance|timeout|anr|startup failure|backend error)\b/i.test(text)) return "observability_runtime_operator";
  if (reportType === "bug_broken_feature" && (ROUTES_TO_INSTALLED_QA.test(route) || /\b(route|screen|button|marker|testid|navigation|stuck on home)\b/i.test(text))) {
    return "installed_product_qa_operator";
  }
  if (reportType === "bug_broken_feature" && /\b(error|api|backend)\b/i.test(text)) {
    return "observability_runtime_operator";
  }
  return "support_success_operator";
};

const isImmediate = (reportType: ReportType, severity: Severity) => (
  severity === "critical"
  || ["safety_abuse", "illegal_or_dangerous_content", "security_access", "premium_or_billing", "payout_or_money", "privacy_data"].includes(reportType)
);

const classifyPayload = (payload: JsonObject) => {
  const reportType = inferReportType(payload);
  const platform = classifyPlatform(payload, reportType);
  const combinedText = `${payload.summary ?? ""} ${payload.details ?? ""}`;
  const severity = inferSeverity(payload, combinedText);
  const routedSystemId = routeSystem(reportType, payload);
  const promptInjectionFlag = PROMPT_INJECTION_PATTERN.test(combinedText);
  const spamFlag = SPAM_PATTERN.test(combinedText) || toText(payload.summary).length > 180;
  const immediate = isImmediate(reportType, severity);
  return {
    platform,
    reportType,
    category: reportType,
    severity,
    routedSystemId,
    escalationPolicy: spamFlag ? "spam_review" : immediate ? "immediate_review" : "threshold",
    approvalLevel: reportType === "premium_or_billing" || reportType === "payout_or_money" || reportType === "security_access" || severity === "critical" ? 3 : 2,
    confidence: reportType === "other_support" ? 0.55 : 0.82,
    promptInjectionFlag,
    spamFlag,
  };
};

const fingerprintPayload = (payload: JsonObject, classification: ReturnType<typeof classifyPayload>) => {
  const normalizedRoute = normalizeKeywordText(toText(payload.route)).slice(0, 80);
  const normalizedSurface = normalizeKeywordText(toText(payload.surface)).slice(0, 80);
  const normalizedTarget = normalizeKeywordText(`${payload.targetType ?? payload.target_type ?? ""}:${payload.targetIdHash ?? payload.target_id_hash ?? ""}`).slice(0, 120);
  const normalizedSummary = normalizeKeywordText(`${payload.summary ?? ""} ${payload.details ?? ""}`)
    .split(" ")
    .filter((part) => part.length > 2)
    .slice(0, 14)
    .join(" ");
  return [
    classification.platform,
    classification.reportType,
    classification.routedSystemId,
    normalizedSurface || "surface_unknown",
    normalizedRoute || "route_unknown",
    normalizedTarget || "target_unknown",
    normalizedSummary || "summary_unknown",
  ].join("|");
};

const authenticateUser = async (request: Request, client: SupabaseClientLike) => {
  const authHeader = toText(request.headers.get("authorization"));
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { user: null, error: "auth_required" };
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) return { user: null, error: "auth_required" };
  return { user: data.user, error: null };
};

const buildOwnerCommandPayload = (cluster: JsonObject, approvalLevel: number) => ({
  owner_user_id: null,
  command_text: `User report cluster requires safe operator review: ${cluster.report_type} with ${cluster.unique_reporter_count} unique reporters routed to ${cluster.routed_system_id}.`,
  normalized_intent: "user_report_cluster_routing",
  platform: normalizePlatform(cluster.platform),
  target_systems: cluster.routed_system_id === "money_flow_control"
    ? [cluster.routed_system_id, "support_success_operator"]
    : [cluster.routed_system_id],
  approval_level: approvalLevel,
  status: approvalLevel >= 3 ? "approval_required" : "planned",
  allowed_scope: [
    "read sanitized report cluster summary",
    "write routed operator finding",
    "create scoped owner command or approval request",
    "safe source/proof/test update after target operator preflight",
  ],
  forbidden_scope: [
    "money movement",
    "manual Premium grant",
    "Premium grant",
    "auth/RLS mutation",
    "ban/restrict/delete content directly",
    "provider product mutation",
    "LiveKit routing change",
    "R2/media behavior change",
    "OTA publish or rollback without approval",
    "ad or sponsor activation",
    "raw user text execution",
  ],
  preflight_plan: ["confirm cluster fingerprint and unique reporter count", "review sanitized reproduction details only", "confirm target operator scope"],
  execution_plan: ["target operator records finding", "operator proposes safe fix or blocker", "high-risk work routes to autonomous approval"],
  rollback_plan: ["supersede finding/command rows; no user state was changed"],
  proof_plan: ["run target operator proof/guard and user report router guard"],
  validation_plan: ["verify no high-risk side effect flags were set"],
  metadata: {
    source: "user_report_router",
    cluster_id: cluster.id,
    normalized_fingerprint: cluster.normalized_fingerprint,
    raw_user_text_executed: false,
  },
});

const createApprovalRequest = async (
  client: SupabaseClientLike,
  cluster: JsonObject,
  ownerCommandId: string | null,
  approvalLevel: number,
) => {
  if (approvalLevel < 3) return null;
  const { data, error } = await client
    .from("autonomous_approval_requests")
    .insert({
      system_id: String(cluster.routed_system_id ?? SYSTEM_ID),
      action_id: "user_report_cluster_review",
      platform: normalizePlatform(cluster.platform),
      requested_by_actor_type: SYSTEM_ID,
      requested_by_actor_id: null,
      approval_level: approvalLevel,
      status: "pending",
      title: `User report cluster review for ${cluster.report_type}`,
      reason: "Critical or sensitive user report cluster requires owner/super-admin review before any high-risk action.",
      risk_summary: "User reports are untrusted input and cannot directly execute money, Premium, auth, enforcement, provider, OTA, LiveKit, R2, or ads changes.",
      proposed_action: "Review sanitized cluster and route target operator work through approved scope only.",
      allowed_write_scope: ["sanitized finding rows", "owner command blocker/proof rows", "approval request rows"],
      forbidden_scope: ["direct money movement", "Premium grant", "auth/RLS mutation", "direct enforcement", "provider product mutation", "raw user text execution"],
      rollback_plan: "Cancel approval and supersede routed finding rows; no user state changes were made.",
      kill_switch_plan: "Support Success and target operator emergency stops block execution.",
      proof_plan: "Run user report router, target operator, and owner command guards before execution.",
      validation_plan: "Confirm highRiskExecuted=false, moneyMoved=false, userRightsChanged=false.",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        source: "user_report_router",
        cluster_id: cluster.id,
        owner_command_id: ownerCommandId,
      },
    })
    .select("id,status")
    .single();
  if (error) throw error;

  await client.from("autonomous_approval_request_events").insert({
    request_id: data.id,
    platform: normalizePlatform(cluster.platform),
    event_type: "created",
    actor_type: SYSTEM_ID,
    actor_id: null,
    event_summary: "User report router requested owner review for a critical/sensitive report cluster.",
    metadata: { source: "user_report_router", cluster_id: cluster.id },
  });
  return data;
};

const shouldRouteCluster = (cluster: JsonObject) => {
  if (cluster.spam_flag || cluster.false_positive) return false;
  if (isImmediate(String(cluster.report_type ?? "other_support") as ReportType, String(cluster.severity ?? "review") as Severity)) return true;
  const uniqueReporterCount = Number(cluster.unique_reporter_count ?? 0);
  if (uniqueReporterCount < THRESHOLD_UNIQUE_USERS) return false;
  const firstSeenAt = new Date(String(cluster.first_seen_at ?? new Date().toISOString())).getTime();
  return Date.now() - firstSeenAt <= THRESHOLD_WINDOW_MS;
};

const routeClusterIfNeeded = async (client: SupabaseClientLike, cluster: JsonObject) => {
  if (!shouldRouteCluster(cluster)) return { routed: false, reason: "threshold_not_met" };

  const { data: existing } = await client
    .from("user_report_routing_actions")
    .select("id,owner_command_id,approval_request_id")
    .eq("cluster_id", cluster.id)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { routed: false, reason: "already_routed", routingActionId: existing.id };

  const approvalLevel = isImmediate(String(cluster.report_type ?? "other_support") as ReportType, String(cluster.severity ?? "review") as Severity) ? 3 : 2;
  const { data: command, error: commandError } = await client
    .from("owner_command_requests")
    .insert(buildOwnerCommandPayload(cluster, approvalLevel))
    .select("id,status")
    .single();
  if (commandError) throw commandError;

  const approval = await createApprovalRequest(client, cluster, command?.id ?? null, approvalLevel);

  const actionType = approvalLevel >= 3 ? "immediate_escalation" : "threshold_owner_command";
  const actionStatus = approval?.id ? "approval_request_created" : "owner_command_created";
  const { data: action, error: actionError } = await client
    .from("user_report_routing_actions")
    .insert({
      cluster_id: cluster.id,
      platform: normalizePlatform(cluster.platform),
      action_type: actionType,
      routed_system_id: cluster.routed_system_id,
      owner_command_id: command.id,
      approval_request_id: approval?.id ?? null,
      action_status: actionStatus,
      reason: approvalLevel >= 3 ? "critical_or_sensitive_immediate_escalation" : "three_unique_reporter_threshold_met",
      unique_reporter_count: cluster.unique_reporter_count,
      report_count: cluster.report_count,
      metadata: { source: "user_report_router", raw_user_text_executed: false },
    })
    .select("id")
    .single();
  if (actionError) throw actionError;

  await client.from("user_report_operator_findings").insert({
    cluster_id: cluster.id,
    platform: normalizePlatform(cluster.platform),
    system_id: SYSTEM_ID,
    finding_type: cluster.report_type,
    severity: cluster.severity,
    routed_system_id: cluster.routed_system_id,
    text_summary_redacted: cluster.text_summary_redacted,
    unique_reporter_count: cluster.unique_reporter_count,
    report_count: cluster.report_count,
    owner_command_id: command.id,
    approval_request_id: approval?.id ?? null,
    finding_status: actionStatus,
    metadata: { source: "user_report_router", prompt_injection_executed: false },
  });

  await client
    .from("user_report_clusters")
    .update({
      cluster_status: approvalLevel >= 3 ? "review_required" : "routed",
      action_status: actionStatus,
      owner_command_id: command.id,
      approval_request_id: approval?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cluster.id);

  return { routed: true, routingActionId: action.id, ownerCommandId: command.id, approvalRequestId: approval?.id ?? null };
};

const submitReport = async (request: Request, client: SupabaseClientLike, payload: JsonObject) => {
  const { user, error: authError } = await authenticateUser(request, client);
  if (authError || !user) return jsonResponse(401, { error: "authenticated_user_required" });

  const summary = sanitizeText(payload.summary);
  const details = sanitizeText(payload.details, 900);
  if (!summary && !details) return jsonResponse(422, { error: "report_text_required" });

  const classification = classifyPayload(payload);
  const normalizedFingerprint = fingerprintPayload(payload, classification);
  const targetIdRaw = toText(payload.targetId ?? payload.target_id ?? payload.targetIdHash ?? payload.target_id_hash);
  const targetIdHash = targetIdRaw ? await sha256Hex(targetIdRaw) : null;
  const reporterHash = await sha256Hex(String(user.id));

  const { data: report, error: intakeError } = await client
    .from("user_report_intake_events")
    .insert({
      reporter_user_id: user.id,
      report_type: classification.reportType,
      category: classification.category,
      severity: classification.severity,
      platform: classification.platform,
      surface: toText(payload.surface) || null,
      route: toText(payload.route) || null,
      target_type: toText(payload.targetType ?? payload.target_type) || null,
      target_id_hash: targetIdHash,
      app_version: toText(payload.appVersion ?? payload.app_version) || null,
      update_id: toText(payload.updateId ?? payload.update_id) || null,
      runtime_version: toText(payload.runtimeVersion ?? payload.runtime_version) || null,
      native_build: toText(payload.nativeBuild ?? payload.native_build) || null,
      channel: toText(payload.channel) || null,
      normalized_fingerprint: normalizedFingerprint,
      text_summary_redacted: summary || details.slice(0, 220),
      raw_text_redacted: details || null,
      report_status: "classified",
      spam_flag: classification.spamFlag,
      metadata: {
        source: "user_report_intake",
        prompt_injection_flag: classification.promptInjectionFlag,
        client_requested_routed_system_id_ignored: Boolean(payload.routed_system_id || payload.routedSystemId),
      },
    })
    .select("*")
    .single();
  if (intakeError) throw intakeError;

  await client.from("user_report_classifications").insert({
    report_id: report.id,
    platform: classification.platform,
    report_type: classification.reportType,
    category: classification.category,
    severity: classification.severity,
    routed_system_id: classification.routedSystemId,
    escalation_policy: classification.escalationPolicy,
    confidence: classification.confidence,
    prompt_injection_flag: classification.promptInjectionFlag,
    spam_flag: classification.spamFlag,
    metadata: { source: "user_report_intake", raw_user_text_executed: false },
  });

  const now = new Date().toISOString();
  let { data: cluster, error: clusterReadError } = await client
    .from("user_report_clusters")
    .select("*")
    .eq("platform", classification.platform)
    .eq("normalized_fingerprint", normalizedFingerprint)
    .maybeSingle();
  if (clusterReadError) throw clusterReadError;

  if (!cluster) {
    const { data: insertedCluster, error: insertClusterError } = await client
      .from("user_report_clusters")
      .insert({
        platform: classification.platform,
        normalized_fingerprint: normalizedFingerprint,
        report_type: classification.reportType,
        category: classification.category,
        severity: classification.severity,
        surface: report.surface,
        route: report.route,
        target_type: report.target_type,
        target_id_hash: targetIdHash,
        text_summary_redacted: report.text_summary_redacted,
        unique_reporter_count: 0,
        report_count: 0,
        first_seen_at: now,
        last_seen_at: now,
        cluster_status: classification.spamFlag ? "spam" : "open",
        routed_system_id: classification.routedSystemId,
        action_status: "threshold_pending",
        spam_flag: classification.spamFlag,
        metadata: { source: "user_report_intake" },
      })
      .select("*")
      .single();
    if (insertClusterError) throw insertClusterError;
    cluster = insertedCluster;
  }

  const { data: existingMember } = await client
    .from("user_report_cluster_members")
    .select("id,report_count")
    .eq("cluster_id", cluster.id)
    .eq("reporter_hash", reporterHash)
    .maybeSingle();

  if (existingMember?.id) {
    await client
      .from("user_report_cluster_members")
      .update({
        report_count: Number(existingMember.report_count ?? 1) + 1,
        duplicate_flag: true,
        last_seen_at: now,
      })
      .eq("id", existingMember.id);
    await client.from("user_report_intake_events").update({ duplicate_flag: true }).eq("id", report.id);
  } else {
    await client.from("user_report_cluster_members").insert({
      cluster_id: cluster.id,
      report_id: report.id,
      reporter_user_id: user.id,
      reporter_hash: reporterHash,
      metadata: { source: "user_report_intake" },
    });
  }

  const { count: uniqueReporterCount } = await client
    .from("user_report_cluster_members")
    .select("id", { count: "exact", head: true })
    .eq("cluster_id", cluster.id);
  const { count: reportCount } = await client
    .from("user_report_intake_events")
    .select("id", { count: "exact", head: true })
    .eq("platform", classification.platform)
    .eq("normalized_fingerprint", normalizedFingerprint);

  const updatedClusterPayload = {
    unique_reporter_count: uniqueReporterCount ?? 0,
    report_count: reportCount ?? 0,
    last_seen_at: now,
    severity: classification.severity === "critical" ? "critical" : cluster.severity,
    updated_at: now,
  };
  const { data: updatedCluster, error: updateClusterError } = await client
    .from("user_report_clusters")
    .update(updatedClusterPayload)
    .eq("id", cluster.id)
    .select("*")
    .single();
  if (updateClusterError) throw updateClusterError;

  await client.from("user_report_intake_events").update({ report_status: "clustered" }).eq("id", report.id);
  const routeResult = await routeClusterIfNeeded(client, updatedCluster);
  if (routeResult.routed) {
    await client.from("user_report_intake_events").update({ report_status: "routed" }).eq("id", report.id);
  }

  return jsonResponse(200, {
    ok: true,
    reportId: report.id,
    clusterId: updatedCluster.id,
    classification: {
      platform: classification.platform,
      reportType: classification.reportType,
      severity: classification.severity,
      routedSystemId: classification.routedSystemId,
      escalationPolicy: classification.escalationPolicy,
      spamFlag: classification.spamFlag,
      promptInjectionFlag: classification.promptInjectionFlag,
    },
    cluster: {
      uniqueReporterCount: uniqueReporterCount ?? 0,
      reportCount: reportCount ?? 0,
      thresholdUniqueReporters: THRESHOLD_UNIQUE_USERS,
      actionStatus: routeResult.routed ? "routed" : "threshold_pending",
    },
    routed: routeResult.routed,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  });
};

const getMyReportStatus = async (request: Request, client: SupabaseClientLike) => {
  const { user, error: authError } = await authenticateUser(request, client);
  if (authError || !user) return jsonResponse(401, { error: "authenticated_user_required" });
  const { data, error } = await client
    .from("user_report_intake_events")
    .select("id,report_type,severity,surface,route,report_status,normalized_fingerprint,created_at")
    .eq("reporter_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return jsonResponse(200, {
    ok: true,
    reports: data ?? [],
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  });
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS, status: 204 });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  let payload: JsonObject;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  try {
    const client = createAdminClient();
    const action = toText(payload.action || "submit_report");
    if (action === "classify_report") {
      const { user, error: authError } = await authenticateUser(request, client);
      if (authError || !user) return jsonResponse(401, { error: "authenticated_user_required" });
      const classification = classifyPayload(payload);
      return jsonResponse(200, {
        ok: true,
        classification,
        routedSystemIdIgnoredFromClient: true,
        moneyMoved: false,
        userRightsChanged: false,
        highRiskExecuted: false,
      });
    }
    if (action === "get_my_report_status") return await getMyReportStatus(request, client);
    if (action !== "submit_report") return jsonResponse(422, { error: "unsupported_action" });
    return await submitReport(request, client, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return jsonResponse(500, {
      error: "user_report_intake_failed",
      message,
      moneyMoved: false,
      userRightsChanged: false,
      highRiskExecuted: false,
    });
  }
});
