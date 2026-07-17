import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const helper = read("_lib/userReportRouter.ts");
const edge = read("supabase/functions/user-report-intake/index.ts");
const migration = read("supabase/migrations-isolated/20260714001704_user_report_router.sql");
const registry = read("_lib/autonomousSystemsRegistry.ts");

assert(helper.includes("USER_REPORT_THRESHOLD_UNIQUE_USERS = 3"), "normal bug routing threshold must remain 3 unique users");
assert(edge.includes("THRESHOLD_UNIQUE_USERS = 3"), "Edge threshold must remain 3 unique users");
assert(migration.includes("unique (cluster_id, reporter_hash)"), "same reporter must not satisfy threshold multiple times");
assert(edge.includes("already_routed"), "router must avoid duplicate Owner Commands for one cluster");
assert(edge.includes("owner_command_requests"), "clusters must route through Owner Command, not direct execution");
assert(edge.includes("autonomous_approval_requests"), "high-risk clusters must have approval path");

for (const blocked of [
  "money movement",
  "Premium grant",
  "auth/RLS mutation",
  "direct moderation enforcement",
  "provider product mutation",
  "LiveKit routing changes",
  "R2/media behavior changes",
  "OTA publish/rollback",
  "ad or sponsor activation",
  "raw user text execution",
]) {
  assert(registry.includes(blocked), `registry missing blocked report action: ${blocked}`);
}

assert(helper.includes("ads_sponsor_delivery_operator"), "ads/sponsor reports must route to foundation operator only");
assert(!edge.includes("roles/storage.admin") && !edge.includes("service_role_key"), "report router must not request infrastructure credentials");
assert(edge.includes("moneyMoved: false") && edge.includes("userRightsChanged: false") && edge.includes("highRiskExecuted: false"), "responses must preserve no-side-effect flags");

console.log("guard:user-report-threshold-routing passed");
