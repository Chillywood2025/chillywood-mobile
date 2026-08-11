#!/usr/bin/env node
import { emit, git, sha256 } from "./lib.mjs";

const gitSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
const digest = (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const safePath = (value) => typeof value === "string"
  && value.length > 0
  && !value.startsWith("/")
  && !/[\u0000-\u001f\u007f]/u.test(value)
  && !value.split("/").some((part) => !part || part === "." || part === "..");
const safeRef = (value) => typeof value === "string"
  && /^(?!-)[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u.test(value)
  && !value.includes("..")
  && !value.includes("@{")
  && !value.endsWith("/")
  && !value.endsWith(".");

function repositorySlug(remoteUrl) {
  if (typeof remoteUrl !== "string") return null;
  const match = remoteUrl.trim().match(/github\.com(?::|\/)([^/]+)\/([^/]+?)(?:\.git)?$/u);
  return match ? `${match[1]}/${match[2]}` : null;
}

function resolve(value, runGit) {
  return runGit(["rev-parse", "--verify", `${value}^{commit}`]);
}

function tree(value, runGit) {
  return runGit(["rev-parse", "--verify", `${value}^{tree}`]);
}

function blob(commit, file, runGit) {
  return runGit(["rev-parse", "--verify", `${commit}:${file}`]);
}

function targetText(commit, file, runGit) {
  return runGit(["show", `${commit}:${file}`]);
}

function changedPathRows(baseHead, targetHead, runGit) {
  const raw = runGit(["diff", "--no-ext-diff", "--name-status", "--no-renames", "-z", `${baseHead}..${targetHead}`]);
  const tokens = raw.split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  if (tokens.length % 2 !== 0) throw new Error("malformed changed-path worklist");
  const rows = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const status = tokens[index];
    const file = tokens[index + 1];
    if (!/^[AMDT]$/u.test(status) || !safePath(file)) throw new Error("unsafe changed-path worklist");
    rows.push({
      status,
      path: file,
      beforeBlob: status === "A" ? null : blob(baseHead, file, runGit),
      afterBlob: status === "D" ? null : blob(targetHead, file, runGit),
    });
  }
  rows.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  if (rows.length === 0 || new Set(rows.map(({ path }) => path)).size !== rows.length) {
    throw new Error("empty or duplicate changed-path worklist");
  }
  if (!rows.every(({ beforeBlob, afterBlob }) => (beforeBlob === null || gitSha(beforeBlob)) && (afterBlob === null || gitSha(afterBlob)))) {
    throw new Error("invalid changed-path blob identity");
  }
  return rows;
}

export function repositorySnapshotDigest(descriptor) {
  return sha256({
    schemaVersion: descriptor.schemaVersion,
    kind: descriptor.kind,
    repository: descriptor.repository,
    base: descriptor.base,
    target: descriptor.target,
    changedPaths: descriptor.changedPaths,
    changedPathWorklistSha256: descriptor.changedPathWorklistSha256,
    contractHashes: descriptor.contractHashes,
  });
}

export function targetDescriptor({
  base = "origin/main",
  target = "HEAD",
  expectedRepository = "Chillywood2025/chillywood-mobile",
  policy = "config/assurance/codex-security-reliability-s0-v1.json",
  threat = "config/assurance/escaped-defect-catalog-v1.json",
  featureRegistry = "config/assurance/feature-registry-v1.json",
  runGit = git,
} = {}) {
  try {
    if (!safeRef(base) || !safeRef(target)) throw new Error("unsafe revision");
    const originUrl = runGit(["remote", "get-url", "origin"]);
    const observedRepository = repositorySlug(originUrl);
    if (observedRepository !== expectedRepository) throw new Error("repository mismatch");
    for (const file of [policy, threat, featureRegistry]) if (!safePath(file)) throw new Error("unsafe contract path");

    const baseHead = resolve(base, runGit);
    const targetHead = resolve(target, runGit);
    const changedPaths = changedPathRows(baseHead, targetHead, runGit);
    if (![baseHead, targetHead].every(gitSha)) throw new Error("commit identity");

    const descriptor = {
      schemaVersion: 1,
      kind: "codex-security-target-v1",
      repository: {
        slug: observedRepository,
        originUrlSha256: sha256(`https://github.com/${observedRepository}.git`),
      },
      base: { ref: base, head: baseHead, tree: tree(baseHead, runGit) },
      target: { ref: target, head: targetHead, tree: tree(targetHead, runGit) },
      changedPaths,
      changedPathWorklistSha256: sha256(changedPaths),
      contractHashes: {
        policySha256: sha256(targetText(targetHead, policy, runGit)),
        threatSha256: sha256(targetText(targetHead, threat, runGit)),
        featureRegistrySha256: sha256(targetText(targetHead, featureRegistry, runGit)),
      },
    };
    if (![descriptor.base.tree, descriptor.target.tree].every(gitSha)
      || !Object.values(descriptor.contractHashes).every(digest)) throw new Error("descriptor hash");
    descriptor.repositorySourceSnapshotDigest = repositorySnapshotDigest(descriptor);
    return { ok: true, descriptor };
  } catch {
    return { ok: false, findings: ["CODEX_SECURITY_TARGET_UNRESOLVED"] };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = process.argv.slice(2).map((item) => item.match(/^--(base|target)=(.+)$/u));
  const keys = parsed.map((value) => value?.[1]);
  const result = parsed.length === keys.filter(Boolean).length && new Set(keys).size === keys.length
    ? targetDescriptor(Object.fromEntries(parsed.map(([, key, value]) => [key, value])))
    : { ok: false, findings: ["CODEX_SECURITY_TARGET_OPTIONS_INVALID"] };
  emit("assurance:codex-security-target", result.ok, result.ok ? result.descriptor : { findings: result.findings });
}
