#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const audits = [
  ["application", root],
  ["alert-automation", path.join(root, "ops/alert-automation")],
  ["isolated-cloudflare-runtime", path.join(root, "isolated-runtime/cloudflare")],
];
const scopes = [
  ["all", []],
  ["production", ["--omit=dev"]],
];

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
    assert.ifError(result.error);
    assert.ok(result.stdout.trim(), `${label} ${scope} dependency audit returned no report`);
    const report = JSON.parse(result.stdout);
    const totals = report.metadata?.vulnerabilities ?? {};
    if (scope === "production") {
      assert.equal(totals.critical ?? 0, 0, `${label} has a production critical advisory`);
      assert.equal(totals.high ?? 0, 0, `${label} has a production high advisory`);
    }
    process.stdout.write(
      `${label} ${scope}: critical=${totals.critical ?? 0} high=${totals.high ?? 0} moderate=${totals.moderate ?? 0}\n`,
    );
  }
}
