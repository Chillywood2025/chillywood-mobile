import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { maintenanceResponse, MAINTENANCE_MARKER } from "./maintenance-handler.mjs";
import { collectSourceBundle, importSpecifiers, prepareDeployment, normalizeCapturedBaseline,
  sha256, gitReader, FINAL_FUNCTIONS } from "./prepare-edge.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const original = {
  name: "stripe-merch-checkout", project_id: "synthetic-project", verify_jwt: false,
  entrypoint_path: "functions/stripe-merch-checkout/index.ts",
  files: [{ name: "functions/stripe-merch-checkout/index.ts", content: '// retained deployed bytes\nDeno.serve(() => new Response("old"));\n' }],
};
const baseline = JSON.stringify(original);
const record = { name: original.name, deployed: true, version: 30, verify_jwt: false,
  baseline_bundle: "baseline.json", baseline_sha256: sha256(baseline) };
const inventory = { schemaVersion: 1, project_id: original.project_id, functions: [record] };
const source = name => name.startsWith("ops/creator-backend-rollout/") ? readFileSync(new URL(`../../${name}`, import.meta.url), "utf8") : null;
const options = { name: original.name, inventory, readSource: source, readBaseline: () => baseline };

test("maintenance never acknowledges any method and has no downstream calls", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Maintenance attempted network I/O"); };
  try {
    for (const method of ["GET", "POST", "OPTIONS", "PUT", "DELETE"]) {
      const response = maintenanceResponse(new Request("https://synthetic.invalid", { method }));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("Retry-After"), "60");
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
      const body = await response.json();
      assert.equal(body.deploymentMarker, MAINTENANCE_MARKER);
      assert.equal(body.webhookProcessed, false);
      assert.equal(body.checkoutCreated, false);
    }
  } finally { globalThis.fetch = oldFetch; }
});

test("bridge preserves recorded JWT and restoration returns captured source, not current source", () => {
  const bridge = prepareDeployment({ ...options, mode: "bridge" });
  assert.equal(bridge.verify_jwt, false);
  assert.equal(bridge.files.length, 2);
  assert.match(bridge.files[0].content, /Deno\.serve\(maintenanceResponse\)/);
  assert.deepEqual(prepareDeployment({ ...options, mode: "restore", readSource: () => { throw new Error("Cannot use current source"); } }), original);
  assert.throws(() => prepareDeployment({ ...options, mode: "final" }), /restore captured/);
  const authenticated = structuredClone(inventory);
  authenticated.functions[0].verify_jwt = true;
  assert.throws(() => prepareDeployment({ ...options, mode: "bridge", inventory: authenticated }), /JWT mismatch/);
});

test("raw get_edge_function capture normalizes only the entrypoint prefix", () => {
  const captured = { id: "synthetic", slug: original.name, name: original.name, status: "ACTIVE", version: 30,
    verify_jwt: false, entrypoint_path: `/tmp/captured/source/supabase/${original.entrypoint_path}`, import_map: false, files: original.files };
  assert.deepEqual(normalizeCapturedBaseline(captured, original.project_id, 30), original);
  assert.throws(() => normalizeCapturedBaseline(captured, original.project_id, 31), /version/);
  assert.throws(() => normalizeCapturedBaseline({ ...captured, entrypoint_path: "/tmp/wrong.ts" }, original.project_id, 30), /entrypoint/);
  const raw = JSON.stringify(captured), rawInventory = structuredClone(inventory);
  rawInventory.functions[0].baseline_sha256 = sha256(raw);
  assert.deepEqual(prepareDeployment({ ...options, mode: "restore", inventory: rawInventory, readBaseline: () => raw }), original);
});

test("missing, changed and unknown inventories fail before preparing a deployment", () => {
  assert.throws(() => prepareDeployment({ ...options, mode: "bridge", readBaseline: () => `${baseline} ` }), /hash mismatch/);
  assert.throws(() => prepareDeployment({ ...options, mode: "bridge", name: "money-operator" }), /Unsupported/);
  assert.throws(() => prepareDeployment({ ...options, mode: "bridge", inventory: { ...inventory, functions: [] } }), /inventory entry/);
  assert.throws(() => prepareDeployment({ ...options, mode: "bridge", inventory: { ...inventory, functions: [record, record] } }), /inventory entry/);
});

test("recursive imports, re-exports, import types and local Deno maps are deterministic", () => {
  const entry = "supabase/functions/creator-event-broadcast/index.ts";
  const input = new Map([
    [entry, 'import { x } from "../_shared/a.ts"; import "mapped"; type T = import("../_shared/type.ts").T;'],
    ["supabase/functions/_shared/a.ts", 'export { x } from "./b.ts";'],
    ["supabase/functions/_shared/b.ts", 'export const x = /["\']/; const text = `import("fake")`;'],
    ["supabase/functions/_shared/type.ts", 'export type T = string;'],
    ["supabase/functions/_shared/mapped.ts", 'import "npm:example@1.0.0";'],
    ["supabase/functions/deno.jsonc", '{ // retained JSONC\n "imports": { "mapped": "./_shared/mapped.ts", }, }'],
  ]);
  const read = name => input.get(name) ?? null;
  const bundle = collectSourceBundle(read, entry);
  assert.deepEqual(bundle, collectSourceBundle(read, entry));
  assert.equal(bundle.files.length, 6);
  for (const file of bundle.files) assert.equal(file.content, input.get(file.name));
  assert.deepEqual(importSpecifiers('// import "fake";\nconst t = `import("fake")`; export { x } from "./real.ts";'), ["./real.ts"]);
  assert.throws(() => importSpecifiers("await import(name)"), /literal/);
  assert.throws(() => collectSourceBundle(name => name === entry ? 'import "../../../outside.ts";' : null, entry), /escapes/);
  assert.throws(() => collectSourceBundle(name => name === entry ? 'import "./missing.ts";' : null, entry), /Missing frozen/);
});

test("all ten final functions resolve from the current committed source without reading working files", () => {
  const head = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const read = gitReader(repo, head);
  for (const name of FINAL_FUNCTIONS) {
    const entrypoint = `supabase/functions/${name}/index.ts`;
    const bundle = collectSourceBundle(read, entrypoint);
    assert.ok(bundle.files.some(file => file.name === entrypoint));
    assert.ok(bundle.files.length > 1, name);
    for (const file of bundle.files) assert.equal(file.content, read(file.name));
  }
  assert.throws(() => gitReader(repo, "HEAD"), /immutable/);
});

test("only the new broadcast function may be prepared without an existing baseline", () => {
  const entry = "supabase/functions/creator-event-broadcast/index.ts";
  const fresh = { schemaVersion: 1, project_id: "synthetic-project", functions: [
    { name: "creator-event-broadcast", deployed: false, version: null, verify_jwt: false },
  ] };
  const freshOptions = { name: "creator-event-broadcast", inventory: fresh, readSource: name => name === entry ? "Deno.serve(() => new Response());" : null };
  assert.equal(prepareDeployment({ ...freshOptions, mode: "final" }).verify_jwt, false);
  assert.throws(() => prepareDeployment({ ...freshOptions, mode: "bridge" }), /Only new/);
});
