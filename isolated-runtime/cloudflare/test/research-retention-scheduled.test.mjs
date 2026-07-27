import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { RUNTIME_MANIFEST } from "../src/manifest.mjs";
import {
  normalizeResearchRetentionSchedule,
  RESEARCH_RETENTION_SCHEDULE,
  runScheduledResearchRetention,
} from "../src/research-retention-scheduled.mjs";

const UUID_A = "10000000-0000-4000-8000-000000000001";
const UUID_B = "20000000-0000-4000-8000-000000000001";
const UUID_C = "30000000-0000-4000-8000-000000000001";
const UUID_D = "40000000-0000-4000-8000-000000000001";
const SOURCE_COMMIT = "a".repeat(40);
const ATTESTATION_HASH = "b".repeat(64);
const scheduledTime = Date.parse("2026-07-25T03:17:00.000Z");
const principal = RUNTIME_MANIFEST.principals.find((entry) =>
  entry.dbRole === "cognitive_public_research_broker"
);

const environment = () => ({
  COGNITIVE_DEPLOYMENT_STATE: "active",
  COGNITIVE_PUBLIC_RESEARCH_BROKER_HYPERDRIVE: {
    connectionString: "postgres://retention.invalid/database",
  },
  COGNITIVE_PUBLIC_RESEARCH_BROKER_INVOKE_SHA256: "c".repeat(64),
  COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN: "d".repeat(48),
  COGNITIVE_RESEARCH_PINNED_TRANSPORT_HMAC_KEY: "e".repeat(48),
  COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL:
    "https://research-transport.example.invalid/internal/cognitive-research-transport/v1/retrieve",
  COGNITIVE_RESEARCH_RETENTION_ATTESTATION_HASH: ATTESTATION_HASH,
  COGNITIVE_RESEARCH_RETENTION_BATCH_LIMIT: "100",
  COGNITIVE_RESEARCH_RETENTION_CRON: "17 * * * *",
  COGNITIVE_RESEARCH_RETENTION_ENVIRONMENT: "production",
  COGNITIVE_RESEARCH_RETENTION_MAXIMUM_BATCHES: "1",
  COGNITIVE_RESEARCH_RETENTION_PLATFORM: "shared",
  COGNITIVE_RESEARCH_RETENTION_PROCESSOR_ATTESTATION_ID: UUID_A,
  COGNITIVE_RESEARCH_RETENTION_PROJECT_ID: UUID_B,
  COGNITIVE_RESEARCH_RETENTION_TASK_ID: UUID_C,
  COGNITIVE_RESEARCH_RETENTION_TIMEOUT_MS: "50000",
  RUNTIME_SCHEMA_VERSION: "cognitive-level01-isolated-runtime-v1",
  SOURCE_BASE_COMMIT: "8660558a9cf360f033246a404dfc5812d522da88",
  SOURCE_COMMIT,
  WORKER_VERSION: { id: "retention-worker-v1" },
});

const controller = (cron = RESEARCH_RETENTION_SCHEDULE.cron) => ({
  cron,
  scheduledTime,
});

test("retention schedule is exact, server-bound, and rejects spoofed inputs", () => {
  const normalized = normalizeResearchRetentionSchedule({
    controller: controller(),
    env: environment(),
    now: () => scheduledTime + 30_000,
    principal,
  });
  assert.equal(normalized.processorAttestationId, UUID_A);
  assert.equal(normalized.taskId, UUID_C);
  assert.equal(normalized.projectId, UUID_B);
  assert.equal(normalized.limit, 100);
  assert.equal(normalized.timeoutMs, 50_000);
  assert.throws(
    () =>
      normalizeResearchRetentionSchedule({
        controller: controller("18 * * * *"),
        env: environment(),
        now: () => scheduledTime + 30_000,
        principal,
      }),
    /retention_schedule_rejected/u,
  );
  const crossed = environment();
  crossed.COGNITIVE_RESEARCH_RETENTION_TASK_ID = UUID_D;
  crossed.COGNITIVE_RESEARCH_RETENTION_ATTESTATION_HASH = "short";
  assert.throws(
    () =>
      normalizeResearchRetentionSchedule({
        controller: controller(),
        env: crossed,
        now: () => scheduledTime + 30_000,
        principal,
      }),
    /retention_schedule_rejected/u,
  );
  const widened = environment();
  widened.COGNITIVE_LEVEL01_SCHEDULER_ASSERTION = "unexpected";
  assert.throws(
    () =>
      normalizeResearchRetentionSchedule({
        controller: controller(),
        env: widened,
        now: () => scheduledTime + 30_000,
        principal,
      }),
    /retention_environment_rejected/u,
  );
});

test("scheduled retention uses only broker preflight and exact attested RPC", async () => {
  const calls = [];
  let closed = false;
  const createDatabase = () => ({
    call: async (name, parameters) => {
      calls.push({ name, parameters });
      return {
        attestation_hash: ATTESTATION_HASH,
        claim_count: 0,
        heartbeat_id: UUID_D,
        no_work: true,
        replayed: false,
        retention_policy_id: "chillywood-cognitive-retention-v1",
        source_count: 0,
        total_count: 0,
      };
    },
    close: async () => {
      closed = true;
    },
    preflight: async (role, operation) => ({
      allowed: true,
      assertionExpired: false,
      emergencyStopActive: false,
      operation,
      principal: role,
      serviceRoleMember: false,
    }),
    revocationStatus: async (role) => ({
      databaseAccessRevoked: false,
      principal: role,
    }),
  });
  const logs = [];
  const result = await runScheduledResearchRetention({
    controller: controller(),
    createDatabase,
    env: environment(),
    logger: { log: (value) => logs.push(JSON.parse(value)) },
    now: () => scheduledTime + 30_000,
    principal,
  });
  assert.equal(result.noWork, true);
  assert.equal(result.totalCount, 0);
  assert.equal(closed, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "runAttestedRetention");
  assert.deepEqual(calls[0].parameters.slice(0, 7), [
    UUID_A,
    UUID_C,
    UUID_B,
    "shared",
    "production",
    "2026-07-25T03:17:00.000Z",
    100,
  ]);
  assert.equal(calls[0].parameters[7], "d".repeat(48));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].principal, principal.dbRole);
  assert.equal(JSON.stringify(logs).includes("postgres://"), false);
});

test("wrong principal, revocation, malformed readback, and cancellation fail closed", async () => {
  const scheduler = RUNTIME_MANIFEST.principals.find((entry) =>
    entry.dbRole === "cognitive_level01_scheduler"
  );
  assert.throws(
    () =>
      normalizeResearchRetentionSchedule({
        controller: controller(),
        env: environment(),
        now: () => scheduledTime + 30_000,
        principal: scheduler,
      }),
    /retention_environment_rejected|retention_schedule_rejected/u,
  );
  const rejectedDatabase = () => ({
    call: async () => assert.fail("revoked principal reached maintenance"),
    close: async () => {},
    preflight: async () => ({
      allowed: true,
      assertionExpired: false,
      emergencyStopActive: false,
      operation: "expire_research",
      principal: principal.dbRole,
      serviceRoleMember: false,
    }),
    revocationStatus: async () => ({
      databaseAccessRevoked: true,
      principal: principal.dbRole,
    }),
  });
  await assert.rejects(
    runScheduledResearchRetention({
      controller: controller(),
      createDatabase: rejectedDatabase,
      env: environment(),
      now: () => scheduledTime + 30_000,
      principal,
    }),
    /retention_preflight_rejected/u,
  );
  const malformedDatabase = () => ({
    call: async () => ({
      attestation_hash: ATTESTATION_HASH,
      claim_count: 1,
      heartbeat_id: UUID_D,
      no_work: true,
      replayed: false,
      retention_policy_id: "chillywood-cognitive-retention-v1",
      source_count: 0,
      total_count: 1,
    }),
    close: async () => {},
    preflight: async () => ({
      allowed: true,
      assertionExpired: false,
      emergencyStopActive: false,
      operation: "expire_research",
      principal: principal.dbRole,
      serviceRoleMember: false,
    }),
    revocationStatus: async () => ({
      databaseAccessRevoked: false,
      principal: principal.dbRole,
    }),
  });
  await assert.rejects(
    runScheduledResearchRetention({
      controller: controller(),
      createDatabase: malformedDatabase,
      env: environment(),
      now: () => scheduledTime + 30_000,
      principal,
    }),
    /retention_readback_rejected/u,
  );
});

test("only the private research broker is generated with a cron handler", async () => {
  const brokerEntrypoint = await readFile(
    fileURLToPath(
      new URL(
        "../generated/entrypoints/cognitive_public_research_broker.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const brokerConfig = JSON.parse(
    await readFile(
      fileURLToPath(
        new URL(
          "../generated/wrangler/cognitive_public_research_broker.wrangler.template.jsonc",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  );
  const schedulerEntrypoint = await readFile(
    fileURLToPath(
      new URL(
        "../generated/entrypoints/cognitive_level01_scheduler.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const schedulerConfig = JSON.parse(
    await readFile(
      fileURLToPath(
        new URL(
          "../generated/wrangler/cognitive_level01_scheduler.wrangler.template.jsonc",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  );
  const worker = await readFile(
    fileURLToPath(new URL("../src/private-worker.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(
    brokerEntrypoint,
    /createResearchRetentionScheduledHandler/u,
  );
  assert.deepEqual(brokerConfig.triggers, { crons: ["17 * * * *"] });
  assert.doesNotMatch(
    schedulerEntrypoint,
    /createResearchRetentionScheduledHandler/u,
  );
  assert.equal("triggers" in schedulerConfig, false);
  assert.match(worker, /async scheduled\(controller\)/u);
  assert.match(worker, /private_service_binding_only/u);
});
