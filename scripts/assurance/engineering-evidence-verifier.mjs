#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { SOURCE_BOUND_TRANSITION_SPECS, compareUtf8, hashValue, stableJson, verifyVerificationDependencyClosure } from "./engineering-closure.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "../..");
const GENERATOR_PATH = "scripts/assurance/engineering-closure.mjs";
const VERIFIER_PATH = "scripts/assurance/engineering-evidence-verifier.mjs";
const REQUIRED_CALLS = ["assertGoverningPreconditions", "commitGoverningEffect", "rollbackGoverningEffect", "cleanupGoverningTransition", "enforceGoverningLifecycle"].sort(compareUtf8);
const IMPLEMENTATIONS = {
  "assurance-efficiency-e0": ["applyAssuranceEfficiencyTransition", "assurance_coordinator"],
  "codex-security-scan-reliability-s0": ["applyCodexSecurityTransition", "security_owner_operator"],
  "autonomous-cognitive-governance": ["applyAutonomousGovernanceTransition", "owner-command"],
};
const PASS_C_IDS = [
  "SOURCE_BOUND_TRANSITION_AUTHORITY_INCOMPLETE",
  "GOVERNING_EDGE_CLOSURE_SELF_DERIVED",
  "AUTHORITATIVE_REPLAY_CACHE_REUSE",
  "AUTHORITATIVE_REPLAY_NONDETERMINISTIC_NORMALIZATION",
  "REPOSITORY_INVENTORY_ORPHAN_RESULT_NONAUTHORITATIVE",
  "EXTERNAL_AND_RUNTIME_EVIDENCE_FORGEABLE_BY_REPOSITORY_CODE",
  "PHASE1_SCOPE_CONTEXT_HARD_CODED_TO_S0",
].sort(compareUtf8);

const normalizedSourceHash = (source) => hashValue(source.replace(/\r\n?/gu, "\n").replace(/[ \t]+$/gmu, ""));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const optionsFrom = (argv) => Object.fromEntries(argv.map((entry) => { const [key, value = true] = entry.replace(/^--/u, "").split("=", 2); return [key, value]; }));

const parseFunctions = (source, fileName) => {
  const ts = require("typescript");
  const unit = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".ts") || fileName.endsWith(".tsx") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const functions = new Map();
  for (const statement of unit.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body || !(statement.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const calls = [];
    const visit = (node) => { if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push(node.expression.text); ts.forEachChild(node, visit); };
    visit(statement.body);
    functions.set(statement.name.text, { bodyHash: hashValue(statement.body.getText(unit).replace(/\r\n?/gu, "\n")), calls: [...new Set(calls)].sort(compareUtf8) });
  }
  return { ts, unit, functions };
};

const executableTestCalls = (source, fileName, testId) => {
  const { ts, unit } = parseFunctions(source, fileName);
  const matches = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "test" && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0])) && node.arguments[0].text === testId) {
      const calls = [];
      const collect = (child) => { if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) calls.push(child.expression.text); ts.forEachChild(child, collect); };
      for (const argument of node.arguments.slice(1)) collect(argument);
      matches.push([...new Set(calls)].sort(compareUtf8));
    }
    ts.forEachChild(node, visit);
  };
  visit(unit);
  return matches;
};

export function verifySerializedTransitionModel(model, { root = DEFAULT_ROOT, sourceIdentity = null } = {}) {
  const findings = [];
  const generatorSource = fs.readFileSync(path.join(root, GENERATOR_PATH), "utf8");
  const verifierSource = fs.readFileSync(path.join(root, VERIFIER_PATH), "utf8");
  const generatorFunctions = parseFunctions(generatorSource, GENERATOR_PATH).functions;
  const verifierFunctions = parseFunctions(verifierSource, VERIFIER_PATH).functions;
  const verifierFunction = verifierFunctions.get("verifySerializedTransitionModel");
  const testPath = path.join(root, "tests/assurance/engineering-doctrine.test.mjs");
  const testSource = fs.readFileSync(testPath, "utf8");
  const positive = executableTestCalls(testSource, "tests/assurance/engineering-doctrine.test.mjs", "source-bound transition positive executable witness");
  const negative = executableTestCalls(testSource, "tests/assurance/engineering-doctrine.test.mjs", "source-bound transition negative executable witness");
  if (model?.modelId !== "SOURCE_BOUND_GOVERNING_MODEL_V2" || model?.generatorVerifierSourceDistinct !== true || !verifierFunction || normalizedSourceHash(generatorSource) === normalizedSourceHash(verifierSource)) findings.push("TRANSITION_GENERATOR_VERIFIER_NOT_DISTINCT");
  let stateCount = 0;
  let transitionCount = 0;
  const domains = new Map((model?.domains ?? []).map((domain) => [domain.domain, domain]));
  for (const [domain, tuples] of Object.entries(SOURCE_BOUND_TRANSITION_SPECS)) {
    const record = domains.get(domain);
    const [implementationSymbol, effectOwner] = IMPLEMENTATIONS[domain];
    const fn = generatorFunctions.get(implementationSymbol);
    if (!record || !fn || record.transitions?.length !== tuples.length) { findings.push(`TRANSITION_DOMAIN_BINDING_INVALID:${domain}`); continue; }
    stateCount += record.states?.length ?? 0;
    transitionCount += record.transitions.length;
    const declarations = new Map(record.transitions.map((transition) => [transition.transitionId, transition]));
    for (const [transitionId, from, to] of tuples) {
      const transition = declarations.get(transitionId);
      const observation = transition?.observation;
      const verifier = transition?.independentVerifier;
      const callsComplete = stableJson(observation?.requiredCallRelationships?.slice().sort(compareUtf8)) === stableJson(REQUIRED_CALLS) && REQUIRED_CALLS.every((call) => fn.calls.includes(call));
      const witnessComplete = positive.length === 1 && negative.length === 1 && positive[0].includes(implementationSymbol) && negative[0].includes(implementationSymbol);
      if (!transition || transition.declaration?.declarationId !== `${domain}:${transitionId}` || transition.declaration?.sourceState !== from || transition.declaration?.destinationState !== to || transition.sourceStates?.[0] !== from || transition.destinationStates?.[0] !== to || observation?.implementationSourcePath !== GENERATOR_PATH || observation?.implementationSymbol !== implementationSymbol || observation?.implementationSelectorMatchCount !== 1 || observation?.implementationAstBodyHash !== fn.bodyHash || observation?.implementationSourceHash !== normalizedSourceHash(generatorSource) || observation?.preconditionEnforcementSymbol !== "assertGoverningPreconditions" || observation?.effectOwnerSymbol !== "commitGoverningEffect" || observation?.exactEffectOwner !== effectOwner || observation?.rollbackSymbol !== "rollbackGoverningEffect" || observation?.cleanupSymbol !== "cleanupGoverningTransition" || observation?.lifecycleSymbol !== "enforceGoverningLifecycle" || !callsComplete || !witnessComplete || verifier?.sourcePath !== VERIFIER_PATH || verifier?.symbol !== "verifySerializedTransitionModel" || verifier?.selectorMatchCount !== 1 || verifier?.verifierAstBodyHash !== verifierFunction.bodyHash || verifier?.verifierSourceHash !== normalizedSourceHash(verifierSource) || verifier?.verifierSourceHash === observation?.implementationSourceHash || verifier?.sourceHead !== sourceIdentity?.head || verifier?.sourceTree !== sourceIdentity?.tree) findings.push(`TRANSITION_RECORD_INVALID:${domain}:${transitionId}`);
      if (transition?.terminality === "MONOTONIC_TERMINAL" && !(model.domains.find((item) => item.domain === domain)?.states ?? []).some(({ stateId, classification }) => stateId === to && classification === "TERMINAL")) findings.push(`TRANSITION_TERMINALITY_INVALID:${domain}:${transitionId}`);
    }
  }
  const subject = { modelHash: model?.transitionModelHash, stateCount, transitionCount, findings: [...new Set(findings)].sort(compareUtf8), sourceHead: sourceIdentity?.head, sourceTree: sourceIdentity?.tree };
  return { ok: findings.length === 0, ...subject, verifierVersion: "engineering-evidence-verifier-v1", verifierSourceHash: normalizedSourceHash(verifierSource), verificationReceiptHash: hashValue(subject) };
}

const verifyInventory = (inventory, root) => {
  const findings = [];
  if (!inventory || inventory.sourceInventoryHash !== hashValue(Object.fromEntries(Object.entries(inventory).filter(([key]) => key !== "sourceInventoryHash")))) findings.push("INVENTORY_HASH_INVALID");
  for (const group of inventory?.groups ?? []) {
    const discovered = group.accounting?.discovered ?? [];
    const partitions = ["mapped", "shared", "historicalDeprecated", "legacyUnmodeled", "unknownOwner", "orphan", "duplicateOwner"].flatMap((key) => group.accounting?.[key] ?? []);
    if (group.count !== group.members?.length || group.contentHash !== hashValue(group.members) || new Set(discovered).size !== discovered.length || new Set(partitions).size !== partitions.length || stableJson([...partitions].sort(compareUtf8)) !== stableJson(discovered)) findings.push(`INVENTORY_GROUP_ACCOUNTING_INVALID:${group.id}`);
    for (const member of group.members ?? []) {
      if (member.path && member.contentSha256 && fs.existsSync(path.join(root, member.path)) && fs.statSync(path.join(root, member.path)).isFile() && member.contentSha256 !== shaFile(path.join(root, member.path))) findings.push(`INVENTORY_SOURCE_HASH_STALE:${member.path}`);
      if (Array.isArray(member.files) && (member.contentSha256 !== hashValue(member.files) || member.files.some(({ path: filePath, contentSha256 }) => !fs.existsSync(path.join(root, filePath)) || shaFile(path.join(root, filePath)) !== contentSha256))) findings.push(`INVENTORY_DIRECTORY_HASH_STALE:${member.path}`);
    }
  }
  return { ok: findings.length === 0, findings: [...new Set(findings)].sort(compareUtf8) };
};

export function verifySerializedEdgeModel(output, { root = DEFAULT_ROOT } = {}) {
  const edgeEvidence = output?.edgeEvidence;
  const findings = [];
  if (output?.declaredGraphHash !== hashValue(edgeEvidence?.declaredEdgeRecords) || output?.observedEdgeHash !== hashValue(edgeEvidence?.observedRepositoryEdges) || output?.verifiedEdgeHash !== hashValue(edgeEvidence?.verifiedGoverningEdges)) findings.push("EDGE_SET_HASH_INVALID");
  const declared = edgeEvidence?.declaredGraphEdges ?? [];
  const declaredRecords = edgeEvidence?.declaredEdgeRecords ?? [];
  const observations = edgeEvidence?.observedRepositoryEdges ?? [];
  const verifiedRecords = edgeEvidence?.verifiedGoverningEdges ?? [];
  if (new Set(declared).size !== declared.length || declaredRecords.length !== declared.length || stableJson(declaredRecords.map(({ edgeId }) => edgeId)) !== stableJson(declared) || new Set(observations.map(({ observationId }) => observationId)).size !== observations.length) findings.push("DUPLICATE_EDGE_OR_OBSERVATION");
  for (const observation of observations) {
    const body = { ...observation }; delete body.observationId;
    if (observation.observationId !== hashValue(body)) findings.push(`OBSERVED_EDGE_HASH_INVALID:${observation.observationId}`);
  }
  for (const record of verifiedRecords) {
    const body = { ...record }; delete body.verifiedEdgeHash;
    const observed = observations.find(({ observationId }) => observationId === record.observationId);
    const declaration = declaredRecords.find(({ edgeId }) => edgeId === record.declaredEdgeId);
    if (record.verifiedEdgeHash !== hashValue(body) || !observed || !declaration || record.observedVerifierResult !== observed?.verifierResult || record.declaredEdgeHash !== hashValue(declaration) || stableJson(record.declaredImpactClasses) !== stableJson(declaration.impactClasses) || record.declaredRollbackBehavior !== declaration.rollbackBehavior || Object.entries(observed ?? {}).filter(([key]) => key !== "verifierResult").some(([key, value]) => stableJson(record[key]) !== stableJson(value))) findings.push(`VERIFIED_EDGE_BINDING_INVALID:${record.observationId}`);
    if (record.verifierResult !== "VERIFIED_GOVERNING_EDGE" || record.declaredMatchCount !== 1 || !declared.includes(record.declaredEdgeId)) findings.push(`OBSERVED_GOVERNING_EDGE_UNVERIFIED:${record.observationId}`);
  }
  const verified = (edgeEvidence?.verifiedGoverningEdges ?? []).filter(({ verifierResult }) => verifierResult === "VERIFIED_GOVERNING_EDGE");
  if (new Set(verified.map(({ declaredEdgeId }) => declaredEdgeId)).size !== verified.length) findings.push("DUPLICATE_VERIFIED_EDGE");
  for (const edge of edgeEvidence?.observedRepositoryEdges ?? []) for (const subject of edge.exactSourceSubjects ?? []) if (!fs.existsSync(path.join(root, subject.sourcePath)) || shaFile(path.join(root, subject.sourcePath)) !== subject.sourceHash) findings.push(`EDGE_SOURCE_HASH_STALE:${subject.sourcePath}`);
  const expectedDeclarationOnly = declared.filter((edgeId) => !verified.some(({ declaredEdgeId }) => declaredEdgeId === edgeId)).map((edgeId) => ({ edgeId, status: "DECLARATION_ONLY" }));
  if (stableJson(expectedDeclarationOnly) !== stableJson(edgeEvidence?.declarationOnlyEdges ?? [])) findings.push("DECLARATION_ONLY_EDGE_ACCOUNTING_INVALID");
  const actualIncluded = verified.filter(({ sourceDomainCandidate, destinationDomainCandidate }) => output.closure.domains.includes(sourceDomainCandidate) && output.closure.domains.includes(destinationDomainCandidate)).map(({ declaredEdgeId }) => declaredEdgeId).sort(compareUtf8);
  const observedBoundary = verified.filter(({ sourceDomainCandidate, destinationDomainCandidate }) => output.closure.domains.includes(sourceDomainCandidate) !== output.closure.domains.includes(destinationDomainCandidate)).map(({ declaredEdgeId }) => declaredEdgeId).sort(compareUtf8);
  if (stableJson(actualIncluded) !== stableJson(output.closure.actualIncludedEdges) || stableJson(observedBoundary) !== stableJson(output.closure.observedBoundaryCutSet) || stableJson(output.closure.boundaryCutSet) !== stableJson(output.closure.exclusionReceipts.map(({ edgeId }) => edgeId).sort(compareUtf8))) findings.push("EDGE_CLOSURE_ACCOUNTING_INVALID");
  for (const receipt of output.closure.exclusionReceipts ?? []) {
    const body = { ...receipt }; delete body.receiptHash;
    const binding = receipt.enforcingSourceBinding;
    const witness = receipt.negativeWitness;
    const bindingPath = binding?.sourcePath ? path.join(root, binding.sourcePath) : null;
    const witnessPath = witness?.sourcePath ? path.join(root, witness.sourcePath) : null;
    const invalidPath = (value) => typeof value !== "string" || value.includes("*") || path.isAbsolute(value) || value.split("/").includes("..");
    const bindingSource = bindingPath && fs.existsSync(bindingPath) ? fs.readFileSync(bindingPath, "utf8") : null;
    const witnessSource = witnessPath && fs.existsSync(witnessPath) ? fs.readFileSync(witnessPath, "utf8") : null;
    const count = (source, selector) => typeof source === "string" && typeof selector === "string" ? source.split(selector).length - 1 : 0;
    if (receipt.receiptHash !== hashValue(body) || receipt.evidenceClass !== "EXECUTABLE_WITNESS" || !declared.includes(receipt.edgeId) || invalidPath(binding?.sourcePath) || invalidPath(witness?.sourcePath) || count(bindingSource, binding?.selector) !== 1 || count(witnessSource, witness?.selector) !== 1 || normalizedSourceHash(bindingSource ?? "") !== binding?.normalizedBoundSourceHash || normalizedSourceHash(witnessSource ?? "") !== witness?.normalizedBoundSourceHash || binding?.sourceHead !== output.sourceIdentity.head || binding?.sourceTree !== output.sourceIdentity.tree || witness?.sourceHead !== output.sourceIdentity.head || witness?.sourceTree !== output.sourceIdentity.tree) findings.push(`BOUNDARY_EXCLUSION_INVALID:${receipt.edgeId}`);
  }
  const accounting = edgeEvidence?.edgeSetAccounting;
  if (accounting?.declaredCount !== declared.length || accounting?.observedRelationshipCount !== observations.length || accounting?.observedGoverningCount !== observations.filter(({ governingCandidate }) => governingCandidate).length || accounting?.verifiedGoverningCount !== verified.length || accounting?.declarationOnlyCount !== expectedDeclarationOnly.length || (accounting?.discoveryFindings ?? []).length !== 0) findings.push("EDGE_SET_ACCOUNTING_INVALID");
  return { ok: findings.length === 0, findings: [...new Set(findings)].sort(compareUtf8) };
}

const verifyReceipts = (output, root) => {
  const findings = [];
  const expected = { PASS_A: ["A-AUTHORITY", "A-CLOSURE", "A-INVENTORY", "A-TRANSITIONS"], PASS_B: ["B-CONTRACTS", "B-EVIDENCE-AUTHORITY", "B-RECOVERY", "B-TAXONOMY"], PASS_C: PASS_C_IDS };
  const generatorHash = normalizedSourceHash(fs.readFileSync(path.join(root, GENERATOR_PATH), "utf8"));
  const receiptHashes = [];
  for (const lane of output?.laneResults ?? []) {
    const workIds = lane.worklist.map(({ itemId }) => itemId).sort(compareUtf8);
    const receiptIds = lane.receipts.map(({ subject }) => subject.itemId).sort(compareUtf8);
    if (stableJson(workIds) !== stableJson(expected[lane.laneId]) || stableJson(workIds) !== stableJson(receiptIds) || new Set(receiptIds).size !== receiptIds.length || lane.worklistHash !== hashValue(lane.worklist) || lane.receiptCount !== lane.receipts.length) findings.push(`RECEIPT_SET_INVALID:${lane.laneId}`);
    for (const receipt of lane.receipts) {
      const body = { ...receipt }; delete body.receiptHash;
      if (receipt.receiptHash !== hashValue(body) || receipt.generatorSourceHash !== generatorHash || receipt.sourceHead !== output.sourceIdentity.head || receipt.sourceTree !== output.sourceIdentity.tree || receipt.replayResult !== "REPLAY_MATCH" || receipt.result !== "VERIFIED" || receipt.findings.length !== 0 || receipt.deferredClassification !== null) findings.push(`RECEIPT_INVALID:${lane.laneId}:${receipt.subject.itemId}`);
      receiptHashes.push(receipt.receiptHash);
    }
  }
  if (output?.receiptSetHash !== hashValue(receiptHashes.sort(compareUtf8))) findings.push("RECEIPT_SET_HASH_INVALID");
  return { ok: findings.length === 0, findings: [...new Set(findings)].sort(compareUtf8) };
};

export function verifyAuthoritativeOutput(output, { root = DEFAULT_ROOT } = {}) {
  const findings = [];
  const serialized = stableJson(output);
  if (output?.replayId !== "AUTHORITATIVE_REPLAY_A_B_C_V2" || output?.execution?.noCache !== true || output?.execution?.processIsolated !== true || output?.execution?.generatorProcessIdClassification !== "FRESH_NODE_PROCESS" || output?.execution?.localeIndependentComparator !== "RAW_UTF8_BYTE_ORDER") findings.push("AUTHORITATIVE_PROCESS_ISOLATION_INVALID");
  if (/cacheHit|\/private\/var\/|\/tmp\/|20\d\d-\d\d-\d\dT\d\d:/u.test(serialized)) findings.push("AUTHORITATIVE_NONDETERMINISTIC_FIELD_PRESENT");
  const transition = verifySerializedTransitionModel(output?.transitionModel, { root, sourceIdentity: output?.sourceIdentity });
  const inventory = verifyInventory(output?.inventory, root);
  const edges = verifySerializedEdgeModel(output, { root });
  const receipts = verifyReceipts(output, root);
  const verificationDependencies = verifyVerificationDependencyClosure(output?.verificationDependencyClosure);
  if (output?.verificationDependencyClosureHash !== output?.verificationDependencyClosure?.closureHash) findings.push("VERIFICATION_DEPENDENCY_CLOSURE_HASH_MISMATCH");
  findings.push(...transition.findings, ...inventory.findings, ...edges.findings, ...receipts.findings, ...verificationDependencies.findings);
  const body = { ...output }; delete body.authoritativeReplayHash; delete body.result;
  if (output?.authoritativeReplayHash !== hashValue(body)) findings.push("AUTHORITATIVE_REPLAY_HASH_INVALID");
  if (!Object.values(output?.p1Results ?? {}).every(Boolean)) findings.push("FROZEN_CORRECTION_LEDGER_INCOMPLETE");
  return { ok: findings.length === 0, findings: [...new Set(findings)].sort(compareUtf8), transition, inventory, edges, receipts, verificationDependencies };
}

const firstDifference = (left, right, pointer = "") => {
  if (stableJson(left) === stableJson(right)) return null;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return { pointer: pointer || "/", leftHash: hashValue(left), rightHash: hashValue(right) };
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compareUtf8);
  for (const key of keys) { const difference = firstDifference(left[key], right[key], `${pointer}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`); if (difference) return difference; }
  return { pointer: pointer || "/", leftHash: hashValue(left), rightHash: hashValue(right) };
};

export function compareReplayOutputs(left, right) {
  const difference = firstDifference(left, right);
  return { equal: difference === null, difference };
}

const taskArgs = (options) => ["pr", "branch", "admitted-seed-head", "protected-base", "lease-id", "comment-id", "amendment-comment-id", "verification-correction-comment-id"].filter((key) => options[key] !== undefined).map((key) => `--${key}=${options[key]}`);

export function runIsolatedAuthoritativeReplay({ root = DEFAULT_ROOT, runs = 2, taskOptions = {} } = {}) {
  const outputs = [];
  const verifications = [];
  const generator = path.join(root, GENERATOR_PATH);
  for (let index = 0; index < runs; index += 1) {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `chillywood-authoritative-replay-${index + 1}-`));
    const child = spawnSync(process.execPath, [generator, "--authoritative-child", `--root=${root}`, ...taskArgs(taskOptions)], { cwd: temporaryDirectory, encoding: "utf8", shell: false, env: { ...process.env, LC_ALL: index === 0 ? "C" : "en_US.UTF-8", CHILLYWOOD_AUTHORITATIVE_ENUMERATION_ORDER: index === 0 ? "canonical" : "reverse" }, maxBuffer: 128 * 1024 * 1024 });
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    if (child.status !== 0) return { deterministic: false, runs: `${outputs.length}/${runs}`, output: null, outputHash: null, differences: [{ code: "AUTHORITATIVE_GENERATOR_PROCESS_FAILED", run: index + 1, status: child.status, stderrHash: hashValue(child.stderr ?? "") }] };
    let output;
    try { output = JSON.parse(child.stdout); } catch { return { deterministic: false, runs: `${outputs.length}/${runs}`, output: null, outputHash: null, differences: [{ code: "AUTHORITATIVE_GENERATOR_OUTPUT_INVALID", run: index + 1, stdoutHash: hashValue(child.stdout ?? "") }] }; }
    outputs.push(output);
    verifications.push(verifyAuthoritativeOutput(output, { root }));
  }
  const comparisons = outputs.slice(1).map((output) => compareReplayOutputs(outputs[0], output));
  const deterministic = comparisons.every(({ equal }) => equal) && verifications.every(({ ok }) => ok);
  const verifierSourceHash = normalizedSourceHash(fs.readFileSync(path.join(root, VERIFIER_PATH), "utf8"));
  const generatorSourceHash = normalizedSourceHash(fs.readFileSync(path.join(root, GENERATOR_PATH), "utf8"));
  return {
    deterministic,
    runs: `${runs}/${runs}`,
    resultEquality: deterministic ? `${runs}/${runs}` : "MISMATCH",
    output: outputs[0],
    outputHash: hashValue(outputs[0]),
    receiptSetHash: outputs[0]?.receiptSetHash ?? null,
    verifierVersion: "engineering-evidence-verifier-v1",
    verifierSourceHash,
    generatorSourceHash,
    generatorVerifierSourceDistinct: generatorSourceHash !== verifierSourceHash,
    noCache: true,
    processIsolated: true,
    replayTwoReadsReplayOne: false,
    differences: comparisons.filter(({ equal }) => !equal).map(({ difference }, index) => ({ run: index + 2, ...difference })),
    verificationFindings: verifications.flatMap(({ findings }, index) => findings.map((finding) => ({ run: index + 1, finding }))),
    result: deterministic && outputs[0]?.sourceIdentity?.authority === "ACTUAL_GITHUB_PR" ? "PREIMPLEMENTATION_GROUNDING_VERIFIED" : deterministic ? "ENGINEERING_PLAN_DRAFTED" : "ENGINEERING_MODEL_UNSTABLE",
  };
}

async function main() {
  const options = optionsFrom(process.argv.slice(2));
  if (!options.replay) return;
  const result = runIsolatedAuthoritativeReplay({ root: options.root ?? DEFAULT_ROOT, runs: Number(options.runs ?? 2), taskOptions: options });
  process.stdout.write(`${stableJson(result)}\n`);
  if (!result.deterministic) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
