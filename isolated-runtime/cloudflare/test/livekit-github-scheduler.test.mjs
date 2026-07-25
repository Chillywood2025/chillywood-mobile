import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hashJson,
  sha256Hex,
} from "../src/contracts.mjs";
import {
  createGitHubBrokerAdapters,
  deriveDraftPlanContract,
  validateDraftPlan,
} from "../src/adapters/github.mjs";
import {
  GITHUB_PROVIDER_NO_MERGE_SCHEMA_VERSION,
  GITHUB_PROVIDER_SCOPE_MANIFEST_HASH,
} from "../src/adapters/github-provider-no-merge.mjs";
import {
  classifyLiveKitEvidence,
  LIVEKIT_COLLECTOR_ADAPTERS,
  prepareLiveKitPacket,
} from "../src/adapters/livekit.mjs";
import {
  createSchedulerAdapters,
  evaluateScheduleSnapshot,
  normalizeSchedulerSnapshot,
} from "../src/adapters/scheduler.mjs";
import { GITHUB_STATEMENTS } from "../src/database-statements/github.mjs";
import { LIVEKIT_STATEMENTS } from "../src/database-statements/livekit.mjs";
import { SCHEDULER_STATEMENTS } from "../src/database-statements/scheduler.mjs";

const TASK_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID = "00000000-0000-4000-8000-000000000002";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

const liveKitMetrics = ({
  installed = true,
  nowMillis = Date.now(),
} = {}) => {
  const headlessStarted = new Date(nowMillis - 20_000).toISOString();
  const headlessFinished = new Date(nowMillis - 5_000).toISOString();
  const installedStarted = installed
    ? new Date(nowMillis - 18_000).toISOString()
    : null;
  const installedFinished = installed
    ? new Date(nowMillis - 4_000).toISOString()
    : null;
  return {
    backgroundForegroundRecovery: false,
    backgrounded: false,
    buildRuntimeMatched: true,
    cleanupDisconnected: true,
    connectingResolved: true,
    firstAudioVideoObserved: true,
    firstRemoteMediaElapsedMs: 1_000,
    foregrounded: false,
    headlessParticipantUsed: true,
    headlessObservationFinishedAt: headlessFinished,
    headlessObservationStartedAt: headlessStarted,
    headlessParticipantIdentityHash: HASH_A,
    iceCheckingObserved: true,
    iceGatheringObserved: true,
    iceState: "connected",
    installedUiEvidenceHash: installed ? HASH_B : null,
    installedUiObserved: installed,
    installedObservationFinishedAt: installedFinished,
    installedObservationStartedAt: installedStarted,
    installedParticipantIdentityHash: installed ? HASH_C : null,
    installedRuntimeIdentityHash: installed ? HASH_B : null,
    installedRoomRunCorrelationHash: installed ? HASH_A : null,
    installedSourceBuildHash: installed ? HASH_C : null,
    localMediaSource: "test_tone",
    localTrackPublished: true,
    networkState: "ready",
    participantIdentityDistinct: installed,
    peerConnectionEstablished: true,
    permissionState: "granted",
    providerState: "healthy",
    remoteMediaKind: "audio",
    remoteParticipantJoined: true,
    remoteTrackSubscribed: true,
    roomConnectElapsedMs: 1_000,
    roomConnected: true,
    roomRunCorrelationHash: HASH_A,
    scenarioType: "success_baseline",
    stageFailureCategory: "none",
    tokenIssuedElapsedMs: 500,
    tokenRequestStarted: true,
    tokenRequested: true,
    tokenResultStatus: "success",
    tokenReturned: true,
    tokenClaimsValidated: true,
    uiStateResolutionElapsedMs: 1_000,
    websocketConnected: true,
  };
};

const liveKitPayload = async ({ installed = true } = {}) => {
  const metrics = liveKitMetrics({ installed });
  const evidenceManifestHash = await hashJson(metrics);
  return {
    action: "prepare_run",
    evidenceManifestHash,
    metricManifest: {
      evidenceHashes: [evidenceManifestHash],
      metrics,
      observationKind: "livekit_experience",
      sanitizationVersion: "bounded-nonpersonal-v1",
      schemaVersion: "product-sentinel-v1",
    },
    observationFinishedAt: installed
      ? metrics.installedObservationFinishedAt
      : metrics.headlessObservationFinishedAt,
    observationStartedAt: metrics.headlessObservationStartedAt,
    platform: "android",
    routeOrSurface: "live-stage",
    runtimeIdentityHash: HASH_B,
    sourceBuildHash: HASH_C,
  };
};

test("LiveKit headless-only evidence can never become an installed pass", async () => {
  const payload = await liveKitPayload({ installed: false });
  const packet = await prepareLiveKitPacket(payload);
  assert.ok(packet);
  assert.deepEqual(classifyLiveKitEvidence(payload.metricManifest.metrics), {
    failureCategory: "none",
    physicalProofStatus: "source_only",
    resultStatus: "blocked",
  });
  assert.equal(packet.stages.installedEvidence, "headless_only");
  assert.equal(packet.stages.installedPassEligible, false);
});

test("LiveKit recovery is scenario-bound and does not poison a baseline", () => {
  const ordinary = liveKitMetrics();
  assert.deepEqual(classifyLiveKitEvidence(ordinary), {
    failureCategory: "none",
    physicalProofStatus: "installed_ui_observed",
    resultStatus: "passed",
  });
  const recovery = {
    ...ordinary,
    scenarioType: "background_foreground_recovery",
  };
  assert.deepEqual(classifyLiveKitEvidence(recovery), {
    failureCategory: "background_foreground_recovery_failed",
    physicalProofStatus: "installed_ui_observed",
    resultStatus: "failed",
  });
});

test("a healthy run cannot satisfy the bounded failure fixture", async () => {
  const payload = await liveKitPayload();
  payload.metricManifest.metrics.scenarioType = "bounded_failure_fixture";
  payload.evidenceManifestHash = await hashJson(
    payload.metricManifest.metrics,
  );
  payload.metricManifest.evidenceHashes = [payload.evidenceManifestHash];
  assert.equal(await prepareLiveKitPacket(payload), null);
});

test("LiveKit record validates the packet then uses only its isolated RPC", async () => {
  const payload = await liveKitPayload();
  payload.action = "record_run";
  const calls = [];
  const result = await LIVEKIT_COLLECTOR_ADAPTERS.record_run.execute({
    context: {
      platform: "android",
      projectId: PROJECT_ID,
      taskId: TASK_ID,
    },
    database: {
      call: async (statement, parameters) => {
        calls.push({ parameters, statement });
        return { sentinelRunId: "00000000-0000-4000-8000-000000000003" };
      },
    },
    env: { COGNITIVE_LIVEKIT_SENTINEL_ASSERTION: "assertion" },
    payload,
  });
  assert.equal(result.persisted, true);
  assert.equal(result.classification.resultStatus, "passed");
  assert.deepEqual(
    calls.map((entry) => entry.statement),
    ["collectLiveKitSentinelRun"],
  );
  assert.equal(calls[0].parameters.length, 16);
  assert.equal(calls[0].parameters[2], "android");
  assert.equal(calls[0].parameters[3], "production");
  assert.equal(calls[0].parameters[9], "passed");
});

test("LiveKit mismatched installed identity binding fails closed", async () => {
  const payload = await liveKitPayload();
  payload.metricManifest.metrics.installedRuntimeIdentityHash = HASH_A;
  payload.evidenceManifestHash = await hashJson(payload.metricManifest.metrics);
  payload.metricManifest.evidenceHashes = [payload.evidenceManifestHash];
  assert.equal(await prepareLiveKitPacket(payload), null);
});

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY = privateKey.export({
  format: "pem",
  type: "pkcs8",
}).toString();
const GITHUB_NOW = Date.parse("2026-07-24T18:00:00.000Z");
const BASE_COMMIT = "1".repeat(40);
const BASE_TREE = "2".repeat(40);
const BLOB_SHA = "3".repeat(40);
const TREE_SHA = "4".repeat(40);
const FINAL_COMMIT = "5".repeat(40);

const githubEnv = () => ({
  COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN: "broker-identity",
  GITHUB_APP_ID: "12345",
  GITHUB_APP_INSTALLATION_ID: "23456",
  GITHUB_APP_PRIVATE_KEY: PRIVATE_KEY,
  GITHUB_REPOSITORY_ID: "34567",
});

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

const createFakeGitHub = ({ pullFails = false } = {}) => {
  const events = [];
  const fetcher = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method ?? "GET";
    events.push(`provider:${method}:${parsed.pathname}`);
    if (parsed.pathname.endsWith("/access_tokens")) {
      return jsonResponse({
        expires_at: new Date(GITHUB_NOW + 30 * 60_000).toISOString(),
        permissions: {
          contents: "write",
          metadata: "read",
          pull_requests: "write",
        },
        repositories: [{
          full_name: "Chillywood2025/chillywood-mobile",
          id: 34567,
        }],
        token: "test-only-installation-token-not-a-secret",
      });
    }
    if (
      parsed.pathname.includes("cognitive-canary")
    ) {
      return jsonResponse({ message: "Not Found" }, 404);
    }
    if (parsed.pathname.includes("/git/ref/heads/codex%2F")) {
      return jsonResponse({ object: { sha: BASE_COMMIT } });
    }
    if (parsed.pathname.includes("/contents/")) {
      return jsonResponse({ message: "Not Found" }, 404);
    }
    if (
      method === "GET" &&
      parsed.pathname.endsWith(`/git/commits/${BASE_COMMIT}`)
    ) {
      return jsonResponse({ tree: { sha: BASE_TREE } });
    }
    if (method === "POST" && parsed.pathname.endsWith("/git/blobs")) {
      return jsonResponse({ sha: BLOB_SHA });
    }
    if (method === "POST" && parsed.pathname.endsWith("/git/trees")) {
      return jsonResponse({ sha: TREE_SHA });
    }
    if (method === "POST" && parsed.pathname.endsWith("/git/commits")) {
      return jsonResponse({ sha: FINAL_COMMIT });
    }
    if (method === "POST" && parsed.pathname.endsWith("/git/refs")) {
      return jsonResponse({ ref: "created" });
    }
    if (method === "POST" && parsed.pathname.endsWith("/pulls")) {
      if (pullFails) return jsonResponse({ message: "failed" }, 500);
      return jsonResponse({
        base: { ref: "codex/cognitive-level01-operationalization" },
        draft: true,
        head: { ref: "codex/cognitive-canary/documentation-proof" },
        merged: false,
        number: 101,
      });
    }
    throw new Error(`unexpected_fake_github_request:${method}:${parsed.pathname}`);
  };
  return { events, fetcher };
};
const verifyProviderMergeDenial = async () => {
  const unsigned = {
    appPublicFingerprintHash: await sha256Hex(
      "github-app-installation|12345|23456|34567",
    ),
    baseBranch: "codex/cognitive-level01-operationalization",
    bypassManifestHash: await hashJson([]),
    deniedMergeEvidenceHash: HASH_A,
    expiresAt: new Date(GITHUB_NOW + 20 * 60_000).toISOString(),
    permissionManifestHash: await hashJson({
      contents: "write",
      metadata: "read",
      pull_requests: "write",
    }),
    providerStatus: "provider_enforced_no_merge",
    repository: "Chillywood2025/chillywood-mobile",
    repositorySelectionHash: await hashJson([{
      fullName: "Chillywood2025/chillywood-mobile",
      id: 34567,
    }]),
    rulesetIdHash: HASH_B,
    rulesetPolicyHash: HASH_C,
    schemaVersion: GITHUB_PROVIDER_NO_MERGE_SCHEMA_VERSION,
    scopeManifestHash: GITHUB_PROVIDER_SCOPE_MANIFEST_HASH,
    verifiedAt: new Date(GITHUB_NOW - 60_000).toISOString(),
  };
  return {
    ...unsigned,
    proofHash: await hashJson(unsigned),
  };
};

const draftPayload = async () => {
  const payload = {
    action: "execute_canary",
    approvalScopeHash: "6".repeat(64),
    baseCommit: BASE_COMMIT,
    branchName: "codex/cognitive-canary/documentation-proof",
    callId: "call-proof-001",
    canaryKey: "documentation_draft_pr",
    capabilityId: "capability_proof_001",
    capabilityNonce: "n".repeat(40),
    capabilityToken: "t".repeat(40),
    commitMessage: "Add governed documentation canary",
    content: "# Governed canary\n",
    path: "docs/intelligence/canaries/runtime-proof.md",
    planSnapshotHash: "7".repeat(64),
    preflightReceiptId: "00000000-0000-4000-8000-000000000003",
    priorBlobSha: "absent",
    projectId: PROJECT_ID,
    requiredTestsHash: "8".repeat(64),
    resourceLeaseId: "00000000-0000-4000-8000-000000000004",
    taskId: TASK_ID,
    title: "Add governed documentation canary",
  };
  const initial = validateDraftPlan(payload);
  assert.ok(initial);
  payload.planSnapshotHash = (
    await deriveDraftPlanContract(initial)
  ).planContractHash;
  assert.ok(validateDraftPlan(payload));
  return payload;
};

const createGithubDatabase = (events) => ({
  call: async (statement) => {
    events.push(`database:${statement}`);
    if (statement === "recordGithubProviderReadback") {
      return {
        provider_readback_id:
          "00000000-0000-4000-8000-000000000005",
      };
    }
    if (statement === "consumeGithubCapability") return 1;
    if (statement === "acceptGithubToolResult") {
      return "00000000-0000-4000-8000-000000000006";
    }
    throw new Error(`unexpected_database_statement:${statement}`);
  },
});

test("GitHub App adapter is exact-repository, draft-only, and postflight-bound", async () => {
  const fake = createFakeGitHub();
  const database = createGithubDatabase(fake.events);
  const adapters = createGitHubBrokerAdapters({
    fetcher: fake.fetcher,
    now: () => GITHUB_NOW,
    verifyProviderMergeDenial,
  });
  const result = await adapters.execute_canary.execute({
    database,
    env: githubEnv(),
    payload: await draftPayload(),
  });
  assert.equal(result.draft, true);
  assert.equal(result.result, "draft_pr_opened");
  assert.ok(
    fake.events.indexOf("database:consumeGithubCapability") <
      fake.events.indexOf(
        "provider:POST:/repos/Chillywood2025/chillywood-mobile/git/blobs",
      ),
  );
  assert.ok(
    fake.events.indexOf("database:acceptGithubToolResult") >
      fake.events.indexOf(
        "provider:POST:/repos/Chillywood2025/chillywood-mobile/pulls",
      ),
  );
  assert.equal(
    fake.events.some((event) =>
      /merge|release|deployment|workflow|action/iu.test(event)
    ),
    false,
  );
});

test("GitHub provider attestation stores hashes and bounded readback only", async () => {
  const fake = createFakeGitHub();
  const adapters = createGitHubBrokerAdapters({
    fetcher: fake.fetcher,
    now: () => GITHUB_NOW,
    verifyProviderMergeDenial,
  });
  const result = await adapters.attest_provider_readback.execute({
    context: { projectId: PROJECT_ID, taskId: TASK_ID },
    database: createGithubDatabase(fake.events),
    env: githubEnv(),
  });
  assert.equal(result.result, "configured");
  assert.match(result.evidenceHash, /^[a-f0-9]{64}$/u);
  assert.equal(Object.hasOwn(result, "token"), false);
  assert.deepEqual(
    fake.events.filter((entry) => entry.startsWith("database:")),
    ["database:recordGithubProviderReadback"],
  );
});

test("GitHub draft failure after branch creation records a failed postflight", async () => {
  const fake = createFakeGitHub({ pullFails: true });
  const adapters = createGitHubBrokerAdapters({
    fetcher: fake.fetcher,
    now: () => GITHUB_NOW,
    verifyProviderMergeDenial,
  });
  await assert.rejects(
    adapters.execute_canary.execute({
      database: createGithubDatabase(fake.events),
      env: githubEnv(),
      payload: await draftPayload(),
    }),
    /github_draft_pr_creation_rejected/u,
  );
  assert.equal(
    fake.events.filter((event) =>
      event === "database:acceptGithubToolResult"
    ).length,
    1,
  );
});

test("GitHub rechecks liveness before every repository mutation", async () => {
  const fake = createFakeGitHub();
  const adapters = createGitHubBrokerAdapters({
    fetcher: fake.fetcher,
    now: () => GITHUB_NOW,
    verifyProviderMergeDenial,
  });
  let checkpoints = 0;
  await assert.rejects(
    adapters.execute_canary.execute({
      assertActive: async () => {
        checkpoints += 1;
        if (checkpoints >= 3) throw new Error("emergency_stop_rejected");
      },
      database: createGithubDatabase(fake.events),
      env: githubEnv(),
      payload: await draftPayload(),
    }),
    /emergency_stop_rejected/u,
  );
  assert.equal(
    fake.events.some((event) =>
      event ===
        "provider:POST:/repos/Chillywood2025/chillywood-mobile/git/blobs"
    ),
    false,
  );
});

test("GitHub rejects an oversized streamed response before buffering it", async () => {
  const oversized = new Uint8Array(131_073).fill(0x61);
  const adapters = createGitHubBrokerAdapters({
    fetcher: async () =>
      new Response(oversized, {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    now: () => GITHUB_NOW,
    verifyProviderMergeDenial,
  });
  await assert.rejects(
    adapters.attest_provider_readback.execute({
      context: { projectId: PROJECT_ID, taskId: TASK_ID },
      database: createGithubDatabase([]),
      env: githubEnv(),
    }),
    /github_response_rejected/u,
  );
});

test("GitHub broker stays blocked without provider-enforced merge denial", async () => {
  let providerCalls = 0;
  const adapters = createGitHubBrokerAdapters({
    fetcher: async () => {
      providerCalls += 1;
      throw new Error("provider_call_not_expected");
    },
    now: () => GITHUB_NOW,
  });
  const status = await adapters.status.execute({ env: githubEnv() });
  assert.equal(
    status.blocker,
    "GITHUB_NO_MERGE_PROVIDER_PROOF_REQUIRED",
  );
  assert.equal(status.providerMergeDenial, "MISSING");
  assert.equal(status.runtimeAuthority, "blocked");
  await assert.rejects(
    adapters.attest_provider_readback.execute({
      context: { projectId: PROJECT_ID, taskId: TASK_ID },
      database: createGithubDatabase([]),
      env: githubEnv(),
    }),
    /GITHUB_NO_MERGE_PROVIDER_PROOF_REQUIRED/u,
  );
  assert.equal(providerCalls, 0);
});

test("GitHub broker rejects a bare boolean provider proof", async () => {
  const fake = createFakeGitHub();
  const adapters = createGitHubBrokerAdapters({
    fetcher: fake.fetcher,
    now: () => GITHUB_NOW,
    verifyProviderMergeDenial: async () => true,
  });
  const status = await adapters.status.execute({ env: githubEnv() });
  assert.equal(
    status.blocker,
    "GITHUB_NO_MERGE_PROVIDER_PROOF_REQUIRED",
  );
  assert.equal(status.providerMergeDenial, "MISSING");
  assert.equal(
    fake.events.some((entry) => entry.includes("/access_tokens")),
    false,
  );
});

test("GitHub plans reject forbidden paths and credential-shaped content", async () => {
  const payload = await draftPayload();
  assert.equal(validateDraftPlan({ ...payload, path: ".github/workflows/a.yml" }), null);
  const exactSourcePayload = {
    ...payload,
    branchName: "codex/cognitive-canary/home-tab-target",
    canaryKey: "low_risk_source_draft_pr",
    path: "components/haptic-tab.tsx",
    priorBlobSha: "b".repeat(40),
  };
  assert.ok(validateDraftPlan(exactSourcePayload));
  for (
    const path of [
      "components/AuthScreen.tsx",
      "components/PaymentScreen.tsx",
      "components/RolesScreen.tsx",
      "components/haptic-tab-copy.tsx",
      "app/(tabs)/_layout.tsx",
    ]
  ) {
    assert.equal(
      validateDraftPlan({ ...exactSourcePayload, path }),
      null,
      `${path} must remain outside the exact low-risk source canary`,
    );
  }
  assert.equal(
    validateDraftPlan({
      ...payload,
      content: "github_token=github_pat_abcdefghijklmnopqrstuvwxyz123456",
    }),
    null,
  );
});

const SCHEDULER_NOW = new Date("2026-07-24T18:00:00.000Z");
const scheduleDefinitions = [
  ["daily_non_personal_support_observability", "30 14 * * *", 2, 3, 300,
    "research", 7, [
      "platform_policy_research",
      "repository_architecture_ux",
    ]],
  ["daily_platform_policy_security", "0 14 * * *", 3, 5, 300,
    "research", 7, [
      "dependency_security_research",
      "platform_policy_research",
      "repository_architecture_ux",
    ]],
  ["weekly_architecture_dependency", "30 15 * * 1", 3, 5, 600,
    "research", 7, [
      "dependency_security_research",
      "repository_architecture_ux",
    ]],
  ["weekly_experiment_outcome", "0 16 * * 1", 2, 3, 300,
    "draft_pr", 30, [
      "documentation_draft_pr",
      "low_risk_source_draft_pr",
      "test_only_draft_pr",
    ]],
  ["weekly_ux_route_dead_control", "0 15 * * 1", 3, 5, 600,
    "installed_sentinel", 7, [
      "installed_journey_sentinel",
      "visual_product_experience_sentinel",
    ]],
];

const schedulerSnapshot = () => {
  const completedAt = new Date(
    SCHEDULER_NOW.getTime() - 86_400_000,
  ).toISOString();
  const canaries = [
    ...["dependency_security_research", "platform_policy_research",
      "repository_architecture_ux"].map((key) => ({
      completedAt,
      evaluatorState: "pass",
      key,
      resultStatus: "passed",
      type: "research",
    })),
    ...["documentation_draft_pr", "low_risk_source_draft_pr",
      "test_only_draft_pr"].map((key) => ({
      completedAt,
      evaluatorState: "pass",
      key,
      resultStatus: "passed",
      type: "draft_pr",
    })),
  ];
  return {
    canaries,
    emergency: {
      active: true,
      status: "active",
      systemId: "product_intelligence_operator",
    },
    freshTaskFactory: {
      controlTaskReuseAllowed: false,
      deadmanBounded: true,
      factoryIdentity: "cognitive_level01_scheduler",
      freshTaskPerExecution: true,
      ready: true,
      retentionBounded: true,
      version: "v1",
    },
    githubCredential: {
      configured: true,
      current: true,
      expiresAt: new Date(
        SCHEDULER_NOW.getTime() + 86_400_000,
      ).toISOString(),
      state: "configured",
      verifiedAt: completedAt,
    },
    schedules: scheduleDefinitions.map(
      ([
        key,
        cadence,
        maximumTasks,
        maximumCost,
        timeoutSeconds,
        kind,
        maximumAgeDays,
        requiredKeys,
      ], index) => ({
        activationPrerequisitesPass: true,
        cadence,
        canaryState: {
          current: true,
          kind,
          maximumAgeDays,
          passingCount: requiredKeys.length,
          passingKeys: [...requiredKeys],
          requiredCount: requiredKeys.length,
          requiredKeys: [...requiredKeys],
        },
        currentState: "enabled_dispatch_eligible",
        definitionValid: true,
        dispatchPrerequisitesPass: true,
        enabled: true,
        id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
        key,
        maximumCost,
        maximumTasks,
        timeoutSeconds,
      }),
    ),
    scope: {
      cancelled: false,
      controlTask: true,
      dataClassAllowed: true,
      deadmanCurrent: true,
      environment: "production",
      platform: "shared",
      productionAuthority: false,
      projectId: PROJECT_ID,
      quarantined: false,
      repository: "Chillywood2025/chillywood-mobile",
      taskId: TASK_ID,
      taskKey: "cognitive-level01-canary-control",
    },
    snapshotVersion: "v1",
    switches: {
      cognitive_collective_deliberation_enabled: true,
      cognitive_draft_pr_executor_enabled: true,
      cognitive_installed_journey_sentinel_enabled: true,
      cognitive_level2_production_repairs_enabled: false,
      cognitive_memory_enabled: true,
      cognitive_research_enabled: true,
      cognitive_scheduled_level01_enabled: true,
      cognitive_user_derived_memory_enabled: false,
      cognitive_visual_experience_sentinel_enabled: true,
    },
  };
};

test("scheduler accepts only the full bounded prerequisite snapshot", () => {
  assert.equal(
    normalizeSchedulerSnapshot(
      {
        controlTaskReuseAllowed: false,
        ready: true,
        version: "v1",
      },
      SCHEDULER_NOW,
    ),
    null,
  );
  const normalized = normalizeSchedulerSnapshot(
    schedulerSnapshot(),
    SCHEDULER_NOW,
  );
  assert.ok(normalized);
  const evaluation = evaluateScheduleSnapshot(normalized);
  assert.equal(evaluation.length, 5);
  assert.equal(evaluation.every((row) => row.dispatchEligible), true);
});

test("scheduler independently enforces the daily two-canary and weekly installed gates", () => {
  const dailyBlocked = schedulerSnapshot();
  dailyBlocked.canaries = dailyBlocked.canaries.filter((canary) =>
    canary.key !== "repository_architecture_ux"
  );
  for (
    const key of [
      "daily_non_personal_support_observability",
      "daily_platform_policy_security",
      "weekly_architecture_dependency",
    ]
  ) {
    const schedule = dailyBlocked.schedules.find((row) => row.key === key);
    schedule.canaryState.current = false;
    schedule.canaryState.passingKeys = schedule.canaryState.passingKeys.filter(
      (entry) => entry !== "repository_architecture_ux",
    );
    schedule.canaryState.passingCount = schedule.canaryState.passingKeys.length;
    schedule.activationPrerequisitesPass = false;
    schedule.dispatchPrerequisitesPass = false;
    schedule.currentState = "enabled_blocked";
  }
  const normalizedDaily = normalizeSchedulerSnapshot(
    dailyBlocked,
    SCHEDULER_NOW,
  );
  assert.ok(normalizedDaily);
  assert.equal(
    evaluateScheduleSnapshot(normalizedDaily)
      .find((row) =>
        row.scheduleKey === "daily_non_personal_support_observability"
      ).dispatchEligible,
    false,
  );

  const installedBlocked = schedulerSnapshot();
  const weekly = installedBlocked.schedules.find((row) =>
    row.key === "weekly_ux_route_dead_control"
  );
  weekly.canaryState.current = false;
  weekly.canaryState.passingKeys = ["installed_journey_sentinel"];
  weekly.canaryState.passingCount = 1;
  weekly.activationPrerequisitesPass = false;
  weekly.dispatchPrerequisitesPass = false;
  weekly.currentState = "enabled_blocked";
  const normalizedInstalled = normalizeSchedulerSnapshot(
    installedBlocked,
    SCHEDULER_NOW,
  );
  assert.ok(normalizedInstalled);
  assert.match(
    evaluateScheduleSnapshot(normalizedInstalled)
      .find((row) => row.scheduleKey === "weekly_ux_route_dead_control")
      .blockers.join(","),
    /FRESH_EVALUATED_INSTALLED_SENTINEL_EVIDENCE_REQUIRED/u,
  );
});

test("scheduler dispatch rereads exact prerequisites before issuing one child", async () => {
  const calls = [];
  const adapters = createSchedulerAdapters({ now: () => SCHEDULER_NOW });
  const schedule = schedulerSnapshot().schedules[0];
  const result = await adapters.dispatch_occurrence.execute({
    context: { projectId: PROJECT_ID, taskId: TASK_ID },
    database: {
      call: async (statement, parameters) => {
        calls.push({ parameters, statement });
        if (statement === "schedulerPrerequisiteSnapshot") {
          return schedulerSnapshot();
        }
        return {
          childBudgetId: "00000000-0000-4000-8000-000000000020",
          childTaskId: "00000000-0000-4000-8000-000000000021",
          deduplicated: false,
          resultStatus: "task_created",
          schedulerIssuanceId: "00000000-0000-4000-8000-000000000022",
        };
      },
    },
    env: { COGNITIVE_LEVEL01_SCHEDULER_ASSERTION: "scheduler-assertion" },
    payload: {
      action: "dispatch_occurrence",
      capabilityId: "00000000-0000-4000-8000-000000000023",
      executionIdempotencyHash: HASH_A,
      noWorkReasonHash: null,
      objectiveHash: HASH_B,
      projectId: PROJECT_ID,
      scheduleDefinitionId: schedule.id,
      scheduleKey: schedule.key,
      scheduledFor: "2026-07-25T14:30:00.000Z",
      taskId: TASK_ID,
      workState: "work_available",
    },
  });
  assert.equal(result.childTaskCreated, true);
  assert.deepEqual(
    calls.map((entry) => entry.statement),
    ["schedulerPrerequisiteSnapshot", "issueRecurringChildTask"],
  );
  assert.equal(calls[1].parameters.length, 12);
});

test("new database statements are static and exact-arity", async () => {
  assert.equal(LIVEKIT_STATEMENTS.collectLiveKitSentinelRun.arity, 16);
  assert.equal(GITHUB_STATEMENTS.recordGithubProviderReadback.arity, 9);
  assert.equal(GITHUB_STATEMENTS.consumeGithubCapability.arity, 37);
  assert.equal(GITHUB_STATEMENTS.acceptGithubToolResult.arity, 12);
  assert.equal(SCHEDULER_STATEMENTS.schedulerPrerequisiteSnapshot.arity, 4);
  assert.equal(SCHEDULER_STATEMENTS.issueRecurringChildTask.arity, 12);
  for (
    const statement of [
      ...Object.values(LIVEKIT_STATEMENTS),
      ...Object.values(GITHUB_STATEMENTS),
      ...Object.values(SCHEDULER_STATEMENTS),
    ]
  ) {
    assert.doesNotMatch(statement.text, /\$\{/u);
    assert.match(statement.text, /^select /u);
  }
});

test("scheduler source has no provider credential path", async () => {
  const source = await readFile(
    new URL("../src/adapters/scheduler.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /GITHUB_APP_PRIVATE_KEY|LIVEKIT_API_SECRET|MODEL_API_KEY|fetch\(/u,
  );
});
