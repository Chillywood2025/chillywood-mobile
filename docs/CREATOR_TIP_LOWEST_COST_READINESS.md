# Exact-tip cost comparison: source readiness, not live cheapest routing

## Implemented

`get_creator_tip_route_costs` is a read-only authenticated RPC. It binds the
current exact buyer/session, creator, USD amount, platform and test environment.
It enumerates exact native catalog prices and individually resolves every
applicable external capability using existing backend authority. Unsupported
amounts are never rounded, replaced by another SKU or granted access.

Every admitted candidate is returned, including candidates with **unknown** fee
evidence. The client must also recognize every native price binding from its
current supported catalog. Missing, expired, revoked, partial, wrong-subject or
wrong-price evidence prevents a lowest-cost recommendation. One route is not a
comparison. Ties retain all tied routes. Current app tip fees are zero; the
optional instant-cash-out fee is a different operation and is not included here.

The tip sheet reads this actual RPC, confirms the native SDK's exact price and
external adapter support, suppresses stale amount/session results and expires
its comparison. Its explicit lowest-fee action calls the server selection API,
then passes the persisted selected action ID into the existing native or external
checkout handler. It never falls back to another rail after uncertainty. Selection
returning after close/reopen or account change cannot launch checkout.

The companion shared-action claim/selection migration owns dispatch authority;
the read-side unresolved marker is conservative, not a transaction lock. The
private cost helper accepts an explicit already-authorized buyer/session for
server dispatch without rewriting JWT claims. The public read endpoint never
accepts another buyer or an unresolved-attempt exclusion flag.

## Trusted fee feed contract

Private `creator_tip_route_fee_evidence` records contain exact subject/amount,
provider, purchase binding (native price UUID or external capability UUID),
provider account, qualification reference, fee-evidence reference, distinct
processor/store/platform/other minor-unit fees, verified time and <=10-minute
expiry. Explicit buyer charged total, tax amount/treatment and provider fee base
are mandatory: unknown tax is not zero. `other_minor` excludes tax; `totalMinor`
includes all four fee components **plus tax**. Alternatives with different final
buyer totals cannot be called equivalent just because the nominal tip matches.
Current selected checkout additionally requires the buyer total to equal the
entered tip: a separately-qualified additional-tax handoff does not exist yet.
Known equal-but-higher totals are retained as evidence, not offered for dispatch.
All unavoidable fees must be included. Rows are immutable except a
one-way revocation. Clients cannot read/write this table. Raw provider accounts
and evidence references are not returned by the comparison RPC.

Only service role may invoke `record_creator_tip_route_fee_evidence(jsonb)` and
`revoke_creator_tip_route_fee_evidence(uuid)`. The record endpoint is an ingestion
boundary, **not** a provider attestation engine. Its operational caller must
independently establish the current provider account and exact product/capability,
storefront, tax/processing/reporting obligations, eligible fee tier, all unavoidable
fees and expiry before submitting the exact quote. A native catalog row is not
account fee evidence. Public advertised rates are not account-qualified quotes.
The reader rechecks current route eligibility; external account identity must
still match its admitted capability. A revoked or expired latest matching quote
does not fall back to an older quote.

**No operational fee adapter, account fee tiers, real fee records or provider
approvals were created.** Therefore ordinary current reads have unknown fees and
cannot truthfully claim a cheapest route. Google ECL account eligibility is not
changed by this migration. Test evidence is synthetic and disposable only.

## Remaining activation gates

1. Qualify and connect the operational account-specific fee feed above; test its
   revocation/renewal and native account/product mapping. Do not seed public rates.
2. Qualify the companion shared durable purchase identity/claim and selected
   dispatch integration across native and external tips with concurrency and
   receipt-lifecycle evidence. Native `create_ios_app_store_purchase_intent` /
   `create_money_purchase_intent` and Stripe `reserve_creator_tip_checkout_attempt`
   must not permit a cross-rail second payment after unknown transport or receipts.
   Confirmed terminal reconciliation or an atomic undispatched-action tombstone
   owns retirement, never a timer or client dismissal.
   Verified native provider revocation/refund is terminal for the original
   action, just like consumption; failed/expired/unknown intents are not.
   Reconciliation is available to the same buyer's current replacement session,
   without authorizing dispatch under the old session.
3. Verify server re-reading of route eligibility and all exact cost components
   immediately before selected dispatch, including immutable action binding.
   Keep the same route after uncertainty; never automatic fallback or retry on
   another rail. Preserve native disclosures and provider reporting.
   Selected external tips carry the exact capability through iOS/Android
   admission, amount quote and reservation. An older cheaper qualified route
   must not be replaced by the newest route. Legacy manual admission/quotes
   still select the newest qualified route; exact overloads never fall back.
4. Production requires separately qualified production contract, provider/account
   evidence, device verification and release authority. This RPC/feed deliberately
   supports test only. No migrations, providers or money switches deployed here.

This first slice covers **tips**, not global routing or a fabricated native
alternative to an auction winning bid. Reuse remains for paid videos,
subscriptions, VIP, ordinary seats/events, auctions and physical merch. Each
needs its own supported exact-benefit eligibility/fee contract before cost
comparison. Free app standard cash-out remains default; no purchase-cost
optimizer may select paid instant cash-out. Platform shares remain separate
from provider fees: digital sales 20% net, merch 10% net, tips 0%, standard
cash-out 0%, optional instant cash-out 2%. Withdrawal fees must not be added to
a purchase comparison unless the user explicitly chooses that withdrawal option.
