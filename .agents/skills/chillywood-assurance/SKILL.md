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
  Bind each lane to the frozen head/tree. Code Review is additional unless a
  later contract says otherwise, and runs at most once per frozen source head.
- `current-truth`: regenerate only through the canonical current-truth command.
  Never hand-edit its generated documents or treat the packet as canonical.
- `closeout`: require applicable focused proof, review, exact final CI, retained
  review branches, unmerged review PRs, and the contract-defined truth sync.

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
discovery, independently re-read the Git refs and require the host scan ID,
`RUNNING` state, repository, base/target heads and trees, and nonempty
`scan.target.snapshotDigest`. If the field is unavailable, stop with
`HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE`; if it is exposed but empty, stop with
`BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT`. Both states must
report `workersStarted=false`; do not poll or begin expensive discovery.

Keep the host digest and repository digest separate. Re-read the exact source
lease before discovery, source-review completion, and finalization. Any pushed
source or contract change invalidates prior evidence. Permit one completion
attempt; a failed attempt and every terminal state are no-retry. Reuse only
terminal repository-source security evidence for the identical lease.

Never use hosted Codex Security to approve S0 itself. Its independent exact-head
fallback must be labeled only
`REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED`, bind complete changed-file
coverage, P0=0/P1=0, closed finding dispositions, exact test-result hashes, no
deferred work, and the exact reason hosted sealing was not used.
