import {
  constantTimeEqual,
  makeResponse,
  sha256Hex,
  validateEnvelope,
} from "./contracts.mjs";
import { writeSanitizedAudit } from "./sanitize.mjs";

const COMMON_PRIVATE_ENVIRONMENT_BINDINGS = Object.freeze([
  "COGNITIVE_DEPLOYMENT_STATE",
  "RUNTIME_SCHEMA_VERSION",
  "SOURCE_BASE_COMMIT",
  "SOURCE_COMMIT",
  "WORKER_VERSION",
]);
const PINNED_RESEARCH_TRANSPORT_REASON =
  "RESEARCH_PINNED_TRANSPORT_REQUIRED";

export const privateEnvironmentKeyAllowlist = (principal, state) => {
  if (!["active", "inert"].includes(state)) {
    throw new Error("deployment_state_rejected");
  }
  return Object.freeze([
    ...COMMON_PRIVATE_ENVIRONMENT_BINDINGS,
    ...(state === "active"
      ? [
        principal.hyperdriveBinding,
        ...Object.keys(principal.runtimeConfiguration),
        ...principal.requiredSecrets,
      ]
      : []),
  ].sort());
};

const assertCredentialDomain = (env, principal, state) => {
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new Error("credential_domain_rejected");
  }
  const actual = Object.keys(env).sort();
  const expected = privateEnvironmentKeyAllowlist(principal, state);
  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index]) ||
    env.COGNITIVE_DEPLOYMENT_STATE !== state
  ) {
    throw new Error("credential_domain_rejected");
  }
  if (state === "inert") return;
  const missing = principal.requiredSecrets.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error("credential_domain_rejected");
  if (!env[principal.hyperdriveBinding]?.connectionString) {
    throw new Error("hyperdrive_binding_required");
  }
};

const withDeadline = async (
  run,
  deadlineAt,
  now,
  abortController,
  cleanupGraceMs = 1_000,
) => {
  const remaining = Date.parse(deadlineAt) - now();
  if (remaining <= 0) {
    abortController?.abort(new Error("deadline_rejected"));
    throw new Error("deadline_rejected");
  }
  let timer;
  let cleanupTimer;
  const deadlineReached = Symbol("deadline_reached");
  const outcome = Promise.resolve().then(run).then(
    (value) => ({ ok: true, value }),
    (error) => ({ error, ok: false }),
  );
  try {
    const first = await Promise.race([
      outcome,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => {
            abortController?.abort(new Error("deadline_rejected"));
            reject(deadlineReached);
          },
          remaining,
        );
      }),
    ]);
    if (!first.ok) throw first.error;
    return first.value;
  } catch (error) {
    if (error !== deadlineReached) throw error;
    await Promise.race([
      outcome,
      new Promise((resolve) => {
        cleanupTimer = setTimeout(resolve, cleanupGraceMs);
      }),
    ]);
    throw new Error("deadline_rejected");
  } finally {
    clearTimeout(timer);
    clearTimeout(cleanupTimer);
  }
};

const assertDatabaseState = async ({
  database,
  databaseOperations,
  principal,
  signal,
}) => {
  signal?.throwIfAborted();
  for (const databaseOperation of databaseOperations) {
    const preflight = await database.preflight(
      principal.dbRole,
      databaseOperation,
    );
    signal?.throwIfAborted();
    if (preflight?.emergencyStopActive === true) {
      throw new Error("emergency_stop_rejected");
    }
    if (
      preflight?.allowed !== true || preflight?.assertionExpired === true ||
      preflight?.principal !== principal.dbRole ||
      preflight?.operation !== databaseOperation ||
      preflight?.serviceRoleMember !== false
    ) {
      throw new Error("preflight_rejected");
    }
  }
  const revocation = await database.revocationStatus(principal.dbRole);
  signal?.throwIfAborted();
  if (
    revocation?.principal !== principal.dbRole ||
    revocation?.databaseAccessRevoked !== false
  ) {
    throw new Error("revocation_rejected");
  }
};

export const createPrivateInvocationHandler = ({
  createDatabase,
  env,
  logger = console,
  now = () => Date.now(),
  principal,
  resolveAdapter,
}) => async (envelope, invocationToken) => {
  const versionId = env?.WORKER_VERSION?.id ?? "unknown";
  let database;
  let deadlineController;
  if (!principal) throw new Error("principal_configuration_rejected");
  try {
    if (env === null || typeof env !== "object" || Array.isArray(env)) {
      throw new Error("credential_domain_rejected");
    }
    const deploymentState = env?.COGNITIVE_DEPLOYMENT_STATE;
    if (!["active", "inert"].includes(deploymentState)) {
      throw new Error("deployment_state_rejected");
    }
    assertCredentialDomain(env, principal, deploymentState);
    if (deploymentState === "inert") {
      throw new Error("principal_inert");
    }
    const expectedHash =
      env[`${principal.dbRole.toUpperCase()}_INVOKE_SHA256`];
    const suppliedHash = await sha256Hex(
      typeof invocationToken === "string" ? invocationToken : "",
    );
    if (
      typeof expectedHash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(expectedHash) ||
      !constantTimeEqual(suppliedHash, expectedHash)
    ) {
      throw new Error("invocation_rejected");
    }
    if (
      typeof env.SOURCE_COMMIT !== "string" ||
      !/^[a-f0-9]{40}$/u.test(env.SOURCE_COMMIT) ||
      envelope?.sourceCommit !== env.SOURCE_COMMIT
    ) {
      throw new Error("source_commit_rejected");
    }
    const validation = await validateEnvelope(
      envelope,
      now(),
      60_000,
      (principalId) => principalId === principal.dbRole ? principal : null,
    );
    if (!validation.ok || validation.principal !== principal) {
      throw new Error(validation.error ?? "payload_rejected");
    }
    deadlineController = new AbortController();
    const adapter = resolveAdapter(envelope.operation);
    if (!adapter?.ready || typeof adapter.execute !== "function") {
      throw new Error(
        adapter?.reason === PINNED_RESEARCH_TRANSPORT_REASON
          ? PINNED_RESEARCH_TRANSPORT_REASON
          : "operation_adapter_not_ready",
      );
    }
    database = createDatabase({
      connectionString: env[principal.hyperdriveBinding].connectionString,
      principal: principal.dbRole,
      signal: deadlineController.signal,
    });
    const context = {
      deadlineAt: envelope.deadlineAt,
      environment: envelope.environment,
      operation: envelope.operation,
      platform: envelope.platform,
      principal: envelope.principal,
      projectId: envelope.projectId,
      requestId: envelope.requestId,
      sourceCommit: envelope.sourceCommit,
      taskId: envelope.taskId,
    };
    await withDeadline(
      () => assertDatabaseState({
        database,
        databaseOperations: adapter.databaseOperations,
        principal,
        signal: deadlineController.signal,
      }),
      envelope.deadlineAt,
      now,
      deadlineController,
    );
    const assertActive = () =>
      assertDatabaseState({
        database,
        databaseOperations: adapter.databaseOperations,
        principal,
        signal: deadlineController.signal,
      });
    const result = await withDeadline(
      () => adapter.execute({
        assertActive,
        context,
        database,
        env,
        payload: envelope.payload,
        signal: deadlineController.signal,
      }),
      envelope.deadlineAt,
      now,
      deadlineController,
    );
    const response = await makeResponse({
      envelope,
      result,
      runtime: {
        sourceBaseCommit: principal
          ? "8660558a9cf360f033246a404dfc5812d522da88"
          : "unknown",
        sourceCommit: envelope.sourceCommit,
        versionId,
      },
      status: "completed",
    });
    await writeSanitizedAudit({
      category: "operation_completed",
      principal: principal.dbRole,
      requestId: envelope.requestId,
      status: "completed",
      versionId,
    }, logger);
    return response;
  } catch (error) {
    const category = error instanceof Error ? error.message : "payload_rejected";
    const safeCategory = [
      "credential_domain_rejected",
      "deadline_rejected",
      "deployment_state_rejected",
      "emergency_stop_rejected",
      "invocation_rejected",
      "principal_inert",
      "preflight_rejected",
      PINNED_RESEARCH_TRANSPORT_REASON,
      "revocation_rejected",
      "source_commit_rejected",
    ].includes(category)
      ? category
      : category.includes("database") || category.includes("rpc")
      ? "database_rejected"
      : "payload_rejected";
    await writeSanitizedAudit({
      category: safeCategory === PINNED_RESEARCH_TRANSPORT_REASON
        ? "payload_rejected"
        : safeCategory,
      principal: principal.dbRole,
      requestId:
        envelope && typeof envelope.requestId === "string"
          ? envelope.requestId
          : "rejected",
      status: "rejected",
      versionId,
    }, logger);
    throw new Error(safeCategory);
  } finally {
    deadlineController?.abort(new Error("invocation_closed"));
    await database?.close?.().catch(() => undefined);
  }
};
