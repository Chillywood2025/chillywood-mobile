import {
  constantTimeEqual,
  makeResponse,
  sha256Hex,
  validateEnvelope,
} from "./contracts.mjs";
import { writeSanitizedAudit } from "./sanitize.mjs";

const SECRET_DOMAIN_NAME =
  /^(?:COGNITIVE_[A-Z0-9_]*(?:ASSERTION|INVOKE_SHA256|SERVICE_TOKEN|API_KEY)|GITHUB_APP_(?:ID|INSTALLATION_ID|PRIVATE_KEY)|GITHUB_REPOSITORY_ID|LIVEKIT_API_(?:KEY|SECRET)|SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY))$/u;
const HYPERDRIVE_BINDING_NAME = /^[A-Z0-9_]+_HYPERDRIVE$/u;

const assertCredentialDomain = (env, principal) => {
  const missing = principal.requiredSecrets.filter((name) => !env[name]);
  const forbidden = principal.forbiddenSecrets.filter((name) => env[name]);
  const unexpected = Object.keys(env).filter((name) =>
    SECRET_DOMAIN_NAME.test(name) && !principal.requiredSecrets.includes(name)
  );
  const unexpectedHyperdrive = Object.keys(env).filter((name) =>
    HYPERDRIVE_BINDING_NAME.test(name) &&
    name !== principal.hyperdriveBinding
  );
  if (
    missing.length > 0 ||
    forbidden.length > 0 ||
    unexpected.length > 0 ||
    unexpectedHyperdrive.length > 0
  ) {
    throw new Error("credential_domain_rejected");
  }
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
  const versionId = env.WORKER_VERSION?.id ?? "unknown";
  let database;
  let deadlineController;
  if (!principal) throw new Error("principal_configuration_rejected");
  try {
    assertCredentialDomain(env, principal);
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
      throw new Error("operation_adapter_not_ready");
    }
    database = createDatabase({
      connectionString: env[principal.hyperdriveBinding].connectionString,
      principal: principal.dbRole,
    });
    const context = {
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
      "emergency_stop_rejected",
      "invocation_rejected",
      "preflight_rejected",
      "revocation_rejected",
      "source_commit_rejected",
    ].includes(category)
      ? category
      : category.includes("database") || category.includes("rpc")
      ? "database_rejected"
      : "payload_rejected";
    await writeSanitizedAudit({
      category: safeCategory,
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
