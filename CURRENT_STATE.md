# CURRENT STATE

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

- Main SHA observed at this assurance checkpoint: `fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6`.
- Latest merged implementation: PR #50, `934b6ae2ef07d79295e21a77d2b033f3be778c32`; merge `fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6`.
- Android internal: build 86, runtime `1.0.0-android-chat-call-action-v1`, channel `android-chat-livekit-qa`, update `e3379ac9-61f0-40db-a014-81975be123e5`.
- iOS internal: build 8, runtime `1.0.0-iosqa1`, channel `ios-qa`, update `019fb099-f7c3-7130-97aa-a4bb1c49792f`.
- Remote migration head: `20260730161737`.
- Enabled Cognitive switches: `cognitive_android_visual_sentinel`, `cognitive_ios_visual_sentinel`.
- Cognitive schedules: 0/5 enabled. Effective baseline count: 1.
- Cognitive LiveKit: 0 formal runs, 0 findings, 0 enabled switches.
- PUBLIC schema `net` USAGE: denied. User-derived memory: off. Level 2 repair: off.
- Open implementation: PR #52 at `2b7f9fa491180cb1f2b9a883c07b317eb39ae43a`, draft, reconciliation then supersede unmerged.
- Open review-only: PR #53 at `67d78b4bdaad3ddc02f90391d46a9e03c430bb0b`, stale against `e05c3e82a293a8836cd9f87a9b48059b2ae5421d`; never merge.
- Evidence timestamp: `2026-07-30T16:49:50Z`; freshness deadline: `2026-07-31T16:49:50Z`; live provider readback: true.

## Current external blockers

- Apple PushKit: BLOCKED_EXTERNAL — iOS terminated/background incoming-call physical delivery. Resume: Use a separately authorized current signed iOS artifact and physical device window; do not retry delivery in this program.

Historical proof belongs in Git history and scoped reports, not this hot path.
