import crypto from "node:crypto";

export const OWNER_JURISDICTION_DECISION_V2_MARKER = "<!-- chillywood-owner-jurisdiction-decision-v2 -->";
export const OWNER_JURISDICTION_POLICY_CHAIN_V2_MARKER = "<!-- chillywood-owner-jurisdiction-policy-chain-v2 -->";
export const FINITE_TASK_ADMISSION_V2_MARKER = "<!-- chillywood-finite-task-admission-v2 -->";
export const FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER = "<!-- chillywood-finite-task-admission-final-source-v2 -->";
export const LEGACY_OWNER_AUTHORIZATION_V1_MARKER = "<!-- chillywood-engineering-owner-authorization-v1 -->";
export const LEGACY_FINITE_TASK_ADMISSION_V1_MARKER = "<!-- chillywood-finite-task-admission-v1 -->";

export const OWNER_JURISDICTION_DECISION_V2 = "OWNER_JURISDICTION_DECISION_V2";
export const OWNER_JURISDICTION_STANDING_POLICY_V2 = "OWNER_JURISDICTION_STANDING_POLICY_V2";
export const OWNER_JURISDICTION_TASK_BINDING_V2 = "OWNER_JURISDICTION_TASK_BINDING_V2";
export const OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2 = "OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2";
export const FINITE_TASK_ADMISSION_V2 = "FINITE_TASK_ADMISSION_V2";
export const FINITE_TASK_ADMISSION_FINAL_SOURCE_V2 = "FINITE_TASK_ADMISSION_FINAL_SOURCE_V2";

export const JURISDICTION_POLICY_INVARIANT = "STANDING_POLICY_MAY_BE_REUSED; DOMAIN_COVERAGE_NEVER_IS";
export const ACTIVE_POLICY_STATUS = "ACTIVE_UNTIL_OWNER_SUPERSESSION_OR_REVOCATION";
export const REVOKED_POLICY_STATUS = "REVOKED_NO_AUTHORITY";

export const MAX_CANONICAL_COMMENT_BYTES = 131_072;
export const MAX_CANONICAL_JSON_DEPTH = 24;
export const MAX_CANONICAL_JSON_VALUES = 4_096;

export const PROHIBITED_AUTHORITY_KEYS = Object.freeze([
  "providerMutationAllowed",
  "databaseDeploymentAllowed",
  "buildAllowed",
  "submissionAllowed",
  "otaAllowed",
  "publicReleaseAllowed",
]);

export const STANDING_POLICY_INHERITANCE_ALLOWLIST = Object.freeze([
  "authoritativeRestrictions",
  "initialRollout",
  "nonUnitedStatesAvailability",
  "ownerComplianceAttestation",
  "primaryMarket",
  "unitedStatesTerritories",
]);

export const STANDING_POLICY_INHERITANCE_DENYLIST = Object.freeze([
  "admission",
  "attestation",
  "buildAuthority",
  "certificate",
  "ci",
  "creatorAgeAuthority",
  "databaseDeploymentAuthority",
  "dataResidencyProof",
  "domainApplications",
  "domainCoverage",
  "edgeClosure",
  "entitlementAuthority",
  "implementationAuthority",
  "lease",
  "legalProviderStoreTaxKycSanctionsStateProof",
  "model",
  "moneyAuthority",
  "operationalDataRollbackSecurityModerationEscalationProviderOwnership",
  "otaAuthority",
  "pathsAndBudget",
  "providerMutationAuthority",
  "publicReleaseAuthority",
  "review",
  "scope",
  "submissionAuthority",
  "taskArtifact",
  "taskHeadTree",
  "taskPr",
  "wave1PayoutAuthority",
]);

export const EXTERNAL_PROOF_CATEGORIES = Object.freeze([
  "DATA_RESIDENCY",
  "INSTALLED_PHYSICAL",
  "KYC",
  "LEGAL",
  "PROVIDER",
  "PROVIDER_REGION",
  "REFUND_RESTORE_REVOCATION_ROLLBACK",
  "SANCTIONS",
  "SIGNED_ARTIFACT",
  "STATE_SPECIFIC",
  "STORE",
  "TAX",
]);

export const NEW_OWNER_DECISION_TRIGGERS = Object.freeze([
  "CAPABILITY_SPECIFIC_JURISDICTION_CONFLICT_REQUIRING_OWNER_CHOICE",
  "EXPANSION_OUTSIDE_UNITED_STATES",
  "EXPLICIT_POLICY_NARROWING_REPLACEMENT_REVOCATION_OR_SUPERSESSION",
  "INCLUSION_OF_A_UNITED_STATES_TERRITORY",
  "OTHER_JURISDICTION_CHOICE_NOT_ANSWERED_BY_STANDING_POLICY",
  "ROLLOUT_POLICY_CHANGE",
]);

export const OWNER_DECISION_NON_TRIGGERS = Object.freeze([
  "DIFFERENT_EXACT_DOMAIN_SET",
  "EXPIRED_OR_CLOSED_PRIOR_LEASE",
  "LATER_PRE_RELEASE_WAVE",
  "MISSING_OR_STALE_EXTERNAL_EVIDENCE",
  "NARROW_AUTHORITATIVE_FAIL_CLOSED_RESTRICTION",
  "NEW_FINITE_TASK",
]);

const HASH_DOMAINS = Object.freeze({
  standingPolicy: "chillywood/owner-jurisdiction/standing-policy/v2",
  taskBinding: "chillywood/owner-jurisdiction/task-binding/v2",
  operationalOwners: "chillywood/owner-jurisdiction/operational-owner-projection/v2",
  ownerSubject: "chillywood/owner-jurisdiction/decision-subject/v2",
  ownerContext: "chillywood/owner-jurisdiction/comment-context/v2",
  ownerEnvelope: "chillywood/owner-jurisdiction/decision-envelope/v2",
  ownerBody: "chillywood/owner-jurisdiction/decision-body/v2",
  policyChainSubject: "chillywood/owner-jurisdiction/policy-chain-subject/v2",
  policyChainEnvelope: "chillywood/owner-jurisdiction/policy-chain-envelope/v2",
  policyChainBody: "chillywood/owner-jurisdiction/policy-chain-body/v2",
  admissionSubject: "chillywood/finite-task-admission/subject/v2",
  admissionContext: "chillywood/finite-task-admission/comment-context/v2",
  admissionEnvelope: "chillywood/finite-task-admission/envelope/v2",
  admissionBody: "chillywood/finite-task-admission/body/v2",
  admissionFinalSourceSubject: "chillywood/finite-task-admission/final-source-subject/v2",
  admissionFinalSourceContext: "chillywood/finite-task-admission/final-source-context/v2",
  admissionFinalSourceEnvelope: "chillywood/finite-task-admission/final-source-envelope/v2",
  admissionFinalSourceBody: "chillywood/finite-task-admission/final-source-body/v2",
});

const utf8Compare = (left, right) => Buffer.compare(Buffer.from(String(left), "utf8"), Buffer.from(String(right), "utf8"));
const sorted = (values) => [...values].sort(utf8Compare);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const isSha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const isGitSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const clone = (value) => structuredClone(value);
const deepFreeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const isCanonicalTimestamp = (value) => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value.replace(/Z$/u, ".000Z");
const trustedPolicyResolutions = new WeakSet();
const trustedEmbeddedPolicyContexts = new WeakSet();

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort(utf8Compare).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return JSON.stringify(value);
  throw new TypeError("CANONICAL_JSON_UNSUPPORTED_VALUE");
}

export function typeSeparatedHash(domain, value) {
  if (!Object.values(HASH_DOMAINS).includes(domain)) throw new TypeError("UNKNOWN_HASH_DOMAIN");
  return crypto.createHash("sha256").update(canonicalJson({ algorithm: "SHA-256", domain, value }), "utf8").digest("hex");
}

export const jurisdictionHashDomains = Object.freeze({ ...HASH_DOMAINS });

const legacyHash = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value), "utf8").digest("hex");
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const exactKeys = (value, expected) => isObject(value) && canonicalJson(sorted(Object.keys(value))) === canonicalJson(sorted(expected));
const allFalseAuthority = () => Object.freeze(Object.fromEntries(PROHIBITED_AUTHORITY_KEYS.map((key) => [key, false])));
const authorityIsFalse = (value) => exactKeys(value, PROHIBITED_AUTHORITY_KEYS) && PROHIBITED_AUTHORITY_KEYS.every((key) => value[key] === false);
const exactStringSet = (value, expected) => Array.isArray(value) && canonicalJson(value) === canonicalJson(expected);

function scanCanonicalJson(text) {
  let index = 0;
  let values = 0;
  const fail = (reason) => { throw new SyntaxError(reason); };
  const bump = (depth) => {
    values += 1;
    if (values > MAX_CANONICAL_JSON_VALUES) fail("CANONICAL_JSON_VALUE_LIMIT");
    if (depth > MAX_CANONICAL_JSON_DEPTH) fail("CANONICAL_JSON_DEPTH_LIMIT");
  };
  const stringToken = () => {
    if (text[index] !== '"') fail("EXPECTED_STRING");
    const start = index++;
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') {
        const raw = text.slice(start, index);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { fail("INVALID_STRING"); }
        return { raw, parsed };
      }
      if (character === "\\") {
        if (index >= text.length) fail("INVALID_ESCAPE");
        const escape = text[index++];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(index, index + 4))) fail("INVALID_UNICODE_ESCAPE");
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escape)) fail("INVALID_ESCAPE");
      } else if (character.charCodeAt(0) < 0x20) fail("CONTROL_CHARACTER_IN_STRING");
    }
    fail("UNTERMINATED_STRING");
  };
  const value = (depth) => {
    bump(depth);
    const character = text[index];
    if (character === '"') { stringToken(); return; }
    if (character === "{") {
      index += 1;
      const keys = new Set();
      if (text[index] === "}") { index += 1; return; }
      while (index < text.length) {
        const key = stringToken().parsed;
        if (keys.has(key)) fail("DUPLICATE_JSON_KEY");
        keys.add(key);
        if (text[index++] !== ":") fail("EXPECTED_COLON");
        value(depth + 1);
        if (text[index] === "}") { index += 1; return; }
        if (text[index++] !== ",") fail("EXPECTED_COMMA");
      }
      fail("UNTERMINATED_OBJECT");
    }
    if (character === "[") {
      index += 1;
      if (text[index] === "]") { index += 1; return; }
      while (index < text.length) {
        value(depth + 1);
        if (text[index] === "]") { index += 1; return; }
        if (text[index++] !== ",") fail("EXPECTED_COMMA");
      }
      fail("UNTERMINATED_ARRAY");
    }
    const match = text.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u);
    if (!match) fail("INVALID_JSON_VALUE");
    index += match[0].length;
  };
  value(0);
  if (index !== text.length) fail("TRAILING_UNSIGNED_CONTENT");
  return { values };
}

export function parseCanonicalMarkedComment(body, marker, { maxBytes = MAX_CANONICAL_COMMENT_BYTES } = {}) {
  if (!isText(body) || Buffer.byteLength(body, "utf8") > maxBytes) return { ok: false, finding: "COMMENT_SIZE_INVALID" };
  if (!isText(marker) || body.split(marker).length !== 2 || !body.startsWith(`${marker}\n`)) return { ok: false, finding: "COMMENT_MARKER_INVALID" };
  const text = body.slice(marker.length + 1);
  if (!text || text.includes(`\n${marker}`)) return { ok: false, finding: "MULTIPLE_MARKERS_OR_PAYLOADS" };
  try {
    scanCanonicalJson(text);
    const payload = JSON.parse(text);
    if (!isObject(payload) || canonicalJson(payload) !== text) return { ok: false, finding: "NONCANONICAL_JSON" };
    return { ok: true, payload };
  } catch (error) {
    return { ok: false, finding: error instanceof Error ? error.message : "INVALID_JSON" };
  }
}

const SCOPE_KEYS = ["launchProgram", "product", "repository"];
const OWNER_KEYS = ["association", "login"];
const POLICY_VALUE_KEYS = [
  "activation",
  "authoritativeRestrictions",
  "dataResidencyRegion",
  "exposure",
  "initialRollout",
  "nonUnitedStatesAvailability",
  "ownerComplianceAttestation",
  "primaryMarket",
  "sourceEngineering",
  "unitedStatesTerritories",
];
const PREDECESSOR_KEYS = ["commentId", "standingPolicyHash"];
const STANDING_POLICY_KEYS = [
  "action",
  "applicability",
  "authority",
  "effectiveAtSource",
  "externalEvidence",
  "inheritance",
  "newOwnerDecisionTriggers",
  "nonTriggers",
  "owner",
  "policy",
  "policyClass",
  "predecessor",
  "reason",
  "schemaVersion",
  "scope",
  "sequence",
  "status",
  "type",
];

const exactScope = (scope) => exactKeys(scope, SCOPE_KEYS) && SCOPE_KEYS.every((key) => isText(scope[key]));
const exactOwner = (owner) => exactKeys(owner, OWNER_KEYS) && isText(owner.login) && owner.association === "OWNER";
const sameScope = (left, right) => exactScope(left) && exactScope(right) && canonicalJson(left) === canonicalJson(right);

export function standardUnitedStatesStandingPolicyV2({
  scope,
  owner,
  action = "ESTABLISH",
  sequence = 0,
  predecessor = null,
  reason = "ESTABLISH_REUSABLE_UNITED_STATES_LAUNCH_MARKET_POLICY",
  policy = undefined,
} = {}) {
  const active = action !== "REVOKE";
  const policyValue = policy === undefined && active ? {
    activation: "NO_SEPARATE_PRODUCT_IMPLEMENTATION_PROJECT",
    authoritativeRestrictions: "FAIL_CLOSED_CAPABILITY_SCOPED_NO_CLIENT_OR_UI_OVERRIDE",
    dataResidencyRegion: "NOT_ESTABLISHED",
    exposure: "AVAILABILITY_GATED_WHILE_EXTERNAL_EVIDENCE_INCOMPLETE",
    initialRollout: "CONTROLLED_1_PERCENT_UNITED_STATES",
    nonUnitedStatesAvailability: "NOT_AUTHORIZED",
    ownerComplianceAttestation: "NOT_SELF_ATTESTED",
    primaryMarket: "UNITED_STATES_ONLY",
    sourceEngineering: "PRODUCTION_COMPLETE_FOR_APPROVED_UNITED_STATES_SCOPE",
    unitedStatesTerritories: "EXCLUDED_UNLESS_SEPARATELY_AUTHORIZED",
  } : policy ?? null;
  return {
    action,
    applicability: active ? {
      conflictRequirement: "NO_GENUINELY_CONFLICTING_CAPABILITY_SPECIFIC_OWNER_CHOICE",
      domainCoverage: "NEVER_AUTOMATIC_ALWAYS_EXACT_TASK_BINDING",
      expiresOnWaveOrLeaseClosure: false,
      sameLaunchProgramOnly: true,
      sameProductOnly: true,
      sameRepositoryOnly: true,
      subsequentPreReleaseWaves: true,
    } : null,
    authority: allFalseAuthority(),
    effectiveAtSource: "IMMUTABLE_COMMENT_CREATED_AT",
    externalEvidence: active ? {
      categories: [...EXTERNAL_PROOF_CATEGORIES],
      classification: "BLOCKED_EXTERNAL_UNTIL_INDEPENDENTLY_VERIFIED",
      inherited: false,
    } : null,
    inheritance: active ? {
      allowedStandingPolicyFields: [...STANDING_POLICY_INHERITANCE_ALLOWLIST],
      deniedSemantics: [...STANDING_POLICY_INHERITANCE_DENYLIST],
      exactTaskDomainBindingRequired: true,
      futureTaskMustReferenceCommentAndStandingPolicyHash: true,
      policyIsAutomaticTaskCoverage: false,
      policyIsDomain: false,
      policyIsWildcard: false,
      unlistedFieldsInheritable: false,
      wave1TaskBindingReusable: false,
    } : null,
    newOwnerDecisionTriggers: active ? [...NEW_OWNER_DECISION_TRIGGERS] : null,
    nonTriggers: active ? [...OWNER_DECISION_NON_TRIGGERS] : null,
    owner: clone(owner),
    policy: policyValue,
    policyClass: "OWNER_JURISDICTION_DECISION",
    predecessor: predecessor === null ? null : clone(predecessor),
    reason,
    schemaVersion: 2,
    scope: clone(scope),
    sequence,
    status: active ? ACTIVE_POLICY_STATUS : REVOKED_POLICY_STATUS,
    type: OWNER_JURISDICTION_STANDING_POLICY_V2,
  };
}

function standingPolicyFindings(policy) {
  const findings = [];
  if (!exactKeys(policy, STANDING_POLICY_KEYS)) findings.push("STANDING_POLICY_FIELDS_INVALID");
  if (policy?.schemaVersion !== 2 || policy?.type !== OWNER_JURISDICTION_STANDING_POLICY_V2 || policy?.policyClass !== "OWNER_JURISDICTION_DECISION") findings.push("STANDING_POLICY_TYPE_INVALID");
  if (!exactScope(policy?.scope) || !exactOwner(policy?.owner)) findings.push("STANDING_POLICY_SCOPE_OR_OWNER_INVALID");
  if (!["ESTABLISH", "SUPERSEDE", "REVOKE"].includes(policy?.action)) findings.push("STANDING_POLICY_ACTION_INVALID");
  if (!Number.isSafeInteger(policy?.sequence) || policy.sequence < 0 || !isText(policy?.reason) || policy?.effectiveAtSource !== "IMMUTABLE_COMMENT_CREATED_AT") findings.push("STANDING_POLICY_SEQUENCE_INVALID");
  if (!authorityIsFalse(policy?.authority)) findings.push("PROHIBITED_AUTHORITY_PRESENT");
  const genesis = policy?.action === "ESTABLISH";
  if (genesis !== (policy?.sequence === 0 && policy?.predecessor === null)) findings.push("STANDING_POLICY_GENESIS_INVALID");
  if (!genesis && policy?.sequence < 1) findings.push("STANDING_POLICY_SEQUENCE_INVALID");
  if (!genesis && (!exactKeys(policy?.predecessor, PREDECESSOR_KEYS) || !isPositiveInteger(policy?.predecessor?.commentId) || !isSha256(policy?.predecessor?.standingPolicyHash))) findings.push("STANDING_POLICY_PREDECESSOR_INVALID");
  if (policy?.action === "REVOKE") {
    if (policy.status !== REVOKED_POLICY_STATUS || policy.policy !== null || policy.applicability !== null || policy.externalEvidence !== null || policy.inheritance !== null || policy.newOwnerDecisionTriggers !== null || policy.nonTriggers !== null) findings.push("REVOCATION_AUTHORITY_INVALID");
    return findings;
  }
  if (policy?.status !== ACTIVE_POLICY_STATUS || !exactKeys(policy?.policy, POLICY_VALUE_KEYS) || POLICY_VALUE_KEYS.some((key) => !isText(policy?.policy?.[key]) || policy.policy[key].length > 256)) findings.push("STANDING_POLICY_VALUE_FIELDS_INVALID");
  const expectedValues = standardUnitedStatesStandingPolicyV2({ scope: policy?.scope, owner: policy?.owner }).policy;
  if (policy?.action === "ESTABLISH" && canonicalJson(policy?.policy) !== canonicalJson(expectedValues)) findings.push("STANDING_POLICY_GENESIS_VALUE_INVALID");
  if ((policy?.policy?.primaryMarket === "UNITED_STATES_ONLY") !== (policy?.policy?.nonUnitedStatesAvailability === "NOT_AUTHORIZED")) findings.push("STANDING_POLICY_MARKET_AVAILABILITY_CONTRADICTION");
  if (["activation", "authoritativeRestrictions", "dataResidencyRegion", "exposure", "ownerComplianceAttestation", "sourceEngineering"].some((key) => policy?.policy?.[key] !== expectedValues[key])) findings.push("STANDING_POLICY_SAFETY_INVARIANT_INVALID");
  const applicabilityKeys = ["conflictRequirement", "domainCoverage", "expiresOnWaveOrLeaseClosure", "sameLaunchProgramOnly", "sameProductOnly", "sameRepositoryOnly", "subsequentPreReleaseWaves"];
  if (!exactKeys(policy?.applicability, applicabilityKeys) || policy.applicability.conflictRequirement !== "NO_GENUINELY_CONFLICTING_CAPABILITY_SPECIFIC_OWNER_CHOICE" || policy.applicability.expiresOnWaveOrLeaseClosure !== false || ["sameLaunchProgramOnly", "sameProductOnly", "sameRepositoryOnly", "subsequentPreReleaseWaves"].some((key) => policy.applicability[key] !== true) || policy.applicability.domainCoverage !== "NEVER_AUTOMATIC_ALWAYS_EXACT_TASK_BINDING") findings.push("STANDING_POLICY_APPLICABILITY_INVALID");
  if (!exactKeys(policy?.externalEvidence, ["categories", "classification", "inherited"]) || !exactStringSet(policy?.externalEvidence?.categories, EXTERNAL_PROOF_CATEGORIES) || policy?.externalEvidence?.classification !== "BLOCKED_EXTERNAL_UNTIL_INDEPENDENTLY_VERIFIED" || policy?.externalEvidence?.inherited !== false) findings.push("EXTERNAL_PROOF_INHERITANCE_INVALID");
  const inheritanceKeys = ["allowedStandingPolicyFields", "deniedSemantics", "exactTaskDomainBindingRequired", "futureTaskMustReferenceCommentAndStandingPolicyHash", "policyIsAutomaticTaskCoverage", "policyIsDomain", "policyIsWildcard", "unlistedFieldsInheritable", "wave1TaskBindingReusable"];
  if (!exactKeys(policy?.inheritance, inheritanceKeys) || !exactStringSet(policy?.inheritance?.allowedStandingPolicyFields, STANDING_POLICY_INHERITANCE_ALLOWLIST) || !exactStringSet(policy?.inheritance?.deniedSemantics, STANDING_POLICY_INHERITANCE_DENYLIST) || policy?.inheritance?.exactTaskDomainBindingRequired !== true || policy?.inheritance?.futureTaskMustReferenceCommentAndStandingPolicyHash !== true || ["policyIsAutomaticTaskCoverage", "policyIsDomain", "policyIsWildcard", "unlistedFieldsInheritable", "wave1TaskBindingReusable"].some((key) => policy?.inheritance?.[key] !== false)) findings.push("STANDING_POLICY_INHERITANCE_INVALID");
  if (!exactStringSet(policy?.newOwnerDecisionTriggers, NEW_OWNER_DECISION_TRIGGERS) || !exactStringSet(policy?.nonTriggers, OWNER_DECISION_NON_TRIGGERS)) findings.push("OWNER_DECISION_TRIGGER_CONTRACT_INVALID");
  return findings;
}

export function projectRegisteredDomainOwners(registry, domainIds) {
  if (!isObject(registry) || !Array.isArray(registry.features)) throw new TypeError("FEATURE_REGISTRY_INVALID");
  const byId = new Map(registry.features.map((feature) => [feature.featureId, feature]));
  return domainIds.map((domainId) => {
    const feature = byId.get(domainId);
    if (!feature) throw new TypeError(`UNKNOWN_DOMAIN:${domainId}`);
    return {
      authorityOwner: feature.authority?.owner ?? null,
      cleanupOwner: feature.cleanup?.owner ?? null,
      domainId,
      mutableStateOwner: feature.authority?.mutableStateOwner ?? null,
      observabilityOwner: feature.observability?.owner ?? null,
      ownerSystems: sorted(feature.ownerSystems ?? []),
      productOwner: feature.productOwner ?? null,
      providers: sorted(feature.providers ?? []),
    };
  });
}

function exactDomainIds(domainIds, registry) {
  if (!Array.isArray(domainIds) || domainIds.length === 0 || domainIds.length > 256) return false;
  if (domainIds.some((domain) => !isText(domain) || domain === "*" || domain.includes("*") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(domain) || domain.normalize("NFC") !== domain)) return false;
  if (new Set(domainIds).size !== domainIds.length || canonicalJson(domainIds) !== canonicalJson(sorted(domainIds))) return false;
  if (registry) {
    const registered = new Set((registry.features ?? []).map(({ featureId }) => featureId));
    if (domainIds.some((domain) => !registered.has(domain))) return false;
  }
  return true;
}

const TASK_IDENTITY_KEYS = ["implementationBranch", "implementationPr", "leaseId", "originalSeedHead", "originalSeedTree", "ownerApprovalCommentId", "planningHead", "planningTree", "taskArtifactPath", "taskId"];
const TASK_EVIDENCE_KEYS = ["closurePacketHash", "completenessCertificateHash", "taskArtifactHash", "taskLocalEdgeClosureHash", "taskLocalEdgeEvidenceHash", "taskLocalModelHash"];
const APPLICATION_KEYS = ["decision", "domainId", "jurisdictionDecisionOwner", "market", "minimumCreatorAge"];
const OWNER_PROJECTION_KEYS = ["authorityOwner", "cleanupOwner", "domainId", "mutableStateOwner", "observabilityOwner", "ownerSystems", "productOwner", "providers"];
const TASK_BINDING_KEYS = [
  "authority",
  "bindingHash",
  "capabilitySpecificConflicts",
  "domainApplications",
  "domainCoverageReusable",
  "domainCoverageSource",
  "domainIds",
  "externalProofInherited",
  "inheritedStandingPolicy",
  "jurisdictionDecisionOwner",
  "operationalOwnerProjection",
  "operationalOwnerProjectionHash",
  "operationalOwnersPreserved",
  "policyReference",
  "schemaVersion",
  "scope",
  "taskEvidence",
  "taskIdentity",
  "taskSpecific",
  "type",
];

function taskIdentityValid(task) {
  return exactKeys(task, TASK_IDENTITY_KEYS)
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(task.taskId ?? "")
    && isPositiveInteger(task.implementationPr)
    && isText(task.implementationBranch)
    && task.leaseId === task.taskId
    && isPositiveInteger(task.ownerApprovalCommentId)
    && typeof task.taskArtifactPath === "string"
    && new RegExp(`^docs/assurance/tasks/${task.taskId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.json$`, "u").test(task.taskArtifactPath)
    && [task.originalSeedHead, task.planningHead].every(isGitSha)
    && [task.originalSeedTree, task.planningTree].every(isGitSha);
}

function taskEvidenceValid(evidence) {
  return exactKeys(evidence, TASK_EVIDENCE_KEYS) && TASK_EVIDENCE_KEYS.every((key) => isSha256(evidence[key]));
}

function inheritedPolicyFields(policy) {
  return Object.fromEntries(STANDING_POLICY_INHERITANCE_ALLOWLIST.map((field) => [field, policy.policy[field]]));
}

function policyReferenceValid(reference, { embedded = false } = {}) {
  if (embedded) return exactKeys(reference, ["source", "standingPolicyHash", "standingPolicySequence", "standingPolicyStatus", "standingPolicyType", "standingPolicyVersion"]) && reference.source === "THIS_IMMUTABLE_OWNER_DECISION" && isSha256(reference.standingPolicyHash) && Number.isSafeInteger(reference.standingPolicySequence) && reference.standingPolicySequence >= 0 && reference.standingPolicyStatus === ACTIVE_POLICY_STATUS && reference.standingPolicyType === OWNER_JURISDICTION_STANDING_POLICY_V2 && reference.standingPolicyVersion === 2;
  return exactKeys(reference, ["commentId", "source", "standingPolicyHash", "standingPolicySequence", "standingPolicyStatus", "standingPolicyType", "standingPolicyVersion"]) && reference.source === "IMMUTABLE_OWNER_DECISION_COMMENT" && isPositiveInteger(reference.commentId) && isSha256(reference.standingPolicyHash) && Number.isSafeInteger(reference.standingPolicySequence) && reference.standingPolicySequence >= 0 && reference.standingPolicyStatus === ACTIVE_POLICY_STATUS && reference.standingPolicyType === OWNER_JURISDICTION_STANDING_POLICY_V2 && reference.standingPolicyVersion === 2;
}

function taskBindingBase({ scope, taskIdentity, policyReference, standingPolicy, domainIds, domainApplications, registry, taskEvidence, jurisdictionDecisionOwner, capabilitySpecificConflicts = [] }) {
  if (standingPolicyFindings(standingPolicy).length > 0 || standingPolicy.action === "REVOKE") throw new TypeError("STANDING_POLICY_INVALID_OR_REVOKED");
  if (!sameScope(scope, standingPolicy.scope) || !exactDomainIds(domainIds, registry)) throw new TypeError("TASK_BINDING_SCOPE_OR_DOMAINS_INVALID");
  if (!taskIdentityValid(taskIdentity) || !taskEvidenceValid(taskEvidence) || jurisdictionDecisionOwner !== standingPolicy.owner.login) throw new TypeError("TASK_BINDING_IDENTITY_OR_EVIDENCE_INVALID");
  if (!Array.isArray(domainApplications) || domainApplications.length !== domainIds.length) throw new TypeError("TASK_BINDING_APPLICATION_COUNT_INVALID");
  const applications = domainApplications.map((application) => clone(application));
  if (canonicalJson(applications.map(({ domainId }) => domainId)) !== canonicalJson(domainIds) || applications.some((application) => !exactKeys(application, APPLICATION_KEYS) || application.market !== standingPolicy.policy.primaryMarket || application.jurisdictionDecisionOwner !== jurisdictionDecisionOwner || !isText(application.decision) || application.decision.length > 8_192 || !(application.minimumCreatorAge === null || (Number.isSafeInteger(application.minimumCreatorAge) && application.minimumCreatorAge >= 18)))) throw new TypeError("TASK_BINDING_APPLICATION_INVALID");
  if (!Array.isArray(capabilitySpecificConflicts) || capabilitySpecificConflicts.length !== 0) throw new TypeError("GENUINE_CAPABILITY_SPECIFIC_OWNER_CHOICE_REQUIRED");
  const projection = projectRegisteredDomainOwners(registry, domainIds);
  const operationalOwnerProjectionHash = typeSeparatedHash(HASH_DOMAINS.operationalOwners, projection);
  return {
    authority: allFalseAuthority(),
    capabilitySpecificConflicts: [],
    domainApplications: applications,
    domainCoverageReusable: false,
    domainCoverageSource: "TASK_LOCAL_EXACT_ENUMERATION",
    domainIds: [...domainIds],
    externalProofInherited: false,
    inheritedStandingPolicy: inheritedPolicyFields(standingPolicy),
    jurisdictionDecisionOwner,
    operationalOwnerProjection: projection,
    operationalOwnerProjectionHash,
    operationalOwnersPreserved: true,
    policyReference: clone(policyReference),
    schemaVersion: 2,
    scope: clone(scope),
    taskEvidence: clone(taskEvidence),
    taskIdentity: clone(taskIdentity),
    taskSpecific: true,
    type: OWNER_JURISDICTION_TASK_BINDING_V2,
  };
}

const inheritedTaskDomainApplications = ({ domainIds, jurisdictionDecisionOwner, standingPolicy }) => domainIds.map((domainId) => ({
  decision: "INHERITED_STANDING_OWNER_LAUNCH_MARKET_POLICY_ONLY",
  domainId,
  jurisdictionDecisionOwner,
  market: standingPolicy.policy.primaryMarket,
  minimumCreatorAge: null,
}));

export function deriveTaskJurisdictionBindingV2({ policyReceipt, scope, taskIdentity, domainIds, registry, taskEvidence, jurisdictionDecisionOwner = "Chillywood2025", capabilitySpecificConflicts = [] } = {}) {
  if (!trustedPolicyResolutions.has(policyReceipt) || policyReceipt.ok !== true || policyReceipt.suppliesAuthority !== true || !isPositiveInteger(policyReceipt.commentId) || !isSha256(policyReceipt.commentBodyHash) || !isSha256(policyReceipt.standingPolicyHash) || policyReceipt.status !== ACTIVE_POLICY_STATUS) throw new TypeError("CURRENT_STANDING_POLICY_RECEIPT_REQUIRED");
  const computed = typeSeparatedHash(HASH_DOMAINS.standingPolicy, policyReceipt.standingPolicy);
  if (computed !== policyReceipt.standingPolicyHash) throw new TypeError("STANDING_POLICY_HASH_INVALID");
  const policyReference = {
    commentId: policyReceipt.commentId,
    source: "IMMUTABLE_OWNER_DECISION_COMMENT",
    standingPolicyHash: policyReceipt.standingPolicyHash,
    standingPolicySequence: policyReceipt.sequence,
    standingPolicyStatus: policyReceipt.status,
    standingPolicyType: OWNER_JURISDICTION_STANDING_POLICY_V2,
    standingPolicyVersion: 2,
  };
  const domainApplications = inheritedTaskDomainApplications({ domainIds, jurisdictionDecisionOwner, standingPolicy: policyReceipt.standingPolicy });
  const base = taskBindingBase({ scope, taskIdentity, policyReference, standingPolicy: policyReceipt.standingPolicy, domainIds, domainApplications, registry, taskEvidence, jurisdictionDecisionOwner, capabilitySpecificConflicts });
  return { ...base, bindingHash: typeSeparatedHash(HASH_DOMAINS.taskBinding, base) };
}

function embeddedTaskBinding({ standingPolicy, standingPolicyHash, ...input }) {
  const policyReference = { source: "THIS_IMMUTABLE_OWNER_DECISION", standingPolicyHash, standingPolicySequence: standingPolicy.sequence, standingPolicyStatus: standingPolicy.status, standingPolicyType: OWNER_JURISDICTION_STANDING_POLICY_V2, standingPolicyVersion: 2 };
  const base = taskBindingBase({ ...input, policyReference, standingPolicy });
  return { ...base, bindingHash: typeSeparatedHash(HASH_DOMAINS.taskBinding, base) };
}

export function verifyTaskJurisdictionBindingV2({ binding, registry, activePolicy, allowEmbeddedReference = false } = {}) {
  try {
  const findings = [];
  if (!exactKeys(binding, TASK_BINDING_KEYS) || binding?.schemaVersion !== 2 || binding?.type !== OWNER_JURISDICTION_TASK_BINDING_V2) findings.push("TASK_BINDING_FIELDS_OR_TYPE_INVALID");
  if (!exactScope(binding?.scope) || !taskIdentityValid(binding?.taskIdentity) || !taskEvidenceValid(binding?.taskEvidence)) findings.push("TASK_BINDING_IDENTITY_INVALID");
  if (!exactDomainIds(binding?.domainIds, registry)) findings.push("TASK_BINDING_DOMAINS_INVALID");
  const embedded = binding?.policyReference?.source === "THIS_IMMUTABLE_OWNER_DECISION";
  if ((!allowEmbeddedReference && embedded) || !policyReferenceValid(binding?.policyReference, { embedded })) findings.push("TASK_BINDING_POLICY_REFERENCE_INVALID");
  if (!Array.isArray(binding?.domainApplications) || binding?.domainApplications?.length !== binding?.domainIds?.length || binding?.domainApplications?.some((application, index) => !exactKeys(application, APPLICATION_KEYS) || application.domainId !== binding.domainIds[index] || !isText(application.market) || application.jurisdictionDecisionOwner !== binding.jurisdictionDecisionOwner || !isText(application.decision) || application.decision.length > 8_192 || !(application.minimumCreatorAge === null || (Number.isSafeInteger(application.minimumCreatorAge) && application.minimumCreatorAge >= 18)))) findings.push("TASK_BINDING_APPLICATIONS_INVALID");
  if (!Array.isArray(binding?.capabilitySpecificConflicts) || binding.capabilitySpecificConflicts.length !== 0) findings.push("TASK_BINDING_CONFLICT_INVALID");
  let expectedProjection;
  try { expectedProjection = projectRegisteredDomainOwners(registry, binding?.domainIds ?? []); } catch { expectedProjection = null; }
  if (!expectedProjection || !Array.isArray(binding?.operationalOwnerProjection) || binding.operationalOwnerProjection.some((entry) => !exactKeys(entry, OWNER_PROJECTION_KEYS)) || canonicalJson(binding.operationalOwnerProjection) !== canonicalJson(expectedProjection) || binding.operationalOwnerProjectionHash !== typeSeparatedHash(HASH_DOMAINS.operationalOwners, expectedProjection) || binding.operationalOwnersPreserved !== true) findings.push("OPERATIONAL_OWNER_PROJECTION_INVALID");
  if (binding?.externalProofInherited !== false || binding?.domainCoverageReusable !== false || binding?.domainCoverageSource !== "TASK_LOCAL_EXACT_ENUMERATION" || binding?.taskSpecific !== true || !authorityIsFalse(binding?.authority)) findings.push("TASK_BINDING_AUTHORITY_BOUNDARY_INVALID");
  if (activePolicy) {
    if ((embedded ? !trustedEmbeddedPolicyContexts.has(activePolicy) : !trustedPolicyResolutions.has(activePolicy)) || !sameScope(binding?.scope, activePolicy.standingPolicy?.scope) || activePolicy.status !== ACTIVE_POLICY_STATUS || activePolicy.suppliesAuthority !== true || binding?.jurisdictionDecisionOwner !== activePolicy.standingPolicy?.owner?.login || binding?.domainApplications?.some((application) => application.market !== activePolicy.standingPolicy?.policy?.primaryMarket) || binding?.policyReference?.standingPolicyHash !== activePolicy.standingPolicyHash || binding?.policyReference?.standingPolicySequence !== activePolicy.standingPolicy.sequence || binding?.policyReference?.standingPolicyStatus !== activePolicy.status || (!embedded && binding?.policyReference?.commentId !== activePolicy.commentId)) findings.push("STALE_OR_CROSS_SCOPE_POLICY_REFERENCE");
    if (canonicalJson(binding?.inheritedStandingPolicy) !== canonicalJson(inheritedPolicyFields(activePolicy.standingPolicy))) findings.push("STANDING_POLICY_SELECTIVE_INHERITANCE_INVALID");
    if (!embedded && canonicalJson(binding?.domainApplications) !== canonicalJson(inheritedTaskDomainApplications({ domainIds: binding?.domainIds ?? [], jurisdictionDecisionOwner: binding?.jurisdictionDecisionOwner, standingPolicy: activePolicy.standingPolicy }))) findings.push("TASK_BINDING_DERIVED_APPLICATION_INVALID");
  } else {
    findings.push("CURRENT_STANDING_POLICY_CONTEXT_REQUIRED");
  }
  const base = without(binding ?? {}, "bindingHash");
  if (!isSha256(binding?.bindingHash) || binding.bindingHash !== typeSeparatedHash(HASH_DOMAINS.taskBinding, base)) findings.push("TASK_BINDING_HASH_INVALID");
  return { ok: findings.length === 0, findings, coverage: findings.length === 0 ? { covered: binding.domainIds.length, required: binding.domainIds.length, result: `${binding.domainIds.length}/${binding.domainIds.length}` } : null, bindingHash: binding?.bindingHash ?? null };
  } catch {
    return { ok: false, findings: ["TASK_BINDING_MALFORMED"], coverage: null, bindingHash: null };
  }
}

export function evaluateStandingPolicyInheritanceV2({ policyResolution, scope, domainIds, registry, requestedPrimaryMarket, requestedInitialRollout, includeUnitedStatesTerritories, capabilitySpecificConflicts = [], explicitPolicyChange = false, externalEvidenceStatus = "BLOCKED_EXTERNAL" } = {}) {
  const reasons = [];
  const trustedCurrentPolicy = trustedPolicyResolutions.has(policyResolution)
    && policyResolution?.ok === true
    && policyResolution?.suppliesAuthority === true
    && policyResolution?.status === ACTIVE_POLICY_STATUS;
  if (!trustedCurrentPolicy) reasons.push("NO_CURRENT_ACTIVE_STANDING_POLICY");
  if (policyResolution?.standingPolicy && !sameScope(scope, policyResolution.standingPolicy.scope)) reasons.push("CROSS_SCOPE_POLICY_REFERENCE");
  if (!exactDomainIds(domainIds, registry)) reasons.push("EXACT_TASK_DOMAIN_BINDING_REQUIRED");
  const currentMarket = policyResolution?.standingPolicy?.policy?.primaryMarket;
  const currentRollout = policyResolution?.standingPolicy?.policy?.initialRollout;
  const currentTerritoriesIncluded = policyResolution?.standingPolicy?.policy?.unitedStatesTerritories !== "EXCLUDED_UNLESS_SEPARATELY_AUTHORIZED";
  const candidateMarket = requestedPrimaryMarket ?? currentMarket;
  const candidateRollout = requestedInitialRollout ?? currentRollout;
  const candidateTerritoriesIncluded = includeUnitedStatesTerritories ?? currentTerritoriesIncluded;
  if (!isText(candidateMarket) || (isText(currentMarket) && candidateMarket !== currentMarket)) reasons.push("EXPANSION_OUTSIDE_UNITED_STATES");
  if (!isText(candidateRollout) || (isText(currentRollout) && candidateRollout !== currentRollout)) reasons.push("ROLLOUT_POLICY_CHANGE");
  if (typeof candidateTerritoriesIncluded !== "boolean" || (typeof currentTerritoriesIncluded === "boolean" && candidateTerritoriesIncluded !== currentTerritoriesIncluded)) reasons.push("INCLUSION_OF_A_UNITED_STATES_TERRITORY");
  if (typeof explicitPolicyChange !== "boolean" || explicitPolicyChange === true) reasons.push("EXPLICIT_POLICY_NARROWING_REPLACEMENT_REVOCATION_OR_SUPERSESSION");
  if (!Array.isArray(capabilitySpecificConflicts) || capabilitySpecificConflicts.length > 0) reasons.push("CAPABILITY_SPECIFIC_JURISDICTION_CONFLICT_REQUIRING_OWNER_CHOICE");
  const externalEvidenceDoesNotTriggerRestatement = ["BLOCKED_EXTERNAL", "PENDING_VERIFICATION", "UNKNOWN", "VERIFIED", "STALE", "UNAVAILABLE"].includes(externalEvidenceStatus);
  if (!externalEvidenceDoesNotTriggerRestatement) reasons.push("EXTERNAL_EVIDENCE_STATUS_INVALID");
  const requiresNewOwnerDecision = reasons.some((reason) => NEW_OWNER_DECISION_TRIGGERS.includes(reason) || ["NO_CURRENT_ACTIVE_STANDING_POLICY", "CROSS_SCOPE_POLICY_REFERENCE"].includes(reason));
  return { inheritable: reasons.length === 0, requiresNewOwnerDecision, identicalOwnerPolicyRestatementRequired: requiresNewOwnerDecision, externalEvidenceDoesNotTriggerRestatement, reasons: sorted(reasons) };
}

const OWNER_SUBJECT_KEYS = ["decisionType", "decisionVersion", "invariant", "standingPolicy", "standingPolicyHash", "taskBinding", "taskBindingHash"];
const OWNER_PAYLOAD_KEYS = ["bodyHash", "commentContextHash", "envelopeHash", "evidenceClass", "owner", "pr", "repository", "schemaVersion", "standingPolicyHash", "subject", "subjectHash", "task", "taskBindingHash", "type"];

export function renderOwnerJurisdictionDecisionV2({ scope, owner, taskIdentity, domainIds, domainApplications, registry, taskEvidence, jurisdictionDecisionOwner = owner?.login, standingPolicy = undefined } = {}) {
  const resolvedPolicy = standingPolicy ?? standardUnitedStatesStandingPolicyV2({ scope, owner });
  const policyFindings = standingPolicyFindings(resolvedPolicy);
  if (policyFindings.length > 0 || resolvedPolicy.action === "REVOKE" || canonicalJson(owner) !== canonicalJson(resolvedPolicy.owner) || jurisdictionDecisionOwner !== owner?.login) throw new TypeError(`STANDING_POLICY_INVALID:${policyFindings.join(",")}`);
  const standingPolicyHash = typeSeparatedHash(HASH_DOMAINS.standingPolicy, resolvedPolicy);
  const taskBinding = embeddedTaskBinding({ standingPolicy: resolvedPolicy, standingPolicyHash, scope, taskIdentity, domainIds, domainApplications, registry, taskEvidence, jurisdictionDecisionOwner });
  const subject = {
    decisionType: OWNER_JURISDICTION_DECISION_V2,
    decisionVersion: 2,
    invariant: JURISDICTION_POLICY_INVARIANT,
    standingPolicy: resolvedPolicy,
    standingPolicyHash,
    taskBinding,
    taskBindingHash: taskBinding.bindingHash,
  };
  const commentContext = { evidenceClass: "OWNER_INTENT", marker: OWNER_JURISDICTION_DECISION_V2_MARKER, owner: clone(owner), pr: taskIdentity.implementationPr, repository: scope.repository, task: taskIdentity.taskId, type: OWNER_JURISDICTION_DECISION_V2 };
  const commentContextHash = typeSeparatedHash(HASH_DOMAINS.ownerContext, commentContext);
  const subjectHash = typeSeparatedHash(HASH_DOMAINS.ownerSubject, subject);
  const envelopeHash = typeSeparatedHash(HASH_DOMAINS.ownerEnvelope, { commentContextHash, decisionType: OWNER_JURISDICTION_DECISION_V2, decisionVersion: 2, scope, standingPolicyHash, subjectHash, taskBindingHash: taskBinding.bindingHash });
  const payloadBase = {
    commentContextHash,
    envelopeHash,
    evidenceClass: "OWNER_INTENT",
    owner: clone(owner),
    pr: taskIdentity.implementationPr,
    repository: scope.repository,
    schemaVersion: 2,
    standingPolicyHash,
    subject,
    subjectHash,
    task: taskIdentity.taskId,
    taskBindingHash: taskBinding.bindingHash,
    type: OWNER_JURISDICTION_DECISION_V2,
  };
  const payload = { ...payloadBase, bodyHash: typeSeparatedHash(HASH_DOMAINS.ownerBody, payloadBase) };
  return { body: `${OWNER_JURISDICTION_DECISION_V2_MARKER}\n${canonicalJson(payload)}`, payload, standingPolicyHash, taskBindingHash: taskBinding.bindingHash, envelopeHash };
}

export function verifyOwnerJurisdictionDecisionV2({ body, registry, receipt = null, expected = {} } = {}) {
  try {
  const parsed = parseCanonicalMarkedComment(body, OWNER_JURISDICTION_DECISION_V2_MARKER);
  const findings = [];
  if (!parsed.ok) return { ok: false, findings: [parsed.finding] };
  const payload = parsed.payload;
  if (!exactKeys(payload, OWNER_PAYLOAD_KEYS) || payload.schemaVersion !== 2 || payload.type !== OWNER_JURISDICTION_DECISION_V2 || payload.evidenceClass !== "OWNER_INTENT") findings.push("OWNER_DECISION_PAYLOAD_INVALID");
  if (!exactOwner(payload.owner) || !isPositiveInteger(payload.pr) || !isText(payload.repository) || !isText(payload.task) || payload.repository !== payload?.subject?.standingPolicy?.scope?.repository || canonicalJson(payload.owner) !== canonicalJson(payload?.subject?.standingPolicy?.owner)) findings.push("OWNER_DECISION_IDENTITY_INVALID");
  if (!exactKeys(payload.subject, OWNER_SUBJECT_KEYS) || payload?.subject?.decisionType !== OWNER_JURISDICTION_DECISION_V2 || payload?.subject?.decisionVersion !== 2 || payload?.subject?.invariant !== JURISDICTION_POLICY_INVARIANT) findings.push("OWNER_DECISION_SUBJECT_INVALID");
  findings.push(...standingPolicyFindings(payload?.subject?.standingPolicy));
  const standingPolicyHash = typeSeparatedHash(HASH_DOMAINS.standingPolicy, payload?.subject?.standingPolicy);
  if (payload.standingPolicyHash !== standingPolicyHash || payload?.subject?.standingPolicyHash !== standingPolicyHash) findings.push("STANDING_POLICY_HASH_INVALID");
  const embeddedPolicyContext = { commentId: receipt?.id, commentBodyHash: payload?.bodyHash, standingPolicy: payload?.subject?.standingPolicy, standingPolicyHash, status: ACTIVE_POLICY_STATUS, suppliesAuthority: true };
  trustedEmbeddedPolicyContexts.add(embeddedPolicyContext);
  const bindingResult = verifyTaskJurisdictionBindingV2({ binding: payload?.subject?.taskBinding, registry, activePolicy: embeddedPolicyContext, allowEmbeddedReference: true });
  if (!bindingResult.ok) findings.push(...bindingResult.findings);
  if (payload.pr !== payload?.subject?.taskBinding?.taskIdentity?.implementationPr || payload.task !== payload?.subject?.taskBinding?.taskIdentity?.taskId || payload.repository !== payload?.subject?.taskBinding?.scope?.repository || payload?.subject?.taskBinding?.jurisdictionDecisionOwner !== payload.owner.login) findings.push("OWNER_DECISION_TASK_CROSS_BINDING_INVALID");
  if (payload.taskBindingHash !== payload?.subject?.taskBindingHash || payload.taskBindingHash !== payload?.subject?.taskBinding?.bindingHash) findings.push("TASK_BINDING_CROSS_HASH_INVALID");
  const subjectHash = typeSeparatedHash(HASH_DOMAINS.ownerSubject, payload.subject);
  if (payload.subjectHash !== subjectHash) findings.push("OWNER_DECISION_SUBJECT_HASH_INVALID");
  const commentContext = { evidenceClass: "OWNER_INTENT", marker: OWNER_JURISDICTION_DECISION_V2_MARKER, owner: payload.owner, pr: payload.pr, repository: payload.repository, task: payload.task, type: OWNER_JURISDICTION_DECISION_V2 };
  const commentContextHash = typeSeparatedHash(HASH_DOMAINS.ownerContext, commentContext);
  if (payload.commentContextHash !== commentContextHash) findings.push("OWNER_DECISION_CONTEXT_HASH_INVALID");
  const envelopeHash = typeSeparatedHash(HASH_DOMAINS.ownerEnvelope, { commentContextHash, decisionType: OWNER_JURISDICTION_DECISION_V2, decisionVersion: 2, scope: payload.subject.standingPolicy.scope, standingPolicyHash, subjectHash, taskBindingHash: payload.taskBindingHash });
  if (payload.envelopeHash !== envelopeHash) findings.push("OWNER_DECISION_ENVELOPE_HASH_INVALID");
  if (payload.bodyHash !== typeSeparatedHash(HASH_DOMAINS.ownerBody, without(payload, "bodyHash"))) findings.push("OWNER_DECISION_BODY_HASH_INVALID");
  if (expected.repository && payload.repository !== expected.repository) findings.push("OWNER_DECISION_REPOSITORY_MISMATCH");
  if (expected.product && payload.subject.standingPolicy.scope.product !== expected.product) findings.push("OWNER_DECISION_PRODUCT_MISMATCH");
  if (expected.launchProgram && payload.subject.standingPolicy.scope.launchProgram !== expected.launchProgram) findings.push("OWNER_DECISION_LAUNCH_PROGRAM_MISMATCH");
  if (expected.pr && payload.pr !== expected.pr) findings.push("OWNER_DECISION_PR_MISMATCH");
  if (expected.task && payload.task !== expected.task) findings.push("OWNER_DECISION_TASK_MISMATCH");
  if (expected.ownerLogin && payload.owner.login !== expected.ownerLogin) findings.push("OWNER_DECISION_OWNER_MISMATCH");
  if (expected.domainIds && canonicalJson(payload.subject.taskBinding.domainIds) !== canonicalJson(expected.domainIds)) findings.push("OWNER_DECISION_DOMAINS_MISMATCH");
  if (expected.taskIdentity && canonicalJson(payload.subject.taskBinding.taskIdentity) !== canonicalJson(expected.taskIdentity)) findings.push("OWNER_DECISION_TASK_IDENTITY_MISMATCH");
  if (expected.taskEvidence && canonicalJson(payload.subject.taskBinding.taskEvidence) !== canonicalJson(expected.taskEvidence)) findings.push("OWNER_DECISION_TASK_EVIDENCE_MISMATCH");
  if (expected.domainApplications && canonicalJson(payload.subject.taskBinding.domainApplications) !== canonicalJson(expected.domainApplications)) findings.push("OWNER_DECISION_DOMAIN_APPLICATIONS_MISMATCH");
  if (expected.jurisdictionDecisionOwner && payload.subject.taskBinding.jurisdictionDecisionOwner !== expected.jurisdictionDecisionOwner) findings.push("OWNER_DECISION_JURISDICTION_OWNER_MISMATCH");
  if (expected.standingPolicy && canonicalJson(payload.subject.standingPolicy) !== canonicalJson(expected.standingPolicy)) findings.push("OWNER_DECISION_STANDING_POLICY_MISMATCH");
  if (receipt) {
    if (!isPositiveInteger(receipt.id) || receipt.authorLogin !== payload.owner.login || receipt.authorAssociation !== "OWNER" || !isText(receipt.createdAt) || receipt.createdAt !== receipt.updatedAt || (receipt.body !== undefined && receipt.body !== body)) findings.push("OWNER_DECISION_IMMUTABILITY_INVALID");
  }
  const ok = findings.length === 0;
  return {
    ok,
    findings: sorted([...new Set(findings)]),
    payload: ok ? clone(payload) : undefined,
    standingPolicy: ok ? clone(payload.subject.standingPolicy) : undefined,
    standingPolicyHash: ok ? standingPolicyHash : null,
    taskBinding: ok ? clone(payload.subject.taskBinding) : undefined,
    taskBindingHash: ok ? payload.taskBindingHash : null,
    envelopeHash: ok ? envelopeHash : null,
    commentBodyHash: ok ? payload.bodyHash : null,
    sourceDecisionType: ok ? payload.type : null,
    receipt: ok && receipt ? { commentBodyHash: payload.bodyHash, commentId: receipt.id, createdAt: receipt.createdAt, standingPolicy: clone(payload.subject.standingPolicy), standingPolicyHash, status: ACTIVE_POLICY_STATUS } : null,
    coverage: ok ? bindingResult.coverage : null,
  };
  } catch {
    return { ok: false, findings: ["OWNER_DECISION_MALFORMED"], standingPolicyHash: null, taskBindingHash: null, envelopeHash: null, commentBodyHash: null, receipt: null, coverage: null };
  }
}

export function preflightOwnerJurisdictionDecisionV2(input) {
  try {
    const rendered = renderOwnerJurisdictionDecisionV2(input);
    const verification = verifyOwnerJurisdictionDecisionV2({ body: rendered.body, registry: input.registry, expected: { repository: input.scope?.repository, product: input.scope?.product, launchProgram: input.scope?.launchProgram, pr: input.taskIdentity?.implementationPr, task: input.taskIdentity?.taskId, ownerLogin: input.owner?.login, domainIds: input.domainIds, taskIdentity: input.taskIdentity, taskEvidence: input.taskEvidence, domainApplications: input.domainApplications, jurisdictionDecisionOwner: input.jurisdictionDecisionOwner ?? input.owner?.login, standingPolicy: input.standingPolicy ?? standardUnitedStatesStandingPolicyV2({ scope: input.scope, owner: input.owner }) } });
    return { ok: verification.ok, findings: verification.findings, ...rendered, verification };
  } catch (error) {
    return { ok: false, findings: [error instanceof Error ? error.message : "OWNER_DECISION_PREFLIGHT_FAILED"] };
  }
}

const POLICY_CHAIN_SUBJECT_KEYS = ["invariant", "standingPolicy", "standingPolicyHash"];
const POLICY_CHAIN_PAYLOAD_KEYS = ["bodyHash", "envelopeHash", "evidenceClass", "owner", "repository", "schemaVersion", "standingPolicyHash", "subject", "subjectHash", "type"];

export function renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy } = {}) {
  const findings = standingPolicyFindings(standingPolicy);
  if (findings.length > 0 || standingPolicy.action === "ESTABLISH") throw new TypeError(`POLICY_CHAIN_DECISION_INVALID:${findings.join(",")}`);
  const standingPolicyHash = typeSeparatedHash(HASH_DOMAINS.standingPolicy, standingPolicy);
  const subject = { invariant: JURISDICTION_POLICY_INVARIANT, standingPolicy: clone(standingPolicy), standingPolicyHash };
  const envelopeHash = typeSeparatedHash(HASH_DOMAINS.policyChainEnvelope, { decisionType: OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2, scope: standingPolicy.scope, standingPolicyHash });
  const base = { envelopeHash, evidenceClass: "OWNER_INTENT", owner: clone(standingPolicy.owner), repository: standingPolicy.scope.repository, schemaVersion: 2, standingPolicyHash, subject, subjectHash: typeSeparatedHash(HASH_DOMAINS.policyChainSubject, subject), type: OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2 };
  const payload = { ...base, bodyHash: typeSeparatedHash(HASH_DOMAINS.policyChainBody, base) };
  return { body: `${OWNER_JURISDICTION_POLICY_CHAIN_V2_MARKER}\n${canonicalJson(payload)}`, payload, standingPolicyHash, envelopeHash };
}

function verifyPolicyChainBody(body) {
  try {
  const parsed = parseCanonicalMarkedComment(body, OWNER_JURISDICTION_POLICY_CHAIN_V2_MARKER);
  const findings = [];
  if (!parsed.ok) return { ok: false, findings: [parsed.finding] };
  const payload = parsed.payload;
  if (!exactKeys(payload, POLICY_CHAIN_PAYLOAD_KEYS) || payload.schemaVersion !== 2 || payload.type !== OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2 || payload.evidenceClass !== "OWNER_INTENT" || !exactOwner(payload.owner)) findings.push("POLICY_CHAIN_PAYLOAD_INVALID");
  if (!exactKeys(payload.subject, POLICY_CHAIN_SUBJECT_KEYS) || payload.subject.invariant !== JURISDICTION_POLICY_INVARIANT) findings.push("POLICY_CHAIN_SUBJECT_INVALID");
  findings.push(...standingPolicyFindings(payload?.subject?.standingPolicy));
  if (payload.repository !== payload?.subject?.standingPolicy?.scope?.repository || canonicalJson(payload.owner) !== canonicalJson(payload?.subject?.standingPolicy?.owner)) findings.push("POLICY_CHAIN_OUTER_IDENTITY_MISMATCH");
  const policyHash = typeSeparatedHash(HASH_DOMAINS.standingPolicy, payload?.subject?.standingPolicy);
  if (payload.standingPolicyHash !== policyHash || payload?.subject?.standingPolicyHash !== policyHash || payload.subjectHash !== typeSeparatedHash(HASH_DOMAINS.policyChainSubject, payload.subject)) findings.push("POLICY_CHAIN_HASH_INVALID");
  if (payload.envelopeHash !== typeSeparatedHash(HASH_DOMAINS.policyChainEnvelope, { decisionType: OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2, scope: payload.subject.standingPolicy.scope, standingPolicyHash: policyHash })) findings.push("POLICY_CHAIN_ENVELOPE_INVALID");
  if (payload.bodyHash !== typeSeparatedHash(HASH_DOMAINS.policyChainBody, without(payload, "bodyHash"))) findings.push("POLICY_CHAIN_BODY_HASH_INVALID");
  return { ok: findings.length === 0, findings, payload, standingPolicy: payload?.subject?.standingPolicy, standingPolicyHash: policyHash, commentBodyHash: payload?.bodyHash, subjectHash: payload?.subjectHash, envelopeHash: payload?.envelopeHash };
  } catch {
    return { ok: false, findings: ["POLICY_CHAIN_RECEIPT_MALFORMED"] };
  }
}

export function resolveOwnerJurisdictionPolicyChainV2({ receipts, registry, expectedScope, completeDiscovery = false } = {}) {
  const findings = [];
  if (completeDiscovery !== true) return { ok: false, findings: ["POLICY_DISCOVERY_INCOMPLETE"] };
  if (!exactScope(expectedScope)) return { ok: false, findings: ["POLICY_EXPECTED_SCOPE_REQUIRED"] };
  if (!Array.isArray(receipts) || receipts.length === 0) return { ok: false, findings: ["POLICY_CHAIN_EMPTY"] };
  const verifiedNodes = [];
  for (const receipt of receipts) {
    if (!isPositiveInteger(receipt?.id) || !isText(receipt?.body) || !isCanonicalTimestamp(receipt?.createdAt) || receipt.createdAt !== receipt.updatedAt || receipt.authorAssociation !== "OWNER") { findings.push("POLICY_RECEIPT_IMMUTABILITY_INVALID"); continue; }
    const verification = receipt.body.startsWith(`${OWNER_JURISDICTION_DECISION_V2_MARKER}\n`) ? verifyOwnerJurisdictionDecisionV2({ body: receipt.body, registry, receipt: { ...receipt, authorLogin: receipt.authorLogin ?? receipt.user?.login, authorAssociation: receipt.authorAssociation } }) : verifyPolicyChainBody(receipt.body);
    if (!verification.ok) { findings.push(...verification.findings.map((finding) => `POLICY_RECEIPT_INVALID:${finding}`)); continue; }
    const policy = verification.standingPolicy;
    if ((receipt.authorLogin ?? receipt.user?.login) !== policy.owner.login) findings.push("POLICY_RECEIPT_OWNER_INVALID");
    verifiedNodes.push({ commentBodyHash: verification.commentBodyHash, commentId: receipt.id, createdAt: receipt.createdAt, envelopeHash: verification.envelopeHash ?? verification.payload?.envelopeHash, sourceDecisionType: verification.payload?.type ?? verification.sourceDecisionType, standingPolicy: clone(policy), standingPolicyHash: verification.standingPolicyHash, subjectHash: verification.payload?.subjectHash ?? verification.subjectHash });
  }
  const allById = new Map(verifiedNodes.map((node) => [node.commentId, node]));
  if (allById.size !== verifiedNodes.length) findings.push("POLICY_CHAIN_DUPLICATE_COMMENT_ID");
  const nodes = verifiedNodes.filter(({ standingPolicy }) => sameScope(standingPolicy.scope, expectedScope));
  const scopedIds = new Set(nodes.map(({ commentId }) => commentId));
  if (verifiedNodes.some((node) => !scopedIds.has(node.commentId) && scopedIds.has(node.standingPolicy.predecessor?.commentId))
    || nodes.some((node) => node.standingPolicy.predecessor && allById.has(node.standingPolicy.predecessor.commentId) && !scopedIds.has(node.standingPolicy.predecessor.commentId))) findings.push("POLICY_CHAIN_CROSS_SCOPE_SUPERSESSION");
  const byId = new Map(nodes.map((node) => [node.commentId, node]));
  const genesis = nodes.filter(({ standingPolicy }) => standingPolicy.action === "ESTABLISH");
  if (genesis.length !== 1) findings.push("POLICY_CHAIN_GENESIS_CARDINALITY_INVALID");
  const childCount = new Map();
  for (const node of nodes) {
    const predecessor = node.standingPolicy.predecessor;
    if (predecessor === null) continue;
    const parent = byId.get(predecessor.commentId);
    if (!parent || parent.standingPolicyHash !== predecessor.standingPolicyHash) { findings.push("POLICY_CHAIN_BROKEN_PREDECESSOR"); continue; }
    childCount.set(parent.commentId, (childCount.get(parent.commentId) ?? 0) + 1);
    if ((childCount.get(parent.commentId) ?? 0) > 1) findings.push("POLICY_CHAIN_FORK");
    if (!sameScope(parent.standingPolicy.scope, node.standingPolicy.scope) || parent.standingPolicy.policyClass !== node.standingPolicy.policyClass) findings.push("POLICY_CHAIN_CROSS_SCOPE_SUPERSESSION");
    if (node.standingPolicy.sequence !== parent.standingPolicy.sequence + 1) findings.push("POLICY_CHAIN_SEQUENCE_GAP");
    if (!(Date.parse(node.createdAt) > Date.parse(parent.createdAt))) findings.push("POLICY_CHAIN_TIME_INVALID");
  }
  const tips = nodes.filter((node) => !childCount.has(node.commentId));
  if (tips.length !== 1) findings.push("POLICY_CHAIN_TERMINAL_TIP_AMBIGUOUS");
  if (genesis.length === 1 && tips.length === 1) {
    const visited = new Set();
    let cursor = tips[0];
    while (cursor) {
      if (visited.has(cursor.commentId)) { findings.push("POLICY_CHAIN_CYCLE"); break; }
      visited.add(cursor.commentId);
      cursor = cursor.standingPolicy.predecessor ? byId.get(cursor.standingPolicy.predecessor.commentId) : null;
    }
    if (visited.size !== nodes.length || !visited.has(genesis[0].commentId)) findings.push("POLICY_CHAIN_DISCONNECTED_OR_INCOMPLETE");
  }
  const ok = findings.length === 0;
  const tip = ok ? tips[0] : null;
  const result = { ok, findings: sorted([...new Set(findings)]), status: tip?.standingPolicy.status ?? null, commentId: tip?.commentId ?? null, commentBodyHash: tip?.commentBodyHash ?? null, subjectHash: tip?.subjectHash ?? null, envelopeHash: tip?.envelopeHash ?? null, sourceDecisionType: tip?.sourceDecisionType ?? null, standingPolicy: tip ? clone(tip.standingPolicy) : undefined, standingPolicyHash: tip?.standingPolicyHash ?? null, sequence: tip?.standingPolicy.sequence ?? null, pendingBindingsRequireReevaluation: ok && tip.standingPolicy.sequence > 0, suppliesAuthority: ok && tip.standingPolicy.action !== "REVOKE" };
  const immutableResult = ok ? deepFreeze(result) : result;
  if (ok) trustedPolicyResolutions.add(immutableResult);
  return immutableResult;
}

export function verifyLegacyOwnerJurisdictionDecisionV1({ body, marker = LEGACY_OWNER_AUTHORIZATION_V1_MARKER, receipt = null, expected = {} } = {}) {
  try {
    const parsed = parseCanonicalMarkedComment(body, marker);
    if (!parsed.ok) return { ok: false, findings: ["LEGACY_OWNER_MARKER_INVALID"] };
    const payload = parsed.payload;
    const payloadKeys = ["authorizationId", "bodyHash", "currentHead", "evidenceClass", "leaseId", "pr", "repository", "schemaVersion", "subject", "subjectHash", "task", "type"];
    const subjectKeys = ["chosenOwner", "currentHead", "domain", "leaseId", "marketsJurisdictions", "task", "type", "unknown"];
    const bodyFacts = without(payload, "bodyHash");
    const legacyDomain = payload?.subject?.domain;
    const domainIds = legacyDomain ? [legacyDomain] : [];
    const authorizationCommentId = /^github-comment-([1-9][0-9]*)$/u.exec(payload?.authorizationId ?? "")?.[1];
    const receiptValid = receipt === null
      ? authorizationCommentId !== undefined
      : isPositiveInteger(receipt.id) && String(receipt.id) === authorizationCommentId && isCanonicalTimestamp(receipt.createdAt) && receipt.createdAt === receipt.updatedAt && receipt.authorAssociation === "OWNER" && (!expected.ownerLogin || (receipt.authorLogin ?? receipt.user?.login) === expected.ownerLogin) && (receipt.body === undefined || receipt.body === body);
    const expectedValid = (!expected.subject || canonicalJson(payload?.subject) === canonicalJson(expected.subject))
      && (!expected.repository || payload?.repository === expected.repository)
      && (!expected.pr || payload?.pr === expected.pr)
      && (!expected.task || payload?.task === expected.task);
    const subjectValid = exactKeys(payload?.subject, subjectKeys)
      && payload.subject.type === "OWNER_JURISDICTION_DECISION"
      && payload.subject.task === payload.task
      && String(payload.subject.leaseId) === String(payload.leaseId)
      && payload.subject.currentHead === payload.currentHead
      && exactDomainIds(domainIds)
      && payload.subject.unknown === "market/jurisdiction owner"
      && isText(payload.subject.chosenOwner)
      && Array.isArray(payload.subject.marketsJurisdictions)
      && payload.subject.marketsJurisdictions.length > 0
      && payload.subject.marketsJurisdictions.every(isText);
    const ok = exactKeys(payload, payloadKeys) && payload.schemaVersion === 1 && payload.type === "OWNER_JURISDICTION_DECISION" && payload.evidenceClass === "OWNER_INTENT" && isText(payload.repository) && isPositiveInteger(payload.pr) && isText(payload.task) && isText(payload.leaseId) && isGitSha(payload.currentHead) && subjectValid && payload.subjectHash === legacyHash(payload.subject) && payload.bodyHash === legacyHash(bodyFacts) && receiptValid && expectedValid;
    return { ok, findings: ok ? [] : ["LEGACY_OWNER_RECEIPT_INVALID"], reusableStandingPolicy: false, domainIds: ok ? domainIds : [], subjectHash: ok ? payload.subjectHash : null, bodyHash: ok ? payload.bodyHash : null, originalPayload: ok ? payload : undefined };
  } catch {
    return { ok: false, findings: ["LEGACY_OWNER_RECEIPT_INVALID"], reusableStandingPolicy: false, domainIds: [], subjectHash: null, bodyHash: null };
  }
}

const ADMISSION_IDENTITY_KEYS = ["branch", "head", "pr", "taskId", "tree"];
const ADMISSION_POLICY_BINDING_KEYS = ["domainIds", "ownerDecisionCommentId", "standingPolicyHash", "standingPolicySequence", "standingPolicyStatus", "standingPolicyType", "standingPolicyVersion", "taskBinding", "taskBindingHash"];
const ADMISSION_PREDECESSOR_KEYS = ["bodyHash", "commentId", "sequence", "subjectHash", "version"];
const ADMISSION_SUBJECT_KEYS = ["admissionIdentity", "changedPaths", "ownerJurisdictionBinding", "predecessor", "productMutationAllowedBeforeAdmissionMerge", "prohibitedAuthority", "schemaVersion", "scope", "scopeBudget", "sequence", "supersessionReason", "taskEvidence", "taskScope", "type"];
const ADMISSION_PAYLOAD_KEYS = ["bodyHash", "commentContextHash", "envelopeHash", "evidenceClass", "owner", "pr", "repository", "schemaVersion", "subject", "subjectHash", "task", "type"];

function admissionIdentityValid(identity) {
  return exactKeys(identity, ADMISSION_IDENTITY_KEYS) && isText(identity.branch) && isGitSha(identity.head) && isPositiveInteger(identity.pr) && isText(identity.taskId) && isGitSha(identity.tree);
}

const safeRepositoryPath = (value) => typeof value === "string" && value.length > 0 && value.length <= 512 && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..") && /^[A-Za-z0-9_.+@/()[\]-]+$/u.test(value);
const exactSortedPaths = (values, { empty = false } = {}) => Array.isArray(values) && (empty || values.length > 0) && values.length <= 512 && values.every(safeRepositoryPath) && new Set(values).size === values.length && canonicalJson(values) === canonicalJson(sorted(values));
const TASK_SCOPE_KEYS = ["allowedPaths", "amendmentMaximum", "packageChanges", "recursion", "scopeBudget", "tests"];

function taskScopeValid(taskScope) {
  return exactKeys(taskScope, TASK_SCOPE_KEYS)
    && exactSortedPaths(taskScope.allowedPaths)
    && exactSortedPaths(taskScope.tests)
    && taskScope.packageChanges === false
    && exactKeys(taskScope.scopeBudget, ["maximumChangedLines", "maximumFiles"])
    && isPositiveInteger(taskScope.scopeBudget.maximumFiles)
    && isPositiveInteger(taskScope.scopeBudget.maximumChangedLines)
    && exactKeys(taskScope.amendmentMaximum, ["maximumAmendments", "maximumChangedLines", "maximumFiles"])
    && isPositiveInteger(taskScope.amendmentMaximum.maximumFiles)
    && isPositiveInteger(taskScope.amendmentMaximum.maximumChangedLines)
    && taskScope.amendmentMaximum.maximumFiles >= taskScope.scopeBudget.maximumFiles
    && taskScope.amendmentMaximum.maximumChangedLines >= taskScope.scopeBudget.maximumChangedLines
    && taskScope.amendmentMaximum.maximumAmendments === 1
    && exactKeys(taskScope.recursion, ["admissionPrMaximum", "postAdmissionClearancePrMaximum", "provenancePrMaximum", "sourceBindingPrMaximum", "terminalTruthPrMaximum"])
    && taskScope.recursion.admissionPrMaximum === 1
    && taskScope.recursion.postAdmissionClearancePrMaximum === 0
    && taskScope.recursion.sourceBindingPrMaximum === 0
    && taskScope.recursion.provenancePrMaximum === 0
    && taskScope.recursion.terminalTruthPrMaximum === 1;
}

function admissionTaskBindingValid(subject) {
  const outer = subject?.ownerJurisdictionBinding;
  const binding = outer?.taskBinding;
  if (!exactKeys(binding, TASK_BINDING_KEYS)
    || binding.schemaVersion !== 2
    || binding.type !== OWNER_JURISDICTION_TASK_BINDING_V2
    || !exactScope(binding.scope)
    || !taskIdentityValid(binding.taskIdentity)
    || !taskEvidenceValid(binding.taskEvidence)
    || !exactDomainIds(binding.domainIds)
    || !policyReferenceValid(binding.policyReference, { embedded: binding.policyReference?.source === "THIS_IMMUTABLE_OWNER_DECISION" })
    || !Array.isArray(binding.domainApplications)
    || binding.domainApplications.length !== binding.domainIds.length
    || binding.domainApplications.some((application, index) => !exactKeys(application, APPLICATION_KEYS)
      || application.domainId !== binding.domainIds[index]
      || application.jurisdictionDecisionOwner !== binding.jurisdictionDecisionOwner
      || !isText(application.market)
      || !isText(application.decision)
      || !(application.minimumCreatorAge === null || (Number.isSafeInteger(application.minimumCreatorAge) && application.minimumCreatorAge >= 18)))
    || !Array.isArray(binding.capabilitySpecificConflicts)
    || binding.capabilitySpecificConflicts.length !== 0
    || binding.domainCoverageReusable !== false
    || binding.domainCoverageSource !== "TASK_LOCAL_EXACT_ENUMERATION"
    || binding.externalProofInherited !== false
    || binding.operationalOwnersPreserved !== true
    || binding.taskSpecific !== true
    || !authorityIsFalse(binding.authority)
    || !Array.isArray(binding.operationalOwnerProjection)
    || binding.operationalOwnerProjection.some((entry) => !exactKeys(entry, OWNER_PROJECTION_KEYS))
    || binding.operationalOwnerProjectionHash !== typeSeparatedHash(HASH_DOMAINS.operationalOwners, binding.operationalOwnerProjection)
    || !exactKeys(binding.inheritedStandingPolicy, STANDING_POLICY_INHERITANCE_ALLOWLIST)
    || binding.bindingHash !== typeSeparatedHash(HASH_DOMAINS.taskBinding, without(binding, "bindingHash"))) return false;
  const reference = binding.policyReference;
  const policyReferenceMatches = reference.source === "THIS_IMMUTABLE_OWNER_DECISION"
    ? reference.standingPolicyHash === outer.standingPolicyHash && reference.standingPolicySequence === outer.standingPolicySequence && reference.standingPolicyStatus === outer.standingPolicyStatus
    : reference.commentId === outer.ownerDecisionCommentId
      && reference.standingPolicyHash === outer.standingPolicyHash
      && reference.standingPolicySequence === outer.standingPolicySequence
      && reference.standingPolicyStatus === outer.standingPolicyStatus
      && reference.standingPolicyType === outer.standingPolicyType
      && reference.standingPolicyVersion === outer.standingPolicyVersion;
  return policyReferenceMatches
    && canonicalJson(binding.scope) === canonicalJson(subject.scope)
    && binding.taskIdentity.taskId === subject.admissionIdentity.taskId
    && canonicalJson(binding.taskEvidence) === canonicalJson(subject.taskEvidence)
    && canonicalJson(binding.domainIds) === canonicalJson(outer.domainIds)
    && binding.bindingHash === outer.taskBindingHash;
}

function admissionSubjectValid(subject) {
  if (!exactKeys(subject, ADMISSION_SUBJECT_KEYS) || subject.schemaVersion !== 2 || subject.type !== FINITE_TASK_ADMISSION_V2 || !admissionIdentityValid(subject.admissionIdentity) || !exactScope(subject.scope) || !taskEvidenceValid(subject.taskEvidence) || !taskScopeValid(subject.taskScope) || !authorityIsFalse(subject.prohibitedAuthority) || subject.productMutationAllowedBeforeAdmissionMerge !== false || !Number.isSafeInteger(subject.sequence) || subject.sequence < 0 || !isText(subject.supersessionReason)) return false;
  if (!exactSortedPaths(subject.changedPaths)) return false;
  if (!exactKeys(subject.scopeBudget, ["maximumChangedLines", "maximumFiles"]) || !isPositiveInteger(subject.scopeBudget.maximumChangedLines) || !isPositiveInteger(subject.scopeBudget.maximumFiles)) return false;
  const embedded = subject.ownerJurisdictionBinding?.taskBinding?.policyReference?.source === "THIS_IMMUTABLE_OWNER_DECISION";
  if (!exactKeys(subject.ownerJurisdictionBinding, embedded ? [...ADMISSION_POLICY_BINDING_KEYS, "ownerDecisionCommentBodyHash"] : ADMISSION_POLICY_BINDING_KEYS) || !isPositiveInteger(subject.ownerJurisdictionBinding.ownerDecisionCommentId) || ![subject.ownerJurisdictionBinding.standingPolicyHash, subject.ownerJurisdictionBinding.taskBindingHash, ...(embedded ? [subject.ownerJurisdictionBinding.ownerDecisionCommentBodyHash] : [])].every(isSha256) || subject.ownerJurisdictionBinding.standingPolicyVersion !== 2 || subject.ownerJurisdictionBinding.standingPolicyType !== OWNER_JURISDICTION_STANDING_POLICY_V2 || subject.ownerJurisdictionBinding.standingPolicyStatus !== ACTIVE_POLICY_STATUS || !Number.isSafeInteger(subject.ownerJurisdictionBinding.standingPolicySequence) || subject.ownerJurisdictionBinding.standingPolicySequence < 0 || !exactDomainIds(subject.ownerJurisdictionBinding.domainIds) || !admissionTaskBindingValid(subject)) return false;
  if (subject.sequence === 0) return subject.predecessor === null;
  return exactKeys(subject.predecessor, ADMISSION_PREDECESSOR_KEYS) && isPositiveInteger(subject.predecessor.commentId) && [subject.predecessor.bodyHash, subject.predecessor.subjectHash].every(isSha256) && [1, 2].includes(subject.predecessor.version) && Number.isSafeInteger(subject.predecessor.sequence) && subject.predecessor.sequence === subject.sequence - 1;
}

export function renderFiniteTaskAdmissionV2({ scope, owner, admissionIdentity, predecessor = null, ownerJurisdictionBinding, taskEvidence, taskScope, changedPaths, scopeBudget, supersessionReason } = {}) {
  const reason = supersessionReason ?? (predecessor === null ? "ESTABLISH_CANONICAL_FINITE_TASK_ADMISSION" : "SUPERSEDE_PRE_JURISDICTION_ADMISSION_INTENT");
  const subject = { admissionIdentity: clone(admissionIdentity), changedPaths: sorted(changedPaths ?? []), ownerJurisdictionBinding: clone(ownerJurisdictionBinding), predecessor: clone(predecessor), productMutationAllowedBeforeAdmissionMerge: false, prohibitedAuthority: allFalseAuthority(), schemaVersion: 2, scope: clone(scope), scopeBudget: clone(scopeBudget), sequence: (predecessor?.sequence ?? -1) + 1, supersessionReason: reason, taskEvidence: clone(taskEvidence), taskScope: clone(taskScope), type: FINITE_TASK_ADMISSION_V2 };
  if (!admissionSubjectValid(subject) || !exactOwner(owner)) throw new TypeError("FINITE_TASK_ADMISSION_SUBJECT_INVALID");
  const context = { marker: FINITE_TASK_ADMISSION_V2_MARKER, owner, pr: admissionIdentity.pr, repository: scope.repository, task: admissionIdentity.taskId, type: FINITE_TASK_ADMISSION_V2 };
  const commentContextHash = typeSeparatedHash(HASH_DOMAINS.admissionContext, context);
  const subjectHash = typeSeparatedHash(HASH_DOMAINS.admissionSubject, subject);
  const envelopeHash = typeSeparatedHash(HASH_DOMAINS.admissionEnvelope, { commentContextHash, ownerJurisdictionBinding: subject.ownerJurisdictionBinding, predecessor: subject.predecessor, scope, sequence: subject.sequence, subjectHash });
  const base = { commentContextHash, envelopeHash, evidenceClass: "OWNER_INTENT", owner: clone(owner), pr: admissionIdentity.pr, repository: scope.repository, schemaVersion: 2, subject, subjectHash, task: admissionIdentity.taskId, type: FINITE_TASK_ADMISSION_V2 };
  const payload = { ...base, bodyHash: typeSeparatedHash(HASH_DOMAINS.admissionBody, base) };
  return { body: `${FINITE_TASK_ADMISSION_V2_MARKER}\n${canonicalJson(payload)}`, payload, subjectHash, bodyHash: payload.bodyHash, envelopeHash };
}

export function verifyFiniteTaskAdmissionV2({ body, receipt = null, expected = {} } = {}) {
  try {
  const parsed = parseCanonicalMarkedComment(body, FINITE_TASK_ADMISSION_V2_MARKER);
  const findings = [];
  if (!parsed.ok) return { ok: false, findings: [parsed.finding] };
  const payload = parsed.payload;
  if (!exactKeys(payload, ADMISSION_PAYLOAD_KEYS) || payload.schemaVersion !== 2 || payload.type !== FINITE_TASK_ADMISSION_V2 || payload.evidenceClass !== "OWNER_INTENT" || !exactOwner(payload.owner) || !admissionSubjectValid(payload.subject)) findings.push("ADMISSION_V2_PAYLOAD_OR_SUBJECT_INVALID");
  const context = { marker: FINITE_TASK_ADMISSION_V2_MARKER, owner: payload.owner, pr: payload.pr, repository: payload.repository, task: payload.task, type: FINITE_TASK_ADMISSION_V2 };
  const contextHash = typeSeparatedHash(HASH_DOMAINS.admissionContext, context);
  const subjectHash = typeSeparatedHash(HASH_DOMAINS.admissionSubject, payload.subject);
  if (payload.commentContextHash !== contextHash || payload.subjectHash !== subjectHash) findings.push("ADMISSION_V2_SUBJECT_OR_CONTEXT_HASH_INVALID");
  if (payload.envelopeHash !== typeSeparatedHash(HASH_DOMAINS.admissionEnvelope, { commentContextHash: contextHash, ownerJurisdictionBinding: payload.subject.ownerJurisdictionBinding, predecessor: payload.subject.predecessor, scope: payload.subject.scope, sequence: payload.subject.sequence, subjectHash })) findings.push("ADMISSION_V2_ENVELOPE_HASH_INVALID");
  if (payload.bodyHash !== typeSeparatedHash(HASH_DOMAINS.admissionBody, without(payload, "bodyHash"))) findings.push("ADMISSION_V2_BODY_HASH_INVALID");
  if (payload.repository !== payload.subject.scope.repository || payload.pr !== payload.subject.admissionIdentity.pr || payload.task !== payload.subject.admissionIdentity.taskId) findings.push("ADMISSION_V2_IDENTITY_CROSS_BINDING_INVALID");
  if (expected.repository && payload.repository !== expected.repository) findings.push("ADMISSION_REPOSITORY_MISMATCH");
  if (expected.product && payload.subject.scope.product !== expected.product) findings.push("ADMISSION_PRODUCT_MISMATCH");
  if (expected.launchProgram && payload.subject.scope.launchProgram !== expected.launchProgram) findings.push("ADMISSION_LAUNCH_PROGRAM_MISMATCH");
  if (expected.pr && payload.pr !== expected.pr) findings.push("ADMISSION_PR_MISMATCH");
  if (expected.task && payload.task !== expected.task) findings.push("ADMISSION_TASK_MISMATCH");
  if (expected.head && payload.subject.admissionIdentity.head !== expected.head) findings.push("ADMISSION_HEAD_MISMATCH");
  if (expected.tree && payload.subject.admissionIdentity.tree !== expected.tree) findings.push("ADMISSION_TREE_MISMATCH");
  if (expected.changedPaths && canonicalJson(payload.subject.changedPaths) !== canonicalJson(expected.changedPaths)) findings.push("ADMISSION_CHANGED_PATHS_MISMATCH");
  if (expected.scopeBudget && canonicalJson(payload.subject.scopeBudget) !== canonicalJson(expected.scopeBudget)) findings.push("ADMISSION_SCOPE_BUDGET_MISMATCH");
  if (expected.taskEvidence && canonicalJson(payload.subject.taskEvidence) !== canonicalJson(expected.taskEvidence)) findings.push("ADMISSION_TASK_EVIDENCE_MISMATCH");
  if (expected.taskScope && canonicalJson(payload.subject.taskScope) !== canonicalJson(expected.taskScope)) findings.push("ADMISSION_TASK_SCOPE_MISMATCH");
  if (expected.ownerJurisdictionBinding && canonicalJson(payload.subject.ownerJurisdictionBinding) !== canonicalJson(expected.ownerJurisdictionBinding)) findings.push("ADMISSION_OWNER_JURISDICTION_BINDING_MISMATCH");
  if (expected.ownerLogin && payload.owner.login !== expected.ownerLogin) findings.push("ADMISSION_OWNER_MISMATCH");
  if (receipt && (!isPositiveInteger(receipt.id) || receipt.authorLogin !== payload.owner.login || receipt.authorAssociation !== "OWNER" || !isCanonicalTimestamp(receipt.createdAt) || receipt.createdAt !== receipt.updatedAt || (receipt.body !== undefined && receipt.body !== body))) findings.push("ADMISSION_V2_IMMUTABILITY_INVALID");
  return { ok: findings.length === 0, findings: sorted([...new Set(findings)]), payload: findings.length === 0 ? clone(payload) : undefined, subject: findings.length === 0 ? clone(payload.subject) : undefined, subjectHash: findings.length === 0 ? subjectHash : null, bodyHash: findings.length === 0 ? payload.bodyHash : null };
  } catch {
    return { ok: false, findings: ["ADMISSION_V2_MALFORMED"], subjectHash: null, bodyHash: null };
  }
}

const LEGACY_ADMISSION_PAYLOAD_KEYS = ["authorizationId", "bodyHash", "evidenceClass", "pr", "repository", "schemaVersion", "subject", "subjectHash", "type"];
const LEGACY_ADMISSION_SUBJECT_KEYS = [
  "admissionBranch", "admissionHead", "admissionPr", "admissionTree", "allowedDomains", "allowedPaths", "amendmentMaximum", "authority", "certificateHash", "changedPathHash", "changedPaths", "closurePacketHash", "createdAtEqualsUpdatedAtRequired", "currentPlanningHead", "currentPlanningTree", "featureId", "immutableCommentRequired", "implementationBranch", "implementationPr", "originalSeedHead", "originalSeedTree", "ownerApprovalComment", "ownerIdentity", "packageChanges", "pr", "protectedBase", "recursion", "repository", "scope", "taskArtifactHash", "taskArtifactPath", "taskLocalEdgeClosureHash", "taskLocalEdgeEvidenceHash", "taskLocalModelDeltaHash", "tests", "type",
];
const LEGACY_ADMISSION_AUTHORITY = Object.freeze({ build: false, ota: false, providerMutation: false, publicRelease: false, submission: false });

function legacyAdmissionSubjectValid(subject) {
  const hashFields = ["certificateHash", "changedPathHash", "closurePacketHash", "taskArtifactHash", "taskLocalEdgeClosureHash", "taskLocalEdgeEvidenceHash", "taskLocalModelDeltaHash"];
  const gitFields = ["admissionHead", "admissionTree", "currentPlanningHead", "currentPlanningTree", "originalSeedHead", "originalSeedTree", "protectedBase"];
  const artifactMatch = typeof subject?.taskArtifactPath === "string" && !subject.taskArtifactPath.includes("..")
    ? subject.taskArtifactPath.match(/^docs\/assurance\/tasks\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/u)
    : null;
  return exactKeys(subject, LEGACY_ADMISSION_SUBJECT_KEYS)
    && subject.type === "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1"
    && isPositiveInteger(subject.pr)
    && subject.admissionPr === subject.pr
    && isPositiveInteger(subject.implementationPr)
    && isPositiveInteger(subject.ownerApprovalComment)
    && isText(subject.admissionBranch)
    && isText(subject.implementationBranch)
    && isText(subject.featureId)
    && isText(subject.repository)
    && artifactMatch !== null
    && hashFields.every((key) => isSha256(subject[key]))
    && gitFields.every((key) => isGitSha(subject[key]))
    && exactDomainIds(subject.allowedDomains)
    && exactSortedPaths(subject.allowedPaths)
    && exactSortedPaths(subject.tests)
    && exactSortedPaths(subject.changedPaths)
    && subject.changedPathHash === legacyHash(subject.changedPaths)
    && exactKeys(subject.scope, ["maximumFiles", "maximumHandAuthoredNetLines"])
    && subject.scope.maximumFiles === 30
    && subject.scope.maximumHandAuthoredNetLines === 3600
    && exactKeys(subject.amendmentMaximum, ["maximumAmendments", "maximumFiles", "maximumHandAuthoredNetLines"])
    && subject.amendmentMaximum.maximumAmendments === 1
    && subject.amendmentMaximum.maximumFiles === 36
    && subject.amendmentMaximum.maximumHandAuthoredNetLines === 4500
    && exactKeys(subject.recursion, ["admissionPrMaximum", "postAdmissionClearancePrMaximum", "provenancePrMaximum", "sourceBindingPrMaximum", "terminalTruthPrMaximum"])
    && canonicalJson(subject.recursion) === canonicalJson({ admissionPrMaximum: 1, postAdmissionClearancePrMaximum: 0, provenancePrMaximum: 0, sourceBindingPrMaximum: 0, terminalTruthPrMaximum: 1 })
    && canonicalJson(subject.authority) === canonicalJson(LEGACY_ADMISSION_AUTHORITY)
    && exactOwner(subject.ownerIdentity)
    && subject.packageChanges === false
    && subject.immutableCommentRequired === true
    && subject.createdAtEqualsUpdatedAtRequired === true;
}

export function verifyLegacyFiniteTaskAdmissionV1({ body, receipt = null, expected = {} } = {}) {
  try {
    const parsed = parseCanonicalMarkedComment(body, LEGACY_FINITE_TASK_ADMISSION_V1_MARKER);
    if (!parsed.ok) return { ok: false, findings: ["LEGACY_ADMISSION_MARKER_INVALID"] };
    const payload = parsed.payload;
    const originalBodyHash = legacyHash(without(payload, "bodyHash"));
    const artifactMatch = payload?.subject?.taskArtifactPath?.match(/^docs\/assurance\/tasks\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/u);
    const task = artifactMatch?.[1] ?? null;
    const receiptValid = receipt === null || (isPositiveInteger(receipt.id) && isCanonicalTimestamp(receipt.createdAt) && receipt.createdAt === receipt.updatedAt && receipt.authorAssociation === "OWNER" && (!expected.ownerLogin || (receipt.authorLogin ?? receipt.user?.login) === expected.ownerLogin) && (receipt.body === undefined || receipt.body === body));
    const expectedValid = (!expected.subject || canonicalJson(payload?.subject) === canonicalJson(expected.subject))
      && (!expected.repository || payload?.repository === expected.repository)
      && (!expected.pr || payload?.pr === expected.pr)
      && (!expected.task || task === expected.task)
      && (!expected.head || payload?.subject?.admissionHead === expected.head)
      && (!expected.tree || payload?.subject?.admissionTree === expected.tree);
    const ok = exactKeys(payload, LEGACY_ADMISSION_PAYLOAD_KEYS)
      && payload.schemaVersion === 1
      && payload.type === "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1"
      && payload.authorizationId === "finite_task_admission_to_clearance_v1"
      && payload.evidenceClass === "OWNER_INTENT"
      && legacyAdmissionSubjectValid(payload.subject)
      && payload.repository === payload.subject.repository
      && payload.pr === payload.subject.admissionPr
      && task !== null
      && payload.subjectHash === legacyHash(payload.subject)
      && payload.bodyHash === originalBodyHash
      && receiptValid
      && expectedValid;
    return { ok, findings: ok ? [] : ["LEGACY_ADMISSION_RECEIPT_INVALID"], originalPayload: ok ? payload : undefined, subject: ok ? payload.subject : undefined, subjectHash: ok ? payload.subjectHash : null, bodyHash: ok ? payload.bodyHash : null, repository: ok ? payload.repository : null, pr: ok ? payload.pr : null, task: ok ? task : null, head: ok ? payload.subject.admissionHead : null, tree: ok ? payload.subject.admissionTree : null, sequence: ok ? 0 : null };
  } catch {
    return { ok: false, findings: ["LEGACY_ADMISSION_RECEIPT_INVALID"], subjectHash: null, bodyHash: null, repository: null, pr: null, task: null, head: null, tree: null, sequence: null };
  }
}

export function resolveFiniteTaskAdmissionChainV2({ receipts, expected = {}, completeDiscovery = false } = {}) {
  const findings = [];
  if (completeDiscovery !== true) return { ok: false, findings: ["ADMISSION_DISCOVERY_INCOMPLETE"] };
  if (!isText(expected.ownerLogin)) return { ok: false, findings: ["ADMISSION_EXPECTED_OWNER_REQUIRED"] };
  if (!Array.isArray(receipts) || receipts.length === 0) return { ok: false, findings: ["ADMISSION_CHAIN_EMPTY"] };
  const nodes = [];
  for (const receipt of receipts) {
    if (!isPositiveInteger(receipt?.id) || !isText(receipt?.body) || !isCanonicalTimestamp(receipt?.createdAt) || receipt.createdAt !== receipt.updatedAt || receipt.authorAssociation !== "OWNER") { findings.push("ADMISSION_RECEIPT_IMMUTABILITY_INVALID"); continue; }
    if (receipt.body.startsWith(`${LEGACY_FINITE_TASK_ADMISSION_V1_MARKER}\n`)) {
      if (!expected.legacyV1Subject) { findings.push("ADMISSION_V1_EXPECTED_SUBJECT_REQUIRED"); continue; }
      const legacy = verifyLegacyFiniteTaskAdmissionV1({ body: receipt.body, receipt, expected: { repository: expected.repository, pr: expected.pr, task: expected.task, ownerLogin: expected.ownerLogin, subject: expected.legacyV1Subject } });
      if (!legacy.ok) { findings.push(...legacy.findings); continue; }
      const { repository, pr, task } = legacy;
      if ((expected?.repository && repository !== expected.repository) || (expected?.pr && pr !== expected.pr) || (expected?.task && task !== expected.task)) findings.push("ADMISSION_V1_REPLAY_INVALID");
      nodes.push({ bodyHash: legacy.bodyHash, commentId: receipt.id, createdAt: receipt.createdAt, head: legacy.head, predecessor: null, pr, repository, sequence: 0, subjectHash: legacy.subjectHash, task, tree: legacy.tree, version: 1 });
    } else {
      const verification = verifyFiniteTaskAdmissionV2({ body: receipt.body, receipt: { ...receipt, authorLogin: receipt.authorLogin ?? receipt.user?.login }, expected: { repository: expected?.repository, product: expected?.product, launchProgram: expected?.launchProgram, pr: expected?.pr, task: expected?.task, ownerLogin: expected?.ownerLogin } });
      if (!verification.ok) { findings.push(...verification.findings.map((finding) => `ADMISSION_V2_INVALID:${finding}`)); continue; }
      const subject = verification.subject;
      nodes.push({ bodyHash: verification.bodyHash, commentId: receipt.id, createdAt: receipt.createdAt, head: subject.admissionIdentity.head, predecessor: subject.predecessor, pr: subject.admissionIdentity.pr, repository: subject.scope.repository, scope: clone(subject.scope), sequence: subject.sequence, subjectHash: verification.subjectHash, task: subject.admissionIdentity.taskId, tree: subject.admissionIdentity.tree, version: 2, verification });
    }
  }
  const byId = new Map(nodes.map((node) => [node.commentId, node]));
  if (byId.size !== nodes.length) findings.push("ADMISSION_CHAIN_DUPLICATE_COMMENT_ID");
  const genesis = nodes.filter((node) => node.predecessor === null);
  if (genesis.length !== 1 || genesis[0]?.sequence !== 0 || ![1, 2].includes(genesis[0]?.version)) findings.push("ADMISSION_CHAIN_GENESIS_INVALID");
  const childCount = new Map();
  for (const node of nodes.filter(({ version, predecessor }) => version === 2 && predecessor !== null)) {
    const parent = byId.get(node.predecessor.commentId);
    if (!parent || parent.version !== node.predecessor.version || parent.sequence !== node.predecessor.sequence || parent.subjectHash !== node.predecessor.subjectHash || parent.bodyHash !== node.predecessor.bodyHash) { findings.push("ADMISSION_CHAIN_BROKEN_PREDECESSOR"); continue; }
    childCount.set(parent.commentId, (childCount.get(parent.commentId) ?? 0) + 1);
    if ((childCount.get(parent.commentId) ?? 0) > 1) findings.push("ADMISSION_CHAIN_FORK");
    if (node.sequence !== parent.sequence + 1) findings.push("ADMISSION_CHAIN_SEQUENCE_GAP");
    if (!(Date.parse(node.createdAt) > Date.parse(parent.createdAt))) findings.push("ADMISSION_CHAIN_TIME_INVALID");
    if (node.repository !== parent.repository || node.pr !== parent.pr || node.task !== parent.task) findings.push("ADMISSION_CHAIN_REPLAY_INVALID");
    if (parent.version === 2 && !sameScope(node.scope, parent.scope)) findings.push("ADMISSION_CHAIN_CROSS_SCOPE_REPLAY_INVALID");
  }
  const tips = nodes.filter((node) => !childCount.has(node.commentId));
  if (tips.length !== 1) findings.push("ADMISSION_CHAIN_CURRENT_TIP_AMBIGUOUS");
  const tip = tips.length === 1 ? tips[0] : null;
  if (!tip || tip.version !== 2) findings.push("ADMISSION_CHAIN_ZERO_CURRENT_V2_TIP");
  if (tip && expected?.head && tip.head !== expected.head) findings.push("ADMISSION_CURRENT_HEAD_INVALID");
  if (tip && expected?.tree && tip.tree !== expected.tree) findings.push("ADMISSION_CURRENT_TREE_INVALID");
  const currentSubject = tip?.verification?.subject;
  if (tip?.version === 2) {
    if (expected.changedPaths && canonicalJson(currentSubject?.changedPaths) !== canonicalJson(expected.changedPaths)) findings.push("ADMISSION_CURRENT_CHANGED_PATHS_INVALID");
    if (expected.scopeBudget && canonicalJson(currentSubject?.scopeBudget) !== canonicalJson(expected.scopeBudget)) findings.push("ADMISSION_CURRENT_SCOPE_BUDGET_INVALID");
    if (expected.taskEvidence && canonicalJson(currentSubject?.taskEvidence) !== canonicalJson(expected.taskEvidence)) findings.push("ADMISSION_CURRENT_TASK_EVIDENCE_INVALID");
    if (expected.taskScope && canonicalJson(currentSubject?.taskScope) !== canonicalJson(expected.taskScope)) findings.push("ADMISSION_CURRENT_TASK_SCOPE_INVALID");
    if (expected.ownerJurisdictionBinding && canonicalJson(currentSubject?.ownerJurisdictionBinding) !== canonicalJson(expected.ownerJurisdictionBinding)) findings.push("ADMISSION_CURRENT_OWNER_JURISDICTION_BINDING_INVALID");
  }
  if (genesis.length === 1 && tip) {
    const visited = new Set();
    let cursor = tip;
    while (cursor) {
      if (visited.has(cursor.commentId)) { findings.push("ADMISSION_CHAIN_CYCLE"); break; }
      visited.add(cursor.commentId);
      cursor = cursor.predecessor ? byId.get(cursor.predecessor.commentId) : null;
    }
    if (visited.size !== nodes.length || !visited.has(genesis[0].commentId)) findings.push("ADMISSION_CHAIN_DISCONNECTED_OR_INCOMPLETE");
  }
  const ok = findings.length === 0;
  return { ok, findings: sorted([...new Set(findings)]), currentCommentId: ok ? tip.commentId : null, currentSubjectHash: ok ? tip.subjectHash : null, currentBodyHash: ok ? tip.bodyHash : null, currentSequence: ok ? tip.sequence : null, currentAdmission: ok ? clone(tip.verification.subject) : undefined, historical: ok ? nodes.filter((node) => node.commentId !== tip.commentId).map((node) => ({ commentId: node.commentId, disposition: node.version === 1 ? "HISTORICAL_ADMISSION_INTENT_PRE_JURISDICTION_BINDING" : "SUPERSEDED_HISTORICAL_ADMISSION", sequence: node.sequence, version: node.version })) : [] };
}

const ADMISSION_FINAL_SOURCE_PATHS = Object.freeze(["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"]);
const FINAL_SOURCE_OWNER_KEYS = ["commentId", "domainIds", "referenceScope", "standingPolicyHash", "standingPolicySequence", "standingPolicyStatus", "standingPolicyType", "standingPolicyVersion", "taskBindingHash"];
const FINAL_SOURCE_ADMISSION_KEYS = ["bodyHash", "commentId", "sequence", "subjectHash"];
const FINAL_SOURCE_REVIEW_KEYS = ["bodyHash", "commentId", "disposition", "subjectHash"];
const FINAL_SOURCE_PHASE1_KEYS = ["head", "passedJobs", "requiredJobs", "result", "runId", "tree"];
const FINAL_SOURCE_PROSPECTIVE_KEYS = ["classification", "externalProofInherited", "marketJurisdictionOwnerCoverage", "productMutationAllowedAfterAdmissionMerge", "productMutationAllowedBeforeAdmissionMerge", "taskLocalGoverningEdgeClosure"];
const ADMISSION_FINAL_SOURCE_SUBJECT_KEYS = ["admissionIdentity", "authority", "changedPaths", "currentAdmission", "diffHash", "ownerJurisdiction", "phase1", "prospective", "repositoryReview", "schemaVersion", "scope", "type"];
const ADMISSION_FINAL_SOURCE_PAYLOAD_KEYS = ["bodyHash", "commentContextHash", "envelopeHash", "evidenceClass", "owner", "pr", "repository", "schemaVersion", "subject", "subjectHash", "task", "type"];

function admissionFinalSourceSubjectValid(subject) {
  const ownerBinding = subject?.ownerJurisdiction;
  const currentAdmission = subject?.currentAdmission;
  const review = subject?.repositoryReview;
  const phase1 = subject?.phase1;
  const prospective = subject?.prospective;
  return exactKeys(subject, ADMISSION_FINAL_SOURCE_SUBJECT_KEYS)
    && subject.schemaVersion === 2
    && subject.type === FINITE_TASK_ADMISSION_FINAL_SOURCE_V2
    && admissionIdentityValid(subject.admissionIdentity)
    && exactScope(subject.scope)
    && canonicalJson(subject.changedPaths) === canonicalJson(ADMISSION_FINAL_SOURCE_PATHS)
    && isSha256(subject.diffHash)
    && exactKeys(ownerBinding, ownerBinding?.referenceScope === "TASK_BOUND_COMPOSITE" ? [...FINAL_SOURCE_OWNER_KEYS, "commentBodyHash"] : FINAL_SOURCE_OWNER_KEYS)
    && isPositiveInteger(ownerBinding.commentId)
    && [ownerBinding.standingPolicyHash, ownerBinding.taskBindingHash, ...(ownerBinding.referenceScope === "TASK_BOUND_COMPOSITE" ? [ownerBinding.commentBodyHash] : [])].every(isSha256)
    && ["TASK_BOUND_COMPOSITE", "STANDING_POLICY_SUBRECORD_ONLY"].includes(ownerBinding.referenceScope)
    && ownerBinding.standingPolicyType === OWNER_JURISDICTION_STANDING_POLICY_V2 && ownerBinding.standingPolicyVersion === 2 && ownerBinding.standingPolicyStatus === ACTIVE_POLICY_STATUS && Number.isSafeInteger(ownerBinding.standingPolicySequence) && ownerBinding.standingPolicySequence >= 0
    && exactDomainIds(ownerBinding.domainIds)
    && exactKeys(currentAdmission, FINAL_SOURCE_ADMISSION_KEYS)
    && isPositiveInteger(currentAdmission.commentId)
    && Number.isSafeInteger(currentAdmission.sequence)
    && currentAdmission.sequence >= 0
    && [currentAdmission.subjectHash, currentAdmission.bodyHash].every(isSha256)
    && exactKeys(review, FINAL_SOURCE_REVIEW_KEYS)
    && isPositiveInteger(review.commentId)
    && [review.subjectHash, review.bodyHash].every(isSha256)
    && exactKeys(review.disposition, ["P0", "P1", "launchImpactingP2"])
    && review.disposition.P0 === 0
    && review.disposition.P1 === 0
    && review.disposition.launchImpactingP2 === 0
    && exactKeys(phase1, FINAL_SOURCE_PHASE1_KEYS)
    && isPositiveInteger(phase1.runId)
    && phase1.head === subject.admissionIdentity.head
    && phase1.tree === subject.admissionIdentity.tree
    && phase1.requiredJobs === 13
    && phase1.passedJobs === 13
    && phase1.result === "PASS"
    && exactKeys(prospective, FINAL_SOURCE_PROSPECTIVE_KEYS)
    && prospective.classification === "PREIMPLEMENTATION_ENGINEERING_CLEAR"
    && exactKeys(prospective.marketJurisdictionOwnerCoverage, ["covered", "required", "result"])
    && prospective.marketJurisdictionOwnerCoverage.covered === ownerBinding.domainIds.length
    && prospective.marketJurisdictionOwnerCoverage.required === ownerBinding.domainIds.length
    && prospective.marketJurisdictionOwnerCoverage.result === `${ownerBinding.domainIds.length}/${ownerBinding.domainIds.length}`
    && prospective.externalProofInherited === false
    && prospective.productMutationAllowedBeforeAdmissionMerge === false
    && prospective.productMutationAllowedAfterAdmissionMerge === true
    && prospective.taskLocalGoverningEdgeClosure === "CLEAR"
    && authorityIsFalse(subject.authority);
}

export function renderFiniteTaskAdmissionFinalSourceV2({ scope, owner, admissionIdentity, diffHash, ownerJurisdiction, currentAdmission, repositoryReview, phase1, prospective } = {}) {
  const subject = { admissionIdentity: clone(admissionIdentity), authority: allFalseAuthority(), changedPaths: [...ADMISSION_FINAL_SOURCE_PATHS], currentAdmission: clone(currentAdmission), diffHash, ownerJurisdiction: clone(ownerJurisdiction), phase1: clone(phase1), prospective: clone(prospective), repositoryReview: clone(repositoryReview), schemaVersion: 2, scope: clone(scope), type: FINITE_TASK_ADMISSION_FINAL_SOURCE_V2 };
  if (!exactOwner(owner) || !admissionFinalSourceSubjectValid(subject)) throw new TypeError("FINITE_TASK_ADMISSION_FINAL_SOURCE_SUBJECT_INVALID");
  const context = { marker: FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER, owner: clone(owner), pr: admissionIdentity.pr, repository: scope.repository, task: admissionIdentity.taskId, type: FINITE_TASK_ADMISSION_FINAL_SOURCE_V2 };
  const commentContextHash = typeSeparatedHash(HASH_DOMAINS.admissionFinalSourceContext, context);
  const subjectHash = typeSeparatedHash(HASH_DOMAINS.admissionFinalSourceSubject, subject);
  const envelopeHash = typeSeparatedHash(HASH_DOMAINS.admissionFinalSourceEnvelope, { admissionBodyHash: currentAdmission.bodyHash, commentContextHash, finalHead: admissionIdentity.head, finalTree: admissionIdentity.tree, phase1RunId: phase1.runId, repositoryReviewBodyHash: repositoryReview.bodyHash, subjectHash });
  const base = { commentContextHash, envelopeHash, evidenceClass: "REPOSITORY_FINAL_SOURCE_ATTESTATION", owner: clone(owner), pr: admissionIdentity.pr, repository: scope.repository, schemaVersion: 2, subject, subjectHash, task: admissionIdentity.taskId, type: FINITE_TASK_ADMISSION_FINAL_SOURCE_V2 };
  const payload = { ...base, bodyHash: typeSeparatedHash(HASH_DOMAINS.admissionFinalSourceBody, base) };
  return { body: `${FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER}\n${canonicalJson(payload)}`, payload, subjectHash, bodyHash: payload.bodyHash, envelopeHash };
}

export function verifyFiniteTaskAdmissionFinalSourceV2({ body, receipt = null, expected = {} } = {}) {
  try {
    const parsed = parseCanonicalMarkedComment(body, FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER);
    if (!parsed.ok) return { ok: false, findings: [parsed.finding] };
    const payload = parsed.payload;
    const findings = [];
    if (!exactKeys(payload, ADMISSION_FINAL_SOURCE_PAYLOAD_KEYS) || payload.schemaVersion !== 2 || payload.type !== FINITE_TASK_ADMISSION_FINAL_SOURCE_V2 || payload.evidenceClass !== "REPOSITORY_FINAL_SOURCE_ATTESTATION" || !exactOwner(payload.owner) || !admissionFinalSourceSubjectValid(payload.subject)) findings.push("ADMISSION_FINAL_SOURCE_PAYLOAD_OR_SUBJECT_INVALID");
    const context = { marker: FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER, owner: payload.owner, pr: payload.pr, repository: payload.repository, task: payload.task, type: FINITE_TASK_ADMISSION_FINAL_SOURCE_V2 };
    const contextHash = typeSeparatedHash(HASH_DOMAINS.admissionFinalSourceContext, context);
    const subjectHash = typeSeparatedHash(HASH_DOMAINS.admissionFinalSourceSubject, payload.subject);
    const envelopeHash = typeSeparatedHash(HASH_DOMAINS.admissionFinalSourceEnvelope, { admissionBodyHash: payload.subject.currentAdmission.bodyHash, commentContextHash: contextHash, finalHead: payload.subject.admissionIdentity.head, finalTree: payload.subject.admissionIdentity.tree, phase1RunId: payload.subject.phase1.runId, repositoryReviewBodyHash: payload.subject.repositoryReview.bodyHash, subjectHash });
    if (payload.commentContextHash !== contextHash || payload.subjectHash !== subjectHash || payload.envelopeHash !== envelopeHash || payload.bodyHash !== typeSeparatedHash(HASH_DOMAINS.admissionFinalSourceBody, without(payload, "bodyHash"))) findings.push("ADMISSION_FINAL_SOURCE_HASH_INVALID");
    if (payload.repository !== payload.subject.scope.repository || payload.pr !== payload.subject.admissionIdentity.pr || payload.task !== payload.subject.admissionIdentity.taskId) findings.push("ADMISSION_FINAL_SOURCE_IDENTITY_CROSS_BINDING_INVALID");
    if (expected.repository && payload.repository !== expected.repository) findings.push("ADMISSION_FINAL_SOURCE_REPOSITORY_MISMATCH");
    if (expected.product && payload.subject.scope.product !== expected.product) findings.push("ADMISSION_FINAL_SOURCE_PRODUCT_MISMATCH");
    if (expected.launchProgram && payload.subject.scope.launchProgram !== expected.launchProgram) findings.push("ADMISSION_FINAL_SOURCE_LAUNCH_PROGRAM_MISMATCH");
    if (expected.pr && payload.pr !== expected.pr) findings.push("ADMISSION_FINAL_SOURCE_PR_MISMATCH");
    if (expected.task && payload.task !== expected.task) findings.push("ADMISSION_FINAL_SOURCE_TASK_MISMATCH");
    if (expected.head && payload.subject.admissionIdentity.head !== expected.head) findings.push("ADMISSION_FINAL_SOURCE_HEAD_MISMATCH");
    if (expected.tree && payload.subject.admissionIdentity.tree !== expected.tree) findings.push("ADMISSION_FINAL_SOURCE_TREE_MISMATCH");
    if (expected.subject && canonicalJson(payload.subject) !== canonicalJson(expected.subject)) findings.push("ADMISSION_FINAL_SOURCE_SUBJECT_MISMATCH");
    if (expected.ownerLogin && payload.owner.login !== expected.ownerLogin) findings.push("ADMISSION_FINAL_SOURCE_OWNER_MISMATCH");
    if (receipt && (!isPositiveInteger(receipt.id) || receipt.authorLogin !== payload.owner.login || receipt.authorAssociation !== "OWNER" || !isCanonicalTimestamp(receipt.createdAt) || receipt.createdAt !== receipt.updatedAt || (receipt.body !== undefined && receipt.body !== body))) findings.push("ADMISSION_FINAL_SOURCE_IMMUTABILITY_INVALID");
    const ok = findings.length === 0;
    return { ok, findings: sorted([...new Set(findings)]), payload: ok ? clone(payload) : undefined, subject: ok ? clone(payload.subject) : undefined, subjectHash: ok ? subjectHash : null, bodyHash: ok ? payload.bodyHash : null, envelopeHash: ok ? envelopeHash : null };
  } catch {
    return { ok: false, findings: ["ADMISSION_FINAL_SOURCE_MALFORMED"], subjectHash: null, bodyHash: null, envelopeHash: null };
  }
}
