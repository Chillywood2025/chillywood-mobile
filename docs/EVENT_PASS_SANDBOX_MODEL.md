# Event Pass Sandbox Model

Updated June 4, 2026.

Event pass is now backed for sandbox proof through the existing `creator_events` table and the new `has_event_pass_access(user_id, event_id)` resolver.

Launch review packet: `docs/MONEY_CENTER_LAUNCH_REVIEW_PACKET.md`.

Money Center UI polish proof: `docs/MONEY_CENTER_UI_POLISH_PROOF.md`.

## Product

- product key: `event_pass_sandbox_099`
- provider product id: `cw_event_pass_sandbox_099`
- provider: RevenueCat / Google Play
- environment: `sandbox`
- public production event passes: off
- production live money: off

## Resolver

`has_event_pass_access` returns a safe JSON shape:

- `allowed`
- `reason`
- `status`
- `requiresPurchase`
- `canView`
- `canEnter`
- `canPublish`
- `approvalRequired`

Rules:

- scheduled/live/replay events require an active or sandbox-only `event_pass` access grant
- `draft`, `ended`, `expired`, and `canceled` events deny even with a grant
- channel/audience blocks deny
- host/admin preview is route-policy-only and still returns `canPublish:false`
- event pass grants viewing/entry only
- event pass does not grant LiveKit publish, host, speaker, moderator, admin, payout, or safety-bypass authority

## Proof

Proof path: `/tmp/chillywood-money-failure-and-event-pass-proof-20260604/`

Sandbox event:

- event id: `9b2f4e7d-2e8e-4d2f-93ef-40b06d317004`
- title: `Sandbox Event Pass Proof 20260604`
- type: `watch_party_live`

Real sandbox purchase:

- Google Play dialog showed `Event pass sandbox`
- payment method showed `Test card, always approves`
- no-charge copy was visible
- RevenueCat webhook stored one sandbox provider event
- purchase intent was consumed
- access grant `6a1f37a4-fb2e-453c-9668-3989c4516c3f` was created with `grant_type=event_pass`, `environment=sandbox`, `status=sandbox_only`
- ledger row `b62eaa56-faf5-43c2-8eef-acd7b4ff0a1c` was created with `environment=sandbox`, `status=sandbox_only`, `payable_state=not_payable`

Resolver proof:

- before purchase, non-buyer returned `allowed:false`, `reason:event_pass_required`, `canPublish:false`
- after purchase while scheduled, buyer returned `allowed:true`, `canView:true`, `canEnter:true`, `canPublish:false`
- after the proof event was set to `canceled`, resolver returned `allowed:false`, `reason:event_state_blocks_access`, `canPublish:false`

No screenshots are committed. Proof artifacts remain outside the repo.
