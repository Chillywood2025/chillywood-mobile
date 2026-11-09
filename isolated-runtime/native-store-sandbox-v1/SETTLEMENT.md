# Native settlement development boundary

`native-store-sandbox-money-v1.ts` is private historical evidence, not a
settlement handler or provider qualification. It decrypts the original stored
receipt with the original immutable connection revision, uses the existing
claim/replay matcher, and parses exact raw numeric lexemes. It never substitutes
quote prices, converted USD `price`, client SDK prices or aliases for purchased
currency economics or ownership. Original Test Store v3 admission/access code is
unchanged. Output is private, nonpayable and cannot allocate a transaction.

The strict candidate shape currently requires explicit numeric single quantity,
USD purchased currency, positive exact cents, exact purchase/event milliseconds,
purchase no later than event and event no later than server observation, explicit null expiration and no cancellation
reason. Missing fields are unsupported, not inferred. Whether Apple/Google
actually supply that shape is still unobserved. Passing synthetic encrypted
fixtures is not external provider evidence. Purchase time versus original
selection/dispatch and full lifecycle remains future qualification.

## Remaining settlement contract

The intended backend is trusted authenticated service code: SQL must re-read
immutable journal/claim/catalog/qualification rows rather than accept client
`verified` flags. SQL is not claimed to independently authenticate provider TLS
or decrypt AES. No extra signing system is required merely to restate this
existing backend trust assumption.

An operator-owned immutable protocol qualification must bind original connection
revision, app/store/project, actual installed SDK/build identity and real observed
callback/webhook mapping plus lifecycle evidence. Its absence defaults off. No
client or generic mutable service qualification writer should be introduced.
Actual provider evidence is still required before that record can be installed.

An exact qualified allocation must be unique by native scope/transaction and by
selection, and bind the authenticated journal parent/hash/revision, explicit
client assertion, immutable quote and qualification revision. Claims alone must
never reserve transactions. Core resource settlement can be reused only after
those facts are checked and native receipt/grant links are installed atomically.
All financial projections remain not payable.

Negative-event safety must precede that grant path. Generic core delivery checks
already honor `resource_delivery_holds`; a separate native access check alone
would not protect all existing generic consumers. Journal intake and settlement
must share a bounded per-project concurrency fence, atomically hold existing
native-linked grants when new unprocessed/conflicting/negative evidence arrives,
and block new allocations while such evidence remains unresolved. Raw evidence
must remain replayable across connection revocation. No queue-only delayed hold,
newest-pending lookup, timeout-based hold reset or automatic negative clearance
is acceptable. The dormant worker, exact candidate read, atomic effects and private
access path are now source-implemented and exercised with authenticated synthetic
receipts on disposable managed PostgreSQL. No real provider mapping is qualified.

## Pending receipt fence

`pending-fence.sql` is included in the fixed forty-seven-module default-off closure.
The mandatory local `--managed-install --pending-fence-proof` quote harness mode
requires that the managed non-superuser install itself created the tables and
trigger. It never fixture-installs missing objects. The fixed source, added
catalog/ACL and semantic atomic artifact are regenerated together and validated
by ordinary and shifted-OID actual atomic installation proofs. No target
installation or provider setup occurred.

Two immutable, owner-only tables hold exact native core-receipt links and pending
raw-parent IDs/hashes. A new raw journal row atomically acquires the bounded
READ COMMITTED project advisory lock, records pending evidence and inserts core
resource-delivery holds for only linked native receipt IDs. It never creates a
NULL buyer-wide hold or touches unrelated Test Store grants. The native link
insertion trigger takes the same lock and refuses pending projects. Existing
core delivery's SHARE hold-table lock conflicts with intake's NOWAIT ROW
EXCLUSIVE lock, preventing acknowledgement across a conflicting delivery commit.

Every event starts pending, including a seemingly positive purchase. Duplicate
raw delivery does not create a new pending row/hold. Malformed, conflicting and
negative events are retained and cannot be silently classified away. There is
no clearing function, service-level link writer, qualification switch or grant
activation. The authenticated Edge service remains trusted for byte intake;
SQL does not claim independent cryptographic authentication. The component
requires fresh disabled journal installation, so old untracked raw rows cannot
silently escape its trigger.

Local regression coverage includes actual generic delivery before/after intake,
unrelated same-buyer Test Store grant preservation, scope mismatch, duplicate
idempotency, future-link blocking, owner-only ACLs, immutable rows, journal
rollback, real transaction timeout rollback, READ COMMITTED enforcement,
controlled project/delivery lock races, committed-link then intake fencing and
persisted malformed-envelope replay. This fence is a necessary prerequisite,
not a working purchase projector or a complete revocation/hold-release policy.

## Dormant qualified dispatch

`qualified-dispatch.sql` extends the fixed 47-module closure with immutable
operator-owned qualification evidence, append-only revocations and original
attempt-to-qualification links. All three tables must be empty at installation
commit. There is no client/service qualification writer and no real provider
proof is seeded. Synthetic local fixture evidence does not qualify deployment.

The authenticated Edge dispatch RPC re-reads exact reservation/selection/quote,
active original connection and one unrevoked matching qualification under the
same bounded transaction. Qualification and revocation table locks prevent
configuration phantoms. The original consume API still arms exactly once; its
private already-armed helper revalidates buyer, creator, media/scan/incarnation,
current quote and control conditions without resetting the deadline.

Only the first newly consumed qualified transaction returns top-level dispatch
permission. Recovery and repeated requests return no permission, including a lost
response or crash before SDK invocation. Previously consumed unqualified attempts
cannot be upgraded. Nested attempt evidence remains authority-false. Pending raw
project evidence blocks fresh consumption. Qualification build/SDK evidence is
operator-owned protocol history, not a remote attestation of the caller's phone.
The client must separately match verified local Sandbox AppTransaction and explicit expected raw signed app version, independently of the unsigned native build/marketing version, plus the installed JS SDK before its existing SDK owner is
invoked. Android remains held: a configured Play license-scope string does not
prove the current device billing account is a licensed no-charge tester.

This source checkpoint does not invoke the SDK, configure a provider or enable a
worker. It now includes append-only processing completion, terminal shared-SKU
slot release and atomic receipt/allocation/link/grant projection, all default-off. A negative event's
processing completion must never restore its revoked receipt; a processed refund
also must not permanently block unrelated future project purchases. Unknown,
malformed or conflicting evidence remains unresolved until explicitly proven.

Read-only `dispatch-qualification` takes only a server-stored selection ID. It
checks current quote/media/control and the same private resolver as consume,
returning no dispatch permission and making no reservation/attempt writes. This
prevents absent qualification from stranding a permanent SKU reservation merely
because the normal screen opened. Consume still revalidates after the explicit
user action; discovery is neither a capability token nor durable permission.

The generic core grant reader now applies the native current-allocation predicate
only to native-store receipts. Unlinked or manually seeded native grants are denied;
existing Test Store branches are unchanged. The legacy fence fixture proves this
negative case. The separate effects fixture proves a genuine atomic allocation,
including its original receipt/effect/claim/attempt links and current private access.


The mandatory qualified-dispatch harness also runs seven real-client integration cases
before the project-wide pending-evidence test. The existing purchase-owner wrapper is
real, but its native SDK is a synthetic test double; no physical store call occurs.
These cases prove actual Edge/SQL discovery, reservation, first consumption, original
callback retention and claim insertion, including cross-session transport uncertainty.
The combined local result is 34 qualified-dispatch cases plus 33 normal-command cases.
No test qualification row or synthetic evidence is carried into the default-off install.

Signed `AppTransaction.appVersion` is stored as its own required opaque
`signed_app_version` qualification field. It is compared only with the raw
verified native signed value, never inferred from `CFBundleVersion` or
`CFBundleShortVersionString`. Local fixtures deliberately use three different
values (signed `100.7`, build `101`, marketing `1.0.0`); none are real observations.
## Private effect orchestration source

`native-store-effect-worker-v1.ts` accepts only a trusted service work item of
immutable raw receipt, optional claim and settlement-protocol IDs. It reads the
effect context and original journal registry, resolves the original key only,
replays exact bytes, and submits one exact economic or refund projection to the
effect RPC. Missing, conflicting or mismatched evidence never calls the writer.
Refund parsing retains historical negative evidence when intake is off or the
original revision is revoked; SQL remains responsible for current qualification
and permanent negative effects. No original secret or provider body is returned.

The worker uses a bounded monotonic deadline. An uncertain write is never
automatically retried. A successful result identifies only the native consumer;
the top-level shared-webhook acknowledgement remains false. This is not yet an
enabled HTTP endpoint, scheduler or hosted worker. The private candidate router
is now source-implemented. Separate integration cases use genuinely authenticated
synthetic receipts with actual managed PostgreSQL candidate/context/effect RPCs,
not mocked SQL success. None of that qualifies real provider observations.

## Integrated dormant effects and access

The trusted service worker resolves a unique exact candidate from persisted raw
identity. It never chooses newest pending, accepts client qualification, or reserves
transactions from assertions. Original bytes and registry are replayed before the
service-only effect RPC. SQL trusts that authenticated backend boundary, not a
fictional database cryptographic attestation. One project lock orders journal
pending evidence, receipt-specific holds, completion and allocation. A positive
transaction atomically creates core intent/receipt, unique allocation, effect,
link, protected core grant and terminal disposition. Any late failure rolls back
all of them. Historical session expiry does not discard authenticated evidence;
current private access always checks the active buyer session and eligibility.

Qualified refunds retain immutable transaction/chain tombstones, permanent exact
receipt holds and grant revocation. Completion resolves only that raw row's pending
holds. Refund-before-purchase produces a terminal tombstoned allocation attempt,
never a grant; unrelated later transactions can proceed. Unknown, conflicting,
malformed and productless transfer evidence remains pending. A consumed uncertain
attempt cannot be canceled or timed out into a new purchase. No real mapping or
lifecycle evidence is seeded. Native-consumer completion never acknowledges an
entire shared provider webhook. Actual provider observation, hosted deployment,
private media/scanner operations and routing activation remain separate requirements.

## Automatic inline processing, still default off

The authenticated ingress now optionally enters the same private candidate/replay/
effect worker immediately after confirmed durable journal persistence. The server
must explicitly enable native reconciliation; no client flag or supplied work ID
can enable it. Confirmed duplicates may re-enter idempotent processing. Conflicts
and uncertain persistence never invoke effects. Intake and processing share one
bounded deadline; an uncertain effect response is not retried inside the request.
Provider redelivery can recover the immutable identity without a manual service
call. The separately authenticated reconciliation endpoint remains a recovery path.

Ingress still returns HTTP 503 with acknowledgement false even when this native
consumer completed. It does not assert that every other shared-webhook consumer
has durably processed the delivery. Enabling this source is not a provider routing
or acknowledgement decision. All runtime flags and real qualification records
remain absent/off until separately qualified and deployed.
