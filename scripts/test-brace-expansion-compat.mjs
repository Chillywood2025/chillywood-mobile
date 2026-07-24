import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootRequire = createRequire(path.join(root, "package.json"));
const expoRequire = createRequire(
  rootRequire.resolve("expo/package.json"),
);
const fingerprintRequire = createRequire(
  rootRequire.resolve("@expo/fingerprint/package.json"),
);

const braceExpansion = rootRequire("brace-expansion");
assert.equal(typeof braceExpansion, "function");
assert.equal(typeof braceExpansion.expand, "function");
assert.deepEqual(braceExpansion("{a,b}"), ["a", "b"]);
assert.deepEqual(braceExpansion.expand("{a,b}"), ["a", "b"]);

const minimatch3 = rootRequire("minimatch");
assert.equal(minimatch3("a", "{a,b}"), true);

const minimatch9Module = expoRequire("minimatch");
const minimatch9 = minimatch9Module.minimatch ?? minimatch9Module;
assert.equal(minimatch9("a", "{a,b}"), true);

const minimatch10Module = fingerprintRequire("minimatch");
const minimatch10 = minimatch10Module.minimatch ?? minimatch10Module;
assert.equal(minimatch10("a", "{a,b}"), true);

process.stdout.write(
  "patched brace-expansion compatibility: minimatch 3/9/10 passed\n",
);
