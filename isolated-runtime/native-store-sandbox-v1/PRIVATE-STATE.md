# Bounded private-state readback

Source-only follow-up integrated as module 48 of the pinned fresh installer.
Nothing here is a target query, apply transport or activation. The SQL artifact
is checked byte-for-byte against its pinned generator; sourceBinding includes
both. Existing source, semantic added-catalog and atomic-row pins must all agree.

`nativePrivateStateInstallSQL()` adds a journal-owner reader and a core-owner
public wrapper. Each uses an empty search path and fixed qualified queries.
Only the already-existing `supabase_read_only_user` receives wrapper EXECUTE;
there are no table grants, schema USAGE grants, credentials or role creation.
The journal reader is callable only by the core owner. Public, anon,
authenticated and service_role cannot execute either reader. The existing reader
must be non-superuser, non-CREATEROLE, non-CREATEDB and non-replication; BYPASSRLS
alone does not grant private table access. The fixture proves a genuine login,
not SET ROLE impersonation. Missing or mismatched identity fails closed.

The independent read must use the original reader session, READ ONLY REPEATABLE
READ, statement and transaction budgets at most five seconds. The supplied SQL
sets JIT off, 1 MiB work memory, no parallel workers and a one-second lock budget
before reading. One stable statement returns only booleans: journal disabled,
commerce lifecycle/preparation disabled, private gateway unconfigured, legacy
Test Store dispatch disabled, and NOT EXISTS (LIMIT 1) for seven journal and 47
explicit native, resource and private media tables. It never returns rows, keys,
counts, subject IDs, URLs or a cached expected answer. LIMIT 1 avoids full counts;
timeouts, not LIMIT alone, bound scans over dead tuples or lock contention.

The scope is fresh native installation and its shared resource/media surfaces,
not every legacy table or all application settings. Exact catalog/history/ACL
qualification remains a separate requirement. The result is an observation of
one snapshot, not a promise that later configuration cannot change. It cannot
prove Edge flags, secrets, binaries or provider settings. The validator never
grants deployment, activation or retry permission. Existing administrative DDL
coordination and capacity hold remain in force.

The reader module runs after the shared permission finalizer within the same
outer atomic transaction. It temporarily restores only the new-owner SET
intervals and core public CREATE, then explicitly revokes both. It refuses
preexisting enabled owner SET/INHERIT intervals. The real readonly role is an
external prerequisite and is never created by the installer. Missing identity
rolls back the full install. Do not apply the module separately to hosted state.
Local tests install the genuine 48-module profile as managed non-superuser
postgres; no missing-table fallback, stub or separate reader transplant is used.

Run locally with an owned disposable PostgreSQL 17.6 engine:
`node isolated-runtime/native-store-sandbox-v1/install-managed.native.mjs --local-bin /absolute/bin --private-state-proof`

Disposable proof covers the integrated reader and original atomic rollback tests.
Cases cover missing reader, genuine permitted login, denied runtime roles and
direct table reads, wrong transaction context and impersonation, restored owner
privileges, enabled controls, real inserted connection/media configuration, and
absence of those private values in output, and full rollback of helpers and
temporary owner privileges after late failure or an omitted revoke. Unit tests reject every changed,
missing, extra or nonboolean field. No hosted capacity claim follows.

The embedded SQL inherits the outer installer/envelope resource budget and never
re-arms transaction or statement timeouts. The independent read sets its own
readonly limits before entering either private function.

Integrated qualification: 11 actual reader cases; 42 ordinary managed atomic
cases; 50 shifted-OID/event-trigger managed cases plus 13 envelope cases; 33
normal quote cases; 17 focused unit/source-binding cases. All pass locally.
Missing or overprivileged existing reader and omitted cleanup roll back the
entire fresh install. These are disposable source fixtures, not hosted evidence.
