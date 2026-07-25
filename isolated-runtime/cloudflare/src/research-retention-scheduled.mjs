import { privateEnvironmentKeyAllowlist } from "./private-core.mjs";
import { writeSanitizedAudit } from "./sanitize.mjs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HEX_40 = /^[a-f0-9]{40}$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const RETENTION_CRON = "17 * * * *";
const RETENTION_LIMIT = 100;
const RETENTION_TIMEOUT_MS = 50_000;
const RETENTION_OPERATION = "expire_research";

const exactEnvironment = (env, principal) => {
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new Error("retention_environment_rejected");
  }
  const actual = Object.keys(env).sort();
  const expected = privateEnvironmentKeyAllowlist(principal);
  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index])
  ) {
    throw new Error("retention_environment_rejected");
  }
};

export const normalizeResearchRetentionSchedule = ({
  controller,
  env,
  now = Date.now,
  principal,
}) => {
  exactEnvironment(env, principal);
  const scheduledAt = new Date(controller?.scheduledTime);
  const currentTime = now();
  if (
    principal?.dbRole !== "cognitive_public_research_broker" ||
    controller?.cron !== RETENTION_CRON ||
    env.COGNITIVE_RESEARCH_RETENTION_CRON !== RETENTION_CRON ||
    env.COGNITIVE_RESEARCH_RETENTION_PLATFORM !== "shared" ||
    env.COGNITIVE_RESEARCH_RETENTION_ENVIRONMENT !== "production" ||
    env.COGNITIVE_RESEARCH_RETENTION_BATCH_LIMIT !== String(RETENTION_LIMIT) ||
    env.COGNITIVE_RESEARCH_RETENTION_MAXIMUM_BATCHES !== "1" ||
    env.COGNITIVE_RESEARCH_RETENTION_TIMEOUT_MS !==
      String(RETENTION_TIMEOUT_MS) ||
    typeof env.SOURCE_COMMIT !== "string" ||
    !HEX_40.test(env.SOURCE_COMMIT) ||
    !UUID.test(env.COGNITIVE_RESEARCH_RETENTION_PROCESSOR_ATTESTATION_ID) ||
    !UUID.test(env.COGNITIVE_RESEARCH_RETENTION_TASK_ID) ||
    !UUID.test(env.COGNITIVE_RESEARCH_RETENTION_PROJECT_ID) ||
    !HEX_64.test(env.COGNITIVE_RESEARCH_RETENTION_ATTESTATION_HASH) ||
    !Number.isFinite(scheduledAt.getTime()) ||
    scheduledAt.getUTCMinutes() !== 17 ||
    scheduledAt.getUTCSeconds() !== 0 ||
    scheduledAt.getUTCMilliseconds() !== 0 ||
    scheduledAt.getTime() > currentTime ||
    scheduledAt.getTime() < currentTime - 15 * 60_000
  ) {
    throw new Error("retention_schedule_rejected");
  }
  return Object.freeze({
    attestationHash: env.COGNITIVE_RESEARCH_RETENTION_ATTESTATION_HASH,
    environment: "production",
    limit: RETENTION_LIMIT,
    platform: "shared",
    processorAttestationId:
      env.COGNITIVE_RESEARCH_RETENTION_PROCESSOR_ATTESTATION_ID,
    projectId: env.COGNITIVE_RESEARCH_RETENTION_PROJECT_ID,
    scheduledAt: scheduledAt.toISOString(),
    taskId: env.COGNITIVE_RESEARCH_RETENTION_TASK_ID,
    timeoutMs: RETENTION_TIMEOUT_MS,
  });
};

const assertDatabaseState = async ({ database, principal, signal }) => {
  signal.throwIfAborted();
  const preflight = await database.preflight(
    principal.dbRole,
    RETENTION_OPERATION,
  );
  signal.throwIfAborted();
  const revocation = await database.revocationStatus(principal.dbRole);
  signal.throwIfAborted();
  if (
    preflight?.allowed !== true ||
    preflight?.principal !== principal.dbRole ||
    preflight?.operation !== RETENTION_OPERATION ||
    preflight?.assertionExpired === true ||
    preflight?.serviceRoleMember !== false ||
    preflight?.emergencyStopActive === true ||
    revocation?.principal !== principal.dbRole ||
    revocation?.databaseAccessRevoked !== false
  ) {
    throw new Error("retention_preflight_rejected");
  }
};

const validateResult = (result, schedule) => {
  if (
    result === null ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    !Number.isSafeInteger(result.source_count) ||
    !Number.isSafeInteger(result.claim_count) ||
    !Number.isSafeInteger(result.total_count) ||
    result.source_count < 0 ||
    result.claim_count < 0 ||
    result.total_count !== result.source_count + result.claim_count ||
    result.total_count > schedule.limit ||
    result.no_work !== (result.total_count === 0) ||
    typeof result.heartbeat_id !== "string" ||
    !UUID.test(result.heartbeat_id) ||
    result.attestation_hash !== schedule.attestationHash ||
    result.retention_policy_id !== "chillywood-cognitive-retention-v1"
  ) {
    throw new Error("retention_readback_rejected");
  }
  return Object.freeze({
    claimCount: result.claim_count,
    heartbeatId: result.heartbeat_id,
    noWork: result.no_work,
    replayed: result.replayed === true,
    sourceCount: result.source_count,
    totalCount: result.total_count,
  });
};

export const runScheduledResearchRetention = async ({
  controller,
  createDatabase,
  env,
  logger = console,
  now = Date.now,
  principal,
}) => {
  const schedule = normalizeResearchRetentionSchedule({
    controller,
    env,
    now,
    principal,
  });
  if (
    !env[principal.hyperdriveBinding]?.connectionString ||
    typeof env.COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN !== "string" ||
    env.COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN.length < 32
  ) {
    throw new Error("retention_credential_domain_rejected");
  }
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(new Error("retention_timeout")),
    schedule.timeoutMs,
  );
  const database = createDatabase({
    connectionString: env[principal.hyperdriveBinding].connectionString,
    principal: principal.dbRole,
    signal: abortController.signal,
  });
  try {
    await assertDatabaseState({
      database,
      principal,
      signal: abortController.signal,
    });
    const result = await database.call("runAttestedRetention", [
      schedule.processorAttestationId,
      schedule.taskId,
      schedule.projectId,
      schedule.platform,
      schedule.environment,
      schedule.scheduledAt,
      schedule.limit,
      env.COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN,
    ]);
    abortController.signal.throwIfAborted();
    const readback = validateResult(result, schedule);
    await writeSanitizedAudit({
      category: "operation_completed",
      principal: principal.dbRole,
      requestId: `retention:${schedule.scheduledAt}`,
      status: "completed",
      versionId: env.WORKER_VERSION?.id ?? "unknown",
    }, logger);
    return readback;
  } finally {
    clearTimeout(timeout);
    await database.close?.().catch(() => {});
  }
};

export const createResearchRetentionScheduledHandler = ({
  createDatabase,
  env,
  principal,
}) => async (controller) =>
  runScheduledResearchRetention({
    controller,
    createDatabase,
    env,
    principal,
  });

export const RESEARCH_RETENTION_SCHEDULE = Object.freeze({
  batchLimit: RETENTION_LIMIT,
  cron: RETENTION_CRON,
  maximumBatches: 1,
  timeoutMs: RETENTION_TIMEOUT_MS,
});
