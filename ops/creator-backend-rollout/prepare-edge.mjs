#!/usr/bin/env node
// Local preparation only. Emits one Supabase deploy_edge_function argument object.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FINAL_FUNCTIONS = Object.freeze([
  "create-creator-tip-checkout", "creator-event-broadcast", "revenuecat-webhook",
  "spectator-playback", "stripe-connect-account", "stripe-connect-account-sync",
  "stripe-connect-onboarding-link", "stripe-connect-webhook", "stripe-merch-webhook",
  "stripe-tip-webhook",
]);
export const MAINTENANCE_ONLY_FUNCTIONS = Object.freeze([
  "stripe-merch-checkout", "request-save-replay", "spectator-start-room",
  "spectator-broadcast-start", "spectator-broadcast-stop", "spectator-broadcast-status",
]);
const ALLOWED = new Set([...FINAL_FUNCTIONS, ...MAINTENANCE_ONLY_FUNCTIONS]);
const ROOT = "supabase/functions/";
export const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = message => { throw new Error(message); };
const require = createRequire(import.meta.url);

function cleanName(name) {
  if (typeof name !== "string" || !name || name.includes("\\") || name.startsWith("/")
    || name.split("/").some(part => !part || part === "." || part === "..")) fail("Unsafe bundle file name");
  return name;
}

export function importSpecifiers(source) {
  // Use the repository's existing TypeScript parser, never regex over source:
  // regex literals, templates and comments can contain misleading import text.
  const ts = require("typescript");
  const ast = ts.createSourceFile("bundle.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) fail("Source has TypeScript parse errors");
  const imports = [];
  const take = node => {
    if (!node || !ts.isStringLiteralLike(node)) fail("Only literal module imports are supported");
    imports.push(node.text);
  };
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) take(node.moduleSpecifier);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) take(node.argument.literal);
    if (ts.isImportEqualsDeclaration(node)) fail("Import assignment requires an explicit reviewed bundle");
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) take(node.arguments[0]);
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") fail("require() is not supported in rollout bundles");
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return [...new Set(imports)].sort();
}

function parseConfig(content) {
  const parsed = require("typescript").parseConfigFileTextToJson("deno.jsonc", content);
  if (parsed.error) fail("Invalid Deno/import-map configuration");
  return parsed.config;
}

export function collectSourceBundle(readSource, entrypoint) {
  const files = new Map(), visited = new Set(), aliases = new Map(), configs = new Set();
  let importMapPath;
  const local = (base, specifier) => {
    const name = path.posix.normalize(path.posix.join(path.posix.dirname(base), specifier));
    if (!name.startsWith(ROOT)) fail("Dependency escapes supabase/functions");
    return cleanName(name);
  };
  const include = name => {
    cleanName(name);
    const content = readSource(name);
    if (typeof content !== "string") fail(`Missing frozen source file: ${name}`);
    files.set(name, content); return content;
  };
  const config = (name, value) => {
    if (configs.has(name)) fail("Cyclic or repeated import-map configuration");
    configs.add(name);
    for (const [key, target] of Object.entries(value.imports ?? {})) {
      if (typeof target !== "string") fail("Unsupported import-map target");
      aliases.set(key, { base: name, target });
    }
    for (const mappings of Object.values(value.scopes ?? {})) {
      for (const target of Object.values(mappings)) {
        if (typeof target === "string" && target.startsWith(".")) fail("Scoped local imports require an explicit reviewed bundle");
      }
    }
    if (value.workspace) fail("Deno workspaces require an explicit reviewed bundle");
    if (value.importMap) {
      if (typeof value.importMap !== "string" || !value.importMap.startsWith(".")) fail("Import map must be local");
      importMapPath = local(name, value.importMap);
      config(importMapPath, parseConfig(include(importMapPath)));
    }
  };
  // Include parent and function-local runtime configuration, from frozen Git.
  for (const directory of [ROOT.slice(0, -1), path.posix.dirname(entrypoint)]) {
    const candidates = ["deno.json", "deno.jsonc"].map(file => `${directory}/${file}`)
      .filter(name => readSource(name) !== null);
    if (candidates.length > 1) fail("Ambiguous Deno configuration");
    for (const name of candidates) config(name, parseConfig(include(name)));
  }
  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const content = include(name);
    if (!/\.(?:[cm]?[jt]sx?)$/.test(name)) return;
    for (const specifier of importSpecifiers(content)) {
      if (specifier.startsWith(".")) { visit(local(name, specifier)); continue; }
      if (/^(?:jsr|npm|https|http|node):/.test(specifier)) continue;
      const mapping = aliases.get(specifier);
      if (!mapping) fail(`Unresolved bare or prefix import: ${specifier}`);
      if (mapping.target.startsWith(".")) visit(local(mapping.base, mapping.target));
      else if (!/^(?:jsr|npm|https|http|node):/.test(mapping.target)) fail("Unresolved import-map target");
    }
  }
  visit(entrypoint);
  return { files: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, content]) => ({ name, content })), ...(importMapPath ? { import_map_path: importMapPath } : {}) };
}

function validateBaseline(record, projectId, readBaseline) {
  if (!record.deployed || !["string", "number"].includes(typeof record.version)
    || !record.baseline_bundle || !/^[a-f0-9]{64}$/.test(record.baseline_sha256 ?? "")) fail("Captured baseline and version are required");
  const bytes = readBaseline(record.baseline_bundle);
  if (sha256(bytes) !== record.baseline_sha256) fail("Baseline bundle hash mismatch");
  const captured = JSON.parse(bytes);
  const bundle = captured.id ? normalizeCapturedBaseline(captured, projectId, record.version) : captured;
  if (bundle.name !== record.name || bundle.project_id !== projectId || bundle.verify_jwt !== record.verify_jwt
    || !Array.isArray(bundle.files) || !bundle.files.length) fail("Baseline identity/JWT mismatch");
  const names = new Set();
  for (const file of bundle.files) {
    cleanName(file.name);
    if (typeof file.content !== "string" || names.has(file.name)) fail("Invalid baseline file");
    names.add(file.name);
  }
  if (!names.has(bundle.entrypoint_path) || (bundle.import_map_path && !names.has(bundle.import_map_path))) fail("Incomplete baseline entrypoint/config");
  const keys = new Set(["name", "project_id", "verify_jwt", "files", "entrypoint_path", "import_map_path"]);
  if (Object.keys(bundle).some(key => !keys.has(key))) fail("Unexpected baseline deploy argument");
  return bundle;
}

export function normalizeCapturedBaseline(captured, projectId, expectedVersion) {
  if (captured.version !== expectedVersion || captured.status !== "ACTIVE"
    || captured.slug !== captured.name || typeof captured.verify_jwt !== "boolean"
    || !Array.isArray(captured.files)) fail("Captured deployment identity/version/status mismatch");
  const matches = captured.files.filter(file => typeof captured.entrypoint_path === "string"
    && (captured.entrypoint_path === file.name || captured.entrypoint_path.endsWith(`/${file.name}`)));
  if (matches.length !== 1) fail("Captured entrypoint must match exactly one file suffix");
  const bundle = { name: captured.name, project_id: projectId, verify_jwt: captured.verify_jwt,
    entrypoint_path: matches[0].name, files: captured.files };
  if (captured.import_map) {
    const maps = captured.files.filter(file => typeof captured.import_map_path === "string"
      && (captured.import_map_path === file.name || captured.import_map_path.endsWith(`/${file.name}`)));
    if (maps.length !== 1) fail("Capture with import_map requires its exact import_map_path");
    bundle.import_map_path = maps[0].name;
  }
  return bundle;
}

export function prepareDeployment({ mode, name, inventory, readSource, readBaseline }) {
  if (!["bridge", "final", "restore"].includes(mode) || !ALLOWED.has(name)) fail("Unsupported rollout mode/function");
  if (inventory.schemaVersion !== 1 || typeof inventory.project_id !== "string" || !inventory.project_id
    || !Array.isArray(inventory.functions)) fail("Invalid deployment inventory");
  const records = inventory.functions.filter(record => record.name === name);
  if (records.length !== 1 || typeof records[0].verify_jwt !== "boolean") fail("Exact inventory entry with verify_jwt required");
  const record = records[0];
  if (typeof record.deployed !== "boolean") fail("Explicit deployed status required");
  const baseline = record.deployed ? validateBaseline(record, inventory.project_id, readBaseline) : null;
  if (!baseline && (name !== "creator-event-broadcast" || mode !== "final" || record.version !== null)) fail("Only new creator-event-broadcast may lack a baseline");
  if (mode === "restore") return baseline;
  if (mode === "final" && !FINAL_FUNCTIONS.includes(name)) fail("Maintenance-only writers must restore captured deployed bytes");
  const entrypoint = `${ROOT}${name}/index.ts`;
  let bundle;
  if (mode === "bridge") {
    const content = readSource("ops/creator-backend-rollout/maintenance-entrypoint.mjs");
    const handler = readSource("ops/creator-backend-rollout/maintenance-handler.mjs");
    if (typeof content !== "string" || typeof handler !== "string") fail("Bridge absent from frozen commit");
    bundle = { files: [{ name: entrypoint, content }, { name: `${ROOT}${name}/maintenance-handler.mjs`, content: handler }] };
  } else bundle = collectSourceBundle(readSource, entrypoint);
  return { name, project_id: inventory.project_id, verify_jwt: record.verify_jwt, entrypoint_path: entrypoint, ...bundle };
}

export function gitReader(repo, sourceRef) {
  if (!/^[a-f0-9]{40}$/.test(sourceRef)) fail("source-ref must be a full immutable Git commit SHA");
  const git = args => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (git(["rev-parse", `${sourceRef}^{commit}`]).trim() !== sourceRef) fail("Source commit does not match");
  const listing = git(["ls-tree", "-rz", "--full-tree", sourceRef]);
  const paths = new Map(listing.split("\0").filter(Boolean).map(item => {
    const [metadata, name] = item.split("\t"); return [name, metadata.split(" ")[0]];
  }));
  return name => {
    cleanName(name);
    if (!paths.has(name)) return null;
    if (paths.get(name) !== "100644" && paths.get(name) !== "100755") fail("Symlink/non-file source is not allowed");
    return git(["show", `${sourceRef}:${name}`]);
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i];
      if (!["--repo", "--source-ref", "--inventory", "--mode", "--function"].includes(key)
        || args[key] || !process.argv[i + 1]) fail("Expected --repo --source-ref --inventory --mode --function");
      args[key] = process.argv[i + 1];
    }
    if (Object.keys(args).length !== 5) fail("All five arguments are required");
    const inventoryPath = path.resolve(args["--inventory"]);
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    const deployArgs = prepareDeployment({ mode: args["--mode"], name: args["--function"], inventory,
      readSource: gitReader(args["--repo"], args["--source-ref"]),
      readBaseline: name => readFileSync(path.resolve(path.dirname(inventoryPath), name)),
    });
    process.stdout.write(`${JSON.stringify(deployArgs, null, 2)}\n`);
  } catch (error) { process.stderr.write(`Rollout preparation failed: ${error.message}\n`); process.exitCode = 1; }
}
