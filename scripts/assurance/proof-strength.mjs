#!/usr/bin/env node
import { args, emit, readJson } from "./lib.mjs";

const options = args();
const hierarchy = readJson("config/assurance/proof-strength-v1.json");
const denylist = readJson("config/assurance/proof-substitution-denylist-v1.json");
const evidence = options.dogfood
  ? { claims: readJson("config/assurance/dogfood-pr-a-v1.json").subjects.flatMap((subject) => subject.facts.sourceProofSubstitutions ?? []) }
  : options.evidence ? readJson(options.evidence) : { claims: [] };
const rejected = [];
for (const [index, claim] of (evidence.claims ?? []).entries()) {
  const denied = denylist.substitutions.find(({ offered, required }) => offered === claim.offered && required === claim.required);
  if (denied) rejected.push({ claimIndex: index, substitutionId: denied.id, offered: claim.offered, required: claim.required, status: "BLOCKED_INTERNAL" });
}
const missingEvidence = !options.catalog && !options.dogfood && !options.evidence;
emit("assurance:proof-strength", rejected.length === 0 && !missingEvidence, {
  hierarchy: hierarchy.tiers.map(({ id, proves }) => ({ id, proves })),
  claimsChecked: evidence.claims?.length ?? 0,
  substitutionsRejected: rejected,
  findings: missingEvidence ? [{ id: "ASSURANCE_PROOF_EVIDENCE_MISSING", status: "BLOCKED_INTERNAL" }] : [],
  rule: hierarchy.claimRule
}, [`proof strength: ${rejected.length || missingEvidence ? "FAIL" : "PASS"} — ${rejected.length} forbidden substitution${rejected.length === 1 ? "" : "s"}${missingEvidence ? ", evidence missing" : ""}`]);
