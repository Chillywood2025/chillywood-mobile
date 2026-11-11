# Native production: prospective admission and actual-report boundary

## Historical source milestone

This document records the earlier admission/report and linked-earnings slices,
including their then-current proof status and unfinished-work statements below.
Those statements are historical, not the current combined-source status.
The later combined source implements signed corrections and future-unpaid
recovery contracts; see [signed corrections](NATIVE_PRODUCTION_SIGNED_CORRECTIONS.md)
and [checkout](NATIVE_PRODUCTION_CHECKOUT.md) for the successor contracts and
remaining qualification/recovery limits. Production controls remain OFF;
source implementation and synthetic/local proofs do not establish real provider,
native/device, deployment or financial readiness.

Migration `20261110232244_native_production_source_reports_and_cashout_boundary.sql`
continues the reachable ingress observer. It does not implement provider GET
authentication or normalize a real Apple/Google report, seed qualifications,
activate a switch, create a money intent, grant playback or issue creator earnings.
The migration's hard-false native cashout veto is superseded by the source-only
draft `20261110235044_native_production_linked_earnings_controls.sql`. It implements
a linked earning materializer and current eligibility behind independent OFF
controls. That successor has focused native database proof, but is not yet
exact-head protected-validation or publication-approved.

The second-slice full-schema test passed on owned native PostgreSQL 17.6 in Run 4,
including actual authenticated Google/Apple held preparation, reports and cashout
regressions. The authored pgTAP tests and exact-head protected validation remain
pending. After fixture-only timestamp/SQL corrections, third-slice Run 6 passed
on owned PostgreSQL 17.6: positive linked earnings, atomic rollback, current
identity/authority holds, eight concurrent holder/rollback schedules, committed
refund versus final payout, and failed-job isolation. Synthetic SQL dispatch
claims are not actual transfers, provider report interoperability or live proof.

## Reachable paths and retained identity

1. Ordinary `public.videos` INSERT, relevant UPDATE and DELETE append a private
   source version, retaining deletion and ownership changes. Only prospective
   writes are captured, never a migration-time adoption of existing media.
   Non-source title edits do not create byte claims. Source facts include origin
   paths, provider/bucket, size/MIME, ownership, scan/safety and visibility. Dates
   are hashed as epoch numbers, independent of the database session time zone.
2. A row revision is not an immutable byte proof. Empty, non-API-writable source
   proofs require exact version, provider/bucket/object/generation, byte hash and
   length, independently verified clean-byte evidence, adapter version and expiry.
   Existing Brand scan receipts are not relabeled. Same path with new bytes still
   needs a qualified immutable-generation adapter; a path/hash assertion alone
   cannot satisfy that external verification.
3. The ordinary precharge helper retains all old buyer, creator, current session,
   legal, Premium, safety, audience and exact price/provider checks. Its production
   branch records only a held prospective preparation when source and scope are
   independently qualified. Sandbox and historical access behavior stays intact.
4. `public.prepare_native_production_paid_video` is an authenticated held-only
   return path through those same checks. It returns before the existing native
   production-intent constraint, so a valid held preparation can commit without
   attempting an SDK charge. The normal legacy purchase-intent RPCs remain
   prohibited for production; their enclosing failure still rolls back any work.
   No existing sandbox client transport is redirected to this new RPC.
5. Admission freezes the buyer/session, creator/source version/byte proof,
   independent catalog ID and provider scope, quantity/currency/gross,
   accepted exact terms/role/share and quote hash/expiry. An exact unexpired retry
   reuses that admission. There is no API to supply another creator or to issue a
   scope/byte qualification. Current roles are read from the same profile role
   used by existing legal acceptance, not guessed from a creator label.
   Google binds its production catalog row. Apple retains the existing setup
   conceptual catalog product and separately freezes the exact active production
   store mapping. A setup conceptual product is not a production mapping, and
   an existing sandbox mapping is never promoted.
6. Normal authenticated RevenueCat observation completion appends one report-read
   obligation. Its adapter state remains `unqualified`. The private correlation
   boundary needs exact prospective admission plus authenticated transaction and
   original chain, purchase time, actual quantity/gross and raw evidence. It checks
   the canonical production receipt/catalog/buyer tuple and historical source and
   acceptance validity. Correlation completion binds the sale once and creates a
   held missing-economics snapshot. It cannot promote an existing sandbox intent,
   catalog product, source allocation, receipt or settlement.
7. A future authenticated report reader calls the private bounded append function.
   No API role can call it or write its tables. Exact observations deduplicate;
   changed observation IDs reject; conflicting overlapping components or same
   revision manifests persist as held diagnostics, never an overwrite.
8. Report completion recalculates fees, fee tax, sales tax and developer proceeds
   inside SQL. Every category requires explicit transaction-scoped evidence,
   including explicit zero; NULL and empty reports remain unknown. Components
   use stable identities, exact integer arithmetic and complete manifests. The
   newest exact current qualification wins with no expired/revoked fallback.
   Refund/revocation/chargeback and existing unbound terminal authority remain
   holds across arrival order and app/project drift. Snapshot rows enforce HELD,
   false financial authority and false payable independently of JSON output.
9. The existing service hold getter re-evaluates bound economics now, not from a
   cached formerly complete snapshot. It returns no raw report, account identity,
   source location or provider identifier. Source replacement, expiry, revocation,
   catalog drift or invalidated terms close diagnostic completeness immediately.

## Current cashout boundary

`private.commerce_current_earning_domain_ready` composes an explicit native guard
before its unchanged commerce predecessor. Canonical native evidence **or** a
private earning-source link identifies the domain. Missing canonical provenance
on production paid content is held; a missing optional native release link never
means eligible non-commerce earnings. Source classification does not depend only
on mutable catalog labels.

Existing withdrawability and funded-undispatched cashout checks already invoke
this predicate. They therefore refuse native funding/payout or freeze a previously
funded, never-bank-dispatched execution. Payout-unknown evidence is not converted
to a never-dispatched claim. Existing correction qualification, return/reversal
stages, GET reconciliation and all commerce locks are retained.

The second-slice function returned false for every native earning. The third
slice replaces that intermediate veto as described below. Its focused native
contention tests passed, while full frozen-head regressions remain pending.

## Default-OFF linked materializer and current release

The independent controls `materialize_held` and `release_earnings` both start
false. No API can enable them or issue source, report-semantic, correlation or
funding proofs. With only materialization enabled in a disposable fixture, exact
complete economics can create one pending production money row, one HELD creator
earning and one immutable canonical receipt/snapshot/source link. A retry reuses
that link. It cannot adopt another money lane or change the original amounts.
Store fee plus fee tax, sales tax, platform share and creator proceeds must balance
to the actual gross. Unknown costs never become zero. Existing seven-day maturity
and 10%/30-day reserve policy is retained, not waived by this adapter.

With release separately enabled, the existing money switches must also be ON.
Current account restriction, exact creator-money legal requirements, verified
ACTIVE creator eligibility, KYC/tax/sanctions and global RevenueCat quarantine
checks match established settlement/cashout authority. Funding proof binds the
same canonical transaction, immutable economic snapshot, exact platform/recipient
accounts, actual available developer proceeds, delivered source evidence and
accepted future-unpaid recovery terms. The issuer must read the persisted
snapshot before verifying funding/delivery; that verification and available
funds cannot predate the purchase. Expired/revoked newest proof cannot fall back.

The materializer then records the established available lifecycle, not a provider
transfer. Current withdrawability/final cashout rechecks source, report coverage,
qualification, legal/eligibility, exact money/earning identities and costs,
settlement dates/reserve, funding and original recipient. Missing native links or
current evidence never fall through the generic non-commerce predicate.

Normal economic snapshot triggers enqueue accounting jobs. The source-only
`native-production-accounting-worker` requires exact service authentication, an
empty body and its own environment flag (default OFF), then invokes the bounded
SQL queue worker. SQL independently enforces its controls. A failed receipt rolls
back its entire positive-operation subtransaction before a sanitized failed
attempt is saved; another receipt can still progress. Accounting and failed
attempt persistence both use nonblocking locks. This worker has no provider I/O,
proof issuer, activation endpoint, schedule or deployment in this change.

Positive accounting takes a try-only global accounting fence, EXCLUSIVE NOWAIT
table fences over its native facts and all current release/dispatch dependencies,
then a try-only creator lock. Existing commerce-domain locks remain first at final
dispatch. These conservative table fences permit ordinary SELECTs but conflict
with writers, row-lock holders and FK locks. Contention aborts before a positive
marker, and facts are reloaded after the fences under READ COMMITTED. No existing
provider writer or unrelated commerce domain has its ordering changed. This is
intentionally conservative and may reduce concurrency; runtime load behavior is
not claimed from the source review.

## External qualification versus unimplemented code

### Historical proof and current equivalent renewal

The renewal successor keeps admission-time proof IDs and validates each report
under its actual issuer and observation time. Explicit renewal-root lineage is
required, with an existing non-renewed root and exact source generation/hash/size
and verifier semantics, or exact provider/project/app/account/product/currency,
report schema and accepted legal/share semantics. A new UUID alone is neither
authority nor a reason to permanently discard valid historical evidence.

The current namespace's newest row is selected before checking validity and
equivalence. Changed, unlinked unknown, revoked, expired or timestamp-tied latest
proofs hold the sale without falling back. A report can be issued by a valid root
or an equivalent renewal. Every overlapping observation is validated; later
copies cannot qualify evidence that was invalid when first observed. Newer proof
INSERTs are covered by the same table-level NOWAIT fences as row revocations.

Run 8 passed root-admission expiry/renewal and native phantom schedules. After
final review added missing-root rejection and renewal-admitted/root-issued
coverage, Run 9 passed that updated native fixture in 19.6 seconds. All 14 pure
economics unit tests and strict standalone TypeScript pass. Full exact-head
combined regression/pgTAP/protected validation remains outstanding.

Implemented with focused third-slice native database proof: linked held earning, exact
current snapshot/recipient binding, independent OFF accounting/release controls,
normal snapshot-to-worker invocation and positive/current-domain rules. Authored
tests passed for positive release, exact retries, partial-write rollback, current
revocations and native commit/rollback contention. Signed cost/refund correction
and future-unpaid debt/credit integration are still unfinished source work, not
facts that a provider audit alone will supply.

External facts still unproven: actual immutable origin generation/readback and
matching scan coverage; real store/project/account/SKU ownership; SDK-to-provider
transaction correlation; the existing Apple and Google accounts' report schema,
transaction-level attribution, exact fees/fee taxes/sales tax/developer proceeds,
coverage/finality, funding availability and refunds/reversals. Aggregate Apple
sales rows must not be assigned to creators by an assumed commission percentage.
Google order results alone must not be treated as complete fee coverage.

Initial normalized economics deliberately do not guess signed correction,
multi-currency conversion or partial-refund allocation rules. The adapter must
model those exact identities and accepted future-unpaid recovery before claiming
the whole production lifecycle complete. Missing/unsupported facts remain held;
tests cannot qualify a real account or justify an activation.
