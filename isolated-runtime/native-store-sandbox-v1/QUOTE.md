# Normal-app native-store quote preparation

## Dormant consumption evidence

`dispatch-attempt.sql` adds an owner-private, append-only attempt per reservation.
It has no public RPC or grants to application/service roles. First consumption
rechecks current account, creator, complete quote/media/catalog and default-off
preparation control within the original transaction budget. The same request
returns `newlyConsumed:false` after commit; concurrent same-request calls fail
without waiting. Recovery never inserts or reissues an attempt. Every response
retains `dispatchAllowed:false` and `providerQualified:false`: consumption is
not a usable SDK permit, platform qualification, or evidence that purchase ran.

Crash after commit, lost response, SDK errors and cancellation cannot release
this record for another purchase. Transaction rollback/expiry before commit
does not consume it. A future qualified dispatcher must observe commit before
considering any result; no such dispatcher or qualification gate exists here.
The 48-module source install requires an empty attempt table at commit.

`quote.native.mjs --managed-install --dispatch-proof` exercises actual private
SQL, repeated and concurrent consumers, expiry rollback, current-media checks,
and real client retention of the exact returned attempt after account retirement.
The 19-case consumption proof now composes the actual shared RevenueCat purchase
wrapper with the actual client retainer and PostgreSQL. Only the physical SDK is
replaced by a test-only deferred boundary. Account retirement retains original
evidence before the wrapper rejects success; interruption before callback leaves
no claim and cannot reissue consumption. Forged authority flags and substituted
reservation IDs cannot create a retainer. No production dispatcher is introduced.
The original account can later resend only its retained unqualified transaction
assertion through the existing Edge/SQL path. Locally retained attempt fields
are not authenticated server attestation and do not expand the claim payload.

`quote.sql` is source-only, initially preparation-disabled, installed after the
current paid-video source and before permissions finalization in a disposable
test database. No deployment or provider provisioning follows from this file.

The normal mobile endpoint `native-store-sandbox-command-v1` authenticates the
existing Supabase account/session and calls the service-only command RPC. It
uses existing resources, offers, immutable versions, clean media, current account,
creator, legal and session authority. It does not create a duplicate media store
or relax Test Store guards. The historically named V3 media helper checks only
the shared upload/asset/route authority and is reused unchanged.

Immutable native catalog rows bind the existing offer revision to one exact
native store product and resource/asset quote. They require separately reviewed
server provisioning; no user/service generic writer is exposed. Retirements are
append-only. Zero or multiple active matching bindings are held, never guessed.
Catalog identifiers are exact, control-free and bounded to 512 UTF-8 bytes.
`quoteDigest` is an opaque server fingerprint of the entire quote's PostgreSQL
JSONB representation, not a provider signature or the separate TS catalog hash.

`offer` reads the quote. `prepare` persists a selection keyed by buyer/request
with exact originating session and payload, under a per-buyer lock and bounded
daily quota. It checks current quote/media/creator authority before insertion.
Same exact request recovers its retained selection; changed payload/session is
rejected. `recover` permits the same account's current valid session to read the
original immutable selection after uncertain writes, even if media was later
withdrawn or preparation disabled. Historical evidence is never permission to
purchase or view media. Request recovery does not initiate a second attempt.

Every response keeps `dispatchAllowed:false` and `correlation:unsupported`.
No SDK call, payment intent, provider receipt or access grant is created. The
ordinary app must continue displaying that purchases are not enabled until
real store correlation and settlement are implemented and qualified.

Native regression: `node isolated-runtime/native-store-sandbox-v1/quote.native.mjs
--local-bin /absolute/path/to/postgresql-17.6/bin`. It loads the actual source
SQL plus explicitly synthetic Auth/provider/media facts and exercises real
account/session/media checks, HTTP result validation, preparation, recovery,
catalog rejection, ACLs, concurrent requests and zero grant/intent creation.
It is not installed-device or actual provider-purchase proof.

## Explicit transaction assertions (source-only)

Install `claim.sql` after `quote.sql`, before permissions finalization. The same
authenticated command endpoint accepts `claim` with `{selectionId,
transactionIdentifier,productIdentifier}` and `claim-recover` with `{selectionId}`.
`data.claim` retains an immutable client assertion, never a receipt or allocation.
An exact retry must retain its request ID and payload. A
different current session of the same account can submit a historical selection's
previously unrecorded assertion or recover an existing one after logout/crash.
The claim's `originalSessionGeneration` identifies its original SUBMITTING session;
the selection retains its own originating session independently. An exact
same-account resend from a new valid session returns the first committed
assertion unchanged, or inserts it using the current session if the old request
never committed. It never replaces the assertion or invokes a purchase. Other accounts
cannot submit/read it, and historical capture does not reauthorize withdrawn media.

Assertions are unique per selection, not globally per transaction. Unverified
identifiers must not reserve purchases: an attacker could otherwise squat another
buyer's transaction. A future qualified settlement must atomically enforce unique
scoped transaction allocation. Nothing in this increment implements settlement.

The service-only `native_store_sandbox_claim_read_v1` joins the exact claim to its
original buyer, selection session and quote. Its private result is not a client
response. The worker-private reconciler invokes original-revision decryption and
reparse, compares exact project/app/store/environment/buyer/product/transaction,
and reports only an unqualified one-time candidate or mismatches. Aliases do not
prove ownership. Cancellation/expiration evidence and productless transfers retain
project-level reconciliation signals, never implied resource correlation. Revoked
original revisions remain readable with a warning. No monetary, lifecycle-finality,
or SDK-to-webhook identifier equivalence is established by string comparison.

All dispatch, settlement, grant and financial authority remain false. There is no
claim submission UI or new SDK invocation. Real installed SDK callback/webhook
pairs for each store, interruption recovery and refund linkage remain required.
The source harness includes actual DB claim rows through HTTP result validation,
session recovery, ACLs, conflicts, squatting, concurrency and real encrypted
synthetic receipt comparison. Synthetic cases are not provider qualification.

### Device-local pre-dispatch reservation

The normal client has a dormant `retainPurchaseAttempt(selectionId)` boundary.
It persists the exact confirmed selection and quote before any future SDK call,
and fences the buyer/project/app/store/environment/SKU across different offers
in this app process and retained device storage. `captureCallback` requires that
same reservation. Restart and same-account session recovery read it without
clearing it or initiating another purchase. A missing callback does not authorize
replacement. The state `dispatch_reserved` does not mean the SDK ran, a test
account was verified, or a transaction succeeded.

Both reservation and recovery return `dispatchAllowed: false` and
`providerQualified: false`. There is no reservation button or SDK dispatcher.
AsyncStorage is not server admission or a cross-device/independent-runtime lock;
storage loss also loses this local protection. Actual purchase activation still
requires qualified no-charge admission, server-side shared-SKU exclusion and
receipt reconciliation. The local reservation alone cannot qualify that workflow.

### Server reservation source proof (not hosted deployed)

`reservation.sql` is included in the pinned 48-module managed install closure.
Its service-only RPC is routed through the existing authenticated command endpoint
and dormant mobile client, without SDK activation. The local proof reserves an exact existing selection
under a database uniqueness constraint for buyer/project/app/store/environment/SKU.
Another buyer can reserve the same SKU; no unverified transaction ID is reserved.
No expiry, clear, delete, replacement purchase, receipt grant or dispatch admission
is supplied. `dispatch_reserved` means only a retained reservation, not that the
SDK ran or the store account is verified no-charge.

New reservations revalidate the full server quote, current buyer/creator session,
media/scan/route and catalog authority. Exact request recovery crosses valid
same-account sessions and preserves the first submitting session even after media
withdrawal. The private already-armed quote helper composes these checks under
the original five-second transaction budget; public commands still arm once.
The helper is not executable by anonymous, authenticated or service roles.

Run `quote.native.mjs --local-bin /absolute/postgresql-17.6/bin --managed-install
--reservation-proof` for the local proof. The reservation module is now included in the complete
48-module managed source closure, installed in the disposable database under its
bounded NOSUPERUSER installer CREATE interval.
Twenty-two reservation cases and the thirty-three quote/claim/reservation integration cases passed,
including real HTTP-handler-to-SQL execution, shared-SKU contention with controlled
commit, session replay, stale catalog/media rejection, immutable/RLS boundaries,
and actual server timeout termination with full reservation rollback. Two handler
unit tests additionally verify immutable actor/request snapshots and hostile result
rejection. These are source proofs, not hosted installation or provider/device
qualification. Source/catalog/atomic pins require independent validation before
any deployment claim.


### Combined normal-app reservation route

The existing authenticated `native-store-sandbox-command-v1` endpoint now accepts
`reserve` and `reserve-recover`, each with only `selectionId`. It routes to the
service-only reservation RPC and strictly adapts its envelope to the existing
command protocol. Old command envelopes are unchanged. Reservation objects retain
`dispatchAllowed: false` and `providerQualified: false`; correlation remains
unsupported. There is no second deployed endpoint and no SDK invocation.

The dormant client `retainPurchaseAttempt` now durably retains its original request
before submitting this authenticated server reservation. `recoverPurchaseAttempt`
reads it after restart/session change; `retrySavedPurchaseReservation` resends only
that exact retained request and selection, never a store purchase. Local reads expose
`serverReservationConfirmed: false` until the current client receives a verified
server response. Callback capture requires that exact confirmed reservation.
No new UI action is exposed. A lost/late local write or uncertain server outcome
never clears or replaces the retained attempt. Device storage loss is not solved
by this client API, but cannot bypass the server's cross-selection SKU constraint.

Wiring proof: 30 actual client/mounted tests and 8 shared-command tests pass;
the complete managed installation's real client-to-Edge-to-PostgreSQL path passes
33 cases plus 22 server-reservation cases. Independent scenarios use fresh valid
catalog SKUs instead of deleting reservation records or bypassing constraints.
The two additional real transport-interruption cases cover reservation absent
before submission and committed with response lost. A fresh client module after
restart retains the exact request/selection, recovers in a renewed same-account
session, and preserves the first server insertion session. Callback submission
remains blocked until server reservation confirmation; no claim or SDK is sent.
These tests do not establish provider qualification, deployed readiness, or a
successful no-charge store purchase.
