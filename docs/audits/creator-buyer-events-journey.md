# Creator and buyer event journey audit

Audit date: 2026-10-26. Baseline: `40c0cebb24f39afca0ae6c2ce2532ae4a56f4858`.
Scope is online shows and virtual admission. Assigned physical seats, venue admission,
ticket transfer/resale and auctions are not implemented or approved by this work.
The existing Live Stage Seat Pass is eligibility to request a speaking seat; host
approval still controls microphone/camera/publishing authority. It is not an
assigned theater seat. No provider account, live charge, refund or payout was used.

## Selected manifests and evidence limits

Read `AGENTS.md`, `app/AGENTS.md`, `.agents/skills/chillywood-assurance/SKILL.md`.
Relevant entries in `config/assurance/feature-registry-v1.json` are
`storekit-google-play-billing`, `creator-money-ledger`, `live-stage`,
`watch-party-live`, `notifications-fcm`, and `protected-media-playback`. That
registry has no dedicated complete paid-event journey entry and its historical
states are not certification. This audit binds the actual files below instead.

Native dependencies: RevenueCat/StoreKit/Google Play Billing for purchases;
Expo notifications/FCM for reminders; LiveKit and protected media for entry/playback.
Android and iOS require separate installed purchase, delayed fulfillment,
restore/re-entry, refund/revocation and accessibility qualification. Local React
mounts prove handlers and state transitions, not physical interaction or billing.
Rollback is ordinary source revert; do not change provider catalogs or deploy a
migration merely to demonstrate a local source result.

## Route and data inventory

| Actor / entry | Production route or source | Data / downstream boundary |
| --- | --- | --- |
| Creator schedule | `/channel-studio?tab=live&focus=schedule`; rendered implementation `app/channel-settings.tsx` | `createCreatorEvent`, `updateCreatorEvent`, `readCreatorEventSummaries` in `_lib/liveEvents.ts`; `creator_events` RLS writes |
| Creator paid setup | Schedule event card Free/Paid; Money Center Event Pass manager | `savePaidCreatorEventOffer` → `set_paid_creator_event_offer`; `paid_creator_events`; setup key `event_pass_sandbox_099` |
| Creator transactions | `/channel-studio?tab=monetization`, Transactions | `list_my_paid_creator_event_transactions`; Money Center audit rows; payout status is not spendable balance |
| Buyer discovery | Home (`app/(tabs)/index.tsx`, up to24 public events), Live (`app/(tabs)/live.tsx`, up to32), profile events (`app/profile/[userId].tsx`), platform discovery | `readLatestPublicEventSummaries`, public event summaries, discovery rows; draft excluded; visibility enforced independently |
| Exact event | `/event/[eventId]` | Direct `creator_events` metadata read, `resolve_paid_creator_event_pass_access`, public/circle discovery feed reads |
| Checkout | `_lib/paidCreatorEvents.ts::purchasePaidCreatorEventPass` | Account authority capture, authoritative offer, purchase intent, RevenueCat product, verified access polling; no optimistic entitlement |
| Payment processing | `supabase/functions/revenuecat-webhook/index.ts` | Verified provider event/intent, `paid_creator_event_transactions`, `paid_creator_event_passes`, money ledger; backend audit owns SQL/concurrency evidence |
| Entry/replay | Event CTA → `/spectate/[itemId]` | Discovery item and protected spectator authority; never generic room/speaker privilege |
| Reminder enrollment | Public profile Event card | `_lib/notifications.ts::setEventReminderEnrollment`; `event_reminders` |
| Notification return | Event-pass purchase notice / reminder | `_lib/notifications.ts`, RevenueCat webhook notifications, notification deep-link `/event/[eventId]` |
| Buyer library | `/library` redirects to `/(tabs)/my-list` | No Event Pass library/query found in current My List route; store purchase history and individual event receipt are not a durable in-app ticket wallet |

Creator event fields: title, type, visibility, lifecycle status, UTC `starts_at` /
`ends_at`, linked title, replay policy/availability/expiry, reminder readiness.
Paid offer fields: separate offer ID/event ID/creator ID, description, price,
currency, capacity, passes sold, status, provider/product mapping.
Pass/transaction records have a separate financial identity. Editing an event
title or schedule must not rewrite purchase identity or amount.

## Stable journey and repair matrix

Legend: **implemented** = supported by inspected production source, not deployed
or physically qualified; **defect fixed** = repaired and locally tested in this
candidate; **missing** = no complete product path found; **decision** = behavior
needs owner policy; **unavailable evidence** = cannot establish from local tests.

| ID | Journey step / scenario | Evidence and classification | Candidate repair / remaining work |
| --- | --- | --- | --- |
| EJ01 | Create Sunday8PM show before it happens | **Implemented** draft and scheduled creator records, public/circle/private visibility, exact-event pass intent. Event is saved before paid setup; native store offer remains sandbox99 path. | Advance scheduling exists. This does not establish complete production advance-sales readiness. |
| EJ02 | Edit/draft/publish | **Implemented**, with **defect fixed**: nullable fields used `??` so clearing end/start/link/replay dates silently restored old values. | Explicit `null` clears; omitted fields preserve; scheduled start cannot be cleared; draft may clear it. Validation prevents writes on invalid date or wrong host. |
| EJ03 | Local timezone / DST | **Defect fixed**: JavaScript silently moved spring-gap times and selected one repeated fall hour; buyer date omitted timezone/year. | Production parser rejects nonexistent/ambiguous local times and invalid calendar dates; explicit offset resolves fold; repeated-hour editing retains exact ISO instant; buyer sees timezone/year. Originating IANA zone and reschedule timezone selection remain **missing/decision**. |
| EJ04 | Creator-set fixed initial price | **Missing** for events: `onSavePaidEventOffer` hardcodes99 and sandbox key; existing setter accepts only existing sandbox99 catalog contract. | Do not add an input that provider validation rejects. Plan supported creator-selected tiers and exact immutable purchase quote; no price/catalog changes here. |
| EJ05 | Store price versus displayed price | **Defect fixed**: matching product ID alone did not verify native quote. | Event caller now uses shared `isCreatorMoneyStoreQuoteMatch` against validated intent amount/currency before native billing. Missing/different quote stops before charge. Physical store readback remains unavailable. |
| EJ06 | Sale opening / closing times | **Missing** separate sale-window editor/data contract. Show start/end are not explicit sale windows. | Decide advance-sale opening, late sales, closing and handling delayed fulfillment; do not silently reinterpret show time as sale time. |
| EJ07 | Capacity / oversell | Capacity fields exist, but creator UI always sends `capacityLimit:null`; **missing** usable capacity setup. Browser/UI checks cannot prove concurrency. | Backend ledger covers locking/concurrency. Provider charge before fulfillment has a paid-but-no-capacity gap requiring reservation/expiry/compensation policy. |
| EJ08 | What ticket includes | **Implemented** exact-event wording clearly excludes Premium, VIP, channel subscription, room/stage/speaking seats, other videos and host rights. | Preserve scope separation. Replay purchase promise is incomplete; decide whether each event ticket includes replay and for how long. |
| EJ09 | Discoverability | **Implemented** public event rails/profile and notification deep-links. Lists are capped and ordered; private and circle audience are separate. | **Defect/unresolved**: event page finds destination only within50 public +50 circle feed items. A valid purchase is not guaranteed to find its live/replay destination. Need authoritative event-specific resolver, not a room-access bypass. |
| EJ10 | Pending / failed / cancelled native purchase | **Implemented** verified access polling, error/cancellation messages, no optimistic pass. | Poll timeout is not proof of failure. Durable pending receipt and reconciliation in buyer library are **missing**. Buyer must not be told to repeatedly pay. |
| EJ11 | Duplicate tap / existing purchase | **Implemented** single-flight latch, validated already-purchased intent, account revalidation before charge. | Backend idempotency and concurrent checkout evidence belong to event/backend matrix; native double-tap/restore qualification unavailable. |
| EJ12 | Account or route changes during purchase | **Defect fixed** event page previously accepted old async result into current screen. | Account callback clears access/destination; request generation invalidates old loads; purchase-context guard rejects old result/receipt. Full production React screen test and negative control reproduce old behavior. This is scoped event UI handling, not a new general logout review. |
| EJ13 | Receipt / ticket library | **Implemented** exact-event success receipt and notification. **Missing** durable buyer Event Pass collection, pending/refunded state list, purchase support entry. | Plan My Tickets in Library with event/time/price/status and exact event deep-link; do not substitute seller transaction list or store history for an in-app wallet. |
| EJ14 | Entry before / at / after show | **Implemented** scheduled state never opens live entry even when access is owned; `live_now` plus authorized destination opens; terminal states block purchase. | Auth/read failures remain closed; underlying stage/playback still authorizes. Latest historical resolver (`20260827221500_historical_creator_access_lifecycle_closure.sql`) excludes ended/expired/canceled source states, but `replay_available` is nonterminal and can authorize a historical pass. Replay destination, event replay window and protected media entitlement are not proven unified end-to-end; this is a partial path, not a blanket replay denial. |
| EJ15 | Creator start / delay / reschedule | Status/time editor exists; no dedicated start/delay/reschedule workflow tied atomically to real room broadcast. `rescheduled` presentation branch is not a supported `CreatorEventStatus`. | **Missing/decision**: define authoritative lifecycle, buyer notice and consent/eligibility after material change. Do not equate manual `live_now` with actual stream/media. |
| EJ16 | Creator cancellation / no-show | **Implemented** canceled event display and entry denial. **Missing** no-show workflow or automatic financial resolution. | Removed misleading “nothing you need to do” purchase advice; canceled page directs buyer to store history/support without refund promise. Refund timing/eligibility is an owner/provider decision. |
| EJ17 | Reminders and changes | Enrollment on profile is **implemented**; latest `20261010181246_discovery_notification_activity_producers.sql` queues starts-soon15min, updated/canceled events with revision checks and active subscriptions. | Do not rely on older “delivery later” docs. Event detail lacks reminder CTA; automatic enrollment/notification of every ticket holder not established. Actual push delivery is **unavailable evidence**. |
| EJ18 | Replay and expiry | Creator config, summary and presentation exist. **Defect fixed** indefinite policy retained stale expiry; exact expiry second was still shown available. | Clears obsolete indefinite expiry; expires at boundary. Paid replay entitlement and protected media lifecycle remain backend/design gap; no replay promise added. |
| EJ19 | Refund / revocation / disputes | Provider/ledger paths audited separately; event route refreshes authoritative pass and fails closed. | No buyer self-service event refund or dispute workflow found. Do not promise automatic cancellation refunds, payouts or store fee amounts. Sandbox/local source cannot prove store reversals. |
| EJ20 | Stop sales versus make free | Current UI Free sends canceled offer; existing resolver treats absence of active offer as free. | Backend repair updates current offer instead of leaving it active. **Decision** remains explicit Make free versus Pause new sales versus Cancel event, preserving paid-holder remedies. No new semantics introduced here. |
| EJ21 | Loading / empty / error / sold-out / recovery | **Defect fixed** sold-out resolver had no offer/required-purchase and was mislabeled generic setup unavailable. | Dedicated sold-out state; no buy button; error refresh CTA; account-safe receipt; cold Back falls home; network authority error copy says verification failed. Root loading still depends on all metadata/feed reads, so hung feed/timeout handling needs further qualification. |
| EJ22 | Accessibility and branding | Existing dark Chi'llywood palette retained. Event editor field/chip/check/save accessibility metadata added; result/error announcements and refresh button added. | Local mounted tests verify handlers; VoiceOver/TalkBack, keyboard, dynamic type, contrast and physical narrow-screen interaction remain **unavailable evidence**. |
| EJ23 | Auctions / physical seating | **Decision/missing**, no implementation. Digital passes use fixed store products; speaking eligibility is not physical seating. | Default fixed price/capacity recommendation. Optional auction design requires platform/store constraints, final-price binding, failed-winner payment, settlement/oversell policy. VIP remains separate. |

## Tests and negative controls

New `tests/creator-event-schedule.test.mjs` executes complete production schedule,
event-write and presentation modules. Only its Supabase transport is synthetic.
Six tests cover two US zones, Sunday8PM across DST, invalid/gap/fold times,
explicit offset selection, editing the repeated hour, omitted-versus-cleared
fields, wrong-host/no-write, required schedule, replay boundary, sold-out and
future entry. A source mutation restores `??` and reproduces the failed clear.
This is client execution evidence, not RLS/Postgres evidence.

New `tests/creator-event-route-mounted.test.mjs` mounts the complete production
React event screen with native/network boundaries controlled. Three tests prove
sold-out and cold Back, old-account pending purchase suppression, and a negative
control removing the production guard which displays the stale receipt.

New `tests/creator-event-studio-mounted.test.mjs` mounts the complete Studio
screen and executes its actual save handler. Two tests establish that invalid
calendar input shows actionable guidance without calling create, and an explicit
Sunday8PM offset produces the correct scheduled UTC payload with cleared optional
fields. These use a synthetic creation boundary, not a deployed creator account.

Existing `tests/customer-experience-production-polish.test.mjs` and
`tests/party-room-live-stage-event-monetization-ux-rfgc.test.mjs` pass with the new
schedule tests (32 total). Mounted event tests pass3/3. The Studio harness now
loads the actual schedule module; `tests/creator-money/money-center-focus-policy.test.mjs`
passes5/5, and the new Studio event save-handler tests pass2/2. The shared store quote integration suite is recorded in the client
monetization audit. Parent report owns full checks, exact-head CI and final diff
review results; these focused tests do not establish release readiness.

## Recommended end-to-end design for owner decisions

1. Keep online fixed-price event admission distinct from speaking-seat eligibility,
   room admission, VIP and Premium. Confirm whether physical events are required.
2. Add creator-selected supported fixed tiers, explicit virtual capacity and sales
   window; freeze amount/currency/product/terms on each intent. Do not allow later
   edits to change agreed purchase amounts.
3. Add durable reservations and delayed-payment reconciliation before enabling
   limited advance sales. Define an operator-assisted outcome for paid fulfillment
   after capacity or lifecycle closure rather than promise a refund algorithm.
4. Add My Tickets and an exact-event destination service, reminder enrollment on
   event detail, creator start/delay/reschedule/cancel controls and paid-holder
   notification requirements. Keep provider receipts and in-app entitlement
   records separate and reconcilable.
5. Decide replay inclusion/expiry and cancellation/reschedule/no-show remedies,
   then implement source/database/provider qualification in separate bounded
   reviewed changes. Auctions need a separate approved design; no silent bidding,
   reserve or pricing/provider changes belong to this repair candidate.
