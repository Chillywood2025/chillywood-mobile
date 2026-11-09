# Fixed default-off native source profile

`install-profile.mjs` extends the **unchanged, hash-pinned combined-readiness
profile** with native journal, quote, claim and final-install assertions. It
returns one explicit transaction and its 48-file source digest. It has no target
URL, network transport, apply switch or migration-history writer. No fixture is
part of this closure. `install-source.json` pins both the prior manifest bytes
and all four native source files. Editing or reordering the baseline fails closed.

Fresh namespaces and roles are mandatory; duplicate names abort transactionally.
The original paid-video installation context and bounded fresh-core public CREATE
intervals are retained, with a third interval for the native quote/claim wrappers.
The fresh journal owner's public CREATE grant is separately revoked before its
installer membership is disabled. Deferred commit checks reject an initially
enabled journal, native preparation, existing commerce lifecycle or paid-video
gateway, or a leaked fresh-owner public CREATE privilege. Native catalogs,
selections and assertions must be empty. All original Test Store guards remain.

`dependency-probe.sql` is a read-only metadata query listing the exact 21 external
relation/column contracts used by the source-derived authority readers, actual
column types, SELECT/MAINTAIN privileges, roles and event triggers. It does not
read account data or certify compatibility merely because relations exist.
Use the existing authorized read-only transaction/transport. Preserve its result
alongside the full target history/catalog fingerprints used by the existing exact
deployment tooling. A migration count is not an effective-schema attestation.

## Disposable managed-role proof

```
node isolated-runtime/native-store-sandbox-v1/install-managed.native.mjs --local-bin /absolute/postgresql-17.6/bin
node isolated-runtime/native-store-sandbox-v1/quote.native.mjs --local-bin /absolute/postgresql-17.6/bin --managed-install
```

The harness alone creates an isolated loopback cluster. A separate fixture admin
provides explicitly synthetic, empty shared-table projections and SELECT/MAINTAIN
capabilities. The real source installs as NOSUPERUSER CREATEROLE BYPASSRLS
NOINHERIT postgres; no existing-role elevation occurs inside the install bundle.
Tests prove failed grants, missing revoke, initial enable, late failure and timeout
roll back new roles/schemas, reject preexisting names, enforce final FORCE RLS/ACLs,
and leave controls disabled and registries empty. These modeled assumptions are
not evidence of hosted Auth/RLS/event-trigger/pool behavior.

The second command reuses all 31 quote/claim/client/recovery runtime cases against
the same pinned combined installation, performed by the modeled non-superuser
postgres. The separate fixture administrator supplies only local synthetic data;
actual public runtime functions execute under their installed non-super owners.
The source closure never contains that fixture administrator or fixture data.

## Remaining deployment boundary

This is source qualification, not a migration/deployment executor. Use the existing
exact-deploy pattern for a reviewed immutable migration identity, complete fresh
target/history/catalog/owner/default-ACL fingerprint, transactional pre/postchecks
and separate committed readback. Do not broad-push migrations or transplant the
test fixture's Auth/Premium tables. The target's current postgres authority and
event triggers must be independently checked; no additional privileges on existing
shared tables are granted by this profile.

Source installation leaves both intake and preparation off. No connection secret,
catalog/resource binding, retained upload qualification, worker/Edge deployment,
SDK dispatch, settlement or access grant is created. A native quote still uses its
existing provider-neutral base media checks; installation of the stronger shared
media helper does not silently upgrade the native quote to verified-byte readiness.

## Command Edge source

`edge-profile.mjs` uses the existing AST dependency collector to prepare the exact
local command source closure and its fingerprint. The normal command explicitly
requires JWT verification in `supabase/config.toml`; the handler also authenticates
the current account/session before invoking its private SQL command. Source
preparation performs no network request and includes no project ID or credentials.
Its external dependency inventory currently includes the shared
`npm:@supabase/supabase-js@2` import. A source fingerprint is not a resolved SDK
artifact lock: runtime and hosted qualification remain false pending actual
runtime/deployment verification. It does not enable a purchase or settlement.

## Observed event-trigger parity

`install-managed.native.mjs --local-bin /absolute/postgresql-17.6/bin
--event-trigger-parity` adds the six observed Supabase trigger bodies and the
existing committed Brand guard template to the **local fixture only**. The Brand
guard binds local helper OIDs/catalog rows, never hosted OIDs. Extensions schema
USAGE is absent for fresh owners and Brand guard EXECUTE is postgres-only, as
observed. Creating/dropping objects under a fresh SET ROLE still invokes the
event triggers successfully. Direct function lookup is denied; removing public
pg_proc SELECT makes invoker execution fail, and modifying a protected helper is
rejected and rolled back. The complete managed install succeeds with all eight
triggers active. Standard trigger ownership is modeled as supabase_admin; local
Brand event-trigger ownership uses fixture_admin because vanilla PostgreSQL
requires a superuser event owner. Its function owner, invoker mode and ACL match
the observed postgres-owned function without elevating the modeled installer.
This qualifies the exercised local paths, not the hosted engine's ownership
exception or any unobserved extension branch. No extension is installed.

## Exact deployment snapshot preparation

`node scripts/native-store-install-prepare.mjs --source FULL_COMMITTED_SHA`
reuses the existing exact-deploy read-only transport and `validateReadContext`
unchanged. It requires clean committed source and binds the fixed source closure.
It collects full history, existing catalog/default-ACL/role/membership/event-trigger
fingerprints, money holds and the dependency metadata in one read-only request.
The only successful status is `snapshot_observed_unqualified`; there is **no
apply switch, write request, migration-history append or deployment permission**.
Only bounded hashes/status are printed. A read-only transaction whose actual
current/session identity is postgres still fails the existing required
supabase_read_only_user identity guard. Local tests exercise both real SQL paths.

A later exact executor still needs a reviewed migration identity and atomic
integration of the added-object contract below. It must account explicitly for
new-role memberships and new-role USAGE entries on the existing public schema.
Cashout's unchanged-old-catalog comparison cannot be copied verbatim. A synthetic fixture snapshot cannot
populate a hosted baseline, and missing read-transport qualification must not be
worked around by changing identity checks.

## Exact added-object and existing-object delta

`install-delta.mjs` compares before/after snapshots from the **same database**.
`install-delta.json` pins the independently observed added catalog of the fixed
48-module local managed install, not any hosted baseline. The contract covers
2 schemas, 4 roles, 8 role-membership rows, 223 functions (43 public wrappers),
154 relations, 1,129 columns, 754 constraints, 286 indexes, 153 policies and 1,137
triggers. Existing catalog rows, roles, memberships, defaults and event triggers
must remain unchanged. Only the public schema ACL receives two explicit additions:
USAGE without grant option for the new core and journal owner roles. No CREATE
privilege or other old ACL change is allowed.

PostgreSQL 17 creates two grants per new role: a bootstrap-superuser ADMIN-only
membership to postgres, plus the explicit postgres-granted membership with ADMIN,
INHERIT and SET all false after finalization. Both are checked exactly; no runtime
role receives a membership. Bootstrap identity is verified from the actual local
catalog, not guessed from the name. Added ACLs use sorted semantic grantor/grantee
names and privileges. Internal referential-integrity triggers retain their owning
constraint and definition; only generated OID-derived trigger names are normalized.
All old metadata remains target-local and exact.

The CI runs independent clusters with different catalog OID allocations and
requires the same pinned added digest. Actual rolled-back mutations to old
objects/default ACLs, fresh-role authority, memberships, public CREATE, new
function definitions, new-table grants, new-role default ACLs and missing wrappers
must be rejected. The source preparation binding includes both delta files and
prints the expected added digest, but still cannot qualify a hosted baseline or
apply a migration. The install source/digest itself is unchanged by this contract.

The added digest is precisely SHA-256 of JavaScript `JSON.stringify` applied to
the lexicographically sorted array of individually `JSON.stringify`-serialized
normalized rows. It is **not** a hash of PostgreSQL `jsonb::text`. An atomic
SQL postcheck must implement and independently prove equivalent canonicalization,
or compare pinned expected normalized rows semantically as JSONB, as below. Copying the
digest into a different SQL hashing formula would not implement this contract.
This manifest alone is therefore not an executable transactional postcheck.

### Executable atomic semantic postcheck (source only)

`nativeStoreAtomicInstallSQL()` in `install-atomic.mjs` wraps the fixed 48-module closure in one transaction. It captures the actual same-database before snapshot in a private temporary table, refuses preexisting native names, forces the original deferred default-off/empty-state guards, and compares both directions using JSONB `EXCEPT ALL` (duplicates matter). Existing catalog rows remain exact except separately checked public schema ACL additions. The added rows are normalized exactly as the portable delta contract and compared semantically against `install-atomic-rows.json`, including exact roles, memberships, ACLs and no new default ACLs. Temporary helpers are dropped before commit; the temporary snapshot drops on commit.

The source-derived row artifact contains no target snapshot or provider data. It is stored as deterministic `install-atomic-rows.json.gz` using built-in Node zlib, preserving the exact canonical JSON bytes while reducing repository/API transfer size. Decoding is bounded to 8 MiB. Before emitting SQL, the assembler validates its original JS canonical digest against the existing `install-delta.json` and fixed source digest. PostgreSQL never guesses that JS digest from `jsonb::text`. Exact source binding compares binary bytes, and tests verify deterministic recompression and reject truncated data. The managed local harness verifies the source pin before optional explicit regeneration with `NATIVE_ATOMIC_PIN_GENERATE=local-fixture-only`; ordinary runs do not rewrite the pin.

For a reviewed source change, explicit `--generate-local-pins` installs only into the harness's disposable local cluster and regenerates both expected delta and semantic rows from its actual catalogs. This mode reports `atomicVerified:false` and `deploymentAllowed:false`, never a successful atomic proof. It preserves old-object/ACL/role delta checks, but does not compare the newly changed catalog with stale expected rows. Normal mandatory CI runs never use generation mode: separate ordinary and shifted-OID atomic verification must pass after regeneration. The quote implementation has an owner-private already-armed helper; the original entry point still arms exactly one transaction budget. The reservation and dormant owner-private consumption modules are included in this 48-module install closure. Both tables must be empty at the default-off installation commit. Consumption has no public wrapper, service grant, provider qualification, or SDK dispatch authority.

Actual non-superuser PostgreSQL tests execute the atomic wrapper and reject late old-object changes, public CREATE leakage, role LOGIN expansion, old default ACL changes and a duplicated expected row. Each failed attempt restores the full before snapshot and leaves all fresh schemas/roles absent. Independent OID allocation and modeled event-trigger parity remain exercised. This is not an apply executor: it has no network, target URL, transport override, migration-history write or activation. A future executor still needs qualified target identity, expected target baseline/concurrency checks, exact history append, uncertain-write recovery and independent committed readback. No hosted install or checkout qualification is asserted.

### Offline transaction envelope, not hosted deployment eligibility

`install-envelope.mjs` is a separate source-only assembler around that unchanged
48-module atomic installer. Its default migration identity and baseline are null;
normal default use rejects SQL emission. An explicit independently reviewed
identity and exact baseline must be supplied. The local tests supply only a
clearly synthetic version/name and a real disposable-database snapshot, never
an invented hosted baseline. There is no apply CLI, connector or target request.

The envelope sets JIT off, work memory to 8 MiB, parallel query workers to zero,
statement timeout to 20 seconds and transaction timeout to 25 seconds BEFORE
catalog/history work. These settings bound individual work but do not prove a
safe aggregate memory ceiling. It takes an advisory fence and NOWAIT share-row-
exclusive locks on the exact 21 prerequisite relations plus migration history,
then rechecks catalog/history/money fingerprints under those locks. This can
block application writes for the transaction lifetime. A single exact source
receipt is appended before the existing atomic postcheck; a failed history,
money, catalog or deferred default-off check rolls everything back together.

Relation locks and the cooperative advisory fence do NOT exclude concurrent
administrative role, schema, function, event-trigger or other catalog DDL.
Pre/post catalog comparison detects visible drift, not arbitrary edits after
the final observation. External operational coordination is still required.
`deploymentAllowed` and `administrativeConcurrencyExcluded` remain false.

The outcome classifier accepts one independently obtained, correct-read-identity
consistent snapshot, never fields assembled across independent transactions.
The local proof collects context, history, catalog and money state in one SQL
statement inside one read-only repeatable-read transaction. A future transport
must preserve that consistency rather than merely label mixed reads a snapshot.
It distinguishes unchanged evidence from an exact source receipt plus
catalog delta; incomplete, conflicting or changed evidence stays unknown. Every
result has `retryAllowed:false`: even an unchanged observation is not permission
to repeat an uncertain write. Exact catalog/history evidence does not prove
runtime controls are still disabled or data is still empty. A separately
qualified private-state read path remains required; the classifier reports
`exact_source_receipt_observed_runtime_unqualified`, never deployed/activated.

The current hosted capacity hold remains in force. In particular, the existing
broad `readbackSQL()` catalog/history aggregation must NOT be run just because
these offline tests pass. Future target work needs an independently reviewed,
staged resource-bounded readback plan, suitable transport identity, operational
headroom and confirmation that the hold is lifted. No such target read is part
of this source increment.

The pending raw-receipt fence is included in the 48-module closure (source only). Native core links and pending evidence must be empty at install commit; all switches remain off. The mandatory fence harness requires closure-created objects and never transplants fixture SQL. See SETTLEMENT.md for lifecycle limitations.

## Bounded private state after installation

Module 48 installs the fixed private-state reader in the same atomic transaction,
after shared permission finalization and with its own bounded owner intervals.
The existing `supabase_read_only_user` is a prerequisite, never provisioned here.
Only that actual login can observe bounded emptiness/default-off booleans under
READ ONLY REPEATABLE READ and <=5s statement/transaction limits. No table reads
are granted to it; no private row values are returned. See `PRIVATE-STATE.md`.
The pinned generator, exact generated SQL and preparation source binding agree;
this additional observation never grants deployment, activation or retry authority.
