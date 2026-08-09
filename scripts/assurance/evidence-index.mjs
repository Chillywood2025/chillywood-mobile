#!/usr/bin/env node
import { emit, readJson } from "./lib.mjs";
import { exactKey, reusable, sha64, sha256, strictOptions } from "./efficiency-lib.mjs";

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
  );
}

export function lookup(index, request) {
  const key = exactKey(request);
  if (!key) return { ok: false, key: null, entry: null, finding: "EVIDENCE_REQUEST_INVALID" };
  const entries = index?.entries ?? [];
  const matches = entries.filter((entry) => entry.key === key);
  if (matches.length > 1) return { ok: false, key, entry: null, finding: "EVIDENCE_KEY_AMBIGUOUS" };
  const entry = matches[0];
  if (entry) {
    const ok = validEntry(entry) && reusable(entry, request);
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
