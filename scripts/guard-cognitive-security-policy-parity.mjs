#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "chillywood-security-parity-"),
);
const compile = (relative, output, replacements = []) => {
  let source = fs.readFileSync(path.join(root, relative), "utf8");
  for (const [from, to] of replacements) source = source.replace(from, to);
  fs.writeFileSync(
    path.join(temporaryRoot, output),
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: relative,
    }).outputText,
    { mode: 0o600 },
  );
};

compile("_lib/cognitivePlatformFoundation.ts", "foundation.mjs");
compile("_lib/cognitivePolicyEngine.ts", "policy.mjs", [
  ['from "./cognitivePlatformFoundation.ts"', 'from "./foundation.mjs"'],
]);
const sourceBoundary = await import(
  `file://${path.join(temporaryRoot, "policy.mjs")}`
);
const policy = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "config/intelligence/cognitive-security-classification-policy.json",
    ),
    "utf8",
  ),
);
const corpus = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "config/intelligence/cognitive-security-regression-corpus.json",
    ),
    "utf8",
  ),
);

assert.equal(corpus.policyId, policy.policyId, "corpus policy identity must match");
const sourceResults = corpus.cases.map((fixture) => ({
  classification: sourceBoundary.classifyCanonicalSecurityPayload(
    fixture.value,
    policy,
  ),
  id: fixture.id,
}));
for (let index = 0; index < corpus.cases.length; index += 1) {
  assert.equal(
    sourceResults[index].classification,
    corpus.cases[index].expected,
    `source classification mismatch for ${corpus.cases[index].id}`,
  );
}

const runtime = spawnSync(
  "deno",
  [
    "run",
    "--quiet",
    "--no-lock",
    "--node-modules-dir=auto",
    "scripts/cognitive-security-runtime-probe.ts",
  ],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  },
);
assert.equal(runtime.status, 0, "Deno runtime policy probe must pass");
const runtimeResults = JSON.parse(runtime.stdout.trim());
assert.deepEqual(
  runtimeResults,
  sourceResults,
  "TypeScript source and Deno runtime classifications must match",
);

const sqlParity = fs.readFileSync(
  path.join(
    root,
    "supabase/tests/cognitive_security_policy_parity_test.sql",
  ),
  "utf8",
);
for (const fixture of corpus.cases) {
  assert.ok(
    sqlParity.includes(`-- corpus:${fixture.id}:${fixture.expected}`),
    `PostgreSQL parity fixture missing: ${fixture.id}`,
  );
}

let seed = corpus.fixedSeed >>> 0;
const next = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
const safeAlphabet = [
  "alpha",
  "bounded",
  "current",
  "résumé",
  "東京",
  "público",
  "verified",
  "pending",
];
const startedAt = Date.now();
for (let index = 0; index < 256; index += 1) {
  const value = {
    count: next() % 10_000,
    state: "pending",
    summary: `${safeAlphabet[next() % safeAlphabet.length]} ${
      safeAlphabet[next() % safeAlphabet.length]
    }`,
  };
  const result = sourceBoundary.classifyCanonicalSecurityPayload(value, policy);
  assert.equal(result, "safe", `fixed-seed safe corpus mismatch at ${index}`);
}
assert.ok(
  Date.now() - startedAt < 5_000,
  "fixed-seed bounded property suite exceeded its CPU budget",
);

console.log(
  `Cognitive security policy parity: ${corpus.cases.length}/${corpus.cases.length} corpus cases + 256 fixed-seed properties passed`,
);
