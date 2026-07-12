import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleScopedOperatorRequest } from "../_shared/scoped-operator.ts";

Deno.serve(handleScopedOperatorRequest({
  systemId: "release_ota_operator",
  tokenHeader: "x-release-operator-token",
  tokenHashEnv: "RELEASE_OPERATOR_TOKEN_SHA256",
  tokenError: "release_operator_token_required",
  eventTable: "release_operator_events",
  snapshotTable: "release_health_snapshots",
  reviewTable: "release_required_review_flags",
  defaultHealthState: "healthy",
  allowedActions: [
    "health_snapshot",
    "read_release_diagnostics_report",
    "ota_channel_runtime_check",
    "emergency_launch_report",
    "rollout_anomaly_report",
    "rollback_readiness_plan",
    "watch_once",
    "status",
    "report",
  ],
  approvalActions: ["production_ota_publish", "production_ota_rollback", "store_release_submission"],
  actionTables: {
    read_release_diagnostics_report: "ota_diagnostics_readback_records",
    ota_channel_runtime_check: "ota_diagnostics_readback_records",
    emergency_launch_report: "rollout_anomaly_findings",
    rollout_anomaly_report: "rollout_anomaly_findings",
    rollback_readiness_plan: "rollback_readiness_records",
  },
}));
