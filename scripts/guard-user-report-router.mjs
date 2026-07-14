import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const helper = read("_lib/userReportRouter.ts");
const edge = read("supabase/functions/user-report-intake/index.ts");
const migration = read("supabase/migrations/20260714001704_user_report_router.sql");
const supportScreen = read("components/system/support-screen.tsx");

assert(!edge.includes("Deno.env.get(\"STRIPE") && !edge.includes("stripe.") && !edge.includes("grant_premium"), "report router must not access money/provider grant paths");
assert(!edge.includes(".from(\"entitlements\")") && !edge.includes(".from(\"premium") && !edge.includes(".from(\"auth."), "report router must not mutate entitlements/auth tables");
assert(!edge.includes("ban_user") && !edge.includes("delete_content") && !edge.includes("restrict_user"), "report router must not directly enforce moderation");
assert(!edge.includes("publish_ota") && !edge.includes("rollback_ota"), "report router must not publish or rollback OTA");
assert(!edge.includes("serve_ads") && !edge.includes("sponsor_checkout"), "report router must not activate ads/sponsors");

assert(edge.includes("authenticateUser"), "reports must require authenticated user path");
assert(edge.includes("action !== \"submit_report\"") && edge.includes("unsupported_action"), "user intake must reject unsupported client actions");
assert(edge.includes("client_requested_routed_system_id_ignored"), "client-routed system requests must be ignored");
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
