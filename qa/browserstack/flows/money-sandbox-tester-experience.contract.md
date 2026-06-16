# Money Sandbox Tester Experience Contract

Target: Android Play-installed internal tester build.

## Selectors

- `money-sandbox-setup-section`
- `money-sandbox-setup-button`
- `money-sandbox-refresh-button`
- `money-sandbox-tips-card`
- `money-sandbox-paid-video-card`
- `money-sandbox-watch-party-ticket-card`
- `money-sandbox-event-pass-card`
- `money-sandbox-channel-subscription-card`
- `money-sandbox-vip-pass-card`
- `tester-tip-creator-button`
- `tester-paid-video-unlock-button`
- `tester-watch-party-ticket-button`
- `tester-event-pass-button`
- `tester-channel-subscribe-button`
- `tester-vip-pass-button`

## Owner Setup Proof

1. Sign in as owner/operator.
2. Open Platform Studio -> Monetization / Money Center.
3. Confirm `Sandbox Tester Experience` is visible.
4. Tap `money-sandbox-refresh-button`.
5. Tap `money-sandbox-setup-button`.
6. Confirm the status is Ready or Partially configured with honest blockers.
7. Confirm each card shows Sandbox Test and Not payable.
8. Confirm live payouts/cash-out/withdrawals remain unavailable.

## Tester Proof

1. Grant the fan account with `scripts/grant-sandbox-money-tester.mjs`.
2. Sign in as the tester account.
3. Open the creator public Platform.
4. Confirm sandbox offers appear only for tester-visible flows.
5. Tap `tester-tip-creator-button`; confirm Google Play / RevenueCat sandbox tip starts and no live payout copy appears.
6. Open the public safe paid video and tap `tester-paid-video-unlock-button`.
7. Open the Watch-Party ticket gate and tap `tester-watch-party-ticket-button`.
8. Open the event pass route and tap `tester-event-pass-button`.
9. Tap `tester-channel-subscribe-button`.
10. Tap `tester-vip-pass-button`.
11. Confirm every completed transaction is sandbox/test-only/not-payable in Owner Money Center readback.
12. Revoke tester access with `scripts/revoke-sandbox-money-tester.mjs`.
13. Relaunch/refresh as the tester and confirm sandbox-only offers are no longer visible.

Do not mark this contract passed until the tester can actually see and complete the available sandbox flows on a Play-installed device.
