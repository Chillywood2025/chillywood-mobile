#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const policy = JSON.parse(fs.readFileSync(new URL("config/ci/required-validation-v1.json", root), "utf8"));
const SHA = /^[0-9a-f]{40}$/u;
const REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
const stable = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());

const globRegex = (glob) => new RegExp(`^${glob
  .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
  .replaceAll("**", "\u0000")
  .replaceAll("*", "[^/]*")
  .replaceAll("\u0000", ".*")}$`, "u");

const matches = (path, patterns) => patterns.some((pattern) => globRegex(pattern).test(path));

export function computeValidationPlan(paths, config = policy) {
  const clean = [...new Set(paths.map((value) => String(value).trim()).filter(Boolean))].sort();
  const categories = Object.fromEntries(Object.keys(config.categories).map((key) => [key, false]));
  const reasons = Object.fromEntries(Object.keys(config.categories).map((key) => [key, []]));
  const unknown = [];

  for (const path of clean) {
    let recognized = matches(path, config.knownDocumentation);
    for (const [category, patterns] of Object.entries(config.categories)) {
      if (matches(path, patterns)) {
        categories[category] = true;
        reasons[category].push(path);
        recognized = true;
      }
    }
    if (!recognized) unknown.push(path);
  }

  if (unknown.length > 0 || clean.length === 0) {
    for (const category of Object.keys(categories)) categories[category] = true;
  }
  if (categories.policy) {
    categories.product = true;
    categories.sensitive = true;
    categories.database = true;
    categories.nativeRelease = true;
    categories.autonomous = true;
  }
  if (categories.autonomous) categories.database = true;
  if (categories.database || categories.nativeRelease || categories.autonomous) categories.sensitive = true;

  return {
    version: config.version,
    paths: clean,
    unknown,
    categories,
    reasons,
    conservative: unknown.length > 0 || clean.length === 0 || categories.policy,
  };
}

export function expectedJobs(plan, config = policy) {
  const expected = [config.jobs.plan, config.jobs.core, config.jobs.result];
  for (const [category, jobKey] of [["product", "product"], ["sensitive", "sensitive"], ["database", "database"], ["nativeRelease", "nativeRelease"], ["autonomous", "autonomous"], ["policy", "policy"]]) {
    if (plan.categories[category]) expected.push(config.jobs[jobKey]);
  }
  return expected;
}

function effectiveReviewStates(reviews, headSha) {
  const latest = new Map();
  for (const review of reviews) {
    if (!REVIEW_STATES.has(review.state) || review.commitId !== headSha || typeof review.user !== "string") continue;
    const submitted = Date.parse(review.submittedAt ?? "");
    const order = Number.isFinite(submitted) ? submitted : -1;
    const id = Number.isInteger(review.id) ? review.id : -1;
    const current = latest.get(review.user);
    if (!current || order > current.order || (order === current.order && id > current.id)) latest.set(review.user, { ...review, order, id });
  }
  return [...latest.values()];
}

export function evaluateRun({ baseRef, baseSha, headSha, paths, jobs, reviews = [], author, config = policy }) {
  const findings = [];
  if (baseRef !== config.baseBranch) findings.push("VALIDATION_BASE_BRANCH_INVALID");
  if (!SHA.test(baseSha ?? "")) findings.push("VALIDATION_BASE_SHA_INVALID");
  if (!SHA.test(headSha ?? "")) findings.push("VALIDATION_HEAD_SHA_INVALID");
  const plan = computeValidationPlan(paths, config);
  const required = expectedJobs(plan, config);
  const byName = new Map();
  for (const job of jobs) byName.set(job.name, [...(byName.get(job.name) ?? []), job]);
  for (const name of required) {
    const matches = byName.get(name) ?? [];
    if (matches.length === 0) findings.push(`VALIDATION_JOB_MISSING:${name}`);
    else if (matches.length !== 1) findings.push(`VALIDATION_JOB_CARDINALITY_INVALID:${name}`);
    const job = matches[0];
    if (!job) continue;
    else if (job.status !== "completed" || job.conclusion !== "success") findings.push(`VALIDATION_JOB_NOT_SUCCESSFUL:${name}`);
    else if (job.headSha && job.headSha !== headSha) findings.push(`VALIDATION_JOB_HEAD_INVALID:${name}`);
  }
  if (plan.categories.policy) {
    const current = effectiveReviewStates(reviews, headSha).filter((review) => review.user !== author
      && config.trustedReviewAssociations.includes(review.authorAssociation)
      && review.commitId === headSha);
    if (!current.some((review) => review.state === "APPROVED") || current.some((review) => review.state === "CHANGES_REQUESTED")) findings.push("VALIDATION_POLICY_REVIEW_REQUIRED");
  }
  return { ok: findings.length === 0, findings, plan, requiredJobs: required };
}

async function githubJson(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${path}`);
  return response.json();
}

async function githubPages(path, token) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await githubJson(`${path}${separator}per_page=100&page=${page}`, token);
    if (!Array.isArray(batch)) throw new Error(`GITHUB_API_EXPECTED_ARRAY:${path}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

async function githubJobPages(path, token) {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const response = await githubJson(`${path}?per_page=100&page=${page}`, token);
    if (!response || !Array.isArray(response.jobs)) throw new Error(`GITHUB_API_EXPECTED_JOBS:${path}`);
    jobs.push(...response.jobs);
    if (response.jobs.length < 100) return jobs;
  }
}

export function evaluateWorkflowSnapshot({ repository, run, pull, files, runJobs, reviews }) {
  if (run.event !== "pull_request" || run.name !== policy.workflowName || run.path !== policy.workflowPath
    || run.status !== "completed" || run.conclusion !== "success") throw new Error("VALIDATION_WORKFLOW_RUN_INVALID");
  const pulls = Array.isArray(run.pull_requests) ? run.pull_requests : [];
  if (pulls.length !== 1) throw new Error("VALIDATION_PULL_REQUEST_IDENTITY_INVALID");
  const runPull = pulls[0];
  const prNumber = runPull.number;
  if (pull.number !== prNumber) throw new Error("VALIDATION_PULL_REQUEST_IDENTITY_INVALID");
  if (pull.state !== "open" || pull.base.repo.full_name !== repository || pull.base.ref !== policy.baseBranch) throw new Error("VALIDATION_PULL_REQUEST_STATE_INVALID");
  if (pull.head.sha !== run.head_sha || runPull.head?.sha !== run.head_sha) throw new Error("VALIDATION_WORKFLOW_HEAD_STALE");
  if (runPull.base?.ref !== policy.baseBranch || runPull.base?.sha !== pull.base.sha) throw new Error("VALIDATION_WORKFLOW_BASE_STALE");
  if (files.length !== pull.changed_files) throw new Error("VALIDATION_CHANGED_PATHS_INCOMPLETE");
  const result = evaluateRun({
    baseRef: pull.base.ref,
    baseSha: pull.base.sha,
    headSha: pull.head.sha,
    paths: files.flatMap((file) => [file.filename, file.previous_filename]).filter(Boolean),
    jobs: runJobs.map((job) => ({ name: job.name, status: job.status, conclusion: job.conclusion, headSha: run.head_sha })),
    reviews: reviews.map((review) => ({ id: review.id, state: review.state, authorAssociation: review.author_association, user: review.user?.login, commitId: review.commit_id, submittedAt: review.submitted_at })),
    author: pull.user.login,
  });
  return { ...result, prNumber, headSha: pull.head.sha, repository };
}

export async function evaluateWorkflowRun({ repository, runId, token }) {
  const [owner, repo] = repository.split("/");
  const run = await githubJson(`/repos/${owner}/${repo}/actions/runs/${runId}`, token);
  const pulls = Array.isArray(run.pull_requests) ? run.pull_requests : [];
  if (pulls.length !== 1) throw new Error("VALIDATION_PULL_REQUEST_IDENTITY_INVALID");
  const prNumber = pulls[0].number;
  const [pull, files, runJobs, reviews] = await Promise.all([
    githubJson(`/repos/${owner}/${repo}/pulls/${prNumber}`, token),
    githubPages(`/repos/${owner}/${repo}/pulls/${prNumber}/files`, token),
    githubJobPages(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, token),
    githubPages(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, token),
  ]);
  return evaluateWorkflowSnapshot({ repository, run, pull, files, runJobs, reviews });
}

async function publishCheck({ repository, token, result, detailsUrl }) {
  const [owner, repo] = repository.split("/");
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/check-runs`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({
      name: policy.requiredCheckName,
      head_sha: result.headSha,
      status: "completed",
      conclusion: result.ok ? "success" : "failure",
      details_url: detailsUrl,
      output: {
        title: result.ok ? "Required validation passed" : "Required validation blocked",
        summary: JSON.stringify({ plan: result.plan.categories, requiredJobs: result.requiredJobs, findings: result.findings }, null, 2).slice(0, 65000),
      },
    }),
  });
  if (!response.ok) throw new Error(`CHECK_PUBLISH_${response.status}`);
  return response.json();
}

const base64url = (value) => Buffer.from(value).toString("base64url");

function appJwt(clientId, privateKey) {
  if (typeof clientId !== "string" || !clientId || typeof privateKey !== "string" || !privateKey.includes("PRIVATE KEY")) throw new Error("VALIDATION_PUBLISHER_CREDENTIAL_INPUT_INVALID");
  const key = privateKey.replace(/\\n/gu, "\n");
  const now = Math.floor(Date.now() / 1000);
  const input = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: clientId }))}`;
  return { jwt: `${input}.${crypto.sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`, key };
}

export function validatePublisherAppIdentity({ repository, app, installation, repositories, expected = policy.publisherApp }) {
  const findings = [];
  if (app?.id !== expected.integrationId || app?.client_id !== process.env[expected.clientIdVariable]
    || app?.owner?.login !== expected.owner || app?.slug !== expected.slug) findings.push("VALIDATION_PUBLISHER_APP_IDENTITY_INVALID");
  if (stable(app?.permissions) !== stable(expected.permissions)) findings.push("VALIDATION_PUBLISHER_APP_PERMISSIONS_INVALID");
  if (installation?.id !== Number(process.env[expected.installationIdVariable]) || installation?.app_id !== expected.integrationId
    || installation?.account?.login !== expected.owner || installation?.repository_selection !== expected.repositorySelection
    || installation?.suspended_at != null || stable(installation?.permissions) !== stable(expected.permissions)) findings.push("VALIDATION_PUBLISHER_INSTALLATION_INVALID");
  if (repositories?.total_count !== 1 || !Array.isArray(repositories?.repositories) || repositories.repositories.length !== 1
    || repositories.repositories[0]?.full_name !== repository) findings.push("VALIDATION_PUBLISHER_REPOSITORY_SCOPE_INVALID");
  return { ok: findings.length === 0, findings };
}

async function publisherToken(repository) {
  const expected = policy.publisherApp;
  const privateKey = process.env[expected.privateKeySecret];
  const clientId = process.env[expected.clientIdVariable];
  const { jwt, key } = appJwt(clientId, privateKey);
  const fingerprint = crypto.createHash("sha256").update(crypto.createPublicKey(key).export({ type: "spki", format: "der" })).digest("hex");
  if (fingerprint !== process.env[expected.keyFingerprintVariable]) throw new Error("VALIDATION_PUBLISHER_KEY_FINGERPRINT_INVALID");
  const installationId = Number(process.env[expected.installationIdVariable]);
  if (!Number.isInteger(installationId) || installationId < 1) throw new Error("VALIDATION_PUBLISHER_INSTALLATION_ID_INVALID");
  const [app, installation] = await Promise.all([
    githubJson("/app", jwt),
    githubJson(`/app/installations/${installationId}`, jwt),
  ]);
  const [owner, repo] = repository.split("/");
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ repositories: [repo], permissions: { checks: "write" } }),
  });
  if (!response.ok) throw new Error(`VALIDATION_PUBLISHER_TOKEN_${response.status}`);
  const access = await response.json();
  if (typeof access?.token !== "string" || !access.token || stable(access.permissions) !== stable(expected.permissions)) throw new Error("VALIDATION_PUBLISHER_TOKEN_INVALID");
  try {
    const repositories = await githubJson("/installation/repositories?per_page=100&page=1", access.token);
    const identity = validatePublisherAppIdentity({ repository: `${owner}/${repo}`, app, installation, repositories, expected });
    if (!identity.ok) throw new Error(identity.findings.join(","));
    return access.token;
  } catch (error) {
    await fetch("https://api.github.com/installation/token", { method: "DELETE", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${access.token}`, "X-GitHub-Api-Version": "2022-11-28" } });
    throw error;
  }
}

async function revokePublisherToken(token) {
  const response = await fetch("https://api.github.com/installation/token", { method: "DELETE", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" } });
  if (!response.ok && response.status !== 204) throw new Error(`VALIDATION_PUBLISHER_TOKEN_REVOKE_${response.status}`);
}

function localChangedPaths(base) {
  return execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`], { cwd: fileURLToPath(root), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=") || true];
  }));
  if (args.plan) {
    const plan = computeValidationPlan(localChangedPaths(String(args.base || "origin/main")));
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${Object.entries(plan.categories).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
    return;
  }
  if (args.publish) {
    const repository = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_READ_TOKEN;
    const runId = process.env.SOURCE_RUN_ID;
    if (!repository || !token || !runId) throw new Error("VALIDATION_PUBLISH_CONTEXT_MISSING");
    const result = await evaluateWorkflowRun({ repository, runId, token });
    const appToken = await publisherToken(repository);
    try {
      await publishCheck({ repository, token: appToken, result, detailsUrl: `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}` });
    } finally {
      await revokePublisherToken(appToken);
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new Error("USAGE: --plan [--base=<ref>] | --publish");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
