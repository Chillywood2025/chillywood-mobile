# Cognitive Level 0/1 live activation sprint report

Status: **PRE-DEPLOYMENT EXACT-SOURCE GATE IN PROGRESS**

This document records the source, local proof, and fail-closed runtime state at
the deployment gate. Remote activation is not claimed here. Deployment,
bootstrap, installed-product canaries, switch changes, and schedule changes
remain pending until exact-head review and CI pass.

## Sprint identity

- `SPRINT_STARTED_AT`: `2026-07-24T02:00:29Z`
- `SPRINT_DEADLINE_AT`: `2026-07-24T08:00:29Z`
- `ACTUAL_STARTING_HEAD`: `7d4e822c87d95594d11d7ee06d5e72e185abc8cc`
- continuation branch: `codex/cognitive-live-activation-finalize`
- continuation draft PR: `#24`
- stacked base: `codex/cognitive-activation-accelerated-closeout`
- latest reviewed runtime-source fix:
  `af2a4ca4967f0b68ebc9aa7178fd1c7eacad9995`

## Preservation and lineage

- PR `#21` reviewed head
  `a596478bef99d59d4c51f25ecee12a5864cb08a9` remains in ancestry.
- PR `#23` observed head
  `7d4e822c87d95594d11d7ee06d5e72e185abc8cc` remains in ancestry.
- PRs `#21`, `#22`, and `#23` were not modified.
- No deployed migration was edited, renamed, squashed, deleted, or reapplied.
- The five immutable migration file hashes still match preservation readback:
  - `20260723001845`: `e4e51a840d3e7e0f77a06dfe5b1f1042bc134f377d534e51f4885da5ecbf14c6`
  - `20260723160911`: `4d0705b4e32d5917fd0ab79123bfaacc11ccd186641abd29e1591449f2ae1b7a`
  - `20260723163359`: `304f1538ab295b7f96ea992000cb0d661fc6bb6f3ef16ca33604c40aec1af154`
  - `20260723184340`: `0631e2ea59304969734f04d64d67574829a36325d909a2b12404bc043f30f681`
  - `20260723203512`: `7ed2114cd1515b7201462be39578a160fea9772cbe533a519117f95f495de7c8`
- `deno.lock` remains untracked and unstaged.
- No generated Android or iOS directory was added. The only tracked Android
  paths remain the six pre-existing raw sound assets.

## Agent deliveries

| Lane | Branch | Integrated delivery | Result |
| --- | --- | --- | --- |
| Local Supabase and HTTP | `agent/cognitive-http-environment` | `316bbf85`, `9d0ee64f`, `097edb33`, `aee9841d` | isolated stack recovered; two-party 89/89 and required 40/40; zero-state bootstrap 57/57 and required 43/43 |
| Database concurrency | `agent/cognitive-database-concurrency-final` | `bc01397b`, `7186ccf6` | clean pgTAP 769/769; real parallel-session matrix 17/17 |
| Edge deployment prep | `agent/cognitive-edge-deployment-prep` | `faab1e71`, `127b84ca`, `5184dbc0`, `a1d257bf`, `af2a4ca4` | source audit/helper/runbook pass; zero-state Edge chain and bounded Owner validator complete; no deploy |
| Sentinel artifact | `agent/cognitive-sentinel-artifact` | `235f9b59`, `ec30c78c`, `e62c1c3f` | Android no artifact change; iOS binary required; input remains attested-unverified and cannot grant a pass |
| Provider/readiness | `agent/cognitive-provider-credential-readiness` | no-change proof | provider, runtime GitHub identity, approved accounts, and telemetry remain missing |
| Exact review | `agent/cognitive-final-exact-review` | review-only | implementation P1 findings fixed; final frozen-head result pending |

Only the coordinator integrated passing, non-overlapping deliveries. No agent
pushed directly to the continuation branch.

## Source corrections

One new forward-only migration was added:

- version:
  `20260724023712_cognitive_zero_state_two_party_bootstrap.sql`
- SHA-256:
  `9b378bdc19c8ce4fbfcf27434f2554b6b3fe0ac03033729d5271501a937d338d`

It adds a governed pre-task Owner/worker/evaluator bootstrap chain. Project,
task, switches, and schedules materialize atomically only after a matching
passed evaluator proof. All ten switches and all five schedules start off. The
legacy direct bootstrap RPC is revoked from public, anonymous,
authenticated, and service-role callers. No deployed migration was changed.

The Owner Edge function now uses an exact ten-key bootstrap schema with bounded
field formats and canonical branch-name classification. This avoids the
general nine-string permutation cost without bypassing the canonical policy.
Malformed, extra-key, unsafe-branch, secret-like, and authority-like inputs are
rejected. Other Owner actions continue through the general canonical
classifier.

The Edge secret helper rejects output paths in any Git worktree and rejects
symlink parents or targets. Sentinel availability inputs remain explicitly
unverified until an installed collector independently observes the product.

## Local proof

- Disposable local Supabase recovery: **PASS**
- Full pgTAP after clean reset: **769/769 PASS**
- Database parallel-session matrix: **17/17 PASS**
- Existing real two-party HTTP assertions: **89/89 PASS**
- Existing required HTTP scenarios: **40/40 PASS**
- Zero-state real bootstrap HTTP assertions: **57/57 PASS**
- Zero-state required bootstrap HTTP gate: **43/43 PASS**
- Canonical cognitive attacks: **40/40 PASS**
- Governance attacks: **33/33 PASS**
- Collective governance: **39/39 PASS**
- Hardening variants: **104/104 PASS**
- Runtime authority: **11/11 PASS**
- Policy parity: **20/20 plus 256 fixed-seed PASS**
- Two-party source contract: **PASS**
- Bootstrap Edge contract: **PASS**
- Model-independence source contract: **PASS**
- Product-sentinel source contract: **PASS**
- Edge source audit and helper self-test: **PASS**
- Strict bootstrap validator tests: **4/4 PASS**

The zero-state HTTP proof used real PostgREST and locally served Edge
endpoints. It proved exact Owner approval, worker claim and non-live staging,
independent evaluator proof, evaluator-gated completion, immutable receipt
binding, and replay denial. It also proved denial of malformed/extra-key
approval, identity crossover, wrong target/receipt/proof, and legacy direct
bootstrap. Ten switches and five schedules were created only at completion and
all remained off.

## Resolved review findings

- Owner action classification false positive: fixed with exact action routing
  while preserving canonical payload classification.
- Circular zero-state bootstrap dependency: fixed by the new forward-only
  pre-task evidence chain.
- Legacy service-role direct bootstrap bypass: execute authority revoked.
- Hash-heavy bootstrap Edge CPU exhaustion: fixed by the bounded exact schema.
- Unsafe bootstrap branch semantic bypass: fixed by canonical classification
  of the validated branch field with regressions.
- Secret helper output escaping another worktree: rejected.
- Sentinel availability input granting a pass: rejected; availability is
  attested-unverified only.

No finding was hidden in the review branch.

## Remote state at this gate

- New migration deployed: **NO**
- Cognitive Edge Functions deployed by this sprint: **NONE**
- Worker invocation/assertion secrets: **MISSING**
- Evaluator invocation/assertion secrets: **MISSING**
- Existing `autonomous-approval-request`: preserved and not redeployed
- Remote migrations: unchanged at the five reviewed deployed versions
- Remote readback: 65 expected tables, 65 RLS, 65 FORCE RLS, anonymous grants
  0, authenticated write grants 0
- Remote switches: 0 rows
- Remote schedules: 0 rows
- Remote Owner approval/worker/evaluator/completion chain: **NOT RUN**

The deployment gate remains fail-closed until the frozen continuation head has
green CI and independent review reports `P0=0/P1=0`.

## Provider, accounts, artifacts, and sentinels

- Approved synthetic accounts: **MISSING**
- Two approved LiveKit participants: **MISSING**
- Provider/backend read-only telemetry: **MISSING**
- Provider-backed model independence:
  `MODEL_INDEPENDENCE_PROVIDER_REQUIRED`
- Deliberation/quorum: **OFF**
- Cognitive GitHub runtime:
  `GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED`
- Android artifact decision: `NO_ARTIFACT_CHANGE_REQUIRED`
- iOS artifact decision: `INTERNAL_QA_BINARY_REQUIRED`; first preference is
  the existing internal build when available
- OTA: none
- New build: none
- LiveKit installed sentinel: **NOT RUN**
- Visual installed sentinel: **NOT RUN**
- Installed journey sentinel: **NOT RUN**
- Research/non-personal memory canaries: **NOT RUN**
- Governed draft-PR canaries: **NOT RUN**

No local readiness self-test is represented as an installed-product canary.

## Switches and schedules

Active schedules: none.

Enabled cognitive switches: none.

Research, non-personal memory, user-derived memory, collective deliberation,
all sentinels, the draft-PR executor, every Level 0/1 schedule, and Level 2
production repair remain off.

## Sanitization incident

A broad read-only provider-lane search emitted an already-committed device
identifier into internal command output. It was not repeated. No credential,
token, key, cookie, private media, or remote state was exposed or changed.
Broad-output searches stopped immediately. No secret or private evidence was
added by this sprint.

## Rollback truth

At this gate there is no production rollback to perform because no migration,
function, secret, switch, schedule, OTA, or binary has been deployed or
changed. The continuation branch can be discarded without affecting
production.

If deployment later passes review, rollback must remain forward-only: disable
switches and schedules, activate the emergency guard, revoke outstanding
approvals/assertions, and deploy a separately reviewed corrective migration or
prior reviewed Edge source. Never edit or down-migrate deployed history.

## Explicit confirmations

- PRs `#21`, `#22`, and `#23` history was preserved.
- No deployed migration was rewritten.
- No hard reset, rebase, clean, restore-all, force-push, or destructive down
  migration occurred.
- No test was deleted or weakened to get green.
- Owner, worker, and evaluator remain distinct.
- No live state mutation occurs before evaluator proof.
- No self-approval exists.
- No unrestricted credential was used by the cognitive runtime.
- No public build, OTA, store release, or track mutation occurred.
- No merge occurred.
- No live money, payout, transfer, withdrawal, or cash-out occurred.
- No existing-product auth/RLS, role, rights, moderation, ranking, or
  provider-product mutation occurred.
- User-derived memory remains off.
- Level 2 production repair remains off.
- No secret or private evidence was committed.
- No generated Android/iOS directory was committed.
- `deno.lock` remained unstaged.
