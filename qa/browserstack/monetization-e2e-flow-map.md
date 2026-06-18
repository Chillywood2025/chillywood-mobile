# Monetization E2E Flow Map

Scope: seven public-v1 monetization flows. Sandbox only unless explicitly stated otherwise. Live money and payouts stay off.

| Flow | Owner Route | Viewer Route | Fixture | CTA Selector | Success/Access Selector | Denied Selector | Must Not Happen | Automation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chi'llywood Premium | `/subscribe` status/setup | `/subscribe` purchase/restore | Play/RevenueCat sandbox tester | `premium-purchase-button` optional in non-purchase smoke | `premium-status-card`, `premium-not-creator-offer-copy`, `premium-active-receipt` if active | `premium-status-card` with unavailable/safe state | Unlock creator VIP/subscription/video/ticket/event | Non-purchase smoke proves route/status/separation; purchase sheet and confirmation remain manual-assisted |
| Tip Creator | Platform Studio Money Center tips | Platform tip sheet | Creator tip config | `platform-support-tip-button`, `tester-tip-creator-button`, `tip-confirm-button` | `tip-success-receipt` or tip notice | `tip-sheet` unavailable notice | Unlock content or create payout | Smoke automated to sheet; purchase manual-assisted or strict sandbox auto-confirm only after verified test sheet |
| Paid Video | Content card / manage price | Player unlock gate | Public playable paid creator video | `platform-support-paid-video-button`, `tester-paid-video-unlock-button` | `paid-video-purchase-success-receipt`, `paid-video-player-ready` | `paid-video-lock-card` | Unlock Premium/VIP/subscription/ticket/event | Smoke automated to gate; purchase manual-assisted or strict sandbox auto-confirm only after verified test sheet |
| Watch-Party Ticket | Party target/ticket setup | Ticket gate / Party Room | Valid Party Room target | `platform-support-ticket-button`, `tester-watch-party-ticket-button`, `watch-party-ticket-purchase-button` | `watch-party-ticket-success-receipt`, `screen-watch-party-waiting-room` or `screen-party-room` | `watch-party-ticket-lock-card` | Grant LiveKit authority by payment | Smoke automated to gate; purchase manual-assisted or strict sandbox auto-confirm only after verified test sheet |
| Event Pass | Event/pass setup | Event route/pass gate | Future creator event | `platform-support-event-pass-button`, `tester-event-pass-button`, `event-pass-purchase-button` | `event-pass-success-receipt`, `event-pass-access-granted-state` | `event-pass-access-denied-state` | Unlock Premium/VIP/subscription/video/ticket | Smoke automated to gate; purchase manual-assisted or strict sandbox auto-confirm only after verified test sheet |
| Platform Subscription | Manage subscription offer / Subscriber Area | Subscribe / Subscriber Area | Creator subscription offer | `platform-support-subscribe-button`, `tester-channel-subscribe-button`, `subscriber-area-subscribe-button` | `subscriber-area-screen`, `subscriber-area-subscribed-badge` | `subscriber-area-access-denied-state` | Route owner to Premium or unlock Premium | Smoke automated to gate; purchase manual-assisted or strict sandbox auto-confirm only after verified test sheet |
| VIP Pass | Manage VIP offer / VIP Area | Get VIP / VIP Area | Creator VIP offer | `platform-support-vip-button`, `tester-vip-pass-button`, `vip-area-get-vip-button` | `vip-area-screen`, `vip-area-active-badge` | `vip-area-access-denied-state` | Route owner to Premium or unlock Premium/subscription | Smoke automated to gate; purchase manual-assisted or strict sandbox auto-confirm only after verified test sheet |

## Accounts

- Owner creator account: configured through local proof env only.
- Non-owner viewer/tester account: active sandbox monetization tester row required for sandbox creator flows.
- Optional second viewer: used for revoked/blocked/negative access proof.

## Required Readback

- Sandbox tester grant/revoke.
- Purchase intent `sandbox` / not payable / no payout.
- Access grant scope matches the target only.
- Premium remains app-wide and separate.
- Owner cannot buy own creator offers.

Fixture prepare/readback requires a local-only `SUPABASE_SERVICE_ROLE_KEY`. Missing service-role env is an expected fail-closed proof blocker; do not weaken RLS or mobile app permissions to avoid it.

Watch-Party Ticket requires a valid owner-owned Party Room target and a `paid_watch_party_offers` row visible through `list_my_paid_watch_party_offers`. If authenticated owner readback returns an empty list, classify the ticket fixture as missing or stale until service-role/admin fixture setup can verify whether the row is absent, scoped to another owner, or hidden by RLS.

Manual-assisted Google Play confirmation is human-required for Tip, Paid Video, Watch-Party Ticket, Event Pass, Platform Subscription, and VIP unless strict sandbox auto-confirm mode is explicitly requested and all checks pass. App Automate must not confirm purchase sheets by default. The repair-loop may fix safe selector/wait/deep-link/readback blockers and rerun only the failed flow, but it must stop for money/security/product authority changes.

Strict sandbox auto-confirm requires visible Google Play test purchase notice verification, expected tester/product verification where exposed, live money off, payout false, `not_payable`, post-purchase backend readback, and no unrelated unlocks. Fake purchase completion is forbidden. If provider ownership already exists for a sandbox product, classify `PROVIDER_OWNERSHIP_REUSE_BLOCKER` and use only dedicated E2E sandbox reset/revoke steps.

## Strict Purchase Pre/Post Gates

- Tip pre: tip config exists, sandbox/not_payable/no_payout. Post: `tip-success-receipt`, no Premium/VIP/subscription/paid video/ticket/event unlock, payout authority false, live money off.
- Paid Video pre: paid video fixture exists and locked state is visible. Post: `paid-video-purchase-success-receipt`, `paid-video-player-ready`, access scoped only to that video, no unrelated unlocks, payout authority false.
- Watch-Party Ticket pre: ticket fixture and target exist, `grants_livekit_publish=false`, `grants_host_authority=false`. Post: ticket success receipt, waiting room/Party Room reached, no LiveKit publish/host authority, no unrelated unlocks, payout authority false.
- Event Pass pre: event pass fixture exists. Post: `event-pass-success-receipt`, `event-pass-access-granted-state`, access scoped only to the event, no unrelated unlocks, payout authority false.
- Platform Subscription pre: subscription offer exists and viewer is non-owner. Post: `subscriber-area-screen`, `subscriber-area-subscribed-badge`, does-not-include Premium/VIP/paid video/ticket/event, subscription scoped only to creator Platform, payout authority false.
- VIP pre: VIP offer exists and viewer is non-owner. Post: `vip-area-screen`, `vip-area-active-badge`, does-not-include Premium/subscription/paid video/ticket/event, VIP scoped only to creator Platform, payout authority false.

## Two-Device Need

Watch-Party Live media authority is not part of the money proof. Ticket proof can be one-device to the Party Waiting Room/Room gate. Multi-device room authority proof remains separate.
