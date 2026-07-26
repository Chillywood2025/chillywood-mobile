import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleScopedOperatorRequest } from "../_shared/scoped-operator.ts";
import { runIosSecuritySourceProbe } from "../_shared/ios-source-operator-probes.ts";
import { runAndroidSecurityProbe, runSharedSecurityProbe } from "../_shared/all-platform-source-operator-probes.ts";

Deno.serve(handleScopedOperatorRequest({
  systemId: "security_owner_operator",
  tokenHeader: "x-security-owner-operator-token",
  tokenHashEnv: "SECURITY_OWNER_OPERATOR_TOKEN_SHA256",
  tokenError: "security_owner_operator_token_required",
  eventTable: "security_operator_events",
  snapshotTable: "security_health_snapshots",
  reviewTable: "security_required_review_flags",
  defaultHealthState: "healthy",
  allowedActions: [
    "health_snapshot",
    "owner_role_integrity_check",
    "approval_integrity_check",
    "rachi_self_approval_check",
    "admin_route_exposure_check",
    "secret_scan_status_record",
    "watch_once",
    "status",
    "report",
  ],
  approvalActions: ["owner_role_mutation", "auth_rls_policy_mutation", "secret_rotation"],
  actionTables: {
    owner_role_integrity_check: "owner_authority_integrity_findings",
    approval_integrity_check: "approval_integrity_findings",
    rachi_self_approval_check: "approval_integrity_findings",
    admin_route_exposure_check: "security_required_review_flags",
    secret_scan_status_record: "secret_scan_findings",
  },
  watchOnceHandlers: [runSharedSecurityProbe, runAndroidSecurityProbe, runIosSecuritySourceProbe],
  requiredWatchPlatforms: ["shared", "android", "ios"],
}));
