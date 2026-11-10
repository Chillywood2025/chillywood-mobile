# Bounded forward source, inactive

This package is an offline assembler and local proof, never a database executor.
It installs no provider, key, worker, reviewer, profile, catalog template or media.
It does not enable authoring or purchases. Source merge is not install authority.

## Supported predecessor

The original immutable 48-module native source, shared-routing exclusion and
Play handoff/settlement source must already be installed. Their exact recorded
receipts are checked. The original48 bundle is never replayed in this payload.
Existing core and Play data must be empty, lifecycle and all checked gateway,
native quote and Test Store controls disabled. An occupied or active generation
is rejected, not migrated, cleared or silently accepted.

The source reference in deployment-source.json identifies the reviewed base
commit/tree, not a live database observation. Preparation requires a fresh
genuine supabase_read_only_user read-only repeatable-read observation and the
final clean committed Git source closure. No target baseline is shipped or
inferred from source. The assembler accepts no arbitrary SQL body, function name
or target executor. The project must
be independently bound by separately authorized transport. No fixture marker or
SQL comment can establish that identity or authorize a deployment.

Read deployment-observe.sql against the actual target only under authorized
read-only access. It returns complete catalog/history hashes and bounded receipt
metadata, not function definitions or private rows. Retain the existing original
and Play private readers' fresh disabled/empty results separately. The private
journal is not granted to postgres and its owner membership is never reopened.
Coordinate administrative DDL and retain exact before/after evidence. The public
builder rejects observations older than five minutes; SQL rechecks all catalog,
OID, history, role and money hashes inside the installation transaction.

## Exact forward assembly

1. Temporary, transaction-only core owner SET/INHERIT and public CREATE interval.
2. Unchanged operations.sql and monotonic-removal.sql together, adding five
   private tables and the narrow service worker/authenticated reviewer RPCs.
3. authoring.sql, adding four private authoring/template/provenance tables.
4. Revoke temporary CREATE and restore SET/INHERIT false. Explicitly prove the
   old broad worker and operator moderation grants are closed.
5. The fixed no-argument boolean/hash-only private reader, with its own closed owner
   interval and EXECUTE only for its owner and supabase_read_only_user.

The original grant/revoke modules are not reused: they are bound to the old
installation transaction. The temporary INHERIT right is necessary because
unchanged operations.sql resets to postgres before setting owned-wrapper ACLs.
It never survives the transaction. Every expected catalog addition and change
is exactly allowlisted; all five existing changed objects retain their OIDs.
The old installation trigger is not relied on: this envelope performs its own
complete checks before source, after source and after the single exact receipt.

The complete catalog limit is 60,000 rows with 35,000 OID rows and rejection
sentinels. OIDs remain decimal strings. History retains exact 12/14-digit versions,
all statement arrays and created_by/idempotency_key/rollback metadata, with 1,024
statements per receipt and 20,000 aggregate statements. Overflow rejects without
accepting a truncated inventory. No broader grants or arbitrary function-body
execution are used for observation. Original 20-second statement, 25-second
transaction and one-second lock bounds stay unchanged and are armed once.

An uncertain outcome requires new read-only observations and exact receipt
classification. The classifier never authorizes a retry, activation or deployment.
The post-install private reader reports occupied/enabled booleans and canonical
immutable profile/template definition hashes, enabled/retired template-view hash,
retirement metadata hash, operations binding hash and profile-to-gateway match.
No raw configurations, product names, IDs, keys, review evidence or publication
rows are returned. Definitions exclude mutable enabled flags; the availability
hash includes those flags and retirement presence. An operator can independently
compare exact approved metadata using PostgreSQL JSONB text framing: hash each
definition, sort the hexadecimal hashes with C collation, concatenate and hash
again. Operations hashes are SHA256 of binding::jsonb::text. The template-view
digest uses rows [definitionHash, enabled, retired], ordered by definitionHash.
The reader allows at most 64 templates/retirements, 4 KiB per retirement reason
and 16 KiB for the single operations binding. An overflow returns withinBounds
false and null hashes; validation rejects it instead of accepting truncation.
The reader cannot activate anything. Provider qualification, independent keys, actual media scans,
independent human moderation, app binaries and live release remain separate gates.

## Local verification

- node --test isolated-runtime/native-paid-video-authoring-v1/deployment.test.mjs
- node isolated-runtime/native-paid-video-authoring-v1/deployment.native-cases.mjs --local-bin /absolute/postgresql-17.6/bin
- Add --full for the complete 630-migration catalog and retained 619-statement
  legacy receipt; add --combined-runtime to the small fixture for actual combined
  operations/reviewer/native publication SQL and production HTTP handlers.

All PostgreSQL fixtures are disposable loopback-only with Unix sockets disabled.
The full fixture uses the existing managed-extension doubles. The small runtime
fixture uses synthetic Auth/storage/scanner facts and is not hosted qualification.
Source allowlist regeneration is deliberate via deployment-qualify.mjs; it uses
the full local predecessor fixture, never target discovery or automatic adoption.
After any source/allowlist change regenerate deployment.sql, deployment-observe.sql
and deployment-artifact.json with deployment-envelope.mjs --write-artifact and
rerun the focused and protected validation before publishing the candidate.
