# Remaining application repairs — October 31, 2026

## Scope and release hold

The owner requested direct source repairs and verification across the remaining
application inventory. This branch starts from PR #638 at
`5f0f888efd65f182b9508b696505c049cec37abf`. PR #638 remains separate and frozen.
Merges, builds, deployment, provider configuration, live money and destructive
retention activation remain paused. Automated evidence is not installed-device
or live-provider qualification.

## Coverage inventory

| Area | Current work | Remaining independent evidence |
| --- | --- | --- |
| Saved / Continue Watching | Repair bounded remote synchronization and preserve exact-operation recovery after unknown writes. | Fresh cross-device installed consistency. |
| Replay / linked media | Recheck existing production-path regressions; do not duplicate October 21 repairs. | Original failing media fixture, first frame/progression, seek/end/retry/back on both platforms. |
| Reset links / sessions | Recheck current session and recovery tests. | Fresh newest-link → password update → login on devices. Historical email delivery is not current proof. |
| Premium | Recheck restore, cancellation, revocation and unknown-provider handling. | Real store/native purchase/restore and current provider configuration. No purchase or activation in this task. |
| Calls / Live Stage / Watch-Party | Repair stale queued timer callbacks; expand lifecycle regression coverage. | Physical microphone/camera/handoff/background behavior, separately for Android and iOS. |
| Retention | Validate worker result contracts and reconcile supported content coverage. | Secondary/HLS and unsupported originals, operational qualification and separately authorized activation. No real deletion. |
| Actual provider fees | Implement observed evidence intake without treating incomplete/missing fees as zero. | Authenticated account-specific fee delivery, complete attribution/adjustment semantics and independent settlement qualification. |
| Cashout | Validate amount/type boundaries and accurate instant-fee copy. | Bank execution, qualified destination/provider fee collection and operational consent/configuration. Transfers are not bank payouts. |
| Google external checkout | Reconcile missing qualified provisioning/revocation source boundaries. | Actual program eligibility, credentials, V18 licensed-device qualification and authorized provider setup. |
| Solo-owner operation | Preserve clear blocked/read-only status and actionable exception reporting. | Legal/tax determinations, registrations and account configuration cannot be inferred from code. |

## Evidence rules

- Record confirmed failures, fixes, exact test commands and counts as work completes.
- Distinguish source complete, automated pass, not run and externally blocked.
- Missing evidence must not grant eligibility, access, money or deletion authority.
- Historical documents are investigation leads, not current provider or device proof.
- The separately paused notification registration/logout scope is not silently
  resumed by this work.

## Confirmed repairs and focused evidence

- Library synchronization: `080856a9`, with evidence in
  `docs/library-sync-deadline-repair-2026-10-31.md`. Forty collection tests
  passed, including overlap between explicit retry, newer intent and late
  original success. Another 240 replay/reset/Premium/mounted-screen tests
  passed without establishing real provider or device behavior.
- Live lifecycle: `80d53540` retires queued Stage callbacks and prevents an
  already-completed iOS audio preparation deadline from retiring ready audio.
  Eight new regressions reproduced predecessor failures. Scoped suites passed
  672 camera/Stage/Watch-Party and 33 outgoing-audio/thread cases.
- Retention: `71c08ac1` prevents invalid text results from reporting successful
  expiry; 40 text/handler/media tests passed. `37a53ab5` validates explicit HLS
  upload inventories, with seven tests and real local ffmpeg producer checks.
  `21e93002` adds unsupported-provider negative coverage. Existing
  Supabase-to-R2 copy/cutover is implemented, not a missing adapter; actual
  per-object qualification and authorized provider actions remain outstanding.
- Cashout: `e81eee60` rejects invalid whole-cent/method input and corrects
  instant-fee examples to 2%. Four production-function cases and two existing
  replay tests passed. Bank execution remains explicitly unfinished in
  `docs/CREATOR_CASHOUT_EXECUTION_READINESS.md`.
- Google: `556fc3a0` removes environment-wide implicit program matching and
  binds a capability to the exact immutable app program. Four full-schema
  suites passed; revoked-program historical reporting still passed. Nine new
  pgTAP checks and the native runner update await integrated hosted validation.
- Fee evidence: `f3e0e767` and `789f1ed5` add GET-only report normalization,
  private artifact import and dormant service-only append-only persistence.
  Fifty-one helper, actual-handler and full-schema tests passed; actual cached
  Deno checked the endpoint closure. Fourteen pgTAP assertions await hosted
  execution. Report observations remain unqualified for settlement. Current
  test-only contracts cannot accept live evidence; sandbox Fees reporting is
  not established. Live contract qualification, actual report access,
  completeness/fee-tax semantics, merchandise binding and scheduling remain
  explicit prerequisites, not hidden zero-cost assumptions.

Independent source reviewers checked the collection/cashout, retention/live
lifecycle, HLS producer and Google changes without finding a remaining blocking
defect in those reviewed revisions. Counts above are scoped evidence, not a
substitute for the final integrated validation run.

## Existing references

- `docs/media-save-consistency-2026-10-19.md`
- `docs/replay-playback-repair-2026-10-21.md`
- `docs/account-session-actions.md`
- `docs/premium-settings-return-cloud-validation.md`
- `docs/CREATOR_COMMERCE_NATIVE_QUALIFICATION.md`
- `docs/google-play-external-reporting.md`
- `docs/deleted-content-retention.md`
- `docs/CREATOR_AUCTION_PLATFORM_SETTLEMENT.md`

This inventory is not a release approval or a claim that every listed area is
broken. It separates newly confirmed defects from unfinished qualification.
