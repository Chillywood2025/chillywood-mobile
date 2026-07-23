#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "chillywood-network-path-parity-"),
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
const policyEngine = await import(
  `file://${path.join(temporaryRoot, "policy.mjs")}`
);
const executorBoundary = await import(
  `file://${path.join(temporaryRoot, "foundation.mjs")}`
);
const networkPolicy = JSON.parse(
  fs.readFileSync(
    path.join(root, "config/intelligence/cognitive-network-policy.json"),
    "utf8",
  ),
);
const pathPolicy = JSON.parse(
  fs.readFileSync(
    path.join(root, "config/intelligence/cognitive-sensitive-path-policy.json"),
    "utf8",
  ),
);
const pathFixtures = [
  "docs/.env",
  "docs/.AWS/credentials.old",
  "docs/.config/gcloud/application_default_credentials.json.copy",
  "docs/intelligence/safe.md",
  "docs/..%252f.env",
  "docs/ＮＥＳＴＥＤ/.ＳＳＨ/id_ed25519",
  "docs/.cargo/credentials.toml",
  "docs/.yarnrc.yml",
  "docs/.pypirc",
  "docs/.gem/credentials",
];

const sourceResult = {
  paths: pathFixtures.map((value) => [
    value,
    policyEngine.classifySensitiveRepositoryPath(value, pathPolicy),
  ]),
  executorPaths: pathFixtures.map((value) => [
    value,
    executorBoundary.validateLexicalRepositoryPath(value),
  ]),
  peers: [
    [["93.184.216.34"], "93.184.216.34"],
    [["93.184.216.34"], "127.0.0.1"],
    [["10.0.0.1"], "10.0.0.1"],
  ].map(([resolved, peer]) => [
    resolved,
    peer,
    policyEngine.validateResolvedResearchAddresses(
      resolved,
      peer,
      networkPolicy,
    ),
  ]),
  urls: [
    "https://example.com/",
    "https://metadata.google.internal/",
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://0177.0.0.1/",
    "https://[::ffff:127.0.0.1]/",
    "https://example.com.:443/",
    "http://example.com/",
    "https://user:synthetic@example.com/",
  ].map((value) => [
    value,
    policyEngine.validateCanonicalResearchUrl(value, networkPolicy),
  ]),
};

const runtime = spawnSync(
  "deno",
  [
    "run",
    "--quiet",
    "--no-lock",
    "--node-modules-dir=auto",
    "scripts/cognitive-network-path-runtime-probe.ts",
  ],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  },
);
assert.equal(runtime.status, 0, "Deno network/path policy probe must pass");
assert.deepEqual(
  JSON.parse(runtime.stdout.trim()),
  sourceResult,
  "source and Deno network/path policy classifications must match",
);
for (const index of [1, 2, 3, 4, 5, 6, 8, 9]) {
  const [, blockers] = sourceResult.urls[index];
  assert.ok(blockers.length > 0, "unsafe URL fixture must fail closed");
}
assert.deepEqual(sourceResult.urls[0][1], [], "public HTTPS URL must remain usable");
assert.deepEqual(
  sourceResult.urls[7][1],
  [],
  "normalized public trailing-dot HTTPS URL remains usable",
);
assert.equal(sourceResult.paths[3][1], "allowed", "safe repository path remains usable");
for (const [, classification] of sourceResult.paths.filter((_, index) => index !== 3)) {
  assert.equal(classification, "forbidden", "sensitive path fixture must fail closed");
}
assert.deepEqual(
  sourceResult.executorPaths[3][1],
  [],
  "actual executor must allow the safe repository fixture",
);
for (const [, blockers] of sourceResult.executorPaths.filter((_, index) => index !== 3)) {
  assert.ok(
    blockers.includes("credential_path_forbidden") ||
      blockers.includes("path_traversal_forbidden") ||
      blockers.includes("path_encoding_invalid") ||
      blockers.includes("forbidden_path"),
    "actual executor must fail closed for each sensitive path fixture",
  );
}

console.log(
  "Cognitive network and credential-path parity: source/runtime MATCH",
);
