# Auction platform settlement: test-only source

This version implements the owner-approved platform-charge direction for event
and room auctions. It does not enable provider configuration, live charges,
transfers, payouts or public distribution.

## Charge and access boundaries

- New checkout uses a separately configured test platform credential. A GET of
  the actual Stripe account must match the pinned qualified platform account
  before Checkout is requested. There is no connected-account charge header,
  automatic destination transfer, application fee or payout API request.
- A private, independently qualified mapping binds the exact capability,
  recipient, platform account and platform-owned product. It is empty by default
  and has no API-role write grant or provisioning endpoint. An existing
  connected-account product ID is not platform-product qualification.
- The immutable settlement contract freezes charge owner, recipient, purchase,
  exact amount/currency and `auction_platform_net_80_20_v1`. Current recipient
  eligibility, original buyer/session and external-payment admission still apply.
- Fresh qualifications can append a renewal for the same capability. Only the
  newest evidence is considered; revoked or expired evidence never falls back.
  Claimed contracts reject account/product substitutions during renewal.
- Old direct-account claims are reconciliation-only through the new checkout
  entry points. Historical signed direct receipts still use their original
  account. No historical quote or transaction is reinterpreted or recharged.
- Platform callbacks require separate signing-secret configuration and pinned
  platform identity. Raw HMAC verification is unchanged. Paid/no-payment evidence
  must name the exact contract and policy. Refund/dispute lookup uses the actual
  charge account, preserving receipt, ticket, seat and D1-D4 lifecycle rules.

## Held accounting, not payable earnings

The service-only GET adapter verifies the account, Checkout, PaymentIntent,
captured charge, balance transaction, fees and complete refund pagination. It
rejects automatic destination transfers/application fees, missing amounts,
wrong identities and changing refund/dispute snapshots. It stores only the
small normalized observation, not raw provider payloads or credentials.

Tax is unknown unless Stripe supplies a completed calculation. Store/Google
fee obligations remain unknown: there is no fabricated public-rate estimate or
qualified operational feed in this patch. SQL checks exact receipt identity,
refund/balance arithmetic, immutable known original costs and stale snapshots.
Known net allocations retain 20% for Chi'llywood and 80% for the creator;
unknown components produce no computable share. Negative observed net is a
recovery obligation, not a positive creator balance.

All allocations retain sandbox, fulfillment-clearance and adjustment holds,
plus applicable tax, store, balance, refund and dispute holds. A durable transfer
plan may be recorded only as HELD with `financial_authority=false`. Its source
charge, recipient, amount, allocation and idempotency identity are immutable;
duplicates return the same plan. Changed allocation or refunded/revoked payment
requires reconciliation, never a replacement spend.

## Explicitly unfinished activation/release work

- Operational qualification/provisioning/revocation, actual account-specific
  provider/tax/store evidence and provider delivery/device proof.
- Trusted fulfillment/remedy/adjustment clearance and operational release
  event-coverage qualification. The downstream test-only executor described
  below cannot invent those facts. Native parallel release/refund contention proof remains
  required.
- Operational qualification of transfer/reversal execution and provider-result
  reconciliation. A refund does not itself reverse a separate transfer.
- Production account responsibility, permitted funds-holding duration, country
  compatibility, recipient v2 transfer capability and explicit activation.

Platform ownership means Stripe fees/refund/dispute debits affect the platform
balance. An application accounting hold is not provider-segregated cash. No
private-preview funds-segregation feature is assumed.

## Integration scope

Tips and merchandise settlement are unchanged. The auction GET observer follows
the existing merchandise cost-observation pattern but has a separate contract,
endpoint and private ledger. Existing shared signature/authentication helpers
are reused without changing their behavior. Access still comes from the existing
event/room receipt projection, not the held allocation or transfer plan.

Synthetic fixtures are not operational qualification evidence. The checked-in
database tests use actual role grants and full migration replay; Edge tests mock
provider transport and exercise the production handler/parser/GET adapter. They
do not establish real Stripe delivery, native transaction contention or release
readiness. Required Validation at an eventual integrated exact head remains a
separate gate.

## Local source evidence (2026-10-30)

- Production-handler/parser/GET-observer synthetic Edge tests: 36 passed.
- New platform event/room full-replay SQL tests: 2 passed, no skips.
- Historical direct event/room payment full-replay SQL tests: 2 passed, no skips.
- Exact runtime-catalog replay/idempotence (Studio held and included): 2 passed.
- Cached-only Deno typechecking: both checkout endpoints, both webhook endpoints
  and the auction cost-reconciliation endpoint passed.
- Changed JavaScript tests: ESLint passed with zero warnings.
- Bounded independent static diff review: identified account ownership,
  refund-cost and qualification-renewal issues were corrected before handoff.

No live provider execution, deployment, full application typecheck, complete
Required Validation or native parallel contention test is claimed here.

## Downstream test-only execution boundary

`20261030202414` adds durable one-operation-per-contract reservation. Exact
allocation, source charge, recipient, amount, currency, metadata and idempotency
identity are persisted before dispatch. A separate private release-evidence row
must bind the allocation, original-promise hash, fulfillment time and current
domain-fact hash. No API role can write that evidence directly. The approved
policy is `auction_fulfilled_replay_expired_available_no_open_issue_v1`.
Live-only and explicit replay promises retain their captured terms;
indefinite/ambiguous replay acquires no invented expiry.

The narrow room issuer takes only contract identity. It derives the original
paid claim/session, authenticated buyer availability observation, normal creator
closure, retained admission/rejoin, absence of refund-review and forward-observed
membership removal/deletion. A pre-observation paid claim remains unknown.
Camera/mic use, subjective quality or a new buyer acceptance is not required.
Event start or COMPLETE observation time alone is not promised-duration proof;
the event issuer uses immutable provider-recorded interval evidence and the
original or explicitly accepted schedule, then independently checks the captured
replay deadline/window. Late raw or normalized provider failure/unknown evidence
invalidates pending eligibility and retains any in-flight recovery obligation.

Canonical negative holds are checked independently: payment status, latest cost
allocation, unknown/pending costs, recipient identity/readiness and fraud holds,
event cancellation/no-show/refund remedies and schedule-choice notices, or an
unfulfilled/still-open room claim. New cost allocations and terminal payment
updates cancel undispatched operations or retain dispatched recovery obligations.

The executor is disabled unless a separately configured test-only execution
setting is present; it rejects live keys. Claiming consumes the single dispatch
permit and durably sets `unknown` **before** network access. Provider account,
recipient transfer capability, captured charge and available balance are read
before the exact separate-transfer POST. Failures—including success followed by
failed local persistence—never enable another POST. Recovery GETs the known
transfer or exhausts the group-filtered list; empty, ambiguous, mismatched or
incomplete results stay unresolved, including after idempotency retention ends.

Recovery reversals have separate qualified net-amount evidence, unique reserved
operations, one-shot dispatch and GET-only reconciliation. A contract-only issuer
derives the reduction in creator entitlement from complete verified refund
balance facts, retaining the same 80/20 net rounding. It subtracts all reserved
reversals, including unknown outcomes; the resulting recovery need not equal
80% of the gross refund. Unknown tax reversal, nonzero store fees with unqualified
refund adjustments, disputed costs or unmatched provider reversals stay held.
Reservation sums are
bounded by the original transfer; unknown reversals still consume capacity.
An observed reversal never marks a buyer refund completed or silently clears a
recovery obligation. There is no refund or payout API call in this executor.
Each reversal freezes the expected cumulative reversed amount. A differing
provider preflight blocks the POST. Postflight reads and reconciliation retain
the exact successful reversal even if cumulative totals conflict or the read
fails; the aggregate remains held. Stripe offers no compare-and-swap here:
exclusive-writer/operational qualification is still required because another
Dashboard/provider writer can race between GET and POST. No automatic corrective
transfer, extra reversal or blind replay is performed.
Platform-to-connected-account transfer is **not a bank cash-out**. Existing
standard/instant cash-out preferences are unchanged; no instant option is
selected automatically and this source does not collect the 2% instant fee or
execute a bank payout. Actual instant-fee collection and bank-payout execution
remain separate operational/source qualification gates.

**Approved 2026-10-30 at 20:31 UTC:** eligibility after event/session fulfillment
and included replay expiry, available Stripe funds and no unresolved refund,
dispute or non-delivery issue. No invented additional hold duration or service
“clear all” flag is used. Exact net-recovery amounts still require qualified
adjustment evidence; gross refund amounts are never silently converted to net
creator reversals. Original and explicitly accepted event schedules retain the
existing D2 thresholds and acquired remedies. Provider-output interval evidence
does not claim viewer-quality delivery; insufficient interval evidence only
holds automatic release, never creates a new refund/no-show policy.
Synthetic tests are not operational evidence or permission
to activate.

Operational scheduling, actual provider/qualification delivery, an independently
qualified store-obligation feed and external-writer coordination are not proved
by this source. Native parallel race scenarios are registered separately for CI;
local full-schema tests do not substitute for native concurrency execution.

Provider contracts checked against Stripe's
[transfer creation](https://docs.stripe.com/api/transfers/create),
[transfer listing](https://docs.stripe.com/api/transfers/list), and
[separate reversal](https://docs.stripe.com/api/transfer_reversals/create)
references. All provider transport exercised locally is synthetic.

References: [charge responsibilities](https://docs.stripe.com/connect/charges),
[separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers),
[error and retry handling](https://docs.stripe.com/error-low-level).
