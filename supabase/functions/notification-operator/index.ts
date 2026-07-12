import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleScopedOperatorRequest } from "../_shared/scoped-operator.ts";

Deno.serve(handleScopedOperatorRequest({
  systemId: "notification_delivery_operator",
  tokenHeader: "x-notification-operator-token",
  tokenHashEnv: "NOTIFICATION_OPERATOR_TOKEN_SHA256",
  tokenError: "notification_operator_token_required",
  eventTable: "notification_operator_events",
  snapshotTable: "notification_delivery_health_snapshots",
  reviewTable: "notification_required_review_flags",
  defaultHealthState: "healthy",
  allowedActions: [
    "health_snapshot",
    "delivery_provider_health",
    "token_cleanup_plan",
    "record_delivery_attempt",
    "mark_token_provider_revoked",
    "retry_queue_report",
    "watch_once",
    "status",
    "report",
  ],
  approvalActions: ["push_blast_or_campaign_send", "provider_push_config_change"],
  actionTables: {
    delivery_provider_health: "notification_provider_sync_status",
    record_delivery_attempt: "notification_operator_events",
    retry_queue_report: "notification_required_review_flags",
    token_cleanup_plan: "notification_required_review_flags",
    mark_token_provider_revoked: "notification_required_review_flags",
    duplicate_delivery_dedupe: "notification_duplicate_dedupe_records",
  },
}));
