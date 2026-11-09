# Observer589 database evidence derivation: OFFLINE ONLY

The earlier combined query is RETIRED as an executable default following connector
timeouts and a database interruption whose cause remains unproven. Its generator
module is retained only for audit/equivalence tests. The emitter now REQUIRES
`--offline` and emits the staged candidate, with explicit unqualified/no-authority
metadata on stderr. It never executes SQL. Target memory headroom remains unknown.

The staged candidate separates five query plans in one read-only repeatable-read
snapshot. Trusted DO blocks store only per-stage evidence in transaction-local
custom settings, initialized to empty sentinels and discarded by ROLLBACK. Exact
protocol/stage tags, booleans, digest shapes and runtime context are mandatory for
the final named envelope. No multi-session proof assembly is permitted.

Native17 benchmarks exercise ALL digest computations, including ~11MB of source
migration receipt text. Five stages pass proposed local node/cost/time budgets;
whole isolated peak RSS was 203912KB (~199MiB). This is NOT a target memory budget
or acceptance: 4MB work_mem does not cap aggregate-state or total process memory.
A tiny real connector probe verified read-only/repeatable-read/same-snapshot,
trusted DO/local markers, JIT-off and final-envelope retention through rollback.
It does not establish general heavy-query safety. The later explicitly authorized
one-shot559f444c proof succeeded; its immutable packet and source-bound audit are
committed under evidence/ and docs/audits/refund-observer-baseline-20261109.json.
That successful baseline evidence grants no future query or write authority.


This package emits a read-only evidence query. It neither connects to a database
nor changes the observer runner, deployment manifest, or qualification status.
Edge and deployment qualification remain false, even if every database proof passes.

From the repository root:

```
node scripts/google-refund-tax-observer-proof/generate.mjs --offline > /tmp/refund-proof.sql
node --test tests/google-refund-tax-observer-proof*.test.mjs
```

The emitter requires the exact source-lock inputs and exact reviewed output hash.
A source mismatch is a review requirement, not permission to refresh observed hashes.
The SQL uses a read-only UTC snapshot, pinned PG17.6 and qualified read-only role,
15-second statement timeout, 30-second idle guard, 2-second lock timeout,
4MB work_mem, no parallel workers, JIT disabled, and materialized proof stages to prevent repeated
expensive JSON/catalog/data evaluation. The retired combined-query audit test still proves its materialization-only change.
The staged emitter instead requires its own exact reviewed packet hash.

## Provenance, not live-hash adoption

* The committed 37-row native delta is from disposable source586/source589 captures.
  Its 34 additions and three replacements must match current post-delta bytes before
  inversion. Every other row remains unchanged. Both original affected and untouched
  frozen catalog anchors must then match. Temporary cutover bridges are rejected.
* The old catalog query and contract are unchanged source inputs. The new catalog
  hash is released only after complete old-projection authentication and explicit
  complementary type/collation/foreign-relation checks. Thirty-eight native source
  type mappings plus nine source-known Auth names are allowed; the latter must be
  noncollatable enums. Unknown types, domains masquerading as enums, nondefault
  column collations and foreign relations are rejected.
* Full existing data excluding only the source-added disabled cashout control must
  match the frozen original data anchor. That anchor was a historical observation,
  NOT deployment-ready qualification. The independently qualified seven-table data
  anchor, exact one-row disabled source seed, current holds, qualified read context,
  original583 history, exact six receipts, total589/max and social catalog are also
  mandatory. No private application records are included in this package.
* Expected catalog/data/history hashes are returned only when ALL five stages pass, jointly proving catalog, data and history.
  No baseline is promoted automatically. Fresh exact Edge caller/closure semantics,
  transport validation, authorization and transactional deployment/postcheck remain
  separate requirements.

## Reproduction

`prepare-native-capture.mjs /tmp/new-empty-output` reconstructs the exact two native
SQL packets from locked migration and fixture source, verifies their frozen packet
hashes before writing, and does not execute them. Run them only in a fresh disposable
UTF8 PostgreSQL17.6 single-user cluster, first586 then589, using the same official
pgcrypto build linked with libcrypto. Both sessions explicitly use UTC. The source
capture manifest, executed-packet hash record and official runtime artifact hashes
are retained. Runtime hashes document the local build, not a substitute for source
provenance or approval to execute elsewhere.

Decode each capture's base64 JSON output without parsing/reserializing its JSONB
item_text strings. `verify-native-captures.mjs before.json after.json` requires the
exact original capture hashes, server/labels, unique keys and exact37-row delta.
The large raw captures and native packets are intentionally not committed. A
reproduction differing in bytes fails closed and requires investigation/review;
it cannot silently replace frozen expectations.

The source lock includes original source inputs, not mutable production data. Its
historical source head is e83be7a8737ccaa6873d0060a06ea139abf9c519. Subsequent deliberate
runner/manifest changes must receive a reviewed lock update and unchanged-query or
explicit changed-query proof; this package is evidence, not an auto-qualification
or deployment mechanism.

## Reviewed lock refresh

The source lock was explicitly refreshed for the proven observer manifest/runner,
new canonical-array constructor, exact audit/packet and main's config plus historical
capacity-successor inventory. No observed digest was substituted for a failing guard.
The current generator produces the exact executed559f444c SQL byte-for-byte using
explicit constructors. The retired combined query is now a frozen audit fixture.
The emitter remains --offline-only: generating it does not assert a new successful
execution or grant target resource acceptance.
