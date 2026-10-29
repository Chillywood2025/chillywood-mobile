# Creator and buyer event journey audit

Audit date: 2026-10-26. Baseline: `40c0cebb24f39afca0ae6c2ce2532ae4a56f4858`.
Scope is online shows and virtual admission. Assigned physical seats, venue admission,
ticket transfer/resale and auctions are not implemented or approved by this work.
The existing Live Stage Seat Pass is eligibility to request a speaking seat; host
approval still controls microphone/camera/publishing authority. It is not an
assigned theater seat. No provider account, live charge, refund or payout was used.

## Approved implementation follow-up, 2026-10-26

The inventory and EJ matrix below retain the initial audit findings against main.
This section supersedes their implementation status for the current candidate;
it does not claim deployed behavior. Parent owns final commits, PR626, full
validation and exact-head CI. No source was committed by this subagent.

| Coverage IDs | Current source implementation | Evidence and remaining limit |
| --- | --- | --- |
| EJ01–EJ05 | Event authoring persists an explicit IANA zone and UTC instants. Invalid calendar times and DST gaps fail; repeated hours require first/second choice or a matching offset. Draft/scheduled authoring remains separate from lifecycle controls. | Actual Studio save-handler tests and eight zoned-helper tests, including negative controls. Physical native date-entry/a11y evidence remains unavailable. |
| EJ06–EJ08 | New `EventSaleEditor` uses supported authoring prices with no99 default; capacity, required opening/closing windows, inclusions and replay settings become immutable revision terms. Existing bulk setup preserves prices. New ticket drafts cannot deactivate a published offer. | Mounted controls exercise chosen199-cent fixture, capacity12, exact US-zone windows, invalid/empty catalog, invalid capacity/windows and stale-owner save. Backend agent owns catalog/price/concurrency tests. These are synthetic supported prices, not new live SKUs. |
| EJ09, EJ14 | `/event/[eventId]` calls `resolve_creator_event_destination` directly and validates exact event identity. Live/replay CTA goes to `/event-watch/[eventId]`, never a feed scan or generic speaker route. Valid exact purchased replay remains visible when the older pass resolver reports an ended event. | Mounted exact live/replay tests plus wrong-event denial. Root/client agents own protected playback evidence. `EventBroadcastPreparation` is wired before Start; the coverage agent owns its room/source preparation and tests. Actual provider readiness still needs qualification. |
| EJ10–EJ13 | Checkout binds displayed revision, validated intent and store price. Immediately before SDK it atomically claims a held, unexpired, exact-user/event/offer/revision/amount reservation using a new invocation UUID. SDK requires matching `checkoutAttemptId` and `startAuthorized:true`; duplicate or uncertain claim responses never open the store. Known pre-SDK failures may cancel only an unstarted reservation; no cleanup follows claim/SDK uncertainty. My Tickets links to `/purchases`; exact-event history reads original terms and eligibility. | Production purchase script checks eleven reservation/claim mismatches, duplicate concurrent invocation, lost claim reply, failed/mismatched store lookup and cleanup failure. Sixteen precharge/iOS tests pass. Mounted event tests prove revision binding, stale-account suppression and historical-terms handling. Pending is not reported as failed or refunded. |
| EJ15–EJ16, EJ19–EJ20 | Dedicated creator publish/start/delay/reschedule/end/cancel/no-show/pause-sales controls call owner/session-bound, optimistic-concurrency RPC. Purchased schedule/duration changes require explicit material confirmation; cancellation/no-show/material change creates durable provider-review refund eligibility. No automatic money action or refund guarantee. | `20261026165705_creator_event_lifecycle_controls.sql` runs in disposable PostgreSQL. Tests check owner/session/stale edits, direct metadata/schedule/replay bypass denial, wrong-host/missing broadcast denial, eligibility ownership, unchanged pass status, permit consumption, finite-time/null-action checks and a removed-trigger negative control. Explicit no-show requires scheduled start to have passed and no verified active broadcast. No nonmaterial threshold or automatic grace period invented. |
| EJ17 | Event detail now has explicit opt-in/cancel reminder controls, current state, errors and account-change suppression using existing enrollment/outbox and notification preferences. Reminder revision includes IANA zone, lifecycle status and buyer message. | Mounted handlers bind exact event/viewer and reject stale completion. Purchases do not auto-enroll without consent. Actual push delivery, OS permission and device qualification remain unavailable. |
| EJ18 | Purchased terms show original replay policy/expiry. Direct changes to purchased replay terms fail closed. | Root owns exact replay gateway and access-window tests. No new replay duration policy or provider availability promise. |
| EJ21–EJ22 | Authority reads are bounded; exact entry and purchase history load alongside metadata. Empty, sold-out, paused/window closed, unavailable and pending recovery copy; unknown terms cannot buy; cold Back and wallet routes work. Failed creator offer refresh preserves verified settings and does not display Free. Dark Chi'llywood styling retained. | Eleven production event-route mounts, six production control mounts, three Studio mounts and date/SQL tests. Android/iOS installed UX, TalkBack/VoiceOver, large text and true native billing still unverified. |
| EJ23 | Auctions and assigned/physical seating remain design-only and separate from virtual tickets/speaking-seat eligibility. | Official billing-policy assessment is in the parent/provider audit. No auction, reserve, settlement or provider settings implemented. |

Current creator path: Studio → Live schedule → create/edit draft with time zone →
publish schedule → Configure tickets → choose supported price/capacity/windows and
inclusions → preview and publish terms → lifecycle controls. An already published
offer uses Pause new sales and republish; saving a new draft cannot silently make it
free. Existing purchased schedules use explicit lifecycle actions, not direct edit.

Current buyer path: discovery/profile/notification → exact Event → review terms →
reserved store checkout → verified/pending status → My Tickets → event waiting state
→ exact protected live or authorized replay. The latest purchase panel is history,
not an access grant; the resolver remains authoritative.

Follow-up hardening binds ticket publication to `p_expected_updated_at` under the
event row lock. The current UI always sends the previewed source version and
validates the returned title, schedule and replay terms as well as price/capacity/
sale windows. A stale preview fails before quote creation; the editor preserves
its selected price and inputs. The ninth parameter defaults to null only for
legacy eight-argument compatibility. Private lifecycle permits now explicitly
use FORCE RLS.

Lifecycle remedies also retain exact purchase-intent identity for reservations
that have no fulfilled pass. A cancellation/material change/no-show can therefore
precede a late charge without losing eligibility. Passless records are not exposed
by direct buyer table reads; the wallet requires an exact processed receipt or an
ignored receipt with an exact owned pending reconciliation obligation before
showing eligibility. Unpaid pending intents, ignored receipts without obligations,
wrong-owner obligations and verified refunds do not produce that banner. These
records never grant entry or mark money refunded.

Focused evidence covers37 tests across the event control,
route, Studio, date/time, exact configuration readback and lifecycle files;16 precharge/iOS tests passed; the quote
script passed all nine production purchase branches plus eleven reservation/claim negative
cases; focused ESLint and `git diff --check` passed. Subsequent root changes must
retain exact-head checks. The lifecycle SQL test fixtures the broadcast readiness
boundary; it does not certify LiveKit/HLS provider readiness or a full deployed
Supabase schema. The latest focused SQL run also passed explicit no-show/publish,
direct inserted metadata forgery, null action and infinite timestamp denial cases.
Configuration readback tests reject wrong source, owner, price, currency, capacity,
inclusion, zone, sale window, pause state and stale-session responses before success UI.

Supabase review used the repository assurance skill and Supabase/Postgres skills.
Current official [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
confirms that grants and ownership policies must both constrain exposed tables.
The [changelog](https://supabase.com/changelog) was checked; the relevant upcoming
HTTP TLS deprecation is an installed-client qualification concern, not authority
to change this project’s settings. Remedy tables explicitly revoke writes, enable
RLS, and allow only current owning buyers to read.

Still pending: physical/assigned-seat meaning; paid-event conversion-to-free
remedies; configurable nonmaterial schedule threshold/no-show grace; replay
business duration; real approved catalog and
store/provider qualification; host broadcast linkage qualification; deployment,
installed Android/iOS purchase/restore/delivery/media/a11y evidence. No merge or
release is authorized by this audit.

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
