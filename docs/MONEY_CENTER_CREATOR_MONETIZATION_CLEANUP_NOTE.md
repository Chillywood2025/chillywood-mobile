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
- Paid Videos V1 is now implemented and happy-path sandbox-proven through RevenueCat / Google Play on a Play-installed internal tester runtime.
- June 11 proof used attached device `R5CR120QCBF` with `com.chillywood.mobile` versionCode `37` and installer `com.android.vending`.
- Manual Google Play sandbox purchase consumed purchase intent `949b076d-81dd-44f0-b2d8-ce514ebb7348`, processed provider event `f0006ba1-495f-4353-875e-40db2c9e7a5f`, created access grant `71967fff-b913-4390-8b3d-aef4f4e77726`, mirrored content grant `1b6cf126-bb80-4dd6-b724-7b804765c3f9`, and wrote ledger event `7f237e32-bdfc-4394-9bb3-f8537cae8e38` as sandbox/not-payable.
- Creator setup stays in the existing creator video upload/edit flow: Free or Paid Unlock plus price.
- Money Center remains the consolidated readout: Paid Video offers appear in Offers and verified sandbox unlock rows appear in Transactions.
- Paid Video purchases use the Android digital product path, not Stripe Tips.
- Verified RevenueCat webhook events create shared access grants, mirrored content access grants, and sandbox/not-payable ledger rows.
- Paid Videos unlock only the purchased creator video. They do not include Premium, subscriptions, VIP, live rooms, Watch-Party seats, Tips, events, other creator content, payout access, or LiveKit authority.
- Follow-up proof passed paid-fan cold-start direct-link access, logged-out direct-link denial, exact grant scoping to the paid fan, direct anon client write denial, creator fixture login repair, Money Center visual transaction readback, and authenticated second-unpaid-fan direct-link denial.
- Remaining provider proof gap: refund/revoke status waits on RevenueCat/Google Play refund tooling and safe order identifiers.

## Paid Watch-Party Seats V1 Follow-Up
- Paid Watch-Party Seats / Room Tickets V1 is implemented and Supabase-applied, but not Play/internal sandbox-proven yet.
- Provider path is RevenueCat / Google Play dynamic sandbox product `watch_party_live_ticket_sandbox_099` / `cw_watch_party_live_ticket_sandbox_099`; Stripe Tips is not used.
- Money Center remains the consolidated readout: Paid Watch-Party offers appear in Offers and verified room-ticket rows appear in Transactions.
- Party Waiting Room checks paid-ticket access before routing to Party Room.
- Party Room re-checks paid-ticket access before membership/session/presence setup so direct deep links cannot bypass the ticket gate.
- Paid Watch-Party tickets unlock only the linked Party Waiting Room and Party Room. They do not include Premium, Tips, Paid Videos, VIP, subscriptions, events, Live Stage, payout access, or LiveKit authority.
- Remote proof so far is schema/RPC/readback only: ticket switches are sandbox-only, live money is off, oversell guard exists, and direct authenticated offer writes are closed.
- Play/internal v38 installed from Google Play internal testing on `R5CR120QCBF`, and creator offer setup now passes after remote backend fixes.
- Current fixture state: room code `XWAKVC`, paid offer `eab7c92b-ee11-4d27-b222-fbcc8d74df71`, status `sandbox`, seat limit `1`, product key `watch_party_live_ticket_sandbox_099`, provider product id `cw_watch_party_live_ticket_sandbox_099`.
- v40 Play/internal install proved fresh room lookup works. The original `XWAKVC` room expired under the active-room window, so fresh room `X75JHC` and offer `ca9b34b8-8815-4d9e-8a2e-34643769a29c` were created through creator-authenticated room insert plus guarded offer RPC.
- v40 `Join Now` appeared idle because the ticket-gate CTA rendered lower in the setup shell; the follow-up patch moves `Room ticket required` / `Buy Room Ticket` into the preview card.
- Remaining proof gaps: next Play/internal install, unpaid gate, real RevenueCat/Google Play sandbox ticket purchase, provider-created transaction/ticket, paid fan entry, second unpaid denial, Money Center visual readback, seat-limit proof, and provider refund/revoke if tooling allows.
