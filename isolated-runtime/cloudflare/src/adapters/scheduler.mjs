import { sha256Hex } from "../contracts.mjs";
import { ready } from "./helpers.mjs";

const REPOSITORY = "Chillywood2025/chillywood-mobile";
const CONTROL_TASK_KEY = "cognitive-level01-canary-control";
const HASH = /^[a-f0-9]{64}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RESEARCH_CANARIES = Object.freeze([
  "dependency_security_research",
  "platform_policy_research",
  "repository_architecture_ux",
]);
const DRAFT_PR_CANARIES = Object.freeze([
  "documentation_draft_pr",
  "low_risk_source_draft_pr",
  "test_only_draft_pr",
]);
const INSTALLED_SENTINELS = Object.freeze([
  "installed_journey_sentinel",
  "visual_product_experience_sentinel",
]);
const REQUIRED_SCHEDULES = Object.freeze({
  daily_non_personal_support_observability: Object.freeze({
    cadence: "30 14 * * *",
    canaryKind: "research",
    maximumAgeDays: 7,
    maximumCost: 3,
    maximumTasks: 2,
    requiredKeys: Object.freeze([
      "platform_policy_research",
      "repository_architecture_ux",
    ]),
    timeoutSeconds: 300,
  }),
  daily_platform_policy_security: Object.freeze({
    cadence: "0 14 * * *",
    canaryKind: "research",
    maximumAgeDays: 7,
    maximumCost: 5,
    maximumTasks: 3,
    requiredKeys: Object.freeze([
      "dependency_security_research",
      "platform_policy_research",
      "repository_architecture_ux",
    ]),
    timeoutSeconds: 300,
  }),
  weekly_architecture_dependency: Object.freeze({
    cadence: "30 15 * * 1",
    canaryKind: "research",
    maximumAgeDays: 7,
    maximumCost: 5,
    maximumTasks: 3,
    requiredKeys: Object.freeze([
      "dependency_security_research",
      "repository_architecture_ux",
    ]),
    timeoutSeconds: 600,
  }),
  weekly_experiment_outcome: Object.freeze({
    cadence: "0 16 * * 1",
    canaryKind: "draft_pr",
    maximumAgeDays: 30,
    maximumCost: 3,
    maximumTasks: 2,
    requiredKeys: DRAFT_PR_CANARIES,
    timeoutSeconds: 300,
  }),
  weekly_ux_route_dead_control: Object.freeze({
    cadence: "0 15 * * 1",
    canaryKind: "installed_sentinel",
    maximumAgeDays: 7,
    maximumCost: 5,
    maximumTasks: 3,
    requiredKeys: INSTALLED_SENTINELS,
    timeoutSeconds: 600,
  }),
});
const REQUIRED_SWITCHES = Object.freeze([
  "cognitive_collective_deliberation_enabled",
  "cognitive_draft_pr_executor_enabled",
  "cognitive_installed_journey_sentinel_enabled",
  "cognitive_memory_enabled",
  "cognitive_research_enabled",
  "cognitive_scheduled_level01_enabled",
  "cognitive_user_derived_memory_enabled",
  "cognitive_visual_experience_sentinel_enabled",
  "cognitive_level2_production_repairs_enabled",
]);
const SNAPSHOT_KEYS = Object.freeze([
  "canaries",
  "emergency",
  "freshTaskFactory",
  "githubCredential",
  "schedules",
  "scope",
  "snapshotVersion",
  "switches",
]);
const DISPATCH_KEYS = Object.freeze([
  "action",
  "capabilityId",
  "executionIdempotencyHash",
  "noWorkReasonHash",
  "objectiveHash",
  "projectId",
  "scheduleDefinitionId",
  "scheduleKey",
  "scheduledFor",
  "taskId",
  "workState",
]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
};

const canonicalTimestamp = (value) => {
  if (typeof value !== "string") return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value
    ? millis
    : null;
};

const unique = (values) => [...new Set(values)].sort();

const canaryTypeFor = (key) =>
  RESEARCH_CANARIES.includes(key)
    ? "research"
    : DRAFT_PR_CANARIES.includes(key)
    ? "draft_pr"
    : null;

const factoryIsReady = (factory) =>
  factory.ready === true &&
  factory.factoryIdentity === "cognitive_level01_scheduler" &&
  factory.freshTaskPerExecution === true &&
  factory.controlTaskReuseAllowed === false &&
  factory.deadmanBounded === true &&
  factory.retentionBounded === true &&
  /^v[1-9][0-9]{0,2}$/u.test(factory.version);

const scopeIsReady = (scope) =>
  scope.repository === REPOSITORY &&
  scope.taskKey === CONTROL_TASK_KEY &&
  scope.platform === "shared" &&
  scope.environment === "production" &&
  scope.controlTask === true &&
  scope.cancelled === false &&
  scope.quarantined === false &&
  scope.deadmanCurrent === true &&
  scope.dataClassAllowed === true &&
  scope.productionAuthority === false;

const commonActivationReady = (snapshot) =>
  scopeIsReady(snapshot.scope) &&
  snapshot.emergency.active === true &&
  factoryIsReady(snapshot.freshTaskFactory) &&
  snapshot.switches.cognitive_research_enabled === true &&
  snapshot.switches.cognitive_memory_enabled === true &&
  snapshot.switches.cognitive_user_derived_memory_enabled === false &&
  snapshot.switches.cognitive_level2_production_repairs_enabled === false &&
  snapshot.schedules.every((schedule) => schedule.definitionValid);

const routeActivationReady = (snapshot, schedule) => {
  if (!schedule.canaryState.current) return false;
  if (schedule.key === "weekly_ux_route_dead_control") {
    return snapshot.switches.cognitive_installed_journey_sentinel_enabled &&
      snapshot.switches.cognitive_visual_experience_sentinel_enabled;
  }
  if (schedule.key === "weekly_experiment_outcome") {
    return snapshot.switches.cognitive_collective_deliberation_enabled &&
      snapshot.switches.cognitive_draft_pr_executor_enabled &&
      snapshot.githubCredential.configured &&
      snapshot.githubCredential.current;
  }
  return true;
};

const computedActivationReady = (snapshot, schedule) =>
  commonActivationReady(snapshot) &&
  routeActivationReady(snapshot, schedule);

const currentStateFor = (schedule, activationReady, dispatchReady) =>
  schedule.enabled
    ? dispatchReady
      ? "enabled_dispatch_eligible"
      : "enabled_blocked"
    : activationReady
    ? "disabled_activation_eligible"
    : "disabled_blocked";

export const normalizeSchedulerSnapshot = (
  value,
  now = new Date(),
) => {
  if (!exactKeys(value, SNAPSHOT_KEYS) || value.snapshotVersion !== "v1") {
    return null;
  }
  const nowMillis = now.getTime();
  if (
    !Number.isFinite(nowMillis) ||
    !exactKeys(value.scope, [
      "cancelled",
      "controlTask",
      "dataClassAllowed",
      "deadmanCurrent",
      "environment",
      "platform",
      "productionAuthority",
      "projectId",
      "quarantined",
      "repository",
      "taskId",
      "taskKey",
    ]) ||
    !UUID.test(value.scope.taskId) ||
    !UUID.test(value.scope.projectId) ||
    ["cancelled", "controlTask", "dataClassAllowed", "deadmanCurrent",
      "productionAuthority", "quarantined"].some((key) =>
      typeof value.scope[key] !== "boolean"
    ) ||
    !exactKeys(value.emergency, [
      "active",
      "status",
      "systemId",
    ]) ||
    value.emergency.systemId !== "product_intelligence_operator" ||
    !["active", "paused", "emergency_stop", "missing"].includes(
      value.emergency.status,
    ) ||
    value.emergency.active !== (value.emergency.status === "active") ||
    !exactKeys(value.freshTaskFactory, [
      "controlTaskReuseAllowed",
      "deadmanBounded",
      "factoryIdentity",
      "freshTaskPerExecution",
      "ready",
      "retentionBounded",
      "version",
    ]) ||
    ["controlTaskReuseAllowed", "deadmanBounded", "freshTaskPerExecution",
      "ready", "retentionBounded"].some((key) =>
      typeof value.freshTaskFactory[key] !== "boolean"
    ) ||
    typeof value.freshTaskFactory.factoryIdentity !== "string" ||
    typeof value.freshTaskFactory.version !== "string" ||
    !exactKeys(value.githubCredential, [
      "configured",
      "current",
      "expiresAt",
      "state",
      "verifiedAt",
    ]) ||
    !["configured", "missing", "revoked", "expired"].includes(
      value.githubCredential.state,
    ) ||
    typeof value.githubCredential.configured !== "boolean" ||
    typeof value.githubCredential.current !== "boolean" ||
    value.githubCredential.configured !==
      (value.githubCredential.state === "configured") ||
    !isRecord(value.switches) ||
    Object.keys(value.switches).length !== REQUIRED_SWITCHES.length ||
    REQUIRED_SWITCHES.some((key) => typeof value.switches[key] !== "boolean") ||
    !Array.isArray(value.canaries) ||
    value.canaries.length > 6 ||
    !Array.isArray(value.schedules) ||
    value.schedules.length !== Object.keys(REQUIRED_SCHEDULES).length
  ) {
    return null;
  }
  const verifiedAt = canonicalTimestamp(value.githubCredential.verifiedAt);
  const expiresAt = canonicalTimestamp(value.githubCredential.expiresAt);
  const credentialCurrent = value.githubCredential.configured &&
    verifiedAt !== null &&
    expiresAt !== null &&
    verifiedAt <= nowMillis &&
    nowMillis < expiresAt;
  if (
    value.githubCredential.current !== credentialCurrent ||
    (
      value.githubCredential.verifiedAt !== null &&
      verifiedAt === null
    ) ||
    (
      value.githubCredential.expiresAt !== null &&
      expiresAt === null
    ) ||
    (
      value.githubCredential.state === "missing" &&
      (
        value.githubCredential.verifiedAt !== null ||
        value.githubCredential.expiresAt !== null
      )
    )
  ) {
    return null;
  }
  const canaries = [];
  const canaryKeys = new Set();
  for (const canary of value.canaries) {
    const expectedType = isRecord(canary)
      ? canaryTypeFor(canary.key)
      : null;
    const completedAt = isRecord(canary)
      ? canonicalTimestamp(canary.completedAt)
      : null;
    if (
      !exactKeys(canary, [
        "completedAt",
        "evaluatorState",
        "key",
        "resultStatus",
        "type",
      ]) ||
      !expectedType ||
      canary.type !== expectedType ||
      canary.resultStatus !== "passed" ||
      canary.evaluatorState !== "pass" ||
      completedAt === null ||
      completedAt > nowMillis ||
      canaryKeys.has(canary.key)
    ) {
      return null;
    }
    canaryKeys.add(canary.key);
    canaries.push(Object.freeze({ ...canary }));
  }
  const schedules = [];
  const scheduleKeys = new Set();
  for (const schedule of value.schedules) {
    const expected = isRecord(schedule)
      ? REQUIRED_SCHEDULES[schedule.key]
      : null;
    if (
      !expected ||
      !exactKeys(schedule, [
        "activationPrerequisitesPass",
        "cadence",
        "canaryState",
        "currentState",
        "definitionValid",
        "dispatchPrerequisitesPass",
        "enabled",
        "id",
        "key",
        "maximumCost",
        "maximumTasks",
        "timeoutSeconds",
      ]) ||
      !UUID.test(schedule.id) ||
      scheduleKeys.has(schedule.key) ||
      typeof schedule.enabled !== "boolean" ||
      typeof schedule.definitionValid !== "boolean" ||
      typeof schedule.activationPrerequisitesPass !== "boolean" ||
      typeof schedule.dispatchPrerequisitesPass !== "boolean" ||
      schedule.cadence !== expected.cadence ||
      schedule.maximumCost !== expected.maximumCost ||
      schedule.maximumTasks !== expected.maximumTasks ||
      schedule.timeoutSeconds !== expected.timeoutSeconds ||
      !exactKeys(schedule.canaryState, [
        "current",
        "kind",
        "maximumAgeDays",
        "passingCount",
        "passingKeys",
        "requiredCount",
        "requiredKeys",
      ]) ||
      schedule.canaryState.kind !== expected.canaryKind ||
      schedule.canaryState.maximumAgeDays !== expected.maximumAgeDays ||
      !Array.isArray(schedule.canaryState.requiredKeys) ||
      !Array.isArray(schedule.canaryState.passingKeys) ||
      typeof schedule.canaryState.current !== "boolean" ||
      !Number.isInteger(schedule.canaryState.maximumAgeDays) ||
      !Number.isInteger(schedule.canaryState.requiredCount) ||
      !Number.isInteger(schedule.canaryState.passingCount)
    ) {
      return null;
    }
    const requiredKeys = unique(schedule.canaryState.requiredKeys);
    const passingKeys = unique(schedule.canaryState.passingKeys);
    const expectedKeys = unique(expected.requiredKeys);
    if (
      requiredKeys.length !== schedule.canaryState.requiredKeys.length ||
      passingKeys.length !== schedule.canaryState.passingKeys.length ||
      JSON.stringify(requiredKeys) !== JSON.stringify(expectedKeys) ||
      passingKeys.some((key) => !requiredKeys.includes(key)) ||
      schedule.canaryState.requiredCount !== requiredKeys.length ||
      schedule.canaryState.passingCount !== passingKeys.length ||
      schedule.canaryState.current !==
        (passingKeys.length === requiredKeys.length)
    ) {
      return null;
    }
    if (expected.canaryKind !== "installed_sentinel") {
      const locallyPassing = expected.requiredKeys.filter((key) =>
        canaries.some((canary) => {
          const completedAt = Date.parse(canary.completedAt);
          return canary.key === key &&
            completedAt >=
              nowMillis - expected.maximumAgeDays * 86_400_000;
        })
      ).sort();
      if (JSON.stringify(locallyPassing) !== JSON.stringify(passingKeys)) {
        return null;
      }
    }
    scheduleKeys.add(schedule.key);
    schedules.push(Object.freeze({
      ...schedule,
      canaryState: Object.freeze({
        ...schedule.canaryState,
        passingKeys: Object.freeze(passingKeys),
        requiredKeys: Object.freeze(requiredKeys),
      }),
    }));
  }
  const snapshot = {
    canaries: Object.freeze(canaries),
    emergency: Object.freeze({ ...value.emergency }),
    freshTaskFactory: Object.freeze({ ...value.freshTaskFactory }),
    githubCredential: Object.freeze({ ...value.githubCredential }),
    schedules: Object.freeze(schedules),
    scope: Object.freeze({ ...value.scope }),
    snapshotVersion: "v1",
    switches: Object.freeze({ ...value.switches }),
  };
  for (const schedule of schedules) {
    const activationReady = computedActivationReady(snapshot, schedule);
    const dispatchReady = activationReady &&
      schedule.enabled &&
      snapshot.switches.cognitive_scheduled_level01_enabled;
    if (
      schedule.definitionValid !== (
        schedule.cadence === expectedDefinition(schedule.key).cadence &&
        schedule.maximumCost === expectedDefinition(schedule.key).maximumCost &&
        schedule.maximumTasks ===
          expectedDefinition(schedule.key).maximumTasks &&
        schedule.timeoutSeconds ===
          expectedDefinition(schedule.key).timeoutSeconds
      ) ||
      schedule.activationPrerequisitesPass !== activationReady ||
      schedule.dispatchPrerequisitesPass !== dispatchReady ||
      schedule.currentState !==
        currentStateFor(schedule, activationReady, dispatchReady)
    ) {
      return null;
    }
  }
  return Object.freeze(snapshot);
};

const expectedDefinition = (scheduleKey) => REQUIRED_SCHEDULES[scheduleKey];

export const evaluateScheduleSnapshot = (snapshot) =>
  snapshot.schedules
    .map((schedule) => {
      const blockers = [];
      if (!scopeIsReady(snapshot.scope)) {
        blockers.push("CONTROL_TASK_SCOPE_REJECTED");
      }
      if (!snapshot.emergency.active) blockers.push("EMERGENCY_STOP_ACTIVE");
      if (!factoryIsReady(snapshot.freshTaskFactory)) {
        blockers.push("FRESH_SCHEDULE_TASK_FACTORY_REQUIRED");
      }
      if (
        !snapshot.switches.cognitive_research_enabled ||
        !snapshot.switches.cognitive_memory_enabled
      ) {
        blockers.push("PUBLIC_RESEARCH_MEMORY_REQUIRED");
      }
      if (
        snapshot.switches.cognitive_user_derived_memory_enabled ||
        snapshot.switches.cognitive_level2_production_repairs_enabled
      ) {
        blockers.push("PERMANENTLY_DISABLED_SWITCH_VIOLATION");
      }
      if (!schedule.definitionValid) {
        blockers.push("EXACT_SCHEDULE_DEFINITIONS_REQUIRED");
      }
      if (!schedule.canaryState.current) {
        blockers.push(
          schedule.key === "weekly_ux_route_dead_control"
            ? "FRESH_EVALUATED_INSTALLED_SENTINEL_EVIDENCE_REQUIRED"
            : schedule.key === "weekly_experiment_outcome"
            ? "GOVERNED_DRAFT_PR_CANARIES_REQUIRED"
            : schedule.key === "weekly_architecture_dependency"
            ? "FRESH_ARCHITECTURE_DEPENDENCY_EVIDENCE_REQUIRED"
            : "FRESH_RESEARCH_CANARIES_REQUIRED",
        );
      }
      if (
        schedule.key === "weekly_ux_route_dead_control" &&
        (
          !snapshot.switches.cognitive_installed_journey_sentinel_enabled ||
          !snapshot.switches.cognitive_visual_experience_sentinel_enabled
        )
      ) {
        blockers.push("INSTALLED_VISUAL_SENTINELS_REQUIRED");
      }
      if (
        schedule.key === "weekly_experiment_outcome" &&
        (
          !snapshot.switches.cognitive_collective_deliberation_enabled ||
          !snapshot.switches.cognitive_draft_pr_executor_enabled ||
          !snapshot.githubCredential.configured ||
          !snapshot.githubCredential.current
        )
      ) {
        blockers.push("GOVERNED_DRAFT_PR_CANARIES_REQUIRED");
      }
      return Object.freeze({
        activationEligible: schedule.activationPrerequisitesPass,
        blockers: Object.freeze(unique(blockers)),
        dispatchEligible: schedule.dispatchPrerequisitesPass,
        enabled: schedule.enabled,
        scheduleKey: schedule.key,
      });
    })
    .sort((left, right) => left.scheduleKey.localeCompare(right.scheduleKey));

const summarize = async (evaluation) => {
  const blockers = unique(evaluation.flatMap((entry) => entry.blockers));
  return Object.freeze({
    activationEligibleCount:
      evaluation.filter((entry) => entry.activationEligible).length,
    blockerDigest: await sha256Hex(JSON.stringify(blockers)),
    blockers,
    dispatchDecision: evaluation.some((entry) => entry.dispatchEligible)
      ? "bounded_dispatch_permitted"
      : "no_work",
    dispatchEligibleCount:
      evaluation.filter((entry) => entry.dispatchEligible).length,
    notificationPolicy: "notify_on_blocker_digest_change_only",
    ownerDigestRequired: evaluation.some((entry) => entry.dispatchEligible),
    schedules: evaluation,
  });
};

const exactDispatchPayload = (value) => {
  const scheduledFor = Date.parse(value.scheduledFor);
  return exactKeys(value, DISPATCH_KEYS) &&
    value.action === "dispatch_occurrence" &&
    UUID.test(value.capabilityId) &&
    UUID.test(value.scheduleDefinitionId) &&
    UUID.test(value.taskId) &&
    UUID.test(value.projectId) &&
    Object.hasOwn(REQUIRED_SCHEDULES, value.scheduleKey) &&
    HASH.test(value.executionIdempotencyHash) &&
    HASH.test(value.objectiveHash) &&
    ["work_available", "no_work"].includes(value.workState) &&
    (
      value.workState === "work_available"
        ? value.noWorkReasonHash === null
        : typeof value.noWorkReasonHash === "string" &&
          HASH.test(value.noWorkReasonHash)
    ) &&
    Number.isFinite(scheduledFor) &&
    new Date(scheduledFor).toISOString() === value.scheduledFor &&
    new Date(scheduledFor).getUTCSeconds() === 0 &&
    new Date(scheduledFor).getUTCMilliseconds() === 0;
};

export const createSchedulerAdapters = ({
  now = () => new Date(),
} = {}) => {
  const readSnapshot = async (database, context) => {
    const current = now();
    const result = await database.call("schedulerPrerequisiteSnapshot", [
      context.taskId,
      context.projectId,
      "shared",
      "production",
    ]);
    const snapshot = normalizeSchedulerSnapshot(result, current);
    if (
      !snapshot ||
      snapshot.scope.taskId !== context.taskId ||
      snapshot.scope.projectId !== context.projectId
    ) {
      throw new Error("schedule_prerequisite_readback_rejected");
    }
    return snapshot;
  };

  const evaluate = async ({ context, database }) =>
    summarize(
      evaluateScheduleSnapshot(await readSnapshot(database, context)),
    );

  const dispatch = async ({ context, database, env, payload }) => {
    if (
      !exactDispatchPayload(payload) ||
      payload.taskId !== context.taskId ||
      payload.projectId !== context.projectId
    ) {
      throw new Error("schedule_scope_rejected");
    }
    const snapshot = await readSnapshot(database, context);
    const decision = evaluateScheduleSnapshot(snapshot).find((entry) =>
      entry.scheduleKey === payload.scheduleKey
    );
    const definition = snapshot.schedules.find((entry) =>
      entry.key === payload.scheduleKey
    );
    if (
      !decision?.dispatchEligible ||
      definition?.id !== payload.scheduleDefinitionId
    ) {
      throw new Error("schedule_occurrence_prerequisites_rejected");
    }
    const result = await database.call("issueRecurringChildTask", [
      payload.capabilityId,
      payload.scheduleDefinitionId,
      context.taskId,
      context.projectId,
      "shared",
      "production",
      payload.scheduledFor,
      payload.executionIdempotencyHash,
      payload.objectiveHash,
      payload.workState,
      payload.noWorkReasonHash,
      env.COGNITIVE_LEVEL01_SCHEDULER_ASSERTION,
    ]);
    if (
      !isRecord(result) ||
      typeof result.deduplicated !== "boolean" ||
      !["task_created", "no_work"].includes(result.resultStatus) ||
      typeof result.schedulerIssuanceId !== "string" ||
      !UUID.test(result.schedulerIssuanceId)
    ) {
      throw new Error("schedule_occurrence_issue_rejected");
    }
    const taskCreated = typeof result.childTaskId === "string" &&
      UUID.test(result.childTaskId);
    const budgetCreated = typeof result.childBudgetId === "string" &&
      UUID.test(result.childBudgetId);
    if (
      (result.resultStatus === "task_created" &&
        (!taskCreated || !budgetCreated)) ||
      (result.resultStatus === "no_work" &&
        (result.childTaskId !== null || result.childBudgetId !== null))
    ) {
      throw new Error("schedule_occurrence_issue_rejected");
    }
    return Object.freeze({
      childBudgetCreated: budgetCreated,
      childTaskCreated: taskCreated,
      deduplicated: result.deduplicated,
      resultStatus: result.resultStatus,
      scheduleKey: payload.scheduleKey,
      schedulerIssuanceRecorded: true,
    });
  };

  return Object.freeze({
    dispatch_occurrence: ready(
      ["read_scheduler_status", "issue_recurring_child_task"],
      dispatch,
    ),
    evaluate_prerequisites: ready(["read_scheduler_status"], evaluate),
  });
};

export const SCHEDULER_ADAPTERS = createSchedulerAdapters();
