#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "qa/BIG_APP_COMPANY_TEST_COVERAGE.md",
  "qa/browserstack/e2e-social-graph-fixtures.md",
  "qa/browserstack/network-permission-interruption-checklist.md",
  "qa/accessibility-smoke-checklist.md",
  "qa/security-rls-privacy-smoke.md",
  "qa/analytics-event-sanity.md",
  "qa/deep-link-navigation-smoke.md",
  "qa/ota-upgrade-stale-app-smoke.md",
  "qa/performance-crash-anr-smoke.md",
  "qa/abuse-moderation-reporting-smoke.md",
  "qa/reset-revoke-refund-lifecycle-smoke.md",
  "scripts/qa/prepare-browserstack-e2e-social-graph.mjs",
  "scripts/qa/readback-browserstack-e2e-social-graph.mjs",
  "scripts/qa/reset-browserstack-e2e-social-graph.mjs",
];

const requiredCoverageTerms = [
  "Monetization 1-7",
  "Profile/Platform visibility",
  "Synthetic social graph",
  "Deep links/navigation",
  "Permissions/interruption",
  "Network/offline/slow connection",
  "Device matrix",
  "Accessibility",
  "Crash/ANR/performance smoke",
  "Security/RLS/privacy",
  "Moderation/reporting/blocking",
  "Analytics/event sanity",
  "OTA/stale app/upgrade",
  "Fixture reset/revoke",
  "BrowserStack manual-assisted purchase proof",
];

const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length) {
  console.error(JSON.stringify({ ok: false, error: "missing_files", missing }, null, 2));
  process.exit(1);
}

const coverage = readFileSync("qa/BIG_APP_COMPANY_TEST_COVERAGE.md", "utf8");
const missingTerms = requiredCoverageTerms.filter((term) => !coverage.includes(term));
if (missingTerms.length) {
  console.error(JSON.stringify({ ok: false, error: "missing_coverage_terms", missingTerms }, null, 2));
  process.exit(1);
}

for (const file of requiredFiles.filter((item) => item.endsWith(".md"))) {
  const text = readFileSync(file, "utf8");
  if (/BROWSERSTACK_ACCESS_KEY=|SUPABASE_SERVICE_ROLE_KEY=|CHILLYWOOD_E2E_.*PASSWORD=/.test(text)) {
    console.error(JSON.stringify({ ok: false, error: "secret_assignment_in_doc", file }, null, 2));
    process.exit(1);
  }
}

console.log("Big-app QA coverage guard passed.");
