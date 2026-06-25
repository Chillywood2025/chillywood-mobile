import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const checks = [];
const add = (key, passed, detail) => checks.push({ key, passed, detail });

const artifactDir = join("/tmp", `app-content-takedown-decisions-proof-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}`);
await mkdir(artifactDir, { recursive: true });

const docPath = "docs/legal/CONTENT_TAKEDOWN_DECISIONS.md";
const takedownDoc = read(docPath);
const reportingDoc = read("docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const moneySupportDoc = read("docs/support/MONEY_SUPPORT_WORKFLOW.md");
const moderationLib = read("_lib/moderation.ts");
const reportsMigration = read("supabase/migrations/202605260002_profile_media_status_policy.sql");
const packageJson = read("package.json");

add("doc_exists", existsSync(join(root, docPath)), "content takedown decision doc exists");
[
  "Content takedown decisions:",
  "## Takedown Decision Matrix",
  "## Staff Authority Matrix",
  "## Backend Enforcement Model",
  "## Content Availability Behavior",
  "## Evidence Preservation Model",
  "## Paid Content / Access / Refund Support Model",
  "## UI / Command Center Model",
  "## Notification / Appeal Model",
].forEach((needle) => add(`doc_marker_${needle}`, takedownDoc.includes(needle), `doc contains ${needle}`));

[
  "Reports do not auto-delete content",
  "Takedowns require exact scope, reason, case/report context where applicable, and audit",
  "Hide/quarantine/restrict is preferred over hard delete",
  "Evidence is preserved for moderation, DMCA/legal, security, payment/access disputes, and appeals",
  "Paid-access history is preserved",
  "Takedown does not execute provider refunds",
  "Takedown does not enable payouts or move money",
  "Manual/external refund/access support path",
  "Content owners may be notified when moderation action is taken, with safe copy",
  "Appeals use support/escalation workflow in V1",
  "No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed",
].forEach((needle) => add(`required_wording_${needle}`, takedownDoc.includes(needle), `required wording exists: ${needle}`));

[
  "profile",
  "Profile photo",
  "Profile background",
  "Platform/channel page",
  "Platform/brand asset",
  "public creator video",
  "paid video",
  "VIP/subscriber content",
  "post",
  "comment",
  "reply",
  "chat message",
  "room message",
  "Watch-Party room",
  "Live room",
  "live participant",
  "saved replay",
  "event",
  "paid event access",
  "attachment/media",
  "DMCA/legal evidence",
].forEach((needle) => add(`matrix_row_${needle}`, takedownDoc.includes(`| ${needle} |`), `matrix row exists for ${needle}`));

add("backed_rpc_reason_required", reportsMigration.includes("admin_report_reason_required"), "backed report target action requires reason");
add("backed_rpc_audit", reportsMigration.includes("admin_reports_write_audit"), "backed report target action writes audit");
add("backed_rpc_before_after", reportsMigration.includes("v_target_before") && reportsMigration.includes("v_target_after"), "backed target action captures before/after state");
add("client_action_requires_report", moderationLib.includes("Select a report before applying a target action."), "client helper requires selected report id");
add("reporting_doc_updated", reportingDoc.includes("Content takedown decisions: Closed"), "reporting workflow references takedown decisions");
add("moderator_doc_updated", moderatorDoc.includes("Content takedown decisions: Closed"), "Moderator doc references takedown decisions");
add("command_center_doc_updated", commandCenterDoc.includes("Content takedown decisions: Closed"), "Command Center doc references takedown decisions");
add("money_support_doc_updated", moneySupportDoc.includes("Paid-access history is preserved"), "money support doc references paid-access preservation");
add("proof_script_registered", packageJson.includes("\"proof:content-takedown-decisions\""), "package proof script registered");
add("guard_script_registered", packageJson.includes("\"guard:content-takedown-policy\""), "package guard script registered");

const failed = checks.filter((check) => !check.passed);
await writeFile(join(artifactDir, "checks.json"), `${JSON.stringify(checks, null, 2)}\n`);
await writeFile(join(artifactDir, "README.md"), [
  "# Content Takedown Decisions Proof",
  "",
  `Status: ${failed.length ? "failed" : "passed"}`,
  `Passed: ${checks.length - failed.length}/${checks.length}`,
  "",
  "This proof is static and sanitized. It does not mutate content, execute refunds, move money, expose reporter identity, or include private data.",
  "",
].join("\n"));

if (failed.length) {
  console.error(JSON.stringify({ artifact: artifactDir, failed: failed.length, total: checks.length, failures: failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ artifact: artifactDir, passed: checks.length, failed: 0, total: checks.length }, null, 2));
