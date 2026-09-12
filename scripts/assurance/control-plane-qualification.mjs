#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  GITHUB_AUTHORITY_INVENTORY_V2,
  ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2_PROFILE,
  boundedProviderOperation,
  canReuseEvidence,
  classifyProtectedMainAdvancement,
  controlPlaneHash,
  createCandidateGitContext,
  enumerateCompletePages,
  exactEvidenceIdentity,
  projectTerminalSynchronization,
  readCandidatePath,
  resolveFiniteTaskAmendmentState,
  resolveLifecycle,
  terminalSynchronizationIdempotent,
  validateImplementationChain,
  validateNegativeAuthority,
  validateRecoveryEvent,
} from "./control-plane-v2.mjs";

const sha = (character) => character.repeat(40);
const hash = (character) => character.repeat(64);
const run = (cwd, ...args) => {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`QUALIFICATION_COMMAND_FAILED:${args[0]}:${args[1]}`);
  return result.stdout.trim();
};

function fixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-control-plane-v2-"));
  run(root, "git", "init", "-q", "-b", "main");
  run(root, "git", "config", "user.name", "Assurance Fixture");
  run(root, "git", "config", "user.email", "assurance@example.invalid");
  fs.writeFileSync(path.join(root, "base.txt"), "base\n");
  run(root, "git", "add", "base.txt");
  run(root, "git", "commit", "-qm", "base");
  return { root, base: run(root, "git", "rev-parse", "HEAD") };
}

function commitFixture({ root, name, body, binary = false }) {
  const output = path.join(root, name);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, body, binary ? undefined : "utf8");
  run(root, "git", "add", name);
  run(root, "git", "commit", "-qm", `add ${name}`);
  return run(root, "git", "rev-parse", "HEAD");
}

const result = (name, ok, details = {}) => ({ name, ok: ok === true, ...details });
const successfulAmendment = ({ maximumAmendments = 1, consumed = 0, changed = false, receipt = null } = {}) => resolveFiniteTaskAmendmentState({
  maximumAmendments,
  amendmentsConsumed: consumed,
  amendmentReceipt: receipt,
  baseLease: { paths: ["a"] },
  effectiveLease: { paths: changed ? ["a", "b"] : ["a"] },
});

function evidenceFixture(overrides = {}) {
  return {
    repository: "Chillywood2025/chillywood-mobile",
    pr: 900,
    taskId: "synthetic-task-v2",
    leaseHash: hash("a"),
    headSha: sha("b"),
    tree: sha("c"),
    baseSha: sha("d"),
    changedPathHash: hash("e"),
    sourceIdentityHash: hash("f"),
    lifecycleGeneration: "READY-1",
    rulesetStage: "FINAL_AGGREGATE_ONLY",
    reviewIdentity: "review-1",
    ...overrides,
  };
}

function implementationChain() {
  const validation = (phase1RunId, reviewRunId) => ({
    phase1RawLanesPassed: 13,
    phase1RawLanesRequired: 13,
    phase1RunId,
    reviewRunId,
    securityFindings: 0,
    P0: 0,
    P1: 0,
    launchImpactingP2: 0,
    assuranceDisposition: "PASS",
    ownerRecoveryCommentId: null,
    ownerRecoveryRawBodyHash: null,
    bypassedChecks: [],
  });
  return [{
    pr: 901, branch: "codex/synthetic-one", baseSha: sha("1"), headSha: sha("2"), tree: sha("3"),
    mergeSha: sha("4"), mergeTree: sha("3"), mergeParents: [sha("1"), sha("2")], title: "Synthetic one", validation: validation(9011, 9012),
  }, {
    pr: 902, branch: "codex/synthetic-two", baseSha: sha("4"), headSha: sha("5"), tree: sha("6"),
    mergeSha: sha("7"), mergeTree: sha("6"), mergeParents: [sha("4"), sha("5")], title: "Synthetic two", validation: validation(9021, 9022),
  }];
}

export function terminalFixture({ amended = false } = {}) {
  const implementations = implementationChain();
  const baseLease = {
    leaseId: "synthetic-task-v2",
    taskState: "ACTIVE_IMPLEMENTATION",
    domainOwnership: "ACTIVE",
    domain: "ci-test-infrastructure",
    allowedPaths: ["a"],
    scopeBudget: { maximumFiles: 1, maximumChangedLines: 10 },
    amendmentMaximum: { maximumAmendments: 1, maximumFiles: 2, maximumChangedLines: 20 },
  };
  const baseReservationWithoutHash = { allowedPaths: ["a"], pathGlobs: ["a"], maximumFiles: 1, maximumLines: 10, eligiblePathCount: 1 };
  const baseReservation = { ...baseReservationWithoutHash, reservationHash: controlPlaneHash(baseReservationWithoutHash) };
  const effectiveReservationWithoutHash = amended
    ? { allowedPaths: ["a", "b"], pathGlobs: ["a", "b"], maximumFiles: 2, maximumLines: 20, eligiblePathCount: 2 }
    : baseReservationWithoutHash;
  const effectiveReservation = { ...effectiveReservationWithoutHash, reservationHash: controlPlaneHash(effectiveReservationWithoutHash) };
  const amendmentReceipt = amended ? {
    commentId: 9001,
    createdAt: "2026-09-11T00:00:00.000Z",
    subjectHash: hash("a"),
    bodyHash: hash("b"),
    rawBodyHash: hash("c"),
    boundStartingHead: sha("2"),
    boundStartingTree: sha("3"),
    addedPaths: ["b"],
    domain: baseLease.domain,
    authorityClassification: "LIVE_IMMUTABLE_OWNER_RECEIPT",
  } : null;
  const finalSourceWithoutHash = {
    schemaVersion: 1,
    classification: "EXACT_SOURCE_PHASE1_REVIEW_AND_BOUNDED_RECOVERY_EVIDENCE_V1",
    repository: "Chillywood2025/chillywood-mobile",
    taskId: "synthetic-task-v2",
    source: "LIVE_GITHUB_READBACK",
    observedAt: "2026-09-11T00:00:00.000Z",
    finalHead: sha("5"),
    finalTree: sha("6"),
    implementationEvidence: implementations.map(({ pr, headSha, tree, validation }) => ({ pr, headSha, tree, validation })),
  };
  return {
    record: {
      mainSha: sha("1"),
      protectedMainAuthority: { checkpointSha: sha("1"), checkpointTree: sha("0") },
      latestMergedImplementationPr: { number: 800 },
      openImplementationPrs: [{ number: 901 }, { number: 902 }],
      activeTaskBinding: { implementationPr: 901 },
      finiteTaskLeases: { tasks: [structuredClone(baseLease)], completedLeaseOutcomes: [] },
      finiteTaskRuntime: { historicalCandidates: [] },
      engineeringDoctrine: { taskLeaseState: "ACTIVE", nextPermittedAction: "IMPLEMENT" },
      assuranceProgram: { nextActions: [] },
    },
    transition: {
      taskId: "synthetic-task-v2",
      implementations,
      finalProtectedMain: sha("7"),
      nextTask: "AWAIT_OWNER_FINITE_TASK",
      observedAt: "2026-09-11T00:00:00.000Z",
      baseLease,
      baseLeaseHash: controlPlaneHash(baseLease),
      baseReservation,
      effectiveReservation,
      amendmentReceipt,
      finalSourceEvidence: { ...finalSourceWithoutHash, evidenceHash: controlPlaneHash(finalSourceWithoutHash) },
      noActiveEngineeringDoctrine: {
        activeTaskSentinel: "NO_ACTIVE_PRODUCT_IMPLEMENTATION",
        taskLeaseState: "NO_ACTIVE_TASK",
        affectedDomains: [],
        nextPermittedAction: "AWAIT_OWNER_FINITE_TASK",
      },
    },
  };
}

async function runAdversarialVariants() {
  const variants = [];
  variants.push(result("01 simple task / no amendment", successfulAmendment({ maximumAmendments: 0 }).ok));
  variants.push(result("02 optional amendment allowed / unused", successfulAmendment({ maximumAmendments: 1 }).ok));
  variants.push(result("03 valid amendment consumed", successfulAmendment({ consumed: 1, changed: true, receipt: { id: 1 } }).ok));
  variants.push(result("04 invalid amendment", !successfulAmendment({ consumed: 1, changed: true }).ok));
  variants.push(result("05 40+ source paths", validateNegativeAuthority({ allowedPaths: Array.from({ length: 43 }, (_, i) => `p/${i}`), changedPaths: Array.from({ length: 43 }, (_, i) => `p/${i}`) }).ok));

  const fixture = fixtureRepository();
  try {
    let head = commitFixture({ root: fixture.root, name: "small.txt", body: "small\n" });
    variants.push(result("06 small text diff", createCandidateGitContext({ root: fixture.root, base: fixture.base, head }).ok));
    head = commitFixture({ root: fixture.root, name: "large.txt", body: "x".repeat(1_200_000) });
    const large = createCandidateGitContext({ root: fixture.root, base: fixture.base, head });
    variants.push(result("07 large diff >1 MiB", large.ok && large.binaryPaths.length === 0));
    head = commitFixture({ root: fixture.root, name: "very-large.txt", body: "y".repeat(3_000_000) });
    variants.push(result("08 2–5 MiB diff", createCandidateGitContext({ root: fixture.root, base: fixture.base, head }).ok));
    const binaryBody = Buffer.alloc(1_400_000, 0xff);
    binaryBody[0] = 0;
    head = commitFixture({ root: fixture.root, name: "binary.bin", body: binaryBody, binary: true });
    const binary = createCandidateGitContext({ root: fixture.root, base: fixture.base, head });
    variants.push(result("09 binary diff", binary.ok && binary.binaryPaths.includes("binary.bin")));
    head = commitFixture({ root: fixture.root, name: "mixed.txt", body: "mixed\n" });
    const mixed = createCandidateGitContext({ root: fixture.root, base: fixture.base, head });
    variants.push(result("10 mixed binary/text diff", mixed.ok && mixed.binaryPaths.includes("binary.bin") && mixed.changedPaths.includes("mixed.txt")));
    head = commitFixture({ root: fixture.root, name: "candidate-only/evidence.json", body: "{\"candidate\":true}\n" });
    const candidateOnly = readCandidatePath({ root: fixture.root, candidateHead: head, path: "candidate-only/evidence.json" });
    variants.push(result("11 candidate-only evidence", candidateOnly.ok && candidateOnly.source === "CANDIDATE_GIT_OBJECT"));
    variants.push(result("12 candidate checkout differs from evaluator checkout", candidateOnly.ok && !fs.existsSync(path.join(process.cwd(), "candidate-only/evidence.json"))));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }

  variants.push(result("13 protected main advances during admission", classifyProtectedMainAdvancement({ candidateBase: sha("1"), protectedMain: sha("2") }).classification === "MECHANICAL_BASE_ADVANCEMENT"));
  variants.push(result("14 protected main advances during implementation", classifyProtectedMainAdvancement({ candidateBase: sha("1"), protectedMain: sha("2"), sourceSemanticsChanged: true }).classification === "SEMANTIC_INVALIDATION"));
  const markedReady = resolveLifecycle({ state: "DRAFT", event: "MARK_READY", identity: evidenceFixture() });
  variants.push(result("15 draft → ready", markedReady.ok && markedReady.state === "READY" && !markedReady.mergeAuthorityGranted));
  const staleHead = resolveLifecycle({ state: "READY", event: "MERGE", identity: evidenceFixture(), evidence: { ...evidenceFixture({ headSha: sha("9") }), reviewCurrent: true, phase1Current: true, finalSourceCurrent: true } });
  variants.push(result("16 head changes after review", !staleHead.ok && staleHead.findings.includes("MERGE_HEAD_STALE")));
  const staleReceiptRequest = evidenceFixture();
  const staleReceipt = exactEvidenceIdentity(evidenceFixture({ lifecycleGeneration: "READY-0" }));
  variants.push(result("17 stale receipt", staleReceipt.ok && staleReceipt.key !== exactEvidenceIdentity(staleReceiptRequest).key));
  const currentIdentity = exactEvidenceIdentity(evidenceFixture());
  variants.push(result("18 exact unchanged evidence reuse", canReuseEvidence({ evidence: { immutable: true, key: currentIdentity.key, identity: currentIdentity.identity }, request: evidenceFixture() })));

  const multiPage = await enumerateCompletePages({ fetchPage: async ({ page }) => page === 1 ? { items: Array(100).fill(1), complete: false, nextCursor: "2" } : { items: [2], complete: true } });
  variants.push(result("19 GitHub multi-page read", multiPage.ok && multiPage.pages === 2 && multiPage.items.length === 101));
  let transientCalls = 0;
  const transient = await boundedProviderOperation({ invoke: async () => { transientCalls += 1; if (transientCalls < 2) throw Object.assign(new Error("server"), { status: 500 }); return true; } });
  variants.push(result("20 transient GitHub 500", transient.ok && transient.attempts === 2));
  const dispatch = await boundedProviderOperation({ operation: "dispatch", invoke: async () => { throw Object.assign(new Error("Failed to queue workflow run"), { status: 500 }); } });
  variants.push(result("21 workflow dispatch temporarily unavailable", !dispatch.ok && dispatch.classification === "PROVIDER_DISPATCH_UNAVAILABLE" && dispatch.attempts === 3));
  const incomplete = await enumerateCompletePages({ fetchPage: async () => { throw Object.assign(new Error("rate limited"), { status: 429 }); } });
  variants.push(result("22 rate limit/incomplete pagination", !incomplete.ok && incomplete.classification === "PROVIDER_TRANSIENT_FAILURE"));
  const permission = await boundedProviderOperation({ invoke: async () => { throw Object.assign(new Error("permission denied"), { status: 403 }); } });
  variants.push(result("23 missing GitHub permission", !permission.ok && permission.classification === "PROVIDER_AUTHORITY_MISSING" && permission.attempts === 1));
  variants.push(result("24 genuine ruleset drift", !validateRecoveryEvent({ authority: { classification: "OWNER_AUTHORIZED_BOUNDED_ASSURANCE_RECOVERY_V2", pr: 1, head: sha("1"), tree: sha("2"), bypassedChecks: ["X"], scope: "EXACT_PR_HEAD_TREE_ONLY", expiresOn: "PR_1_MERGE" }, actualRuleset: { enforcement: "active", bypassActors: ["Owner"], temporaryOwnerBypass: true }, intendedPermanentBypassActors: ["Integration"] }).ok));
  variants.push(result("25 temporary Owner recovery + restoration", validateRecoveryEvent({ authority: { classification: "OWNER_AUTHORIZED_BOUNDED_ASSURANCE_RECOVERY_V2", pr: 1, head: sha("1"), tree: sha("2"), bypassedChecks: ["X"], scope: "EXACT_PR_HEAD_TREE_ONLY", expiresOn: "PR_1_MERGE" }, actualRuleset: { enforcement: "active", bypassActors: ["Integration"], temporaryOwnerBypass: false, temporaryRepositoryRoleBypass: false }, intendedPermanentBypassActors: ["Integration"] }).ok));
  variants.push(result("26 task with zero amendments allowed", successfulAmendment({ maximumAmendments: 0 }).ok));
  variants.push(result("27 task with one amendment allowed but zero consumed", successfulAmendment({ maximumAmendments: 1 }).ok));
  variants.push(result("28 product task with multiple normal implementation PRs", validateImplementationChain({ taskId: "synthetic-task-v2", implementations: implementationChain(), finalProtectedMain: sha("7") }).ok));
  const maintenance = validateNegativeAuthority({
    allowedPaths: ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2_PROFILE.paths,
    changedPaths: ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2_PROFILE.paths,
    authority: { product: false, provider: false, database: false, native: false, money: false, ota: false, release: false },
  });
  variants.push(result("29 assurance maintenance task repairs assurance itself", maintenance.ok && ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2_PROFILE.maximumFiles === ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2_PROFILE.paths.length));
  const terminal = terminalFixture();
  const fixedPoint = terminalSynchronizationIdempotent(terminal);
  variants.push(result("30 terminal synchronization executed twice", fixedPoint.ok && fixedPoint.firstMutation && fixedPoint.secondMutation === false));
  const amendedTerminal = terminalSynchronizationIdempotent(terminalFixture({ amended: true }));
  variants.push(result("31 consumed amendment terminal synchronization executed twice", amendedTerminal.ok && amendedTerminal.firstMutation && amendedTerminal.secondMutation === false));
  return variants;
}

function runNegativeControls() {
  const cases = [
    ["unauthorized product path", { allowedPaths: ["a"], changedPaths: ["product.ts"] }],
    ["unauthorized product authority", { authority: { product: true } }],
    ["unauthorized database mutation", { authority: { database: true } }],
    ["unauthorized provider mutation", { authority: { provider: true } }],
    ["unauthorized money authority", { authority: { money: true } }],
    ["unauthorized native mutation", { authority: { native: true } }],
    ["unauthorized build", { authority: { build: true } }],
    ["unauthorized OTA", { authority: { ota: true } }],
    ["unauthorized submission", { authority: { submission: true } }],
    ["unauthorized public release", { authority: { publicRelease: true } }],
    ["unauthorized release", { authority: { release: true } }],
    ["wildcard lease expansion", { allowedPaths: ["*"], changedPaths: ["*"] }],
    ["forged Owner evidence", { evidence: { forgedOwner: true } }],
    ["edited immutable evidence", { evidence: { editedImmutable: true } }],
    ["wrong task receipt", { evidence: { wrongTask: true } }],
    ["wrong head", { evidence: { wrongHead: true } }],
    ["wrong tree", { evidence: { wrongTree: true } }],
    ["stale review", { evidence: { staleReview: true } }],
    ["stale final-source receipt", { evidence: { staleFinalSource: true } }],
    ["hidden extra changed path", { allowedPaths: ["a"], changedPaths: ["a", "b"] }],
    ["draft merge attempt", { evidence: { draftMerge: true } }],
    ["P0", { evidence: { P0: 1 } }],
    ["P1", { evidence: { P1: 1 } }],
    ["unknown security finding", { evidence: { unknownSecurity: true } }],
    ["RLS regression", { evidence: { rlsRegression: true } }],
    ["entitlement fail-open", { evidence: { entitlementFailOpen: true } }],
    ["unauthorized ruleset bypass", { evidence: { rulesetBypass: true } }],
    ["persistent Owner bypass", { evidence: { persistentOwnerBypass: true } }],
    ["fabricated provider evidence", { evidence: { fabricatedProvider: true } }],
  ];
  return cases.map(([name, input]) => result(name, validateNegativeAuthority(input).ok === false));
}

export async function runControlPlaneQualification() {
  const variants = await runAdversarialVariants();
  const negativeControls = runNegativeControls();
  const permissionsComplete = ["repositoryMetadata", "pullRequest", "issueComments", "pullCommits", "workflowRuns", "checks", "rulesets", "appReadback"]
    .every((key) => Boolean(GITHUB_AUTHORITY_INVENTORY_V2[key]?.permission));
  const terminal = terminalFixture();
  const terminalProjection = projectTerminalSynchronization(terminal);
  return {
    schemaVersion: 2,
    contract: "ASSURANCE_CONTROL_PLANE_END_TO_END_QUALIFICATION_V2",
    ok: variants.every(({ ok }) => ok) && negativeControls.every(({ ok }) => ok) && permissionsComplete && terminalProjection.ok,
    variants,
    negativeControls,
    metrics: {
      adversarialVariants: variants.length,
      adversarialPassed: variants.filter(({ ok }) => ok).length,
      negativeControls: negativeControls.length,
      negativeControlsPassed: negativeControls.filter(({ ok }) => ok).length,
      githubAuthorityEndpoints: Object.keys(GITHUB_AUTHORITY_INVENTORY_V2).length,
      terminalSynchronizationSecondRunMutations: 0,
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const qualification = await runControlPlaneQualification();
  process.stdout.write(`${JSON.stringify(qualification)}\n`);
  process.exitCode = qualification.ok ? 0 : 1;
}
