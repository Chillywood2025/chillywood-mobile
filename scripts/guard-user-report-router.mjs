import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const helper = read("_lib/userReportRouter.ts");
const edge = read("supabase/functions/user-report-intake/index.ts");
const migration = read("supabase/migrations/20260718134500_governed_user_report_router.sql");
const atomicMigration = read("supabase/migrations/20260718141500_atomic_user_report_clustering.sql");
const atomicRoutingMigration = read("supabase/migrations/20260718142500_atomic_user_report_routing.sql");
const supportScreen = read("components/system/support-screen.tsx");

assert(!edge.includes("Deno.env.get(\"STRIPE") && !edge.includes("stripe.") && !edge.includes("grant_premium"), "report router must not access money/provider grant paths");
assert(!edge.includes(".from(\"entitlements\")") && !edge.includes(".from(\"premium") && !edge.includes(".from(\"auth."), "report router must not mutate entitlements/auth tables");
assert(!edge.includes("ban_user") && !edge.includes("delete_content") && !edge.includes("restrict_user"), "report router must not directly enforce moderation");
assert(!edge.includes("publish_ota") && !edge.includes("rollback_ota"), "report router must not publish or rollback OTA");
assert(!edge.includes("serve_ads") && !edge.includes("sponsor_checkout"), "report router must not activate ads/sponsors");

assert(edge.includes("authenticateUser"), "reports must require authenticated user path");
assert(edge.includes("action !== \"submit_report\"") && edge.includes("unsupported_action"), "user intake must reject unsupported client actions");
assert(edge.includes("client_requested_routed_system_id_ignored"), "client-routed system requests must be ignored");
assert(edge.includes("upsert_user_report_cluster_membership"), "report clustering must use the service-only atomic transition");
assert(edge.includes("route_user_report_cluster"), "qualified report routing must use the service-only atomic transaction");
assert(atomicMigration.includes("for update") && atomicMigration.includes("on conflict (platform, normalized_fingerprint)"), "atomic clustering must lock retries and resolve cluster races");
assert(atomicMigration.includes("revoke all on function public.upsert_user_report_cluster_membership(uuid, text) from public, anon, authenticated"), "atomic clustering must deny client execution");
assert(atomicRoutingMigration.includes("for update") && atomicRoutingMigration.includes("user_report_routing_actions_cluster_uidx"), "atomic routing must lock each cluster and enforce one route action");
assert(atomicRoutingMigration.includes("revoke all on function public.route_user_report_cluster(uuid) from public, anon, authenticated"), "atomic routing must deny client execution");
assert(atomicRoutingMigration.includes("money_moved") === false && atomicRoutingMigration.includes("payable_balance") === false, "atomic routing must not contain a money-write path");
assert(helper.includes("sanitizeUserReportText") && edge.includes("sanitizeText"), "router must sanitize report text");
assert(helper.includes("PROMPT_INJECTION_PATTERN") && edge.includes("PROMPT_INJECTION_PATTERN"), "router must detect prompt-injection text");

for (const table of [
  "user_report_classifications",
  "user_report_clusters",
  "user_report_cluster_members",
  "user_report_routing_actions",
  "user_report_operator_findings",
]) {
  assert(migration.includes(`revoke all on table public.${table} from anon, authenticated`), `${table} must deny client writes`);
}

assert(supportScreen.includes("submitUserReport"), "support UI must submit to user_report_router");
assert(supportScreen.includes("user-report-bug-button") && supportScreen.includes("user-report-safety-button") && supportScreen.includes("user-report-help-button"), "missing user report entry points");

console.log("guard:user-report-router passed");
