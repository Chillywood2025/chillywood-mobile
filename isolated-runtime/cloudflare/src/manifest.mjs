import {
  RUNTIME_SCHEMA_VERSION,
  SOURCE_BASE_COMMIT,
} from "./constants.mjs";
const DB_HOOKS = Object.freeze([
  "cognitive_runtime.runtime_role_preflight",
  "cognitive_runtime.runtime_revocation_status",
]);

const operation = (payloadKeys, rpcEntrypoints) =>
  Object.freeze({
    payloadKeys: Object.freeze([...payloadKeys].sort()),
    rpcEntrypoints: Object.freeze([...rpcEntrypoints]),
  });

const scope = Object.freeze([
  "action",
  "environment",
  "platform",
  "projectId",
  "taskId",
]);

const findings = Object.freeze([
  "affectedComponentsHash",
  "buildRuntimeHash",
  "confidence",
  "evidenceHashes",
  "findingClass",
  "physicalProofStatus",
  "proposedNextInvestigationHash",
  "providerBackendStateHash",
  "reproductionState",
  "routeOrSurface",
  "sentinelRunId",
  "severity",
  "suspectedLayer",
  "userImpactHash",
]);

const principal = ({
  id,
  edgeSource,
  provider = "none",
  providerSecrets = [],
  runtimeConfiguration = {},
  internalSecrets = [],
  networkEgress = [],
  operations,
  maxRequestBytes = 98_304,
}) => {
  const suffix = id.replace(/^cognitive_/u, "").replaceAll("_", "-");
  return Object.freeze({
    binding: id.toUpperCase(),
    dbRole: id,
    edgeSource,
    forbiddenSecrets: Object.freeze([
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
      "DATABASE_URL",
    ]),
    hyperdriveBinding: `${id.toUpperCase()}_HYPERDRIVE`,
    maxRequestBytes,
    networkEgress: Object.freeze([...networkEgress]),
    operations: Object.freeze(operations),
    provider,
    runtimeConfiguration: Object.freeze({ ...runtimeConfiguration }),
    requiredSecrets: Object.freeze([
      `${id.toUpperCase()}_INVOKE_SHA256`,
      ...internalSecrets,
      ...providerSecrets,
    ]),
    rpcHooks: DB_HOOKS,
    workerName: `chillywood-level01-${suffix}`,
  });
};

export const RUNTIME_MANIFEST = Object.freeze({
  schemaVersion: RUNTIME_SCHEMA_VERSION,
  sourceBaseCommit: SOURCE_BASE_COMMIT,
  gateway: Object.freeze({
    binding: "COGNITIVE_LEVEL01_GATEWAY",
    databaseBindings: Object.freeze([]),
    providerSecrets: Object.freeze([]),
    requiredPublicConfiguration: Object.freeze([
      "CF_ACCESS_AUD",
      "CF_ACCESS_SERVICE_TOKEN_COMMON_NAME",
      "CF_ACCESS_TEAM_DOMAIN",
    ]),
    workerName: "chillywood-cognitive-level01-gateway",
  }),
  principals: Object.freeze([
    principal({
      id: "cognitive_product_baseline_executor",
      edgeSource:
        "supabase/functions/cognitive-product-baseline-executor/index.ts",
      operations: {
        claim: operation([
          "action", "approvalHash", "approvalVersionId", "baselineHash",
          "baselineId", "branchName", "budgetHash", "decisionManifestHash",
          "environment", "evaluatorRequirementHash", "operation",
          "planSnapshotHash", "platform", "projectId", "provider",
          "repositoryFullName", "rollbackHash", "selectedOption",
          "selectedOptionCode", "sourceOptionsManifestHash",
          "targetResourceHash", "taskId", "testsHash",
        ], ["governance_claim_approved_action"]),
        transition: operation(
          ["action", "executionId", "nextState"],
          ["governance_begin_approved_execution"],
        ),
        stage_selection: operation([
          "action", "baselineHash", "baselineId", "executionId",
          "selectedOption", "selectedOptionCode", "sourceCommit",
          "sourceOptionsManifestHash",
        ], ["governance_stage_product_experience_baseline_v1"]),
        complete: operation([
          "action", "evaluatorProofHash", "executionId",
          "executionReceiptHash",
        ], ["governance_complete_approved_execution"]),
        persist: operation(
          ["action", "executionId"],
          ["governance_product_baseline_persist_completed_execution"],
        ),
        fail: operation(
          ["action", "executionId", "failureHash"],
          ["governance_fail_approved_execution"],
        ),
      },
      internalSecrets: ["COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION"],
      maxRequestBytes: 24_576,
    }),
    principal({
      id: "cognitive_sentinel_collector",
      edgeSource: "supabase/functions/cognitive-sentinel-collector/index.ts",
      operations: {
        collect_sentinel_run: operation([
          "action", "collectionIdempotencyHash", "environment",
          "evaluationExpiresAt", "evidenceManifestHash", "metricManifest",
          "observationFinishedAt", "observationStartedAt",
          "physicalProofStatus", "platform", "projectId", "resultStatus",
          "routeOrSurface", "runtimeIdentityHash", "sentinelKey",
          "sourceBuildHash", "taskId",
        ], ["cognitive_runtime.collect_sentinel_run"]),
      },
      internalSecrets: ["COGNITIVE_SENTINEL_COLLECTOR_ASSERTION"],
    }),
    principal({
      id: "cognitive_product_quality_evaluator",
      edgeSource:
        "supabase/functions/cognitive-product-quality-evaluator/index.ts",
      operations: {
        evaluate_product_baseline_selection: operation(
          ["action", "executionId", "executionReceiptHash"],
          [
            "cognitive_runtime.product_quality_evaluator_snapshot",
            "governance_evaluate_product_experience_baseline_v1",
          ],
        ),
        evaluate_sentinel_detection: operation(
          ["action", ...findings],
          [
            "cognitive_runtime.product_quality_evaluator_snapshot",
            "product_quality_detection_assessment_hash",
            "product_quality_record_sentinel_evaluator_proof",
          ],
        ),
        evaluate_sentinel_no_finding: operation(
          ["action", "sentinelRunId"],
          [
            "cognitive_runtime.product_quality_evaluator_snapshot",
            "cognitive_runtime.product_quality_no_finding_assessment_hash",
            "product_quality_record_sentinel_evaluator_proof",
          ],
        ),
        evaluate_sentinel_resolution: operation([
          "action", "findingId", "resolutionReasonHash", "sentinelRunId",
        ], [
          "cognitive_runtime.product_quality_evaluator_snapshot",
          "product_quality_resolution_assessment_hash",
          "product_quality_record_sentinel_evaluator_proof",
        ]),
      },
      internalSecrets: ["COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION"],
      maxRequestBytes: 32_768,
    }),
    principal({
      id: "cognitive_product_quality_triage",
      edgeSource:
        "supabase/functions/cognitive-product-quality-triage/index.ts",
      operations: {
        triage_detection: operation(
          ["action", ...findings, "evaluatorProofHash", "evaluatorProofId"],
          ["product_quality_triage_detection"],
        ),
        triage_resolution: operation([
          "action", "evaluatorProofHash", "evaluatorProofId", "findingId",
          "resolutionReasonHash", "sentinelRunId",
        ], ["product_quality_triage_resolution"]),
      },
      internalSecrets: ["COGNITIVE_PRODUCT_QUALITY_TRIAGE_ASSERTION"],
      maxRequestBytes: 32_768,
    }),
    principal({
      id: "cognitive_public_research_broker",
      edgeSource:
        "supabase/functions/cognitive-public-research-broker/index.ts",
      networkEgress: [
        "allowlisted_primary_and_public_research_authorities_only",
      ],
      internalSecrets: ["COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN"],
      operations: {
        retrieve_source: operation([
          "action", "authorityId", "citationLocator", "citationTitle",
          "environment", "evidenceQuery", "freshnessSeconds", "platform",
          "projectId", "publisher", "sourceType", "taskId", "url",
        ], ["cognitive_record_public_research_source_v2"]),
        record_claim: operation([
          "action", "boundedClaim", "canaryKey", "category", "confidence",
          "contradictionState", "environment", "freshnessDeadline",
          "platform", "projectId", "sourceIds", "taskId",
        ], ["cognitive_runtime.record_research_claim_with_readback"]),
        detect_contradiction: operation([
          "action", "boundedEvidence", "claimId", "environment", "platform",
          "projectId", "sourceId", "taskId",
        ], ["cognitive_record_public_research_contradiction_detection"]),
        expire_public_memory: operation(
          scope.filter((key) => key !== "action").concat("action", "limit"),
          ["cognitive_expire_public_research_maintenance"],
        ),
      },
      maxRequestBytes: 1_048_576,
    }),
    principal({
      id: "cognitive_research_evaluator",
      edgeSource: "supabase/functions/cognitive-research-evaluator/index.ts",
      operations: {
        evaluate_research_claim: operation(
          scope.concat("researchClaimId"),
          [
            "cognitive_runtime.research_evaluator_snapshot",
            "cognitive_runtime.derive_research_evaluation_with_readback",
          ],
        ),
        evaluate_contradiction_resolution: operation([
          ...scope, "boundedEvidence", "contradictionId",
          "resolutionSourceId",
        ], [
          "cognitive_resolve_public_research_contradiction",
        ]),
      },
      internalSecrets: ["COGNITIVE_INDEPENDENT_EVALUATOR_SERVICE_TOKEN"],
      maxRequestBytes: 32_768,
    }),
    principal({
      id: "cognitive_model_router",
      edgeSource: "supabase/functions/cognitive-model-router/index.ts",
      provider: "approved_model_provider",
      internalSecrets: ["COGNITIVE_MODEL_ROUTER_SERVICE_ASSERTION"],
      providerSecrets: ["COGNITIVE_MODEL_OPENAI_API_KEY"],
      runtimeConfiguration: {
        COGNITIVE_MODEL_FAMILY: "REPLACE_WITH_APPROVED_MODEL_FAMILY",
        COGNITIVE_MODEL_INPUT_USD_PER_MILLION:
          "REPLACE_WITH_APPROVED_INPUT_USD_PER_MILLION",
        COGNITIVE_MODEL_NAME: "REPLACE_WITH_APPROVED_MODEL_NAME",
        COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION:
          "REPLACE_WITH_APPROVED_OUTPUT_USD_PER_MILLION",
        COGNITIVE_MODEL_PROVIDER: "openai",
      },
      networkEgress: ["configured_model_api_origin_only"],
      operations: {
        assess_sanitized_evidence: operation([
          "action", "approvalTargetHash", "assessmentId", "blindFirstRound",
          "budget", "capabilityId", "councilRole", "environment",
          "evidencePacket", "evidencePacketHash", "idempotencyKey",
          "platform", "projectId", "schemaVersion", "scopeHash", "taskId",
        ], [
          "cognitive_model_router_recover_expired",
          "cognitive_model_router_reserve",
          "cognitive_runtime.cognitive_model_router_settle_provider_overrun",
          "cognitive_model_router_settle",
        ]),
      },
      maxRequestBytes: 65_536,
    }),
    principal({
      id: "cognitive_livekit_experience_collector",
      edgeSource:
        "supabase/functions/cognitive-livekit-experience-collector/index.ts",
      provider: "none",
      internalSecrets: ["COGNITIVE_LIVEKIT_SENTINEL_ASSERTION"],
      operations: {
        prepare_run: operation([
          "action", "evidenceManifestHash", "metricManifest",
          "observationFinishedAt", "observationStartedAt", "platform",
          "routeOrSurface", "runtimeIdentityHash", "sourceBuildHash",
        ], []),
        record_run: operation([
          "action", "evidenceManifestHash", "metricManifest",
          "observationFinishedAt", "observationStartedAt", "platform",
          "routeOrSurface", "runtimeIdentityHash", "sourceBuildHash",
        ], ["cognitive_runtime.collect_livekit_sentinel_run"]),
      },
      maxRequestBytes: 98_304,
    }),
    principal({
      id: "cognitive_github_draft_pr_broker",
      edgeSource:
        "supabase/functions/cognitive-github-draft-pr-broker/index.ts",
      provider: "github_app_repository_installation",
      internalSecrets: ["COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN"],
      providerSecrets: [
        "GITHUB_APP_ID",
        "GITHUB_APP_INSTALLATION_ID",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_REPOSITORY_ID",
      ],
      networkEgress: ["https://api.github.com"],
      operations: {
        status: operation(["action"], []),
        attest_provider_readback: operation(
          ["action", "projectId", "taskId"],
          ["cognitive_record_github_draft_pr_provider_readback"],
        ),
        execute_canary: operation([
          "action", "approvalScopeHash", "baseCommit", "branchName", "callId",
          "canaryKey", "capabilityId", "capabilityNonce", "capabilityToken",
          "commitMessage", "content", "path", "planSnapshotHash",
          "preflightReceiptId", "priorBlobSha", "projectId",
          "requiredTestsHash", "resourceLeaseId", "taskId", "title",
        ], [
          "cognitive_consume_github_draft_pr_capability",
          "cognitive_accept_github_draft_pr_tool_result",
        ]),
      },
      maxRequestBytes: 65_536,
    }),
    principal({
      id: "cognitive_level01_scheduler",
      edgeSource: "supabase/functions/cognitive-level01-scheduler/index.ts",
      operations: {
        evaluate_prerequisites: operation(
          ["action", "projectId", "taskId"],
          ["cognitive_runtime.scheduler_prerequisite_snapshot"],
        ),
        dispatch_occurrence: operation([
          "action", "capabilityId", "executionIdempotencyHash",
          "noWorkReasonHash", "objectiveHash", "projectId",
          "scheduleDefinitionId", "scheduleKey", "scheduledFor", "taskId",
          "workState",
        ], [
          "cognitive_runtime.scheduler_prerequisite_snapshot",
          "cognitive_runtime.issue_recurring_child_task",
        ]),
      },
      internalSecrets: ["COGNITIVE_LEVEL01_SCHEDULER_ASSERTION"],
      maxRequestBytes: 32_768,
    }),
  ]),
});

export const PRINCIPAL_BY_ID = new Map(
  RUNTIME_MANIFEST.principals.map((entry) => [entry.dbRole, entry]),
);
