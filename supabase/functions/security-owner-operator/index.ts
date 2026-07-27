import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  handleScopedOperatorRequest,
  type ScopedOperatorHandler,
} from "../_shared/scoped-operator.ts";
import { runIosSecuritySourceProbe } from "../_shared/ios-source-operator-probes.ts";
import { runAndroidSecurityProbe, runSharedSecurityProbe } from "../_shared/all-platform-source-operator-probes.ts";

const runCognitiveNetAclGuard: ScopedOperatorHandler = async ({ client }) => {
  const checkedAt = new Date().toISOString();
  const { data, error } = await client.rpc(
    "cognitive_record_net_acl_guard_readback",
  );
  if (error) throw new Error("cognitive_net_acl_guard_readback_failed");

  const snapshot = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const passed = snapshot.guard_status === "PASS" &&
    snapshot.public_usage_denied === true &&
    snapshot.required_direct_grants_present === true &&
    snapshot.cognitive_net_access_count === 0 &&
    snapshot.automatic_repair_attempted === false;

  return {
    // The SQL readback owns the durable finding/review/Owner Command lifecycle.
    // Avoid allowing the following healthy shared-platform probe to resolve an
    // ACL mismatch finding by platform alone.
    lifecycleManaged: true,
    readbackComplete: passed,
    platform: "shared",
    provider: "supabase",
    surface: "cognitive_pg_net_acl",
    source: "cognitive_runtime.net_acl_guard_snapshot",
    dataWindow: { start: checkedAt, end: checkedAt },
    healthState: passed ? "healthy" : "critical",
    reasons: passed ? [] : ["cognitive_net_acl_guard_mismatch"],
    guardStatus: passed ? "PASS" : "FAIL",
    publicUsageDenied: snapshot.public_usage_denied === true,
    requiredDirectGrantsPresent:
      snapshot.required_direct_grants_present === true,
    cognitiveNetAccessCount: Number(
      snapshot.cognitive_net_access_count ?? -1,
    ),
    providerAdministrationRequired:
      snapshot.provider_administration_required === true,
    automaticRepairAttempted: false,
    emergencyStopAuthorityPreserved: true,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
  };
};

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
  watchOnceHandlers: [
    runCognitiveNetAclGuard,
    runSharedSecurityProbe,
    runAndroidSecurityProbe,
    runIosSecuritySourceProbe,
  ],
  requiredWatchPlatforms: ["shared", "android", "ios"],
}));
