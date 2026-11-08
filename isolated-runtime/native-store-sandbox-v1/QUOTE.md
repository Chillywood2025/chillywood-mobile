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
