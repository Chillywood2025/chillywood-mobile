import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const helper = read("_lib/userReportRouter.ts");
const edge = read("supabase/functions/user-report-intake/index.ts");
const migration = read("supabase/migrations/20260714001704_user_report_router.sql");
const supportFunction = read("supabase/functions/support-success-operator/index.ts");
const admin = read("app/admin.tsx");
const supportScreen = read("components/system/support-screen.tsx");

for (const fn of [
  "classifyUserReport",
  "fingerprintUserReport",
  "routeUserReportToSystem",
  "shouldEscalateImmediately",
  "shouldCreateThresholdAction",
  "buildOwnerCommandFromReportCluster",
  "sanitizeUserReportText",
  "detectReportSpamOrAbuse",
  "summarizeUserReportCluster",
]) {
  assert(helper.includes(`export const ${fn}`), `missing helper export: ${fn}`);
}

for (const category of [
  "safety_abuse",
  "bug_broken_feature",
  "account_access",
  "premium_or_billing",
  "payout_or_money",
  "media_playback",
  "livekit_live_watchparty",
  "notification_delivery",
  "release_update_version",
  "search_discovery_visibility",
  "privacy_data",
  "security_access",
  "ads_sponsor",
]) {
  assert(helper.includes(category) && edge.includes(category), `missing classifier category: ${category}`);
}

for (const [category, system] of [
  ["safety_abuse", "moderation_safety_operator"],
  ["premium_or_billing", "support_success_operator"],
  ["security_access", "security_owner_operator"],
  ["privacy_data", "privacy_compliance_operator"],
  ["livekit_live_watchparty", "livekit_operator"],
  ["media_playback", "media_automation"],
  ["notification_delivery", "notification_delivery_operator"],
  ["release_update_version", "release_ota_operator"],
  ["search_discovery_visibility", "search_ranking_integrity_operator"],
  ["ads_sponsor", "ads_sponsor_delivery_operator"],
  ["bug_broken_feature", "installed_product_qa_operator"],
]) {
  assert(helper.includes(category), `helper missing route category ${category}`);
  assert(helper.includes(system) && edge.includes(system), `missing route target ${system}`);
}

for (const table of [
  "user_report_intake_events",
  "user_report_classifications",
  "user_report_clusters",
  "user_report_cluster_members",
  "user_report_routing_actions",
  "user_report_operator_findings",
  "user_report_router_learning_state",
]) {
  assert(migration.includes(`create table if not exists public.${table}`), `missing table ${table}`);
  assert(migration.includes(`alter table public.${table} enable row level security`), `RLS not enabled for ${table}`);
  assert(migration.includes(`revoke all on table public.${table} from anon, authenticated`), `client roles not revoked for ${table}`);
}

assert(edge.includes("authenticateUser") && edge.includes("authenticated_user_required"), "user report intake must require an authenticated user");
assert(edge.includes("client_requested_routed_system_id_ignored"), "client-provided routed system must be ignored");
assert(edge.includes("owner_command_requests"), "threshold routing must create safe owner command rows");
assert(edge.includes("autonomous_approval_requests"), "critical report routing must be able to create approval requests");
assert(supportFunction.includes("user_report_router_watch_once"), "support_success_operator missing user report router action");
assert(supportFunction.includes("route_report_clusters"), "support_success_operator missing report cluster routing action");

for (const testId of [
  "user-report-bug-button",
  "user-report-safety-button",
  "user-report-help-button",
  "user-report-submit-button",
  "admin-user-report-router-section",
  "user-report-cluster-card",
  "user-report-routed-system",
  "user-report-threshold-status",
  "user-report-owner-command-link",
]) {
  assert(supportScreen.includes(testId) || admin.includes(testId) || read("components/beta/beta-feedback-sheet.tsx").includes(testId), `missing UI/admin testID ${testId}`);
}

console.log("proof:user-report-router passed");
