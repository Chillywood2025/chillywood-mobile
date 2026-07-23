#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sourceExtensions = /\.(?:ts|tsx|js|mjs|sql|json|yml|yaml)$/u;
const forbiddenPath = /(?:^|\/)(?:\.git|node_modules|android|ios|dist|build|coverage)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|(?:credential|keystore|\.p8$|\.p12$|\.jks$|\.keystore$)/iu;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) throw new Error("architecture_graph_source_commit_invalid");
const treeEntries = execFileSync(
  "git",
  ["ls-tree", "-rz", "--full-tree", sourceCommit],
  { cwd: root, maxBuffer: 32 * 1024 * 1024 },
).toString("utf8").split("\0").filter(Boolean).map((record) => {
  const separator = record.indexOf("\t");
  if (separator < 0) throw new Error("architecture_graph_tree_record_invalid");
  const [mode, type, objectId] = record.slice(0, separator).split(" ");
  const relative = record.slice(separator + 1).normalize("NFC");
  if (!/^[0-9]{6}$/u.test(mode) || !/^[a-f0-9]{40}$/u.test(objectId) || !relative) {
    throw new Error("architecture_graph_tree_record_invalid");
  }
  return { mode, type, objectId, relative };
});
const readSingleCommitBlob = (objectId) => execFileSync(
  "git",
  ["cat-file", "blob", objectId],
  { cwd: root, maxBuffer: 4 * 1024 * 1024 },
);
const configEntry = treeEntries.find(({ relative }) =>
  relative === "config/intelligence/architecture-knowledge-graph-config.json");
if (!configEntry || configEntry.mode === "120000" || configEntry.type !== "blob") {
  throw new Error("architecture_graph_config_missing_from_commit");
}
const config = JSON.parse(readSingleCommitBlob(configEntry.objectId).toString("utf8"));
const repositoryId = execFileSync("git", ["config", "--get", "remote.origin.url"], { cwd: root, encoding: "utf8" })
  .trim()
  .replace(/^.*github\.com[:/]/u, "")
  .replace(/\.git$/u, "");
if (repositoryId !== config.repositoryId) throw new Error("architecture_graph_repository_mismatch");

const allTracked = treeEntries.map(({ relative }) => relative);
const excludedSensitivePaths = allTracked.filter((relative) => forbiddenPath.test(relative));
const tracked = treeEntries
  .filter(({ relative }) => relative !== "config/intelligence/architecture-knowledge-graph.json")
  .filter(({ relative }) => !forbiddenPath.test(relative))
  .filter(({ relative }) => sourceExtensions.test(relative));
if (tracked.length > config.caps.maxFiles) throw new Error("architecture_graph_file_cap_exceeded");
const trackedObjectIds = [...new Set(
  tracked
    .filter(({ mode, type }) => mode !== "120000" && type === "blob" && mode.startsWith("100"))
    .map(({ objectId }) => objectId),
)];
const batchOutput = execFileSync(
  "git",
  ["cat-file", "--batch"],
  {
    cwd: root,
    input: `${trackedObjectIds.join("\n")}\n`,
    maxBuffer: config.caps.maxTotalBytes + (trackedObjectIds.length * 128),
  },
);
const blobByObjectId = new Map();
let batchOffset = 0;
for (const expectedObjectId of trackedObjectIds) {
  const headerEnd = batchOutput.indexOf(0x0a, batchOffset);
  if (headerEnd < 0) throw new Error("architecture_graph_blob_batch_invalid");
  const [actualObjectId, type, sizeText] = batchOutput.subarray(batchOffset, headerEnd).toString("utf8").split(" ");
  const size = Number(sizeText);
  if (actualObjectId !== expectedObjectId || type !== "blob" || !Number.isSafeInteger(size) || size < 0) {
    throw new Error("architecture_graph_blob_batch_invalid");
  }
  const contentStart = headerEnd + 1;
  const contentEnd = contentStart + size;
  if (contentEnd >= batchOutput.length || batchOutput[contentEnd] !== 0x0a) {
    throw new Error("architecture_graph_blob_batch_invalid");
  }
  blobByObjectId.set(expectedObjectId, batchOutput.subarray(contentStart, contentEnd));
  batchOffset = contentEnd + 1;
}

const typeFor = (relative) => {
  if (/^app\/.*\.(?:ts|tsx)$/u.test(relative)) return "route_screen";
  if (/^components\//u.test(relative)) return "component";
  if (/^supabase\/functions\/[^/]+\/index\.ts$/u.test(relative)) return "edge_function";
  if (/^supabase\/migrations\/.*\.sql$/u.test(relative)) return "database_migration";
  if (/^_lib\//u.test(relative)) return "client_method_or_hook";
  if (/^(?:scripts|supabase\/tests)\//u.test(relative)) return "test_or_guard";
  if (/^(?:app\.json|app\.config\.|eas\.json|config\/release\/)/u.test(relative)) return "build_runtime_contract";
  return "source_contract";
};
const platformFor = (relative) => {
  const values = new Set(["shared"]);
  if (/(?:^|\/)ios(?:\/|$)|\.ios\./u.test(relative)) values.add("ios");
  if (/(?:^|\/)android(?:\/|$)|\.android\./u.test(relative)) values.add("android");
  if (/\.web\.|(?:^|\/)web(?:\/|$)/u.test(relative)) values.add("web");
  if (/^(?:app|components)\//u.test(relative)) ["ios", "android", "web"].forEach((value) => values.add(value));
  return [...values].sort(compareText);
};

const buildCompactArchitectureManifest = (enumeration = tracked) => {
  const skippedSymlinks = [];
  const files = [];
  const sourceByPath = new Map();
  let totalBytes = 0;
  for (const entry of enumeration) {
    const { mode, type, objectId, relative } = entry;
    if (relative.startsWith("/") || relative.split("/").includes("..")) {
      throw new Error("architecture_graph_path_escape");
    }
    if (mode === "120000") {
      skippedSymlinks.push(relative);
      continue;
    }
    if (type !== "blob" || !mode.startsWith("100")) continue;
    const content = blobByObjectId.get(objectId);
    if (!content) throw new Error("architecture_graph_commit_blob_missing");
    if (content.byteLength > config.caps.maxFileBytes) throw new Error("architecture_graph_single_file_cap_exceeded");
    if (totalBytes + content.byteLength > config.caps.maxTotalBytes) throw new Error("architecture_graph_total_byte_cap_exceeded");
    totalBytes += content.byteLength;
    sourceByPath.set(relative, content);
    files.push({
      path: relative,
      contentHash: hash(content),
      bytes: content.byteLength,
      type: typeFor(relative),
      platforms: platformFor(relative),
    });
  }
  files.sort((left, right) => compareText(left.path, right.path));
  skippedSymlinks.sort(compareText);
  const pathSet = new Set(files.map((file) => file.path));
  const edges = [];
  for (const file of files) {
    if (!/\.(?:ts|tsx|js|mjs)$/u.test(file.path)) continue;
    const source = sourceByPath.get(file.path)?.toString("utf8") ?? "";
    for (const match of source.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/gu)) {
      if (!match[1].startsWith(".")) continue;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), match[1]));
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`, `${base}/index.tsx`]
        .find((candidate) => pathSet.has(candidate));
      if (target) edges.push(`${file.path}|imports|${target}`);
    }
  }
  const normalizedEdges = [...new Set(edges)].sort(compareText);
  if (normalizedEdges.length > config.caps.maxEdges) throw new Error("architecture_graph_edge_cap_exceeded");
  const fileListDigest = hash(JSON.stringify(files));
  const graphDigest = hash(JSON.stringify({
    repositoryId: config.repositoryId,
    sourceCommit,
    generatorVersion: config.generatorVersion,
    configHash: hash(JSON.stringify(config)),
    fileListDigest,
    edges: normalizedEdges,
  }));
  return {
    schemaVersion: 2,
    source: "tracked_regular_repository_source_only",
    repositoryId: config.repositoryId,
    sourceCommit,
    generatorVersion: config.generatorVersion,
    generatorConfigHash: hash(JSON.stringify(config)),
    fileCount: files.length,
    nodeCount: files.length,
    edgeCount: normalizedEdges.length,
    totalBytes,
    skippedSymlinkCount: skippedSymlinks.length,
    skippedSymlinkDigest: hash(JSON.stringify(skippedSymlinks)),
    fileListDigest,
    graphDigest,
    secretFilesIncluded: files.some((file) => forbiddenPath.test(file.path)),
    excludedSensitivePathCount: excludedSensitivePaths.length,
    excludedSensitivePathDigest: hash(JSON.stringify([...excludedSensitivePaths].sort(compareText))),
  };
};

const manifest = buildCompactArchitectureManifest(tracked);
const reverseManifest = buildCompactArchitectureManifest([...tracked].reverse());
if (JSON.stringify(manifest) !== JSON.stringify(reverseManifest)) throw new Error("architecture_graph_enumeration_nondeterministic");

const verifyIndex = process.argv.indexOf("--verify");
if (verifyIndex >= 0) {
  const candidatePath = process.argv[verifyIndex + 1];
  if (!candidatePath) throw new Error("architecture_graph_verify_path_required");
  const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  if (candidate.sourceCommit !== sourceCommit || candidate.fileListDigest !== manifest.fileListDigest || candidate.graphDigest !== manifest.graphDigest) {
    throw new Error("architecture_graph_snapshot_stale");
  }
  process.stdout.write("architecture graph manifest verified\n");
} else if (process.argv.includes("--check")) {
  if (manifest.repositoryId !== config.repositoryId || manifest.secretFilesIncluded || !manifest.sourceCommit.match(/^[a-f0-9]{40}$/u)) {
    throw new Error("architecture_graph_manifest_invalid");
  }
  process.stdout.write(`architecture graph deterministic (${manifest.nodeCount} nodes, ${manifest.edgeCount} edges, ${manifest.skippedSymlinkCount} symlinks skipped)\n`);
} else {
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
