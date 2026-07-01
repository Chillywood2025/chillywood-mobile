# BrowserStack TestID Contract

Stable selectors are the contract for BrowserStack, Maestro, App Live, and local device proof. Do not replace them with coordinate taps.

## Global

- `auth-login-email-input`
- `auth-login-password-input`
- `auth-login-submit-button`
- `premium-screen`
- `screen-premium`
- `screen-platform`
- `screen-player`
- `screen-channel-subscription`
- `screen-vip-pass`
- `screen-event`
- `screen-party-room`
- Existing tab aliases: `main-tab-home`, `main-tab-explore`, `main-tab-live`, `main-tab-library`

## Owner / Viewer Platform

- `platform-owner-mode-badge`
- `platform-viewer-mode-badge`
- `platform-sandbox-tester-mode-badge`
- `platform-creator-offers-section`
- `platform-support-this-platform-section`
- `platform-owner-manage-subscription-button`
- `platform-owner-manage-vip-button`
- `platform-support-tip-button`
- `platform-support-subscribe-button`
- `platform-support-vip-button`
- `platform-support-paid-video-button`
- `platform-support-ticket-button`
- `platform-support-event-pass-button`
- `platform-access-denied-state`

## Premium

- `premium-screen`
- `premium-status-card`
- `premium-purchase-button` when purchase readiness is available; optional for non-purchase BrowserStack smoke
- `premium-restore-button`
- `premium-active-receipt` when an active receipt is rendered
- `premium-not-creator-offer-copy`

## Tips

- `tester-tip-creator-button` on Platform sandbox tester entry
- `tip-sheet`
- `tip-amount-option`
- `tip-confirm-button`
- `tip-success-receipt` when a success notice is rendered
- `tip-no-content-unlock-copy`

## Paid Video

- `tester-paid-video-unlock-button` on Platform sandbox tester entry / Player gate
- `paid-video-lock-card`
- `paid-video-purchase-success-receipt`
- `paid-video-player-ready`
- `owner-paid-video-manage-price-button`

## Watch-Party Seat Pass

- `tester-watch-party-ticket-button` on Platform sandbox tester entry
- `watch-party-ticket-lock-card`
- `watch-party-ticket-purchase-button`
- `watch-party-ticket-success-receipt`
- `screen-party-room`
- `owner-ticket-manage-target-button`

## Event Pass

- `tester-event-pass-button` on Platform sandbox tester entry
- `event-pass-lock-card`
- `event-pass-purchase-button`
- `event-pass-access-granted-state`
- `event-pass-access-denied-state`
- `owner-event-pass-manage-button`

## Platform Subscription

- `tester-channel-subscribe-button` on Platform sandbox tester entry
- `subscriber-area-screen`
- `subscriber-area-owner-preview-badge`
- `subscriber-area-subscribed-badge`
- `subscriber-area-manage-offer-button`
- `subscriber-area-preview-button`
- `subscriber-area-subscribe-button`
- `subscriber-area-access-denied-state`
- `subscriber-area-includes-list`
- `subscriber-area-does-not-include-list`

## VIP

- `tester-vip-pass-button` on Platform sandbox tester entry
- `vip-area-screen`
- `vip-area-owner-preview-badge`
- `vip-area-active-badge`
- `vip-area-manage-offer-button`
- `vip-area-preview-button`
- `vip-area-get-vip-button`
- `vip-area-access-denied-state`
- `vip-area-includes-list`
- `vip-area-does-not-include-list`

## Rule

If a selector is missing during proof, capture XML and stop. Do not fall back to coordinates unless the proof summary marks it as a weakness.
