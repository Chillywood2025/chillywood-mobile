#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ROOT, emit, git, sha256, stableJson } from "./lib.mjs";

const sha = (value) => /^[0-9a-f]{40}$/u.test(value ?? "");
const resolve = (value) => git(["rev-parse", "--verify", `${value}^{commit}`]);
const tree = (value) => git(["rev-parse", "--verify", `${value}^{tree}`]);
const blob = (commit, file) => git(["rev-parse", "--verify", `${commit}:${file}`]);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

export function repositorySnapshotDigest({ target, paths, blobs }) {
  return sha256(paths.map((file, index) => ({ file, blob: blobs[index], contentSha256: sha256(git(["show", `${target}:${file}`])) })));
}

export function targetDescriptor({ base = "origin/main", target = "HEAD", policy = "config/assurance/codex-security-reliability-s0-v1.json", threat = "config/assurance/escaped-defect-catalog-v1.json", worklist = "config/assurance/feature-registry-v1.json" } = {}) {
  try {
    const baseHead = resolve(base), targetHead = resolve(target);
    const paths = git(["diff", "--no-ext-diff", "--name-only", `${baseHead}..${targetHead}`]).split("\n").filter(Boolean).sort();
    const blobs = paths.map((file) => blob(targetHead, file));
    const files = paths.map((file, index) => ({ path: file, blob: blobs[index], contentSha256: sha256(git(["show", `${targetHead}:${file}`])) }));
    const descriptor = { schemaVersion: 1, kind: "codex-security-target-v1", base: { head: baseHead, tree: tree(baseHead) }, target: { head: targetHead, tree: tree(targetHead) }, changedPaths: paths, files, policySha256: sha256(read(policy)), threatSha256: sha256(read(threat)), worklistSha256: sha256(read(worklist)) };
    descriptor.repositorySnapshotDigest = sha256({ base: descriptor.base, target: descriptor.target, files, policySha256: descriptor.policySha256, threatSha256: descriptor.threatSha256, worklistSha256: descriptor.worklistSha256 });
    return { ok: true, descriptor };
  } catch { return { ok: false, findings: ["CODEX_SECURITY_TARGET_UNRESOLVED"] }; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const values = Object.fromEntries(process.argv.slice(2).map((item) => item.match(/^--(base|target)=(.+)$/u)).filter(Boolean).map(([, key, value]) => [key, value]));
  const result = targetDescriptor(values); emit("assurance:codex-security-target", result.ok, result.ok ? result.descriptor : { findings: result.findings });
}
