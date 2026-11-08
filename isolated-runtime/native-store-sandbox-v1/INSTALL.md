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
