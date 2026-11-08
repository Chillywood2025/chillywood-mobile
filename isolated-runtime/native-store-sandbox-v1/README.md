# Native store sandbox journal v1

Source-only, default-off journal for the normal internal app's sandbox flow for
all intended users. The app is prelaunch; this does not assume an existing user
population or require a separate provider project or database. Live money stays
off. This package does not enable any existing dormant router.

Install the SQL only in one transaction in a disposable PostgreSQL test database
for qualification. It is not a production migration or deployment instruction.

`journal.sql` stores immutable connection revisions, encrypted raw parents,
events, conflicting byte variants, each delivery, and a held native-store
consumer disposition. Connection revisions bind the intake scope to the existing
envelope AAD's connection/project identity. Changes require a new revision;
append-only revocations and a default-off control fence future intake.

Only `service_role` can execute the narrow public journal RPC. User roles cannot
execute it or access private tables. Every table has FORCE RLS and an owner-only
policy, and evidence tables reject UPDATE, DELETE and TRUNCATE. A bounded
transaction uses nonwaiting raw/event locks; duplicates reuse the raw parent and
append delivery history. Conflicts remain permanent. Missing/malformed provider
event IDs use the raw hash as evidence identity, never a guessed customer.

The Edge-side persistence adapter validates the exact scope, raw hash and
no-authority result and performs no automatic retry after uncertain writes.
SQL storage does not independently authenticate/redecrypt ciphertext: future
workers must decrypt, reparse and verify scope before correlation. Original keys
must remain available to replay retained receipts across key revisions.

The service-only `native_store_sandbox_journal_read_v1` RPC returns an exact raw
parent joined to its original immutable registry revision and revocation status.
Historical reads remain available with intake off or the original revision
revoked. It returns private encrypted/observation metadata, never encryption keys
or purchase authority; the replay verifier still requires trusted original keys.

Acknowledgement remains false even after durable storage. This journal alone
cannot acknowledge a shared webhook until all required consumer dispositions are
implemented. It does not project grants, publish an HTTP endpoint, qualify
correlation, or replace the normal SDK identity owner. No separate RevenueCat
project is required by the source; concrete provider routing remains unmodified.

## Disposable native regression

`node isolated-runtime/native-store-sandbox-v1/journal.native.mjs --local-bin /absolute/path/to/postgresql-17.6/bin`

Nineteen cases exercise actual PostgreSQL, real authenticated/encrypted intake,
exact returned adapter results, lossless replay, duplicates, permanent conflicts,
malformed bytes, role/RLS restrictions, immutable registry/evidence, revocation,
revision rotation, concurrent delivery, actual transaction-expiry rollback,
control/revocation contention in both directions, historical raw-parent replay
after rotation/revocation, malformed retained evidence, and off-switch behavior. The required
native PostgreSQL CI job runs this harness using its already verified engine.
These are synthetic local tests, not store/provider or installed-device proof.
