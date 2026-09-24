---
name: chillywood-assurance
description: Resume, plan, execute, freeze, review, synchronize current truth, or close out Chi'llywood assurance tasks from canonical repository evidence. Use for work governed by config/assurance contracts and NEXT_TASK.md; do not use to bypass proof tiers, authorize Level 3/4 actions, or replace product-domain instructions.
---

# Chi'llywood assurance

Operate from repository truth with the smallest sufficient context. Treat the
active-task packet as a derived view; canonical contracts remain authoritative.

## Start every operation

1. Read every applicable `AGENTS.md` from the repository root to the target.
2. Run `node scripts/assurance/current-truth.mjs`. Stop on any finding.
3. Generate the packet with `node scripts/assurance/active-task.mjs`. Pass an
   exact `--feature=<id>` only when current truth cannot resolve one uniquely.
4. Stop on ambiguous ownership, missing evidence, stale identity, or P0/P1.
5. Read only files, defects, contracts, and receipts named by the packet.

Never infer authority from this skill. Preserve Level 3/4 Owner approval,
T0–T7 separation, platform separation, migration immutability, proof-substitution
denial, independent semantic review, adjacent-defect discovery, and required CI.

## Operations

- `resume`: run the start workflow; report the next eligible phase and blockers.
- `plan`: run `node scripts/assurance/plan.mjs --feature=<packet feature>` and the
  scope command named by the packet. Require both planning statuses to be clear.
- `run-focused`: execute only packet-listed command IDs through
  `node scripts/assurance/receipt.mjs`; never pass arbitrary shell text.
- `freeze`: record exact implementation head, tree, diff hash, path hash, input
  hash, and deterministic receipts. Source changes invalidate the freeze.
- `review`: use the packet's current policy level and compact independent lanes.
  Bind each lane to the frozen head/tree. Repository-owned independent review
  and the P0/P1 stop line remain mandatory. Provider Codex Review is
  `OPTIONAL_ADVISORY`, Owner-triggered only, and never a progress, CI, merge,
  current-truth, build, or release prerequisite. Never request, retry, or poll
  it automatically. Treat late provider commentary as advisory triage unless
  an exact protected-main finding-set registration independently validates it.
- `current-truth`: regenerate only through the canonical current-truth command.
  Never hand-edit its generated documents or treat the packet as canonical.
- `closeout`: require applicable focused proof, review, exact final CI, retained
  review branches, unmerged review PRs, and the contract-defined truth sync for
  a normal merge. For an exact Owner-bypass merge, validate the exact Git and
  ruleset facts and record every proof at its factual level. Independently
  verified exact-head review or sealed hosted-security evidence may be retained,
  while absent final-source evidence remains `NOT_PRODUCED` and an unsuccessful
  Phase 1 remains `NOT_SUCCESSFUL`; never promote or fabricate either. For
  Owner-deferred work, retain defects as `NOT_IMPLEMENTED`.

## Lifecycle and applicability

Use `config/assurance/control-plane-lifecycle-v2.json` and
`scripts/assurance/control-plane-lifecycle.mjs`. Every gate answers separately:

1. whether it is applicable at the current lifecycle stage and risk; and
2. whether an applicable execution passed.

The canonical stages are `NO_ACTIVE_TASK`, `OWNER_INTENT`,
`FINITE_TASK_ADMISSION`, `AUTHORIZED_IMPLEMENTATION`, `FROZEN_CANDIDATE`,
`NORMAL_MERGE_READY`, the normal and exact-Owner-bypass merged states,
`OWNER_DEFERRED`, and `TERMINAL_TRUTH`. A deferred or not-applicable gate is
never PASS and grants no authority. If a later transition makes it applicable,
run it fresh. Final-source and exact-head evidence first become applicable to a
frozen normal candidate; do not require them during pre-admission or ordinary
implementation.

Discover all historical Phase 1 lanes, but aggregate only the lanes applicable
to the current stage, exact diff risk, requested authority, and proof tier.
Report discovered, applicable, passed, failed, and deferred counts. Every
applicable failure and every applicable unexecuted lane blocks. The Cognitive
Intelligence, Autonomous Systems iOS, and Autonomous Systems All-Platform lanes
retain their substantive checks, while unfinished authority companion checks
remain deferred until their architecture and lifecycle prerequisite are ready.

Ordinary continuous protected-main advancement does not require a truth-only
PR. Synchronize only real terminal or authority transitions, once. A bounded
assurance self-maintenance merge is attributable only when every changed path
belongs to the declared control-plane scope and no product or external
authority is mixed in; unknown product/domain structural changes fail closed.

Owner intent is reusable only for the same bounded task and authority. Do not
ask again for mechanical retries, newline-equivalent receipt transport,
generated-truth refresh, or safe read-only verification. Material scope,
authority, exact-source bypass identity, provider, database, build, submission,
public-release, or money changes remain new Owner boundaries.

For evidence reuse, query `node scripts/assurance/evidence-index.mjs`. Reuse only
an exact full-key hit. Provider, signed, installed-device, physical, public,
time-limited, or changed-source security evidence must be rerun or remain blocked.

Use the capability classes in `config/assurance/efficiency-e0-v1.json`: the
deterministic low-cost class for inventory, hashes, rendering, allowlisted runs,
PR text, and receipt formatting; the focused-review class for bounded triage and
exact-diff compatibility; and the strong-semantic class for architecture,
security, P0/P1, concurrency, adversarial discovery, and ambiguous failures.
Never hardcode a model name in repository policy.

Do not poll or keep a high-context agent alive for more than 15 minutes. Start a
supported long task, preserve its receipt location, return, and resume from the
compact receipt. Never promise unsupported background monitoring.

## Codex Security reliability S0

Run `node scripts/assurance/codex-security-target.mjs --base=origin/main
--target=HEAD` to freeze the exact repository, refs, heads, trees, changed-path
worklist, repository-owned snapshot digest, and contract hashes. Before hosted
discovery, independently re-read the Git refs and require the provider fields
available during preflight: exact scan ID, `RUNNING`/`PREFLIGHT`, pull-request
diff kind, target ID/display name, and exact base/head revisions matching the
frozen commits. The provider does not expose repository slug, trees, or
`scan.target.snapshotDigest` at this stage; do not fabricate them or substitute
the repository-owned digest. Workers may begin only after the available
provider identities reconcile to the frozen repository descriptor.

At successful completion, require the provider target to be complete/sealed,
retain the exact target ID and base/head revisions, and expose a nonempty
provider `snapshotDigest`. Reconcile those facts to the frozen descriptor before
issuing `CODEX_SECURITY_SEALED`. Missing, stale, conflicting, changed-source, or
unverifiable completion metadata fails closed.

Keep the host digest and repository digest separate. Re-read the exact source
lease before discovery, source-review completion, and finalization. Any pushed
source or contract change invalidates prior evidence. Permit one completion
attempt; a failed attempt and every terminal state are no-retry. Reuse only
terminal repository-source security evidence for the identical lease.

Risk-classify the exact diff before requiring hosted security. A proven
presentation-only diff with no auth/session, database/RLS, secrets, native,
calls, provider, release, money, or trust-boundary changes may use
`NOT_APPLICABLE_PRESENTATION_ONLY` plus repository-owned behavioral/security
guards. Unknown or high risk requires hosted security. Never use hosted Codex
Security to approve S0 itself. Its independent exact-head
fallback must be labeled only
`REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED`, bind complete changed-file
coverage, P0=0/P1=0, closed finding dispositions, exact test-result hashes, no
deferred work, and the exact reason hosted sealing was not used.

The protected-main ruleset must require the canonical lifecycle-aware Phase 1
admission decision with strict head freshness, stale-review dismissal,
conversation resolution, and Integration 4707730 as the only permanent bypass.
Raw diagnostic lanes need not be individually required when the canonical
aggregate consumes every applicable result fail-closed. `Chi'llywood / Codex
Review Exact Head` remains excluded from required status; provider review is
advisory and cannot substitute for repository-owned exact-head review.
