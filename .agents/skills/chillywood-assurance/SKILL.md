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

Freeze and hash the exact target before discovery. Preflight requires a
nonempty observable host snapshot digest distinct from the repository digest;
otherwise stop expensive work. Bind source leases exactly, permit one completion
attempt, never retry terminal states, and label fallback only
`REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED`.
