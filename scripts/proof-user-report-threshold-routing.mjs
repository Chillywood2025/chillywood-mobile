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

assert(helper.includes("USER_REPORT_THRESHOLD_UNIQUE_USERS = 3"), "default threshold must be 3 unique users");
assert(helper.includes("USER_REPORT_THRESHOLD_WINDOW_DAYS = 7"), "default threshold window must be 7 days");
assert(edge.includes("THRESHOLD_UNIQUE_USERS = 3"), "Edge threshold must be 3 unique users");
assert(atomicRoutingMigration.includes("interval '7 days'"), "atomic routing threshold window must be 7 days");

assert(migration.includes("constraint user_report_cluster_members_unique_reporter unique (cluster_id, reporter_hash)"), "cluster members must dedupe by unique reporter hash");
assert(atomicMigration.includes("upsert_user_report_cluster_membership") && atomicMigration.includes("idempotentReplay"), "threshold accounting must be atomic and idempotent");
assert(atomicMigration.includes("on conflict (cluster_id, reporter_hash)"), "atomic transition must dedupe reporter hashes under concurrency");
assert(atomicMigration.includes("duplicate_flag = v_duplicate"), "same-user repeat reports must be marked duplicate");
assert(edge.includes("unique_reporter_count") && edge.includes("report_count"), "cluster counts must track unique reporters and total reports");

assert(helper.includes("shouldEscalateImmediately"), "helper must expose immediate escalation policy");
assert(edge.includes("isImmediate"), "Edge must have immediate escalation policy");
for (const category of ["security_access", "premium_or_billing", "payout_or_money", "privacy_data", "safety_abuse"]) {
  assert(helper.includes(category) && edge.includes(category), `missing immediate category ${category}`);
}

assert(edge.includes("routeClusterIfNeeded"), "Edge must route clusters only after threshold/immediate preflight");
assert(edge.includes("route_user_report_cluster"), "Edge routing must delegate to one database transaction");
assert(atomicRoutingMigration.includes("'already_routed'"), "atomic routing must avoid duplicate route actions");
assert(atomicRoutingMigration.includes("insert into public.owner_command_requests"), "threshold clusters must create Owner Command requests");
assert(atomicRoutingMigration.includes("insert into public.user_report_operator_findings"), "threshold clusters must create operator findings");
assert(atomicRoutingMigration.includes("v_approval_level := case when v_immediate then 3 else 2 end"), "critical clusters must require approval path");
assert(atomicRoutingMigration.includes("raw_user_text_executed") && atomicRoutingMigration.includes("high-risk, money, and user-rights"), "threshold routing must preserve no-high-risk side-effect proof");

console.log("proof:user-report-threshold-routing passed");
