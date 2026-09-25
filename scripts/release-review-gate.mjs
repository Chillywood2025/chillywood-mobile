#!/usr/bin/env node

export function evaluateReleaseReviewIssues(issues) {
  const findings = [];
  for (const issue of issues) {
    if (!issue || typeof issue !== "object" || !Number.isInteger(issue.number) || issue.state !== "open") findings.push("RELEASE_REVIEW_EVIDENCE_INVALID");
    else findings.push(`RELEASE_REVIEW_FINDINGS_OPEN:#${issue.number}`);
  }
  return { ok: findings.length === 0, findings };
}

async function listOpenIssues(repository, token) {
  const result = [];
  for (let page = 1; ; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${repository}/issues?state=open&labels=codex-review-late-sentinel&per_page=100&page=${page}`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new Error(`RELEASE_REVIEW_GITHUB_${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error("RELEASE_REVIEW_RESPONSE_INVALID");
    result.push(...batch.filter((item) => !item.pull_request));
    if (batch.length < 100) return result;
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error("RELEASE_REVIEW_GITHUB_CONTEXT_MISSING");
  const result = evaluateReleaseReviewIssues(await listOpenIssues(repository, token));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
