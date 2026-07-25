import assert from "node:assert/strict";
import test from "node:test";
import { hashJson, sha256Hex } from "../src/contracts.mjs";
import { createScopedDatabasePort } from "../src/database-core.mjs";
import {
  createGatewayHandler,
  gatewayEnvironmentKeyAllowlist,
} from "../src/gateway-core.mjs";
import { isExactAccessServiceToken } from "../src/gateway.mjs";
import { PRINCIPAL_BY_ID, RUNTIME_MANIFEST } from "../src/manifest.mjs";
import { operationAdapter } from "../src/operation-adapters.mjs";
import {
  createPrivateInvocationHandler,
  privateEnvironmentKeyAllowlist,
} from "../src/private-core.mjs";
import { RESEARCH_PINNED_TRANSPORT_REQUIRED } from "../src/adapters/research-broker.mjs";

const UUID_A = "10000000-0000-4000-8000-000000000001";
const UUID_B = "20000000-0000-4000-8000-000000000002";
const UUID_C = "30000000-0000-4000-8000-000000000003";
const NOW = Date.parse("2026-07-24T12:00:00.000Z");
const TOKEN = "bounded-private-invocation-token-00000001";
const silentLogger = { log() {} };

const payload = {
  action: "persist",
  executionId: UUID_C,
};

const makeEnvelope = async () => ({
  deadlineAt: "2026-07-24T12:00:30.000Z",
  environment: "production",
  operation: "persist",
  payload,
  payloadHash: await hashJson(payload),
  platform: "shared",
  principal: "cognitive_product_baseline_executor",
  projectId: UUID_C,
  requestId: UUID_A,
  schemaVersion: RUNTIME_MANIFEST.schemaVersion,
  sourceCommit: "a".repeat(40),
  taskId: UUID_B,
});

const baselineEnv = async (changes = {}) => {
  const principal = PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor");
  return {
    COGNITIVE_PRODUCT_BASELINE_EXECUTOR_HYPERDRIVE: {
      connectionString: "postgres://isolated.invalid/db",
    },
    COGNITIVE_PRODUCT_BASELINE_EXECUTOR_INVOKE_SHA256:
      await sha256Hex(TOKEN),
    COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION: "a".repeat(64),
    RUNTIME_SCHEMA_VERSION: RUNTIME_MANIFEST.schemaVersion,
    SOURCE_BASE_COMMIT: RUNTIME_MANIFEST.sourceBaseCommit,
    SOURCE_COMMIT: "a".repeat(40),
    WORKER_VERSION: { id: "version-safe-id" },
    ...changes,
  };
};

const gatewayEnv = (changes = {}) => ({
  CF_ACCESS_AUD: "a".repeat(64),
  CF_ACCESS_SERVICE_TOKEN_COMMON_NAME: `${"b".repeat(32)}.access`,
  CF_ACCESS_TEAM_DOMAIN: "https://chillywood.cloudflareaccess.com",
  RUNTIME_SCHEMA_VERSION: RUNTIME_MANIFEST.schemaVersion,
  SOURCE_BASE_COMMIT: RUNTIME_MANIFEST.sourceBaseCommit,
  SOURCE_COMMIT: "a".repeat(40),
  WORKER_VERSION: { id: "version-safe-id" },
  ...Object.fromEntries(
    RUNTIME_MANIFEST.principals.map((principal) => [
      principal.binding,
      { invoke: async () => ({ status: "completed" }) },
    ]),
  ),
  ...changes,
});

const database = (overrides = {}) => ({
  call: async () => ({ dispatchDecision: "no_work" }),
  close: async () => undefined,
  preflight: async (principal, operation) => ({
    allowed: true,
    assertionExpired: false,
    emergencyStopActive: false,
    operation,
    principal,
    serviceRoleMember: false,
  }),
  revocationStatus: async (principal) => ({
    databaseAccessRevoked: false,
    principal,
  }),
  ...overrides,
});

test("gateway has no database/provider credential domain", () => {
  assert.deepEqual(RUNTIME_MANIFEST.gateway.databaseBindings, []);
  assert.deepEqual(RUNTIME_MANIFEST.gateway.providerSecrets, []);
});

test("gateway accepts only the exact Cloudflare Access service-token identity", () => {
  const commonName = `${"a".repeat(32)}.access`;
  assert.equal(
    isExactAccessServiceToken(
      {
        common_name: commonName,
        sub: "",
        type: "app",
      },
      commonName,
    ),
    true,
  );
  assert.equal(
    isExactAccessServiceToken(
      {
        email: "owner@example.invalid",
        sub: "identity-subject",
        type: "app",
      },
      commonName,
    ),
    false,
  );
  assert.equal(
    isExactAccessServiceToken(
      {
        common_name: `${"b".repeat(32)}.access`,
        sub: "",
        type: "app",
      },
      commonName,
    ),
    false,
  );
  assert.equal(
    isExactAccessServiceToken(
      {
        common_name: commonName,
        sub: "",
        type: "app",
      },
      "invalid",
    ),
    false,
  );
});

test("ten private principals have unique Worker, role, Hyperdrive and invocation domains", () => {
  assert.equal(RUNTIME_MANIFEST.principals.length, 10);
  for (const field of [
    "binding",
    "dbRole",
    "hyperdriveBinding",
    "workerName",
  ]) {
    assert.equal(
      new Set(RUNTIME_MANIFEST.principals.map((entry) => entry[field])).size,
      10,
      field,
    );
  }
  const invocationSecrets = RUNTIME_MANIFEST.principals.map((entry) =>
    entry.requiredSecrets[0]
  );
  assert.equal(new Set(invocationSecrets).size, 10);
  for (const principal of RUNTIME_MANIFEST.principals) {
    assert(principal.forbiddenSecrets.includes("SUPABASE_SERVICE_ROLE_KEY"));
    assert.equal(
      principal.requiredSecrets.includes("SUPABASE_SERVICE_ROLE_KEY"),
      false,
    );
  }
});

test("gateway and every private Worker use exact generated environment-key allowlists", () => {
  assert.deepEqual(
    gatewayEnvironmentKeyAllowlist(),
    [
      "CF_ACCESS_AUD",
      "CF_ACCESS_SERVICE_TOKEN_COMMON_NAME",
      "CF_ACCESS_TEAM_DOMAIN",
      ...RUNTIME_MANIFEST.principals.map((principal) => principal.binding),
      "RUNTIME_SCHEMA_VERSION",
      "SOURCE_BASE_COMMIT",
      "SOURCE_COMMIT",
      "WORKER_VERSION",
    ].sort(),
  );
  for (const principal of RUNTIME_MANIFEST.principals) {
    assert.deepEqual(
      privateEnvironmentKeyAllowlist(principal),
      [
        principal.hyperdriveBinding,
        ...principal.requiredSecrets,
        ...Object.keys(principal.runtimeConfiguration),
        "RUNTIME_SCHEMA_VERSION",
        "SOURCE_BASE_COMMIT",
        "SOURCE_COMMIT",
        "WORKER_VERSION",
      ].sort(),
      principal.dbRole,
    );
    assert.equal(
      privateEnvironmentKeyAllowlist(principal).includes(
        "CLOUDFLARE_API_TOKEN",
      ),
      false,
      principal.dbRole,
    );
  }
});

test("provider secrets exist only in their exact principal", () => {
  const byId = PRINCIPAL_BY_ID;
  assert.deepEqual(
    byId.get("cognitive_model_router").requiredSecrets,
    [
      "COGNITIVE_MODEL_ROUTER_INVOKE_SHA256",
      "COGNITIVE_MODEL_ROUTER_SERVICE_ASSERTION",
      "COGNITIVE_MODEL_OPENAI_API_KEY",
    ],
  );
  assert.deepEqual(
    byId.get("cognitive_livekit_experience_collector").requiredSecrets,
    [
      "COGNITIVE_LIVEKIT_EXPERIENCE_COLLECTOR_INVOKE_SHA256",
      "COGNITIVE_LIVEKIT_FAILURE_FIXTURE_HMAC_KEY",
      "COGNITIVE_LIVEKIT_SENTINEL_ASSERTION",
    ],
  );
  assert.equal(
    byId.get("cognitive_livekit_experience_collector").provider,
    "none",
  );
  assert.deepEqual(
    byId.get("cognitive_livekit_experience_collector").networkEgress,
    [],
  );
  assert.deepEqual(
    byId.get("cognitive_github_draft_pr_broker").requiredSecrets,
    [
      "COGNITIVE_GITHUB_DRAFT_PR_BROKER_INVOKE_SHA256",
      "COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN",
      "GITHUB_APP_ID",
      "GITHUB_APP_INSTALLATION_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_REPOSITORY_ID",
    ],
  );
  for (
    const id of [
      "cognitive_public_research_broker",
      "cognitive_research_evaluator",
      "cognitive_level01_scheduler",
      "cognitive_sentinel_collector",
      "cognitive_product_quality_evaluator",
      "cognitive_product_quality_triage",
      "cognitive_product_baseline_executor",
    ]
  ) {
    const secrets = byId.get(id).requiredSecrets;
    assert.equal(
      secrets.some((name) =>
        /(?:MODEL|GITHUB_APP|LIVEKIT_API)_(?:API_KEY|API_SECRET|ID|INSTALLATION_ID|PRIVATE_KEY)$/u
          .test(name)
      ),
      false,
      id,
    );
  }
});

test("production research retrieval fails closed with the stable pinned-transport reason", async () => {
  const principal = PRINCIPAL_BY_ID.get("cognitive_public_research_broker");
  const invocationToken = "bounded-research-invocation-token-0001";
  const sourceCommit = "c".repeat(40);
  const researchPayload = {
    action: "retrieve_source",
    authorityId: "cloudflare-docs",
    citationLocator: "Workers docs",
    citationTitle: "Workers docs",
    environment: "production",
    evidenceQuery: "Workers service binding documentation",
    freshnessSeconds: 86_400,
    platform: "shared",
    projectId: UUID_C,
    publisher: "Cloudflare",
    sourceType: "official_documentation",
    taskId: UUID_B,
    url: "https://developers.cloudflare.com/workers/",
  };
  const envelope = {
    deadlineAt: "2026-07-24T12:00:30.000Z",
    environment: "production",
    operation: "retrieve_source",
    payload: researchPayload,
    payloadHash: await hashJson(researchPayload),
    platform: "shared",
    principal: principal.dbRole,
    projectId: UUID_C,
    requestId: UUID_A,
    schemaVersion: RUNTIME_MANIFEST.schemaVersion,
    sourceCommit,
    taskId: UUID_B,
  };
  const handler = createPrivateInvocationHandler({
    createDatabase: () => assert.fail("database must not be created"),
    env: {
      COGNITIVE_PUBLIC_RESEARCH_BROKER_HYPERDRIVE: {
        connectionString: "postgres://isolated.invalid/db",
      },
      COGNITIVE_PUBLIC_RESEARCH_BROKER_INVOKE_SHA256:
        await sha256Hex(invocationToken),
      COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN: "r".repeat(40),
      RUNTIME_SCHEMA_VERSION: RUNTIME_MANIFEST.schemaVersion,
      SOURCE_BASE_COMMIT: RUNTIME_MANIFEST.sourceBaseCommit,
      SOURCE_COMMIT: sourceCommit,
      WORKER_VERSION: { id: "version-safe-id" },
    },
    logger: silentLogger,
    now: () => NOW,
    principal,
    resolveAdapter: (operation) =>
      operationAdapter(principal.dbRole, operation),
  });
  await assert.rejects(
    () => handler(envelope, invocationToken),
    new RegExp(RESEARCH_PINNED_TRANSPORT_REQUIRED, "u"),
  );
});

test("private worker fails closed on forbidden shared credential injection", async () => {
  const handler = createPrivateInvocationHandler({
    createDatabase: () => database(),
    env: await baselineEnv({ SUPABASE_SERVICE_ROLE_KEY: "must-not-exist" }),
    logger: silentLogger,
    now: () => NOW,
    principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
    resolveAdapter: (operation) =>
      operationAdapter("cognitive_product_baseline_executor", operation),
  });
  await assert.rejects(
    () => handler(makeEnvelope(), TOKEN),
    /credential_domain_rejected/u,
  );
});

test("gateway and private Worker reject malformed environment objects", async () => {
  const gateway = createGatewayHandler({
    now: () => NOW,
    verifyAccess: async () => assert.fail("Access must not be evaluated"),
  });
  const response = await gateway(
    new Request("https://gateway.invalid/v1", {
      body: "{}",
      method: "POST",
    }),
    null,
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "gateway_credential_domain_invalid",
  });

  const principal = PRINCIPAL_BY_ID.get(
    "cognitive_product_baseline_executor",
  );
  const privateHandler = createPrivateInvocationHandler({
    createDatabase: () => assert.fail("database must not be created"),
    env: null,
    logger: silentLogger,
    now: () => NOW,
    principal,
    resolveAdapter: () => assert.fail("adapter must not be resolved"),
  });
  await assert.rejects(
    () => privateHandler(null, ""),
    /credential_domain_rejected/u,
  );
});

test("private worker rejects every unexpected binding including deployment credentials", async () => {
  for (
    const binding of [
      "CLOUDFLARE_API_TOKEN",
      "UNEXPECTED_BINDING",
      "PRINCIPAL_ID",
    ]
  ) {
    const handler = createPrivateInvocationHandler({
      createDatabase: () => database(),
      env: await baselineEnv({ [binding]: "must-not-exist" }),
      logger: silentLogger,
      now: () => NOW,
      principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
      resolveAdapter: (operation) =>
        operationAdapter("cognitive_product_baseline_executor", operation),
    });
    await assert.rejects(
      () => handler(makeEnvelope(), TOKEN),
      /credential_domain_rejected/u,
      binding,
    );
  }
});

test("all ten private Worker handlers reject a deployment credential binding", async () => {
  for (const principal of RUNTIME_MANIFEST.principals) {
    const env = Object.fromEntries(
      privateEnvironmentKeyAllowlist(principal).map((name) => [
        name,
        "present",
      ]),
    );
    env[principal.hyperdriveBinding] = {
      connectionString: "postgres://isolated.invalid/db",
    };
    env.CLOUDFLARE_API_TOKEN = "must-not-exist";
    const handler = createPrivateInvocationHandler({
      createDatabase: () => assert.fail("database must not be created"),
      env,
      logger: silentLogger,
      now: () => NOW,
      principal,
      resolveAdapter: () => assert.fail("adapter must not be resolved"),
    });
    await assert.rejects(
      () => handler(null, ""),
      /credential_domain_rejected/u,
      principal.dbRole,
    );
  }
});

test("private worker rejects every sibling credential domain", async () => {
  for (
    const siblingSecret of [
      "COGNITIVE_MODEL_OPENAI_API_KEY",
      "COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_REPOSITORY_ID",
      "LIVEKIT_API_SECRET",
    ]
  ) {
    const handler = createPrivateInvocationHandler({
      createDatabase: () => database(),
      env: await baselineEnv({ [siblingSecret]: "must-not-exist" }),
      logger: silentLogger,
      now: () => NOW,
      principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
      resolveAdapter: (operation) =>
        operationAdapter("cognitive_product_baseline_executor", operation),
    });
    await assert.rejects(
      () => handler(makeEnvelope(), TOKEN),
      /credential_domain_rejected/u,
      siblingSecret,
    );
  }
});

test("private worker rejects every sibling Hyperdrive binding", async () => {
  const handler = createPrivateInvocationHandler({
    createDatabase: () => database(),
    env: await baselineEnv({
      COGNITIVE_MODEL_ROUTER_HYPERDRIVE: {
        connectionString: "postgres://sibling.invalid/db",
      },
    }),
    logger: silentLogger,
    now: () => NOW,
    principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
    resolveAdapter: (operation) =>
      operationAdapter("cognitive_product_baseline_executor", operation),
  });
  await assert.rejects(
    () => handler(makeEnvelope(), TOKEN),
    /credential_domain_rejected/u,
  );
});

test("wrong invocation, emergency stop and revocation fail closed", async () => {
  const envelope = await makeEnvelope();
  const wrong = createPrivateInvocationHandler({
    createDatabase: () => database(),
    env: await baselineEnv(),
    logger: silentLogger,
    now: () => NOW,
    principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
    resolveAdapter: (operation) =>
      operationAdapter("cognitive_product_baseline_executor", operation),
  });
  await assert.rejects(() => wrong(envelope, `${TOKEN}-wrong`), /invocation/u);

  const emergency = createPrivateInvocationHandler({
    createDatabase: () =>
      database({
        preflight: async (principal, operation) => ({
          allowed: false,
          assertionExpired: false,
          emergencyStopActive: true,
          operation,
          principal,
          serviceRoleMember: false,
        }),
      }),
    env: await baselineEnv(),
    logger: silentLogger,
    now: () => NOW,
    principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
    resolveAdapter: (operation) =>
      operationAdapter("cognitive_product_baseline_executor", operation),
  });
  await assert.rejects(
    () => emergency(envelope, TOKEN),
    /emergency_stop_rejected/u,
  );

  const revoked = createPrivateInvocationHandler({
    createDatabase: () =>
      database({
        revocationStatus: async () => ({ databaseAccessRevoked: true }),
      }),
    env: await baselineEnv(),
    logger: silentLogger,
    now: () => NOW,
    principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
    resolveAdapter: (operation) =>
      operationAdapter("cognitive_product_baseline_executor", operation),
  });
  await assert.rejects(() => revoked(envelope, TOKEN), /revocation_rejected/u);

  for (
    const malformedRevocation of [
      { databaseAccessRevoked: false },
      {
        databaseAccessRevoked: false,
        principal: "cognitive_sentinel_collector",
      },
      {
        databaseAccessRevoked: true,
        principal: "cognitive_product_baseline_executor",
        revoked: false,
      },
      {
        principal: "cognitive_product_baseline_executor",
        revoked: false,
      },
    ]
  ) {
    const malformed = createPrivateInvocationHandler({
      createDatabase: () =>
        database({
          revocationStatus: async () => malformedRevocation,
        }),
      env: await baselineEnv(),
      logger: silentLogger,
      now: () => NOW,
      principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
      resolveAdapter: (operation) =>
        operationAdapter("cognitive_product_baseline_executor", operation),
    });
    await assert.rejects(
      () => malformed(envelope, TOKEN),
      /revocation_rejected/u,
    );
  }
});

test("deadline cancellation aborts provider work and closes the database", async () => {
  let closed = false;
  let continued = false;
  let observedAbort = false;
  const input = await makeEnvelope();
  input.deadlineAt = "2026-07-24T12:00:00.005Z";
  const handler = createPrivateInvocationHandler({
    createDatabase: () =>
      database({
        close: async () => {
          closed = true;
        },
      }),
    env: await baselineEnv(),
    logger: silentLogger,
    now: () => NOW,
    principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
    resolveAdapter: () => ({
      databaseOperations: [],
      execute: async ({ signal }) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            continued = true;
            resolve({ result: "continued" });
          }, 50);
          signal.addEventListener("abort", () => {
            observedAbort = true;
            clearTimeout(timer);
            reject(signal.reason);
          }, { once: true });
        }),
      ready: true,
    }),
  });
  await assert.rejects(() => handler(input, TOKEN), /deadline_rejected/u);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(observedAbort, true);
  assert.equal(continued, false);
  assert.equal(closed, true);
});

test("deadline cancellation cancels a pending database mutation", async () => {
  let cancelCount = 0;
  let closeCount = 0;
  let mutationCompleted = false;
  const input = await makeEnvelope();
  input.deadlineAt = "2026-07-24T12:00:00.020Z";
  const sqlFactory = () => ({
    end: async () => {
      closeCount += 1;
    },
    unsafe: (text, parameters) => {
      if (text.includes("runtime_revocation_status")) {
        const query = Promise.resolve([{
          result: {
            databaseAccessRevoked: false,
            principal: parameters[0],
          },
        }]);
        query.cancel = () => undefined;
        return query;
      }
      assert.equal(text, "select cognitive_runtime.pending_mutation() as result");
      let rejectQuery;
      const timer = setTimeout(() => {
        mutationCompleted = true;
      }, 100);
      const query = new Promise((_resolve, reject) => {
        rejectQuery = reject;
      });
      query.cancel = () => {
        cancelCount += 1;
        clearTimeout(timer);
        rejectQuery(new Error("query_cancelled"));
      };
      return query;
    },
  });
  const handler = createPrivateInvocationHandler({
    createDatabase: (options) =>
      createScopedDatabasePort({
        ...options,
        domainStatements: {
          pendingMutation: {
            arity: 0,
            text: "select cognitive_runtime.pending_mutation() as result",
          },
        },
        sqlFactory,
      }),
    env: await baselineEnv(),
    logger: silentLogger,
    now: () => NOW,
    principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
    resolveAdapter: () => ({
      databaseOperations: [],
      execute: ({ database }) => database.call("pendingMutation", []),
      ready: true,
    }),
  });

  await assert.rejects(() => handler(input, TOKEN), /deadline_rejected/u);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(cancelCount, 1);
  assert.equal(mutationCompleted, false);
  assert.equal(closeCount, 1);
});

test("expired boundaries never start preflight or adapter execution", async () => {
  for (const expireAtCall of [2, 3]) {
    let executeCount = 0;
    let nowCalls = 0;
    let preflightCount = 0;
    const handler = createPrivateInvocationHandler({
      createDatabase: () =>
        database({
          preflight: async (principal, operation) => {
            preflightCount += 1;
            return {
              allowed: true,
              assertionExpired: false,
              emergencyStopActive: false,
              operation,
              principal,
              serviceRoleMember: false,
            };
          },
        }),
      env: await baselineEnv(),
      logger: silentLogger,
      now: () => {
        nowCalls += 1;
        return nowCalls >= expireAtCall ? NOW + 31_000 : NOW;
      },
      principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
      resolveAdapter: () => ({
        databaseOperations: ["persist_product_baseline"],
        execute: async () => {
          executeCount += 1;
          return { result: "must_not_execute" };
        },
        ready: true,
      }),
    });

    await assert.rejects(
      async () => handler(await makeEnvelope(), TOKEN),
      /deadline_rejected/u,
    );
    assert.equal(
      preflightCount,
      expireAtCall === 2 ? 0 : 1,
      `preflight boundary ${expireAtCall}`,
    );
    assert.equal(executeCount, 0, `execute boundary ${expireAtCall}`);
  }
});

test("provider checkpoints stop mutations after emergency stop or revocation", async () => {
  for (const blocker of ["emergency", "revocation"]) {
    let mutationCount = 0;
    let preflightCount = 0;
    let revocationCount = 0;
    const handler = createPrivateInvocationHandler({
      createDatabase: () =>
        database({
          preflight: async (principal, operation) => {
            preflightCount += 1;
            return {
              allowed: true,
              assertionExpired: false,
              emergencyStopActive:
                blocker === "emergency" && preflightCount > 1,
              operation,
              principal,
              serviceRoleMember: false,
            };
          },
          revocationStatus: async (principal) => {
            revocationCount += 1;
            return {
              databaseAccessRevoked:
                blocker === "revocation" && revocationCount > 1,
              principal,
              revoked: false,
            };
          },
        }),
      env: await baselineEnv(),
      logger: silentLogger,
      now: () => NOW,
      principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
      resolveAdapter: () => ({
        databaseOperations: ["persist_product_baseline"],
        execute: async ({ assertActive, signal }) => {
          signal.throwIfAborted();
          await assertActive();
          mutationCount += 1;
          return { result: "mutated" };
        },
        ready: true,
      }),
    });
    await assert.rejects(
      async () => handler(await makeEnvelope(), TOKEN),
      blocker === "emergency"
        ? /emergency_stop_rejected/u
        : /revocation_rejected/u,
    );
    assert.equal(mutationCount, 0, blocker);
  }
});

test("successful audit contains no invocation token, assertion or payload", async () => {
  const output = [];
  const handler = createPrivateInvocationHandler({
    createDatabase: () => database(),
    env: await baselineEnv(),
    logger: { log: (entry) => output.push(entry) },
    now: () => NOW,
    principal: PRINCIPAL_BY_ID.get("cognitive_product_baseline_executor"),
    resolveAdapter: (operation) =>
      operationAdapter("cognitive_product_baseline_executor", operation),
  });
  await handler(await makeEnvelope(), TOKEN);
  assert.equal(output.length, 1);
  assert.doesNotMatch(output[0], new RegExp(TOKEN, "u"));
  assert.doesNotMatch(output[0], new RegExp("a".repeat(64), "u"));
  assert.doesNotMatch(output[0], new RegExp(UUID_C, "u"));
  assert.match(output[0], /"category":"operation_completed"/u);
});

test("gateway rejects unauthenticated, wrong-principal and absent binding calls", async () => {
  const envelope = await makeEnvelope();
  const unauthenticated = createGatewayHandler({
    now: () => NOW,
    verifyAccess: async () => false,
  });
  let response = await unauthenticated(
    new Request("https://gateway.invalid/v1", {
      body: JSON.stringify(envelope),
      method: "POST",
    }),
    gatewayEnv(),
  );
  assert.equal(response.status, 401);

  const authenticated = createGatewayHandler({
    now: () => NOW,
    verifyAccess: async () => true,
  });
  response = await authenticated(
    new Request("https://gateway.invalid/v1", {
      body: JSON.stringify(envelope),
      headers: { "x-cognitive-principal-invocation": TOKEN },
      method: "POST",
    }),
    gatewayEnv({
      COGNITIVE_PRODUCT_BASELINE_EXECUTOR: undefined,
    }),
  );
  assert.equal(response.status, 503);
});

test("gateway rejects deployment credentials and every unexpected binding before Access verification", async () => {
  let verificationCount = 0;
  const authenticated = createGatewayHandler({
    now: () => NOW,
    verifyAccess: async () => {
      verificationCount += 1;
      return true;
    },
  });
  for (
    const binding of [
      "CLOUDFLARE_API_TOKEN",
      "UNEXPECTED_BINDING",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]
  ) {
    const response = await authenticated(
      new Request("https://gateway.invalid/v1", {
        body: "{}",
        method: "POST",
      }),
      gatewayEnv({ [binding]: "must-not-exist" }),
    );
    assert.equal(response.status, 503, binding);
    assert.deepEqual(await response.json(), {
      error: "gateway_credential_domain_invalid",
    });
  }
  assert.equal(verificationCount, 0);
});

test("gateway rejects oversized and malformed request bodies before dispatch", async () => {
  const authenticated = createGatewayHandler({
    now: () => NOW,
    verifyAccess: async () => true,
  });
  let response = await authenticated(
    new Request("https://gateway.invalid/v1", {
      body: "{}",
      headers: {
        "content-length": "131073",
        "x-cognitive-principal-invocation": TOKEN,
      },
      method: "POST",
    }),
    gatewayEnv(),
  );
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "request_body_too_large" });

  response = await authenticated(
    new Request("https://gateway.invalid/v1", {
      body: "{not-json",
      headers: { "x-cognitive-principal-invocation": TOKEN },
      method: "POST",
    }),
    gatewayEnv(),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "request_body_invalid" });
});
