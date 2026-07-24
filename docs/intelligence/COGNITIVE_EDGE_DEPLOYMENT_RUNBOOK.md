# Cognitive Edge Deployment Runbook

Status: prepared only. This document is not deployment authorization.

This runbook covers the exact reviewed Edge source at and after
`a596478bef99d59d4c51f25ecee12a5864cb08a9`. It must be executed only from the
coordinator's frozen continuation head after the independent exact-head review
reports P0=0 and P1=0 and the real two-party HTTP suite passes.

## Current Supabase guidance checked

The preparation lane checked the current Supabase changelog and Edge
documentation on 2026-07-23. Relevant facts:

- `supabase functions deploy --use-api` supports imports outside the
  `supabase/` directory. The cognitive functions import reviewed files from
  repository-root `_lib/` and `config/`, so this deployment path is required.
- Function JWT policy comes from `supabase/config.toml`; the platform default is
  `verify_jwt=true` when a function has no explicit entry.
- Function secrets may be uploaded with `supabase secrets set --env-file`.
- Setting a hosted Edge secret does not require a function redeployment.
- Hosted nested Edge-to-Edge calls are rate limited. The reviewed worker and
  evaluator are invoked as separate principals; do not replace that chain with
  recursive calls from one function.

No relevant Edge deployment breaking change was found for this hosted project.
The 2026 Envoy gateway change is self-hosted-only and does not apply.

## Exact function plan

| Function | JWT setting | Authentication inside handler | Why included |
| --- | --- | --- | --- |
| `cognitive-governance-control` | explicit `true` | caller JWT plus exact Owner/read-scope checks | reviewed cognitive control source |
| `cognitive-owner-approval` | explicit `true` | authenticated caller client using `SUPABASE_ANON_KEY` | immutable exact-Owner approval |
| `cognitive-approved-action-worker` | explicit `true` | worker invocation hash plus separate worker assertion and service role | claim/stage/complete worker |
| `cognitive-independent-evaluator` | default `true` | evaluator invocation hash plus separate evaluator assertion and service role | immutable evaluator proof only |
| `autonomous-approval-request` | explicit `false` | Owner bearer or separate internal hashed broker token | reviewed product-intelligence emergency allowlist change |

Do not pass `--no-verify-jwt` to any deployment. The autonomous request function
is the only function in this set with `verify_jwt=false`, and it authenticates
inside the handler.

## Exact server secret names

Required for worker/evaluator activation:

- `COGNITIVE_APPROVED_ACTION_WORKER_INVOKE_SHA256`
- `COGNITIVE_APPROVED_ACTION_WORKER_ASSERTION`
- `COGNITIVE_INDEPENDENT_EVALUATOR_INVOKE_SHA256`
- `COGNITIVE_INDEPENDENT_EVALUATOR_ASSERTION`

Separate broker proof supported by the changed autonomous request source:

- `AUTONOMOUS_APPROVAL_REQUEST_TOKEN_SHA256`

The broker endpoint also recognizes the pre-existing server-only
`OPS_APPROVAL_TOKEN` fallback. Do not rotate, overwrite, or remove either
pre-existing value merely to deploy this source. First run the sanitized remote
presence check. Generate and install the separate broker candidate only when
the hashed broker secret is missing and the coordinator authorizes that exact
change.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Do not copy those values into
the generated secret files.

## Safe preparation

The helper is deliberately read-only with respect to Supabase. It can audit
source, generate owner-only local candidate material, and sanitize remote list
responses. It contains no remote secret-write or deployment operation.

```sh
node scripts/cognitive-edge-deployment-prep.mjs audit-source
node scripts/cognitive-edge-deployment-prep.mjs self-test
```

Choose a new absolute directory outside every Git worktree. Its parent must
already be Owner-controlled. The helper refuses a path inside the current
repository, creates a mode-700 directory, creates mode-600 files, and refuses
to overwrite any existing path:

```sh
node scripts/cognitive-edge-deployment-prep.mjs generate-secrets \
  --output-dir /private/owner-only/cognitive-edge-activation \
  --include-broker
```

Output is restricted to `PRESENT`, `MISSING`, `MATCH`, and `MISMATCH`. The
generated files are:

- `supabase-edge-secrets.env`: hosted Edge values; it contains only invocation
  hashes, plaintext server assertions, and the optional broker hash.
- `cognitive-invocation-secrets.env`: raw invocation proofs for the distinct
  trusted callers.
- `cognitive-owner-registration.env`: worker/evaluator assertion hashes for the
  exact Owner registration requests.

Never source, print, copy into a shell command line, log, commit, or attach these
files. Load named values programmatically. Delete plaintext candidate material
after hosted-secret storage, Owner registration, caller-secret storage, and
MATCH verification are complete.

## Pre-authorization checks

Use the public production project reference already established by the
repository runbooks:

```sh
node scripts/cognitive-edge-deployment-prep.mjs remote-presence \
  --project-ref bmkkhihfbmsnnmcqkoly
node scripts/cognitive-edge-deployment-prep.mjs remote-functions \
  --project-ref bmkkhihfbmsnnmcqkoly
```

The helpers discard secret digests and all unrecognized metadata. Presence
prints only `PRESENT` or `MISSING`. Function readback prints only function name,
status, and numeric version.

Before authorization, also require:

1. Frozen coordinator HEAD equals the exact reviewed HEAD.
2. The working tree has no tracked or untracked deployment-source changes.
3. `deno.lock` remains untracked and unstaged.
4. No generated `android/` or `ios/` directory is tracked.
5. The five deployed migration files are byte-identical to reviewed history.
6. Full required source, HTTP, pgTAP, and CI checks pass.
7. Review P0=0 and P1=0.
8. A rollback record contains the current remote function versions.

Do not link a worktree, set a secret, or deploy before all eight checks pass.

## Authorized secret storage

This section is executable only after the coordinator explicitly authorizes the
frozen reviewed head and exact production project. Use the CLI-discovered
syntax, never `--debug`, and never put a secret value on the command line:

```sh
supabase secrets set \
  --env-file /private/owner-only/cognitive-edge-activation/supabase-edge-secrets.env \
  --project-ref bmkkhihfbmsnnmcqkoly
```

If the broker secret was already present, use a separately prepared env file
containing only the four worker/evaluator names. Never overwrite the broker
secret accidentally.

Immediately rerun `remote-presence`. A remote name being `PRESENT` is not proof
that its value is correct. MATCH requires bounded authenticated negative and
positive invocation probes plus successful database assertion registration.
Never compare by printing digests.

## Authorized deployment

The observed local CLI is 2.75.0 and supports `--use-api`; its own update check
reports a newer release. Re-run `supabase functions deploy --help` immediately
before deployment. Use a deliberately pinned, reviewed CLI version if the
operator upgrades. Do not edit `package.json` or a lockfile as part of this
lane.

Deploy one exact function at a time so each result and rollback target is
recorded. Do not use `--prune`, `--no-verify-jwt`, `--debug`, or an all-functions
deployment:

```sh
supabase functions deploy cognitive-governance-control \
  --project-ref bmkkhihfbmsnnmcqkoly --use-api
supabase functions deploy cognitive-owner-approval \
  --project-ref bmkkhihfbmsnnmcqkoly --use-api
supabase functions deploy cognitive-approved-action-worker \
  --project-ref bmkkhihfbmsnnmcqkoly --use-api
supabase functions deploy cognitive-independent-evaluator \
  --project-ref bmkkhihfbmsnnmcqkoly --use-api
supabase functions deploy autonomous-approval-request \
  --project-ref bmkkhihfbmsnnmcqkoly --use-api
```

After every command, rerun the sanitized function readback and record the new
numeric version. Stop the remaining deployment if a function is not ACTIVE or
if the version does not advance as expected.

## Authority and response verification

Static preparation verifies:

- Owner endpoint does not reference `SUPABASE_SERVICE_ROLE_KEY`, claim, or
  execute.
- Worker references only its invocation hash/assertion and cannot record Owner
  approval or evaluator proof.
- Evaluator references only its invocation hash/assertion and cannot claim,
  execute, or complete.
- Governance control rejects legacy direct Owner and direct service writes.
- Worker and evaluator CORS allowlists contain only their respective internal
  invocation header.
- Reviewed endpoints contain no console logging and return fixed error codes
  rather than exception messages or stacks.

Remote proof still must verify:

1. OPTIONS returns only the reviewed CORS headers.
2. Missing/malformed JWT is denied where JWT is required.
3. Owner endpoint denies anon, normal user, scoped Admin, worker, and evaluator.
4. Owner endpoint accepts only the exact Owner approval request.
5. Worker denies missing/wrong invocation proof and cannot approve or evaluate.
6. Evaluator denies missing/wrong invocation proof and cannot claim, execute, or
   complete.
7. Worker assertion is registered only for worker operations; evaluator
   assertion is registered only for `independent_evaluation`.
8. Errors contain no raw database message, request header, token, assertion,
   service-role value, stack, URL, private payload, or signed identifier.
9. Logs contain no secret or request body.
10. Staged state remains non-live until the separate matching evaluator proof
    exists and the worker completes.

## Rollback

Secret rollback and function rollback are separate:

- Preserve the pre-deploy function versions and reviewed source archives
  outside Git before deploying. If an endpoint fails verification, redeploy the
  exact preceding reviewed source/version with its original JWT policy.
- If a newly generated assertion must be withdrawn, the exact Owner calls
  `governance_revoke_two_party_service_principal` for that one identity. Do not
  delete audit, approval, execution, evaluator-proof, finding, or lifecycle
  rows.
- Remove a newly added hosted secret only after the corresponding principal is
  revoked and no in-flight cleanup depends on it. Never remove a pre-existing
  broker or fallback token as part of this activation.
- Keep all cognitive switches false during rollback. User-derived memory and
  Level 2 production repair remain false.

Stop immediately for authority crossover, replay success, early live mutation,
secret exposure, unexpected migration drift, P0/P1, or unsafe rollback state.
