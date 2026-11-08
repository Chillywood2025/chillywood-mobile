# Normal-app native-store quote preparation

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
