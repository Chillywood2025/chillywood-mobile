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

const root = process.cwd();
const read = (file) => JSON.parse(fs.readFileSync(`${root}/${file}`, "utf8"));
const truth = read("config/assurance/current-truth-v1.json");
const registry = read("config/assurance/feature-registry-v1.json");
const allowlist = read("config/assurance/command-allowlist-v1.json");
const feature = registry.features.find(({ featureId }) => featureId === "assurance-efficiency-e0");
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
const implementation = { pr: null, branch: identity.branch, state: "LOCAL_PRE_PR", immutableSourceHead: head, immutableSourceTree: tree };
const packetFacts = {
  currentTruth: truth,
  registry,
  allowlist,
  identity,
  implementation,
  truthCheck: { ok: true },
  inferredFeatures: [feature.featureId],
  directlyAffectedSymbols: ["scripts/assurance/active-task.mjs#activeTask"],
  blockers: [{ id: "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT" }]
};

test("active-task packet is deterministic 3/3 and compact", () => {
  const packets = [activeTask(packetFacts), activeTask(packetFacts), activeTask(packetFacts)];
  assert.equal(packets.every(({ ok }) => ok), true);
  assert.equal(JSON.stringify(packets[0]), JSON.stringify(packets[1]));
  assert.equal(JSON.stringify(packets[1]), JSON.stringify(packets[2]));
  assert.equal(packets[0].packet.authority.contractId, "current-truth-record-v1");
  assert.equal(packets[0].packet.implementation.state, "LOCAL_PRE_PR");
  assert.equal(packets[0].packet.requiredCommandIds.length, feature.commands.length);
  assert.deepEqual(Object.keys(packets[0].packet.proofTiers).sort(), ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"]);
  assert.equal(JSON.stringify(packets[0].packet).includes("assuranceProgram"), false, "unrelated historical truth excluded");
});

test("active-task identity, authority, ownership, P1 and mandatory-command controls fail closed", () => {
  assert.equal(activeTask({ ...packetFacts, truthCheck: { ok: false } }).ok, false, "stale current truth");
  assert.equal(activeTask({ ...packetFacts, featureId: "nope" }).ok, false, "active feature conflict");
  assert.equal(activeTask({ ...packetFacts, inferredFeatures: [feature.featureId, "chilly-chat-call-lifecycle"] }).ok, false, "ambiguous task");
  assert.equal(activeTask({ ...packetFacts, currentTruth: { ...truth, openImplementationPrs: [{ number: 1 }, { number: 2 }] }, implementation: undefined }).ok, false, "duplicate implementation ownership");
  assert.equal(activeTask({ ...packetFacts, stopConditions: { P0: "STOP" } }).ok, false, "P1 omitted");
  const missingCommand = { ...allowlist, commands: allowlist.commands.filter(({ id }) => id !== "focused-test") };
  assert.equal(activeTask({ ...packetFacts, allowlist: missingCommand }).ok, false, "mandatory test dropped");
});

test("post-E0 current truth resolves the frozen D2A checkpoint without resuming it", () => {
  const d2aTruth = {
    ...truth,
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
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.equal(result.packet.featureId, "chilly-chat-call-lifecycle");
  assert.equal(result.packet.implementation.immutableSourceHead, "8c47a3a9bff9f9630ba14837652ec31c14be0629");
  assert.equal(result.packet.implementation.immutableSourceTree, "f9e102649b51da84324e97b576823e910340df9f");
  assert.equal(result.packet.commands.some(({ id, resultContract }) => id.startsWith("deferred:") && resultContract.executable === false), true, "generic pgTAP remains explicit and non-executable until D2A resolves it");
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
const okRule = { commands: [{ id: "ok", file: "node", args: ["--version"], timeoutMs: 1000, resultContract: { type: "node-version-v1" } }] };
const deterministicDependencies = {
  ...receiptIdentity,
  clock: () => 10,
  spawn: () => ({ status: 0, signal: null, stdout: "v22.1.0\n", stderr: "" }),
  artifactWriter: () => "/tmp/chillywood-assurance-e0/test-receipt"
};

test("compact receipt is deterministic 3/3 and exposes no successful raw log", () => {
  const receipts = [runReceipt(okRule, "ok", ["--version"], deterministicDependencies), runReceipt(okRule, "ok", ["--version"], deterministicDependencies), runReceipt(okRule, "ok", ["--version"], deterministicDependencies)];
  assert.equal(receipts.every(({ ok }) => ok), true);
  assert.equal(JSON.stringify(receipts[0]), JSON.stringify(receipts[1]));
  assert.equal(JSON.stringify(receipts[1]), JSON.stringify(receipts[2]));
  assert.equal(receipts[0].receipt.assertionTotals, 1);
  assert.equal(receipts[0].receipt.resultTotals, 1);
  assert.equal(Object.hasOwn(receipts[0].receipt, "rawLog"), false);
  assert.equal(JSON.stringify(receipts[0]).includes("v22.1.0"), true, "bounded parsed result retained, not full log");
});

test("runner rejects unknown commands, shell injection, missing results, secrets and artifact failures", () => {
  assert.equal(runReceipt(okRule, "unknown", [], deterministicDependencies).ok, false, "unknown command");
  assert.equal(runReceipt(okRule, "ok", ["--version", "; rm -rf /"], deterministicDependencies).ok, false, "arbitrary shell command");
  const interpreterRule = { commands: [{ id: "eval", file: "node", args: ["-e", "process.exit(0)"], timeoutMs: 1000, resultContract: { type: "exit-zero-v1" } }] };
  assert.equal(runReceipt(interpreterRule, "eval", ["-e", "process.exit(0)"], deterministicDependencies).finding, "COMMAND_CONTRACT_INVALID", "interpreter code denied");
  const jsonArgs = ["scripts/assurance/plan.mjs", "--feature=assurance-efficiency-e0"];
  const jsonRule = { commands: [{ id: "json", file: "node", args: jsonArgs, timeoutMs: 1000, resultContract: { type: "assurance-json-v1", command: "assurance:test" } }] };
  assert.equal(runReceipt(jsonRule, "json", jsonArgs, { ...deterministicDependencies, spawn: () => ({ status: 0, stdout: "", stderr: "" }) }).finding, "RESULT_MISSING");
  assert.equal(runReceipt(jsonRule, "json", jsonArgs, { ...deterministicDependencies, spawn: () => ({ status: 0, stdout: '{"command":"assurance:test","ok":true}\n{"command":"assurance:test","ok":true}\n', stderr: "" }) }).finding, "RESULT_AMBIGUOUS");
  const secretRule = { commands: [{ id: "secret", file: "node", args: ["--version"], timeoutMs: 1000, resultContract: { type: "exit-zero-v1" } }] };
  assert.equal(runReceipt(secretRule, "secret", ["--version"], { ...deterministicDependencies, spawn: () => ({ status: 0, stdout: "Bearer sk_abcdefghijklmnop", stderr: "" }) }).finding, "SENSITIVE_OUTPUT_DETECTED", "raw successful log injection denied");
  const failed = runReceipt(secretRule, "secret", ["--version"], { ...deterministicDependencies, spawn: () => ({ status: 7, stdout: "", stderr: "Bearer sk_abcdefghijklmnop" }) });
  assert.match(failed.failureExcerpt, /REDACTED/u, "failure excerpt redacted");
  const deviceFailed = runReceipt(secretRule, "secret", ["--version"], { ...deterministicDependencies, spawn: () => ({ status: 7, stdout: "", stderr: "deviceSerial=R58M1234ABC UDID=00008101-001234567890001E ordinary diagnostic" }) });
  assert.doesNotMatch(deviceFailed.failureExcerpt, /R58M1234ABC|00008101-001234567890001E/u, "device identifiers redacted");
  assert.match(deviceFailed.failureExcerpt, /ordinary diagnostic/u, "benign failure text retained");
  assert.equal(runReceipt(okRule, "ok", ["--version"], { ...deterministicDependencies, artifactWriter: () => { throw new Error("no"); } }).finding, "ARTIFACT_WRITE_FAILED");
  const cli = spawnSync(process.execPath, ["scripts/assurance/receipt.mjs", "--unknown=value"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 1, "unknown CLI flag rejected");
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
