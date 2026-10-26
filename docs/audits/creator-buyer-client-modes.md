# Creator/buyer client monetization audit

Audit date: 2026-10-26. Source base: `40c0cebb24f39afca0ae6c2ce2532ae4a56f4858`.
This records source evidence and local synthetic execution. No provider configuration,
private user records, charge, payout, release or installed-device qualification was performed.
The account/logout, Studio cutover, deletion and Brand reviews are not reopened.

## Route and data inventory

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
- `node --test tests/creator-money/client-precharge-authority.test.mjs tests/creator-money/ios-specialized-intent-routing.test.mjs`: 16/16 pass. Existing fixtures now
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
Rollback is source reversion of the quote helper and its caller integrations plus
the two navigation changes; it does not require provider/catalog or DB mutation.
