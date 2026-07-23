#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const outputPath = path.join(root, "config/intelligence/architecture-knowledge-graph.json");
const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter((relative) => relative !== "config/intelligence/architecture-knowledge-graph.json")
  .filter((relative) => !/(?:credential|keystore|\.p8$|\.p12$|\.jks$|\.keystore$|\.env(?:\.|$))/iu.test(relative))
  // `git ls-files --cached --others` emits untracked files before the tracked
  // index. Sorting makes a snapshot generated before `git add` identical to a
  // clean CI checkout after the same files are committed.
  .sort(compareText);

const sourceExtensions = /\.(?:ts|tsx|js|mjs|sql|json)$/u;
const platformFor = (relative) => {
  const platforms = new Set(["shared"]);
  if (/(?:^|\/)ios(?:\/|$)|\.ios\./u.test(relative)) platforms.add("ios");
  if (/(?:^|\/)android(?:\/|$)|\.android\./u.test(relative)) platforms.add("android");
  if (/\.web\.|(?:^|\/)web(?:\/|$)/u.test(relative)) platforms.add("web");
  if (/app\//u.test(relative)) ["ios", "android", "web"].forEach((item) => platforms.add(item));
  return [...platforms].sort();
};
const typeFor = (relative) => {
  if (/^app\/.*\.(?:ts|tsx)$/u.test(relative)) return "route_screen";
  if (/^components\//u.test(relative)) return "component";
  if (/^supabase\/functions\/[^/]+\/index\.ts$/u.test(relative)) return "edge_function";
  if (/^supabase\/migrations\/.*\.sql$/u.test(relative)) return "database_migration";
  if (/^_lib\/.*(?:livekit|notification|purchase|payment|provider)/iu.test(relative)) return "provider_client_method";
  if (/^_lib\//u.test(relative)) return "client_method_or_hook";
  if (/^(?:scripts|supabase\/tests)\//u.test(relative)) return "test_or_guard";
  if (/^(?:app\.json|app\.config\.|eas\.json|config\/release\/)/u.test(relative)) return "build_runtime_contract";
  return "source_contract";
};

const selected = tracked.filter((relative) => sourceExtensions.test(relative) && (
  /^(?:app|components|_lib|supabase\/functions|supabase\/migrations|supabase\/tests|scripts|config\/release)\//u.test(relative)
  || /^(?:app\.json|app\.config\.ts|eas\.json|package\.json)$/u.test(relative)
));
if (selected.length > 5000) throw new Error("architecture_graph_file_cap_exceeded");

const nodeByPath = new Map();
const nodes = selected.map((relative) => {
  const node = { id: `file:${relative}`, type: typeFor(relative), path: relative, platforms: platformFor(relative) };
  nodeByPath.set(relative, node);
  return node;
});
const edges = [];
const resolveImport = (from, specifier) => {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`, `${base}/index.tsx`]
    .find((candidate) => nodeByPath.has(candidate)) ?? null;
};
for (const relative of selected) {
  const absolute = path.join(root, relative);
  const source = fs.readFileSync(absolute, "utf8");
  for (const match of source.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/gu)) {
    const target = resolveImport(relative, match[1]);
    if (target) edges.push({ from: `file:${relative}`, to: `file:${target}`, relation: "imports" });
  }
  if (relative.endsWith(".sql")) {
    for (const match of source.matchAll(/create\s+(?:or\s+replace\s+)?(?:table|function|trigger|policy)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z0-9_]+)/giu)) {
      const objectId = `database:${match[1].toLowerCase()}`;
      if (!nodes.some((node) => node.id === objectId)) nodes.push({ id: objectId, type: "database_object", path: relative, platforms: ["shared"] });
      edges.push({ from: `file:${relative}`, to: objectId, relation: "defines" });
    }
  }
}
const uniqueEdges = [...new Map(edges.map((edge) => [`${edge.from}|${edge.relation}|${edge.to}`, edge])).values()]
  .sort((a, b) => compareText(`${a.from}|${a.to}`, `${b.from}|${b.to}`));
if (uniqueEdges.length > 20000) throw new Error("architecture_graph_edge_cap_exceeded");
nodes.sort((a, b) => compareText(a.id, b.id));

const impactAnalysis = nodes
  .filter((node) => ["route_screen", "edge_function", "provider_client_method", "build_runtime_contract"].includes(node.type))
  .map((node) => ({
    nodeId: node.id,
    callers: uniqueEdges.filter((edge) => edge.to === node.id).map((edge) => edge.from),
    dependencies: uniqueEdges.filter((edge) => edge.from === node.id).map((edge) => edge.to),
    platforms: node.platforms,
    roles: node.type === "route_screen" && node.path.startsWith("app/admin") ? ["owner", "admin", "operator"] : ["runtime-dependent"],
    userStates: ["signed_out_or_authenticated_as_route_requires"],
    data: node.type === "edge_function" ? ["function_contract_review_required"] : ["source_contract"],
    tests: selected.filter((relative) => /(?:test|guard|proof)/iu.test(relative) && relative.includes(path.posix.basename(node.path).split(".")[0])).slice(0, 20),
    releaseImpact: node.platforms.some((platform) => platform !== "shared") ? "platform regression and runtime review required" : "shared source validation required",
    rollbackScope: "revert scoped draft-branch source and rerun affected guards",
  }));

const graph = {
  schemaVersion: 1,
  source: "repository_source_only",
  secretFilesIncluded: false,
  nodeCount: nodes.length,
  edgeCount: uniqueEdges.length,
  relationshipModel: "route -> screen -> component -> action -> client method -> Edge Function/RPC -> table -> provider -> event -> autonomous operator",
  nodes,
  edges: uniqueEdges,
  impactAnalysis,
};
const digest = crypto.createHash("sha256").update(JSON.stringify(graph)).digest("hex");
const rendered = `${JSON.stringify({ ...graph, digest }, null, 2)}\n`;

if (process.argv.includes("--write")) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rendered, { mode: 0o644 });
  process.stdout.write(`architecture graph written (${nodes.length} nodes, ${uniqueEdges.length} edges)\n`);
} else if (process.argv.includes("--check")) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== rendered) {
    throw new Error("architecture_graph_snapshot_stale");
  }
  process.stdout.write(`architecture graph verified (${nodes.length} nodes, ${uniqueEdges.length} edges)\n`);
} else {
  process.stdout.write(rendered);
}
