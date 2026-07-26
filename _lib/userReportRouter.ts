export const USER_REPORT_ROUTER_SYSTEM_ID = "support_success_operator" as const;
export const USER_REPORT_ROUTER_ACTION_ID = "user_report_router" as const;
export const USER_REPORT_THRESHOLD_UNIQUE_USERS = 3;
export const USER_REPORT_THRESHOLD_WINDOW_DAYS = 7;
export type UserReportPlatform = "shared" | "ios" | "android" | "web" | "unknown";

export type UserReportClass =
  | "safety_abuse"
  | "harassment"
  | "impersonation"
  | "copyright"
  | "illegal_or_dangerous_content"
  | "bug_broken_feature"
  | "feature_request"
  | "account_access"
  | "premium_or_billing"
  | "payout_or_money"
  | "media_playback"
  | "upload_or_transcode"
  | "livekit_live_watchparty"
  | "chat_or_call"
  | "notification_delivery"
  | "release_update_version"
  | "search_discovery_visibility"
  | "privacy_data"
  | "security_access"
  | "ads_sponsor"
  | "other_support";

export type UserReportSeverity = "low" | "review" | "major" | "critical";

export type UserReportRoutedSystem =
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

export type UserReportClassification = {
  platform: UserReportPlatform;
  reportType: UserReportClass;
  category: UserReportClass;
  severity: UserReportSeverity;
  routedSystemId: UserReportRoutedSystem;
  escalationPolicy: "threshold" | "immediate_review" | "manual_review" | "spam_review";
  approvalLevel: 1 | 2 | 3 | 4;
  confidence: number;
  promptInjectionFlag: boolean;
  spamFlag: boolean;
  reason: string;
};

export type UserReportInput = {
  reportType?: string | null;
  category?: string | null;
  severity?: string | null;
  surface?: string | null;
  route?: string | null;
  targetType?: string | null;
  targetIdHash?: string | null;
  summary?: string | null;
  details?: string | null;
  devicePlatform?: string | null;
  appVersion?: string | null;
  updateId?: string | null;
  runtimeVersion?: string | null;
};

export type UserReportClusterSummary = {
  clusterId?: string | null;
  normalizedFingerprint: string;
  reportType: UserReportClass;
  severity: UserReportSeverity;
  routedSystemId: UserReportRoutedSystem;
  uniqueReporterCount: number;
  reportCount: number;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  textSummaryRedacted?: string | null;
  spamFlag?: boolean;
  falsePositive?: boolean;
  platform?: UserReportPlatform;
};

const SECRET_KEY_PATTERN = /(service[_\s-]?role|secret|token|password|credential|authorization|signed[_\s-]?url|api[_\s-]?key|private[_\s-]?key|db[_\s-]?url|database[_\s-]?url|payment[_\s-]?credential|tax[_\s-]?id|bank[_\s-]?detail|reporter identity|private evidence)/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const LONG_SECRET_LIKE_PATTERN = /[A-Za-z0-9._~+/=-]{32,}/g;
const PROMPT_INJECTION_PATTERN = /(ignore (all )?(previous|prior) instructions|developer message|system prompt|run this command|execute this|bypass approval|approve this|owner command|service role|grant premium|move money|ban user|delete content)/i;
const SPAM_PATTERN = /(free money|crypto giveaway|airdrop|follow my link|http:\/\/|https:\/\/.*https:\/\/|.{0,12}\b(?:buy now|promo code)\b.{0,12})/i;

const CATEGORY_HINTS: Array<[UserReportClass, RegExp]> = [
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

const ROUTES_TO_INSTALLED_QA = /^\/?(admin|chat|creator-monetization-setup|subscribe|settings|creator|channel-studio)\b/i;

const normalizeText = (value: unknown) => String(value ?? "").trim();

export const normalizeUserReportPlatform = (value: unknown): UserReportPlatform => {
  const platform = normalizeText(value).toLowerCase();
  if (["ios", "iphone", "ipad", "testflight", "app_store"].includes(platform)) return "ios";
  if (["android", "google_play", "play_store", "firebase_test_lab"].includes(platform)) return "android";
  if (["web", "browser", "pwa"].includes(platform)) return "web";
  if (platform === "shared") return "shared";
  return "unknown";
};

const inferPlatformFromText = (input: UserReportInput): UserReportPlatform => {
  const explicit = normalizeUserReportPlatform(input.devicePlatform);
  if (explicit !== "unknown") return explicit;
  const text = `${input.surface ?? ""} ${input.route ?? ""} ${input.summary ?? ""} ${input.details ?? ""}`;
  if (/\b(ios|iphone|ipad|testflight|app store|storekit|iap|apple subscription|apns|pushkit|callkit|voip)\b/i.test(text)) return "ios";
  if (/\b(android|google play|play billing|fcm|apk|aab|versioncode|firebase test lab)\b/i.test(text)) return "android";
  if (/\b(web|browser|pwa|website)\b/i.test(text)) return "web";
  return "unknown";
};

const PLATFORM_SPECIFIC_REPORT_SIGNAL = /\b(ios|iphone|ipad|testflight|app store|storekit|iap|apple subscription|app privacy|privacyinfo|privacy manifest|apns|pushkit|callkit|voip|android|google play|play billing|data safety|fcm|apk|aab|versioncode|firebase test lab|web|browser|pwa|permission screen|account deletion (?:screen|button|route)|sign[ -]?in screen|login screen|route|screen|button)\b/i;

const platformForClassification = (reportType: UserReportClass, input: UserReportInput): UserReportPlatform => {
  const inferred = inferPlatformFromText(input);
  if (!["safety_abuse", "harassment", "impersonation", "copyright", "illegal_or_dangerous_content", "privacy_data", "account_access"].includes(reportType)) return inferred;
  const issueText = `${input.surface ?? ""} ${input.route ?? ""} ${input.summary ?? ""} ${input.details ?? ""}`;
  return inferred !== "unknown" && PLATFORM_SPECIFIC_REPORT_SIGNAL.test(issueText) ? inferred : "shared";
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

export const sanitizeUserReportText = (value: unknown, maxLength = 420) => {
  const redacted = normalizeText(value)
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(IPV4_PATTERN, "[redacted-ip]")
    .replace(SECRET_KEY_PATTERN, "[redacted-sensitive-term]")
    .replace(LONG_SECRET_LIKE_PATTERN, "[redacted-long-value]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 15)}...[redacted]` : redacted;
};

const normalizeSeverity = (value: unknown, text: string): UserReportSeverity => {
  const severity = normalizeText(value).toLowerCase();
  if (["critical", "urgent", "blocking"].includes(severity)) return "critical";
  if (["major", "high"].includes(severity)) return "major";
  if (["low", "polish", "insight"].includes(severity)) return "low";
  if (/\b(data leak|hacked|unauthorized|charged|charge failed|minor safety|threat|self harm|exploit|provider down)\b/i.test(text)) {
    return "critical";
  }
  if (/\b(crash|blocked|dead end|cannot sign in|not working|broken)\b/i.test(text)) return "major";
  return "review";
};

const normalizeReportClass = (value: unknown): UserReportClass | null => {
  const text = normalizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
  const allowed: UserReportClass[] = [
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
  ];
  return allowed.includes(text as UserReportClass) ? text as UserReportClass : null;
};

const inferReportClass = (input: UserReportInput): UserReportClass => {
  const explicit = normalizeReportClass(input.reportType) ?? normalizeReportClass(input.category);
  if (explicit) return explicit;

  const text = `${input.category ?? ""} ${input.summary ?? ""} ${input.details ?? ""} ${input.surface ?? ""} ${input.route ?? ""}`;
  for (const [category, pattern] of CATEGORY_HINTS) {
    if (pattern.test(text)) return category;
  }
  return "other_support";
};

export const routeUserReportToSystem = (
  reportType: UserReportClass,
  input: Pick<UserReportInput, "route" | "surface" | "summary" | "details"> = {},
): UserReportRoutedSystem => {
  const route = normalizeText(input.route);
  const text = `${input.surface ?? ""} ${input.summary ?? ""} ${input.details ?? ""}`;

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

export const shouldEscalateImmediately = (classification: Pick<UserReportClassification, "reportType" | "severity">) => {
  if (classification.severity === "critical") return true;
  return [
    "safety_abuse",
    "illegal_or_dangerous_content",
    "security_access",
    "premium_or_billing",
    "payout_or_money",
    "privacy_data",
  ].includes(classification.reportType);
};

export const detectReportSpamOrAbuse = (input: UserReportInput) => {
  const text = `${input.summary ?? ""} ${input.details ?? ""}`;
  return {
    spamFlag: SPAM_PATTERN.test(text) || normalizeText(input.summary).length > 180,
    promptInjectionFlag: PROMPT_INJECTION_PATTERN.test(text),
  };
};

export const classifyUserReport = (input: UserReportInput): UserReportClassification => {
  const reportType = inferReportClass(input);
  const platform = platformForClassification(reportType, input);
  const combinedText = `${input.summary ?? ""} ${input.details ?? ""}`;
  const severity = normalizeSeverity(input.severity, combinedText);
  const routedSystemId = routeUserReportToSystem(reportType, input);
  const spam = detectReportSpamOrAbuse(input);
  const immediate = shouldEscalateImmediately({ reportType, severity });
  const approvalLevel: UserReportClassification["approvalLevel"] = (
    reportType === "premium_or_billing" || reportType === "payout_or_money" || reportType === "security_access" || severity === "critical"
      ? 3
      : 2
  );
  return {
    platform,
    reportType,
    category: reportType,
    severity,
    routedSystemId,
    escalationPolicy: spam.spamFlag ? "spam_review" : immediate ? "immediate_review" : "threshold",
    approvalLevel,
    confidence: reportType === "other_support" ? 0.55 : 0.82,
    promptInjectionFlag: spam.promptInjectionFlag,
    spamFlag: spam.spamFlag,
    reason: immediate ? "critical_or_sensitive_category" : "threshold_routing",
  };
};

export const fingerprintUserReport = (input: UserReportInput, classification = classifyUserReport(input)) => {
  const normalizedRoute = normalizeKeywordText(normalizeText(input.route)).slice(0, 80);
  const normalizedSurface = normalizeKeywordText(normalizeText(input.surface)).slice(0, 80);
  const normalizedTarget = normalizeKeywordText(`${input.targetType ?? ""}:${input.targetIdHash ?? ""}`).slice(0, 120);
  const normalizedSummary = normalizeKeywordText(`${input.summary ?? ""} ${input.details ?? ""}`)
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

export const classifyProofSource = (source: unknown) => {
  const value = normalizeText(source).toLowerCase();
  if (value === "app_user_report") return "app_user_report";
  if (value === "support_feedback") return "support_feedback";
  if (value === "safety_report") return "safety_report";
  return "unknown_user_report_source";
};

export const shouldCreateThresholdAction = (cluster: UserReportClusterSummary, now = new Date()) => {
  if (cluster.spamFlag || cluster.falsePositive) return false;
  if (shouldEscalateImmediately(cluster)) return true;
  if (cluster.uniqueReporterCount < USER_REPORT_THRESHOLD_UNIQUE_USERS) return false;
  const firstSeen = cluster.firstSeenAt ? new Date(cluster.firstSeenAt) : now;
  const windowMs = USER_REPORT_THRESHOLD_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - firstSeen.getTime() <= windowMs;
};

export const summarizeUserReportCluster = (cluster: UserReportClusterSummary) => (
  `${cluster.uniqueReporterCount} unique user report${cluster.uniqueReporterCount === 1 ? "" : "s"} for ${cluster.reportType} routed to ${cluster.routedSystemId}.`
);

export const buildOwnerCommandFromReportCluster = (cluster: UserReportClusterSummary) => {
  const approvalLevel = shouldEscalateImmediately(cluster) ? 3 : 2;
  return {
    commandText: `User report cluster requires safe operator review: ${cluster.reportType} with ${cluster.uniqueReporterCount} unique reporters routed to ${cluster.routedSystemId}.`,
    normalizedIntent: "user_report_cluster_routing",
    platform: cluster.platform ?? "unknown",
    targetSystems: cluster.routedSystemId === "money_flow_control"
      ? [cluster.routedSystemId, "support_success_operator"]
      : [cluster.routedSystemId],
    approvalLevel,
    status: approvalLevel >= 3 ? "approval_required" : "planned",
    allowedScope: [
      "read sanitized report cluster summary",
      "write routed operator finding",
      "create scoped owner command or approval request",
      "safe source/proof/test update after target operator preflight",
    ],
    forbiddenScope: [
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
    preflightPlan: [
      "confirm cluster fingerprint and unique reporter count",
      "review sanitized reproduction details only",
      "confirm target operator scope and emergency state",
    ],
    executionPlan: [
      "target operator records finding",
      "operator proposes safe fix or blocker",
      "high-risk work routes to autonomous approval",
    ],
    rollbackPlan: ["supersede finding/command rows; no user state was changed"],
    proofPlan: ["run target operator proof/guard and user report router guard"],
    validationPlan: ["verify no high-risk side effect flags were set"],
  };
};

export const sanitizeUserReportProof = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeUserReportProof);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? sanitizeUserReportText(value, 220) : value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    SECRET_KEY_PATTERN.test(key) ? "redacted_key" : key,
    SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeUserReportProof(entry),
  ]));
};
