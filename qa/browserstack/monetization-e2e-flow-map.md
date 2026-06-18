# Monetization E2E Flow Map

Scope: seven public-v1 monetization flows. Sandbox only unless explicitly stated otherwise. Live money and payouts stay off.

| Flow | Owner Route | Viewer Route | Fixture | CTA Selector | Success/Access Selector | Denied Selector | Must Not Happen | Automation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chi'llywood Premium | `/subscribe` status/setup | `/subscribe` purchase/restore | Play/RevenueCat sandbox tester | `premium-purchase-button` | `premium-active-receipt` if active | `premium-status-card` not active state | Unlock creator VIP/subscription/video/ticket/event | Smoke automated to purchase boundary; purchase manual-assisted |
| Tip Creator | Platform Studio Money Center tips | Platform tip sheet | Creator tip config | `platform-support-tip-button`, `tester-tip-creator-button`, `tip-confirm-button` | `tip-success-receipt` or tip notice | `tip-sheet` unavailable notice | Unlock content or create payout | Smoke automated to sheet; purchase manual-assisted |
| Paid Video | Content card / manage price | Player unlock gate | Public playable paid creator video | `platform-support-paid-video-button`, `tester-paid-video-unlock-button` | `paid-video-player-ready` | `paid-video-lock-card` | Unlock Premium/VIP/subscription/ticket/event | Smoke automated to gate; purchase manual-assisted |
| Watch-Party Ticket | Party target/ticket setup | Ticket gate / Party Room | Valid Party Room target | `platform-support-ticket-button`, `tester-watch-party-ticket-button`, `watch-party-ticket-purchase-button` | `watch-party-ticket-success-receipt`, `screen-party-room` | `watch-party-ticket-lock-card` | Grant LiveKit authority by payment | Smoke automated to gate; purchase manual-assisted |
| Event Pass | Event/pass setup | Event route/pass gate | Future creator event | `platform-support-event-pass-button`, `tester-event-pass-button`, `event-pass-purchase-button` | `event-pass-access-granted-state` | `event-pass-access-denied-state` | Unlock Premium/VIP/subscription/video/ticket | Smoke automated to gate; purchase manual-assisted |
| Platform Subscription | Manage subscription offer / Subscriber Area | Subscribe / Subscriber Area | Creator subscription offer | `platform-support-subscribe-button`, `tester-channel-subscribe-button`, `subscriber-area-subscribe-button` | `subscriber-area-subscribed-badge` | `subscriber-area-access-denied-state` | Route owner to Premium or unlock Premium | Smoke automated to gate; purchase manual-assisted |
| VIP Pass | Manage VIP offer / VIP Area | Get VIP / VIP Area | Creator VIP offer | `platform-support-vip-button`, `tester-vip-pass-button`, `vip-area-get-vip-button` | `vip-area-active-badge` | `vip-area-access-denied-state` | Route owner to Premium or unlock Premium/subscription | Smoke automated to gate; purchase manual-assisted |

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

## Two-Device Need

Watch-Party Live media authority is not part of the money proof. Ticket proof can be one-device to the Party Waiting Room/Room gate. Multi-device room authority proof remains separate.
