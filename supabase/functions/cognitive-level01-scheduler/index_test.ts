import {
  evaluateScheduleSnapshot,
  exactDispatchPayload,
  handler,
  type ScheduleSnapshot,
} from "./index.ts";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertEquals = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
};

const NOW = new Date("2026-07-24T12:00:00.000Z");

const completeSnapshot = (): ScheduleSnapshot => ({
  canaries: [
    "dependency_security_research",
    "platform_policy_research",
    "repository_architecture_ux",
  ].map((key) => ({
    createdAt: "2026-07-23T12:00:00.000Z",
    evaluatorState: "pass",
    key,
    resultStatus: "passed",
    type: "research",
  })).concat(
    [
      "documentation_draft_pr",
      "low_risk_source_draft_pr",
      "test_only_draft_pr",
    ].map((key) => ({
      createdAt: "2026-07-23T12:00:00.000Z",
      evaluatorState: "pass",
      key,
      resultStatus: "passed",
      type: "draft_pr",
    })),
  ),
  emergencyActive: true,
  freshTaskFactory: {
    controlTaskReuseAllowed: false,
    deadmanBounded: true,
    factoryIdentity: "cognitive_level01_scheduler",
    freshTaskPerExecution: true,
    ready: true,
    retentionBounded: true,
    version: "v1",
  },
  githubCredentialConfigured: true,
  schedules: [
    {
      cadence: "30 14 * * *",
      enabled: false,
      key: "daily_non_personal_support_observability",
      maximumCost: 3,
      maximumTasks: 2,
      timeoutSeconds: 300,
    },
    {
      cadence: "0 14 * * *",
      enabled: false,
      key: "daily_platform_policy_security",
      maximumCost: 5,
      maximumTasks: 3,
      timeoutSeconds: 300,
    },
    {
      cadence: "30 15 * * 1",
      enabled: false,
      key: "weekly_architecture_dependency",
      maximumCost: 5,
      maximumTasks: 3,
      timeoutSeconds: 600,
    },
    {
      cadence: "0 16 * * 1",
      enabled: false,
      key: "weekly_experiment_outcome",
      maximumCost: 3,
      maximumTasks: 2,
      timeoutSeconds: 300,
    },
    {
      cadence: "0 15 * * 1",
      enabled: false,
      key: "weekly_ux_route_dead_control",
      maximumCost: 5,
      maximumTasks: 3,
      timeoutSeconds: 600,
    },
  ],
  switches: {
    cognitive_collective_deliberation_enabled: true,
    cognitive_draft_pr_executor_enabled: true,
    cognitive_installed_journey_sentinel_enabled: true,
    cognitive_level2_production_repairs_enabled: false,
    cognitive_memory_enabled: true,
    cognitive_research_enabled: true,
    cognitive_scheduled_level01_enabled: false,
    cognitive_user_derived_memory_enabled: false,
    cognitive_visual_experience_sentinel_enabled: true,
  },
  task: {
    cancelled: false,
    controlTask: true,
    environment: "production",
    platform: "shared",
    quarantined: false,
    repository: "Chillywood2025/chillywood-mobile",
  },
});

Deno.test("schedule evaluator separates activation from dispatch", () => {
  const evaluation = evaluateScheduleSnapshot(completeSnapshot(), NOW);
  assertEquals(evaluation.length, 5, "schedule count");
  assert(
    evaluation.every((entry) => entry.activationEligible),
    "eligible schedule blocked",
  );
  assert(
    evaluation.every((entry) => !entry.dispatchEligible),
    "master-off schedule dispatched",
  );
});

Deno.test("schedule evaluator dispatches only enabled definitions behind the master switch", () => {
  const snapshot = completeSnapshot();
  snapshot.switches.cognitive_scheduled_level01_enabled = true;
  snapshot.schedules = snapshot.schedules.map((schedule) => ({
    ...schedule,
    enabled: schedule.key === "daily_platform_policy_security",
  }));
  const evaluation = evaluateScheduleSnapshot(snapshot, NOW);
  const dispatched = evaluation.filter((entry) => entry.dispatchEligible);
  assertEquals(dispatched.length, 1, "dispatch count");
  assertEquals(
    dispatched[0].scheduleKey,
    "daily_platform_policy_security",
    "dispatched schedule",
  );
});

Deno.test("schedule evaluator requires a fresh child-task factory", () => {
  const missing = completeSnapshot();
  missing.freshTaskFactory = {
    controlTaskReuseAllowed: false,
    deadmanBounded: false,
    factoryIdentity: "unavailable",
    freshTaskPerExecution: false,
    ready: false,
    retentionBounded: false,
    version: "unavailable",
  };
  const reused = completeSnapshot();
  reused.freshTaskFactory.controlTaskReuseAllowed = true;
  for (const snapshot of [missing, reused]) {
    const evaluation = evaluateScheduleSnapshot(snapshot, NOW);
    assert(
      evaluation.every((entry) =>
        entry.blockers.includes("FRESH_SCHEDULE_TASK_FACTORY_REQUIRED")
      ),
      "long-lived control task reuse was accepted",
    );
  }
});

Deno.test("schedule evaluator rejects stale research evidence separately", () => {
  const snapshot = completeSnapshot();
  snapshot.canaries = snapshot.canaries.map((canary) =>
    canary.type === "research"
      ? { ...canary, createdAt: "2026-07-01T12:00:00.000Z" }
      : canary
  );
  const evaluation = evaluateScheduleSnapshot(snapshot, NOW);
  const platform = evaluation.find((entry) =>
    entry.scheduleKey === "daily_platform_policy_security"
  );
  const architecture = evaluation.find((entry) =>
    entry.scheduleKey === "weekly_architecture_dependency"
  );
  assert(
    platform?.blockers.includes("FRESH_RESEARCH_CANARIES_REQUIRED"),
    "stale platform evidence accepted",
  );
  assert(
    architecture?.blockers.includes(
      "FRESH_ARCHITECTURE_DEPENDENCY_EVIDENCE_REQUIRED",
    ),
    "stale architecture evidence accepted",
  );
});

Deno.test("schedule evaluator independently gates installed visual work", () => {
  const snapshot = completeSnapshot();
  snapshot.switches.cognitive_visual_experience_sentinel_enabled = false;
  const evaluation = evaluateScheduleSnapshot(snapshot, NOW);
  const ux = evaluation.find((entry) =>
    entry.scheduleKey === "weekly_ux_route_dead_control"
  );
  const platform = evaluation.find((entry) =>
    entry.scheduleKey === "daily_platform_policy_security"
  );
  assert(
    ux?.blockers.includes("INSTALLED_VISUAL_SENTINELS_REQUIRED"),
    "visual prerequisite omitted",
  );
  assert(
    !platform?.blockers.includes("INSTALLED_VISUAL_SENTINELS_REQUIRED"),
    "unrelated schedule inherited visual blocker",
  );
});

Deno.test("schedule evaluator keeps user-derived memory and Level 2 off", () => {
  for (
    const key of [
      "cognitive_user_derived_memory_enabled",
      "cognitive_level2_production_repairs_enabled",
    ]
  ) {
    const snapshot = completeSnapshot();
    snapshot.switches[key] = true;
    const evaluation = evaluateScheduleSnapshot(snapshot, NOW);
    assert(
      evaluation.every((entry) =>
        entry.blockers.includes("PERMANENTLY_DISABLED_SWITCH_VIOLATION")
      ),
      `${key} did not fail closed`,
    );
  }
});

Deno.test("schedule evaluator rejects modified schedule caps", () => {
  const snapshot = completeSnapshot();
  snapshot.schedules[0].maximumTasks = 10;
  const evaluation = evaluateScheduleSnapshot(snapshot, NOW);
  assert(
    evaluation.every((entry) =>
      entry.blockers.includes("EXACT_SCHEDULE_DEFINITIONS_REQUIRED")
    ),
    "modified schedule cap accepted",
  );
});

Deno.test("scheduler HTTP handler requires gateway and invocation authentication", async () => {
  const response = await handler(
    new Request("https://example.invalid", {
      body: JSON.stringify({
        action: "evaluate_prerequisites",
        projectId: "00000000-0000-4000-8000-000000000002",
        taskId: "00000000-0000-4000-8000-000000000001",
      }),
      method: "POST",
    }),
  );
  assertEquals(response.status, 401, "unauthenticated request status");
});

Deno.test("scheduler dispatch packet is exact, bounded, and no-work aware", () => {
  const base = {
    action: "dispatch_occurrence",
    capabilityId: "00000000-0000-4000-8000-000000000006",
    executionIdempotencyHash: "a".repeat(64),
    noWorkReasonHash: null,
    objectiveHash: "b".repeat(64),
    projectId: "00000000-0000-4000-8000-000000000002",
    scheduleDefinitionId: "00000000-0000-4000-8000-000000000005",
    scheduleKey: "daily_platform_policy_security",
    scheduledFor: "2026-07-24T14:00:00.000Z",
    taskId: "00000000-0000-4000-8000-000000000001",
    workState: "work_available",
  };
  assert(exactDispatchPayload(base), "valid dispatch rejected");
  assert(
    exactDispatchPayload({
      ...base,
      noWorkReasonHash: "c".repeat(64),
      workState: "no_work",
    }),
    "valid no-work dispatch rejected",
  );
  assert(
    !exactDispatchPayload({ ...base, merge: true }),
    "dispatch accepted authority expansion",
  );
  assert(
    !exactDispatchPayload({
      ...base,
      noWorkReasonHash: "c".repeat(64),
    }),
    "work dispatch accepted no-work reason",
  );
  assert(
    !exactDispatchPayload({
      ...base,
      scheduledFor: "2026-07-24T14:00:01.000Z",
    }),
    "non-minute occurrence accepted",
  );
});
