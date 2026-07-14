export const SUPPORT_SUCCESS_OPERATOR_ID = "support_success_operator" as const;

export type SupportSuccessFindingClass =
  | "support_queue_health"
  | "stale_ticket_review"
  | "refund_request_review"
  | "premium_support_readback"
  | "account_access_review"
  | "owner_admin_escalation"
  | "user_report_router_review";

const SECRET_KEY_PATTERN = /(secret|token|password|credential|authorization|service[_-]?role|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|email|phone)/i;
const LONG_SECRET_LIKE_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

export const sanitizeSupportSuccessProof = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeSupportSuccessProof);
  if (!value || typeof value !== "object") return typeof value === "string" ? value.replace(LONG_SECRET_LIKE_PATTERN, "[redacted]") : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
    .map(([key, entry]) => [key, sanitizeSupportSuccessProof(entry)]));
};

export const classifySupportSuccessFinding = (text: string): SupportSuccessFindingClass => {
  const normalized = text.toLowerCase();
  if (normalized.includes("stale")) return "stale_ticket_review";
  if (normalized.includes("refund")) return "refund_request_review";
  if (normalized.includes("premium")) return "premium_support_readback";
  if (normalized.includes("account")) return "account_access_review";
  if (normalized.includes("user report") || normalized.includes("cluster")) return "user_report_router_review";
  if (normalized.includes("escalat")) return "owner_admin_escalation";
  return "support_queue_health";
};

export const buildSupportSuccessWatchPlan = () => ({
  systemId: SUPPORT_SUCCESS_OPERATOR_ID,
  checks: [
    "support_inbox_health",
    "stale_support_ticket_detection",
    "refund_request_classification",
    "classify_unrouted_reports",
    "cluster_user_reports",
    "route_report_clusters",
    "support_response_drafts",
    "escalation_to_owner_admin",
  ],
  forbidden: [
    "issuing refunds",
    "granting Premium",
    "moving money",
    "resetting credentials without approved flow",
    "sending legal/payment commitments",
    "executing raw user report text",
    "direct high-risk changes from reports",
  ],
});

export const buildSupportSuccessOwnerCommand = (finding: SupportSuccessFindingClass) => ({
  commandText: `Support Success Operator finding requires safe support follow-up: ${finding}.`,
  normalizedIntent: "support_success",
  targetSystems: [SUPPORT_SUCCESS_OPERATOR_ID],
  approvalLevel: finding === "refund_request_review" ? 4 : 2,
  allowedScope: ["support health/finding rows", "draft response rows", "owner/admin escalation"],
  forbiddenScope: ["refund execution", "Premium grant", "auth mutation", "external legal/payment commitment"],
});

export const buildUserReportRouterWatchPlan = () => ({
  systemId: SUPPORT_SUCCESS_OPERATOR_ID,
  action: "user_report_router_watch_once",
  batchLimits: {
    unroutedReports: 50,
    clustersToRoute: 10,
  },
  checks: ["classify_unrouted_reports", "cluster_user_reports", "route_report_clusters", "report_router_status"],
  threshold: {
    uniqueUsers: 3,
    windowDays: 7,
  },
  forbidden: [
    "money movement",
    "Premium grant",
    "auth/RLS mutation",
    "direct enforcement",
    "provider product mutation",
    "LiveKit routing change",
    "R2/media behavior change",
    "OTA publish or rollback",
    "ads/sponsor activation",
    "raw user text execution",
  ],
});
