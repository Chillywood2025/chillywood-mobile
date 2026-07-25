import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootRequire = createRequire(path.join(root, "package.json"));
const expoRequire = createRequire(
  rootRequire.resolve("expo/package.json"),
);
const fingerprintRequire = createRequire(
  rootRequire.resolve("@expo/fingerprint/package.json"),
);
const minimatch3Require = createRequire(
  rootRequire.resolve("minimatch/package.json"),
);

const braceExpansion = minimatch3Require("brace-expansion");
assert.equal(typeof braceExpansion.expand, "function");
assert.deepEqual(braceExpansion.expand("{a,b}"), ["a", "b"]);
assert.equal(braceExpansion.EXPANSION_MAX, 100_000);
assert.equal(braceExpansion.EXPANSION_MAX_LENGTH, 4_000_000);

const braceExpansionRoot = path.dirname(
  minimatch3Require.resolve("brace-expansion/package.json"),
);
const braceExpansionEsm = await import(
  pathToFileURL(path.join(braceExpansionRoot, "dist/esm/index.js")),
);
assert.equal(typeof braceExpansionEsm.expand, "function");
assert.equal(braceExpansionEsm.EXPANSION_MAX, 100_000);
assert.equal(braceExpansionEsm.EXPANSION_MAX_LENGTH, 4_000_000);

const minimatch3 = rootRequire("minimatch");
assert.equal(minimatch3("a", "{a,b}"), true);

const minimatch9Module = expoRequire("minimatch");
const minimatch9 = minimatch9Module.minimatch ?? minimatch9Module;
assert.equal(minimatch9("a", "{a,b}"), true);

const minimatch10Module = fingerprintRequire("minimatch");
const minimatch10 = minimatch10Module.minimatch ?? minimatch10Module;
assert.equal(minimatch10("a", "{a,b}"), true);

const expoMinimatchRoot = path.dirname(
  expoRequire.resolve("minimatch/package.json"),
);
const fingerprintMinimatchRoot = path.dirname(
  fingerprintRequire.resolve("minimatch/package.json"),
);
const minimatch9Esm = await import(
  pathToFileURL(path.join(expoMinimatchRoot, "dist/esm/index.js"))
);
const minimatch10Esm = await import(
  pathToFileURL(path.join(fingerprintMinimatchRoot, "dist/esm/index.js"))
);
assert.equal(minimatch9Esm.minimatch("a", "{a,b}"), true);
assert.equal(minimatch10Esm.minimatch("a", "{a,b}"), true);

const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
const installedBraceExpansion = Object.entries(lock.packages ?? {}).filter(
  ([packagePath]) =>
    packagePath === "node_modules/brace-expansion" ||
    packagePath.endsWith("/node_modules/brace-expansion"),
);
assert.ok(installedBraceExpansion.length > 0);
for (const [packagePath, metadata] of installedBraceExpansion) {
  assert.equal(metadata.version, "5.0.8", packagePath);
  assert.match(metadata.resolved, /^https:\/\/registry\.npmjs\.org\//);
  assert.equal(typeof metadata.integrity, "string");
  assert.equal(metadata.link, undefined);
}

const lockedMinimatch10 = Object.entries(lock.packages ?? {}).filter(
  ([packagePath, metadata]) =>
    (
      metadata.version === "10.2.4" ||
      metadata.version === "10.2.5"
    ) &&
    (
      packagePath === "node_modules/minimatch" ||
      packagePath.endsWith("/node_modules/minimatch")
    ),
);
assert.equal(lockedMinimatch10.length, 3);
for (const [packagePath] of lockedMinimatch10) {
  const packageRoot = path.join(root, packagePath);
  const commonJs = rootRequire(
    path.join(packageRoot, "dist/commonjs/index.js"),
  );
  const esm = await import(
    pathToFileURL(path.join(packageRoot, "dist/esm/index.js")),
  );
  assert.equal(commonJs.minimatch("a", "{a,b}"), true, packagePath);
  assert.equal(esm.minimatch("a", "{a,b}"), true, packagePath);
}

assert.equal(
  Object.keys(lock.packages ?? {}).some((packagePath) =>
    packagePath.includes("brace-expansion-compat"),
  ),
  false,
);

const dependencyTree = JSON.parse(
  execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["ls", "brace-expansion", "--all", "--json"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ),
);
assert.deepEqual(dependencyTree.problems ?? [], []);

process.stdout.write(
  "patched brace-expansion compatibility: clean tree and CJS/ESM minimatch 3/9/10 passed\n",
);
