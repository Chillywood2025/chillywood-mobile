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
const baselineContracts = {
  D2C: {
    knownP0P1Classes: ["P0_STOP_THE_LINE", "P1_STOP_THE_LINE"],
    mandatoryGates: ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"],
    applicableDefects: ["ACCEPT_TIMEOUT_RACE", "CALLKIT_PROOF_SUBSTITUTED_BY_APNS_200", "NATIVE_ACTION_LOST_BEFORE_REACT_CONTEXT", "PUSHKIT_DELIVERY_SUPPRESSED", "STALE_CLEANUP_CLEARS_NEW_CALL", "TERMINAL_ROOM_ORPHAN"],
    mandatoryTests: ["pre-fix-reproduction-10/10", "trusted-positive-78/78", "producer-denial-8/8", "route-denial-30/30", "negative-controls-48/48", "deterministic-3/3", "generated-source-3/3", "capability-parity-26/26", "local-integration-23/23+5/5", "unsigned-ios-simulator-compile"],
    blockers: ["IOS_SOURCE_FIX_NOT_DELIVERED", "PUSHKIT_BLOCKED_EXTERNAL", "SIGNED_ARTIFACT_PROOF_MISSING", "INSTALLED_PHYSICAL_PROOF_MISSING", "PUBLIC_CANARY_BLOCKED_EXTERNAL"],
    metrics: { reviewPrCount: 4, currentTruthPrCount: 3, fullCiCount: 1, securityScanReuse: 0 }
  },
  D2B: {
    knownP0P1Classes: ["P0_STOP_THE_LINE", "P1_STOP_THE_LINE"],
    mandatoryGates: ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"],
    applicableDefects: ["ACCEPT_TIMEOUT_RACE", "NATIVE_ACTION_LOST_BEFORE_REACT_CONTEXT", "STALE_CLEANUP_CLEARS_NEW_CALL", "TERMINAL_ROOM_ORPHAN"],
    mandatoryTests: ["generated-source-3/3", "gradle-core", "kotlin-compile", "unit-tests-5/5", "instrumentation-6/6", "negative-controls-23/23", "executable-mutants-16/16", "policy-guards-6/6"],
    blockers: ["BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT", "T3_INTEGRATION_PARTIAL", "T4_NATIVE_PROVIDER_COMPILE_EMULATOR_PARTIAL", "SIGNED_ARTIFACT_PROOF_MISSING", "INSTALLED_PHYSICAL_PROOF_MISSING", "PUBLIC_CANARY_BLOCKED_EXTERNAL", "NEW_ANDROID_BINARY_REQUIRED"],
    metrics: { reviewPrCount: 4, currentTruthPrCount: 6, fullCiCount: 4, securityScanReuse: 1 }
  }
};

function committedEvidence(row, dependencies) {
  const read = dependencies.readEvidence ?? ((head, file) => execFileSync("git", ["show", `${head}:${file}`], { cwd: ROOT, encoding: "utf8" }));
  try {
    const value = read(row.head, row.evidence.path);
    return sha256(value) === row.evidence.sha256 && Buffer.byteLength(value) === row.evidence.bytes;
  } catch { return false; }
}

function committedTree(row, dependencies) {
  const run = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim());
  try { return run(["rev-parse", `${row.head}^{tree}`]) === row.tree; } catch { return false; }
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
    const contract = baselineContracts[row.id];
    if (!sha40(row.head) || !sha40(row.tree) || row.historicalCommitted !== true || !committedTree(row, dependencies)) findings.push(`BASELINE_IDENTITY_INVALID:${row.id}`);
    if (!committedEvidence(row, dependencies)) findings.push(`BASELINE_EVIDENCE_MISMATCH:${row.id}`);
    if (!sha64(row.evidence?.implementationPrBodySha256) || !Number.isInteger(row.evidence?.implementationPrBodyBytes)) findings.push(`PR_BODY_EVIDENCE_INVALID:${row.id}`);
    for (const id of metricIds) {
      const metric = row.metrics?.[id];
      if (!metric || !(metric.value === null || (Number.isInteger(metric.value) && metric.value >= 0)) || typeof metric.status !== "string") findings.push(`METRIC_INVALID:${row.id}:${id}`);
      if (metric?.value === 0 && /NOT_RECORDED/iu.test(metric.status)) findings.push(`UNRECORDED_METRIC_ZERO_FILLED:${row.id}:${id}`);
    }
    if (row.metrics?.activeContextBytes?.value !== row.evidence?.bytes || row.metrics?.excludedHistoryBytes?.value !== 0) findings.push(`MEASURED_CONTEXT_MISMATCH:${row.id}`);
    for (const [id, expected] of Object.entries(contract?.metrics ?? {})) if (row.metrics?.[id]?.value !== expected) findings.push(`BASELINE_METRIC_MISMATCH:${row.id}:${id}`);
    for (const id of ["promptBytes", "agentCount", "agentTurns", "successfulLogBytesExposed", "orchestrationSteps"]) if (row.metrics?.[id]?.value !== null || !/NOT_RECORDED/iu.test(row.metrics?.[id]?.status ?? "")) findings.push(`UNRECORDED_METRIC_INVALID:${row.id}:${id}`);
    const parity = {};
    for (const field of parityFields) {
      const expected = row.expected?.[field];
      const observed = row.shadowPlan?.[field];
      parity[field] = Array.isArray(expected) && stableJson(expected) === stableJson(contract?.[field]) && stableJson(observed) === stableJson(contract?.[field]);
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
