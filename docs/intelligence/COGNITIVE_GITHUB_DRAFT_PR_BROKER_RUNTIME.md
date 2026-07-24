# Cognitive GitHub Draft-PR Broker Runtime

Status: `SOURCE_READY_FAIL_CLOSED`

The `cognitive-github-draft-pr-broker` Edge Function is a closed, server-only
GitHub path for three Level 0/1 canaries:

- `documentation_draft_pr`
- `test_only_draft_pr`
- `low_risk_source_draft_pr`

It cannot merge, release, deploy, delete a branch, write a tag, edit a workflow,
force-push, bypass a protected branch, administer the repository, access
repository secrets, or write `main`. There is no handler action or GitHub API
route for any of those operations. A model never receives the installation
token.

## Exact provider scope

Install a dedicated GitHub App only on
`Chillywood2025/chillywood-mobile`, with:

| GitHub repository permission | Level |
|---|---|
| Metadata | Read |
| Contents | Read and write |
| Pull requests | Read and write |

All organization and account permissions stay unset. All other repository
permissions stay unset, including Actions, Administration, Deployments,
Environments, Packages, Secrets, and Workflows. Do not subscribe to webhooks.
Do not enable user authorization.

GitHub does not expose separate create-only permissions for pull requests or a
provider-level `deny merge` permission. Pull-request write permission is
therefore confined by the broker's closed operation set: it calls only the
create-draft endpoint and verifies `draft=true`, `merged=false`, the exact head,
and the exact non-default base. Branch protection remains required defense in
depth. This runtime does not claim that the raw installation token is
provider-structurally incapable of every pull-request write.

Primary provider references:

- [Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Create an installation access token](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app)
- [Create a draft pull request](https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request)
- [Create a Git reference](https://docs.github.com/en/rest/git/refs#create-a-reference)

Installation tokens are requested for the one repository and only the
`contents:write` and `pull_requests:write` permission subset. The response must:

- contain exactly that repository;
- contain no permission beyond Metadata, Contents, and Pull requests;
- expire in no more than 65 minutes;
- match the reviewed repository numeric identity;
- match the reviewed scope-manifest hash.

The credential stays server-side. Presence is reported only as `PRESENT` or
`MISSING`.

## Closed mutation path

Every execution requires, in this order:

1. JWT-required Edge Function gateway authentication.
2. A distinct broker invocation secret.
3. The `cognitive_github_draft_pr_broker` service identity.
4. A live, decision-bound, Owner-approved capability.
5. An exact branch lease.
6. An exact canary key, branch, path class, byte cap, call ID, plan hash, and
   approval-scope hash.
7. An immutable trusted-runner preflight receipt for the exact content and
   required-test hash.
8. Atomic database capability consumption before any GitHub mutation.
9. A fresh installation token with exact repository/permission readback.
10. One exact file and one new `codex/cognitive-canary/*` branch.
11. A draft PR based on `codex/cognitive-level01-operationalization`.
12. An immutable trusted-tool result before the result is accepted.
13. Independent evaluation before a canary can pass.

The function never accepts a merge field, arbitrary base branch, existing
branch update, file deletion, multiple-file tree, or caller-authored GitHub
endpoint.

Allowed paths are deliberately disjoint:

- documentation: `docs/intelligence/canaries/*.md`;
- tests: `scripts/cognitive-canaries/*.{mjs,ts}`;
- low-risk source:
  `src/**/*.{ts,tsx,js,jsx}`, `components/**/*.{ts,tsx,js,jsx}`, or
  `app/**/*.{ts,tsx,js,jsx}`.

Documentation and test canaries require a path that does not exist on the base
branch. A low-risk source canary requires an existing base-branch file, so it
cannot smuggle a new runtime component into the repository.

Native, migration, workflow, auth/RLS, role, money, payout, release, secret,
package-manifest, lockfile, and parent-traversal paths are denied.

Each GitHub request has a ten-second timeout. A canary uses a fixed maximum of
ten provider calls, no automatic retries, one file, 12 KiB for documentation
or 32 KiB for test/source content, and zero paid-provider budget.

If GitHub accepts a branch but the audit receipt fails, the broker reports
`github_audit_record_rejected_external_branch_quarantined`. It does not delete
the branch because branch deletion is outside its authority.

## Required forward database contract

The deployed control plane registers the generic
`capability_and_tool_broker`; it does not yet register the narrower
`cognitive_github_draft_pr_broker`. Giving the GitHub runtime the generic
broker token would violate least privilege.

Before deployment, a reviewed forward-only migration must:

- register `cognitive_github_draft_pr_broker` with revocation and expiry;
- add
  `cognitive_consume_github_draft_pr_capability(...)`, restricted to repository
  `Chillywood2025/chillywood-mobile`, provider `github`, operation
  `github_open_draft_pr`, the exact canary branch grammar, and an exact write
  lease, and requiring a passing trusted preflight receipt for the exact
  content hash and required-test hash;
- add `cognitive_record_github_draft_pr_provider_readback(...)`, producing only
  a GitHub draft-PR provider readback/evidence pair;
- add `cognitive_accept_github_draft_pr_tool_result(...)`, delegating only after
  the capability event exists and the exact service token passes;
- revoke all three RPCs from `public`, `anon`, and `authenticated`;
- grant execution only to `service_role`;
- add pgTAP, concurrency, replay, revocation, expiry, RLS, and real HTTP tests.

Until that reviewed contract and the GitHub App credential both exist, the
runtime returns `GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED` or
`GITHUB_DRAFT_PR_BROKER_IDENTITY_REQUIRED`. The draft-PR switch remains off and
no canary mutation is attempted.

## Current operational result

The exact repository-specific GitHub App credential is missing. The development
user's broad `gh` credential is not an acceptable substitute and was not used.
No branch, commit, PR, merge, release, provider configuration, or remote
credential was created by this lane.
