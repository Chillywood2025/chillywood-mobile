# CURRENT STATE

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

- Main SHA observed at this assurance checkpoint: `55ec0d2876f74b7cccfa62588bddb508f477e6e4`.
- Latest merged implementation: PR #62, `08ca9b11b28677268f7db932086256645d29c794`; merge `55ec0d2876f74b7cccfa62588bddb508f477e6e4`.
- Assurance program: PR-B-RECONCILIATION-AND-PR-C-EXACT-REVIEW; completed: PR-A, CURRENT-TRUTH-SYNCHRONIZATION-PR-56, CURRENT-TRUTH-GUARD-CORRECTION-PR-58, CURRENT-TRUTH-SYNCHRONIZATION-PR-60, FEATURE-DOMAIN-SCOPE-GUARD-PR-62.
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
- Evidence timestamp: `2026-07-30T18:13:30Z`; freshness deadline: `2026-07-31T18:13:30Z`; live provider readback: true.

## Open implementation PRs

- PR #52 at `2b7f9fa491180cb1f2b9a883c07b317eb39ae43a`: open-draft; reconcile-then-supersede-unmerged.
- PR #64 at `13ff4c0ffc1c38f402dc1bf7744758d6419b151b`: open-draft; merge-current-truth-sync-then-exact-review.

## Open review-only PRs

- PR #53 at `67d78b4bdaad3ddc02f90391d46a9e03c430bb0b`: open-draft-stale, reviews `e05c3e82a293a8836cd9f87a9b48059b2ae5421d`; never-merge.
- PR #55 at `aff39b454a53a09cd028c0d84d39e836f808e3d1`: open-draft-current, reviews `cc4d4582743cc7201785cdb784134663b4fd0e1b`; never-merge.
- PR #57 at `c4557aaea42db104050c9a0d4dc0458ea9f433d9`: open-draft-current, reviews `8308e0b34050735fd75efe6ff3415cde1f39144a`; never-merge.
- PR #59 at `919188a43823071498cbfe62a22fd31c633c0e02`: open-draft-current, reviews `b170c4ed99a9e2cc2b33b19fdf5e78b33f126157`; never-merge.
- PR #61 at `85a34c1d5c072364d53890c30956548b6be94558`: open-draft-current, reviews `3f4615f3584ede3c1159b64296231bca0b7e3e09`; never-merge.
- PR #65 at `096f35c44bb916edf41714ca3d6a7aa3d8410e35`: open-draft-current, reviews `08ca9b11b28677268f7db932086256645d29c794`; never-merge.
- PR #66 at `2ab51ce74a0ed80551407aab66b1d44192056120`: open-draft-current, reviews `08ca9b11b28677268f7db932086256645d29c794`; never-merge.

## Current external blockers

- Apple PushKit: BLOCKED_EXTERNAL — iOS terminated/background incoming-call physical delivery. Resume: Use a separately authorized current signed iOS artifact and physical device window; do not retry delivery in this program.

Historical proof belongs in Git history and scoped reports, not this hot path.
