# Registered Offering Test Store protocol v2

This additive source path supports successive creator tips for one permanently
bound buyer installation. It is unconfigured and inactive. It does not qualify
a RevenueCat project, a physical device, managed database permissions or a
deployment. The ordinary app and all live money operations remain disabled.
V1 allocations, identities and receipts retain their original meaning.

Install `test-store-offerings-core.sql`, `test-store-qualification.sql`,
`test-store-offerings-commands.sql`,
`test-store-offerings-provisioning.sql`, then
`test-store-offerings-receipts.sql` after `test-store.sql`, before the final
`permissions-finalize.sql`, in the same explicit transaction as the rest of the
isolated runtime. These files add private objects and seven service-only RPCs;
they replace no legacy function or policy. The modeled local installer proof
does not establish that the actual target can safely run this installation.

## One immutable correlation per purchase

`bind` creates a permanent installation/project/buyer/customer mapping. The
server issues the opaque provider identity; the installation UUID is routing
input, not device attestation. Account changes do not switch this SDK identity.
The dedicated v2 app, native profile and storage namespace differ from v1.
The generated identity candidate is retained privately before admission. A
candidate matching qualification exclusions stays blocked on same-request and
new-request retries; there is no regeneration or reset API.

`allocate` requires an actual core intent, exact authenticated original session,
the eight immutable quote fields, current seller eligibility and buyer authority.
One reservation serializes allocations for that customer. Each allocation owns
a never-reused Offering lookup key and provider registration; another intent with
the same SKU or price is never a receipt-correlation fallback.

The privileged worker consumes an exact, one-use operation ticket before any
provider HTTP request. It creates the real Offering/package/attachment, records
encrypted exact response bytes, and performs independent Offering, package,
attachment and product readbacks before registration. A lost or ambiguous POST
is reconciled with bounded reads; it is never resent. Missing, multiple,
conflicting or incomplete provider facts keep the plan unavailable or held.
The command Edge may wake this worker after a committed allocation or read;
the durable plan survives a lost wake-up. No client supplies provider operations,
URLs, credentials, registration facts or a verified flag.

The native module retains the actual SDK Package, checks its exact registration,
product and quote, and purchases that same object after fresh `claim`. This
avoids the React Native bridge's later package lookup. The claim writes the
existing core dispatch ledger atomically, so core checkout abandonment cannot
label it undispatched. Its authority lease is at most five seconds; it is not a
claim that eligibility remains current throughout provider settlement.

Only the dedicated authenticated exact-byte webhook can project a receipt. Its
trusted connection supplies the project; the source event must contain the
qualified app/store/environment, stable customer, exact registered Offering,
SKU, original/transaction, amount, currency, quantity and purchase window.
`presented_offering_id` may be absent in actual provider events: missing initial
correlation is held, never guessed from the latest intent or SDK callback.
The provider's actual field representation must be qualified before registration
is enabled. Generic service-normalized receipt JSON cannot invoke this bridge.

Duplicate raw events retain delivery history. Event-content conflicts,
contradictory original/Offering owners, unsupported lifecycle evidence and
transfers create append-only vetoes inside the dedicated Test Store namespace.
Ambiguous identities can make that dedicated project unavailable; they never
create legacy Apple/Play holds or fabricate a null-user owner. Valid, exact
terminal evidence may stay scoped to its immutable original. A known negative
before ownership admission is replayed when that original becomes known.

## Recovery and repeated purchases

`report` stores an untrusted SDK outcome only. `read` returns current holds,
immutable receipt history and the current reservation; it issues no SDK permit.
Neither a receipt nor a cancellation callback proves that all SDK background
work has stopped. The native owner records completion of the particular call
before another invocation can be prepared. The stable identity and distinct
Offering keep delayed posting attached to its original attempt.

`advance` is a separate explicit action. It compares the exact old allocation,
dispatch and reservation revision, waits for the old authority lease to expire,
and requires either the exact retained receipt or acknowledgment that the old
economic outcome remains unknown. Holds prevent advance. Replaying advance
cannot release a newer allocation. Release never asserts cancellation, no
charge, native quiescence or a right to retry the old purchase. A new purchase
uses a new core intent and Offering; old pending outcomes remain visible.

Generation retirement blocks new initiation but preserves authenticated raw
history intake and current-session read recovery. Historical tips grant no
access, Premium, payable earnings, payout or cashout. Existing source-derived
Apple/Play Premium authority continues to determine seller eligibility; buyers
can remain free.

## Record-only provider qualification

The separate `isolated-test-store-qualification-v1` receiver can preserve
authenticated provider delivery before economic behavior has been qualified.
Its connection binds the configured project, app, authentication-key version
and encryption-key identity. It installs disabled, with no connection or
capacity. The private operator transition permits only disabled to capturing
to sealed; sealing closes intake and binds an immutable evidence digest. It
does not assert behavioral qualification or enable provisioning or checkout.

Capture stores exact encrypted raw bytes and an ASCII encoding of the original
observation used by authenticated encryption. A sanitized observation retains
each representable identity; malformed Unicode remains invalid and unresolved.
Review decryption reconstructs the original observation without normalization.
Raw bytes, event IDs, original and transaction IDs, and every known customer
identity remain excluded from economic replay. Exact historical bytes cannot
create a receipt. Fresh negative or transfer evidence touching a current v2
owner still creates a veto, even when it mentions qualification history.

Unknown lineage, conflicting events or malformed evidence can be captured and
sealed but block economic promotion of that dedicated project. No generic
clearance or behavioral-qualification API is provided. The separate qualification
DEBUG app uses its own fixed `scq_teststore_` identity and grants no commerce
rights. Actual observations and their review remain required; local fixtures
cannot supply the missing provider-qualification hashes.

## Facts required before activation

The v2 economic receiver uses a separate lossless storage wrapper: original
observation bytes remain bound to the encrypted raw body, and a JSONB-safe
summary retains representable identities while marking malformed Unicode
invalid. A discarded unknown identity also fences the dedicated project,
including customers absent from the retained fields. Such evidence cannot
classify positive. Actual local PostgreSQL tests
cover durable holds on current owners, quarantined historical receipts, no new
receipt/grant, forged-summary refusal and exact decrypt round-trips. These
synthetic checks do not qualify actual provider delivery.

`TEST` never creates economic authority. Only a closed, non-economic payload
with one exact customer identity can be ignored; contradictory identities,
transfer context, unknown fields or any economic field remain durable hold
evidence. This is deliberately narrower than RevenueCat's [documented Dashboard
test payload](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields),
which can include subscription lifecycle fields. Such ordinary
Dashboard tests can therefore hold the dedicated economic project or its known
owners. Capture and review provider tests through the record-only receiver;
this conservative exemption is not a claim about the actual Dashboard shape.

Provisioning validates every JSON string and key before creating JSONB facts.
NUL or unpaired surrogate values produce a representable invalid observation;
the encrypted response retains the exact original bytes and authenticated
metadata. Invalid Offering inventories hold both the plan and its dedicated
project because an unreadable entry may conceal another retained owner. Invalid
individual resource responses hold their plan. Neither path assumes an empty
inventory, registers a product, or clears prior evidence. Command transaction
hints with unrepresentable Unicode reject before authority work, and a stalled
command body is cancelled at the real five-second request deadline.

The dedicated RevenueCat project must contain only its intended Test Store app
and catalog, use a new webhook connection and secret, and have independently
observed ownership, event-delivery, lifecycle, refund and provisioning evidence.
No existing provider project is inferred safe from SKU filtering. A v2 project
cannot also be registered as a v1 project. Source installs no credential, SDK key,
qualified row or enabled control.

The operator must verify the actual API v2 resource representation and complete
pagination behavior, exact immutable SKU/price and Package contents, the
webhook Offering representation, native retained-Package behavior, persisted
posting context, restart/reinstall and account-switch behavior, and late,
duplicate, transfer and reversal delivery. A receipt fixture or native compile
does not substitute for these observations. RevenueCat owner access is already
authorized; a safe configured receiver and qualified integration are still
required before routing real events.

Capacity and rate controls default to zero. Source permits at most 32 retained
plans and a bounded credential/project request budget; these are application
limits, not RevenueCat throughput promises. All provider mappings are retained.
There is no automatic archival, identifier reuse or unlimited catalog-growth
claim. Exhaustion stops new allocation until a separately reviewed retention
strategy exists. The same-buyer installation restriction and unresolved cache
loss are explicit product limits.

The target still needs exact new-object absence, managed owner/role/Auth/RLS,
PostgreSQL 17 transaction-timeout, shared read-fence availability, actual Edge
authentication and physical app delivery qualification. No denied production
metadata operation is part of this source workflow, and source approval does
not authorize a maintenance window or deployment.
