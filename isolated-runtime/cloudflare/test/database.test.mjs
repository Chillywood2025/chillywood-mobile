import assert from "node:assert/strict";
import test from "node:test";
import { createDatabasePort, STATEMENT_INVENTORY } from "../src/database.mjs";
import { operationAdapter } from "../src/operation-adapters.mjs";

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

test("unported provider/pure-core operations are explicit fail-closed blockers", () => {
  const expected = [
    ["cognitive_product_quality_evaluator", "evaluate_sentinel_detection"],
    ["cognitive_public_research_broker", "retrieve_source"],
    ["cognitive_research_evaluator", "evaluate_research_claim"],
    ["cognitive_model_router", "assess_sanitized_evidence"],
    ["cognitive_livekit_experience_collector", "record_run"],
    ["cognitive_github_draft_pr_broker", "execute_canary"],
    ["cognitive_level01_scheduler", "dispatch_occurrence"],
  ];
  for (const [principal, operation] of expected) {
    const adapter = operationAdapter(principal, operation);
    assert.equal(adapter.ready, false, `${principal}.${operation}`);
    assert.match(adapter.reason, /_PURE_CORE_EXTRACTION_REQUIRED$/u);
  }
});
