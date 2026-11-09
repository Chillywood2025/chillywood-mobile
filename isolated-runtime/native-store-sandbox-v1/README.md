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

## Exact local command endpoint runtime

The normal command endpoint has its own `deno.json`, remapping the shared
`npm:@supabase/supabase-js@2` import to official `2.110.6`. Other endpoints and
mobile dependencies are unchanged. Its genuine Deno v5 lock pins all nine npm
packages by SHA-512 integrity. The source profile includes the configuration and
lock bytes and explicitly supplies `import_map_path`; unrecognized external
imports, missing locks and floating configuration fail closed.

Prepare the isolated official Linux x64 Deno tool (no lifecycle scripts), resolve
only the committed frozen endpoint dependencies, then test the exact prepared
bundle in a new temporary directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix isolated-runtime/native-store-edge-tool
export DENO_DIR=/tmp/native-store-edge-deno-cache
native_deno="$PWD/isolated-runtime/native-store-edge-tool/node_modules/@deno/linux-x64-glibc/deno"
"$native_deno" cache --config supabase/functions/native-store-sandbox-command-v1/deno.json --frozen supabase/functions/native-store-sandbox-command-v1/index.ts
node isolated-runtime/native-store-sandbox-v1/edge-runtime.mjs --deno "$native_deno"
```

The runner requires exact Deno 2.9.6, removes inherited application environment,
uses cached-only dependencies, and permits networking only to `127.0.0.1`.
Eight actual-entrypoint/real-SDK tests verify caller bearer + anon-key verification,
exact session readback, service credentials only on subsequent RPC, body injection
rejection, failed auth/session mismatch, reservation-envelope adaptation, forged
results and a genuine command-RPC TCP disconnect with no automatic retry. HTTP
Auth/RPC responses are synthetic loopback fixtures, not a hosted Supabase project
or actual PostgreSQL. Existing native database proofs remain separate.

Only the successful local runner emits `localRuntimeQualified:true` for its exact
source/lock digests. Static source preparation still reports runtime qualification
false. Hosted gateway behavior, deployment/readback and hosted lock enforcement
remain unqualified; provider qualification and dispatch stay false. In particular,
Deno 2.9.6 local success is not a claim that Supabase's hosted runtime is identical.

Official guidance checked November 9, 2026:
- https://supabase.com/docs/guides/functions/dependencies recommends isolated
  per-function `deno.json` for deployment; legacy import maps need explicit paths.
- https://supabase.com/docs/guides/security/npm-security recommends exact Edge
  pins and committed integrity locks.
- https://supabase.com/changelog.md identifies CLI v3 local-default target changes
  and the November 10 legacy TLS-cipher removal. No CLI deployment, target query,
  security-setting change or TLS bypass is part of this proof.

Mandatory Required Validation uses this endpoint-specific tool/config/lock rather
than changing the versions or floating dependency behavior of unrelated jobs.
