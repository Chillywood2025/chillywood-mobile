import { ready } from "./helpers.mjs";

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const INSTRUCTION =
  /\b(?:ignore|override|bypass|disable|weaken|forget)\b[\s\S]{0,80}\b(?:instruction|policy|approval|rls|guard|system|developer|safety)\b|\b(?:merge|deploy|release|execute|run|invoke|read)\b[\s\S]{0,80}\b(?:pull request|production|shell|command|tool|environment|secret|credential)\b/iu;
const SECRET_OR_PRIVATE =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----|[?&](?:x-amz-signature|x-goog-signature|signature|sig|token)=|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:access[_ -]?token|api[_ -]?key|authorization|bearer|client[_ -]?secret|cookie|credential|github[_ -]?token|key[_ -]?password|model[_ -]?key|password|passphrase|private[_ -]?key|refresh[_ -]?token|secret|service[_ -]?role|session[_ -]?cookie|token)\b\s*(?::|=|is)\s*[^\s,;]{6,}/iu;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
};

const scopeIsValid = (value) =>
  value.platform === "shared" &&
  value.environment === "production" &&
  typeof value.taskId === "string" &&
  UUID.test(value.taskId) &&
  typeof value.projectId === "string" &&
  UUID.test(value.projectId);

export const normalizeResearchEvaluationRequest = (value) => {
  const keys = [
    "action",
    "environment",
    "platform",
    "projectId",
    "researchClaimId",
    "taskId",
  ];
  return exactKeys(value, keys) &&
      value.action === "evaluate_research_claim" &&
      scopeIsValid(value) &&
      typeof value.researchClaimId === "string" &&
      UUID.test(value.researchClaimId)
    ? Object.freeze({ ...value })
    : null;
};

export const normalizeContradictionResolutionRequest = (value) => {
  const keys = [
    "action",
    "boundedEvidence",
    "contradictionId",
    "environment",
    "platform",
    "projectId",
    "resolutionSourceId",
    "taskId",
  ];
  if (
    !exactKeys(value, keys) ||
    value.action !== "evaluate_contradiction_resolution" ||
    !scopeIsValid(value) ||
    typeof value.contradictionId !== "string" ||
    !UUID.test(value.contradictionId) ||
    typeof value.resolutionSourceId !== "string" ||
    !UUID.test(value.resolutionSourceId) ||
    typeof value.boundedEvidence !== "string"
  ) {
    return null;
  }
  const boundedEvidence = value.boundedEvidence.trim();
  if (
    boundedEvidence.length < 4 ||
    boundedEvidence.length > 2_000 ||
    new TextEncoder().encode(boundedEvidence).byteLength > 8_000 ||
    INSTRUCTION.test(boundedEvidence.normalize("NFKC")) ||
    SECRET_OR_PRIVATE.test(boundedEvidence.normalize("NFKC"))
  ) {
    return null;
  }
  return Object.freeze({ ...value, boundedEvidence });
};

export const validateResearchSnapshot = (snapshot, request) => {
  if (
    !isRecord(snapshot) ||
    !isRecord(snapshot.claim) ||
    !Array.isArray(snapshot.relations) ||
    !Array.isArray(snapshot.sources) ||
    !Array.isArray(snapshot.retrievals) ||
    !Array.isArray(snapshot.contradictions) ||
    !Array.isArray(snapshot.contradictionEvents)
  ) {
    return false;
  }
  const claim = snapshot.claim;
  if (
    claim.id !== request.researchClaimId ||
    claim.task_id !== request.taskId ||
    claim.project_id !== request.projectId ||
    claim.platform !== request.platform ||
    claim.environment !== request.environment ||
    typeof claim.claim_hash !== "string" ||
    !HASH.test(claim.claim_hash) ||
    typeof claim.bounded_claim !== "string" ||
    claim.bounded_claim.length < 4 ||
    claim.bounded_claim.length > 2_000 ||
    snapshot.relations.length < 1 ||
    snapshot.relations.length > 8 ||
    snapshot.sources.length !== snapshot.relations.length ||
    snapshot.sources.length > 8 ||
    snapshot.retrievals.length > 16 ||
    snapshot.contradictions.length > 16 ||
    snapshot.contradictionEvents.length > 32
  ) {
    return false;
  }
  const sourceIds = snapshot.relations.map((relation) => relation?.source_id);
  return sourceIds.every((id) => typeof id === "string" && UUID.test(id)) &&
    new Set(sourceIds).size === sourceIds.length &&
    snapshot.sources.every((source) =>
      isRecord(source) &&
      typeof source.id === "string" &&
      sourceIds.includes(source.id) &&
      typeof source.content_hash === "string" &&
      HASH.test(source.content_hash) &&
      typeof source.canonical_url_hash === "string" &&
      HASH.test(source.canonical_url_hash) &&
      source.trusted_for_tool_execution === false
    ) &&
    snapshot.retrievals.every((retrieval) =>
      isRecord(retrieval) &&
      typeof retrieval.source_id === "string" &&
      sourceIds.includes(retrieval.source_id) &&
      retrieval.result === "accepted"
    );
};

const evaluatorToken = (env) => {
  const token =
    typeof env.COGNITIVE_INDEPENDENT_EVALUATOR_SERVICE_TOKEN === "string"
      ? env.COGNITIVE_INDEPENDENT_EVALUATOR_SERVICE_TOKEN.trim()
      : "";
  const length = new TextEncoder().encode(token).byteLength;
  if (length < 32 || length > 512) {
    throw new Error("research_evaluator_configuration_rejected");
  }
  return token;
};

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const evaluateResearchClaim = ready(
  ["read_research_snapshot", "derive_research_evaluation"],
  async ({ database, env, payload }) => {
    const request = normalizeResearchEvaluationRequest(payload);
    if (!request) throw new Error("research_evaluation_payload_rejected");
    const snapshot = await database.call("researchEvaluatorSnapshot", [
      request.researchClaimId,
      request.taskId,
      request.projectId,
      request.platform,
      request.environment,
    ]);
    if (!validateResearchSnapshot(snapshot, request)) {
      throw new Error("research_snapshot_rejected");
    }
    const result = await database.call("derivePublicResearchEvaluation", [
      request.taskId,
      request.projectId,
      request.platform,
      request.environment,
      "research_claim",
      request.researchClaimId,
      evaluatorToken(env),
    ]);
    if (
      !isRecord(result) ||
      typeof result.evaluation_id !== "string" ||
      !UUID.test(result.evaluation_id) ||
      result.subject_type !== "research_claim" ||
      result.subject_id !== request.researchClaimId ||
      !["pass", "fail", "blocked"].includes(result.evaluation_status) ||
      typeof result.evidence_hash !== "string" ||
      !HASH.test(result.evidence_hash) ||
      typeof result.evaluator_identity_hash !== "string" ||
      !HASH.test(result.evaluator_identity_hash) ||
      typeof result.expires_at !== "string" ||
      !Number.isFinite(Date.parse(result.expires_at)) ||
      typeof result.evidence_manifest_id !== "string" ||
      !UUID.test(result.evidence_manifest_id) ||
      result.manifest_derived_status !== result.evaluation_status ||
      result.manifest_hash !== result.evidence_hash ||
      typeof result.manifest_expires_at !== "string" ||
      !Number.isFinite(Date.parse(result.manifest_expires_at)) ||
      !Array.isArray(result.reasons) ||
      result.reasons.some((reason) =>
        typeof reason !== "string" ||
        reason.length < 1 ||
        reason.length > 160
      )
    ) {
      throw new Error("research_evaluation_readback_rejected");
    }
    return Object.freeze({
      canaryAccepted: false,
      evaluationEvidenceHash: result.evidence_hash,
      evaluationStatus: result.evaluation_status,
      evaluatorIdentityHash: result.evaluator_identity_hash,
      evaluatorRecordHash: await sha256Hex(result.evaluation_id),
      evaluatorRecordId: result.evaluation_id,
      expiresAt: result.expires_at,
      reasons: Object.freeze([...result.reasons]),
      researchClaimId: request.researchClaimId,
      selfApproval: false,
    });
  },
);

const resolveContradiction = ready(
  ["resolve_research_contradiction"],
  async ({ database, env, payload }) => {
    const request = normalizeContradictionResolutionRequest(payload);
    if (!request) {
      throw new Error("research_contradiction_resolution_payload_rejected");
    }
    const result = await database.call("resolvePublicResearchContradiction", [
      request.taskId,
      request.projectId,
      request.platform,
      request.environment,
      request.contradictionId,
      request.resolutionSourceId,
      request.boundedEvidence,
      evaluatorToken(env),
    ]);
    if (
      !isRecord(result) ||
      typeof result.event_id !== "string" ||
      !UUID.test(result.event_id) ||
      typeof result.proof_hash !== "string" ||
      !HASH.test(result.proof_hash) ||
      typeof result.evidence_hash !== "string" ||
      !HASH.test(result.evidence_hash)
    ) {
      throw new Error("research_resolution_readback_rejected");
    }
    return Object.freeze({
      contradictionId: request.contradictionId,
      eventId: result.event_id,
      evidenceHash: result.evidence_hash,
      evaluatorIdentity: "independent_evaluation_judge",
      privateDataUsed: false,
      proofHash: result.proof_hash,
      resolutionState: "resolved",
      selfApproval: false,
      userDerivedDataUsed: false,
    });
  },
);

export const RESEARCH_EVALUATOR_ADAPTERS = Object.freeze({
  evaluate_research_claim: evaluateResearchClaim,
  evaluate_contradiction_resolution: resolveContradiction,
});
