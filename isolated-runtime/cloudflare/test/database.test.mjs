import assert from "node:assert/strict";
import test from "node:test";
import { createDatabasePort, STATEMENT_INVENTORY } from "../src/database.mjs";
import { MODEL_STATEMENTS } from "../src/database-statements/model.mjs";
import { RUNTIME_MANIFEST } from "../src/manifest.mjs";
import {
  OPERATION_ADAPTERS,
  operationAdapter,
} from "../src/operation-adapters.mjs";

const calls = [];
const sqlFactory = (_connectionString, options) => ({
  end: async () => undefined,
  unsafe: async (text, parameters) => {
    calls.push({ options, parameters, text });
    return [{ result: { ok: true } }];
  },
});

test("database port accepts only compile-time statement IDs and exact arity", async () => {
  const database = createDatabasePort({
    connectionString: "postgres://isolated.invalid/db",
    sqlFactory,
  });
  await assert.rejects(
    () => database.call("request_supplied_function", []),
    /rpc_allowlist_rejected/u,
  );
  await assert.rejects(
    () => database.call("runtimeRolePreflight", ["principal-only"]),
    /rpc_allowlist_rejected/u,
  );
  await database.preflight("cognitive_sentinel_collector", "collect_sentinel_run");
  assert.match(
    calls.at(-1).text,
    /^select cognitive_runtime\.runtime_role_preflight/u,
  );
  assert.deepEqual(calls.at(-1).parameters, [
    "cognitive_sentinel_collector",
    "collect_sentinel_run",
  ]);
  assert.equal(calls.at(-1).options.max, 1);
  assert.equal(calls.at(-1).options.prepare, false);
  assert.equal(calls.at(-1).options.ssl, "require");
});

test("ready operation adapters use exact static parameter order", async () => {
  const database = createDatabasePort({
    connectionString: "postgres://isolated.invalid/db",
    sqlFactory,
  });
  const adapter = operationAdapter(
    "cognitive_product_baseline_executor",
    "persist",
  );
  assert.equal(adapter.ready, true);
  await adapter.execute({
    database,
    env: {
      COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION: "assertion-not-logged",
    },
    payload: {
      action: "persist",
      executionId: "10000000-0000-4000-8000-000000000001",
    },
  });
  assert.equal(calls.at(-1).parameters.length, STATEMENT_INVENTORY.baselinePersist.arity);
  assert.deepEqual(calls.at(-1).parameters.slice(0, 2), [
    "10000000-0000-4000-8000-000000000001",
    "product_experience_baseline_service",
  ]);
});

test("every reviewed operation has an explicit ready adapter and static database plan", () => {
  for (const [principal, operations] of Object.entries(OPERATION_ADAPTERS)) {
    for (const [operation, adapter] of Object.entries(operations)) {
      assert.equal(adapter.ready, true, `${principal}.${operation}`);
      assert.equal(adapter.reason, null, `${principal}.${operation}`);
      assert.equal(
        typeof adapter.execute,
        "function",
        `${principal}.${operation}`,
      );
      assert(Array.isArray(adapter.databaseOperations));
      assert.equal(
        new Set(adapter.databaseOperations).size,
        adapter.databaseOperations.length,
        `${principal}.${operation}`,
      );
    }
  }
});

test("model adapter, statement, and manifest RPC inventories remain exact", () => {
  const principal = RUNTIME_MANIFEST.principals.find(
    ({ dbRole }) => dbRole === "cognitive_model_router",
  );
  const adapter =
    OPERATION_ADAPTERS.cognitive_model_router.assess_sanitized_evidence;
  const manifestRpcs =
    principal.operations.assess_sanitized_evidence.rpcEntrypoints;
  const statementRpcs = Object.values(MODEL_STATEMENTS).map(({ text }) => {
    const match = text.match(
      /cognitive_runtime\.(cognitive_model_router_[a-z_]+)\(/u,
    );
    assert(match, "model statement must call one cognitive_runtime RPC");
    return match[1];
  });

  assert.deepEqual(adapter.databaseOperations, [
    "recover_model_reservation",
    "reserve_model_invocation",
    "record_model_provider_overrun",
    "settle_model_invocation",
  ]);
  assert.deepEqual(manifestRpcs, [
    "cognitive_model_router_recover_expired",
    "cognitive_model_router_reserve",
    "cognitive_runtime.cognitive_model_router_settle_provider_overrun",
    "cognitive_model_router_settle",
  ]);
  assert.deepEqual(
    [...new Set(statementRpcs)].sort(),
    manifestRpcs.map((entry) =>
      entry.replace(/^cognitive_runtime\./u, "")
    ).sort(),
  );
});
