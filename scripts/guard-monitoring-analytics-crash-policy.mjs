#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    failures.push(`missing file: ${rel}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function requireText(rel, needle, message) {
  if (!read(rel).includes(needle)) failures.push(message);
}

function forbidText(rel, needle, message) {
  if (read(rel).includes(needle)) failures.push(message);
}

const doc = "docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md";

requireText(doc, "Analytics events must not include PII, private chat/message content, reporter identity, raw IPs, tokens, signed URLs, provider secrets, tax IDs, bank details, or payment credentials", "analytics privacy boundary missing");
requireText(doc, "Crash/error diagnostics are sanitized", "crash sanitization policy missing");
requireText(doc, "User-facing runtime errors use safe copy", "safe user-facing runtime error copy policy missing");
requireText(doc, "Support/admin diagnostics are scoped and privacy-safe", "support/admin diagnostics privacy policy missing");
requireText(doc, "Data Safety and Privacy disclosures match monitoring/diagnostics behavior", "Data Safety/Privacy alignment wording missing");
requireText(doc, "No new analytics vendor was added", "new analytics vendor boundary missing");
requireText(doc, "Provider refunds remain manual/external", "manual/external refund boundary missing");
requireText(doc, "No debug/proof/internal copy is exposed in production UI", "production UI proof/debug/internal boundary missing");
requireText(doc, "Owner must confirm final SDK/provider collection settings before Play submission", "owner provider confirmation wording missing");

const packageJson = read("package.json");
for (const needle of ["@sentry/", "sentry-expo", "posthog-react-native", "\"posthog\""]) {
  if (packageJson.includes(needle)) failures.push(`unexpected monitoring vendor package present: ${needle}`);
}

forbidText("_lib/logger.ts", "message: normalized.message", "runtime_error analytics includes raw/sanitized error message text");
forbidText("components/system/root-error-boundary.tsx", "errorMessage: error.message", "root-boundary support diagnostics include raw error message");

const productionUi = [
  "app",
  "components",
]
  .flatMap((dir) => {
    const absolute = path.join(root, dir);
    if (!fs.existsSync(absolute)) return [];
    const stack = [absolute];
    const files = [];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const next = path.join(current, entry.name);
        if (entry.isDirectory()) {
          const relDir = path.relative(root, next);
          if (relDir === "components/dev") continue;
          stack.push(next);
        }
        else if (/\.(tsx?|jsx?)$/u.test(entry.name)) files.push(path.relative(root, next));
      }
    }
    return files;
  })
  .map((rel) => [rel, read(rel).toLowerCase()]);

const forbiddenUiPhrases = [
  "monitoring proof",
  "crash proof",
  "analytics proof",
  "debug diagnostics",
  "internal diagnostics",
  "raw sql error",
  "raw backend error",
  "service-role diagnostics",
];

for (const [rel, body] of productionUi) {
  for (const phrase of forbiddenUiPhrases) {
    if (body.includes(phrase)) failures.push(`${rel} contains production-forbidden monitoring label: ${phrase}`);
  }
}

const combinedPolicy = [
  doc,
  "docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md",
  "docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md",
  "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
  "docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md",
  "docs/legal/REPORTING_MODERATION_PRODUCTION_WORKFLOW.md",
].map(read).join("\n").toLowerCase();

const contradictionPatterns = [
  [/analytics events may include (pii|private chat|private message|reporter identity|raw ip|tokens?|signed urls?|tax ids?|bank details?|payment credentials?)/u, "analytics policy allows sensitive data"],
  [/crash reports? may include (tokens?|signed urls?|raw ip|private message|payment data|provider secrets?)/u, "crash policy allows sensitive data"],
  [/sentry (is active|is enabled|is the production standard)/u, "Sentry appears active"],
  [/posthog (is active|is enabled|is the production standard)/u, "PostHog appears active"],
  [/premium public activation (is enabled|is live)/u, "Premium public activation appears enabled"],
  [/creator-money (is enabled|is live)/u, "creator-money appears enabled"],
  [/provider refunds? (are|is) (executed|automatic|enabled)/u, "provider refund automation appears enabled"],
  [/payouts? (are|is) (enabled|live)/u, "payouts appear enabled"],
  [/support (is|was|becomes|created as|added as) (a )?backend role/u, "support backend role appears introduced"],
];

for (const [pattern, message] of contradictionPatterns) {
  if (pattern.test(combinedPolicy)) failures.push(message);
}

if (failures.length) {
  console.error("Monitoring/analytics/crash policy guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Monitoring/analytics/crash policy guard passed.");
