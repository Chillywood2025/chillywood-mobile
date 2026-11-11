# Native signed corrections: source-only successor

This adapter is OFF by default. It makes no provider request, deploys nothing,
seeds no qualification, and does not enable checkout, money or payout. Actual
Apple/Google transaction-level report, correction, delivery and funding
interoperability remains unqualified. Aggregate reports cannot be divided among
creators using a guessed fee, tax or payout rate.

## Reachable accounting path

The trusted report adapter's private append function stores exact immutable
production transaction/admission/source/creator/currency facts, signed components
and a cumulative coverage manifest. It queues the existing accounting worker.
The service reconciliation entrypoint fences the report namespace before choosing
either original or corrected materialization. A new report immediately holds old
native withdrawability even while correction accounting is OFF.

Each complete current revision produces at most one checkpoint. Its target is
positive developer proceeds less the immutable platform share, or the full
negative developer proceeds. Its delta is against the last actually accounted
target, never against a merely diagnostic candidate. Negative deltas use the
existing accepted future-unpaid recovery policy. Positive deltas create linked
native paid-content credit earnings, never `cashout_fee` credits. Paid allocations
and earlier earnings are not rewritten. No bank-debit operation exists here.

Before any earning exists, complete positive corrected economics may create an
explicit corrected opening and a zero-delta checkpoint. It uses actual retained
gross, fees, taxes, platform share and creator proceeds. Nonpositive or incomplete
opening economics remain held without creating debt. Original source admission,
transaction and the frozen original report baseline remain immutable.

## Current qualification and funds

All components and negative identities require exact coverage. Canonical terminal
history, retained report identities and the current unbound terminal watermark
are independently hashed; the watermark cannot stand in for earlier history.
Each negative alias specifies the same exact positive amount and effective time
as its refund component. Known original report amounts, effective times and provider
negative IDs must agree; the manifest cannot close before a known negative event.
Multiple aliases may name one refund component only with equivalent financial facts.
Conflicting IDs, missing current
coverage, unknown negative semantics and changed source/terms/recipient hold.
Newest report/qualification selection occurs before validity checks, with ties
and invalid current records failing closed rather than selecting an older row.

Corrected balances need a new funding proof for the exact checkpoint and a global
USD creator-liability hash. The supported pool is ONE independently authenticated
Stripe platform account's available USD, bound to the recipient's verified platform
identity. Balances from different accounts, currencies or Store reports are never
added together. All outstanding production creator liabilities, including other
receipts/commerce and unmapped accounts, conservatively compete for that one
account's coverage. Unresolved non-USD or missing production provenance holds.
Multi-platform partitioning is not qualified; this contract may over-hold it.

Liability is recorded earnings less actual paid allocations and persisted offsets.
Outstanding debt and reserved/processing allocations are not deductions. Immutable
paid/return history and exact allocation/offset identities enter the hash. Returning
a paid allocation cannot restore an earlier proof even when the numerical balance
returns to the old value. Proof verification must follow this liability generation.
Independent delivery evidence remains required. Recipient cannot change from an
earlier release. A changed credit, paid history or offset requires a fresh read;
making a reservation alone does not invalidate funding.

Existing cashout allocations and creator locks already prevent reserving or paying
the same earning twice. This source does not add a second payout reservation. The
additional funding requirement addresses different receipts claiming the same
unearmarked account balance. It is deliberately conservative: other creator
activity can invalidate a native funding proof. Busy multi-account deployments
are not qualified for this pool contract, and no starvation-free throughput claim
is made. An independently established exclusive pool would require separate facts,
not an inferred partition of a shared account.

Liability tracking is dormant while correction accounting is OFF: triggers perform
an OFF check but do not write history or acquire a global generation writer lock.
Every OFF/ON transition advances a monotonic generation, so activity while OFF
cannot revive old evidence later. While enabled, relevant earning insertion,
amount/provenance change, offset and paid/return mutations advance that counter and
record clock_timestamp independently of any business created_at. Hash timestamps
use UTC. Funding binds the exact generation and snapshot capture time, not merely
a timestamp or a business date.

Every enabled generation write explicitly acquires its relation and singleton row
with NOWAIT before UPDATE. This applies to ordinary provenance, recovery-offset,
payment-return and OFF/ON writers, including callers already holding creator or
business locks. Contention raises55P03 and rolls back the entire financial
statement/transaction; it never skips invalidation or uses old coverage. Existing
queue55P03 retry semantics remain unchanged. Direct callers receive a retryable
failure rather than an added blocking singleton dependency. This is a proposed
bounded protocol pending actual contention proof, not a starvation-free promise.

Immutable native original/credit and commerce release/fee-credit lineage overrides
both mutable public environment labels. Contradiction holds the whole pool. Native
ignored ingress is recognized only through exact retained canonical/source
identity, never by a generic status allowlist. Current qualification expiry or
revocation cannot discharge already issued liability. New immutable lineage
insertion also advances generation; every mutable canonical/money field used by
this classification is tracked. These checks do not authorize payout or change
the original ignored receipt status.
Marker fingerprints preserve key presence separately from value, including JSON
null. The normal paid-video observer also invalidates a cached classification when
it appends after an existing generic earning, with no bookkeeping/earning lookup
while OFF. Missing money-to-receipt pointers are explicitly rejected. Paid-return
writers acquire the new history relation NOWAIT before appending audit, so the
extra history write cannot wait ahead of the guarded generation protocol.

The trusted funding issuer captures one immutable snapshot per generation under
nonblocking facts fences. Current eligibility performs a constant-size cache read
and holds when no exact snapshot exists. The earlier512-row/512KiB construction
was not a justified product capacity and is superseded in the current source draft.
The replacement streams256-key batches into a constant-size ordered SHA256 chain
of typed current financial fields. It never builds a platform-sized JSON document.
Fully paid zero-residual history and canonically verified sandbox receipts do not
count as active production liabilities. Mere sandbox text without exact canonical
receipt/money/earning provenance holds rather than disappearing. Unknown positive
production provenance/domain, negative residual and non-USD residual hold with
specific recorded reasons. Historical allocation/return/offset identity changes
remain bound by the monotonic generation and immutable paid/return history.

The private construction entry point has a five-second,250,000 examined-row and
4,096 paid-allocation/offset-children-per-earning resource envelope; test/issuer
parameters may only narrow it. These are UNQUALIFIED resource guards, not a
production capacity promise. Indexed child scans and small keyset batches bound
work between duration checks. Any exhaustion records a reason, examined/active
counts and duration, and publishes no partial snapshot. Zero residual rows still
consume examination work, but never active liability or whole-row JSON capacity.
The diagnostic table deduplicates each generation/reason and is private,
append-only and FORCE RLS. Existing earning identity indexes are reused.

The expanded, currently unrun fixture measures12,000 paid historical rows plus
5,000 canonical sandbox rows and5,000 simultaneously maturity/reserve-held rows,
then grows current synthetic liabilities to10,000. These retain actual canonical,
money, earning, maturity/reserve and payout-allocation schema shape. It also times
2,000 cache reads and50 full current classifiers, and deterministically exercises
a narrowed examination budget without publishing a partial snapshot. Passing a
fixture would measure this local envelope only, not prove production scale or
provider interoperability. High-throughput global-pool liveness remains separately
unqualified; unrelated enabled mutations invalidate all global proofs by design.
The250,000 examined-history ceiling remains an eventual append-only-history
liveness limit even with few active liabilities. A qualified incremental active
index or equivalent retained-history strategy is still required beyond that
envelope. The five-second check is cooperative between bounded SQL operations;
issuers must commit capture before remote provider I/O, then submit independently
observed funding against the exact captured generation. No real issuer is supplied.

Credits keep actual issuance time for future-only recovery, while retaining the
original paid-content maturity and reserve policy. A credit can cover outstanding
debt; final cashout still requires that debt to be cleared. Native recovery,
current-domain qualification and final dispatch use nonblocking native namespace
fences before creator locks on the supported entrypoints. Native operations also
fence complete commerce/merch/auction/event/room authority namespaces and their
public source rows, covering mixed future-earning recovery and report INSERTs.
Existing commerce writers retain their own behavior and lock order. Current native credit
provenance is required even if an old generic domain would otherwise return true.

## Verification status

Draft implementation is not ready for publication. Native PG17 Run4 on a150d0a
passed schema replay, initial release, exact correction totals, debt/checkpoint
idempotency, rollback midway through credit creation, credit issuance, future-only
recovery and refreshed funding. It stopped at an overly specific fixture counter
expectation (two same-statement liabilities generated both earning and provenance
events). Fixture-only b4706e4 now checks per-step counters, no-ops and same-recorded-
time ABA, but has not run. Run5 on6264f357 replayed schema and initial correction
setup, then failed SQL42702 in the new diagnostic conflict target at first corrected
funding. The latest coherent batch fixes that alias, exact ignored-native and
immutable-production provenance, forbidden earning UPDATE fixtures and bounded
ordinary generation locking. This successor has not run. Later correction, opening,
concurrency and capacity assertions remain unproven. All completed owned clusters
were stopped and removed. No target/provider data or financial activation occurred.
Source re-review of ce9486c found four additional gaps in marker presence,
late-observation invalidation, history-relation locking and nullable canonical
linkage. The successor addresses all four with normal-observer, null/ABA and
history-holder fixtures; no runtime pass has been claimed for these changes.

Incremental source review cleared069e65a for focused proof. Run6 on3848f00
stopped at a fixture sandbox transition missing its nonpayable tuple. Run7 on
fixture-only698d478 passed the new mutation/provenance groups, then stopped at
retained-history allocation: an already-paid earning with an unknown settlement
policy is not available for allocation. Neither run is a complete pass. The next
fixture uses verified mature ordinary earnings under the existing policy, valid
allocations followed by append-only paid lifecycle, and a returned allocation
without fabricating paid-to-available authority. Partial-payment ABA retains the
released allocation and uses a fresh funded replacement instead of deleting paid
history. Existing over-allocation rejection is tested; the defensive negative-
residual branch is not claimed reached through that prohibited operation.

Run10's finalizer-only diagnostic passed the actual two-allocation native cashout
funding/payout/actual-fee finalization and replay path. The suspected generation
self-invalidation was not reproduced; no product change was made for it. Run11
advanced through correctness groups but found timezone-sensitive maturity
integrity. Run12 isolated a one-hour reserve deadline shift across DST while
correction economics and funding remained valid. The successor uses a private
UTC deadline helper only for native hold/reserve construction and exact rechecks.
It does not set timezone on the public reconciler or affect nested legacy-domain
calculations, widen time tolerances, rewrite stored earnings, or relax economics.
Fixed historical October fixtures cover both original and corrected openings
created under a DST timezone and rechecked under UTC. These successor tests are
not yet run. Diagnostic selections remain explicitly labeled; default execution
still includes all correctness, concurrency and retained-capacity assertions.

Independent review of24ba12dc identified six blockers: contradictory negative
financial facts, reused shared-account funds, paid/return ABA, mixed-domain recovery
races, equal-time issuer ties, and a fixture copying unique earning links. The
successor source addresses each and adds targeted fixtures, including forced
mid-credit rollback, partial debt consumption, committed revocation, shared funding,
paid/reserved history and mixed commerce report commit/rollback. These fixes have
not yet passed a database run or fresh independent review. Re-review of67b10b08
additionally found timezone-dependent hashes, business-date freshness, a recovery
fixture expecting a second consumption and a shared-funding fixture without a
qualifying baseline. The new successor corrects those and adds monotonic bounded
snapshot tracking, OFF-state behavior and capacity tests. The33 pgTAP assertions
are authored, not executed. Combined exact-head Required Validation is pending.

The separate checkout worker owns normal client/SDK dispatch and receipt/playback
integration from the reviewed ledger milestone. This correction source alone is
not full production-ready checkout or real-provider acceptance proof.
