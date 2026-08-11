import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { activeTask } from "../../scripts/assurance/active-task.mjs";
import { evidenceMetadataHash, lookup } from "../../scripts/assurance/evidence-index.mjs";
import { runReceipt } from "../../scripts/assurance/receipt.mjs";
import { archive, reviewHistory } from "../../scripts/assurance/review-history.mjs";
import { benchmark } from "../../scripts/assurance/benchmark.mjs";
import { exactKey, sha256 } from "../../scripts/assurance/efficiency-lib.mjs";
import {
  evaluateFreshnessClaims,
  evaluateTaskFreshness,
  externalEvidenceBindingHash,
  externalEvidenceReceiptHash
} from "../../scripts/assurance/lib.mjs";

const root = process.cwd();
const read = (file) => JSON.parse(fs.readFileSync(`${root}/${file}`, "utf8"));
const truth = read("config/assurance/current-truth-v1.json");
const registry = read("config/assurance/feature-registry-v1.json");
const allowlist = read("config/assurance/command-allowlist-v1.json");
const feature = registry.features.find(({ featureId }) => featureId === "assurance-efficiency-e0");
const legacyTruth = structuredClone(truth);
delete legacyTruth.activeTaskBinding;
legacyTruth.lateReviewSentinels = [];
legacyTruth.openImplementationPrs = [{
  number: 185,
  branch: "codex/assurance-efficiency-e0",
  head: "a".repeat(40),
  state: "open",
  featureId: "assurance-efficiency-e0"
}];
const head = "a".repeat(40); const tree = "b".repeat(40);
const identity = {
  branch: "codex/assurance-efficiency-e0",
  head,
  tree,
  originMainHead: "c".repeat(40),
  originMainTree: "d".repeat(40),
  baseHead: "c".repeat(40),
  baseTree: "d".repeat(40),
  diffHash: "e".repeat(64),
  pathHash: "f".repeat(64),
  changedFiles: ["scripts/assurance/active-task.mjs", "tests/assurance/efficiency-e0.test.mjs"]
};
const packetFacts = {
  currentTruth: legacyTruth,
  registry,
  allowlist,
  identity,
  legacyImplementationObservations: { remoteHead: head, currentTree: tree },
  truthCheck: { ok: true },
  directlyAffectedSymbols: ["scripts/assurance/active-task.mjs#activeTask"],
  blockers: [{ id: "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT" }]
};

test("active-task packet is deterministic 3/3 and compact", () => {
  const packets = [activeTask(packetFacts), activeTask(packetFacts), activeTask(packetFacts)];
  assert.equal(packets.every(({ ok }) => ok), true);
  assert.equal(JSON.stringify(packets[0]), JSON.stringify(packets[1]));
  assert.equal(JSON.stringify(packets[1]), JSON.stringify(packets[2]));
  assert.equal(packets[0].packet.authority.contractId, "current-truth-record-v1");
  assert.equal(packets[0].packet.implementation.state, "open");
  assert.equal(packets[0].packet.requiredCommandIds.length, feature.commands.length);
  assert.deepEqual(Object.keys(packets[0].packet.proofTiers).sort(), ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"]);
  assert.equal(JSON.stringify(packets[0].packet).includes("assuranceProgram"), false, "unrelated historical truth excluded");
});

test("active-task identity, authority, ownership, P1 and mandatory-command controls fail closed", () => {
  assert.equal(activeTask({ ...packetFacts, truthCheck: { ok: false } }).ok, false, "stale current truth");
  assert.equal(activeTask({ ...packetFacts, featureId: "nope" }).ok, false, "active feature conflict");
  assert.equal(activeTask({ ...packetFacts, currentTruth: { ...legacyTruth, openImplementationPrs: [{ ...legacyTruth.openImplementationPrs[0], featureId: undefined }] } }).ok, false, "ambiguous task");
  assert.equal(activeTask({ ...packetFacts, currentTruth: { ...legacyTruth, openImplementationPrs: [{ number: 1 }, { number: 2 }] }, implementation: undefined }).ok, false, "duplicate implementation ownership");
  assert.equal(activeTask({ ...packetFacts, stopConditions: { P0: "STOP" } }).ok, false, "P1 omitted");
  const missingCommand = { ...allowlist, commands: allowlist.commands.filter(({ id }) => id !== "focused-test") };
  assert.equal(activeTask({ ...packetFacts, allowlist: missingCommand }).ok, false, "mandatory test dropped");
});

test("legacy status text cannot substitute a historical frozen D2A checkpoint", () => {
  const d2aTruth = {
    ...legacyTruth,
    openImplementationPrs: [],
    assuranceProgram: { ...truth.assuranceProgram, active: "E0_COMPLETE_D2A_READY_NOT_RESUMED" }
  };
  const d2aIdentity = { ...identity, branch: "codex/first-pass-assurance-android-generated-native-lifecycle-instrumentation" };
  const result = activeTask({
    currentTruth: d2aTruth,
    registry,
    allowlist,
    identity: d2aIdentity,
    truthCheck: { ok: true },
    directlyAffectedSymbols: [],
    blockers: [{ id: "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT" }]
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["ACTIVE_TASK_NONE"]);
});

const canonicalFreshnessContract = read("config/assurance/current-truth-contract-v1.json").freshness;
const freshnessContract = {
  ...canonicalFreshnessContract,
  factRegistry: [
    { factId: "repository.fixture.exact-source", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE" },
    { factId: "provider.supabase.fixture.historical", freshnessClass: "PROVIDER_CRITICAL", authorityAllowed: "PROVIDER_READBACK_ONLY", platform: "NONE", provider: "SUPABASE" },
    { factId: "artifact.google-play.fixture.signed", freshnessClass: "SIGNED_ARTIFACT", authorityAllowed: "SIGNED_ARTIFACT_ONLY", platform: "ANDROID", provider: "GOOGLE_PLAY" }
  ]
};
const externalEvidencePolicy = read("config/assurance/external-evidence-receipt-v1.json");
const freshnessNow = new Date("2026-08-09T18:05:09Z");
const repositorySource = {
  id: "repository-source-fixture",
  status: "CURRENT",
  observedAt: "2026-08-09T18:05:08Z",
  expiresAt: "2026-08-10T18:05:08Z",
  evidenceSourceId: "repository-source-evidence",
  evidenceMode: "local-offline-and-github-read-only",
  factsCovered: ["repository.fixture.exact-source"],
  freshnessClass: "REPOSITORY_SOURCE",
  authorityAllowed: "REPOSITORY_ONLY",
  platform: "NONE",
  provider: "NONE",
  subjectHead: "a".repeat(40),
  subjectTree: "b".repeat(40)
};
const staleProvider = {
  id: "provider-critical-fixture",
  status: "STALE_BLOCKED",
  observedAt: "2026-08-02T06:00:44Z",
  expiresAt: "2026-08-02T14:00:44Z",
  evidenceSourceId: "provider-readback-evidence",
  evidenceMode: "local-and-linked-read-only",
  factsCovered: ["provider.supabase.fixture.historical"],
  freshnessClass: "PROVIDER_CRITICAL",
  authorityAllowed: "PROVIDER_READBACK_ONLY",
  platform: "NONE",
  provider: "SUPABASE"
};
const freshnessSources = [
  { id: repositorySource.evidenceSourceId, mode: repositorySource.evidenceMode, observedAt: repositorySource.observedAt, covers: repositorySource.factsCovered, freshnessClass: repositorySource.freshnessClass, authorityAllowed: repositorySource.authorityAllowed, platform: repositorySource.platform, provider: repositorySource.provider, subjectHead: repositorySource.subjectHead, subjectTree: repositorySource.subjectTree },
  { id: staleProvider.evidenceSourceId, mode: staleProvider.evidenceMode, observedAt: staleProvider.observedAt, covers: staleProvider.factsCovered, freshnessClass: staleProvider.freshnessClass, authorityAllowed: staleProvider.authorityAllowed, platform: staleProvider.platform, provider: staleProvider.provider, payloadHash: "1".repeat(64) }
];
const sourceRequirement = {
  freshnessClass: "REPOSITORY_SOURCE",
  platform: "NONE",
  evidenceSourceId: repositorySource.evidenceSourceId,
  authorityAllowed: "REPOSITORY_ONLY",
  requiredFacts: [repositorySource.factsCovered[0]],
  subjectHead: repositorySource.subjectHead,
  subjectTree: repositorySource.subjectTree
};
const providerRequirement = {
  freshnessClass: "PROVIDER_CRITICAL",
  platform: "NONE",
  evidenceSourceId: staleProvider.evidenceSourceId,
  authorityAllowed: "PROVIDER_READBACK_ONLY",
  requiredFacts: [staleProvider.factsCovered[0]]
};
const syntheticExternalEvidenceVerifier = {
  policy: externalEvidencePolicy,
  receiptFor: ({ claim, source }) => {
    const receipt = {
      schemaVersion: 1,
      receiptId: `synthetic:${claim.id}`,
      evidenceClass: claim.freshnessClass,
      provider: claim.provider ?? source.provider,
      platform: claim.platform,
      observedAt: claim.observedAt,
      expiresAt: claim.expiresAt,
      receiptIssuer: "SYNTHETIC_ASSURANCE_FIXTURE_ISSUER",
      receiptSchema: "synthetic-assurance-external-evidence-v1",
      payloadHash: source.payloadHash,
      evidenceHash: externalEvidenceBindingHash({ claim, source }),
      collectionCommand: externalEvidencePolicy.approvedCollectionCommands[claim.freshnessClass]?.[0],
      selfAttested: false
    };
    receipt.receiptHash = externalEvidenceReceiptHash(receipt);
    return receipt;
  },
  verifyIssuerReceipt: ({ receipt }) => receipt.receiptIssuer === "SYNTHETIC_ASSURANCE_FIXTURE_ISSUER"
};
const evaluateClaims = (input) => evaluateFreshnessClaims({
  ...input,
  allowSyntheticFactRegistry: true,
  allowSyntheticExternalEvidence: true,
  evidenceSourceVerifier: () => true,
  externalEvidenceVerifier: syntheticExternalEvidenceVerifier
});

test("claim-scoped freshness denies crossover and keeps stale provider state scoped", () => {
  const baseline = evaluateClaims({
    claims: [repositorySource, staleProvider],
    evidenceSources: freshnessSources,
    freshness: freshnessContract,
    now: freshnessNow
  });
  assert.equal(baseline.ok, true);
  assert.equal(baseline.liveProviderReadback, false);
  assert.deepEqual(baseline.currentClaims.map(({ freshnessClass }) => freshnessClass), ["REPOSITORY_SOURCE"], "local/GitHub evidence refreshes repository truth only");
  assert.deepEqual(baseline.blockedClaims.map(({ freshnessClass }) => freshnessClass), ["PROVIDER_CRITICAL"], "GitHub-only evidence does not refresh provider truth");

  const providerAtDeadline = evaluateClaims({
    claims: [{ ...staleProvider, status: "CURRENT" }],
    evidenceSources: [freshnessSources[1]],
    freshness: freshnessContract,
    now: new Date(staleProvider.expiresAt)
  });
  assert.equal(providerAtDeadline.liveProviderReadback, true);
  const providerAfterDeadline = evaluateClaims({
    claims: [staleProvider], evidenceSources: [freshnessSources[1]], freshness: freshnessContract,
    now: new Date(new Date(staleProvider.expiresAt).valueOf() + 1)
  });
  assert.equal(providerAfterDeadline.liveProviderReadback, false, "provider deadline expires after exactly eight hours");

  const widenedProviderWindow = evaluateClaims({
    claims: [staleProvider],
    evidenceSources: [freshnessSources[1]],
    freshness: {
      ...freshnessContract,
      classes: {
        ...freshnessContract.classes,
        PROVIDER_CRITICAL: { ...freshnessContract.classes.PROVIDER_CRITICAL, maximumHours: 24 }
      }
    },
    now: freshnessNow
  });
  assert.equal(widenedProviderWindow.ok, false, "the named eight-hour provider window cannot be widened through its class rule");
  assert.equal(widenedProviderWindow.findings.some(({ id }) => id === "ASSURANCE_FRESHNESS_CLASS_RULE_MISMATCH"), true);
  const pairedWidening = evaluateClaims({
    claims: [{ ...staleProvider, status: "CURRENT", expiresAt: "2026-08-03T06:00:44Z" }],
    evidenceSources: [freshnessSources[1]],
    freshness: {
      ...freshnessContract,
      providerCriticalHours: 24,
      classes: {
        ...freshnessContract.classes,
        PROVIDER_CRITICAL: { ...freshnessContract.classes.PROVIDER_CRITICAL, maximumHours: 24 }
      }
    },
    now: new Date("2026-08-02T20:00:44Z")
  });
  assert.equal(pairedWidening.ok, false, "provider TTL and class rule cannot be widened together");
  assert.equal(pairedWidening.findings.some(({ id }) => id === "ASSURANCE_FRESHNESS_POLICY_MISMATCH"), true);
  const forgedProviderTimestamp = evaluateFreshnessClaims({
    claims: [staleProvider],
    evidenceSources: [freshnessSources[1]],
    freshness: freshnessContract,
    now: freshnessNow,
    allowSyntheticFactRegistry: true,
    evidenceSourceVerifier: () => false
  });
  assert.equal(forgedProviderTimestamp.ok, false, "provider timestamp requires immutable committed provenance");
  assert(forgedProviderTimestamp.findings.some(({ id }) => id === "ASSURANCE_FRESHNESS_EVIDENCE_PROVENANCE_UNVERIFIED"));

  const extendedDocumentOnly = evaluateClaims({
    claims: [staleProvider], evidenceSources: [freshnessSources[1]], freshness: freshnessContract,
    now: freshnessNow, timestamp: "2099-01-01T00:00:00Z", freshnessDeadline: "2099-01-02T00:00:00Z"
  });
  assert.equal(extendedDocumentOnly.liveProviderReadback, false, "global document time cannot extend provider claims");
  assert.equal(evaluateTaskFreshness(baseline, [providerRequirement]).eligible, false, "provider-dependent task fails closed");
  assert.equal(evaluateTaskFreshness(baseline, [sourceRequirement]).eligible, true, "source-only review remains eligible");
  assert.equal(evaluateTaskFreshness(providerAtDeadline, [providerRequirement]).eligible, true, "provider task accepts only its exact current fact and evidence identity");
  assert.equal(evaluateTaskFreshness(providerAtDeadline, [{ ...providerRequirement, requiredFacts: ["unrelated provider fact"] }]).eligible, false, "unrelated provider evidence cannot authorize the task");
  assert.equal(evaluateTaskFreshness(providerAtDeadline, ["PROVIDER_CRITICAL"]).eligible, false, "class-only provider requirements fail closed");

  for (const [label, freshnessClass, evidenceMode, authorityAllowed] of [
    ["signed cannot refresh installed", "INSTALLED_DEVICE", "signed-artifact-inspection", "INSTALLED_DEVICE_ONLY"],
    ["installed cannot refresh physical", "PHYSICAL_DEVICE", "installed-device-readback", "PHYSICAL_DEVICE_ONLY"],
    ["GitHub cannot refresh provider", "PROVIDER_CRITICAL", repositorySource.evidenceMode, "PROVIDER_READBACK_ONLY"]
  ]) {
    const claim = {
      ...repositorySource,
      id: label.replaceAll(" ", "-"),
      freshnessClass,
      evidenceMode,
      authorityAllowed,
      evidenceSourceId: `${label.replaceAll(" ", "-")}-evidence`
    };
    const result = evaluateClaims({
      claims: [claim],
      evidenceSources: [{ id: claim.evidenceSourceId, mode: claim.evidenceMode, observedAt: claim.observedAt, covers: claim.factsCovered, freshnessClass: claim.freshnessClass, authorityAllowed: claim.authorityAllowed, platform: claim.platform }],
      freshness: freshnessContract,
      now: freshnessNow
    });
    assert.equal(result.ok, false, label);
    assert(result.findings.some(({ id }) => id === "ASSURANCE_FRESHNESS_CLASS_CROSSOVER"), label);
  }

  const androidSigned = {
    ...repositorySource,
    id: "android-signed",
    freshnessClass: "SIGNED_ARTIFACT",
    evidenceMode: "signed-artifact-inspection",
    authorityAllowed: "SIGNED_ARTIFACT_ONLY",
    platform: "ANDROID",
    evidenceSourceId: "android-signed-evidence",
    provider: "GOOGLE_PLAY"
  };
  androidSigned.factsCovered = ["artifact.google-play.fixture.signed"];
  const androidSignedSource = { id: androidSigned.evidenceSourceId, mode: androidSigned.evidenceMode, observedAt: androidSigned.observedAt, covers: androidSigned.factsCovered, freshnessClass: androidSigned.freshnessClass, authorityAllowed: androidSigned.authorityAllowed, platform: androidSigned.platform, provider: androidSigned.provider, payloadHash: "2".repeat(64) };
  const androidEvaluation = evaluateClaims({
    claims: [androidSigned],
    evidenceSources: [androidSignedSource],
    freshness: freshnessContract,
    now: freshnessNow
  });
  assert.equal(androidEvaluation.ok, true);
  const androidRequirement = {
    freshnessClass: "SIGNED_ARTIFACT",
    platform: "ANDROID",
    evidenceSourceId: androidSigned.evidenceSourceId,
    authorityAllowed: "SIGNED_ARTIFACT_ONLY",
    requiredFacts: [androidSigned.factsCovered[0]]
  };
  assert.equal(evaluateTaskFreshness(androidEvaluation, [{ ...androidRequirement, platform: "IOS" }]).eligible, false, "Android evidence cannot refresh iOS evidence");
  const forgedCrossPlatform = evaluateClaims({
    claims: [{ ...androidSigned, platform: "CROSS_PLATFORM" }],
    evidenceSources: [{ id: androidSigned.evidenceSourceId, mode: androidSigned.evidenceMode, observedAt: androidSigned.observedAt, covers: androidSigned.factsCovered, freshnessClass: androidSigned.freshnessClass, authorityAllowed: androidSigned.authorityAllowed, platform: "CROSS_PLATFORM" }],
    freshness: freshnessContract,
    now: freshnessNow
  });
  assert.equal(forgedCrossPlatform.ok, false, "a claim cannot self-attest cross-platform coverage");
  assert.equal(forgedCrossPlatform.findings.some(({ id }) => id === "ASSURANCE_FRESHNESS_PLATFORM_MALFORMED"), true);

  const unboundRepositoryFact = evaluateClaims({
    claims: [{ ...repositorySource, factsCovered: ["unobserved source fact"] }],
    evidenceSources: freshnessSources,
    freshness: freshnessContract,
    now: freshnessNow
  });
  assert.equal(unboundRepositoryFact.ok, false, "repository facts must be covered by the exact source");
  assert.equal(unboundRepositoryFact.findings.some(({ id }) => id === "ASSURANCE_FRESHNESS_EVIDENCE_SOURCE_BINDING_MISMATCH"), true);

  const selfAttestedProvider = evaluateFreshnessClaims({
    claims: [{ ...staleProvider, status: "CURRENT" }],
    evidenceSources: [freshnessSources[1]],
    freshness: freshnessContract,
    now: new Date(staleProvider.expiresAt),
    allowSyntheticFactRegistry: true,
    evidenceSourceVerifier: () => true
  });
  assert.equal(selfAttestedProvider.ok, false, "committed prose alone cannot mint external authority");
  assert.equal(selfAttestedProvider.findings.some(({ id }) => id === "ASSURANCE_FRESHNESS_EXTERNAL_RECEIPT_UNVERIFIED"), true);

  for (const [label, claim] of [
    ["missing observedAt", Object.fromEntries(Object.entries(repositorySource).filter(([key]) => key !== "observedAt"))],
    ["missing evidence source", { ...repositorySource, evidenceSourceId: "absent" }]
  ]) {
    const result = evaluateClaims({ claims: [claim], evidenceSources: freshnessSources, freshness: freshnessContract, now: freshnessNow });
    assert.equal(result.ok, false, label);
  }
});

const request = {
  sourceHead: head,
  sourceTree: tree,
  commandContractId: "test-v1",
  inputSetHash: "c".repeat(64),
  toolchainIdentity: "node-test",
  platform: "android",
  configurationHash: "d".repeat(64)
};
const exact = {
  ...request,
  key: exactKey(request),
  immutable: true,
  evidenceClass: "exact-unchanged-source",
  receiptHash: "e".repeat(64),
  artifactLocator: "external:test"
};
const exactArtifact = JSON.stringify({ scanId: null, sourceHead: exact.sourceHead, sourceTree: exact.sourceTree });
exact.receiptHash = sha256(exactArtifact); exact.integritySha256 = evidenceMetadataHash(exact);

test("content-addressed evidence accepts only the exact full reusable key", () => {
  assert.equal(lookup({ entries: [exact] }, request, { currentIdentity: request, readArtifact: () => exactArtifact }).ok, true, "exact hit accepted");
  for (const [label, entry, query] of [
    ["different tree", exact, { ...request, sourceTree: "f".repeat(40) }],
    ["stale head", exact, { ...request, sourceHead: "0".repeat(40) }],
    ["different toolchain", exact, { ...request, toolchainIdentity: "other" }],
    ["Android evidence used for iOS", exact, { ...request, platform: "ios" }],
    ["historical provider evidence treated as fresh", { ...exact, evidenceClass: "provider" }, request],
    ["signed artifact", { ...exact, evidenceClass: "signed-artifact" }, request],
    ["installed device", { ...exact, evidenceClass: "installed-device" }, request],
    ["physical", { ...exact, evidenceClass: "physical" }, request],
    ["public canary", { ...exact, evidenceClass: "public-canary" }, request],
    ["time limited", { ...exact, evidenceClass: "time-limited" }, request],
    ["unknown evidence class", { ...exact, evidenceClass: "other" }, request],
    ["poisoned metadata", { ...exact, receiptHash: "9".repeat(64) }, request]
  ]) assert.equal(lookup({ entries: [entry] }, query, { currentIdentity: query, readArtifact: () => exactArtifact }).ok, false, label);
  assert.equal(lookup({ entries: [exact] }, request, { currentIdentity: request, readArtifact: () => { throw new Error("missing"); } }).ok, false, "missing receipt artifact");
});

test("sealed security scan is reused once only for exact source and requests an incremental scan after source change", () => {
  const index = read("config/assurance/evidence-index-v1.json");
  const sealed = index.entries[0];
  const sealedRequest = Object.fromEntries(["sourceHead", "sourceTree", "commandContractId", "inputSetHash", "toolchainIdentity", "platform", "configurationHash"].map((key) => [key, sealed[key]]));
  assert.equal(lookup(index, sealedRequest, { currentIdentity: sealedRequest }).ok, true, "unchanged sealed source reused");
  const changedRequest = { ...sealedRequest, sourceHead: "0".repeat(40), sourceTree: "1".repeat(40) };
  const changed = lookup(index, changedRequest, { currentIdentity: changedRequest });
  assert.equal(changed.ok, false);
  assert.equal(changed.finding, "MISS_REQUIRE_INCREMENTAL_DIFF_SCAN", "sealed scan cannot be reused after source changes");
});

const receiptIdentity = { sourceHead: head, sourceTree: tree };
const canonicalRule = (id) => structuredClone(allowlist.commands.find((rule) => rule.id === id));
const okRule = { commands: [canonicalRule("node-version")] };
const deterministicDependencies = {
  ...receiptIdentity,
  clock: () => 10,
  spawn: () => ({ status: 0, signal: null, stdout: "v22.1.0\n", stderr: "" }),
  artifactWriter: () => "/tmp/chillywood-assurance-e0/test-receipt"
};

test("compact receipt is deterministic 3/3 and exposes no successful raw log", () => {
  const receipts = [runReceipt(okRule, "node-version", ["--version"], deterministicDependencies), runReceipt(okRule, "node-version", ["--version"], deterministicDependencies), runReceipt(okRule, "node-version", ["--version"], deterministicDependencies)];
  assert.equal(receipts.every(({ ok }) => ok), true);
  assert.equal(JSON.stringify(receipts[0]), JSON.stringify(receipts[1]));
  assert.equal(JSON.stringify(receipts[1]), JSON.stringify(receipts[2]));
  assert.equal(receipts[0].receipt.assertionTotals, 1);
  assert.equal(receipts[0].receipt.resultTotals, 1);
  assert.equal(Object.hasOwn(receipts[0].receipt, "rawLog"), false);
  assert.equal(JSON.stringify(receipts[0]).includes("v22.1.0"), true, "bounded parsed result retained, not full log");
});

test("receipt subprocesses disable GitHub telemetry without forwarding ambient credentials", () => {
  let observedEnvironment;
  const result = runReceipt(okRule, "node-version", ["--version"], {
    ...deterministicDependencies,
    spawn: (_file, _args, options) => {
      observedEnvironment = options.env;
      return { status: 0, signal: null, stdout: "v22.1.0\n", stderr: "" };
    }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(observedEnvironment, {
    PATH: process.env.PATH,
    CI: "1",
    NO_COLOR: "1",
    GH_TELEMETRY: "0",
    DO_NOT_TRACK: "1",
    GH_PROMPT_DISABLED: "1",
    GH_NO_UPDATE_NOTIFIER: "1",
    GH_NO_EXTENSION_UPDATE_NOTIFIER: "1"
  });
  for (const secretName of ["GH_CONFIG_DIR", "GH_TOKEN", "GITHUB_TOKEN", "HOME", "XDG_CONFIG_HOME", "TMPDIR", "RUNNER_TEMP"]) {
    assert.equal(Object.hasOwn(observedEnvironment, secretName), false, secretName);
  }
  assert.equal(JSON.stringify(result.receipt).includes(".config/gh"), false, "receipt excludes credential-bearing paths");
});

test("runner rejects unknown commands, shell injection, missing results, secrets and artifact failures", () => {
  assert.equal(runReceipt(okRule, "unknown", [], deterministicDependencies).ok, false, "unknown command");
  assert.equal(runReceipt(okRule, "node-version", ["--version", "; rm -rf /"], deterministicDependencies).ok, false, "arbitrary shell command");
  const interpreterRule = { commands: [{ id: "eval", file: "node", args: ["-e", "process.exit(0)"], timeoutMs: 1000, resultContract: { type: "exit-zero-v1" } }] };
  assert.equal(runReceipt(interpreterRule, "eval", ["-e", "process.exit(0)"], deterministicDependencies).finding, "COMMAND_CONTRACT_INVALID", "interpreter code denied");
  const jsonRule = { commands: [canonicalRule("plan")] };
  const jsonArgs = jsonRule.commands[0].args;
  assert.equal(runReceipt(jsonRule, "plan", jsonArgs, { ...deterministicDependencies, spawn: () => ({ status: 0, stdout: "", stderr: "" }) }).finding, "RESULT_MISSING");
  assert.equal(runReceipt(jsonRule, "plan", jsonArgs, { ...deterministicDependencies, spawn: () => ({ status: 0, stdout: '{"command":"assurance:plan","ok":true}\n{"command":"assurance:plan","ok":true}\n', stderr: "" }) }).finding, "RESULT_AMBIGUOUS");
  const secretRule = { commands: [canonicalRule("lint")] };
  const secretArgs = secretRule.commands[0].args;
  assert.equal(runReceipt(secretRule, "lint", secretArgs, { ...deterministicDependencies, spawn: () => ({ status: 0, stdout: "Bearer sk_abcdefghijklmnop", stderr: "" }) }).finding, "SENSITIVE_OUTPUT_DETECTED", "raw successful log injection denied");
  const failed = runReceipt(secretRule, "lint", secretArgs, { ...deterministicDependencies, spawn: () => ({ status: 7, stdout: "", stderr: "Bearer sk_abcdefghijklmnop" }) });
  assert.match(failed.failureExcerpt, /REDACTED/u, "failure excerpt redacted");
  const deviceFailed = runReceipt(secretRule, "lint", secretArgs, { ...deterministicDependencies, spawn: () => ({ status: 7, stdout: "", stderr: "deviceSerial=R58M1234ABC UDID=00008101-001234567890001E ordinary diagnostic" }) });
  assert.doesNotMatch(deviceFailed.failureExcerpt, /R58M1234ABC|00008101-001234567890001E/u, "device identifiers redacted");
  assert.match(deviceFailed.failureExcerpt, /ordinary diagnostic/u, "benign failure text retained");
  assert.equal(runReceipt(okRule, "node-version", ["--version"], { ...deterministicDependencies, artifactWriter: () => { throw new Error("no"); } }).finding, "ARTIFACT_WRITE_FAILED");
  const cli = spawnSync(process.execPath, ["scripts/assurance/receipt.mjs", "--unknown=value"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 1, "unknown CLI flag rejected");
});

test("receipt command IDs bind the complete canonical rule tuple", () => {
  const stdoutFor = (resultContract) => {
    if (resultContract.type === "assurance-json-v1") return `${JSON.stringify({ command: resultContract.command, ok: true })}\n`;
    if (resultContract.type === "node-test-tap-v1") return "TAP version 13\n1..1\n# tests 1\n# pass 1\n# fail 0\n";
    if (resultContract.type === "node-version-v1") return "v22.1.0\n";
    return "";
  };
  for (const rule of allowlist.commands) {
    const result = runReceipt(allowlist, rule.id, rule.args, {
      ...deterministicDependencies,
      spawn: () => ({ status: 0, signal: null, stdout: stdoutFor(rule.resultContract), stderr: "" })
    });
    assert.equal(result.ok, true, `${rule.id} canonical tuple must remain runnable`);
  }
  const invokeMutation = (mutate) => {
    const candidate = structuredClone(allowlist);
    const rule = candidate.commands.find(({ id }) => id === "codex-review-exact-head-test");
    mutate(rule, candidate);
    return runReceipt(candidate, "codex-review-exact-head-test", rule.args, deterministicDependencies);
  };
  assert.equal(invokeMutation((rule, candidate) => { rule.args = candidate.commands.find(({ id }) => id === "github-main-ruleset-readback-test").args; }).finding, "COMMAND_CONTRACT_INVALID", "cross-ID argv substitution denied");
  assert.equal(invokeMutation((rule) => { rule.contractCommand = "node --test tests/assurance/github-main-ruleset-readback.test.mjs"; }).finding, "COMMAND_CONTRACT_INVALID", "display command substitution denied");
  assert.equal(invokeMutation((rule) => { rule.resultContract = { type: "exit-zero-v1" }; }).finding, "COMMAND_CONTRACT_INVALID", "result contract downgrade denied");
  assert.equal(invokeMutation((rule) => { rule.timeoutMs = 900000; }).finding, "COMMAND_CONTRACT_INVALID", "timeout widening denied");
  assert.equal(invokeMutation((rule) => { rule.maxBuffer = 1024; }).finding, "COMMAND_CONTRACT_INVALID", "unbound max buffer denied");
});

test("review archive rejects active reviews and preserves four never-merge lanes", () => {
  const lane = (name) => ({ lane: name, head, tree, evidenceSha256: sha256(name), state: "CLOSED_UNMERGED", retained: true, mergePermitted: false });
  const reviews = ["architecture-state", "security-authority", "proof-equivalence-native-provider", "privacy-rollback-determinism"].map(lane);
  assert.equal(archive({ reviews }).ok, true);
  assert.equal(archive({ reviews: reviews.map((review, index) => index ? review : { ...review, state: "ACTIVE" }) }).ok, false, "active review archived as stale");
  assert.equal(archive({ reviews: reviews.slice(0, 3) }).ok, false, "formal lane dropped");
});

test("review history emits only exact hash-bound stale closure candidates with retained branches", () => {
  const config = read("config/assurance/review-history-v1.json");
  const result = reviewHistory(config, truth);
  assert.equal(result.ok, true, result.findings.join(","));
  assert.deepEqual(result.closureList.map(({ pr }) => pr), [80, 81, 82, 83, 84, 85, 88, 89, 91, 92, 93, 94]);
  assert.equal(result.closureList.every(({ p0 }) => p0 === 0), true);
  assert.equal(result.closureList.filter(({ p1 }) => p1 > 0).every(({ unresolvedDisposition }) => unresolvedDisposition !== "none"), true);
  const first = config.safeStaleCandidates[0];
  const firstFile = spawnSync("git", ["show", "--format=", "--name-only", first.head], { cwd: root, encoding: "utf8" }).stdout.trim();
  const firstEvidence = JSON.parse(spawnSync("git", ["show", `${first.head}:${firstFile}`], { cwd: root, encoding: "utf8" }).stdout);
  const identityForgery = reviewHistory(config, truth, { readObject: (reviewHead, file) => reviewHead === first.head ? JSON.stringify({ ...firstEvidence, implementationHead: "f".repeat(40) }) : spawnSync("git", ["show", `${reviewHead}:${file}`], { cwd: root, encoding: "utf8" }).stdout });
  assert.equal(identityForgery.closureList.some(({ pr }) => pr === first.pr), false, "identity-free or mismatched review evidence cannot close");
  const hiddenP1 = structuredClone(firstEvidence); hiddenP1.summary.p1Open = 0;
  const semanticForgery = reviewHistory(config, truth, { readObject: (reviewHead, file) => reviewHead === first.head ? JSON.stringify(hiddenP1) : spawnSync("git", ["show", `${reviewHead}:${file}`], { cwd: root, encoding: "utf8" }).stdout });
  assert.equal(semanticForgery.closureList.some(({ pr }) => pr === first.pr), false, "declared totals cannot hide an open P1 finding");
  assert.equal(semanticForgery.findings.some((finding) => finding === `REVIEW_DECLARED_FINDING_COUNTS_MISMATCH:${first.pr}`), true);
  const fakeMerge = structuredClone(config); fakeMerge.implementationDispositions[String(first.implementationPr)].mergeSha = "f".repeat(40);
  assert.equal(reviewHistory(fakeMerge, truth).closureList.some(({ pr }) => pr === first.pr), false, "nonexistent merge cannot close review");
});

test("pending corrected final reviews remain active and fail closed outside their exact bootstrap state", () => {
  const pendingHead = "1".repeat(40); const remoteHead = "2".repeat(40);
  const pendingTruth = { openReviewOnlyPrs: [{ number: 999, branch: "codex/pending", head: pendingHead, reviewedImplementationHead: "3".repeat(40), state: "open-draft-stale-pending-corrected-final-review", disposition: "never-merge" }] };
  const pendingConfig = { canonicalSource: "test", safeStaleCandidates: [], protectedImplementationHeads: [], implementationDispositions: {} };
  const pendingEvidence = JSON.stringify({ status: "PENDING_CORRECTED_FINAL_REVIEW", implementationHead: "3".repeat(40) });
  const dependencies = { readObject: () => pendingEvidence, git: (argv) => {
    if (argv[0] === "show") return "docs/reviews/pending.json";
    if (argv[0] === "show-ref") return remoteHead;
    if (argv[0] === "merge-base") return "";
    throw new Error("unexpected git");
  } };
  const accepted = reviewHistory(pendingConfig, pendingTruth, dependencies);
  assert.equal(accepted.ok, true); assert.equal(accepted.records[0].p0, null); assert.equal(accepted.records[0].p1, null); assert.equal(accepted.records[0].closureEligible, false);
  const nonpending = reviewHistory(pendingConfig, { openReviewOnlyPrs: [{ ...pendingTruth.openReviewOnlyPrs[0], state: "open-draft-current" }] }, dependencies);
  assert.equal(nonpending.ok, false); assert.ok(nonpending.findings.includes("REVIEW_P0_P1_AMBIGUOUS:999"));
  const nonAncestor = reviewHistory(pendingConfig, pendingTruth, { ...dependencies, git: (argv) => argv[0] === "merge-base" ? (() => { throw new Error("not ancestor"); })() : dependencies.git(argv) });
  assert.equal(nonAncestor.ok, false); assert.ok(nonAncestor.findings.includes("REVIEW_BRANCH_ANCESTRY_INVALID:999"));
  const declaredCounts = reviewHistory(pendingConfig, pendingTruth, { ...dependencies, readObject: () => JSON.stringify({ status: "PENDING_CORRECTED_FINAL_REVIEW", implementationHead: "3".repeat(40), p0: 0, p1: 1 }) });
  assert.equal(declaredCounts.ok, false); assert.ok(declaredCounts.findings.includes("PENDING_REVIEW_STATUS_OR_COUNTS_INVALID:999"));
  const colliding = reviewHistory({ ...pendingConfig, safeStaleCandidates: [{ pr: 999, branch: "codex/pending", head: pendingHead, reviewedImplementationHead: "3".repeat(40), evidenceSha256: sha256(pendingEvidence), p0: 0, p1: 0, implementationPr: 64, unresolvedDisposition: "none" }] }, pendingTruth, dependencies);
  assert.equal(colliding.ok, false); assert.ok(colliding.findings.includes("PENDING_REVIEW_STALE_CANDIDATE_COLLISION:999"));
  assert.equal(accepted.closureList.some(({ pr }) => pr === 999), false, "pending review cannot archive");
});

test("D2C and D2B shadow plans preserve P0/P1 classes, all gates, tests, defects and blockers", () => {
  const data = read("docs/assurance/e0-benchmark-v1.json");
  const result = benchmark(data);
  assert.equal(result.ok, true, result.findings.join(","));
  assert.equal(result.baselines.every(({ parity }) => Object.values(parity).every(Boolean)), true);
  assert.equal(result.baselines.every(({ shadow }) => shadow.expensiveImplementationOrSecurityReruns === 0 && shadow.successfulLogBytesExposed === 0), true);
  for (const field of ["knownP0P1Classes", "mandatoryGates", "applicableDefects", "mandatoryTests"]) {
    const mutated = structuredClone(data);
    mutated.baselines[0].shadowPlan[field] = mutated.baselines[0].shadowPlan[field].slice(1);
    assert.equal(benchmark(mutated).ok, false, `${field} omission denied`);
  }
  const selfAuthored = structuredClone(data);
  for (const field of ["knownP0P1Classes", "mandatoryGates", "applicableDefects", "mandatoryTests", "blockers"]) selfAuthored.baselines[0].expected[field] = selfAuthored.baselines[0].shadowPlan[field] = [];
  selfAuthored.baselines[0].shadowPlanSha256 = sha256(selfAuthored.baselines[0].shadowPlan);
  for (const metric of Object.values(selfAuthored.baselines[0].metrics)) if (metric.value !== null) metric.value = 0;
  assert.equal(benchmark(selfAuthored).ok, false, "self-authored empty baseline and zero metrics denied");
});

test("all ten required named E0 negative controls are represented", () => {
  const contract = read("config/assurance/efficiency-e0-v1.json");
  assert.deepEqual(contract.negativeControls, ["different-tree", "different-toolchain", "android-for-ios", "historical-provider-as-fresh", "active-review-archived", "p1-omitted", "mandatory-test-dropped", "raw-success-log-in-context", "arbitrary-shell-command", "sealed-scan-after-source-change"]);
});
