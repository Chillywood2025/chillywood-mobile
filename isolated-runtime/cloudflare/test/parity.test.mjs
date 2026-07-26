import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RUNTIME_MANIFEST } from "../src/manifest.mjs";

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(runtimeRoot, "..", "..");

test("every isolated action and direct RPC remains bound to reviewed source", async () => {
  for (const principal of RUNTIME_MANIFEST.principals) {
    const sources = [principal.edgeSource];
    if (principal.dbRole === "cognitive_public_research_broker") {
      sources.push(
        "supabase/functions/cognitive-public-research-broker/policy.ts",
      );
    }
    if (principal.dbRole === "cognitive_livekit_experience_collector") {
      sources.push(
        "isolated-runtime/cloudflare/src/adapters/livekit.mjs",
        "isolated-runtime/cloudflare/src/adapters/livekit-failure-fixture.mjs",
      );
    }
    const text = (
      await Promise.all(
        sources.map((source) =>
          readFile(resolve(repositoryRoot, source), "utf8")
        ),
      )
    ).join("\n");
    for (const [action, contract] of Object.entries(principal.operations)) {
      assert.match(text, new RegExp(`["']${action}["']`, "u"), action);
      for (const key of contract.payloadKeys) {
        assert.match(text, new RegExp(`["']${key}["']`, "u"), `${action}.${key}`);
      }
      for (const rpc of contract.rpcEntrypoints) {
        if (!rpc.startsWith("cognitive_runtime.")) {
          assert.match(
            text,
            new RegExp(`["']${rpc}["']`, "u"),
            `${action}.${rpc}`,
          );
        }
      }
    }
  }
});

test("runtime source never consumes shared Supabase service credentials", async () => {
  const sourceDirectory = resolve(runtimeRoot, "src");
  const files = (await readdir(sourceDirectory))
    .filter((file) => file.endsWith(".mjs") && file !== "manifest.mjs");
  for (const file of files) {
    const text = await readFile(resolve(sourceDirectory, file), "utf8");
    assert.doesNotMatch(text, /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/u, file);
  }
});

test("all private configs are non-public and bind one unique Hyperdrive", async () => {
  const configDirectory = resolve(runtimeRoot, "generated", "wrangler");
  const files = (await readdir(configDirectory))
    .filter((file) => file.includes("cognitive_"));
  assert.equal(files.length, 10);
  const bindings = new Set();
  const mains = new Set();
  for (const file of files) {
    const config = JSON.parse(
      await readFile(resolve(configDirectory, file), "utf8"),
    );
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.equal(config.routes, undefined);
    assert.equal(config.hyperdrive.length, 1);
    assert.equal(config.services, undefined);
    assert.match(config.main, /^\.\.\/entrypoints\/cognitive_[a-z0-9_]+\.mjs$/u);
    mains.add(config.main);
    bindings.add(config.hyperdrive[0].binding);
  }
  assert.equal(bindings.size, 10);
  assert.equal(mains.size, 10);
});

test("gateway config has service bindings only and no secrets or Hyperdrive", async () => {
  const config = JSON.parse(
    await readFile(
      resolve(
        runtimeRoot,
        "generated",
        "wrangler",
        "gateway.wrangler.template.jsonc",
      ),
      "utf8",
    ),
  );
  assert.equal(config.services.length, 10);
  assert.equal(config.hyperdrive, undefined);
  assert.equal(config.secrets, undefined);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
});

test("each generated private entrypoint contains only its principal manifest", async () => {
  const entrypointDirectory = resolve(runtimeRoot, "generated", "entrypoints");
  const databaseModuleByPrincipal = {
    cognitive_github_draft_pr_broker:
      "database-statements/github.mjs",
    cognitive_level01_scheduler:
      "database-statements/scheduler.mjs",
    cognitive_livekit_experience_collector:
      "database-statements/livekit.mjs",
    cognitive_model_router:
      "database-statements/model.mjs",
    cognitive_product_baseline_executor:
      "database-statements/baseline.mjs",
    cognitive_product_quality_evaluator:
      "database-statements/evaluator.mjs",
    cognitive_product_quality_triage:
      "database-statements/triage.mjs",
    cognitive_public_research_broker:
      "database-statements/research-broker.mjs",
    cognitive_research_evaluator:
      "database-statements/research-evaluator.mjs",
    cognitive_sentinel_collector:
      "database-statements/sentinel.mjs",
  };
  for (const principal of RUNTIME_MANIFEST.principals) {
    const text = await readFile(
      resolve(entrypointDirectory, `${principal.dbRole}.mjs`),
      "utf8",
    );
    assert.match(text, new RegExp(`"${principal.dbRole}"`, "u"));
    assert.doesNotMatch(text, /src\/operation-adapters\.mjs/u);
    assert.doesNotMatch(text, /src\/database\.mjs/u);
    assert.match(
      text,
      new RegExp(
        databaseModuleByPrincipal[principal.dbRole] ??
          "database-statements/none.mjs",
        "u",
      ),
    );
    for (const secret of principal.requiredSecrets) {
      assert.match(text, new RegExp(`"${secret}"`, "u"));
    }
    for (
      const sibling of RUNTIME_MANIFEST.principals.filter((entry) =>
        entry.dbRole !== principal.dbRole
      )
    ) {
      assert.doesNotMatch(text, new RegExp(`"${sibling.dbRole}"`, "u"));
      for (
        const secret of sibling.requiredSecrets.filter((name) =>
          !principal.requiredSecrets.includes(name)
        )
      ) {
        assert.doesNotMatch(text, new RegExp(`"${secret}"`, "u"));
      }
    }
  }
});
