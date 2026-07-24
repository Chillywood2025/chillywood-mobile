import assert from "node:assert/strict";
import test from "node:test";
import { hashJson, sha256Hex } from "../src/contracts.mjs";
import { createGatewayHandler } from "../src/gateway-core.mjs";
import { isExactAccessServiceToken } from "../src/gateway.mjs";
import { PRINCIPAL_BY_ID, RUNTIME_MANIFEST } from "../src/manifest.mjs";
import { operationAdapter } from "../src/operation-adapters.mjs";
import { createPrivateInvocationHandler } from "../src/private-core.mjs";

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
    PRINCIPAL_ID: principal.dbRole,
    SOURCE_COMMIT: "a".repeat(40),
    WORKER_VERSION: { id: "version-safe-id" },
    ...changes,
  };
};

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
    {},
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
    {},
  );
  assert.equal(response.status, 503);
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
    {},
  );
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "request_body_too_large" });

  response = await authenticated(
    new Request("https://gateway.invalid/v1", {
      body: "{not-json",
      headers: { "x-cognitive-principal-invocation": TOKEN },
      method: "POST",
    }),
    {},
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "request_body_invalid" });
});
