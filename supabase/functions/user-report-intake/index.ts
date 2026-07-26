import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

const SYSTEM_ID = "support_success_operator";
const THRESHOLD_UNIQUE_USERS = 3;

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
  ["harassment", /\b(harass(?:ment|ed|ing)?|bully|hate|slur|stalking)\b/i],
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

const PLATFORM_SPECIFIC_REPORT_SIGNAL = /\b(ios|iphone|ipad|testflight|app store|storekit|iap|apple subscription|app privacy|privacyinfo|privacy manifest|apns|pushkit|callkit|voip|android|google play|play billing|data safety|fcm|apk|aab|versioncode|firebase test lab|web|browser|pwa|permission screen|account deletion (?:screen|button|route)|sign[ -]?in screen|login screen|route|screen|button)\b/i;

const classifyPlatform = (payload: JsonObject, reportType: ReportType): Platform => {
  const explicit = normalizePlatform(payload.platform ?? payload.devicePlatform ?? payload.device_platform);
  const text = `${payload.surface ?? ""} ${payload.route ?? ""} ${payload.summary ?? ""} ${payload.details ?? ""}`;
  const inferred = explicit !== "unknown"
    ? explicit
    : /\b(ios|iphone|ipad|testflight|app store|storekit|iap|apple subscription|apns|pushkit|callkit|voip)\b/i.test(text)
      ? "ios"
      : /\b(android|google play|play billing|fcm|apk|aab|versioncode|firebase test lab)\b/i.test(text)
        ? "android"
        : /\b(web|browser|pwa|website)\b/i.test(text)
          ? "web"
          : "unknown";
  if (!["safety_abuse", "harassment", "impersonation", "copyright", "illegal_or_dangerous_content", "privacy_data", "account_access"].includes(reportType)) return inferred;
  return inferred !== "unknown" && PLATFORM_SPECIFIC_REPORT_SIGNAL.test(text) ? inferred : "shared";
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

const routeClusterIfNeeded = async (client: SupabaseClientLike, cluster: JsonObject) => {
  const { data, error } = await client.rpc("route_user_report_cluster", { p_cluster_id: cluster.id });
  if (error) throw error;
  return (data ?? { routed: false, reason: "routing_result_missing" }) as JsonObject;
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

  const { data: clusterTransition, error: clusterTransitionError } = await client.rpc(
    "upsert_user_report_cluster_membership",
    { p_report_id: report.id, p_reporter_hash: reporterHash },
  );
  if (clusterTransitionError) throw clusterTransitionError;
  const updatedCluster = clusterTransition?.cluster;
  if (!updatedCluster?.id) throw new Error("atomic_cluster_transition_missing_result");
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
      uniqueReporterCount: Number(updatedCluster.unique_reporter_count ?? 0),
      reportCount: Number(updatedCluster.report_count ?? 0),
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
