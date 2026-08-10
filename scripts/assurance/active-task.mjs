#!/usr/bin/env node
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, emit, isValidGitBranchName, lateReviewAllowedOwners, lateReviewSuccessorCorrectionOwner, readJson, redact, stableJson, validateProofTierStatuses } from "./lib.mjs";
import { git, packet, privateArtifactDirectory, sha256, sha40, strictOptions, writePrivateFile } from "./efficiency-lib.mjs";
import { unresolvedLateReviewSentinels } from "./late-review-sentinel.mjs";

const laneIds = [
  "architecture-state",
  "security-authority",
  "proof-equivalence-native-provider",
  "privacy-rollback-determinism"
];

function displayFeatureCandidates(truth, registry) {
  const active = truth?.assuranceProgram?.active ?? "";
  return (registry?.features ?? [])
    .map(({ featureId }) => featureId)
    .filter((featureId) => typeof featureId === "string" && active.includes(featureId));
}

const structuredBindingFields = [
  "schemaVersion",
  "featureId",
  "implementationPr",
  "implementationBranch",
  "implementationBindingId",
  "immutableSourceHead",
  "immutableSourceTree",
  "currentImplementationHead",
  "currentImplementationTree",
  "phase",
  "executionState",
  "requiredFreshnessClasses",
  "requiredFreshnessClaims",
  "proofTiersUnderEvaluation",
  "proofTierStatuses",
  "proofTierApplicabilityHash",
  "ownerBootstrapAuthorization"
];
const requiredStructuredBindingFields = structuredBindingFields.filter((field) => !["ownerBootstrapAuthorization", "proofTierStatuses", "proofTierApplicabilityHash"].includes(field));
const freshnessClasses = new Set(["REPOSITORY_SOURCE", "PROVIDER_CRITICAL", "SIGNED_ARTIFACT", "INSTALLED_DEVICE", "PHYSICAL_DEVICE", "PUBLIC_CANARY"]);
const freshnessPlatforms = new Set(["ANDROID", "IOS", "NONE"]);
const activeImplementationStates = new Set(["open", "open-draft-current"]);
const proofTiers = new Set(["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"]);
const bootstrapActiveTaskRegistry = [{
  featureId: "assurance-efficiency-e0",
  implementationPr: 201,
  implementationBranch: "codex/assurance-active-task-and-claim-freshness-a1",
  implementationBindingId: "assurance-active-task-claim-freshness-a1-pr201-v1",
  executionState: "ASSURANCE_CONTROL_A1"
}, {
  featureId: "assurance-efficiency-e0",
  implementationPr: 205,
  implementationBranch: "codex/assurance-active-task-and-claim-freshness-a1",
  implementationBindingId: "assurance-late-review-owner-registry-bootstrap-pr205-v1",
  executionState: "ASSURANCE_CONTROL_A1_LATE_REVIEW_REGISTRY_BOOTSTRAP"
}, {
  featureId: "codex-security-scan-reliability-s0",
  implementationPr: 206,
  implementationBranch: "codex/assurance-codex-security-scan-reliability-s0",
  implementationBindingId: "assurance-codex-security-scan-reliability-s0-pr206-v1",
  executionState: "CODEX_SECURITY_SCAN_RELIABILITY_S0_BOOTSTRAP"
}];
const ownerBootstrapRepository = "Chillywood2025/chillywood-mobile";
const ownerBootstrapAuthor = "Chillywood2025";
const ownerBootstrapMarker = "<!-- chillywood-assurance-owner-task-binding-v1 -->";

export function ownerBootstrapBindingSubject(binding) {
  return Object.fromEntries(structuredBindingFields
    .filter((field) => field !== "ownerBootstrapAuthorization")
    .map((field) => [field, structuredClone(binding?.[field])]));
}

export function ownerBootstrapAuthorizationCommentBody(binding) {
  const subject = ownerBootstrapBindingSubject(binding);
  const payload = {
    schemaVersion: 1,
    repository: ownerBootstrapRepository,
    prNumber: binding?.implementationPr,
    subject,
    subjectHash: sha256(stableJson(subject))
  };
  return `${ownerBootstrapMarker}\n${stableJson(payload)}`;
}

function readOwnerBootstrapAuthorizationObservation(authorization) {
  if (!Number.isInteger(authorization?.commentId) || authorization.commentId < 1) return null;
  const response = spawnSync("gh", [
    "api",
    `repos/${ownerBootstrapRepository}/issues/comments/${authorization.commentId}`
  ], { cwd: ROOT, encoding: "utf8", shell: false });
  if (response.status !== 0) return null;
  try {
    const comment = JSON.parse(response.stdout);
    return {
      commentId: comment.id,
      author: comment.user?.login,
      authorAssociation: comment.author_association,
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      issueUrl: comment.issue_url
    };
  } catch { return null; }
}

export function verifyOwnerBootstrapAuthorization(binding, observation) {
  const authorization = binding?.ownerBootstrapAuthorization;
  const expectedBody = ownerBootstrapAuthorizationCommentBody(binding);
  const expectedSubjectHash = sha256(stableJson(ownerBootstrapBindingSubject(binding)));
  return authorization?.schemaVersion === 1
    && authorization.repository === ownerBootstrapRepository
    && authorization.prNumber === binding?.implementationPr
    && Number.isInteger(authorization.commentId)
    && authorization.commentId > 0
    && authorization.author === ownerBootstrapAuthor
    && authorization.authorAssociation === "OWNER"
    && typeof authorization.createdAt === "string"
    && authorization.createdAt === authorization.updatedAt
    && authorization.bodySha256 === sha256(expectedBody)
    && authorization.subjectHash === expectedSubjectHash
    && observation?.commentId === authorization.commentId
    && observation.author === authorization.author
    && observation.authorAssociation === authorization.authorAssociation
    && observation.createdAt === authorization.createdAt
    && observation.updatedAt === authorization.updatedAt
    && observation.issueUrl === `https://api.github.com/repos/${ownerBootstrapRepository}/issues/${binding.implementationPr}`
    && observation.body === expectedBody
    && sha256(observation.body) === authorization.bodySha256;
}

function sameBinding(left, right) {
  return structuredBindingFields.every((field) => JSON.stringify(left?.[field]) === JSON.stringify(right?.[field]));
}

function structuredBindingAuthority(truth, facts) {
  let protectedMainTruth = facts.protectedMainTruth;
  if (!protectedMainTruth) {
    try { protectedMainTruth = JSON.parse(git(["show", "origin/main:config/assurance/current-truth-v1.json"])); } catch { return null; }
  }
  if (sameBinding(truth?.activeTaskBinding, protectedMainTruth?.activeTaskBinding)) return "PROTECTED_MAIN_CURRENT_TRUTH";
  const binding = truth?.activeTaskBinding;
  const bootstrapMatches = bootstrapActiveTaskRegistry.filter((entry) => Object.entries(entry)
    .every(([field, expected]) => binding?.[field] === expected));
  if (bootstrapMatches.length !== 1) return null;
  const observation = facts.ownerBootstrapAuthorizationObservation
    ?? readOwnerBootstrapAuthorizationObservation(binding?.ownerBootstrapAuthorization);
  return verifyOwnerBootstrapAuthorization(binding, observation) ? "OWNER_BOOTSTRAP_GITHUB_COMMENT" : null;
}

export function validateStructuredBinding(value, gateCatalog, registry, openImplementationPrs, latestMergedImplementationPr) {
  const findings = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["ACTIVE_TASK_BINDING_MALFORMED"];
  if (requiredStructuredBindingFields.some((field) => !Object.hasOwn(value, field))) findings.push("ACTIVE_TASK_BINDING_MALFORMED");
  const requiredFreshnessClaimsValid = Array.isArray(value.requiredFreshnessClaims)
    && value.requiredFreshnessClaims.length > 0
    && value.requiredFreshnessClaims.every((requirement) => requirement
      && typeof requirement === "object"
      && !Array.isArray(requirement)
      && freshnessClasses.has(requirement.freshnessClass)
      && freshnessPlatforms.has(requirement.platform)
      && typeof requirement.evidenceSourceId === "string"
      && requirement.evidenceSourceId.length > 0
      && typeof requirement.authorityAllowed === "string"
      && Array.isArray(requirement.requiredFacts)
      && requirement.requiredFacts.length > 0
      && requirement.requiredFacts.every((fact) => typeof fact === "string" && fact.length > 0)
      && (requirement.freshnessClass !== "REPOSITORY_SOURCE"
        || (sha40(requirement.subjectHead) && sha40(requirement.subjectTree)
          && requirement.subjectHead === value.immutableSourceHead
          && requirement.subjectTree === value.immutableSourceTree)));
  const declaredFreshnessClasses = requiredFreshnessClaimsValid
    ? new Set(value.requiredFreshnessClaims.map(({ freshnessClass }) => freshnessClass))
    : new Set();
  const tierFreshness = {
    T4_NATIVE_PROVIDER: ["PROVIDER_CRITICAL"],
    T5_SIGNED_ARTIFACT: ["SIGNED_ARTIFACT"],
    T6_INSTALLED_PHYSICAL: ["INSTALLED_DEVICE", "PHYSICAL_DEVICE"],
    T7_PUBLIC_CANARY: ["PUBLIC_CANARY"]
  };
  const proofFreshnessAligned = Object.entries(tierFreshness).every(([tier, classes]) => {
    const tierActive = Array.isArray(value.proofTiersUnderEvaluation) && value.proofTiersUnderEvaluation.includes(tier);
    return tierActive
      ? classes.every((freshnessClass) => declaredFreshnessClasses.has(freshnessClass))
      : classes.every((freshnessClass) => !declaredFreshnessClasses.has(freshnessClass));
  });
  const bootstrapAuthorizationValid = value.ownerBootstrapAuthorization === undefined
    || (value.ownerBootstrapAuthorization
      && typeof value.ownerBootstrapAuthorization === "object"
      && !Array.isArray(value.ownerBootstrapAuthorization)
      && value.ownerBootstrapAuthorization.schemaVersion === 1
      && value.ownerBootstrapAuthorization.repository === ownerBootstrapRepository
      && value.ownerBootstrapAuthorization.prNumber === value.implementationPr
      && Number.isInteger(value.ownerBootstrapAuthorization.commentId)
      && value.ownerBootstrapAuthorization.commentId > 0
      && value.ownerBootstrapAuthorization.author === ownerBootstrapAuthor
      && value.ownerBootstrapAuthorization.authorAssociation === "OWNER"
      && typeof value.ownerBootstrapAuthorization.createdAt === "string"
      && value.ownerBootstrapAuthorization.createdAt === value.ownerBootstrapAuthorization.updatedAt
      && /^[0-9a-f]{64}$/u.test(value.ownerBootstrapAuthorization.bodySha256 ?? "")
      && /^[0-9a-f]{64}$/u.test(value.ownerBootstrapAuthorization.subjectHash ?? ""));
  if (value.schemaVersion !== 1
    || typeof value.featureId !== "string"
    || !Number.isInteger(value.implementationPr)
    || value.implementationPr < 1
    || !isValidGitBranchName(value.implementationBranch)
    || typeof value.implementationBindingId !== "string"
    || !value.implementationBindingId
    || !sha40(value.immutableSourceHead)
    || !sha40(value.immutableSourceTree)
    || !sha40(value.currentImplementationHead)
    || !sha40(value.currentImplementationTree)
    || !["IMPLEMENTATION", "FORMAL_REVIEW", "FINAL_CI", "MERGE_ELIGIBLE", "COMPLETE"].includes(value.phase)
    || typeof value.executionState !== "string"
    || !value.executionState
    || !Array.isArray(value.requiredFreshnessClasses)
    || value.requiredFreshnessClasses.length === 0
    || new Set(value.requiredFreshnessClasses).size !== value.requiredFreshnessClasses.length
    || value.requiredFreshnessClasses.some((entry) => !freshnessClasses.has(entry))
    || !requiredFreshnessClaimsValid
    || value.requiredFreshnessClasses.length !== declaredFreshnessClasses.size
    || value.requiredFreshnessClasses.some((entry) => !declaredFreshnessClasses.has(entry))
    || !Array.isArray(value.proofTiersUnderEvaluation)
    || value.proofTiersUnderEvaluation.length === 0
    || new Set(value.proofTiersUnderEvaluation).size !== value.proofTiersUnderEvaluation.length
    || value.proofTiersUnderEvaluation.some((entry) => !proofTiers.has(entry))
    || !proofFreshnessAligned
    || !bootstrapAuthorizationValid) findings.push("ACTIVE_TASK_BINDING_MALFORMED");
  if (validateProofTierStatuses(value, gateCatalog, registry).length) findings.push("ACTIVE_TASK_BINDING_MALFORMED");
  if (value.phase === "COMPLETE") {
    if (!Array.isArray(openImplementationPrs)) findings.push("IMPLEMENTATION_INVENTORY_MALFORMED");
    else if (openImplementationPrs.length) findings.push("COMPLETED_IMPLEMENTATION_COMPETING_OPEN_IMPLEMENTATION");
    if (latestMergedImplementationPr?.state !== "merged"
      || latestMergedImplementationPr.number !== value.implementationPr
      || latestMergedImplementationPr.head !== value.currentImplementationHead
      || !sha40(latestMergedImplementationPr.mergeSha)) {
      findings.push("COMPLETED_IMPLEMENTATION_MERGE_IDENTITY_MISMATCH");
    }
  }
  return [...new Set(findings)].sort();
}

function resolveFeature(truth, facts, registry) {
  if (Object.hasOwn(truth ?? {}, "activeTaskBinding")) {
    const binding = truth.activeTaskBinding;
    const findings = validateStructuredBinding(binding, facts.gateCatalog ?? readJson("config/assurance/gate-catalog-v1.json"), registry, truth.openImplementationPrs, truth.latestMergedImplementationPr);
    if (findings.length) return { ok: false, findings };
    if (binding.phase === "COMPLETE" && unresolvedLateReviewSentinels(truth).some((sentinel) => {
      const allowedOwners = lateReviewAllowedOwners(sentinel);
      return lateReviewSuccessorCorrectionOwner(sentinel) === binding.implementationBranch
        || !allowedOwners.includes(binding.implementationBranch);
    })) {
      return { ok: false, findings: ["LATE_REVIEW_COMPLETION_CLAIM_BLOCKED"] };
    }
    const authority = structuredBindingAuthority(truth, facts);
    if (!authority) return { ok: false, findings: ["ACTIVE_TASK_AUTHORITY_UNVERIFIED"] };
    if (binding.phase === "COMPLETE") {
      return { ok: false, findings: ["ACTIVE_TASK_NONE"] };
    }
    const displayCandidates = displayFeatureCandidates(truth, registry);
    if (displayCandidates.length > 1 || (displayCandidates.length === 1 && displayCandidates[0] !== binding.featureId)) {
      return { ok: false, findings: ["ACTIVE_TASK_STRUCTURED_DISPLAY_CONFLICT"] };
    }
    if (facts.featureId && facts.featureId !== binding.featureId) return { ok: false, findings: ["FEATURE_OVERRIDE_CONFLICT"] };
    return { ok: true, binding, featureId: binding.featureId, source: "structured", authority };
  }

  const open = truth?.openImplementationPrs;
  if (!Array.isArray(open)) return { ok: false, findings: ["IMPLEMENTATION_INVENTORY_MALFORMED"] };
  if (open.some((entry) => !activeImplementationStates.has(entry?.state))) {
    return { ok: false, findings: ["IMPLEMENTATION_INVENTORY_STATE_MALFORMED"] };
  }
  if (open.length === 0) return { ok: false, findings: ["ACTIVE_TASK_NONE"] };
  if (open.length > 1) return { ok: false, findings: ["MULTIPLE_ACTIVE_IMPLEMENTATIONS"] };
  const featureId = open[0]?.featureId;
  if (typeof featureId !== "string" || !featureId) return { ok: false, findings: ["ACTIVE_TASK_AMBIGUOUS"] };
  if (facts.featureId && facts.featureId !== featureId) return { ok: false, findings: ["FEATURE_OVERRIDE_CONFLICT"] };
  return { ok: true, binding: null, featureId, source: "legacy" };
}

function affectedSymbols(files) {
  const symbols = [];
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/u.test(file)) continue;
    let source;
    try {
      const resolved = path.resolve(ROOT, file);
      if (!resolved.startsWith(`${ROOT}${path.sep}`)) continue;
      const stat = fs.lstatSync(resolved);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      source = fs.readFileSync(resolved, "utf8");
    } catch { continue; }
    for (const match of source.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gu)) {
      symbols.push(`${file}#${match[1]}`);
    }
  }
  return [...new Set(symbols)].sort();
}

function inheritedBlockers(truth) {
  const blockers = (truth?.blockedProviders ?? []).map(({ provider, scope, status }) => ({ provider, scope, status }));
  for (const sentinel of unresolvedLateReviewSentinels(truth)) {
    blockers.push({
      id: sentinel.classification,
      pr: sentinel.prNumber,
      reviewedSha: sentinel.reviewedSha,
      unresolvedFindings: (sentinel.findings ?? []).filter(({ disposition }) => disposition !== "RESOLVED").length,
      successorCorrectionOwner: lateReviewSuccessorCorrectionOwner(sentinel),
      blocks: sentinel.blocks
    });
  }
  const d2b = truth?.d2bCurrentTruthBinding;
  if (d2b?.proof?.runtimeBackupRestore?.startsWith("BLOCKED_")) {
    blockers.push({ id: d2b.proof.runtimeBackupRestore, owner: d2b.proof.runtimeRestoreProofOwner });
  }
  for (const [tier, status] of Object.entries(d2b?.proofTiers ?? {})) {
    if (/PARTIAL|MISSING|BLOCKED/iu.test(status)) blockers.push({ tier, status });
  }
  for (const claim of truth?.freshnessClaims ?? []) {
    if (claim?.status !== "CURRENT") blockers.push({
      id: claim?.id ?? "FRESHNESS_CLAIM_BLOCKED",
      freshnessClass: claim?.freshnessClass ?? null,
      status: claim?.status ?? "BLOCKED_INTERNAL",
      expiresAt: claim?.expiresAt ?? null
    });
  }
  return blockers;
}

function safeImplementationGit(argv, fallback = null) {
  try { return git(argv); } catch { return fallback; }
}

function sourceIsAncestor(sourceHead, currentHead) {
  try {
    git(["merge-base", "--is-ancestor", sourceHead, currentHead]);
    return true;
  } catch { return false; }
}

function resolveStructuredImplementation(truth, identity, facts, binding) {
  const findings = [];
  const open = truth?.openImplementationPrs ?? [];
  if (!Array.isArray(open)) return { ok: false, findings: ["IMPLEMENTATION_INVENTORY_MALFORMED"] };
  const matches = open.filter((entry) => entry?.number === binding.implementationPr && entry?.branch === binding.implementationBranch);
  const acceptedSynchronization = facts.acceptedBaseSynchronizations?.[binding.implementationPr];
  const synchronizedIdentityAccepted = acceptedSynchronization?.ok === true
    && ["BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH", "CURRENT_TRUTH_BINDING_COMMIT"].includes(acceptedSynchronization.classification)
    && acceptedSynchronization.sourceHead === binding.currentImplementationHead
    && sha40(acceptedSynchronization.synchronizedHead)
    && sha40(acceptedSynchronization.synchronizedTree)
    && acceptedSynchronization.synchronizedHead === identity.head
    && acceptedSynchronization.synchronizedTree === identity.tree
    && acceptedSynchronization.currentMain === identity.originMainHead;
  const effectiveHead = synchronizedIdentityAccepted ? acceptedSynchronization.synchronizedHead : binding.currentImplementationHead;
  const effectiveTree = synchronizedIdentityAccepted ? acceptedSynchronization.synchronizedTree : binding.currentImplementationTree;
  const activePhase = ["IMPLEMENTATION", "FORMAL_REVIEW", "FINAL_CI", "MERGE_ELIGIBLE"].includes(binding.phase);
  if (activePhase) {
    if (open.length > 1) findings.push("MULTIPLE_ACTIVE_IMPLEMENTATIONS");
    if (matches.length !== 1) findings.push("ACTIVE_IMPLEMENTATION_OWNERSHIP_MISMATCH");
    if (matches[0]?.head !== binding.currentImplementationHead) findings.push("ACTIVE_IMPLEMENTATION_HEAD_MISMATCH");
    if (!activeImplementationStates.has(matches[0]?.state)) findings.push("ACTIVE_IMPLEMENTATION_STATE_MISMATCH");
    if (identity.branch !== binding.implementationBranch) findings.push("ACTIVE_IMPLEMENTATION_LOCAL_BRANCH_MISMATCH");
    if (identity.head !== effectiveHead) findings.push("ACTIVE_IMPLEMENTATION_LOCAL_HEAD_MISMATCH");
    if (identity.tree !== effectiveTree) findings.push("ACTIVE_IMPLEMENTATION_LOCAL_TREE_MISMATCH");
  } else findings.push("ACTIVE_TASK_NONE");

  const observed = facts.implementationObservations ?? {
    remoteHead: safeImplementationGit(["show-ref", "--verify", "--hash", `refs/remotes/origin/${binding.implementationBranch}`]),
    immutableTree: safeImplementationGit(["rev-parse", `${binding.immutableSourceHead}^{tree}`]),
    currentTree: safeImplementationGit(["rev-parse", `${effectiveHead}^{tree}`]),
    immutableSourceIsAncestor: sourceIsAncestor(binding.immutableSourceHead, effectiveHead),
    providerPrHead: facts.providerPrHead ?? null
  };
  if (observed.remoteHead !== effectiveHead) findings.push("ACTIVE_IMPLEMENTATION_REMOTE_HEAD_MISMATCH");
  if (observed.immutableTree !== binding.immutableSourceTree) findings.push("ACTIVE_IMPLEMENTATION_IMMUTABLE_TREE_MISMATCH");
  if (observed.currentTree !== effectiveTree) findings.push("ACTIVE_IMPLEMENTATION_CURRENT_TREE_MISMATCH");
  if (observed.immutableSourceIsAncestor !== true) findings.push("ACTIVE_IMPLEMENTATION_IMMUTABLE_ANCESTRY_MISMATCH");
  if (observed.providerPrHead !== null && observed.providerPrHead !== undefined && observed.providerPrHead !== effectiveHead) {
    findings.push("ACTIVE_IMPLEMENTATION_PROVIDER_HEAD_MISMATCH");
  }
  if (findings.length) return { ok: false, findings: [...new Set(findings)].sort() };
  return {
    ok: true,
    value: {
      pr: binding.implementationPr,
      branch: binding.implementationBranch,
      state: binding.phase,
      implementationBindingId: binding.implementationBindingId,
      immutableSourceHead: binding.immutableSourceHead,
      immutableSourceTree: binding.immutableSourceTree,
      currentSynchronizedHead: effectiveHead,
      currentSynchronizedTree: effectiveTree,
      immutableSource: { head: binding.immutableSourceHead, tree: binding.immutableSourceTree },
      currentSynchronizedSource: { head: effectiveHead, tree: effectiveTree }
    }
  };
}

function resolveImplementation(truth, identity, facts, resolution) {
  if (resolution.binding) return resolveStructuredImplementation(truth, identity, facts, resolution.binding);
  const open = truth?.openImplementationPrs ?? [];
  if (!Array.isArray(open)) return { ok: false, findings: ["IMPLEMENTATION_INVENTORY_MALFORMED"] };
  if (open.length !== 1) return { ok: false, findings: [open.length > 1 ? "MULTIPLE_ACTIVE_IMPLEMENTATIONS" : "ACTIVE_TASK_NONE"] };
  const owner = open[0];
  const findings = [];
  if (!Number.isInteger(owner.number) || owner.number < 1 || !isValidGitBranchName(owner.branch) || !sha40(owner.head)) {
    findings.push("ACTIVE_IMPLEMENTATION_OWNER_MALFORMED");
  }
  if (!activeImplementationStates.has(owner.state)) findings.push("IMPLEMENTATION_INVENTORY_STATE_MALFORMED");
  if (owner.branch !== identity.branch) findings.push("ACTIVE_IMPLEMENTATION_BRANCH_MISMATCH");
  if (owner.head !== identity.head) findings.push("ACTIVE_IMPLEMENTATION_LOCAL_HEAD_MISMATCH");
  const observed = facts.legacyImplementationObservations ?? facts.implementationObservations ?? {
    remoteHead: safeImplementationGit(["show-ref", "--verify", "--hash", `refs/remotes/origin/${owner.branch}`]),
    currentTree: safeImplementationGit(["rev-parse", `${owner.head}^{tree}`])
  };
  if (observed.remoteHead !== owner.head) findings.push("ACTIVE_IMPLEMENTATION_REMOTE_HEAD_MISMATCH");
  if (!sha40(observed.currentTree) || observed.currentTree !== identity.tree) findings.push("ACTIVE_IMPLEMENTATION_CURRENT_TREE_MISMATCH");
  if (findings.length) return { ok: false, findings: [...new Set(findings)].sort() };
  return {
    ok: true,
    value: {
      pr: owner.number,
      branch: owner.branch,
      state: owner.state,
      immutableSourceHead: owner.head,
      immutableSourceTree: observed.currentTree,
      currentSynchronizedHead: owner.head,
      currentSynchronizedTree: observed.currentTree,
      immutableSource: { head: owner.head, tree: observed.currentTree },
      currentSynchronizedSource: { head: owner.head, tree: observed.currentTree }
    }
  };
}

export function activeTask(facts = {}) {
  const truth = facts.currentTruth ?? readJson("config/assurance/current-truth-v1.json");
  const checked = facts.truthCheck ?? (() => {
    const run = spawnSync(process.execPath, ["scripts/assurance/current-truth.mjs"], {
      cwd: ROOT, encoding: "utf8", shell: false
    });
    try {
      const result = JSON.parse(run.stdout);
      return { ...result, ok: run.status === 0 && result.ok === true };
    } catch { return { ok: false }; }
  })();
  if (!checked.ok) return { ok: false, findings: ["CURRENT_TRUTH_STALE_OR_UNPARSEABLE"] };

  const registry = facts.registry ?? readJson("config/assurance/feature-registry-v1.json");
  const resolution = resolveFeature(truth, facts, registry);
  if (!resolution.ok) return { ok: false, findings: resolution.findings };
  const matches = registry.features?.filter(({ featureId }) => featureId === resolution.featureId) ?? [];
  if (matches.length !== 1) return { ok: false, findings: ["ACTIVE_FEATURE_UNRESOLVED"] };
  const feature = facts.feature ?? matches[0];

  let identity = facts.identity;
  try {
    if (!identity) {
      if (git(["status", "--porcelain"])) return { ok: false, findings: ["WORKING_TREE_NOT_IMMUTABLE"] };
      const base = "origin/main";
      const baseHead = git(["rev-parse", "--verify", `${base}^{commit}`]);
      const changedFiles = git(["diff", "--no-ext-diff", "--name-only", `${baseHead}..HEAD`]).split("\n").filter(Boolean).sort();
      identity = {
        branch: git(["branch", "--show-current"]) || "DETACHED",
        head: git(["rev-parse", "HEAD"]),
        tree: git(["rev-parse", "HEAD^{tree}"]),
        originMainHead: git(["rev-parse", "origin/main^{commit}"]),
        originMainTree: git(["rev-parse", "origin/main^{tree}"]),
        baseHead,
        baseTree: git(["rev-parse", `${baseHead}^{tree}`]),
        diffHash: sha256(git(["diff", "--no-ext-diff", "--binary", `${baseHead}..HEAD`])),
        pathHash: sha256(changedFiles),
        changedFiles
      };
    }
  } catch { return { ok: false, findings: ["SOURCE_IDENTITY_UNRESOLVED"] }; }

  const lateReviewBlocksCurrentBranch = unresolvedLateReviewSentinels(truth).some((sentinel) => {
    const allowedOwners = lateReviewAllowedOwners(sentinel);
    return !allowedOwners.includes(identity.branch);
  });
  if (lateReviewBlocksCurrentBranch) return { ok: false, findings: ["LATE_REVIEW_SUCCESSOR_BLOCKED"] };

  const implementation = resolveImplementation(truth, identity, {
    ...facts,
    acceptedBaseSynchronizations: facts.acceptedBaseSynchronizations ?? checked.headBindings?.acceptedBaseSynchronizations ?? {}
  }, resolution);
  if (!implementation.ok) return { ok: false, findings: implementation.findings };
  const allowlist = facts.allowlist ?? readJson("config/assurance/command-allowlist-v1.json");
  const required = feature.commands ?? [];
  const rules = allowlist.commands ?? [];
  const requiredRules = required.map((contractCommand) => {
    const matches = rules.filter((rule) => rule.contractCommand === contractCommand);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
    return allowlist.deferredContractCommands?.includes(contractCommand)
      ? { id: `deferred:${contractCommand.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`, file: null, args: [], resultContract: { type: "deferred-task-contract", executable: false }, contractCommand }
      : null;
  });
  if (requiredRules.some((rule) => !rule)) return { ok: false, findings: ["MANDATORY_COMMAND_DROPPED"] };
  const commands = requiredRules.map((rule) => ({ id: rule.id, contractCommand: rule.contractCommand, argv: rule.file ? [rule.file, ...rule.args] : null, resultContract: rule.resultContract }));
  const catalog = facts.defectCatalog ?? readJson("config/assurance/escaped-defect-catalog-v1.json").defects;
  const defects = catalog
    .filter(({ id }) => feature.knownDefectTags?.includes(id))
    .map(({ id, affectedDomains, requiredProofTier, blocks }) => ({ id, affectedDomains, requiredProofTier, blocks }));
  if (defects.length !== feature.knownDefectTags.length) return { ok: false, findings: ["HISTORICAL_DEFECT_UNRESOLVED"] };
  const changedFiles = identity.changedFiles ?? [];
  const directFiles = changedFiles.length ? changedFiles : (facts.directlyAffectedFiles ?? []);
  const directDomains = [...new Set([...(feature.components ?? []), ...(feature.platformScope ?? []), ...(feature.providers ?? [])])];
  const transitiveDomains = [...new Set(defects.flatMap(({ affectedDomains }) => affectedDomains ?? []))];
  const contract = facts.contract ?? readJson("config/assurance/efficiency-e0-v1.json");
  const built = packet({
    currentTruth: truth,
    identity,
    implementation: implementation.value,
    featureId: feature.featureId,
    directlyAffectedFiles: directFiles,
    directlyAffectedSymbols: facts.directlyAffectedSymbols ?? affectedSymbols(directFiles),
    directDomains,
    transitiveDomains,
    defects,
    proofTiers: feature.proofTierApplicability,
    requiredCommandIds: requiredRules.map(({ id }) => id),
    commands,
    blockers: facts.blockers ?? inheritedBlockers(truth),
    stopConditions: facts.stopConditions ?? { P0: "STOP", P1: "STOP" },
    lanes: contract.reviewLanes ?? laneIds,
    ownerBounds: {
      currentTruthAuthoritative: true,
      owners: feature.ownerSystems,
      level3And4Authority: "OWNER_ONLY",
      prohibitedScope: contract.prohibitedScope
    }
  });
  if (!built.ok) return built;
  const safe = redact(built.packet);
  if (stableJson(safe) !== stableJson(built.packet)) return { ok: false, findings: ["PACKET_SECRET_OR_PRIVATE_VALUE"] };
  return { ok: true, packet: safe };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = strictOptions(process.argv.slice(2), { "--feature": "featureId" });
  const result = parsed.ok ? activeTask(parsed.values) : { ok: false, findings: parsed.findings };
  if (result.ok) {
    const text = stableJson(result.packet);
    const packetSha256 = sha256(text);
    const root = privateArtifactDirectory("packets");
    const artifactLocation = writePrivateFile(root, `${packetSha256}.json`, `${text}\n`);
    emit("assurance:active-task", true, {
      packetSha256,
      packetBytes: Buffer.byteLength(text),
      canonicalCurrentTruthBytes: result.packet.authority.bytes,
      excludedContextBytes: Math.max(0, result.packet.authority.bytes - Buffer.byteLength(text)),
      artifactLocation,
      packet: result.packet
    });
  } else emit("assurance:active-task", false, { findings: result.findings });
}
