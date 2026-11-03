# Internal sandbox creator payout source path

This is source implementation, not deployment or provider readiness evidence.
Real-money flags, the live worker, and production earnings are unchanged.

## Actual UI and authority

`app/channel-settings.tsx` mounts `SandboxCreatorCashoutPanel` in payout
readiness, separately from the existing live panel. The related historical
feature manifest is `creator-money-ledger`; its old payout-execution non-goal
is not proof of this new task's readiness.

The panel supports quote, exact quote confirmation, isolated history,
explicit provider-stage continuation/reconciliation, and cancellation. Every
action captures the initiating session. Blur, logout, account/session changes,
editing and stale controls retire earlier UI intent. Duplicate active clicks
are latched. Accessible labels, radio state and status announcements are used.
Payout controls remain hidden until a successful canonical, exact-session tester/owner
history read. Unknown/denied authority hides quotes and records. A 30-second display
lease clears stale UI, and every action revalidates server authority. Expiry does not
release an unresolved submit latch or restore a late result.
No new native modules are added; Android and iOS still require separate
installed-device verification, including Back/navigation and interruption.

Sandbox earning fee/tax/net deductions are labeled simulated. A quote is not
a payout. Reservation, connected-account funding, pending payout and provider
test-paid status are distinct; none proves a real bank deposit.

## Accounting and source evidence

Digital test earnings consume existing canonical sandbox purchase/renewal ledger
rows backed by processed provider events. Physical merchandise consumes its own
canonical paid order, processed Stripe payment receipt and immutable sandbox
Checkout/account binding; it does not create fake digital ledger rows. Historical
merch orders without that binding stay unavailable. Buyer and creator must differ.
Only USD sources are supported. Canonical external event and room-seat auction receipts additionally require their
immutable test platform settlement contract, exact platform/recipient accounts,
consumed intent, quote/session, paid receipt and provider ledger binding. Legacy
unbound direct-charge receipts stay unavailable; storefront eligibility is unchanged.
These source types retain their own private
reservations; public sandbox ledger rows remain `not_payable`.

The independently qualified test account carries an immutable, explicitly
simulated settlement policy. Integer-cent deductions are rounded upward per
component, and payout gross equals bank principal plus the accepted app fee and
quoted provider cost exactly. Test return accounting releases principal and app
fee while retaining that fixed simulated provider cost once, across all allocated
sources. Canonically bound native creator tips preserve the existing zero app
commission contract: only simulated tax/provider costs are deducted from their
gross; the non-tip platform deduction policy is unchanged. The tip exception
requires matching catalog, provider event, consumed purchase intent and source
identity, never a client-supplied metadata label. Current offer availability and
reference-price changes do not rewrite a consumed tip receipt. This is not actual-fee
reconciliation or production tax evidence.

Refunds, disputes and source identity/economic changes hold further dispatch,
including after a prior return and re-reservation. Unknown dispatch stays GET-only.
An expired or revoked test qualification blocks new provider writes; existing-object
GET reconciliation remains possible. A separate, independently reviewed recovery-only
authority can permit one still-unclaimed return, never new funding or bank payout.
No implicit renewal or generic retry grants new dispatch authority.

### Recovery-only operator handoff

Only the authorized database owner, through the reviewed production-change tool,
can append `private.sandbox_cashout_recovery_authorities`. API users and service
roles have no write grant; no authority is seeded by this migration. The operator
must first retain sanitized authenticated test-provider read evidence: exact
platform and connected-account IDs, original transfer/amount/USD/test mode,
remaining unreversed principal, and the confirmed bank-return proof for a failed
payout (or durable cancellation before any bank dispatch). No real account or
real-money evidence is acceptable. Qualification is not an instruction to perform
a provider mutation.

The reviewed packet binds the existing execution, exact original transfer and
`reversal` or `funding_return` stage; it includes an evidence reference/hash,
verification within five minutes and expiry no later than one hour afterwards.
It must establish zero prior returns and exactly the original principal recoverable.
Partial or ambiguous prior returns stay held for investigation, not guessed refunds.
The database rejects wrong bindings, excess amounts, stale evidence and any unknown
or already-claimed stage. The actual test engine re-reads the original transfer
before reversal and rejects partial/prior reversal. The claim records the exact
recovery authority used and keeps original economics/policy unchanged. Append-only
revocation shares the dispatch locks. An expired/revoked recovery authority cannot
authorize a write, and an unknown attempt remains GET-only forever.

Local full-schema tests exercise real Apple/Google subscription processors and
the real Stripe merchandise and event/room auction lifecycle processors with
synthetic provider inputs.
They prove source integration, not actual store/provider delivery. Shared-engine
recovery tests use actual SQL contexts through the Edge adapter and verify epoch
seconds, account-scoped GET filters and repeated unknown recovery without POSTs.

## Server dependencies

The database companion migration owns all `*_sandbox_creator_cashout*` RPCs,
private qualifications, tester/exact-session checks, reservations, dispatch
claims, refund holds and provider observations. The Edge adapter first calls
the user's `get_my_sandbox_creator_cashout_execution` with the initiating JWT,
then invokes the existing cashout engine using only the isolated test store.
Client-controlled mode, amount, account and destination are rejected at this
endpoint. Credentials never enter the client. Context must be test mode.

The new function is dormant unless `SANDBOX_CREATOR_CASHOUT_ENABLED=true` and
`STRIPE_CASHOUT_TEST_KEY` is a test credential. These names document deployment
prerequisites, not authorization to change secrets or enable execution.
The dedicated webhook uses `STRIPE_CASHOUT_TEST_WEBHOOK_SECRET`, rejects live
events and wrong connected-account/execution bindings, and only reconciles
current provider state with GETs. It cannot dispatch a transfer or payout.
It can reconcile existing attempts even while new dispatch is disabled.

Each explicit continuation executes at most one shared-engine dispatch stage.
Unknown results remain reconcile-only; an empty provider lookup does not
authorize another payout. No background scheduler is introduced here.

## Evidence and remaining gates

Focused automated tests cover test credentials/mode binding, authorization
before service reads, isolated RPC routing, shared engine transfer/payout
stages, webhook boundaries, stale-session/client controls, duplicate clicks,
and ambiguous responses. They mock provider transport and do not prove actual
Stripe configuration, bank delivery or installed behavior.

Before declaring end-to-end readiness: integrate and validate the companion
database migration; inspect actual test account/capability/destination and
qualification readiness; verify the dedicated webhook; exercise real sandbox
purchase/access, earnings, refunds/late failures and test payout on Android
and iOS. Full exact-head Required Validation remains a merge gate. No provider
setup, credential changes, tester enrollment, deployment or release is part of
this checkpoint. Rollback is to remove the new UI mount/adapter deployment;
existing unknown executions must retain their isolated reconciliation records.

## Commissioning checklist (not performed by this source task)

As of 2026-11-02 this adapter's actual deployment, test keys, dedicated webhook,
connected test account, tester qualification and installed-device results are
**unverified**, not enabled/ready by inference from passing unit tests.

1. Read deployed migration history and exact function/source identity; compare
   the companion migration and both new Edge functions to the reviewed commit.
2. Read effective test control, exact active tester/session and live-money,
   cashout and payout switches. All live switches must remain OFF. Never change
   global live flags to make a test pass or enroll testers under source approval.
3. Privately verify the dedicated test credential is configured without printing
   it, the platform account identity matches qualification, and the connected
   account is test mode. Read recipient transfer capability, manual payout
   schedule, US/USD and the exact external destination's supported method.
   Qualification expiry and exclusive-writer/provider evidence must be genuine,
   not copied from disposable fixtures or fabricated from a UI preview.
4. Verify signed test webhook routing and its dedicated secret through approved
   provider tooling. Check account/execution binding, duplicate delivery,
   out-of-order delivery, signature rejection and test/live mismatch rejection.
   If any prerequisite requires mutation, obtain the relevant separate authority.
5. On each separately identified internal Android and iOS installed build,
   complete a real store sandbox purchase from the actual contextual buyer
   screen. Verify access derives from provider-backed receipt authority; then
   verify the creator's sandbox earnings source and immutable simulated
   deduction policy. Do not infer real taxes, real provider fees or payable
   production balance from those simulated amounts.
6. From channel-settings payout readiness, review and reserve the exact test
   quote, continue the same request through funding and payout, and read actual
   test provider objects/current status. A test transfer is not a bank payout;
   a test payout reported paid is not a real bank deposit or live-readiness proof.
7. Exercise purchase refund/revocation before dispatch, after funding and after
   test-paid; verify holds, reversal/return evidence and no duplicate reservation.
   Inject lost dispatch response and replay the same request: the SQL unknown
   stage must issue provider GETs only. Exercise failed/late payout events,
   empty recovery lookup, fee mismatch, expired qualification and revoked tester
   or session. Preserve unresolved states rather than presenting success.
8. Retain redacted independent database/provider observations and platform-specific
   screen evidence for every transition. No private provider payloads, account
   identifiers, tokens or secrets belong in committed diagnostics. Record failed,
   skipped and never-run cases explicitly. Full Required Validation and this
   commissioning evidence are separate gates; neither substitutes for the other.

## Source coverage ledger

The following describes disposable full-schema processor fixtures, not real
provider delivery or device validation. Every lane still needs its actual authorized
storefront, catalog, receipt/access and installed Android/iOS commissioning proof.

| Existing paid lane | Cashout-source integration evidence |
| --- | --- |
| Channel subscription | Apple/Google canonical initial purchase, renewal, duplicate and refund fixtures passed |
| Native store tips | iOS one-time canonical fixture passed; Android existing99¢ SKU is below enforced100¢ floor and remains unavailable |
| External Stripe tips | Not admitted: existing destination-charge transfer already funds connected account; adding another funding transfer would duplicate it |
| Paid content | Apple/Google paid-video canonical processor, net, full reservation, replay and refund fixture |
| Fixed event tickets | Apple/Google actual ticket reservation, checkout-time evidence, processor, net/reservation/replay/refund |
| VIP | Apple/Google canonical processor, net, full reservation, replay and refund fixture |
| Watch-party admission | Apple/Google canonical processor, net, full reservation, replay and refund fixture |
| Live Stage access | Android existing Live Stage product through dedicated processor, net/reservation/replay/refund; iOS dedicated catalog unsupported |
| Native Live Stage seat eligibility | Android existing product through dedicated processor, net/reservation/replay/refund; no speaking/host-approval or reserved-seat claim |
| Reserved room stage seats | Canonical room-seat auction evidence below; native eligibility alone is not a reserved seat |
| Event auction | Canonical platform checkout, immutable contract, paid/refund receipt into source |
| Room-seat auction | Canonical platform checkout, immutable contract, paid/refund receipt into source |
| Physical merchandise | Canonical checkout binding and Stripe lifecycle into separate merch source |

Native PostgreSQL contention harness currently registers 33 schedules, including
recovery-authority revocation and canonical event/room auction refund commit/rollback. Local source tests are not native execution: Docker
is unavailable here, so exact-head hosted native validation remains required.
Auction quote-before-ledger locking has independent source review; dedicated
auction refund contention and separate quote-only pre-projection barrier schedules
are integrated but their native execution is pending. Arbitrary multi-receipt
transactions are not covered by a universal race-safety claim.

### Existing tip route limitations

The Android native mapping `creator_tip_sandbox_099` is 99 cents, whereas the
existing creator tip schema and settings RPC enforce at least 100 cents. This is
a source policy/catalog mismatch, not an asserted Stripe minimum. Existing iOS
299/499/999-cent mappings can satisfy the floor. Do not lower policy or invent
Google product mappings to pass a test; higher genuine Google catalog evidence
or an explicitly approved pricing-policy decision is required.

External Stripe tip checkout uses `transfer_data.destination` and separate
`creator_tip_transactions`/`monetization_webhook_events` accounting. Those tips
are not a digital-ledger cashout source here. Their already-funded connected
account balance needs independently reconciled payout-only authority; admitting
them to the current funding-first engine would duplicate creator funding.

A bounded follow-on for external tips must first reconcile authenticated test
charge→destination transfer→connected balance transaction evidence, including
remaining net, reversal history and availability, against the immutable original
platform/account/USD binding. The current webhook records payment/refund facts,
not transfer/balance-transaction availability, and projected `creator_net_cents`
is not that proof. A separately reserved, immutable pre-funded source could then
enter payout-only execution without a funding POST, with exact-account aggregate
balance/exclusive-writer checks. Its return path must not fabricate an unrelated
funding transfer. This evidence contract and payout-only admission are not
implemented by this checkpoint.
