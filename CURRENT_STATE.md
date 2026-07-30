# CURRENT STATE

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

- Main SHA observed at this assurance checkpoint: `2f3b0d1cc4765c4196cd831ab782417a0f000c23`.
- Latest merged implementation: PR #54, `cc4d4582743cc7201785cdb784134663b4fd0e1b`; merge `2f3b0d1cc4765c4196cd831ab782417a0f000c23`.
- Assurance program: PR-B-RECONCILIATION; completed: PR-A.
- Android internal: build 86, runtime `1.0.0-android-chat-call-action-v1`, channel `android-chat-livekit-qa`, update `e3379ac9-61f0-40db-a014-81975be123e5`.
- iOS internal: build 8, runtime `1.0.0-iosqa1`, channel `ios-qa`, update `019fb099-f7c3-7130-97aa-a4bb1c49792f`.
- Remote migration head: `20260730161737`.
- Enabled Cognitive switches: `cognitive_android_visual_sentinel`, `cognitive_ios_visual_sentinel`.
- Cognitive schedules: 0/5 enabled. Effective baseline count: 1.
- Cognitive LiveKit: 0 formal runs, 0 findings, 0 enabled switches.
- PUBLIC schema `net` USAGE: denied. User-derived memory: off. Level 2 repair: off.
- Chi'llywood autonomous app operating model is now documented and guarded at `docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md`; Level 0/1 work does not require owner approval, while Level 3/4 boundaries do.
- Installed Product QA closure retained: chillywood-installed-qa-firebase-smoke.timer_daily_cost_capped; proof rows `ff81956d-94e3-49e9-8c80-fae2c12b0dd8`, `1dc00369-b5ca-4289-92bc-daf5bae00222`, `282fb154-101c-402b-9539-d3fb8080de51`; current matrix state `POLL_HTTP_FAILED`; the daily timer is enabled.
- RevenueCat provider readback is closed: dashboard TEST returned HTTP `200` / `test_received` with `premiumGranted=false`, `liveMoneyAction=false`, and `moneyMoved=false`.
- Evidence timestamp: `2026-07-30T17:21:30Z`; freshness deadline: `2026-07-31T17:21:30Z`; live provider readback: true.

## Open implementation PRs

- PR #52 at `2b7f9fa491180cb1f2b9a883c07b317eb39ae43a`: open-draft; reconcile-then-supersede-unmerged.

## Open review-only PRs

- PR #53 at `67d78b4bdaad3ddc02f90391d46a9e03c430bb0b`: open-draft-stale, reviews `e05c3e82a293a8836cd9f87a9b48059b2ae5421d`; never-merge.
- PR #55 at `aff39b454a53a09cd028c0d84d39e836f808e3d1`: open-draft-current, reviews `cc4d4582743cc7201785cdb784134663b4fd0e1b`; never-merge.

## Current external blockers

- Apple PushKit: BLOCKED_EXTERNAL — iOS terminated/background incoming-call physical delivery. Resume: Use a separately authorized current signed iOS artifact and physical device window; do not retry delivery in this program.

Historical proof belongs in Git history and scoped reports, not this hot path.
