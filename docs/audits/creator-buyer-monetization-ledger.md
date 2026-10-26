# Creator and buyer monetization audit — 26 October 2026

Status: **source inventory and journey review complete; repair validation in progress**.
Implementation is partial. This is not a launch, provider, or device qualification.

Base: `40c0cebb24f39afca0ae6c2ce2532ae4a56f4858` (`main` at checkout).
Branch: `codex/creator-buyer-monetization-audit`.
Persistent independent clone: `/Users/loverslane/Documents/Codex/2026-10-26/task/creator-buyer-monetization`.

Scope: tips, paid videos, paid Watch-Party rooms, channel subscriptions, VIP passes,
paid scheduled events; Premium remains a separate entitlement. Online shows and
virtual capacity are the working assumption. Assigned seating/physical admission
and auctions are not implemented by this task. PR624/625 and Android111/iOS42 are
accepted as delivered context, not re-reviewed. No production or provider changes,
real purchases, refunds, payouts, releases, or private-user inspection are allowed.

## Evidence standard

`implemented` means a traced source path exists, not that a live provider/device
journey was verified. `defect` requires reproducible source or local runtime
evidence. `missing` means the audited route/data contract does not provide the
feature. `decision` requires owner policy/design. `external` requires unavailable
provider, deployment or physical-device evidence. Tests must state whether they
exercise real SQL/client/handler code or mocks, and whether concurrency is real.

## Stable coverage ledger

| ID | Coverage obligation | Source evidence / remaining qualification | Detailed matrix |
|---|---|---|---|
| CM01 | Creator eligibility: US, 18+, monetization activation | Server/client fail-closed checks traced; actual KYC external | money backend/client modes |
| CM02 | Tips: amount, buyer authority, validation, 100% creator net | Store/Stripe/ledger traced; request-level checkout retry gap remains | money backend/client modes |
| CM03 | Paid videos: author price, purchase, library, playback | Creator editor fixed99; catalog binding must remain exact | client modes/money backend |
| CM04 | Paid Watch-Party rooms: offer, capacity, entry | Title Room and Live Stage access/participation traced separately; no physical seat assignment | client modes/money backend |
| CM05 | Channel subscription: recurring access/cancellation/expiry | Exact creator recurring grant traced; ongoing provider/device qualification absent | client modes/money backend |
| CM06 | VIP: included access, duration/expiry, Premium separation | Creator-specific30-day nonrenewing VIP shelf; product separation traced | client modes/money backend |
| EV01 | Future show create/edit/draft/publish | Event settings + `liveEvents` + creator_events | events journey/backend |
| EV02 | Timezone/DST/date validity | Gap/fold/calendar validator repaired and tested; persistent event IANA zone missing | events journey |
| EV03 | Sale opening/closing windows | Separate sale windows absent; show times are not sale policy | event backend |
| EV04 | Virtual capacity and concurrent purchase | Allocation at fulfillment, no precharge reservation found | event backend |
| EV05 | Assigned seats/physical event support | Separate unsupported product, not equivalent to virtual seats | events journey/backend |
| EV06 | Creator selected fixed prices and initial auction bid | Fixed99 UI/backend confirmed; tier/catalog design needed; auction design only | all + provider docs |
| EV07 | Discovery, clear price/time/inclusions | Routes traced; timezone/sold-out/recovery repaired; bounded-feed destination gap remains | events journey |
| EV08 | Pending/failed/cancelled/duplicate purchase | Account-bound intents traced and quote tests added; durable pending recovery incomplete | event/backend + client modes |
| EV09 | Receipt/ticket library and recovery | `/library` is My List; unlocked video exists, unified ticket/membership wallet absent | events journey/client modes |
| EV10 | Entry before/at/after scheduled show | Scheduled blocks entry; live destination required; exact event resolver missing | events journey/backend |
| EV11 | Start/delay/reschedule/cancel/no-show | Manual lifecycle exists; atomic stream lifecycle and customer remedies incomplete | events journey/backend |
| EV12 | Reminders | Revision-bound producer exists for reminder subscribers; purchase does not enroll automatically | coverage review/events |
| EV13 | Replay entitlement and expiry | Client expiry/null edits repaired; end-to-end replay terms/media authority incomplete | events/backend |
| FN01 | Purchase-time amount/currency/product binding | Intent snapshots exist; compare actual SDK store quote | client modes/money backend |
| FN02 | Refund/revocation/dispute/credit/payout holds | Terminal projectors traced; actual store reversal unqualified; no automatic refund promise | money backend |
| FN03 | Ledger/earnings/payout status and split truth | Settlement receipt authority and payout execution remain closed; stale hold copy repaired | money backend/coverage review |
| AU01 | Stale account/session ownership | Actual client/mounted/SQL tests; event stale UI and Live Stage completion defect identified for repair | client modes/money backend |
| AU02 | Idempotency/order/concurrency/partial failures | Native event locks tested; full multi-provider charge concurrency remains unqualified | money backend/event backend |
| UX01 | Accessibility/loading/empty/error/navigation recovery | Native colors retained; bounded screen recovery repaired; transaction errors still can look empty | client modes/events journey |
| EX01 | Apple/Google/RevenueCat/Stripe policies | Official sources verified2026-10-26; provider settings uninspected | provider docs |
| EX02 | Native/device/provider/deployment qualification | Unavailable and outside authorization; no total-completion claim | root |
| QA01 | Tests, negative controls, full applicable checks | Isolated locked dependency install, required planner, exact diff | root + reviewers |
| QA02 | Draft PR, exact-head CI, review | Pending implementation; no money-sensitive merge authority | root |

## Owner decisions already identified

1. Creator-selected fixed prices are required. Implement as supported catalog
   price points consistently across creator editor, server offer, intent, and store
   quote. Current sandbox99 is not a finished creator pricing feature. Do not
   silently enable arbitrary amounts against a single SKU.
2. Fixed-price capacity-limited virtual admission is the recommended baseline.
   Before adding reservations, decide hold expiry, late payment handling and the
   customer remedy if payment succeeds after inventory is exhausted. Existing
   reconciliation is not a promise of an automatic refund.
3. Define reschedule/cancel/no-show notification and refund policy, replay inclusion
   and expiry, and whether purchasers accept schedule changes. No promises added.
4. Clarify whether seats mean online capacity or assigned/in-person seats. Auction
   starting bid is distinct from a fixed price; reserve pricing was not requested.

## Detailed evidence

- `creator-buyer-events-journey.md`: event creator/buyer route and UX matrix.
- `creator-buyer-event-backend.md`: scheduled-event SQL, capacity, purchase paths.
- `creator-buyer-client-modes.md`: all other client modes and store quote checks.
- `creator-buyer-money-backend.md`: receipt, ledger, refund and payout authority.
- `creator-buyer-independent-review.md`: independent coverage and diff review.
- `creator-buyer-provider-docs.md`: official platform/payment documentation and auction feasibility.
- `creator-buyer-recommended-plan.md`: one integrated creator/buyer recommendation and delivery sequence.
- `creator-buyer-validation.md`: final commands, commit/PR/check evidence and blockers (written at integration).

## Priorities after this repair

1. Complete creator-selected catalog pricing and immutable offer terms;99-cent
   sandbox hardcodes do not satisfy the new product requirement.
2. Decide and implement reservations/late-payment handling before promising limited
   advance inventory; existing pass locking does not prevent charging two buyers.
3. Add durable Purchases/My Tickets and exact event destination resolution, then
   unify waiting/live/replay states with entitlement and expiry.
4. Define change/no-show/cancel/paid-to-free remedies and transactional notices.
5. Qualify original-transaction/offer history, Stripe request-level retry recovery,
   transaction-read errors, settlement imports and provider/device behavior.

Each obligation above has a source-backed finding or explicit missing-evidence
classification. That coverage statement does not assert all feature behavior is
implemented, every production dependency was executed, or payments are ready.
