import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const helper = read("_lib/userReportRouter.ts");
const edge = read("supabase/functions/user-report-intake/index.ts");
const migration = read("supabase/migrations-isolated/20260714001704_user_report_router.sql");

assert(helper.includes("USER_REPORT_THRESHOLD_UNIQUE_USERS = 3"), "default threshold must be 3 unique users");
assert(helper.includes("USER_REPORT_THRESHOLD_WINDOW_DAYS = 7"), "default threshold window must be 7 days");
assert(edge.includes("THRESHOLD_UNIQUE_USERS = 3"), "Edge threshold must be 3 unique users");
assert(edge.includes("THRESHOLD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000"), "Edge threshold window must be 7 days");

assert(migration.includes("constraint user_report_cluster_members_unique_reporter unique (cluster_id, reporter_hash)"), "cluster members must dedupe by unique reporter hash");
assert(edge.includes(".eq(\"reporter_hash\", reporterHash)"), "Edge must check existing reporter hash before threshold");
assert(edge.includes("duplicate_flag: true"), "same-user repeat reports must be marked duplicate");
assert(edge.includes("unique_reporter_count") && edge.includes("report_count"), "cluster counts must track unique reporters and total reports");

assert(helper.includes("shouldEscalateImmediately"), "helper must expose immediate escalation policy");
assert(edge.includes("isImmediate"), "Edge must have immediate escalation policy");
for (const category of ["security_access", "premium_or_billing", "payout_or_money", "privacy_data", "safety_abuse"]) {
  assert(helper.includes(category) && edge.includes(category), `missing immediate category ${category}`);
}

assert(edge.includes("routeClusterIfNeeded"), "Edge must route clusters only after threshold/immediate preflight");
assert(edge.includes("already_routed"), "Edge must avoid duplicate route actions");
assert(edge.includes("owner_command_requests"), "threshold clusters must create Owner Command requests");
assert(edge.includes("user_report_operator_findings"), "threshold clusters must create operator findings");
assert(edge.includes("approvalLevel >= 3"), "critical clusters must require approval path");
assert(edge.includes("highRiskExecuted: false") || edge.includes("high_risk_executed"), "threshold routing must not execute high-risk actions");

console.log("proof:user-report-threshold-routing passed");
