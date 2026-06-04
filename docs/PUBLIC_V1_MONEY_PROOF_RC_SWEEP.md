# Public V1 Money-Proof RC Sweep

Updated June 4, 2026.

This release-candidate sweep verifies that the completed Money Center and sandbox monetization proof did not break Public V1 launch posture, Google Play review posture, Premium/Platform Studio gates, Player/content behavior, Watch-Party Live, Live Watch-Party / Live Stage, event-pass safety, spectator safety, or Admin/Owner money controls.

This sweep does not activate production money, payouts, cash-out, withdrawal, transfer, public production buy buttons, Stripe Android digital checkout, fake balances, fake sales, or LiveKit authority changes.

## Starting State

- Starting HEAD: `965ee72` (`Polish money center and review packet`).
- Branch state at start: `main...origin/main`.
- Tracked worktree state at start: clean.
- Existing untracked paths left untouched: `artifacts/`, `supabase/.temp/`.
- Prior EAS Update: group `4bccfb67-1cea-47ac-a346-f4b26bd50672`, Android update `019e90a3-23c0-7086-9f76-33aa7ad30215`, runtime `1.0.0`.
- Android proof device: `R5CR120QCBF`, package `com.chillywood.mobile`, versionCode `23`, versionName `1.0.0`, installer `com.android.vending`.

## Remote Money Counts

Remote readback before and after visual proof stayed stable:

| Surface | Count / state |
| --- | --- |
| `provider_events` total | `6` |
| `provider_events` sandbox | `6` |
| `money_purchase_intents` total | `8` |
| consumed intents | `6` |
| failed intents | `1` |
| expired intents | `1` |
| pending intents | `0` |
| `access_grants` total | `5` |
| active/sandbox grants | `4` |
| revoked grants | `1` |
| `money_access_ledger_events` total | `7` |
| sandbox ledger rows | `7` |
| payable/paid money-access rows | `0` |
| active temporary proof roles after cleanup | `0` |

No fake provider events, fake sales, fake balances, payable sandbox/setup rows, payout actions, or production money rows were inserted.

## Android Evidence

Proof path:

`/tmp/chillywood-public-v1-money-proof-rc-sweep-20260604/`

Captured:

- Play-installed package proof.
- Home screen from Play-installed app.
- Profile entry.
- non-Premium / non-role Platform Studio denial before temporary proof role.
- Creator Money Center summary and product-readiness sections.
- Owner/Admin Money Center overview and scroll sections.
- Product Catalog / Provider Events / Purchase Intents / Access Grants / Ledger Events launch-readiness readout.
- failure-path status readout.
- post-revoke Admin denial after temporary proof roles were revoked.

Screenshots remain local proof artifacts and are not committed.

## Regression Results

| Area | RC status |
| --- | --- |
| Public launch readiness | Passed by tracked-file clean start, runtime validation, policy guards, Play-installed smoke proof, and current docs. |
| Google Play review posture | Passed; docs state Google Play / RevenueCat owns Android digital goods, Stripe Android digital checkout is absent, sandbox rows are not payable, and production live money is off. |
| Premium gates | Passed by `guard:premium-sandbox-policy`; Premium remains sandbox proved/test-ready, `user_entitlements` remains strict backend truth, and the purchase shell stays closed by default. |
| Platform Studio gates | Passed by Android denial capture before temporary proof role and `guard:platform-brand-studio-policy`; setup/operator access is not Premium entitlement. |
| Player/free content | Passed by `npm run typecheck`, content rights guard, and no Player code changes in this lane. Normal playback behavior was not redesigned. |
| Paid content | Passed by money-access guard and prior sandbox proof; valid grants allow access only when content policy allows, while private/draft/deleted/admin_removed/malware/blocked states still deny. |
| Watch-Party Live | Passed by Watch-Party LiveKit and old-room guards; ticket grants entry/viewing only and does not grant mic/camera/publish or host authority. |
| Live Watch-Party / Live Stage | Passed by Live Stage contract and approved-seat guards; access pass is viewer/listener only, seat pass is eligibility only, and host approval remains required. |
| Event pass | Passed by event-pass proof docs and money-access guard; event pass allows viewing/entry only and canceled/ended/removed/disabled events still deny. |
| Spectator / child-room | Passed by spectator child-room guard; paid/event access does not expose full LiveKit publish or private provider/storage paths. |
| Admin/Owner safety | Passed by Admin Money Center visual proof and post-revoke denial; drilldowns remain sanitized and permission-gated. |
| Money Center honesty | Passed by Creator and Owner/Admin screenshots; sandbox-only/not-payable copy is visible and no payout/cash-out/withdraw/transfer/fake balance is shown. |

## Safety Proof

- `live_money_enabled` remains off.
- `payouts_enabled` remains off.
- Payable/paid money-access rows remain `0`.
- Production paid content, tickets, seats, tips, and event passes remain off.
- No Stripe checkout, external payment link, or merch checkout grants Android digital access.
- Access grants do not grant LiveKit publish, host, speaker, mod/admin, payout, or safety-bypass authority.
- Tickets and seats do not bypass host approval.
- Content/event access does not bypass blocking, moderation, private, draft, deleted, admin_removed, malware, ended, canceled, removed, or disabled states.
- LiveKit token issuer and Watch-Party / Live Stage route ownership were not changed in this lane.

## Validation

Passed:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:money-access-grants-policy`
- `npm run guard:premium-sandbox-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:money-center-policy`
- `npm run guard:stripe-connect-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:platform-brand-studio-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:content-rights-policy`
- `npm run guard:navigation-terminology-policy`
- `supabase db lint --local`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

No schema migration was needed. Supabase typegen was not refreshed because tracked database types did not change.

## Remaining Gaps

- Real provider refund/revoke proof still requires provider tooling support.
- Real delayed-payment pending purchase proof still requires Google Play tester/device support.
- Production money activation, payout setup, tax/legal readiness, public production buy buttons, and merch checkout require future explicit approval lanes.
