# Creator/buyer client monetization audit

Audit date: 2026-10-26. Source base: `40c0cebb24f39afca0ae6c2ce2532ae4a56f4858`.
This records source evidence and local synthetic execution. No provider configuration,
private user records, charge, payout, release or installed-device qualification was performed.
The account/logout, Studio cutover, deletion and Brand reviews are not reopened.

## Route and data inventory

The table records the initial audited baseline. The approved implementation update
below supersedes the original pricing and missing-library dispositions.

| Mode | Creator route and authoring | Buyer route and access | Authority / data / tests |
| --- | --- | --- | --- |
| Tips | `/channel-studio?tab=monetization&focus=ways_to_earn&manage=tips` → `app/channel-settings.tsx` | `components/monetization/tip-sheet.tsx` on channel/video/live surfaces; `/tip-status` | `_lib/creatorTips.ts`; `create_money_purchase_intent` or `create_ios_app_store_purchase_intent`; `creator_tip_transactions`; `stripe-tip-buyer-authority`, `stripe-tip-webhook-lifecycle`, client precharge tests |
| Paid Videos | Studio offers → exact video setup; toggle Free/Paid; current editable state is coerced to $0.99 | `/player/[id]`; `/library` redirects to `/(tabs)/my-list` with unlocked videos | `_lib/creatorPaidVideos.ts`; `set_creator_content_price`, `resolve_creator_content_access`; `creator_content_prices`, provider-backed `access_grants`; paid-video playback, protected-media parent safety, cross-store concurrency tests |
| Party Room Pass | Studio offers/room creation; current sandbox tier $0.99 | `/watch-party` waiting room → `/watch-party/[partyId]` | `_lib/paidWatchPartyTickets.ts`; `set_paid_watch_party_offer`, `resolve_paid_watch_party_ticket_access`, purchase intent; `paid_watch_party_offers`; client access normalizer and precharge tests |
| Platform Subscription | Studio ways to earn; $4.99/month sandbox catalog | `/channel-subscription/[creatorId]`, channel entry; explicit restore action | `_lib/channelSubscriptions.ts`; creator channel offer/access/purchase RPCs; subscriber grant lifecycle; specialized iOS intent tests and product doctrine tests |
| VIP Pass | Studio ways to earn and VIP video shelf; $4.99 sandbox catalog | `/vip-pass/[creatorId]`; creator-specific shelf, expiry displayed | `_lib/creatorVipPasses.ts`; creator VIP offer/access/purchase RPCs; 30-day lifecycle; specialized iOS intent and access normalizer tests |
| Event Pass | Studio event creation/offers | `/event/[eventId]` and event destination | `_lib/paidCreatorEvents.ts`; separate event journey/backend reports cover this lane |
| Live Stage Pass and Seat Pass | Studio live controls; sandbox $0.99; distinct entry/seat offers | `/watch-party/live-stage/[partyId]` | `_lib/liveWatchPartyMoney.ts`; `create_live_watch_party_purchase_intent`, `resolve_live_watch_party_money_access`; `paid_live_watch_party_offers`, `paid_live_watch_party_passes`; host approval remains required for speaking |
| Premium | Platform subscription management; not creator revenue | `/subscribe`; premium entitlement | `_lib/monetization.ts`, `_lib/revenuecat.ts`, premium readiness tests; remains separate from every creator pass |
| Physical merch readiness | Admin sandbox proof route; creator setup tier catalog | Admin-only Stripe sandbox checkout launcher | `_lib/creatorMonetizationSetup.ts`; physical goods only; no evidence of a complete public physical-event/seating product |

`/monetize` and `/revenue` redirect to Studio monetization offers/balance. The canonical
creator/viewer destinations are in `_lib/creatorMonetizationRouteTargets.ts`.
App feature inventory consulted: `config/assurance/feature-registry-v1.json` entries
`revenuecat-premium` and `creator-money-ledger`; their historical status is not current proof.
Platform scope is Android and iOS separately. Native dependencies include RevenueCat
Purchases and store billing; Stripe Connect is a creator payout readiness boundary.

## Findings and bounded repairs

| ID | Classification | Evidence and impact | Disposition |
| --- | --- | --- | --- |
| C-01 | Reproducible client defect | All contextual clients validated an intent then selected a RevenueCat product by identifier alone. A changed store price/currency could open checkout despite a different displayed/authorized offer. | Fixed with `_lib/creatorMoneyStoreQuote.ts` across tips, Paid Video, Party Room, VIP, subscription package/product and Live Stage entry/seat. Event integration is covered by the event lane. Missing/malformed/foreign-currency quotes fail closed; no catalog price changed. |
| C-02 | Reproducible navigation defect | Subscription Back and tip status Done used `router.back()` without a cold-link fallback. | Fixed: subscription returns to creator channel or tabs; tip Done returns to tabs when no history. Added accessible button semantics on tip Done; colors/background untouched. |
| C-03 | Implemented restriction, unmet new requirement | `channel-settings.tsx` `savePaidVideoSetup` rejects every paid amount except 99; toggle sets `priceDollars` to `0.99`. Latest `set_creator_content_price` wrapper in migration `20260827210000_creator_video_protected_authority_closure.sql` binds amount to `paid_content_access_sandbox_099` Google Play sandbox catalog. Room and event initial setters likewise enforce 99. | User's $0.99 observation is supported by source, not device reproduction. Creator price choice is not fully implemented. Do not silently remove UI validation while backend/catalog remain one-tier. |
| C-04 | Design/integration gap | Static iOS configuration has USD 99/299/499/999 tiers for multiple concepts, but cross-platform authoring currently binds to the single Google Play tier. | Recommend server-provided available-price options bound to concept/platform/environment/currency/product and creator selection. Catalog readiness must be verified separately; no provider configuration changes authorized here. |
| C-05 | Missing product feature | `/library` → My List includes saved titles, unlocked creator videos, progress, followed Platforms and saved replays. No unified receipts, Event/Room/Stage passes, subscriptions or VIP wallet was found there. | Recommend a buyer Purchases destination with clear pending/active/expired/refunded/revoked states, exact purchase receipt and destination recovery. Do not claim a complete ticket library exists. |
| C-06 | Reproducible reachable admin tooling defect | `app/admin-money-sandbox-purchases.tsx` `runSandboxPurchase` trusted a non-error generic intent, only inspected already-owned booleans, and loaded product by static ID without exact subject/source/amount validation. Admin/tester access limits reachability but is not purchase binding. | Fixed by opening the normal contextual buyer route instead of constructing a generic charge. `_lib/creatorSandboxPurchaseDestination.ts` preserves exact video/creator/event ID; Room/Stage offer IDs resolve to exact party IDs through current RLS reads and fail closed on mismatch/unavailability. Account identity is revalidated before navigation. Tester selection, iOS Stage boundary and physical-merch utility remain available. No real purchases attempted. |
| C-07 | Unreachable legacy helper risk | `_lib/creatorMonetizationSetup.ts` `launchCreatorSandboxDigitalPurchase` hardcodes amount metadata99 and does not validate returned intent. `rg` found no app/component callsite; only declaration and guard reference. | Keep unreachable. Remove or replace before reuse; do not expose it as creator-variable pricing. |
| C-08 | Error-state ambiguity | Per-mode creator transaction list helpers often return `[]` on RPC error, indistinguishable from genuine zero transactions to a caller. Paid Video offer loading supports strict throw-on-unavailable, but transaction helpers do not. | Recommend typed unavailable results and explicit Retry in all activity sections. Do not infer zero earnings from failed transaction reads. |
| C-09 | Misleading generic payout copy | `_lib/creatorPayouts.ts` showed a blanket7–30day hold while current settlement has source-specific holds and reserves. | Replaced with sale/review-dependent hold and separately confirmed available balance. No financial policy or payout date promised. |
| C-10 | Reproducible input-loss defect | Store TipSheet displayed a private-note field, but `purchaseCreatorTipWithStore` only sends `private_note_present`; it never transmits the buyer's text. The separate Stripe helper supports a note, but is not this UI's billing path. | Removed the unsupported store-only note field. Existing helper compatibility remains. Delivering private store-tip notes requires a separately reviewed persistence/read contract; no note-delivery claim remains in this UI. |

C-06 qualification: the admin tool's Live Stage offer-ID lookup preserves the
existing `paid_live_watch_party_offers_read_exact_room` RLS policy. Only the
current authorized, unrestricted creator/host can read that offer row; a tester
who is neither cannot map the offer ID to a party through this table and receives
the unavailable error. This is not complete admin Stage purchase qualification.
Those buyers must reach the contextual Stage screen using an already-known room
destination. No existing client-callable read RPC accepting an offer ID and
returning its party ID was found in the relevant source. The read resolver
`resolve_live_watch_party_money_access(p_party_id)` requires the party ID first;
`create_live_watch_party_purchase_intent(p_offer_id)` returns a party ID but
creates an intent and is not a navigation lookup. Private notification helpers
and service-only authority resolvers are not client read alternatives. No grant,
RLS policy or new resolver was added to work around this limitation.

## Journey and contract coverage

| Journey concern | Current evidence | Remaining work / qualification |
| --- | --- | --- |
| Creator18+, US-only, unknown state | `_lib/creatorEligibility.ts` requires authoritative server readback, minimum18, UNITED_STATES market and complete positive legal/provider/KYC/tax/rollout/account inputs before money exposure. `_lib/creatorMonetizationSetup.ts` calls the eligibility gate. | Real age/KYC/location/provider readiness not inspected. Backend report must establish every mutation uses the gate; a client gate alone is not enforcement. |
| Purchase meaning | Tips explicitly unlock nothing. Platform Subscription includes that creator's ordinary Paid Videos while active; VIP videos excluded. VIP grants30-day creator-specific VIP shelf; ordinary paid ownership, Premium, other creators and Event/Room/Stage access excluded. | Maintain terminology: Platform Subscription is creator membership, Premium is platform entitlement. All labels must match authoritative access. |
| Initial creator price | Source offers and setup tiers are hardcoded; iOS static catalog has additional tiers. | Creator selection requires coordinated supported-price catalog and immutable offer versions. No auctions implemented; starting bid is distinct from fixed price and reserve was not requested. |
| Purchase-time price binding | `validateCreatorMoneyPurchaseIntent` validates exact buyer/source/creator/provider/product/environment/status/amount/currency. Added store quote guard matches numeric price+currency to that same amount before SDK call. | Backend intent and fulfillment must preserve agreed price after creator edits; see backend report. Do not assume later mutable offer equals historical transaction. |
| Historical grants / duplicates | Paid Video, VIP and channel clients use `validateHistoricalCreatorMoneyPurchaseIntent` for already-owned responses, allowing old price/store while still exact buyer/source/creator bound. Room retains current-intent validator. Route latches and RevenueCat mutation authority supplement backend idempotency. | Concurrent independent buyers and post-charge fulfillment cannot be proved by client mocks. See backend race tests and provider qualification gaps. |
| Account change | Shared authority captures account+session; purchase subject syncs RevenueCat identity and revalidates after async operations and before SDK mutation. Screens key access snapshots to viewer/authority. | New tests verify client refuses SDK invocation after an injected account switch; physical switch/restore remains unqualified. Prior account/logout scope was not reopened. |
| Pending/failure/cancel | Per-mode flows poll authoritative access after store return; messages distinguish received/pending from unlocked. SDK cancellation does not grant access. Subscription has restore/reconciliation. | Durable pending receipt and cross-mode retry/recovery UX incomplete; cancelled local intent cleanup/server races covered separately. |
| Earnings/proceeds | `_lib/creatorMonetization.ts`: sales8000/2000bps; tips10000bps creator; pending/held/available/paid/reversed/reserved/negative adjustments exposed separately. Setup catalog explicitly sandbox/not payable. | Never label80% of sticker price as final cash payout. Provider fees, tax, reversals, reserves and readiness remain separate. No payout was executed or inspected. |
| Entitlement expiry/refund/revoke | Clients resolve authority afresh; VIP explicitly exposes expiry; subscriptions expose current period and cancellation state; paid video library checks grant status, starts/expiry, refund/revoke, environment and resolver. | Provider refund/dispute events, exact receipt correlation and revocation delivery require backend/provider evidence. |
| Accessibility/loading/error/navigation | Purchase buttons have role/labels/state; scoped snapshots hide stale access; VIP and subscription offer loading and refresh states; added cold-link recovery for subscription/tip. | No screen-reader, touch target or device rendering assertion made. Broad visual regression and real provider sheets need both OS qualification. |

Virtual Room capacity is not assigned physical seating. A Live Stage Seat Pass makes
a viewer eligible to request speaking access; it never itself grants microphone,
camera, host or publisher authority. This distinction must survive a future auction design.

## Test evidence

- `node scripts/test-creator-money-store-quote.mjs`: passes production functions for
  nine Android purchase branches: six contextual modes, second subscription
  package branch, Live Stage entry and Live Stage seat. Real parsers and intent
  validators are used; only RPC/store/session boundaries are synthetic.
- Negative controls: price drift, foreign/missing currency, fractional cents,
  malformed/nonfinite quote, product mismatch, wrong intent amount, stale account;
  valid quotes reach a synthetic native cancellation (one invocation) while
  rejected quotes reach zero native invocations. Large safe-integer mismatch is
  rejected despite floating point tolerance.
- Initial audit batch: `node --test tests/creator-money/client-precharge-authority.test.mjs tests/creator-money/ios-specialized-intent-routing.test.mjs`: 16/16 passed before the expanded event-reservation implementation. Existing fixtures then
  supply actual quote amount/currency and execute the real quote guard.
- CI wrapper: `tests/creator-money/store-quote.test.mjs` imports the new script in
  the existing creator-money test glob. No CI policy/config was changed.
- `tests/creator-money/sandbox-contextual-destination.test.mjs` executes production
  destination resolution for all six admin digital modes, rejects missing/mismatched/
  unavailable offer mappings and checks the admin path has no generic purchase call.
- `git diff --check`: passed at local check. Root owns full selected validation,
  exact-head CI and diff review; its ledger supersedes partial check status here.

These are synthetic production-path checks, not actual store purchase/restore,
notification delivery, deployment readback or installed Android/iOS evidence.
The initial quote/navigation batch can be reverted independently in source.
The expanded implementation below has coordinated backend contracts; rollback
must be reviewed against those contracts and migrations remain forward-only.

## Approved implementation update (2026-10-26)

| IDs / surface | Source implementation | Execution evidence / remaining qualification |
| --- | --- | --- |
| C-03 / C-04 pricing | `_lib/creatorSupportedPrices.ts` consumes the authoritative catalog. Buyer reads stay device/source-specific. Authoring combines iOS and Android rows by amount/currency/environment, retains a deterministic existing catalog ID, and labels platforms explicitly in `CreatorPricePicker`. No unsupported SKU or cross-store fallback is invented. Android availability is limited by existing catalog rows; iOS Live Stage has no mapped tier. | Real catalog client parser and account-bound RPC paths tested. Production rows require active status and provider proof; sandbox choices are labeled. Creator forms/backend setters are tracked in the integrated implementation ledger. Physical store availability remains unverified. |
| C-05 Purchases / My Tickets | New `/purchases`, reached from My Library, VIP, subscription, TipSheet and tip status; event detail links are owned by the event lane. `_lib/creatorPurchases.ts` validates owner/session, paired exact-source filters, pagination, immutable price/terms, receipt and destination. All eight source types (six modes plus separate Stage entry/seat) are represented; Premium excluded. | Pending, paid-unfulfilled, reconciliation, active, upcoming, completed, expired, refunded, revoked, canceled, failed and disputed states are distinct. Pending/review cards have no checkout destination. Current access is rechecked by the destination screen. Null historical economics/terms remain explicitly unavailable. |
| Receipt / remedy | Main amount is labeled purchase price; separately available provider-reported economics are not conflated with the agreed price. Immutable `includeText` and purchased start/end are shown separately from a changed current schedule. Replay inclusion, availability and finite expiry are readable; missing historical terms or expiry remain explicitly unknown. Event completed state says Event ended. Optional refund eligibility says provider review required and does not imply money returned. | Mounted receipt tests preserve original inclusions/schedule and finite expiry, distinguish changed current times, and reject filling missing historical terms. Server receipt/economics and remedy SQL are separate backend evidence. No real receipt or refund inspected. |
| Buyer tip amounts | TipSheet now uses exact device+creator catalog amounts, removes unsupported custom digital amounts, fails closed on unavailable catalog, and hides a previous session's late checkout notice. It links to purchase history and no longer calls an SDK return a verified received tip. | Mounted positive case selects mapped99; unavailable catalog disables checkout; generation switch suppresses stale receipt. Tips still unlock no access. |
| Paid Video routing / price | iOS uses `create_ios_creator_money_purchase_intent` with exact expected amount and concept. Android uses the freshly resolved offer's product key. Fractional minor-unit amounts are rejected rather than truncated. Existing native quote/intent guards remain. | Dedicated production intent function invoked with299/499/999; mismatched99 readbacks rejected; Android exact product-key forwarding checked. No live catalog changes. |
| Unknown checkout recovery | All non-event clients direct uncertain intent/payment outcomes to Purchases & My Tickets and warn against another purchase while status is unknown. Backend source/pool idempotency remains authoritative. | No automatic purchase retry, optimistic grant, or assumption that cancellation proves provider settlement. Account-bound restore refreshes remote history only. |
| One native checkout per intent | `beginCreatorMoneyCheckout` claims the exact server quote immediately before each non-event Store invocation: tip, video, Room, VIP, subscription package/product and Stage entry/seat. It validates the returned intent/source/buyer/creator/provider/product/environment/status/economics, fresh attempt identity, start timestamp, one-use authorization and immutable quote economics. Unknown or already-used claims cannot reach the SDK. | Expanded native quote script executes the actual helper and all nine purchase branches (event has its own reservation claim). Concurrent independent client invocations sharing one server claim reach the Store once; lost claim responses and remounted retries reach zero Store calls. Server SQL/concurrency evidence belongs to the money lane. Canceled native sheets preserve pending authority and direct the buyer to history. |
| Protected event viewing | New `/event-watch/[eventId]` and `_lib/creatorEventPlayback.ts` request `spectator-playback` event state using a frozen exact-session bearer. Only the exact configured HTTPS gateway host/event path, single event token, live/replay kind, opaque43-character playback identity, explicit safe booleans and bounded5-minute expiry can create the watch-only `expo-video` player. | Mounted tests cover wrong host/event, public-spectator fallback denial, structured403 denial, foreground stop, replacement account, unmount abort, token refresh30seconds before expiry,20-second first-frame/rebuffer deadline, and exact event Back. Replay position survives a token refresh only for the same verified source identity/current session; a changed asset/account starts at0. Parent owns gateway SQL/Edge tests. Source tests do not qualify native media playback. |
| Colocated event host controls | Source review found returning from Live Stage to event controls removes the focused publishing surface and clears/disconnects media. `EventHostBroadcastControls` now resolves the exact prepared room to its event through an owner/session-bound server read and presents producer + lifecycle controls alongside the existing host stage. The room namespace only selects presentation; it grants no event or host authority. Preparation inside the room has no navigation action. Existing Premium/media/foreground authority stays intact. | Five mounted/source integration tests exercise preparation → broadcast start/refresh → event start/end without navigation or media-boundary remount, reject missing/wrong-owner mappings, suppress late room/account/background/unmount responses, and include a navigation mutation control. This does not prove native tracks or provider delivery. Ending shows shutdown requested, with provider confirmation still required. |
| Stripe contribution attempt | `_lib/creatorTipCheckoutAttempt.ts` persists one UUID and original monetary terms before transport, serializes same-buyer/creator attempts, retains unknown outcomes across remounts, and refuses changed amounts while unresolved. Dormant `createCreatorTipCheckout` freezes the session header and validates exact server request/buyer/creator/amount/currency/tip identity and Stripe checkout origin. Independently owner-bound paid/canceled/refunded status can retire only the matching receipt attempt; `failed` cannot, because a failed PaymentIntent may still have an open Checkout Session. |7 synthetic tests invoke the production persistence and checkout/read-status functions. The server now returns the exact response contract and freezes original request parameters; combined client/Edge/buyer/webhook regression checks pass. No app/component caller for the Stripe launcher was found; no new external-payment UI was exposed. Actual provider sessions and payments remain unqualified. |

Latest targeted execution: `prices-and-purchases.test.mjs` **8/8**, `purchases-route-mounted.test.mjs` **11/11**, `event-playback-client.test.mjs` **9/9**, `stripe-tip-client-attempt.test.mjs` **7/7**, `event-host-controls-mounted.test.mjs` **5/5** (40 total). These execute production clients/parsers and mounted route handlers with synthetic RPC/store/media boundaries. The mounted pending-route and host-navigation mutation controls reproduce forbidden navigation when their guards are removed. Scoped ESLint passed, including new playback, wallet and tip files. The9-branch native quote script passed with exact durable-claim, concurrency, lost-response, changed-session and fractional requested-price negatives. The API client consumer inventory passed9/9 again after generic claim/host mapping additions; no grants were expanded. A47-test combined host/catalog/Stripe client+Edge+buyer+webhook run passed; latest focused reruns are recorded with the parent ledger. One test harness initially lacked the random-values boundary mock after the helper import; it was corrected and the affected catalog suite passed8/8.

The expanded event-reservation fixtures in `client-precharge-authority` and
`ios-specialized-intent-routing` were delegated to the event lane after the old
fixtures failed the new required terms contract. Their newest status belongs in
the parent exact-head validation ledger; old pass counts are not evidence for the
expanded head. Full TypeScript/core/product/native/database checks and exact-head
CI remain parent-owned. No execution denial is outstanding; a transient executor
disconnect recovered and focused checks subsequently ran successfully.

Supabase integration guidance consulted: [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth).
The changelog Markdown fetch was unavailable through the browser tool's content-type handler.
Existing project request/session conventions were retained; provider settings were not changed.
