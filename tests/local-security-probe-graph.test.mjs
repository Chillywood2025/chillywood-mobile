import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { auditLocalSecurityProbe } from "../scripts/lib/local-security-probe-graph.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const probe = "scripts/cognitive-security-runtime-probe.ts";
const engine = "_lib/cognitivePolicyEngine.ts";
const foundation = "_lib/cognitivePlatformFoundation.ts";
const corpus = "config/intelligence/cognitive-security-regression-corpus.json";
const policy = "config/intelligence/cognitive-security-classification-policy.json";
const graph = [probe, engine, foundation, corpus, policy];
const sql = "supabase/tests/cognitive_security_policy_parity_test.sql";
const guard = path.join(root, "scripts/guard-cognitive-security-policy-parity.mjs");
const auditFailure = /Local security probe dependency audit failed/;

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "local-security-probe-test-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  for (const relative of [...graph, sql]) {
    const destination = path.join(temporary, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  return temporary;
}

function append(temporary, relative, source) {
  fs.appendFileSync(path.join(temporary, relative), `\n${source}\n`);
}

function replace(temporary, relative, before, after) {
  const target = path.join(temporary, relative);
  const source = fs.readFileSync(target, "utf8");
  assert.ok(source.includes(before), "negative control must change its target");
  fs.writeFileSync(target, source.replace(before, after));
}

test("the actual graph contains exactly three TypeScript sources and two JSON fixtures", () => {
  const sources = auditLocalSecurityProbe(root);
  assert.deepEqual([...sources.keys()], graph);
  for (const relative of graph) assert.equal(sources.get(relative), fs.readFileSync(path.join(root, relative), "utf8"));
});

const additions = [
  ["npm static import", 'import value from "npm:inert-probe-fixture";'],
  ["HTTPS static import", 'import value from "https://example.invalid/inert.ts";'],
  ["HTTP static import", 'import value from "http://example.invalid/inert.ts";'],
  ["JSR static import", 'import value from "jsr:@inert/probe";'],
  ["bare static import", 'import value from "inert-probe-fixture";'],
  ["Node builtin import", 'import value from "node:fs";'],
  ["extra local import", 'import value from "./extra-inert.ts";'],
  ["absolute local import", 'import value from "/tmp/extra-inert.ts";'],
  ["file URL import", 'import value from "file:///tmp/extra-inert.ts";'],
  ["data URL import", 'import value from "data:text/javascript,export default 1";'],
  ["side-effect import", 'import "npm:inert-probe-fixture";'],
  ["dynamic npm import", 'void import("npm:inert-probe-fixture");'],
  ["computed dynamic import", 'const target = "inert-probe-fixture"; void import(target);'],
  ["dynamic reviewed local import", 'void import("./cognitivePlatformFoundation.ts");'],
  ["type-only import", 'import type { Inert } from "inert-probe-fixture";'],
  ["import type expression", 'type Inert = import("inert-probe-fixture").Inert;'],
  ["import equals require", 'import inert = require("inert-probe-fixture");'],
  ["require call", 'require("inert-probe-fixture");'],
  ["optional require call", 'require?.("inert-probe-fixture");'],
  ["module require", 'module.require("inert-probe-fixture");'],
  ["computed require", 'module["require"]("inert-probe-fixture");'],
  ["require alias", 'const loader = require; loader("inert-probe-fixture");'],
  ["createRequire", 'const loader = createRequire("file:///tmp/inert.js");'],
  ["re-export", 'export * from "inert-probe-fixture";'],
  ["type re-export", 'export type { Inert } from "inert-probe-fixture";'],
  ["path reference", '/// <reference path="./extra-inert.ts" />'],
  ["types reference", '/// <reference types="inert-probe-fixture" />'],
  ["lib reference", '/// <reference lib="deno.ns" />'],
  ["Deno type directive", '// @deno-types="https://example.invalid/inert.d.ts"'],
  ["TypeScript type directive", '// @ts-types="inert-probe-fixture"'],
  ["self type directive", '// @ts-self-types="./extra-inert.d.ts"'],
  ["JSX dependency directive", '/** @jsxImportSource inert-probe-fixture */'],
  ["import meta resolver", 'import.meta.resolve("inert-probe-fixture");'],
  ["ambient external module", 'declare module "inert-probe-fixture" {}'],
  ["malformed import", 'import { from "inert-probe-fixture";'],
];

for (const [name, source] of additions) {
  test(`dependency audit rejects ${name} before evaluation`, (t) => {
    const temporary = fixture(t);
    append(temporary, engine, source);
    assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
  });
}

for (const relative of [probe, engine, foundation]) {
  test(`static external dependencies fail closed in ${relative}`, (t) => {
    const temporary = fixture(t);
    append(temporary, relative, 'import "https://example.invalid/inert.ts";');
    assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
  });
}

test("missing or duplicated approved imports cannot change the reviewed graph", (t) => {
  const temporary = fixture(t);
  append(temporary, engine, 'import { sanitizeCognitivePayload as inert } from "./cognitivePlatformFoundation.ts";');
  assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
  fs.copyFileSync(path.join(root, engine), path.join(temporary, engine));
  replace(temporary, engine, 'from "./cognitivePlatformFoundation.ts"', 'from "./other-foundation.ts"');
  assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
});

test("unrecognized JSON import attributes fail closed", (t) => {
  const temporary = fixture(t);
  replace(temporary, probe, 'type: "json"', 'type: "json", unknown: "inert"');
  assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
});

test("missing approved import and JSON attributes fail closed", (t) => {
  const temporary = fixture(t);
  fs.writeFileSync(path.join(temporary, engine), "export const inert = 1;");
  assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
  fs.copyFileSync(path.join(root, engine), path.join(temporary, engine));
  replace(temporary, probe, 'with {\n  type: "json",\n}', "");
  assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
});

for (const relative of graph) {
  test(`a missing graph file fails closed: ${relative}`, (t) => {
    const temporary = fixture(t);
    fs.rmSync(path.join(temporary, relative));
    assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
  });
}

for (const relative of [corpus, policy]) {
  test(`invalid JSON fails before evaluation: ${relative}`, (t) => {
    const temporary = fixture(t);
    append(temporary, relative, "not-json");
    assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
  });
}

test("symlinked graph leaves and directories fail closed", { skip: process.platform === "win32" }, (t) => {
  const temporary = fixture(t);
  fs.rmSync(path.join(temporary, foundation));
  fs.symlinkSync(path.join(root, foundation), path.join(temporary, foundation));
  assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
  fs.rmSync(path.join(temporary, "_lib"), { recursive: true });
  fs.symlinkSync(path.join(root, "_lib"), path.join(temporary, "_lib"));
  assert.throws(() => auditLocalSecurityProbe(temporary), auditFailure);
});

test("ordinary comments and strings are not imports", (t) => {
  const temporary = fixture(t);
  append(temporary, foundation, '// import "inert-probe-fixture";\nconst inertText = \'import("inert-probe-fixture")\';');
  assert.equal(auditLocalSecurityProbe(temporary).size, 5);
});

for (const [name, source] of additions.filter(([name]) => ["npm static import", "HTTPS static import", "extra local import", "dynamic npm import", "require call", "path reference"].includes(name))) {
  test(`actual guard rejects ${name} before Node evaluation or Deno launch`, { skip: process.platform === "win32" }, (t) => {
    const temporary = fixture(t);
    append(temporary, foundation, 'throw new Error("UNEXPECTED_NODE_EVALUATION");');
    append(temporary, probe, source);
    const bin = path.join(temporary, "bin");
    fs.mkdirSync(bin);
    const marker = path.join(temporary, "deno-launched");
    fs.writeFileSync(path.join(bin, "deno"), `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(marker)}, "unexpected");\n`, { mode: 0o700 });
    const result = spawnSync(process.execPath, [guard], {
      cwd: temporary, env: { PATH: bin }, encoding: "utf8", timeout: 15_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, auditFailure);
    assert.doesNotMatch(result.stderr, /UNEXPECTED_NODE_EVALUATION|example\.invalid|inert-probe-fixture/);
    assert.equal(fs.existsSync(marker), false);
  });
}

const version = spawnSync("deno", ["--version"], { encoding: "utf8", timeout: 5_000 });
const denoUnavailable = version.error?.code === "ENOENT";

test("real Deno runs all 35 classifications and the guard's 256 properties without npm or config discovery", { skip: denoUnavailable ? "Deno is not installed" : false }, (t) => {
  assert.equal(version.status, 0, "installed Deno must run successfully");
  t.diagnostic(version.stdout.split("\n")[0]);
  const temporary = fixture(t);
  const cache = path.join(temporary, "deno-cache");
  // These must be ignored, not repaired, installed, or granted an age exception.
  const packageText = JSON.stringify({ dependencies: { "inert-probe-must-not-install": "0.0.0" } });
  const configText = JSON.stringify({ imports: { "../_lib/cognitivePolicyEngine.ts": "https://example.invalid/must-not-load.ts" }, compilerOptions: { types: ["npm:inert-probe-must-not-install"] } });
  fs.writeFileSync(path.join(temporary, "package.json"), packageText);
  fs.writeFileSync(path.join(temporary, "deno.json"), configText);
  const env = { ...process.env, DENO_DIR: cache, DENO_NO_PACKAGE_JSON: "0", DENO_NO_UPDATE_CHECK: "1" };
  const result = spawnSync(process.execPath, [guard], {
    cwd: temporary, env, encoding: "utf8", timeout: 40_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /20\/20 corpus cases \+ 256 fixed-seed properties passed/);
  assert.equal(result.stderr, "");
  assert.equal(fs.existsSync(path.join(temporary, "node_modules")), false);
  assert.equal(fs.existsSync(path.join(temporary, "deno.lock")), false);
  // Deno may create empty cache directories even with resolution disabled.
  for (const name of ["npm", "remote"]) {
    const directory = path.join(cache, name);
    assert.deepEqual(fs.existsSync(directory) ? fs.readdirSync(directory) : [], []);
  }
  assert.equal(fs.readFileSync(path.join(temporary, "package.json"), "utf8"), packageText);
  assert.equal(fs.readFileSync(path.join(temporary, "deno.json"), "utf8"), configText);
  for (const relative of graph) assert.equal(fs.readFileSync(path.join(temporary, relative), "utf8"), fs.readFileSync(path.join(root, relative), "utf8"));
});

for (const [name, specifier] of [
  ["npm", "npm:inert-probe-must-not-install"],
  ["remote", "https://example.invalid/must-not-load.ts"],
  ["bare", "inert-probe-must-not-install"],
]) {
  test(`real Deno isolation independently refuses ${name} dependencies`, { skip: denoUnavailable ? "Deno is not installed" : false }, (t) => {
    assert.equal(version.status, 0);
    const temporary = fixture(t);
    append(temporary, probe, `import ${JSON.stringify(specifier)};`);
    const cache = path.join(temporary, "deno-cache");
    const result = spawnSync("deno", [
      "run", "--quiet", "--no-lock", "--no-config", "--no-npm", "--no-remote", "--node-modules-dir=none", probe,
    ], {
      cwd: temporary,
      env: { ...process.env, DENO_DIR: cache, DENO_NO_PACKAGE_JSON: "1", DENO_NO_UPDATE_CHECK: "1" },
      encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--no-npm|--no-remote|not a dependency|Requires import access/);
    assert.equal(fs.existsSync(path.join(temporary, "node_modules")), false);
    for (const name of ["npm", "remote"]) {
      const directory = path.join(cache, name);
      assert.deepEqual(fs.existsSync(directory) ? fs.readdirSync(directory) : [], []);
    }
  });
}
