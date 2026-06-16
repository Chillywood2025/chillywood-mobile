# Money Sandbox Tester Experience Contract

Target: Android Play-installed internal tester build.

## Selectors

- `money-sandbox-setup-section`
- `money-sandbox-setup-button`
- `money-sandbox-refresh-button`
- `money-sandbox-open-tester-preview-button`
- `money-sandbox-manage-testers-button`
- `money-sandbox-create-party-room-target-button`
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
6. Confirm top summary shows `Sandbox Testing`, `X of 6 ready`, `Live Money: Off`, `Payouts: Off`, and an exact `Next Step`.
7. Confirm the four-step checklist appears: Configure offers, Grant tester, Test flows, Revoke tester.
8. Confirm the setup button exits `Setting up` into Ready, Partially Ready, Failed, or Timed out.
9. Confirm each card shows Ready, Needs setup, or Blocked plus `Sandbox only · No payouts`.
10. If Watch-Party Ticket is missing, confirm `Create a Party Room before testers can buy a ticket` and `money-sandbox-create-party-room-target-button`.
11. Confirm live payouts/cash-out/withdrawals remain unavailable.

## Tester Proof

1. Grant the fan account with `scripts/grant-sandbox-money-tester.mjs`.
2. Sign in as the tester account.
3. Open the creator public Platform.
4. Confirm `Test Creator Purchases` appears with `Sandbox only. No real money moves.`
5. Confirm sandbox offers appear only for tester-visible flows.
6. Tap `tester-tip-creator-button`; confirm Google Play / RevenueCat sandbox tip starts and success says no money moved/no payout created.
7. Open the public safe paid video and tap `tester-paid-video-unlock-button`.
8. Open the Watch-Party ticket gate and tap `tester-watch-party-ticket-button`, or confirm the public tester surface says the creator needs a Party Room target.
9. Open the event pass route and tap `tester-event-pass-button`.
10. Tap `tester-channel-subscribe-button`; confirm receipt-style copy says no money moved/no payout created.
11. Tap `tester-vip-pass-button`; confirm receipt-style copy says no money moved/no payout created.
12. Confirm every completed transaction is sandbox/test-only/not-payable in Owner Money Center readback.
13. Revoke tester access with `scripts/revoke-sandbox-money-tester.mjs`.
14. Relaunch/refresh as the tester and confirm sandbox-only offers are no longer visible.

Do not mark this contract passed until the tester can actually see and complete the available sandbox flows on a Play-installed device.
