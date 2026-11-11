# R2 bounded forward source, inactive

This package prepares fixed SQL and local proof. It has no target executor,
provider API, credential input, activation switch or retry authority.

## Strict staged predecessor

Studio is not yet installed on the target merely because this source exists.
The authorized sequence is the reviewed bounded Studio forward packet, its
independent exact receipt/private readback, then a **fresh** observation and this
R2 packet followed by independent exact receipt/private readback. All runtime
and SQL activation stays held throughout. Both packages share one reviewed
source head; no combined orchestrator or enlarged transaction is needed.

Original48, shared exclusion and Play installers are never replayed. This packet
requires their exact receipts plus Studio receipt 20261110060000. Its source
predecessor is reviewed commit 39378202a8e677dd3c01eb71a96ab9ceb5525de3, tree
f39edb815fa4ffeb53eff32ba85f67415fb074db. Those identify source, not a target
baseline. Final preparation separately verifies the actual clean committed Git
closure, complete source bytes, generated R2 SQL and exact qualified catalog delta.

Supabase CLI 3.1.0 generated the fixed local migration identity
20261110120025_native_paid_video_r2_bounded_v1. The verified command/version,
binary SHA256 and package integrity are retained in deployment-identity.json.
The generated deployment.sql deliberately stays outside automatic migrations.

## Exact transaction and state boundary

The envelope accepts only a genuine supabase_read_only_user read-only repeatable
read observation captured within five minutes. Transport must independently
bind the authorized project. Inside one transaction it rechecks the physical
database/server-start identity, complete catalog and OID hashes, roles, history,
money controls, exact predecessor objects and receipt identities.

All predecessor core/Studio/Play tables are empty and checked controls disabled.
The original private journal stays behind its existing fixed reader: retain its
fresh empty/disabled readback separately and coordinate administrative DDL and
activation quiescence. This source introduces no journal-owner membership or
raw journal grant. It does not migrate populated resources or erase history.

Only the fixed forward source and six new private tables are added. Existing
function OIDs remain intact. The explicitly replaced immutable-upload trigger
has one exact OID exception; unchanged columns, constraints, functions, roles,
policies and all unrelated OIDs remain protected. The Play effect dispatcher,
current-allocation dispatcher and mapping selector remain byte-identical.
Typed R2 identities never fabricate S3 VersionId. Mixed/fake historical R2
identities cause rejection, never silent backfill.

The managed nonsuper installer has temporary core-owner SET/INHERIT and public
CREATE rights for owned public-wrapper ACL statements. Those are restored before
every final check. New gateway/scanner roles are NOLOGIN/NOINHERIT/NOBYPASSRLS;
no runtime credential or authenticator membership is installed. PostgreSQL's
creator admin memberships, if present, must have no SET/INHERIT authority and
are exact catalog additions. No existing membership is weakened or expanded.
Only the two exact R2-to-postgres creator memberships with ADMIN true and
SET/INHERIT false normalize the grantor's installation-local name to
`{"bootstrapSuperuserOid":10}`. This typed JSON token cannot collide with an
actual role-name string. The grantor must actually be OID 10 and a superuser.
Row hashes, allowlist keys and OID keys use the same predicate; every different
role, member, grantor or option retains its actual identity and is rejected.
This fixes a local fixture-name leak without granting or changing membership.
The separate local-fixture SQL guard still requires loopback, its marker token
and OID 10 named `fixture_admin`; portable catalog normalization does not relax it.

Run the renamed-bootstrap regression locally with:
`node isolated-runtime/native-paid-video-r2-v1/bootstrap-membership.native-cases.mjs --local-bin /absolute/path/to/postgresql-17.6/bin`.
It uses a disposable full legacy+Studio fixture, not a hosted target. The source
correction changes R2 catalog/artifact/receipt hashes and requires new reviewed
source closure bindings before any separately authorized deployment. It does
not reinterpret or reinstall the existing Studio receipt, reset consumed
attempt records, or authorize another R2 attempt.
Only two owner-issued non-grantable public-schema USAGE entries are added for
the new roles. A contextual catalog split retains the actual schema owner and
every prior ACL entry unchanged, representing those two privileges as separate
fixed facts. Wrong grantors, grant options, CREATE or unrelated ACL changes
remain visible and reject. No PUBLIC privilege is added and no hosted schema
ACL is copied or inferred from a fixture. This supports existing locked-down
schemas as well as schemas that already provide PUBLIC USAGE.

Exactly one immutable receipt is inserted in the same transaction. Every prior
statement array, 12/14-digit version, created_by, idempotency_key and rollback
value is retained and rechecked afterward. Catalog capacity remains 60,000 rows,
OID capacity 35,000, history 2,500 receipts with 1,024 statements each and 20,000
aggregate statements. Sentinels reject overflow instead of accepting truncation.
The original 20-second statement, 25-second transaction and one-second lock
budgets are armed once, never extended or rearmed.

The previous install trigger is not treated as a later commit fence. This
envelope performs its own pre-source, post-source and post-receipt state/catalog
checks; any failure rolls back source, roles, privileges and receipt together.
Uncertain completion requires fresh read-only observations. Recovery can compare
a retained older pre-action observation, but never authorizes retry or activation.

## Fixed readback and qualification limits

native_paid_video_r2_private_state_v1 takes no arguments and grants EXECUTE only
to its owner and the existing read-only actor. It requires that genuine session,
read-only repeatable read and at most five-second budgets. No raw table grants
or persistent owner access are added.

It reports six empty-table booleans, enabled/lifecycle/role booleans, counts and
hashes of nonsecret immutable profile, route, worker and verifier definitions,
plus bounded role-membership metadata. Gateway and HMAC keys are excluded from
hashes and output. Profile bindings are checked against current route/provider,
active worker/verifier, key separation and V3 exclusion without invoking runtime
admission or changing state. No IDs, bucket names, qualification/capacity evidence,
tokens, receipts, user information or object identities are returned raw.

Profiles are bounded to one, route/worker/verifier inventories to 64 each and
runtime-role memberships to 32, before digest aggregation. Overflow returns
withinBounds false and null hashes; validation rejects it. Each definition uses
PostgreSQL JSONB text framing, SHA256 per row, sorted hexadecimal row hashes
under C collation, concatenated and SHA256 again. Mutable enabled/active flags
and all keys are excluded from immutable definition hashes.

This readback does not qualify provider capacity, actual keys/credentials, hosted
JWT issuance, object transport, real malware scanning, independent human review,
money, device binaries or live release. Those gates remain separate and held.

## Local proof

- node --test isolated-runtime/native-paid-video-r2-v1/deployment.test.mjs
- flock /workspace/shared/chillywood-heavy-test.lock node isolated-runtime/native-paid-video-r2-v1/deployment.native-cases.mjs --local-bin /absolute/postgresql-17.6/bin --full
- The core r2.native.mjs suite separately exercises actual typed upload, scanner,
  independent review, Apple and Play allocations, range authority and revocations
  with explicitly synthetic local external facts.

All fixtures are disposable loopback-only with Unix sockets disabled. The full
catalog uses 630 real source migrations plus original48/shared/Play/Studio and
the existing managed-extension doubles. Source qualification uses only this
local fixture; it never adopts a target baseline. deployment-qualify.mjs requires
the exact reviewed R2 source hash. Regenerate fixed artifacts deliberately with
deployment-envelope.mjs --write-artifact, then review and run exact-head validation.

The retained local proof passes three static tests and ten real PostgreSQL
groups at both small and full catalog scale. The full bounded transaction took
15,680 ms, preserving 634 prior receipts including the 619-statement receipt.
Its projected catalog changes from 47,446 to 47,698 items: 252 additions
(including the two explicit schema-privilege facts), 13 exact changes and no
removals. Negative cases cover stale state, lifecycle activation, late rollback,
all prior history metadata, wrong grantor, CREATE and grant-option drift, and
occupied/mismatched/overflowing private readback. deployment-proof.json records
the exact source-file manifest and local results. It is source-only evidence,
not target installation or activation approval.
