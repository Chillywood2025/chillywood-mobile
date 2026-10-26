# Concurrent Brand reference index rollout

The candidate migration `20261025141347` has not been deployed. Its original
single-transaction build of all eligible indexes exceeded the deployment's
90-second statement budget and rolled back completely. This revision removes
only that bulk construction block. The pure helpers, immutable-helper DDL guard,
private registry, grants, eligibility checks and exact retention query remain
byte identical. Already deployed migrations are unchanged.

Applying the revised migration installs the protocol with an empty registry.
Unregistered, invalid, missing or stale indexes always use the existing exact
scan. This does not activate retention or establish production performance.
Construction is a separate, explicitly authorized operator action.

`scripts/brand-reference-index-installer.mjs` uses an injected PostgreSQL adapter;
it adds no application dependency, credentials, public function or service-role
permission. The operator must bind the clean reviewed source commit/tree,
authenticated database identity and adapter before invocation. The canonical
CLI accepts absolute adapter, plan and journal paths. Planning is the default:

```sh
node scripts/brand-reference-index-installer.mjs --adapter /operator/adapter.mjs --plan /evidence/plan.json --journal /evidence/journal.json
node scripts/brand-reference-index-installer.mjs --adapter /operator/adapter.mjs --mode apply --plan /evidence/plan.json --journal /evidence/journal.json
```

The adapter exports `createAdapter()` and owns TLS verification, authentication,
credential expiry and isolated session cleanup. Its `connect({purpose,
applicationName})` returns a persistent `query(sql)` / `end()` connection.
`query` returns `{rows}`. Its `cancel({pid,backendStart,applicationName})` may
cancel only that exact owned builder. `remainingLifetimeMs()` reports credential
lifetime; fewer than 130 seconds stops before the next table and returns partial
progress. There is no automatic credential renewal. The module API is
`runBrandReferenceIndexInstaller({adapter,mode,plan,journal,checkpoint,
resumeInvalid,targetOids})`. `targetOids` only restricts a new plan to an explicit
eligible subset. `checkpoint({plan,journal})` must complete an atomic durable
write before resolving. The CLI fsyncs files and their directory. A fresh plan
never overwrites existing evidence.

A plan binds literal source function bodies, signatures, computing attributes,
owners and grants; the exact expanded DDL guard body/binding; private registry
RLS, owner-only ACL and absence of policies; server version; database endpoint
and identity; extension/opclass; environment and complete target specifications.
This is stronger than accepting a freshly sampled changed normalizer hash.
The operator's authenticated endpoint binding remains necessary: SQL database
names and OIDs alone do not identify a remote provider project.

For each target, a READ COMMITTED guard transaction holds ACCESS SHARE on the
exact public table and rechecks its OID, name, owner and specification. A separate
installer-only advisory lock prevents parallel installers. It never takes the
Brand retention latch. An empty temporary LIKE table and index ask PostgreSQL
to canonicalize the expression using the real column types and collations;
neither copies application rows. A second connection builds a uniquely named
index with one standalone `CREATE INDEX CONCURRENTLY` statement. Before that
statement it verifies that the guard has no old snapshot. Heartbeats are
same-value `SET LOCAL` utility statements, which do not acquire snapshots.
Writers retain their ordinary permissions and commit/rollback behavior.

Each session reads back fixed numeric server bounds: 90-second statements,
2-second lock acquisition, 120-second transactions and 15-second idle
transactions. A target has a 105-second client deadline before registration,
and ANALYZE of only that target has a separate 10-second statement limit. The
guard cancels only its owned builder on loss/deadline. No budget is automatically
raised and no error is treated as successful coverage. ANALYZE failure leaves a
valid but unregistered artifact; a later explicit resume can reuse its exact
journal OID. The application query budget remains 30 seconds.

Registration occurs in the still-held guard transaction only after the actual
index OID, name, owner, expression, opclass, collation and validity/readiness/live
flags match, and source/environment/specification still match the plan. The
unchanged consumer eligibility function must accept the inserted record before
commit. Completed registration can be resumed without another build, including
a lost response after commit when the durable journal already recorded the
index OID. Unexpected existing registrations and unknown creation outcomes stop
for reconciliation.

An interrupted concurrent build can leave an invalid index. The installer
records its exact identity and leaves it unregistered. Default resume rejects
it. Only deliberate `--resume-invalid true`, after the same exact identity check,
allows a fresh uniquely named build. The invalid object is retained and reported;
it may consume storage and add write overhead until separately reviewed cleanup.
There is no automatic DROP, rename or adoption based only on a name prefix.
Concurrent DROP can itself wait for the identity guard; releasing the guard to
drop would introduce a name/OID race. An uncertain object must be investigated
before another attempt.

The required native CI lane runs `tests/brand-reference-index-installer-native.mjs`
against the pinned isolated PostgreSQL 17.6 fixture. It exercises real persistent
sessions, concurrent writers, blocked identity DDL, snapshot-free heartbeats,
cancelled invalid builds, explicit resume, foreign collisions and schema drift.
It also retains the existing semantics, DDL, writer, pilot, performance and
overflow stages. Synthetic success is not production latency, deployed coverage,
or installed-device evidence. Operator receipts must report completed/remaining
tables and retained invalid objects; a partial registry remains correct but may
still have the original performance cost.

PostgreSQL documents the transaction and failure behavior of
[concurrent index creation](https://www.postgresql.org/docs/17/sql-createindex.html)
and [concurrent index removal](https://www.postgresql.org/docs/17/sql-dropindex.html).
