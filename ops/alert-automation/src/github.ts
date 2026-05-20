import type { OpsConfig } from "./config.js";

type GithubResult = Record<string, unknown>;

function requireGithub(config: OpsConfig): { owner: string; repo: string; token: string } {
  if (!config.githubToken) throw new Error("github_token_not_configured");
  if (!config.githubRepository || !config.githubRepository.includes("/")) {
    throw new Error("github_repository_not_configured");
  }

  const [owner, repo] = config.githubRepository.split("/", 2);
  if (!owner || !repo) throw new Error("github_repository_not_configured");
  return { owner, repo, token: config.githubToken };
}

async function githubFetch(
  config: OpsConfig,
  path: string,
  options: { body?: unknown; method: "GET" | "POST" }
): Promise<GithubResult> {
  const { owner, repo, token } = requireGithub(config);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    body: options.body == null ? undefined : JSON.stringify(options.body),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "chillywood-live-ops-fix-center",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    method: options.method
  });

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : `github_http_${response.status}`;
    throw new Error(`github_request_failed:${message}`);
  }

  return payload as GithubResult;
}

export async function createGithubIssue(
  config: OpsConfig,
  input: {
    body: string;
    labels?: string[];
    title: string;
  }
) {
  const issue = await githubFetch(config, "/issues", {
    body: {
      body: input.body,
      labels: input.labels ?? ["live-ops", "reliability"],
      title: input.title
    },
    method: "POST"
  });

  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    status: "created"
  };
}

export async function createGithubDraftPullRequest(
  config: OpsConfig,
  input: {
    body: string;
    headBranch: string;
    title: string;
  }
) {
  const pull = await githubFetch(config, "/pulls", {
    body: {
      base: config.githubDefaultBranch,
      body: input.body,
      draft: true,
      head: input.headBranch,
      maintainer_can_modify: true,
      title: input.title
    },
    method: "POST"
  });

  return {
    pullNumber: pull.number,
    pullUrl: pull.html_url,
    status: "created_draft"
  };
}

export async function rerunGithubActionsJob(config: OpsConfig, jobId: string) {
  if (!/^[0-9]+$/.test(jobId)) {
    throw new Error("invalid_github_job_id");
  }

  await githubFetch(config, `/actions/jobs/${jobId}/rerun`, {
    method: "POST"
  });

  return {
    githubJobId: jobId,
    status: "rerun_requested"
  };
}
