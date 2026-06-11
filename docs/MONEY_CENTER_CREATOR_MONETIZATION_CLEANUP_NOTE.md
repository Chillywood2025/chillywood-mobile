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
