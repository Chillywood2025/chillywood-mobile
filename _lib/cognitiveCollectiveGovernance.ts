import { cognitiveSha256 } from "./cognitivePlatformFoundation";

export const COLLECTIVE_GOVERNANCE_STATUS =
  "collective_governance_source_complete_not_deployed" as const;

export const COGNITIVE_GOVERNANCE_COMPONENTS = [
  "collective_intelligence_council",
  "deliberation_orchestrator",
  "governance_constitution_service",
  "decision_manifest_authority",
  "quorum_and_veto_engine",
  "dissent_and_minority_report_registry",
  "stakeholder_impact_panel",
  "model_independence_guard",
  "governance_audit_ledger",
  "appeal_and_reconsideration_service",
  "outcome_calibration_service",
  "governance_emergency_control",
  "owner_approval_lifecycle_service",
  "approval_revalidation_service",
] as const;

export type CognitiveGovernanceComponent =
  (typeof COGNITIVE_GOVERNANCE_COMPONENTS)[number];

export const COGNITIVE_COUNCIL_ROLES = [
  "product_user_experience",
  "architecture_engineering",
  "security_privacy",
  "reliability_release",
  "safety_trust",
  "accessibility_inclusion",
  "money_commercial_policy",
  "research_futures",
  "adversarial_red_team",
] as const;

export type CognitiveCouncilRole = (typeof COGNITIVE_COUNCIL_ROLES)[number];

export const MANDATORY_VETO_DOMAINS = [
  "security",
  "privacy",
  "auth_rls",
  "money",
  "user_rights",
  "public_release",
  "legal",
  "retention",
] as const;

export type MandatoryVetoDomain = (typeof MANDATORY_VETO_DOMAINS)[number];
export type GovernanceRisk = "low" | "medium" | "high" | "critical";
export type GovernancePlatform = "shared" | "ios" | "android" | "web";
export type GovernanceEnvironment = "local" | "ci" | "preview" | "production";

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const CAPABILITY_MINIMUM_MS = 15 * 60 * 1000;
const CAPABILITY_MAXIMUM_MS = 60 * 60 * 1000;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

export const canonicalGovernanceHash = (value: unknown): string =>
  cognitiveSha256(JSON.stringify(canonicalize(value)));

const validId = (value: unknown): value is string =>
  typeof value === "string" && ID_PATTERN.test(value);
const validHash = (value: unknown): value is string =>
  typeof value === "string" && HASH_PATTERN.test(value);
const validCommit = (value: unknown): value is string =>
  typeof value === "string" && COMMIT_PATTERN.test(value);
const validDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export type CouncilRoleContract = Readonly<{
  role: CognitiveCouncilRole;
  allowedEvidence: readonly (
    | "immutable_evidence_packet"
    | "sanitized_public_research"
    | "repository_graph"
    | "provider_readback"
    | "trusted_test_evidence"
  )[];
  requiredQuestions: readonly string[];
  maximumCostUsd: number;
  timeoutSeconds: number;
  prohibitedAuthority: readonly string[];
  mandatoryRecusalConditions: readonly string[];
}>;

export const COUNCIL_ROLE_CONTRACTS: Readonly<
  Record<CognitiveCouncilRole, CouncilRoleContract>
> = Object.freeze(
  Object.fromEntries(
    COGNITIVE_COUNCIL_ROLES.map((role) => [
      role,
      Object.freeze({
        role,
        allowedEvidence: Object.freeze([
          "immutable_evidence_packet",
          "sanitized_public_research",
          "repository_graph",
          "provider_readback",
          "trusted_test_evidence",
        ]),
        requiredQuestions: Object.freeze([
          "What directly supports the conclusion?",
          "What is unknown or stale?",
          "What is the smallest reversible option?",
          "What evidence would disprove this recommendation?",
        ]),
        maximumCostUsd: 1,
        timeoutSeconds: 120,
        prohibitedAuthority: Object.freeze([
          "tool_execution",
          "credential_access",
          "owner_approval",
          "capability_issuance",
          "merge",
          "deployment",
          "release",
          "money_movement",
          "rights_mutation",
        ]),
        mandatoryRecusalConditions: Object.freeze([
          "same_identity_as_executor",
          "same_identity_as_evaluator",
          "conflicting_financial_interest",
          "missing_required_evidence",
        ]),
      }),
    ]),
  ) as Record<CognitiveCouncilRole, CouncilRoleContract>,
);

export type GovernanceEvidencePacket = Readonly<{
  packetId: string;
  taskId: string;
  projectId: string;
  repository: "Chillywood2025/chillywood-mobile";
  branch: string;
  sourceCommit: string;
  platform: GovernancePlatform;
  environment: GovernanceEnvironment;
  architectureGraphDigest: string;
  researchClaimHashes: readonly string[];
  providerStateHash: string;
  knownUnknowns: readonly string[];
  approvalLevel: 0 | 1 | 2 | 3 | 4;
  budgetHash: string;
  rollbackRequirementHash: string;
  freshnessDeadline: string;
  untrustedTextClearlyLabeled: true;
  packetHash: string;
}>;

export const createGovernanceEvidencePacket = (
  input: Omit<GovernanceEvidencePacket, "packetHash">,
): GovernanceEvidencePacket => {
  if (
    !validId(input.packetId) ||
    !validId(input.taskId) ||
    !validId(input.projectId) ||
    input.repository !== "Chillywood2025/chillywood-mobile" ||
    !input.branch.startsWith("codex/") ||
    !validCommit(input.sourceCommit) ||
    !validHash(input.architectureGraphDigest) ||
    !input.researchClaimHashes.every(validHash) ||
    !validHash(input.providerStateHash) ||
    !validHash(input.budgetHash) ||
    !validHash(input.rollbackRequirementHash) ||
    !validDate(input.freshnessDeadline) ||
    input.untrustedTextClearlyLabeled !== true
  ) {
    throw new Error("governance_evidence_packet_invalid");
  }
  const packetHash = canonicalGovernanceHash(input);
  return Object.freeze({
    ...input,
    researchClaimHashes: Object.freeze([...input.researchClaimHashes]),
    knownUnknowns: Object.freeze([...input.knownUnknowns]),
    packetHash,
  });
};

export const validateGovernanceEvidencePacketFreshness = (
  packet: GovernanceEvidencePacket,
  now: Date,
): readonly string[] => {
  const { packetHash: suppliedHash, ...body } = packet;
  const blockers: string[] = [];
  if (canonicalGovernanceHash(body) !== suppliedHash) {
    blockers.push("evidence_packet_hash_mismatch");
  }
  if (now.getTime() >= Date.parse(packet.freshnessDeadline)) {
    blockers.push("evidence_packet_stale");
  }
  return Object.freeze(blockers);
};

export type CouncilAssessment = Readonly<{
  assessmentId: string;
  packetHash: string;
  role: CognitiveCouncilRole;
  round: 1 | 2;
  blindFirstRound: boolean;
  assessorIdentityHash: string;
  recused: boolean;
  recommendation: "no_action" | "minimal_repair" | "moderate_improvement" | "larger_redesign";
  confidence: number;
  uncertainty: readonly string[];
  evidenceHashes: readonly string[];
  submittedAt: string;
}>;

export const validateCouncilAssessment = (
  assessment: CouncilAssessment,
): readonly string[] => {
  const blockers: string[] = [];
  if (!validId(assessment.assessmentId)) blockers.push("assessment_id_invalid");
  if (!validHash(assessment.packetHash)) blockers.push("packet_hash_invalid");
  if (!COGNITIVE_COUNCIL_ROLES.includes(assessment.role)) blockers.push("role_invalid");
  if (assessment.round !== 1 && assessment.round !== 2) blockers.push("round_invalid");
  if (assessment.round === 1 && assessment.blindFirstRound !== true) {
    blockers.push("first_round_not_blind");
  }
  if (!validHash(assessment.assessorIdentityHash)) blockers.push("identity_hash_invalid");
  if (
    !Number.isFinite(assessment.confidence) ||
    assessment.confidence < 0 ||
    assessment.confidence > 1
  ) {
    blockers.push("confidence_invalid");
  }
  if (!assessment.evidenceHashes.every(validHash)) blockers.push("evidence_hash_invalid");
  if (!validDate(assessment.submittedAt)) blockers.push("submitted_at_invalid");
  return Object.freeze(blockers);
};

export type GovernanceVote = Readonly<{
  voteId: string;
  decisionId: string;
  role: CognitiveCouncilRole;
  voterIdentityHash: string;
  optionId: string;
  vote: "support" | "oppose" | "abstain";
  assessmentHash: string;
  createdAt: string;
}>;

export type GovernanceVeto = Readonly<{
  vetoId: string;
  decisionId: string;
  domain: MandatoryVetoDomain;
  role: CognitiveCouncilRole;
  active: boolean;
  evidenceHash: string;
  reasonHash: string;
  resolvedAt: string | null;
}>;

export type GovernanceDissent = Readonly<{
  dissentId: string;
  decisionId: string;
  role: CognitiveCouncilRole;
  reasonHash: string;
  evidenceHashes: readonly string[];
  predictedRisk: GovernanceRisk;
  importantWhenHash: string;
  state: "open" | "resolved" | "accepted_residual_risk";
}>;

export type GovernanceDecisionEvaluation = Readonly<{
  state: "quorum_met" | "quorum_not_met" | "mandatory_veto_active" | "invalid";
  supportCount: number;
  opposeCount: number;
  abstainCount: number;
  uniqueRoleCount: number;
  blockers: readonly string[];
}>;

const minimumQuorum = (risk: GovernanceRisk): number =>
  ({ low: 3, medium: 4, high: 6, critical: 7 })[risk];

export const evaluateGovernanceDecision = (input: {
  decisionId: string;
  optionId: string;
  risk: GovernanceRisk;
  votes: readonly GovernanceVote[];
  vetoes: readonly GovernanceVeto[];
  dissents: readonly GovernanceDissent[];
}): GovernanceDecisionEvaluation => {
  const blockers: string[] = [];
  if (!validId(input.decisionId) || !validId(input.optionId)) {
    blockers.push("decision_identity_invalid");
  }
  const matchingVotes = input.votes.filter(
    (vote) => vote.decisionId === input.decisionId && vote.optionId === input.optionId,
  );
  const roleKeys = new Set<string>();
  const identityKeys = new Set<string>();
  for (const vote of matchingVotes) {
    if (
      !validId(vote.voteId) ||
      !validHash(vote.voterIdentityHash) ||
      !validHash(vote.assessmentHash) ||
      !validDate(vote.createdAt)
    ) {
      blockers.push("vote_invalid");
    }
    if (roleKeys.has(vote.role)) blockers.push("duplicate_role_vote");
    if (identityKeys.has(vote.voterIdentityHash)) blockers.push("duplicate_identity_vote");
    roleKeys.add(vote.role);
    identityKeys.add(vote.voterIdentityHash);
  }
  const activeVetoes = input.vetoes.filter(
    (veto) =>
      veto.decisionId === input.decisionId &&
      veto.active &&
      veto.resolvedAt === null &&
      MANDATORY_VETO_DOMAINS.includes(veto.domain),
  );
  const supportCount = matchingVotes.filter((vote) => vote.vote === "support").length;
  const opposeCount = matchingVotes.filter((vote) => vote.vote === "oppose").length;
  const abstainCount = matchingVotes.filter((vote) => vote.vote === "abstain").length;
  const critics = new Set(matchingVotes.map((vote) => vote.role));
  for (const role of [
    "security_privacy",
    "reliability_release",
    "product_user_experience",
    "adversarial_red_team",
  ] satisfies CognitiveCouncilRole[]) {
    if (!critics.has(role)) blockers.push(`required_critic_missing:${role}`);
  }
  if (input.dissents.some((entry) => entry.state === "open" && !entry.evidenceHashes.every(validHash))) {
    blockers.push("dissent_evidence_invalid");
  }
  if (blockers.length > 0) {
    return Object.freeze({
      state: "invalid",
      supportCount,
      opposeCount,
      abstainCount,
      uniqueRoleCount: roleKeys.size,
      blockers: Object.freeze(blockers),
    });
  }
  if (activeVetoes.length > 0) {
    return Object.freeze({
      state: "mandatory_veto_active",
      supportCount,
      opposeCount,
      abstainCount,
      uniqueRoleCount: roleKeys.size,
      blockers: Object.freeze(activeVetoes.map((veto) => `mandatory_veto:${veto.domain}`)),
    });
  }
  const quorum = minimumQuorum(input.risk);
  const passed = roleKeys.size >= quorum && supportCount > opposeCount;
  return Object.freeze({
    state: passed ? "quorum_met" : "quorum_not_met",
    supportCount,
    opposeCount,
    abstainCount,
    uniqueRoleCount: roleKeys.size,
    blockers: Object.freeze(
      passed ? [] : [`required_quorum:${quorum}`, "support_must_exceed_opposition"],
    ),
  });
};

export type GovernanceDecisionManifest = Readonly<{
  decisionId: string;
  taskId: string;
  sourceCommit: string;
  architectureGraphDigest: string;
  evidenceManifestHash: string;
  researchClaimHashes: readonly string[];
  proposalHashes: readonly string[];
  selectedOptionId: string;
  rejectedOptionIds: readonly string[];
  councilRoles: readonly CognitiveCouncilRole[];
  independenceAttestationHashes: readonly string[];
  voteManifestHash: string;
  vetoManifestHash: string;
  dissentManifestHash: string;
  stakeholderImpactHash: string;
  risk: GovernanceRisk;
  requiredTestsHash: string;
  capabilityScopeHash: string;
  budgetHash: string;
  maximumExecutions: number;
  rollbackHash: string;
  expiresAt: string;
  ownerApprovalVersionId: string | null;
  externalConfirmationReferenceHash: string | null;
  decisionHash: string;
}>;

export const createDecisionManifest = (
  input: Omit<GovernanceDecisionManifest, "decisionHash">,
  evaluation: GovernanceDecisionEvaluation,
): GovernanceDecisionManifest => {
  if (
    evaluation.state !== "quorum_met" ||
    !validId(input.decisionId) ||
    !validId(input.taskId) ||
    !validCommit(input.sourceCommit) ||
    !validHash(input.architectureGraphDigest) ||
    !validHash(input.evidenceManifestHash) ||
    !input.researchClaimHashes.every(validHash) ||
    !input.proposalHashes.every(validHash) ||
    !input.independenceAttestationHashes.every(validHash) ||
    !validHash(input.voteManifestHash) ||
    !validHash(input.vetoManifestHash) ||
    !validHash(input.dissentManifestHash) ||
    !validHash(input.stakeholderImpactHash) ||
    !validHash(input.requiredTestsHash) ||
    !validHash(input.capabilityScopeHash) ||
    !validHash(input.budgetHash) ||
    !Number.isSafeInteger(input.maximumExecutions) ||
    input.maximumExecutions < 1 ||
    !validHash(input.rollbackHash) ||
    !validDate(input.expiresAt)
  ) {
    throw new Error("decision_manifest_invalid");
  }
  const decisionHash = canonicalGovernanceHash(input);
  return Object.freeze({
    ...input,
    researchClaimHashes: Object.freeze([...input.researchClaimHashes]),
    proposalHashes: Object.freeze([...input.proposalHashes]),
    rejectedOptionIds: Object.freeze([...input.rejectedOptionIds]),
    councilRoles: Object.freeze([...input.councilRoles]),
    independenceAttestationHashes: Object.freeze([
      ...input.independenceAttestationHashes,
    ]),
    decisionHash,
  });
};

export type GovernanceApprovalEnvelope = Readonly<{
  approvalVersionId: string;
  priorApprovalVersionId: string | null;
  taskId: string;
  objectiveHash: string;
  projectId: string;
  repository: "Chillywood2025/chillywood-mobile";
  branch: string;
  platform: GovernancePlatform;
  environment: GovernanceEnvironment;
  provider: string;
  targetResourceHashes: readonly string[];
  allowedActionTypes: readonly string[];
  scopeHash: string;
  maximumRisk: GovernanceRisk;
  maximumCost: number;
  maximumCalls: number;
  maximumBytes: number;
  maximumExecutions: number;
  requiredTestsHash: string;
  evaluatorRequired: true;
  rollbackHash: string;
  decisionManifestHash: string;
  sourceCommit: string;
  evidenceFreshnessHash: string;
  startsAt: string;
  expiresAt: string;
  status: "active" | "expired" | "cancelled" | "superseded" | "consumed";
  ownerIdentityHash: string;
}>;

export const validateApprovalEnvelope = (
  approval: GovernanceApprovalEnvelope,
  now = new Date(),
): readonly string[] => {
  const blockers: string[] = [];
  if (!validId(approval.approvalVersionId)) blockers.push("approval_id_invalid");
  if (!validId(approval.taskId) || !validId(approval.projectId)) blockers.push("task_scope_invalid");
  if (approval.repository !== "Chillywood2025/chillywood-mobile") blockers.push("repository_invalid");
  if (!approval.branch.startsWith("codex/")) blockers.push("branch_invalid");
  if (
    ![
      approval.objectiveHash,
      approval.scopeHash,
      approval.requiredTestsHash,
      approval.rollbackHash,
      approval.decisionManifestHash,
      approval.evidenceFreshnessHash,
      approval.ownerIdentityHash,
    ].every(validHash)
  ) {
    blockers.push("approval_hash_invalid");
  }
  if (!validCommit(approval.sourceCommit)) blockers.push("source_commit_invalid");
  const starts = Date.parse(approval.startsAt);
  const expires = Date.parse(approval.expiresAt);
  if (
    !Number.isFinite(starts) ||
    !Number.isFinite(expires) ||
    expires - starts !== APPROVAL_WINDOW_MS
  ) {
    blockers.push("approval_window_invalid");
  }
  if (now.getTime() < starts || now.getTime() >= expires) blockers.push("approval_not_active_now");
  if (approval.status !== "active") blockers.push("approval_status_inactive");
  if (
    !Number.isSafeInteger(approval.maximumExecutions) ||
    approval.maximumExecutions < 1 ||
    !Number.isFinite(approval.maximumCost) ||
    approval.maximumCost < 0 ||
    !Number.isSafeInteger(approval.maximumCalls) ||
    approval.maximumCalls < 0 ||
    !Number.isSafeInteger(approval.maximumBytes) ||
    approval.maximumBytes < 0
  ) {
    blockers.push("approval_budget_invalid");
  }
  return Object.freeze(blockers);
};

export type ShortLivedCapabilityRenewal = Readonly<{
  priorCapabilityId: string;
  newCapabilityId: string;
  approvalVersionId: string;
  decisionManifestHash: string;
  scopeHash: string;
  issuedAt: string;
  expiresAt: string;
  equivalentScope: true;
}>;

export const authorizeEquivalentCapabilityRenewal = (input: {
  approval: GovernanceApprovalEnvelope;
  priorCapability: Readonly<{
    capabilityId: string;
    taskId: string;
    decisionManifestHash: string;
    scopeHash: string;
    status: "active" | "expired" | "revoked" | "consumed";
  }>;
  newCapabilityId: string;
  issuedAt: string;
  expiresAt: string;
  taskState: "active" | "resolved" | "superseded" | "cancelled" | "quarantined";
  emergencyStop: boolean;
  newBlocker: boolean;
  executionsRemaining: number;
  budgetAvailable: boolean;
}): ShortLivedCapabilityRenewal => {
  const now = new Date(input.issuedAt);
  const expiry = Date.parse(input.expiresAt);
  const duration = expiry - now.getTime();
  if (
    validateApprovalEnvelope(input.approval, now).length > 0 ||
    input.priorCapability.taskId !== input.approval.taskId ||
    input.priorCapability.decisionManifestHash !== input.approval.decisionManifestHash ||
    input.priorCapability.scopeHash !== input.approval.scopeHash ||
    !validId(input.newCapabilityId) ||
    duration < CAPABILITY_MINIMUM_MS ||
    duration > CAPABILITY_MAXIMUM_MS ||
    input.taskState !== "active" ||
    input.emergencyStop ||
    input.newBlocker ||
    input.executionsRemaining < 1 ||
    !input.budgetAvailable
  ) {
    throw new Error("capability_renewal_not_authorized");
  }
  return Object.freeze({
    priorCapabilityId: input.priorCapability.capabilityId,
    newCapabilityId: input.newCapabilityId,
    approvalVersionId: input.approval.approvalVersionId,
    decisionManifestHash: input.approval.decisionManifestHash,
    scopeHash: input.approval.scopeHash,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    equivalentScope: true,
  });
};

export const classifyAdaptivePlanDelta = (input: {
  originalObjectiveHash: string;
  revisedObjectiveHash: string;
  originalScopeHash: string;
  revisedScopeHash: string;
  originalPlatform: GovernancePlatform;
  revisedPlatform: GovernancePlatform;
  originalProvider: string;
  revisedProvider: string;
  originalTargetHash: string;
  revisedTargetHash: string;
  originalRisk: GovernanceRisk;
  revisedRisk: GovernanceRisk;
  originalBudget: number;
  revisedBudget: number;
  originalRollbackHash: string;
  revisedRollbackHash: string;
  testsPreserved: boolean;
  broaderCredentialRequired: boolean;
}): "within_envelope" | "amended_approval_required" => {
  const riskRank: Record<GovernanceRisk, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };
  const materialChange =
    input.originalObjectiveHash !== input.revisedObjectiveHash ||
    input.originalScopeHash !== input.revisedScopeHash ||
    input.originalPlatform !== input.revisedPlatform ||
    input.originalProvider !== input.revisedProvider ||
    input.originalTargetHash !== input.revisedTargetHash ||
    riskRank[input.revisedRisk] > riskRank[input.originalRisk] ||
    input.revisedBudget > input.originalBudget ||
    input.originalRollbackHash !== input.revisedRollbackHash ||
    !input.testsPreserved ||
    input.broaderCredentialRequired;
  return materialChange ? "amended_approval_required" : "within_envelope";
};

export type ApprovalRevalidationInput = Readonly<{
  expiredApproval: GovernanceApprovalEnvelope;
  revalidationAt: string;
  newApprovalVersionId: string;
  continuedNeed: boolean;
  sourceCommit: string;
  decisionManifestHash: string;
  evidenceFreshnessHash: string;
  scopeHash: string;
  risk: GovernanceRisk;
  budgetHash: string;
  requiredTestsHash: string;
  rollbackHash: string;
  emergencyStop: boolean;
  conflictsPresent: boolean;
}>;

export const revalidateExpiredApproval = (
  input: ApprovalRevalidationInput,
): Readonly<{
  outcome: "reinstatement_available" | "amended_approval_required" | "not_needed";
  changedFields: readonly string[];
  proposedApproval: GovernanceApprovalEnvelope | null;
}> => {
  if (!input.continuedNeed) {
    return Object.freeze({
      outcome: "not_needed",
      changedFields: Object.freeze([]),
      proposedApproval: null,
    });
  }
  const changedFields: string[] = [];
  const old = input.expiredApproval;
  if (
    old.status !== "expired" ||
    Date.parse(input.revalidationAt) < Date.parse(old.expiresAt)
  ) {
    throw new Error("approval_not_expired");
  }
  if (input.sourceCommit !== old.sourceCommit) changedFields.push("source_commit");
  if (input.decisionManifestHash !== old.decisionManifestHash) changedFields.push("decision_manifest");
  if (input.evidenceFreshnessHash !== old.evidenceFreshnessHash) changedFields.push("evidence_freshness");
  if (input.scopeHash !== old.scopeHash) changedFields.push("scope");
  if (input.risk !== old.maximumRisk) changedFields.push("risk");
  if (input.requiredTestsHash !== old.requiredTestsHash) changedFields.push("required_tests");
  if (input.rollbackHash !== old.rollbackHash) changedFields.push("rollback");
  if (input.emergencyStop) changedFields.push("emergency_stop");
  if (input.conflictsPresent) changedFields.push("resource_conflict");
  const priorBudgetHash = canonicalGovernanceHash({
    maximumCost: old.maximumCost,
    maximumCalls: old.maximumCalls,
    maximumBytes: old.maximumBytes,
    maximumExecutions: old.maximumExecutions,
  });
  if (input.budgetHash !== priorBudgetHash) changedFields.push("budget");
  if (changedFields.length > 0) {
    return Object.freeze({
      outcome: "amended_approval_required",
      changedFields: Object.freeze(changedFields),
      proposedApproval: null,
    });
  }
  const startsAt = new Date(input.revalidationAt);
  if (!Number.isFinite(startsAt.getTime()) || !validId(input.newApprovalVersionId)) {
    throw new Error("approval_revalidation_invalid");
  }
  const proposedApproval: GovernanceApprovalEnvelope = Object.freeze({
    ...old,
    approvalVersionId: input.newApprovalVersionId,
    priorApprovalVersionId: old.approvalVersionId,
    startsAt: startsAt.toISOString(),
    expiresAt: new Date(startsAt.getTime() + APPROVAL_WINDOW_MS).toISOString(),
    status: "active",
  });
  return Object.freeze({
    outcome: "reinstatement_available",
    changedFields: Object.freeze([]),
    proposedApproval,
  });
};

export type GovernanceExecutionReceipt = Readonly<{
  receiptId: string;
  taskId: string;
  projectId: string;
  repository: "Chillywood2025/chillywood-mobile";
  branch: string;
  platform: GovernancePlatform;
  environment: GovernanceEnvironment;
  capabilityId: string;
  capabilityUsageSequence: number;
  callId: string;
  decisionManifestHash: string;
  approvalVersionId: string;
  planSnapshotHash: string;
  beforeStateHash: string;
  afterStateHash: string;
  untrustedToolResultEnvelopeHash: string;
  actualBytes: number;
  actualCalls: number;
  actualCost: number;
  resourceLeaseIds: readonly string[];
  diffHash: string;
  finalCommit: string | null;
  rollbackState: "not_required" | "pending" | "succeeded" | "failed";
  evaluatorState: "pending";
  completedAt: string;
  receiptHash: string;
}>;

export type PostflightInput = Readonly<{
  receiptId: string;
  taskId: string;
  projectId: string;
  repository: "Chillywood2025/chillywood-mobile";
  branch: string;
  platform: GovernancePlatform;
  environment: GovernanceEnvironment;
  capability: Readonly<{
    capabilityId: string;
    taskId: string;
    projectId: string;
    repository: string;
    branch: string;
    platform: GovernancePlatform;
    environment: GovernanceEnvironment;
    provider: string;
    operation: string;
    status: "consumed";
    usageSequence: number;
    expiresAt: string;
    approvalVersionId: string;
    decisionManifestHash: string;
    planSnapshotHash: string;
  }>;
  call: Readonly<{
    callId: string;
    capabilityId: string;
    provider: string;
    operation: string;
    pathHash: string;
  }>;
  expectedPathHash: string;
  beforeState: unknown;
  afterState: unknown;
  untrustedToolResultEnvelope: unknown;
  actualBytes: number;
  actualCalls: number;
  actualCost: number;
  reservedBytes: number;
  reservedCalls: number;
  reservedCost: number;
  leases: readonly Readonly<{
    leaseId: string;
    taskId: string;
    status: "active";
    expiresAt: string;
  }>[];
  diff: unknown;
  finalCommit: string | null;
  rollbackState: GovernanceExecutionReceipt["rollbackState"];
  emergencyStop: boolean;
  taskCancelled: boolean;
  taskQuarantined: boolean;
  approvalActive: boolean;
  completionTime: string;
}>;

export const createPostflightExecutionReceipt = (
  input: PostflightInput,
): GovernanceExecutionReceipt => {
  const now = Date.parse(input.completionTime);
  const capability = input.capability;
  const matchingScope =
    capability.taskId === input.taskId &&
    capability.projectId === input.projectId &&
    capability.repository === input.repository &&
    capability.branch === input.branch &&
    capability.platform === input.platform &&
    capability.environment === input.environment &&
    capability.capabilityId === input.call.capabilityId &&
    capability.provider === input.call.provider &&
    capability.operation === input.call.operation &&
    input.call.pathHash === input.expectedPathHash;
  const validUsage =
    Number.isSafeInteger(capability.usageSequence) &&
    capability.usageSequence > 0 &&
    Number.isSafeInteger(input.actualBytes) &&
    input.actualBytes >= 0 &&
    input.actualBytes <= input.reservedBytes &&
    Number.isSafeInteger(input.actualCalls) &&
    input.actualCalls >= 1 &&
    input.actualCalls <= input.reservedCalls &&
    Number.isFinite(input.actualCost) &&
    input.actualCost >= 0 &&
    input.actualCost <= input.reservedCost;
  const leasesValid =
    input.leases.length > 0 &&
    input.leases.every(
      (lease) =>
        validId(lease.leaseId) &&
        lease.taskId === input.taskId &&
        lease.status === "active" &&
        now < Date.parse(lease.expiresAt),
    );
  if (
    !validId(input.receiptId) ||
    !validId(input.taskId) ||
    !validId(input.projectId) ||
    input.repository !== "Chillywood2025/chillywood-mobile" ||
    !input.branch.startsWith("codex/") ||
    capability.status !== "consumed" ||
    now >= Date.parse(capability.expiresAt) ||
    input.emergencyStop ||
    input.taskCancelled ||
    input.taskQuarantined ||
    !input.approvalActive ||
    !matchingScope ||
    !validHash(input.expectedPathHash) ||
    !validUsage ||
    !leasesValid ||
    (input.finalCommit !== null && !validCommit(input.finalCommit)) ||
    !validDate(input.completionTime)
  ) {
    throw new Error("postflight_rejected");
  }
  const trustedReceiptBody = {
    receiptId: input.receiptId,
    taskId: input.taskId,
    projectId: input.projectId,
    repository: input.repository,
    branch: input.branch,
    platform: input.platform,
    environment: input.environment,
    capabilityId: capability.capabilityId,
    capabilityUsageSequence: capability.usageSequence,
    callId: input.call.callId,
    decisionManifestHash: capability.decisionManifestHash,
    approvalVersionId: capability.approvalVersionId,
    planSnapshotHash: capability.planSnapshotHash,
    beforeStateHash: canonicalGovernanceHash(input.beforeState),
    afterStateHash: canonicalGovernanceHash(input.afterState),
    untrustedToolResultEnvelopeHash: canonicalGovernanceHash(
      input.untrustedToolResultEnvelope,
    ),
    actualBytes: input.actualBytes,
    actualCalls: input.actualCalls,
    actualCost: input.actualCost,
    resourceLeaseIds: Object.freeze(input.leases.map((lease) => lease.leaseId).sort()),
    diffHash: canonicalGovernanceHash(input.diff),
    finalCommit: input.finalCommit,
    rollbackState: input.rollbackState,
    evaluatorState: "pending" as const,
    completedAt: input.completionTime,
  };
  return Object.freeze({
    ...trustedReceiptBody,
    receiptHash: canonicalGovernanceHash(trustedReceiptBody),
  });
};

export type GovernanceBudgetDimensions = Readonly<{
  modelTokens: number;
  modelCostMicrousd: number;
  toolCalls: number;
  toolBytes: number;
  elapsedMilliseconds: number;
  childTasks: number;
  retries: number;
}>;

type BudgetReservation = Readonly<{
  reservationId: string;
  taskId: string;
  approvalVersionId: string;
  reserved: GovernanceBudgetDimensions;
  expiresAt: string;
  state: "reserved";
}>;

const BUDGET_KEYS: readonly (keyof GovernanceBudgetDimensions)[] = [
  "modelTokens",
  "modelCostMicrousd",
  "toolCalls",
  "toolBytes",
  "elapsedMilliseconds",
  "childTasks",
  "retries",
];

const validBudget = (value: GovernanceBudgetDimensions): boolean =>
  BUDGET_KEYS.every(
    (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
  );

const addBudget = (
  left: GovernanceBudgetDimensions,
  right: GovernanceBudgetDimensions,
): GovernanceBudgetDimensions =>
  Object.freeze(
    Object.fromEntries(BUDGET_KEYS.map((key) => [key, left[key] + right[key]])) as
      unknown as GovernanceBudgetDimensions,
  );

const subtractBudget = (
  left: GovernanceBudgetDimensions,
  right: GovernanceBudgetDimensions,
): GovernanceBudgetDimensions =>
  Object.freeze(
    Object.fromEntries(BUDGET_KEYS.map((key) => [key, left[key] - right[key]])) as
      unknown as GovernanceBudgetDimensions,
  );

export class GovernanceBudgetLedger {
  readonly #taskCeiling: GovernanceBudgetDimensions;
  readonly #approvalCeiling: GovernanceBudgetDimensions;
  readonly #dailyCeiling: GovernanceBudgetDimensions;
  #consumed: GovernanceBudgetDimensions;
  readonly #reservations = new Map<string, BudgetReservation>();
  readonly #settled = new Set<string>();

  constructor(ceilings: {
    task: GovernanceBudgetDimensions;
    approval: GovernanceBudgetDimensions;
    daily: GovernanceBudgetDimensions;
  }) {
    if (
      !validBudget(ceilings.task) ||
      !validBudget(ceilings.approval) ||
      !validBudget(ceilings.daily)
    ) {
      throw new Error("budget_ceiling_invalid");
    }
    this.#taskCeiling = Object.freeze({ ...ceilings.task });
    this.#approvalCeiling = Object.freeze({ ...ceilings.approval });
    this.#dailyCeiling = Object.freeze({ ...ceilings.daily });
    this.#consumed = Object.freeze(
      Object.fromEntries(BUDGET_KEYS.map((key) => [key, 0])) as
        unknown as GovernanceBudgetDimensions,
    );
  }

  reserve(input: {
    reservationId: string;
    taskId: string;
    approvalVersionId: string;
    amount: GovernanceBudgetDimensions;
    now: Date;
    expiresAt: string;
    emergencyStop: boolean;
    cancelled: boolean;
  }): void {
    const proposed = addBudget(this.#consumed, input.amount);
    if (
      !validId(input.reservationId) ||
      !validId(input.taskId) ||
      !validId(input.approvalVersionId) ||
      !validBudget(input.amount) ||
      input.emergencyStop ||
      input.cancelled ||
      input.now.getTime() >= Date.parse(input.expiresAt) ||
      this.#reservations.has(input.reservationId) ||
      this.#settled.has(input.reservationId) ||
      BUDGET_KEYS.some(
        (key) =>
          proposed[key] > this.#taskCeiling[key] ||
          proposed[key] > this.#approvalCeiling[key] ||
          proposed[key] > this.#dailyCeiling[key],
      )
    ) {
      throw new Error("budget_reservation_rejected");
    }
    this.#consumed = proposed;
    this.#reservations.set(
      input.reservationId,
      Object.freeze({
        reservationId: input.reservationId,
        taskId: input.taskId,
        approvalVersionId: input.approvalVersionId,
        reserved: Object.freeze({ ...input.amount }),
        expiresAt: input.expiresAt,
        state: "reserved",
      }),
    );
  }

  settle(input: {
    reservationId: string;
    actual: GovernanceBudgetDimensions;
    now: Date;
    cancelled: boolean;
    allowBoundedOverage: boolean;
  }): void {
    const reservation = this.#reservations.get(input.reservationId);
    if (
      !reservation ||
      this.#settled.has(input.reservationId) ||
      input.cancelled ||
      input.now.getTime() >= Date.parse(reservation.expiresAt) ||
      !validBudget(input.actual)
    ) {
      throw new Error("budget_settlement_rejected");
    }
    if (
      !input.allowBoundedOverage &&
      BUDGET_KEYS.some((key) => input.actual[key] > reservation.reserved[key])
    ) {
      throw new Error("budget_actual_exceeds_reservation");
    }
    const withoutReservation = subtractBudget(this.#consumed, reservation.reserved);
    const proposed = addBudget(withoutReservation, input.actual);
    if (
      BUDGET_KEYS.some(
        (key) =>
          proposed[key] < 0 ||
          proposed[key] > this.#taskCeiling[key] ||
          proposed[key] > this.#approvalCeiling[key] ||
          proposed[key] > this.#dailyCeiling[key],
      )
    ) {
      throw new Error("budget_settlement_ceiling_exceeded");
    }
    this.#consumed = proposed;
    this.#reservations.delete(input.reservationId);
    this.#settled.add(input.reservationId);
  }

  release(reservationId: string): boolean {
    const reservation = this.#reservations.get(reservationId);
    if (!reservation) return false;
    this.#consumed = subtractBudget(this.#consumed, reservation.reserved);
    this.#reservations.delete(reservationId);
    return true;
  }

  recoverExpired(now: Date): readonly string[] {
    const recovered: string[] = [];
    for (const [reservationId, reservation] of this.#reservations.entries()) {
      if (now.getTime() >= Date.parse(reservation.expiresAt)) {
        this.release(reservationId);
        recovered.push(reservationId);
      }
    }
    return Object.freeze(recovered.sort());
  }

  snapshot(): Readonly<{
    consumed: GovernanceBudgetDimensions;
    reservationCount: number;
    settledCount: number;
  }> {
    return Object.freeze({
      consumed: Object.freeze({ ...this.#consumed }),
      reservationCount: this.#reservations.size,
      settledCount: this.#settled.size,
    });
  }
}

export type GovernanceResourceType =
  | "repository"
  | "branch"
  | "path"
  | "migration_namespace"
  | "edge_function"
  | "database_object"
  | "provider"
  | "release_channel"
  | "platform"
  | "feature_flag";

export type GovernanceResourceLease = Readonly<{
  leaseId: string;
  taskId: string;
  ownerTokenHash: string;
  resourceType: GovernanceResourceType;
  resourceKey: string;
  hierarchyKey: string;
  mode: "read" | "write";
  issuedAt: string;
  expiresAt: string;
  heartbeatAt: string;
  status: "active" | "released" | "revoked" | "expired";
}>;

const leaseConflicts = (
  left: GovernanceResourceLease,
  right: GovernanceResourceLease,
): boolean => {
  if (left.taskId === right.taskId) return false;
  if (left.mode === "read" && right.mode === "read") return false;
  const hierarchyOverlap =
    left.hierarchyKey === right.hierarchyKey ||
    left.hierarchyKey.startsWith(`${right.hierarchyKey}/`) ||
    right.hierarchyKey.startsWith(`${left.hierarchyKey}/`);
  return hierarchyOverlap;
};

export class HierarchicalResourceLeaseRegistry {
  readonly #leases = new Map<string, GovernanceResourceLease>();

  acquire(
    requests: readonly Omit<GovernanceResourceLease, "status" | "heartbeatAt">[],
    now: Date,
  ): readonly GovernanceResourceLease[] {
    const ordered = [...requests].sort((left, right) =>
      `${left.hierarchyKey}:${left.resourceKey}`.localeCompare(
        `${right.hierarchyKey}:${right.resourceKey}`,
      ),
    );
    const candidates: GovernanceResourceLease[] = ordered.map((request) =>
      Object.freeze({
        ...request,
        heartbeatAt: request.issuedAt,
        status: "active" as const,
      }),
    );
    if (
      candidates.length === 0 ||
      candidates.some(
        (candidate) =>
          !validId(candidate.leaseId) ||
          !validId(candidate.taskId) ||
          !validHash(candidate.ownerTokenHash) ||
          !validDate(candidate.issuedAt) ||
          !validDate(candidate.expiresAt) ||
          now.getTime() >= Date.parse(candidate.expiresAt) ||
          this.#leases.has(candidate.leaseId),
      )
    ) {
      throw new Error("lease_request_invalid");
    }
    const active = [...this.#leases.values()].filter(
      (lease) =>
        lease.status === "active" && now.getTime() < Date.parse(lease.expiresAt),
    );
    for (const candidate of candidates) {
      if (
        active.some((lease) => leaseConflicts(candidate, lease)) ||
        candidates.some(
          (other) =>
            other.leaseId !== candidate.leaseId && leaseConflicts(candidate, other),
        )
      ) {
        throw new Error("resource_lease_conflict");
      }
    }
    for (const candidate of candidates) this.#leases.set(candidate.leaseId, candidate);
    return Object.freeze(candidates);
  }

  heartbeat(leaseId: string, ownerTokenHash: string, at: Date): void {
    const lease = this.#leases.get(leaseId);
    if (
      !lease ||
      lease.status !== "active" ||
      lease.ownerTokenHash !== ownerTokenHash ||
      at.getTime() >= Date.parse(lease.expiresAt)
    ) {
      throw new Error("lease_heartbeat_rejected");
    }
    this.#leases.set(
      leaseId,
      Object.freeze({ ...lease, heartbeatAt: at.toISOString() }),
    );
  }

  release(leaseId: string, ownerTokenHash: string): void {
    const lease = this.#leases.get(leaseId);
    if (
      !lease ||
      lease.status !== "active" ||
      lease.ownerTokenHash !== ownerTokenHash
    ) {
      throw new Error("lease_release_rejected");
    }
    this.#leases.set(leaseId, Object.freeze({ ...lease, status: "released" }));
  }

  revokeTask(taskId: string): readonly string[] {
    const revoked: string[] = [];
    for (const [leaseId, lease] of this.#leases.entries()) {
      if (lease.taskId === taskId && lease.status === "active") {
        this.#leases.set(leaseId, Object.freeze({ ...lease, status: "revoked" }));
        revoked.push(leaseId);
      }
    }
    return Object.freeze(revoked.sort());
  }

  cleanupExpired(now: Date): readonly string[] {
    const expired: string[] = [];
    for (const [leaseId, lease] of this.#leases.entries()) {
      if (lease.status === "active" && now.getTime() >= Date.parse(lease.expiresAt)) {
        this.#leases.set(leaseId, Object.freeze({ ...lease, status: "expired" }));
        expired.push(leaseId);
      }
    }
    return Object.freeze(expired.sort());
  }

  snapshot(): readonly GovernanceResourceLease[] {
    return Object.freeze([...this.#leases.values()]);
  }
}

export type RollbackAuthorityResult = Readonly<{
  taskId: string;
  planSnapshotHash: string;
  status: "rollback_succeeded" | "rollback_failed";
  restoredStateHash: string | null;
  revokedCapabilityIds: readonly string[];
  releasedLeaseIds: readonly string[];
  stoppedChildTaskIds: readonly string[];
  oldPlanInvalidated: true;
  diagnosticCapabilityOnly: boolean;
  quarantined: boolean;
  ownerEscalationRequired: boolean;
  evaluatorPostRollbackRequired: true;
}>;

export const recordRollbackAuthorityOutcome = (input: {
  taskId: string;
  planSnapshotHash: string;
  succeeded: boolean;
  restoredState: unknown;
  writeCapabilityIds: readonly string[];
  leaseIds: readonly string[];
  childTaskIds: readonly string[];
}): RollbackAuthorityResult => {
  if (
    !validId(input.taskId) ||
    !validHash(input.planSnapshotHash) ||
    !input.writeCapabilityIds.every(validId) ||
    !input.leaseIds.every(validId) ||
    !input.childTaskIds.every(validId)
  ) {
    throw new Error("rollback_outcome_invalid");
  }
  return Object.freeze({
    taskId: input.taskId,
    planSnapshotHash: input.planSnapshotHash,
    status: input.succeeded ? "rollback_succeeded" : "rollback_failed",
    restoredStateHash: input.succeeded
      ? canonicalGovernanceHash(input.restoredState)
      : null,
    revokedCapabilityIds: Object.freeze([...input.writeCapabilityIds]),
    releasedLeaseIds: Object.freeze([...input.leaseIds]),
    stoppedChildTaskIds: Object.freeze([...input.childTaskIds]),
    oldPlanInvalidated: true,
    diagnosticCapabilityOnly: input.succeeded,
    quarantined: !input.succeeded,
    ownerEscalationRequired: !input.succeeded,
    evaluatorPostRollbackRequired: true,
  });
};

export type CognitiveCanarySwitches = Readonly<{
  cognitive_research_enabled: boolean;
  cognitive_memory_enabled: boolean;
  cognitive_collective_deliberation_enabled: boolean;
  cognitive_draft_pr_executor_enabled: boolean;
  cognitive_scheduled_level01_enabled: boolean;
  cognitive_level2_production_repairs_enabled: false;
  cognitive_user_derived_memory_enabled: false;
}>;

export const INITIAL_COGNITIVE_CANARY_SWITCHES: CognitiveCanarySwitches =
  Object.freeze({
    cognitive_research_enabled: false,
    cognitive_memory_enabled: false,
    cognitive_collective_deliberation_enabled: false,
    cognitive_draft_pr_executor_enabled: false,
    cognitive_scheduled_level01_enabled: false,
    cognitive_level2_production_repairs_enabled: false,
    cognitive_user_derived_memory_enabled: false,
  });

export const REQUIRED_STAKEHOLDER_GROUPS = [
  "normal_users",
  "creators",
  "subscribers_buyers",
  "minors_safety_sensitive_users",
  "accessibility_users",
  "moderators_admins",
  "owner_operations",
  "android",
  "ios",
  "web",
  "privacy",
  "security",
  "support",
  "infrastructure_cost",
  "provider_cost",
  "legal_compliance",
] as const;

export const validateStakeholderImpactCoverage = (
  impactHashes: Readonly<Record<string, string>>,
): readonly string[] =>
  Object.freeze(
    REQUIRED_STAKEHOLDER_GROUPS.flatMap((group) =>
      validHash(impactHashes[group]) ? [] : [`stakeholder_missing:${group}`],
    ),
  );

export type ConstitutionAmendmentRequest = Readonly<{
  priorConstitutionHash: string;
  proposedConstitutionHash: string;
  proposedDiffHash: string;
  independentSecurityReviewHash: string;
  adversarialTestManifestHash: string;
  ownerApprovalVersionId: string;
  ownerIdentityHash: string;
  proposerIdentityHash: string;
  rollbackHash: string;
  proposedAt: string;
  activatesAt: string;
}>;

export const validateConstitutionAmendment = (
  request: ConstitutionAmendmentRequest,
): readonly string[] => {
  const blockers: string[] = [];
  const hashes = [
    request.priorConstitutionHash,
    request.proposedConstitutionHash,
    request.proposedDiffHash,
    request.independentSecurityReviewHash,
    request.adversarialTestManifestHash,
    request.ownerIdentityHash,
    request.proposerIdentityHash,
    request.rollbackHash,
  ];
  if (!hashes.every(validHash)) blockers.push("constitution_evidence_invalid");
  if (!validId(request.ownerApprovalVersionId)) blockers.push("owner_approval_missing");
  if (request.ownerIdentityHash === request.proposerIdentityHash) {
    blockers.push("constitution_self_amendment_forbidden");
  }
  const proposedAt = Date.parse(request.proposedAt);
  const activatesAt = Date.parse(request.activatesAt);
  if (
    !Number.isFinite(proposedAt) ||
    !Number.isFinite(activatesAt) ||
    activatesAt - proposedAt < APPROVAL_WINDOW_MS
  ) {
    blockers.push("constitution_activation_delay_required");
  }
  return Object.freeze(blockers);
};

export class DeliberationRoundLedger {
  readonly #assessments = new Map<string, CouncilAssessment>();
  readonly #identityRound = new Set<string>();

  submit(
    assessment: CouncilAssessment,
    visiblePriorAssessmentHashes: readonly string[],
  ): void {
    const blockers = [...validateCouncilAssessment(assessment)];
    if (assessment.recused) blockers.push("recused_assessor_cannot_submit");
    if (assessment.round === 1 && visiblePriorAssessmentHashes.length > 0) {
      blockers.push("blind_round_contaminated");
    }
    const identityRoundKey = `${assessment.assessorIdentityHash}:${assessment.round}`;
    if (this.#identityRound.has(identityRoundKey)) {
      blockers.push("duplicate_assessor_round");
    }
    if (this.#assessments.has(assessment.assessmentId)) {
      blockers.push("assessment_replay");
    }
    if (blockers.length > 0) throw new Error(blockers.join(","));
    this.#assessments.set(
      assessment.assessmentId,
      Object.freeze({
        ...assessment,
        uncertainty: Object.freeze([...assessment.uncertainty]),
        evidenceHashes: Object.freeze([...assessment.evidenceHashes]),
      }),
    );
    this.#identityRound.add(identityRoundKey);
  }

  snapshot(): readonly CouncilAssessment[] {
    return Object.freeze([...this.#assessments.values()]);
  }
}

export type DecisionCapabilityAuthorization = Readonly<{
  authorizationId: string;
  taskId: string;
  decisionHash: string;
  approvalVersionId: string;
  capabilityScopeHash: string;
  maximumExecutions: number;
  expiresAt: string;
}>;

export class DecisionCapabilityAuthority {
  readonly #authorizedDecisions = new Set<string>();

  authorize(input: {
    authorizationId: string;
    manifest: GovernanceDecisionManifest;
    evaluation: GovernanceDecisionEvaluation;
    approval: GovernanceApprovalEnvelope;
    currentSourceCommit: string;
    currentGraphDigest: string;
    expectedOwnerIdentityHash: string;
    now: Date;
    emergencyStop: boolean;
  }): DecisionCapabilityAuthorization {
    const { decisionHash: suppliedDecisionHash, ...manifestBody } = input.manifest;
    if (
      input.evaluation.state !== "quorum_met" ||
      canonicalGovernanceHash(manifestBody) !== suppliedDecisionHash ||
      input.manifest.decisionHash !== input.approval.decisionManifestHash ||
      input.manifest.sourceCommit !== input.currentSourceCommit ||
      input.manifest.architectureGraphDigest !== input.currentGraphDigest ||
      input.now.getTime() >= Date.parse(input.manifest.expiresAt) ||
      validateApprovalEnvelope(input.approval, input.now).length > 0 ||
      input.approval.ownerIdentityHash !== input.expectedOwnerIdentityHash ||
      input.emergencyStop ||
      this.#authorizedDecisions.has(input.manifest.decisionHash) ||
      !validId(input.authorizationId)
    ) {
      throw new Error("decision_capability_not_authorized");
    }
    this.#authorizedDecisions.add(input.manifest.decisionHash);
    return Object.freeze({
      authorizationId: input.authorizationId,
      taskId: input.manifest.taskId,
      decisionHash: input.manifest.decisionHash,
      approvalVersionId: input.approval.approvalVersionId,
      capabilityScopeHash: input.manifest.capabilityScopeHash,
      maximumExecutions: input.manifest.maximumExecutions,
      expiresAt: input.manifest.expiresAt,
    });
  }
}

export type GovernanceAppeal = Readonly<{
  appealId: string;
  priorDecisionHash: string;
  newEvidenceHash: string;
  priorNewEvidenceHash: string | null;
  state: "opened" | "denied" | "accepted" | "closed";
  version: number;
  createdAt: string;
}>;

export class GovernanceAppealLedger {
  readonly #appeals = new Map<string, GovernanceAppeal>();
  readonly #evidenceKeys = new Set<string>();

  open(input: Omit<GovernanceAppeal, "state">): GovernanceAppeal {
    const evidenceKey = `${input.priorDecisionHash}:${input.newEvidenceHash}`;
    if (
      !validId(input.appealId) ||
      !validHash(input.priorDecisionHash) ||
      !validHash(input.newEvidenceHash) ||
      !validDate(input.createdAt) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      this.#appeals.has(input.appealId) ||
      this.#evidenceKeys.has(evidenceKey) ||
      input.priorNewEvidenceHash === input.newEvidenceHash
    ) {
      throw new Error("appeal_material_evidence_required");
    }
    const appeal = Object.freeze({ ...input, state: "opened" as const });
    this.#appeals.set(appeal.appealId, appeal);
    this.#evidenceKeys.add(evidenceKey);
    return appeal;
  }
}

export const COGNITIVE_CALIBRATION_FIELDS = [
  "source_reliability",
  "council_role_calibration",
  "tool_preference",
  "test_preference",
  "playbook_confidence",
  "expected_cost_time",
  "model_routing_preference",
] as const;

export const validateOutcomeCalibration = (input: {
  predictedOutcomeHash: string;
  actualOutcomeHash: string;
  updates: Readonly<Record<string, number>>;
  evaluatorResult: "PASS" | "FAIL" | "INCOMPLETE" | "BLOCKED";
}): Readonly<{
  accepted: boolean;
  reconsiderationRequired: boolean;
  blockers: readonly string[];
}> => {
  const blockers: string[] = [];
  if (!validHash(input.predictedOutcomeHash) || !validHash(input.actualOutcomeHash)) {
    blockers.push("outcome_hash_invalid");
  }
  for (const [key, value] of Object.entries(input.updates)) {
    if (
      !(COGNITIVE_CALIBRATION_FIELDS as readonly string[]).includes(key) ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      blockers.push(`calibration_field_rejected:${key}`);
    }
  }
  const reconsiderationRequired =
    input.predictedOutcomeHash !== input.actualOutcomeHash ||
    input.evaluatorResult !== "PASS";
  return Object.freeze({
    accepted: blockers.length === 0,
    reconsiderationRequired,
    blockers: Object.freeze(blockers),
  });
};

export const validateEvaluatorIndependence = (input: {
  executorIdentityHash: string;
  evaluatorIdentityHash: string;
  ownerIdentityHash: string;
  evaluatorHasWriteCapability: boolean;
  evaluatorHasApprovalCapability: boolean;
}): readonly string[] => {
  const blockers: string[] = [];
  if (
    ![
      input.executorIdentityHash,
      input.evaluatorIdentityHash,
      input.ownerIdentityHash,
    ].every(validHash)
  ) {
    blockers.push("identity_hash_invalid");
  }
  if (
    input.evaluatorIdentityHash === input.executorIdentityHash ||
    input.evaluatorIdentityHash === input.ownerIdentityHash
  ) {
    blockers.push("evaluator_identity_conflict");
  }
  if (input.evaluatorHasWriteCapability) blockers.push("evaluator_write_forbidden");
  if (input.evaluatorHasApprovalCapability) {
    blockers.push("evaluator_approval_forbidden");
  }
  return Object.freeze(blockers);
};
