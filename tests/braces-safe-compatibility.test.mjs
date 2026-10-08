import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const vendor = path.join(root, "vendor/braces-safe");
const metadata = require(path.join(vendor, "package.json"));
const declaration = "file:vendor/braces-safe/chillywood-braces-safe-3.0.3-chillywood.1.tgz";
const tarball = path.join(root, declaration.slice(5));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-braces-test-"));
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
fs.symlinkSync(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function extract(archive, name) {
  const destination = path.join(temporary, name);
  fs.mkdirSync(destination);
  execFileSync("tar", ["-xzf", archive, "-C", destination, "--strip-components=1"]);
  return destination;
}
const baseline = extract(path.join(vendor, "upstream/braces-3.0.3.tgz"), "baseline");
const suite = extract(path.join(vendor, "upstream/braces-3.0.3-source.tgz"), "suite");
const proposedSuite = extract(path.join(vendor, "upstream/braces-pr72-28d440b-source.tgz"), "proposed-suite");
const packaged = extract(tarball, "packaged");

test("the installed braces override is the reviewed artifact on every dependency path", () => {
  const manifest = readJson(path.join(root, "package.json"));
  const lock = readJson(path.join(root, "package-lock.json"));
  assert.equal(manifest.dependencies.braces, declaration);
  assert.equal(manifest.overrides.braces, "$braces");
  assert.equal(metadata.name, "@chillywood/braces-safe");
  assert.equal(metadata.version, "3.0.3-chillywood.1");
  assert.equal(metadata.chillywoodSource.advisory, "GHSA-vfj7-8cjw-p6xm");
  assert.equal(metadata.chillywoodSource.sourcePackage, "braces@3.0.3");
  assert.equal(metadata.chillywoodSource.upstreamPullRequestStatus, "closed-unmerged");
  assert.equal(sha256(fs.readFileSync(tarball)), "8d2604249240eed9f9985109f09a5e13d6c80e27924da7995c89058854b3c105");
  const integrity = `sha512-${createHash("sha512").update(fs.readFileSync(tarball)).digest("base64")}`;
  const entries = Object.entries(lock.packages).filter(([name]) => /(?:^|\/)node_modules\/braces$/u.test(name));
  assert.ok(entries.length > 0);
  for (const [name, entry] of entries) {
    assert.equal(entry.name, metadata.name, name);
    assert.equal(entry.version, metadata.version, name);
    assert.equal(entry.resolved, declaration, name);
    assert.equal(entry.integrity, integrity, name);
    for (const file of ["package.json", "README.md", ...Object.keys(metadata.chillywoodSource.runtimeFilesSha256)]) {
      assert.deepEqual(fs.readFileSync(path.join(root, name, file)), fs.readFileSync(path.join(vendor, file)), `${name}/${file}`);
      assert.deepEqual(fs.readFileSync(path.join(packaged, file)), fs.readFileSync(path.join(vendor, file)), `tarball/${file}`);
    }
  }
  for (const [file, digest] of Object.entries(metadata.chillywoodSource.runtimeFilesSha256)) {
    assert.equal(sha256(fs.readFileSync(path.join(vendor, file))), digest, file);
  }
  for (const [file, digest] of Object.entries(metadata.chillywoodSource.upstreamArtifactsSha256)) {
    assert.equal(sha256(fs.readFileSync(path.join(vendor, "upstream", file))), digest, file);
  }
  assert.equal(metadata.chillywoodSource.upstreamArtifactsSha256["braces-3.0.3.tgz"], "1cd18e862c8640b4568b1425a7df4ee030ff201d45b2da8f9f222d2987494ffc");
  for (const file of ["index.js", "lib/utils.js", "LICENSE"]) {
    assert.deepEqual(fs.readFileSync(path.join(vendor, file)), fs.readFileSync(path.join(baseline, file)));
  }
  for (const file of ["index.js", ...fs.readdirSync(path.join(baseline, "lib")).map((file) => `lib/${file}`)]) {
    assert.deepEqual(fs.readFileSync(path.join(baseline, file)), fs.readFileSync(path.join(suite, file)), `released suite/runtime alignment: ${file}`);
  }
  assert.equal(createRequire(require.resolve("micromatch")).resolve("braces"), require.resolve("braces"));
  for (const consumer of ["metro-file-map", "jest-haste-map", "@jest/transform", "jest-message-util"]) {
    const micromatchPath = createRequire(require.resolve(consumer)).resolve("micromatch");
    assert.equal(createRequire(micromatchPath).resolve("braces"), require.resolve("braces"), consumer);
  }
});

// The immutable upstream suites use only synchronous describe/it callbacks.
// Supply that runner contract without changing their source or installing a
// second test framework. Assertions, Bash oracle calls, and case bodies run.
function runUpstreamSuite(directory, select = () => true) {
  let count = 0;
  const hierarchy = [];
  const sync = (body) => {
    assert.equal(typeof body, "function", "pending upstream tests are not silently skipped");
    assert.equal(body.length, 0, "async upstream tests require a real async runner");
    assert.equal(body()?.then, undefined, "async upstream tests require a real async runner");
  };
  const suiteRequire = (name) => {
    if (name === "mocha") return {};
    if (name === "bash-path") return () => "/bin/bash";
    if (name === "..") return require(path.join(vendor, "index.js"));
    if (name.startsWith("../lib/")) return require(path.join(vendor, name.slice(3)));
    return require(name);
  };
  for (const file of fs.readdirSync(path.join(directory, "test")).filter((file) => file.endsWith(".js"))) {
    const context = {
      require: suiteRequire,
      console,
      describe: (name, body) => { hierarchy.push(name); sync(body); hierarchy.pop(); },
      it: (name, body) => {
        if (!select(name)) return;
        try { sync(body); count += 1; }
        catch (error) { throw new Error(`${file}: ${hierarchy.join(" / ")} / ${name}`, { cause: error }); }
      },
    };
    // Same realm preserves upstream strict array/object prototype comparisons.
    const body = fs.readFileSync(path.join(directory, "test", file), "utf8");
    vm.runInThisContext(`(function(require, describe, it) {\n${body}\n})`, { filename: file })(context.require, context.describe, context.it);
  }
  return count;
}

test("all unchanged published upstream 3.0.3 test cases pass", { timeout: 60_000 }, () => {
  assert.equal(runUpstreamSuite(suite), 764);
});

test("the proposed security patch regression cases pass against the narrow backport", () => {
  const names = new Set([
    "should reject deeply nested ASTs",
    "should throw an error when nesting exceeds the maximum depth",
    "should support a lower maximum depth",
    "should enforce fractional maximum depth values",
    "should not escape valid nested braces when escapeInvalid is set",
    "should reject a self-referencing AST parent",
    "should reject a cycle involving multiple AST parents",
    "should expand parsed parentheses with ordinary parent links",
  ]);
  assert.equal(runUpstreamSuite(proposedSuite, (name) => names.has(name)), 10);
});

test("adversarial bounds and 70,160 shallow comparisons survive isolated execution", { timeout: 30_000 }, () => {
  const probe = spawnSync(process.execPath, [path.join(root, "tests/fixtures/braces-security-probe.cjs"), root, baseline], {
    encoding: "utf8", timeout: 25_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, NODE_PATH: path.join(root, "node_modules") },
  });
  assert.equal(probe.error, undefined, probe.error?.message);
  assert.equal(probe.signal, null, probe.stderr);
  assert.equal(probe.status, 0, probe.stderr);
  const result = JSON.parse(probe.stdout.trim().split("\n").at(-1));
  assert.equal(result.parityCases, 70_160);
  assert.equal(result.checks, 70_331);
});

test("direct lib entry points enforce the bounds on externally supplied ASTs", () => {
  const nested = "{".repeat(101) + "a" + "}".repeat(101);
  assert.throws(() => require("braces/lib/parse")(nested), /Input depth \(101\), exceeds max depth \(100\)/u);
  for (const method of ["compile", "expand", "stringify"]) {
    for (const maxDepth of [undefined, NaN, Infinity, 10000]) {
      let ast = { type: "text", value: "a" };
      for (let i = 0; i < 10_000; i += 1) ast = { type: "paren", nodes: [ast] };
      assert.throws(() => require(`braces/lib/${method}`)({ type: "root", nodes: [ast] }, { maxDepth }), /AST depth \(101\), exceeds max depth \(100\)/u);
    }
  }
});

test("real micromatch and Metro watcher consumers keep normal glob matching", () => {
  const micromatch = require("micromatch");
  assert.deepEqual(micromatch.braceExpand("{app,hooks}/**/*.{ts,tsx}"), ["app/**/*.ts", "app/**/*.tsx", "hooks/**/*.ts", "hooks/**/*.tsx"]);
  assert.deepEqual(micromatch(["app/index.tsx", "hooks/call.ts", "assets/icon.png"], "{app,hooks}/**/*.{ts,tsx}"), ["app/index.tsx", "hooks/call.ts"]);
  const watcher = require(path.join(path.dirname(require.resolve("metro-file-map/package.json")), "src/watchers/common.js"));
  assert.equal(watcher.includedByGlob("f", ["{app,hooks}/**/*.{ts,tsx}"], false, "app/index.tsx"), true);
  assert.equal(watcher.includedByGlob("f", ["{app,hooks}/**/*.{ts,tsx}"], false, "assets/icon.png"), false);
  const hostile = "{".repeat(4000) + "a,b" + "}".repeat(4000);
  assert.throws(() => micromatch.braces(hostile), /Input depth \(101\), exceeds max depth \(100\)/u);
  assert.throws(() => micromatch.braceExpand(hostile), /Input depth \(101\), exceeds max depth \(100\)/u);
});
