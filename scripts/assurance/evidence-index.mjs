#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { ROOT, emit, readJson } from "./lib.mjs";
import { exactKey, git, reusable, sha40, sha64, sha256, strictOptions } from "./efficiency-lib.mjs";

export const evidenceMetadataHash = (entry) => sha256(
  Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "integritySha256"))
);

function validEntry(entry) {
  return Boolean(
    exactKey(entry)
    && entry.key === exactKey(entry)
    && sha64(entry.receiptHash)
    && entry.integritySha256 === evidenceMetadataHash(entry)
    && typeof entry.artifactLocator === "string"
    && entry.artifactLocator.length > 0
    && (entry.evidenceClass !== "exact-unchanged-security" || (sha40(entry.sourceHead) && typeof entry.scanId === "string" && entry.scanId.startsWith(`${entry.sourceHead}_`)))
  );
}

function defaultReadArtifact(locator) {
  const match = /^git:([0-9a-f]{40}):(config\/assurance\/current-truth-v1\.json)$/u.exec(locator);
  if (!match) throw new Error("unsupported artifact locator");
  return execFileSync("git", ["show", `${match[1]}:${match[2]}`], { cwd: ROOT, encoding: "utf8" });
}

function artifactMatches(raw, entry) {
  if (typeof raw !== "string" || sha256(raw) !== entry.receiptHash) return false;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return false; }
  const claim = parsed?.d2bCurrentTruthBinding?.dependencyPrerequisite ?? parsed;
  return claim?.sourceHead === entry.sourceHead
    && claim?.sourceTree === entry.sourceTree
    && (entry.scanId == null || (claim?.securityScanId ?? claim?.scanId) === entry.scanId)
    && (entry.evidenceClass !== "exact-unchanged-security" || claim?.securityReportSha256 === entry.inputSetHash);
}

export function lookup(index, request, dependencies = {}) {
  const key = exactKey(request);
  if (!key) return { ok: false, key: null, entry: null, finding: "EVIDENCE_REQUEST_INVALID" };
  const entries = index?.entries ?? [];
  let current;
  try {
    current = dependencies.currentIdentity ?? { sourceHead: git(["rev-parse", "HEAD"]), sourceTree: git(["rev-parse", "HEAD^{tree}"]) };
  } catch { return { ok: false, key, entry: null, finding: "SOURCE_IDENTITY_UNRESOLVED" }; }
  if (current.sourceHead !== request.sourceHead || current.sourceTree !== request.sourceTree) {
    const changedSecuritySource = entries.some((candidate) => candidate.commandContractId === request.commandContractId && candidate.evidenceClass === "exact-unchanged-security");
    return { ok: false, key, entry: null, finding: changedSecuritySource ? "MISS_REQUIRE_INCREMENTAL_DIFF_SCAN" : "HISTORICAL_LOOKUP_DECISION_ONLY" };
  }
  const matches = entries.filter((entry) => entry.key === key);
  if (matches.length > 1) return { ok: false, key, entry: null, finding: "EVIDENCE_KEY_AMBIGUOUS" };
  const entry = matches[0];
  if (entry) {
    let artifact = false;
    try { artifact = artifactMatches((dependencies.readArtifact ?? defaultReadArtifact)(entry.artifactLocator), entry); } catch { artifact = false; }
    const ok = validEntry(entry) && reusable(entry, request) && artifact;
    return {
      ok,
      key,
      entry: ok ? {
        key: entry.key,
        evidenceClass: entry.evidenceClass,
        immutable: entry.immutable,
        receiptHash: entry.receiptHash,
        artifactLocator: entry.artifactLocator
      } : null,
      finding: ok ? null : "EVIDENCE_REUSE_DENIED"
    };
  }
  const changedSecuritySource = entries.some((candidate) =>
    candidate.commandContractId === request.commandContractId
    && candidate.toolchainIdentity === request.toolchainIdentity
    && candidate.platform === request.platform
    && candidate.configurationHash === request.configurationHash
    && candidate.evidenceClass === "exact-unchanged-security"
    && (candidate.sourceHead !== request.sourceHead || candidate.sourceTree !== request.sourceTree)
  );
  return {
    ok: false,
    key,
    entry: null,
    finding: changedSecuritySource ? "MISS_REQUIRE_INCREMENTAL_DIFF_SCAN" : "EVIDENCE_EXACT_HIT_MISSING"
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = strictOptions(process.argv.slice(2), { "--request": "request" });
  let request;
  try { request = JSON.parse(parsed.values.request ?? "null"); } catch { request = null; }
  const result = parsed.ok
    ? lookup(readJson("config/assurance/evidence-index-v1.json"), request)
    : { ok: false, finding: parsed.findings.join(",") };
  emit("assurance:evidence-index", result.ok, result);
}
