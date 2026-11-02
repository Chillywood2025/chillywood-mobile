# Items 7–9: provider completion and qualification plan

Checked November 1, 2026. This distinguishes source implementation, deployed
configuration, external qualification and activation. A passing checklist is
not permission to move money. Public release and device testing are separate.

Latest checkpoint: [operational items 1–9](APP_OPERATIONAL_READINESS_20261101.md).

## 7. Low-cost lawful tax and live Stripe readiness

### Sales-type responsibility matrix

| Sale | Evidence to establish before activation | Lowest-cost next action |
| --- | --- | --- |
| Creator-owned physical merchandise sold and paid inside Chi'llywood | Marketplace-facilitator responsibility by buyer destination, own versus facilitated sales, platform/connected-account liability and applicable registrations | Use existing Stripe Checkout/Tax, not a second tax engine. Obtain a targeted classification of this exact marketplace model; do not register everywhere by default. |
| Store-billed digital video, subscriptions, VIP, seats and events | Which Apple/Google entity collects/remits each applicable tax and what the store agreement/report covers; gross/net/fee evidence and creator reporting remain separate | Reuse store billing and RevenueCat. Do not collect the same tax again through Stripe. |
| Externally billed digital/auction access, if enabled | Authorized storefront/program and buyer location, taxable product classification, liable entity and approved price/tax behavior | Leave unavailable until the exact external billing and tax path is qualified; do not infer permission from the U.S.-only launch. |
| Tips | Whether consideration/unlocks exist, correct billing rail, income reporting and payment-settlement responsibility | Do not call tips charitable donations or infer tax exemption. Keep product-specific records. |
| Creator income and tax forms | Who is the payment-settlement entity, applicable federal/state form and threshold, Connect controller/fee-payer configuration | Creators handle their own income taxes. Any legally assigned platform form duty cannot be reassigned merely by subtracting fees. Use Stripe data/export instead of duplicate bookkeeping. |

Illinois's current statute uses **$100,000 or more** of prior-12-month Illinois
marketplace tangible-goods gross receipts from January 1, 2026; the old
200-transaction alternative was removed. This is not a blanket exemption for an
Illinois business's own sales or a determination for all states. Working in
Chicago can matter despite having no retail storefront. Chicago separately
addresses electronically delivered amusements. Do not infer that ordinary
state sales-tax setup automatically covers that tax or that every VIP/event is
the same product. The user's facts must be classified against these rules.

Primary sources:
- [Illinois statute, 35 ILCS 120/2(c-5)](https://ilga.gov/documents/legislation/ilcs/documents/003501200K2.htm)
- [IDOR marketplace FAQs](https://tax.illinois.gov/research/taxinformation/sales/frequently-asked-questions-faqs-for-marketplace-facilitators-marketplace-sellers-and-remote-retailers.html)
- [IDOR physical-presence definitions](https://tax.illinois.gov/research/taxinformation/sales/sales-and-use-tax-definitions.html)
- [Chicago code 4-156-020](https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il/0-0-0-2634053)
- [MyTax Illinois registration](https://tax.illinois.gov/programs/mytax.html)
- [IRS 1099-K responsibilities](https://www.irs.gov/newsroom/form-1099-k-faqs-should-my-organization-be-preparing-filing-and-furnishing-form-1099-k)
- [Stripe marketplace tax](https://docs.stripe.com/tax/tax-for-marketplaces)
- [Stripe supported registration types, including local amusement tax](https://docs.stripe.com/tax/registering)

### End-to-end sequence and proof

1. Inventory actual products, pricing, destinations, tax-inclusive/exclusive
   behavior and the entity charging each transaction. Preserve the U.S.-only
   intended launch scope; do not manufacture a worldwide legal determination.
2. Confirm the business/legal identity and targeted responsibility decision.
   Owner completes any government/financial agreements and sensitive identity
   submission. Adding a Stripe registration does **not** register with the state.
3. Read existing **live** Tax Settings, product tax codes, registrations and
   account capabilities before edits. Do not overwrite defaults or assume the
   test account reflects live setup. Record only sanitized evidence references.
4. Keep the intended Tax Basic pay-as-you-go approach unless its actual account
   terms/pricing require a decision. Do not enroll in Tax Complete, filing,
   registration services or paid extras automatically. Calculation, filing,
   registration and creator forms are distinct duties and costs.
5. Set the legally confirmed liability entity, matching product tax code and
   registered jurisdictions only. Preserve proper withholding of collected tax
   from creator earnings. No fabricated nontaxable code to produce zero.
6. In the authorized sandbox run applicable taxable, exempt, unregistered,
   mixed-product, destination, full/partial-refund and rounding cases. Inspect
   `taxability_reason`, not merely tax=0. Unknown/`not_collecting` cannot qualify
   a taxable sale. Item3 supplies authoritative refund-reversal evidence.
7. Qualify actual fee imports and forms responsibility with items1–3. Registration
   obligations, pricing changes, live billing and financial execution remain
   separate explicit steps. Re-read live settings after every approved change.
8. Completion requires matching legal scope, real live settings, tested product
   path, filing responsibility/calendar and evidence-bound runtime gates. No
   registration or live qualification was completed by this source change.

**Updated live read-only audit, November 1, 2026, 15:12–15:18 UTC:** the owner
authorized the live Chi'llywood account and it is now accessible. Tax Settings
is `active`, with Chicago, Illinois, U.S. head office and default
`tax_behavior=inferred_by_currency`. The default `txcd_10000000` is General –
Electronically Supplied Services, **not a physical-merchandise classification**.
The API did not establish the Tax Basic billing plan. All-status tax registrations
returned an empty, complete list. Threshold monitoring returned empty locations
and `computed_at=null`: no computation timestamp or freshness information was
returned, and this is not a legal no-registration determination.

**Fresh authenticated live read at 22:50 UTC supersedes earlier verification
observations:** platform charges/payouts and details-submitted are enabled;
currently-due, past-due, pending-verification and error lists are empty. No
additional identity submission is currently requested by this evidence. App
money and payout controls remain OFF. The complete connected-account list is
still empty. The earlier platform payout schedule is not a creator payout
policy. Fresh 22:54 UTC reads also show both v1 webhook endpoints and v2 event
destinations empty with no next page. At the earlier audit, live Checkout Sessions and balance
transactions also returned empty complete lists. No actual live checkout,
refund, fee, payout-destination or delivery sample was available to qualify.

The connector exposed no Tax Association or report-run operation through its
documented API search. Authenticated analytics schema discovery exposes
`itemized_fees`; its `amount` and `tax` columns explicitly use **major currency
units**, notwithstanding generic analytics-tool minor-unit guidance. An attempted
read-only query was rejected because this account has **no Sigma subscription**;
no query run or subscription was created. Do not buy Sigma merely to finish this
audit: prefer the existing Fees Report export/API when available. No zero fee,
tax completeness or external-auction store-fee exemption is inferred from the
empty live balance history.

No provider setting, credential, registration, agreement or money operation was
changed. Remaining prerequisites are exact legal/product classification and
required registration, confirmation of intended pay-as-you-go plan, correctly
scoped live event delivery and safely installed signing secret, connected creator
onboarding/fee-payer/manual-payout qualification, and actual provider evidence.
Any future verification requirement should be followed in Stripe, not by submitting
identity documents through chat. Results only use information available to
Stripe. Always review with a qualified tax professional before taking action.

## 8. Google Play → RevenueCat → Chi'llywood

The existing `google-play-webhook` is a readiness scaffold, not the intended
entitlement processor. Do not point production RTDN at it and claim completion.

1. Inspect the existing Google Cloud project/service identity and RevenueCat
   Google app for `com.chillywood.mobile`. Reuse the correct existing project;
   do not create duplicate topics, keys or webhook endpoints.
2. Confirm Pub/Sub API and permissions. New IAM grants/service credentials or
   widened access require specific approval. Do not disable domain-restricted
   sharing to solve a setup error.
3. Use RevenueCat's Google app settings to select/connect the existing intended
   topic. Verify the generated full topic name rather than inventing it.
4. Save that exact topic in Play Monetization Setup with **subscriptions,
   voided purchases and all one-time products**. Inspect saved state again.
5. Send Google's test notification and independently confirm receipt and time
   in RevenueCat. This proves routing, not real purchase lifecycle processing.
6. With authorized sandbox store events exercise purchase, renewal, cancellation
   (access until expiry), expiration, billing retry/grace, full/partial refund,
   void, duplicate/out-of-order and account transfer. Observe RevenueCat's signed
   delivery, exact user/product/environment mapping, backend ledger/entitlements
   and revocation, not only dashboard receipt.
7. Keep SDK purchase identity policy intact. RevenueCat warns server-first new
   purchase detection can race SDK attributes and produce different identities;
   do not turn on that optional setting reflexively.
8. Test webhook outages/retry and fresh-authority reconciliation. Record
   sanitized evidence and latency; add real alert routing before unattended use.

[RevenueCat RTDN guide](https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications)
and [Google setup](https://developer.android.com/google/play/billing/getting-ready).

**Current blocker:** no Google/RevenueCat connector is exposed; the required
local-browser task was rejected by the current Codex usage limit before any
console execution. Earlier console observation had RTDN unchecked/topic empty.
No new console state or test receipt is claimed.

## 9. Tracking, provider outcomes, queue capacity and alerts

### Tracking-only service

Use Shippo tracking only; creators may buy labels elsewhere. Do not add label
purchasing, postage, a merchandise-store provider, or a second shipping tool.
The October30 inquiry already asked Shippo about marketplace pricing, account
mapping, HMAC, polling, carrier fields and masking. No reply was found in the
connected mailbox as of November1; do not send duplicate outreach or treat the
published per-tracking price as an agreed marketplace contract.

1. Confirm marketplace/managed-account model, billing unit and limits; HMAC setup
   requires Shippo's solutions team. Their current guide allows up to10 business
   days. Never replace signatures with unsigned callbacks for convenience.
2. Reuse existing carrier+tracking numbers; immutable order assignment and
   reviewed corrections remain authoritative. The consume-only repair removes
   outbound registration capability entirely. Historical registration fields
   remain evidence, not a requirement or an inferred successful action.
3. Bind credential mode, provider account, order environment, carrier and number.
   Callbacks are durable wake-up hints, not delivery authority. Authenticated GET
   and destination/time corroboration must succeed before delivery evidence.
4. Qualify real USPS/UPS/FedEx payloads: masked/missing destination, timezone,
   duplicate/out-of-order status, returned/failed parcels, recycled number,
   wrong merchant, corrected timestamp and missed webhook. All unknowns stay
   review-held; carrier data is not proof of contents or exact street delivery.
5. Verified delivery starts the frozen 720-hour return clock. Untracked orders
   start from verified purchase. A tracking outage must never switch a tracked
   order to the purchase-date fallback. Corrections do not restart its clock.
6. Verify schedule and authenticated worker against the exact deployed version.
   Provider activation needs real credentials/account qualification and pricing
   approval, separate from deploying dormant source.

The transport helper, worker and database now accept explicit production mode
with an exact matching qualified merchant account and live-key prefix, tested
without provider traffic. This is **not an activated live pipeline**: no live
qualification, account or credential is seeded. GET response bodies have shared bounded deadlines, the
worker stops admitting work before its aggregate budget expires, and stale
lease completions no longer inflate its success count. Live activation requires
independent provider/account qualification and the canonical verified live
purchase evidence, not merely supplying a live key.

[Shippo tracking](https://docs.goshippo.com/tracking/tracking/),
[HMAC](https://docs.goshippo.com/tracking/webhook-security/).

### Cost/refund/dispute and queue operations

1. Preserve actual provider GET snapshots, chronological evidence, account and
   environment attribution, refund/dispute histories and items1–3 settlement
   authority. A webhook success is not automatically release authority.
2. The current driver is bounded to3 concurrent jobs,30/run,100 seconds and64
   Stripe GETs/order. Measure actual mixed healthy/slow/throttled/failed orders;
   test missing pages and histories above64 reads. Never report720/6h as proven
   capacity or clear an incomplete snapshot. Source now implements checkpointed
   large-history reads, exact-context resume and snapshot revalidation, with a
   2,000-refund fixture exceeding the per-run budget. Actual provider history,
   demand and timing still require qualification; fixture throughput is not
   production capacity.
3. Database triggers record actual run admissions and first terminal exact-lease
   acknowledgements, including incomplete outcomes. The owner-only health RPC
   reads these records and current backlog/tracking qualification. Forged
   counters, replayed acknowledgements and ordinary API-table writes cannot
   manufacture throughput.
4. Owner Money Center displays disabled/missing-heartbeat, stale evidence,
   failures, measured capacity shortfall and shipment qualification/review
   warnings with timestamps. Account switch, restore-only state, navigation
   blur and late responses must clear old data. This panel is read-only.
5. The independent five-minute health monitor now sends deduplicated incident
   and recovery notices to verified current owners using the existing in-app
   notifications and preference-bound push outbox. In-app delivery commits even
   when the push worker is unavailable; that worker rechecks ownership, current
   incident and preferences, and retains its existing delivery receipts. No
   invented email destination or extra service is used. Exercise a missed
   schedule, provider 429, stalled body, expired qualification and threshold
   breach, then independently verify device receipt and recovery.
6. Completion requires measured demand/headroom, fresh evidence, all adverse
   paths and independently observed paging. No money/driver enablement follows
   merely from passing the source tests.

**Current observation:** 0 qualified tracking-provider rows,0 qualified merchant
account rows,0 assignments; driver disabled. No backlog cleanup is implied.

## Deployment and rollback

The original 48-migration completion batch is deployed (573 total history rows).
The consume-only tracking repair is a separate pending rollout, not part of
that history yet. Apply its forward migration and exact GET-only closure under
dormant tracking dispatch before any tracking activation.
Verify private tables have no API-role grants and only the exact-session Owner
RPC is exposed. The independent owner-health cron is deployed; preserve it and
do not enable the dormant financial driver. Test with
synthetic local records, not fabricated production qualifications. Runtime
rollback may hide the panel while leaving append-only operational records;
never delete evidence or reverse deployed migration history. Final source must
pass exact-head Required Validation and deployed readback independently.
