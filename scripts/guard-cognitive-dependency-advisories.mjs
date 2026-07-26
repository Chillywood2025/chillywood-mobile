#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const audits = [
  ["application", root],
  ["alert-automation", path.join(root, "ops/alert-automation")],
];

for (const [label, cwd] of audits) {
  const result = spawnSync(
    "npm",
    ["audit", "--json", "--omit=dev"],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  assert.ok(result.stdout.trim(), `${label} dependency audit returned no report`);
  const report = JSON.parse(result.stdout);
  const totals = report.metadata?.vulnerabilities ?? {};
  assert.equal(totals.critical ?? 0, 0, `${label} has a production critical advisory`);
  assert.equal(totals.high ?? 0, 0, `${label} has a production high advisory`);
  process.stdout.write(
    `${label}: critical=${totals.critical ?? 0} high=${totals.high ?? 0} moderate=${totals.moderate ?? 0}\n`,
  );
}
