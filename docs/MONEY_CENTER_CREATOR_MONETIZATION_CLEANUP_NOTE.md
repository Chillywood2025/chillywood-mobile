# Money Center Creator Monetization Cleanup Note

## Duplicate Cards Found
- Platform Studio Home had separate Creator Balance, Payouts, and Provider Status rows outside the Money Center tab.
- Money Center had separate Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Future Tools, and Technical checks sections.

## Duplicate Routes Found
- `/monetize`, `/revenue`, and `/payouts` were already compatibility redirects into Platform Studio Money Center.
- `/creator-monetization-setup` was a separate creator setup dashboard.

## Duplicate Setup Prompts Found
- Tips, paid content, room/ticket, event pass, and merch setup prompts pointed to the separate creator monetization setup route.
- Payout setup stayed inside Money Center Payouts and was not duplicated after cleanup.

## Duplicate Payout/Tax/Provider Panels Found
- Platform Studio Home duplicated Money Center Payouts and Provider Status entry points.
- Money Center Technical checks duplicated Provider Status for creators.
- Tax & Legal remains a single Money Center section.

## Removed
- Separate creator-facing `/creator-monetization-setup` dashboard UI.
- Separate Money Center sections for Digital Sales, Tips, Watch-Party Seats, Paid Content, Merch, Creator Balance, Future Tools, and Technical checks.
- Separate Platform Studio Home rows for Creator Balance, Payouts, and Provider Status.

## Redirected Into Money Center
- `/creator-monetization-setup` now redirects to `/channel-studio?tab=monetization&focus=offers`.
- Legacy Money Center focus values for revenue, balance, paid content, merch, technical checks, and future tools map into Overview, Offers, or Provider Status.

## Became Shared Components/Catalog
- The six creator monetization flows now come from `_lib/creatorMonetizationFeatures.ts`.
- Money Center Ways to Earn renders from that shared catalog instead of hardcoded duplicate label sets.

## Tips V1 Follow-Up
- Tips is now implemented as the first end-to-end creator contribution path in test/sandbox mode.
- Money Center remains the setup/management home: creator enable/pause, payout connection, provider readiness, and verified tip transaction readout all live there.
- Fan Tip CTA is limited to the creator channel header for V1.
- Tips do not unlock content, badges, VIP, rooms, paid videos, subscriptions, event access, Watch-Party seats, public rewards, Premium, LiveKit authority, or payout access.
- Stripe checkout and webhook verification are server-side only; mobile never stores provider secrets and never marks a tip paid.
- Other creator monetization flows remain readiness-only or blocked unless separately built.

## Paid Videos V1 Follow-Up
- Paid Videos V1 is now implemented for RevenueCat / Google Play sandbox testing, but not yet Play-installed sandbox-proven end to end.
- June 11 proof attempt stopped before checkout because attached device `R5CR120QCBF` had `com.chillywood.mobile` versionCode `32` installed with `installer=null`; a Play/internal tester runtime with installer `com.android.vending` and the Paid Videos V1 code is required.
- Creator setup stays in the existing creator video upload/edit flow: Free or Paid Unlock plus price.
- Money Center remains the consolidated readout: Paid Video offers appear in Offers and verified sandbox unlock rows appear in Transactions.
- Paid Video purchases use the Android digital product path, not Stripe Tips.
- Verified RevenueCat webhook events create shared access grants, mirrored content access grants, and sandbox/not-payable ledger rows.
- Paid Videos unlock only the purchased creator video. They do not include Premium, subscriptions, VIP, live rooms, Watch-Party seats, Tips, events, other creator content, payout access, or LiveKit authority.
