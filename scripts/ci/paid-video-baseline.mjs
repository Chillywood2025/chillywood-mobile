import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const PAID_VIDEO_BASELINE = Object.freeze({
  manifestSha256: "f3b28f88a28e8024c100b999e7cbc7569e60507838a4ffa0f8a7856a8f9d6959",
  sourceCommit: "0d1d3b3a959295dfc44a6485ab8f7067d933bb43",
  sourceTree: "5e9b8f86792c2fab606ed216037aec916f094b7c",
  fileCount: 20,
});

const manifestUrl = new URL("./fixtures/paid-video-v2-baseline.json", import.meta.url);
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest("hex");
const fail = (condition, code) => assert.ok(condition, `PAID_VIDEO_BASELINE_${code}`);
const safeRelativePath = (name) => {
  fail(typeof name === "string" && /^[A-Za-z0-9._/-]+$/u.test(name)
    && !path.posix.isAbsolute(name) && name !== "manifest.json"
    && name.split("/").every((part) => part && part !== "." && part !== ".."), "PATH_INVALID");
};

export function validatePaidVideoBaselineManifest(bytes) {
  fail(Buffer.isBuffer(bytes), "MANIFEST_BYTES_INVALID");
  fail(hash("sha256", bytes) === PAID_VIDEO_BASELINE.manifestSha256, "MANIFEST_SHA256_MISMATCH");
  const manifest = JSON.parse(bytes.toString("utf8"));
  fail(manifest.remoteCommit === PAID_VIDEO_BASELINE.sourceCommit, "PUBLISHED_COMMIT_MISMATCH");
  fail(manifest.tree === PAID_VIDEO_BASELINE.sourceTree, "TREE_MISMATCH");
  const names = Object.keys(manifest.files);
  fail(names.length === PAID_VIDEO_BASELINE.fileCount, "FILE_COUNT_MISMATCH");
  fail(JSON.stringify([...names].sort()) === JSON.stringify(Object.keys(manifest.gitBlobs).sort()), "FILE_SET_MISMATCH");
  for (const name of names) {
    safeRelativePath(name);
    fail(/^[0-9a-f]{64}$/u.test(manifest.files[name]), "FILE_SHA256_INVALID");
    fail(/^[0-9a-f]{40}$/u.test(manifest.gitBlobs[name]), "BLOB_ID_INVALID");
  }
  // manifest.commit is the old local source equivalent, retained as provenance
  // only. Every Git read below is bound to sourceCommit/sourceTree above.
  return manifest;
}

export function validatePaidVideoBaselineEntry({ name, mode, type, blob, contents, expectedBlob, expectedSha256 }) {
  safeRelativePath(name);
  fail(mode === "100644" && type === "blob", "ENTRY_NOT_REGULAR");
  fail(Buffer.isBuffer(contents), "BLOB_BYTES_INVALID");
  fail(/^[0-9a-f]{40}$/u.test(expectedBlob) && blob === expectedBlob, "TREE_BLOB_MISMATCH");
  const computedBlob = createHash("sha1").update(`blob ${contents.length}\0`).update(contents).digest("hex");
  fail(computedBlob === expectedBlob, "BLOB_CONTENT_MISMATCH");
  fail(/^[0-9a-f]{64}$/u.test(expectedSha256) && hash("sha256", contents) === expectedSha256, "FILE_SHA256_MISMATCH");
  return contents;
}

function freshDestination(destination) {
  fail(typeof destination === "string" && path.isAbsolute(destination)
    && !destination.includes("\0") && path.normalize(destination) === destination, "DESTINATION_INVALID");
  // Require an existing, nonsymlink parent chain. In particular, do not follow
  // a dangling destination symlink or silently create unreviewed parent paths.
  let parent = path.dirname(destination);
  for (;;) {
    const stat = fs.lstatSync(parent);
    fail(stat.isDirectory() && !stat.isSymbolicLink(), "DESTINATION_PARENT_INVALID");
    const next = path.dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  let existing;
  try { existing = fs.lstatSync(destination); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  fail(!existing, "DESTINATION_EXISTS");
}

function readGit(repositoryRoot, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
  Object.assign(env, { GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" });
  const result = spawnSync("git", ["--no-replace-objects", "--literal-pathspecs", "-C", repositoryRoot, ...args], {
    env, maxBuffer: 32 * 1024 * 1024,
  });
  fail(result.status === 0 && Buffer.isBuffer(result.stdout), "GIT_OBJECT_UNAVAILABLE");
  return result.stdout;
}

function writeReadonly(destination, name, contents) {
  const parts = name.split("/");
  let directory = destination;
  for (const part of parts.slice(0, -1)) {
    directory = path.join(directory, part);
    try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const stat = fs.lstatSync(directory);
    fail(stat.isDirectory() && !stat.isSymbolicLink(), "OUTPUT_DIRECTORY_INVALID");
    fs.chmodSync(directory, 0o700);
  }
  const file = path.join(destination, name);
  const descriptor = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT
    | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o400);
  try {
    fs.writeFileSync(descriptor, contents);
    fs.fchmodSync(descriptor, 0o400);
  } finally { fs.closeSync(descriptor); }
}

export function materializePaidVideoBaseline({ repositoryRoot, destination }) {
  freshDestination(destination);
  fail(typeof repositoryRoot === "string" && path.isAbsolute(repositoryRoot), "REPOSITORY_INVALID");
  const manifestBytes = fs.readFileSync(manifestUrl);
  const manifest = validatePaidVideoBaselineManifest(manifestBytes);
  const { sourceCommit, sourceTree } = PAID_VIDEO_BASELINE;
  fail(readGit(repositoryRoot, ["rev-parse", "--verify", `${sourceCommit}^{commit}`]).toString("utf8").trim()
    === sourceCommit, "PUBLISHED_COMMIT_MISMATCH");
  fail(readGit(repositoryRoot, ["rev-parse", "--verify", `${sourceCommit}^{tree}`]).toString("utf8").trim()
    === sourceTree, "TREE_MISMATCH");
  const names = Object.keys(manifest.files);
  const listing = readGit(repositoryRoot, ["ls-tree", "-r", "-z", "--full-tree", sourceTree, "--", ...names]);
  const entries = new Map();
  for (const line of listing.toString("utf8").split("\0").filter(Boolean)) {
    const match = /^(\d{6}) (\w+) ([0-9a-f]{40})\t(.+)$/u.exec(line);
    fail(match && names.includes(match[4]) && !entries.has(match[4]), "TREE_ENTRY_INVALID");
    entries.set(match[4], { mode: match[1], type: match[2], blob: match[3] });
  }
  fail(entries.size === names.length, "TREE_FILE_SET_MISMATCH");
  const files = names.map((name) => {
    const contents = readGit(repositoryRoot, ["cat-file", "blob", `${sourceTree}:${name}`]);
    validatePaidVideoBaselineEntry({ name, ...entries.get(name), contents,
      expectedBlob: manifest.gitBlobs[name], expectedSha256: manifest.files[name] });
    return { name, contents };
  });
  // No output is created until the complete immutable source has verified.
  freshDestination(destination);
  fs.mkdirSync(destination, { mode: 0o700 });
  fs.chmodSync(destination, 0o700);
  for (const file of files) writeReadonly(destination, file.name, file.contents);
  writeReadonly(destination, "manifest.json", manifestBytes);
  return { destination, manifestPath: path.join(destination, "manifest.json"),
    manifestSha256: PAID_VIDEO_BASELINE.manifestSha256, sourceCommit, sourceTree, fileCount: files.length };
}
