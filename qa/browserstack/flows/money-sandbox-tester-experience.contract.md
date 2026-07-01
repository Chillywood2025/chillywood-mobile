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
- `tip-sheet`
- `tip-confirm-button`
- `paid-video-lock-card`
- `paid-video-player-ready`
- `watch-party-ticket-purchase-button`
- `event-pass-purchase-button`
- `subscriber-area-subscribe-button`
- `vip-area-get-vip-button`

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
10. If Watch-Party Seat Pass is missing, confirm `Create a Party Room before testers can buy a ticket` and `money-sandbox-create-party-room-target-button`.
11. Confirm live payouts/cash-out/withdrawals remain unavailable.

## Tester Proof

1. Grant the fan account with `scripts/grant-sandbox-money-tester.mjs`.
2. Sign in as the tester account.
3. Open the creator public Platform.
4. Confirm `Test Creator Purchases` appears with `Sandbox only. No real money moves.`
5. Confirm sandbox offers appear only for tester-visible flows.
6. Tap `tester-tip-creator-button`, confirm `tip-sheet`, then tap `tip-confirm-button`; confirm Google Play / RevenueCat sandbox tip starts and success says no money moved/no payout created.
7. Open the public safe paid video and tap `tester-paid-video-unlock-button`.
8. Open the Watch-Party Seat Pass gate from `tester-watch-party-ticket-button` and tap `watch-party-ticket-purchase-button`, or confirm the public tester surface says the creator needs a Party Room target.
9. Open the event pass route from `tester-event-pass-button` and tap `event-pass-purchase-button`.
10. Tap `tester-channel-subscribe-button`; on Subscriber Area use `subscriber-area-subscribe-button` if purchase is still required, then confirm receipt-style copy says no money moved/no payout created.
11. Tap `tester-vip-pass-button`; on VIP Area use `vip-area-get-vip-button` if purchase is still required, then confirm receipt-style copy says no money moved/no payout created.
12. Confirm every completed transaction is sandbox/test-only/not-payable in Owner Money Center readback.
13. Revoke tester access with `scripts/revoke-sandbox-money-tester.mjs`.
14. Relaunch/refresh as the tester and confirm sandbox-only offers are no longer visible.

Do not mark live money production-ready from this contract. Passing this contract proves sandbox tester UX only: no real charges, no payouts, no creator earnings, no Premium unlock, and no LiveKit authority.

## June 16, 2026 Device Proof Notes

Proof folder: `/tmp/chillywood-sandbox-money-fixtures-proof-20260616-135025`.

Passed on Play-installed Android `R5CR120QCBF`:

- `tester-tip-creator-button`
- `tester-paid-video-unlock-button`
- `tester-watch-party-ticket-button`
- `tester-event-pass-button`
- `tester-channel-subscribe-button`

Fixture notes:

- Watch-Party Seat Pass fixture room `W3JJHH` must be refreshed immediately before proof because active room freshness is intentionally limited.
- Paid Video proof uses playable fixture video `f8ef0e22-14f0-4ff7-a838-f133f11a1d20`.
- Do not use coordinate taps for these controls; selector taps were sufficient after the route fixes.

## June 16, 2026 Final Proof Notes

VIP clean-tester proof folder: `/tmp/chillywood-vip-after-play-refund-proof-20260616-180235`.

Final three-flow proof folder: `/tmp/chillywood-sandbox-money-final-three-proof-20260616-183633`.

Passed on Play-installed Android `R5CR120QCBF`:

- `tester-vip-pass-button`: first-time Google Play sandbox VIP purchase completed; app landed on VIP Area; backend readback showed creator-specific VIP only, not Premium, not payable, and no payout/LiveKit authority.
- `tester-paid-video-unlock-button`: Google Play sandbox paid-video purchase completed; Player opened playable media for fixture `f8ef0e22-14f0-4ff7-a838-f133f11a1d20`.
- `tester-watch-party-ticket-button`: Google Play sandbox Seat Pass purchase completed for offer `290bf6f9-67ec-4073-8b88-32a1b167bb9e` / room `W3JJHH`; app reached the room permission path. Camera/mic prompts were denied, so room media join and LiveKit publish authority are not claimed by this proof.
- `tester-event-pass-button`: Google Play sandbox event pass purchase completed for event `a9167135-d3cc-4349-bf8a-46dfd9068806`; app showed `Event pass confirmed`.
- Revoke/security: resolver returned false, direct stale purchase intent returned `sandbox_monetization_tester_required`, and fresh restart hid sandbox CTAs.

Current label: `6/6 Play-installed sandbox tester flows proven` for Android sandbox mode. Future BrowserStack work should treat this as a regression contract unless a real app regression appears.
