import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleScopedOperatorRequest } from "../_shared/scoped-operator.ts";

Deno.serve(handleScopedOperatorRequest({
  systemId: "moderation_safety_operator",
  tokenHeader: "x-moderation-safety-operator-token",
  tokenHashEnv: "MODERATION_SAFETY_OPERATOR_TOKEN_SHA256",
  tokenError: "moderation_safety_operator_token_required",
  eventTable: "moderation_operator_events",
  snapshotTable: "moderation_health_snapshots",
  reviewTable: "moderation_required_review_flags",
  defaultHealthState: "healthy",
  allowedActions: [
    "health_snapshot",
    "queue_health",
    "stale_case_scan",
    "duplicate_report_scan",
    "mark_requires_review",
    "recommend_safety_action",
    "watch_once",
    "status",
    "report",
  ],
  approvalActions: ["ban_suspend_restrict_or_delete_content", "fraud_hold_enforcement", "disable_uploads_live_or_account"],
  actionTables: {
    queue_health: "moderation_required_review_flags",
    stale_case_scan: "moderation_stale_case_findings",
    duplicate_report_scan: "moderation_duplicate_report_detections",
    mark_requires_review: "moderation_required_review_flags",
    recommend_safety_action: "safety_review_recommendations",
    case_priority_flag: "moderation_case_priority_flags",
  },
}));
