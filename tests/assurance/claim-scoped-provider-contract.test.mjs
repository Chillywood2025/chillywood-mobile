import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  evaluateFreshnessClaims,
  evaluateTaskFreshness,
  externalEvidenceBindingHash,
  externalEvidenceReceiptHash,
  repositoryReadbackEvidenceHash,
  verifyCommittedClaimEvidence
} from "../../scripts/assurance/lib.mjs";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const canonicalFreshness = read("config/assurance/current-truth-contract-v1.json").freshness;
const syntheticFactId = "provider.synthetic.current";
const freshness = {
  ...canonicalFreshness,
  factRegistry: [{
    factId: syntheticFactId,
    freshnessClass: "PROVIDER_CRITICAL",
    authorityAllowed: "PROVIDER_READBACK_ONLY",
    platform: "NONE",
    provider: "SYNTHETIC_PROVIDER"
  }]
};
const policy = read("config/assurance/external-evidence-receipt-v1.json");
const claim = {
  id: "synthetic-provider-current",
  status: "CURRENT",
  observedAt: "2026-08-09T10:00:00Z",
  expiresAt: "2026-08-09T18:00:00Z",
  evidenceSourceId: "synthetic-provider-source",
  evidenceMode: "local-and-linked-read-only",
  factsCovered: [syntheticFactId],
  freshnessClass: "PROVIDER_CRITICAL",
  authorityAllowed: "PROVIDER_READBACK_ONLY",
  platform: "NONE",
  provider: "SYNTHETIC_PROVIDER"
};
const source = {
  id: claim.evidenceSourceId,
  mode: claim.evidenceMode,
  observedAt: claim.observedAt,
  covers: claim.factsCovered,
  freshnessClass: claim.freshnessClass,
  authorityAllowed: claim.authorityAllowed,
  platform: claim.platform,
  provider: claim.provider,
  payloadHash: "a".repeat(64)
};

function receipt(overrides = {}, recompute = true) {
  const value = {
    schemaVersion: 1,
    receiptId: "synthetic-provider-receipt",
    evidenceClass: claim.freshnessClass,
    provider: claim.provider,
    platform: claim.platform,
    observedAt: claim.observedAt,
    expiresAt: claim.expiresAt,
    receiptIssuer: "SYNTHETIC_ASSURANCE_FIXTURE_ISSUER",
    receiptSchema: "synthetic-assurance-external-evidence-v1",
    payloadHash: source.payloadHash,
    evidenceHash: externalEvidenceBindingHash({ claim, source }),
    collectionCommand: "synthetic:provider-readback",
    selfAttested: false,
    ...overrides
  };
  value.receiptHash = recompute ? externalEvidenceReceiptHash(value) : (overrides.receiptHash ?? "b".repeat(64));
  return value;
}

function evaluate(receiptValue, verifyIssuerReceipt = () => true) {
  return evaluateFreshnessClaims({
    claims: [claim],
    evidenceSources: [source],
    freshness,
    now: new Date("2026-08-09T12:00:00Z"),
    allowSyntheticFactRegistry: true,
    allowSyntheticExternalEvidence: true,
    evidenceSourceVerifier: () => true,
    externalEvidenceVerifier: {
      policy,
      receiptFor: () => receiptValue,
      verifyIssuerReceipt
    }
  });
}

test("only a hash-bound synthetic receipt crossing the trusted issuer boundary can authorize current external evidence", () => {
  const valid = evaluate(receipt());
  assert.equal(valid.ok, true, JSON.stringify(valid.findings));
  assert.equal(valid.liveProviderReadback, true);
  for (const [label, value, issuerVerifier = () => true] of [
    ["missing", null],
    ["altered payload", receipt({ payloadHash: "c".repeat(64) })],
    ["wrong class", receipt({ evidenceClass: "SIGNED_ARTIFACT" })],
    ["wrong platform", receipt({ platform: "IOS" })],
    ["forged issuer", receipt({ receiptIssuer: "UNTRUSTED_ISSUER" })],
    ["wrong collection command", receipt({ collectionCommand: "synthetic:installed-device-readback" })],
    ["self attested", receipt({ selfAttested: true })],
    ["altered receipt hash", receipt({ receiptHash: "d".repeat(64) }, false)],
    ["issuer proof rejected", receipt(), () => false]
  ]) {
    const result = evaluate(value, issuerVerifier);
    assert.equal(result.ok, false, label);
    assert(result.findings.some(({ id }) => id === "ASSURANCE_FRESHNESS_EXTERNAL_RECEIPT_UNVERIFIED"), label);
  }
  const legacyBooleanVerifier = evaluateFreshnessClaims({
    claims: [claim],
    evidenceSources: [source],
    freshness,
    now: new Date("2026-08-09T12:00:00Z"),
    allowSyntheticFactRegistry: true,
    allowSyntheticExternalEvidence: true,
    evidenceSourceVerifier: () => true,
    externalEvidenceVerifier: () => true
  });
  assert.equal(legacyBooleanVerifier.ok, false, "a self-attested boolean callback is not an authoritative receipt verifier");
});

test("fact identity and global policy failures suppress all current authority", () => {
  for (const [label, claims, alteredFreshness, finding] of [
    ["unknown semantic relabel", [{ ...claim, factsCovered: ["provider.synthetic.renamed"] }], freshness, "ASSURANCE_FRESHNESS_FACT_UNKNOWN"],
    ["class relabel", [{ ...claim, freshnessClass: "SIGNED_ARTIFACT", evidenceMode: "signed-artifact-inspection", authorityAllowed: "SIGNED_ARTIFACT_ONLY", platform: "IOS" }], freshness, "ASSURANCE_FRESHNESS_FACT_BINDING_MISMATCH"],
    ["global policy corruption", [claim], { ...freshness, providerCriticalHours: 24 }, "ASSURANCE_FRESHNESS_POLICY_MISMATCH"]
  ]) {
    const result = evaluateFreshnessClaims({
      claims,
      evidenceSources: [source],
      freshness: alteredFreshness,
      now: new Date("2026-08-09T12:00:00Z"),
      allowSyntheticFactRegistry: true,
      allowSyntheticExternalEvidence: true,
      evidenceSourceVerifier: () => true,
      externalEvidenceVerifier: {
        policy,
        receiptFor: () => receipt(),
        verifyIssuerReceipt: () => true
      }
    });
    assert.equal(result.ok, false, label);
    assert.equal(result.currentClaims.length, 0, label);
    assert.equal(result.liveProviderReadback, false, label);
    assert(result.findings.some(({ id }) => id === finding), label);
  }
});

test("receipt shapes, policy substitution and production use of synthetic fixtures fail closed", () => {
  for (const [label, value] of [
    ["wrong receipt version", receipt({ schemaVersion: 999 })],
    ["empty receipt id", receipt({ receiptId: "" })],
    ["object receipt id", receipt({ receiptId: { forged: true } })],
    ["unexpected receipt field", receipt({ attackerControlled: true })]
  ]) {
    const result = evaluate(value);
    assert.equal(result.ok, false, label);
    assert.equal(result.liveProviderReadback, false, label);
  }
  const attackerPolicy = {
    ...policy,
    schemaVersion: 9,
    approvedReceiptIssuers: ["ATTACKER"],
    approvedReceiptSchemas: ["attacker-v1"],
    approvedCollectionCommands: { PROVIDER_CRITICAL: ["curl provider"] },
    currentProductionVerifier: "ATTACKER",
    trustedVerifierBoundary: "attacker",
    hashAlgorithm: "md5",
    classAndPlatformCrossoverAllowed: true
  };
  const attackerReceipt = receipt({ receiptIssuer: "ATTACKER", receiptSchema: "attacker-v1", collectionCommand: "curl provider" });
  const substituted = evaluateFreshnessClaims({
    claims: [claim],
    evidenceSources: [source],
    freshness,
    now: new Date("2026-08-09T12:00:00Z"),
    allowSyntheticFactRegistry: true,
    allowSyntheticExternalEvidence: true,
    evidenceSourceVerifier: () => true,
    externalEvidenceVerifier: { policy: attackerPolicy, receiptFor: () => attackerReceipt, verifyIssuerReceipt: () => true }
  });
  assert.equal(substituted.ok, false);
  assert.equal(substituted.liveProviderReadback, false);
  const production = evaluateFreshnessClaims({
    claims: [claim],
    evidenceSources: [source],
    freshness,
    now: new Date("2026-08-09T12:00:00Z"),
    allowSyntheticFactRegistry: true,
    evidenceSourceVerifier: () => true,
    externalEvidenceVerifier: { policy, receiptFor: () => receipt(), verifyIssuerReceipt: () => true }
  });
  assert.equal(production.ok, false, "synthetic receipts cannot authorize normal production evaluation");
  assert.equal(production.liveProviderReadback, false);
});

test("historical Installed QA and RevenueCat facts remain recorded while source-only work passes and provider work is denied", () => {
  const truth = read("config/assurance/current-truth-v1.json");
  const evaluation = evaluateFreshnessClaims({
    claims: truth.freshnessClaims,
    evidenceSources: truth.evidenceSources,
    freshness: canonicalFreshness,
    now: new Date(truth.timestamp),
    evidenceSourceVerifier: () => true
  });
  assert.equal(evaluation.ok, true, JSON.stringify(evaluation.findings));
  assert.equal(evaluation.liveProviderReadback, false);
  assert.equal(truth.operationalClosures.installedProductQa.dailyTimerEnabled, true);
  assert.equal(truth.operationalClosures.installedProductQa.currentMatrixState, "POLL_HTTP_FAILED");
  assert.equal(truth.operationalClosures.revenueCat.providerReadbackClosed, true);
  assert.deepEqual(truth.operationalClosures.revenueCat.dashboardTest, { httpStatus: 200, result: "test_received" });
  assert.equal(truth.liveProviderReadback, false);
  assert.equal(evaluateTaskFreshness(evaluation, truth.activeTaskBinding.requiredFreshnessClaims).eligible, true, "source-only contract remains eligible");
  assert.equal(evaluateTaskFreshness(evaluation, [{
    freshnessClass: "PROVIDER_CRITICAL",
    platform: "NONE",
    evidenceSourceId: "b3-immutable-source-binding-20260802-0600",
    authorityAllowed: "PROVIDER_READBACK_ONLY",
    requiredFacts: ["provider.supabase.b3.live-acl"]
  }]).eligible, false, "provider-dependent contract fails on stale evidence");

  const relabeledRegistry = structuredClone(canonicalFreshness);
  relabeledRegistry.factRegistry.find(({ factId }) => factId === "provider.supabase.b3.live-acl").provider = "REVENUECAT";
  const relabeled = evaluateFreshnessClaims({
    claims: truth.freshnessClaims,
    evidenceSources: truth.evidenceSources,
    freshness: relabeledRegistry,
    now: new Date(truth.timestamp),
    evidenceSourceVerifier: () => true
  });
  assert.equal(relabeled.ok, false, "canonical fact metadata cannot be relabeled through mutable policy");
  assert.equal(relabeled.currentClaims.length, 0);
  assert.equal(relabeled.liveProviderReadback, false);
  assert(relabeled.findings.some(({ id }) => id === "ASSURANCE_FRESHNESS_FACT_REGISTRY_POLICY_MISMATCH"));
});

test("repository-source authority requires exact committed fact provenance", () => {
  const truth = read("config/assurance/current-truth-v1.json");
  const repositoryClaim = truth.freshnessClaims.find(({ freshnessClass }) => freshnessClass === "REPOSITORY_SOURCE");
  const repositorySource = truth.evidenceSources.find(({ id }) => id === repositoryClaim.evidenceSourceId);
  assert.equal(verifyCommittedClaimEvidence({
    claim: repositoryClaim,
    source: repositorySource,
    factRegistry: canonicalFreshness.factRegistry
  }), true);
  assert.equal(verifyCommittedClaimEvidence({
    claim: repositoryClaim,
    source: { ...repositorySource, sourceCommit: undefined },
    factRegistry: canonicalFreshness.factRegistry
  }), false);
  const forgedCoverage = { ...repositorySource, covers: [...repositorySource.covers] };
  forgedCoverage.covers = forgedCoverage.covers.filter((fact) => fact !== repositoryClaim.factsCovered[0]);
  assert.equal(verifyCommittedClaimEvidence({
    claim: repositoryClaim,
    source: forgedCoverage,
    factRegistry: canonicalFreshness.factRegistry
  }), false);
});

test("repository control readback facts are exact and hash-bound", () => {
  const truth = read("config/assurance/current-truth-v1.json");
  const source = truth.evidenceSources.find(({ id }) => id === "a1-post-merge-control-readback-source-freeze-20260810-0316");
  assert.equal(repositoryReadbackEvidenceHash(source), source.readbackSha256);
  const altered = structuredClone(source);
  altered.readbackFacts.ruleset.exactHeadContextRequired = false;
  assert.notEqual(repositoryReadbackEvidenceHash(altered), source.readbackSha256);
  assert.equal(repositoryReadbackEvidenceHash({ ...source, readbackFacts: [] }), null);
});

test("all-platform, iOS and Cognitive lanes share the same historical-provider/source-current semantics", () => {
  for (const command of ["scripts/guard-autonomous-systems-contract.mjs", "scripts/proof-autonomous-systems-contract.mjs"]) {
    const source = fs.readFileSync(command, "utf8");
    assert.match(source, /now: new Date\(\)/u);
    assert.doesNotMatch(source, /now: new Date\(currentTruth\.timestamp\)/u);
    const result = spawnSync(process.execPath, [command], { encoding: "utf8" });
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.providerEvidenceClassification, "HISTORICAL_PROVIDER_FACT");
    assert.equal(output.currentProviderProof, false);
    assert.equal(output.sourceOnlyEligible, true);
  }
});

test("claim-scoped Phase 1 lanes fetch committed evidence ancestry", () => {
  const workflow = fs.readFileSync(".github/workflows/phase1-ci.yml", "utf8");
  for (const jobId of [
    "autonomous-systems-all-platform-contract",
    "autonomous-systems-ios-contract",
    "cognitive-intelligence-contract"
  ]) {
    const start = workflow.indexOf(`  ${jobId}:\n`);
    assert.notEqual(start, -1, `${jobId} exists`);
    const remaining = workflow.slice(start + 2);
    const nextJob = remaining.search(/\n  [a-z0-9-]+:\n/u);
    const job = nextJob === -1 ? remaining : remaining.slice(0, nextJob);
    assert.match(job, /uses: actions\/checkout@[^\n]+\n\s+with:\n\s+fetch-depth: 0\n\s+persist-credentials: false/u, `${jobId} must retain committed provenance objects`);
  }
});
