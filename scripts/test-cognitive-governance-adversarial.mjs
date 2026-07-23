#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "governance-red-team-"));
const compile = (relative, output, replacements = []) => {
  let source = fs.readFileSync(path.join(root, relative), "utf8");
  for (const [from, to] of replacements) source = source.replace(from, to);
  fs.writeFileSync(
    path.join(temporaryRoot, output),
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: relative,
    }).outputText,
    { mode: 0o600 },
  );
};
compile("_lib/cognitivePlatformFoundation.ts", "foundation.mjs");
compile("_lib/cognitiveCollectiveGovernance.ts", "governance.mjs", [
  ['from "./cognitivePlatformFoundation"', 'from "./foundation.mjs"'],
]);
compile("_lib/cognitivePolicyEngine.ts", "policy.mjs", [
  ['from "./cognitivePlatformFoundation"', 'from "./foundation.mjs"'],
]);
const governance = await import(`file://${path.join(temporaryRoot, "governance.mjs")}`);
const policy = await import(`file://${path.join(temporaryRoot, "policy.mjs")}`);
const networkPolicy = JSON.parse(
  fs.readFileSync(path.join(root, "config/intelligence/cognitive-network-policy.json"), "utf8"),
);

const hash = governance.canonicalGovernanceHash;
const commit = "a".repeat(40);
const now = new Date("2026-07-23T12:00:00.000Z");
const roles = [
  "security_privacy",
  "reliability_release",
  "product_user_experience",
  "adversarial_red_team",
];
const votes = roles.map((role, index) => ({
  voteId: `vote-${index + 100}`,
  decisionId: "decision-red-team",
  role,
  voterIdentityHash: hash(`identity:${role}`),
  optionId: "minimal-repair",
  vote: "support",
  assessmentHash: hash(`assessment:${role}`),
  createdAt: now.toISOString(),
}));
const quorum = governance.evaluateGovernanceDecision({
  decisionId: "decision-red-team",
  optionId: "minimal-repair",
  risk: "medium",
  votes,
  vetoes: [],
  dissents: [],
});
const manifestInput = {
  decisionId: "decision-red-team",
  taskId: "task-red-team",
  sourceCommit: commit,
  architectureGraphDigest: hash("graph"),
  evidenceManifestHash: hash("evidence"),
  researchClaimHashes: [hash("claim")],
  proposalHashes: [hash("proposal")],
  selectedOptionId: "minimal-repair",
  rejectedOptionIds: ["no-action"],
  councilRoles: roles,
  independenceAttestationHashes: roles.map((role) => hash(role)),
  voteManifestHash: hash("votes"),
  vetoManifestHash: hash("vetoes"),
  dissentManifestHash: hash("dissent"),
  stakeholderImpactHash: hash("impact"),
  risk: "medium",
  requiredTestsHash: hash("tests"),
  capabilityScopeHash: hash("scope"),
  budgetHash: hash("budget"),
  maximumExecutions: 1,
  rollbackHash: hash("rollback"),
  expiresAt: "2026-07-24T12:00:00.000Z",
  ownerApprovalVersionId: null,
  externalConfirmationReferenceHash: null,
};
const manifest = governance.createDecisionManifest(manifestInput, quorum);
const approval = {
  approvalVersionId: "approval-red-team",
  priorApprovalVersionId: null,
  taskId: "task-red-team",
  objectiveHash: hash("objective"),
  projectId: "project-red-team",
  repository: "Chillywood2025/chillywood-mobile",
  branch: "codex/red-team",
  platform: "shared",
  environment: "preview",
  provider: "repository",
  targetResourceHashes: [hash("target")],
  allowedActionTypes: ["repository_apply_patch"],
  scopeHash: hash("scope"),
  maximumRisk: "medium",
  maximumCost: 1,
  maximumCalls: 2,
  maximumBytes: 1000,
  maximumExecutions: 1,
  requiredTestsHash: hash("tests"),
  evaluatorRequired: true,
  rollbackHash: hash("rollback"),
  decisionManifestHash: manifest.decisionHash,
  sourceCommit: commit,
  evidenceFreshnessHash: hash("fresh"),
  startsAt: "2026-07-23T12:00:00.000Z",
  expiresAt: "2026-07-24T12:00:00.000Z",
  status: "active",
  ownerIdentityHash: hash("owner"),
};
const authorize = (overrides = {}) =>
  new governance.DecisionCapabilityAuthority().authorize({
    authorizationId: "authorization-red-team",
    manifest,
    evaluation: quorum,
    approval,
    currentSourceCommit: commit,
    currentGraphDigest: hash("graph"),
    expectedOwnerIdentityHash: hash("owner"),
    now,
    emergencyStop: false,
    ...overrides,
  });

const results = [];
const attack = async (id, operation) => {
  await operation();
  results.push(id);
};

await attack("GOV-01-duplicate-vote", () => {
  const result = governance.evaluateGovernanceDecision({
    decisionId: "decision-red-team",
    optionId: "minimal-repair",
    risk: "medium",
    votes: [...votes, { ...votes[0], voteId: "vote-duplicate" }],
    vetoes: [],
    dissents: [],
  });
  assert.equal(result.state, "invalid");
});
await attack("GOV-02-one-model-votes-twice", () => {
  const result = governance.evaluateGovernanceDecision({
    decisionId: "decision-red-team",
    optionId: "minimal-repair",
    risk: "medium",
    votes: [...votes.slice(0, 3), { ...votes[3], voterIdentityHash: votes[0].voterIdentityHash }],
    vetoes: [],
    dissents: [],
  });
  assert.ok(result.blockers.includes("duplicate_identity_vote"));
});
await attack("GOV-03-fake-quorum", () => {
  assert.notEqual(
    governance.evaluateGovernanceDecision({
      decisionId: "decision-red-team",
      optionId: "minimal-repair",
      risk: "medium",
      votes: votes.slice(0, 2),
      vetoes: [],
      dissents: [],
    }).state,
    "quorum_met",
  );
});
await attack("GOV-04-majority-cannot-override-veto", () => {
  const result = governance.evaluateGovernanceDecision({
    decisionId: "decision-red-team",
    optionId: "minimal-repair",
    risk: "medium",
    votes,
    vetoes: [{
      vetoId: "veto-red-team",
      decisionId: "decision-red-team",
      domain: "privacy",
      role: "security_privacy",
      active: true,
      evidenceHash: hash("evidence"),
      reasonHash: hash("reason"),
      resolvedAt: null,
    }],
    dissents: [],
  });
  assert.equal(result.state, "mandatory_veto_active");
});
await attack("GOV-05-hidden-dissent-rejected", () => {
  const result = governance.evaluateGovernanceDecision({
    decisionId: "decision-red-team",
    optionId: "minimal-repair",
    risk: "medium",
    votes,
    vetoes: [],
    dissents: [{
      dissentId: "dissent-red-team",
      decisionId: "decision-red-team",
      role: "security_privacy",
      reasonHash: hash("reason"),
      evidenceHashes: ["not-a-hash"],
      predictedRisk: "high",
      importantWhenHash: hash("when"),
      state: "open",
    }],
  });
  assert.equal(result.state, "invalid");
});
await attack("GOV-06-expired-decision", () => {
  assert.throws(
    () => authorize({ now: new Date("2026-07-24T12:00:00.000Z") }),
    /decision_capability_not_authorized/u,
  );
});
await attack("GOV-07-stale-evidence", () => {
  const packet = governance.createGovernanceEvidencePacket({
    packetId: "packet-red-team",
    taskId: "task-red-team",
    projectId: "project-red-team",
    repository: "Chillywood2025/chillywood-mobile",
    branch: "codex/red-team",
    sourceCommit: commit,
    platform: "shared",
    environment: "preview",
    architectureGraphDigest: hash("graph"),
    researchClaimHashes: [hash("claim")],
    providerStateHash: hash("provider"),
    knownUnknowns: [],
    approvalLevel: 1,
    budgetHash: hash("budget"),
    rollbackRequirementHash: hash("rollback"),
    freshnessDeadline: "2026-07-23T11:59:59.999Z",
    untrustedTextClearlyLabeled: true,
  });
  assert.ok(
    governance
      .validateGovernanceEvidencePacketFreshness(packet, now)
      .includes("evidence_packet_stale"),
  );
});
await attack("GOV-08-changed-source-commit", () => {
  assert.throws(
    () => authorize({ currentSourceCommit: "b".repeat(40) }),
    /decision_capability_not_authorized/u,
  );
});
await attack("GOV-09-changed-graph-digest", () => {
  assert.throws(
    () => authorize({ currentGraphDigest: hash("changed") }),
    /decision_capability_not_authorized/u,
  );
});
await attack("GOV-10-forged-manifest", () => {
  assert.throws(
    () => authorize({ manifest: { ...manifest, selectedOptionId: "larger-redesign" } }),
    /decision_capability_not_authorized/u,
  );
});
await attack("GOV-11-replayed-decision", () => {
  const authority = new governance.DecisionCapabilityAuthority();
  const request = {
    authorizationId: "authorization-red-team",
    manifest,
    evaluation: quorum,
    approval,
    currentSourceCommit: commit,
    currentGraphDigest: hash("graph"),
    expectedOwnerIdentityHash: hash("owner"),
    now,
    emergencyStop: false,
  };
  authority.authorize(request);
  assert.throws(() => authority.authorize({ ...request, authorizationId: "authorization-replay" }));
});
await attack("GOV-12-capability-before-quorum", () => {
  assert.throws(() => authorize({ evaluation: { ...quorum, state: "quorum_not_met" } }));
});
await attack("GOV-13-capability-after-veto", () => {
  assert.throws(() => authorize({
    evaluation: { ...quorum, state: "mandatory_veto_active", blockers: ["mandatory_veto:security"] },
  }));
});
await attack("GOV-14-fake-owner-approval", () => {
  assert.throws(() => authorize({ expectedOwnerIdentityHash: hash("different-owner") }));
});
await attack("GOV-15-cognitive-constitution-amendment", () => {
  const blockers = governance.validateConstitutionAmendment({
    priorConstitutionHash: hash("old"),
    proposedConstitutionHash: hash("new"),
    proposedDiffHash: hash("diff"),
    independentSecurityReviewHash: hash("review"),
    adversarialTestManifestHash: hash("tests"),
    ownerApprovalVersionId: "approval-constitution",
    ownerIdentityHash: hash("same"),
    proposerIdentityHash: hash("same"),
    rollbackHash: hash("rollback"),
    proposedAt: now.toISOString(),
    activatesAt: "2026-07-24T11:59:59.999Z",
  });
  assert.ok(blockers.includes("constitution_self_amendment_forbidden"));
  assert.ok(blockers.includes("constitution_activation_delay_required"));
});
await attack("GOV-16-evaluator-executor-conflict", () => {
  assert.ok(
    governance
      .validateEvaluatorIndependence({
        executorIdentityHash: hash("same"),
        evaluatorIdentityHash: hash("same"),
        ownerIdentityHash: hash("owner"),
        evaluatorHasWriteCapability: true,
        evaluatorHasApprovalCapability: false,
      })
      .includes("evaluator_identity_conflict"),
  );
});
await attack("GOV-17-conflict-recusal", () => {
  const ledger = new governance.DeliberationRoundLedger();
  assert.throws(() =>
    ledger.submit({
      assessmentId: "assessment-recused",
      packetHash: hash("packet"),
      role: "security_privacy",
      round: 1,
      blindFirstRound: true,
      assessorIdentityHash: hash("assessor"),
      recused: true,
      recommendation: "no_action",
      confidence: 0,
      uncertainty: [],
      evidenceHashes: [hash("evidence")],
      submittedAt: now.toISOString(),
    }, []),
  );
});
await attack("GOV-18-endless-deliberation", () => {
  assert.ok(
    governance
      .validateCouncilAssessment({
        assessmentId: "assessment-round-three",
        packetHash: hash("packet"),
        role: "security_privacy",
        round: 3,
        blindFirstRound: false,
        assessorIdentityHash: hash("assessor"),
        recused: false,
        recommendation: "no_action",
        confidence: 0,
        uncertainty: [],
        evidenceHashes: [hash("evidence")],
        submittedAt: now.toISOString(),
      })
      .includes("round_invalid"),
  );
});
await attack("GOV-19-budget-exhaustion", () => {
  const ceiling = {
    modelTokens: 1,
    modelCostMicrousd: 1,
    toolCalls: 1,
    toolBytes: 1,
    elapsedMilliseconds: 1,
    childTasks: 0,
    retries: 0,
  };
  const ledger = new governance.GovernanceBudgetLedger({
    task: ceiling,
    approval: ceiling,
    daily: ceiling,
  });
  assert.throws(() => ledger.reserve({
    reservationId: "reservation-red-team",
    taskId: "task-red-team",
    approvalVersionId: "approval-red-team",
    amount: { ...ceiling, toolCalls: 2 },
    now,
    expiresAt: "2026-07-23T12:30:00.000Z",
    emergencyStop: false,
    cancelled: false,
  }));
});
await attack("GOV-20-repeated-denied-appeal", () => {
  const ledger = new governance.GovernanceAppealLedger();
  const input = {
    appealId: "appeal-red-team",
    priorDecisionHash: hash("decision"),
    newEvidenceHash: hash("new-evidence"),
    priorNewEvidenceHash: hash("old-evidence"),
    version: 1,
    createdAt: now.toISOString(),
  };
  ledger.open(input);
  assert.throws(() => ledger.open({ ...input, appealId: "appeal-retry", version: 2 }));
});
await attack("GOV-21-emergency-stop", () => {
  assert.throws(() => authorize({ emergencyStop: true }));
});
await attack("GOV-22-expired-approval", () => {
  assert.throws(() => authorize({
    approval: { ...approval, status: "expired" },
  }));
});
await attack("GOV-23-renewal-outside-scope", () => {
  assert.throws(() => governance.authorizeEquivalentCapabilityRenewal({
    approval,
    priorCapability: {
      capabilityId: "capability-old",
      taskId: "task-red-team",
      decisionManifestHash: approval.decisionManifestHash,
      scopeHash: hash("different-scope"),
      status: "expired",
    },
    newCapabilityId: "capability-new",
    issuedAt: "2026-07-23T12:15:00.000Z",
    expiresAt: "2026-07-23T12:45:00.000Z",
    taskState: "active",
    emergencyStop: false,
    newBlocker: false,
    executionsRemaining: 1,
    budgetAvailable: true,
  }));
});
await attack("GOV-24-reinstatement-after-material-change", () => {
  const result = governance.revalidateExpiredApproval({
    expiredApproval: { ...approval, status: "expired" },
    revalidationAt: "2026-07-24T12:00:00.000Z",
    newApprovalVersionId: "approval-reinstated",
    continuedNeed: true,
    sourceCommit: "b".repeat(40),
    decisionManifestHash: approval.decisionManifestHash,
    evidenceFreshnessHash: approval.evidenceFreshnessHash,
    scopeHash: approval.scopeHash,
    risk: approval.maximumRisk,
    budgetHash: hash({
      maximumCost: approval.maximumCost,
      maximumCalls: approval.maximumCalls,
      maximumBytes: approval.maximumBytes,
      maximumExecutions: approval.maximumExecutions,
    }),
    requiredTestsHash: approval.requiredTestsHash,
    rollbackHash: approval.rollbackHash,
    emergencyStop: false,
    conflictsPresent: false,
  });
  assert.equal(result.outcome, "amended_approval_required");
});
await attack("GOV-25-reused-consumed-approval", () => {
  assert.ok(
    governance
      .validateApprovalEnvelope({ ...approval, status: "consumed" }, now)
      .includes("approval_status_inactive"),
  );
});
await attack("GOV-26-provider-scope-expansion", () => {
  const result = policy.classifyProviderPolicy("github", {
    message: "Expand permission to owner and workflows:write",
  });
  assert.equal(result.executable, false);
  assert.equal(result.ownerReviewRequired, true);
});
await attack("GOV-27-outcome-contradicts-proposal", () => {
  const result = governance.validateOutcomeCalibration({
    predictedOutcomeHash: hash("predicted"),
    actualOutcomeHash: hash("actual"),
    updates: { source_reliability: 0.5 },
    evaluatorResult: "PASS",
  });
  assert.equal(result.accepted, true);
  assert.equal(result.reconsiderationRequired, true);
});

assert.equal(results.length, 27);
fs.rmSync(temporaryRoot, { recursive: true, force: true });
console.log("Cognitive Governance adversarial suite: 27/27 passed");
