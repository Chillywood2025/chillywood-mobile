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
- Paid Watch-Party Seats / Room Tickets V1 is implemented, Supabase-applied, and Play/internal sandbox-proven for purchase, active ticket creation, paid fan entry, unpaid direct-link gate, normal sold-out denial, seat-limit, and Money Center RPC readback.
- Provider path is RevenueCat / Google Play dynamic sandbox product `watch_party_live_ticket_sandbox_099` / `cw_watch_party_live_ticket_sandbox_099`; Stripe Tips is not used.
- Money Center remains the consolidated readout: Paid Watch-Party offers appear in Offers and verified room-ticket rows appear in Transactions.
- Party Waiting Room checks paid-ticket access before routing to Party Room.
- Party Room blocks unpaid paid-room direct links before camera/mic permission startup after the v45 proof build.
- Paid Watch-Party tickets unlock only the linked Party Waiting Room and Party Room. They do not include Premium, Tips, Paid Videos, VIP, subscriptions, events, Live Stage, payout access, or LiveKit authority.
- Remote proof so far is schema/RPC/readback only: ticket switches are sandbox-only, live money is off, oversell guard exists, and direct authenticated offer writes are closed.
- Play/internal v38 installed from Google Play internal testing on `R5CR120QCBF`, and creator offer setup now passes after remote backend fixes.
- Current fixture state: room code `XWAKVC`, paid offer `eab7c92b-ee11-4d27-b222-fbcc8d74df71`, status `sandbox`, seat limit `1`, product key `watch_party_live_ticket_sandbox_099`, provider product id `cw_watch_party_live_ticket_sandbox_099`.
- v40 Play/internal install proved fresh room lookup works. The original `XWAKVC` room expired under the active-room window, so fresh room `X75JHC` and offer `ca9b34b8-8815-4d9e-8a2e-34643769a29c` were created through creator-authenticated room insert plus guarded offer RPC.
- v40 `Join Now` appeared idle because the ticket-gate CTA rendered lower in the setup shell; the follow-up patch moves `Room ticket required` / `Buy Room Ticket` into the preview card.
- v44 Play/internal proof passed real Google Play sandbox ticket purchase on room `ZT5MWV` / offer `143fdf4e-e235-4f98-81a4-e22194a8550a`: transaction `fff398a9-59f6-452a-81f7-1c8e7ad04e50`, active ticket `a2108d63-8b84-4dd1-8f60-ef485ce5efdc`, seat limit `1`, seats sold `1`, paid fan Party Room entry, and normal second-unpaid denial as sold out.
- v45 Play/internal proof passed the direct-link fix and a fresh sandbox purchase on room `WNFUUF` / offer `ba02fbe7-97a7-4871-86f3-9ca62a141d76`: transaction `912a9d0a-3621-4070-826d-be2035856e47`, active ticket `8c2906da-8d02-43b2-afb9-9a7ba514fba2`, provider event `f768e840-3208-4251-ac84-95358987eb8b`, seat limit `1`, seats sold `1`, unpaid direct-link gate before permissions, and paid fan Party Room entry.
- Money Center RPC readback passed for the paid room-ticket transaction as sandbox/not-payable and separate from Tips/Paid Videos/Premium; visual Money Center screenshot remains pending.
- Remaining proof gaps: capture visual Money Center readback and provider refund/revoke if safe tooling allows.

## Paid Events V1 Follow-Up
- Paid Events V1 is implemented, Supabase-applied, and Play/internal sandbox-proven end to end.
- Provider path is RevenueCat / Google Play dynamic sandbox product `event_pass_sandbox_099` / `cw_event_pass_sandbox_099`; Stripe Tips is not used.
- Existing `creator_events` remains the event source of truth. Platform Studio event cards can save a sandbox Paid Event offer, creator profile event cards open `/event/[eventId]`, and `/event/[eventId]` gates unpaid users with `Buy Event Pass`.
- Money Center remains the consolidated readout: Paid Event offers appear in Offers and verified event-pass rows appear in Transactions.
- Paid Event passes unlock only the linked creator event. They do not include Premium, Tips, Paid Videos, Paid Watch-Party rooms, VIP, subscriptions, payout access, LiveKit authority, or live money.
- Remote migrations `20260612201011_paid_events_v1_sandbox.sql`, `20260612213500_paid_events_metadata_safe_keys.sql`, and `20260612215000_paid_events_access_grant_trigger_schema_fix.sql` are applied/recorded.
- Play/internal v46 proof on `R5CR120QCBF` created event `a100f88d-6bf5-4272-838d-2d0d83f800eb` and offer `85b2a1ae-90cd-4b75-a91f-39c42c3dad43`; Google Play / RevenueCat sandbox purchase processed provider event `95c22a83-85a1-4f5a-b6e4-e6f2cb72ad10`, consumed purchase intent `d9076cf4-cd98-4480-af0a-690f5bcc06df`, created access grant `bce269bc-7469-484f-b82f-992437a7c7f6`, active pass `3a9b2d07-d04b-45ad-b7cd-9766566e9a04`, and paid/not-payable transaction `0dc99303-baeb-489c-b5a5-8e608b63f583`.
- Unpaid/direct-link gate, paid-fan access, authenticated second-unpaid denial, Money Center visual readback, and direct client write denial passed.
- Remaining proof gaps: capacity proof is deferred because creator UI does not expose `capacity_limit`; provider refund/revoke remains deferred until safe RevenueCat/Google Play tooling or order identifiers exist.

## Channel Subscriptions V1 Follow-Up

- Channel Subscriptions V1 is implemented, Supabase-applied, and webhook-deployed in sandbox mode, but Play/RevenueCat sandbox purchase proof is still pending.
- Provider path is RevenueCat / Google Play subscription product `channel_subscription_sandbox_monthly_499` / `cw_channel_subscription_sandbox_monthly_499`; Stripe Tips is not used.
- RevenueCat entitlement id is `creator_channel_subscription`.
- Money Center remains the consolidated setup/readout: creators can enable/pause one sandbox monthly Channel Subscription offer in Ways to Earn, offers appear in Offers, and verified subscription rows appear in Transactions after provider proof.
- Fan surface is the creator channel header/card with `Subscribe`; subscriber-only proof route is `/channel-subscription/[creatorId]`.
- Channel Subscriptions unlock only subscriber state for that creator channel. They do not include Chi'llwood Premium, VIP, Paid Videos, Paid Watch-Party tickets, Paid Events, Tips, LiveKit authority, payout access, cash-out, withdrawal, transfer, platform-wide badge/status, or other creators.
- Remote migration `20260612224536_channel_subscriptions_v1_sandbox.sql` is applied and `revenuecat-webhook` is redeployed.
- EAS Play/internal build `da86b3e9-145f-45a4-9f84-d713d906dc98` was started for versionCode `48`, but remained `IN_PROGRESS` with no AAB artifact after repeated polling; Play submission and device purchase proof are still pending.
- Remaining proof gaps: Play/internal subscription purchase sheet, signed webhook event, active subscription row, Money Center visual transaction readback, second-unsubscribed denial after purchase, and cancellation/expiration/revoke if safe provider tooling allows.
