# Fixed default-off native source profile

`install-profile.mjs` extends the **unchanged, hash-pinned combined-readiness
profile** with native journal, quote, claim and final-install assertions. It
returns one explicit transaction and its 38-file source digest. It has no target
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
38-module local managed install, not any hosted baseline. The contract covers
2 schemas, 4 roles, 8 role-membership rows, 188 functions (35 public wrappers),
141 relations, 1,019 columns, 668 constraints, 248 indexes, 140 policies and 997
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
normalized rows. It is **not** a hash of PostgreSQL `jsonb::text`. A future atomic
SQL postcheck must implement and independently prove equivalent canonicalization,
or compare pinned expected normalized rows semantically as JSONB. Copying the
digest into a different SQL hashing formula would not implement this contract.
This manifest alone is therefore not an executable transactional postcheck.
