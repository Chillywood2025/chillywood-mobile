# Chi'llywood Autonomous App Operating Model

Last updated: 2026-07-09

Status: governing policy for future Codex/operator work. Chi'llywood should operate autonomously by default inside approved safety policy, with owner approval reserved for high-risk boundary changes.

## 1. Autonomy Principle

Chi'llywood is autonomous by default as an app platform. Codex and platform operators should detect, plan, preflight, dry-run, execute, audit, rollback or quarantine, and report safe work without asking the owner for every ordinary operation.

owner approval is required only for high-risk boundary changes: money, paid provider or billing mutations, public exposure changes, destructive production changes, auth/RLS policy changes, Premium entitlement changes, payouts/cashout, legal/compliance policy, public release, public marketing claims, or anything that materially changes user rights, privacy, money movement, or public reach.

If a task is safely inside an already approved policy, use the operator pattern and continue. If a task crosses a high-risk boundary, stop and request approval with the proposed scope, risk, rollback, and proof plan.

## 2. Operator Pattern

Every autonomous lane follows the same operating pattern:

1. Detect: identify eligible work and classify risk.
2. Plan: build a scoped plan with caps, expected outputs, audit checks, and rollback scope.
3. Preflight: verify config, backup gate, permissions, public/private boundaries, and kill switches.
4. Dry-run: prove the exact intended work without writes when practical.
5. Execute: run only inside the approved policy/caps.
6. Audit: re-read outputs, rows, public exposure, telemetry, and safety invariants.
7. Rollback/quarantine: automatically quarantine failed batches and keep rollback scoped.
8. Report: summarize what changed, what was skipped, what was blocked, and what remains safe.

## 3. Approval Levels

### Level 0: Fully Autonomous

Safe, reversible, policy-covered operations that do not change money, auth/RLS, billing/provider settings, payouts, public/private exposure, public launch state, or destructive production data may proceed without owner approval.

### Level 1: Autonomous With Reporting

Safe operations that are routine but useful to summarize should proceed automatically and report results after completion.

### Level 2: Autonomous With Emergency Stop

Higher-volume or repeated safe operations may proceed when kill switch, fallback, audit, rollback, quarantine, and caps are active. Emergency stop always wins.

### Level 3: Owner Approval Required

High-risk application or infrastructure boundary changes require explicit owner approval before execution.

### Level 4: Owner Approval Plus External Confirmation

Actions that also depend on store, provider, legal, payment, or compliance systems require owner approval and external confirmation/readback before they are considered closed.

## 4. Level 0 Examples

These do not require owner approval when they stay inside existing safety policy:

- eligible media discovery
- safe batch sizing
- scoped media-worker logical backups to private R2
- restore drills in disposable databases
- transcode public-safe media inside existing caps
- post-write audit of scoped worker rows
- scoped rollback plans and scoped rollback execution for known worker batches
- fallback playback decisions
- proof-only and source-only telemetry shaping
- read-only status checks
- proof scripts and guard scripts that do not mutate production

## 5. Level 1 Examples

These should run autonomously and report:

- batch completion reports
- cost/cache summaries
- failure summaries
- skipped-candidate summaries
- backup freshness summaries
- restore-drill summaries
- rollout planner summaries

## 6. Level 2 Examples

These can run autonomously only with emergency stop, audit, rollback, fallback, and caps:

- batch automation with kill switch
- worker auto-pause on anomaly
- cache/fallback automation
- repeated public-safe media transcode batches inside configured caps
- automatic quarantine on audit failure
- automatic fallback to signed origin when CDN eligibility fails

## 7. Level 3 Owner Approval Examples

These require owner approval before execution:

- paid provider or billing changes
- RLS/auth changes
- payout or cashout changes
- Premium entitlement changes
- destructive migrations or destructive production DB operations
- broad catalog backfill
- public/private exposure changes
- public bucket/domain exposure changes
- changing CDN access for private, Premium, original/master, unscanned, or moderation-blocked media
- deploying a long-running production worker, daemon, cron, or scheduler
- enabling continuous worker automation beyond the approved caps

## 8. Level 4 Examples

These require owner approval plus external confirmation:

- app store public release
- legal/compliance policy changes
- payment production mutation
- public marketing claims
- production payment/provider launch
- provider plan upgrades or paid add-ons
- public store listing or release-track changes

## 9. Media Worker Policy

Public-safe audited videos can be processed automatically inside caps after backup, scan, moderation, output-prefix, audit, rollback, fallback, and telemetry gates pass.

Private, Premium, original/master, unscanned, moderation-blocked, unsupported, missing-source, or explicitly denied media always stop. They must not be uploaded to public playback, exposed through public CDN, marked resolver-ready, or used for fallback removal.

Batch size can grow automatically after clean runs, but only inside configured caps and with emergency stop, rollback, audit, fallback, and reporting active. Broad catalog backfill remains Level 3 until separately approved.

Rollback/quarantine must be automatic for failed audits or anomaly detection. Resolver trust must require audit pass.

## 10. Cost Policy

Use the cheaper Cloudflare R2/HLS path automatically for eligible audited public-safe media when rollout gates pass. Keep signed-origin fallback available.

Report usage, cache behavior, estimated bytes, and cost summaries. Do not claim savings without telemetry or cache/provider proof.

Ask the owner before enabling new paid services, paid provider features, plan upgrades, PITR add-ons, or production payment/provider mutations.

## 11. Safety Policy

Emergency stop always wins.

Fallback must remain available for playback and operational recovery.

No secrets in logs, docs, proof output, artifacts, commits, or public bug reports.

No public exposure without policy: private, Premium, original/master, unscanned, moderation-blocked, and denied media must not become public CDN content.

Audit and rollback/quarantine are mandatory for worker output trust. Destructive production changes require owner approval.

## 12. Codex Behavior Rule

Do not ask the owner for Level 0 or Level 1 operations. Do the work, verify it, report what happened, and keep moving.

For Level 2 operations, proceed only when the emergency stop, caps, rollback, audit, fallback, and reporting controls are present. Stop if a gate fails.

Ask the owner before Level 3 operations. Ask the owner and require external confirmation before Level 4 operations.

If unsure, classify the operation, explain the approval level, state the risk boundary, and choose the safer level until the classification is clear.
