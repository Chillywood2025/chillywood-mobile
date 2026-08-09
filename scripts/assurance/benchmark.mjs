#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { ROOT, emit, readJson, stableJson } from "./lib.mjs";
import { sha40, sha64, sha256, strictOptions } from "./efficiency-lib.mjs";

const metricIds = [
  "promptBytes",
  "activeContextBytes",
  "excludedHistoryBytes",
  "agentCount",
  "agentTurns",
  "reviewPrCount",
  "currentTruthPrCount",
  "fullCiCount",
  "successfulLogBytesExposed",
  "securityScanReuse",
  "orchestrationSteps"
];
const parityFields = ["knownP0P1Classes", "mandatoryGates", "applicableDefects", "mandatoryTests", "blockers"];

function committedEvidence(row, dependencies) {
  const read = dependencies.readEvidence ?? ((head, file) => execFileSync("git", ["show", `${head}:${file}`], { cwd: ROOT, encoding: "utf8" }));
  try {
    const value = read(row.head, row.evidence.path);
    return sha256(value) === row.evidence.sha256 && Buffer.byteLength(value) === row.evidence.bytes;
  } catch { return false; }
}

export function benchmark(data, dependencies = {}) {
  const findings = [];
  const rows = data?.baselines ?? [];
  if (rows.length !== 2 || new Set(rows.map(({ id }) => id)).size !== 2 || !rows.every(({ id }) => ["D2C", "D2B"].includes(id))) {
    findings.push("D2C_D2B_BASELINES_REQUIRED");
  }
  if (Buffer.byteLength(data?.normalContinuation ?? "") !== data?.normalContinuationBytes) findings.push("CONTINUATION_PROMPT_BYTES_MISMATCH");
  const results = [];
  for (const row of rows) {
    if (!sha40(row.head) || !sha40(row.tree) || row.historicalCommitted !== true) findings.push(`BASELINE_IDENTITY_INVALID:${row.id}`);
    if (!committedEvidence(row, dependencies)) findings.push(`BASELINE_EVIDENCE_MISMATCH:${row.id}`);
    if (!sha64(row.evidence?.implementationPrBodySha256) || !Number.isInteger(row.evidence?.implementationPrBodyBytes)) findings.push(`PR_BODY_EVIDENCE_INVALID:${row.id}`);
    for (const id of metricIds) {
      const metric = row.metrics?.[id];
      if (!metric || !(metric.value === null || (Number.isInteger(metric.value) && metric.value >= 0)) || typeof metric.status !== "string") findings.push(`METRIC_INVALID:${row.id}:${id}`);
      if (metric?.value === 0 && /NOT_RECORDED/iu.test(metric.status)) findings.push(`UNRECORDED_METRIC_ZERO_FILLED:${row.id}:${id}`);
    }
    const parity = {};
    for (const field of parityFields) {
      const expected = row.expected?.[field];
      const observed = row.shadowPlan?.[field];
      parity[field] = Array.isArray(expected) && stableJson(expected) === stableJson(observed);
      if (!parity[field]) findings.push(`SHADOW_PARITY_MISSING:${row.id}:${field}`);
    }
    if (row.shadowPlanSha256 !== sha256(row.shadowPlan)) findings.push(`SHADOW_PLAN_HASH_MISMATCH:${row.id}`);
    const shadowPlanBytes = Buffer.byteLength(stableJson(row.shadowPlan));
    const fullContextBytes = row.metrics?.activeContextBytes?.value;
    const reductionBytes = Number.isInteger(fullContextBytes) ? Math.max(0, fullContextBytes - shadowPlanBytes) : null;
    const reductionPercent = Number.isInteger(fullContextBytes) && fullContextBytes > 0
      ? Number(((reductionBytes / fullContextBytes) * 100).toFixed(2))
      : null;
    results.push({
      id: row.id,
      head: row.head,
      tree: row.tree,
      evidence: row.evidence,
      baselineMetrics: row.metrics,
      shadow: {
        planSha256: sha256(row.shadowPlan),
        activeContextBytes: shadowPlanBytes,
        excludedHistoryBytes: reductionBytes,
        contextReductionPercent: reductionPercent,
        successfulLogBytesExposed: 0,
        expensiveImplementationOrSecurityReruns: 0
      },
      parity
    });
  }
  return {
    ok: findings.length === 0,
    mode: "SHADOW_HISTORICAL_COMMITTED_EVIDENCE_ONLY",
    normalContinuationBytes: data?.normalContinuationBytes,
    baselines: results.sort((left, right) => left.id.localeCompare(right.id)),
    findings: findings.sort()
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = strictOptions(process.argv.slice(2), { "--baseline": "baseline" });
  const selected = parsed.values.baseline ?? "all";
  if (!['all', 'D2C', 'D2B'].includes(selected)) parsed.findings.push("UNKNOWN_BASELINE");
  const result = parsed.ok && parsed.findings.length === 0
    ? benchmark(readJson("docs/assurance/e0-benchmark-v1.json"))
    : { ok: false, findings: parsed.findings };
  if (result.ok && selected !== "all") result.baselines = result.baselines.filter(({ id }) => id === selected);
  emit("assurance:benchmark", result.ok, result);
}
