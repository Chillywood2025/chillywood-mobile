# Cognitive GitHub Draft-PR Broker Runtime

Status: `PROVIDER_RULESET_READY_APP_SUDO_PENDING`

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
therefore confined by both the broker's closed operation set and an active
repository ruleset. The broker calls only the create-draft endpoint and verifies
`draft=true`, `merged=false`, the exact head, and the exact non-default base.
The provider proof is not a boolean supplied by the caller: the isolated
adapter validates the exact repository, installation, permission manifest,
base branch, active ruleset, empty bypass set, required checks, human approval
rule, and a real App-token merge denial. Until that complete proof exists, the
broker remains fail-closed.

The current `main-pr-review-protection` ruleset is active on `main`, has no
bypass actors, disables force pushes and branch deletion, requires one fresh
approval after the latest push, and requires all 13 established Phase 1 CI
checks with strict branch freshness. The repository has one direct
write-capable collaborator, `Chillywood2025`, so the one-approval rule is
effectively Owner-only. Its canonical ruleset hash is
`b16e03fd7f15c9bd871b119ddcc8ae9bbe346270e014fb2f89c6e7a2da319dc4`;
the canonical direct-collaborator proof hash is
`8d08f33a949274a6962fc5b1cbe3d4ed2eed17f73771c06824d6d235cde502f0`.
The future GitHub App must remain absent from every bypass list.

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
8. A fresh installation token with exact repository/permission readback.
9. The runtime installation fingerprint and immutable least-privilege
   scope-manifest hash must exactly match the current Owner-accepted
   attestation and the credential identity stamped onto the capability.
10. Read-only verification that the approved base commit and prior file/blob
   state still match.
11. Atomic database capability consumption, locked approval liveness, and an
    approval target hash over that exact source state before any GitHub
    mutation.
12. One exact file and one new `codex/cognitive-canary/*` branch.
13. A draft PR based on `codex/cognitive-level01-operationalization`.
14. An immutable trusted-tool result with locked approval liveness before the
    result is accepted.
15. Independent evaluation before a canary can pass.

The plan snapshot is not a caller-selected opaque label. It is the
domain-separated SHA-256 contract over the exact repository, canary, base
branch and commit, target branch, path, prior-state hash, content hash, title
hash, commit-message hash, deterministic PR-body hash, required-tests hash,
task, project, and approval scope. The Edge runtime derives these values from
the actual request. The database recomputes the same contract while holding
the capability lock and requires it to equal both the capability and approved
execution plan snapshot. Any content, title, commit message, PR body, path,
base, prior state, branch, or tests substitution fails before mutation.

The accepted credential binding stores only the safe installation identity
fingerprint, the reviewed scope-manifest hash
`ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554`,
the immutable attestation ID, and its expiry. It never hashes or stores the
private key or installation token. A newer accepted installation attestation,
fingerprint change, scope change, revocation, or expiry invalidates an older
capability; a new Owner-approved capability is required.

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

Native, migration, workflow, auth/RLS, role, rights, money, payment, payout,
pricing, provider, entitlement, moderation, ranking, legal, release, secret,
package-manifest, lockfile, and parent-traversal directories and filenames are
denied. Content, title, commit message, path, and branch are screened through
the canonical secret/private/authority classifier; provider-key, JWT, and
unlabeled high-entropy credential forms are rejected before persistence.

Each GitHub request has a ten-second timeout. A canary uses a fixed maximum of
ten provider calls, no automatic retries, one file, 12 KiB for documentation
or 32 KiB for test/source content, and zero paid-provider budget.

If GitHub accepts a branch but the audit receipt fails, the broker reports
`github_audit_record_rejected_external_branch_quarantined`. It does not delete
the branch because branch deletion is outside its authority.

## Forward database contract

The deployed control plane registers the generic
`capability_and_tool_broker`; it does not yet register the narrower
`cognitive_github_draft_pr_broker`. Giving the GitHub runtime the generic
broker token would violate least privilege.

The undeployed forward-only migration:

- registers `cognitive_github_draft_pr_broker` with revocation and expiry;
- adds
  `cognitive_consume_github_draft_pr_capability(...)`, restricted to repository
  `Chillywood2025/chillywood-mobile`, provider `github`, operation
  `github_open_draft_pr`, the exact canary branch grammar, and an exact write
  lease, exact approved base commit and prior blob state, and a passing trusted
  preflight receipt for the exact content hash and required-test hash;
- adds an immutable authorization-to-plan binding containing only canonical
  hashes for content, title, commit message, deterministic body, path, base,
  prior state, branch, repository, tests, and accepted credential identity;
- binds every newly issued GitHub capability to the current Owner-accepted
  installation fingerprint and exact permission-scope manifest, then
  revalidates that binding at consumption and postflight;
- adds `cognitive_record_github_draft_pr_provider_readback(...)`, producing only
  a GitHub draft-PR provider readback/evidence pair;
- adds `cognitive_accept_github_draft_pr_tool_result(...)`, delegating only after
  the capability event exists and the exact service token passes;
- locks Owner-approval liveness during both capability consumption and
  postflight;
- revokes all three RPCs from `public`, `anon`, and `authenticated`;
- grants execution only to `service_role`;
- adds pgTAP, concurrency, replay, revocation, expiry, RLS, and real HTTP tests.

Until that reviewed contract and the GitHub App credential both exist, the
runtime returns `GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED` or
`GITHUB_DRAFT_PR_BROKER_IDENTITY_REQUIRED`. The draft-PR switch remains off and
no canary mutation is attempted.

## Current operational result

The repository ruleset is provider-configured and independently readable. The
exact repository-specific GitHub App credential remains missing because GitHub
requires an interactive sudo-mode approval before registration. The
development user's broad `gh` credential is used only for bounded repository
administration and is not an acceptable runtime substitute. No canary branch,
canary PR, merge, release, installation token, or runtime private key exists
yet. The draft-PR switch remains off until the App is repository-selected, its
private key is stored only in the isolated GitHub Worker, and the App-only
merge-denial proof passes.
