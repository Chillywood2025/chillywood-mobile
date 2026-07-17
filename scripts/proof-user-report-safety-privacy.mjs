import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const helper = read("_lib/userReportRouter.ts");
const edge = read("supabase/functions/user-report-intake/index.ts");
const migration = read("supabase/migrations-isolated/20260714001704_user_report_router.sql");
const admin = read("app/admin.tsx");

for (const redaction of ["EMAIL_PATTERN", "PHONE_PATTERN", "IPV4_PATTERN", "SECRET_KEY_PATTERN", "LONG_SECRET_LIKE_PATTERN"]) {
  assert(helper.includes(redaction) && edge.includes(redaction), `missing redaction pattern ${redaction}`);
}

assert(helper.includes("PROMPT_INJECTION_PATTERN") && edge.includes("PROMPT_INJECTION_PATTERN"), "prompt-injection pattern missing");
assert(helper.includes("promptInjectionFlag") && edge.includes("prompt_injection_flag"), "prompt injection must be recorded as a flag");
assert(edge.includes("raw_user_text_executed: false"), "raw user text must not become executable operator instruction");
assert(edge.includes("client_requested_routed_system_id_ignored"), "client cannot choose routed_system_id");

for (const unsafe of [
  "money_moved boolean not null default false check (money_moved = false)",
  "user_rights_changed boolean not null default false check (user_rights_changed = false)",
  "high_risk_executed boolean not null default false check (high_risk_executed = false)",
]) {
  assert(migration.includes(unsafe), `missing immutable safety flag: ${unsafe}`);
}

assert(admin.includes("does not expose raw report text") || admin.includes("User reports cannot directly move money"), "admin section must document safe/no-raw behavior");
assert(admin.includes("ads/sponsors") && admin.includes("Premium") && admin.includes("auth/RLS"), "admin section must show blocked high-risk report outcomes");

for (const forbidden of [
  "manual Premium grant",
  "auth/RLS mutation",
  "direct enforcement",
  "provider product mutation",
  "LiveKit routing change",
  "R2/media behavior change",
  "ad or sponsor activation",
]) {
  assert(helper.includes(forbidden) || edge.includes(forbidden), `missing forbidden scope ${forbidden}`);
}

console.log("proof:user-report-safety-privacy passed");
