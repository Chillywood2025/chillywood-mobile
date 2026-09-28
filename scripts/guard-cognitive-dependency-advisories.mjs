#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const audits = [
  ["application", root],
  ["alert-automation", path.join(root, "ops/alert-automation")],
  ["isolated-cloudflare-runtime", path.join(root, "isolated-runtime/cloudflare")],
  ["real-peer-browser-tests", path.join(root, "tests/integration/real-peer-browser")],
];
const scopes = [
  ["all", []],
  ["production", ["--omit=dev"]],
];

export function validateAuditResult(result, label, scope) {
  const context = `${label} ${scope} dependency audit`;
  assert.ok(scope === "all" || scope === "production", `${context} has an invalid scope`);
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${context} was terminated`);
  assert.ok(result.status === 0 || result.status === 1, `${context} failed with status ${result.status}`);
  assert.ok(typeof result.stdout === "string" && result.stdout.trim(), `${context} returned no report`);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    assert.fail(`${context} returned invalid JSON`);
  }
  assert.ok(report && typeof report === "object" && !Array.isArray(report), `${context} returned an invalid report`);
  assert.ok(!Object.hasOwn(report, "error"), `${context} returned an npm error report`);
  assert.ok(report.vulnerabilities && typeof report.vulnerabilities === "object"
    && !Array.isArray(report.vulnerabilities), `${context} is missing vulnerability details`);
  const totals = report.metadata?.vulnerabilities;
  assert.ok(totals && typeof totals === "object" && !Array.isArray(totals), `${context} is missing vulnerability totals`);
  const severities = ["info", "low", "moderate", "high", "critical"];
  for (const severity of [...severities, "total"]) {
    assert.ok(Number.isSafeInteger(totals[severity]) && totals[severity] >= 0, `${context} has invalid ${severity} totals`);
  }
  assert.equal(totals.total, severities.reduce((sum, severity) => sum + totals[severity], 0), `${context} has inconsistent totals`);
  assert.ok(result.status === 0 || totals.total > 0, `${context} failed without advisory findings`);
  if (scope === "production") {
    assert.equal(totals.critical, 0, `${label} has a production critical advisory`);
    assert.equal(totals.high, 0, `${label} has a production high advisory`);
  }
  return totals;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [label, cwd] of audits) {
    for (const [scope, scopeArgs] of scopes) {
      const result = spawnSync(
        "npm",
        ["audit", "--package-lock-only", "--json", ...scopeArgs],
        {
          cwd,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
          timeout: 120_000,
        },
      );
      const totals = validateAuditResult(result, label, scope);
      process.stdout.write(
        `${label} ${scope}: critical=${totals.critical} high=${totals.high} moderate=${totals.moderate}\n`,
      );
    }
  }
}
